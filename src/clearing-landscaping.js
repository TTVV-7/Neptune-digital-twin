import { MathUtils, Vector3 } from 'three';
import { IN, mat, Parts } from './parts.js';
import { memberGeometry } from './plant-parts.js';
import { cab, conveyor, tracks } from './heavy-civil.js';
import { front as diggingFront } from './earthmoving.js';
import { truck } from './road-plant.js';

// Land clearing, forestry and landscaping plant built in code at the sizes of the common North
// American classes (no brands): the clearing spread for a greenfield, solar farm or right-of-way
// (a tracked forestry mulcher and a skid steer mulching head, a feller buncher, a grapple skidder
// and a horizontal grinder to chip the slash), the landscaper's machines (a tow-behind chipper, a
// tracked stump grinder, a tree spade truck, a compact tractor loader backhoe, a stand-on compact
// loader, a trommel screener for topsoil and compost and a bark blower truck), a roadside boom
// mower and sod on pallets. Like the other built-in pieces each stands on y = 0 with its front
// facing -Z (+X is its right).

const DEG = MathUtils.DEG2RAD;

export const CLEARING_LANDSCAPING_ITEMS = [
	// Clearing and forestry.
	{ id: 'forestry-mulcher-tracked', name: 'Forestry mulcher, tracked (500 hp class, 8 ft drum head, guarded cab)', category: 'Heavy equipment',
		keywords: 'forestry mulcher mulching tractor land clearing brush cutter right of way row clearing drum mulcher prinoth raptor fae track mulcher masticator',
		build: forestryMulcher },
	{ id: 'ss-forestry-mulcher', name: 'Skid steer forestry mulcher attachment (72 in drum)', category: 'Heavy equipment',
		keywords: 'skid steer mulcher forestry mulcher head drum mulcher brush cutter attachment quick attach land clearing masticator',
		build: ssMulcher },
	{ id: 'feller-buncher', name: 'Feller buncher, tracked (hot saw disc head, levelling cab)', category: 'Heavy equipment',
		keywords: 'feller buncher buncher hot saw disc saw felling head tree harvester logging forestry land clearing tigercat track feller',
		build: fellerBuncher },
	{ id: 'grapple-skidder', name: 'Grapple skidder (4WD articulated, front blade, rear grapple)', category: 'Heavy equipment',
		keywords: 'skidder grapple skidder logging forestry drag logs land clearing articulated arch tongs',
		build: grappleSkidder },
	{ id: 'horizontal-grinder', name: 'Horizontal grinder, tracked (HG6800 class, infeed apron, stacking conveyor)', category: 'Material handling',
		keywords: 'horizontal grinder tub grinder wood grinder mulch grinder chipper land clearing debris slash stumps green waste vermeer hog',
		build: horizontalGrinder },

	// Landscaping and tree work.
	{ id: 'wood-chipper-12in', name: 'Wood chipper, tow-behind (12 in drum, feed table, swivel discharge chute)', category: 'Landscaping & site context',
		keywords: 'wood chipper brush chipper chipper tree service arborist drum chipper bandit vermeer tow behind',
		build: woodChipper },
	{ id: 'stump-grinder-tracked', name: 'Stump grinder, tracked self-propelled (SC362 class, 23 in cutter wheel)', category: 'Landscaping & site context',
		keywords: 'stump grinder stump cutter stump removal tree service cutter wheel tracked',
		build: stumpGrinder },
	{ id: 'tree-spade-truck', name: 'Tree spade truck (90 in spade, raised, Class 7)', category: 'Landscaping & site context',
		keywords: 'tree spade tree mover tree transplanter big john spade truck transplant nursery landscaping',
		build: treeSpadeTruck },
	{ id: 'compact-tractor-tlb', name: 'Compact tractor loader backhoe (25 hp class, ROPS, front loader and rear backhoe)', category: 'Heavy equipment',
		keywords: 'compact tractor tlb tractor loader backhoe sub compact kubota bx landscaping small backhoe front end loader',
		build: compactTractor },
	{ id: 'compact-utility-loader', name: 'Stand-on compact utility loader (Dingo class, 4-in-1 bucket)', category: 'Heavy equipment',
		keywords: 'mini skid steer stand on loader compact utility loader dingo mini track loader walk behind landscaping 4 in 1 bucket',
		build: compactUtilityLoader },
	{ id: 'trommel-screener', name: 'Trommel screener, tracked (5 × 15 ft drum, topsoil and compost, 3 conveyors out)', category: 'Material handling',
		keywords: 'trommel screen trommel screener topsoil screener compost screen drum screen soil screening organics mulch',
		build: trommel },
	{ id: 'sod-pallet-stack', name: 'Sod rolls on pallets (4 pallets, ~500 ft² each)', category: 'Materials',
		keywords: 'sod turf grass rolls pallets lawn landscaping sod rolls skids',
		build: sodPallets },
	{ id: 'bark-blower-truck', name: 'Bark / mulch blower truck (50 yd³ box, hose boom and reel)', category: 'Vehicles',
		keywords: 'bark blower blower truck mulch blower express blower pneumatic mulch soil blower compost blower landscaping',
		build: barkBlower },
	{ id: 'tractor-boom-mower', name: 'Tractor with side boom flail mower (100 hp, 20 ft reach, ROPS cab)', category: 'Landscaping & site context',
		keywords: 'boom mower side mower flail mower slope mower ditch mower right of way roadside mowing tractor brush cutter vegetation',
		build: boomMower },
];

// --- colours -----------------------------------------------------------------------------------

const paint = color => mat( color, { roughness: 0.5, metalness: 0.2 } );
const YELLOW = () => paint( 0xe2a41c );
const RED = () => paint( 0xb5312a );
const WHITE = () => paint( 0xe9e8e2 );
const GREY = () => paint( 0x6d7175 );
const DARK = () => mat( 0x2c2e31, { roughness: 0.7, metalness: 0.2 } );
const BLACK = () => mat( 0x18191b, { roughness: 0.85 } );
const RUBBER = () => mat( 0x161718, { roughness: 0.9 } );
const STEEL = () => mat( 0x7d8287, { roughness: 0.5, metalness: 0.6 } );
const BRIGHT = () => mat( 0xc9ccce, { roughness: 0.35, metalness: 0.3 } );
const GLASS = () => mat( 0x2b3d48, { roughness: 0.1, metalness: 0.3 } );
const HOSE = () => mat( 0x1c1c1d, { roughness: 0.75 } );
const AMBER = () => mat( 0xff9a1a, { roughness: 0.3, emissive: 0xc76a00, emissiveIntensity: 0.6 } );
const TIMBER = () => mat( 0x9a7a52, { roughness: 0.95 } );
const SOIL = () => mat( 0x4f3d2c, { roughness: 1 } );
const GRASS = () => mat( 0x4f7a32, { roughness: 1 } );
const BARK = () => mat( 0x6a4a30, { roughness: 1 } );

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

// A rubber tyre on its rim, its axle across x and its middle `radius` up at (x, z). `lugs` puts
// that many tread bars round it (a skidder's or a tractor's tyre).
function tyre( parts, radius, width, [ x, z ], { rim = STEEL(), lugs = 0 } = {} ) {

	const body = lugs ? radius * 0.95 : radius;
	parts.rod( RUBBER(), [ x - width / 2, radius, z ], [ x + width / 2, radius, z ], body, 22 );
	parts.rod( rim, [ x - width / 2 - 0.01, radius, z ], [ x + width / 2 + 0.01, radius, z ], radius * 0.55, 14 );
	for ( let i = 0; i < lugs; i ++ ) {

		const a = i / lugs * Math.PI * 2;
		const rho = radius * 0.97;
		parts.block( RUBBER(), [ width * 0.96, radius * 0.06, radius * 0.14 ], [ x, radius - Math.cos( a ) * rho, z + Math.sin( a ) * rho ], [ Math.PI - a, 0, 0 ] );

	}

}

// Guard bars over a window: `count` round bars between two points' lines, from a0..a1 to b0..b1.
function bars( parts, material, a0, a1, b0, b1, count, radius = 0.018 ) {

	for ( let i = 0; i < count; i ++ ) {

		const t = ( i + 0.5 ) / count;
		parts.rod( material, v( a0 ).lerp( v( a1 ), t ).toArray(), v( b0 ).lerp( v( b1 ), t ).toArray(), radius, 5 );

	}

}

// A plate cut to a side profile (points [ z, y ]), `thick` across, centred on x.
function plate( parts, material, points, thick, x ) {

	parts.prism( material, points, thick, x );

}

// The universal quick-attach plate on the back of a skid steer attachment: the plate standing
// across x, its bottom at y0 and its face at z (the attachment ahead of it, -Z), with the top lip
// the loader's arms hook under and the two wedge slots at the bottom.
function quickAttach( parts, material, [ y0, z ], width = 44 * IN ) {

	const high = 18 * IN;
	parts.box( material, [ width, high, 0.012 ], [ 0, y0, z ] );
	parts.block( material, [ width, 0.012, 0.07 ], [ 0, y0 + high, z + 0.03 ], [ - 30 * DEG, 0, 0 ] );
	for ( const x of [ - width / 2 + 0.03, width / 2 - 0.03 ] ) parts.box( material, [ 0.012, high, 0.08 ], [ x, y0, z + 0.04 ] );
	for ( const x of [ - 0.36, 0.36 ] ) parts.box( DARK(), [ 0.07, 0.05, 0.014 ], [ x, y0 + 0.03, z + 0.001 ] );

}

