import { DoubleSide, Matrix4, PlaneGeometry } from 'three';
import { drawn, FT, IN, mat, Parts } from './parts.js';

// Site safety, edge protection and security, built in code at real North American sizes: slab
// edge guardrails, a plastic pedestrian barrier, a catch net fan, a hole cover, fall arrest
// anchors and a horizontal lifeline; a surveillance tower trailer, a turnstile, a barrier arm,
// a card reader and wheel stops; safety signs, a wind sock and a weather station. Like the other
// built-in pieces each stands on y = 0 with its front facing -Z (for edge protection, the front
// is the drop).

const _m = new Matrix4();
const _r = new Matrix4();

const GALV = () => mat( 0xa9adb0, { roughness: 0.45, metalness: 0.65 } );
const YELLOW = () => mat( 0xf2c200, { roughness: 0.5, metalness: 0.2 } );
const BLACK = () => mat( 0x1d1f21, { roughness: 0.7 } );
const LUMBER = () => mat( 0xc8a46e, { roughness: 0.9 } );
const ORANGE = () => mat( 0xf26b1d, { roughness: 0.55 } );

export const SAFETY_ITEMS = [
	// Edge protection. A row of each (rows.js) shares the post at every joint.
	{ id: 'guardrail-mesh-8ft', name: 'Perimeter guardrail, steel mesh panel on slab-edge posts (8 ft, 42 in)', category: 'Barriers & fencing',
		keywords: 'edge protection guardrail guard rail slab edge mesh panel barrier fall protection perimeter toe board kick plate leading edge',
		build: meshGuardrail, rowLength: 8 * FT },
	{ id: 'guardrail-wood-8ft', name: 'Guardrail, wood 2×4 (8 ft: top rail, mid rail, toe board on posts)', category: 'Barriers & fencing',
		keywords: 'edge protection guardrail guard rail wood lumber 2x4 two by four top rail mid rail toe board kick board slab edge fall protection',
		build: woodGuardrail, rowLength: 8 * FT },
	{ id: 'barrier-plastic-2m', name: 'Pedestrian barrier, interlocking plastic, orange (2 m / 6.5 ft, 1 m high)', category: 'Barriers & fencing',
		keywords: 'plastic barrier barricade orange pedestrian excavation edge trench hole interlocking panel safety barrier crowd',
		build: plasticBarrier, rowLength: 2 },
	{ id: 'safety-net-fan-30ft', name: 'Safety net fan, catch net on outriggers at slab edge (30 ft wide, 10 ft out)', category: 'Access & scaffolding',
		keywords: 'safety net catch net debris net fan outrigger slab edge fall protection perimeter net',
		build: safetyNetFan, rowLength: 30 * FT },
	{ id: 'hole-cover-4x4', name: 'Hole cover, plywood marked HOLE (4 × 4 ft, ¾ in)', category: 'Access & scaffolding',
		keywords: 'hole cover plywood floor opening slab penetration cover marked fall protection',
		build: holeCover },
	// Fall protection.
	{ id: 'fall-arrest-davit-counterweight', name: 'Portable fall arrest anchor, davit on counterweight base (4 × 4 ft base, 7.5 ft)', category: 'Access & scaffolding',
		keywords: 'fall arrest anchor davit counterweight portable roof anchor tie off srl self retracting lifeline yo-yo fall protection',
		build: davitAnchor },
	{ id: 'lifeline-stanchions-30ft', name: 'Horizontal lifeline on stanchions (30 ft span, 5 ft posts)', category: 'Access & scaffolding',
		keywords: 'horizontal lifeline hll tie off cable wire rope stanchion fall protection leading edge',
		build: lifeline, rowLength: 30 * FT },
	// Security.
	{ id: 'cctv-tower-trailer', name: 'Surveillance tower trailer, solar (CCTV cameras, 20 ft mast up)', category: 'Site services',
		keywords: 'cctv camera surveillance security tower trailer solar mast remote monitoring liveview theft',
		build: cctvTrailer },
	{ id: 'turnstile-full-height', name: 'Full-height turnstile, single with card reader (7.5 ft)', category: 'Barriers & fencing',
		keywords: 'turnstile access control gate card reader security entrance pedestrian badge swipe rotor',
		build: turnstile },
	{ id: 'barrier-arm-12ft', name: 'Vehicle barrier arm gate on pedestal (12 ft arm)', category: 'Barriers & fencing',
		keywords: 'barrier arm boom gate parking gate access control vehicle gate arm security',
		build: barrierArm },
	{ id: 'card-reader-pedestal', name: 'Card reader on gooseneck pedestal (42 in, drive-up)', category: 'Barriers & fencing',
		keywords: 'card reader gooseneck pedestal access control keypad badge gate post intercom',
		build: cardReader },
	{ id: 'wheel-stop-6ft', name: 'Wheel stop / parking curb, precast concrete (6 ft)', category: 'Traffic control',
		keywords: 'wheel stop parking curb bumper block car stop parking block',
		build: wheelStop },
	// Signs and site monitoring.
	{ id: 'sign-a-frame-caution', name: 'A-frame sidewalk sign, CAUTION CONSTRUCTION (24 × 36 in)', category: 'Site services',
		keywords: 'a-frame sandwich board sidewalk sign caution construction pedestrian',
		build: aFrameSign },
	{ id: 'sign-ppe-required', name: 'PPE required sign board (48 × 36 in on posts)', category: 'Site services',
		keywords: 'ppe sign hard hat vest boots safety glasses mandatory sign entrance',
		build: () => metalSign( ppeFace(), [ 48 * IN, 36 * IN ], 3 * FT, 2 ) },
	{ id: 'site-rules-board', name: 'Site rules board, plywood (4 × 4 ft on posts)', category: 'Site services',
		keywords: 'site rules board sign safety rules plywood notice board entrance orientation',
		build: rulesBoard },
	{ id: 'sign-emergency-contacts', name: 'Emergency contact board (24 × 36 in on post)', category: 'Site services',
		keywords: 'emergency contacts sign phone numbers 911 first aid hospital board',
		build: () => metalSign( emergencyFace(), [ 24 * IN, 36 * IN ], 4 * FT, 1 ) },
	{ id: 'sign-crane-radius', name: 'Crane swing radius DANGER sign, portable (24 × 18 in)', category: 'Site services',
		keywords: 'crane danger sign swing radius overhead load stay clear barricade sign',
		build: () => metalSign( craneFace(), [ 24 * IN, 18 * IN ], 3 * FT, 1, [ 24 * IN, 3 * IN ] ) },
	{ id: 'wind-sock-pole', name: 'Wind sock on pole (18 in × 8 ft sock, 20 ft pole)', category: 'Site services',
		keywords: 'wind sock windsock wind direction crane site pole weather',
		build: windSock },
	{ id: 'weather-station-tripod', name: 'Weather station on tripod (10 ft mast, anemometer, solar)', category: 'Site services',
		keywords: 'weather station anemometer wind speed crane wind monitoring tripod solar logger',
		build: weatherStation },
];

