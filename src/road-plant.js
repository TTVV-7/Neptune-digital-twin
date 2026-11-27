import { ExtrudeGeometry, MathUtils, Matrix4, Path, Shape, Vector2, Vector3 } from 'three';
import { drawn, FT, IN, mat, Parts } from './parts.js';
import { memberGeometry } from './plant-parts.js';

// Road building and paving plant built in code at the sizes of the common North American classes
// (no brands): the rollers missing from the library (a pneumatic tyre roller, a padfoot soil
// compactor and a large tandem asphalt roller), the rest of a paving train (an asphalt distributor,
// a chip spreader, a material transfer vehicle, a curb and gutter machine, a concrete slipform
// paver and its texture / cure machine), and finishing and maintenance kit (a line striping truck,
// a crack sealing melter, an asphalt hot box, a soil stabilizer and a small water trailer). Like
// the other built-in pieces each stands on y = 0 with its front facing -Z (+X is its right).

const DEG = MathUtils.DEG2RAD;
const UP = new Vector3( 0, 1, 0 );
const _m = new Matrix4();

// Paving width of the concrete slipform paver, and the slab its texture / cure machine spans.
const SLAB = 28 * FT;

export const ROAD_ITEMS = [
	// Compaction.
	{ id: 'roller-pneumatic-9wheel', name: 'Pneumatic tyre roller (9 wheels, 69 in rolling width, ~12 t ballasted)', category: 'Heavy equipment',
		keywords: 'pneumatic roller rubber tire roller rubber tyre roller pneumatic compactor 9 wheel nine wheel asphalt chip seal rubber roller',
		build: pneumaticRoller },
	{ id: 'compactor-padfoot-84in', name: 'Padfoot soil compactor, single drum 84 in (11 t, CAT CP56 class)', category: 'Heavy equipment',
		keywords: 'padfoot roller pad foot sheepsfoot sheeps foot compactor soil compactor tamping roller vibratory clay fill',
		build: padfootCompactor },
	{ id: 'roller-tandem-67in', name: 'Tandem asphalt roller, 67 in drums (13 t, CAT CB13 class)', category: 'Heavy equipment',
		keywords: 'tandem roller double drum roller asphalt roller breakdown roller steel wheel vibratory blacktop compactor big',
		build: tandemRoller },
	// Paving train.
	{ id: 'asphalt-distributor-truck', name: 'Asphalt distributor truck (4,000 gal, 12 ft spray bar)', category: 'Vehicles',
		keywords: 'asphalt distributor tack truck oil truck emulsion spray bar tack coat prime coat chip seal bitumen sprayer etnyre',
		build: distributorTruck },
	{ id: 'chip-spreader', name: 'Chip spreader, self-propelled (12.5 ft spread hopper)', category: 'Heavy equipment',
		keywords: 'chip spreader chip seal aggregate spreader chipper seal coat stone spreader',
		build: chipSpreader },
	{ id: 'material-transfer-vehicle', name: 'Material transfer vehicle (Shuttle Buggy class, 25 t surge bin, swing conveyor)', category: 'Heavy equipment',
		keywords: 'material transfer vehicle mtv shuttle buggy transfer device remixer asphalt paving windrow surge bin',
		build: transferVehicle },
	{ id: 'slipform-curb-machine', name: 'Slipform curb and gutter machine, 3-track (30 in curb and gutter mould)', category: 'Concrete & batching',
		keywords: 'slipform curb machine curb and gutter extruder curber gomaco concrete curb sidewalk barrier slip form',
		build: curbMachine },
	{ id: 'slipform-paver-28ft', name: 'Concrete slipform paver, 2-track (28 ft / 8.5 m paving width)', category: 'Concrete & batching',
		keywords: 'slipform paver concrete paver slip form pcc pavement highway runway two track gomaco wirtgen',
		build: slipformPaver },
	{ id: 'texture-cure-machine-28ft', name: 'Texture / cure machine, 2-track (spans a 28 ft slab)', category: 'Concrete & batching',
		keywords: 'texture cure machine tining curing compound spray bridge tine rake concrete paving t/c',
		build: textureCure },
	// Finishing and maintenance.
	{ id: 'line-striping-truck', name: 'Line striping truck (2 paint tanks, 2 bead tanks, gun carriage, arrow board)', category: 'Vehicles',
		keywords: 'line striper striping truck paint truck pavement marking road lines beads long line traffic paint',
		build: stripingTruck },
	{ id: 'crack-sealer-melter', name: 'Crack sealing melter kettle, trailer (250 gal, hose and wand)', category: 'Heavy equipment',
		keywords: 'crack sealer crack filler melter kettle hot pour rubberized sealant asphalt crack sealing trailer crafco',
		build: crackSealer },
	{ id: 'asphalt-hot-box-4t', name: 'Asphalt hot box / patch trailer (4 t, diesel fired, tandem axle)', category: 'Heavy equipment',
		keywords: 'hot box asphalt hotbox patch trailer pothole patching recycler reclaimer hot mix',
		build: hotBox },
	{ id: 'soil-stabilizer-wr240', name: 'Soil stabilizer / reclaimer (Wirtgen WR 240 class, 2.4 m rotor)', category: 'Heavy equipment',
		keywords: 'soil stabilizer reclaimer recycler full depth reclamation fdr cement lime stabilization pulverizer road mixer',
		build: stabilizer },
	{ id: 'water-trailer-500gal', name: 'Water trailer, towable (500 gal, pump and spray bar)', category: 'Site services',
		keywords: 'water trailer water buffalo water tank trailer dust control towable spray tank 500 gallon',
		build: waterTrailer },
];

// --- shared colours ----------------------------------------------------------------------------

const paint = color => mat( color, { roughness: 0.5, metalness: 0.2 } );
const YELLOW = () => paint( 0xf2b200 );
const WHITE = () => paint( 0xe9e8e2 );
const DARK = () => mat( 0x2c2e31, { roughness: 0.7, metalness: 0.2 } );
const BLACK = () => mat( 0x18191b, { roughness: 0.85 } );
const TRACK = () => mat( 0x2a2a2b, { roughness: 0.8, metalness: 0.35 } );
const STEEL = () => mat( 0x7d8287, { roughness: 0.5, metalness: 0.6 } );
const BRIGHT = () => mat( 0xc9ccce, { roughness: 0.35, metalness: 0.3 } );
const STAINLESS = () => mat( 0xc4c8cb, { roughness: 0.3, metalness: 0.7 } );
const GLASS = () => mat( 0x23313b, { roughness: 0.15, metalness: 0.3 } );
const RUBBER = () => mat( 0x161718, { roughness: 0.9 } );
const SEAT = () => mat( 0x202224, { roughness: 0.9 } );
const BELT = () => mat( 0x1f2022, { roughness: 0.9 } );
const AMBER = () => mat( 0xff9a1a, { roughness: 0.3, emissive: 0xc76a00, emissiveIntensity: 0.6 } );
const RED_LAMP = () => mat( 0xb3141b, { roughness: 0.3, emissive: 0x7a0a0e, emissiveIntensity: 0.6 } );
const HEADLAMP = () => mat( 0xfff3c9, { roughness: 0.3, emissive: 0x6b6040 } );
const CONCRETE = () => mat( 0xb9b5ab, { roughness: 0.95 } );

// --- shared pieces -----------------------------------------------------------------------------

const v = p => Array.isArray( p ) ? new Vector3( ...p ) : p.clone();

// A box section [ w across, h deep ] from a to b.
function member( parts, material, section, a, b ) {

	parts.add( material, memberGeometry( section, v( a ), v( b ) ) );

}

// A cross-section (points [ x, y ]) extruded along z from z0 to z1.
function alongZ( parts, material, points, z0, z1 ) {

	const shape = new Shape( points.map( ( [ x, y ] ) => new Vector2( x, y ) ) );
	const geometry = new ExtrudeGeometry( shape, { depth: z1 - z0, bevelEnabled: false, curveSegments: 4 } );
	parts.add( material, geometry, _m.makeTranslation( 0, 0, z0 ) );

}

// An ellipse (points [ x, y ]) `width` across and `height` high, its bottom at y0, centred on x0.
function ellipse( width, height, y0, x0 = 0, steps = 24 ) {

	const points = [];
	for ( let i = 0; i < steps; i ++ ) {

		const a = i / steps * Math.PI * 2;
		points.push( [ x0 + Math.cos( a ) * width / 2, y0 + height / 2 + Math.sin( a ) * height / 2 ] );

	}

	return points;

}

// A rounded-end outline (points [ z, y ]) `length` long and `height` high, its bottom at y0.
function stadium( z0, y0, length, height, steps = 8 ) {

	const r = height / 2;
	const yc = y0 + r;
	const points = [];
	for ( let i = 0; i <= steps; i ++ ) {

		const a = - Math.PI / 2 + Math.PI * i / steps;
		points.push( [ z0 + length / 2 - r + r * Math.cos( a ), yc + r * Math.sin( a ) ] );

	}

	for ( let i = 0; i <= steps; i ++ ) {

		const a = Math.PI / 2 + Math.PI * i / steps;
		points.push( [ z0 - length / 2 + r + r * Math.cos( a ), yc + r * Math.sin( a ) ] );

	}

	return points;

}

// A crawler track along z: the steel track round its frame, the idler and sprocket inside the
// ends, bottom rollers and the grousers along the top run.
function crawler( parts, frame, { length, height, width, x, z = 0 } ) {

	const t = Math.min( 0.09, height * 0.14 );
	const shape = new Shape( stadium( z, 0, length, height ).map( ( [ zz, y ] ) => new Vector2( zz, y ) ) );
	shape.holes.push( new Path( stadium( z, t, length - 2 * t, height - 2 * t ).map( ( [ zz, y ] ) => new Vector2( zz, y ) ) ) );
	const geometry = new ExtrudeGeometry( shape, { depth: width, bevelEnabled: false, curveSegments: 4 } );
	geometry.rotateY( - Math.PI / 2 );
	geometry.translate( x + width / 2, 0, 0 );
	parts.add( TRACK(), geometry );
	parts.box( frame, [ width * 0.6, height - 2 * t - 0.1, length - height ], [ x, t + 0.05, z ] );
	const r = height / 2 - t - 0.015;
	for ( const end of [ - 1, 1 ] ) parts.rod( DARK(), [ x - width * 0.4, height / 2, z + end * ( length / 2 - height / 2 ) ], [ x + width * 0.4, height / 2, z + end * ( length / 2 - height / 2 ) ], r, 16 );
	const run = length - height;
	const pitch = Math.max( 0.15, height * 0.25 );
	const shoes = Math.floor( run / pitch );
	for ( let i = 0; i <= shoes; i ++ ) parts.box( TRACK(), [ width, 0.035, pitch * 0.25 ], [ x, height, z - shoes * pitch / 2 + i * pitch ] );

}

// A rubber tyre on its wheel, its axle across x, `radius` above the ground.
function tyre( parts, radius, width, [ x, z ], rim = STEEL() ) {

	parts.rod( RUBBER(), [ x - width / 2, radius, z ], [ x + width / 2, radius, z ], radius, 20 );
	parts.rod( rim, [ x - width / 2 - 0.005, radius, z ], [ x + width / 2 + 0.005, radius, z ], radius * 0.55, 14 );

}

// An operator's seat facing -Z with its cushion top at y.
function seat( parts, [ x, y, z ], width = 0.5 ) {

	parts.box( SEAT(), [ width, 0.1, 0.48 ], [ x, y - 0.1, z ] );
	parts.block( SEAT(), [ width, 0.55, 0.1 ], [ x, y + 0.25, z + 0.24 ], [ - 10 * DEG, 0, 0 ] );

}

// A four-post canopy (ROPS) from y0 to `top` over [ width, length ] centred on (x, z).
function canopy( parts, material, [ width, length ], [ x, y0, z ], top, post = 0.08 ) {

	for ( const sx of [ - 1, 1 ] ) {

		for ( const sz of [ - 1, 1 ] ) parts.box( material, [ post, top - y0 - 0.08, post ], [ x + sx * ( width / 2 - post / 2 ), y0, z + sz * ( length / 2 - post / 2 ) ] );

	}

	parts.box( material, [ width + 0.06, 0.08, length + 0.06 ], [ x, top - 0.08, z ] );

}

