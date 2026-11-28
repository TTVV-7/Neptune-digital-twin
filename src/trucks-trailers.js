import { DoubleSide, ExtrudeGeometry, MathUtils, Matrix4, PlaneGeometry, RepeatWrapping, Shape, Vector2, Vector3 } from 'three';
import { drawn, FT, IN, mat, Parts } from './parts.js';
import { memberGeometry } from './plant-parts.js';
import { cab, carrier, tracks } from './heavy-civil.js';
import { front as excavatorFront } from './earthmoving.js';
import { truck } from './road-plant.js';
import { centred, tractor } from './renewables.js';

// Delivery trucks, service trucks and equipment trailers built in code at the sizes of the common
// North American classes (no brands): the trucks that come through the gate every week (a
// knuckle-boom drywall delivery, a roll-off truck with its bin, a pneumatic cement tanker, a
// volumetric mixer, a sewer combo truck, a side dump, a 15-passenger crew van), the service rigs
// (a 55 ft insulated bucket truck and a field mechanic's truck with its crane), and the trailers a
// contractor tows (a gooseneck with a track loader, a tag-along with a mini excavator, a 5 x 10
// utility, a 7 x 14 dump trailer, a 500 gal fuel trailer and a lowboy carrying a 30 t excavator).
// Like the other built-in pieces each stands on y = 0 with its front facing -Z (+X on its right).

const DEG = MathUtils.DEG2RAD;
const _m = new Matrix4();
const UP = new Vector3( 0, 1, 0 );

export const TRUCKS_TRAILERS_ITEMS = [
	// Delivery trucks.
	{ id: 'knuckle-boom-delivery-truck', name: 'Knuckle-boom delivery truck, flatbed with rear-mount crane (tandem, 24 ft deck, outriggers set, boom unfolded, drywall load)', category: 'Cranes & lifts',
		keywords: 'boom truck knuckle boom crane truck drywall delivery gyprock sheetrock board stocker block brick truss delivery flatbed hiab articulating crane',
		build: knuckleBoomTruck },
	{ id: 'rolloff-truck-30yd', name: 'Roll-off truck, cable hoist, carrying a 30 yd³ bin (tandem)', category: 'Vehicles',
		keywords: 'roll off truck rolloff bin truck dumpster swap hooklift hook lift container truck garbage waste disposal tilt frame 30 yard',
		build: rollOffTruck },
	{ id: 'pneumatic-bulk-trailer', name: 'Pneumatic dry bulk trailer with tractor (1,600 ft³, 3 hoppers: cement / fly ash / sand)', category: 'Vehicles',
		keywords: 'pneumatic tanker cement tanker bulk trailer pig dry bulk blower fly ash frac sand lime silo fill hopper bottom',
		build: pneumaticTrailer },
	{ id: 'volumetric-mixer-truck', name: 'Volumetric concrete mixer truck (10 yd³, sand / stone / cement bins, swing auger chute)', category: 'Vehicles',
		keywords: 'volumetric mixer mobile mixer cemen tech zimmerman on demand concrete truck auger mixer batch on site',
		build: volumetricMixer },
	{ id: 'combo-jetter-vac-truck', name: 'Combination sewer cleaner truck, jetter-vacuum (Vactor 2100 class, front hose reel, boom)', category: 'Vehicles',
		keywords: 'vactor combo truck sewer cleaner jet vac jetter vacuum truck catch basin cleaning flushing storm sewer hydro jet',
		build: comboTruck },
	{ id: 'side-dump-trailer', name: 'Side dump trailer with tractor (tri-axle, 40 ft tub, tipped to one side)', category: 'Vehicles',
		keywords: 'side dump trailer side dumper sdt windrow base gravel riprap road building tractor trailer tipping',
		build: sideDump },
	{ id: 'crew-van-15', name: 'Crew van, 15-passenger high roof (148 in wheelbase, extended)', category: 'Vehicles',
		keywords: 'crew van passenger van 15 passenger transit sprinter high roof crew transport shuttle bus',
		build: crewVan },

	// Service trucks.
	{ id: 'bucket-truck-55ft', name: 'Bucket truck, insulated aerial device (55 ft working height, Class 7, outriggers set, boom raised)', category: 'Cranes & lifts',
		keywords: 'bucket truck cherry picker aerial device boom truck lineman utility line work street light insulated altec terex hi ranger',
		build: bucketTruck },
	{ id: 'mechanics-truck-crane', name: 'Field mechanic\'s service truck with telescopic crane (Class 6, 6,000 lb crane, compressor, 14 ft body)', category: 'Vehicles',
		keywords: 'mechanics truck service truck crane truck field service lube heavy equipment repair compressor welder iron',
		build: mechanicsTruck },

	// Equipment trailers.
	{ id: 'gooseneck-trailer-ctl', name: 'Gooseneck equipment trailer (25 + 5 ft dovetail, ramps up) with 1-ton dually pickup and compact track loader', category: 'Vehicles',
		keywords: 'gooseneck trailer deckover equipment trailer dually pickup track loader skid steer bobcat hauling float',
		build: gooseneckRig },
	{ id: 'tag-trailer-mini-excavator', name: 'Tag-along equipment trailer, bumper-pull (20 ft, 14,000 lb) with mini excavator and pickup', category: 'Vehicles',
		keywords: 'tag trailer bumper pull equipment trailer tagalong mini excavator mini ex pickup hauling 14k',
		build: tagRig },
	{ id: 'utility-trailer-5x10', name: 'Utility / landscape trailer, single axle (5 × 10 ft, mesh ramp gate)', category: 'Vehicles',
		keywords: 'utility trailer landscape trailer small trailer 5x10 mesh gate ramp lawn mower single axle',
		build: utilityTrailer },
	{ id: 'dump-trailer-7x14', name: 'Dump trailer, bumper-pull (7 × 14 ft, 14,000 lb, tarp kit, bed tipped)', category: 'Vehicles',
		keywords: 'dump trailer 7x14 bumper pull hydraulic dump tipping trailer scissor hoist tarp debris',
		build: dumpTrailer },
	{ id: 'fuel-trailer-500gal', name: 'Diesel fuel transfer trailer (500 gal double-wall, tandem, pump and hose reel)', category: 'Power & air',
		keywords: 'fuel trailer diesel trailer transfer tank refuel fuel tank trailer 500 gallon pump hose reel double wall',
		build: fuelTrailer },
	{ id: 'lowboy-loaded-excavator', name: 'Lowboy trailer loaded with a 30 t excavator, with day-cab tractor (3-axle gooseneck, ~70 ft overall)', category: 'Vehicles',
		keywords: 'lowboy lowbed float excavator haul mobilization mobilisation move machine float trailer oversize load heavy haul',
		build: lowboyExcavator },
];

// --- materials ---------------------------------------------------------------------------------

const paint = color => mat( color, { roughness: 0.5, metalness: 0.2 } );
const DARK = () => mat( 0x2c2e31, { roughness: 0.7, metalness: 0.2 } );
const BLACK = () => mat( 0x18191b, { roughness: 0.85 } );
const RUBBER = () => mat( 0x161718, { roughness: 0.9 } );
const STEEL = () => mat( 0x7d8287, { roughness: 0.5, metalness: 0.6 } );
const BRIGHT = () => mat( 0xc9ccce, { roughness: 0.35, metalness: 0.3 } );
const GLASS = () => mat( 0x2b3d48, { roughness: 0.1, metalness: 0.3 } );
const ALU = () => mat( 0xc3c7ca, { roughness: 0.35, metalness: 0.65 } );
const FRAME = () => mat( 0x2a2b2d, { roughness: 0.6, metalness: 0.4 } );
const WOOD = () => mat( 0x7a5a3a, { roughness: 0.9 } );
const TIMBER = () => mat( 0x9c7a50, { roughness: 0.95 } );
const HOSE = () => mat( 0x1f2022, { roughness: 0.75 } );
const STONE = () => mat( 0x9a958c, { roughness: 1 } );
const YELLOW = () => paint( 0xe2a41c );
const LAMP = () => mat( 0xfff3c9, { roughness: 0.3, emissive: 0x6b6040 } );
const AMBER = () => mat( 0xff9a1a, { roughness: 0.3, emissive: 0xc76a00, emissiveIntensity: 0.6 } );
const RED_LAMP = () => mat( 0xb3141b, { roughness: 0.3, emissive: 0x7a0a0e, emissiveIntensity: 0.6 } );

// --- shared pieces -----------------------------------------------------------------------------

const v = p => Array.isArray( p ) ? new Vector3( ...p ) : p.clone();

// A box section [ w across, h deep ] from a to b.
function member( parts, material, section, a, b ) {

	parts.add( material, memberGeometry( section, v( a ), v( b ) ) );

}

// A hydraulic cylinder: the barrel for the first 60%, the rod the rest of the way.
function ram( parts, radius, a, b ) {

	const split = v( a ).lerp( v( b ), 0.6 ).toArray();
	parts.rod( DARK(), v( a ).toArray(), split, radius, 10 );
	parts.rod( BRIGHT(), split, v( b ).toArray(), radius * 0.6, 8 );

}

// A tyre on its rim, axle across x, centred on [ x, y, z ].
function tyre( parts, radius, width, [ x, y, z ], rim = BRIGHT() ) {

	parts.rod( RUBBER(), [ x - width / 2, y, z ], [ x + width / 2, y, z ], radius, 20 );
	parts.rod( rim, [ x - width / 2 - 0.005, y, z ], [ x + width / 2 + 0.005, y, z ], radius * 0.55, 12 );

}

// An axle at z with its wheels `x` out from the middle: singles, or duals side by side.
function axle( parts, z, { r, x, width = 0.26, dual = false, rim } ) {

	parts.rod( DARK(), [ - x, r, z ], [ x, r, z ], 0.06, 8 );
	for ( const s of [ - 1, 1 ] ) {

		if ( dual ) for ( const d of [ - 0.52, 0.52 ] ) tyre( parts, r, width, [ s * x + d * width, r, z ], rim );
		else tyre( parts, r, width, [ s * x, r, z ], rim );

	}

}

// A side profile (points [ z, y ]) as a plate `thick` across, centred on x.
function plate( parts, material, points, thick, x = 0 ) {

	parts.prism( material, points, thick, x );

}

// A cross-section (points [ x, y ]) extruded along z from z0 to z1.
function alongZ( points, z0, z1 ) {

	const shape = new Shape( points.map( ( [ x, y ] ) => new Vector2( x, y ) ) );
	const geometry = new ExtrudeGeometry( shape, { depth: z1 - z0, bevelEnabled: false, curveSegments: 4 } );
	geometry.translate( 0, 0, z0 );
	return geometry;

}

// Everything in `from` moved by `matrix` into `parts`: a machine built at the origin, then set on a
// trailer deck.
function moveInto( parts, from, matrix ) {

	for ( const [ material, geometries ] of from.lists ) for ( const geometry of geometries ) parts.add( material, geometry, matrix );
	from.lists.clear();

}

// Mud flaps behind wheels at z, `x` out from the middle.
function flaps( parts, z, x = 1.0, high = 0.6 ) {

	for ( const s of [ - 1, 1 ] ) parts.box( BLACK(), [ 0.5, high, 0.02 ], [ s * x, 0.18, z ] );

}

// Tail lamps on the back at z, `x` out from the middle, at height y.
function tailLamps( parts, z, y, x = 1.05 ) {

	for ( const s of [ - 1, 1 ] ) parts.box( RED_LAMP(), [ 0.16, 0.09, 0.03 ], [ s * x, y, z ] );

}