// A mulching drum lying across x: the drum, and rows of carbide teeth round it in a chevron.
function drum( parts, radius, length, [ y, z ], teeth = 14 ) {

	parts.rod( DARK(), [ - length / 2, y, z ], [ length / 2, y, z ], radius, 18 );
	const rows = 8;
	for ( let j = 0; j < teeth; j ++ ) {

		const x = - length / 2 + ( j + 0.5 ) * length / teeth;
		for ( let i = 0; i < rows; i ++ ) {

			const a = ( i / rows + Math.abs( x ) / length * 0.5 ) * Math.PI * 2;
			parts.block( STEEL(), [ 0.05, 0.07, 0.06 ], [ x, y + Math.sin( a ) * ( radius + 0.03 ), z + Math.cos( a ) * ( radius + 0.03 ) ], [ - a, 0, 0 ] );

		}

	}

}

// An operator's seat facing -Z with its cushion top at y.
function seat( parts, [ x, y, z ], width = 0.5 ) {

	parts.box( BLACK(), [ width, 0.1, 0.48 ], [ x, y - 0.1, z ] );
	parts.block( BLACK(), [ width, 0.55, 0.1 ], [ x, y + 0.25, z + 0.24 ], [ - 10 * DEG, 0, 0 ] );

}

// --- forestry mulcher ----------------------------------------------------------------------------

// A 500 hp class tracked mulching tractor (about 6.4 m long with its head, 2.7 m wide and 3.4 m
// high): wide steel tracks, the cab forward in the middle behind polycarbonate and a bar guard,
// the engine and its big cooling package behind, and the 2.5 m (8 ft) drum head on its lift arms
// in front, set on the ground with its push bar and the drum's teeth showing under the hood.
function forestryMulcher() {

	const parts = new Parts();
	const body = RED();
	const dark = DARK();
	const track = { length: 4.3, width: 2.55, shoe: 0.6, height: 0.85 };
	tracks( parts, track, 0, 0.5 );

	// Main frame and belly pan over the tracks, the engine compartment behind with grilles and the
	// cooling package across the back, and the exhaust stack.
	const deck = track.height + 0.05;
	parts.box( dark, [ 1.7, 0.35, 4.4 ], [ 0, deck - 0.1, 0.4 ] );
	parts.box( body, [ 2.35, 1.45, 2.3 ], [ 0, deck + 0.25, 1.45 ] );
	parts.box( body, [ 2.35, 0.25, 0.4 ], [ 0, deck, 2.4 ] );
	parts.box( dark, [ 2.2, 1.15, 0.06 ], [ 0, deck + 0.4, 2.62 ] );
	for ( let i = 0; i < 8; i ++ ) parts.box( BLACK(), [ 2.1, 0.03, 0.03 ], [ 0, deck + 0.48 + i * 0.13, 2.66 ] );
	for ( const s of [ - 1, 1 ] ) for ( let i = 0; i < 6; i ++ ) parts.box( dark, [ 0.02, 0.04, 1.4 ], [ s * 1.18, deck + 0.6 + i * 0.13, 1.4 ] );
	parts.box( dark, [ 2.0, 0.04, 1.2 ], [ 0, deck + 1.7, 1.6 ] );
	parts.cylinder( BLACK(), 0.08, 0.55, [ 0.75, deck + 1.7, 0.75 ], 10 );
	parts.cylinder( BLACK(), 0.11, 0.08, [ 0.75, deck + 2.25, 0.75 ], 10 );

	// Cab: forward in the middle, a heavy roof, glazed all round with a bar guard over the front
	// and side windows, and work lights along the roof.
	const c = { w: 1.55, h: 2.1, l: 1.75, y: deck + 0.25, z: - 0.65 };
	parts.box( body, [ c.w + 0.1, 0.25, c.l + 0.3 ], [ 0, deck, c.z ] );
	cab( parts, [ c.w, c.h, c.l ], [ 0, c.y, c.z ], body );
	parts.box( body, [ c.w + 0.18, 0.12, c.l + 0.2 ], [ 0, c.y + c.h, c.z ] );
	const front = c.z - c.l / 2 - 0.08;
	const top = c.y + c.h - 0.05;
	const sill = c.y + c.h * 0.42;
	bars( parts, dark, [ - c.w / 2, sill, front ], [ c.w / 2, sill, front ], [ - c.w / 2, top, front ], [ c.w / 2, top, front ], 7 );
	for ( const s of [ - 1, 1 ] ) {

		const x = s * ( c.w / 2 + 0.08 );
		bars( parts, dark, [ x, sill, c.z - c.l / 2 ], [ x, sill, c.z + c.l / 2 - 0.2 ], [ x, top, c.z - c.l / 2 ], [ x, top, c.z + c.l / 2 - 0.2 ], 6 );
		for ( const y of [ sill, top ] ) parts.rod( dark, [ x, y, c.z - c.l / 2 ], [ x, y, c.z + c.l / 2 ], 0.03, 6 );

	}

	for ( const y of [ sill, top ] ) parts.rod( dark, [ - c.w / 2, y, front ], [ c.w / 2, y, front ], 0.03, 6 );
	for ( const x of [ - 0.5, - 0.2, 0.2, 0.5 ] ) parts.box( AMBER(), [ 0.16, 0.1, 0.06 ], [ x, c.y + c.h + 0.02, front + 0.03 ] );

	// The head: a housing across the front with end plates (skids) on the ground, the drum under
	// it, the push bar along the front, and the lift arms and rams back to the frame.
	const hw = 2.6;
	const hz = - 2.85;
	parts.prism( body, [ [ hz - 0.65, 0.55 ], [ hz - 0.55, 0.95 ], [ hz + 0.1, 1.2 ], [ hz + 0.45, 1.2 ], [ hz + 0.45, 0.25 ], [ hz + 0.3, 0.25 ], [ hz + 0.3, 1.05 ], [ hz - 0.5, 0.85 ], [ hz - 0.58, 0.55 ] ], hw - 0.06 );
	for ( const s of [ - 1, 1 ] ) plate( parts, dark, [ [ hz - 0.75, 0.05 ], [ hz - 0.55, 0 ], [ hz + 0.5, 0 ], [ hz + 0.5, 1.2 ], [ hz + 0.05, 1.25 ], [ hz - 0.65, 0.95 ], [ hz - 0.8, 0.4 ] ], 0.05, s * ( hw / 2 - 0.025 ) );
	drum( parts, 0.33, hw - 0.12, [ 0.42, hz - 0.1 ], 16 );
	parts.rod( dark, [ - hw / 2, 0.75, hz - 0.78 ], [ hw / 2, 0.75, hz - 0.78 ], 0.07, 10 );
	for ( const x of [ - 0.9, 0, 0.9 ] ) member( parts, dark, [ 0.08, 0.1 ], [ x, 0.75, hz - 0.78 ], [ x, 0.95, hz - 0.55 ] );
	for ( const s of [ - 1, 1 ] ) {

		member( parts, dark, [ 0.18, 0.28 ], [ s * 0.72, 0.85, hz + 0.45 ], [ s * 0.72, 1.0, - 1.35 ] );
		ram( parts, 0.07, [ s * 0.4, 1.25, - 1.6 ], [ s * 0.4, 1.15, hz + 0.45 ] );

	}

	// The drive motor on the head's right end and its hoses back to the frame.
	parts.rod( dark, [ hw / 2, 0.42, hz - 0.1 ], [ hw / 2 + 0.12, 0.42, hz - 0.1 ], 0.2, 14 );
	for ( const d of [ - 0.05, 0.05 ] ) parts.path( HOSE(), [ [ hw / 2 - 0.2, 1.2, hz + 0.3 + d ], [ 0.9, 1.4, - 1.6 + d ], [ 0.9, 1.15, - 1.3 + d ] ], 0.03, 6 );

	return parts.build();

}

// --- skid steer mulcher ------------------------------------------------------------------------

// A 72 in skid steer mulching head sitting on its skids (about 2.2 m wide, 1.0 m front to back and
// 0.95 m high): the hood and end plates, the drum's teeth showing under the open front with a push
// bar ahead, the motor on its right end with hoses up to the quick-attach plate behind.
function ssMulcher() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();
	const width = 2.1;
	const back = 0.48;

	// Hood over the drum: a bent plate from the front lip over the top to the back plate.
	parts.prism( body, [ [ - 0.42, 0.42 ], [ - 0.2, 0.82 ], [ 0.42, 0.9 ], [ back, 0.9 ], [ back, 0.15 ], [ back - 0.02, 0.15 ], [ back - 0.02, 0.87 ], [ 0.4, 0.87 ], [ - 0.21, 0.79 ], [ - 0.4, 0.42 ] ], width - 0.04 );
	for ( const s of [ - 1, 1 ] ) plate( parts, dark, [ [ - 0.48, 0.08 ], [ - 0.38, 0 ], [ back, 0 ], [ back, 0.9 ], [ 0.42, 0.93 ], [ - 0.22, 0.85 ], [ - 0.48, 0.45 ] ], 0.03, s * ( width / 2 - 0.015 ) );
	drum( parts, 0.2, 72 * IN, [ 0.3, 0.02 ], 12 );

	// Push bar across the front and a depth-limiting bar along the bottom at the back.
	parts.rod( dark, [ - width / 2, 0.5, - 0.5 ], [ width / 2, 0.5, - 0.5 ], 0.035, 8 );
	for ( const x of [ - 0.7, 0, 0.7 ] ) member( parts, dark, [ 0.05, 0.06 ], [ x, 0.5, - 0.5 ], [ x, 0.62, - 0.3 ] );
	parts.box( dark, [ width - 0.06, 0.08, 0.06 ], [ 0, 0.12, back - 0.05 ] );

	// The motor on the right end, hoses over the top to the plate, and the plate itself.
	parts.rod( dark, [ width / 2, 0.3, 0.02 ], [ width / 2 + 0.16, 0.3, 0.02 ], 0.13, 14 );
	for ( const d of [ - 0.05, 0.05 ] ) parts.path( HOSE(), [ [ width / 2 + 0.1, 0.42, 0.02 + d ], [ width / 2 + 0.05, 0.85, 0.2 + d ], [ width / 2 - 0.2, 0.93, 0.35 + d ], [ 0.45 + d, 0.93, back - 0.04 ], [ 0.35 + d, 0.72, back + 0.05 ] ], 0.018, 6 );
	quickAttach( parts, body, [ 0.32, back ] );

	return parts.build();

}

