import { ExtrudeGeometry, MathUtils, Path, PlaneGeometry, Matrix4, Shape, Vector2 } from 'three';
import { drawn, FT, IN, mat, Parts } from './parts.js';
import { memberGeometry } from './plant-parts.js';

// Paving, pipeline and utility plant, a mast climbing platform, small compaction, ground
// protection mats and plates, and rebar benches, built in code at the sizes of the common North
// American rental and contractor classes (no brands). Like the other built-in pieces each stands
// on y = 0 with its front facing -Z (+X is its right).

const DEG = MathUtils.DEG2RAD;
const _m = new Matrix4();

export const MORE_PLANT_ITEMS = [
	// Paving and milling.
	{ id: 'asphalt-paver-10ft', name: 'Asphalt paver, tracked (10 ft screed)', category: 'Heavy equipment',
		keywords: 'paver paving asphalt blacktop laydown machine screed hopper tracked road', build: paver },
	{ id: 'cold-planer-w210', name: 'Cold planer / milling machine (Wirtgen W 210 class, 2 m drum, front loading conveyor)', category: 'Heavy equipment',
		keywords: 'cold planer milling machine miller grinder asphalt mill grind roto mill road', build: coldPlaner },
	// Pipeline and utilities.
	{ id: 'pipelayer-583', name: 'Pipelayer / sideboom (CAT 583 class, 24 ft boom)', category: 'Heavy equipment',
		keywords: 'pipelayer sideboom side boom pipeline crawler counterweight pipe laying', build: pipelayer },
	{ id: 'trencher-ride-on-rt', name: 'Ride-on trencher (Ditch Witch RT class, 6 ft chain boom, backfill blade)', category: 'Utilities',
		keywords: 'trencher chain trencher ditch witch ditcher cable conduit trench ride-on', build: trencher },
	{ id: 'hdd-rig-100k', name: 'Horizontal directional drill rig, tracked (100,000 lb class, 15 ft rods)', category: 'Utilities',
		keywords: 'hdd directional drill boring rig horizontal drill bore vermeer navigator pullback', build: hddRig },
	{ id: 'hdd-mud-mixing-system', name: 'HDD mud mixing system, skid (20 ft, 1,000 gal)', category: 'Utilities',
		keywords: 'mud mixing system drilling fluid bentonite tank hdd mixer skid slurry', build: mudSystem },
	// Access.
	{ id: 'mast-climbing-platform', name: 'Mast climbing work platform, single mast (20 m mast, 10 m deck at mid height)', category: 'Access & scaffolding',
		keywords: 'mast climber mast climbing work platform mcwp hek alimak facade masonry', build: mastClimber },
	// Compaction.
	{ id: 'plate-compactor-20in', name: 'Plate compactor, forward plate (20 in)', category: 'Heavy equipment',
		keywords: 'plate compactor tamper whacker wacker vibratory plate packer jumping', build: plateCompactor },
	{ id: 'rammer-jumping-jack', name: 'Rammer / jumping jack (11 in shoe)', category: 'Heavy equipment',
		keywords: 'rammer jumping jack jack hammer tamper trench compactor wacker upright', build: rammer },
	// Ground protection. A row of the single ones (rows.js) lays them end to end along their length,
	// or edge to edge across it, as a mat road.
	{ id: 'crane-mat-4x16', name: 'Crane mat, timber (4 x 16 ft x 8 in, ~1.2 t)', category: 'Access & scaffolding',
		keywords: 'crane mat timber mat dragline mat swamp mat access road ground protection outrigger', build: craneMat, rowLength: 16 * FT },
	{ id: 'crane-mat-stack-4x16', name: 'Crane mat stack (6 x 4 x 16 ft x 8 in timber mats)', category: 'Access & scaffolding',
		keywords: 'crane mat stack timber mats pile dragline swamp mat ground protection', build: craneMatStack },
	{ id: 'access-mat-8x14', name: 'Access mat, composite HDPE (8 x 14 ft, ~0.5 t)', category: 'Access & scaffolding',
		keywords: 'access mat composite mat hdpe dura base ground protection mat road swamp rig mat', build: accessMat, rowLength: 14 * FT },
	{ id: 'road-plate-8x20', name: 'Steel road plate (8 x 20 ft x 1 in, ~3 t)', category: 'Access & scaffolding',
		keywords: 'road plate steel plate trench plate plating cover ground protection', build: roadPlate, rowLength: 20 * FT },
	{ id: 'road-plate-stack-8x20', name: 'Steel road plate stack (8 x 8 x 20 ft x 1 in)', category: 'Access & scaffolding',
		keywords: 'road plate stack steel plates trench plates pile ground protection', build: roadPlateStack },
	// Rebar.
	{ id: 'rebar-bender-bench', name: 'Rebar bender, electric on steel bench (#8 / 25 mm)', category: 'Concrete & batching',
		keywords: 'rebar bender bending machine electric bench reinforcing steel', build: () => rebarBench( 'bender' ) },
	{ id: 'rebar-cutter-bench', name: 'Rebar cutter, electric on steel bench (#8 / 25 mm)', category: 'Concrete & batching',
		keywords: 'rebar cutter shear chop electric bench reinforcing steel', build: () => rebarBench( 'cutter' ) },
];

// --- shared materials and pieces -------------------------------------------------------------

const paint = color => mat( color, { roughness: 0.5, metalness: 0.2 } );
const YELLOW = () => paint( 0xf2b200 );
const DARK = () => mat( 0x2c2e31, { roughness: 0.7, metalness: 0.2 } );
const BLACK = () => mat( 0x18191b, { roughness: 0.85 } );
const TRACK = () => mat( 0x2a2a2b, { roughness: 0.8, metalness: 0.35 } );
const STEEL = () => mat( 0x7d8287, { roughness: 0.5, metalness: 0.6 } );
const GALV = () => mat( 0xa9adb0, { roughness: 0.45, metalness: 0.65 } );
const CHROME = () => mat( 0xd7dbdf, { roughness: 0.2, metalness: 0.9 } );
const GLASS = () => mat( 0x23313b, { roughness: 0.15, metalness: 0.3 } );
const RUBBER = () => mat( 0x161718, { roughness: 0.9 } );
const SEAT = () => mat( 0x202224, { roughness: 0.9 } );
const AMBER = () => mat( 0xff9a1a, { roughness: 0.3, emissive: 0xc76a00, emissiveIntensity: 0.6 } );
const CABLE = () => mat( 0x3b3d40, { roughness: 0.6, metalness: 0.5 } );

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

// A side profile with a hole in it (both [ z, y ]), extruded across x by `width` centred on x0.
function ring( outer, inner, width, x0 ) {

	const shape = new Shape( outer.map( ( [ z, y ] ) => new Vector2( z, y ) ) );
	shape.holes.push( new Path( inner.map( ( [ z, y ] ) => new Vector2( z, y ) ) ) );
	const geometry = new ExtrudeGeometry( shape, { depth: width, bevelEnabled: false, curveSegments: 4 } );
	geometry.rotateY( - Math.PI / 2 );
	geometry.translate( x0 + width / 2, 0, 0 );
	return geometry;

}

// A crawler track along z: the steel track round its frame, the idler and sprocket inside the
// ends, bottom rollers and the grousers along the top run.
function crawler( parts, frame, { length, height, width, x, z = 0 } ) {

	const t = Math.min( 0.09, height * 0.14 );
	parts.add( TRACK(), ring( stadium( z, 0, length, height ), stadium( z, t, length - 2 * t, height - 2 * t ), width, x ) );
	parts.box( frame, [ width * 0.6, height - 2 * t - 0.1, length - height ], [ x, t + 0.05, z ] );
	const r = height / 2 - t - 0.015;
	for ( const end of [ - 1, 1 ] ) parts.rod( DARK(), [ x - width * 0.4, height / 2, z + end * ( length / 2 - height / 2 ) ], [ x + width * 0.4, height / 2, z + end * ( length / 2 - height / 2 ) ], r, 16 );
	const run = length - height;
	const rollers = Math.max( 2, Math.round( run / 0.45 ) );
	for ( let i = 0; i < rollers; i ++ ) {

		const zz = z - run / 2 + run * ( i + 0.5 ) / rollers;
		parts.rod( DARK(), [ x - width * 0.4, t + 0.09, zz ], [ x + width * 0.4, t + 0.09, zz ], 0.08, 10 );

	}

	const pitch = Math.max( 0.15, height * 0.25 );
	const shoes = Math.floor( run / pitch );
	for ( let i = 0; i <= shoes; i ++ ) parts.box( TRACK(), [ width, 0.035, pitch * 0.25 ], [ x, height, z - shoes * pitch / 2 + i * pitch ] );

}