// An outrigger set out to one side: a beam out of the box at height y, the jack leg at its end and
// the pad on a timber crib under it. `from` and `to` are the x of the beam's ends.
function outrigger( parts, material, [ from, to ], y, z, beam = [ 0.18, 0.2 ] ) {

	parts.box( material, [ Math.abs( to - from ), beam[ 1 ], beam[ 0 ] ], [ ( from + to ) / 2, y, z ] );
	parts.box( material, [ 0.16, y - 0.1, 0.16 ], [ to, 0.1 + 0.06, z ] );
	parts.box( DARK(), [ 0.5, 0.06, 0.5 ], [ to, 0.1, z ] );
	parts.box( TIMBER(), [ 0.6, 0.1, 0.6 ], [ to, 0, z ] );

}

// A run of compartment doors on one side of a service body, from z0 to z1 between heights y0 and
// y1: door seams, handles and a drip rail above.
function compartments( parts, side, z0, z1, y0, y1, doors ) {

	const x = side * 1.225;
	const pitch = ( z1 - z0 ) / doors;
	for ( let i = 0; i <= doors; i ++ ) parts.box( DARK(), [ 0.01, y1 - y0 - 0.04, 0.02 ], [ x, y0 + 0.02, z0 + i * pitch ] );
	for ( let i = 0; i < doors; i ++ ) parts.box( BRIGHT(), [ 0.03, 0.04, 0.16 ], [ x + side * 0.01, ( y0 + y1 ) / 2 + 0.15, z0 + ( i + 0.5 ) * pitch ] );
	parts.box( DARK(), [ 0.04, 0.03, z1 - z0 ], [ x + side * 0.01, y1 - 0.02, ( z0 + z1 ) / 2 ] );

}

// A service (utility) body on a truck from z0 to z1: compartments both sides from below the frame
// up to `high`, its floor between them at `floor`, with `doors` doors a side.
function serviceBody( parts, body, z0, z1, { floor = 1.15, high = 1.95, low = 0.62, doors = 3 } = {} ) {

	const length = z1 - z0;
	const mid = ( z0 + z1 ) / 2;
	for ( const s of [ - 1, 1 ] ) {

		parts.box( body, [ 0.5, high - low, length ], [ s * 0.97, low, mid ] );
		compartments( parts, s, z0 + 0.02, z1 - 0.02, low, high, doors );

	}

	parts.box( mat( 0x6d7175, { roughness: 0.6, metalness: 0.5 } ), [ 1.44, 0.06, length ], [ 0, floor, mid ] );
	parts.box( body, [ 2.44, high - low, 0.12 ], [ 0, low, z0 + 0.06 ] );
	parts.box( DARK(), [ 2.3, 0.18, 0.12 ], [ 0, low - 0.18, z1 - 0.06 ] );
	tailLamps( parts, z1 + 0.01, low + 0.12 );

}

// --- pickups and vans --------------------------------------------------------------------------

// A full-size crew cab pickup with an 8 ft box (a 3/4 or 1-ton, about 6.6 m long and 2 m high),
// its front bumper at z = front: duals under the back with wide fenders if `dually` (2.4 m across
// them). Returns where its gooseneck ball (in the box, just ahead of the rear axle) and its rear
// receiver hitch are, as [ y, z ].
function pickup( parts, front, { colour = 0xeceeea, dually = false } = {} ) {

	const body = paint( colour );
	const z = d => front + d;
	const r = 0.4;
	const frontAxle = z( 0.98 );
	const rearAxle = z( 5.3 );

	// Frame, bumpers and running boards.
	for ( const s of [ - 1, 1 ] ) parts.box( DARK(), [ 0.08, 0.2, 6.1 ], [ s * 0.48, 0.48, z( 3.3 ) ] );
	parts.box( BRIGHT(), [ 2.0, 0.3, 0.2 ], [ 0, 0.45, z( 0.1 ) ] );
	parts.box( BRIGHT(), [ 1.95, 0.22, 0.18 ], [ 0, 0.5, z( 6.52 ) ] );
	for ( const s of [ - 1, 1 ] ) parts.box( DARK(), [ 0.18, 0.06, 2.1 ], [ s * 1.04, 0.5, z( 3.0 ) ] );

	// Wheels: singles in front, singles or duals behind.
	axle( parts, frontAxle, { r, x: 0.86, width: 0.28 } );
	if ( dually ) axle( parts, rearAxle, { r, x: 0.92, width: 0.24, dual: true } );
	else axle( parts, rearAxle, { r, x: 0.86, width: 0.28 } );

	// Hood and front clip: grille, headlamps and wheel arches.
	plate( parts, body, [ [ z( 0.2 ), 0.6 ], [ z( 0.2 ), 1.3 ], [ z( 0.35 ), 1.38 ], [ z( 1.95 ), 1.45 ], [ z( 1.95 ), 0.6 ] ], 2.0 );
	parts.box( DARK(), [ 1.3, 0.45, 0.04 ], [ 0, 0.78, z( 0.19 ) ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( LAMP(), [ 0.28, 0.16, 0.03 ], [ s * 0.8, 1.06, z( 0.19 ) ] );
		parts.box( BLACK(), [ 0.08, 0.12, 1.0 ], [ s * 1.0, 0.95, frontAxle ] );

	}

	// Crew cab: windscreen, door glass, door seams and mirrors.
	plate( parts, body, [ [ z( 1.9 ), 0.6 ], [ z( 1.9 ), 1.45 ], [ z( 2.6 ), 1.98 ], [ z( 4.0 ), 1.98 ], [ z( 4.08 ), 1.9 ], [ z( 4.08 ), 0.6 ] ], 2.0 );
	const screen = Math.atan2( 0.7, 0.53 );
	parts.block( GLASS(), [ 1.8, 0.86, 0.02 ], [ 0, 1.72, z( 2.25 ) - 0.01 ], [ screen, 0, 0 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( GLASS(), [ 0.01, 0.42, 0.8 ], [ s * 1.002, 1.48, z( 3.05 ) ] );
		parts.box( GLASS(), [ 0.01, 0.42, 0.62 ], [ s * 1.002, 1.48, z( 3.72 ) ] );
		for ( const d of [ 2.62, 3.4, 4.05 ] ) parts.box( DARK(), [ 0.01, 0.9, 0.015 ], [ s * 1.003, 0.65, z( d ) ] );
		parts.box( DARK(), [ 0.06, 0.3, 0.2 ], [ s * 1.12, 1.45, z( 2.55 ) ] );

	}

	parts.box( GLASS(), [ 1.5, 0.38, 0.01 ], [ 0, 1.48, z( 4.085 ) ] );

	// The box: floor, sides, tailgate and (on a dually) the wide rear fenders.
	parts.box( DARK(), [ 1.75, 0.04, 2.4 ], [ 0, 0.92, z( 5.3 ) ] );
	const boxX = dually ? 1.0 : 0.98;
	for ( const s of [ - 1, 1 ] ) parts.box( body, [ 0.06, 0.62, 2.45 ], [ s * boxX, 0.75, z( 5.32 ) ] );
	parts.box( body, [ 2.0, 0.62, 0.06 ], [ 0, 0.75, z( 4.12 ) ] );
	parts.box( body, [ 2.0, 0.58, 0.06 ], [ 0, 0.8, z( 6.52 ) ] );
	if ( dually ) for ( const s of [ - 1, 1 ] ) plate( parts, body, [ [ z( 4.65 ), 0.62 ], [ z( 4.8 ), 1.05 ], [ z( 5.8 ), 1.05 ], [ z( 5.95 ), 0.62 ] ], 0.24, s * 1.12 );
	else for ( const s of [ - 1, 1 ] ) parts.box( BLACK(), [ 0.08, 0.12, 1.0 ], [ s * 1.0, 0.95, rearAxle ] );
	tailLamps( parts, z( 6.56 ), 1.05, 0.95 );

	// Gooseneck ball in the box, and the receiver under the back bumper.
	parts.sphere( BRIGHT(), 0.05, [ 0, 0.97, rearAxle - 0.1 ], [ 8, 6 ] );
	parts.box( DARK(), [ 0.08, 0.08, 0.35 ], [ 0, 0.42, z( 6.7 ) ] );
	return { ball: [ 0.97, rearAxle - 0.1 ], hitch: [ 0.5, z( 6.85 ) ] };

}

// --- equipment trailers ------------------------------------------------------------------------

// An A-frame tongue from the front of a trailer's frame (rails `railX` out, at height y, z0) to a
// coupler `length` ahead, with a jack. Returns the coupler's z.
function tongue( parts, { z0, y, railX, length, coupler = 0.48, frame = FRAME() } ) {

	const hitch = z0 - length;
	for ( const s of [ - 1, 1 ] ) member( parts, frame, [ 0.08, 0.12 ], [ s * railX, y, z0 + 0.3 ], [ s * 0.05, coupler + 0.06, hitch + 0.3 ] );
	parts.box( DARK(), [ 0.14, 0.12, 0.42 ], [ 0, coupler - 0.02, hitch + 0.2 ] );
	const jackZ = hitch + 0.8;
	parts.rod( DARK(), [ 0.2, 0.06, jackZ ], [ 0.2, coupler + 0.4, jackZ ], 0.04, 8 );
	parts.box( DARK(), [ 0.18, 0.05, 0.18 ], [ 0.2, 0, jackZ ] );
	return hitch;

}

// A pair of stand-up loading ramps hinged at the back of a deck (deck top y at z), standing up and
// leaning forward a little as they travel.
function standUpRamps( parts, z, y, length, x = 0.72, width = 0.45 ) {

	const lean = 12 * DEG;
	for ( const s of [ - 1, 1 ] ) {

		parts.block( FRAME(), [ width, length, 0.08 ], [ s * x, y + length / 2 * Math.cos( lean ), z - 0.04 - length / 2 * Math.sin( lean ) ], [ - lean, 0, 0 ] );
		for ( let i = 1; i < 8; i ++ ) {

			const t = i / 8 * length;
			parts.block( STEEL(), [ width - 0.04, 0.03, 0.03 ], [ s * x, y + t * Math.cos( lean ), z - 0.1 - t * Math.sin( lean ) ], [ - lean, 0, 0 ] );

		}

	}

}

// A compact track loader of the 289 class (about 3.9 m long with its 78 in bucket on the ground,
// 2 m wide and 2.13 m high), built at the origin facing -Z.
function trackLoader() {

	const parts = new Parts();
	const body = YELLOW();
	tracks( parts, { length: 2.05, width: 1.98, shoe: 0.45, height: 0.58 } );
	// Main frame between the tracks, the engine at the back with its grille door, and the cab.
	parts.box( body, [ 1.08, 0.7, 2.3 ], [ 0, 0.45, 0.25 ] );
	parts.box( body, [ 1.3, 0.55, 0.95 ], [ 0, 1.1, 1.0 ] );
	parts.box( DARK(), [ 1.0, 0.45, 0.02 ], [ 0, 1.12, 1.48 ] );
	cab( parts, [ 1.0, 1.0, 1.3 ], [ 0, 1.13, - 0.12 ], DARK() );
	// Lift arms from their towers at the back down to the bucket, with the cross tube and rams.
	const pivot = [ 1.42, 0.48 ];
	for ( const s of [ - 1, 1 ] ) {

		const x = s * 0.78;
		parts.box( body, [ 0.14, 0.75, 0.4 ], [ x, 1.1, 1.15 ] );
		member( parts, body, [ 0.12, 0.3 ], [ x, 1.75, 1.15 ], [ x, 1.65, - 0.55 ] );
		member( parts, body, [ 0.12, 0.26 ], [ x, 1.65, - 0.55 ], [ x, pivot[ 1 ], - pivot[ 0 ] ] );
		ram( parts, 0.05, [ x, 0.75, 0.6 ], [ x, 1.5, - 0.2 ] );

	}

	parts.rod( body, [ - 0.78, 1.62, - 0.62 ], [ 0.78, 1.62, - 0.62 ], 0.07, 10 );
	// The bucket on the ground, its back against the arms.
	plate( parts, body, [ [ - 1.38, 0.08 ], [ - 1.38, 0.62 ], [ - 1.52, 0.68 ], [ - 1.92, 0.12 ], [ - 2.0, 0.02 ], [ - 1.45, 0.0 ] ], 1.98 );
	parts.box( STEEL(), [ 1.98, 0.02, 0.1 ], [ 0, 0, - 1.95 ] );
	return parts;

}

// A 3.5 t mini excavator (rubber tracks 2.1 m long and 1.74 m wide, the zero-tail house, the cab
// 2.45 m high, the dozer blade) built at the origin facing -Z, arm folded and bucket on the deck.
function miniExcavator() {

	const parts = new Parts();
	const body = paint( 0xe36f1e );
	tracks( parts, { length: 2.1, width: 1.74, shoe: 0.3, height: 0.47 } );
	// Blade and its arms.
	parts.box( body, [ 1.74, 0.36, 0.1 ], [ 0, 0.04, - 1.42 ] );
	for ( const s of [ - 1, 1 ] ) member( parts, body, [ 0.1, 0.12 ], [ s * 0.5, 0.3, - 1.38 ], [ s * 0.45, 0.3, - 0.7 ] );
	// The house on its swing bearing: round deck and counterweight, engine hood, cab.
	parts.cylinder( BLACK(), 0.5, 0.08, [ 0, 0.47, 0 ], 20 );
	parts.cylinder( body, 0.8, 0.55, [ 0, 0.55, 0 ], 24 );
	parts.box( body, [ 1.3, 0.45, 0.6 ], [ 0.05, 1.1, 0.25 ] );
	cab( parts, [ 0.92, 1.3, 1.05 ], [ - 0.28, 1.1, - 0.2 ], body );
	// Boom offset to the right of the cab, stick folded down and the bucket curled on the deck.
	const arm = excavatorFront( parts, body, { foot: [ 0.32, 0.95, - 0.62 ], boom: [ 52, 1.25, - 22, 1.3 ], stick: [ - 103, 1.2 ], section: [ 0.2, 0.3 ] } );
	const e = arm.end;
	plate( parts, DARK(), [ [ e.z + 0.12, e.y + 0.05 ], [ e.z - 0.25, e.y - 0.05 ], [ e.z - 0.35, 0.02 ], [ e.z - 0.05, 0 ], [ e.z + 0.18, 0.12 ] ], 0.5, e.x );
	return parts;

}

// A 30 t class excavator built at the origin facing -Z, folded for hauling: boom down, stick
// tucked back under it and the bucket curled flat, its bottom `bucketY` above the tracks.
function haulExcavator( bucketY ) {

	const parts = new Parts();
	const body = YELLOW();
	carrier( parts, body, {
		track: { length: 4.65, width: 3.19, shoe: 0.6, height: 0.95 },
		swing: 1.05, width: 2.99, front: - 2.0, tail: 3.17, deck: 1.35, hood: 2.5, counterweight: 2.45,
	} );
	cab( parts, [ 1.0, 1.7, 1.9 ], [ - 0.98, 1.35, - 1.05 ], body );
	for ( const x of [ - 0.2, 0.55 ] ) parts.box( DARK(), [ 0.1, 0.9, 1.2 ], [ x, 1.35, - 1.3 ] );
	const arm = excavatorFront( parts, body, { foot: [ 0.18, 2.1, - 1.35 ], boom: [ 8, 3.0, - 22, 3.2 ], stick: [ - 174, 2.9 ], section: [ 0.55, 0.8 ] } );
	// The bucket hanging curled from the stick's end, resting on the deck.
	const e = arm.end;
	plate( parts, DARK(), [ [ e.z + 0.35, e.y + 0.1 ], [ e.z - 0.4, e.y + 0.05 ], [ e.z - 0.75, bucketY + 0.2 ], [ e.z - 0.55, bucketY ], [ e.z + 0.6, bucketY ], [ e.z + 0.7, bucketY + 0.35 ] ], 1.35, e.x );
	parts.box( STEEL(), [ 1.35, 0.06, 0.25 ], [ e.x, bucketY, e.z - 0.7 ] );
	return parts;

}

// Binder chains from a load down to the deck's side rail: pairs of points.
function chains( parts, pairs ) {

	for ( const [ a, b ] of pairs ) parts.rod( STEEL(), a, b, 0.015, 5 );

}

// A 1-ton dually pulling a 25 + 5 ft deck-over gooseneck (102 in wide, the deck 0.95 m up, tandem
// 10,000 lb axles, 8 ft stand-up ramps) with a compact track loader chained down at the front of
// the deck. About 17 m long hitched.
function gooseneckRig() {

	const parts = new Parts();
	const { ball } = pickup( parts, - 6.6, { colour: 0x2b3a55, dually: true } );
	const frame = FRAME();
	const deckY = 0.95;
	const hitchZ = ball[ 1 ];
	const deck0 = hitchZ + 2.6;
	const flat = 25 * FT;
	const tail = 5 * FT;
	const deck1 = deck0 + flat;
	const end = deck1 + tail;
	const W = 102 * IN;

	// The neck: a box beam from the coupler over the truck's box back to the deck, with the coupler
	// tube down to the ball and its jacks folded up.
	const neckTop = 1.75;
	plate( parts, frame, [ [ hitchZ - 0.35, neckTop - 0.3 ], [ hitchZ - 0.35, neckTop ], [ deck0 + 0.6, neckTop ], [ deck0 + 0.9, deckY ], [ deck0 + 0.3, deckY - 0.3 ], [ deck0 - 0.3, neckTop - 0.3 ] ], 0.5 );
	parts.box( frame, [ W, neckTop - deckY, 0.12 ], [ 0, deckY, deck0 + 0.06 ] );
	parts.rod( DARK(), [ 0, ball[ 0 ] + 0.04, hitchZ ], [ 0, neckTop - 0.3, hitchZ ], 0.07, 10 );
	for ( const s of [ - 1, 1 ] ) parts.rod( DARK(), [ s * 0.32, neckTop - 0.6, deck0 + 0.2 ], [ s * 0.32, neckTop + 0.05, deck0 + 0.2 ], 0.06, 8 );
	parts.box( FRAME(), [ 0.9, 0.12, 0.3 ], [ 0, neckTop - 0.15, deck0 + 0.2 ] );

	// Deck over the wheels: main beams, side rails with stake pockets, the wood deck, the dovetail.
	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ 0.12, 0.3, end - deck0 ], [ s * 0.5, deckY - 0.36, ( deck0 + end ) / 2 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ 0.08, 0.16, flat ], [ s * ( W / 2 - 0.04 ), deckY - 0.16, ( deck0 + deck1 ) / 2 ] );
	parts.box( WOOD(), [ W - 0.08, 0.05, flat ], [ 0, deckY - 0.05, ( deck0 + deck1 ) / 2 ] );
	const drop = 0.22;
	const slope = Math.atan2( drop, tail );
	parts.block( WOOD(), [ W - 0.08, 0.05, tail / Math.cos( slope ) ], [ 0, deckY - 0.025 - drop / 2, deck1 + tail / 2 ], [ slope, 0, 0 ] );
	for ( const s of [ - 1, 1 ] ) parts.block( frame, [ 0.08, 0.16, tail / Math.cos( slope ) ], [ s * ( W / 2 - 0.04 ), deckY - 0.08 - drop / 2, deck1 + tail / 2 ], [ slope, 0, 0 ] );
	const axleZ = deck0 + flat * 0.66;
	for ( const z of [ axleZ - 0.5, axleZ + 0.5 ] ) axle( parts, z, { r: 0.4, x: 0.92, width: 0.24, dual: true } );
	standUpRamps( parts, end, deckY - drop, 8 * FT, 0.72, 0.5 );
	tailLamps( parts, end + 0.01, deckY - drop - 0.12, 1.1 );
	flaps( parts, axleZ + 1.0, 0.92, 0.5 );

	// The track loader at the front of the deck, chained at its corners.
	const loaderZ = deck0 + 2.4;
	moveInto( parts, trackLoader(), _m.makeTranslation( 0, deckY, loaderZ ) );
	chains( parts, [ [ [ 0.9, deckY + 0.3, loaderZ - 0.9 ], [ 1.25, deckY, loaderZ - 1.6 ] ], [ [ - 0.9, deckY + 0.3, loaderZ - 0.9 ], [ - 1.25, deckY, loaderZ - 1.6 ] ],
		[ [ 0.9, deckY + 0.3, loaderZ + 0.9 ], [ 1.25, deckY, loaderZ + 1.6 ] ], [ [ - 0.9, deckY + 0.3, loaderZ + 0.9 ], [ - 1.25, deckY, loaderZ + 1.6 ] ] ] );
	return centred( parts );

}

