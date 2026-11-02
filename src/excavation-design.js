// The design of an excavation, worked out from its params alone: how each side is cut (sloped,
// stepped or shored), the design surface the terrain digs to, the support levels and their
// members, the dig stages, quantities, a comparison of the methods and the WorkSafeBC flags.
// No scene, no DOM and no three.js, so the terrain (earthworks.js), the shoring (shoring.js), the
// section view (excavation-section.js) and the tests (scripts/test-excavation.mjs) all use the
// same numbers. docs/earthworks.md and docs/shoring.md explain them for users.
//
// A planning aid, not engineering design: every figure here is a rule of thumb for laying out a
// site and talking to suppliers and engineers. Sources are given next to each constant:
//   [P20]  WorkSafeBC OHS Regulation Part 20 (the law at Neptune), [G20] its Guidelines
//   [OSHA] 29 CFR 1926 Subpart P, [ONT] Ontario O. Reg. 213/91: comparisons only, where
//          WorkSafeBC gives no number
//   [GEC4] FHWA Geotechnical Engineering Circular 4 (ground anchors), [DM7] NAVFAC DM 7.02,
//   [CN]   CN's design criteria for shoring walls, [USACE] EM 1110-2-2504, [CT7] Caltrans T&S
//          Manual ch. 7, [LIND] Lindquist (secant piles), [AAR-C] [VE] (contiguous piles)
// and "tool default" marks a value no source sets.
//
// Frames. A pit's own frame is (u, v): u across its width, positive to its right; v along its
// length, positive to its front (its heading), exactly as insideRect() in terrain.js works them
// out. Its sides are numbered clockwise seen from above, starting at the front:
//   side 1 front (+v), side 2 right (+u), side 3 back (-v), side 4 left (-u)
// so side n faces the compass heading + (n - 1) * 90 degrees. Shoring members are given in the
// shoring group's frame (shoring.js buildPit): x = u, z = -v, y up from the rim (the floor is at
// y = -depth).

// --- the grid and the old code this must match -----------------------------------------------------

// three.js MathUtils.DEG2RAD.
const DEG = Math.PI / 180;

// The terrain's grid spacing (terrain.js CELL): a vertical face is eased across one cell either
// side of its line, which keeps the volume and gives turned pits straight edges.
export const CELL = 0.5;
// Side slopes keep climbing past their top edge this far where the ground there is higher
// (earthworks.js SLOPE_REACH).
export const SLOPE_REACH = 3;

// --- WorkSafeBC rules ------------------------------------------------------------------------------

// Deeper than this, a worker may only go in once the sides are sloped, benched or supported
// [P20] 20.81(1).
export const SAFE_DEPTH = 1.2;
// A trench is narrower than this at the bottom [P20] 20.1; benching (Figure 20-2) and Table 20-1
// timber don't apply to wider excavations [G20] G20.81.
export const TRENCH_WIDTH = 3.7;
// The steepest sloped face, in hard and solid soil: 3 horizontal to 4 vertical [P20] Figure 20-1.
export const STEEPEST = 0.75;
// Deeper than this, the excavation is dug to a qualified registered professional's written
// instructions, a professional engineer's if it uses support [P20] 20.78(1)(a), (2); also the
// deepest Figures 20-1 and 20-2 go.
export const ENGINEERED_DEPTH = 6;
// Benches: each at most this high [P20] Figure 20-2 notes, and (Case 1, workers on the benches)
// 1.5 times as wide as the riser below it, read from the drawing.
export const BENCH_HEIGHT = 1.2;
export const BENCH_RATIO = 1.5;
// Shoring stands at least this far out of the ground [P20] 20.81(5).
export const ABOVE = 0.3;
// Spoil is kept back this far from a trench's edge, and from any other excavation's [P20] 20.90(1).
export const SPOIL_TRENCH = 0.6;
export const SPOIL_OTHER = 1.2;
// A ladder or ramp within this far of workers in a trench over 1.2 m deep [P20] 20.87(2).
export const EXIT_REACH = 8;

// Soil types, by WorkSafeBC's names [P20] 20.85(1). WorkSafeBC gives a slope only for hard and
// solid soil (3H:4V, Figure 20-1); B and C borrow OSHA's Table B-1 [OSHA] App. B, and wet or
// flowing ground Ontario's type 4, 3 : 1 [ONT] 234(2)(g), and also needs a QRP when water comes
// in [P20] 20.78(1)(c). Neptune is fill and sand by the water: type C [G20] G20.85, the tool's
// default. Benching is shown by WorkSafeBC against the hard-soil line only, and OSHA allows none in
// type C (App. B Figure B-1.3).
export const SOILS = {
	A: { label: 'A: hard and solid', slope: 0.75, benching: true, source: 'WorkSafeBC Figure 20-1' },
	B: { label: 'B: likely to crack or crumble', slope: 1, benching: true, source: 'OSHA Table B-1, for comparison' },
	C: { label: 'C: soft, sandy, filled or loose', slope: 1.5, benching: false, source: 'OSHA Table B-1, for comparison' },
	wet: { label: 'C, wet: water seeping or submerged', slope: 3, benching: false, source: 'Ontario type 4, for comparison' },
};
export const DEFAULT_SOIL = 'C';
// Groundwater below the rim, tool default for Neptune's waterfront until there's site data.
export const DEFAULT_GROUNDWATER = 2;

// --- support systems -------------------------------------------------------------------------------

export const NO_SUPPORT = 'none';
// Trench systems span between opposite walls, so they shore the whole excavation; wall systems
// stand on their own and can line any side. Wall figures, in metres from the outline (the line
// the cut is dug to): `inner` is the wall's face in the pit (positive: inside the outline), `back`
// the soil's face behind it (positive: outside; shoring.js plans' ground.back), `stickUp` how far it
// stands out of the ground. Sheet and soldier piles are drawn centred on the outline, as they
// always have been; secant and contiguous piles stand just outside it, their face on the outline.
export const SYSTEMS = {
	'trench-box': { label: 'Trench box', kind: 'trench' },
	'slide-rail': { label: 'Slide rail', kind: 'trench' },
	'hydraulic': { label: 'Hydraulic shores', kind: 'trench' },
	// Z-sheets 0.6 m wide, 0.38 m deep (shoring-models.js SHEET), 1 m out of the ground. "Can be
	// impervious" [DM7] Table 4, but interlocks leak.
	'sheet-piles': { label: 'Sheet piles', kind: 'wall', inner: 0.19, back: 0.21, stickUp: 1, pitch: 0.6, watertight: true },
	// HP310 piles about 2.4 m apart [GEC4] 2.3.2.2 (1.5 to 3 m), 0.5 m out of the ground, timber
	// lagging behind their inner flanges. Pervious [DM7] Table 4.
	'soldier-piles': { label: 'Soldier piles + lagging', kind: 'wall', inner: 0.15, back: - 0.055, stickUp: 0.5, spacing: 2.4, watertight: false },
	// 0.88 m piles at 0.73 m centres: 150 mm overlap [DB], in the 0.6 to 1.2 m range [AAR-S]; hard/firm,
	// so close to watertight. A capping beam stands 0.3 m out of the ground.
	'secant-piles': { label: 'Secant pile wall', kind: 'wall', inner: 0, back: 0.88, stickUp: ABOVE, diameter: 0.88, centres: 0.73, watertight: true },
	// 0.6 m piles with 100 mm gaps [AAR-C] (50 to 150 mm): not watertight [VE].
	'contiguous-piles': { label: 'Contiguous pile wall', kind: 'wall', inner: 0, back: 0.6, stickUp: ABOVE, diameter: 0.6, centres: 0.7, watertight: false },
};
export const DEFAULT_WALL = 'sheet-piles';
// Secant piles drift up to 1 in 200 each [LIND]; less overlap than this is flagged.
const SECANT_MIN_OVERLAP = 0.075;
const VERTICALITY = 0.005;

// --- support levels and bracing: practice ----------------------------------------------------------

// Walls deeper than this get support levels when the bracing is suggested (shoring.js
// BRACED_DEPTH); cantilevers taller than CANTILEVER_MAX are flagged harder [USACE] 2-4a(1), [CT7] 7-1.
export const BRACE_DEPTH = 4;
export const CANTILEVER_MAX = 5.5;
// The first level at most 1.5 m down, levels at most 3 m apart and the last at most 3 m above the
// floor ([CN] items 11 to 13, the owner's "about every 3 m"); a level a quarter of the depth down
// in shallower pits (tool default).
export const FIRST_LEVEL = 1.5;
export const LEVEL_SPACING = 3;
// Each lift is dug at most this far below a level before the level goes in [GEC4] 9.5.3.
export const OVER_DIG = 0.6;
// Waler: a W360 on its side, 0.36 m deep from the wall's face (shoring.js).
export const WALER_DEPTH = 0.36;
// Struts at most this far apart along the walls (shoring.js); a king post under them every this
// much of span (tool default, no source found); cross-lot struts for pits up to about 20 m (65 ft)
// across, rakers or tiebacks for wider [DM7] Table 5.
export const STRUT_SPACING = 4.5;
export const KING_POST_SPAN = 12;
export const MAX_STRUT = 20;
// Room needed between two walers for struts to go in, besides the walers (tool default).
const NARROW_ROOM = 0.3;
// Corner braces in pits at least this wide, their legs up to this long along each wall (shoring.js).
const CORNER_WIDTH = 6;
const CORNER_LEG = 3.5;
// King posts go this far below the floor (tool default).
const KING_POST_TOE = 3;
// Rakers: 45 degrees by default (designers' usual [DXR]), to a kicker block on the floor.
export const RAKER_ANGLE = 45;
export const KICKER = { along: 1.2, across: 1, height: 0.6 };
// Tiebacks [GEC4]: 15 to 30 degrees below horizontal, 20 by default so the top row's bond zone is
// deep enough (5.3.6, the worked example in the research); unbonded at least 4.5 m (strand,
// 5.3.4), the bond starting max(1.5 m, 0.2 H) behind the active wedge, which rises from the foot
// of the wall at 45 + phi/2 (5.3.2, phi = 32 degrees for granular fill, tool default); bond 9 m
// (4.5 to 12 m, 5.3.6) under at least 4.5 m of soil at its centre (5.3.7); one per soldier pile
// spacing, at least 1.2 m apart (Fig. 37b).
export const ANCHOR_ANGLE = 20;
export const BOND_LENGTH = 9;
const MIN_FREE = 4.5;
const BOND_COVER = 4.5;
export const FRICTION_ANGLE = 32;
export const ANCHOR_SPACING = 2.4;
// Support spacing set by hand (the spacing param): no closer than tiebacks may be (1.2 m, Fig. 37b),
// and no further than a planning tool should pretend a waler spans (tool default).
export const MIN_SPACING = 1.2;
export const MAX_SPACING = 20;
// Embedment below the floor (tool defaults from the research: Illinois DOT and Enercalc for
// cantilevers in loose fill, GEC 4's example for braced walls), at least 1.5 m.
const TOE_CANTILEVER = 1.5;
const TOE_BRACED = 0.5;
const MIN_TOE = 1.5;
// The single waler the first shoring drew 0.7 m down in sheet-piled pits (shoring.js WALER_Y),
// with struts across up to 12 m (shoring.js MAX_STRUT) in pits over 4 m deep.
const CLASSIC_LEVEL = 0.7;
const CLASSIC_MAX_STRUT = 12;

