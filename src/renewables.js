import {
	Box3,
	BufferGeometry,
	DoubleSide,
	Euler,
	ExtrudeGeometry,
	Float32BufferAttribute,
	Matrix4,
	PlaneGeometry,
	Quaternion,
	RingGeometry,
	Shape,
	Vector2,
	Vector3,
} from 'three';
import { drawn, FT, GLASS, IN, mat, Parts, RUBBER } from './parts.js';
import { memberGeometry, roundedTop } from './plant-parts.js';
import { extruded } from './site-extras.js';

// Renewable energy construction, built in code at the sizes of the common North American classes
// (no brands): a solar farm (a tracked pile driver, W6 posts, crated PV modules, torque tubes, a
// finished single-axis tracker row, a fixed-tilt racking table and an inverter skid), battery
// storage (a 40 ft BESS container on its pad), wind (a blade, nacelle and tower section on their
// trailers, the same pieces staged at the pad, a rotor hub and a foundation before the pour) and a
// substation transformer on its hydraulic trailer. Like the other built-in pieces each stands on
// y = 0 with its front facing -Z (+X on its right).

const DEG = Math.PI / 180;
const _m = new Matrix4();
const _q = new Quaternion();
const Z = new Vector3( 0, 0, 1 );
const ONE = new Vector3( 1, 1, 1 );

// A blade 70.1 m long, as on a 3 MW class turbine.
const BLADE_LENGTH = 230 * FT;
// Tower sections are 14 ft across, the most a road will take.
const TOWER_R = 7 * FT;

export const RENEWABLE_ITEMS = [
	// Solar farm.
	{ id: 'solar-pile-driver', name: 'Solar pile driver, tracked (Vermeer PD10 class, 15 ft mast, W6 post in the hammer)', category: 'Heavy equipment',
		keywords: 'solar pile driver post driver pile driving rig tracked hammer solar farm tracker posts w6 i-beam pd10 gayk ramming',
		build: pileDriver },
	{ id: 'solar-pile-bundle-w6', name: 'Solar pile bundle, W6 steel posts (40 × 12 ft, banded on dunnage, ~1.9 t)', category: 'Materials',
		keywords: 'solar piles posts w6 w6x9 wide flange i-beam h-pile galvanized tracker posts bundle steel piles solar farm',
		build: pileBundle },
	{ id: 'pv-module-pallet-stack', name: 'PV module pallets, crated (2 high, 31 modules each, 7.5 × 3.8 ft)', category: 'Materials',
		keywords: 'solar panels pv modules pallet crate boxed panels delivery solar farm photovoltaic stack',
		build: modulePallets },
	{ id: 'pv-torque-tube-bundle', name: 'Tracker torque tube bundle (12 × 5 in square × 40 ft, on dunnage)', category: 'Materials',
		keywords: 'torque tube solar tracker tube square steel tube bundle hss galvanized solar farm',
		build: torqueTubes },
	{ id: 'pv-tracker-row-300ft', name: 'Single-axis solar tracker row, 1-portrait (300 ft, 78 modules, on W6 posts, tilted 15°)', category: 'Utilities',
		keywords: 'solar tracker single axis tracker row pv array solar panels solar farm 1p torque tube nextracker array table row',
		build: trackerRow, rowLength: 300 * FT },
	{ id: 'pv-fixed-tilt-table', name: 'Fixed-tilt solar racking table, 2-portrait (42 ft, 22 modules, 25° tilt, ground screws)', category: 'Utilities',
		keywords: 'solar racking fixed tilt ground mount pv array table solar panels community solar ground screws 2p',
		build: fixedTiltTable, rowLength: 11 * 1.154 },
	{ id: 'pv-inverter-skid', name: 'Solar inverter and MV transformer skid (20 × 8 ft, on piers)', category: 'Utilities',
		keywords: 'inverter skid power station central inverter mv transformer pcs solar farm switchgear rmu power conversion',
		build: inverterSkid },
	{ id: 'bess-container-40', name: 'Battery energy storage container (BESS, 40 ft, HVAC on end, on concrete pad)', category: 'Utilities',
		keywords: 'bess battery energy storage container lithium battery storage enclosure energy storage system ess',
		build: bessContainer },

	// Wind: the big pieces on their trailers, then staged at the pad.
	{ id: 'wind-blade-transport', name: 'Wind turbine blade on extendable trailer (230 ft blade, tractor, root trailer and steerable dolly, ~270 ft)', category: 'Vehicles',
		keywords: 'wind blade transport blade trailer oversize load superload wind turbine blade truck extendable trailer wind farm',
		build: bladeTransport },
	{ id: 'wind-nacelle-transport', name: 'Wind turbine nacelle on 13-line hydraulic trailer (~85 t, with tractor)', category: 'Vehicles',
		keywords: 'nacelle transport wind turbine nacelle heavy haul modular trailer hydraulic platform trailer superload wind farm',
		build: nacelleTransport },
	{ id: 'wind-tower-section-transport', name: 'Wind tower section on schnabel trailer (14 ft dia × 100 ft, tractor, front and rear bogies)', category: 'Vehicles',
		keywords: 'tower section transport wind tower can schnabel trailer heavy haul superload wind turbine tower wind farm',
		build: towerTransport },
	{ id: 'substation-transformer-trailer', name: 'Substation power transformer on 12-line hydraulic trailer (~150 t, pull and push tractors)', category: 'Vehicles',
		keywords: 'power transformer gsu transformer substation transformer heavy haul modular trailer superload push truck collector substation',
		build: transformerTransport },
	{ id: 'wind-blade-on-cradles', name: 'Wind turbine blade on laydown cradles (230 ft, root stand and tip cradle)', category: 'Materials',
		keywords: 'wind blade laydown blade cradle root stand tip cradle wind turbine blade staged wind farm pad',
		build: bladeOnCradles },
	{ id: 'wind-tower-base-on-stands', name: 'Wind tower base section on laydown saddles (14 ft dia × 80 ft, flanged, door)', category: 'Materials',
		keywords: 'wind tower section base can tower laydown saddles steel tower wind turbine wind farm flange',
		build: towerOnSaddles },
	{ id: 'wind-hub-on-stand', name: 'Wind turbine rotor hub with nose cone on stand (13 ft, 3 blade bearings)', category: 'Materials',
		keywords: 'wind turbine hub rotor hub spinner nose cone pitch bearing wind farm staged',
		build: hubOnStand },
	{ id: 'wind-foundation-cage', name: 'Wind turbine foundation before pour, rebar and anchor bolt cage (60 ft octagon)', category: 'Concrete & batching',
		keywords: 'wind turbine foundation spread footing anchor bolt cage rebar octagon pedestal pour mud mat wind farm',
		build: windFoundation },
];

// --- materials and small helpers -------------------------------------------------------------

const paint = color => mat( color, { roughness: 0.5, metalness: 0.2 } );
const DARK = () => mat( 0x2c2e31, { roughness: 0.7, metalness: 0.2 } );
const BLACK = () => mat( 0x18191b, { roughness: 0.85 } );
const STEEL = () => mat( 0x7d8287, { roughness: 0.5, metalness: 0.6 } );
const GALV = () => mat( 0xa9adb0, { roughness: 0.45, metalness: 0.65 } );
const BRIGHT = () => mat( 0xc9ccce, { roughness: 0.35, metalness: 0.3 } );
const TIMBER = () => mat( 0x9c7a50, { roughness: 0.95 } );
const CONCRETE = () => mat( 0xa3a19b, { roughness: 0.95 } );
const WHITE = () => mat( 0xeeeeea, { roughness: 0.45 } );
const YELLOW = () => paint( 0xe0a21b );
const LAMP = () => mat( 0xfff3c9, { roughness: 0.3, emissive: 0x6b6040 } );
const RED_LAMP = () => mat( 0xb3141b, { roughness: 0.3, emissive: 0x7a0a0e, emissiveIntensity: 0.6 } );
const AMBER = () => mat( 0xff9a1a, { roughness: 0.3, emissive: 0xc76a00, emissiveIntensity: 0.6 } );
const CELLS = () => mat( 0x1b2840, { roughness: 0.25, metalness: 0.35 } );
const FRAME = () => mat( 0xc3c7ca, { roughness: 0.35, metalness: 0.6 } );
const REBAR = () => mat( 0x6e4c38, { roughness: 0.8, metalness: 0.3 } );

// A box of cross-section [ across, up ] from one point to another.
function member( parts, material, section, from, to ) {

	parts.add( material, memberGeometry( section, from, to ) );

}

// A cross-section (points [ x, y ]) run from one point to another: a W-shape post, a C purlin.
function profile( parts, material, points, from, to ) {

	const a = new Vector3( ...from );
	const b = new Vector3( ...to );
	const length = a.distanceTo( b );
	_q.setFromUnitVectors( Z, b.clone().sub( a ).divideScalar( length ) );
	parts.add( material, extruded( points, length ), _m.compose( a.add( b ).multiplyScalar( 0.5 ), _q, ONE ) );

}

// A wide-flange (W) section, depth d up and flange width bf across, centred on its middle.
function wShape( d, bf, tw, tf ) {

	const [ h, b, w ] = [ d / 2, bf / 2, tw / 2 ];
	return [ [ - b, - h ], [ b, - h ], [ b, - h + tf ], [ w, - h + tf ], [ w, h - tf ], [ b, h - tf ], [ b, h ], [ - b, h ], [ - b, h - tf ], [ - w, h - tf ], [ - w, - h + tf ], [ - b, - h + tf ] ];

}

// W6 × 9, the usual tracker post.
const W6 = wShape( 5.9 * IN, 3.94 * IN, 0.17 * IN, 0.215 * IN );

// An outline seen from above (points [ x, z ]) extruded up from y0 to y1.
function plan( parts, material, points, y0, y1 ) {

	const shape = new Shape( points.map( ( [ x, z ] ) => new Vector2( x, - z ) ) );
	const geometry = new ExtrudeGeometry( shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 4 } );
	geometry.rotateX( - Math.PI / 2 );
	geometry.translate( 0, y0, 0 );
	parts.add( material, geometry );

}

// A tyre on its rim, axle across x, centred on [ x, y, z ].
function tyre( parts, radius, width, [ x, y, z ], segments = 18 ) {

	parts.rod( RUBBER(), [ x - width / 2, y, z ], [ x + width / 2, y, z ], radius, segments );
	parts.rod( STEEL(), [ x - width / 2 - 0.004, y, z ], [ x + width / 2 + 0.004, y, z ], radius * 0.55, 10 );

}

