import { Matrix4, MathUtils, TorusGeometry, Vector3 } from 'three';
import { FT, IN, mat as partsMat, Parts } from './parts.js';
import { AMBER_LAMP, across, beam, BLACK, box, BRIGHT, cabin, cylinder, DARK, hookBlock, mat, outrigger, paint, ram, RED_LAMP, rod, STEEL, telescopicBoom, wheel } from './plant-parts.js';
import { crawlerCrane, hookBlock as bigHookBlock, latticeBoom } from './heavy-civil.js';

// More lifting and access equipment built in code at the sizes of the common North American
// classes (no brands): rough-terrain cranes, a boom truck, lattice crawler cranes and a big
// all-terrain crane; a self-erecting tower crane and a hammerhead's parts on the ground; boom,
// scissor, mast and spider lifts; a material hoist; and rigging (a chain sling, a spreader frame,
// load test water bags and outrigger pads). Like the other built-in pieces each stands on y = 0
// with its front facing -Z (+X is its right). Machines are built with the plant-parts helpers but
// collected into Parts (see into()), so each is a few meshes, one per material.

const DEG = MathUtils.DEG2RAD;
const UP = new Vector3( 0, 1, 0 );
const _m = new Matrix4();

const CARRIER = 0x3b3e42;
const CRANE_YELLOW = 0xf2b200;
const LIFT_ORANGE = 0xe8731c;
const LIFT_BLUE = 0x2f5f9e;
const RUBBER = () => mat( 0x161718, { roughness: 0.9, metalness: 0 } );
const TIMBER = () => mat( 0x8a6a45, { roughness: 0.95, metalness: 0 } );
const CONCRETE = () => mat( 0xa8a59d, { roughness: 0.95, metalness: 0 } );
const ALUMINIUM = () => mat( 0xb5bbc0, { roughness: 0.4, metalness: 0.6 } );
const GALVANISED_FRAME = () => mat( 0xa9adb0, { roughness: 0.45, metalness: 0.65 } );
const MESH = () => mat( 0x9da3a8, { roughness: 0.5, metalness: 0.5, transparent: true, opacity: 0.45 } );
// The same yellow as the crawler cranes in heavy-civil.js, so their booms and ours are one mesh.
const LATTICE_YELLOW = () => partsMat( 0xe2a41c, { roughness: 0.5, metalness: 0.2 } );

export const MORE_CRANE_ITEMS = [
	// Mobile cranes.
	{ id: 'crane-rough-terrain-30t', name: 'Rough-terrain crane (30 t / 35 USt, 95 ft boom), boom up, outriggers set', category: 'Cranes & lifts',
		keywords: 'rough terrain crane rt crane hydraulic crane mobile crane picker cherry picker 35 ton outriggers boom up',
		build: () => roughTerrainCrane( RT_30, true ) },
	{ id: 'crane-rough-terrain-30t-stowed', name: 'Rough-terrain crane (30 t / 35 USt), boom stowed for travel', category: 'Cranes & lifts',
		keywords: 'rough terrain crane rt crane hydraulic crane mobile crane picker 35 ton stowed travel parked',
		build: () => roughTerrainCrane( RT_30, false ) },
	{ id: 'crane-rough-terrain-90t', name: 'Rough-terrain crane (90 t / 100 USt, 154 ft boom), boom up, outriggers set', category: 'Cranes & lifts',
		keywords: 'rough terrain crane rt crane hydraulic crane mobile crane picker 100 ton outriggers boom up big',
		build: () => roughTerrainCrane( RT_90, true ) },
	{ id: 'crane-rough-terrain-90t-stowed', name: 'Rough-terrain crane (90 t / 100 USt), boom stowed for travel', category: 'Cranes & lifts',
		keywords: 'rough terrain crane rt crane hydraulic crane mobile crane picker 100 ton stowed travel parked',
		build: () => roughTerrainCrane( RT_90, false ) },
	{ id: 'boom-truck-23t-127ft', name: 'Boom truck (23 t / 26 USt, 127 ft boom, tandem axle), boom up, outriggers set', category: 'Cranes & lifts',
		keywords: 'boom truck crane truck national crane stinger picker tandem truck mounted crane 26 ton outriggers boom up',
		build: () => boomTruck( true ) },
	{ id: 'boom-truck-23t-127ft-stowed', name: 'Boom truck (23 t / 26 USt, 127 ft boom, tandem axle), boom stowed', category: 'Cranes & lifts',
		keywords: 'boom truck crane truck national crane picker tandem truck mounted crane 26 ton stowed travel',
		build: () => boomTruck( false ) },
	{ id: 'crane-crawler-100t', name: 'Crawler crane (100 t / 110 USt, 150 ft lattice boom)', category: 'Cranes & lifts',
		keywords: 'crawler crane lattice boom crane friction crane tracked crane 110 ton conventional crane',
		build: crawler100 },
	{ id: 'crane-crawler-300t-luffing', name: 'Crawler crane (300 t / 330 USt, 200 ft boom, 140 ft luffing jib)', category: 'Cranes & lifts',
		keywords: 'crawler crane lattice boom luffing jib luffer tracked crane 330 ton heavy lift big crane',
		build: crawler300 },
	{ id: 'crane-all-terrain-300t-superlift', name: 'All-terrain crane (300 t / 350 USt, 6-axle, 200 ft boom, superlift)', category: 'Cranes & lifts',
		keywords: 'all terrain crane at crane hydraulic crane mobile crane 350 ton superlift y-guy boom guying 6 axle big',
		build: allTerrain300 },
	// Tower cranes.
	{ id: 'tower-crane-self-erecting', name: 'Self-erecting tower crane (30 m jib, 20 m under hook), erected', category: 'Cranes & lifts',
		keywords: 'self erecting tower crane self-erector igo potain mini tower crane fast erecting crane residential',
		build: () => selfErectingCrane( true ) },
	{ id: 'tower-crane-self-erecting-folded', name: 'Self-erecting tower crane (30 m jib), folded on its axles for transport', category: 'Cranes & lifts',
		keywords: 'self erecting tower crane self-erector igo potain folded transport travel towed axles',
		build: () => selfErectingCrane( false ) },
	{ id: 'tower-crane-mast-sections', name: 'Tower crane mast sections, laid down (3 × 2 m square × 5.8 m, on timbers)', category: 'Cranes & lifts',
		keywords: 'tower crane mast sections tower sections lattice mast laydown erection dismantle hammerhead',
		build: mastSections },
	{ id: 'tower-crane-counterweights', name: 'Tower crane counterweight blocks, stacked (6 × 5.4 t, 2.8 × 2 × 0.4 m, on timbers)', category: 'Cranes & lifts',
		keywords: 'tower crane counterweight ballast blocks concrete counter jib ballast hammerhead laydown stack',
		build: counterweightStack },
	// Aerial work platforms.
	{ id: 'boom-lift-telescopic-60ft', name: 'Telescopic boom lift (60 ft), stowed', category: 'Cranes & lifts',
		keywords: 'boom lift straight boom stick boom telescopic boom manlift man lift aerial work platform awp genie s-60 jlg 600s 60 ft',
		build: () => telescopicLift( TELE_60, false ) },
	{ id: 'boom-lift-telescopic-60ft-raised', name: 'Telescopic boom lift (60 ft), raised', category: 'Cranes & lifts',
		keywords: 'boom lift straight boom stick boom telescopic boom manlift man lift aerial work platform awp 60 ft raised up',
		build: () => telescopicLift( TELE_60, true ) },
	{ id: 'boom-lift-telescopic-80ft', name: 'Telescopic boom lift (80 ft), stowed', category: 'Cranes & lifts',
		keywords: 'boom lift straight boom stick boom telescopic boom manlift man lift aerial work platform awp genie s-80 jlg 800s 80 ft',
		build: () => telescopicLift( TELE_80, false ) },
	{ id: 'boom-lift-telescopic-80ft-raised', name: 'Telescopic boom lift (80 ft), raised', category: 'Cranes & lifts',
		keywords: 'boom lift straight boom stick boom telescopic boom manlift man lift aerial work platform awp 80 ft raised up',
		build: () => telescopicLift( TELE_80, true ) },
	{ id: 'boom-lift-towable-35ft', name: 'Towable boom lift (35 ft, trailer mounted), outriggers set, raised', category: 'Cranes & lifts',
		keywords: 'towable boom lift trailer boom lift tow behind manlift man lift aerial work platform awp cherry picker 34 ft 35 ft',
		build: towableLift },
	{ id: 'scissor-lift-rt-40ft-raised', name: 'Rough-terrain scissor lift (40 ft, 69 in wide), outriggers set, raised', category: 'Cranes & lifts',
		keywords: 'scissor lift rough terrain rt scissor diesel scissor 4wd outriggers aerial work platform awp 40 ft raised',
		build: roughTerrainScissor },
	{ id: 'mast-lift-20ft-raised', name: 'Vertical mast lift / personnel lift (20 ft), raised', category: 'Cranes & lifts',
		keywords: 'vertical mast lift personnel lift one man lift single man lift genie runabout gr-20 aerial work platform awp 20 ft',
		build: mastLift },
	{ id: 'spider-lift-50ft', name: 'Tracked spider lift / atrium lift (50 ft), outriggers set, raised', category: 'Cranes & lifts',
		keywords: 'spider lift atrium lift tracked boom lift compact crawler manlift aerial work platform awp outriggers narrow doorway',
		build: spiderLift },
	// Hoists and rigging.
	{ id: 'material-hoist-30m', name: 'Material hoist, rack and pinion (single 1.5 × 2.5 m car, 30 m mast, tied in)', category: 'Cranes & lifts',
		keywords: 'material hoist construction hoist buck hoist rack and pinion hoist goods hoist material only car mast tie',
		build: materialHoist },
	{ id: 'chain-sling-4leg', name: 'Chain sling, 4-leg with master link (1/2 in grade 100, 10 ft legs), laid out', category: 'Cranes & lifts',
		keywords: 'chain sling four leg 4 leg bridle master link hooks rigging lifting gear grade 100 g100 crane',
		build: chainSling },
	{ id: 'spreader-frame-modular', name: 'Spreader frame, modular (20 × 10 ft, 4-point, 8 in pipe struts) with slings, on dunnage', category: 'Cranes & lifts',
		keywords: 'spreader frame lifting frame modular spreader beam rectangular frame rigging slings shackles master link crane lift',
		build: spreaderFrame },
	{ id: 'load-test-water-bags', name: 'Crane load test water bags (4 × 10 t, filled, with harnesses and fill manifold)', category: 'Cranes & lifts',
		keywords: 'load test water bags proof load test weights water weights crane test certification inspection',
		build: waterBags },
	{ id: 'outrigger-pads-4x4', name: 'Crane outrigger pads, HDPE (4 × 4 ft × 3 in, stack of 4)', category: 'Access & scaffolding',
		keywords: 'outrigger pads crane pads cribbing float pads outrigger mats dica composite pad crane support',
		build: outriggerPads },
];