// --- params ----------------------------------------------------------------------------------------

const MAX_SIZE = 200;
const MAX_DEPTH = 30;
const MAX_LEVELS = 12;

// Dropdown names -> values, for the P panel.
export const METHODS = { 'sloped': 'slope', 'stepped (benched)': 'bench', 'shored': 'shore', 'per side': 'sides' };
// Capitalised like the walls' names they're listed with.
export const SIDE_METHODS = {
	'Sloped': 'slope',
	'Stepped (benched)': 'bench',
	...Object.fromEntries( Object.entries( SYSTEMS ).filter( ( [ , s ] ) => s.kind === 'wall' ).map( ( [ id, s ] ) => [ s.label, id ] ) ),
};
export const OUTLINES = { 'the floor of the pit': 'floor', 'the top of the cut': 'top' };
// 'usual': WorkSafeBC gives a slope for hard soil only; B and C are OSHA's, for comparison (SOILS).
export const SLOPE_FROM = { 'usual for the soil': 'soil', 'a ratio of my own': 'custom' };
export const ENDS = { 'open (vertical)': 'open', 'sloped': 'sloped' };
export const BRACINGS = {
	'suggested': 'auto',
	'none (cantilever)': 'none',
	'walers + struts': 'struts',
	'rakers to kicker blocks': 'rakers',
	'tiebacks': 'tiebacks',
	'one waler 0.7 m down (as first drawn)': 'classic',
};
export const SOIL_OPTIONS = Object.fromEntries( Object.entries( SOILS ).map( ( [ id, s ] ) => [ s.label, id ] ) );

const METHOD_VALUES = Object.values( METHODS );
const SIDE_VALUES = Object.values( SIDE_METHODS );
const BRACING_VALUES = Object.values( BRACINGS );

// What each new key means when it's missing: the excavation as it was before these keys existed.
// saveExcavation() leaves out keys at these values, so a layout saved before is saved again
// byte for byte, and its cloud fingerprint doesn't change.
export const DEFAULTS = {
	outline: 'top',
	// method: worked out from support (none: sloped, else shored).
	side1: 'slope',
	side2: 'slope',
	side3: 'slope',
	side4: 'slope',
	soil: DEFAULT_SOIL,
	slopeBy: 'custom',
	benchHeight: 0,
	benchWidth: 0,
	ends: 'open',
	bracing: 'classic',
	levels: '',
	// How many support levels (0: as suggested by the depth) and how far apart the supports stand
	// along each wall (0: STRUT_SPACING for struts and rakers, ANCHOR_SPACING for tiebacks), so a
	// big, deep pit needn't be a thicket of rakers.
	levelCount: 0,
	spacing: 0,
	toe: 0,
	rakerAngle: RAKER_ANGLE,
	anchorAngle: ANCHOR_ANGLE,
	bondLength: BOND_LENGTH,
	groundwater: DEFAULT_GROUNDWATER,
	stage: - 1,
};

// The params the Excavation tool gives a new pit: the rectangle is the floor, the sides slope at
// the soil's usual slope (SOILS), and support levels are suggested from the depth.
export function newExcavationParams( { width, length } ) {

	return { width, length, outline: 'floor', slopeBy: 'soil', bracing: 'auto' };

}

export function normalizeSupport( value ) {

	return value === NO_SUPPORT || Object.hasOwn( SYSTEMS, value ) ? value : NO_SUPPORT;

}

// Params with defaults filled in and clamped. Cheap, and never throws: it runs on every handle
// move. The five keys the first excavations had come first, in the same order, with the same
// meaning: { width, length, depth, slope, support }. `slope` is the custom ratio (h : v) and is no
// longer snapped, but every value saved before was one of 0, 0.5, 1, 1.5 and 2, which stay as
// they are. `method` follows `support` unless it's 'bench' or 'sides' (see methodPatch).
export function normaliseExcavation( p = {} ) {

	const support = normalizeSupport( p.support );
	let method = METHOD_VALUES.includes( p.method ) ? p.method : null;
	if ( method === null || method === 'slope' || method === 'shore' ) method = support === NO_SUPPORT ? 'slope' : 'shore';
	const side = key => SIDE_VALUES.includes( p[ key ] ) ? p[ key ] : DEFAULTS[ key ];
	return {
		width: clamp( p.width, 1, MAX_SIZE, 10 ),
		length: clamp( p.length, 1, MAX_SIZE, 10 ),
		depth: clamp( p.depth, 0.1, MAX_DEPTH, 2 ),
		slope: round( clamp( p.slope, 0, 4, 1 ), 2 ),
		support,
		outline: p.outline === 'floor' ? 'floor' : 'top',
		method,
		side1: side( 'side1' ),
		side2: side( 'side2' ),
		side3: side( 'side3' ),
		side4: side( 'side4' ),
		soil: Object.hasOwn( SOILS, p.soil ) ? p.soil : DEFAULT_SOIL,
		slopeBy: p.slopeBy === 'soil' ? 'soil' : 'custom',
		benchHeight: optional( p.benchHeight, 0.5, 3 ),
		benchWidth: optional( p.benchWidth, 0.5, 10 ),
		ends: p.ends === 'sloped' ? 'sloped' : 'open',
		bracing: BRACING_VALUES.includes( p.bracing ) ? p.bracing : DEFAULTS.bracing,
		levels: levelsText( p.levels ),
		levelCount: Math.round( clamp( p.levelCount, 0, MAX_LEVELS, 0 ) ),
		spacing: optional( p.spacing, MIN_SPACING, MAX_SPACING ),
		toe: optional( p.toe, 0.5, 40 ),
		rakerAngle: round( clamp( p.rakerAngle, 30, 60, RAKER_ANGLE ), 1 ),
		anchorAngle: round( clamp( p.anchorAngle, 10, 45, ANCHOR_ANGLE ), 1 ),
		bondLength: round( clamp( p.bondLength, 4.5, 12, BOND_LENGTH ), 2 ),
		groundwater: round( clamp( p.groundwater, 0, 50, DEFAULT_GROUNDWATER ), 2 ),
		stage: Math.round( clamp( p.stage, - 1, 99, - 1 ) ),
	};

}

// The params as they're saved (models.toConfig through the kind's save hook): the five original
// keys always, the others only where they differ from what their absence means.
export function saveExcavation( params ) {

	const out = {};
	for ( const [ key, value ] of Object.entries( params ) ) {

		if ( key === 'method' && ( value === 'slope' || value === 'shore' ) ) continue;
		if ( Object.hasOwn( DEFAULTS, key ) && DEFAULTS[ key ] === value ) continue;
		out[ key ] = value;

	}

	return out;

}

// What picking a method in the P panel changes. Sloped and shored follow `support` (so code that
// sets support, as the first shoring did, still shores or unshores a pit): shored puts back the
// last system, or sheet piles. Per side starts each side as it's cut now.
export function methodPatch( method, params ) {

	if ( method === 'slope' ) return { method, support: NO_SUPPORT };
	if ( method === 'shore' ) return { method, support: params.support !== NO_SUPPORT ? params.support : DEFAULT_WALL };
	if ( method !== 'sides' ) return { method };
	const geom = excavationGeometry( normaliseExcavation( params ) );
	const patch = { method };
	for ( const side of geom.sides ) {

		// A trench system's walls become sheet piles: it can't line one side on its own.
		patch[ `side${ side.n }` ] = side.method === 'wall' ? side.system : side.method === 'trench' ? DEFAULT_WALL : side.method === 'bench' ? 'bench' : 'slope';

	}

	return patch;

}

// The slope ratio (h : v) sloped sides are cut to.
export function slopeOf( params ) {

	return params.slopeBy === 'soil' ? SOILS[ params.soil ].slope : params.slope;

}

// Levels typed in as metres below the rim ('1.5, 4.5'), sorted, to 5 cm, at least 0.3 m apart.
// Ones below the floor are kept, in case the pit is made deeper again, and left out of the plan.
function levelsText( text ) {

	if ( typeof text !== 'string' && typeof text !== 'number' ) return '';
	// Rounded to 5 cm before they're filtered and spaced, so the text this gives comes back the
	// same when it's normalised again (on the next edit or reload): nothing kept now is dropped then.
	const values = String( text ).split( /[\s,;]+/ ).map( Number ).filter( Number.isFinite ).map( z => Math.round( z * 20 ) / 20 ).filter( z => z > 0.2 && z <= MAX_DEPTH ).sort( ( a, b ) => a - b );
	const kept = [];
	for ( const z of values ) if ( kept.length < MAX_LEVELS && ( kept.length === 0 || z - kept[ kept.length - 1 ] >= 0.3 - 1e-9 ) ) kept.push( z );
	return kept.map( z => String( z ) ).join( ', ' );

}

// --- sides and labels ------------------------------------------------------------------------------

