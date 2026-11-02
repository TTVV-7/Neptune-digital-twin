import { BufferGeometry, Float32BufferAttribute, Group, Mesh, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { headingToYaw } from './geo.js';
import { FT, H_PILE, PAINT, PANEL, Parts, SHEET, hPile, hydraulicCylinder, sheetWall, trenchBox, trenchBoxWeight } from './shoring-models.js';
import { CORNER_REACH, shoreTheGround } from './shoring-ground.js';
import { COVERED, NO_SUPPORT, SYSTEMS, WALER_DEPTH, geometryAtStage, normaliseExcavation, normalizeSupport, planExcavation } from './excavation-design.js';

// Shoring for excavations: trench boxes, slide rail and hydraulic shores, which shore a trench or
// pit as a whole, and walls of sheet piles, soldier piles with timber lagging, secant piles or
// contiguous piles, which can line any side, with their support levels: walers with struts, corner
// braces and king posts, rakers down to kicker blocks, or tiebacks drilled back into the ground.
// An excavation's params (excavation-design.js) say which: the whole pit shored with one system
// ("support"), or each side sloped, stepped or walled on its own. The design module works out where
// everything goes; this draws it in the pit to scale, rebuilt whenever the params change, and
// shows what's in at the dig stage the params show. Unlike the pit's outline it shows all the
// time: it's a real thing on site. The P panel lists what it's made of, the shored wall area, a
// rough weight, the support levels and the checks. A planning aid only: real shoring is chosen
// from the supplier's tabulated data or designed by an engineer (see docs/shoring.md).

export { NO_SUPPORT, normalizeSupport };
// Dropdown names -> param values: none, then every system by its name.
export const SUPPORTS = {
	'none / sloped': NO_SUPPORT,
	...Object.fromEntries( Object.entries( SYSTEMS ).map( ( [ id, system ] ) => [ system.label, id ] ) ),
};

// Standard trench box lengths and panel heights, in feet, as they're sold.
const BOX_LENGTHS = [ 24, 20, 16, 12, 10, 8 ];
const BASE_BOX = 8;
const STACKER = 4;
// A run of boxes may be this much longer than the trench (a 13.4 m trench takes 24 + 20 ft).
const FIT = 0.05;
// Spreaders, with extensions, reach about this far between the panels.
const MAX_SPREAD = 4.5;
// Hydraulic shores: up to 2.4 m (8 ft) apart along the trench, cylinders up to about 4 m.
const SHORE_SPACING = 2.4;
const MAX_SHORE_SPAN = 4;
const MAX_SHORE_DEPTH = 20 * FT;
const SLIDE_RAIL_BAY = 4;
const SOLDIER_SPACING = 2.4;
// Deeper than this, an excavation needs sloping, benching or shoring before anyone goes in.
const SAFE_DEPTH = 1.2;
// Shoring stands at least this far out of the ground (WorkSafeBC 20.81(5)), so what's at the edge
// can't roll in.
const ABOVE = 0.3;
// Deeper than this, an excavation is dug to a professional's written instructions.
const ENGINEERED_DEPTH = 6;
// Sheet-piled pits deeper than this get struts or corner braces under the waler.
const BRACED_DEPTH = 4;
// Struts across wider than this aren't practical: rakers or tie-backs instead.
const MAX_STRUT = 12;
const WALER_Y = - 0.7;
const RIM_STRIP = 1;
const SHEET_GAP = 0.02;
// Timber lagging boards, 75 x 300 mm, about 12 mm apart.
const BOARD = { thick: 0.075, high: 0.3, gap: 0.012 };
// A capping beam on a pile wall, from this far down to its stick-up.
const CAP_DEPTH = 0.45;
// Rough weights: kg per metre of a Z-sheet 0.6 m wide, of a W360 waler, of strut pipe (324, 508
// and 610 mm, by span), and of a tieback's strand; concrete pile walls and blocks by volume.
const KG = { sheet: 65, waler: 100, strut: [ [ 12, 97 ], [ 20, 150 ], [ Infinity, 200 ] ], strand: 5, head: 30 };

// The side slope the pit is dug to: vertical with any support.
export function wallSlope( params ) {

	return normalizeSupport( params.support ) === NO_SUPPORT ? params.slope : 0;

}

// --- plans: what goes in, from the pit's params alone ---------------------------------------------

const plans = new Map();
// The plan for a pit's params, worked out once for each set of them. Every param but the stage
// shown changes what goes in; the stage only shows and hides what's in by then (showStage).
// { key, design (planExcavation's, finished), summary, wall (m²), weight, notes, levels and checks
// (P panel text), sides ('long' or 'all', for the trench systems), shored (which sides the
// ground's walls go straight up behind: [ { n, back, from, to } ]), build( parts ) }.
export function planShoring( raw ) {

	const params = normaliseExcavation( raw );
	const { stage, ...rest } = params;
	const key = JSON.stringify( rest );
	if ( ! plans.has( key ) ) {

		if ( plans.size > 200 ) plans.clear();
		const design = planExcavation( { ...rest, stage: - 1 } );
		const { geom, plan: bracing } = design;
		let plan;
		if ( geom.trench ) plan = planTrench( design );
		else if ( bracing.type === 'classic' ) plan = classicWalls( design );
		else if ( bracing.walls.length ) plan = planWalls( design );
		else plan = { summary: '', wall: 0, weight: '', notes: [], shored: [], build: null };
		plan.notes.push( ...generalNotes( design ) );
		Object.assign( plan, { key, design, levels: levelsText( design ), checks: checksText( design ) } );
		plans.set( key, plan );

	}

	return plans.get( key );

}

// The notes every pit gets: too steep, and too deep to dig without a professional's written
// instructions. With the whole pit cut one way the words are as the first shoring had them.
function generalNotes( { params, geom, plan, flags } ) {

	const notes = [];
	const steep = flags.find( f => f.id === 'too-steep' );
	if ( steep ) notes.push( params.method === 'sides' ? `${ steep.text.replace( /\.$/, '' ) } (OHS Regulation 20.81).` : 'Over 1.2 m deep, with sides steeper than WorkSafeBC allows even in hard, solid soil (3 : 4): slope, bench or shore them before anyone goes in (OHS Regulation 20.81).' );
	if ( geom.depth > ENGINEERED_DEPTH ) notes.push( plan.walls.length || geom.trench ? 'Over 6 m deep: the shoring is to a professional engineer\'s written design (WorkSafeBC 20.78).' : 'Over 6 m deep: dug to a qualified registered professional\'s written instructions (WorkSafeBC 20.78).' );
	return notes;

}

const PLANNERS = {
	'trench-box': planTrenchBoxes,
	'slide-rail': planSlideRail,
	'hydraulic': planHydraulic,
	'sheet-piles': planSheetPiles,
	'soldier-piles': planSoldierPiles,
};

// A trench system shores the whole pit. Its boxes or shores stand on the floor between the ends,
// which is all of the trench unless the ends are sloped back; slide rail lines all four sides.
function planTrench( { params, geom } ) {

	const { width, length, depth } = params;
	const [ front, right, back, left ] = geom.sides;
	const turned = width > length;
	const across = turned ? length : width;
	const along = Math.max( 0, turned ? right.toe + left.toe : front.toe + back.toe );
	const plan = geom.system === 'slide-rail' ? planSlideRail( { width, length, depth } ) : PLANNERS[ geom.system ]( { width, length, depth, across, along } );
	const sloped = geom.sides.some( side => side.method === 'slope' );
	if ( sloped ) plan.notes = plan.notes.filter( note => ! note.startsWith( 'Ends are open' ) );
	plan.turned = turned;
	plan.outline = { width, length };
	// The long walls, as far along them as the boxes or shores reach; or all four round the corners.
	plan.shored = geom.sides.filter( side => plan.sides === 'all' || side.axis === ( turned ? 0 : 1 ) ).map( side => {

		const [ a, b ] = neighbours( geom.sides, side );
		const reach = plan.sides === 'all' ? null : Math.min( plan.ground.reach, Math.max( width, length ) / 2 );
		return { n: side.n, back: plan.ground.back, from: reach === null ? - a.top - CORNER_REACH : - reach, to: reach === null ? b.top + CORNER_REACH : reach };

	} );
	return plan;

}

// Sheet or soldier piles round the whole pit with the bracing the first shoring gave them, for pits
// saved before support levels could be chosen: drawn and described exactly as they were.
function classicWalls( { params, geom } ) {

	const { width, length, depth } = params;
	const plan = PLANNERS[ geom.system ]( { width, length, depth } );
	plan.outline = { width, length };
	plan.shored = geom.sides.map( side => {

		const [ a, b ] = neighbours( geom.sides, side );
		return { n: side.n, back: plan.ground.back, from: - a.top - CORNER_REACH, to: b.top + CORNER_REACH };

	} );
	return plan;

}

// Trench boxes line the two long sides, end to end and stacked for depth. The run is the fewest
// boxes that leave no room for another, and of those the longest run, longest boxes first.
function planTrenchBoxes( { width, length, depth, ...given } ) {

	const [ across, along ] = given.along !== undefined ? [ given.across, given.along ] : width > length ? [ length, width ] : [ width, length ];
	const lengths = boxRun( along );
	const stack = boxStack( depth );
	const run = lengths.reduce( ( sum, ft ) => sum + ft * FT, 0 );
	const height = stack.reduce( ( sum, ft ) => sum + ft * FT, 0 );
	const inside = across - 2 * PANEL;
	const notes = [];
	if ( lengths.length === 0 ) {

		notes.push( `Too short for a trench box: the shortest is ${ metres( BASE_BOX * FT ) } (8 ft).` );
		return { summary: 'no box fits', wall: 0, weight: '', notes, build: null };

	}

	if ( inside > MAX_SPREAD ) notes.push( `Too wide for a trench box (${ metres( inside ) } between panels; spreaders reach about ${ MAX_SPREAD } m): use slide rail or sheet piles.` );
	const open = ( along - run ) / 2;
	if ( depth > SAFE_DEPTH ) notes.push( 'Ends are open: slope them, or fit end plates, before anyone works there (WorkSafeBC 20.81(2)).' );
	if ( open > 0.05 ) notes.push( `The boxes leave ${ metres( open ) } at each end.` );
	// Lining a long trench all at once is rare: boxes go in with the pipe.
	if ( lengths.length > 2 ) notes.push( `${ lengths.length } boxes line all of it; usually one or two are dragged along as the pipe goes in, and the trench behind them backfilled.` );

	// Boxes by size, then the stackers on them, longest first: "2 × 2.4 × 7.3 m (8 × 24 ft)", height
	// by length, as boxes are sold.
	const stackers = stack.length > 1 && stack[ stack.length - 1 ] === STACKER ? 1 : 0;
	const high = stack.length - stackers;
	const sizes = ( ft, each ) => [ ...new Set( lengths ) ].map( long => {

		const n = each * lengths.filter( l => l === long ).length;
		return `${ n } × ${ ( ft * FT ).toFixed( 1 ) } × ${ ( long * FT ).toFixed( 1 ) } m (${ ft } × ${ long } ft)`;

	} ).join( ' + ' );
	const boxes = lengths.length * high;
	const above = height - depth;
	const summary = `${ boxes } box${ boxes === 1 ? '' : 'es' }${ high > 1 ? `, ${ high } high` : '' }: ${ sizes( stack[ 0 ], high ) }${ stackers ? `, with stacker${ lengths.length === 1 ? '' : 's' } ${ sizes( STACKER, 1 ) }` : '' }; ${ metres( inside ) } between panels, top ${ above < 0.05 ? 'level with' : `${ metres( above ) } above` } the rim`;
	let kg = 0;
	for ( const ft of stack ) for ( const long of lengths ) kg += trenchBoxWeight( { length: long * FT, height: ft * FT, width: across } );
	return {
		summary,
		wall: 2 * run * depth,
		weight: tonnes( kg, 'steel' ),
		notes,
		// Panels against the long walls (the outline), the run centred along the trench; the trench
		// walls beyond it and its ends are bare.
		sides: 'long',
		ground: { back: 0, reach: run / 2 },
		build( parts ) {

			let z = - run / 2;
			for ( const long of lengths ) {

				let y = - depth;
				for ( const ft of stack ) {

					trenchBox( parts, { length: long * FT, height: ft * FT, width: across, y0: y, z0: z + long * FT / 2 } );
					y += ft * FT;

				}

				z += long * FT;

			}

		},
	};

}

// Box lengths (ft) for a trench `along` metres long: of the runs that leave less than the
// shortest box uncovered, the one with the fewest boxes, then the longest run, longest boxes first.
export function boxRun( along ) {

	const limit = Math.floor( ( along + FIT ) / FT + 1e-9 );
	const shortest = BOX_LENGTHS[ BOX_LENGTHS.length - 1 ];
	// fewest[ t ]: the fewest boxes making exactly t ft, and the longest box to start with.
	const fewest = new Array( limit + 1 ).fill( Infinity );
	const first = new Array( limit + 1 ).fill( 0 );
	fewest[ 0 ] = 0;
	for ( let t = 1; t <= limit; t ++ ) {

		for ( const ft of BOX_LENGTHS ) {

			if ( ft <= t && fewest[ t - ft ] + 1 < fewest[ t ] ) {

				fewest[ t ] = fewest[ t - ft ] + 1;
				first[ t ] = ft;

			}

		}

	}

	let best = - 1;
	for ( let t = limit; t > 0; t -- ) {

		if ( ! Number.isFinite( fewest[ t ] ) || along - t * FT >= shortest * FT - FIT ) continue;
		if ( best === - 1 || fewest[ t ] < fewest[ best ] ) best = t;

	}

	const run = [];
	for ( let t = best; t > 0; t -= first[ t ] ) run.push( first[ t ] );
	return run.sort( ( a, b ) => b - a );

}

// Panel heights (ft) from the bottom up, standing at least 0.3 m out of the ground: 2.4 m (8 ft)
// boxes and a 1.2 m (4 ft) stacker on top where that's enough. A pit no deeper than 1.2 m, which
// needs no support, gets a 1.2 m box.
export function boxStack( depth ) {

	if ( depth <= SAFE_DEPTH ) return [ STACKER ];
	const top = depth + ABOVE;
	const stack = [];
	let height = 0;
	while ( height < top - 0.01 ) {

		const ft = top - height <= STACKER * FT + 0.01 && stack.length > 0 ? STACKER : BASE_BOX;
		stack.push( ft );
		height += ft * FT;

	}

	return stack;

}

// Slide rail: posts at the corners and every 4 m or less, with panels sliding down between them
// on all four sides, stacked to the rim; a strut across between facing posts in a trench.
function planSlideRail( { width, length, depth } ) {

	const walls = wallsOf( width, length );
	const bays = walls.map( wall => Math.max( 1, Math.ceil( wall.length / SLIDE_RAIL_BAY - 0.01 ) ) );
	const stack = boxStack( depth ).map( ft => ft * FT );
	const height = stack.reduce( ( a, b ) => a + b, 0 );
	const posts = 4 + bays.reduce( ( sum, n ) => sum + n - 1, 0 );
	const panels = bays.reduce( ( a, b ) => a + b, 0 ) * stack.length;
	const top = Math.max( 0.6, height - depth + 0.2 );
	const perimeter = 2 * ( width + length );
	const across = Math.min( width, length );
	// The long walls: 0 and 2 run along z, 1 and 3 along x.
	const long = width > length ? 1 : 0;
	const struts = across <= 6 ? bays[ long ] - 1 : 0;
	const kg = perimeter * height * 120 + posts * ( depth + top ) * 200 + struts * across * 90;
	const notes = [];
	if ( depth > 7.5 ) notes.push( 'Deeper than most slide rail systems go (about 7.5 m): check with the supplier, or use sheet piles.' );
	return {
		summary: `${ panels } panels in ${ posts } posts (bays ${ maxOf( walls.map( ( w, i ) => w.length / bays[ i ] ) ) } m or less), ${ stack.length } high${ struts ? `, ${ struts } strut${ struts === 1 ? '' : 's' } across` : '' }`,
		wall: perimeter * depth,
		weight: tonnes( kg, 'steel' ),
		notes,
		sides: 'all',
		// The panels' backs, 20 mm in from the outline.
		ground: { back: - 0.02 },
		build( parts ) {

			walls.forEach( ( wall, w ) => {

				const n = bays[ w ];
				const spacing = wall.length / n;
				// Intermediate posts; the corner posts are drawn once each, below.
				for ( let k = 1; k < n; k ++ ) wallBox( parts, PAINT.railPost, wall, k * spacing, 0.125, 0.3, 0.25, depth + top, - depth );
				for ( let k = 0; k < n; k ++ ) {

					const s0 = k === 0 ? 0.3 : k * spacing - 0.1;
					const s1 = k === n - 1 ? wall.length - 0.3 : ( k + 1 ) * spacing + 0.1;
					let y = - depth;
					for ( const h of stack ) {

						wallBox( parts, PAINT.railPanel, wall, ( s0 + s1 ) / 2, 0.08, s1 - s0, 0.12, h, y );
						// A lip along each panel's top, where the next one sits.
						wallBox( parts, PAINT.railPanel, wall, ( s0 + s1 ) / 2, 0.15, s1 - s0, 0.04, 0.08, y + h - 0.08 );
						y += h;

					}

				}

				const corner = wall.at( 0, 0 );
				parts.box( PAINT.railPost, [ 0.3, depth + top, 0.3 ], [ corner.x + 0.15 * ( wall.inward.x + wall.dir.x ), - depth, corner.z + 0.15 * ( wall.inward.z + wall.dir.z ) ] );

			} );

			// Struts between facing intermediate posts, across the short way.
			if ( struts === 0 ) return;
			const [ a, b ] = [ walls[ long ], walls[ long + 2 ] ];
			const n = bays[ long ];
			for ( let k = 1; k < n; k ++ ) {

				const p = a.at( k * a.length / n, 0.25 );
				const q = b.at( b.length - k * b.length / n, 0.25 );
				parts.rod( PAINT.railPost, 0.11, new Vector3( p.x, - 0.9, p.z ), new Vector3( q.x, - 0.9, q.z ), 10 );

			}

		},
	};

}

// Hydraulic shores: a pair of aluminium rails on the long walls with cylinders across, 2.4 m
// apart along the trench, the top cylinder 0.45 m under the rim and none more than 1.2 m apart
// or from the floor. The rails reach from 0.3 m off the floor to 0.3 m out of the ground.
function planHydraulic( { width, length, depth, ...given } ) {

	const [ across, along ] = given.along !== undefined ? [ given.across, given.along ] : width > length ? [ length, width ] : [ width, length ];
	const span = Math.max( 0, along - 1.2 );
	const count = span > 0 ? Math.ceil( span / SHORE_SPACING - 0.01 ) + 1 : 1;
	const spacing = count > 1 ? span / ( count - 1 ) : 0;
	const rows = cylinderRows( depth );
	const rail = depth - 0.3 + ABOVE;
	const notes = [];
	if ( across > MAX_SHORE_SPAN ) notes.push( `Too wide for hydraulic shores (they reach about ${ MAX_SHORE_SPAN } m): use a trench box, slide rail or sheet piles.` );
	if ( depth > MAX_SHORE_DEPTH ) notes.push( 'Deeper than hydraulic shoring tables go (about 6 m, 20 ft): use slide rail or sheet piles.' );
	if ( depth > SAFE_DEPTH ) notes.push( 'Ends are open: slope them or shore them too (WorkSafeBC 20.81(2)).' );
	notes.push( 'In loose or wet ground, add plywood sheeting behind the rails.' );
	// About 5 kg/m of rail and 12 kg a cylinder.
	const kg = count * ( 2 * rail * 5 + rows.length * 12 );
	return {
		summary: `${ count } shore${ count === 1 ? '' : 's' }${ count > 1 ? ` ${ metres( spacing ) } apart` : '' }, ${ rows.length } cylinder${ rows.length === 1 ? '' : 's' } each (${ count * rows.length } in all), on ${ metres( rail ) } rails`,
		wall: 2 * along * depth,
		weight: tonnes( kg, 'aluminium' ),
		notes,
		// The trench walls the rails bear on are bare soil, drawn as faces at the outline (see build).
		sides: 'long',
		ground: { back: 0, reach: along / 2 },
		build( parts ) {

			for ( let i = 0; i < count; i ++ ) {

				const z = count > 1 ? - span / 2 + i * spacing : 0;
				for ( const side of [ - 1, 1 ] ) parts.box( PAINT.aluminium, [ 0.06, rail, 0.09 ], [ side * ( across / 2 - 0.03 ), - depth + 0.3, z ] );
				for ( const y of rows ) hydraulicCylinder( parts, new Vector3( - across / 2 + 0.06, - y, z ), new Vector3( across / 2 - 0.06, - y, z ) );

			}

			// The soil face between the rails, just in front of where the terrain's wall goes up
			// (shoring-ground.js), which is lit as the flat ground it joins.
			for ( const side of [ - 1, 1 ] ) parts.box( PAINT.earth, [ 0.02, depth, along ], [ side * ( across / 2 - 0.012 ), - depth, 0 ] );

		},
	};

}

// Depths below the rim of each row of cylinders.
export function cylinderRows( depth ) {

	const top = Math.min( 0.45, depth / 2 );
	if ( depth - top <= 1.2 ) return [ top ];
	const bottom = depth - 0.75;
	const n = Math.ceil( ( bottom - top ) / 1.2 - 0.01 ) + 1;
	return Array.from( { length: n }, ( _, i ) => top + i * ( bottom - top ) / ( n - 1 ) );

}

// Sheet piles: Z-sheets about 0.6 m wide all round the outline, standing 1 m out of the ground,
// with a waler round the inside 0.7 m down; deeper than 4 m, struts across (up to 12 m) and
// braces across the corners.
function planSheetPiles( { width, length, depth } ) {

	const walls = wallsOf( width, length );
	const perimeter = 2 * ( width + length );
	const sheets = walls.map( wall => Math.max( 2, Math.round( wall.length / SHEET.width ) ) );
	const count = sheets.reduce( ( a, b ) => a + b, 0 );
	const braced = depth > BRACED_DEPTH;
	// Toe-in below the floor: about the exposed height for a cantilever, 0.6 of it when braced.
	const toe = Math.max( 1.5, depth * ( braced ? 0.6 : 1 ) );
	const each = Math.ceil( ( 1 + depth + toe ) * 2 ) / 2;
	const [ across, along ] = width > length ? [ length, width ] : [ width, length ];
	const braces = braced ? bracing( across, along ) : { struts: [], corner: 0 };
	const strutLength = across - 2 * ( SHEET.depth / 2 + 0.36 );
	// Driven walls aren't picked from a supplier's table.
	const notes = [ 'A professional engineer designs the wall: the sheet length and bracing here are rough.' ];
	if ( braced && across > MAX_STRUT ) notes.push( `Over ${ BRACED_DEPTH } m deep and too wide to strut across: rakers or tie-backs.` );
	if ( depth > 8 ) notes.push( 'This deep, expect more than one waler and strut level.' );
	// 65 kg/m of sheet, 100 kg/m of waler (W360), 97 kg/m of strut pipe (324 mm).
	const kg = count * each * 65 + perimeter * 100 + ( braces.struts.length * strutLength + braces.corner * 4 * Math.SQRT2 ) * 97;
	const extras = [ braces.struts.length ? `${ braces.struts.length } strut${ braces.struts.length === 1 ? '' : 's' } across` : '', braces.corner ? '4 corner braces' : '' ].filter( Boolean );
	return {
		summary: `${ count } sheets, ${ metres( perimeter, 0 ) } of wall, ${ metres( each ) } long each (Z-profile, ${ SHEET.width } m wide); waler round the inside${ extras.length ? `, ${ extras.join( ', ' ) }` : '' }`,
		wall: perimeter * depth,
		weight: tonnes( kg, 'steel' ),
		notes,
		sides: 'all',
		// Just behind the outer flanges, which are seen from the pit, in the pockets between the inner
		// ones: the terrain's wall in the same plane would flicker through them.
		ground: { back: SHEET.depth / 2 + SHEET_GAP },
		build( parts ) {

			// The corrugated line round the outline: each sheet goes from one side of the wall line
			// to the other, flange, web, flange, starting on the outside at each corner. The ground
			// comes up to the outer flanges (shoring-ground.js), and earth at rim level fills the
			// pockets between them, behind the inner flanges.
			const h = SHEET.depth / 2;
			const points = [];
			walls.forEach( ( wall, w ) => {

				const n = sheets[ w ];
				const b = wall.length / n;
				const line = [];
				for ( let k = 0; k < n; k ++ ) {

					const d = k % 2 ? h : - h;
					line.push( [ k * b, d ], [ k * b + SHEET.flange, d ], [ ( k + 1 ) * b - SHEET.flange, - d ] );

				}

				line.push( [ wall.length, n % 2 ? h : - h ] );
				points.push( ...line.map( ( [ s, d ] ) => wall.at( s, d ) ) );
				parts.add( PAINT.earth, groundStrip( line.map( ( [ s, d ] ) => [ wall.at( s, d ), wall.at( s, - h - SHEET_GAP ) ] ), 0.012 ) );

			} );
			parts.add( PAINT.sheet, sheetWall( points.map( p => [ p.x, p.z ] ), - depth - 0.2, 1 ) );

			// Waler: a W360 on its side against the inner flanges, web level. It and the struts are
			// the first (only) level, in once the first lift is dug.
			parts.when = 1;
			for ( const wall of walls ) {

				const middle = wall.length / 2;
				for ( const d of [ h + 0.01, h + 0.35 ] ) wallBox( parts, PAINT.waler, wall, middle, d, wall.length - 2 * h, 0.02, 0.25, WALER_Y - 0.125 );
				wallBox( parts, PAINT.waler, wall, middle, h + 0.18, wall.length - 2 * h, 0.34, 0.016, WALER_Y - 0.008 );

			}

			const face = h + 0.36;
			for ( const z of braces.struts ) parts.rod( PAINT.strut, 0.16, toFrame( - across / 2 + face, z, width > length ), toFrame( across / 2 - face, z, width > length ), 12 );
			if ( braces.corner ) {

				for ( const wall of walls ) {

					const a = wall.at( wall.length - braces.corner, face );
					const next = walls[ ( walls.indexOf( wall ) + 1 ) % 4 ];
					const b = next.at( braces.corner, face );
					parts.rod( PAINT.strut, 0.14, new Vector3( a.x, WALER_Y, a.z ), new Vector3( b.x, WALER_Y, b.z ), 12 );

				}

			}

		},
	};

}

// Struts across a braced pit `across` wide, at most 4.5 m apart along it (their positions
// along the long way), and corner braces (their legs along the walls) in pits 6 m and wider.
function bracing( across, along ) {

	const corner = across >= 6 ? Math.min( 3.5, across / 4 ) : 0;
	if ( across > MAX_STRUT ) return { struts: [], corner };
	const from = - along / 2 + Math.max( corner + 1, 1.5 );
	const to = - from;
	if ( to - from < 0.5 ) return { struts: corner ? [] : [ 0 ], corner };
	const n = Math.ceil( ( to - from ) / 4.5 - 0.01 ) + 1;
	return { struts: Array.from( { length: n }, ( _, i ) => from + i * ( to - from ) / ( n - 1 ) ), corner };

}

// Soldier piles: H-piles about 2.4 m apart round the outline (one at each corner), standing
// 0.5 m out of the ground, with 75 mm timber lagging boards behind their inner flanges from the
// floor to 0.3 m out of the ground.
function planSoldierPiles( { width, length, depth } ) {

	const walls = wallsOf( width, length );
	const bays = walls.map( wall => Math.max( 1, Math.ceil( wall.length / SOLDIER_SPACING - 0.01 ) ) );
	const piles = bays.reduce( ( a, b ) => a + b, 0 );
	const perimeter = 2 * ( width + length );
	const toe = Math.max( 1.5, depth * 0.75 );
	const each = Math.ceil( ( 0.5 + depth + toe ) * 2 ) / 2;
	const lagging = perimeter * ( depth + ABOVE );
	const notes = [ 'A professional engineer designs the wall: the pile length and spacing here are rough.' ];
	if ( depth > BRACED_DEPTH ) notes.push( `Over ${ BRACED_DEPTH } m deep: soldier piles need walers with struts, rakers or tie-backs.` );
	return {
		summary: `${ piles } soldier piles (HP310, ${ maxOf( walls.map( ( w, i ) => w.length / bays[ i ] ) ) } m apart or less, ${ metres( each ) } long each), ${ Math.round( lagging ) } m² of timber lagging (${ ( lagging * 0.075 ).toFixed( 1 ) } m³)`,
		wall: perimeter * depth,
		weight: tonnes( piles * each * H_PILE.kgPerM, 'steel' ),
		notes,
		sides: 'all',
		// The lagging's back, behind the piles' inner flanges; their outer halves are in the soil.
		ground: { back: - 0.055 },
		build( parts ) {

			const pitch = BOARD.high + BOARD.gap;
			// No sliver of a board at the top.
			const boards = Math.max( 1, Math.ceil( ( depth + ABOVE - 0.05 ) / pitch ) );
			walls.forEach( ( wall, w ) => {

				const n = bays[ w ];
				const spacing = wall.length / n;
				// The yaw that turns a pile's depth (x) along the wall's inward normal.
				const yaw = Math.atan2( - wall.inward.z, wall.inward.x );
				for ( let k = 0; k < n; k ++ ) {

					const p = wall.at( k * spacing, 0 );
					hPile( parts, { x: p.x, z: p.z, y0: - depth - 0.1, y1: 0.5, yaw } );

				}

			} );
			// The boards row by row from the top, each in once the face behind it is dug.
			for ( let i = boards - 1; i >= 0; i -- ) {

				const y = - depth + i * pitch;
				parts.when = boardWhen( y );
				walls.forEach( ( wall, w ) => {

					const spacing = wall.length / bays[ w ];
					for ( let k = 0; k < bays[ w ]; k ++ ) wallBox( parts, PAINT.timber, wall, ( k + 0.5 ) * spacing, 0.0925, spacing - 0.02, 0.075, Math.min( 0.3, ABOVE - y ), y );

				} );

			}

			parts.when = 0;

		},
	};

}

// --- walls on any side, with support levels ------------------------------------------------------

// Walls of each side's own system, with the support levels and members bracingPlan works out for
// them (excavation-design.js): walers along each level, struts across with corner braces and king
// posts, rakers down to kicker blocks, or tiebacks back into the ground. Walls stand down to their
// embedment below the floor, as they're driven or drilled, which shows in a section. Built in the
// group's frame (x = u, z = -v, y up from the rim), every level's members after the walls, so a dig
// stage shows a prefix of each mesh (showStage).
function planWalls( { geom, plan: bp, quantities } ) {

	const D = geom.depth;
	const walls = geom.sides.filter( side => side.method === 'wall' ).map( side => wallRun( geom, side ) );
	const members = type => bp.members.filter( m => m.type === type );
	const sum = ( list, f ) => list.reduce( ( total, item ) => total + f( item ), 0 );

	// What goes in, system by system, in the order the systems are listed.
	const summary = [];
	let steel = 0;
	let concrete = 0;
	for ( const id of Object.keys( SYSTEMS ) ) {

		const runs = walls.filter( w => w.system === id );
		if ( runs.length === 0 ) continue;
		const system = SYSTEMS[ id ];
		const length = bp.pileLength[ id ];
		const where = sidesText( runs.map( w => w.side.n ) );
		if ( id === 'sheet-piles' ) {

			const count = sum( runs, w => w.sheets );
			summary.push( `${ count } sheets (Z-profile, ${ SHEET.width } m wide) on ${ where }, ${ metres( length ) } long each` );
			steel += count * length * KG.sheet;

		} else if ( id === 'soldier-piles' ) {

			const count = sum( runs, w => w.posts.length );
			const lagging = sum( runs, w => w.span * ( D + ABOVE ) );
			summary.push( `${ count } soldier piles (HP310, ${ maxOf( runs.map( w => w.spacing ) ) } m apart or less) on ${ where }, ${ metres( length ) } long each, ${ Math.round( lagging ) } m² of timber lagging (${ ( lagging * BOARD.thick ).toFixed( 1 ) } m³)` );
			steel += count * length * H_PILE.kgPerM;

		} else {

			const count = sum( runs, w => w.posts.length );
			const gap = Math.round( Math.abs( system.diameter - system.centres ) * 1000 );
			const spec = id === 'secant-piles' ? `${ system.diameter } m, ${ gap } mm overlap` : `${ system.diameter } m, ${ gap } mm gaps`;
			summary.push( `${ count } ${ id === 'secant-piles' ? 'secant' : 'contiguous' } piles (${ spec }) on ${ where }, ${ metres( length ) } long each, under a capping beam` );
			concrete += count * Math.PI * ( system.diameter / 2 ) ** 2 * length + sum( runs, w => w.span ) * system.diameter * ( CAP_DEPTH + system.stickUp );

		}

	}

	const walers = members( 'waler' );
	const struts = members( 'strut' );
	const corners = members( 'corner' );
	const posts = members( 'kingpost' );
	const rakers = members( 'raker' );
	const kickers = members( 'kicker' );
	const tiebacks = members( 'tieback' );
	const span = bp.struts?.span ?? 0;
	const strutKg = KG.strut.find( ( [ upTo ] ) => span <= upTo )[ 1 ];
	steel += sum( walers, m => m.length ) * KG.waler + sum( struts, m => m.length ) * strutKg + sum( [ ...corners, ...rakers ], m => m.length ) * KG.strut[ 0 ][ 1 ];
	steel += sum( posts, m => m.length ) * H_PILE.kgPerM + sum( tiebacks, m => m.length * KG.strand + KG.head );
	concrete += kickers.length * KICKER_VOLUME + sum( tiebacks, m => Math.PI * BOND_RADIUS ** 2 * m.bond );

	const what = [
		struts.length ? plural( struts.length, 'strut' ) + ' across' : '',
		corners.length ? plural( corners.length, 'corner brace' ) : '',
		posts.length ? plural( posts.length, 'king post' ) : '',
		rakers.length ? `${ plural( rakers.length, 'raker' ) } to kicker blocks` : '',
		tiebacks.length ? plural( tiebacks.length, 'tieback' ) : '',
	].filter( Boolean );
	const levels = bp.levels.length;
	summary.push( levels ? `walers at ${ plural( levels, 'level' ) }${ what.length ? ` with ${ listText( what ) }` : '' }` : 'cantilevered, with no support levels' );

	const notes = [ 'A professional engineer designs the walls and their support: the pile lengths, sizes and levels here are rough.' ];
	const wings = walls.filter( w => w.wing > 0.05 );
	if ( wings.length ) notes.push( `The wall${ wings.length > 1 ? 's' : '' } on ${ sidesText( wings.map( w => w.side.n ) ) } run${ wings.length > 1 ? '' : 's' } on past the floor's corners into the slopes or benches beside ${ wings.length > 1 ? 'them' : 'it' }, as far as their tops (${ metres( Math.max( ...wings.map( w => w.wing ) ) ) } at most).` );
	if ( walls.some( w => w.system === 'soldier-piles' ) ) notes.push( 'The lagging goes in from the top down, 1.2 to 1.5 m at a time, as the face is dug (FHWA GEC 4).' );
	if ( rakers.length ) notes.push( 'Rakers: the middle is dug to the floor first, leaving a berm of soil against the walls until the kicker blocks and rakers are in.' );
	if ( tiebacks.length ) notes.push( 'Tiebacks run under the ground behind the walls: nothing is dug or piled in their no-dig zone while they\'re in, and under ground that isn\'t the port\'s they need the owner\'s consent (FHWA GEC 4 5.3.6).' );

	return {
		summary: summary.join( '; ' ),
		wall: quantities.wallArea,
		weight: [ steel >= 50 ? tonnes( steel, 'steel' ) : '', concrete >= 0.5 ? `${ Math.round( concrete ).toLocaleString( 'en-CA' ) } m³ concrete` : '' ].filter( Boolean ).join( ', ' ),
		notes,
		sides: 'all',
		shored: walls.map( w => ( { n: w.side.n, back: SYSTEMS[ w.system ].back, from: - w.ends[ 0 ].reach, to: w.ends[ 1 ].reach } ) ),
		build( parts ) {

			for ( const w of walls ) buildWall( parts, w, D, bp );
			buildMembers( parts, geom, bp );

		},
	};

}

const KICKER_VOLUME = 1.2 * 1 * 0.6;
const BOND_RADIUS = 0.075;

// A wall along one side: where it ends at each neighbour (t along its line: a at -t, b at +t),
// and its sheets, or the posts of its piles (t of each it draws; a corner pile shared with the next
// wall of the same system is drawn by the side before it going round, 1 to 4).
function wallRun( geom, side ) {

	const system = SYSTEMS[ side.system ];
	const pile = system.diameter ?? 0;
	const ends = neighbours( geom.sides, side ).map( other => {

		const wall = other.method === 'wall';
		// Shored round the corner, the ground's walls go straight up there too (shoring-ground.js).
		const reach = other.top + ( wall ? CORNER_REACH : 0 );
		if ( ! wall ) return { t: other.top, other, wall, shared: false, draws: true, owner: false, reach };
		const theirs = SYSTEMS[ other.system ];
		// Going round 1 to 4, the side before a corner takes what the two walls share there.
		const owner = other.n === side.n % 4 + 1;
		if ( other.system === side.system ) return { t: other.top + pile / 2, other, wall, shared: true, draws: owner, owner, reach };
		// Two different walls: the one standing less far out runs on to the other's back, and the
		// other stops at its face.
		if ( system.back < theirs.back ) return { t: other.top + theirs.back - pile / 2, other, wall, shared: false, draws: true, owner, reach };
		return { t: other.top - theirs.inner - pile / 2, other, wall, shared: false, draws: true, owner, reach };

	} );
	const [ a, b ] = ends;
	const span = a.t + b.t;
	const run = { side, system: side.system, ends, span, wing: Math.max( 0, ...ends.filter( e => ! e.wall ).map( e => e.other.top - e.other.toe ) ) };
	if ( side.system === 'sheet-piles' ) run.sheets = Math.max( 2, Math.round( span / SHEET.width ) );
	else {

		const bays = Math.max( 1, Math.ceil( span / ( system.spacing ?? system.centres ) - 0.01 ) );
		run.bays = bays;
		run.spacing = span / bays;
		run.all = Array.from( { length: bays + 1 }, ( _, k ) => - a.t + k * run.spacing );
		run.posts = run.all.filter( ( _, k ) => ! ( k === 0 && a.shared && ! a.draws ) && ! ( k === bays && b.shared && ! b.draws ) );

	}

	return run;

}

// One wall, from its toe below the floor to its stick-up, with the earth at the rim behind it.
function buildWall( parts, w, D, bp ) {

	const { side, ends: [ a, b ] } = w;
	const system = SYSTEMS[ w.system ];
	const bottom = - D - bp.toe;
	parts.when = 0;
	if ( w.system === 'sheet-piles' ) {

		// The corrugated line, flange, web, flange, starting outside the line at the a end, as the
		// first shoring drew it round the pit; earth at rim level fills the pockets behind the inner
		// flanges.
		const h = SHEET.depth / 2;
		const width = w.span / w.sheets;
		const line = [];
		for ( let k = 0; k < w.sheets; k ++ ) {

			const d = k % 2 ? h : - h;
			line.push( [ k * width, d ], [ k * width + SHEET.flange, d ], [ ( k + 1 ) * width - SHEET.flange, - d ] );

		}

		line.push( [ w.span, w.sheets % 2 ? h : - h ] );
		parts.add( PAINT.sheet, sheetWall( line.map( ( [ s, d ] ) => at( side, s - a.t, d ) ).map( p => [ p.x, p.z ] ), bottom, system.stickUp, false ) );
		parts.add( PAINT.earth, groundStrip( line.map( ( [ s, d ] ) => [ at( side, s - a.t, d ), at( side, s - a.t, - h - SHEET_GAP ) ] ), 0.012 ) );

	} else if ( w.system === 'soldier-piles' ) {

		// H-piles with their flanges facing into the pit, lagging boards behind the inner flanges
		// in every bay, row by row from the top, each in once the face behind it is dug.
		const yaw = side.axis ? ( side.sign > 0 ? Math.PI : 0 ) : - side.sign * Math.PI / 2;
		for ( const t of w.posts ) {

			const p = at( side, t, 0 );
			hPile( parts, { x: p.x, z: p.z, y0: bottom, y1: system.stickUp, yaw } );

		}

		const pitch = BOARD.high + BOARD.gap;
		const boards = Math.max( 1, Math.ceil( ( D + ABOVE - 0.05 ) / pitch ) );
		for ( let i = boards - 1; i >= 0; i -- ) {

			const y = - D + i * pitch;
			parts.when = boardWhen( y );
			for ( let k = 0; k < w.bays; k ++ ) sideBox( parts, PAINT.timber, side, w.all[ k ] + 0.01, w.all[ k + 1 ] - 0.01, 0.055, 0.055 + BOARD.thick, y, y + Math.min( BOARD.high, ABOVE - y ) );

		}

		parts.when = 0;

	} else {

		// Bored piles standing just outside the line, their faces on it, under a capping beam;
		// secant primaries (unreinforced, drilled first) a shade lighter than the secondaries cut
		// into them.
		const r = system.diameter / 2;
		const secant = w.system === 'secant-piles';
		w.all.forEach( ( t, k ) => {

			if ( ! w.posts.includes( t ) ) return;
			const p = at( side, t, - r );
			parts.rod( secant && k % 2 === 0 ? PAINT.concreteLight : PAINT.concrete, r, new Vector3( p.x, bottom, p.z ), new Vector3( p.x, - CAP_DEPTH + 0.05, p.z ), 16 );

		} );
		// The beam over the piles' tops; at a corner with another wall like it, the side that draws
		// the corner pile covers the corner, and the other stops at its line.
		const beamEnd = e => e.shared ? ( e.draws ? e.other.top + system.diameter : e.other.top ) : e.t + r;
		sideBox( parts, PAINT.concrete, side, - beamEnd( a ), beamEnd( b ), - system.diameter, 0, - CAP_DEPTH, system.stickUp );

	}

	// A metre of worked ground behind the wall at the rim; round a corner with another wall, the side
	// that draws the corner takes the square there.
	const stripEnd = e => e.wall ? e.other.top + SYSTEMS[ e.other.system ].back + ( e.owner ? RIM_STRIP : 0 ) : e.other.top;
	sideBox( parts, PAINT.earth, side, - stripEnd( a ), stripEnd( b ), - system.back - RIM_STRIP, - system.back, - 0.018, 0.012 );

}

// The support levels' members, each level after the walls and the one above it.
function buildMembers( parts, geom, bp ) {

	const D = geom.depth;
	const sideOf = n => geom.sides[ n - 1 ];
	const v = ( [ x, y, z ] ) => new Vector3( x, y, z );
	for ( const m of bp.members ) {

		parts.when = m.level === null || m.level === undefined ? 0 : m.level + 1;
		if ( m.type === 'waler' ) {

			// A W360 on its side against the wall: flanges up and down its face, web level.
			const side = sideOf( m.side );
			const t0 = side.axis ? - m.a[ 2 ] : m.a[ 0 ];
			const t1 = side.axis ? - m.b[ 2 ] : m.b[ 0 ];
			const d = SYSTEMS[ side.system ].inner + WALER_DEPTH / 2;
			const y = m.a[ 1 ];
			for ( const f of [ - 1, 1 ] ) sideBox( parts, PAINT.waler, side, Math.min( t0, t1 ), Math.max( t0, t1 ), d + f * 0.16, d + f * 0.18, y - 0.125, y + 0.125 );
			sideBox( parts, PAINT.waler, side, Math.min( t0, t1 ), Math.max( t0, t1 ), d - 0.17, d + 0.17, y - 0.008, y + 0.008 );

		} else if ( m.type === 'strut' ) {

			// Pipe, heavier the longer it spans.
			const span = bp.struts?.span ?? m.length;
			parts.rod( PAINT.strut, span <= 12 ? 0.16 : span <= 20 ? 0.25 : 0.3, v( m.a ), v( m.b ), 12 );

		} else if ( m.type === 'corner' ) {

			parts.rod( PAINT.strut, 0.14, v( m.a ), v( m.b ), 12 );

		} else if ( m.type === 'kingpost' ) {

			// An H-pile with its web along the struts it holds up.
			const alongZ = bp.struts?.across?.[ 0 ] === 1 || bp.struts?.across?.[ 0 ] === 3;
			hPile( parts, { x: m.a[ 0 ], z: m.a[ 2 ], y0: m.a[ 1 ], y1: m.b[ 1 ], yaw: alongZ ? Math.PI / 2 : 0 } );

		} else if ( m.type === 'raker' ) {

			parts.rod( PAINT.strut, 0.16, v( m.a ), v( m.b ), 12 );

		} else if ( m.type === 'kicker' ) {

			// Cast half into the floor, so the raker bears on the middle of its face.
			const side = sideOf( m.side );
			parts.box( PAINT.concrete, [ m.size.across, m.size.height, m.size.along ], [ m.a[ 0 ], - D - m.size.height / 2, m.a[ 2 ] ], side.axis ? 0 : Math.PI / 2 );

		} else if ( m.type === 'tieback' ) {

			// The head on the waler's face (a bearing plate and the wedge block), the strand out
			// through the wall in its sheath, then the grouted bond length.
			const side = sideOf( m.side );
			const a = v( m.a );
			const start = v( m.bondStart );
			const end = v( m.b );
			const back = a.clone().sub( end ).normalize();
			const t = side.axis ? - m.a[ 2 ] : m.a[ 0 ];
			const d = SYSTEMS[ side.system ].inner + WALER_DEPTH;
			sideBox( parts, PAINT.strut, side, t - 0.17, t + 0.17, d, d + 0.04, a.y - 0.17, a.y + 0.17 );
			parts.rod( PAINT.strut, 0.07, a.clone().addScaledVector( back, 0.03 ), a.clone().addScaledVector( back, 0.16 ), 10 );
			parts.rod( PAINT.tendon, 0.035, a, start, 8 );
			parts.rod( PAINT.concrete, BOND_RADIUS, start, end, 10 );

		}

	}

	parts.when = 0;

}

// A point t along a side, d in from its line (negative: behind it) and y up from the rim, in the
// shoring group's frame: x = u, z = -v (as excavation-design.js gives its members).
function at( side, t, d, y = 0 ) {

	const c = side.sign * ( side.top - d );
	return side.axis ? new Vector3( c, y, - t ) : new Vector3( t, y, - c );

}

// A box lined up with a side: from t0 to t1 along it, d0 to d1 in from its line, y0 to y1 up.
function sideBox( parts, material, side, t0, t1, d0, d1, y0, y1 ) {

	const p = at( side, ( t0 + t1 ) / 2, ( d0 + d1 ) / 2 );
	parts.box( material, [ Math.abs( d1 - d0 ), y1 - y0, Math.abs( t1 - t0 ) ], [ p.x, y0, p.z ], side.axis ? 0 : Math.PI / 2 );

}

// The two sides at either end of a side (excavation-design.js): for the front and back the left
// and the right (t = u), for the right and left the back and the front (t = v).
function neighbours( sides, side ) {

	return side.axis === 0 ? [ sides[ 3 ], sides[ 1 ] ] : [ sides[ 2 ], sides[ 0 ] ];

}

// A lagging board is in once the pit is dug down to its foot (never before the first lift, even
// for the boards standing out of the ground).
function boardWhen( y ) {

	return Math.max( 0.01, - y );

}

// --- the pit's frame ----------------------------------------------------------------------------

// The four walls of a pit `width` (x) by `length` (z), centred, going round: each with where
// it starts, which way it runs, its inward normal and its length. wall.at( s, d ) is the point
// s along it and d in from the outline (negative: outside).
function wallsOf( width, length ) {

	const [ x, z ] = [ width / 2, length / 2 ];
	const corners = [ [ x, - z ], [ x, z ], [ - x, z ], [ - x, - z ] ];
	return corners.map( ( [ cx, cz ], i ) => {

		const [ nx, nz ] = corners[ ( i + 1 ) % 4 ];
		const wallLength = Math.hypot( nx - cx, nz - cz );
		const dir = new Vector3( ( nx - cx ) / wallLength, 0, ( nz - cz ) / wallLength );
		// Going round anticlockwise seen from above, inward is to the left.
		const inward = new Vector3( dir.z, 0, - dir.x );
		if ( inward.x * - cx + inward.z * - cz < 0 ) inward.negate();
		return {
			length: wallLength,
			dir,
			inward,
			at: ( s, d ) => new Vector3( cx + dir.x * s + inward.x * d, 0, cz + dir.z * s + inward.z * d ),
		};

	} );

}

// A box lined up with a wall: centred s along it and d in from the outline, `along` long,
// `thick` deep (inward), `height` tall from y0.
function wallBox( parts, material, wall, s, d, along, thick, height, y0 ) {

	const p = wall.at( s, d );
	const yaw = Math.abs( wall.dir.x ) > 0.5 ? Math.PI / 2 : 0;
	parts.box( material, [ thick, height, along ], [ p.x, y0, p.z ], yaw );

}

// A point given across and along a trench, in the pit's frame (turned when it runs along x).
function toFrame( across, along, turned ) {

	return turned ? new Vector3( along, WALER_Y, across ) : new Vector3( across, WALER_Y, along );

}

// Earth at rim level round the shoring, a metre wide. Behind the shoring the terrain's face is
// drawn back up to the rim (shoring-ground.js), but its colour still says it was dug, in patches
// that follow the grid: the strip evens it out, as a worked edge. Along every wall, from its
// outside corner to the next wall's back, or along the two long walls (along z: the frame the
// trench box and hydraulic plans build in) as far as the shoring reaches.
function rimStrip( parts, plan, width, length ) {

	const { back, reach } = plan.ground;
	for ( const wall of wallsOf( width, length ) ) {

		if ( plan.sides === 'long' ) {

			if ( Math.abs( wall.dir.z ) < 0.5 ) continue;
			const along = 2 * Math.min( reach, wall.length / 2 );
			wallBox( parts, PAINT.earth, wall, wall.length / 2, - back - RIM_STRIP / 2, along, RIM_STRIP, 0.03, - 0.018 );
			continue;

		}

		wallBox( parts, PAINT.earth, wall, ( wall.length - RIM_STRIP ) / 2, - back - RIM_STRIP / 2, wall.length + 2 * back + RIM_STRIP, RIM_STRIP, 0.03, - 0.018 );

	}

}

// A flat strip at height y between pairs of points [ a, b ] along a line: the ground from a
// corrugated wall (a) out to a straight edge (b).
function groundStrip( pairs, y ) {

	const positions = [];
	const triangle = ( p, q, r ) => {

		// Wound anticlockwise seen from above, so it faces up whichever way the wall runs.
		const up = ( q.z - p.z ) * ( r.x - p.x ) - ( q.x - p.x ) * ( r.z - p.z ) > 0;
		for ( const v of up ? [ p, q, r ] : [ p, r, q ] ) positions.push( v.x, y, v.z );

	};
	for ( let i = 0; i < pairs.length - 1; i ++ ) {

		const [ a0, b0 ] = pairs[ i ];
		const [ a1, b1 ] = pairs[ i + 1 ];
		triangle( a0, b0, b1 );
		triangle( a0, b1, a1 );

	}

	const count = positions.length / 3;
	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new Float32BufferAttribute( positions, 3 ) );
	geometry.setAttribute( 'normal', new Float32BufferAttribute( Array.from( { length: count }, () => [ 0, 1, 0 ] ).flat(), 3 ) );
	geometry.setAttribute( 'uv', new Float32BufferAttribute( new Float32Array( count * 2 ), 2 ) );
	return geometry;

}

