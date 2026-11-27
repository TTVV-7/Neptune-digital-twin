import { CylinderGeometry, MathUtils, PlaneGeometry } from 'three';
import { drawn, FT, GLASS, IN, mat, Parts, RUBBER } from './parts.js';
import { memberGeometry } from './plant-parts.js';

// Utility line and underground utility equipment, built in code at the sizes of common North
// American units of each class (no brands): a digger derrick, pole and wire reel trailers, a
// puller-tensioner, cable reels on jacks and stands, a vibratory cable plow, PVC conduit, a precast
// handhole and vault, a duct bank, a splicing tent, a sewer jetter, a hydrant meter and a bypass
// pump with its line. Like the other built-in pieces each stands on y = 0 with its front facing -Z
// (+X on its right).

const DEG = MathUtils.DEG2RAD;

export const UTILITY_PLANT_ITEMS = [
	// Overhead line work.
	{ id: 'digger-derrick-47ft', name: 'Digger derrick truck (47 ft sheave height, tandem, boom stowed)', category: 'Utilities',
		keywords: 'digger derrick line truck pole truck auger truck power line utility pole setting hydro lineman boom stowed travel',
		build: () => diggerDerrick( false ) },
	{ id: 'digger-derrick-47ft-working', name: 'Digger derrick truck (47 ft, outriggers down, augering a pole hole)', category: 'Utilities',
		keywords: 'digger derrick line truck pole truck auger truck drilling pole hole power line utility pole setting hydro lineman working',
		build: () => diggerDerrick( true ) },
	{ id: 'pole-trailer-loaded', name: 'Pole trailer, tandem, loaded with 9 wood poles (45 ft class 2)', category: 'Utilities',
		keywords: 'pole trailer pole dolly wood poles utility poles power poles hydro poles pole haul reach trailer lineman',
		build: poleTrailer },
	{ id: 'wire-reel-trailer', name: 'Wire reel trailer, single reel (84 in reel of conductor, tandem)', category: 'Utilities',
		keywords: 'reel trailer wire trailer conductor reel cable reel trailer hydraulic reel lift stringing lineman power line',
		build: wireReelTrailer },
	{ id: 'wire-reel-trailer-3', name: 'Wire reel trailer, 3-reel (3 × 60 in reels of conductor, tandem)', category: 'Utilities',
		keywords: 'multi reel trailer three reel trailer wire trailer conductor reels 3 phase stringing lineman power line',
		build: multiReelTrailer },
	{ id: 'puller-tensioner-bullwheel', name: 'Conductor puller-tensioner, bullwheel trailer (2 × 60 in bullwheels)', category: 'Utilities',
		keywords: 'tensioner puller bullwheel bull wheel stringing conductor pulling wire pulling sock line power line transmission lineman',
		build: pullerTensioner },
	{ id: 'cable-reel-jacks', name: 'Cable reel on reel jacks (72 in reel of primary cable, spindle on screw-jack stands)', category: 'Utilities',
		keywords: 'reel jacks reel stands cable dolly spindle payoff primary cable urd underground cable reel wire pull',
		build: cableReelJacks },
	// Underground.
	{ id: 'cable-plow-vibratory', name: 'Vibratory cable plow, tracked (100 hp class, 36 in plow, with duct reel)', category: 'Heavy equipment',
		keywords: 'vibratory plow cable plow vibe plow ride on plow tracked crawler conduit duct fibre fiber install direct bury',
		build: cablePlow },
	{ id: 'hdpe-duct-reel-stands', name: 'HDPE conduit reel on stands (2 in orange duct, 96 in steel reel)', category: 'Utilities',
		keywords: 'hdpe duct conduit reel innerduct orange duct fibre fiber reel stand payoff coil directional drilling hdd',
		build: ductReelStands },
	{ id: 'pvc-conduit-bundle-4in', name: 'PVC conduit bundle, Schedule 40 (24 × 4 in × 10 ft, framed, on dunnage)', category: 'Materials',
		keywords: 'pvc conduit duct electrical conduit sch 40 schedule 40 4 inch bundle lift grey gray pipe',
		build: conduitBundle },
	{ id: 'handhole-24x36', name: 'Precast concrete pull box / handhole (24 × 36 × 24 in, with cover)', category: 'Utilities',
		keywords: 'pull box handhole hand hole splice box precast concrete box electrical vault lid cover junction box',
		build: handhole },
	{ id: 'utility-vault-8x12', name: 'Precast utility vault, 8 × 12 ft inside (7 ft deep, top slab with 3 × 4 ft hatch, ~26 t)', category: 'Utilities',
		keywords: 'utility vault precast vault electrical vault manhole splice vault transformer vault hatch top slab underground',
		build: utilityVault },
	// A row of them (rows.js) lays the 10 ft runs end to end, the spacers every 5 ft right through.
	{ id: 'duct-bank-6way', name: 'Duct bank on spacers, 6-way (2 × 3 × 4 in PVC, 10 ft run)', category: 'Utilities',
		keywords: 'duct bank ductbank conduit spacers chairs pvc ducts electrical underground before pour encasement',
		build: ductBank, rowLength: 10 * FT },
	{ id: 'splicing-tent-heater', name: 'Cable splicing tent (8 × 8 ft pop-up) with propane heater', category: 'Utilities',
		keywords: 'splicing tent splice tent manhole tent cable splicer heater hi vis tent fibre fiber splicing',
		build: splicingTent },
	// Water and sewer.
	{ id: 'sewer-jetter-trailer', name: 'Sewer jetter trailer (4,000 psi, 600 gal, 500 ft hose reel)', category: 'Utilities',
		keywords: 'sewer jetter hydro jetter jet rodder flusher drain cleaning trailer jetter sewer cleaning line flushing',
		build: jetterTrailer },
	{ id: 'hydrant-meter-backflow', name: 'Hydrant meter with RPZ backflow preventer on a fire hydrant (3 in meter, 2½ in hose)', category: 'Utilities',
		keywords: 'hydrant meter backflow preventer rpz water meter fire hydrant construction water hydrant use permit hose',
		build: hydrantMeter },
	{ id: 'bypass-pump-6in', name: 'Bypass pump, 6 in diesel dry-prime on trailer (sound attenuated)', category: 'Utilities',
		keywords: 'bypass pump sewer bypass dri prime dry prime godwin 6 inch diesel pump trailer pumping sewage overpumping',
		build: bypassPump },
	// A row of them (rows.js) lays the 40 ft sticks end to end, as if fused into one line.
	{ id: 'bypass-line-hdpe-6in', name: 'HDPE bypass line, 6 in DR17 (40 ft fused section)', category: 'Utilities',
		keywords: 'bypass line hdpe pipe fused pipe discharge line sewer bypass overpumping 6 inch black poly pipe',
		build: bypassLine, rowLength: 40 * FT },
];

// --- shared ----------------------------------------------------------------------------------

const paint = color => mat( color, { roughness: 0.5, metalness: 0.2 } );
const plastic = color => mat( color, { roughness: 0.6 } );
const DARK = () => mat( 0x2c2e31, { roughness: 0.7, metalness: 0.2 } );
const STEEL = () => mat( 0x7d8287, { roughness: 0.5, metalness: 0.6 } );
const BRIGHT = () => mat( 0xc9ccce, { roughness: 0.35, metalness: 0.3 } );
const FRAME = () => mat( 0x2a2b2d, { roughness: 0.6, metalness: 0.4 } );
const TIMBER = () => mat( 0x9c7a50, { roughness: 0.95 } );
const CONCRETE = () => mat( 0xa3a19b, { roughness: 0.95 } );
const HOSE = () => mat( 0x1f2022, { roughness: 0.75 } );
const CONDUCTOR = () => mat( 0xb9bdbf, { roughness: 0.35, metalness: 0.75 } );
const LAMP = () => mat( 0xfff3c9, { roughness: 0.3, emissive: 0x6b6040 } );
const AMBER = () => mat( 0xff9a1a, { roughness: 0.3, emissive: 0xc76a00, emissiveIntensity: 0.6 } );
const RED_LAMP = () => mat( 0xb3141b, { roughness: 0.3, emissive: 0x7a0a0e, emissiveIntensity: 0.6 } );

// A tyre on its rim, axle across x, centred on [ x, y, z ].
function tyre( parts, radius, width, [ x, y, z ], rim = STEEL() ) {

	parts.rod( RUBBER(), [ x - width / 2, y, z ], [ x + width / 2, y, z ], radius, 20 );
	parts.rod( rim, [ x - width / 2 - 0.004, y, z ], [ x + width / 2 + 0.004, y, z ], radius * 0.55, 14 );

}

// A box of cross-section [ across, up ] from one point to another.
function member( parts, material, section, from, to ) {

	parts.add( material, memberGeometry( section, from, to ) );

}

// A sheet of plate as a polygon of [ z, y ] points `thick` across x, centred on x.
function plate( parts, material, points, thick, x ) {

	parts.prism( material, points, thick, x );

}

// Points along a line: a + ( b - a ) t.
const lerp = ( a, b, t ) => a.map( ( v, i ) => v + ( b[ i ] - v ) * t );

// A timber block (dunnage) lying across x.
function dunnage( parts, length, [ x, z ], size = [ 4 * IN, 4 * IN ] ) {

	parts.box( TIMBER(), [ length, size[ 1 ], size[ 0 ] ], [ x, 0, z ] );

}