// A rubber tyre on its wheel, its axle across x.
function tyre( parts, radius, width, [ x, z ], rim = STEEL() ) {

	parts.rod( RUBBER(), [ x - width / 2, radius, z ], [ x + width / 2, radius, z ], radius, 20 );
	parts.rod( rim, [ x - width / 2 - 0.005, radius, z ], [ x + width / 2 + 0.005, radius, z ], radius * 0.55, 14 );

}

// An operator's seat facing -Z with its cushion top at y.
function seat( parts, [ x, y, z ], width = 0.5 ) {

	parts.box( SEAT(), [ width, 0.1, 0.48 ], [ x, y - 0.1, z ] );
	parts.block( SEAT(), [ width, 0.55, 0.1 ], [ x, y + 0.25, z + 0.24 ], [ - 10 * DEG, 0, 0 ] );

}

// A four-post canopy (ROPS) from y0 to `top` over [ width, length ] centred on (x, z).
function canopy( parts, material, [ width, length ], [ x, y0, z ], top, post = 0.08 ) {

	for ( const sx of [ - 1, 1 ] ) {

		for ( const sz of [ - 1, 1 ] ) parts.box( material, [ post, top - y0 - 0.08, post ], [ x + sx * ( width / 2 - post / 2 ), y0, z + sz * ( length / 2 - post / 2 ) ] );

	}

	parts.box( material, [ width + 0.06, 0.08, length + 0.06 ], [ x, top - 0.08, z ] );

}

// Guardrail along a polyline (points [ x, z ]) at deck height y: posts, top and mid rails.
function guardrail( parts, material, points, y, height = 1.07, spacing = 1.5 ) {

	for ( const h of [ height, height / 2 ] ) parts.path( material, points.map( ( [ x, z ] ) => [ x, y + h, z ] ), 0.022, 6 );
	for ( let i = 1; i < points.length; i ++ ) {

		const [ a, b ] = [ points[ i - 1 ], points[ i ] ];
		const span = Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] );
		const n = Math.max( 1, Math.ceil( span / spacing ) );
		for ( let j = i === 1 ? 0 : 1; j <= n; j ++ ) {

			const t = j / n;
			const x = a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t;
			const z = a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t;
			parts.rod( material, [ x, y, z ], [ x, y + height, z ], 0.024, 6 );

		}

	}

}

// A box beam of section [ w, h ] from point a to point b.
function member( parts, material, section, a, b ) {

	parts.add( material, memberGeometry( section, a, b ) );

}

// Positions along a straight sloping line in the y-z plane: u along it from `origin` (towards +Z
// with sign 1, -Z with -1) rising at `angle`, v up square to it, x across. `block` puts a box there
// lying along the line.
function slope( parts, origin, angle, sign ) {

	const [ ox, oy, oz ] = origin;
	const s = Math.sin( angle );
	const c = Math.cos( angle );
	const at = ( u, v = 0, x = 0 ) => [ ox + x, oy + u * s + v * c, oz + sign * ( u * c - v * s ) ];
	const block = ( material, size, u, v = 0, x = 0 ) => parts.block( material, size, at( u, v, x ), [ - sign * angle, 0, 0 ] );
	return { at, block };

}

// --- asphalt paver ---------------------------------------------------------------------------

// A tracked asphalt paver of the 10 ft class (about 6.2 m long, 3.05 m over the screed and 3.8 m
// to the top of its canopy): the hopper with its fold-up wings and truck push rollers at the
// front, the tractor with the engine under a hood, the operator's deck at the back with two seats
// and consoles under a canopy, the auger and the free-floating screed towed behind on its arms,
// with a catwalk along its back.
function paver() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();
	const steel = STEEL();

	// Tracks under the tractor.
	for ( const x of [ - 1.1, 1.1 ] ) crawler( parts, body, { length: 3.0, height: 0.6, width: 0.36, x, z: 0.1 } );

	// Tractor frame between the tracks, fenders over them and the engine compartment.
	parts.box( dark, [ 1.82, 0.72, 3.0 ], [ 0, 0.3, 0.2 ] );
	for ( const x of [ - 1.1, 1.1 ] ) parts.box( body, [ 0.42, 0.05, 2.95 ], [ x, 0.66, 0.2 ] );
	parts.box( body, [ 2.55, 0.32, 3.0 ], [ 0, 0.71, 0.2 ] );
	parts.box( body, [ 2.3, 0.72, 1.7 ], [ 0, 1.03, - 0.25 ] );
	parts.box( dark, [ 2.32, 0.05, 1.72 ], [ 0, 1.2, - 0.25 ] ); // shut line round the hood
	for ( let i = 0; i < 7; i ++ ) parts.box( dark, [ 0.012, 0.035, 0.9 ], [ 1.155, 1.3 + i * 0.06, - 0.3 ] );
	parts.cylinder( dark, 0.06, 0.55, [ 0.75, 1.75, - 0.75 ], 12 ); // exhaust stack

	// Hopper: the slat conveyor floor down the middle, a wing each side sloping up to a side wall,
	// the front lip and the two push rollers the dump truck's tyres bear on.
	const hz = - 2.2;
	const hl = 1.8;
	parts.box( dark, [ 1.3, 0.05, hl ], [ 0, 0.5, hz ] );
	for ( let i = 0; i < 12; i ++ ) parts.box( steel, [ 0.04, 0.012, hl ], [ - 0.55 + i * 0.1, 0.55, hz ] );
	const wing = Math.atan2( 0.25, 0.9 );
	for ( const s of [ - 1, 1 ] ) {

		parts.block( body, [ 0.94, 0.03, hl ], [ s * 1.1, 0.68, hz ], [ 0, 0, s * wing ] );
		parts.box( body, [ 0.04, 0.55, hl ], [ s * 1.53, 0.78, hz ] );
		parts.box( body, [ 0.12, 0.06, hl ], [ s * 1.5, 1.33, hz ] ); // rolled top edge

	}

	parts.box( body, [ 3.1, 0.5, 0.05 ], [ 0, 0.45, - 3.06 ] );
	parts.box( body, [ 2.55, 0.85, 0.06 ], [ 0, 0.55, - 1.3 ] ); // bulkhead at the back of the hopper
	for ( const x of [ - 0.55, 0.55 ] ) {

		parts.rod( dark, [ x - 0.3, 0.42, - 3.0 ], [ x + 0.3, 0.42, - 3.0 ], 0.1, 16 );
		for ( const e of [ - 0.33, 0.33 ] ) parts.box( body, [ 0.04, 0.22, 0.2 ], [ x + e, 0.32, - 2.98 ] );

	}

	// Operator's deck across the full width with two consoles, two seats, rails and the canopy.
	const deck = 1.6;
	parts.box( dark, [ 3.05, 0.06, 1.4 ], [ 0, deck - 0.06, 1.3 ] );
	parts.box( body, [ 2.3, deck - 1.03 - 0.06, 1.4 ], [ 0, 1.03, 1.3 ] );
	for ( const x of [ - 0.75, 0.75 ] ) {

		parts.block( dark, [ 0.55, 0.45, 0.3 ], [ x, deck + 0.4, 0.8 ], [ 0.35, 0, 0 ] );
		parts.box( dark, [ 0.12, 0.3, 0.12 ], [ x, deck, 0.8 ] );
		seat( parts, [ x, deck + 0.5, 1.35 ] );
		parts.box( dark, [ 0.12, 0.4, 0.12 ], [ x, deck, 1.35 ] );

	}

	guardrail( parts, dark, [ [ - 1.5, 0.65 ], [ - 1.5, 1.98 ], [ 1.5, 1.98 ], [ 1.5, 0.65 ] ], deck, 1.0, 1.4 );
	canopy( parts, dark, [ 2.4, 1.5 ], [ 0, deck, 1.3 ], 3.8, 0.07 );
	parts.sphere( AMBER(), 0.08, [ 0, 3.82, 1.3 ] );

	// Tow arms from the tractor's tow points back to the screed, and the auger in front of it.
	for ( const s of [ - 1, 1 ] ) member( parts, body, [ 0.1, 0.2 ], [ s * 1.36, 0.5, - 0.8 ], [ s * 1.36, 0.45, 2.3 ] );
	parts.rod( steel, [ - 1.5, 0.28, 1.9 ], [ 1.5, 0.28, 1.9 ], 0.06, 10 );
	for ( let i = 0; i < 20; i ++ ) {

		const x = - 1.45 + i * 0.152;
		if ( Math.abs( x ) < 0.15 ) continue; // the gearbox in the middle
		parts.block( steel, [ 0.012, 0.36, 0.36 ], [ x, 0.28, 1.9 ], [ ( x > 0 ? 1 : - 1 ) * i * 0.6, 0, 0.35 ] );

	}

	parts.box( dark, [ 0.3, 0.45, 0.3 ], [ 0, 0.25, 1.85 ] );

	// The screed: the main body with its heated plate, end gates, controls each end and the catwalk.
	parts.box( body, [ 3.05, 0.55, 0.7 ], [ 0, 0.06, 2.5 ] );
	parts.box( steel, [ 3.05, 0.06, 0.72 ], [ 0, 0.0, 2.5 ] );
	parts.box( dark, [ 3.0, 0.08, 0.6 ], [ 0, 0.61, 2.5 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( dark, [ 0.03, 0.45, 0.95 ], [ s * 1.54, 0.0, 2.4 ] );
		parts.box( dark, [ 0.25, 0.35, 0.18 ], [ s * 1.3, 0.69, 2.95 ] );
		parts.rod( dark, [ s * 1.52, 0.6, 2.1 ], [ s * 1.52, 1.0, 2.3 ], 0.03, 8 ); // depth crank

	}

	parts.box( steel, [ 3.05, 0.04, 0.3 ], [ 0, 0.35, 2.98 ] );
	guardrail( parts, dark, [ [ - 1.5, 3.1 ], [ 1.5, 3.1 ] ], 0.39, 0.6, 1.0 );

	return parts.build();

}

