import {
	BoxGeometry,
	CanvasTexture,
	DoubleSide,
	EdgesGeometry,
	Group,
	InstancedMesh,
	LinearFilter,
	LineBasicMaterial,
	LineSegments,
	MathUtils,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	PlaneGeometry,
	Quaternion,
	Raycaster,
	RepeatWrapping,
	SRGBColorSpace,
	Vector3,
} from 'three';
import { TileFlatteningPlugin } from '3d-tiles-renderer/plugins';
import { acceleratedRaycast } from 'three-mesh-bvh';
import { registerKind } from './kinds.js';
import { buildProcedural } from './procedural.js';

// Flatten areas: rectangles drawn in the library sidebar that press everything in Google's mesh
// inside them (rail cars, trucks, sheds) down flat onto the ground, to clear space for a layout.
// An area can stop at a height ("flatten up to"), so what passes overhead (a conveyor, a gantry,
// a bridge deck) is left standing while what's under it is cleared.
// An area can also be surfaced: gravel, asphalt or concrete laid over the flattened ground, so it
// reads as a finished pad instead of Google's photo of whatever stood there, smeared flat. The
// surface shows all the time, with no red box over it (a bare area's red box shows in build mode).
// It only changes what's drawn here; Google's data isn't touched. An area is a placed kind (see
// kinds.js), so it is saved, moved, turned and deleted like the rest.
//
// Other modules press Google's mesh onto their own surfaces with setShape() (earthworks uses it
// for pits), and originalHeight() reads the ground as Google made it, ignoring all of this.
// setEnabled( false ) puts Google's mesh back as it was, for the Before view (layers.js), and
// setEnabled( true ) flattens it all again.

export const ZONE_ID = 'flatten-zone';
// The volume drawn for an area with no height limit.
const VOLUME_HEIGHT = 8;
const MAX_HEIGHT = 200;
// Re-flattening re-processes every tile under a zone, so moves are applied a few times a second.
const UPDATE_INTERVAL = 0.2;

const fillMaterial = new MeshBasicMaterial( { color: 0xff5544, transparent: true, opacity: 0.18, side: DoubleSide, depthWrite: false } );
const floorMaterial = new MeshBasicMaterial( { color: 0xff5544, transparent: true, opacity: 0.3, depthWrite: false } );
const edgeMaterial = new LineBasicMaterial( { color: 0xff3322 } );
// The top of an area with a height limit: nothing above it is touched.
const ceilingMaterial = new MeshBasicMaterial( { color: 0x7fd4ff, transparent: true, opacity: 0.22, side: DoubleSide, depthWrite: false } );
for ( const material of [ fillMaterial, floorMaterial, edgeMaterial, ceilingMaterial ] ) material.userData.shared = true;

// What a flattened area can be finished with. `tile` is how many metres one repeat of the texture
// covers; `colour` is the average, close to how each looks on Google's aerial photos; `grain` the
// stones' colours, `speck` how thickly they're scattered and `size` their radius range (pixels of a
// 256-pixel tile). `shade` gives each stone a shadow and a highlight (rounded or big stones, which
// read as stones rather than speckle); `angular` makes them broken rock rather than rounded. `gravel` is road base, as it was before there were others.
export const SURFACES = {
	gravel: { name: 'Gravel', label: 'road base (¾" minus)', tile: 3, colour: '#9a958b', grain: [ '#b8b2a6', '#7d786e', '#a9a294', '#6b665d', '#c9c3b6' ], speck: 0.55, size: [ 1, 3.2 ] },
	'clear-crush': { name: 'Clear crush', label: 'clear crush (¾" clean)', tile: 2.5, colour: '#7f7d78', grain: [ '#a7a49d', '#5f5d58', '#8f8c86', '#bdbab3', '#4e4c48' ], speck: 0.95, size: [ 1.4, 3 ], shade: true },
	'pea-gravel': { name: 'Pea gravel', label: 'pea gravel', tile: 2, colour: '#a2927a', grain: [ '#c9b89a', '#8c7a5f', '#ddd3c2', '#6f6250', '#b5a27f', '#9a8f86' ], speck: 1.1, size: [ 1.6, 2.8 ], shade: true },
	'drain-rock': { name: 'Drain rock', label: 'drain rock (1½")', tile: 3, colour: '#7d7870', grain: [ '#a39d93', '#66615a', '#8f877b', '#b8b1a5', '#575049' ], speck: 0.5, size: [ 2.8, 5 ], shade: true },
	'crusher-dust': { name: 'Crusher dust', label: 'crusher dust / screenings', tile: 2, colour: '#ada490', grain: [ '#c6bead', '#958c7a', '#bdb39f', '#8a8272' ], speck: 0.8, size: [ 0.5, 1.3 ] },
	'pit-run': { name: 'Pit run', label: 'pit run (brown, mixed)', tile: 4, colour: '#8a7a62', grain: [ '#a39177', '#6e604c', '#9a8f82', '#bba98c', '#5c5142', '#8f8a83' ], speck: 0.45, size: [ 0.8, 5 ], shade: true, angular: true },
	'recycled-concrete': { name: 'Recycled concrete', label: 'recycled concrete', tile: 3, colour: '#a8a59d', grain: [ '#cfccc4', '#8e8b84', '#b5b2aa', '#dcd9d1', '#77746e', '#c3c0b8', '#a5a29b', '#9c5a46' ], speck: 0.6, size: [ 1, 3.6 ] },
	'rip-rap': { name: 'Rip rap', label: 'rip rap (large rock)', tile: 5, colour: '#3f3c37', grain: [ '#7d786f', '#666159', '#8a847a', '#716c63', '#5a554e' ], speck: 0.045, size: [ 10, 19 ], shade: true, angular: true },
	millings: { name: 'Asphalt millings', label: 'asphalt millings', tile: 2.5, colour: '#3f3e3b', grain: [ '#57544f', '#2d2c2a', '#6a665f', '#48463f' ], speck: 0.65, size: [ 0.8, 2.2 ] },
	asphalt: { name: 'Asphalt', label: 'asphalt', tile: 4, colour: '#4e5052', grain: [ '#5c5e60', '#424446', '#666769', '#393a3c' ], speck: 0.35, size: [ 0.6, 1.6 ] },
	concrete: { name: 'Concrete', label: 'concrete', tile: 6, colour: '#b4b1aa', grain: [ '#bdbab3', '#aaa7a0', '#c4c1ba' ], speck: 0.12, size: [ 0.6, 1.4 ], joints: true },
};
// The P panel's choices: label → id.
const SURFACE_OPTIONS = { ...Object.fromEntries( Object.entries( SURFACES ).map( ( [ id, { label } ] ) => [ label, id ] ) ), 'none (just flatten)': 'none' };
// A little above the flattened ground, so the surface covers it; the depth bias does the rest.
const SURFACE_LIFT = 0.03;
// How deep a surfaced pad's sides go (m): where the ground round it falls away, the pad shows as
// built up on it rather than a sheet in the air.
const SURFACE_SIDES = 2.5;