// --- feller buncher ----------------------------------------------------------------------------

// A tracked feller buncher of the 30 t class (about 11 m long with its head on the ground, 3.4 m
// wide and 5 m high to the boom): tracks, the levelling base (a wedge frame and rams under the upper that
// keep the cab level on a slope), the upper with a large forward cab on the left, the engine and
// counterweight at the back, and the boom and stick on the right holding the hot saw head
// upright on the ground in front: the saw housing with its disc at the bottom, the head's frame,
// and the accumulating and grab arms.
function fellerBuncher() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();
	const track = { length: 4.7, width: 3.4, shoe: 0.6, height: 1.05 };
	tracks( parts, track, 0, 0 );

	// Levelling base: a frame on the car body, the tilt pivot, and the rams each side.
	const base = track.height;
	parts.box( dark, [ 2.0, 0.35, 2.2 ], [ 0, base, 0 ] );
	parts.rod( STEEL(), [ - 0.9, base + 0.45, - 0.8 ], [ 0.9, base + 0.45, - 0.8 ], 0.12, 12 );
	for ( const s of [ - 1, 1 ] ) ram( parts, 0.1, [ s * 0.75, base + 0.1, 0.9 ], [ s * 0.75, base + 0.6, 0.5 ] );
	const swing = base + 0.65;
	parts.cylinder( BLACK(), 1.05, 0.2, [ 0, swing - 0.2, 0 ], 24 );

	// The upper: deck, engine housing and counterweight at the back, walkway rails.
	const deck = swing;
	parts.box( body, [ 3.1, 0.35, 4.6 ], [ 0, deck, 0.6 ] );
	parts.box( body, [ 3.05, 1.3, 2.3 ], [ 0, deck + 0.35, 1.75 ] );
	parts.box( dark, [ 3.1, 0.95, 0.5 ], [ 0, deck + 0.1, 3.05 ] );
	for ( let i = 0; i < 5; i ++ ) parts.box( dark, [ 0.02, 0.04, 1.4 ], [ 1.535, deck + 0.6 + i * 0.16, 1.8 ] );
	parts.box( dark, [ 2.4, 0.04, 1.0 ], [ 0, deck + 1.65, 2.1 ] );
	parts.cylinder( BLACK(), 0.08, 0.5, [ 1.0, deck + 1.65, 1.2 ], 10 );

	// Cab, large and forward on the left, with bars over the front window and a roof lights bar.
	const c = { w: 1.45, h: 2.1, l: 2.0, x: - 0.75, z: - 0.75 };
	cab( parts, [ c.w, c.h, c.l ], [ c.x, deck + 0.35, c.z ], body );
	const fz = c.z - c.l / 2 - 0.05;
	const y0 = deck + 0.35 + c.h * 0.15;
	const y1 = deck + 0.35 + c.h - 0.05;
	bars( parts, dark, [ c.x - c.w / 2, y0, fz ], [ c.x + c.w / 2, y0, fz ], [ c.x - c.w / 2, y1, fz ], [ c.x + c.w / 2, y1, fz ], 6 );
	for ( const x of [ c.x - 0.4, c.x + 0.4 ] ) parts.box( AMBER(), [ 0.16, 0.1, 0.06 ], [ x, deck + 0.35 + c.h + 0.05, fz + 0.05 ] );

	// The boom on the right: foot brackets on the deck, then the boom, stick and their rams.
	for ( const x of [ 0.35, 1.05 ] ) parts.box( body, [ 0.12, 0.85, 1.2 ], [ x, deck + 0.35, - 1.1 ] );
	const f = diggingFront( parts, body, { foot: [ 0.7, deck + 0.95, - 1.3 ], boom: [ 42, 2.6, - 8, 2.6 ], stick: [ - 82, 1.65 ], section: [ 0.42, 0.6 ] } );

	// The head, upright under the stick's end: the wrist, the frame, the saw housing on the ground
	// with its disc inside, and the curved arms.
	const hz = f.end.z - 0.45;
	const top = f.end.y + 0.1;
	parts.box( dark, [ 0.5, 0.4, 0.5 ], [ f.x, top - 0.35, f.end.z ] );
	parts.box( body, [ 1.0, top - 0.75, 0.55 ], [ f.x, 0.45, hz + 0.1 ] );
	parts.cylinder( body, 0.85, 0.42, [ f.x, 0.02, hz - 0.35 ], 26 );
	parts.cylinder( STEEL(), 0.8, 0.06, [ f.x, 0.22, hz - 0.35 ], 26 );
	parts.box( dark, [ 1.75, 0.08, 0.2 ], [ f.x, 0, hz - 0.35 ] );
	for ( const s of [ - 1, 1 ] ) {

		for ( const [ y, reach ] of [ [ 1.1, 0.6 ], [ 1.75, 0.5 ] ] ) {

			parts.path( dark, [ [ f.x + s * 0.45, y, hz - 0.1 ], [ f.x + s * 0.75, y, hz - 0.4 ], [ f.x + s * reach, y, hz - 0.85 ], [ f.x + s * 0.1, y, hz - 0.95 ] ], 0.06, 6 );

		}

	}

	// Hoses from the stick down to the head.
	parts.path( HOSE(), [ [ f.x + 0.3, f.end.y + 0.5, f.end.z + 0.3 ], [ f.x + 0.35, top - 0.1, hz + 0.5 ], [ f.x + 0.3, 1.2, hz + 0.4 ] ], 0.035, 6 );

	return parts.build();

}

// --- grapple skidder ---------------------------------------------------------------------------