// A plane of [ w, h ] standing at `centre`, its face to the front (-Z) unless turned.
function face( parts, material, [ w, h ], centre, turn = Math.PI ) {

	parts.add( material, new PlaneGeometry( w, h ), _m.makeRotationY( turn ).setPosition( ...centre ) );

}

// --- edge protection -------------------------------------------------------------------------

// An 8 ft yellow steel mesh panel (2 × 4 in mesh with a 6 in solid kick plate, 46 in tall, so
// the top is above the 42 in minimum) hung on the outside of square posts bolted to the slab
// through base plates. The posts stand on the ends, so a row shares one at each joint.
function meshGuardrail() {

	const parts = new Parts();
	const yellow = YELLOW();
	const galv = GALV();
	const length = 8 * FT;
	const height = 46 * IN;
	const post = 2 * IN;
	const z = - post / 2 - 0.02;

	for ( const x of [ - length / 2, length / 2 ] ) {

		parts.box( galv, [ 8 * IN, 0.375 * IN, 8 * IN ], [ x, 0, 0 ] );
		parts.box( yellow, [ post, 48 * IN, post ], [ x, 0, 0 ] );
		for ( const [ dx, dz ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ] ) parts.cylinder( galv, 0.012, 0.025, [ x + dx * 3 * IN, 0.009, dz * 3 * IN ], 6 );
		// The hooks the panels hang on.
		for ( const y of [ 0.25, height - 0.08 ] ) parts.box( galv, [ 3 * IN, 0.06, 0.04 ], [ x, y, - post / 2 - 0.01 ] );

	}

	// The panel: a tube frame just short of the posts' centres, the mesh, and the kick plate.
	const w = length - 0.05;
	const tube = 1 * IN;
	parts.box( yellow, [ w, tube, tube ], [ 0, 0.02, z ] );
	parts.box( yellow, [ w, tube, tube ], [ 0, height - tube, z ] );
	for ( const x of [ - w / 2 + tube / 2, w / 2 - tube / 2 ] ) parts.box( yellow, [ tube, height - 0.02, tube ], [ x, 0.02, z ] );
	parts.box( yellow, [ w - 2 * tube, 6 * IN, 0.003 ], [ 0, 0.02 + tube, z ] );
	const wire = 0.005;
	const meshBottom = 0.02 + tube + 6 * IN;
	const meshTop = height - tube;
	const across = Math.round( ( w - 2 * tube ) / ( 2 * IN * 2 ) );
	for ( let i = 1; i < across; i ++ ) parts.box( yellow, [ wire, meshTop - meshBottom, wire ], [ - w / 2 + tube + i * ( w - 2 * tube ) / across, meshBottom, z ] );
	const rows = Math.round( ( meshTop - meshBottom ) / ( 4 * IN ) );
	for ( let i = 0; i < rows; i ++ ) parts.box( yellow, [ w - 2 * tube, wire, wire ], [ 0, meshBottom + i * ( meshTop - meshBottom ) / rows, z ] );

	return parts.build();

}

// Built on site from 2×4s: 4×4 posts every 8 ft in steel base brackets, each braced back to a
// block, with the top rail at 42 in, the mid rail at 21 in and a 2×4 toe board on edge, all
// nailed to the outside of the posts.
function woodGuardrail() {

	const parts = new Parts();
	const wood = LUMBER();
	const galv = GALV();
	const length = 8 * FT;
	const post = 3.5 * IN;
	const thick = 1.5 * IN;
	const z = - post / 2 - thick / 2;

	for ( const x of [ - length / 2, length / 2 ] ) {

		parts.box( galv, [ 5 * IN, 4 * IN, 5 * IN ], [ x, 0, 0 ] );
		parts.box( galv, [ 8 * IN, 0.25 * IN, 8 * IN ], [ x, 0, 0 ] );
		parts.box( wood, [ post, 42 * IN, post ], [ x, 0, 0 ] );
		// A 2×4 kicker from high on the post back to a block nailed to the slab.
		parts.rod( wood, [ x, 30 * IN, post / 2 ], [ x, 0.03, post / 2 + 0.6 ], 0.9 * IN, 4 );
		parts.box( wood, [ 3.5 * IN, thick, 12 * IN ], [ x, 0, post / 2 + 0.6 ] );

	}

	parts.box( wood, [ length, 3.5 * IN, thick ], [ 0, 42 * IN - 3.5 * IN, z ] );
	parts.box( wood, [ length, 3.5 * IN, thick ], [ 0, 21 * IN - 1.75 * IN, z ] );
	parts.box( wood, [ length, 3.5 * IN, thick ], [ 0, 0, z ] );

	return parts.build();

}

// A 2 m interlocking plastic barrier of the kind that fences off an excavation or a hole: an
// orange blow-moulded panel 1 m high with slotted infill, a white reflective strip on the top
// rail, two feet, and the pin and socket that join one to the next.
function plasticBarrier() {

	const parts = new Parts();
	const orange = ORANGE();
	const white = mat( 0xf2f2ee, { roughness: 0.35 } );
	const length = 2;
	const height = 1;
	const depth = 0.06;

	const post = 0.08;
	for ( const x of [ - length / 2 + post / 2, length / 2 - post / 2 ] ) parts.box( orange, [ post, height - 0.02, depth ], [ x, 0.02, 0 ] );
	parts.box( orange, [ length, 0.12, depth ], [ 0, height - 0.12, 0 ] );
	parts.box( orange, [ length - 2 * post, 0.1, depth ], [ 0, 0.15, 0 ] );
	parts.box( orange, [ length - 2 * post, 0.08, depth * 0.8 ], [ 0, 0.53, 0 ] );
	parts.box( white, [ length - 0.3, 0.06, 0.004 ], [ 0, height - 0.09, - depth / 2 - 0.002 ] );
	parts.box( white, [ length - 0.3, 0.06, 0.004 ], [ 0, height - 0.09, depth / 2 - 0.002 ] );

	// The slotted infill: upright bars in the two bays.
	const inner = length - 2 * post;
	for ( const [ y0, y1 ] of [ [ 0.25, 0.53 ], [ 0.61, height - 0.12 ] ] ) {

		for ( let i = 1; i < 12; i ++ ) parts.box( orange, [ 0.035, y1 - y0, depth * 0.6 ], [ - inner / 2 + i * inner / 12, y0, 0 ] );

	}

	// Feet across the panel, and the joining pin on the right end and socket on the left.
	for ( const x of [ - length / 2 + 0.25, length / 2 - 0.25 ] ) parts.box( orange, [ 0.12, 0.06, 0.6 ], [ x, 0, 0 ] );
	parts.box( orange, [ 0.12, 0.02, depth ], [ - length / 2 + 0.25, 0.06, 0 ] );
	parts.cylinder( orange, 0.025, 0.12, [ length / 2 - 0.005, height - 0.3, 0 ], 10 );
	parts.box( orange, [ 0.05, 0.12, 0.05 ], [ - length / 2 + 0.02, height - 0.42, 0 ] );

	return parts.build();

}

