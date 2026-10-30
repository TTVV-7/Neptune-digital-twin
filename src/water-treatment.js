import { CatmullRomCurve3, SphereGeometry, TubeGeometry, Vector3 } from 'three';
import { BLACK, FT, GALVANISED, IN, mat, Parts, RUBBER, STEEL } from './parts.js';

// Temporary water treatment and dewatering at real size, in metres: a frac tank, a weir tank, a
// sand filter skid, a flocculant dosing trailer, a trash pump with its hoses and a dewatering bag.
// Each stands on y = 0 with its front (nose, inlet end or hitch) facing -Z, so heading 0 points it
// north. Brand-free paint; rental fleets each have their own colours.

const TANK = () => mat( 0x2f5a8a, { roughness: 0.6, metalness: 0.3 } );
const TANK_DARK = () => mat( 0x24476d, { roughness: 0.6, metalness: 0.3 } );
const WATER = () => mat( 0x5e5440, { roughness: 0.15, metalness: 0.1 } );
const VESSEL = () => mat( 0x2f6aa5, { roughness: 0.45, metalness: 0.3 } );
const PIPE = () => mat( 0x9aa0a5, { roughness: 0.45, metalness: 0.6 } );
const HANDLE = () => mat( 0xc2311f, { roughness: 0.5 } );
const CABINET = () => mat( 0xb7bcbf, { roughness: 0.55, metalness: 0.4 } );
const POLY = () => mat( 0xe9e6dc, { roughness: 0.6 } );
const PUMP = () => mat( 0xd8661c, { roughness: 0.5, metalness: 0.2 } );
const HOSE = () => mat( 0x141516, { roughness: 0.75 } );
const LAYFLAT = () => mat( 0x2c63b8, { roughness: 0.6 } );
const GEOTEXTILE = () => mat( 0x4c5249, { roughness: 1 } );

// Round thing (wheel, flange, hatch) of `radius` and `width`, its axis along x, centred on c.
function disc( parts, material, radius, width, c, segments = 16 ) {

	return parts.rod( material, [ c[ 0 ] - width / 2, c[ 1 ], c[ 2 ] ], [ c[ 0 ] + width / 2, c[ 1 ], c[ 2 ] ], radius, segments );

}

// The same with its axis along z.
function discZ( parts, material, radius, width, c, segments = 16 ) {

	return parts.rod( material, [ c[ 0 ], c[ 1 ], c[ 2 ] - width / 2 ], [ c[ 0 ], c[ 1 ], c[ 2 ] + width / 2 ], radius, segments );

}

// A valve: a short body on the pipe and a red handwheel or lever above it.
function valve( parts, [ x, y, z ], radius ) {

	parts.sphere( PIPE(), radius * 1.4, [ x, y, z ], [ 10, 6 ] );
	parts.rod( STEEL(), [ x, y, z ], [ x, y + radius * 2.4, z ], radius * 0.25, 6 );
	parts.cylinder( HANDLE(), radius * 1.6, 0.03, [ x, y + radius * 2.4, z ], 12 );

}

// --- frac tank -------------------------------------------------------------------------------

