import { CircleGeometry, DoubleSide, MathUtils, Matrix4, PlaneGeometry, Vector3 } from 'three';
import { drawn, FT, IN, mat, Parts } from './parts.js';
import { memberGeometry } from './plant-parts.js';
import { cab, carrier, tracks } from './heavy-civil.js';
import { front } from './earthmoving.js';
import { extruded } from './site-extras.js';

// Interior fit-out, MEP equipment, abatement and selective demolition, built in code at the sizes
// of the common North American kit: the interior trades' rolling scaffold and drywall lift,
// framing, duct, sprinkler pipe and wire staged for rough-in, a pipe threader, the long-lead MEP
// equipment as delivered (crated switchgear, a rooftop unit and an air-cooled chiller), the
// abatement set-up (a dust wall, a HEPA negative air machine and a decon trailer) and the
// demolition machines (a remote demolition robot, and 30 t and 35 t excavators with a sorting
// grapple and a pulverizer). Like the other built-in pieces each stands on y = 0 with its front
// facing -Z (+X is its right).

const DEG = MathUtils.DEG2RAD;
const _m = new Matrix4();

export const FITOUT_DEMO_ITEMS = [
	// Interior trades.
	{ id: 'baker-scaffold', name: 'Baker / Perry rolling scaffold (6 × 2.5 ft, 6 ft platform, guardrails, castors)', category: 'Access & scaffolding',
		keywords: 'baker scaffold perry scaffold rolling scaffold baker staging interior scaffold drywall taper electrician castors guardrail',
		build: bakerScaffold },
	{ id: 'drywall-panel-lift', name: 'Drywall panel hoist (11 ft reach, with a 4 × 12 ft sheet on the cradle)', category: 'Material handling',
		keywords: 'drywall lift panel lift panelift sheetrock hoist gyproc ceiling board lift winch telpro',
		build: drywallLift },
	{ id: 'metal-stud-bundle', name: 'Steel stud and track bundles on dunnage (6 in × 12 ft, 4 bundles)', category: 'Materials',
		keywords: 'metal studs steel studs track light gauge framing bundle drywall framing partitions 600s162 lgs',
		build: studBundles },
	{ id: 'ductwork-stack', name: 'Galvanized ductwork staged on a pallet and dunnage (24 × 18 in rectangular, 16 in spiral × 10 ft)', category: 'Materials',
		keywords: 'ductwork duct hvac sheet metal spiral duct rectangular duct tdc galvanized rough in mechanical staging',
		build: ductStack },
	{ id: 'sprinkler-pipe-rack', name: 'Pipe cart, A-frame on castors, loaded with black steel sprinkler pipe (21 ft lengths)', category: 'Materials',
		keywords: 'pipe cart pipe rack a frame sprinkler pipe black iron fire protection schedule 10 pipe dolly mechanical',
		build: pipeCart },
	{ id: 'wire-spool-cart', name: 'Wire spool cart / wire caddy (6 spools of THHN on an axle, castors)', category: 'Material handling',
		keywords: 'wire cart wire caddy wire spool reel cart thhn electrical wire pull electrician spool rack',
		build: wireCart },
	{ id: 'pipe-threading-machine', name: 'Power pipe threading machine on a stand (½ to 2 in, with pipe on a pipe stand)', category: 'Site services',
		keywords: 'pipe threader threading machine 535 300 power drive plumber pipefitter die head pipe stand tripod',
		build: pipeThreader },

	// MEP equipment as delivered.
	{ id: 'switchgear-crated', name: 'Electrical switchgear lineup, crated on skids (4 sections, 90 in high, 2,000 A, 2 shipping splits)', category: 'Utilities',
		keywords: 'switchgear switchboard electrical gear lineup crated skid long lead equipment rigging main breaker 2000 amp',
		build: switchgear },
	{ id: 'rooftop-hvac-unit', name: 'Packaged rooftop HVAC unit on dunnage (25 ton RTU, 16 × 7 × 5 ft, lifting lugs)', category: 'Utilities',
		keywords: 'rtu rooftop unit hvac packaged unit air handler roof top crane pick 25 ton mechanical curb',
		build: rooftopUnit },
	{ id: 'air-cooled-chiller', name: 'Air-cooled chiller on skid (150 ton, 30 × 7.5 × 8 ft, 12 fans)', category: 'Utilities',
		keywords: 'chiller air cooled chiller hvac mechanical cooling plant 150 ton condenser fans roof pad crane pick',
		build: chiller },

	// Abatement.
	{ id: 'dust-barrier-zipwall', name: 'Dust containment wall, spring poles and 6 mil poly with zipper door (20 ft run, 10 ft high)', category: 'Temporary covers',
		keywords: 'zipwall dust barrier dust wall poly wall containment spring poles plastic sheeting zipper door renovation abatement',
		build: dustWall, rowLength: 20 * FT },
	{ id: 'negative-air-machine', name: 'HEPA negative air machine (2,000 CFM) with 12 in lay-flat exhaust duct', category: 'Environmental & erosion control',
		keywords: 'negative air machine nam hepa air scrubber air filtration abatement asbestos mold dust containment lay flat duct',
		build: negativeAir },
	{ id: 'decon-trailer', name: 'Asbestos / lead decontamination unit trailer (3-stage, 8 × 20 ft, steps)', category: 'Site trailers & containers',
		keywords: 'decon trailer decontamination unit asbestos abatement lead shower trailer clean room equipment room hazmat',
		build: deconTrailer },

	// Demolition.
	{ id: 'demolition-robot', name: 'Remote demolition robot (Brokk 300 class, outriggers set, hydraulic breaker)', category: 'Heavy equipment',
		keywords: 'demolition robot brokk remote controlled demolition machine breaker interior demo confined tracked',
		build: demolitionRobot },
	{ id: 'excavator-demolition-grapple', name: 'Excavator with rotating demolition / sorting grapple (30 t class, cab guard)', category: 'Heavy equipment',
		keywords: 'excavator grapple demolition grapple sorting grapple selector demo debris loading 30 ton rotating',
		build: grappleExcavator },
	{ id: 'excavator-pulverizer', name: 'Excavator with concrete pulverizer (35 t class, jaws open, cab guard)', category: 'Heavy equipment',
		keywords: 'excavator pulverizer concrete crusher processor demolition rebar secondary breaking 35 ton jaws',
		build: pulverizerExcavator },
];

// --- colours -----------------------------------------------------------------------------------

const paint = color => mat( color, { roughness: 0.5, metalness: 0.2 } );
const YELLOW = () => paint( 0xe2a41c );
const DARK = () => mat( 0x2c2e31, { roughness: 0.7, metalness: 0.2 } );
const BLACK = () => mat( 0x18191b, { roughness: 0.85 } );
const RUBBER = () => mat( 0x161718, { roughness: 0.9 } );
const STEEL = () => mat( 0x7d8287, { roughness: 0.5, metalness: 0.6 } );
const BRIGHT = () => mat( 0xc9ccce, { roughness: 0.35, metalness: 0.3 } );
const GALV = () => mat( 0xa9adb0, { roughness: 0.45, metalness: 0.65 } );
const TIMBER = () => mat( 0x9c7b52, { roughness: 0.95 } );
const CONCRETE = () => mat( 0xb9b5ab, { roughness: 0.95 } );

// --- shared pieces -----------------------------------------------------------------------------

const v = p => Array.isArray( p ) ? new Vector3( ...p ) : p.clone();
// The direction `a` degrees above level towards the front, and the one square to it on its top side.
const ahead = a => new Vector3( 0, Math.sin( a * DEG ), - Math.cos( a * DEG ) );

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

// A swivel castor at (x, z): the wheel (radius r) on its axle, the fork over it and the plate
// it's bolted on by. Returns the height of the top of the plate.
function castor( parts, [ x, z ], r, frame ) {

	const w = r * 0.6;
	parts.rod( RUBBER(), [ x - w / 2, r, z ], [ x + w / 2, r, z ], r, 14 );
	parts.rod( STEEL(), [ x - w / 2 - 0.004, r, z ], [ x + w / 2 + 0.004, r, z ], r * 0.3, 8 );
	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ 0.006, r * 1.15, r * 0.6 ], [ x + s * ( w / 2 + 0.006 ), r * 0.95, z - r * 0.2 ] );
	parts.box( frame, [ w + 0.03, 0.012, r * 1.0 ], [ x, r * 2.1, z ] );
	return r * 2.1 + 0.012;

}

// A road tyre on its rim, its axle across x, `radius` up at (x, z).
function tyre( parts, radius, width, [ x, z ] ) {

	parts.rod( RUBBER(), [ x - width / 2, radius, z ], [ x + width / 2, radius, z ], radius, 20 );
	parts.rod( BRIGHT(), [ x - width / 2 - 0.01, radius, z ], [ x + width / 2 + 0.01, radius, z ], radius * 0.55, 14 );

}

// A 48 × 40 in stringer pallet, 48 in along x, its middle at (x, z) on the ground. Returns its height.
function pallet( parts, wood, [ x, z ] ) {

	const L = 48 * IN;
	const W = 40 * IN;
	const board = 0.625 * IN;
	for ( const dx of [ - 0.5, 0, 0.5 ] ) parts.box( wood, [ 3.5 * IN, board, W ], [ x + dx * ( L - 3.5 * IN ), 0, z ] );
	for ( const dz of [ - 1, 0, 1 ] ) parts.box( wood, [ L, 3.5 * IN, 1.5 * IN ], [ x, board, z + dz * ( W / 2 - 0.75 * IN ) ] );
	const top = board + 3.5 * IN;
	for ( let i = 0; i < 7; i ++ ) parts.box( wood, [ 5.5 * IN, board, W ], [ x - L / 2 + 2.75 * IN + i * ( L - 5.5 * IN ) / 6, top, z ] );
	return top + board;

}

// A round fan guard seen from above: rings and spokes, cut out between them.
function fanGuard() {

	return drawn( 'fitout fan guard', [ 256, 256 ], ( ctx, w ) => {

		ctx.strokeStyle = '#26282a';
		ctx.lineWidth = 4;
		for ( let r = 22; r < w / 2 - 2; r += 15 ) {

			ctx.beginPath();
			ctx.arc( w / 2, w / 2, r, 0, Math.PI * 2 );
			ctx.stroke();

		}

		ctx.lineWidth = 6;
		for ( let i = 0; i < 8; i ++ ) {

			const a = i / 8 * Math.PI * 2;
			ctx.beginPath();
			ctx.moveTo( w / 2, w / 2 );
			ctx.lineTo( w / 2 + Math.cos( a ) * ( w / 2 - 2 ), w / 2 + Math.sin( a ) * ( w / 2 - 2 ) );
			ctx.stroke();

		}

		ctx.beginPath();
		ctx.arc( w / 2, w / 2, 18, 0, Math.PI * 2 );
		ctx.fillStyle = '#26282a';
		ctx.fill();

	}, { roughness: 0.55, metalness: 0.4, side: DoubleSide } );

}

