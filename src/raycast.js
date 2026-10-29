import { Sphere } from 'three';
import { acceleratedRaycast, computeBoundsTree } from 'three-mesh-bvh';

const _sphere = new Sphere();

// Walking, collisions and snapping cast several rays a frame. Without help each ray tests every
// triangle of every tile or model it passes near (hundreds of thousands on Google tiles). This
// gives each mesh a bounding volume hierarchy the first time a ray reaches it, so only the
// meshes the player actually walks near pay the cost of building one.
export function useFastRaycast( root ) {

	root.traverse( object => {

		if ( object.isMesh ) object.raycast = lazyBvhRaycast;

	} );

}

function lazyBvhRaycast( raycaster, intersects ) {

	const { geometry } = this;
	if ( ! geometry.boundsTree ) {

		if ( geometry.boundingSphere === null ) geometry.computeBoundingSphere();
		_sphere.copy( geometry.boundingSphere ).applyMatrix4( this.matrixWorld );
		if ( ! raycaster.ray.intersectsSphere( _sphere ) ) return;
		computeBoundsTree.call( geometry );

	}

	acceleratedRaycast.call( this, raycaster, intersects );

}
