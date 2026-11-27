import { MathUtils, Vector3 } from 'three';
import { FT, IN, mat, Parts } from './parts.js';
import { memberGeometry } from './plant-parts.js';
import { cab, railing, tracks } from './heavy-civil.js';
import { truck } from './road-plant.js';

// Ground investigation, ground improvement, trenchless crossings and dewatering, built in code at
// the sizes of the common North American classes: geotechnical drill rigs (truck-mounted and a
// compact tracked direct-push rig) and a CPT truck for the site investigation; an anchor / soil
// nail drill, a jet grouting rig and a vibro stone column rig for shoring and ground improvement;
// an auger boring machine, a static pipe burster and its power pack, a microtunnel shaft set-up
// and a vacuum excavator trailer for the trenchless and utility work; a remote trench roller, a
// mini track dumper and a walk-behind trencher for the small stuff; and a wellpoint system and a
// deep well for dewatering. Like the other built-in pieces each stands on y = 0 with its front
// facing -Z (+X is its right).

const DEG = MathUtils.DEG2RAD;
const UP = new Vector3( 0, 1, 0 );
const ACROSS = new Vector3( 1, 0, 0 );

export const GROUNDWORKS_ITEMS = [
	// Site investigation.
	{ id: 'geotech-drill-truck', name: 'Geotechnical drill rig, truck-mounted (CME-75 class, hollow-stem auger, mast up)', category: 'Heavy equipment',
		keywords: 'geotech drill rig geotechnical drilling borehole bore hole soil boring site investigation hollow stem auger hsa spt split spoon cme 75 truck mounted drill test hole',
		build: geotechTruck },
	{ id: 'geotech-drill-tracked', name: 'Geotechnical drill rig, compact tracked (direct-push / auger, Geoprobe 7822 class, mast up)', category: 'Heavy equipment',
		keywords: 'geoprobe direct push drill rig track rig environmental drilling soil sampling probe rig monitoring well geotech borehole site investigation compact drill',
		build: geotechTracked },
	{ id: 'cpt-truck', name: 'Cone penetration test truck (20 t push, enclosed body, levelling jacks down)', category: 'Heavy equipment',
		keywords: 'cpt truck cone penetration test cpt rig cptu piezocone push rig geotech site investigation soil testing seismic cone',
		build: cptTruck },

	// Shoring and ground improvement.
	{ id: 'anchor-drill-rig', name: 'Anchor / soil nail / micropile drill rig, tracked (Klemm KR 806 class, 6.5 m mast angled, rod rack)', category: 'Shoring',
		keywords: 'anchor drill tieback rig soil nail rig micropile rig klemm tie back anchors shoring drill duplex casing drilling shotcrete wall',
		build: anchorRig },
	{ id: 'jet-grout-rig', name: 'Jet grouting rig, tracked (20 m mast, triple-fluid monitor and grout hoses)', category: 'Shoring',
		keywords: 'jet grout rig jet grouting soilcrete ground improvement grout columns underpinning triple fluid monitor jetting drill rig',
		build: jetGroutRig },
	{ id: 'vibro-stone-column-rig', name: 'Vibro stone column rig, crawler with bottom-feed depth vibrator (22 m leader, stone skip)', category: 'Shoring',
		keywords: 'vibro stone columns vibro replacement vibroflot vibrocat rammed aggregate piers ground improvement depth vibrator bottom feed gravel columns',
		build: vibroRig },

	// Trenchless and utility work. The auger boring machine and the pipe burster stand as they do on
	// the floor of their pits: dig the pit with the excavation tool and put them in it, with trench
	// boxes (Shoring) for the walls.
	{ id: 'auger-boring-machine', name: 'Auger boring machine, jack and bore (36 in casing, 20 ft joint on 30 ft track, thrust block)', category: 'Utilities',
		keywords: 'auger boring machine abm jack and bore bore pit launch pit road crossing rail crossing casing pipe auger bore boring trenchless steel casing',
		build: augerBoring },
	{ id: 'pipe-bursting-rig', name: 'Static pipe bursting unit (Grundoburst 800G class, 8 in host pipe, rod basket)', category: 'Utilities',
		keywords: 'pipe bursting static burst grundoburst pipe replacement sewer rehab water main trenchless rods bursting head hdpe pit',
		build: pipeBurster },
	{ id: 'pipe-bursting-power-pack', name: 'Pipe bursting hydraulic power pack, diesel skid (with hose reel)', category: 'Utilities',
		keywords: 'pipe bursting power pack hydraulic power unit hpu grundoburst power pack diesel hydraulic skid hose reel trenchless',
		build: burstPowerPack },
	{ id: 'microtunnel-shaft-setup', name: 'Microtunnelling jacking shaft set-up for a 48 in MTBM (12 × 26 ft shaft, control container, separation plant, jacking pipe)', category: 'Tunnelling',
		keywords: 'microtunnel microtunnelling mtbm pipe jacking jacking shaft launch shaft slurry separation plant control container rcp jacking pipe trenchless',
		build: microtunnelSetup },
	{ id: 'vacuum-excavator-trailer', name: 'Vacuum excavator trailer (800 gal debris tank, 500 gal water, 15 ft boom, potholing)', category: 'Utilities',
		keywords: 'vac trailer vacuum excavator hydro excavation hydrovac trailer potholing daylighting locate utilities vactor vermeer ditch witch suction',
		build: vacTrailer },

	// Small plant.
	{ id: 'trench-roller-remote', name: 'Trench roller, remote-controlled (33 in padfoot drums, Rammax / BW 85 class)', category: 'Heavy equipment',
		keywords: 'trench roller remote roller rammax sheepsfoot padfoot compactor multiquip trench compactor walk behind roller',
		build: trenchRoller },
	{ id: 'mini-track-dumper', name: 'Mini track dumper (1.5 t, tipping skip, rubber tracks, operator platform)', category: 'Heavy equipment',
		keywords: 'mini dumper track dumper power barrow motorized wheelbarrow tracked carrier canycom hinowa muck truck buggy',
		build: miniDumper },
	{ id: 'walk-behind-trencher', name: 'Walk-behind chain trencher (36 in depth, 6 in chain)', category: 'Heavy equipment',
		keywords: 'walk behind trencher chain trencher ditch witch c16 sprinkler irrigation cable trench small trencher pedestrian trencher',
		build: walkTrencher },

	// Dewatering.
	{ id: 'wellpoint-dewatering-system', name: 'Wellpoint dewatering system (100 ft of 6 in header, 20 wellpoints at 5 ft, diesel wellpoint pump)', category: 'Dewatering & water treatment',
		keywords: 'wellpoint well point dewatering header pipe swing joints jetted wellpoints groundwater lowering trench dewatering vacuum pump',
		build: wellpointSystem },
	{ id: 'deep-well-pump', name: 'Dewatering deep well (10 in casing, submersible pump, control panel, discharge)', category: 'Dewatering & water treatment',
		keywords: 'deep well dewatering well submersible pump wellhead groundwater lowering pump panel vfd discharge well casing',
		build: deepWell },
];

// --- materials and shared bits -----------------------------------------------------------------

const paint = color => mat( color, { roughness: 0.5, metalness: 0.2 } );
const plastic = color => mat( color, { roughness: 0.6 } );
const WHITE = () => paint( 0xe9e8e2 );
const YELLOW = () => paint( 0xe2a41c );
const ORANGE = () => paint( 0xe8681a );
const DARK = () => mat( 0x2c2e31, { roughness: 0.7, metalness: 0.2 } );
const BLACK = () => mat( 0x18191b, { roughness: 0.85 } );
const RUBBER = () => mat( 0x161718, { roughness: 0.9 } );
const STEEL = () => mat( 0x7d8287, { roughness: 0.5, metalness: 0.6 } );
const BRIGHT = () => mat( 0xc9ccce, { roughness: 0.35, metalness: 0.3 } );
const GALV = () => mat( 0xa9adb0, { roughness: 0.45, metalness: 0.65 } );
const GLASS = () => mat( 0x2b3d48, { roughness: 0.1, metalness: 0.3 } );
const HOSE = () => mat( 0x1f2022, { roughness: 0.75 } );
const RUST = () => mat( 0x6a5244, { roughness: 0.8, metalness: 0.35 } );
const TIMBER = () => mat( 0x8a6a45, { roughness: 0.95 } );
const CONCRETE = () => mat( 0xa9a59c, { roughness: 0.95 } );
const STONE = () => mat( 0x9a958c, { roughness: 1 } );
const SOIL = () => mat( 0x6e5a45, { roughness: 1 } );
const SHAFT = () => mat( 0x141516, { roughness: 1 } );
const AMBER = () => mat( 0xff9a1a, { roughness: 0.3, emissive: 0xc76a00, emissiveIntensity: 0.6 } );
const RED_LAMP = () => mat( 0xb3141b, { roughness: 0.3, emissive: 0x7a0a0e, emissiveIntensity: 0.6 } );

const lerp = ( a, b, t ) => a.map( ( v, i ) => v + ( b[ i ] - v ) * t );
const add = ( p, d, s = 1 ) => p.map( ( v, i ) => v + d[ i ] * s );

// A box of cross-section [ w, h ] from one point to another.
function member( parts, material, section, a, b ) {

	parts.add( material, memberGeometry( section, a, b ) );

}

// A hydraulic cylinder from its barrel end to its rod end.
function ram( parts, radius, a, b ) {

	const split = lerp( a, b, 0.6 );
	parts.rod( DARK(), a, split, radius, 10 );
	parts.rod( BRIGHT(), split, b, radius * 0.6, 8 );

}

// A tyre on its rim, axle across, standing on the ground at (x, z).
function tyre( parts, radius, width, [ x, z ], rim = STEEL() ) {

	parts.rod( RUBBER(), [ x - width / 2, radius, z ], [ x + width / 2, radius, z ], radius, 18 );
	parts.rod( rim, [ x - width / 2 - 0.005, radius, z ], [ x + width / 2 + 0.005, radius, z ], radius * 0.55, 12 );

}

// A rubber track `length` long and `high` tall, centred on (x, z): the belt round two end rounds,
// the track frame along its side and the hubs.
function rubberTrack( parts, x, z, length, high, width ) {

	const r = high / 2;
	parts.box( RUBBER(), [ width, high, length - high ], [ x, 0, z ] );
	for ( const e of [ - 1, 1 ] ) {

		const ez = z + e * ( length / 2 - r );
		parts.rod( RUBBER(), [ x - width / 2, r, ez ], [ x + width / 2, r, ez ], r, 16 );
		parts.rod( DARK(), [ x - width / 2 - 0.01, r, ez ], [ x + width / 2 + 0.01, r, ez ], r * 0.6, 12 );

	}

	parts.box( DARK(), [ width + 0.02, high * 0.42, length - high ], [ x, high * 0.3, z ] );

}

// An auger from a to b: the stem and its flight wound round it every `pitch`.
function auger( parts, material, a, b, radius, pitch = radius * 1.6 ) {

	const A = new Vector3( ...a );
	const B = new Vector3( ...b );
	const length = A.distanceTo( B );
	const dir = B.clone().sub( A ).normalize();
	const u = new Vector3().crossVectors( dir, Math.abs( dir.y ) > 0.9 ? ACROSS : UP ).normalize();
	const w = new Vector3().crossVectors( dir, u );
	parts.rod( material, a, b, radius * 0.5, 12 );
	const steps = Math.ceil( length / pitch * 8 );
	const points = [];
	for ( let i = 0; i <= steps; i ++ ) {

		const t = i / steps * length;
		const angle = t / pitch * Math.PI * 2;
		points.push( A.clone().addScaledVector( dir, t ).addScaledVector( u, Math.cos( angle ) * radius * 0.75 ).addScaledVector( w, Math.sin( angle ) * radius * 0.75 ).toArray() );

	}

	parts.path( material, points, radius * 0.25, 6, false );

}

