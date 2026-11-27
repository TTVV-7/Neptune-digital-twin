import { CircleGeometry, CylinderGeometry, DoubleSide, ExtrudeGeometry, MathUtils, Matrix4, Path, Shape, Vector2 } from 'three';
import { FT, IN, mat, Parts } from './parts.js';
import { memberGeometry } from './plant-parts.js';

// Tunnelling, formwork and interior fit-out pieces built in code at the sizes of the common North
// American classes (no brands): precast segments, a multi-service vehicle, a muck train, tunnel
// ventilation, a shaft gantry and a TBM cutterhead; flying tables, a climbing form, single-sided
// wall forms, a round column form, slab shoring, a column cage and a pallet of form accessories;
// and for planning the logistics of a fit-out, a drywall cart, a material lift, a tilt truck, a
// mortar mixer and a stair tower. Like the other built-in pieces each stands on y = 0 with its
// front facing -Z (+X is its right).

const DEG = MathUtils.DEG2RAD;
const _m = new Matrix4();

export const TUNNEL_FORMWORK_ITEMS = [
	// Tunnelling and shafts.
	{ id: 'tunnel-segment-stack-6m', name: 'Precast tunnel segments, one ring stacked on dunnage (6 m ID, 1.5 m wide, 6 + key)', category: 'Tunnelling',
		keywords: 'tunnel segments precast segment ring lining tbm segmental lining concrete segment stack laydown key segment',
		build: segmentStack },
	{ id: 'tunnel-msv-15m', name: 'Tunnel multi-service vehicle, rubber-tyred (15 m, 4 segments and a grout tank)', category: 'Tunnelling',
		keywords: 'msv multi service vehicle segment carrier tunnel vehicle tbm supply rubber tyred tunnel transport',
		build: msv },
	{ id: 'muck-train-3-car', name: 'Tunnel muck train (36 in gauge locomotive and 3 × 12 m³ muck cars, on track)', category: 'Tunnelling',
		keywords: 'muck train muck cars tunnel locomotive loci narrow gauge mine train spoil cars tbm haulage',
		build: muckTrain },
	{ id: 'tunnel-vent-fan-48in', name: 'Tunnel ventilation fan, axial (48 in, with silencers and flexible duct)', category: 'Tunnelling',
		keywords: 'vent fan ventilation fan axial fan tunnel fan blower vent bag duct mine ventilation fresh air',
		build: ventFan },
	// A row of them (rows.js) strings the sections end to end into a duct run.
	{ id: 'vent-duct-48in-10m', name: 'Flexible vent duct on cradles (48 in, 10 m section)', category: 'Tunnelling',
		keywords: 'vent duct vent bag ventilation duct lay flat duct flexible duct tunnel ventilation air line',
		build: ventDuct, rowLength: 10 },
	{ id: 'shaft-gantry-20t', name: 'Shaft gantry crane, 20 t (15 m span over a 10 m shaft collar with guard rail)', category: 'Tunnelling',
		keywords: 'shaft gantry gantry crane portal crane shaft crane launch shaft tbm shaft muck skip headframe overhead crane',
		build: shaftGantry },
	{ id: 'tbm-cutterhead-6-5m', name: 'TBM cutterhead on transport stands (6.5 m dia, 17 in disc cutters)', category: 'Tunnelling',
		keywords: 'tbm cutterhead cutter head tunnel boring machine disc cutters laydown mole',
		build: cutterhead },
	// Formwork.
	{ id: 'table-form-8x20', name: 'Flying table form (8 × 20 ft, aluminium beams on shore legs, 10 ft)', category: 'Concrete & batching',
		keywords: 'table form flying form fly table slab form deck form formwork aluminium joists shores',
		build: tableForm },
	{ id: 'climbing-form-unit', name: 'Climbing form unit on a wall (15 ft wide, 4 m pour, 3 decks)', category: 'Concrete & batching',
		keywords: 'climbing form jump form self climbing core form wall form platform formwork decks climbing brackets',
		build: climbingForm },
	{ id: 'wall-form-single-sided', name: 'Single-sided wall form with A-frame braces (16 × 12 ft)', category: 'Concrete & batching',
		keywords: 'single sided wall form one sided form a-frame brace frame formwork blindside shoring wall form',
		build: singleSidedForm },
	{ id: 'column-form-round-24in', name: 'Round column form, fibre tube (24 in, 12 ft, braced)', category: 'Concrete & batching',
		keywords: 'sonotube round column form fibre tube cardboard tube column formwork braces',
		build: roundColumnForm },
	// A row of them (rows.js) lays bays side by side into a strip of slab shoring.
	{ id: 'slab-shoring-bay-4x4', name: 'Slab shoring bay (4 × 4 m, 9 post shores, aluminium beams, plywood deck, 10 ft)', category: 'Concrete & batching',
		keywords: 'slab shoring post shores reshores falsework deck formwork aluminium beams joists plywood slab form',
		build: slabShoring, rowLength: 4 },
	{ id: 'rebar-cage-column-24in', name: 'Rebar cage, column, standing and braced (24 in square, 12 ft)', category: 'Concrete & batching',
		keywords: 'rebar cage column cage reinforcing steel ties stirrups braced cage',
		build: columnCage },
	{ id: 'form-accessories-pallet', name: 'Formwork accessories stillage on a pallet (snap ties, wedges, form oil)', category: 'Concrete & batching',
		keywords: 'form ties snap ties wedges she bolts form oil form release accessories pallet stillage formwork hardware',
		build: accessoriesPallet },
	// Interior and fit-out.
	{ id: 'drywall-cart-4x12', name: 'Drywall cart loaded (40 sheets of 4 × 12 ft)', category: 'Material handling',
		keywords: 'drywall cart gypsum board sheetrock gyprock panel cart board cart fit out interior',
		build: drywallCart },
	{ id: 'material-lift-raised', name: 'Material lift, raised (Genie Super Lift type, 20 ft, with a 24 in duct)', category: 'Material handling',
		keywords: 'material lift genie lift super lift duct lift contractor lift hvac duct winch lift fit out interior',
		build: materialLift },
	{ id: 'tilt-truck-1yd', name: 'Tilt truck, interior debris hopper (1 yd³)', category: 'Waste',
		keywords: 'tilt truck debris cart rubbermaid cart garbage hopper interior waste cart cubic yard',
		build: tiltTruck },
	{ id: 'mortar-mixer-12cf', name: 'Mortar / plaster mixer, paddle type (12 ft³, towable)', category: 'Concrete & batching',
		keywords: 'mortar mixer plaster mixer paddle mixer grout mixer masonry towable',
		build: mortarMixer },
	{ id: 'stair-tower-3-lift', name: 'Scaffold stair tower (3 lifts of 2 m, landings, 5 × 10 ft)', category: 'Access & scaffolding',
		keywords: 'stair tower scaffold stairs stairway access tower ringlock stair module landings',
		build: stairTower },
];

// --- shared colours ----------------------------------------------------------------------------

const paint = color => mat( color, { roughness: 0.5, metalness: 0.2 } );
const YELLOW = () => paint( 0xe2a41c );
const ORANGE = () => paint( 0xdc6a1f );
const DARK = () => mat( 0x2c2e31, { roughness: 0.7, metalness: 0.2 } );
const BLACK = () => mat( 0x18191b, { roughness: 0.85 } );
const STEEL = () => mat( 0x7d8287, { roughness: 0.5, metalness: 0.6 } );
const BRIGHT = () => mat( 0xc9ccce, { roughness: 0.35, metalness: 0.3 } );
const GALV = () => mat( 0xa9adb0, { roughness: 0.45, metalness: 0.65 } );
const ALU = () => mat( 0xb5bbc0, { roughness: 0.4, metalness: 0.6 } );
const GLASS = () => mat( 0x2b3d48, { roughness: 0.1, metalness: 0.3 } );
const CONCRETE = () => mat( 0xa9a59d, { roughness: 0.95 } );
const TIMBER = () => mat( 0x8a6a45, { roughness: 0.95 } );
const PLY = () => mat( 0xb9894f, { roughness: 0.85 } );
const REBAR = () => mat( 0x6b4a36, { roughness: 0.8, metalness: 0.3 } );
const LAMP = () => mat( 0xff9a1a, { roughness: 0.3, emissive: 0xc76a00, emissiveIntensity: 0.6 } );
const HEADLAMP = () => mat( 0xfff4d6, { roughness: 0.3, emissive: 0xbbb08a, emissiveIntensity: 0.5 } );

// --- shared pieces -----------------------------------------------------------------------------

// A box section [ w across, h deep ] from a to b.
function member( parts, material, section, a, b ) {

	parts.add( material, memberGeometry( section, a, b ) );

}

// The points of a circle of radius r round (x, z), seen from above, as [ x, z ].
function circle( r, n = 48, [ x = 0, z = 0 ] = [] ) {

	return Array.from( { length: n }, ( _, i ) => [ x + r * Math.cos( i / n * Math.PI * 2 ), z + r * Math.sin( i / n * Math.PI * 2 ) ] );

}

// An outline seen from above (points [ x, z ]) extruded up from y0 to y1, with optional holes.
function plan( parts, material, points, y0, y1, holes = [] ) {

	const shape = new Shape( points.map( ( [ x, z ] ) => new Vector2( x, - z ) ) );
	for ( const hole of holes ) shape.holes.push( new Path( hole.map( ( [ x, z ] ) => new Vector2( x, - z ) ) ) );
	const geometry = new ExtrudeGeometry( shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 6 } );
	geometry.rotateX( - Math.PI / 2 );
	geometry.translate( 0, y0, 0 );
	parts.add( material, geometry );

}

// A curved slab: the part of a ring between radii rIn and rOut within `half` either side of
// straight up, its centre at the origin, `length` long along z and centred on z = 0. Each shape
// is made once and copied, as a stack has many the same.
const arcs = new Map();
function arcGeometry( rIn, rOut, half, length, segments = 12 ) {

	const key = [ rIn, rOut, half, length, segments ].join( ' ' );
	if ( ! arcs.has( key ) ) arcs.set( key, makeArc( rIn, rOut, half, length, segments ) );
	return arcs.get( key ).clone();

}

