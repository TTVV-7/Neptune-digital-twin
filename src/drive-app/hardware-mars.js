import {
	CanvasTexture,
	CylinderGeometry,
	DoubleSide,
	BackSide,
	ExtrudeGeometry,
	Group,
	IcosahedronGeometry,
	Mesh,
	MeshStandardMaterial,
	RingGeometry,
	Shape,
	ShapeGeometry,
	SphereGeometry,
	SRGBColorSpace,
	RepeatWrapping,
	Vector2,
} from 'three';
import { box, cylinder, foilTexture, materials, panel, strut, wheel, leg } from './hardware.js';

// The hardware on Mars, built as hardware.js builds the Moon's: each builder returns a Group
// standing on y = 0 with its front facing -Z, at its real size in metres, simplified but recognisable
// from photographs and published dimensions. The placement data (HARDWARE) comes from elsewhere.

export const HARDWARE = [];

// --- materials -------------------------------------------------------------------------------------

// Solar cells in a grid of `line` on `base`: Zhurong's lighter blue, InSight's dusted over.
function cellsTexture( base, line ) {

	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = 128;
	const ctx = canvas.getContext( '2d' );
	ctx.fillStyle = base;
	ctx.fillRect( 0, 0, 128, 128 );
	ctx.strokeStyle = line;
	ctx.lineWidth = 1;
	for ( let i = 0; i <= 128; i += 16 ) {

		ctx.beginPath();
		ctx.moveTo( i, 0 );
		ctx.lineTo( i, 128 );
		ctx.moveTo( 0, i );
		ctx.lineTo( 128, i );
		ctx.stroke();

	}

	const texture = new CanvasTexture( canvas );
	texture.colorSpace = SRGBColorSpace;
	texture.wrapS = texture.wrapT = RepeatWrapping;
	return texture;

}

// A parachute seen from above: its gores in white and orange around the middle, the disk-gap-band's
// gap as a ring of darker cloth.
function canopyTexture() {

	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = 256;
	const ctx = canvas.getContext( '2d' );
	const gores = 24;
	for ( let i = 0; i < gores; i ++ ) {

		ctx.fillStyle = i % 4 === 0 || i % 4 === 1 && i % 8 < 4 ? '#e2621c' : '#f2efe8';
		ctx.beginPath();
		ctx.moveTo( 128, 128 );
		ctx.arc( 128, 128, 182, i / gores * Math.PI * 2, ( i + 1 ) / gores * Math.PI * 2 );
		ctx.fill();

	}

	ctx.strokeStyle = '#8f8a80';
	ctx.lineWidth = 6;
	ctx.beginPath();
	ctx.arc( 128, 128, 84, 0, Math.PI * 2 );
	ctx.stroke();
	const texture = new CanvasTexture( canvas );
	texture.colorSpace = SRGBColorSpace;
	return texture;

}

let shared = null;
function marsMaterials() {

	if ( shared ) return shared;
	shared = {
		// Deflated airbag cloth (Vectran): pale and creased.
		bag: new MeshStandardMaterial( { color: 0xffffff, map: foilTexture( '#d9d2c2', '#f3eee2', '#a49c88' ), metalness: 0, roughness: 0.95 } ),
		blueCells: new MeshStandardMaterial( { color: 0xffffff, map: cellsTexture( '#2b4fa8', '#9fb4e8' ), metalness: 0.1, roughness: 0.35, side: DoubleSide } ),
		// Dishes and shells, seen from inside and out.
		whiteBoth: new MeshStandardMaterial( { color: 0xe4e4df, metalness: 0, roughness: 0.6, side: DoubleSide } ),
		inside: new MeshStandardMaterial( { color: 0x6e6a64, metalness: 0.1, roughness: 0.8, side: BackSide } ),
		canopy: new MeshStandardMaterial( { color: 0xffffff, map: canopyTexture(), metalness: 0, roughness: 0.95, side: DoubleSide } ),
		// Schiaparelli's scar: the dark ejecta, darker in the middle. Drawn in front of the ground it lies on.
		scar: new MeshStandardMaterial( { color: 0x2c2420, roughness: 1, polygonOffset: true, polygonOffsetFactor: - 2, polygonOffsetUnits: - 2 } ),
		halo: new MeshStandardMaterial( { color: 0x4a3a30, roughness: 1, polygonOffset: true, polygonOffsetFactor: - 1, polygonOffsetUnits: - 1 } ),
		// InSight's arrays, dusty.
		dustyCells: new MeshStandardMaterial( { color: 0xffffff, map: cellsTexture( '#4a4450', '#a89880' ), metalness: 0.1, roughness: 0.6 } ),
		charred: new MeshStandardMaterial( { color: 0x3a3632, metalness: 0.1, roughness: 0.8 } ),
	};
	return shared;

}

// --- helpers ---------------------------------------------------------------------------------------

// A repeatable random number in [0, 1).
function random( seed ) {

	return () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;

}

function shapeOf( points ) {

	return new Shape( points.map( ( [ x, z ] ) => new Vector2( x, - z ) ) );

}

// A flat plate of outline `points` ([x, z] seen from above), `depth` thick, its bottom at y = 0.
function slab( points, depth, material ) {

	const mesh = new Mesh( new ExtrudeGeometry( shapeOf( points ), { depth, bevelEnabled: false } ), material );
	mesh.rotation.x = - Math.PI / 2;
	return mesh;

}

// Solar cells over outline `points`, a little inside its edge, at height y.
function cellsOn( points, y, material ) {

	const cx = points.reduce( ( s, p ) => s + p[ 0 ], 0 ) / points.length;
	const cz = points.reduce( ( s, p ) => s + p[ 1 ], 0 ) / points.length;
	const inset = points.map( ( [ x, z ] ) => [ cx + ( x - cx ) * 0.92, cz + ( z - cz ) * 0.92 ] );
	const mesh = new Mesh( new ShapeGeometry( shapeOf( inset ) ), material );
	mesh.rotation.x = - Math.PI / 2;
	mesh.position.y = y;
	return mesh;

}

// A dish antenna `radius` across its rim and `depth` deep, opening up (+Y), its back at the origin,
// with its feed on a short stalk.
function dish( radius, depth, m, mm ) {

	const group = new Group();
	const R = ( radius * radius + depth * depth ) / ( 2 * depth );
	const cap = new Mesh( new SphereGeometry( R, 20, 4, 0, Math.PI * 2, 0, Math.asin( radius / R ) ), mm.whiteBoth );
	cap.rotation.x = Math.PI;
	cap.position.y = R;
	group.add( cap, strut( [ 0, 0, 0 ], [ 0, radius * 0.7, 0 ], radius * 0.05, m.grey ) );
	return group;

}

// A plain landing leg: a strut from `top` down to a round pad at `foot`, with one brace up to the body.
function simpleLeg( group, top, foot, padRadius, brace, material, m ) {

	group.add( strut( top, foot, 0.04, material ) );
	group.add( strut( brace, [ ( top[ 0 ] + foot[ 0 ] ) / 2, ( top[ 1 ] + foot[ 1 ] ) / 2, ( top[ 2 ] + foot[ 2 ] ) / 2 ], 0.025, material ) );
	const pad = cylinder( padRadius, padRadius * 0.85, 0.08, m.silver, 16 );
	pad.position.set( foot[ 0 ], 0.04, foot[ 2 ] );
	group.add( pad );

}