// A trailer's frame and running gear: two rails from z0 to z1 with their tops at deckY and cross
// members between, an A-frame tongue to the coupler `tongue` ahead of z0, a tongue jack, the axles
// at `axleZ` (wheels `wheelX` out from the middle, fenders over them) and tail lamps. Returns the
// coupler's z.
function trailerChassis( parts, { z0, z1, deckY, railX = 0.45, tongue = 1.5, axleZ = [ 0 ], wheelX = 0.9, r = 0.37, tyreWidth = 0.22, fenders = true, frame = FRAME() } ) {

	const length = z1 - z0;
	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ 0.1, 0.18, length ], [ s * railX, deckY - 0.18, ( z0 + z1 ) / 2 ] );
	const crossings = Math.max( 2, Math.round( length / 0.9 ) );
	for ( let i = 0; i <= crossings; i ++ ) parts.box( frame, [ railX * 2, 0.1, 0.07 ], [ 0, deckY - 0.16, z0 + 0.05 + i * ( length - 0.1 ) / crossings ] );

	// Tongue, coupler and the jack with its foot on the ground.
	const hitch = z0 - tongue;
	const hitchY = 0.48;
	for ( const s of [ - 1, 1 ] ) member( parts, frame, [ 0.09, 0.12 ], [ s * railX, deckY - 0.1, z0 + 0.5 ], [ s * 0.05, hitchY + 0.08, hitch + 0.3 ] );
	parts.box( DARK(), [ 0.13, 0.1, 0.38 ], [ 0, hitchY, hitch + 0.17 ] );
	const jackZ = hitch + 0.75;
	const jackTop = MathUtils.lerp( hitchY + 0.08, deckY - 0.1, ( jackZ - hitch - 0.3 ) / ( z0 + 0.5 - hitch - 0.3 ) ) + 0.25;
	parts.rod( DARK(), [ 0.17, 0.08, jackZ ], [ 0.17, jackTop, jackZ ], 0.035, 8 );
	parts.box( DARK(), [ 0.16, 0.06, 0.16 ], [ 0.17, 0, jackZ ] );
	parts.rod( STEEL(), [ 0.17, jackTop, jackZ ], [ 0.32, jackTop, jackZ ], 0.012, 6 );

	// Axles, wheels and fenders over each side's group of wheels.
	for ( const z of axleZ ) {

		parts.rod( DARK(), [ - wheelX, r, z ], [ wheelX, r, z ], 0.045, 8 );
		for ( const s of [ - 1, 1 ] ) tyre( parts, r, tyreWidth, [ s * wheelX, r, z ] );

	}

	const za = Math.min( ...axleZ ) - r - 0.06;
	const zb = Math.max( ...axleZ ) + r + 0.06;
	const top = 2 * r + 0.07;
	if ( fenders ) {

		for ( const s of [ - 1, 1 ] ) {

			plate( parts, frame, [ [ za, r ], [ za + 0.15, top ], [ zb - 0.15, top ], [ zb, r ] ], tyreWidth + 0.1, s * wheelX );

		}

	}

	for ( const s of [ - 1, 1 ] ) parts.box( RED_LAMP(), [ 0.12, 0.07, 0.02 ], [ s * ( railX + 0.05 ), deckY - 0.15, z1 + 0.01 ] );
	return hitch;

}

// A reel lying with its axle across x, centred on c: two flanges of `radius`, the drum wound out to
// `wound` with `cable`, and the hubs. Wooden flanges are plain discs, steel ones have ribs.
function reel( parts, [ x, y, z ], { radius, width, wound, cable, flange = TIMBER(), steel = false } ) {

	const half = width / 2;
	const t = steel ? 0.03 : 0.065;
	for ( const s of [ - 1, 1 ] ) {

		const fx = x + s * ( half - t / 2 );
		parts.rod( flange, [ fx - t / 2, y, z ], [ fx + t / 2, y, z ], radius, 32 );
		const out = fx + s * t / 2;
		parts.rod( DARK(), [ out, y, z ], [ out + s * 0.02, y, z ], 0.12, 12 );
		if ( steel ) {

			// Ribs across the outside of the flange, and its rolled rim.
			for ( let i = 0; i < 4; i ++ ) parts.block( flange, [ 0.035, radius * 1.9, 0.06 ], [ out + s * 0.015, y, z ], [ i * 45 * DEG, 0, 0 ] );
			parts.rod( flange, [ fx - t, y, z ], [ fx + t, y, z ], radius + 0.012, 32, true );

		}

	}

	parts.rod( cable, [ x - half + t, y, z ], [ x + half - t, y, z ], wound, 32 );

}

// An earth auger from `top` straight down to its point at `bottom` (y): the flights as discs every
// `pitch` around a core, and a pilot point.
function auger( parts, [ x, z ], top, bottom, radius, steel = STEEL() ) {

	parts.rod( DARK(), [ x, bottom + 0.2, z ], [ x, top, z ], radius * 0.35, 10 );
	for ( let y = bottom + 0.25; y < top - 0.05; y += radius * 0.9 ) {

		const [ dy, dz ] = [ Math.cos( 12 * DEG ) * 0.012, Math.sin( 12 * DEG ) * 0.012 ];
		parts.rod( steel, [ x, y - dy, z - dz ], [ x, y + dy, z + dz ], radius, 18 );

	}

	parts.rod( steel, [ x, bottom, z ], [ x, bottom + 0.25, z ], [ 0.01, radius * 0.5 ], 8 );

}

// The same auger lying along z (its point towards -Z), centred on [ x, y ] from z0 to z1.
function augerFlat( parts, [ x, y ], z0, z1, radius, steel = STEEL() ) {

	parts.rod( DARK(), [ x, y, z0 + 0.2 ], [ x, y, z1 ], radius * 0.35, 10 );
	for ( let z = z0 + 0.25; z < z1 - 0.05; z += radius * 0.9 ) {

		const [ dx, dz ] = [ Math.sin( 12 * DEG ) * 0.012, Math.cos( 12 * DEG ) * 0.012 ];
		parts.rod( steel, [ x - dx, y, z - dz ], [ x + dx, y, z + dz ], radius, 18 );

	}

	parts.rod( steel, [ x, y, z0 ], [ x, y, z0 + 0.25 ], [ 0.01, radius * 0.5 ], 8 );

}

// A conventional medium-duty truck's front end and four-door crew cab (as line crews use): the
// bumper at z = front, the hood and fenders, the grille and lamps, then the cab with its glass, a
// beacon on the roof and steps under the doors. Returns the back of the cab.
function truckFront( parts, body, front, width = 2.44 ) {

	parts.box( DARK(), [ width - 0.1, 0.32, 0.22 ], [ 0, 0.36, front + 0.11 ] );
	plate( parts, body, [ [ front + 0.22, 0.85 ], [ front + 0.22, 1.55 ], [ front + 0.35, 1.68 ], [ front + 1.75, 1.82 ], [ front + 1.75, 0.85 ] ], 1.35, 0 );
	for ( const s of [ - 1, 1 ] ) {

		plate( parts, body, [ [ front + 0.3, 0.9 ], [ front + 0.45, 1.2 ], [ front + 1.6, 1.2 ], [ front + 1.8, 0.9 ] ], 0.45, s * 0.98 );
		parts.box( LAMP(), [ 0.2, 0.12, 0.03 ], [ s * 0.98, 1.04, front + 0.3 ] );

	}

	parts.box( BRIGHT(), [ 1.1, 0.62, 0.04 ], [ 0, 0.9, front + 0.21 ] );

	const cab0 = front + 1.7;
	const cab1 = cab0 + 2.65;
	plate( parts, body, [ [ cab0, 0.9 ], [ cab0, 1.85 ], [ cab0 + 0.35, 2.62 ], [ cab0 + 0.5, 2.7 ], [ cab1, 2.7 ], [ cab1, 0.9 ] ], 2.3, 0 );
	const screen = Math.atan2( 0.35, 0.77 );
	parts.block( GLASS(), [ 2.1, 0.8, 0.01 ], [ 0, 2.235, cab0 + 0.175 - 0.008 ], [ screen, 0, 0 ] );
	for ( const s of [ - 1, 1 ] ) {

		// Front and rear door glass, door seams, a mirror, steps and the fuel tank.
		parts.box( GLASS(), [ 0.01, 0.6, 1.05 ], [ s * 1.154, 1.95, cab0 + 0.95 ] );
		parts.box( GLASS(), [ 0.01, 0.6, 0.9 ], [ s * 1.154, 1.95, cab0 + 2.05 ] );
		for ( const z of [ cab0 + 1.55, cab1 - 0.05 ] ) parts.box( DARK(), [ 0.01, 1.7, 0.02 ], [ s * 1.153, 0.95, z ] );
		parts.box( DARK(), [ 0.04, 0.4, 0.22 ], [ s * 1.32, 1.9, cab0 + 0.2 ] );
		parts.rod( DARK(), [ s * 1.15, 2.05, cab0 + 0.2 ], [ s * 1.3, 2.05, cab0 + 0.2 ], 0.015, 6 );
		parts.box( DARK(), [ 0.28, 0.05, 1.8 ], [ s * 1.05, 0.55, cab0 + 1.3 ] );

	}

	parts.box( DARK(), [ 1.2, 0.04, 0.24 ], [ 0, 2.7, cab0 + 0.6 ] );
	parts.box( AMBER(), [ 1.15, 0.08, 0.2 ], [ 0, 2.74, cab0 + 0.6 ] );
	return cab1;

}

// --- digger derrick --------------------------------------------------------------------------