// A closed cab of [ width, height, length ] standing at (x, y0, z): panels to `sill`, glass all
// round above with corner posts, and the roof.
function cab( parts, material, [ w, h, l ], [ x, y0, z ], sill = 0.35 ) {

	const low = h * sill;
	parts.box( material, [ w, low, l ], [ x, y0, z ] );
	parts.box( GLASS(), [ w - 0.04, h - low - 0.1, l - 0.04 ], [ x, y0 + low, z ] );
	for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) parts.box( material, [ 0.07, h - low - 0.1, 0.07 ], [ x + sx * ( w / 2 - 0.035 ), y0 + low, z + sz * ( l / 2 - 0.035 ) ] );
	parts.box( material, [ w + 0.08, 0.1, l + 0.08 ], [ x, y0 + h - 0.1, z ] );

}

// Handrails round a rectangle at height y: posts and two rails along each side given (0 front,
// 1 right, 2 back, 3 left).
function railing( parts, [ x0, x1 ], [ z0, z1 ], y, sides = [ 0, 1, 2, 3 ], material = YELLOW(), height = 1.07 ) {

	const corners = [ [ x0, z0 ], [ x1, z0 ], [ x1, z1 ], [ x0, z1 ] ];
	for ( const s of sides ) {

		const [ ax, az ] = corners[ s ];
		const [ bx, bz ] = corners[ ( s + 1 ) % 4 ];
		for ( const h of [ height / 2, height ] ) parts.rod( material, [ ax, y + h, az ], [ bx, y + h, bz ], 0.022, 5 );
		const posts = Math.max( 1, Math.round( Math.hypot( bx - ax, bz - az ) / 1.5 ) );
		for ( let i = 0; i <= posts; i ++ ) {

			const t = i / posts;
			parts.rod( material, [ ax + ( bx - ax ) * t, y, az + ( bz - az ) * t ], [ ax + ( bx - ax ) * t, y + height, az + ( bz - az ) * t ], 0.022, 5 );

		}

	}

}

// A belt or slat conveyor from tail to head: the belt, side frames under its edges, cross
// members, and the drums at each end.
function conveyor( parts, tail, head, width, frame = DARK() ) {

	const a = v( tail );
	const b = v( head );
	const dir = b.clone().sub( a ).normalize();
	const side = new Vector3().crossVectors( dir, UP ).normalize();
	const up = new Vector3().crossVectors( side, dir ).normalize();
	member( parts, BELT(), [ width, 0.05 ], a, b );
	for ( const s of [ - 1, 1 ] ) {

		const off = side.clone().multiplyScalar( s * ( width / 2 + 0.05 ) ).addScaledVector( up, - 0.05 );
		member( parts, frame, [ 0.06, 0.28 ], a.clone().add( off ), b.clone().add( off ) );

	}

	const length = a.distanceTo( b );
	for ( let t = 0.8; t < length - 0.3; t += 1.2 ) {

		const p = a.clone().addScaledVector( dir, t ).addScaledVector( up, - 0.15 );
		parts.rod( frame, p.clone().addScaledVector( side, - width / 2 - 0.08 ).toArray(), p.clone().addScaledVector( side, width / 2 + 0.08 ).toArray(), 0.035, 5 );

	}

	for ( const p of [ a, b ] ) parts.rod( STEEL(), p.clone().addScaledVector( side, - width / 2 ).addScaledVector( up, - 0.08 ).toArray(), p.clone().addScaledVector( side, width / 2 ).addScaledVector( up, - 0.08 ).toArray(), 0.1, 12 );
	return { dir, side, up };

}

// A trailer drawbar: an A-frame from the frame's front corners (x ±half at z0) to the coupler at
// z1, with a jack stand behind the coupler. Its top is at y.
function drawbar( parts, half, z0, z1, y ) {

	for ( const s of [ - 1, 1 ] ) member( parts, DARK(), [ 0.08, 0.1 ], [ s * half, y, z0 ], [ 0, y, z1 + 0.15 ] );
	parts.box( DARK(), [ 0.16, 0.12, 0.3 ], [ 0, y - 0.06, z1 + 0.15 ] );
	parts.cylinder( STEEL(), 0.05, y - 0.06, [ 0, 0, z1 + 0.55 ], 10 );
	parts.box( DARK(), [ 0.18, 0.03, 0.18 ], [ 0, 0, z1 + 0.55 ] );

}

// A ladder up a side at x (rungs along z, centred on z) from y0 to y1.
function ladder( parts, material, [ x, z ], y0, y1, width = 0.42 ) {

	for ( const s of [ - 1, 1 ] ) parts.box( material, [ 0.04, y1 - y0, 0.04 ], [ x, y0, z + s * width / 2 ] );
	for ( let y = y0 + 0.25; y < y1 - 0.1; y += 0.3 ) parts.box( material, [ 0.03, 0.03, width ], [ x, y, z ] );

}

// --- truck chassis -----------------------------------------------------------------------------

const TRUCK_WIDTH = 2.59; // 8 ft 6 in
const R = 0.53; // 11R22.5 tyres

