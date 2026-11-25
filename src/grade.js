// Grading a flatten area (flatten.js): the shape its finished ground takes. Shared by flatten.js
// (the shape Google's mesh is pressed onto, the surface and the fence), terrain.js (the ground the
// earthworks are drawn and walked on, with batters round the edge) and models.js (the plane fitted
// through the ground under it), so all of them agree. Plain numbers only: no three.js and no CSS, so
// Node tests and the Worker can import it too.
//
// Heights are offsets in metres from the area's height (entry.state.up), at (x, z) in the area's own
// frame: x across it (its width; +x is its right), z along it (its length), its front (the side it
// faces) towards -z, as fences and gates are laid out. `slope` is the plane fitted through the ground
// under the area as Google made it, { gx, gz }, metres up per metre along x and z, about the area's
// middle, which is where its height (state.up) is: snapping puts it there (models.js, 'plane').
//
// The grades:
//   level     dead flat, as areas always were (and those saved before grading still are)
//   follow    the fitted plane: bumps, debris and what stood there smoothed away, the slope kept;
//             `maxGrade` (%) limits how steep it may be (0 for no limit)
//   slope     one plane falling `fall` % `toward` a side, pivoting about the middle
//   ridge     a crown: a ridge down the middle (along the length or the width) falling `fall` % to
//             both sides, set so as much is above the middle height as below
//   valley    the same upside down: a swale down the middle
//   terraces  `steps` level benches stepping down the fitted slope (along whichever side it falls
//             more), with a short batter between benches
// Round the edge, the ground meets the graded area along batters at `batter` horizontal to 1
// vertical: an embankment falling away where the area is above the ground, a cut slope climbing
// where it's below (terrain.js).

export const GRADES = {
	'level (dead flat)': 'level',
	'follow the ground (smoothed)': 'follow',
	'one slope': 'slope',
	'crowned (ridge down the middle)': 'ridge',
	'swale (valley down the middle)': 'valley',
	'terraces (level benches)': 'terraces',
};
export const GRADE_IDS = Object.values( GRADES );
export const TOWARD = { front: 'front', back: 'back', left: 'left', right: 'right' };
export const RIDGE_ALONG = { 'along its length': 'length', 'along its width': 'width' };
export const BATTERS = { '1.5 : 1': 1.5, '2 : 1 (usual)': 2, '3 : 1 (gentle)': 3 };
export const FALL = { min: 0.5, max: 20, step: 0.5, default: 2 };
export const STEPS = { min: 2, max: 8, default: 3 };
export const MAX_GRADE = 50;
// A batter reaches at most this far from the area's edge (m), so a pad high above a gully doesn't
// mark the whole map.
export const MAX_REACH = 30;
// The terrain draws a graded area, and its batters, from chunks of sampled ground over all of it,
// which costs memory and raycasts by the square of its size. Wider or longer than this (m), an
// area's grading only presses Google's mesh down onto its shape, as a level area does onto its
// floor: no batters and no earth reckoned.
export const MAX_GRADED_SIDE = 300;
// Benches of a terrace are joined by a batter at most this share of a bench wide.
const TERRACE_RUN = 0.6;

const clamp = ( v, min, max ) => Math.min( max, Math.max( min, v ) );
const num = ( v, fallback ) => Number.isFinite( Number( v ) ) && v !== null && v !== '' ? Number( v ) : fallback;

export function isGraded( params ) {

	return !! params && GRADE_IDS.includes( params.grade ) && params.grade !== 'level';

}

// Whether a graded area is too large to be drawn with batters (see MAX_GRADED_SIDE).
export function pressedOnly( params ) {

	return isGraded( params ) && Math.max( params.width, params.length ) > MAX_GRADED_SIDE;

}

// Every grading param filled in and clamped. Missing or unknown grades are level: what areas saved
// before grading were.
export function normalizeGrade( p ) {

	const batter = num( p.batter, 2 );
	return {
		grade: GRADE_IDS.includes( p.grade ) ? p.grade : 'level',
		fall: Math.round( clamp( num( p.fall, FALL.default ), FALL.min, FALL.max ) / FALL.step ) * FALL.step,
		toward: TOWARD[ p.toward ] ?? 'front',
		ridgeAlong: p.ridgeAlong === 'width' ? 'width' : 'length',
		steps: Math.round( clamp( num( p.steps, STEPS.default ), STEPS.min, STEPS.max ) ),
		maxGrade: clamp( num( p.maxGrade, 0 ), 0, MAX_GRADE ),
		// The nearest of the batters offered.
		batter: Object.values( BATTERS ).reduce( ( best, b ) => Math.abs( b - batter ) < Math.abs( best - batter ) ? b : best, 2 ),
	};

}