// A digger derrick of the 47 ft sheave height class on a tandem-axle crew cab chassis (about
// 10.4 m long, 2.6 m wide and 3.6 m high travelling): a utility body with compartments each side,
// the turret on its pedestal at the back, the three-section boom with its pole guide at the tip,
// and the 18 in auger. Stowed, the boom lies forward on its rest over the cab with the auger
// clipped beside it and the outriggers up. Working, the outriggers are down, the boom is slewed to
// the right and raised, and the auger hangs from its tip drilling a pole hole about 8.5 m out.
function diggerDerrick( working ) {

	const parts = new Parts();
	const white = paint( 0xeceeea );
	const grey = paint( 0x5d6166 );
	const deck = mat( 0x6d7175, { roughness: 0.6, metalness: 0.5 } );
	const front = - 5.2;
	const rear = 5.2;
	const width = 2.44;
	const r = 0.53;

	// Frame rails, the front axle and the tandem duals.
	for ( const x of [ - 0.45, 0.45 ] ) parts.box( DARK(), [ 0.1, 0.3, rear - front - 0.4 ], [ x, 0.78, ( front + rear ) / 2 ] );
	const frontAxle = front + 1.05;
	const tandem = [ 1.82, 3.18 ];
	for ( const s of [ - 1, 1 ] ) {

		tyre( parts, r, 0.3, [ s * 1.0, r, frontAxle ], BRIGHT() );
		for ( const z of tandem ) for ( const d of [ - 1, 1 ] ) tyre( parts, r, 0.26, [ s * 0.92 + d * 0.145, r, z ], BRIGHT() );

	}

	for ( const z of [ frontAxle, ...tandem ] ) parts.rod( DARK(), [ - 0.9, r, z ], [ 0.9, r, z ], 0.07, 8 );
	const cab1 = truckFront( parts, white, front, width );

	// Utility body: a floor between compartments that run low ahead of and behind the wheels and sit
	// above them over the tandem, with door seams, handles and fenders.
	const b0 = cab1 + 0.55;
	const b1 = rear - 0.45;
	const floor = 1.12;
	parts.box( deck, [ width - 1.1, 0.1, b1 - b0 ], [ 0, floor - 0.1, ( b0 + b1 ) / 2 ] );
	const wells = [ tandem[ 0 ] - r - 0.12, tandem[ 1 ] + r + 0.12 ];
	for ( const s of [ - 1, 1 ] ) {

		const x = s * ( width / 2 - 0.275 );
		for ( const [ z0, z1, y0 ] of [ [ b0, wells[ 0 ], 0.62 ], [ wells[ 0 ], wells[ 1 ], 1.2 ], [ wells[ 1 ], b1, 0.62 ] ] ) {

			parts.box( white, [ 0.55, 1.78 - y0, z1 - z0 ], [ x, y0, ( z0 + z1 ) / 2 ] );
			parts.box( DARK(), [ 0.012, 1.7 - y0, 0.02 ], [ s * ( width / 2 + 0.001 ), y0 + 0.04, z1 - 0.03 ] );
			parts.box( DARK(), [ 0.02, 0.04, 0.16 ], [ s * ( width / 2 + 0.005 ), 1.45, ( z0 + z1 ) / 2 ] );

		}

		parts.box( DARK(), [ 0.56, 0.03, wells[ 1 ] - wells[ 0 ] ], [ x, 1.17, ( wells[ 0 ] + wells[ 1 ] ) / 2 ] );
		parts.box( mat( 0x111213 ), [ 0.55, 0.6, 0.02 ], [ s * 0.92, 0.2, wells[ 1 ] + 0.02 ] );

	}

	// Rear bumper and lamps.
	parts.box( DARK(), [ width - 0.1, 0.2, 0.2 ], [ 0, 0.55, rear - 0.1 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( RED_LAMP(), [ 0.16, 0.1, 0.02 ], [ s * 1.0, 0.95, b1 + 0.005 ] );

	// Outriggers behind the cab and at the back: up beside the body for travel, or out and down
	// onto pads.
	for ( const z of [ cab1 + 0.28, rear - 0.25 ] ) {

		parts.box( grey, [ 2.0, 0.26, 0.3 ], [ 0, 0.72, z ] );
		for ( const s of [ - 1, 1 ] ) {

			if ( working ) {

				member( parts, grey, [ 0.22, 0.24 ], [ s * 0.9, 0.95, z ], [ s * 2.35, 0.2, z ] );
				parts.rod( mat( 0x1e1f21 ), [ s * 1.2, 1.15, z ], [ s * 1.9, 0.5, z ], 0.05, 10 );
				parts.cylinder( grey, 0.08, 0.2, [ s * 2.4, 0.06, z ], 10 );
				parts.box( mat( 0xd9c25b, { roughness: 0.8 } ), [ 0.6, 0.06, 0.6 ], [ s * 2.4, 0, z ] );

			} else {

				parts.box( grey, [ 0.2, 0.75, 0.24 ], [ s * ( width / 2 + 0.06 ), 0.45, z ] );
				parts.box( DARK(), [ 0.3, 0.05, 0.3 ], [ s * ( width / 2 + 0.06 ), 0.4, z ] );

			}

		}

	}

	// The boom rest behind the cab, its saddle under the boom.
	const restZ = cab1 + 0.62;
	const pivotY = 3.25;
	for ( const x of [ - 0.45, 0.45 ] ) parts.box( grey, [ 0.1, pivotY - 0.29 - floor, 0.12 ], [ x, floor, restZ ] );
	parts.box( grey, [ 1.0, 0.1, 0.16 ], [ 0, pivotY - 0.39, restZ ] );
	for ( const s of [ - 1, 1 ] ) parts.block( grey, [ 0.06, 0.24, 0.16 ], [ s * 0.3, pivotY - 0.22, restZ ], [ 0, 0, s * 25 * DEG ] );

	// Turret on a pedestal at the back of the body.
	const turretZ = 3.75;
	const turretTop = 2.85;
	parts.box( grey, [ 0.95, turretTop - 0.3 - floor, 0.95 ], [ 0, floor, turretZ ] );
	parts.cylinder( grey, 0.6, 0.3, [ 0, turretTop - 0.3, turretZ ], 24 );

	// The boom: its slewing direction (h, level) and how far it's raised.
	const slew = working ? 90 * DEG : 0;
	const h = [ Math.sin( slew ), 0, - Math.cos( slew ) ];
	const side = [ - h[ 2 ], 0, h[ 0 ] ];
	const lift = working ? 22 * DEG : 0.5 * DEG;
	const dir = [ h[ 0 ] * Math.cos( lift ), Math.sin( lift ), h[ 2 ] * Math.cos( lift ) ];
	const up = [ - h[ 0 ] * Math.sin( lift ), Math.cos( lift ), - h[ 2 ] * Math.sin( lift ) ];
	const pivot = [ - h[ 0 ] * 0.35, pivotY, turretZ - h[ 2 ] * 0.35 ];
	const along = ( t, n = 0, s = 0 ) => [ 0, 1, 2 ].map( i => pivot[ i ] + dir[ i ] * t + up[ i ] * n + side[ i ] * s );

	// Turret side plates either side of the boom's heel, turned with it.
	const yaw = Math.atan2( - h[ 0 ], - h[ 2 ] );
	for ( const s of [ - 1, 1 ] ) {

		const c = [ pivot[ 0 ] + side[ 0 ] * s * 0.3 + h[ 0 ] * 0.25, turretTop + 0.3, pivot[ 2 ] + side[ 2 ] * s * 0.3 + h[ 2 ] * 0.25 ];
		parts.block( grey, [ 0.06, 0.7, 1.0 ], c, [ 0, yaw, 0 ] );

	}

	parts.rod( STEEL(), along( 0, 0, - 0.36 ), along( 0, 0, 0.36 ), 0.07, 10 );

	// Three sections, nested: 8.1 m from the pivot to the tip retracted, run out to 9.2 working.
	const length = working ? 9.2 : 8.1;
	const e = ( length - 8.1 ) / 2;
	member( parts, white, [ 0.46, 0.56 ], along( - 0.7 ), along( 5.4 ) );
	member( parts, white, [ 0.39, 0.48 ], along( 2.4 + e ), along( 6.9 + e ) );
	member( parts, white, [ 0.33, 0.41 ], along( 3.6 + 2 * e ), along( length ) );
	for ( const s of [ - 1, 1 ] ) member( parts, DARK(), [ 0.01, 0.06 ], along( 0.3, 0, s * 0.235 ), along( 5.2, 0, s * 0.235 ) );

	// The lift cylinder from the front of the turret to under the boom, and the winch on the heel.
	const ramFoot = [ h[ 0 ] * 0.45, turretTop + 0.05, turretZ + h[ 2 ] * 0.45 ];
	const ramTop = along( 2.4, - 0.28 );
	const split = lerp( ramFoot, ramTop, 0.55 );
	parts.rod( DARK(), ramFoot, split, 0.11, 12 );
	parts.rod( BRIGHT(), split, ramTop, 0.065, 10 );
	parts.rod( grey, along( - 0.45, 0.42, - 0.25 ), along( - 0.45, 0.42, 0.25 ), 0.16, 14 );

	// The tip: a sheave head and the pole guide's two claws under it.
	const tip = along( length + 0.1 );
	parts.rod( DARK(), along( length + 0.1, 0, - 0.2 ), along( length + 0.1, 0, 0.2 ), 0.2, 14 );
	member( parts, grey, [ 0.5, 0.12 ], along( length - 0.6, - 0.25 ), along( length - 0.1, - 0.25 ) );
	for ( const s of [ - 1, 1 ] ) {

		const top = along( length - 0.35, - 0.3, s * 0.22 );
		member( parts, mat( 0xe0b416, { roughness: 0.6 } ), [ 0.07, 0.07 ], top, [ top[ 0 ], top[ 1 ] - 0.32, top[ 2 ] ] );

	}

	if ( working ) {

		// The auger hung from the tip: its hanger, the auger motor, the kelly bar down to the flights
		// and the point in the ground.
		const [ x, , z ] = tip;
		parts.rod( DARK(), [ x, tip[ 1 ] - 0.15, z ], [ x, tip[ 1 ] - 0.55, z ], 0.05, 8 );
		parts.cylinder( grey, 0.22, 0.6, [ x, tip[ 1 ] - 1.15, z ], 16 );
		parts.cylinder( DARK(), 0.07, tip[ 1 ] - 1.15 - 2.3, [ x, 2.3, z ], 8 );
		auger( parts, [ x, z ], 2.4, 0, 0.23 );
		// Spoil round the hole.
		parts.cylinder( mat( 0x6e5a43, { roughness: 1 } ), 0.6, 0.08, [ x, 0, z ], 18, 0.35 );

	} else {

		// The auger clipped beside the boom on its stowage bracket, point forward.
		parts.box( grey, [ 0.3, 0.1, 0.12 ], [ 0.38, pivotY - 0.05, 0.4 ] );
		parts.cylinder( grey, 0.22, 0.5, [ 0.55, pivotY - 0.25, 2.2 ], 16 );
		augerFlat( parts, [ 0.55, pivotY ], - 0.6, 1.95, 0.23 );

	}

	return parts.build();

}

// --- pole trailer ----------------------------------------------------------------------------

// A tandem-axle pole trailer (about 14.6 m with its load, 2.4 m wide) carrying nine 45 ft class 2
// wood poles: a reach tube from the tongue to the axles, a bunk with stakes over the tongue and one
// over the axles, the poles stacked 4, 3, 2 with their butts at the back and chained down at each
// bunk.
function poleTrailer() {

	const parts = new Parts();
	const frame = paint( 0x2f3a45 );
	const pole = mat( 0x5e4a36, { roughness: 0.95 } );
	const chain = mat( 0x8a8f94, { roughness: 0.5, metalness: 0.7 } );
	const hitch = - 7.4;
	const frontBunk = - 5.5;
	const rearBunk = 1.6;
	const bunkTop = 1.05;
	const axles = [ 1.0, 2.2 ];
	const r = 0.38;

	// Tongue and reach: an A-frame to the front bunk, the square reach tube back to the axles.
	parts.box( DARK(), [ 0.13, 0.1, 0.38 ], [ 0, 0.48, hitch + 0.17 ] );
	for ( const s of [ - 1, 1 ] ) member( parts, frame, [ 0.1, 0.12 ], [ s * 0.06, 0.56, hitch + 0.3 ], [ s * 0.7, bunkTop - 0.35, frontBunk ] );
	parts.rod( DARK(), [ 0.17, 0.08, hitch + 0.8 ], [ 0.17, 0.85, hitch + 0.8 ], 0.035, 8 );
	parts.box( DARK(), [ 0.16, 0.06, 0.16 ], [ 0.17, 0, hitch + 0.8 ] );
	parts.box( frame, [ 0.16, 0.16, rearBunk - frontBunk + 1.2 ], [ 0, bunkTop - 0.5, ( frontBunk + rearBunk ) / 2 + 0.4 ] );
	member( parts, frame, [ 0.1, 0.1 ], [ 0, bunkTop - 0.45, frontBunk + 0.2 ], [ 0, bunkTop - 0.2, frontBunk + 1.4 ] );

	// The bunks, each a beam across with a stake at each end, on a short frame.
	for ( const z of [ frontBunk, rearBunk ] ) {

		parts.box( frame, [ 2.4, 0.2, 0.22 ], [ 0, bunkTop - 0.2, z ] );
		parts.box( frame, [ 0.3, bunkTop - 0.55, 0.3 ], [ 0, 0.35 + ( z === rearBunk ? 0.2 : 0 ), z ] );
		for ( const s of [ - 1, 1 ] ) parts.box( frame, [ 0.1, 0.85, 0.12 ], [ s * 1.15, bunkTop, z ] );

	}

	// The running gear under the rear bunk: springs on a frame, two axles, fenders.
	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ 0.12, 0.16, 2.2 ], [ s * 0.75, r + 0.2, ( axles[ 0 ] + axles[ 1 ] ) / 2 ] );
	parts.box( frame, [ 1.6, 0.12, 0.2 ], [ 0, r + 0.25, rearBunk ] );
	for ( const z of axles ) {

		parts.rod( DARK(), [ - 0.9, r, z ], [ 0.9, r, z ], 0.045, 8 );
		for ( const s of [ - 1, 1 ] ) tyre( parts, r, 0.22, [ s * 0.95, r, z ] );

	}

	for ( const s of [ - 1, 1 ] ) {

		plate( parts, frame, [ [ axles[ 0 ] - r - 0.08, r + 0.2 ], [ axles[ 0 ] - r + 0.08, 2 * r + 0.08 ], [ axles[ 1 ] + r - 0.08, 2 * r + 0.08 ], [ axles[ 1 ] + r + 0.08, r + 0.2 ] ], 0.32, s * 0.95 );
		parts.box( RED_LAMP(), [ 0.12, 0.07, 0.02 ], [ s * 0.9, 0.8, axles[ 1 ] + r + 0.1 ] );

	}

	// Nine poles, 4-3-2: each placed at its butt (15 in) and its top (8.5 in) so the rows touch at
	// both ends as they taper.
	const length = 45 * FT;
	const butt = 7.5 * IN;
	const top = 4.25 * IN;
	const zButt = 7.2;
	const zTop = zButt - length;
	const stack = ( radius ) => {

		const spots = [];
		const rows = [ 4, 3, 2 ];
		rows.forEach( ( count, row ) => {

			for ( let i = 0; i < count; i ++ ) {

				const x = ( i - ( count - 1 ) / 2 ) * radius * 2.02;
				const y = bunkTop + radius + row * radius * Math.sqrt( 3 ) * 1.01;
				spots.push( [ x, y ] );

			}

		} );
		return spots;

	};

	const at = stack( butt );
	const ta = stack( top );
	// The bunk heights the poles rest on: the stack's line from the butt to the top, at each bunk.
	for ( let i = 0; i < at.length; i ++ ) {

		parts.rod( pole, [ at[ i ][ 0 ], at[ i ][ 1 ], zButt ], [ ta[ i ][ 0 ], ta[ i ][ 1 ], zTop ], [ butt, top ], 12 );

	}

	// Chains over the load at each bunk.
	for ( const z of [ frontBunk, rearBunk ] ) {

		const t = ( zButt - z ) / length;
		const radius = MathUtils.lerp( butt, top, t );
		const high = bunkTop + radius * 2 + 2 * radius * Math.sqrt( 3 ) * 1.01 + 0.01;
		const wide = 4 * radius + 0.02;
		parts.path( chain, [ [ - 1.12, bunkTop + 0.1, z + 0.14 ], [ - wide, high - radius * 1.8, z + 0.14 ], [ - radius * 2, high, z + 0.14 ], [ radius * 2, high, z + 0.14 ], [ wide, high - radius * 1.8, z + 0.14 ], [ 1.12, bunkTop + 0.1, z + 0.14 ] ], 0.012, 5 );

	}

	// A red flag on the overhanging butts.
	parts.box( mat( 0xd7261e, { roughness: 0.8 } ), [ 0.3, 0.3, 0.005 ], [ 0, at[ 8 ][ 1 ] + butt - 0.05, zButt + 0.01 ] );
	return parts.build();

}