// Google's mesh is made of large triangles, and ones crossing an area's edge are pressed down on the
// inside and left up on the outside, so they slope up over the surface near its edges. The surface is
// drawn over them: after the ground (renderOrder 0: Google's tiles, each tile a group of its own, so
// group orders can't do it) and before what's placed (models.js's PLACED_ORDER), as if this much
// nearer the camera (m, plus a share of the distance), without writing its own depth, so what's
// placed on it is drawn against the ground as it is and stands on it, and a building in front still
// hides it.
const SURFACE_ORDER = 0.5;
const SURFACE_BIAS = 1.5;
const SURFACE_BIAS_SHARE = 0.01;
const SURFACE_DEPTH = /* glsl */`
	#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )

		gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( max( 1.0, vFragDepth * ${ ( 1 - SURFACE_BIAS_SHARE ).toFixed( 4 ) } - ${ SURFACE_BIAS.toFixed( 2 ) } ) ) * logDepthBufFC * 0.5;

	#endif
`;
const overGround = shader => {

	shader.fragmentShader = shader.fragmentShader.replace( '#include <logdepthbuf_fragment>', SURFACE_DEPTH );

};

const surfaceMaterials = new Map();
function surfaceMaterial( id ) {

	if ( surfaceMaterials.has( id ) ) return surfaceMaterials.get( id );
	// { top, sides }
	const spec = SURFACES[ id ];
	const map = new CanvasTexture( drawSurface( spec ) );
	map.wrapS = map.wrapT = RepeatWrapping;
	map.colorSpace = SRGBColorSpace;
	map.anisotropy = 8;
	// Unlit, like Google's photo-textured mesh around it, so it matches by day and night alike.
	const material = new MeshBasicMaterial( { map, depthWrite: false } );
	material.onBeforeCompile = overGround;
	material.userData.shared = true;
	// Its sides, a shade darker (the pad's edge in its own shadow), drawn as anything else is.
	const sides = new MeshBasicMaterial( { map, color: 0xa8a8a8 } );
	sides.userData.shared = true;
	surfaceMaterials.set( id, { top: material, sides } );
	return surfaceMaterials.get( id );

}