// --- the shoring in the scene -------------------------------------------------------------------

// Draws the shoring of every excavation that has some, in the scene rather than in the
// excavation's own model (which only shows in build mode), and keeps it in step: rebuilt when the
// pit's params change, moved when the pit moves or its rim changes, and showing what's in at the
// pit's dig stage (its params' stage: walls, levels down to the one installed, lagging down to the
// dig) without being rebuilt.
// rimOf( entry ): the height of the pit's rim, from its design in the terrain.
export function setUpShoring( { scene, models, terrain, layers, kind, rimOf } ) {

	const root = new Group();
	root.name = 'shoring';
	scene.add( root );
	const shown = new Map(); // entry -> { key, group, plan, stage }
	const ground = shoreTheGround( terrain );
	// Switched off in the Show panel, or showing Before (with no pits): not drawn, and the pits'
	// walls are drawn as dug rather than straight up behind it.
	let drawn = true;

	const update = entry => {

		if ( entry.kind !== kind ) return;
		const { params, state } = entry;
		const plan = planShoring( params );
		let item = shown.get( entry );
		if ( item?.key !== plan.key ) {

			remove( entry );
			if ( ! plan.build ) return;
			item = { key: plan.key, group: buildPit( plan ), plan };
			shown.set( entry, item );
			root.add( item.group );

		}

		item.stage = planExcavation( params ).stage;
		showStage( item.group, item.stage );
		const rim = rimOf( entry ) ?? state.up;
		item.group.position.set( - state.east, rim, state.north );
		item.group.rotation.y = headingToYaw( state.heading );

	};

	const remove = entry => {

		const item = shown.get( entry );
		if ( ! item ) return;
		root.remove( item.group );
		item.group.traverse( o => o.geometry?.dispose() );
		shown.delete( entry );

	};

	// The ground's walls go straight up behind the shoring (shoring-ground.js), side by side: the
	// sides shored as far as the shoring reaches, next to vertical sides as dug.
	const shapeGround = () => ground.set( ! drawn ? [] : [ ...shown ].filter( ( [ , item ] ) => item.group.visible ).map( ( [ entry, { group, plan, stage } ] ) => {

		const design = planExcavation( entry.params );
		const geom = geometryAtStage( design.geom, design.plan, stage ?? design.stage );
		const { east, north, heading } = entry.state;
		return { east, north, heading, rim: group.position.y, sides: geom.sides.map( side => groundSide( geom, plan, side ) ) };

	} ) );

	models.addEventListener( 'add', ( { entry } ) => {

		update( entry );
		shapeGround();

	} );
	models.addEventListener( 'change', ( { entry } ) => {

		update( entry );
		shapeGround();

	} );
	models.addEventListener( 'remove', ( { entry } ) => {

		remove( entry );
		shapeGround();

	} );
	// A flatten area reaching a pit brings its rim down.
	terrain.addEventListener( 'zones', () => {

		models.entries.forEach( update );
		shapeGround();

	} );
	for ( const entry of models.entries ) update( entry );
	shapeGround();
	layers.addLayer( 'shoring', {
		name: 'Shoring in pits',
		count: () => shown.size,
		setShown: on => {

			drawn = on;
			root.visible = on;
			shapeGround();

		},
	} );

	const api = { root, shown, planShoring, ground };
	if ( window.twin ) window.twin.shoring = api;
	return api;

}

