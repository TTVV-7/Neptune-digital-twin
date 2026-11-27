import { CylinderGeometry, ExtrudeGeometry, MathUtils, Matrix4, Path, PlaneGeometry, Quaternion, Shape, Vector2, Vector3 } from 'three';
import { drawn, FT, GALVANISED, IN, mat, Parts } from './parts.js';

// Building structure and envelope materials, built in code at real North American sizes: a braced
// tilt-up wall panel, precast staged in the yard or on site (hollow-core plank, a double tee, wall
// panels on an A-frame, a stair flight), steel joists, a joist girder and deck bundles, wood roof
// trusses, glulam beams and CLT panels, curtain wall units and windows in their racks, tagged rebar
// bundles and pallets of roofing. Like the other built-in pieces each stands on y = 0 with its front
// facing -Z (+X is its right); the long pieces lie with their length across, along x.

const DEG = MathUtils.DEG2RAD;
const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();

export const BUILDING_MATERIAL_ITEMS = [
	{ id: 'tilt-up-panel-braced', name: 'Tilt-up concrete wall panel, erected with pipe braces (30 × 40 ft, 9¼ in, 4 braces to deadmen)', category: 'Concrete & batching',
		keywords: 'tilt up tiltup tilt-wall concrete wall panel braces pipe brace deadman deadmen big box warehouse distribution center erection lifting inserts', build: tiltUpPanel },
	{ id: 'hollow-core-plank-stack', name: 'Precast hollow-core planks on dunnage (6 × 4 ft × 30 ft, 8 in deep)', category: 'Materials',
		keywords: 'hollow core hollowcore plank precast prestressed floor slab spancrete planks stack dunnage', build: hollowCoreStack },
	{ id: 'precast-double-tee', name: 'Precast double tee on laydown blocks (10 ft wide × 60 ft, 24 in stems, ~21 t)', category: 'Materials',
		keywords: 'double tee dt precast prestressed parking garage deck stems flange lifting loops laydown blocking', build: doubleTee },
	{ id: 'precast-wall-panel-a-frame', name: 'Precast architectural wall panels on A-frame stillage (4 × 10 × 30 ft, 8 in)', category: 'Materials',
		keywords: 'precast wall panels architectural cladding a-frame a frame stillage rack chained storage delivery', build: wallPanelAFrame },
	{ id: 'precast-stair-flight', name: 'Precast concrete stair flight on dunnage and cribbing (4 ft wide, 12 risers, landing ends)', category: 'Materials',
		keywords: 'precast stair stairs flight stairway landing concrete steps cribbing dunnage lifting inserts', build: stairFlight },
	{ id: 'open-web-joist-bundle', name: 'Open-web steel joist bundle (10 × 24K joists × 40 ft, on dunnage)', category: 'Materials',
		keywords: 'bar joist open web steel joist owsj k series 24k bundle roof joists vulcraft dunnage', build: joistBundle },
	{ id: 'joist-girder', name: 'Joist girder on dunnage (60 ft span, 54 in deep, braced upright)', category: 'Materials',
		keywords: 'joist girder jg open web girder steel truss roof girder dunnage braced', build: joistGirder },
	{ id: 'metal-deck-bundle', name: 'Steel deck bundles, 1½ in B-deck (3 bundles of 36 in × 30 ft sheets, on dunnage)', category: 'Materials',
		keywords: 'metal deck steel deck b deck roof deck floor deck galvanized fluted sheets bundle decking', build: deckBundles },
	{ id: 'wood-roof-truss-bundle', name: 'Wood roof trusses, banded bundle on dunnage (12 × 36 ft span, 6/12 pitch)', category: 'Materials',
		keywords: 'roof trusses wood truss fink truss bundle lumber framing residential gang nail plates banded', build: trussBundle },
	{ id: 'glulam-beam-bundle', name: 'Glulam beams, wrapped bundle (4 × 6¾ × 24 in × 40 ft, on dunnage)', category: 'Materials',
		keywords: 'glulam glue laminated beam timber mass timber wrapped bundle lumber dunnage', build: glulamBundle },
	{ id: 'clt-panel-stack', name: 'CLT floor panels, stack (5 × 8 × 40 ft, 7-ply, ~3.5 t each)', category: 'Materials',
		keywords: 'clt cross laminated timber mass timber panel floor panels stack lifting points dunnage', build: cltStack },
	{ id: 'curtain-wall-unit-stillage', name: 'Unitized curtain wall panels in a steel stillage (6 units, 5 × 13 ft)', category: 'Materials',
		keywords: 'curtain wall unitized units glazing glass aluminium stillage rack facade cladding window wall', build: curtainWallStillage },
	{ id: 'window-crate', name: 'Window units on an A-frame pallet rack (8 frames, 4 × 6 ft)', category: 'Materials',
		keywords: 'windows window units punched windows glazing frames a-frame rack pallet crate delivery', build: windowCrate },
	{ id: 'rebar-bundle-dunnage', name: 'Rebar bundles on dunnage, tagged (6 bundles #5 to #8 × 40 ft, ~12 t)', category: 'Materials',
		keywords: 'rebar reinforcing steel bundles bars tagged tags dunnage laydown #5 #6 #7 #8 reo', build: rebarBundles },
	{ id: 'roofing-material-pallets', name: 'Roofing materials on pallets (TPO rolls 10 × 100 ft, polyiso 4 × 8 ft, adhesive pails; 4 pallets)', category: 'Materials',
		keywords: 'roofing tpo membrane rolls polyiso insulation boards adhesive pails pallets low slope roof staging', build: roofingPallets },
];

// --- materials and shared pieces -------------------------------------------------------------

const CONCRETE = () => mat( 0xb7b3aa, { roughness: 0.95 } );
const CONCRETE_DARK = () => mat( 0x8f8b84, { roughness: 0.95 } );
const ARCHITECTURAL = () => mat( 0xd8ccb2, { roughness: 0.95 } );
const TIMBER = () => mat( 0x9c7a50, { roughness: 0.95 } );
const LUMBER = () => mat( 0xd9b57e, { roughness: 0.9 } );
const STRAP = () => mat( 0x3b3e41, { roughness: 0.5, metalness: 0.5 } );
const PRIMER = () => mat( 0x74787a, { roughness: 0.7, metalness: 0.3 } );
const DARK = () => mat( 0x26282a, { roughness: 0.8 } );
const STEEL = () => mat( 0x7d8287, { roughness: 0.5, metalness: 0.6 } );
const RUST = () => mat( 0x7a4f36, { roughness: 0.85, metalness: 0.3 } );
const BRACE = () => mat( 0xdba21c, { roughness: 0.55, metalness: 0.2 } );
const RUBBER = () => mat( 0x161718, { roughness: 0.9 } );

// Timbers running along z (across a bundle lying along x), at each of `xs`.
function dunnage( parts, xs, length, [ w, h ] = [ 3.5 * IN, 3.5 * IN ], y = 0, z = 0 ) {

	for ( const x of xs ) parts.box( TIMBER(), [ w, h, length ], [ x, y, z ] );

}

// A steel band round a bundle at x: over the top, under the bottom and down both sides of the
// box [ y0, y1 ] × [ z0, z1 ].
function band( parts, x, [ y0, y1 ], [ z0, z1 ], width = 1.25 * IN ) {

	const strap = STRAP();
	const t = 0.003;
	for ( const y of [ y1, y0 - t ] ) parts.box( strap, [ width, t, z1 - z0 + 2 * t ], [ x, y, ( z0 + z1 ) / 2 ] );
	for ( const z of [ z0 - t / 2, z1 + t / 2 ] ) parts.box( strap, [ width, y1 - y0, t ], [ x, y0, z ] );

}

