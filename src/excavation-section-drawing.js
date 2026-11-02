// The section through an excavation, worked out from its design (excavation-design.js) and the
// ground along the cut, and the figures the section view lists: everything it draws, in the cut's
// own frame, with no scene and no DOM. excavation-section.js draws it in the section card (SVG)
// and over the scene, and the tests check it against the design.
//
// The cut's frame: s along the cut from the middle of the pit, y up from the rim (the floor is at
// y = -depth). A cut across runs along u at v = at and is seen from the back (side 3) looking to
// the front: side 4 on the left, side 2 on the right. A cut along runs along v at u = at and is
// seen from the right (side 2) looking left: side 3 on the left, side 1 on the right. So s grows
// to the right either way, and what's beyond the cut is the side it's seen towards.
//
// The design surface is drawn sharp, as designed: a wall is a vertical line where the terrain,
// on its 0.5 m grid, eases it across two cells (excavation-design.js depthAt).

import {
	ABOVE,
	FRICTION_ANGLE,
	KICKER,
	SLOPE_REACH,
	SPOIL_OTHER,
	SPOIL_TRENCH,
	SYSTEMS,
	WALER_DEPTH,
	geometryAtStage,
	pitFrame,
	pitToEnu,
	ratio,
	sideLabel,
} from './excavation-design.js';

const DEG = Math.PI / 180;
// The ground is drawn this far past the top of the cut (and past the end of any tiebacks).
const GROUND_PAST = 5;
// Members this close to the cut are in it; further away they're seen beyond it, dashed.
const NEAR = 0.5;
// Members as drawn in section, metres: a strut's pipe, a raker, a king post, a tieback's bond.
const STRUT = 0.45;
const RAKER = 0.3;
const POST = 0.3;
const BOND = 0.24;
// Soldier piles (HP310): the inner flange 0.15 m in from the outline, the outer 0.155 m out, and
// 75 mm lagging behind the inner flanges [GEC4] 5.4.2 Table 12, up to the soil's face.
const PILE_OUT = 0.155;
const LAGGING_IN = 0.13;
// A pile wall's capping beam: 0.1 m wider than the piles each side, 0.9 m deep (tool default).
const CAP_OVER = 0.1;
const CAP_DEPTH = 0.9;
// A trench system's panels, 120 mm (shoring-models.js PANEL), inside the outline.
const PANEL = 0.12;
// A tandem dump truck's load, loose m³ (earthworks.js TRUCK_LOAD), and the swell (terrain.js SWELL).
export const TRUCK_LOAD = 10;
export const SWELL = 1.25;

// --- the cut ---------------------------------------------------------------------------------------

// Which sides a cut shows in profile (left and right), which it's seen towards (far) and from
// (near), and where along the other way it can be (between the near and far top edges).
export function cutSides( geom, along ) {

	const [ front, right, back, left ] = geom.sides;
	if ( along ) return { left: back, right: front, far: left, near: right, range: [ - left.top, right.top ] };
	return { left, right, far: front, near: back, range: [ - back.top, front.top ] };

}

// The point [ u, v ] of the pit at s along a cut placed at `at`.
export function cutPoint( along, at, s ) {

	return along ? [ at, s ] : [ s, at ];

}

// How far along the cut the drawing reaches: past the top edges by GROUND_PAST, and past the end
// of the tiebacks on the sides in profile.
export function sectionRange( design, along ) {

	const { geom, plan } = design;
	const { left, right } = cutSides( geom, along );
	const reach = side => Math.max( GROUND_PAST, ( plan.anchors[ side.n ]?.reach ?? 0 ) + 1.5 );
	return { from: - left.top - reach( left ), to: right.top + reach( right ) };

}

// --- the design surface along the cut --------------------------------------------------------------

// A side's profile, sharp, at e (its distance inside the top edge): the depth it allows, Infinity
// for no limit (a vertical side), or null where it isn't cut.
function profileValue( side, e ) {

	if ( side.profile === 'slope' ) return e < - SLOPE_REACH ? null : e / side.slope;
	if ( e < 0 ) return null;
	if ( side.profile === 'vertical' ) return Infinity;
	if ( side.profile === 'bench' ) return side.rise * benchCount( side, e );
	return side.bermTop + e / side.bermSlope;

}

// How many risers down a bench profile is at e: the top one at the edge, one more every bench.
function benchCount( side, e ) {

	return Math.min( side.steps, Math.floor( e / side.benchWidth + 1e-9 ) + 1 );

}

// Where a side's profile has a corner or a step, as distances inside its top edge.
function profileBreaks( side ) {

	if ( side.profile === 'slope' ) return [ - SLOPE_REACH ];
	if ( side.profile === 'bench' ) return Array.from( { length: side.steps }, ( _, k ) => k * side.benchWidth );
	return [ 0 ];

}

// A side's profile over a stretch of the cut where e = e0 + de s, as [ a, k ] for a + k s, or
// Infinity, or null, from the middle m of the stretch.
function profilePiece( side, e0, de, m ) {

	const value = profileValue( side, e0 + de * m );
	if ( value === null || value === Infinity ) return value;
	if ( side.profile === 'slope' ) return [ e0 / side.slope, de / side.slope ];
	if ( side.profile === 'berm' ) return [ side.bermTop + e0 / side.bermSlope, de / side.bermSlope ];
	return [ value, 0 ];

}

