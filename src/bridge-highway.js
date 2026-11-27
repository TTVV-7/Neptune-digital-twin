import { BoxGeometry, BufferAttribute, BufferGeometry, CylinderGeometry, DoubleSide, Euler, ExtrudeGeometry, IcosahedronGeometry, Matrix4, PlaneGeometry, Quaternion, RepeatWrapping, Shape, Vector2, Vector3 } from 'three';
import { BLACK, drawn, FT, GALVANISED, GLASS, IN, mat, Parts, RUBBER } from './parts.js';
import { memberGeometry } from './plant-parts.js';
import { extruded } from './site-extras.js';
import { centred, tractor } from './renewables.js';

// Bridge and highway structures, built in code at real North American sizes: precast and steel
// girders (on the road and laid down), deck finishing (a Bid-Well type finisher and the overhang
// brackets it runs on), falsework (a pier cap form on shoring towers and a heavy tower bent), a
// braced sheet pile cofferdam, a temporary panel bridge, retaining wall materials (MSE panels,
// segmental blocks, gabions) and roadside safety (W-beam guardrail, a sand barrel crash cushion
// and an overhead sign truss). Like the other built-in pieces each stands on y = 0 with its front
// facing -Z (+X on its right).

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _s = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const Z = new Vector3( 0, 0, 1 );
const ONE = new Vector3( 1, 1, 1 );

export const BRIDGE_HIGHWAY_ITEMS = [
	// Girders.
	{ id: 'precast-girder-on-trailer', name: 'Precast bridge girder on steerable dolly (BT-72 bulb tee, 130 ft, ~47 t, tractor and jeep)', category: 'Vehicles',
		keywords: 'girder haul bridge beam transport precast girder truck steerable dolly jeep oversize load superload bulb tee prestressed beam delivery',
		build: girderTransport },
	{ id: 'bridge-girder-laydown', name: 'Precast bulb-tee bridge girder on laydown blocks (BT-72, 130 ft, ~47 t, braced)', category: 'Materials',
		keywords: 'bridge girder precast prestressed concrete beam bulb tee bt-72 laydown storage blocking dunnage lifting loops strand',
		build: girderLaydown },
	{ id: 'steel-plate-girder-section', name: 'Steel plate girder field section on dunnage (8 ft web, 120 ft, ~35 t, braced upright)', category: 'Materials',
		keywords: 'steel girder plate girder weathering steel i-beam bridge beam field section splice stiffeners shear studs dunnage laydown',
		build: plateGirder },

	// Deck finishing and falsework.
	{ id: 'bridge-deck-finisher', name: 'Bridge deck finishing machine (Bid-Well type, 60 ft truss on screed rails, roller carriage, work bridge)', category: 'Concrete & batching',
		keywords: 'bid-well bidwell deck finisher paving machine screed bridge deck pour roller screed truss screed rails work bridge finishing bridge',
		build: deckFinisher },
	{ id: 'overhang-deck-bracket', name: 'Bridge deck overhang brackets with soffit forms and walkway (20 ft of exterior girder, 5 brackets)', category: 'Concrete & batching',
		keywords: 'overhang bracket deck bracket cantilever bracket c-49 deck forming soffit edge form screed rail walkway handrail exterior girder',
		build: overhangBrackets },
	{ id: 'pier-cap-falsework', name: 'Bridge pier cap form on shoring towers (40 ft cap over 2 × 5 ft columns, work platforms)', category: 'Concrete & batching',
		keywords: 'pier cap bent cap hammerhead form falsework shoring towers columns bridge pier formwork work platform rebar',
		build: pierCap },
	{ id: 'falsework-tower-bent', name: 'Heavy-duty falsework tower bent (2 towers 6 × 6 ft, 30 ft, screw jacks, W24 cap beams)', category: 'Shoring',
		keywords: 'falsework shoring tower bent heavy duty shoring temporary support girder cast in place screw jack cap beam',
		build: towerBent },
	{ id: 'sheet-pile-cofferdam', name: 'Sheet pile cofferdam, braced (30 × 20 ft, 10 ft stick-up, 2 waler levels, struts)', category: 'Shoring',
		keywords: 'cofferdam sheet pile sheeting walers struts bracing pier footing in water marine excavation shoring box',
		build: cofferdam },

	// Temporary bridge.
	{ id: 'panel-bridge-temporary', name: 'Temporary modular panel bridge (Acrow type, 100 ft single lane, crib abutments, ramps)', category: 'Access & scaffolding',
		keywords: 'acrow bailey bridge panel bridge temporary bridge detour haul road crossing modular steel bridge truss',
		build: panelBridge },

	// Retaining walls.
	{ id: 'mse-wall-panel-stack', name: 'MSE wall panels on dunnage (10 cruciform 5 × 5 ft panels) with steel strap bundles', category: 'Materials',
		keywords: 'mse wall panels mechanically stabilized earth reinforced earth cruciform precast panel soil reinforcing strips straps retaining wall',
		build: msePanels },
	{ id: 'segmental-wall-block-pallet', name: 'Segmental retaining wall blocks on a pallet (24 units, 18 × 8 × 22 in, ~2,300 lb)', category: 'Materials',
		keywords: 'retaining wall block segmental block keystone allan block split face landscape block pallet srw',
		build: wallBlockPallet },
	{ id: 'gabion-basket-run', name: 'Gabion baskets filled with rock (3 × 3 × 6 ft, 2 courses, 18 ft run)', category: 'Environmental & erosion control',
		keywords: 'gabion basket wire basket rock filled retaining wall erosion protection stone cage revetment',
		build: gabionRun, rowLength: 18 * FT },

	// Roadside safety.
	{ id: 'w-beam-guardrail-run', name: 'W-beam guardrail end section with terminal (50 ft, 31 in, steel posts)', category: 'Traffic control',
		keywords: 'guardrail guide rail w-beam highway barrier roadside steel posts blockouts end terminal extruder head et skt beam guard',
		build: guardrail },
	{ id: 'w-beam-guardrail-25ft', name: 'W-beam guardrail on steel posts (25 ft, 31 in, no terminal)', category: 'Traffic control',
		keywords: 'guardrail guide rail w-beam highway barrier roadside steel posts blockouts beam guard run line',
		build: guardrailRow, rowLength: 25 * FT },
	{ id: 'sand-barrel-crash-cushion', name: 'Sand barrel crash cushion (9 modules, yellow, inertial)', category: 'Traffic control',
		keywords: 'sand barrels crash cushion attenuator impact attenuator fitch barrels energite gore point inertial barrier',
		build: sandBarrels },
	{ id: 'overhead-sign-structure', name: 'Overhead sign truss on two end frames (60 ft span, 2 green guide signs)', category: 'Traffic control',
		keywords: 'overhead sign structure sign bridge sign gantry truss highway guide sign green sign',
		build: overheadSign },
];

// --- materials and small helpers -------------------------------------------------------------

const paint = color => mat( color, { roughness: 0.5, metalness: 0.2 } );
const DARK = () => mat( 0x2c2e31, { roughness: 0.7, metalness: 0.2 } );
const STEEL = () => mat( 0x7d8287, { roughness: 0.5, metalness: 0.6 } );
const BRIGHT = () => mat( 0xc9ccce, { roughness: 0.35, metalness: 0.3 } );
const PRECAST = () => mat( 0xc9c5bb, { roughness: 0.9 } );
const CONCRETE = () => mat( 0xa3a19b, { roughness: 0.95 } );
const TIMBER = () => mat( 0x9c7a50, { roughness: 0.95 } );
const LUMBER = () => mat( 0xc9a46a, { roughness: 0.9 } );
const PLYWOOD = () => mat( 0xb98a4e, { roughness: 0.85 } );
const FORM = () => mat( 0xd9a441, { roughness: 0.7 } );
const REBAR = () => mat( 0x6e4c38, { roughness: 0.8, metalness: 0.3 } );
const WEATHERING = () => mat( 0x7a4a2e, { roughness: 0.9, metalness: 0.25 } );
const YELLOW = () => paint( 0xe0a21b );
const RED_LAMP = () => mat( 0xb3141b, { roughness: 0.3, emissive: 0x7a0a0e, emissiveIntensity: 0.6 } );
const AMBER = () => mat( 0xff9a1a, { roughness: 0.3, emissive: 0xc76a00, emissiveIntensity: 0.6 } );

// A box of cross-section [ across, up ] from one point to another.
function member( parts, material, section, from, to ) {

	parts.add( material, memberGeometry( section, from, to ) );

}

// A cross-section (points [ x, y ]) run from one point to another, x staying level.
function profile( parts, material, points, from, to ) {

	const a = new Vector3( ...from );
	const b = new Vector3( ...to );
	const length = a.distanceTo( b );
	_q.setFromUnitVectors( Z, b.clone().sub( a ).divideScalar( length ) );
	parts.add( material, extruded( points, length ), _m.compose( a.add( b ).multiplyScalar( 0.5 ), _q, ONE ) );

}

// A wide-flange (W) section, depth d up and flange width bf across, centred on its middle.
function wShape( d, bf, tw, tf ) {

	const [ h, b, w ] = [ d / 2, bf / 2, tw / 2 ];
	return [ [ - b, - h ], [ b, - h ], [ b, - h + tf ], [ w, - h + tf ], [ w, h - tf ], [ b, h - tf ], [ b, h ], [ - b, h ], [ - b, h - tf ], [ - w, h - tf ], [ - w, - h + tf ], [ - b, - h + tf ] ];

}

const W24 = wShape( 24 * IN, 12.8 * IN, 0.65 * IN, 1.1 * IN );
const W12 = wShape( 12.2 * IN, 8.1 * IN, 0.36 * IN, 0.58 * IN );
const W6 = wShape( 6 * IN, 4 * IN, 0.17 * IN, 0.22 * IN );

// A tyre on its rim, axle across x, centred on [ x, y, z ].
function tyre( parts, radius, width, [ x, y, z ], segments = 18 ) {

	parts.rod( RUBBER(), [ x - width / 2, y, z ], [ x + width / 2, y, z ], radius, segments );
	parts.rod( STEEL(), [ x - width / 2 - 0.004, y, z ], [ x + width / 2 + 0.004, y, z ], radius * 0.55, 10 );

}

// A label drawn on a plane `size` [ w, h ], its face turned `turn` about y from facing +Z.
function label( parts, material, size, centre, turn ) {

	parts.add( material, new PlaneGeometry( ...size ), _m.makeRotationY( turn ).setPosition( ...centre ) );

}

// A guardrail of top rail, mid rail and toe board on posts along a straight line from a to b (both
// [ x, z ] at deck level y), the posts every `pitch` or less.
function handrail( parts, material, [ ax, az ], [ bx, bz ], y, pitch = 2.4 ) {

	const length = Math.hypot( bx - ax, bz - az );
	const posts = Math.max( 1, Math.ceil( length / pitch ) );
	for ( let i = 0; i <= posts; i ++ ) {

		const t = i / posts;
		const [ x, z ] = [ ax + ( bx - ax ) * t, az + ( bz - az ) * t ];
		member( parts, material, [ 0.05, 0.05 ], [ x, y, z ], [ x, y + 1.07, z ] );

	}

	for ( const h of [ 1.05, 0.55 ] ) member( parts, material, [ 0.04, 0.04 ], [ ax, y + h, az ], [ bx, y + h, bz ] );
	member( parts, material, [ 0.025, 0.15 ], [ ax, y + 0.075, az ], [ bx, y + 0.075, bz ] );

}

