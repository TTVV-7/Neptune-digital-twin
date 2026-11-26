import { Box3, CylinderGeometry, DoubleSide, ExtrudeGeometry, Matrix4, Shape, Vector2, Vector3 } from 'three';
import { FT, GALVANISED, GLASS, IN, mat, Parts, RUBBER } from './parts.js';

// A portable ready-mix batch plant and its pieces, the tools for placing and finishing concrete,
// and formwork and shoring, built in code at real North American sizes. Like the other built-in
// pieces each stands on y = 0 with its front facing -Z (+X on its right).

const _m = new Matrix4();

export const BATCH_PLANT_ITEMS = [
	{ id: 'batch-plant-portable', name: 'Portable ready-mix batch plant (10 yd³ batch, 4-bin, 2 × 12 ft cement silos)', category: 'Concrete & batching',
		keywords: 'batch plant concrete ready mix readymix transit mix dry batch portable aggregate bin conveyor cement silo charging chute truck loading',
		build: batchPlant },
	{ id: 'aggregate-bin-4', name: 'Aggregate bin, 4-compartment with conveyor (4 × 25 yd³)', category: 'Concrete & batching',
		keywords: 'aggregate bin feeder hopper sand gravel stone batch plant conveyor belt collector',
		build: aggregateBinItem },
	{ id: 'cement-silo-horizontal', name: 'Cement silo, portable low-profile trailer (45 ft, ~600 bbl)', category: 'Concrete & batching',
		keywords: 'cement silo horizontal portable low profile trailer fly ash screw conveyor batch plant bulk powder',
		build: horizontalSilo },
	{ id: 'concrete-buggy-16cf', name: 'Concrete power buggy, ride-on (16 ft³)', category: 'Concrete & batching',
		keywords: 'concrete buggy power buggy georgia buggy ride-on dumper wheelbarrow pour',
		build: powerBuggy },
	{ id: 'power-trowel-36', name: 'Power trowel, walk-behind (36 in)', category: 'Concrete & batching',
		keywords: 'power trowel helicopter walk behind float finish concrete slab finisher',
		build: walkTrowel },
	{ id: 'power-trowel-ride-on', name: 'Power trowel, ride-on (2 × 46 in rotors)', category: 'Concrete & batching',
		keywords: 'ride-on power trowel ride on helicopter float finish concrete slab finisher',
		build: rideOnTrowel },
	{ id: 'laser-screed-boom', name: 'Laser screed, boom type (Somero S-22E type, 12 ft head, 20 ft reach)', category: 'Concrete & batching',
		keywords: 'laser screed somero slab floor concrete strike off screed boom',
		build: laserScreed },
	{ id: 'gang-form-8x24', name: 'Gang form wall panel, standing (8 × 24 ft, walers, strongbacks, braces)', category: 'Concrete & batching',
		keywords: 'gang form wall form formwork panel walers strongbacks pipe brace push pull concrete wall',
		build: gangForm },
	{ id: 'column-form-24in', name: 'Column form, steel (24 in square, 12 ft, with platform)', category: 'Concrete & batching',
		keywords: 'column form steel formwork square column pour platform braces',
		build: columnForm },
	{ id: 'form-panel-stack', name: 'Form panels on dunnage (2 × 8 ft, 2 stacks of 16)', category: 'Concrete & batching',
		keywords: 'form panels formwork stack symons steel-ply dunnage laydown',
		build: formPanelStack },
	{ id: 'shoring-frame-tower', name: 'Shoring frame tower (4 × 7 ft, 2 frames high, screw jacks, U-heads, ~4.4 m)', category: 'Shoring',
		keywords: 'shoring frame tower falsework scaffold frames screw jack u-head base plate reshoring slab formwork',
		build: shoringTower },
];

// --- shared materials ------------------------------------------------------------------------

const PAINT = () => mat( 0x46607a, { roughness: 0.55, metalness: 0.3 } ); // plant steel, grey-blue
const SILO = () => mat( 0xe4e3de, { roughness: 0.5, metalness: 0.25 } );
const RAIL = () => mat( 0xe3b022, { roughness: 0.5, metalness: 0.2 } ); // safety-yellow handrails
const YELLOW = () => mat( 0xe8b320, { roughness: 0.5, metalness: 0.2 } );
const DARK = () => mat( 0x2c2e31, { roughness: 0.7, metalness: 0.2 } );
const STEEL = () => mat( 0x8a8f94, { roughness: 0.5, metalness: 0.6 } );
const BELT = () => mat( 0x1d1e20, { roughness: 0.9 } );
const GRATING = () => mat( 0x6d7276, { roughness: 0.7, metalness: 0.4 } );
const CONCRETE = () => mat( 0x9b9890, { roughness: 0.95 } );
const AGGREGATES = [ 0xc4a26c, 0x8a8782, 0xa0978a, 0x7c7975 ]; // sand, 3/4 in stone, pea gravel, 1 1/2 in stone

const dist = ( a, b ) => Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ], b[ 2 ] - a[ 2 ] );
const lerp = ( a, b, t ) => a.map( ( v, i ) => v + ( b[ i ] - v ) * t );
const up = ( p, h ) => [ p[ 0 ], p[ 1 ] + h, p[ 2 ] ];

// --- helpers ---------------------------------------------------------------------------------

// A guardrail along the points (at deck level): posts no more than 1.8 m apart, a top rail at
// 42 in and a mid rail. Posts stay vertical on a slope.
function railing( parts, material, points, height = 1.07 ) {

	for ( let i = 1; i < points.length; i ++ ) {

		const [ a, b ] = [ points[ i - 1 ], points[ i ] ];
		const n = Math.max( 1, Math.ceil( dist( a, b ) / 1.8 ) );
		for ( let j = i > 1 ? 1 : 0; j <= n; j ++ ) {

			const p = lerp( a, b, j / n );
			parts.rod( material, p, up( p, height ), 0.021, 6 );

		}

		parts.rod( material, up( a, height ), up( b, height ), 0.021, 6 );
		parts.rod( material, up( a, height / 2 ), up( b, height / 2 ), 0.016, 6 );

	}

}

// A fixed steel ladder from y0 to y1 on a face at [ x, z ], standing off it towards `out` (a
// unit [ dx, dz ]), its stiles carried on 1 m past the top as grab rails; `cage` adds the hoops
// from 2.2 m up.
function ladder( parts, material, [ x, z ], [ ox, oz ], y0, y1, cage = false ) {

	const [ sx, sz ] = [ - oz, ox ];
	const half = 0.23;
	const [ cx, cz ] = [ x + ox * 0.2, z + oz * 0.2 ];
	const at = ( s, y ) => [ cx + sx * s, y, cz + sz * s ];
	for ( const s of [ - half, half ] ) {

		parts.rod( material, at( s, y0 ), at( s, y1 + 1 ), 0.025, 6 );
		parts.rod( material, at( s, y1 ), [ x + sx * s, y1, z + sz * s ], 0.02, 6 ); // tie back to the face

	}

	for ( let y = y0 + 0.3; y < y1 + 0.05; y += 0.3 ) parts.rod( material, at( - half, y ), at( half, y ), 0.012, 5 );
	if ( ! cage || y1 - y0 < 3 ) return;

	const r = 0.36;
	const hoop = ( a, y ) => [ cx + sx * Math.cos( a ) * r + ox * Math.sin( a ) * r, y, cz + sz * Math.cos( a ) * r + oz * Math.sin( a ) * r ];
	const levels = [];
	for ( let y = y0 + 2.2; y < y1 + 1; y += 0.9 ) levels.push( y );
	levels.push( y1 + 1 );
	for ( const y of levels ) {

		const points = [];
		for ( let k = 0; k <= 8; k ++ ) points.push( hoop( Math.PI * k / 8, y ) );
		parts.path( material, points, 0.012, 5, false );

	}

	for ( const a of [ Math.PI * 0.2, Math.PI * 0.5, Math.PI * 0.8 ] ) parts.rod( material, hoop( a, levels[ 0 ] ), hoop( a, levels[ levels.length - 1 ] ), 0.01, 4 );

}

