import {
	BoxGeometry,
	BufferAttribute,
	BufferGeometry,
	CylinderGeometry,
	DoubleSide,
	ExtrudeGeometry,
	Group,
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

// Shoring equipment at real size, in metres: trench boxes and their stackers, slide rail, hydraulic
// shores, sheet piles and H-piles. shoring.js lines excavations with these, and the library has
// them as pieces to stage and lay down (procedural.js). Repeated parts are merged into one mesh
// per material, so a run of boxes or a 60 m sheet-piled wall is a handful of draw calls.

export const FT = 0.3048;
// Steel trench box panels are double-walled plate about 120 mm (4 3/4 in) thick.
export const PANEL = 0.12;
// Spreaders are 6 in pipe (168 mm outside).
const SPREADER = 0.084;
// A Z-profile sheet pile: width along the wall, depth of the corrugation, flange width and plate.
export const SHEET = { width: 0.6, depth: 0.38, flange: 0.14, plate: 0.012 };
// An HP310 x 79 (HP12 x 53) H-pile: depth, flange width; the plates are drawn a little thicker
// than their 11 mm, so they don't flicker away at a distance.
export const H_PILE = { depth: 0.3, flange: 0.306, plate: 0.02, kgPerM: 79 };

const UP = new Vector3( 0, 1, 0 );
const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _p = new Vector3();
const _dir = new Vector3();

function paint( color, options = {} ) {

	const material = new MeshStandardMaterial( { color, roughness: 0.6, metalness: 0.3, ...options } );
	// Shared by every copy; models.js leaves shared materials alone when it disposes an item.
	material.userData.shared = true;
	return material;

}

export const PAINT = {
	// Safety-yellow trench boxes, with their stiffeners and collars a shade darker.
	box: paint( 0xe2b119 ),
	boxTrim: paint( 0xb98c14 ),
	spreader: paint( 0x5c6166, { metalness: 0.6, roughness: 0.45 } ),
	// Slide rail: grey steel panels in yellow posts.
	railPanel: paint( 0x7a8187, { metalness: 0.5, roughness: 0.55 } ),
	railPost: paint( 0xe0a11b ),
	aluminium: paint( 0xc9ced3, { metalness: 0.7, roughness: 0.35 } ),
	cylinder: paint( 0xf2b705, { roughness: 0.45 } ),
	rod: paint( 0xe4e7ea, { metalness: 0.9, roughness: 0.2 } ),
	// Sheets are drawn as a single surface, seen from both sides.
	sheet: paint( 0x7a7169, { metalness: 0.2, roughness: 0.75, side: DoubleSide } ),
	pile: paint( 0x6a6e70, { metalness: 0.3, roughness: 0.65 } ),
	waler: paint( 0x3f5468, { metalness: 0.4, roughness: 0.6 } ),
	strut: paint( 0x8a8f94, { metalness: 0.6, roughness: 0.5 } ),
	timber: paint( 0x9a764b, { metalness: 0, roughness: 0.9 } ),
	// Dug earth, as the terrain draws it (CUT_COLOUR in terrain.js).
	earth: paint( 0x6d5a47, { metalness: 0, roughness: 1 } ),
};
for ( const [ name, material ] of Object.entries( PAINT ) ) material.name = `shoring ${ name }`;

const UNIT_BOX = new BoxGeometry( 1, 1, 1 ).toNonIndexed();
const tubes = new Map();
function unitTube( segments ) {

	if ( ! tubes.has( segments ) ) tubes.set( segments, new CylinderGeometry( 1, 1, 1, segments ).toNonIndexed() );
	return tubes.get( segments );

}

const LUG = new TorusGeometry( 0.07, 0.018, 6, 12 ).rotateY( Math.PI / 2 ).toNonIndexed();

// Collects boxes, pipes and other shapes per material, then merges them into one mesh per
// material. Positions are in metres in whatever frame the caller builds in.
export class Parts {

	constructor() {

		this.lists = new Map(); // material -> [ geometry ]

	}

	add( material, geometry ) {

		if ( ! this.lists.has( material ) ) this.lists.set( material, [] );
		// Merging needs them all alike, and the unit shapes are drawn without an index.
		this.lists.get( material ).push( geometry.index ? geometry.toNonIndexed() : geometry );
		return this;

	}

	// A box [ sx, sy, sz ] with its base at y, centred on x and z, turned `yaw` about the vertical
	// (so with yaw = 90° its sz runs along x).
	box( material, [ sx, sy, sz ], [ x = 0, y = 0, z = 0 ] = [], yaw = 0 ) {

		_q.setFromAxisAngle( UP, yaw );
		_m.compose( _p.set( x, y + sy / 2, z ), _q, _s.set( sx, sy, sz ) );
		return this.add( material, UNIT_BOX.clone().applyMatrix4( _m ) );

	}

	// A round bar or pipe of `radius` from point a to point b.
	rod( material, radius, a, b, segments = 10 ) {

		_dir.subVectors( b, a );
		const length = _dir.length();
		_q.setFromUnitVectors( UP, _dir.normalize() );
		_m.compose( _p.addVectors( a, b ).multiplyScalar( 0.5 ), _q, _s.set( radius, length, radius ) );
		return this.add( material, unitTube( segments ).clone().applyMatrix4( _m ) );

	}

	// A lifting eye standing on a panel's top edge, in the plane of a panel running along z.
	lug( material, x, y, z ) {

		return this.add( material, LUG.clone().translate( x, y + 0.06, z ) );

	}

	// One mesh per material, added to `group`.
	build( group = new Group() ) {

		for ( const [ material, list ] of this.lists ) {

			const mesh = new Mesh( mergeGeometries( list ), material );
			group.add( mesh );

		}

		this.lists.clear();
		return group;

	}

}

// --- trench boxes ------------------------------------------------------------------------------

// One side panel of a trench box, `length` along z and `height` tall, its outer face towards
// `side` (-1 or 1) at x = x0 + side * PANEL / 2: plate, stiffening ribs down the outer face, a
// channel along the top and the collar posts on the inner face where the spreaders pin on.
function trenchPanel( parts, { x0, y0, z0, length, height, side, inset } ) {

	parts.box( PAINT.box, [ PANEL, height, length ], [ x0, y0, z0 ] );
	const ribs = Math.max( 2, Math.round( length / 0.6 ) );
	for ( let i = 0; i <= ribs; i ++ ) {

		const z = z0 - length / 2 + 0.05 + i * ( length - 0.1 ) / ribs;
		parts.box( PAINT.boxTrim, [ 0.03, height - 0.06, 0.07 ], [ x0 + side * ( PANEL / 2 + 0.015 ), y0 + 0.03, z ] );

	}

	parts.box( PAINT.boxTrim, [ PANEL + 0.03, 0.06, length ], [ x0, y0 + height - 0.06, z0 ] );
	for ( const end of [ - 1, 1 ] ) {

		const z = z0 + end * ( length / 2 - inset );
		parts.box( PAINT.boxTrim, [ 0.05, height, 0.3 ], [ x0 - side * ( PANEL / 2 + 0.025 ), y0, z ] );
		parts.lug( PAINT.boxTrim, x0, y0 + height, z );

	}

}

// A steel trench box, or a stacker (anything under 2 m tall) on top of one: two side panels
// `length` along z and `height` tall, `width` apart outside, centred on x = 0 and z = z0 with its
// base at y0. Spreaders join them near both ends: near the top and the bottom of a box, at
// mid-height in a stacker.
export function trenchBox( parts, { length, height, width, y0 = 0, z0 = 0 } ) {

	const inside = width - 2 * PANEL;
	const inset = Math.min( 0.6, length / 4 );
	for ( const side of [ - 1, 1 ] ) trenchPanel( parts, { x0: side * ( width - PANEL ) / 2, y0, z0, length, height, side, inset } );
	const rows = height < 2 ? [ height / 2 ] : [ 0.55, height - 0.45 ];
	for ( const end of [ - 1, 1 ] ) {

		const z = z0 + end * ( length / 2 - inset );
		for ( const y of rows ) {

			const a = new Vector3( - inside / 2, y0 + y, z );
			const b = new Vector3( inside / 2, y0 + y, z );
			parts.rod( PAINT.spreader, SPREADER, a, b, 12 );
			// Collars over the pipe ends, pinned to the panels.
			for ( const s of [ - 1, 1 ] ) parts.rod( PAINT.boxTrim, 0.11, new Vector3( s * inside / 2, y0 + y, z ), new Vector3( s * ( inside / 2 - 0.3 ), y0 + y, z ), 12 );

		}

	}

}

// Rough steel weight of a box: about 105 kg/m² of double-walled panel, and 30 kg/m of spreader
// pipe plus 50 kg of collars and pins for each spreader.
export function trenchBoxWeight( { length, height, width } ) {

	const spreaders = height < 2 ? 2 : 4;
	return 2 * length * height * 105 + spreaders * ( 30 * ( width - 2 * PANEL ) + 50 );

}

// --- sheet and H-piles -------------------------------------------------------------------------

// A Z-sheet's cross-section as a thin closed outline, across x (0 to SHEET.width) and up y,
// centred on y = 0: flange, web, flange.
function sheetSection() {

	const { width, depth, flange, plate } = SHEET;
	const h = depth / 2;
	const t = plate / 2;
	const line = [ [ 0, h ], [ flange, h ], [ width - flange, - h ], [ width, - h ] ];
	const outline = [ ...line.map( ( [ x, y ] ) => new Vector2( x, y + t ) ), ...line.slice().reverse().map( ( [ x, y ] ) => new Vector2( x, y - t ) ) ];
	return new Shape( outline );

}

// A wall of sheets as one surface standing from y0 to y1 along a closed loop of points [ x, z ]
// (the corrugations already in it). Each face is flat-shaded, so the corrugations read.
export function sheetWall( points, y0, y1 ) {

	const count = points.length;
	const positions = new Float32Array( count * 18 );
	const normals = new Float32Array( count * 18 );
	for ( let i = 0; i < count; i ++ ) {

		const [ ax, az ] = points[ i ];
		const [ bx, bz ] = points[ ( i + 1 ) % count ];
		// Facing the way the triangles wind, so both sides light properly (DoubleSide flips it).
		const length = Math.hypot( bx - ax, bz - az ) || 1;
		const nx = - ( bz - az ) / length;
		const nz = ( bx - ax ) / length;
		const quad = [ ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az ];
		positions.set( quad, i * 18 );
		for ( let v = 0; v < 6; v ++ ) normals.set( [ nx, 0, nz ], i * 18 + v * 3 );

	}

	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new BufferAttribute( positions, 3 ) );
	geometry.setAttribute( 'normal', new BufferAttribute( normals, 3 ) );
	geometry.setAttribute( 'uv', new BufferAttribute( new Float32Array( count * 12 ), 2 ) );
	return geometry;

}