// One side as the ground's shader takes it (shoring-ground.js): where its line is if it's vertical,
// and how far behind it and along it it's shored. While rakers wait, the berm left against a wall
// is eased across the wall's line much as a vertical side is (to a few centimetres), so it's
// straightened too, between the floor's corners, where no slope beside it is shallower.
function groundSide( geom, plan, side ) {

	const berm = side.profile === 'berm';
	const line = side.profile === 'vertical' || berm ? side.top : null;
	const shored = line === null ? null : plan.shored.find( s => s.n === side.n );
	if ( ! shored ) return { line, back: 0, from: null, to: null };
	let { from, to } = shored;
	if ( berm ) {

		const [ a, b ] = neighbours( geom.sides, side );
		if ( a.method !== 'wall' ) from = Math.max( from, - a.toe );
		if ( b.method !== 'wall' ) to = Math.min( to, b.toe );

	}

	return { line, back: shored.back, from, to };

}

// Collects parts as Parts does, each tagged with when it goes in (parts.when: 0 with the walls,
// k + 1 with support level k, or for lagging the depth dug before it's in), and merges them one
// mesh per material in that order, so a dig stage is a prefix of each: drawn with a draw range,
// with nothing rebuilt and still one draw call per material.
class StagedParts extends Parts {

	constructor() {

		super();
		this.when = 0;
		this.whens = new Map(); // material -> [ when ]

	}