// A seamless square of the surface: its average colour, then grains scattered over it (wrapped
// round the edges so repeats don't show a seam), and saw-cut joints for concrete.
export function drawSurface( { colour, grain, speck, size, joints, shade, angular } ) {

	const N = 256;
	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = N;
	const ctx = canvas.getContext( '2d' );
	ctx.fillStyle = colour;
	ctx.fillRect( 0, 0, N, N );
	// The same pattern every time, so a layout looks the same on each load.
	let seed = 12345;
	const random = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;
	const count = Math.round( N * N * speck * 0.12 );
	for ( let i = 0; i < count; i ++ ) {

		const x = random() * N;
		const y = random() * N;
		const r = size[ 0 ] + random() * ( size[ 1 ] - size[ 0 ] );
		const fill = grain[ Math.floor( random() * grain.length ) ];
		// A stone a little out of round (big ones more so), the same shape each time.
		const squash = shade || angular ? 0.75 + random() * 0.25 : 1;
		const tilt = shade || angular ? random() * Math.PI : 0;
		// Broken rock: six to eight corners at uneven distances.
		const sides = angular ? 6 + Math.floor( random() * 3 ) : 0;
		const corners = angular ? Array.from( { length: sides }, ( _, i ) => [ ( i + random() * 0.6 ) / sides * Math.PI * 2, 0.7 + random() * 0.4 ] ) : null;
		for ( const dx of [ - N, 0, N ] ) for ( const dy of [ - N, 0, N ] ) {

			const cx = x + dx, cy = y + dy;
			if ( cx + r * 1.3 < 0 || cx - r * 1.3 > N || cy + r * 1.3 < 0 || cy - r * 1.3 > N ) continue;
			const stone = ( ox, oy, k ) => {

				ctx.beginPath();
				if ( corners ) {

					for ( const [ a, d ] of corners ) {

						const u = Math.cos( a + tilt ) * r * k * d, v = Math.sin( a + tilt ) * r * k * d * squash;
						ctx.lineTo( cx + ox + u, cy + oy + v );

					}

					ctx.closePath();

				} else ctx.ellipse( cx + ox, cy + oy, r * k, r * k * squash, tilt, 0, Math.PI * 2 );
				ctx.fill();

			};

			if ( shade ) {

				// Its shadow down and to the right, the stone, and light on its upper left.
				ctx.fillStyle = 'rgba( 25, 22, 18, 0.45 )';
				stone( r * 0.18, r * 0.22, 1.05 );
				ctx.fillStyle = fill;
				stone( 0, 0, 1 );
				ctx.fillStyle = `rgba( 255, 255, 255, ${ corners ? 0.09 : 0.14 } )`;
				stone( - r * 0.25, - r * 0.28, 0.5 );

			} else {

				ctx.fillStyle = fill;
				stone( 0, 0, 1 );

			}

		}

	}

	if ( joints ) {

		ctx.strokeStyle = 'rgba( 70, 68, 64, 0.55 )';
		ctx.lineWidth = 1.5;
		ctx.strokeRect( 0.75, 0.75, N - 1.5, N - 1.5 );

	}

	return canvas;

}

// The surface over an area's floor: one plane with its texture repeating every `tile` metres, and
// its four sides going down SURFACE_SIDES.
function buildSurface( width, length, id ) {

	const { tile } = SURFACES[ id ];
	const materials = surfaceMaterial( id );
	const group = new Group();
	const geometry = new PlaneGeometry( width, length ).rotateX( - Math.PI / 2 );
	const uv = geometry.attributes.uv;
	for ( let i = 0; i < uv.count; i ++ ) uv.setXY( i, uv.getX( i ) * width / tile, uv.getY( i ) * length / tile );
	const top = new Mesh( geometry, materials.top );
	top.name = `${ SURFACES[ id ].name } surface`;
	top.position.y = SURFACE_LIFT;
	// After Google's tiles and before what's placed (see SURFACE_BIAS).
	top.renderOrder = SURFACE_ORDER;
	group.add( top );
	for ( const [ along, across, x, z, turn ] of [ [ width, length, 0, length / 2, 0 ], [ width, length, 0, - length / 2, Math.PI ], [ length, width, width / 2, 0, Math.PI / 2 ], [ length, width, - width / 2, 0, - Math.PI / 2 ] ] ) {

		const side = new PlaneGeometry( along, SURFACE_SIDES );
		const sideUv = side.attributes.uv;
		for ( let i = 0; i < sideUv.count; i ++ ) sideUv.setXY( i, sideUv.getX( i ) * along / tile, sideUv.getY( i ) * SURFACE_SIDES / tile );
		const mesh = new Mesh( side, materials.sides );
		mesh.position.set( x, SURFACE_LIFT - SURFACE_SIDES / 2, z );
		mesh.rotation.y = turn;
		group.add( mesh );

	}

	// Walked and driven on like the ground under it, which is flattened to the same height.
	group.traverse( o => o.userData.noCollide = true );
	return group;

}

// --- temporary fencing round an area ---------------------------------------------------------
//
// An area can be fenced all round its edge, with `gates` entrances. The kinds:
//   mesh        10 ft chain-link panels on feet, see-through
//   screened    the same with a green privacy screen facing out (or `screened-black`)
//   mesh-silt   chain-link panels with a silt fence along their outside foot
//   silt        silt fence alone: black geotextile on wooden stakes, its foot dug in
//   safety      orange plastic safety fence on steel T-posts, see-through
// An entrance in panel fencing is a 24 ft double drive gate standing open outward; in silt or safety
// fence, a gap. Entrances go one to a side, front first (the side the area faces), then the back,
// right and left, and round again: a fifth goes on the front beside the first. Panels between are
// stretched or squeezed a little so each run ends exactly at a gate or a corner, as crews cut one in
// on site. Every panel is one instance of the panel's parts, so a long fence is a few draw calls.

export const FENCES = {
	none: 'none',
	'temp fence, chain-link (see-through)': 'mesh',
	'temp fence, green privacy screen': 'screened',
	'temp fence, black privacy screen': 'screened-black',
	'temp fence with silt fence at its foot': 'mesh-silt',
	'silt fence only': 'silt',
	'orange safety fence on T-posts (see-through)': 'safety',
};
const PANEL = 10 * 0.3048;
const PANEL_HEIGHT = 6 * 0.3048;
// A double drive gate's opening (m): two 12 ft leaves.
export const GATE_WIDTH = 24 * 0.3048;
const MAX_GATES = 8;
// The fence line, this far in from the area's edge.
const FENCE_INSET = 0.3;
// How far round from closed the gate leaves stand (degrees): wide open, outward.
const GATE_OPEN = 100;
// Kinds that have gates (the others leave a gap) and that are panels.
const PANELLED = [ 'mesh', 'screened', 'screened-black', 'mesh-silt' ];