// The same random numbers each time, so a stone wall looks the same on every build.
function seeded( seed ) {

	return () => {

		seed = ( seed + 0x6d2b79f5 ) | 0;
		let t = Math.imul( seed ^ ( seed >>> 15 ), 1 | seed );
		t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t;
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	};

}

// A flat outline (points [ u, v ]) extruded `depth`, then moved by `matrix`.
function slab( points, depth ) {

	const shape = new Shape( points.map( ( [ u, v ] ) => new Vector2( u, v ) ) );
	return new ExtrudeGeometry( shape, { depth, bevelEnabled: false, curveSegments: 4 } );

}

// --- precast girders -------------------------------------------------------------------------

// The AASHTO-PCI BT-72 bulb tee, simplified, in inches: x across, y up from the bottom. 42 in top
// flange, 6 in web, 26 in bottom flange, 72 in deep; about 0.8 kip per foot.
const BT72 = [
	[ - 13, 0 ], [ 13, 0 ], [ 13, 6 ], [ 3, 10.5 ], [ 3, 64.5 ], [ 5, 66.5 ], [ 21, 68.5 ], [ 21, 72 ],
	[ - 21, 72 ], [ - 21, 68.5 ], [ - 5, 66.5 ], [ - 3, 64.5 ], [ - 3, 10.5 ], [ - 13, 6 ],
].map( ( [ x, y ] ) => [ x * IN, y * IN ] );
const BT_DEPTH = 72 * IN;
const BT_LENGTH = 130 * FT;

// A bulb tee `length` long running along z with the middle of its bottom at [ x, y, z ]: the
// concrete, the stirrups standing up out of the top flange to bond with the deck, two strand
// lifting loops near each end and the cut ends of the prestressing strands at both ends.
function bulbTee( parts, [ x, y, z ], length ) {

	parts.add( PRECAST(), extruded( BT72, length ), _m.makeTranslation( x, y, z ) );
	const top = y + BT_DEPTH;
	const steel = REBAR();
	const half = length / 2;

	// Stirrups every 18 in, a squared loop 5 in above the flange.
	const count = Math.floor( ( length - 0.6 ) / ( 18 * IN ) );
	for ( let i = 0; i <= count; i ++ ) {

		const zs = z - half + 0.3 + i * 18 * IN;
		parts.path( steel, [ [ x - 0.1, top - 0.01, zs ], [ x - 0.1, top + 0.13, zs ], [ x + 0.1, top + 0.13, zs ], [ x + 0.1, top - 0.01, zs ] ], 0.008, 4, false );

	}

	// Lifting loops: bent strand, two at each end, 6 ft in.
	for ( const s of [ - 1, 1 ] ) {

		for ( const dz of [ 0, 0.25 ] ) {

			const zl = z + s * ( half - 6 * FT - dz );
			const loop = [ 0, 0.5, 1 ].map( t => [ x + ( t - 0.5 ) * 0.2, top + 0.24 * Math.sin( Math.PI * t ) - 0.01, zl ] );
			loop.splice( 1, 0, [ x - 0.08, top + 0.17, zl ] );
			loop.splice( 3, 0, [ x + 0.08, top + 0.17, zl ] );
			parts.path( STEEL(), loop, 0.012, 6 );

		}

	}

	// Strand ends: rows in the bottom bulb and two in the top flange, 2 in apart, sticking out 4 in.
	const strands = [];
	for ( const [ row, n ] of [ [ 2, 11 ], [ 4, 11 ], [ 6, 7 ], [ 8, 3 ] ] ) for ( let i = 0; i < n; i ++ ) strands.push( [ ( i - ( n - 1 ) / 2 ) * 2, row ] );
	strands.push( [ - 8, 70 ], [ 8, 70 ] );
	for ( const s of [ - 1, 1 ] ) {

		const ze = z + s * half;
		for ( const [ sx, sy ] of strands ) parts.rod( STEEL(), [ x + sx * IN, y + sy * IN, ze ], [ x + sx * IN, y + sy * IN, ze + s * 4 * IN ], 0.3 * IN, 4 );

	}

}

// The girder on its way to the bridge: a heavy-haul tractor pulling a two-axle jeep with a turntable
// bolster carrying the front of the girder, and the back end on a four-line steerable dolly whose
// rear steersman rides in the cab at the back. The girder itself is the only thing joining the two.
function girderTransport() {

	const parts = new Parts();
	const { fifth } = tractor( parts, 0, { colour: 0x8c1d18 } );
	const frame = paint( 0x2a2c2f );
	const r = 0.5;

	// The jeep: a frame on the fifth wheel back over two axles, its turntable bolster between them.
	const jeepEnd = fifth + 5.2;
	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ 0.16, 0.3, jeepEnd - fifth + 0.6 ], [ s * 0.45, 0.76, ( jeepEnd + fifth - 0.6 ) / 2 ] );
	parts.box( frame, [ 2.4, 0.08, jeepEnd - fifth + 0.3 ], [ 0, 1.06, ( jeepEnd + fifth - 0.3 ) / 2 ] );
	const jeepAxles = [ fifth + 2.55, fifth + 3.95 ];
	for ( const za of jeepAxles ) {

		parts.rod( DARK(), [ - 0.95, r, za ], [ 0.95, r, za ], 0.07, 8 );
		for ( const s of [ - 1, 1 ] ) for ( const x of [ 0.8, 1.1 ] ) tyre( parts, r, 0.28, [ s * x, r, za ] );

	}

	for ( const s of [ - 1, 1 ] ) parts.box( BLACK(), [ 0.6, 0.55, 0.02 ], [ s * 0.95, 0.15, jeepEnd - 0.2 ] );
	const front = ( jeepAxles[ 0 ] + jeepAxles[ 1 ] ) / 2;
	const bolsterTop = 1.6;
	bolster( parts, front, 1.14, bolsterTop );

	// The girder, its front end 1.8 m ahead of the jeep's bolster and its back end 1.5 m past the dolly's.
	const z0 = front - 1.8;
	const z1 = z0 + BT_LENGTH;
	bulbTee( parts, [ 0, bolsterTop, ( z0 + z1 ) / 2 ], BT_LENGTH );
	const rear = z1 - 1.5;
	chains( parts, front, bolsterTop );
	chains( parts, rear, bolsterTop );

	// The steerable dolly: a deck 2.6 m wide on four lines of pendulum axles, its bolster in the middle.
	const pitch = 1.45;
	const dollyFront = rear - 2 * pitch - 0.4;
	const dollyEnd = rear + 2 * pitch + 1.6;
	parts.box( frame, [ 2.6, 0.32, dollyEnd - dollyFront ], [ 0, 0.82, ( dollyFront + dollyEnd ) / 2 ] );
	const dr = 0.42;
	for ( let i = 0; i < 4; i ++ ) {

		const za = rear + ( i - 1.5 ) * pitch;
		for ( const x of [ - 0.85, 0.85 ] ) {

			parts.box( DARK(), [ 0.3, 0.82 - 2 * dr + 0.06, 0.36 ], [ x, 2 * dr - 0.06, za ] );
			for ( const dx of [ - 0.24, 0.24 ] ) tyre( parts, dr, 0.24, [ x + dx, dr, za ], 14 );

		}

	}

	bolster( parts, rear, 1.14, bolsterTop );

	// The steersman's cab on the back of the dolly, beyond the girder's end, with a beacon and lamps.
	const cabZ = dollyEnd - 0.55;
	parts.box( frame, [ 1.3, 1.5, 0.95 ], [ 0.5, 1.14, cabZ ] );
	parts.box( GLASS(), [ 1.1, 0.6, 0.02 ], [ 0.5, 1.9, cabZ + 0.48 ] );
	parts.box( GLASS(), [ 1.1, 0.6, 0.02 ], [ 0.5, 1.9, cabZ - 0.48 ] );
	parts.box( GLASS(), [ 0.02, 0.6, 0.7 ], [ 1.16, 1.9, cabZ ] );
	parts.cylinder( AMBER(), 0.09, 0.14, [ 0.5, 2.64, cabZ ], 10 );
	for ( const s of [ - 1, 1 ] ) parts.box( RED_LAMP(), [ 0.2, 0.08, 0.02 ], [ s * 1.15, 0.85, dollyEnd + 0.01 ] );

	// An OVERSIZE LOAD banner on the bumper and red flags at the girder's back corners.
	const banner = drawn( 'oversize load banner', [ 512, 96 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#f4c900';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#111111';
		ctx.font = 'bold 64px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText( 'OVERSIZE LOAD', w / 2, h / 2 + 4, w * 0.92 );

	} );
	label( parts, banner, [ 2.1, 0.4 ], [ 0, 0.78, - 0.005 ], Math.PI );
	const flag = mat( 0xe0321e, { roughness: 0.8, side: DoubleSide } );
	for ( const s of [ - 1, 1 ] ) parts.box( flag, [ 0.01, 0.45, 0.45 ], [ s * 0.54, bolsterTop + BT_DEPTH - 0.5, z1 - 0.3 ] );

	return centred( parts );

}

// A turntable and timber-topped bolster across the trailer at z, from y0 up to `top`.
function bolster( parts, z, y0, top ) {

	parts.cylinder( DARK(), 0.6, 0.12, [ 0, y0, z ], 20 );
	parts.box( paint( 0xe0a21b ), [ 2.5, top - y0 - 0.22, 0.5 ], [ 0, y0 + 0.12, z ] );
	parts.box( TIMBER(), [ 1.0, 0.1, 0.45 ], [ 0, top - 0.1, z ] );

}

// Tie-down chains from both ends of a bolster at z up over the bottom flange's slope.
function chains( parts, z, top ) {

	const chain = mat( 0x3a3c3f, { roughness: 0.6, metalness: 0.6 } );
	for ( const s of [ - 1, 1 ] ) {

		parts.rod( chain, [ s * 1.15, top - 0.15, z ], [ s * 0.33, top + 0.15, z ], 0.012, 4 );
		parts.rod( chain, [ s * 0.33, top + 0.15, z ], [ s * 0.08, top + 0.27, z ], 0.012, 4 );

	}

}

// The girder at the job, laid down on timber cribs near its ends (where it will bear) and held
// upright by pipe braces from timber pads on both sides.
function girderLaydown() {

	const parts = new Parts();
	const y0 = 0.61;
	const half = BT_LENGTH / 2;
	for ( const z of [ - half + 1.0, half - 1.0 ] ) {

		crib( parts, z );
		braces( parts, z, y0 );

	}

	for ( const z of [ - half / 3, half / 3 ] ) braces( parts, z, y0 );
	bulbTee( parts, [ 0, y0, 0 ], BT_LENGTH );
	return parts.build();

}

// Two 12 × 12 timbers along the girder with one across them, 2 ft high, centred on z.
function crib( parts, z ) {

	const t = 12 * IN;
	for ( const x of [ - 0.38, 0.38 ] ) parts.box( TIMBER(), [ t, t, 4 * FT ], [ x, 0, z ] );
	parts.box( TIMBER(), [ 5 * FT, t, t ], [ 0, t, z ] );

}

// A pair of pipe braces at z from pads on the ground to just under the top flange's tips.
function braces( parts, z, y0, reach = 1.75, top = BT_DEPTH - 0.12, flange = 0.5 ) {

	for ( const s of [ - 1, 1 ] ) {

		parts.box( TIMBER(), [ 0.3, 0.1, 0.6 ], [ s * reach, 0, z ] );
		parts.rod( STEEL(), [ s * reach, 0.12, z ], [ s * flange, y0 + top, z ], 0.045, 8 );
		parts.box( STEEL(), [ 0.12, 0.02, 0.2 ], [ s * reach, 0.1, z ] );

	}

}

