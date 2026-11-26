// Grading a flatten area (flatten.js): the shape its finished ground takes. Shared by flatten.js
// (the shape Google's mesh is pressed onto, the surface and the fence), terrain.js (the ground the
// earthworks are drawn and walked on, with batters round the edge) and models.js (the plane or the
// smoothed surface fitted through the ground under it), so all of them agree. Plain numbers only: no three.js and no CSS, so
// Node tests and the Worker can import it too.
//
// Heights are offsets in metres from the area's height (entry.state.up), at (x, z) in the area's own
// frame: x across it (its width; +x is its right), z along it (its length), its front (the side it
// faces) towards -z, as fences and gates are laid out. `slope` (the area's params.fit) is what was
// fitted through the ground under the area as Google made it: { gx, gz }, the plane, metres up per
// metre along x and z, about the area's middle, which is where its height (state.up) is: snapping
// puts it there (models.js, 'plane'); and for an area that follows the ground, `grid` too, the
// ground smoothed (fitSurface): heights over a small grid reaching a smoothing radius beyond the
// area, read between its nodes bilinearly (gridAt), about the same height.
//
// The grades:
//   level     dead flat, as areas always were (and those saved before grading still are)
//   follow    a smoothed copy of the bare ground: what stood on it (a shed, a car, a tree) left out,
//             bumps under `smoothing` m smoothed away, the grade followed as it changes across the
//             area; `maxGrade` (%) limits how steep any part of it may be (0 for no limit)
//   plane     the plane fitted through the ground: one slope from the ground, as `follow` was
//             before it was smoothed; `maxGrade` caps it too
//   slope     one plane falling `fall` % `toward` a side, pivoting about the middle
//   ridge     a crown: a ridge down the middle (along the length or the width) falling `fall` % to
//             both sides, set so as much is above the middle height as below
//   valley    the same upside down: a swale down the middle
//   terraces  `steps` level benches stepping down the fitted slope (along whichever side it falls
//             more), with a short batter between benches
// Round the edge, the ground meets the graded area along batters at `batter` horizontal to 1
// vertical: an embankment falling away where the area is above the ground, a cut slope climbing
// where it's below (terrain.js).

// Ground read from Google's tiles coarser than this (their geometric error, m) isn't the ground: the
// globe's first levels, which stand in before finer tiles load (and while the camera moves, as tiles
// refine and fade), lie hundreds of metres to more than a kilometre off it (about 1,500 m above it in
// North Vancouver). Snapping (models.js) and the earthworks' ground (terrain.js) leave it out.
export const MAX_GROUND_ERROR = 300;

export const GRADES = {
	'level (dead flat)': 'level',
	'follow the ground (smoothed)': 'follow',
	'best-fit plane (one slope from the ground)': 'plane',
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
// How far (m) the ground is smoothed over when an area follows it: bumps narrower than about this go.
export const SMOOTHING = { min: 2, max: 50, step: 1, default: 10 };
// The ground followed is read on a grid this many cells across at most (33 × 33 readings), at least
// this far apart (m), and what stands more than LIFT (m) above the smoothed ground isn't ground.
const SURFACE_CELLS = 32;
const SURFACE_SPACING = 2;
const LIFT = 0.75;
// The Gaussian a surface is smoothed with is never narrower than this share of the grid's spacing.
const SIGMA_CELLS = 0.75;
// Readings this many times as far above a smoothed surface as it bows up round them are the ground
// rounding over (a crest), not something standing on it (fitSurface, crown), if they rise smoothly.
const CROWN = 6;
// A patch of readings above the smoothed ground that meets the rest with a jump of more than this
// (m), and more than ground as steep as MAX_GRADE climbs from one reading to the next, stands on
// it, however the ground rounds over beneath it.
const STEP = 0.5;
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
		smoothing: Math.round( clamp( num( p.smoothing, SMOOTHING.default ), SMOOTHING.min, SMOOTHING.max ) / SMOOTHING.step ) * SMOOTHING.step,
		// The nearest of the batters offered.
		batter: Object.values( BATTERS ).reduce( ( best, b ) => Math.abs( b - batter ) < Math.abs( best - batter ) ? b : best, 2 ),
	};

}