// A timber block (dunnage) lying across x.
function dunnage( parts, length, [ x, z ], size = [ 4 * IN, 4 * IN ], y = 0 ) {

	parts.box( TIMBER(), [ length, size[ 1 ], size[ 0 ] ], [ x, y, z ] );

}

// A label drawn on a plane `size` [ w, h ], its face turned `turn` about y from facing +Z.
function label( parts, material, size, centre, turn ) {

	parts.add( material, new PlaneGeometry( ...size ), _m.makeRotationY( turn ).setPosition( ...centre ) );

}

// The parts built and moved so the middle of the item's box is over the origin, as items are
// placed by (the long loads are laid out from the tractor's bumper back).
export function centred( parts ) {

	const group = parts.build();
	const { min, max } = new Box3().setFromObject( group );
	const [ dx, dz ] = [ - ( min.x + max.x ) / 2, - ( min.z + max.z ) / 2 ];
	for ( const mesh of group.children ) mesh.geometry.translate( dx, 0, dz );
	return group;

}

// --- trucks and heavy-haul trailers ----------------------------------------------------------

// A heavy-haul conventional tractor with its front bumper at z = front: long hood, cab, an optional
// raised sleeper, and two or three drive axles under the fifth wheel. `ballast` puts a ballast box
// on the frame instead, for a push truck. Returns where the fifth wheel's middle and the frame's
// end are. (The girder haul in bridge-highway.js uses it too.)
export function tractor( parts, front, { colour = 0xb4231b, sleeper = true, drives = 3, ballast = false } = {} ) {

	const body = paint( colour );
	const z = d => front + d;
	const r = 0.53;
	const cabEnd = sleeper ? 6.3 : 4.4;
	const driveZ = Array.from( { length: drives }, ( _, i ) => z( cabEnd + 0.95 + i * 1.37 ) );
	const fifth = ( driveZ[ 0 ] + driveZ[ drives - 1 ] ) / 2 - 0.15;
	const rear = driveZ[ drives - 1 ] + 1.05;

	// Frame rails, bumper, grille and headlamps.
	for ( const s of [ - 1, 1 ] ) parts.box( DARK(), [ 0.1, 0.28, rear - z( 0.25 ) ], [ s * 0.43, 0.72, ( rear + z( 0.25 ) ) / 2 ] );
	parts.box( BRIGHT(), [ 2.45, 0.32, 0.22 ], [ 0, 0.38, z( 0.11 ) ] );
	parts.box( BRIGHT(), [ 1.0, 0.95, 0.05 ], [ 0, 0.95, z( 0.3 ) ] );
	for ( let i = 0; i < 6; i ++ ) parts.box( DARK(), [ 0.92, 0.03, 0.02 ], [ 0, 1.05 + i * 0.14, z( 0.27 ) ] );

	// Hood and fenders over the steer axle.
	parts.prism( body, [ [ z( 0.32 ), 0.95 ], [ z( 0.32 ), 1.9 ], [ z( 0.5 ), 2.0 ], [ z( 2.55 ), 2.1 ], [ z( 2.55 ), 0.95 ] ], 1.3, 0 );
	for ( const s of [ - 1, 1 ] ) {

		parts.prism( body, [ [ z( 0.35 ), 0.7 ], [ z( 0.55 ), 1.25 ], [ z( 2.1 ), 1.25 ], [ z( 2.45 ), 0.8 ] ], 0.58, s * 0.95 );
		parts.box( LAMP(), [ 0.3, 0.14, 0.03 ], [ s * 0.95, 0.98, z( 0.48 ) ] );

	}

	// Cab with its windscreen and door glass, mirrors and steps, and the sleeper behind.
	parts.prism( body, [ [ z( 2.5 ), 1.0 ], [ z( 2.5 ), 2.05 ], [ z( 2.95 ), 2.95 ], [ z( 4.4 ), 2.95 ], [ z( 4.4 ), 1.0 ] ], 2.3, 0 );
	const screen = Math.atan2( 0.45, 0.9 );
	parts.block( GLASS(), [ 2.1, 0.92, 0.02 ], [ 0, 2.5 + 0.012 * Math.sin( screen ), z( 2.725 ) - 0.012 * Math.cos( screen ) ], [ screen, 0, 0 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( GLASS(), [ 0.01, 0.62, 0.95 ], [ s * 1.155, 2.1, z( 3.45 ) ] );
		parts.box( DARK(), [ 0.04, 0.42, 0.2 ], [ s * 1.32, 2.0, z( 2.7 ) ] );
		parts.rod( DARK(), [ s * 1.15, 2.2, z( 2.75 ) ], [ s * 1.3, 2.2, z( 2.75 ) ], 0.015, 6 );
		parts.box( DARK(), [ 0.3, 0.05, 0.7 ], [ s * 1.05, 0.55, z( 3.5 ) ] );
		// Fuel tank under the door, and a stack behind the cab.
		parts.rod( BRIGHT(), [ s * 0.92, 0.72, z( 2.7 ) ], [ s * 0.92, 0.72, z( 4.2 ) ], 0.3, 14 );
		parts.rod( BRIGHT(), [ s * 1.18, 1.1, z( cabEnd + 0.08 ) ], [ s * 1.18, 3.95, z( cabEnd + 0.08 ) ], 0.065, 10 );

	}

	if ( sleeper ) parts.prism( body, [ [ z( 4.4 ), 1.0 ], [ z( 4.4 ), 3.2 ], [ z( 4.6 ), 3.3 ], [ z( 6.3 ), 3.3 ], [ z( 6.3 ), 1.0 ] ], 2.3, 0 );
	parts.box( AMBER(), [ 1.1, 0.06, 0.12 ], [ 0, sleeper ? 3.3 : 2.95, z( sleeper ? 4.7 : 3.1 ) ] );

	// Steer and drive axles, mud flaps behind.
	for ( const s of [ - 1, 1 ] ) tyre( parts, r, 0.3, [ s * 1.02, r, z( 1.3 ) ] );
	for ( const zd of driveZ ) {

		parts.rod( DARK(), [ - 0.95, r, zd ], [ 0.95, r, zd ], 0.07, 8 );
		for ( const s of [ - 1, 1 ] ) for ( const x of [ 0.78, 1.1 ] ) tyre( parts, r, 0.28, [ s * x, r, zd ] );

	}

	for ( const s of [ - 1, 1 ] ) parts.box( BLACK(), [ 0.6, 0.55, 0.02 ], [ s * 0.95, 0.15, rear - 0.35 ] );

	// The fifth wheel, or a ballast box over the drives.
	if ( ballast ) {

		parts.box( body, [ 2.4, 1.1, 3.2 ], [ 0, 1.12, ( driveZ[ 0 ] + driveZ[ drives - 1 ] ) / 2 ] );
		parts.box( DARK(), [ 2.45, 0.06, 3.25 ], [ 0, 2.22, ( driveZ[ 0 ] + driveZ[ drives - 1 ] ) / 2 ] );

	} else {

		parts.box( DARK(), [ 1.0, 0.2, 1.0 ], [ 0, 0.86, fifth ] );

	}

	return { fifth, rear };

}

// A hydraulic modular trailer of `lines` axle lines 1.5 m apart, 3 m wide, its deck from z0 back
// with its top at deckY: each line four pendulum axles of dual tyres. Returns the deck's end.
function modularTrailer( parts, z0, lines, { deckY = 1.1, width = 3.0 } = {} ) {

	const pitch = 1.5;
	const length = lines * pitch;
	const r = 0.385;
	parts.box( YELLOW(), [ width, 0.32, length ], [ 0, deckY - 0.32, z0 + length / 2 ] );
	parts.box( DARK(), [ width - 0.04, 0.02, length - 0.04 ], [ 0, deckY, z0 + length / 2 ] );
	for ( let i = 0; i < lines; i ++ ) {

		const z = z0 + pitch * ( i + 0.5 );
		for ( const x of [ - 1.18, - 0.45, 0.45, 1.18 ] ) {

			parts.box( DARK(), [ 0.3, deckY - 0.32 - 2 * r + 0.05, 0.4 ], [ x, 2 * r - 0.05, z ] );
			for ( const dx of [ - 0.12, 0.12 ] ) tyre( parts, r, 0.22, [ x + dx, r, z ], 14 );

		}

	}

	for ( const s of [ - 1, 1 ] ) parts.box( RED_LAMP(), [ 0.15, 0.08, 0.02 ], [ s * ( width / 2 - 0.15 ), deckY - 0.2, z0 + length + 0.01 ] );
	return z0 + length;

}

// A trailer's gooseneck from over the tractor's fifth wheel back and down to the deck's front at
// deckZ, with its two lift rams.
function gooseneck( parts, fifth, deckZ, deckY ) {

	parts.prism( YELLOW(), [ [ fifth - 0.7, 1.08 ], [ fifth - 0.7, 1.8 ], [ deckZ + 0.4, 1.8 ], [ deckZ + 0.4, deckY - 0.32 ], [ deckZ - 0.5, deckY - 0.32 ], [ fifth + 1.3, 1.08 ] ], 1.3, 0 );
	for ( const s of [ - 1, 1 ] ) {

		parts.rod( DARK(), [ s * 0.75, deckY + 0.1, deckZ + 0.6 ], [ s * 0.75, 1.65, deckZ - 0.7 ], 0.1, 10 );

	}

}

// --- blades ----------------------------------------------------------------------------------

// The blade's shape along its span (fraction from the root): chord, thickness (m) and how far the
// round root has turned into an airfoil (0 round, 1 airfoil).
const BLADE = [
	[ 0, 3.0, 3.0, 0 ], [ 0.03, 3.0, 3.0, 0 ], [ 0.07, 3.2, 2.75, 0.3 ], [ 0.12, 3.75, 2.25, 0.65 ], [ 0.17, 4.1, 1.9, 0.9 ],
	[ 0.22, 4.2, 1.65, 1 ], [ 0.3, 3.9, 1.25, 1 ], [ 0.4, 3.35, 0.9, 1 ], [ 0.5, 2.85, 0.7, 1 ], [ 0.6, 2.4, 0.54, 1 ],
	[ 0.7, 1.95, 0.42, 1 ], [ 0.8, 1.5, 0.31, 1 ], [ 0.88, 1.1, 0.22, 1 ], [ 0.94, 0.75, 0.15, 1 ], [ 0.98, 0.42, 0.08, 1 ], [ 1, 0.18, 0.04, 1 ],
];

function bladeAt( s ) {

	let i = 1;
	while ( i < BLADE.length - 1 && BLADE[ i ][ 0 ] < s ) i ++;
	const [ a, b ] = [ BLADE[ i - 1 ], BLADE[ i ] ];
	const t = ( s - a[ 0 ] ) / ( b[ 0 ] - a[ 0 ] );
	return [ 1, 2, 3 ].map( k => a[ k ] + ( b[ k ] - a[ k ] ) * t );

}

// One section of the blade as [ x, y ] points round it, about the pitch axis. `roll` is the angle
// of the chord (leading edge to trailing edge) from +X.
function bladeRing( s, roll, n = 24 ) {

	const [ c, t, b ] = bladeAt( s );
	const d = [ Math.cos( roll ), Math.sin( roll ) ];
	const nn = [ - d[ 1 ], d[ 0 ] ];
	const points = [];
	for ( let i = 0; i < n; i ++ ) {

		const th = i / n * Math.PI * 2;
		const u = ( 1 - Math.cos( th ) ) / 2;
		const side = Math.sin( th ) >= 0 ? 1 : - 1;
		const half = 5 * ( 0.2969 * Math.sqrt( u ) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4 );
		// An ellipse at the root, a NACA-like section with its nose 30% of the chord ahead of the axis.
		const along = ( 1 - b ) * ( - c / 2 * Math.cos( th ) ) + b * ( u * c - 0.3 * c );
		const across = ( 1 - b ) * ( t / 2 * Math.sin( th ) ) + b * ( t * half * side );
		points.push( [ along * d[ 0 ] + across * nn[ 0 ], along * d[ 1 ] + across * nn[ 1 ] ] );

	}

	return points;

}

// How far the blade reaches either side of its axis at span s: { minX, maxX, minY, maxY }.
function bladeBounds( s, roll ) {

	const points = bladeRing( s, roll );
	const xs = points.map( p => p[ 0 ] );
	const ys = points.map( p => p[ 1 ] );
	return { minX: Math.min( ...xs ), maxX: Math.max( ...xs ), minY: Math.min( ...ys ), maxY: Math.max( ...ys ) };

}

const SPANS = [ 0, 0.015, 0.03, 0.05, 0.07, 0.095, 0.12, 0.145, 0.17, 0.2, 0.22, 0.26, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.84, 0.88, 0.91, 0.94, 0.96, 0.98, 0.99, 1 ];

// A blade with its root face at [ x, y, z0 ] on its axis, reaching `dir` (±1) along z, lofted
// through the sections above, with the steel root flange on its end.
function blade( parts, [ x, y, z0 ], { roll = 0, dir = 1 } = {} ) {

	const n = 24;
	const positions = [];
	for ( const s of SPANS ) for ( const [ px, py ] of bladeRing( s, roll, n ) ) positions.push( x + px, y + py, z0 + dir * s * BLADE_LENGTH );
	const tip = SPANS.length * n;
	positions.push( x, y, z0 + dir * ( BLADE_LENGTH + 0.05 ) );

	// Faces wound so they face out whichever way the ring runs and the blade points.
	const ring = bladeRing( 0.5, roll, n );
	let area = 0;
	for ( let i = 0; i < n; i ++ ) area += ring[ i ][ 0 ] * ring[ ( i + 1 ) % n ][ 1 ] - ring[ ( i + 1 ) % n ][ 0 ] * ring[ i ][ 1 ];
	const flip = ( area > 0 ) !== ( dir > 0 );
	const index = [];
	const tri = ( a, b, c ) => flip ? index.push( a, c, b ) : index.push( a, b, c );
	for ( let j = 0; j < SPANS.length - 1; j ++ ) {

		for ( let i = 0; i < n; i ++ ) {

			const a = j * n + i;
			const b = j * n + ( i + 1 ) % n;
			tri( a, b, a + n );
			tri( b, b + n, a + n );

		}

	}

	for ( let i = 0; i < n; i ++ ) tri( ( SPANS.length - 1 ) * n + i, ( SPANS.length - 1 ) * n + ( i + 1 ) % n, tip );
	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new Float32BufferAttribute( positions, 3 ) );
	geometry.setAttribute( 'uv', new Float32BufferAttribute( new Float32Array( positions.length / 3 * 2 ), 2 ) );
	geometry.setIndex( index );
	geometry.computeVertexNormals();
	parts.add( WHITE(), geometry );

	// The root flange and its ring of bolts' studs.
	parts.rod( DARK(), [ x, y, z0 - dir * 0.06 ], [ x, y, z0 + dir * 0.02 ], 1.52, 32 );

}