// --- shared pieces ---------------------------------------------------------------------------

const v3 = p => Array.isArray( p ) ? new Vector3( ...p ) : p.clone();
const boomDirection = ( angle, back = false ) => new Vector3( 0, Math.sin( angle * DEG ), ( back ? 1 : - 1 ) * Math.cos( angle * DEG ) );
const along = ( from, dir, distance ) => v3( from ).addScaledVector( dir, distance );

// The plant-parts helpers add each piece as a mesh to a parent; this parent passes them to `parts`
// instead, so they're merged with the rest of the item, one mesh per material.
function into( parts ) {

	return {
		add( mesh ) {

			mesh.updateMatrix();
			parts.add( mesh.material, mesh.geometry, mesh.matrix );

		},
	};

}

// A lattice from a to b: four chords `width` across and `depth` deep (three when `triangle`, the
// third on top), zigzag lacing on each face and a strut across each face every bay. Returns
// point( t, s, u ): t along it, s across and u up from its centre line.
function truss( parts, material, a, b, { width, depth = width, chord = 0.06, lace = chord * 0.5, bay = Math.max( width, depth ), triangle = false } ) {

	const A = v3( a );
	const B = v3( b );
	const length = A.distanceTo( B );
	const dir = B.clone().sub( A ).normalize();
	const side = Math.abs( dir.y ) > 0.99 ? new Vector3( 1, 0, 0 ) : new Vector3().crossVectors( dir, UP ).normalize();
	const up = new Vector3().crossVectors( side, dir ).normalize();
	const point = ( t, s, u ) => A.clone().addScaledVector( dir, t ).addScaledVector( side, s ).addScaledVector( up, u ).toArray();
	const corners = triangle ?
		[ [ - width / 2, - depth / 2 ], [ width / 2, - depth / 2 ], [ 0, depth / 2 ] ] :
		[ [ - width / 2, - depth / 2 ], [ width / 2, - depth / 2 ], [ width / 2, depth / 2 ], [ - width / 2, depth / 2 ] ];
	for ( const [ s, u ] of corners ) parts.rod( material, point( 0, s, u ), point( length, s, u ), chord, 6 );
	const bays = Math.max( 1, Math.round( length / bay ) );
	const step = length / bays;
	for ( let i = 0; i <= bays; i ++ ) {

		const t1 = i * step;
		for ( let c = 0; c < corners.length; c ++ ) {

			const [ s0, u0 ] = corners[ c ];
			const [ s1, u1 ] = corners[ ( c + 1 ) % corners.length ];
			parts.rod( material, point( t1, s0, u0 ), point( t1, s1, u1 ), lace, 4 );
			if ( i === bays ) continue;
			const [ ta, tb ] = i % 2 ? [ t1, t1 + step ] : [ t1 + step, t1 ];
			parts.rod( material, point( ta, s0, u0 ), point( tb, s1, u1 ), lace, 4 );

		}

	}

	return point;

}

// Guardrails round a deck from x0 to x1 and z0 to z1 at height y: posts, a mid rail and a top rail
// 1.1 m up, and a toe board.
function guardrail( parts, material, [ x0, x1 ], [ z0, z1 ], y, { high = 1.1, post = 0.025, toe = true } = {} ) {

	const corners = [ [ x0, z0 ], [ x1, z0 ], [ x1, z1 ], [ x0, z1 ] ];
	for ( let i = 0; i < 4; i ++ ) {

		const [ ax, az ] = corners[ i ];
		const [ bx, bz ] = corners[ ( i + 1 ) % 4 ];
		for ( const h of [ high * 0.5, high ] ) parts.rod( material, [ ax, y + h, az ], [ bx, y + h, bz ], post, 6 );
		const span = Math.hypot( bx - ax, bz - az );
		const posts = Math.max( 1, Math.ceil( span / 1.5 ) );
		for ( let j = 0; j < posts; j ++ ) {

			const f = j / posts;
			parts.rod( material, [ ax + ( bx - ax ) * f, y, az + ( bz - az ) * f ], [ ax + ( bx - ax ) * f, y + high, az + ( bz - az ) * f ], post, 6 );

		}

		if ( toe ) parts.block( material, [ Math.abs( bx - ax ) + 0.02, 0.12, Math.abs( bz - az ) + 0.02 ], [ ( ax + bx ) / 2, y + 0.06, ( az + bz ) / 2 ] );

	}

}

// The hoist ropes from a boom head straight down to a hook block whose top is at `hook`.
function hoistLine( g, head, hook, size, colour, falls = 2 ) {

	const offsets = falls === 1 ? [ 0 ] : [ - 0.12 * size, 0.12 * size ];
	for ( const dx of offsets ) rod( g, BLACK(), 0.018 * Math.max( 1, size ), [ head.x + dx, head.y, head.z ], [ head.x + dx, hook, head.z ], 6 );
	hookBlock( g, [ head.x, hook, head.z ], size, colour );

}

// --- rough-terrain cranes --------------------------------------------------------------------

// Sizes from typical spec sheets for each class: the carrier's length and width, tyre radius and
// width, wheelbase, where the outrigger beams are (z) and how far apart their floats are set, and
// the boom (sections, base section [ width, height ], fully out and retracted), and for working,
// the boom's angle and how far it's out and where the hook hangs.
const RT_30 = {
	length: 8.9, width: 2.55, r: 0.78, tyre: 0.55, wheelbase: 3.5, beams: 3.5, spread: 6.1,
	boom: { sections: 4, size: [ 0.62, 0.92 ], full: 29, retracted: 9.6 }, angle: 58, out: 21, hook: 7,
};
const RT_90 = {
	length: 10.6, width: 3.3, r: 0.93, tyre: 0.75, wheelbase: 4.3, beams: 4.45, spread: 7.3,
	boom: { sections: 5, size: [ 0.85, 1.25 ], full: 47, retracted: 11.6 }, angle: 62, out: 36, hook: 11,
};

// A rough-terrain crane: two axles of big tyres on a short carrier, the cab on the left of the
// superstructure. Working: outriggers set and the boom up over the front, the hook hanging.
// Stowed: outriggers in, the boom retracted and level over the front on its rest, the hook block
// tied off under its head.
function roughTerrainCrane( spec, working ) {

	const parts = new Parts();
	const g = into( parts );
	const { length, width, r, tyre, wheelbase, beams, spread, boom } = spec;
	const k = length / 9.2;
	const w = width / 2.55;
	const carrier = paint( CARRIER );
	const upper = paint( CRANE_YELLOW );

	// Carrier: a narrow frame between the tyres, decks over them, outrigger boxes at both ends,
	// bumpers and the engine at the back.
	box( g, carrier, [ 1.1 * w, r, length - 0.8 ], [ 0, 0.95 * r, 0 ] );
	const deck = tyre + 0.2;
	for ( const side of [ - 1, 1 ] ) box( g, carrier, [ deck, 0.08, wheelbase + 2 * r + 0.5 ], [ side * ( width / 2 - deck / 2 ), 2 * r + 0.08, 0 ] );
	const beamY = 1.08 * r + 0.25 * w;
	for ( const z of [ - beams, beams ] ) box( g, carrier, [ width, 0.5 * w, 0.65 * w ], [ 0, beamY - 0.25 * w, z ] );
	for ( const end of [ - 1, 1 ] ) box( g, carrier, [ width - 0.1, 0.35, 0.3 ], [ 0, 0.89 * r, end * ( length / 2 - 0.15 ) ] );
	box( g, carrier, [ 2.2 * w, 0.5, 1.4 * k ], [ 0, 1.95 * r, length / 2 - 0.95 * k ] );
	for ( const x of [ - 1.0, 1.0 ] ) box( g, RED_LAMP(), [ 0.18, 0.1, 0.04 ], [ x * w, 1.05 * r, length / 2 + 0.02 ] );
	for ( const x of [ - 0.9, 0.9 ] ) box( g, AMBER_LAMP(), [ 0.2, 0.12, 0.04 ], [ x * w, 1.05 * r, - length / 2 - 0.02 ] );
	for ( const z of [ - wheelbase / 2, wheelbase / 2 ] ) {

		across( g, DARK(), 0.12 * w, width - 2 * tyre, [ 0, r, z ], 10 );
		for ( const side of [ - 1, 1 ] ) wheel( g, r, tyre, [ side * ( width / 2 - tyre / 2 ), r, z ] );

	}

	// Outriggers: set out on their floats for work, or in their boxes with the floats on the deck.
	if ( working ) for ( const side of [ - 1, 1 ] ) for ( const z of [ - beams, beams ] ) outrigger( g, carrier, [ side * width / 2, beamY, z ], { out: side * ( spread - width ) / 2, pad: 0.6 * w, beam: [ 0.32 * w, 0.36 * w ] } );
	else for ( const side of [ - 1, 1 ] ) for ( const z of [ - beams, beams ] ) cylinder( g, DARK(), 0.1 * w, 0.2, [ side * ( width / 2 - 0.12 ), beamY - 0.45 * w, z ], 10 );

	// Superstructure on its slewing ring: frame, counterweight, hoist drum and the cab.
	const ring = 2 * r + 0.02;
	const base = ring + 0.28;
	cylinder( g, DARK(), 1.05 * w, 0.28, [ 0, ring, 0.2 * k ], 24 );
	box( g, upper, [ 1.65 * w, 1.0 * w, 4.2 * k ], [ 0.33 * w, base, 1.1 * k ] );
	box( g, upper, [ 2.4 * w, 1.2 * w, 0.9 * k ], [ 0.1 * w, base + 0.02, 3.6 * k ] );
	across( g, DARK(), 0.36 * w, 0.8 * w, [ 0.33 * w, base + 1.0 * w + 0.32, 2.75 * k ], 16 );
	cabin( g, upper, [ 0.8, 1.7, 1.6 ], [ - 0.87 * w, base, - 0.8 * k ], { sill: 0.35 } );
	cylinder( g, AMBER_LAMP(), 0.07, 0.12, [ - 0.87 * w, base + 1.7, - 0.3 * k ], 10 );

	// Boom, its lift cylinder, the hoist rope and the hook block.
	const foot = [ 0.33 * w, base + 1.0 * w + 0.12, 2.4 * k ];
	across( g, STEEL(), 0.2 * w, 0.9 * w, foot, 12 );
	if ( working ) {

		const dir = boomDirection( spec.angle );
		const head = telescopicBoom( g, upper, foot, along( foot, dir, spec.out ), { sections: boom.sections, size: boom.size } );
		ram( g, 0.18 * w, [ foot[ 0 ], base + 0.3, - 0.7 * k ], along( foot, dir, 6.2 * k ) );
		hoistLine( g, head, spec.hook, 0.9 * w );

	} else {

		// Retracted, only the base section shows; it rests level on a post at the front.
		const dir = boomDirection( 0 );
		const head = telescopicBoom( g, upper, foot, along( foot, dir, boom.retracted ), { sections: 1, size: boom.size } );
		ram( g, 0.18 * w, [ foot[ 0 ], base + 0.3, - 0.7 * k ], along( foot, dir, 4.6 * k ) );
		const restZ = - length / 2 + 0.5;
		box( g, carrier, [ 0.3, foot[ 1 ] - boom.size[ 1 ] / 2 - 1.95 * r, 0.3 ], [ foot[ 0 ], 1.95 * r, restZ ] );
		hoistLine( g, head, head.y - 0.25, 0.9 * w );

	}

	return parts.build();

}