	add( material, geometry ) {

		super.add( material, geometry );
		if ( ! this.whens.has( material ) ) this.whens.set( material, [] );
		this.whens.get( material ).push( this.when );
		return this;

	}

	build( group = new Group() ) {

		for ( const [ material, list ] of this.lists ) {

			const whens = this.whens.get( material );
			const order = list.map( ( _, i ) => i ).sort( ( a, b ) => whens[ a ] - whens[ b ] || a - b );
			const mesh = new Mesh( mergeGeometries( order.map( i => list[ i ] ) ), material );
			// [ when, vertices up to and including it ], and what the when is measured against.
			const steps = [];
			let count = 0;
			for ( const i of order ) {

				count += list[ i ].attributes.position.count;
				if ( steps.length && steps[ steps.length - 1 ][ 0 ] === whens[ i ] ) steps[ steps.length - 1 ][ 1 ] = count;
				else steps.push( [ whens[ i ], count ] );

			}

			mesh.userData.steps = steps;
			mesh.userData.byDepth = material === PAINT.timber;
			group.add( mesh );

		}

		this.lists.clear();
		this.whens.clear();
		return group;

	}

}

// Shows what's in at a dig stage (excavation-design.js excavationStages): the walls once they're
// in, the levels installed, lagging down to the depth dug. Nothing when it's the finished pit but
// the draw ranges back to whole.
export function showStage( group, stage ) {

	group.visible = stage.walls !== false;
	group.traverse( mesh => {

		const steps = mesh.userData?.steps;
		if ( ! steps ) return;
		const limit = mesh.userData.byDepth ? stage.dig + 1e-6 : stage.installed;
		let count = 0;
		for ( const [ when, upTo ] of steps ) if ( when <= limit ) count = upTo;
		mesh.geometry.setDrawRange( 0, count );
		mesh.visible = count > 0;

	} );

}

