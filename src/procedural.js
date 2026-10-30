import {
	BoxGeometry,
	CanvasTexture,
	Color,
	CylinderGeometry,
	DoubleSide,
	ExtrudeGeometry,
	Group,
	Mesh,
	MeshStandardMaterial,
	RepeatWrapping,
	Shape,
	SRGBColorSpace,
	Vector2,
} from 'three';
import { buildExcavator, EXCAVATOR_20T, EXCAVATOR_MINI } from './excavator-model.js';
import { hPileBundle, hydraulicShoreItem, sheetPileBundle, trenchBoxItem, trenchPanelItem } from './shoring-models.js';
import { KART_ITEM } from './kart.js';

// Common site pieces generated in code at real North American dimensions, in metres. Each builder
// returns a Group standing on y = 0 with its front (door, open side or sloped end) facing -Z, so
// heading 0 points it north. No downloads and no licences to track.

const FT = 0.3048;
const IN = 0.0254;

export const PROCEDURAL_ITEMS = [
	{ id: 'jersey-barrier', name: 'Concrete jersey barrier (10 ft)', category: 'Barriers & fencing', build: jerseyBarrier },
	{ id: 'lock-block', name: 'Concrete lock block (5 x 2.5 ft)', category: 'Barriers & fencing', build: lockBlock },
	{ id: 'fence-panel', name: 'Temporary fence panel (10 x 6 ft)', category: 'Barriers & fencing', build: fencePanel },
	{ id: 'site-office-trailer', name: 'Site office trailer (12 x 60 ft)', category: 'Site trailers & containers', build: siteOfficeTrailer },
	{ id: 'container-20', name: 'Shipping container (20 ft)', category: 'Site trailers & containers', build: () => container( 6.058, 2.591, 0x8e3b2a ) },
	{ id: 'container-40hc', name: 'Shipping container (40 ft high cube)', category: 'Site trailers & containers', build: () => container( 12.192, 2.896, 0x2a4f8e ) },
	{ id: 'rolloff-20', name: 'Roll-off dumpster (20 yd)', category: 'Waste', build: () => rollOff( 4.5 * FT, 0x2f5f8f ) },
	{ id: 'rolloff-40', name: 'Roll-off dumpster (40 yd)', category: 'Waste', build: () => rollOff( 8 * FT, 0x3d6b3d ) },
	{ id: 'frontload-6yd', name: 'Front-load bin (6 yd)', category: 'Waste', build: frontLoadBin },
	{ id: 'light-tower', name: 'Towable light tower', category: 'Site services', build: lightTower },
	{ id: 'pallet', name: 'Wooden pallet (48 x 40 in)', category: 'Materials', build: pallet },
	// Drivable: "drive" tunes race mode, and type 'excavator' gives them the digging controls (excavator.js).
	{ id: 'excavator-20t', name: 'Excavator (20 t)', category: 'Heavy equipment', build: () => buildExcavator( EXCAVATOR_20T ), drive: { type: 'excavator', topSpeed: 5.5, accel: 1.2, brake: 3, reverse: 5.5 } },
	{ id: 'excavator-mini', name: 'Mini excavator (3.5 t)', category: 'Heavy equipment', build: () => buildExcavator( EXCAVATOR_MINI ), drive: { type: 'excavator', topSpeed: 4.5, accel: 1.2, brake: 3, reverse: 4.5 } },
	// Shoring to stage and lay down; shoring.js lines excavations with the same pieces. Weights are
	// typical for steel boxes with 4 in walls, Z-sheets of 65 kg/m and HP310 x 79 piles.
	{ id: 'trench-box-8x16', name: 'Trench box (8 x 16 ft, ~2.9 t)', category: 'Shoring', build: () => trenchBoxItem( 16 ) },
	{ id: 'trench-box-8x20', name: 'Trench box (8 x 20 ft, ~3.5 t)', category: 'Shoring', build: () => trenchBoxItem( 20 ) },
	{ id: 'trench-box-8x24', name: 'Trench box (8 x 24 ft, ~4.1 t)', category: 'Shoring', build: () => trenchBoxItem( 24 ) },
	{ id: 'trench-box-stacker-4x20', name: 'Trench box stacker (4 x 20 ft, ~1.8 t)', category: 'Shoring', build: () => trenchBoxItem( 20, 4 ) },
	{ id: 'trench-box-panel', name: 'Trench box panel, lying flat (8 x 20 ft, ~1.6 t)', category: 'Shoring', build: trenchPanelItem },
	{ id: 'sheet-pile-bundle', name: 'Sheet piles, bundle of 10 (12 m, ~7.8 t)', category: 'Shoring', build: sheetPileBundle },
	{ id: 'h-pile-bundle', name: 'H-piles, bundle of 7 (HP310, 12 m, ~6.6 t)', category: 'Shoring', build: hPileBundle },
	{ id: 'hydraulic-shore', name: 'Hydraulic shore (8 ft rails, ~40 kg)', category: 'Shoring', build: hydraulicShoreItem },
	{ id: 'jump-ramp', name: 'Jump ramp (1.2 m)', category: 'Race', build: () => jumpRamp( 4, 7, 1.2 ) },
	{ id: 'jump-ramp-big', name: 'Jump ramp (3 m)', category: 'Race', build: () => jumpRamp( 6, 16, 3 ) },
	// A go-kart with a driver (kart.js), drivable like the other vehicles.
	KART_ITEM,
].map( item => ( { ...item, front: '-z', procedural: true } ) );