// --- cold planer -----------------------------------------------------------------------------

// A large half-lane cold planer of the Wirtgen W 210 class: four crawler tracks on height-adjustable
// legs, the 2 m milling drum in its housing between them with side plates down to the road, the
// engine at the back, the operator's stand at the front under a canopy, and the long loading
// conveyor reaching forward and up over a truck (about 15 m overall).
function coldPlaner() {

	const parts = new Parts();
	const body = paint( 0xe9e6dc ); // the light grey-white these come in
	const trim = paint( 0x5a5f63 );
	const dark = DARK();
	const steel = STEEL();

	// Four tracks on legs.
	for ( const [ x, z ] of [ [ - 0.95, - 2.6 ], [ 0.95, - 2.6 ], [ - 0.95, 2.4 ], [ 0.95, 2.4 ] ] ) {

		crawler( parts, trim, { length: 1.75, height: 0.62, width: 0.32, x, z } );
		parts.box( steel, [ 0.22, 0.6, 0.22 ], [ x, 0.6, z ] );
		parts.box( trim, [ 0.34, 0.5, 0.34 ], [ x, 0.75, z ] );

	}

	// Chassis, the drum housing and the side plates riding on the road.
	parts.box( trim, [ 2.3, 0.42, 7.0 ], [ 0, 1.2, - 0.1 ] );
	parts.box( trim, [ 2.4, 1.15, 1.7 ], [ 0, 0.06, - 0.2 ] );
	for ( const x of [ - 1.24, 1.24 ] ) parts.box( dark, [ 0.06, 0.75, 2.1 ], [ x, 0.0, - 0.2 ] );
	parts.box( body, [ 2.0, 0.06, 1.5 ], [ 0, 1.15, - 0.2 ] );

	// Engine compartment at the back, with louvres, the exhaust and a water tank over the drum.
	parts.box( body, [ 2.5, 1.0, 3.9 ], [ 0, 1.62, 1.4 ] );
	for ( const x of [ - 1.255, 1.255 ] ) for ( let i = 0; i < 8; i ++ ) parts.box( dark, [ 0.012, 0.04, 1.6 ], [ x, 1.8 + i * 0.08, 2.3 ] );
	parts.box( trim, [ 2.52, 0.08, 3.92 ], [ 0, 2.62, 1.4 ] );
	parts.cylinder( dark, 0.08, 0.5, [ 0.7, 2.7, 2.6 ], 12 );
	parts.box( body, [ 2.5, 0.75, 1.3 ], [ 0, 1.62, - 1.15 ] );

	// Operator's stand at the front: the deck, two consoles, rails and the canopy.
	const deck = 1.95;
	parts.box( trim, [ 2.5, deck - 1.62, 2.7 ], [ 0, 1.62, - 2.25 ] );
	for ( const x of [ - 0.7, 0.7 ] ) {

		parts.box( dark, [ 0.18, 0.75, 0.18 ], [ x, deck, - 2.0 ] );
		parts.block( dark, [ 0.6, 0.12, 0.4 ], [ x, deck + 0.85, - 2.0 ], [ 0.3, 0, 0 ] );
		parts.box( SEAT(), [ 0.45, 0.1, 0.45 ], [ x, deck + 0.55, - 1.4 ] );
		parts.box( dark, [ 0.1, 0.55, 0.1 ], [ x, deck, - 1.4 ] );

	}

	guardrail( parts, dark, [ [ - 1.22, - 0.92 ], [ - 1.22, - 3.55 ], [ - 0.5, - 3.55 ] ], deck, 1.0, 1.0 );
	guardrail( parts, dark, [ [ 0.5, - 3.55 ], [ 1.22, - 3.55 ], [ 1.22, - 0.92 ] ], deck, 1.0, 1.0 );
	canopy( parts, trim, [ 2.5, 2.6 ], [ 0, deck, - 2.25 ], 3.95, 0.08 );
	parts.sphere( AMBER(), 0.08, [ 1.0, 3.98, - 1.2 ] );
	// Ladder up to the stand on the left.
	for ( let i = 0; i < 4; i ++ ) parts.box( steel, [ 0.06, 0.03, 0.5 ], [ - 1.28, 0.55 + i * 0.35, - 0.55 ] );

	// Primary conveyor from the drum forward under the stand, then the loading conveyor hinged on
	// the front and reaching 8.3 m forward at 17 degrees, on its support rams.
	parts.box( dark, [ 0.9, 0.45, 3.2 ], [ 0, 0.65, - 2.25 ] );
	const length = 8.3;
	const c = slope( parts, [ 0, 1.15, - 3.65 ], 17 * DEG, - 1 );
	c.block( trim, [ 0.95, 0.3, length ], length / 2, 0 );
	c.block( BLACK(), [ 0.8, 0.03, length ], length / 2, 0.16 );
	for ( const s of [ - 1, 1 ] ) c.block( body, [ 0.04, 0.34, length ], length / 2, 0.3, s * 0.47 );
	for ( let i = 1; i < 9; i ++ ) c.block( steel, [ 1.0, 0.12, 0.08 ], i * length / 9, - 0.2 ); // cross members under it
	c.block( trim, [ 1.05, 0.38, 0.1 ], 4.0, 0 ); // the fold joint
	parts.block( body, [ 1.0, 0.6, 0.6 ], c.at( length - 0.2, 0.2 ), [ 17 * DEG + 0.5, 0, 0 ] ); // discharge hood
	for ( const s of [ - 1, 1 ] ) {

		parts.rod( dark, [ s * 0.35, 1.6, - 3.6 ], c.at( 2.8, - 0.15, s * 0.35 ), 0.06, 8 );
		parts.rod( CHROME(), c.at( 1.6, - 0.15, s * 0.35 ), c.at( 2.8, - 0.15, s * 0.35 ), 0.035, 8 );

	}

	return parts.build();

}

// --- pipelayer -------------------------------------------------------------------------------