// --- wire reel trailers ----------------------------------------------------------------------

// A single-reel hydraulic wire trailer (about 4.6 m long and 2.5 m wide): an 84 in wooden reel of
// bare aluminium conductor slung low between the frame rails on a shaft held by lift arms, the
// wheels on stub axles outside the rails, a reel brake and the tongue.
function wireReelTrailer() {

	const parts = new Parts();
	const frame = paint( 0xd8a521 );
	const reelR = 42 * IN;
	const reelW = 54 * IN;
	const shaftY = reelR + 0.16;
	const railX = reelW / 2 + 0.18;

	// Side frames, a front cross beam, the tongue and the jack.
	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ 0.14, 0.2, 2.9 ], [ s * railX, 0.48, 0 ] );
	parts.box( frame, [ railX * 2 + 0.14, 0.2, 0.2 ], [ 0, 0.48, - 1.35 ] );
	for ( const s of [ - 1, 1 ] ) member( parts, frame, [ 0.1, 0.12 ], [ s * railX, 0.58, - 1.35 ], [ s * 0.06, 0.56, - 2.95 ] );
	parts.box( DARK(), [ 0.13, 0.1, 0.38 ], [ 0, 0.48, - 3.05 ] );
	parts.rod( DARK(), [ 0.17, 0.08, - 2.4 ], [ 0.17, 0.9, - 2.4 ], 0.035, 8 );
	parts.box( DARK(), [ 0.16, 0.06, 0.16 ], [ 0.17, 0, - 2.4 ] );

	// Wheels on stub axles outside the rails, fenders over them.
	const r = 0.37;
	for ( const s of [ - 1, 1 ] ) {

		for ( const z of [ - 0.55, 0.55 ] ) {

			parts.rod( DARK(), [ s * railX, r, z ], [ s * ( railX + 0.25 ), r, z ], 0.05, 8 );
			tyre( parts, r, 0.22, [ s * ( railX + 0.24 ), r, z ] );

		}

		plate( parts, frame, [ [ - 1.05, 0.58 ], [ - 0.9, 0.86 ], [ 0.9, 0.86 ], [ 1.05, 0.58 ] ], 0.3, s * ( railX + 0.24 ) );
		parts.box( RED_LAMP(), [ 0.12, 0.07, 0.02 ], [ s * ( railX + 0.24 ), 0.62, 1.06 ] );

	}

	// Lift arms from the frame up to the shaft, each with its ram, and the shaft through the reel.
	for ( const s of [ - 1, 1 ] ) {

		const x = s * railX;
		member( parts, frame, [ 0.12, 0.16 ], [ x, 0.6, 1.2 ], [ x, shaftY, 0 ] );
		member( parts, frame, [ 0.12, 0.16 ], [ x, 0.6, - 1.2 ], [ x, shaftY, 0 ] );
		parts.rod( DARK(), [ x + s * 0.09, 0.62, 0.9 ], [ x + s * 0.09, shaftY - 0.1, 0.25 ], 0.05, 10 );
		parts.box( DARK(), [ 0.2, 0.2, 0.2 ], [ x, shaftY - 0.1, 0 ] );

	}

	parts.rod( STEEL(), [ - railX - 0.12, shaftY, 0 ], [ railX + 0.12, shaftY, 0 ], 0.045, 10 );
	reel( parts, [ 0, shaftY, 0 ], { radius: reelR, width: reelW, wound: reelR - 0.12, cable: CONDUCTOR() } );
	// The brake disc on the left of the shaft.
	parts.rod( DARK(), [ - railX - 0.16, shaftY, 0 ], [ - railX - 0.12, shaftY, 0 ], 0.25, 18 );
	return parts.build();

}

// A three-reel wire trailer (about 9 m long and 2.5 m wide): three 60 in steel reels of conductor,
// one behind the other on a flat deck over the tandem axles, each on a shaft in its own pair of
// stands with a brake, so three phases pull off at once.
function multiReelTrailer() {

	const parts = new Parts();
	const frame = paint( 0xd8a521 );
	const deckY = 0.98;
	const z0 = - 3.6;
	const z1 = 3.6;
	trailerChassis( parts, { z0, z1, deckY, railX: 0.5, tongue: 1.7, axleZ: [ 0.65, 1.85 ], wheelX: 0.8, fenders: false, frame } );
	parts.box( mat( 0x4a4e52, { roughness: 0.6, metalness: 0.5 } ), [ 2.44, 0.08, z1 - z0 ], [ 0, deckY, 0 ] );

	const reelR = 30 * IN;
	const reelW = 36 * IN;
	const shaftY = deckY + 0.08 + reelR + 0.12;
	const reelPaint = paint( 0x3c6e9e );
	for ( const z of [ - 2.25, 0, 2.25 ] ) {

		for ( const s of [ - 1, 1 ] ) {

			// An A-frame stand each side, the shaft resting in its top.
			const x = s * ( reelW / 2 + 0.12 );
			for ( const dz of [ - 0.6, 0.6 ] ) member( parts, frame, [ 0.08, 0.1 ], [ x, deckY + 0.08, z + dz ], [ x, shaftY, z ] );
			parts.box( frame, [ 0.12, 0.12, 1.3 ], [ x, deckY + 0.08, z ] );
			parts.box( DARK(), [ 0.14, 0.14, 0.14 ], [ x, shaftY - 0.07, z ] );

		}

		parts.rod( STEEL(), [ - reelW / 2 - 0.22, shaftY, z ], [ reelW / 2 + 0.22, shaftY, z ], 0.04, 10 );
		parts.rod( DARK(), [ reelW / 2 + 0.22, shaftY, z ], [ reelW / 2 + 0.26, shaftY, z ], 0.2, 16 );
		reel( parts, [ 0, shaftY, z ], { radius: reelR, width: reelW, wound: reelR - 0.1, cable: CONDUCTOR(), flange: reelPaint, steel: true } );

	}

	return parts.build();

}

// --- puller-tensioner ------------------------------------------------------------------------