// A member from [ x1, y1 ] to [ x2, y2 ] in the x-y plane at depth z: w deep in the plane, t thick.
function strut( parts, material, [ x1, y1 ], [ x2, y2 ], w, t, z ) {

	const dx = x2 - x1;
	const dy = y2 - y1;
	parts.block( material, [ Math.hypot( dx, dy ), w, t ], [ ( x1 + x2 ) / 2, ( y1 + y2 ) / 2, z ], [ 0, 0, Math.atan2( dy, dx ) ] );

}

// A cross-section (points [ z, y ], with optional round holes [ z, y, r ]) extruded along x by
// `length`, centred on x = 0: precast plank, deck and tee profiles.
function alongX( points, length, holes = [] ) {

	const shape = new Shape( points.map( ( [ z, y ] ) => new Vector2( z, y ) ) );
	for ( const [ z, y, r ] of holes ) shape.holes.push( new Path().absarc( z, y, r, 0, Math.PI * 2, true ) );
	const geometry = new ExtrudeGeometry( shape, { depth: length, bevelEnabled: false, curveSegments: 6 } );
	geometry.rotateY( - Math.PI / 2 );
	geometry.translate( length / 2, 0, 0 );
	return geometry;

}

// A profile (points [ x, y ]) extruded along z by `depth`, centred on z = 0.
function alongZ( points, depth ) {

	const shape = new Shape( points.map( ( [ x, y ] ) => new Vector2( x, y ) ) );
	const geometry = new ExtrudeGeometry( shape, { depth, bevelEnabled: false } );
	geometry.translate( 0, 0, - depth / 2 );
	return geometry;

}

// One side of an A-frame rack: a plane leaning in towards the ridge at `tilt` from vertical,
// meeting the base at z = side * foot, height y0. lean( u, n ) is the point u up the slope and n
// out from it; block() puts a box there, lying in the slope, its size [ along x, up, out ].
function slope( side, foot, y0, tilt ) {

	const [ sin, cos ] = [ Math.sin( tilt ), Math.cos( tilt ) ];
	const lean = ( u, n ) => [ y0 + u * cos + n * sin, side * ( foot - u * sin + n * cos ) ];
	return {
		lean,
		block( parts, material, size, [ x, u, n ] ) {

			const [ y, z ] = lean( u, n );
			parts.block( material, size, [ x, y, z ], [ - side * tilt, 0, 0 ] );

		},
		// How far down the slope a slab `n` out has to slide for its inner edge to reach the base.
		drop: n => n * sin / cos,
	};

}

// A wooden pallet [ along x, along z ] centred on [ x, z ]: three stringers along x and deck
// boards across. Returns the height of its deck.
function pallet( parts, [ lx, lz ], [ x = 0, z = 0 ] = [] ) {

	const wood = mat( 0xb39265, { roughness: 0.95 } );
	const h = 5.5 * IN;
	for ( const s of [ - 1, 0, 1 ] ) parts.box( wood, [ lx, h - 0.75 * IN * 2, 1.5 * IN ], [ x, 0.75 * IN, z + s * ( lz / 2 - 0.75 * IN ) ] );
	const boards = Math.max( 3, Math.round( lx / ( 6 * IN ) ) );
	for ( let i = 0; i < boards; i ++ ) {

		const bx = x - lx / 2 + 2.75 * IN + i * ( lx - 5.5 * IN ) / ( boards - 1 );
		parts.box( wood, [ 5.5 * IN, 0.75 * IN, lz ], [ bx, h - 0.75 * IN, z ] );
		if ( i % 2 === 0 ) parts.box( wood, [ 5.5 * IN, 0.75 * IN, lz ], [ bx, 0, z ] );

	}

	return h;

}

// A cheap repeatable "random" number in [ 0, 1 ) from an integer.
function hash( i ) {

	const s = Math.sin( i * 127.1 + 311.7 ) * 43758.5453;
	return s - Math.floor( s );

}

// --- tilt-up panel ---------------------------------------------------------------------------

// A 30 × 40 ft tilt-up panel, 9¼ in thick, just stood up on its footing: grouted on shims, with
// four telescoping pipe braces from inserts at about two thirds of its height down to cast-in-place
// deadmen on the inside (the front), and the lifting inserts it was stood up by showing on that
// face. Reveals score the outside face.
function tiltUpPanel() {

	const parts = new Parts();
	const concrete = CONCRETE();
	const dark = CONCRETE_DARK();
	const brace = BRACE();
	const steel = STEEL();
	const W = 30 * FT;
	const H = 40 * FT;
	const T = 9.25 * IN;
	const footing = 0.2;
	const base = footing + 0.02;
	const attach = base + 26 * FT;
	const reach = 26 * FT / Math.tan( 55 * DEG );
	const zp = reach / 2 + 0.2;
	const face = zp - T / 2;

	// Footing strip, its top a little above grade, the grout bed and the panel on it.
	parts.box( dark, [ W + 0.6, footing, 0.9 ], [ 0, 0, zp ] );
	parts.box( mat( 0x77736d, { roughness: 1 } ), [ W, 0.02, T ], [ 0, footing, zp ] );
	parts.box( concrete, [ W, H, T ], [ 0, base, zp ] );

	// Reveals across the outside face.
	for ( const y of [ 12 * FT, 28 * FT, 37 * FT ] ) parts.box( dark, [ W, 1 * IN, 0.004 ], [ 0, base + y, zp + T / 2 + 0.002 ] );

	// Lifting inserts on the inside face: two rows of four recessed pockets.
	for ( const y of [ 14 * FT, 33 * FT ] ) {

		for ( const x of [ - 11.25, - 3.75, 3.75, 11.25 ] ) parts.rod( dark, [ x * FT, base + y, face + 0.001 ], [ x * FT, base + y, face - 0.003 ], 0.06, 12 );

	}

	// The braces, each from its shoe bolted to the panel down to a shoe on a deadman: an outer pipe
	// with the screw adjuster near the foot, the inner pipe sliding out of it to the top.
	for ( const xf of [ - 11.5, - 4, 4, 11.5 ] ) {

		const x = xf * FT;
		const zd = face - reach;
		parts.box( concrete, [ 0.9, 0.15, 0.9 ], [ x, 0, zd ] );
		parts.box( steel, [ 0.2, 0.025, 0.32 ], [ x, 0.15, zd ] );
		parts.box( steel, [ 0.2, 0.32, 0.025 ], [ x, attach - 0.16, face - 0.0125 ] );
		const foot = [ x, 0.15 + 0.1, zd + 0.05 ];
		const top = [ x, attach, face - 0.06 ];
		const along = t => foot.map( ( v, i ) => v + ( top[ i ] - v ) * t );
		parts.rod( brace, foot, along( 0.6 ), 2.25 * IN, 12 );
		parts.rod( brace, along( 0.55 ), top, 1.65 * IN, 12 );
		parts.rod( brace, along( 0.04 ), along( 0.1 ), 2.8 * IN, 12 );
		parts.rod( steel, along( 0.6 ), along( 0.62 ), 2.6 * IN, 12 );
		// Pinned end fittings.
		const lean = Math.atan2( top[ 2 ] - foot[ 2 ], top[ 1 ] - foot[ 1 ] );
		parts.block( steel, [ 0.12, 0.14, 0.12 ], foot, [ lean, 0, 0 ] );
		parts.block( steel, [ 0.12, 0.14, 0.12 ], top, [ lean, 0, 0 ] );

	}

	return parts.build();

}

