import {
	BoxGeometry,
	CanvasTexture,
	CylinderGeometry,
	Euler,
	ExtrudeGeometry,
	Group,
	Matrix4,
	Mesh,
	MeshStandardMaterial,
	Quaternion,
	Shape,
	SphereGeometry,
	SRGBColorSpace,
	Vector2,
	Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Building blocks for the built-in site pieces made of many parts: trailers, temporary covers,
// water treatment and people. An item is collected as parts and merged into one mesh per material
// when it's done, so a fence run or a scaffold of a hundred tubes costs a few draw calls and a few
// raycast trees (raycast.js builds one per mesh) rather than hundreds.

export const FT = 0.3048;
export const IN = 0.0254;

const UP = new Vector3( 0, 1, 0 );
const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _a = new Vector3();
const _b = new Vector3();
const _p = new Vector3();
const _s = new Vector3();

// Materials are shared by every copy of every item; models.js leaves shared materials alone when
// it disposes of an item.
const materials = new Map();
export function mat( color, { roughness = 0.8, metalness = 0, ...rest } = {} ) {

	const key = JSON.stringify( [ color, roughness, metalness, rest ] );
	if ( ! materials.has( key ) ) materials.set( key, shared( new MeshStandardMaterial( { color, roughness, metalness, ...rest } ) ) );
	return materials.get( key );

}

// A material made once by `create` (one with a drawn texture, say) and kept under `key`.
export function made( key, create ) {

	if ( ! materials.has( key ) ) materials.set( key, shared( create() ) );
	return materials.get( key );

}

// A material whose texture is drawn once on a canvas of [ width, height ] px by draw( ctx ), for
// signs and lettering. Transparent pixels are cut out, so a sign can be any shape.
export function drawn( key, [ width, height ], draw, options = {} ) {

	return made( key, () => {

		const canvas = document.createElement( 'canvas' );
		canvas.width = width;
		canvas.height = height;
		draw( canvas.getContext( '2d' ), width, height );
		const map = new CanvasTexture( canvas );
		map.colorSpace = SRGBColorSpace;
		map.anisotropy = 4;
		return new MeshStandardMaterial( { map, alphaTest: 0.5, roughness: 0.6, ...options } );

	} );

}

function shared( material ) {

	material.userData.shared = true;
	return material;

}

export const STEEL = () => mat( 0x8a8f94, { roughness: 0.5, metalness: 0.6 } );
export const GALVANISED = () => mat( 0xa9adb0, { roughness: 0.45, metalness: 0.65 } );
export const BLACK = () => mat( 0x1d1f21, { roughness: 0.7 } );
export const RUBBER = () => mat( 0x161718, { roughness: 0.9 } );
export const GLASS = () => mat( 0x23313b, { roughness: 0.15, metalness: 0.3 } );

// Unit shapes made once and copied for each part, which is much quicker than making every tube
// of a truss from scratch.
const units = new Map();
function unit( key, create ) {

	if ( ! units.has( key ) ) {

		const geometry = create();
		units.set( key, geometry.toNonIndexed() );
		geometry.dispose();

	}

	return units.get( key ).clone();

}

export class Parts {

	constructor() {

		this.lists = new Map();

	}

	// Any geometry (the caller's to give away), moved by `matrix` if there is one.
	add( material, geometry, matrix = null ) {

		// Merging needs every geometry indexed or none: none, as ExtrudeGeometry has no index.
		if ( geometry.index ) {

			const plain = geometry.toNonIndexed();
			geometry.dispose();
			geometry = plain;

		}

		if ( matrix ) geometry.applyMatrix4( matrix );
		if ( ! this.lists.has( material ) ) this.lists.set( material, [] );
		this.lists.get( material ).push( geometry );
		return geometry;

	}

	// A box of size [x, y, z] whose base sits at height y, centred on (x, z), as in procedural.js.
	box( material, [ sx, sy, sz ], [ x = 0, y = 0, z = 0 ] = [] ) {

		_m.compose( _p.set( x, y + sy / 2, z ), _q.identity(), _s.set( sx, sy, sz ) );
		return this.add( material, unit( 'box', () => new BoxGeometry() ), _m );

	}

	// A box centred on `centre` and turned by the angles [x, y, z] (radians, in that order).
	block( material, size, centre, angles = [ 0, 0, 0 ] ) {

		_q.setFromEuler( _e.set( ...angles ) );
		_m.compose( _p.fromArray( centre ), _q, _s.fromArray( size ) );
		return this.add( material, unit( 'box', () => new BoxGeometry() ), _m );

	}

	// An upright cylinder with its base at height y; radiusTop makes a cone or a taper.
	cylinder( material, radius, height, [ x = 0, y = 0, z = 0 ] = [], segments = 16, radiusTop = radius ) {

		if ( radiusTop !== radius ) return this.add( material, new CylinderGeometry( radiusTop, radius, height, segments ), _m.makeTranslation( x, y + height / 2, z ) );
		_m.compose( _p.set( x, y + height / 2, z ), _q.identity(), _s.set( radius, height, radius ) );
		return this.add( material, unit( `tube ${ segments }`, () => new CylinderGeometry( 1, 1, 1, segments ) ), _m );

	}

	// A round bar, pipe or limb from point a to point b, of one radius or [ at a, at b ]; `open`
	// leaves the ends off where something else covers them.
	rod( material, a, b, radius, segments = 8, open = false ) {

		const [ ra, rb ] = Array.isArray( radius ) ? radius : [ radius, radius ];
		_a.fromArray( a );
		_b.fromArray( b );
		const length = _a.distanceTo( _b );
		if ( length < 1e-6 ) return null;
		_q.setFromUnitVectors( UP, _p.subVectors( _b, _a ).divideScalar( length ) );
		_p.addVectors( _a, _b ).multiplyScalar( 0.5 );
		if ( ra !== rb ) return this.add( material, new CylinderGeometry( rb, ra, length, segments, 1, open ), _m.compose( _p, _q, _s.set( 1, 1, 1 ) ) );
		_m.compose( _p, _q, _s.set( ra, length, ra ) );
		return this.add( material, unit( `tube ${ segments }${ open ? ' open' : '' }`, () => new CylinderGeometry( 1, 1, 1, segments, 1, open ) ), _m );

	}

	// A polyline of rods through points, with a ball at each bend so sharp ones don't gape (a
	// smooth curve, such as an arch, can leave them out).
	path( material, points, radius, segments = 8, joints = true ) {

		for ( let i = 1; i < points.length; i ++ ) this.rod( material, points[ i - 1 ], points[ i ], radius, segments, true );
		if ( joints ) for ( let i = 1; i < points.length - 1; i ++ ) this.sphere( material, radius, points[ i ], [ segments, Math.max( 3, segments >> 1 ) ] );

	}

	// A sphere (or, with `scale`, an ellipsoid) centred on `centre`.
	sphere( material, radius, centre, [ widthSegments = 12, heightSegments = 8 ] = [], scale = [ 1, 1, 1 ] ) {

		_m.compose( _p.fromArray( centre ), _q.identity(), _s.fromArray( scale ).multiplyScalar( radius ) );
		return this.add( material, unit( `sphere ${ widthSegments } ${ heightSegments }`, () => new SphereGeometry( 1, widthSegments, heightSegments ) ), _m );

	}

	// A side profile (points in [z, y]) extruded across x by `width`, centred on x = x0, as
	// procedural.js does for barriers and bins.
	prism( material, points, width, x0 = 0 ) {

		const shape = new Shape( points.map( ( [ z, y ] ) => new Vector2( z, y ) ) );
		const geometry = new ExtrudeGeometry( shape, { depth: width, bevelEnabled: false, curveSegments: 4 } );
		geometry.rotateY( - Math.PI / 2 );
		geometry.translate( x0 + width / 2, 0, 0 );
		return this.add( material, geometry );

	}

	// One mesh per material, in `group` (a new one by default).
	build( group = new Group() ) {

		for ( const [ material, geometries ] of this.lists ) {

			const geometry = geometries.length === 1 ? geometries[ 0 ] : mergeGeometries( geometries );
			if ( ! geometry ) throw new Error( `Parts in "${ material.name || material.color?.getHexString() }" have different attributes and can't be merged.` );
			if ( geometries.length > 1 ) geometries.forEach( g => g.dispose() );
			group.add( new Mesh( geometry, material ) );

		}

		this.lists.clear();
		return group;

	}

}