// --- boom truck ------------------------------------------------------------------------------

// A 23 t (26 US ton) boom truck with a 127 ft (38.7 m) five-section boom, the class of the big
// stand-up-control boom trucks, behind the cab of a tandem-axle conventional truck with a 22 ft
// deck. Working: front outriggers at the turret set 22 ft wide, rear stabilisers down, the boom
// fully out at 70° over the back. Stowed: outriggers in and the boom retracted along the deck on
// its rest, the hook block tied to the back.
function boomTruck( working ) {

	const parts = new Parts();
	const g = into( parts );
	const truck = paint( 0xeceae4 );
	const crane = paint( CRANE_YELLOW );
	const length = 12.6;
	const width = 2.59;
	const r = 0.53;
	const front = - length / 2;
	const back = length / 2;
	const tandem = [ 3.05, 4.4 ];

	// Chassis rails, axles and wheels, fuel tanks and the deck.
	for ( const x of [ - 0.43, 0.43 ] ) box( g, DARK(), [ 0.1, 0.3, length - 0.5 ], [ x, 0.85, 0.25 ] );
	across( g, DARK(), 0.07, 1.9, [ 0, r, front + 1.6 ], 8 );
	for ( const side of [ - 1, 1 ] ) wheel( g, r, 0.32, [ side * ( width / 2 - 0.16 ), r, front + 1.6 ] );
	for ( const z of tandem ) {

		across( g, DARK(), 0.07, 1.9, [ 0, r, z ], 8 );
		for ( const side of [ - 1, 1 ] ) wheel( g, r, 0.27, [ side * ( width / 2 - 0.29 ), r, z ], { dual: true } );

	}

	for ( const side of [ - 1, 1 ] ) rod( g, BRIGHT(), 0.3, [ side * 0.95, 0.75, front + 2.5 ], [ side * 0.95, 0.75, front + 3.5 ], 16 );
	const deckFront = 0.0;
	const deckLength = back - deckFront;
	box( g, mat( 0x55595e, { roughness: 0.7, metalness: 0.4 } ), [ 2.44, 0.15, deckLength ], [ 0, 1.15, deckFront + deckLength / 2 ] );
	for ( const side of [ - 1, 1 ] ) box( g, DARK(), [ 0.05, 0.25, deckLength ], [ side * 1.22, 1.05, deckFront + deckLength / 2 ] );
	for ( const x of [ - 1.05, 1.05 ] ) box( g, RED_LAMP(), [ 0.16, 0.1, 0.04 ], [ x, 1.0, back + 0.02 ] );
	for ( const side of [ - 1, 1 ] ) box( g, DARK(), [ 0.6, 0.06, 1.9 ], [ side * 0.95, 1.3, ( tandem[ 0 ] + tandem[ 1 ] ) / 2 ] );

	// Hood, grille, bumper, fenders and cab.
	box( g, truck, [ 1.25, 1.0, 2.2 ], [ 0, 1.15, front + 1.2 ] );
	box( g, BRIGHT(), [ 1.0, 0.85, 0.05 ], [ 0, 1.2, front + 0.08 ] );
	box( g, BRIGHT(), [ 2.5, 0.35, 0.22 ], [ 0, 0.5, front + 0.16 ] );
	for ( const x of [ - 0.95, 0.95 ] ) box( g, mat( 0xfff3c9, { emissive: 0x6b6040 } ), [ 0.22, 0.14, 0.04 ], [ x, 1.3, front + 0.08 ] );
	for ( const side of [ - 1, 1 ] ) box( g, truck, [ 0.6, 0.12, 1.3 ], [ side * 0.95, 1.12, front + 1.6 ] );
	cabin( g, truck, [ 2.3, 1.9, 1.8 ], [ 0, 1.25, front + 3.2 ], { sill: 0.35, rearGlass: false } );
	for ( const side of [ - 1, 1 ] ) box( g, DARK(), [ 0.04, 0.3, 0.2 ], [ side * 1.3, 2.4, front + 2.4 ] );
	cylinder( g, AMBER_LAMP(), 0.07, 0.12, [ 0, 3.15, front + 3.2 ], 10 );

	// The crane behind the cab: pedestal and outrigger box, slewing ring, turret with the
	// operator's stand-up station on the right, and the rear stabilisers.
	const turretZ = front + 4.85;
	box( g, crane, [ 2.4, 0.55, 0.9 ], [ 0, 0.75, turretZ ] );
	box( g, crane, [ 1.5, 0.45, 1.1 ], [ 0, 1.3, turretZ ] );
	cylinder( g, DARK(), 0.62, 0.18, [ 0, 1.75, turretZ ], 22 );
	box( g, crane, [ 1.25, 0.85, 1.7 ], [ 0, 1.93, turretZ + 0.15 ] );
	box( g, DARK(), [ 0.5, 1.0, 0.5 ], [ 0.95, 1.3, turretZ + 0.9 ] );
	for ( const side of [ - 1, 1 ] ) box( g, crane, [ 0.3, 0.45, 0.6 ], [ side * 0.75, 0.75, back - 0.4 ] );
	if ( working ) for ( const side of [ - 1, 1 ] ) {

		outrigger( g, crane, [ side * 1.2, 1.02, turretZ ], { out: side * ( 6.7 / 2 - 1.2 ), pad: 0.55, beam: [ 0.26, 0.3 ] } );
		outrigger( g, crane, [ side * 0.75, 0.97, back - 0.4 ], { out: side * ( 5.5 / 2 - 0.75 ), pad: 0.5, beam: [ 0.24, 0.28 ] } );

	}

	const foot = [ 0, 2.9, turretZ - 0.55 ];
	const size = [ 0.6, 0.85 ];
	across( g, STEEL(), 0.16, 0.75, foot, 12 );
	if ( working ) {

		const dir = boomDirection( 70, true );
		const head = telescopicBoom( g, crane, foot, along( foot, dir, 127 * FT ), { sections: 5, size } );
		ram( g, 0.16, [ 0, 2.2, turretZ + 0.7 ], along( foot, dir, 6.0 ) );
		hoistLine( g, head, 9, 0.7, CRANE_YELLOW );

	} else {

		// Retracted (about 34 ft), level along the deck on a rest near the back.
		const dir = boomDirection( 0, true );
		const head = telescopicBoom( g, crane, foot, along( foot, dir, 34 * FT ), { sections: 1, size } );
		ram( g, 0.16, [ 0, 2.2, turretZ + 0.7 ], along( foot, dir, 2.6 ) );
		box( g, crane, [ 0.5, foot[ 1 ] - size[ 1 ] / 2 - 1.3, 0.25 ], [ 0, 1.3, back - 1.6 ] );
		hoistLine( g, head, head.y - 0.2, 0.7, CRANE_YELLOW );

	}

	return parts.build();

}

// --- crawler cranes --------------------------------------------------------------------------

// A 100 t (110 US ton) lattice crawler crane with 150 ft of boom at 72°, on tracks set out 19 ft
// wide, the hook a few metres off the ground.
function crawler100() {

	const parts = new Parts();
	const track = { length: 7.4, width: 5.8, shoe: 0.9, height: 1.15 };
	const tip = crawlerCrane( parts, { track, boom: 150 * FT, angle: 72 * DEG, half: [ 0.75, 0.75 ] } );
	for ( const dx of [ - 0.15, 0.15 ] ) parts.rod( BLACK(), [ dx, tip.y, tip.z ], [ dx, 8.2, tip.z ], 0.022, 5 );
	bigHookBlock( parts, [ 0, 8.2, tip.z ], 0.8 );
	return parts.build();

}

// A 300 t (330 US ton) lattice crawler crane in luffing jib configuration: 200 ft of main boom at
// 85° and a 140 ft luffing jib at 40°, held by the jib struts at the boom head and their pendants,
// the hook hanging from the jib head. Tracks 31 ft long, set out 25 ft wide.
function crawler300() {

	const parts = new Parts();
	const track = { length: 9.5, width: 7.6, shoe: 1.2, height: 1.35 };
	const boom = 200 * FT;
	const angle = 85 * DEG;
	crawlerCrane( parts, { track, boom, angle, half: [ 1.05, 1.05 ] } );

	// Where crawlerCrane puts the boom foot and so the boom head (its sizes scale with the tracks).
	const k = track.length / 7.7;
	const top = track.height + 0.35 + 0.5;
	const foot = new Vector3( 0, top + 0.6, - 2.0 * k );
	const head = foot.clone().addScaledVector( new Vector3( 0, Math.sin( angle ), - Math.cos( angle ) ), boom );

	// The luffing jib from the boom head forward, a narrower lattice of the same build.
	const jibAngle = 40 * DEG;
	const jib = 140 * FT;
	const jibAt = latticeBoom( parts, LATTICE_YELLOW(), head, jibAngle, jib, [ 0.7, 0.7 ], 0.07 );
	const jibHead = new Vector3( ...jibAt( jib, 0, 0 ) );
	parts.block( LATTICE_YELLOW(), [ 1.1, 0.9, 1.0 ], jibHead.toArray(), [ jibAngle - Math.PI / 2, 0, 0 ] );
	const sheave = jibHead.clone().add( new Vector3( 0, - 0.2, - 0.6 ) );
	parts.rod( DARK(), [ - 0.4, sheave.y, sheave.z ], [ 0.4, sheave.y, sheave.z ], 0.45, 16 );

	// Jib struts at the boom head: the main strut back over the boom, the jib strut forward, both
	// A-frames; pendants from the jib strut to the jib head and from the main strut back down to
	// the boom butt, and the luffing ropes between the struts.
	const backStrut = head.clone().add( new Vector3( 0, 7.5, 5.0 ) );
	const jibStrut = head.clone().add( new Vector3( 0, 8.0, - 4.5 ) );
	for ( const x of [ - 0.9, 0.9 ] ) {

		parts.rod( LATTICE_YELLOW(), [ x, head.y, head.z ], [ x * 0.3, backStrut.y, backStrut.z ], 0.13, 8 );
		parts.rod( LATTICE_YELLOW(), [ x, head.y, head.z ], [ x * 0.3, jibStrut.y, jibStrut.z ], 0.13, 8 );
		parts.rod( BRIGHT(), [ x * 0.3, jibStrut.y, jibStrut.z ], jibAt( jib - 0.6, x * 0.6, 0.7 ), 0.045, 6 );
		parts.rod( BRIGHT(), [ x * 0.3, backStrut.y, backStrut.z ], [ x * 0.8, foot.y + 6, foot.z + 1.0 ], 0.045, 6 );

	}

	for ( const x of [ - 0.2, 0.2 ] ) parts.rod( BRIGHT(), [ x, backStrut.y, backStrut.z ], [ x, jibStrut.y, jibStrut.z ], 0.03, 5 );
	for ( const dx of [ - 0.15, 0.15 ] ) parts.rod( BLACK(), [ dx, sheave.y - 0.45, sheave.z ], [ dx, 14, sheave.z ], 0.024, 5 );
	bigHookBlock( parts, [ 0, 14, sheave.z ], 1.1 );
	return parts.build();

}