// Six wheels on a rocker-bogie, both sides: wheels of radius r and width w at x = ±x and the three
// zs (front, middle, rear); each rocker pivots on the body at [y, z] of `pivot` (joined to the body's
// side at ±bodyX) and carries the front wheel and the bogie, which pivots at [y, z] of `bogie` and
// carries the middle and rear wheels.
function rockerBogie( group, m, { x, r, w, zs, pivot, bogie, bodyX, tube, wheelMaterial = m.silver, frame = m.silver } ) {

	const [ zf, zm, zr ] = zs;
	for ( const s of [ - 1, 1 ] ) {

		const lx = s * ( x - w / 2 - tube * 1.5 );
		const p = [ lx, pivot[ 0 ], pivot[ 1 ] ];
		const b = [ lx, bogie[ 0 ], bogie[ 1 ] ];
		const front = [ lx, bogie[ 0 ], zf ];
		const mid = [ lx, ( bogie[ 0 ] + r ) / 2 + r * 0.3, zm ];
		const rear = [ lx, ( bogie[ 0 ] + r ) / 2 + r * 0.3, zr ];
		group.add( strut( [ s * bodyX, pivot[ 0 ], pivot[ 1 ] ], p, tube * 1.3, frame ) );
		group.add( strut( p, front, tube, frame ), strut( p, b, tube, frame ) );
		group.add( strut( b, mid, tube, frame ), strut( b, rear, tube, frame ) );
		for ( const [ top, z ] of [ [ front, zf ], [ mid, zm ], [ rear, zr ] ] ) {

			group.add( strut( top, [ lx, r, z ], tube, frame ) );
			group.add( wheel( r, w, wheelMaterial, s * x, z, true ) );

		}

	}

}

// Deflated airbags bunched at each of `points` ([x, z]): a few creased lumps of cloth `size` across.
function bags( group, mm, points, size, seed = 3 ) {

	const rand = random( seed );
	const geometry = new IcosahedronGeometry( 1, 1 );
	for ( const [ x, z ] of points ) for ( let i = 0; i < 2; i ++ ) {

		const lump = new Mesh( geometry, mm.bag );
		const s = size * ( 0.3 + rand() * 0.25 );
		lump.scale.set( s, s * ( 0.35 + rand() * 0.2 ), s * ( 0.6 + rand() * 0.4 ) );
		lump.rotation.y = rand() * Math.PI;
		lump.position.set( x + ( rand() - 0.5 ) * size, s * 0.12, z + ( rand() - 0.5 ) * size );
		group.add( lump );

	}

}

// A lander opened out like Pathfinder's and the MER landers': a triangular base petal of side
// `edge`, `base` thick, and three petals of the same size laid flat around it, the deflated airbags
// bunched along their outer edges. A petal's tip points forward (-Z).
function petalLander( edge, { base, petalMaterial, cells, bagSize, seed } ) {

	const m = materials();
	const mm = marsMaterials();
	const group = new Group();
	const R = edge / Math.sqrt( 3 );
	const v = [ 0, 1, 2 ].map( k => [ R * Math.sin( k * 2 * Math.PI / 3 ), R * Math.cos( k * 2 * Math.PI / 3 ) ] );
	const tips = v.map( ( [ x, z ] ) => [ - 2 * x, - 2 * z ] );
	group.add( slab( v, base, m.grey ) );
	for ( let k = 0; k < 3; k ++ ) {

		const petal = [ v[ ( k + 1 ) % 3 ], tips[ k ], v[ ( k + 2 ) % 3 ] ];
		group.add( slab( petal, 0.04, petalMaterial ) );
		if ( cells ) group.add( cellsOn( petal, 0.043, m.cells ) );

	}

	// The bags: where two petals meet on the outer edge, and halfway out to each tip.
	const spots = [];
	for ( let k = 0; k < 3; k ++ ) {

		const [ x, z ] = v[ k ];
		const out = bagSize * 0.5 / R;
		spots.push( [ x * ( 1 + out * 1.4 ), z * ( 1 + out * 1.4 ) ] );
		for ( const t of [ ( k + 1 ) % 3, ( k + 2 ) % 3 ] ) spots.push( [ x * 0.75 + tips[ t ][ 0 ] * 0.25 + x * out, z * 0.75 + tips[ t ][ 1 ] * 0.25 + z * out ] );

	}

	bags( group, mm, spots, bagSize, seed );
	return { group, v, tips, R, m, mm };

}

// A ramp `width` wide from `top` ([x, y, z]) down to `foot` on the ground.
function ramp( from, to, width, thickness, material ) {

	const dx = to[ 0 ] - from[ 0 ];
	const dy = to[ 1 ] - from[ 1 ];
	const dz = to[ 2 ] - from[ 2 ];
	const length = Math.hypot( dx, dy, dz );
	const mesh = box( width, thickness, length, material );
	mesh.position.set( ( from[ 0 ] + to[ 0 ] ) / 2, ( from[ 1 ] + to[ 1 ] ) / 2 + thickness / 2, ( from[ 2 ] + to[ 2 ] ) / 2 );
	mesh.rotation.order = 'YXZ';
	mesh.rotation.y = Math.atan2( dx, dz );
	mesh.rotation.x = Math.atan2( - dy, Math.hypot( dx, dz ) );
	return mesh;

}

// --- the landers -----------------------------------------------------------------------------------

// Viking 1 and 2 landers (1976): a six-sided body 1.5 m across and 0.46 m deep on three legs, two
// boxy covers over its RTGs, the 0.76 m high-gain dish on its mast, the two cameras, the sampler
// arm's housing with its boom drawn in, and the meteorology boom up on a leg. About 2.1 m tall.
export function viking() {

	const m = materials();
	const mm = marsMaterials();
	const group = new Group();
	const body = cylinder( 0.75, 0.75, 0.46, m.grey, 6 );
	body.position.y = 0.64;
	const deck = cylinder( 0.76, 0.76, 0.04, m.white, 6 );
	deck.position.y = 0.89;
	group.add( body, deck );
	// Three legs from alternate corners.
	for ( let k = 0; k < 3; k ++ ) {

		const a = Math.PI / 6 + k * Math.PI * 2 / 3;
		const c = Math.cos( a );
		const s = Math.sin( a );
		simpleLeg( group, [ 0.72 * c, 0.5, 0.72 * s ], [ 1.2 * c, 0.08, 1.2 * s ], 0.15, [ 0.45 * c + 0.3 * s, 0.42, 0.45 * s - 0.3 * c ], m.silver, m );

	}

	// The RTG covers, either side at the back.
	for ( const x of [ - 0.42, 0.42 ] ) {

		group.add( box( 0.3, 0.3, 0.42, m.white, x, 1.06, 0.3 ) );
		for ( const dz of [ - 0.12, 0, 0.12 ] ) group.add( box( 0.32, 0.03, 0.03, m.grey, x, 1.22, 0.3 + dz ) );

	}

	// The two facsimile cameras at the front, their tops round.
	for ( const x of [ - 0.38, 0.38 ] ) {

		const cam = cylinder( 0.085, 0.1, 0.32, m.white, 12 );
		cam.position.set( x, 1.07, - 0.38 );
		const top = new Mesh( new SphereGeometry( 0.085, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2 ), m.grey );
		top.position.set( x, 1.23, - 0.38 );
		group.add( cam, top );

	}

	// The high-gain dish on its mast, facing up and out.
	group.add( strut( [ 0, 0.9, 0.35 ], [ 0, 1.6, 0.35 ], 0.04, m.silver ) );
	const hga = dish( 0.38, 0.1, m, mm );
	hga.position.set( 0, 1.62, 0.35 );
	hga.rotation.x = 0.6;
	group.add( hga, box( 0.12, 0.12, 0.12, m.grey, 0, 1.6, 0.35 ) );
	// The sampler arm's housing at the front, its boom and collector head drawn in.
	group.add( box( 0.22, 0.18, 0.5, m.white, 0, 1.0, - 0.5 ) );
	group.add( strut( [ 0, 1.0, - 0.75 ], [ 0, 0.88, - 1.05 ], 0.03, m.silver ) );
	group.add( box( 0.12, 0.1, 0.16, m.grey, 0, 0.86, - 1.1 ) );
	// The meteorology boom, up from a leg, its sensors on a crossbar at the top.
	group.add( strut( [ 0.62, 0.5, - 0.36 ], [ 0.95, 1.5, - 0.55 ], 0.025, m.silver ) );
	group.add( box( 0.3, 0.05, 0.05, m.white, 0.95, 1.52, - 0.55 ) );
	// The S-band low-gain antenna.
	group.add( strut( [ - 0.5, 0.9, 0 ], [ - 0.5, 1.35, 0 ], 0.02, m.silver ), box( 0.06, 0.08, 0.06, m.white, - 0.5, 1.38, 0 ) );
	return group;

}

