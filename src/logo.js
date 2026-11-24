import { Box3, DoubleSide, Euler, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Raycaster, SRGBColorSpace, TextureLoader, Vector3 } from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { loadLibrary } from './library.js';

// World Drive Build Pro's company logo on the equipment: the account's logo (uploaded on the Build
// dashboard, worker/drive/build.js), or on a share link its owner's, laid on both sides of every
// placed vehicle, machine, trailer, container and bin, as a fleet's livery is. It's projected onto
// the model's own surface (DecalGeometry), so it follows a cab's or a tank's shape rather than
// floating in front of it. The Show panel's "Company logo" hides it, for this viewer only.

// The kinds of thing a company puts its name on.
const BRANDED = new Set( [
	'Vehicles', 'Heavy equipment', 'Cranes & lifts', 'Concrete & batching', 'Material handling',
	'Site trailers & containers', 'Power & air', 'Site services', 'Waste', 'Dewatering & water treatment',
] );
// The logo's widest side is at most this share of the item's length and this many metres, and its
// height at most this share of the item's height.
const ALONG = 0.45;
const MOST = 2.4;
const UP = 0.4;
// It's centred this far up the item (of its height), and stands this far off the surface (m), as
// paint is drawn over what's under it without fighting it for depth.
const HEIGHT_AT = 0.55;
const LIFT = 0.025;
// How deep a slice of the model the logo is cut from, round its outer surface (m).
const SLICE = 0.5;
const LAYER = 'company-logo';

