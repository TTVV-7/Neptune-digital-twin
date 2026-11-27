import { BoxGeometry, CanvasTexture, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three';
import { BLACK, FT, STEEL } from './parts.js';

// The 10 x 6 ft temporary chain-link fence panel on rubber feet: the library's fence panel
// (procedural.js) and the panels of a fenced flatten area (flatten.js). Kept apart from the rest of
// the built-in models so flatten.js (which tests run in Node) needn't load them all.

function box( parent, material, [ sx, sy, sz ], [ x0 = 0, y0 = 0, z0 = 0 ] = [] ) {

	const mesh = new Mesh( new BoxGeometry( sx, sy, sz ), material );
	mesh.position.set( x0, y0 + sy / 2, z0 );
	parent.add( mesh );
	return mesh;

}

function cylinder( parent, material, radius, height, [ x0 = 0, y0 = 0, z0 = 0 ] = [], segments = 16 ) {

	const mesh = new Mesh( new CylinderGeometry( radius, radius, height, segments ), material );
	mesh.position.set( x0, y0 + height / 2, z0 );
	parent.add( mesh );
	return mesh;

}

let chainLinkMaterial;
export function chainLink() {

	if ( ! chainLinkMaterial ) {

		// The wire covers about a fifth of the panel, so with ordinary mipmaps its alpha fades away a
		// few metres off and only the frame is left. Each smaller level is drawn by hand instead,
		// with wire at least a pixel wide, so further away the mesh becomes a see-through haze.
		const levels = [];
		for ( let size = 64; size >= 1; size /= 2 ) {

			const canvas = document.createElement( 'canvas' );
			canvas.width = canvas.height = size;
			const ctx = canvas.getContext( '2d' );
			if ( size >= 4 ) {

				ctx.strokeStyle = '#c9ced2';
				ctx.lineWidth = Math.max( 5 * size / 64, 1 );
				ctx.beginPath();
				ctx.moveTo( 0, 0 );
				ctx.lineTo( size, size );
				ctx.moveTo( size, 0 );
				ctx.lineTo( 0, size );
				ctx.stroke();

			} else {

				ctx.fillStyle = 'rgba( 201, 206, 210, 0.45 )';
				ctx.fillRect( 0, 0, size, size );

			}

			levels.push( canvas );

		}

		const texture = new CanvasTexture( levels[ 0 ] );
		texture.mipmaps = levels;
		texture.generateMipmaps = false;
		texture.colorSpace = SRGBColorSpace;
		texture.wrapS = texture.wrapT = RepeatWrapping;
		texture.repeat.set( 10 * FT / 0.06, 6 * FT / 0.06 );
		// Blended, so the haze is see-through; the alpha test keeps the gaps out of the depth buffer.
		chainLinkMaterial = new MeshStandardMaterial( { map: texture, transparent: true, alphaTest: 0.01, side: DoubleSide, metalness: 0.6, roughness: 0.5 } );
		chainLinkMaterial.userData.shared = true;

	}

	return chainLinkMaterial;

}

export function fencePanel() {

	const group = new Group();
	const width = 10 * FT;
	const height = 6 * FT;
	const lift = 0.08;
	const mesh = new Mesh( new BoxGeometry( width, height, 0.005 ), chainLink() );
	mesh.position.set( 0, lift + height / 2, 0 );
	group.add( mesh );

	// Tube frame.
	const tube = STEEL();
	for ( const x of [ - width / 2, width / 2 ] ) cylinder( group, tube, 0.02, height, [ x, lift, 0 ], 8 );
	for ( const y of [ lift, lift + height ] ) {

		const rail = cylinder( group, tube, 0.02, width, [ 0, 0, 0 ], 8 );
		rail.rotation.z = Math.PI / 2;
		rail.position.set( 0, y, 0 );

	}

	// Rubber feet at both ends.
	for ( const x of [ - width / 2, width / 2 ] ) box( group, BLACK(), [ 0.2, 0.12, 0.6 ], [ x, 0, 0 ] );
	return group;

}