// A crawler pipelayer of the CAT 583 class: a tractor with a ROPS cab, the 24 ft A-frame sideboom
// pinned to the left track frame with its load line and hook block, and the counterweight slabs
// hung out on the right. Shown with the boom at 55 degrees.
function pipelayer() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();
	const steel = STEEL();

	// Tracks and the main frame between them.
	for ( const x of [ - 1.15, 1.15 ] ) crawler( parts, body, { length: 4.4, height: 1.05, width: 0.71, x } );
	parts.box( dark, [ 1.58, 0.8, 4.2 ], [ 0, 0.45, 0 ] );
	for ( const x of [ - 1.15, 1.15 ] ) parts.box( body, [ 0.74, 0.05, 2.4 ], [ x, 1.1, 0.6 ] );

	// Engine hood in front of the cab with its grille, the radiator guard and exhaust.
	parts.box( body, [ 1.55, 1.0, 2.0 ], [ 0, 1.25, - 1.1 ] );
	parts.box( dark, [ 1.3, 0.85, 0.05 ], [ 0, 1.3, - 2.12 ] );
	for ( let i = 0; i < 8; i ++ ) parts.box( steel, [ 1.26, 0.03, 0.02 ], [ 0, 1.36 + i * 0.1, - 2.15 ] );
	parts.box( body, [ 1.7, 0.3, 0.25 ], [ 0, 0.95, - 2.2 ] );
	parts.cylinder( dark, 0.07, 0.75, [ 0.45, 2.25, - 1.5 ], 12 );

	// Cab: a deck the width of the tracks, the cab's posts, glass and roof.
	parts.box( body, [ 2.2, 0.15, 1.9 ], [ 0, 1.1, 0.95 ] );
	parts.box( GLASS(), [ 1.44, 1.22, 1.44 ], [ 0, 1.85, 0.75 ] );
	for ( const x of [ - 0.74, 0.74 ] ) for ( const z of [ 0.01, 1.49 ] ) parts.box( body, [ 0.08, 1.3, 0.08 ], [ x, 1.8, z ] );
	parts.box( body, [ 1.56, 0.16, 1.56 ], [ 0, 1.25, 0.75 ] );
	parts.box( body, [ 1.6, 0.12, 1.6 ], [ 0, 3.1, 0.75 ] );
	parts.box( body, [ 2.0, 0.6, 0.4 ], [ 0, 1.25, 1.85 ] ); // fuel tank behind
	parts.sphere( AMBER(), 0.07, [ 0.6, 3.27, 1.3 ] );

	// Winch housing on the right of the cab and the frame the boom line comes down to.
	parts.box( dark, [ 0.5, 0.7, 1.2 ], [ 0.95, 1.25, - 0.5 ] );
	const fairlead = [ 0.55, 3.35, - 0.35 ];
	member( parts, body, [ 0.14, 0.14 ], [ 0.75, 1.95, - 0.75 ], fairlead );
	member( parts, body, [ 0.14, 0.14 ], [ 0.75, 1.95, 0.05 ], fairlead );

	// Counterweight: an arm off each side of the frame carrying the slabs out past the right track.
	for ( const z of [ - 0.9, 0.9 ] ) member( parts, dark, [ 0.18, 0.25 ], [ 0.8, 1.5, z ], [ 1.75, 1.0, z ] );
	for ( let i = 0; i < 4; i ++ ) parts.box( body, [ 0.38, 0.33, 2.6 ], [ 1.84, 0.5 + i * 0.36, 0 ] );
	parts.box( dark, [ 0.08, 1.5, 0.3 ], [ 2.06, 0.45, 0 ] );

	// Sideboom: two box-section legs from pins on the left track frame meeting at the head, laced
	// together, then the load line down to the hook block and the boom line back to the fairlead.
	const angle = 55 * DEG;
	const reach = 7.3;
	const foot = [ - 1.62, 0.8 ];
	const head = [ foot[ 0 ] - reach * Math.cos( angle ), foot[ 1 ] + reach * Math.sin( angle ), 0 ];
	for ( const z of [ - 1.4, 1.4 ] ) {

		parts.box( dark, [ 0.25, 0.35, 0.3 ], [ - 1.6, 0.55, z ] ); // pin bracket
		member( parts, body, [ 0.22, 0.22 ], [ foot[ 0 ], foot[ 1 ], z ], head );

	}

	const leg = ( z, t ) => [ foot[ 0 ] + ( head[ 0 ] - foot[ 0 ] ) * t, foot[ 1 ] + ( head[ 1 ] - foot[ 1 ] ) * t, z * ( 1 - t ) ];
	for ( let i = 1; i < 7; i ++ ) {

		const t = i / 7.5;
		parts.rod( body, leg( - 1.4, t ), leg( 1.4, t ), 0.05, 6 );
		if ( i < 6 ) parts.rod( body, leg( - 1.4, t ), leg( 1.4, ( i + 1 ) / 7.5 ), 0.035, 6 );

	}

	parts.box( dark, [ 0.35, 0.35, 0.4 ], [ head[ 0 ], head[ 1 ] - 0.2, 0 ] );
	const block = 2.6;
	for ( const z of [ - 0.08, 0.08 ] ) parts.rod( CABLE(), [ head[ 0 ], head[ 1 ] - 0.2, z ], [ head[ 0 ], block + 0.55, z ], 0.012, 5 );
	for ( const z of [ - 0.05, 0.05 ] ) parts.rod( CABLE(), [ head[ 0 ] + 0.1, head[ 1 ], z ], fairlead, 0.012, 5 );
	parts.box( body, [ 0.25, 0.55, 0.35 ], [ head[ 0 ], block, 0 ] );
	parts.rod( dark, [ head[ 0 ], block, 0 ], [ head[ 0 ], block - 0.25, 0 ], 0.04, 8 );
	parts.path( dark, [ [ head[ 0 ], block - 0.25, 0 ], [ head[ 0 ], block - 0.4, 0 ], [ head[ 0 ] + 0.12, block - 0.38, 0 ], [ head[ 0 ] + 0.14, block - 0.28, 0 ] ], 0.03, 8 );

	return parts.build();

}

// --- ride-on trencher ------------------------------------------------------------------------