// A padded cradle round the underside of the blade at span s (axis at [ x, y ], cradle centred on
// z): a base frame on `floor` and a steel saddle shaped to the blade's lower side between its
// widest points, lined with rubber.
function bladeCradle( parts, frame, [ x, y, z ], s, roll, floor ) {

	const ring = bladeRing( s, roll, 48 );
	const n = ring.length;
	let [ iMin, iMax ] = [ 0, 0 ];
	ring.forEach( ( p, i ) => {

		if ( p[ 0 ] < ring[ iMin ][ 0 ] ) iMin = i;
		if ( p[ 0 ] > ring[ iMax ][ 0 ] ) iMax = i;

	} );

	// The way round from the widest point on the right to the one on the left that passes underneath.
	const walk = step => {

		const out = [];
		for ( let i = iMax; ; i = ( i + step + n ) % n ) {

			out.push( ring[ i ] );
			if ( i === iMin ) return out;

		}

	};
	const mean = path => path.reduce( ( sum, p ) => sum + p[ 1 ], 0 ) / path.length;
	const [ a, b ] = [ walk( 1 ), walk( - 1 ) ];
	const under = ( mean( a ) < mean( b ) ? a : b ).map( ( [ px, py ] ) => [ x + px, y + py ] );
	const pad = 0.05;
	const base = floor + 0.25;
	const [ left, right ] = [ x + ring[ iMin ][ 0 ] - 0.25, x + ring[ iMax ][ 0 ] + 0.25 ];
	const outline = [ [ left, base ], [ right, base ], [ right, under[ 0 ][ 1 ] ], ...under.map( ( [ px, py ] ) => [ px, py - pad ] ), [ left, under[ under.length - 1 ][ 1 ] ] ];
	parts.box( frame, [ right - left + 0.3, 0.25, 1.2 ], [ ( left + right ) / 2, floor, z ] );
	parts.add( frame, extruded( outline, 0.45 ), _m.makeTranslation( 0, 0, z ) );
	parts.add( BLACK(), extruded( [ ...under, ...under.slice().reverse().map( ( [ px, py ] ) => [ px, py - pad ] ) ], 0.5 ), _m.makeTranslation( 0, 0, z ) );

}

// Blade on its laydown stands at the pad: the root bolted to a steel root stand at the front, the
// blade leading edge down in a padded tip cradle two thirds of the way out.
function bladeOnCradles() {

	const parts = new Parts();
	const frame = paint( 0x2f5d8a );
	const roll = 82 * DEG;
	const y = 2.1;
	const z0 = - BLADE_LENGTH / 2;
	blade( parts, [ 0, y, z0 ], { roll, dir: 1 } );

	// Root stand: an adapter plate on the flange, an A-frame each side down to a base.
	parts.rod( frame, [ 0, y, z0 - 0.2 ], [ 0, y, z0 - 0.06 ], 1.6, 32 );
	parts.box( frame, [ 3.6, 0.25, 1.8 ], [ 0, 0, z0 - 0.3 ] );
	for ( const s of [ - 1, 1 ] ) {

		member( parts, frame, [ 0.25, 0.25 ], [ s * 1.6, 0.25, z0 - 1.0 ], [ s * 1.0, y + 0.3, z0 - 0.3 ] );
		member( parts, frame, [ 0.25, 0.25 ], [ s * 1.6, 0.25, z0 + 0.4 ], [ s * 1.0, y + 0.3, z0 - 0.3 ] );
		member( parts, frame, [ 0.25, 0.25 ], [ s * 1.65, 0.25, z0 - 0.3 ], [ s * 0.6, y - 0.9, z0 - 0.25 ] );

	}

	bladeCradle( parts, frame, [ 0, y, z0 + 0.62 * BLADE_LENGTH ], 0.62, roll, 0 );
	return centred( parts );

}

// A 230 ft blade on the road: the tractor, a 3-line root trailer with the root bolted to its
// fixture, the telescoped centre beam, and a 4-line steerable dolly under the blade 45 m back with
// its tip cradle; the tip overhangs about 25 m. The chord rides tilted so the load is about 4.4 m
// high and 4 m wide.
function bladeTransport() {

	const parts = new Parts();
	const { fifth } = tractor( parts, 0, { colour: 0x1f4e8c } );
	const deckY = 1.05;
	const front = fifth + 3.2;
	gooseneck( parts, fifth, front, deckY );
	const rootDeckEnd = modularTrailer( parts, front, 3, { deckY } );
	const roll = - 28 * DEG;
	const y = 2.75;
	const z0 = front + 0.6;
	blade( parts, [ 0, y, z0 ], { roll, dir: 1 } );

	// Root fixture: an adapter plate on the flange and a frame down to the deck.
	parts.rod( YELLOW(), [ 0, y, z0 - 0.2 ], [ 0, y, z0 - 0.06 ], 1.58, 32 );
	for ( const s of [ - 1, 1 ] ) {

		member( parts, YELLOW(), [ 0.25, 0.3 ], [ s * 1.2, deckY, z0 - 0.15 ], [ s * 0.9, y + 0.6, z0 - 0.15 ] );
		member( parts, YELLOW(), [ 0.2, 0.2 ], [ s * 1.2, deckY, z0 + 2.4 ], [ s * 0.9, y + 0.4, z0 - 0.15 ] );

	}

	// The extendable centre beam back to the dolly.
	const dollyZ = z0 + 45;
	const dollyFront = dollyZ - 3.0;
	member( parts, YELLOW(), [ 0.6, 0.45 ], [ 0, deckY - 0.2, rootDeckEnd - 0.5 ], [ 0, deckY - 0.2, dollyFront + 0.5 ] );
	member( parts, YELLOW(), [ 0.5, 0.38 ], [ 0, deckY - 0.2, rootDeckEnd + 12 ], [ 0, deckY - 0.2, dollyFront + 0.6 ] );
	modularTrailer( parts, dollyFront, 4, { deckY } );
	bladeCradle( parts, YELLOW(), [ 0, y, dollyZ ], 45 / BLADE_LENGTH, roll, deckY );

	// An OVERSIZE LOAD banner on the bumper and a flag at the tip.
	const banner = drawn( 'oversize load banner', [ 512, 96 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#f4c900';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#111111';
		ctx.font = 'bold 64px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText( 'OVERSIZE LOAD', w / 2, h / 2 + 4, w * 0.92 );

	} );
	label( parts, banner, [ 2.1, 0.4 ], [ 0, 0.78, - 0.005 ], Math.PI );
	const tip = z0 + BLADE_LENGTH;
	parts.box( mat( 0xe0321e, { roughness: 0.8, side: DoubleSide } ), [ 0.01, 0.45, 0.45 ], [ 0, y - 0.5, tip - 0.4 ] );
	return centred( parts );

}