// A catch net cantilevered out from a slab edge (at z = 0): HSS outrigger arms every 10 ft
// bolted down on the slab and rising 15° to 10 ft beyond the edge, each held by a wire stay
// from a short post at the edge, and a black rope net with a 12 in mesh on a border rope.
function safetyNetFan() {

	const parts = new Parts();
	const steel = YELLOW();
	const galv = GALV();
	const rope = mat( 0x242628, { roughness: 0.9 } );
	const width = 30 * FT;
	const reach = 10 * FT;
	const rise = Math.tan( 15 * Math.PI / 180 ) * reach;
	const base = 0.1;
	const tail = 1.5;
	const arms = [ - 1.5, - 0.5, 0.5, 1.5 ].map( i => i * 10 * FT );

	for ( const x of arms ) {

		parts.box( steel, [ 0.1, 0.1, tail ], [ x, 0, tail / 2 ] );
		for ( const z of [ 0.1, tail - 0.1 ] ) parts.box( galv, [ 0.3, 0.012, 0.25 ], [ x, 0, z ] );
		parts.rod( steel, [ x, base, 0 ], [ x, base + rise, - reach ], 0.05, 4 );
		parts.box( steel, [ 0.08, 1.4, 0.08 ], [ x, 0, 0.2 ] );
		parts.rod( galv, [ x, 1.38, 0.2 ], [ x, base + rise + 0.03, - reach + 0.05 ], 0.006, 4 );

	}

	// The net: lines along the arms every foot and across them every foot, on the arms' plane.
	const at = ( x, t ) => [ x, base + 0.06 + rise * t, - reach * t ];
	parts.path( rope, [ at( - width / 2, 0 ), at( width / 2, 0 ), at( width / 2, 1 ), at( - width / 2, 1 ), at( - width / 2, 0 ) ], 0.012, 4 );
	const along = Math.round( width / FT );
	for ( let i = 1; i < along; i ++ ) {

		const x = - width / 2 + i * width / along;
		parts.rod( rope, at( x, 0 ), at( x, 1 ), 0.004, 3 );

	}

	const out = Math.round( reach / FT );
	for ( let i = 1; i < out; i ++ ) parts.rod( rope, at( - width / 2, i / out ), at( width / 2, i / out ), 0.004, 3 );

	return parts.build();

}

// A 4 × 4 ft sheet of ¾ in plywood over a floor opening, painted and stencilled HOLE as the
// rules ask (the cleats underneath that stop it sliding sit down in the hole).
function holeCover() {

	const parts = new Parts();
	const side = 4 * FT;
	const thick = 0.75 * IN;
	parts.box( mat( 0xc9ab7c, { roughness: 0.9 } ), [ side, thick, side ], [ 0, 0, 0 ] );
	// Face up, read from the front.
	_r.makeRotationX( - Math.PI / 2 );
	parts.add( holeFace(), new PlaneGeometry( side, side ), _m.makeRotationY( Math.PI ).multiply( _r ).setPosition( 0, thick + 0.002, 0 ) );
	return parts.build();

}

function holeFace() {

	return drawn( 'safety hole cover', [ 512, 512 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#c9ab7c';
		ctx.fillRect( 0, 0, w, h );
		// Plywood grain.
		ctx.strokeStyle = 'rgba( 120, 90, 50, 0.25 )';
		ctx.lineWidth = 2;
		for ( let y = 6; y < h; y += 11 ) {

			ctx.beginPath();
			ctx.moveTo( 0, y );
			ctx.bezierCurveTo( w * 0.3, y + 6, w * 0.6, y - 6, w, y + 3 );
			ctx.stroke();

		}

		ctx.strokeStyle = '#ff6a13';
		ctx.lineWidth = 36;
		ctx.strokeRect( 18, 18, w - 36, h - 36 );
		ctx.fillStyle = '#111111';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = 'bold 150px sans-serif';
		ctx.fillText( 'HOLE', w / 2, h / 2 - 30 );
		ctx.font = 'bold 44px sans-serif';
		ctx.fillText( 'DO NOT REMOVE', w / 2, h / 2 + 90 );

	} );

}

// --- fall protection -------------------------------------------------------------------------

// A portable rooftop davit for work at an edge: a 4 × 4 ft yellow steel base weighed down with
// eight 50 lb plates, transport wheels at the back, a mast and a 3 ft arm reaching out over the
// edge (to the front), and a self-retracting lifeline hanging from its tip.
function davitAnchor() {

	const parts = new Parts();
	const yellow = YELLOW();
	const galv = GALV();
	const black = BLACK();
	const plate = mat( 0x55595d, { roughness: 0.6, metalness: 0.4 } );
	const side = 4 * FT;
	const rail = 0.1;

	// The base: a square of channel with a cross, the plates stacked on pins at the corners.
	for ( const s of [ - 1, 1 ] ) {

		parts.box( yellow, [ side, rail, rail ], [ 0, 0, s * ( side - rail ) / 2 ] );
		parts.box( yellow, [ rail, rail, side ], [ s * ( side - rail ) / 2, 0, 0 ] );

	}

	parts.box( yellow, [ side, rail, rail ], [ 0, 0, 0 ] );
	parts.box( yellow, [ rail, rail, side ], [ 0, 0, 0 ] );
	for ( const [ sx, sz ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ] ) {

		const x = sx * ( side / 2 - 0.25 );
		const z = sz * ( side / 2 - 0.25 );
		for ( let i = 0; i < 2; i ++ ) parts.box( plate, [ 0.4, 0.06, 0.3 ], [ x, rail + i * 0.062, z ] );
		parts.cylinder( galv, 0.015, 0.25, [ x, rail, z ], 8 );

	}

	// Wheels and a handle at the back for rolling it to the next spot.
	for ( const s of [ - 1, 1 ] ) {

		parts.rod( black, [ s * ( side / 2 + 0.01 ), 0.1, side / 2 - 0.05 ], [ s * ( side / 2 + 0.07 ), 0.1, side / 2 - 0.05 ], 0.1, 12 );
		parts.rod( yellow, [ s * 0.25, rail, side / 2 - rail / 2 ], [ s * 0.25, 0.9, side / 2 + 0.25 ], 0.016, 6 );

	}

	parts.rod( yellow, [ - 0.25, 0.9, side / 2 + 0.25 ], [ 0.25, 0.9, side / 2 + 0.25 ], 0.016, 6 );

	// Mast in a socket at the centre, the arm out to the front, and a brace under it.
	const top = 7.5 * FT - 0.05;
	const reach = 3 * FT + side / 2;
	parts.box( yellow, [ 0.14, 0.3, 0.14 ], [ 0, rail, 0 ] );
	parts.box( yellow, [ 3 * IN, top - rail, 3 * IN ], [ 0, rail, 0 ] );
	parts.box( yellow, [ 3 * IN, 3 * IN, reach ], [ 0, top - 3 * IN, - reach / 2 + 0.04 ] );
	parts.rod( yellow, [ 0, top - 0.7, 0 ], [ 0, top - 0.04, - 0.7 ], 0.025, 6 );
	parts.cylinder( galv, 0.03, 0.05, [ 0, top, - reach + 0.06 ], 8 );

	// The self-retracting lifeline: its housing under the tip and the cable down to the snap hook.
	const tip = - reach + 0.08;
	parts.box( galv, [ 0.02, 0.06, 0.04 ], [ 0, top - 3 * IN - 0.06, tip ] );
	parts.box( mat( 0xc8102e, { roughness: 0.5 } ), [ 0.12, 0.26, 0.22 ], [ 0, top - 3 * IN - 0.32, tip ] );
	parts.rod( galv, [ 0, top - 3 * IN - 0.32, tip ], [ 0, 1.1, tip ], 0.003, 4 );
	parts.box( galv, [ 0.02, 0.1, 0.05 ], [ 0, 1.0, tip ] );

	return parts.build();

}

