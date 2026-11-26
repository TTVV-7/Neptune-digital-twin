// Plain-number geometry for flat outlines: a flatten area shaped by its points (flatten.js,
// grade.js, terrain.js, handles.js) and the MCP server checking the points Claude gives it
// (worker/drive/mcp.js). A polygon is a list of [ x, y ] corners in order, either way round, not
// closed (the last corner joins the first); anything after the first two numbers of a corner (a
// flatten area's height at it) is carried along and ignored here. No three.js, so Node tests and
// the Worker can import it.

// A flatten area's points: at least MIN_POINTS, at most MAX_POINTS.
export const MIN_POINTS = 3;
export const MAX_POINTS = 50;

// Twice the signed area (positive when the corners go anticlockwise with y up).
function twiceArea( points ) {

	let sum = 0;
	for ( let i = 0, n = points.length; i < n; i ++ ) {

		const [ ax, ay ] = points[ i ], [ bx, by ] = points[ ( i + 1 ) % n ];
		sum += ax * by - bx * ay;

	}

	return sum;

}

// The area inside (m², whichever way round it goes).
export function polygonArea( points ) {

	return Math.abs( twiceArea( points ) ) / 2;

}

// Round the outline (m).
export function perimeter( points ) {

	let sum = 0;
	for ( let i = 0, n = points.length; i < n; i ++ ) sum += Math.hypot( points[ ( i + 1 ) % n ][ 0 ] - points[ i ][ 0 ], points[ ( i + 1 ) % n ][ 1 ] - points[ i ][ 1 ] );
	return sum;

}

// { minX, maxX, minY, maxY }.
export function polygonBounds( points ) {

	const xs = points.map( p => p[ 0 ] ), ys = points.map( p => p[ 1 ] );
	return { minX: Math.min( ...xs ), maxX: Math.max( ...xs ), minY: Math.min( ...ys ), maxY: Math.max( ...ys ) };

}

// Which way round: 1 anticlockwise (y up), -1 clockwise.
export function winding( points ) {

	return twiceArea( points ) >= 0 ? 1 : - 1;

}

// Whether the segments ab and cd cross or touch (collinear overlaps too).
function segmentsMeet( a, b, c, d ) {

	const side = ( p, q, r ) => ( q[ 0 ] - p[ 0 ] ) * ( r[ 1 ] - p[ 1 ] ) - ( q[ 1 ] - p[ 1 ] ) * ( r[ 0 ] - p[ 0 ] );
	const eps = 1e-9;
	const d1 = side( c, d, a ), d2 = side( c, d, b ), d3 = side( a, b, c ), d4 = side( a, b, d );
	if ( ( ( d1 > eps && d2 < - eps ) || ( d1 < - eps && d2 > eps ) ) && ( ( d3 > eps && d4 < - eps ) || ( d3 < - eps && d4 > eps ) ) ) return true;
	const on = ( p, q, r, s ) => Math.abs( s ) <= eps && Math.min( p[ 0 ], q[ 0 ] ) - eps <= r[ 0 ] && r[ 0 ] <= Math.max( p[ 0 ], q[ 0 ] ) + eps && Math.min( p[ 1 ], q[ 1 ] ) - eps <= r[ 1 ] && r[ 1 ] <= Math.max( p[ 1 ], q[ 1 ] ) + eps;
	return on( c, d, a, d1 ) || on( c, d, b, d2 ) || on( a, b, c, d3 ) || on( a, b, d, d4 );

}

// Whether the outline is a simple polygon: at least three corners, no two the same (or closer than
// `gap` m), some area inside, and no edge crossing or touching another but its neighbours where they
// share a corner. A figure eight, or a corner dragged across the far side, isn't.
export function isSimple( points, gap = 0.01 ) {

	const n = points.length;
	if ( n < MIN_POINTS ) return false;
	for ( let i = 0; i < n; i ++ ) for ( let j = i + 1; j < n; j ++ ) if ( Math.hypot( points[ i ][ 0 ] - points[ j ][ 0 ], points[ i ][ 1 ] - points[ j ][ 1 ] ) < gap ) return false;
	if ( polygonArea( points ) < 1e-6 ) return false;
	for ( let i = 0; i < n; i ++ ) {

		const a = points[ i ], b = points[ ( i + 1 ) % n ];
		for ( let j = i + 1; j < n; j ++ ) {

			// Neighbouring edges share a corner: they may only meet there (not fold back along each other).
			const c = points[ j ], d = points[ ( j + 1 ) % n ];
			if ( j === i + 1 || ( i === 0 && j === n - 1 ) ) {

				const shared = j === i + 1 ? b : a;
				const [ p, q ] = j === i + 1 ? [ a, d ] : [ b, c ];
				const ux = p[ 0 ] - shared[ 0 ], uy = p[ 1 ] - shared[ 1 ], vx = q[ 0 ] - shared[ 0 ], vy = q[ 1 ] - shared[ 1 ];
				if ( Math.abs( ux * vy - uy * vx ) < 1e-9 && ux * vx + uy * vy > 0 ) return false;
				continue;

			}

			if ( segmentsMeet( a, b, c, d ) ) return false;

		}

	}

	return true;

}

