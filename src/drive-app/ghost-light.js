// What makes a ghost's merged part light (docs/world-drive.md, "Challenges", "Racing one"), apart
// from three.js so the ghost-light worker (ghost-light-worker.js) runs it off the page's own thread:
// a part's triangles simplified with meshoptimizer's simplifier (or not, given none), then only the
// vertices still used kept, in the order they're first used. Plain typed arrays in and out.

// Each part simplified toward KEEP of its triangles, stopping where a place would move more than
// ERROR of the part's size (the pickup's body, 5.4 m: 2 cm, under which a panel's layers stay in
// their order) or its normals or pictures' places would change more than NORMAL_WEIGHT and
// UV_WEIGHT weigh them (a tyre's tread, finer than the triangles left, isn't stretched); so a part
// with fine detail keeps more. Parts under SIMPLE_FROM triangles are only merged.
const KEEP = 0.1;
const ERROR = 0.004;
const NORMAL_WEIGHT = 1;
const UV_WEIGHT = 16;
export const SIMPLE_FROM = 300;

// A merged part ({ positions: 3 a vertex, attributes: `stride` a vertex (its normal, and with `uv`
// its picture's place), index, count (vertices), uv, normaled, textured }) made light with
// `simplify` (meshoptimizer's MeshoptSimplifier, or null to only keep the vertices used): { place,
// facing, picture (or null), drawn (the index, 16-bit where it can be) }.
export function lightPart( simplify, { positions, attributes, index, count, uv, normaled, textured } ) {

	const stride = uv ? 5 : 3;
	const corners = index.length;
	let kept = index;
	if ( simplify && corners >= SIMPLE_FROM * 3 ) {

		const weights = [ NORMAL_WEIGHT, NORMAL_WEIGHT, NORMAL_WEIGHT, ...uv ? [ textured ? UV_WEIGHT : 0, textured ? UV_WEIGHT : 0 ] : [] ];
		[ kept ] = simplify.simplifyWithAttributes( index, positions, 3, attributes, stride, normaled ? weights : weights.map( () => 0 ), null, Math.floor( corners * KEEP / 3 ) * 3, ERROR );

	}

	// Only the vertices still used, in the order they're first used.
	const remap = new Int32Array( count ).fill( - 1 );
	let used = 0;
	for ( let k = 0; k < kept.length; k ++ ) if ( remap[ kept[ k ] ] < 0 ) remap[ kept[ k ] ] = used ++;
	const place = new Float32Array( used * 3 );
	const facing = new Float32Array( used * 3 );
	const picture = uv ? new Float32Array( used * 2 ) : null;
	for ( let v = 0; v < count; v ++ ) {

		const to = remap[ v ];
		if ( to < 0 ) continue;
		place.set( positions.subarray( v * 3, v * 3 + 3 ), to * 3 );
		facing.set( attributes.subarray( v * stride, v * stride + 3 ), to * 3 );
		if ( picture ) picture.set( attributes.subarray( v * stride + 3, v * stride + 5 ), to * 2 );

	}

	const drawn = used > 65535 ? new Uint32Array( kept.length ) : new Uint16Array( kept.length );
	for ( let k = 0; k < kept.length; k ++ ) drawn[ k ] = remap[ kept[ k ] ];
	return { place, facing, picture, drawn };

}