// --- steel plate girder ----------------------------------------------------------------------

// A 120 ft field section of a weathering steel plate girder, standing upright on two timber cribs
// with pipe braces: a 96 × 11/16 in web, 22 × 1-3/4 in top and 26 × 2-1/2 in bottom flanges,
// stiffeners on both sides every 8 ft (wider connection plates every third, where the cross frames
// go), three rows of shear studs on the top flange, and the field splice plates bolted on at the
// back end ready for the next section.
function plateGirder() {

	const parts = new Parts();
	const steel = WEATHERING();
	const length = 120 * FT;
	const half = length / 2;
	const y0 = 0.61;
	const [ web, tw ] = [ 96 * IN, 0.6875 * IN ];
	const [ bt, tt ] = [ 26 * IN, 22 * IN ];
	const [ bf, tf ] = [ 2.5 * IN, 1.75 * IN ];
	const top = y0 + bf + web + tf;

	parts.box( steel, [ bt, bf, length ], [ 0, y0, 0 ] );
	parts.box( steel, [ tw, web, length ], [ 0, y0 + bf, 0 ] );
	parts.box( steel, [ tt, tf, length ], [ 0, y0 + bf + web, 0 ] );

	// Stiffeners, both sides, between the flanges.
	const bays = 15;
	for ( let i = 1; i < bays; i ++ ) {

		const z = - half + i * length / bays;
		const wide = i % 3 === 0;
		for ( const s of [ - 1, 1 ] ) parts.box( steel, [ wide ? 0.2 : 0.18, web, wide ? 0.016 : 0.013 ], [ s * ( tw / 2 + ( wide ? 0.1 : 0.09 ) ), y0 + bf, z ] );
		if ( wide ) for ( const s of [ - 1, 1 ] ) for ( const h of [ 0.35, 0.55, 2.05, 2.25 ] ) parts.cylinder( BRIGHT(), 0.012, 0.005, [ s * 0.21, y0 + bf + h, z ], 6 );

	}

	// Shear studs: 7/8 in, 6 in tall, three across every 18 in.
	const studs = Math.floor( ( length - 0.6 ) / ( 18 * IN ) );
	for ( let i = 0; i <= studs; i ++ ) {

		const z = - half + 0.3 + i * 18 * IN;
		for ( const x of [ - 0.17, 0, 0.17 ] ) {

			parts.cylinder( STEEL(), 0.011, 0.15, [ x, top, z ], 6 );
			parts.cylinder( STEEL(), 0.018, 0.012, [ x, top + 0.15, z ], 6 );

		}

	}

	// The field splice at the back end: web plates both sides and flange plates above and below,
	// half on this section, the other half sticking out for the next, with rows of bolt heads.
	const sp = 0.9;
	const zs = half;
	for ( const s of [ - 1, 1 ] ) {

		parts.box( steel, [ 0.016, web - 0.25, sp ], [ s * ( tw / 2 + 0.008 ), y0 + bf + 0.125, zs ] );
		for ( let row = 0; row < 12; row ++ ) for ( const dz of [ - 0.35, - 0.25, - 0.15 ] ) {

			const [ x, y ] = [ s * ( tw / 2 + 0.016 ), y0 + bf + 0.25 + row * 0.18 ];
			parts.rod( BRIGHT(), [ x, y, zs + dz ], [ x + s * 0.014, y, zs + dz ], 0.017, 6 );

		}

	}

	parts.box( steel, [ tt - 0.04, 0.02, sp ], [ 0, top, zs ] );
	parts.box( steel, [ bt - 0.04, 0.025, sp ], [ 0, y0 - 0.025, zs ] );

	// Two cribs at the fifth points, braced both sides there and in the middle.
	for ( const z of [ - half * 0.6, half * 0.6 ] ) {

		crib( parts, z );
		braces( parts, z, y0, 2.0, bf + web - 0.15, tt / 2 - 0.02 );

	}

	braces( parts, 0, y0, 2.0, bf + web - 0.15, tt / 2 - 0.02 );
	return parts.build();

}

// --- deck finishing --------------------------------------------------------------------------