export const SIDE_NAMES = [ 'front', 'right', 'back', 'left' ];
const COMPASS = [ 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW' ];

// Which way side n (1-4) faces, as a compass point, for a pit turned to `heading`.
export function sideCompass( heading, n ) {

	const bearing = ( ( heading + ( n - 1 ) * 90 ) % 360 + 360 ) % 360;
	return COMPASS[ Math.round( bearing / 45 ) % 8 ];

}

export function sideLabel( heading, n ) {

	return `side ${ n } (${ sideCompass( heading, n ) })`;

}

// The shoring.js wallsOf() index of side n: wallsOf goes right, back, left, front.
export const WALL_INDEX = { 1: 3, 2: 0, 3: 1, 4: 2 };

// --- the pit's geometry ----------------------------------------------------------------------------

// How each side of the pit is cut, from normalised params. Returns { depth, outline, hw, hl, sides,
// trench, system }: sides in the order 1-4, each
//   { n, name, axis (0: a v side, front or back; 1: a u side), sign (+1 front/right, -1 back/left),
//     half (the outline's half size across it), length (along its top edge),
//     method ('slope', 'bench', 'wall' or 'trench'), system (a SYSTEMS id or null),
//     profile ('slope', 'vertical', 'bench' or 'berm'), slope, rise, steps, benchWidth,
//     run (how far the top edge is out from the toe at full depth), top, toe (their distances from
//     the centre) }
// With outline 'top' the rectangle is the top of the cut and the floor is smaller by each side's
// run; with 'floor' it is the floor and the top is bigger.
export function excavationGeometry( params ) {

	const { width, length, depth } = params;
	const hw = width / 2;
	const hl = length / 2;
	const slope = slopeOf( params );
	const bench = benchOf( params );
	const shoreSystem = params.method === 'shore' ? params.support : null;
	const trench = shoreSystem !== null && SYSTEMS[ shoreSystem ]?.kind === 'trench';
	// A trench's ends are its short sides: the trench plans run along the longer side.
	const along = width > length ? 1 : 0;
	const sides = SIDE_NAMES.map( ( name, i ) => {

		const n = i + 1;
		const axis = i % 2;
		let choice;
		if ( params.method === 'sides' ) choice = params[ `side${ n }` ];
		else if ( params.method === 'bench' ) choice = 'bench';
		else if ( params.method === 'slope' ) choice = 'slope';
		else choice = shoreSystem;
		const side = {
			n,
			name,
			axis,
			sign: i < 2 ? 1 : - 1,
			half: axis ? hw : hl,
			length: 0,
			method: 'slope',
			system: null,
			profile: 'slope',
			slope,
			rise: 0,
			steps: 0,
			benchWidth: 0,
			run: 0,
			top: 0,
			toe: 0,
		};
		if ( trench ) {

			const end = ( axis === 1 ) === ( along === 1 );
			const sloped = end && params.ends === 'sloped' && shoreSystem !== 'slide-rail';
			side.method = sloped ? 'slope' : 'trench';
			side.system = sloped ? null : shoreSystem;
			side.profile = sloped && slope > 0 ? 'slope' : 'vertical';

		} else if ( SYSTEMS[ choice ]?.kind === 'wall' ) {

			Object.assign( side, { method: 'wall', system: choice, profile: 'vertical' } );

		} else if ( choice === 'bench' ) {

			Object.assign( side, { method: 'bench', profile: bench.steps > 1 ? 'bench' : 'vertical', rise: bench.rise, steps: bench.steps, benchWidth: bench.width } );

		} else {

			// Sloped; a ratio of 0 is a vertical cut with nothing holding it.
			side.profile = slope > 0 ? 'slope' : 'vertical';

		}

		side.run = runAt( side, depth );
		if ( params.outline === 'floor' ) {

			side.toe = side.half;
			side.top = side.half + side.run;

		} else {

			side.top = side.half;
			side.toe = side.half - side.run;

		}

		return side;

	} );

	// Along a side's top edge, between the top edges of the sides either side of it.
	for ( const side of sides ) {

		const [ a, b ] = neighbours( sides, side );
		side.length = a.top + b.top;

	}

	return { depth, outline: params.outline, hw, hl, sides, trench, system: shoreSystem };

}

// Bench risers: equal, no taller than the bench height (1.2 m unless set), and benches 1.5 times
// as wide as a riser unless set.
function benchOf( params ) {

	const max = params.benchHeight > 0 ? params.benchHeight : BENCH_HEIGHT;
	const steps = Math.max( 1, Math.ceil( params.depth / max - 1e-9 ) );
	const rise = params.depth / steps;
	return { steps, rise, width: params.benchWidth > 0 ? params.benchWidth : BENCH_RATIO * rise };

}

// The two sides at either end of a side's top edge: for a v side (front, back) the left and the
// right, for a u side the back and the front.
function neighbours( sides, side ) {

	return side.axis === 0 ? [ sides[ 3 ], sides[ 1 ] ] : [ sides[ 2 ], sides[ 0 ] ];

}

// How far in from its top edge a side's face is, at z below the rim (sharp steps, no easing).
export function runAt( side, z ) {

	if ( side.profile === 'slope' ) return side.slope * z;
	if ( side.profile === 'bench' ) return side.benchWidth * Math.min( side.steps - 1, Math.max( 0, Math.floor( z / side.rise + 1e-9 ) ) );
	if ( side.profile === 'berm' ) return z <= side.bermTop ? 0 : ( z - side.bermTop ) * side.bermSlope;
	return 0;

}

// --- the design surface ----------------------------------------------------------------------------

// Where a point in the scene (x, z) is in a pit's frame ({ east, north, sin, cos }, as rectFrame
// in terrain.js gives): [ u, v ], worked out exactly as insideRect does, so heights match it to the
// bit.
export function toPit( frame, x, z ) {

	const de = - x - frame.east;
	const dn = z - frame.north;
	return [ de * frame.cos - dn * frame.sin, de * frame.sin + dn * frame.cos ];

}

// And back: a point [ u, v ] of the pit as { east, north } metres.
export function pitToEnu( frame, u, v ) {

	return { east: frame.east + u * frame.cos + v * frame.sin, north: frame.north - u * frame.sin + v * frame.cos };

}

// A pit's frame from its state, as rectFrame( east, north, heading ) in terrain.js makes it (the
// same rounding: heading times three.js's DEG2RAD).
export function pitFrame( { east, north, heading } ) {

	const rad = heading * DEG;
	return { east, north, sin: Math.sin( rad ), cos: Math.cos( rad ) };

}

// The depth below the rim the pit is cut to at (u, v), `cap` deep at most (the depth dug so far):
// the shallowest of the four sides' profiles at the point's distance inside each side's top edge.
// A slope's profile is that distance over the slope, rising on past the edge (the face climbs
// where the ground is higher, SLOPE_REACH out at most); a bench's is a staircase; a vertical
// side's is unlimited, the depth there eased across its edge. -Infinity means not cut at all.
// With all four sides alike this is exactly the first excavations' pitSurface (earthworks.js),
// bit for bit: the minimum of four distances is insideRect's, and division by a slope, like the
// easing of the nearest vertical side, keeps their order. Corners come out of the minimum: two
// slopes meet on a straight hip from the floor's corner to the rim's, and a slope runs on up to a
// wall, which stands in its wing.
export function depthAt( geom, u, v, cap ) {

	let depth = cap;
	let vertical = Infinity;
	const sides = geom.sides;
	for ( let i = 0; i < 4; i ++ ) {

		const side = sides[ i ];
		const e = side.top - side.sign * ( side.axis ? u : v );
		const profile = side.profile;
		if ( profile === 'vertical' ) {

			if ( e < vertical ) vertical = e;

		} else if ( profile === 'slope' ) {

			if ( e < - SLOPE_REACH ) return - Infinity;
			depth = Math.min( depth, e / side.slope );

		} else if ( profile === 'bench' ) {

			if ( e <= - CELL ) return - Infinity;
			depth = Math.min( depth, benchDepth( side, e ) );

		} else {

			// A berm against a wall: sharp, then eased across the wall's line with whatever the other
			// sides leave there, as the finished wall is, so no stage digs deeper than the pit will be
			// where a slope or benches beside it are shallower.
			if ( e < vertical ) vertical = e;
			depth = Math.min( depth, side.bermTop + Math.max( 0, e ) / side.bermSlope );

		}

	}

	if ( vertical === Infinity ) return depth;
	if ( vertical <= - CELL ) return - Infinity;
	// A vertical side eases whatever depth the other sides leave there across its line: the full
	// cap in a pit with only vertical sides, as the first excavations had it, and beside a slope or
	// benches their depth, so the face holds the volume a sharp one would.
	return depth * ease( vertical );

}

// A staircase of risers `rise` high, the top one on the edge, each `benchWidth` further in, each
// eased across the grid like a vertical side: the same volume as sharp steps.
function benchDepth( side, e ) {

	let steps = 0;
	for ( let k = 0; k < side.steps; k ++ ) {

		const x = e - k * side.benchWidth;
		if ( x <= - CELL ) break;
		steps += ease( x );

	}

	return side.rise * steps;

}

// three.js MathUtils.smoothstep( x, -CELL, CELL ), written out the same way so the numbers match.
function ease( x ) {

	const min = - CELL;
	const max = CELL;
	if ( x <= min ) return 0;
	if ( x >= max ) return 1;
	x = ( x - min ) / ( max - min );
	return x * x * ( 3 - 2 * x );

}

// What the terrain needs to dig round the pit: half sizes and a margin for rectBounds() in
// terrain.js (symmetric, so the larger of each pair of sides), the same as the first excavations
// gave for theirs.
export function cutBounds( geom ) {

	const [ front, right, back, left ] = geom.sides;
	const sloped = geom.sides.some( s => s.profile === 'slope' );
	return { hw: Math.max( right.top, left.top ), hl: Math.max( front.top, back.top ), margin: ( sloped ? SLOPE_REACH : 0 ) + CELL };

}

// The top of the cut, the floor and their sizes, in the pit's frame (u from left to right, v from
// back to front). A floor too small for its sides is null, and meets says how far down they meet.
export function outlines( geom ) {

	const [ front, right, back, left ] = geom.sides;
	const top = { u0: - left.top, u1: right.top, v0: - back.top, v1: front.top };
	const floorAt = cross( geom, geom.depth );
	const floor = floorAt.width > 1e-9 && floorAt.length > 1e-9 ? { u0: - left.toe, u1: right.toe, v0: - back.toe, v1: front.toe } : null;
	return {
		top,
		topSize: { width: top.u1 - top.u0, length: top.v1 - top.v0 },
		floor,
		floorSize: floor ? { width: floorAt.width, length: floorAt.length } : null,
		meets: floor ? null : meetDepth( geom ),
	};

}

// The pit's cross-section at z below the rim: a rectangle, each side in from its top edge by its
// run at that depth.
export function cross( geom, z ) {

	const [ front, right, back, left ] = geom.sides;
	return {
		width: Math.max( 0, right.top + left.top - runAt( right, z ) - runAt( left, z ) ),
		length: Math.max( 0, front.top + back.top - runAt( front, z ) - runAt( back, z ) ),
	};

}

function meetDepth( geom ) {

	let lo = 0;
	let hi = geom.depth;
	for ( let i = 0; i < 50; i ++ ) {

		const mid = ( lo + hi ) / 2;
		const c = cross( geom, mid );
		if ( c.width > 1e-9 && c.length > 1e-9 ) lo = mid;
		else hi = mid;

	}

	return lo;

}

// The volume cut from flat ground, m³: the cross-section integrated down to `depth` (the floor, or
// a stage's dig), exactly, piece by piece between the bench levels, where each side's run is
// linear in z.
export function cutVolume( geom, depth = geom.depth ) {

	const [ front, right, back, left ] = geom.sides;
	const breaks = new Set( [ 0, depth ] );
	for ( const side of geom.sides ) {

		if ( side.profile === 'bench' ) for ( let k = 1; k < side.steps; k ++ ) if ( k * side.rise < depth ) breaks.add( k * side.rise );
		if ( side.profile === 'berm' && side.bermTop < depth ) breaks.add( side.bermTop );

	}

	const levels = [ ...breaks ].sort( ( a, b ) => a - b );
	let volume = 0;
	for ( let i = 0; i < levels.length - 1; i ++ ) {

		const a = levels[ i ];
		const b = levels[ i + 1 ];
		if ( b - a < 1e-12 ) continue;
		const width = linear( [ right, left ], right.top + left.top, a, b );
		const length = linear( [ front, back ], front.top + back.top, a, b );
		volume += productIntegral( width, length, a, b );

	}

	return volume;

}

// The size across between two sides, as top - k z over the piece a..b: [ value at 0, k ].
function linear( pair, top, a, b ) {

	const mid = ( a + b ) / 2;
	let at0 = top;
	let k = 0;
	for ( const side of pair ) {

		if ( side.profile === 'slope' ) k += side.slope;
		else if ( side.profile === 'berm' && mid > side.bermTop ) {

			k += side.bermSlope;
			at0 += side.bermTop * side.bermSlope;

		} else at0 -= runAt( side, mid );

	}

	return [ at0, k ];

}

// The integral from a to b of max( 0, p0 - p1 z ) * max( 0, q0 - q1 z ).
function productIntegral( [ p0, p1 ], [ q0, q1 ], a, b ) {

	let end = b;
	for ( const [ c0, c1 ] of [ [ p0, p1 ], [ q0, q1 ] ] ) {

		if ( c1 > 0 ) end = Math.min( end, c0 / c1 );
		else if ( c0 <= 0 ) return 0;

	}

	if ( end <= a ) return 0;
	const f = z => p0 * q0 * z - ( p0 * q1 + p1 * q0 ) * z * z / 2 + p1 * q1 * z * z * z / 3;
	return f( end ) - f( a );

}

// The area of wall a side's support holds, m²: along its top edge, less the runs of the sides
// either side at each depth (a wall between two slopes stands in the slopes' wings).
export function exposedArea( geom, side, depth = geom.depth ) {

	const [ a, b ] = neighbours( geom.sides, side );
	const breaks = new Set( [ 0, depth ] );
	for ( const s of [ a, b ] ) if ( s.profile === 'bench' ) for ( let k = 1; k < s.steps; k ++ ) if ( k * s.rise < depth ) breaks.add( k * s.rise );
	const levels = [ ...breaks ].sort( ( x, y ) => x - y );
	let area = 0;
	for ( let i = 0; i < levels.length - 1; i ++ ) area += productIntegral( linear( [ a, b ], side.length, levels[ i ], levels[ i + 1 ] ), [ 1, 0 ], levels[ i ], levels[ i + 1 ] );
	return area;

}

// The pit's depth along a line through it, for the section view: across (along u, at v = at) or
// along (along v, at u = at), every `step` metres from one top edge (and 3 m past it) to the
// other. [ { s, depth } ], s from the centre; depth is null where it isn't cut.
export function profileAlong( geom, { along = false, at = 0, step = CELL / 2, cap = geom.depth } = {} ) {

	const [ front, right, back, left ] = geom.sides;
	const [ from, to ] = along ? [ - back.top - SLOPE_REACH, front.top + SLOPE_REACH ] : [ - left.top - SLOPE_REACH, right.top + SLOPE_REACH ];
	const points = [];
	for ( let s = from; s <= to + 1e-9; s += step ) {

		const d = along ? depthAt( geom, at, s, cap ) : depthAt( geom, s, at, cap );
		points.push( { s, depth: d === - Infinity ? null : d } );

	}

	return points;

}

// --- support levels and members --------------------------------------------------------------------

// The support levels and what's in them, for normalised params and their geometry. Returns
//   { walls: side numbers with walls, type (the bracing in use: 'none', 'struts', 'rakers',
//     'tiebacks', 'classic', or 'trench' for a trench system, which brings its own),
//     sideTypes: { [n]: 'none' | 'waler' | 'struts' | 'rakers' | 'tiebacks' } for walled sides,
//     levels: depths below the rim, suggested: whether they were, dropped: typed ones below the floor,
//     toe: embedment below the floor, pileLength: { [system]: m },
//     members: [ { type, side, level, a: [ x, y, z ], b: [ x, y, z ], length, ... } ] in the
//       shoring frame: 'waler' (along its middle), 'strut', 'corner', 'kingpost', 'raker' (waler
//       face to the floor), 'kicker' (a: the middle of its base, size), 'tieback' (head to the
//       end, with free and bond lengths and bondStart),
//     struts: { across (the side pair they span: [ n, n ]), span, positions } or null,
//     anchors: { [n]: { reach, rows: [ { z, angle, free, bond, reach, bondCentre, count } ] } },
//     rakers: { [n]: { reach, rows: [ { z, angle, reach, count } ] } } }
export function bracingPlan( params, geom = excavationGeometry( params ) ) {

	const D = geom.depth;
	const walls = geom.sides.filter( s => s.method === 'wall' );
	const plan = { walls: walls.map( s => s.n ), type: 'none', sideTypes: {}, levels: [], suggested: false, dropped: [], toe: 0, pileLength: {}, members: [], struts: null, anchors: {}, rakers: {} };
	if ( geom.trench ) plan.type = 'trench';
	if ( walls.length === 0 ) return plan;

	const legacy = params.method === 'shore' && ( geom.system === 'sheet-piles' || geom.system === 'soldier-piles' );
	let type = params.bracing === 'classic' && ! legacy ? 'auto' : params.bracing;
	// The pair struts span: the long walls when all four are walls, else the one pair there is.
	const pairs = [ [ 1, 3 ], [ 2, 4 ] ].filter( ( [ a, b ] ) => geom.sides[ a - 1 ].method === 'wall' && geom.sides[ b - 1 ].method === 'wall' );
	const strutPair = pairs.length === 2 ? ( geom.sides[ 0 ].length >= geom.sides[ 1 ].length ? pairs[ 0 ] : pairs[ 1 ] ) : pairs[ 0 ] ?? null;
	const span = strutPair ? spanBetween( geom, strutPair ) : Infinity;
	// Walls closer than two walers and a little room apart: the struts bear on the walls' faces,
	// with no walers on those two walls.
	const clear = strutPair ? clearBetween( geom, strutPair ) : Infinity;
	const direct = clear < 2 * WALER_DEPTH + NARROW_ROOM;
	if ( type === 'auto' ) type = D <= BRACE_DEPTH ? 'none' : strutPair && span <= MAX_STRUT ? 'struts' : 'rakers';
	plan.type = type;

	if ( type === 'classic' ) return classicPlan( params, geom, plan );

	for ( const side of walls ) {

		// A wall with none opposite takes rakers, unless it's an end between the two strutted walls,
		// held by the corner braces and walers.
		const [ a, b ] = neighbours( geom.sides, side );
		const strutted = strutPair && ( strutPair.includes( side.n ) || ( strutPair.includes( a.n ) && strutPair.includes( b.n ) ) );
		plan.sideTypes[ side.n ] = type === 'struts' && ! strutted ? 'rakers' : type;

	}

	if ( type !== 'none' ) plan.levels = levelsFor( params, D, plan );
	const braced = plan.levels.length > 0;
	plan.toe = params.toe > 0 ? params.toe : Math.max( MIN_TOE, D * ( braced ? TOE_BRACED : TOE_CANTILEVER ) );
	for ( const side of walls ) plan.pileLength[ side.system ] = pileLength( SYSTEMS[ side.system ].stickUp, D, plan.toe );
	if ( ! braced ) {

		for ( const side of walls ) plan.sideTypes[ side.n ] = 'none';
		return plan;

	}

	const anyStruts = walls.some( s => plan.sideTypes[ s.n ] === 'struts' );
	const strutDirect = side => direct && anyStruts && strutPair.includes( side.n ) && plan.sideTypes[ side.n ] === 'struts';
	plan.levels.forEach( ( z, level ) => {

		for ( const side of walls ) {

			if ( strutDirect( side ) ) continue;
			const extent = walerExtent( geom, side, z );
			if ( extent ) plan.members.push( walerMember( geom, side, level, z, extent ) );

		}

	} );

	if ( anyStruts && strutPair ) addStruts( geom, plan, strutPair, direct ? clear : span, direct, supportSpacing( params, 'struts' ) );
	for ( const side of walls ) {

		if ( plan.sideTypes[ side.n ] === 'rakers' ) addRakers( params, geom, plan, side );
		if ( plan.sideTypes[ side.n ] === 'tiebacks' ) addTiebacks( params, geom, plan, side );

	}

	return plan;

}

// Levels typed in, or suggested: the first a quarter of the depth down, 1.5 m at most, then the
// rest of the depth split evenly so no gap, nor the last to the floor, is over 3 m.
function levelsFor( params, D, plan ) {

	const typed = params.levels ? params.levels.split( ',' ).map( Number ) : [];
	if ( typed.length ) {

		plan.levels = typed.filter( z => z < D - 0.3 );
		plan.dropped = typed.filter( z => z >= D - 0.3 );
		if ( plan.levels.length ) return plan.levels;

	}

	if ( params.levelCount > 0 ) return suggestedLevels( D, params.levelCount );
	plan.suggested = true;
	return suggestedLevels( D );

}

// The levels for a pit D deep: the first a quarter of the depth down, 1.5 m at most, then the rest
// of the depth split evenly, into as many gaps as keep each under 3 m, or `count` levels in all
// (at most as many as leave half a metre between them).
export function suggestedLevels( D, count = 0 ) {

	const first = Math.min( FIRST_LEVEL, D / 4 );
	const most = Math.max( 1, Math.floor( ( D - first ) / 0.5 ) );
	const n = count > 0 ? Math.min( count, most ) : Math.max( 0, Math.ceil( ( D - first ) / LEVEL_SPACING - 1e-9 ) - 1 ) + 1;
	const spacing = ( D - first ) / n;
	return Array.from( { length: n }, ( _, i ) => Math.round( ( first + i * spacing ) * 20 ) / 20 );

}

// How far apart the supports stand along each wall: the spacing set, or the usual one for the
// pit's support type (tiebacks closer than struts and rakers).
export function supportSpacing( params, type ) {

	return params.spacing > 0 ? params.spacing : type === 'tiebacks' ? ANCHOR_SPACING : STRUT_SPACING;

}

// A pile or sheet's length: out of the ground, the depth and the toe, rounded up to 0.5 m.
function pileLength( stickUp, depth, toe ) {

	return Math.ceil( ( stickUp + depth + toe ) * 2 ) / 2;

}

// How far a waler's face is in from the outline on a side: the wall's face plus the waler.
function faceOf( side ) {

	return SYSTEMS[ side.system ].inner + WALER_DEPTH;

}

// The clear span between the walers of two opposite walls.
function spanBetween( geom, [ a, b ] ) {

	const [ sa, sb ] = [ geom.sides[ a - 1 ], geom.sides[ b - 1 ] ];
	return sa.top + sb.top - faceOf( sa ) - faceOf( sb );

}

// And between their faces.
function clearBetween( geom, [ a, b ] ) {

	const [ sa, sb ] = [ geom.sides[ a - 1 ], geom.sides[ b - 1 ] ];
	return sa.top + sb.top - SYSTEMS[ sa.system ].inner - SYSTEMS[ sb.system ].inner;

}

// A point on a side, t along it (u for front and back, v for right and left) and d in from its
// top edge, at z below the rim, in the shoring frame [ x, y, z ].
function onSide( side, t, d, z ) {

	const c = side.sign * ( side.top - d );
	const [ u, v ] = side.axis ? [ c, t ] : [ t, c ];
	return [ u, - z, - v ];

}

// Where a waler runs along a side at z down: between the walls either side of it (their faces), or
// where the slope or benches of a side next to it come down to that depth. [ t0, t1 ] or null.
function walerExtent( geom, side, z ) {

	const [ a, b ] = neighbours( geom.sides, side );
	const inset = s => s.method === 'wall' ? SYSTEMS[ s.system ].inner : runAt( s, z );
	const t0 = - ( a.top - inset( a ) );
	const t1 = b.top - inset( b );
	return t1 - t0 > 0.5 ? [ t0, t1 ] : null;

}

function walerMember( geom, side, level, z, [ t0, t1 ] ) {

	const d = SYSTEMS[ side.system ].inner + WALER_DEPTH / 2;
	return member( 'waler', side.n, level, onSide( side, t0, d, z ), onSide( side, t1, d, z ) );

}

function member( type, side, level, a, b, extra = {} ) {

	return { type, side, level, a, b, length: Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ], b[ 2 ] - a[ 2 ] ), ...extra };

}