// Whether (x, y) is inside (on the edge counts as either).
export function insidePolygon( points, x, y ) {

	let inside = false;
	for ( let i = 0, n = points.length, j = n - 1; i < n; j = i ++ ) {

		const [ xi, yi ] = points[ i ], [ xj, yj ] = points[ j ];
		if ( ( yi > y ) !== ( yj > y ) && x < ( xj - xi ) * ( y - yi ) / ( yj - yi ) + xi ) inside = ! inside;

	}

	return inside;

}

// The nearest point of the outline to (x, y): [ x, y, distance, edge ] (edge: the index of the
// corner the edge it's on starts at).
export function nearestOnPolygon( points, x, y ) {

	let best = [ x, y, Infinity, 0 ];
	for ( let i = 0, n = points.length; i < n; i ++ ) {

		const [ ax, ay ] = points[ i ], [ bx, by ] = points[ ( i + 1 ) % n ];
		const dx = bx - ax, dy = by - ay;
		const square = dx * dx + dy * dy;
		const t = square > 0 ? Math.min( 1, Math.max( 0, ( ( x - ax ) * dx + ( y - ay ) * dy ) / square ) ) : 0;
		const px = ax + dx * t, py = ay + dy * t;
		const d = Math.hypot( x - px, y - py );
		if ( d < best[ 2 ] ) best = [ px, py, d, i ];

	}

	return best;

}

// How far inside the outline (x, y) is: positive inside, negative outside (m).
export function polygonDistance( points, x, y ) {

	const d = nearestOnPolygon( points, x, y )[ 2 ];
	return insidePolygon( points, x, y ) ? d : - d;

}

// (x, y), or the nearest point of the outline if it's outside.
export function clampToPolygon( points, x, y ) {

	if ( insidePolygon( points, x, y ) ) return [ x, y ];
	const [ px, py ] = nearestOnPolygon( points, x, y );
	return [ px, py ];

}

// The outline as triangles, by clipping ears: [ [ i, j, k ], ... ] indexes into points, each
// triangle going the same way round as the outline. Every corner of a simple polygon is used, and
// the triangles cover it exactly. Flat corners (in a straight line with their neighbours) are
// clipped last, so no triangle is a sliver if it can be helped.
export function triangulate( points ) {

	const n = points.length;
	if ( n < 3 ) return [];
	const turn = winding( points );
	const left = Array.from( { length: n }, ( _, i ) => i );
	const out = [];
	const cross = ( a, b, c ) => ( ( points[ b ][ 0 ] - points[ a ][ 0 ] ) * ( points[ c ][ 1 ] - points[ a ][ 1 ] ) - ( points[ b ][ 1 ] - points[ a ][ 1 ] ) * ( points[ c ][ 0 ] - points[ a ][ 0 ] ) ) * turn;
	const inTriangle = ( p, a, b, c ) => {

		const [ px, py ] = points[ p ];
		const s = ( u, v ) => ( ( points[ v ][ 0 ] - points[ u ][ 0 ] ) * ( py - points[ u ][ 1 ] ) - ( points[ v ][ 1 ] - points[ u ][ 1 ] ) * ( px - points[ u ][ 0 ] ) ) * turn;
		return s( a, b ) >= - 1e-12 && s( b, c ) >= - 1e-12 && s( c, a ) >= - 1e-12;

	};

	while ( left.length > 3 ) {

		const m = left.length;
		let ear = - 1;
		let best = - Infinity;
		for ( let i = 0; i < m; i ++ ) {

			const a = left[ ( i + m - 1 ) % m ], b = left[ i ], c = left[ ( i + 1 ) % m ];
			const area = cross( a, b, c );
			if ( area <= 1e-12 ) continue;
			let empty = true;
			for ( const p of left ) {

				if ( p === a || p === b || p === c ) continue;
				if ( inTriangle( p, a, b, c ) ) {

					empty = false;
					break;

				}

			}

			if ( ! empty ) continue;
			// The fattest ear (its smallest angle the largest), for even triangles.
			const quality = minAngle( points[ a ], points[ b ], points[ c ] );
			if ( quality > best ) {

				best = quality;
				ear = i;

			}

		}

		// No ear (a degenerate outline): clip the corner with the most room and carry on.
		if ( ear < 0 ) {

			let most = - Infinity;
			for ( let i = 0; i < m; i ++ ) {

				const area = cross( left[ ( i + m - 1 ) % m ], left[ i ], left[ ( i + 1 ) % m ] );
				if ( area > most ) {

					most = area;
					ear = i;

				}

			}

		}

		const a = left[ ( ear + m - 1 ) % m ], b = left[ ear ], c = left[ ( ear + 1 ) % m ];
		if ( cross( a, b, c ) > 1e-12 ) out.push( [ a, b, c ] );
		left.splice( ear, 1 );

	}

	if ( cross( left[ 0 ], left[ 1 ], left[ 2 ] ) > 1e-12 ) out.push( [ left[ 0 ], left[ 1 ], left[ 2 ] ] );
	return out;

}