const fenceMaterial = ( colour, extra = {} ) => {

	const m = new MeshStandardMaterial( { color: colour, roughness: 0.9, ...extra } );
	m.userData.shared = true;
	return m;

};
let fenceMaterials = null;
function fenceMaterialsOf() {

	if ( fenceMaterials ) return fenceMaterials;
	// The safety fence's orange mesh: oval holes, as the extruded plastic has.
	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = 64;
	const ctx = canvas.getContext( '2d' );
	ctx.fillStyle = '#ff6a13';
	ctx.fillRect( 0, 0, 64, 64 );
	ctx.globalCompositeOperation = 'destination-out';
	for ( const [ x, y ] of [ [ 16, 16 ], [ 48, 16 ], [ 0, 48 ], [ 32, 48 ], [ 64, 48 ] ] ) {

		ctx.beginPath();
		ctx.ellipse( x, y, 14, 11, 0, 0, Math.PI * 2 );
		ctx.fill();

	}

	const map = new CanvasTexture( canvas );
	map.wrapS = map.wrapT = RepeatWrapping;
	map.colorSpace = SRGBColorSpace;
	map.repeat.set( PANEL / 0.1, 1.2 / 0.1 );
	// No smaller copies: averaged down, the holes would fill in and the fence look solid from afar.
	map.generateMipmaps = false;
	map.minFilter = LinearFilter;
	fenceMaterials = {
		green: fenceMaterial( 0x1f3b2a, { side: DoubleSide } ),
		black: fenceMaterial( 0x1b1c1d, { side: DoubleSide } ),
		hem: fenceMaterial( 0x111213 ),
		geotextile: fenceMaterial( 0x161616, { side: DoubleSide, roughness: 1 } ),
		stake: fenceMaterial( 0x9a7a52 ),
		soil: fenceMaterial( 0x5d4a37, { roughness: 1 } ),
		tpost: fenceMaterial( 0x2f5d3a, { metalness: 0.4, roughness: 0.6 } ),
		orange: fenceMaterial( 0xffffff, { map, side: DoubleSide, alphaTest: 0.35, roughness: 0.8 } ),
	};
	return fenceMaterials;

}

const block = ( group, material, [ w, h, d ], [ x, y, z ] ) => {

	const mesh = new Mesh( new BoxGeometry( w, h, d ), material );
	mesh.position.set( x, y + h / 2, z );
	group.add( mesh );
	return mesh;

};

// One panel's length of a fence kind (along x, its outside towards -z), with no stays: a chain-link
// panel stands on its feet, as on most sites.
function fencePiece( style, gate = false ) {

	const m = fenceMaterialsOf();
	const group = new Group();
	if ( PANELLED.includes( style ) ) group.add( buildProcedural( 'fence-panel' ) );
	if ( style === 'screened' || style === 'screened-black' ) {

		const sh = PANEL_HEIGHT - 0.1;
		block( group, style === 'screened' ? m.green : m.black, [ PANEL - 0.1, sh, 0.004 ], [ 0, 0.13, - 0.025 ] );
		for ( const y of [ 0.13, 0.13 + sh - 0.04 ] ) block( group, m.hem, [ PANEL - 0.1, 0.04, 0.006 ], [ 0, y, - 0.027 ] );

	}

	// Silt fence: 0.75 m of geotextile on stakes every half panel, its foot buried in a trench whose
	// spoil is the strip of soil along it. Along a panel fence, just outside its feet.
	if ( ! gate && ( style === 'silt' || style === 'mesh-silt' ) ) {

		const z = style === 'silt' ? 0 : - 0.45;
		block( group, m.geotextile, [ PANEL, 0.75, 0.01 ], [ 0, 0, z ] );
		for ( const x of [ - PANEL / 4, PANEL / 4 ] ) block( group, m.stake, [ 0.05, 0.95, 0.05 ], [ x, 0, z + 0.04 ] );
		block( group, m.soil, [ PANEL, 0.08, 0.3 ], [ 0, 0, z - 0.17 ] );

	}

	// Safety fence: 1.2 m of orange mesh tied to a T-post at each panel's end.
	if ( style === 'safety' ) {

		const mesh = new Mesh( new PlaneGeometry( PANEL, 1.2 ), m.orange );
		mesh.position.set( 0, 0.65, 0 );
		group.add( mesh );
		block( group, m.tpost, [ 0.05, 1.5, 0.05 ], [ - PANEL / 2, 0, 0.03 ] );

	}

	return group;

}

const fenceTemplates = new Map();
function fenceTemplate( style, gate = false ) {

	// [ { geometry, material, matrix } ]: each part of one panel's length, where it sits in it.
	const key = `${ style }${ gate ? ' gate' : '' }`;
	if ( fenceTemplates.has( key ) ) return fenceTemplates.get( key );
	const piece = fencePiece( style, gate );
	piece.updateMatrixWorld( true );
	const parts = [];
	piece.traverse( o => {

		if ( ! o.isMesh ) return;
		o.geometry.userData.shared = true;
		for ( const m of [ o.material ].flat() ) m.userData.shared = true;
		parts.push( { geometry: o.geometry, material: o.material, matrix: o.matrixWorld.clone() } );

	} );
	fenceTemplates.set( key, parts );
	return parts;

}