// A ladder from y0 to y1 at (x, z), its rungs across x (on a wall facing z) or across z.
function ladder( parts, material, [ x, z ], y0, y1, across = 'x', width = 0.42 ) {

	const [ dx, dz ] = across === 'x' ? [ width / 2, 0 ] : [ 0, width / 2 ];
	for ( const s of [ - 1, 1 ] ) parts.box( material, [ 0.05, y1 - y0, 0.05 ], [ x + s * dx, y0, z + s * dz ] );
	for ( let y = y0 + 0.3; y < y1 - 0.1; y += 0.3 ) parts.box( material, across === 'x' ? [ width, 0.03, 0.03 ] : [ 0.03, 0.03, width ], [ x, y, z ] );

}

// An operator's seat facing -Z with its cushion top at y.
function seat( parts, [ x, y, z ], width = 0.48 ) {

	parts.box( BLACK(), [ width, 0.1, 0.46 ], [ x, y - 0.1, z ] );
	parts.block( BLACK(), [ width, 0.55, 0.1 ], [ x, y + 0.25, z + 0.23 ], [ - 10 * DEG, 0, 0 ] );

}

// Louvres on a side of a housing: slats along z on a face at x, from y0 up.
function louvres( parts, material, x, y0, z, rows, length, pitch = 0.08 ) {

	for ( let i = 0; i < rows; i ++ ) parts.box( material, [ 0.02, 0.03, length ], [ x, y0 + i * pitch, z ] );

}

// Steel walls round a pit of [ width, length ] inside, `high` tall and `thick` thick, with
// vertical stiffeners down the inside of the long walls every metre or so.
function pitWalls( parts, material, [ width, length ], high, thick ) {

	const [ hx, hz ] = [ width / 2, length / 2 ];
	for ( const s of [ - 1, 1 ] ) {

		parts.box( material, [ thick, high, length + 2 * thick ], [ s * ( hx + thick / 2 ), 0, 0 ] );
		parts.box( material, [ width, high, thick ], [ 0, 0, s * ( hz + thick / 2 ) ] );
		const ribs = Math.max( 2, Math.round( length / 1.2 ) );
		for ( let i = 1; i < ribs; i ++ ) parts.box( material, [ 0.05, high, 0.1 ], [ s * ( hx - 0.025 ), 0, - hz + length * i / ribs ] );
		parts.box( DARK(), [ thick + 0.02, 0.08, length + 2 * thick ], [ s * ( hx + thick / 2 ), high - 0.08, 0 ] );

	}

}

// --- geotechnical drill rig, truck-mounted ---------------------------------------------------

// A CME-75 class geotechnical drill on a single-axle 33,000 lb truck (about 8.6 m long and 9.3 m
// to the crown with the mast up): the white truck, a drill deck behind the cab with the drill's
// own engine and hydraulics, racks of 5 ft hollow-stem auger flights and A-rods, the mast standing
// up at the back on its raising rams with the rotary head part way down it and the auger string
// under it into the ground, the automatic SPT hammer hanging on the left of the mast, the cathead,
// the operator's controls at the left rear and four levelling jacks down.
function geotechTruck() {

	const parts = new Parts();
	const rig = paint( 0xb3262a );
	const dark = DARK();
	const front = - 4.7;
	const back = 3.2;
	const { cabBack, frameTop } = truck( parts, { colour: 0xe9e8e2, front, rear: 1.4, back, axles: 1 } );

	// Drill deck on its subframe, from behind the cab to past the frame's end.
	const d0 = cabBack + 0.15;
	const d1 = back + 0.45;
	parts.box( dark, [ 2.2, 0.12, d1 - d0 ], [ 0, frameTop, ( d0 + d1 ) / 2 ] );
	parts.box( rig, [ 2.42, 0.1, d1 - d0 ], [ 0, frameTop + 0.12, ( d0 + d1 ) / 2 ] );
	const deck = frameTop + 0.22;

	// The drill's engine and hydraulic unit behind the cab, its exhaust and the hydraulic tank.
	parts.box( rig, [ 2.0, 1.05, 1.3 ], [ 0, deck, d0 + 0.7 ] );
	for ( const s of [ - 1, 1 ] ) louvres( parts, dark, s * 1.005, deck + 0.3, d0 + 0.6, 6, 0.8 );
	parts.rod( BRIGHT(), [ 0.75, deck + 1.05, d0 + 0.3 ], [ 0.75, deck + 1.6, d0 + 0.3 ], 0.05, 10 );
	parts.box( dark, [ 0.6, 0.6, 0.5 ], [ 0.85, deck, d0 + 1.65 ] );

	// Auger rack on the left: six 5 ft hollow-stem flights in two layers, between end posts.
	const r0 = d0 + 1.55;
	const r1 = r0 + 5 * FT;
	for ( const z of [ r0 - 0.05, r1 + 0.05 ] ) {

		parts.box( dark, [ 0.06, 0.62, 0.06 ], [ - 1.15, deck, z ] );
		parts.box( dark, [ 0.06, 0.62, 0.06 ], [ - 0.45, deck, z ] );
		parts.box( dark, [ 0.76, 0.05, 0.06 ], [ - 0.8, deck + 0.05, z ] );
		parts.box( dark, [ 0.76, 0.05, 0.06 ], [ - 0.8, deck + 0.31, z ] );

	}

	for ( const y of [ deck + 0.17, deck + 0.43 ] ) {

		for ( let k = 0; k < 3; k ++ ) auger( parts, GALV(), [ - 1.03 + k * 0.23, y, r0 ], [ - 1.03 + k * 0.23, y, r1 ], 0.11, 0.2 );

	}

	// A-rods racked on the right, a tool box and a sample cooler.
	for ( const z of [ r0 + 0.1, r1 - 0.1 ] ) parts.box( dark, [ 0.5, 0.45, 0.05 ], [ 0.75, deck, z ] );
	for ( let k = 0; k < 8; k ++ ) parts.rod( STEEL(), [ 0.56 + ( k % 4 ) * 0.12, deck + 0.35 + Math.floor( k / 4 ) * 0.08, r0 ], [ 0.56 + ( k % 4 ) * 0.12, deck + 0.35 + Math.floor( k / 4 ) * 0.08, r1 ], 0.022, 6 );
	parts.box( plastic( 0x2f6db3 ), [ 0.5, 0.35, 0.35 ], [ 0.2, deck, r1 - 0.25 ] );

	// The mast, standing up at the back: its channel, the slide rails the rotary head runs on, and
	// the crown with its sheaves at the top.
	const mz = back + 0.2;
	const top = 9.0;
	parts.box( rig, [ 0.38, top - deck, 0.3 ], [ 0, deck, mz ] );
	for ( const s of [ - 1, 1 ] ) parts.box( BRIGHT(), [ 0.05, top - deck - 0.4, 0.05 ], [ s * 0.14, deck + 0.2, mz + 0.17 ] );
	for ( let y = deck + 0.8; y < top - 0.3; y += 0.9 ) parts.box( dark, [ 0.4, 0.04, 0.32 ], [ 0, y, mz ] );
	parts.box( rig, [ 0.5, 0.25, 0.75 ], [ 0, top, mz + 0.1 ] );
	for ( const z of [ mz - 0.15, mz + 0.35 ] ) parts.rod( dark, [ - 0.2, top + 0.2, z ], [ 0.2, top + 0.2, z ], 0.17, 14 );

	// Raising rams from the deck up to the mast.
	for ( const s of [ - 1, 1 ] ) ram( parts, 0.06, [ s * 0.32, deck + 0.1, back - 1.2 ], [ s * 0.22, deck + 2.2, mz - 0.12 ] );

	// Rotary head on the slide behind the mast, its hoses, and the auger string from it into the
	// ground, with a ring of cuttings round it.
	const az = mz + 0.62;
	const headY = 2.5;
	parts.box( rig, [ 0.75, 0.6, 0.62 ], [ 0, headY, az - 0.05 ] );
	parts.box( dark, [ 0.5, 0.25, 0.5 ], [ 0, headY + 0.6, az ] );
	parts.cylinder( dark, 0.16, 0.25, [ 0, headY - 0.25, az ], 14 );
	auger( parts, GALV(), [ 0, 0.02, az ], [ 0, headY - 0.25, az ], 0.15, 0.22 );
	parts.cylinder( SOIL(), 0.6, 0.14, [ 0, 0, az ], 18, 0.2 );
	for ( const s of [ - 1, 1 ] ) parts.path( HOSE(), [ [ s * 0.3, headY + 0.4, az - 0.2 ], [ s * 0.35, headY + 1.2, mz + 0.05 ], [ s * 0.3, deck + 0.4, mz - 0.25 ] ], 0.02, 6 );

	// Automatic SPT hammer hanging on its line at the left of the mast, the cathead and the wire
	// line winch below it.
	parts.cylinder( rig, 0.12, 1.2, [ - 0.55, 3.1, mz + 0.1 ], 14 );
	parts.box( dark, [ 0.3, 0.25, 0.3 ], [ - 0.55, 4.3, mz + 0.1 ] );
	parts.rod( BRIGHT(), [ - 0.55, 4.55, mz + 0.1 ], [ - 0.2, top + 0.05, mz - 0.15 ], 0.008, 4 );
	parts.rod( dark, [ - 0.75, deck + 0.75, mz - 0.05 ], [ - 0.2, deck + 0.75, mz - 0.05 ], 0.11, 12 );
	parts.rod( BRIGHT(), [ 0.2, deck + 0.75, mz - 0.05 ], [ 0.55, deck + 0.75, mz - 0.05 ], 0.13, 12 );

	// Operator's control panel at the left rear corner, with its levers.
	parts.box( dark, [ 0.18, 0.95, 0.7 ], [ - 1.12, deck, back - 0.55 ] );
	for ( let i = 0; i < 5; i ++ ) parts.rod( BRIGHT(), [ - 1.2, deck + 0.75, back - 0.8 + i * 0.12 ], [ - 1.4, deck + 1.0, back - 0.8 + i * 0.12 ], 0.012, 5 );

	// Levelling jacks down: a pair at the back corners and a pair ahead of the axle.
	for ( const s of [ - 1, 1 ] ) {

		for ( const z of [ back + 0.15, 0.68 ] ) {

			parts.box( dark, [ 0.2, 0.12, 0.2 ], [ s * 1.12, frameTop - 0.05, z ] );
			parts.rod( dark, [ s * 1.12, frameTop - 0.05, z ], [ s * 1.12, 0.45, z ], 0.07, 10 );
			parts.rod( BRIGHT(), [ s * 1.12, 0.45, z ], [ s * 1.12, 0.05, z ], 0.045, 8 );
			parts.box( dark, [ 0.32, 0.05, 0.32 ], [ s * 1.12, 0, z ] );

		}

	}

	parts.box( AMBER(), [ 0.15, 0.1, 0.15 ], [ 0, top + 0.25, mz + 0.1 ] );
	return parts.build();

}

// --- geotechnical drill rig, compact tracked -------------------------------------------------