// A temporary horizontal lifeline: a ½ in wire rope between two 5 ft stanchions clamped to the
// deck 30 ft apart, with an energy absorber and a turnbuckle at one end. A row of them shares a
// stanchion at each joint.
function lifeline() {

	const parts = new Parts();
	const yellow = YELLOW();
	const galv = GALV();
	const span = 30 * FT;
	const height = 5 * FT;
	const eye = height - 0.06;

	for ( const x of [ - span / 2, span / 2 ] ) {

		parts.box( galv, [ 0.3, 0.02, 0.3 ], [ x, 0, 0 ] );
		parts.box( yellow, [ 0.12, 0.1, 0.12 ], [ x, 0.02, 0 ] );
		parts.box( yellow, [ 2.5 * IN, height - 0.02, 2.5 * IN ], [ x, 0.02, 0 ] );
		parts.rod( galv, [ x, eye, - 0.04 ], [ x, eye, 0.04 ], 0.025, 8 );

	}

	// The rope, sagging a few inches at mid span, from the absorber's end to the far stanchion.
	const start = - span / 2 + 0.65;
	const points = [];
	for ( let i = 0; i <= 8; i ++ ) {

		const x = start + ( span / 2 - start ) * i / 8;
		const t = ( x - start ) / ( span / 2 - start );
		points.push( [ x, eye - 0.12 * 4 * t * ( 1 - t ), 0 ] );

	}

	parts.path( galv, points, 0.0064, 6, false );
	parts.rod( mat( 0xc8102e, { roughness: 0.6 } ), [ - span / 2 + 0.05, eye, 0 ], [ - span / 2 + 0.4, eye, 0 ], 0.03, 8 );
	parts.rod( galv, [ - span / 2 + 0.4, eye, 0 ], [ - span / 2 + 0.65, eye, 0 ], 0.012, 6 );
	return parts.build();

}

// --- security --------------------------------------------------------------------------------

// A solar surveillance tower of the kind rented to watch a site at night: a single-axle trailer
// (tongue to the back) on four levelling jacks, a battery cabinet, two tilted solar panels, and
// a mast run up to 20 ft with a PTZ dome, two fixed cameras, a strobe and a speaker.
function cctvTrailer() {

	const parts = new Parts();
	const white = mat( 0xe8e8e4, { roughness: 0.5, metalness: 0.2 } );
	const galv = GALV();
	const black = BLACK();
	const tyre = mat( 0x161718, { roughness: 0.9 } );
	const solar = mat( 0x1c2a4a, { roughness: 0.2, metalness: 0.5 } );
	const lens = mat( 0x0c0d0f, { roughness: 0.1, metalness: 0.5 } );
	const amber = mat( 0xffa020, { roughness: 0.3, emissive: 0xc76a00, emissiveIntensity: 0.5 } );

	const deck = [ 1.6, 0.1, 2.4 ];
	const deckY = 0.5;
	parts.box( galv, deck, [ 0, deckY, 0 ] );
	parts.path( galv, [ [ - 0.5, deckY + 0.05, 1.2 ], [ 0, deckY + 0.05, 2.5 ], [ 0.5, deckY + 0.05, 1.2 ] ], 0.04, 6 );
	parts.cylinder( galv, 0.04, 0.12, [ 0, deckY - 0.02, 2.5 ], 8 );
	parts.cylinder( black, 0.025, deckY - 0.05, [ 0, 0.05, 2.25 ], 8 );
	parts.box( black, [ 0.12, 0.05, 0.12 ], [ 0, 0, 2.25 ] );

	// Axle and wheels, with fenders.
	for ( const s of [ - 1, 1 ] ) {

		parts.rod( tyre, [ s * 0.83, 0.3, 0 ], [ s * 1.02, 0.3, 0 ], 0.3, 16 );
		parts.box( white, [ 0.24, 0.03, 0.75 ], [ s * 0.92, 0.63, 0 ] );

	}

	parts.rod( galv, [ - 0.85, 0.3, 0 ], [ 0.85, 0.3, 0 ], 0.04, 8 );

	// Levelling jacks at the corners, down on pads.
	for ( const [ sx, sz ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ] ) {

		parts.box( galv, [ 0.07, deckY, 0.07 ], [ sx * 0.75, 0.04, sz * 1.1 ] );
		parts.box( black, [ 0.2, 0.04, 0.2 ], [ sx * 0.75, 0, sz * 1.1 ] );

	}

	// Battery and recorder cabinet, and the panel frame over it.
	const cabTop = deckY + 0.1 + 0.95;
	parts.box( white, [ 1.3, 0.95, 1.4 ], [ 0, deckY + 0.1, 0.35 ] );
	for ( const x of [ - 0.6, 0.6 ] ) parts.box( galv, [ 0.05, 0.6, 0.05 ], [ x, cabTop, 0.45 ] );
	const tilt = 15 * Math.PI / 180;
	for ( const x of [ - 0.52, 0.52 ] ) {

		parts.block( galv, [ 1.02, 0.04, 1.7 ], [ x, cabTop + 0.62, 0.45 ], [ - tilt, 0, 0 ] );
		parts.block( solar, [ 0.98, 0.02, 1.65 ], [ x, cabTop + 0.65, 0.45 ], [ - tilt, 0, 0 ] );

	}

	// The mast at the front of the cabinet, its sections narrowing, up to 20 ft.
	const mastZ = - 0.55;
	const top = 20 * FT;
	parts.box( white, [ 0.2, cabTop - deckY - 0.1 + 0.1, 0.2 ], [ 0, deckY + 0.1, mastZ ] );
	const sections = [ [ 0.15, cabTop, 2.6 ], [ 0.11, 2.6, 4.3 ], [ 0.08, 4.3, top - 0.25 ] ];
	for ( const [ w, y0, y1 ] of sections ) parts.box( galv, [ w, y1 - y0, w ], [ 0, y0, mastZ ] );

	// The camera head: a bar with a fixed camera at each end, the dome under it, strobe and speaker.
	const headY = top - 0.25;
	parts.box( white, [ 0.9, 0.08, 0.12 ], [ 0, headY, mastZ ] );
	for ( const s of [ - 1, 1 ] ) {

		const x = s * 0.4;
		parts.block( white, [ 0.11, 0.1, 0.3 ], [ x, headY + 0.13, mastZ - 0.08 ], [ 0, s * 0.35, 0 ] );
		parts.block( lens, [ 0.07, 0.06, 0.01 ], [ x - s * 0.05, headY + 0.13, mastZ - 0.235 ], [ 0, s * 0.35, 0 ] );
		parts.box( white, [ 0.03, 0.05, 0.03 ], [ x, headY + 0.07, mastZ - 0.05 ] );

	}

	parts.cylinder( white, 0.11, 0.08, [ 0, headY - 0.08, mastZ ], 16 );
	parts.sphere( lens, 0.1, [ 0, headY - 0.08, mastZ ], [ 16, 8 ], [ 1, 0.9, 1 ] );
	parts.cylinder( amber, 0.05, 0.1, [ 0, headY + 0.08, mastZ ], 12 );
	parts.box( black, [ 0.16, 0.16, 0.08 ], [ 0, headY - 0.3, mastZ - 0.11 ] );

	return parts.build();

}