export function setUpLogo( { models, layers, apiBase } ) {

	let texture = null;
	let aspect = 1;
	let material = null;
	let shown = true;
	let categories = null;
	const decals = new Map(); // entry -> [ meshes ]

	const token = new URL( window.location.href ).searchParams.get( 'view' );
	const url = new URL( token ? `${ apiBase }shared/${ encodeURIComponent( token ) }/logo` : `${ apiBase }logo`, window.location.href );

	( async () => {

		const res = await fetch( url, { credentials: 'same-origin' } ).catch( () => null );
		if ( ! res?.ok ) return;
		const blob = await res.blob();
		const objectUrl = URL.createObjectURL( blob );
		texture = await new TextureLoader().loadAsync( objectUrl ).catch( () => null );
		URL.revokeObjectURL( objectUrl );
		if ( ! texture ) return;
		texture.colorSpace = SRGBColorSpace;
		texture.anisotropy = 4;
		aspect = texture.image.width / Math.max( 1, texture.image.height );
		material = new MeshStandardMaterial( { map: texture, transparent: true, alphaTest: 0.02, roughness: 0.6, depthWrite: false, side: DoubleSide } );
		material.userData.shared = true;
		categories = new Map( ( await loadLibrary() ).map( item => [ item.id, item.category ] ) );
		layers?.addLayer( LAYER, { name: 'Company logo', count: () => decals.size, setShown: on => {

			shown = on;
			for ( const { meshes } of decals.values() ) for ( const mesh of meshes ) mesh.visible = on;

		} } );
		for ( const entry of models.entries ) brand( entry );
		models.addEventListener( 'add', ( { entry } ) => brand( entry ) );
		// Put down (placing ends with a change) or rebuilt: branded once, again if its model changed.
		models.addEventListener( 'change', ( { entry } ) => {

			if ( ! decals.has( entry ) || entry.pivot.children[ 0 ] !== decals.get( entry ).content ) brand( entry );

		} );
		models.addEventListener( 'remove', ( { entry } ) => unbrand( entry ) );
		layers?.update();

	} )();

	function unbrand( entry ) {

		for ( const mesh of decals.get( entry )?.meshes ?? [] ) {

			mesh.removeFromParent();
			mesh.geometry.dispose();

		}

		decals.delete( entry );

	}

	// Both sides of the item: its length runs along the pivot's z (its heading), so its sides face
	// ±x. Each decal is cut from the meshes it overlaps, in the scene, then kept in the pivot.
	function brand( entry ) {

		unbrand( entry );
		if ( ! material || entry.kind || entry.placing || ! BRANDED.has( categories.get( entry.library ) ) ) return;
		const content = entry.pivot.children[ 0 ];
		if ( ! content ) return;
		entry.pivot.updateMatrixWorld( true );
		const toPivot = new Matrix4().copy( entry.pivot.matrixWorld ).invert();
		const box = new Box3();
		const targets = [];
		content.traverse( o => {

			if ( ! o.isMesh || o.isInstancedMesh || ! o.geometry?.attributes.position ) return;
			targets.push( o );
			o.geometry.boundingBox ?? o.geometry.computeBoundingBox();
			box.union( o.geometry.boundingBox.clone().applyMatrix4( new Matrix4().multiplyMatrices( toPivot, o.matrixWorld ) ) );

		} );
		if ( box.isEmpty() ) return;
		// Its two long sides: ±x when it runs along its heading (z), as vehicles do, else ±z (an
		// office trailer modelled side-on).
		const alongZ = box.max.z - box.min.z >= box.max.x - box.min.x;
		const length = alongZ ? box.max.z - box.min.z : box.max.x - box.min.x;
		const width = alongZ ? box.max.x - box.min.x : box.max.z - box.min.z;
		const height = box.max.y - box.min.y;
		let w = Math.min( length * ALONG, MOST );
		let h = w / aspect;
		if ( h > height * UP ) {

			h = height * UP;
			w = h * aspect;

		}

		const meshes = [];
		const quaternion = new Quaternion();
		entry.pivot.getWorldQuaternion( quaternion );
		const middle = box.getCenter( new Vector3() );
		const y = box.min.y + height * HEIGHT_AT;
		const raycaster = new Raycaster();
		for ( const side of [ 1, - 1 ] ) {

			// Where this side's outer surface is, by a ray in from outside at the logo's middle: the
			// logo is cut from a thin slice there, not from what's behind it (a dump body's floor, a
			// cab's seats).
			const outward = alongZ ? new Vector3( side, 0, 0 ) : new Vector3( 0, 0, side );
			const start = alongZ ? new Vector3( side > 0 ? box.max.x + 1 : box.min.x - 1, y, middle.z ) : new Vector3( middle.x, y, side > 0 ? box.max.z + 1 : box.min.z - 1 );
			const worldOut = outward.clone().transformDirection( entry.pivot.matrixWorld );
			raycaster.set( start.applyMatrix4( entry.pivot.matrixWorld ), worldOut.clone().negate() );
			raycaster.far = width + 2;
			const hit = raycaster.intersectObjects( targets, false )[ 0 ];
			if ( ! hit ) continue;
			const position = hit.point;
			// The projector's z points out of this side, so the logo reads the right way from outside.
			const turn = new Quaternion().setFromAxisAngle( new Vector3( 0, 1, 0 ), alongZ ? side * Math.PI / 2 : ( side > 0 ? 0 : Math.PI ) );
			const orientation = new Euler().setFromQuaternion( quaternion.clone().multiply( turn ) );
			const size = new Vector3( w, h, SLICE );
			for ( const target of targets ) {

				const geometry = new DecalGeometry( target, position, orientation, size );
				if ( geometry.attributes.position.count === 0 ) {

					geometry.dispose();
					continue;

				}

				// Into the pivot's frame, and lifted outward off the surface (some models' normals
				// point in, so not along those).
				geometry.applyMatrix4( toPivot );
				geometry.translate( outward.x * LIFT, 0, outward.z * LIFT );
				const mesh = new Mesh( geometry, material );
				mesh.name = 'Company logo';
				mesh.renderOrder = 2;
				mesh.raycast = () => {};
				mesh.userData.noCollide = true;
				mesh.visible = shown;
				entry.pivot.add( mesh );
				meshes.push( mesh );

			}

		}

		decals.set( entry, { meshes, content } );

	}

}