// A condenser fan on a unit's top at (x, y, z), radius r: the shroud, the dark throat with three
// blades in it, and the guard over it.
function fan( parts, shroud, [ x, y, z ], r ) {

	parts.cylinder( shroud, r + 0.03, 0.14, [ x, y, z ], 24 );
	parts.cylinder( BLACK(), r, 0.005, [ x, y + 0.141, z ], 24 );
	for ( let i = 0; i < 3; i ++ ) {

		const a = i / 3 * Math.PI * 2;
		parts.block( DARK(), [ r * 0.85, 0.01, r * 0.3 ], [ x + Math.cos( a ) * r * 0.45, y + 0.12, z + Math.sin( a ) * r * 0.45 ], [ 0.25, - a, 0 ] );

	}

	const guard = new CircleGeometry( r + 0.01, 24 );
	parts.add( fanGuard(), guard, _m.makeRotationX( - Math.PI / 2 ).setPosition( x, y + 0.16, z ) );

}

// Fins of a coil (or louvres of a grille): fine dark lines on grey, to put on a panel.
function finned( key, color, stripes, vertical ) {

	return drawn( key, [ 512, 128 ], ( ctx, w, h ) => {

		ctx.fillStyle = color;
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = 'rgba( 0, 0, 0, 0.45 )';
		if ( vertical ) for ( let i = 0; i < stripes; i ++ ) ctx.fillRect( i * w / stripes, 0, w / stripes * 0.45, h );
		else for ( let i = 0; i < stripes; i ++ ) ctx.fillRect( 0, i * h / stripes, w, h / stripes * 0.45 );

	}, { roughness: 0.6, metalness: 0.3 } );

}

// A flat sign or label of `size` [ w, h ] with its middle at `at`, turned `turn` about the
// vertical from facing +Z.
function sign( parts, material, [ w, h ], at, turn ) {

	parts.add( material, new PlaneGeometry( w, h ), _m.makeRotationY( turn ).setPosition( ...at ) );

}

// --- Baker scaffold ----------------------------------------------------------------------------

// A Baker (Perry) rolling scaffold: two 29 in wide ladder end frames 6 ft long apart on 5 in
// locking castors, braced across the back and front, the plywood deck on the top rung 6 ft off the
// floor, and a 42 in guardrail all round with a mid rail. About 9.5 ft high to the top rail.
function bakerScaffold() {

	const parts = new Parts();
	const frame = mat( 0x2f63a8, { roughness: 0.45, metalness: 0.3 } );
	const rail = mat( 0xd8a21c, { roughness: 0.5, metalness: 0.3 } );
	const deck = mat( 0xb48a58, { roughness: 0.9 } );
	const L = 6 * FT;
	const W = 29 * IN;
	const tube = 0.8 * IN;
	const x0 = L / 2 - 0.03;
	const z0 = W / 2 - 0.03;

	// Castors under the four legs, and the end frames standing on them: two uprights and rungs a
	// foot apart.
	let foot = 0;
	for ( const x of [ - x0, x0 ] ) for ( const z of [ - z0, z0 ] ) foot = castor( parts, [ x, z ], 2.5 * IN, BLACK() );
	const deckY = 6 * FT;
	for ( const x of [ - x0, x0 ] ) {

		for ( const z of [ - z0, z0 ] ) parts.rod( frame, [ x, foot, z ], [ x, deckY, z ], tube, 8 );
		for ( let y = foot + 0.08; y < deckY - 0.05; y += 0.3 ) parts.rod( frame, [ x, y, - z0 ], [ x, y, z0 ], tube * 0.8, 6 );
		parts.rod( frame, [ x, deckY - 0.02, - z0 ], [ x, deckY - 0.02, z0 ], tube, 6 );

	}

	// Diagonal braces on both long sides, crossed.
	for ( const z of [ - z0 - 0.02, z0 + 0.02 ] ) {

		parts.rod( frame, [ - x0, foot + 0.15, z ], [ x0, deckY - 0.25, z ], tube * 0.7, 6 );
		parts.rod( frame, [ x0, foot + 0.15, z ], [ - x0, deckY - 0.25, z ], tube * 0.7, 6 );

	}

	// The deck: plywood in an aluminium frame across the top rungs.
	parts.box( deck, [ L - 0.02, 0.025, W - 0.02 ], [ 0, deckY, 0 ] );
	parts.box( BRIGHT(), [ L, 0.04, 0.03 ], [ 0, deckY - 0.01, - W / 2 + 0.015 ] );
	parts.box( BRIGHT(), [ L, 0.04, 0.03 ], [ 0, deckY - 0.01, W / 2 - 0.015 ] );

	// Guardrail: four posts, top and mid rails round the deck.
	const top = deckY + 42 * IN;
	for ( const x of [ - x0, x0 ] ) for ( const z of [ - z0, z0 ] ) parts.rod( rail, [ x, deckY, z ], [ x, top, z ], tube, 8 );
	for ( const y of [ deckY + 21 * IN, top - 0.01 ] ) {

		const corners = [ [ - x0, - z0 ], [ x0, - z0 ], [ x0, z0 ], [ - x0, z0 ] ];
		for ( let i = 0; i < 4; i ++ ) {

			const [ ax, az ] = corners[ i ];
			const [ bx, bz ] = corners[ ( i + 1 ) % 4 ];
			parts.rod( rail, [ ax, y, az ], [ bx, y, bz ], tube * 0.8, 6 );

		}

	}

	return parts.build();

}

// --- drywall panel hoist -----------------------------------------------------------------------

// A drywall panel hoist of the kind that reaches 11 ft: a three-legged base on castors, the
// telescoping mast with its winch wheel at the front, and the tilting cradle on top with its
// extension arms out, carrying a 4 × 12 ft sheet of ½ in drywall raised flat to about 7.5 ft for
// a ceiling.
function drywallLift() {

	const parts = new Parts();
	const red = paint( 0xb8262a );
	const board = mat( 0xeeece4, { roughness: 0.9 } );
	const edge = mat( 0xc9c7bf, { roughness: 0.9 } );

	// Base: three legs from the foot of the mast, a castor at the end of each.
	const hub = 0.24;
	for ( let i = 0; i < 3; i ++ ) {

		const a = ( i / 3 ) * Math.PI * 2 + Math.PI / 2;
		const end = [ Math.cos( a ) * 0.82, Math.sin( a ) * 0.82 ];
		const top = castor( parts, end, 0.05, red );
		member( parts, red, [ 0.05, 0.05 ], [ 0, hub, 0 ], [ end[ 0 ], top + 0.025, end[ 1 ] ] );

	}

	parts.box( red, [ 0.16, 0.12, 0.16 ], [ 0, hub - 0.06, 0 ] );

	// The mast: the outer tube, the inner one run up out of it, and the winch on its front.
	const cradleY = 2.24;
	parts.box( red, [ 0.09, 1.55 - hub, 0.09 ], [ 0, hub, 0 ] );
	parts.box( BRIGHT(), [ 0.065, cradleY - 1.5, 0.065 ], [ 0, 1.5, 0 ] );
	parts.box( red, [ 0.12, 0.2, 0.12 ], [ 0, 0.9, 0 ] );
	parts.rod( STEEL(), [ 0, 1.0, - 0.06 ], [ 0, 1.0, - 0.14 ], 0.015, 6 );
	parts.rod( BLACK(), [ 0, 1.0, - 0.14 ], [ 0, 1.0, - 0.16 ], 0.17, 18 );
	for ( let i = 0; i < 3; i ++ ) {

		const a = i / 3 * Math.PI * 2;
		parts.rod( BLACK(), [ Math.cos( a ) * 0.17, 1.0 + Math.sin( a ) * 0.17, - 0.17 ], [ Math.cos( a ) * 0.17, 1.0 + Math.sin( a ) * 0.17, - 0.26 ], 0.012, 6 );

	}

	parts.rod( STEEL(), [ 0, 1.03, 0.05 ], [ 0, cradleY, 0.05 ], 0.003, 4 ); // cable

	// Tilt head and cradle: a bar along the sheet with extension arms, and cross bars under it
	// with hooks along the front edge.
	parts.box( DARK(), [ 0.14, 0.1, 0.14 ], [ 0, cradleY - 0.04, 0 ] );
	const barY = cradleY + 0.06;
	parts.box( red, [ 1.6, 0.05, 0.05 ], [ 0, barY - 0.05, 0 ] );
	parts.box( BRIGHT(), [ 3.1, 0.035, 0.035 ], [ 0, barY - 0.04, 0 ] );
	for ( const x of [ - 1.45, - 0.6, 0.6, 1.45 ] ) {

		parts.box( x * x < 1 ? red : BRIGHT(), [ 0.04, 0.04, 1.1 ], [ x, barY - 0.005, 0 ] );
		parts.box( BLACK(), [ 0.05, 0.08, 0.03 ], [ x, barY - 0.005, - 0.58 ] );

	}

	// The sheet.
	const sheet = [ 12 * FT, 0.5 * IN, 4 * FT ];
	parts.box( edge, sheet, [ 0, barY + 0.035, 0 ] );
	parts.box( board, [ sheet[ 0 ] - 0.004, 0.002, sheet[ 2 ] - 0.004 ], [ 0, barY + 0.035 + sheet[ 1 ], 0 ] );
	return parts.build();

}

// --- steel studs -------------------------------------------------------------------------------