function makeArc( rIn, rOut, half, length, segments ) {

	const a0 = Math.PI / 2 - half;
	const a1 = Math.PI / 2 + half;
	const shape = new Shape();
	shape.moveTo( rOut * Math.cos( a0 ), rOut * Math.sin( a0 ) );
	shape.absarc( 0, 0, rOut, a0, a1, false );
	shape.lineTo( rIn * Math.cos( a1 ), rIn * Math.sin( a1 ) );
	shape.absarc( 0, 0, rIn, a1, a0, true );
	const geometry = new ExtrudeGeometry( shape, { depth: length, bevelEnabled: false, curveSegments: segments } );
	geometry.translate( 0, 0, - length / 2 );
	return geometry;

}

// A tyre on its rim, axle across x, centred on the point.
function tyre( parts, r, w, [ x, y, z ], rim = BRIGHT() ) {

	parts.rod( BLACK(), [ x - w / 2, y, z ], [ x + w / 2, y, z ], r, 18 );
	parts.rod( rim, [ x - w / 2 - 0.005, y, z ], [ x + w / 2 + 0.005, y, z ], r * 0.55, 12 );

}

// Handrails round a rectangle at height y: posts and two rails along each side given (0 is the
// front edge at z0, then round by +X, the back and -X).
function railing( parts, [ x0, x1 ], [ z0, z1 ], y, sides = [ 0, 1, 2, 3 ], material = YELLOW() ) {

	const corners = [ [ x0, z0 ], [ x1, z0 ], [ x1, z1 ], [ x0, z1 ] ];
	for ( const s of sides ) {

		const [ ax, az ] = corners[ s ];
		const [ bx, bz ] = corners[ ( s + 1 ) % 4 ];
		for ( const h of [ 0.55, 1.1 ] ) parts.rod( material, [ ax, y + h, az ], [ bx, y + h, bz ], 0.022, 5 );
		parts.box( material, [ Math.abs( bx - ax ) || 0.02, 0.12, Math.abs( bz - az ) || 0.02 ], [ ( ax + bx ) / 2, y, ( az + bz ) / 2 ] );
		const posts = Math.max( 1, Math.round( Math.hypot( bx - ax, bz - az ) / 1.8 ) );
		for ( let i = 0; i <= posts; i ++ ) {

			const t = i / posts;
			parts.rod( material, [ ax + ( bx - ax ) * t, y, az + ( bz - az ) * t ], [ ax + ( bx - ax ) * t, y + 1.1, az + ( bz - az ) * t ], 0.022, 5 );

		}

	}

}

// A ladder up from y0 to y1 at (x, z), its rungs across x (or across z with `alongZ`).
function ladder( parts, material, [ x, z ], y0, y1, alongZ = false ) {

	const d = alongZ ? [ 0, 0, 0.2 ] : [ 0.2, 0, 0 ];
	for ( const s of [ - 1, 1 ] ) parts.rod( material, [ x + s * d[ 0 ], y0, z + s * d[ 2 ] ], [ x + s * d[ 0 ], y1, z + s * d[ 2 ] ], 0.02, 5 );
	for ( let y = y0 + 0.3; y < y1; y += 0.3 ) parts.rod( material, [ x - d[ 0 ], y, z - d[ 2 ] ], [ x + d[ 0 ], y, z + d[ 2 ] ], 0.012, 4 );

}

// --- tunnelling --------------------------------------------------------------------------------

// The 6 m ring: 300 mm thick segments 1.5 m wide, six of 54° and a 36° key.
const SEG_IN = 3.0;
const SEG_OUT = 3.3;
const SEG_WIDTH = 1.5;
const SEG_HALF = 27 * DEG;
const KEY_HALF = 18 * DEG;
// How much higher each segment of a stack sits than the one under it, leaving room for the
// battens at its ends.
const SEG_LIFT = 0.42;

// One segment, convex side up, its ring centre at `centre`; turned a quarter about y with `turn`
// so its curve runs along z (as one is carried on a vehicle). The gasket shows as a black strip
// along the outer edges and the grout hole as a dark plug on top.
function segment( parts, half, centre, turn = false ) {

	const place = geometry => {

		if ( turn ) geometry.rotateY( Math.PI / 2 );
		geometry.translate( ...centre );
		return geometry;

	};
	parts.add( CONCRETE(), place( arcGeometry( SEG_IN, SEG_OUT, half, SEG_WIDTH ) ) );
	for ( const s of [ - 1, 1 ] ) {

		const gasket = arcGeometry( SEG_OUT - 0.01, SEG_OUT + 0.006, half - 0.004, 0.035, 12 );
		gasket.translate( 0, 0, s * ( SEG_WIDTH / 2 - 0.06 ) );
		parts.add( BLACK(), place( gasket ) );

	}

	const plug = new CylinderGeometry( 0.04, 0.04, 0.02, 10 );
	plug.translate( 0, SEG_OUT, 0 );
	parts.add( DARK(), place( plug ) );

}

// A stack of `halves.length` segments (bottom first) on two timbers, with battens at the ends of
// each to carry the next. `turn` runs the curve along z. The bottom ring centre sits at y0.
function segmentPile( parts, halves, [ x, z ], base, turn = false ) {

	const y0 = base + 0.12 - SEG_IN * Math.cos( halves[ 0 ] );
	const at = ( u, y ) => turn ? [ x, y, z + u ] : [ x + u, y, z ];
	const sized = ( across, height, length ) => turn ? [ length, height, across ] : [ across, height, length ];
	for ( const s of [ - 1, 1 ] ) {

		const u = s * ( SEG_IN * Math.sin( halves[ 0 ] ) + 0.04 );
		parts.box( TIMBER(), sized( 0.15, 0.12, 1.8 ), at( u, base ) );

	}

	halves.forEach( ( half, i ) => {

		const yc = y0 + i * SEG_LIFT;
		segment( parts, half, [ x, yc, z ], turn );
		if ( ! i ) return;
		for ( const s of [ - 1, 1 ] ) {

			// Batten from the top of the segment below up to the ends of this one.
			const u = SEG_IN * Math.sin( half ) - 0.06;
			const bottom = yc - SEG_LIFT + Math.sqrt( SEG_OUT ** 2 - u ** 2 );
			const top = yc + Math.sqrt( SEG_IN ** 2 - u ** 2 );
			parts.box( TIMBER(), sized( 0.1, top - bottom, 1.4 ), at( s * u, bottom ) );

		}

	} );

}

// One ring's worth of precast segments for a 6 m (inside) tunnel, stacked convex side up as they
// come from the precast yard: six 54° segments and the 36° key on top, each 300 mm thick and
// 1.5 m wide, on timbers with battens between, about 3.3 m high.
function segmentStack() {

	const parts = new Parts();
	segmentPile( parts, [ ...Array( 6 ).fill( SEG_HALF ), KEY_HALF ], [ 0, 0 ], 0 );
	return parts.build();

}