// Mars Pathfinder (1997), opened out: a tetrahedron whose three side petals fold down flat around
// its base, 1.3 m a side, solar cells on all three, the airbags drawn in and bunched at their edges,
// the camera (IMP) on its mast 1.8 m up, the small high-gain dish, the meteorology mast on a petal,
// and the two ramps Sojourner took, forward and back off one petal.
export function pathfinder() {

	const { group, v, tips, m, mm } = petalLander( 1.3, { base: 0.1, petalMaterial: materials().white, cells: true, bagSize: 0.45, seed: 11 } );
	group.add( box( 0.45, 0.28, 0.35, m.gold, 0, 0.24, 0.05 ) );
	// The camera's mast and its head with two eyes, facing forward.
	group.add( strut( [ 0, 0.38, 0.15 ], [ 0, 1.68, 0.15 ], 0.025, m.silver ) );
	group.add( box( 0.22, 0.14, 0.12, m.white, 0, 1.75, 0.13 ) );
	for ( const x of [ - 0.07, 0.07 ] ) {

		const eye = cylinder( 0.03, 0.03, 0.06, m.black, 10 );
		eye.rotation.x = Math.PI / 2;
		eye.position.set( x, 1.75, 0.05 );
		group.add( eye );

	}

	const hga = dish( 0.14, 0.04, m, mm );
	hga.position.set( 0.22, 0.45, - 0.15 );
	hga.rotation.x = - 0.5;
	group.add( hga, strut( [ 0.22, 0.1, - 0.15 ], [ 0.22, 0.45, - 0.15 ], 0.015, m.silver ) );
	// The meteorology mast on the right-hand petal, its three windsocks.
	const [ px, pz ] = [ ( v[ 0 ][ 0 ] + tips[ 2 ][ 0 ] + v[ 1 ][ 0 ] ) / 3, ( v[ 0 ][ 1 ] + tips[ 2 ][ 1 ] + v[ 1 ][ 1 ] ) / 3 ];
	group.add( strut( [ px, 0.04, pz ], [ px, 1.1, pz ], 0.012, m.silver ) );
	for ( const y of [ 0.35, 0.65, 0.95 ] ) group.add( box( 0.1, 0.03, 0.03, m.white, px + 0.05, y, pz ) );
	// The two ramps, off the left petal (Sojourner went down the back one).
	const [ a, b, t ] = [ v[ 0 ], v[ 2 ], tips[ 1 ] ];
	for ( const [ e0, e1 ] of [ [ a, t ], [ b, t ] ] ) {

		const mx = ( e0[ 0 ] + e1[ 0 ] ) / 2;
		const mz = ( e0[ 1 ] + e1[ 1 ] ) / 2;
		const ex = e1[ 0 ] - e0[ 0 ];
		const ez = e1[ 1 ] - e0[ 1 ];
		const len = Math.hypot( ex, ez );
		// Outward: perpendicular to the edge, away from the lander's middle.
		let nx = ez / len;
		let nz = - ex / len;
		if ( nx * mx + nz * mz < 0 ) [ nx, nz ] = [ - nx, - nz ];
		const from = [ mx - nx * 0.25, 0.045, mz - nz * 0.25 ];
		const to = [ mx + nx * 1.1, 0, mz + nz * 1.1 ];
		for ( const side of [ - 0.12, 0.12 ] ) group.add( ramp( [ from[ 0 ] + nz * side, from[ 1 ], from[ 2 ] - nx * side ], [ to[ 0 ] + nz * side, 0, to[ 2 ] - nx * side ], 0.06, 0.03, m.silver ) );
		group.add( ramp( from, to, 0.22, 0.012, m.grey ) );

	}

	return group;

}

// Sojourner (1997), the first rover on Mars: 65 cm long, 48 cm wide and 30 cm tall, six 13 cm
// wheels on a rocker-bogie, its flat solar panel over the top, cameras at the front and the APXS
// on the back.
export function sojourner() {

	const m = materials();
	const group = new Group();
	rockerBogie( group, m, { x: 0.2, r: 0.065, w: 0.07, zs: [ - 0.25, 0, 0.22 ], pivot: [ 0.2, - 0.05 ], bogie: [ 0.12, 0.1 ], bodyX: 0.15, tube: 0.008, wheelMaterial: m.silver } );
	group.add( box( 0.3, 0.1, 0.42, m.gold, 0, 0.2, 0 ) );
	const top = panel( 0.46, 0.56, m );
	top.position.set( 0, 0.27, 0.01 );
	group.add( top );
	// The front cameras and the laser stripers, the APXS on its arm at the back, the whip antenna.
	group.add( box( 0.14, 0.05, 0.04, m.black, 0, 0.2, - 0.23 ) );
	const apxs = cylinder( 0.025, 0.025, 0.05, m.silver, 10 );
	apxs.position.set( 0, 0.09, 0.31 );
	group.add( strut( [ 0, 0.18, 0.21 ], [ 0, 0.1, 0.3 ], 0.008, m.silver ), apxs );
	group.add( strut( [ 0.12, 0.28, 0.15 ], [ 0.12, 0.38, 0.15 ], 0.004, m.silver ) );
	return group;

}