// The design's depth below the rim along a cut, exactly: [ { s0, s1, d0, d1 } ] pieces, linear in
// each, where it's cut (negative above the rim, where a slope climbs past its top edge onto
// higher ground). The two sides in profile vary along the cut; the other two give a limit there,
// as the cap (the depth dug so far) does.
export function depthLine( geom, { along = false, at = 0, cap = geom.depth, from, to } ) {

	const varying = [];
	let limit = cap;
	for ( const side of geom.sides ) {

		// A cut across meets the right and left sides (u sides); one along, the front and back.
		if ( ( side.axis === 1 ) !== along ) {

			varying.push( { side, e0: side.top, de: - side.sign } );
			continue;

		}

		const value = profileValue( side, side.top - side.sign * at );
		if ( value === null ) return [];
		limit = Math.min( limit, value );

	}

	const breaks = new Set( [ from, to ] );
	for ( const { side, e0, de } of varying ) {

		for ( const e of profileBreaks( side ) ) {

			const s = ( e - e0 ) / de;
			if ( s > from && s < to ) breaks.add( s );

		}

	}

	const xs = [ ...breaks ].sort( ( a, b ) => a - b );
	const pieces = [];
	for ( let i = 0; i < xs.length - 1; i ++ ) {

		const [ a, b ] = [ xs[ i ], xs[ i + 1 ] ];
		if ( b - a < 1e-9 ) continue;
		const lines = [ [ limit, 0 ] ];
		let cut = true;
		for ( const { side, e0, de } of varying ) {

			const piece = profilePiece( side, e0, de, ( a + b ) / 2 );
			if ( piece === null ) cut = false;
			else if ( piece !== Infinity ) lines.push( piece );

		}

		if ( ! cut ) continue;
		// The shallowest of the lines, which may change where two of them cross.
		const at = [ a, b ];
		for ( let j = 0; j < lines.length; j ++ ) {

			for ( let k = j + 1; k < lines.length; k ++ ) {

				const [ [ a1, k1 ], [ a2, k2 ] ] = [ lines[ j ], lines[ k ] ];
				if ( k1 === k2 ) continue;
				const s = ( a2 - a1 ) / ( k1 - k2 );
				if ( s > a + 1e-9 && s < b - 1e-9 ) at.push( s );

			}

		}

		at.sort( ( p, q ) => p - q );
		for ( let j = 0; j < at.length - 1; j ++ ) {

			const [ p, q ] = [ at[ j ], at[ j + 1 ] ];
			if ( q - p < 1e-9 ) continue;
			const m = ( p + q ) / 2;
			const [ a0, k0 ] = lines.reduce( ( best, line ) => line[ 0 ] + line[ 1 ] * m < best[ 0 ] + best[ 1 ] * m ? line : best );
			pieces.push( { s0: p, s1: q, d0: a0 + k0 * p, d1: a0 + k0 * q } );

		}

	}

	return mergePieces( pieces );

}

// Neighbouring pieces on one straight line, as one.
function mergePieces( pieces ) {

	const out = [];
	for ( const piece of pieces ) {

		const last = out[ out.length - 1 ];
		const slope = p => ( p.d1 - p.d0 ) / ( p.s1 - p.s0 );
		if ( last && Math.abs( last.s1 - piece.s0 ) < 1e-9 && Math.abs( last.d1 - piece.d0 ) < 1e-9 && Math.abs( slope( last ) - slope( piece ) ) < 1e-9 ) {

			last.s1 = piece.s1;
			last.d1 = piece.d1;

		} else out.push( { ...piece } );

	}

	return out;

}

// The ground along the cut, every `step` metres from `from` to `to`: [ [ s, y ] ], y up from the
// rim. groundAt( s ) gives it, or null where it doesn't know (level with the rim, then).
export function groundLine( groundAt, from, to, step ) {

	const n = Math.max( 1, Math.ceil( ( to - from ) / step - 1e-9 ) );
	return Array.from( { length: n + 1 }, ( _, i ) => {

		const s = i === n ? to : from + i * ( to - from ) / n;
		const y = groundAt( s );
		return [ s, Number.isFinite( y ) ? y : 0 ];

	} );

}

// The surface along the cut: the ground, or the design where it's lower. [ [ s, y ] ], with a
// point twice at the same s where it steps (a wall).
export function surfaceLine( pieces, ground ) {

	const events = new Set( ground.map( ( [ s ] ) => s ) );
	const lo = ground[ 0 ][ 0 ];
	const hi = ground[ ground.length - 1 ][ 0 ];
	for ( const { s0, s1 } of pieces ) for ( const s of [ s0, s1 ] ) if ( s > lo && s < hi ) events.add( s );
	const xs = [ ...events ].sort( ( a, b ) => a - b );
	const out = [];
	const push = ( s, y ) => {

		const last = out[ out.length - 1 ];
		if ( ! last || Math.abs( last[ 0 ] - s ) > 1e-9 || Math.abs( last[ 1 ] - y ) > 1e-9 ) out.push( [ s, y ] );

	};

	const groundY = lineReader( ground );
	let p = 0;
	for ( let i = 0; i < xs.length - 1; i ++ ) {

		const [ a, b ] = [ xs[ i ], xs[ i + 1 ] ];
		if ( b - a < 1e-12 ) continue;
		const m = ( a + b ) / 2;
		while ( p < pieces.length && pieces[ p ].s1 <= m ) p ++;
		const piece = pieces[ p ] && pieces[ p ].s0 <= m ? pieces[ p ] : null;
		const [ ga, gb ] = [ groundY( a ), groundY( b ) ];
		if ( ! piece ) {

			push( a, ga );
			push( b, gb );
			continue;

		}

		const depth = s => piece.d0 + ( piece.d1 - piece.d0 ) * ( s - piece.s0 ) / ( piece.s1 - piece.s0 );
		const [ ya, yb ] = [ - depth( a ), - depth( b ) ];
		push( a, Math.min( ga, ya ) );
		const [ ha, hb ] = [ ga - ya, gb - yb ];
		if ( ha * hb < 0 ) {

			const t = ha / ( ha - hb );
			push( a + t * ( b - a ), ga + t * ( gb - ga ) );

		}

		push( b, Math.min( gb, yb ) );

	}

	return out;

}