function minAngle( a, b, c ) {

	const angle = ( p, q, r ) => {

		const ux = q[ 0 ] - p[ 0 ], uy = q[ 1 ] - p[ 1 ], vx = r[ 0 ] - p[ 0 ], vy = r[ 1 ] - p[ 1 ];
		return Math.atan2( Math.abs( ux * vy - uy * vx ), ux * vx + uy * vy );

	};
	return Math.min( angle( a, b, c ), angle( b, c, a ), angle( c, a, b ) );

}

// A convex polygon clipped to the rectangle x0..x1, y0..y1 (Sutherland and Hodgman): the part of
// it inside, convex too, or [] if none is.
export function clipToRect( points, x0, y0, x1, y1 ) {

	let out = points;
	const edges = [ [ 0, x0, 1 ], [ 0, x1, - 1 ], [ 1, y0, 1 ], [ 1, y1, - 1 ] ];
	for ( const [ axis, at, sign ] of edges ) {

		if ( out.length === 0 ) break;
		const input = out;
		out = [];
		for ( let i = 0; i < input.length; i ++ ) {

			const p = input[ i ], q = input[ ( i + 1 ) % input.length ];
			const pin = ( p[ axis ] - at ) * sign >= 0, qin = ( q[ axis ] - at ) * sign >= 0;
			if ( pin ) out.push( p );
			if ( pin !== qin ) {

				const t = ( at - p[ axis ] ) / ( q[ axis ] - p[ axis ] );
				out.push( [ p[ 0 ] + ( q[ 0 ] - p[ 0 ] ) * t, p[ 1 ] + ( q[ 1 ] - p[ 1 ] ) * t ] );

			}

		}

	}

	return out;

}

// The outline cut into pieces no bigger than a grid's cells: its triangles (triangulate), each
// clipped to every cell of a grid `cell` m apart (lined up on 0) that it reaches, as [ [ x, y ], ...
// ] triangles going the same way round as the outline. A surface laid over them can follow a shape
// that bends inside the outline (a graded area's), and still end exactly at its edge.
export function gridTriangles( points, cell ) {

	const out = [];
	const turn = winding( points );
	for ( const [ a, b, c ] of triangulate( points ) ) {

		const tri = [ points[ a ], points[ b ], points[ c ] ].map( p => [ p[ 0 ], p[ 1 ] ] );
		const { minX, maxX, minY, maxY } = polygonBounds( tri );
		for ( let i = Math.floor( minX / cell ); i * cell < maxX; i ++ ) for ( let j = Math.floor( minY / cell ); j * cell < maxY; j ++ ) {

			const piece = clipToRect( tri, i * cell, j * cell, ( i + 1 ) * cell, ( j + 1 ) * cell );
			if ( piece.length < 3 || polygonArea( piece ) < 1e-8 ) continue;
			// A convex piece: a fan from its first corner, kept the outline's way round.
			const ordered = winding( piece ) === turn ? piece : [ ...piece ].reverse();
			for ( let k = 1; k < ordered.length - 1; k ++ ) out.push( [ ordered[ 0 ], ordered[ k ], ordered[ k + 1 ] ] );

		}

	}

	return out;

}

// The outline moved `inset` m inwards along each edge (corners mitred, but never further than
// four times the inset from where they were, so a sharp corner doesn't shoot out).
export function insetPolygon( points, inset ) {

	const n = points.length;
	const turn = winding( points );
	return points.map( ( p, i ) => {

		const prev = points[ ( i + n - 1 ) % n ], next = points[ ( i + 1 ) % n ];
		// The inward normals of the edges either side of this corner.
		const normal = ( a, b ) => {

			const dx = b[ 0 ] - a[ 0 ], dy = b[ 1 ] - a[ 1 ];
			const length = Math.hypot( dx, dy ) || 1;
			return [ - dy / length * turn, dx / length * turn ];

		};
		const n1 = normal( prev, p ), n2 = normal( p, next );
		const mx = n1[ 0 ] + n2[ 0 ], my = n1[ 1 ] + n2[ 1 ];
		const square = mx * mx + my * my;
		if ( square < 1e-9 ) return [ p[ 0 ] + n1[ 0 ] * inset, p[ 1 ] + n1[ 1 ] * inset ];
		// Along the bisector, as far as keeps both edges `inset` away.
		let scale = 2 * inset / square;
		const reach = scale * Math.sqrt( square );
		if ( reach > 4 * inset ) scale *= 4 * inset / reach;
		return [ p[ 0 ] + mx * scale, p[ 1 ] + my * scale ];

	} );

}
