import { Matrix4, Vector3 } from 'three';

// A city's ground (docs, "City Drive": scripts/make-city-terrain.py's <city>-terrain.bin): its real
// heights every few metres, so the city built flat by build.js can be laid over its hills (drape), and
// so the city can be put under Google's 3D map (hybrid.js) at the right height.

// { heightAt( east, north ), lowest, highest } from the file at `url` (metres east and north of the
// city's origin), or null if there's none.
export async function loadTerrain( url ) {

	const res = await fetch( url ).catch( () => null );
	if ( ! res?.ok ) return null;
	return parseTerrain( await res.arrayBuffer() );

}

export function parseTerrain( buffer ) {

	const [ west, south, step, columns, rows, lowest ] = new Float32Array( buffer, 0, 6 );
	const data = new Int16Array( buffer, 24, columns * rows );
	let highest = - Infinity;
	for ( const v of data ) highest = Math.max( highest, v );
	const at = ( i, j ) => lowest + data[ Math.min( rows - 1, Math.max( 0, j ) ) * columns + Math.min( columns - 1, Math.max( 0, i ) ) ] / 10;
	return {
		lowest,
		highest: lowest + highest / 10,
		// Bilinear between the four points round it; past the edge, the edge's.
		heightAt( east, north ) {

			const x = ( east - west ) / step;
			const y = ( north - south ) / step;
			const i = Math.floor( x );
			const j = Math.floor( y );
			const fx = Math.min( 1, Math.max( 0, x - i ) );
			const fy = Math.min( 1, Math.max( 0, y - j ) );
			return ( at( i, j ) * ( 1 - fx ) + at( i + 1, j ) * fx ) * ( 1 - fy ) + ( at( i, j + 1 ) * ( 1 - fx ) + at( i + 1, j + 1 ) * fx ) * fy;

		},
	};

}

const _v = new Vector3();
const _m = new Matrix4();

// Lays build.js's city (built on y = 0, x west, z north) over `terrain`: every point raised by the
// ground under it, but the sea, which stays level. Trees (instanced) are raised by the ground under
// each. Each geometry's bounds and the meshes' raycasting structures are made again after.
export function drape( group, terrain ) {

	group.traverse( object => {

		if ( object.name === 'water' ) return;
		if ( object.isInstancedMesh ) {

			for ( let i = 0; i < object.count; i ++ ) {

				object.getMatrixAt( i, _m );
				_v.setFromMatrixPosition( _m );
				_m.setPosition( _v.x, _v.y + terrain.heightAt( - _v.x, _v.z ), _v.z );
				object.setMatrixAt( i, _m );

			}

			object.instanceMatrix.needsUpdate = true;
			object.computeBoundingSphere?.();
			return;

		}

		const position = object.geometry?.attributes?.position;
		if ( ! position || object.userData.draped ) return;
		object.updateMatrix();
		for ( let i = 0; i < position.count; i ++ ) {

			// (The meshes are at the group's origin, unmoved: their points are in the city's frame.)
			position.setY( i, position.getY( i ) + terrain.heightAt( - position.getX( i ), position.getZ( i ) ) );

		}

		position.needsUpdate = true;
		object.geometry.computeVertexNormals();
		object.geometry.computeBoundingBox();
		object.geometry.computeBoundingSphere();
		object.geometry.boundsTree = null;
		object.userData.draped = true;

	} );

}