// y at s on a polyline sorted by s (no steps), read in order or not.
function lineReader( points ) {

	return s => {

		let lo = 0;
		let hi = points.length - 1;
		if ( s <= points[ 0 ][ 0 ] ) return points[ 0 ][ 1 ];
		if ( s >= points[ hi ][ 0 ] ) return points[ hi ][ 1 ];
		while ( hi - lo > 1 ) {

			const mid = ( lo + hi ) >> 1;
			if ( points[ mid ][ 0 ] <= s ) lo = mid;
			else hi = mid;

		}

		const [ [ s0, y0 ], [ s1, y1 ] ] = [ points[ lo ], points[ hi ] ];
		return s1 - s0 < 1e-12 ? y1 : y0 + ( y1 - y0 ) * ( s - s0 ) / ( s1 - s0 );

	};

}

// --- the drawing -----------------------------------------------------------------------------------

// Everything the section view draws for a design (planExcavation) cut across (along: false) or
// along, at `at`: { along, at, from, to, top, bottom, stage, fills, lines, dims, labels, sides }.
//   fills  [ { kind, points, beyond } ]: soil, cut (what's dug), todo (still to dig at this stage),
//          steel, concrete, timber, panel, member, kicker; beyond: seen past the cut (dashed)
//   lines  [ { kind, points, dashed } ]: ground (as it was), surface, final, groundwater, wedge,
//          free (a tieback's free length), level (a waler seen beyond)
//   dims   [ { id, kind: 'h' | 'v', from, to, at, base, text, value } ]: a dimension from `from` to
//          `to` along s ('h', its line at y = at) or y ('v', at s = at); base: where its extension
//          lines start (the measured points' other coordinate)
//   labels [ { id, s, y, text, align, kind, value } ]
// groundAt( s ): the ground along the cut, metres up from the rim (null if unknown); heading: the
// pit's, for the sides' compass points; unit: about one line of text, in metres at the scale it's
// drawn (dimensions above the ground stack this far apart).
export function sectionDrawing( design, { along = false, at = 0, groundAt = () => 0, heading = 0, unit = 1.2 } = {} ) {

	const { geom, plan, stage, stages, params, quantities } = design;
	const D = geom.depth;
	const finished = stage.index === stages.length - 1;
	const { left, right, far } = cutSides( geom, along );
	const { from, to } = sectionRange( design, along );
	const ground = groundLine( groundAt, from, to, Math.max( 0.25, ( to - from ) / 600 ) );
	const finalPieces = depthLine( geom, { along, at, from, to } );
	const stagePieces = finished ? finalPieces : depthLine( geometryAtStage( geom, plan, stage ), { along, at, cap: stage.dig, from, to } );
	const surface = surfaceLine( stagePieces, ground );
	const final = finished ? surface : surfaceLine( finalPieces, ground );
	const groundTop = Math.max( 0, ...ground.map( ( [ , y ] ) => y ) );

	const fills = [];
	const lines = [];
	const dims = [];
	const labels = [];
	const drawing = { along, at, from, to, top: 0, bottom: 0, stage: finished ? null : { index: stage.index, count: stages.length, label: stage.label, dig: stage.dig }, fills, lines, dims, labels, sides: { left: left.n, right: right.n, far: far.n } };
	const rect = ( s0, s1, y0, y1 ) => [ [ s0, y0 ], [ s1, y0 ], [ s1, y1 ], [ s0, y1 ] ];
	const band = ( [ s0, y0 ], [ s1, y1 ], width ) => {

		const len = Math.hypot( s1 - s0, y1 - y0 ) || 1;
		const [ ns, ny ] = [ - ( y1 - y0 ) / len * width / 2, ( s1 - s0 ) / len * width / 2 ];
		return [ [ s0 + ns, y0 + ny ], [ s1 + ns, y1 + ny ], [ s1 - ns, y1 - ny ], [ s0 - ns, y0 - ny ] ];

	};

	// How deep the drawing goes: below the toes, king posts and tiebacks.
	let deepest = D + 1;
	if ( plan.walls.length ) deepest = Math.max( deepest, D + plan.toe );
	for ( const m of plan.members ) for ( const p of [ m.a, m.b ] ) if ( p ) deepest = Math.max( deepest, - p[ 1 ] );
	const bottom = - deepest - 1.5;

	// What's dug, the ground still standing, and at a stage what's still to dig.
	fills.push( { kind: 'cut', points: [ ...ground, ...[ ...surface ].reverse() ] } );
	const beyond = [];
	const inPlane = [];

	// --- members, in the cut or seen beyond it -----------------------------------------------

	const toCut = ( [ x, y, z ] ) => along ? [ - z, x, y ] : [ x, - z, y ];
	const beyondSign = along ? - 1 : 1;
	const where = ( w, near = NEAR ) => Math.abs( w - at ) <= near ? 'in' : beyondSign * ( w - at ) > 0 ? 'beyond' : 'near';
	const profileSide = n => n === left.n || n === right.n;
	const installed = m => m.level === null || m.level === undefined || m.level < stage.installed;
	const drawn = new Set();
	const once = key => drawn.has( key ) ? false : ( drawn.add( key ), true );
	const place = ( state, fill ) => {

		if ( state === 'in' ) inPlane.push( fill );
		else if ( state === 'beyond' ) beyond.push( { ...fill, beyond: true } );

	};

	for ( const m of plan.members ) {

		if ( ! installed( m ) || ! stage.walls ) continue;
		const [ sa, wa, ya ] = toCut( m.a );
		const [ sb, wb, yb ] = m.b ? toCut( m.b ) : [ sa, wa, ya ];
		const parallel = Math.abs( wa - wb ) < 1e-6;
		const across = Math.abs( sa - sb ) < 1e-6 && Math.abs( ya - yb ) < 1e-6;
		const spans = Math.min( wa, wb ) - NEAR <= at && at <= Math.max( wa, wb ) + NEAR;
		if ( m.type === 'waler' ) {

			if ( profileSide( m.side ) && spans ) inPlane.push( { kind: 'member', points: rect( sa - WALER_DEPTH / 2, sa + WALER_DEPTH / 2, ya - WALER_DEPTH / 2, ya + WALER_DEPTH / 2 ), member: 'waler', level: m.level, cut: true } );
			else if ( m.side === far.n && once( `far-waler-${ m.level }` ) ) lines.push( { kind: 'level', points: [ [ sa, ya ], [ sb, yb ] ], dashed: true } );

		} else if ( m.type === 'strut' ) {

			if ( parallel ) {

				const state = where( wa );
				if ( once( `strut-${ m.level }-${ state }` ) ) place( state, { kind: 'member', points: band( [ sa, ya ], [ sb, yb ], STRUT ), member: 'strut', level: m.level } );

			} else if ( across && spans ) inPlane.push( { kind: 'member', points: rect( sa - STRUT / 2, sa + STRUT / 2, ya - STRUT / 2, ya + STRUT / 2 ), member: 'strut', level: m.level, cut: true } );

		} else if ( m.type === 'kingpost' ) {

			const state = where( wa );
			if ( once( `post-${ sa.toFixed( 2 ) }-${ state }` ) ) place( state, { kind: 'member', points: rect( sa - POST / 2, sa + POST / 2, ya, yb ), member: 'kingpost' } );

		} else if ( m.type === 'raker' ) {

			if ( parallel && profileSide( m.side ) ) {

				const state = where( wa );
				if ( once( `raker-${ m.side }-${ m.level }-${ state }` ) ) place( state, { kind: 'member', points: band( [ sa, ya ], [ sb, yb ], RAKER ), member: 'raker', level: m.level, side: m.side } );

			} else if ( ! parallel && Math.min( wa, wb ) <= at && at <= Math.max( wa, wb ) ) {

				const t = ( at - wa ) / ( wb - wa );
				const [ s, y ] = [ sa + t * ( sb - sa ), ya + t * ( yb - ya ) ];
				inPlane.push( { kind: 'member', points: rect( s - RAKER / 2, s + RAKER / 2, y - RAKER / 2, y + RAKER / 2 ), member: 'raker', level: m.level, cut: true } );

			}

		} else if ( m.type === 'kicker' ) {

			// A kicker is as long as KICKER.along along its wall and KICKER.across out from it.
			const [ halfS, halfW ] = profileSide( m.side ) ? [ KICKER.across / 2, KICKER.along / 2 ] : [ KICKER.along / 2, KICKER.across / 2 ];
			const state = where( wa, halfW );
			if ( once( `kicker-${ m.side }-${ m.level }-${ sa.toFixed( 2 ) }-${ state }` ) ) place( state, { kind: 'kicker', points: rect( sa - halfS, sa + halfS, ya, ya + KICKER.height ), member: 'kicker', side: m.side } );

		} else if ( m.type === 'tieback' && profileSide( m.side ) && parallel ) {

			const state = where( wa );
			if ( state === 'near' || ! once( `tieback-${ m.side }-${ m.level }-${ state }` ) ) continue;
			const [ sf, , yf ] = toCut( m.bondStart );
			lines.push( { kind: 'free', points: [ [ sa, ya ], [ sf, yf ] ], dashed: state !== 'in' } );
			place( state, { kind: 'member', points: band( [ sf, yf ], [ sb, yb ], BOND ), member: 'bond', level: m.level, side: m.side } );

		}

	}

	// --- walls ------------------------------------------------------------------------------

	const walls = [];
	const stuck = [];
	const wallOf = ( side, dir ) => {

		const outline = dir * side.top;
		if ( side.method === 'wall' && stage.walls ) {

			const system = SYSTEMS[ side.system ];
			const toe = - D - plan.toe;
			const top = system.stickUp;
			stuck.push( top );
			const inner = outline - dir * system.inner;
			if ( side.system === 'soldier-piles' ) {

				// Piles every 2.4 m, seen past the lagging the cut goes through.
				beyond.push( { kind: 'steel', points: rect( outline - dir * system.inner, outline + dir * PILE_OUT, toe, top ), beyond: true } );
				walls.push( { kind: 'timber', points: rect( outline - dir * LAGGING_IN, outline + dir * system.back, - stage.dig, 0 ) } );

			} else if ( side.system === 'sheet-piles' ) {

				walls.push( { kind: 'steel', points: rect( inner, outline + dir * system.back, toe, top ) } );

			} else {

				const back = outline + dir * system.back;
				walls.push( { kind: 'concrete', points: rect( inner, back, toe, top - CAP_DEPTH ) } );
				walls.push( { kind: 'concrete', points: rect( inner - dir * CAP_OVER, back + dir * CAP_OVER, top - CAP_DEPTH, top ), cap: true } );

			}

			return { side, dir, outline, inner, face: inner - dir * WALER_DEPTH, toe, top, system };

		}

		if ( side.method === 'trench' && lined( geom, side ) && stage.walls ) {

			walls.push( { kind: 'panel', points: rect( outline - dir * PANEL, outline, - stage.dig, ABOVE ) } );
			stuck.push( ABOVE );

		}

		return null;

	};

	const wallLeft = wallOf( left, - 1 );
	const wallRight = wallOf( right, 1 );

	// The far side's wall, seen beyond the pit, with its levels.
	if ( far.method === 'wall' && stage.walls ) {

		const [ a, b ] = along ? [ geom.sides[ 2 ], geom.sides[ 0 ] ] : [ geom.sides[ 3 ], geom.sides[ 1 ] ];
		const kind = far.system === 'sheet-piles' || far.system === 'soldier-piles' ? 'steel' : 'concrete';
		beyond.push( { kind, points: rect( - a.top, b.top, - stage.dig, SYSTEMS[ far.system ].stickUp ), beyond: true, far: true } );

	} else if ( far.method === 'trench' && lined( geom, far ) && stage.walls ) {

		const [ a, b ] = along ? [ geom.sides[ 2 ], geom.sides[ 0 ] ] : [ geom.sides[ 3 ], geom.sides[ 1 ] ];
		beyond.push( { kind: 'panel', points: rect( - a.top, b.top, - stage.dig, ABOVE ), beyond: true, far: true } );

	}

	fills.push( ...beyond );
	fills.push( { kind: 'soil', points: [ ...surface, [ to, bottom ], [ from, bottom ] ] } );
	if ( ! finished ) fills.push( { kind: 'todo', points: [ ...surface, ...[ ...final ].reverse() ] } );
	fills.push( ...walls, ...inPlane );

	lines.unshift( { kind: 'ground', points: ground, dashed: true } );
	lines.push( { kind: 'surface', points: surface } );
	if ( ! finished ) lines.push( { kind: 'final', points: final, dashed: true } );

	// --- dimensions and labels ---------------------------------------------------------------

	const metres = value => `${ value.toFixed( value < 10 ? 2 : 1 ) } m`;
	const dim = ( id, kind, a, b, place, base, text, value ) => dims.push( { id, kind, from: a, to: b, at: place, base, text, value } );
	const label = ( id, s, y, text, align = 'middle', kind = 'note', value ) => text !== '' && labels.push( { id, s, y, text, align, kind, value } );
	const tier = n => groundTop + Math.max( 0, ...stuck ) + n * unit;

	// The floor along the cut, where the finished pit is at full depth.
	const floor = finalPieces.filter( p => Math.abs( p.d0 - D ) < 1e-6 && Math.abs( p.d1 - D ) < 1e-6 );
	const floorFrom = floor.length ? floor[ 0 ].s0 : null;
	const floorTo = floor.length ? floor[ floor.length - 1 ].s1 : null;
	const middle = floorFrom !== null ? ( floorFrom + floorTo ) / 2 : ( right.top - left.top ) / 2;

	// The depth inside the right wall or toe, clear of struts and king posts in the middle.
	const deep = wallRight ? wallRight.face - 2.2 * unit : floorTo !== null ? floorTo - 1.2 * unit : middle;
	dim( 'depth', 'v', 0, - D, deep, deep, `${ metres( D ) } deep`, D );
	if ( ! finished && stage.dig < D - 1e-6 ) dim( 'dug', 'v', 0, - stage.dig, deep - 1.6 * unit, deep, `dug ${ metres( stage.dig ) }`, stage.dig );
	dim( 'top', 'h', - left.top, right.top, tier( 2 ), [ groundAtS( ground, - left.top ), groundAtS( ground, right.top ) ], `top ${ metres( left.top + right.top ) }`, left.top + right.top );
	if ( floorFrom !== null && floorTo - floorFrom > 0.5 ) dim( 'floor', 'h', floorFrom, floorTo, - D + 0.7 * unit, [ - D, - D ], `floor ${ metres( floorTo - floorFrom ) }`, floorTo - floorFrom );

	const setback = quantities.trench ? SPOIL_TRENCH : SPOIL_OTHER;
	for ( const [ side, dir ] of [ [ left, - 1 ], [ right, 1 ] ] ) {

		const { n } = side;
		const edge = dir * side.top;
		const end = dir > 0 ? 'end' : 'start';
		const what = sideMethodText( side );
		const piles = side.method === 'wall' ? plan.pileLength[ side.system ] : undefined;
		label( `side-${ n }`, dir > 0 ? to : from, tier( 4 ), `${ sideLabel( heading, n ) } · ${ what }${ piles ? `, ${ piles.toFixed( 1 ) } m ${ side.system === 'sheet-piles' ? 'sheets' : 'piles' }` : '' }`, end, 'side', piles );
		dim( `spoil-${ n }`, 'h', edge, edge + dir * setback, tier( 1 ), [ groundAtS( ground, edge ), groundAtS( ground, edge + dir * setback ) ], `spoil ≥ ${ setback.toFixed( 1 ) }`, setback );
		// WorkSafeBC's "adjacent": the depth out from a vertical line through the toe [P20] 20.1.
		// Shown where it reaches past the top edge: inside the cut nothing can stand.
		const toeLine = dir * Math.max( 0, side.toe );
		if ( Math.max( 0, side.toe ) + D > side.top + 0.05 ) dim( `adjacent-${ n }`, 'h', toeLine, toeLine + dir * D, tier( 3 ), [ 0, 0 ], `adjacent ${ metres( D ) }`, D );

		if ( side.profile === 'slope' && side.method !== 'wall' ) {

			const [ s0, s1 ] = [ dir * side.toe, edge ];
			label( `slope-${ n }`, ( s0 + s1 ) / 2 - dir * 0.6 * unit, - D / 2, ratio( side.slope ), dir > 0 ? 'end' : 'start', 'slope', side.slope );

		} else if ( side.profile === 'bench' ) {

			dim( `riser-${ n }`, 'v', 0, - side.rise, edge + dir * 1.4 * unit, edge, metres( side.rise ), side.rise );
			dim( `bench-${ n }`, 'h', edge, edge - dir * side.benchWidth, - side.rise + 0.6 * unit, [ - side.rise, - side.rise ], metres( side.benchWidth ), side.benchWidth );
			label( `steps-${ n }`, edge - dir * ( side.steps - 1 ) * side.benchWidth / 2, - D - 0.9 * unit, `${ side.steps } steps of ${ metres( side.rise ) } × ${ metres( side.benchWidth ) }`, 'middle', 'note', side.steps );

		}

	}

	// Walls: their levels (once, on the left wall if both are walls), the toe and the pile length.
	const shown = [ wallLeft, wallRight ].filter( Boolean );
	shown.forEach( ( wall, i ) => {

		const { side, dir, inner, face, toe } = wall;
		const { n } = side;
		const chain = face - dir * 2.2 * unit;
		if ( i === 0 ) dim( 'toe', 'v', - D, toe, chain, inner, `toe ${ metres( plan.toe ) }`, plan.toe );
		plan.levels.forEach( ( z, k ) => label( `level-${ n }-${ k + 1 }`, face - dir * 0.15, - z, `L${ k + 1 }`, dir > 0 ? 'end' : 'start', 'level', z ) );
		if ( i === 0 && plan.levels.length ) {

			const stops = [ 0, ...plan.levels, D ];
			for ( let k = 0; k < stops.length - 1; k ++ ) {

				const id = k === 0 ? 'level-1' : k === stops.length - 2 ? 'level-floor' : `level-${ k + 1 }`;
				dim( id, 'v', - stops[ k ], - stops[ k + 1 ], chain, inner, ( stops[ k + 1 ] - stops[ k ] ).toFixed( 2 ), stops[ k + 1 ] - stops[ k ] );

			}

		}

		const anchors = plan.anchors[ n ];
		if ( anchors ) {

			const edge = dir * side.top;
			dim( `reach-${ n }`, 'h', edge, edge + dir * anchors.reach, tier( 2 ), [ 0, 0 ], `no-dig ${ metres( anchors.reach ) }`, anchors.reach );
			anchors.rows.forEach( ( row, k ) => {

				const theta = row.angle * DEG;
				const head = [ face, - row.z ];
				const tendon = l => [ head[ 0 ] + dir * l * Math.cos( theta ), head[ 1 ] - l * Math.sin( theta ) ];
				const [ fs, fy ] = tendon( row.free * 0.3 );
				const [ bs, by ] = tendon( row.free + row.bond / 2 );
				// The top row in full, the others' free lengths (the bond is the same).
				label( `free-${ n }-${ k + 1 }`, fs, fy + 0.55 * unit, k === 0 ? `free ${ metres( row.free ) }` : row.free.toFixed( 2 ), dir > 0 ? 'start' : 'end', 'anchor', row.free );
				label( `bond-${ n }-${ k + 1 }`, bs, by + 0.55 * unit, k === 0 ? `bond ${ metres( row.bond ) }` : '', 'middle', 'anchor', row.bond );
				label( `angle-${ n }-${ k + 1 }`, head[ 0 ] + dir * 0.9 * unit, head[ 1 ] - 0.75 * unit, k === 0 ? `${ row.angle }°` : '', dir > 0 ? 'start' : 'end', 'anchor', row.angle );
				if ( k === 0 ) dim( `cover-${ n }`, 'v', groundAtS( ground, bs ), - row.bondCentre, bs, bs, `${ row.bondCentre.toFixed( 2 ) } cover`, row.bondCentre );

			} );
			// The active wedge rises from the foot of the wall at 45 + phi/2 [GEC4] 5.3.2.
			const rise = Math.tan( ( 45 + FRICTION_ANGLE / 2 ) * DEG );
			lines.push( { kind: 'wedge', points: [ [ inner, - D ], [ inner + dir * D / rise, 0 ] ], dashed: true } );

		}

		const rakers = plan.rakers[ n ];
		if ( rakers ) {

			dim( `rakers-${ n }`, 'h', wall.outline, wall.outline - dir * rakers.reach, - D + 1.9 * unit, [ - D, - D ], `rakers take ${ metres( rakers.reach ) }`, rakers.reach );
			label( `raker-${ n }`, face - dir * rakers.rows[ 0 ].reach / 2, - ( D + rakers.rows[ 0 ].z ) / 2 + 0.5 * unit, `rakers ${ rakers.rows[ 0 ].angle }°`, dir > 0 ? 'end' : 'start', 'note', rakers.rows[ 0 ].angle );

		}

	} );

	// Groundwater, as assumed (the groundwater param).
	if ( params.groundwater < - bottom ) {

		lines.push( { kind: 'groundwater', points: [ [ from, - params.groundwater ], [ to, - params.groundwater ] ], dashed: true } );
		label( 'groundwater', from + 0.3 * unit, - params.groundwater + 0.45 * unit, `▽ ${ metres( params.groundwater ) }`, 'start', 'water', params.groundwater );

	}

	if ( drawing.stage ) label( 'stage', from + 0.3 * unit, tier( 5 ), `Stage ${ stage.index + 1 } of ${ stages.length }: ${ stage.label }`, 'start', 'stage' );
	drawing.top = tier( drawing.stage ? 5.6 : 4.6 );
	drawing.bottom = bottom;
	return drawing;

}