// A 3/4-ton crew cab pulling a 20 ft (16 + 4 ft dovetail) bumper-pull tag trailer, 14,000 lb on two
// 7,000 lb axles, 83 in between the fenders, with a 3.5 t mini excavator on it. About 15 m long.
function tagRig() {

	const parts = new Parts();
	const { hitch } = pickup( parts, - 7.4, { colour: 0xb4231b } );
	const frame = FRAME();
	const deckY = 0.6;
	const r = 0.36;
	const coupler = hitch[ 1 ];
	const z0 = coupler + 1.75;
	const flat = 16 * FT;
	const tail = 4 * FT;
	const z1 = z0 + flat;
	const end = z1 + tail;
	const inside = 83 * IN;

	tongue( parts, { z0, y: deckY - 0.1, railX: inside / 2 - 0.05, length: z0 - coupler, coupler: hitch[ 0 ], frame } );
	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ 0.08, 0.16, end - z0 ], [ s * ( inside / 2 - 0.04 ), deckY - 0.18, ( z0 + end ) / 2 ] );
	parts.box( WOOD(), [ inside - 0.08, 0.05, flat ], [ 0, deckY - 0.05, ( z0 + z1 ) / 2 ] );
	const drop = 0.16;
	const slope = Math.atan2( drop, tail );
	parts.block( WOOD(), [ inside - 0.08, 0.05, tail / Math.cos( slope ) ], [ 0, deckY - 0.025 - drop / 2, z1 + tail / 2 ], [ slope, 0, 0 ] );
	// A headboard at the front of the deck, and the wheels and fenders outside the frame.
	parts.box( frame, [ inside, 0.5, 0.06 ], [ 0, deckY, z0 + 0.03 ] );
	const axleZ = z0 + flat * 0.6;
	const wheelX = inside / 2 + 0.17;
	for ( const z of [ axleZ - 0.45, axleZ + 0.45 ] ) axle( parts, z, { r, x: wheelX, width: 0.22 } );
	for ( const s of [ - 1, 1 ] ) {

		plate( parts, frame, [ [ axleZ - 0.95, deckY - 0.05 ], [ axleZ - 0.8, 2 * r + 0.1 ], [ axleZ + 0.8, 2 * r + 0.1 ], [ axleZ + 0.95, deckY - 0.05 ] ], 0.3, s * wheelX );

	}

	standUpRamps( parts, end, deckY - drop, 5 * FT, 0.62, 0.4 );
	tailLamps( parts, end + 0.01, deckY - drop - 0.1, 0.95 );

	// The mini excavator facing forward on the deck, blade down, chained front and back.
	const exZ = z0 + 2.95;
	moveInto( parts, miniExcavator(), _m.makeTranslation( 0, deckY, exZ ) );
	chains( parts, [ [ [ 0.8, deckY + 0.25, exZ - 1.35 ], [ 1.0, deckY, exZ - 1.7 ] ], [ [ - 0.8, deckY + 0.25, exZ - 1.35 ], [ - 1.0, deckY, exZ - 1.7 ] ],
		[ [ 0.8, deckY + 0.25, exZ + 1.0 ], [ 1.0, deckY, exZ + 1.5 ] ], [ [ - 0.8, deckY + 0.25, exZ + 1.0 ], [ - 1.0, deckY, exZ + 1.5 ] ] ] );
	return centred( parts );

}