// A bullwheel puller-tensioner on a tandem trailer (about 6.3 m long, 2.5 m wide and 2.8 m high):
// two 60 in multi-groove bullwheels one behind the other on top, the diesel power unit at the
// front, the operator's station on the left, a fairlead with rollers at the back where the
// conductor leaves, and stabiliser jacks down.
function pullerTensioner() {

	const parts = new Parts();
	const frame = paint( 0xd8a521 );
	const housing = paint( 0xe0dccf );
	const deckY = 0.95;
	const z0 = - 2.6;
	const z1 = 2.6;
	trailerChassis( parts, { z0, z1, deckY, railX: 0.5, tongue: 1.1, axleZ: [ 0.7, 1.75 ], wheelX: 0.82, fenders: false, frame } );
	parts.box( mat( 0x4a4e52, { roughness: 0.6, metalness: 0.5 } ), [ 2.4, 0.08, z1 - z0 ], [ 0, deckY, 0 ] );

	// Power unit: engine housing with louvres, the exhaust and the hydraulic tank.
	parts.box( housing, [ 2.0, 1.15, 1.6 ], [ 0, deckY + 0.08, z0 + 0.9 ] );
	for ( const s of [ - 1, 1 ] ) for ( let i = 0; i < 7; i ++ ) parts.box( DARK(), [ 0.012, 0.03, 0.8 ], [ s * 1.0, deckY + 0.45 + i * 0.08, z0 + 0.8 ] );
	parts.rod( DARK(), [ 0.6, deckY + 1.2, z0 + 1.3 ], [ 0.6, deckY + 1.6, z0 + 1.3 ], 0.05, 10 );
	parts.box( frame, [ 0.8, 0.55, 0.5 ], [ 0.45, deckY + 0.08, z0 + 2.05 ] );

	// The bullwheels: a frame between them, each wheel a stack of grooves.
	const wheelR = 30 * IN;
	const wheelW = 0.62;
	const wheelY = deckY + 0.55 + wheelR;
	const wheels = [ - 0.05, 1.65 ];
	for ( const s of [ - 1, 1 ] ) {

		parts.box( frame, [ 0.12, wheelY - deckY - 0.08, 2.6 ], [ s * ( wheelW / 2 + 0.12 ), deckY + 0.08, ( wheels[ 0 ] + wheels[ 1 ] ) / 2 ] );

	}

	for ( const z of wheels ) {

		parts.rod( STEEL(), [ - wheelW / 2 - 0.2, wheelY, z ], [ wheelW / 2 + 0.2, wheelY, z ], 0.08, 10 );
		parts.rod( paint( 0x9aa0a6 ), [ - wheelW / 2, wheelY, z ], [ wheelW / 2, wheelY, z ], wheelR - 0.06, 32 );
		const grooves = 8;
		for ( let i = 0; i <= grooves; i ++ ) {

			const x = - wheelW / 2 + i * wheelW / grooves;
			parts.rod( BRIGHT(), [ x - 0.012, wheelY, z ], [ x + 0.012, wheelY, z ], wheelR, 32 );

		}

		parts.rod( DARK(), [ wheelW / 2 + 0.2, wheelY, z ], [ wheelW / 2 + 0.3, wheelY, z ], 0.3, 18 );

	}

	// Conductor wrapped round the bullwheels, coming in at the front from the reels and out over
	// the fairlead at the back.
	const wire = CONDUCTOR();
	parts.rod( wire, [ 0, wheelY - wheelR + 0.02, wheels[ 0 ] ], [ 0, wheelY - wheelR + 0.02, wheels[ 1 ] ], 0.015, 6 );
	parts.rod( wire, [ 0, wheelY + wheelR - 0.02, wheels[ 0 ] ], [ 0, wheelY + wheelR - 0.02, wheels[ 1 ] ], 0.015, 6 );
	const fair = [ 0, wheelY + 0.25, z1 + 0.25 ];
	parts.rod( wire, [ 0, wheelY + wheelR - 0.02, wheels[ 1 ] ], fair, 0.015, 6 );
	parts.rod( wire, fair, [ 0, fair[ 1 ] + 0.3, z1 + 0.9 ], 0.015, 6 );

	// The fairlead: a frame of four rollers at the back.
	member( parts, frame, [ 0.12, 0.12 ], [ - 0.35, deckY + 0.08, z1 - 0.1 ], [ - 0.35, fair[ 1 ] + 0.25, z1 + 0.2 ] );
	member( parts, frame, [ 0.12, 0.12 ], [ 0.35, deckY + 0.08, z1 - 0.1 ], [ 0.35, fair[ 1 ] + 0.25, z1 + 0.2 ] );
	for ( const dy of [ - 0.08, 0.08 ] ) parts.rod( BRIGHT(), [ - 0.3, fair[ 1 ] + dy, fair[ 2 ] ], [ 0.3, fair[ 1 ] + dy, fair[ 2 ] ], 0.05, 10 );
	for ( const dx of [ - 0.1, 0.1 ] ) parts.rod( BRIGHT(), [ dx, fair[ 1 ] - 0.18, fair[ 2 ] ], [ dx, fair[ 1 ] + 0.18, fair[ 2 ] ], 0.05, 10 );

	// The operator's station on the left: a platform, the console and a seat.
	parts.box( FRAME(), [ 0.45, 0.06, 1.2 ], [ - 1.4, deckY - 0.2, 0.6 ] );
	parts.box( DARK(), [ 0.15, 1.1, 0.7 ], [ - 1.2, deckY + 0.08, 0.6 ] );
	parts.block( DARK(), [ 0.04, 0.45, 0.65 ], [ - 1.32, deckY + 1.15, 0.6 ], [ 0, 0, 25 * DEG ] );
	parts.box( DARK(), [ 0.38, 0.45, 0.42 ], [ - 1.42, deckY - 0.14, 0.6 ] );

	// Stabiliser jacks down at the back corners.
	for ( const s of [ - 1, 1 ] ) {

		parts.rod( DARK(), [ s * 0.95, 0.08, z1 - 0.2 ], [ s * 0.95, deckY, z1 - 0.2 ], 0.05, 8 );
		parts.box( DARK(), [ 0.25, 0.06, 0.25 ], [ s * 0.95, 0, z1 - 0.2 ] );

	}

	return parts.build();

}

// --- cable reels -----------------------------------------------------------------------------

// A 72 in wooden reel of black primary cable on a steel spindle carried by two screw-jack reel
// stands, lifted just clear of the ground so it can pay off, its free end laid out in front.
function cableReelJacks() {

	const parts = new Parts();
	const red = paint( 0xc0392b );
	const reelR = 36 * IN;
	const reelW = 1.1;
	const axleY = reelR + 0.08;
	reel( parts, [ 0, axleY, 0 ], { radius: reelR, width: reelW, wound: reelR - 0.14, cable: HOSE() } );
	parts.rod( STEEL(), [ - reelW / 2 - 0.45, axleY, 0 ], [ reelW / 2 + 0.45, axleY, 0 ], 0.04, 10 );

	// The jack stands: a tripod base, the screw and its crank, and a V cradle under the spindle.
	for ( const s of [ - 1, 1 ] ) {

		const x = s * ( reelW / 2 + 0.3 );
		for ( const [ dx, dz ] of [ [ 0, - 0.38 ], [ 0, 0.38 ], [ s * 0.35, 0 ] ] ) member( parts, red, [ 0.06, 0.06 ], [ x + dx, 0.03, dz ], [ x, 0.55, 0 ] );
		parts.box( red, [ 0.12, 0.25, 0.12 ], [ x, 0.42, 0 ] );
		parts.rod( BRIGHT(), [ x, 0.67, 0 ], [ x, axleY - 0.08, 0 ], 0.03, 8 );
		parts.box( red, [ 0.1, 0.06, 0.18 ], [ x, axleY - 0.09, 0 ] );
		for ( const dz of [ - 1, 1 ] ) parts.block( red, [ 0.1, 0.1, 0.02 ], [ x, axleY - 0.01, dz * 0.08 ], [ dz * 30 * DEG, 0, 0 ] );
		parts.rod( DARK(), [ x, 0.6, 0 ], [ x + s * 0.3, 0.6, 0 ], 0.012, 6 );

	}

	// The free end off the bottom of the reel, laid out forward along the ground.
	const end = HOSE();
	parts.path( end, [ [ 0.2, axleY - reelR + 0.15, - 0.1 ], [ 0.25, 0.03, - reelR - 0.2 ], [ 0.4, 0.03, - reelR - 1.6 ] ], 0.03, 8 );
	return parts.build();

}

// A 96 in steel reel of 2 in orange HDPE duct on a pair of reel stands (an A-frame each side and
// a spindle), the duct's free end paying off along the ground in front.
function ductReelStands() {

	const parts = new Parts();
	const orange = plastic( 0xe8641e );
	const stand = paint( 0x2f5f8f );
	const reelR = 48 * IN;
	const reelW = 54 * IN;
	const axleY = reelR + 0.12;
	reel( parts, [ 0, axleY, 0 ], { radius: reelR, width: reelW, wound: reelR - 0.16, cable: orange, flange: paint( 0x9aa0a6 ), steel: true } );
	// The duct's wraps show as rings across the drum.
	for ( let i = 0; i < 18; i ++ ) {

		const x = - reelW / 2 + 0.06 + ( i + 0.5 ) * ( reelW - 0.12 ) / 18;
		parts.rod( orange, [ x - 0.012, axleY, 0 ], [ x + 0.012, axleY, 0 ], reelR - 0.15, 28 );

	}

	parts.rod( STEEL(), [ - reelW / 2 - 0.4, axleY, 0 ], [ reelW / 2 + 0.4, axleY, 0 ], 0.05, 10 );
	for ( const s of [ - 1, 1 ] ) {

		const x = s * ( reelW / 2 + 0.25 );
		for ( const dz of [ - 0.85, 0.85 ] ) member( parts, stand, [ 0.1, 0.1 ], [ x, 0.05, dz ], [ x, axleY + 0.05, 0 ] );
		parts.box( stand, [ 0.12, 0.1, 1.9 ], [ x, 0, 0 ] );
		parts.box( stand, [ 0.12, 0.08, 1.0 ], [ x, axleY * 0.45, 0 ] );
		parts.box( DARK(), [ 0.16, 0.12, 0.16 ], [ x, axleY - 0.06, 0 ] );

	}

	parts.path( orange, [ [ 0.3, axleY - reelR + 0.17, - 0.1 ], [ 0.35, 0.03, - reelR - 0.3 ], [ 0.5, 0.03, - reelR - 2.2 ] ], 0.03, 10 );
	return parts.build();

}

// --- vibratory cable plow --------------------------------------------------------------------

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