// --- all-terrain crane -----------------------------------------------------------------------

// A 300 t (350 US ton) six-axle all-terrain crane set up for a heavy lift: outriggers set 30 ft
// square, 100 t of counterweight, the 7-section boom out to 61 m (200 ft) at 75°, guyed by the
// superlift: two masts spread in a Y on the base section, ropes over their tops to the boom head
// and back down to the base section, tensioned by winches on the masts.
function allTerrain300() {

	const parts = new Parts();
	const g = into( parts );
	const carrier = paint( CRANE_YELLOW );
	const upper = paint( CRANE_YELLOW );
	const length = 17.4;
	const width = 3.0;
	const r = 0.8;
	const front = - length / 2;
	const axles = [ - 6.6, - 4.95, - 3.3, 1.9, 3.55, 5.2 ];

	// Carrier: frame, decks over the tyres, six axles, bumpers, the low driver's cab on the left
	// front and the outrigger boxes behind the front axles and at the back.
	box( g, DARK(), [ 1.3, 1.0, length - 0.6 ], [ 0, 0.75, 0 ] );
	for ( const side of [ - 1, 1 ] ) box( g, carrier, [ 0.75, 0.12, length - 2.4 ], [ side * ( width / 2 - 0.375 ), 2 * r + 0.06, 0.3 ] );
	box( g, carrier, [ 1.5, 0.12, length - 2.4 ], [ 0, 1.75, 0.3 ] );
	for ( const z of axles ) {

		across( g, DARK(), 0.1, width - 1.2, [ 0, r, z ], 10 );
		for ( const side of [ - 1, 1 ] ) wheel( g, r, 0.58, [ side * ( width / 2 - 0.29 ), r, z ] );

	}

	for ( const end of [ - 1, 1 ] ) box( g, carrier, [ width, 0.5, 0.35 ], [ 0, 0.6, end * ( length / 2 - 0.18 ) ] );
	for ( const x of [ - 1.2, 1.2 ] ) box( g, RED_LAMP(), [ 0.2, 0.12, 0.04 ], [ x, 0.8, length / 2 + 0.01 ] );
	cabin( g, carrier, [ 1.3, 1.6, 1.9 ], [ - 0.82, 1.15, front + 1.2 ], { sill: 0.3 } );
	box( g, carrier, [ 1.4, 1.2, 1.9 ], [ 0.75, 1.15, front + 1.2 ] );
	const beams = [ - 1.35, length / 2 - 0.9 ];
	for ( const z of beams ) box( g, carrier, [ width, 0.6, 0.8 ], [ 0, 0.9, z ] );
	for ( const side of [ - 1, 1 ] ) for ( const z of beams ) outrigger( g, carrier, [ side * width / 2, 1.2, z ], { out: side * ( 9.2 - width ) / 2, pad: 0.9, beam: [ 0.42, 0.45 ] } );

	// Superstructure: slewing ring, frame, the counterweight stack, the hoist winches and the cab.
	const slew = 1.2;
	const ring = 2 * r + 0.12;
	const base = ring + 0.35;
	cylinder( g, DARK(), 1.4, 0.35, [ 0, ring, slew ], 28 );
	box( g, upper, [ 2.6, 1.3, 6.4 ], [ 0.2, base, slew + 1.6 ] );
	for ( let i = 0; i < 6; i ++ ) box( g, i % 2 ? upper : DARK(), [ 3.6, 0.42, 1.9 ], [ 0, base + 0.2 + i * 0.42, slew + 5.0 ] );
	across( g, DARK(), 0.45, 1.3, [ 0.2, base + 1.75, slew + 2.6 ], 18 );
	across( g, DARK(), 0.42, 1.3, [ 0.2, base + 1.75, slew + 3.7 ], 18 );
	cabin( g, upper, [ 0.95, 1.8, 2.0 ], [ - 1.4, base, slew - 1.0 ], { sill: 0.35 } );

	// Boom: foot pin at the front of the upper, 7 sections out to 61 m at 75°, the lift cylinder.
	const foot = [ 0.2, base + 1.55, slew + 0.8 ];
	const size = [ 1.35, 1.85 ];
	const dir = boomDirection( 75 );
	const boom = 200 * FT;
	const end = along( foot, dir, boom );
	const head = telescopicBoom( g, upper, foot, end, { sections: 7, size } );
	ram( g, 0.32, [ 0.2, base + 0.3, slew - 2.4 ], along( foot, dir, 10 ) );

	// Superlift: masts from a frame on the base section, 12 m long, spread 25° each side of the
	// boom's back; guy ropes from their tops to the boom head and back to the base section.
	const back = new Vector3( 0, Math.cos( 75 * DEG ), Math.sin( 75 * DEG ) );
	const mount = along( foot, dir, 5.5 ).addScaledVector( back, size[ 1 ] / 2 );
	box( g, DARK(), [ 1.8, 0.6, 1.2 ], [ mount.x, mount.y - 0.3, mount.z ] );
	for ( const side of [ - 1, 1 ] ) {

		const out = back.clone().multiplyScalar( Math.cos( 25 * DEG ) ).add( new Vector3( side * Math.sin( 25 * DEG ), 0, 0 ) );
		const tipOf = mount.clone().addScaledVector( out, 12 );
		beam( g, upper, [ 0.5, 0.5 ], mount.clone().add( new Vector3( side * 0.5, 0, 0 ) ), tipOf );
		across( g, DARK(), 0.35, 0.5, mount.clone().addScaledVector( out, 2.5 ).add( new Vector3( side * 0.5, 0, 0 ) ).toArray(), 14 );
		rod( g, BRIGHT(), 0.035, tipOf, along( foot, dir, boom - 1.0 ).add( new Vector3( side * 0.4, 0, 0 ) ), 6 );
		rod( g, BRIGHT(), 0.035, tipOf, along( foot, dir, 1.2 ).addScaledVector( back, size[ 1 ] / 2 ).add( new Vector3( side * 0.5, 0, 0 ) ), 6 );

	}

	hoistLine( g, head, 18, 1.5 );
	return parts.build();

}

// --- self-erecting tower crane ---------------------------------------------------------------