// Where the gates go: for each side (front, back, right, left), how many.
function gatesBySide( gates ) {

	const count = [ 0, 0, 0, 0 ];
	for ( let i = 0; i < gates; i ++ ) count[ i % 4 ] ++;
	return count;

}

export function buildFence( width, length, style, gates = 0 ) {

	const group = new Group();
	group.name = 'Temporary fence';
	if ( ! Object.values( FENCES ).includes( style ) || style === 'none' ) return group;
	const w = Math.max( 0.5, width / 2 - FENCE_INSET );
	const l = Math.max( 0.5, length / 2 - FENCE_INSET );
	// Each side from one corner to the next, going round, with the way out from it: the front is -z.
	const sides = [
		{ from: [ - w, - l ], to: [ w, - l ], out: [ 0, - 1 ] },
		{ from: [ w, l ], to: [ - w, l ], out: [ 0, 1 ] },
		{ from: [ w, - l ], to: [ w, l ], out: [ 1, 0 ] },
		{ from: [ - w, l ], to: [ - w, - l ], out: [ - 1, 0 ] },
	];
	const perSide = gatesBySide( Math.min( MAX_GATES, Math.max( 0, Math.round( gates ) ) ) );
	const placements = [];
	const leaves = [];
	const yAxis = new Vector3( 0, 1, 0 );
	const place = ( x, z, yaw, stretch, into = placements ) => {

		into.push( new Matrix4().compose( new Vector3( x, 0, z ), new Quaternion().setFromAxisAngle( yAxis, yaw ), new Vector3( stretch, 1, 1 ) ) );

	};

	sides.forEach( ( side, i ) => {

		const [ ax, az ] = side.from, [ bx, bz ] = side.to;
		const run = Math.hypot( bx - ax, bz - az );
		const dx = ( bx - ax ) / run, dz = ( bz - az ) / run;
		// A panel's outside (-z, where the screen hangs and the silt fence runs) faces out.
		const yaw = Math.atan2( - side.out[ 0 ], - side.out[ 1 ] );
		// The openings along this side, spread evenly, never wider than it.
		const n = perSide[ i ];
		const gate = Math.min( GATE_WIDTH, run / Math.max( 1, n ) * 0.8 );
		const openings = Array.from( { length: n }, ( _, k ) => ( k + 0.5 ) / n * run ).map( at => [ at - gate / 2, at + gate / 2 ] );
		// Fence between the openings.
		let start = 0;
		for ( const [ a, b ] of [ ...openings, [ run, run ] ] ) {

			const stretch = a - start;
			if ( stretch > 0.3 ) {

				const panels = Math.max( 1, Math.round( stretch / PANEL ) );
				const each = stretch / panels;
				for ( let k = 0; k < panels; k ++ ) {

					const at = start + ( k + 0.5 ) * each;
					place( ax + dx * at, az + dz * at, yaw, each / PANEL );

				}

			}

			start = b;

		}

		// Each gate's two leaves, hinged at the opening's ends and swung out (panel fences only).
		for ( const [ a, b ] of PANELLED.includes( style ) ? openings : [] ) {

			const leaf = ( b - a ) / 2;
			for ( const [ hinge, toward ] of [ [ a, 1 ], [ b, - 1 ] ] ) {

				const hx = ax + dx * hinge, hz = az + dz * hinge;
				// Closed, the leaf runs from the hinge along the side; open, it turns out of the area.
				const swing = MathUtils.degToRad( GATE_OPEN ) * toward * ( ( dx * side.out[ 1 ] - dz * side.out[ 0 ] ) > 0 ? 1 : - 1 );
				const ux = dx * toward, uz = dz * toward;
				const c = Math.cos( swing ), sn = Math.sin( swing );
				const ox = ux * c + uz * sn, oz = - ux * sn + uz * c;
				place( hx + ox * leaf / 2, hz + oz * leaf / 2, yaw + swing, leaf / PANEL, leaves );

			}

		}

	} );

	for ( const [ list, parts ] of [ [ placements, fenceTemplate( style ) ], [ leaves, leaves.length ? fenceTemplate( style, true ) : [] ] ] ) for ( const part of parts ) {

		if ( ! list.length ) continue;
		const mesh = new InstancedMesh( part.geometry, part.material, list.length );
		list.forEach( ( m, i ) => mesh.setMatrixAt( i, new Matrix4().multiplyMatrices( m, part.matrix ) ) );
		mesh.instanceMatrix.needsUpdate = true;
		mesh.computeBoundingSphere();
		mesh.castShadow = true;
		mesh.userData.noCollide = true;
		group.add( mesh );

	}

	return group;

}