// --- nacelle, tower and transformer loads -----------------------------------------------------

// A nacelle of the 3 MW class (11 m long, 3.9 m wide, 3.3 m high) on its bolted transport frame:
// the rounded white housing with panel joints, the main bearing and shaft flange at the back (the
// rotor end) under a shipping cover, the cooler on the front end and a roof hatch.
function nacelle( parts, z, y0 ) {

	const white = WHITE();
	const length = 11.0;
	const [ w, h ] = [ 3.9, 3.3 ];
	parts.box( DARK(), [ 2.6, 0.25, length - 0.6 ], [ 0, y0, z ] );
	for ( const dz of [ - 4.2, - 1.4, 1.4, 4.2 ] ) parts.box( DARK(), [ 3.4, 0.25, 0.3 ], [ 0, y0, z + dz ] );
	const base = y0 + 0.25;
	parts.add( white, extruded( roundedTop( w, h, 0.7 ), length ), _m.makeTranslation( 0, base, z ) );
	for ( let i = 1; i < 6; i ++ ) {

		const pz = z - length / 2 + i * length / 6;
		parts.add( mat( 0xc8cac6, { roughness: 0.5 } ), extruded( roundedTop( w + 0.02, h + 0.01, 0.7 ), 0.03 ), _m.makeTranslation( 0, base, pz ) );

	}

	// Rotor end at the back: the bearing housing and shaft flange, wrapped for the road.
	const back = z + length / 2;
	parts.rod( STEEL(), [ 0, base + 1.6, back ], [ 0, base + 1.6, back + 0.45 ], 1.1, 28 );
	parts.rod( mat( 0x3b6fa0, { roughness: 0.7 } ), [ 0, base + 1.6, back + 0.45 ], [ 0, base + 1.6, back + 0.6 ], 1.15, 28 );

	// Front: the cooler's grille on the end, a roof hatch and an aviation lamp.
	const fz = z - length / 2;
	parts.box( DARK(), [ 2.8, 2.0, 0.04 ], [ 0, base + 0.8, fz - 0.02 ] );
	for ( let i = 0; i < 12; i ++ ) parts.box( STEEL(), [ 2.7, 0.03, 0.03 ], [ 0, base + 0.88 + i * 0.155, fz - 0.05 ] );
	parts.box( mat( 0xd4d6d2, { roughness: 0.5 } ), [ 1.0, 0.08, 1.2 ], [ 0.6, base + h, z + 2.5 ] );
	parts.box( RED_LAMP(), [ 0.16, 0.16, 0.16 ], [ - 1.2, base + h - 0.1, fz + 0.8 ] );

}

function nacelleTransport() {

	const parts = new Parts();
	const { fifth } = tractor( parts, 0, { colour: 0x1d1f22 } );
	const deckY = 1.1;
	const front = fifth + 3.2;
	gooseneck( parts, fifth, front, deckY );
	const end = modularTrailer( parts, front, 13, { deckY } );
	nacelle( parts, ( front + end ) / 2 - 0.2, deckY );
	return centred( parts );

}

// A steel tower can lying along z from z0 to z1 with its axis at height y: the shell (open, so
// it shows inside), the inner bolting flanges at each end and, for a base section, its door.
function towerCan( parts, [ z0, z1 ], y, { door = false, capped = false } = {} ) {

	const shell = mat( 0xdfe2df, { roughness: 0.5, metalness: 0.1, side: DoubleSide } );
	parts.rod( shell, [ 0, y, z0 ], [ 0, y, z1 ], TOWER_R, 40, true );
	for ( const z of [ z0 + 0.01, z1 - 0.01 ] ) {

		parts.add( shell, new RingGeometry( TOWER_R - 0.32, TOWER_R - 0.005, 40 ), _m.makeTranslation( 0, y, z ) );
		parts.add( shell, new RingGeometry( TOWER_R - 0.32, TOWER_R - 0.005, 40 ), _m.makeTranslation( 0, y, z + ( z === z0 + 0.01 ? 0.08 : - 0.08 ) ) );
		parts.rod( shell, [ 0, y, z - 0.04 ], [ 0, y, z + 0.04 ], TOWER_R - 0.32, 40, true );

	}

	if ( capped ) for ( const z of [ z0, z1 ] ) parts.rod( DARK(), [ 0, y, z - 0.04 ], [ 0, y, z + 0.04 ], TOWER_R - 0.33, 32 );

	// The door, on the right near the bottom (back) end, in its thickened frame.
	if ( door ) {

		const dz = z1 - 2.6;
		parts.box( shell, [ 0.22, 1.25, 2.6 ], [ TOWER_R - 0.08, y - 0.625, dz ] );
		parts.box( mat( 0xc9ccc9, { roughness: 0.5 } ), [ 0.05, 0.9, 2.2 ], [ TOWER_R + 0.06, y - 0.45, dz ] );
		parts.box( DARK(), [ 0.04, 0.08, 0.2 ], [ TOWER_R + 0.09, y - 0.04, dz - 0.6 ] );

	}

}

// An 80 ft base section staged on two steel saddles with rubber pads, 0.5 m clear of the ground.
function towerOnSaddles() {

	const parts = new Parts();
	const length = 80 * FT;
	const y = TOWER_R + 0.5;
	towerCan( parts, [ - length / 2, length / 2 ], y, { door: true } );
	const saddle = paint( 0x2f5d8a );
	const arc = [];
	for ( let i = 0; i <= 12; i ++ ) {

		const x = 1.55 - i * 3.1 / 12;
		arc.push( [ x, y - Math.sqrt( TOWER_R ** 2 - x * x ) - 0.04 ] );

	}

	for ( const z of [ - 8, 8 ] ) {

		parts.add( saddle, extruded( [ [ - 1.75, 0 ], [ 1.75, 0 ], [ 1.75, arc[ 0 ][ 1 ] ], ...arc, [ - 1.75, arc[ 0 ][ 1 ] ] ], 0.6 ), _m.makeTranslation( 0, 0, z ) );
		parts.box( saddle, [ 3.9, 0.12, 1.2 ], [ 0, 0, z ] );
		parts.add( BLACK(), extruded( arc.map( ( [ x, py ] ) => [ x, py + 0.04 ] ).concat( arc.slice().reverse() ), 0.62 ), _m.makeTranslation( 0, 0, z ) );

	}

	return parts.build();

}

// A schnabel arm: the bogie's turntable and column, an upper and a lower arm reaching to the
// adapter bolted over the tower's flange at flangeZ (the tower `dir` along z from the bogie).
function schnabelArm( parts, bogieZ, deckY, flangeZ, y, dir ) {

	const frame = YELLOW();
	parts.cylinder( DARK(), 1.0, 0.18, [ 0, deckY, bogieZ ], 20 );
	const top = y + TOWER_R - 0.4;
	member( parts, frame, [ 1.0, 0.8 ], [ 0, deckY + 0.18, bogieZ ], [ 0, top, bogieZ ] );
	member( parts, frame, [ 0.9, 0.7 ], [ 0, top - 0.3, bogieZ ], [ 0, top - 0.3, flangeZ - dir * 0.2 ] );
	member( parts, frame, [ 0.9, 0.7 ], [ 0, deckY + 0.6, bogieZ ], [ 0, y - TOWER_R + 0.6, flangeZ - dir * 0.2 ] );
	parts.rod( DARK(), [ 0, y, flangeZ - dir * 0.2 ], [ 0, y, flangeZ ], TOWER_R + 0.03, 40 );

}

// A 100 ft mid section carried as part of a schnabel: tractor, gooseneck and a 4-line front bogie,
// the tower can between the arms 0.4 m off the road, and a 4-line rear bogie.
function towerTransport() {

	const parts = new Parts();
	const { fifth } = tractor( parts, 0, { colour: 0xe9e9e4 } );
	const deckY = 1.1;
	const front = fifth + 3.2;
	gooseneck( parts, fifth, front, deckY );
	const frontEnd = modularTrailer( parts, front, 4, { deckY } );
	const y = TOWER_R + 0.4;
	const z0 = frontEnd + 1.6;
	const z1 = z0 + 100 * FT;
	towerCan( parts, [ z0, z1 ], y );
	schnabelArm( parts, front + 3.0, deckY, z0, y, 1 );
	const rearFront = z1 + 1.6;
	modularTrailer( parts, rearFront, 4, { deckY } );
	schnabelArm( parts, rearFront + 3.0, deckY, z1, y, - 1 );
	return centred( parts );

}