// Whether a trench system's panels line this side: slide rail lines all four, the others the two
// long walls (the trench runs along the longer side).
function lined( geom, side ) {

	if ( geom.system === 'slide-rail' ) return true;
	const along = geom.hw > geom.hl ? 1 : 0;
	return ( side.axis === 1 ) !== ( along === 1 );

}

function groundAtS( ground, s ) {

	return lineReader( ground )( s );

}

// How a side is cut, in a few words: "sloped 1.5 : 1", "stepped", "sheet piles"...
export function sideMethodText( side ) {

	if ( side.method === 'wall' || side.method === 'trench' ) return SYSTEMS[ side.system ].label.toLowerCase();
	if ( side.method === 'bench' ) return side.steps > 1 ? 'stepped' : 'cut vertical';
	return side.profile === 'slope' ? `sloped ${ ratio( side.slope ) }` : 'cut vertical, unsupported';

}

// --- quantities --------------------------------------------------------------------------------

// A volume as the P panel shows it: whole cubic metres once there are a hundred.
export function volumeText( value ) {

	if ( value >= 100 ) return Math.round( value ).toLocaleString( 'en-CA' );
	return value >= 10 ? value.toFixed( 0 ) : value.toFixed( 1 );

}

function truckLoads( bank ) {

	return Math.max( 0, Math.ceil( bank * SWELL / TRUCK_LOAD - 0.01 ) );

}

