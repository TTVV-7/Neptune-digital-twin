import {
	BoxGeometry,
	CapsuleGeometry,
	CatmullRomCurve3,
	CylinderGeometry,
	ExtrudeGeometry,
	Group,
	LatheGeometry,
	Mesh,
	MeshStandardMaterial,
	Shape,
	SphereGeometry,
	TorusGeometry,
	TubeGeometry,
	Vector2,
	Vector3,
} from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

// What the Supporter Pass rides (coupe.js, monster.js, bus.js, hovercraft.js) are built from, as
// the go-kart is (src/kart.js): boxes, tubes, profiles drawn from the side and pushed out across the
// width, tyres turned on a lathe, and a driver. Each ride stands on y = 0 facing -Z, in metres.
//
// The Garage (../paint.js) repaints what's tagged userData.paint = 'body' (the bodywork) or 'rim'
// (wheel rims, a hovercraft's trim), and puts decals where userData.decals says (see paint.js).

// Materials are shared between copies of a ride, as the kart's are, so removing one doesn't spoil
// the rest. Paint the Garage puts on comes from its own shared set.
const materials = new Map();
export function mat( color, { roughness = 0.5, metalness = 0, ...rest } = {} ) {

	const key = JSON.stringify( [ color, roughness, metalness, rest ] );
	if ( ! materials.has( key ) ) {

		const material = new MeshStandardMaterial( { color, roughness, metalness, ...rest } );
		material.userData.shared = true;
		materials.set( key, material );

	}

	return materials.get( key );

}

export const RUBBER = () => mat( 0x17181a, { roughness: 0.92 } );
export const DARK = () => mat( 0x26292e, { roughness: 0.6, metalness: 0.3 } );
export const BLACK = () => mat( 0x0e0f11, { roughness: 0.45, metalness: 0.2 } );
export const STEEL = () => mat( 0xb9c0c7, { roughness: 0.3, metalness: 0.8 } );
export const CHROME = () => mat( 0xe8edf2, { roughness: 0.15, metalness: 0.95 } );
export const RIM = () => mat( 0xd5dbe1, { roughness: 0.25, metalness: 0.75 } );
// See-through, so the driver shows; drive.js hides glass in the driver's-seat view.
export const GLASS = () => mat( 0x1a2633, { roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.55, depthWrite: false } );
export const HEADLIGHT = () => mat( 0xf2f8ff, { roughness: 0.2, emissive: 0xdfefff, emissiveIntensity: 0.9 } );
export const TAILLIGHT = () => mat( 0xff2a2a, { roughness: 0.3, emissive: 0xff1a1a, emissiveIntensity: 0.8 } );
export const AMBER = () => mat( 0xffa21a, { roughness: 0.3, emissive: 0xff8a00, emissiveIntensity: 0.6 } );

// Mark a mesh as bodywork or rim, for the Garage to repaint.
export function paint( mesh, part = 'body' ) {

	mesh.userData.paint = part;
	return mesh;

}

export function block( parent, material, [ sx, sy, sz ], [ x, y, z ], [ rx, ry, rz ] = [ 0, 0, 0 ] ) {

	const mesh = new Mesh( new BoxGeometry( sx, sy, sz ), material );
	mesh.position.set( x, y, z );
	mesh.rotation.set( rx, ry, rz );
	parent.add( mesh );
	return mesh;

}

// A cylinder of `radius` and `length` along `axis` ('x', 'y' or 'z'), centred at `at`.
export function rod( parent, material, radius, length, axis, at, segments = 10 ) {

	const geometry = new CylinderGeometry( radius, radius, length, segments );
	if ( axis === 'x' ) geometry.rotateZ( Math.PI / 2 );
	else if ( axis === 'z' ) geometry.rotateX( Math.PI / 2 );
	const mesh = new Mesh( geometry, material );
	mesh.position.set( ...at );
	parent.add( mesh );
	return mesh;

}

// A straight tube between two points [ x, y, z ].
export function tube( parent, a, b, radius, material, segments = 6 ) {

	const start = new Vector3( ...a );
	const end = new Vector3( ...b );
	const mesh = new Mesh( new CylinderGeometry( radius, radius, start.distanceTo( end ), segments, 1, true ), material );
	mesh.position.copy( start ).add( end ).multiplyScalar( 0.5 );
	mesh.quaternion.setFromUnitVectors( new Vector3( 0, 1, 0 ), end.sub( start ).normalize() );
	parent.add( mesh );
	return mesh;

}