// A 500 bbl (21,000 US gal) steel frac tank, 40 ft long: sloped nose with the kingpin at the
// front (-Z), axle at the back under a raised tail, corrugated sides, manways, top hatches, a
// ladder up the back and valves at the rear.
export function fracTank() {

	const parts = new Parts();
	const width = 2.44;
	const shell = width - 0.08;
	const length = 12.2;
	const height = 3.0;
	const back = length / 2;
	const nose = - length / 2;
	const arc = [];
	for ( let i = 0; i <= 6; i ++ ) {

		const t = i / 6 * Math.PI / 2;
		arc.push( [ nose + 0.7 - 0.7 * Math.sin( t ), height - 0.7 + 0.7 * Math.cos( t ) ] );

	}

	const side = [ [ back, 1.05 ], [ back, height ], ...arc, [ nose, 1.3 ], [ nose + 1.5, 0.3 ], [ back - 2.1, 0.3 ], [ back - 2.1, 1.05 ] ];
	parts.prism( TANK(), side, shell );

	// Vertical corrugations, standing proud of the shell to the full width.
	const rib = TANK_DARK();
	const manways = [ - 1.5, 3.2 ];
	for ( let z = nose + 1.7; z < back - 0.1; z += 0.6 ) {

		if ( manways.some( m => Math.abs( m - z ) < 0.4 ) ) continue;
		const low = z > back - 2.1 ? 1.05 : 0.3;
		for ( const x of [ - width / 2 + 0.02, width / 2 - 0.02 ] ) parts.box( rib, [ 0.04, height - 0.1 - low, 0.08 ], [ x, low + 0.05, z ] );

	}

	// Skid rails under the belly, the tail's axle with dual wheels, and the landing legs under the nose.
	for ( const x of [ - 0.6, 0.6 ] ) parts.box( STEEL(), [ 0.15, 0.3, back - 2.1 - nose - 1.5 ], [ x, 0, ( nose + 1.5 + back - 2.1 ) / 2 ] );
	const axle = back - 1.05;
	disc( parts, STEEL(), 0.06, width - 0.3, [ 0, 0.5, axle ], 8 );
	for ( const s of [ - 1, 1 ] ) {

		for ( const x of [ 0.75, 1.0 ] ) disc( parts, RUBBER(), 0.5, 0.22, [ s * x, 0.5, axle ], 18 );
		disc( parts, STEEL(), 0.25, 0.24, [ s * 0.875, 0.5, axle ], 10 );

	}

	for ( const x of [ - 0.7, 0.7 ] ) {

		parts.box( STEEL(), [ 0.12, 0.8, 0.12 ], [ x, 0.05, nose + 0.8 ] );
		parts.box( STEEL(), [ 0.3, 0.05, 0.3 ], [ x, 0, nose + 0.8 ] );

	}

	// Two 22 in manways low on the side, three hatches and a vent on top.
	for ( const z of manways ) {

		disc( parts, TANK_DARK(), 0.33, 0.04, [ width / 2 - 0.02, 0.95, z ], 20 );
		for ( let i = 0; i < 8; i ++ ) {

			const a = i / 8 * Math.PI * 2;
			disc( parts, STEEL(), 0.02, 0.05, [ width / 2 - 0.02, 0.95 + 0.29 * Math.cos( a ), z + 0.29 * Math.sin( a ) ], 6 );

		}

	}

	for ( const z of [ - 3.5, 0.5, 4.0 ] ) parts.cylinder( TANK_DARK(), 0.3, 0.08, [ 0, height, z ], 18 );
	parts.cylinder( PIPE(), 0.05, 0.06, [ - 0.7, height, 4.8 ], 8 );
	parts.cylinder( PIPE(), 0.09, 0.03, [ - 0.7, height + 0.06, 4.8 ], 10 );

	// Fill and drain valves (4 in) on the back, and a ladder up to the hatches.
	for ( const x of [ 0.55, 0.85 ] ) {

		parts.rod( PIPE(), [ x, 1.3, back ], [ x, 1.3, back + 0.14 ], 0.06, 10 );
		discZ( parts, PIPE(), 0.1, 0.02, [ x, 1.3, back + 0.14 ], 12 );
		valve( parts, [ x, 1.3, back + 0.08 ], 0.06 );

	}

	for ( const x of [ - 0.95, - 0.5 ] ) parts.rod( STEEL(), [ x, 0.3, back + 0.12 ], [ x, height + 0.05, back + 0.12 ], 0.022, 6 );
	for ( let y = 0.6; y < height; y += 0.3 ) parts.rod( STEEL(), [ - 0.95, y, back + 0.12 ], [ - 0.5, y, back + 0.12 ], 0.014, 6 );
	return parts.build();

}

// --- weir tank -------------------------------------------------------------------------------