// The design's cut from flat ground at the rim, loose, and in truck loads.
export function designCutText( design ) {

	const v = design.quantities.volume;
	return `${ volumeText( v ) } m³ · ${ volumeText( v * SWELL ) } m³ loose · about ${ truckLoads( v ) } loads`;

}

// The top of the cut's area and size.
export function footprintText( design ) {

	const { top, area } = design.quantities;
	return `${ volumeText( area ) } m² (${ top.width.toFixed( 1 ) } × ${ top.length.toFixed( 1 ) } m)`;

}

const PLURAL = { sheet: 'sheets', pile: 'piles' };
function count( n, one, many = `${ one }s` ) {

	return `${ n.toLocaleString( 'en-CA' ) } ${ n === 1 ? one : many }`;

}

// The quantities, as rows for the section card: [ [ what, how much ] ].
export function quantityRows( design ) {

	const { quantities: q, plan, geom } = design;
	const rows = [
		[ 'Cut (bank, flat ground)', `${ volumeText( q.volume ) } m³` ],
		[ `Loose (× ${ SWELL })`, `${ volumeText( q.volume * SWELL ) } m³` ],
		[ 'Truck loads', `about ${ truckLoads( q.volume ) } (tandem, ${ TRUCK_LOAD } m³)` ],
		[ 'Top of the cut', `${ q.top.width.toFixed( 1 ) } × ${ q.top.length.toFixed( 1 ) } m, ${ volumeText( q.area ) } m²` ],
		[ 'Floor', q.floor ? `${ q.floor.width.toFixed( 1 ) } × ${ q.floor.length.toFixed( 1 ) } m` : `none: the sides meet ${ q.meets.toFixed( 1 ) } m down` ],
		[ 'Spoil kept back', `${ ( q.trench ? SPOIL_TRENCH : SPOIL_OTHER ).toFixed( 1 ) } m from the top edge` ],
	];
	if ( q.walls.length ) {

		rows.push( [ 'Wall area', `${ volumeText( q.wallArea ) } m²` ] );
		for ( const [ system, n ] of Object.entries( q.piles ) ) {

			const { label } = SYSTEMS[ system ];
			const sides = q.walls.filter( w => w.system === system ).map( w => w.side ).join( ', ' );
			const unit = system === 'sheet-piles' ? 'sheet' : 'pile';
			rows.push( [ label, `${ count( n, unit, PLURAL[ unit ] ) }, ${ ( plan.pileLength[ system ] ?? 0 ).toFixed( 1 ) } m long (side${ sides.length > 1 ? 's' : '' } ${ sides })` ] );

		}

		const lagging = q.walls.reduce( ( sum, w ) => sum + ( w.lagging ?? 0 ), 0 );
		if ( lagging > 0 ) rows.push( [ 'Lagging', `${ volumeText( lagging ) } m²` ] );
		rows.push( [ 'Embedment', `${ plan.toe.toFixed( 2 ) } m below the floor` ] );
		if ( plan.levels.length ) rows.push( [ 'Support levels', plan.levels.map( z => `${ z.toFixed( 2 ) }` ).join( ', ' ) + ' m down' ] );
		if ( q.walers > 0 ) rows.push( [ 'Walers', `${ volumeText( q.walers ) } m` ] );
		if ( q.struts.count ) rows.push( [ 'Struts', `${ q.struts.count }, ${ volumeText( q.struts.metres ) } m in all` ] );
		if ( q.corners ) rows.push( [ 'Corner braces', String( q.corners ) ] );
		if ( q.kingPosts ) rows.push( [ 'King posts', String( q.kingPosts ) ] );
		if ( q.rakers.count ) rows.push( [ 'Rakers', `${ q.rakers.count }, ${ volumeText( q.rakers.metres ) } m in all, on ${ q.kickers } kicker blocks` ] );
		if ( q.tiebacks.count ) rows.push( [ 'Tiebacks', `${ q.tiebacks.count }, ${ volumeText( q.tiebacks.metres ) } m drilled` ] );
		for ( const zone of q.zones.anchors ) rows.push( [ `No-dig, side ${ zone.side }`, `${ zone.reach.toFixed( 1 ) } m behind the top edge` ] );

	} else if ( geom.trench ) {

		rows.push( [ 'Shoring', `${ SYSTEMS[ geom.system ].label }: see the shoring readouts` ] );

	}

	return rows;

}