export function buildProcedural( id ) {

	const item = PROCEDURAL_ITEMS.find( i => i.id === id );
	if ( ! item ) throw new Error( `No built-in item called "${ id }".` );
	const group = item.build();
	group.name = item.name;
	return group;

}

// --- helpers ---------------------------------------------------------------------------------

const materials = new Map();
function mat( color, { roughness = 0.8, metalness = 0, ...rest } = {} ) {

	const key = JSON.stringify( [ color, roughness, metalness, rest ] );
	if ( ! materials.has( key ) ) {

		const material = new MeshStandardMaterial( { color, roughness, metalness, ...rest } );
		material.userData.shared = true;
		materials.set( key, material );

	}

	return materials.get( key );

}

const CONCRETE = () => mat( 0xb5b3ab, { roughness: 0.95 } );
const STEEL = () => mat( 0x8a8f94, { roughness: 0.5, metalness: 0.6 } );
const BLACK = () => mat( 0x1d1f21, { roughness: 0.7 } );
const GLASS = () => mat( 0x23313b, { roughness: 0.15, metalness: 0.3 } );

// A box of size [x, y, z] whose base sits at height y0, centred on (x0, z0).
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

// A side profile (points in [z, y]) extruded across x by `width`, centred on x = 0.
function profile( parent, material, points, width ) {

	const shape = new Shape( points.map( ( [ z, y ] ) => new Vector2( z, y ) ) );
	const geometry = new ExtrudeGeometry( shape, { depth: width, bevelEnabled: false } );
	geometry.rotateY( - Math.PI / 2 );
	geometry.translate( width / 2, 0, 0 );
	const mesh = new Mesh( geometry, material );
	parent.add( mesh );
	return mesh;

}

// --- barriers & fencing ----------------------------------------------------------------------

// New Jersey profile: 24 in base, 3 in lip, 55° slope to 13 in, 84° slope to the 6 in top at 32 in.
function jerseyBarrier() {

	const group = new Group();
	const half = [ [ 12 * IN, 0 ], [ 12 * IN, 3 * IN ], [ 5 * IN, 13 * IN ], [ 3 * IN, 32 * IN ] ];
	const points = [ ...half, ...half.slice().reverse().map( ( [ x, y ] ) => [ - x, y ] ) ];
	// Profile across z here, extruded along x (the barrier's length).
	profile( group, CONCRETE(), points, 10 * FT );
	return group;

}

function lockBlock() {

	const group = new Group();
	const material = mat( 0xa8a59c, { roughness: 0.95 } );
	box( group, material, [ 5 * FT, 2.5 * FT, 2.5 * FT ] );
	for ( const x of [ - 1.25 * FT, 1.25 * FT ] ) cylinder( group, material, 0.15, 0.1, [ x, 2.5 * FT, 0 ], 20 );
	return group;

}