// The shoring for a pit, in its frame: x across its width, z along its length, y up from the rim.
function buildPit( plan ) {

	const parts = new StagedParts();
	const inner = new Group();
	if ( plan.outline ) {

		// The first planners: trench systems along the longer side, or a ring of walls.
		const { width, length } = plan.outline;
		// Planners that only line the long walls build as if the pit ran along z.
		const canonical = plan.sides === 'long';
		if ( canonical && plan.turned ) inner.rotation.y = Math.PI / 2;
		plan.build( parts );
		parts.when = 0;
		if ( canonical ) rimStrip( parts, plan, Math.min( width, length ), Math.max( width, length ) );
		else rimStrip( parts, plan, width, length );

	} else plan.build( parts );

	parts.build( inner );
	const group = new Group();
	group.name = 'Shoring';
	group.add( inner );
	// Rays pass through it: the pit's outline is what's clicked, and the player walks the ground.
	group.traverse( o => {

		o.raycast = () => {};

	} );
	return group;

}

// --- P panel readouts --------------------------------------------------------------------------

// Added to the excavation's readouts (kinds.js). Notes are written out in full across the panel,
// and a readout with nothing to say is left out.
export const SHORING_READOUTS = [
	{ label: 'shoring', note: true, get: entry => planShoring( entry.params ).summary },
	{ label: 'shored wall', get: entry => wallText( planShoring( entry.params ).wall ) },
	{ label: 'weight (approx.)', get: entry => planShoring( entry.params ).weight },
	{ label: 'shoring notes', note: true, get: entry => planShoring( entry.params ).notes.join( ' ' ) },
	{ label: 'support levels', note: true, get: entry => planShoring( entry.params ).levels },
	{ label: 'checks', note: true, get: entry => planShoring( entry.params ).checks },
];