// Positions along a run from t0 to t1 for struts or rakers: from `clear` in at each end, at most
// `spacing` apart (STRUT_SPACING unless set: the first shoring's rule).
function positions( t0, t1, clear, spacing = STRUT_SPACING ) {

	const from = t0 + clear;
	const to = t1 - clear;
	if ( to - from < 0.5 ) return clear > 1.5 ? [] : [ ( t0 + t1 ) / 2 ];
	const n = Math.ceil( ( to - from ) / spacing - 0.01 ) + 1;
	return Array.from( { length: n }, ( _, i ) => from + i * ( to - from ) / ( n - 1 ) );

}

// Struts square across between the strutted walls at every level, corner braces where two walls
// meet in a pit at least 6 m across, and king posts under struts longer than 12 m. Direct: from
// wall face to wall face, where there's no room for walers.
function addStruts( geom, plan, [ a, b ], span, direct = false, spacing = STRUT_SPACING ) {

	const sa = geom.sides[ a - 1 ];
	const sb = geom.sides[ b - 1 ];
	// Along the strutted walls, over the floor between the other two sides.
	const [ l, r ] = neighbours( geom.sides, sa );
	const t0 = - l.toe;
	const t1 = r.toe;
	const across = sa.top + sb.top;
	// Corner braces only where two walls meet; without any, the struts may come closer to the ends.
	const corners = cornersOf( geom ).filter( ( [ p, q ] ) => p.method === 'wall' && q.method === 'wall' );
	const corner = corners.length && across >= CORNER_WIDTH ? Math.min( CORNER_LEG, across / 4 ) : 0;
	const at = positions( t0, t1, Math.max( corner + 1, 1.5 ), spacing );
	const posts = span > KING_POST_SPAN ? Math.ceil( span / KING_POST_SPAN - 1e-9 ) - 1 : 0;
	plan.struts = { across: [ a, b ], span, positions: at, kingPosts: posts, direct };
	const fa = direct ? SYSTEMS[ sa.system ].inner : faceOf( sa );
	const fb = direct ? SYSTEMS[ sb.system ].inner : faceOf( sb );
	plan.levels.forEach( ( z, level ) => {

		for ( const t of at ) plan.members.push( member( 'strut', null, level, onSide( sa, t, fa, z ), onSide( sb, t, fb, z ) ) );
		if ( corner ) for ( const [ p, q ] of corners ) plan.members.push( cornerBrace( p, q, corner, z, level ) );

	} );

	// King posts: piles from below the floor to just above the top struts, where the struts cross.
	const D = geom.depth;
	for ( const t of at ) {

		for ( let k = 1; k <= posts; k ++ ) {

			const f = k / ( posts + 1 );
			const [ x0, , z0 ] = onSide( sa, t, fa, 0 );
			const [ x1, , z1 ] = onSide( sb, t, fb, 0 );
			const x = x0 + ( x1 - x0 ) * f;
			const z = z0 + ( z1 - z0 ) * f;
			plan.members.push( member( 'kingpost', null, null, [ x, - D - KING_POST_TOE, z ], [ x, - plan.levels[ 0 ] + 0.3, z ] ) );

		}

	}

}