// A rubber-tyred multi-service vehicle of the kind that feeds a 6 m TBM: a long low chassis on
// four axles with a driving cab at each end, carrying two stacks of two segments (their curve
// along the vehicle) and a grout tank on the deck between the cabs. 15 m long, 2.3 m wide.
function msv() {

	const parts = new Parts();
	const L = 15;
	const W = 2.3;
	const deck = 1.03;

	// Chassis, deck plate and side skirts between the wheel sets.
	parts.box( DARK(), [ 1.6, 0.5, L - 0.4 ], [ 0, 0.5, 0 ] );
	parts.box( STEEL(), [ W, 0.08, 10.6 ], [ 0, deck - 0.08, 0 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( YELLOW(), [ 0.06, 0.4, 7.8 ], [ s * ( W / 2 - 0.03 ), 0.58, 0 ] );

	// Four axles in two pairs, big tyres on each.
	for ( const z of [ - 5.65, - 4.6, 4.6, 5.65 ] ) {

		for ( const s of [ - 1, 1 ] ) tyre( parts, 0.48, 0.36, [ s * 0.95, 0.48, z ] );

	}

	// A driving cab at each end, glazed to the outside and the sides, with lamps and a beacon.
	for ( const s of [ - 1, 1 ] ) {

		const z = s * 6.4;
		const face = z + s * 1.05;
		parts.box( YELLOW(), [ W, 1.22, 2.1 ], [ 0, deck - 0.03, z ] );
		parts.box( GLASS(), [ W * 0.8, 0.55, 0.02 ], [ 0, deck + 0.5, face + s * 0.01 ] );
		for ( const x of [ - 1, 1 ] ) {

			parts.box( GLASS(), [ 0.02, 0.48, 1.2 ], [ x * ( W / 2 + 0.01 ), deck + 0.55, z ] );
			parts.box( HEADLAMP(), [ 0.22, 0.12, 0.02 ], [ x * 0.8, deck + 0.15, face + s * 0.01 ] );

		}

		parts.box( DARK(), [ W + 0.04, 0.05, 2.14 ], [ 0, deck + 1.19, z ] );
		parts.box( DARK(), [ W, 0.3, 0.14 ], [ 0, 0.45, s * ( L / 2 - 0.07 ) ] );
		parts.cylinder( LAMP(), 0.08, 0.14, [ s * 0.0, deck + 1.24, z - s * 0.6 ], 10 );

	}

	// Two stacks of two segments on the deck, their curve along the vehicle.
	for ( const z of [ - 3.6, - 0.2 ] ) segmentPile( parts, [ SEG_HALF, SEG_HALF ], [ 0, z ], deck, true );

	// Grout tank on saddles, its agitator motor on top.
	const tankY = deck + 0.12 + 0.55;
	parts.rod( mat( 0xd7d6d0, { roughness: 0.5, metalness: 0.3 } ), [ 0, tankY, 1.9 ], [ 0, tankY, 4.9 ], 0.55, 20 );
	for ( const z of [ 2.4, 4.4 ] ) parts.box( DARK(), [ 1.0, 0.2, 0.2 ], [ 0, deck, z ] );
	parts.box( DARK(), [ 0.3, 0.18, 0.3 ], [ 0, tankY + 0.52, 3.4 ] );

	return parts.build();

}

// A narrow-gauge (36 in) muck train as it runs behind a TBM: a 7.2 m diesel locomotive with its
// cab at the back, and three 12 m³ side-tipping muck cars on bogies, each heaped with spoil,
// coupled up on a length of track: steel rails on timber sleepers. About 27 m over couplers.
function muckTrain() {

	const parts = new Parts();
	const gauge = 36 * IN;
	const sleeperH = 0.12;
	const railH = 0.11;
	const railTop = sleeperH + railH;
	const railX = gauge / 2 + 0.025;

	// Track, 28 m.
	for ( let z = - 13.8; z <= 13.8; z += 0.8 ) parts.box( TIMBER(), [ 1.5, sleeperH, 0.15 ], [ 0, 0, z ] );
	for ( const s of [ - 1, 1 ] ) {

		const x = s * railX;
		parts.box( STEEL(), [ 0.1, 0.015, 28 ], [ x, sleeperH, 0 ] );
		parts.box( STEEL(), [ 0.018, railH - 0.04, 28 ], [ x, sleeperH + 0.015, 0 ] );
		parts.box( BRIGHT(), [ 0.05, 0.025, 28 ], [ x, railTop - 0.025, 0 ] );

	}

	const wheelset = ( r, z ) => {

		for ( const s of [ - 1, 1 ] ) parts.rod( DARK(), [ s * railX - 0.05, railTop + r, z ], [ s * railX + 0.05, railTop + r, z ], r, 14 );
		parts.rod( STEEL(), [ - railX, railTop + r, z ], [ railX, railTop + r, z ], 0.05, 8 );

	};

	// Locomotive at the front: frame over the wheels, the engine hood, the cab with its roof, a
	// central buffer at each end, lamps and the exhaust.
	const loco = - 9.9;
	const frameY = railTop + 0.12;
	for ( const z of [ loco - 2.3, loco + 2.3 ] ) wheelset( 0.32, z );
	parts.box( DARK(), [ 1.3, 0.48, 7.0 ], [ 0, frameY, loco ] );
	const top = frameY + 0.48;
	parts.box( YELLOW(), [ 1.2, 0.8, 4.0 ], [ 0, top, loco - 1.4 ] );
	parts.box( DARK(), [ 0.8, 0.5, 0.02 ], [ 0, top + 0.15, loco - 3.41 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( HEADLAMP(), [ 0.16, 0.1, 0.02 ], [ s * 0.45, top + 0.6, loco - 3.41 ] );
	parts.cylinder( DARK(), 0.05, 0.35, [ 0.35, top + 0.8, loco - 2.4 ], 8 );
	parts.box( YELLOW(), [ 1.5, 1.25, 2.4 ], [ 0, top, loco + 2.0 ] );
	parts.box( DARK(), [ 1.62, 0.06, 2.6 ], [ 0, top + 1.25, loco + 2.0 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( GLASS(), [ 0.02, 0.5, 1.6 ], [ s * 0.76, top + 0.6, loco + 2.0 ] );
		parts.box( GLASS(), [ 1.2, 0.5, 0.02 ], [ 0, top + 0.6, loco + 2.0 + s * 1.21 ] );

	}

	parts.cylinder( LAMP(), 0.06, 0.1, [ 0, top + 1.31, loco + 2.0 ], 8 );
	for ( const z of [ loco - 3.5, loco + 3.5 ] ) parts.box( DARK(), [ 0.4, 0.28, 0.2 ], [ 0, frameY + 0.04, z ] );

	// Muck cars: a frame on two bogies, the tub of ribbed plate with spoil heaped in it, and a
	// drawbar coupling it to the one in front.
	const tub = paint( 0x6f767a );
	const spoil = mat( 0x6b5a45, { roughness: 1 } );
	for ( let i = 0; i < 3; i ++ ) {

		const zc = - 5.9 + i * 6.6 + 3.1;
		for ( const b of [ - 2.0, 2.0 ] ) {

			for ( const dz of [ - 0.4, 0.4 ] ) wheelset( 0.22, zc + b + dz );
			parts.box( DARK(), [ 1.15, 0.25, 1.3 ], [ 0, railTop + 0.08, zc + b ] );

		}

		const floor = railTop + 0.45;
		parts.box( DARK(), [ 1.2, 0.2, 5.8 ], [ 0, floor - 0.2, zc ] );
		const [ w, h, l, t ] = [ 1.6, 1.35, 5.6, 0.05 ];
		parts.box( tub, [ w, t, l ], [ 0, floor, zc ] );
		for ( const s of [ - 1, 1 ] ) {

			parts.box( tub, [ t, h, l ], [ s * ( w - t ) / 2, floor, zc ] );
			parts.box( tub, [ w, h, t ], [ 0, floor, zc + s * ( l - t ) / 2 ] );
			for ( let k = - 3; k <= 3; k ++ ) parts.box( DARK(), [ 0.04, h - 0.1, 0.08 ], [ s * ( w / 2 + 0.02 ), floor + 0.05, zc + k * 0.78 ] );
			parts.box( DARK(), [ 0.05, 0.08, l ], [ s * ( w / 2 + 0.02 ), floor + h - 0.08, zc ] );

		}

		parts.box( spoil, [ w - 2 * t, h - 0.25, l - 2 * t ], [ 0, floor + t, zc ] );
		parts.sphere( spoil, 1, [ 0, floor + h - 0.2, zc ], [ 16, 8 ], [ 0.74, 0.32, 2.7 ] );
		parts.box( DARK(), [ 0.14, 0.14, 0.8 ], [ 0, frameY - 0.02, zc - 3.3 ] );

	}

	return parts.build();

}

// A 48 in axial tunnel fan of about 110 kW on its skid: an intake bell with a guard at the back, a
// silencer either side of the fan casing, a reducer at the front and the first 3 m of the 48 in
// flexible duct, ribbed, resting on a stand. About 7.9 m long, 1.9 m across the bell.
function ventFan() {

	const parts = new Parts();
	const axis = 0.97;
	const fan = paint( 0x2f6a8f );
	const duct = mat( 0xf0b41c, { roughness: 0.65 } );

	// Skid: two channels with cross members and saddles.
	for ( const s of [ - 1, 1 ] ) parts.box( DARK(), [ 0.12, 0.15, 5.4 ], [ s * 0.55, 0, 0.95 ] );
	for ( const z of [ - 1.4, 0.1, 1.5, 3.2 ] ) parts.box( DARK(), [ 1.22, 0.1, 0.12 ], [ 0, 0.05, z ] );
	for ( const z of [ 1.2, 1.7 ] ) parts.box( DARK(), [ 0.9, axis - 0.7 - 0.15, 0.14 ], [ 0, 0.15, z ] );

	// Intake bell, its guard and the dark of the fan behind it.
	const back = 3.9;
	parts.rod( GALV(), [ 0, axis, back - 0.35 ], [ 0, axis, back ], [ 0.8, 0.95 ], 28, true );
	parts.rod( BLACK(), [ 0, axis, back - 0.37 ], [ 0, axis, back - 0.35 ], 0.79, 28 );
	for ( let x = - 0.84; x <= 0.85; x += 0.12 ) {

		const h = Math.sqrt( Math.max( 0, 0.9 ** 2 - x ** 2 ) );
		parts.rod( DARK(), [ x, axis - h, back ], [ x, axis + h, back ], 0.006, 4 );
		parts.rod( DARK(), [ - h, axis + x, back ], [ h, axis + x, back ], 0.006, 4 );

	}

	// Silencers and the fan casing between them, flanged where they bolt together, with the
	// motor's terminal box on the casing.
	const sections = [ [ back - 0.35, 1.95, 0.8, GALV() ], [ 1.95, 0.95, 0.7, fan ], [ 0.95, - 0.65, 0.8, GALV() ] ];
	for ( const [ z1, z0, r, material ] of sections ) {

		parts.rod( material, [ 0, axis, z0 ], [ 0, axis, z1 ], r, 28 );
		for ( const z of [ z0, z1 ] ) parts.rod( material, [ 0, axis, z - 0.03 ], [ 0, axis, z + 0.03 ], r + 0.05, 28 );

	}

	parts.box( DARK(), [ 0.3, 0.22, 0.3 ], [ 0, axis + 0.68, 1.45 ] );
	parts.box( DARK(), [ 0.16, 0.5, 0.4 ], [ 0.78, axis - 0.3, 1.45 ] );
	for ( const z of [ - 0.4, 3.0 ] ) parts.box( DARK(), [ 0.06, 0.12, 0.12 ], [ 0, axis + 0.8, z ] );

	// Reducer to the duct, the duct with its rings and its open end, and a stand under it.
	const front = - 0.65;
	parts.rod( GALV(), [ 0, axis, front - 0.35 ], [ 0, axis, front ], [ 0.6, 0.8 ], 28, true );
	const end = - 3.95;
	const start = front - 0.35;
	parts.rod( duct, [ 0, axis, end ], [ 0, axis, start ], 0.6, 24, true );
	parts.rod( BLACK(), [ 0, axis, end + 0.3 ], [ 0, axis, end + 0.32 ], 0.59, 24 );
	for ( let z = start - 0.4; z > end + 0.1; z -= 0.4 ) parts.rod( duct, [ 0, axis, z - 0.02 ], [ 0, axis, z + 0.02 ], 0.615, 24 );
	const stand = end + 0.6;
	parts.box( DARK(), [ 1.0, axis - 0.6, 0.08 ], [ 0, 0, stand ] );
	parts.box( DARK(), [ 1.2, 0.05, 0.4 ], [ 0, 0, stand ] );

	return parts.build();

}

// A 10 m length of 48 in flexible vent duct, inflated, resting on two steel cradles 5 m apart,
// with suspension strips every metre and the zip coupling at one end.
function ventDuct() {

	const parts = new Parts();
	const duct = mat( 0xf0b41c, { roughness: 0.65 } );
	const r = 0.6;
	const axis = 0.75;
	const L = 10;
	parts.rod( duct, [ 0, axis, - L / 2 ], [ 0, axis, L / 2 ], r, 28, true );
	for ( const s of [ - 1, 1 ] ) parts.rod( BLACK(), [ 0, axis, s * ( L / 2 - 0.03 ) ], [ 0, axis, s * ( L / 2 - 0.05 ) ], r - 0.01, 24 );
	for ( let z = - 4.5; z <= 4.5; z += 1 ) parts.rod( mat( 0xd99a12, { roughness: 0.65 } ), [ 0, axis, z - 0.02 ], [ 0, axis, z + 0.02 ], r + 0.012, 28 );
	parts.rod( DARK(), [ 0, axis, L / 2 - 0.2 ], [ 0, axis, L / 2 - 0.08 ], r + 0.015, 28 );

	// Cradles: a foot, two posts and a vee under the duct.
	for ( const z of [ - 2.5, 2.5 ] ) {

		parts.box( DARK(), [ 1.1, 0.05, 0.2 ], [ 0, 0, z ] );
		for ( const s of [ - 1, 1 ] ) {

			parts.box( DARK(), [ 0.05, 0.62, 0.05 ], [ s * 0.5, 0.05, z ] );
			member( parts, DARK(), [ 0.06, 0.05 ], [ s * 0.52, 0.62, z ], [ 0, axis - r - 0.02, z ] );

		}

	}

	return parts.build();

}

// A 20 t portal gantry crane over a 10 m (inside) shaft: the shaft's concrete collar standing a
// metre proud of the ground with a guard rail and toe board round it, crane rails on concrete
// beams either side, the gantry's end carriages and A-frame legs, two box girders 11 m up with the
// hoist trolley over the shaft and its hook block hanging down, and a ladder up one leg.
function shaftGantry() {

	const parts = new Parts();
	const span = 15;
	const girderY = 10;

	// Collar, the dark of the shaft inside it, and the guard rail on top.
	plan( parts, CONCRETE(), circle( 5.6, 64 ), 0, 1.0, [ circle( 5.0, 64 ).reverse() ] );
	parts.cylinder( BLACK(), 5.0, 0.01, [ 0, 0, 0 ], 48 );
	plan( parts, YELLOW(), circle( 5.33, 64 ), 1.0, 1.15, [ circle( 5.29, 64 ).reverse() ] );
	const ring = circle( 5.31, 40 ).map( ( [ x, z ] ) => [ x, 0, z ] );
	for ( const h of [ 1.55, 2.1 ] ) parts.path( YELLOW(), [ ...ring, ring[ 0 ] ].map( ( [ x, , z ] ) => [ x, h, z ] ), 0.022, 5, false );
	for ( let i = 0; i < 40; i += 2 ) parts.rod( YELLOW(), [ ring[ i ][ 0 ], 1.0, ring[ i ][ 2 ] ], [ ring[ i ][ 0 ], 2.1, ring[ i ][ 2 ] ], 0.025, 5 );

	for ( const s of [ - 1, 1 ] ) {

		const x = s * span / 2;

		// Rail beam and rail.
		parts.box( CONCRETE(), [ 0.6, 0.3, 18 ], [ x, 0, 0 ] );
		parts.box( STEEL(), [ 0.08, 0.1, 18 ], [ x, 0.3, 0 ] );

		// End carriage and its wheels.
		parts.box( YELLOW(), [ 0.5, 0.6, 7.6 ], [ x, 0.75, 0 ] );
		for ( const z of [ - 3.3, - 2.5, 2.5, 3.3 ] ) parts.rod( DARK(), [ x - 0.12, 0.7, z ], [ x + 0.12, 0.7, z ], 0.3, 14 );

		// A-frame legs, their tie and the girder end tie.
		const foot = 1.35;
		const legs = [ - 1, 1 ].map( d => [ [ x, foot, d * 3.2 ], [ x, girderY, d * 0.9 ] ] );
		for ( const [ a, b ] of legs ) member( parts, YELLOW(), [ 0.5, 0.5 ], a, b );
		const t = ( 5.5 - foot ) / ( girderY - foot );
		const tieZ = 3.2 - 2.3 * t;
		member( parts, YELLOW(), [ 0.3, 0.3 ], [ x, 5.5, - tieZ ], [ x, 5.5, tieZ ] );
		parts.box( YELLOW(), [ 0.7, 0.4, 2.6 ], [ x, girderY - 0.2, 0 ] );

	}

	// Main girders, the trolley rails on them and a walkway with its rail along the front one.
	for ( const z of [ - 0.9, 0.9 ] ) {

		parts.box( YELLOW(), [ span + 0.7, 1.2, 0.5 ], [ 0, girderY, z ] );
		parts.box( STEEL(), [ span + 0.4, 0.08, 0.07 ], [ 0, girderY + 1.2, z ] );

	}

	parts.box( GALV(), [ span - 1, 0.04, 0.7 ], [ 0, girderY, - 1.5 ] );
	for ( const h of [ 0.55, 1.1 ] ) parts.rod( YELLOW(), [ - ( span - 1 ) / 2, girderY + h, - 1.82 ], [ ( span - 1 ) / 2, girderY + h, - 1.82 ], 0.022, 5 );
	for ( let x = - ( span - 1 ) / 2; x <= ( span - 1 ) / 2 + 0.01; x += 1.75 ) parts.rod( YELLOW(), [ x, girderY, - 1.82 ], [ x, girderY + 1.1, - 1.82 ], 0.022, 5 );

	// Trolley over the shaft: frame, hoist drum, motor and gearbox, and the ropes down to the
	// hook block.
	const ty = girderY + 1.28;
	parts.box( YELLOW(), [ 2.4, 0.45, 2.5 ], [ 0, ty, 0 ] );
	parts.rod( DARK(), [ - 0.8, ty + 0.85, 0.3 ], [ 0.8, ty + 0.85, 0.3 ], 0.38, 18 );
	parts.box( DARK(), [ 0.6, 0.5, 0.55 ], [ 0.9, ty + 0.45, - 0.7 ] );
	parts.box( YELLOW(), [ 0.5, 0.6, 0.6 ], [ - 1.0, ty + 0.45, - 0.6 ] );
	const hookY = 4.4;
	for ( const x of [ - 0.25, 0.25 ] ) for ( const z of [ 0.15, 0.45 ] ) parts.rod( DARK(), [ x, hookY + 0.7, z ], [ x, ty, z ], 0.012, 4 );
	parts.box( YELLOW(), [ 0.75, 0.7, 0.45 ], [ 0, hookY, 0.3 ] );
	parts.rod( DARK(), [ 0, hookY - 0.35, 0.3 ], [ 0, hookY, 0.3 ], 0.07, 8 );
	parts.box( DARK(), [ 0.08, 0.2, 0.28 ], [ 0, hookY - 0.5, 0.3 ] );

	// Ladder up the right-hand end to the walkway.
	ladder( parts, YELLOW(), [ span / 2 + 0.45, - 2.0 ], 0, girderY, true );

	return parts.build();

}

// A 6.5 m soft-ground TBM cutterhead laid face up on four transport stands: the back drum and its
// flange, the face plate with the gauge ring round it, six spokes with 17 in disc cutters along
// them, muck openings with their bucket lips between, the centre cone with its twin cutters, and
// lifting lugs on the rim. About 2.8 m high.
function cutterhead() {

	const parts = new Parts();
	const R = 3.25;
	const face = mat( 0x6f7378, { roughness: 0.6, metalness: 0.5 } );
	const spoke = mat( 0x9a9ea2, { roughness: 0.5, metalness: 0.5 } );
	const body = paint( 0xd8a02a );
	const cutter = mat( 0xb9bdc1, { roughness: 0.3, metalness: 0.7 } );
	const stand = 0.8;

	// Stands.
	for ( let k = 0; k < 4; k ++ ) {

		const a = ( 45 + k * 90 ) * DEG;
		const [ x, z ] = [ 2.0 * Math.cos( a ), 2.0 * Math.sin( a ) ];
		parts.box( DARK(), [ 0.8, 0.04, 0.8 ], [ x, 0, z ] );
		parts.box( DARK(), [ 0.45, stand - 0.04, 0.45 ], [ x, 0.04, z ] );

	}

	// Back drum and flange, face plate and gauge ring.
	parts.cylinder( body, 2.3, 0.12, [ 0, stand, 0 ], 40 );
	parts.cylinder( body, 2.1, 1.1, [ 0, stand, 0 ], 40 );
	const plate = stand + 1.1;
	parts.cylinder( face, R, 0.35, [ 0, plate, 0 ], 56 );
	const top = plate + 0.35;
	plan( parts, face, circle( R, 56 ), top, top + 0.15, [ circle( R - 0.25, 56 ).reverse() ] );

	// Spokes with their cutters, and between them the muck openings and bucket lips.
	for ( let k = 0; k < 6; k ++ ) {

		const a = k * 60 * DEG;
		const u = [ Math.cos( a ), Math.sin( a ) ];
		const n = [ - u[ 1 ], u[ 0 ] ];
		parts.block( spoke, [ 0.55, 0.25, 2.5 ], [ u[ 0 ] * 1.75, top + 0.125, u[ 1 ] * 1.75 ], [ 0, Math.PI / 2 - a, 0 ] );
		for ( let j = 0; j < 6; j ++ ) {

			const r = 0.8 + j * 0.42;
			const off = ( j % 2 ? 1 : - 1 ) * 0.1;
			const c = [ u[ 0 ] * r + n[ 0 ] * off, top + 0.17, u[ 1 ] * r + n[ 1 ] * off ];
			parts.rod( cutter, [ c[ 0 ] - u[ 0 ] * 0.04, c[ 1 ], c[ 2 ] - u[ 1 ] * 0.04 ], [ c[ 0 ] + u[ 0 ] * 0.04, c[ 1 ], c[ 2 ] + u[ 1 ] * 0.04 ], 0.216, 14 );
			parts.block( DARK(), [ 0.2, 0.06, 0.5 ], [ c[ 0 ], top + 0.28, c[ 2 ] ], [ 0, - a, 0 ] );

		}

		const g = [ u[ 0 ] * ( R - 0.12 ), top + 0.2, u[ 1 ] * ( R - 0.12 ) ];
		parts.rod( cutter, [ g[ 0 ] - u[ 0 ] * 0.04, g[ 1 ], g[ 2 ] - u[ 1 ] * 0.04 ], [ g[ 0 ] + u[ 0 ] * 0.04, g[ 1 ], g[ 2 ] + u[ 1 ] * 0.04 ], 0.2, 14 );

		const b = a + 30 * DEG;
		const v = [ Math.cos( b ), Math.sin( b ) ];
		parts.block( BLACK(), [ 0.45, 0.02, 1.0 ], [ v[ 0 ] * 2.45, top + 0.005, v[ 1 ] * 2.45 ], [ 0, Math.PI / 2 - b, 0 ] );
		for ( const s of [ - 1, 1 ] ) {

			const w = [ - v[ 1 ] * s * 0.3, v[ 0 ] * s * 0.3 ];
			parts.block( DARK(), [ 0.1, 0.16, 0.9 ], [ v[ 0 ] * 2.45 + w[ 0 ], top + 0.08, v[ 1 ] * 2.45 + w[ 1 ] ], [ 0, Math.PI / 2 - b, 0 ] );

		}

		// A lug on the rim every other spoke.
		if ( k % 2 === 0 ) parts.block( DARK(), [ 0.06, 0.3, 0.3 ], [ v[ 0 ] * ( R - 0.12 ), top + 0.3, v[ 1 ] * ( R - 0.12 ) ], [ 0, Math.PI / 2 - b, 0 ] );

	}

	// Centre cone and its twin cutters.
	parts.cylinder( face, 0.7, 0.3, [ 0, top, 0 ], 24, 0.45 );
	for ( const [ x, z ] of [ [ 0, - 0.17 ], [ 0, 0.17 ] ] ) parts.rod( cutter, [ x - 0.04, top + 0.36, z ], [ x + 0.04, top + 0.36, z ], 0.2, 14 );

	return parts.build();

}

// --- formwork ----------------------------------------------------------------------------------

// A flying table form 8 ft wide and 20 ft long: a 3/4 in plywood deck on aluminium joists at 12 in,
// two aluminium stringers along it, and six shore legs on screw jacks with X bracing, set for a
// 10 ft storey (deck 3 m up).
function tableForm() {

	const parts = new Parts();
	const W = 8 * FT;
	const L = 20 * FT;
	const deckTop = 3.0;
	const ply = 0.019;
	const joist = 0.165;
	const stringer = 0.2;
	parts.box( PLY(), [ W, ply, L ], [ 0, deckTop - ply, 0 ] );
	const joistY = deckTop - ply - joist;
	for ( let z = - L / 2 + 0.15; z < L / 2; z += 1 * FT ) parts.box( ALU(), [ W, joist, 0.07 ], [ 0, joistY, z ] );
	const stringerY = joistY - stringer;
	for ( const s of [ - 1, 1 ] ) {

		const x = s * 0.75;
		parts.box( ALU(), [ 0.1, stringer, L ], [ x, stringerY, 0 ] );
		const legs = [ - 2.5, 0, 2.5 ];
		for ( const z of legs ) shoreLeg( parts, [ x, z ], stringerY, GALV() );
		for ( let i = 1; i < legs.length; i ++ ) {

			parts.rod( ALU(), [ x, 0.5, legs[ i - 1 ] ], [ x, stringerY - 0.3, legs[ i ] ], 0.02, 5 );
			parts.rod( ALU(), [ x, stringerY - 0.3, legs[ i - 1 ] ], [ x, 0.5, legs[ i ] ], 0.02, 5 );

		}

	}

	parts.rod( ALU(), [ - 0.75, 1.4, 0 ], [ 0.75, 1.4, 0 ], 0.02, 5 );
	return parts.build();

}

// A shore leg from the ground up to height `top` at (x, z): base plate, screw jack, the post with
// its pin collar, and a head plate.
function shoreLeg( parts, [ x, z ], top, material ) {

	parts.box( STEEL(), [ 0.15, 0.01, 0.15 ], [ x, 0, z ] );
	parts.rod( DARK(), [ x, 0.01, z ], [ x, 0.35, z ], 0.02, 6 );
	parts.rod( material, [ x, 0.3, z ], [ x, top - 0.06, z ], 0.045, 8 );
	parts.cylinder( DARK(), 0.06, 0.06, [ x, 0.32, z ], 8 );
	parts.box( STEEL(), [ 0.15, 0.06, 0.15 ], [ x, top - 0.06, z ] );

}

// One unit of a climbing (jump) form on the face of a core wall, 4.6 m wide: the last 4 m lift of
// the wall with its starter bars, the form for the next 4 m lift (plywood face, timber girders,
// walers and strongbacks) standing on the main working deck, which hangs off climbing brackets
// anchored to the wall; push-pull props from the deck to the form, the concreting deck at the top
// of the form, the finishing deck hung below, guard rails and ladders between the decks.
function climbingForm() {

	const parts = new Parts();
	const W = 4.6;
	const lift = 4.0;
	const frame = YELLOW();
	const plank = TIMBER();

	// The wall below and the bars sticking up from it.
	parts.box( CONCRETE(), [ W, lift, 0.3 ], [ 0, 0, 0.15 ] );
	for ( let x = - W / 2 + 0.15; x < W / 2; x += 0.3 ) {

		for ( const z of [ 0.07, 0.23 ] ) parts.rod( REBAR(), [ x, lift - 0.05, z ], [ x, lift + 1.0, z ], 0.0127, 5 );

	}

	// The form for the next lift.
	const top = lift * 2;
	parts.box( PLY(), [ W, lift, 0.021 ], [ 0, lift, - 0.0105 ] );
	for ( let x = - W / 2 + 0.17; x < W / 2; x += 0.33 ) parts.box( frame, [ 0.08, lift, 0.2 ], [ x, lift, - 0.121 ] );
	for ( const y of [ lift + 0.8, top - 0.8 ] ) parts.box( STEEL(), [ W, 0.14, 0.12 ], [ 0, y, - 0.281 ] );
	const backs = [ - 1.4, 1.4 ];
	for ( const x of backs ) parts.box( DARK(), [ 0.16, lift + 0.6, 0.14 ], [ x, lift, - 0.411 ] );

	// Main deck on the climbing brackets, its props to the form and its rail.
	const deck = lift;
	const depth = 2.5;
	parts.box( plank, [ W, 0.05, depth - 0.05 ], [ 0, deck - 0.05, - 0.05 - ( depth - 0.05 ) / 2 ] );
	for ( const x of backs ) {

		parts.box( DARK(), [ 0.14, 0.22, depth ], [ x, deck - 0.27, - depth / 2 ] );
		member( parts, DARK(), [ 0.12, 0.12 ], [ x, deck - 1.5, - 0.06 ], [ x, deck - 0.27, - depth + 0.5 ] );
		parts.box( STEEL(), [ 0.3, 0.3, 0.02 ], [ x, deck - 0.45, - 0.01 ] );
		parts.rod( STEEL(), [ x, deck, - 1.8 ], [ x, deck + 2.6, - 0.5 ], 0.04, 8 );

	}

	railing( parts, [ - W / 2, W / 2 ], [ - depth, - 0.05 ], deck, [ 0, 1, 3 ], frame );

	// Concreting deck at the top of the form, on brackets off the strongbacks.
	const upper = top - 1.1;
	parts.box( plank, [ W, 0.05, 1.0 ], [ 0, upper - 0.05, - 0.98 ] );
	for ( const x of backs ) {

		parts.box( DARK(), [ 0.1, 0.15, 1.0 ], [ x, upper - 0.2, - 0.98 ] );
		member( parts, DARK(), [ 0.08, 0.08 ], [ x, upper - 0.8, - 0.48 ], [ x, upper - 0.2, - 1.3 ] );

	}

	railing( parts, [ - W / 2, W / 2 ], [ - 1.48, - 0.48 ], upper, [ 0, 1, 3 ], frame );

	// Finishing deck hung under the main deck.
	const lower = deck - 2.2;
	parts.box( plank, [ W, 0.05, 1.3 ], [ 0, lower - 0.05, - 0.7 ] );
	for ( const x of backs ) {

		parts.box( DARK(), [ 0.1, 0.12, 1.3 ], [ x, lower - 0.17, - 0.7 ] );
		parts.rod( DARK(), [ x, lower - 0.17, - 1.15 ], [ x, deck - 0.27, - 1.15 ], 0.03, 6 );

	}

	railing( parts, [ - W / 2, W / 2 ], [ - 1.35, - 0.05 ], lower, [ 0, 1, 3 ], frame );

	// Ladders between the decks.
	ladder( parts, STEEL(), [ 1.9, - 0.9 ], lower, deck );
	ladder( parts, STEEL(), [ - 1.9, - 1.0 ], deck, upper );

	return parts.build();

}

// A single-sided wall form 16 ft long and 12 ft high, as set against shoring to pour a basement
// wall: the plywood face (to the back, where the concrete goes), timber girders at 12 in, three
// walers, and three A-frame braces with their anchors to the slab.
function singleSidedForm() {

	const parts = new Parts();
	const L = 16 * FT;
	const H = 12 * FT;
	const frame = YELLOW();
	parts.box( PLY(), [ L, H, 0.021 ], [ 0, 0, 0.0105 ] );
	for ( let x = - L / 2 + 0.15; x < L / 2; x += 1 * FT ) parts.box( frame, [ 0.08, H, 0.2 ], [ x, 0, - 0.1 ] );
	for ( const y of [ 0.5, 1.8, 3.1 ] ) parts.box( STEEL(), [ L, 0.12, 0.12 ], [ 0, y, - 0.26 ] );

	const back = - 0.38;
	const reach = - 2.5;
	for ( const x of [ - 1.65, 0, 1.65 ] ) {

		member( parts, frame, [ 0.12, 0.12 ], [ x, 0, back ], [ x, H, back ] );
		member( parts, frame, [ 0.12, 0.12 ], [ x, 0.06, back ], [ x, 0.06, reach ] );
		const high = [ x, H - 0.3, back - 0.06 ];
		const low = [ x, 0.12, reach + 0.05 ];
		member( parts, frame, [ 0.12, 0.12 ], low, high );
		const along = t => low.map( ( v, i ) => v + ( high[ i ] - v ) * t );
		member( parts, frame, [ 0.08, 0.08 ], [ x, 1.4, back - 0.06 ], along( ( 1.4 - 0.12 ) / ( H - 0.42 ) ) );
		member( parts, frame, [ 0.08, 0.08 ], [ x, 0.12, back - 0.1 ], along( ( 2.4 - 0.12 ) / ( H - 0.42 ) ) );

		// Anchor to the slab: plate, rod and nut.
		parts.box( DARK(), [ 0.2, 0.02, 0.2 ], [ x, 0.12, reach + 0.3 ] );
		parts.rod( DARK(), [ x, 0, reach + 0.42 ], [ x, 0.3, reach + 0.18 ], 0.014, 6 );

	}

	return parts.build();

}

// A 24 in fibre tube column form 12 ft high: the tube with its spiral seam, a plywood template
// and cleats at the base, a 2x4 yoke 2.6 m up with four 2x4 braces to stakes in the ground, and
// the cage's bars standing out of the top.
function roundColumnForm() {

	const parts = new Parts();
	const H = 12 * FT;
	const r = 12 * IN + 0.006;
	const tube = mat( 0x8f8576, { roughness: 0.75 } );
	const lumber = mat( 0xc2a06e, { roughness: 0.9 } );
	parts.cylinder( tube, r, H, [ 0, 0, 0 ], 28 );

	// Spiral seam, one turn every 0.6 m.
	const seam = [];
	for ( let a = 0; a * 0.6 / ( Math.PI * 2 ) < H - 0.05; a += 0.3 ) seam.push( [ ( r + 0.002 ) * Math.cos( a ), 0.03 + a * 0.6 / ( Math.PI * 2 ), ( r + 0.002 ) * Math.sin( a ) ] );
	parts.path( mat( 0x6d6558, { roughness: 0.8 } ), seam, 0.004, 4, false );

	// Template and cleats at the base, and the yoke.
	parts.box( PLY(), [ 0.9, 0.019, 0.9 ], [ 0, 0, 0 ] );
	for ( const [ y, w ] of [ [ 0.019, 0.9 ], [ 2.6, 0.8 ] ] ) {

		const o = r + 0.019;
		for ( const s of [ - 1, 1 ] ) {

			parts.box( lumber, [ w, 0.089, 0.038 ], [ 0, y, s * o ] );
			parts.box( lumber, [ 0.038, 0.089, w ], [ s * o, y, 0 ] );

		}

	}

	// Braces and stakes.
	for ( const [ dx, dz ] of [ [ 1, 0 ], [ - 1, 0 ], [ 0, 1 ], [ 0, - 1 ] ] ) {

		const o = r + 0.06;
		member( parts, lumber, [ 0.089, 0.038 ], [ dx * o, 2.62, dz * o ], [ dx * 2.0, 0.03, dz * 2.0 ] );
		parts.box( lumber, [ 0.05, 0.4, 0.05 ], [ dx * 2.05 + dz * 0.06, 0, dz * 2.05 + dx * 0.06 ] );

	}

	// Bars out of the top and a tie round them.
	const bars = [];
	for ( let i = 0; i < 8; i ++ ) {

		const a = i / 8 * Math.PI * 2;
		bars.push( [ 0.23 * Math.cos( a ), 0.23 * Math.sin( a ) ] );
		parts.rod( REBAR(), [ bars[ i ][ 0 ], H - 0.05, bars[ i ][ 1 ] ], [ bars[ i ][ 0 ], H + 0.6, bars[ i ][ 1 ] ], 0.0127, 5 );

	}

	const tie = circle( 0.245, 16 ).map( ( [ x, z ] ) => [ x, H + 0.35, z ] );
	parts.path( REBAR(), [ ...tie, tie[ 0 ] ], 0.0064, 4, false );
	return parts.build();

}

// One 4 x 4 m bay of slab shoring for a 10 ft storey: nine post shores (three under each of three
// aluminium stringers) with their U-heads, aluminium joists at 300 mm across the stringers and a
// plywood deck on top, 3 m up.
function slabShoring() {

	const parts = new Parts();
	const size = 4;
	const deckTop = 3.0;
	const ply = 0.019;
	const joist = 0.165;
	const stringer = 0.2;
	const post = paint( 0xc8452c );
	parts.box( PLY(), [ size, ply, size ], [ 0, deckTop - ply, 0 ] );
	const joistY = deckTop - ply - joist;
	for ( let x = - 1.8; x <= 1.81; x += 0.3 ) parts.box( ALU(), [ 0.07, joist, size ], [ x, joistY, 0 ] );
	const stringerY = joistY - stringer;
	for ( const z of [ - 1.5, 0, 1.5 ] ) {

		parts.box( ALU(), [ size, stringer, 0.1 ], [ 0, stringerY, z ] );
		for ( const x of [ - 1.5, 0, 1.5 ] ) {

			parts.box( STEEL(), [ 0.15, 0.008, 0.15 ], [ x, 0, z ] );
			parts.rod( post, [ x, 0.008, z ], [ x, 1.7, z ], 0.032, 8 );
			parts.cylinder( DARK(), 0.045, 0.08, [ x, 1.66, z ], 8 );
			parts.rod( GALV(), [ x, 1.7, z ], [ x, stringerY - 0.05, z ], 0.025, 8 );
			parts.box( STEEL(), [ 0.16, 0.05, 0.14 ], [ x, stringerY - 0.05, z ] );
			for ( const s of [ - 1, 1 ] ) parts.box( STEEL(), [ 0.16, 0.15, 0.01 ], [ x, stringerY, z + s * 0.056 ] );

		}

	}

	return parts.build();

}

// A column cage for a 24 in square column, 12 ft high, standing on the ground: twelve #8 bars
// with #4 ties every 12 in, held up by four 2x4 braces to stakes.
function columnCage() {

	const parts = new Parts();
	const H = 12 * FT;
	const a = 0.53 / 2 - 0.0127;
	const lumber = mat( 0xc2a06e, { roughness: 0.9 } );
	const steps = [ - a, - a / 3, a / 3, a ];
	const bars = new Set();
	for ( const u of steps ) for ( const v of [ - a, a ] ) {

		bars.add( `${ u },${ v }` );
		bars.add( `${ v },${ u }` );

	}

	for ( const key of bars ) {

		const [ x, z ] = key.split( ',' ).map( Number );
		parts.rod( REBAR(), [ x, 0, z ], [ x, H, z ], 0.0127, 6 );

	}

	const t = a + 0.019;
	for ( let y = 0.15; y < H; y += 1 * FT ) {

		const loop = [ [ - t, y, - t ], [ t, y, - t ], [ t, y, t ], [ - t, y, t ], [ - t, y, - t ] ];
		parts.path( REBAR(), loop, 0.0064, 4, false );

	}

	for ( const [ dx, dz ] of [ [ 1, 0 ], [ - 1, 0 ], [ 0, 1 ], [ 0, - 1 ] ] ) {

		const o = t + 0.03;
		member( parts, lumber, [ 0.089, 0.038 ], [ dx * o, 2.7, dz * o ], [ dx * 1.8, 0.03, dz * 1.8 ] );
		parts.box( lumber, [ 0.05, 0.4, 0.05 ], [ dx * 1.85 + dz * 0.06, 0, dz * 1.85 + dx * 0.06 ] );

	}

	return parts.build();

}

// A 48 x 40 in pallet with a wire-mesh stillage on it, holding bundles of snap ties, boxes of
// wedges and cones, and a pail of form oil.
function accessoriesPallet() {

	const parts = new Parts();
	const wood = mat( 0xb08d5e, { roughness: 0.95 } );
	const [ px, pz ] = [ 40 * IN, 48 * IN ];
	for ( const z of [ - 0.56, 0, 0.56 ] ) parts.box( wood, [ px, 0.019, 0.1 ], [ 0, 0, z ] );
	for ( const x of [ - 0.47, 0, 0.47 ] ) parts.box( wood, [ 0.038, 0.09, pz ], [ x, 0.019, 0 ] );
	for ( let i = 0; i < 7; i ++ ) parts.box( wood, [ px, 0.019, 0.14 ], [ 0, 0.109, - pz / 2 + 0.07 + i * ( pz - 0.14 ) / 6 ] );
	const base = 0.128;

	// Stillage: floor, corner posts, top frame and mesh.
	const [ hx, hz, h ] = [ 0.48, 0.58, 0.8 ];
	parts.box( STEEL(), [ 2 * hx, 0.01, 2 * hz ], [ 0, base, 0 ] );
	for ( const x of [ - hx, hx ] ) for ( const z of [ - hz, hz ] ) parts.box( GALV(), [ 0.04, h, 0.04 ], [ x, base, z ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( GALV(), [ 2 * hx, 0.03, 0.03 ], [ 0, base + h - 0.03, s * hz ] );
		parts.box( GALV(), [ 0.03, 0.03, 2 * hz ], [ s * hx, base + h - 0.03, 0 ] );
		for ( let x = - hx + 0.1; x < hx; x += 0.1 ) parts.rod( GALV(), [ x, base, s * hz ], [ x, base + h, s * hz ], 0.003, 3 );
		for ( let z = - hz + 0.1; z < hz; z += 0.1 ) parts.rod( GALV(), [ s * hx, base, z ], [ s * hx, base + h, z ], 0.003, 3 );
		for ( let y = base + 0.1; y < base + h; y += 0.1 ) {

			parts.rod( GALV(), [ - hx, y, s * hz ], [ hx, y, s * hz ], 0.003, 3 );
			parts.rod( GALV(), [ s * hx, y, - hz ], [ s * hx, y, hz ], 0.003, 3 );

		}

	}

	// Contents: two layers of tie bundles, boxes, and the pail.
	const ties = mat( 0x4a4d50, { roughness: 0.6, metalness: 0.5 } );
	for ( let layer = 0; layer < 2; layer ++ ) {

		for ( let i = 0; i < 4; i ++ ) {

			const x = - 0.4 + i * 0.16;
			const y = base + 0.01 + layer * 0.09;
			parts.box( ties, [ 0.13, 0.08, 1.0 ], [ x, y, - 0.03 ] );
			for ( const z of [ - 0.3, 0.25 ] ) parts.box( BRIGHT(), [ 0.135, 0.085, 0.02 ], [ x, y, z ] );

		}

	}

	const card = mat( 0xa6814f, { roughness: 0.9 } );
	parts.box( card, [ 0.4, 0.28, 0.3 ], [ - 0.22, base + 0.18, 0.2 ] );
	parts.box( card, [ 0.3, 0.22, 0.3 ], [ - 0.2, base + 0.18, - 0.25 ] );
	parts.cylinder( mat( 0xe8e6df, { roughness: 0.6 } ), 0.15, 0.37, [ 0.3, base + 0.01, 0.38 ], 18 );
	parts.cylinder( paint( 0x2463a8 ), 0.152, 0.04, [ 0.3, base + 0.38, 0.38 ], 18 );
	parts.box( ORANGE(), [ 0.26, 0.2, 0.35 ], [ 0.3, base + 0.01, - 0.2 ] );
	return parts.build();

}

// --- interior and fit-out ----------------------------------------------------------------------

// A flat-deck drywall cart (4 x 10 ft deck on 8 in casters) loaded with 40 sheets of 5/8 in
// board, 4 x 12 ft, overhanging a foot at each end, with its pull handle down in front.
function drywallCart() {

	const parts = new Parts();
	const deck = 0.3;
	const [ cw, cl ] = [ 4 * FT, 10 * FT ];
	parts.box( DARK(), [ cw, 0.06, cl ], [ 0, deck - 0.06, 0 ] );
	for ( const x of [ - 0.5, 0.5 ] ) for ( const z of [ - 1.3, 1.3 ] ) {

		parts.box( DARK(), [ 0.06, 0.1, 0.12 ], [ x, 0.14, z ] );
		parts.rod( BLACK(), [ x - 0.025, 0.1, z ], [ x + 0.025, 0.1, z ], 0.1, 14 );

	}

	// Side uprights and the handle.
	for ( const x of [ - cw / 2 - 0.02, cw / 2 + 0.02 ] ) for ( const z of [ - 1.4, 1.4 ] ) parts.box( DARK(), [ 0.03, 0.4, 0.03 ], [ x, deck - 0.06, z ] );
	parts.rod( DARK(), [ 0, 0.22, - cl / 2 ], [ 0, 0.33, - cl / 2 - 0.9 ], 0.016, 6 );
	parts.rod( DARK(), [ - 0.2, 0.33, - cl / 2 - 0.9 ], [ 0.2, 0.33, - cl / 2 - 0.9 ], 0.016, 6 );

	// The board: a stack of 40 sheets, white faced, with the end tape.
	const stack = 40 * 0.625 * IN;
	const [ sw, sl ] = [ 4 * FT, 12 * FT ];
	parts.box( mat( 0xd4d2cb, { roughness: 0.9 } ), [ sw, stack, sl ], [ 0, deck, 0 ] );
	parts.box( mat( 0xeeece6, { roughness: 0.9 } ), [ sw, 0.003, sl ], [ 0, deck + stack, 0 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( mat( 0x7d8a99, { roughness: 0.8 } ), [ sw, stack, 0.004 ], [ 0, deck, s * sl / 2 ] );
	for ( let i = 1; i < 4; i ++ ) for ( const s of [ - 1, 1 ] ) parts.box( mat( 0xb3b0a8, { roughness: 0.9 } ), [ 0.004, 0.003, sl ], [ s * sw / 2, deck + i * stack / 4, 0 ] );
	return parts.build();

}

// A material lift of the 25 ft class set up and raised to about 20 ft: four legs out to casters,
// the base with its winch and crank, four telescoping mast sections, and the fork carriage with
// a 10 ft length of 24 in spiral duct lying across the forks.
function materialLift() {

	const parts = new Parts();
	const body = paint( 0x3a3f45 );

	// Legs and casters.
	for ( const x of [ - 1, 1 ] ) for ( const z of [ - 1, 1 ] ) {

		const foot = [ x * 0.92, 0.12, z * 0.9 ];
		member( parts, body, [ 0.08, 0.08 ], [ 0, 0.16, 0 ], foot );
		parts.box( DARK(), [ 0.04, 0.08, 0.1 ], [ foot[ 0 ], 0.06, foot[ 2 ] ] );
		parts.rod( BLACK(), [ foot[ 0 ] - 0.025, 0.06, foot[ 2 ] ], [ foot[ 0 ] + 0.025, 0.06, foot[ 2 ] ], 0.06, 12 );

	}

	// Base, winch and crank, and the two transport wheels behind.
	parts.box( body, [ 0.5, 0.35, 0.42 ], [ 0, 0.1, 0.02 ] );
	parts.rod( DARK(), [ 0.25, 0.3, 0.12 ], [ 0.4, 0.3, 0.12 ], 0.07, 12 );
	parts.rod( BRIGHT(), [ 0.4, 0.3, 0.12 ], [ 0.42, 0.45, 0.12 ], 0.012, 5 );
	parts.rod( BLACK(), [ 0.42, 0.45, 0.12 ], [ 0.52, 0.45, 0.12 ], 0.016, 6 );
	for ( const s of [ - 1, 1 ] ) parts.rod( BLACK(), [ s * 0.3, 0.13, 0.3 ], [ s * 0.36, 0.13, 0.3 ], 0.13, 14 );

	// Mast: four sections, each a little narrower and higher than the last.
	let y = 0.45;
	for ( let k = 0; k < 4; k ++ ) {

		parts.box( ALU(), [ 0.24 - k * 0.025, 1.6, 0.2 - k * 0.02 ], [ 0, y, 0 ] );
		y += 1.35;

	}

	const mastTop = y - 1.35 + 1.6;

	// Fork carriage near the top of the mast, the forks and the duct on them.
	const forkY = mastTop - 0.45;
	parts.box( DARK(), [ 0.7, 0.4, 0.06 ], [ 0, forkY, - 0.15 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( DARK(), [ 0.08, 0.04, 0.85 ], [ s * 0.25, forkY, - 0.18 - 0.425 ] );
	const duct = [ 0, forkY + 0.04 + 0.305, - 0.62 ];
	parts.rod( GALV(), [ - 1.52, duct[ 1 ], duct[ 2 ] ], [ 1.52, duct[ 1 ], duct[ 2 ] ], 0.305, 24 );
	for ( let x = - 1.4; x <= 1.41; x += 0.2 ) parts.rod( mat( 0x8f9396, { roughness: 0.5, metalness: 0.6 } ), [ x - 0.01, duct[ 1 ], duct[ 2 ] ], [ x + 0.01, duct[ 1 ], duct[ 2 ] ], 0.309, 24 );
	for ( const x of [ - 0.25, 0.25 ] ) parts.rod( ORANGE(), [ x - 0.02, duct[ 1 ], duct[ 2 ] ], [ x + 0.02, duct[ 1 ], duct[ 2 ] ], 0.315, 16 );
	return parts.build();

}

// A 1 yd³ tilt truck as used to clear debris off a floor: the moulded grey body with its sloped
// nose to the front, the steel base frame, two big wheels in the middle and casters at the ends,
// the push handle at the back, and a heap of debris in it.
function tiltTruck() {

	const parts = new Parts();
	const body = mat( 0x4d5359, { roughness: 0.7 } );
	const W = 0.84;
	const profile = [ [ - 0.92, 1.09 ], [ 0.91, 1.09 ], [ 0.91, 0.55 ], [ 0.6, 0.28 ], [ - 0.5, 0.28 ] ];
	parts.prism( body, profile, W );
	parts.box( BLACK(), [ W - 0.1, 0.004, 1.7 ], [ 0, 1.09, 0 ] );
	parts.box( body, [ W + 0.04, 0.04, 1.87 ], [ 0, 1.07, 0 ] );
	const debris = mat( 0x7d6b58, { roughness: 1 } );
	parts.sphere( debris, 1, [ 0, 1.06, 0.05 ], [ 14, 6 ], [ 0.34, 0.12, 0.72 ] );
	parts.block( TIMBER(), [ 0.08, 0.04, 0.9 ], [ 0.1, 1.15, - 0.1 ], [ 0.2, 0.4, 0 ] );
	parts.block( mat( 0xd8d6cf, { roughness: 0.9 } ), [ 0.35, 0.016, 0.5 ], [ - 0.12, 1.14, 0.35 ], [ 0.25, - 0.3, 0.1 ] );

	// Base frame, wheels and casters, and the handle.
	parts.box( DARK(), [ W - 0.1, 0.06, 1.2 ], [ 0, 0.22, 0.05 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.rod( BLACK(), [ s * 0.44, 0.14, 0.1 ], [ s * 0.5, 0.14, 0.1 ], 0.14, 16 );
		parts.rod( BRIGHT(), [ s * 0.435, 0.14, 0.1 ], [ s * 0.505, 0.14, 0.1 ], 0.06, 10 );

	}

	parts.rod( DARK(), [ - 0.44, 0.14, 0.1 ], [ 0.44, 0.14, 0.1 ], 0.02, 6 );
	for ( const z of [ - 0.4, 0.55 ] ) {

		parts.box( DARK(), [ 0.04, 0.1, 0.06 ], [ 0, 0.12, z ] );
		parts.rod( BLACK(), [ - 0.02, 0.06, z ], [ 0.02, 0.06, z ], 0.06, 12 );

	}

	parts.path( DARK(), [ [ - 0.3, 0.9, 0.91 ], [ - 0.3, 0.95, 1.0 ], [ 0.3, 0.95, 1.0 ], [ 0.3, 0.9, 0.91 ] ], 0.016, 6 );
	return parts.build();

}

// A towable 12 ft³ paddle mortar mixer: the half-round tub across the axle with its safety grate
// and paddle shaft, the frame and two tyres, the petrol engine and belt guard at the back, the
// dump lever on the left, and the tow bar and jack stand to the front.
function mortarMixer() {

	const parts = new Parts();
	const orange = mat( 0xe2731f, { roughness: 0.5, metalness: 0.2, side: DoubleSide } );
	const r = 0.45;
	const len = 1.2;
	const axis = 1.0;

	// Tub: the half-pipe and its two ends, with a lip round the top.
	const pipe = new CylinderGeometry( r, r, len, 20, 1, true, Math.PI, Math.PI );
	pipe.rotateZ( Math.PI / 2 );
	parts.add( orange, pipe, _m.makeTranslation( 0, axis, 0 ) );
	for ( const s of [ - 1, 1 ] ) {

		const end = new CircleGeometry( r, 12, Math.PI, Math.PI );
		end.rotateY( Math.PI / 2 );
		parts.add( orange, end, _m.makeTranslation( s * len / 2, axis, 0 ) );

	}

	for ( const s of [ - 1, 1 ] ) parts.rod( orange, [ - len / 2, axis, s * r ], [ len / 2, axis, s * r ], 0.02, 6 );

	// Grate, paddle shaft and blades.
	for ( let x = - 0.55; x <= 0.551; x += 0.1 ) parts.rod( DARK(), [ x, axis + 0.02, - r ], [ x, axis + 0.02, r ], 0.008, 4 );
	for ( const z of [ - 0.2, 0.2 ] ) parts.rod( DARK(), [ - len / 2, axis + 0.03, z ], [ len / 2, axis + 0.03, z ], 0.012, 4 );
	parts.rod( STEEL(), [ - 0.68, axis - 0.1, 0 ], [ 0.68, axis - 0.1, 0 ], 0.03, 8 );
	for ( let i = 0; i < 4; i ++ ) parts.block( STEEL(), [ 0.04, 0.3, 0.18 ], [ - 0.45 + i * 0.3, axis - 0.25, 0 ], [ i * 0.8, 0, 0 ] );

	// Frame and wheels.
	const axleY = 0.25;
	parts.rod( DARK(), [ - 0.7, axleY, 0 ], [ 0.7, axleY, 0 ], 0.03, 8 );
	for ( const s of [ - 1, 1 ] ) {

		const x = s * 0.64;
		member( parts, orange, [ 0.06, 0.06 ], [ x, axleY, - 0.3 ], [ x, axis - 0.1, 0 ] );
		member( parts, orange, [ 0.06, 0.06 ], [ x, axleY, 0.3 ], [ x, axis - 0.1, 0 ] );
		member( parts, orange, [ 0.06, 0.06 ], [ x, axleY, - 0.3 ], [ x, axleY, 0.3 ] );
		tyre( parts, 0.25, 0.12, [ s * 0.69, axleY, 0 ] );

	}

	// Engine on a plate behind the tub, and its belt guard.
	parts.box( orange, [ 0.6, 0.03, 0.42 ], [ 0.1, 0.55, 0.68 ] );
	member( parts, orange, [ 0.05, 0.05 ], [ 0.1, 0.56, 0.45 ], [ 0.1, axleY, 0.3 ] );
	parts.box( mat( 0xb3262a, { roughness: 0.5, metalness: 0.2 } ), [ 0.42, 0.36, 0.36 ], [ 0.05, 0.58, 0.7 ] );
	parts.cylinder( DARK(), 0.09, 0.12, [ - 0.08, 0.94, 0.7 ], 12 );
	parts.box( orange, [ 0.04, 0.5, 0.75 ], [ 0.62, 0.55, 0.3 ] );

	// Dump lever on the left.
	parts.rod( DARK(), [ - 0.66, axis - 0.1, 0 ], [ - 0.7, 1.32, - 0.35 ], 0.016, 6 );
	parts.rod( BLACK(), [ - 0.7, 1.32, - 0.35 ], [ - 0.7, 1.36, - 0.4 ], 0.022, 6 );

	// Tow bar, hitch and jack stand.
	for ( const s of [ - 1, 1 ] ) member( parts, orange, [ 0.06, 0.06 ], [ s * 0.62, axleY + 0.03, - 0.3 ], [ 0, 0.42, - 1.2 ] );
	member( parts, orange, [ 0.07, 0.07 ], [ 0, 0.42, - 1.2 ], [ 0, 0.42, - 1.55 ] );
	parts.cylinder( DARK(), 0.05, 0.05, [ 0, 0.4, - 1.6 ], 10 );
	parts.rod( DARK(), [ 0, 0.05, - 1.15 ], [ 0, 0.55, - 1.15 ], 0.025, 6 );
	parts.box( DARK(), [ 0.15, 0.02, 0.15 ], [ 0, 0, - 1.15 ] );
	return parts.build();

}

// A modular scaffold stair tower, 5 x 10 ft, three lifts of 2 m: standards on base jacks, ledgers
// and braces, an aluminium flight in each lift switching sides and direction, a landing at each
// end of each lift, the top deck, guard rails round the outside and handrails up the flights.
function stairTower() {

	const parts = new Parts();
	const hx = 1.57 / 2;
	const hz = 3.07 / 2;
	const lift = 2.0;
	const lifts = 3;
	const top = lift * lifts;
	const tube = 0.024;
	const ledger = ( a, b ) => parts.rod( GALV(), a, b, tube, 6 );

	// Standards on base jacks.
	for ( const x of [ - hx, hx ] ) for ( const z of [ - hz, hz ] ) {

		parts.box( STEEL(), [ 0.15, 0.006, 0.15 ], [ x, 0, z ] );
		parts.rod( DARK(), [ x, 0.006, z ], [ x, 0.3, z ], 0.019, 6 );
		parts.rod( GALV(), [ x, 0.25, z ], [ x, top + 1.05, z ], tube, 8 );

	}

	// Ledgers round the bottom and every lift, and a brace up each long side in every lift.
	const ring = y => {

		for ( const s of [ - 1, 1 ] ) {

			ledger( [ - hx, y, s * hz ], [ hx, y, s * hz ] );
			ledger( [ s * hx, y, - hz ], [ s * hx, y, hz ] );

		}

	};

	ring( 0.4 );
	for ( let i = 0; i < lifts; i ++ ) {

		for ( const s of [ - 1, 1 ] ) parts.rod( GALV(), [ s * hx, 0.4 + i * lift, - hz ], [ s * hx, ( i + 1 ) * lift, hz ], 0.02, 6 );

	}

	// Guard rails round the outside at every level above the ground.
	for ( let i = 1; i <= lifts; i ++ ) {

		const y = i * lift;
		ring( y );
		ring( y + 0.5 );
		ring( y + 1.0 );

	}

	// Flights: the first from the front up to the back on the left, then switching.
	const land = 0.5;
	const run = hz - land;
	const tread = mat( 0xb5bbc0, { roughness: 0.55, metalness: 0.5 } );
	for ( let i = 0; i < lifts; i ++ ) {

		const dir = i % 2 ? - 1 : 1;
		const xs = i % 2 ? 0.42 : - 0.42;
		const base = i * lift;
		const z0 = - dir * run;
		const z1 = dir * run;
		for ( const e of [ - 0.33, 0.33 ] ) member( parts, ALU(), [ 0.04, 0.16 ], [ xs + e, base + 0.05, z0 ], [ xs + e, base + lift, z1 ] );
		for ( let k = 1; k < 10; k ++ ) parts.box( tread, [ 0.66, 0.03, 0.22 ], [ xs, base + k * 0.2 - 0.03, z0 + ( z1 - z0 ) * k / 10 ] );

		// Handrail up the inner side.
		const inner = xs - Math.sign( xs ) * 0.36;
		parts.rod( GALV(), [ inner, base + 0.95, z0 ], [ inner, base + lift + 0.95, z1 ], 0.02, 6 );
		for ( const z of [ z0, z1 ] ) parts.rod( GALV(), [ inner, base + ( z === z0 ? 0 : lift ), z ], [ inner, base + ( z === z0 ? 0 : lift ) + 0.95, z ], 0.02, 6 );

		// Landing at the top of the flight.
		const y = base + lift;
		parts.box( tread, [ 2 * hx, 0.04, land ], [ 0, y - 0.04, dir * ( hz - land / 2 ) ] );

	}

	// Top deck: the half of the bay the last flight isn't in.
	const lastX = ( lifts - 1 ) % 2 ? 0.42 : - 0.42;
	parts.box( tread, [ hx, 0.04, 2 * run ], [ - Math.sign( lastX ) * hx / 2, top - 0.04, 0 ] );
	return parts.build();

}