function wallText( area ) {

	return area > 0 ? `${ Math.round( area ).toLocaleString( 'en-CA' ) } m²` : '';

}

const BRACING_NAMES = {
	none: 'None (cantilever)',
	struts: 'Walers and struts',
	rakers: 'Rakers to kicker blocks',
	tiebacks: 'Tiebacks',
	classic: 'One waler 0.7 m down, as the first shoring had it',
};

// The support levels, for the P panel: what holds the walls, where the levels are and what's in
// them, the embedment and the pile lengths, and how far rakers and tiebacks reach. Empty without
// walls (trench systems bring their own: see the summary).
function levelsText( { params, geom, plan, quantities } ) {

	if ( plan.walls.length === 0 ) return '';
	const D = geom.depth;
	const parts = [];
	// The first shoring gave soldier piles no levels at all.
	const name = plan.type === 'classic' && plan.levels.length === 0 ? 'None (cantilever), as the first shoring had it' : BRACING_NAMES[ plan.type ];
	const head = `${ name }${ params.bracing === 'auto' ? `, suggested for ${ metres( D ) } deep` : '' }`;
	if ( plan.levels.length ) {

		const how = plan.suggested ? ' (the first within 1.5 m of the top, then no more than 3 m apart or above the floor)' : '';
		parts.push( `${ head }: ${ plural( plan.levels.length, 'level' ) }, ${ listText( plan.levels.map( z => String( round( z, 2 ) ) ) ) } m down${ plan.type === 'classic' ? '' : how }` );

	} else parts.push( `${ head }: no support levels` );

	// Sides held another way than the rest (a wall with none opposite to strut against).
	const types = Object.entries( plan.sideTypes ).filter( ( [ , type ] ) => type !== plan.type && plan.type !== 'classic' && type !== 'none' );
	if ( types.length ) parts.push( types.map( ( [ n, type ] ) => `side ${ n } ${ type === 'rakers' ? 'on rakers, with no wall opposite' : type }` ).join( ', ' ) );

	if ( quantities.struts.count ) parts.push( `${ plural( quantities.struts.count, 'strut' ) } ${ metres( plan.struts.span ) } long${ quantities.corners ? `, ${ plural( quantities.corners, 'corner brace' ) }` : '' }${ quantities.kingPosts ? `, ${ plural( quantities.kingPosts, 'king post' ) } under them` : '' }` );
	else if ( quantities.corners ) parts.push( plural( quantities.corners, 'corner brace' ) );
	const rakers = Object.values( plan.rakers );
	if ( rakers.length ) parts.push( `${ plural( quantities.rakers.count, 'raker' ) } at ${ params.rakerAngle }° to ${ plural( quantities.kickers, 'kicker block' ) }, taking up to ${ metres( Math.max( ...rakers.map( r => r.reach ) ) ) } of the floor from the wall` );
	const anchors = Object.entries( plan.anchors );
	if ( anchors.length ) {

		const rows = anchors.flatMap( ( [ , a ] ) => a.rows );
		const free = rows.map( r => r.free );
		const lo = Math.min( ...free );
		const hi = Math.max( ...free );
		parts.push( `${ plural( quantities.tiebacks.count, 'tieback' ) } at ${ params.anchorAngle }° below level, unbonded ${ lo === hi ? metres( lo ) : `${ round( lo, 1 ) } to ${ metres( hi ) }` }, bonded ${ metres( params.bondLength ) }` );
		// The no-dig zone behind each side, the same depth for sides alike.
		const reaches = new Map();
		for ( const [ n, a ] of anchors ) {

			const r = metres( a.reach );
			reaches.set( r, [ ...reaches.get( r ) ?? [], Number( n ) ] );

		}

		parts.push( [ ...reaches ].map( ( [ r, list ] ) => `no-dig zone ${ r } behind ${ sidesText( list ) }` ).join( ', ' ) );

	}

	const how = params.toe > 0 ? 'as set' : plan.type === 'classic' ? 'as the first shoring had it' : plan.levels.length ? 'half the depth, 1.5 m at least' : '1.5 times the depth';
	parts.push( `embedment ${ metres( plan.toe ) } below the floor (${ how })` );
	parts.push( Object.entries( plan.pileLength ).map( ( [ id, length ] ) => `${ id === 'sheet-piles' ? 'sheets' : SYSTEMS[ id ].label.toLowerCase().replace( ' + lagging', '' ).replace( 'pile wall', 'piles' ) } ${ metres( length ) } long` ).join( ', ' ) );
	return `${ parts.join( '; ' ) }.`;

}

