import { Vector4 } from 'three';
import { CELL } from './terrain.js';

// Straight walls behind shoring. The terrain is a grid of heights 0.5 m apart, so it draws a
// pit's vertical side as a steep face about 1 m wide centred on the outline, which keeps the pit's
// volume width x length x depth. In a shored pit that face would stand in front of the shoring:
// soil up to half the depth at the foot of the trench box panels, and over the lower half of a
// sheet-piled wall. So where a wall is shored, the terrain's vertex shader moves the nodes of that
// face onto the back of the shoring, those in the pit down to its floor (as far as it's dug) and
// those outside up to the rim: the wall goes straight up behind the shoring and the floor runs
// flat to it. Only the drawing changes. Volumes, walking, clicking and the mask over Google's
// tiles still use the face.

// Pits drawn this way at once; any more keep the steep face. Three vectors each, well inside the
// 256 a vertex shader can always have.
const MAX_PITS = 32;
// Nodes this far either side of a shored wall are moved onto it: further than a cell's diagonal
// (0.71 m), so no triangle reaches from beyond the band on one side to the other.
const BAND = 0.75;

const GLSL = /* glsl */`
uniform vec4 twinShore[ ${ MAX_PITS * 3 } ];
uniform int twinShoreCount;

// Moves a node (world position) onto the shored walls of a pit it's next to. True if the ground
// there is to be lit as flat: the node moved, or a neighbour of one did.
bool twinShoreNode( inout vec3 p ) {

	for ( int i = 0; i < ${ MAX_PITS }; i ++ ) {

		if ( i >= twinShoreCount ) break;
		// Centre and turn; half width, half length, rim and how far behind the outline the
		// shoring's back is; how far along the x walls (width) and z walls (length) it's shored
		// from the middle (negative: not at all).
		vec4 a = twinShore[ 3 * i ];
		vec4 b = twinShore[ 3 * i + 1 ];
		vec4 c = twinShore[ 3 * i + 2 ];
		vec2 d = p.xz - a.xy;
		// Across the width and along the length, as insideRect in terrain.js.
		float u = - d.x * a.z - d.y * a.w;
		float v = - d.x * a.w + d.y * a.z;
		float su = b.x - abs( u );
		float sv = b.y - abs( v );
		bool nearU = c.x >= 0.0 && abs( v ) <= c.x && abs( su ) <= ${ ( BAND + CELL ).toFixed( 3 ) };
		bool nearV = c.y >= 0.0 && abs( u ) <= c.y && abs( sv ) <= ${ ( BAND + CELL ).toFixed( 3 ) };
		if ( ! nearU && ! nearV ) continue;
		bool snapU = nearU && abs( su ) <= ${ BAND.toFixed( 3 ) };
		bool snapV = nearV && abs( sv ) <= ${ BAND.toFixed( 3 ) };
		if ( ! snapU && ! snapV ) return true;
		float rim = b.z;
		float inside = min( su, sv );
		if ( inside >= 0.0 ) {

			// In the pit. The face's height is the depth dug so far eased across it (pitSurface in
			// earthworks.js), which gives that depth back; down to it, or where an end isn't
			// shored, to that end's face.
			float dug = ( rim - p.y ) / smoothstep( - ${ CELL.toFixed( 3 ) }, ${ CELL.toFixed( 3 ) }, inside );
			float rest = 1e9;
			if ( ! snapU ) rest = min( rest, su );
			if ( ! snapV ) rest = min( rest, sv );
			p.y = rim - dug * smoothstep( - ${ CELL.toFixed( 3 ) }, ${ CELL.toFixed( 3 ) }, rest );

		} else p.y = max( p.y, rim );

		if ( snapU ) u = ( u < 0.0 ? - 1.0 : 1.0 ) * ( b.x + b.w );
		if ( snapV ) v = ( v < 0.0 ? - 1.0 : 1.0 ) * ( b.y + b.w );
		p.xz = a.xy + vec2( - u * a.z - v * a.w, - u * a.w + v * a.z );
		return true;

	}

	return false;

}
`;

// Chains onto the terrain's surface material, as hideUnderEarthworks (terrain.js) does onto
// Google's. Returns set( pits ), with each pit as { east, north, heading, width, length, rim, back,
// alongWidth, alongLength }: back is how far outside the outline the shoring's back is (negative:
// inside), alongWidth / alongLength how far from the middle the walls running along the width /
// the length are shored (Infinity: all the way and round the corners; null: not at all).
export function shoreTheGround( terrain ) {

	const material = terrain.material;
	const uniforms = {
		twinShore: { value: Array.from( { length: MAX_PITS * 3 }, () => new Vector4() ) },
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

				const { east, north, heading, width, length, rim, back, alongWidth, alongLength } = pits[ i ];
				const rad = heading * Math.PI / 180;
				values[ 3 * i ].set( - east, north, Math.cos( rad ), Math.sin( rad ) );
				values[ 3 * i + 1 ].set( width / 2, length / 2, rim, back );
				// The walls running along the length stand at the ends of the width (u in the shader).
				// Shored all the way, they take in the corners' outsides too, as far as the band goes.
				const reach = ( along, half ) => along === null || along === undefined ? - 1 : Math.min( along, half + BAND + CELL );
				values[ 3 * i + 2 ].set( reach( alongLength, length / 2 ), reach( alongWidth, width / 2 ), 0, 0 );

			}

			uniforms.twinShoreCount.value = count;

		},
	};

}