// A self-erecting tower crane of the 30 m jib class that folds up on its own axles. Erected: a
// cross-shaped base on four legs set on pads 4.5 m apart, the slewing platform on it with the
// ballast blocks at the back, a telescoped lattice mast pivoted at its front, the jib level at
// 20 m under the hook with its tie bars from the strut on the mast head, the rear tie from there
// back down to the ballast, and the trolley halfway out. Folded: legs in, the mast and jib laid
// along the platform on a front and a rear road axle, the drawbar on.
function selfErectingCrane( erected ) {

	const parts = new Parts();
	const g = into( parts );
	const crane = paint( CRANE_YELLOW );
	const legs = 4.5;
	const ring = erected ? 1.0 : 1.2;

	// Base: the chassis frame, legs and jacks or road axles.
	box( g, DARK(), [ 2.0, 0.5, 2.0 ], [ 0, ring - 0.5, 0 ] );
	if ( erected ) {

		for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) {

			const end = [ sx * legs / 2, ring - 0.3, sz * legs / 2 ];
			beam( g, crane, [ 0.3, 0.35 ], [ sx * 0.6, ring - 0.3, sz * 0.6 ], end );
			cylinder( g, STEEL(), 0.07, ring - 0.35, [ end[ 0 ], 0.08, end[ 2 ] ], 10 );
			cylinder( g, DARK(), 0.3, 0.08, [ end[ 0 ], 0, end[ 2 ] ], 16 );

		}

	} else {

		box( g, crane, [ 1.7, 0.45, 9.0 ], [ 0, ring - 0.75, 0.6 ] );
		for ( const z of [ - 2.6, 4.2 ] ) {

			across( g, DARK(), 0.08, 2.0, [ 0, 0.45, z ], 8 );
			for ( const side of [ - 1, 1 ] ) wheel( g, 0.45, 0.32, [ side * 1.04, 0.45, z ] );

		}

		for ( const x of [ - 0.5, 0.5 ] ) rod( g, crane, 0.06, [ x, 0.55, - 3.7 ], [ 0, 0.5, - 5.6 ], 8 );
		cylinder( g, DARK(), 0.09, 0.15, [ 0, 0.45, - 5.65 ], 10 );

	}

	// The slewing platform on its ring, and the ballast blocks at the back.
	cylinder( g, DARK(), 0.9, 0.2, [ 0, ring, 0 ], 24 );
	const deck = ring + 0.2;
	box( g, crane, [ 2.2, 0.4, 4.2 ], [ 0, deck, 0.8 ] );
	const ballast = erected ? 4 : 0;
	for ( let i = 0; i < ballast; i ++ ) box( g, CONCRETE(), [ 2.1, 0.45, 1.1 ], [ 0, deck + 0.4 + i * 0.47, 2.3 ] );

	const mastWidth = 1.0;
	if ( erected ) {

		// Mast: a lower lattice from the pivot at the platform's front and the upper one telescoped
		// out of it, to the head at 20 m under the hook (the jib's underside a little higher).
		const mastZ = - 0.7;
		const headY = 21.2;
		truss( parts, crane, [ 0, deck + 0.4, mastZ ], [ 0, 11.5, mastZ ], { width: mastWidth, chord: 0.05, lace: 0.022, bay: 1.0 } );
		truss( parts, crane, [ 0, 10.8, mastZ ], [ 0, headY, mastZ ], { width: mastWidth * 0.86, chord: 0.045, lace: 0.02, bay: 0.9 } );
		box( g, crane, [ 1.2, 0.5, 1.2 ], [ 0, headY, mastZ ] );
		// The hoist winch on the platform.
		box( g, DARK(), [ 0.9, 0.9, 1.0 ], [ 0.6, deck + 0.4, 0.6 ] );

		// Jib: a triangular lattice, level, 30 m out from the mast head; a strut up from the head,
		// tie bars from its top to the jib at a third and two thirds of its length and the rear tie
		// down to the ballast.
		const jib = 30;
		const jibY = headY + 0.25;
		const jz = mastZ - 0.6;
		truss( parts, crane, [ 0, jibY + 0.4, jz ], [ 0, jibY + 0.4, jz - jib ], { width: 0.8, depth: 0.8, chord: 0.04, lace: 0.018, bay: 1.0, triangle: true } );
		const strut = [ 0, headY + 3.6, mastZ + 0.2 ];
		for ( const x of [ - 0.45, 0.45 ] ) rod( g, crane, 0.07, [ x, headY + 0.5, mastZ + 0.4 ], strut, 8 );
		for ( const t of [ 11, 22 ] ) rod( g, STEEL(), 0.03, strut, [ 0, jibY + 0.8, jz - t ], 6 );
		rod( g, STEEL(), 0.035, strut, [ 0, deck + 0.4 + ballast * 0.47, 2.3 ], 6 );
		// Trolley halfway out, the hook on its ropes 5 m off the ground.
		const trolley = jz - 15;
		box( g, DARK(), [ 0.9, 0.3, 0.8 ], [ 0, jibY - 0.05, trolley ] );
		hoistLine( g, new Vector3( 0, jibY - 0.05, trolley ), 5, 0.45, CRANE_YELLOW );
		// The operator's remote control box and the electrics cabinet on the platform.
		box( g, mat( 0x9da3a8, { roughness: 0.6, metalness: 0.3 } ), [ 0.6, 0.9, 0.4 ], [ - 0.75, deck + 0.4, 1.0 ] );

	} else {

		// Folded: the mast (both parts nested) along the platform, the jib folded in two with its
		// halves side by side on top, on timber packers.
		const y0 = deck + 0.4 + mastWidth / 2;
		truss( parts, crane, [ 0, y0, 4.9 ], [ 0, y0, - 5.4 ], { width: mastWidth, chord: 0.05, lace: 0.022, bay: 1.0 } );
		box( g, crane, [ 1.2, 1.2, 0.5 ], [ 0, y0 - 0.6, 5.1 ] );
		const jibY = y0 + mastWidth / 2 + 0.1;
		for ( const z of [ - 4.0, 0.5, 4.0 ] ) box( g, TIMBER(), [ 1.9, 0.1, 0.2 ], [ 0, jibY - 0.1, z ] );
		truss( parts, crane, [ - 0.45, jibY + 0.4, 5.1 ], [ - 0.45, jibY + 0.4, - 5.6 ], { width: 0.8, depth: 0.8, chord: 0.04, lace: 0.018, bay: 1.0, triangle: true } );
		truss( parts, crane, [ 0.45, jibY + 0.4, - 5.4 ], [ 0.45, jibY + 0.4, 4.9 ], { width: 0.8, depth: 0.8, chord: 0.04, lace: 0.018, bay: 1.0, triangle: true } );
		for ( const x of [ - 1.05, 1.05 ] ) box( g, RED_LAMP(), [ 0.15, 0.1, 0.04 ], [ x, ring - 0.6, 5.12 ] );

	}

	return parts.build();

}

// --- hammerhead tower crane parts on the ground ------------------------------------------------

// Three 2 m square lattice mast sections of a hammerhead tower crane, 5.8 m long, laid side by side
// on timbers waiting to go up: angle chords, lacing on each face, and the connection lugs at the
// chord ends.
function mastSections() {

	const parts = new Parts();
	const crane = paint( CRANE_YELLOW );
	const length = 5.8;
	const size = 2.0;
	const gap = 0.4;
	const under = 0.15;
	for ( const z of [ - 1.8, 1.8 ] ) parts.box( TIMBER(), [ 3 * size + 2 * gap + 0.4, under, 0.2 ], [ 0, 0, z ] );
	for ( let i = 0; i < 3; i ++ ) {

		const x = ( i - 1 ) * ( size + gap );
		const y = under + size / 2;
		truss( parts, crane, [ x, y, - length / 2 ], [ x, y, length / 2 ], { width: size - 0.12, chord: 0.06, lace: 0.035, bay: 1.45 } );
		for ( const sx of [ - 1, 1 ] ) for ( const sy of [ - 1, 1 ] ) for ( const z of [ - length / 2, length / 2 ] ) {

			parts.box( DARK(), [ 0.16, 0.16, 0.12 ], [ x + sx * ( size / 2 - 0.08 ), y + sy * ( size / 2 - 0.08 ) - 0.08, z ] );

		}

	}

	return parts.build();

}

// Six 5.4 t concrete counter-jib ballast blocks of a hammerhead tower crane, 2.8 × 2 × 0.4 m, laid
// flat in a stack on timbers with spacers between, their lifting eyes on top.
function counterweightStack() {

	const parts = new Parts();
	const size = [ 2.0, 0.4, 2.8 ];
	let y = 0;
	for ( let i = 0; i < 6; i ++ ) {

		const spacer = i === 0 ? 0.15 : 0.1;
		for ( const z of [ - 0.9, 0.9 ] ) parts.box( TIMBER(), [ size[ 0 ] + 0.2, spacer, 0.15 ], [ 0, y, z ] );
		y += spacer;
		parts.box( CONCRETE(), size, [ 0, y, 0 ] );
		// Steel edge angles and two cast-in lifting eyes.
		for ( const z of [ - 1, 1 ] ) parts.box( STEEL(), [ size[ 0 ] + 0.01, 0.05, 0.05 ], [ 0, y + size[ 1 ] - 0.05, z * ( size[ 2 ] / 2 - 0.02 ) ] );
		y += size[ 1 ];
		for ( const z of [ - 0.45, 0.45 ] ) parts.add( STEEL(), new TorusGeometry( 0.05, 0.014, 5, 10, Math.PI ), _m.makeTranslation( 0, y - 0.01, z ) );

	}

	return parts.build();

}

// --- aerial work platforms ---------------------------------------------------------------------

// A work platform (basket) with its floor top at y, centred on (x, z), [ width across, depth ]:
// the floor, guardrails, and the control box on the rail facing the boom.
function basket( parts, [ x, y, z ], [ width, depth ], frame = STEEL() ) {

	parts.box( frame, [ width, 0.08, depth ], [ x, y - 0.08, z ] );
	guardrail( parts, frame, [ x - width / 2, x + width / 2 ], [ z - depth / 2, z + depth / 2 ], y, { post: 0.022 } );
	parts.box( DARK(), [ 0.45, 0.3, 0.12 ], [ x, y + 0.82, z + depth / 2 - 0.08 ] );

}

// 60 ft and 80 ft straight telescopic boom lifts (platform heights 18.3 and 24.4 m): sizes from
// the spec sheets for the class, the boom retracted (`retracted`, base section) and the platform
// 8 ft wide.
const TELE_60 = { width: 2.49, wheelbase: 2.44, r: 0.5, tyre: 0.42, sections: 3, size: [ 0.5, 0.55 ], retracted: 6.1, height: 60 * FT, angle: 72 };
const TELE_80 = { width: 2.49, wheelbase: 2.84, r: 0.55, tyre: 0.45, sections: 4, size: [ 0.6, 0.66 ], retracted: 8.4, height: 80 * FT, angle: 72 };

// A straight telescopic boom lift: four big tyres on a narrow chassis, the turntable with its
// engine cover and counterweight at the back, and the boom pivoted at the back of the turntable
// with a short jib and the platform at its tip. Stowed: the boom level over the front, the
// platform low in front of the chassis. Raised: the boom out at `angle` so the platform floor is
// at the rated height.
function telescopicLift( spec, raised ) {

	const parts = new Parts();
	const g = into( parts );
	const body = paint( LIFT_ORANGE );
	const { width, wheelbase, r, tyre, sections, size, retracted, height, angle } = spec;

	// Chassis, axles and wheels.
	const top = r * 0.5 + 0.6;
	box( g, DARK(), [ width - 2 * tyre - 0.1, 0.6, wheelbase + 2 * r ], [ 0, r * 0.5, 0 ] );
	for ( const z of [ - wheelbase / 2, wheelbase / 2 ] ) {

		across( g, DARK(), 0.09, width - 2 * tyre, [ 0, r, z ], 8 );
		for ( const side of [ - 1, 1 ] ) wheel( g, r, tyre, [ side * ( width / 2 - tyre / 2 ), r, z ], { rim: paint( LIFT_ORANGE ) } );

	}

	// Turntable: the slewing ring, the engine and tank covers either side, counterweight behind.
	cylinder( g, DARK(), 0.7, 0.1, [ 0, top, 0 ], 22 );
	const deck = top + 0.1;
	box( g, body, [ 1.9, 0.9, 2.2 ], [ 0, deck, 0.25 ] );
	box( g, DARK(), [ 2.2, 0.95, 0.7 ], [ 0, deck, 1.55 ] );
	for ( const side of [ - 1, 1 ] ) box( g, DARK(), [ 0.03, 0.4, 1.2 ], [ side * 0.96, deck + 0.3, 0.2 ] );
	// The boom's pivot on a riser at the back of the turntable.
	const foot = [ 0, deck + 0.9 + size[ 1 ] / 2 + 0.05, 0.9 ];
	box( g, body, [ size[ 0 ] + 0.2, size[ 1 ] / 2 + 0.05, 0.6 ], [ 0, deck + 0.9, foot[ 2 ] ] );
	across( g, STEEL(), 0.1, size[ 0 ] + 0.3, foot, 10 );

	if ( raised ) {

		// Out at `angle` so the platform floor (0.3 m below the jib) is at the rated height.
		const dir = boomDirection( angle );
		const length = ( height + 0.3 - foot[ 1 ] ) / Math.sin( angle * DEG );
		const tip = telescopicBoom( g, body, foot, along( foot, dir, length ), { sections, size, inner: paint( 0xd8dadc ), head: false } );
		ram( g, 0.09, [ 0, deck + 0.4, - 0.6 ], along( foot, dir, 2.6 ) );
		// Jib, level, from the tip forward to the rotator and the platform.
		const jibEnd = [ 0, tip.y, tip.z - 1.2 ];
		beam( g, body, [ 0.22, 0.25 ], tip, jibEnd );
		box( g, DARK(), [ 0.3, 0.45, 0.25 ], [ 0, tip.y - 0.35, jibEnd[ 2 ] ] );
		basket( parts, [ 0, tip.y - 0.3, jibEnd[ 2 ] - 0.13 - 0.46 ], [ 8 * FT, 3 * FT ] );

	} else {

		const dir = boomDirection( 0 );
		const tip = telescopicBoom( g, body, foot, along( foot, dir, retracted ), { sections: 1, size, head: false } );
		ram( g, 0.09, [ 0, deck + 0.4, - 0.6 ], along( foot, dir, 1.6 ) );
		// The jib folded down from the tip, the platform low in front of the chassis.
		const floor = 0.95;
		const jibEnd = [ 0, floor + 0.35, tip.z - 0.45 ];
		beam( g, body, [ 0.22, 0.25 ], tip, jibEnd );
		box( g, DARK(), [ 0.3, 0.45, 0.25 ], [ 0, floor - 0.05, jibEnd[ 2 ] ] );
		basket( parts, [ 0, floor, jibEnd[ 2 ] - 0.13 - 0.46 ], [ 8 * FT, 3 * FT ] );

	}

	return parts.build();

}