// A Bid-Well type bridge deck finisher set up for a pour: a 60 ft box truss on end carriages riding
// 2 in pipe screed rails (set on adjustable chairs, as on the overhang brackets), the power unit on
// the right end, and the finishing carriage under the truss with its auger and two rollers that
// runs back and forth across the deck. A low work bridge for the finishers trails behind on the
// same rails.
function deckFinisher() {

	const parts = new Parts();
	const yellow = YELLOW();
	const galv = GALVANISED();
	const span = 60 * FT;
	const railX = span / 2;
	const railLength = 30 * FT;
	const railTop = 0.25;

	// Screed rails on their chairs.
	for ( const x of [ - railX, railX ] ) {

		parts.rod( galv, [ x, railTop - 0.03, - railLength / 2 ], [ x, railTop - 0.03, railLength / 2 ], 0.03, 8 );
		for ( let z = - railLength / 2 + 0.3; z < railLength / 2; z += 0.9 ) {

			parts.rod( STEEL(), [ x, 0.02, z ], [ x, railTop - 0.06, z ], 0.012, 6 );
			parts.box( STEEL(), [ 0.12, 0.02, 0.12 ], [ x, 0, z ] );
			parts.box( STEEL(), [ 0.08, 0.02, 0.06 ], [ x, railTop - 0.08, z ] );

		}

	}

	// The finisher's end carriages: a frame on two flanged wheels on the rail, the truss on top.
	const zf = - 1.6;
	const trussBottom = 1.05;
	const depth = 1.0;
	const width = 0.9;
	for ( const s of [ - 1, 1 ] ) {

		const x = s * railX;
		for ( const dz of [ - 0.85, 0.85 ] ) {

			parts.rod( DARK(), [ x - 0.05, railTop + 0.12, zf + dz ], [ x + 0.05, railTop + 0.12, zf + dz ], 0.13, 14 );
			parts.box( yellow, [ 0.2, 0.3, 0.3 ], [ x + s * 0.12, railTop + 0.05, zf + dz ] );

		}

		parts.box( yellow, [ 0.35, 0.25, 2.2 ], [ x + s * 0.12, railTop + 0.33, zf ] );
		member( parts, yellow, [ 0.3, 0.3 ], [ x, railTop + 0.58, zf ], [ x, trussBottom, zf ] );

	}

	// The power unit (engine, hydraulic tank) and the operator's console on the right end.
	parts.box( yellow, [ 1.1, 0.9, 1.3 ], [ railX - 0.2, trussBottom + depth, zf ] );
	parts.box( DARK(), [ 0.02, 0.5, 0.9 ], [ railX + 0.36, trussBottom + depth + 0.2, zf ] );
	parts.rod( DARK(), [ railX - 0.4, trussBottom + depth + 0.9, zf + 0.4 ], [ railX - 0.4, trussBottom + depth + 1.3, zf + 0.4 ], 0.04, 8 );
	parts.box( DARK(), [ 0.45, 0.35, 0.25 ], [ railX - 0.1, trussBottom + depth - 0.55, zf - 0.75 ] );

	// The truss: four chords, posts and diagonals on the front, back and top.
	const x0 = - railX - 0.25;
	const x1 = railX + 0.25;
	const panels = 16;
	const step = ( x1 - x0 ) / panels;
	const chord = [ 0.08, 0.08 ];
	for ( const y of [ trussBottom, trussBottom + depth ] ) for ( const dz of [ - width / 2, width / 2 ] ) member( parts, yellow, chord, [ x0, y, zf + dz ], [ x1, y, zf + dz ] );
	for ( let i = 0; i <= panels; i ++ ) {

		const x = x0 + i * step;
		for ( const dz of [ - width / 2, width / 2 ] ) member( parts, yellow, [ 0.05, 0.05 ], [ x, trussBottom, zf + dz ], [ x, trussBottom + depth, zf + dz ] );
		member( parts, yellow, [ 0.04, 0.04 ], [ x, trussBottom + depth, zf - width / 2 ], [ x, trussBottom + depth, zf + width / 2 ] );
		member( parts, yellow, [ 0.04, 0.04 ], [ x, trussBottom, zf - width / 2 ], [ x, trussBottom, zf + width / 2 ] );
		if ( i === panels ) continue;
		const flip = i % 2 ? 1 : 0;
		for ( const dz of [ - width / 2, width / 2 ] ) member( parts, yellow, [ 0.04, 0.04 ], [ x, trussBottom + depth * flip, zf + dz ], [ x + step, trussBottom + depth * ( 1 - flip ), zf + dz ] );
		member( parts, yellow, [ 0.035, 0.035 ], [ x, trussBottom + depth, zf - width / 2 ], [ x + step, trussBottom + depth, zf + width / 2 ] );

	}

	// The finishing carriage, part way across: a frame hung from the bottom chords, an auger in
	// front, two rollers behind it and a burlap drag, all just on the concrete (a little under the
	// rails' tops).
	const xc = - 3.2;
	const deck = railTop - 0.1;
	const cw = 1.6;
	for ( const dz of [ - width / 2, width / 2 ] ) parts.box( DARK(), [ cw, 0.12, 0.12 ], [ xc, trussBottom - 0.12, zf + dz ] );
	for ( const dx of [ - cw / 2, cw / 2 ] ) for ( const dz of [ - 0.75, 0.75 ] ) member( parts, DARK(), [ 0.06, 0.06 ], [ xc + dx, deck + 0.3, zf + dz ], [ xc + dx, trussBottom - 0.12, zf + dz * 0.6 ] );
	for ( const dz of [ - 0.75, 0.75 ] ) member( parts, DARK(), [ 0.08, 0.08 ], [ xc - cw / 2, deck + 0.3, zf + dz ], [ xc + cw / 2, deck + 0.3, zf + dz ] );
	for ( const dx of [ - cw / 2, cw / 2 ] ) member( parts, DARK(), [ 0.08, 0.08 ], [ xc + dx, deck + 0.3, zf - 0.75 ], [ xc + dx, deck + 0.3, zf + 0.75 ] );
	parts.box( yellow, [ 0.7, 0.4, 0.5 ], [ xc, trussBottom - 0.55, zf ] );
	const steel = STEEL();
	const ra = 0.13;
	parts.rod( steel, [ xc - cw / 2, deck + ra, zf - 0.62 ], [ xc + cw / 2, deck + ra, zf - 0.62 ], 0.04, 8 );
	for ( let i = 0; i <= 12; i ++ ) {

		const x = xc - cw / 2 + i * cw / 12;
		parts.rod( steel, [ x, deck + ra, zf - 0.62 ], [ x + 0.012, deck + ra, zf - 0.62 ], ra, 12 );

	}

	for ( const dz of [ - 0.2, 0.2 ] ) parts.rod( BRIGHT(), [ xc - cw / 2, deck + 0.13, zf + dz ], [ xc + cw / 2, deck + 0.13, zf + dz ], 0.13, 18 );
	parts.box( mat( 0x8f7a58, { roughness: 1 } ), [ cw, 0.01, 0.5 ], [ xc, deck, zf + 0.62 ] );

	// The work bridge: two deep side channels spanning the rails with a plank deck, on wheels.
	const zw = 2.6;
	const bridgeY = railTop + 0.3;
	for ( const dz of [ - 0.5, 0.5 ] ) member( parts, galv, [ 0.08, 0.3 ], [ - railX - 0.2, bridgeY, zw + dz ], [ railX + 0.2, bridgeY, zw + dz ] );
	parts.box( mat( 0xb7bbbe, { roughness: 0.6, metalness: 0.5 } ), [ span + 0.4, 0.04, 0.92 ], [ 0, bridgeY + 0.13, zw ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( galv, [ 0.3, 0.2, 1.4 ], [ s * railX, railTop + 0.1, zw ] );
		for ( const dz of [ - 0.5, 0.5 ] ) parts.rod( DARK(), [ s * railX - 0.04, railTop + 0.08, zw + dz ], [ s * railX + 0.04, railTop + 0.08, zw + dz ], 0.08, 12 );

	}

	return parts.build();

}

// Five overhang brackets (Meadow Burke C-49 type) hung 4 ft apart on a 20 ft length of exterior
// bulb tee, set on bearing pedestals: each a vertical leg bearing on the web, an arm out under the
// flange tip and a diagonal strut, carrying timber nailers, 2 × 4 joists and the plywood soffit for
// the deck overhang, the edge form, the screed rail on its chairs, and the walkway with its
// handrail outboard. The overhang faces the front (-Z); the girder runs across (x).
function overhangBrackets() {

	const parts = new Parts();
	const length = 20 * FT;
	const yb = 0.3;
	const yt = yb + BT_DEPTH;
	const steel = paint( 0x2f5d8c );

	// The pedestals and the girder (its section turned to run across x).
	for ( const x of [ - length / 2 + 0.35, length / 2 - 0.35 ] ) {

		parts.box( CONCRETE(), [ 0.6, yb - 0.04, 0.9 ], [ x, 0, 0 ] );
		parts.box( BLACK(), [ 0.45, 0.04, 0.6 ], [ x, yb - 0.04, 0 ] );

	}

	parts.add( PRECAST(), extruded( BT72, length ), _m.makeRotationY( Math.PI / 2 ).setPosition( 0, yb, 0 ) );

	// The brackets.
	const legZ = - 3 * IN - 0.03;
	const armY = yt - 0.2;
	const edge = - 0.53 - 4 * FT;
	const armEnd = edge - 0.9;
	const brackets = [ - 2, - 1, 0, 1, 2 ].map( i => i * 4 * FT );
	for ( const x of brackets ) {

		member( parts, steel, [ 0.06, 0.08 ], [ x, yb + 0.35, legZ ], [ x, armY + 0.04, legZ ] );
		member( parts, steel, [ 0.06, 0.08 ], [ x, armY, legZ ], [ x, armY, armEnd ] );
		member( parts, steel, [ 0.05, 0.06 ], [ x, yb + 0.38, legZ - 0.03 ], [ x, armY - 0.04, - 1.25 ] );
		parts.box( steel, [ 0.12, 0.02, 0.1 ], [ x, yb + 0.3, legZ ] );
		// The hanger rod from the insert in the flange down to the arm, and its nut.
		parts.rod( BRIGHT(), [ x, yt - 0.08, - 0.46 ], [ x, armY - 0.06, - 0.46 ], 0.012, 6 );
		parts.box( BRIGHT(), [ 0.05, 0.03, 0.05 ], [ x, armY - 0.09, - 0.46 ] );

	}

	// Timber nailers along each arm outboard of the flange tip, 2 × 4 joists along the girder, the
	// plywood soffit out to the deck edge 4 ft past the flange, and the 2 × 10 edge form.
	const lumber = LUMBER();
	const joistBottom = yt - 0.06;
	for ( const x of brackets ) parts.box( lumber, [ 0.09, joistBottom - armY - 0.04, - edge - 0.5 ], [ x, armY + 0.04, ( edge - 0.06 - 0.56 ) / 2 ] );
	for ( let z = - 0.6; z > edge; z -= 0.3 ) parts.box( lumber, [ length, 0.09, 0.04 ], [ 0, joistBottom, z ] );
	const soffit = joistBottom + 0.09;
	parts.box( PLYWOOD(), [ length, 0.019, - edge - 0.533 ], [ 0, soffit, ( edge - 0.533 ) / 2 ] );
	parts.box( lumber, [ length, 0.235, 0.038 ], [ 0, soffit, edge - 0.019 ] );
	for ( const x of brackets ) member( parts, lumber, [ 0.038, 0.09 ], [ x, soffit + 0.02, edge - 0.08 ], [ x, soffit + 0.2, edge - 0.04 ] );

	// The screed rail on its chairs, just outside the edge form.
	const railZ = edge - 0.2;
	for ( const x of brackets ) parts.rod( STEEL(), [ x, armY + 0.04, railZ ], [ x, soffit + 0.3, railZ ], 0.015, 6 );
	parts.rod( GALVANISED(), [ - length / 2, soffit + 0.32, railZ ], [ length / 2, soffit + 0.32, railZ ], 0.03, 8 );

	// The walkway planks on the arms outboard, and the handrail along its outside edge.
	const walk = armY + 0.04;
	for ( let i = 0; i < 3; i ++ ) parts.box( lumber, [ length, 0.05, 0.19 ], [ 0, walk, armEnd + 0.1 + i * 0.2 ] );
	handrail( parts, lumber, [ - length / 2, armEnd + 0.03 ], [ length / 2, armEnd + 0.03 ], walk + 0.05, 4 * FT );
	return parts.build();

}

// --- falsework -------------------------------------------------------------------------------

// One frame shoring tower `w` across x by `d` along z centred on [ x, z ]: a sill and base jack under
// each leg, `frames` frames of `lift` with ledgers and cross braces, and top jacks reaching `top`.
function shoringTower( parts, [ x, z ], [ w, d ], frames, lift, top, { leg = 0.03, colour = 0x2f6db3 } = {} ) {

	const frame = paint( colour );
	const galv = GALVANISED();
	const sill = 0.08;
	const jack = 0.3;
	const legs = [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ] ].map( ( [ a, b ] ) => [ x + a * w / 2, z + b * d / 2 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( TIMBER(), [ 0.25, sill, d + 0.4 ], [ x + s * w / 2, 0, z ] );
	const y0 = sill + jack;
	const y1 = y0 + frames * lift;
	for ( const [ lx, lz ] of legs ) {

		parts.box( galv, [ 0.15, 0.01, 0.15 ], [ lx, sill, lz ] );
		parts.rod( galv, [ lx, sill, lz ], [ lx, y0, lz ], 0.018, 6 );
		parts.box( galv, [ 0.12, 0.03, 0.12 ], [ lx, y0 - 0.12, lz ] );
		parts.rod( frame, [ lx, y0, lz ], [ lx, y1, lz ], leg, 8 );
		parts.rod( galv, [ lx, y1, lz ], [ lx, top - 0.02, lz ], 0.018, 6 );
		parts.box( galv, [ 0.12, 0.03, 0.12 ], [ lx, y1 + 0.08, lz ] );

	}

	for ( let i = 0; i < frames; i ++ ) {

		const ya = y0 + i * lift;
		const yb = ya + lift;
		// Frame ledgers across x at the top and bottom of each frame, and a pair of cross braces on
		// each x side.
		for ( const s of [ - 1, 1 ] ) {

			parts.rod( frame, [ x - w / 2, yb - 0.1, z + s * d / 2 ], [ x + w / 2, yb - 0.1, z + s * d / 2 ], leg * 0.8, 6 );
			parts.rod( frame, [ x - w / 2, ya + 0.15, z + s * d / 2 ], [ x + w / 2, ya + 0.15, z + s * d / 2 ], leg * 0.6, 6 );
			parts.rod( galv, [ x + s * w / 2, ya + 0.1, z - d / 2 ], [ x + s * w / 2, yb - 0.1, z + d / 2 ], 0.012, 5 );
			parts.rod( galv, [ x + s * w / 2, ya + 0.1, z + d / 2 ], [ x + s * w / 2, yb - 0.1, z - d / 2 ], 0.012, 5 );

		}

	}

	// U-heads on the top jacks.
	for ( const [ lx, lz ] of legs ) {

		parts.box( galv, [ 0.2, 0.012, 0.16 ], [ lx, top - 0.02, lz ] );
		for ( const s of [ - 1, 1 ] ) parts.box( galv, [ 0.2, 0.08, 0.01 ], [ lx, top - 0.02, lz + s * 0.08 ] );

	}

}

// A 40 × 5 × 5 ft pier cap formed in the air over two 5 ft round columns 20 ft high: the soffit on
// joists over two W12 beams on cross beams on three shoring towers (one between the columns and
// one under each end), plywood side forms with strongbacks and walers, the top mat of the rebar
// cage showing, and a work platform with guardrails along both sides.
function pierCap() {

	const parts = new Parts();
	const columnR = 2.5 * FT;
	const columnX = 12 * FT;
	const soffit = 20 * FT;
	const [ capL, capW, capD ] = [ 40 * FT, 5 * FT, 5 * FT ];
	const steel = paint( 0x50555a );

	// The columns.
	for ( const x of [ - columnX, columnX ] ) parts.cylinder( CONCRETE(), columnR, soffit, [ x, 0, 0 ], 28 );

	// Under the form: plywood, 4 × 4 joists across, two W12 beams along beside the columns, three
	// W8 cross beams on the towers' U-heads, long enough to carry the side platforms too.
	const plywood = 0.019;
	const joist = 0.09;
	const beamZ = columnR + 0.15;
	const beamTop = soffit - plywood - joist;
	const beamBottom = beamTop - 12.2 * IN;
	const crossTop = beamBottom;
	const crossBottom = crossTop - 0.2;
	const towersX = [ - capL / 2 + 0.6, 0, capL / 2 - 0.6 ];
	const platformZ = 2.2;
	for ( const z of [ - beamZ, beamZ ] ) profile( parts, steel, W12, [ - capL / 2 - 0.1, ( beamTop + beamBottom ) / 2, z ], [ capL / 2 + 0.1, ( beamTop + beamBottom ) / 2, z ] );
	for ( const x of towersX ) member( parts, steel, [ 0.15, 0.2 ], [ x, ( crossTop + crossBottom ) / 2, - platformZ ], [ x, ( crossTop + crossBottom ) / 2, platformZ ] );
	for ( let x = - capL / 2 + 0.15; x < capL / 2; x += 0.3 ) parts.box( LUMBER(), [ 0.09, joist, 2 * beamZ + 0.5 ], [ x, beamTop, 0 ] );
	parts.box( PLYWOOD(), [ capL + 0.1, plywood, capW + 0.1 ], [ 0, soffit - plywood, 0 ] );

	// The towers: 4 ft across x by 7 ft along z, three 5 ft frames, jacks up to the cross beams.
	for ( const x of towersX ) shoringTower( parts, [ x, 0 ], [ 4 * FT, 7 * FT ], 3, 5 * FT, crossBottom );

	// The side forms: plywood faces, strongbacks every 2 ft and two double walers, and the ends.
	const form = FORM();
	const top = soffit + capD;
	for ( const s of [ - 1, 1 ] ) {

		const zf = s * ( capW / 2 + 0.01 );
		parts.box( form, [ capL + 0.1, capD + 0.05, 0.02 ], [ 0, soffit, zf ] );
		for ( let x = - capL / 2 + 0.3; x < capL / 2; x += 2 * FT ) parts.box( LUMBER(), [ 0.09, capD, 0.09 ], [ x, soffit, zf + s * 0.055 ] );
		for ( const h of [ 0.35, capD - 0.55 ] ) for ( const dy of [ 0, 0.16 ] ) parts.box( steel, [ capL + 0.4, 0.14, 0.06 ], [ 0, soffit + h + dy, zf + s * 0.13 ] );

	}

	for ( const s of [ - 1, 1 ] ) parts.box( form, [ 0.02, capD + 0.05, capW + 0.06 ], [ s * ( capL / 2 + 0.06 ), soffit, 0 ] );

	// The top of the cage: longitudinal bars and the stirrups' tops, an inch below the form's top.
	const rebar = REBAR();
	const barY = top - 0.03;
	for ( let i = 0; i < 9; i ++ ) {

		const z = - capW / 2 + 0.1 + i * ( capW - 0.2 ) / 8;
		parts.rod( rebar, [ - capL / 2 + 0.08, barY, z ], [ capL / 2 - 0.08, barY, z ], 0.016, 5 );

	}

	for ( let x = - capL / 2 + 0.15; x < capL / 2; x += 0.3 ) parts.rod( rebar, [ x, barY - 0.03, - capW / 2 + 0.08 ], [ x, barY - 0.03, capW / 2 - 0.08 ], 0.008, 4 );

	// Work platforms on the cross beams' ends: plank decks and guardrails along both sides and ends.
	const deckY = crossTop + 0.15;
	const inner = capW / 2 + 0.2;
	for ( const s of [ - 1, 1 ] ) {

		for ( const z of [ inner + 0.2, platformZ - 0.15 ] ) profile( parts, steel, W6, [ - capL / 2 - 0.4, crossTop + 3 * IN, s * z ], [ capL / 2 + 0.4, crossTop + 3 * IN, s * z ] );
		parts.box( LUMBER(), [ capL + 0.8, 0.05, platformZ - inner ], [ 0, deckY, s * ( platformZ + inner ) / 2 ] );
		handrail( parts, LUMBER(), [ - capL / 2 - 0.4, s * platformZ ], [ capL / 2 + 0.4, s * platformZ ], deckY + 0.05 );
		handrail( parts, LUMBER(), [ s * ( capL / 2 + 0.4 ), - platformZ ], [ s * ( capL / 2 + 0.4 ), - inner ], deckY + 0.05 );
		handrail( parts, LUMBER(), [ s * ( capL / 2 + 0.4 ), inner ], [ s * ( capL / 2 + 0.4 ), platformZ ], deckY + 0.05 );

	}

	// A ladder up the right end tower to the front platform.
	const lx = capL / 2 - 0.6 + 2 * FT + 0.15;
	for ( const dz of [ - 0.22, 0.22 ] ) parts.rod( GALVANISED(), [ lx, 0, - 1.9 + dz ], [ lx, deckY + 1.0, - 1.9 + dz ], 0.025, 6 );
	for ( let y = 0.3; y < deckY + 0.8; y += 0.3 ) parts.rod( GALVANISED(), [ lx, y, - 2.12 ], [ lx, y, - 1.68 ], 0.014, 5 );

	return parts.build();

}

// A heavy-duty falsework bent: two 6 × 6 ft towers of heavy frames 24 ft apart on doubled 12 × 12
// sills, screw jacks top and bottom, and two W24 cap beams across both in the U-heads, 30 ft to the
// top, with tie tubes between the towers. Under girder splices and cast-in-place spans.
function towerBent() {

	const parts = new Parts();
	const height = 30 * FT;
	const side = 6 * FT;
	const centres = 12 * FT;
	const capLength = 30 * FT;
	const base = 12 * IN;
	const capY = height - 24 * IN;
	const steel = paint( 0x50555a );

	for ( const x of [ - centres, centres ] ) {

		for ( const dx of [ - side / 2, side / 2 ] ) parts.box( TIMBER(), [ 12 * IN, base, side + 0.8 ], [ x + dx, 0, 0 ] );
		heavyTower( parts, [ x, 0 ], side, base, capY );

	}

	for ( const s of [ - 1, 1 ] ) profile( parts, steel, W24, [ - capLength / 2, height - 12 * IN, s * side / 2 ], [ capLength / 2, height - 12 * IN, s * side / 2 ] );

	// Tie tubes between the towers at two levels, both sides, and a diagonal in each face.
	const galv = GALVANISED();
	for ( const s of [ - 1, 1 ] ) {

		const z = s * side / 2;
		for ( const y of [ 2.5, 6.5 ] ) parts.rod( galv, [ - centres + side / 2, y, z ], [ centres - side / 2, y, z ], 0.024, 6 );
		parts.rod( galv, [ - centres + side / 2, 2.5, z ], [ centres - side / 2, 6.5, z ], 0.024, 6 );

	}

	return parts.build();

}

// A heavy shoring tower `side` square centred on [ x, z ] standing on sills `base` high, its
// U-heads at `top`: four 4 in legs in 5 ft lifts with ledgers and X braces on every face.
function heavyTower( parts, [ x, z ], side, base, top ) {

	const frame = paint( 0xd2491f );
	const galv = GALVANISED();
	const jack = 0.35;
	const h = side / 2;
	const legs = [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ].map( ( [ a, b ] ) => [ x + a * h, z + b * h ] );
	const y0 = base + jack;
	const y1 = top - jack;
	const lifts = Math.round( ( y1 - y0 ) / ( 5 * FT ) );
	const lift = ( y1 - y0 ) / lifts;
	for ( const [ lx, lz ] of legs ) {

		parts.box( galv, [ 0.25, 0.015, 0.25 ], [ lx, base, lz ] );
		parts.rod( galv, [ lx, base, lz ], [ lx, y0, lz ], 0.03, 8 );
		parts.box( galv, [ 0.16, 0.04, 0.16 ], [ lx, y0 - 0.15, lz ] );
		parts.rod( frame, [ lx, y0, lz ], [ lx, y1, lz ], 0.057, 10 );
		parts.rod( galv, [ lx, y1, lz ], [ lx, top, lz ], 0.03, 8 );
		parts.box( galv, [ 0.16, 0.04, 0.16 ], [ lx, y1 + 0.12, lz ] );
		parts.box( galv, [ 0.36, 0.015, 0.36 ], [ lx, top, lz ] );
		for ( const s of [ - 1, 1 ] ) parts.box( galv, [ 0.015, 0.12, 0.36 ], [ lx + s * 0.17, top, lz ] );

	}

	for ( let i = 0; i <= lifts; i ++ ) {

		const y = y0 + i * lift;
		for ( let k = 0; k < 4; k ++ ) {

			const [ a, b ] = [ legs[ k ], legs[ ( k + 1 ) % 4 ] ];
			parts.rod( frame, [ a[ 0 ], y, a[ 1 ] ], [ b[ 0 ], y, b[ 1 ] ], 0.03, 6 );
			if ( i === lifts ) continue;
			parts.rod( galv, [ a[ 0 ], y, a[ 1 ] ], [ b[ 0 ], y + lift, b[ 1 ] ], 0.018, 5 );
			parts.rod( galv, [ b[ 0 ], y, b[ 1 ] ], [ a[ 0 ], y + lift, a[ 1 ] ], 0.018, 5 );

		}

	}

}

// A sheet pile cofferdam 30 × 20 ft inside, Z-piles 3 ft a pair and 12 in deep, standing 10 ft out
// of the ground (or the water), with two levels of W14 walers round the inside on brackets, a
// strut across the middle and a knee strut across each corner at both levels, and a ladder in.
function cofferdam() {

	const parts = new Parts();
	const pile = mat( 0x4f4339, { roughness: 0.85, metalness: 0.35 } );
	const steel = paint( 0x50555a );
	const height = 10 * FT;
	const [ lx, lz ] = [ 15 * FT, 10 * FT ];
	const amp = 12 * IN;
	const t = 0.5 * IN;

	// Each side's piles as a corrugated line: along, out, along, back in, per pair.
	const sides = [
		[ [ - lx, - lz ], [ lx, - lz ], [ 0, - 1 ] ],
		[ [ lx, - lz ], [ lx, lz ], [ 1, 0 ] ],
		[ [ lx, lz ], [ - lx, lz ], [ 0, 1 ] ],
		[ [ - lx, lz ], [ - lx, - lz ], [ - 1, 0 ] ],
	];
	const offsets = [ [ 0, 0 ], [ 0.3, 0 ], [ 0.5, 1 ], [ 0.8, 1 ], [ 1, 0 ] ];
	for ( const [ a, b, out ] of sides ) {

		const length = Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] );
		const pairs = Math.round( length / ( 36 * IN ) );
		const along = [ ( b[ 0 ] - a[ 0 ] ) / length, ( b[ 1 ] - a[ 1 ] ) / length ];
		const point = ( s, o ) => [ a[ 0 ] + along[ 0 ] * s + out[ 0 ] * o, height / 2, a[ 1 ] + along[ 1 ] * s + out[ 1 ] * o ];
		const p = length / pairs;
		for ( let i = 0; i < pairs; i ++ ) {

			for ( let k = 1; k < offsets.length; k ++ ) {

				const [ sa, oa ] = offsets[ k - 1 ];
				const [ sb, ob ] = offsets[ k ];
				member( parts, pile, [ t, height ], point( ( i + sa ) * p, ( oa - 0.5 ) * amp ), point( ( i + sb ) * p, ( ob - 0.5 ) * amp ) );

			}

		}

	}

	// Corner piles.
	for ( const [ x, z ] of [ [ - lx, - lz ], [ lx, - lz ], [ lx, lz ], [ - lx, lz ] ] ) parts.box( pile, [ amp * 0.7, height, amp * 0.7 ], [ x, 0, z ] );

	// Walers just inside the piles' inner faces, at two levels.
	const wd = 14 * IN;
	const inner = [ lx - amp / 2, lz - amp / 2 ];
	const [ ix, iz ] = [ inner[ 0 ] - wd / 2, inner[ 1 ] - wd / 2 ];
	const levels = [ height - 2 * FT, height - 7 * FT ];
	for ( const y of levels ) {

		for ( const s of [ - 1, 1 ] ) {

			parts.box( steel, [ 2 * inner[ 0 ], wd, wd ], [ 0, y - wd / 2, s * iz ] );
			parts.box( steel, [ wd, wd, 2 * iz - wd ], [ s * ix, y - wd / 2, 0 ] );

		}

		// The cross strut (a 16 in pipe with end plates) and the corner knee struts (12 in pipe).
		parts.rod( steel, [ 0, y, - iz + wd / 2 ], [ 0, y, iz - wd / 2 ], 8 * IN, 16 );
		for ( const s of [ - 1, 1 ] ) parts.box( steel, [ 0.5, 0.5, 0.03 ], [ 0, y - 0.25, s * ( iz - wd / 2 - 0.015 ) ] );
		const k = 1.8;
		for ( const [ sx, sz ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ] ) parts.rod( steel, [ sx * ( ix - wd / 2 ), y, sz * ( iz - wd / 2 - k ) ], [ sx * ( ix - wd / 2 - k ), y, sz * ( iz - wd / 2 ) ], 6 * IN, 12 );

		// Brackets welded to the piles under the walers.
		for ( const x of [ - 3, - 1, 1, 3 ] ) for ( const s of [ - 1, 1 ] ) parts.box( steel, [ 0.15, 0.15, 0.25 ], [ x, y - wd - 0.15, s * ( inner[ 1 ] - 0.12 ) ] );

	}

	// A ladder down the inside of the back wall, its stiles 3 ft above the top.
	const ladderZ = inner[ 1 ] - wd - 0.15;
	for ( const dx of [ - 0.22, 0.22 ] ) parts.rod( GALVANISED(), [ 2.4 + dx, 0, ladderZ ], [ 2.4 + dx, height + 0.9, ladderZ ], 0.025, 6 );
	for ( let y = 0.3; y < height + 0.5; y += 0.3 ) parts.rod( GALVANISED(), [ 2.18, y, ladderZ ], [ 2.62, y, ladderZ ], 0.014, 5 );

	return parts.build();

}