// A single full-height turnstile, 7.5 ft tall: a three-wing rotor of horizontal bars under a
// canopy, a curved cage on the left that people walk round, a comb of fingers on the right
// meshing with the rotor, and a card reader post at the way in (to the front).
function turnstile() {

	const parts = new Parts();
	const galv = GALV();
	const black = BLACK();
	const height = 7.5 * FT;
	const roof = 0.12;
	const rotorX = 0.12;
	const bar = 0.6;
	const levels = 14;
	const levelY = i => 0.15 + i * ( height - roof - 0.35 ) / ( levels - 1 );

	// Canopy, and the base plate under the rotor.
	parts.box( galv, [ 1.45, roof, 1.45 ], [ 0, height - roof, 0 ] );
	parts.box( galv, [ 0.3, 0.02, 0.3 ], [ rotorX, 0, 0 ] );

	// The rotor: a post with three wings of bars at 120°.
	parts.cylinder( galv, 0.05, height - roof, [ rotorX, 0, 0 ], 12 );
	for ( let k = 0; k < 3; k ++ ) {

		const a = Math.PI + k * 2 * Math.PI / 3;
		const [ dx, dz ] = [ Math.cos( a ), Math.sin( a ) ];
		for ( let i = 0; i < levels; i ++ ) {

			const y = levelY( i );
			parts.rod( galv, [ rotorX, y, 0 ], [ rotorX + dx * bar, y, dz * bar ], 0.016, 6 );

		}

		parts.rod( galv, [ rotorX + dx * bar, levelY( 0 ), dz * bar ], [ rotorX + dx * bar, levelY( levels - 1 ), dz * bar ], 0.016, 6 );

	}

	// The cage on the left: uprights on an arc round the rotor, tied by rails at top and bottom.
	const r = bar + 0.1;
	const arc = [];
	for ( let i = 0; i <= 6; i ++ ) {

		const a = Math.PI * ( 0.72 + 0.56 * i / 6 );
		arc.push( [ rotorX + Math.cos( a ) * r, Math.sin( a ) * r ] );

	}

	for ( const [ x, z ] of arc ) parts.cylinder( galv, 0.025, height - roof, [ x, 0, z ], 8 );
	for ( const y of [ 0.1, 1.1, height - roof - 0.05 ] ) parts.path( galv, arc.map( ( [ x, z ] ) => [ x, y, z ] ), 0.02, 6, false );

	// The comb on the right: a post with fingers between the rotor's bars.
	const combX = rotorX + r;
	parts.box( galv, [ 0.1, height - roof, 0.1 ], [ combX, 0, 0 ] );
	for ( let i = 0; i < levels - 1; i ++ ) {

		const y = ( levelY( i ) + levelY( i + 1 ) ) / 2;
		parts.rod( galv, [ combX, y, 0 ], [ rotorX + 0.09, y, 0 ], 0.016, 6 );

	}

	// The card reader on its post by the way in, at the front left.
	const reader = [ - 0.6, - 0.68 ];
	parts.box( galv, [ 0.08, 1.05, 0.08 ], [ reader[ 0 ], 0, reader[ 1 ] ] );
	parts.box( black, [ 0.1, 0.15, 0.04 ], [ reader[ 0 ], 1.0, reader[ 1 ] - 0.06 ] );
	parts.box( mat( 0x2fd16a, { roughness: 0.3, emissive: 0x1a8c40, emissiveIntensity: 0.6 } ), [ 0.02, 0.01, 0.005 ], [ reader[ 0 ], 1.12, reader[ 1 ] - 0.082 ] );

	return parts.build();

}

// A parking-style barrier gate: a 1 m cabinet on the right (the driver's side) and a 12 ft
// aluminium arm across the lane to a fork rest on the left, red and white with reflectors.
function barrierArm() {

	const parts = new Parts();
	const cabinet = mat( 0xd9a400, { roughness: 0.5, metalness: 0.3 } );
	const galv = GALV();
	const red = mat( 0xc8102e, { roughness: 0.45 } );
	const white = mat( 0xf2f2ee, { roughness: 0.45 } );
	const black = BLACK();
	const arm = 12 * FT;
	const cx = 1.75;
	const armY = 0.9;

	parts.box( galv, [ 0.45, 0.02, 0.4 ], [ cx, 0, 0 ] );
	parts.box( cabinet, [ 0.33, 1.0, 0.3 ], [ cx, 0.02, 0 ] );
	parts.box( black, [ 0.35, 0.03, 0.32 ], [ cx, 1.02, 0 ] );
	parts.cylinder( galv, 0.06, 0.06, [ cx - 0.165, armY - 0.03, 0 ], 12 );
	parts.box( black, [ 0.01, 0.1, 0.1 ], [ cx - 0.17, armY - 0.05, 0 ] );

	// The arm in 2 ft red and white bands.
	const start = cx - 0.2;
	const bands = 6;
	for ( let i = 0; i < bands; i ++ ) {

		const l = arm / bands;
		parts.box( i % 2 ? white : red, [ l, 0.1, 0.05 ], [ start - l * ( i + 0.5 ), armY - 0.05, 0 ] );

	}

	// The fork rest at the far end.
	const end = start - arm + 0.08;
	parts.box( galv, [ 0.25, 0.02, 0.25 ], [ end, 0, 0 ] );
	parts.box( galv, [ 0.06, armY - 0.07, 0.06 ], [ end, 0, 0 ] );
	for ( const z of [ - 0.05, 0.05 ] ) parts.box( galv, [ 0.06, 0.15, 0.015 ], [ end, armY - 0.1, z ] );

	return parts.build();

}