// A ride-on trencher of the Ditch Witch RT45/RT55 class: four-wheel drive on turf-friendly tyres,
// a backfill blade at the front, the operator's seat under a ROPS canopy, the engine behind, and
// the 6 ft chain digging boom at the back, raised to travel, with spoil augers either side of it.
function trencher() {

	const parts = new Parts();
	const body = paint( 0xe35f1c );
	const dark = DARK();
	const steel = STEEL();

	for ( const x of [ - 0.68, 0.68 ] ) for ( const z of [ - 0.85, 0.65 ] ) tyre( parts, 0.45, 0.36, [ x, z ], paint( 0xdcdcd4 ) );
	parts.box( dark, [ 0.95, 0.45, 2.4 ], [ 0, 0.3, - 0.1 ] );
	for ( const s of [ - 1, 1 ] ) {

		// Fenders over the tyres, on plates down to the body.
		for ( const z of [ - 0.85, 0.65 ] ) {

			parts.box( body, [ 0.42, 0.04, 0.7 ], [ s * 0.68, 0.93, z ] );
			parts.box( body, [ 0.03, 0.2, 0.7 ], [ s * 0.47, 0.75, z ] );

		}

	}

	// Engine hood and the operator's platform with its console.
	parts.box( body, [ 1.45, 0.62, 1.0 ], [ 0, 0.72, 0.45 ] );
	for ( let i = 0; i < 5; i ++ ) parts.box( dark, [ 0.012, 0.035, 0.6 ], [ 0.73, 0.85 + i * 0.07, 0.45 ] );
	parts.cylinder( dark, 0.04, 0.4, [ 0.5, 1.34, 0.75 ], 10 );
	parts.box( body, [ 1.45, 0.1, 1.0 ], [ 0, 0.72, - 0.55 ] );
	seat( parts, [ 0, 1.3, - 0.35 ] );
	parts.box( dark, [ 0.3, 0.48, 0.3 ], [ 0, 0.82, - 0.35 ] );
	parts.block( dark, [ 0.5, 0.35, 0.2 ], [ 0, 1.15, - 0.92 ], [ - 0.3, 0, 0 ] );
	parts.rod( dark, [ 0, 1.0, - 0.85 ], [ 0, 1.25, - 0.75 ], 0.025, 6 );
	canopy( parts, dark, [ 1.5, 1.25 ], [ 0, 0.82, - 0.35 ], 2.45, 0.06 );

	// Backfill blade on its arms.
	parts.box( body, [ 1.75, 0.45, 0.08 ], [ 0, 0.05, - 1.62 ] );
	parts.box( dark, [ 1.75, 0.05, 0.12 ], [ 0, 0.0, - 1.62 ] );
	for ( const x of [ - 0.4, 0.4 ] ) member( parts, dark, [ 0.08, 0.1 ], [ x, 0.3, - 1.58 ], [ x, 0.5, - 1.15 ] );

	// Digging attachment: the headshaft housing, the spoil augers and the boom with its chain and
	// cutting teeth, angled down behind.
	parts.box( body, [ 0.6, 0.65, 0.35 ], [ 0, 0.4, 1.15 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.rod( steel, [ s * 0.1, 0.32, 1.42 ], [ s * 0.62, 0.32, 1.42 ], 0.04, 8 );
		for ( let i = 0; i < 6; i ++ ) parts.block( steel, [ 0.012, 0.22, 0.22 ], [ s * ( 0.15 + i * 0.08 ), 0.32, 1.42 ], [ i * 0.7, 0, 0.35 * s ] );

	}

	const angle = 15 * DEG;
	const boom = slope( parts, [ 0, 0.85, 1.3 ], - angle, 1 );
	const length = 2.15;
	boom.block( body, [ 0.12, 0.3, length ], length / 2 );
	boom.block( BLACK(), [ 0.15, 0.38, length + 0.12 ], length / 2 + 0.04 );
	for ( let i = 0; i < 14; i ++ ) {

		const u = 0.15 + i * ( length - 0.1 ) / 14;
		boom.block( steel, [ 0.2, 0.06, 0.04 ], u, 0.21 * ( i % 2 ? 1 : - 1 ) );

	}

	parts.rod( dark, boom.at( length + 0.1, 0, - 0.09 ), boom.at( length + 0.1, 0, 0.09 ), 0.18, 14 ); // nose roller

	return parts.build();

}

// --- horizontal directional drill ------------------------------------------------------------

// A tracked HDD rig of the 100,000 lb pullback class (about 11 m long): the drill frame tilted at
// 15 degrees, its front end down by the anchor plate with the vises, the rotation carriage up the
// frame making up a rod, the rod box of 15 ft rods beside the frame on the right, the operator's
// cab on the left and the engine under the rear of the frame, all on a tracked undercarriage.
function hddRig() {

	const parts = new Parts();
	const body = paint( 0xf2c418 );
	const dark = DARK();
	const steel = STEEL();
	const angle = 15 * DEG;
	const frameLength = 10.5;
	const f = slope( parts, [ 0, 0.5, - 5.3 ], angle, 1 );

	// Undercarriage: tracks, the deck over them and the engine enclosure at the back.
	for ( const x of [ - 0.95, 0.95 ] ) crawler( parts, dark, { length: 4.3, height: 0.72, width: 0.5, x, z: 1.6 } );
	parts.box( body, [ 2.45, 0.5, 5.1 ], [ 0, 0.75, 1.85 ] );
	parts.box( body, [ 2.35, 0.9, 1.9 ], [ 0, 1.25, 3.45 ] );
	for ( const x of [ - 1.18, 1.18 ] ) for ( let i = 0; i < 6; i ++ ) parts.box( dark, [ 0.012, 0.04, 1.2 ], [ x, 1.4 + i * 0.09, 3.45 ] );
	parts.cylinder( dark, 0.07, 0.55, [ - 0.8, 2.15, 3.9 ], 12 );

	// Drill frame: a deep box beam with the rack along its top, carried on two posts off the deck
	// and the front stabilizer, with the anchor plate on the ground.
	f.block( body, [ 0.7, 0.5, frameLength ], frameLength / 2 );
	for ( const x of [ - 0.28, 0.28 ] ) f.block( steel, [ 0.08, 0.06, frameLength - 1.2 ], frameLength / 2 + 0.3, 0.28, x );
	for ( const u of [ 5.0, 7.4, 9.6 ] ) {

		const [ , y, z ] = f.at( u, - 0.25 );
		const base = z > 2.5 ? 2.15 : 1.25; // the engine enclosure's roof, or the deck
		for ( const x of [ - 0.25, 0.25 ] ) parts.box( dark, [ 0.18, y - base + 0.05, 0.25 ], [ x, base, z ] );

	}

	parts.box( dark, [ 2.1, 0.12, 0.8 ], [ 0, 0, - 5.35 ] );
	for ( const x of [ - 0.75, 0.75 ] ) parts.cylinder( steel, 0.07, 0.5, [ x, 0.05, - 5.5 ], 10 ); // stake-down tubes
	parts.box( dark, [ 0.5, 0.45, 0.4 ], [ 0, 0.1, - 5.05 ] );

	// Vises and breakout wrench near the front, and the rotation carriage with a rod made up through
	// to them.
	f.block( dark, [ 0.95, 0.95, 0.4 ], 0.9, 0.15 );
	f.block( dark, [ 0.95, 0.95, 0.4 ], 1.6, 0.15 );
	f.block( dark, [ 1.1, 1.0, 1.3 ], 6.0, 0.7 );
	f.block( body, [ 1.0, 0.25, 1.1 ], 6.0, 1.3 );
	parts.rod( steel, f.at( 0.2, 0.55 ), f.at( 5.35, 0.55 ), 0.065, 10 );

	// Rod box on the right: two end frames holding 5 rows of 6 rods, 15 ft (4.6 m) long.
	const rodLength = 15 * FT;
	const u0 = 2.6;
	for ( const u of [ u0, u0 + rodLength ] ) f.block( body, [ 0.75, 0.75, 0.12 ], u, 0.05, 0.85 );
	for ( let row = 0; row < 5; row ++ ) {

		for ( let col = 0; col < 6; col ++ ) parts.rod( steel, f.at( u0 - 0.15, - 0.25 + row * 0.13, 0.55 + col * 0.12 ), f.at( u0 + rodLength + 0.15, - 0.25 + row * 0.13, 0.55 + col * 0.12 ), 0.055, 8 );

	}

	// Loader arm reaching from the rod box to the frame.
	for ( const u of [ u0 + 0.8, u0 + rodLength - 0.8 ] ) f.block( dark, [ 0.6, 0.12, 0.12 ], u, 0.45, 0.45 );

	// Operator's cab on the left side of the deck.
	parts.box( body, [ 0.9, 0.2, 1.6 ], [ - 0.82, 1.25, 0.8 ] );
	parts.box( GLASS(), [ 0.84, 1.3, 1.5 ], [ - 0.82, 1.45, 0.8 ] );
	for ( const x of [ - 1.24, - 0.4 ] ) for ( const z of [ 0.04, 1.56 ] ) parts.box( body, [ 0.06, 1.35, 0.06 ], [ x, 1.45, z ] );
	parts.box( body, [ 0.96, 0.1, 1.64 ], [ - 0.82, 2.8, 0.8 ] );
	parts.sphere( AMBER(), 0.07, [ - 0.82, 2.95, 1.3 ] );

	return parts.build();

}

// A skid-mounted mud (drilling fluid) mixing system for an HDD rig: a 20 ft skid with a 1,000 gal
// tank split for mixing and holding, the jet hopper on a stand at the front for the bentonite
// bags, a diesel-driven centrifugal pump, a walkway with rails along the top and a hose reel.
function mudSystem() {

	const parts = new Parts();
	const tank = paint( 0xe9e6dc );
	const blue = paint( 0x2f5f8f );
	const dark = DARK();
	const steel = STEEL();
	const length = 20 * FT;
	const width = 8 * FT;

	// Skid with fork pockets.
	for ( const x of [ - width / 2 + 0.1, width / 2 - 0.1 ] ) parts.box( blue, [ 0.2, 0.25, length ], [ x, 0, 0 ] );
	for ( let i = 0; i < 6; i ++ ) parts.box( blue, [ width, 0.15, 0.15 ], [ 0, 0.1, - length / 2 + 0.1 + i * ( length - 0.2 ) / 5 ] );
	parts.box( steel, [ width, 0.02, length ], [ 0, 0.25, 0 ] );

	// Tank at the back, its divider line and the access hatches on top.
	const tz = 1.2;
	const tl = 3.6;
	parts.box( tank, [ width - 0.1, 1.5, tl ], [ 0, 0.27, tz ] );
	parts.box( dark, [ width - 0.08, 1.5, 0.04 ], [ 0, 0.27, tz ] );
	for ( const z of [ tz - 1.0, tz + 1.0 ] ) {

		parts.cylinder( steel, 0.3, 0.06, [ - 0.5, 1.77, z ], 16 );
		parts.cylinder( dark, 0.12, 0.25, [ 0.5, 1.77, z ], 12 ); // agitator motor

	}

	guardrail( parts, steel, [ [ - width / 2 + 0.08, tz - tl / 2 + 0.05 ], [ - width / 2 + 0.08, tz + tl / 2 - 0.05 ], [ width / 2 - 0.08, tz + tl / 2 - 0.05 ], [ width / 2 - 0.08, tz - tl / 2 + 0.05 ] ], 1.77, 1.0, 1.4 );
	// Ladder up the front of the tank.
	for ( let i = 0; i < 6; i ++ ) parts.box( steel, [ 0.42, 0.03, 0.04 ], [ - width / 2 + 0.4, 0.3 + i * 0.27, tz - tl / 2 - 0.06 ] );
	for ( const x of [ - width / 2 + 0.19, - width / 2 + 0.61 ] ) parts.box( steel, [ 0.04, 1.75, 0.05 ], [ x, 0.27, tz - tl / 2 - 0.06 ] );

	// Pump and engine at the front, the mixing hopper beside them, and the piping between.
	const front = - length / 2;
	parts.box( blue, [ 0.9, 0.75, 1.0 ], [ 0.55, 0.27, front + 0.9 ] );
	parts.box( dark, [ 0.92, 0.06, 1.02 ], [ 0.55, 1.02, front + 0.9 ] );
	parts.cylinder( dark, 0.04, 0.4, [ 0.8, 1.05, front + 1.2 ], 10 );
	parts.rod( blue, [ 0.55, 0.55, front + 0.4 ], [ 0.55, 0.55, front + 0.25 ], 0.22, 16 ); // pump volute
	for ( const [ x, z ] of [ [ - 0.85, front + 0.5 ], [ - 0.25, front + 0.5 ], [ - 0.85, front + 1.1 ], [ - 0.25, front + 1.1 ] ] ) parts.rod( steel, [ x, 0.27, z ], [ x, 0.95, z ], 0.03, 6 );
	parts.cylinder( steel, 0.08, 0.5, [ - 0.55, 0.95, front + 0.8 ], 4, 0.5 ); // hopper
	parts.box( steel, [ 1.0, 0.04, 1.0 ], [ - 0.55, 1.45, front + 0.8 ] ); // bag table
	parts.path( steel, [ [ - 0.55, 0.85, front + 0.8 ], [ - 0.55, 0.85, front + 1.9 ], [ - 0.55, 1.4, front + 2.5 ] ], 0.06, 10 );
	parts.path( steel, [ [ 0.55, 0.55, front + 1.4 ], [ 0.55, 0.55, front + 2.5 ] ], 0.06, 10 );
	// Hose reel between the pipes.
	const reel = front + 1.95;
	parts.rod( dark, [ - 0.25, 0.75, reel ], [ 0.25, 0.75, reel ], 0.3, 16 );
	for ( const x of [ - 0.27, 0.27 ] ) {

		parts.rod( steel, [ x - 0.01, 0.75, reel ], [ x + 0.01, 0.75, reel ], 0.44, 16 );
		parts.box( blue, [ 0.04, 0.48, 0.4 ], [ x * 1.12, 0.27, reel ] );

	}

	return parts.build();

}

// --- mast climbing work platform -------------------------------------------------------------

// A single-mast climbing work platform: a 20 m galvanised lattice mast on a base with four
// outriggers and screw jacks, and the 10 m wide working deck stopped at mid height, with its
// drive unit round the mast, guardrails and toe boards. A real one is tied to the building as it
// goes up; here it stands free.
function mastClimber() {

	const parts = new Parts();
	const galv = GALV();
	const steel = STEEL();
	const red = paint( 0xc8372d );
	const deckPaint = paint( 0x6d7378 );
	const top = 20;
	const section = 0.65;
	const half = section / 2;

	// Base: the chassis, four outriggers with jacks and pads.
	parts.box( red, [ 2.0, 0.45, 2.0 ], [ 0, 0.35, 0 ] );
	for ( const sx of [ - 1, 1 ] ) {

		for ( const sz of [ - 1, 1 ] ) {

			member( parts, red, [ 0.18, 0.18 ], [ sx * 0.8, 0.6, sz * 0.8 ], [ sx * 2.0, 0.6, sz * 2.0 ] );
			parts.cylinder( steel, 0.05, 0.6, [ sx * 2.0, 0.05, sz * 2.0 ], 10 );
			parts.box( steel, [ 0.4, 0.05, 0.4 ], [ sx * 2.0, 0, sz * 2.0 ] );

		}

	}

	// Mast: four chords with lacing in 1.5 m sections, and the rack up the front face.
	const foot = 0.8;
	for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) parts.rod( galv, [ sx * half, foot, sz * half ], [ sx * half, top, sz * half ], 0.035, 8 );
	const pitch = 1.508;
	const sections = Math.round( ( top - foot ) / pitch );
	const corners = [ [ - half, - half ], [ half, - half ], [ half, half ], [ - half, half ], [ - half, - half ] ];
	for ( let i = 0; i <= sections; i ++ ) {

		const y = foot + i * ( top - foot ) / sections;
		for ( let k = 0; k < 4; k ++ ) {

			const [ a, b ] = [ corners[ k ], corners[ k + 1 ] ];
			parts.rod( galv, [ a[ 0 ], y, a[ 1 ] ], [ b[ 0 ], y, b[ 1 ] ], 0.02, 6 );
			if ( i < sections ) parts.rod( galv, [ a[ 0 ], y, a[ 1 ] ], [ b[ 0 ], y + ( top - foot ) / sections, b[ 1 ] ], 0.016, 6 );

		}

	}

	parts.box( steel, [ 0.08, top - foot, 0.04 ], [ 0, foot, - half - 0.02 ] );
	parts.box( red, [ section + 0.1, 0.12, section + 0.1 ], [ 0, top, 0 ] ); // top stop

	// The deck in front of the mast: two trusses under it, the platform, guardrails and toe boards.
	const deck = 10;
	const width = 10;
	const depth = 1.5;
	const z0 = - ( half + 0.25 + depth / 2 ); // the deck centre, clear of the mast's face
	const front = z0 - depth / 2;
	const back = z0 + depth / 2;
	for ( const z of [ front + 0.1, back - 0.1 ] ) {

		parts.box( red, [ width, 0.08, 0.08 ], [ 0, deck - 0.45, z ] );
		parts.box( red, [ width, 0.08, 0.08 ], [ 0, deck - 0.1, z ] );
		for ( let i = 0; i <= 10; i ++ ) {

			const x = - width / 2 + i * width / 10;
			parts.rod( red, [ x, deck - 0.45, z ], [ x + ( i < 10 ? width / 10 : 0 ), deck - 0.1, z ], 0.025, 6 );

		}

	}

	parts.box( deckPaint, [ width, 0.05, depth ], [ 0, deck - 0.05, z0 ] );
	const rail = [ [ - width / 2, back ], [ - width / 2, front ], [ width / 2, front ], [ width / 2, back ], [ 0.6, back ] ];
	guardrail( parts, galv, rail, deck, 1.1, 1.25 );
	guardrail( parts, galv, [ [ - 0.6, back ], [ - width / 2 + 0.02, back ] ], deck, 1.1, 1.25 );
	for ( const z of [ front, back ] ) parts.box( mat( 0xf2b200, { roughness: 0.6 } ), [ width, 0.15, 0.02 ], [ 0, deck, z ] );
	for ( const x of [ - width / 2, width / 2 ] ) parts.box( mat( 0xf2b200, { roughness: 0.6 } ), [ 0.02, 0.15, depth ], [ x, deck, z0 ] );

	// Drive unit: the carriage on the mast between the deck and the mast, its side plates round the
	// mast, and the two motor gearboxes on its front, above the deck.
	parts.box( red, [ 1.2, 1.5, 0.2 ], [ 0, deck - 0.5, back - 0.1 ] );
	for ( const x of [ - 0.5, 0.5 ] ) parts.box( red, [ 0.1, 1.5, 0.95 ], [ x, deck - 0.5, back + 0.45 ] );
	for ( const x of [ - 0.3, 0.3 ] ) parts.rod( mat( 0x3a4e8a, { roughness: 0.5, metalness: 0.2 } ), [ x - 0.22, deck + 0.75, back - 0.32 ], [ x + 0.22, deck + 0.75, back - 0.32 ], 0.12, 12 );
	parts.box( mat( 0x2c2e31, { roughness: 0.7 } ), [ 0.4, 0.5, 0.2 ], [ 0.9, deck, front + 0.15 ] ); // control box

	return parts.build();

}