// A 35 ft towable (trailer mounted) boom lift set up: a single-axle trailer with its drawbar,
// four outriggers set on pads, the turntable, a riser boom nearly upright and the telescopic upper
// boom out to put the platform floor at 34 ft (10.4 m), 20 ft out in front.
function towableLift() {

	const parts = new Parts();
	const g = into( parts );
	const body = paint( LIFT_BLUE );

	// Trailer: frame, axle and wheels with fenders, drawbar and coupler.
	box( g, DARK(), [ 0.9, 0.3, 4.0 ], [ 0, 0.45, 0.4 ] );
	across( g, DARK(), 0.05, 1.6, [ 0, 0.33, 0.6 ], 8 );
	for ( const side of [ - 1, 1 ] ) {

		wheel( g, 0.33, 0.2, [ side * 0.82, 0.33, 0.6 ] );
		box( g, body, [ 0.26, 0.04, 0.85 ], [ side * 0.82, 0.72, 0.6 ] );
		rod( g, DARK(), 0.045, [ side * 0.42, 0.6, - 1.6 ], [ 0, 0.55, - 3.0 ], 8 );

	}

	box( g, DARK(), [ 0.12, 0.12, 0.35 ], [ 0, 0.48, - 3.1 ] );
	cylinder( g, STEEL(), 0.03, 0.45, [ 0, 0.1, - 2.7 ], 8 );

	// Outriggers: arms from the frame's corners out and down to jacks on pads.
	for ( const sx of [ - 1, 1 ] ) for ( const [ z0, z1 ] of [ [ - 1.3, - 2.0 ], [ 2.2, 2.6 ] ] ) {

		const foot = [ sx * 1.9, 0.75, z1 ];
		beam( g, body, [ 0.12, 0.14 ], [ sx * 0.45, 0.65, z0 ], foot );
		cylinder( g, DARK(), 0.05, 0.75, [ foot[ 0 ], 0.06, z1 ], 10 );
		cylinder( g, BLACK(), 0.17, 0.06, [ foot[ 0 ], 0, z1 ], 14 );

	}

	// Turntable with the battery and motor box at its back.
	cylinder( g, DARK(), 0.4, 0.1, [ 0, 0.75, 0.4 ], 18 );
	box( g, body, [ 0.95, 0.65, 1.25 ], [ 0, 0.85, 0.5 ] );
	const pivot = [ 0, 1.35, 0.75 ];
	across( g, STEEL(), 0.07, 0.4, pivot, 10 );

	// Riser boom nearly upright, then the telescopic upper boom forward to the platform.
	const riserTop = along( pivot, boomDirection( 78 ), 4.3 );
	beam( g, body, [ 0.22, 0.28 ], pivot, riserTop );
	ram( g, 0.06, [ 0, 1.0, - 0.1 ], along( pivot, boomDirection( 78 ), 1.6 ) );
	across( g, STEEL(), 0.07, 0.3, riserTop.toArray(), 10 );
	const floor = 34 * FT;
	const upperAngle = Math.asin( ( floor + 0.3 - riserTop.y ) / 6.6 ) / DEG;
	const tip = telescopicBoom( g, body, riserTop, along( riserTop, boomDirection( upperAngle ), 6.6 ), { sections: 2, size: [ 0.2, 0.26 ], inner: paint( 0xd8dadc ), head: false } );
	box( g, DARK(), [ 0.2, 0.4, 0.2 ], [ 0, tip.y - 0.35, tip.z - 0.12 ] );
	basket( parts, [ 0, floor, tip.z - 0.22 - 0.38 ], [ 44 * IN, 30 * IN ] );
	return parts.build();

}

// A 40 ft rough-terrain scissor lift (69 in wide) raised to its full 40 ft platform height on its
// four levelling outriggers: the 4WD chassis on lugged tyres, seven levels of scissor arms, and the
// deck with its roll-out extension out at the front.
function roughTerrainScissor() {

	const parts = new Parts();
	const g = into( parts );
	const body = paint( LIFT_BLUE );
	const arms = paint( 0xe6e7e8 );
	const width = 69 * IN;
	const length = 4.6;
	const r = 0.4;

	// Chassis, wheels, the engine and hydraulic trays on the sides.
	box( g, body, [ width - 0.5, 0.6, length - 0.2 ], [ 0, 0.4, 0 ] );
	for ( const z of [ - 1.55, 1.55 ] ) for ( const side of [ - 1, 1 ] ) wheel( g, r, 0.3, [ side * ( width / 2 - 0.15 ), r, z ], { rim: paint( 0xe6e7e8 ) } );
	for ( const side of [ - 1, 1 ] ) box( g, DARK(), [ 0.15, 0.45, 1.8 ], [ side * ( width / 2 - 0.3 ), 0.45, 0 ] );

	// Outriggers: a jack at each corner down to its pad.
	for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) {

		box( g, body, [ 0.22, 0.5, 0.22 ], [ sx * ( width / 2 - 0.25 ), 0.55, sz * ( length / 2 - 0.05 ) ] );
		cylinder( g, BRIGHT(), 0.05, 0.55, [ sx * ( width / 2 - 0.25 ), 0.05, sz * ( length / 2 - 0.05 ) ], 10 );
		cylinder( g, DARK(), 0.16, 0.05, [ sx * ( width / 2 - 0.25 ), 0, sz * ( length / 2 - 0.05 ) ], 14 );

	}

	// Scissor stack: seven levels of crossed arms on each side, cross tubes at the pins.
	const floor = 40 * FT;
	const deckDepth = 0.25;
	const y0 = 1.05;
	const y1 = floor - deckDepth;
	const levels = 7;
	const rise = ( y1 - y0 ) / levels;
	const span = 1.7;
	box( g, DARK(), [ width - 0.6, 0.05, 3.6 ], [ 0, 1.0, 0 ] );
	for ( let i = 0; i < levels; i ++ ) {

		const a = y0 + i * rise;
		const b = a + rise;
		for ( const x of [ - 0.62, 0.62 ] ) {

			beam( g, arms, [ 0.08, 0.2 ], [ x, a, - span ], [ x, b, span ] );
			beam( g, arms, [ 0.08, 0.2 ], [ x + Math.sign( x ) * 0.09, a, span ], [ x + Math.sign( x ) * 0.09, b, - span ] );

		}

		for ( const [ y, z ] of [ [ a, - span ], [ a, span ], [ ( a + b ) / 2, 0 ] ] ) across( g, DARK(), 0.045, 1.42, [ 0, y, z ], 8 );

	}

	across( g, DARK(), 0.045, 1.42, [ 0, y1, - span ], 8 );
	across( g, DARK(), 0.045, 1.42, [ 0, y1, span ], 8 );
	ram( g, 0.07, [ 0, y0 + 0.1, - 0.8 ], [ 0, y0 + rise * 1.5, 0.4 ] );

	// Deck, the roll-out extension at the front and the guardrails round both.
	const deckLength = 4.3;
	box( g, body, [ 1.6, deckDepth, deckLength ], [ 0, y1, 0.05 ] );
	const extension = 1.5;
	box( g, STEEL(), [ 1.5, 0.08, extension + 0.3 ], [ 0, floor - 0.08, - deckLength / 2 + 0.05 - extension / 2 + 0.15 ] );
	guardrail( parts, STEEL(), [ - 0.8, 0.8 ], [ - deckLength / 2 + 0.05 - extension, deckLength / 2 + 0.05 ], floor, { post: 0.024 } );
	box( g, DARK(), [ 0.45, 0.3, 0.12 ], [ 0.3, floor + 0.82, - deckLength / 2 + 0.05 - extension + 0.08 ] );
	return parts.build();

}

// A 20 ft vertical mast lift (one-person push-around/drive class): a small base on castors and
// drive wheels, the nested aluminium mast at the back, raised, and the platform in front of it
// with its floor at 20 ft.
function mastLift() {

	const parts = new Parts();
	const g = into( parts );
	const body = paint( LIFT_BLUE );
	const width = 0.76;
	const length = 1.37;

	box( g, body, [ width, 0.55, length ], [ 0, 0.12, 0 ] );
	box( g, DARK(), [ width - 0.1, 0.05, length - 0.1 ], [ 0, 0.67, 0 ] );
	for ( const sx of [ - 1, 1 ] ) for ( const z of [ - 0.5, 0.5 ] ) wheel( g, 0.13, 0.1, [ sx * ( width / 2 - 0.06 ), 0.13, z ], { rim: paint( 0xe6e7e8 ) } );
	// Pothole guards down at the sides.
	for ( const side of [ - 1, 1 ] ) box( g, DARK(), [ 0.03, 0.08, 0.8 ], [ side * ( width / 2 + 0.02 ), 0.03, 0 ] );

	// Mast: five nested sections, each out of the one below and a little smaller.
	const floor = 20 * FT;
	const mastZ = 0.42;
	const sectionHigh = ( floor + 0.4 - 0.67 ) / 4.6;
	for ( let i = 0; i < 5; i ++ ) {

		const k = 0.92 ** i;
		const bottom = 0.67 + i * sectionHigh * 0.9;
		box( g, ALUMINIUM(), [ 0.34 * k, sectionHigh, 0.24 * k ], [ 0, bottom, mastZ ] );

	}

	// Platform: carried on a bracket from the top section, cantilevered in front of the mast.
	const depth = 0.66;
	const pz = mastZ - 0.14 - depth / 2;
	box( g, DARK(), [ 0.3, 0.35, 0.18 ], [ 0, floor - 0.3, mastZ - 0.2 ] );
	basket( parts, [ 0, floor, pz ], [ width, depth ] );
	return parts.build();

}

