import { BufferAttribute, BufferGeometry, DoubleSide, MathUtils, Matrix4 } from 'three';
import { BLACK, drawn, FT, GLASS, IN, mat, Parts, RUBBER } from './parts.js';
import { extruded, PLATE, RAIL_HEAD, RAIL_PROFILE, RAIL_TOP, RAIL_X, TIE, TIES_PER_PANEL, BALLAST_UNDER, trackParts } from './site-extras.js';

// Rail maintenance machines and track pieces, skid steer and excavator attachments staged on the
// ground, and small tools and site gear, built in code at the sizes of the common North American
// classes (no brands). Like the other built-in pieces each stands on y = 0 with its front facing
// -Z (+X is its right).
//
// The rail-bound machines (tamper, ballast regulator) stand on their own length of track, the
// same as a 39 ft panel (site-extras.js), so they go in line with a row of panels; the hi-rail
// trucks stand on the ground with their guide wheels down, as when they've just set on.

const DEG = MathUtils.DEG2RAD;
const _m = new Matrix4();
const _r = new Matrix4();

const PANEL = 39 * FT;
const TIE_PITCH = PANEL / TIES_PER_PANEL;

export const TOOL_ITEMS = [
	// Rail.
	{ id: 'hi-rail-pickup', name: 'Hi-rail pickup, crew cab (3/4 ton, 8 ft box, guide wheels down)', category: 'Rail',
		keywords: 'hi-rail hirail hy-rail road rail pickup truck track inspection railroad guide wheels rail gear', build: hiRailPickup },
	{ id: 'hi-rail-truck', name: 'Hi-rail truck, flatbed with knuckle crane (Class 7, 16 ft deck, guide wheels down)', category: 'Rail',
		keywords: 'hi-rail hirail hy-rail road rail truck boom truck crane flatbed railroad section gang rail gear', build: hiRailTruck },
	{ id: 'ballast-regulator', name: 'Ballast regulator (plow, wing plows, broom) on a 39 ft track panel', category: 'Rail',
		keywords: 'ballast regulator regulator plow broom railroad maintenance of way mow track machine kershaw', build: ballastRegulator },
	{ id: 'production-tamper', name: 'Production tamper with lining buggy (16 tool, 60 ft) on 78 ft of track', category: 'Rail',
		keywords: 'tamper production tamper surfacing tamping machine mark iv 09 railroad maintenance of way lining surfacing', build: productionTamper },
	{ id: 'rail-turnout-no10', name: 'Track turnout / switch, No. 10 right hand (136 lb rail, timber ties, 128 ft)', category: 'Rail',
		keywords: 'turnout switch track switch points frog railroad siding spur crossover diverging no 10', build: turnout },
	{ id: 'rail-bumping-post', name: 'Bumping post, steel, end of track (on 19.5 ft of track)', category: 'Rail',
		keywords: 'bumping post bumper end of track stop buffer stop railroad spur', build: bumpingPost },
	{ id: 'rail-derail', name: 'Derail, hinged with throw stand and sign (on 13 ft of track)', category: 'Rail',
		keywords: 'derail derailer track protection blue flag railroad spur siding', build: derail },
	// Attachments staged on the ground.
	{ id: 'ss-pallet-forks', name: 'Skid steer pallet forks (48 in tines, 4,000 lb)', category: 'Heavy equipment',
		keywords: 'pallet forks fork frame skid steer attachment bobcat quick attach tines', build: palletForks },
	{ id: 'ss-auger', name: 'Skid steer auger drive with 12 in and 18 in bits (48 in)', category: 'Heavy equipment',
		keywords: 'auger post hole digger drill skid steer attachment bit bobcat earth drill', build: augerSet },
	{ id: 'ss-breaker', name: 'Hydraulic breaker for skid steer (500 ft-lb class) on blocks', category: 'Heavy equipment',
		keywords: 'breaker hammer hoe ram jackhammer hydraulic hammer skid steer attachment chisel', build: breaker },
	{ id: 'ss-grapple-bucket', name: 'Skid steer grapple bucket (72 in, twin grapples)', category: 'Heavy equipment',
		keywords: 'grapple bucket brush grapple root rake skid steer attachment clamshell', build: grappleBucket },
	{ id: 'ss-sweeper-broom', name: 'Skid steer pickup sweeper broom (72 in, with hopper)', category: 'Heavy equipment',
		keywords: 'sweeper broom pickup broom skid steer attachment sweepster street sweeper', build: sweeperBroom },
	{ id: 'excavator-trenching-bucket', name: 'Excavator trenching bucket (24 in, 20 t class)', category: 'Heavy equipment',
		keywords: 'trenching bucket digging bucket excavator attachment teeth trench bucket', build: trenchingBucket },
	{ id: 'excavator-quick-coupler', name: 'Excavator quick coupler, hydraulic pin grabber (20 t class)', category: 'Heavy equipment',
		keywords: 'quick coupler quick hitch pin grabber excavator attachment wedge lock', build: quickCoupler },
	// Small tools and site gear.
	{ id: 'concrete-saw-walk-behind', name: 'Concrete saw, walk-behind (18 in blade, gas)', category: 'Concrete & batching',
		keywords: 'concrete saw walk behind flat saw slab saw road saw cutting joints husqvarna', build: concreteSaw },
	{ id: 'pressure-washer-cart', name: 'Pressure washer, cold water on cart (4,000 psi, gas)', category: 'Site services',
		keywords: 'pressure washer power washer cold water cart wash gas jet', build: pressureWasherCart },
	{ id: 'pressure-washer-hot-trailer', name: 'Pressure washer, hot water on trailer (3,500 psi, 200 gal tank)', category: 'Site services',
		keywords: 'pressure washer hot water steam power washer trailer hotsy wash burner', build: hotWasherTrailer },
	{ id: 'welder-generator-trailer', name: 'Welder / generator, engine-driven on trailer (300 A diesel)', category: 'Power & air',
		keywords: 'welder generator welding machine engine drive trailer stick welder lincoln ranger miller bobcat leads', build: welderTrailer },
	{ id: 'spreader-bar-slings', name: 'Spreader bar, pipe (20 ft, 30 t) with slings, on dunnage', category: 'Cranes & lifts',
		keywords: 'spreader bar lifting beam rigging slings shackles master link crane lift dunnage', build: spreaderBar },
	{ id: 'handwash-eyewash-station', name: 'Handwash station (2 sinks, foot pumps) with gravity eyewash', category: 'Site services',
		keywords: 'handwash hand wash station sink portable foot pump eyewash eye wash station hygiene', build: washStation },
	{ id: 'table-saw-jobsite', name: 'Table saw, job-site on wheeled stand (10 in)', category: 'Site services',
		keywords: 'table saw jobsite saw dewalt carpenter cutting wood stand', build: tableSaw },
	{ id: 'sawhorses-plywood', name: 'Sawhorses with a plywood sheet (4 x 8 ft work table)', category: 'Site services',
		keywords: 'sawhorses saw horses plywood work table bench carpenter', build: sawhorses },
];

// --- materials and small parts ---------------------------------------------------------------

const paint = color => mat( color, { roughness: 0.5, metalness: 0.2 } );
const YELLOW = () => paint( 0xf2b200 );
const DARK = () => mat( 0x2c2e31, { roughness: 0.7, metalness: 0.2 } );
const STEEL = () => mat( 0x7d8287, { roughness: 0.5, metalness: 0.6 } );
const BRIGHT = () => mat( 0xc9ccce, { roughness: 0.35, metalness: 0.3 } );
const WHEEL_STEEL = () => mat( 0x4a4440, { roughness: 0.6, metalness: 0.5 } );
const TIMBER = () => mat( 0x9c7a50, { roughness: 0.95 } );
const AMBER = () => mat( 0xff9a1a, { roughness: 0.3, emissive: 0xc76a00, emissiveIntensity: 0.6 } );
const RED_LAMP = () => mat( 0xb3141b, { roughness: 0.3, emissive: 0x7a0a0e, emissiveIntensity: 0.6 } );
const LAMP = () => mat( 0xfff3c9, { roughness: 0.3, emissive: 0x6b6040 } );
const HOSE = () => mat( 0x1f2022, { roughness: 0.75 } );
const ROPE = () => mat( 0x6f7377, { roughness: 0.55, metalness: 0.6 } );
const plastic = color => mat( color, { roughness: 0.6 } );

// A tyre on its rim, axle across x, centred on [ x, y, z ].
function tyre( parts, radius, width, [ x, y, z ], rim = STEEL() ) {

	parts.rod( RUBBER(), [ x - width / 2, y, z ], [ x + width / 2, y, z ], radius, 20 );
	parts.rod( rim, [ x - width / 2 - 0.004, y, z ], [ x + width / 2 + 0.004, y, z ], radius * 0.55, 14 );

}

// A pair of flanged steel rail wheels on an axle at z, their treads on the rails' tops at y0 (the
// flanges inside, reaching below it).
function railWheels( parts, z, radius, y0 = RAIL_TOP, width = 0.13 ) {

	for ( const side of [ - 1, 1 ] ) {

		const x = side * RAIL_X;
		parts.rod( WHEEL_STEEL(), [ x - width / 2, y0 + radius, z ], [ x + width / 2, y0 + radius, z ], radius, 18 );
		const inner = x - side * width / 2;
		parts.rod( WHEEL_STEEL(), [ inner, y0 + radius, z ], [ inner - side * 0.025, y0 + radius, z ], radius + 0.025, 18 );

	}

	parts.rod( STEEL(), [ - RAIL_X, y0 + radius, z ], [ RAIL_X, y0 + radius, z ], Math.min( 0.06, radius * 0.4 ), 10 );

}

// An operator's cab of [ width, height, length ], its base at y0 centred on (x, z): panels to sill
// height, glass above between corner posts, and a roof.
function cab( parts, material, [ w, h, l ], [ x, y0, z ], sill = 0.4 ) {

	const low = h * sill;
	parts.box( material, [ w, low, l ], [ x, y0, z ] );
	parts.box( GLASS(), [ w - 0.04, h - low - 0.1, l - 0.04 ], [ x, y0 + low, z ] );
	for ( const sx of [ - 1, 1 ] ) {

		for ( const sz of [ - 1, 1 ] ) parts.box( material, [ 0.08, h - low - 0.1, 0.08 ], [ x + sx * ( w / 2 - 0.035 ), y0 + low, z + sz * ( l / 2 - 0.035 ) ] );

	}

	parts.box( material, [ w + 0.08, 0.1, l + 0.08 ], [ x, y0 + h - 0.1, z ] );

}

// Handrail along a polyline of [ x, z ] points at deck height y.
function handrail( parts, material, points, y, height = 1.0 ) {

	parts.path( material, points.map( ( [ x, z ] ) => [ x, y + height, z ] ), 0.02, 6 );
	for ( const [ x, z ] of points ) parts.rod( material, [ x, y, z ], [ x, y + height, z ], 0.02, 6 );

}

// A sheet of plate as a polygon of [ z, y ] points `thick` across x, centred on x.
function plate( parts, material, points, thick, x ) {

	parts.prism( material, points, thick, x );

}

// The universal quick-attach plate on the back of a skid steer attachment: the plate standing
// across x, its bottom at y0 and its face at z (the attachment ahead of it, -Z), with the top lip
// the loader's arms hook under and the two wedge slots at the bottom.
function quickAttach( parts, material, [ y0, z ], width = 44 * IN ) {

	const high = 18 * IN;
	parts.box( material, [ width, high, 0.012 ], [ 0, y0, z ] );
	parts.block( material, [ width, 0.012, 0.07 ], [ 0, y0 + high, z + 0.03 ], [ - 30 * DEG, 0, 0 ] );
	for ( const x of [ - width / 2 + 0.03, width / 2 - 0.03 ] ) parts.box( material, [ 0.012, high, 0.08 ], [ x, y0, z + 0.04 ] );
	for ( const x of [ - 0.36, 0.36 ] ) parts.box( DARK(), [ 0.07, 0.05, 0.014 ], [ x, y0 + 0.03, z + 0.001 ] );

}

// A timber block (dunnage) lying across x.
function dunnage( parts, length, [ x, z ], size = [ 4 * IN, 4 * IN ] ) {

	parts.box( TIMBER(), [ length, size[ 1 ], size[ 0 ] ], [ x, 0, z ] );

}