// --- compaction ------------------------------------------------------------------------------

// A forward plate compactor with a 20 in plate (about 0.5 m wide, 0.95 m high to the handle and
// 1.2 m long with it): the cast plate with its upturned leading edge, the exciter, the rubber
// mounts, the small petrol engine and belt guard under a lifting cage, and the handle folded back.
function plateCompactor() {

	const parts = new Parts();
	const body = paint( 0xe8b51e );
	const dark = DARK();
	const steel = STEEL();
	const width = 20 * IN;

	// Plate and exciter.
	parts.box( steel, [ width, 0.025, 0.5 ], [ 0, 0, 0.05 ] );
	parts.block( steel, [ width, 0.025, 0.12 ], [ 0, 0.047, - 0.23 ], [ - 0.6, 0, 0 ] );
	parts.box( dark, [ width - 0.04, 0.1, 0.42 ], [ 0, 0.025, 0.05 ] );
	parts.rod( dark, [ - 0.17, 0.15, - 0.05 ], [ 0.17, 0.15, - 0.05 ], 0.07, 12 );
	for ( const x of [ - 0.17, 0.17 ] ) for ( const z of [ - 0.12, 0.22 ] ) parts.cylinder( RUBBER(), 0.035, 0.07, [ x, 0.125, z ], 10 );

	// Upper deck, engine, fuel tank, air filter and belt guard.
	parts.box( body, [ 0.44, 0.025, 0.48 ], [ 0, 0.195, 0.05 ] );
	parts.box( mat( 0xb3262a, { roughness: 0.5, metalness: 0.2 } ), [ 0.3, 0.22, 0.28 ], [ 0.03, 0.22, 0.05 ] );
	parts.box( mat( 0xb3262a, { roughness: 0.5, metalness: 0.2 } ), [ 0.22, 0.09, 0.18 ], [ 0.05, 0.44, 0.08 ] );
	parts.box( dark, [ 0.1, 0.12, 0.14 ], [ - 0.08, 0.36, - 0.1 ] );
	parts.rod( dark, [ 0.18, 0.33, 0.05 ], [ 0.2, 0.33, 0.05 ], 0.07, 14 ); // recoil starter
	parts.box( body, [ 0.05, 0.22, 0.42 ], [ - 0.17, 0.12, 0.0 ] );

	// Lifting cage over the engine with its hook point.
	for ( const z of [ - 0.12, 0.2 ] ) parts.path( dark, [ [ - 0.21, 0.2, z ], [ - 0.21, 0.55, z ], [ 0.21, 0.55, z ], [ 0.21, 0.2, z ] ], 0.013, 6 );
	parts.rod( dark, [ 0, 0.55, - 0.12 ], [ 0, 0.55, 0.2 ], 0.013, 6 );
	parts.path( dark, [ [ 0, 0.55, 0.0 ], [ 0, 0.6, 0.0 ], [ 0, 0.6, 0.06 ], [ 0, 0.55, 0.06 ] ], 0.01, 6 );

	// Handle on rubber-mounted pivots, angled back and up to the grip.
	for ( const s of [ - 1, 1 ] ) {

		parts.box( dark, [ 0.04, 0.08, 0.06 ], [ s * 0.17, 0.2, 0.27 ] );
		parts.rod( dark, [ s * 0.17, 0.25, 0.28 ], [ s * 0.2, 0.92, 0.95 ], 0.014, 8 );

	}

	parts.rod( dark, [ - 0.21, 0.92, 0.95 ], [ 0.21, 0.92, 0.95 ], 0.014, 8 );
	parts.rod( RUBBER(), [ - 0.18, 0.92, 0.95 ], [ 0.18, 0.92, 0.95 ], 0.02, 10 );
	parts.rod( dark, [ - 0.19, 0.6, 0.62 ], [ 0.19, 0.6, 0.62 ], 0.012, 6 );

	return parts.build();

}