// A 4WD articulated grapple skidder of the 200 hp class on 30.5L-32 forestry tyres (about 7.4 m
// long, 3.4 m wide and 3.2 m high): the blade on the front frame with the engine hood behind it,
// the guarded cab over the articulation, and the rear frame with the arch and the grapple boom
// reaching back, its tongs hanging open to the ground.
function grappleSkidder() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();
	const r = 0.88;
	const tw = 0.78;
	const gauge = 3.4 / 2 - tw / 2;
	const fa = - 1.95;
	const ra = 1.75;

	// Wheels and axles, chains on the front ones would show as lugs, so all have bar treads.
	for ( const z of [ fa, ra ] ) {

		parts.rod( dark, [ - gauge, r, z ], [ gauge, r, z ], 0.12, 10 );
		parts.box( dark, [ 1.1, 0.4, 0.5 ], [ 0, r - 0.2, z ] );
		for ( const s of [ - 1, 1 ] ) tyre( parts, r, tw, [ s * gauge, z ], { rim: dark, lugs: 18 } );

	}

	// Front frame, the engine hood with its grille and stack, and fenders.
	parts.box( dark, [ 1.1, 0.55, 3.4 ], [ 0, 0.7, - 1.75 ] );
	parts.box( body, [ 1.25, 1.05, 2.0 ], [ 0, 1.15, - 2.15 ] );
	parts.box( BLACK(), [ 1.05, 0.75, 0.04 ], [ 0, 1.3, - 3.17 ] );
	parts.cylinder( BLACK(), 0.07, 0.6, [ 0.4, 2.2, - 2.0 ], 10 );
	for ( const s of [ - 1, 1 ] ) {

		for ( const z of [ fa, ra ] ) {

			parts.box( body, [ tw + 0.06, 0.06, 1.3 ], [ s * gauge, r * 2 + 0.06, z ] );
			parts.box( dark, [ 0.08, r * 2 + 0.06 - 0.9, 0.3 ], [ s * ( gauge - tw / 2 - 0.08 ), 0.9, z ] );

		}

	}

	// Blade on two push arms and its lift rams.
	parts.prism( body, [ [ - 3.55, 0.03 ], [ - 3.45, 0.03 ], [ - 3.35, 0.9 ], [ - 3.45, 1.15 ], [ - 3.62, 1.15 ], [ - 3.55, 0.9 ], [ - 3.65, 0.2 ] ], 3.4 );
	for ( const s of [ - 1, 1 ] ) {

		member( parts, dark, [ 0.14, 0.18 ], [ s * 0.6, 0.55, - 3.4 ], [ s * 0.45, 0.6, - 2.4 ] );
		ram( parts, 0.06, [ s * 0.5, 1.1, - 3.0 ], [ s * 0.55, 0.7, - 3.4 ] );

	}

	// Articulation hitch and the cab over it, guarded with bars over every window.
	parts.box( dark, [ 0.7, 0.5, 0.6 ], [ 0, 0.65, - 0.1 ] );
	const c = { w: 1.65, h: 1.85, l: 1.55, y: 1.35, z: - 0.4 };
	parts.box( dark, [ 1.9, 0.12, 1.7 ], [ 0, c.y - 0.12, c.z ] );
	cab( parts, [ c.w, c.h, c.l ], [ 0, c.y, c.z ], body );
	const y0 = c.y + c.h * 0.3;
	const y1 = c.y + c.h - 0.05;
	const fz = c.z - c.l / 2 - 0.05;
	bars( parts, dark, [ - c.w / 2, y0, fz ], [ c.w / 2, y0, fz ], [ - c.w / 2, y1, fz ], [ c.w / 2, y1, fz ], 6 );
	for ( const s of [ - 1, 1 ] ) bars( parts, dark, [ s * ( c.w / 2 + 0.05 ), y0, c.z - c.l / 2 ], [ s * ( c.w / 2 + 0.05 ), y0, c.z + c.l / 2 ], [ s * ( c.w / 2 + 0.05 ), y1, c.z - c.l / 2 ], [ s * ( c.w / 2 + 0.05 ), y1, c.z + c.l / 2 ], 5 );
	parts.box( body, [ c.w + 0.2, 0.12, c.l + 0.2 ], [ 0, c.y + c.h, c.z ] );

	// Rear frame with the fuel and hydraulic tanks, the arch, and the grapple boom from its top.
	parts.box( dark, [ 1.1, 0.55, 2.6 ], [ 0, 0.7, 1.55 ] );
	parts.box( body, [ 1.6, 0.7, 1.4 ], [ 0, 1.25, 1.1 ] );
	for ( const s of [ - 1, 1 ] ) {

		member( parts, body, [ 0.22, 0.28 ], [ s * 0.6, 1.25, 1.9 ], [ s * 0.45, 2.75, 2.3 ] );
		member( parts, body, [ 0.16, 0.2 ], [ s * 0.6, 1.25, 2.85 ], [ s * 0.45, 2.75, 2.3 ] );

	}

	parts.rod( body, [ - 0.55, 2.75, 2.3 ], [ 0.55, 2.75, 2.3 ], 0.12, 10 );
	member( parts, body, [ 0.3, 0.35 ], [ 0, 2.8, 2.0 ], [ 0, 2.6, 3.5 ] );
	ram( parts, 0.08, [ 0, 1.95, 2.3 ], [ 0, 2.55, 3.2 ] );

	// The grapple: rotator under the boom's end and two tongs hanging open to the ground.
	const gz = 3.5;
	parts.cylinder( dark, 0.14, 0.3, [ 0, 2.15, gz ], 12 );
	parts.box( dark, [ 0.6, 0.3, 0.35 ], [ 0, 1.85, gz ] );
	for ( const s of [ - 1, 1 ] ) {

		const tong = [ [ s * 0.25, 1.9, gz ], [ s * 0.95, 1.55, gz ], [ s * 1.15, 0.85, gz ], [ s * 0.95, 0.25, gz ], [ s * 0.65, 0.08, gz ] ];
		for ( const dz of [ - 0.15, 0.15 ] ) parts.path( dark, tong.map( ( [ x, y, z ] ) => [ x, y, z + dz ] ), 0.06, 6 );
		parts.rod( dark, [ s * 1.12, 0.9, gz - 0.15 ], [ s * 1.12, 0.9, gz + 0.15 ], 0.05, 6 );

	}

	return parts.build();

}

// --- horizontal grinder ------------------------------------------------------------------------

// A tracked horizontal grinder of the 1,000 hp class (about 18.5 m long working, 3.2 m wide, 3.8 m
// high to its engine hood and 4.6 m at the conveyor's head): the infeed apron at the back where the excavator loads the slash, its
// floor chain and the feed roll housing, the mill box in the middle, the engine enclosure forward,
// and the discharge conveyor coming out under it to stack the chips in front.
function horizontalGrinder() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();
	const track = { length: 5.4, width: 3.2, shoe: 0.6, height: 1.0 };
	tracks( parts, track, 0, 0.6 );

	// Main frame: two deep rails with the conveyor between them.
	const rail = track.height;
	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.35, 0.6, 12.2 ], [ s * 0.95, rail - 0.1, 1.2 ] );

	// Infeed apron: a trough at the back, its floor chain slats and the flared sides.
	const a0 = 1.3;
	const a1 = 7.3;
	const floor = rail + 0.5;
	parts.box( dark, [ 1.8, 0.1, a1 - a0 ], [ 0, floor, ( a0 + a1 ) / 2 ] );
	for ( let z = a0 + 0.2; z < a1; z += 0.4 ) parts.box( BLACK(), [ 1.7, 0.04, 0.08 ], [ 0, floor + 0.1, z ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.block( body, [ 0.05, 1.25, a1 - a0 ], [ s * 1.2, floor + 0.65, ( a0 + a1 ) / 2 ], [ 0, 0, s * - 20 * DEG ] );
		parts.box( dark, [ 0.12, 0.12, a1 - a0 ], [ s * 1.42, floor + 1.15, ( a0 + a1 ) / 2 ] );

	}

	parts.box( body, [ 2.0, 0.5, 0.06 ], [ 0, floor + 0.05, a1 ] );

	// Feed roll housing over the apron's front end, the feed roll showing in its mouth.
	parts.box( body, [ 2.9, 2.0, 1.2 ], [ 0, floor, 0.55 ] );
	parts.rod( dark, [ - 1.0, floor + 0.55, 1.2 ], [ 1.0, floor + 0.55, 1.2 ], 0.45, 16 );
	parts.box( dark, [ 2.95, 0.12, 1.25 ], [ 0, floor + 2.0, 0.55 ] );

	// Mill box in front of it with the access hood, then the engine enclosure.
	parts.box( body, [ 2.9, 1.7, 1.4 ], [ 0, rail + 0.3, - 0.75 ] );
	parts.box( dark, [ 2.95, 0.08, 1.3 ], [ 0, rail + 2.0, - 0.75 ] );
	const e0 = - 1.5;
	const e1 = - 4.9;
	parts.box( body, [ 2.8, 2.25, e0 - e1 ], [ 0, rail + 0.5, ( e0 + e1 ) / 2 ] );
	parts.box( dark, [ 2.85, 0.08, e0 - e1 + 0.05 ], [ 0, rail + 2.75, ( e0 + e1 ) / 2 ] );
	for ( const s of [ - 1, 1 ] ) {

		for ( let i = 0; i < 9; i ++ ) parts.box( dark, [ 0.02, 0.04, 2.0 ], [ s * 1.41, rail + 0.9 + i * 0.16, e1 + 1.3 ] );
		parts.box( GREY(), [ 0.04, 1.0, 0.8 ], [ s * 1.41, rail + 0.8, e0 - 0.6 ] );

	}

	parts.box( BLACK(), [ 2.6, 1.6, 0.05 ], [ 0, rail + 0.8, e1 - 0.02 ] );
	parts.cylinder( BLACK(), 0.13, 0.75, [ - 0.7, rail + 2.83, e0 - 0.8 ], 12 );
	parts.box( dark, [ 0.9, 0.5, 1.3 ], [ 0.6, rail + 2.83, e0 - 1.2 ] );
	parts.box( AMBER(), [ 0.12, 0.12, 0.12 ], [ 1.2, rail + 2.83, e0 - 0.3 ] );
	parts.box( dark, [ 2.8, 0.25, e0 - e1 ], [ 0, rail + 0.25, ( e0 + e1 ) / 2 ] );

	// Discharge conveyor from under the mill, out through the front and up to the stockpile.
	const tail = [ 0, 0.75, - 0.8 ];
	const bend = [ 0, 0.9, e1 - 0.2 ];
	const head = [ 0, 4.1, e1 - 6.0 ];
	conveyor( parts, tail, bend, 1.1 );
	conveyor( parts, bend, head, 1.1 );
	for ( const s of [ - 1, 1 ] ) parts.rod( dark, [ s * 0.75, rail + 0.5, e1 + 0.3 ], [ s * 0.7, 2.6, e1 - 3.4 ], 0.07, 8 );
	parts.box( dark, [ 1.3, 0.5, 0.4 ], [ 0, 3.85, e1 - 6.05 ] );

	return parts.build();

}

// --- wood chipper ------------------------------------------------------------------------------

