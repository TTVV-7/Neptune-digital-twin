import {
	BoxGeometry,
	CylinderGeometry,
	ExtrudeGeometry,
	Group,
	MathUtils,
	Matrix4,
	Mesh,
	MeshStandardMaterial,
	Object3D,
	Shape,
	Vector2,
	Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// A crawler excavator built in code, with real pivots: the house swings on the undercarriage, the
// boom turns at its foot pin, the stick at the boom tip and the bucket at the stick tip. The
// hydraulic cylinders and the bucket linkage follow whatever the joints do. Generic, no brand.
//
// Like the other built-in pieces it stands on y = 0 with its front facing -Z (right is +X), and the
// swing axis is at x = z = 0. group.userData.rig drives it (see createRig):
//   rig.setPose( { swing, boom, stick, bucket } )   joint angles in radians: swing turns the house
//       left (as seen from above), boom is the foot-to-tip line above horizontal, stick and bucket
//       are relative to the part they hang from (negative folds them in)
//   rig.solve( { u, v, phi } ) -> pose   the joint angles that put the bucket's tooth tips u metres
//       ahead of the swing axis and v above the ground, with the teeth pointing at angle phi
//       (0 = straight ahead, -90° = down, -180° = back towards the machine)
//   rig.rest   the parked pose: arm folded, bucket resting on the ground in front

const DEG = MathUtils.DEG2RAD;

// Dimensions in metres. Arm parts are drawn from the 20 t shapes below, scaled to their lengths.
export const EXCAVATOR_20T = {
	detail: 1,
	track: { length: 4.45, height: 0.92, shoe: 0.8, width: 3.2, rollers: 7, carriers: 2, pitch: 0.19, rubber: false },
	// Underside of the house (the swing bearing).
	swing: 1.0,
	house: { width: 2.9, front: - 1.95, back: 1.75, tail: 2.8, deck: 1.3, hood: 2.45, counterweight: 2.35 },
	cab: { width: 1.0, front: - 1.95, length: 1.85, top: 3.0 },
	compartment: { front: - 1.55, top: 2.2 },
	// The boom foot pin: across, up, along (ahead is -z).
	foot: [ 0.1, 2.05, - 0.75 ],
	boom: 5.7,
	stick: 2.9,
	bucket: { radius: 1.45, width: 1.2, volume: 1.0, teeth: 5 },
	blade: null,
	limits: { boom: [ - 35, 58 ], stick: [ - 150, - 25 ], bucket: [ - 140, 45 ] },
	rest: { reach: 5.0, angle: - 190 },
	// Digging (excavator.js): reach range from the swing axis, where it dumps, how far the bucket
	// drags per pass, how deep it may dig, and the cycle's speed (1 = about 5.5 s).
	work: { reach: [ 3.5, 8.5 ], dump: 5.5, drag: 1.5, maxDepth: 6, time: 1, turn: 25 },
};

// A 3.5 t mini excavator: short tail, rubber tracks, a dozer blade at the front.
export const EXCAVATOR_MINI = {
	detail: 0.45,
	track: { length: 2.1, height: 0.47, shoe: 0.3, width: 1.74, rollers: 4, carriers: 1, pitch: 0.09, rubber: true },
	swing: 0.47,
	house: { width: 1.56, front: - 0.8, back: 0.36, tail: 0.92, deck: 0.62, hood: 1.18, counterweight: 1.1 },
	cab: { width: 0.94, front: - 0.7, length: 1.05, top: 2.5 },
	compartment: { front: - 0.7, top: 1.12 },
	foot: [ 0.1, 0.92, - 1.0 ],
	boom: 2.55,
	stick: 1.4,
	bucket: { radius: 0.72, width: 0.5, volume: 0.1, teeth: 3 },
	blade: { width: 1.74, height: 0.38, ahead: 1.45 },
	limits: { boom: [ - 35, 62 ], stick: [ - 150, - 25 ], bucket: [ - 140, 45 ] },
	rest: { reach: 2.5, angle: - 190 },
	work: { reach: [ 2, 4.4 ], dump: 2.9, drag: 0.75, maxDepth: 3, time: 0.8, turn: 30 },
};

// Side profiles as [ along, up ], for a 5.7 m boom, a 2.9 m stick and a 1.45 m bucket (pin to
// tooth tips). The boom is bent upward (a "banana" boom) between its foot pin at the origin and
// the stick pin at [ 5.7, 0 ].
const BOOM_SHAPE = [ [ - 0.32, - 0.05 ], [ - 0.2, 0.28 ], [ 0.9, 0.62 ], [ 2.5, 0.82 ], [ 3.1, 0.78 ], [ 4.5, 0.44 ], [ 5.6, 0.2 ], [ 5.92, 0.06 ], [ 5.92, - 0.12 ], [ 5.7, - 0.3 ], [ 5.45, - 0.3 ], [ 3.2, 0.1 ], [ 2.4, 0.06 ], [ 1.0, - 0.12 ], [ 0.25, - 0.3 ], [ - 0.12, - 0.32 ] ];
const BOOM_RAM_END = [ 2.6, - 0.05 ];
const BOOM_RAM_BASE = [ 0.25, - 1.0 ]; // from the foot pin, in the house
const STICK_RAM_BASE = [ 2.7, 0.95 ];
// The stick, from its pivot at the boom tip to the bucket pin at [ 2.9, 0 ], with a tail behind
// the pivot for its cylinder.
const STICK_SHAPE = [ [ - 0.85, 0.22 ], [ - 0.72, 0.4 ], [ - 0.25, 0.44 ], [ 0.5, 0.36 ], [ 2.0, 0.26 ], [ 2.82, 0.17 ], [ 3.02, 0.05 ], [ 3.02, - 0.1 ], [ 2.85, - 0.2 ], [ 1.3, - 0.25 ], [ 0.25, - 0.3 ], [ - 0.3, - 0.24 ], [ - 0.82, 0.04 ] ];
const STICK_RAM_END = [ - 0.75, 0.25 ];
const BUCKET_RAM_BASE = [ 0.35, 0.62 ];
// Bucket linkage: a side link from the stick to the cylinder's rod end, and an H-link from there
// to the bucket. LINK_PIVOT is on the stick (from the bucket pin), LINK_PIN on the bucket.
const LINK_PIVOT = [ - 0.42, 0.1 ];
const LINK_PIN = [ - 0.1, 0.38 ];
const LINK_LENGTH = 0.5;
// The bucket's shell, from the top lip of its mouth round the back to the cutting edge. Its pin is
// at the origin; the mouth faces -up, towards the machine when the stick hangs down.
const BUCKET_SHELL = [ [ 0.2, - 0.5 ], [ 0.1, - 0.36 ], [ 0.08, - 0.1 ], [ 0.12, 0.16 ], [ 0.3, 0.35 ], [ 0.62, 0.45 ], [ 0.95, 0.43 ], [ 1.2, 0.32 ], [ 1.36, 0.13 ], [ 1.4, - 0.06 ] ];
const BUCKET_EARS = [ [ 0.16, - 0.2 ], [ 0.16, 0.42 ], [ - 0.04, 0.53 ], [ - 0.21, 0.42 ], [ - 0.14, 0.14 ], [ - 0.08, - 0.13 ] ];
// What a full bucket holds: the inside of the shell, heaped out of the mouth.
const BUCKET_LOAD = [ [ 0.24, - 0.46 ], [ 0.15, - 0.1 ], [ 0.19, 0.14 ], [ 0.35, 0.3 ], [ 0.63, 0.38 ], [ 0.94, 0.36 ], [ 1.16, 0.26 ], [ 1.3, 0.1 ], [ 1.34, - 0.06 ], [ 1.0, - 0.36 ], [ 0.6, - 0.56 ] ];
const TOOTH_ANGLE = - 80 * DEG;
const TOOTH_LENGTH = 0.2;

// --- materials -------------------------------------------------------------------------------

const materials = new Map();
function mat( color, { roughness = 0.6, metalness = 0.1, ...rest } = {} ) {

	const key = JSON.stringify( [ color, roughness, metalness, rest ] );
	if ( ! materials.has( key ) ) {

		const material = new MeshStandardMaterial( { color, roughness, metalness, ...rest } );
		material.userData.shared = true;
		materials.set( key, material );

	}

	return materials.get( key );

}

const PAINT = () => mat( 0xf2b200, { roughness: 0.5, metalness: 0.15 } );
const DARK = () => mat( 0x2c2e31, { roughness: 0.7, metalness: 0.2 } );
const BLACK = () => mat( 0x18191b, { roughness: 0.8 } );
const STEEL = () => mat( 0x5d6166, { roughness: 0.55, metalness: 0.6 } );
const CHROME = () => mat( 0xd7dbdf, { roughness: 0.2, metalness: 0.9 } );
const GLASS = () => mat( 0x2b3d48, { roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.55 } );
const SOIL = () => mat( 0x6e5844, { roughness: 1, metalness: 0 } );

// --- geometry helpers ------------------------------------------------------------------------

const _m = new Matrix4();
const _a = new Vector3();
const _b = new Vector3();
const _dir = new Vector3();
const UP = new Vector3( 0, 1, 0 );
const X_AXIS = new Vector3( 1, 0, 0 );
const FORWARD = new Vector3( 0, 0, - 1 );

// A box of size [x, y, z] whose base sits at height y0, centred on (x0, z0).
function box( parent, material, [ sx, sy, sz ], [ x0 = 0, y0 = 0, z0 = 0 ] = [] ) {

	const mesh = new Mesh( new BoxGeometry( sx, sy, sz ), material );
	mesh.position.set( x0, y0 + sy / 2, z0 );
	parent.add( mesh );
	return mesh;

}

// A cylinder lying across x (a wheel, roller or pin), centred on (x, y, z).
function axle( parent, material, radius, width, [ x, y, z ], segments = 16 ) {

	const mesh = new Mesh( new CylinderGeometry( radius, radius, width, segments ).rotateZ( Math.PI / 2 ), material );
	mesh.position.set( x, y, z );
	parent.add( mesh );
	return mesh;

}

// A side profile (points [ along, up ], along pointing -Z) extruded across x by `width`, centred on x0.
function side( parent, material, points, width, x0 = 0 ) {

	const shape = new Shape( points.map( ( [ f, y ] ) => new Vector2( f, y ) ) );
	const geometry = new ExtrudeGeometry( shape, { depth: width, bevelEnabled: false, curveSegments: 4 } );
	// Shape x -> -z (ahead), shape y -> y, extrusion -> x.
	geometry.rotateY( Math.PI / 2 );
	geometry.translate( x0 - width / 2, 0, 0 );
	const mesh = new Mesh( geometry, material );
	parent.add( mesh );
	return mesh;

}

// A plan shape (points [ x, z ]) extruded upward from y0 to y1.
function plan( parent, material, points, y0, y1 ) {

	const shape = new Shape( points.map( ( [ x, z ] ) => new Vector2( x, - z ) ) );
	const geometry = new ExtrudeGeometry( shape, { depth: y1 - y0, bevelEnabled: false } );
	geometry.rotateX( - Math.PI / 2 );
	geometry.translate( 0, y0, 0 );
	const mesh = new Mesh( geometry, material );
	parent.add( mesh );
	return mesh;

}

// A curve [ along, up ] made into a plate `thickness` thick (on the side towards `inside`) and
// extruded across x by `width`: the bucket's shell.
function plate( parent, material, points, thickness, width, inside ) {

	const offset = points.map( ( p, i ) => {

		const a = points[ Math.max( 0, i - 1 ) ];
		const b = points[ Math.min( points.length - 1, i + 1 ) ];
		let nx = - ( b[ 1 ] - a[ 1 ] );
		let ny = b[ 0 ] - a[ 0 ];
		const length = Math.hypot( nx, ny );
		nx /= length;
		ny /= length;
		if ( nx * ( inside[ 0 ] - p[ 0 ] ) + ny * ( inside[ 1 ] - p[ 1 ] ) < 0 ) [ nx, ny ] = [ - nx, - ny ];
		return [ p[ 0 ] + nx * thickness, p[ 1 ] + ny * thickness ];

	} );
	return side( parent, material, [ ...points, ...offset.reverse() ], width );

}

// Several geometries already placed in the parent's frame, drawn as one mesh.
function merged( parent, material, geometries ) {

	const mesh = new Mesh( mergeGeometries( geometries ), material );
	for ( const geometry of geometries ) geometry.dispose();
	parent.add( mesh );
	return mesh;

}

const scaled = ( points, sf, sy = sf ) => points.map( ( [ f, y ] ) => [ f * sf, y * sy ] );
// [ along, up ] in a part's frame as a Vector3 (along points -Z), across at x.
const at = ( [ f, y ], x = 0, target = new Vector3() ) => target.set( x, y, - f );

// --- the machine -----------------------------------------------------------------------------

export function buildExcavator( spec ) {

	const group = new Group();
	undercarriage( group, spec );
	const house = new Group();
	house.name = 'house';
	group.add( house );
	upperStructure( house, spec );
	const arm = buildArm( house, spec );
	group.userData.rig = createRig( spec, house, arm );
	return group;

}

function undercarriage( group, spec ) {

	const { track } = spec;
	const gauge = track.width - track.shoe;
	for ( const x of [ - gauge / 2, gauge / 2 ] ) crawler( group, track, x, Math.sign( x ) );

	// Car body joining the two track frames, and the swing bearing on top of it.
	const r = track.height / 2;
	box( group, DARK(), [ gauge - track.shoe * 0.3, r * 0.9, track.length * 0.36 ], [ 0, r * 0.75, 0 ] );
	box( group, DARK(), [ gauge * 0.42, r * 0.9, track.length * 0.62 ], [ 0, r * 0.75, 0 ] );
	const ring = new Mesh( new CylinderGeometry( spec.house.width * 0.32, spec.house.width * 0.34, spec.swing - r * 1.65, 32 ), BLACK() );
	ring.position.y = ( spec.swing + r * 1.65 ) / 2;
	group.add( ring );

	if ( spec.blade ) dozerBlade( group, spec );

}

// One track: shoes round an idler at the front and a sprocket at the back, rollers underneath.
function crawler( group, track, x0, outward ) {

	const { length, height, shoe, pitch, rubber } = track;
	const R = height / 2;
	const straight = length - height;
	const thick = height * 0.065;
	const grouser = height * 0.04;
	const linkHeight = rubber ? 0 : height * 0.11;
	// Centre line of the shoe plates.
	const rp = R - grouser - thick / 2;
	const perimeter = 2 * straight + 2 * Math.PI * rp;
	const count = Math.round( perimeter / pitch );
	const step = perimeter / count;

	const shoes = [];
	const links = [];
	const normal = new Vector3();
	const position = new Vector3();
	const across = new Vector3();
	for ( let i = 0; i < count; i ++ ) {

		loopPoint( ( i + 0.5 ) * step, straight, rp, R, position, normal );
		position.x = x0;
		across.crossVectors( X_AXIS, normal );
		_m.makeBasis( X_AXIS, normal, across ).setPosition( position );
		shoes.push( new BoxGeometry( shoe, thick, step * ( rubber ? 1 : 0.92 ) ).applyMatrix4( _m ) );
		if ( ! rubber || i % 2 === 0 ) {

			// The grouser bar across each steel shoe (lugs on every other one on rubber).
			const bar = new BoxGeometry( shoe * ( rubber ? 0.8 : 1 ), grouser, step * ( rubber ? 0.5 : 0.22 ) ).translate( 0, thick / 2 + grouser / 2, 0 );
			shoes.push( bar.applyMatrix4( _m ) );

		}

		if ( linkHeight > 0 ) {

			for ( const dx of [ - shoe * 0.21, shoe * 0.21 ] ) {

				links.push( new BoxGeometry( shoe * 0.09, linkHeight, step * 0.98 ).translate( dx, - thick / 2 - linkHeight / 2, 0 ).applyMatrix4( _m ) );

			}

		}

	}

	merged( group, rubber ? BLACK() : STEEL(), shoes );
	if ( links.length ) merged( group, DARK(), links );

	// Idler (front), sprocket (back) and the rollers the frame runs on.
	const inner = rp - thick / 2 - linkHeight;
	const wheels = [];
	for ( const z of [ - straight / 2, straight / 2 ] ) wheels.push( new CylinderGeometry( inner, inner, shoe * 0.42, 24 ).rotateZ( Math.PI / 2 ).translate( x0, R, z ) );
	const teeth = 12;
	for ( let i = 0; i < teeth; i ++ ) {

		const angle = i / teeth * Math.PI * 2;
		const tooth = new BoxGeometry( shoe * 0.3, inner * 0.3, inner * 0.22 ).translate( 0, inner * 0.98, 0 ).rotateX( angle ).translate( x0, R, straight / 2 );
		wheels.push( tooth );

	}

	const rollerRadius = Math.min( height * 0.11, ( straight / ( track.rollers - 1 ) ) * 0.42 );
	const bottom = R - rp + thick / 2 + linkHeight;
	for ( let i = 0; i < track.rollers; i ++ ) {

		const z = MathUtils.lerp( - straight / 2 + R * 0.95, straight / 2 - R * 0.95, i / ( track.rollers - 1 ) );
		wheels.push( new CylinderGeometry( rollerRadius, rollerRadius, shoe * 0.5, 14 ).rotateZ( Math.PI / 2 ).translate( x0, bottom + rollerRadius, z ) );

	}

	const top = R + rp - thick / 2 - linkHeight;
	for ( let i = 0; i < track.carriers; i ++ ) {

		const z = track.carriers === 1 ? 0 : MathUtils.lerp( - straight / 4, straight / 4, i / ( track.carriers - 1 ) );
		wheels.push( new CylinderGeometry( rollerRadius * 0.8, rollerRadius * 0.8, shoe * 0.3, 12 ).rotateZ( Math.PI / 2 ).translate( x0, top - rollerRadius * 0.8, z ) );

	}

	merged( group, DARK(), wheels );

	// Track frame between the rollers, and the final drive housing on the inner side of the sprocket.
	box( group, DARK(), [ shoe * 0.5, ( top - bottom ) * 0.52, straight - R * 0.6 ], [ x0, bottom + rollerRadius * 1.4, 0 ] );
	axle( group, DARK(), inner * 0.78, shoe * 0.32, [ x0 - outward * shoe * 0.36, R, straight / 2 ], 20 );
	axle( group, STEEL(), inner * 0.35, shoe * 0.46, [ x0, R, - straight / 2 ], 12 );

}

// Where the shoe plates' centre line is, `s` metres round the loop from the front of the bottom
// run: along the ground to the sprocket, round it, back along the top and round the idler.
function loopPoint( s, straight, rp, R, position, normal ) {

	const arc = Math.PI * rp;
	if ( s < straight ) {

		normal.set( 0, - 1, 0 );
		position.set( 0, R - rp, - straight / 2 + s );

	} else if ( s < straight + arc ) {

		const a = ( s - straight ) / rp;
		normal.set( 0, - Math.cos( a ), Math.sin( a ) );
		position.set( 0, R, straight / 2 ).addScaledVector( normal, rp );

	} else if ( s < 2 * straight + arc ) {

		normal.set( 0, 1, 0 );
		position.set( 0, R + rp, straight / 2 - ( s - straight - arc ) );

	} else {

		const a = ( s - 2 * straight - arc ) / rp;
		normal.set( 0, Math.cos( a ), - Math.sin( a ) );
		position.set( 0, R, - straight / 2 ).addScaledVector( normal, rp );

	}

}

// The dozer blade across the front of a mini excavator, on two push arms.
function dozerBlade( group, spec ) {

	const { blade, track } = spec;
	const h = blade.height;
	const a = blade.ahead;
	// A curved moldboard, its cutting edge at the bottom.
	side( group, PAINT(), [ [ a + 0.06, 0 ], [ a + 0.02, h * 0.35 ], [ a + 0.02, h * 0.7 ], [ a + 0.07, h ], [ a - 0.03, h ], [ a - 0.08, h * 0.5 ], [ a - 0.05, 0.02 ] ], blade.width );
	box( group, STEEL(), [ blade.width, 0.03, 0.1 ], [ 0, 0, - a - 0.02 ] );
	for ( const x of [ - blade.width * 0.3, blade.width * 0.3 ] ) {

		const from = new Vector3( x, h * 0.5, - a + 0.06 );
		const to = new Vector3( x, track.height * 0.5, - track.length * 0.22 );
		const arm = new Mesh( new BoxGeometry( 0.09, 0.09, from.distanceTo( to ) ), PAINT() );
		arm.position.addVectors( from, to ).multiplyScalar( 0.5 );
		group.add( arm );
		arm.lookAt( to );

	}

}

// The house: deck, cab, engine hood, counterweight, the tank and tool compartment beside the
// boom, and the brackets the boom and its cylinders hang from.
function upperStructure( house, spec ) {

	const { house: h, cab, compartment, foot, detail: k } = spec;
	const W = h.width;
	const boomWidth = 0.56 * k;
	const ramX = boomWidth / 2 + 0.14 * k;
	const cabBack = cab.front + cab.length;

	// The deck reaches forward under the boom foot (a mini's foot is ahead of the house).
	const front = Math.min( h.front, foot[ 2 ] - 0.35 * k );
	box( house, DARK(), [ W - 0.04, h.deck - spec.swing, h.back - front ], [ 0, spec.swing, ( front + h.back ) / 2 ] );

	// Counterweight: the back of the house, curved to the tail swing radius.
	const arc = [];
	for ( let i = 0; i <= 16; i ++ ) {

		const x = MathUtils.lerp( W / 2, - W / 2, i / 16 );
		arc.push( [ x, Math.sqrt( h.tail * h.tail - x * x ) ] );

	}

	plan( house, PAINT(), [ [ - W / 2, h.back ], [ W / 2, h.back ], ...arc ], spec.swing, h.counterweight );
	plan( house, DARK(), [ [ - W / 2 - 0.01, h.back ], [ W / 2 + 0.01, h.back ], ...arc.map( ( [ x, z ] ) => [ x * 1.004, z + 0.01 ] ) ], spec.swing, spec.swing + 0.14 * k );

	// Engine hood between the cab and the counterweight, with a grille and the exhaust.
	if ( h.back - cabBack > 0.1 ) {

		const length = h.back - cabBack;
		box( house, PAINT(), [ W, h.hood - h.deck, length ], [ 0, h.deck, ( cabBack + h.back ) / 2 ] );
		box( house, BLACK(), [ W * 0.5, 0.02, length * 0.6 ], [ W * 0.12, h.hood, ( cabBack + h.back ) / 2 + length * 0.05 ] );
		const stack = new Mesh( new CylinderGeometry( 0.065 * k, 0.065 * k, 0.4 * k, 12 ), BLACK() );
		stack.position.set( W * 0.3, h.hood + 0.2 * k, cabBack + length * 0.3 );
		house.add( stack );

	}

	// Tanks and tool box on the right of the boom, with a handrail.
	const cx0 = foot[ 0 ] + ramX + 0.16 * k;
	const cw = W / 2 - cx0;
	const cz1 = Math.min( cabBack, h.back );
	box( house, PAINT(), [ cw, compartment.top - h.deck, cz1 - compartment.front ], [ cx0 + cw / 2, h.deck, ( compartment.front + cz1 ) / 2 ] );
	box( house, DARK(), [ cw + 0.01, 0.025 * k, 0.5 * k ], [ cx0 + cw / 2, h.deck + ( compartment.top - h.deck ) * 0.55, compartment.front + 0.4 * k ] );
	const rail = 0.5 * k;
	for ( const z of [ compartment.front + 0.15 * k, ( compartment.front + cz1 ) / 2, cz1 - 0.1 * k ] ) {

		const post = new Mesh( new CylinderGeometry( 0.02 * k, 0.02 * k, rail, 8 ), DARK() );
		post.position.set( W / 2 - 0.08 * k, compartment.top + rail / 2, z );
		house.add( post );

	}

	const top = new Mesh( new CylinderGeometry( 0.022 * k, 0.022 * k, cz1 - compartment.front - 0.25 * k, 8 ).rotateX( Math.PI / 2 ), DARK() );
	top.position.set( W / 2 - 0.08 * k, compartment.top + rail, ( compartment.front + 0.15 * k + cz1 - 0.1 * k ) / 2 );
	house.add( top );

	cabin( house, spec );

	// Boom foot: two plates up to the pin, and the lower brackets of the boom cylinders.
	const footF = - foot[ 2 ];
	for ( const x of [ - boomWidth / 2 - 0.05 * k, boomWidth / 2 + 0.05 * k ] ) {

		side( house, DARK(), [ [ footF - 0.5 * k, h.deck ], [ footF + 0.75 * k, h.deck ], [ footF + 0.2 * k, foot[ 1 ] + 0.18 * k ], [ footF - 0.25 * k, foot[ 1 ] + 0.2 * k ] ], 0.06 * k, foot[ 0 ] + x );

	}

	axle( house, STEEL(), 0.07 * k, boomWidth + 0.26 * k, [ foot[ 0 ], foot[ 1 ], foot[ 2 ] ], 12 );
	const base = ramBase( spec );
	box( house, DARK(), [ ramX * 2 + 0.2 * k, base[ 1 ] - spec.swing + 0.12 * k, 0.36 * k ], [ foot[ 0 ], spec.swing, - base[ 0 ] ] );
	axle( house, STEEL(), 0.06 * k, ramX * 2 + 0.26 * k, [ foot[ 0 ], base[ 1 ], - base[ 0 ] ], 12 );

}

function ramBase( spec ) {

	const q = spec.boom / 5.7;
	return [ - spec.foot[ 2 ] + BOOM_RAM_BASE[ 0 ] * q, spec.foot[ 1 ] + BOOM_RAM_BASE[ 1 ] * q ];

}

// The cab: roof, pillars and tinted glass all round, with the seat and controls inside.
function cabin( house, spec ) {

	const { house: h, cab } = spec;
	// The seat and glass are sized for a person, whatever the machine.
	const k = Math.max( spec.detail, 0.85 );
	const x0 = - h.width / 2 + 0.02;
	const x1 = x0 + cab.width;
	const z0 = cab.front;
	const z1 = cab.front + cab.length;
	const cx = ( x0 + x1 ) / 2;
	const cz = ( z0 + z1 ) / 2;
	const floor = h.deck;
	const sill = floor + 0.35 * k;
	const roof = cab.top - 0.08 * k;
	const pillar = 0.07 * k;

	box( house, DARK(), [ cab.width, 0.06 * k, cab.length ], [ cx, floor, cz ] );
	// Panels under the windows, and the roof.
	box( house, PAINT(), [ cab.width, sill - floor, 0.04 * k ], [ cx, floor, z1 - 0.02 * k ] );
	box( house, PAINT(), [ 0.04 * k, sill - floor, cab.length ], [ x0 + 0.02 * k, floor, cz ] );
	box( house, PAINT(), [ cab.width + 0.06 * k, 0.08 * k, cab.length + 0.06 * k ], [ cx, roof, cz ] );
	for ( const x of [ x0 + pillar / 2, x1 - pillar / 2 ] ) {

		for ( const z of [ z0 + pillar / 2, z1 - pillar / 2 ] ) box( house, BLACK(), [ pillar, roof - floor, pillar ], [ x, floor, z ] );

	}

	// Door pillar on the left.
	box( house, BLACK(), [ pillar * 0.8, roof - floor, pillar * 0.8 ], [ x0 + pillar * 0.4, floor, z0 + cab.length * 0.55 ] );

	const glass = GLASS();
	const pane = 0.015 * k;
	box( house, glass, [ cab.width - pillar * 2, roof - floor - 0.06 * k, pane ], [ cx, floor + 0.03 * k, z0 + pane ] );
	box( house, glass, [ pane, roof - sill, cab.length - pillar * 2 ], [ x0 + pane, sill, cz ] );
	box( house, glass, [ pane, roof - sill - 0.05 * k, cab.length - pillar * 2 ], [ x1 - pane, sill + 0.05 * k, cz ] );
	box( house, glass, [ cab.width - pillar * 2, roof - sill, pane ], [ cx, sill, z1 - pane ] );

	// Seat and the two joystick consoles.
	const seatZ = z1 - cab.length * 0.35;
	box( house, BLACK(), [ 0.5 * k, 0.12 * k, 0.5 * k ], [ cx, floor + 0.38 * k, seatZ ] );
	const back = box( house, BLACK(), [ 0.5 * k, 0.7 * k, 0.1 * k ], [ cx, floor + 0.5 * k, seatZ + 0.27 * k ] );
	back.rotation.x = - 0.15;
	for ( const x of [ cx - 0.36 * k, cx + 0.36 * k ] ) box( house, DARK(), [ 0.16 * k, 0.55 * k, 0.5 * k ], [ x, floor, seatZ - 0.05 * k ] );

}

// Boom, stick and bucket, each a group turning about its pin, and the cylinders between them.
function buildArm( house, spec ) {

	const { foot, detail: k } = spec;
	const q1 = spec.boom / 5.7;
	const q2 = spec.stick / 2.9;
	const qb = spec.bucket.radius / 1.45;
	const boomWidth = 0.56 * k;
	const stickWidth = 0.42 * k;
	const ramX = boomWidth / 2 + 0.14 * k;

	const boom = new Group();
	boom.name = 'boom';
	boom.position.set( foot[ 0 ], foot[ 1 ], foot[ 2 ] );
	house.add( boom );
	side( boom, PAINT(), scaled( BOOM_SHAPE, q1 ), boomWidth );
	// Brackets for the boom cylinders underneath and the stick cylinder on top, hoses along the top.
	const ramEnd = scaled( [ BOOM_RAM_END ], q1 )[ 0 ];
	box( boom, DARK(), [ boomWidth + 0.04 * k, 0.24 * q1, 0.32 * q1 ], [ 0, ramEnd[ 1 ] - 0.08 * q1, - ramEnd[ 0 ] ] );
	axle( boom, STEEL(), 0.055 * k, ramX * 2 + 0.24 * k, [ 0, ramEnd[ 1 ], - ramEnd[ 0 ] ], 12 );
	const stickBase = scaled( [ STICK_RAM_BASE ], q1 )[ 0 ];
	box( boom, DARK(), [ boomWidth * 0.7, 0.3 * q1, 0.36 * q1 ], [ 0, stickBase[ 1 ] - 0.24 * q1, - stickBase[ 0 ] ] );
	for ( const x of [ - boomWidth * 0.2, boomWidth * 0.2 ] ) {

		const hose = side( boom, BLACK(), scaled( [ [ 0.3, 0.42 ], [ 0.9, 0.67 ], [ 2.5, 0.87 ], [ 3.1, 0.83 ], [ 4.5, 0.49 ], [ 5.4, 0.3 ], [ 5.4, 0.25 ], [ 4.5, 0.44 ], [ 3.1, 0.78 ], [ 2.5, 0.82 ], [ 0.9, 0.62 ], [ 0.3, 0.37 ] ], q1 ), 0.05 * k, x );
		hose.userData.noCollide = true;

	}

	const stick = new Group();
	stick.name = 'stick';
	stick.position.set( 0, 0, - spec.boom );
	boom.add( stick );
	side( stick, PAINT(), scaled( STICK_SHAPE, q2 ), stickWidth );
	axle( stick, STEEL(), 0.07 * k, boomWidth + 0.08 * k, [ 0, 0, 0 ], 12 );
	const bucketBase = scaled( [ BUCKET_RAM_BASE ], q2 )[ 0 ];
	box( stick, DARK(), [ stickWidth * 0.8, 0.3 * q2, 0.34 * q2 ], [ 0, bucketBase[ 1 ] - 0.24 * q2, - bucketBase[ 0 ] ] );
	const tail = scaled( [ STICK_RAM_END ], q2 )[ 0 ];
	axle( stick, STEEL(), 0.06 * k, stickWidth + 0.06 * k, [ 0, tail[ 1 ], - tail[ 0 ] ], 12 );
	const pivot = [ spec.stick + LINK_PIVOT[ 0 ] * qb, LINK_PIVOT[ 1 ] * qb ];
	axle( stick, STEEL(), 0.05 * k, stickWidth + 0.14 * k, [ 0, pivot[ 1 ], - pivot[ 0 ] ], 12 );

	const bucket = new Group();
	bucket.name = 'bucket';
	bucket.position.set( 0, 0, - spec.stick );
	stick.add( bucket );
	const load = buildBucket( bucket, spec, stickWidth );

	// Cylinders: two lifting the boom, one moving the stick, one curling the bucket through its links.
	const rams = [
		...[ - ramX, ramX ].map( x => ram( house, 0.1 * k, () => at( ramBase( spec ), foot[ 0 ] + x, _a ), () => at( ramEnd, x, _b ).applyMatrix4( boom.matrix ) ) ),
		ram( boom, 0.11 * k, () => at( stickBase, 0, _a ), () => at( tail, 0, _b ).applyMatrix4( stick.matrix ) ),
		ram( stick, 0.09 * k, () => at( bucketBase, 0, _a ), () => at( linkJoint( spec, bucket.rotation.x ), 0, _b ) ),
	];

	// The links: side plates from the stick to the rod end, and the H-link from there to the bucket.
	const linkGeometry = () => new BoxGeometry( 0.035 * k, 0.12 * qb, LINK_LENGTH * qb + 0.1 * qb ).translate( 0, 0, - LINK_LENGTH * qb / 2 );
	const links = [ - 1, 1 ].map( s => {

		const sideLink = new Mesh( linkGeometry(), DARK() );
		sideLink.position.x = s * ( stickWidth / 2 + 0.04 * k );
		const hLink = new Mesh( linkGeometry(), DARK() );
		hLink.position.x = s * ( stickWidth / 2 - 0.03 * k );
		stick.add( sideLink, hLink );
		return { sideLink, hLink };

	} );
	const jointPin = axle( stick, STEEL(), 0.045 * k, stickWidth + 0.14 * k, [ 0, 0, 0 ], 10 );

	const linkPivot = at( pivot );
	const joint = new Vector3();
	const pin = new Vector3();
	const updateLinks = () => {

		at( linkJoint( spec, bucket.rotation.x ), 0, joint );
		at( linkPin( spec, bucket.rotation.x ), 0, pin );
		jointPin.position.copy( joint );
		for ( const { sideLink, hLink } of links ) {

			point( sideLink, linkPivot, joint );
			point( hLink, joint, pin );

		}

	};

	return { boom, stick, bucket, load, rams, updateLinks };

}

// Turn a part made along -Z so it runs from `from` to `to` (both in its parent's frame).
function point( mesh, from, to ) {

	mesh.position.set( mesh.position.x, from.y, from.z );
	_dir.set( 0, to.y - from.y, to.z - from.z ).normalize();
	mesh.quaternion.setFromUnitVectors( FORWARD, _dir );

}

// The bucket: curved shell, side plates, top plate with the ears for its two pins, cutting edge
// and teeth. Returns the heap of material shown while it's full.
function buildBucket( bucket, spec, stickWidth ) {

	const { width, teeth } = spec.bucket;
	const k = spec.detail;
	const q = spec.bucket.radius / 1.45;
	const shell = scaled( BUCKET_SHELL, q );
	const thickness = 0.035 * Math.max( q, 0.6 );
	const inside = [ 0.75 * q, 0.05 * q ];
	plate( bucket, DARK(), shell, thickness, width, inside );
	for ( const x of [ - width / 2 + thickness / 2, width / 2 - thickness / 2 ] ) side( bucket, DARK(), shell, thickness, x );
	for ( const x of [ - stickWidth / 2 - 0.035 * k, stickWidth / 2 + 0.035 * k ] ) side( bucket, DARK(), scaled( BUCKET_EARS, q ), 0.05 * k, x );
	axle( bucket, STEEL(), 0.075 * k, stickWidth + 0.2 * k, [ 0, 0, 0 ], 12 );
	axle( bucket, STEEL(), 0.06 * k, stickWidth + 0.2 * k, [ 0, LINK_PIN[ 1 ] * q, - LINK_PIN[ 0 ] * q ], 12 );

	// Cutting edge and teeth, pointing on from the bottom of the shell.
	const [ ef, ey ] = shell[ shell.length - 1 ];
	const lip = box( bucket, STEEL(), [ width + 0.02, thickness * 1.6, 0.12 * q ], [ 0, 0, 0 ] );
	lip.position.copy( at( [ ef, ey ] ) );
	lip.rotation.x = TOOTH_ANGLE;
	const toothGeometries = [];
	for ( let i = 0; i < teeth; i ++ ) {

		const x = teeth === 1 ? 0 : ( i / ( teeth - 1 ) - 0.5 ) * ( width - 0.16 * q );
		const tooth = new BoxGeometry( 0.09 * q, 0.06 * q, TOOTH_LENGTH * q ).translate( 0, 0, - TOOTH_LENGTH * q / 2 );
		const tip = new CylinderGeometry( 0.004, 0.04 * q, 0.1 * q, 4 ).rotateX( - Math.PI / 2 ).rotateZ( Math.PI / 4 ).translate( 0, 0, - TOOTH_LENGTH * q - 0.05 * q );
		for ( const g of [ tooth, tip ] ) {

			g.rotateX( TOOTH_ANGLE ).translate( x, ey, - ef );
			toothGeometries.push( g );

		}

	}

	merged( bucket, STEEL(), toothGeometries );

	const load = side( bucket, SOIL(), scaled( BUCKET_LOAD, q ), width - thickness * 3 );
	load.visible = false;
	load.userData.noCollide = true;
	return load;

}

// Bucket linkage, in the stick's frame [ along, up ] for a bucket turned by `angle`: the pin on
// the bucket, and the joint where the side link, the H-link and the cylinder's rod meet.
function linkPin( spec, angle ) {

	const q = spec.bucket.radius / 1.45;
	const [ f, y ] = LINK_PIN;
	const c = Math.cos( angle );
	const s = Math.sin( angle );
	return [ spec.stick + ( f * c - y * s ) * q, ( f * s + y * c ) * q ];

}

function linkJoint( spec, angle ) {

	const q = spec.bucket.radius / 1.45;
	const a = [ spec.stick + LINK_PIVOT[ 0 ] * q, LINK_PIVOT[ 1 ] * q ];
	const b = linkPin( spec, angle );
	const l = LINK_LENGTH * q;
	const dx = b[ 0 ] - a[ 0 ];
	const dy = b[ 1 ] - a[ 1 ];
	const d = Math.max( Math.hypot( dx, dy ), 1e-4 );
	// Two circles of radius l round a and b; take the crossing above the stick.
	const h = Math.sqrt( Math.max( 0, l * l - d * d / 4 ) );
	const mx = ( a[ 0 ] + b[ 0 ] ) / 2;
	const my = ( a[ 1 ] + b[ 1 ] ) / 2;
	let px = - dy / d;
	let py = dx / d;
	if ( py < 0 ) [ px, py ] = [ - px, - py ];
	return [ mx + px * h, my + py * h ];

}

// A hydraulic cylinder between two pins. The barrel hangs from the base pin and the rod from the
// other; they slide into each other as the pins move. Lengths are chosen from the range the
// joints allow so the rod never leaves the barrel and never pokes out of its far end.
function ram( parent, radius, base, end ) {

	const barrelMesh = new Mesh( new CylinderGeometry( radius, radius, 1, 16 ).translate( 0, 0.5, 0 ), BLACK() );
	const rodMesh = new Mesh( new CylinderGeometry( radius * 0.5, radius * 0.5, 1, 12 ).translate( 0, 0.5, 0 ), CHROME() );
	const eye = new Mesh( new CylinderGeometry( radius * 0.8, radius * 0.8, radius * 1.6, 12 ).rotateZ( Math.PI / 2 ), DARK() );
	parent.add( barrelMesh, rodMesh, eye );
	return {
		barrelMesh,
		rodMesh,
		// Called once the range is known (see createRig).
		fit( min, max ) {

			let barrel = min - radius * 1.2;
			let rod = max - barrel + radius * 1.5;
			if ( rod > min - radius ) {

				rod = min - radius;
				barrel = Math.max( barrel, max - rod + radius * 1.5 );

			}

			barrelMesh.scale.y = barrel;
			rodMesh.scale.y = rod;

		},
		length() {

			return base().distanceTo( end() );

		},
		update() {

			const a = base();
			const b = end();
			_dir.subVectors( b, a ).normalize();
			barrelMesh.position.copy( a );
			barrelMesh.quaternion.setFromUnitVectors( UP, _dir );
			eye.position.copy( b );
			rodMesh.position.copy( b );
			rodMesh.quaternion.setFromUnitVectors( UP, _dir.negate() );

		},
	};

}

// --- the rig: posing and solving the arm -----------------------------------------------------

function createRig( spec, house, arm ) {

	const { boom, stick, bucket, load, rams, updateLinks } = arm;
	const limits = Object.fromEntries( Object.entries( spec.limits ).map( ( [ joint, [ lo, hi ] ] ) => [ joint, [ lo * DEG, hi * DEG ] ] ) );
	const toothTip = new Object3D();
	const mouth = new Object3D();
	const q = spec.bucket.radius / 1.45;
	const shell = scaled( BUCKET_SHELL, q );
	const [ ef, ey ] = shell[ shell.length - 1 ];
	const tip = [ ef + Math.cos( TOOTH_ANGLE ) * ( TOOTH_LENGTH + 0.1 ) * q, ey + Math.sin( TOOTH_ANGLE ) * ( TOOTH_LENGTH + 0.1 ) * q ];
	at( tip, 0, toothTip.position );
	at( [ 0.75 * q, - 0.1 * q ], 0, mouth.position );
	bucket.add( toothTip, mouth );

	// The arm moves in the vertical plane through the boom: `u` ahead of the swing axis, `v` up from
	// the ground the tracks stand on.
	const kin = {
		x: spec.foot[ 0 ],
		footU: - spec.foot[ 2 ],
		footV: spec.foot[ 1 ],
		boom: spec.boom,
		stick: spec.stick,
		radius: Math.hypot( tip[ 0 ], tip[ 1 ] ),
		// Angle from the bucket's own axis to its tooth tips.
		delta: Math.atan2( tip[ 1 ], tip[ 0 ] ),
	};

	const pose = { swing: 0, boom: 0, stick: - 90 * DEG, bucket: 0 };
	const rig = {

		spec,
		kin,
		limits,
		pose,
		toothTip,
		mouth,
		house,
		parts: { boom, stick, bucket },

		setPose( next ) {

			Object.assign( pose, next );
			house.rotation.y = pose.swing;
			boom.rotation.x = pose.boom;
			stick.rotation.x = pose.stick;
			bucket.rotation.x = pose.bucket;
			for ( const part of [ house, boom, stick, bucket ] ) part.updateMatrix();
			for ( const r of rams ) r.update();
			updateLinks();

		},

		// Joint angles (and the swing kept as it is) that put the tooth tips at (u, v) with the teeth
		// pointing at phi, as near as the joints allow.
		solve( { u, v, phi }, out = {} ) {

			const { boom: L1, stick: L2, radius } = kin;
			const wu = u - radius * Math.cos( phi ) - kin.footU;
			const wv = v - radius * Math.sin( phi ) - kin.footV;
			const d = MathUtils.clamp( Math.hypot( wu, wv ), Math.abs( L1 - L2 ) + 1e-3, L1 + L2 - 1e-3 );
			const elbow = Math.acos( MathUtils.clamp( ( L1 * L1 + L2 * L2 - d * d ) / ( 2 * L1 * L2 ), - 1, 1 ) );
			const shoulder = Math.acos( MathUtils.clamp( ( L1 * L1 + d * d - L2 * L2 ) / ( 2 * L1 * d ), - 1, 1 ) );
			out.boom = MathUtils.clamp( Math.atan2( wv, wu ) + shoulder, ...limits.boom );
			out.stick = MathUtils.clamp( - ( Math.PI - elbow ), ...limits.stick );
			out.bucket = MathUtils.clamp( phi - kin.delta - out.boom - out.stick, ...limits.bucket );
			return out;

		},

		// Where the tooth tips end up for joint angles: [ u, v ].
		reach( { boom: a1, stick: s, bucket: b } ) {

			const a2 = a1 + s;
			const a3 = a2 + b + kin.delta;
			return [
				kin.footU + kin.boom * Math.cos( a1 ) + kin.stick * Math.cos( a2 ) + kin.radius * Math.cos( a3 ),
				kin.footV + kin.boom * Math.sin( a1 ) + kin.stick * Math.sin( a2 ) + kin.radius * Math.sin( a3 ),
			];

		},

		// Lowest point of the bucket (its shell and teeth) above the ground for joint angles.
		bucketBottom( { boom: a1, stick: s, bucket: b } ) {

			const a2 = a1 + s;
			const a3 = a2 + b;
			const wu = kin.footU + kin.boom * Math.cos( a1 ) + kin.stick * Math.cos( a2 );
			const wv = kin.footV + kin.boom * Math.sin( a1 ) + kin.stick * Math.sin( a2 );
			let lowest = Infinity;
			for ( const [ f, y ] of [ ...shell, tip ] ) lowest = Math.min( lowest, wv + f * Math.sin( a3 ) + y * Math.cos( a3 ) );
			return lowest;

		},

		// Show the heap of material in the bucket.
		setLoad( full ) {

			load.visible = full;

		},

	};

	// Parked: the bucket curled and resting on the ground in front, the stick folded in.
	const rest = { swing: 0 };
	let v = 0.4 * q;
	for ( let i = 0; i < 4; i ++ ) {

		rig.solve( { u: spec.rest.reach, v, phi: spec.rest.angle * DEG }, rest );
		// A little clearance for the cutting edge and teeth, which are thicker than the outline.
		v -= rig.bucketBottom( rest ) - 0.04 * q;

	}

	rig.rest = rest;

	// Size each cylinder for the stroke its joint needs.
	const ranges = rams.map( () => [ Infinity, - Infinity ] );
	const sweep = ( joint, apply ) => {

		const [ lo, hi ] = limits[ joint ];
		for ( let i = 0; i <= 24; i ++ ) {

			rig.setPose( { ...rest, [ joint ]: MathUtils.lerp( lo, hi, i / 24 ) } );
			apply();

		}

	};

	const measure = indices => () => {

		for ( const i of indices ) {

			const length = rams[ i ].length();
			ranges[ i ][ 0 ] = Math.min( ranges[ i ][ 0 ], length );
			ranges[ i ][ 1 ] = Math.max( ranges[ i ][ 1 ], length );

		}

	};

	sweep( 'boom', measure( [ 0, 1 ] ) );
	sweep( 'stick', measure( [ 2 ] ) );
	sweep( 'bucket', measure( [ 3 ] ) );
	rams.forEach( ( r, i ) => r.fit( ...ranges[ i ] ) );
	rig.setPose( rest );
	return rig;

}