// A rammer (jumping jack) of the 130-150 lb class with an 11 in shoe: the laminated shoe, the
// rubber bellows over the ram, the leg housing, the engine on top and the guide handle round it.
function rammer() {

	const parts = new Parts();
	const body = paint( 0xe8b51e );
	const dark = DARK();
	const steel = STEEL();

	// Shoe: steel foot plate on a hardwood sole.
	parts.box( mat( 0x6b4a2b, { roughness: 0.9 } ), [ 11 * IN, 0.03, 13.4 * IN ], [ 0, 0, 0 ] );
	parts.box( steel, [ 11 * IN, 0.025, 13.4 * IN ], [ 0, 0.03, 0 ] );
	parts.box( steel, [ 0.16, 0.06, 0.16 ], [ 0, 0.055, 0 ] );

	// Bellows with its ribs, then the leg housing.
	parts.cylinder( RUBBER(), 0.08, 0.32, [ 0, 0.1, 0 ], 14 );
	for ( let i = 0; i < 6; i ++ ) parts.cylinder( RUBBER(), 0.095, 0.022, [ 0, 0.13 + i * 0.05, 0 ], 14 );
	parts.cylinder( body, 0.11, 0.18, [ 0, 0.42, 0 ], 14, 0.085 );

	// Crankcase and engine on top, fuel tank and air cleaner.
	parts.box( body, [ 0.26, 0.12, 0.24 ], [ 0, 0.58, 0 ] );
	parts.box( mat( 0xb3262a, { roughness: 0.5, metalness: 0.2 } ), [ 0.28, 0.2, 0.26 ], [ 0, 0.7, 0.02 ] );
	parts.box( dark, [ 0.18, 0.08, 0.16 ], [ 0, 0.9, 0.05 ] );
	parts.rod( dark, [ - 0.15, 0.8, 0.0 ], [ - 0.17, 0.8, 0.0 ], 0.06, 12 );

	// Guide handle: a loop round the engine, mounted low at the front and reaching back for the grip.
	const loop = [ [ - 0.2, 0.6, - 0.1 ], [ - 0.2, 0.92, - 0.05 ], [ - 0.22, 0.98, 0.4 ], [ 0.22, 0.98, 0.4 ], [ 0.2, 0.92, - 0.05 ], [ 0.2, 0.6, - 0.1 ] ];
	parts.path( dark, loop, 0.014, 8 );
	parts.rod( RUBBER(), [ - 0.17, 0.98, 0.4 ], [ 0.17, 0.98, 0.4 ], 0.02, 10 );
	for ( const s of [ - 1, 1 ] ) parts.box( RUBBER(), [ 0.05, 0.06, 0.06 ], [ s * 0.17, 0.57, - 0.1 ] );

	return parts.build();

}

// --- ground protection -----------------------------------------------------------------------

const MAT_LENGTH = 16 * FT;
const MAT_WIDTH = 4 * FT;
const MAT_THICK = 8 * IN;

// One 4 x 16 ft crane mat of six 8 x 8 in hardwood timbers bolted through side to side, the bolt
// heads and nuts set flush in the outer faces. `y` and `shift` place it in a stack.
function craneMatParts( parts, y = 0, shift = [ 0, 0 ] ) {

	const woods = [ mat( 0x7a5c3c, { roughness: 0.95 } ), mat( 0x6c5034, { roughness: 0.95 } ), mat( 0x86684a, { roughness: 0.95 } ) ];
	const timber = MAT_WIDTH / 6;
	for ( let i = 0; i < 6; i ++ ) parts.box( woods[ ( i * 2 + ( y > 0 ? 1 : 0 ) ) % 3 ], [ timber - 0.004, MAT_THICK, MAT_LENGTH ], [ shift[ 0 ] - MAT_WIDTH / 2 + timber * ( i + 0.5 ), y, shift[ 1 ] ] );
	const steel = mat( 0x4a4642, { roughness: 0.7, metalness: 0.4 } );
	for ( let i = 0; i < 8; i ++ ) {

		const z = shift[ 1 ] - MAT_LENGTH / 2 + 0.3 + i * ( MAT_LENGTH - 0.6 ) / 7;
		for ( const s of [ - 1, 1 ] ) parts.rod( steel, [ shift[ 0 ] + s * MAT_WIDTH / 2, y + MAT_THICK / 2, z ], [ shift[ 0 ] + s * ( MAT_WIDTH / 2 + 0.002 ), y + MAT_THICK / 2, z ], 0.025, 6 );

	}

}