// --- precast ---------------------------------------------------------------------------------

// Six 4 ft hollow-core planks, 8 in deep and 30 ft long, two wide and three high on 4 × 4
// dunnage near their ends, the six cores of each open at the ends.
function hollowCoreStack() {

	const parts = new Parts();
	const concrete = CONCRETE();
	const L = 30 * FT;
	const D = 8 * IN;
	const d = 3.5 * IN;
	// The plank's section in inches, with the grout keys along its edges, and its cores.
	const half = 23.75;
	const section = [ [ - half, 0 ], [ half, 0 ], [ half, 1.25 ], [ half - 0.6, 2 ], [ half - 0.6, 5.5 ], [ half, 6.25 ], [ half, 8 ],
		[ - half, 8 ], [ - half, 6.25 ], [ - half + 0.6, 5.5 ], [ - half + 0.6, 2 ], [ - half, 1.25 ] ];
	const cores = [ 0, 1, 2, 3, 4, 5 ].map( i => [ ( i - 2.5 ) * 7.6 * IN, 4 * IN, 2.75 * IN ] );
	const pitch = 48.5 * IN;
	const xs = [ - L / 2 + 2 * FT, L / 2 - 2 * FT ];
	for ( let k = 0; k < 3; k ++ ) {

		const y = d + k * ( D + d );
		dunnage( parts, xs, 2 * pitch + 6 * IN, [ d, d ], y - d );
		for ( const s of [ - 0.5, 0.5 ] ) {

			const z = s * pitch;
			const plank = alongX( section.map( ( [ a, b ] ) => [ a * IN, b * IN ] ), L, cores );
			parts.add( concrete, plank, _m.makeTranslation( 0, y, z ) );

		}

	}

	return parts.build();

}

// A 10 ft wide pretopped double tee, 24 in deep and 60 ft long, stems down on two 8 × 8 timbers
// across its ends: the 4 in flange with its weld plates along both edges and strand lifting loops
// over the stems.
function doubleTee() {

	const parts = new Parts();
	const concrete = CONCRETE();
	const steel = STEEL();
	const L = 60 * FT;
	const block = 7.5 * IN;
	// Section in inches: the flange and two tapered stems 5 ft apart.
	const section = [ [ - 60, 24 ], [ - 60, 20.5 ], [ - 59.5, 20 ] ];
	for ( const c of [ - 30, 30 ] ) section.push( [ c - 3.875, 20 ], [ c - 2.875, 0 ], [ c + 2.875, 0 ], [ c + 3.875, 20 ] );
	section.push( [ 59.5, 20 ], [ 60, 20.5 ], [ 60, 24 ] );
	parts.add( concrete, alongX( section.map( ( [ z, y ] ) => [ z * IN, y * IN ] ), L ), _m.makeTranslation( 0, block, 0 ) );

	dunnage( parts, [ - L / 2 + 3 * FT, L / 2 - 3 * FT ], 11 * FT, [ block, block ] );
	const top = block + 24 * IN;

	// Flange weld plates every 5 ft along each edge.
	for ( let x = - L / 2 + 5 * FT; x < L / 2 - 1; x += 5 * FT ) {

		for ( const s of [ - 1, 1 ] ) parts.box( steel, [ 4 * IN, 3 * IN, 0.006 ], [ x, top - 3.5 * IN, s * ( 60 * IN + 0.003 ) ] );

	}

	// Strand lifting loops over each stem, 6 ft in from the ends.
	const strand = mat( 0x6f7377, { roughness: 0.55, metalness: 0.6 } );
	for ( const x of [ - L / 2 + 6 * FT, L / 2 - 6 * FT ] ) {

		for ( const z of [ - 30 * IN, 30 * IN ] ) {

			parts.path( strand, [ [ x - 0.07, top - 0.01, z ], [ x - 0.05, top + 0.09, z ], [ x + 0.05, top + 0.09, z ], [ x + 0.07, top - 0.01, z ] ], 0.008, 6 );

		}

	}

	return parts.build();

}

// Four architectural precast panels, 10 ft high, 30 ft long and 8 in thick, two leaning on each
// side of a steel A-frame stillage on timber bearers and chained over the top, their sandblasted
// faces outward with reveals.
function wallPanelAFrame() {

	const parts = new Parts();
	const steel = mat( 0x3d5a73, { roughness: 0.55, metalness: 0.4 } );
	const panel = ARCHITECTURAL();
	const dark = mat( 0xa79b84, { roughness: 0.95 } );
	const chain = mat( 0x55595d, { roughness: 0.5, metalness: 0.6 } );
	const L = 30 * FT;
	const H = 10 * FT;
	const T = 8 * IN;
	const frameH = 0.2;
	const y0 = frameH + 3.5 * IN;
	const foot = 0.62;
	const ridge = 3.0;
	const tilt = Math.atan( ( foot - 0.16 ) / ( ridge - y0 ) );
	const length = L + 2 * FT;

	// Base: cross beams every 8 ft or so, tied by three rails along it.
	for ( let i = 0; i < 5; i ++ ) parts.box( steel, [ 5 * IN, frameH, 2.7 ], [ - length / 2 + 0.1 + i * ( length - 0.2 ) / 4, 0, 0 ] );
	for ( const z of [ - 1.0, 0, 1.0 ] ) parts.box( steel, [ length, 0.06, 0.12 ], [ 0, frameH - 0.06, z ] );

	for ( const side of [ - 1, 1 ] ) {

		const s = slope( side, foot, y0, tilt );

		// Timber bearers the panels stand on.
		for ( const z of [ foot + 0.12, foot + 0.4 ] ) parts.box( TIMBER(), [ length - 0.3, 3.5 * IN, 5.5 * IN ], [ 0, frameH, side * z ] );

		// The A-frame's legs (the slope is their outer face) and a tie across halfway up.
		for ( let i = 0; i < 5; i ++ ) {

			const x = - length / 2 + 0.1 + i * ( length - 0.2 ) / 4;
			const up = ( ridge - y0 ) / Math.cos( tilt );
			s.block( parts, steel, [ 4 * IN, up, 4 * IN ], [ x, up / 2, - 2 * IN ] );
			if ( side === 1 ) {

				const [ y ] = s.lean( up / 2, - 2 * IN );
				parts.box( steel, [ 3 * IN, 3 * IN, 2 * ( foot - 0.23 ) ], [ x, y, 0 ] );

			}

		}

		// The two panels on this side, the outer one on the inner with a 1 in spacer between.
		let n = 0;
		for ( let k = 0; k < 2; k ++ ) {

			const u = H / 2 - s.drop( n );
			s.block( parts, panel, [ L, H, T ], [ 0, u, n + T / 2 ] );
			// Reveals on the outer face, if it shows.
			if ( k === 1 ) {

				for ( const x of [ - L / 6, L / 6 ] ) s.block( parts, dark, [ 1 * IN, H, 0.004 ], [ x, u, n + T + 0.002 ] );
				s.block( parts, dark, [ L, 1 * IN, 0.004 ], [ 0, u + H / 6, n + T + 0.002 ] );

			}

			n += T + 1 * IN;

		}

		// Chains from the base over the top corner of the outer panel to the ridge.
		for ( const x of [ - 9 * FT, 9 * FT ] ) {

			const [ yt, zt ] = s.lean( H - s.drop( n - 1 * IN ), n - 1 * IN + 0.01 );
			parts.path( chain, [ [ x, frameH, side * 1.34 ], [ x, yt, zt ], [ x, ridge + 0.06, 0 ] ], 0.01, 6 );

		}

	}

	// Ridge beam along the top.
	parts.box( steel, [ length, 0.12, 0.3 ], [ 0, ridge - 0.06, 0 ] );

	return parts.build();

}