// Spirit and Opportunity (MER, 2004): 1.6 m long and 2.3 m wide across the solar wings that spread
// out from the deck, six 26 cm wheels on a rocker-bogie, the camera mast 1.5 m up with its head, the
// round high-gain dish and the low-gain antenna, the arm folded under the front.
export function merRover() {

	const m = materials();
	const mm = marsMaterials();
	const group = new Group();
	rockerBogie( group, m, { x: 0.62, r: 0.13, w: 0.16, zs: [ - 0.55, 0, 0.5 ], pivot: [ 0.52, - 0.1 ], bogie: [ 0.32, 0.25 ], bodyX: 0.45, tube: 0.022, wheelMaterial: m.silver } );
	group.add( box( 0.9, 0.38, 1.1, m.gold, 0, 0.53, 0 ) );
	// The solar array: the deck and its wings, cells on top.
	const wings = [ [ - 0.45, - 0.78 ], [ 0.45, - 0.78 ], [ 1.15, - 0.4 ], [ 1.12, - 0.18 ], [ 0.55, 0.05 ], [ 0.95, 0.55 ], [ 0.35, 0.85 ], [ - 0.35, 0.85 ], [ - 0.95, 0.55 ], [ - 0.55, 0.05 ], [ - 1.12, - 0.18 ], [ - 1.15, - 0.4 ] ];
	const array = slab( wings, 0.03, m.silver );
	array.position.y = 0.73;
	group.add( array, cellsOn( wings, 0.762, m.cells ) );
	// The mast and its head: the Pancam and Navcam pairs on a bar, facing forward.
	group.add( strut( [ 0.25, 0.76, - 0.6 ], [ 0.25, 1.4, - 0.6 ], 0.03, m.white ) );
	group.add( box( 0.32, 0.1, 0.1, m.white, 0.25, 1.45, - 0.6 ) );
	for ( const x of [ - 0.12, 0.12 ] ) group.add( box( 0.05, 0.05, 0.04, m.black, 0.25 + x, 1.45, - 0.66 ) );
	// The high-gain dish on its gimbal and the low-gain mast.
	group.add( strut( [ - 0.35, 0.76, 0.35 ], [ - 0.35, 0.95, 0.35 ], 0.025, m.silver ) );
	const hga = cylinder( 0.14, 0.14, 0.03, m.white, 18 );
	hga.position.set( - 0.35, 0.98, 0.35 );
	hga.rotation.x = - 0.5;
	group.add( hga );
	group.add( strut( [ - 0.1, 0.76, 0.5 ], [ - 0.1, 1.2, 0.5 ], 0.012, m.silver ) );
	// The arm folded under the front, its tools at the end.
	group.add( strut( [ - 0.3, 0.42, - 0.56 ], [ 0.3, 0.38, - 0.62 ], 0.025, m.silver ) );
	group.add( box( 0.12, 0.12, 0.1, m.grey, 0.32, 0.36, - 0.64 ) );
	return group;

}

// The MER landing platform left behind by Spirit and Opportunity: a triangle of three petals 1.55 m
// a side opened flat around the base, the rover's cradle on it, the fabric egress ramps ('batwings')
// out over each petal's edge and the deflated airbags all round.
export function merLander() {

	const { group, v, tips, m, mm } = petalLander( 1.55, { base: 0.2, petalMaterial: materials().white, cells: false, bagSize: 0.6, seed: 23 } );
	// The cradle the rover stood on, and its lift.
	group.add( box( 0.6, 0.18, 0.4, m.gold, 0, 0.29, 0.05 ) );
	for ( const [ x, z ] of v ) group.add( strut( [ x * 0.75, 0.2, z * 0.75 ], [ x * 0.3, 0.42, z * 0.3 ], 0.02, m.silver ) );
	// The egress ramps: cloth stretched out from each petal's outer edges down to the ground.
	for ( let k = 0; k < 3; k ++ ) {

		for ( const j of [ ( k + 1 ) % 3, ( k + 2 ) % 3 ] ) {

			const [ ax, az ] = v[ j ];
			const [ bx, bz ] = tips[ k ];
			// Outward of this edge: away from the base's middle along its normal.
			const mx = ( ax + bx ) / 2;
			const mz = ( az + bz ) / 2;
			const len = Math.hypot( bx - ax, bz - az );
			let nx = ( bz - az ) / len;
			let nz = - ( bx - ax ) / len;
			if ( nx * mx + nz * mz < 0 ) [ nx, nz ] = [ - nx, - nz ];
			const cloth = [ [ ax * 0.8 + bx * 0.2, az * 0.8 + bz * 0.2 ], [ ax * 0.2 + bx * 0.8, az * 0.2 + bz * 0.8 ], [ ax * 0.3 + bx * 0.7 + nx * 0.55, az * 0.3 + bz * 0.7 + nz * 0.55 ], [ ax * 0.7 + bx * 0.3 + nx * 0.55, az * 0.7 + bz * 0.3 + nz * 0.55 ] ];
			const mesh = slab( cloth, 0.012, mm.bag );
			mesh.position.y = 0.02;
			group.add( mesh );

		}

	}

	return group;

}

// The deck, legs and decagonal arrays Phoenix and InSight share: a deck of radius `deck` about a metre
// up on three legs, the arrays of radius `array` either side, cells of `cells`.
function phoenixBase( group, m, deck, array, cells ) {

	const top = cylinder( deck, deck, 0.12, m.white, 10 );
	top.position.y = 1.0;
	const belly = cylinder( deck * 0.8, deck * 0.67, 0.35, m.gold, 10 );
	belly.position.y = 0.77;
	group.add( top, belly );
	for ( let k = 0; k < 3; k ++ ) {

		const a = Math.PI / 2 + k * Math.PI * 2 / 3;
		const c = Math.cos( a );
		const s = Math.sin( a );
		simpleLeg( group, [ deck * 0.73 * c, 0.85, deck * 0.73 * s ], [ deck * 1.4 * c, 0.08, deck * 1.4 * s ], 0.14, [ deck * 0.47 * c + 0.25 * s, 0.62, deck * 0.47 * s - 0.25 * c ], m.silver, m );

	}

	for ( const side of [ - 1, 1 ] ) {

		const panel = new Mesh( new CylinderGeometry( array, array, 0.03, 10 ), [ m.silver, cells, m.silver ] );
		panel.position.set( side * ( deck + array + 0.07 ), 1.04, 0 );
		group.add( panel, box( 0.16, 0.06, 0.12, m.grey, side * ( deck + 0.05 ), 1.04, 0 ) );

	}

}

// Phoenix (2008), in the arctic: a deck 1.5 m across on three legs about 1 m up, its two decagonal
// solar arrays 1.8 m across either side (5.5 m tip to tip), the 2.35 m robotic arm reaching down to
// dig in front, the stereo camera on its 2 m mast and the meteorology mast at the back.
export function phoenix() {

	const m = materials();
	const group = new Group();
	phoenixBase( group, m, 0.75, 0.9, m.cells );

	// Instruments on the deck: TEGA's ovens and MECA.
	group.add( box( 0.45, 0.18, 0.2, m.silver, - 0.15, 1.15, - 0.35 ) );
	group.add( box( 0.3, 0.22, 0.3, m.gold, 0.25, 1.17, 0.1 ) );
	// The stereo camera's mast and head; the meteorology mast with its telltale.
	group.add( strut( [ - 0.3, 1.06, 0.4 ], [ - 0.3, 1.95, 0.4 ], 0.03, m.white ) );
	group.add( box( 0.26, 0.12, 0.14, m.white, - 0.3, 2.0, 0.4 ) );
	for ( const x of [ - 0.08, 0.08 ] ) group.add( box( 0.06, 0.06, 0.04, m.black, - 0.3 + x, 2.0, 0.32 ) );
	group.add( strut( [ 0.35, 1.06, 0.45 ], [ 0.35, 2.15, 0.45 ], 0.015, m.silver ) );
	group.add( box( 0.04, 0.08, 0.04, m.white, 0.35, 2.17, 0.45 ) );
	// The arm: shoulder at the front of the deck, elbow high, the scoop at the ground.
	const shoulder = [ 0.3, 1.1, - 0.6 ];
	const elbow = [ 0.45, 1.55, - 1.35 ];
	const wrist = [ 0.5, 0.35, - 1.95 ];
	group.add( strut( shoulder, elbow, 0.04, m.white ), strut( elbow, wrist, 0.035, m.white ) );
	group.add( box( 0.1, 0.1, 0.1, m.grey, ...elbow ) );
	const scoop = box( 0.12, 0.08, 0.2, m.silver, 0.5, 0.25, - 2.0 );
	scoop.rotation.x = 0.4;
	group.add( scoop );
	return group;

}