// Four bundles of 6 in light-gauge steel framing, 12 ft long, staged on 4 × 4 dunnage two by two
// with 2 × 4 spacers between the layers: three bundles of C studs (6 in web, 1⅝ in flanges with
// lips, ten to a bundle) and one of U track, each banded in three places.
function studBundles() {

	const parts = new Parts();
	const galv = mat( 0xc8ccce, { roughness: 0.45, metalness: 0.35, side: DoubleSide } );
	const band = mat( 0x3b3f44, { roughness: 0.6, metalness: 0.5 } );
	const wood = TIMBER();
	const length = 12 * FT;
	const web = 6 * IN;
	const t = 0.0018;

	// A C stud's section (web down, flanges up) and a track's (no lips, shorter flanges).
	const studProfile = ( f, lip ) => {

		const w = web / 2;
		const p = [ [ - w, 0 ], [ w, 0 ], [ w, f ] ];
		if ( lip ) p.push( [ w - lip, f ], [ w - lip, f - t ], [ w - t, f - t ] );
		else p.push( [ w - t, f ] );
		p.push( [ w - t, t ], [ - w + t, t ] );
		if ( lip ) p.push( [ - w + t, f - t ], [ - w + lip, f - t ], [ - w + lip, f ] );
		else p.push( [ - w + t, f ] );
		p.push( [ - w, f ] );
		return p;

	};

	const stud = studProfile( 1.625 * IN, 0.5 * IN );
	const track = studProfile( 1.25 * IN, 0 );

	// One bundle: two across and five high, its middle at x, its bottom at y. Returns its height.
	const bundle = ( x, y, profile, flange ) => {

		for ( let row = 0; row < 5; row ++ ) {

			for ( const s of [ - 0.5, 0.5 ] ) {

				parts.add( galv, extruded( profile, length ), _m.makeTranslation( x + s * ( web + 0.004 ), y + row * flange, 0 ) );

			}

		}

		const w = 2 * web + 0.01;
		const h = 5 * flange;
		for ( const z of [ - 1.4, 0, 1.4 ] ) {

			parts.box( band, [ w, 0.002, 0.02 ], [ x, y + h, z ] );
			parts.box( band, [ 0.002, h, 0.02 ], [ x - w / 2, y, z ] );
			parts.box( band, [ 0.002, h, 0.02 ], [ x + w / 2, y, z ] );

		}

		return h;

	};

	const pitch = 2 * web + 0.04;
	const dunnage = 3.5 * IN;
	for ( const z of [ - 1.6, 0, 1.6 ] ) parts.box( wood, [ 2 * pitch + 0.1, dunnage, 3.5 * IN ], [ 0, 0, z ] );
	const h = bundle( - pitch / 2, dunnage, stud, 1.625 * IN );
	bundle( pitch / 2, dunnage, stud, 1.625 * IN );
	const upper = dunnage + h + 1.5 * IN;
	for ( const z of [ - 1.6, 0, 1.6 ] ) parts.box( wood, [ 2 * pitch + 0.02, 1.5 * IN, 3.5 * IN ], [ 0, dunnage + h, z ] );
	bundle( - pitch / 2, upper, stud, 1.625 * IN );
	bundle( pitch / 2, upper, track, 1.25 * IN );
	return parts.build();

}

// --- ductwork ----------------------------------------------------------------------------------

// Sheet metal staged for HVAC rough-in: on a pallet, four 4 ft joints of 24 × 18 in rectangular
// duct with TDC flanges, two by two, cross-broken on top; beside it six 10 ft lengths of 16 in
// spiral duct stacked three, two, one on a pair of 4 × 4 timbers.
function ductStack() {

	const parts = new Parts();
	const galv = mat( 0xc8ccce, { roughness: 0.45, metalness: 0.35, side: DoubleSide } );
	const flange = mat( 0xa9adb0, { roughness: 0.45, metalness: 0.35 } );
	const wood = TIMBER();

	// Rectangular duct: four thin walls, a flange frame round each end and the cross-break.
	const px = - 0.85;
	const top = pallet( parts, wood, [ px, 0 ] );
	const w = 24 * IN;
	const h = 18 * IN;
	const l = 4 * FT;
	const t = 0.003;
	const f = 0.03;
	for ( const row of [ 0, 1 ] ) {

		for ( const s of [ - 0.5, 0.5 ] ) {

			const x = px + s * ( w + 0.01 );
			const y = top + row * ( h + 2 * f + 0.005 ) + f;
			parts.box( galv, [ w, t, l ], [ x, y, 0 ] );
			parts.box( galv, [ w, t, l ], [ x, y + h - t, 0 ] );
			for ( const side of [ - 1, 1 ] ) parts.box( galv, [ t, h, l ], [ x + side * ( w / 2 - t / 2 ), y, 0 ] );
			for ( const z of [ - l / 2 + 0.015, l / 2 - 0.015 ] ) {

				parts.box( flange, [ w + 2 * f, f, 0.03 ], [ x, y - f, z ] );
				parts.box( flange, [ w + 2 * f, f, 0.03 ], [ x, y + h, z ] );
				for ( const side of [ - 1, 1 ] ) parts.box( flange, [ f, h, 0.03 ], [ x + side * ( w / 2 + f / 2 ), y, z ] );

			}

			const a = Math.atan2( l - 0.06, w );
			const diagonal = Math.hypot( w, l - 0.06 );
			for ( const turn of [ a, - a ] ) parts.block( flange, [ diagonal, 0.004, 0.008 ], [ x, y + h + 0.001, 0 ], [ 0, turn, 0 ] );

		}

	}

	// Spiral duct: open tubes on two timbers, with the raised seam winding round every 5½ in.
	const r = 8 * IN;
	const sl = 10 * FT;
	const timber = 3.5 * IN;
	const sx = 0.85;
	for ( const z of [ - 1.1, 1.1 ] ) parts.box( wood, [ 1.45, timber, 3.5 * IN ], [ sx, 0, z ] );
	const pipes = [];
	for ( let i = 0; i < 3; i ++ ) pipes.push( [ sx + ( i - 1 ) * 2 * r, timber + r ] );
	for ( let i = 0; i < 2; i ++ ) pipes.push( [ sx + ( i - 0.5 ) * 2 * r, timber + r + r * Math.sqrt( 3 ) ] );
	pipes.push( [ sx, timber + r + 2 * r * Math.sqrt( 3 ) ] );
	for ( const [ x, y ] of pipes ) {

		parts.rod( galv, [ x, y, - sl / 2 ], [ x, y, sl / 2 ], r, 24, true );
		const pitch = 5.5 * IN;
		const tilt = Math.atan( pitch / ( 2 * Math.PI * r ) );
		for ( let z = - sl / 2 + pitch; z < sl / 2 - 0.05; z += pitch ) {

			parts.rod( flange, [ x, y - Math.sin( tilt ) * 0.004, z - Math.cos( tilt ) * 0.004 ], [ x, y + Math.sin( tilt ) * 0.004, z + Math.cos( tilt ) * 0.004 ], r + 0.002, 24, true );

		}

	}

	return parts.build();

}

// --- sprinkler pipe cart ------------------------------------------------------------------------

// An A-frame pipe cart, about 9 ft long on four 6 in castors: two A-frames joined by base rails
// and a ridge, three tiers of cantilever arms each side, carrying 21 ft lengths of black steel
// sprinkler pipe (2½, 2 and 1½ in, the bottom tier red-primed), the cart in the middle.
function pipeCart() {

	const parts = new Parts();
	const frame = paint( 0x2f5f9a );
	const black = mat( 0x2a2b2d, { roughness: 0.55, metalness: 0.5 } );
	const red = mat( 0x9b2a22, { roughness: 0.6, metalness: 0.2 } );
	const ends = [ - 1.35, 1.35 ];
	const halfBase = 0.45;
	let base = 0;
	for ( const x of [ - halfBase, halfBase ] ) for ( const z of ends ) base = castor( parts, [ x, z ], 3 * IN, BLACK() );

	// Base rails, A-frames, and the ridge over the top.
	const ridge = 1.35;
	for ( const x of [ - halfBase, halfBase ] ) member( parts, frame, [ 0.08, 0.06 ], [ x, base + 0.03, ends[ 0 ] - 0.1 ], [ x, base + 0.03, ends[ 1 ] + 0.1 ] );
	for ( const z of ends ) {

		for ( const x of [ - halfBase, halfBase ] ) member( parts, frame, [ 0.07, 0.07 ], [ x, base + 0.06, z ], [ 0, ridge, z ] );
		member( parts, frame, [ 0.06, 0.06 ], [ - halfBase, base + 0.03, z ], [ halfBase, base + 0.03, z ] );

	}

	member( parts, frame, [ 0.06, 0.08 ], [ 0, ridge, ends[ 0 ] - 0.05 ], [ 0, ridge, ends[ 1 ] + 0.05 ] );

	// The leg's x at height y, then arms out from it with a stop on the end, and pipe on them.
	const legX = y => halfBase * ( 1 - ( y - base - 0.06 ) / ( ridge - base - 0.06 ) );
	const tiers = [ [ base + 0.22, 2.875 * IN, 5, red ], [ base + 0.55, 2.375 * IN, 6, black ], [ base + 0.88, 1.9 * IN, 7, black ] ];
	const pipeLength = 21 * FT;
	for ( const side of [ - 1, 1 ] ) {

		for ( const [ y, od, count, material ] of tiers ) {

			const x0 = side * legX( y );
			const reach = count * od + 0.05;
			for ( const z of ends ) {

				member( parts, frame, [ 0.05, 0.05 ], [ x0, y - 0.025, z ], [ x0 + side * reach, y - 0.025, z ] );
				member( parts, frame, [ 0.04, 0.04 ], [ x0 + side * reach, y - 0.05, z ], [ x0 + side * reach, y + 0.07, z ] );

			}

			for ( let i = 0; i < count; i ++ ) {

				const x = x0 + side * ( od / 2 + i * od + 0.01 );
				parts.rod( material, [ x, y + od / 2, - pipeLength / 2 ], [ x, y + od / 2, pipeLength / 2 ], od / 2, 10 );

			}

		}

	}

	return parts.build();

}

// --- wire spool cart ----------------------------------------------------------------------------

// A wire cart for pulls inside a building: a welded frame about 44 × 24 in on 4 in castors, six
// 500 ft spools of THHN (black, red, blue, white, green and the bare ground) on one axle, a guide
// bar with eyes at the front the conductors are threaded through, and the push handle at the back.
function wireCart() {

	const parts = new Parts();
	const frame = YELLOW();
	const flange = mat( 0x3a3d40, { roughness: 0.7 } );
	const W = 1.12;
	const D = 0.6;
	let base = 0;
	for ( const x of [ - W / 2 + 0.04, W / 2 - 0.04 ] ) for ( const z of [ - D / 2 + 0.04, D / 2 - 0.04 ] ) base = castor( parts, [ x, z ], 2 * IN, BLACK() );

	// Base frame and its expanded-metal shelf, the uprights at the ends with the axle across.
	for ( const z of [ - D / 2 + 0.04, D / 2 - 0.04 ] ) member( parts, frame, [ 0.04, 0.04 ], [ - W / 2, base + 0.02, z ], [ W / 2, base + 0.02, z ] );
	for ( const x of [ - W / 2 + 0.02, W / 2 - 0.02 ] ) member( parts, frame, [ 0.04, 0.04 ], [ x, base + 0.02, - D / 2 ], [ x, base + 0.02, D / 2 ] );
	parts.box( DARK(), [ W - 0.06, 0.006, D - 0.1 ], [ 0, base + 0.02, 0 ] );
	const axle = 0.62;
	for ( const x of [ - W / 2 + 0.02, W / 2 - 0.02 ] ) {

		member( parts, frame, [ 0.035, 0.035 ], [ x, base + 0.04, - D / 2 + 0.06 ], [ x, axle, 0 ] );
		member( parts, frame, [ 0.035, 0.035 ], [ x, base + 0.04, D / 2 - 0.06 ], [ x, axle, 0 ] );

	}

	parts.rod( BRIGHT(), [ - W / 2, axle, 0 ], [ W / 2, axle, 0 ], 0.016, 8 );

	// The push handle at the back and the guide bar at the front.
	for ( const x of [ - W / 2 + 0.02, W / 2 - 0.02 ] ) parts.rod( frame, [ x, base + 0.04, D / 2 - 0.04 ], [ x, 1.0, D / 2 + 0.06 ], 0.016, 8 );
	parts.rod( frame, [ - W / 2 + 0.02, 1.0, D / 2 + 0.06 ], [ W / 2 - 0.02, 1.0, D / 2 + 0.06 ], 0.016, 8 );
	const guideY = 0.82;
	const guideZ = - D / 2 - 0.02;
	for ( const x of [ - W / 2 + 0.02, W / 2 - 0.02 ] ) parts.rod( frame, [ x, base + 0.04, - D / 2 + 0.04 ], [ x, guideY, guideZ ], 0.014, 8 );
	parts.rod( frame, [ - W / 2 + 0.02, guideY, guideZ ], [ W / 2 - 0.02, guideY, guideZ ], 0.014, 8 );

	// Spools, each with its conductor run from the top of the wrap to an eye on the guide bar and
	// hanging down a little in front of it.
	const colours = [ 0x1c1c1c, 0xb3221c, 0x2050a8, 0xe8e8e2, 0x2f8a3a, 0xb87333 ];
	const width = 6.5 * IN;
	const r = 6 * IN;
	for ( let i = 0; i < 6; i ++ ) {

		const x = - W / 2 + 0.06 + width / 2 + i * ( width + 0.004 );
		const wire = mat( colours[ i ], { roughness: 0.45 } );
		parts.rod( wire, [ x - width / 2 + 0.008, axle, 0 ], [ x + width / 2 - 0.008, axle, 0 ], r * 0.82, 18 );
		for ( const s of [ - 1, 1 ] ) parts.rod( flange, [ x + s * ( width / 2 - 0.008 ), axle, 0 ], [ x + s * width / 2, axle, 0 ], r, 20 );
		parts.path( wire, [ [ x, axle + r * 0.82, 0 ], [ x, guideY + 0.015, guideZ ], [ x, guideY - 0.03, guideZ - 0.06 ], [ x, guideY - 0.25, guideZ - 0.08 ] ], 0.004, 5 );
		parts.rod( BRIGHT(), [ x - 0.015, guideY + 0.01, guideZ ], [ x + 0.015, guideY + 0.01, guideZ ], 0.012, 6 );

	}

	return parts.build();

}