// A precast stair flight 4 ft wide: a 3 ft bottom landing, 12 risers of 7 in on 11 in treads and
// a 4 ft top landing, cast with its 8 in landings and a 6 in waist. It's stored as it will sit,
// the bottom landing on dunnage and the top one on a timber crib, with lifting inserts in two treads.
function stairFlight() {

	const parts = new Parts();
	const concrete = CONCRETE();
	const dark = CONCRETE_DARK();
	const width = 4 * FT;
	const rise = 7 * IN;
	const tread = 11 * IN;
	const slab = 8 * IN;
	const waist = 6 * IN;
	const low = 3 * FT;
	const high = 4 * FT;
	const d = 3.5 * IN;
	const top = slab + 12 * rise;
	const under = top - slab;
	const length = low + 11 * tread + high;
	// The soffit runs parallel to the pitch line, `waist` under the roots of the steps.
	const slopeK = rise / tread;
	const offset = waist / Math.cos( Math.atan( slopeK ) );
	const soffitAt = y => low + ( y - slab + offset ) / slopeK;
	const points = [ [ 0, 0 ], [ soffitAt( 0 ), 0 ], [ soffitAt( under ), under ], [ length, under ], [ length, top ] ];
	for ( let k = 11; k >= 0; k -- ) {

		const x = low + k * tread;
		points.push( [ x, slab + ( k + 1 ) * rise ], [ x, slab + k * rise ] );

	}

	points.push( [ 0, slab ] );
	const x0 = - length / 2;
	parts.add( concrete, alongZ( points, width ), _m.makeTranslation( x0, d, 0 ) );

	// Dunnage under the bottom landing.
	dunnage( parts, [ x0 + 0.15, x0 + low - 0.2 ], width + 1 * FT, [ d, d ] );

	// A crib of 6 × 6 timbers under the top landing, pairs crossing alternately.
	const crib = d + under;
	const layers = Math.round( crib / ( 5.5 * IN ) );
	const t = crib / layers;
	const cx = x0 + length - high / 2;
	for ( let i = 0; i < layers; i ++ ) {

		for ( const s of [ - 1, 1 ] ) {

			if ( i % 2 ) parts.box( TIMBER(), [ 3.5 * FT, t, 5.5 * IN ], [ cx, i * t, s * 1.2 * FT ] );
			else parts.box( TIMBER(), [ 5.5 * IN, t, width + 0.5 * FT ], [ cx + s * 1.2 * FT, i * t, 0 ] );

		}

	}

	// Lifting inserts in the 3rd and 10th treads.
	for ( const k of [ 2, 9 ] ) {

		const x = x0 + low + k * tread + tread / 2;
		const y = d + slab + ( k + 1 ) * rise;
		for ( const z of [ - 1.2 * FT, 1.2 * FT ] ) parts.cylinder( dark, 0.045, 0.003, [ x, y, z ], 12 );

	}

	return parts.build();

}

// --- steel joists and deck -------------------------------------------------------------------

// A double-angle chord along x from x1 to x2, its angles' outstanding legs `leg` wide and `t`
// thick, either side of a gap at z, the flat legs at y (top: the legs hang down; bottom: up).
function chord( parts, material, [ x1, x2 ], y, z, leg, t, gap, hanging ) {

	const len = x2 - x1;
	const xc = ( x1 + x2 ) / 2;
	for ( const s of [ - 1, 1 ] ) {

		parts.box( material, [ len, t, leg ], [ xc, hanging ? y - t : y, z + s * ( gap / 2 + leg / 2 ) ] );
		parts.box( material, [ len, leg, t ], [ xc, hanging ? y - leg : y, z + s * ( gap / 2 + t / 2 ) ] );

	}

}

// One K-series joist, `span` long overall and `depth` deep, standing in the plane z with its
// bottom chord's underside at y0: double-angle chords, a bent round-bar web zig-zagging between
// them, and the 2½ in bearing seats under the ends of the top chord.
function joist( parts, material, span, depth, y0, z ) {

	const leg = 2 * IN;
	const t = 0.19 * IN;
	const gap = 1 * IN;
	const yTop = y0 + depth;
	const bottomEnd = span / 2 - 0.45;
	chord( parts, material, [ - span / 2, span / 2 ], yTop, z, leg, t, gap, true );
	chord( parts, material, [ - bottomEnd, bottomEnd ], y0, z, leg, t, gap, false );
	for ( const s of [ - 1, 1 ] ) parts.box( material, [ 4 * IN, 2.5 * IN, gap + 2 * leg ], [ s * ( span / 2 - 2 * IN ), yTop - 2.5 * IN - t, z ] );

	// The web: from each seat down to the bottom chord's end, then zig-zagging at about 24 in.
	const hi = yTop - 1 * IN;
	const lo = y0 + 1 * IN;
	const steps = 2 * Math.round( bottomEnd * 2 / ( 24 * IN ) );
	const points = [ [ - span / 2 + 4 * IN, hi, z ] ];
	for ( let i = 0; i <= steps; i ++ ) points.push( [ - bottomEnd + i * 2 * bottomEnd / steps, i % 2 ? hi : lo, z ] );
	points.push( [ span / 2 - 4 * IN, hi, z ] );
	parts.path( material, points, 0.45 * IN, 6, false );

}

// Ten 24K joists, 40 ft long, standing side by side on three timbers and banded together.
function joistBundle() {

	const parts = new Parts();
	const primer = PRIMER();
	const span = 40 * FT;
	const depth = 24 * IN;
	const d = 3.5 * IN;
	const pitch = 5.25 * IN;
	const count = 10;
	const halfWidth = count * pitch / 2;
	dunnage( parts, [ - 14 * FT, 0, 14 * FT ], 2 * halfWidth + 1.5 * FT, [ d, d ] );
	for ( let i = 0; i < count; i ++ ) joist( parts, primer, span, depth, d, - halfWidth + pitch * ( i + 0.5 ) );
	for ( const x of [ - 7 * FT, 7 * FT ] ) band( parts, x, [ d, d + depth ], [ - halfWidth, halfWidth ] );
	return parts.build();

}