// --- temporary panel bridge ------------------------------------------------------------------

// A single-lane modular panel bridge of the Acrow / Bailey kind, 100 ft between bearings: ten 10 ft
// bays of truss panels, doubled on each side, with transoms across under a steel deck with timber
// curbs and raker braces out to the trusses, on timber crib abutments, and a ramp down at each end.
// Traffic runs along z.
function panelBridge() {

	const parts = new Parts();
	const galv = GALVANISED();
	const bays = 10;
	const bay = 10 * FT;
	const span = bays * bay;
	const half = span / 2;
	const panelH = 7.5 * FT;
	const deckTop = 1.2;
	const chordY = deckTop - 0.55;
	const roadway = 4.2;
	const trusses = [ roadway / 2 + 0.4, roadway / 2 + 0.85 ];

	// The truss panels: chords, posts at the ends and middle, and diagonals in a V.
	const chord = [ 0.2, 0.15 ];
	for ( const s of [ - 1, 1 ] ) {

		for ( const tx of trusses ) {

			const x = s * tx;
			for ( const y of [ chordY + 0.075, chordY + panelH - 0.075 ] ) member( parts, galv, chord, [ x, y, - half ], [ x, y, half ] );
			for ( let i = 0; i < bays; i ++ ) {

				const z0 = - half + i * bay;
				for ( const dz of [ 0.05, bay / 2, bay - 0.05 ] ) member( parts, galv, [ 0.1, 0.1 ], [ x, chordY + 0.15, z0 + dz ], [ x, chordY + panelH - 0.15, z0 + dz ] );
				member( parts, galv, [ 0.08, 0.08 ], [ x, chordY + panelH - 0.15, z0 + 0.1 ], [ x, chordY + 0.15, z0 + bay / 2 ] );
				member( parts, galv, [ 0.08, 0.08 ], [ x, chordY + 0.15, z0 + bay / 2 ], [ x, chordY + panelH - 0.15, z0 + bay - 0.1 ] );

			}

			// End posts with their bearings.
			for ( const e of [ - 1, 1 ] ) {

				member( parts, galv, [ 0.2, 0.2 ], [ x, chordY - 0.15, e * ( half + 0.1 ) ], [ x, chordY + panelH, e * ( half + 0.1 ) ] );
				parts.box( DARK(), [ 0.3, 0.15, 0.4 ], [ x, chordY - 0.15, e * ( half + 0.1 ) ] );

			}

		}

	}

	// Transoms across on the bottom chords at every panel point, with rakers out to the inner truss.
	const transomTop = deckTop - 0.12;
	for ( let i = 0; i <= 2 * bays; i ++ ) {

		const z = - half + i * bay / 2;
		profile( parts, galv, wShape( 0.33, 0.2, 0.012, 0.018 ), [ - trusses[ 1 ] - 0.15, transomTop - 0.165, z ], [ trusses[ 1 ] + 0.15, transomTop - 0.165, z ] );
		if ( i % 2 ) continue;
		for ( const s of [ - 1, 1 ] ) member( parts, galv, [ 0.06, 0.06 ], [ s * ( trusses[ 0 ] - 0.1 ), deckTop + 1.1, z ], [ s * ( roadway / 2 + 0.1 ), deckTop + 0.1, z ] );

	}

	// The deck: steel deck units with a gritted top, timber curbs, all the span long.
	const deck = mat( 0x4a4c4e, { roughness: 0.95, metalness: 0.3 } );
	parts.box( deck, [ trusses[ 0 ] * 2 - 0.25, 0.12, span ], [ 0, transomTop, 0 ] );
	for ( let i = 1; i < 2 * bays; i ++ ) parts.box( DARK(), [ trusses[ 0 ] * 2 - 0.26, 0.004, 0.02 ], [ 0, deckTop, - half + i * bay / 2 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( TIMBER(), [ 0.25, 0.2, span ], [ s * ( roadway / 2 + 0.125 ), deckTop, 0 ] );

	// Crib abutments: 8 × 8 timbers in a log-cabin stack under each end's bearings.
	const t = 8 * IN;
	const layers = Math.round( ( chordY - 0.15 ) / t );
	const lay = ( chordY - 0.15 ) / layers;
	for ( const e of [ - 1, 1 ] ) {

		const zc = e * ( half + 0.1 );
		for ( let i = 0; i < layers; i ++ ) {

			if ( i % 2 ) for ( const dz of [ - 0.6, 0, 0.6 ] ) parts.box( TIMBER(), [ 2 * trusses[ 1 ] + 0.8, lay, t ], [ 0, i * lay, zc + dz ] );
			else for ( const x of [ - trusses[ 1 ], - 1.2, 0, 1.2, trusses[ 1 ] ] ) parts.box( TIMBER(), [ t, lay, 1.6 ], [ x, i * lay, zc ] );

		}

	}

	// Ramps down to the ground at each end, 6 m long with curbs, on cross sleepers.
	const ramp = 6;
	for ( const e of [ - 1, 1 ] ) {

		const z0 = e * ( half + 0.25 );
		const z1 = e * ( half + 0.25 + ramp );
		const slope = Math.atan2( deckTop, ramp );
		const mid = [ 0, deckTop / 2 - 0.06, ( z0 + z1 ) / 2 ];
		const length = Math.hypot( ramp, deckTop );
		parts.block( deck, [ roadway + 0.3, 0.12, length ], mid, [ e * slope, 0, 0 ] );
		for ( const s of [ - 1, 1 ] ) parts.block( TIMBER(), [ 0.25, 0.2, length ], [ s * ( roadway / 2 + 0.125 ), deckTop / 2 + 0.1, ( z0 + z1 ) / 2 ], [ e * slope, 0, 0 ] );
		for ( let k = 0; k < 4; k ++ ) {

			const f = ( k + 0.5 ) / 4;
			const h = deckTop * ( 1 - f ) - 0.12;
			if ( h > 0.05 ) parts.box( TIMBER(), [ roadway + 0.6, h, t ], [ 0, 0, z0 + ( z1 - z0 ) * f ] );

		}

	}

	return parts.build();

}

// --- retaining walls -------------------------------------------------------------------------

// Ten cruciform MSE wall panels (5 × 5 ft, 5.5 in thick, about 1.5 t each) in two stacks of five
// face down on 4 × 4 dunnage, the galvanised tie strips' connection tabs standing up out of their
// backs, and two banded bundles of 16 ft ribbed soil reinforcing strips on timbers in front.
function msePanels() {

	const parts = new Parts();
	const panel = mat( 0xbcb7ac, { roughness: 0.95 } );
	const galv = GALVANISED();
	const side = 5 * FT;
	const thick = 5.5 * IN;
	const dunnage = 4 * IN;
	const n = side / 4;

	// The cruciform outline: a square with a quarter-panel notch out of each corner, half notched.
	const q = n / 2;
	const h = side / 2;
	const outline = [
		[ - h + q, - h ], [ h - q, - h ], [ h - q, - h + q ], [ h, - h + q ], [ h, h - q ], [ h - q, h - q ], [ h - q, h ], [ - h + q, h ],
		[ - h + q, h - q ], [ - h, h - q ], [ - h, - h + q ], [ - h + q, - h + q ],
	];
	const geometry = slab( outline, thick );
	geometry.rotateX( - Math.PI / 2 );

	for ( const x of [ - h - 0.2, h + 0.2 ] ) {

		let y = 0;
		for ( let i = 0; i < 5; i ++ ) {

			for ( const dz of [ - 0.5, 0.5 ] ) parts.box( TIMBER(), [ side - 0.1, dunnage, 0.09 ], [ x, y, 0.4 + dz ] );
			y += dunnage;
			parts.add( panel, geometry.clone(), _m.makeTranslation( x, y, 0.4 ) );
			y += thick;
			// Four connection tabs, two rows of two.
			for ( const dx of [ - 0.45, 0.45 ] ) for ( const dz of [ - 0.25, 0.25 ] ) parts.box( galv, [ 0.05, 0.07, 0.006 ], [ x + dx, y, 0.4 + dz ] );

		}

	}

	geometry.dispose();

	// Two bundles of strips in front, 2 in wide and 16 ft long, banded, on three timbers.
	const strip = 16 * FT;
	const zb = - 1.3;
	for ( const dx of [ - 2.4, 0, 2.4 ] ) parts.box( TIMBER(), [ 0.09, 0.09, 0.9 ], [ dx, 0, zb ] );
	for ( const dz of [ - 0.2, 0.2 ] ) {

		parts.box( galv, [ strip, 0.2, 0.3 ], [ 0, 0.09, zb + dz ] );
		for ( let i = 0; i < 10; i ++ ) parts.box( mat( 0x878b8e, { roughness: 0.5, metalness: 0.6 } ), [ strip + 0.002, 0.004, 0.01 ], [ 0, 0.11 + i * 0.018, zb + dz - 0.151 ] );
		for ( const dx of [ - 1.8, 0, 1.8 ] ) parts.box( DARK(), [ 0.03, 0.205, 0.305 ], [ dx, 0.088, zb + dz ] );

	}

	return parts.build();

}

// A pallet of 24 split-face segmental retaining wall blocks, 18 in wide, 8 in high and 22 in deep
// (about 95 lb each), four layers of six with their rough faces out on the long sides, banded.
function wallBlockPallet() {

	const parts = new Parts();
	const block = mat( 0x9e958a, { roughness: 0.95 } );
	const face = mat( 0x8d8377, { roughness: 1 } );
	const core = mat( 0x4a4642, { roughness: 1 } );
	const [ w, hgt, d ] = [ 18 * IN, 8 * IN, 22 * IN ];
	const palletH = 5 * IN;
	const rand = seeded( 7 );

	// The pallet: deck boards on three runners.
	const [ px, pz ] = [ 3 * w + 0.04, 2 * d + 0.04 ];
	for ( const x of [ - px / 2 + 0.05, 0, px / 2 - 0.05 ] ) parts.box( TIMBER(), [ 0.09, palletH - 0.02, pz ], [ x, 0, 0 ] );
	for ( let i = 0; i < 7; i ++ ) parts.box( TIMBER(), [ px, 0.02, 0.1 ], [ 0, palletH - 0.02, - pz / 2 + 0.05 + i * ( pz - 0.1 ) / 6 ] );

	for ( let layer = 0; layer < 4; layer ++ ) {

		const y = palletH + layer * hgt;
		for ( let i = 0; i < 3; i ++ ) {

			for ( const s of [ - 1, 1 ] ) {

				const x = ( i - 1 ) * w;
				const z = s * d / 2;
				parts.box( block, [ w - 0.006, hgt - 0.004, d - 0.04 ], [ x, y, z - s * 0.02 ] );
				// The split face: a few rough facets standing a little proud.
				for ( let k = 0; k < 4; k ++ ) parts.box( face, [ w / 2 - 0.01, hgt / 2 - 0.005, 0.02 + rand() * 0.025 ], [ x + ( k % 2 - 0.5 ) * w / 2, y + Math.floor( k / 2 ) * hgt / 2, s * ( d - 0.04 ) ] );
				// Cores, seen on the top layer.
				if ( layer === 3 ) for ( const dx of [ - 0.11, 0.11 ] ) parts.box( core, [ 0.13, 0.004, 0.18 ], [ x + dx, y + hgt - 0.004, z - s * 0.04 ] );

			}

		}

	}

	// Two bands round each way.
	const band = mat( 0x1f1f21, { roughness: 0.6 } );
	const top = palletH + 4 * hgt;
	for ( const x of [ - w, w ] ) {

		parts.box( band, [ 0.02, 0.003, pz + 0.006 ], [ x, top, 0 ] );
		for ( const s of [ - 1, 1 ] ) parts.box( band, [ 0.02, top - palletH, 0.003 ], [ x, palletH, s * ( d + 0.002 ) ] );

	}

	return parts.build();

}

// Six gabion baskets, 3 ft square by 6 ft long, in two courses of three making an 18 ft run of
// wall, the top course set back 1 ft: welded wire mesh (3 in squares, with the panel seams heavier)
// over a face of rough stones.
function gabionRun() {

	const parts = new Parts();
	const length = 18 * FT;
	const s = 3 * FT;
	const wire = mat( 0x9fa3a5, { roughness: 0.45, metalness: 0.7 } );
	const fill = mat( 0x6f6a62, { roughness: 1 } );
	const stones = [ mat( 0x8b857b, { roughness: 1 } ), mat( 0x7a756c, { roughness: 1 } ), mat( 0x9c968b, { roughness: 1 } ) ];
	const mesh = gabionMesh();
	const placed = stones.map( () => [] );
	const rand = seeded( 11 );
	// Each course's bottom and the middle of its depth.
	const courses = [ [ 0, 0 ], [ s, 1 * FT ] ];

	for ( const [ y0, zc ] of courses ) {

		// The stone fill behind the mesh, and stones bulging against the visible faces.
		parts.box( fill, [ length - 0.04, s - 0.04, s - 0.04 ], [ 0, y0 + 0.02, zc ] );
		const faces = [
			[ [ 1, 0, 0 ], [ 0, 1, 0 ], [ 0, 0, - 1 ], length, s, [ 0, y0 + s / 2, zc - s / 2 ] ],
			[ [ 1, 0, 0 ], [ 0, 1, 0 ], [ 0, 0, 1 ], length, s, [ 0, y0 + s / 2, zc + s / 2 ] ],
			[ [ 1, 0, 0 ], [ 0, 0, 1 ], [ 0, 1, 0 ], length, s, [ 0, y0 + s, zc ] ],
			[ [ 0, 0, 1 ], [ 0, 1, 0 ], [ - 1, 0, 0 ], s, s, [ - length / 2, y0 + s / 2, zc ] ],
			[ [ 0, 0, 1 ], [ 0, 1, 0 ], [ 1, 0, 0 ], s, s, [ length / 2, y0 + s / 2, zc ] ],
		];
		for ( const [ u, v, n, fu, fv, c ] of faces ) {

			const pitch = 0.2;
			const [ nu, nv ] = [ Math.floor( fu / pitch ), Math.floor( fv / pitch ) ];
			for ( let i = 0; i < nu; i ++ ) {

				for ( let j = 0; j < nv; j ++ ) {

					const a = ( i + 0.5 + ( rand() - 0.5 ) * 0.5 ) / nu - 0.5;
					const b = ( j + 0.5 + ( rand() - 0.5 ) * 0.5 ) / nv - 0.5;
					const r = 0.085 + rand() * 0.04;
					const depth = - r * 0.55;
					const p = [ 0, 1, 2 ].map( k => c[ k ] + u[ k ] * a * fu + v[ k ] * b * fv + n[ k ] * depth );
					_m.makeRotationFromEuler( _e.set( rand() * 3, rand() * 3, rand() * 3 ) );
					_m.scale( _s.set( r * ( 0.9 + rand() * 0.5 ), r * ( 0.7 + rand() * 0.3 ), r ) ).setPosition( ...p );
					placed[ Math.floor( rand() * 3 ) ].push( _m.clone() );

				}

			}

		}

		// The mesh: 3 in squares of wire on the front, back, top and ends (a see-through drawn
		// texture), with heavier wire at the edges and at the diaphragms between baskets.
		for ( const [ u, v, n, fu, fv, c ] of faces ) {

			const plane = new PlaneGeometry( fu, fv );
			const uv = plane.attributes.uv;
			for ( let i = 0; i < uv.count; i ++ ) uv.setXY( i, uv.getX( i ) * fu / MESH, uv.getY( i ) * fv / MESH );
			_m.makeBasis( _a.fromArray( u ), _b.fromArray( v ), _s.fromArray( n ) ).setPosition( ...c.map( ( k, i ) => k + n[ i ] * 0.008 ) );
			parts.add( mesh, plane, _m );

		}

		const top = y0 + s + 0.008;
		for ( let i = 0; i <= 3; i ++ ) {

			const x = - length / 2 + i * length / 3;
			for ( const z of [ zc - s / 2 - 0.008, zc + s / 2 + 0.008 ] ) parts.box( wire, [ 0.012, s, 0.012 ], [ x, y0, z ] );
			parts.box( wire, [ 0.012, 0.012, s ], [ x, top, zc ] );

		}

		for ( const z of [ zc - s / 2 - 0.008, zc + s / 2 + 0.008 ] ) for ( const y of [ y0, top ] ) parts.box( wire, [ length, 0.012, 0.012 ], [ 0, y - 0.006, z ] );

	}

	const rock = new IcosahedronGeometry( 1, 0 );
	stones.forEach( ( stone, i ) => parts.add( stone, scattered( rock, placed[ i ] ) ) );
	rock.dispose();
	return parts.build();

}

// Copies of a (non-indexed) geometry moved by each of `matrices`, as one geometry with flat normals:
// quicker than merging hundreds of stones one by one.
function scattered( geometry, matrices ) {

	const from = geometry.attributes.position;
	const positions = new Float32Array( from.count * 3 * matrices.length );
	const v = new Vector3();
	matrices.forEach( ( matrix, j ) => {

		for ( let i = 0; i < from.count; i ++ ) v.fromBufferAttribute( from, i ).applyMatrix4( matrix ).toArray( positions, ( j * from.count + i ) * 3 );

	} );
	const out = new BufferGeometry();
	out.setAttribute( 'position', new BufferAttribute( positions, 3 ) );
	out.computeVertexNormals();
	return out;

}

// One 3 in square of welded wire, repeated over a gabion's faces.
const MESH = 3 * IN;
function gabionMesh() {

	const material = drawn( 'gabion wire mesh', [ 64, 64 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#a4a8aa';
		ctx.fillRect( 0, 0, w, 4 );
		ctx.fillRect( 0, 0, 4, h );

	}, { side: DoubleSide, roughness: 0.45, metalness: 0.7 } );
	material.map.wrapS = material.map.wrapT = RepeatWrapping;
	return material;

}

// --- roadside safety -------------------------------------------------------------------------

// The W-beam's cross-section in inches, [ z, y ]: two corrugations 12-1/4 in deep with 3-1/4 in
// of depth, the valley bolted to the blockouts, as a 12 gauge sheet. Traffic is on -z.
const W_BEAM = ( () => {

	const line = [ [ - 1.0, 6.12 ], [ - 2.9, 4.7 ], [ - 3.25, 3.1 ], [ - 2.9, 1.6 ], [ - 0.6, 0.6 ], [ 0, 0 ] ];
	const full = [ ...line, ...line.slice( 0, - 1 ).reverse().map( ( [ z, y ] ) => [ z, - y ] ) ];
	const t = 0.11;
	return [ ...full, ...full.slice().reverse().map( ( [ z, y ] ) => [ z + t, y ] ) ].map( ( [ z, y ] ) => [ z * IN, y * IN ] );

} )();

// Guardrail sizes: the rail's top at 31 in on 8 in blockouts, posts every 6 ft 3 in, 12 ft 6 in
// rail panels.
const RAIL_TOP = 31 * IN;
const RAIL_Y = RAIL_TOP - 6.12 * IN;
const POST_SPACING = 75 * IN;
const PANEL = 12.5 * FT;

// 50 ft of strong-post W-beam guardrail facing the front (-Z), the end section of a run: the rail
// on blockouts on W6 × 9 posts, the first panel flared back 10 in toward its leading (left) end,
// the first two posts timber breakaway posts in steel foundation tubes with the anchor cable, and
// an energy-absorbing extruder terminal head on the leading end: a tapered chute the rail feeds
// into, with a striking plate and yellow and black object marker sheeting facing traffic.
function guardrail() {

	const parts = new Parts();
	const length = 50 * FT;
	const x0 = - length / 2;
	const flare = 10 * IN;
	// How far the rail is set back (+z) at x: the flare along the first panel, then straight.
	const back = x => Math.max( 0, 1 - ( x - x0 ) / PANEL ) * flare;
	guardrailRun( parts, x0, length, { back, laps: [ x0 + PANEL, x0 + 2 * PANEL ], first: x0, breakaway: 2 } );

	// The anchor cable from the first post's foot to the rail at the second post.
	const x1 = x0 + POST_SPACING;
	parts.rod( mat( 0x55595c, { roughness: 0.5, metalness: 0.7 } ), [ x0, 0.12, back( x0 ) + 0.1 ], [ x1, RAIL_Y, back( x1 ) + 0.06 ], 0.01, 5 );
	terminalHead( parts, [ x0, RAIL_Y, back( x0 ) - 1.6 * IN ], Math.atan2( flare, PANEL ) );
	return parts.build();

}

// 25 ft of strong-post W-beam guardrail facing the front (-Z), to lay end to end in a run: two
// 12 ft 6 in rail panels lapped and bolted at the posts, four posts, no terminal.
function guardrailRow() {

	const parts = new Parts();
	const length = 25 * FT;
	const x0 = - length / 2;
	const lap = x0 + 0.15;
	guardrailRun( parts, x0, length, { laps: [ lap, lap + PANEL ], first: lap } );
	return parts.build();

}

// The rail, blockouts and posts of a W-beam guardrail from x0 along +x: the rail as panels lapped
// at `laps` (splice bolts at each), posts every 6 ft 3 in from `first`, the first `breakaway`
// of them timber breakaway posts in foundation tubes, and the whole set back by back( x ) (a
// terminal's flare).
function guardrailRun( parts, x0, length, { back = () => 0, laps = [], first = x0, breakaway = 0 } ) {

	const rail = mat( 0xb9bdbf, { roughness: 0.4, metalness: 0.7 } );
	const galv = GALVANISED();
	const wood = mat( 0x7b6145, { roughness: 0.95 } );
	const bolt = BRIGHT();
	const block = 8 * IN;
	const x1 = x0 + length;

	// The rail: straight runs between the points where the set-back changes, and a short lap
	// piece in front at each splice.
	const bends = [ x0, ...laps.filter( x => back( x - 0.01 ) !== back( x ) ), x1 ];
	for ( let i = 1; i < bends.length; i ++ ) railPanel( parts, rail, [ bends[ i - 1 ], back( bends[ i - 1 ] ) ], [ bends[ i ], back( bends[ i ] ) ] );
	for ( const x of laps ) {

		railPanel( parts, rail, [ x - 0.15, back( x - 0.15 ) - 0.004 ], [ x + 0.15, back( x + 0.15 ) - 0.004 ] );
		// Splice bolts through the valley of the lap.
		for ( const dx of [ - 0.1, 0.1 ] ) for ( const dy of [ - 0.012, 0.012 ] ) {

			const z = back( x + dx );
			parts.rod( bolt, [ x + dx, RAIL_Y + dy, z - 0.018 ], [ x + dx, RAIL_Y + dy, z + 0.02 ], 0.009, 6 );

		}

	}

	// Posts and blockouts behind the rail, the back of the rail's valley bolted flat to the
	// blockout's face, the post bolt through the valley.
	for ( let x = first; x <= x1 + 1e-6; x += POST_SPACING ) {

		const i = Math.round( ( x - first ) / POST_SPACING );
		const z = back( x );
		const zb = z + 0.11 * IN;
		parts.box( wood, [ 6 * IN, 14 * IN, block ], [ x, RAIL_Y - 7 * IN, zb + block / 2 ] );
		parts.rod( bolt, [ x, RAIL_Y, z - 0.012 ], [ x, RAIL_Y, z + 0.02 ], 0.012, 6 );
		const zp = zb + block + 3 * IN;
		if ( i < breakaway ) {

			// Breakaway timber posts in steel tubes, the tubes standing 4 in out of the ground.
			parts.box( wood, [ 5.5 * IN, RAIL_TOP + 1 * IN, 7.5 * IN ], [ x, 0, zp + 0.01 ] );
			parts.box( galv, [ 6.5 * IN, 4 * IN, 8.5 * IN ], [ x, 0, zp + 0.01 ] );

		} else {

			profile( parts, galv, W6, [ x, 0, zp ], [ x, RAIL_TOP + 1 * IN, zp ] );

		}

	}

}

// A length of W-beam from [ x, z ] to [ x, z ] (z the back of its valley), the peaks toward -z.
function railPanel( parts, material, [ ax, az ], [ bx, bz ] ) {

	const shape = new Shape( W_BEAM.map( ( [ z, y ] ) => new Vector2( z, y ) ) );
	const length = Math.hypot( bx - ax, bz - az );
	const geometry = new ExtrudeGeometry( shape, { depth: length, bevelEnabled: false } );
	// The shape's x becomes z (peaks toward -z), its extrusion runs along +x from 0.
	geometry.rotateY( - Math.PI / 2 );
	geometry.translate( length, 0, 0 );
	parts.add( material, geometry, _m.makeRotationY( - Math.atan2( bz - az, bx - ax ) ).setPosition( ax, RAIL_Y, az ) );

}

// An extruder terminal head (ET or SKT type) on the leading end of a rail at `end` (the middle of
// the rail's depth), turned `turn` about y with the rail's flare: a chute tapering from the
// striking plate at its leading end down to the rail it feeds onto, feeder channels above and
// below the rail behind it, and object marker sheeting on the striking plate and on the chute's
// traffic side.
function terminalHead( parts, end, turn ) {

	const head = paint( 0x8a8f93 );
	const marker = objectMarker();
	const frame = new Matrix4().makeRotationY( turn ).setPosition( ...end );
	const at = ( x, y, z, angle = 0 ) => _m.makeRotationY( angle ).setPosition( x, y, z ).premultiply( frame );

	// The chute: 0.8 m long, 25 × 16-1/2 in at the striking end tapering to 16-1/2 × 10-1/2 in
	// where the rail comes out; a square frustum turned to lie along x.
	const long = 0.8;
	const [ h, d ] = [ 0.64, 0.42 ];
	const taper = 0.65;
	const chute = new CylinderGeometry( taper, 1, long, 4, 1 );
	chute.rotateY( Math.PI / 4 );
	chute.scale( h / Math.SQRT2, 1, d / Math.SQRT2 );
	chute.rotateZ( - Math.PI / 2 );
	// Flat faces: each side shaded on its own, not rounded off at the corners.
	const flat = chute.toNonIndexed();
	chute.dispose();
	flat.computeVertexNormals();
	const xs = - 0.55;
	parts.add( head, flat, at( xs + long / 2, 0, 0 ) );

	// The striking plate across the leading end, a little bigger than the chute, with the marker.
	parts.add( head, new BoxGeometry( 0.03, h + 0.06, d + 0.05 ), at( xs - 0.015, 0, 0 ) );
	parts.add( marker, new PlaneGeometry( d, h ), at( xs - 0.032, 0, 0, - Math.PI / 2 ) );

	// Sheeting on the chute's traffic side, over its front half, laid on the taper.
	const slope = Math.atan2( d * ( 1 - taper ) / 2, long );
	const fx = xs + long * 0.28;
	const fz = - d / 2 + ( fx - xs ) * Math.tan( slope ) - 0.004;
	parts.add( marker, new PlaneGeometry( long * 0.5, h * 0.8 ), at( fx, 0, fz, Math.PI + slope ) );

	// Feeder channels above and below the rail, behind the chute.
	for ( const y of [ - 0.2, 0.2 ] ) parts.add( head, new BoxGeometry( 1.0, 0.06, d * taper ), at( xs + long + 0.5, y, 0 ) );

}

// Yellow and black diagonal stripes, as on an object marker.
function objectMarker() {

	return drawn( 'object marker stripes', [ 128, 192 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#111111';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#f2c500';
		for ( let i = - 4; i < 8; i += 2 ) {

			ctx.beginPath();
			ctx.moveTo( 0, i * 32 );
			ctx.lineTo( w, i * 32 + w );
			ctx.lineTo( w, ( i + 1 ) * 32 + w );
			ctx.lineTo( 0, ( i + 1 ) * 32 );
			ctx.fill();

		}

	} );

}

// Nine sand-filled plastic barrels (36 in, 200 to 2,100 lb) in rows of 1, 2, 3 and 3 widening back
// from the nose toward the hazard behind them, yellow with black lids, and an object marker on the
// nose barrel facing traffic.
function sandBarrels() {

	const parts = new Parts();
	const yellow = mat( 0xf2c200, { roughness: 0.55 } );
	const lid = mat( 0x1b1c1e, { roughness: 0.7 } );
	const r = 18 * IN;
	const h = 0.82;
	const pitch = 2 * r + 4 * IN;
	const rows = [ 1, 2, 3, 3 ];
	rows.forEach( ( n, j ) => {

		const z = ( j - 1.5 ) * ( 2 * r + 6 * IN );
		for ( let i = 0; i < n; i ++ ) {

			const x = ( i - ( n - 1 ) / 2 ) * pitch;
			parts.cylinder( yellow, r, h, [ x, 0, z ], 24, r * 0.94 );
			parts.cylinder( yellow, r + 0.01, 0.03, [ x, 0.25, z ], 24 );
			parts.cylinder( lid, r * 0.95, 0.06, [ x, h, z ], 24, r * 0.88 );

		}

	} );

	// Object marker (OM-3 type) on the nose barrel, facing traffic.
	const zn = - 1.5 * ( 2 * r + 6 * IN ) - r * 0.97 - 0.01;
	label( parts, objectMarker(), [ 0.3, 0.45 ], [ 0, h / 2 + 0.05, zn ], Math.PI );
	return parts.build();

}

// An overhead sign structure across a highway, 60 ft between the end frames: a four-chord box truss
// of pipe with lacing, on two end frames of twin posts on concrete pedestals, carrying two 16 × 10 ft
// green guide signs on its front face, 18 ft clear over the road.
function overheadSign() {

	const parts = new Parts();
	const galv = GALVANISED();
	const span = 60 * FT;
	const half = span / 2;
	const [ bottom, top ] = [ 6.25, 7.75 ];
	const zc = 0.6;
	const pedestal = 0.6;

	// End frames: twin 12 in posts on pedestals, struts and diagonals between them.
	for ( const s of [ - 1, 1 ] ) {

		const x = s * half;
		for ( const z of [ - zc, zc ] ) {

			parts.cylinder( CONCRETE(), 0.5, pedestal, [ x, 0, z ], 20 );
			parts.box( galv, [ 0.55, 0.04, 0.55 ], [ x, pedestal, z ] );
			parts.cylinder( galv, 0.15, top + 0.2 - pedestal, [ x, pedestal, z ], 16 );
			parts.cylinder( galv, 0.17, 0.02, [ x, top + 0.2, z ], 16 );

		}

		const levels = [ pedestal + 0.5, 2.4, 4.3, bottom, top ];
		for ( let i = 0; i < levels.length; i ++ ) {

			parts.rod( galv, [ x, levels[ i ], - zc ], [ x, levels[ i ], zc ], 0.05, 8 );
			if ( i ) parts.rod( galv, [ x, levels[ i - 1 ], i % 2 ? - zc : zc ], [ x, levels[ i ], i % 2 ? zc : - zc ], 0.04, 8 );

		}

	}

	// The truss: four chords and lacing on all four faces.
	const chords = [ [ bottom, - zc ], [ bottom, zc ], [ top, - zc ], [ top, zc ] ];
	for ( const [ y, z ] of chords ) parts.rod( galv, [ - half, y, z ], [ half, y, z ], 0.07, 10 );
	const panels = 16;
	const step = span / panels;
	for ( let i = 0; i < panels; i ++ ) {

		const [ xa, xb ] = [ - half + i * step, - half + ( i + 1 ) * step ];
		const flip = i % 2;
		for ( const z of [ - zc, zc ] ) parts.rod( galv, [ xa, flip ? top : bottom, z ], [ xb, flip ? bottom : top, z ], 0.035, 6 );
		for ( const y of [ bottom, top ] ) parts.rod( galv, [ xa, y, flip ? zc : - zc ], [ xb, y, flip ? - zc : zc ], 0.035, 6 );
		if ( i ) for ( const z of [ - zc, zc ] ) parts.rod( galv, [ xa, bottom, z ], [ xa, top, z ], 0.03, 6 );

	}

	// The signs on vertical Z-bars in front of the truss: the face toward traffic (-Z), the back
	// bare aluminium with horizontal stiffeners.
	const [ sw, sh ] = [ 16 * FT, 10 * FT ];
	const sy = ( bottom + top ) / 2;
	const zs = - zc - 0.18;
	const signs = [
		[ 4.2, 'green guide sign downtown', [ 'NORTH', 'Downtown', 'LEFT 2 LANES' ] ],
		[ - 4.2, 'green guide sign exit', [ 'EXIT 12', 'Center St', '1/2 MILE' ] ],
	];
	const back = mat( 0xb4b8bb, { roughness: 0.45, metalness: 0.5 } );
	for ( const [ x, key, [ small, big, foot ] ] of signs ) {

		const face = drawn( key, [ 640, 400 ], ( ctx, w, hh ) => {

			ctx.fillStyle = '#ffffff';
			roundRect( ctx, 0, 0, w, hh, 28 );
			ctx.fillStyle = '#00703c';
			roundRect( ctx, 8, 8, w - 16, hh - 16, 22 );
			ctx.fillStyle = '#ffffff';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.font = 'bold 56px sans-serif';
			ctx.fillText( small, w / 2, 80 );
			ctx.font = 'bold 120px sans-serif';
			ctx.fillText( big, w / 2, hh / 2 + 10, w * 0.88 );
			ctx.font = 'bold 52px sans-serif';
			ctx.fillText( foot, w / 2, hh - 72 );

		} );
		label( parts, face, [ sw, sh ], [ x, sy, zs - 0.006 ], Math.PI );
		parts.box( back, [ sw, sh, 0.004 ], [ x, sy - sh / 2, zs - 0.002 ] );
		for ( const dy of [ - 1.1, 0, 1.1 ] ) parts.box( back, [ sw - 0.1, 0.08, 0.05 ], [ x, sy + dy, zs + 0.025 ] );
		for ( const dx of [ - 1.6, 0, 1.6 ] ) member( parts, galv, [ 0.08, 0.12 ], [ x + dx, sy - sh / 2 + 0.1, zs + 0.1 ], [ x + dx, sy + sh / 2 - 0.1, zs + 0.1 ] );

	}

	return parts.build();

}

function roundRect( ctx, x, y, w, h, r ) {

	ctx.beginPath();
	ctx.moveTo( x + r, y );
	ctx.arcTo( x + w, y, x + w, y + h, r );
	ctx.arcTo( x + w, y + h, x, y + h, r );
	ctx.arcTo( x, y + h, x, y, r );
	ctx.arcTo( x, y, x + w, y, r );
	ctx.closePath();
	ctx.fill();

}