// The walls, piles and members in a line or two, for the P panel ('' with no walls: the shoring's
// own readouts cover trench systems).
export function quantitiesText( design ) {

	const { quantities: q, plan } = design;
	const parts = [];
	if ( q.walls.length ) {

		const piles = Object.entries( q.piles ).map( ( [ system, n ] ) => `${ SYSTEMS[ system ].label.toLowerCase() } ${ count( n, system === 'sheet-piles' ? 'sheet' : 'pile' ) } × ${ ( plan.pileLength[ system ] ?? 0 ).toFixed( 1 ) } m` );
		parts.push( `Walls ${ volumeText( q.wallArea ) } m²: ${ piles.join( ', ' ) }.` );
		const members = [];
		if ( q.walers > 0 ) members.push( `walers ${ volumeText( q.walers ) } m` );
		if ( q.struts.count ) members.push( `${ count( q.struts.count, 'strut' ) } (${ volumeText( q.struts.metres ) } m)` );
		if ( q.corners ) members.push( count( q.corners, 'corner brace' ) );
		if ( q.kingPosts ) members.push( count( q.kingPosts, 'king post' ) );
		if ( q.rakers.count ) members.push( `${ count( q.rakers.count, 'raker' ) } on ${ count( q.kickers, 'kicker block' ) }` );
		if ( q.tiebacks.count ) members.push( `${ count( q.tiebacks.count, 'tieback' ) } (${ volumeText( q.tiebacks.metres ) } m)` );
		if ( members.length ) parts.push( `${ capitalise( members.join( ', ' ) ) }.` );
		if ( q.zones.anchors.length ) parts.push( `No digging or foundations ${ [ ...new Set( q.zones.anchors.map( z => z.reach.toFixed( 1 ) ) ) ].join( ' / ' ) } m behind side${ q.zones.anchors.length > 1 ? 's' : '' } ${ q.zones.anchors.map( z => z.side ).join( ', ' ) } (tiebacks).` );

	}

	return parts.join( ' ' );

}