// The four corners, as [ side, next side ] going round 1, 2, 3, 4.
function cornersOf( geom ) {

	return geom.sides.map( ( side, i ) => [ side, geom.sides[ ( i + 1 ) % 4 ] ] );

}

// A brace across the inside of the corner where side p ends and side q begins, its legs `leg`
// along each wall from the corner.
function cornerBrace( p, q, leg, z, level ) {

	// t of the corner along each side: front and back run with u, right and left with v.
	const cornerT = ( s, other ) => other.sign * other.top;
	const tp = cornerT( p, q );
	const tq = cornerT( q, p );
	const a = onSide( p, tp - Math.sign( tp ) * leg, faceOf( p ), z );
	const b = onSide( q, tq - Math.sign( tq ) * leg, faceOf( q ), z );
	return member( 'corner', null, level, a, b );

}

// Rakers from each level's waler down at the raker angle to a kicker block on the floor, spaced
// as struts along the side's floor edge.
function addRakers( params, geom, plan, side ) {

	const D = geom.depth;
	const angle = params.rakerAngle * DEG;
	const [ l, r ] = neighbours( geom.sides, side );
	const along = positions( - l.toe, r.toe, 1.5, supportSpacing( params, 'rakers' ) );
	const face = faceOf( side );
	const rows = [];
	plan.levels.forEach( ( z, level ) => {

		const reach = ( D - z ) / Math.tan( angle );
		rows.push( { z, angle: params.rakerAngle, reach, count: along.length } );
		for ( const t of along ) {

			plan.members.push( member( 'raker', side.n, level, onSide( side, t, face, z ), onSide( side, t, face + reach, D ) ) );
			plan.members.push( { type: 'kicker', side: side.n, level, a: onSide( side, t, face + reach + KICKER.across / 2, D ), size: KICKER, length: 0 } );

		}

	} );

	plan.rakers[ side.n ] = { reach: Math.max( ...rows.map( row => row.reach ) ) + face + KICKER.across, rows };

}

// Tiebacks from each level's waler out through the wall and down at the anchor angle: free length
// past the active wedge and at least 4.5 m, then the bond. The zone they reach under behind the
// wall is kept clear of digging and other foundations.
function addTiebacks( params, geom, plan, side ) {

	const D = geom.depth;
	const theta = params.anchorAngle * DEG;
	const wedge = Math.tan( ( 45 + FRICTION_ANGLE / 2 ) * DEG );
	const bond = params.bondLength;
	const face = faceOf( side );
	const rows = [];
	plan.levels.forEach( ( z, level ) => {

		const extent = walerExtent( geom, side, z );
		if ( ! extent ) return;
		// How far out from the head (on the waler's face) the tendon crosses the wedge, which rises
		// from the foot of the wall's face, WALER_DEPTH behind the head.
		const crossing = ( D - z + WALER_DEPTH * wedge ) / ( wedge + Math.tan( theta ) );
		const free = Math.max( MIN_FREE, crossing / Math.cos( theta ) + Math.max( 1.5, 0.2 * D ) );
		const total = free + bond;
		const reach = total * Math.cos( theta ) - face;
		const bondCentre = z + ( free + bond / 2 ) * Math.sin( theta );
		// One every 2.4 m or so along the waler (or the spacing set), half a spacing in from its ends.
		const count = Math.max( 1, Math.round( ( extent[ 1 ] - extent[ 0 ] ) / supportSpacing( params, 'tiebacks' ) ) );
		rows.push( { z, angle: params.anchorAngle, free, bond, reach, bondCentre, count } );
		for ( let i = 0; i < count; i ++ ) {

			const t = extent[ 0 ] + ( i + 0.5 ) * ( extent[ 1 ] - extent[ 0 ] ) / count;
			// l along the tendon from the head: out behind the wall and down.
			const out = l => onSide( side, t, face - l * Math.cos( theta ), z + l * Math.sin( theta ) );
			plan.members.push( member( 'tieback', side.n, level, out( 0 ), out( total ), { free, bond, angle: params.anchorAngle, bondStart: out( free ) } ) );

		}

	} );

	plan.anchors[ side.n ] = { reach: rows.length ? Math.max( ...rows.map( row => row.reach ) ) : 0, rows };

}