// A substation power transformer of about 150 t shipped without its oil, radiators or bushings:
// the main tank with its stiffeners, the blanked bushing turrets and manholes on top, lifting
// lugs, jacking pads and the nitrogen bottle and impact recorder on its end.
function transformerTank( parts, z, y0 ) {

	const grey = paint( 0x9ea5a8 );
	const [ w, h, l ] = [ 3.1, 3.3, 8.0 ];
	parts.box( DARK(), [ w + 0.2, 0.2, l + 0.2 ], [ 0, y0, z ] );
	const base = y0 + 0.2;
	parts.box( grey, [ w, h, l ], [ 0, base, z ] );
	parts.box( grey, [ w + 0.12, 0.12, l + 0.12 ], [ 0, base + h - 0.12, z ] );
	for ( let i = 0; i < 9; i ++ ) {

		const dz = - l / 2 + 0.5 + i * ( l - 1 ) / 8;
		for ( const s of [ - 1, 1 ] ) parts.box( grey, [ 0.1, h - 0.3, 0.14 ], [ s * ( w / 2 + 0.05 ), base + 0.1, z + dz ] );

	}

	for ( const s of [ - 1, 1 ] ) {

		for ( const dz of [ - l / 2 + 0.4, l / 2 - 0.4 ] ) {

			parts.box( DARK(), [ 0.3, 0.25, 0.4 ], [ s * ( w / 2 + 0.15 ), base, z + dz ] );
			parts.box( grey, [ 0.15, 0.35, 0.3 ], [ s * ( w / 2 + 0.07 ), base + h - 0.5, z + dz ] );

		}

	}

	const top = base + h;
	for ( let i = 0; i < 3; i ++ ) {

		parts.cylinder( grey, 0.32, 0.35, [ - 0.9 + i * 0.9, top, z - 2.6 ], 18 );
		parts.cylinder( DARK(), 0.36, 0.05, [ - 0.9 + i * 0.9, top + 0.35, z - 2.6 ], 18 );
		parts.cylinder( grey, 0.2, 0.25, [ - 0.9 + i * 0.9, top, z + 2.8 ], 14 );
		parts.cylinder( DARK(), 0.23, 0.04, [ - 0.9 + i * 0.9, top + 0.25, z + 2.8 ], 14 );

	}

	parts.cylinder( grey, 0.35, 0.06, [ 0.8, top, z ], 18 );
	parts.cylinder( grey, 0.35, 0.06, [ - 0.8, top, z + 1.0 ], 18 );
	parts.rod( mat( 0x2f6b3c, { roughness: 0.5, metalness: 0.3 } ), [ 1.0, base + 0.4, z - l / 2 - 0.18 ], [ 1.0, base + 1.9, z - l / 2 - 0.18 ], 0.12, 12 );
	parts.box( mat( 0xd6a21c, { roughness: 0.5 } ), [ 0.35, 0.25, 0.15 ], [ - 0.6, base + 1.6, z - l / 2 - 0.08 ] );

}

// Pulled by one tractor on the gooseneck and pushed by a second with a ballast box, its push
// beam against the trailer's back.
function transformerTransport() {

	const parts = new Parts();
	const { fifth } = tractor( parts, 0, { colour: 0x2d4a2e } );
	const deckY = 1.1;
	const front = fifth + 3.2;
	gooseneck( parts, fifth, front, deckY );
	const end = modularTrailer( parts, front, 12, { deckY } );
	transformerTank( parts, ( front + end ) / 2, deckY );
	const pusher = end + 0.8;
	tractor( parts, pusher, { colour: 0x2d4a2e, sleeper: false, ballast: true } );
	member( parts, DARK(), [ 0.5, 0.35 ], [ 0, 0.55, end - 0.3 ], [ 0, 0.55, pusher + 0.05 ] );
	return centred( parts );

}

// --- rotor hub -------------------------------------------------------------------------------

// A cast hub about 13 ft across its three pitch bearings, standing on its main shaft flange (rotor
// axis up) on a steel stand, with the white nose cone on top. One bearing faces the front.
function hubOnStand() {

	const parts = new Parts();
	const cast = paint( 0xc9ccc8 );
	const stand = paint( 0x2f5d8a );
	const legs = 0.9;

	// The stand: four legs, rails round the top and a deck plate.
	for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) parts.box( stand, [ 0.2, legs, 0.2 ], [ sx * 1.2, 0, sz * 1.2 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( stand, [ 2.6, 0.2, 0.2 ], [ 0, legs - 0.2, s * 1.2 ] );
		parts.box( stand, [ 0.2, 0.2, 2.6 ], [ s * 1.2, legs - 0.2, 0 ] );
		parts.box( stand, [ 2.6, 0.12, 0.12 ], [ 0, 0.1, s * 1.2 ] );

	}

	parts.box( DARK(), [ 2.6, 0.06, 2.6 ], [ 0, legs, 0 ] );

	// Shaft flange, the hub body and the three bearings with their openings.
	const deck = legs + 0.06;
	parts.cylinder( cast, 1.05, 0.35, [ 0, deck, 0 ], 32 );
	const c = deck + 0.35 + 1.2;
	parts.sphere( cast, 1.55, [ 0, c, 0 ], [ 24, 16 ] );
	for ( let i = 0; i < 3; i ++ ) {

		const a = - Math.PI / 2 + i * 2 * Math.PI / 3;
		const d = [ Math.cos( a ), 0, Math.sin( a ) ];
		const at = k => [ d[ 0 ] * k, c, d[ 2 ] * k ];
		parts.rod( cast, at( 1.0 ), at( 1.62 ), 1.15, 28 );
		parts.rod( STEEL(), at( 1.62 ), at( 1.72 ), 1.2, 28 );
		parts.rod( DARK(), at( 1.72 ), at( 1.73 ), 0.95, 24 );
		parts.rod( BLACK(), at( 1.73 ), at( 1.74 ), 0.72, 24 );

	}

	// Nose cone (spinner) over the top, its base kept just inside the casting (the 1.55 m sphere is
	// about 1.45 m across at c + 0.55) and on the sphere's 24 segments so the seam stays even.
	parts.cylinder( WHITE(), 1.4, 1.15, [ 0, c + 0.55, 0 ], 24, 0.42 );
	parts.sphere( WHITE(), 0.42, [ 0, c + 1.7, 0 ], [ 16, 8 ], [ 1, 0.8, 1 ] );
	return parts.build();

}

// --- wind turbine foundation -----------------------------------------------------------------

// A 60 ft (across the flats) octagonal spread footing ready to pour, standing on the bottom of its
// excavation: the lean concrete mud mat, the edge forms, the bottom rebar mat both ways, the top
// mat's radial bars and hoops rising to the pedestal, the pedestal's vertical bars, and the anchor
// bolt cage (two rings of 80 bolts between the embedment ring and the template ring).
function windFoundation() {

	const parts = new Parts();
	const a = 30 * FT;
	const tan = Math.tan( 22.5 * DEG );
	const octagon = flat => Array.from( { length: 8 }, ( _, i ) => {

		const ang = ( 22.5 + i * 45 ) * DEG;
		const r = flat / Math.cos( 22.5 * DEG );
		return [ r * Math.cos( ang ), r * Math.sin( ang ) ];

	} );
	plan( parts, CONCRETE(), octagon( a + 0.25 ), 0, 0.1 );

	// Edge forms on each flat with kickers behind.
	const ply = mat( 0xb68d55, { roughness: 0.9 } );
	const edge = 1.0;
	for ( let i = 0; i < 8; i ++ ) {

		const ang = i * 45 * DEG;
		const [ cx, cz ] = [ Math.cos( ang ), Math.sin( ang ) ];
		parts.block( ply, [ 2 * a * tan, edge, 0.04 ], [ cx * ( a + 0.02 ), 0.1 + edge / 2, cz * ( a + 0.02 ) ], [ 0, Math.PI / 2 - ang, 0 ] );
		for ( const t of [ - 0.6, 0, 0.6 ] ) {

			const [ px, pz ] = [ cx * ( a + 0.06 ) - cz * t * a * tan, cz * ( a + 0.06 ) + cx * t * a * tan ];
			member( parts, TIMBER(), [ 0.05, 0.1 ], [ px + cx * 0.9, 0.1, pz + cz * 0.9 ], [ px, 0.9, pz ] );

		}

	}

	// Bottom mat both ways, a #11 bar every 12 in, kept inside the forms.
	const rebar = REBAR();
	const inside = a - 0.08;
	const halfWidth = along => Math.min( inside, inside * Math.SQRT2 - Math.abs( along ) );
	for ( let p = - inside + 0.15; p < inside; p += 0.3048 ) {

		const half = halfWidth( p );
		parts.rod( rebar, [ - half, 0.2, p ], [ half, 0.2, p ], 0.018, 5 );
		parts.rod( rebar, [ p, 0.24, - half ], [ p, 0.24, half ], 0.018, 5 );

	}

	// Top mat: radial bars down the sloped top from the pedestal to the edge, and hoops.
	const ped = 3.4;
	const [ yEdge, yPed ] = [ 0.95, 2.5 ];
	const edgeAt = ang => {

		const off = ( ( ang % ( Math.PI / 4 ) ) + Math.PI / 4 ) % ( Math.PI / 4 );
		return inside / Math.cos( Math.min( off, Math.PI / 4 - off ) );

	};
	for ( let i = 0; i < 96; i ++ ) {

		const ang = i / 96 * Math.PI * 2;
		const rim = edgeAt( ang ) - 0.05;
		parts.rod( rebar, [ Math.cos( ang ) * ped, yPed, Math.sin( ang ) * ped ], [ Math.cos( ang ) * rim, yEdge, Math.sin( ang ) * rim ], 0.016, 5 );

	}

	for ( const r of [ 4.5, 6.0, 7.5 ] ) {

		const y = yPed + ( yEdge - yPed ) * ( r - ped ) / ( a - ped );
		const ring = Array.from( { length: 41 }, ( _, i ) => [ Math.cos( i / 40 * Math.PI * 2 ) * r, y + 0.03, Math.sin( i / 40 * Math.PI * 2 ) * r ] );
		parts.path( rebar, ring, 0.016, 5, false );

	}

	// Pedestal bars and hoops.
	const pedTop = 3.25;
	for ( let i = 0; i < 64; i ++ ) {

		const ang = i / 64 * Math.PI * 2;
		parts.rod( rebar, [ Math.cos( ang ) * 3.15, 0.25, Math.sin( ang ) * 3.15 ], [ Math.cos( ang ) * 3.15, pedTop - 0.08, Math.sin( ang ) * 3.15 ], 0.016, 5 );

	}

	for ( const y of [ 1.2, 1.8, 2.4, 2.9 ] ) {

		parts.path( rebar, Array.from( { length: 41 }, ( _, i ) => [ Math.cos( i / 40 * Math.PI * 2 ) * 3.2, y, Math.sin( i / 40 * Math.PI * 2 ) * 3.2 ] ), 0.014, 5, false );

	}

	// Anchor bolt cage: embedment ring at the bottom, template ring at the top, 2 × 80 bolts.
	const ringMat = mat( 0x4a4d50, { roughness: 0.6, metalness: 0.5, side: DoubleSide } );
	const flat = new Matrix4().makeRotationX( - Math.PI / 2 );
	for ( const y of [ 0.3, pedTop + 0.05 ] ) {

		parts.add( ringMat, new RingGeometry( 1.85, 2.65, 48 ), flat.clone().setPosition( 0, y, 0 ) );

	}

	const bolt = mat( 0x2d2f31, { roughness: 0.5, metalness: 0.6 } );
	for ( const r of [ 1.98, 2.5 ] ) {

		for ( let i = 0; i < 80; i ++ ) {

			const ang = ( i + ( r > 2 ? 0.5 : 0 ) ) / 80 * Math.PI * 2;
			parts.rod( bolt, [ Math.cos( ang ) * r, 0.2, Math.sin( ang ) * r ], [ Math.cos( ang ) * r, pedTop + 0.35, Math.sin( ang ) * r ], 0.032, 5 );

		}

	}

	return parts.build();

}

