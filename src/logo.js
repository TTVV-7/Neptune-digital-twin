import { Box3, DoubleSide, Euler, Matrix4, Mesh, MeshStandardMaterial, Raycaster, SRGBColorSpace, TextureLoader, Vector3 } from 'three';
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
// It stands this far off the surface (m), as paint is drawn over what's under it without fighting
// it for depth.
const LIFT = 0.025;
// How deep a slice of the model the logo is cut from, round its outer surface (m).
const SLICE = 0.3;
// Where the logo is looked for: centres at these shares of the side's length and height, a grid of
// GRID × GRID rays each; the rays have to land within FLAT metres of each other on one mesh, facing
// out of the side within SQUARE (the cosine); and it shrinks to MIN_SIZE (m wide) to fit.
const ALONG_AT = [ 0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8 ];
const HEIGHT_AT = [ 0.55, 0.45, 0.65, 0.35, 0.75 ];
const GRID = 4;
const FLAT = 0.12;
const SQUARE = 0.8;
const MIN_SIZE = 0.5;
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
		const raycaster = new Raycaster();
		raycaster.far = width + 2;
		// Pivot-frame point → world, and the outward way for each side.
		const toWorld = v => v.applyMatrix4( entry.pivot.matrixWorld );
		const at = ( side, a, y, out = 1 ) => alongZ
			? new Vector3( side > 0 ? box.max.x + out : box.min.x - out, y, a )
			: new Vector3( a, y, side > 0 ? box.max.z + out : box.min.z - out );
		const a0 = alongZ ? box.min.z : box.min.x;
		for ( const side of [ 1, - 1 ] ) {

			const outward = alongZ ? new Vector3( side, 0, 0 ) : new Vector3( 0, 0, side );
			const worldIn = outward.clone().transformDirection( entry.pivot.matrixWorld ).negate();
			const spot = flatSpot( side );
			if ( ! spot ) continue;
			// Square to the panel it's on: facing along the panel's normal, upright.
			const normal = spot.normal.clone().projectOnPlane( new Vector3( 0, 1, 0 ) ).normalize();
			if ( normal.lengthSq() < 0.5 ) continue;
			const yaw = Math.atan2( normal.x, normal.z );
			const orientation = new Euler( 0, yaw, 0, 'YXZ' );
			const geometry = new DecalGeometry( spot.mesh, spot.point, orientation, new Vector3( spot.w, spot.h, SLICE ) );
			if ( geometry.attributes.position.count === 0 ) {

				geometry.dispose();
				continue;

			}

			// Into the pivot's frame, and lifted outward off the panel (some models' normals point
			// in, so not along those).
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

			// The flattest place on this side for the logo, as large as fits (down to MIN_SIZE):
			// candidate centres along and up the side, each tried with a grid of rays over the logo's
			// rectangle; a spot counts when the rays land on one mesh, close to one plane, square to
			// the side. { mesh, point, normal (world, facing out), w, h } or null.
			function flatSpot( side ) {

				for ( let size = 1; size * w >= MIN_SIZE; size *= 0.75 ) {

					const sw = w * size, sh = h * size;
					let best = null;
					for ( const t of ALONG_AT ) for ( const u of HEIGHT_AT ) {

						const a = a0 + length * t;
						const y = box.min.y + height * u;
						if ( a - sw / 2 < a0 || a + sw / 2 > a0 + length || y - sh / 2 < box.min.y || y + sh / 2 > box.max.y ) continue;
						const found = probe( side, a, y, sw, sh );
						if ( found && ( ! best || found.score > best.score ) ) best = { ...found, w: sw, h: sh };

					}

					if ( best ) return best;

				}

				return null;

			}

			// The rays over a sw × sh rectangle centred at (a, y): the panel they agree on, or null.
			function probe( side, a, y, sw, sh ) {

				const hits = [];
				for ( let i = 0; i < GRID; i ++ ) for ( let j = 0; j < GRID; j ++ ) {

					const da = ( i / ( GRID - 1 ) - 0.5 ) * sw * 0.95;
					const dy = ( j / ( GRID - 1 ) - 0.5 ) * sh * 0.95;
					raycaster.set( toWorld( at( side, a + da, y + dy ) ), worldIn );
					const hit = raycaster.intersectObjects( targets, false )[ 0 ];
					if ( ! hit?.face ) return null;
					hits.push( hit );

				}

				const mesh = hits[ Math.floor( hits.length / 2 ) ].object;
				if ( hits.some( hit => hit.object !== mesh ) ) return null;
				const distances = hits.map( hit => hit.distance ).sort( ( p, q ) => p - q );
				const spread = distances[ distances.length - 1 ] - distances[ 0 ];
				if ( spread > FLAT ) return null;
				const centre = hits[ Math.floor( hits.length / 2 ) ];
				const normal = centre.face.normal.clone().transformDirection( centre.object.matrixWorld );
				// Facing out of this side, whichever way the model's own normals point.
				if ( normal.dot( worldIn ) > 0 ) normal.negate();
				if ( - normal.dot( worldIn ) < SQUARE ) return null;
				// Nearest the side's outside and flattest wins: a door over a step behind it.
				return { mesh, point: centre.point.clone(), normal, score: - spread - distances[ 0 ] * 0.05 };

			}

		}

		decals.set( entry, { meshes, content } );

	}

}