// A 20 ft open-top weir (settling) tank: water comes in at the front (-Z), passes under and over
// the weir plates so the silt settles, and leaves clearer at the back. About 8,000 US gal.
export function weirTank() {

	const parts = new Parts();
	const length = 20 * FT;
	const width = 8 * FT;
	const height = 8 * FT;
	const wall = 0.06;
	const paint = TANK();
	const trim = TANK_DARK();
	parts.box( paint, [ width, 0.1, length ], [ 0, 0.15, 0 ] );
	for ( const x of [ - width / 2 + wall / 2, width / 2 - wall / 2 ] ) parts.box( paint, [ wall, height - 0.15, length ], [ x, 0.15, 0 ] );
	for ( const z of [ - length / 2 + wall / 2, length / 2 - wall / 2 ] ) parts.box( paint, [ width, height - 0.15, wall ], [ 0, 0.15, z ] );

	// A channel round the rim, ribs on the outside and skids underneath.
	for ( const x of [ - width / 2 + 0.05, width / 2 - 0.05 ] ) parts.box( trim, [ 0.1, 0.1, length ], [ x, height - 0.1, 0 ] );
	for ( const z of [ - length / 2 + 0.05, length / 2 - 0.05 ] ) parts.box( trim, [ width, 0.1, 0.1 ], [ 0, height - 0.1, z ] );
	for ( let z = - length / 2 + 0.6; z < length / 2 - 0.3; z += 0.75 ) for ( const x of [ - width / 2 + 0.02, width / 2 - 0.02 ] ) parts.box( trim, [ 0.04, height - 0.4, 0.08 ], [ x, 0.2, z ] );
	for ( const x of [ - 0.8, 0.8 ] ) parts.box( STEEL(), [ 0.2, 0.15, length - 0.1 ], [ x, 0, 0 ] );

	// Murky water near the top, the weirs (an underflow then an overflow plate) rising out of it.
	parts.box( WATER(), [ width - 2 * wall, 0.02, length - 2 * wall ], [ 0, height - 0.45, 0 ] );
	parts.box( trim, [ width - 2 * wall, height - 0.85, 0.04 ], [ 0, 0.85, - 0.6 ] );
	parts.box( trim, [ width - 2 * wall, height - 0.65, 0.04 ], [ 0, 0.25, 1.2 ] );

	// Inlet and outlet (6 in) through the ends, with valves, and a ladder on the side.
	for ( const z of [ - length / 2, length / 2 ] ) {

		const out = Math.sign( z ) * 0.07;
		parts.rod( PIPE(), [ 0.6, 0.45, z ], [ 0.6, 0.45, z + out ], 0.085, 12 );
		discZ( parts, PIPE(), 0.14, 0.03, [ 0.6, 0.45, z + out ], 14 );
		valve( parts, [ 0.6, 0.45, z + out * 0.5 ], 0.06 );

	}

	for ( const z of [ - 2.2, - 1.75 ] ) parts.rod( STEEL(), [ - width / 2 - 0.05, 0.15, z ], [ - width / 2 - 0.05, height + 0.1, z ], 0.022, 6 );
	for ( let y = 0.45; y < height; y += 0.3 ) parts.rod( STEEL(), [ - width / 2 - 0.05, y, - 2.2 ], [ - width / 2 - 0.05, y, - 1.75 ], 0.014, 6 );
	return parts.build();

}

// --- sand filter skid ------------------------------------------------------------------------