// An H-pile standing from y0 to y1 at (x, z), its flanges facing along `normal` (yaw 0: x).
export function hPile( parts, { x, z, y0, y1, yaw = 0 } ) {

	const { depth, flange, plate } = H_PILE;
	const height = y1 - y0;
	const c = Math.cos( yaw );
	const s = Math.sin( yaw );
	// The flanges sit either side of the web, across the pile's depth.
	for ( const side of [ - 1, 1 ] ) {

		const d = side * ( depth - plate ) / 2;
		parts.box( PAINT.pile, [ plate, height, flange ], [ x + d * c, y0, z - d * s ], yaw );

	}

	parts.box( PAINT.pile, [ depth - 2 * plate, height, plate ], [ x, y0, z ], yaw );

}

// --- library pieces ------------------------------------------------------------------------------

// Assembled box standing as on site, spread for 1.5 m (5 ft) inside, open ends facing -Z and +Z.
export function trenchBoxItem( lengthFt, heightFt = 8 ) {

	const parts = new Parts();
	trenchBox( parts, { length: lengthFt * FT, height: heightFt * FT, width: 1.52 + 2 * PANEL } );
	return parts.build();

}

// One 8 x 20 ft panel lying flat on timbers, ribs up, as it's delivered and stacked.
export function trenchPanelItem() {

	const parts = new Parts();
	const length = 20 * FT;
	const height = 8 * FT;
	const lift = 0.1;
	for ( const z of [ - length / 2 + 0.7, 0, length / 2 - 0.7 ] ) parts.box( PAINT.timber, [ height + 0.3, lift, 0.1 ], [ 0, 0, z ] );
	parts.box( PAINT.box, [ height, PANEL, length ], [ 0, lift, 0 ] );
	const ribs = Math.round( length / 0.6 );
	for ( let i = 0; i <= ribs; i ++ ) parts.box( PAINT.boxTrim, [ height - 0.06, 0.03, 0.07 ], [ 0, lift + PANEL, - length / 2 + 0.05 + i * ( length - 0.1 ) / ribs ] );
	parts.box( PAINT.boxTrim, [ 0.06, PANEL + 0.03, length ], [ height / 2 - 0.03, lift, 0 ] );
	for ( const end of [ - 1, 1 ] ) parts.lug( PAINT.boxTrim, 0, lift + PANEL, end * ( length / 2 - 0.6 ) );
	return parts.build();

}