// A 12 in drum chipper on a single-axle trailer (about 4.8 m long from the hitch to the feed
// table, 1.85 m wide and 2.6 m high to its chute): the tongue and hitch at the front, the engine
// enclosure, the drum housing with the discharge chute rising from it and swung forward, the feed
// roller box, the infeed hopper and its fold-down feed table at the back with the bottom feed
// control bar.
function woodChipper() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();

	// Axle, wheels and fenders, the frame and the tongue with the coupler and jack.
	const r = 0.36;
	parts.rod( dark, [ - 0.82, r, 0.45 ], [ 0.82, r, 0.45 ], 0.05, 8 );
	for ( const s of [ - 1, 1 ] ) {

		tyre( parts, r, 0.22, [ s * 0.8, 0.45 ] );
		parts.box( dark, [ 0.28, 0.04, 0.9 ], [ s * 0.8, r * 2 + 0.05, 0.45 ] );
		parts.box( dark, [ 0.03, 0.22, 0.9 ], [ s * 0.665, 0.56, 0.45 ] );

	}

	parts.box( dark, [ 1.3, 0.16, 3.0 ], [ 0, 0.48, 0.1 ] );
	member( parts, dark, [ 0.1, 0.12 ], [ - 0.5, 0.56, - 1.3 ], [ 0, 0.48, - 2.3 ] );
	member( parts, dark, [ 0.1, 0.12 ], [ 0.5, 0.56, - 1.3 ], [ 0, 0.48, - 2.3 ] );
	parts.box( dark, [ 0.14, 0.1, 0.18 ], [ 0, 0.43, - 2.36 ] );
	parts.cylinder( dark, 0.04, 0.5, [ 0.12, 0.0, - 2.0 ], 8 );
	parts.cylinder( dark, 0.08, 0.02, [ 0.12, 0.0, - 2.0 ], 10 );

	// Engine enclosure with grilles, the fuel tank under it, and the drum housing behind.
	parts.box( body, [ 1.6, 1.05, 1.35 ], [ 0, 0.64, - 1.05 ] );
	parts.box( dark, [ 1.62, 0.05, 1.37 ], [ 0, 1.69, - 1.05 ] );
	for ( const s of [ - 1, 1 ] ) for ( let i = 0; i < 5; i ++ ) parts.box( dark, [ 0.02, 0.03, 0.7 ], [ s * 0.81, 0.85 + i * 0.12, - 1.1 ] );
	parts.cylinder( BLACK(), 0.05, 0.3, [ - 0.55, 1.69, - 1.4 ], 8 );
	parts.box( body, [ 1.35, 1.0, 0.95 ], [ 0, 0.64, 0.12 ] );
	parts.rod( dark, [ - 0.69, 1.1, 0.12 ], [ 0.69, 1.1, 0.12 ], 0.32, 18 );

	// Discharge chute: the swivel ring on top of the drum housing, the pipe up and the deflector
	// at its top turned forward over the tongue.
	parts.cylinder( dark, 0.24, 0.08, [ 0, 1.64, 0.12 ], 14 );
	parts.rod( body, [ 0, 1.68, 0.12 ], [ 0, 2.3, 0.12 ], 0.18, 14 );
	parts.path( body, [ [ 0, 2.3, 0.12 ], [ 0, 2.45, - 0.05 ], [ 0, 2.45, - 0.45 ] ], 0.17, 14 );
	parts.block( body, [ 0.36, 0.04, 0.4 ], [ 0, 2.5, - 0.6 ], [ - 0.35, 0, 0 ] );

	// Feed roller box, then the hopper flaring out to its mouth and the feed table.
	parts.box( body, [ 1.05, 0.85, 0.5 ], [ 0, 0.7, 0.85 ] );
	parts.box( dark, [ 0.1, 0.3, 0.3 ], [ 0.6, 1.15, 0.85 ] );
	const mouth = 1.75;
	const m = { w: 1.35, h: 0.9, y: 0.75 };
	parts.box( body, [ m.w, 0.05, mouth - 1.1 ], [ 0, m.y, ( mouth + 1.1 ) / 2 ] );
	parts.box( body, [ m.w, 0.05, mouth - 1.1 ], [ 0, m.y + m.h, ( mouth + 1.1 ) / 2 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( body, [ 0.05, m.h, mouth - 1.1 ], [ s * m.w / 2, m.y, ( mouth + 1.1 ) / 2 ] );
	parts.box( dark, [ m.w - 0.1, m.h - 0.1, 0.02 ], [ 0, m.y + 0.05, 1.15 ] );
	parts.box( body, [ m.w, 0.05, 0.65 ], [ 0, m.y, mouth + 0.3 ] );
	for ( const s of [ - 1, 1 ] ) plate( parts, body, [ [ mouth, m.y ], [ mouth + 0.62, m.y ], [ mouth, m.y + 0.35 ] ], 0.04, s * m.w / 2 );
	// The red control bar round the mouth and the bottom feed stop bar.
	const bar = mat( 0xc42a22, { roughness: 0.5, metalness: 0.2 } );
	parts.path( bar, [ [ - m.w / 2 - 0.05, m.y + 0.2, mouth + 0.02 ], [ - m.w / 2 - 0.05, m.y + m.h + 0.05, mouth + 0.02 ], [ m.w / 2 + 0.05, m.y + m.h + 0.05, mouth + 0.02 ], [ m.w / 2 + 0.05, m.y + 0.2, mouth + 0.02 ] ], 0.02, 6 );
	parts.rod( bar, [ - m.w / 2, m.y + 0.15, mouth + 0.6 ], [ m.w / 2, m.y + 0.15, mouth + 0.6 ], 0.02, 6 );

	return parts.build();

}

// --- stump grinder -----------------------------------------------------------------------------

// A self-propelled tracked stump grinder of the 35 hp class (about 3.0 m long with its cutter wheel
// out, 0.9 m wide and 1.3 m high to its controls): narrow rubber tracks, the engine hood, the
// cutter boom out the front with the 23 in toothed wheel under its guard, and the control console
// at the back where the operator walks behind.
function stumpGrinder() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();
	tracks( parts, { length: 1.45, width: 0.88, shoe: 0.2, height: 0.3 }, 0, 0.35 );

	// Engine hood and frame, the fuel tank and muffler.
	parts.box( dark, [ 0.6, 0.12, 1.5 ], [ 0, 0.28, 0.35 ] );
	parts.box( body, [ 0.8, 0.42, 1.0 ], [ 0, 0.4, 0.4 ] );
	for ( let i = 0; i < 3; i ++ ) parts.box( dark, [ 0.82, 0.03, 0.02 ], [ 0, 0.52 + i * 0.08, 0.9 ] );
	parts.cylinder( BLACK(), 0.04, 0.12, [ 0.25, 0.82, 0.2 ], 8 );

	// Cutter boom on its swing pivot, the wheel on the left of its end with teeth round the rim,
	// the guard over the top half, and the hydraulic motor on the right driving it.
	parts.cylinder( dark, 0.14, 0.32, [ 0, 0.4, - 0.3 ], 12 );
	member( parts, body, [ 0.16, 0.2 ], [ 0, 0.64, - 0.3 ], [ 0, 0.34, - 1.2 ] );
	ram( parts, 0.04, [ 0, 0.85, - 0.05 ], [ 0, 0.62, - 0.75 ] );
	const wx = - 0.13;
	const wz = - 1.22;
	const wr = 23 * IN / 2;
	const wy = wr + 0.02;
	parts.rod( STEEL(), [ wx - 0.02, wy, wz ], [ wx + 0.02, wy, wz ], wr - 0.03, 22 );
	for ( let i = 0; i < 12; i ++ ) {

		const a = i / 12 * Math.PI * 2;
		parts.block( BLACK(), [ 0.07, 0.04, 0.04 ], [ wx, wy + Math.sin( a ) * ( wr - 0.02 ), wz + Math.cos( a ) * ( wr - 0.02 ) ], [ - a, 0, 0 ] );

	}

	const guard = [];
	for ( let i = 0; i <= 8; i ++ ) {

		const a = ( 10 + i / 8 * 160 ) * DEG;
		guard.push( [ wz + Math.cos( a ) * ( wr + 0.06 ), wy + Math.sin( a ) * ( wr + 0.06 ) ] );

	}

	plate( parts, body, [ ...guard, ...guard.slice().reverse().map( ( [ z, y ] ) => [ wz + ( z - wz ) * 0.85, wy + ( y - wy ) * 0.85 ] ) ], 0.14, wx );
	parts.rod( dark, [ wx, wy, wz ], [ 0.1, wy, wz ], 0.05, 10 );
	parts.rod( dark, [ 0.08, wy, wz ], [ 0.2, wy, wz ], 0.08, 12 );

	// Control console at the back on a post, with its levers, and the handlebar the operator
	// walks behind.
	parts.box( dark, [ 0.06, 0.62, 0.06 ], [ 0, 0.4, 1.05 ] );
	parts.block( body, [ 0.55, 0.14, 0.3 ], [ 0, 1.08, 1.12 ], [ 0.4, 0, 0 ] );
	for ( const x of [ - 0.15, 0, 0.15 ] ) parts.rod( BLACK(), [ x, 1.14, 1.1 ], [ x, 1.27, 1.05 ], 0.012, 5 );
	parts.path( BLACK(), [ [ - 0.3, 1.0, 1.1 ], [ - 0.3, 1.0, 1.45 ], [ 0.3, 1.0, 1.45 ], [ 0.3, 1.0, 1.1 ] ], 0.018, 6 );

	return parts.build();

}

// --- tree spade truck --------------------------------------------------------------------------

