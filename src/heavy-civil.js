import { BoxGeometry, ExtrudeGeometry, MathUtils, Matrix4, Path, Shape, Vector2, Vector3 } from 'three';
import { FT, IN, mat, Parts } from './parts.js';
import { memberGeometry } from './plant-parts.js';

// Heavy civil plant built in code at the sizes of the common North American classes (no brands):
// marine (deck and spud barges, a push boat, a work skiff, a turbidity curtain and a sheet pile
// template, for a waterfront job), aggregates and asphalt (a 3-deck screening plant, a cone
// crusher and a portable drum mix plant), and demolition and piling (a high-reach demolition
// excavator, a long-reach excavator and a diesel hammer in hanging leads on a crawler crane). Like
// the other built-in pieces each stands on y = 0 with its front facing -Z (+X is its right).
// Boats and barges sit on the ground like everything else: on the water they'd float lower.

const DEG = MathUtils.DEG2RAD;
const UP = new Vector3( 0, 1, 0 );
const _m = new Matrix4();

export const HEAVY_CIVIL_ITEMS = [
	// Marine.
	{ id: 'deck-barge-150x40', name: 'Deck barge, flat top (150 × 40 ft, 7 ft deep, raked ends)', category: 'Marine',
		keywords: 'barge deck barge flat deck material barge hopper scow marine waterfront wharf pier dock floating',
		build: () => deckBarge( false ) },
	{ id: 'deck-barge-150x40-pipe-piles', name: 'Deck barge (150 × 40 ft) loaded with pipe piles (13 × 36 in × 80 ft)', category: 'Marine',
		keywords: 'barge deck barge material barge pipe piles pile delivery marine piling waterfront wharf pier dock',
		build: () => deckBarge( true ) },
	{ id: 'spud-barge-crane-spuds-up', name: 'Spud barge with crawler crane (140 × 50 ft barge, 150 t crane, 150 ft boom), spuds up', category: 'Marine',
		keywords: 'spud barge crane barge derrick barge floating crane crawler crane on barge marine piling spuds raised waterfront',
		build: () => spudBargeCrane( false ) },
	{ id: 'spud-barge-crane-spuds-down', name: 'Spud barge with crawler crane (140 × 50 ft barge, 150 t crane, 150 ft boom), spuds down', category: 'Marine',
		keywords: 'spud barge crane barge derrick barge floating crane crawler crane on barge marine piling spuds set down waterfront',
		build: () => spudBargeCrane( true ) },
	{ id: 'push-boat-65ft', name: 'Push boat / small tug (65 × 26 ft, push knees, elevated wheelhouse)', category: 'Marine',
		keywords: 'tug tugboat push boat pushboat towboat workboat marine barge waterfront boat',
		build: pushBoat },
	{ id: 'work-skiff-24ft', name: 'Work skiff, aluminium (24 ft, centre console, outboard)', category: 'Marine',
		keywords: 'skiff work boat workboat jon boat aluminum boat safety boat rescue boat marine outboard',
		build: workSkiff },
	// A row of them (rows.js) strings the sections end to end into a curtain line.
	{ id: 'turbidity-curtain-50ft', name: 'Floating turbidity curtain (50 ft section, 12 in float, 5 ft skirt)', category: 'Marine',
		keywords: 'turbidity curtain silt curtain turbidity barrier floating boom silt boom sediment marine environmental esc',
		build: turbidityCurtain, rowLength: 50 * FT },
	{ id: 'sheet-pile-template-40ft', name: 'Sheet pile driving template (40 ft, two-level walers on 4 pipe legs)', category: 'Marine',
		keywords: 'sheet pile template guide frame waler pitching frame marine piling cofferdam bulkhead driving gate',
		build: sheetPileTemplate },
	// Aggregates and asphalt.
	{ id: 'screening-plant-3deck-tracked', name: 'Tracked screening plant, 3-deck (20 × 5 ft screen, conveyors out)', category: 'Material handling',
		keywords: 'screener screening plant screen deck mobile screen tracked aggregate gravel sorting powerscreen chieftain triple deck',
		build: screeningPlant },
	{ id: 'cone-crusher-tracked', name: 'Tracked cone crusher (Lokotrack LT300HP class, 300 hp cone)', category: 'Material handling',
		keywords: 'cone crusher crusher secondary crusher mobile crusher tracked aggregate rock crushing plant gravel',
		build: coneCrusher },
	{ id: 'asphalt-plant-drum-portable', name: 'Portable asphalt drum mix plant (400 t/h class: 4 cold feed bins, drum, baghouse, 200 t silo)', category: 'Material handling',
		keywords: 'asphalt plant hot mix plant hma drum mix drum mixer baghouse silo cold feed bins blacktop paving plant portable',
		build: asphaltPlant },
	// Demolition and piling.
	{ id: 'demolition-high-reach-25m', name: 'High-reach demolition excavator (25 m pin height, 3-piece front, shear)', category: 'Heavy equipment',
		keywords: 'high reach demolition excavator ultra high demolition uhd long front shear crusher multiprocessor wrecking',
		build: highReach },
	{ id: 'excavator-long-reach-18m', name: 'Long-reach excavator (18 m reach, 30 t class)', category: 'Heavy equipment',
		keywords: 'long reach excavator long stick long front dredging ditch cleaning slope pond excavator',
		build: longReach },
	{ id: 'pile-driver-diesel-hammer', name: 'Pile driving rig, diesel impact hammer in 25 m hanging leads (100 t crawler crane)', category: 'Shoring',
		keywords: 'pile driver pile driving rig diesel hammer impact hammer delmag leads hanging leads crawler crane h-pile piling',
		build: pileDriver },
];

// --- shared colours ----------------------------------------------------------------------------

const paint = color => mat( color, { roughness: 0.5, metalness: 0.2 } );
const YELLOW = () => paint( 0xe2a41c );
const DARK = () => mat( 0x2c2e31, { roughness: 0.7, metalness: 0.2 } );
const BLACK = () => mat( 0x18191b, { roughness: 0.85 } );
const STEEL = () => mat( 0x7d8287, { roughness: 0.5, metalness: 0.6 } );
const BRIGHT = () => mat( 0xc9ccce, { roughness: 0.35, metalness: 0.3 } );
const GLASS = () => mat( 0x2b3d48, { roughness: 0.1, metalness: 0.3 } );
const BELT = () => mat( 0x1f2022, { roughness: 0.9 } );
const HULL = () => mat( 0x2a2d30, { roughness: 0.75, metalness: 0.3 } );
const DECK = () => mat( 0x6e5f52, { roughness: 0.95, metalness: 0.2 } );
const TIMBER = () => mat( 0x8a6a45, { roughness: 0.95 } );
const WHITE = () => paint( 0xe9e8e2 );
const ALUMINIUM = () => mat( 0xb5bbc0, { roughness: 0.4, metalness: 0.6 } );
const STONE = () => mat( 0x9a958c, { roughness: 1 } );

// --- shared pieces -----------------------------------------------------------------------------

const v = p => Array.isArray( p ) ? new Vector3( ...p ) : p.clone();

// A box section [ w across, h deep ] from a to b.
function member( parts, material, section, a, b ) {

	parts.add( material, memberGeometry( section, v( a ), v( b ) ) );

}

// An outline seen from above (points [ x, z ]) extruded up from y0 to y1, with optional holes.
function plan( parts, material, points, y0, y1, holes = [] ) {

	const shape = new Shape( points.map( ( [ x, z ] ) => new Vector2( x, - z ) ) );
	for ( const hole of holes ) shape.holes.push( new Path( hole.map( ( [ x, z ] ) => new Vector2( x, - z ) ) ) );
	const geometry = new ExtrudeGeometry( shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 6 } );
	geometry.rotateX( - Math.PI / 2 );
	geometry.translate( 0, y0, 0 );
	parts.add( material, geometry );

}

// A hydraulic cylinder: the barrel for the first 60%, the rod the rest of the way.
function ram( parts, radius, a, b ) {

	const split = v( a ).lerp( v( b ), 0.6 ).toArray();
	parts.rod( DARK(), v( a ).toArray(), split, radius, 10 );
	parts.rod( BRIGHT(), split, v( b ).toArray(), radius * 0.6, 8 );

}

// A pair of crawler tracks along z, `length` long and `width` across the outsides, shoes `shoe`
// wide and `height` tall, standing at y0 and centred on z0, with the car body joining them.
function tracks( parts, { length, width, shoe, height }, y0 = 0, z0 = 0 ) {

	const gauge = width - shoe;
	const r = height / 2;
	const straight = length - height;
	for ( const x of [ - gauge / 2, gauge / 2 ] ) {

		// Track frame, the idler and sprocket at the ends, and the shoes round them.
		parts.box( DARK(), [ shoe * 0.55, height * 0.55, straight ], [ x, y0 + height * 0.22, z0 ] );
		for ( const z of [ - straight / 2, straight / 2 ] ) parts.rod( BLACK(), [ x - shoe / 2, y0 + r, z0 + z ], [ x + shoe / 2, y0 + r, z0 + z ], r, 14 );
		parts.box( BLACK(), [ shoe, 0.1, straight ], [ x, y0, z0 ] );
		parts.box( BLACK(), [ shoe, 0.1, straight ], [ x, y0 + height - 0.1, z0 ] );
		const pitch = 0.3;
		for ( let z = - straight / 2 + pitch / 2; z < straight / 2; z += pitch ) parts.box( BLACK(), [ shoe, 0.04, 0.06 ], [ x, y0 + height, z0 + z ] );

		// Bottom rollers seen under the frame.
		for ( let i = 0; i < 6; i ++ ) {

			const z = - straight / 2 + r + ( straight - 2 * r ) * i / 5;
			parts.rod( STEEL(), [ x - shoe * 0.3, y0 + height * 0.24, z0 + z ], [ x + shoe * 0.3, y0 + height * 0.24, z0 + z ], height * 0.13, 10 );

		}

	}

	parts.box( DARK(), [ gauge - shoe * 0.5, height * 0.45, length * 0.35 ], [ 0, y0 + height * 0.3, z0 ] );

}