// Expanded metal mesh, drawn once and repeated: dark diamonds over a faint haze, so it reads as
// see-through mesh close up and as a grey screen from further off.
function mesh() {

	const material = drawn( 'expanded metal mesh', [ 64, 64 ], ( ctx, w, h ) => {

		ctx.fillStyle = 'rgba( 42, 43, 45, 0.3 )';
		ctx.fillRect( 0, 0, w, h );
		ctx.strokeStyle = '#2a2b2d';
		ctx.lineWidth = 6;
		ctx.beginPath();
		ctx.moveTo( 0, h / 2 );
		ctx.lineTo( w / 2, 0 );
		ctx.lineTo( w, h / 2 );
		ctx.lineTo( w / 2, h );
		ctx.closePath();
		ctx.stroke();

	}, { side: DoubleSide, metalness: 0.4, transparent: true, alphaTest: 0.01 } );
	material.map.wrapS = material.map.wrapT = RepeatWrapping;
	return material;

}

// A mesh panel of [ w, h ] centred on `centre`, turned `turn` about y from facing +Z, tipped back
// `tip` about its own x.
function meshPanel( parts, [ w, h ], centre, turn = 0, tip = 0 ) {

	const geometry = new PlaneGeometry( w, h );
	const uv = geometry.attributes.uv;
	for ( let i = 0; i < uv.count; i ++ ) uv.setXY( i, uv.getX( i ) * w / 0.08, uv.getY( i ) * h / 0.05 );
	parts.add( mesh(), geometry, new Matrix4().makeRotationY( turn ).multiply( new Matrix4().makeRotationX( tip ) ).setPosition( ...centre ) );

}

// A 5 x 10 ft single-axle utility trailer: angle-iron frame and wood deck 0.5 m up, 2 ft rails of
// angle and uprights, a 4 ft mesh ramp gate standing up at the back, the wheels outside the rails
// under their fenders. About 4.5 m long and 2 m across the fenders.
function utilityTrailer() {

	const parts = new Parts();
	const frame = FRAME();
	const W = 5 * FT;
	const L = 10 * FT;
	const deckY = 0.5;
	const z0 = - L / 2 + 0.55;
	const z1 = z0 + L;
	const r = 0.33;
	const rail = 0.6;

	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ 0.05, 0.08, L ], [ s * ( W / 2 - 0.025 ), deckY - 0.08, ( z0 + z1 ) / 2 ] );
	for ( let i = 0; i <= 5; i ++ ) parts.box( frame, [ W, 0.05, 0.05 ], [ 0, deckY - 0.08, z0 + 0.03 + i * ( L - 0.06 ) / 5 ] );
	parts.box( WOOD(), [ W - 0.04, 0.04, L ], [ 0, deckY - 0.03, ( z0 + z1 ) / 2 ] );
	tongue( parts, { z0, y: deckY - 0.05, railX: W / 2 - 0.05, length: 1.25, coupler: 0.45, frame } );

	// Rails: top rail of angle round the sides and front, uprights, and mesh panels between.
	for ( const s of [ - 1, 1 ] ) {

		const x = s * ( W / 2 - 0.02 );
		parts.box( frame, [ 0.04, 0.04, L ], [ x, deckY + rail - 0.04, ( z0 + z1 ) / 2 ] );
		for ( let i = 0; i <= 5; i ++ ) parts.box( frame, [ 0.03, rail, 0.03 ], [ x, deckY, z0 + 0.02 + i * ( L - 0.04 ) / 5 ] );
		meshPanel( parts, [ L - 0.06, rail - 0.06 ], [ x, deckY + rail / 2, ( z0 + z1 ) / 2 ], Math.PI / 2 );

	}

	parts.box( frame, [ W, 0.04, 0.04 ], [ 0, deckY + rail - 0.04, z0 + 0.02 ] );
	meshPanel( parts, [ W - 0.06, rail - 0.06 ], [ 0, deckY + rail / 2, z0 + 0.02 ] );

	// The ramp gate, hinged at the back of the deck, standing up with its spring assist.
	const gate = 4 * FT;
	meshPanel( parts, [ W - 0.12, gate - 0.1 ], [ 0, deckY + gate / 2, z1 + 0.02 ] );
	for ( const s of [ - 1, 1 ] ) parts.rod( STEEL(), [ s * ( W / 2 - 0.05 ), deckY + 0.1, z1 - 0.1 ], [ s * ( W / 2 - 0.05 ), deckY + rail - 0.1, z1 - 0.05 ], 0.02, 6 );
	// The gate's frame round the mesh.
	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ 0.04, gate, 0.04 ], [ s * ( W / 2 - 0.04 ), deckY, z1 + 0.02 ] );
	for ( const y of [ deckY, deckY + gate - 0.04, deckY + gate / 2 ] ) parts.box( frame, [ W - 0.04, 0.04, 0.04 ], [ 0, y, z1 + 0.02 ] );

	// One axle, the wheels outside the rails under their fenders.
	const axleZ = ( z0 + z1 ) / 2 + 0.2;
	const wheelX = W / 2 + 0.15;
	axle( parts, axleZ, { r, x: wheelX, width: 0.18 } );
	for ( const s of [ - 1, 1 ] ) plate( parts, frame, [ [ axleZ - 0.45, deckY - 0.05 ], [ axleZ - 0.35, 2 * r + 0.08 ], [ axleZ + 0.35, 2 * r + 0.08 ], [ axleZ + 0.45, deckY - 0.05 ] ], 0.24, s * wheelX );
	tailLamps( parts, z1 + 0.05, deckY - 0.1, W / 2 - 0.05 );
	return centred( parts );

}

// A 7 x 14 ft bumper-pull dump trailer, 14,000 lb on two axles under the bed: a 24 in steel box on
// a scissor hoist, tipped up 40° about its back hinge, its barn doors swung open and the roll tarp
// on its arms over the front. About 6.1 m long and 2.4 m wide.
function dumpTrailer() {

	const parts = new Parts();
	const frame = FRAME();
	const box = paint( 0x23262a );
	const L = 14 * FT;
	const W = 7 * FT + 0.12;
	const sides = 24 * IN;
	const r = 0.37;
	const frameY = 0.62;
	const hingeZ = L / 2 - 0.35;
	const z0 = hingeZ - L + 0.2;

	// Frame, tongue with the tarp-arm pivot and battery box, axles under the bed.
	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ 0.1, 0.2, L - 0.2 ], [ s * 0.55, frameY - 0.2, z0 + ( L - 0.2 ) / 2 ] );
	for ( let i = 0; i <= 6; i ++ ) parts.box( frame, [ 1.1, 0.08, 0.08 ], [ 0, frameY - 0.12, z0 + i * ( L - 0.2 ) / 6 ] );
	tongue( parts, { z0, y: frameY - 0.05, railX: 0.55, length: 1.55, frame } );
	parts.box( DARK(), [ 0.45, 0.3, 0.3 ], [ 0, frameY, z0 - 0.45 ] );
	const axleZ = z0 + L * 0.58;
	for ( const z of [ axleZ - 0.45, axleZ + 0.45 ] ) axle( parts, z, { r, x: 0.92, width: 0.22 } );
	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ 0.24, 0.04, 1.85 ], [ s * 0.92, 2 * r + 0.04, axleZ ] );

	// The box, built hinged at the origin running forward (-Z), then tipped and set on the hinge.
	const bed = new Parts();
	const t = 0.05;
	bed.box( box, [ W, 0.1, L ], [ 0, 0, - L / 2 ] );
	for ( const s of [ - 1, 1 ] ) {

		bed.box( box, [ t, sides, L ], [ s * ( W / 2 - t / 2 ), 0.1, - L / 2 ] );
		bed.box( box, [ 0.08, 0.06, L + 0.02 ], [ s * W / 2, 0.1 + sides - 0.06, - L / 2 ] );
		for ( let i = 1; i < 6; i ++ ) bed.box( box, [ 0.04, sides, 0.06 ], [ s * ( W / 2 + 0.01 ), 0.1, - i * L / 6 ] );
		bed.box( box, [ 0.12, 0.16, L - 0.2 ], [ s * 0.4, - 0.16, - L / 2 ] );

	}

	bed.box( box, [ W, sides + 0.12, t ], [ 0, 0.1, - L + t / 2 ] );
	// Tarp housing on the headboard, with the rolled tarp.
	bed.box( box, [ W - 0.2, 0.2, 0.2 ], [ 0, sides + 0.15, - L + 0.1 ] );
	bed.rod( mat( 0x1c3a5c, { roughness: 0.9 } ), [ - W / 2 + 0.15, sides + 0.25, - L + 0.12 ], [ W / 2 - 0.15, sides + 0.25, - L + 0.12 ], 0.09, 10 );
	// Barn doors swung right round and latched flat against the sides, and a bit of load still
	// sliding out.
	for ( const s of [ - 1, 1 ] ) bed.box( box, [ 0.04, sides, W / 2 - 0.04 ], [ s * ( W / 2 + 0.07 ), 0.1, - ( W / 2 - 0.04 ) / 2 - 0.02 ] );
	bed.box( STONE(), [ W - 0.15, 0.18, 1.2 ], [ 0, 0.1, - 0.75 ] );
	const tip = 40 * DEG;
	const hinge = new Matrix4().makeTranslation( 0, frameY + 0.16, hingeZ ).multiply( new Matrix4().makeRotationX( tip ) );
	moveInto( parts, bed, hinge );
	parts.box( DARK(), [ 0.16, 0.16, 0.12 ], [ 0, frameY, hingeZ ] );

	// The scissor hoist from the frame up to the bed's floor, and its ram.
	const bedPoint = d => new Vector3( 0, - 0.16, - d ).applyMatrix4( hinge );
	const under = bedPoint( L * 0.55 );
	for ( const x of [ - 0.25, 0.25 ] ) {

		member( parts, DARK(), [ 0.08, 0.12 ], [ x, frameY - 0.05, hingeZ - L * 0.62 ], [ x, under.y, under.z ] );
		member( parts, DARK(), [ 0.08, 0.12 ], [ x, frameY - 0.05, hingeZ - L * 0.3 ], [ x, ( under.y + frameY ) / 2, ( under.z + hingeZ - L * 0.62 ) / 2 ] );

	}

	ram( parts, 0.07, [ 0, frameY - 0.05, hingeZ - L * 0.45 ], [ 0, under.y - 0.1, under.z - 0.4 ] );
	tailLamps( parts, hingeZ + 0.12, frameY - 0.15, 0.6 );
	return centred( parts );

}