// A tracked ride-on vibratory plow of the 100 hp class (about 5.3 m long with its plow, 1.8 m wide
// and 2.5 m high to the canopy): two rubber tracks, the engine under the hood at the front with a
// backfill blade ahead of it, the operator's seat and console under a ROPS canopy, and at the back
// the vibrator with its 36 in blade and duct chute in the ground, fed from a reel of orange duct
// carried over the back.
function cablePlow() {

	const parts = new Parts();
	const body = paint( 0xe8681a );
	const orange = plastic( 0xf07a1e );
	const trackL = 2.7;
	for ( const s of [ - 1, 1 ] ) rubberTrack( parts, s * 0.7, 0, trackL, 0.55, 0.38 );

	// Frame and body: engine hood at the front, the deck behind with the seat and console.
	parts.box( DARK(), [ 1.15, 0.3, 2.6 ], [ 0, 0.45, 0 ] );
	parts.box( body, [ 1.7, 0.5, 2.7 ], [ 0, 0.72, 0 ] );
	plate( parts, body, [ [ - 1.35, 1.22 ], [ - 1.35, 1.75 ], [ - 1.2, 1.85 ], [ - 0.1, 1.85 ], [ - 0.1, 1.22 ] ], 1.4, 0 );
	for ( const s of [ - 1, 1 ] ) for ( let i = 0; i < 5; i ++ ) parts.box( DARK(), [ 0.012, 0.03, 0.8 ], [ s * 0.7, 1.35 + i * 0.08, - 0.75 ] );
	parts.rod( DARK(), [ - 0.45, 1.85, - 0.35 ], [ - 0.45, 2.2, - 0.35 ], 0.04, 8 );
	parts.box( DARK(), [ 0.5, 0.45, 0.45 ], [ 0, 1.22, 0.45 ] );
	parts.box( DARK(), [ 0.5, 0.6, 0.1 ], [ 0, 1.67, 0.68 ] );
	parts.box( DARK(), [ 0.18, 0.75, 0.25 ], [ 0.55, 1.22, 0.2 ] );

	// ROPS canopy: four posts and a roof.
	for ( const sx of [ - 1, 1 ] ) for ( const z of [ - 0.05, 1.05 ] ) parts.box( DARK(), [ 0.08, 1.25, 0.08 ], [ sx * 0.78, 1.22, z ] );
	parts.box( DARK(), [ 1.7, 0.08, 1.3 ], [ 0, 2.45, 0.5 ] );

	// The backfill blade at the front on its arms.
	parts.box( body, [ 1.9, 0.5, 0.12 ], [ 0, 0.05, - 1.95 ] );
	for ( const s of [ - 1, 1 ] ) member( parts, DARK(), [ 0.1, 0.12 ], [ s * 0.55, 0.35, - 1.9 ], [ s * 0.55, 0.55, - 1.2 ] );

	// The plow at the back: the vibrator box on its swing frame, the blade down into the ground
	// with the chute behind it, and the duct running from the reel down the chute.
	const back = 1.35;
	member( parts, DARK(), [ 0.18, 0.18 ], [ - 0.3, 0.8, back ], [ - 0.12, 0.95, back + 0.8 ] );
	member( parts, DARK(), [ 0.18, 0.18 ], [ 0.3, 0.8, back ], [ 0.12, 0.95, back + 0.8 ] );
	parts.box( body, [ 0.5, 0.6, 0.55 ], [ 0, 0.75, back + 0.95 ] );
	plate( parts, STEEL(), [ [ back + 0.75, 0 ], [ back + 0.85, 0.75 ], [ back + 1.2, 0.75 ], [ back + 1.25, 0 ] ], 0.05, 0 );
	parts.box( DARK(), [ 0.12, 0.85, 0.12 ], [ 0, 0, back + 1.32 ] );
	const reelZ = back + 0.8;
	const reelY = 2.0;
	for ( const s of [ - 1, 1 ] ) member( parts, DARK(), [ 0.07, 0.07 ], [ s * 0.62, 1.22, back - 0.05 ], [ s * 0.62, reelY, reelZ ] );
	parts.rod( STEEL(), [ - 0.66, reelY, reelZ ], [ 0.66, reelY, reelZ ], 0.03, 8 );
	reel( parts, [ 0, reelY, reelZ ], { radius: 0.62, width: 1.1, wound: 0.48, cable: orange, flange: paint( 0x9aa0a6 ), steel: true } );
	parts.path( orange, [ [ 0, reelY - 0.48, reelZ + 0.05 ], [ 0, 1.5, back + 1.36 ], [ 0, 0.9, back + 1.36 ] ], 0.03, 8 );
	return parts.build();

}

// --- conduit ---------------------------------------------------------------------------------

// A lift of 24 lengths of 4 in Schedule 40 grey PVC conduit, 10 ft with a belled end, 6 wide and 4
// high in three timber frames and steel bands, on two 4 × 4 timbers.
function conduitBundle() {

	const parts = new Parts();
	const pvc = plastic( 0x8d9296 );
	const band = mat( 0x6c7074, { roughness: 0.5, metalness: 0.6 } );
	const od = 4.5 * IN;
	const bell = od * 1.18;
	const pitch = bell + 0.004;
	const length = 10 * FT;
	const across = 6;
	const high = 4;
	const board = 0.019;
	const base = 4 * IN + 0.09;
	for ( let row = 0; row < high; row ++ ) {

		for ( let i = 0; i < across; i ++ ) {

			const x = ( i - ( across - 1 ) / 2 ) * pitch;
			const y = base + pitch / 2 + row * pitch;
			parts.rod( pvc, [ x, y, - length / 2 ], [ x, y, length / 2 - 0.12 ], od / 2, 14 );
			parts.rod( pvc, [ x, y, length / 2 - 0.13 ], [ x, y, length / 2 ], bell / 2, 14 );
			parts.rod( DARK(), [ x, y, - length / 2 - 0.002 ], [ x, y, - length / 2 ], od / 2 - 0.006, 14 );

		}

	}

	// Timber frames round the lift: a bottom board, posts each side and a top board, with bands.
	const w = across * pitch;
	const h = high * pitch;
	for ( const z of [ - 1.25, 0, 1.25 ] ) {

		parts.box( TIMBER(), [ w + 0.1, 0.09, 0.09 ], [ 0, 4 * IN, z ] );
		parts.box( TIMBER(), [ w + 0.1, 0.04, 0.09 ], [ 0, base + h, z ] );
		for ( const s of [ - 1, 1 ] ) parts.box( TIMBER(), [ 0.04, h + 0.04, 0.09 ], [ s * ( w / 2 + 0.02 ), base, z ] );
		parts.box( band, [ w + 0.11, 0.004, 0.02 ], [ 0, base + h + 0.04, z + 0.06 ] );
		for ( const s of [ - 1, 1 ] ) parts.box( band, [ 0.004, h + board * 4, 0.02 ], [ s * ( w / 2 + 0.042 ), base - 0.02, z + 0.06 ] );

	}

	for ( const z of [ - 1.0, 1.0 ] ) dunnage( parts, w + 0.3, [ 0, z ] );
	return parts.build();

}