// Three 36 in sand media filter vessels on a 12 x 6 ft skid, with the inlet header across the
// tops, the outlet header along the bottom, a valve on every branch and a control panel.
export function sandFilterSkid() {

	const parts = new Parts();
	const length = 12 * FT;
	const width = 6 * FT;
	const steel = STEEL();
	// Skid frame: channel round the edge, cross members and grating.
	for ( const z of [ - width / 2 + 0.08, width / 2 - 0.08 ] ) parts.box( steel, [ length, 0.15, 0.16 ], [ 0, 0, z ] );
	for ( const x of [ - length / 2 + 0.08, 0, length / 2 - 0.08 ] ) parts.box( steel, [ 0.16, 0.15, width - 0.32 ], [ x, 0, 0 ] );
	parts.box( mat( 0x6a6f73, { roughness: 0.6, metalness: 0.5 } ), [ length - 0.2, 0.02, width - 0.2 ], [ 0, 0.13, 0 ] );

	const radius = 18 * IN;
	const shell = 1.2;
	const legs = 0.45;
	const head = radius * 0.5;
	const z = 0.2;
	const inlet = 0.15 + legs + head * 2 + shell + 0.15;
	const outlet = 0.42;
	const xs = [ - 1.15, 0, 1.15 ];
	for ( const x of xs ) {

		// Shell with elliptical heads, on four legs.
		parts.cylinder( VESSEL(), radius, shell, [ x, 0.15 + legs + head, z ], 24 );
		for ( const y of [ 0.15 + legs + head, 0.15 + legs + head + shell ] ) parts.sphere( VESSEL(), radius, [ x, y, z ], [ 24, 10 ], [ 1, 0.5, 1 ] );
		for ( let i = 0; i < 4; i ++ ) {

			const a = ( i + 0.5 ) * Math.PI / 2;
			parts.rod( steel, [ x + radius * 0.85 * Math.cos( a ), 0.15, z + radius * 0.85 * Math.sin( a ) ], [ x + radius * 0.85 * Math.cos( a ), 0.15 + legs + head, z + radius * 0.85 * Math.sin( a ) ], 0.04, 6 );

		}

		// A branch from each header, with its valve, and a pressure gauge on top.
		const top = 0.15 + legs + head * 2 + shell;
		parts.path( PIPE(), [ [ x, top - 0.05, z ], [ x, inlet, z ], [ x, inlet, - 0.55 ] ], 0.05, 10 );
		valve( parts, [ x, inlet, - 0.25 ], 0.05 );
		parts.path( PIPE(), [ [ x, 0.15 + legs + 0.05, z ], [ x, outlet, z - 0.2 ], [ x, outlet, - 0.65 ] ], 0.05, 10 );
		valve( parts, [ x + 0.12, outlet, - 0.45 ], 0.045 );
		parts.cylinder( steel, 0.012, 0.12, [ x + 0.2, top - 0.08, z ], 6 );
		discZ( parts, mat( 0xf2f2ee, { roughness: 0.3 } ), 0.05, 0.03, [ x + 0.2, top + 0.06, z - 0.01 ], 14 );

	}

	// Headers along the front, from the flanged connections at the -x end.
	for ( const [ y, zz ] of [ [ inlet, - 0.55 ], [ outlet, - 0.65 ] ] ) {

		parts.rod( PIPE(), [ - length / 2 + 0.05, y, zz ], [ xs.at( - 1 ) + 0.1, y, zz ], 0.075, 12 );
		disc( parts, PIPE(), 0.13, 0.03, [ - length / 2 + 0.05, y, zz ], 14 );

	}

	parts.rod( PIPE(), [ - 1.55, outlet, - 0.65 ], [ - 1.55, 0.15, - 0.65 ], 0.03, 6 );
	parts.rod( PIPE(), [ - 1.55, inlet, - 0.55 ], [ - 1.55, 0.15, - 0.55 ], 0.03, 6 );

	// Control panel on a stand at the +x end.
	parts.box( steel, [ 0.08, 0.9, 0.08 ], [ length / 2 - 0.3, 0.15, - 0.4 ] );
	parts.box( CABINET(), [ 0.25, 0.8, 0.6 ], [ length / 2 - 0.3, 1.0, - 0.4 ] );
	parts.box( mat( 0x2a2e31, { roughness: 0.4 } ), [ 0.02, 0.2, 0.3 ], [ length / 2 - 0.43, 1.45, - 0.4 ] );
	return parts.build();

}

// --- flocculant dosing trailer ---------------------------------------------------------------