// A steel stair rising from [ x, 0, z0 ] to the landing height y1 at z1, `width` wide, with
// handrails both sides.
function stair( parts, { frame, tread, rail }, x, z0, z1, y1, width = 0.9 ) {

	for ( const s of [ - width / 2, width / 2 ] ) {

		parts.rod( frame, [ x + s, 0, z0 ], [ x + s, y1, z1 ], 0.05, 4 );
		railing( parts, rail, [ [ x + s, 0, z0 ], [ x + s, y1, z1 ] ], 0.9 );

	}

	const steps = Math.round( y1 / 0.19 );
	for ( let i = 1; i < steps; i ++ ) {

		const t = i / steps;
		parts.box( tread, [ width, 0.03, 0.26 ], [ x, y1 * t - 0.03, z0 + ( z1 - z0 ) * t ] );

	}

}

// A tyre with its hub, across x, centred on [ x, y, z ].
function wheel( parts, [ x, y, z ], radius, width, hub = STEEL() ) {

	parts.rod( RUBBER(), [ x - width / 2, y, z ], [ x + width / 2, y, z ], radius, 18 );
	parts.rod( hub, [ x - width / 2 - 0.004, y, z ], [ x + width / 2 + 0.004, y, z ], radius * 0.55, 12 );

}

// An open square frustum (hopper) from y0, where it's `k` times smaller, to y1 where it's [ w, d ].
function hopper( parts, material, [ w, d ], k, y0, y1, x, z ) {

	const r = Math.SQRT1_2;
	const geometry = new CylinderGeometry( r, r * k, y1 - y0, 4, 1, true );
	geometry.rotateY( Math.PI / 4 );
	parts.add( material, geometry, _m.makeScale( w, 1, d ).setPosition( x, ( y0 + y1 ) / 2, z ) );

}

// An open round band (a trowel's guard ring) of `radius` and `height` with its base at y.
function band( parts, material, radius, height, [ x, y, z ] ) {

	parts.add( material, new CylinderGeometry( radius, radius, height, 32, 1, true ), _m.makeTranslation( x, y + height / 2, z ) );
	const lip = [];
	for ( let k = 0; k <= 32; k ++ ) lip.push( [ x + radius * Math.cos( k * Math.PI / 16 ), y + height, z + radius * Math.sin( k * Math.PI / 16 ) ] );
	parts.path( material, lip, 0.012, 5, false );

}

// A cross-section (points [ x, y ]) extruded along z from z0 to z1.
function extruded( parts, material, points, z0, z1 ) {

	const shape = new Shape( points.map( ( [ x, y ] ) => new Vector2( x, y ) ) );
	const geometry = new ExtrudeGeometry( shape, { depth: z1 - z0, bevelEnabled: false } );
	geometry.translate( 0, 0, z0 );
	parts.add( material, geometry );

}

// A belt conveyor from its tail a to its head b (both [ x, y, z ] at the top of the belt, at the
// same z): channel stringers, idlers every 1.2 m and the belt with aggregate on it, head and tail
// pulleys and a hood over the head. `truss` hangs a box truss of that depth under it (for a long
// incline), `walkway` a grated walkway with a handrail on its front side, `bents` [ t, ... ] puts
// a two-legged support at those fractions along it and `legs` short legs every 2.4 m.
function conveyor( parts, a, b, { width = 0.8, truss = 0, walkway = false, bents = [], legs = false, load = AGGREGATES[ 1 ] } = {} ) {

	const frame = PAINT();
	const [ dx, dy ] = [ b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] ];
	const length = Math.hypot( dx, dy );
	const angle = Math.atan2( dy, dx );
	const z = a[ 2 ];
	const half = width / 2 + 0.1;
	const at = ( t, down = 0, side = 0 ) => [ a[ 0 ] + dx * t, a[ 1 ] + dy * t - down, z + side ];
	const along = ( material, size, t, down, side = 0 ) => parts.block( material, size, at( t, down, side ), [ 0, 0, angle ] );

	along( BELT(), [ length, 0.025, width ], 0.5, 0.0125 );
	along( mat( load, { roughness: 1 } ), [ length - 0.8, 0.05, width * 0.45 ], 0.5, - 0.02 );
	for ( const s of [ - half, half ] ) along( frame, [ length, 0.2, 0.06 ], 0.5, 0.12, s );
	const idlers = Math.max( 2, Math.round( length / 1.2 ) );
	for ( let i = 1; i < idlers; i ++ ) {

		const p = at( i / idlers, 0.07 );
		parts.rod( STEEL(), [ p[ 0 ], p[ 1 ], z - half ], [ p[ 0 ], p[ 1 ], z + half ], 0.045, 6 );

	}

	for ( const t of [ 0, 1 ] ) {

		const p = at( t, 0.17 );
		parts.rod( DARK(), [ p[ 0 ], p[ 1 ], z - width / 2 - 0.04 ], [ p[ 0 ], p[ 1 ], z + width / 2 + 0.04 ], 0.17, 14 );

	}

	// Head hood and the drive motor on its back side.
	const head = at( 1, 0 );
	parts.box( frame, [ 0.7, 0.55, width + 0.3 ], [ head[ 0 ] + 0.1, head[ 1 ] - 0.05, z ] );
	parts.box( DARK(), [ 0.45, 0.35, 0.35 ], [ head[ 0 ] - 0.25, head[ 1 ] - 0.35, z + half + 0.25 ] );

	if ( truss ) {

		const panels = Math.max( 2, Math.round( length / 1.8 ) );
		for ( const s of [ - half, half ] ) {

			parts.rod( frame, at( 0, truss, s ), at( 1, truss, s ), 0.045, 6 );
			for ( let i = 0; i <= panels; i ++ ) {

				const t = i / panels;
				parts.rod( frame, at( t, 0.2, s ), at( t, truss, s ), 0.03, 5 );
				if ( i < panels ) parts.rod( frame, at( i % 2 ? t : t + 1 / panels, 0.2, s ), at( i % 2 ? t + 1 / panels : t, truss, s ), 0.025, 5 );

			}

		}

		for ( let i = 0; i <= panels; i ++ ) parts.rod( frame, at( i / panels, truss, - half ), at( i / panels, truss, half ), 0.025, 5 );

	}

	if ( walkway ) {

		const out = - half - 0.42;
		along( GRATING(), [ length, 0.04, 0.75 ], 0.5, 0.3, out );
		railing( parts, RAIL(), [ at( 0, 0.28, out - 0.36 ), at( 1, 0.28, out - 0.36 ) ] );

	}

	const deep = Math.max( truss, 0.2 );
	for ( const t of bents ) {

		const top = at( t, deep );
		for ( const s of [ - half, half ] ) {

			parts.box( frame, [ 0.16, top[ 1 ], 0.16 ], [ top[ 0 ], 0, z + s ] );
			parts.box( frame, [ 0.4, 0.02, 0.4 ], [ top[ 0 ], 0, z + s ] );

		}

		parts.rod( frame, [ top[ 0 ], 0.3, z - half ], [ top[ 0 ], top[ 1 ] - 0.1, z + half ], 0.03, 5 );
		parts.rod( frame, [ top[ 0 ], 0.3, z + half ], [ top[ 0 ], top[ 1 ] - 0.1, z - half ], 0.03, 5 );

	}

	if ( legs ) {

		const n = Math.max( 1, Math.round( length / 2.4 ) );
		for ( let i = 0; i <= n; i ++ ) {

			const p = at( i / n, 0.22 );
			for ( const s of [ - half, half ] ) parts.box( frame, [ 0.08, p[ 1 ], 0.08 ], [ p[ 0 ], 0, z + s ] );

		}

	}

}