// A geometry lofted through cross-sections: each { z, points: [ [ x, y ], ... ] } with the same
// number of points, counter-clockwise looking back along -Z, closed at both ends (convex ends).
function loft( sections ) {

	const v = [];
	const push = ( [ x, y ], z ) => v.push( x, y, z );
	for ( let i = 1; i < sections.length; i ++ ) {

		const a = sections[ i - 1 ];
		const b = sections[ i ];
		const n = a.points.length;
		for ( let j = 0; j < n; j ++ ) {

			const k = ( j + 1 ) % n;
			push( a.points[ j ], a.z ); push( a.points[ k ], a.z ); push( b.points[ k ], b.z );
			push( a.points[ j ], a.z ); push( b.points[ k ], b.z ); push( b.points[ j ], b.z );

		}

	}

	const first = sections[ 0 ];
	const last = sections[ sections.length - 1 ];
	for ( let j = 1; j < last.points.length - 1; j ++ ) {

		push( last.points[ 0 ], last.z ); push( last.points[ j ], last.z ); push( last.points[ j + 1 ], last.z );
		push( first.points[ 0 ], first.z ); push( first.points[ j + 1 ], first.z ); push( first.points[ j ], first.z );

	}

	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new BufferAttribute( new Float32Array( v ), 3 ) );
	geometry.setAttribute( 'uv', new BufferAttribute( new Float32Array( v.length / 3 * 2 ), 2 ) );
	geometry.computeVertexNormals();
	return geometry;

}

// --- hi-rail trucks --------------------------------------------------------------------------

// The guide wheel gear across the truck at z: a beam, two arms down from it and the flanged
// wheels at the rails' spacing, down on the ground.
function railGear( parts, z, frameY, radius, side = - 1 ) {

	const y0 = 0.025;
	parts.box( DARK(), [ RAIL_X * 2 + 0.25, 0.14, 0.14 ], [ 0, frameY, z ] );
	for ( const s of [ - 1, 1 ] ) {

		const x = s * RAIL_X;
		parts.block( YELLOW(), [ 0.08, frameY - radius - y0 + 0.08, 0.1 ], [ x - s * 0.12, ( frameY + radius + y0 ) / 2, z ], [ 0, 0, 0 ] );
		parts.rod( STEEL(), [ x - s * 0.12, radius + y0, z ], [ x, radius + y0, z ], 0.03, 8 );
		parts.rod( DARK(), [ x - s * 0.2, frameY + 0.07, z ], [ x - s * 0.2, frameY + 0.07, z - side * 0.35 ], 0.035, 10 );

	}

	railWheels( parts, z, radius, y0, 0.1 );

}