// A single-axle trailer carrying a 1,000 L flocculant tank in a spill tray, the dosing pump
// cabinet and a hose reel; hitch at the front (-Z).
export function flocDosingTrailer() {

	const parts = new Parts();
	const deckLength = 3.0;
	const deckWidth = 1.75;
	const deck = 0.62;
	const steel = STEEL();
	const z0 = - deckLength / 2 + 0.45;
	const dz = z0 + deckLength / 2;
	parts.box( mat( 0x4a5056, { roughness: 0.7, metalness: 0.4 } ), [ deckWidth, 0.06, deckLength ], [ 0, deck - 0.06, dz ] );
	for ( const x of [ - deckWidth / 2 + 0.05, deckWidth / 2 - 0.05 ] ) parts.box( steel, [ 0.1, 0.15, deckLength ], [ x, deck - 0.2, dz ] );

	// A-frame tongue to the coupler, with a jack stand.
	const hitch = - deckLength / 2 + dz - 1.3;
	for ( const x of [ - 0.75, 0.75 ] ) parts.rod( steel, [ x, deck - 0.12, - deckLength / 2 + dz ], [ 0, deck - 0.12, hitch + 0.3 ], 0.05, 6 );
	parts.rod( steel, [ 0, deck - 0.12, hitch + 0.35 ], [ 0, deck - 0.12, hitch ], 0.05, 6 );
	parts.box( BLACK(), [ 0.12, 0.1, 0.25 ], [ 0, deck - 0.2, hitch + 0.05 ] );
	parts.rod( steel, [ 0.2, 0.05, hitch + 0.6 ], [ 0.2, deck + 0.25, hitch + 0.6 ], 0.04, 8 );
	parts.box( steel, [ 0.2, 0.03, 0.2 ], [ 0.2, 0, hitch + 0.6 ] );

	// Axle, wheels and fenders.
	const axle = dz + 0.2;
	for ( const s of [ - 1, 1 ] ) {

		disc( parts, RUBBER(), 0.33, 0.2, [ s * ( deckWidth / 2 + 0.13 ), 0.33, axle ], 18 );
		disc( parts, GALVANISED(), 0.17, 0.21, [ s * ( deckWidth / 2 + 0.13 ), 0.33, axle ], 10 );
		parts.box( steel, [ 0.26, 0.03, 0.85 ], [ s * ( deckWidth / 2 + 0.13 ), 0.72, axle ] );

	}

	// Spill tray and 1,000 L poly tank at the front, the dosing cabinet and hose reel behind.
	const tankZ = dz - 0.75;
	parts.box( mat( 0x2c3e2e, { roughness: 0.7 } ), [ 1.3, 0.25, 1.3 ], [ 0, deck, tankZ ] );
	parts.cylinder( POLY(), 0.55, 1.1, [ 0, deck + 0.05, tankZ ], 24 );
	parts.sphere( POLY(), 0.55, [ 0, deck + 1.15, tankZ ], [ 24, 6 ], [ 1, 0.2, 1 ] );
	parts.cylinder( mat( 0xd8b62a, { roughness: 0.5 } ), 0.12, 0.08, [ 0, deck + 1.22, tankZ ], 14 );
	parts.box( CABINET(), [ 1.2, 1.25, 0.6 ], [ 0, deck, dz + 0.35 ] );
	parts.box( mat( 0x8f9599, { roughness: 0.5, metalness: 0.5 } ), [ 0.02, 1.0, 0.45 ], [ - 0.61, deck + 0.12, dz + 0.35 ] );
	parts.box( mat( 0x8f9599, { roughness: 0.5, metalness: 0.5 } ), [ 0.02, 1.0, 0.45 ], [ 0.61, deck + 0.12, dz + 0.35 ] );
	for ( let i = 0; i < 4; i ++ ) parts.box( mat( 0x2a2e31, { roughness: 0.6 } ), [ 0.6, 0.025, 0.01 ], [ 0, deck + 0.9 + i * 0.07, dz + 0.04 ] );
	parts.path( PIPE(), [ [ 0.3, deck + 0.3, tankZ + 0.5 ], [ 0.3, deck + 0.3, dz + 0.05 ] ], 0.02, 6 );

	const reelZ = dz + 1.15;
	for ( const x of [ - 0.4, 0.4 ] ) {

		disc( parts, steel, 0.3, 0.02, [ x, deck + 0.42, reelZ ], 18 );
		parts.box( steel, [ 0.04, 0.42, 0.04 ], [ x, deck, reelZ ] );

	}

	disc( parts, mat( 0x2c63b8, { roughness: 0.6 } ), 0.24, 0.78, [ 0, deck + 0.42, reelZ ], 18 );
	parts.box( mat( 0xd8b62a, { roughness: 0.5 } ), [ 0.35, 0.06, 0.02 ], [ 0, deck + 0.3, deckLength / 2 + dz + 0.01 ] );
	return parts.build();

}

