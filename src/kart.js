import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry } from 'three';

// A go-kart built in code: 1.6 m long, its front toward -Z and the bottoms of its wheels at y = 0,
// with a driver in a helmet. A stand-in for World Drive (src/drive-app/) until the full kart
// model lands; anything with the same shape of export works in its place.

const body = new MeshStandardMaterial( { color: 0xffc21a, roughness: 0.45, metalness: 0.1 } );
const trim = new MeshStandardMaterial( { color: 0x1d2633, roughness: 0.6 } );
const tyre = new MeshStandardMaterial( { color: 0x111317, roughness: 0.9 } );
const suit = new MeshStandardMaterial( { color: 0x2f7dff, roughness: 0.7 } );
const helmet = new MeshStandardMaterial( { color: 0xf4f6f8, roughness: 0.3, metalness: 0.2 } );
const visor = new MeshStandardMaterial( { color: 0x12161c, roughness: 0.1, metalness: 0.6 } );
for ( const material of [ body, trim, tyre, suit, helmet, visor ] ) material.userData.shared = true;

export function makeKart() {

	const kart = new Group();
	kart.name = 'go-kart';
	const add = ( geometry, material, x, y, z ) => {

		const mesh = new Mesh( geometry, material );
		mesh.position.set( x, y, z );
		kart.add( mesh );
		return mesh;

	};

	// Floor pan, side pods and the nose, sitting low between the wheels.
	add( new BoxGeometry( 0.7, 0.06, 1.3 ), trim, 0, 0.08, 0 );
	add( new BoxGeometry( 0.16, 0.14, 0.62 ), body, - 0.42, 0.14, 0.05 );
	add( new BoxGeometry( 0.16, 0.14, 0.62 ), body, 0.42, 0.14, 0.05 );
	add( new BoxGeometry( 0.62, 0.16, 0.26 ), body, 0, 0.16, - 0.66 ).rotation.x = - 0.25;
	add( new BoxGeometry( 1.04, 0.08, 0.08 ), trim, 0, 0.12, 0.76 );

	// Wheels: narrow at the front, wide at the back.
	for ( const [ x, z, radius, width ] of [ [ - 0.5, - 0.5, 0.13, 0.13 ], [ 0.5, - 0.5, 0.13, 0.13 ], [ - 0.52, 0.52, 0.14, 0.2 ], [ 0.52, 0.52, 0.14, 0.2 ] ] ) {

		add( new CylinderGeometry( radius, radius, width, 20 ), tyre, x, radius, z ).rotation.z = Math.PI / 2;

	}

	// Seat, engine and steering wheel.
	add( new BoxGeometry( 0.42, 0.34, 0.12 ), trim, 0, 0.3, 0.3 ).rotation.x = - 0.25;
	add( new BoxGeometry( 0.26, 0.24, 0.3 ), trim, 0.3, 0.24, 0.48 );
	add( new TorusGeometry( 0.13, 0.022, 8, 20 ), trim, 0, 0.5, - 0.24 ).rotation.x = 1.1;

	// The driver.
	add( new BoxGeometry( 0.36, 0.42, 0.24 ), suit, 0, 0.5, 0.16 ).rotation.x = - 0.15;
	add( new SphereGeometry( 0.15, 20, 14 ), helmet, 0, 0.86, 0.12 );
	add( new BoxGeometry( 0.22, 0.07, 0.06 ), visor, 0, 0.87, - 0.02 );

	return kart;

}