// What's saved: nothing for a level area (as areas saved before grading), and for a graded one the
// grade, its batter and what that grade uses (the usual smoothing isn't saved).
export function saveGrade( { grade, fall, toward, ridgeAlong, steps, maxGrade, smoothing, batter } ) {

	if ( grade === 'level' || ! GRADE_IDS.includes( grade ) ) return {};
	const out = { grade, batter };
	if ( ( grade === 'follow' || grade === 'plane' ) && maxGrade > 0 ) out.maxGrade = maxGrade;
	if ( grade === 'follow' && Number.isFinite( smoothing ) && smoothing !== SMOOTHING.default ) out.smoothing = smoothing;
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

			const design = designGrid( params, slope );
			if ( design ) return gridAt( design, x, z );
			const { gx, gz } = followSlope( params, slope );
			return gx * x + gz * z;

		}

		case 'plane': {

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

// Least-squares plane through points [ x, z, y ]: { c, gx, gz }, or null with fewer than three.
function planeThrough( points ) {

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

}

// Least-squares plane through samples [ x, z, y ] (the area's frame): { c, gx, gz }, its height at
// the middle and its slope, or null with fewer than three. Samples standing well above a first fit
// (what stood on the ground: a shed's roof, a rail car) are left out of a second one.
export function fitPlane( samples ) {

	const first = planeThrough( samples );
	if ( ! first ) return null;
	const residuals = samples.map( ( [ x, z, y ] ) => y - ( first.c + first.gx * x + first.gz * z ) );
	const spread = [ ...residuals ].map( Math.abs ).sort( ( a, b ) => a - b )[ residuals.length >> 1 ];
	const limit = Math.max( 1, 2.5 * spread );
	const kept = samples.filter( ( _, i ) => residuals[ i ] <= limit );
	return kept.length < samples.length && kept.length >= Math.max( 3, samples.length / 2 ) ? planeThrough( kept ) : first;

}

// Where to read the ground for fitPlane: an n × n grid over a width × length rectangle, a little in
// from its edge, in its frame.
export function fitPoints( width, length, n = 7 ) {

	const out = [];
	for ( let j = 0; j < n; j ++ ) for ( let i = 0; i < n; i ++ ) out.push( [ ( i / ( n - 1 ) - 0.5 ) * width * 0.9, ( j / ( n - 1 ) - 0.5 ) * length * 0.9 ] );
	return out;

}

// The ground followed (grade 'follow'): where to read it under a width × length area smoothed over
// `smoothing` m, a grid reaching one smoothing radius beyond each edge (so the edges aren't swayed
// by what's only on one side of them), about SURFACE_SPACING m apart or wider for a large area.
// { nx, nz, x0, z0, dx, dz }, nodes row by row (x fastest), in the area's frame.
export function surfaceLayout( width, length, smoothing = SMOOTHING.default ) {

	const W = width + 2 * smoothing, L = length + 2 * smoothing;
	const spacing = Math.max( SURFACE_SPACING, smoothing / 4 );
	const nx = Math.min( SURFACE_CELLS, Math.max( 2, Math.ceil( W / spacing ) ) ) + 1;
	const nz = Math.min( SURFACE_CELLS, Math.max( 2, Math.ceil( L / spacing ) ) ) + 1;
	return { nx, nz, x0: - W / 2, z0: - L / 2, dx: W / ( nx - 1 ), dz: L / ( nz - 1 ) };

}

export function surfacePoints( { nx, nz, x0, z0, dx, dz } ) {

	const out = [];
	for ( let j = 0; j < nz; j ++ ) for ( let i = 0; i < nx; i ++ ) out.push( [ x0 + i * dx, z0 + j * dz ] );
	return out;

}

let grids = 0;

// The bare ground smoothed, from heights read at surfacePoints( layout ) (null where there was
// none): at each node a plane fitted through the readings round it, weighted by a Gaussian a third
// of the smoothing wide (so most of the weight is within the smoothing across), so the grade is
// followed as it changes and bumps narrower than the smoothing go (or than about two of the grid's
// spacings, on a large area read coarsely). What stands on the ground (a roof, a car, a tree) is
// found as a point cloud's ground is, and left out (see below), while a crest, a ridge or the
// rim of a cut is kept: it rises out of the ground round it without a step. Returns { c, fit } — c the smoothed ground's height at the area's middle, fit
// { gx, gz, smoothing, grid } with grid.h the heights over the layout less c (cm) and gx, gz the
// plane through it under the area — or null with too few readings.
export function fitSurface( layout, heights, smoothing, width, length ) {

	const { nx, nz, dx, dz } = layout;
	const n = nx * nz;
	const valid = heights.map( y => Number.isFinite( y ) );
	if ( valid.filter( Boolean ).length < 3 ) return null;
	const points = surfacePoints( layout );
	// The Gaussian's weights round a node, out to three sigmas, for a smoothing of `across` m. Never
	// narrower than the grid is apart (SIGMA_CELLS of its spacing): on a large area the nodes are
	// wider apart than a small smoothing, and a Gaussian that reached only the node itself (or it and
	// two neighbours in a row) would have nothing to fit a plane through. The ground can't be
	// followed more finely than it was read anyway.
	const kernel = ( across, wider = 1 ) => {

		const sigma = wider * Math.max( across / 3, 0.5, SIGMA_CELLS * Math.max( dx, dz ) );
		const kx = Math.max( 1, Math.ceil( 3 * sigma / dx ) ), kz = Math.max( 1, Math.ceil( 3 * sigma / dz ) );
		const weights = [];
		for ( let b = - kz; b <= kz; b ++ ) for ( let a = - kx; a <= kx; a ++ ) {

			const d2 = ( a * dx ) ** 2 + ( b * dz ) ** 2;
			weights.push( d2 <= 9 * sigma * sigma ? Math.exp( - 0.5 * d2 / ( sigma * sigma ) ) : 0 );

		}

		return { kx, kz, weights, sigma };

	};

	// The plane through the readings kept round node (i, j), weighted by the kernel: its height at
	// the node, or NaN where there aren't readings enough round it to fit a plane through.
	const fitNode = ( kept, i, j, { kx, kz, weights } ) => {

		let sw = 0, sx = 0, sz = 0, sy = 0, sxx = 0, szz = 0, sxz = 0, sxy = 0, szy = 0, count = 0;
		let w = 0;
		for ( let b = - kz; b <= kz; b ++ ) {

			const jj = j + b;
			if ( jj < 0 || jj >= nz ) {

				w += 2 * kx + 1;
				continue;

			}

			for ( let a = - kx; a <= kx; a ++, w ++ ) {

				const ii = i + a;
				const wt = weights[ w ];
				if ( ii < 0 || ii >= nx || wt === 0 ) continue;
				const k = jj * nx + ii;
				if ( ! kept[ k ] ) continue;
				const x = a * dx, z = b * dz, y = heights[ k ];
				count ++;
				sw += wt; sx += wt * x; sz += wt * z; sy += wt * y;
				sxx += wt * x * x; szz += wt * z * z; sxz += wt * x * z; sxy += wt * x * y; szy += wt * z * y;

			}

		}

		if ( count < 3 || sw < 1e-6 ) return NaN;
		const mx = sx / sw, mz = sz / sw, my = sy / sw;
		const cxx = sxx / sw - mx * mx, czz = szz / sw - mz * mz, cxz = sxz / sw - mx * mz;
		const cxy = sxy / sw - mx * my, czy = szy / sw - mz * my;
		const det = cxx * czz - cxz * cxz;
		// All in a row (or nearly), or all off to one side of the node, far for how spread they are
		// (a node in a gap left by what stood on the ground, read from a strip down one side of it):
		// a plane through them would tip wildly out to the node.
		if ( cxx + czz < 1e-9 || det < 1e-3 * ( cxx + czz ) ** 2 ) return NaN;
		if ( ( czz * mx * mx - 2 * cxz * mx * mz + cxx * mz * mz ) / det > 9 ) return NaN;
		const gx = ( cxy * czz - czy * cxz ) / det;
		const gz = ( czy * cxx - cxy * cxz ) / det;
		return my - gx * mx - gz * mz;

	};

	const smooth = ( kept, k, across ) => {

		const out = new Float64Array( n );
		let fallback;
		for ( let j = 0; j < nz; j ++ ) for ( let i = 0; i < nx; i ++ ) {

			// Where what stood on the ground left too few readings round a node, the plane through
			// those a little further off (twice as far, then four times), and only failing that the
			// plane through all of them: never the whole area's plane where the ground round it would do.
			let y = fitNode( kept, i, j, k );
			for ( let wider = 2; ! Number.isFinite( y ) && wider <= 4; wider *= 2 ) y = fitNode( kept, i, j, kernel( across, wider ) );
			if ( ! Number.isFinite( y ) ) {

				fallback ??= planeThrough( points.flatMap( ( [ x, z ], m ) => kept[ m ] ? [ [ x, z, heights[ m ] ] ] : [] ) );
				const [ px, pz ] = points[ j * nx + i ];
				y = fallback ? fallback.c + fallback.gx * px + fallback.gz * pz : 0;

			}

			out[ j * nx + i ] = y;

		}

		return out;

	};

	// How far a smoothed surface sits below the ground it was smoothed from where that ground rounds
	// over (a hill's crest, a ridge, the rim of a cut): a plane fitted round a node on a crest sits
	// below the crest, about as far as the surface itself bows up there over a sigma either side.
	// Readings that far above it are the ground rounding over, not something standing on it, so they
	// aren't left out for it; else each fit would leave out the crest, sink lower, and leave out more.
	// Ground that bows the other way (a valley) gives nothing: there the fit is above the ground.
	const crown = ( surface, sigma ) => {

		const rx = Math.max( 1, Math.round( sigma / dx ) ), rz = Math.max( 1, Math.round( sigma / dz ) );
		const out = new Float64Array( n );
		const bow = ( a, here, b ) => here - ( a + b ) / 2;
		for ( let j = 0; j < nz; j ++ ) for ( let i = 0; i < nx; i ++ ) {

			const here = surface[ j * nx + i ];
			const ax = Math.min( rx, i, nx - 1 - i ), az = Math.min( rz, j, nz - 1 - j );
			const up = Math.max(
				ax ? bow( surface[ j * nx + i - ax ], here, surface[ j * nx + i + ax ] ) * ( rx / ax ) ** 2 : 0,
				az ? bow( surface[ ( j - az ) * nx + i ], here, surface[ ( j + az ) * nx + i ] ) * ( rz / az ) ** 2 : 0,
			);
			out[ j * nx + i ] = Math.max( 0, CROWN * up );

		}

		return out;

	};

	// The readings that are ground against a smoothed surface: those no more than `limit` above it,
	// and those above it only as far as it bows up round them (crown) where they rise from the
	// readings round them without a step: a patch of readings above the surface that meets the rest
	// with a jump of more than `step` is something standing on the ground (a roof, a stand of trees)
	// however the surface bows over it; one that rises out of them smoothly is the ground rounding over.
	const ground = ( surface, sigma, limit ) => {

		const rounded = crown( surface, sigma );
		const step = STEP + MAX_GRADE / 100 * Math.max( dx, dz );
		const over = new Float64Array( n );
		for ( let k = 0; k < n; k ++ ) over[ k ] = valid[ k ] ? heights[ k ] - surface[ k ] : - Infinity;
		const out = valid.map( ( v, k ) => v && over[ k ] <= limit );
		const patch = new Int32Array( n ).fill( - 1 );
		for ( let start = 0; start < n; start ++ ) {

			if ( ! valid[ start ] || out[ start ] || patch[ start ] >= 0 ) continue;
			// The patch of readings above the limit joined to this one, and the biggest jump from it
			// down to the readings round it.
			const cells = [ start ];
			patch[ start ] = start;
			let jump = 0;
			for ( let q = 0; q < cells.length; q ++ ) {

				const k = cells[ q ], i = k % nx, j = ( k - i ) / nx;
				for ( const m of [ i > 0 ? k - 1 : - 1, i < nx - 1 ? k + 1 : - 1, j > 0 ? k - nx : - 1, j < nz - 1 ? k + nx : - 1 ] ) {

					if ( m < 0 || ! valid[ m ] ) continue;
					if ( out[ m ] ) jump = Math.max( jump, over[ k ] - over[ m ] );
					else if ( patch[ m ] < 0 ) {

						patch[ m ] = start;
						cells.push( m );

					}

				}

			}

			if ( jump <= step ) for ( const k of cells ) out[ k ] = over[ k ] <= limit + rounded[ k ];

		}

		return out;

	};

	// What stood on the ground is left out coarse to fine, as a point cloud's ground is filtered: a
	// roof as wide as the smoothing would lift a fit that fine right up onto it, so first against
	// the ground smoothed over three times as far (30 m at least), leaving out what stands well above
	// it, then half way, then at the smoothing asked for, leaving out what stands more than LIFT
	// above (and not merely the ground rounding over: see ground). At each, fit, leave out, fit
	// again until nothing changes. What's below is ground.
	const coarse = Math.max( 3 * smoothing, 30 );
	const stages = [ coarse, Math.sqrt( coarse * smoothing ), smoothing ];
	let kept = standing( layout, heights, valid ).map( ( up, i ) => valid[ i ] && ! up );
	if ( kept.filter( Boolean ).length < 3 ) kept = valid;
	let surface = null;
	for ( const across of stages ) {

		const k = kernel( across );
		const limit = across === smoothing ? LIFT : Math.max( LIFT, Math.min( 2.5, across / 16 ) );
		surface = smooth( kept, k, across );
		for ( let round = 0; round < 8; round ++ ) {

			const next = ground( surface, k.sigma, limit );
			// Always some ground left: what stood on it can't be all of it.
			if ( next.filter( Boolean ).length < 3 || next.every( ( v, i ) => v === kept[ i ] ) ) break;
			kept = next;
			surface = smooth( kept, k, across );

		}

	}

	const grid = { nx, nz, x0: layout.x0, z0: layout.z0, dx, dz, h: [] };
	grid.h = Array.from( surface );
	const c = gridAt( grid, 0, 0 );
	grid.h = grid.h.map( y => Math.round( ( y - c ) * 100 ) / 100 );
	grid.id = ++ grids;
	// The plane through it under the area: its way downhill, and what terraces step down.
	const hw = width / 2, hl = length / 2;
	const under = [];
	points.forEach( ( [ x, z ], k ) => Math.abs( x ) <= hw + dx && Math.abs( z ) <= hl + dz && under.push( [ x, z, grid.h[ k ] ] ) );
	const plane = planeThrough( under ) ?? { gx: 0, gz: 0 };
	const r5 = v => Math.round( v * 1e5 ) / 1e5;
	return { c, fit: { gx: r5( plane.gx ), gz: r5( plane.gz ), smoothing, grid } };

}

// What stands on the ground among readings on a grid (true where it does), found as a progressive
// morphological filter finds it in a point cloud: the readings opened (each the lowest within a
// window, then the highest of those) over windows growing to PMF_WINDOWS m, which takes away what's
// narrower than the window and leaves slopes as they are; a reading more than a little above the
// opening (more the wider the window, as the ground can round over between) stands on the ground.
// It catches a stand of trees or a building as wide as the windows, which a smoothed fit through
// them would climb onto. Each opening is measured against the last (not against the readings), and
// allowed to drop as far as ground as steep as MAX_GRADE falls over the window's extra reach, so a
// crest or the shoulder of a cut, which every opening rounds off a little more, isn't taken for
// something standing on it.
const PMF_WINDOWS = [ 5, 10, 20, 35 ];
function standing( { nx, nz, dx, dz }, heights, valid ) {

	const n = nx * nz;
	// Where there was no reading, the highest there was, so it's never the lowest in a window.
	let top = - Infinity;
	for ( let k = 0; k < n; k ++ ) if ( valid[ k ] ) top = Math.max( top, heights[ k ] );
	let z = Float64Array.from( heights, ( y, k ) => valid[ k ] ? y : top );
	const out = new Array( n ).fill( false );
	const pass = ( from, rx, rz, pick ) => {

		const to = new Float64Array( n );
		for ( let j = 0; j < nz; j ++ ) for ( let i = 0; i < nx; i ++ ) {

			let v = from[ j * nx + i ];
			for ( let b = Math.max( 0, j - rz ); b <= Math.min( nz - 1, j + rz ); b ++ ) for ( let a = Math.max( 0, i - rx ); a <= Math.min( nx - 1, i + rx ); a ++ ) v = pick( v, from[ b * nx + a ] );
			to[ j * nx + i ] = v;

		}

		return to;

	};

	let last = 0;
	for ( const w of PMF_WINDOWS ) {

		const rx = Math.round( w / 2 / dx ), rz = Math.round( w / 2 / dz );
		if ( rx < 1 && rz < 1 ) continue;
		// How far the window reaches (m), as the grid rounds it, and how far the ground could fall
		// over the extra reach since the last one, as steep as any area may be graded.
		const reach = Math.max( rx * dx, rz * dz );
		if ( reach <= last ) continue;
		const opened = pass( pass( z, rx, rz, Math.min ), rx, rz, Math.max );
		const limit = 0.5 + MAX_GRADE / 100 * ( reach - last );
		for ( let k = 0; k < n; k ++ ) if ( valid[ k ] && z[ k ] - opened[ k ] > limit ) out[ k ] = true;
		z = opened;
		last = reach;

	}

	return out;

}

// A grid's height at (x, z), bilinearly between its nodes, at the nearest point of it outside.
export function gridAt( g, x, z ) {

	const fx = clamp( ( x - g.x0 ) / g.dx, 0, g.nx - 1 ), fz = clamp( ( z - g.z0 ) / g.dz, 0, g.nz - 1 );
	const i = Math.min( g.nx - 2, Math.floor( fx ) ), j = Math.min( g.nz - 2, Math.floor( fz ) );
	const s = fx - i, t = fz - j;
	const h = g.h, k = j * g.nx + i;
	return ( h[ k ] * ( 1 - s ) + h[ k + 1 ] * s ) * ( 1 - t ) + ( h[ k + g.nx ] * ( 1 - s ) + h[ k + g.nx + 1 ] * s ) * t;

}

// The bare ground fitted under (and round) an area at (x, z), about its height: the smoothed ground
// where there is one, carried on along the plane beyond it; the plane where there isn't.
export function groundOffset( fit, x, z ) {

	const gx = fit?.gx ?? 0, gz = fit?.gz ?? 0;
	const g = fit?.grid;
	if ( ! g ) return gx * x + gz * z;
	const cx = clamp( x, g.x0, g.x0 + ( g.nx - 1 ) * g.dx ), cz = clamp( z, g.z0, g.z0 + ( g.nz - 1 ) * g.dz );
	return gridAt( g, cx, cz ) + gx * ( x - cx ) + gz * ( z - cz );

}

// Whether two fits are the same as far as the ground made from them goes (so a refit that changes
// nothing to speak of isn't a change, and nothing is made again for it).
export function sameFit( a, b ) {

	if ( ! a || ! b ) return ! a && ! b;
	if ( Math.abs( a.gx - b.gx ) > 1e-4 || Math.abs( a.gz - b.gz ) > 1e-4 ) return false;
	const ga = a.grid, gb = b.grid;
	if ( ! ga || ! gb ) return ! ga && ! gb;
	if ( ga === gb ) return true;
	if ( a.smoothing !== b.smoothing || ga.nx !== gb.nx || ga.nz !== gb.nz || Math.abs( ga.dx - gb.dx ) > 1e-6 || Math.abs( ga.dz - gb.dz ) > 1e-6 ) return false;
	return ga.h.every( ( v, k ) => Math.abs( v - gb.h[ k ] ) <= 0.02 );

}

// What a fit is, in a few characters, to tell when what's made from it must be made again.
export function fitKey( fit ) {

	return fit ? `${ fit.gx },${ fit.gz },${ fit.grid?.id ?? '' }` : '';

}

// The surface an area that follows the ground is graded to: its smoothed ground (fit.grid), no
// steeper anywhere over the area than maxGrade when that's set, raised or lowered as a whole so
// as much is cut as filled. Kept with the grid it's made from, for the next time it's asked for.
const designs = new WeakMap();
function designGrid( params, fit ) {

	const g = fit?.grid;
	if ( ! g || ! Array.isArray( g.h ) ) return null;
	const cap = ( params.maxGrade ?? 0 ) / 100;
	if ( ! ( cap > 0 ) ) return g;
	const key = `${ cap }|${ params.width }|${ params.length }`;
	let made = designs.get( g );
	if ( made?.key === key ) return made.design;
	const h = capGrid( g, cap, params.width / 2, params.length / 2 );
	made = { key, design: { ...g, h } };
	designs.set( g, made );
	return made.design;

}

// The grid's heights made no steeper than `cap` over the cells under the area. First the highest
// surface under the heights and the lowest over them that are nowhere steeper than the cap (the
// ground cut down from its humps, and filled up from its hollows, at the cap), averaged: as steep as
// the cap where the ground is steeper and the ground itself where it's gentler, cut about as much as
// filled. Then, at each corner of those cells (where a bilinear cell is steepest), the corner and
// its neighbours across and along are drawn together about their middle until none is steeper. Then
// shifted so the heights under the area are on average where the ground's were.
function capGrid( g, cap, hw, hl ) {

	const { nx, nz, x0, z0, dx, dz } = g;
	const h = g.h.slice();
	const i0 = clamp( Math.floor( ( - hw - x0 ) / dx ), 0, nx - 2 ), i1 = clamp( Math.ceil( ( hw - x0 ) / dx ) - 1, 0, nx - 2 );
	const j0 = clamp( Math.floor( ( - hl - z0 ) / dz ), 0, nz - 2 ), j1 = clamp( Math.ceil( ( hl - z0 ) / dz ) - 1, 0, nz - 2 );
	const nodes = [];
	for ( let j = j0; j <= j1 + 1; j ++ ) for ( let i = i0; i <= i1 + 1; i ++ ) nodes.push( [ j * nx + i, i * dx, j * dz ] );
	const lowered = [], raised = [];
	for ( const [ , x, z ] of nodes ) {

		let low = Infinity, high = - Infinity;
		for ( const [ k, x2, z2 ] of nodes ) {

			const d = cap * Math.hypot( x - x2, z - z2 );
			low = Math.min( low, g.h[ k ] + d );
			high = Math.max( high, g.h[ k ] - d );

		}

		lowered.push( low );
		raised.push( high );

	}

	nodes.forEach( ( [ k ], n ) => h[ k ] = ( lowered[ n ] + raised[ n ] ) / 2 );
	const corners = [ [ 0, 0, 1, 1 ], [ 1, 0, - 1, 1 ], [ 0, 1, 1, - 1 ], [ 1, 1, - 1, - 1 ] ];
	for ( let round = 0; round < 200; round ++ ) {

		let worst = 0;
		for ( let j = j0; j <= j1; j ++ ) for ( let i = i0; i <= i1; i ++ ) {

			for ( const [ ci, cj, ai, bj ] of corners ) {

				const c = ( j + cj ) * nx + i + ci, a = c + ai, b = c + bj * nx;
				const m = Math.hypot( ( h[ a ] - h[ c ] ) / dx, ( h[ b ] - h[ c ] ) / dz );
				worst = Math.max( worst, m );
				if ( m <= cap ) continue;
				const f = cap / m * 0.999;
				const mid = ( h[ a ] + h[ b ] + h[ c ] ) / 3;
				h[ a ] = mid + ( h[ a ] - mid ) * f;
				h[ b ] = mid + ( h[ b ] - mid ) * f;
				h[ c ] = mid + ( h[ c ] - mid ) * f;

			}

		}

		if ( worst <= cap * 1.002 ) break;

	}

	// As much cut as fill under the area, about.
	let shift = 0, count = 0;
	for ( let j = 0; j < nz; j ++ ) for ( let i = 0; i < nx; i ++ ) {

		const x = x0 + i * dx, z = z0 + j * dz;
		if ( Math.abs( x ) > hw || Math.abs( z ) > hl ) continue;
		shift += g.h[ j * nx + i ] - h[ j * nx + i ];
		count ++;

	}

	shift = count ? shift / count : 0;
	return h.map( v => v + shift );

}

// The least and most steep the followed surface is over the area, as fractions (the tenth and
// ninetieth percentiles of its cells', so one odd cell doesn't speak for it), or null without a grid.
export function surfaceGrades( params, fit ) {

	const d = designGrid( params, fit );
	if ( ! d ) return null;
	const hw = params.width / 2, hl = params.length / 2;
	const out = [];
	for ( let j = 0; j < d.nz - 1; j ++ ) for ( let i = 0; i < d.nx - 1; i ++ ) {

		const x = d.x0 + ( i + 0.5 ) * d.dx, z = d.z0 + ( j + 0.5 ) * d.dz;
		if ( Math.abs( x ) >= hw + d.dx / 2 - 1e-6 || Math.abs( z ) >= hl + d.dz / 2 - 1e-6 ) continue;
		const k = j * d.nx + i, h = d.h;
		const gx = ( h[ k + 1 ] - h[ k ] + h[ k + d.nx + 1 ] - h[ k + d.nx ] ) / ( 2 * d.dx );
		const gz = ( h[ k + d.nx ] - h[ k ] + h[ k + d.nx + 1 ] - h[ k + 1 ] ) / ( 2 * d.dz );
		out.push( Math.hypot( gx, gz ) );

	}

	if ( ! out.length ) return null;
	out.sort( ( a, b ) => a - b );
	return { min: out[ Math.floor( ( out.length - 1 ) * 0.1 ) ], max: out[ Math.ceil( ( out.length - 1 ) * 0.9 ) ] };

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

	// A followed surface's own nodes under the area too: its humps and hollows may lie between those.
	const d = params.grade === 'follow' ? designGrid( params, slope ) : null;
	if ( d ) for ( let k = 0; k < d.h.length; k ++ ) {

		const x = d.x0 + ( k % d.nx ) * d.dx, z = d.z0 + Math.floor( k / d.nx ) * d.dz;
		if ( Math.abs( x ) > hw || Math.abs( z ) > hl ) continue;
		min = Math.min( min, d.h[ k ] );
		max = Math.max( max, d.h[ k ] );

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

			if ( ! slope ) return 'follows the ground';
			const s = followSlope( params, slope );
			const g = Math.hypot( s.gx, s.gz ) * 100;
			const range = slope.grid ? surfaceGrades( params, slope ) : null;
			if ( ! range ) return g < 0.05 ? 'follows the ground (level)' : `follows the ground: ${ pct( g ) } down to the ${ downhill( s, heading ) }`;
			const head = `follows the ground, smoothed over ${ slope.smoothing ?? params.smoothing } m`;
			const lo = range.min * 100, hi = range.max * 100;
			if ( hi < 0.05 ) return `${ head } (level)`;
			const steep = hi - lo < 1 ? pct( ( lo + hi ) / 2 ) : `${ Math.round( lo ) }-${ Math.round( hi ) }%`;
			return g < 0.05 ? `${ head }: ${ steep }, level overall` : `${ head }: ${ steep } down to the ${ downhill( s, heading ) }`;

		}

		case 'plane': {

			if ( ! slope ) return 'one slope from the ground';
			const s = followSlope( params, slope );
			const g = Math.hypot( s.gx, s.gz ) * 100;
			return g < 0.05 ? 'one slope from the ground (level)' : `one slope from the ground: ${ pct( g ) } down to the ${ downhill( s, heading ) }`;

		}

		case 'slope': return `${ pct( params.fall ) } fall to the ${ params.toward }`;
		case 'ridge': return `crowned ${ pct( params.fall ) } each way`;
		case 'valley': return `swale ${ pct( params.fall ) } each way`;
		case 'terraces': return `${ params.steps } terraces`;
		default: return 'level';

	}

}