// A cab of [ width, height, length ] standing at (x, y, z) (its middle at x, z), glazed at the
// front and sides.
function cab( parts, [ w, h, l ], [ x, y, z ], body ) {

	parts.box( body, [ w, h, l ], [ x, y, z ] );
	parts.box( GLASS(), [ w * 0.86, h * 0.5, 0.02 ], [ x, y + h * 0.38, z - l / 2 - 0.01 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( GLASS(), [ 0.02, h * 0.45, l * 0.7 ], [ x + s * ( w / 2 + 0.01 ), y + h * 0.42, z - l * 0.08 ] );
	parts.box( DARK(), [ w + 0.06, 0.06, l + 0.06 ], [ x, y + h, z ] );

}

// A lattice boom from `foot` raised `angle` above horizontal towards -Z, `length` long, its chords
// [ half width, half depth ] apart in the middle and closer at the foot and head. Returns at( t,
// x, n ): the point t along it, x across and n towards its back (upper side).
export function latticeBoom( parts, material, foot, angle, length, [ hw, hd ], chord = 0.08 ) {

	const along = new Vector3( 0, Math.sin( angle ), - Math.cos( angle ) );
	const back = new Vector3( 0, Math.cos( angle ), Math.sin( angle ) );
	const end = Math.min( 5, length * 0.15 );
	const depth = t => t < end ? 0.5 + 0.5 * t / end : t > length - end ? 0.5 + 0.5 * ( length - t ) / end : 1;
	const width = t => t > length - end ? 0.65 + 0.35 * ( length - t ) / end : 1;
	const at = ( t, x, n ) => foot.clone().addScaledVector( along, t ).add( new Vector3( x * width( t ), 0, 0 ) ).addScaledVector( back, n * depth( t ) ).toArray();

	const corners = [ [ - hw, - hd ], [ hw, - hd ], [ hw, hd ], [ - hw, hd ] ];
	for ( const [ x, n ] of corners ) parts.path( material, [ at( 0, x, n ), at( end, x, n ), at( length - end, x, n ), at( length, x, n ) ], chord, 6, false );
	const bays = Math.max( 2, Math.round( length / ( hd * 2.2 ) ) );
	const step = length / bays;
	for ( let i = 0; i < bays; i ++ ) {

		const t0 = i * step;
		const t1 = t0 + step;
		for ( let c = 0; c < 4; c ++ ) {

			const [ x0, n0 ] = corners[ c ];
			const [ x1, n1 ] = corners[ ( c + 1 ) % 4 ];
			const [ a, b ] = i % 2 ? [ t0, t1 ] : [ t1, t0 ];
			parts.rod( material, at( a, x0, n0 ), at( b, x1, n1 ), chord * 0.5, 5 );
			parts.rod( material, at( t1, x0, n0 ), at( t1, x1, n1 ), chord * 0.5, 5 );

		}

	}

	return at;

}

// A crane hook block hanging with its top at `top`, `size` scaling it from a 100 t block.
export function hookBlock( parts, [ x, y, z ], size = 1 ) {

	const s = size;
	parts.box( YELLOW(), [ 0.8 * s, 1.0 * s, 0.5 * s ], [ x, y - 1.0 * s, z ] );
	parts.rod( DARK(), [ x - 0.45 * s, y - 0.35 * s, z ], [ x + 0.45 * s, y - 0.35 * s, z ], 0.35 * s, 14 );
	parts.box( BLACK(), [ 0.82 * s, 0.15 * s, 0.52 * s ], [ x, y - 1.15 * s, z ] );
	parts.cylinder( STEEL(), 0.08 * s, 0.3 * s, [ x, y - 1.45 * s, z ], 8 );
	parts.path( STEEL(), [ [ x, y - 1.45 * s, z ], [ x, y - 1.75 * s, z ], [ x, y - 1.95 * s, z + 0.12 * s ], [ x, y - 1.85 * s, z + 0.3 * s ], [ x, y - 1.65 * s, z + 0.3 * s ] ], 0.07 * s, 6 );

}

// A lattice boom crawler crane: tracks, the upper with its machinery house, cab on the left front
// and counterweight at the back, a gantry, and the boom from its foot pin at the front with the
// pendants back to the gantry. Stands at y0, its slewing centre at z0. Returns the point at the
// boom head the hoist ropes hang from. more-cranes.js builds its crawler cranes with it too.
export function crawlerCrane( parts, { y0 = 0, z0 = 0, track, boom, angle, half = [ 0.85, 0.85 ] } ) {

	const k = track.length / 7.7;
	tracks( parts, track, y0, z0 );
	const ring = y0 + track.height;
	parts.cylinder( DARK(), 1.6 * k, 0.35, [ 0, ring, z0 ], 24 );
	const deck = ring + 0.35;
	const W = 3.6 * k;
	parts.box( YELLOW(), [ W, 0.5, 7.6 * k ], [ 0, deck, z0 + 1.6 * k ] );
	const top = deck + 0.5;
	parts.box( YELLOW(), [ W - 0.6, 2.0 * k, 4.6 * k ], [ 0.3, top, z0 + 2.3 * k ] );
	parts.box( DARK(), [ 1.2, 0.04, 2.0 ], [ 0.5, top + 2.0 * k, z0 + 3.2 * k ] );
	cab( parts, [ 1.2, 2.1, 2.3 ], [ - W / 2 - 0.62, deck + 0.1, z0 - 0.9 * k ], YELLOW() );
	parts.box( YELLOW(), [ 4.6 * k, 2.4 * k, 1.7 * k ], [ 0, deck + 0.5, z0 + 5.6 * k ] );
	parts.box( DARK(), [ 4.62 * k, 0.12, 1.72 * k ], [ 0, deck + 0.5 + 2.4 * k, z0 + 5.6 * k ] );
	// Main and auxiliary hoist drums.
	parts.rod( DARK(), [ - 1.0, top + 0.6, z0 - 0.2 ], [ 1.0, top + 0.6, z0 - 0.2 ], 0.45 * k, 16 );
	parts.rod( BRIGHT(), [ - 0.95, top + 0.6, z0 - 0.2 ], [ 0.95, top + 0.6, z0 - 0.2 ], 0.47 * k, 16 );

	// Gantry (A-frame) at the back of the upper.
	const gantry = [ 0, top + 5.0 * k, z0 + 4.0 * k ];
	for ( const x of [ - 1.4 * k, 1.4 * k ] ) {

		parts.rod( YELLOW(), [ x, top + 2.0 * k, z0 + 1.6 * k ], [ x * 0.6, gantry[ 1 ], gantry[ 2 ] ], 0.12, 8 );
		parts.rod( YELLOW(), [ x, top + 2.4 * k, z0 + 5.4 * k ], [ x * 0.6, gantry[ 1 ], gantry[ 2 ] ], 0.12, 8 );

	}

	parts.rod( YELLOW(), [ - 0.9 * k, gantry[ 1 ], gantry[ 2 ] ], [ 0.9 * k, gantry[ 1 ], gantry[ 2 ] ], 0.14, 8 );
	parts.rod( DARK(), [ - 0.6, gantry[ 1 ] + 0.2, gantry[ 2 ] ], [ 0.6, gantry[ 1 ] + 0.2, gantry[ 2 ] ], 0.4, 14 );

	// Boom foot brackets and the boom.
	const foot = new Vector3( 0, top + 0.6, z0 - 2.0 * k );
	for ( const x of [ - half[ 0 ], half[ 0 ] ] ) parts.box( YELLOW(), [ 0.2, top + 0.9 - deck, 1.2 ], [ x, deck, foot.z + 0.2 ] );
	const at = latticeBoom( parts, YELLOW(), foot, angle, boom, half );
	const head = new Vector3( ...at( boom, 0, 0 ) );
	const along = new Vector3( 0, Math.sin( angle ), - Math.cos( angle ) );
	const back = new Vector3( 0, Math.cos( angle ), Math.sin( angle ) );
	parts.block( YELLOW(), [ half[ 0 ] * 1.4, 1.0, 1.2 ], head.clone().addScaledVector( along, 0.3 ).toArray(), [ angle - Math.PI / 2, 0, 0 ] );
	const sheave = head.clone().addScaledVector( along, 0.7 ).addScaledVector( back, - 0.4 );
	parts.rod( DARK(), [ - 0.5, sheave.y, sheave.z ], [ 0.5, sheave.y, sheave.z ], 0.5, 16 );
	// Pendants from the boom head to the gantry, and the boom hoist reeving between them.
	for ( const x of [ - 0.5, 0.5 ] ) parts.rod( BRIGHT(), at( boom - 0.4, x, half[ 1 ] * 0.5 ), [ x * 0.6, gantry[ 1 ] + 0.6, gantry[ 2 ] - 0.5 ], 0.04, 6 );
	return new Vector3( 0, sheave.y - 0.5, sheave.z - 0.3 );

}

// A troughed belt conveyor from its tail to its head (points on the belt's centre line): the
// belt, side channels, cross members under it and the end drums.
function conveyor( parts, tail, head, width, frame = DARK() ) {

	const a = v( tail );
	const b = v( head );
	const dir = b.clone().sub( a ).normalize();
	const side = new Vector3().crossVectors( dir, UP ).normalize();
	const up = new Vector3().crossVectors( side, dir ).normalize();
	member( parts, BELT(), [ width, 0.05 ], a, b );
	for ( const s of [ - 1, 1 ] ) {

		const off = side.clone().multiplyScalar( s * ( width / 2 + 0.07 ) ).addScaledVector( up, - 0.12 );
		member( parts, frame, [ 0.08, 0.3 ], a.clone().add( off ), b.clone().add( off ) );

	}

	const length = a.distanceTo( b );
	for ( let t = 1.2; t < length - 0.5; t += 1.8 ) {

		const p = a.clone().addScaledVector( dir, t ).addScaledVector( up, - 0.3 );
		parts.rod( frame, p.clone().addScaledVector( side, - width / 2 - 0.1 ).toArray(), p.clone().addScaledVector( side, width / 2 + 0.1 ).toArray(), 0.04, 5 );

	}

	for ( const p of [ a, b ] ) parts.rod( STEEL(), p.clone().addScaledVector( side, - width / 2 - 0.05 ).addScaledVector( up, - 0.15 ).toArray(), p.clone().addScaledVector( side, width / 2 + 0.05 ).addScaledVector( up, - 0.15 ).toArray(), 0.15, 12 );

}

// A double mooring bitt: two short posts on a base plate, at deck height y.
function bitt( parts, [ x, y, z ], alongZ = true ) {

	const [ dx, dz ] = alongZ ? [ 0, 0.35 ] : [ 0.35, 0 ];
	parts.box( DARK(), alongZ ? [ 0.5, 0.04, 1.1 ] : [ 1.1, 0.04, 0.5 ], [ x, y, z ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.cylinder( DARK(), 0.15, 0.5, [ x + s * dx, y, z + s * dz ], 12 );
		parts.cylinder( DARK(), 0.2, 0.05, [ x + s * dx, y + 0.5, z + s * dz ], 12 );

	}

}

// Handrails round a rectangle at height y: posts and two rails along each side given.
function railing( parts, [ x0, x1 ], [ z0, z1 ], y, sides = [ 0, 1, 2, 3 ], material = YELLOW() ) {

	const corners = [ [ x0, z0 ], [ x1, z0 ], [ x1, z1 ], [ x0, z1 ] ];
	for ( const s of sides ) {

		const [ ax, az ] = corners[ s ];
		const [ bx, bz ] = corners[ ( s + 1 ) % 4 ];
		for ( const h of [ 0.55, 1.1 ] ) parts.rod( material, [ ax, y + h, az ], [ bx, y + h, bz ], 0.022, 5 );
		const posts = Math.max( 1, Math.round( Math.hypot( bx - ax, bz - az ) / 1.8 ) );
		for ( let i = 0; i <= posts; i ++ ) {

			const t = i / posts;
			parts.rod( material, [ ax + ( bx - ax ) * t, y, az + ( bz - az ) * t ], [ ax + ( bx - ax ) * t, y + 1.1, az + ( bz - az ) * t ], 0.022, 5 );

		}

	}

}

// --- barges ------------------------------------------------------------------------------------

// A flat deck barge 150 x 40 ft, 7 ft deep, raked at both ends: the black hull with a 2 ft
// headlog at each end, a worn steel deck with a low curb round it, rub rails, manholes and six
// mooring bitts. Loaded, it carries 13 pipe piles 36 in x 80 ft in two nested layers on timber
// dunnage, chocked at the sides.
function deckBarge( loaded ) {

	const parts = new Parts();
	const L = 150 * FT;
	const W = 40 * FT;
	const D = 7 * FT;
	const rake = 4.5;
	parts.prism( HULL(), [ [ - L / 2 + rake, 0 ], [ L / 2 - rake, 0 ], [ L / 2, D - 0.6 ], [ L / 2, D ], [ - L / 2, D ], [ - L / 2, D - 0.6 ] ], W );
	hullTrim( parts, L, W, D );

	// Six bitts down the edges, and manholes along the middle.
	for ( const x of [ - W / 2 + 0.8, W / 2 - 0.8 ] ) for ( const z of [ - L / 2 + 2, 0, L / 2 - 2 ] ) bitt( parts, [ x, D + 0.02, z ] );
	for ( let z = - L / 2 + 6; z < L / 2 - 5; z += 8 ) for ( const x of [ - 3.5, 3.5 ] ) parts.cylinder( DARK(), 0.35, 0.04, [ x, D + 0.02, z ], 14 );

	if ( loaded ) {

		const r = 18 * IN;
		const length = 80 * FT;
		const timberY = D + 0.02;
		for ( const z of [ - 9, - 3, 3, 9 ] ) parts.box( TIMBER(), [ 8, 0.3, 0.3 ], [ 0, timberY, z ] );
		const base = timberY + 0.3 + r;
		const pitch = 2 * r + 0.03;
		const rows = [ [ 7, base ], [ 6, base + pitch * Math.sin( 60 * DEG ) ] ];
		for ( const [ count, y ] of rows ) {

			for ( let i = 0; i < count; i ++ ) {

				const x = ( i - ( count - 1 ) / 2 ) * pitch;
				parts.rod( STEEL(), [ x, y, - length / 2 ], [ x, y, length / 2 ], r, 18, true );
				// The inside of the pipe, dark, seen at each open end.
				parts.rod( BLACK(), [ x, y, - length / 2 + 0.01 ], [ x, y, length / 2 - 0.01 ], r - 0.02, 18 );

			}

		}

		// Chocks either side of the bottom layer on each timber.
		const edge = 3 * pitch + r + 0.12;
		for ( const z of [ - 9, - 3, 3, 9 ] ) for ( const s of [ - 1, 1 ] ) parts.box( TIMBER(), [ 0.24, 0.3, 0.3 ], [ s * edge, timberY + 0.3, z ] );

	}

	return parts.build();

}

// The trim every barge has: the deck plate, a curb round its edge, and rub rails along the sides
// and across the headlogs. The deck's top is 2 cm above D.
function hullTrim( parts, L, W, D ) {

	parts.box( DECK(), [ W - 0.02, 0.02, L - 0.02 ], [ 0, D, 0 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( HULL(), [ 0.15, 0.2, L ], [ s * ( W / 2 - 0.075 ), D, 0 ] );
		parts.box( HULL(), [ W - 0.3, 0.2, 0.15 ], [ 0, D, s * ( L / 2 - 0.075 ) ] );
		for ( const y of [ D - 0.25, D - 0.9 ] ) parts.rod( DARK(), [ s * ( W / 2 + 0.03 ), y, - L / 2 + ( y < D - 0.6 ? 3 : 0 ) ], [ s * ( W / 2 + 0.03 ), y, L / 2 ], 0.1, 8 );
		parts.rod( DARK(), [ - W / 2, D - 0.25, s * ( L / 2 + 0.03 ) ], [ W / 2, D - 0.25, s * ( L / 2 + 0.03 ) ], 0.1, 8 );

	}

}

// A crane barge 140 x 50 ft and 8 ft deep, raked at the bow (-Z) and square at the stern, with a
// spud well at each stern corner: a guide frame with its winch, and a 30 in square spud 70 ft
// long, raised (its foot near the bottom of the hull) or set down (only its top shows above the
// guide). A 150 t class lattice crawler crane stands on timber crane mats aft of the middle with
// its 150 ft boom over the bow at 60°, hook block down near the deck; a 20 ft deck shack at the stern.
function spudBargeCrane( down ) {

	const parts = new Parts();
	const L = 140 * FT;
	const W = 50 * FT;
	const D = 8 * FT;
	const rake = 4.5;
	parts.prism( HULL(), [ [ - L / 2 + rake, 0 ], [ L / 2, 0 ], [ L / 2, D ], [ - L / 2, D ], [ - L / 2, D - 0.6 ] ], W );
	hullTrim( parts, L, W, D );
	const deck = D + 0.02;
	for ( const x of [ - W / 2 + 0.8, W / 2 - 0.8 ] ) for ( const z of [ - L / 2 + 2, - 4 ] ) bitt( parts, [ x, deck, z ] );

	// Spud wells, guides, winches and spuds.
	const spud = 30 * IN;
	const spudLength = 70 * FT;
	const guide = 3.2;
	for ( const s of [ - 1, 1 ] ) {

		const x = s * ( W / 2 - 1.6 );
		const z = L / 2 - 1.6;
		const half = spud / 2 + 0.15;
		for ( const dx of [ - half, half ] ) for ( const dz of [ - half, half ] ) parts.box( YELLOW(), [ 0.18, guide, 0.18 ], [ x + dx, deck, z + dz ] );
		for ( const y of [ deck + 1.0, deck + guide - 0.3 ] ) {

			for ( const dz of [ - half, half ] ) parts.box( YELLOW(), [ half * 2 + 0.18, 0.3, 0.12 ], [ x, y, z + dz ] );
			for ( const dx of [ - half, half ] ) parts.box( YELLOW(), [ 0.12, 0.3, half * 2 + 0.18 ], [ x + dx, y, z ] );

		}

		parts.rod( DARK(), [ x - 0.3, deck + guide + 0.25, z - half ], [ x + 0.3, deck + guide + 0.25, z - half ], 0.3, 14 );
		const bottom = down ? 0 : 0.3;
		const top = down ? deck + guide + 1.2 : bottom + spudLength;
		parts.box( DARK(), [ spud, top - bottom, spud ], [ x, bottom, z ] );
		parts.box( YELLOW(), [ spud + 0.02, 0.4, spud + 0.02 ], [ x, top - 0.4, z ] );
		// The winch forward of the well and its wire up to the sheave.
		parts.box( YELLOW(), [ 1.2, 0.8, 1.0 ], [ x, deck, z - 3.2 ] );
		parts.rod( DARK(), [ x - 0.5, deck + 0.9, z - 3.2 ], [ x + 0.5, deck + 0.9, z - 3.2 ], 0.35, 14 );
		parts.rod( BRIGHT(), [ x, deck + 1.2, z - 3.2 ], [ x, deck + guide + 0.5, z - half - 0.2 ], 0.02, 5 );

	}

	// Deck shack between the spuds.
	parts.box( mat( 0x8e3b2a, { roughness: 0.7, metalness: 0.3 } ), [ 2.44, 2.59, 6.06 ], [ 0, deck, L / 2 - 6.5 ] );

	// Crane mats, then the crane.
	const cz = 3;
	const track = { length: 7.7, width: 6.0, shoe: 1.0, height: 1.2 };
	for ( let i = 0; i < 7; i ++ ) parts.box( TIMBER(), [ 8.5, 0.3, 1.2 ], [ 0, deck, cz - 3.75 + i * 1.25 ] );
	const y0 = deck + 0.3;
	const tip = crawlerCrane( parts, { y0, z0: cz, track, boom: 150 * FT, angle: 60 * DEG } );
	const hookTop = deck + 9;
	for ( const x of [ - 0.2, 0.2 ] ) parts.rod( BRIGHT(), [ x, tip.y, tip.z ], [ x, hookTop, tip.z ], 0.025, 5 );
	hookBlock( parts, [ 0, hookTop, tip.z ], 1.2 );
	return parts.build();

}

// --- boats -------------------------------------------------------------------------------------

// A 65 ft push boat, 26 ft beam, 10 ft deep: the hull antifouling red below the waterline and black
// above, a nearly square bow with two push knees faced in rubber and face-wire winches by them,
// tyre fenders down the sides, a red bulwark, the white deckhouse, a second deck and the elevated
// wheelhouse glazed all round with its mast and radar, and twin stacks behind it.
function pushBoat() {

	const parts = new Parts();
	const L = 65 * FT;
	const W = 26 * FT;
	const D = 10 * FT;
	const h = L / 2;
	const water = 2.3;
	const RED = mat( 0x7a2a22, { roughness: 0.8, metalness: 0.2 } );
	const TRIM = paint( 0xa3262a );
	parts.prism( RED, [ [ - h + 1.6, 0 ], [ h - 3.6, 0 ], [ h, 1.9 ], [ h, water ], [ - h, water ], [ - h, 1.2 ] ], W );
	parts.prism( HULL(), [ [ - h, water ], [ h, water ], [ h, D ], [ - h, D ] ], W );
	parts.box( DECK(), [ W - 0.02, 0.02, L - 0.02 ], [ 0, D, 0 ] );
	// Skegs and rudders under the stern, inside the hull's outline.
	for ( const x of [ - 2.2, 2.2 ] ) parts.box( HULL(), [ 0.15, 1.2, 2.4 ], [ x, 0.7, h - 3.4 ] );

	// Bulwark round the deck and the rub rail below it.
	for ( const s of [ - 1, 1 ] ) {

		parts.box( TRIM, [ 0.1, 0.8, L - 2.2 ], [ s * ( W / 2 - 0.05 ), D, 0.9 ] );
		parts.rod( BLACK(), [ s * ( W / 2 + 0.05 ), D - 0.2, - h ], [ s * ( W / 2 + 0.05 ), D - 0.2, h ], 0.12, 8 );
		parts.box( TRIM, [ W - 0.2, 0.8, 0.1 ], [ 0, D, h - 0.05 ] );
		// Tyre fenders hanging on the sides.
		for ( const z of [ - 6, - 3, 0, 3, 6 ] ) parts.rod( BLACK(), [ s * ( W / 2 + 0.02 ), D - 1.0, z ], [ s * ( W / 2 + 0.32 ), D - 1.0, z ], 0.45, 14 );

	}

	// Push knees on the bow: steel uprights faced in rubber, braced back to the deck.
	for ( const x of [ - 2.4, 2.4 ] ) {

		parts.box( HULL(), [ 0.35, 3.2, 1.4 ], [ x, D, - h + 0.7 ] );
		parts.box( BLACK(), [ 0.5, D + 3.2 - 1.2, 0.3 ], [ x, 1.2, - h - 0.15 ] );
		parts.rod( HULL(), [ x, D + 2.8, - h + 1.3 ], [ x, D, - h + 3.6 ], 0.12, 8 );

		// Face-wire winch behind each knee.
		parts.box( DARK(), [ 1.0, 0.6, 0.9 ], [ x, D, - h + 4.5 ] );
		parts.rod( DARK(), [ x - 0.55, D + 0.8, - h + 4.5 ], [ x + 0.55, D + 0.8, - h + 4.5 ], 0.4, 14 );

	}

	// Deckhouse, second deck and the elevated wheelhouse.
	parts.box( WHITE(), [ 6.2, 2.5, 9.5 ], [ 0, D, 1.2 ] );
	for ( const s of [ - 1, 1 ] ) for ( const z of [ - 2, 0.5, 3 ] ) parts.box( GLASS(), [ 0.02, 0.6, 1.0 ], [ s * 3.11, D + 1.3, z ] );
	parts.box( WHITE(), [ 5.0, 2.4, 6.0 ], [ 0, D + 2.5, 0.4 ] );
	railing( parts, [ - 3.0, 3.0 ], [ - 3.5, 5.9 ], D + 2.5, [ 0, 1, 2, 3 ], WHITE() );
	const wh = D + 4.9;
	parts.box( WHITE(), [ 4.4, 2.3, 3.8 ], [ 0, wh, - 0.8 ] );
	parts.box( GLASS(), [ 4.42, 1.0, 3.82 ], [ 0, wh + 1.0, - 0.8 ] );
	parts.box( WHITE(), [ 4.9, 0.15, 4.3 ], [ 0, wh + 2.3, - 0.8 ] );
	// Mast with its lights and the radar.
	const roof = wh + 2.45;
	parts.rod( WHITE(), [ 0, roof, 0.4 ], [ 0, roof + 2.4, 0.4 ], 0.08, 8 );
	parts.rod( WHITE(), [ - 1.0, roof + 1.6, 0.4 ], [ 1.0, roof + 1.6, 0.4 ], 0.05, 6 );
	parts.box( DARK(), [ 1.8, 0.12, 0.25 ], [ 0, roof + 0.7, 0.4 ] );
	parts.box( DARK(), [ 0.3, 0.3, 0.3 ], [ 0, roof + 0.4, 0.4 ] );
	// Twin stacks behind the wheelhouse.
	for ( const x of [ - 1.7, 1.7 ] ) {

		parts.cylinder( WHITE(), 0.24, 5.0, [ x, D + 2.5, 2.8 ], 14 );
		parts.cylinder( BLACK(), 0.25, 0.6, [ x, D + 7.5, 2.8 ], 14 );

	}

	// Bitts on the after deck.
	for ( const x of [ - 2.5, 2.5 ] ) bitt( parts, [ x, D + 0.02, h - 1.6 ], false );
	return parts.build();

}

// A 24 ft aluminium work skiff, 8 ft beam: the hull's sides and a narrower bottom, the bow
// narrowing to a blunt nose, a tread-plate floor, a rub rail round the gunwale, a centre console
// with its windscreen and a leaning post, cleats, and a 150 hp outboard on the transom.
function workSkiff() {

	const parts = new Parts();
	const L = 24 * FT;
	const W = 8 * FT;
	const h = L / 2;
	const w = W / 2;
	const outline = s => [ [ - w * s, h * s ], [ - w * s, - 1.2 ], [ - 0.55 * s, - h * s + 0.25 ], [ - 0.32 * s, - h * s ], [ 0.32 * s, - h * s ], [ 0.55 * s, - h * s + 0.25 ], [ w * s, - 1.2 ], [ w * s, h * s ] ];
	const inner = [ [ - w + 0.05, h - 0.05 ], [ w - 0.05, h - 0.05 ], [ w - 0.05, - 1.2 ], [ 0.52, - h + 0.3 ], [ 0.3, - h + 0.05 ], [ - 0.3, - h + 0.05 ], [ - 0.52, - h + 0.3 ], [ - w + 0.05, - 1.2 ] ];
	const gunwale = 0.95;
	plan( parts, ALUMINIUM(), outline( 1 ), 0.12, gunwale, [ inner ] );
	plan( parts, ALUMINIUM(), outline( 0.94 ), 0, 0.12 );
	plan( parts, mat( 0x9fa5aa, { roughness: 0.6, metalness: 0.5 } ), inner, 0.3, 0.33 );
	// Rub rail round the gunwale.
	const rail = outline( 1 ).map( ( [ x, z ] ) => [ x * 1.01, gunwale - 0.04, z * 1.003 ] );
	parts.path( BLACK(), [ ...rail, rail[ 0 ] ], 0.04, 6 );

	// Centre console with its windscreen and the leaning post behind it.
	parts.box( WHITE(), [ 0.8, 0.95, 0.75 ], [ 0, 0.33, 0.1 ] );
	parts.block( GLASS(), [ 0.82, 0.4, 0.02 ], [ 0, 1.42, - 0.2 ], [ - 0.4, 0, 0 ] );
	parts.box( DARK(), [ 0.5, 0.05, 0.3 ], [ 0, 1.28, 0.0 ] );
	parts.rod( DARK(), [ 0, 1.15, 0.25 ], [ 0, 1.28, 0.08 ], 0.12, 10 );
	parts.box( WHITE(), [ 0.7, 0.75, 0.4 ], [ 0, 0.33, 1.1 ] );
	parts.box( DARK(), [ 0.72, 0.14, 0.42 ], [ 0, 1.08, 1.1 ] );
	// Cleats at the bow, stern and amidships.
	for ( const [ x, z ] of [ [ 0, - h + 0.4 ], [ - w + 0.12, h - 0.3 ], [ w - 0.12, h - 0.3 ], [ - w + 0.12, 0 ], [ w - 0.12, 0 ] ] ) parts.box( STEEL(), [ 0.08, 0.05, 0.25 ], [ x, gunwale, z ] );

	// Outboard on the transom: bracket, cowling, midsection, cavitation plate and propeller.
	const t = h;
	parts.box( DARK(), [ 0.35, 0.3, 0.2 ], [ 0, gunwale - 0.3, t + 0.1 ] );
	parts.box( WHITE(), [ 0.5, 0.65, 0.7 ], [ 0, gunwale, t + 0.38 ] );
	parts.box( BLACK(), [ 0.52, 0.05, 0.72 ], [ 0, gunwale + 0.02, t + 0.38 ] );
	parts.box( DARK(), [ 0.18, gunwale - 0.12, 0.3 ], [ 0, 0.12, t + 0.36 ] );
	parts.box( DARK(), [ 0.4, 0.03, 0.55 ], [ 0, 0.3, t + 0.38 ] );
	parts.rod( DARK(), [ 0, 0.15, t + 0.36 ], [ 0, 0.15, t + 0.66 ], 0.1, 10 );
	parts.box( DARK(), [ 0.05, 0.12, 0.2 ], [ 0, 0, t + 0.42 ] );
	for ( const a of [ 0, 120, 240 ] ) parts.block( BLACK(), [ 0.04, 0.24, 0.08 ], [ Math.sin( a * DEG ) * 0.1, 0.15 + Math.cos( a * DEG ) * 0.1, t + 0.68 ], [ 0, 0, - a * DEG ] );
	return parts.build();

}

// --- marine construction gear ------------------------------------------------------------------

// A 50 ft section of floating turbidity curtain as deployed: the 12 in yellow float in five
// pockets, the 5 ft skirt hanging from it with the ballast chain along its foot, and aluminium
// end connectors to join the next section. Its length runs across (x), so a row strings them.
function turbidityCurtain() {

	const parts = new Parts();
	const L = 50 * FT;
	const skirt = 5 * FT;
	const r = 6 * IN;
	const FLOAT = mat( 0xf2c21a, { roughness: 0.6 } );
	const FABRIC = mat( 0xe0a51c, { roughness: 0.85, side: 2 } );
	const floatY = skirt + 0.04 + r * 0.6;
	const pockets = 5;
	for ( let i = 0; i < pockets; i ++ ) {

		const x0 = - L / 2 + i * L / pockets + 0.12;
		parts.rod( FLOAT, [ x0, floatY, 0 ], [ x0 + L / pockets - 0.24, floatY, 0 ], r, 12 );

	}

	parts.rod( FABRIC, [ - L / 2, floatY, 0 ], [ L / 2, floatY, 0 ], r * 0.55, 8 );
	parts.box( FABRIC, [ L, skirt, 0.01 ], [ 0, 0.04, 0 ] );
	parts.rod( DARK(), [ - L / 2, 0.025, 0 ], [ L / 2, 0.025, 0 ], 0.025, 6 );
	for ( const x of [ - L / 2 + 0.03, L / 2 - 0.03 ] ) parts.box( ALUMINIUM(), [ 0.05, floatY + r - 0.04, 0.06 ], [ x, 0.04, 0 ] );
	return parts.build();

}

// A 40 ft template for pitching and driving sheet piles from the water: two levels of W14 walers
// either side of the pile line, 26 in apart, clamped to four 20 in pipe legs 6 m tall, with cross
// ties over the gap at each leg, timber spacer blocks on the inside faces, and raking braces.
function sheetPileTemplate() {

	const parts = new Parts();
	const L = 40 * FT;
	const gap = 26 * IN;
	const waler = [ 0.37, 0.36 ];
	const legR = 10 * IN;
	const height = 6.0;
	const LEG = paint( 0xb5452a );
	const legZ = gap / 2 + waler[ 0 ] + legR + 0.02;
	const legX = [ - L / 2 + 1.0, - L / 6, L / 6, L / 2 - 1.0 ];
	for ( const x of [ legX[ 0 ], legX[ 3 ] ] ) for ( const s of [ - 1, 1 ] ) parts.cylinder( LEG, legR, height, [ x, 0, s * legZ ], 16 );

	for ( const y of [ 1.8, 4.6 ] ) {

		for ( const s of [ - 1, 1 ] ) {

			const z = s * ( gap / 2 + waler[ 0 ] / 2 );
			// The W-beam: web and flanges.
			parts.box( STEEL(), [ L, waler[ 1 ], 0.02 ], [ 0, y, z ] );
			for ( const dy of [ 0, waler[ 1 ] - 0.025 ] ) parts.box( STEEL(), [ L, 0.025, waler[ 0 ] ], [ 0, y + dy, z ] );
			for ( let x = - L / 2 + 1.5; x < L / 2; x += 2.0 ) parts.box( TIMBER(), [ 0.3, 0.25, 0.08 ], [ x, y + 0.05, s * ( gap / 2 - 0.04 ) ] );

		}

		// Cross ties over the gap and clamp plates at the legs.
		for ( const x of [ legX[ 0 ], legX[ 3 ] ] ) {

			parts.box( STEEL(), [ 0.3, 0.2, legZ * 2 + 0.5 ], [ x, y + waler[ 1 ], 0 ] );
			for ( const s of [ - 1, 1 ] ) parts.box( DARK(), [ 0.6, waler[ 1 ] + 0.1, 0.04 ], [ x, y - 0.05, s * ( legZ - legR - 0.02 ) ] );

		}

		for ( const x of [ legX[ 1 ], legX[ 2 ] ] ) parts.box( STEEL(), [ 0.3, 0.2, gap + 2 * waler[ 0 ] ], [ x, y + waler[ 1 ], 0 ] );

	}

	// Raking braces from the outer walers down to the legs' feet along the frame.
	for ( const s of [ - 1, 1 ] ) {

		const z = s * ( gap / 2 + waler[ 0 ] + 0.06 );
		parts.rod( LEG, [ legX[ 0 ] + 0.3, 4.6, z ], [ legX[ 1 ], 1.8, z ], 0.08, 8 );
		parts.rod( LEG, [ legX[ 3 ] - 0.3, 4.6, z ], [ legX[ 2 ], 1.8, z ], 0.08, 8 );

	}

	return parts.build();

}

// --- aggregates --------------------------------------------------------------------------------

// A tracked 3-deck screening plant at work, about 18 m by 20 m with its conveyors out: the hopper
// and belt feeder at the back, the 20 x 5 ft triple-deck screen box sloping down towards the front
// with its walkways, the fines conveyor running out under it to the front, a side conveyor each
// side for the two mid grades and a short oversize conveyor angled off the front left, the power
// unit at the front of the chassis.
function screeningPlant() {

	const parts = new Parts();
	const BODY = paint( 0x2f6d9e );
	tracks( parts, { length: 4.3, width: 2.7, shoe: 0.5, height: 0.8 }, 0, 1.0 );
	// Chassis rails from end to end.
	parts.box( BODY, [ 2.3, 0.5, 15.0 ], [ 0, 0.8, 0.5 ] );

	// Hopper and the feeder belt rising out of it to the screen.
	const hz = 6.2;
	parts.box( BODY, [ 2.4, 1.6, 4.0 ], [ 0, 1.3, hz ] );
	for ( const s of [ - 1, 1 ] ) parts.block( BODY, [ 0.08, 1.0, 4.0 ], [ s * 1.55, 3.3, hz ], [ 0, 0, - s * 30 * DEG ] );
	parts.block( BODY, [ 3.3, 1.0, 0.08 ], [ 0, 3.3, hz + 2.2 ], [ 30 * DEG, 0, 0 ] );
	parts.box( STONE(), [ 2.3, 0.1, 3.6 ], [ 0, 2.85, hz ] );
	parts.cylinder( STONE(), 1.5, 0.7, [ 0, 2.9, hz + 0.4 ], 14, 0.3 );
	conveyor( parts, [ 0, 2.4, hz + 1.5 ], [ 0, 4.4, 3.4 ], 1.2, BODY );

	// Screen box: three decks in a box sloping 15° down towards the front, on spring mounts.
	const slope = 15 * DEG;
	const screen = [ 2.4, 1.7, 6.1 ];
	const mid = new Vector3( 0, 3.3, 0.4 );
	parts.block( BODY, screen, mid.toArray(), [ - slope, 0, 0 ] );
	// The deck lips poking out of the low end, one above the other.
	const lowEnd = mid.clone().add( new Vector3( 0, - Math.sin( slope ) * screen[ 2 ] / 2, - Math.cos( slope ) * screen[ 2 ] / 2 ) );
	for ( let i = 0; i < 3; i ++ ) parts.block( STEEL(), [ 2.1, 0.06, 0.5 + i * 0.25 ], [ 0, lowEnd.y + 0.6 - i * 0.5, lowEnd.z - 0.2 - i * 0.12 ], [ - slope, 0, 0 ] );
	for ( const z of [ - 2.0, 2.6 ] ) for ( const s of [ - 1, 1 ] ) parts.box( DARK(), [ 0.3, 1.2, 0.3 ], [ s * 1.0, 1.3, z ] );
	parts.rod( DARK(), [ - 1.4, 3.4, 0.6 ], [ 1.4, 3.4, 0.6 ], 0.22, 12 );
	// Walkways each side with handrails.
	for ( const s of [ - 1, 1 ] ) {

		parts.box( STEEL(), [ 0.7, 0.05, 5.0 ], [ s * 1.6, 2.3, 0.6 ] );
		railing( parts, [ s * 1.95, s * 1.95 ], [ - 1.9, 3.1 ], 2.35, [ 1 ] );

	}

	// Fines conveyor out under the screen to the front.
	conveyor( parts, [ 0, 1.0, 2.0 ], [ 0, 4.8, - 11.8 ], 1.2, BODY );
	parts.rod( BODY, [ 0, 1.3, - 6.5 ], [ 0, 3.0, - 7.0 ], 0.08, 6 );
	// Mid-grade side conveyors and the oversize conveyor.
	for ( const s of [ - 1, 1 ] ) {

		conveyor( parts, [ s * 1.4, 1.4, s > 0 ? 0.2 : 1.2 ], [ s * 9.0, 4.6, s > 0 ? - 1.0 : 0.2 ], 0.8, BODY );
		parts.rod( BODY, [ s * 1.1, 1.3, 0.6 ], [ s * 5.5, 3.0, 0.2 ], 0.07, 6 );

	}

	conveyor( parts, [ - 0.7, 1.8, - 3.4 ], [ - 6.0, 4.0, - 8.8 ], 0.8, BODY );
	parts.rod( BODY, [ - 0.9, 1.3, - 3.6 ], [ - 3.4, 2.6, - 6.1 ], 0.07, 6 );

	// Power unit at the front of the chassis, under the fines conveyor.
	parts.box( BODY, [ 2.2, 1.0, 2.6 ], [ 0, 1.3, - 5.4 ] );
	parts.box( DARK(), [ 2.22, 0.5, 0.05 ], [ 0, 1.6, - 6.71 ] );
	return parts.build();

}

// A tracked cone crusher of the 300 hp cone class, about 17 m long working and 3 m wide: the feed
// hopper at the back, the feed conveyor up to the cone with a metal detector on it, the cone on
// its frame mid-machine, the power unit between them under the feed belt, and the product
// conveyor running out under the cone to the front with a magnet over it.
function coneCrusher() {

	const parts = new Parts();
	const BODY = paint( 0xd97a1e );
	tracks( parts, { length: 4.6, width: 3.0, shoe: 0.5, height: 0.85 }, 0, 1.2 );
	parts.box( BODY, [ 2.5, 0.5, 11.0 ], [ 0, 0.85, 2.0 ] );

	// Feed hopper and the feed conveyor up to the cone.
	const hz = 6.0;
	parts.box( BODY, [ 2.4, 1.0, 3.2 ], [ 0, 1.35, hz ] );
	for ( const s of [ - 1, 1 ] ) parts.block( BODY, [ 0.08, 0.9, 3.2 ], [ s * 1.4, 2.7, hz ], [ 0, 0, - s * 35 * DEG ] );
	parts.block( BODY, [ 3.2, 0.9, 0.08 ], [ 0, 2.7, hz + 1.8 ], [ 35 * DEG, 0, 0 ] );
	parts.box( STONE(), [ 2.2, 0.1, 3.0 ], [ 0, 2.25, hz ] );
	parts.cylinder( STONE(), 1.3, 0.6, [ 0, 2.35, hz + 0.3 ], 14, 0.25 );
	conveyor( parts, [ 0, 2.0, hz - 1.0 ], [ 0, 4.7, 1.2 ], 0.9, BODY );
	parts.box( DARK(), [ 1.4, 0.5, 0.6 ], [ 0, 3.6, 2.6 ] );

	// The cone: its frame, the main frame, the adjustment ring and bowl, the feed hopper on top.
	parts.box( BODY, [ 2.5, 0.6, 2.4 ], [ 0, 1.35, 0 ] );
	parts.cylinder( DARK(), 1.0, 0.9, [ 0, 1.95, 0 ], 20 );
	parts.cylinder( BODY, 1.2, 0.4, [ 0, 2.85, 0 ], 20 );
	for ( let i = 0; i < 10; i ++ ) {

		const a = i / 10 * Math.PI * 2;
		parts.cylinder( DARK(), 0.07, 0.5, [ Math.sin( a ) * 1.1, 2.6, Math.cos( a ) * 1.1 ], 8 );

	}

	parts.cylinder( DARK(), 0.9, 0.35, [ 0, 3.25, 0 ], 20 );
	parts.cylinder( STEEL(), 0.55, 0.7, [ 0, 3.6, 0 ], 18, 0.95 );
	// Walkway round the cone.
	parts.box( STEEL(), [ 3.0, 0.05, 3.0 ], [ 0, 2.4, 0 ] );
	railing( parts, [ - 1.5, 1.5 ], [ - 1.5, 1.5 ], 2.45, [ 0, 1, 3 ] );

	// Power unit between the cone and the hopper.
	parts.box( BODY, [ 2.4, 1.6, 2.6 ], [ 0, 1.35, 3.0 ] );
	parts.box( DARK(), [ 0.05, 0.8, 1.6 ], [ 1.21, 1.7, 3.0 ] );
	parts.cylinder( BLACK(), 0.08, 0.5, [ 0.8, 2.95, 3.6 ], 10 );

	// Product conveyor out under the cone, a magnet over it.
	conveyor( parts, [ 0, 0.8, 0.8 ], [ 0, 4.0, - 9.6 ], 1.0, BODY );
	parts.box( DARK(), [ 1.2, 0.4, 1.6 ], [ 0, 3.0, - 4.2 ] );
	for ( const x of [ - 0.7, 0.7 ] ) parts.rod( BODY, [ x, 1.35, - 2.8 ], [ x, 1.6, - 3.2 ], 0.08, 6 );
	parts.path( BODY, [ [ 1.3, 1.35, - 3.4 ], [ 1.3, 3.7, - 4.2 ], [ 0, 3.7, - 4.2 ], [ 0, 3.4, - 4.2 ] ], 0.06, 6 );
	return parts.build();

}

// --- asphalt plant -----------------------------------------------------------------------------

// A portable 400 t/h class counterflow drum mix plant laid out as it's set up, about 26 m by 42 m:
// four cold feed bins on their trailer with a collecting belt, the charging conveyor up to the
// drum's feed end, the 9 ft drum on its chassis with the burner at the discharge end, the
// baghouse beside it with its fan and stack and the duct from the drum, the drag slat conveyor up
// to the 200 t silo at the front with the truck lane under it, the hot oil heated asphalt cement
// tank, and the control house.
function asphaltPlant() {

	const parts = new Parts();
	const BODY = paint( 0xd8d3c4 );
	const TRIM = paint( 0x3d6b4a );
	const SAND = mat( 0xb09a78, { roughness: 1 } );

	// Cold feed bins along z on the right, on their trailer frame, and the collecting belt under them.
	const bx = 10;
	parts.box( TRIM, [ 2.6, 0.6, 16 ], [ bx, 0.6, 11.5 ] );
	for ( let i = 0; i < 4; i ++ ) {

		const z = 5.5 + i * 3.9;
		parts.box( BODY, [ 2.4, 1.0, 3.4 ], [ bx, 1.2, z ] );
		// Flared walls, and the aggregate heaped in each.
		for ( const s of [ - 1, 1 ] ) parts.block( BODY, [ 0.08, 2.0, 3.6 ], [ bx + s * 1.75, 3.0, z ], [ 0, 0, - s * 25 * DEG ] );
		for ( const s of [ - 1, 1 ] ) parts.block( BODY, [ 3.6, 2.0, 0.08 ], [ bx, 3.0, z + s * 1.85 ], [ s * 25 * DEG, 0, 0 ] );
		parts.cylinder( i % 2 ? SAND : STONE(), 1.8, 0.8, [ bx, 3.2, z ], 16, 0.3 );

	}

	for ( let z = 4; z <= 19; z += 3 ) for ( const s of [ - 1, 1 ] ) parts.box( DARK(), [ 0.25, 0.6, 0.25 ], [ bx + s * 1.1, 0, z ] );
	conveyor( parts, [ bx, 0.9, 3.0 ], [ bx, 1.2, 20.6 ], 0.9, TRIM );
	// Charging conveyor from the end of the bins to the drum's feed end, with a scalping screen.
	parts.box( TRIM, [ 1.6, 1.4, 2.0 ], [ bx, 0.6, 21.5 ] );
	conveyor( parts, [ bx - 0.5, 1.4, 21.5 ], [ 1.2, 5.4, 12.4 ], 0.8, TRIM );
	parts.rod( TRIM, [ 5.6, 0, 17.0 ], [ 5.6, 3.3, 17.0 ], 0.1, 6 );

	// Drum on its chassis: the drum along z, the burner and blower at the discharge end (-Z), the
	// feed breeching at the other, tyres at the back and jacks at the front.
	const axis = 3.2;
	const drumR = 1.37;
	parts.box( TRIM, [ 2.6, 0.5, 17 ], [ 0, 0.9, 4.0 ] );
	parts.rod( DARK(), [ 0, axis, - 3.0 ], [ 0, axis, 11.0 ], drumR, 24 );
	for ( const z of [ - 0.5, 8.5 ] ) parts.rod( STEEL(), [ 0, axis, z - 0.2 ], [ 0, axis, z + 0.2 ], drumR + 0.08, 24 );
	for ( const z of [ - 0.5, 8.5 ] ) for ( const s of [ - 1, 1 ] ) parts.rod( STEEL(), [ s * 0.9, 1.6, z - 0.25 ], [ s * 0.9, 1.6, z + 0.25 ], 0.28, 12 );
	parts.box( BODY, [ 3.0, 3.6, 1.6 ], [ 0, 1.4, 11.6 ] );
	parts.box( BODY, [ 2.4, 2.4, 1.0 ], [ 0, 2.0, - 3.5 ] );
	parts.rod( mat( 0xa3262a, { roughness: 0.5, metalness: 0.2 } ), [ 0, axis, - 4.0 ], [ 0, axis, - 6.0 ], 0.65, 16 );
	parts.box( DARK(), [ 1.2, 1.2, 1.4 ], [ 0, 0.9, - 6.4 ] );
	for ( const z of [ 9.5, 10.6, 11.7 ] ) for ( const s of [ - 1, 1 ] ) parts.rod( BLACK(), [ s * 0.85, 0.5, z ], [ s * 1.25, 0.5, z ], 0.5, 16 );
	for ( const s of [ - 1, 1 ] ) parts.box( DARK(), [ 0.3, 0.9, 0.3 ], [ s * 1.1, 0, - 3.5 ] );
	// The discharge chute on the right at the burner end, where the slat conveyor starts.
	parts.box( DARK(), [ 1.2, 1.4, 1.2 ], [ 2.0, 1.2, - 1.6 ] );

	// Drag slat conveyor up to the silo, in its enclosed trough, on a bent of legs.
	const foot = new Vector3( 4.0, 1.4, - 1.6 );
	const top = new Vector3( 4.0, 20.6, - 18.0 );
	member( parts, BODY, [ 1.1, 0.9 ], foot, top );
	member( parts, DARK(), [ 1.0, 0.92 ], foot.clone().lerp( top, 0.5 ), foot.clone().lerp( top, 0.52 ) );
	const bend = foot.clone().lerp( top, 0.45 );
	for ( const s of [ - 1, 1 ] ) parts.rod( TRIM, [ 4.0 + s * 1.8, 0, bend.z ], [ 4.0 + s * 0.5, bend.y - 0.5, bend.z ], 0.12, 8 );

	// Silo on its legs over the truck lane, with the batcher on top.
	const sz = - 19.0;
	const legs = 4.6;
	const siloR = 1.8;
	for ( const x of [ 4.0 - 1.6, 4.0 + 1.6 ] ) for ( const z of [ sz - 1.6, sz + 1.6 ] ) parts.box( TRIM, [ 0.3, legs + 0.6, 0.3 ], [ x, 0, z ] );
	for ( const s of [ - 1, 1 ] ) parts.rod( TRIM, [ 4.0 - 1.6, 0.8, sz + s * 1.6 ], [ 4.0 + 1.6, legs, sz + s * 1.6 ], 0.06, 6 );
	parts.cylinder( BODY, 0.3, 2.2, [ 4.0, legs, sz ], 18, siloR );
	parts.cylinder( BODY, siloR, 12.0, [ 4.0, legs + 2.2, sz ], 24 );
	parts.cylinder( TRIM, siloR + 0.03, 0.4, [ 4.0, legs + 13.8, sz ], 24 );
	parts.box( BODY, [ 2.2, 1.6, 2.6 ], [ 4.0, legs + 14.2, sz + 0.6 ] );
	railing( parts, [ 4.0 - 1.8, 4.0 + 1.8 ], [ sz - 1.8, sz + 1.8 ], legs + 14.2, [ 0, 1, 3 ] );
	parts.cylinder( DARK(), 0.4, 0.5, [ 4.0, legs - 0.5, sz ], 12 );

	// Baghouse beside the drum: the filter housing on its chassis with its hopper troughs, the duct
	// from the drum's feed end, the exhaust fan and the stack.
	const gx = - 6.5;
	parts.box( TRIM, [ 2.6, 0.5, 15 ], [ gx, 0.9, 5.5 ] );
	parts.box( BODY, [ 3.4, 4.2, 13 ], [ gx, 2.4, 5.0 ] );
	for ( let z = 0; z <= 10; z += 2.5 ) parts.box( DARK(), [ 3.42, 0.08, 0.08 ], [ gx, 6.0, z ] );
	railing( parts, [ gx - 1.7, gx + 1.7 ], [ - 1.5, 11.5 ], 6.6, [ 0, 1, 2, 3 ] );
	for ( let z = 0; z <= 10; z += 2.5 ) parts.cylinder( BODY, 0.2, 1.0, [ gx, 1.4, z ], 4, 1.2 );
	parts.path( DARK(), [ [ 0, 4.4, 11.8 ], [ 0, 7.4, 11.8 ], [ gx, 7.4, 11.8 ], [ gx, 6.6, 11.8 ] ], 0.7, 14 );
	parts.box( DARK(), [ 2.2, 2.4, 2.4 ], [ gx, 0.9, - 2.8 ] );
	parts.cylinder( BODY, 0.85, 12.0, [ gx, 3.3, - 2.8 ], 18 );
	parts.cylinder( DARK(), 0.87, 0.4, [ gx, 15.0, - 2.8 ], 18 );

	// Asphalt cement tank on the left, lying along z on saddles, and its hot oil heater.
	const tx = - 12.0;
	for ( const z of [ - 1.0, 4.5, 10.0 ] ) parts.box( TRIM, [ 2.6, 0.9, 0.5 ], [ tx, 0, z ] );
	parts.rod( BODY, [ tx, 2.4, - 3.5 ], [ tx, 2.4, 12.5 ], 1.55, 24 );
	parts.box( TRIM, [ 2.0, 2.0, 2.4 ], [ tx, 0, 15.0 ] );
	parts.path( DARK(), [ [ tx + 1.4, 2.0, 2.0 ], [ - 3.0, 2.0, 2.0 ], [ - 3.0, 2.0, - 2.5 ], [ - 0.6, 2.0, - 2.5 ] ], 0.08, 6 );

	// Control house by the silo, looking at the truck lane.
	parts.box( WHITE(), [ 2.6, 2.6, 8.0 ], [ 11.0, 0.6, - 10.0 ] );
	parts.box( GLASS(), [ 0.02, 1.0, 5.0 ], [ 9.69, 1.8, - 10.5 ] );
	parts.box( DARK(), [ 2.4, 0.6, 7.6 ], [ 11.0, 0, - 10.0 ] );
	return parts.build();

}

// --- demolition excavators ---------------------------------------------------------------------

// A crawler excavator's carrier without its front: tracks, the swing ring and the house (deck,
// the counterweight curved to the tail swing radius, the engine hood and the right-hand tank
// compartment). Front at -Z, the swing axis at x = z = 0.
function carrier( parts, body, { track, swing, width, front, tail, deck, hood, counterweight } ) {

	tracks( parts, track, 0, 0 );
	parts.cylinder( BLACK(), width * 0.32, swing - track.height, [ 0, track.height, 0 ], 24 );
	parts.box( DARK(), [ width, deck - swing, tail - front - 0.4 ], [ 0, swing, ( front + tail - 0.4 ) / 2 ] );
	const W = width / 2;
	const arc = [];
	for ( let i = 0; i <= 12; i ++ ) {

		const x = MathUtils.lerp( W, - W, i / 12 );
		arc.push( [ x, Math.sqrt( tail * tail - x * x ) ] );

	}

	const back = Math.sqrt( tail * tail - W * W ) - 0.6;
	plan( parts, body, [ [ - W, back ], [ W, back ], ...arc ], swing, counterweight );
	parts.box( body, [ width, hood - deck, back - 0.4 ], [ 0, deck, back / 2 - 0.2 + 0.2 ] );
	parts.box( BLACK(), [ width * 0.5, 0.02, 1.0 ], [ width * 0.12, hood, back * 0.6 ] );
	parts.cylinder( BLACK(), 0.07, 0.45, [ width * 0.3, hood, back * 0.4 ], 10 );
	parts.box( body, [ W - 0.55, hood - deck - 0.3, - front - 0.2 ], [ ( W + 0.55 ) / 2, deck, front / 2 - 0.1 ] );

}

// A 25 m high-reach demolition excavator on a 70 t class carrier with its tracks set out wide: a
// three-piece front (base boom, intermediate boom and stick) standing nearly straight up, its
// rams, a demolition shear on a rotator at the top, the tilting cab tipped back so the operator
// can watch the tool, and extra counterweight.
function highReach() {

	const parts = new Parts();
	const body = YELLOW();
	carrier( parts, body, {
		track: { length: 5.6, width: 4.4, shoe: 0.7, height: 1.15 },
		swing: 1.35, width: 3.3, front: - 2.2, tail: 3.7, deck: 1.6, hood: 2.9, counterweight: 3.1,
	} );
	// Extra counterweight slab on the back.
	parts.box( DARK(), [ 2.6, 0.5, 1.2 ], [ 0, 3.1, 2.6 ] );

	// Tilting cab on the left: pivoted at its back foot and tipped up 25°.
	const tilt = new Matrix4().makeTranslation( - 1.1, 1.65, - 0.2 ).multiply( new Matrix4().makeRotationX( 25 * DEG ) );
	const local = ( material, [ w, h, l ], [ x, y, z ] ) => parts.add( material, new BoxGeometry( w, h, l ).translate( x, y + h / 2, z ), tilt );
	local( body, [ 1.0, 1.8, 2.0 ], [ 0, 0, - 1.0 ] );
	local( GLASS(), [ 0.86, 1.4, 0.02 ], [ 0, 0.3, - 2.01 ] );
	local( GLASS(), [ 0.86, 0.02, 1.0 ], [ 0, 1.8, - 1.3 ] );
	for ( const s of [ - 1, 1 ] ) local( GLASS(), [ 0.02, 0.8, 1.4 ], [ s * 0.51, 0.85, - 1.1 ] );
	local( DARK(), [ 1.1, 0.3, 2.1 ], [ 0, - 0.3, - 1.0 ] );

	// The front: base boom, intermediate boom, stick, each a box section with pins across its joints.
	const foot = new Vector3( 0.25, 2.5, - 1.5 );
	const dir = a => new Vector3( 0, Math.sin( a * DEG ), - Math.cos( a * DEG ) );
	const j1 = foot.clone().addScaledVector( dir( 72 ), 11.0 );
	const j2 = j1.clone().addScaledVector( dir( 86 ), 9.0 );
	const pin = j2.clone().addScaledVector( dir( 80 ), 3.4 );
	member( parts, body, [ 0.8, 1.1 ], foot, j1 );
	member( parts, body, [ 0.62, 0.8 ], j1, j2 );
	member( parts, body, [ 0.5, 0.6 ], j2, pin );
	for ( const p of [ foot, j1, j2, pin ] ) parts.rod( STEEL(), [ p.x - 0.5, p.y, p.z ], [ p.x + 0.5, p.y, p.z ], 0.12, 10 );
	// Foot brackets on the deck.
	for ( const x of [ - 0.25, 0.75 ] ) parts.box( DARK(), [ 0.12, 1.1, 1.4 ], [ x, 1.6, - 1.4 ] );

	// Rams: two lifting the base boom, one each on the back of the booms for the next part.
	for ( const x of [ - 0.25, 0.75 ] ) ram( parts, 0.16, [ x, 1.9, - 2.4 ], foot.clone().addScaledVector( dir( 72 ), 5.0 ).add( new Vector3( x - 0.25, - 0.4, 0 ) ) );
	const behind = a => new Vector3( 0, Math.cos( a * DEG ), Math.sin( a * DEG ) );
	ram( parts, 0.14, foot.clone().addScaledVector( dir( 72 ), 6.0 ).addScaledVector( behind( 72 ), 0.75 ), j1.clone().addScaledVector( dir( 86 ), 2.0 ).addScaledVector( behind( 86 ), 0.55 ) );
	ram( parts, 0.11, j1.clone().addScaledVector( dir( 86 ), 5.5 ).addScaledVector( behind( 86 ), 0.55 ), j2.clone().addScaledVector( dir( 80 ), 1.2 ).addScaledVector( behind( 80 ), 0.45 ) );
	// Hoses up the front of the booms.
	parts.path( BLACK(), [ [ 0.25, 2.2, - 2.3 ], foot.clone().addScaledVector( dir( 72 ), 3 ).addScaledVector( behind( 72 ), - 0.6 ).toArray(), j1.clone().addScaledVector( behind( 72 ), - 0.5 ).toArray(), j2.clone().addScaledVector( behind( 86 ), - 0.4 ).toArray(), pin.clone().addScaledVector( behind( 80 ), - 0.4 ).toArray() ], 0.05, 6 );

	// The shear: rotator and body hanging forward and down from the pin, two jaws open.
	const toolDir = new Vector3( 0, - Math.sin( 55 * DEG ), - Math.cos( 55 * DEG ) );
	const toolSide = new Vector3( 0, Math.cos( 55 * DEG ), - Math.sin( 55 * DEG ) );
	const angle = Math.atan2( toolDir.z, toolDir.y );
	const bodyEnd = pin.clone().addScaledVector( toolDir, 1.3 );
	parts.block( DARK(), [ 0.7, 0.6, 1.3 ], pin.clone().addScaledVector( toolDir, 0.6 ).toArray(), [ angle + Math.PI / 2, 0, 0 ] );
	parts.block( body, [ 0.8, 0.7, 0.4 ], pin.clone().addScaledVector( toolDir, 0.2 ).toArray(), [ angle + Math.PI / 2, 0, 0 ] );
	for ( const s of [ - 1, 1 ] ) {

		// Each jaw a heavy arm, its tip hooked in towards the other.
		const jawDir = toolDir.clone().addScaledVector( toolSide, s * 0.3 ).normalize();
		const knee = bodyEnd.clone().addScaledVector( toolSide, s * 0.2 ).addScaledVector( jawDir, 1.3 );
		member( parts, STEEL(), [ 0.5, 0.4 ], bodyEnd.clone().addScaledVector( toolSide, s * 0.2 ), knee );
		member( parts, STEEL(), [ 0.5, 0.3 ], knee, knee.clone().addScaledVector( toolDir, 0.45 ).addScaledVector( toolSide, - s * 0.35 ) );

	}

	return parts.build();

}

// A long-reach excavator on a 30 t class carrier: a 10.2 m boom raised 30° and a 7.9 m stick reaching
// out and down to an 0.5 m³ ditching bucket at about 15 m out, 18 m at full reach. The rams, the
// cab on the left, and the extra counterweight it carries.
function longReach() {

	const parts = new Parts();
	const body = YELLOW();
	carrier( parts, body, {
		track: { length: 4.65, width: 3.2, shoe: 0.7, height: 0.95 },
		swing: 1.05, width: 3.0, front: - 2.0, tail: 3.1, deck: 1.35, hood: 2.5, counterweight: 2.45,
	} );
	parts.box( DARK(), [ 2.4, 0.35, 1.0 ], [ 0, 2.45, 2.2 ] );
	cab( parts, [ 1.0, 1.65, 1.9 ], [ - 0.98, 1.35, - 1.05 ], body );

	const foot = new Vector3( 0.15, 2.1, - 1.0 );
	const dir = a => new Vector3( 0, Math.sin( a * DEG ), - Math.cos( a * DEG ) );
	const behind = a => new Vector3( 0, Math.cos( a * DEG ), Math.sin( a * DEG ) );
	// The boom bends a little 4 m up it, as long-reach booms do.
	const knee = foot.clone().addScaledVector( dir( 38 ), 4.0 );
	const tip = knee.clone().addScaledVector( dir( 25 ), 6.3 );
	const end = tip.clone().addScaledVector( dir( - 52 ), 7.9 );
	member( parts, body, [ 0.55, 0.85 ], foot, knee );
	member( parts, body, [ 0.5, 0.7 ], knee, tip );
	member( parts, body, [ 0.4, 0.5 ], tip.clone().addScaledVector( dir( - 52 ), - 0.6 ), end );
	for ( const p of [ foot, tip, end ] ) parts.rod( STEEL(), [ p.x - 0.35, p.y, p.z ], [ p.x + 0.35, p.y, p.z ], 0.08, 10 );
	for ( const x of [ - 0.2, 0.5 ] ) parts.box( DARK(), [ 0.1, 0.9, 1.2 ], [ x, 1.35, - 1.0 ] );

	// Boom rams under it, the stick ram on top, the bucket ram along the stick.
	for ( const x of [ - 0.18, 0.48 ] ) ram( parts, 0.11, [ x, 1.5, - 2.0 ], knee.clone().add( new Vector3( x - 0.15, - 0.45, 0 ) ) );
	ram( parts, 0.11, knee.clone().addScaledVector( behind( 25 ), 0.6 ), tip.clone().addScaledVector( dir( - 52 ), - 0.6 ).addScaledVector( behind( - 52 ), 0.35 ) );
	ram( parts, 0.08, tip.clone().addScaledVector( dir( - 52 ), 0.4 ).addScaledVector( behind( - 52 ), 0.35 ), end.clone().addScaledVector( dir( - 52 ), - 1.0 ).addScaledVector( behind( - 52 ), 0.32 ) );
	parts.path( BLACK(), [ [ 0.15, 2.3, - 1.8 ], knee.clone().addScaledVector( behind( 38 ), 0.5 ).toArray(), tip.clone().addScaledVector( behind( 25 ), 0.45 ).toArray() ], 0.04, 6 );

	// The bucket, hanging from the stick end and curled back towards the machine.
	const [ x0, y0, z0 ] = [ end.x, end.y, end.z ];
	const shell = [ [ - 0.2, 0.15 ], [ 0.25, 0.1 ], [ 0.55, - 0.5 ], [ 0.35, - 0.78 ], [ - 0.1, - 0.85 ], [ - 0.45, - 0.55 ], [ - 0.4, - 0.1 ] ];
	parts.prism( DARK(), shell.map( ( [ z, y ] ) => [ z0 + z, y0 + y ] ), 0.95, x0 );
	parts.prism( BLACK(), [ [ 0.5, - 0.48 ], [ 0.7, - 0.62 ], [ 0.4, - 0.7 ] ].map( ( [ z, y ] ) => [ z0 + z, y0 + y ] ), 0.85, x0 );
	return parts.build();

}

// --- piling ------------------------------------------------------------------------------------

// A pile driving rig: a 100 t class lattice crawler crane with a 100 ft boom at 66°, swinging 26
// in box leads 25 m long on its hoist line, their stabbing point in the ground; a D46 class diesel
// impact hammer riding the front of the leads on its helmet, driving an HP14 pile pitched in them.
function pileDriver() {

	const parts = new Parts();
	const track = { length: 6.7, width: 5.4, shoe: 0.9, height: 1.1 };
	const tip = crawlerCrane( parts, { track, boom: 100 * FT, angle: 66 * DEG, half: [ 0.75, 0.75 ] } );

	// Leads: a square truss of four chords with lacing, stabbing point at the foot, sheave head on top.
	const top = 25;
	const s = 26 * IN / 2;
	const lz = tip.z + 0.4;
	const LEAD = paint( 0x3d4247 );
	for ( const x of [ - s, s ] ) for ( const z of [ - s, s ] ) parts.rod( LEAD, [ x, 0.6, lz + z ], [ x, top, lz + z ], 0.06, 6 );
	const faces = [ [ [ - s, - s ], [ s, - s ] ], [ [ s, - s ], [ s, s ] ], [ [ s, s ], [ - s, s ] ], [ [ - s, s ], [ - s, - s ] ] ];
	for ( let y = 0.6, i = 0; y < top - 0.5; y += 0.9, i ++ ) {

		for ( const [ a, b ] of faces ) {

			const [ p, q ] = i % 2 ? [ a, b ] : [ b, a ];
			parts.rod( LEAD, [ p[ 0 ], y, lz + p[ 1 ] ], [ q[ 0 ], y + 0.9, lz + q[ 1 ] ], 0.025, 4 );

		}

	}

	parts.box( LEAD, [ s * 2 + 0.1, 0.5, s * 2 + 0.1 ], [ 0, 0.4, lz ] );
	parts.cylinder( LEAD, 0.03, 0.4, [ 0, 0, lz ], 8, 0.2 );
	// Guide rails down the front face the hammer runs on.
	for ( const x of [ - s + 0.05, s - 0.05 ] ) parts.box( STEEL(), [ 0.1, top - 0.9, 0.06 ], [ x, 0.9, lz - s - 0.03 ] );
	parts.box( LEAD, [ 0.9, 0.9, 1.2 ], [ 0, top, lz - 0.1 ] );
	for ( const z of [ lz - 0.5, lz + 0.2 ] ) parts.rod( DARK(), [ - 0.25, top + 0.75, z ], [ 0.25, top + 0.75, z ], 0.35, 12 );
	// The crane's hoist ropes down to the lead head.
	for ( const x of [ - 0.15, 0.15 ] ) parts.rod( BRIGHT(), [ x, tip.y, tip.z ], [ x, top + 0.9, lz ], 0.025, 5 );

	// HP14 pile in the leads, the helmet on it and the hammer above.
	const pz = lz - s - 0.45;
	const pileTop = 14.5;
	const fl = 0.37;
	parts.box( STEEL(), [ 0.02, pileTop, 0.34 ], [ 0, 0, pz ] );
	for ( const dz of [ - 0.17, 0.17 ] ) parts.box( STEEL(), [ fl, pileTop, 0.02 ], [ 0, 0, pz + dz ] );
	const HAMMER = paint( 0xc8b21c );
	parts.box( DARK(), [ 0.75, 0.9, 0.75 ], [ 0, pileTop - 0.2, pz ] );
	parts.box( BLACK(), [ 0.7, 0.2, 0.7 ], [ 0, pileTop + 0.7, pz ] );
	const ram0 = pileTop + 0.9;
	const ramTop = ram0 + 5.3;
	parts.cylinder( HAMMER, 0.38, ramTop - ram0, [ 0, ram0, pz ], 18 );
	parts.cylinder( DARK(), 0.42, 0.3, [ 0, ram0 + 1.2, pz ], 18 );
	parts.box( HAMMER, [ 0.5, 1.4, 0.4 ], [ 0.45, ram0 + 2.2, pz - 0.05 ] );
	parts.cylinder( DARK(), 0.3, 0.3, [ 0, ramTop, pz ], 14 );
	// Lead jaws gripping the guide rails, top and bottom.
	for ( const y of [ ram0 + 0.4, ramTop - 0.6, pileTop ] ) parts.box( DARK(), [ s * 2 + 0.2, 0.3, 0.5 ], [ 0, y, pz + 0.3 ] );
	// Hammer line from the lead head down to the hammer's top.
	parts.rod( BRIGHT(), [ 0, top + 0.4, lz - 0.85 ], [ 0, ramTop + 0.3, pz ], 0.025, 5 );
	return parts.build();

}