// A 90 in tree spade on a Class 7 truck (about 10.3 m long, 2.7 m wide at the spade and 4.4 m
// high): the spade's mast standing upright at the back of the frame on its tilt frame and rams,
// the four blades closed in a cone and raised off the ground, with the opening ring and its gates
// round their tops.
function treeSpadeTruck() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();
	const front = - 5.0;
	const back = 2.6;
	const { cabBack, frameTop } = truck( parts, { colour: 0xe9e8e2, front, rear: 1.0, back, axles: 1 } );

	// Subframe on the truck frame and the hydraulic tank and valve bank behind the cab.
	parts.box( dark, [ 1.1, 0.15, back - cabBack - 0.2 ], [ 0, frameTop, ( back + cabBack + 0.2 ) / 2 ] );
	parts.box( body, [ 1.6, 0.9, 0.7 ], [ 0, frameTop + 0.15, cabBack + 0.6 ] );
	parts.box( dark, [ 0.8, 0.3, 0.3 ], [ 0.9, frameTop + 0.5, cabBack + 0.6 ] );

	// The tilt frame from the subframe up to the mast, and its rams.
	const mz = back + 0.25;
	for ( const s of [ - 1, 1 ] ) {

		member( parts, body, [ 0.16, 0.22 ], [ s * 0.55, frameTop + 0.15, back - 1.6 ], [ s * 0.85, 2.0, mz ] );
		ram( parts, 0.08, [ s * 0.55, frameTop + 0.2, back - 2.4 ], [ s * 0.85, 3.0, mz - 0.1 ] );

	}

	// The mast: two columns either side of the spade, a crossmember at the top and the carriage
	// sliding on them, holding the spade.
	const sz = mz + 1.3;
	const top = 4.4;
	for ( const s of [ - 1, 1 ] ) member( parts, body, [ 0.2, 0.25 ], [ s * 0.85, 1.0, mz ], [ s * 0.85, top - 0.15, mz ] );
	parts.box( body, [ 2.0, 0.3, 0.3 ], [ 0, top - 0.3, mz ] );
	parts.box( dark, [ 1.9, 0.35, 0.3 ], [ 0, 2.55, mz ] );
	ram( parts, 0.08, [ 0, 1.05, mz + 0.05 ], [ 0, top - 0.3, mz + 0.05 ] );

	// The spade: the opening ring (open behind the mast to take the trunk), the four blades closed
	// as a cone below it, and each blade's rail up to the ring.
	const ring = 2.4;
	const R = 90 * IN / 2;
	for ( const s of [ - 1, 1 ] ) member( parts, body, [ 0.2, 0.25 ], [ s * 0.85, ring + 0.1, mz ], [ s * 0.75, ring + 0.1, sz - 0.6 ] );
	for ( let i = 0; i < 10; i ++ ) {

		const a0 = ( 20 + i * 32 ) * DEG;
		const a1 = ( 20 + ( i + 1 ) * 32 ) * DEG;
		member( parts, body, [ 0.18, 0.28 ], [ Math.sin( a0 ) * R, ring, sz + Math.cos( a0 ) * R ], [ Math.sin( a1 ) * R, ring, sz + Math.cos( a1 ) * R ] );

	}

	parts.cylinder( STEEL(), 0.18, ring - 0.95, [ 0, 0.95, sz ], 24, R - 0.06 );
	for ( let i = 0; i < 4; i ++ ) {

		const a = ( 45 + i * 90 ) * DEG;
		const x = Math.sin( a );
		const z = Math.cos( a );
		parts.rod( dark, [ x * ( R - 0.02 ), ring + 0.75, sz + z * ( R - 0.02 ) ], [ x * 0.2, 0.95, sz + z * 0.2 ], 0.05, 6 );
		ram( parts, 0.05, [ x * ( R + 0.05 ), ring + 0.9, sz + z * ( R + 0.05 ) ], [ x * ( R + 0.05 ), ring + 0.1, sz + z * ( R + 0.05 ) ] );

	}

	return parts.build();

}

// --- compact tractor loader backhoe ------------------------------------------------------------

// A 25 hp sub-compact tractor loader backhoe (about 3.8 m long, 1.27 m wide at its bucket and
// 2.15 m high to its ROPS): turf tyres, the hood, the seat between the rear fenders under the
// two-post ROPS, the loader with its 50 in bucket on the ground in front, and the backhoe on its
// subframe behind with its boom folded up and stabilisers down.
function compactTractor() {

	const parts = new Parts();
	const body = mat( 0xe0661b, { roughness: 0.5, metalness: 0.2 } );
	const dark = DARK();

	// Wheels: small fronts, big rears, and the frame between.
	for ( const s of [ - 1, 1 ] ) {

		tyre( parts, 0.28, 0.2, [ s * 0.48, - 0.72 ], { lugs: 12 } );
		tyre( parts, 0.43, 0.3, [ s * 0.47, 0.4 ], { lugs: 16 } );

	}

	parts.box( dark, [ 0.5, 0.35, 1.7 ], [ 0, 0.3, - 0.15 ] );

	// Hood and grille, the step deck and the rear fenders with the seat between them.
	parts.box( body, [ 0.58, 0.5, 1.0 ], [ 0, 0.55, - 0.65 ] );
	parts.box( BLACK(), [ 0.48, 0.35, 0.02 ], [ 0, 0.6, - 1.16 ] );
	parts.box( dark, [ 1.0, 0.04, 0.6 ], [ 0, 0.55, - 0.05 ] );
	parts.box( dark, [ 0.2, 0.55, 0.15 ], [ 0, 0.55, - 0.1 ] );
	parts.rod( BLACK(), [ 0, 1.1, - 0.17 ], [ 0, 1.126, - 0.155 ], 0.17, 16 );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( body, [ 0.34, 0.05, 0.75 ], [ s * 0.47, 0.92, 0.4 ] );
		parts.box( body, [ 0.04, 0.32, 0.75 ], [ s * 0.3, 0.6, 0.4 ] );

	}

	seat( parts, [ 0, 0.95, 0.4 ], 0.45 );

	// Two-post ROPS behind the seat.
	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.07, 1.3, 0.07 ], [ s * 0.45, 0.85, 0.75 ] );
	parts.path( dark, [ [ - 0.45, 2.1, 0.75 ], [ - 0.4, 2.15, 0.75 ], [ 0.4, 2.15, 0.75 ], [ 0.45, 2.1, 0.75 ] ], 0.04, 6 );

	// Loader: towers by the hood, arms forward to the bucket on the ground, and the rams.
	const bz = - 1.55;
	for ( const s of [ - 1, 1 ] ) {

		parts.box( body, [ 0.08, 0.6, 0.18 ], [ s * 0.36, 0.55, - 0.15 ] );
		parts.path( body, [ [ s * 0.4, 1.12, - 0.15 ], [ s * 0.42, 1.05, - 0.9 ], [ s * 0.42, 0.35, bz + 0.25 ] ], 0.045, 6 );
		ram( parts, 0.03, [ s * 0.36, 0.6, - 0.3 ], [ s * 0.42, 1.0, - 0.95 ] );

	}

	parts.prism( body, [ [ bz - 0.3, 0.02 ], [ bz + 0.15, 0.02 ], [ bz + 0.25, 0.25 ], [ bz + 0.2, 0.45 ], [ bz + 0.05, 0.45 ], [ bz - 0.05, 0.12 ], [ bz - 0.32, 0.05 ] ], 50 * IN );

	// Backhoe: subframe, swing post, the boom folded up and over, the stick down behind and the
	// bucket curled under it, and the stabilisers down to the ground. The operator swings the seat
	// round to dig.
	parts.box( dark, [ 0.9, 0.6, 0.35 ], [ 0, 0.35, 1.0 ] );
	for ( const s of [ - 1, 1 ] ) {

		member( parts, dark, [ 0.1, 0.12 ], [ s * 0.45, 0.6, 1.05 ], [ s * 0.62, 0.05, 1.05 ] );
		parts.box( dark, [ 0.25, 0.04, 0.25 ], [ s * 0.62, 0, 1.05 ] );

	}

	parts.box( dark, [ 0.25, 0.5, 0.2 ], [ 0, 0.55, 1.25 ] );
	member( parts, body, [ 0.14, 0.2 ], [ 0, 0.8, 1.3 ], [ 0, 1.75, 1.55 ] );
	member( parts, body, [ 0.12, 0.16 ], [ 0, 1.75, 1.55 ], [ 0, 0.75, 1.8 ] );
	ram( parts, 0.04, [ 0, 0.65, 1.4 ], [ 0, 1.35, 1.55 ] );
	parts.prism( dark, [ [ 1.65, 0.75 ], [ 1.92, 0.78 ], [ 1.9, 0.45 ], [ 1.72, 0.4 ] ], 0.3 );

	return parts.build();

}

// --- stand-on compact utility loader -----------------------------------------------------------