// A compact track-mounted direct-push and auger rig of the Geoprobe 7822DT class (about 3.4 m
// long, 1.85 m wide and 4.2 m high with its mast up): rubber tracks, the engine and hydraulics
// in the body, the mast folded up at the front on its foot with the probe cylinder, the hammer and
// a rod string in the ground, the operator's controls at the left of the mast, and probe rods
// racked on top.
function geotechTracked() {

	const parts = new Parts();
	const body = ORANGE();
	const dark = DARK();
	for ( const s of [ - 1, 1 ] ) rubberTrack( parts, s * 0.74, 0.35, 2.3, 0.45, 0.34 );
	parts.box( dark, [ 1.2, 0.25, 2.2 ], [ 0, 0.3, 0.35 ] );

	// Body: the engine and hydraulics under a hood, with louvres and the exhaust.
	parts.box( body, [ 1.8, 0.85, 1.65 ], [ 0, 0.5, 0.65 ] );
	parts.box( dark, [ 1.82, 0.06, 1.67 ], [ 0, 0.5, 0.65 ] );
	for ( const s of [ - 1, 1 ] ) louvres( parts, dark, s * 0.905, 0.75, 0.9, 5, 0.7 );
	parts.rod( BRIGHT(), [ 0.65, 1.35, 1.25 ], [ 0.65, 1.7, 1.25 ], 0.035, 8 );

	// Probe rods racked on top, in two cradles.
	for ( const z of [ 0.2, 1.1 ] ) parts.box( dark, [ 0.7, 0.12, 0.06 ], [ - 0.35, 1.35, z ] );
	for ( let k = 0; k < 12; k ++ ) parts.rod( STEEL(), [ - 0.65 + ( k % 6 ) * 0.11, 1.5 + Math.floor( k / 6 ) * 0.05, - 0.1 ], [ - 0.65 + ( k % 6 ) * 0.11, 1.5 + Math.floor( k / 6 ) * 0.05, 1.12 ], 0.02, 6 );

	// The mast at the front: its foot on the ground, the mount and fold cylinder off the body, two
	// columns with a crosshead, and the long probe cylinder between them.
	const mz = - 1.15;
	const top = 4.05;
	parts.box( dark, [ 0.75, 0.1, 0.5 ], [ 0, 0, mz ] );
	member( parts, dark, [ 0.3, 0.2 ], [ 0, 0.55, - 0.25 ], [ 0, 0.55, mz + 0.12 ] );
	ram( parts, 0.05, [ 0, 0.85, - 0.2 ], [ 0, 1.6, mz + 0.12 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( body, [ 0.13, top - 0.1, 0.13 ], [ s * 0.24, 0.1, mz ] );
	parts.box( body, [ 0.62, 0.18, 0.2 ], [ 0, top - 0.18, mz ] );
	parts.box( body, [ 0.62, 0.15, 0.2 ], [ 0, 0.25, mz ] );
	parts.rod( dark, [ 0, 0.4, mz + 0.02 ], [ 0, 2.6, mz + 0.02 ], 0.065, 12 );
	parts.rod( BRIGHT(), [ 0, 2.6, mz + 0.02 ], [ 0, top - 0.18, mz + 0.02 ], 0.04, 10 );

	// The carriage and hammer part way down, the drive cap and the rod string into the ground.
	const hz = mz - 0.22;
	parts.box( body, [ 0.66, 0.5, 0.28 ], [ 0, 1.75, mz - 0.08 ] );
	parts.box( dark, [ 0.3, 0.45, 0.3 ], [ 0, 1.3, hz ] );
	parts.cylinder( dark, 0.05, 0.12, [ 0, 1.18, hz ], 10 );
	parts.rod( STEEL(), [ 0, 0.02, hz ], [ 0, 1.18, hz ], 0.022, 8 );
	parts.cylinder( SOIL(), 0.25, 0.06, [ 0, 0, hz - 0.05 ], 12, 0.08 );
	for ( const s of [ - 1, 1 ] ) parts.path( HOSE(), [ [ s * 0.2, 2.0, mz - 0.05 ], [ s * 0.45, 2.3, mz + 0.4 ], [ s * 0.5, 1.35, - 0.3 ] ], 0.018, 6 );

	// Operator's control bank at the left of the mast.
	parts.box( dark, [ 0.08, 0.7, 0.08 ], [ - 0.78, 0.55, - 0.45 ] );
	parts.block( dark, [ 0.3, 0.12, 0.45 ], [ - 0.82, 1.3, - 0.45 ], [ 0, 0, 20 * DEG ] );
	for ( let i = 0; i < 4; i ++ ) parts.rod( BRIGHT(), [ - 0.86, 1.36, - 0.6 + i * 0.1 ], [ - 0.92, 1.55, - 0.6 + i * 0.1 ], 0.01, 5 );
	return parts.build();

}

// --- cone penetration test truck -------------------------------------------------------------

// A 20 t CPT truck on a tandem-axle chassis (about 10.5 m long and 3.9 m high): the box body
// over the frame where the push cylinders and the data acquisition live, its side door with
// fold-down steps and a window, a roof air conditioner and the generator's exhaust, the four
// levelling jacks down on their pads, and a cone rod going down through the floor hatch into the
// ground between the axles.
function cptTruck() {

	const parts = new Parts();
	const body = paint( 0xdedcd5 );
	const dark = DARK();
	const blue = paint( 0x2f5f9a );
	const front = - 5.8;
	const back = 4.4;
	const { cabBack, frameTop } = truck( parts, { colour: 0xe9e8e2, front, rear: 2.5, back, axles: 2 } );

	// The box body, with a stripe down its sides.
	const b0 = cabBack + 0.15;
	const b1 = back + 0.25;
	const by = frameTop + 0.1;
	const top = 3.65;
	parts.box( dark, [ 2.3, 0.1, b1 - b0 ], [ 0, frameTop, ( b0 + b1 ) / 2 ] );
	parts.box( body, [ 2.5, top - by, b1 - b0 ], [ 0, by, ( b0 + b1 ) / 2 ] );
	parts.box( blue, [ 2.52, 0.18, b1 - b0 + 0.02 ], [ 0, by + 0.95, ( b0 + b1 ) / 2 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( dark, [ 0.05, 0.08, b1 - b0 + 0.04 ], [ s * 1.25, top - 0.06, ( b0 + b1 ) / 2 ] );
		parts.box( dark, [ 2.54, 0.08, 0.05 ], [ 0, top - 0.06, ( b0 + b1 ) / 2 + s * ( b1 - b0 ) / 2 ] );

	}


	// Side door on the right with its window and the fold-down steps; a window on the left.
	const dz = b0 + 1.3;
	parts.box( dark, [ 0.03, 2.0, 0.95 ], [ 1.26, by + 0.1, dz ] );
	parts.box( body, [ 0.035, 1.9, 0.85 ], [ 1.265, by + 0.15, dz ] );
	parts.box( GLASS(), [ 0.04, 0.45, 0.5 ], [ 1.27, by + 1.35, dz ] );
	for ( let i = 0; i < 3; i ++ ) parts.box( dark, [ 0.3, 0.04, 0.8 ], [ 1.35 + i * 0.12, by - 0.25 - i * 0.28, dz ] );
	for ( const s of [ - 1, 1 ] ) member( parts, dark, [ 0.04, 0.08 ], [ 1.27, by, dz + s * 0.42 ], [ 1.62, by - 0.92, dz + s * 0.42 ] );
	parts.box( GLASS(), [ 0.04, 0.6, 1.2 ], [ - 1.27, by + 1.25, b0 + 2.0 ] );

	// Rear doors and the roof: air conditioner, the generator exhaust and a beacon.
	for ( const s of [ - 1, 1 ] ) {

		parts.box( dark, [ 1.12, 2.2, 0.02 ], [ s * 0.6, by + 0.15, b1 + 0.01 ] );
		parts.box( body, [ 1.06, 2.14, 0.03 ], [ s * 0.6, by + 0.18, b1 + 0.015 ] );
		parts.box( BRIGHT(), [ 0.04, 0.3, 0.05 ], [ s * 0.1, by + 1.1, b1 + 0.03 ] );

	}

	parts.box( body, [ 0.85, 0.3, 1.0 ], [ 0, top, b1 - 1.5 ] );
	parts.box( dark, [ 0.6, 0.02, 0.7 ], [ 0, top + 0.3, b1 - 1.5 ] );
	parts.rod( BRIGHT(), [ - 0.95, top, b0 + 0.6 ], [ - 0.95, top + 0.35, b0 + 0.6 ], 0.04, 8 );
	parts.box( AMBER(), [ 0.18, 0.12, 0.18 ], [ 0.9, top, b1 - 0.3 ] );

	// Four levelling jacks down: a cylinder on a bracket off the frame, its rod and the pad.
	for ( const s of [ - 1, 1 ] ) {

		for ( const z of [ - 0.35, b1 - 0.4 ] ) {

			parts.box( dark, [ 0.3, 0.2, 0.25 ], [ s * 1.1, frameTop - 0.15, z ] );
			parts.rod( dark, [ s * 1.18, frameTop - 0.1, z ], [ s * 1.18, 0.5, z ], 0.085, 12 );
			parts.rod( BRIGHT(), [ s * 1.18, 0.5, z ], [ s * 1.18, 0.06, z ], 0.055, 10 );
			parts.box( dark, [ 0.45, 0.06, 0.45 ], [ s * 1.18, 0, z ] );

		}

	}

	// The cone rods through the floor hatch: a guide tube under the floor and the rod into the ground.
	const rz = 0.45;
	parts.box( dark, [ 0.45, 0.06, 0.45 ], [ 0, frameTop - 0.06, rz ] );
	parts.rod( dark, [ 0, frameTop - 0.06, rz ], [ 0, 0.55, rz ], 0.05, 10 );
	parts.rod( STEEL(), [ 0, 0.55, rz ], [ 0, 0, rz ], 0.018, 8 );
	return parts.build();

}

// --- anchor / soil nail / micropile drill ----------------------------------------------------

// A 13 t tracked anchor drill of the Klemm KR 806 class (about 9 m long with its mast out, 2.3 m
// wide): steel tracks, the engine housing at the back, the boom and kinematics at the front
// holding a 6.5 m mast angled 15° down as for a tieback or soil nail, a double rotary head driving
// rods inside casing, breakout clamps at the mast's front end and its foot against the face,
// the remote control stand at the left, and a rack of rods and casings on the right.
function anchorRig() {

	const parts = new Parts();
	const body = paint( 0xd9a21b );
	const dark = DARK();
	tracks( parts, { length: 3.3, width: 2.3, shoe: 0.4, height: 0.62 }, 0, 0.3 );
	parts.box( dark, [ 2.0, 0.2, 3.3 ], [ 0, 0.62, 0.3 ] );

	// Engine housing at the back left, louvred, with the exhaust; the hydraulic tank beside it.
	parts.box( body, [ 1.65, 1.05, 1.6 ], [ - 0.27, 0.82, 1.15 ] );
	louvres( parts, dark, - 1.105, 1.1, 1.15, 7, 1.0 );
	for ( let i = 0; i < 6; i ++ ) parts.box( dark, [ 1.1, 0.03, 0.02 ], [ - 0.27, 1.15 + i * 0.09, 1.955 ] );
	parts.rod( BRIGHT(), [ 0.2, 1.87, 0.6 ], [ 0.2, 2.25, 0.6 ], 0.045, 8 );
	parts.box( body, [ 0.5, 0.75, 0.7 ], [ 0.8, 0.82, 1.55 ] );

	// Boom from the front of the body to the mast cradle, and its lift ram.
	const cradle = [ 0, 1.55, - 2.5 ];
	member( parts, body, [ 0.4, 0.42 ], [ 0, 1.0, - 1.0 ], cradle );
	ram( parts, 0.08, [ 0, 0.78, - 0.55 ], [ 0, 1.28, - 2.2 ] );
	parts.box( dark, [ 0.7, 0.35, 0.5 ], [ 0, cradle[ 1 ] - 0.2, cradle[ 2 ] ] );

	// The mast, 15° down to the front: its box, the slide rails on top, the foot on the face.
	const a = 15 * DEG;
	const dir = [ 0, - Math.sin( a ), - Math.cos( a ) ];
	const n = [ 0, Math.cos( a ), - Math.sin( a ) ];
	const rear = add( cradle, dir, - 2.4 );
	const tip = add( cradle, dir, 4.2 );
	member( parts, body, [ 0.32, 0.3 ], rear, tip );
	for ( const s of [ - 1, 1 ] ) member( parts, BRIGHT(), [ 0.05, 0.05 ], add( add( rear, n, 0.175 ), [ s * 0.12, 0, 0 ] ), add( add( tip, n, 0.175 ), [ s * 0.12, 0, 0 ] ) );
	member( parts, dark, [ 0.5, 0.5 ], add( tip, dir, - 0.15 ), add( tip, dir, 0.1 ) );

	// Double rotary head near the back of the mast, its hoses, and the drill string (rods inside
	// casing) from it out past the front, through the two breakout clamps.
	const axis = 0.45;
	const head = add( add( rear, dir, 0.75 ), n, axis );
	parts.block( body, [ 0.6, 0.55, 0.8 ], head, [ - a, 0, 0 ] );
	parts.block( dark, [ 0.4, 0.35, 0.3 ], add( head, dir, - 0.5 ), [ - a, 0, 0 ] );
	const s0 = add( head, dir, 0.4 );
	const s1 = add( add( tip, n, axis ), dir, 0.45 );
	parts.rod( RUST(), s0, s1, 0.07, 14 );
	parts.rod( STEEL(), add( s1, dir, - 0.01 ), add( s1, dir, 0.12 ), 0.045, 10 );
	for ( const t of [ 0.35, 0.85 ] ) parts.block( dark, [ 0.55, 0.42, 0.25 ], add( add( tip, dir, - t ), n, axis - 0.02 ), [ - a, 0, 0 ] );
	for ( const s of [ - 1, 1 ] ) parts.path( HOSE(), [ add( head, [ s * 0.25, 0.25, 0.2 ] ), [ s * 0.35, 2.6, 0.2 ], [ s * 0.35, 1.9, 0.5 ] ], 0.022, 6 );

	// Remote control stand at the left front.
	parts.box( dark, [ 0.06, 0.6, 0.06 ], [ - 1.3, 0.82, - 1.0 ] );
	parts.block( dark, [ 0.45, 0.1, 0.32 ], [ - 1.3, 1.45, - 1.0 ], [ - 20 * DEG, 0, 0 ] );
	for ( let i = 0; i < 4; i ++ ) parts.rod( BRIGHT(), [ - 1.45 + i * 0.1, 1.5, - 1.0 ], [ - 1.45 + i * 0.1, 1.62, - 1.02 ], 0.01, 5 );

	// Rod rack on the right: end frames with cradles, 2.5 m rods below and casings on top.
	for ( const z of [ - 0.95, 1.05 ] ) {

		parts.box( dark, [ 0.06, 1.05, 0.06 ], [ 0.72, 0.82, z ] );
		parts.box( dark, [ 0.06, 1.05, 0.06 ], [ 1.12, 0.82, z ] );
		for ( const y of [ 1.18, 1.42 ] ) parts.box( dark, [ 0.46, 0.04, 0.08 ], [ 0.92, y, z ] );

	}

	for ( let k = 0; k < 8; k ++ ) parts.rod( STEEL(), [ 0.78 + ( k % 4 ) * 0.095, 1.27 + Math.floor( k / 4 ) * 0.075, - 1.2 ], [ 0.78 + ( k % 4 ) * 0.095, 1.27 + Math.floor( k / 4 ) * 0.075, 1.3 ], 0.035, 8 );
	for ( let k = 0; k < 3; k ++ ) parts.rod( RUST(), [ 0.8 + k * 0.125, 1.53, - 1.2 ], [ 0.8 + k * 0.125, 1.53, 1.3 ], 0.06, 12 );
	return parts.build();

}

// --- jet grouting rig ------------------------------------------------------------------------

// A tracked jet grouting rig with a 20 m single-pass mast (about 20.9 m high, 2.5 m wide): steel
// tracks, the power pack at the back, the operator's cab at the left front, the mast standing at
// the front on its kinematics and backstays, the rotary head high on the mast with the triple-
// fluid swivel on top and the monitor rods under it down to the ground, and the grout, air and
// water hoses up over the sheave at the mast head and down the back to trail behind.
function jetGroutRig() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();
	tracks( parts, { length: 4.4, width: 2.8, shoe: 0.6, height: 0.8 }, 0, 0.4 );
	parts.box( dark, [ 2.6, 0.25, 4.6 ], [ 0, 0.8, 0.5 ] );

	// Power pack at the back and the cab at the left front.
	parts.box( body, [ 2.5, 1.4, 2.2 ], [ 0, 1.05, 1.7 ] );
	for ( const s of [ - 1, 1 ] ) louvres( parts, dark, s * 1.255, 1.4, 1.9, 9, 1.4 );
	parts.box( dark, [ 2.5, 0.5, 0.4 ], [ 0, 1.05, 2.95 ] );
	parts.rod( BRIGHT(), [ 0.8, 2.45, 1.1 ], [ 0.8, 2.95, 1.1 ], 0.06, 10 );
	cab( parts, [ 1.0, 1.9, 1.5 ], [ - 0.75, 1.05, - 0.75 ], body );
	parts.box( dark, [ 1.0, 0.6, 1.3 ], [ 0.65, 1.05, - 0.9 ] );

	// The mast: its box with rails down the front, the foot on the ground, the kinematic arms off
	// the front of the body and two backstay rams.
	const mz = - 2.3;
	const top = 20.3;
	parts.box( body, [ 0.45, top - 0.35, 0.5 ], [ 0, 0.35, mz ] );
	for ( const s of [ - 1, 1 ] ) parts.box( BRIGHT(), [ 0.06, top - 0.8, 0.06 ], [ s * 0.17, 0.5, mz - 0.27 ] );
	for ( let y = 1.5; y < top - 0.5; y += 1.5 ) parts.box( dark, [ 0.47, 0.05, 0.52 ], [ 0, y, mz ] );
	parts.cylinder( dark, 0.12, 0.35, [ 0, 0, mz ], 12 );
	parts.box( dark, [ 0.8, 0.06, 0.8 ], [ 0, 0, mz ] );
	for ( const y of [ 1.3, 2.1 ] ) member( parts, dark, [ 0.3, 0.2 ], [ 0, y, - 1.6 ], [ 0, y + 0.3, mz + 0.2 ] );
	for ( const s of [ - 1, 1 ] ) ram( parts, 0.09, [ s * 0.8, 1.1, 0.3 ], [ s * 0.2, 6.5, mz + 0.2 ] );

	// Mast head with the hose sheave across it.
	parts.box( body, [ 0.6, 0.35, 0.9 ], [ 0, top, mz ] );
	parts.rod( dark, [ - 0.22, top + 0.4, mz ], [ 0.22, top + 0.4, mz ], 0.55, 20 );
	parts.box( RED_LAMP(), [ 0.12, 0.1, 0.12 ], [ 0.25, top + 0.35, mz + 0.35 ] );

	// Rotary head on the mast, the triple swivel on top and the monitor rods into the ground with a
	// clamp at the foot, and a spoil return puddle round the hole.
	const hz = mz - 0.62;
	const headY = 12.0;
	parts.box( body, [ 0.85, 0.9, 0.62 ], [ 0, headY, mz - 0.55 ] );
	parts.cylinder( dark, 0.14, 0.5, [ 0, headY + 0.9, hz ], 14 );
	parts.cylinder( BRIGHT(), 0.17, 0.12, [ 0, headY + 1.4, hz ], 14 );
	parts.rod( BRIGHT(), [ 0, 0.02, hz ], [ 0, headY, hz ], 0.057, 10 );
	parts.box( dark, [ 0.5, 0.3, 0.4 ], [ 0, 0.35, hz + 0.05 ] );
	parts.cylinder( mat( 0x8c877c, { roughness: 0.6 } ), 0.7, 0.03, [ 0, 0, hz ], 20 );

	// Grout, air and water hoses: up the front of the mast, over the sheave, down the back and
	// over the body to trail on the ground behind.
	const colours = [ BLACK(), paint( 0x2a5fa8 ), paint( 0xc0392b ) ];
	for ( let i = 0; i < 3; i ++ ) {

		const x = ( i - 1 ) * 0.1;
		parts.path( colours[ i ], [
			[ x, headY + 1.5, hz ], [ x, headY + 2.2, hz - 0.05 ], [ x, top, mz - 0.6 ], [ x, top + 0.97, mz ], [ x, top, mz + 0.6 ],
			[ x, 3.2, mz + 0.6 ], [ x, 2.6, 0.2 ], [ x, 2.6, 2.6 ], [ x, 0.6, 3.6 ], [ x, 0.04, 4.9 ],
		], 0.03, 6 );

	}

	return parts.build();

}

// --- vibro stone column rig ------------------------------------------------------------------

// A purpose-built vibro replacement rig of about 65 t (22.6 m high, 3.6 m across its tracks): a
// crawler carrier with its house, cab and counterweight, a 22 m leader on a boom and backstays at
// the front, the bottom-feed depth vibrator and its extension tubes hung from a sledge on the
// leader, the stone tube down their side from the receiver hopper, and the stone skip at the
// foot of the leader ready to be loaded and winched up, with the gravel round the hole.
function vibroRig() {

	const parts = new Parts();
	const body = paint( 0x2f63a8 );
	const dark = DARK();
	tracks( parts, { length: 5.2, width: 3.6, shoe: 0.7, height: 1.0 }, 0, 0.5 );
	parts.cylinder( BLACK(), 1.0, 0.3, [ 0, 1.0, 0.5 ], 24 );

	// The house: deck, engine housing, counterweight and the cab at the left front.
	parts.box( dark, [ 3.0, 0.3, 5.0 ], [ 0, 1.3, 0.3 ] );
	parts.box( body, [ 3.0, 1.6, 2.8 ], [ 0, 1.6, 1.4 ] );
	for ( const s of [ - 1, 1 ] ) louvres( parts, dark, s * 1.505, 2.0, 1.6, 8, 1.6 );
	parts.box( dark, [ 3.0, 1.1, 0.6 ], [ 0, 1.3, 3.1 ] );
	parts.rod( BRIGHT(), [ 0.9, 3.2, 1.0 ], [ 0.9, 3.7, 1.0 ], 0.07, 10 );
	cab( parts, [ 1.0, 1.9, 1.7 ], [ - 1.0, 1.6, - 1.1 ], body );
	parts.box( body, [ 1.4, 0.9, 1.6 ], [ 0.75, 1.6, - 1.2 ] );

	// The leader: its box with rails down the front, the boom from the house and two backstays,
	// and the head with its sheaves.
	const lz = - 3.6;
	const top = 22.0;
	parts.box( body, [ 0.75, top - 0.9, 0.6 ], [ 0, 0.9, lz ] );
	for ( const s of [ - 1, 1 ] ) parts.box( BRIGHT(), [ 0.07, top - 1.4, 0.07 ], [ s * 0.28, 1.1, lz - 0.33 ] );
	for ( let y = 2.5; y < top - 0.5; y += 2.0 ) parts.box( dark, [ 0.77, 0.06, 0.62 ], [ 0, y, lz ] );
	member( parts, dark, [ 0.6, 0.5 ], [ 0, 2.0, - 2.1 ], [ 0, 2.5, lz + 0.3 ] );
	for ( const s of [ - 1, 1 ] ) ram( parts, 0.12, [ s * 1.2, 1.75, - 1.4 ], [ s * 0.3, 9.0, lz + 0.3 ] );
	parts.box( body, [ 0.95, 0.6, 1.3 ], [ 0, top, lz - 0.2 ] );
	for ( const z of [ lz - 0.6, lz + 0.2 ] ) parts.rod( dark, [ - 0.3, top + 0.55, z ], [ 0.3, top + 0.55, z ], 0.32, 16 );

	// The vibrator train in front of the leader: the sledge, the receiver hopper over the tubes, the
	// extension tubes, the vibrator with its tip on the ground, and the stone tube beside them.
	const vz = lz - 0.85;
	parts.box( body, [ 0.85, 1.6, 0.35 ], [ 0, 13.6, lz - 0.48 ] );
	parts.box( dark, [ 1.0, 1.1, 1.0 ], [ 0, 15.2, vz ] );
	parts.box( dark, [ 1.2, 0.08, 1.2 ], [ 0, 16.3, vz ] );
	parts.rod( STEEL(), [ 0, 3.6, vz ], [ 0, 15.2, vz ], 0.19, 16 );
	for ( let y = 6.6; y < 15; y += 3 ) parts.cylinder( dark, 0.22, 0.12, [ 0, y, vz ], 16 );
	parts.rod( paint( 0x8a8f94 ), [ 0, 0.45, vz ], [ 0, 3.6, vz ], 0.21, 16 );
	parts.cylinder( dark, 0.06, 0.45, [ 0, 0, vz ], 16, 0.21 );
	parts.rod( STEEL(), [ 0.3, 0.5, vz ], [ 0.3, 15.2, vz ], 0.08, 10 );
	parts.path( HOSE(), [ [ - 0.2, 3.7, vz + 0.15 ], [ - 0.3, 13.4, lz - 0.6 ], [ - 0.35, 14.0, lz - 0.2 ] ], 0.04, 6 );
	parts.cylinder( STONE(), 0.9, 0.15, [ 0, 0, vz ], 18, 0.3 );

	// The stone skip at the foot of the leader on its guides, and its hoist rope to the head.
	for ( const s of [ - 1, 1 ] ) parts.box( BRIGHT(), [ 0.06, 14.5, 0.06 ], [ 0.42, 0.9, lz + s * 0.22 ] );
	parts.prism( dark, [ [ lz - 0.55, 0.5 ], [ lz + 0.55, 0.5 ], [ lz + 0.7, 1.7 ], [ lz - 0.7, 1.7 ] ], 1.0, 0.98 );
	parts.box( STONE(), [ 0.95, 0.05, 1.3 ], [ 0.98, 1.66, lz ] );
	parts.rod( BRIGHT(), [ 0.98, 1.7, lz ], [ 0.98, top + 0.1, lz ], 0.012, 4 );
	return parts.build();

}

// --- auger boring machine ------------------------------------------------------------------

// A 36 in auger boring machine set up to jack a 20 ft joint of 36 in steel casing, as it stands on
// the floor of its bore pit (about 10.5 m long): 30 ft of track on timber sleepers with thrust lugs
// along its rails, the thrust block of a steel plate and stacked timbers behind it, the machine at
// the back of the track (thrust rams, cradle, engine, gearbox with the casing pusher, the
// operator's seat and levers on the left), its spoil chute and the spoil pile, and the casing
// from the pusher over a saddle at the front of the track to the auger's cutting head.
function augerBoring() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();

	// Track: two rails on timber sleepers, with thrust lugs along them.
	const t0 = - 5.0;
	const t1 = t0 + 30 * FT;
	const railTop = 0.35;
	for ( let z = t0 + 0.3; z < t1; z += 1.2 ) parts.box( TIMBER(), [ 1.6, 0.15, 0.2 ], [ 0, 0, z ] );
	for ( const x of [ - 0.5, 0.5 ] ) {

		parts.box( dark, [ 0.2, 0.2, t1 - t0 ], [ x, 0.15, ( t0 + t1 ) / 2 ] );
		for ( let z = t0 + 0.5; z < t1; z += 0.6 ) parts.box( dark, [ 0.06, 0.08, 0.1 ], [ x, railTop, z ] );

	}

	// Thrust block: a steel plate across the track's end and timbers stacked behind it, which bear
	// on the pit's back wall.
	const back = 5.0;
	parts.box( dark, [ 2.4, 1.2, 0.08 ], [ 0, 0, t1 + 0.04 ] );
	for ( let i = 0; i < 6; i ++ ) parts.box( TIMBER(), [ 2.2, 0.18, back - t1 - 0.08 ], [ 0, i * 0.2, ( t1 + 0.08 + back ) / 2 ] );

	// The machine: push block in the lugs with the two thrust rams, the cradle on the rails, the
	// engine housing, the gearbox at the front with the casing pusher, the seat and controls.
	const m1 = t1 - 0.85;
	const m0 = m1 - 2.6;
	const cy = 1.2;
	parts.box( dark, [ 1.3, 0.3, 0.25 ], [ 0, railTop, t1 - 0.2 ] );
	for ( const s of [ - 1, 1 ] ) ram( parts, 0.09, [ s * 0.5, railTop + 0.18, t1 - 0.3 ], [ s * 0.5, railTop + 0.18, m1 ] );
	parts.box( dark, [ 1.4, 0.25, m1 - m0 ], [ 0, railTop, ( m0 + m1 ) / 2 ] );
	parts.box( body, [ 1.4, 0.95, 1.55 ], [ 0, railTop + 0.25, m1 - 0.8 ] );
	for ( const s of [ - 1, 1 ] ) louvres( parts, dark, s * 0.705, railTop + 0.5, m1 - 0.8, 6, 1.0 );
	parts.rod( BRIGHT(), [ 0.45, railTop + 1.2, m1 - 0.4 ], [ 0.45, railTop + 1.6, m1 - 0.4 ], 0.05, 8 );
	parts.box( body, [ 1.3, 1.15, 0.85 ], [ 0, railTop + 0.25, m0 + 0.42 ] );
	parts.rod( dark, [ 0, cy, m0 + 0.04 ], [ 0, cy, m0 - 0.04 ], 0.56, 24 );
	parts.box( dark, [ 0.6, 0.06, 0.9 ], [ - 1.0, railTop + 0.15, m1 - 0.9 ] );
	for ( const z of [ m1 - 1.3, m1 - 0.5 ] ) member( parts, dark, [ 0.06, 0.06 ], [ - 0.7, railTop + 0.3, z ], [ - 1.2, railTop + 0.18, z ] );
	seat( parts, [ - 1.0, railTop + 0.65, m1 - 0.75 ] );
	parts.box( dark, [ 0.3, 0.6, 0.25 ], [ - 1.0, railTop + 0.2, m1 - 1.3 ] );
	for ( let i = 0; i < 4; i ++ ) parts.rod( BRIGHT(), [ - 1.1 + i * 0.07, railTop + 0.8, m1 - 1.3 ], [ - 1.1 + i * 0.07, railTop + 1.0, m1 - 1.25 ], 0.01, 5 );

	// Spoil chute off the right of the gearbox and the pile of spoil it has dropped.
	parts.block( dark, [ 0.35, 0.3, 0.5 ], [ 0.85, railTop + 0.25, m0 + 0.2 ], [ 0, 0, - 30 * DEG ] );
	parts.cylinder( SOIL(), 0.7, 0.45, [ 1.15, 0, m0 + 0.1 ], 16, 0.15 );

	// The casing from the pusher over its saddle, and the auger's cutting head just out of its end.
	const r = 18 * IN;
	const c1 = m0 - 0.04 - 20 * FT;
	parts.rod( RUST(), [ 0, cy, m0 - 0.04 ], [ 0, cy, c1 ], r, 28 );
	parts.rod( SHAFT(), [ 0, cy, c1 + 0.05 ], [ 0, cy, c1 - 0.005 ], r - 0.015, 28 );
	parts.prism( dark, [ [ t0 + 0.4, railTop ], [ t0 + 0.8, railTop ], [ t0 + 0.8, cy - r * 0.55 ], [ t0 + 0.4, cy - r * 0.55 ] ], 1.2, 0 );
	parts.rod( STEEL(), [ 0, cy, c1 + 0.05 ], [ 0, cy, c1 - 0.2 ], 0.09, 10 );
	for ( const a of [ 0, Math.PI / 2 ] ) parts.block( STEEL(), [ 0.8, 0.08, 0.06 ], [ 0, cy, c1 - 0.08 ], [ 0, 0, a + Math.PI / 4 ] );
	return parts.build();

}

// --- static pipe burster -------------------------------------------------------------------

// A static pipe bursting unit of the Grundoburst 800G class as it stands in its machine pit (about
// 2.1 m long and 0.85 m wide): the thrust plate that bears on the pit's front face round the old
// pipe, the frame rails and twin push cylinders with the rod carriage between them, the rods out
// through the plate, and a basket of rods behind it with the hydraulic hoses running off to the
// power pack.
function pipeBurster() {

	const parts = new Parts();
	const body = paint( 0xc8102e );
	const dark = DARK();
	const py = 0.5;

	// Thrust plate, frame rails on skids, twin cylinders, the carriage and front crosshead.
	const f0 = - 1.0;
	const f1 = f0 + 2.1;
	parts.box( body, [ 0.85, 0.85, 0.08 ], [ 0, 0.08, f0 - 0.04 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( dark, [ 0.16, 0.1, f1 - f0 ], [ s * 0.3, 0, ( f0 + f1 ) / 2 ] );
		member( parts, body, [ 0.12, 0.2 ], [ s * 0.3, 0.2, f0 ], [ s * 0.3, 0.2, f1 ] );
		parts.rod( dark, [ s * 0.27, 0.62, f0 + 0.2 ], [ s * 0.27, 0.62, f0 + 1.3 ], 0.1, 12 );
		parts.rod( BRIGHT(), [ s * 0.27, 0.62, f0 + 1.3 ], [ s * 0.27, 0.62, f1 - 0.1 ], 0.06, 10 );

	}

	parts.box( body, [ 0.8, 0.45, 0.3 ], [ 0, 0.3, f1 - 0.2 ] );
	parts.box( body, [ 0.75, 0.3, 0.25 ], [ 0, 0.3, f0 + 0.12 ] );
	parts.rod( STEEL(), [ 0, py, f1 - 0.2 ], [ 0, py, f0 - 0.35 ], 0.035, 10 );
	parts.rod( dark, [ 0, py, f0 - 0.3 ], [ 0, py, f0 - 0.36 ], 0.05, 10 );

	// Rod basket behind the unit, full of rods.
	const bz = f1 + 0.5;
	parts.box( dark, [ 0.85, 0.04, 0.6 ], [ 0, 0.05, bz ] );
	for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) parts.box( dark, [ 0.04, 0.45, 0.04 ], [ sx * 0.41, 0, bz + sz * 0.28 ] );
	for ( const sz of [ - 1, 1 ] ) parts.box( dark, [ 0.86, 0.03, 0.03 ], [ 0, 0.42, bz + sz * 0.28 ] );
	for ( let k = 0; k < 15; k ++ ) parts.rod( STEEL(), [ - 0.38, 0.13 + Math.floor( k / 5 ) * 0.07, bz - 0.22 + ( k % 5 ) * 0.11 ], [ 0.38, 0.13 + Math.floor( k / 5 ) * 0.07, bz - 0.22 + ( k % 5 ) * 0.11 ], 0.032, 8 );

	// Hydraulic hoses from the unit, off along the ground to the right.
	for ( let i = 0; i < 3; i ++ ) parts.path( HOSE(), [ [ 0.3, 0.55, f1 - 0.3 - i * 0.08 ], [ 0.5, 0.15, f1 - 0.3 - i * 0.08 ], [ 0.75, 0.022, f1 - 0.2 - i * 0.08 ], [ 1.2, 0.022, f1 + 0.3 - i * 0.08 ] ], 0.022, 6 );
	return parts.build();

}

// A diesel hydraulic power pack for a static pipe burster, on its skid (about 2.2 m long, 1.1 m
// wide and 1.35 m high): the sound-attenuated enclosure with its louvres, exhaust and control
// panel, a lifting bar over it, and the hose reel at the back with the pressure and return hoses
// wound on.
function burstPowerPack() {

	const parts = new Parts();
	const body = paint( 0xc8102e );
	const dark = DARK();
	parts.box( dark, [ 1.1, 0.12, 2.2 ], [ 0, 0, 0 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( SHAFT(), [ 1.12, 0.07, 0.22 ], [ 0, 0.025, s * 0.55 ] );
	parts.box( body, [ 1.05, 1.0, 1.35 ], [ 0, 0.12, - 0.38 ] );
	for ( const s of [ - 1, 1 ] ) louvres( parts, dark, s * 0.53, 0.4, - 0.5, 6, 0.8 );
	for ( let i = 0; i < 7; i ++ ) parts.box( dark, [ 0.8, 0.03, 0.02 ], [ 0, 0.35 + i * 0.09, - 1.06 ] );
	parts.box( dark, [ 0.03, 0.35, 0.3 ], [ 0.535, 0.55, 0.05 ] );
	parts.rod( BRIGHT(), [ - 0.3, 1.12, - 0.8 ], [ - 0.3, 1.35, - 0.8 ], 0.035, 8 );
	parts.cylinder( dark, 0.05, 0.03, [ 0.3, 1.12, - 0.2 ], 10 );
	for ( const z of [ - 0.95, 0.2 ] ) parts.box( dark, [ 0.06, 0.18, 0.06 ], [ 0, 1.12, z ] );
	parts.box( dark, [ 0.06, 0.06, 1.21 ], [ 0, 1.3, - 0.375 ] );

	// Hose reel at the back on its two stands.
	const rz = 0.62;
	const ry = 0.62;
	for ( const s of [ - 1, 1 ] ) {

		parts.box( dark, [ 0.06, ry - 0.12, 0.08 ], [ s * 0.46, 0.12, rz ] );
		parts.rod( body, [ s * 0.42 - 0.02, ry, rz ], [ s * 0.42 + 0.02, ry, rz ], 0.46, 20 );

	}

	parts.rod( HOSE(), [ - 0.4, ry, rz ], [ 0.4, ry, rz ], 0.36, 20 );
	parts.rod( STEEL(), [ - 0.5, ry, rz ], [ 0.5, ry, rz ], 0.04, 8 );
	for ( let i = 0; i < 2; i ++ ) parts.path( HOSE(), [ [ - 0.2 + i * 0.4, ry + 0.36, rz ], [ - 0.2 + i * 0.4, ry + 0.3, rz + 0.3 ], [ - 0.2 + i * 0.4, 0.15, rz + 0.45 ] ], 0.022, 6 );
	return parts.build();

}

// --- microtunnel shaft set-up ----------------------------------------------------------------

// The surface set-up for a 48 in microtunnel drive: the jacking shaft 12 × 26 ft inside, its
// steel sheet piling standing 3 ft proud with a guard rail on top and the ladder's top showing;
// the slurry lines and power cables over its edge; a 20 ft control container on the right with
// its door, window and air conditioner; the slurry separation plant on the left (tank skid,
// shaker screen, hydrocyclones, walkway); the jacking power unit beside the shaft; and a 10 ft
// joint of 48 in concrete jacking pipe staged behind on timbers.
function microtunnelSetup() {

	const parts = new Parts();
	const dark = DARK();
	const [ W, L, H ] = [ 12 * FT, 26 * FT, 3 * FT ];
	const [ hx, hz ] = [ W / 2, L / 2 ];
	const t = 0.3;

	// Shaft: piling, the dark of the shaft, guard rail and ladder top.
	pitWalls( parts, RUST(), [ W, L ], H, t );
	parts.box( SHAFT(), [ W, 0.01, L ], [ 0, 0, 0 ] );
	railing( parts, [ - hx - t / 2, hx + t / 2 ], [ - hz - t / 2, hz + t / 2 ], H, [ 0, 1, 2, 3 ], YELLOW() );
	ladder( parts, GALV(), [ - 0.9, hz - 0.1 ], 0, H + 1.0 );

	// Control container on the right.
	const cx = hx + t + 2.4;
	const [ cw, ch, cl ] = [ 2.44, 2.59, 6.06 ];
	const cz = - 0.6;
	parts.box( WHITE(), [ cw, ch, cl ], [ cx, 0, cz ] );
	for ( let z = cz - cl / 2 + 0.3; z < cz + cl / 2; z += 0.3 ) for ( const s of [ - 1, 1 ] ) parts.box( WHITE(), [ 0.04, ch - 0.25, 0.1 ], [ cx + s * ( cw / 2 + 0.02 ), 0.12, z ] );
	parts.box( dark, [ 0.06, 2.0, 0.9 ], [ cx - cw / 2 - 0.05, 0.25, cz + 1.6 ] );
	parts.box( GLASS(), [ 0.06, 0.8, 1.4 ], [ cx - cw / 2 - 0.05, 1.2, cz - 0.6 ] );
	parts.box( WHITE(), [ 0.7, 0.8, 0.6 ], [ cx - cw / 2 - 0.35, 1.5, cz - 2.2 ] );
	parts.box( GALV(), [ 0.8, 0.2, 1.0 ], [ cx - cw / 2 - 0.4, 0, cz + 1.6 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ cw, 0.1, 0.25 ], [ cx, 0, cz + s * ( cl / 2 - 0.4 ) ] );

	// Jacking power unit beside the shaft, its hoses over the wall.
	const jx = hx + t + 1.0;
	const jz = hz - 0.8;
	parts.box( paint( 0x2f7d4f ), [ 1.2, 1.2, 1.9 ], [ jx, 0, jz ] );
	louvres( parts, dark, jx + 0.605, 0.3, jz, 7, 1.2 );
	for ( let i = 0; i < 3; i ++ ) parts.path( HOSE(), [ [ jx - 0.6, 0.8, jz - 0.5 + i * 0.12 ], [ hx + t / 2, H + 0.12, jz - 0.5 + i * 0.12 ], [ hx - 0.15, H - 0.3, jz - 0.5 + i * 0.12 ], [ hx - 0.15, 0.1, jz - 0.5 + i * 0.12 ] ], 0.025, 6 );

	// Cables from the container into the shaft.
	for ( let i = 0; i < 2; i ++ ) parts.path( BLACK(), [ [ cx - cw / 2, 0.6, cz - 2.6 + i * 0.15 ], [ hx + t + 0.3, 0.04, cz - 2.6 + i * 0.15 ], [ hx + t / 2, H + 0.05, cz - 2.6 + i * 0.15 ], [ hx - 0.1, H - 0.2, cz - 2.6 + i * 0.15 ], [ hx - 0.1, 0.1, cz - 2.6 + i * 0.15 ] ], 0.025, 6 );

	// Separation plant on the left: tank skid, the shaker on top at the back, three hydrocyclones
	// over the front with their manifold, walkway rail, stairs, and the feed and return lines to
	// the shaft.
	const sx = - hx - t - 3.0;
	const [ sw, sh, sl ] = [ 2.5, 1.9, 9.0 ];
	const sz = 0.5;
	const tankTop = sh;
	parts.box( dark, [ sw + 0.1, 0.2, sl + 0.1 ], [ sx, 0, sz ] );
	parts.box( paint( 0x50616f ), [ sw, sh - 0.2, sl ], [ sx, 0.2, sz ] );
	for ( let z = sz - sl / 2 + 0.75; z < sz + sl / 2; z += 1.5 ) parts.box( dark, [ sw + 0.04, sh - 0.3, 0.08 ], [ sx, 0.25, z ] );
	parts.box( dark, [ sw + 0.06, 0.05, sl + 0.06 ], [ sx, tankTop, sz ] );
	const shakerZ = sz + sl / 2 - 1.5;
	parts.block( paint( 0x3d6fa8 ), [ 2.0, 0.55, 2.2 ], [ sx, tankTop + 0.6, shakerZ ], [ - 6 * DEG, 0, 0 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.12, 0.35, 0.12 ], [ sx + s * 0.9, tankTop, shakerZ - 0.8 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.12, 0.45, 0.12 ], [ sx + s * 0.9, tankTop, shakerZ + 0.8 ] );
	const cyclZ = sz - sl / 2 + 2.2;
	parts.rod( STEEL(), [ sx - 0.8, tankTop + 1.9, cyclZ ], [ sx + 0.8, tankTop + 1.9, cyclZ ], 0.12, 12 );
	for ( let i = 0; i < 3; i ++ ) {

		const x = sx - 0.6 + i * 0.6;
		parts.cylinder( STEEL(), 0.06, 1.0, [ x, tankTop + 0.45, cyclZ ], 14, 0.25 );
		parts.cylinder( STEEL(), 0.25, 0.45, [ x, tankTop + 1.45, cyclZ ], 14 );

	}

	for ( const s of [ - 1, 1 ] ) for ( const z of [ cyclZ - 0.35, cyclZ + 0.35 ] ) parts.box( dark, [ 0.08, 1.45, 0.08 ], [ sx + s * 0.95, tankTop, z ] );
	railing( parts, [ sx - sw / 2, sx + sw / 2 ], [ sz - sl / 2, sz + sl / 2 ], tankTop, [ 0, 1, 2, 3 ], YELLOW() );
	for ( let i = 0; i < 6; i ++ ) parts.box( GALV(), [ 0.8, 0.04, 0.28 ], [ sx + sw / 2 - 0.45, 0.3 * ( i + 1 ), sz - sl / 2 - 1.75 + i * 0.27 ] );
	for ( const s of [ - 1, 1 ] ) member( parts, GALV(), [ 0.05, 0.15 ], [ sx + sw / 2 - 0.45 + s * 0.42, 0.05, sz - sl / 2 - 1.9 ], [ sx + sw / 2 - 0.45 + s * 0.42, tankTop, sz - sl / 2 - 0.15 ] );
	for ( const [ i, colour ] of [ BLACK(), paint( 0x6b6f73 ) ].entries() ) {

		const z = - 1.8 + i * 0.4;
		parts.path( colour, [ [ sx + sw / 2, 0.7, z ], [ - hx - t - 0.4, 0.09, z ], [ - hx - t / 2, H + 0.09, z ], [ - hx + 0.15, H - 0.3, z ], [ - hx + 0.15, 0.1, z ] ], 0.085, 10 );

	}

	// A joint of 48 in jacking pipe (58 in outside) staged behind the shaft on two timbers.
	const r = 29 * IN;
	const p0 = hz + t + 1.0;
	const p1 = p0 + 10 * FT;
	for ( const z of [ p0 + 0.6, p1 - 0.6 ] ) parts.box( TIMBER(), [ 1.8, 0.15, 0.15 ], [ 0, 0, z ] );
	parts.rod( CONCRETE(), [ 0, 0.15 + r, p0 + 0.01 ], [ 0, 0.15 + r, p1 - 0.01 ], r, 28 );
	parts.rod( SHAFT(), [ 0, 0.15 + r, p0 ], [ 0, 0.15 + r, p1 ], 24 * IN, 24 );
	return parts.build();

}

// --- vacuum excavator trailer ----------------------------------------------------------------

// A tandem-axle vacuum excavator trailer of the 800 gal class (about 6.1 m long and 2.4 m wide):
// the tongue and jack, the engine and blower enclosure, the 500 gal water tank, the 800 gal debris
// tank with its rear door, and the 15 ft boom on the tank swung out to the right front with the 6
// in suction hose hanging from it to a dig tube on the ground, as when potholing.
function vacTrailer() {

	const parts = new Parts();
	const body = ORANGE();
	const dark = DARK();

	// Frame, tongue, coupler and jack; tandem axles with fenders.
	const deck = 0.62;
	for ( const x of [ - 0.5, 0.5 ] ) parts.box( dark, [ 0.1, 0.18, 4.9 ], [ x, deck - 0.18, 0.15 ] );
	for ( const s of [ - 1, 1 ] ) member( parts, dark, [ 0.1, 0.15 ], [ s * 0.5, deck - 0.1, - 2.3 ], [ 0, deck - 0.1, - 3.45 ] );
	parts.box( dark, [ 0.2, 0.15, 0.3 ], [ 0, deck - 0.2, - 3.5 ] );
	parts.rod( dark, [ 0.25, deck + 0.2, - 3.0 ], [ 0.25, 0.12, - 3.0 ], 0.04, 8 );
	parts.box( dark, [ 0.18, 0.12, 0.18 ], [ 0.25, 0, - 3.0 ] );
	for ( const z of [ 0.75, 1.55 ] ) {

		parts.rod( dark, [ - 1.0, 0.36, z ], [ 1.0, 0.36, z ], 0.04, 8 );
		for ( const s of [ - 1, 1 ] ) tyre( parts, 0.36, 0.22, [ s * 1.0, z ] );

	}

	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.3, 0.04, 1.75 ], [ s * 1.02, 0.8, 1.15 ] );
	parts.box( dark, [ 2.0, 0.08, 4.8 ], [ 0, deck, 0.15 ] );

	// Engine and blower enclosure at the front, the water tank behind it.
	parts.box( body, [ 1.95, 1.3, 1.2 ], [ 0, deck + 0.08, - 1.7 ] );
	for ( const s of [ - 1, 1 ] ) louvres( parts, dark, s * 0.985, deck + 0.4, - 1.7, 7, 0.8 );
	parts.rod( BRIGHT(), [ 0.6, deck + 1.38, - 1.9 ], [ 0.6, deck + 1.75, - 1.9 ], 0.04, 8 );
	parts.box( plastic( 0xe8e6de ), [ 1.95, 1.05, 0.95 ], [ 0, deck + 0.08, - 0.55 ] );
	parts.box( dark, [ 1.97, 0.04, 0.97 ], [ 0, deck + 0.5, - 0.55 ] );

	// Debris tank with its saddles, the rear door on its hinge and clamps.
	const tr = 0.68;
	const ty = deck + 0.08 + tr;
	const t0 = - 0.05;
	const t1 = 2.3;
	for ( const z of [ t0 + 0.3, t1 - 0.3 ] ) parts.box( dark, [ 1.4, 0.3, 0.12 ], [ 0, deck + 0.08, z ] );
	parts.rod( body, [ 0, ty, t0 ], [ 0, ty, t1 ], tr, 24 );
	for ( const z of [ t0 + 0.05, t1 - 0.05 ] ) parts.rod( dark, [ 0, ty, z - 0.03 ], [ 0, ty, z + 0.03 ], tr + 0.02, 24 );
	parts.rod( dark, [ 0, ty, t1 ], [ 0, ty, t1 + 0.06 ], tr - 0.02, 24 );
	parts.box( dark, [ 0.3, 0.1, 0.12 ], [ 0, ty + tr - 0.05, t1 + 0.02 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( BRIGHT(), [ 0.08, 0.12, 0.1 ], [ s * 0.55, ty - 0.2, t1 + 0.08 ] );
	parts.box( RED_LAMP(), [ 0.12, 0.06, 0.03 ], [ - 0.85, deck - 0.05, 2.62 ] );
	parts.box( RED_LAMP(), [ 0.12, 0.06, 0.03 ], [ 0.85, deck - 0.05, 2.62 ] );

	// The boom on its pedestal at the front of the tank, swung 35° to the right and raised a
	// little, with the suction hose along it and hanging from its tip to a dig tube.
	const foot = [ 0, ty + tr + 0.35, t0 + 0.35 ];
	parts.cylinder( dark, 0.2, 0.35, [ 0, ty + tr - 0.02, t0 + 0.35 ], 14 );
	const swing = 35 * DEG;
	const rise = 8 * DEG;
	const reach = 15 * FT;
	const tip = add( foot, [ Math.sin( swing ) * Math.cos( rise ), Math.sin( rise ), - Math.cos( swing ) * Math.cos( rise ) ], reach );
	member( parts, body, [ 0.2, 0.24 ], foot, tip );
	ram( parts, 0.04, add( foot, [ 0, - 0.25, 0.05 ] ), lerp( foot, tip, 0.35 ) );
	const hr = 3 * IN;
	parts.path( HOSE(), [ [ 0, ty + tr, t0 + 0.75 ], add( foot, [ 0, 0.2, 0.3 ] ), add( lerp( foot, tip, 0.5 ), [ 0, 0.2, 0 ] ), add( tip, [ 0.08, 0.18, - 0.05 ] ), add( tip, [ 0.2, - 0.6, - 0.1 ] ), [ tip[ 0 ] + 0.25, 1.1, tip[ 2 ] - 0.05 ] ], hr, 12 );
	parts.rod( BRIGHT(), [ tip[ 0 ] + 0.25, 1.1, tip[ 2 ] - 0.05 ], [ tip[ 0 ] + 0.25, 0.02, tip[ 2 ] - 0.05 ], hr * 0.85, 12 );
	parts.box( dark, [ 0.5, 0.05, 0.05 ], [ tip[ 0 ] + 0.25, 0.85, tip[ 2 ] - 0.05 ] );
	parts.cylinder( SOIL(), 0.35, 0.08, [ tip[ 0 ] + 0.25, 0, tip[ 2 ] - 0.05 ], 14, 0.24 );
	return parts.build();

}

// --- trench roller ---------------------------------------------------------------------------

// A remote-controlled articulated trench roller of the Rammax / BW 85 T class (1.87 m long, 0.85 m
// wide and 1.27 m to its lifting eye): four padfoot drums in two pairs, a body over each pair
// joined at the articulation, the engine under the front hood, the lifting eye on top, a beacon
// and the remote receiver.
function trenchRoller() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();
	const r = 0.26;
	const core = 0.205;

	// Drums: each axle has two drums side by side, padfeet all round.
	for ( const z of [ - 0.6, 0.6 ] ) {

		for ( const s of [ - 1, 1 ] ) {

			parts.rod( dark, [ s * 0.012, r, z ], [ s * 0.425, r, z ], core, 18 );
			for ( let i = 0; i < 14; i ++ ) {

				const angle = ( i + ( s > 0 ? 0.5 : 0 ) ) / 14 * Math.PI * 2;
				for ( let k = 0; k < 3; k ++ ) {

					const x = s * ( 0.07 + k * 0.135 );
					parts.block( dark, [ 0.08, 0.06, 0.065 ], [ x, r + ( core + 0.025 ) * Math.cos( angle ), z + ( core + 0.025 ) * Math.sin( angle ) ], [ angle, 0, 0 ] );

				}

			}

		}

	}

	// The two bodies, the articulation between them, bumpers and scraper bars.
	parts.box( body, [ 0.82, 0.55, 0.78 ], [ 0, 0.5, - 0.56 ] );
	parts.box( body, [ 0.82, 0.48, 0.74 ], [ 0, 0.5, 0.56 ] );
	for ( const z of [ - 0.6, 0.6 ] ) for ( const s of [ - 1, 1 ] ) parts.box( body, [ 0.03, 0.28, 0.62 ], [ s * 0.395, 0.24, z ] );
	parts.box( dark, [ 0.3, 0.3, 0.3 ], [ 0, 0.35, 0 ] );
	parts.box( dark, [ 0.84, 0.1, 0.06 ], [ 0, 0.52, - 0.93 ] );
	parts.box( dark, [ 0.84, 0.1, 0.06 ], [ 0, 0.52, 0.93 ] );
	for ( const z of [ - 0.87, 0.87 ] ) parts.box( dark, [ 0.8, 0.02, 0.06 ], [ 0, 0.3, z ] );

	// Front hood (the engine) with louvres and a fuel cap, the lifting eye, the beacon and receiver.
	parts.box( body, [ 0.74, 0.08, 0.66 ], [ 0, 1.05, - 0.56 ] );
	for ( const s of [ - 1, 1 ] ) louvres( parts, dark, s * 0.415, 0.65, - 0.56, 4, 0.5 );
	parts.cylinder( dark, 0.04, 0.03, [ 0.25, 1.13, - 0.75 ], 10 );
	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.04, 0.12, 0.04 ], [ s * 0.07, 1.13, - 0.45 ] );
	parts.box( dark, [ 0.18, 0.04, 0.04 ], [ 0, 1.23, - 0.45 ] );
	parts.cylinder( AMBER(), 0.04, 0.08, [ - 0.28, 0.98, 0.75 ], 10 );
	parts.box( dark, [ 0.12, 0.06, 0.12 ], [ 0.25, 0.98, 0.6 ] );
	parts.rod( dark, [ 0.28, 1.04, 0.6 ], [ 0.28, 1.2, 0.6 ], 0.008, 4 );
	return parts.build();

}