const LEVEL_ORDER = { stop: 0, warn: 1, note: 2 };

// The WorkSafeBC and practice checks (excavation-design.js excavationFlags), the gravest first, with
// their sources; less what the shoring notes already say (and, for the first shoring's soldier
// piles, the cantilever its own note warns of). A check made side by side and saying the same of
// each is said once for them all: "Sides 1 and 3: ...".
function checksText( { plan, flags } ) {

	const kept = flags.filter( f => ! COVERED.includes( f.id ) && ! ( plan.type === 'classic' && f.id === 'cantilever' ) );
	const merged = [];
	for ( const f of kept ) {

		const [ , n, rest ] = /^Side (\d): (.*)$/s.exec( f.text ) ?? [];
		const same = n && merged.find( m => m.rest === rest && m.level === f.level && m.source === f.source );
		if ( same ) same.sides.push( Number( n ) );
		else merged.push( { ...f, rest, sides: n ? [ Number( n ) ] : null } );

	}

	return merged
		.sort( ( a, b ) => LEVEL_ORDER[ a.level ] - LEVEL_ORDER[ b.level ] )
		.map( f => {

			const text = f.sides ? `${ capitalise( sidesText( f.sides ) ) }: ${ f.rest }` : f.text;
			return `${ f.level === 'stop' ? 'Stop: ' : '' }${ /[.:]$/.test( text ) ? text.slice( 0, - 1 ) : text } (${ f.source }).`;

		} )
		.join( ' ' );

}

