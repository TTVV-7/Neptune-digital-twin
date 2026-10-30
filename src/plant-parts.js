import {
	BoxGeometry,
	CylinderGeometry,
	ExtrudeGeometry,
	Matrix4,
	Mesh,
	MeshStandardMaterial,
	Quaternion,
	Shape,
	TorusGeometry,
	Vector2,
	Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Parts shared by the plant built in code: generators and compressors (power-models.js), mobile
// cranes and telehandlers (crane-models.js) and the tower crane (tower-crane.js). Like the other
// built-in pieces everything is in metres, stands on y = 0 and faces -Z, with +X on its right.
// Points are [ x, y, z ] arrays or Vector3s.

const materials = new Map();
export function mat( color, { roughness = 0.6, metalness = 0.15, ...rest } = {} ) {

	const key = JSON.stringify( [ color, roughness, metalness, rest ] );
	if ( ! materials.has( key ) ) {

		const material = new MeshStandardMaterial( { color, roughness, metalness, ...rest } );
		// Shared between copies, so removing one placed item doesn't dispose of the others' (models.js).
		material.userData.shared = true;
		materials.set( key, material );

	}

	return materials.get( key );

}

export const paint = color => mat( color, { roughness: 0.5, metalness: 0.2 } );
export const STEEL = () => mat( 0x7d8287, { roughness: 0.5, metalness: 0.6 } );
export const DARK = () => mat( 0x2c2e31, { roughness: 0.7, metalness: 0.2 } );
export const BLACK = () => mat( 0x18191b, { roughness: 0.85, metalness: 0 } );
// Polished metal (ram rods, a truck's grille) reads as dark with no surroundings to reflect, so
// it's a pale, mostly matt grey.
export const BRIGHT = () => mat( 0xc9ccce, { roughness: 0.35, metalness: 0.3 } );
export const GLASS = () => mat( 0x2b3d48, { roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.5 } );
export const RED_LAMP = () => mat( 0xb3141b, { roughness: 0.3, emissive: 0x7a0a0e, emissiveIntensity: 0.6 } );
export const AMBER_LAMP = () => mat( 0xff9a1a, { roughness: 0.3, emissive: 0xc76a00, emissiveIntensity: 0.6 } );

const UP = new Vector3( 0, 1, 0 );
const ACROSS = new Vector3( 1, 0, 0 );
const _a = new Vector3();
const _b = new Vector3();
const _m = new Matrix4();
const _q = new Quaternion();

const vec = ( p, target = new Vector3() ) => Array.isArray( p ) ? target.fromArray( p ) : target.copy( p );

// A box of size [x, y, z] whose base sits at height y0, centred on (x0, z0).
export function box( parent, material, [ sx, sy, sz ], [ x0 = 0, y0 = 0, z0 = 0 ] = [] ) {

	const mesh = new Mesh( new BoxGeometry( sx, sy, sz ), material );
	mesh.position.set( x0, y0 + sy / 2, z0 );
	parent.add( mesh );
	return mesh;

}

// An upright cylinder whose base sits at height y0.
export function cylinder( parent, material, radius, height, [ x0 = 0, y0 = 0, z0 = 0 ] = [], segments = 16 ) {

	const mesh = new Mesh( new CylinderGeometry( radius, radius, height, segments ), material );
	mesh.position.set( x0, y0 + height / 2, z0 );
	parent.add( mesh );
	return mesh;

}

// A cylinder lying across (along x), centred on the point: axles, drums, sheaves.
export function across( parent, material, radius, width, [ x, y, z ], segments = 16 ) {

	const mesh = new Mesh( new CylinderGeometry( radius, radius, width, segments ), material );
	mesh.rotation.z = Math.PI / 2;
	mesh.position.set( x, y, z );
	parent.add( mesh );
	return mesh;

}

// A tyre on its rim, axle across, centred on the point. `dual` puts two side by side, as on a
// truck's rear axle.
export function wheel( parent, radius, width, [ x, y = radius, z ], { dual = false, rim = paint( 0x9a9ea2 ) } = {} ) {

	for ( const dx of dual ? [ - width * 0.52, width * 0.52 ] : [ 0 ] ) {

		across( parent, BLACK(), radius, width, [ x + dx, y, z ], 20 );
		across( parent, rim, radius * 0.55, width * 1.04, [ x + dx, y, z ], 14 );

	}

}

// The geometry of a box of cross-section [ w, h ] (w across, h up) reaching from one point to
// another. A member that runs straight up takes its "across" from x instead.
export function memberGeometry( [ w, h ], from, to ) {

	vec( from, _a );
	vec( to, _b );
	const length = _a.distanceTo( _b );
	const geometry = new BoxGeometry( w, h, length );
	const dir = _b.clone().sub( _a ).normalize();
	const up = Math.abs( dir.dot( UP ) ) > 0.99 ? ACROSS : UP;
	_m.lookAt( _b, _a, up );
	_q.setFromRotationMatrix( _m );
	geometry.applyQuaternion( _q );
	geometry.translate( ( _a.x + _b.x ) / 2, ( _a.y + _b.y ) / 2, ( _a.z + _b.z ) / 2 );
	return geometry;

}

export function beam( parent, material, section, from, to ) {

	const mesh = new Mesh( memberGeometry( section, from, to ), material );
	parent.add( mesh );
	return mesh;

}

// A round bar (a rope, a ram, a pipe) from one point to another.
export function rod( parent, material, radius, from, to, segments = 8 ) {

	vec( from, _a );
	vec( to, _b );
	const length = _a.distanceTo( _b );
	const mesh = new Mesh( new CylinderGeometry( radius, radius, length, segments ), material );
	mesh.position.addVectors( _a, _b ).multiplyScalar( 0.5 );
	mesh.quaternion.setFromUnitVectors( UP, _b.clone().sub( _a ).normalize() );
	parent.add( mesh );
	return mesh;

}

// Many parts of one material as one mesh: lattice members, louvre slats. One draw call instead of
// hundreds, which matters for a tower crane's mast.
export function merged( parent, material, geometries ) {

	if ( geometries.length === 0 ) return null;
	const geometry = mergeGeometries( geometries.map( g => g.index ? g.toNonIndexed() : g ) );
	geometries.forEach( g => g.dispose() );
	const mesh = new Mesh( geometry, material );
	parent.add( mesh );
	return mesh;

}

// A cross-section (points [ x, y ]) extruded along z from z0 by `length`.
export function section( parent, material, points, length, z0 = 0 ) {

	const shape = new Shape( points.map( ( [ x, y ] ) => new Vector2( x, y ) ) );
	const geometry = new ExtrudeGeometry( shape, { depth: length, bevelEnabled: false, curveSegments: 6 } );
	geometry.translate( 0, 0, z0 );
	const mesh = new Mesh( geometry, material );
	parent.add( mesh );
	return mesh;

}

// A cross-section of a box [ width, height ] with its top corners rounded by `radius`, standing on y0.
export function roundedTop( width, height, radius, y0 = 0, steps = 5 ) {

	const w = width / 2;
	const r = Math.min( radius, w, height );
	const points = [ [ - w, y0 ], [ w, y0 ] ];
	for ( let i = 0; i <= steps; i ++ ) {

		const a = i / steps * Math.PI / 2;
		points.push( [ w - r + r * Math.cos( a ), y0 + height - r + r * Math.sin( a ) ] );

	}

	for ( let i = 0; i <= steps; i ++ ) {

		const a = Math.PI / 2 + i / steps * Math.PI / 2;
		points.push( [ - w + r + r * Math.cos( a ), y0 + height - r + r * Math.sin( a ) ] );

	}

	return points;

}

// A row of louvre slats on a face: `face` is 'x' (on a side, at x) or 'z' (on an end, at z), the
// panel [ across, high ] is centred on `at`, with slats every `pitch`.
export function louvres( parent, material, face, [ across, high ], at, pitch = 0.08 ) {

	const [ x, y, z ] = at;
	const count = Math.max( 1, Math.floor( high / pitch ) );
	const geometries = [];
	for ( let i = 0; i < count; i ++ ) {

		const yi = y - high / 2 + ( i + 0.5 ) * high / count;
		const slat = face === 'x' ? new BoxGeometry( 0.025, 0.022, across ) : new BoxGeometry( across, 0.022, 0.025 );
		slat.translate( x, yi, z );
		geometries.push( slat );

	}

	return merged( parent, material, geometries );

}

// A crane hook block hanging with its top (where the ropes come in) at `top`: sheave cheeks, a
// weight and the hook under it. `size` scales it from a 40 t block about 1 m tall.
export function hookBlock( parent, top, size = 1, color = 0xf2b200 ) {

	const [ x, y, z ] = Array.isArray( top ) ? top : top.toArray();
	const s = size;
	box( parent, paint( color ), [ 0.62 * s, 0.6 * s, 0.34 * s ], [ x, y - 0.6 * s, z ] );
	box( parent, BLACK(), [ 0.64 * s, 0.12 * s, 0.36 * s ], [ x, y - 0.72 * s, z ] );
	across( parent, DARK(), 0.22 * s, 0.4 * s, [ x, y - 0.1 * s, z ], 14 );
	cylinder( parent, STEEL(), 0.06 * s, 0.22 * s, [ x, y - 0.94 * s, z ], 8 );
	const hook = new Mesh( new TorusGeometry( 0.17 * s, 0.05 * s, 6, 14, Math.PI * 1.45 ), STEEL() );
	hook.rotation.set( 0, Math.PI / 2, Math.PI * 0.3 );
	hook.position.set( x, y - 1.1 * s, z );
	parent.add( hook );
	return y - 1.3 * s;

}

// A hydraulic cylinder from its base to its rod end: the barrel for the first 60%, the rod the
// rest of the way.
export function ram( parent, radius, from, to ) {

	const a = vec( from, new Vector3() );
	const b = vec( to, new Vector3() );
	const split = a.clone().lerp( b, 0.6 );
	rod( parent, DARK(), radius, a, split, 12 );
	rod( parent, BRIGHT(), radius * 0.6, split, b, 10 );

}

// A telescopic boom from its foot pin to its head, as `sections` nested boxes, each overlapping
// the one before by a sixth and a little smaller, with the head's sheaves past the last (unless
// `head` is false: a telehandler's boom ends in its carriage). size: [ width, height ] of the base
// section. Returns the point the hoist rope hangs from.
export function telescopicBoom( parent, material, from, to, { sections = 3, size = [ 0.6, 0.9 ], inner = material, head: sheaves = true } = {} ) {

	const a = vec( from, new Vector3() );
	const b = vec( to, new Vector3() );
	const length = a.distanceTo( b );
	const dir = b.clone().sub( a ).normalize();
	const segment = length / ( 1 + ( sections - 1 ) * 5 / 6 );
	for ( let i = 0; i < sections; i ++ ) {

		const start = a.clone().addScaledVector( dir, i * segment * 5 / 6 );
		const end = start.clone().addScaledVector( dir, segment );
		const k = 0.88 ** i;
		beam( parent, i === 0 ? material : inner, [ size[ 0 ] * k, size[ 1 ] * k ], start, end );

	}

	if ( ! sheaves ) return b;

	// The head: sheaves across the tip, a little past it and below its centre line.
	const k = 0.88 ** ( sections - 1 );
	const side = new Vector3().crossVectors( dir, UP ).normalize();
	const down = new Vector3().crossVectors( side, dir ).normalize().negate();
	const head = b.clone().addScaledVector( dir, size[ 1 ] * k * 0.3 ).addScaledVector( down, size[ 1 ] * k * 0.2 );
	beam( parent, material, [ size[ 0 ] * k * 1.05, size[ 1 ] * k * 0.8 ], b.clone().addScaledVector( dir, - size[ 1 ] * k * 0.4 ), head );
	across( parent, DARK(), size[ 1 ] * k * 0.42, size[ 0 ] * k * 1.1, head.toArray(), 14 );
	return head.clone().addScaledVector( dir, size[ 1 ] * k * 0.42 );

}

// A cab or operator's cabin, hollow so a camera can sit inside it and look out: a floor, a roof,
// corner posts, solid panels to `sill` above its floor and glass above. size [ width, height,
// length ] with its base at y0, centred on (x0, z0). Its front faces -Z.
export function cabin( parent, material, [ width, height, length ], [ x0, y0, z0 ], { sill = 0.45, rearGlass = true } = {} ) {

	const t = 0.05;
	const post = 0.07;
	box( parent, material, [ width, t, length ], [ x0, y0, z0 ] );
	box( parent, material, [ width + 0.06, 0.08, length + 0.06 ], [ x0, y0 + height - 0.08, z0 ] );
	for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) box( parent, material, [ post, height - 0.08, post ], [ x0 + sx * ( width - post ) / 2, y0, z0 + sz * ( length - post ) / 2 ] );

	const panelHigh = height * sill;
	const glassHigh = height - panelHigh - 0.1;
	const sides = [
		[ [ t, panelHigh, length ], [ t, glassHigh, length - 2 * post ], ( width - t ) / 2, 0, true ],
		[ [ t, panelHigh, length ], [ t, glassHigh, length - 2 * post ], - ( width - t ) / 2, 0, true ],
		[ [ width, panelHigh, t ], [ width - 2 * post, glassHigh, t ], 0, - ( length - t ) / 2, true ],
		[ [ width, panelHigh, t ], [ width - 2 * post, glassHigh, t ], 0, ( length - t ) / 2, rearGlass ],
	];
	for ( const [ panel, pane, dx, dz, glazed ] of sides ) {

		box( parent, material, panel, [ x0 + dx, y0, z0 + dz ] );
		if ( glazed ) box( parent, GLASS(), pane, [ x0 + dx, y0 + panelHigh, z0 + dz ] );
		else box( parent, material, [ pane[ 0 ], glassHigh, pane[ 2 ] ], [ x0 + dx, y0 + panelHigh, z0 + dz ] );

	}

	// A seat, so it isn't empty from outside.
	box( parent, DARK(), [ Math.min( 0.5, width * 0.6 ), 0.45, 0.5 ], [ x0, y0 + t, z0 + length * 0.2 ] );
	box( parent, DARK(), [ Math.min( 0.5, width * 0.6 ), 0.6, 0.1 ], [ x0, y0 + 0.5, z0 + length * 0.2 + 0.25 ] );

}

// An outrigger set out: a beam from the carrier to over its float, a jack down to the float, and
// the float (pad) on the ground. from: where the beam leaves the carrier, at beam height.
export function outrigger( parent, material, from, { out, pad = 0.6, beam: section = [ 0.3, 0.3 ] } ) {

	const [ x, y, z ] = from;
	const end = [ x + out, y, z ];
	beam( parent, material, section, [ x, y, z ], end );
	cylinder( parent, material, section[ 0 ] * 0.45, y - 0.1, [ end[ 0 ], 0.1, z ], 12 );
	cylinder( parent, DARK(), pad / 2, 0.1, [ end[ 0 ], 0, z ], 18 );

}
