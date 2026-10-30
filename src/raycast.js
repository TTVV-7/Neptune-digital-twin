import { BufferAttribute, BufferGeometry, Matrix4, Ray, Sphere, Vector3 } from 'three';
import { acceleratedRaycast, computeBoundsTree, MeshBVH } from 'three-mesh-bvh';

const _sphere = new Sphere();
const _ray = new Ray();
const _point = new Vector3();
const _inverse = new Matrix4();

// Walking, collisions and snapping cast several rays a frame. Without help each ray tests every
// triangle of every tile or model it passes near (hundreds of thousands on Google tiles). This
// gives each mesh a bounding volume hierarchy the first time a ray reaches it, so only the
// meshes the player actually walks near pay the cost of building one.
export function useFastRaycast( root ) {

	root.traverse( object => {

		if ( object.isSkinnedMesh ) object.raycast = posedBvhRaycast;
		else if ( object.isMesh ) object.raycast = lazyBvhRaycast;

	} );

}

// Rigged (skinned) models stand in the pose they were loaded in, as nothing here animates them, so
// the first ray to reach one bakes that pose into a plain copy of its triangles, in its own frame,
// with a hierarchy of its own. Left to three.js, every ray poses every vertex: 25 ms a ray on the
// pickup truck, which the driving, walking and flying collision rays pass near many times a frame.
function posedBvhRaycast( raycaster, intersects ) {

	let posed = this.userData.posed;
	if ( ! posed ) {

		if ( this.boundingSphere === null ) this.computeBoundingSphere();
		_sphere.copy( this.boundingSphere ).applyMatrix4( this.matrixWorld );
		if ( ! reaches( raycaster, _sphere ) ) return;
		posed = this.userData.posed = posedCopy( this );

	}

	_sphere.copy( posed.boundingSphere ).applyMatrix4( this.matrixWorld );
	if ( reaches( raycaster, _sphere ) ) posed.boundsTree.raycastObject3D( this, raycaster, intersects );

}

function posedCopy( mesh ) {

	// The bones' world matrices must be current, e.g. for a model loaded this frame.
	let top = mesh;
	while ( top.parent && ! top.parent.isScene ) top = top.parent;
	top.updateMatrixWorld( true );

	const { geometry } = mesh;
	const { count } = geometry.attributes.position;
	const positions = new Float32Array( count * 3 );
	for ( let i = 0; i < count; i ++ ) mesh.getVertexPosition( i, _point ).toArray( positions, i * 3 );
	const posed = new BufferGeometry();
	posed.setAttribute( 'position', new BufferAttribute( positions, 3 ) );
	// Building the hierarchy reorders the index, so it gets its own.
	if ( geometry.index ) posed.setIndex( geometry.index.clone() );
	for ( const { start, count, materialIndex } of geometry.groups ) posed.addGroup( start, count, materialIndex );
	posed.computeBoundingSphere();
	posed.boundsTree = new MeshBVH( posed );
	return posed;

}

function lazyBvhRaycast( raycaster, intersects ) {

	const { geometry } = this;
	const { position } = geometry.attributes;
	if ( geometry.boundsTree && geometry.userData.bvhVersion !== position.version ) {

		// The vertices moved (a flatten zone pressed this tile down): update the hierarchy.
		geometry.computeBoundingSphere();
		geometry.computeBoundingBox();
		geometry.boundsTree.refit();
		geometry.userData.bvhVersion = position.version;

	}

	// Most meshes are out of reach of the short rays that collisions cast, and only need this
	// cheap test: no hierarchy is built for a tile a ray merely points at from far away.
	if ( geometry.boundingSphere === null ) geometry.computeBoundingSphere();
	_sphere.copy( geometry.boundingSphere ).applyMatrix4( this.matrixWorld );
	if ( ! reaches( raycaster, _sphere ) ) return;

	if ( ! geometry.boundsTree ) {

		// A tile is flat, so its box fits far closer than its sphere: a camera flying over it is
		// inside the sphere but well above the box, and needn't build a hierarchy for it yet.
		if ( geometry.boundingBox === null || geometry.userData.boxVersion !== position.version ) {

			// Flatten zones move a tile's vertices, and may move them back.
			geometry.computeBoundingBox();
			geometry.userData.boxVersion = position.version;

		}

		_ray.copy( raycaster.ray ).applyMatrix4( _inverse.copy( this.matrixWorld ).invert() );
		if ( ! geometry.boundingBox.containsPoint( _ray.origin ) ) {

			if ( _ray.intersectBox( geometry.boundingBox, _point ) === null ) return;
			if ( _point.applyMatrix4( this.matrixWorld ).distanceTo( raycaster.ray.origin ) > raycaster.far ) return;

		}

		computeBoundsTree.call( geometry );
		geometry.userData.bvhVersion = position.version;

	}

	acceleratedRaycast.call( this, raycaster, intersects );

}

// Whether the ray comes within its length of the sphere, as three.js's own Mesh.raycast checks.
function reaches( raycaster, sphere ) {

	_ray.copy( raycaster.ray ).recast( raycaster.near );
	if ( sphere.containsPoint( _ray.origin ) ) return true;
	return _ray.intersectSphere( sphere, _point ) !== null && _ray.origin.distanceToSquared( _point ) <= ( raycaster.far - raycaster.near ) ** 2;

}