// A precast concrete handhole, 24 × 36 in inside and 24 in deep, with its concrete cover marked
// ELECTRIC and two pick holes, staged on two timbers. The walls are 3 in, so it's 30 × 42 in outside.
function handhole() {

	const parts = new Parts();
	const concrete = CONCRETE();
	const inner = [ 24 * IN, 36 * IN ];
	const wall = 3 * IN;
	const outer = [ inner[ 0 ] + 2 * wall, inner[ 1 ] + 2 * wall ];
	const deep = 24 * IN;
	const y0 = 4 * IN;
	for ( const z of [ - 0.35, 0.35 ] ) dunnage( parts, outer[ 0 ] + 0.15, [ 0, z ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( concrete, [ wall, deep, outer[ 1 ] ], [ s * ( outer[ 0 ] - wall ) / 2, y0, 0 ] );
		parts.box( concrete, [ inner[ 0 ], deep, wall ], [ 0, y0, s * ( outer[ 1 ] - wall ) / 2 ] );
		// A knockout panel in each end for the conduits.
		parts.box( mat( 0x95938d, { roughness: 1 } ), [ 0.36, 0.2, 0.006 ], [ 0, y0 + 0.2, s * ( outer[ 1 ] / 2 + 0.003 ) ] );

	}

	// The cover sits in a ledge, a little proud of the walls, with the marking on top.
	const top = y0 + deep;
	parts.box( mat( 0x8f8d88, { roughness: 0.9 } ), [ inner[ 0 ] + 0.04, 0.05, inner[ 1 ] + 0.04 ], [ 0, top - 0.045, 0 ] );
	const lid = drawn( 'utility-handhole-lid', [ 256, 384 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#8f8d88';
		ctx.fillRect( 0, 0, w, h );
		ctx.strokeStyle = '#6f6d69';
		ctx.lineWidth = 6;
		ctx.strokeRect( 14, 14, w - 28, h - 28 );
		ctx.fillStyle = '#3e3d3b';
		ctx.font = 'bold 40px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText( 'ELECTRIC', w / 2, h / 2 );
		for ( const y of [ 70, h - 70 ] ) {

			ctx.fillStyle = '#2a2928';
			ctx.fillRect( w / 2 - 22, y - 9, 44, 18 );

		}

	}, { roughness: 0.9 } );
	const face = new PlaneGeometry( inner[ 0 ] + 0.03, inner[ 1 ] + 0.03 ).rotateX( - Math.PI / 2 ).rotateY( Math.PI );
	face.translate( 0, top + 0.006, 0 );
	parts.add( lid, face );
	return parts.build();

}

// A precast concrete utility vault, 8 × 12 ft inside and 7 ft deep, staged on grade: the
// monolithic base and walls (8 in thick, so 9 ft 4 in × 13 ft 4 in outside), duct window
// knockouts in each wall, and the 10 in top slab with a 3 × 4 ft double-leaf aluminium hatch and
// four lifting loops. About 2.8 × 4.1 m and 2.6 m high.
function utilityVault() {

	const parts = new Parts();
	const concrete = CONCRETE();
	const knock = mat( 0x95938d, { roughness: 1 } );
	const wall = 8 * IN;
	const w = 8 * FT + 2 * wall;
	const l = 12 * FT + 2 * wall;
	const body = 7 * FT + wall;
	const slab = 10 * IN;
	parts.box( concrete, [ w, body, l ], [ 0, 0, 0 ] );
	// The joint between the walls and the slab, and the slab.
	parts.box( mat( 0x7b7974, { roughness: 1 } ), [ w - 0.02, 0.02, l - 0.02 ], [ 0, body, 0 ] );
	parts.box( concrete, [ w, slab, l ], [ 0, body + 0.02, 0 ] );

	// Duct windows: two in each long side, one in each end.
	for ( const s of [ - 1, 1 ] ) {

		for ( const z of [ - 1.0, 1.0 ] ) parts.box( knock, [ 0.006, 0.55, 0.9 ], [ s * ( w / 2 + 0.003 ), 1.0, z ] );
		parts.box( knock, [ 0.9, 0.55, 0.006 ], [ 0, 1.0, s * ( l / 2 + 0.003 ) ] );

	}

	// The hatch: a frame and two diamond-plate leaves with their hinges and a lifting handle each.
	const top = body + 0.02 + slab;
	const hatch = [ 3 * FT, 4 * FT ];
	const alu = mat( 0xbfc3c6, { roughness: 0.4, metalness: 0.7 } );
	parts.box( mat( 0x8e9194, { roughness: 0.5, metalness: 0.6 } ), [ hatch[ 0 ] + 0.1, 0.012, hatch[ 1 ] + 0.1 ], [ 0, top, - 0.5 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( alu, [ hatch[ 0 ] / 2 - 0.01, 0.01, hatch[ 1 ] ], [ s * hatch[ 0 ] / 4, top + 0.012, - 0.5 ] );
		for ( const z of [ - 0.35, 0.35 ] ) parts.box( DARK(), [ 0.04, 0.02, 0.12 ], [ s * ( hatch[ 0 ] / 2 - 0.02 ), top + 0.012, - 0.5 + z ] );
		parts.box( DARK(), [ 0.1, 0.012, 0.03 ], [ s * 0.12, top + 0.022, - 0.5 ] );

	}

	// Lifting loops at the slab's corners.
	for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) {

		const [ x, z ] = [ sx * ( w / 2 - 0.35 ), sz * ( l / 2 - 0.45 ) ];
		parts.path( STEEL(), [ [ x - 0.06, top, z ], [ x - 0.05, top + 0.08, z ], [ x + 0.05, top + 0.08, z ], [ x + 0.06, top, z ] ], 0.012, 6 );

	}

	return parts.build();

}

// One 10 ft run of a six-way duct bank set out ready for its concrete: two rows of three 4 in PVC
// ducts at 7½ in centres, held by plastic base and intermediate spacers every 5 ft, with a
// coupling at the end of each length.
function ductBank() {

	const parts = new Parts();
	const pvc = plastic( 0x8d9296 );
	const spacer = plastic( 0x3a3d40 );
	const od = 4.5 * IN;
	const pitch = 7.5 * IN;
	const length = 10 * FT;
	const y0 = 3 * IN + od / 2;
	const xs = [ - pitch, 0, pitch ];
	const ys = [ y0, y0 + pitch ];
	for ( const y of ys ) for ( const x of xs ) {

		parts.rod( pvc, [ x, y, - length / 2 ], [ x, y, length / 2 ], od / 2, 14 );
		parts.rod( pvc, [ x, y, length / 2 - 0.1 ], [ x, y, length / 2 - 0.002 ], od / 2 + 0.008, 14 );

	}

	// Spacers: a grid of bars round the ducts with feet, at the quarter points so a row keeps the
	// 5 ft spacing through the joints.
	const half = pitch * 1.5 + 0.03;
	for ( const z of [ - length / 4, length / 4 ] ) {

		for ( const y of [ 0, y0 - od / 2 - 0.02, y0 + pitch / 2, ys[ 1 ] + od / 2 + 0.005 ] ) parts.box( spacer, [ half * 2, 0.025, 0.04 ], [ 0, y, z ] );
		for ( const x of [ - half, - pitch / 2, pitch / 2, half ] ) parts.box( spacer, [ 0.025, ys[ 1 ] + od / 2 + 0.03, 0.04 ], [ x, 0, z ] );

	}

	return parts.build();

}

// --- splicing tent ---------------------------------------------------------------------------

// An 8 × 8 ft hi-vis orange pop-up splicing tent with reflective bands, its front door rolled up,
// set over the work (as over a manhole), and a 60,000 BTU/h propane forced-air heater outside on
// its right with a 20 lb cylinder, blowing in through a yellow duct under the side wall.
function splicingTent() {

	const parts = new Parts();
	const fabric = mat( 0xf26a1b, { roughness: 0.85 } );
	const stripe = mat( 0xd8dcdc, { roughness: 0.3, metalness: 0.4 } );
	const frame = mat( 0x9fa4a8, { roughness: 0.4, metalness: 0.6 } );
	const size = 8 * FT;
	const half = size / 2;
	const eave = 2.0;
	const peak = 2.75;
	const t = 0.012;

	// Legs and the roof: a four-sided pyramid.
	for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) parts.box( frame, [ 0.035, eave, 0.035 ], [ sx * ( half - 0.02 ), 0, sz * ( half - 0.02 ) ] );
	const roof = new CylinderGeometry( 0.02, half * Math.SQRT2 + 0.04, peak - eave, 4, 1 ).rotateY( Math.PI / 4 );
	roof.translate( 0, eave + ( peak - eave ) / 2, 0 );
	parts.add( fabric, roof );

	// Walls: back and sides whole, the front's door rolled up to above head height.
	parts.box( fabric, [ size, eave, t ], [ 0, 0, half ] );
	for ( const s of [ - 1, 1 ] ) parts.box( fabric, [ t, eave, size ], [ s * half, 0, 0 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( fabric, [ 0.45, eave, t ], [ s * ( half - 0.225 ), 0, - half ] );
	parts.box( fabric, [ size - 0.9, 0.25, t ], [ 0, eave - 0.25, - half ] );
	parts.rod( fabric, [ - half + 0.45, eave - 0.32, - half - 0.06 ], [ half - 0.45, eave - 0.32, - half - 0.06 ], 0.07, 10 );

	// Reflective bands round the walls.
	for ( const y of [ 0.55, 1.45 ] ) {

		parts.box( stripe, [ size + 0.01, 0.05, 0.004 ], [ 0, y, half + 0.008 ] );
		for ( const s of [ - 1, 1 ] ) {

			parts.box( stripe, [ 0.004, 0.05, size + 0.01 ], [ s * ( half + 0.008 ), y, 0 ] );
			parts.box( stripe, [ 0.45, 0.05, 0.004 ], [ s * ( half - 0.225 ), y, - half - 0.008 ] );

		}

	}

	// The manhole the tent is over, its cover slid aside, and the splicer's work stand.
	parts.cylinder( DARK(), 0.42, 0.03, [ - 0.2, 0, 0.3 ], 20 );
	parts.cylinder( mat( 0x0c0c0d ), 0.32, 0.031, [ - 0.2, 0, 0.3 ], 20 );
	parts.cylinder( DARK(), 0.33, 0.03, [ - 0.75, 0, - 0.5 ], 20 );
	parts.box( mat( 0x6b6f73, { roughness: 0.5, metalness: 0.5 } ), [ 0.8, 0.03, 0.45 ], [ 0.55, 0.85, 0.6 ] );
	for ( const x of [ 0.2, 0.9 ] ) for ( const z of [ 0.42, 0.78 ] ) parts.box( DARK(), [ 0.03, 0.85, 0.03 ], [ x, 0, z ] );

	// The heater outside on the right: its barrel on a stand, the cylinder beside it, and the duct.
	const hx = half + 0.75;
	const hz = 0.6;
	const red = paint( 0xc8282a );
	for ( const dz of [ - 0.25, 0.25 ] ) parts.box( DARK(), [ 0.04, 0.22, 0.04 ], [ hx, 0, hz + dz ] );
	parts.box( DARK(), [ 0.3, 0.03, 0.6 ], [ hx, 0.2, hz ] );
	parts.rod( red, [ hx, 0.4, hz + 0.4 ], [ hx, 0.4, hz - 0.35 ], 0.17, 18 );
	parts.rod( DARK(), [ hx, 0.4, hz + 0.41 ], [ hx, 0.4, hz + 0.43 ], 0.15, 18 );
	parts.cylinder( mat( 0xe9e9e4, { roughness: 0.5, metalness: 0.3 } ), 0.155, 0.45, [ hx + 0.05, 0, hz - 0.75 ], 16 );
	parts.rod( HOSE(), [ hx + 0.05, 0.47, hz - 0.75 ], [ hx, 0.3, hz - 0.3 ], 0.01, 6 );
	const duct = mat( 0xf0b41c, { roughness: 0.65 } );
	parts.path( duct, [ [ hx, 0.4, hz - 0.35 ], [ hx, 0.25, hz - 0.85 ], [ half + 0.25, 0.15, hz - 1.0 ], [ half - 0.15, 0.15, hz - 1.0 ] ], 0.1, 12 );
	return parts.build();

}

// --- sewer jetter ----------------------------------------------------------------------------

// A trailer sewer jetter (about 4.9 m long, 2.0 m wide and 2.0 m high): a 600 gal poly water
// tank at the front, the engine and 4,000 psi pump under a hood behind it, and the hose reel with
// 500 ft of 1 in jetter hose at the back on a swivel, its hose guide and a nozzle hung on the frame.
function jetterTrailer() {

	const parts = new Parts();
	const frame = paint( 0x2a2b2d );
	const hood = paint( 0x1f4f8f );
	const tank = plastic( 0xe8e4d6 );
	const deckY = 0.62;
	const z0 = - 1.65;
	const z1 = 1.75;
	trailerChassis( parts, { z0, z1, deckY, railX: 0.48, tongue: 1.5, axleZ: [ 0.05, 0.85 ], wheelX: 0.85, frame } );
	parts.box( mat( 0x4a4e52, { roughness: 0.6, metalness: 0.5 } ), [ 1.5, 0.05, z1 - z0 ], [ 0, deckY, 0.05 ] );

	// The tank: a rounded poly box with its lid and level marks, strapped down.
	const tz = - 0.95;
	parts.box( tank, [ 1.45, 1.05, 1.25 ], [ 0, deckY + 0.05, tz ] );
	parts.cylinder( plastic( 0x2d2f31 ), 0.18, 0.06, [ 0, deckY + 1.1, tz ], 16 );
	for ( const z of [ tz - 0.4, tz + 0.4 ] ) parts.box( DARK(), [ 1.47, 0.03, 0.05 ], [ 0, deckY + 1.08, z ] );

	// The engine and pump under the hood, louvres on its sides, the exhaust and the control panel.
	const ez = 0.3;
	parts.box( hood, [ 1.45, 0.95, 1.3 ], [ 0, deckY + 0.05, ez ] );
	for ( const s of [ - 1, 1 ] ) for ( let i = 0; i < 6; i ++ ) parts.box( DARK(), [ 0.012, 0.03, 0.6 ], [ s * 0.725, deckY + 0.35 + i * 0.08, ez - 0.2 ] );
	parts.rod( DARK(), [ 0.45, deckY + 1.0, ez + 0.35 ], [ 0.45, deckY + 1.3, ez + 0.35 ], 0.04, 8 );
	parts.box( DARK(), [ 0.02, 0.4, 0.5 ], [ 0.735, deckY + 0.4, ez + 0.3 ] );

	// The hose reel at the back on its swivel: drum wound with hose, flanges and its guide arm.
	const rz = 1.45;
	const ry = deckY + 0.75;
	parts.cylinder( DARK(), 0.28, 0.15, [ 0, deckY + 0.05, rz ], 16 );
	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ 0.06, 0.65, 0.12 ], [ s * 0.42, deckY + 0.15, rz ] );
	parts.rod( HOSE(), [ - 0.36, ry, rz ], [ 0.36, ry, rz ], 0.36, 20 );
	const flange = paint( 0x9aa0a6 );
	for ( const s of [ - 1, 1 ] ) parts.rod( flange, [ s * 0.37, ry, rz ], [ s * 0.39, ry, rz ], 0.5, 22 );
	parts.rod( frame, [ - 0.3, ry + 0.45, rz + 0.45 ], [ 0.3, ry + 0.45, rz + 0.45 ], 0.03, 8 );
	for ( const s of [ - 1, 1 ] ) parts.rod( frame, [ s * 0.3, ry + 0.45, rz + 0.45 ], [ s * 0.36, ry, rz ], 0.02, 6 );
	parts.path( HOSE(), [ [ 0, ry + 0.36, rz ], [ 0, ry + 0.45, rz + 0.45 ], [ 0, ry + 0.2, rz + 0.62 ] ], 0.015, 6 );
	parts.rod( BRIGHT(), [ 0, ry + 0.2, rz + 0.62 ], [ 0, ry + 0.08, rz + 0.62 ], 0.022, 8 );
	return parts.build();

}