// The zone as drawn in build mode: a see-through volume over the area, with a floor you can
// click to select it, up to its height limit if it has one (with a blue ceiling: what's above is
// left alone). None of it blocks walking or driving.
export function buildZone( width, length, height = 0, surface = 'none', fence = 'none', gates = 0 ) {

	const group = new Group();
	group.name = SURFACES[ surface ] ? `${ SURFACES[ surface ].name } pad` : 'Flattened area';
	group.userData.zone = true;

	const top = height > 0 ? height : VOLUME_HEIGHT;
	const volume = new Mesh( new BoxGeometry( width, top, length ), fillMaterial );
	volume.position.y = top / 2;
	volume.raycast = () => {};
	const edges = new LineSegments( new EdgesGeometry( volume.geometry ), edgeMaterial );
	edges.position.copy( volume.position );
	edges.raycast = () => {};

	const floor = new Mesh( new PlaneGeometry( width, length ).rotateX( - Math.PI / 2 ), floorMaterial );
	floor.position.y = 0.05;
	floor.renderOrder = 1;

	for ( const mesh of [ volume, edges, floor ] ) mesh.userData.noCollide = true;
	// The red box is only for laying a bare area out: shown in build mode (see models.js). A
	// surfaced one is just its gravel, asphalt or concrete (clicked on to select it), no box.
	for ( const mesh of [ volume, edges, floor ] ) mesh.userData.buildOnly = true;
	if ( SURFACES[ surface ] ) group.add( buildSurface( width, length, surface ) );
	else group.add( volume, edges, floor );
	if ( fence !== 'none' ) group.add( buildFence( width, length, fence, gates ) );
	if ( height > 0 ) {

		const ceiling = new Mesh( new PlaneGeometry( width, length ).rotateX( - Math.PI / 2 ), ceilingMaterial );
		ceiling.position.y = height;
		ceiling.raycast = () => {};
		ceiling.userData.noCollide = true;
		ceiling.userData.buildOnly = true;
		group.add( ceiling );

	}

	return group;

}

registerKind( ZONE_ID, {
	label: 'Flattened area',
	layer: 'Flatten areas',
	build: ( { width, length, height, surface, fence, gates } ) => buildZone( width, length, height, surface, fence, gates ),
	// Areas saved before surfaces existed have none, and are saved again without one.
	// And without a fence, which areas saved without one leave out of what's saved.
	normalize: p => ( {
		width: clampSize( p.width ), length: clampSize( p.length ), height: clampHeight( p.height ), surface: SURFACES[ p.surface ] ? p.surface : 'none',
		fence: Object.values( FENCES ).includes( p.fence ) ? p.fence : 'none', gates: Math.min( MAX_GATES, Math.max( 0, Math.round( Number( p.gates ) || 0 ) ) ),
	} ),
	save: ( { surface, fence, gates, ...rest } ) => ( { ...rest, ...( surface === 'none' ? {} : { surface } ), ...( fence === 'none' ? {} : { fence, gates } ) } ),
	// Down to the lowest ground around it as Google made it, so flattening doesn't drag it lower, and
	// whatever stands in it is cleared. A surfaced one (a pad of gravel, asphalt or concrete) at the
	// ground's usual height round it instead, so it isn't a pit; what stands on it is pressed flat
	// all the same, and what's lower is under the pad.
	snap: ( { surface } ) => SURFACES[ surface ] ? 'median-original' : 'lowest-original',
	solid: false,
	buildOnly: true,
	// A surfaced area's gravel or asphalt stays in view outside build mode (it has no red box).
	shownOutsideBuild: params => params.surface !== 'none' || params.fence !== 'none',
	altersMap: true,
	fields: [
		{ key: 'surface', label: 'surface', options: SURFACE_OPTIONS, size: true, editor: true },
		{ key: 'fence', label: 'fence', options: FENCES, size: true, editor: true },
		{ key: 'gates', label: 'entrances (24 ft)', min: 0, max: MAX_GATES, step: 1, size: true, when: p => p.fence !== 'none' },
		{ key: 'width', label: 'width (m)', min: 1, step: 0.5, size: true },
		{ key: 'length', label: 'length (m)', min: 1, step: 0.5, size: true },
		// 0 flattens everything above the floor, as areas always did (and saved ones still do).
		{ key: 'height', label: 'flatten up to (m, 0 = all)', min: 0, max: MAX_HEIGHT, step: 0.5, size: true },
	],
	// A box is cheap to rebuild, and the flattening itself catches up a few times a second.
	resize: {
		shape: 'rect',
		live: true,
		label: ( { width, length, height, surface, fence } ) => `${ width.toFixed( 1 ) } × ${ length.toFixed( 1 ) } m · ${ Math.round( width * length ).toLocaleString( 'en-CA' ) } m²${ SURFACES[ surface ] ? ` · ${ SURFACES[ surface ].name.toLowerCase() }` : '' }${ fence !== 'none' ? ' · fenced' : '' }${ height > 0 ? ` · up to ${ height.toFixed( 1 ) } m` : '' }`,
	},
} );

// The surface the next area drawn gets: the one last chosen for an area, gravel to begin with.
let nextSurface = 'gravel';
export function defaultSurface() {

	return nextSurface;

}

export function rememberSurface( surface ) {

	if ( SURFACES[ surface ] || surface === 'none' ) nextSurface = surface;

}

function clampSize( v ) {

	return Math.min( 2000, Math.max( 1, Number( v ) || 10 ) );

}

function clampHeight( v ) {

	return Math.min( MAX_HEIGHT, Math.max( 0, Number( v ) || 0 ) );

}

// The plugin raycasts its shapes once per tile vertex. A clone of a plain Mesh loses any
// per-object raycast override, so shapes with many triangles use this class to keep the BVH.
export class ShapeMesh extends Mesh {