// --- solar -----------------------------------------------------------------------------------

// A PV module, 2278 × 1134 mm, as its glass and cells over a silver frame: `size` [ x, z ] in its
// own plane, centred on `centre`, tilted by `angles`.
function module( parts, [ sx, sz ], centre, angles ) {

	parts.block( FRAME(), [ sx, 0.035, sz ], centre, angles );
	const n = new Vector3( 0, 0.006, 0 ).applyEuler( new Euler( ...angles ) );
	parts.block( CELLS(), [ sx - 0.04, 0.03, sz - 0.04 ], [ centre[ 0 ] + n.x, centre[ 1 ] + n.y, centre[ 2 ] + n.z ], angles );

}

// The tracked post driver: rubber tracks, the engine body at the back with the operator's seat
// and console under a canopy on the left, and at the front the 15 ft mast on its tilt rams with the
// hydraulic hammer on its carriage, a W6 post in the drive cap standing on the ground ready to drive.
function pileDriver() {

	const parts = new Parts();
	const body = paint( 0xf2b200 );
	const trackL = 3.0;
	const trackZ = 0.55;
	for ( const s of [ - 1, 1 ] ) {

		const x = s * 0.84;
		const [ high, width ] = [ 0.55, 0.42 ];
		parts.box( RUBBER(), [ width, high, trackL - high ], [ x, 0, trackZ ] );
		for ( const e of [ - 1, 1 ] ) {

			const ez = trackZ + e * ( trackL / 2 - high / 2 );
			parts.rod( RUBBER(), [ x - width / 2, high / 2, ez ], [ x + width / 2, high / 2, ez ], high / 2, 16 );
			parts.rod( DARK(), [ x - width / 2 - 0.01, high / 2, ez ], [ x + width / 2 + 0.01, high / 2, ez ], high * 0.3, 12 );

		}

		parts.box( DARK(), [ width + 0.02, high * 0.42, trackL - high ], [ x, high * 0.3, trackZ ] );

	}

	// Frame and body, the engine hood with its louvres and stack.
	parts.box( DARK(), [ 1.3, 0.25, 2.8 ], [ 0, 0.5, 0.6 ] );
	parts.box( body, [ 1.95, 0.75, 2.9 ], [ 0, 0.72, 0.65 ] );
	parts.box( body, [ 1.85, 0.75, 1.3 ], [ 0, 1.47, 1.4 ] );
	for ( const s of [ - 1, 1 ] ) for ( let i = 0; i < 5; i ++ ) parts.box( DARK(), [ 0.012, 0.035, 0.9 ], [ s * 0.93, 1.6 + i * 0.1, 1.45 ] );
	parts.rod( DARK(), [ 0.55, 2.2, 1.7 ], [ 0.55, 2.65, 1.7 ], 0.05, 8 );
	parts.box( mat( 0x3a3d40, { roughness: 0.6 } ), [ 0.9, 0.5, 0.5 ], [ 0.45, 1.47, 0.4 ] );

	// Operator's seat, console and canopy on the left.
	parts.box( DARK(), [ 0.5, 0.45, 0.5 ], [ - 0.5, 1.47, 0.35 ] );
	parts.box( DARK(), [ 0.5, 0.65, 0.1 ], [ - 0.5, 1.92, 0.62 ] );
	parts.box( DARK(), [ 0.55, 0.85, 0.3 ], [ - 0.5, 1.47, - 0.3 ] );
	for ( const x of [ - 0.92, - 0.08 ] ) for ( const z of [ - 0.55, 0.75 ] ) parts.box( DARK(), [ 0.07, 2.0, 0.07 ], [ x, 1.47, z ] );
	parts.box( DARK(), [ 1.0, 0.07, 1.45 ], [ - 0.5, 3.47, 0.1 ] );

	// Mast on its slide arm and tilt rams, the hammer on its carriage and the post under it.
	const mastZ = - 1.95;
	const postZ = mastZ - 0.42;
	member( parts, body, [ 0.4, 0.35 ], [ 0, 1.0, - 0.7 ], [ 0, 1.0, mastZ + 0.1 ] );
	parts.box( body, [ 0.36, 4.6, 0.32 ], [ 0, 0.55, mastZ ] );
	parts.box( DARK(), [ 0.42, 0.12, 0.38 ], [ 0, 5.15, mastZ ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.rod( DARK(), [ s * 0.35, 1.3, - 0.8 ], [ s * 0.22, 2.6, mastZ + 0.18 ], 0.06, 10 );
		parts.rod( BRIGHT(), [ s * 0.27, 2.1, - 1.4 ], [ s * 0.22, 2.6, mastZ + 0.18 ], 0.035, 8 );

	}

	parts.box( DARK(), [ 0.5, 1.3, 0.12 ], [ 0, 3.7, mastZ - 0.22 ] );
	parts.box( mat( 0x3a3d40, { roughness: 0.5, metalness: 0.4 } ), [ 0.44, 1.2, 0.44 ], [ 0, 3.82, postZ ] );
	parts.box( DARK(), [ 0.3, 0.16, 0.3 ], [ 0, 3.66, postZ ] );
	profile( parts, GALV(), W6, [ 0, 0, postZ ], [ 0, 3.66, postZ ] );
	parts.path( BLACK(), [ [ 0.15, 1.6, - 0.75 ], [ 0.25, 2.6, mastZ + 0.3 ], [ 0.25, 4.6, mastZ + 0.1 ], [ 0.2, 4.6, postZ + 0.22 ] ], 0.025, 6 );
	parts.path( BLACK(), [ [ - 0.15, 1.6, - 0.75 ], [ - 0.25, 2.6, mastZ + 0.3 ], [ - 0.25, 4.5, mastZ + 0.1 ], [ - 0.2, 4.5, postZ + 0.22 ] ], 0.025, 6 );

	// A GPS antenna on the mast head and a beacon on the canopy.
	parts.rod( DARK(), [ 0, 5.27, mastZ ], [ 0, 5.5, mastZ ], 0.015, 6 );
	parts.cylinder( WHITE(), 0.09, 0.06, [ 0, 5.5, mastZ ], 14 );
	parts.cylinder( AMBER(), 0.07, 0.12, [ - 0.8, 3.54, 0.6 ], 10 );
	return parts.build();

}

// 40 W6 × 9 posts 12 ft long, 8 across and 5 high, galvanized, with three steel bands, on three
// 4 × 4 timbers.
function pileBundle() {

	const parts = new Parts();
	const length = 12 * FT;
	const [ pitchX, pitchY ] = [ 4.0 * IN, 5.95 * IN ];
	const base = 4 * IN;
	for ( let row = 0; row < 5; row ++ ) {

		for ( let i = 0; i < 8; i ++ ) {

			const x = ( i - 3.5 ) * pitchX;
			const y = base + ( row + 0.5 ) * pitchY;
			parts.add( GALV(), extruded( W6, length ), _m.makeTranslation( x, y, 0 ) );

		}

	}

	const band = mat( 0x6c7074, { roughness: 0.5, metalness: 0.6 } );
	const [ w, h ] = [ 8 * pitchX, 5 * pitchY ];
	for ( const z of [ - 1.4, 0, 1.4 ] ) {

		parts.box( band, [ w + 0.01, 0.003, 0.03 ], [ 0, base + h, z ] );
		for ( const s of [ - 1, 1 ] ) parts.box( band, [ 0.003, h, 0.03 ], [ s * ( w / 2 + 0.002 ), base, z ] );

	}

	for ( const z of [ - 1.4, 0, 1.4 ] ) dunnage( parts, 1.1, [ 0, z ] );
	return parts.build();

}

// Two crates of 31 modules each stacked: modules on edge in a cardboard box with a lid, on a
// wooden pallet, strapped, with corner boards and labels.
function modulePallets() {

	const parts = new Parts();
	const card = mat( 0xb48d5f, { roughness: 0.9 } );
	const lid = mat( 0xa88253, { roughness: 0.9 } );
	const strap = mat( 0xeeeeea, { roughness: 0.6 } );
	const [ w, l ] = [ 1.15, 2.33 ];
	const pallet = 0.13;
	const box = 1.2;
	const tag = drawn( 'pv module crate label', [ 256, 192 ], ( ctx, cw, ch ) => {

		ctx.fillStyle = '#f4f2ea';
		ctx.fillRect( 0, 0, cw, ch );
		ctx.fillStyle = '#1b2840';
		ctx.fillRect( 14, 14, 92, 120 );
		ctx.strokeStyle = '#8aa0c0';
		ctx.lineWidth = 2;
		for ( let i = 1; i < 4; i ++ ) ctx.strokeRect( 14, 14 + i * 30, 92, 0 );
		ctx.strokeRect( 60, 14, 0, 120 );
		ctx.fillStyle = '#222222';
		ctx.font = 'bold 30px sans-serif';
		ctx.fillText( 'PV', 124, 50 );
		ctx.font = 'bold 22px sans-serif';
		ctx.fillText( '31 PCS', 124, 88 );
		ctx.fillText( '550 W', 124, 122 );
		ctx.font = 'bold 18px sans-serif';
		ctx.fillText( '↑ THIS SIDE UP  FRAGILE', 14, 170 );

	} );

	for ( let k = 0; k < 2; k ++ ) {

		const y0 = k * ( pallet + box + 0.02 );
		// Pallet: deck boards on three blocks along each side, the fork openings dark.
		parts.box( TIMBER(), [ w, 0.03, l ], [ 0, y0, 0 ] );
		for ( const x of [ - w / 2 + 0.07, 0, w / 2 - 0.07 ] ) parts.box( TIMBER(), [ 0.14, pallet - 0.05, l ], [ x, y0 + 0.03, 0 ] );
		parts.box( TIMBER(), [ w, 0.025, l ], [ 0, y0 + pallet - 0.025, 0 ] );

		// Box, lid, corner boards, three straps round and the labels on an end and a side.
		const b0 = y0 + pallet;
		parts.box( card, [ w - 0.02, box - 0.08, l - 0.02 ], [ 0, b0, 0 ] );
		parts.box( lid, [ w, 0.1, l ], [ 0, b0 + box - 0.1, 0 ] );
		for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) parts.box( lid, [ 0.07, box - 0.1, 0.07 ], [ sx * ( w / 2 - 0.03 ), b0, sz * ( l / 2 - 0.03 ) ] );
		for ( const z of [ - 0.75, 0, 0.75 ] ) {

			parts.box( strap, [ w + 0.012, 0.004, 0.025 ], [ 0, b0 + box, z ] );
			for ( const s of [ - 1, 1 ] ) parts.box( strap, [ 0.004, box + pallet, 0.025 ], [ s * ( w / 2 + 0.004 ), y0, z ] );

		}

		label( parts, tag, [ 0.4, 0.3 ], [ 0, b0 + 0.6, - l / 2 - 0.012 ], Math.PI );
		label( parts, tag, [ 0.4, 0.3 ], [ w / 2 + 0.003, b0 + 0.6, 0.4 ], Math.PI / 2 );
		label( parts, tag, [ 0.4, 0.3 ], [ - w / 2 - 0.003, b0 + 0.6, - 0.4 ], - Math.PI / 2 );

	}

	return parts.build();

}