// --- mini track dumper -----------------------------------------------------------------------

// A 1.5 t mini track dumper (about 2.85 m long with its platform down, 1.07 m wide and 1.5 m to
// the handles): rubber tracks, the tipping skip at the front with a load of dirt in it, the engine
// under the hood behind it, and the operator's console and handles over the fold-down platform at
// the back.
function miniDumper() {

	const parts = new Parts();
	const body = ORANGE();
	const dark = DARK();
	for ( const s of [ - 1, 1 ] ) rubberTrack( parts, s * 0.42, 0, 1.45, 0.38, 0.23 );
	parts.box( dark, [ 0.6, 0.18, 1.35 ], [ 0, 0.25, 0 ] );
	parts.box( dark, [ 1.0, 0.08, 1.5 ], [ 0, 0.42, - 0.05 ] );

	// The skip on its pivot and tipping ram, with dirt heaped in it.
	parts.prism( body, [ [ - 1.0, 0.5 ], [ 0.12, 0.5 ], [ 0.22, 1.12 ], [ - 1.35, 1.12 ] ], 1.1, 0 );
	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.05, 0.05, 1.6 ], [ s * 0.55, 1.1, - 0.57 ] );
	for ( const z of [ - 1.35, 0.2 ] ) parts.box( dark, [ 1.14, 0.05, 0.05 ], [ 0, 1.1, z ] );
	parts.sphere( SOIL(), 0.6, [ 0, 1.1, - 0.55 ], [ 14, 8 ], [ 0.85, 0.32, 1.25 ] );
	ram( parts, 0.04, [ 0, 0.45, 0.0 ], [ 0, 0.55, - 0.6 ] );

	// Engine under the hood, louvred, and the exhaust.
	parts.box( body, [ 0.95, 0.55, 0.62 ], [ 0, 0.45, 0.62 ] );
	for ( const s of [ - 1, 1 ] ) louvres( parts, dark, s * 0.48, 0.6, 0.62, 4, 0.4 );
	parts.rod( BRIGHT(), [ - 0.3, 1.0, 0.75 ], [ - 0.3, 1.15, 0.75 ], 0.025, 8 );

	// The console with its levers and the handle loop, and the platform folded down behind.
	parts.block( dark, [ 0.8, 0.12, 0.25 ], [ 0, 1.15, 0.92 ], [ 25 * DEG, 0, 0 ] );
	for ( let i = 0; i < 4; i ++ ) parts.rod( BRIGHT(), [ - 0.18 + i * 0.12, 1.2, 0.93 ], [ - 0.18 + i * 0.12, 1.33, 0.98 ], 0.01, 5 );
	parts.path( dark, [ [ - 0.42, 1.0, 0.92 ], [ - 0.42, 1.45, 1.02 ], [ 0.42, 1.45, 1.02 ], [ 0.42, 1.0, 0.92 ] ], 0.02, 6 );
	for ( const s of [ - 1, 1 ] ) member( parts, dark, [ 0.04, 0.04 ], [ s * 0.3, 0.42, 0.9 ], [ s * 0.3, 0.27, 1.1 ] );
	parts.box( dark, [ 0.7, 0.05, 0.45 ], [ 0, 0.23, 1.3 ] );
	return parts.build();

}