// A bent tube through points, for roll cages, bumpers and rails.
export function bent( parent, points, radius, material, segments = 16, closed = false ) {

	const curve = new CatmullRomCurve3( points.map( p => new Vector3( ...p ) ), closed );
	const mesh = new Mesh( new TubeGeometry( curve, segments, radius, 6, closed ), material );
	parent.add( mesh );
	return mesh;

}

// A side profile (points [ z, y ]) pushed out across x from x0 to x1, its edges rounded by `bevel`
// (which grows the outline by as much). `warp( vertex )` can then reshape it, a vertex at a time
// (as a Vector3): narrowing it toward the nose or tucking the sides in toward the roof. A warped
// profile has its long edges cut every `step` m first, so its flat sides are split into narrow
// upright strips that bend with the warp, rather than long slivers from nose to tail. Its shading
// is smooth across gentle bends (under CREASE) and sharp at its edges.
const CREASE = 0.85;
const _vertex = new Vector3();
export function profile( parent, material, points, x0, x1, { bevel = 0.02, segments = 1, warp = null, step = 0.3 } = {} ) {

	const outline = warp ? cut( points, step ) : points;
	const shape = new Shape( outline.map( ( [ z, y ] ) => new Vector2( z, y ) ) );
	const depth = Math.max( 0.001, x1 - x0 - bevel * 2 );
	const geometry = new ExtrudeGeometry( shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segments, curveSegments: 4 } );
	geometry.rotateY( - Math.PI / 2 );
	geometry.translate( x1 - bevel, 0, 0 );
	if ( warp ) {

		const position = geometry.attributes.position;
		for ( let i = 0; i < position.count; i ++ ) {

			warp( _vertex.fromBufferAttribute( position, i ) );
			position.setXYZ( i, _vertex.x, _vertex.y, _vertex.z );

		}

	}

	const mesh = new Mesh( toCreasedNormals( geometry, CREASE ), material );
	geometry.dispose();
	parent.add( mesh );
	return mesh;

}

// The outline with points added along any edge longer than `step`.
function cut( points, step ) {

	const out = [];
	points.forEach( ( [ z, y ], i ) => {

		const [ nz, ny ] = points[ ( i + 1 ) % points.length ];
		const pieces = Math.max( 1, Math.round( Math.hypot( nz - z, ny - y ) / step ) );
		for ( let k = 0; k < pieces; k ++ ) out.push( [ z + ( nz - z ) * k / pieces, y + ( ny - y ) * k / pieces ] );

	} );
	return out;

}

// Points round an arc about ( z, y ), `from` to `to` (radians, 0 toward +z, a quarter turn up),
// for wheel arches in a profile.
export function arc( z, y, radius, from, to, steps = 8 ) {

	const points = [];
	for ( let i = 0; i <= steps; i ++ ) {

		const angle = from + ( to - from ) * i / steps;
		points.push( [ z + Math.cos( angle ) * radius, y + Math.sin( angle ) * radius ] );

	}

	return points;

}

// A wheel arch in a profile's bottom edge, from behind the axle at z (the profile running front to
// back along its top, so back to front along its bottom) over to in front of it, meeting the bottom
// edge at `bottom`.
export function arch( z, axle, radius, bottom, steps = 8 ) {

	const dip = Math.asin( Math.max( - 1, Math.min( 1, ( bottom - axle ) / radius ) ) );
	return arc( z, axle, radius, dip, Math.PI - dip, steps );

}