// --- trash pump ------------------------------------------------------------------------------

// A 4 in (100 mm) diesel trash pump in its frame, with suction hose out the front (-Z) to a
// strainer in the sump and lay-flat discharge hose out the back.
export function trashPump() {

	const parts = new Parts();
	const frame = mat( 0x3a3f44, { roughness: 0.6, metalness: 0.5 } );
	const lx = 0.9;
	const lz = 1.4;
	const hy = 1.0;
	// Roll-cage frame with a lifting eye.
	for ( const x of [ - lx / 2, lx / 2 ] ) {

		parts.path( frame, [ [ x, 0.04, - lz / 2 ], [ x, hy, - lz / 2 + 0.15 ], [ x, hy, lz / 2 - 0.15 ], [ x, 0.04, lz / 2 ] ], 0.025, 6 );
		parts.rod( frame, [ x, 0.04, - lz / 2 ], [ x, 0.04, lz / 2 ], 0.03, 6 );

	}

	for ( const z of [ - lz / 2 + 0.15, lz / 2 - 0.15 ] ) parts.rod( frame, [ - lx / 2, hy, z ], [ lx / 2, hy, z ], 0.025, 6 );
	for ( const z of [ - lz / 2, lz / 2 ] ) parts.rod( frame, [ - lx / 2, 0.04, z ], [ lx / 2, 0.04, z ], 0.03, 6 );
	parts.rod( frame, [ 0, hy, - 0.2 ], [ 0, hy, 0.2 ], 0.025, 6 );
	parts.rod( frame, [ 0, hy, 0 ], [ 0, hy + 0.12, 0 ], 0.02, 6 );

	// Engine and fuel tank, the pump's volute at the front with the suction port facing -Z and the
	// discharge port on top.
	const paint = PUMP();
	parts.box( paint, [ 0.6, 0.55, 0.65 ], [ 0, 0.1, 0.3 ] );
	parts.box( BLACK(), [ 0.62, 0.08, 0.5 ], [ 0, 0.65, 0.3 ] );
	parts.box( paint, [ 0.7, 0.22, 0.35 ], [ 0, 0.1, - 0.18 ] );
	discZ( parts, paint, 0.27, 0.3, [ 0, 0.45, - 0.45 ], 20 );
	discZ( parts, STEEL(), 0.1, 0.12, [ 0, 0.4, - 0.66 ], 14 );
	parts.rod( STEEL(), [ 0, 0.62, - 0.45 ], [ 0, 0.85, - 0.45 ], 0.07, 12 );
	parts.rod( STEEL(), [ 0, 0.85, - 0.45 ], [ 0, 0.85, - 0.2 ], 0.07, 12 );
	parts.sphere( STEEL(), 0.07, [ 0, 0.85, - 0.45 ], [ 12, 6 ] );
	parts.cylinder( BLACK(), 0.04, 0.25, [ 0.2, 0.65, 0.5 ], 8 );

	// Suction: ribbed black hose dipping into the sump 3 m ahead, ending in a strainer.
	const suction = new CatmullRomCurve3( [ [ 0, 0.4, - 0.72 ], [ 0, 0.38, - 1.2 ], [ 0.25, 0.15, - 2.0 ], [ 0.35, 0.12, - 2.9 ], [ 0.3, 0.2, - 3.45 ] ].map( p => new Vector3( ...p ) ) );
	parts.add( HOSE(), new TubeGeometry( suction, 40, 0.062, 10, false ) );
	for ( let i = 1; i < 30; i ++ ) {

		const p = suction.getPointAt( i / 30 );
		const t = suction.getTangentAt( i / 30 );
		parts.rod( HOSE(), p.clone().addScaledVector( t, - 0.012 ).toArray(), p.clone().addScaledVector( t, 0.012 ).toArray(), 0.07, 10 );

	}

	const end = suction.getPointAt( 1 );
	parts.rod( GALVANISED(), [ end.x, end.y, end.z ], [ end.x, end.y, end.z - 0.35 ], 0.1, 12 );

	// Discharge: blue lay-flat hose, flat on the ground, 5 m back in a lazy curve.
	const discharge = new CatmullRomCurve3( [ [ 0, 0.85, - 0.2 ], [ 0, 0.85, 0.15 ], [ 0.05, 0.5, 0.85 ], [ 0.15, 0.02, 1.4 ], [ 0.6, 0.02, 2.8 ], [ 0.2, 0.02, 4.2 ], [ - 0.3, 0.02, 5.4 ] ].map( p => new Vector3( ...p ) ) );
	const flat = new TubeGeometry( discharge, 60, 0.08, 10, false );
	// Squash it where it lies on the ground: full and round while it's still in the air.
	const position = flat.attributes.position;
	const centre = new Vector3();
	for ( let i = 0; i < position.count; i ++ ) {

		const ring = Math.floor( i / 11 ) / 60;
		discharge.getPointAt( Math.min( ring, 1 ), centre );
		const onGround = Math.min( 1, Math.max( 0, ( 0.3 - centre.y ) / 0.25 ) );
		const y = position.getY( i );
		position.setY( i, Math.max( 0.004, centre.y + ( y - centre.y ) * ( 1 - onGround * 0.85 ) + onGround * 0.015 ) );
		position.setX( i, centre.x + ( position.getX( i ) - centre.x ) * ( 1 + onGround * 0.6 ) );

	}

	flat.computeVertexNormals();
	parts.add( LAYFLAT(), flat );
	return parts.build();

}