// 12 square torque tubes 5 in across and 40 ft long, 4 across and 3 high on 2 × 4 spacers, banded,
// on four 4 × 4 timbers. Their open ends show dark.
function torqueTubes() {

	const parts = new Parts();
	const side = 5 * IN;
	const length = 40 * FT;
	const pitch = side + 0.01;
	const spacer = 1.5 * IN;
	const stations = [ - 5, - 1.7, 1.7, 5 ];
	const base = 4 * IN;
	const band = mat( 0x6c7074, { roughness: 0.5, metalness: 0.6 } );
	for ( let row = 0; row < 3; row ++ ) {

		const y = base + row * ( side + spacer );
		for ( let i = 0; i < 4; i ++ ) {

			const x = ( i - 1.5 ) * pitch;
			parts.box( GALV(), [ side, side, length ], [ x, y, 0 ] );
			for ( const s of [ - 1, 1 ] ) parts.box( BLACK(), [ side - 0.012, side - 0.012, 0.004 ], [ x, y + 0.006, s * ( length / 2 + 0.001 ) ] );

		}

		if ( row < 2 ) for ( const z of stations ) dunnage( parts, 4 * pitch + 0.1, [ 0, z ], [ 3.5 * IN, spacer ], y + side );

	}

	const top = base + 3 * side + 2 * spacer;
	for ( const z of stations ) {

		dunnage( parts, 0.8, [ 0, z ] );
		parts.box( band, [ 4 * pitch + 0.01, 0.003, 0.03 ], [ 0, top, z + 0.1 ] );
		for ( const s of [ - 1, 1 ] ) parts.box( band, [ 0.003, top - base, 0.03 ], [ s * ( 2 * pitch + 0.004 ), base, z + 0.1 ] );

	}

	return parts.build();

}

// A finished 1-portrait single-axis tracker row 300 ft long running along z: 78 modules (three
// strings of 26) on clamp rails across a 5 in square torque tube 1.55 m up, tilted 15° to the
// right, the tube in bearings on W6 posts every 7.5 m and turned by the slew drive and motor on the
// heavier post in the middle.
function trackerRow() {

	const parts = new Parts();
	const hub = 1.55;
	const tilt = 15 * DEG;
	const length = 300 * FT;
	const tube = 5 * IN;
	const [ mx, mz ] = [ 2.278, 1.134 ];
	const pitch = mz + 0.02;
	parts.box( GALV(), [ tube, tube, length - 0.6 ], [ 0, hub - tube / 2, 0 ] );

	// Posts with their bearing housings; the drive post in the middle is a W8.
	const posts = 12;
	const span = ( length - 1.2 ) / posts;
	for ( let i = 0; i <= posts; i ++ ) {

		const z = - ( length - 1.2 ) / 2 + i * span;
		const drive = i === posts / 2;
		profile( parts, GALV(), drive ? wShape( 8 * IN, 5.25 * IN, 0.23 * IN, 0.33 * IN ) : W6, [ 0, 0, z ], [ 0, hub - tube / 2 - 0.12, z ] );
		if ( ! drive ) parts.box( DARK(), [ 0.22, 0.26, 0.12 ], [ 0, hub - tube / 2 - 0.13, z ] );

	}

	// The slew drive and its motor.
	parts.rod( DARK(), [ 0, hub - tube / 2, - 0.18 ], [ 0, hub - tube / 2, 0.18 ], 0.24, 18 );
	parts.box( DARK(), [ 0.3, 0.2, 0.3 ], [ 0, hub - tube / 2 - 0.42, 0 ] );
	parts.rod( STEEL(), [ 0.18, hub - tube / 2 - 0.1, 0.12 ], [ 0.42, hub - tube / 2 - 0.1, 0.12 ], 0.07, 10 );

	// Modules on rails across the tube, a gap for the drive in the middle.
	const rail = mat( 0x9da2a6, { roughness: 0.45, metalness: 0.6 } );
	const lift = tube / 2 + 0.03;
	const angles = [ 0, 0, tilt ];
	for ( let i = 0; i < 78; i ++ ) {

		const k = i < 39 ? i - 39 : i - 38;
		const z = ( k - Math.sign( k ) * 0.5 ) * pitch + Math.sign( k ) * 0.25;
		const centre = [ - Math.sin( tilt ) * lift, hub - tube / 2 + Math.cos( tilt ) * lift, z ];
		parts.block( rail, [ mx - 0.3, 0.04, 0.05 ], [ - Math.sin( tilt ) * ( tube / 2 + 0.01 ), hub - tube / 2 + Math.cos( tilt ) * ( tube / 2 + 0.01 ), z ], angles );
		module( parts, [ mx, mz ], [ centre[ 0 ] - Math.sin( tilt ) * 0.035, centre[ 1 ] + Math.cos( tilt ) * 0.035, z ], angles );

	}

	return parts.build();

}

// A 2-portrait fixed-tilt table: 11 modules across by 2 up the slope at 25°, the low edge 0.8 m up
// at the front, on four C purlins over five rafters, each on a front and back post with a brace,
// standing on ground screws.
function fixedTiltTable() {

	const parts = new Parts();
	const tilt = 25 * DEG;
	const [ mx, mz ] = [ 1.134, 2.278 ];
	const across = 11;
	const length = across * ( mx + 0.02 );
	const slope = 2 * mz + 0.02;
	const low = 0.8;
	const z0 = - slope * Math.cos( tilt ) / 2;
	const [ c, s ] = [ Math.cos( tilt ), Math.sin( tilt ) ];
	// A point up the slope from the low edge, `down` below the modules' underside.
	const at = ( t, down = 0 ) => [ z0 + t * c + down * s, low + t * s - down * c ];
	const angles = [ - tilt, 0, 0 ];

	// Modules.
	for ( let j = 0; j < 2; j ++ ) {

		for ( let i = 0; i < across; i ++ ) {

			const x = ( i - ( across - 1 ) / 2 ) * ( mx + 0.02 );
			const [ z, y ] = at( mz / 2 + j * ( mz + 0.02 ), - 0.0175 );
			module( parts, [ mx, mz ], [ x, y, z ], angles );

		}

	}

	// Purlins, rafters, posts, braces and ground screws.
	const purlin = [ [ - 0.03, - 0.05 ], [ 0.03, - 0.05 ], [ 0.03, - 0.044 ], [ - 0.024, - 0.044 ], [ - 0.024, 0.044 ], [ 0.03, 0.044 ], [ 0.03, 0.05 ], [ - 0.03, 0.05 ] ];
	for ( const t of [ 0.5, 1.78, 2.8, 4.08 ] ) {

		const [ z, y ] = at( t, 0.05 );
		const q = new Quaternion().setFromAxisAngle( new Vector3( 1, 0, 0 ), - tilt );
		const g = extruded( purlin, length - 0.1 );
		g.rotateY( Math.PI / 2 );
		parts.add( GALV(), g, _m.compose( new Vector3( 0, y, z ), q, ONE ) );

	}

	const frames = 5;
	for ( let i = 0; i < frames; i ++ ) {

		const x = ( i - ( frames - 1 ) / 2 ) * ( length - 1.4 ) / ( frames - 1 );
		const [ za, ya ] = at( 0.15, 0.16 );
		const [ zb, yb ] = at( slope - 0.15, 0.16 );
		member( parts, GALV(), [ 0.06, 0.12 ], [ x, ya, za ], [ x, yb, zb ] );
		for ( const t of [ 1.0, 3.55 ] ) {

			const [ z, y ] = at( t, 0.22 );
			parts.box( GALV(), [ 0.09, y - 0.15, 0.09 ], [ x, 0.15, z ] );
			parts.box( STEEL(), [ 0.22, 0.02, 0.22 ], [ x, 0.13, z ] );
			parts.cylinder( STEEL(), 0.045, 0.13, [ x, 0, z ], 10 );

		}

		const [ zf ] = at( 1.0 );
		const [ zr, yr ] = at( 3.0, 0.22 );
		member( parts, GALV(), [ 0.05, 0.05 ], [ x, 0.45, zf + 0.06 ], [ x, yr, zr ] );

	}

	return parts.build();

}