// The comparison as rows for the section card: [ { label, volume, change, top, area, current } ].
export function comparisonRows( list ) {

	const [ current ] = list;
	return list.map( o => ( {
		label: o.current ? 'as planned' : o.label,
		volume: o.volume,
		change: o.current ? null : o.volume - current.volume,
		top: `${ o.top.width.toFixed( 1 ) } × ${ o.top.length.toFixed( 1 ) } m`,
		area: o.area,
		current: o.current,
	} ) );

}

// --- what's placed in the footprint --------------------------------------------------------------

// The design's zones at the surface as rectangles on the map (rectFrame's { east, north, sin,
// cos, hw, hl }), for a pit standing at state ({ east, north, heading }): [ { zone, side, rect } ].
export function zoneRects( design, state ) {

	const frame = pitFrame( state );
	const { zones } = design.quantities;
	const rectOf = polygon => {

		const us = polygon.map( p => p[ 0 ] );
		const vs = polygon.map( p => p[ 1 ] );
		const [ u0, u1, v0, v1 ] = [ Math.min( ...us ), Math.max( ...us ), Math.min( ...vs ), Math.max( ...vs ) ];
		const { east, north } = pitToEnu( frame, ( u0 + u1 ) / 2, ( v0 + v1 ) / 2 );
		return { east, north, sin: frame.sin, cos: frame.cos, hw: ( u1 - u0 ) / 2, hl: ( v1 - v0 ) / 2 };

	};

	return [
		{ zone: 'cut', rect: rectOf( zones.cut ) },
		...zones.anchors.map( a => ( { zone: 'anchors', side: a.side, rect: rectOf( a.polygon ) } ) ),
		{ zone: 'spoil', rect: rectOf( zones.spoil ) },
		{ zone: 'adjacent', rect: rectOf( zones.adjacent ) },
	];

}

