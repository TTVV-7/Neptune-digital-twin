import { Vector4 } from 'three';
import { CELL } from './terrain.js';

// Straight walls behind shoring. The terrain is a grid of heights 0.5 m apart, so it draws a
// pit's vertical side as a steep face about 1 m wide centred on the side's line, which keeps the
// pit's volume. In a shored pit that face would stand in front of the shoring: soil up to half the
// depth at the foot of the trench box panels, and over the lower half of a sheet-piled wall. So
// where a side is shored, the terrain's vertex shader moves the nodes of that face onto the back
// of the shoring, those in the pit down to its floor (as far as it's dug) and those outside up to
// the rim: the wall goes straight up behind the shoring and the floor runs flat to it. Only the
// drawing changes. Volumes, walking, clicking and the mask over Google's tiles still use the face.
//
// Each side of a pit is given on its own (excavation-design.js numbers them: 1 front, 2 right,
// 3 back, 4 left), as a pit may be shored on some sides and sloped or stepped on the others. The
// terrain eases a vertical side across its line by multiplying whatever depth the other sides
// leave there (depthAt in excavation-design.js), so dividing by the nearest vertical side's easing
// gives back the depth as if that side were sharp: the floor, or the face of a slope or of benches
// that runs on up to a wall standing in its wing. A sloped or stepped side is never moved, and a
// wall next to one is shored only as far as that side's top edge, where the ground is still dug.

// Pits drawn this way at once; any more keep the steep face. Six vectors each: 192, inside the 256
// a vertex shader can always have (WebGL 2) with the material's own.
const MAX_PITS = 32;
const PER_PIT = 6;
// Nodes this far either side of a shored side's line are moved onto it: further than a cell's
// diagonal (0.71 m), so no triangle reaches from beyond the band on one side to the other.
const BAND = 0.75;
// A wall shored round a corner (another shored side beside it) takes in the corner's outside too,
// as far as the band goes.
export const CORNER_REACH = BAND + CELL;
// Where a side isn't vertical its line is put this far away, out of every test (1.0e9 in the
// shader too).
const FAR = 1e9;

const GLSL = /* glsl */`
uniform vec4 twinShore[ ${ MAX_PITS * PER_PIT } ];
uniform int twinShoreCount;

float twinShoreEase( float x ) {

	return smoothstep( - ${ CELL.toFixed( 3 ) }, ${ CELL.toFixed( 3 ) }, x );

}

// Moves a node (world position) onto the shored walls of a pit it's next to. True if the ground
// there is to be lit as flat: the node moved, or a neighbour of one did. The loop only finds the
// pit (most nodes are near none, and pass every pit in a few operations); the moving is done once,
// after it.
bool twinShoreNode( inout vec3 p ) {

	int pit = - 1;
	float u = 0.0;
	float v = 0.0;
	vec4 e = vec4( 0.0 );
	vec4 along = vec4( 0.0 );
	for ( int i = 0; i < ${ MAX_PITS }; i ++ ) {

		if ( i >= twinShoreCount ) break;
		// The centre, the square of the distance from it beyond which nothing is moved, and the rim;
		// the turn, and the half sizes of the middle, inside the band along every shored side, where
		// nothing is moved either; then for each side: where its line is from the centre (FAR if it
		// isn't vertical), how far behind the line the shoring's back is, and the stretch along the
		// side that's shored (from > to: none).
		vec4 a = twinShore[ ${ PER_PIT } * i ];
		vec2 d = p.xz - a.xy;
		if ( dot( d, d ) > a.z ) continue;
		vec4 b = twinShore[ ${ PER_PIT } * i + 1 ];
		// Across the width and along the length, as insideRect in terrain.js.
		float pu = - d.x * b.x - d.y * b.y;
		float pv = - d.x * b.y + d.y * b.x;
		if ( abs( pu ) < b.z && abs( pv ) < b.w ) continue;
		vec4 s1 = twinShore[ ${ PER_PIT } * i + 2 ];
		vec4 s2 = twinShore[ ${ PER_PIT } * i + 3 ];
		vec4 s3 = twinShore[ ${ PER_PIT } * i + 4 ];
		vec4 s4 = twinShore[ ${ PER_PIT } * i + 5 ];
		// How far in from each side's line (front, right, back, left), and whether it's along the
		// stretch that's shored.
		vec4 pe = vec4( s1.x - pv, s2.x - pu, s3.x + pv, s4.x + pu );
		vec4 t = vec4( pu, pv, pu, pv );
		vec4 on = step( vec4( s1.z, s2.z, s3.z, s4.z ), t ) * step( t, vec4( s1.w, s2.w, s3.w, s4.w ) );
		if ( dot( on * step( abs( pe ), vec4( ${ ( BAND + CELL ).toFixed( 3 ) } ) ), vec4( 1.0 ) ) == 0.0 ) continue;
		pit = i;
		u = pu;
		v = pv;
		e = pe;
		along = on;
		break;

	}

	if ( pit < 0 ) return false;
	vec4 snap = along * step( abs( e ), vec4( ${ BAND.toFixed( 3 ) } ) );
	if ( dot( snap, vec4( 1.0 ) ) == 0.0 ) return true;
	vec4 a = twinShore[ ${ PER_PIT } * pit ];
	vec4 b = twinShore[ ${ PER_PIT } * pit + 1 ];
	float rim = a.w;
	vec4 s1 = twinShore[ ${ PER_PIT } * pit + 2 ];
	vec4 s2 = twinShore[ ${ PER_PIT } * pit + 3 ];
	vec4 s3 = twinShore[ ${ PER_PIT } * pit + 4 ];
	vec4 s4 = twinShore[ ${ PER_PIT } * pit + 5 ];
	float inside = min( min( e.x, e.y ), min( e.z, e.w ) );
	if ( inside >= 0.0 ) {

		// In the pit. The face's height is the depth there eased across the nearest vertical side,
		// which gives that depth back; down to it, eased only across the vertical sides that aren't
		// shored here (an open end).
		float dug = ( rim - p.y ) / twinShoreEase( inside );
		vec4 open = mix( e, vec4( 1.0e9 ), snap );
		p.y = rim - dug * twinShoreEase( min( min( open.x, open.y ), min( open.z, open.w ) ) );

	} else p.y = max( p.y, rim );

	// Onto the back of the front or back side, and of the right or left (the nearer of a pair).
	if ( snap.x + snap.z > 0.0 ) v = snap.x > 0.0 && ( snap.z == 0.0 || abs( e.x ) <= abs( e.z ) ) ? s1.x + s1.y : - ( s3.x + s3.y );
	if ( snap.y + snap.w > 0.0 ) u = snap.y > 0.0 && ( snap.w == 0.0 || abs( e.y ) <= abs( e.w ) ) ? s2.x + s2.y : - ( s4.x + s4.y );
	p.xz = a.xy + vec2( - u * b.x - v * b.y, - u * b.y + v * b.x );
	return true;

}
`;