// --- walk-behind trencher --------------------------------------------------------------------

// A walk-behind chain trencher digging 36 in deep with a 6 in chain (about 2.8 m long and 0.8 m
// wide): four tyres, the frame with the engine on top, the handlebars and controls at the front
// where the operator walks, and the boom at the back let down until its tip rests on the ground,
// with the digging chain round it and the crumber augers at its foot.
function walkTrencher() {

	const parts = new Parts();
	const body = ORANGE();
	const dark = DARK();

	// Wheels and frame, the engine and its fuel tank on top.
	for ( const z of [ - 0.45, 0.25 ] ) for ( const s of [ - 1, 1 ] ) tyre( parts, 0.2, 0.15, [ s * 0.32, z ] );
	parts.box( body, [ 0.5, 0.35, 1.0 ], [ 0, 0.22, - 0.1 ] );
	parts.box( dark, [ 0.42, 0.35, 0.42 ], [ 0, 0.57, - 0.05 ] );
	parts.box( paint( 0xb3262a ), [ 0.3, 0.15, 0.25 ], [ 0, 0.92, - 0.05 ] );
	parts.rod( BRIGHT(), [ 0.22, 0.75, 0.1 ], [ 0.3, 0.75, 0.1 ], 0.03, 8 );
	parts.box( dark, [ 0.2, 0.3, 0.25 ], [ - 0.3, 0.45, 0.25 ] );

	// Handlebars and controls at the front.
	for ( const s of [ - 1, 1 ] ) parts.path( dark, [ [ s * 0.2, 0.45, - 0.55 ], [ s * 0.24, 0.85, - 0.95 ], [ s * 0.26, 1.0, - 1.05 ] ], 0.02, 6 );
	parts.rod( dark, [ - 0.3, 1.0, - 1.05 ], [ 0.3, 1.0, - 1.05 ], 0.02, 6 );
	parts.box( dark, [ 0.3, 0.08, 0.12 ], [ 0, 0.94, - 0.98 ] );
	for ( const s of [ - 1, 1 ] ) parts.rod( RUBBER(), [ s * 0.3, 1.0, - 1.05 ], [ s * 0.2, 1.0, - 1.05 ], 0.025, 8 );

	// The boom: from its pivot at the back down to its tip on the ground, the chain round it with
	// teeth, the head shaft guard and the crumber augers either side of its foot.
	const pivot = [ 0, 0.48, 0.45 ];
	const tipR = 0.12;
	const tipZ = pivot[ 2 ] + 1.2;
	const tipC = [ 0, tipR, tipZ ];
	member( parts, dark, [ 0.05, 0.18 ], pivot, tipC );
	const a = Math.atan2( pivot[ 1 ] - tipC[ 1 ], tipC[ 2 ] - pivot[ 2 ] );
	const n = [ 0, Math.cos( a ), Math.sin( a ) ];
	for ( const s of [ - 1, 1 ] ) member( parts, BLACK(), [ 6 * IN, 0.035 ], add( pivot, n, s * 0.11 ), add( tipC, n, s * 0.11 ) );
	parts.rod( BLACK(), [ - 3 * IN, tipR, tipZ ], [ 3 * IN, tipR, tipZ ], tipR, 14 );
	for ( let i = 1; i < 13; i ++ ) {

		const p = lerp( pivot, tipC, i / 13 );
		for ( const s of [ - 1, 1 ] ) parts.block( STEEL(), [ 0.04, 0.06, 0.03 ], add( p, n, s * 0.15 ), [ - a, 0, 0 ] );

	}

	parts.rod( dark, [ - 0.12, pivot[ 1 ], pivot[ 2 ] ], [ 0.12, pivot[ 1 ], pivot[ 2 ] ], 0.14, 14 );
	for ( const s of [ - 1, 1 ] ) auger( parts, STEEL(), [ s * 0.1, 0.18, pivot[ 2 ] + 0.15 ], [ s * 0.38, 0.18, pivot[ 2 ] + 0.15 ], 0.11, 0.1 );
	parts.box( body, [ 0.6, 0.06, 0.3 ], [ 0, 0.32, pivot[ 2 ] + 0.15 ] );
	return parts.build();

}