// What's saved: nothing for a level area (as areas saved before grading), and for a graded one the
// grade, its batter and what that grade uses.
export function saveGrade( { grade, fall, toward, ridgeAlong, steps, maxGrade, batter } ) {

	if ( grade === 'level' || ! GRADE_IDS.includes( grade ) ) return {};
	const out = { grade, batter };
	if ( grade === 'follow' && maxGrade > 0 ) out.maxGrade = maxGrade;
	if ( grade === 'slope' ) Object.assign( out, { fall, toward } );
	if ( grade === 'ridge' || grade === 'valley' ) Object.assign( out, { fall, ridgeAlong } );
	if ( grade === 'terraces' ) out.steps = steps;
	return out;

}

// The fitted slope as followed: no steeper than maxGrade (%), when that's set.
export function followSlope( params, slope ) {

	let gx = slope?.gx ?? 0, gz = slope?.gz ?? 0;
	const cap = ( params.maxGrade ?? 0 ) / 100;
	const g = Math.hypot( gx, gz );
	if ( cap > 0 && g > cap ) {

		gx *= cap / g;
		gz *= cap / g;

	}

	return { gx, gz };

}

// The graded surface's height above (or below) the area's height at (x, z) in its frame; points
// outside the area are taken at the nearest point of its edge.
export function gradeOffset( params, slope, x, z ) {

	const hw = params.width / 2, hl = params.length / 2;
	x = clamp( x, - hw, hw );
	z = clamp( z, - hl, hl );
	const f = ( params.fall ?? FALL.default ) / 100;
	switch ( params.grade ) {

		case 'follow': {

			const { gx, gz } = followSlope( params, slope );
			return gx * x + gz * z;

		}

		case 'slope':
			// Falling toward the front (-z), the back (+z), the right (+x) or the left (-x).
			if ( params.toward === 'back' ) return - f * z;
			if ( params.toward === 'right' ) return - f * x;
			if ( params.toward === 'left' ) return f * x;
			return f * z;
		case 'ridge':
		case 'valley': {

			// Half the area's half-width above the middle at the crown: the mean is the middle height.
			const crown = params.ridgeAlong === 'width' ? f * ( hl / 2 - Math.abs( z ) ) : f * ( hw / 2 - Math.abs( x ) );
			return params.grade === 'ridge' ? crown : - crown;

		}

		case 'terraces': return terrace( params, slope, x, z );
		default: return 0;

	}

}

// Level benches down the fitted slope, along the area's side it falls more along, each at the
// plane's height at its middle, joined by a batter as steep as the area's batter (but no wider than
// TERRACE_RUN of a bench).
function terrace( params, slope, x, z ) {

	const gx = slope?.gx ?? 0, gz = slope?.gz ?? 0;
	const alongX = Math.abs( gx ) >= Math.abs( gz );
	const g = alongX ? gx : gz;
	const half = alongX ? params.width / 2 : params.length / 2;
	const s = alongX ? x : z;
	const n = params.steps ?? STEPS.default;
	const bench = 2 * half / n;
	const level = k => g * ( - half + ( k + 0.5 ) * bench );
	const k = clamp( Math.floor( ( s + half ) / bench ), 0, n - 1 );
	const j = Math.round( ( s + half ) / bench );
	if ( j >= 1 && j <= n - 1 ) {

		const edge = - half + j * bench;
		const run = Math.min( Math.abs( g * bench ) * ( params.batter ?? 2 ), bench * TERRACE_RUN );
		if ( run > 1e-6 && Math.abs( s - edge ) < run / 2 ) return level( j - 1 ) + ( level( j ) - level( j - 1 ) ) * ( ( s - edge ) / run + 0.5 );

	}

	return level( k );

}