// Ten 12 m Z-sheets, nested five high in two rows on timbers. Long side along Z.
export function sheetPileBundle() {

	const parts = new Parts();
	const length = 12;
	const section = new ExtrudeGeometry( sheetSection(), { depth: length, bevelEnabled: false } ).translate( 0, 0, - length / 2 );
	const lift = 0.1;
	for ( const z of [ - 5, 0, 5 ] ) parts.box( PAINT.timber, [ 2 * SHEET.width + 0.4, lift, 0.1 ], [ 0, 0, z ] );
	for ( const row of [ 0, 1 ] ) {

		for ( let layer = 0; layer < 5; layer ++ ) {

			const x = row ? 0.03 : - SHEET.width - 0.03;
			parts.add( PAINT.sheet, section.clone().translate( x, lift + SHEET.depth / 2 + SHEET.plate / 2 + layer * 0.03, 0 ) );

		}

	}

	section.dispose();
	return parts.build();

}

// Seven 12 m HP310 piles lying web up: four on the timbers, three on more timbers above.
export function hPileBundle() {

	const parts = new Parts();
	const length = 12;
	const { depth, flange, plate } = H_PILE;
	const lift = 0.1;
	const pitch = flange + 0.03;
	const layer = ( count, y ) => {

		for ( const z of [ - 5, 0, 5 ] ) parts.box( PAINT.timber, [ 4 * pitch + 0.2, lift, 0.1 ], [ 0, y - lift, z ] );
		for ( let i = 0; i < count; i ++ ) {

			const x = ( i - ( count - 1 ) / 2 ) * pitch;
			for ( const top of [ 0, 1 ] ) parts.box( PAINT.pile, [ flange, plate, length ], [ x, y + top * ( depth - plate ), 0 ] );
			parts.box( PAINT.pile, [ plate, depth - 2 * plate, length ], [ x, y + plate, 0 ] );

		}

	};
	layer( 4, lift );
	layer( 3, 2 * lift + depth );
	return parts.build();

}