// A tyre with rounded shoulders and a groove or two round its tread, on a rim dished in from its
// outer face, with `spokes` spokes and a hub, facing out on `side`. Returns the part that spins:
// its rim and spokes are tagged for the Garage's rim colour.
export function wheel( parent, { radius, width, rim = 0.65, spokes = 5, grooves = 2, dish = 0.3, segments = 22 }, side, { tyre = RUBBER(), rimMaterial = RIM(), hub = DARK() } = {} ) {

	const spinner = new Group();
	parent.add( spinner );
	const half = width / 2;
	const inner = radius * rim;
	const shoulder = Math.min( 0.06, radius * 0.18 );
	// Profile in [ r, x ] from the inner bead round the tread to the outer bead, turned about the
	// axle, with the grooves cut evenly across the tread.
	const tread = [ [ radius, - half + shoulder ] ];
	const groove = Math.min( 0.015, width * 0.04 );
	for ( let i = 1; i <= grooves; i ++ ) {

		const x = - half + shoulder + ( width - shoulder * 2 ) * i / ( grooves + 1 );
		tread.push( [ radius, x - groove ], [ radius - groove, x - groove ], [ radius - groove, x + groove ], [ radius, x + groove ] );

	}

	tread.push( [ radius, half - shoulder ] );
	const points = [
		[ inner, - half ], [ radius - shoulder, - half ], [ radius - shoulder * 0.3, - half + shoulder * 0.3 ],
		...tread,
		[ radius - shoulder * 0.3, half - shoulder * 0.3 ], [ radius - shoulder, half ], [ inner, half ],
	].map( ( [ r, x ] ) => new Vector2( r, x ) );
	spinner.add( new Mesh( new LatheGeometry( points, segments ).rotateZ( Math.PI / 2 ), tyre ) );

	// The rim: a barrel inside the tyre, a dish in from its outer face, spokes across it and a hub.
	const face = side * half * ( 1 - dish );
	spinner.add( paint( new Mesh( new CylinderGeometry( inner, inner, width * 0.92, 18, 1, true ).rotateZ( Math.PI / 2 ), rimMaterial ), 'rim' ) );
	spinner.add( new Mesh( new CylinderGeometry( inner * 0.97, inner * 0.97, 0.01, 18 ).rotateZ( Math.PI / 2 ).translate( - side * half * 0.4, 0, 0 ), hub ) );
	const centre = new Mesh( new CylinderGeometry( inner * 0.24, inner * 0.28, width * 0.2, 12 ).rotateZ( side * Math.PI / 2 ), hub );
	centre.position.x = face;
	spinner.add( centre );
	for ( let i = 0; i < spokes; i ++ ) {

		const spoke = paint( new Mesh( new BoxGeometry( width * 0.12, inner * 0.92, inner * 0.16 ), rimMaterial ), 'rim' );
		const angle = i / spokes * Math.PI * 2;
		spoke.position.set( face, Math.cos( angle ) * inner * 0.5, Math.sin( angle ) * inner * 0.5 );
		spoke.rotation.x = angle;
		spinner.add( spoke );

	}

	return merge( spinner );

}

// A seated driver, hips at `at` [ x, y, z ], hands at the wheel (`hands`, [ x, y, z ] for the right
// hand, mirrored for the left about x = at[ 0 ]) and feet at `feet` ( z ). A helmet, or a cap for a
// bus driver. Returns the head, which the driver's-seat camera is inside, for hiding then.
export function driver( parent, { at, hands, feet, suit = 0x2453d6, helmet = 0xf3f5f7, visor = 0x10161f, cap = false, lean = 0.25, size = 1 } ) {

	const body = new Group();
	body.position.set( ...at );
	body.scale.setScalar( size );
	parent.add( body );
	const cloth = mat( suit, { roughness: 0.75 } );
	const skin = mat( 0xe0ac86, { roughness: 0.7 } );
	const glove = mat( 0x1d1f23, { roughness: 0.8 } );
	// Positions from here on are from the hips, as a driver of 1.75 m sits.
	const torso = new Mesh( new CapsuleGeometry( 0.16, 0.3, 3, 10 ), cloth );
	torso.position.set( 0, 0.3, 0.05 );
	torso.rotation.x = - lean;
	body.add( torso );
	const local = ( [ x, y, z ] ) => [ ( x - at[ 0 ] ) / size, ( y - at[ 1 ] ) / size, ( z - at[ 2 ] ) / size ];
	const [ hx, hy, hz ] = local( hands );
	const footZ = ( feet - at[ 2 ] ) / size;
	for ( const s of [ - 1, 1 ] ) {

		// Thighs forward, shins down to the pedals.
		limb( body, [ s * 0.1, 0, 0 ], [ s * 0.11, 0.05, - 0.42 ], 0.07, cloth );
		limb( body, [ s * 0.11, 0.05, - 0.42 ], [ s * 0.1, - 0.32, footZ ], 0.055, cloth );
		// Arms from the shoulders to the wheel.
		const shoulder = [ s * 0.2, 0.5, 0.12 ];
		const hand = [ s * Math.abs( hx ), hy, hz ];
		const elbow = [ s * ( 0.2 + Math.abs( hx ) ) / 2 + s * 0.05, ( 0.5 + hy ) / 2 - 0.1, ( 0.12 + hz ) / 2 ];
		limb( body, shoulder, elbow, 0.05, cloth );
		limb( body, elbow, hand, 0.045, cloth );
		const fist = new Mesh( new SphereGeometry( 0.045, 6, 4 ), glove );
		fist.position.set( ...hand );
		body.add( fist );

	}

	const head = new Group();
	head.position.set( 0, 0.78, 0.04 );
	body.add( head );
	limb( head, [ 0, - 0.2, 0.03 ], [ 0, - 0.06, 0 ], 0.055, skin );
	if ( cap ) {

		head.add( new Mesh( new SphereGeometry( 0.11, 12, 8 ), skin ) );
		const crown = new Mesh( new SphereGeometry( 0.115, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.45 ), mat( suit, { roughness: 0.7 } ) );
		crown.position.y = 0.02;
		head.add( crown );
		const peak = new Mesh( new CylinderGeometry( 0.09, 0.09, 0.012, 12, 1, false, Math.PI * 0.5, Math.PI ), mat( 0x15171b ) );
		peak.position.set( 0, 0.04, - 0.07 );
		head.add( peak );

	} else {

		head.add( new Mesh( new SphereGeometry( 0.14, 12, 8 ), mat( helmet, { roughness: 0.25, metalness: 0.1 } ) ) );
		// The visor faces -Z: SphereGeometry's phi of 1.5 pi points there.
		head.add( new Mesh( new SphereGeometry( 0.143, 12, 4, Math.PI * 1.18, Math.PI * 0.64, Math.PI * 0.36, Math.PI * 0.24 ), mat( visor, { roughness: 0.05, metalness: 0.9 } ) ) );

	}

	head.userData.hideInCab = true;
	return head;

}