// An in-line aggregate bin of `n` compartments, each `cw` wide and `depth` deep, from x0 along +X
// at z: legs and a skid frame, a hopper bottom with a gate under each compartment, straight sides
// up to `top`, heaped aggregate in each, and the collector belt running under the gates.
// Returns the x where the collector belt delivers.
function aggregateBin( parts, x0, z, { n = 4, cw = 2.8, depth = 3.6, top = 3.6 } = {} ) {

	const frame = PAINT();
	const plate = mat( 0x46607a, { roughness: 0.55, metalness: 0.3, side: DoubleSide } );
	const length = n * cw;
	const knee = 2.1; // where the straight sides meet the hopper

	// Skids along the ground and the legs at each divider.
	for ( const s of [ - depth / 2, depth / 2 ] ) {

		parts.box( frame, [ length + 0.4, 0.3, 0.25 ], [ x0 + length / 2, 0, z + s ] );
		for ( let i = 0; i <= n; i ++ ) parts.box( frame, [ 0.22, knee, 0.22 ], [ x0 + i * cw, 0.3, z + s ] );
		for ( let i = 0; i < n; i ++ ) {

			parts.rod( frame, [ x0 + i * cw, 0.35, z + s ], [ x0 + ( i + 0.5 ) * cw, knee - 0.1, z + s ], 0.035, 5 );
			parts.rod( frame, [ x0 + ( i + 1 ) * cw, 0.35, z + s ], [ x0 + ( i + 0.5 ) * cw, knee - 0.1, z + s ], 0.035, 5 );

		}

	}

	// Straight sides, the end walls and dividers, a rim angle and stiffeners on the long sides.
	const side = top - knee;
	for ( const s of [ - depth / 2, depth / 2 ] ) {

		parts.box( plate, [ length, side, 0.05 ], [ x0 + length / 2, knee, z + s ] );
		parts.box( frame, [ length + 0.1, 0.1, 0.12 ], [ x0 + length / 2, top - 0.1, z + s ] );
		for ( let i = 0; i <= n * 2; i ++ ) parts.box( frame, [ 0.08, side, 0.08 ], [ x0 + i * cw / 2, knee, z + s + Math.sign( s ) * 0.06 ] );

	}

	for ( let i = 0; i <= n; i ++ ) parts.box( plate, [ 0.05, side, depth ], [ x0 + i * cw, knee, z ] );

	// The hoppers, gates and the aggregate heaped in each compartment.
	for ( let i = 0; i < n; i ++ ) {

		const x = x0 + ( i + 0.5 ) * cw;
		hopper( parts, plate, [ cw, depth ], 0.22, 1.05, knee, x, z );
		parts.box( DARK(), [ 0.75, 0.14, 0.85 ], [ x, 0.92, z ] );
		parts.box( DARK(), [ 0.12, 0.2, 0.2 ], [ x + 0.45, 0.9, z ] ); // gate ram
		const fill = top - 0.4;
		const stone = mat( AGGREGATES[ i % AGGREGATES.length ], { roughness: 1 } );
		parts.box( stone, [ cw - 0.06, fill - knee, depth - 0.06 ], [ x, knee, z ] );
		parts.sphere( stone, 1, [ x, fill, z ], [ 14, 6 ], [ cw * 0.47, 0.55, depth * 0.47 ] );

	}

	// The collector belt under the gates, delivering past the +X end.
	const end = x0 + length + 0.5;
	conveyor( parts, [ x0 - 0.4, 0.62, z ], [ end, 0.62, z ], { width: 0.75, legs: true } );
	return end;

}

// A cement silo on four legs at [ x, z ]: a 60° cone down to the outlet, the shell up to
// `height`, a railed roof with its dust collector, the fill pipe down the side facing `pipe` and a
// caged ladder on the side facing `out`.
function silo( parts, [ x, z ], { radius = 6 * FT, legs = 5.4, height = 17.5, out = [ 1, 0 ], pipe = [ - 1, 0 ] } = {} ) {

	const shell = SILO();
	const frame = PAINT();
	const leg = radius * 0.72;
	const outlet = legs - ( radius - 0.2 ) * 1.0;

	for ( const [ lx, lz ] of [ [ - leg, - leg ], [ leg, - leg ], [ leg, leg ], [ - leg, leg ] ] ) {

		parts.box( frame, [ 0.25, legs + 0.3, 0.25 ], [ x + lx, 0, z + lz ] );
		parts.box( frame, [ 0.5, 0.03, 0.5 ], [ x + lx, 0, z + lz ] );

	}

	// X-bracing on each face of the legs and a ring beam at the top of them.
	for ( const [ a, b ] of [ [ [ - leg, - leg ], [ leg, - leg ] ], [ [ leg, - leg ], [ leg, leg ] ], [ [ leg, leg ], [ - leg, leg ] ], [ [ - leg, leg ], [ - leg, - leg ] ] ] ) {

		parts.rod( frame, [ x + a[ 0 ], 0.4, z + a[ 1 ] ], [ x + b[ 0 ], legs - 0.6, z + b[ 1 ] ], 0.04, 5 );
		parts.rod( frame, [ x + b[ 0 ], 0.4, z + b[ 1 ] ], [ x + a[ 0 ], legs - 0.6, z + a[ 1 ] ], 0.04, 5 );
		parts.rod( frame, [ x + a[ 0 ], legs, z + a[ 1 ] ], [ x + b[ 0 ], legs, z + b[ 1 ] ], 0.1, 4 );

	}

	parts.cylinder( shell, 0.2, legs - outlet, [ x, outlet, z ], 28, radius );
	parts.cylinder( DARK(), 0.16, 0.35, [ x, outlet - 0.35, z ], 10 ); // butterfly valve
	parts.cylinder( shell, radius, height - legs, [ x, legs, z ], 36 );
	for ( let y = legs + 0.05; y < height; y += 2.4 ) parts.cylinder( shell, radius + 0.02, 0.07, [ x, y, z ], 36 );
	parts.cylinder( shell, radius, 0.45, [ x, height, z ], 36, 0.35 );

	// Roof railing, dust collector and a manway.
	const roof = height + 0.15;
	const ring = [];
	for ( let k = 0; k <= 12; k ++ ) ring.push( [ x + ( radius - 0.08 ) * Math.cos( k * Math.PI / 6 ), roof, z + ( radius - 0.08 ) * Math.sin( k * Math.PI / 6 ) ] );
	railing( parts, RAIL(), ring );
	parts.box( SILO(), [ 0.9, 1.3, 0.9 ], [ x - 0.35 * out[ 0 ], roof + 0.1, z - 0.35 * out[ 1 ] ] );
	parts.box( DARK(), [ 0.5, 0.25, 0.5 ], [ x - 0.35 * out[ 0 ], roof + 1.4, z - 0.35 * out[ 1 ] ] );
	parts.cylinder( DARK(), 0.3, 0.12, [ x + 0.5 * out[ 1 ], roof + 0.1, z + 0.5 * out[ 0 ] ], 14 );

	// The 4 in fill pipe down the side, ending in a coupling at chest height for the tanker's hose.
	const [ px, pz ] = [ x + ( radius + 0.12 ) * pipe[ 0 ], z + ( radius + 0.12 ) * pipe[ 1 ] ];
	parts.path( STEEL(), [ [ x + 0.6 * pipe[ 0 ], height + 0.2, z + 0.6 * pipe[ 1 ] ], [ px, height + 0.2, pz ], [ px, 1.3, pz ] ], 0.055, 8 );
	parts.cylinder( DARK(), 0.075, 0.15, [ px, 1.15, pz ], 10 );

	ladder( parts, RAIL(), [ x + radius * out[ 0 ], z + radius * out[ 1 ] ], out, 0, height, true );

}

// An inclined cement screw conveyor (10 in tube) from a to b with flanges along it and the drive
// at its top end over the spout that drops out of it.
function screw( parts, a, b ) {

	const tube = SILO();
	const length = dist( a, b );
	parts.rod( tube, a, b, 0.14, 12 );
	const n = Math.round( length / 1.5 );
	for ( let i = 1; i < n; i ++ ) parts.rod( tube, lerp( a, b, i / n - 0.005 ), lerp( a, b, i / n + 0.005 ), 0.18, 12 );
	const end = lerp( a, b, 1 + 0.45 / length );
	parts.rod( DARK(), b, end, 0.17, 10 );
	parts.rod( DARK(), end, up( end, - 0.6 ), 0.12, 10 );
	parts.box( DARK(), [ 0.32, 0.3, 0.32 ], up( end, 0.12 ) );

}