	raycast( raycaster, intersects ) {

		if ( this.geometry.boundsTree ) acceleratedRaycast.call( this, raycaster, intersects );
		else super.raycast( raycaster, intersects );

	}

}

// Keeps TileFlatteningPlugin shapes in step with flatten areas and with shapes other modules set.
// Does nothing without Google tiles, apart from originalHeight().
export function setUpFlattening( { tiles, models } ) {

	const plugin = tiles ? new TileFlatteningPlugin() : null;
	if ( plugin ) tiles.registerPlugin( plugin );

	const shapes = new Map(); // key (an entry, or another module's key) -> shape in the tileset's frame
	const sources = new Map(); // other modules' key -> their mesh, in the scene's frame
	const dirty = new Set();
	const scale = new Matrix4();
	const down = new Vector3();
	// Where the tileset stood when the shapes were last made (see update()).
	const frame = new Matrix4();
	let timer = 0;
	// Off: no shape is in the plugin, which then gives every tile its original vertices back.
	// Shapes keep up with their areas meanwhile, and go back in when it's turned on.
	let enabled = true;

	const toTileset = () => {

		tiles.group.updateWorldMatrix( true, false );
		return scale.copy( tiles.group.matrixWorld ).invert();

	};

	// `threshold`: how far above the shape the plugin presses vertices down onto it (an area's
	// height limit); higher ones are left where they are.
	const commit = ( key, shape, threshold = Infinity ) => {

		// The plugin presses vertices along this direction onto the shape; pointing down, it
		// flattens what's above the floor and leaves what's below (e.g. water under a deck).
		down.set( 0, - 1, 0 ).transformDirection( toTileset() );
		const current = plugin.shapes.get( shape );
		if ( current && current.direction.distanceToSquared( down ) < 1e-12 && current.threshold === threshold ) {

			plugin.updateShape( shape );
			return;

		}

		// New, or the frame or the height limit has changed since (the plugin keeps both from
		// when the shape was added): add it afresh. A saved layout's areas are made before
		// Google's root tileset has loaded and been turned to the site, when "down" in the
		// tileset's frame points somewhere else entirely; update() makes them again once it is.
		if ( current ) plugin.deleteShape( shape );
		plugin.addShape( shape, down, { threshold } );
		shapes.set( key, shape );

	};

	const remove = key => {

		const shape = shapes.get( key );
		if ( ! shape ) return;
		if ( plugin.hasShape( shape ) ) plugin.deleteShape( shape );
		shapes.delete( key );

	};

	const sync = key => {

		if ( ! plugin || ! enabled ) return;
		const source = sources.get( key );
		if ( source !== undefined ) {

			if ( ! source ) {

				remove( key );
				sources.delete( key );
				return;

			}

			// The plugin works in the tileset's own frame, so bring the shape into it.
			const { geometry } = source;
			geometry.computeBoundingBox();
			geometry.computeBoundingSphere();
			let shape = shapes.get( key );
			if ( ! shape || shape.geometry !== geometry ) {

				remove( key );
				shape = new ShapeMesh( geometry );
				shape.matrixAutoUpdate = false;

			}

			source.updateWorldMatrix( true, false );
			shape.matrix.multiplyMatrices( toTileset(), source.matrixWorld );
			shape.matrixWorld.copy( shape.matrix );
			commit( key, shape );
			return;

		}

		const entry = key;
		if ( ! models.entries.includes( entry ) ) return;
		let shape = shapes.get( entry );
		if ( ! shape ) {

			shape = new Mesh( new PlaneGeometry( 1, 1 ).rotateX( - Math.PI / 2 ) );
			shape.matrixAutoUpdate = false;

		}

		// The area's floor, in the tileset's frame.
		const { pivot, params } = entry;
		pivot.updateWorldMatrix( true, false );
		shape.matrix.multiplyMatrices( toTileset(), pivot.matrixWorld )
			.multiply( new Matrix4().makeScale( params.width, 1, params.length ) );
		shape.matrixWorld.copy( shape.matrix );
		commit( entry, shape, params.height > 0 ? params.height : Infinity );

	};

	const mark = ( { entry } ) => {

		if ( entry.kind === ZONE_ID && ! entry.placing ) dirty.add( entry );

	};

	// An area's surface as last seen: when it's changed in the P panel, the next area drawn
	// gets the same (gravel, then asphalt all evening, say). Loading a layout doesn't count.
	const surfaces = new WeakMap();
	models.addEventListener( 'add', e => {

		mark( e );
		if ( e.entry.kind === ZONE_ID ) surfaces.set( e.entry, e.entry.params.surface );

	} );
	models.addEventListener( 'change', e => {

		mark( e );
		const { entry } = e;
		if ( entry.kind !== ZONE_ID ) return;
		const before = surfaces.get( entry );
		if ( before !== undefined && before !== entry.params.surface ) rememberSurface( entry.params.surface );
		surfaces.set( entry, entry.params.surface );

	} );
	models.addEventListener( 'remove', ( { entry } ) => {

		dirty.delete( entry );
		if ( plugin ) remove( entry );

	} );

	// Google's tiles as loaded, before any flattening: the plugin keeps each tile's original
	// vertex positions so it can redo the flattening. geometry -> original positions array.
	const originals = new WeakMap();
	const findOriginal = geometry => {

		if ( ! plugin ) return null;
		if ( ! originals.has( geometry ) ) {

			for ( const geomMap of plugin.positionsMap.values() ) for ( const [ g, buffer ] of geomMap ) originals.set( g, buffer );

		}

		return originals.get( geometry ) ?? null;

	};

	const raycaster = new Raycaster();
	raycaster.firstHitOnly = true;
	const DOWN = new Vector3( 0, - 1, 0 );
	const corners = [ new Vector3(), new Vector3(), new Vector3() ];
	const before = [ new Vector3(), new Vector3(), new Vector3() ];

	return {

		update( dt ) {

			// Whenever Google's tileset is turned to a site (when its root loads, or turned again
			// later), make every shape again in its new frame.
			if ( plugin && ! frame.equals( tiles.group.matrixWorld ) ) {

				frame.copy( tiles.group.matrixWorld );
				for ( const key of shapes.keys() ) dirty.add( key );

			}

			timer -= dt;
			if ( ! enabled || timer > 0 || dirty.size === 0 ) return;
			timer = UPDATE_INTERVAL;
			for ( const key of dirty ) sync( key );
			dirty.clear();

		},

		// Off puts Google's mesh back as it was everywhere; on flattens it again, at once. The plugin
		// keeps each tile's original vertices, so neither way loses anything.
		setEnabled( on ) {

			if ( on === enabled ) return;
			enabled = on;
			if ( ! plugin ) return;
			if ( on ) {

				// Made again from the areas and other modules' meshes as they are now.
				for ( const key of shapes.keys() ) dirty.add( key );
				for ( const key of sources.keys() ) dirty.add( key );
				for ( const key of dirty ) sync( key );
				dirty.clear();
				return;

			}

			for ( const shape of shapes.values() ) if ( plugin.hasShape( shape ) ) plugin.deleteShape( shape );

		},

		get enabled() {

			return enabled;

		},

		// How many shapes press Google's mesh flat now (none while it's turned off).
		get shapeCount() {

			return plugin ? plugin.shapes.size : 0;

		},

		// Press Google's mesh down onto `mesh` (in the scene's frame, e.g. the floor of a pit)
		// wherever the mesh lies under it; null removes it. Call again after changing the mesh
		// or moving it. Changes are applied a few times a second, as each one reworks every tile
		// under the shapes. Shapes with many triangles should be a ShapeMesh with a boundsTree.
		setShape( key, mesh ) {

			sources.set( key, mesh );
			dirty.add( key );

		},

		// Ground height at local (x, z) as Google (or the stand-in ground) made it, ignoring
		// flatten areas and pits. Null where there's no ground. With `detail`, detail.error says
		// how coarse that ground is: the geometric error in metres of the Google tile it's from
		// (0 for other ground, Infinity for none). Tiles far from the camera, and those that load
		// first, are coarse, and the ground can be metres out on them.
		originalHeight( x, z, ground = tiles?.group, detail = null ) {

			if ( detail ) detail.error = Infinity;
			if ( ! ground ) return null;
			raycaster.set( new Vector3( x, 5000, z ), DOWN );
			raycaster.far = 10000;
			const hit = raycaster.intersectObject( ground, true ).find( h => h.object.isMesh );
			if ( ! hit ) return null;
			if ( detail ) detail.error = hit.object.userData.tile?.geometricError ?? 0;
			const original = hit.face && findOriginal( hit.object.geometry );
			if ( ! original ) return hit.point.y;

			// Flattening only moves vertices up and down, so the hit's place across the triangle
			// is the same before and after; read the height there from the original corners.
			const { position } = hit.object.geometry.attributes;
			const ids = [ hit.face.a, hit.face.b, hit.face.c ];
			ids.forEach( ( id, i ) => {

				corners[ i ].fromBufferAttribute( position, id ).applyMatrix4( hit.object.matrixWorld );
				before[ i ].set( ...[ 0, 1, 2 ].map( k => readValue( original, id * 3 + k, position ) ) ).applyMatrix4( hit.object.matrixWorld );

			} );
			const w = barycentricXZ( hit.point, corners );
			if ( ! w ) return hit.point.y;
			return before[ 0 ].y * w[ 0 ] + before[ 1 ].y * w[ 1 ] + before[ 2 ].y * w[ 2 ];

		},

		get active() {

			return enabled && shapes.size > 0;

		},

	};

}

function readValue( array, index, attribute ) {

	const value = array[ index ];
	return attribute.normalized ? MathUtils.denormalize( value, array ) : value;

}

// Weights of p's position across triangle t, looking straight down, or null if t is a sliver.
function barycentricXZ( p, [ a, b, c ] ) {

	const d = ( b.z - c.z ) * ( a.x - c.x ) + ( c.x - b.x ) * ( a.z - c.z );
	if ( Math.abs( d ) < 1e-9 ) return null;
	const u = ( ( b.z - c.z ) * ( p.x - c.x ) + ( c.x - b.x ) * ( p.z - c.z ) ) / d;
	const v = ( ( c.z - a.z ) * ( p.x - c.x ) + ( a.x - c.x ) * ( p.z - c.z ) ) / d;
	return [ u, v, 1 - u - v ];

}