function limb( parent, a, b, radius, material ) {

	const start = new Vector3( ...a );
	const end = new Vector3( ...b );
	const mesh = new Mesh( new CapsuleGeometry( radius, start.distanceTo( end ), 2, 7 ), material );
	mesh.position.copy( start ).add( end ).multiplyScalar( 0.5 );
	mesh.quaternion.setFromUnitVectors( new Vector3( 0, 1, 0 ), end.sub( start ).normalize() );
	parent.add( mesh );
	return mesh;

}

// A steering wheel facing the driver, tipped back by `tilt`, at [ x, y, z ].
export function steeringWheel( parent, at, radius = 0.18, tilt = 1.1 ) {

	const wheel = new Group();
	wheel.position.set( ...at );
	wheel.rotation.x = - tilt;
	parent.add( wheel );
	wheel.add( new Mesh( new TorusGeometry( radius, 0.018, 5, 18 ), BLACK() ) );
	wheel.add( new Mesh( new BoxGeometry( radius * 1.9, 0.03, 0.015 ), DARK() ) );
	wheel.add( new Mesh( new CylinderGeometry( 0.04, 0.04, 0.03, 10 ).rotateX( Math.PI / 2 ), DARK() ) );
	return wheel;

}

// Fewer draw calls: the meshes directly in `group` that share a material become one mesh each,
// keeping their tags (all the meshes merged share a material, so they're the same part). Groups in
// it (wheels, anything that moves) are left as they are.
export function merge( group ) {

	const byMaterial = new Map();
	for ( const child of [ ...group.children ] ) {

		if ( ! child.isMesh ) continue;
		child.updateMatrix();
		const list = byMaterial.get( child.material ) ?? [];
		list.push( child );
		byMaterial.set( child.material, list );

	}

	for ( const [ material, meshes ] of byMaterial ) {

		if ( meshes.length < 2 ) continue;
		const geometries = meshes.map( mesh => {

			const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
			for ( const name of Object.keys( geometry.attributes ) ) if ( ! [ 'position', 'normal', 'uv' ].includes( name ) ) geometry.deleteAttribute( name );
			geometry.applyMatrix4( mesh.matrix );
			geometry.clearGroups();
			mesh.geometry.dispose();
			group.remove( mesh );
			return geometry;

		} );
		const merged = new Mesh( mergeGeometries( geometries ), material );
		for ( const geometry of geometries ) geometry.dispose();
		Object.assign( merged.userData, meshes[ 0 ].userData );
		merged.name = meshes[ 0 ].name;
		group.add( merged );

	}

	return group;

}

// How many triangles a model has, for keeping the rides light.
export function triangles( object ) {

	let count = 0;
	object.traverse( o => {

		if ( o.isMesh ) count += ( o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count ) / 3;

	} );
	return Math.round( count );

}