// Least-squares plane through samples [ x, z, y ] (the area's frame): { c, gx, gz }, its height at
// the middle and its slope, or null with fewer than three. Samples standing well above a first fit
// (what stood on the ground: a shed's roof, a rail car) are left out of a second one.
export function fitPlane( samples ) {

	const solve = points => {

		if ( points.length < 3 ) return null;
		let n = 0, sx = 0, sz = 0, sy = 0, sxx = 0, szz = 0, sxz = 0, sxy = 0, szy = 0;
		for ( const [ x, z, y ] of points ) {

			n ++; sx += x; sz += z; sy += y;
			sxx += x * x; szz += z * z; sxz += x * z; sxy += x * y; szy += z * y;

		}

		// Centred sums, then the 2 × 2 normal equations for the slopes.
		const mx = sx / n, mz = sz / n, my = sy / n;
		const cxx = sxx - n * mx * mx, czz = szz - n * mz * mz, cxz = sxz - n * mx * mz;
		const cxy = sxy - n * mx * my, czy = szy - n * mz * my;
		const det = cxx * czz - cxz * cxz;
		if ( Math.abs( det ) < 1e-9 ) return { c: my, gx: 0, gz: 0 };
		const gx = ( cxy * czz - czy * cxz ) / det;
		const gz = ( czy * cxx - cxy * cxz ) / det;
		return { c: my - gx * mx - gz * mz, gx, gz };

	};

	const first = solve( samples );
	if ( ! first ) return null;
	const residuals = samples.map( ( [ x, z, y ] ) => y - ( first.c + first.gx * x + first.gz * z ) );
	const spread = [ ...residuals ].map( Math.abs ).sort( ( a, b ) => a - b )[ residuals.length >> 1 ];
	const limit = Math.max( 1, 2.5 * spread );
	const kept = samples.filter( ( _, i ) => residuals[ i ] <= limit );
	return kept.length < samples.length && kept.length >= Math.max( 3, samples.length / 2 ) ? solve( kept ) : first;

}

// Where to read the ground for fitPlane: an n × n grid over a width × length rectangle, a little in
// from its edge, in its frame.
export function fitPoints( width, length, n = 7 ) {

	const out = [];
	for ( let j = 0; j < n; j ++ ) for ( let i = 0; i < n; i ++ ) out.push( [ ( i / ( n - 1 ) - 0.5 ) * width * 0.9, ( j / ( n - 1 ) - 0.5 ) * length * 0.9 ] );
	return out;

}

// The lowest and highest offsets over the area (its corners, edge middles and middle lines, enough
// for planes, crowns and benches).
export function gradeRange( params, slope ) {

	let min = Infinity, max = - Infinity;
	const hw = params.width / 2, hl = params.length / 2;
	for ( let j = 0; j <= 8; j ++ ) for ( let i = 0; i <= 8; i ++ ) {

		const y = gradeOffset( params, slope, ( i / 8 - 0.5 ) * 2 * hw, ( j / 8 - 0.5 ) * 2 * hl );
		min = Math.min( min, y );
		max = Math.max( max, y );

	}

	return { min, max };

}

const COMPASS = [ 'north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west' ];

// Which way is downhill on a plane { gx, gz } in an area turned to `heading`, as a compass point.
export function downhill( { gx, gz }, heading ) {

	// Downhill in the area's frame is -(gx, gz); x is across it (heading + 90°) and -z along it.
	const across = - gx, along = gz;
	const r = heading * Math.PI / 180;
	const east = across * Math.cos( r ) + along * Math.sin( r );
	const north = - across * Math.sin( r ) + along * Math.cos( r );
	const bearing = ( Math.atan2( east, north ) * 180 / Math.PI + 360 ) % 360;
	return COMPASS[ Math.round( bearing / 45 ) % 8 ];

}

// A few words on how an area is graded, for its label and its P panel.
export function describeGrade( params, slope = null, heading = 0 ) {

	const pct = v => `${ ( Math.round( v * 10 ) / 10 ).toLocaleString( 'en-CA' ) }%`;
	switch ( params.grade ) {

		case 'follow': {

			const s = followSlope( params, slope );
			const g = Math.hypot( s.gx, s.gz ) * 100;
			if ( ! slope ) return 'follows the ground';
			return g < 0.05 ? 'follows the ground (level)' : `follows the ground: ${ pct( g ) } down to the ${ downhill( s, heading ) }`;

		}

		case 'slope': return `${ pct( params.fall ) } fall to the ${ params.toward }`;
		case 'ridge': return `crowned ${ pct( params.fall ) } each way`;
		case 'valley': return `swale ${ pct( params.fall ) } each way`;
		case 'terraces': return `${ params.steps } terraces`;
		default: return 'level';

	}

}