// The first shoring's single level, so pits saved before look as they did: sheet piles with a
// waler 0.7 m down, struts across up to 12 m and corner braces in pits over 4 m deep; soldier
// piles with none. Toes as it worked them out.
function classicPlan( params, geom, plan ) {

	const D = geom.depth;
	const sheets = geom.system === 'sheet-piles';
	const braced = D > BRACE_DEPTH;
	plan.toe = sheets ? Math.max( 1.5, D * ( braced ? 0.6 : 1 ) ) : Math.max( 1.5, D * 0.75 );
	plan.pileLength[ geom.system ] = pileLength( SYSTEMS[ geom.system ].stickUp, D, plan.toe );
	for ( const side of geom.sides ) plan.sideTypes[ side.n ] = sheets ? ( braced ? 'struts' : 'waler' ) : 'none';
	if ( ! sheets ) return plan;
	plan.levels = [ CLASSIC_LEVEL ];
	const z = CLASSIC_LEVEL;
	for ( const side of geom.sides ) plan.members.push( walerMember( geom, side, 0, z, walerExtent( geom, side, z ) ) );
	if ( ! braced ) return plan;
	const { width, length } = params;
	const [ across, along ] = width > length ? [ length, width ] : [ width, length ];
	const { struts, corner } = classicBracing( across, along );
	// The long walls: front and back when the pit is wider than long.
	const pair = width > length ? [ 1, 3 ] : [ 2, 4 ];
	const [ sa, sb ] = [ geom.sides[ pair[ 0 ] - 1 ], geom.sides[ pair[ 1 ] - 1 ] ];
	const face = faceOf( sa );
	// The first shoring measured along the trench from its back or left end: t = -position for
	// struts across a pit wider than long (along u, its z running back), the position itself otherwise.
	const ts = struts.map( s => width > length ? s : - s );
	plan.struts = { across: pair, span: across - 2 * face, positions: ts, kingPosts: 0 };
	for ( const t of ts ) plan.members.push( member( 'strut', null, 0, onSide( sa, t, face, z ), onSide( sb, t, face, z ) ) );
	if ( corner ) for ( const [ p, q ] of cornersOf( geom ) ) plan.members.push( cornerBrace( p, q, corner, z, 0 ) );
	return plan;

}

// The first shoring's struts and corner braces (shoring.js bracing()): struts at most 4.5 m apart
// along a braced pit `across` wide, given as positions along it from its middle, and corner braces
// (their legs along the walls) in pits 6 m and wider.
export function classicBracing( across, along ) {

	const corner = across >= CORNER_WIDTH ? Math.min( CORNER_LEG, across / 4 ) : 0;
	if ( across > CLASSIC_MAX_STRUT ) return { struts: [], corner };
	const from = - along / 2 + Math.max( corner + 1, 1.5 );
	const to = - from;
	if ( to - from < 0.5 ) return { struts: corner ? [] : [ 0 ], corner };
	const n = Math.ceil( ( to - from ) / STRUT_SPACING - 0.01 ) + 1;
	return { struts: Array.from( { length: n }, ( _, i ) => from + i * ( to - from ) / ( n - 1 ) ), corner };

}

// --- dig stages ------------------------------------------------------------------------------------

// The steps the pit is dug in, for the stage slider: [ { label, dig (the depth dug to), installed
// (how many levels are in), berm (depth of the berm left at raker walls, or null), walls (whether
// the walls are in) } ]. The last is the finished pit. Walls go in first; then each lift is dug to
// 0.6 m below a level and the level goes in, top down [P20] 20.83(1), [GEC4] 9.5.3; rakers need
// the middle dug to the floor first, with a berm left against the wall until they're in [UCD].
export function excavationStages( params, geom = excavationGeometry( params ), plan = bracingPlan( params, geom ) ) {

	const D = geom.depth;
	const walls = plan.walls.length > 0;
	const metres = z => `${ round( z, 2 ) } m`;
	const what = { struts: 'walers and struts', rakers: 'rakers', tiebacks: 'tiebacks', classic: 'waler and struts', waler: 'waler' };
	const stages = [ { label: walls ? 'Walls in, nothing dug yet' : 'Before digging', dig: 0, installed: 0, berm: null, walls } ];
	if ( geom.trench ) {

		stages.push( { label: 'Dug, and shored as it goes', dig: D, installed: 0, berm: null, walls: true } );
		return stages;

	}

	const raking = Object.values( plan.sideTypes ).includes( 'rakers' );
	plan.levels.forEach( ( z, k ) => {

		const lift = Math.min( D, z + OVER_DIG, plan.levels[ k + 1 ] ?? D );
		const kind = plan.type === 'classic' ? what[ plan.sideTypes[ plan.walls[ 0 ] ] === 'struts' ? 'classic' : 'waler' ] : what[ plan.type ] ?? 'level';
		if ( raking ) {

			// Rakers: the first lift as a cantilever, then the middle to the floor with a berm.
			if ( k === 0 ) {

				stages.push( { label: `Dig to ${ metres( lift ) }`, dig: lift, installed: 0, berm: null, walls } );
				stages.push( { label: `Dig the middle to the floor, leaving a berm against the walls`, dig: D, installed: 0, berm: lift, walls } );

			} else stages.push( { label: `Dig the berm down to ${ metres( lift ) }`, dig: D, installed: k, berm: lift, walls } );
			stages.push( { label: `Kicker blocks and rakers at level ${ k + 1 } (${ metres( z ) })`, dig: D, installed: k + 1, berm: lift, walls } );
			return;

		}

		stages.push( { label: `Dig to ${ metres( lift ) }`, dig: lift, installed: k, berm: null, walls } );
		stages.push( { label: `Level ${ k + 1 } (${ metres( z ) }): ${ kind } in`, dig: lift, installed: k + 1, berm: null, walls } );

	} );

	stages.push( { label: raking ? 'Berm dug out: down to the floor' : 'Dug to the floor', dig: D, installed: plan.levels.length, berm: null, walls } );
	return stages;

}

// The stage the params show (stage -1, or past the last: finished).
export function currentStage( params, stages ) {

	const i = params.stage < 0 || params.stage >= stages.length ? stages.length - 1 : params.stage;
	return { index: i, ...stages[ i ] };

}

// The geometry the terrain digs to at a stage: the same, with raker walls' profiles as berms while
// one is left. Use with depthAt( geom, u, v, stage.dig ).
export function geometryAtStage( geom, plan, stage ) {

	if ( stage.berm === null || stage.berm === undefined ) return geom;
	return {
		...geom,
		sides: geom.sides.map( side => plan.sideTypes[ side.n ] !== 'rakers' ? side : {
			...side,
			profile: 'berm',
			bermTop: stage.berm,
			// The berm is cut parallel to the rakers, which lie just over it [DXR].
			bermSlope: 1 / Math.tan( ( plan.rakers[ side.n ]?.rows[ 0 ]?.angle ?? RAKER_ANGLE ) * DEG ),
		} ),
	};

}

// --- quantities ------------------------------------------------------------------------------------

// Quantities for the finished pit, on flat ground: volume, the top and floor, the walls and what's
// in them, and the zones round it at the surface (in the pit's frame, as [ [ u, v ] ... ]
// rectangles): the cut itself, the spoil set-back, the band WorkSafeBC calls adjacent (the depth
// out from the toe, [P20] 20.1, where a structure needs a QRP, 20.78(1)(b)), and tiebacks' zones.
export function excavationQuantities( params, geom = excavationGeometry( params ), plan = bracingPlan( params, geom ) ) {

	const D = geom.depth;
	const shape = outlines( geom );
	const walls = geom.sides.filter( s => s.method === 'wall' ).map( side => {

		const system = SYSTEMS[ side.system ];
		const [ a, b ] = neighbours( geom.sides, side );
		// Free ends: where the wall doesn't turn the corner onto another wall.
		const free = ( a.method === 'wall' ? 0 : 1 ) + ( b.method === 'wall' ? 0 : 1 );
		const length = side.length;
		const out = { side: side.n, system: side.system, length, area: exposedArea( geom, side ), free, pileLength: plan.pileLength[ side.system ] };
		if ( side.system === 'sheet-piles' ) out.sheets = Math.max( 2, Math.round( length / system.pitch ) );
		else if ( side.system === 'soldier-piles' ) {

			out.bays = Math.max( 1, Math.ceil( length / system.spacing - 0.01 ) );
			// Boards only where the face is dug: in a slope's or benches' wing the soil stands in
			// front of the piles below the face. Then up to 0.3 m out of the ground all along.
			out.lagging = out.area + ABOVE * length;

		} else out.bays = Math.max( 1, Math.ceil( length / system.centres - 0.01 ) );
		return out;

	} );

	const piles = {};
	for ( const wall of walls ) {

		const count = wall.sheets ?? wall.bays;
		// Piles at both ends of a bay: a closed ring shares its corners; each free end adds half.
		piles[ wall.system ] = ( piles[ wall.system ] ?? 0 ) + count + ( wall.sheets ? 0 : wall.free / 2 );

	}

	const count = type => plan.members.filter( m => m.type === type ).length;
	const metres = type => plan.members.filter( m => m.type === type ).reduce( ( sum, m ) => sum + m.length, 0 );
	const { top } = shape;
	const rect = ( u0, u1, v0, v1 ) => [ [ u0, v0 ], [ u1, v0 ], [ u1, v1 ], [ u0, v1 ] ];
	// A trench is under 3.7 m wide at the bottom and over 1.2 m deep [P20] 20.1; a V-cut whose sides
	// meet is as deep as where they meet.
	const deepest = shape.meets ?? D;
	const trench = deepest > SAFE_DEPTH && ( shape.floorSize ? Math.min( shape.floorSize.width, shape.floorSize.length ) : 0 ) < TRENCH_WIDTH;
	const setback = trench ? SPOIL_TRENCH : SPOIL_OTHER;
	const [ front, right, back, left ] = geom.sides;
	const toeOut = s => Math.max( 0, s.toe ) + D;
	const zones = {
		cut: rect( top.u0, top.u1, top.v0, top.v1 ),
		spoil: rect( top.u0 - setback, top.u1 + setback, top.v0 - setback, top.v1 + setback ),
		adjacent: rect( - Math.max( left.top, toeOut( left ) ), Math.max( right.top, toeOut( right ) ), - Math.max( back.top, toeOut( back ) ), Math.max( front.top, toeOut( front ) ) ),
		anchors: Object.entries( plan.anchors ).map( ( [ n, { reach } ] ) => ( { side: Number( n ), reach, polygon: anchorZone( geom, geom.sides[ n - 1 ], reach ) } ) ),
		// Behind a wall or a trench system, the band its load comes from: a pile there loads the
		// shoring [P20] 20.86.
		shored: geom.sides.filter( s => s.method === 'wall' || s.method === 'trench' ).map( s => ( { side: s.n, polygon: anchorZone( geom, s, Math.max( 0.5, toeOut( s ) - s.top ) ) } ) ),
	};
	return {
		volume: cutVolume( geom ),
		top: shape.topSize,
		floor: shape.floorSize,
		meets: shape.meets,
		area: shape.topSize.width * shape.topSize.length,
		trench,
		walls,
		wallArea: walls.reduce( ( sum, w ) => sum + w.area, 0 ),
		piles: Object.fromEntries( Object.entries( piles ).map( ( [ k, v ] ) => [ k, Math.round( v ) ] ) ),
		walers: metres( 'waler' ),
		struts: { count: count( 'strut' ), metres: metres( 'strut' ) },
		corners: count( 'corner' ),
		kingPosts: count( 'kingpost' ),
		rakers: { count: count( 'raker' ), metres: metres( 'raker' ) },
		kickers: count( 'kicker' ),
		tiebacks: { count: count( 'tieback' ), metres: metres( 'tieback' ) },
		zones,
	};

}