// --- wellpoint dewatering system ---------------------------------------------------------------

// A 100 ft run of wellpoint dewatering along a trench: 6 in header pipe on blocks with grooved
// couplings every 20 ft and end caps, 20 wellpoint risers jetted in at 5 ft centres on the trench
// side, each with its valve and a flexible swing hose to a take-off on the header, and a diesel
// wellpoint pump (vacuum tank, pump and engine on a skid) on the other side of the header in the
// middle, its suction hose to a tee and its discharge hose laid out.
function wellpointSystem() {

	const parts = new Parts();
	const dark = DARK();
	const header = mat( 0x3f4a55, { roughness: 0.6, metalness: 0.4 } );
	const run = 100 * FT;
	const hr = 3.3 * IN;
	const hy = 0.12 + hr;

	// Header, couplings, caps and blocks.
	parts.rod( header, [ 0, hy, - run / 2 ], [ 0, hy, run / 2 ], hr, 16 );
	for ( let i = 1; i < 5; i ++ ) parts.rod( dark, [ 0, hy, - run / 2 + i * 20 * FT - 0.05 ], [ 0, hy, - run / 2 + i * 20 * FT + 0.05 ], hr + 0.015, 16 );
	for ( const s of [ - 1, 1 ] ) parts.rod( dark, [ 0, hy, s * run / 2 ], [ 0, hy, s * ( run / 2 - 0.08 ) ], hr + 0.012, 16 );
	for ( let z = - run / 2 + 1.5; z < run / 2; z += 10 * FT ) parts.box( TIMBER(), [ 0.4, 0.12, 0.15 ], [ 0, 0, z ] );

	// Wellpoints on the trench side: riser, valve, swing hose to the header's take-off.
	const wx = - 0.9;
	for ( let i = 0; i < 20; i ++ ) {

		const z = - run / 2 + ( i + 0.5 ) * 5 * FT;
		parts.rod( GALV(), [ wx, 0, z ], [ wx, 0.5, z ], 0.024, 8 );
		parts.box( paint( 0xb3262a ), [ 0.07, 0.07, 0.07 ], [ wx, 0.42, z ] );
		parts.rod( dark, [ - hr + 0.01, hy, z ], [ - hr - 0.08, hy, z ], 0.025, 8 );
		parts.path( mat( 0x2a2c2e, { roughness: 0.6 } ), [ [ wx, 0.5, z ], [ wx + 0.08, 0.68, z ], [ - 0.45, 0.62, z ], [ - hr - 0.08, hy, z ] ], 0.02, 6 );

	}

	// The pump on its skid on the other side, in the middle.
	const px = 2.0;
	const pump = paint( 0x2f7d4f );
	parts.box( dark, [ 1.3, 0.15, 2.8 ], [ px, 0, 0 ] );
	parts.box( pump, [ 1.2, 1.05, 1.5 ], [ px, 0.15, 0.55 ] );
	for ( const s of [ - 1, 1 ] ) louvres( parts, dark, px + s * 0.605, 0.45, 0.6, 6, 1.0 );
	parts.rod( BRIGHT(), [ px + 0.35, 1.2, 0.9 ], [ px + 0.35, 1.6, 0.9 ], 0.04, 8 );
	parts.cylinder( pump, 0.3, 0.85, [ px - 0.2, 0.15, - 0.85 ], 16 );
	parts.box( dark, [ 0.45, 0.45, 0.4 ], [ px + 0.3, 0.15, - 0.75 ] );
	parts.rod( dark, [ px + 0.3, 0.4, - 0.55 ], [ px + 0.3, 0.4, - 0.2 ], 0.12, 12 );

	// Suction from a tee on the header to the pump, and the discharge laid out on the ground.
	parts.rod( dark, [ hr - 0.01, hy, 0 ], [ hr + 0.15, hy, 0 ], hr, 14 );
	parts.path( HOSE(), [ [ hr + 0.15, hy, 0 ], [ 0.8, hy + 0.05, - 0.3 ], [ px - 0.5, 0.45, - 0.85 ] ], hr, 14 );
	parts.path( HOSE(), [ [ px + 0.3, 0.55, - 0.95 ], [ px + 0.3, 0.6, - 1.4 ], [ px + 0.9, hr, - 1.7 ], [ px + 2.0, hr, - 1.7 ] ], hr, 14 );
	return parts.build();

}