// A conventional-cab truck from its bumper at z = front to the end of its frame at `back`: frame
// rails, the steer axle, `axles` drive axles centred at `rear`, the hood, the cab and its exhaust
// stack. Returns the back of the cab and the top of the frame, where a body goes on.
function truck( parts, { colour, front, rear, back, axles = 2 } ) {

	const body = paint( colour );
	const frameTop = 1.08;

	// Frame rails, bumper, steps and fuel tanks.
	for ( const x of [ - 0.43, 0.43 ] ) parts.box( DARK(), [ 0.1, 0.3, back - front - 0.25 ], [ x, frameTop - 0.3, ( front + back ) / 2 + 0.12 ] );
	parts.box( BRIGHT(), [ TRUCK_WIDTH - 0.1, 0.35, 0.22 ], [ 0, 0.5, front + 0.11 ] );
	for ( const s of [ - 1, 1 ] ) {

		// Fuel tank on its brackets behind the cab, and the step box under the door.
		parts.rod( BRIGHT(), [ s * 0.92, 0.75, front + 4.15 ], [ s * 0.92, 0.75, front + 5.2 ], 0.3, 16 );
		for ( const z of [ front + 4.35, front + 5.0 ] ) parts.box( DARK(), [ 0.5, 0.06, 0.08 ], [ s * 0.7, 1.03, z ] );
		parts.box( DARK(), [ 0.36, 0.8, 0.5 ], [ s * 1.08, 0.5, front + 2.75 ] );
		for ( const y of [ 0.55, 0.92 ] ) parts.box( BRIGHT(), [ 0.04, 0.03, 0.45 ], [ s * 1.27, y, front + 2.75 ] );

	}

	// Wheels: singles on the steer axle, duals behind.
	const steer = front + 1.3;
	parts.rod( DARK(), [ - 0.95, R, steer ], [ 0.95, R, steer ], 0.07, 8 );
	for ( const s of [ - 1, 1 ] ) tyre( parts, R, 0.3, [ s * ( TRUCK_WIDTH / 2 - 0.16 ), steer ], BRIGHT() );
	for ( let i = 0; i < axles; i ++ ) {

		const z = rear + ( i - ( axles - 1 ) / 2 ) * 1.37;
		parts.rod( DARK(), [ - 0.95, R, z ], [ 0.95, R, z ], 0.07, 8 );
		for ( const s of [ - 1, 1 ] ) for ( const d of [ - 0.14, 0.14 ] ) tyre( parts, R, 0.26, [ s * ( TRUCK_WIDTH / 2 - 0.29 ) + d, z ] );

	}

	for ( const s of [ - 1, 1 ] ) parts.box( BLACK(), [ 0.55, 0.65, 0.02 ], [ s * ( TRUCK_WIDTH / 2 - 0.3 ), 0.2, rear + ( axles - 1 ) / 2 * 1.37 + 0.75 ] );

	// Hood with the grille and headlamps, and the fenders over the steer tyres.
	parts.box( body, [ 1.3, 1.3, 2.05 ], [ 0, 0.85, front + 1.27 ] );
	parts.box( BRIGHT(), [ 1.05, 1.15, 0.05 ], [ 0, 0.9, front + 0.23 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( HEADLAMP(), [ 0.22, 0.14, 0.04 ], [ s * 0.98, 1.12, front + 0.62 ] );
		parts.block( body, [ 0.62, 0.08, 0.5 ], [ s * 0.97, 1.08, front + 0.52 ], [ - 0.6, 0, 0 ] );
		parts.box( body, [ 0.62, 0.08, 1.1 ], [ s * 0.97, 1.2, steer + 0.15 ] );
		parts.box( body, [ 0.62, 0.45, 0.06 ], [ s * 0.97, 0.8, steer + 0.67 ] );

	}

	// Cab, glazed above the waist, with mirrors, a beacon bar and the exhaust stack behind it.
	const c0 = front + 2.3;
	const c1 = c0 + 1.75;
	parts.box( body, [ 2.35, 0.95, 1.75 ], [ 0, 1.15, ( c0 + c1 ) / 2 ] );
	parts.box( GLASS(), [ 2.27, 0.75, 1.67 ], [ 0, 2.1, ( c0 + c1 ) / 2 ] );
	for ( const sx of [ - 1, 1 ] ) for ( const z of [ c0 + 0.04, c1 - 0.25 ] ) parts.box( body, [ 0.08, 0.75, z === c0 + 0.04 ? 0.08 : 0.5 ], [ sx * 1.14, 2.1, z ] );
	parts.box( body, [ 2.35, 0.75, 0.06 ], [ 0, 2.1, c1 - 0.03 ] );
	parts.box( body, [ 2.37, 0.2, 1.77 ], [ 0, 2.85, ( c0 + c1 ) / 2 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( DARK(), [ 0.04, 0.34, 0.2 ], [ s * 1.33, 2.2, c0 + 0.1 ] );
		parts.rod( DARK(), [ s * 1.18, 2.4, c0 + 0.1 ], [ s * 1.31, 2.4, c0 + 0.1 ], 0.015, 5 );

	}

	parts.box( AMBER(), [ 0.8, 0.1, 0.14 ], [ 0, 3.05, ( c0 + c1 ) / 2 ] );
	parts.rod( BRIGHT(), [ 0.95, 1.3, c1 + 0.15 ], [ 0.95, 3.35, c1 + 0.15 ], 0.08, 12 );

	return { cabBack: c1, frameTop };

}

// --- pneumatic tyre roller ---------------------------------------------------------------------

// A 9-wheel pneumatic tyre roller of the 12 t ballasted class (about 4.7 m long, 1.9 m wide and
// 3.05 m to the top of its ROPS canopy): four smooth tyres in front and five behind, set so the
// rear ones roll the gaps the front ones leave (1.76 m rolling width), the ballast box between
// them, the water tank and the engine hood over the wheel sets, and the operator's deck with its
// seat and console under the canopy in the middle. Scraper bars and spray bars on the tyres.
function pneumaticRoller() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();
	const steel = STEEL();
	const r = 0.38;
	const w = 0.2;
	const pitch = 0.39;

	// Wheels: four in front, five behind, each set on its axle.
	const front = - 1.6;
	const rear = 1.6;
	for ( let i = 0; i < 4; i ++ ) tyre( parts, r, w, [ ( i - 1.5 ) * pitch, front ], dark );
	for ( let i = 0; i < 5; i ++ ) tyre( parts, r, w, [ ( i - 2 ) * pitch, rear ], dark );
	for ( const z of [ front, rear ] ) parts.rod( steel, [ - 0.95, r, z ], [ 0.95, r, z ], 0.06, 8 );

	// Ballast box between the wheel sets, and the frames over each set with side plates.
	parts.box( body, [ 1.9, 0.75, 2.1 ], [ 0, 0.3, 0 ] );
	parts.box( dark, [ 1.92, 0.05, 2.12 ], [ 0, 0.62, 0 ] );
	for ( const z of [ front, rear ] ) {

		parts.box( body, [ 1.9, 0.3, 1.0 ], [ 0, 0.8, z ] );
		for ( const s of [ - 1, 1 ] ) parts.box( body, [ 0.05, 0.35, 1.0 ], [ s * 0.93, 0.5, z ] );
		// Scraper bars and spray bars on the outer side of each set.
		const e = z < 0 ? - 0.5 : 0.5;
		parts.rod( steel, [ - 0.9, 0.55, z + e ], [ 0.9, 0.55, z + e ], 0.02, 6 );
		parts.rod( BLACK(), [ - 0.85, 0.72, z + e * 0.92 ], [ 0.85, 0.72, z + e * 0.92 ], 0.025, 6 );

	}

	// Water tank over the front set and the engine hood over the back, with louvres and exhaust.
	parts.box( body, [ 1.88, 0.55, 1.35 ], [ 0, 1.1, - 1.65 ] );
	parts.box( dark, [ 1.0, 0.06, 0.4 ], [ 0, 1.65, - 1.9 ] ); // filler lid
	parts.box( body, [ 1.88, 0.8, 1.6 ], [ 0, 1.1, 1.55 ] );
	for ( const s of [ - 1, 1 ] ) for ( let i = 0; i < 6; i ++ ) parts.box( dark, [ 0.012, 0.035, 0.9 ], [ s * 0.945, 1.3 + i * 0.08, 1.7 ] );
	parts.cylinder( dark, 0.05, 0.45, [ 0.6, 1.9, 2.0 ], 10 );

	// Bumpers with lamps at both ends.
	for ( const s of [ - 1, 1 ] ) {

		parts.box( dark, [ 1.9, 0.18, 0.12 ], [ 0, 0.95, s * 2.32 ] );
		for ( const x of [ - 0.75, 0.75 ] ) parts.box( s < 0 ? HEADLAMP() : RED_LAMP(), [ 0.14, 0.08, 0.02 ], [ x, 1.0, s * 2.39 ] );

	}

	// Operator's deck between the hoods: steering column and wheel, the seat, console and canopy.
	const deck = 1.25;
	parts.box( dark, [ 1.9, 0.06, 1.0 ], [ 0, deck - 0.06, - 0.47 ] );
	parts.box( body, [ 1.9, deck - 1.1 - 0.06, 1.0 ], [ 0, 1.1, - 0.47 ] );
	parts.block( dark, [ 0.12, 0.65, 0.12 ], [ 0, deck + 0.3, - 0.82 ], [ 0.35, 0, 0 ] );
	parts.rod( dark, [ - 0.2, deck + 0.68, - 0.72 ], [ 0.2, deck + 0.68, - 0.72 ], 0.02, 6 );
	parts.cylinder( dark, 0.2, 0.03, [ 0, deck + 0.66, - 0.72 ], 16 );
	parts.box( dark, [ 0.12, 0.35, 0.12 ], [ 0, deck, - 0.3 ] );
	seat( parts, [ 0, deck + 0.45, - 0.3 ] );
	parts.box( dark, [ 0.18, 0.55, 0.3 ], [ 0.55, deck, - 0.5 ] );
	canopy( parts, dark, [ 1.8, 1.25 ], [ 0, deck, - 0.35 ], 3.05, 0.07 );
	parts.sphere( AMBER(), 0.07, [ 0, 3.1, 0.15 ] );

	return parts.build();

}

// --- padfoot compactor -------------------------------------------------------------------------

// An 84 in single-drum padfoot soil compactor of the 11 t class (about 5.9 m long, 2.3 m wide and
// 3.1 m to the top of the cab): the drum covered in rows of square pads in a yoke at the front with
// scrapers between the pads, the articulation hitch, and the tractor behind on two big lugged
// tyres with the cab over its front and the engine hood at the back.
function padfootCompactor() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();
	const steel = STEEL();
	const drumWidth = 84 * IN;
	const drumR = 0.73;
	const pad = 0.1;
	const axle = drumR + pad;
	const dz = - 1.95;

	// The drum, its pads (staggered row to row) and the end discs.
	parts.rod( steel, [ - drumWidth / 2, axle, dz ], [ drumWidth / 2, axle, dz ], drumR, 28 );
	const around = 20;
	const across = 9;
	for ( let j = 0; j < across; j ++ ) {

		const x = - drumWidth / 2 + ( j + 0.5 ) * drumWidth / across;
		for ( let i = 0; i < around; i ++ ) {

			const a = ( i + ( j % 2 ) * 0.5 ) / around * Math.PI * 2;
			const rr = drumR + pad / 2;
			parts.block( steel, [ 0.12, pad, 0.12 ], [ x, axle + Math.sin( a ) * rr, dz + Math.cos( a ) * rr ], [ a - Math.PI / 2, 0, 0 ] );

		}

	}

	for ( const s of [ - 1, 1 ] ) parts.rod( dark, [ s * ( drumWidth / 2 - 0.01 ), axle, dz ], [ s * ( drumWidth / 2 + 0.02 ), axle, dz ], 0.35, 14 );

	// The yoke: side plates either side of the drum, the cross frame over it and the scraper bars.
	for ( const s of [ - 1, 1 ] ) {

		parts.box( body, [ 0.08, 0.9, 1.1 ], [ s * ( drumWidth / 2 + 0.07 ), axle - 0.25, dz ] );
		parts.box( body, [ 0.08, 0.3, 2.3 ], [ s * ( drumWidth / 2 + 0.07 ), axle + 0.6, dz + 0.35 ] );

	}

	parts.box( body, [ drumWidth + 0.22, 0.25, 0.5 ], [ 0, axle + 0.65, dz - 0.65 ] );
	parts.box( body, [ drumWidth + 0.22, 0.25, 0.5 ], [ 0, axle + 0.65, dz + 0.65 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( steel, [ drumWidth, 0.06, 0.12 ], [ 0, axle + 0.5, dz + s * ( axle + 0.06 ) * 0.62 ] );
	for ( const x of [ - 0.8, 0.8 ] ) parts.box( HEADLAMP(), [ 0.18, 0.1, 0.03 ], [ x, axle + 0.75, dz - 0.92 ] );

	// Articulation hitch between the drum frame and the tractor.
	parts.box( dark, [ 0.9, 0.55, 0.9 ], [ 0, 0.7, - 0.85 ] );
	parts.cylinder( steel, 0.12, 0.7, [ 0, 0.62, - 0.85 ], 12 );

	// Tractor: the frame, two big lugged tyres and fenders over them.
	const tz = 1.65;
	const tr = 0.8;
	parts.box( dark, [ 1.0, 0.7, 3.2 ], [ 0, 0.55, 1.15 ] );
	for ( const s of [ - 1, 1 ] ) {

		tyre( parts, tr, 0.6, [ s * 0.85, tz ], body );
		for ( let i = 0; i < 18; i ++ ) {

			const a = i / 18 * Math.PI * 2;
			parts.block( RUBBER(), [ 0.55, 0.04, 0.08 ], [ s * 0.85, tr + Math.sin( a ) * tr, tz + Math.cos( a ) * tr ], [ a + Math.PI / 2, 0, 0 ] );

		}

		parts.box( body, [ 0.66, 0.06, 1.9 ], [ s * 0.85, 1.68, tz ] );
		parts.box( body, [ 0.66, 0.35, 0.06 ], [ s * 0.85, 1.33, tz - 0.95 ] );

	}

	// Engine hood behind the cab, its grille at the back, louvres and the exhaust.
	parts.box( body, [ 1.5, 1.0, 2.05 ], [ 0, 1.15, 1.85 ] );
	parts.box( dark, [ 1.3, 0.75, 0.05 ], [ 0, 1.25, 2.88 ] );
	for ( let i = 0; i < 7; i ++ ) parts.box( steel, [ 1.26, 0.03, 0.02 ], [ 0, 1.3 + i * 0.1, 2.91 ] );
	for ( const s of [ - 1, 1 ] ) for ( let i = 0; i < 6; i ++ ) parts.box( dark, [ 0.012, 0.035, 1.1 ], [ s * 0.755, 1.4 + i * 0.08, 2.0 ] );
	parts.cylinder( dark, 0.06, 0.5, [ 0.45, 2.15, 1.4 ], 10 );
	for ( const x of [ - 0.6, 0.6 ] ) parts.box( RED_LAMP(), [ 0.12, 0.08, 0.02 ], [ x, 1.95, 2.89 ] );

	// Cab over the front of the tractor, on a deck reaching out over the fenders, and its steps.
	parts.box( body, [ 1.6, 0.55, 1.6 ], [ 0, 0.9, 0.05 ] );
	parts.box( dark, [ 2.0, 0.06, 1.6 ], [ 0, 1.45, 0.05 ] );
	cab( parts, body, [ 1.6, 1.6, 1.5 ], [ 0, 1.5, 0.05 ] );
	for ( let i = 0; i < 3; i ++ ) parts.box( steel, [ 0.4, 0.03, 0.2 ], [ - 0.95, 0.45 + i * 0.33, - 0.55 ] );
	parts.sphere( AMBER(), 0.07, [ 0.5, 3.15, 0.4 ] );

	return parts.build();

}

// --- tandem asphalt roller ---------------------------------------------------------------------

// A 13 t tandem vibratory asphalt roller with 67 in drums (about 4.9 m long, 1.86 m wide and 3.1 m
// to the top of its ROPS canopy): a smooth steel drum at each end in its frame, with spray bars and
// scrapers, the water tank over the front drum and the engine over the back, the articulation in
// the middle and the operator's deck over it with the seat and console under the canopy.
function tandemRoller() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();
	const steel = STEEL();
	const drumWidth = 67 * IN;
	const r = 0.65;
	const ends = [ - 1.75, 1.75 ];

	for ( const z of ends ) {

		// The drum, its end hubs and the frame round it.
		parts.rod( BRIGHT(), [ - drumWidth / 2, r, z ], [ drumWidth / 2, r, z ], r, 32 );
		for ( const s of [ - 1, 1 ] ) {

			parts.rod( dark, [ s * drumWidth / 2, r, z ], [ s * ( drumWidth / 2 + 0.04 ), r, z ], 0.3, 14 );
			parts.box( body, [ 0.06, 0.95, 1.3 ], [ s * ( drumWidth / 2 + 0.06 ), r - 0.3, z ] );

		}

		// Spray bar and scraper on the outer face of the drum.
		const e = z < 0 ? - 1 : 1;
		parts.rod( BLACK(), [ - 0.82, r + 0.45, z + e * 0.55 ], [ 0.82, r + 0.45, z + e * 0.55 ], 0.025, 6 );
		parts.block( dark, [ drumWidth, 0.04, 0.2 ], [ 0, r + 0.15, z + e * ( r + 0.05 ) ], [ e * 0.6, 0, 0 ] );

	}

	// Water tank over the front drum and engine hood over the back, rounded off with lamps.
	parts.box( body, [ 1.82, 0.65, 1.6 ], [ 0, r + 0.65, - 1.65 ] );
	parts.box( body, [ 1.82, 0.25, 0.5 ], [ 0, r + 0.65, - 2.25 ] );
	parts.box( body, [ 1.82, 0.85, 1.7 ], [ 0, r + 0.65, 1.6 ] );
	for ( const s of [ - 1, 1 ] ) for ( let i = 0; i < 7; i ++ ) parts.box( dark, [ 0.012, 0.035, 1.0 ], [ s * 0.915, r + 0.8 + i * 0.08, 1.7 ] );
	parts.cylinder( dark, 0.05, 0.5, [ 0.6, r + 1.5, 2.1 ], 10 );
	for ( const x of [ - 0.7, 0.7 ] ) {

		parts.box( HEADLAMP(), [ 0.16, 0.1, 0.03 ], [ x, r + 1.05, - 2.46 ] );
		parts.box( RED_LAMP(), [ 0.14, 0.08, 0.03 ], [ x, r + 1.25, 2.46 ] );

	}

	// The middle: the articulation joint low down, the deck over it with steps each side.
	parts.box( dark, [ 0.8, 0.6, 0.9 ], [ 0, 0.45, 0 ] );
	parts.box( body, [ 1.82, 0.5, 1.2 ], [ 0, 1.05, 0 ] );
	const deck = 1.6;
	parts.box( dark, [ 1.86, 0.05, 1.3 ], [ 0, deck - 0.05, 0 ] );
	for ( const s of [ - 1, 1 ] ) for ( let i = 0; i < 2; i ++ ) parts.box( steel, [ 0.14, 0.03, 0.4 ], [ s * 0.93, 0.6 + i * 0.45, 0 ] );

	// Operator's station: the seat on a console that slides side to side, steering, canopy.
	parts.box( dark, [ 0.7, 0.3, 0.5 ], [ - 0.2, deck, 0.2 ] );
	seat( parts, [ - 0.2, deck + 0.45, 0.2 ] );
	parts.block( dark, [ 0.12, 0.7, 0.12 ], [ - 0.2, deck + 0.35, - 0.3 ], [ 0.35, 0, 0 ] );
	parts.cylinder( dark, 0.18, 0.03, [ - 0.2, deck + 0.7, - 0.42 ], 16 );
	parts.box( dark, [ 0.2, 0.6, 0.3 ], [ 0.45, deck, 0.1 ] );
	canopy( parts, dark, [ 1.75, 1.3 ], [ 0, deck, 0 ], 3.1, 0.07 );
	parts.sphere( AMBER(), 0.07, [ 0, 3.15, 0.5 ] );

	return parts.build();

}

// --- asphalt distributor truck -----------------------------------------------------------------

// A 4,000 gal asphalt distributor on a tandem truck (about 10.4 m long and 3.66 m over the spray
// bar): the insulated elliptical tank clad in aluminium with its banding, manway and walkway,
// the burner flues at the back, and the rear platform with the operator's controls over the
// circulating spray bar, its folding wings set out to spray 12 ft, and the hand wand on its reel.
function distributorTruck() {

	const parts = new Parts();
	const steel = STEEL();
	const dark = DARK();
	const front = - 5.2;
	const back = 4.25;
	const { cabBack, frameTop } = truck( parts, { colour: 0xe9e8e2, front, rear: 2.9, back } );

	// Subframe and the tank on its saddles, bands round it, the manway and walkway on top.
	const t0 = cabBack + 0.25;
	const t1 = 3.7;
	const tw = 2.35;
	const th = 1.5;
	const ty = frameTop + 0.2;
	parts.box( dark, [ 1.1, 0.2, t1 - t0 + 0.3 ], [ 0, frameTop, ( t0 + t1 ) / 2 ] );
	alongZ( parts, STAINLESS(), ellipse( tw, th, ty ), t0, t1 );
	for ( let z = t0 + 0.3; z < t1 - 0.1; z += 0.9 ) alongZ( parts, BRIGHT(), ellipse( tw + 0.03, th + 0.03, ty - 0.015 ), z, z + 0.06 );
	for ( const z of [ t0 - 0.03, t1 ] ) alongZ( parts, BRIGHT(), ellipse( tw - 0.1, th - 0.08, ty + 0.04 ), z, z + 0.03 );
	for ( const z of [ t0 + 0.6, t1 - 0.6 ] ) parts.box( dark, [ 1.6, 0.25, 0.2 ], [ 0, frameTop + 0.05, z ] );
	const top = ty + th;
	parts.cylinder( BRIGHT(), 0.28, 0.25, [ 0, top - 0.05, ( t0 + t1 ) / 2 ], 16 );
	parts.box( dark, [ 0.6, 0.04, t1 - t0 - 0.4 ], [ 0, top, ( t0 + t1 ) / 2 ] );
	for ( const s of [ - 1, 1 ] ) parts.path( YELLOW(), [ [ s * 0.3, top, t0 + 0.4 ], [ s * 0.3, top + 0.6, t0 + 0.4 ], [ s * 0.3, top + 0.6, t1 - 0.4 ], [ s * 0.3, top, t1 - 0.4 ] ], 0.02, 6 );
	for ( let i = 0; i < 5; i ++ ) parts.box( steel, [ 0.4, 0.03, 0.06 ], [ - 0.85, 1.25 + i * 0.32, t1 + 0.08 ] ); // ladder up the back

	// Burner flues out of the top at the back.
	for ( const x of [ - 0.5, 0.5 ] ) parts.cylinder( dark, 0.09, 0.45, [ x, top - 0.15, t1 - 0.35 ], 10 );

	// Rear platform: deck, guardrail, the control box and the pump / valve housing under it.
	const deck = 1.05;
	parts.box( dark, [ TRUCK_WIDTH - 0.1, 0.05, back - t1 + 0.1 ], [ 0, deck, ( t1 + back ) / 2 + 0.05 ] );
	railing( parts, [ - 1.2, 1.2 ], [ t1 + 0.05, back + 0.05 ], deck + 0.05, [ 1, 2, 3 ], YELLOW(), 1.0 );
	parts.box( dark, [ 0.6, 0.7, 0.25 ], [ 0.75, deck + 0.05, t1 + 0.2 ] );
	parts.box( AMBER(), [ 0.12, 0.08, 0.02 ], [ 0.75, deck + 0.6, t1 + 0.33 ] );
	parts.box( steel, [ 1.2, 0.45, 0.55 ], [ 0, 0.55, t1 + 0.1 ] );
	for ( const x of [ - 1.1, 1.1 ] ) parts.box( RED_LAMP(), [ 0.16, 0.1, 0.03 ], [ x, deck - 0.12, back + 0.12 ] );

	// Spray bar: the centre bar on hangers under the back, the wings out each side, nozzles down
	// its length every 4 in, and the hand wand hose reel on the right.
	const barZ = back + 0.3;
	const barY = 0.35;
	const half = 6 * FT;
	for ( const x of [ - 0.8, 0.8 ] ) parts.box( dark, [ 0.08, deck - barY, 0.08 ], [ x, barY, barZ - 0.05 ] );
	parts.rod( steel, [ - half, barY, barZ ], [ half, barY, barZ ], 0.05, 8 );
	parts.rod( dark, [ - half, barY + 0.1, barZ + 0.05 ], [ half, barY + 0.1, barZ + 0.05 ], 0.03, 6 );
	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.05, 0.25, 0.12 ], [ s * 1.25, barY - 0.05, barZ ] ); // wing hinges
	for ( let x = - half + 0.05; x <= half - 0.04; x += 4 * IN ) parts.rod( BRIGHT(), [ x, barY - 0.04, barZ ], [ x, barY - 0.1, barZ ], 0.012, 5 );
	parts.rod( dark, [ 1.0, 1.55, t1 + 0.3 ], [ 1.25, 1.55, t1 + 0.3 ], 0.2, 14 );
	parts.path( BLACK(), [ [ 1.27, 1.45, t1 + 0.3 ], [ 1.3, 0.9, t1 + 0.4 ], [ 1.3, 0.5, back ] ], 0.02, 6 );

	return parts.build();

}