// The strip behind a side along its top edge, `reach` out from it: where its tiebacks reach under,
// or the band its shoring holds.
function anchorZone( geom, side, reach ) {

	const [ a, b ] = neighbours( geom.sides, side );
	const c0 = side.sign * side.top;
	const c1 = side.sign * ( side.top + reach );
	const corners = [ [ - a.top, c0 ], [ b.top, c0 ], [ b.top, c1 ], [ - a.top, c1 ] ];
	return corners.map( ( [ t, c ] ) => side.axis ? [ c, t ] : [ t, c ] );

}

// The same floor dug the other ways: all sloped at the soil's slope, all stepped, all shored.
// [ { method, label, volume, top: { width, length }, area, current } ], the current method's own
// first; [] when the pit has no floor to compare at.
export function compareMethods( params ) {

	const geom = excavationGeometry( params );
	const shape = outlines( geom );
	if ( ! shape.floorSize ) return [];
	const floor = { ...params, outline: 'floor', width: shape.floorSize.width, length: shape.floorSize.length, stage: - 1 };
	const options = [
		{ method: 'slope', label: `sloped (${ ratio( SOILS[ params.soil ].slope ) }, soil ${ params.soil === 'wet' ? 'C, wet' : params.soil })`, params: { ...floor, method: 'slope', support: NO_SUPPORT, slopeBy: 'soil' } },
		{ method: 'bench', label: steppedLabel( params, floor ), params: { ...floor, method: 'bench' } },
		{ method: 'shore', label: 'shored', params: { ...floor, method: 'shore', support: params.support !== NO_SUPPORT ? params.support : DEFAULT_WALL } },
	];
	const current = { method: params.method, label: 'as planned', volume: cutVolume( geom ), top: shape.topSize, area: shape.topSize.width * shape.topSize.length, current: true };
	// The way it's already dug isn't compared with itself (but sloped at a ratio of its own is
	// compared with the soil's).
	const same = method => method === params.method && ( method !== 'slope' || slopeOf( params ) === SOILS[ params.soil ].slope );
	return [ current, ...options.filter( o => ! same( o.method ) ).map( ( { method, label, params: p } ) => {

		const g = excavationGeometry( normaliseExcavation( p ) );
		const s = outlines( g );
		return { method, label, volume: cutVolume( g ), top: s.topSize, area: s.topSize.width * s.topSize.length, current: false };

	} ) ];

}

// Stepped, and why that may not be a fair comparison: WorkSafeBC shows benching only against the
// hard-soil line (OSHA allows none in type C), and not for pits over 3.7 m wide [G20] G20.81.
function steppedLabel( params, floor ) {

	const caveats = [];
	if ( ! SOILS[ params.soil ].benching ) caveats.push( `not for soil ${ params.soil === 'wet' ? 'C, wet' : params.soil }: benching shown for hard soil only` );
	if ( Math.min( floor.width, floor.length ) >= TRENCH_WIDTH ) caveats.push( 'over 3.7 m wide: a QRP\'s design' );
	return caveats.length ? `stepped (${ caveats.join( '; ' ) })` : 'stepped';

}

// Lines for the P panel: how each other way compares with the plan, e.g. "Shored instead: 912 m³
// less cut, top 10.0 × 20.0 m".
export function comparisonText( list ) {

	const [ current, ...others ] = list;
	if ( ! current ) return '';
	return others.map( o => {

		const d = o.volume - current.volume;
		const change = Math.abs( d ) < 0.5 ? 'the same cut' : `${ format( Math.abs( d ) ) } m³ ${ d < 0 ? 'less' : 'more' } cut`;
		return `${ capitalise( o.label ) } instead: ${ change }, top ${ o.top.width.toFixed( 1 ) } × ${ o.top.length.toFixed( 1 ) } m.`;

	} ).join( ' ' );

}

// --- flags -----------------------------------------------------------------------------------------