// A drive-up card reader: a 3 in post on a base plate, bent out at the top so the reader sits
// at car-window height, 42 in.
function cardReader() {

	const parts = new Parts();
	const yellow = YELLOW();
	const galv = GALV();
	const black = BLACK();
	const r = 1.5 * IN;

	parts.box( galv, [ 0.3, 0.015, 0.3 ], [ 0, 0, 0 ] );
	parts.path( yellow, [ [ 0, 0, 0 ], [ 0, 0.85, 0 ], [ 0, 1.0, - 0.08 ], [ 0, 1.03, - 0.25 ] ], r, 12 );
	parts.box( black, [ 0.15, 0.28, 0.08 ], [ 0, 1.07 - 0.14, - 0.29 ] );
	parts.box( mat( 0x30343a, { roughness: 0.3 } ), [ 0.1, 0.1, 0.005 ], [ 0, 1.0, - 0.333 ] );
	parts.box( mat( 0x2fd16a, { roughness: 0.3, emissive: 0x1a8c40, emissiveIntensity: 0.6 } ), [ 0.03, 0.012, 0.005 ], [ 0, 1.1, - 0.333 ] );
	return parts.build();

}

// A 6 ft precast concrete wheel stop, 9 in wide and 5 in high with sloped sides, painted
// safety yellow at each end, pinned down through two holes.
function wheelStop() {

	const parts = new Parts();
	const concrete = mat( 0xb9b6ad, { roughness: 0.95 } );
	const yellow = mat( 0xf2c200, { roughness: 0.7 } );
	const length = 6 * FT;
	const profile = [ [ - 4.5 * IN, 0 ], [ 4.5 * IN, 0 ], [ 2.5 * IN, 5 * IN ], [ - 2.5 * IN, 5 * IN ] ];
	const ends = 12 * IN;
	parts.prism( concrete, profile, length - 2 * ends );
	for ( const s of [ - 1, 1 ] ) {

		parts.prism( yellow, profile, ends, s * ( length - ends ) / 2 );
		parts.cylinder( mat( 0x55595d, { roughness: 0.6, metalness: 0.5 } ), 0.6 * IN, 0.003, [ s * ( length / 2 - 18 * IN ), 5 * IN, 0 ], 10 );

	}

	return parts.build();

}

// --- signs -----------------------------------------------------------------------------------

// A plastic sandwich-board sign, 24 × 36 in faces on a white frame, legs spread 20 in at the
// foot, with the same face on both sides.
function aFrameSign() {

	const parts = new Parts();
	const frame = mat( 0xf0f0ec, { roughness: 0.5 } );
	const height = 0.95;
	const spread = 0.25;
	const tilt = Math.atan( spread / height );
	const length = Math.hypot( height, spread );
	const thick = 0.03;
	const material = cautionFace();

	for ( const s of [ - 1, 1 ] ) {

		const a = - s * tilt;
		const centre = [ 0, height / 2, s * spread / 2 ];
		parts.block( frame, [ 0.66, length, thick ], centre, [ a, 0, 0 ] );
		// The face, just proud of the panel on its outside.
		const n = [ 0, Math.sin( tilt ), s * Math.cos( tilt ) ];
		const at = centre.map( ( v, i ) => v + n[ i ] * ( thick / 2 + 0.002 ) );
		_r.makeRotationX( a );
		parts.add( material, new PlaneGeometry( 24 * IN, 36 * IN ), _m.copy( _r ).multiply( new Matrix4().makeRotationY( s < 0 ? Math.PI : 0 ) ).setPosition( ...at ) );

	}

	parts.box( frame, [ 0.66, 0.05, 0.06 ], [ 0, height - 0.05, 0 ] );
	return parts.build();

}

function cautionFace() {

	return drawn( 'safety a-frame caution', [ 400, 600 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#ffffff';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#ffd200';
		ctx.fillRect( 0, 0, w, 150 );
		ctx.fillStyle = '#111111';
		ctx.fillRect( 0, 150, w, 8 );
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = 'bold 84px sans-serif';
		ctx.fillText( 'CAUTION', w / 2, 80 );
		hazardStripe( ctx, 0, h - 70, w, 70 );
		ctx.fillStyle = '#111111';
		ctx.font = 'bold 46px sans-serif';
		ctx.fillText( 'CONSTRUCTION', w / 2, 240 );
		ctx.fillText( 'AREA', w / 2, 305 );
		ctx.font = 'bold 34px sans-serif';
		ctx.fillText( 'AUTHORIZED', w / 2, 400 );
		ctx.fillText( 'PERSONNEL ONLY', w / 2, 445 );

	} );

}

function hazardStripe( ctx, x, y, w, h ) {

	ctx.save();
	ctx.beginPath();
	ctx.rect( x, y, w, h );
	ctx.clip();
	ctx.fillStyle = '#ffd200';
	ctx.fillRect( x, y, w, h );
	ctx.fillStyle = '#111111';
	for ( let i = - h; i < w + h; i += 2 * h * 0.6 ) {

		ctx.beginPath();
		ctx.moveTo( x + i, y + h );
		ctx.lineTo( x + i + h * 0.6, y + h );
		ctx.lineTo( x + i + h * 1.6, y );
		ctx.lineTo( x + i + h, y );
		ctx.closePath();
		ctx.fill();

	}

	ctx.restore();

}

// An aluminium sign of [ w, h ] with its bottom at `bottom`, on one or two square galvanised
// posts; `base` [ side, height ] stands a single post in a rubber base instead of the ground.
function metalSign( material, [ w, h ], bottom, posts, base = null ) {

	const parts = new Parts();
	const galv = GALV();
	const post = 2 * IN;
	const foot = base ? base[ 1 ] : 0;
	const xs = posts === 2 ? [ - w / 2 + 6 * IN, w / 2 - 6 * IN ] : [ 0 ];
	if ( base ) parts.box( mat( 0x1d1f21, { roughness: 0.95 } ), [ base[ 0 ], base[ 1 ], base[ 0 ] ], [ 0, 0, 0 ] );
	for ( const x of xs ) parts.box( galv, [ post, bottom + h - 0.05 - foot, post ], [ x, foot, 0 ] );
	parts.box( galv, [ w, h, 0.08 * IN ], [ 0, bottom, - post / 2 - 0.04 * IN ] );
	face( parts, material, [ w, h ], [ 0, bottom + h / 2, - post / 2 - 0.08 * IN - 0.002 ] );
	return parts.build();

}