// What's placed where the pit reaches: items [ { name, kind, rect } ] (rect as above) against the
// zones, each item once, at the first of: in the cut, over the tiebacks, a stockpile inside the
// spoil set-back, within the adjacent band. overlaps( a, b ): terrain.js rectsOverlap.
// [ { zone, side, name, level } ].
export function findConflicts( design, state, items, overlaps ) {

	const zones = zoneRects( design, state );
	const found = [];
	for ( const item of items ) {

		const hits = zones.filter( z => ( z.zone !== 'spoil' || item.kind === 'stockpile' ) && overlaps( z.rect, item.rect ) );
		const order = [ 'cut', 'anchors', 'spoil', 'adjacent' ];
		hits.sort( ( a, b ) => order.indexOf( a.zone ) - order.indexOf( b.zone ) );
		const hit = hits[ 0 ];
		if ( ! hit ) continue;
		found.push( { zone: hit.zone, side: hit.side ?? null, name: item.name, level: hit.zone === 'adjacent' ? 'note' : 'warn' } );

	}

	return found;

}

// The conflicts in a few sentences, grouped by zone, for the P panel and the card.
export function conflictsText( conflicts, design ) {

	const names = list => {

		const unique = [ ...new Set( list.map( c => c.name ) ) ];
		if ( unique.length <= 1 ) return unique.join( '' );
		return `${ unique.slice( 0, - 1 ).join( ', ' ) } and ${ unique[ unique.length - 1 ] }`;

	};

	const of = zone => conflicts.filter( c => c.zone === zone );
	const out = [];
	if ( of( 'cut' ).length ) out.push( `The cut reaches ${ names( of( 'cut' ) ) }.` );
	const anchored = of( 'anchors' );
	for ( const side of [ ...new Set( anchored.map( c => c.side ) ) ] ) out.push( `Tiebacks on side ${ side } run under ${ names( anchored.filter( c => c.side === side ) ) }: consent, or steeper or shorter anchors (FHWA GEC 4 5.3.6).` );
	const spoil = of( 'spoil' );
	if ( spoil.length ) out.push( `${ names( spoil ) } ${ new Set( spoil.map( c => c.name ) ).size > 1 ? 'are' : 'is' } inside the spoil set-back (${ ( design.quantities.trench ? SPOIL_TRENCH : SPOIL_OTHER ).toFixed( 1 ) } m, WorkSafeBC 20.90).` );
	const adjacent = of( 'adjacent' );
	if ( adjacent.length ) out.push( `Within ${ design.geom.depth.toFixed( 1 ) } m of the toe (adjacent): ${ names( adjacent ) }. A structure there means a QRP's written instructions (WorkSafeBC 20.78(1)(b)).` );
	return out.join( ' ' );

}

function capitalise( text ) {

	return text.charAt( 0 ).toUpperCase() + text.slice( 1 );

}