// InSight (2018): Phoenix's design again, a deck about 1.56 m across on three legs with two
// decagonal solar arrays 2.2 m across either side (6 m tip to tip, dusty), the robotic arm raised
// over the front, and what it set down on the ground about 1.5 m in front: the seismometer SEIS
// under its domed wind and thermal shield, and the heat probe HP3's box beside it, both tethered back.
export function insight() {

	const m = materials();
	const mm = marsMaterials();
	const group = new Group();
	phoenixBase( group, m, 0.78, 1.1, mm.dustyCells );
	// On the deck: the electronics boxes, the UHF antennas, the weather sensors' booms.
	group.add( box( 0.5, 0.2, 0.3, m.silver, 0.1, 1.16, 0.3 ) );
	group.add( box( 0.25, 0.15, 0.25, m.gold, - 0.35, 1.13, 0.1 ) );
	for ( const x of [ - 0.45, 0.45 ] ) group.add( strut( [ x, 1.06, 0.35 ], [ x * 1.2, 1.45, 0.45 ], 0.012, m.silver ), box( 0.12, 0.03, 0.06, m.white, x * 1.2, 1.46, 0.45 ) );
	// The arm: from the front of the deck, raised, its grapple and camera hanging over the front.
	const shoulder = [ - 0.35, 1.1, - 0.55 ];
	const elbow = [ - 0.45, 1.75, - 1.05 ];
	const wrist = [ - 0.5, 1.35, - 1.6 ];
	group.add( strut( shoulder, elbow, 0.04, m.white ), strut( elbow, wrist, 0.035, m.white ) );
	group.add( box( 0.1, 0.1, 0.1, m.grey, ...elbow ), box( 0.12, 0.16, 0.1, m.grey, wrist[ 0 ], wrist[ 1 ] - 0.08, wrist[ 2 ] ) );
	// SEIS under its shield: a dome with a skirt, 0.9 m across.
	const dome = new Mesh( new SphereGeometry( 0.42, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2 ), m.white );
	dome.scale.y = 0.85;
	dome.position.set( 0.1, 0.06, - 2.2 );
	const skirt = cylinder( 0.42, 0.5, 0.08, m.gold, 20 );
	skirt.position.set( 0.1, 0.04, - 2.2 );
	const cap = cylinder( 0.08, 0.08, 0.04, m.grey, 12 );
	cap.position.set( 0.1, 0.44, - 2.2 );
	group.add( dome, skirt, cap );
	// HP3: its support box to the right, its mole hammered into the ground below it.
	const hp3 = box( 0.26, 0.4, 0.3, m.white, 1.0, 0.2, - 2.0 );
	hp3.rotation.y = 0.3;
	group.add( hp3 );
	// The tethers, lying on the ground back to the lander.
	group.add( strut( [ 0.1, 0.02, - 1.75 ], [ 0.2, 0.02, - 0.9 ], 0.012, m.grey ), strut( [ 0.95, 0.02, - 1.82 ], [ 0.55, 0.02, - 0.9 ], 0.012, m.grey ) );
	return group;

}

// --- the big rovers --------------------------------------------------------------------------------