// --- chip spreader -----------------------------------------------------------------------------

// A self-propelled chip spreader (about 8 m long, 2.6 m wide over the tyres and 3.5 m to the cab
// roof): the aggregate trucks back onto the receiving hopper at the back and are towed along on its
// hitch, two belt conveyors carry the chips forward and up over the machine and drop them into the
// 12.5 ft spread hopper across the front, which lays them on the fresh emulsion. The operator's cab
// sits high at the front over the hopper; the engine and hydraulic tank either side behind it.
function chipSpreader() {

	const parts = new Parts();
	const body = paint( 0xe35f1c );
	const dark = DARK();
	const steel = STEEL();
	const spread = 12.5 * FT;

	// Four tyres and the main frame between them, fenders over the tyres.
	const r = 0.62;
	for ( const z of [ - 1.6, 2.05 ] ) {

		for ( const s of [ - 1, 1 ] ) {

			tyre( parts, r, 0.45, [ s * 1.07, z ], steel );
			parts.box( body, [ 0.5, 0.05, 1.45 ], [ s * 1.07, 1.32, z ] );

		}

	}

	parts.box( dark, [ 1.5, 0.5, 4.9 ], [ 0, 0.55, 0.45 ] );

	// Receiving hopper at the back: the floor, sloped sides and the hitch for the truck.
	const h0 = 2.85;
	const h1 = 4.0;
	parts.box( dark, [ 2.55, 0.06, h1 - h0 ], [ 0, 0.45, ( h0 + h1 ) / 2 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.block( body, [ 0.7, 0.04, h1 - h0 ], [ s * 0.95, 0.75, ( h0 + h1 ) / 2 ], [ 0, 0, s * 0.75 ] );
		parts.box( body, [ 0.05, 0.5, h1 - h0 ], [ s * 1.27, 0.65, ( h0 + h1 ) / 2 ] );

	}

	parts.box( body, [ 2.55, 0.65, 0.06 ], [ 0, 0.45, h0 ] );
	parts.box( steel, [ 2.4, 0.15, 0.15 ], [ 0, 0.3, h1 ] );
	parts.box( dark, [ 0.25, 0.2, 0.4 ], [ 0, 0.35, h1 + 0.15 ] ); // truck hitch
	for ( const x of [ - 1.15, 1.15 ] ) parts.box( RED_LAMP(), [ 0.14, 0.08, 0.02 ], [ x, 1.12, h1 - 0.02 ] );

	// Two conveyors from the hopper forward over the machine, dropping into the spread hopper.
	for ( const x of [ - 0.45, 0.45 ] ) conveyor( parts, [ x, 0.62, 3.75 ], [ x, 2.05, - 2.1 ], 0.7, body );
	for ( const s of [ - 1, 1 ] ) parts.box( body, [ 0.1, 1.5, 0.1 ], [ s * 0.95, 0.75, - 1.8 ] );

	// Spread hopper across the front: a V-shaped trough with the spread roll under it and gates.
	const sz = - 2.65;
	const trough = [ [ - 0.12, 0.3 ], [ 0.12, 0.3 ], [ 0.5, 1.15 ], [ 0.45, 1.2 ], [ 0.08, 0.37 ], [ - 0.08, 0.37 ], [ - 0.45, 1.2 ], [ - 0.5, 1.15 ] ];
	parts.prism( body, trough.map( ( [ z, y ] ) => [ sz + z, y ] ), spread );
	for ( const s of [ - 1, 1 ] ) parts.box( body, [ 0.05, 0.9, 1.0 ], [ s * spread / 2, 0.3, sz ] );
	parts.rod( dark, [ - spread / 2 + 0.05, 0.25, sz ], [ spread / 2 - 0.05, 0.25, sz ], 0.1, 12 );
	for ( const s of [ - 1, 1 ] ) member( parts, dark, [ 0.12, 0.15 ], [ s * 0.75, 0.75, - 1.9 ], [ s * 0.75, 0.9, sz + 0.35 ] );

	// Engine on the right and hydraulic tank on the left behind the cab, with the exhaust.
	parts.box( body, [ 0.45, 1.0, 2.3 ], [ 1.12, 1.0, 0.4 ] );
	parts.box( body, [ 0.4, 0.8, 1.6 ], [ - 1.1, 1.0, 0.6 ] );
	for ( let i = 0; i < 6; i ++ ) parts.box( dark, [ 0.012, 0.035, 1.2 ], [ 1.35, 1.25 + i * 0.09, 0.4 ] );
	parts.cylinder( dark, 0.06, 0.7, [ 1.12, 2.0, 1.2 ], 10 );

	// Cab high at the front on a platform over the conveyors, with its ladder.
	const deck = 2.15;
	parts.box( dark, [ 2.5, 0.08, 1.7 ], [ 0, deck - 0.08, - 1.35 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( body, [ 0.12, deck - 1.32, 0.12 ], [ s * 1.18, 1.32, - 1.35 ] );
	cab( parts, body, [ 1.7, 1.38, 1.5 ], [ - 0.2, deck, - 1.35 ] );
	railing( parts, [ - 1.24, 1.24 ], [ - 2.2, - 0.5 ], deck, [ 1, 2 ], dark, 0.9 );
	ladder( parts, steel, [ - 1.35, - 0.35 ], 0.3, deck );
	parts.sphere( AMBER(), 0.08, [ 0.5, deck + 1.43, - 1.0 ] );
	for ( const x of [ - 0.7, 0.3 ] ) parts.box( HEADLAMP(), [ 0.16, 0.1, 0.03 ], [ x, deck + 1.2, - 2.12 ] );

	return parts.build();

}

// --- material transfer vehicle -----------------------------------------------------------------

// A material transfer vehicle of the Roadtec Shuttle Buggy class (about 15.5 m long with its
// conveyor, 3.1 m wide and 4.1 m high): trucks dump into the low hopper at the front, a slat
// conveyor lifts the mix up into the 25 t remixing surge bin in the middle, and a second conveyor
// carries it from the bin up and out the back on a swinging conveyor, angled down to drop into
// the paver's hopper behind. The cab sits on the left at the back, the engine on the right.
function transferVehicle() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();
	const steel = STEEL();
	const W = 3.1;

	// Big tyres front and back, fenders, and the main frame.
	const r = 0.8;
	for ( const z of [ - 4.3, 2.6 ] ) {

		for ( const s of [ - 1, 1 ] ) {

			tyre( parts, r, 0.65, [ s * 1.2, z ], body );
			parts.box( body, [ 0.75, 0.06, 1.9 ], [ s * 1.2, 1.72, z ] );

		}

	}

	parts.box( dark, [ 1.6, 0.7, 9.2 ], [ 0, 0.75, - 1.0 ] );

	// Truck hopper at the front with its push rollers, and the slat conveyor rising to the bin top.
	const f0 = - 7.7;
	const f1 = - 5.5;
	parts.box( dark, [ 1.0, 0.06, f1 - f0 ], [ 0, 0.38, ( f0 + f1 ) / 2 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.block( body, [ 1.15, 0.04, f1 - f0 ], [ s * 1.0, 0.62, ( f0 + f1 ) / 2 ], [ 0, 0, s * 0.45 ] );
		parts.box( body, [ 0.05, 0.6, f1 - f0 ], [ s * W / 2, 0.55, ( f0 + f1 ) / 2 ] );
		parts.rod( dark, [ s * 0.9 - 0.3, 0.5, f0 - 0.05 ], [ s * 0.9 + 0.3, 0.5, f0 - 0.05 ], 0.12, 14 );

	}

	parts.box( body, [ W, 0.3, 0.06 ], [ 0, 0.25, f0 + 0.02 ] );
	const lift = 34 * DEG;
	const liftEnd = [ 0, 3.75, - 2.2 ];
	const liftStart = [ 0, 0.55, liftEnd[ 2 ] - ( liftEnd[ 1 ] - 0.55 ) / Math.tan( lift ) ];
	conveyor( parts, liftStart, liftEnd, 1.0, body );
	member( parts, body, [ 1.25, 0.4 ], [ 0, liftStart[ 1 ] + 0.3, liftStart[ 2 ] ], [ 0, liftEnd[ 1 ] + 0.3, liftEnd[ 2 ] ] ); // its cover
	for ( const s of [ - 1, 1 ] ) member( parts, body, [ 0.15, 0.2 ], [ s * 0.55, 1.1, - 4.3 ], [ s * 0.55, 2.6, - 4.0 ] );

	// Surge bin: wider at the top, with its lid, the remixing auger drive and a walkway along it.
	const b0 = - 2.6;
	const b1 = 1.4;
	alongZ( parts, body, [ [ - 0.8, 1.1 ], [ 0.8, 1.1 ], [ 1.5, 2.4 ], [ 1.5, 3.65 ], [ - 1.5, 3.65 ], [ - 1.5, 2.4 ] ], b0, b1 );
	parts.box( dark, [ 3.05, 0.06, b1 - b0 + 0.05 ], [ 0, 3.65, ( b0 + b1 ) / 2 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.03, 0.06, b1 - b0 ], [ s * 1.52, 2.4, ( b0 + b1 ) / 2 ] );
	parts.box( dark, [ 0.5, 0.5, 0.4 ], [ 0, 1.0, b1 + 0.2 ] );

	// Engine housing on the right behind the bin, cab on the left, ladder up between.
	parts.box( body, [ 1.0, 1.15, 2.4 ], [ 1.0, 1.1, 2.7 ] );
	for ( let i = 0; i < 7; i ++ ) parts.box( dark, [ 0.012, 0.035, 1.4 ], [ 1.505, 1.4 + i * 0.09, 2.8 ] );
	parts.cylinder( dark, 0.07, 0.85, [ 1.15, 2.25, 3.4 ], 10 );
	parts.box( body, [ 1.3, 0.85, 2.0 ], [ - 0.9, 1.1, 2.6 ] );
	cab( parts, body, [ 1.35, 1.7, 1.6 ], [ - 0.85, 1.95, 2.5 ] );
	ladder( parts, steel, [ - 1.58, 1.4 ], 0.35, 1.95 );
	parts.sphere( AMBER(), 0.08, [ - 0.85, 3.72, 3.0 ] );
	for ( const x of [ - 1.3, 1.3 ] ) parts.box( HEADLAMP(), [ 0.16, 0.1, 0.03 ], [ x, 3.3, b0 - 0.02 ] );

	// Discharge: a conveyor from under the bin up between the cab and engine to the swing turret,
	// then the swinging conveyor out the back, sloping down to drop into the paver's hopper.
	const turret = [ 0.12, 3.15, 3.9 ];
	conveyor( parts, [ 0.12, 1.55, b1 - 0.2 ], turret, 0.6, body );
	parts.cylinder( dark, 0.45, 0.3, [ turret[ 0 ], turret[ 1 ] - 0.45, turret[ 2 ] ], 16 );
	const tip = [ 0.12, 2.75, 7.45 ];
	conveyor( parts, [ turret[ 0 ], turret[ 1 ] + 0.05, turret[ 2 ] + 0.2 ], tip, 0.6, body );
	parts.box( body, [ 0.8, 0.55, 0.5 ], [ tip[ 0 ], tip[ 1 ] - 0.45, tip[ 2 ] + 0.05 ] ); // discharge chute
	for ( const s of [ - 1, 1 ] ) parts.rod( dark, [ s * 0.6, 3.2, 3.3 ], [ s * 0.35 + 0.12, 3.1, 5.6 ], 0.03, 6 ); // support ties

	return parts.build();

}

// --- slipform curb and gutter machine ----------------------------------------------------------

// A three-track slipform curb machine of the Gomaco GT-3600 class (about 6.3 m long, 3.3 m wide and
// 2.9 m high): two tracks at the front and one behind on the left, each on a telescoping leg up to
// the frame, the power unit and operator's platform on the left, the charging conveyor carrying
// concrete from the mixer at the front back up into the hopper over the 30 in curb and gutter
// mould on the right, and a short length of fresh curb coming out behind it. Stringline sensor
// arms reach out on the right.
function curbMachine() {

	const parts = new Parts();
	const body = paint( 0xe9e8e2 );
	const trim = paint( 0x5a5f63 );
	const dark = DARK();
	const steel = STEEL();
	const frameY = 1.35;

	// Tracks and the telescoping legs up to the frame.
	const tracks = [ [ - 1.25, - 1.75 ], [ 1.3, - 1.75 ], [ - 1.25, 1.95 ] ];
	for ( const [ x, z ] of tracks ) {

		crawler( parts, trim, { length: 1.45, height: 0.55, width: 0.3, x, z } );
		parts.box( steel, [ 0.2, 0.75, 0.2 ], [ x, 0.55, z ] );
		parts.box( body, [ 0.3, 0.6, 0.3 ], [ x, 0.95, z ] );

	}

	// Frame: side members and cross members, a box section, around the machine.
	parts.box( body, [ 0.3, 0.3, 3.9 ], [ - 1.25, frameY, 0.1 ] );
	parts.box( body, [ 0.3, 0.3, 1.0 ], [ 1.3, frameY, - 1.75 ] );
	parts.box( body, [ 2.85, 0.3, 0.3 ], [ 0.02, frameY, - 1.75 ] );
	parts.box( body, [ 2.4, 0.3, 0.3 ], [ - 0.05, frameY, 0.95 ] );
	member( parts, body, [ 0.25, 0.25 ], [ 1.15, frameY + 0.15, 0.95 ], [ 1.15, frameY + 0.15, - 1.6 ] );

	// Power unit on the left middle with louvres and exhaust, and the operator's platform behind.
	parts.box( body, [ 1.3, 0.95, 1.7 ], [ - 0.55, frameY + 0.3, - 0.4 ] );
	for ( let i = 0; i < 6; i ++ ) parts.box( dark, [ 0.012, 0.035, 1.1 ], [ - 1.205, frameY + 0.5 + i * 0.08, - 0.4 ] );
	parts.cylinder( dark, 0.05, 0.45, [ - 0.3, frameY + 1.25, - 0.9 ], 10 );
	const deck = frameY + 0.3;
	parts.box( dark, [ 1.4, 0.05, 1.2 ], [ - 0.75, deck - 0.05, 1.5 ] );
	parts.box( dark, [ 0.6, 0.85, 0.25 ], [ - 0.75, deck, 0.95 ] );
	parts.block( dark, [ 0.6, 0.06, 0.35 ], [ - 0.75, deck + 0.9, 1.0 ], [ 0.4, 0, 0 ] );
	seat( parts, [ - 0.75, deck + 0.45, 1.6 ] );
	parts.box( dark, [ 0.12, 0.35, 0.12 ], [ - 0.75, deck, 1.6 ] );
	railing( parts, [ - 1.45, - 0.05 ], [ 0.9, 2.1 ], deck, [ 1, 2 ], dark, 1.0 );
	parts.sphere( AMBER(), 0.07, [ - 1.0, frameY + 1.3, 0.25 ] );

	// Mould on the right, behind the front track: the steel mould box on the ground with the
	// curb shape's side plate, the hopper on top, and vibrator leads into it.
	const mx = 1.1;
	const m0 = - 0.45;
	const m1 = 0.75;
	parts.box( steel, [ 0.82, 0.55, m1 - m0 ], [ mx, 0, ( m0 + m1 ) / 2 ] );
	alongZ( parts, BRIGHT(), [ [ mx - 0.42, 0.55 ], [ mx + 0.42, 0.55 ], [ mx + 0.55, 1.15 ], [ mx - 0.55, 1.15 ] ], m0 + 0.1, m1 - 0.1 );
	for ( const s of [ - 1, 1 ] ) parts.box( body, [ 0.12, frameY - 1.15, 0.12 ], [ mx + s * 0.4, 1.15, ( m0 + m1 ) / 2 ] );
	for ( let i = 0; i < 3; i ++ ) parts.path( BLACK(), [ [ mx - 0.2 + i * 0.2, 1.15, m0 + 0.3 ], [ mx - 0.2 + i * 0.2, 1.55, m0 + 0.1 ], [ 0.2, frameY + 0.3, - 0.4 ] ], 0.015, 5, false );

	// Fresh curb and gutter behind the mould (30 in: a 24 in gutter pan and the 6 in curb, 18 in
	// high at the back of the curb, on the outer side).
	const c = mx - 0.38;
	alongZ( parts, CONCRETE(), [ [ c, 0 ], [ c + 0.762, 0 ], [ c + 0.762, 0.46 ], [ c + 0.64, 0.46 ], [ c + 0.61, 0.2 ], [ c, 0.17 ] ], m1, 2.6 );

	// Charging conveyor from its receiving hopper at the front up into the mould hopper.
	const tail = [ 0.35, 0.6, - 3.0 ];
	const head = [ mx, 1.85, 0.1 ];
	conveyor( parts, tail, head, 0.45, body );
	parts.box( body, [ 0.8, 0.45, 0.7 ], [ tail[ 0 ], 0.55, tail[ 2 ] - 0.05 ] );
	member( parts, body, [ 0.12, 0.12 ], [ 0.6, frameY, - 1.75 ], [ 0.62, 1.12, - 1.6 ] );

	// Stringline sensor arms out on the right, front and back, with their wands.
	for ( const [ from, z ] of [ [ [ 1.3, 0.9, - 1.75 ], - 2.2 ], [ [ mx + 0.45, 0.9, m1 - 0.1 ], 2.0 ] ] ) {

		parts.path( steel, [ from, [ 2.05, 0.9, z ] ], 0.03, 6 );
		parts.box( dark, [ 0.1, 0.18, 0.1 ], [ 2.05, 0.75, z ] );
		parts.rod( dark, [ 2.05, 0.75, z ], [ 2.05, 0.55, z - 0.25 ], 0.008, 4 );

	}

	return parts.build();

}

// --- concrete slipform paver -------------------------------------------------------------------

// A two-track concrete slipform paver set up to pave 28 ft (8.5 m), about 10.3 m wide over the
// tracks, 7 m long and 3.6 m to its railings: a long track each side on legs up to the
// telescoping main frame, the spreader auger across the front with the vibrators hanging behind it,
// the profile pan and side forms under the frame, the power unit on top in the middle and the
// operator's console on the left, a walkway along the front, and the oscillating correcting beam
// and finishing float trailing at the back.
function slipformPaver() {

	const parts = new Parts();
	const body = paint( 0xe9e8e2 );
	const trim = paint( 0x5a5f63 );
	const dark = DARK();
	const steel = STEEL();
	const half = SLAB / 2;
	const tx = half + 0.55;
	const frameY = 2.0;

	// Tracks and their legs (front and back on each side), with the pivot arms out to them.
	for ( const s of [ - 1, 1 ] ) {

		crawler( parts, trim, { length: 3.9, height: 0.95, width: 0.6, x: s * tx, z: 0.3 } );
		for ( const z of [ - 0.9, 1.5 ] ) {

			parts.cylinder( steel, 0.15, frameY - 0.95, [ s * tx, 0.95, z ], 14 );
			parts.cylinder( body, 0.22, 0.8, [ s * tx, frameY - 0.6, z ], 14 );
			member( parts, body, [ 0.3, 0.35 ], [ s * ( half - 0.2 ), frameY + 0.1, z ], [ s * tx, frameY + 0.1, z ] );

		}

	}

	// Main frame: front and back beams the full width (telescoped out) and the side beams.
	for ( const z of [ - 0.9, 1.5 ] ) parts.box( body, [ SLAB - 0.2, 0.55, 0.45 ], [ 0, frameY - 0.2, z ] );
	for ( const s of [ - 1, 1 ] ) parts.box( body, [ 0.4, 0.55, 2.85 ], [ s * ( half - 0.3 ), frameY - 0.2, 0.3 ] );
	parts.box( dark, [ SLAB - 0.4, 0.04, 2.0 ], [ 0, frameY + 0.32, 0.3 ] ); // walk deck between

	// Under the frame: the profile pan and the side forms, on hangers.
	parts.box( steel, [ SLAB, 0.25, 2.2 ], [ 0, 0, 0.4 ] );
	parts.box( dark, [ SLAB - 0.1, 0.6, 1.8 ], [ 0, 0.25, 0.4 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( steel, [ 0.06, 0.7, 3.2 ], [ s * ( half + 0.03 ), 0, 0.3 ] );
	for ( let x = - half + 0.8; x < half; x += 1.6 ) parts.box( trim, [ 0.15, frameY - 0.85, 0.15 ], [ x, 0.85, 0.4 ] );

	// Spreader auger across the front with its cutting flights, strike-off and the vibrators.
	const az = - 1.9;
	parts.rod( steel, [ - half, 0.4, az ], [ half, 0.4, az ], 0.08, 10 );
	for ( let x = - half + 0.1; x < half; x += 0.35 ) parts.block( trim, [ 0.03, 0.55, 0.55 ], [ x, 0.4, az ], [ x * 2.5, 0, 0.3 ] );
	for ( let x = - half + 1.5; x < half; x += 3.0 ) member( parts, trim, [ 0.15, 0.2 ], [ x, frameY - 0.1, - 1.1 ], [ x, 0.6, az + 0.05 ] );
	parts.box( steel, [ SLAB, 0.45, 0.08 ], [ 0, 0.1, - 1.15 ] );
	for ( let x = - half + 0.3; x < half; x += 0.55 ) parts.path( BLACK(), [ [ x, 0.15, - 0.95 ], [ x, 0.75, - 0.95 ], [ x, frameY - 0.25, - 0.7 ] ], 0.03, 5, false );

	// Power unit in the middle on top, with louvres and exhaust, and a water tank beside it.
	parts.box( body, [ 2.8, 1.3, 2.2 ], [ 0.8, frameY + 0.35, 0.3 ] );
	for ( const s of [ - 1, 1 ] ) for ( let i = 0; i < 8; i ++ ) parts.box( dark, [ 0.012, 0.04, 1.4 ], [ 0.8 + s * 1.405, frameY + 0.6 + i * 0.1, 0.3 ] );
	parts.cylinder( dark, 0.08, 0.35, [ 1.6, frameY + 1.65, 0.8 ], 10 );
	parts.box( WHITE(), [ 1.4, 0.8, 1.2 ], [ - 1.6, frameY + 0.35, 0.6 ] );

	// Operator's console on the left with the seat, and a walkway with guardrail along the front.
	const deck = frameY + 0.35;
	parts.box( dark, [ 0.8, 0.95, 0.4 ], [ - 3.4, deck, - 0.4 ] );
	parts.block( dark, [ 0.8, 0.06, 0.45 ], [ - 3.4, deck + 1.0, - 0.35 ], [ 0.4, 0, 0 ] );
	seat( parts, [ - 3.4, deck + 0.45, 0.2 ] );
	parts.box( dark, [ 0.12, 0.35, 0.12 ], [ - 3.4, deck, 0.2 ] );
	railing( parts, [ - half + 0.1, half - 0.1 ], [ - 1.15, 1.75 ], deck, [ 0, 2 ], dark, 1.07 );
	for ( const s of [ - 1, 1 ] ) ladder( parts, steel, [ s * ( tx + 0.32 ), - 1.25 ], 0.95, deck );
	parts.sphere( AMBER(), 0.08, [ 0.8, frameY + 1.75, - 0.2 ] );

	// Oscillating correcting beam and the finishing float trailing behind on their arms.
	parts.box( steel, [ SLAB - 0.2, 0.18, 0.35 ], [ 0, 0, 1.9 ] );
	parts.box( BRIGHT(), [ SLAB - 0.4, 0.06, 0.7 ], [ 0, 0, 2.8 ] );
	for ( let x = - half + 1.0; x < half; x += 2.5 ) {

		member( parts, trim, [ 0.1, 0.12 ], [ x, frameY - 0.2, 1.65 ], [ x, 0.18, 1.95 ] );
		member( parts, trim, [ 0.08, 0.1 ], [ x, 0.6, 1.75 ], [ x, 0.06, 2.8 ] );

	}

	for ( const x of [ - half + 0.4, half - 0.4 ] ) parts.box( RED_LAMP(), [ 0.14, 0.08, 0.02 ], [ x, frameY + 0.1, 1.74 ] );

	return parts.build();

}

// --- texture / cure machine --------------------------------------------------------------------

// A two-track texture / cure machine spanning a 28 ft slab (about 10.4 m wide, 2.4 m long and
// 3 m high): a truss bridge across the slab on a leg and small track at each end, and a carriage
// that runs across it dragging the tine rake and spraying curing compound from its spray bar. The
// power unit sits on the right end, the curing compound tank and controls on the left.
function textureCure() {

	const parts = new Parts();
	const body = paint( 0xe9e8e2 );
	const trim = paint( 0x5a5f63 );
	const dark = DARK();
	const steel = STEEL();
	const half = SLAB / 2;
	const tx = half + 0.6;
	const bridgeY = 2.2;

	// Tracks at each end and the legs up to the bridge.
	for ( const s of [ - 1, 1 ] ) {

		crawler( parts, trim, { length: 1.5, height: 0.55, width: 0.3, x: s * tx, z: 0 } );
		parts.box( body, [ 0.3, bridgeY - 0.55, 0.3 ], [ s * tx, 0.55, 0 ] );
		parts.box( body, [ 0.6, 0.15, 1.4 ], [ s * tx, 0.6, 0 ] );

	}

	// The bridge: top and bottom chords on both sides, end frames, and diagonals between.
	const span = 2 * tx;
	for ( const z of [ - 0.45, 0.45 ] ) {

		for ( const y of [ bridgeY, bridgeY + 0.6 ] ) parts.box( body, [ span + 0.3, 0.12, 0.12 ], [ 0, y, z ] );
		const bays = 12;
		for ( let i = 0; i <= bays; i ++ ) {

			const x = - tx + i * span / bays;
			parts.box( body, [ 0.06, 0.48, 0.06 ], [ x, bridgeY + 0.12, z ] );
			if ( i < bays ) parts.rod( body, [ x, bridgeY + 0.12, z ], [ x + span / bays, bridgeY + 0.6, z ], 0.025, 5 );

		}

	}

	for ( const s of [ - 1, 1 ] ) parts.box( body, [ 0.3, 0.72, 1.0 ], [ s * tx, bridgeY, 0 ] );

	// The carriage, part way across, with the spray bar under its front and the tine rake behind.
	const cx = - 1.2;
	parts.box( trim, [ 1.1, 0.5, 1.3 ], [ cx, bridgeY - 0.5, 0 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.08, bridgeY - 0.9, 0.08 ], [ cx + s * 0.45, 0.6, - 0.3 ] );
	parts.rod( steel, [ cx - 0.6, 0.6, - 0.3 ], [ cx + 0.6, 0.6, - 0.3 ], 0.03, 6 );
	for ( let i = 0; i < 4; i ++ ) parts.rod( BRIGHT(), [ cx - 0.45 + i * 0.3, 0.6, - 0.3 ], [ cx - 0.45 + i * 0.3, 0.52, - 0.3 ], 0.015, 5 );
	parts.box( dark, [ 0.08, bridgeY - 0.6, 0.08 ], [ cx, 0.1, 0.35 ] );
	parts.box( steel, [ 1.5, 0.06, 0.1 ], [ cx, 0.12, 0.45 ] );
	for ( let i = 0; i < 24; i ++ ) parts.block( steel, [ 0.006, 0.18, 0.025 ], [ cx - 0.72 + i * 0.0625, 0.07, 0.52 ], [ 0.6, 0, 0 ] );
	parts.path( BLACK(), [ [ cx, bridgeY, 0 ], [ - 2.5, bridgeY + 0.75, 0 ], [ - half + 0.3, bridgeY + 0.8, 0 ] ], 0.02, 5, false );

	// Power unit on the right end, the curing compound tank and the control box on the left.
	parts.box( body, [ 1.1, 0.8, 1.2 ], [ tx - 0.5, bridgeY + 0.72, 0 ] );
	parts.cylinder( dark, 0.04, 0.35, [ tx - 0.2, bridgeY + 1.52, 0.3 ], 8 );
	parts.cylinder( WHITE(), 0.45, 0.95, [ - tx + 0.45, bridgeY + 0.72, 0 ], 16 );
	parts.box( dark, [ 0.5, 0.6, 0.25 ], [ - tx, 1.2, - 0.3 ] );
	parts.sphere( AMBER(), 0.07, [ tx - 0.5, bridgeY + 1.6, - 0.3 ] );

	return parts.build();

}

// --- line striping truck -----------------------------------------------------------------------

// A long-line striping truck on a tandem chassis (about 9.7 m long, 3.0 m wide with the gun
// carriage out and 3.9 m to the top of the raised arrow board): the paint tanks and the two
// pressurised bead tanks on the deck behind the cab with the compressor ahead of them, the
// operator's seat on the left over the gun carriage, which is set out under the left side with
// its paint guns and bead dispensers down at the road, and the arrow board raised at the back.
function stripingTruck() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();
	const steel = STEEL();
	const front = - 5.0;
	const back = 4.6;
	const { cabBack, frameTop } = truck( parts, { colour: 0xe9e8e2, front, rear: 2.8, back } );

	// Body: the deck behind the cab with side boxes under it, and a rail round the deck.
	const d0 = cabBack + 0.2;
	const deck = frameTop + 0.15;
	parts.box( body, [ TRUCK_WIDTH - 0.1, 0.15, back - d0 ], [ 0, frameTop, ( d0 + back ) / 2 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( body, [ 0.5, 0.5, 1.5 ], [ s * 1.0, frameTop - 0.5, 1.0 ] );
	railing( parts, [ - 1.2, 1.2 ], [ d0 + 0.1, back - 0.1 ], deck, [ 1, 2 ], dark, 0.9 );

	// Compressor and engine housing at the front of the deck.
	parts.box( body, [ 2.2, 1.0, 1.0 ], [ 0, deck, d0 + 0.6 ] );
	for ( let i = 0; i < 6; i ++ ) parts.box( dark, [ 0.012, 0.035, 0.6 ], [ 1.105, deck + 0.25 + i * 0.1, d0 + 0.6 ] );
	parts.cylinder( dark, 0.05, 0.6, [ 0.85, deck + 1.0, d0 + 0.3 ], 10 );

	// Two paint tanks (white and yellow, stainless steel) and two bead tanks with domed tops and cone
	// bottoms, each with its lid and piping.
	const tz = d0 + 1.75;
	for ( const [ x, z ] of [ [ - 0.55, tz ], [ 0.55, tz ] ] ) {

		parts.cylinder( BRIGHT(), 0.38, 1.05, [ x, deck + 0.1, z ], 18 );
		parts.cylinder( STEEL(), 0.4, 0.05, [ x, deck + 1.15, z ], 18 );
		parts.box( dark, [ 0.6, 0.1, 0.6 ], [ x, deck, z ] );

	}

	parts.box( paint( 0xf0f0ea ), [ 0.15, 0.1, 0.02 ], [ - 0.55, deck + 0.7, tz - 0.39 ] );
	parts.box( paint( 0xf2c200 ), [ 0.15, 0.1, 0.02 ], [ 0.55, deck + 0.7, tz - 0.39 ] );
	const bz = tz + 1.05;
	for ( const x of [ - 0.55, 0.55 ] ) {

		parts.cylinder( WHITE(), 0.35, 0.3, [ x, deck + 0.2, bz ], 18, 0.38 );
		parts.cylinder( WHITE(), 0.38, 1.0, [ x, deck + 0.5, bz ], 18 );
		parts.sphere( WHITE(), 0.38, [ x, deck + 1.5, bz ], [ 18, 8 ], [ 1, 0.4, 1 ] );
		for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.05, 0.25, 0.05 ], [ x + s * 0.3, deck, bz ] );

	}

	parts.path( BLACK(), [ [ - 0.55, deck + 0.15, tz ], [ - 1.15, deck + 0.15, tz + 0.2 ], [ - 1.2, 0.5, tz + 0.4 ] ], 0.02, 5 );

	// Operator's seat on a platform on the left, looking down at the carriage, under an umbrella
	// canopy, with the gun controls.
	const sz = 0.3;
	parts.box( dark, [ 0.7, 0.05, 1.0 ], [ - 1.3, deck - 0.2, sz ] );
	seat( parts, [ - 1.25, deck + 0.3, sz ] );
	parts.box( dark, [ 0.35, 0.6, 0.15 ], [ - 1.4, deck - 0.15, sz - 0.4 ] );
	parts.rod( steel, [ - 1.05, deck, sz + 0.3 ], [ - 1.05, deck + 1.6, sz + 0.3 ], 0.025, 6 );
	parts.cylinder( paint( 0xe35f1c ), 0.6, 0.18, [ - 1.05, deck + 1.55, sz + 0.1 ], 12, 0.05 );

	// Gun carriage set out under the left side: its slide frame, the guns and bead dispensers in
	// a row just above the road, the carriage wheels and a pointer arm reaching forward.
	const gx = - 1.45;
	const gz = 0.0;
	member( parts, body, [ 0.1, 0.1 ], [ - 0.4, 0.45, gz - 0.4 ], [ gx, 0.45, gz - 0.4 ] );
	member( parts, body, [ 0.1, 0.1 ], [ - 0.4, 0.45, gz + 0.4 ], [ gx, 0.45, gz + 0.4 ] );
	parts.box( body, [ 0.12, 0.12, 1.2 ], [ gx, 0.4, gz ] );
	for ( let i = 0; i < 3; i ++ ) {

		const z = gz - 0.35 + i * 0.35;
		parts.box( dark, [ 0.08, 0.2, 0.08 ], [ gx, 0.2, z ] );
		parts.box( steel, [ 0.06, 0.12, 0.05 ], [ gx, 0.1, z + 0.1 ] );

	}

	for ( const z of [ gz - 0.55, gz + 0.55 ] ) parts.rod( RUBBER(), [ gx - 0.04, 0.09, z ], [ gx + 0.04, 0.09, z ], 0.09, 10 );
	parts.rod( steel, [ gx, 0.45, gz - 0.6 ], [ gx, 0.35, - 2.0 ], 0.02, 6 );
	parts.box( body, [ 0.05, 0.05, 0.25 ], [ gx, 0.3, - 2.1 ] );

	// Arrow board raised on its mast at the back, showing a right arrow, and beacons.
	const face = drawn( 'striping-arrow-board', [ 256, 128 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#121314';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#ffb21e';
		const lamp = ( x, y ) => {

			ctx.beginPath();
			ctx.arc( x, y, 7, 0, Math.PI * 2 );
			ctx.fill();

		};

		for ( let i = 0; i < 9; i ++ ) lamp( 30 + i * 22, h / 2 );
		for ( let i = 1; i < 4; i ++ ) {

			lamp( 206 - i * 18, h / 2 - i * 16 );
			lamp( 206 - i * 18, h / 2 + i * 16 );

		}

	}, { emissive: 0x332000 } );
	const boardY = 2.65;
	const boardZ = back - 0.25;
	for ( const x of [ - 0.6, 0.6 ] ) parts.box( steel, [ 0.1, boardY - deck, 0.1 ], [ x, deck, boardZ + 0.1 ] );
	parts.box( dark, [ 96 * IN + 0.08, 48 * IN + 0.08, 0.1 ], [ 0, boardY, boardZ ] );
	parts.box( face, [ 96 * IN, 48 * IN, 0.01 ], [ 0, boardY + 0.04, boardZ + 0.055 ] );
	parts.sphere( AMBER(), 0.08, [ - 1.1, boardY + 1.3, boardZ ] );
	parts.sphere( AMBER(), 0.08, [ 1.1, boardY + 1.3, boardZ ] );
	for ( const x of [ - 1.1, 1.1 ] ) {

		parts.rod( steel, [ x, deck, boardZ ], [ x, boardY + 1.22, boardZ ], 0.025, 6 );
		parts.box( RED_LAMP(), [ 0.16, 0.1, 0.03 ], [ x, frameTop - 0.15, back + 0.02 ] );

	}

	return parts.build();

}

// --- crack sealing melter ----------------------------------------------------------------------

// A 250 gal crack sealing melter on a single-axle trailer (about 4.6 m long with its drawbar,
// 1.95 m wide and 2.5 m to the top of the hose boom): the insulated double-boiler kettle with its
// loading lid and agitator drive, the burner flue, the engine and pump housing at the front, the
// diesel tank, and the heated hose hung from the swinging boom at the back down to the wand.
function crackSealer() {

	const parts = new Parts();
	const body = paint( 0xc22d24 );
	const dark = DARK();
	const steel = STEEL();
	const fy = 0.62;

	// Trailer frame, axle and tyres with fenders, and the drawbar.
	for ( const x of [ - 0.55, 0.55 ] ) parts.box( dark, [ 0.08, 0.15, 3.0 ], [ x, fy - 0.15, 0.25 ] );
	parts.rod( dark, [ - 0.85, 0.36, 0.5 ], [ 0.85, 0.36, 0.5 ], 0.05, 8 );
	for ( const s of [ - 1, 1 ] ) {

		tyre( parts, 0.36, 0.22, [ s * 0.85, 0.5 ], BRIGHT() );
		parts.box( steel, [ 0.28, 0.04, 0.9 ], [ s * 0.85, 0.8, 0.5 ] );

	}

	drawbar( parts, 0.55, - 1.25, - 2.35, fy - 0.05 );
	parts.box( dark, [ 1.6, 0.05, 3.0 ], [ 0, fy, 0.25 ] );

	// Kettle: the insulated box with its lid, the agitator drive on top and the burner flue.
	parts.box( body, [ 1.5, 1.05, 1.7 ], [ 0, fy + 0.05, 0.6 ] );
	parts.box( dark, [ 1.52, 0.05, 1.72 ], [ 0, fy + 0.5, 0.6 ] );
	parts.box( steel, [ 0.7, 0.06, 0.6 ], [ - 0.2, fy + 1.1, 0.3 ] ); // loading lid
	parts.box( dark, [ 0.3, 0.3, 0.3 ], [ 0.35, fy + 1.1, 0.8 ] );
	parts.cylinder( dark, 0.08, 0.6, [ 0.5, fy + 1.1, 1.25 ], 10 );

	// Engine and pump housing at the front, the diesel tank and the control panel.
	parts.box( body, [ 1.4, 0.85, 0.9 ], [ 0, fy + 0.05, - 0.75 ] );
	for ( let i = 0; i < 5; i ++ ) parts.box( dark, [ 0.012, 0.035, 0.55 ], [ 0.705, fy + 0.3 + i * 0.09, - 0.75 ] );
	parts.box( dark, [ 0.45, 0.35, 0.05 ], [ - 0.3, fy + 0.35, - 1.22 ] );
	parts.rod( steel, [ - 0.6, fy + 0.25, - 1.45 ], [ 0.6, fy + 0.25, - 1.45 ], 0.18, 14 );

	// Hose boom on a post at the back right, swung out behind, the hose down to the wand.
	const post = [ 0.6, 1.4 ];
	parts.cylinder( steel, 0.05, 2.45 - fy, [ post[ 0 ], fy, post[ 1 ] ], 10 );
	const tip = [ 0.2, 2.42, 2.4 ];
	parts.rod( steel, [ post[ 0 ], 2.42, post[ 1 ] ], tip, 0.035, 6 );
	parts.path( BLACK(), [ [ 0.5, fy + 0.6, 1.4 ], [ post[ 0 ] - 0.05, 2.35, post[ 1 ] ], tip, [ tip[ 0 ], 1.6, tip[ 2 ] ], [ tip[ 0 ] + 0.1, 1.0, tip[ 2 ] + 0.1 ] ], 0.03, 6 );
	parts.rod( steel, [ tip[ 0 ] + 0.1, 1.0, tip[ 2 ] + 0.1 ], [ tip[ 0 ] + 0.1, 0.15, tip[ 2 ] + 0.15 ], 0.018, 6 ); // the wand
	parts.box( dark, [ 0.12, 0.06, 0.12 ], [ tip[ 0 ] + 0.1, 0.1, tip[ 2 ] + 0.15 ] );
	for ( const x of [ - 0.7, 0.7 ] ) parts.box( RED_LAMP(), [ 0.12, 0.07, 0.02 ], [ x, fy - 0.08, 1.76 ] );

	return parts.build();

}

// --- asphalt hot box ---------------------------------------------------------------------------

// A 4 t asphalt hot box on a tandem-axle trailer (about 4.9 m long with its drawbar, 2.1 m wide and
// 1.95 m high): the insulated hopper with two lids on top, the discharge door at the back with
// its chute, the diesel burner and flue, a small tack tank, propane-free diesel tank and a rack of
// rakes, lutes and shovels on the front.
function hotBox() {

	const parts = new Parts();
	const body = paint( 0xe35f1c );
	const dark = DARK();
	const steel = STEEL();
	const fy = 0.62;

	// Frame, tandem axles and tyres with fenders, and the drawbar.
	for ( const x of [ - 0.6, 0.6 ] ) parts.box( dark, [ 0.1, 0.15, 3.3 ], [ x, fy - 0.15, 0.35 ] );
	for ( const z of [ 0.35, 1.2 ] ) {

		parts.rod( dark, [ - 0.95, 0.36, z ], [ 0.95, 0.36, z ], 0.05, 8 );
		for ( const s of [ - 1, 1 ] ) tyre( parts, 0.36, 0.22, [ s * 0.94, z ], BRIGHT() );

	}

	for ( const s of [ - 1, 1 ] ) parts.box( steel, [ 0.3, 0.04, 1.75 ], [ s * 0.94, 0.8, 0.78 ] );
	drawbar( parts, 0.6, - 1.3, - 2.45, fy - 0.05 );
	parts.box( dark, [ 1.75, 0.05, 3.3 ], [ 0, fy, 0.35 ] );

	// The insulated hopper, wider at the top, its two lids and the burner flue.
	const h0 = - 0.6;
	const h1 = 2.0;
	alongZ( parts, body, [ [ - 0.75, fy + 0.05 ], [ 0.75, fy + 0.05 ], [ 0.86, fy + 0.6 ], [ 0.86, fy + 1.3 ], [ - 0.86, fy + 1.3 ], [ - 0.86, fy + 0.6 ] ], h0, h1 );
	for ( const z of [ h0 + 0.65, h1 - 0.65 ] ) {

		parts.box( steel, [ 1.5, 0.05, 1.1 ], [ 0, fy + 1.3, z ] );
		parts.rod( dark, [ - 0.3, fy + 1.4, z - 0.5 ], [ 0.3, fy + 1.4, z - 0.5 ], 0.015, 5 );

	}

	parts.cylinder( dark, 0.06, 0.3, [ 0.55, fy + 1.3, h0 + 0.2 ], 10 );

	// Discharge door at the back with its handle and the chute below it.
	parts.box( dark, [ 0.9, 0.6, 0.05 ], [ 0, fy + 0.2, h1 + 0.02 ] );
	parts.rod( steel, [ - 0.3, fy + 0.6, h1 + 0.08 ], [ 0.3, fy + 0.6, h1 + 0.08 ], 0.015, 5 );
	parts.block( steel, [ 0.95, 0.04, 0.45 ], [ 0, fy + 0.12, h1 + 0.2 ], [ 0.35, 0, 0 ] );
	for ( const x of [ - 0.75, 0.75 ] ) parts.box( RED_LAMP(), [ 0.12, 0.07, 0.02 ], [ x, fy - 0.08, h1 + 0.03 ] );

	// Front: the burner housing, the diesel and tack tanks, and the tool rack.
	parts.box( dark, [ 0.6, 0.55, 0.35 ], [ 0.45, fy + 0.05, h0 - 0.2 ] );
	parts.rod( steel, [ - 0.75, fy + 0.25, h0 - 0.25 ], [ - 0.05, fy + 0.25, h0 - 0.25 ], 0.2, 14 );
	parts.cylinder( WHITE(), 0.18, 0.5, [ - 0.4, fy + 0.45, h0 - 0.25 ], 12 );
	for ( const x of [ - 0.8, 0.8 ] ) parts.rod( steel, [ x, fy, h0 - 0.55 ], [ x, fy + 1.25, h0 - 0.55 ], 0.02, 6 );
	parts.rod( steel, [ - 0.8, fy + 1.2, h0 - 0.55 ], [ 0.8, fy + 1.2, h0 - 0.55 ], 0.02, 6 );
	for ( let i = 0; i < 4; i ++ ) {

		const x = - 0.6 + i * 0.4;
		parts.rod( mat( 0x9a7a4e, { roughness: 0.8 } ), [ x, fy + 0.1, h0 - 0.6 ], [ x + 0.05, fy + 1.3, h0 - 0.6 ], 0.018, 5 );
		parts.box( steel, i % 2 ? [ 0.4, 0.07, 0.03 ] : [ 0.22, 0.25, 0.02 ], [ x, fy + 0.05, h0 - 0.62 ] );

	}

	return parts.build();

}

// --- soil stabilizer ---------------------------------------------------------------------------

// A soil stabilizer / reclaimer of the Wirtgen WR 240 class (about 10.2 m long, 3.0 m wide and
// 3.1 m to the cab roof): four big lugged tyres, the 2.4 m mixing rotor in its housing between the
// axles with the spray bar for water or emulsion and the hinged doors, the cab in the middle over
// the rotor, the engine at the back and the coupling for the water tanker at the front.
function stabilizer() {

	const parts = new Parts();
	const body = paint( 0xe9e6dc );
	const trim = paint( 0x5a5f63 );
	const dark = DARK();
	const steel = STEEL();
	const r = 0.83;

	// Tyres with chevron lugs and fenders, and the main frame.
	for ( const z of [ - 3.3, 3.0 ] ) {

		for ( const s of [ - 1, 1 ] ) {

			tyre( parts, r, 0.7, [ s * 1.12, z ], trim );
			for ( let i = 0; i < 20; i ++ ) {

				const a = i / 20 * Math.PI * 2;
				parts.block( RUBBER(), [ 0.62, 0.04, 0.09 ], [ s * 1.12, r + Math.sin( a ) * r, z + Math.cos( a ) * r ], [ a + Math.PI / 2, 0, 0 ] );

			}

			parts.box( trim, [ 0.8, 0.07, 2.0 ], [ s * 1.12, 1.75, z ] );

		}

	}

	parts.box( trim, [ 1.4, 0.75, 8.6 ], [ 0, 0.95, - 0.15 ] );

	// Rotor housing between the axles: the hood across, side plates on the ground, the rotor
	// showing under it, the spray bar and the rear door.
	const rz = - 0.2;
	parts.box( body, [ 2.55, 1.0, 1.9 ], [ 0, 0.35, rz ] );
	for ( const s of [ - 1, 1 ] ) parts.box( trim, [ 0.06, 0.75, 2.1 ], [ s * 1.3, 0.0, rz ] );
	parts.rod( steel, [ - 1.2, 0.5, rz ], [ 1.2, 0.5, rz ], 0.5, 16 );
	parts.rod( dark, [ - 1.25, 1.45, rz - 0.5 ], [ 1.25, 1.45, rz - 0.5 ], 0.05, 8 );
	parts.box( trim, [ 2.5, 0.65, 0.06 ], [ 0, 0.05, rz + 1.0 ] );

	// Front: the nose with lamps, the tow coupling for the tanker, and the water pump housing.
	parts.box( body, [ 2.4, 0.9, 1.8 ], [ 0, 0.95, - 4.3 ] );
	parts.box( dark, [ 0.35, 0.3, 0.3 ], [ 0, 0.6, - 5.2 ] );
	for ( const x of [ - 1.0, 1.0 ] ) parts.box( HEADLAMP(), [ 0.18, 0.1, 0.03 ], [ x, 1.55, - 5.21 ] );
	parts.box( dark, [ 0.8, 0.6, 0.8 ], [ 0, 1.85, - 4.3 ] );

	// Cab in the middle over the rotor on its deck, with ladders each side.
	const deck = 1.62;
	parts.box( dark, [ 2.9, 0.06, 2.4 ], [ 0, deck - 0.06, - 1.2 ] );
	parts.box( body, [ 2.0, deck - 1.7, 2.4 ], [ 0, 1.7, - 1.2 ] );
	cab( parts, body, [ 2.0, 1.48, 1.9 ], [ 0, deck, - 1.2 ] );
	railing( parts, [ - 1.45, 1.45 ], [ - 2.4, 0.0 ], deck, [ 1, 3 ], dark, 0.9 );
	for ( const s of [ - 1, 1 ] ) ladder( parts, steel, [ s * 1.47, - 1.9 ], 0.3, deck );
	parts.sphere( AMBER(), 0.08, [ 0.7, deck + 1.53, - 0.5 ] );

	// Engine compartment behind with louvres, the exhaust, and lamps on the back.
	parts.box( body, [ 2.5, 1.1, 3.3 ], [ 0, 1.35, 2.85 ] );
	parts.box( trim, [ 2.52, 0.06, 3.32 ], [ 0, 2.45, 2.85 ] );
	for ( const s of [ - 1, 1 ] ) for ( let i = 0; i < 8; i ++ ) parts.box( dark, [ 0.012, 0.04, 1.6 ], [ s * 1.255, 1.55 + i * 0.1, 3.2 ] );
	parts.cylinder( dark, 0.08, 0.55, [ 0.7, 2.5, 3.6 ], 10 );
	for ( const x of [ - 1.0, 1.0 ] ) parts.box( RED_LAMP(), [ 0.16, 0.1, 0.03 ], [ x, 2.1, 4.51 ] );

	return parts.build();

}

// --- water trailer -----------------------------------------------------------------------------

// A 500 gal towable water trailer (about 4.0 m long with its drawbar, 1.75 m wide and 1.6 m high):
// the steel tank on a single axle with its fill lid on top, the gas engine pump on the tongue and
// the spray bar across the back with its nozzles and valve.
function waterTrailer() {

	const parts = new Parts();
	const body = paint( 0x2f5f8f );
	const dark = DARK();
	const steel = STEEL();
	const fy = 0.5;

	// Frame, axle, tyres and fenders, and the drawbar.
	for ( const x of [ - 0.45, 0.45 ] ) parts.box( dark, [ 0.08, 0.12, 2.3 ], [ x, fy - 0.12, 0.3 ] );
	parts.rod( dark, [ - 0.8, 0.33, 0.35 ], [ 0.8, 0.33, 0.35 ], 0.04, 8 );
	for ( const s of [ - 1, 1 ] ) {

		tyre( parts, 0.33, 0.2, [ s * 0.76, 0.35 ], BRIGHT() );
		parts.box( steel, [ 0.26, 0.04, 0.8 ], [ s * 0.76, 0.72, 0.35 ] );

	}

	drawbar( parts, 0.45, - 0.85, - 1.95, fy - 0.04 );

	// The tank on its saddles: a horizontal cylinder 2.2 m long, 1.1 m across, its fill lid on
	// top and the drain valve underneath.
	const ty = fy + 0.06;
	const t0 = - 0.8;
	const t1 = 1.4;
	for ( const z of [ t0 + 0.4, t1 - 0.4 ] ) parts.box( dark, [ 0.9, 0.1, 0.12 ], [ 0, fy, z ] );
	alongZ( parts, body, ellipse( 1.1, 1.0, ty ), t0, t1 );
	for ( const z of [ t0 + 0.02, t1 - 0.06 ] ) alongZ( parts, body, ellipse( 1.13, 1.03, ty - 0.015 ), z, z + 0.04 ); // rolled end seams
	parts.cylinder( dark, 0.2, 0.08, [ 0, ty + 0.97, 0.3 ], 14 );
	parts.rod( steel, [ 0, ty + 0.05, t1 - 0.15 ], [ 0, ty - 0.15, t1 - 0.15 ], 0.04, 8 );

	// Pump and its small engine on the tongue, piped to the tank.
	parts.box( dark, [ 0.6, 0.04, 0.5 ], [ 0, fy - 0.04, - 1.15 ] );
	parts.box( paint( 0xc22d24 ), [ 0.4, 0.35, 0.35 ], [ - 0.08, fy, - 1.15 ] );
	parts.cylinder( steel, 0.1, 0.2, [ 0.2, fy, - 1.15 ], 12 );
	parts.path( BLACK(), [ [ 0.2, fy + 0.1, - 1.0 ], [ 0.3, fy + 0.15, - 0.75 ] ], 0.03, 6 );

	// Spray bar across the back with its nozzles and the valve.
	const barZ = t1 + 0.15;
	for ( const x of [ - 0.4, 0.4 ] ) parts.box( dark, [ 0.05, fy - 0.2, 0.05 ], [ x, 0.2, barZ - 0.05 ] );
	parts.rod( steel, [ - 0.85, 0.25, barZ ], [ 0.85, 0.25, barZ ], 0.025, 8 );
	for ( let i = 0; i < 6; i ++ ) parts.rod( BRIGHT(), [ - 0.75 + i * 0.3, 0.24, barZ ], [ - 0.75 + i * 0.3, 0.18, barZ + 0.03 ], 0.012, 5 );
	parts.box( paint( 0xc22d24 ), [ 0.1, 0.08, 0.08 ], [ 0, 0.3, barZ ] );
	parts.box( dark, [ 1.5, 0.08, 0.06 ], [ 0, fy - 0.12, 1.42 ] );
	for ( const x of [ - 0.7, 0.7 ] ) parts.box( RED_LAMP(), [ 0.1, 0.06, 0.02 ], [ x, fy - 0.1, 1.46 ] );

	return parts.build();

}