// An aluminium hydraulic shore lying flat as it's stored: two 2.4 m (8 ft) rails closed up to
// about 0.9 m outside, and two cylinders, the lower one 0.75 m from the bottom.
export function hydraulicShoreItem() {

	const parts = new Parts();
	const length = 8 * FT;
	const rail = { across: 0.09, high: 0.07 };
	const half = 0.4;
	for ( const x of [ - half, half ] ) parts.box( PAINT.aluminium, [ rail.across, rail.high, length ], [ x, 0, 0 ] );
	for ( const z of [ length / 2 - 0.45, - length / 2 + 0.75 ] ) hydraulicCylinder( parts, new Vector3( - half + rail.across / 2, 0.045, z ), new Vector3( half - rail.across / 2, 0.045, z ) );
	return parts.build();

}

// A hydraulic cylinder from a to b with a foot plate at each end: the body takes most of the
// span when closed, and the chromed rod the rest.
export function hydraulicCylinder( parts, a, b ) {

	const split = a.clone().lerp( b, Math.min( 0.75, 0.55 + 0.2 / Math.max( 1, a.distanceTo( b ) ) ) );
	parts.rod( PAINT.cylinder, 0.045, a, split, 10 );
	parts.rod( PAINT.rod, 0.022, split, b, 8 );
	_dir.subVectors( b, a ).normalize();
	const yaw = Math.atan2( _dir.x, _dir.z );
	for ( const end of [ a, b ] ) parts.box( PAINT.cylinder, [ 0.14, 0.14, 0.03 ], [ end.x, end.y - 0.07, end.z ], yaw );

}