// Curiosity and Perseverance share a body: about 3 m long, 2.7 m wide, 2.2 m to the top of the mast,
// six 50 cm wheels on a rocker-bogie, the MMRTG angled up at the back, the mast at the front right,
// the arm reaching forward to its turret, the hexagonal high-gain antenna. White and grey.
function msl( perseverance ) {

	const m = materials();
	const group = new Group();
	const r = perseverance ? 0.2625 : 0.25;
	const w = perseverance ? 0.34 : 0.4;
	rockerBogie( group, m, { x: 1.13, r, w, zs: [ - 1.05, - 0.05, 0.85 ], pivot: [ 1.0, - 0.25 ], bogie: [ 0.62, 0.4 ], bodyX: 0.75, tube: 0.045 } );
	group.add( box( 1.5, 0.6, 1.8, m.white, 0, 0.92, - 0.05 ) );
	group.add( box( 1.56, 0.05, 1.86, m.grey, 0, 1.245, - 0.05 ) );
	// On the deck: the instruments' boxes and inlets.
	group.add( box( 0.5, 0.14, 0.45, m.white, - 0.25, 1.34, - 0.35 ) );
	group.add( box( 0.4, 0.1, 0.35, m.silver, 0.3, 1.32, 0.35 ) );
	// The hazard cameras under the front.
	group.add( box( 0.6, 0.07, 0.06, m.black, 0, 0.7, - 0.97 ) );
	// The MMRTG: a finned drum angled up and back off the rear.
	const rtg = new Group();
	rtg.add( cylinder( 0.2, 0.2, 0.66, m.grey, 12 ) );
	for ( let i = 0; i < 6; i ++ ) {

		const a = i * Math.PI / 3;
		const fin = box( 0.16, 0.62, 0.02, m.black );
		fin.position.set( Math.cos( a ) * 0.26, 0, Math.sin( a ) * 0.26 );
		fin.rotation.y = - a;
		rtg.add( fin );

	}

	rtg.position.set( 0, 1.0, 1.22 );
	rtg.rotation.x = 0.9;
	group.add( rtg, strut( [ 0, 0.95, 0.8 ], [ 0, 1.0, 1.22 ], 0.06, m.grey ) );
	// The mast, at the front right.
	const mx = 0.55;
	const mz = - 0.72;
	const post = cylinder( 0.05, 0.065, 0.72, m.white, 10 );
	post.position.set( mx, 1.63, mz );
	group.add( post );
	if ( perseverance ) {

		// Mastcam-Z's two zoom cameras either side, SuperCam's square box with its round window on top.
		group.add( box( 0.34, 0.22, 0.3, m.white, mx, 2.0, mz ) );
		group.add( box( 0.26, 0.14, 0.32, m.silver, mx, 2.18, mz ) );
		const window = cylinder( 0.07, 0.07, 0.03, m.black, 16 );
		window.rotation.x = Math.PI / 2;
		window.position.set( mx, 2.18, mz - 0.17 );
		group.add( window );
		for ( const dx of [ - 0.12, 0.12 ] ) {

			const cam = cylinder( 0.045, 0.045, 0.14, m.grey, 12 );
			cam.rotation.x = Math.PI / 2;
			cam.position.set( mx + dx, 1.98, mz - 0.18 );
			group.add( cam );

		}

	} else {

		// The head: the Mastcams below, ChemCam's round telescope on top.
		group.add( box( 0.3, 0.2, 0.3, m.white, mx, 2.02, mz ) );
		const chemcam = cylinder( 0.075, 0.075, 0.26, m.silver, 16 );
		chemcam.rotation.x = Math.PI / 2;
		chemcam.position.set( mx, 2.13, mz - 0.03 );
		const lens = cylinder( 0.055, 0.055, 0.02, m.black, 16 );
		lens.rotation.x = Math.PI / 2;
		lens.position.set( mx, 2.13, mz - 0.17 );
		group.add( chemcam, lens );
		for ( const dx of [ - 0.07, 0.07 ] ) group.add( box( 0.06, 0.06, 0.05, m.black, mx + dx, 1.98, mz - 0.17 ) );

	}

	// The high-gain antenna: a hexagonal plate on its gimbal, at the left; the UHF antenna behind it.
	group.add( strut( [ - 0.5, 1.27, 0.15 ], [ - 0.5, 1.5, 0.15 ], 0.04, m.silver ) );
	const hga = cylinder( 0.15, 0.15, 0.05, m.grey, 6 );
	hga.position.set( - 0.5, 1.55, 0.15 );
	hga.rotation.x = - 0.6;
	group.add( hga );
	const uhf = cylinder( 0.05, 0.05, 0.3, m.white, 10 );
	uhf.position.set( - 0.2, 1.42, 0.55 );
	group.add( uhf );
	// The arm, reaching forward from the front left to its turret above the ground.
	const shoulder = [ - 0.5, 1.0, - 0.98 ];
	const elbow = [ - 0.3, 1.25, - 1.7 ];
	const wrist = [ 0.0, 0.85, - 2.15 ];
	group.add( strut( shoulder, elbow, 0.055, m.silver ), strut( elbow, wrist, 0.05, m.silver ) );
	group.add( box( 0.14, 0.14, 0.14, m.grey, ...shoulder ), box( 0.12, 0.12, 0.12, m.grey, ...elbow ) );
	const turret = new Group();
	turret.position.set( 0, 0.6, - 2.2 );
	const hub = cylinder( perseverance ? 0.15 : 0.12, perseverance ? 0.15 : 0.12, 0.3, m.grey, 12 );
	hub.rotation.z = Math.PI / 2;
	turret.add( hub, strut( [ 0, 0.25, 0.05 ], [ 0, 0.05, 0 ], 0.04, m.silver ) );
	if ( perseverance ) {

		// The coring drill, its bit pointing down; PIXL and SHERLOC either side.
		turret.add( box( 0.18, 0.3, 0.18, m.white, 0, - 0.1, - 0.12 ) );
		const bit = cylinder( 0.025, 0.025, 0.25, m.silver, 10 );
		bit.position.set( 0, - 0.37, - 0.12 );
		turret.add( bit, box( 0.16, 0.18, 0.14, m.white, 0.22, - 0.08, 0.05 ), box( 0.14, 0.16, 0.16, m.gold, - 0.22, - 0.06, 0.05 ) );

	} else {

		// The drill pointing down, MAHLI, APXS and the sample processor around.
		const drill = cylinder( 0.06, 0.06, 0.25, m.silver, 10 );
		drill.position.set( 0, - 0.2, - 0.1 );
		const bit = cylinder( 0.016, 0.016, 0.12, m.grey, 8 );
		bit.position.set( 0, - 0.37, - 0.1 );
		turret.add( drill, bit, box( 0.12, 0.12, 0.12, m.white, 0.2, - 0.05, 0.05 ), box( 0.14, 0.1, 0.16, m.silver, - 0.2, - 0.05, 0.05 ) );
		const apxs = cylinder( 0.04, 0.04, 0.12, m.grey, 10 );
		apxs.position.set( 0, - 0.12, 0.15 );
		turret.add( apxs );

	}

	group.add( turret );
	if ( perseverance ) {

		// The bit carousel on the front of the belly, and the row of sample tubes.
		const carousel = cylinder( 0.22, 0.22, 0.08, m.grey, 20 );
		carousel.rotation.x = Math.PI / 2;
		carousel.position.set( 0.3, 0.86, - 0.98 );
		group.add( carousel );
		for ( let i = 0; i < 5; i ++ ) {

			const tube = cylinder( 0.018, 0.018, 0.2, m.silver, 8 );
			tube.position.set( - 0.4 + i * 0.07, 0.95, - 0.98 );
			group.add( tube );

		}

	}

	return group;

}

// Curiosity (MSL, 2012): 3 m long, 2.7 m wide, 2.2 m to the top of its mast; six 50 cm wheels,
// ChemCam's telescope on the mast head, the drill on the arm's turret.
export function curiosity() {

	return msl( false );

}

// Perseverance (Mars 2020, 2021): Curiosity's twin with narrower 52.5 cm wheels, SuperCam's box and
// Mastcam-Z on the mast head, the coring drill on a bigger turret, the bit carousel and sample tubes.
export function perseverance() {

	return msl( true );

}

// Ingenuity (2021-2024), the first aircraft on another world: 0.49 m tall, a 14 × 20 × 16 cm body
// on four thin legs, two counter-rotating rotors 1.2 m across and its solar panel on top of the mast.
// As it was left after its 72nd flight (January 2024), one rotor blade broken short.
export function ingenuity() {

	const m = materials();
	const group = new Group();
	group.add( box( 0.195, 0.136, 0.163, m.silver, 0, 0.2, 0 ) );
	group.add( box( 0.2, 0.02, 0.17, m.gold, 0, 0.27, 0 ) );
	for ( const [ sx, sz ] of [ [ 1, 1 ], [ 1, - 1 ], [ - 1, 1 ], [ - 1, - 1 ] ] ) {

		group.add( strut( [ sx * 0.09, 0.25, sz * 0.075 ], [ sx * 0.27, 0.01, sz * 0.25 ], 0.006, m.black ) );
		const foot = cylinder( 0.02, 0.02, 0.01, m.black, 8 );
		foot.position.set( sx * 0.27, 0.005, sz * 0.25 );
		group.add( foot );

	}

	const mast = cylinder( 0.012, 0.012, 0.2, m.silver, 8 );
	mast.position.y = 0.37;
	group.add( mast );
	// The two rotors, crossed; one blade of the upper rotor snapped off near its root.
	for ( const [ y, turn ] of [ [ 0.33, 0.3 ], [ 0.4, - 0.6 ] ] ) {

		const rotor = new Group();
		rotor.position.y = y;
		rotor.rotation.y = turn;
		const hub = cylinder( 0.03, 0.03, 0.03, m.grey, 10 );
		rotor.add( hub );
		for ( const side of [ - 1, 1 ] ) {

			const length = y > 0.35 && side > 0 ? 0.17 : 0.58;
			rotor.add( box( length, 0.008, 0.07, m.black, side * ( 0.02 + length / 2 ), 0, 0 ) );

		}

		group.add( rotor );

	}

	const top = panel( 0.32, 0.21, m );
	top.position.y = 0.475;
	group.add( top );
	return group;

}