let chainLinkMaterial;
function chainLink() {

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

function fencePanel() {

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

// --- site trailers & containers --------------------------------------------------------------

// ATCO-style 12 x 60 ft office trailer on skirting, door side facing -Z with steel stairs.
function siteOfficeTrailer() {

	const group = new Group();
	const length = 60 * FT;
	const depth = 12 * FT;
	const floor = 0.75;
	const wall = 2.75;
	const body = mat( 0xe8e4d8, { roughness: 0.7 } );
	const trim = mat( 0x3c4a5a, { roughness: 0.6 } );

	box( group, mat( 0x8f969a, { roughness: 0.9 } ), [ length - 0.2, floor, depth - 0.2 ] );
	box( group, body, [ length, wall, depth ], [ 0, floor, 0 ] );
	box( group, trim, [ length + 0.1, 0.12, depth + 0.1 ], [ 0, floor + wall, 0 ] );

	// Windows: six on the door side, four at the back, one at each end.
	const front = - depth / 2 - 0.01;
	const back = depth / 2 + 0.01;
	const windowAt = ( x, z, rotated = false ) => {

		const frame = box( group, trim, rotated ? [ 0.04, 1.0, 1.3 ] : [ 1.3, 1.0, 0.04 ], [ x, floor + 1.1, z ] );
		const glass = box( group, GLASS(), rotated ? [ 0.05, 0.86, 1.16 ] : [ 1.16, 0.86, 0.05 ], [ x, floor + 1.17, z ] );
		return [ frame, glass ];

	};

	for ( const x of [ - 7.5, - 5, - 2.5, 2.5, 5, 7.5 ] ) windowAt( x, front );
	for ( const x of [ - 6, - 2, 2, 6 ] ) windowAt( x, back );
	windowAt( - length / 2 - 0.01, 0, true );
	windowAt( length / 2 + 0.01, 0, true );

	// Door, landing and stairs in the middle of the front.
	box( group, trim, [ 0.95, 2.05, 0.05 ], [ 0, floor, front ] );
	box( group, STEEL(), [ 0.04, 0.04, 0.04 ], [ 0.35, floor + 1.0, front - 0.03 ] );
	const landing = 1.2;
	box( group, STEEL(), [ 1.5, 0.08, landing ], [ 0, floor - 0.08, front - landing / 2 ] );
	const steps = 4;
	for ( let i = 0; i < steps; i ++ ) {

		const y = floor - 0.08 - ( i + 1 ) * floor / ( steps + 1 );
		box( group, STEEL(), [ 1.0, 0.05, 0.28 ], [ 0, y, front - landing - 0.14 - i * 0.28 ] );

	}

	// Guard rails along the landing's two open sides; the stairs come up between them.
	for ( const x of [ - 0.75, 0.75 ] ) {

		for ( const z of [ front - landing, front - 0.05 ] ) box( group, STEEL(), [ 0.04, 1.0, 0.04 ], [ x, floor, z ] );
		box( group, STEEL(), [ 0.04, 0.04, landing ], [ x, floor + 1.0, front - landing / 2 ] );

	}

	return group;

}

function container( length, height, color ) {

	const group = new Group();
	const width = 2.438;
	const paint = mat( color, { roughness: 0.7, metalness: 0.2 } );
	const frame = mat( new Color( color ).multiplyScalar( 0.7 ).getHex(), { roughness: 0.7, metalness: 0.2 } );
	const post = 0.16;

	// Body, with corrugation ribs on the long sides and the closed end.
	box( group, paint, [ length - 0.04, height - 0.02, width - 0.08 ], [ 0, 0.01, 0 ] );
	const ribs = Math.floor( ( length - 2 * post ) / 0.28 );
	for ( let i = 0; i < ribs; i ++ ) {

		const x = - length / 2 + post + 0.14 + i * 0.28;
		for ( const z of [ - width / 2 + 0.03, width / 2 - 0.03 ] ) box( group, paint, [ 0.09, height - 0.3, 0.03 ], [ x, 0.15, z ] );

	}

	// Corner posts and top/bottom rails.
	for ( const x of [ - length / 2 + post / 2, length / 2 - post / 2 ] ) {

		for ( const z of [ - width / 2 + post / 2, width / 2 - post / 2 ] ) box( group, frame, [ post, height, post ], [ x, 0, z ] );

	}

	for ( const y of [ 0, height - 0.15 ] ) {

		for ( const z of [ - width / 2 + 0.05, width / 2 - 0.05 ] ) box( group, frame, [ length, 0.15, 0.1 ], [ 0, y, z ] );

	}

	// Built lying along x with the doors on the -x end, then turned so the doors face -Z.
	const doorEnd = - length / 2 - 0.01;
	for ( const z of [ - width / 4, width / 4 ] ) {

		box( group, frame, [ 0.03, height - 0.3, width / 2 - 0.12 ], [ doorEnd, 0.15, z ] );
		for ( const dz of [ - 0.25, 0.25 ] ) cylinder( group, STEEL(), 0.02, height - 0.4, [ doorEnd - 0.03, 0.2, z + dz ], 8 );

	}

	group.rotation.y = - Math.PI / 2;
	return wrap( group );

}

// Put a rotated part inside a plain group, so callers can treat the result like any other item.
function wrap( object ) {

	const group = new Group();
	group.add( object );
	return group;

}

// --- waste -----------------------------------------------------------------------------------

// Open-top roll-off bin, 22 x 7.5 ft, sloped front end (facing -Z) and rear swing door.
function rollOff( height, color ) {

	const group = new Group();
	const length = 22 * FT;
	const width = 7.5 * FT;
	const paint = mat( color, { roughness: 0.7, metalness: 0.3 } );
	const plate = 0.05;
	const slope = 0.9;
	const z0 = - length / 2;

	// Side walls: a profile with the sloped front, extruded as thin plates.
	const side = [ [ z0 + slope, 0.12 ], [ - z0, 0.12 ], [ - z0, height ], [ z0, height ], [ z0, height * 0.55 ] ];
	for ( const x of [ - width / 2 + plate / 2, width / 2 - plate / 2 ] ) profile( group, paint, side, plate ).position.x += x;

	// Floor, sloped front, back door.
	box( group, paint, [ width, plate, length - slope ], [ 0, 0.12, slope / 2 ] );
	const front = box( group, paint, [ width, plate, Math.hypot( slope, height * 0.55 - 0.12 ) ], [ 0, 0, 0 ] );
	front.rotation.x = Math.atan2( height * 0.55 - 0.12, slope );
	front.position.set( 0, ( 0.12 + height * 0.55 ) / 2, z0 + slope / 2 );
	box( group, paint, [ width, height * 0.45, plate ], [ 0, height * 0.55, z0 + plate / 2 ] );
	box( group, paint, [ width, height - 0.12, plate ], [ 0, 0.12, - z0 - plate / 2 ] );

	// Ribs and top rail.
	for ( let z = z0 + slope + 0.4; z < - z0; z += 0.9 ) {

		for ( const x of [ - width / 2 - 0.04, width / 2 + 0.04 ] ) box( group, paint, [ 0.08, height - 0.12, 0.08 ], [ x, 0.12, z ] );

	}

	for ( const x of [ - width / 2, width / 2 ] ) box( group, paint, [ 0.12, 0.12, length ], [ x, height - 0.12, 0 ] );

	// Long rails and rear rollers underneath.
	for ( const x of [ - 0.5, 0.5 ] ) box( group, BLACK(), [ 0.1, 0.12, length - 0.3 ], [ x, 0, 0 ] );
	for ( const x of [ - 0.7, 0.7 ] ) {

		const roller = cylinder( group, STEEL(), 0.1, 0.15, [ 0, 0, 0 ], 12 );
		roller.rotation.z = Math.PI / 2;
		roller.position.set( x, 0.1, - z0 - 0.3 );

	}

	return group;

}

// 6 yd front-load bin with sloped front (facing -Z), lids and fork pockets.
function frontLoadBin() {

	const group = new Group();
	const width = 6 * FT;
	const depth = 5.5 * FT;
	const height = 5.75 * FT;
	const paint = mat( 0x2e4f35, { roughness: 0.7, metalness: 0.3 } );
	const z0 = - depth / 2;
	profile( group, paint, [ [ z0 + 0.35, 0 ], [ - z0, 0 ], [ - z0, height ], [ z0, height * 0.7 ], [ z0, height * 0.45 ] ], width );

	// Two lids on top, slightly proud of the body.
	const lidLength = Math.hypot( depth, height * 0.3 );
	const tilt = Math.atan2( height * 0.3, depth );
	for ( const x of [ - width / 4, width / 4 ] ) {

		const lid = box( group, BLACK(), [ width / 2 - 0.04, 0.04, lidLength ], [ 0, 0, 0 ] );
		lid.rotation.x = - tilt;
		lid.position.set( x, height * 0.85 + 0.02, 0 );

	}

	// Fork pockets on the sides.
	for ( const x of [ - width / 2 - 0.08, width / 2 + 0.08 ] ) box( group, paint, [ 0.16, 0.2, depth * 0.8 ], [ x, height * 0.55, 0 ] );
	return group;

}

// --- site services ---------------------------------------------------------------------------

// Towable light tower with its mast raised and four lamps facing -Z.
function lightTower() {

	const group = new Group();
	const paint = mat( 0xf2b705, { roughness: 0.6, metalness: 0.2 } );
	box( group, paint, [ 1.4, 1.3, 2.2 ], [ 0, 0.45, 0 ] );
	box( group, STEEL(), [ 0.1, 0.1, 1.3 ], [ 0, 0.55, - 1.7 ] );
	for ( const x of [ - 0.78, 0.78 ] ) {

		const wheel = cylinder( group, BLACK(), 0.33, 0.2, [ 0, 0, 0 ], 16 );
		wheel.rotation.z = Math.PI / 2;
		wheel.position.set( x, 0.33, 0.2 );

	}

	// Outriggers with jack feet.
	for ( const [ x, z ] of [ [ - 1.3, - 0.9 ], [ 1.3, - 0.9 ], [ - 1.3, 0.9 ], [ 1.3, 0.9 ] ] ) {

		box( group, paint, [ Math.abs( x ), 0.08, 0.08 ], [ x / 2, 0.6, z ] );
		cylinder( group, STEEL(), 0.03, 0.6, [ x, 0, z ], 8 );

	}

	const mastHeight = 9;
	cylinder( group, STEEL(), 0.07, mastHeight - 1.75, [ 0, 1.75, 0.6 ], 12 );
	box( group, STEEL(), [ 2.0, 0.08, 0.08 ], [ 0, mastHeight - 0.1, 0.6 ] );
	const lamp = mat( 0xfff6d5, { emissive: 0xfff2c0, emissiveIntensity: 0.6, roughness: 0.2 } );
	for ( const x of [ - 0.75, - 0.25, 0.25, 0.75 ] ) {

		box( group, BLACK(), [ 0.42, 0.34, 0.16 ], [ x, mastHeight - 0.45, 0.55 ] );
		box( group, lamp, [ 0.36, 0.28, 0.02 ], [ x, mastHeight - 0.42, 0.46 ] );

	}

	return group;

}

// --- materials -------------------------------------------------------------------------------

// GMA pallet: 48 x 40 in, three stringers, seven top boards and five bottom boards.
function pallet() {

	const group = new Group();
	const wood = mat( 0xb8935a, { roughness: 0.9 } );
	const length = 48 * IN;
	const width = 40 * IN;
	const board = 5.5 * IN;
	const thickness = 0.016;
	const stringer = 3.5 * IN;
	for ( const z of [ - width / 2 + 0.019, 0, width / 2 - 0.019 ] ) box( group, wood, [ length, stringer, 0.038 ], [ 0, thickness, z ] );
	for ( let i = 0; i < 7; i ++ ) box( group, wood, [ board, thickness, width ], [ - length / 2 + board / 2 + i * ( length - board ) / 6, thickness + stringer, 0 ] );
	for ( let i = 0; i < 5; i ++ ) box( group, wood, [ board, thickness, width ], [ - length / 2 + board / 2 + i * ( length - board ) / 4, 0, 0 ] );
	return group;

}

// --- race ------------------------------------------------------------------------------------

// A wedge to drive up and launch off. You drive up from +Z and take off at the tall end, which
// faces -Z, so the ramp's heading is the direction you jump.
function jumpRamp( width, length, height ) {

	const group = new Group();
	const deck = mat( 0x6d7378, { roughness: 0.6, metalness: 0.5 } );
	profile( group, deck, [ [ length / 2, 0 ], [ - length / 2, height ], [ - length / 2, 0 ] ], width );

	// Yellow and black edges along the deck so it reads from a distance.
	const stripes = 8;
	const slope = Math.atan2( height, length );
	const run = Math.hypot( length, height );
	for ( let i = 0; i < stripes; i ++ ) {

		const t = ( i + 0.5 ) / stripes;
		for ( const x of [ - width / 2 + 0.08, width / 2 - 0.08 ] ) {

			const stripe = box( group, mat( i % 2 ? 0x1d1f21 : 0xf2b705, { roughness: 0.5 } ), [ 0.16, 0.02, run / stripes ], [ 0, 0, 0 ] );
			stripe.rotation.x = slope;
			stripe.position.set( x, t * height + 0.01, length / 2 - t * length );

		}

	}

	return group;

}