function craneMat() {

	const parts = new Parts();
	craneMatParts( parts );
	return parts.build();

}

// Six mats stacked straight up, each a little off square as they're set down.
function craneMatStack() {

	const parts = new Parts();
	const shifts = [ [ 0, 0 ], [ 0.03, - 0.05 ], [ - 0.02, 0.04 ], [ 0.04, 0.02 ], [ - 0.03, - 0.03 ], [ 0.01, 0.06 ] ];
	shifts.forEach( ( shift, i ) => craneMatParts( parts, i * MAT_THICK, shift ) );
	return parts.build();

}

// A composite (HDPE) access mat, 8 x 14 ft and about 4 in thick, with a traction pattern moulded
// in the top and the locking-pin holes round the edges. (Real ones are two layers offset to make
// overlapping lips; this one is square-edged so a row of them butts together.)
function accessMat() {

	const parts = new Parts();
	const width = 8 * FT;
	const length = 14 * FT;
	const thick = 4 * IN;
	const plastic = mat( 0x2b2c2b, { roughness: 0.85 } );
	parts.box( plastic, [ width, thick, length ], [ 0, 0, 0 ] );
	parts.box( mat( 0x1f201f, { roughness: 0.85 } ), [ width + 0.002, 0.006, length + 0.002 ], [ 0, thick / 2, 0 ] ); // the layers' joint
	const top = drawn( 'access mat top', [ 256, 448 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#2b2c2b';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#3d3e3c';
		const cell = 16;
		for ( let y = 0; y < h; y += cell ) {

			for ( let x = 0; x < w; x += cell ) {

				ctx.fillRect( x + 3, y + 3, cell - 6, 3 );
				ctx.fillRect( x + 3, y + cell - 6, cell - 6, 3 );

			}

		}

	}, { roughness: 0.85 } );
	parts.add( top, new PlaneGeometry( width, length ), _m.makeRotationX( - Math.PI / 2 ).setPosition( 0, thick + 0.002, 0 ) );
	const hole = mat( 0x0e0f0f, { roughness: 1 } );
	for ( const [ x, z ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ], [ - 1, 0 ], [ 1, 0 ], [ 0, - 1 ], [ 0, 1 ] ] ) {

		parts.cylinder( hole, 0.045, 0.004, [ x * ( width / 2 - 0.15 ), thick, z * ( length / 2 - 0.15 ) ], 12 );

	}

	return parts.build();

}

const PLATE = [ 8 * FT, 1 * IN, 20 * FT ];

// One 8 x 20 ft x 1 in steel road plate with a pick hole near each end. `y` and `shift` place it
// in a stack.
function plateParts( parts, y = 0, shift = [ 0, 0 ] ) {

	const steel = mat( 0x5b524a, { roughness: 0.75, metalness: 0.45 } );
	const edge = mat( 0x6e4b33, { roughness: 0.9, metalness: 0.2 } ); // rusty cut edges
	parts.box( steel, PLATE, [ shift[ 0 ], y, shift[ 1 ] ] );
	parts.box( edge, [ PLATE[ 0 ] + 0.002, PLATE[ 1 ] * 0.6, PLATE[ 2 ] + 0.002 ], [ shift[ 0 ], y + PLATE[ 1 ] * 0.2, shift[ 1 ] ] );
	for ( const s of [ - 1, 1 ] ) parts.cylinder( BLACK(), 0.04, 0.003, [ shift[ 0 ], y + PLATE[ 1 ], shift[ 1 ] + s * ( PLATE[ 2 ] / 2 - 0.3 ) ], 12 );

}

function roadPlate() {

	const parts = new Parts();
	plateParts( parts );
	return parts.build();

}

// Eight plates on three timber sleepers, as they're stocked in a yard.
function roadPlateStack() {

	const parts = new Parts();
	const sleeper = 4 * IN;
	for ( const z of [ - 2.6, 0, 2.6 ] ) parts.box( mat( 0x7a5c3c, { roughness: 0.95 } ), [ PLATE[ 0 ] + 0.2, sleeper, 4 * IN ], [ 0, 0, z ] );
	const shifts = [ [ 0, 0 ], [ 0.02, - 0.04 ], [ - 0.03, 0.03 ], [ 0.01, 0.05 ], [ - 0.02, - 0.02 ], [ 0.03, 0.01 ], [ - 0.01, - 0.05 ], [ 0.02, 0.03 ] ];
	shifts.forEach( ( shift, i ) => plateParts( parts, sleeper + i * PLATE[ 1 ], shift ) );
	return parts.build();

}

// --- rebar bender and cutter -----------------------------------------------------------------

// A portable electric rebar bender or cutter (the #8 / 25 mm class) bolted on a 4 x 2 ft steel
// work bench, with a few bars lying on it. The bender has its round bending table and pins on
// top; the cutter its blade jaw at the front.
function rebarBench( kind ) {

	const parts = new Parts();
	const frame = paint( 0x3a4e8a );
	const top = mat( 0x5d6166, { roughness: 0.6, metalness: 0.5 } );
	const machine = paint( kind === 'bender' ? 0xd8461e : 0x2f7d4a );
	const dark = DARK();
	const steel = STEEL();
	const height = 34 * IN;
	const length = 4 * FT;
	const depth = 2 * FT;

	// Bench: legs, a shelf and the top.
	for ( const x of [ - length / 2 + 0.03, length / 2 - 0.03 ] ) for ( const z of [ - depth / 2 + 0.03, depth / 2 - 0.03 ] ) parts.box( frame, [ 0.05, height - 0.01, 0.05 ], [ x, 0, z ] );
	parts.box( frame, [ length - 0.06, 0.03, depth - 0.06 ], [ 0, 0.18, 0 ] );
	parts.box( top, [ length, 0.012, depth ], [ 0, height - 0.012, 0 ] );
	parts.box( frame, [ length, 0.06, depth ], [ 0, height - 0.07, 0 ] );

	// The machine: motor housing with a switch box and cord.
	const y = height;
	parts.box( machine, [ 0.42, 0.24, 0.32 ], [ - 0.2, y, 0 ] );
	parts.rod( machine, [ 0.01, y + 0.13, 0 ], [ 0.2, y + 0.13, 0 ], 0.09, 14 ); // motor
	parts.box( dark, [ 0.08, 0.1, 0.06 ], [ - 0.3, y + 0.24, - 0.1 ] );
	parts.path( BLACK(), [ [ 0.2, y + 0.13, 0 ], [ 0.3, y + 0.05, 0.05 ], [ 0.5, y + 0.01, 0.2 ] ], 0.007, 6 );
	if ( kind === 'bender' ) {

		parts.cylinder( steel, 0.14, 0.03, [ - 0.2, y + 0.24, 0 ], 24 );
		parts.cylinder( dark, 0.025, 0.06, [ - 0.2, y + 0.27, 0 ], 10 ); // centre pin
		parts.cylinder( dark, 0.025, 0.06, [ - 0.1, y + 0.27, - 0.04 ], 10 ); // bending roller
		parts.box( steel, [ 0.06, 0.06, 0.08 ], [ - 0.36, y + 0.24, 0.06 ] ); // stopper
		parts.rod( mat( 0x6a4a35, { roughness: 0.7, metalness: 0.4 } ), [ - 0.85, y + 0.29, - 0.02 ], [ - 0.2, y + 0.29, - 0.02 ], 0.0125, 6 );

	} else {

		parts.box( steel, [ 0.12, 0.12, 0.1 ], [ - 0.2, y + 0.24, - 0.12 ] );
		parts.box( dark, [ 0.02, 0.08, 0.1 ], [ - 0.2, y + 0.26, - 0.12 ] ); // blades
		parts.rod( mat( 0x6a4a35, { roughness: 0.7, metalness: 0.4 } ), [ - 0.75, y + 0.3, - 0.12 ], [ 0.0, y + 0.3, - 0.12 ], 0.0125, 6 );

	}

	// Spare bars on the bench and a cut-off bin underneath.
	for ( let i = 0; i < 4; i ++ ) parts.rod( mat( 0x6a4a35, { roughness: 0.7, metalness: 0.4 } ), [ 0.05, y + 0.0125, 0.2 - i * 0.03 ], [ 0.58, y + 0.0125, 0.2 - i * 0.03 ], 0.0125, 6 );
	parts.box( dark, [ 0.5, 0.3, 0.35 ], [ 0.25, 0.21, 0 ] );

	return parts.build();

}