// Zhurong (China, 2021): 1.85 m tall and 240 kg, six wheels, four solar panels spread like a
// butterfly's wings (blue cells), the mast at the front with its cameras, a white and gold body.
export function zhurong() {

	const m = materials();
	const mm = marsMaterials();
	const group = new Group();
	rockerBogie( group, m, { x: 0.82, r: 0.15, w: 0.17, zs: [ - 0.75, 0, 0.75 ], pivot: [ 0.62, - 0.15 ], bogie: [ 0.38, 0.35 ], bodyX: 0.55, tube: 0.03 } );
	group.add( box( 1.1, 0.42, 1.4, m.gold, 0, 0.7, 0 ) );
	group.add( box( 1.12, 0.12, 1.42, m.white, 0, 0.97, 0 ) );
	// The heat window (the round collector) on top.
	const collector = cylinder( 0.22, 0.22, 0.04, m.silver, 20 );
	collector.position.set( 0, 1.05, 0.25 );
	group.add( collector );
	// Four wings, hinged at the deck's sides, swept forward and back and tilted up.
	for ( const s of [ - 1, 1 ] ) for ( const fore of [ - 1, 1 ] ) {

		const hinge = new Group();
		hinge.position.set( s * 0.56, 1.02, fore * 0.36 );
		hinge.rotation.y = fore < 0 ? s * 0.35 : - s * 0.35;
		const tilt = new Group();
		tilt.rotation.z = s * 0.28;
		const wing = panel( 0.95, 0.66, { ...m, cells: mm.blueCells } );
		wing.position.x = s * 0.48;
		tilt.add( wing );
		hinge.add( tilt );
		group.add( hinge );

	}

	// The mast at the front, its head with the navigation and multispectral cameras.
	group.add( strut( [ 0, 1.03, - 0.6 ], [ 0, 1.68, - 0.6 ], 0.035, m.white ) );
	group.add( box( 0.36, 0.16, 0.16, m.white, 0, 1.76, - 0.6 ) );
	for ( const x of [ - 0.12, 0, 0.12 ] ) group.add( box( 0.06, 0.06, 0.04, m.black, x, 1.76, - 0.69 ) );
	group.add( strut( [ 0, 1.84, - 0.6 ], [ 0, 1.86, - 0.6 ], 0.06, m.white ) );
	// The high-gain antenna at the back.
	const hga = dish( 0.18, 0.05, m, mm );
	hga.position.set( - 0.3, 1.2, 0.55 );
	hga.rotation.x = 0.5;
	group.add( hga, strut( [ - 0.3, 1.03, 0.55 ], [ - 0.3, 1.2, 0.55 ], 0.02, m.silver ) );
	return group;

}

// Tianwen-1's landing platform (2021): an eight-sided gold body about 2.6 m across on four legs, the
// rover's empty saddle on top, and its two ramps down to the ground at the front, side by side.
export function tianwenLander() {

	const m = materials();
	const group = new Group();
	const body = cylinder( 1.3, 1.3, 0.7, m.gold, 8 );
	body.rotation.y = Math.PI / 8;
	body.position.y = 1.15;
	const deck = cylinder( 1.32, 1.32, 0.05, m.silver, 8 );
	deck.rotation.y = Math.PI / 8;
	deck.position.y = 1.52;
	const bell = cylinder( 0.25, 0.5, 0.5, m.grey, 16 );
	bell.position.y = 0.6;
	group.add( body, deck, bell );
	for ( const [ sx, sz ] of [ [ 1, 1 ], [ 1, - 1 ], [ - 1, 1 ], [ - 1, - 1 ] ] ) leg( group, [ sx * 0.85, 1.0, sz * 0.85 ], [ sx * 1.7, 0.12, sz * 1.7 ], 0.3, m );
	// The saddle the rover rode on: its posts and rails.
	for ( const x of [ - 0.45, 0.45 ] ) {

		group.add( box( 0.08, 0.06, 1.3, m.silver, x, 1.6, 0 ) );
		for ( const z of [ - 0.5, 0.5 ] ) group.add( box( 0.06, 0.12, 0.06, m.grey, x, 1.6, z ) );

	}

	// The two ramps from the deck's front edge down to the ground.
	for ( const x of [ - 0.45, 0.45 ] ) {

		group.add( ramp( [ x, 1.54, - 0.95 ], [ x, 0, - 3.4 ], 0.36, 0.04, m.silver ) );
		group.add( ramp( [ x - 0.17, 1.58, - 0.95 ], [ x - 0.17, 0.04, - 3.4 ], 0.03, 0.06, m.grey ) );

	}

	// A small camera mast at the back.
	group.add( strut( [ 0.8, 1.55, 0.6 ], [ 0.8, 2.1, 0.6 ], 0.025, m.white ), box( 0.15, 0.1, 0.1, m.white, 0.8, 2.15, 0.6 ) );
	return group;

}

// --- the old and the lost --------------------------------------------------------------------------

// Mars 3 (USSR, 1971), the first soft landing, as it would sit: a ball of a lander about 1.2 m across
// with its four petals opened out flat around it and its antennas up.
export function mars3() {

	const m = materials();
	const group = new Group();
	const ball = new Mesh( new SphereGeometry( 0.6, 24, 16 ), m.silver );
	ball.scale.y = 0.85;
	ball.position.y = 0.55;
	const band = cylinder( 0.61, 0.61, 0.1, m.grey, 24 );
	band.position.y = 0.55;
	const base = cylinder( 0.5, 0.55, 0.12, m.grey, 24 );
	base.position.y = 0.06;
	group.add( ball, band, base );
	// The four petals, each a rounded tongue laid out from the ball.
	const tongue = [];
	for ( let i = 0; i <= 8; i ++ ) {

		const a = Math.PI * i / 8;
		tongue.push( [ Math.cos( a ) * 0.4, 0.95 + Math.sin( a ) * 0.4 ] );

	}

	tongue.push( [ - 0.35, 0.4 ], [ 0.35, 0.4 ] );
	for ( let k = 0; k < 4; k ++ ) {

		const petal = new Group();
		const plate = slab( tongue.map( ( [ x, d ] ) => [ x, - d ] ), 0.03, m.silver );
		petal.add( plate );
		petal.rotation.y = Math.PI / 4 + k * Math.PI / 2;
		group.add( petal );
		const a = Math.PI / 4 + k * Math.PI / 2;
		// A whip antenna up from the top at each quarter.
		group.add( strut( [ Math.sin( a ) * 0.2, 1.0, - Math.cos( a ) * 0.2 ], [ Math.sin( a ) * 0.55, 1.75, - Math.cos( a ) * 0.55 ], 0.008, m.silver ) );

	}

	const top = cylinder( 0.15, 0.2, 0.12, m.grey, 12 );
	top.position.y = 1.05;
	group.add( top );
	return group;

}

// Beagle 2 (UK, 2003), as HiRISE found it in 2015: a 0.9 m 'pocket watch' whose lid opened but
// whose solar panels only partly unfolded (two out, one half up, one still folded), blocking its
// antenna, so it never called home.
export function beagle2() {

	const m = materials();
	const group = new Group();
	const base = cylinder( 0.45, 0.45, 0.16, m.gold, 24 );
	base.position.y = 0.08;
	const rim = cylinder( 0.46, 0.46, 0.03, m.silver, 24 );
	rim.position.y = 0.16;
	group.add( base, rim );
	// The lid, opened over onto the ground at the right, with a folded panel still on it.
	const disc = ( x, y, z, tilt = 0, axis = null ) => {

		const plate = new Mesh( new CylinderGeometry( 0.42, 0.42, 0.03, 20 ), [ m.silver, m.cells, m.silver ] );
		plate.position.set( x, y, z );
		if ( axis ) plate.rotation[ axis ] = tilt;
		group.add( plate );
		return plate;

	};

	disc( 0.88, 0.07, 0 );
	disc( 0.88, 0.105, 0 );
	// The two panels that came out, fanned round the lid.
	disc( 0.88 + 0.84 * Math.cos( 0.9 ), 0.05, - 0.84 * Math.sin( 0.9 ) );
	disc( 0.88 + 0.84, 0.05, 0 );
	// The third, half up on its hinge.
	const hinge = new Group();
	hinge.position.set( 0.88 + 0.42 * Math.cos( 0.9 ), 0.1, 0.42 * Math.sin( 0.9 ) );
	hinge.rotation.y = - 0.9;
	const half = new Mesh( new CylinderGeometry( 0.42, 0.42, 0.03, 20 ), [ m.silver, m.cells, m.silver ] );
	half.position.set( 0.42 * Math.cos( 1.1 ), 0.42 * Math.sin( 1.1 ), 0 );
	half.rotation.z = 1.1;
	hinge.add( half );
	group.add( hinge );
	// The hinge between base and lid, and the folded arm in the base.
	group.add( box( 0.06, 0.06, 0.3, m.grey, 0.46, 0.08, 0 ), box( 0.4, 0.06, 0.12, m.white, - 0.05, 0.2, 0 ) );
	return group;

}