// The blue mandatory signs: hard hat, hi-vis vest, safety boots and glasses.
function ppeFace() {

	return drawn( 'safety ppe required', [ 768, 576 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#ffffff';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#0b4ea2';
		ctx.fillRect( 0, 0, w, 130 );
		ctx.fillStyle = '#ffffff';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = 'bold 66px sans-serif';
		ctx.fillText( 'PPE REQUIRED', w / 2, 52 );
		ctx.font = 'bold 30px sans-serif';
		ctx.fillText( 'BEYOND THIS POINT', w / 2, 105 );

		// Four blue circles in a row, each named underneath.
		const r = 76;
		const icons = [ [ 'HARD HAT', hardHat ], [ 'HI-VIS', vest ], [ 'SAFETY', boot ], [ 'EYE', glasses ] ];
		const under = [ '', 'VEST', 'BOOTS', 'PROTECTION' ];
		icons.forEach( ( [ label, icon ], i ) => {

			const cx = w * ( i + 0.5 ) / 4;
			const cy = 270;
			ctx.fillStyle = '#0b4ea2';
			ctx.beginPath();
			ctx.arc( cx, cy, r, 0, Math.PI * 2 );
			ctx.fill();
			ctx.fillStyle = '#ffffff';
			ctx.strokeStyle = '#ffffff';
			icon( ctx, cx, cy );
			ctx.fillStyle = '#111111';
			ctx.font = 'bold 28px sans-serif';
			ctx.fillText( label, cx, cy + r + 34 );
			ctx.fillText( under[ i ], cx, cy + r + 68 );

		} );
		hazardStripe( ctx, 0, h - 40, w, 40 );

	} );

}

function hardHat( ctx, x, y ) {

	ctx.beginPath();
	ctx.arc( x, y + 14, 42, Math.PI, 0 );
	ctx.fill();
	ctx.fillRect( x - 56, y + 12, 112, 12 );
	ctx.fillStyle = '#0b4ea2';
	ctx.fillRect( x - 5, y - 30, 10, 40 );

}

function vest( ctx, x, y ) {

	ctx.beginPath();
	ctx.moveTo( x - 22, y - 44 );
	ctx.lineTo( x - 6, y - 10 );
	ctx.lineTo( x + 6, y - 10 );
	ctx.lineTo( x + 22, y - 44 );
	ctx.lineTo( x + 40, y - 36 );
	ctx.lineTo( x + 38, y + 46 );
	ctx.lineTo( x - 38, y + 46 );
	ctx.lineTo( x - 40, y - 36 );
	ctx.closePath();
	ctx.fill();
	ctx.fillStyle = '#0b4ea2';
	ctx.fillRect( x - 38, y + 8, 76, 9 );
	ctx.fillRect( x - 38, y + 26, 76, 9 );

}

function boot( ctx, x, y ) {

	ctx.beginPath();
	ctx.moveTo( x - 30, y - 44 );
	ctx.lineTo( x + 2, y - 44 );
	ctx.lineTo( x + 4, y + 4 );
	ctx.lineTo( x + 44, y + 18 );
	ctx.lineTo( x + 46, y + 40 );
	ctx.lineTo( x - 32, y + 40 );
	ctx.closePath();
	ctx.fill();

}

function glasses( ctx, x, y ) {

	ctx.lineWidth = 8;
	for ( const s of [ - 1, 1 ] ) {

		ctx.beginPath();
		ctx.ellipse( x + s * 28, y, 24, 18, 0, 0, Math.PI * 2 );
		ctx.fill();

	}

	ctx.beginPath();
	ctx.moveTo( x - 8, y - 6 );
	ctx.quadraticCurveTo( x, y - 14, x + 8, y - 6 );
	ctx.stroke();

}

function emergencyFace() {

	return drawn( 'safety emergency contacts', [ 400, 600 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#ffffff';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#c8102e';
		ctx.fillRect( 0, 0, w, 120 );
		ctx.fillStyle = '#ffffff';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = 'bold 46px sans-serif';
		ctx.fillText( 'EMERGENCY', w / 2, 42 );
		ctx.font = 'bold 34px sans-serif';
		ctx.fillText( 'CONTACTS', w / 2, 90 );
		ctx.fillStyle = '#c8102e';
		ctx.font = 'bold 64px sans-serif';
		ctx.fillText( 'CALL 911', w / 2, 175 );
		ctx.fillStyle = '#111111';
		ctx.textAlign = 'left';
		const rows = [ [ 'Site superintendent', '555-0100' ], [ 'Safety officer', '555-0101' ], [ 'First aid attendant', '555-0102' ], [ 'Nearest hospital', '555-0103' ], [ 'Utility locates', '811' ] ];
		rows.forEach( ( [ who, number ], i ) => {

			const y = 245 + i * 62;
			ctx.font = '24px sans-serif';
			ctx.fillText( who, 24, y );
			ctx.font = 'bold 30px sans-serif';
			ctx.fillText( number, 24, y + 28 );

		} );

		ctx.fillStyle = '#00843d';
		ctx.fillRect( 0, h - 46, w, 46 );
		ctx.fillStyle = '#ffffff';
		ctx.textAlign = 'center';
		ctx.font = 'bold 22px sans-serif';
		ctx.fillText( 'FIRST AID KIT IN SITE OFFICE', w / 2, h - 23 );

	} );

}

// The ANSI danger sign: a red oval on a black band over white.
function craneFace() {

	return drawn( 'safety crane danger', [ 512, 384 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#ffffff';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#111111';
		ctx.fillRect( 0, 0, w, 120 );
		ctx.fillStyle = '#ffffff';
		ctx.beginPath();
		ctx.ellipse( w / 2, 60, 170, 46, 0, 0, Math.PI * 2 );
		ctx.fill();
		ctx.fillStyle = '#c8102e';
		ctx.beginPath();
		ctx.ellipse( w / 2, 60, 162, 39, 0, 0, Math.PI * 2 );
		ctx.fill();
		ctx.fillStyle = '#ffffff';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = 'bold 62px sans-serif';
		ctx.fillText( 'DANGER', w / 2, 62 );
		ctx.fillStyle = '#111111';
		ctx.font = 'bold 50px sans-serif';
		ctx.fillText( 'CRANE OVERHEAD', w / 2, 180 );
		ctx.font = 'bold 36px sans-serif';
		ctx.fillText( 'STAY CLEAR OF', w / 2, 262 );
		ctx.fillText( 'SWING RADIUS', w / 2, 312 );

	} );

}