// A joist girder 60 ft long and 54 in deep, standing on timber blocks under its bottom chord and
// held upright by timber kickers: heavy double-angle chords, a Warren web with verticals at its
// 7½ ft panel points, and 7½ in seats at the ends of the top chord.
function joistGirder() {

	const parts = new Parts();
	const primer = PRIMER();
	const span = 60 * FT;
	const depth = 54 * IN;
	const panel = 7.5 * FT;
	const d = 5.5 * IN;
	const gap = 1 * IN;
	const y0 = d;
	const yTop = y0 + depth;
	const seat = 7.5 * IN;
	const first = - span / 2 + panel;

	chord( parts, primer, [ - span / 2, span / 2 ], yTop, 0, 5 * IN, 0.5 * IN, gap, true );
	chord( parts, primer, [ first - 3 * IN, - first + 3 * IN ], y0, 0, 4 * IN, 0.375 * IN, gap, false );
	for ( const s of [ - 1, 1 ] ) parts.box( primer, [ 6 * IN, seat - 0.5 * IN, gap + 10 * IN ], [ s * ( span / 2 - 3 * IN ), yTop - seat, 0 ] );

	// Web members: pairs of angles either side of the gap.
	const web = ( a, b, w = 3 * IN ) => {

		for ( const s of [ - 1, 1 ] ) strut( parts, primer, a, b, w, 0.375 * IN, s * ( gap / 2 + 0.2 * IN ) );

	};
	const hi = yTop - 2.5 * IN;
	const lo = y0 + 2 * IN;
	for ( let k = 1; k <= 7; k ++ ) web( [ - span / 2 + k * panel, lo ], [ - span / 2 + k * panel, hi ], 2.5 * IN );
	const nodes = [ [ - span / 2 + 4 * IN, hi ] ];
	for ( let k = 1; k <= 7; k ++ ) nodes.push( [ - span / 2 + k * panel, k % 2 ? lo : hi ] );
	nodes.push( [ span / 2 - 4 * IN, hi ] );
	for ( let i = 1; i < nodes.length; i ++ ) web( nodes[ i - 1 ], nodes[ i ], 3.5 * IN );

	// Timber blocks under the bottom chord, and 2 × 6 kickers from the top chord to the ground.
	dunnage( parts, [ first + 1 * FT, 0, - first - 1 * FT ], 3 * FT, [ d, d ] );
	const lumber = LUMBER();
	for ( const x of [ - 16 * FT, 16 * FT ] ) {

		for ( const s of [ - 1, 1 ] ) {

			const a = [ x, yTop - 0.15, s * 0.11 ];
			const b = [ x, 0.03, s * 1.6 ];
			const dz = b[ 2 ] - a[ 2 ];
			const dy = b[ 1 ] - a[ 1 ];
			parts.block( lumber, [ 1.5 * IN, Math.hypot( dz, dy ), 5.5 * IN ], [ x, ( a[ 1 ] + b[ 1 ] ) / 2, ( a[ 2 ] + b[ 2 ] ) / 2 ], [ Math.atan2( dz, dy ), 0, 0 ] );
			parts.box( lumber, [ 5.5 * IN, 1.5 * IN, 0.6 ], [ x, 0, s * 1.55 ] );

		}

	}

	return parts.build();

}

// Three bundles of 1½ in B-deck, 36 in cover and 30 ft long, stacked on 4 × 4s and banded: the
// fluted top sheet of each over the nested sheets under it.
function deckBundles() {

	const parts = new Parts();
	// Lighter and less mirror-like than GALVANISED, so the flutes read without an environment map.
	const galv = mat( 0xb7bcbf, { roughness: 0.45, metalness: 0.3 } );
	const L = 30 * FT;
	const d = 3.5 * IN;
	const body = 2 * IN;
	const height = body + 1.5 * IN;
	// Section in inches: six 6 in ribs (bottom flange, web, 3½ in top flange, web) over the body.
	const section = [ [ 18.6, 0 ], [ 18.6, body / IN ], [ 18, body / IN ] ];
	for ( let i = 5; i >= 0; i -- ) {

		const z0 = - 18 + 6 * i;
		section.push( [ z0 + 5.125, body / IN ], [ z0 + 4.75, body / IN + 1.5 ], [ z0 + 1.25, body / IN + 1.5 ], [ z0 + 0.875, body / IN ] );

	}

	section.push( [ - 18, body / IN ], [ - 18.6, body / IN ], [ - 18.6, 0 ] );
	const profile = section.map( ( [ z, y ] ) => [ z * IN, y * IN ] );
	const xs = [ - 12 * FT, 0, 12 * FT ];
	for ( let k = 0; k < 3; k ++ ) {

		const y = d + k * ( height + d );
		dunnage( parts, xs, 42 * IN, [ d, d ], y - d );
		parts.add( galv, alongX( profile, L ), _m.makeTranslation( 0, y, 0 ) );
		for ( const x of [ - 6 * FT, 6 * FT ] ) band( parts, x, [ y, y + height ], [ - 18.6 * IN, 18.6 * IN ] );

	}

	return parts.build();

}

// --- timber ----------------------------------------------------------------------------------

// Twelve Fink roof trusses, 36 ft span at 6/12, of 2 × 4s with galvanised nail plates at the
// joints, standing side by side on dunnage, banded, with 2 × 4 kickers to the ground each side.
function trussBundle() {

	const parts = new Parts();
	const lumber = LUMBER();
	const plate = GALVANISED();
	const span = 36 * FT;
	const half = span / 2;
	const d = 3.5 * IN;
	const w = 3.5 * IN;
	const t = 1.5 * IN;
	const count = 12;
	const pitch = 1.6 * IN;
	const halfWidth = count * pitch / 2;
	const pitchAngle = Math.atan( 0.5 );
	const y0 = d;
	// The top chord's centreline over x (its underside meets the bottom chord's underside at the heel).
	const topAt = x => y0 + ( half - Math.abs( x ) ) * 0.5 + w / 2 / Math.cos( pitchAngle );
	const peak = topAt( 0 ) + w / 2 / Math.cos( pitchAngle );

	dunnage( parts, [ - 16 * FT, - 8 * FT, 0, 8 * FT, 16 * FT ], 4 * FT, [ d, d ] );
	for ( let i = 0; i < count; i ++ ) {

		const z = - halfWidth + pitch * ( i + 0.5 );
		parts.box( lumber, [ span, w, t ], [ 0, y0, z ] );
		strut( parts, lumber, [ - half + 0.02, topAt( - half + 0.02 ) ], [ 0.02, topAt( 0.02 ) ], w, t, z );
		strut( parts, lumber, [ half - 0.02, topAt( half - 0.02 ) ], [ - 0.02, topAt( - 0.02 ) ], w, t, z );
		const bottom = y0 + w / 2;
		for ( const s of [ - 1, 1 ] ) {

			strut( parts, lumber, [ s * span / 6, bottom ], [ s * span / 4, topAt( span / 4 ) - 0.03 ], w, t, z );
			strut( parts, lumber, [ s * span / 6, bottom ], [ s * 0.08, topAt( 0.08 ) - 0.03 ], w, t, z );

		}

		// Nail plates on both faces at the heels, the peak and the web joints.
		const joints = [ [ - half + 0.2, y0 + 0.08 ], [ half - 0.2, y0 + 0.08 ], [ 0, peak - 0.12 ],
			[ - span / 6, y0 + 0.05 ], [ span / 6, y0 + 0.05 ], [ - span / 4, topAt( span / 4 ) - 0.02 ], [ span / 4, topAt( span / 4 ) - 0.02 ] ];
		for ( const [ x, y ] of joints ) {

			for ( const s of [ - 1, 1 ] ) parts.box( plate, [ 0.14, 0.11, 0.002 ], [ x, y - 0.055, z + s * ( t / 2 + 0.001 ) ] );

		}

	}

	// Bands round the bundle: across the top chords and under the bottom chords.
	for ( const x of [ - 13 * FT, - 5 * FT, 5 * FT, 13 * FT ] ) {

		const y1 = topAt( x ) + w / 2 / Math.cos( pitchAngle );
		band( parts, x, [ y0, y1 ], [ - halfWidth, halfWidth ] );

	}

	// Kickers from the top chords out to the ground.
	for ( const x of [ - 9 * FT, 9 * FT ] ) {

		for ( const s of [ - 1, 1 ] ) {

			const a = [ x, topAt( x ) - 0.1, s * ( halfWidth + 0.02 ) ];
			const b = [ x, 0.02, s * 1.5 ];
			const dz = b[ 2 ] - a[ 2 ];
			const dy = b[ 1 ] - a[ 1 ];
			parts.block( lumber, [ t, Math.hypot( dz, dy ), w ], [ x, ( a[ 1 ] + b[ 1 ] ) / 2, ( a[ 2 ] + b[ 2 ] ) / 2 ], [ Math.atan2( dz, dy ), 0, 0 ] );

		}

	}

	return parts.build();

}