// A 500 gal diesel transfer trailer: a rectangular double-wall steel tank (about 2.1 × 1.25 × 1.0
// m) on a tandem trailer, the 12 V transfer pump and filter on top, the hose reel on the back with
// its nozzle, and DIESEL / 1202 placards. About 4.1 m long, 1.85 m wide and 2 m high.
function fuelTrailer() {

	const parts = new Parts();
	const frame = FRAME();
	const tank = paint( 0xe9e8e2 );
	const r = 0.3;
	const deckY = 0.52;
	const z0 = - 1.05;
	const z1 = 1.55;

	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ 0.08, 0.14, z1 - z0 ], [ s * 0.6, deckY - 0.14, ( z0 + z1 ) / 2 ] );
	for ( let i = 0; i <= 4; i ++ ) parts.box( frame, [ 1.2, 0.06, 0.06 ], [ 0, deckY - 0.1, z0 + 0.03 + i * ( z1 - z0 - 0.06 ) / 4 ] );
	parts.box( mat( 0x6d7175, { roughness: 0.6, metalness: 0.5 } ), [ 1.4, 0.04, z1 - z0 ], [ 0, deckY - 0.04, ( z0 + z1 ) / 2 ] );
	tongue( parts, { z0, y: deckY - 0.05, railX: 0.6, length: 1.45, frame } );
	for ( const z of [ - 0.05, 0.6 ] ) axle( parts, z + 0.25, { r, x: 0.8, width: 0.2 } );
	for ( const s of [ - 1, 1 ] ) plate( parts, frame, [ [ - 0.2, deckY - 0.04 ], [ - 0.1, 2 * r + 0.06 ], [ 1.1, 2 * r + 0.06 ], [ 1.2, deckY - 0.04 ] ], 0.24, s * 0.8 );

	// The tank on skids, its fill and vent, pump, filter, and the hose reel behind.
	const tankY = deckY + 0.1;
	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ 0.1, 0.1, 2.1 ], [ s * 0.45, deckY, - 0.05 ] );
	parts.box( tank, [ 1.25, 1.0, 2.1 ], [ 0, tankY, - 0.05 ] );
	parts.box( DARK(), [ 1.27, 0.04, 2.12 ], [ 0, tankY + 0.12, - 0.05 ] );
	const top = tankY + 1.0;
	parts.cylinder( DARK(), 0.1, 0.12, [ - 0.3, top, - 0.75 ], 12 );
	parts.rod( STEEL(), [ 0.4, top, - 0.8 ], [ 0.4, top + 0.35, - 0.8 ], 0.025, 8 );
	parts.box( mat( 0x1f4f8f, { roughness: 0.5, metalness: 0.3 } ), [ 0.3, 0.25, 0.4 ], [ 0.15, top, 0.35 ] );
	parts.cylinder( DARK(), 0.07, 0.25, [ - 0.25, top, 0.4 ], 12 );
	const reelZ = 1.25;
	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ 0.04, 0.6, 0.35 ], [ s * 0.3, deckY, reelZ ] );
	parts.rod( frame, [ - 0.3, deckY + 0.42, reelZ ], [ 0.3, deckY + 0.42, reelZ ], 0.25, 18 );
	parts.rod( HOSE(), [ - 0.27, deckY + 0.42, reelZ ], [ 0.27, deckY + 0.42, reelZ ], 0.2, 18 );
	parts.path( HOSE(), [ [ 0.1, top + 0.1, 0.55 ], [ 0.1, top + 0.05, 0.95 ], [ 0.1, deckY + 0.62, reelZ ] ], 0.02, 6 );
	parts.box( DARK(), [ 0.08, 0.25, 0.08 ], [ 0.5, deckY + 0.3, reelZ + 0.12 ] );
	tailLamps( parts, z1 + 0.01, deckY - 0.1, 0.62 );

	// Placards on both sides and the back of the tank.
	const placard = drawn( 'diesel placard', [ 256, 128 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#f2f0ea';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#c4161c';
		ctx.fillRect( 8, 8, 112, 112 );
		ctx.fillStyle = '#ffffff';
		ctx.font = 'bold 48px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText( '1202', 64, 66 );
		ctx.fillStyle = '#141414';
		ctx.font = 'bold 34px sans-serif';
		ctx.fillText( 'DIESEL', 188, 66 );

	} );
	for ( const s of [ - 1, 1 ] ) parts.add( placard, new PlaneGeometry( 0.6, 0.3 ), new Matrix4().makeRotationY( s * Math.PI / 2 ).setPosition( s * 0.626, tankY + 0.55, - 0.05 ) );
	parts.add( placard, new PlaneGeometry( 0.6, 0.3 ), _m.makeTranslation( 0, tankY + 0.55, 1.002 ) );
	return centred( parts );

}

// --- delivery trucks ---------------------------------------------------------------------------

// A stack of drywall on 4 x 4 dunnage: 4 × 12 ft boards, `high` tall, centred on (x, z), lying
// along z, standing at y.
function drywall( parts, [ x, y, z ], high ) {

	for ( const dz of [ - 1.2, 0, 1.2 ] ) parts.box( TIMBER(), [ 1.2, 0.09, 0.09 ], [ x, y, z + dz ] );
	parts.box( mat( 0xe7e3d8, { roughness: 0.95 } ), [ 4 * FT, high, 12 * FT ], [ x, y + 0.09, z ] );
	// The taped ends of the bundles show as lines up the stack.
	for ( let i = 1; i * 0.05 < high; i ++ ) parts.box( mat( 0xbdb7a8, { roughness: 0.95 } ), [ 4 * FT + 0.004, 0.006, 12 * FT + 0.004 ], [ x, y + 0.09 + i * 0.05, z ] );

}

// A drywall delivery truck: a tandem conventional with a 24 ft steel deck and a knuckle-boom crane
// on the back of the frame, set up with its outriggers out and the boom unfolded to the right,
// holding a lift of board on its forks at a second-floor window. About 12.5 m long, the boom
// reaching 8 m out from the middle and 6.5 m up.
function knuckleBoomTruck() {

	const parts = new Parts();
	const crane = paint( 0xc4161c );
	const front = - 6.2;
	const back = 6.3;
	const { cabBack, frameTop } = truck( parts, { colour: 0xeceeea, front, rear: 2.55, back, axles: 2 } );

	// The deck: steel floor with wood strips, side rails with stake pockets and a headache rack.
	const deck0 = cabBack + 0.25;
	const deck1 = deck0 + 24 * FT;
	const deckY = frameTop + 0.18;
	parts.box( DARK(), [ 2.44, 0.18, deck1 - deck0 ], [ 0, frameTop, ( deck0 + deck1 ) / 2 ] );
	parts.box( WOOD(), [ 2.3, 0.02, deck1 - deck0 - 0.1 ], [ 0, deckY, ( deck0 + deck1 ) / 2 ] );
	for ( const s of [ - 1, 1 ] ) for ( let z = deck0 + 0.4; z < deck1; z += 0.9 ) parts.box( DARK(), [ 0.04, 0.12, 0.1 ], [ s * 1.23, frameTop + 0.03, z ] );
	parts.box( DARK(), [ 2.44, 1.1, 0.08 ], [ 0, deckY, deck0 + 0.04 ] );
	for ( let i = 1; i < 6; i ++ ) parts.box( GLASS(), [ 0.3, 0.8, 0.01 ], [ - 1.0 + i * 0.33, deckY + 0.15, deck0 - 0.001 ] );

	// Four stacks of board on the deck, strapped down.
	const stackHigh = 0.55;
	for ( const x of [ - 0.62, 0.62 ] ) for ( const z of [ deck0 + 2.05, deck0 + 5.55 ] ) drywall( parts, [ x, deckY, z ], stackHigh );
	for ( const z of [ deck0 + 1.0, deck0 + 3.0, deck0 + 4.6, deck0 + 6.6 ] ) parts.box( mat( 0xe0b21b, { roughness: 0.7 } ), [ 2.48, 0.01, 0.05 ], [ 0, deckY + 0.09 + stackHigh, z ] );

	// The crane's base on the frame behind the deck, with outriggers out both sides there and
	// behind the cab.
	const cz = deck1 + 0.55;
	parts.box( crane, [ 1.3, 0.7, 0.9 ], [ 0, frameTop - 0.25, cz ] );
	for ( const z of [ cz, cabBack + 1.4 ] ) for ( const s of [ - 1, 1 ] ) outrigger( parts, crane, [ s * 0.6, s * 2.75 ], frameTop - 0.2, z );

	// The column turned to the right, the inner boom raised, the outer boom and its extensions out
	// over the side, and the board forks hanging from the tip.
	const colTop = frameTop + 1.85;
	parts.cylinder( crane, 0.32, colTop - frameTop - 0.45, [ 0, frameTop + 0.45, cz ], 18 );
	parts.box( crane, [ 0.75, 0.55, 0.8 ], [ 0.1, colTop - 0.2, cz ] );
	const out = new Vector3( 1, 0, 0 );
	const dir = a => out.clone().multiplyScalar( Math.cos( a * DEG ) ).addScaledVector( UP, Math.sin( a * DEG ) );
	const foot = new Vector3( 0.25, colTop + 0.1, cz );
	const knee = foot.clone().addScaledVector( dir( 62 ), 4.2 );
	const tip = knee.clone().addScaledVector( dir( - 8 ), 3.2 );
	const tip2 = tip.clone().addScaledVector( dir( - 8 ), 2.4 );
	const tip3 = tip2.clone().addScaledVector( dir( - 8 ), 1.4 );
	member( parts, crane, [ 0.42, 0.5 ], foot, knee.clone().addScaledVector( dir( 62 ), 0.2 ) );
	member( parts, crane, [ 0.4, 0.42 ], knee.clone().addScaledVector( dir( - 8 ), - 0.35 ), tip );
	member( parts, crane, [ 0.32, 0.34 ], tip.clone().addScaledVector( dir( - 8 ), - 0.6 ), tip2 );
	member( parts, crane, [ 0.25, 0.27 ], tip2.clone().addScaledVector( dir( - 8 ), - 0.5 ), tip3 );
	for ( const p of [ foot, knee ] ) parts.rod( STEEL(), [ p.x, p.y, p.z - 0.32 ], [ p.x, p.y, p.z + 0.32 ], 0.09, 10 );
	ram( parts, 0.11, [ 0.45, colTop - 0.25, cz ], foot.clone().addScaledVector( dir( 62 ), 2.3 ).addScaledVector( dir( - 28 ), 0.25 ) );
	ram( parts, 0.09, foot.clone().addScaledVector( dir( 62 ), 3.0 ).addScaledVector( dir( 152 ), 0.35 ), knee.clone().addScaledVector( dir( - 8 ), 0.9 ).addScaledVector( dir( 82 ), 0.3 ) );

	// The forks: a rotator, a hanger and two tines carrying a lift of board.
	const hookY = tip3.y - 1.2;
	parts.rod( DARK(), tip3.toArray(), [ tip3.x, hookY + 0.9, tip3.z ], 0.06, 8 );
	parts.box( DARK(), [ 0.25, 0.25, 0.25 ], [ tip3.x, hookY + 0.7, tip3.z ] );
	member( parts, DARK(), [ 0.1, 0.1 ], [ tip3.x, hookY + 0.75, tip3.z ], [ tip3.x - 0.65, hookY + 0.75, tip3.z ] );
	member( parts, DARK(), [ 0.1, 0.1 ], [ tip3.x - 0.65, hookY + 0.8, tip3.z ], [ tip3.x - 0.65, hookY - 0.05, tip3.z ] );
	for ( const dz of [ - 0.5, 0.5 ] ) parts.box( DARK(), [ 1.4, 0.05, 0.1 ], [ tip3.x + 0.05, hookY - 0.1, tip3.z + dz ] );
	parts.box( mat( 0xe7e3d8, { roughness: 0.95 } ), [ 4 * FT, 0.25, 12 * FT ], [ tip3.x + 0.05, hookY - 0.05, tip3.z ] );
	return centred( parts );

}