// --- pipe threading machine --------------------------------------------------------------------

// A power pipe threading machine (½ to 2 in) on its folding stand: the motor and chuck at the
// right, the carriage rails to the left with the die head, cutter and reamer, the oil tray under
// them and the foot switch on the floor in front; a 2 in pipe through the chuck, its far end on a
// V-head pipe stand. About 9 ft from the die head to the stand.
function pipeThreader() {

	const parts = new Parts();
	const red = paint( 0xc0302a );
	const pipe = mat( 0x2a2b2d, { roughness: 0.55, metalness: 0.5 } );
	const ox = - 0.9;
	const top = 0.62;

	// The stand: four splayed legs and the frame the machine bolts on.
	for ( const x of [ - 0.35, 0.35 ] ) for ( const z of [ - 0.2, 0.2 ] ) parts.rod( DARK(), [ ox + x * 1.25, 0.016, z * 1.6 ], [ ox + x, top, z ], 0.016, 6 );
	parts.box( DARK(), [ 0.8, 0.04, 0.44 ], [ ox, top - 0.04, 0 ] );

	// Oil tray and chip pan the length of the machine.
	parts.box( red, [ 0.85, 0.1, 0.42 ], [ ox, top, 0 ] );
	parts.box( BLACK(), [ 0.55, 0.005, 0.32 ], [ ox - 0.12, top + 0.1, 0 ] );

	// The head on the right: motor housing, the front chuck facing the carriage and the rear
	// centring chuck.
	const axis = top + 0.27;
	const hx = ox + 0.27;
	parts.box( red, [ 0.3, 0.42, 0.36 ], [ hx, top + 0.1, 0 ] );
	parts.box( DARK(), [ 0.22, 0.14, 0.2 ], [ hx, top + 0.1, 0.25 ] );
	parts.rod( DARK(), [ hx - 0.15, axis, 0 ], [ hx - 0.21, axis, 0 ], 0.13, 16 );
	parts.rod( DARK(), [ hx + 0.15, axis, 0 ], [ hx + 0.21, axis, 0 ], 0.1, 16 );
	for ( let i = 0; i < 3; i ++ ) {

		const a = i / 3 * Math.PI * 2;
		parts.rod( STEEL(), [ hx + 0.18, axis + Math.cos( a ) * 0.1, Math.sin( a ) * 0.1 ], [ hx + 0.18, axis + Math.cos( a ) * 0.16, Math.sin( a ) * 0.16 ], 0.012, 5 );

	}

	// Carriage rails and the carriage, the die head on it and the cutter and reamer swung up.
	const rx0 = ox - 0.42;
	const rx1 = hx - 0.21;
	for ( const z of [ - 0.13, 0.13 ] ) parts.rod( BRIGHT(), [ rx0, top + 0.16, z ], [ rx1, top + 0.16, z ], 0.019, 8 );
	const cx = ox - 0.18;
	parts.box( red, [ 0.14, 0.08, 0.36 ], [ cx, top + 0.12, 0 ] );
	parts.box( DARK(), [ 0.12, 0.24, 0.24 ], [ cx, axis - 0.12, 0 ] );
	parts.rod( STEEL(), [ cx + 0.07, axis + 0.16, - 0.1 ], [ cx + 0.07, axis + 0.3, - 0.05 ], 0.02, 6 );
	parts.box( DARK(), [ 0.06, 0.12, 0.12 ], [ cx + 0.1, axis + 0.12, 0.1 ] );
	// The carriage handwheel on the front.
	parts.rod( STEEL(), [ cx, top + 0.15, - 0.18 ], [ cx, top + 0.15, - 0.24 ], 0.012, 6 );
	parts.rod( BLACK(), [ cx, top + 0.15, - 0.24 ], [ cx, top + 0.15, - 0.26 ], 0.11, 18 );

	// The pipe, from the die head through the chuck out to the stand, and the stand.
	const end = ox + 2.6;
	parts.rod( pipe, [ cx - 0.03, axis, 0 ], [ end, axis, 0 ], 2.375 * IN / 2, 12 );
	parts.rod( BRIGHT(), [ cx - 0.03, axis, 0 ], [ cx + 0.02, axis, 0 ], 2.375 * IN / 2 + 0.001, 12 );
	const stand = ox + 2.3;
	const vy = axis - 2.375 * IN / 2;
	for ( let i = 0; i < 3; i ++ ) {

		const a = i / 3 * Math.PI * 2 + Math.PI / 6;
		parts.rod( DARK(), [ stand + Math.cos( a ) * 0.4, 0.012, Math.sin( a ) * 0.4 ], [ stand, vy - 0.18, 0 ], 0.012, 6 );

	}

	parts.rod( DARK(), [ stand, vy - 0.2, 0 ], [ stand, vy - 0.04, 0 ], 0.02, 8 );
	for ( const s of [ - 1, 1 ] ) parts.block( DARK(), [ 0.04, 0.012, 0.12 ], [ stand, vy - 0.02, s * 0.04 ], [ s * 0.6, 0, 0 ] );

	// Foot switch on the floor in front, its cord to the head.
	const fz = - 0.65;
	parts.box( DARK(), [ 0.22, 0.05, 0.28 ], [ ox + 0.1, 0, fz ] );
	parts.box( red, [ 0.24, 0.12, 0.04 ], [ ox + 0.1, 0, fz + 0.12 ] );
	parts.path( BLACK(), [ [ ox + 0.1, 0.03, fz + 0.15 ], [ ox + 0.2, 0.01, - 0.3 ], [ hx, 0.01, - 0.15 ], [ hx, top + 0.15, - 0.18 ] ], 0.006, 5 );
	return parts.build();

}

// --- switchgear --------------------------------------------------------------------------------

// A 2,000 A low-voltage switchgear lineup as delivered: four 36 in sections, 90 in high and 60 in
// deep, in two shipping splits of two sections, each on a timber skid with a plywood cap over the
// top, corner boards and stretch wrap round it, a lifting angle bolted along the top front and
// back with its eyes up through the cap. The breaker doors, the main's handle and the metering
// panel show through the wrap.
function switchgear() {

	const parts = new Parts();
	const grey = mat( 0xb7bbb8, { roughness: 0.55, metalness: 0.2 } );
	const seam = mat( 0x6f7471, { roughness: 0.6, metalness: 0.2 } );
	const wrap = mat( 0xdfe7ee, { roughness: 0.35, transparent: true, opacity: 0.35, depthWrite: false } );
	const wood = TIMBER();
	const ply = mat( 0xc7a274, { roughness: 0.9 } );
	const section = 36 * IN;
	const W = 2 * section;
	const D = 60 * IN;
	const H = 90 * IN;
	const skid = 5.5 * IN;

	for ( const sx of [ - W / 2 - 0.1, W / 2 + 0.1 ] ) {

		// The skid: three runners along the split and boards across their ends.
		for ( const z of [ - D / 2 + 0.1, 0, D / 2 - 0.1 ] ) parts.box( wood, [ W + 0.12, 3.5 * IN, 3.5 * IN ], [ sx, 0, z ] );
		for ( const x of [ - W / 2, W / 2 ] ) parts.box( wood, [ 3.5 * IN, 2 * IN, D + 0.1 ], [ sx + x, 3.5 * IN, 0 ] );

		// The gear: two sections, each with its doors on the front.
		parts.box( grey, [ W, H, D ], [ sx, skid, 0 ] );
		parts.box( seam, [ W + 0.01, 0.1, D + 0.01 ], [ sx, skid, 0 ] );
		for ( let i = 0; i < 2; i ++ ) {

			const x = sx - W / 2 + section * ( i + 0.5 );
			parts.box( seam, [ 0.01, H, 0.004 ], [ sx - W / 2 + section * i, skid, - D / 2 - 0.002 ] );
			// The left section the main: one tall breaker door with its handle, metering above;
			// the right one feeders: three breaker doors.
			const doors = i === 0 ? [ [ 0.15, 0.62 ], [ 0.62, 0.95 ] ] : [ [ 0.1, 0.38 ], [ 0.38, 0.66 ], [ 0.66, 0.95 ] ];
			for ( const [ a, b ] of doors ) {

				const y0 = skid + a * H + 0.01;
				const h = ( b - a ) * H - 0.02;
				parts.box( grey, [ section - 0.06, h, 0.012 ], [ x, y0, - D / 2 - 0.006 ] );
				parts.box( DARK(), [ 0.04, 0.12, 0.03 ], [ x + section / 2 - 0.1, y0 + h / 2 - 0.06, - D / 2 - 0.02 ] );

			}

			if ( i === 0 ) {

				parts.box( BLACK(), [ 0.18, 0.12, 0.012 ], [ x - 0.1, skid + 0.85 * H, - D / 2 - 0.012 ] );
				parts.box( mat( 0xb3221c, { roughness: 0.5 } ), [ 0.1, 0.2, 0.05 ], [ x, skid + 0.36 * H, - D / 2 - 0.03 ] );

			}

		}

		// Lifting angles along the top, front and back, with their eyes, and the plywood cap.
		for ( const z of [ - D / 2 + 0.1, D / 2 - 0.1 ] ) {

			parts.box( DARK(), [ W + 0.1, 0.08, 0.08 ], [ sx, skid + H, z ] );
			for ( const x of [ - W / 2 + 0.1, W / 2 - 0.1 ] ) parts.box( DARK(), [ 0.025, 0.2, 0.12 ], [ sx + x, skid + H + 0.08, z ] );

		}

		parts.box( ply, [ W + 0.06, 0.02, D + 0.06 ], [ sx, skid + H + 0.08, 0 ] );
		for ( const x of [ - W / 2 - 0.015, W / 2 + 0.015 ] ) for ( const z of [ - D / 2 - 0.015, D / 2 + 0.015 ] ) parts.box( ply, [ 0.08, H - 0.2, 0.08 ], [ sx + x, skid + 0.1, z ] );
		parts.box( wrap, [ W + 0.1, H - 0.05, D + 0.1 ], [ sx, skid + 0.05, 0 ] );

	}

	return parts.build();

}