// What a planner should be told about this excavation: [ { id, level ('stop', 'warn' or 'note'),
// text, source } ]. From the params alone; what's placed round the pit (structures in the adjacent
// band, rail lines, items under the tieback zones) is the section module's to check. Ids the first
// shoring's notes (shoring.js planShoring) already cover are in COVERED, for a readout that shows
// both without saying it twice.
export function excavationFlags( params, geom = excavationGeometry( params ), plan = bracingPlan( params, geom ) ) {

	const flags = [];
	const add = ( id, level, text, source ) => flags.push( { id, level, text, source } );
	const D = geom.depth;
	const soil = SOILS[ params.soil ];
	const shape = outlines( geom );
	const floorWidth = shape.floorSize ? Math.min( shape.floorSize.width, shape.floorSize.length ) : 0;
	const sloped = geom.sides.filter( s => s.method === 'slope' );
	const benched = geom.sides.filter( s => s.method === 'bench' );
	const unsupported = [ ...sloped, ...benched ];
	const names = list => list.map( s => s.n ).join( ', ' );
	const deep = D > SAFE_DEPTH;
	const slope = slopeOf( params );

	if ( deep && sloped.length && slope < STEEPEST ) add( 'too-steep', 'stop', `Over 1.2 m deep with side${ sloped.length > 1 ? 's' : '' } ${ names( sloped ) } steeper than WorkSafeBC allows even in hard, solid soil (3 : 4): slope, bench or shore them before anyone goes in.`, 'WorkSafeBC 20.81(1), Figure 20-1' );
	else if ( deep && sloped.length && slope < soil.slope ) add( 'steeper-than-soil', 'warn', `Sloped at ${ ratio( slope ) }, steeper than the ${ ratio( soil.slope ) } suggested for soil ${ params.soil === 'wet' ? 'C (wet)' : params.soil }: WorkSafeBC asks for slopes that keep the faces stable in the soil there.`, `WorkSafeBC 20.81(1)(b); ${ soil.source }` );
	if ( D > ENGINEERED_DEPTH && unsupported.length ) {

		// Figure 20-1 stops at 6 m, so deeper slopes are a QRP's (20.78(1)(a), 20.81(1)(a)); Figure
		// 20-2's note makes deeper benches a professional engineer's.
		const how = [
			sloped.length ? `the slope${ sloped.length > 1 ? 's' : '' } on side${ sloped.length > 1 ? 's' : '' } ${ names( sloped ) } to a QRP's written instructions (20.78(1)(a), 20.81(1)(a))` : '',
			benched.length ? `the benches on side${ benched.length > 1 ? 's' : '' } ${ names( benched ) } a professional engineer's design (Figure 20-2)` : '',
		].filter( Boolean );
		add( 'deep-slope', 'warn', `Over 6 m deep, past Figures 20-1 and 20-2: ${ how.join( '; ' ) }.`, `WorkSafeBC 20.78(1)(a), ${ benched.length ? 'Figures 20-1, 20-2' : 'Figure 20-1' }` );

	}
	if ( D > ENGINEERED_DEPTH ) add( 'over-6m', 'warn', plan.walls.length || geom.trench ? 'Over 6 m deep: the shoring is to a professional engineer\'s written design.' : 'Over 6 m deep: dug to a qualified registered professional\'s written instructions.', 'WorkSafeBC 20.78' );

	if ( benched.length && deep ) {

		const side = benched[ 0 ];
		const [ h, w ] = [ round( side.rise, 2 ), round( side.benchWidth, 2 ) ];
		// A riser is an unsupported vertical face: over 1.2 m it fits none of 20.81(1)'s ways, as a
		// slope steeper than 3 : 4 doesn't.
		if ( side.rise > BENCH_HEIGHT + 1e-9 ) add( 'bench-height', 'stop', `Unsupported vertical risers ${ h } m high, over 1.2 m: slope, bench (1.2 m at most) or shore them before anyone goes in.`, 'WorkSafeBC 20.81(1), Figures 20-1, 20-2' );
		// Equal benches narrower than 1.5 risers put the second riser's top inside the 3H:4V line
		// from the toe, which no case of Figure 20-2 allows (Case 3 narrows only the benches above a
		// first one 1.5 times as wide).
		if ( side.steps > 1 && side.benchWidth < BENCH_RATIO * side.rise - 1e-9 ) add( 'bench-width', 'warn', `Benches ${ w } m wide on ${ h } m risers come inside Figure 20-2's 3H:4V line: make them 1.5 times the riser, ${ round( BENCH_RATIO * side.rise, 2 ) } m (Case 3 narrows only the benches above a first bench that wide, with workers at the bottom only).`, 'WorkSafeBC Figure 20-2' );
		if ( ! soil.benching ) add( 'bench-soil', 'warn', 'Benched in soft, sandy or filled ground: WorkSafeBC shows benching against the hard-soil line, and OSHA allows none in type C.', 'WorkSafeBC Figure 20-2; OSHA App. B, for comparison' );
		if ( floorWidth >= TRENCH_WIDTH ) add( 'bench-wide', 'warn', 'WorkSafeBC\'s benching (20.81(1)(c), Figure 20-2) doesn\'t apply over 3.7 m wide: slope or shore it, or have a QRP specify the benches in writing (20.81(1)(a)).', 'WorkSafeBC G20.81' );

	}

	// The tool's default groundwater is an assumption until there's site data: said so.
	const water = params.groundwater === DEFAULT_GROUNDWATER ? `assumed ${ round( params.groundwater, 2 ) } m down: set it from site data` : `${ round( params.groundwater, 2 ) } m down`;
	if ( D > params.groundwater && D > SAFE_DEPTH ) add( 'groundwater', 'warn', `Floor ${ round( D - params.groundwater, 2 ) } m below the groundwater (${ water }): a QRP's written instructions (a PE's with support), or effective dewatering.`, 'WorkSafeBC 20.78(1)(c), G20.78(1)(c)' );
	if ( params.soil === 'wet' && deep ) add( 'wet', 'warn', 'Water coming in: a QRP\'s written instructions (a PE\'s with support, 20.78(2)) unless it\'s dewatered.', 'WorkSafeBC 20.78(1)(c)' );

	if ( plan.walls.length ) add( 'engineered', 'note', 'A professional engineer designs the walls and their support: the sizes, lengths and levels here are rough.', 'WorkSafeBC 20.81(1)(d), G20.81' );
	const below = D > params.groundwater;
	for ( const side of geom.sides ) {

		if ( side.method !== 'wall' ) continue;
		const system = SYSTEMS[ side.system ];
		if ( below && ! system.watertight ) add( `pervious-${ side.n }`, 'warn', `Side ${ side.n }: water comes through the ${ system.label.toLowerCase() } below the groundwater: dewater, grout, or use sheet or secant piles.`, 'NAVFAC DM 7.02 Table 4; FHWA GEC 4 Table 12' );

	}

	const secant = SYSTEMS[ 'secant-piles' ];
	if ( geom.sides.some( s => s.system === 'secant-piles' ) ) {

		const overlap = secant.diameter - secant.centres;
		const atToe = overlap - 2 * VERTICALITY * ( plan.pileLength[ 'secant-piles' ] ?? D );
		if ( overlap < SECANT_MIN_OVERLAP ) add( 'secant-overlap', 'warn', 'Secant piles overlap less than 75 mm.', 'Lindquist, DFI 2011' );
		else if ( atToe <= 0 ) add( 'secant-toe', 'warn', 'Secant piles this long may drift apart at the toe (1 in 200 each): check drilling tolerance, or use bigger piles.', 'Lindquist, DFI 2011' );

	}

	const cantilever = plan.walls.length && plan.levels.length === 0;
	if ( cantilever && D > CANTILEVER_MAX ) add( 'cantilever', 'stop', `A ${ round( D, 1 ) } m cantilever wall, past the practice limit of about 5.5 m: add struts, rakers or tiebacks.`, 'USACE EM 1110-2-2504 2-4a; Caltrans T&S 7-1' );
	else if ( cantilever && D > BRACE_DEPTH ) add( 'cantilever', 'warn', `A ${ round( D, 1 ) } m cantilever wall: usually braced past about 4 m.`, 'USACE EM 1110-2-2504 2-4a' );

	if ( plan.levels.length && plan.type !== 'classic' ) {

		const levels = plan.levels;
		const gaps = levels.slice( 1 ).map( ( z, i ) => z - levels[ i ] );
		if ( levels[ 0 ] > FIRST_LEVEL + 0.05 ) add( 'first-level', 'note', `First level ${ round( levels[ 0 ], 2 ) } m down: usually within 1.5 m of the top.`, 'CN shoring criteria item 11' );
		if ( gaps.some( g => g > LEVEL_SPACING + 0.05 ) ) add( 'level-gap', 'note', 'Levels more than 3 m apart.', 'CN shoring criteria item 12' );
		if ( D - levels[ levels.length - 1 ] > LEVEL_SPACING + 0.05 ) add( 'last-level', 'note', `The last level is ${ round( D - levels[ levels.length - 1 ], 2 ) } m above the floor: usually 3 m at most.`, 'CN shoring criteria item 13' );

	}

	if ( params.spacing > 0 && plan.levels.length && plan.type !== 'classic' ) {

		const usual = supportSpacing( { spacing: 0 }, plan.type );
		if ( params.spacing > usual + 0.05 ) add( 'spacing', 'note', `Supports ${ round( params.spacing, 2 ) } m apart along the walls (usually about ${ usual } m): the walers span that far between them, so they're bigger.`, 'planning default' );

	}

	if ( plan.dropped.length ) add( 'levels-below', 'note', `Level${ plan.dropped.length > 1 ? 's' : '' } at ${ plan.dropped.join( ', ' ) } m left out: at or below the floor.`, 'planning default' );

	for ( const side of geom.sides ) {

		if ( side.method === 'wall' && plan.sideTypes[ side.n ] === 'rakers' && params.bracing === 'struts' ) add( `no-strut-${ side.n }`, 'note', `Side ${ side.n } has no wall opposite to strut against: rakers instead.`, 'planning default' );

	}

	if ( plan.struts ) {

		if ( plan.struts.span > MAX_STRUT ) add( 'strut-span', 'warn', `Struts ${ round( plan.struts.span, 1 ) } m long: past about 20 m, rakers or tiebacks.`, 'NAVFAC DM 7.02 Table 5' );
		else if ( plan.struts.span > KING_POST_SPAN && plan.type !== 'classic' ) add( 'king-posts', 'note', `Struts ${ round( plan.struts.span, 1 ) } m long, with king posts under them.`, 'planning default' );
		// Walls too close for walers.
		if ( plan.struts.direct ) add( 'too-narrow', 'warn', `${ round( plan.struts.span, 2 ) } m between the walls: no room for walers, so the struts bear on the walls' faces; a trench system may suit better.`, 'planning default' );

	}

	for ( const [ n, { rows } ] of Object.entries( plan.anchors ) ) {

		if ( rows.some( r => r.bondCentre < BOND_COVER ) ) add( `anchor-cover-${ n }`, 'warn', `Side ${ n }: the top tiebacks' bond zone is under less than 4.5 m of soil: steeper anchors or a lower first level.`, 'FHWA GEC 4 5.3.7' );

	}

	for ( const [ n, { reach } ] of Object.entries( plan.rakers ) ) {

		const side = geom.sides[ n - 1 ];
		const across = side.axis ? shape.floorSize?.width : shape.floorSize?.length;
		if ( across && reach > across / 2 ) add( `raker-floor-${ n }`, 'note', `Side ${ n }: rakers and kickers take ${ round( reach, 1 ) } m of the floor, over half of it: struts or tiebacks?`, 'planning default; Deep Excavation LLC' );

	}

	if ( Object.keys( plan.rakers ).length ) {

		const bermSlope = 1 / Math.tan( params.rakerAngle * DEG );
		if ( bermSlope < soil.slope ) add( 'berm', 'note', `The berm left for the rakers is cut at ${ ratio( bermSlope ) }, steeper than ${ ratio( soil.slope ) } for the soil: check it stands (safety factor 1.5 while temporary).`, 'NAVFAC DM 7.02 Table 6' );

	}

	if ( geom.trench && ( geom.system === 'hydraulic' ) && ( params.soil === 'C' || params.soil === 'wet' || below ) ) add( 'hydraulic-soil', 'warn', 'Hydraulic shores in type C or wet ground: suppliers\' tables usually don\'t allow it.', 'NAXSA; OSHA App. D, for comparison' );

	if ( floorWidth > 0 && floorWidth < TRENCH_WIDTH && deep ) {

		const long = shape.floorSize ? Math.max( shape.floorSize.width, shape.floorSize.length ) : 0;
		add( 'access', 'note', `A trench: a ladder or ramp within 8 m of anyone in it, ${ Math.max( 1, Math.ceil( long / ( 2 * EXIT_REACH ) ) ) } along this one at least.`, 'WorkSafeBC 20.87(2)' );

	}

	return flags;

}

// Flag ids that shoring.js's own notes (planShoring) already give: its general notes for the first
// excavations' params, and the engineer's note every wall plan has.
export const COVERED = [ 'too-steep', 'over-6m', 'engineered' ];

// --- everything at once, cached --------------------------------------------------------------------

const cache = new Map();

// The whole design for an excavation's params, worked out once for each set of params (the
// readouts ask every frame while a pit digs): { params, geom, plan, stages, stage, quantities,
// flags }. params are normalised first.
export function planExcavation( raw ) {

	const params = normaliseExcavation( raw );
	const key = JSON.stringify( params );
	let design = cache.get( key );
	if ( ! design ) {

		if ( cache.size > 200 ) cache.clear();
		const geom = excavationGeometry( params );
		const plan = bracingPlan( params, geom );
		const stages = excavationStages( params, geom, plan );
		design = { params, geom, plan, stages, stage: currentStage( params, stages ), quantities: excavationQuantities( params, geom, plan ), flags: excavationFlags( params, geom, plan ) };
		cache.set( key, design );

	}

	return design;

}

// --- helpers ---------------------------------------------------------------------------------------

function clamp( value, min, max, fallback ) {

	const n = Number( value );
	return Number.isFinite( n ) ? Math.min( max, Math.max( min, n ) ) : fallback;

}

// 0 (or anything not above zero) for "worked out", else clamped.
function optional( value, min, max ) {

	const n = Number( value );
	return Number.isFinite( n ) && n > 0 ? round( Math.min( max, Math.max( min, n ) ), 2 ) : 0;

}

function round( value, digits ) {

	const f = 10 ** digits;
	return Math.round( value * f ) / f;

}

export function ratio( slope ) {

	return slope === 0 ? 'vertical' : `${ round( slope, 2 ) } : 1`;

}

function format( value ) {

	if ( value >= 100 ) return Math.round( value ).toLocaleString( 'en-CA' );
	return value >= 10 ? value.toFixed( 0 ) : value.toFixed( 1 );

}

function capitalise( text ) {

	return text.charAt( 0 ).toUpperCase() + text.slice( 1 );

}