// A crew cab pickup's body: the side silhouette of the hood, cab and roof as one prism, glass on
// it, the grille, lamps and bumpers. Front bumper at z = front.
function pickupBody( parts, body, { front, width, cabBack, roof } ) {

	const bottom = 0.62;
	plate( parts, body, [
		[ front + 0.12, bottom ], [ front + 0.08, 1.18 ], [ front + 0.3, 1.27 ], [ front + 1.45, 1.33 ],
		[ front + 2.05, roof - 0.04 ], [ front + 2.25, roof ], [ cabBack - 0.08, roof ], [ cabBack, roof - 0.06 ], [ cabBack, bottom ],
	], width, 0 );

	// Windscreen, side and back glass, standing a little proud of the body.
	const screen = Math.atan2( roof - 0.04 - 1.33, 0.6 );
	parts.block( GLASS(), [ width - 0.16, Math.hypot( 0.6, roof - 1.37 ) - 0.06, 0.01 ], [ 0, ( 1.33 + roof - 0.04 ) / 2 + 0.005, front + 1.75 - 0.005 ], [ Math.PI / 2 - screen, 0, 0 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( GLASS(), [ 0.01, roof - 1.45 - 0.1, cabBack - front - 2.35 ], [ s * ( width / 2 + 0.004 ), 1.45, ( front + 2.2 + cabBack - 0.15 ) / 2 ] );
		parts.box( body, [ 0.012, roof - 1.45 - 0.1, 0.08 ], [ s * ( width / 2 + 0.008 ), 1.45, front + 2.2 + ( cabBack - front - 2.35 ) / 2 ] );
		// Door handles and the mirrors.
		for ( const dz of [ 0.85, 1.65 ] ) parts.box( DARK(), [ 0.012, 0.03, 0.14 ], [ s * ( width / 2 + 0.006 ), 1.3, front + dz + 1.0 ] );
		parts.box( DARK(), [ 0.2, 0.3, 0.06 ], [ s * ( width / 2 + 0.12 ), 1.38, front + 1.95 ] );

	}

	parts.box( GLASS(), [ width - 0.3, 0.38, 0.01 ], [ 0, roof - 0.5, cabBack + 0.003 ] );

	// Grille, headlamps and bumper.
	parts.box( BRIGHT(), [ width - 0.5, 0.42, 0.03 ], [ 0, 0.74, front + 0.07 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( LAMP(), [ 0.22, 0.13, 0.03 ], [ s * ( width / 2 - 0.15 ), 1.0, front + 0.085 ] );
	parts.box( DARK(), [ width, 0.24, 0.16 ], [ 0, 0.42, front + 0.08 ] );

	// Amber light bar across the roof.
	parts.box( DARK(), [ 1.2, 0.04, 0.22 ], [ 0, roof, front + 2.7 ] );
	parts.box( AMBER(), [ 1.15, 0.08, 0.18 ], [ 0, roof + 0.04, front + 2.7 ] );

}

// A 3/4 ton crew cab pickup with the 8 ft box (about 6.75 m long, 2.03 m over the body and 2.0 m
// high) on hi-rail gear: the guide wheel units ahead of the front bumper and behind the rear one,
// set down so the front tyres are just off the ground and the rear tyres, set in to ride the
// rails, drive.
function hiRailPickup() {

	const parts = new Parts();
	const body = paint( 0xeceeee );
	const width = 2.03;
	const front = - 3.38;
	const cabBack = front + 3.95;
	const back = 3.38;

	// Frame under it all.
	for ( const x of [ - 0.45, 0.45 ] ) parts.box( DARK(), [ 0.08, 0.2, back - front - 0.4 ], [ x, 0.5, ( front + back ) / 2 ] );

	// Wheels: front pair lifted 4 cm, rear pair set in to the rails' spacing.
	const r = 0.42;
	const frontAxle = front + 0.95;
	const rearAxle = frontAxle + 4.47;
	for ( const s of [ - 1, 1 ] ) {

		tyre( parts, r, 0.28, [ s * 0.85, r + 0.04, frontAxle ], BRIGHT() );
		tyre( parts, r, 0.28, [ s * ( RAIL_X + 0.02 ), r, rearAxle ], BRIGHT() );

	}

	pickupBody( parts, body, { front, width, cabBack, roof: 1.98 } );
	// Wheel wells as dark arches over the tyres.
	for ( const s of [ - 1, 1 ] ) for ( const z of [ frontAxle, rearAxle ] ) parts.box( BLACK(), [ 0.02, 0.2, 0.95 ], [ s * ( width / 2 + 0.004 ), 0.68, z ] );

	// The box: floor, sides, tailgate and rear bumper.
	const boxFront = cabBack + 0.08;
	const boxLength = back - 0.15 - boxFront;
	const floor = 0.95;
	const top = 1.38;
	parts.box( body, [ width, floor - 0.62, boxLength ], [ 0, 0.62, boxFront + boxLength / 2 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( body, [ 0.06, top - floor, boxLength ], [ s * ( width / 2 - 0.03 ), floor, boxFront + boxLength / 2 ] );
	parts.box( body, [ width, top - floor, 0.06 ], [ 0, floor, boxFront + 0.03 ] );
	parts.box( body, [ width, top - 0.62, 0.06 ], [ 0, 0.62, back - 0.18 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( RED_LAMP(), [ 0.08, 0.25, 0.02 ], [ s * ( width / 2 - 0.05 ), 1.05, back - 0.145 ] );
	parts.box( DARK(), [ width, 0.2, 0.14 ], [ 0, 0.42, back - 0.07 ] );
	// A toolbox across the front of the box.
	parts.box( BRIGHT(), [ width - 0.14, 0.42, 0.5 ], [ 0, top - 0.02, boxFront + 0.32 ] );

	// Guide wheels ahead of the front bumper and behind the rear one.
	railGear( parts, front - 0.12, 0.42, 0.13, - 1 );
	railGear( parts, back + 0.08, 0.42, 0.13, 1 );

	return parts.build();

}

// A Class 7 conventional cab truck with a 16 ft flatbed and a knuckle boom crane folded behind the
// cab (about 9.4 m long over the guide wheels, 2.44 m wide and 2.9 m high), on hi-rail gear with
// the rear duals riding the rails.
function hiRailTruck() {

	const parts = new Parts();
	const body = paint( 0xe6e7e4 );
	const orange = paint( 0xe0631b );
	const width = 2.44;
	const front = - 4.55;
	const deck0 = - 0.6;
	const deck1 = 4.3;
	const deckY = 1.15;

	// Frame, front axle and the rear duals.
	for ( const x of [ - 0.45, 0.45 ] ) parts.box( DARK(), [ 0.1, 0.28, deck1 - front - 0.3 ], [ x, 0.78, ( front + deck1 ) / 2 ] );
	const r = 0.5;
	for ( const s of [ - 1, 1 ] ) {

		tyre( parts, r, 0.28, [ s * 0.98, r + 0.04, - 3.7 ], BRIGHT() );
		for ( const d of [ - 1, 1 ] ) tyre( parts, r, 0.26, [ s * ( RAIL_X + 0.14 ) + d * 0.145, r, 2.05 ], BRIGHT() );

	}

	// Hood with its fenders, then the cab.
	plate( parts, body, [ [ front + 0.15, 0.85 ], [ front + 0.15, 1.6 ], [ front + 0.3, 1.72 ], [ front + 1.65, 1.82 ], [ front + 1.65, 0.85 ] ], 1.4, 0 );
	for ( const s of [ - 1, 1 ] ) {

		plate( parts, body, [ [ front + 0.25, 1.0 ], [ front + 0.35, 1.18 ], [ front + 1.5, 1.18 ], [ front + 1.65, 1.0 ] ], 0.5, s * 0.97 );

	}

	parts.box( BRIGHT(), [ 1.2, 0.68, 0.04 ], [ 0, 0.92, front + 0.15 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( LAMP(), [ 0.2, 0.12, 0.03 ], [ s * 0.97, 1.05, front + 0.26 ] );
	parts.box( DARK(), [ width - 0.1, 0.3, 0.2 ], [ 0, 0.5, front + 0.1 ] );
	const cab0 = front + 1.6;
	const cab1 = cab0 + 1.95;
	plate( parts, body, [ [ cab0, 0.95 ], [ cab0, 1.85 ], [ cab0 + 0.35, 2.68 ], [ cab0 + 0.5, 2.74 ], [ cab1, 2.74 ], [ cab1, 0.95 ] ], 2.3, 0 );
	const screen = Math.atan2( 0.75, 0.33 );
	parts.block( GLASS(), [ 2.1, 0.78, 0.01 ], [ 0, 2.28, cab0 + 0.17 - 0.006 ], [ Math.PI / 2 - screen, 0, 0 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( GLASS(), [ 0.01, 0.6, 1.1 ], [ s * 1.154, 1.95, cab0 + 0.95 ] );
		parts.box( DARK(), [ 0.04, 0.38, 0.22 ], [ s * 1.3, 1.95, cab0 + 0.2 ] );
		// Steps and a fuel tank under the door.
		parts.box( DARK(), [ 0.3, 0.05, 0.5 ], [ s * 1.0, 0.55, cab0 + 0.8 ] );
		parts.rod( BRIGHT(), [ s * 0.72, 0.85, cab1 + 0.1 ], [ s * 0.72, 0.85, cab1 + 1.0 ], 0.25, 16 );

	}

	parts.box( DARK(), [ 1.2, 0.04, 0.24 ], [ 0, 2.74, cab0 + 0.5 ] );
	parts.box( AMBER(), [ 1.15, 0.08, 0.2 ], [ 0, 2.78, cab0 + 0.5 ] );

	// The flatbed with a headache rack, stake pockets and tail lamps.
	parts.box( WHEEL_STEEL(), [ width, 0.15, deck1 - deck0 ], [ 0, deckY, ( deck0 + deck1 ) / 2 ] );
	parts.box( mat( 0x6a5038, { roughness: 0.9 } ), [ width - 0.1, 0.01, deck1 - deck0 - 0.1 ], [ 0, deckY + 0.15, ( deck0 + deck1 ) / 2 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( body, [ 0.08, 1.15, 0.08 ], [ s * ( width / 2 - 0.08 ), deckY + 0.15, deck0 + 0.06 ] );
		parts.box( RED_LAMP(), [ 0.12, 0.08, 0.02 ], [ s * ( width / 2 - 0.12 ), deckY + 0.02, deck1 + 0.01 ] );

	}

	parts.box( body, [ width - 0.1, 0.08, 0.08 ], [ 0, deckY + 1.22, deck0 + 0.06 ] );
	for ( let i = 1; i < 6; i ++ ) parts.box( body, [ 0.04, 1.1, 0.04 ], [ - width / 2 + 0.08 + i * ( width - 0.16 ) / 6, deckY + 0.15, deck0 + 0.06 ] );

	// Knuckle boom crane on the deck behind the rack: base, outriggers folded up, a turning column
	// and the two booms folded back over the deck.
	const craneZ = 0.35;
	const top = deckY + 0.15;
	parts.box( orange, [ 0.9, 0.35, 0.7 ], [ 0, top, craneZ ] );
	for ( const s of [ - 1, 1 ] ) parts.box( orange, [ 0.18, 0.7, 0.18 ], [ s * ( width / 2 - 0.15 ), top - 0.25, craneZ ] );
	parts.box( orange, [ width - 0.1, 0.18, 0.2 ], [ 0, top + 0.05, craneZ ] );
	parts.cylinder( orange, 0.24, 0.9, [ 0, top + 0.35, craneZ ], 14 );
	const pivot = [ 0, top + 1.2, craneZ ];
	parts.box( orange, [ 0.3, 0.32, 3.1 ], [ 0, pivot[ 1 ], craneZ + 1.4 ] );
	parts.box( orange, [ 0.24, 0.26, 2.6 ], [ 0, pivot[ 1 ] - 0.34, craneZ + 1.6 ] );
	parts.rod( DARK(), [ 0.22, top + 0.55, craneZ + 0.25 ], [ 0.22, pivot[ 1 ] + 0.1, craneZ + 1.6 ], 0.06, 10 );
	parts.rod( BRIGHT(), [ 0, pivot[ 1 ] - 0.42, craneZ + 2.85 ], [ 0, deckY + 0.3, craneZ + 2.95 ], 0.04, 8 );
	parts.box( DARK(), [ 0.1, 0.25, 0.1 ], [ 0, deckY + 0.15, craneZ + 2.95 ] );

	// Guide wheels.
	railGear( parts, front - 0.2, 0.6, 0.2, - 1 );
	railGear( parts, deck1 + 0.25, 0.75, 0.2, 1 );

	return parts.build();

}

// --- ballast regulator -----------------------------------------------------------------------

// A ballast regulator of the common class (about 10.4 m long, 3.0 m wide with its wings in, 4.8 m
// with them out, and 3.2 m above the rail) on a 39 ft panel: the engine at the front, the cab in
// the middle, the reversible centre plow between the axles, a wing plow out at each front corner
// shaping the shoulders, and the broom with its cross conveyor at the back.
function ballastRegulator() {

	const parts = new Parts();
	trackParts( parts, PANEL, TIES_PER_PANEL );
	const y0 = RAIL_TOP;
	const tieTop = BALLAST_UNDER + TIE[ 1 ];
	const yellow = YELLOW();
	const front = - 5.2;
	const back = 5.2;

	// Axles and the main frame over them.
	const r = 0.33;
	railWheels( parts, - 2.9, r );
	railWheels( parts, 2.9, r );
	for ( const z of [ - 2.9, 2.9 ] ) for ( const s of [ - 1, 1 ] ) parts.box( DARK(), [ 0.2, 0.5, 0.75 ], [ s * ( RAIL_X + 0.17 ), y0 + 0.15, z ] );
	const frameY = y0 + 0.6;
	const frameBack = back - 1.5;
	parts.box( yellow, [ 2.7, 0.45, frameBack - front ], [ 0, frameY, ( front + frameBack ) / 2 ] );
	parts.box( BLACK(), [ 2.72, 0.06, frameBack - front + 0.02 ], [ 0, frameY + 0.08, ( front + frameBack ) / 2 ] );
	const deck = frameY + 0.45;

	// Engine housing at the front, with its grille and stack.
	parts.box( yellow, [ 2.2, 1.25, 2.7 ], [ 0, deck, front + 1.5 ] );
	parts.box( DARK(), [ 1.6, 0.8, 0.03 ], [ 0, deck + 0.25, front + 0.14 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( LAMP(), [ 0.2, 0.15, 0.04 ], [ s * 0.85, deck + 1.0, front + 0.13 ] );
	parts.cylinder( DARK(), 0.07, 0.75, [ 0.7, deck + 1.25, front + 2.3 ], 10 );

	// The cab, glazed all round, with a beacon; a walkway with handrails round it.
	cab( parts, yellow, [ 2.6, 2.0, 2.5 ], [ 0, deck, - 0.6 ], 0.35 );
	parts.cylinder( AMBER(), 0.09, 0.16, [ 0, deck + 2.0, - 0.6 ], 12 );
	for ( const s of [ - 1, 1 ] ) {

		handrail( parts, yellow, [ [ s * 1.32, front + 2.9 ], [ s * 1.32, back - 1.9 ] ], deck, 0.9 );
		parts.box( DARK(), [ 0.5, 0.04, 0.3 ], [ s * 1.25, y0 + 0.25, - 1.9 ] );

	}

	// Hydraulic tank and cabinets behind the cab.
	parts.box( yellow, [ 2.3, 1.1, 1.6 ], [ 0, deck, 1.6 ] );

	// Centre plow between the axles: a blade each side of each rail and between the rails, its
	// bottom just above the ties, on a frame from the main frame.
	const plowY = tieTop + 0.03;
	const plowH = frameY - plowY;
	for ( const [ x0, x1 ] of [ [ - 1.45, - RAIL_X - 0.12 ], [ - RAIL_X + 0.12, RAIL_X - 0.12 ], [ RAIL_X + 0.12, 1.45 ] ] ) {

		parts.block( yellow, [ x1 - x0, plowH, 0.04 ], [ ( x0 + x1 ) / 2, plowY + plowH / 2, 1.1 ], [ 0.25, 0, 0 ] );

	}

	parts.box( yellow, [ 2.9, 0.08, 0.3 ], [ 0, frameY - 0.08, 1.1 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( yellow, [ 0.08, plowH, 0.5 ], [ s * 1.45, plowY, 1.1 ] );

	// Wing plows, swung out at each front corner: a blade angled out and back, its foot on the
	// ballast shoulder, on an arm and a ram from the frame.
	for ( const s of [ - 1, 1 ] ) {

		const inner = [ s * 1.25, front + 1.6 ];
		const outer = [ s * 2.4, front + 2.9 ];
		const mid = [ ( inner[ 0 ] + outer[ 0 ] ) / 2, ( inner[ 1 ] + outer[ 1 ] ) / 2 ];
		const len = Math.hypot( outer[ 0 ] - inner[ 0 ], outer[ 1 ] - inner[ 1 ] );
		const yaw = Math.atan2( outer[ 0 ] - inner[ 0 ], outer[ 1 ] - inner[ 1 ] );
		parts.block( yellow, [ 0.04, 0.85, len ], [ mid[ 0 ], 0.62, mid[ 1 ] ], [ 0, yaw, 0 ] );
		parts.block( DARK(), [ 0.05, 0.08, len ], [ mid[ 0 ], 0.24, mid[ 1 ] ], [ 0, yaw, 0 ] );
		parts.rod( yellow, [ s * 1.3, frameY + 0.2, front + 2.2 ], [ mid[ 0 ] - s * 0.05, 0.9, mid[ 1 ] ], 0.07, 8 );
		parts.rod( DARK(), [ s * 1.3, frameY + 0.3, front + 3.2 ], [ outer[ 0 ] - s * 0.1, 0.9, outer[ 1 ] - 0.1 ], 0.05, 8 );

	}

	// Broom behind the frame: the core with its bristles turning across the ties, the hood over it
	// hung off the frame's end, and the cross conveyor on top carrying the swept ballast out to the
	// right, with the tail lamps on the hood's back.
	const broomZ = ( frameBack + back ) / 2 + 0.05;
	const br = 0.42;
	const hoodTop = frameY + 0.4;
	parts.rod( mat( 0x3a3328, { roughness: 1 } ), [ - 1.3, tieTop + br + 0.02, broomZ ], [ 1.3, tieTop + br + 0.02, broomZ ], br, 18 );
	plate( parts, yellow, [ [ frameBack, tieTop + br + 0.1 ], [ frameBack, hoodTop ], [ back, hoodTop ], [ back, y0 + 0.1 ], [ back - 0.35, y0 + 0.08 ], [ broomZ, tieTop + 2 * br + 0.06 ], [ frameBack + 0.25, tieTop + br + 0.25 ] ], 2.9, 0 );
	parts.box( DARK(), [ 3.6, 0.12, 0.42 ], [ 0.55, hoodTop, broomZ ] );
	parts.box( yellow, [ 0.06, 0.2, 0.45 ], [ 2.35, hoodTop, broomZ ] );
	for ( const s of [ - 1, 1 ] ) parts.box( RED_LAMP(), [ 0.15, 0.15, 0.03 ], [ s * 1.1, hoodTop - 0.3, back + 0.01 ] );

	return parts.build();

}

// --- production tamper -----------------------------------------------------------------------

// A production tamper of the 16-tool class (about 18.3 m / 60 ft from the buggy to the back,
// 3.0 m wide and 3.5 m above the rail) on two panels: the lining buggy out front on its tow bar,
// the travel cab, the engine house, the lifting and lining unit, and a tamping workhead over each
// rail with its eight tines down in the cribs, under the rear work cab.
function productionTamper() {

	const parts = new Parts();
	trackParts( parts, PANEL * 2, TIES_PER_PANEL * 2 );
	const y0 = RAIL_TOP;
	const tieTop = BALLAST_UNDER + TIE[ 1 ];
	const yellow = YELLOW();
	const front = - 5.6;
	const back = 9.3;

	// Axles and the main frame.
	const r = 0.36;
	railWheels( parts, front + 1.4, r );
	railWheels( parts, back - 1.2, r );
	for ( const z of [ front + 1.4, back - 1.2 ] ) for ( const s of [ - 1, 1 ] ) parts.box( DARK(), [ 0.22, 0.55, 0.85 ], [ s * ( RAIL_X + 0.18 ), y0 + 0.15, z ] );
	// The frame is open over the workheads, with only its side beams running past them.
	const frameY = y0 + 0.75;
	const headZ = 5.0;
	const gap = [ headZ - 1.2, headZ + 1.2 ];
	parts.box( yellow, [ 2.8, 0.5, gap[ 0 ] - front ], [ 0, frameY, ( front + gap[ 0 ] ) / 2 ] );
	parts.box( yellow, [ 2.8, 0.5, back - gap[ 1 ] ], [ 0, frameY, ( gap[ 1 ] + back ) / 2 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( yellow, [ 0.25, 0.5, gap[ 1 ] - gap[ 0 ] ], [ s * 1.275, frameY, headZ ] );
		parts.box( mat( 0xc8102e, { roughness: 0.5 } ), [ 0.02, 0.08, back - front ], [ s * 1.405, frameY + 0.12, ( front + back ) / 2 ] );

	}

	const deck = frameY + 0.5;

	// Front travel cab and the engine house behind it.
	cab( parts, yellow, [ 2.8, 2.15, 2.0 ], [ 0, deck, front + 1.0 ], 0.38 );
	for ( const s of [ - 1, 1 ] ) parts.box( LAMP(), [ 0.2, 0.14, 0.04 ], [ s * 1.0, deck + 0.4, front - 0.02 ] );
	parts.cylinder( AMBER(), 0.09, 0.16, [ - 0.8, deck + 2.15, front + 1.0 ], 12 );
	parts.box( yellow, [ 2.5, 1.8, 4.6 ], [ 0, deck, front + 4.4 ] );
	for ( const s of [ - 1, 1 ] ) for ( let i = 0; i < 8; i ++ ) parts.box( DARK(), [ 0.02, 1.0, 0.05 ], [ s * 1.255, deck + 0.5, front + 2.6 + i * 0.13 ] );
	parts.cylinder( DARK(), 0.08, 0.5, [ 0.8, deck + 1.8, front + 5.6 ], 10 );
	// Hydraulic tank and the generator housing.
	parts.box( yellow, [ 2.3, 1.3, 2.3 ], [ 0, deck, front + 8.2 ] );
	for ( const s of [ - 1, 1 ] ) handrail( parts, yellow, [ [ s * 1.35, front + 2.2 ], [ s * 1.35, front + 9.6 ] ], deck, 0.9 );

	// Lifting and lining unit: a beam across under the frame with rail clamp rollers each side
	// of each rail head, and its rams up to the frame.
	const liftZ = 3.4;
	parts.box( DARK(), [ 2.2, 0.2, 0.3 ], [ 0, y0 + 0.2, liftZ ] );
	for ( const s of [ - 1, 1 ] ) {

		for ( const d of [ - 1, 1 ] ) parts.cylinder( STEEL(), 0.07, 0.08, [ s * RAIL_X + d * 0.11, y0 - 0.09, liftZ ], 12 );
		parts.rod( DARK(), [ s * 0.8, y0 + 0.4, liftZ ], [ s * 0.8, frameY, liftZ - 0.3 ], 0.06, 10 );

	}

	// The workheads, one over each rail: a housing hanging from guide columns, and eight tines,
	// two pairs each side of the rail, reaching down into the cribs either side of a tie.
	const tieUnder = Math.round( ( headZ + PANEL ) / TIE_PITCH - 0.5 ) * TIE_PITCH + TIE_PITCH / 2 - PANEL;
	for ( const s of [ - 1, 1 ] ) {

		const x = s * RAIL_X;
		parts.box( yellow, [ 0.75, 0.7, 1.0 ], [ x, y0 + 0.2, tieUnder ] );
		parts.box( DARK(), [ 0.6, 0.25, 0.6 ], [ x, y0 + 0.9, tieUnder ] );
		for ( const d of [ - 1, 1 ] ) parts.rod( BRIGHT(), [ x + d * 0.25, y0 + 0.9, tieUnder ], [ x + d * 0.25, deck + 0.9, tieUnder ], 0.04, 8 );
		parts.box( yellow, [ 0.7, 0.12, 0.2 ], [ x, deck + 0.9, tieUnder ] );
		for ( const dx of [ - 0.24, - 0.1, 0.1, 0.24 ] ) {

			for ( const dz of [ - 1, 1 ] ) {

				const z = tieUnder + dz * ( TIE[ 2 ] / 2 + 0.07 );
				parts.rod( STEEL(), [ x + dx, y0 + 0.3, tieUnder + dz * 0.32 ], [ x + dx, tieTop - 0.05, z ], 0.025, 6 );
				parts.box( STEEL(), [ 0.07, 0.12, 0.03 ], [ x + dx, tieTop - 0.15, z ] );

			}

		}

	}

	// Rear work cab looking back over the workheads, and its steps.
	cab( parts, yellow, [ 2.8, 2.1, 2.6 ], [ 0, deck, back - 1.3 ], 0.35 );
	parts.cylinder( AMBER(), 0.09, 0.16, [ 0.8, deck + 2.1, back - 1.3 ], 12 );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( RED_LAMP(), [ 0.16, 0.16, 0.03 ], [ s * 1.1, deck + 0.4, back + 0.02 ] );
		parts.box( DARK(), [ 0.5, 0.04, 0.3 ], [ s * 1.25, y0 + 0.3, back - 3.0 ] );

	}

	// Lining buggy out front: a small frame on two axles with a seat and the laser receiver mast,
	// on a tow bar, with the lining chord running back to the machine.
	const buggy = front - 3.2;
	railWheels( parts, buggy - 0.75, 0.2 );
	railWheels( parts, buggy + 0.75, 0.2 );
	parts.box( yellow, [ 1.9, 0.15, 2.1 ], [ 0, y0 + 0.4, buggy ] );
	parts.box( DARK(), [ 0.5, 0.1, 0.45 ], [ 0, y0 + 0.75, buggy + 0.4 ] );
	parts.box( DARK(), [ 0.5, 0.5, 0.08 ], [ 0, y0 + 0.75, buggy + 0.62 ] );
	parts.box( yellow, [ 0.08, 0.3, 0.08 ], [ 0, y0 + 0.55, buggy + 0.4 ] );
	parts.rod( STEEL(), [ 0, y0 + 0.55, buggy - 0.6 ], [ 0, y0 + 2.4, buggy - 0.6 ], 0.03, 8 );
	parts.box( DARK(), [ 0.14, 0.3, 0.14 ], [ 0, y0 + 2.4, buggy - 0.6 ] );
	parts.box( DARK(), [ 0.1, 0.1, front - buggy - 1.0 ], [ 0, y0 + 0.45, ( front + buggy + 1.0 ) / 2 ] );
	for ( const s of [ - 1, 1 ] ) parts.rod( mat( 0x111111 ), [ s * 0.6, y0 + 0.6, buggy - 0.9 ], [ s * 0.6, y0 + 0.6, front ], 0.004, 4 );

	return parts.build();

}

// --- turnout ---------------------------------------------------------------------------------

// A No. 10 right-hand turnout in 136 lb rail: 3 m of stock rail, the switch points, the curved
// closure rails, the frog with its guard rails, and the track past the frog until the two routes
// are about 2.4 m apart, all on long switch ties on ballast (about 39 m / 128 ft long, 7 m wide at
// the end). Ties, plates, rails and ballast match the 39 ft panel, so panels butt on to either end
// of the straight route; the diverging route leaves at the frog's 1 in 10 (5.7°). Points to the
// front (-Z), diverging to the right.
function turnout() {

	const parts = new Parts();
	const ballast = mat( 0x807c75, { roughness: 1 } );
	const tie = mat( 0x3d3129, { roughness: 0.95 } );
	const plateMat = mat( 0x3a3633, { roughness: 0.7, metalness: 0.4 } );
	const rail = mat( 0x5f5048, { roughness: 0.75, metalness: 0.35 } );
	const head = mat( 0xb8bbbd, { roughness: 0.3, metalness: 0.7 } );
	const manganese = mat( 0x55504a, { roughness: 0.6, metalness: 0.45 } );

	const count = 79;
	const length = TIE_PITCH * count;
	const z0 = - length / 2;
	const lead = 3.0; // stock rail ahead of the points
	const sEnd = length - lead;
	const zOf = s => z0 + lead + s;

	// The diverging route's centre line, `s` metres past the points: a 237 m (778 ft) curve to the
	// frog angle, then straight.
	const R = 237;
	const slope = 0.1;
	const sT = R * Math.sin( Math.atan( slope ) );
	const xT = R - Math.sqrt( R * R - sT * sT );
	const centre = s => s <= 0 ? 0 : s <= sT ? R - Math.sqrt( R * R - s * s ) : xT + ( s - sT ) * slope;
	const sFrog = sT + ( 2 * RAIL_X - xT ) / slope;
	// The switch points lie in against the stock rails at their tips, over the first 6 m.
	const taper = s => RAIL_HEAD * Math.max( 0, 1 - s / 6 );

	// Ballast: as the panel's, its right shoulder following the diverging track, and wider on
	// the left where the switch stand's head block ties reach out.
	const under = BALLAST_UNDER;
	const top = under + TIE[ 1 ] - 1 * IN;
	const halfTop = TIE[ 0 ] / 2 + 12 * IN;
	const sections = [];
	const stations = [ - lead, - 0.9, - 0.6, 1.2, 1.5 ];
	for ( let s = 0; s <= sEnd; s += 1.5 ) stations.push( s );
	stations.push( sEnd );
	const sorted = [ ...new Set( stations.map( s => Math.round( s * 1000 ) / 1000 ) ) ].sort( ( a, b ) => a - b );
	for ( const s of sorted ) {

		const left = halfTop + ( s > - 0.75 && s < 1.35 ? 0.9 : 0 );
		const right = Math.max( halfTop, centre( s ) + halfTop );
		sections.push( { z: zOf( s ), points: [ [ - left - 1.5 * top, 0 ], [ right + 1.5 * top, 0 ], [ right, top ], [ - left, top ] ] } );

	}

	parts.add( ballast, loft( sections ) );

	// Ties square to the straight route, long enough for both routes, with plates under each rail
	// (one long plate where two rails come close).
	const tieTop = under + TIE[ 1 ];
	const railsAt = s => {

		const xs = [ - RAIL_X, s <= 0 ? RAIL_X : centre( s ) + RAIL_X ];
		if ( s >= 0 ) xs.push( RAIL_X - taper( s ), centre( s ) - RAIL_X + taper( s ) );
		return xs.sort( ( a, b ) => a - b );

	};

	for ( let i = 0; i < count; i ++ ) {

		const z = z0 + TIE_PITCH * ( i + 0.5 );
		const s = z - z0 - lead;
		const headBlock = s > - 0.6 && s < 1.2;
		const left = - TIE[ 0 ] / 2 - ( headBlock ? 0.9 : 0 );
		const right = Math.max( TIE[ 0 ] / 2, centre( s ) + TIE[ 0 ] / 2 );
		parts.box( tie, [ right - left, TIE[ 1 ], TIE[ 2 ] ], [ ( left + right ) / 2, under, z ] );

		const xs = railsAt( s );
		let start = xs[ 0 ];
		let end = xs[ 0 ];
		for ( let j = 1; j <= xs.length; j ++ ) {

			if ( j < xs.length && xs[ j ] - end < PLATE[ 0 ] ) {

				end = xs[ j ];
				continue;

			}

			parts.box( plateMat, [ end - start + PLATE[ 0 ], PLATE[ 1 ], PLATE[ 2 ] ], [ ( start + end ) / 2, tieTop, z ] );
			if ( j < xs.length ) start = end = xs[ j ];

		}

	}

	// Rails: straight pieces where they're straight, 1.5 m pieces round the curves.
	const railBase = tieTop + PLATE[ 1 ];
	const profile = RAIL_PROFILE.map( ( [ x, y ] ) => [ x * IN, y * IN ] );
	const piece = ( a, b ) => {

		const dx = b[ 0 ] - a[ 0 ];
		const dz = b[ 1 ] - a[ 1 ];
		const len = Math.hypot( dx, dz );
		_r.makeRotationY( Math.atan2( dx, dz ) ).setPosition( ( a[ 0 ] + b[ 0 ] ) / 2, railBase, ( a[ 1 ] + b[ 1 ] ) / 2 );
		parts.add( rail, extruded( profile, len + 0.01 ), _r );
		parts.add( head, extruded( [ [ - 1.1 * IN, 7.31 * IN - 0.002 ], [ 1.1 * IN, 7.31 * IN - 0.002 ], [ 1.1 * IN, 7.31 * IN + 0.002 ], [ - 1.1 * IN, 7.31 * IN + 0.002 ] ], len + 0.01 ), _r );

	};

	const along = ( x, s0, s1, step = 1.5 ) => {

		const n = Math.max( 1, Math.ceil( ( s1 - s0 ) / step ) );
		for ( let i = 0; i < n; i ++ ) {

			const a = s0 + ( s1 - s0 ) * i / n;
			const b = s0 + ( s1 - s0 ) * ( i + 1 ) / n;
			piece( [ x( a ), zOf( a ) ], [ x( b ), zOf( b ) ] );

		}

	};

	// Left stock rail, straight through; right stock rail, bending away on the diverging route.
	piece( [ - RAIL_X, zOf( - lead ) ], [ - RAIL_X, zOf( sEnd ) ] );
	piece( [ RAIL_X, zOf( - lead ) ], [ RAIL_X, zOf( 0 ) ] );
	along( s => centre( s ) + RAIL_X, 0, sT );
	piece( [ centre( sT ) + RAIL_X, zOf( sT ) ], [ centre( sEnd ) + RAIL_X, zOf( sEnd ) ] );
	// Straight switch point and closure rail on the right, through the frog; curved switch point
	// and closure rail from the left, crossing it at the frog.
	along( s => RAIL_X - taper( s ), 0, 6 );
	piece( [ RAIL_X, zOf( 6 ) ], [ RAIL_X, zOf( sEnd ) ] );
	along( s => centre( s ) - RAIL_X + taper( s ), 0, sT );
	piece( [ centre( sT ) - RAIL_X, zOf( sT ) ], [ centre( sEnd ) - RAIL_X, zOf( sEnd ) ] );

	// The frog: a manganese casting where the two rails cross, 5 m long, a little below the heads.
	const toe = sFrog - 1.8;
	const heel = sFrog + 3.2;
	const mid = ( toe + heel ) / 2;
	parts.block( manganese, [ 0.5, 6.9 * IN, heel - toe ], [ centre( mid ) / 2, railBase + 3.45 * IN, zOf( mid ) ], [ 0, Math.atan( slope / 2 ), 0 ] );
	parts.block( manganese, [ 0.62, 0.03, heel - toe + 0.2 ], [ centre( mid ) / 2, railBase + 0.015, zOf( mid ) ], [ 0, Math.atan( slope / 2 ), 0 ] );

	// Guard rails opposite the frog, inside the left stock rail and inside the diverging outer rail.
	const guard = [ 0.07, 6.6 * IN, 4.2 ];
	const gap = RAIL_HEAD / 2 + 1.875 * IN + guard[ 0 ] / 2;
	parts.box( rail, guard, [ - RAIL_X + gap, railBase, zOf( sFrog ) ] );
	parts.block( rail, guard, [ centre( sFrog ) + RAIL_X - gap, railBase + guard[ 1 ] / 2, zOf( sFrog ) ], [ 0, Math.atan( slope ), 0 ] );

	// Head rod between the switch points, and the switch stand out on the head block ties with
	// its target and throw lever, linked to the points.
	const rodZ = zOf( 0.35 );
	const rodY = tieTop + 0.06;
	parts.box( STEEL(), [ 2 * RAIL_X + 0.1, 0.04, 0.08 ], [ 0.03, rodY, rodZ ] );
	const standX = - TIE[ 0 ] / 2 - 0.45;
	parts.box( STEEL(), [ standX + RAIL_X - 0.05, 0.03, 0.06 ], [ ( standX - RAIL_X ) / 2, rodY + 0.01, rodZ ] );
	parts.box( DARK(), [ 0.4, 0.45, 0.35 ], [ standX - 0.05, tieTop, rodZ ] );
	parts.rod( DARK(), [ standX - 0.05, tieTop + 0.45, rodZ ], [ standX - 0.05, tieTop + 1.5, rodZ ], 0.03, 8 );
	parts.rod( mat( 0xc8102e, { roughness: 0.5 } ), [ standX - 0.05, tieTop + 1.3, rodZ - 0.01 ], [ standX - 0.05, tieTop + 1.3, rodZ + 0.01 ], 0.2, 20 );
	parts.rod( YELLOW(), [ standX - 0.05, tieTop + 0.42, rodZ ], [ standX - 0.6, tieTop + 0.5, rodZ + 0.3 ], 0.025, 6 );

	return parts.build();

}

// --- bumping post and derail -----------------------------------------------------------------

// A welded steel bumping post of the common bolt-on type at the far end of 19.5 ft of track (12
// ties, as the panel's), its buffer face to the front at coupler height (34.5 in above the rail):
// a post up from each rail, braces back to the rails, the head beam across with a timber buffer
// block, and the red end of track reflector.
function bumpingPost() {

	const parts = new Parts();
	const stub = TIE_PITCH * 12;
	trackParts( parts, stub, 12 );
	const y0 = RAIL_TOP;
	const yellow = YELLOW();
	const face = - 0.2;
	const coupler = y0 + 34.5 * IN;
	const brace = stub / 2 - 0.3;

	for ( const s of [ - 1, 1 ] ) {

		const x = s * RAIL_X;
		// Clamp shoes along the rail head, the post and the brace.
		parts.box( DARK(), [ 0.2, 0.08, brace - face + 0.2 ], [ x, y0 - 0.02, ( face + brace ) / 2 ] );
		parts.box( yellow, [ 0.2, coupler + 0.2 - y0, 0.2 ], [ x, y0 + 0.06, face + 0.15 ] );
		parts.rod( yellow, [ x, coupler, face + 0.25 ], [ x, y0 + 0.1, brace ], 0.08, 4 );
		parts.rod( yellow, [ x, y0 + 0.35, face + 0.25 ], [ x, y0 + 0.1, brace - 0.4 ], 0.05, 4 );

	}

	// Head beam, buffer block and cross ties between the braces.
	parts.box( yellow, [ 2 * RAIL_X + 0.4, 0.4, 0.3 ], [ 0, coupler - 0.2, face + 0.15 ] );
	parts.box( TIMBER(), [ 0.9, 0.35, 0.18 ], [ 0, coupler - 0.175, face - 0.08 ] );
	parts.box( yellow, [ 2 * RAIL_X, 0.12, 0.12 ], [ 0, y0 + 0.35, face + 1.0 ] );
	parts.box( mat( 0xd01818, { roughness: 0.3, emissive: 0x400000 } ), [ 0.35, 0.35, 0.02 ], [ 0, coupler + 0.05, face - 0.005 ] );

	return parts.build();

}

// A hinged derail on the right rail of 13 ft of track (8 ties, as the panel's): the yellow derail
// block lying over the rail head, set to derail, with its throw stand off the end of the ties
// and the yellow DERAIL sign on its post beside it.
function derail() {

	const parts = new Parts();
	const stub = TIE_PITCH * 8;
	trackParts( parts, stub, 8 );
	const y0 = RAIL_TOP;
	const tieTop = BALLAST_UNDER + TIE[ 1 ];
	const yellow = YELLOW();
	const z = - 0.2;

	// The block on the rail and its hinge plate on the ties outside it, its shoe up over the head.
	parts.box( DARK(), [ 0.45, 0.04, 0.4 ], [ RAIL_X + 0.32, tieTop, z ] );
	parts.box( yellow, [ 0.35, 0.12, 0.45 ], [ RAIL_X + 0.03, y0, z ] );
	parts.block( yellow, [ 0.2, 0.18, 0.4 ], [ RAIL_X + 0.15, y0 + 0.02, z ], [ 0, 0, 0.6 ] );
	parts.box( yellow, [ 0.08, y0 - tieTop, 0.4 ], [ RAIL_X + 0.21, tieTop, z ] );

	// Connecting rod out to the throw stand past the tie ends.
	const standX = TIE[ 0 ] / 2 + 0.5;
	parts.box( STEEL(), [ standX - RAIL_X - 0.2, 0.03, 0.05 ], [ ( standX + RAIL_X + 0.2 ) / 2, tieTop + 0.03, z ] );
	parts.box( DARK(), [ 0.35, 0.4, 0.3 ], [ standX, tieTop - 0.15, z ] );
	parts.rod( yellow, [ standX, tieTop + 0.25, z ], [ standX + 0.45, tieTop + 0.35, z + 0.3 ], 0.025, 6 );
	parts.rod( DARK(), [ standX, tieTop + 0.25, z ], [ standX, tieTop + 1.0, z ], 0.025, 6 );
	parts.rod( mat( 0xd8b000, { roughness: 0.4 } ), [ standX, tieTop + 0.9, z - 0.01 ], [ standX, tieTop + 0.9, z + 0.01 ], 0.15, 18 );

	// The DERAIL sign on its post, facing the way trains come (-Z), on the ballast shoulder.
	const signX = TIE[ 0 ] / 2 + 0.35;
	const signZ = z - 1.0;
	parts.box( mat( 0xa9adb0, { roughness: 0.45, metalness: 0.65 } ), [ 0.06, 1.75, 0.06 ], [ signX, 0.35, signZ ] );
	const sign = drawn( 'derail sign', [ 512, 160 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#f2c500';
		ctx.fillRect( 0, 0, w, h );
		ctx.strokeStyle = '#111';
		ctx.lineWidth = 10;
		ctx.strokeRect( 8, 8, w - 16, h - 16 );
		ctx.fillStyle = '#111';
		ctx.font = 'bold 110px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText( 'DERAIL', w / 2, h / 2 + 6, w * 0.88 );

	} );
	parts.add( sign, planeGeometry( 0.75, 0.24 ), _m.makeRotationY( Math.PI ).setPosition( signX, 1.95, signZ - 0.035 ) );
	parts.box( mat( 0xa7abae, { roughness: 0.45, metalness: 0.5 } ), [ 0.75, 0.24, 0.005 ], [ signX, 1.83, signZ - 0.03 ] );

	return parts.build();

}

// A flat rectangle facing +Z, with the uvs drawn() textures need.
function planeGeometry( w, h ) {

	const geometry = new BufferGeometry();
	const x = w / 2;
	const y = h / 2;
	geometry.setAttribute( 'position', new BufferAttribute( new Float32Array( [ - x, - y, 0, x, - y, 0, x, y, 0, - x, - y, 0, x, y, 0, - x, y, 0 ] ), 3 ) );
	geometry.setAttribute( 'normal', new BufferAttribute( new Float32Array( [ 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1 ] ), 3 ) );
	geometry.setAttribute( 'uv', new BufferAttribute( new Float32Array( [ 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1 ] ), 2 ) );
	return geometry;

}

// --- attachments -----------------------------------------------------------------------------

// Pallet forks on their frame, standing on the tines as they're set down: the frame 46 in wide and
// 40 in high with the quick-attach plate behind, and two 48 in tines, 4 x 1.5 in, reaching forward.
function palletForks() {

	const parts = new Parts();
	const yellow = YELLOW();
	const width = 46 * IN;
	const high = 40 * IN;
	const tine = [ 4 * IN, 1.5 * IN, 48 * IN ];
	const back = 0.1;

	quickAttach( parts, yellow, [ 0.12, back + 0.06 ] );
	// Frame: top and bottom carriage bars, side posts and a mesh-free backrest of uprights.
	parts.box( yellow, [ width, 0.1, 0.08 ], [ 0, high - 0.1, back ] );
	parts.box( yellow, [ width, 0.1, 0.08 ], [ 0, 0.1, back ] );
	for ( const x of [ - width / 2 + 0.04, - 0.15, 0.15, width / 2 - 0.04 ] ) parts.box( yellow, [ 0.06, high - 0.1, 0.06 ], [ x, 0.1, back - 0.01 ] );
	// Tines: the shank hooked on the carriage bars and the blade along the ground.
	for ( const x of [ - 15 * IN, 15 * IN ] ) {

		parts.box( DARK(), [ tine[ 0 ], high - 0.05, tine[ 1 ] ], [ x, 0, back - 0.06 ] );
		plate( parts, DARK(), [ [ back - 0.04, 0 ], [ back - 0.04 - tine[ 2 ], 0 ], [ back - 0.04 - tine[ 2 ], 0.012 ], [ back - 0.04 - tine[ 2 ] + 0.25, tine[ 1 ] ], [ back - 0.04, tine[ 1 ] ] ], tine[ 0 ], x );
		parts.box( DARK(), [ tine[ 0 ] + 0.02, 0.08, 0.06 ], [ x, high - 0.15, back - 0.06 ] );

	}

	return parts.build();

}

// An auger bit along z (tip toward -Z) of `diameter` and `length` lying on the ground at x: the
// shaft, the flighting as a helix of thin blades, the pilot point and the hex collar.
function augerBit( parts, x, z0, diameter, length, y = diameter / 2 + 0.1 ) {

	const steel = mat( 0x4b4e52, { roughness: 0.55, metalness: 0.5 } );
	const r = diameter / 2;
	parts.rod( steel, [ x, y, z0 ], [ x, y, z0 + length ], 0.04, 10 );
	parts.rod( STEEL(), [ x, y, z0 + length ], [ x, y, z0 + length + 0.12 ], 0.045, 6 );
	parts.rod( steel, [ x, y, z0 ], [ x, y, z0 - 0.12 ], [ 0.035, 0.005 ], 8 );
	parts.add( mat( 0x4b4e52, { roughness: 0.55, metalness: 0.5, side: DoubleSide } ), helicoid( 0.04, r, diameter * 0.9, length - 0.1 ), _m.makeTranslation( x, y, z0 + 0.05 ) );

	// Carbide teeth on the cutting head.
	for ( const d of [ - 1, 1 ] ) parts.box( DARK(), [ r * 0.9, 0.03, 0.04 ], [ x + d * r * 0.45, y - 0.015, z0 + 0.02 ] );

}

// An auger's flighting: a helical strip from radius `inner` to `outer`, turning once every `pitch`
// along z from 0 to `length`.
function helicoid( inner, outer, pitch, length ) {

	const steps = Math.ceil( length / pitch * 24 );
	const v = [];
	const at = ( i, r ) => {

		const a = i / 24 * Math.PI * 2;
		return [ Math.cos( a ) * r, Math.sin( a ) * r, i / steps * length ];

	};

	for ( let i = 0; i < steps; i ++ ) {

		const [ a, b, c, d ] = [ at( i, inner ), at( i, outer ), at( i + 1, outer ), at( i + 1, inner ) ];
		v.push( ...a, ...b, ...c, ...a, ...c, ...d );

	}

	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new BufferAttribute( new Float32Array( v ), 3 ) );
	geometry.setAttribute( 'uv', new BufferAttribute( new Float32Array( v.length / 3 * 2 ), 2 ) );
	geometry.computeVertexNormals();
	return geometry;

}

// A planetary auger drive on its quick-attach mount, laid flat on dunnage with a 12 in bit fitted
// and an 18 in bit beside it: the set as it's dropped off at a job.
function augerSet() {

	const parts = new Parts();
	const yellow = YELLOW();
	const dunnageAt = [ - 0.7, 0.25, 0.95 ];
	for ( const z of dunnageAt ) dunnage( parts, 1.6, [ 0.1, z ] );
	const deck = 4 * IN;

	// The mount frame lying on its back at the rear, the drive hung from it on a pin, lying forward.
	parts.box( yellow, [ 44 * IN, 0.012, 18 * IN ], [ - 0.2, deck, 1.0 ] );
	parts.box( yellow, [ 44 * IN, 0.08, 0.05 ], [ - 0.2, deck, 1.0 - 9 * IN ] );
	parts.box( yellow, [ 0.08, 0.2, 0.5 ], [ - 0.2, deck, 0.7 ] );
	const axis = deck + 0.2;
	parts.rod( yellow, [ - 0.2, axis, 0.6 ], [ - 0.2, axis, 0.0 ], 0.14, 16 );
	parts.rod( DARK(), [ - 0.2, axis, 0.62 ], [ - 0.2, axis, 0.72 ], 0.1, 12 );
	for ( const d of [ - 1, 1 ] ) parts.path( HOSE(), [ [ - 0.2 + d * 0.06, axis + 0.12, 0.45 ], [ - 0.2 + d * 0.1, axis + 0.15, 0.85 ], [ - 0.2 + d * 0.3, deck + 0.02, 1.3 ] ], 0.012, 6 );
	augerBit( parts, - 0.2, - 1.25, 12 * IN, 48 * IN - 0.12, axis );
	augerBit( parts, 0.55, - 1.25 + 0.06, 18 * IN, 48 * IN - 0.12, deck + 9 * IN + 0.01 );

	return parts.build();

}

// A hydraulic breaker for a skid steer, lying on its mount plate on two blocks with its chisel
// forward: the plate, the box housing with its hoses, the front head and the moil point.
function breaker() {

	const parts = new Parts();
	const yellow = YELLOW();
	for ( const z of [ - 0.65, 0.35 ] ) dunnage( parts, 0.8, [ 0, z ], [ 6 * IN, 4 * IN ] );
	const deck = 4 * IN;

	// The quick-attach plate lying flat, the housing on it.
	parts.box( yellow, [ 44 * IN, 0.015, 18 * IN ], [ 0, deck, 0.45 ] );
	parts.box( yellow, [ 0.3, 0.06, 0.6 ], [ 0, deck + 0.015, 0.4 ] );
	const axis = deck + 0.075 + 0.17;
	parts.box( DARK(), [ 0.34, 0.34, 1.05 ], [ 0, axis - 0.17, - 0.05 ] );
	parts.box( yellow, [ 0.36, 0.04, 0.9 ], [ 0, axis + 0.17, - 0.05 ] );
	// Front head, bushing and the moil point.
	parts.rod( DARK(), [ 0, axis, - 0.58 ], [ 0, axis, - 0.75 ], 0.12, 14 );
	parts.rod( BRIGHT(), [ 0, axis, - 0.75 ], [ 0, axis, - 1.12 ], [ 0.05, 0.012 ], 10 );
	// Hoses off the back.
	for ( const d of [ - 1, 1 ] ) parts.path( HOSE(), [ [ d * 0.08, axis + 0.1, 0.47 ], [ d * 0.12, axis + 0.15, 0.7 ], [ d * 0.3, deck + 0.02, 0.9 ] ], 0.014, 6 );

	return parts.build();

}

// A 72 in grapple bucket sitting on its floor: the bucket shell, the tine bars along its floor,
// the two grapple lids closed over it on their rams, and the quick-attach plate behind.
function grappleBucket() {

	const parts = new Parts();
	const yellow = YELLOW();
	const width = 72 * IN;
	const depth = 0.85;
	const back = depth / 2;
	const front = - depth / 2;

	// Floor, back and sides as plates, with the cutting edge and an open slotted floor.
	parts.box( yellow, [ width, 0.012, depth ], [ 0, 0.03, 0 ] );
	for ( let i = 0; i < 8; i ++ ) parts.box( DARK(), [ 0.05, 0.07, depth + 0.05 ], [ - width / 2 + 0.12 + i * ( width - 0.24 ) / 7, 0, - 0.025 ] );
	parts.box( yellow, [ width, 0.6, 0.012 ], [ 0, 0.05, back - 0.02 ] );
	for ( const s of [ - 1, 1 ] ) plate( parts, yellow, [ [ front, 0.03 ], [ back, 0.03 ], [ back, 0.65 ], [ back - 0.15, 0.65 ] ], 0.014, s * width / 2 );
	parts.box( DARK(), [ width, 0.05, 0.1 ], [ 0, 0.0, front + 0.05 ] );
	quickAttach( parts, yellow, [ 0.12, back ] );

	// Two grapple lids, each a frame of curved tines from a pivot over the back, closed down to the
	// front edge, with a ram from the back of the bucket.
	for ( const s of [ - 1, 1 ] ) {

		const x0 = s * width / 4;
		const pivot = [ 0, 0.85, back - 0.05 ];
		const arc = [];
		for ( let i = 0; i <= 6; i ++ ) {

			const a = i / 6 * Math.PI * 0.5;
			arc.push( [ pivot[ 2 ] - Math.sin( a ) * ( depth + 0.05 ), pivot[ 1 ] - 0.2 + Math.cos( a ) * 0.2 - Math.sin( a ) * 0.62 ] );

		}

		for ( const dx of [ - 0.3, - 0.1, 0.1, 0.3 ] ) parts.path( DARK(), arc.map( ( [ z, y ] ) => [ x0 + dx, y, z ] ), 0.025, 6, false );
		parts.rod( DARK(), [ x0 - 0.32, pivot[ 1 ], pivot[ 2 ] ], [ x0 + 0.32, pivot[ 1 ], pivot[ 2 ] ], 0.04, 10 );
		parts.rod( DARK(), [ x0 - 0.32, arc[ 3 ][ 1 ], arc[ 3 ][ 0 ] ], [ x0 + 0.32, arc[ 3 ][ 1 ], arc[ 3 ][ 0 ] ], 0.03, 8 );
		parts.box( yellow, [ 0.08, 0.3, 0.12 ], [ x0, 0.6, back - 0.05 ] );
		parts.rod( DARK(), [ x0, 0.55, back + 0.05 ], [ x0, 0.95, back + 0.08 ], 0.045, 10 );

	}

	return parts.build();

}

// A 72 in pickup sweeper: the hopper and housing over the broom, the bristles showing at the
// bottom, the hydraulic motor on the right end, wheels each side and the quick-attach plate.
function sweeperBroom() {

	const parts = new Parts();
	const yellow = YELLOW();
	const width = 80 * IN;
	const depth = 1.0;

	// Broom core and bristles under the housing's back half.
	const r = 0.3;
	const bz = 0.12;
	parts.rod( mat( 0x2d2a26, { roughness: 1 } ), [ - 36 * IN, r, bz ], [ 36 * IN, r, bz ], r, 20 );
	// Housing: a round hood over the broom, open underneath, and the hopper's floor ahead of it
	// with its lip just off the ground, between the end plates.
	const hood = [];
	for ( let i = 0; i <= 12; i ++ ) {

		const a = ( - 35 + i / 12 * 250 ) * DEG;
		hood.push( [ bz + Math.cos( a ) * 0.38, 0.33 + Math.sin( a ) * 0.38 ] );

	}

	plate( parts, yellow, hood, width - 0.1, 0 );
	parts.box( yellow, [ width - 0.1, 0.02, bz - 0.2 + depth / 2 ], [ 0, 0.03, ( - depth / 2 + bz - 0.2 ) / 2 ] );
	parts.box( DARK(), [ width - 0.1, 0.03, 0.05 ], [ 0, 0.02, - depth / 2 + 0.02 ] );
	for ( const s of [ - 1, 1 ] ) {

		plate( parts, yellow, [ [ - depth / 2, 0.02 ], [ - depth / 2, 0.25 ], [ bz - 0.2, 0.72 ], [ bz + 0.3, 0.74 ], [ depth / 2 - 0.02, 0.45 ], [ depth / 2 - 0.02, 0.1 ], [ bz + 0.1, 0.02 ] ], 0.012, s * ( width / 2 - 0.006 ) );
		// Wheel on an arm at each end, to set the broom's height.
		tyre( parts, 0.13, 0.1, [ s * ( width / 2 + 0.07 ), 0.13, 0.36 ] );
		parts.box( DARK(), [ 0.04, 0.25, 0.3 ], [ s * ( width / 2 + 0.01 ), 0.15, 0.3 ] );

	}

	parts.box( DARK(), [ 0.18, 0.18, 0.18 ], [ width / 2 + 0.09, 0.22, bz ] );
	for ( const d of [ - 1, 1 ] ) parts.path( HOSE(), [ [ width / 2 + 0.05, 0.35, bz + d * 0.04 ], [ width / 2 - 0.1, 0.8, bz + 0.25 ], [ 0.4 + d * 0.05, 0.7, depth / 2 + 0.05 ] ], 0.013, 6 );
	quickAttach( parts, yellow, [ 0.2, depth / 2 ] );

	return parts.build();

}

// A 24 in trenching bucket for a 20 t excavator, sitting on its curved back with its teeth to the
// front: two side plates, the wrap plate round the back and bottom, the top plate with the ears
// and their pin bosses, the cutting edge and five teeth.
function trenchingBucket() {

	const parts = new Parts();
	const yellow = YELLOW();
	const width = 24 * IN;
	const t = 0.025;

	// Side profile [ z, y ]: the lip at the front, the floor round the bottom and up the back to
	// the top plate, then the open mouth back down to the lip.
	const lip = [ - 0.62, 0.06 ];
	const wrap = [ lip, [ - 0.3, 0.0 ], [ 0.0, 0.0 ], [ 0.25, 0.05 ], [ 0.45, 0.2 ], [ 0.55, 0.42 ], [ 0.55, 0.65 ], [ 0.45, 0.88 ], [ 0.3, 1.0 ] ];
	const topFront = [ - 0.35, 0.95 ];
	for ( const s of [ - 1, 1 ] ) plate( parts, yellow, [ ...wrap, topFront ], t, s * ( width / 2 - t / 2 ) );
	// The wrap: plates along the curve between the side plates.
	for ( let i = 1; i < wrap.length; i ++ ) {

		const [ za, ya ] = wrap[ i - 1 ];
		const [ zb, yb ] = wrap[ i ];
		const len = Math.hypot( zb - za, yb - ya );
		parts.block( yellow, [ width - 2 * t, t, len + 0.02 ], [ 0, ( ya + yb ) / 2, ( za + zb ) / 2 ], [ - Math.atan2( yb - ya, zb - za ), 0, 0 ] );

	}

	// Top plate, ears and pin bosses.
	parts.block( yellow, [ width, t, 0.66 ], [ 0, 0.985, - 0.025 ], [ - Math.atan2( 0.05, 0.65 ), 0, 0 ] );
	for ( const s of [ - 1, 1 ] ) {

		plate( parts, yellow, [ [ - 0.3, 0.96 ], [ 0.35, 1.0 ], [ 0.35, 1.16 ], [ 0.2, 1.24 ], [ - 0.2, 1.18 ], [ - 0.3, 1.08 ] ], 0.035, s * 0.17 );
		for ( const z of [ - 0.15, 0.22 ] ) parts.rod( DARK(), [ s * 0.15, 1.1, z ], [ s * 0.21, 1.1, z ], 0.07, 14 );

	}

	// Cutting edge and teeth along the lip.
	parts.block( DARK(), [ width + 0.02, 0.04, 0.12 ], [ 0, lip[ 1 ] + 0.02, lip[ 0 ] + 0.04 ], [ 0, 0, 0 ] );
	for ( let i = 0; i < 5; i ++ ) {

		const x = - width / 2 + 0.06 + i * ( width - 0.12 ) / 4;
		parts.block( DARK(), [ 0.07, 0.06, 0.2 ], [ x, lip[ 1 ] + 0.02, lip[ 0 ] - 0.08 ], [ 0.1, 0, 0 ] );

	}

	return parts.build();

}

// A hydraulic pin-grabber quick coupler for a 20 t excavator, standing as it hangs: the two side
// plates with the stick and link pins across the top, the front hook and the rear latch at the
// bottom, and its ram and hoses.
function quickCoupler() {

	const parts = new Parts();
	const yellow = YELLOW();
	const length = 0.95;
	const gap = 0.36;

	for ( const s of [ - 1, 1 ] ) {

		plate( parts, yellow, [ [ - length / 2, 0.05 ], [ length / 2, 0.05 ], [ length / 2, 0.3 ], [ 0.2, 0.55 ], [ - 0.25, 0.55 ], [ - length / 2, 0.3 ] ], 0.04, s * ( gap / 2 + 0.02 ) );

	}

	// Pins across the top (the stick's and the link's).
	for ( const z of [ - 0.12, 0.25 ] ) parts.rod( BRIGHT(), [ - gap / 2 - 0.08, 0.43, z ], [ gap / 2 + 0.08, 0.43, z ], 0.045, 14 );
	// The base between the side plates, the hook and the latch.
	parts.box( yellow, [ gap, 0.12, length - 0.1 ], [ 0, 0.05, 0 ] );
	plate( parts, DARK(), [ [ - length / 2, 0 ], [ - length / 2 + 0.15, 0 ], [ - length / 2 + 0.18, 0.08 ], [ - length / 2 + 0.06, 0.12 ] ], gap - 0.04, 0 );
	plate( parts, DARK(), [ [ length / 2 - 0.12, 0 ], [ length / 2, 0 ], [ length / 2, 0.1 ], [ length / 2 - 0.15, 0.12 ] ], gap - 0.04, 0 );
	parts.rod( DARK(), [ 0, 0.25, 0.25 ], [ 0, 0.2, - 0.1 ], 0.05, 10 );
	for ( const d of [ - 1, 1 ] ) parts.path( HOSE(), [ [ d * 0.05, 0.3, 0.28 ], [ d * 0.06, 0.6, 0.35 ] ], 0.01, 6 );

	return parts.build();

}

// --- small tools and site gear ---------------------------------------------------------------

// A walk-behind flat saw with an 18 in blade (about 1.7 m long with its handles up, 0.65 m wide):
// the frame on four wheels, the engine, the blade guard on the right front with the blade under
// it, the water tank on top and the handlebars at the back.
function concreteSaw() {

	const parts = new Parts();
	const red = paint( 0xc62a1e );
	const frameY = 0.18;

	parts.box( DARK(), [ 0.55, 0.08, 1.05 ], [ 0, frameY, 0 ] );
	for ( const s of [ - 1, 1 ] ) {

		tyre( parts, 0.11, 0.06, [ s * 0.24, 0.11, - 0.38 ] );
		tyre( parts, 0.11, 0.06, [ s * 0.24, 0.11, 0.42 ] );

	}

	// Engine and its shroud, muffler and fuel tank.
	parts.box( red, [ 0.45, 0.38, 0.5 ], [ - 0.02, frameY + 0.08, 0.1 ] );
	parts.box( DARK(), [ 0.3, 0.12, 0.25 ], [ - 0.02, frameY + 0.46, 0.15 ] );
	parts.rod( STEEL(), [ - 0.22, frameY + 0.32, 0.3 ], [ - 0.22, frameY + 0.32, 0.45 ], 0.05, 10 );
	// Blade guard on the right front, the blade showing below it, and the depth wheel.
	const bladeX = 0.36;
	const bladeZ = - 0.42;
	const br = 9 * IN;
	parts.rod( STEEL(), [ bladeX - 0.003, br - 0.03, bladeZ ], [ bladeX + 0.003, br - 0.03, bladeZ ], br, 28 );
	plate( parts, red, [ [ bladeZ - br - 0.03, 0.18 ], [ bladeZ - br * 0.7, br + 0.15 ], [ bladeZ, br * 2 - 0.0 ], [ bladeZ + br * 0.7, br + 0.15 ], [ bladeZ + br + 0.03, 0.18 ] ], 0.08, bladeX );
	parts.rod( DARK(), [ 0.27, frameY + 0.04, bladeZ ], [ bladeX - 0.04, frameY + 0.04, bladeZ ], 0.03, 8 );
	// Water tank, pointer arm at the front and the handlebars.
	parts.box( plastic( 0xe8e6df ), [ 0.4, 0.2, 0.3 ], [ - 0.05, frameY + 0.46, - 0.25 ] );
	parts.rod( red, [ - 0.1, frameY + 0.05, - 0.52 ], [ - 0.1, frameY + 0.05, - 0.9 ], 0.012, 6 );
	parts.rod( red, [ - 0.1, frameY + 0.05, - 0.9 ], [ - 0.1, 0.02, - 0.92 ], 0.012, 6 );
	for ( const s of [ - 1, 1 ] ) parts.path( DARK(), [ [ s * 0.22, frameY + 0.08, 0.45 ], [ s * 0.24, 0.65, 0.65 ], [ s * 0.24, 0.98, 0.78 ] ], 0.016, 6 );
	parts.rod( RUBBER(), [ - 0.27, 0.98, 0.78 ], [ 0.27, 0.98, 0.78 ], 0.02, 8 );
	parts.box( DARK(), [ 0.18, 0.1, 0.06 ], [ 0, 0.85, 0.72 ] );

	return parts.build();

}

// A gas pressure washer on its tube frame cart (about 1.0 m long, 0.7 m wide, 1.0 m to the
// handle): engine and pump on the frame, two pneumatic wheels at the back, a hose reel, the gun
// and wand on hooks.
function pressureWasherCart() {

	const parts = new Parts();
	const frame = paint( 0x2b5aa8 );
	const deckY = 0.28;

	// Tube frame: two side rails, the cross plate, front feet and the handle.
	for ( const s of [ - 1, 1 ] ) parts.path( frame, [ [ s * 0.28, 0.04, - 0.4 ], [ s * 0.28, deckY, - 0.4 ], [ s * 0.28, deckY, 0.3 ], [ s * 0.28, 0.95, 0.5 ] ], 0.016, 8 );
	parts.box( frame, [ 0.56, 0.01, 0.6 ], [ 0, deckY, - 0.06 ] );
	parts.rod( RUBBER(), [ - 0.29, 0.95, 0.5 ], [ 0.29, 0.95, 0.5 ], 0.022, 8 );
	for ( const s of [ - 1, 1 ] ) tyre( parts, 0.16, 0.09, [ s * 0.36, 0.16, 0.24 ] );
	parts.rod( STEEL(), [ - 0.36, 0.16, 0.24 ], [ 0.36, 0.16, 0.24 ], 0.012, 6 );
	// Engine with its tank and air cleaner, the pump in front, and the unloader.
	parts.box( mat( 0xb7271f, { roughness: 0.5 } ), [ 0.38, 0.3, 0.32 ], [ 0, deckY + 0.01, 0.0 ] );
	parts.box( DARK(), [ 0.3, 0.12, 0.2 ], [ 0, deckY + 0.31, - 0.02 ] );
	parts.box( BRIGHT(), [ 0.14, 0.16, 0.22 ], [ 0.05, deckY + 0.04, - 0.3 ] );
	parts.rod( BRIGHT(), [ 0.05, deckY + 0.12, - 0.41 ], [ 0.05, deckY + 0.12, - 0.48 ], 0.025, 8 );
	// Hose reel on the handle and the wand hung on the side.
	parts.rod( frame, [ - 0.2, 0.72, 0.42 ], [ 0.2, 0.72, 0.42 ], 0.03, 8 );
	parts.rod( HOSE(), [ - 0.15, 0.72, 0.42 ], [ 0.15, 0.72, 0.42 ], 0.12, 18 );
	for ( const s of [ - 1, 1 ] ) parts.rod( frame, [ s * 0.17, 0.72, 0.42 ], [ s * 0.16, 0.72, 0.42 ], 0.16, 18 );
	parts.rod( STEEL(), [ - 0.31, 0.35, - 0.2 ], [ - 0.31, 0.85, 0.35 ], 0.008, 6 );
	parts.box( DARK(), [ 0.03, 0.15, 0.05 ], [ - 0.31, 0.72, 0.24 ] );

	return parts.build();

}

// A hot water pressure washer on a single axle trailer (about 3.9 m long with its tongue, 1.85 m
// wide and 1.75 m high): the diesel burner coil and its stack, the engine and pump, a 200 gal
// water tank, a hose reel at the back, fenders and lights.
function hotWasherTrailer() {

	const parts = new Parts();
	const frame = mat( 0x2a2b2d, { roughness: 0.6, metalness: 0.4 } );
	const housing = paint( 0xc8202a );
	const deckY = 0.55;
	const deck = [ 1.6, 2.6 ];
	const dz = 0.45;

	// Frame, deck, tongue with its jack and coupler, axle and fenders.
	parts.box( frame, [ deck[ 0 ], 0.08, deck[ 1 ] ], [ 0, deckY - 0.08, dz ] );
	parts.box( WHEEL_STEEL(), [ deck[ 0 ], 0.006, deck[ 1 ] ], [ 0, deckY, dz ] );
	parts.path( frame, [ [ - 0.7, deckY - 0.05, dz - deck[ 1 ] / 2 ], [ 0, deckY - 0.05, - 1.95 ], [ 0.7, deckY - 0.05, dz - deck[ 1 ] / 2 ] ], 0.04, 6 );
	parts.box( DARK(), [ 0.12, 0.08, 0.2 ], [ 0, deckY - 0.08, - 1.95 ] );
	parts.rod( DARK(), [ 0.12, 0.05, - 1.5 ], [ 0.12, deckY + 0.25, - 1.5 ], 0.03, 8 );
	parts.box( DARK(), [ 0.12, 0.05, 0.12 ], [ 0.12, 0, - 1.5 ] );
	for ( const s of [ - 1, 1 ] ) {

		tyre( parts, 0.32, 0.2, [ s * 0.88, 0.32, 0.6 ] );
		plate( parts, frame, [ [ 0.15, deckY ], [ 0.25, deckY + 0.2 ], [ 0.95, deckY + 0.2 ], [ 1.05, deckY ] ], 0.24, s * 0.88 );
		parts.box( RED_LAMP(), [ 0.12, 0.08, 0.02 ], [ s * 0.7, deckY - 0.05, dz + deck[ 1 ] / 2 + 0.01 ] );

	}

	// Water tank at the front, then the washer: a frame-mounted housing with the burner coil and its
	// stack at the back and the hose reel above the rear.
	parts.box( plastic( 0xeeeae0 ), [ 1.2, 0.8, 0.85 ], [ 0, deckY, - 0.4 ] );
	parts.box( plastic( 0xd8d4ca ), [ 0.3, 0.05, 0.3 ], [ 0, deckY + 0.8, - 0.4 ] );
	parts.box( housing, [ 1.3, 0.85, 1.0 ], [ 0, deckY, 0.65 ] );
	parts.box( DARK(), [ 0.02, 0.4, 0.6 ], [ 0.66, deckY + 0.3, 0.6 ] );
	parts.cylinder( STEEL(), 0.28, 0.5, [ - 0.25, deckY + 0.85, 0.8 ], 18 );
	parts.cylinder( DARK(), 0.09, 0.32, [ - 0.25, deckY + 1.35, 0.8 ], 12 );
	parts.box( DARK(), [ 0.5, 0.4, 0.35 ], [ 0.35, deckY + 0.85, 0.75 ] );
	parts.rod( frame, [ - 0.4, deckY + 0.6, 1.45 ], [ 0.4, deckY + 0.6, 1.45 ], 0.03, 8 );
	parts.rod( HOSE(), [ - 0.3, deckY + 0.6, 1.45 ], [ 0.3, deckY + 0.6, 1.45 ], 0.2, 20 );
	for ( const s of [ - 1, 1 ] ) {

		parts.rod( frame, [ s * 0.32, deckY + 0.6, 1.45 ], [ s * 0.34, deckY + 0.6, 1.45 ], 0.26, 20 );
		parts.box( frame, [ 0.04, 0.6, 0.05 ], [ s * 0.36, deckY, 1.45 ] );

	}

	return parts.build();

}

// An engine-driven welder / generator (300 A diesel, about 1.15 x 0.6 x 0.85 m) on a small single
// axle trailer (about 2.9 m long with its tongue): the cabinet with its control panel at the back,
// the exhaust and lifting eye on top, the lead reels on a rack and the trailer's fenders.
function welderTrailer() {

	const parts = new Parts();
	const frame = mat( 0x2a2b2d, { roughness: 0.6, metalness: 0.4 } );
	const red = paint( 0xb7271f );
	const deckY = 0.5;
	const deck = [ 1.15, 1.7 ];
	const dz = 0.35;

	// Trailer frame, deck, tongue, jack, axle and fenders.
	parts.box( frame, [ deck[ 0 ], 0.08, deck[ 1 ] ], [ 0, deckY - 0.08, dz ] );
	parts.box( WHEEL_STEEL(), [ deck[ 0 ], 0.006, deck[ 1 ] ], [ 0, deckY, dz ] );
	parts.path( frame, [ [ - 0.5, deckY - 0.05, dz - deck[ 1 ] / 2 ], [ 0, deckY - 0.05, - 1.45 ], [ 0.5, deckY - 0.05, dz - deck[ 1 ] / 2 ] ], 0.035, 6 );
	parts.box( DARK(), [ 0.1, 0.07, 0.18 ], [ 0, deckY - 0.08, - 1.45 ] );
	parts.rod( DARK(), [ 0.1, 0.05, - 1.05 ], [ 0.1, deckY + 0.2, - 1.05 ], 0.025, 8 );
	parts.box( DARK(), [ 0.1, 0.05, 0.1 ], [ 0.1, 0, - 1.05 ] );
	for ( const s of [ - 1, 1 ] ) {

		tyre( parts, 0.27, 0.17, [ s * 0.72, 0.27, 0.45 ] );
		plate( parts, frame, [ [ 0.05, deckY ], [ 0.15, deckY + 0.13 ], [ 0.75, deckY + 0.13 ], [ 0.85, deckY ] ], 0.2, s * 0.72 );
		parts.box( RED_LAMP(), [ 0.1, 0.07, 0.02 ], [ s * 0.5, deckY - 0.05, dz + deck[ 1 ] / 2 + 0.01 ] );

	}

	// The welder: base, cabinet with louvres and its lifting eye, exhaust and the control panel at
	// the back with its studs.
	const wz = 0.45;
	parts.box( DARK(), [ 0.62, 0.08, 1.15 ], [ 0, deckY, wz ] );
	parts.box( red, [ 0.6, 0.77, 1.12 ], [ 0, deckY + 0.08, wz ] );
	for ( const s of [ - 1, 1 ] ) for ( let i = 0; i < 6; i ++ ) parts.box( DARK(), [ 0.01, 0.025, 0.4 ], [ s * 0.301, deckY + 0.35 + i * 0.06, wz - 0.25 ] );
	parts.box( STEEL(), [ 0.04, 0.12, 0.12 ], [ 0, deckY + 0.85, wz ] );
	parts.rod( DARK(), [ 0.18, deckY + 0.85, wz - 0.3 ], [ 0.18, deckY + 1.0, wz - 0.3 ], 0.035, 10 );
	parts.box( DARK(), [ 0.5, 0.5, 0.01 ], [ 0, deckY + 0.2, wz + 0.565 ] );
	for ( const x of [ - 0.12, 0.12 ] ) parts.rod( BRIGHT(), [ x, deckY + 0.3, wz + 0.57 ], [ x, deckY + 0.3, wz + 0.61 ], 0.025, 8 );
	parts.rod( DARK(), [ 0, deckY + 0.55, wz + 0.57 ], [ 0, deckY + 0.55, wz + 0.6 ], 0.04, 12 );
	// Lead reels on a rack in front of it.
	parts.box( frame, [ 0.9, 0.04, 0.3 ], [ 0, deckY, - 0.35 ] );
	for ( const x of [ - 0.25, 0.25 ] ) {

		parts.rod( mat( 0x111213 ), [ x - 0.12, deckY + 0.27, - 0.35 ], [ x + 0.12, deckY + 0.27, - 0.35 ], 0.17, 18 );
		for ( const d of [ - 1, 1 ] ) parts.rod( frame, [ x + d * 0.13, deckY + 0.27, - 0.35 ], [ x + d * 0.14, deckY + 0.27, - 0.35 ], 0.23, 18 );

	}

	return parts.build();

}

// A 20 ft pipe spreader bar (8 in pipe, 30 t class) resting on two timbers, with the shackles and
// lifting lugs at each end, its two wire rope top slings laid out to the master link ahead of it
// and two yellow round slings off the bottom lugs laid out behind.
function spreaderBar() {

	const parts = new Parts();
	const yellow = YELLOW();
	const length = 20 * FT;
	const r = 8.625 / 2 * IN;
	const deck = 4 * IN;
	const axis = deck + r;
	const half = length / 2;

	for ( const x of [ - 1.8, 1.8 ] ) parts.box( TIMBER(), [ 0.1, deck, 0.9 ], [ x, 0, 0 ] );
	parts.rod( yellow, [ - half + 0.25, axis, 0 ], [ half - 0.25, axis, 0 ], r, 18 );
	parts.box( DARK(), [ 1.8, 0.004, 0.006 ], [ 0, axis + r - 0.001, 0 ] );
	for ( const s of [ - 1, 1 ] ) {

		// End fitting: a stub with a top lug forward (as it lies, the lugs point out to the slings)
		// and a bottom lug back, each with a shackle.
		const x = s * ( half - 0.18 );
		parts.box( yellow, [ 0.36, 0.3, 0.3 ], [ x, deck, 0 ] );
		plate( parts, yellow, [ [ - 0.15, axis - 0.05 ], [ - 0.42, axis - 0.03 ], [ - 0.42, axis + 0.03 ], [ - 0.15, axis + 0.05 ] ], 0.04, x );
		plate( parts, yellow, [ [ 0.15, axis - 0.05 ], [ 0.42, axis - 0.03 ], [ 0.42, axis + 0.03 ], [ 0.15, axis + 0.05 ] ], 0.04, x );
		parts.rod( mat( 0xd23b1e, { roughness: 0.5 } ), [ x - 0.06, axis, - 0.37 ], [ x + 0.06, axis, - 0.37 ], 0.02, 8 );
		parts.path( mat( 0xd23b1e, { roughness: 0.5 } ), [ [ x - 0.06, axis, - 0.37 ], [ x - 0.06, 0.04, - 0.5 ], [ x + 0.06, 0.04, - 0.5 ], [ x + 0.06, axis, - 0.37 ] ], 0.018, 6 );
		parts.path( mat( 0xd23b1e, { roughness: 0.5 } ), [ [ x - 0.06, axis, 0.37 ], [ x - 0.06, 0.04, 0.5 ], [ x + 0.06, 0.04, 0.5 ], [ x + 0.06, axis, 0.37 ] ], 0.018, 6 );

	}

	// Top slings (15 ft wire rope) from the shackles to the master link ahead.
	const apex = [ 0, 0.03, - 3.4 ];
	for ( const s of [ - 1, 1 ] ) {

		const x = s * ( half - 0.18 );
		parts.path( ROPE(), [ [ x, 0.03, - 0.52 ], [ x * 0.97, 0.025, - 0.75 ], [ apex[ 0 ] + s * 0.15, 0.025, apex[ 2 ] + 0.25 ] ], 0.016, 6 );
		parts.sphere( ROPE(), 0.05, [ apex[ 0 ] + s * 0.15, 0.03, apex[ 2 ] + 0.25 ], [ 8, 4 ], [ 1, 0.6, 2 ] );

	}

	parts.path( mat( 0xd23b1e, { roughness: 0.5 } ), [ [ - 0.2, 0.03, apex[ 2 ] + 0.2 ], [ - 0.12, 0.03, apex[ 2 ] - 0.2 ], [ 0.12, 0.03, apex[ 2 ] - 0.2 ], [ 0.2, 0.03, apex[ 2 ] + 0.2 ], [ - 0.2, 0.03, apex[ 2 ] + 0.2 ] ], 0.025, 6 );
	// Bottom slings: yellow round slings off the back shackles, laid out behind.
	for ( const s of [ - 1, 1 ] ) {

		const x = s * ( half - 0.18 );
		parts.path( plastic( 0xe8c21a ), [ [ x - 0.05, 0.035, 0.52 ], [ x - 0.12, 0.035, 1.6 ], [ x - 0.3, 0.035, 2.3 ], [ x - 0.42, 0.035, 2.25 ], [ x - 0.25, 0.035, 1.55 ], [ x + 0.05, 0.035, 0.52 ] ], 0.035, 6 );

	}

	return parts.build();

}

// A portable two-sink handwash station of the common rental type (0.95 m wide, 0.65 m deep, 1.4 m
// high) with foot pumps, soap and towel dispensers on its backsplash, and beside it a 16 gal
// gravity eyewash in green on its stand, with the eye bowl and the pull-down cover.
function washStation() {

	const parts = new Parts();
	const shell = plastic( 0x8a8e8b );
	const white = plastic( 0xf1f1ec );
	const x0 = - 0.3;

	// Tank body, counter with two sinks, backsplash and dispensers.
	parts.box( shell, [ 0.95, 0.85, 0.6 ], [ x0, 0, 0.02 ] );
	parts.box( white, [ 0.97, 0.06, 0.65 ], [ x0, 0.85, 0 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( mat( 0xd7d7d0, { roughness: 0.4 } ), [ 0.36, 0.02, 0.36 ], [ x0 + s * 0.23, 0.9, - 0.05 ] );
		parts.box( DARK(), [ 0.2, 0.06, 0.12 ], [ x0 + s * 0.23, 0.02, - 0.32 ] );
		parts.rod( BRIGHT(), [ x0 + s * 0.23, 1.0, 0.18 ], [ x0 + s * 0.23, 1.1, 0.1 ], 0.012, 6 );
		parts.box( white, [ 0.22, 0.3, 0.12 ], [ x0 + s * 0.23, 1.08, 0.26 ] );
		parts.box( DARK(), [ 0.1, 0.12, 0.08 ], [ x0 + s * 0.23, 0.98, 0.18 ] );

	}

	parts.box( white, [ 0.97, 0.55, 0.06 ], [ x0, 0.91, 0.29 ] );
	parts.box( DARK(), [ 0.02, 0.4, 0.06 ], [ x0 - 0.49, 0.95, 0.22 ] );

	// Gravity eyewash: a stand, the green tank, the bowl and its cover.
	const ex = 0.48;
	const green = plastic( 0x1f9a4a );
	parts.box( STEEL(), [ 0.45, 0.03, 0.4 ], [ ex, 0, 0.05 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( STEEL(), [ 0.04, 0.95, 0.04 ], [ ex + s * 0.18, 0.03, 0.2 ] );
	parts.box( green, [ 0.45, 0.6, 0.3 ], [ ex, 0.95, 0.12 ] );
	parts.box( green, [ 0.38, 0.18, 0.12 ], [ ex, 0.9, - 0.1 ] );
	parts.block( plastic( 0xf2c500 ), [ 0.36, 0.02, 0.25 ], [ ex, 1.12, - 0.1 ], [ 0.6, 0, 0 ] );
	parts.box( white, [ 0.3, 0.12, 0.005 ], [ ex, 1.3, - 0.033 ] );

	return parts.build();

}

// A 10 in job-site table saw on its folding wheeled stand: the stand's tube legs and wheels, the
// saw body under the table, the blade and its guard, the rip fence and the extension.
function tableSaw() {

	const parts = new Parts();
	const yellow = plastic( 0xf2b200 );
	const tableY = 0.92;
	const table = [ 0.65, 0.55 ];

	// Stand: two splayed leg frames, wheels at the back, a handle.
	for ( const z of [ - 0.25, 0.25 ] ) {

		for ( const s of [ - 1, 1 ] ) parts.rod( STEEL(), [ s * 0.3, z < 0 ? 0.02 : 0.1, z * 1.6 ], [ s * 0.25, tableY - 0.32, z * 0.6 ], 0.016, 6 );

	}

	parts.rod( STEEL(), [ - 0.3, 0.02, - 0.4 ], [ 0.3, 0.02, - 0.4 ], 0.016, 6 );
	for ( const s of [ - 1, 1 ] ) {

		tyre( parts, 0.1, 0.05, [ s * 0.34, 0.1, 0.4 ] );
		parts.box( STEEL(), [ 0.04, 0.04, 0.8 ], [ s * 0.25, tableY - 0.36, 0 ] );

	}

	parts.rod( STEEL(), [ - 0.25, tableY - 0.3, 0.42 ], [ 0.25, tableY - 0.3, 0.42 ], 0.014, 6 );
	// Saw body and the table on it, the blade, guard and fence.
	parts.box( yellow, [ 0.55, 0.3, 0.5 ], [ 0, tableY - 0.32, 0 ] );
	parts.box( DARK(), [ 0.5, 0.08, 0.03 ], [ 0, tableY - 0.22, - 0.26 ] );
	parts.box( STEEL(), [ table[ 0 ], 0.025, table[ 1 ] ], [ 0, tableY - 0.025, 0 ] );
	parts.box( STEEL(), [ 0.25, 0.012, table[ 1 ] ], [ - 0.45, tableY - 0.012, 0 ] );
	parts.rod( BRIGHT(), [ 0.05, tableY - 0.05, 0.0 ], [ 0.053, tableY - 0.05, 0.0 ], 5 * IN, 24 );
	parts.box( mat( 0xd8dde0, { roughness: 0.2, transparent: true, opacity: 0.6 } ), [ 0.08, 0.1, 0.3 ], [ 0.05, tableY + 0.06, 0.02 ] );
	parts.box( DARK(), [ 0.02, 0.18, 0.04 ], [ 0.05, tableY - 0.02, 0.15 ] );
	parts.box( DARK(), [ 0.05, 0.07, table[ 1 ] + 0.06 ], [ - 0.2, tableY, 0 ] );
	parts.box( DARK(), [ 0.08, 0.06, 0.04 ], [ 0, tableY - 0.15, - 0.28 ] );

	return parts.build();

}

// Two folding sawhorses (32 in) with a 4 x 8 ft sheet of 3/4 in plywood on them as a table.
function sawhorses() {

	const parts = new Parts();
	const lumber = mat( 0xc9a46c, { roughness: 0.9 } );
	const ply = mat( 0xd8b884, { roughness: 0.85 } );
	const height = 32 * IN;
	const sheet = [ 4 * FT, 0.75 * IN, 8 * FT ];

	// Each horse lies across the sheet (along x): a 2x4 top on brackets with two pairs of splayed legs.
	for ( const z of [ - 0.85, 0.85 ] ) {

		parts.box( lumber, [ 1.0, 3.5 * IN, 1.5 * IN ], [ 0, height - 3.5 * IN, z ] );
		for ( const s of [ - 1, 1 ] ) {

			parts.box( DARK(), [ 0.08, 0.1, 0.1 ], [ s * 0.38, height - 0.12, z ] );
			for ( const d of [ - 1, 1 ] ) parts.block( lumber, [ 1.5 * IN, height, 3.5 * IN ], [ s * 0.43, height / 2 - 0.01, z + d * 0.12 ], [ - d * 0.24, 0, s * 0.12 ] );

		}

	}

	parts.box( ply, sheet, [ 0, height, 0 ] );
	// A circular saw and a tape on the sheet.
	parts.box( plastic( 0xf2b200 ), [ 0.18, 0.12, 0.3 ], [ 0.25, height + sheet[ 1 ], 0.6 ] );
	parts.box( STEEL(), [ 0.22, 0.01, 0.34 ], [ 0.25, height + sheet[ 1 ], 0.6 ] );
	parts.cylinder( plastic( 0xf2c500 ), 0.04, 0.04, [ - 0.3, height + sheet[ 1 ], - 0.5 ], 12 );

	return parts.build();

}