// --- rooftop unit ------------------------------------------------------------------------------

// A 25 ton packaged rooftop unit, 16 ft long, 7 ft wide and 5 ft high on its base rails, set on
// three 4 × 6 timbers waiting for the crane: the access doors and the electrical disconnect along
// the front, the economizer hood on the left end, the condenser section on the right with coil
// guards round it and two fans on top, and the lifting lugs at the corners of the base rail.
function rooftopUnit() {

	const parts = new Parts();
	const cabinet = mat( 0xd9d5c8, { roughness: 0.55, metalness: 0.2 } );
	const trim = mat( 0xb8b4a7, { roughness: 0.55, metalness: 0.2 } );
	const coil = finned( 'rtu coil guard', '#8d918f', 40, true );
	const hood = finned( 'rtu hood louvres', '#c9c5b8', 14, false );
	const L = 16 * FT;
	const D = 7 * FT;
	const H = 5 * FT;
	const sleeper = 5.5 * IN;
	const rail = 0.12;

	for ( const x of [ - L / 2 + 0.35, 0, L / 2 - 0.35 ] ) parts.box( TIMBER(), [ 3.5 * IN, sleeper, D + 0.3 ], [ x, 0, 0 ] );
	const y0 = sleeper;
	parts.box( DARK(), [ L, rail, D ], [ 0, y0, 0 ] );
	for ( const x of [ - L / 2 + 0.25, L / 2 - 0.25 ] ) {

		for ( const s of [ - 1, 1 ] ) {

			parts.box( DARK(), [ 0.1, 0.12, 0.06 ], [ x, y0, s * ( D / 2 + 0.03 ) ] );
			parts.rod( BLACK(), [ x, y0 + 0.06, s * ( D / 2 + 0.002 ) ], [ x, y0 + 0.06, s * ( D / 2 + 0.061 ) ], 0.025, 8 );

		}

	}

	// The cabinet: the air handling end, and the condenser end with coil guards round it.
	const split = L / 2 - 1.5;
	const top = y0 + H;
	parts.box( cabinet, [ split + L / 2, H - rail, D ], [ ( split - L / 2 ) / 2, y0 + rail, 0 ] );
	parts.box( cabinet, [ L / 2 - split, H - rail, D ], [ ( split + L / 2 ) / 2, y0 + rail, 0 ] );
	const cw = L / 2 - split - 0.12;
	const cx = ( split + L / 2 ) / 2;
	for ( const s of [ - 1, 1 ] ) parts.box( coil, [ cw, H - rail - 0.2, 0.01 ], [ cx, y0 + rail + 0.08, s * ( D / 2 + 0.005 ) ] );
	parts.box( coil, [ 0.01, H - rail - 0.2, D - 0.15 ], [ L / 2 + 0.005, y0 + rail + 0.08, 0 ] );
	for ( const z of [ - D / 4, D / 4 ] ) fan( parts, trim, [ cx, top, z ], 0.36 );

	// Access doors along the front with their hinges and latch handles, and the disconnect.
	const doors = [ [ - 2.25, 0.7 ], [ - 1.5, 0.7 ], [ - 0.6, 1.0 ], [ 0.35, 0.8 ] ];
	for ( const [ x, w ] of doors ) {

		parts.box( trim, [ w - 0.03, H - rail - 0.2, 0.01 ], [ x, y0 + rail + 0.1, - D / 2 - 0.005 ] );
		parts.box( DARK(), [ 0.03, 0.12, 0.03 ], [ x + w / 2 - 0.08, y0 + H / 2, - D / 2 - 0.02 ] );

	}

	parts.box( mat( 0x8e9294, { roughness: 0.5, metalness: 0.4 } ), [ 0.25, 0.35, 0.12 ], [ 1.15, y0 + H * 0.45, - D / 2 - 0.06 ] );
	parts.box( BLACK(), [ 0.04, 0.12, 0.05 ], [ 1.28, y0 + H * 0.55, - D / 2 - 0.1 ] );

	// The economizer hood on the left end: a wedge from the top of the end wall sloping down and
	// out, open underneath behind a louvred screen.
	const hx = - L / 2;
	const hy0 = y0 + 0.55;
	const hy1 = top - 0.1;
	const out = 0.45;
	parts.add( cabinet, extruded( [ [ hx, hy1 ], [ hx, hy0 ], [ hx - out, hy0 ] ], D - 0.3 ) );
	parts.box( hood, [ out - 0.02, 0.01, D - 0.32 ], [ hx - out / 2, hy0 - 0.01, 0 ] );
	parts.box( trim, [ 0.03, hy1 - hy0 + 0.04, D - 0.26 ], [ hx - 0.015, hy0 - 0.02, 0 ] );

	// Seams on the roof and its curb flange line.
	for ( const x of [ - 1.6, - 0.4, split ] ) parts.box( trim, [ 0.03, 0.012, D ], [ x, top, 0 ] );
	return parts.build();

}

// --- air-cooled chiller ------------------------------------------------------------------------