// --- the portable batch plant ----------------------------------------------------------------

// A portable transit-mix (dry batch) plant of the 10-12 yd³ class set up for a big job: a
// 4-compartment low bin a loader charges from the front, its collector belt feeding a 20 m
// incline conveyor up to the charging hopper on the batch tower, two 12 ft cement silos screwing
// cement to the weigh batcher beside it, a water tank, and the elevated control house. Mixer
// trucks drive through the tower from the front (-Z) and stop with their hopper under the
// charging boot, 4.5 m up.
function batchPlant() {

	const parts = new Parts();
	const frame = PAINT();

	// The batch tower: four columns over a 4.75 m wide drive-through bay, 5.7 m clear under the
	// beams, braced along the sides only so the trucks pass.
	const [ cx, cz, deck ] = [ 2.5, 1.9, 6.0 ];
	for ( const x of [ - cx, cx ] ) {

		for ( const z of [ - cz, cz ] ) {

			parts.box( frame, [ 0.25, deck, 0.25 ], [ x, 0, z ] );
			parts.box( frame, [ 0.55, 0.03, 0.55 ], [ x, 0, z ] );

		}

		parts.rod( frame, [ x, 0.5, - cz ], [ x, deck - 0.5, cz ], 0.05, 5 );
		parts.rod( frame, [ x, 0.5, cz ], [ x, deck - 0.5, - cz ], 0.05, 5 );
		parts.box( frame, [ 0.25, 0.3, cz * 2 + 0.25 ], [ x, deck - 0.3, 0 ] );

		// Pipe bollards guarding the front columns.
		parts.cylinder( RAIL(), 0.11, 1.2, [ x - Math.sign( x ) * 0.45, 0, - cz - 0.5 ], 14 );

	}

	for ( const z of [ - cz, cz ] ) parts.box( frame, [ cx * 2 + 0.25, 0.3, 0.25 ], [ 0, deck - 0.3, z ] );
	parts.box( frame, [ cx * 2, 0.25, 0.2 ], [ 0, deck - 0.25, 0 ] );
	parts.box( GRATING(), [ cx * 2 + 0.6, 0.05, cz * 2 + 0.6 ], [ 0, deck, 0 ] );
	const d = deck + 0.05;
	const [ ex, ez ] = [ cx + 0.28, cz + 0.28 ];
	railing( parts, RAIL(), [ [ ex, d, - ez + 0.6 ], [ ex, d, ez ], [ - ex, d, ez ], [ - ex, d, 0.8 ] ] );
	railing( parts, RAIL(), [ [ - ex, d, - 0.8 ], [ - ex, d, - ez ], [ ex, d, - ez ] ] );
	ladder( parts, RAIL(), [ cx + 0.13, - cz ], [ 1, 0 ], 0, deck, true );

	// The charging boot over the truck's hopper (its rubber sock 4.5 m up), and the aggregate
	// charging hopper on the deck above it.
	parts.cylinder( SILO(), 0.35, 1.0, [ 0, 4.8, 0 ], 20, 0.85 );
	parts.cylinder( SILO(), 0.85, 0.2, [ 0, 5.8, 0 ], 20 );
	parts.cylinder( RUBBER(), 0.32, 0.3, [ 0, 4.5, 0 ], 16, 0.36 );
	parts.cylinder( SILO(), 0.45, 1.3, [ 0, d, 0 ], 20, 1.15 );
	parts.cylinder( frame, 1.17, 0.12, [ 0, d + 1.25, 0 ], 20 );

	// The cement weigh batcher on load cells beside it, its discharge into the hopper, and the
	// water meter and valve on the deck.
	const [ bx, by ] = [ 1.55, d + 1.2 ];
	for ( const [ lx, lz ] of [ [ - 0.5, - 0.5 ], [ 0.5, - 0.5 ], [ 0.5, 0.5 ], [ - 0.5, 0.5 ] ] ) parts.box( frame, [ 0.12, by - d + 0.4, 0.12 ], [ bx + lx, d, lz ] );
	parts.cylinder( SILO(), 0.15, 0.7, [ bx, by - 0.3, 0 ], 20, 0.7 );
	parts.cylinder( SILO(), 0.7, 1.4, [ bx, by + 0.4, 0 ], 20 );
	parts.cylinder( SILO(), 0.72, 0.08, [ bx, by + 1.8, 0 ], 20 );
	parts.rod( SILO(), [ bx, by - 0.25, 0 ], [ 0.75, by - 0.55, 0 ], 0.1, 10 );
	parts.box( DARK(), [ 0.5, 0.6, 0.4 ], [ - 1.6, d, 1.3 ] );

	// Two 12 ft cement silos to the right, 17.5 m to the roof, each screwing up to the batcher.
	for ( const z of [ - 1.75, 1.75 ] ) {

		silo( parts, [ 6.2, z ], { out: [ 1, 0 ], pipe: [ 0, Math.sign( z ) ] } );
		screw( parts, [ 6.2, 3.3, z ], [ bx + 0.25, by + 2.0, z * 0.2 ] );

	}

	// The aggregate bin to the left and the 20 m incline conveyor up to the charging hopper.
	const binStart = - 31.6;
	const end = aggregateBin( parts, binStart, 0 );
	const tail = [ end + 0.6, 1.05, 0 ];
	const head = [ - 0.35, deck + 1.95, 0 ];
	conveyor( parts, tail, head, { truss: 0.7, walkway: true, bents: [ 0.03, 0.33, 0.66 ] } );
	parts.box( SILO(), [ 0.9, 0.5, 0.9 ], [ end + 0.3, 0.55, 0 ] ); // transfer chute
	parts.box( frame, [ 0.15, 1.15, 0.15 ], [ - cx + 0.3, d, - 0.6 ] );
	parts.box( frame, [ 0.15, 1.15, 0.15 ], [ - cx + 0.3, d, 0.6 ] );

	// Water: a 6,000 gal tank on saddles behind the tower on the left, its pump, and the line
	// up the back column to the charging boot.
	const [ tx, tz ] = [ - 6.4, 4.4 ];
	parts.rod( SILO(), [ tx, 1.75, tz - 2.9 ], [ tx, 1.75, tz + 2.9 ], 1.25, 28 );
	for ( const z of [ tz - 2, tz + 2 ] ) parts.box( frame, [ 2.0, 0.75, 0.3 ], [ tx, 0, z ] );
	parts.box( DARK(), [ 0.8, 0.6, 0.6 ], [ tx + 1.9, 0, tz - 2.5 ] );
	parts.path( STEEL(), [ [ tx + 1.9, 0.45, tz - 2.5 ], [ - cx - 0.25, 0.45, cz + 0.2 ], [ - cx - 0.25, 5.3, cz + 0.2 ], [ - 0.6, 5.3, 0.5 ] ], 0.05, 8 );

	// The control house, raised so the batchman sees into the truck's hopper, on the left at the
	// front with its stair coming down to the front.
	const [ hx, hz, hy ] = [ - 5.4, - 2.8, 2.2 ];
	for ( const x of [ hx - 1.15, hx + 1.15 ] ) for ( const z of [ hz - 1.6, hz + 1.6 ] ) parts.box( frame, [ 0.15, hy, 0.15 ], [ x, 0, z ] );
	parts.box( GRATING(), [ 2.6, 0.1, 3.4 ], [ hx, hy - 0.1, hz ] );
	parts.box( SILO(), [ 2.4, 2.4, 2.9 ], [ hx, hy, hz + 0.2 ] );
	parts.box( frame, [ 2.6, 0.1, 3.3 ], [ hx, hy + 2.4, hz + 0.2 ] );
	parts.box( GLASS(), [ 0.02, 1.0, 2.3 ], [ hx + 1.21, hy + 1.0, hz + 0.2 ] );
	parts.box( GLASS(), [ 1.6, 1.0, 0.02 ], [ hx + 0.2, hy + 1.0, hz - 1.26 ] );
	parts.box( DARK(), [ 0.8, 2.0, 0.03 ], [ hx - 0.6, hy, hz - 1.26 ] );
	parts.box( SILO(), [ 0.7, 0.5, 0.5 ], [ hx - 1.55, hy + 1.4, hz + 0.6 ] ); // air conditioner
	railing( parts, RAIL(), [ [ hx - 1.28, hy, hz - 1.0 ], [ hx - 1.28, hy, hz - 1.68 ], [ hx + 1.28, hy, hz - 1.68 ], [ hx + 1.28, hy, hz - 1.3 ] ] );
	stair( parts, { frame, tread: GRATING(), rail: RAIL() }, hx - 1.75, hz - 4.6, hz - 1.3, hy, 0.85 );

	// A red / green signal on the back beam, facing the driver coming in.
	parts.box( DARK(), [ 0.3, 0.6, 0.2 ], [ - 1.2, deck - 0.95, cz - 0.1 ] );
	parts.sphere( mat( 0xd0201c, { emissive: 0x801010, emissiveIntensity: 0.5 } ), 0.08, [ - 1.2, deck - 0.5, cz - 0.21 ] );
	parts.sphere( mat( 0x2fc040, { emissive: 0x158025, emissiveIntensity: 0.7 } ), 0.08, [ - 1.2, deck - 0.78, cz - 0.21 ] );

	return centred( parts.build() );

}