// A stand-on compact utility loader of the 1,000 lb class on wide tracks (about 2.7 m long with its
// bucket, 1.1 m wide and 1.3 m high): the engine body between the tracks, the lift arms pivoting
// high at the back, the operator's platform behind with the control panel and thigh pad, and a
// 4-in-1 bucket set on the ground in front.
function compactUtilityLoader() {

	const parts = new Parts();
	const body = mat( 0xb32a24, { roughness: 0.5, metalness: 0.2 } );
	const dark = DARK();
	tracks( parts, { length: 1.3, width: 1.07, shoe: 0.23, height: 0.36 }, 0, 0.05 );

	// Body and engine, the uprights at the back that carry the arms' pivots.
	parts.box( GREY(), [ 0.62, 0.55, 1.35 ], [ 0, 0.3, 0.05 ] );
	parts.box( dark, [ 0.64, 0.04, 0.7 ], [ 0, 0.85, - 0.15 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.08, 0.95, 0.18 ], [ s * 0.35, 0.3, 0.6 ] );

	// Lift arms from the pivots forward and down to the attachment plate, and their rams.
	const pivot = [ 1.18, 0.6 ];
	const tip = [ 0.3, - 0.95 ];
	for ( const s of [ - 1, 1 ] ) {

		parts.path( body, [ [ s * 0.43, pivot[ 0 ], pivot[ 1 ] ], [ s * 0.43, 1.05, - 0.2 ], [ s * 0.43, tip[ 0 ], tip[ 1 ] ] ], 0.05, 6 );
		ram( parts, 0.035, [ s * 0.35, 0.4, 0.4 ], [ s * 0.43, 0.95, - 0.4 ] );

	}

	parts.rod( body, [ - 0.43, 0.75, - 0.55 ], [ 0.43, 0.75, - 0.55 ], 0.04, 8 );
	parts.box( dark, [ 0.85, 0.35, 0.05 ], [ 0, 0.18, - 1.0 ] );

	// The 4-in-1 bucket: the back and floor, the clam jaw closed in front, and its rams.
	const bw = 1.1;
	parts.prism( dark, [ [ - 1.5, 0.02 ], [ - 1.03, 0.02 ], [ - 1.03, 0.55 ], [ - 1.12, 0.6 ], [ - 1.12, 0.12 ], [ - 1.48, 0.08 ] ], bw );
	parts.prism( dark, [ [ - 1.55, 0.03 ], [ - 1.45, 0.03 ], [ - 1.25, 0.55 ], [ - 1.15, 0.6 ], [ - 1.18, 0.66 ], [ - 1.35, 0.55 ] ], bw );
	for ( const s of [ - 1, 1 ] ) ram( parts, 0.03, [ s * 0.45, 0.6, - 1.05 ], [ s * 0.45, 0.42, - 1.37 ] );

	// Operator's platform at the back, the control panel and its handles, and the thigh pad.
	parts.box( dark, [ 0.65, 0.05, 0.45 ], [ 0, 0.13, 0.95 ] );
	parts.box( body, [ 0.75, 0.25, 0.3 ], [ 0, 1.0, 0.7 ] );
	for ( const x of [ - 0.25, - 0.1, 0.1, 0.25 ] ) parts.rod( BLACK(), [ x, 1.25, 0.72 ], [ x, 1.3, 0.8 ], 0.015, 5 );
	parts.path( BLACK(), [ [ - 0.33, 1.25, 0.6 ], [ - 0.33, 1.3, 0.85 ], [ 0.33, 1.3, 0.85 ], [ 0.33, 1.25, 0.6 ] ], 0.018, 6 );
	parts.box( BLACK(), [ 0.55, 0.15, 0.07 ], [ 0, 0.6, 0.62 ] );

	return parts.build();

}

// --- trommel screener --------------------------------------------------------------------------

// A tracked trommel screen of the 5 × 15 ft drum class set up for topsoil or compost (about 15.7 m
// long and 12.7 m wide with its conveyors out, 3.9 m high): the feed hopper at the front with its
// belt under it, the drum turning in its frame under a hood, the power pack, and three conveyors
// out: the fines stacker to the right, a second fines stacker to the left and the overs out the back.
function trommel() {

	const parts = new Parts();
	const body = mat( 0x2b5f8a, { roughness: 0.5, metalness: 0.2 } );
	const dark = DARK();
	tracks( parts, { length: 3.4, width: 2.6, shoe: 0.5, height: 0.8 }, 0, 1.0 );

	// Chassis rails the length of the machine and the legs at the hopper end set on pads.
	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.25, 0.45, 9.8 ], [ s * 0.95, 0.8, - 0.8 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( dark, [ 0.15, 0.85, 0.15 ], [ s * 0.95, 0.05, - 5.4 ] );
		parts.box( dark, [ 0.4, 0.05, 0.4 ], [ s * 0.95, 0, - 5.4 ] );

	}

	// Feed hopper: flared sides over a short feed belt that runs back into the drum.
	const h0 = - 6.0;
	const h1 = - 2.7;
	conveyor( parts, [ 0, 1.6, h0 + 0.2 ], [ 0, 2.3, h1 + 0.4 ], 1.0, dark );
	for ( const s of [ - 1, 1 ] ) parts.block( body, [ 0.05, 1.6, h1 - h0 ], [ s * 1.15, 2.6, ( h0 + h1 ) / 2 ], [ 0, 0, s * - 25 * DEG ] );
	parts.block( body, [ 2.2, 1.6, 0.05 ], [ 0, 2.6, h0 + 0.2 ], [ - 0.3, 0, 0 ] );
	parts.box( dark, [ 3.2, 0.12, 0.12 ], [ 0, 3.3, h1 ] );

	// Drum: the mesh, its rings and the frame round it, with the hood over the top half.
	const d0 = - 2.4;
	const d1 = 2.2;
	const dy = 2.55;
	const dr = 0.78;
	parts.rod( mat( 0x6b6a66, { roughness: 0.6, metalness: 0.5 } ), [ 0, dy + 0.1, d0 ], [ 0, dy - 0.1, d1 ], dr, 20 );
	for ( let i = 0; i <= 5; i ++ ) {

		const z = d0 + ( d1 - d0 ) * i / 5;
		parts.rod( dark, [ 0, dy + 0.1 - 0.2 * i / 5, z - 0.05 ], [ 0, dy + 0.1 - 0.2 * i / 5, z + 0.05 ], dr + 0.05, 20 );

	}

	parts.prism( body, [ [ d0 - 0.1, dy ], [ d0 - 0.1, dy + dr + 0.25 ], [ d1 + 0.2, dy + dr + 0.15 ], [ d1 + 0.2, dy ] ], 2.0 );
	for ( const s of [ - 1, 1 ] ) for ( const z of [ d0, ( d0 + d1 ) / 2, d1 ] ) parts.box( dark, [ 0.15, dy - 1.0, 0.15 ], [ s * 0.95, 1.0, z ] );
	parts.box( dark, [ 1.9, 0.35, d1 - d0 ], [ 0, 1.25, ( d0 + d1 ) / 2 ] );

	// Power pack at the back over the tracks.
	parts.box( body, [ 2.3, 1.4, 1.6 ], [ 0, 1.05, 3.3 ] );
	for ( let i = 0; i < 6; i ++ ) parts.box( dark, [ 2.32, 0.03, 0.02 ], [ 0, 1.3 + i * 0.15, 4.11 ] );
	parts.cylinder( BLACK(), 0.08, 0.5, [ 0.7, 2.45, 3.0 ], 10 );

	// Conveyors out: fines to each side under the drum, overs out the back from the drum's end.
	conveyor( parts, [ 1.0, 1.0, 0 ], [ 6.8, 3.9, 0.3 ], 0.8, dark );
	conveyor( parts, [ - 1.0, 1.0, - 0.6 ], [ - 5.4, 3.3, - 0.9 ], 0.65, dark );
	conveyor( parts, [ 0, 1.75, d1 + 0.4 ], [ 0, 3.9, 9.4 ], 0.8, dark );
	parts.rod( dark, [ 0, 2.05, 4.1 ], [ 0, 3.2, 7.0 ], 0.06, 8 );
	parts.rod( dark, [ 1.1, 1.0, 0.5 ], [ 4.8, 2.9, 0.4 ], 0.06, 8 );
	parts.rod( dark, [ - 1.1, 1.0, - 0.2 ], [ - 3.8, 2.5, - 0.7 ], 0.06, 8 );

	return parts.build();

}

// --- sod on pallets ----------------------------------------------------------------------------

// Four 48 × 40 in pallets of sod in a block of two by two, a hand's width apart: each 50 rolls of
// 2 × 5 ft (500 ft²) in five layers of ten, soil side out with the grass showing at the ends.
function sodPallets() {

	const parts = new Parts();
	const roll = 0.2;
	const [ pl, pw ] = [ 48 * IN, 40 * IN ];
	const gap = 0.15;
	for ( const sx of [ - 1, 1 ] ) {

		for ( const sz of [ - 1, 1 ] ) {

			const cx = sx * ( pl + gap ) / 2;
			const cz = sz * ( pw + gap ) / 2;
			// The pallet: three stringers along its length and the deck boards across them.
			for ( const z of [ - pw / 2 + 0.05, 0, pw / 2 - 0.05 ] ) parts.box( TIMBER(), [ pl, 0.09, 0.08 ], [ cx, 0, cz + z ] );
			for ( let i = 0; i < 7; i ++ ) parts.box( TIMBER(), [ 0.1, 0.02, pw ], [ cx - pl / 2 + 0.05 + i * ( pl - 0.1 ) / 6, 0.09, cz ] );

			// Five layers of rolls, two across and five along, each laid across x.
			for ( let layer = 0; layer < 5; layer ++ ) {

				const y = 0.11 + roll / 2 + layer * roll * 0.92;
				for ( let i = 0; i < 5; i ++ ) {

					// Two rolls end to end across the pallet, and the grass rolled up inside them
					// showing at the outer ends.
					const z = cz - pw / 2 + roll / 2 + i * ( pw - roll ) / 4;
					for ( const half of [ - 1, 1 ] ) parts.rod( SOIL(), [ cx + half * 0.005, y, z ], [ cx + half * 0.605, y, z ], roll / 2, 8 );
					parts.rod( GRASS(), [ cx - 0.607, y, z ], [ cx + 0.607, y, z ], roll / 2 - 0.02, 8 );

				}

			}

		}

	}

	return parts.build();

}

// --- bark blower truck -------------------------------------------------------------------------