// A 150 ton air-cooled screw chiller, 30 ft long, 7.5 ft wide and 8 ft high on its base rails:
// the control panel and disconnect on the front end, the compressors and evaporator behind louvred
// panels low down, V coils along both sides above with posts between the bays, two rows of six
// condenser fans on top, and the chilled water connections with flanges out of the back end.
function chiller() {

	const parts = new Parts();
	const cabinet = mat( 0xd4d6d2, { roughness: 0.5, metalness: 0.25 } );
	const coil = finned( 'chiller coil', '#5e6a66', 140, true );
	const louvre = finned( 'chiller louvres', '#b9bcb8', 18, false );
	const L = 30 * FT;
	const W = 7.5 * FT;
	const H = 8 * FT;
	const base = 0.22;
	const low = 1.15;
	const deck = H - 0.16;

	// Base rails and cross members, with lifting holes in the rails.
	for ( const x of [ - W / 2 + 0.08, W / 2 - 0.08 ] ) parts.box( DARK(), [ 0.16, base, L ], [ x, 0, 0 ] );
	for ( let i = 0; i <= 6; i ++ ) parts.box( DARK(), [ W - 0.2, 0.12, 0.1 ], [ 0, base - 0.12, - L / 2 + 0.05 + i * ( L - 0.1 ) / 6 ] );
	for ( let i = 0; i < 4; i ++ ) for ( const s of [ - 1, 1 ] ) parts.rod( BLACK(), [ s * ( W / 2 + 0.002 ), base / 2, - L / 2 + 0.6 + i * ( L - 1.2 ) / 3 ], [ s * ( W / 2 - 0.05 ), base / 2, - L / 2 + 0.6 + i * ( L - 1.2 ) / 3 ], 0.045, 10 );

	// The lower machinery section behind louvres, the panel on the front end.
	parts.box( DARK(), [ W - 0.1, low - base, L - 0.1 ], [ 0, base, 0 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( louvre, [ 0.01, low - base - 0.1, L - 0.3 ], [ s * ( W / 2 - 0.045 ), base + 0.05, 0 ] );
	const panelZ = - L / 2;
	parts.box( cabinet, [ W - 0.15, 1.65, 0.45 ], [ 0, base, panelZ + 0.2 ] );
	for ( const x of [ - 0.5, 0.5 ] ) {

		parts.box( cabinet, [ 0.95, 1.55, 0.012 ], [ x, base + 0.05, panelZ - 0.03 ] );
		parts.box( DARK(), [ 0.04, 0.15, 0.04 ], [ x + 0.38, base + 0.8, panelZ - 0.05 ] );

	}

	parts.box( BLACK(), [ 0.2, 0.14, 0.01 ], [ - 0.5, base + 1.3, panelZ - 0.04 ] );
	parts.box( mat( 0xb3221c, { roughness: 0.5 } ), [ 0.08, 0.22, 0.06 ], [ 0.75, base + 1.1, panelZ - 0.06 ] );

	// The coil section: sloping coils along each side between posts, the ends closed.
	const bays = 6;
	const lean = 0.18;
	const coilH = deck - low;
	const tilt = Math.atan2( lean, coilH );
	for ( const s of [ - 1, 1 ] ) {

		parts.block( coil, [ 0.05, coilH / Math.cos( tilt ), L - 0.5 ], [ s * ( W / 2 - lean / 2 - 0.03 ), low + coilH / 2, 0.15 ], [ 0, 0, - s * tilt ] );
		for ( let i = 0; i <= bays; i ++ ) {

			const z = - L / 2 + 0.4 + i * ( L - 0.5 ) / bays;
			member( parts, cabinet, [ 0.08, 0.08 ], [ s * ( W / 2 - lean - 0.03 ), low, z ], [ s * ( W / 2 - 0.03 ), deck, z ] );

		}

	}

	parts.box( DARK(), [ W - 0.5, coilH, L - 0.6 ], [ 0, low, 0.15 ] );
	for ( const z of [ - L / 2 + 0.42, L / 2 - 0.08 ] ) parts.box( cabinet, [ W - 0.06, coilH, 0.04 ], [ 0, low, z ] );
	parts.box( louvre, [ W - 0.12, low - base - 0.1, 0.01 ], [ 0, base + 0.05, L / 2 - 0.045 ] );
	parts.box( cabinet, [ W - 0.06, 0.06, L - 0.4 ], [ 0, low - 0.03, 0.15 ] );

	// The fan deck and two rows of six fans.
	parts.box( cabinet, [ W, 0.06, L - 0.4 ], [ 0, deck - 0.06, 0.15 ] );
	for ( let i = 0; i < bays; i ++ ) {

		const z = - L / 2 + 0.4 + ( i + 0.5 ) * ( L - 0.5 ) / bays;
		for ( const x of [ - W / 4, W / 4 ] ) fan( parts, cabinet, [ x, deck, z ], 0.5 );

	}

	// Chilled water supply and return out of the back end, flanged.
	for ( const x of [ - 0.35, 0.35 ] ) {

		parts.rod( mat( 0x2f5f9a, { roughness: 0.5, metalness: 0.3 } ), [ x, 0.75, L / 2 - 0.2 ], [ x, 0.75, L / 2 + 0.05 ], 3.3 * IN, 14 );
		parts.rod( STEEL(), [ x, 0.75, L / 2 + 0.03 ], [ x, 0.75, L / 2 + 0.07 ], 5.5 * IN, 16 );

	}

	return parts.build();

}

// --- dust wall ---------------------------------------------------------------------------------

// A dust containment wall 20 ft long and 10 ft high (floor to ceiling): four spring-loaded poles
// 5 ft apart (2½ ft from each end, so a row of runs keeps the spacing), each on a foot with a head
// plate at the ceiling, clear 6 mil poly clamped under the plates and taped to the floor, and a
// zipper door: two zips 7 ft high either side of the middle, on the front.
function dustWall() {

	const parts = new Parts();
	const poly = mat( 0xe6ecef, { roughness: 0.3, transparent: true, opacity: 0.3, side: DoubleSide, depthWrite: false } );
	const pole = mat( 0x9ea3a7, { roughness: 0.4, metalness: 0.6 } );
	const head = mat( 0xe0a020, { roughness: 0.6 } );
	const tape = mat( 0x2f6fd0, { roughness: 0.6 } );
	const L = 20 * FT;
	const H = 10 * FT;

	parts.box( poly, [ L, H - 0.02, 0.002 ], [ 0, 0.005, 0 ] );
	parts.box( tape, [ L, 0.05, 0.004 ], [ 0, 0, - 0.003 ] );
	for ( const x of [ - 7.5, - 2.5, 2.5, 7.5 ] ) {

		const px = x * FT;
		parts.cylinder( BLACK(), 0.05, 0.03, [ px, 0, 0.04 ], 12 );
		parts.cylinder( pole, 0.016, 1.7, [ px, 0.03, 0.04 ], 8 );
		parts.cylinder( pole, 0.012, H - 1.75 - 0.02, [ px, 1.73, 0.04 ], 8 );
		parts.cylinder( DARK(), 0.022, 0.14, [ px, 1.62, 0.04 ], 8 );
		parts.box( head, [ 0.12, 0.02, 0.26 ], [ px, H - 0.02, 0.0 ] );

	}

	// The door: two white adhesive zipper strips stuck on the poly, each with the dark slit of the
	// zip down its middle and a pull near the top, a strip of tape across the head of the opening
	// between them, and the panel between them a touch more frosted so it reads as a doorway.
	const zipTape = mat( 0xf4f4f0, { roughness: 0.7 } );
	parts.box( mat( 0xf2f6f8, { roughness: 0.3, transparent: true, opacity: 0.35, side: DoubleSide, depthWrite: false } ), [ 0.86, 2.1, 0.002 ], [ 0, 0.07, 0.008 ] );
	for ( const x of [ - 0.45, 0.45 ] ) {

		parts.box( zipTape, [ 0.07, 2.13, 0.004 ], [ x, 0.06, - 0.004 ] );
		parts.box( BLACK(), [ 0.008, 2.07, 0.002 ], [ x, 0.09, - 0.007 ] );
		parts.box( DARK(), [ 0.025, 0.06, 0.012 ], [ x, 1.95, - 0.012 ] );

	}

	parts.box( zipTape, [ 0.97, 0.07, 0.004 ], [ 0, 2.12, - 0.004 ] );

	return parts.build();

}

// --- negative air machine ----------------------------------------------------------------------

// A 2,000 CFM HEPA negative air machine, a steel cabinet about 24 in wide, 38 in long and 30 in
// high on two wheels and a pair of feet: the prefilter grille on the front, the control panel
// (switch, speed knob, filter gauge and lamps) on top, the push handle and 12 in exhaust collar at
// the back, and the lay-flat duct off the collar running about 13 ft back along the floor,
// blown round by the machine.
function negativeAir() {

	const parts = new Parts();
	const body = paint( 0xd6d3c9 );
	const grille = finned( 'nam prefilter', '#4a4d50', 16, false );
	const duct = mat( 0xeeeeea, { roughness: 0.6, side: DoubleSide } );
	const W = 24 * IN;
	const L = 38 * IN;
	const H = 30 * IN;
	const y0 = 0.1;
	const z1 = L / 2;

	// Wheels at the back, feet at the front.
	for ( const s of [ - 1, 1 ] ) {

		parts.rod( RUBBER(), [ s * ( W / 2 + 0.01 ), 0.1, z1 - 0.15 ], [ s * ( W / 2 + 0.06 ), 0.1, z1 - 0.15 ], 0.1, 16 );
		parts.box( DARK(), [ 0.05, y0, 0.06 ], [ s * ( W / 2 - 0.06 ), 0, - L / 2 + 0.08 ] );

	}

	parts.rod( STEEL(), [ - W / 2 - 0.06, 0.1, z1 - 0.15 ], [ W / 2 + 0.06, 0.1, z1 - 0.15 ], 0.012, 6 );

	// Cabinet, the grille in front, the panel on top.
	parts.box( body, [ W, H, L ], [ 0, y0, 0 ] );
	parts.box( grille, [ W - 0.08, H - 0.1, 0.01 ], [ 0, y0 + 0.05, - L / 2 - 0.005 ] );
	parts.box( DARK(), [ W - 0.12, 0.012, 0.25 ], [ 0, y0 + H, - L / 2 + 0.2 ] );
	parts.cylinder( mat( 0xf2f2ee, { roughness: 0.4 } ), 0.045, 0.02, [ - 0.12, y0 + H + 0.012, - L / 2 + 0.2 ], 16 );
	parts.cylinder( BLACK(), 0.025, 0.03, [ 0.03, y0 + H + 0.012, - L / 2 + 0.2 ], 10 );
	parts.box( mat( 0xb3221c, { roughness: 0.5 } ), [ 0.04, 0.025, 0.05 ], [ 0.15, y0 + H + 0.012, - L / 2 + 0.2 ] );
	parts.sphere( mat( 0x37c84a, { roughness: 0.3, emissive: 0x1d7a28, emissiveIntensity: 0.6 } ), 0.012, [ 0.15, y0 + H + 0.02, - L / 2 + 0.28 ] );

	// Handle at the back.
	for ( const s of [ - 1, 1 ] ) parts.rod( DARK(), [ s * ( W / 2 - 0.04 ), y0 + H - 0.05, z1 ], [ s * ( W / 2 - 0.04 ), y0 + H + 0.32, z1 + 0.06 ], 0.014, 8 );
	parts.rod( DARK(), [ - W / 2 + 0.04, y0 + H + 0.32, z1 + 0.06 ], [ W / 2 - 0.04, y0 + H + 0.32, z1 + 0.06 ], 0.014, 8 );

	// The collar and the duct, curving down to the floor and away.
	const r = 6 * IN;
	const cy = y0 + 0.35;
	parts.rod( STEEL(), [ 0, cy, z1 ], [ 0, cy, z1 + 0.1 ], r + 0.005, 18 );
	const points = [ [ 0, cy, z1 + 0.08 ], [ 0, cy - 0.03, z1 + 0.35 ], [ 0.03, r + 0.03, z1 + 0.75 ], [ 0.12, r, z1 + 1.4 ], [ 0.25, r, z1 + 2.6 ], [ 0.2, r, z1 + 4.0 ] ];
	parts.path( duct, points, r, 18 );
	return parts.build();

}

// --- decon trailer -----------------------------------------------------------------------------

// A three-stage decontamination unit on a tandem-axle trailer, an 8 × 20 ft box: the clean (change)
// room, shower and equipment room in a line inside, a door at each end room on the right side with
// steel steps up to it, the warning sign at the equipment room door, a roof air conditioner and
// water heater flue, small frosted windows, corner jacks set down, and the A-frame tongue on a jack.
function deconTrailer() {

	const parts = new Parts();
	const white = mat( 0xeceeec, { roughness: 0.5, metalness: 0.15 } );
	const trim = mat( 0xb9bdbf, { roughness: 0.45, metalness: 0.5 } );
	const frost = mat( 0xc9d3d8, { roughness: 0.25, metalness: 0.2 } );
	const L = 20 * FT;
	const W = 8 * FT;
	const floor = 0.78;
	const H = 7.5 * FT;
	const top = floor + H;

	// Chassis, tongue and jack.
	for ( const x of [ - 0.9, 0.9 ] ) parts.box( DARK(), [ 0.1, 0.15, L ], [ x, floor - 0.2, 0 ] );
	for ( const x of [ - 0.9, 0.9 ] ) parts.rod( DARK(), [ x, floor - 0.12, - L / 2 ], [ 0, floor - 0.12, - L / 2 - 1.5 ], 0.05, 6 );
	parts.box( DARK(), [ 0.15, 0.12, 0.3 ], [ 0, floor - 0.2, - L / 2 - 1.55 ] );
	parts.rod( DARK(), [ 0.25, 0, - L / 2 - 1.1 ], [ 0.25, floor, - L / 2 - 1.1 ], 0.04, 8 );
	parts.box( DARK(), [ 0.15, 0.02, 0.15 ], [ 0.25, 0, - L / 2 - 1.1 ] );

	// Wheels, axles and fenders on the tandem.
	for ( const z of [ 0.35, 1.25 ] ) {

		for ( const s of [ - 1, 1 ] ) tyre( parts, 0.36, 0.22, [ s * 1.02, z ] );
		parts.rod( DARK(), [ - 1.0, 0.36, z ], [ 1.0, 0.36, z ], 0.04, 8 );

	}

	for ( const s of [ - 1, 1 ] ) parts.box( trim, [ 0.3, 0.02, 1.9 ], [ s * 1.08, floor - 0.04, 0.8 ] );

	// Corner jacks.
	for ( const x of [ - 0.9, 0.9 ] ) for ( const z of [ - L / 2 + 0.3, L / 2 - 0.3 ] ) {

		parts.box( DARK(), [ 0.08, floor - 0.2, 0.08 ], [ x, 0.02, z ] );
		parts.box( DARK(), [ 0.2, 0.02, 0.2 ], [ x, 0, z ] );

	}

	// The box, its trim and roof, the AC and flue.
	parts.box( white, [ W, H, L ], [ 0, floor, 0 ] );
	parts.box( trim, [ W + 0.02, 0.06, L + 0.02 ], [ 0, floor, 0 ] );
	parts.box( trim, [ W + 0.02, 0.07, L + 0.02 ], [ 0, top - 0.06, 0 ] );
	for ( const x of [ - W / 2, W / 2 ] ) for ( const z of [ - L / 2, L / 2 ] ) parts.box( trim, [ 0.05, H, 0.05 ], [ x, floor, z ] );
	parts.box( white, [ 0.75, 0.3, 1.0 ], [ 0, top, - 1.4 ] );
	parts.box( DARK(), [ 0.6, 0.12, 0.02 ], [ 0, top + 0.08, - 1.91 ] );
	parts.rod( STEEL(), [ 0.5, top, 1.2 ], [ 0.5, top + 0.45, 1.2 ], 0.06, 10 );
	parts.cylinder( STEEL(), 0.1, 0.06, [ 0.5, top + 0.45, 1.2 ], 10 );

	// Doors and steps on the right side: the clean room at the front, the equipment room at the back.
	const doorW = 0.8;
	const doorH = 1.95;
	for ( const z of [ - L / 2 + 0.9, L / 2 - 0.9 ] ) {

		parts.box( trim, [ 0.03, doorH + 0.06, doorW + 0.06 ], [ W / 2 + 0.01, floor + 0.08, z ] );
		parts.box( white, [ 0.03, doorH, doorW ], [ W / 2 + 0.02, floor + 0.11, z ] );
		parts.box( DARK(), [ 0.05, 0.03, 0.1 ], [ W / 2 + 0.045, floor + 1.05, z + doorW / 2 - 0.1 ] );
		// Steps: three treads up to a landing, a handrail on the open side.
		const sx = W / 2 + 0.05;
		parts.box( GALV(), [ 0.9, 0.04, 1.0 ], [ sx + 0.45, floor - 0.04, z ] );
		for ( let i = 0; i < 3; i ++ ) parts.box( GALV(), [ 0.25, 0.03, 1.0 ], [ sx + 1.0 + i * 0.25, floor - 0.04 - ( i + 1 ) * floor / 4, z ] );
		for ( const dz of [ - 0.5, 0.5 ] ) parts.rod( GALV(), [ sx + 0.9, floor, z + dz ], [ sx + 1.75, 0.025, z + dz ], 0.025, 6 );
		for ( const dz of [ - 0.5, 0.5 ] ) parts.rod( GALV(), [ sx + 0.85, 0.025, z + dz ], [ sx + 0.85, floor, z + dz ], 0.025, 6 );
		const rz = z + 0.52;
		parts.path( GALV(), [ [ sx + 1.75, 0.02, rz ], [ sx + 1.75, 0.9, rz ], [ sx + 0.9, floor + 0.9, rz ], [ sx + 0.05, floor + 0.9, rz ], [ sx + 0.05, floor, rz ] ], 0.02, 6 );

	}

	// Windows and the signs.
	for ( const x of [ - W / 2 - 0.005, W / 2 + 0.005 ] ) for ( const z of [ - 1.3, 1.3 ] ) parts.box( frost, [ 0.02, 0.3, 0.5 ], [ x, floor + 1.75, z ] );
	sign( parts, deconLettering(), [ 2.6, 0.43 ], [ W / 2 + 0.008, floor + 1.1, 0 ], Math.PI / 2 );
	sign( parts, deconLettering(), [ 2.6, 0.43 ], [ - W / 2 - 0.008, floor + 1.1, 0 ], - Math.PI / 2 );
	sign( parts, dangerSign(), [ 0.5, 0.36 ], [ W / 2 + 0.04, floor + 1.5, L / 2 - 0.9 ], Math.PI / 2 );
	sign( parts, roomLabel( 'CLEAN ROOM' ), [ 0.8, 0.14 ], [ W / 2 + 0.01, floor + doorH + 0.25, - L / 2 + 0.9 ], Math.PI / 2 );
	sign( parts, roomLabel( 'EQUIPMENT ROOM' ), [ 0.8, 0.14 ], [ W / 2 + 0.01, floor + doorH + 0.25, L / 2 - 0.9 ], Math.PI / 2 );
	return parts.build();

}

function deconLettering() {

	return drawn( 'decon lettering', [ 1024, 170 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#eceeec';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#1d4f9a';
		ctx.fillRect( 0, h - 26, w, 14 );
		ctx.font = 'bold 96px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText( 'DECONTAMINATION UNIT', w / 2, h / 2 - 12, w * 0.95 );

	} );

}

function dangerSign() {

	return drawn( 'decon danger sign', [ 360, 260 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#ffffff';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#c8102e';
		ctx.fillRect( 10, 10, w - 20, 64 );
		ctx.fillStyle = '#ffffff';
		ctx.font = 'bold 50px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText( 'DANGER', w / 2, 44 );
		ctx.fillStyle = '#111111';
		const lines = [ [ 'bold 26px sans-serif', 'ASBESTOS' ], [ '19px sans-serif', 'MAY CAUSE CANCER' ], [ '19px sans-serif', 'CAUSES DAMAGE TO LUNGS' ], [ 'bold 17px sans-serif', 'AUTHORIZED PERSONNEL ONLY' ], [ '15px sans-serif', 'RESPIRATORS AND PROTECTIVE' ], [ '15px sans-serif', 'CLOTHING REQUIRED IN THIS AREA' ] ];
		lines.forEach( ( [ font, text ], i ) => {

			ctx.font = font;
			ctx.fillText( text, w / 2, 100 + i * 27, w - 24 );

		} );

	} );

}

function roomLabel( text ) {

	return drawn( `decon label ${ text }`, [ 400, 70 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#1d4f9a';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#ffffff';
		ctx.font = 'bold 40px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText( text, w / 2, h / 2 + 2, w - 20 );

	} );

}

// --- demolition robot --------------------------------------------------------------------------

// A remote-controlled demolition robot of the Brokk 300 class (about 3.3 t, 0.78 m wide on its
// tracks): the tracked undercarriage, the slewing upper body with its motor cover and grilles,
// four outriggers set down on pads, the three-part arm (boom up, arm out, the third arm down) with
// a hydraulic breaker on the floor in front, and its power cable trailing behind. No cab: the
// operator walks beside it with the remote.
function demolitionRobot() {

	const parts = new Parts();
	const orange = paint( 0xd8551c );
	const grille = finned( 'robot grille', '#2c2e31', 12, false );

	tracks( parts, { length: 1.75, width: 0.78, shoe: 0.2, height: 0.36 }, 0, 0.1 );
	parts.cylinder( BLACK(), 0.3, 0.1, [ 0, 0.36, 0.1 ], 20 );

	// The upper body and its cover, with grilles each side and the oil cooler at the back.
	const y0 = 0.46;
	parts.box( orange, [ 0.76, 0.42, 1.3 ], [ 0, y0, 0.25 ] );
	parts.box( orange, [ 0.7, 0.16, 0.9 ], [ 0, y0 + 0.42, 0.4 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( grille, [ 0.01, 0.26, 0.55 ], [ s * 0.385, y0 + 0.08, 0.5 ] );
	parts.box( grille, [ 0.6, 0.3, 0.01 ], [ 0, y0 + 0.08, 0.905 ] );
	parts.box( DARK(), [ 0.3, 0.2, 0.3 ], [ 0.2, y0 + 0.42, - 0.2 ] );
	parts.sphere( mat( 0xff9a1a, { roughness: 0.3, emissive: 0xc76a00, emissiveIntensity: 0.6 } ), 0.04, [ - 0.25, y0 + 0.6, 0.75 ] );

	// Outriggers: an arm out from each corner, down on a pad, its ram above.
	for ( const sx of [ - 1, 1 ] ) {

		for ( const [ z, out ] of [ [ - 0.32, - 0.55 ], [ 0.82, 0.5 ] ] ) {

			const pivot = new Vector3( sx * 0.36, y0 + 0.2, z );
			const pad = new Vector3( sx * 1.05, 0.06, z + out );
			member( parts, orange, [ 0.1, 0.12 ], pivot, pad );
			parts.box( DARK(), [ 0.26, 0.05, 0.26 ], [ pad.x, 0, pad.z ] );
			ram( parts, 0.035, [ sx * 0.3, y0 + 0.5, z + Math.sign( out ) * 0.05 ], pivot.clone().lerp( pad, 0.55 ).add( new Vector3( 0, 0.07, 0 ) ) );

		}

	}

	// The arm system: boom, arm two, arm three, a ram for each, and the breaker on the floor.
	const p0 = new Vector3( 0, y0 + 0.4, - 0.42 );
	const p1 = p0.clone().addScaledVector( ahead( 52 ), 1.55 );
	const p2 = p1.clone().addScaledVector( ahead( - 8 ), 1.45 );
	const p3 = p2.clone().addScaledVector( ahead( - 68 ), 1.05 );
	member( parts, orange, [ 0.26, 0.3 ], p0, p1 );
	member( parts, orange, [ 0.22, 0.26 ], p1, p2 );
	member( parts, orange, [ 0.18, 0.2 ], p2, p3 );
	for ( const p of [ p0, p1, p2, p3 ] ) parts.rod( STEEL(), [ - 0.17, p.y, p.z ], [ 0.17, p.y, p.z ], 0.04, 8 );
	for ( const s of [ - 1, 1 ] ) ram( parts, 0.05, [ s * 0.18, y0 + 0.15, - 0.5 ], p0.clone().lerp( p1, 0.55 ).add( new Vector3( s * 0.18, 0, 0 ) ) );
	ram( parts, 0.045, p0.clone().lerp( p1, 0.5 ).add( new Vector3( 0, 0.2, 0.05 ) ), p1.clone().lerp( p2, 0.3 ).add( new Vector3( 0, 0.17, 0 ) ) );
	ram( parts, 0.04, p1.clone().lerp( p2, 0.55 ).add( new Vector3( 0, 0.16, 0 ) ), p2.clone().lerp( p3, 0.4 ).add( new Vector3( 0, 0, - 0.14 ) ) );

	const length = p3.y - 0.02;
	parts.block( DARK(), [ 0.22, 0.2, 0.25 ], [ p3.x, p3.y - 0.08, p3.z ], [ 0, 0, 0 ] );
	parts.box( mat( 0x1f3f75, { roughness: 0.5, metalness: 0.2 } ), [ 0.2, length - 0.45, 0.22 ], [ p3.x, 0.3, p3.z ] );
	parts.rod( STEEL(), [ p3.x, 0.3, p3.z ], [ p3.x, 0.06, p3.z ], 0.04, 8 );
	parts.rod( STEEL(), [ p3.x, 0.06, p3.z ], [ p3.x, 0, p3.z ], [ 0.04, 0.01 ], 8 );
	parts.path( BLACK(), [ p0.clone().add( new Vector3( 0.1, 0.25, 0.1 ) ).toArray(), p1.clone().add( new Vector3( 0.1, 0.2, 0 ) ).toArray(), p2.clone().add( new Vector3( 0.1, 0.15, 0 ) ).toArray(), [ p3.x + 0.1, p3.y - 0.2, p3.z + 0.12 ] ], 0.02, 5 );

	// Its power cable out of the back and along the floor.
	parts.path( mat( 0xe08a1a, { roughness: 0.6 } ), [ [ - 0.2, y0 + 0.25, 0.9 ], [ - 0.2, 0.15, 1.15 ], [ - 0.3, 0.02, 1.5 ], [ - 0.7, 0.02, 2.3 ] ], 0.022, 8 );
	return parts.build();

}

// --- demolition excavators ---------------------------------------------------------------------

// A demolition excavator's cab: the cab of `size` at `at` with a guard of bars over its windscreen
// and roof (falling-object protection).
function guardedCab( parts, body, size, at ) {

	cab( parts, size, at, body );
	const [ w, h, l ] = size;
	const [ x, y, z ] = at;
	const zf = z - l / 2 - 0.08;
	const bars = DARK();
	for ( let i = 0; i <= 4; i ++ ) parts.rod( bars, [ x - w / 2 + i * w / 4, y + h * 0.3, zf ], [ x - w / 2 + i * w / 4, y + h + 0.06, zf ], 0.02, 6 );
	for ( const yy of [ y + h * 0.3, y + h + 0.06 ] ) parts.rod( bars, [ x - w / 2, yy, zf ], [ x + w / 2, yy, zf ], 0.025, 6 );
	for ( let i = 0; i <= 4; i ++ ) parts.rod( bars, [ x - w / 2, y + h + 0.08, zf + i * ( l + 0.08 ) / 4 ], [ x + w / 2, y + h + 0.08, zf + i * ( l + 0.08 ) / 4 ], 0.02, 6 );
	for ( const xx of [ x - w / 2, x + w / 2 ] ) parts.rod( bars, [ xx, y + h + 0.08, zf ], [ xx, y + h + 0.08, z + l / 2 ], 0.025, 6 );

}

// A tool's frame at the stick's end pin: points `a` along its axis (down and forward at `angle`
// degrees below level) and `b` square to it in the side plane.
function toolFrame( end, angle ) {

	const d = ahead( - angle );
	const s = new Vector3( 0, d.z, - d.y ).negate();
	return ( a, b = 0 ) => end.clone().addScaledVector( d, a ).addScaledVector( s, b );

}

// A 30 t excavator set up for demolition and loading: the cab guard on, and a rotating sorting
// grapple on the stick in place of a bucket, its two tined shells swung open over a heap of broken
// concrete and timber in front, ready to bite.
function grappleExcavator() {

	const parts = new Parts();
	const body = YELLOW();
	carrier( parts, body, {
		track: { length: 4.65, width: 3.19, shoe: 0.6, height: 0.95 },
		swing: 1.05, width: 2.99, front: - 2.0, tail: 3.17, deck: 1.35, hood: 2.5, counterweight: 2.45,
	} );
	guardedCab( parts, body, [ 1.0, 1.7, 1.9 ], [ - 0.98, 1.35, - 1.05 ] );
	for ( const x of [ - 0.2, 0.55 ] ) parts.box( DARK(), [ 0.1, 0.9, 1.2 ], [ x, 1.35, - 1.3 ] );
	const { end } = front( parts, body, { foot: [ 0.18, 2.1, - 1.35 ], boom: [ 50, 3.0, 10, 3.2 ], stick: [ - 48, 3.0 ], section: [ 0.55, 0.8 ] } );

	// The grapple hangs straight down: the rotator, the body, and two shells opening fore and aft.
	const at = toolFrame( end, 90 );
	const steel = mat( 0x3d4144, { roughness: 0.55, metalness: 0.4 } );
	parts.rod( DARK(), at( 0.1 ).toArray(), at( 0.35 ).toArray(), 0.32, 18 );
	parts.rod( steel, at( 0.35 ).toArray(), at( 0.85 ).toArray(), 0.38, 8 );
	const open = 15 * DEG;
	for ( const s of [ - 1, 1 ] ) {

		// Each shell is drawn closed in its own (down, out) frame, then swung open about its pivot
		// at the bottom of the body.
		const shell = ( a, b ) => {

			const da = a - 0.75;
			const db = b - s * 0.1;
			return at( 0.75 + da * Math.cos( open ) - s * db * Math.sin( open ), s * 0.1 + db * Math.cos( open ) + s * da * Math.sin( open ) );

		};

		// A hooked plate seen from the side, extruded across, its tines along the tip and its ram
		// from the body down onto the back of the shell.
		const outer = [ [ 0.75, s * 0.1 ], [ 0.9, s * 0.55 ], [ 1.2, s * 0.85 ], [ 1.6, s * 0.85 ], [ 1.95, s * 0.6 ], [ 2.1, s * 0.3 ] ];
		const inner = outer.slice().reverse().map( ( [ a, b ], i ) => [ a - ( i === 0 ? 0.1 : 0.06 ), b - s * ( i === 0 ? 0.02 : 0.13 ) ] );
		const outline = [ ...outer, ...inner ].map( ( [ a, b ] ) => {

			const p = shell( a, b );
			return [ p.z, p.y ];

		} );
		parts.prism( steel, outline, 1.1, end.x );
		const tip = shell( 2.1, s * 0.3 );
		const point = shell( 2.24, s * 0.2 );
		for ( const x of [ - 0.4, 0, 0.4 ] ) parts.rod( BLACK(), [ end.x + x, tip.y + 0.04, tip.z ], [ end.x + x, point.y, point.z ], [ 0.06, 0.02 ], 5 );
		ram( parts, 0.07, at( 0.5, s * 0.25 ), shell( 1.02, s * 0.73 ) );

	}

	// The heap under it, between the open shells and clear of the tines.
	const heap = mat( 0x8f8a80, { roughness: 1 } );
	const lumber = TIMBER();
	for ( const [ x, z, r ] of [ [ 0.2, 0.05, 0.4 ], [ - 0.5, - 0.2, 0.32 ], [ 0.6, - 0.25, 0.3 ], [ - 0.3, 0.3, 0.28 ], [ 0.1, - 1.2, 0.24 ] ] ) parts.sphere( heap, r, [ end.x + x, r * 0.6, at( 2.1 ).z + z ], [ 7, 5 ], [ 1.3, 0.6, 1 ] );
	parts.block( lumber, [ 0.09, 0.04, 2.0 ], [ end.x - 0.2, 0.25, at( 2.1 ).z - 0.1 ], [ 0.15, 0.6, 0.1 ] );
	parts.block( lumber, [ 0.14, 0.04, 1.6 ], [ end.x + 0.5, 0.2, at( 2.1 ).z + 0.2 ], [ - 0.1, - 0.9, 0 ] );
	return parts.build();

}

// A 35 t excavator with a concrete pulverizer for secondary breaking: the cab guard on, the
// pulverizer's body on the stick, its fixed lower jaw and the moving upper jaw opened wide, the
// teeth and the rebar cutters at the back of the jaws, over a few slabs of broken concrete with
// rebar sticking out.
function pulverizerExcavator() {

	const parts = new Parts();
	const body = YELLOW();
	carrier( parts, body, {
		track: { length: 4.95, width: 3.39, shoe: 0.7, height: 1.0 },
		swing: 1.1, width: 3.1, front: - 2.1, tail: 3.4, deck: 1.4, hood: 2.6, counterweight: 2.55,
	} );
	guardedCab( parts, body, [ 1.0, 1.75, 1.95 ], [ - 1.03, 1.4, - 1.1 ] );
	for ( const x of [ - 0.2, 0.6 ] ) parts.box( DARK(), [ 0.1, 0.95, 1.25 ], [ x, 1.4, - 1.35 ] );
	const { end } = front( parts, body, { foot: [ 0.2, 2.2, - 1.4 ], boom: [ 46, 3.2, 4, 3.4 ], stick: [ - 64, 3.0 ], section: [ 0.6, 0.85 ] } );

	// The pulverizer: pointing down and forward, its body then the jaws, the lower one fixed.
	const at = toolFrame( end, 62 );
	const jaw = mat( 0x3d4144, { roughness: 0.55, metalness: 0.4 } );
	const housing = mat( 0x1f3f75, { roughness: 0.5, metalness: 0.2 } );
	const section = ( material, width, points ) => parts.prism( material, points.map( ( [ a, b ] ) => {

		const p = at( a, b );
		return [ p.z, p.y ];

	} ), width, end.x );
	section( housing, 0.62, [ [ 0, - 0.3 ], [ 0, 0.3 ], [ 0.95, 0.38 ], [ 1.05, 0 ], [ 0.95, - 0.38 ] ] );
	// Fixed jaw underneath (towards the machine), and the moving jaw opened up away from it.
	section( jaw, 0.7, [ [ 0.9, - 0.38 ], [ 1.2, - 0.12 ], [ 1.95, - 0.06 ], [ 2.05, - 0.25 ], [ 1.75, - 0.45 ], [ 1.1, - 0.5 ] ] );
	section( jaw, 0.62, [ [ 0.9, 0.3 ], [ 1.15, 0.12 ], [ 1.75, 0.55 ], [ 1.95, 0.85 ], [ 1.78, 0.95 ], [ 1.3, 0.72 ], [ 0.95, 0.5 ] ] );
	for ( const x of [ - 0.22, 0, 0.22 ] ) {

		const a = at( 1.6, - 0.08 );
		parts.rod( BLACK(), [ end.x + x, a.y, a.z ], at( 1.6, 0.06 ).add( new Vector3( x, 0, 0 ) ).toArray(), [ 0.05, 0.015 ], 5 );
		const b = at( 1.55, 0.53 );
		parts.rod( BLACK(), [ end.x + x, b.y, b.z ], at( 1.6, 0.4 ).add( new Vector3( x, 0, 0 ) ).toArray(), [ 0.05, 0.015 ], 5 );

	}

	parts.rod( STEEL(), at( 1.0, 0.3 ).add( new Vector3( - 0.4, 0, 0 ) ).toArray(), at( 1.0, 0.3 ).add( new Vector3( 0.4, 0, 0 ) ).toArray(), 0.08, 10 );

	// Broken slabs under it with rebar sticking out.
	const slab = CONCRETE();
	const rebar = mat( 0x6b4a32, { roughness: 0.8, metalness: 0.3 } );
	const gz = at( 2.0 ).z - 0.35;
	const slabs = [ [ 0.1, 0.2, 1.4, 0.9, 0.3 ], [ - 0.9, - 0.5, 1.1, 0.8, - 0.4 ], [ 0.9, - 0.6, 1.0, 0.7, 0.9 ] ];
	for ( const [ x, z, w, l, turn ] of slabs ) {

		parts.block( slab, [ w, 0.25, l ], [ end.x + x, 0.15, gz + z ], [ 0.03, turn, 0 ] );
		for ( let i = 0; i < 3; i ++ ) {

			const rz = gz + z + ( i - 1 ) * l * 0.28;
			parts.rod( rebar, [ end.x + x - w * 0.3, 0.18, rz ], [ end.x + x - w * 0.7, 0.32 + i * 0.05, rz - 0.1 ], 0.012, 5 );

		}

	}

	return parts.build();

}