// Schiaparelli (ESA, 2016) crashed after its parachute let go too early: a dark scar a couple of
// metres across where it hit, and a few broken pieces thrown out around it. No intact lander.
export function schiaparelli() {

	const m = materials();
	const mm = marsMaterials();
	const group = new Group();
	const rand = random( 5 );
	// The scar: an irregular dark patch inside a fainter halo of thrown-out dust.
	for ( const [ radius, material, y ] of [ [ 2.4, mm.halo, 0.012 ], [ 1.3, mm.scar, 0.02 ] ] ) {

		const ring = new RingGeometry( 0.01, 1, 48, 1 );
		const position = ring.attributes.position;
		for ( let i = 0; i < position.count; i ++ ) {

			const x = position.getX( i );
			const z = position.getY( i );
			const a = Math.atan2( z, x );
			const k = radius * ( 0.85 + 0.1 * Math.sin( a * 2 + 1 ) + 0.07 * Math.sin( a * 5 + radius ) + rand() * 0.08 );
			position.setXY( i, x * k, z * k );

		}

		ring.computeVertexNormals();
		const patch = new Mesh( ring, material );
		patch.rotation.x = - Math.PI / 2;
		patch.position.y = y;
		group.add( patch );

	}

	// Pieces: a crumpled block of the lander, a torn panel, a tank, bent struts, a heat-shield shard.
	const block = box( 0.7, 0.35, 0.55, m.silver, 0.2, 0.12, 0.1 );
	block.rotation.set( 0.3, 0.6, 0.2 );
	const plate = box( 0.9, 0.03, 0.6, m.silver, 2.4, 0.08, - 1.5 );
	plate.rotation.set( 0.15, 0.9, - 0.1 );
	const tank = new Mesh( new SphereGeometry( 0.22, 12, 8 ), m.grey );
	tank.scale.set( 1, 0.7, 1.2 );
	tank.position.set( - 1.9, 0.14, 1.2 );
	const shard = new Mesh( new SphereGeometry( 1.2, 12, 4, 0, 1.2, 0, 0.5 ), mm.whiteBoth );
	shard.rotation.set( Math.PI - 0.15, 0, 0.1 );
	shard.position.set( - 3.5, 1.22, - 2.5 );
	const blanket = box( 0.5, 0.04, 0.4, m.gold, - 0.5, 0.08, - 0.4 );
	blanket.rotation.set( 0.2, - 0.4, 0.15 );
	group.add( block, plate, tank, shard, blanket );
	for ( let i = 0; i < 4; i ++ ) {

		const a = rand() * Math.PI * 2;
		const d = 1 + rand() * 3;
		const x = Math.cos( a ) * d;
		const z = Math.sin( a ) * d;
		group.add( strut( [ x, 0.03, z ], [ x + ( rand() - 0.5 ) * 0.8, 0.06 + rand() * 0.15, z + ( rand() - 0.5 ) * 0.8 ], 0.02, i % 2 ? m.silver : mm.charred ) );
		const bit = box( 0.2 + rand() * 0.2, 0.06, 0.15 + rand() * 0.15, i % 2 ? m.gold : m.white, - x * 1.4, 0.03, z * 1.3 );
		bit.rotation.y = rand() * 3;
		group.add( bit );

	}

	return group;

}

// A lander's backshell (MER-sized, a cone 2.65 m across and about 1.2 m deep) tipped on its side, its
// parachute (14 m across when open) lying out flat on the ground behind it, white and orange,
// spread and folded into an irregular shape, and a few of its lines between them.
export function backshell() {

	const m = materials();
	const mm = marsMaterials();
	const group = new Group();
	const shell = new Group();
	const cone = new Mesh( new CylinderGeometry( 0.55, 1.32, 1.1, 28, 1, true ), mm.whiteBoth );
	const inner = new Mesh( new CylinderGeometry( 0.54, 1.31, 1.09, 28, 1, true ), mm.inside );
	const lid = cylinder( 0.56, 0.56, 0.12, m.grey, 28 );
	lid.position.y = 0.6;
	const housing = cylinder( 0.3, 0.35, 0.25, m.white, 16 );
	housing.position.y = 0.78;
	const rim = new Mesh( new CylinderGeometry( 1.34, 1.34, 0.06, 28, 1, true ), m.grey );
	rim.position.y = - 0.55;
	shell.add( cone, inner, lid, housing, rim );
	// On its side: the narrow end toward -X, tipped down so its lowest line lies on the ground.
	const slope = Math.atan( ( 1.32 - 0.55 ) / 1.1 );
	shell.rotation.z = Math.PI / 2 + slope * 0.85;
	shell.rotation.y = 0.4;
	shell.position.y = 1.32 * Math.cos( slope ) - 0.05;
	group.add( shell );
	// The parachute: a ring of cloth with a wavy, folded-back outline, gently rumpled.
	const rand = random( 9 );
	const ring = new RingGeometry( 0.15, 1, 48, 6 );
	const position = ring.attributes.position;
	const wobble = Array.from( { length: 6 }, () => rand() * Math.PI * 2 );
	for ( let i = 0; i < position.count; i ++ ) {

		const x = position.getX( i );
		const y = position.getY( i );
		const a = Math.atan2( y, x );
		const d = Math.hypot( x, y );
		const reach = 1 + 0.25 * Math.sin( a * 2 + wobble[ 0 ] ) + 0.12 * Math.sin( a * 5 + wobble[ 1 ] ) + 0.06 * Math.sin( a * 11 + wobble[ 2 ] );
		position.setXYZ( i, x * reach * 5.5, y * reach * 3.6, 0.03 + 0.07 * d * ( 1 + Math.sin( a * 9 + wobble[ 3 ] ) ) + 0.04 * Math.sin( d * 9 + wobble[ 4 ] ) ** 2 );

	}

	ring.computeVertexNormals();
	const canopy = new Mesh( ring, mm.canopy );
	canopy.rotation.x = - Math.PI / 2;
	canopy.position.set( 1.2, 0, 7.2 );
	group.add( canopy );
	// A few suspension lines from the canopy's near edge to the backshell.
	for ( const dx of [ - 2, - 0.7, 0.6, 1.9 ] ) group.add( strut( [ 0.3, 0.02, 1.2 ], [ 1.2 + dx, 0.02, 4.1 ], 0.006, m.white ) );
	return group;

}