// A cable-hoist roll-off truck, tandem, carrying a 30 yd³ bin (22 ft long, 7.5 ft wide, 5.5 ft
// sides) on its tilt frame: the long rails with rollers at the back, the winch and cable at the
// front pulling on the bin's hook, the bin's own rails and wheels. About 11.1 m long.
function rollOffTruck() {

	const parts = new Parts();
	const front = - 6.0;
	const back = 4.6;
	const { cabBack, frameTop } = truck( parts, { colour: 0x1f4f8f, front, rear: 2.5, back, axles: 2 } );

	// The tilt frame: two rails along the truck pivoted at the back, its rollers and the winch.
	const railTop = frameTop + 0.3;
	for ( const s of [ - 1, 1 ] ) parts.box( DARK(), [ 0.16, 0.3, back - cabBack - 0.3 ], [ s * 0.52, frameTop, ( cabBack + 0.3 + back ) / 2 ] );
	parts.rod( STEEL(), [ - 0.8, frameTop + 0.25, back - 0.1 ], [ 0.8, frameTop + 0.25, back - 0.1 ], 0.2, 14 );
	parts.box( DARK(), [ 1.2, 0.55, 0.6 ], [ 0, frameTop, cabBack + 0.45 ] );
	parts.rod( STEEL(), [ - 0.4, frameTop + 0.6, cabBack + 0.45 ], [ 0.4, frameTop + 0.6, cabBack + 0.45 ], 0.18, 14 );
	ram( parts, 0.1, [ 0, frameTop - 0.3, cabBack + 1.2 ], [ 0, railTop - 0.05, cabBack + 2.4 ] );

	// The bin: long rails underneath, a ribbed steel box with a sloped front, a barn door at the back.
	const bin = paint( 0x2f6b3a );
	const L = 22 * FT;
	const W = 7.5 * FT;
	const H = 5.5 * FT;
	const z0 = back + 0.5 - L;
	const z1 = back + 0.5;
	const y0 = railTop + 0.15;
	for ( const s of [ - 1, 1 ] ) parts.box( DARK(), [ 0.15, 0.15, L ], [ s * 0.52, railTop, ( z0 + z1 ) / 2 ] );
	for ( const s of [ - 1, 1 ] ) parts.rod( DARK(), [ s * 0.45, railTop + 0.05, z1 - 0.1 ], [ s * 0.62, railTop + 0.05, z1 - 0.1 ], 0.14, 12 );
	plate( parts, bin, [ [ z0 + 0.6, y0 ], [ z0, y0 + 0.6 ], [ z0, y0 + H ], [ z1, y0 + H ], [ z1, y0 ] ], W );
	parts.box( mat( 0x26292c, { roughness: 0.9 } ), [ W - 0.12, 0.02, L - 0.12 ], [ 0, y0 + H - 0.01, ( z0 + z1 ) / 2 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( bin, [ 0.08, 0.1, L ], [ s * W / 2, y0 + H - 0.1, ( z0 + z1 ) / 2 ] );
		for ( let i = 1; i < 8; i ++ ) parts.box( bin, [ 0.06, H - 0.1, 0.1 ], [ s * ( W / 2 + 0.02 ), y0, z0 + i * L / 8 ] );

	}

	parts.box( DARK(), [ 0.02, H - 0.2, 0.01 ], [ 0, y0 + 0.1, z1 + 0.003 ] );
	for ( const s of [ - 1, 1 ] ) for ( const y of [ 0.4, H - 0.4 ] ) parts.box( STEEL(), [ 0.12, 0.08, 0.04 ], [ s * ( W / 2 - 0.1 ), y0 + y, z1 + 0.02 ] );
	// The hook on the bin's front, the cable to the winch.
	parts.box( STEEL(), [ 0.25, 0.25, 0.1 ], [ 0, y0 + 0.25, z0 + 0.25 ] );
	parts.rod( DARK(), [ 0, frameTop + 0.6, cabBack + 0.45 ], [ 0, y0 + 0.35, z0 + 0.2 ], 0.015, 5 );
	tailLamps( parts, z1 + 0.01, railTop - 0.1, 1.0 );
	return centred( parts );

}

// A pneumatic dry bulk trailer behind a day-cab tractor: the 1,600 ft³ aluminium vessel (2.4 m
// across, its top 3.9 m up) on three cone hoppers, the discharge line under them to the back, the
// manholes and catwalk on top, landing gear, tandem axles and the rear ladder. About 18 m long.
function pneumaticTrailer() {

	const parts = new Parts();
	const alu = ALU();
	const { fifth } = tractor( parts, - 9.8, { colour: 0xe9e8e2, sleeper: false, drives: 2 } );
	const T = fifth - 0.9;
	const R = 1.2;
	const yc = 2.7;
	const za = T + 0.4;
	const zb = T + 12.3;

	// The vessel and its domed ends.
	parts.rod( alu, [ 0, yc, za ], [ 0, yc, zb ], R, 28, true );
	for ( const z of [ za, zb ] ) parts.sphere( alu, R, [ 0, yc, z ], [ 28, 12 ], [ 1, 1, 0.3 ] );
	// Kingpin structure over the fifth wheel and the frame over the axles.
	parts.box( DARK(), [ 1.4, yc - R - 1.05 + 0.1, 1.8 ], [ 0, 1.05, T + 1.1 ] );
	parts.box( DARK(), [ 1.4, 0.4, 2.8 ], [ 0, 1.1, T + 11.05 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( DARK(), [ 0.12, yc - R - 0.1, 0.12 ], [ s * 0.85, 0.15, T + 2.1 ] );
		parts.box( DARK(), [ 0.3, 0.06, 0.3 ], [ s * 0.85, 0, T + 2.1 ] );

	}

	// Three hoppers under the vessel, each to a valve on the discharge line.
	const hoppers = [ T + 3.6, T + 6.2, T + 8.8 ];
	for ( const z of hoppers ) {

		parts.cylinder( alu, 0.22, yc - 0.45 - 0.75, [ 0, 0.75, z ], 20, 1.05 );
		parts.cylinder( DARK(), 0.14, 0.2, [ 0, 0.55, z ], 10 );

	}

	parts.rod( STEEL(), [ 0, 0.5, hoppers[ 0 ] - 0.3 ], [ 0, 0.5, zb + 0.4 ], 0.1, 10 );
	parts.rod( STEEL(), [ 0, 0.5, zb + 0.4 ], [ 0.6, 1.0, zb + 0.55 ], 0.1, 10 );
	parts.rod( STEEL(), [ 0.9, 1.05, hoppers[ 0 ] ], [ 0.9, 1.05, zb ], 0.05, 8 );
	axle( parts, T + 10.4, { r: 0.53, x: 0.95, width: 0.27, dual: true } );
	axle( parts, T + 11.77, { r: 0.53, x: 0.95, width: 0.27, dual: true } );
	flaps( parts, T + 12.5, 0.95 );
	tailLamps( parts, T + 12.48, 1.1 );

	// Manholes and the catwalk on top, the air line along it, and the ladder at the back.
	const top = yc + R;
	parts.box( mat( 0x8d9296, { roughness: 0.6, metalness: 0.5 } ), [ 0.5, 0.04, 9.6 ], [ 0, top - 0.03, T + 6.3 ] );
	for ( const z of hoppers ) parts.cylinder( alu, 0.3, 0.15, [ 0, top - 0.02, z ], 18 );
	parts.rod( STEEL(), [ 0.45, top - 0.1, T + 1.2 ], [ 0.45, top - 0.1, T + 11 ], 0.04, 8 );
	for ( const s of [ - 1, 1 ] ) parts.rod( STEEL(), [ s * 0.22, 1.2, zb + 0.4 ], [ s * 0.22, top, zb - 0.35 ], 0.025, 6 );
	for ( let i = 1; i < 9; i ++ ) {

		const t = i / 9;
		parts.rod( STEEL(), [ - 0.22, 1.2 + t * ( top - 1.2 ), zb + 0.4 - t * 0.75 ], [ 0.22, 1.2 + t * ( top - 1.2 ), zb + 0.4 - t * 0.75 ], 0.018, 6 );

	}

	return centred( parts );

}

// A volumetric concrete mixer on a tandem chassis: the water tank behind the cab, the split
// sand / stone bin, the cement bin over the back of the feed belt, admixture tanks, and the mixing
// auger swung out to the right at the back. About 10.5 m long (13 m to the end of the auger) and
// 3.7 m high.
function volumetricMixer() {

	const parts = new Parts();
	const white = paint( 0xeceeea );
	const orange = paint( 0xe36f1e );
	const front = - 5.6;
	const back = 4.6;
	const { cabBack, frameTop } = truck( parts, { colour: 0xe36f1e, front, rear: 2.4, back, axles: 2 } );
	const y0 = frameTop;

	// Subframe and the water tank.
	parts.box( DARK(), [ 2.3, 0.2, back - cabBack - 0.2 ], [ 0, y0, ( cabBack + 0.2 + back ) / 2 ] );
	parts.box( white, [ 2.4, 1.55, 1.0 ], [ 0, y0 + 0.2, cabBack + 0.8 ] );
	// The aggregate bin: sloped sides down to the feed belt, a divider, and grates over the top.
	const b0 = cabBack + 1.35;
	const b1 = b0 + 3.3;
	parts.add( orange, alongZ( [ [ - 0.45, y0 + 0.2 ], [ 0.45, y0 + 0.2 ], [ 1.25, y0 + 1.6 ], [ 1.25, y0 + 2.55 ], [ - 1.25, y0 + 2.55 ], [ - 1.25, y0 + 1.6 ] ], b0, b1 ) );
	parts.box( DARK(), [ 2.5, 0.04, b1 - b0 ], [ 0, y0 + 2.55, ( b0 + b1 ) / 2 ] );
	for ( let i = 1; i < 10; i ++ ) parts.box( STEEL(), [ 2.5, 0.05, 0.03 ], [ 0, y0 + 2.57, b0 + i * ( b1 - b0 ) / 10 ] );
	parts.box( orange, [ 2.52, 0.08, 0.06 ], [ 0, y0 + 2.5, ( b0 + b1 ) / 2 - 0.4 ] );
	// The cement bin at the back, its lid and the meter on its side.
	const c0 = b1 + 0.05;
	parts.box( white, [ 2.4, 2.3, back - c0 - 0.3 ], [ 0, y0 + 0.25, ( c0 + back - 0.3 ) / 2 ] );
	parts.cylinder( DARK(), 0.32, 0.08, [ 0, y0 + 2.55, ( c0 + back ) / 2 ], 16 );
	parts.box( DARK(), [ 0.04, 0.4, 0.5 ], [ 1.22, y0 + 1.2, ( c0 + back ) / 2 ] );
	// Admixture tanks on the left of the water tank, control panel on the right at the back.
	for ( const z of [ cabBack + 0.55, cabBack + 1.05 ] ) parts.cylinder( mat( 0xd8dadb, { roughness: 0.6 } ), 0.18, 0.7, [ - 1.05, y0 + 1.75, z ], 12 );
	parts.box( DARK(), [ 0.6, 0.5, 0.15 ], [ 0.75, y0 + 0.6, back - 0.2 ] );

	// The mixing auger: its trough from under the back of the bins, swung 35° to the right and
	// sloping down, with the chute on its end.
	const swing = 35 * DEG;
	const along = new Vector3( Math.sin( swing ), 0, Math.cos( swing ) );
	const a = new Vector3( 0, y0 + 0.2, back - 0.35 );
	const b = a.clone().addScaledVector( along, 3.2 ).add( new Vector3( 0, 0.15, 0 ) );
	member( parts, orange, [ 0.45, 0.42 ], a, b );
	parts.path( DARK(), [ a.clone().add( new Vector3( 0, 0.3, 0 ) ).toArray(), b.clone().add( new Vector3( 0, 0.3, 0 ) ).toArray() ], 0.06, 6, false );
	member( parts, DARK(), [ 0.3, 0.2 ], b.clone().add( new Vector3( 0, - 0.1, 0 ) ), b.clone().addScaledVector( along, 0.6 ).add( new Vector3( 0, - 0.6, 0 ) ) );
	ram( parts, 0.05, [ 0, y0 - 0.1, back - 0.4 ], a.clone().addScaledVector( along, 1.6 ).add( new Vector3( 0, - 0.2, 0 ) ) );
	tailLamps( parts, back + 0.01, y0 - 0.05, 1.0 );
	return centred( parts );

}

// A combination sewer cleaner (jetter and vacuum) of the Vactor 2100 class on a tandem chassis:
// the cylindrical debris body at the back with its rear door, the aluminium water tanks ahead of
// it, the hose reel on the front bumper and the 8 in vacuum boom over the cab, its flexible tube
// hanging down in front to a catch basin. About 12.7 m long to the tube and 3.8 m high.
function comboTruck() {

	const parts = new Parts();
	const yellow = YELLOW();
	const alu = ALU();
	const front = - 5.5;
	const back = 5.2;
	const { cabBack, frameTop } = truck( parts, { colour: 0xeceeea, front, rear: 2.9, back, axles: 2 } );

	// Water tanks behind the cab, and the blower housing under them.
	parts.box( alu, [ 2.4, 1.65, 1.6 ], [ 0, frameTop + 0.1, cabBack + 0.95 ] );
	for ( let i = 1; i < 4; i ++ ) parts.box( STEEL(), [ 2.42, 0.03, 1.62 ], [ 0, frameTop + 0.1 + i * 0.41, cabBack + 0.95 ] );
	parts.box( DARK(), [ 2.3, 0.1, back - cabBack - 0.2 ], [ 0, frameTop, ( cabBack + 0.2 + back ) / 2 ] );
	// The debris body: a cylinder on a cradle with stiffening rings, its rear door and dump ram.
	const d0 = cabBack + 1.85;
	const d1 = back + 0.05;
	const R = 1.05;
	const yc = frameTop + 0.1 + R;
	parts.rod( yellow, [ 0, yc, d0 ], [ 0, yc, d1 ], R, 28 );
	for ( let z = d0 + 0.6; z < d1 - 0.3; z += 0.9 ) parts.rod( yellow, [ 0, yc, z ], [ 0, yc, z + 0.08 ], R + 0.04, 28 );
	parts.rod( yellow, [ 0, yc, d1 ], [ 0, yc, d1 + 0.18 ], R + 0.05, 28 );
	parts.rod( DARK(), [ 0, yc, d1 + 0.18 ], [ 0, yc, d1 + 0.26 ], 0.5, 18 );
	for ( const s of [ - 1, 1 ] ) parts.box( DARK(), [ 0.2, 1.0, 0.2 ], [ s * 1.12, yc - 0.5, d1 + 0.05 ] );
	parts.box( DARK(), [ 2.0, 0.5, d1 - d0 - 0.5 ], [ 0, frameTop + 0.05, ( d0 + d1 ) / 2 ] );
	ram( parts, 0.09, [ 0, frameTop + 0.25, d0 + 0.6 ], [ 0, yc - 0.85, d0 + 2.2 ] );

	// The boom: a turret on top of the front of the debris body, the boom out over the cab, and the
	// flexible tube hanging from its end to the ground in front of the truck.
	const turret = [ 0, yc + R - 0.05, d0 + 0.3 ];
	parts.cylinder( yellow, 0.35, 0.25, turret, 16 );
	const pivot = new Vector3( 0, turret[ 1 ] + 0.3, turret[ 2 ] );
	const tipZ = front - 1.0;
	const tip = new Vector3( 0, pivot.y + 0.05, tipZ );
	member( parts, yellow, [ 0.35, 0.3 ], pivot, pivot.clone().lerp( tip, 0.55 ) );
	member( parts, yellow, [ 0.28, 0.24 ], pivot.clone().lerp( tip, 0.5 ), tip );
	parts.rod( BLACK(), [ 0, pivot.y + 0.22, pivot.z - 0.2 ], [ 0, tip.y + 0.15, tip.z ], 0.1, 10 );
	parts.path( HOSE(), [ [ 0, tip.y + 0.1, tip.z - 0.05 ], [ 0, tip.y - 0.1, tip.z - 0.35 ], [ 0, 0.2, tip.z - 0.45 ], [ 0, 0, tip.z - 0.45 ] ], 0.12, 10 );
	ram( parts, 0.06, [ 0, turret[ 1 ] + 0.15, turret[ 2 ] - 0.3 ], pivot.clone().lerp( tip, 0.2 ).add( new Vector3( 0, - 0.15, 0 ) ) );
	// A catch basin grate under the tube.
	parts.box( DARK(), [ 0.7, 0.03, 0.5 ], [ 0, 0, tip.z - 0.45 ] );

	// The hose reel on a frame ahead of the bumper, and the jet hose's guide.
	const reelZ = front - 0.35;
	for ( const s of [ - 1, 1 ] ) parts.box( DARK(), [ 0.06, 0.95, 0.5 ], [ s * 0.55, 0.45, reelZ ] );
	parts.box( DARK(), [ 1.2, 0.1, 0.5 ], [ 0, 0.4, reelZ ] );
	parts.rod( DARK(), [ - 0.5, 1.1, reelZ ], [ 0.5, 1.1, reelZ ], 0.45, 20 );
	parts.rod( mat( 0xe2a41c, { roughness: 0.7 } ), [ - 0.45, 1.1, reelZ ], [ 0.45, 1.1, reelZ ], 0.4, 20 );
	parts.rod( DARK(), [ - 0.25, 1.65, reelZ - 0.3 ], [ 0.25, 1.65, reelZ - 0.3 ], 0.05, 8 );
	tailLamps( parts, back + 0.01, frameTop - 0.2, 1.0 );
	return centred( parts );

}

// A side dump trailer behind a day-cab tractor: a 40 ft half-round tub pivoted along its right
// edge on a tri-axle frame, tipped 55° to the right by its rams, with the windrow of base gravel
// it has just dropped. About 18 m long.
function sideDump() {

	const parts = new Parts();
	const { fifth } = tractor( parts, - 10.3, { colour: 0x1f4f8f, sleeper: false, drives: 2 } );
	const T = fifth - 0.9;
	const L = 13.1;
	const tub = paint( 0xc3c7ca );

	// Frame, kingpin plate, landing gear, axles.
	for ( const s of [ - 1, 1 ] ) parts.box( DARK(), [ 0.14, 0.4, L ], [ s * 0.45, 1.0, T + L / 2 ] );
	for ( let z = T + 0.5; z < T + L; z += 1.2 ) parts.box( DARK(), [ 2.4, 0.12, 0.12 ], [ 0, 1.3, z ] );
	parts.box( DARK(), [ 2.3, 0.15, 1.6 ], [ 0, 1.05, T + 0.8 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( DARK(), [ 0.12, 0.95, 0.12 ], [ s * 0.85, 0.15, T + 2.4 ] );
		parts.box( DARK(), [ 0.3, 0.06, 0.3 ], [ s * 0.85, 0, T + 2.4 ] );

	}

	for ( const z of [ T + 9.73, T + 11.1, T + 12.47 ] ) axle( parts, z, { r: 0.53, x: 0.95, width: 0.27, dual: true } );
	parts.box( DARK(), [ 2.2, 0.2, 3.6 ], [ 0, 1.0, T + 11.1 ] );
	tailLamps( parts, T + L + 0.01, 1.1 );

	// The tub's U section, its pivot at the frame's right edge, tipped to the right.
	const width = 2.5;
	const deep = 1.5;
	const section = ( w, d, inset ) => {

		const points = [];
		for ( let i = 0; i <= 12; i ++ ) {

			const a = Math.PI + i / 12 * Math.PI;
			points.push( [ - width / 2 + w / 2 * Math.cos( a ), d / 2 + inset + d / 2 * Math.sin( a ) ] );

		}

		return points;

	};

	const outer = [ [ - width, deep ], ...section( width, deep, 0 ), [ 0, deep ] ];
	const inner = [ [ - 0.06, deep ], ...section( width - 0.12, deep - 0.12, 0.06 ).reverse(), [ - width + 0.06, deep ] ];
	const tip = - 55 * DEG;
	const pivot = new Matrix4().makeTranslation( 1.25, 1.35, 0 ).multiply( new Matrix4().makeRotationZ( tip ) );
	const z0 = T + 0.45;
	const z1 = T + 0.45 + 40 * FT;
	parts.add( tub, alongZ( [ ...outer, ...inner ], z0, z1 ), pivot );
	for ( const z of [ z0, z1 - 0.06 ] ) parts.add( tub, alongZ( outer, z, z + 0.06 ), pivot );
	const rib = [ ...section( width + 0.08, deep + 0.08, - 0.04 ), ...section( width, deep, 0 ).reverse() ];
	for ( let z = z0 + 1.2; z < z1 - 0.5; z += 1.5 ) parts.add( tub, alongZ( rib, z, z + 0.1 ), pivot );
	// Its pivot hinges and the rams from the left of the frame up to the underside of the tub.
	parts.rod( STEEL(), [ 1.25, 1.35, z0 ], [ 1.25, 1.35, z1 ], 0.06, 8 );
	const local = ( x, y, z ) => new Vector3( x, y, z ).applyMatrix4( pivot );
	for ( const z of [ T + 3.2, T + 8.0 ] ) ram( parts, 0.1, [ - 0.6, 1.3, z ], local( - width * 0.65, 0.12, z ) );

	// The windrow of gravel along the right side.
	parts.add( mat( 0x7a7368, { roughness: 1 } ), alongZ( [ [ 1.7, 0 ], [ 3.0, 0.75 ], [ 3.4, 0.7 ], [ 4.6, 0 ] ], T + 0.8, T + 12.4 ) );
	return centred( parts );

}

// A 15-passenger high-roof van (148 in wheelbase, extended body): about 6.7 m long, 2.07 m wide
// over the body and 2.78 m high, with four rows of side windows and the sliding door on the right.
function crewVan() {

	const parts = new Parts();
	const body = paint( 0xeceeea );
	const L = 6.7;
	const z0 = - L / 2;
	const r = 0.37;
	const W = 2.07;

	// Body: a sloped nose up to the windscreen, the tall roof, and the square back.
	plate( parts, body, [ [ z0 + 0.05, 0.38 ], [ z0 + 0.05, 0.95 ], [ z0 + 0.25, 1.05 ], [ z0 + 0.9, 1.2 ], [ z0 + 1.55, 2.0 ], [ z0 + 1.85, 2.72 ], [ z0 + 2.1, 2.78 ], [ L / 2 - 0.05, 2.78 ], [ L / 2, 2.72 ], [ L / 2, 0.42 ] ], W );
	parts.box( BRIGHT(), [ 1.9, 0.2, 0.18 ], [ 0, 0.38, z0 + 0.08 ] );
	parts.box( DARK(), [ 2.0, 0.2, 0.15 ], [ 0, 0.4, L / 2 + 0.02 ] );
	parts.box( DARK(), [ 0.9, 0.3, 0.03 ], [ 0, 0.62, z0 + 0.04 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( LAMP(), [ 0.3, 0.14, 0.12 ], [ s * 0.78, 0.92, z0 + 0.12 ] );
	// Windscreen, cab door glass, side windows, back door glass, mirrors.
	const screen = Math.atan2( 0.8, 0.65 );
	parts.block( GLASS(), [ 1.85, 0.98, 0.02 ], [ 0, 1.6, z0 + 1.22 - 0.02 ], [ - screen + Math.PI / 2, 0, 0 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( GLASS(), [ 0.01, 0.55, 0.7 ], [ s * ( W / 2 + 0.002 ), 1.45, z0 + 1.95 ] );
		for ( const z of [ - 0.15, 0.85, 1.85 ] ) parts.box( GLASS(), [ 0.01, 0.55, 0.85 ], [ s * ( W / 2 + 0.002 ), 1.45, z ] );
		parts.box( DARK(), [ 0.06, 0.32, 0.18 ], [ s * 1.13, 1.55, z0 + 1.45 ] );
		parts.box( DARK(), [ 0.01, 1.85, 0.015 ], [ s * ( W / 2 + 0.003 ), 0.45, z0 + 2.4 ] );

	}

	// Left side: a small quarter glass just behind the B-pillar. Right side: the sliding door's
	// back seam, about 1.3 m behind the front door's.
	parts.box( GLASS(), [ 0.01, 0.55, 0.22 ], [ - ( W / 2 + 0.002 ), 1.45, - 0.76 ] );
	parts.box( DARK(), [ 0.01, 1.85, 0.015 ], [ W / 2 + 0.003, 0.45, 0.4 ] );
	for ( const x of [ - 0.48, 0.48 ] ) parts.box( GLASS(), [ 0.78, 0.6, 0.01 ], [ x, 1.4, L / 2 + 0.003 ] );
	parts.box( DARK(), [ 0.015, 2.2, 0.01 ], [ 0, 0.45, L / 2 + 0.004 ] );
	tailLamps( parts, L / 2 + 0.01, 1.5, W / 2 - 0.08 );

	// Wheels, their faces flush with the body, in dark wheel wells.
	for ( const z of [ z0 + 1.0, z0 + 1.0 + 148 * IN ] ) {

		axle( parts, z, { r, x: W / 2 + 0.012 - 0.12, width: 0.24 } );
		for ( const s of [ - 1, 1 ] ) parts.box( BLACK(), [ 0.01, 0.44, 0.92 ], [ s * ( W / 2 + 0.002 ), 0.38, z ] );

	}

	return centred( parts );

}

// --- service trucks ----------------------------------------------------------------------------

// A 55 ft insulated aerial device on a Class 7 single-axle truck: a utility body with compartments,
// the turret at the back, the steel lower boom raised, the fibreglass upper boom out over the right
// and the one-man platform, levelled, 15 m up; outriggers set at the back and behind the cab.
// About 9.8 m long, the platform 8 m out to the side.
function bucketTruck() {

	const parts = new Parts();
	const white = paint( 0xeceeea );
	const front = - 4.7;
	const back = 5.0;
	const { cabBack, frameTop } = truck( parts, { colour: 0xeceeea, front, rear: 1.9, back, axles: 1 } );

	serviceBody( parts, white, cabBack + 0.1, back, { doors: 4 } );
	// Boom rest over the front of the body, and the outriggers.
	parts.box( DARK(), [ 0.1, 1.5, 0.1 ], [ 0, 1.95, cabBack + 0.3 ] );
	parts.box( DARK(), [ 0.6, 0.12, 0.2 ], [ 0, 3.4, cabBack + 0.3 ] );
	for ( const z of [ cabBack + 1.3, back - 0.3 ] ) for ( const s of [ - 1, 1 ] ) {

		member( parts, white, [ 0.2, 0.2 ], [ s * 0.9, frameTop - 0.15, z ], [ s * 2.25, 0.18, z ] );
		parts.box( DARK(), [ 0.5, 0.06, 0.5 ], [ s * 2.25, 0.1, z ] );
		parts.box( TIMBER(), [ 0.6, 0.1, 0.6 ], [ s * 2.25, 0, z ] );

	}

	// The turret on its pedestal at the back of the body.
	const tz = back - 1.0;
	parts.cylinder( white, 0.45, 0.85, [ 0, 1.95, tz ], 18 );
	parts.box( white, [ 0.9, 0.6, 1.0 ], [ 0, 2.8, tz ] );
	const out = new Vector3( 1, 0, 0 );
	const dir = a => out.clone().multiplyScalar( Math.cos( a * DEG ) ).addScaledVector( UP, Math.sin( a * DEG ) );
	const foot = new Vector3( 0.25, 3.2, tz );
	const knee = foot.clone().addScaledVector( dir( 72 ), 6.6 );
	const tip = knee.clone().addScaledVector( dir( 40 ), 8.8 );
	member( parts, white, [ 0.32, 0.42 ], foot, knee );
	// Upper boom: an insulating grey section by the knee, white fibreglass on out.
	member( parts, mat( 0x5d6166, { roughness: 0.6 } ), [ 0.3, 0.36 ], knee.clone().addScaledVector( dir( 40 ), - 0.3 ), knee.clone().addScaledVector( dir( 40 ), 1.5 ) );
	member( parts, mat( 0xf2f0ea, { roughness: 0.4 } ), [ 0.28, 0.32 ], knee.clone().addScaledVector( dir( 40 ), 1.5 ), tip );
	parts.rod( STEEL(), [ knee.x, knee.y, tz - 0.25 ], [ knee.x, knee.y, tz + 0.25 ], 0.1, 10 );
	ram( parts, 0.09, [ 0.6, 2.85, tz ], foot.clone().addScaledVector( dir( 72 ), 3.2 ).addScaledVector( dir( - 18 ), 0.25 ) );
	ram( parts, 0.07, foot.clone().addScaledVector( dir( 72 ), 5.4 ).addScaledVector( dir( 162 ), 0.3 ), knee.clone().addScaledVector( dir( 40 ), 1.0 ).addScaledVector( dir( 130 ), 0.25 ) );

	// The platform hung level at the tip: a 24 × 30 in fibreglass bucket, its liner and the controls.
	const px = tip.x + 0.45;
	const floor = tip.y - 0.85;
	parts.box( DARK(), [ 0.5, 0.2, 0.3 ], [ tip.x + 0.1, tip.y - 0.1, tz ] );
	parts.box( mat( 0xf2c418, { roughness: 0.45 } ), [ 0.76, 1.07, 0.62 ], [ px, floor, tz ] );
	parts.box( BLACK(), [ 0.66, 0.02, 0.52 ], [ px, floor + 1.06, tz ] );
	parts.box( DARK(), [ 0.18, 0.15, 0.15 ], [ px - 0.3, floor + 1.07, tz ] );
	return centred( parts );

}

// A field mechanic's truck on a Class 6 single-axle chassis: a 14 ft service body with its
// compartments, the reinforced crane corner at the back right carrying a 6,000 lb telescopic crane
// stowed forward on its rest, the air compressor in the front right compartment, a parts bin rack
// on the bed and a hose reel at the back. About 8.8 m long.
function mechanicsTruck() {

	const parts = new Parts();
	const body = paint( 0xe9e8e2 );
	const crane = YELLOW();
	const front = - 4.4;
	const back = 4.4;
	const { cabBack } = truck( parts, { colour: 0xe9e8e2, front, rear: 1.45, back, axles: 1 } );
	serviceBody( parts, body, cabBack + 0.1, back, { doors: 4 } );
	// Compressor louvres in the front right door, and a headache rack with the boom rest.
	for ( let i = 0; i < 6; i ++ ) parts.box( DARK(), [ 0.01, 0.03, 0.6 ], [ 1.232, 1.0 + i * 0.1, cabBack + 0.55 ] );
	parts.box( DARK(), [ 2.4, 0.9, 0.08 ], [ 0, 1.95, cabBack + 0.16 ] );
	// Parts bins on the bed and an air reel behind them.
	for ( let i = 0; i < 3; i ++ ) for ( let j = 0; j < 3; j ++ ) parts.box( mat( 0x1f4f8f, { roughness: 0.6 } ), [ 0.3, 0.2, 0.35 ], [ - 0.35 + i * 0.32, 1.21 + j * 0.22, cabBack + 1.0 ] );
	parts.rod( mat( 0xc4161c, { roughness: 0.5 } ), [ - 0.5, 1.5, back - 0.6 ], [ - 0.1, 1.5, back - 0.6 ], 0.3, 16 );

	// The crane: its pedestal on the back right corner, the boom lying forward on the rest, the hook
	// tied off to the bumper of the rest.
	const cx = 0.8;
	const cz = back - 0.45;
	parts.box( body, [ 0.6, 0.85, 0.6 ], [ cx, 1.15, cz ] );
	parts.cylinder( crane, 0.22, 0.45, [ cx, 2.0, cz ], 14 );
	parts.box( crane, [ 0.4, 0.35, 0.5 ], [ cx, 2.45, cz ] );
	const foot = new Vector3( cx, 2.7, cz );
	const head = new Vector3( cx, 2.55, cabBack + 0.25 );
	member( parts, crane, [ 0.28, 0.32 ], foot, foot.clone().lerp( head, 0.6 ) );
	member( parts, crane, [ 0.22, 0.25 ], foot.clone().lerp( head, 0.55 ), head );
	ram( parts, 0.06, [ cx, 2.5, cz - 0.2 ], foot.clone().lerp( head, 0.35 ).add( new Vector3( 0, - 0.12, 0 ) ) );
	parts.box( DARK(), [ 0.2, 0.4, 0.15 ], [ cx, 2.1, head.z - 0.05 ] );
	tailLamps( parts, back + 0.01, 0.7 );
	return centred( parts );

}

// --- lowboy ------------------------------------------------------------------------------------

// A 30 t excavator on a 53 ft 3-axle gooseneck lowboy behind a tandem day-cab tractor: the neck
// over the fifth wheel, the 25 ft well 0.6 m up, the rear deck over the axles. The excavator sits
// in the well facing back, boom down over the rear deck with the bucket curled on it, chained at
// its track ends, and OVERSIZE LOAD banners front and back. About 21.6 m long and 4.1 m high, the
// 600 mm shoes overhanging the 8 ft 6 in trailer.
function lowboyExcavator() {

	const parts = new Parts();
	const frame = paint( 0x1f2328 );
	const tractorFront = - 10.5;
	const { fifth } = tractor( parts, tractorFront, { colour: 0xb4231b, sleeper: false, drives: 2 } );
	const T = fifth - 1.0;
	const W = 2.59;
	const neckEnd = T + 4.0;
	const well0 = T + 4.6;
	const well1 = T + 12.2;
	const end = T + 16.15;
	const wellY = 0.6;
	const rearY = 1.2;

	// Gooseneck and its drop to the well.
	parts.box( frame, [ W - 0.3, 0.5, neckEnd - T ], [ 0, 1.1, ( T + neckEnd ) / 2 ] );
	plate( parts, frame, [ [ neckEnd, 1.6 ], [ neckEnd, 1.1 ], [ well0, 0.2 ], [ well0 + 0.3, 0.2 ], [ well0 + 0.3, wellY ] ], W - 0.1 );
	// The well: side beams and a wood deck.
	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ 0.22, 0.45, well1 - well0 ], [ s * ( W / 2 - 0.11 ), wellY - 0.4, ( well0 + well1 ) / 2 ] );
	parts.box( WOOD(), [ W - 0.44, 0.06, well1 - well0 ], [ 0, wellY - 0.06, ( well0 + well1 ) / 2 ] );
	parts.box( frame, [ W - 0.44, 0.3, well1 - well0 ], [ 0, wellY - 0.36, ( well0 + well1 ) / 2 ] );
	// Rear deck over the axles.
	plate( parts, frame, [ [ well1 - 0.3, 0.2 ], [ well1 - 0.3, wellY ], [ well1, rearY ], [ end, rearY ], [ end, 0.85 ], [ well1 + 0.4, 0.85 ] ], W );
	parts.box( WOOD(), [ W - 0.3, 0.02, end - well1 - 0.1 ], [ 0, rearY, ( well1 + end ) / 2 + 0.05 ] );
	for ( const z of [ T + 12.93, T + 14.3, T + 15.67 ] ) axle( parts, z, { r: 0.42, x: 0.93, width: 0.26, dual: true } );
	flaps( parts, end - 0.08, 0.95, 0.5 );
	tailLamps( parts, end + 0.01, rearY - 0.15, 1.2 );

	// The excavator in the well facing back.
	const sz = T + 8.6;
	moveInto( parts, haulExcavator( rearY - wellY + 0.02 ), new Matrix4().makeTranslation( 0, wellY, sz ).multiply( new Matrix4().makeRotationY( Math.PI ) ) );
	const tx = 1.6 - 0.3;
	chains( parts, [ [ [ tx, wellY + 0.5, sz + 2.3 ], [ W / 2 - 0.05, wellY, sz + 3.0 ] ], [ [ - tx, wellY + 0.5, sz + 2.3 ], [ - W / 2 + 0.05, wellY, sz + 3.0 ] ],
		[ [ tx, wellY + 0.5, sz - 2.3 ], [ W / 2 - 0.05, wellY, sz - 3.0 ] ], [ [ - tx, wellY + 0.5, sz - 2.3 ], [ - W / 2 + 0.05, wellY, sz - 3.0 ] ] ] );

	// OVERSIZE LOAD banners on the tractor's bumper and the back of the trailer.
	const banner = drawn( 'oversize load banner', [ 512, 96 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#f5c400';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#141414';
		ctx.font = 'bold 64px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText( 'OVERSIZE LOAD', w / 2, h / 2 + 3 );

	}, { side: DoubleSide } );
	parts.add( banner, new PlaneGeometry( 2.1, 0.4 ), new Matrix4().makeRotationY( Math.PI ).setPosition( 0, 0.45, tractorFront - 0.01 ) );
	parts.add( banner, new PlaneGeometry( 2.1, 0.4 ), _m.makeTranslation( 0, 1.0, end + 0.02 ) );
	return centred( parts );

}