// A central inverter and MV transformer skid of the 4 MVA class: a 20 ft steel skid on six piers,
// the inverter cabinet at the front with doors on the right and intake louvres on the left, the
// oil transformer with its radiators in the middle, joined by a cable throat, and the ring main
// switchgear at the back.
function inverterSkid() {

	const parts = new Parts();
	const [ l, w ] = [ 20 * FT, 8 * FT ];
	const pier = 0.3;
	for ( const z of [ - 2.6, 0, 2.6 ] ) for ( const s of [ - 1, 1 ] ) parts.box( CONCRETE(), [ 0.6, pier, 0.6 ], [ s * 0.85, 0, z ] );
	const skid = paint( 0x3a3d40 );
	for ( const s of [ - 1, 1 ] ) profile( parts, skid, wShape( 0.25, 0.15, 0.008, 0.012 ), [ s * 0.85, pier + 0.125, - l / 2 ], [ s * 0.85, pier + 0.125, l / 2 ] );
	const deck = pier + 0.26;
	parts.box( DARK(), [ w, 0.01, l ], [ 0, deck - 0.01, 0 ] );

	// Inverter cabinet.
	const cab = mat( 0xdcdedb, { roughness: 0.5, metalness: 0.15 } );
	const [ c0, c1 ] = [ - l / 2 + 0.1, - 0.25 ];
	const [ cw, ch ] = [ 1.6, 2.3 ];
	parts.box( cab, [ cw, ch, c1 - c0 ], [ 0, deck, ( c0 + c1 ) / 2 ] );
	parts.box( cab, [ cw + 0.25, 0.06, c1 - c0 + 0.2 ], [ 0, deck + ch, ( c0 + c1 ) / 2 ] );
	const doors = 4;
	for ( let i = 0; i <= doors; i ++ ) parts.box( DARK(), [ 0.01, ch - 0.15, 0.02 ], [ cw / 2 + 0.005, deck + 0.08, c0 + 0.05 + i * ( c1 - c0 - 0.1 ) / doors ] );
	for ( let i = 0; i < doors; i ++ ) parts.box( DARK(), [ 0.03, 0.2, 0.04 ], [ cw / 2 + 0.015, deck + 1.1, c0 + 0.05 + ( i + 0.8 ) * ( c1 - c0 - 0.1 ) / doors ] );
	for ( const z of [ c0 + 0.7, c1 - 0.7 ] ) {

		for ( let i = 0; i < 10; i ++ ) parts.box( DARK(), [ 0.03, 0.025, 1.0 ], [ - cw / 2 - 0.01, deck + 0.9 + i * 0.09, z ] );

	}

	const warn = drawn( 'high voltage label', [ 128, 96 ], ( ctx, cw2, ch2 ) => {

		ctx.fillStyle = '#f4c900';
		ctx.fillRect( 0, 0, cw2, ch2 );
		ctx.fillStyle = '#111111';
		ctx.beginPath();
		ctx.moveTo( 64, 10 );
		ctx.lineTo( 110, 86 );
		ctx.lineTo( 18, 86 );
		ctx.closePath();
		ctx.fill();
		ctx.fillStyle = '#f4c900';
		ctx.font = 'bold 44px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText( '⚡', 64, 78 );

	} );
	label( parts, warn, [ 0.3, 0.22 ], [ cw / 2 + 0.012, deck + 1.6, c0 + 0.4 ], Math.PI / 2 );
	label( parts, warn, [ 0.3, 0.22 ], [ 0, deck + 1.6, c0 - 0.003 ], Math.PI );

	// Transformer tank with radiators each side, bushings under the cable throat, a pressure relief.
	const tx = paint( 0x8e9a93 );
	const [ t0, t1 ] = [ 0.35, 2.25 ];
	const th = 1.75;
	parts.box( tx, [ 1.2, th, t1 - t0 ], [ 0, deck, ( t0 + t1 ) / 2 ] );
	parts.box( tx, [ 1.3, 0.08, t1 - t0 + 0.1 ], [ 0, deck + th, ( t0 + t1 ) / 2 ] );
	for ( const s of [ - 1, 1 ] ) {

		for ( let i = 0; i < 12; i ++ ) parts.box( tx, [ 0.36, 1.3, 0.025 ], [ s * 0.78, deck + 0.25, t0 + 0.15 + i * ( t1 - t0 - 0.3 ) / 11 ] );
		parts.box( tx, [ 0.08, 0.08, t1 - t0 - 0.2 ], [ s * 0.62, deck + 1.5, ( t0 + t1 ) / 2 ] );

	}

	parts.box( cab, [ 0.7, 0.45, 0.9 ], [ 0, deck + th + 0.08, t0 + 0.35 ] );
	member( parts, cab, [ 0.7, 0.45 ], [ 0, deck + th + 0.3, t0 + 0.3 ], [ 0, deck + th + 0.3, c1 - 0.05 ] );
	parts.cylinder( DARK(), 0.07, 0.15, [ 0.35, deck + th + 0.08, t1 - 0.3 ], 10 );

	// Ring main unit at the back.
	parts.box( cab, [ 1.8, 1.9, 0.6 ], [ 0, deck, l / 2 - 0.4 ] );
	for ( const x of [ - 0.6, 0, 0.6 ] ) parts.box( DARK(), [ 0.5, 0.7, 0.01 ], [ x, deck + 0.9, l / 2 - 0.095 ] );
	parts.box( RED_LAMP(), [ 0.04, 0.04, 0.02 ], [ 0.75, deck + 1.75, l / 2 - 0.09 ] );
	return parts.build();

}

// A 40 ft battery energy storage enclosure, 8 ft wide and 9.5 ft high, on its concrete pad: a
// white walk-in-free container with six pairs of cabinet doors down each side, the two HVAC units
// on the back end, explosion vent panels on the roof, a fire alarm strobe and hazard placards.
function bessContainer() {

	const parts = new Parts();
	const [ l, w, h ] = [ 40 * FT, 8 * FT, 9.5 * FT ];
	const pad = 0.3;
	parts.box( CONCRETE(), [ w + 1.0, pad, l + 1.2 ], [ 0, 0, 0 ] );
	const base = pad + 0.15;
	parts.box( DARK(), [ w, 0.15, l ], [ 0, pad, - 0.2 ] );
	const white = mat( 0xe9eae6, { roughness: 0.55, metalness: 0.15 } );
	const z = - 0.2;
	parts.box( white, [ w, h - 0.15, l ], [ 0, base, z ] );
	parts.box( white, [ w + 0.06, 0.08, l + 0.06 ], [ 0, base + h - 0.23, z ] );

	// Cabinet doors down each side: seams, hinges and handles.
	const pairs = 6;
	const door = ( l - 0.4 ) / pairs;
	for ( const s of [ - 1, 1 ] ) {

		const x = s * ( w / 2 + 0.004 );
		for ( let i = 0; i <= pairs; i ++ ) parts.box( DARK(), [ 0.008, h - 0.6, 0.025 ], [ x, base + 0.15, z - l / 2 + 0.2 + i * door ] );
		for ( let i = 0; i < pairs; i ++ ) {

			const zc = z - l / 2 + 0.2 + ( i + 0.5 ) * door;
			parts.box( DARK(), [ 0.008, h - 0.6, 0.012 ], [ x, base + 0.15, zc ] );
			for ( const dz of [ - 0.12, 0.12 ] ) parts.box( STEEL(), [ 0.03, 0.28, 0.04 ], [ x + s * 0.01, base + 1.05, zc + dz ] );

		}

		parts.box( DARK(), [ 0.01, 0.02, l - 0.3 ], [ x, base + h - 0.45, z ] );

	}

	// HVAC units on the back end.
	const back = z + l / 2;
	for ( const x of [ - 0.55, 0.55 ] ) {

		parts.box( white, [ 1.0, 2.0, 0.45 ], [ x, base + 0.4, back + 0.225 ] );
		for ( let i = 0; i < 10; i ++ ) parts.box( DARK(), [ 0.85, 0.025, 0.02 ], [ x, base + 0.65 + i * 0.12, back + 0.455 ] );
		parts.rod( DARK(), [ x, base + 2.0, back + 0.46 ], [ x, base + 2.0, back + 0.47 ], 0.3, 18 );

	}

	// Front end: a service door, the fire alarm strobe and a disconnect.
	const front = z - l / 2;
	parts.box( DARK(), [ 0.9, 2.1, 0.01 ], [ - 0.5, base + 0.15, front - 0.005 ] );
	parts.box( STEEL(), [ 0.04, 0.2, 0.04 ], [ - 0.15, base + 1.1, front - 0.02 ] );
	parts.box( mat( 0xb3141b, { roughness: 0.4, emissive: 0x7a0a0e, emissiveIntensity: 0.4 } ), [ 0.15, 0.15, 0.08 ], [ 0.5, base + 2.2, front - 0.04 ] );
	parts.box( mat( 0x8a8f94, { roughness: 0.5, metalness: 0.4 } ), [ 0.45, 0.6, 0.2 ], [ 0.6, base + 0.9, front - 0.1 ] );

	// Explosion vent panels on the roof.
	for ( let i = 0; i < 4; i ++ ) parts.box( mat( 0xcfd1cd, { roughness: 0.5 } ), [ 1.2, 0.06, 1.2 ], [ 0, base + h - 0.15, z - l / 2 + 1.6 + i * ( l - 3.2 ) / 3 ] );

	// Class 9 hazard placards and a sign on each side and the front.
	const placard = drawn( 'class 9 placard', [ 128, 128 ], ( ctx, cw ) => {

		ctx.translate( cw / 2, cw / 2 );
		ctx.rotate( Math.PI / 4 );
		ctx.fillStyle = '#111111';
		ctx.fillRect( - 44, - 44, 88, 88 );
		ctx.fillStyle = '#ffffff';
		ctx.fillRect( - 41, - 41, 82, 82 );
		ctx.fillStyle = '#111111';
		for ( let i = 0; i < 7; i ++ ) ctx.fillRect( - 41 + i * 12, - 41, 6, 38 );
		ctx.rotate( - Math.PI / 4 );
		ctx.font = 'bold 30px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText( '9', 0, 50 );

	} );
	label( parts, placard, [ 0.3, 0.3 ], [ 0, base + 1.8, front - 0.008 ], Math.PI );
	for ( const s of [ - 1, 1 ] ) label( parts, placard, [ 0.3, 0.3 ], [ s * ( w / 2 + 0.01 ), base + 2.0, z - l / 2 + 0.2 + door * 0.5 ], s * Math.PI / 2 );
	return parts.build();

}