// --- hydrant meter ---------------------------------------------------------------------------

// A dry-barrel fire hydrant (about 0.85 m tall, its pumper nozzle to the front) with a
// construction hydrant meter set on its right-hand 2½ in nozzle: a gate valve, the 3 in meter with
// its register, a reduced-pressure-zone backflow preventer on a stand, and a 2½ in hose from its
// outlet laid out along the ground.
function hydrantMeter() {

	const parts = new Parts();
	const red = paint( 0xc0261f );
	const cap = paint( 0xe8e6de );
	const bronze = mat( 0xa5793f, { roughness: 0.45, metalness: 0.6 } );
	const blue = paint( 0x2a5aa0 );
	const hx = - 0.55;

	// The hydrant: flange at grade, barrel, nozzle section, bonnet and operating nut.
	parts.cylinder( red, 0.17, 0.05, [ hx, 0, 0 ], 16 );
	parts.cylinder( red, 0.115, 0.55, [ hx, 0.05, 0 ], 18 );
	parts.cylinder( red, 0.13, 0.08, [ hx, 0.6, 0 ], 18 );
	parts.cylinder( cap, 0.13, 0.15, [ hx, 0.68, 0 ], 18, 0.06 );
	parts.cylinder( cap, 0.035, 0.05, [ hx, 0.83, 0 ], 5 );
	parts.rod( red, [ hx, 0.4, - 0.1 ], [ hx, 0.4, - 0.22 ], 0.075, 14 );
	parts.rod( cap, [ hx, 0.4, - 0.22 ], [ hx, 0.4, - 0.27 ], 0.08, 10 );
	parts.rod( red, [ hx - 0.1, 0.5, 0 ], [ hx - 0.19, 0.5, 0 ], 0.05, 12 );
	parts.rod( cap, [ hx - 0.19, 0.5, 0 ], [ hx - 0.23, 0.5, 0 ], 0.055, 8 );
	parts.rod( red, [ hx + 0.1, 0.5, 0 ], [ hx + 0.19, 0.5, 0 ], 0.05, 12 );

	// The meter assembly along +X from the right nozzle.
	const y = 0.5;
	parts.rod( bronze, [ hx + 0.19, y, 0 ], [ hx + 0.32, y, 0 ], 0.06, 12 );
	parts.box( bronze, [ 0.1, 0.16, 0.1 ], [ hx + 0.3, y - 0.08, 0 ] );
	parts.rod( DARK(), [ hx + 0.3, y + 0.08, 0 ], [ hx + 0.3, y + 0.2, 0 ], 0.012, 6 );
	parts.rod( red, [ hx + 0.25, y + 0.2, 0 ], [ hx + 0.35, y + 0.2, 0 ], 0.012, 6 );
	const mx = hx + 0.5;
	parts.rod( blue, [ mx - 0.15, y, 0 ], [ mx + 0.15, y, 0 ], 0.08, 14 );
	parts.cylinder( blue, 0.08, 0.1, [ mx, y + 0.06, 0 ], 14 );
	parts.cylinder( mat( 0x1d1f21, { roughness: 0.3 } ), 0.07, 0.02, [ mx, y + 0.16, 0 ], 14 );
	const bx0 = mx + 0.2;
	const bx1 = bx0 + 0.65;
	parts.rod( bronze, [ mx + 0.15, y, 0 ], [ bx0, y, 0 ], 0.055, 12 );
	parts.rod( bronze, [ bx0, y, 0 ], [ bx1, y, 0 ], 0.075, 14 );
	for ( const x of [ bx0 + 0.15, bx0 + 0.45 ] ) parts.cylinder( bronze, 0.085, 0.16, [ x, y, 0 ], 14 );
	parts.box( bronze, [ 0.12, 0.18, 0.1 ], [ bx0 + 0.3, y - 0.24, 0 ] );
	for ( const x of [ bx0 + 0.08, bx1 - 0.05 ] ) parts.rod( DARK(), [ x, y + 0.075, 0 ], [ x, y + 0.13, 0 ], 0.01, 6 );

	// The stand under the backflow preventer.
	for ( const x of [ bx0 + 0.05, bx1 - 0.05 ] ) {

		for ( const s of [ - 1, 1 ] ) parts.rod( STEEL(), [ x, 0, s * 0.18 ], [ x, y - 0.08, 0 ], 0.012, 6 );

	}

	parts.rod( STEEL(), [ bx0 + 0.05, y - 0.08, 0 ], [ bx1 - 0.05, y - 0.08, 0 ], 0.015, 6 );

	// The outlet: an elbow down and the hose along the ground.
	const hose = mat( 0xd8d2c0, { roughness: 0.8 } );
	parts.path( bronze, [ [ bx1, y, 0 ], [ bx1 + 0.12, y, 0 ], [ bx1 + 0.12, 0.3, 0 ] ], 0.05, 12 );
	parts.path( hose, [ [ bx1 + 0.12, 0.3, 0 ], [ bx1 + 0.2, 0.05, - 0.05 ], [ bx1 + 0.6, 0.035, - 0.25 ], [ bx1 + 0.9, 0.035, - 0.75 ] ], 0.035, 10 );
	return parts.build();

}

// --- bypass pumping --------------------------------------------------------------------------

// A 6 in diesel dry-prime bypass pump in its sound-attenuated canopy on a single-axle trailer
// (about 4.3 m long, 1.9 m wide and 2.3 m high): the canopy with louvres, its lifting frame and
// exhaust, the pump end at the back with the suction elbow down to a hard suction hose and the
// discharge rising to a check valve and flange.
function bypassPump() {

	const parts = new Parts();
	const frame = paint( 0x2a2b2d );
	const canopy = paint( 0xe08a1c );
	const deckY = 0.62;
	const z0 = - 1.25;
	const z1 = 1.55;
	trailerChassis( parts, { z0, z1, deckY, railX: 0.5, tongue: 1.4, axleZ: [ 0.2 ], wheelX: 0.86, r: 0.36, frame } );

	// The fuel tank base and the canopy.
	parts.box( DARK(), [ 1.3, 0.3, 2.5 ], [ 0, deckY, - 0.05 ] );
	parts.box( canopy, [ 1.35, 1.25, 2.3 ], [ 0, deckY + 0.3, - 0.1 ] );
	for ( const s of [ - 1, 1 ] ) {

		for ( let i = 0; i < 6; i ++ ) parts.box( DARK(), [ 0.012, 0.03, 0.6 ], [ s * 0.676, deckY + 0.65 + i * 0.08, - 0.75 ] );
		parts.box( DARK(), [ 0.008, 1.0, 0.012 ], [ s * 0.676, deckY + 0.4, 0.2 ] );

	}

	parts.box( DARK(), [ 0.008, 0.35, 0.45 ], [ - 0.678, deckY + 0.9, 0.55 ] );
	parts.box( DARK(), [ 0.5, 0.08, 0.5 ], [ 0, deckY + 1.55, - 0.1 ] );
	parts.path( STEEL(), [ [ - 0.12, deckY + 1.63, - 0.1 ], [ - 0.12, deckY + 1.75, - 0.1 ], [ 0.12, deckY + 1.75, - 0.1 ], [ 0.12, deckY + 1.63, - 0.1 ] ], 0.02, 6 );
	parts.rod( DARK(), [ 0.4, deckY + 1.55, - 0.7 ], [ 0.4, deckY + 1.75, - 0.7 ], 0.05, 10 );

	// The pump end at the back: volute, suction elbow down to the hard hose and the discharge up.
	const pz = 1.3;
	const py = deckY + 0.55;
	parts.rod( DARK(), [ 0, py, 1.05 ], [ 0, py, pz + 0.05 ], 0.3, 18 );
	parts.rod( STEEL(), [ 0, py, pz + 0.05 ], [ 0, py, pz + 0.25 ], 0.1, 14 );
	parts.path( DARK(), [ [ 0, py, pz + 0.25 ], [ 0, py, pz + 0.45 ], [ 0, 0.25, pz + 0.45 ] ], 0.09, 14 );
	parts.path( mat( 0x26292c, { roughness: 0.8 } ), [ [ 0, 0.25, pz + 0.45 ], [ 0, 0.1, pz + 0.75 ], [ 0.2, 0.1, pz + 1.6 ] ], 0.095, 12 );
	parts.path( DARK(), [ [ 0.3, py + 0.15, 1.15 ], [ 0.55, py + 0.15, 1.15 ], [ 0.55, py + 1.1, 1.15 ] ], 0.085, 14 );
	parts.box( DARK(), [ 0.24, 0.3, 0.24 ], [ 0.55, py + 0.65, 1.15 ] );
	parts.cylinder( STEEL(), 0.14, 0.03, [ 0.55, py + 1.1, 1.15 ], 16 );
	return parts.build();

}

// A 40 ft stick of 6 in IPS DR17 black HDPE bypass line lying on the ground, with the bead of its
// fusion joint at the back end.
function bypassLine() {

	const parts = new Parts();
	const hdpe = mat( 0x1c1d1f, { roughness: 0.55 } );
	const od = 6.625 * IN;
	const length = 40 * FT;
	parts.rod( hdpe, [ 0, od / 2, - length / 2 ], [ 0, od / 2, length / 2 ], od / 2, 16 );
	parts.rod( hdpe, [ 0, od / 2, length / 2 - 0.02 ], [ 0, od / 2, length / 2 ], od / 2 + 0.01, 16 );
	return parts.build();

}