// The end grain of a glulam: its 1½ in laminations, drawn once.
function glulamEnd() {

	return drawn( 'glulam-end', [ 64, 256 ], ( ctx, w, h ) => {

		const lams = 16;
		for ( let i = 0; i < lams; i ++ ) {

			ctx.fillStyle = i % 2 ? '#c99a5e' : '#d8ab6c';
			ctx.fillRect( 0, i * h / lams, w, h / lams );
			ctx.fillStyle = '#8d6a3e';
			ctx.fillRect( 0, i * h / lams, w, 2 );
			// Growth rings, a few arcs per lamination.
			ctx.strokeStyle = 'rgba(120, 82, 40, 0.35)';
			for ( let j = 0; j < 3; j ++ ) {

				ctx.beginPath();
				ctx.arc( w * ( 0.2 + 0.6 * hash( i * 3 + j ) ), ( i + 1.4 ) * h / lams, 6 + j * 5, Math.PI * 1.1, Math.PI * 1.9 );
				ctx.stroke();

			}

		}

	}, { roughness: 0.85 } );

}

// Four 6¾ × 24 in glulam beams, 40 ft long, on edge side by side on three 4 × 4s and banded,
// each in its protective wrap stopped short of the ends so the laminations show.
function glulamBundle() {

	const parts = new Parts();
	const wood = mat( 0xd2a466, { roughness: 0.85 } );
	const wrap = mat( 0xeceae2, { roughness: 0.7 } );
	const print = mat( 0x2f5f8f, { roughness: 0.7 } );
	const end = glulamEnd();
	const L = 40 * FT;
	const b = 6.75 * IN;
	const h = 24 * IN;
	const d = 3.5 * IN;
	const pitch = b + 0.003;
	const halfWidth = 2 * pitch;
	dunnage( parts, [ - 15 * FT, 0, 15 * FT ], 4 * FT, [ d, d ] );
	for ( let i = 0; i < 4; i ++ ) {

		const z = - halfWidth + pitch * ( i + 0.5 );
		parts.box( wood, [ L, h, b ], [ 0, d, z ] );
		parts.box( wrap, [ L - 8 * IN, h + 0.006, b + 0.002 ], [ 0, d - 0.003, z ] );
		// The printed stripe along the wrap.
		parts.box( print, [ L - 2 * FT, 3 * IN, b + 0.004 ], [ 0, d + h * 0.55, z ] );
		for ( const s of [ - 1, 1 ] ) {

			const face = new PlaneGeometry( b, h );
			face.rotateY( s * Math.PI / 2 );
			parts.add( end, face, _m.makeTranslation( s * ( L / 2 + 0.001 ), d + h / 2, z ) );

		}

	}

	for ( const x of [ - 8 * FT, 8 * FT ] ) band( parts, x, [ d, d + h + 0.003 ], [ - halfWidth, halfWidth ] );
	return parts.build();

}

// Five 7-ply CLT floor panels, 8 × 40 ft, stacked on 4 × 4 spacers so slings can get under each:
// the laminations show on the edges, the cross layers' end grain darker, and the top panel has
// its four screwed-in lifting plates.
function cltStack() {

	const parts = new Parts();
	const face = mat( 0xdcb784, { roughness: 0.85 } );
	const grain = mat( 0xb58c58, { roughness: 0.9 } );
	const steel = STEEL();
	const L = 40 * FT;
	const W = 8 * FT;
	const ply = 1.375 * IN;
	const T = 7 * ply;
	const d = 3.5 * IN;
	const xs = [ - 15 * FT, - 5 * FT, 5 * FT, 15 * FT ];
	let y = 0;
	for ( let k = 0; k < 5; k ++ ) {

		dunnage( parts, xs, W + 4 * IN, [ d, d ], y );
		y += d;
		parts.box( face, [ L, T, W ], [ 0, y, 0 ] );
		// End grain showing on the edges: the cross layers along the sides, the long layers at the ends.
		for ( let i = 0; i < 7; i ++ ) {

			const yi = y + i * ply + 0.002;
			if ( i % 2 ) for ( const s of [ - 1, 1 ] ) parts.box( grain, [ L, ply - 0.004, 0.002 ], [ 0, yi, s * ( W / 2 + 0.001 ) ] );
			else for ( const s of [ - 1, 1 ] ) parts.box( grain, [ 0.002, ply - 0.004, W ], [ s * ( L / 2 + 0.001 ), yi, 0 ] );

		}

		y += T;

	}

	// Lifting plates on the top panel, each with its shackle ring.
	for ( const x of [ - 10 * FT, 10 * FT ] ) {

		for ( const z of [ - 2 * FT, 2 * FT ] ) {

			parts.cylinder( steel, 0.07, 0.012, [ x, y, z ], 12 );
			parts.path( steel, [ [ x - 0.04, y + 0.012, z ], [ x - 0.035, y + 0.08, z ], [ x + 0.035, y + 0.08, z ], [ x + 0.04, y + 0.012, z ] ], 0.009, 6 );

		}

	}

	return parts.build();

}

// --- glazing ---------------------------------------------------------------------------------

// A glazed unit `w` wide and `h` high in the plane z (its face towards -z), `depth` deep, standing
// at y0 and centred on x: a frame of `bar`-wide members, horizontal rails at `rails` heights, glass
// between and opaque spandrel in the bays listed in `spandrels`.
function glazedUnit( parts, { w, h, depth, bar, rails, spandrels = [] }, [ x, y0, z ], frame, glass, spandrel ) {

	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ bar, h, depth ], [ x + s * ( w - bar ) / 2, y0, z ] );
	const heights = [ 0, ...rails, h - bar ];
	for ( const r of heights ) parts.box( frame, [ w - 2 * bar, bar, depth ], [ x, y0 + r, z ] );
	for ( let i = 1; i < heights.length; i ++ ) {

		const bottom = heights[ i - 1 ] + bar;
		const top = heights[ i ];
		parts.box( spandrels.includes( i - 1 ) ? spandrel : glass, [ w - 2 * bar, top - bottom, 0.025 ], [ x, y0 + bottom, z - depth * 0.15 ] );

	}

}