// --- dewatering bag --------------------------------------------------------------------------

// A filled geotextile dewatering bag, 15 x 30 ft, about 1.4 m high: a pillow with steep sides and
// a fill spout near the front (-Z) end.
export function dewateringBag( width = 15 * FT, length = 30 * FT, height = 1.4 ) {

	const parts = new Parts();
	const geometry = new SphereGeometry( 1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2 );
	const position = geometry.attributes.position;
	for ( let i = 0; i < position.count; i ++ ) {

		const x = position.getX( i );
		const y = position.getY( i );
		const z = position.getZ( i );
		const ring = Math.hypot( x, z );
		const angle = Math.atan2( z, x );
		// Rounded-rectangle plan, steep sides and a flattish top.
		const c = Math.cos( angle );
		const s = Math.sin( angle );
		const spread = ring ** 0.3;
		position.setXYZ( i,
			width / 2 * spread * Math.sign( c ) * Math.abs( c ) ** 0.45,
			height * y ** 0.55,
			length / 2 * spread * Math.sign( s ) * Math.abs( s ) ** 0.45,
		);

	}

	geometry.computeVertexNormals();
	parts.add( GEOTEXTILE(), geometry );

	// The fill spout: a sleeve out of the top, tied off and folded over.
	const spoutZ = - length / 2 + 1.2;
	const top = height * 0.95;
	parts.rod( GEOTEXTILE(), [ 0, top - 0.1, spoutZ ], [ 0, top + 0.02, spoutZ + 0.45 ], [ 0.12, 0.08 ], 12 );
	parts.rod( BLACK(), [ 0, top - 0.02, spoutZ + 0.2 ], [ 0, top - 0.01, spoutZ + 0.24 ], 0.11, 12 );
	return parts.build();

}
