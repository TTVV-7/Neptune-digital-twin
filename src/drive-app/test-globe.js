import { CanvasTexture, Euler, Group, MathUtils, Matrix4, Mesh, MeshBasicMaterial, SphereGeometry, SRGBColorSpace, Vector3 } from 'three';
import { OBJECT_FRAME, WGS84_ELLIPSOID } from '3d-tiles-renderer';
import { levelFrame } from './level.js';

// The Earth without Google's tiles (no Maps key: the dev server on its own, or the test pad when
// maps are off): an ocean-blue ellipsoid the size of the Earth with a line every 15°, so the
// globe, pins, flights and drop-ins all work for testing.

const _m = new Matrix4();
const _east = new Vector3();
const _north = new Vector3();
const _up = new Vector3();
// An object's frame from east, north and up, as 3d-tiles-renderer turns its OBJECT_FRAME (+Y up, +Z
// north, +X west).
const OBJECT_TURN = new Matrix4().makeRotationFromEuler( new Euler( - Math.PI / 2, 0, Math.PI, 'XYZ' ) );

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

// The same for a small world far from round (level.js's `level`): the place at the origin, north +Z
// and west +X as above, but up its level spheroid's normal there rather than straight out from the
// middle, so that level ground there is level in the scene (on Vesta up to 12° from the sphere's).
// The place stays where the sphere has it (degrees, and metres over the world's sphere), as every
// position on the world does: only the frame's turn differs from placeEarth's.
export function placeBody( group, world, { lat, lon, height = 0 } ) {

	const { origin, east, north, up } = levelFrame( world, lat, lon, height );
	_m.makeBasis( _east.fromArray( east ), _north.fromArray( north ), _up.fromArray( up ) ).setPosition( ...origin ).multiply( OBJECT_TURN );
	_m.invert().decompose( group.position, group.quaternion, group.scale );
	group.updateMatrixWorld( true );

}