// A 50 ft tracked spider (atrium) lift set up: rubber tracks under a narrow chassis that fits a
// doorway, four legs folded out and set on their pads, the turntable, an articulating lower boom,
// the telescopic upper boom and a jib to the platform at 50 ft.
function spiderLift() {

	const parts = new Parts();
	const g = into( parts );
	const body = paint( LIFT_ORANGE );
	const boom = paint( 0xe6e7e8 );

	// Tracks and chassis.
	for ( const x of [ - 0.29, 0.29 ] ) {

		box( g, RUBBER(), [ 0.2, 0.32, 1.9 ], [ x, 0, 0 ] );
		for ( const z of [ - 0.95, 0.95 ] ) across( g, RUBBER(), 0.16, 0.2, [ x, 0.16, z ], 14 );

	}

	box( g, body, [ 0.78, 0.45, 2.6 ], [ 0, 0.32, 0 ] );
	for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) {

		const hinge = [ sx * 0.39, 0.7, sz * 1.1 ];
		const knee = [ sx * 1.9, 1.0, sz * 1.9 ];
		beam( g, body, [ 0.11, 0.14 ], hinge, knee );
		cylinder( g, DARK(), 0.05, 0.98, [ knee[ 0 ], 0.04, knee[ 2 ] ], 10 );
		cylinder( g, DARK(), 0.17, 0.04, [ knee[ 0 ], 0, knee[ 2 ] ], 16 );

	}

	// Turntable and the booms.
	cylinder( g, DARK(), 0.3, 0.08, [ 0, 0.77, 0 ], 18 );
	box( g, body, [ 0.7, 0.45, 1.1 ], [ 0, 0.85, 0.15 ] );
	const pivot = [ 0, 1.15, 0.5 ];
	const lowerTop = along( pivot, boomDirection( 76 ), 5.2 );
	beam( g, boom, [ 0.2, 0.26 ], pivot, lowerTop );
	ram( g, 0.05, [ 0, 0.95, - 0.2 ], along( pivot, boomDirection( 76 ), 1.6 ) );
	across( g, STEEL(), 0.07, 0.3, lowerTop.toArray(), 10 );
	const floor = 50 * FT;
	const upperAngle = 62;
	const upperLength = ( floor + 0.3 - lowerTop.y ) / Math.sin( upperAngle * DEG );
	const tip = telescopicBoom( g, boom, lowerTop, along( lowerTop, boomDirection( upperAngle ), upperLength ), { sections: 3, size: [ 0.18, 0.22 ], inner: paint( 0xc9ccce ), head: false } );
	const jibEnd = [ 0, tip.y, tip.z - 0.8 ];
	beam( g, boom, [ 0.12, 0.15 ], tip, jibEnd );
	box( g, DARK(), [ 0.2, 0.35, 0.18 ], [ 0, tip.y - 0.3, jibEnd[ 2 ] ] );
	basket( parts, [ 0, floor, jibEnd[ 2 ] - 0.1 - 0.35 ], [ 1.4, 0.7 ], ALUMINIUM() );
	return parts.build();

}

// --- material hoist ----------------------------------------------------------------------------

// A material-only rack and pinion hoist: a 30 m mast of 0.45 m square sections with the rack on
// one face, tied back to the building (behind, +Z) every 9 m; the single 1.5 × 2.5 m mesh car at
// the bottom on its buffers with its drive on the roof and gates at both ends; and the ground
// enclosure round the car with its gate at the front.
function materialHoist() {

	const parts = new Parts();
	const g = into( parts );
	const frame = paint( 0xe9b21a );
	const height = 30;
	const mastX = 1.05;

	// Base frame and buffers, then the mast with its rack.
	box( g, DARK(), [ 2.4, 0.2, 3.0 ], [ 0.2, 0, 0 ] );
	for ( const z of [ - 0.8, 0.8 ] ) cylinder( g, BLACK(), 0.12, 0.25, [ 0, 0.2, z ], 10 );
	truss( parts, GALVANISED_FRAME(), [ mastX, 0.2, 0 ], [ mastX, height, 0 ], { width: 0.45, chord: 0.038, lace: 0.016, bay: 0.5 } );
	box( g, DARK(), [ 0.04, height - 0.4, 0.06 ], [ mastX - 0.26, 0.3, 0 ] );
	for ( let y = 9; y < height; y += 9 ) {

		for ( const dz of [ - 0.2, 0.2 ] ) rod( g, STEEL(), 0.03, [ mastX, y, dz ], [ mastX, y, 2.1 ], 6 );
		box( g, STEEL(), [ 0.4, 0.4, 0.04 ], [ mastX, y - 0.2, 2.12 ] );

	}

	// The car: floor, mesh sides and roof, drive unit, gates up at both ends.
	const car = [ 1.5, 2.0, 2.5 ];
	const floor = 0.45;
	box( g, frame, [ car[ 0 ], 0.12, car[ 2 ] ], [ 0, floor - 0.12, 0 ] );
	for ( const side of [ - 1, 1 ] ) {

		box( g, MESH(), [ 0.02, car[ 1 ], car[ 2 ] ], [ side * car[ 0 ] / 2, floor, 0 ] );
		box( g, frame, [ 0.05, 0.05, car[ 2 ] ], [ side * car[ 0 ] / 2, floor + car[ 1 ], 0 ] );
		box( g, frame, [ 0.05, 0.05, car[ 2 ] ], [ side * car[ 0 ] / 2, floor + 1.0, 0 ] );
		for ( const z of [ - 1, 1 ] ) box( g, frame, [ 0.06, car[ 1 ], 0.06 ], [ side * car[ 0 ] / 2, floor, z * car[ 2 ] / 2 ] );

	}

	box( g, MESH(), [ car[ 0 ], 0.02, car[ 2 ] ], [ 0, floor + car[ 1 ], 0 ] );
	for ( const z of [ - 1, 1 ] ) box( g, frame, [ car[ 0 ], 0.25, 0.05 ], [ 0, floor + car[ 1 ] - 0.25, z * car[ 2 ] / 2 ] );
	box( g, DARK(), [ 0.55, 0.6, 1.0 ], [ 0.55, floor + car[ 1 ], 0 ] );
	box( g, frame, [ 0.35, 1.4, 0.5 ], [ car[ 0 ] / 2 + 0.06, floor + 0.4, 0 ] );

	// Ground enclosure: mesh panels round the front and sides, a gate opening at the front.
	const ex = [ - 1.05, 1.5 ];
	const ez = - 1.65;
	for ( const x of ex ) {

		box( g, MESH(), [ 0.02, 2.0, 2.9 ], [ x, 0.05, - 0.2 ] );
		for ( const z of [ ez, 1.25 ] ) box( g, frame, [ 0.06, 2.05, 0.06 ], [ x, 0, z ] );

	}

	for ( const [ x0, x1 ] of [ [ ex[ 0 ], - 0.85 ], [ 0.85, ex[ 1 ] ] ] ) box( g, MESH(), [ x1 - x0, 2.0, 0.02 ], [ ( x0 + x1 ) / 2, 0.05, ez ] );
	box( g, frame, [ ex[ 1 ] - ex[ 0 ], 0.06, 0.06 ], [ ( ex[ 0 ] + ex[ 1 ] ) / 2, 2.05, ez ] );
	return parts.build();

}

// --- rigging -----------------------------------------------------------------------------------

// One chain link, made once: a torus stretched into a link's long oval.
let chainLink = null;
const CHAIN_WIRE = 0.0065;
const CHAIN_RADIUS = 0.0155;
const CHAIN_STRETCH = 1.68;
function link() {

	if ( ! chainLink ) chainLink = new TorusGeometry( CHAIN_RADIUS, CHAIN_WIRE, 3, 6 ).toNonIndexed();
	return chainLink.clone();

}

// A run of chain on the ground from a towards b (points [ x, z ]), links alternately flat and on
// edge, `count` of them. Returns the end point.
function chain( parts, material, [ ax, az ], [ bx, bz ], count ) {

	const d = new Vector3( bx - ax, 0, bz - az ).normalize();
	const side = new Vector3().crossVectors( d, UP );
	const flatY = new Vector3().crossVectors( UP, d );
	const pitch = 2 * CHAIN_RADIUS * CHAIN_STRETCH - 2 * CHAIN_WIRE;
	const scale = new Vector3( CHAIN_STRETCH, 1, 1 );
	for ( let i = 0; i < count; i ++ ) {

		const flat = i % 2 === 0;
		_m.makeBasis( d, flat ? flatY : UP, flat ? UP : side );
		_m.scale( scale );
		_m.setPosition( ax + d.x * pitch * ( i + 0.5 ), flat ? CHAIN_WIRE : CHAIN_RADIUS + CHAIN_WIRE, az + d.z * pitch * ( i + 0.5 ) );
		parts.add( material, link(), _m );

	}

	return [ ax + d.x * pitch * count, az + d.z * pitch * count ];

}

// A link or ring of round bar lying flat, centred on (x, z), its long axis along `angle` (radians
// from +X), [ inner length, inner width ] and bar diameter.
function flatLink( parts, material, [ x, z ], angle, [ inner, across ], bar, y = bar / 2 ) {

	const r = ( across + bar ) / 2;
	const geometry = new TorusGeometry( r, bar / 2, 6, 16 );
	_m.makeRotationY( - angle ).multiply( new Matrix4().makeRotationX( Math.PI / 2 ) ).multiply( new Matrix4().makeScale( ( inner + bar ) / ( across + bar ), 1, 1 ) );
	_m.setPosition( x, y, z );
	parts.add( material, geometry, _m );

}