// Moves a group's pieces so its footprint is centred on the origin (the app does too, but the
// sets lay members out around this middle).
function centred( group ) {

	const box = new Box3().setFromObject( group );
	const centre = box.getCenter( new Vector3() );
	for ( const child of group.children ) child.geometry.translate( - centre.x, 0, - centre.z );
	return group;

}

// The bin on its own, its collector belt feeding a 12 m incline conveyor out to the right that
// rises to 5 m, as set up to feed a plant or a stockpile.
function aggregateBinItem() {

	const parts = new Parts();
	const end = aggregateBin( parts, - 11.2, 0 );
	conveyor( parts, [ end + 0.6, 1.05, 0 ], [ end + 11.8, 5.1, 0 ], { truss: 0.6, walkway: true, bents: [ 0.03, 0.5, 0.95 ] } );
	parts.box( SILO(), [ 0.9, 0.5, 0.9 ], [ end + 0.3, 0.55, 0 ] );
	return centred( parts.build() );

}

// --- portable horizontal cement silo -------------------------------------------------------

// A low-profile portable cement silo trailer (45 ft, about 13 ft high on the road): a gooseneck
// at the front, the body with its V-trough bottom and screw down to near the ground, the tandem
// axles behind, the roof catwalk with fold-up rails, and the inclined discharge screw raised off
// the back as when it's set up feeding a plant.
function horizontalSilo() {

	const parts = new Parts();
	const body = SILO();
	const frame = DARK();
	const w = 2.59;
	const [ zf, zh, zb, zr ] = [ - 6.7, - 4.2, 4.2, 7.0 ]; // front, start of hopper, back of body, rear of frame
	const [ low, belly, roof ] = [ 0.5, 1.45, 4.0 ];

	// The body: full height over the gooseneck at the front, then over the trough.
	parts.box( body, [ w, roof - 1.55, zh - zf ], [ 0, 1.55, ( zf + zh ) / 2 ] );
	parts.box( body, [ w, roof - belly, zb - zh ], [ 0, belly, ( zh + zb ) / 2 ] );
	extruded( parts, body, [ [ - w / 2, belly ], [ - 0.25, low + 0.15 ], [ 0.25, low + 0.15 ], [ w / 2, belly ] ], zh, zb );
	parts.rod( frame, [ 0, low + 0.12, zh - 0.1 ], [ 0, low + 0.12, zb + 0.15 ], 0.15, 10 ); // the bottom screw
	for ( let z = zf + 0.3; z < zb; z += 0.75 ) for ( const s of [ - 1, 1 ] ) parts.box( body, [ 0.05, roof - 1.6, 0.1 ], [ s * ( w / 2 + 0.02 ), 1.6, z ] );
	parts.box( mat( 0x46607a, { roughness: 0.55, metalness: 0.3 } ), [ w + 0.02, 0.2, zb - zf + 0.02 ], [ 0, 2.4, ( zf + zb ) / 2 ] );

	// Gooseneck, king pin and the landing legs.
	parts.box( frame, [ 1.0, 0.3, 2.6 ], [ 0, 1.25, zf + 1.3 ] );
	parts.cylinder( STEEL(), 0.05, 0.1, [ 0, 1.15, zf + 0.9 ], 10 );
	for ( const s of [ - 0.75, 0.75 ] ) {

		parts.box( frame, [ 0.14, 1.3, 0.14 ], [ s, 0.1, zh + 0.4 ] );
		parts.box( frame, [ 0.35, 0.1, 0.35 ], [ s, 0, zh + 0.4 ] );

	}

	// The rear frame and tandem axles behind the trough.
	for ( const s of [ - 0.5, 0.5 ] ) parts.box( frame, [ 0.2, 0.35, zr - zb + 0.6 ], [ s, 0.95, ( zb + zr ) / 2 - 0.3 ] );
	for ( const z of [ 5.0, 6.25 ] ) {

		parts.rod( frame, [ - 1.1, 0.5, z ], [ 1.1, 0.5, z ], 0.07, 8 );
		for ( const s of [ - 1, 1 ] ) {

			wheel( parts, [ s * 0.78, 0.5, z ], 0.5, 0.26 );
			wheel( parts, [ s * 1.08, 0.5, z ], 0.5, 0.26 );

		}

	}

	parts.box( frame, [ w, 0.15, 0.15 ], [ 0, 0.85, zr ] );
	for ( const s of [ - 1, 1 ] ) parts.box( mat( 0xb3141b, { emissive: 0x7a0a0e, emissiveIntensity: 0.5 } ), [ 0.2, 0.08, 0.03 ], [ s * 1.0, 0.88, zr + 0.08 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ 0.62, 0.04, 2.6 ], [ s * 0.93, 1.08, 5.62 ] ); // fenders

	// Roof: catwalk with rails, manways, dust collector, and fill pipes down the right side.
	parts.box( GRATING(), [ 0.6, 0.04, zb - zf - 0.4 ], [ 0, roof, ( zf + zb ) / 2 ] );
	for ( const s of [ - 1, 1 ] ) railing( parts, RAIL(), [ [ s * ( w / 2 - 0.08 ), roof, zf + 0.3 ], [ s * ( w / 2 - 0.08 ), roof, zb - 0.3 ] ] );
	for ( const z of [ - 4, - 0.5, 3 ] ) parts.cylinder( frame, 0.3, 0.12, [ 0.75, roof, z ], 14 );
	parts.box( body, [ 0.9, 1.0, 0.9 ], [ - 0.7, roof, - 2.2 ] );
	for ( const z of [ - 2.5, 1.5 ] ) parts.path( STEEL(), [ [ 0.6, roof + 0.2, z ], [ w / 2 + 0.1, roof + 0.2, z ], [ w / 2 + 0.1, 1.1, z ] ], 0.05, 8 );
	ladder( parts, RAIL(), [ 0, zf ], [ 0, - 1 ], 1.2, roof, false );

	// The discharge screw, up at 50° off the back between the axles to 6 m.
	const a = [ 0, low + 0.12, zb + 0.1 ];
	const b = [ 0, 6.0, zb + 0.1 + ( 6.0 - a[ 1 ] ) / Math.tan( 50 * Math.PI / 180 ) ];
	screw( parts, a, b );

	return centred( parts.build() );

}

// --- concrete tools --------------------------------------------------------------------------