// Six unitized curtain wall units, 5 ft wide and 13 ft high, standing face to face in a steel
// stillage with fork pockets: aluminium frames with vision glass between spandrel panels at the
// sill and head, separated by rubber-padded bars and strapped at the front.
function curtainWallStillage() {

	const parts = new Parts();
	const steel = mat( 0x2f5c8a, { roughness: 0.55, metalness: 0.4 } );
	const frame = mat( 0x2c2f33, { roughness: 0.45, metalness: 0.5 } );
	const glass = mat( 0x7fa3b8, { roughness: 0.08, metalness: 0.5 } );
	const spandrel = mat( 0x3b4b57, { roughness: 0.35, metalness: 0.3 } );
	const rubber = RUBBER();
	const strap = mat( 0xe0a020, { roughness: 0.7 } );
	const W = 5 * FT;
	const H = 13 * FT;
	const depth = 6 * IN;
	const pitch = 9 * IN;
	const count = 6;
	const sx = W / 2 + 0.25;
	const sz = count * pitch / 2 + 0.15;
	const base = 0.2;
	const post = 0.1;
	const top = base + 0.05 + H + 0.1;

	// Base: perimeter tubes, fork pockets through it front to back, and rubber-topped bearers.
	for ( const s of [ - 1, 1 ] ) {

		parts.box( steel, [ 2 * sx, base, post ], [ 0, 0, s * ( sz - post / 2 ) ] );
		parts.box( steel, [ post, base, 2 * sz ], [ s * ( sx - post / 2 ), 0, 0 ] );
		parts.box( steel, [ 0.3, base, 2 * sz ], [ s * 0.55, 0, 0 ] );
		for ( const zz of [ - 1, 1 ] ) parts.box( DARK(), [ 0.22, 0.09, 0.004 ], [ s * 0.55, 0.05, zz * ( sz + 0.002 ) ] );

	}

	for ( let i = 0; i < count; i ++ ) {

		const z = - count * pitch / 2 + pitch * ( i + 0.5 );
		parts.box( steel, [ 2 * sx - 0.1, 0.04, 0.08 ], [ 0, base, z ] );
		parts.box( rubber, [ W, 0.01, 0.1 ], [ 0, base + 0.04, z ] );
		glazedUnit( parts, { w: W, h: H, depth, bar: 2.5 * IN, rails: [ 3 * FT, 11 * FT ], spandrels: [ 0, 2 ] }, [ 0, base + 0.05, z ], frame, glass, spandrel );

	}

	// Corner posts, the top frame and cross bars, and X bracing on the two sides.
	for ( const s of [ - 1, 1 ] ) {

		for ( const t of [ - 1, 1 ] ) parts.box( steel, [ post, top - base, post ], [ s * ( sx - post / 2 ), base, t * ( sz - post / 2 ) ] );
		parts.box( steel, [ post, post, 2 * sz ], [ s * ( sx - post / 2 ), top - post, 0 ] );
		parts.box( steel, [ 2 * sx, post, post ], [ 0, top - post, s * ( sz - post / 2 ) ] );
		const x = s * ( sx - post / 2 );
		for ( const t of [ - 1, 1 ] ) {

			const [ a, b ] = [ [ base + 0.1, - t * ( sz - 0.1 ) ], [ top - 0.15, t * ( sz - 0.1 ) ] ];
			const dz = b[ 1 ] - a[ 1 ];
			const dy = b[ 0 ] - a[ 0 ];
			parts.block( steel, [ 0.04, Math.hypot( dz, dy ), 0.04 ], [ x, ( a[ 0 ] + b[ 0 ] ) / 2, 0 ], [ Math.atan2( dz, dy ), 0, 0 ] );

		}

	}

	// Separator bars along the top with rubber blocks between the units.
	for ( const x of [ - W / 2 + 0.2, W / 2 - 0.2 ] ) {

		parts.box( steel, [ 0.06, 0.06, 2 * sz ], [ x, top - post - 0.06, 0 ] );
		for ( let i = 0; i <= count; i ++ ) parts.box( rubber, [ 0.05, 0.12, pitch - depth - 0.01 ], [ x, top - post - 0.18, - count * pitch / 2 + pitch * i ] );

	}

	// Ratchet straps across the front and back.
	for ( const y of [ 1.2, 3.0 ] ) {

		for ( const s of [ - 1, 1 ] ) parts.box( strap, [ 2 * sx, 0.05, 0.004 ], [ 0, y, s * ( ( count - 1 ) * pitch / 2 + depth / 2 + 0.003 ) ] );

	}

	return parts.build();

}

// Eight 4 × 6 ft window units leaning four a side on a steel A-frame rack bolted to a pallet,
// foam between them and strapped: white vinyl frames with a meeting rail, as single-hungs come.
function windowCrate() {

	const parts = new Parts();
	const steel = mat( 0x2f5c8a, { roughness: 0.55, metalness: 0.4 } );
	const vinyl = mat( 0xf2f1ec, { roughness: 0.5 } );
	const glass = mat( 0x7fa3b8, { roughness: 0.08, metalness: 0.5 } );
	const foam = mat( 0x5a8fc4, { roughness: 0.9 } );
	const strap = mat( 0xe0a020, { roughness: 0.7 } );
	const W = 4 * FT;
	const H = 6 * FT;
	const depth = 3.25 * IN;
	const bar = 2.75 * IN;
	const length = W + 1 * FT;
	const deck = pallet( parts, [ length + 0.3, 4.5 * FT ] );
	const y0 = deck + 0.08;
	const foot = 0.3;
	const ridge = deck + 1.9;
	const tilt = Math.atan( ( foot - 0.05 ) / ( ridge - y0 ) );

	// Base channels along each side the windows stand in.
	for ( const s of [ - 1, 1 ] ) parts.box( steel, [ length, 0.08, 0.42 ], [ 0, deck, s * ( foot + 0.2 ) ] );

	for ( const side of [ - 1, 1 ] ) {

		const s = slope( side, foot, y0, tilt );
		const up = ( ridge - y0 ) / Math.cos( tilt );
		for ( const x of [ - length / 2 + 0.05, length / 2 - 0.05 ] ) s.block( parts, steel, [ 0.06, up, 0.06 ], [ x, up / 2, - 0.03 ] );
		s.block( parts, steel, [ length, 0.06, 0.06 ], [ 0, up * 0.45, - 0.03 ] );

		let n = 0;
		for ( let k = 0; k < 4; k ++ ) {

			const u = - s.drop( n );
			// The frame, meeting rail and two panes of glass, in the slope.
			for ( const xx of [ - 1, 1 ] ) s.block( parts, vinyl, [ bar, H, depth ], [ xx * ( W - bar ) / 2, u + H / 2, n + depth / 2 ] );
			for ( const uu of [ bar / 2, H / 2, H - bar / 2 ] ) s.block( parts, vinyl, [ W - 2 * bar, uu === H / 2 ? 1.5 * IN : bar, depth ], [ 0, u + uu, n + depth / 2 ] );
			for ( const uu of [ H / 4 + 0.02, 3 * H / 4 - 0.02 ] ) s.block( parts, glass, [ W - 2 * bar, H / 2 - bar - 0.02, 0.02 ], [ 0, u + uu, n + depth * 0.6 ] );
			n += depth;
			// Foam pads between them.
			if ( k < 3 ) for ( const uu of [ 0.4, H - 0.4 ] ) s.block( parts, foam, [ W - 0.3, 0.12, 0.5 * IN ], [ 0, u + uu, n + 0.25 * IN ] );
			n += 0.5 * IN;

		}

		// Straps over the outer window.
		for ( const x of [ - 1 * FT, 1 * FT ] ) s.block( parts, strap, [ 0.05, H, 0.004 ], [ x, H / 2 - s.drop( n ), n - 0.5 * IN + 0.002 ] );

	}

	parts.box( steel, [ length, 0.08, 0.14 ], [ 0, ridge - 0.04, 0 ] );
	return parts.build();

}

// --- rebar and roofing -----------------------------------------------------------------------