// --- dewatering deep well --------------------------------------------------------------------

// A dewatering deep well at the surface: the 10 in steel casing standing out of a concrete pad
// with its well cap, the submersible pump's discharge up out of the cap with a pressure gauge, a
// check valve, a gate valve and a flow meter, the pipe down to a hose laid off to the right, the
// pump cable to the control panel on its post stand at the left, a sounding tube, and four
// bollards round the wellhead.
function deepWell() {

	const parts = new Parts();
	const dark = DARK();
	const pipe = paint( 0x3f4a55 );
	const casing = 5.375 * IN;
	const top = 0.85;

	// Pad, casing, cap and sounding tube.
	parts.box( CONCRETE(), [ 1.2, 0.15, 1.2 ], [ 0, 0, 0 ] );
	parts.rod( RUST(), [ 0, 0.15, 0 ], [ 0, top, 0 ], casing, 18 );
	parts.cylinder( dark, casing + 0.03, 0.03, [ 0, top, 0 ], 18 );
	parts.rod( GALV(), [ - 0.08, top + 0.03, 0.06 ], [ - 0.08, top + 0.18, 0.06 ], 0.016, 6 );

	// Discharge: up out of the cap, along to the right through a gauge, check valve, gate valve and
	// meter, down to the ground and off as hose.
	const pr = 2.25 * IN;
	const py = top + 0.35;
	parts.rod( pipe, [ 0.03, top + 0.03, 0 ], [ 0.03, py, 0 ], pr, 12 );
	parts.sphere( pipe, pr, [ 0.03, py, 0 ], [ 12, 6 ] );
	parts.rod( pipe, [ 0.03, py, 0 ], [ 2.2, py, 0 ], pr, 12 );
	parts.rod( dark, [ 0.25, py + pr, 0 ], [ 0.25, py + 0.15, 0 ], 0.012, 6 );
	parts.cylinder( paint( 0xe9e8e2 ), 0.05, 0.02, [ 0.25, py + 0.15, 0 ], 12 );
	parts.box( dark, [ 0.25, 0.18, 0.18 ], [ 0.65, py - 0.09, 0 ] );
	parts.box( paint( 0xb3262a ), [ 0.18, 0.2, 0.16 ], [ 1.0, py - 0.1, 0 ] );
	parts.rod( dark, [ 1.0, py + 0.1, 0 ], [ 1.0, py + 0.25, 0 ], 0.015, 6 );
	parts.rod( paint( 0xb3262a ), [ 1.0, py + 0.25, - 0.1 ], [ 1.0, py + 0.25, 0.1 ], 0.012, 6 );
	parts.box( paint( 0x2f5f9a ), [ 0.35, 0.22, 0.2 ], [ 1.45, py - 0.11, 0 ] );
	parts.box( dark, [ 0.12, 0.08, 0.04 ], [ 1.45, py + 0.11, - 0.08 ] );
	parts.sphere( pipe, pr, [ 2.2, py, 0 ], [ 12, 6 ] );
	parts.rod( pipe, [ 2.2, py, 0 ], [ 2.2, pr + 0.05, 0 ], pr, 12 );
	parts.box( dark, [ 0.25, 0.05, 0.25 ], [ 2.2, 0, 0 ] );
	parts.path( HOSE(), [ [ 2.2, pr + 0.05, 0 ], [ 2.5, pr, 0 ], [ 3.4, pr, 0.1 ] ], pr, 12 );

	// Pump cable from the cap to the panel, the panel on its two-post stand facing the front.
	const kx = - 1.6;
	parts.path( BLACK(), [ [ - 0.1, top + 0.03, - 0.04 ], [ - 0.4, top + 0.1, - 0.04 ], [ - 0.6, 0.03, 0 ], [ kx, 0.03, 0.05 ], [ kx, 0.85, 0.05 ] ], 0.015, 6 );
	for ( const s of [ - 1, 1 ] ) parts.box( GALV(), [ 0.04, 1.8, 0.04 ], [ kx + s * 0.3, 0, 0.12 ] );
	for ( const y of [ 0.95, 1.6 ] ) parts.box( GALV(), [ 0.7, 0.04, 0.04 ], [ kx, y, 0.12 ] );
	parts.box( mat( 0x9da3a8, { roughness: 0.5, metalness: 0.3 } ), [ 0.6, 0.75, 0.22 ], [ kx, 0.88, - 0.01 ] );
	parts.box( dark, [ 0.12, 0.08, 0.02 ], [ kx - 0.12, 1.4, - 0.13 ] );
	parts.cylinder( mat( 0x39b54a, { roughness: 0.3, emissive: 0x1a6b24 } ), 0.025, 0.02, [ kx + 0.15, 1.42, - 0.12 ], 10 );
	parts.box( dark, [ 0.65, 0.04, 0.3 ], [ kx, 1.63, 0.0 ] );

	// Bollards round the wellhead.
	for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) {

		parts.cylinder( YELLOW(), 0.057, 1.1, [ sx * 0.75, 0, sz * 0.75 ], 12 );
		parts.cylinder( YELLOW(), 0.057, 0.06, [ sx * 0.75, 1.1, sz * 0.75 ], 12, 0.02 );

	}

	return parts.build();

}