// A ride-on power buggy of the 16 ft³ class (about 2.7 m long, 36 in wide): the tipping bucket
// of concrete at the front over the drive wheels, the engine in the middle, and the operator's
// standing platform at the back under a guard frame.
function powerBuggy() {

	const parts = new Parts();
	const yellow = YELLOW();
	const dark = DARK();
	const width = 36 * IN;

	parts.box( dark, [ 0.74, 0.2, 2.1 ], [ 0, 0.3, 0.15 ] );
	parts.prism( yellow, [ [ - 0.22, 0.5 ], [ - 1.0, 0.5 ], [ - 1.38, 1.0 ], [ - 0.22, 1.0 ] ], width );
	for ( const s of [ - 1, 1 ] ) parts.box( yellow, [ 0.03, 0.05, 1.18 ], [ s * ( width / 2 - 0.015 ), 1.0, - 0.79 ] );
	parts.box( yellow, [ width, 0.05, 0.03 ], [ 0, 1.0, - 0.235 ] );
	parts.box( CONCRETE(), [ width - 0.06, 0.02, 1.08 ], [ 0, 1.0, - 0.78 ] );
	parts.rod( STEEL(), [ - 0.3, 0.55, - 0.25 ], [ 0.3, 0.55, - 0.25 ], 0.03, 8 ); // tipping pivot

	for ( const s of [ - 1, 1 ] ) {

		wheel( parts, [ s * 0.33, 0.29, - 0.55 ], 0.29, 0.22 );
		wheel( parts, [ s * 0.3, 0.2, 1.0 ], 0.2, 0.16 );

	}

	// Engine hood, platform, console and the guard frame.
	parts.box( yellow, [ 0.72, 0.42, 0.62 ], [ 0, 0.5, 0.25 ] );
	parts.box( dark, [ 0.5, 0.03, 0.3 ], [ 0, 0.92, 0.2 ] );
	parts.box( GRATING(), [ 0.8, 0.05, 0.6 ], [ 0, 0.44, 1.05 ] );
	parts.rod( dark, [ 0, 0.92, 0.62 ], [ 0, 1.15, 0.66 ], 0.03, 8 );
	parts.rod( RUBBER(), [ - 0.22, 1.15, 0.66 ], [ 0.22, 1.15, 0.66 ], 0.018, 8 );
	const g = 0.4;
	parts.path( dark, [ [ - g, 0.92, 0.6 ], [ - g, 1.5, 0.6 ], [ g, 1.5, 0.6 ], [ g, 0.92, 0.6 ] ], 0.025, 8 );
	for ( const s of [ - g, g ] ) parts.path( dark, [ [ s, 1.05, 0.6 ], [ s, 1.05, 1.3 ], [ s, 0.47, 1.3 ] ], 0.02, 8 );

	return parts.build();

}

// Blades under a trowel rotor at [ x, z ]: four of `length`, set at a slight pitch.
function blades( parts, [ x, z ], reach, length, chord ) {

	for ( let k = 0; k < 4; k ++ ) {

		const a = k * Math.PI / 2 + Math.PI / 4;
		const [ cx, cz ] = [ x + Math.cos( a ) * reach, z + Math.sin( a ) * reach ];
		parts.block( STEEL(), [ length, 0.006, chord ], [ cx, 0.012, cz ], [ 0, - a, 0 ] );
		parts.rod( DARK(), [ x, 0.06, z ], [ cx, 0.025, cz ], 0.018, 6 );

	}

}

// A 36 in walk-behind power trowel: the guard ring round four blades, the gearbox and the engine
// on top, and the handle reaching back to the operator (+Z) with its pitch control and throttle.
function walkTrowel() {

	const parts = new Parts();
	const r = 0.48;
	band( parts, mat( 0xe8b320, { roughness: 0.5, metalness: 0.2, side: DoubleSide } ), r, 0.09, [ 0, 0.03, 0 ] );
	for ( let k = 0; k < 4; k ++ ) parts.rod( YELLOW(), [ r * Math.cos( k * Math.PI / 2 ), 0.12, r * Math.sin( k * Math.PI / 2 ) ], [ 0, 0.3, 0 ], 0.012, 5 );
	blades( parts, [ 0, 0 ], 0.22, 0.4, 0.15 );
	parts.cylinder( DARK(), 0.12, 0.03, [ 0, 0.03, 0 ], 16 );
	parts.cylinder( DARK(), 0.09, 0.28, [ 0, 0.05, 0 ], 14 );
	parts.box( DARK(), [ 0.44, 0.04, 0.36 ], [ 0, 0.32, 0 ] );
	parts.box( mat( 0x9a1f1a, { roughness: 0.5, metalness: 0.2 } ), [ 0.3, 0.26, 0.26 ], [ 0.02, 0.36, - 0.02 ] );
	parts.rod( STEEL(), [ - 0.18, 0.5, 0.06 ], [ - 0.18, 0.5, - 0.12 ], 0.07, 12 ); // fuel tank
	parts.rod( DARK(), [ 0.17, 0.45, 0.1 ], [ 0.17, 0.45, - 0.1 ], 0.04, 8 ); // muffler

	const [ base, end ] = [ [ 0, 0.36, 0.14 ], [ 0, 0.98, 1.55 ] ];
	parts.rod( DARK(), base, end, 0.022, 8 );
	parts.rod( RUBBER(), [ - 0.27, 0.98, 1.55 ], [ 0.27, 0.98, 1.55 ], 0.018, 8 );
	parts.rod( YELLOW(), lerp( base, end, 0.82 ), up( lerp( base, end, 0.82 ), 0.12 ), 0.03, 10 ); // pitch control
	parts.rod( DARK(), [ 0.2, 0.98, 1.53 ], [ 0.2, 1.0, 1.42 ], 0.008, 4 ); // throttle

	return parts.build();

}