// Chains onto the terrain's surface material, as hideUnderEarthworks (terrain.js) does onto
// Google's. Returns set( pits ), with each pit as { east, north, heading, rim, sides }: sides in the
// order 1-4 (front, right, back, left), each { line, back, from, to }: line is how far the side's
// line is from the centre (null where it isn't vertical: sloped or stepped), back how far behind
// it the shoring's back is (negative: in front), from and to the stretch along it that's shored
// (u for the front and back, v for the right and left; null: not shored).
export function shoreTheGround( terrain ) {

	const material = terrain.material;
	const uniforms = {
		twinShore: { value: Array.from( { length: MAX_PITS * PER_PIT }, () => new Vector4() ) },
		twinShoreCount: { value: 0 },
	};
	const previous = material.onBeforeCompile;
	material.onBeforeCompile = ( shader, renderer ) => {

		previous?.call( material, shader, renderer );
		Object.assign( shader.uniforms, uniforms );
		// The terrain's chunks are placed in world units without turning or scaling, so a move in
		// the world is the same move in the mesh.
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', `#include <common>\n${ GLSL }` )
			.replace( '#include <beginnormal_vertex>', [
				'#include <beginnormal_vertex>',
				'vec3 twinShoreFrom = ( modelMatrix * vec4( position, 1.0 ) ).xyz;',
				'vec3 twinShoreTo = twinShoreFrom;',
				'if ( twinShoreNode( twinShoreTo ) ) objectNormal = vec3( 0.0, 1.0, 0.0 );',
			].join( '\n' ) )
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\ntransformed += twinShoreTo - twinShoreFrom;' );

	};
	const key = material.customProgramCacheKey.bind( material );
	material.customProgramCacheKey = () => `${ key() }+shoring`;
	material.needsUpdate = true;

	return {
		uniforms,
		set( pits ) {

			const values = uniforms.twinShore.value;
			const count = Math.min( pits.length, MAX_PITS );
			for ( let i = 0; i < count; i ++ ) {

				const { east, north, heading, rim, sides } = pits[ i ];
				const rad = heading * Math.PI / 180;
				const turn = [ Math.cos( rad ), Math.sin( rad ) ];
				// Across (u) and along (v), as far out as a node can be moved or lit flat, and as far as
				// the middle reaches without coming within the band of a shored side.
				const reach = [ 0, 0 ];
				const middle = [ FAR, FAR ];
				sides.forEach( ( { line, back, from, to }, n ) => {

					const shored = line !== null && from !== null && to !== null;
					values[ PER_PIT * i + 2 + n ].set( line ?? FAR, back ?? 0, shored ? from : 1, shored ? to : - 1 );
					if ( ! shored ) return;
					// Sides 1 and 3 (front and back) stand across v and run along u; 2 and 4 the other way.
					const out = line + Math.abs( back ) + CORNER_REACH;
					const ends = Math.max( Math.abs( from ), Math.abs( to ) );
					reach[ n % 2 ? 0 : 1 ] = Math.max( reach[ n % 2 ? 0 : 1 ], out );
					reach[ n % 2 ? 1 : 0 ] = Math.max( reach[ n % 2 ? 1 : 0 ], ends );
					middle[ n % 2 ? 0 : 1 ] = Math.min( middle[ n % 2 ? 0 : 1 ], line - CORNER_REACH - 0.01 );

				} );
				values[ PER_PIT * i ].set( - east, north, ( reach[ 0 ] ** 2 + reach[ 1 ] ** 2 ) * 1.01 + 1, rim );
				values[ PER_PIT * i + 1 ].set( ...turn, middle[ 0 ], middle[ 1 ] );

			}

			uniforms.twinShoreCount.value = count;

		},
	};

}