// A 4 × 4 ft plywood board painted white on two 4×4 posts, with a cap rail over it.
function rulesBoard() {

	const parts = new Parts();
	const wood = LUMBER();
	const side = 4 * FT;
	const bottom = 3 * FT;
	const post = 3.5 * IN;
	const px = side / 2 - 0.25;
	for ( const s of [ - 1, 1 ] ) parts.box( wood, [ post, bottom + side + 0.05, post ], [ s * px, 0, post / 2 ] );
	parts.box( mat( 0xc9ab7c, { roughness: 0.9 } ), [ side, side, 0.75 * IN ], [ 0, bottom, - 0.75 * IN / 2 ] );
	parts.box( wood, [ side + 0.1, 1.5 * IN, 5.5 * IN ], [ 0, bottom + side, 0.75 * IN ] );
	face( parts, rulesFace(), [ side, side ], [ 0, bottom + side / 2, - 0.75 * IN - 0.003 ] );
	return parts.build();

}

function rulesFace() {

	return drawn( 'safety site rules', [ 512, 512 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#ffffff';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#163a63';
		ctx.fillRect( 0, 0, w, 90 );
		ctx.fillStyle = '#ffffff';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = 'bold 58px sans-serif';
		ctx.fillText( 'SITE RULES', w / 2, 47 );
		ctx.fillStyle = '#111111';
		ctx.textAlign = 'left';
		ctx.font = '25px sans-serif';
		const rules = [
			'All visitors sign in at site office',
			'Hard hat, vest and boots at all times',
			'Eye protection when cutting or grinding',
			'100% tie-off above 6 ft',
			'No unauthorized persons past gate',
			'Site speed limit 10 km/h (5 mph)',
			'Report all incidents and near misses',
			'No smoking except in marked areas',
			'Keep work areas clean and tidy',
		];
		rules.forEach( ( rule, i ) => ctx.fillText( `${ i + 1 }.  ${ rule }`, 22, 126 + i * 40 ) );
		hazardStripe( ctx, 0, h - 26, w, 26 );

	} );

}

// --- monitoring ------------------------------------------------------------------------------

// An 18 in by 8 ft orange and white wind sock on a swivel at the top of a 20 ft galvanised pole,
// half filled and drooping, blowing to the right.
function windSock() {

	const parts = new Parts();
	const galv = GALV();
	const orange = mat( 0xf26b1d, { roughness: 0.75, side: DoubleSide } );
	const white = mat( 0xf2f2ee, { roughness: 0.75, side: DoubleSide } );
	const height = 20 * FT;

	parts.box( galv, [ 0.3, 0.015, 0.3 ], [ 0, 0, 0 ] );
	parts.cylinder( galv, 0.045, height - 0.12, [ 0, 0, 0 ], 12, 0.035 );
	parts.sphere( galv, 0.05, [ 0, height - 0.08, 0 ], [ 10, 6 ] );

	// The swivel frame and the throat ring.
	const y = height - 0.35;
	const throat = 9 * IN;
	const ringX = 0.12;
	parts.rod( galv, [ 0, y, 0 ], [ ringX, y, 0 ], 0.012, 6 );
	parts.rod( galv, [ ringX, y + throat, 0 ], [ ringX, y - throat, 0 ], 0.012, 6 );

	// Five bands, narrowing to 9 in at the tail and dropping 15° below level.
	const length = 8 * FT;
	const droop = 15 * Math.PI / 180;
	const at = t => [ ringX + Math.cos( droop * t ) * length * t, y - Math.sin( droop * t ) * length * t * 0.7, 0 ];
	for ( let i = 0; i < 5; i ++ ) {

		const [ t0, t1 ] = [ i / 5, ( i + 1 ) / 5 ];
		const radius = t => throat * ( 1 - 0.5 * t );
		parts.rod( i % 2 ? white : orange, at( t0 ), at( t1 ), [ radius( t0 ), radius( t1 ) ], 16, true );

	}

	return parts.build();

}

// A portable weather station for crane wind monitoring: a tripod and 10 ft mast with a cup
// anemometer and wind vane on a crossarm, a temperature shield, a logger box and its solar panel.
function weatherStation() {

	const parts = new Parts();
	const galv = GALV();
	const white = mat( 0xf2f2ee, { roughness: 0.5 } );
	const black = BLACK();
	const solar = mat( 0x1c2a4a, { roughness: 0.2, metalness: 0.5 } );
	const top = 10 * FT;

	// Tripod legs from a collar 1 m up out to feet 0.75 m round, and the mast.
	for ( let k = 0; k < 3; k ++ ) {

		const a = Math.PI / 2 + k * 2 * Math.PI / 3;
		const foot = [ Math.cos( a ) * 0.75, 0.02, Math.sin( a ) * 0.75 ];
		parts.rod( galv, [ 0, 1.0, 0 ], foot, 0.016, 6 );
		parts.box( black, [ 0.08, 0.02, 0.08 ], [ foot[ 0 ], 0, foot[ 2 ] ] );

	}

	parts.cylinder( galv, 0.03, 0.15, [ 0, 0.95, 0 ], 10 );
	parts.cylinder( galv, 0.021, top - 0.2, [ 0, 0.2, 0 ], 10 );

	// The crossarm with the anemometer cups on the left and the vane on the right.
	const armY = top - 0.15;
	parts.rod( galv, [ - 0.45, armY, 0 ], [ 0.45, armY, 0 ], 0.012, 6 );
	parts.cylinder( black, 0.02, 0.18, [ - 0.45, armY, 0 ], 8 );
	for ( let k = 0; k < 3; k ++ ) {

		const a = k * 2 * Math.PI / 3;
		const tip = [ - 0.45 + Math.cos( a ) * 0.11, armY + 0.17, Math.sin( a ) * 0.11 ];
		parts.rod( black, [ - 0.45, armY + 0.17, 0 ], tip, 0.004, 4 );
		parts.sphere( black, 0.03, tip, [ 8, 4 ] );

	}

	parts.cylinder( black, 0.02, 0.15, [ 0.45, armY, 0 ], 8 );
	parts.rod( black, [ 0.35, armY + 0.16, 0 ], [ 0.62, armY + 0.16, 0 ], 0.005, 4 );
	parts.box( black, [ 0.12, 0.08, 0.004 ], [ 0.6, armY + 0.12, 0 ] );
	parts.cylinder( galv, 0.004, 0.25, [ 0, top, 0 ], 4 );

	// The temperature shield: a stack of white plates, the logger, and the panel facing the front.
	for ( let i = 0; i < 6; i ++ ) parts.cylinder( white, 0.07, 0.012, [ 0.12, 2.0 + i * 0.03, 0 ], 14 );
	parts.rod( galv, [ 0, 2.08, 0 ], [ 0.12, 2.08, 0 ], 0.008, 4 );
	parts.box( white, [ 0.3, 0.36, 0.15 ], [ 0, 1.15, 0.1 ] );
	parts.block( solar, [ 0.45, 0.35, 0.025 ], [ 0, 1.75, - 0.08 ], [ 0.6, 0, 0 ] );

	return parts.build();

}