// A pneumatic bark and mulch blower on a tandem truck (about 11.9 m long to the hose reel, 2.6 m
// wide and 4.1 m high): the 50 yd³ box with its walking floor feeding the blower at the back, the blower engine
// and airlock under the box's back end, the hose boom folded along the top on its pedestal over
// the cab end and the hose reel across the back.
function barkBlower() {

	const parts = new Parts();
	const body = mat( 0x2e6b3c, { roughness: 0.5, metalness: 0.2 } );
	const dark = DARK();
	const front = - 5.7;
	const back = 5.3;
	const { cabBack, frameTop } = truck( parts, { colour: 0xe9e8e2, front, rear: 2.9, back } );

	// Subframe and the box: sheet sides with posts, a top rail and the bark heaped inside.
	const b0 = cabBack + 0.25;
	const b1 = back - 0.4;
	const deck = frameTop + 0.15;
	const bh = 2.3;
	parts.box( dark, [ 1.1, 0.15, back - b0 ], [ 0, frameTop, ( back + b0 ) / 2 ] );
	parts.box( body, [ 2.44, 0.06, b1 - b0 ], [ 0, deck, ( b0 + b1 ) / 2 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( body, [ 0.05, bh, b1 - b0 ], [ s * 1.195, deck, ( b0 + b1 ) / 2 ] );
		for ( let z = b0 + 0.6; z < b1 - 0.3; z += 0.75 ) parts.box( dark, [ 0.04, bh, 0.1 ], [ s * 1.24, deck, z ] );
		parts.box( dark, [ 0.1, 0.1, b1 - b0 ], [ s * 1.22, deck + bh - 0.05, ( b0 + b1 ) / 2 ] );

	}

	parts.box( body, [ 2.44, bh, 0.06 ], [ 0, deck, b0 ] );
	parts.box( body, [ 2.44, bh - 0.6, 0.06 ], [ 0, deck + 0.6, b1 ] );
	parts.box( BARK(), [ 2.34, 0.04, b1 - b0 - 0.1 ], [ 0, deck + bh - 0.25, ( b0 + b1 ) / 2 ] );
	parts.sphere( BARK(), 1.0, [ 0, deck + bh - 0.25, ( b0 + b1 ) / 2 ], [ 14, 6 ], [ 1.1, 0.25, 2.6 ] );

	// Blower and its engine under the back of the box, the airlock and discharge.
	parts.box( GREY(), [ 2.2, 0.6, 0.9 ], [ 0, deck, b1 - 0.45 ] );
	parts.box( dark, [ 0.9, 0.6, 0.55 ], [ 0, frameTop - 0.7, back + 0.05 ] );
	parts.rod( dark, [ 0.3, frameTop - 0.3, back + 0.33 ], [ 0.3, frameTop - 0.3, back + 0.6 ], 0.1, 10 );

	// The hose reel across the back, wound with hose.
	const reelY = deck + 1.0;
	for ( const s of [ - 1, 1 ] ) parts.cylinder( dark, 0.05, reelY - frameTop, [ s * 0.95, frameTop, back + 0.35 ], 8 );
	for ( const s of [ - 1, 1 ] ) parts.rod( dark, [ s * 0.9, reelY, back + 0.35 ], [ s * 0.85, reelY, back + 0.35 ], 0.5, 18 );
	parts.rod( HOSE(), [ - 0.82, reelY, back + 0.35 ], [ 0.82, reelY, back + 0.35 ], 0.42, 18 );

	// Hose boom: pedestal at the front of the box, the boom folded back along the top on its
	// rest, the hose along it and down to the reel.
	const top = deck + bh;
	parts.cylinder( dark, 0.22, 0.2, [ 0.7, top, b0 + 0.35 ], 14 );
	member( parts, body, [ 0.22, 0.24 ], [ 0.7, top + 0.3, b0 + 0.35 ], [ 0.7, top + 0.26, b1 - 0.5 ] );
	parts.box( dark, [ 0.2, 0.14, 0.15 ], [ 0.7, top, b1 - 0.6 ] );
	parts.path( HOSE(), [ [ 0.7, top + 0.48, b0 + 0.6 ], [ 0.7, top + 0.45, b1 - 0.4 ], [ 0.7, top + 0.35, b1 - 0.05 ], [ 0.7, reelY + 0.42, back + 0.35 ] ], 0.07, 8 );
	parts.box( AMBER(), [ 0.15, 0.12, 0.15 ], [ - 1.1, top, b1 - 0.1 ] );

	return parts.build();

}

// --- tractor with boom mower -------------------------------------------------------------------

// A 100 hp utility tractor with a side boom flail mower (about 5.3 m long, 7.6 m wide with the
// boom out and 3.4 m high to the boom's knee): the tractor with its ROPS cab, the counterweights hung on its left
// side and front, the mower's mainframe on the back, the main boom and dipper out to the right
// and the 5 ft flail head on its roller on the ground, about 6 m (20 ft) out.
function boomMower() {

	const parts = new Parts();
	const body = mat( 0x2f63a8, { roughness: 0.5, metalness: 0.2 } );
	const mower = mat( 0xd2442a, { roughness: 0.5, metalness: 0.2 } );
	const dark = DARK();

	// Wheels: lugged rears and fronts on a 1.85 m track, and the frame between them.
	for ( const s of [ - 1, 1 ] ) {

		tyre( parts, 0.78, 0.46, [ s * 0.93, 0.95 ], { lugs: 22, rim: WHITE() } );
		tyre( parts, 0.55, 0.34, [ s * 0.88, - 1.5 ], { lugs: 18, rim: WHITE() } );

	}

	parts.box( dark, [ 0.7, 0.5, 3.4 ], [ 0, 0.5, - 0.4 ] );
	parts.rod( dark, [ - 0.9, 0.78, 0.95 ], [ 0.9, 0.78, 0.95 ], 0.12, 10 );

	// Hood, grille, front weights and the exhaust.
	parts.box( body, [ 0.85, 0.85, 2.0 ], [ 0, 0.95, - 1.3 ] );
	parts.box( BLACK(), [ 0.7, 0.6, 0.03 ], [ 0, 1.05, - 2.31 ] );
	parts.box( dark, [ 0.8, 0.55, 0.3 ], [ 0, 0.5, - 2.55 ] );
	parts.cylinder( BLACK(), 0.06, 0.95, [ 0.3, 1.8, - 0.5 ], 10 );

	// Cab over the rear axle with fenders each side.
	const c = { w: 1.55, h: 1.55, l: 1.55, y: 1.3, z: 0.75 };
	parts.box( dark, [ 1.7, 0.1, 1.7 ], [ 0, c.y - 0.1, c.z ] );
	cab( parts, [ c.w, c.h, c.l ], [ 0, c.y, c.z ], body );
	parts.box( body, [ c.w + 0.1, 0.08, c.l + 0.1 ], [ 0, c.y + c.h, c.z ] );
	for ( const s of [ - 1, 1 ] ) parts.box( body, [ 0.5, 0.06, 1.2 ], [ s * 0.93, 1.62, 0.95 ] );
	parts.box( AMBER(), [ 0.12, 0.1, 0.12 ], [ - 0.6, c.y + c.h + 0.08, c.z + 0.6 ] );

	// Counterweight hung on the left side, to balance the boom.
	parts.box( dark, [ 0.2, 0.55, 1.6 ], [ - 0.5, 0.3, - 0.2 ] );
	parts.box( mower, [ 0.12, 0.6, 1.4 ], [ - 0.68, 0.28, - 0.2 ] );

	// Mower mainframe on the three-point hitch, the boom's slew post on its right, the main boom
	// up and out, the dipper down to the head.
	parts.box( mower, [ 1.5, 0.7, 0.5 ], [ 0.2, 0.55, 1.95 ] );
	parts.box( dark, [ 0.5, 0.45, 0.4 ], [ - 0.3, 0.65, 2.4 ] );
	const post = [ 0.85, 1.4, 1.95 ];
	const knee = [ 3.4, 3.2, 1.6 ];
	const wrist = [ 5.75, 0.95, 0.95 ];
	parts.box( mower, [ 0.35, 0.5, 0.35 ], [ post[ 0 ], 0.9, post[ 2 ] ] );
	member( parts, mower, [ 0.2, 0.28 ], post, knee );
	member( parts, mower, [ 0.16, 0.22 ], knee, wrist );
	ram( parts, 0.06, [ 0.85, 1.0, 2.05 ], [ 2.0, 2.45, 1.85 ] );
	ram( parts, 0.05, [ 2.7, 2.95, 1.7 ], [ 4.0, 2.85, 1.45 ] );
	parts.path( HOSE(), [ [ 0.7, 1.55, 2.0 ], [ 3.3, 3.4, 1.65 ], [ 5.6, 1.2, 1.0 ] ], 0.03, 6 );

	// The flail head: a housing 5 ft long along the travel, its roller behind and the tilt ram.
	const hx = 6.1;
	const hz = 0.95;
	const hl = 60 * IN;
	parts.box( mower, [ 0.6, 0.38, hl ], [ hx - 0.05, 0.12, hz ] );
	parts.block( mower, [ 0.45, 0.05, hl ], [ hx - 0.05, 0.55, hz ], [ 0, 0, 0.2 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.65, 0.42, 0.03 ], [ hx - 0.05, 0.1, hz + s * hl / 2 ] );
	parts.rod( dark, [ hx + 0.25, 0.1, hz - hl / 2 + 0.05 ], [ hx + 0.25, 0.1, hz + hl / 2 - 0.05 ], 0.1, 12 );
	ram( parts, 0.04, [ wrist[ 0 ] - 0.3, 1.3, wrist[ 2 ] ], [ hx - 0.25, 0.6, hz ] );
	parts.box( dark, [ 0.25, 0.35, 0.25 ], [ wrist[ 0 ] + 0.1, 0.6, wrist[ 2 ] ] );

	return parts.build();

}
