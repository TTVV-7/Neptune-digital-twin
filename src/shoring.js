import { BufferGeometry, Float32BufferAttribute, Group, Vector3 } from 'three';
import { headingToYaw } from './geo.js';
import { FT, H_PILE, PAINT, PANEL, Parts, SHEET, hPile, hydraulicCylinder, sheetWall, trenchBox, trenchBoxWeight } from './shoring-models.js';
import { shoreTheGround } from './shoring-ground.js';

// Shoring for excavations: trench boxes, slide rail, hydraulic shores, sheet piles, and soldier
// piles with timber lagging. An excavation's "support" param picks one; its walls are then cut
// vertical, and the shoring is drawn in the pit to scale, rebuilt from the pit's width, length and
// depth whenever they change. Unlike the pit's outline it shows all the time: it's a real thing
// on site. The P panel lists what it's made of, the shored wall area, a rough weight and
// warnings. A planning aid only: real shoring is chosen from the supplier's tabulated data or
// designed by an engineer (see docs/shoring.md).

export const NO_SUPPORT = 'none';
// Dropdown names -> param values.
export const SUPPORTS = {
	'none / sloped': NO_SUPPORT,
	'Trench box': 'trench-box',
	'Slide rail': 'slide-rail',
	'Hydraulic shores': 'hydraulic',
	'Sheet piles': 'sheet-piles',
	'Soldier piles + lagging': 'soldier-piles',
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
// Deeper than this, the support has to be engineered.
const ENGINEERED_DEPTH = 6;
// Sheet-piled pits deeper than this get struts or corner braces under the waler.
const BRACED_DEPTH = 4;
// Struts across wider than this aren't practical: rakers or tie-backs instead.
const MAX_STRUT = 12;
const WALER_Y = - 0.7;
const RIM_STRIP = 1;

export function normalizeSupport( value ) {

	return Object.values( SUPPORTS ).includes( value ) ? value : NO_SUPPORT;

}

// The side slope the pit is dug to: vertical with any support.
export function wallSlope( params ) {

	return normalizeSupport( params.support ) === NO_SUPPORT ? params.slope : 0;

}

// --- plans: what goes in, from the pit's params alone ---------------------------------------------

const plans = new Map();
// The plan for a pit's params, worked out once for each size and support.
export function planShoring( params ) {

	const { width, length, depth, slope } = params;
	const support = normalizeSupport( params.support );
	const key = [ support, width, length, depth, slope ].join();
	if ( ! plans.has( key ) ) {

		if ( plans.size > 200 ) plans.clear();
		const plan = PLANNERS[ support ]?.( { width, length, depth } ) ?? { summary: '', wall: 0, weight: '', notes: [], build: null };
		plan.notes.push( ...generalNotes( support, params ) );
		plans.set( key, plan );

	}

	return plans.get( key );

}

function generalNotes( support, { depth, slope } ) {

	const notes = [];
	if ( support === NO_SUPPORT && depth > SAFE_DEPTH && slope < 1 ) notes.push( 'Over 1.2 m deep: needs sloping, benching or shoring before anyone goes in (WorkSafeBC Part 20).' );
	if ( depth > ENGINEERED_DEPTH ) notes.push( 'Over 6 m deep: the sides or their support must be designed by an engineer (WorkSafeBC Part 20).' );
	return notes;

}

const PLANNERS = {
	'trench-box': planTrenchBoxes,
	'slide-rail': planSlideRail,
	'hydraulic': planHydraulic,
	'sheet-piles': planSheetPiles,
	'soldier-piles': planSoldierPiles,
};

// Trench boxes line the two long sides, end to end and stacked for depth. The run is the fewest
// boxes that leave no room for another, and of those the longest run, longest boxes first.
function planTrenchBoxes( { width, length, depth } ) {

	const [ across, along ] = width > length ? [ length, width ] : [ width, length ];
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
	notes.push( `Ends are open: they need end plates or sloping${ open > 0.05 ? `, and ${ metres( open ) } at each end isn't covered by the boxes` : '' }.` );

	// The boxes by size, base boxes first, then longest: "4 × 2.4 × 6.1 m (8 × 20 ft)".
	const list = [];
	for ( const high of new Set( stack ) ) {

		for ( const long of new Set( lengths ) ) {

			const n = stack.filter( ft => ft === high ).length * lengths.filter( ft => ft === long ).length;
			list.push( `${ n } × ${ ( high * FT ).toFixed( 1 ) } × ${ ( long * FT ).toFixed( 1 ) } m (${ high } × ${ long } ft)` );

		}

	}

	const count = lengths.length * stack.length;
	const above = height - depth;
	const summary = `${ count } box${ count === 1 ? '' : 'es' }: ${ list.join( ' + ' ) }, ${ stack.length } high, ${ metres( inside ) } between panels; top ${ above < 0.05 ? 'level with' : `${ metres( above ) } above` } the rim`;
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

// Panel heights (ft) from the bottom up, at least as tall as the pit is deep: 2.4 m (8 ft)
// boxes and a 1.2 m (4 ft) stacker on top where that's enough. A pit no deeper than 1.2 m gets
// a 1.2 m box.
export function boxStack( depth ) {

	if ( depth <= STACKER * FT + 0.01 ) return [ STACKER ];
	const stack = [];
	let height = 0;
	while ( height < depth - 0.01 ) {

		const ft = depth - height <= STACKER * FT + 0.01 && stack.length > 0 ? STACKER : BASE_BOX;
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
// or from the floor.
function planHydraulic( { width, length, depth } ) {

	const [ across, along ] = width > length ? [ length, width ] : [ width, length ];
	const span = Math.max( 0, along - 1.2 );
	const count = span > 0 ? Math.ceil( span / SHORE_SPACING - 0.01 ) + 1 : 1;
	const spacing = count > 1 ? span / ( count - 1 ) : 0;
	const rows = cylinderRows( depth );
	const rail = depth - 0.3 + 0.05;
	const notes = [];
	if ( across > MAX_SHORE_SPAN ) notes.push( `Too wide for hydraulic shores (they reach about ${ MAX_SHORE_SPAN } m): use a trench box, slide rail or sheet piles.` );
	if ( depth > MAX_SHORE_DEPTH ) notes.push( 'Deeper than hydraulic shoring tables go (about 6 m, 20 ft): use slide rail or sheet piles.' );
	notes.push( 'Ends are open: slope them or shore them too. In loose or wet ground, add plywood sheeting behind the rails.' );
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
	const notes = [];
	if ( braced && across > MAX_STRUT ) notes.push( `Over ${ BRACED_DEPTH } m deep and too wide to strut across: rakers or tie-backs, designed by an engineer.` );
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
		// The outer flanges.
		ground: { back: SHEET.depth / 2 },
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
				parts.add( PAINT.earth, groundStrip( line.map( ( [ s, d ] ) => [ wall.at( s, d ), wall.at( s, - h ) ] ), 0.012 ) );

			} );
			parts.add( PAINT.sheet, sheetWall( points.map( p => [ p.x, p.z ] ), - depth - 0.2, 1 ) );

			// Waler: a W360 on its side against the inner flanges, web level.
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
// 0.5 m out of the ground, with 75 mm timber lagging boards behind their inner flanges down to
// the floor.
function planSoldierPiles( { width, length, depth } ) {

	const walls = wallsOf( width, length );
	const bays = walls.map( wall => Math.max( 1, Math.ceil( wall.length / SOLDIER_SPACING - 0.01 ) ) );
	const piles = bays.reduce( ( a, b ) => a + b, 0 );
	const perimeter = 2 * ( width + length );
	const toe = Math.max( 1.5, depth * 0.75 );
	const each = Math.ceil( ( 0.5 + depth + toe ) * 2 ) / 2;
	const lagging = perimeter * depth;
	const notes = [];
	if ( depth > BRACED_DEPTH ) notes.push( `Over ${ BRACED_DEPTH } m deep: soldier piles need walers with struts, rakers or tie-backs, designed by an engineer.` );
	return {
		summary: `${ piles } soldier piles (HP310, ${ maxOf( walls.map( ( w, i ) => w.length / bays[ i ] ) ) } m apart or less, ${ metres( each ) } long each), ${ Math.round( lagging ) } m² of timber lagging (${ ( lagging * 0.075 ).toFixed( 1 ) } m³)`,
		wall: lagging,
		weight: tonnes( piles * each * H_PILE.kgPerM, 'steel' ),
		notes,
		sides: 'all',
		// The lagging's back, behind the piles' inner flanges; their outer halves are in the soil.
		ground: { back: - 0.055 },
		build( parts ) {

			const pitch = 0.3 + 0.012;
			// No sliver of a board at the top.
			const boards = Math.max( 1, Math.ceil( ( depth - 0.05 ) / pitch ) );
			walls.forEach( ( wall, w ) => {

				const n = bays[ w ];
				const spacing = wall.length / n;
				// The yaw that turns a pile's depth (x) along the wall's inward normal.
				const yaw = Math.atan2( - wall.inward.z, wall.inward.x );
				for ( let k = 0; k < n; k ++ ) {

					const p = wall.at( k * spacing, 0 );
					hPile( parts, { x: p.x, z: p.z, y0: - depth - 0.1, y1: 0.5, yaw } );
					for ( let i = 0; i < boards; i ++ ) {

						const y = - depth + i * pitch;
						wallBox( parts, PAINT.timber, wall, ( k + 0.5 ) * spacing, 0.0925, spacing - 0.02, 0.075, Math.min( 0.3, - y ), y );

					}

				}

			} );

		},
	};

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
// pit's size or support changes, moved when the pit moves or its rim changes.
// rimOf( entry ): the height of the pit's rim, from its design in the terrain.
export function setUpShoring( { scene, models, terrain, kind, rimOf } ) {

	const root = new Group();
	root.name = 'shoring';
	scene.add( root );
	const shown = new Map(); // entry -> { key, group, plan }
	const ground = shoreTheGround( terrain );

	const update = entry => {

		if ( entry.kind !== kind ) return;
		const { params, state } = entry;
		const plan = planShoring( params );
		const key = JSON.stringify( [ params.support, params.width, params.length, params.depth ] );
		let item = shown.get( entry );
		if ( item?.key !== key ) {

			remove( entry );
			if ( ! plan.build ) return;
			item = { key, group: buildPit( plan, params ), plan };
			shown.set( entry, item );
			root.add( item.group );

		}

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

	// The ground's walls go straight up behind the shoring (shoring-ground.js): all four, or the
	// two long ones as far as the boxes or rails reach.
	const shapeGround = () => ground.set( [ ...shown ].map( ( [ entry, { group, plan } ] ) => {

		const { width, length } = entry.params;
		const { east, north, heading } = entry.state;
		const long = plan.sides === 'long';
		// Two walls: no further than the trench's ends, which stay as dug.
		const { back, reach: along } = plan.ground;
		const reach = long ? Math.min( along, Math.max( width, length ) / 2 ) : Infinity;
		return {
			east,
			north,
			heading,
			width,
			length,
			rim: group.position.y,
			back,
			alongLength: ! long || width <= length ? reach : null,
			alongWidth: ! long || width > length ? reach : null,
		};

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

	const api = { root, shown, planShoring };
	if ( window.twin ) window.twin.shoring = api;
	return api;

}

// The shoring for a pit, in its frame: x across its width, z along its length, y up from the rim.
function buildPit( plan, { width, length, depth } ) {

	const parts = new Parts();
	const turned = width > length;
	// Planners that only line the long walls build as if the pit ran along z.
	const canonical = plan.sides === 'long';
	const inner = new Group();
	if ( canonical && turned ) inner.rotation.y = Math.PI / 2;
	plan.build( parts, { width, length, depth } );
	if ( canonical ) rimStrip( parts, plan, Math.min( width, length ), Math.max( width, length ) );
	else rimStrip( parts, plan, width, length );
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
];

function wallText( area ) {

	return area > 0 ? `${ Math.round( area ).toLocaleString( 'en-CA' ) } m²` : '';

}

// --- helpers ------------------------------------------------------------------------------------

function metres( value, digits = 1 ) {

	return `${ value.toLocaleString( 'en-CA', { minimumFractionDigits: digits, maximumFractionDigits: digits } ) } m`;

}

function maxOf( values ) {

	return Math.max( ...values ).toFixed( 1 );

}

function tonnes( kg, what ) {

	const t = kg / 1000;
	return `${ t < 10 ? t.toFixed( 1 ) : Math.round( t ).toLocaleString( 'en-CA' ) } t ${ what }`;

}
