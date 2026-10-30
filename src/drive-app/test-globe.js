import { CanvasTexture, Group, MathUtils, Matrix4, Mesh, MeshBasicMaterial, SphereGeometry, SRGBColorSpace } from 'three';
import { OBJECT_FRAME, WGS84_ELLIPSOID } from '3d-tiles-renderer';

// The Earth without Google's tiles (no Maps key: the dev server on its own, or the test pad when
// maps are off): an ocean-blue ellipsoid the size of the Earth with a line every 15°, so the
// globe, pins, flights and drop-ins all work for testing.

const _m = new Matrix4();

export function createTestGlobe() {

	const canvas = document.createElement( 'canvas' );
	canvas.width = 2048;
	canvas.height = 1024;
	const ctx = canvas.getContext( '2d' );
	const sea = ctx.createLinearGradient( 0, 0, 0, canvas.height );
	sea.addColorStop( 0, '#cfe8ff' );
	sea.addColorStop( 0.12, '#1d6fb8' );
	sea.addColorStop( 0.5, '#155a9c' );
	sea.addColorStop( 0.88, '#1d6fb8' );
	sea.addColorStop( 1, '#e6f2ff' );
	ctx.fillStyle = sea;
	ctx.fillRect( 0, 0, canvas.width, canvas.height );
	ctx.strokeStyle = 'rgba( 255, 255, 255, 0.35 )';
	for ( let deg = 15; deg < 360; deg += 15 ) {

		const x = deg / 360 * canvas.width;
		const y = deg / 180 * canvas.height;
		ctx.lineWidth = deg === 180 ? 4 : 2;
		ctx.beginPath();
		ctx.moveTo( x, 0 );
		ctx.lineTo( x, canvas.height );
		if ( deg < 180 ) {

			ctx.lineWidth = deg === 90 ? 4 : 2;
			ctx.moveTo( 0, y );
			ctx.lineTo( canvas.width, y );

		}

		ctx.stroke();

	}

	const texture = new CanvasTexture( canvas );
	texture.colorSpace = SRGBColorSpace;
	const { x, y, z } = WGS84_ELLIPSOID.radius;
	const mesh = new Mesh( new SphereGeometry( 1, 256, 128 ), new MeshBasicMaterial( { map: texture } ) );
	// three.js puts a sphere's poles on Y; the Earth's frame has them on Z. Its texture then runs
	// from longitude -180° to 180° as maps do.
	mesh.rotation.x = Math.PI / 2;
	mesh.scale.set( x, z, y );
	mesh.name = 'test-earth';

	const group = new Group();
	group.name = 'test-globe';
	group.add( mesh );
	return { group, mesh, ellipsoid: WGS84_ELLIPSOID };

}

// Centre `earth` on a place as ReorientationPlugin centres Google's tiles: the place at the
// origin, up +Y, north +Z, west +X (degrees, and metres above the ellipsoid).
export function placeEarth( earth, ellipsoid, { lat, lon, height = 0 } ) {

	ellipsoid.getObjectFrame( lat * MathUtils.DEG2RAD, lon * MathUtils.DEG2RAD, height, 0, 0, 0, _m, OBJECT_FRAME );
	_m.invert().decompose( earth.position, earth.quaternion, earth.scale );
	earth.updateMatrixWorld( true );

}