// --- helpers ------------------------------------------------------------------------------------

function metres( value, digits = 1 ) {

	return `${ value.toLocaleString( 'en-CA', { minimumFractionDigits: digits, maximumFractionDigits: digits } ) } m`;

}

function round( value, digits ) {

	const f = 10 ** digits;
	return Math.round( value * f ) / f;

}

function capitalise( text ) {

	return text.charAt( 0 ).toUpperCase() + text.slice( 1 );

}

function plural( count, word ) {

	return `${ count.toLocaleString( 'en-CA' ) } ${ word }${ count === 1 ? '' : 's' }`;

}

// 'a', 'a and b', 'a, b and c'.
function listText( items ) {

	return items.length < 2 ? items.join( '' ) : `${ items.slice( 0, - 1 ).join( ', ' ) } and ${ items[ items.length - 1 ] }`;

}

// 'side 2', 'sides 1 and 3', 'all four sides'.
function sidesText( list ) {

	const sorted = [ ...new Set( list ) ].sort();
	if ( sorted.length === 4 ) return 'all four sides';
	return `side${ sorted.length > 1 ? 's' : '' } ${ listText( sorted.map( String ) ) }`;

}

function maxOf( values ) {

	return Math.max( ...values ).toFixed( 1 );

}

function tonnes( kg, what ) {

	const t = kg / 1000;
	return `${ t < 10 ? t.toFixed( 1 ) : Math.round( t ).toLocaleString( 'en-CA' ) } t ${ what }`;

}