// A 4-leg grade 100 chain sling laid out on the ground: the master link and its two sub links in
// the middle, four 10 ft legs of 1/2 in chain out to the corners, each with its latched sling hook.
function chainSling() {

	const parts = new Parts();
	const chainBlue = paint( 0x2f3b52 );
	const steel = STEEL();
	const hookColour = paint( CRANE_YELLOW );

	// Master link along x, sub links either side of it.
	flatLink( parts, steel, [ 0, 0 ], 0, [ 0.27, 0.15 ], 0.032 );
	for ( const sx of [ - 1, 1 ] ) flatLink( parts, steel, [ sx * 0.16, 0 ], Math.PI / 2, [ 0.15, 0.08 ], 0.022, 0.03 );

	// Legs to the four corners, a coupling link at the top of each and the hook at its end.
	for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) {

		const angle = Math.atan2( sz, sx );
		const start = [ sx * 0.16 + Math.cos( angle ) * 0.04, sz * 0.085 + Math.sin( angle ) * 0.04 ];
		flatLink( parts, steel, start, angle, [ 0.06, 0.035 ], 0.016 );
		const from = [ start[ 0 ] + Math.cos( angle ) * 0.05, start[ 1 ] + Math.sin( angle ) * 0.05 ];
		const to = [ from[ 0 ] + Math.cos( angle ), from[ 1 ] + Math.sin( angle ) ];
		const [ ex, ez ] = chain( parts, chainBlue, from, to, Math.round( 10 * FT / ( 2 * CHAIN_RADIUS * CHAIN_STRETCH - 2 * CHAIN_WIRE ) ) );
		// Sling hook lying on its side: the eye, the shank and the curved bowl with its latch.
		const c = Math.cos( angle );
		const s = Math.sin( angle );
		const at = d => [ ex + c * d, ez + s * d ];
		flatLink( parts, hookColour, at( 0.03 ), angle, [ 0.03, 0.025 ], 0.016, 0.02 );
		const shank = at( 0.1 );
		parts.block( hookColour, [ 0.1, 0.035, 0.03 ], [ shank[ 0 ], 0.018, shank[ 1 ] ], [ 0, - angle, 0 ] );
		const bowl = at( 0.19 );
		const hook = new TorusGeometry( 0.045, 0.016, 5, 10, Math.PI * 1.3 );
		_m.makeRotationY( - angle ).multiply( new Matrix4().makeRotationX( Math.PI / 2 ) ).multiply( new Matrix4().makeRotationZ( Math.PI * 0.85 ) );
		_m.setPosition( bowl[ 0 ], 0.017, bowl[ 1 ] );
		parts.add( hookColour, hook, _m );
		parts.block( steel, [ 0.09, 0.006, 0.012 ], [ bowl[ 0 ] - s * 0.04, 0.03, bowl[ 1 ] + c * 0.04 ], [ 0, - angle, 0 ] );

	}

	// A tag on the master link with the rating.
	parts.block( mat( 0xd8c23a, { roughness: 0.5, metalness: 0.4 } ), [ 0.07, 0.004, 0.05 ], [ 0.21, 0.004, - 0.12 ], [ 0, 0.3, 0 ] );
	return parts.build();

}

// A modular spreader frame 20 × 10 ft between pin centres: two long and two short 8 in pipe struts
// between four corner end units (drop links), resting on dunnage, with the four top wire rope
// slings and their shackles laid in from the corners to the master link on the ground inside.
function spreaderFrame() {

	const parts = new Parts();
	const yellow = paint( CRANE_YELLOW );
	const red = paint( 0xc8281e );
	const sling = BRIGHT();
	const L = 20 * FT;
	const W = 10 * FT;
	const pipe = 8.625 * IN / 2;
	const under = 0.15;
	const y = under + 0.3;

	for ( const z of [ - L / 3, L / 3 ] ) parts.box( TIMBER(), [ W + 0.6, under, 0.15 ], [ 0, 0, z ] );
	// Struts between the end units, with their end flanges.
	for ( const sx of [ - 1, 1 ] ) {

		parts.rod( yellow, [ sx * W / 2, y, - L / 2 + 0.25 ], [ sx * W / 2, y, L / 2 - 0.25 ], pipe, 16 );
		for ( const z of [ - L / 2 + 0.27, L / 2 - 0.27 ] ) parts.rod( DARK(), [ sx * W / 2, y, z - 0.02 ], [ sx * W / 2, y, z + 0.02 ], pipe + 0.04, 16 );

	}

	for ( const sz of [ - 1, 1 ] ) parts.rod( yellow, [ - W / 2 + 0.25, y, sz * L / 2 ], [ W / 2 - 0.25, y, sz * L / 2 ], pipe, 16 );

	// End units: a block at each corner with the top lug and its shackle.
	const lug = y + 0.38;
	for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) {

		const [ x, z ] = [ sx * W / 2, sz * L / 2 ];
		parts.box( red, [ 0.36, 0.5, 0.36 ], [ x, under, z ] );
		parts.block( red, [ 0.04, 0.22, 0.2 ], [ x, under + 0.6, z ], [ 0, Math.atan2( sx * L, sz * W ), 0 ] );
		parts.add( STEEL(), new TorusGeometry( 0.07, 0.018, 6, 12, Math.PI * 1.4 ), new Matrix4().makeRotationY( Math.atan2( sx * L, sz * W ) ).setPosition( x, lug + 0.05, z ) );

	}

	// Slings from the shackles inward, falling to the ground and meeting at the master link.
	for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) {

		const [ x, z ] = [ sx * W / 2, sz * L / 2 ];
		parts.path( sling, [ [ x, lug + 0.1, z ], [ x * 0.88, lug + 0.05, z * 0.92 ], [ x * 0.72, 0.4, z * 0.82 ], [ x * 0.6, 0.02, z * 0.72 ], [ x * 0.05, 0.02, z * 0.05 ] ], 0.014, 6 );

	}

	flatLink( parts, STEEL(), [ 0, 0 ], Math.PI / 2, [ 0.35, 0.18 ], 0.04 );
	return parts.build();

}

// Four 10 t proof load water bags filled and standing on the ground, 2 × 2: each a squat round PVC
// bag in its webbing harness, the harness legs up over the dome to a lifting ring on top, and a
// fill and drain valve at the bottom; hoses from the valves to a manifold with a flow meter in
// front.
function waterBags() {

	const parts = new Parts();
	const bag = mat( 0x1f5fa8, { roughness: 0.55, metalness: 0.05 } );
	const web = paint( 0xe8b21a );
	const hose = BLACK();
	const R = 1.3;
	const bottomCap = 0.3;
	const wall = 1.2;
	const dome = 0.6;
	const spacing = 3.2;
	const points = [];
	for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) points.push( [ sx * spacing / 2, sz * spacing / 2 ] );

	for ( const [ x, z ] of points ) {

		parts.sphere( bag, R, [ x, bottomCap, z ], [ 24, 8 ], [ 1, bottomCap / R, 1 ] );
		parts.cylinder( bag, R, wall, [ x, bottomCap, z ], 24 );
		parts.sphere( bag, R, [ x, bottomCap + wall, z ], [ 24, 10 ], [ 1, dome / R, 1 ] );
		// Harness: a band round the base and four legs up over the dome to the ring.
		parts.cylinder( web, R + 0.01, 0.1, [ x, bottomCap + 0.05, z ], 24 );
		const top = bottomCap + wall + dome;
		for ( let i = 0; i < 4; i ++ ) {

			const a = i * Math.PI / 2 + Math.PI / 4;
			const path = [];
			for ( let j = 0; j <= 6; j ++ ) {

				const t = j / 6 * Math.PI / 2 * 0.92;
				const radius = ( R + 0.02 ) * Math.cos( t );
				path.push( [ x + Math.cos( a ) * radius, bottomCap + wall + ( dome + 0.02 ) * Math.sin( t ), z + Math.sin( a ) * radius ] );

			}

			path.unshift( [ x + Math.cos( a ) * ( R + 0.02 ), bottomCap + 0.1, z + Math.sin( a ) * ( R + 0.02 ) ] );
			parts.path( web, path, 0.03, 4, false );

		}

		flatLink( parts, STEEL(), [ x, z ], 0, [ 0.2, 0.2 ], 0.035, top + 0.02 );
		// Fill and drain valve near the bottom: the front bags' face the manifold, the back bags'
		// face the gap between the two columns of bags, their hoses run forward along it.
		const [ dx, dz ] = z < 0 ? [ 0, - 1 ] : [ - Math.sign( x ), 0 ];
		const out = z < 0 ? R + 0.2 : R + 0.1;
		const valve = [ x + dx * out, 0.25, z + dz * out ];
		parts.rod( STEEL(), [ x + dx * ( R - 0.05 ), 0.25, z + dz * ( R - 0.05 ) ], valve, 0.05, 10 );
		const route = z < 0 ? [ [ x, 0.05, valve[ 2 ] - 0.3 ] ] : [ [ Math.sign( x ) * 0.12, 0.05, z ], [ Math.sign( x ) * 0.12, 0.05, - spacing / 2 - R - 0.4 ] ];
		parts.path( hose, [ valve, ...route, [ Math.sign( x ) * 0.3, 0.05, - spacing / 2 - R - 1.15 ] ], 0.04, 8 );

	}

	// The fill manifold and flow meter on a small skid in front.
	const mz = - spacing / 2 - R - 1.3;
	parts.box( DARK(), [ 1.2, 0.1, 0.6 ], [ 0, 0, mz ] );
	parts.rod( STEEL(), [ - 0.5, 0.35, mz ], [ 0.5, 0.35, mz ], 0.06, 12 );
	parts.box( paint( 0x2f7a3a ), [ 0.3, 0.3, 0.3 ], [ 0, 0.4, mz ] );
	parts.path( hose, [ [ 0, 0.35, mz - 0.1 ], [ 0, 0.05, mz - 0.45 ], [ 0.3, 0.05, mz - 0.8 ] ], 0.05, 8 );
	return parts.build();

}

// A stack of four 4 × 4 ft, 3 in thick HDPE crane outrigger pads with their rope handles.
function outriggerPads() {

	const parts = new Parts();
	const pad = mat( 0xf2c21b, { roughness: 0.6 } );
	const rope = BLACK();
	const size = 4 * FT;
	const thick = 3 * IN;
	for ( let i = 0; i < 4; i ++ ) {

		const y = i * thick;
		const turn = ( i % 2 ? 0.04 : - 0.03 );
		parts.block( pad, [ size, thick, size ], [ ( i % 2 ) * 0.03, y + thick / 2, 0 ], [ 0, turn, 0 ] );
		// Rope handles on two opposite edges.
		for ( const side of [ - 1, 1 ] ) {

			const geometry = new TorusGeometry( 0.09, 0.012, 5, 10, Math.PI );
			// Half a ring, turned to lie flat and bulge out from the edge.
			_m.makeRotationY( - side * Math.PI / 2 ).multiply( new Matrix4().makeRotationX( - Math.PI / 2 ) ).setPosition( ( i % 2 ) * 0.03 + side * size / 2, y + thick / 2, 0 );
			parts.add( rope, geometry, _m );

		}

	}

	return parts.build();

}