// A ride-on power trowel with two 46 in rotors side by side (about 2.4 m across): guard rings,
// the frame and cowling over them with the engine under the seat, and the steering levers.
function rideOnTrowel() {

	const parts = new Parts();
	const r = 0.6;
	const guard = mat( 0xe8b320, { roughness: 0.5, metalness: 0.2, side: DoubleSide } );
	for ( const x of [ - 0.62, 0.62 ] ) {

		band( parts, guard, r, 0.1, [ x, 0.03, 0 ] );
		blades( parts, [ x, 0 ], 0.28, 0.48, 0.17 );
		parts.cylinder( DARK(), 0.13, 0.4, [ x, 0.04, 0 ], 14 );

	}

	parts.box( DARK(), [ 2.1, 0.08, 0.9 ], [ 0, 0.42, 0 ] );
	parts.box( YELLOW(), [ 0.85, 0.5, 0.8 ], [ 0, 0.5, 0.12 ] );
	parts.box( DARK(), [ 0.85, 0.2, 0.03 ], [ 0, 0.62, - 0.29 ] ); // engine grille
	parts.box( RUBBER(), [ 0.5, 0.1, 0.45 ], [ 0, 1.0, 0.15 ] );
	parts.box( RUBBER(), [ 0.5, 0.42, 0.08 ], [ 0, 1.05, 0.42 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( YELLOW(), [ 0.35, 0.3, 0.6 ], [ s * 0.62, 0.5, 0.05 ] ); // fuel tank / battery boxes
		parts.rod( DARK(), [ s * 0.33, 0.8, - 0.25 ], [ s * 0.33, 1.2, - 0.32 ], 0.02, 6 );
		parts.sphere( RUBBER(), 0.04, [ s * 0.33, 1.22, - 0.32 ] );

	}

	parts.box( GRATING(), [ 0.6, 0.03, 0.25 ], [ 0, 0.48, - 0.38 ] ); // foot plate
	parts.path( DARK(), [ [ - 0.5, 0.92, - 0.42 ], [ - 0.5, 1.15, - 0.42 ], [ 0.5, 1.15, - 0.42 ], [ 0.5, 0.92, - 0.42 ] ], 0.02, 6 );

	return parts.build();

}

// A boom laser screed of the Somero S-22E class: a four-wheel-drive chassis with stabilisers,
// the operator's seat on the turntable, and a three-stage telescopic boom reaching 20 ft forward
// to the 12 ft screed head (plow, auger and vibrating plate) with its two laser receiver masts.
function laserScreed() {

	const parts = new Parts();
	const yellow = YELLOW();
	const dark = DARK();

	// Chassis, wheels, stabilisers and the engine compartment at the back.
	parts.box( yellow, [ 1.7, 0.55, 2.8 ], [ 0, 0.45, 0.95 ] );
	for ( const s of [ - 1, 1 ] ) for ( const z of [ - 0.1, 2.0 ] ) wheel( parts, [ s * 1.0, 0.42, z ], 0.42, 0.32, dark );
	for ( const s of [ - 1, 1 ] ) {

		for ( const z of [ - 0.55, 2.45 ] ) {

			parts.rod( dark, [ s * 0.75, 0.75, z ], [ s * 0.75, 0.04, z ], 0.06, 8 );
			parts.box( dark, [ 0.22, 0.14, Math.abs( z - 0.95 ) - 1.3 ], [ s * 0.75, 0.7, ( z + Math.sign( z - 0.95 ) * 1.4 + 0.95 ) / 2 ] );
			parts.cylinder( dark, 0.16, 0.04, [ s * 0.75, 0, z ], 12 );

		}

	}

	parts.box( yellow, [ 1.6, 0.75, 0.85 ], [ 0, 1.0, 1.95 ] );
	parts.box( dark, [ 0.03, 0.4, 0.6 ], [ 0.81, 1.15, 1.95 ] );

	// Turntable, deck, seat and console.
	parts.cylinder( dark, 0.6, 0.2, [ 0, 1.0, 0.55 ], 20 );
	parts.box( yellow, [ 1.4, 0.12, 1.2 ], [ 0, 1.2, 0.75 ] );
	parts.box( RUBBER(), [ 0.5, 0.1, 0.45 ], [ 0.35, 1.55, 1.05 ] );
	parts.box( RUBBER(), [ 0.5, 0.55, 0.08 ], [ 0.35, 1.6, 1.3 ] );
	parts.box( yellow, [ 0.15, 0.25, 0.45 ], [ 0.35, 1.32, 1.05 ] );
	parts.box( dark, [ 0.55, 0.45, 0.25 ], [ 0.35, 1.32, 0.55 ] );
	for ( const s of [ 0.1, 0.6 ] ) parts.rod( dark, [ s, 1.65, 0.75 ], [ s, 1.85, 0.72 ], 0.015, 5 );

	// The boom: three box sections telescoping out forward and down to the head.
	const start = [ - 0.35, 1.55, 0.3 ];
	const tip = [ - 0.35, 0.95, - 6.1 ];
	const angle = Math.atan2( tip[ 1 ] - start[ 1 ], start[ 2 ] - tip[ 2 ] );
	const span = dist( start, tip );
	const sections = [ [ 0.36, 0, 0.42 ], [ 0.29, 0.36, 0.76 ], [ 0.22, 0.7, 1 ] ];
	for ( const [ size, from, to ] of sections ) {

		parts.block( yellow, [ size, size, span * ( to - from ) ], lerp( start, tip, ( from + to ) / 2 ), [ angle, 0, 0 ] );

	}

	parts.rod( dark, [ - 0.35, 1.2, 0.5 ], lerp( start, tip, 0.25 ), 0.06, 8 ); // boom lift ram
	parts.box( dark, [ 0.4, 0.5, 0.4 ], [ - 0.35, 1.2, 0.3 ] );

	// The screed head on the end of the boom.
	const z = - 6.15;
	const head = 12 * FT;
	parts.box( yellow, [ head, 0.16, 0.2 ], [ - 0.35, 0.55, z ] );
	parts.box( dark, [ 0.5, 0.25, 0.4 ], [ - 0.35, 0.7, z ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( yellow, [ 0.05, 0.5, 0.75 ], [ - 0.35 + s * head / 2, 0.06, z ] );
		parts.rod( dark, [ - 0.35 + s * 0.35, 0.7, z ], [ - 0.35 + s * 1.0, 0.25, z - 0.25 ], 0.04, 6 ); // level rams
		const mast = - 0.35 + s * ( head / 2 - 0.15 );
		parts.rod( STEEL(), [ mast, 0.7, z ], [ mast, 2.45, z ], 0.022, 6 );
		parts.cylinder( mat( 0xf2a31b, { roughness: 0.4 } ), 0.07, 0.24, [ mast, 2.3, z ], 12 );

	}

	parts.box( STEEL(), [ head - 0.1, 0.22, 0.025 ], [ - 0.35, 0.05, z + 0.3 ] ); // plow
	parts.rod( STEEL(), [ - 0.35 - head / 2 + 0.05, 0.15, z ], [ - 0.35 + head / 2 - 0.05, 0.15, z ], 0.1, 10 ); // auger
	for ( let x = - head / 2 + 0.2; x < head / 2 - 0.1; x += 0.18 ) parts.rod( STEEL(), [ - 0.35 + x, 0.15, z ], [ - 0.34 + x, 0.15, z ], 0.135, 10 );
	parts.box( STEEL(), [ head - 0.1, 0.04, 0.22 ], [ - 0.35, 0.005, z - 0.3 ] ); // vibrating plate
	for ( const s of [ - 1, 1 ] ) parts.cylinder( dark, 0.06, 0.12, [ - 0.35 + s * 1.0, 0.045, z - 0.3 ], 10 );
	for ( const s of [ - 1.2, 0, 1.2 ] ) parts.box( yellow, [ 0.06, 0.5, 0.65 ], [ - 0.35 + s, 0.06, z ] );

	return parts.build();

}

// --- formwork and shoring --------------------------------------------------------------------

// A gang form of 8 × 24 ft standing as set: the film-faced plywood face to the front (-Z),
// aluminium joists behind it, three rows of double steel walers with ties through them, four
// strongbacks with lifting eyes, and pipe braces (push-pull and kicker) back to plates on the
// ground behind.
function gangForm() {

	const parts = new Parts();
	const [ w, h ] = [ 24 * FT, 8 * FT ];
	const face = mat( 0xa75a2c, { roughness: 0.55 } );
	const ally = mat( 0xb9bdc1, { roughness: 0.4, metalness: 0.5 } );
	const z0 = - 0.9;

	parts.box( face, [ w, h, 0.019 ], [ 0, 0, z0 ] );
	for ( let x = - w / 2 + 0.1; x < w / 2; x += 1 * FT ) parts.box( ally, [ 0.065, h, 0.14 ], [ x, 0, z0 + 0.0795 ] );
	const walers = [ 0.45, 1.25, 2.05 ];
	for ( const y of walers ) {

		for ( const dz of [ 0, 0.1 ] ) parts.box( STEEL(), [ w - 0.1, 0.15, 0.05 ], [ 0, y - 0.075, z0 + 0.175 + dz ] );
		for ( let x = - w / 2 + 0.6; x < w / 2; x += 1.2 ) parts.rod( DARK(), [ x, y, z0 + 0.15 ], [ x, y, z0 + 0.42 ], 0.02, 6 );

	}

	const strongbacks = [ - 2.75, - 0.92, 0.92, 2.75 ];
	for ( const x of strongbacks ) {

		parts.box( ally, [ 0.11, h + 0.15, 0.2 ], [ x, 0, z0 + 0.35 ] );
		parts.path( STEEL(), [ [ x - 0.06, h + 0.15, z0 + 0.35 ], [ x - 0.06, h + 0.3, z0 + 0.35 ], [ x + 0.06, h + 0.3, z0 + 0.35 ], [ x + 0.06, h + 0.15, z0 + 0.35 ] ], 0.012, 5, false );

	}

	// Braces off the two middle strongbacks and the two outer ones.
	for ( const x of strongbacks ) {

		const foot = z0 + 2.1;
		parts.rod( GALVANISED(), [ x, 1.95, z0 + 0.45 ], [ x, 0.05, foot ], 0.03, 8 );
		parts.rod( YELLOW(), lerp( [ x, 1.95, z0 + 0.45 ], [ x, 0.05, foot ], 0.45 ), lerp( [ x, 1.95, z0 + 0.45 ], [ x, 0.05, foot ], 0.55 ), 0.042, 8 );
		parts.rod( GALVANISED(), [ x, 0.6, z0 + 0.45 ], [ x, 0.05, z0 + 1.3 ], 0.025, 8 );
		for ( const fz of [ foot, z0 + 1.3 ] ) parts.box( STEEL(), [ 0.2, 0.02, 0.25 ], [ x, 0, fz ] );

	}

	return parts.build();

}

// A steel column form for a 24 in square column, 12 ft high: four stiffened panels bolted at the
// corners, a working platform with guardrails on the back near the top and a ladder up to it, and
// two push-pull braces plumbing it from the front and the left.
function columnForm() {

	const parts = new Parts();
	const skin = mat( 0x3c5e86, { roughness: 0.5, metalness: 0.35 } );
	const inner = 24 * IN;
	const h = 12 * FT;
	const t = 0.006;
	const o = inner / 2 + t;

	// The four panels, their corner flanges and horizontal stiffeners every 300 mm.
	for ( const s of [ - 1, 1 ] ) {

		parts.box( skin, [ inner + 2 * t, h, t ], [ 0, 0, s * ( o - t / 2 ) ] );
		parts.box( skin, [ t, h, inner ], [ s * ( o - t / 2 ), 0, 0 ] );

	}

	for ( const [ sx, sz ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ] ) {

		parts.box( skin, [ 0.1, h, 0.012 ], [ sx * ( o + 0.05 ), 0, sz * o ] );
		parts.box( skin, [ 0.012, h, 0.1 ], [ sx * o, 0, sz * ( o + 0.05 ) ] );

	}

	for ( let y = 0.15; y < h; y += 0.3 ) {

		for ( const s of [ - 1, 1 ] ) {

			parts.box( skin, [ inner + 0.2, 0.06, 0.012 ], [ 0, y, s * ( o + 0.006 ) ] );
			parts.box( skin, [ 0.012, 0.06, inner + 0.2 ], [ s * ( o + 0.006 ), y, 0 ] );

		}

	}

	// The platform on the back, 1.1 m below the top, and its ladder.
	const deck = h - 1.1;
	const back = o + 0.1;
	parts.box( GRATING(), [ 1.2, 0.04, 0.8 ], [ 0, deck, back + 0.4 ] );
	for ( const s of [ - 0.3, 0.3 ] ) parts.rod( STEEL(), [ s, deck - 0.6, o + 0.01 ], [ s, deck, back + 0.75 ], 0.025, 5 );
	const y = deck + 0.04;
	railing( parts, RAIL(), [ [ - 0.3, y, back + 0.8 ], [ - 0.6, y, back + 0.8 ], [ - 0.6, y, back ] ] );
	railing( parts, RAIL(), [ [ 0.3, y, back + 0.8 ], [ 0.6, y, back + 0.8 ], [ 0.6, y, back ] ] );
	ladder( parts, STEEL(), [ 0, back + 0.6 ], [ 0, 1 ], 0, deck, false );

	// Push-pull braces from 2.4 m up to plates on the ground.
	for ( const [ dx, dz ] of [ [ 0, - 1 ], [ - 1, 0 ] ] ) {

		const top = [ dx * ( o + 0.02 ), 2.4, dz * ( o + 0.02 ) ];
		const foot = [ dx * 2.2, 0.05, dz * 2.2 ];
		parts.rod( GALVANISED(), top, foot, 0.028, 8 );
		parts.rod( YELLOW(), lerp( top, foot, 0.45 ), lerp( top, foot, 0.55 ), 0.04, 8 );
		parts.box( STEEL(), [ 0.22, 0.02, 0.22 ], [ foot[ 0 ], 0, foot[ 2 ] ] );

	}

	return parts.build();

}

// Two stacks of 2 × 8 ft steel-frame plywood form panels, 16 each, face down on 4 × 4 dunnage
// and banded.
function formPanelStack() {

	const parts = new Parts();
	const frame = mat( 0x9b3a2a, { roughness: 0.6, metalness: 0.3 } );
	const ply = mat( 0xc8a46e, { roughness: 0.8 } );
	const timber = mat( 0x8a6a45, { roughness: 0.9 } );
	const [ pw, pl, depth ] = [ 2 * FT, 8 * FT, 2.75 * IN ];
	const count = 16;

	for ( const z of [ - 0.9, 0, 0.9 ] ) parts.box( timber, [ 1.5, 0.09, 0.09 ], [ 0, 0, z ] );
	for ( const x of [ - 0.33, 0.33 ] ) {

		for ( let i = 0; i < count; i ++ ) {

			const y = 0.09 + i * depth;
			parts.box( ply, [ pw - 0.01, 0.014, pl - 0.01 ], [ x, y, 0 ] );
			parts.box( frame, [ pw, depth - 0.014, pl ], [ x, y + 0.014, 0 ] );

		}

		for ( const z of [ - 0.7, 0.7 ] ) parts.box( mat( 0x1d1f21, { roughness: 0.7 } ), [ pw + 0.01, count * depth + 0.01, 0.03 ], [ x, 0.085, z ] );

	}

	return parts.build();

}

// A shoring tower of two 4 ft wide, 6 ft high frames, two frames high, cross-braced 7 ft apart:
// base plates and screw jacks under the legs, screw jacks and U-heads on top carrying two
// aluminium beams.
function shoringTower() {

	const parts = new Parts();
	const frame = mat( 0x3f6fb0, { roughness: 0.5, metalness: 0.35 } );
	const ally = mat( 0xb9bdc1, { roughness: 0.4, metalness: 0.5 } );
	const [ hx, hz ] = [ 2 * FT, 3.5 * FT ];
	const fh = 6 * FT;
	const base = 0.3;

	for ( const x of [ - hx, hx ] ) {

		for ( const z of [ - hz, hz ] ) {

			parts.box( STEEL(), [ 0.15, 0.01, 0.15 ], [ x, 0, z ] );
			parts.rod( STEEL(), [ x, 0.01, z ], [ x, base + 0.1, z ], 0.016, 6 );
			parts.cylinder( DARK(), 0.05, 0.04, [ x, 0.22, z ], 8 );
			const top = base + 2 * fh;
			parts.rod( STEEL(), [ x, top - 0.1, z ], [ x, top + 0.3, z ], 0.016, 6 );
			parts.cylinder( DARK(), 0.05, 0.04, [ x, top + 0.08, z ], 8 );
			parts.box( STEEL(), [ 0.13, 0.01, 0.2 ], [ x, top + 0.3, z ] );
			for ( const s of [ - 0.06, 0.06 ] ) parts.box( STEEL(), [ 0.008, 0.12, 0.2 ], [ x + s, top + 0.31, z ] );

		}

	}

	// The frames: legs, header, ledger, reinforcing legs and knee braces, coupled at the joint.
	for ( let level = 0; level < 2; level ++ ) {

		const y0 = base + level * fh;
		for ( const z of [ - hz, hz ] ) {

			for ( const x of [ - hx, hx ] ) {

				parts.rod( frame, [ x, y0, z ], [ x, y0 + fh, z ], 0.03, 8 );
				parts.rod( frame, [ x, y0 + fh - 0.06, z ], [ x, y0 + fh + 0.06, z ], 0.036, 8 );

			}

			parts.rod( frame, [ - hx, y0 + fh - 0.05, z ], [ hx, y0 + fh - 0.05, z ], 0.025, 6 );
			parts.rod( frame, [ - hx, y0 + fh - 0.45, z ], [ hx, y0 + fh - 0.45, z ], 0.02, 6 );
			for ( const s of [ - 1, 1 ] ) {

				parts.rod( frame, [ s * 0.3, y0 + fh - 0.05, z ], [ s * 0.3, y0 + fh - 0.45, z ], 0.018, 6 );
				parts.rod( frame, [ s * hx, y0 + fh - 0.75, z ], [ s * 0.3, y0 + fh - 0.45, z ], 0.016, 6 );

			}

		}

		// Cross braces between the two frames on both sides.
		for ( const x of [ - hx - 0.04, hx + 0.04 ] ) {

			parts.rod( GALVANISED(), [ x, y0 + 0.2, - hz ], [ x, y0 + fh - 0.2, hz ], 0.012, 5 );
			parts.rod( GALVANISED(), [ x, y0 + 0.2, hz ], [ x, y0 + fh - 0.2, - hz ], 0.012, 5 );

		}

	}

	// Two aluminium beams in the U-heads.
	const top = base + 2 * fh + 0.31;
	for ( const x of [ - hx, hx ] ) parts.box( ally, [ 0.095, 0.165, 3.0 ], [ x, top, 0 ] );

	return parts.build();

}