// Six bundles of 40 ft rebar (two of #5, two of #6, a #7 and a #8, about 2 t each) on three
// timbers, wire-tied, each with its coloured mill tag hanging off the front.
function rebarBundles() {

	const parts = new Parts();
	const rust = RUST();
	const wire = mat( 0x4a4a48, { roughness: 0.6, metalness: 0.5 } );
	const L = 40 * FT;
	const d = 3.5 * IN;
	// [ bar diameter, bars, tag colour ].
	const bundles = [ [ 0.625, 105, 0xf2c200 ], [ 0.625, 105, 0xf2c200 ], [ 0.75, 73, 0x2f7bd0 ], [ 0.75, 73, 0x2f7bd0 ], [ 0.875, 54, 0x3fa34d ], [ 1.0, 41, 0xd2382c ] ];
	const spacing = 1.5 * FT;
	dunnage( parts, [ - 15 * FT, 0, 15 * FT ], 6 * spacing + 1 * FT, [ 3.5 * IN, d ] );
	let seed = 0;
	bundles.forEach( ( [ dia, count, tag ], b ) => {

		const r = dia / 2 * IN;
		const s = dia * 1.08 * IN;
		const zc = ( b - 2.5 ) * spacing;
		// Bars packed in a hex pattern, the bundle settled wider than it is tall.
		const lattice = [];
		for ( let j = - 12; j <= 12; j ++ ) {

			for ( let i = - 16; i <= 16; i ++ ) lattice.push( [ ( i + ( j & 1 ) / 2 ) * s, j * s * 0.866 ] );

		}

		lattice.sort( ( a, c ) => ( a[ 0 ] ** 2 + ( a[ 1 ] * 1.3 ) ** 2 ) - ( c[ 0 ] ** 2 + ( c[ 1 ] * 1.3 ) ** 2 ) );
		const bars = lattice.slice( 0, count );
		const minY = Math.min( ...bars.map( p => p[ 1 ] ) );
		const maxY = Math.max( ...bars.map( p => p[ 1 ] ) );
		const halfZ = Math.max( ...bars.map( p => Math.abs( p[ 0 ] ) ) ) + r;
		for ( const [ bz, by ] of bars ) {

			const y = d + r + by - minY;
			const shift = ( hash( seed ++ ) - 0.5 ) * 4 * IN;
			parts.rod( rust, [ - L / 2 + 2 * IN + shift, y, zc + bz ], [ L / 2 - 2 * IN + shift, y, zc + bz ], r, 6 );

		}

		// Wire ties round the bundle.
		const yc = d + r + ( maxY - minY ) / 2;
		const halfY = ( maxY - minY ) / 2 + r;
		for ( const x of [ - 18 * FT, - 7 * FT, 7 * FT, 18 * FT ] ) {

			_q.setFromAxisAngle( _p.set( 0, 0, 1 ), Math.PI / 2 );
			_m.compose( _p.set( x, yc, zc ), _q, _s.set( halfY + 0.003, 0.012, halfZ + 0.003 ) );
			parts.add( wire, new CylinderGeometry( 1, 1, 1, 14, 1, true ), _m );

		}

		// The mill tag, hanging on a wire from the tie nearest the right-hand end.
		const tx = 18 * FT + 0.02;
		const tz = zc - halfZ - 0.006;
		parts.box( wire, [ 0.003, 0.06, 0.003 ], [ tx, yc - 0.06, tz ] );
		parts.box( mat( tag, { roughness: 0.6 } ), [ 0.1, 0.07, 0.003 ], [ tx, yc - 0.13, tz ] );

	} );

	return parts.build();

}

// Four pallets for a low-slope roof: five 10 ft rolls of white TPO membrane in a pyramid on a
// long pallet, two pallets of 4 × 8 ft polyiso boards in their printed bags, and a pallet of
// bonding adhesive pails.
function roofingPallets() {

	const parts = new Parts();
	const membrane = mat( 0xf3f2ee, { roughness: 0.6 } );
	const core = mat( 0x8a6d4a, { roughness: 0.9 } );
	const bag = mat( 0xecebe6, { roughness: 0.55 } );
	const print = mat( 0x2c62a8, { roughness: 0.6 } );
	const seam = mat( 0xb9b8b2, { roughness: 0.7 } );
	const pail = mat( 0xe8e7e2, { roughness: 0.5 } );
	const lid = mat( 0x3a6fb0, { roughness: 0.5 } );
	const cleat = LUMBER();

	// TPO rolls: 10 ft long, about 11 in across, three on the pallet and two nested on them,
	// chocked by 2 × 4 cleats.
	const rollZ = - 0.75;
	const rollR = 5.5 * IN;
	const rollL = 10 * FT;
	const deckA = pallet( parts, [ rollL + 0.15, 3 * FT ], [ - 0.75, rollZ ] );
	for ( const s of [ - 1, 1 ] ) parts.box( cleat, [ rollL, 1.5 * IN, 1.5 * IN ], [ - 0.75, deckA, rollZ + s * ( 3 * rollR + 0.75 * IN ) ] );
	const rolls = [ [ - 2, 0 ], [ 0, 0 ], [ 2, 0 ], [ - 1, 1 ], [ 1, 1 ] ];
	for ( const [ i, j ] of rolls ) {

		const y = deckA + rollR + j * rollR * Math.sqrt( 3 );
		const z = rollZ + i * rollR;
		parts.rod( membrane, [ - 0.75 - rollL / 2, y, z ], [ - 0.75 + rollL / 2, y, z ], rollR, 20 );
		parts.rod( core, [ - 0.75 - rollL / 2 - 0.008, y, z ], [ - 0.75 + rollL / 2 + 0.008, y, z ], 1.6 * IN, 12 );

	}

	// Polyiso: two bundles to a pallet, each about 22 in high, in a bag with a printed band.
	const bundleH = 22 * IN;
	for ( const x of [ - 1.3, 1.3 ] ) {

		const z = 0.9;
		const deck = pallet( parts, [ 8 * FT, 4 * FT ], [ x, z ] );
		for ( let k = 0; k < 2; k ++ ) {

			const y = deck + k * ( bundleH + 0.02 );
			parts.box( bag, [ 8 * FT, bundleH, 4 * FT ], [ x, y, z ] );
			parts.box( print, [ 8 * FT + 0.004, 4 * IN, 4 * FT + 0.004 ], [ x, y + bundleH * 0.55, z ] );
			// Board joints showing through the bag.
			for ( let i = 1; i < 8; i ++ ) {

				if ( i === 5 ) continue;
				parts.box( seam, [ 8 * FT + 0.002, 0.004, 4 * FT + 0.002 ], [ x, y + i * bundleH / 8, z ] );

			}

		}

	}

	// Adhesive pails: two layers of twelve 5 gal pails on a 48 × 40 pallet, a slip sheet between.
	const px = 1.95;
	const pz = - 0.75;
	let y = pallet( parts, [ 48 * IN, 40 * IN ], [ px, pz ] );
	const pr = 5.95 * IN;
	const ph = 14.5 * IN;
	for ( let layer = 0; layer < 2; layer ++ ) {

		for ( let i = 0; i < 4; i ++ ) {

			for ( let j = 0; j < 3; j ++ ) {

				const x = px + ( i - 1.5 ) * 2 * pr;
				const z = pz + ( j - 1 ) * 2 * pr;
				parts.cylinder( pail, pr * 0.95, ph - 0.02, [ x, y, z ], 16, pr );
				parts.cylinder( lid, pr, 0.02, [ x, y + ph - 0.02, z ], 16 );

			}

		}

		y += ph;
		if ( layer === 0 ) {

			parts.box( mat( 0xb08a5a, { roughness: 0.9 } ), [ 48 * IN, 0.005, 36 * IN ], [ px, y, pz ] );
			y += 0.005;

		}

	}

	return parts.build();

}
