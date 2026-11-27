import { DoubleSide, Matrix4, PlaneGeometry, TorusGeometry } from 'three';
import { drawn, FT, IN, mat, Parts } from './parts.js';

// Crane rigging gear, yard storage, site services and traffic control pieces that the library was
// missing, built in code at real North American sizes: a concrete bucket, man basket, pallet forks,
// debris skip and material cage to hang off a crane hook; timber cribbing and a cantilever rack;
// water and wastewater tanks, a first aid trailer, a balloon light and an internet mast for an
// unserviced site; and a barrier-mounted fence, radar speed trailer, AFAD and rumble strips for a
// work zone. Like the other built-in pieces each stands on y = 0 with its front facing -Z.

const _m = new Matrix4();

export const SITE_LOGISTICS_ITEMS = [
	// Crane rigging.
	{ id: 'crane-concrete-bucket-2yd', name: 'Concrete crane bucket, bottom-dump with rubber drop chute (2 yd³, on timber blocks)', category: 'Concrete & batching',
		keywords: 'concrete bucket crane bucket pour bucket bottom dump bucket gate drop chute elephant trunk tower crane pour hopper garbro',
		build: concreteBucket },
	{ id: 'crane-personnel-basket-4', name: 'Crane personnel basket / man basket (4-person, 4 × 8 ft, 4-leg bridle)', category: 'Cranes & lifts',
		keywords: 'man basket personnel basket crane basket work platform suspended platform man cage personnel platform hoisted',
		build: personnelBasket },
	{ id: 'crane-pallet-forks', name: 'Crane pallet forks, self-levelling (4,000 lb, with a pallet of CMU on the tines)', category: 'Cranes & lifts',
		keywords: 'crane forks pallet forks crane fork hook forks self levelling forks below the hook block pallet lift masonry',
		build: palletForks },
	{ id: 'crane-debris-skip', name: 'Crane debris skip, four-point lift (2 yd³ steel, chained bridle)', category: 'Waste',
		keywords: 'debris skip crane skip crane hopper roof clean out garbage hopper self dumping hopper rubbish skip four point lift',
		build: debrisSkip },
	{ id: 'crane-material-cage', name: 'Crane material lifting cage, mesh sides with gate (8 × 4 × 4 ft, 4-leg chain bridle)', category: 'Cranes & lifts',
		keywords: 'lifting cage material cage crane cage loose material basket lift box flying cage small tools crane box',
		build: materialCage },

	// Yard storage.
	{ id: 'cribbing-stack-timber', name: 'Timber cribbing stack (6 × 6 in × 4 ft blocks, 7 layers crossed, 3.5 ft high)', category: 'Materials',
		keywords: 'cribbing crib blocking timber crib box crib dunnage jacking support girder support 6x6 laydown',
		build: cribbing },
	{ id: 'cantilever-rack-double', name: 'Cantilever storage rack, double-sided (12 ft high, 4 arms per side, loaded with pipe and lumber)', category: 'Site services',
		keywords: 'cantilever rack pipe rack lumber rack long stock storage rack steel storage yard rack arms bar stock',
		build: cantileverRack },

	// Site services for an unserviced site.
	{ id: 'water-tank-poly-1500gal', name: 'Potable water tank, poly vertical (1,500 gal, 7 ft dia, with booster pump)', category: 'Site services',
		keywords: 'water tank potable water poly tank cistern drinking water storage tank booster pump pressure tank vertical tank',
		build: waterTank },
	{ id: 'wastewater-holding-tank', name: 'Wastewater holding tank for site trailers (1,000 gal, 9 × 5 ft skid, pump-out port)', category: 'Site services',
		keywords: 'holding tank wastewater tank sewage tank septic tank grey water black water trailer waste tank pump out vac truck',
		build: holdingTank },
	{ id: 'first-aid-trailer-8x16', name: 'First aid / medic trailer (8 × 16 ft, steps and ramp, AED)', category: 'Site trailers & containers',
		keywords: 'first aid trailer medic trailer first aid room medical trailer emergency treatment aed first aid station first aid cross',
		build: firstAidTrailer },
	{ id: 'balloon-light-tripod', name: 'Balloon light on tripod (4,000 W LED, glare-free, 12 ft stand)', category: 'Power & air',
		keywords: 'balloon light glare free light airstar night work lighting paving light tripod light moon light',
		build: balloonLight },
	{ id: 'jobsite-internet-mast', name: 'Jobsite internet and Wi-Fi mast trailer (satellite dish, LTE antennas, 20 ft mast, solar)', category: 'Site services',
		keywords: 'internet trailer wifi trailer satellite internet starlink lte cell booster connectivity network mast solar jobsite internet',
		build: internetMast },

	// Barriers and work zone traffic control.
	// A row of them (rows.js) butts the barriers end to end, 10 ft apart, like jersey-barrier.
	{ id: 'jersey-barrier-fence', name: 'Concrete jersey barrier with fence panel on top (10 ft, 6 ft chain-link, ~8.8 ft overall)', category: 'Barriers & fencing',
		keywords: 'jersey barrier fence barrier mounted fence k-rail fence concrete barrier with fence chain link on barrier traffic lane',
		build: barrierFence, rowLength: 10 * FT },
	{ id: 'radar-speed-trailer', name: 'Radar speed display trailer (solar, YOUR SPEED sign with LED digits, single axle)', category: 'Traffic control',
		keywords: 'radar speed trailer speed sign your speed speed display speed feedback sign driver feedback work zone speed',
		build: radarTrailer },
	{ id: 'afad-flagger-trailer', name: 'Automated flagger assistance device, AFAD trailer (STOP/SLOW sign, lights, gate arm, solar)', category: 'Traffic control',
		keywords: 'afad automated flagger flagger trailer remote flagger stop slow gate arm lane closure single lane alternating flagging',
		build: afadTrailer },
	{ id: 'portable-rumble-strips', name: 'Portable temporary rumble strips (set of 3 × 11 ft, across one lane)', category: 'Traffic control',
		keywords: 'rumble strips portable rumble strip temporary rumble strip roadquake work zone warning lane',
		build: rumbleStrips },
];

// --- shared bits -----------------------------------------------------------------------------

const yellow = () => mat( 0xf2b705, { roughness: 0.55, metalness: 0.2 } );
const galvanised = () => mat( 0xa9adb0, { roughness: 0.45, metalness: 0.65 } );
const steel = () => mat( 0x7d8287, { roughness: 0.5, metalness: 0.6 } );
const dark = () => mat( 0x2c2e31, { roughness: 0.7, metalness: 0.2 } );
const rubber = () => mat( 0x161718, { roughness: 0.9 } );
const timber = () => mat( 0x8a6a45, { roughness: 0.95 } );
const white = () => mat( 0xe8e8e4, { roughness: 0.5, metalness: 0.15 } );
const solarCell = () => mat( 0x1c2a4a, { roughness: 0.2, metalness: 0.5 } );
const chainMat = () => mat( 0x4a4d50, { roughness: 0.55, metalness: 0.6 } );

// A drawn sign (or any flat picture) `w` by `h` centred at `centre`, facing the front (-Z), or the
// back when `back` is set.
function sign( parts, material, w, h, centre, back = false ) {

	parts.add( material, new PlaneGeometry( w, h ), back ? _m.makeTranslation( ...centre ) : _m.makeRotationY( Math.PI ).setPosition( ...centre ) );

}

// An oblong ring: a master link, a bail eye or a lifting eye, standing upright in the plane turned
// `turn` radians about the vertical.
function ring( parts, material, centre, radius, tube, stretch = 1.5, turn = 0 ) {

	const geometry = new TorusGeometry( radius, tube, 6, 14 );
	geometry.scale( 1, stretch, 1 );
	geometry.rotateY( turn );
	geometry.translate( ...centre );
	parts.add( material, geometry );

}

// A chain from a to b: a thin core with a link every 6 cm, so it reads as chain rather than bar.
function chain( parts, material, a, b, size = 0.008 ) {

	parts.rod( material, a, b, size, 5 );
	const length = Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ], b[ 2 ] - a[ 2 ] );
	const links = Math.floor( length / 0.06 );
	for ( let i = 1; i < links; i ++ ) {

		const t = i / links;
		const t1 = t + 0.025 / length;
		parts.rod( material, lerp( a, b, t ), lerp( a, b, t1 ), size * 2, 5 );

	}

}

function lerp( a, b, t ) {

	return a.map( ( v, i ) => v + ( b[ i ] - v ) * t );

}

// A four-leg bridle from the four `lugs` up to a master link at `top`, with a lifting eye at each
// lug. `rope` makes it wire rope (thinner, no links) instead of chain.
function bridle( parts, lugs, top, { rope = false } = {} ) {

	const material = rope ? mat( 0x55595c, { roughness: 0.5, metalness: 0.5 } ) : chainMat();
	const link = mat( 0xd23b1e, { roughness: 0.5, metalness: 0.3 } );
	for ( const lug of lugs ) {

		const hook = [ lug[ 0 ], lug[ 1 ] + 0.06, lug[ 2 ] ];
		if ( rope ) parts.rod( material, hook, [ top[ 0 ], top[ 1 ] - 0.1, top[ 2 ] ], 0.008, 6 );
		else chain( parts, material, hook, [ top[ 0 ], top[ 1 ] - 0.1, top[ 2 ] ] );
		ring( parts, steel(), [ lug[ 0 ], lug[ 1 ] + 0.03, lug[ 2 ] ], 0.03, 0.008, 1.3, Math.atan2( lug[ 0 ] - top[ 0 ], lug[ 2 ] - top[ 2 ] ) + Math.PI / 2 );

	}

	// The master link and the sub-link the legs hang from.
	ring( parts, link, [ top[ 0 ], top[ 1 ] + 0.06, top[ 2 ] ], 0.07, 0.014, 1.6 );
	ring( parts, link, [ top[ 0 ], top[ 1 ] - 0.08, top[ 2 ] ], 0.045, 0.011, 1.3, Math.PI / 2 );

}

// A wheel of radius r and width w on an axle along x at height r: a tyre and a pale hub.
function wheel( parts, x, z, r, w ) {

	parts.rod( rubber(), [ x - w / 2, r, z ], [ x + w / 2, r, z ], r, 16 );
	parts.rod( galvanised(), [ x - w / 2 - 0.005, r, z ], [ x + w / 2 + 0.005, r, z ], r * 0.55, 12 );

}

// A small single-axle sign trailer: a deck `width` by `length` at `deckY`, the axle under its
// middle, the tongue to the back (+Z, so a sign on the front faces traffic) and a levelling jack
// at each corner, down on its pad. `tongue: -1` puts the tongue to the front (-Z) instead, the
// way towed equipment with no sign faces.
function signTrailer( parts, { width, length, deckY, colour, tongue: side = 1 } ) {

	const frame = galvanised();
	const r = 0.3;
	parts.box( frame, [ width, 0.1, length ], [ 0, deckY, 0 ] );
	const tongue = side * ( length / 2 + 1.2 );
	const root = side * ( length / 2 - 0.1 );
	const jack = tongue - side * 0.25;
	parts.path( frame, [ [ - 0.45, deckY + 0.05, root ], [ 0, deckY + 0.05, tongue ], [ 0.45, deckY + 0.05, root ] ], 0.04, 6 );
	parts.cylinder( frame, 0.045, 0.1, [ 0, deckY, tongue ], 10 );
	parts.cylinder( dark(), 0.025, deckY - 0.04, [ 0, 0.04, jack ], 8 );
	parts.box( dark(), [ 0.12, 0.04, 0.12 ], [ 0, 0, jack ] );

	for ( const s of [ - 1, 1 ] ) {

		wheel( parts, s * ( width / 2 + 0.12 ), 0, r, 0.18 );
		parts.box( colour, [ 0.26, 0.03, 0.78 ], [ s * ( width / 2 + 0.12 ), r * 2 + 0.05, 0 ] );
		parts.box( colour, [ 0.03, r * 2 + 0.05 - deckY, 0.4 ], [ s * ( width / 2 - 0.0 ), deckY, 0 ] );

	}

	parts.rod( frame, [ - width / 2 - 0.05, r, 0 ], [ width / 2 + 0.05, r, 0 ], 0.04, 8 );
	for ( const [ sx, sz ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ] ) {

		parts.box( frame, [ 0.07, deckY, 0.07 ], [ sx * ( width / 2 - 0.08 ), 0.04, sz * ( length / 2 - 0.08 ) ] );
		parts.box( dark(), [ 0.2, 0.04, 0.2 ], [ sx * ( width / 2 - 0.08 ), 0, sz * ( length / 2 - 0.08 ) ] );

	}

}

// Solar panels in a row across x on posts, tilted back `tilt` radians, their lower edge to the
// front: `count` panels of `size` [ across, along the slope ] centred at (0, y, z).
function solarPanels( parts, count, size, [ y, z ], tilt, postFoot ) {

	const frame = galvanised();
	const pitch = size[ 0 ] + 0.04;
	for ( let i = 0; i < count; i ++ ) {

		const x = ( i - ( count - 1 ) / 2 ) * pitch;
		parts.block( frame, [ size[ 0 ] + 0.02, 0.04, size[ 1 ] + 0.02 ], [ x, y, z ], [ tilt, 0, 0 ] );
		parts.block( solarCell(), [ size[ 0 ] - 0.02, 0.02, size[ 1 ] - 0.04 ], [ x, y + 0.025, z ], [ tilt, 0, 0 ] );

	}

	// Two posts under the frame, down to whatever it stands on.
	const half = ( count * pitch ) / 2 - 0.15;
	for ( const x of [ - half, half ] ) parts.box( frame, [ 0.05, y - postFoot, 0.05 ], [ x, postFoot, z ] );

}

// --- crane rigging ---------------------------------------------------------------------------

// A 2 yd³ upright bottom-dump concrete bucket (about 64 in across and 7 ft to the bail): a round
// body over a cone down to a clamshell gate, four legs standing on two 6 × 6 timbers, the bail
// pinned to trunnions on the sides with its lifting eye on top, the gate lever to the front and a
// short rubber drop chute hanging from the gate.
function concreteBucket() {

	const parts = new Parts();
	const paint = mat( 0xd8a21a, { roughness: 0.55, metalness: 0.25 } );
	// The shell is open at the top, so its inside shows.
	const shell = mat( 0xc99515, { roughness: 0.7, metalness: 0.2, side: DoubleSide } );
	const block = 6 * IN;
	const radius = 0.81;
	const gate = 0.5;
	const coneTop = 1.0;
	const rim = 1.6;

	// Timbers, the legs on them and the ring tying the legs together under the body.
	for ( const z of [ - 0.52, 0.52 ] ) parts.box( timber(), [ 1.9, block, block ], [ 0, 0, z ] );
	const legR = 0.73;
	for ( let i = 0; i < 4; i ++ ) {

		const a = Math.PI / 4 + i * Math.PI / 2;
		const [ x, z ] = [ Math.cos( a ) * legR, Math.sin( a ) * legR ];
		parts.box( paint, [ 0.08, coneTop + 0.12 - block, 0.08 ], [ x, block, z ] );
		parts.box( paint, [ 0.16, 0.012, 0.16 ], [ x, block, z ] );

	}

	parts.add( paint, new TorusGeometry( legR, 0.025, 6, 24 ).rotateX( Math.PI / 2 ).translate( 0, 0.55, 0 ) );

	// The body, open at the top: the cone down to the gate and the cylinder, a stiffening band and a
	// rolled rim.
	parts.rod( shell, [ 0, gate, 0 ], [ 0, coneTop, 0 ], [ 0.2, radius ], 24, true );
	parts.rod( shell, [ 0, coneTop, 0 ], [ 0, rim, 0 ], radius, 24, true );
	parts.cylinder( paint, radius + 0.02, 0.08, [ 0, coneTop + 0.25, 0 ], 24 );
	parts.add( paint, new TorusGeometry( radius, 0.03, 6, 28 ).rotateX( Math.PI / 2 ).translate( 0, rim, 0 ) );

	// The clamshell gate under the cone, its pivot arms and the lever out to the front.
	parts.box( paint, [ 0.5, 0.12, 0.42 ], [ 0, gate - 0.12, 0 ] );
	for ( const x of [ - 0.27, 0.27 ] ) parts.block( paint, [ 0.03, 0.42, 0.08 ], [ x, gate + 0.05, 0 ], [ 0.3, 0, 0 ] );
	parts.rod( steel(), [ 0.27, gate - 0.04, - 0.05 ], [ 0.42, 0.92, - 0.78 ], 0.022, 8 );
	parts.rod( rubber(), [ 0.38, 0.86, - 0.72 ], [ 0.46, 0.98, - 0.84 ], 0.03, 8 );

	// The rubber drop chute off the gate, slumped a little.
	parts.cylinder( rubber(), 0.16, 0.22, [ 0, gate - 0.34, 0 ], 16, 0.19 );

	// Trunnions on the sides and the bail over the top with its eye.
	const pin = 1.38;
	const bailTop = 2.12;
	for ( const s of [ - 1, 1 ] ) {

		parts.rod( steel(), [ s * radius, pin, 0 ], [ s * ( radius + 0.08 ), pin, 0 ], 0.06, 12 );

	}

	parts.path( paint, [ [ - radius - 0.1, pin, 0 ], [ - radius - 0.1, pin + 0.35, 0 ], [ - 0.2, bailTop, 0 ], [ 0.2, bailTop, 0 ], [ radius + 0.1, pin + 0.35, 0 ], [ radius + 0.1, pin, 0 ] ], 0.035, 8 );
	ring( parts, steel(), [ 0, bailTop + 0.13, 0 ], 0.08, 0.02, 1.3 );

	return parts.build();

}

// A four-person basket of the size crane rental yards carry: 4 × 8 ft on two skids, tube rails to
// 42 in with a mid rail, toe boards and mesh infill, a gate on the end, the capacity plate on the
// front, and a 4-leg wire rope bridle from the top corners to a master link about 8 ft up.
function personnelBasket() {

	const parts = new Parts();
	const frame = yellow();
	const floor = mat( 0x6f7377, { roughness: 0.6, metalness: 0.5 } );
	const mesh = meshMaterial( 'basket mesh', 12, 6, '#d9a307' );
	const length = 8 * FT;
	const width = 4 * FT;
	const deck = 0.13;
	const rail = deck + 42 * IN;
	const [ hx, hz ] = [ length / 2, width / 2 ];

	// Skids and floor.
	for ( const z of [ - hz + 0.15, hz - 0.15 ] ) parts.box( dark(), [ length, 0.1, 0.08 ], [ 0, 0, z ] );
	parts.box( floor, [ length, deck - 0.1, width ], [ 0, 0.1, 0 ] );

	// Posts at the corners and the middle of the long sides, the top and mid rails, toe boards.
	const posts = [ [ - hx, - hz ], [ 0, - hz ], [ hx, - hz ], [ hx, hz ], [ 0, hz ], [ - hx, hz ] ];
	for ( const [ x, z ] of posts ) parts.box( frame, [ 0.05, rail - deck, 0.05 ], [ x, deck, z ] );
	for ( const y of [ rail, deck + 21 * IN ] ) {

		for ( const z of [ - hz, hz ] ) parts.rod( frame, [ - hx, y, z ], [ hx, y, z ], 0.024, 8 );
		for ( const x of [ - hx, hx ] ) parts.rod( frame, [ x, y, - hz ], [ x, y, hz ], 0.024, 8 );

	}

	for ( const z of [ - hz, hz ] ) parts.box( frame, [ length, 0.1, 0.012 ], [ 0, deck, z ] );
	for ( const x of [ - hx, hx ] ) parts.box( frame, [ 0.012, 0.1, width ], [ x, deck, 0 ] );

	// Mesh infill between the toe boards and the top rail.
	const meshH = rail - deck - 0.12;
	const meshY = deck + 0.1 + meshH / 2;
	for ( const z of [ - hz, hz ] ) sign( parts, mesh, length - 0.05, meshH, [ 0, meshY, z ] );
	for ( const x of [ - hx, hx ] ) parts.add( mesh, new PlaneGeometry( width - 0.05, meshH ), _m.makeRotationY( Math.PI / 2 ).setPosition( x, meshY, 0 ) );

	// The gate on the left end: its hinges and latch.
	for ( const y of [ deck + 0.3, rail - 0.15 ] ) parts.box( dark(), [ 0.04, 0.06, 0.06 ], [ - hx - 0.02, y, - 0.4 ] );
	parts.box( dark(), [ 0.04, 0.1, 0.05 ], [ - hx - 0.02, deck + 0.75, 0.42 ] );

	// The capacity plate on the front rail.
	const plate = drawn( 'personnel basket plate', [ 256, 160 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#f4f4f0';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#c8102e';
		ctx.fillRect( 0, 0, w, 44 );
		ctx.fillStyle = '#ffffff';
		ctx.font = 'bold 34px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText( 'DANGER', w / 2, 34 );
		ctx.fillStyle = '#111111';
		ctx.font = 'bold 30px sans-serif';
		ctx.fillText( 'MAX 4 PERSONS', w / 2, 88 );
		ctx.fillText( 'CAP. 1,200 LB', w / 2, 132 );

	} );
	sign( parts, plate, 0.4, 0.25, [ - 0.6, rail - 0.2, - hz - 0.02 ] );

	// Lifting lugs on the corner posts and the bridle.
	const lugs = [ [ - hx, - hz ], [ hx, - hz ], [ hx, hz ], [ - hx, hz ] ].map( ( [ x, z ] ) => [ x, rail + 0.02, z ] );
	for ( const [ x, y, z ] of lugs ) parts.box( frame, [ 0.06, 0.05, 0.06 ], [ x, y - 0.03, z ] );
	bridle( parts, lugs, [ 0, rail + 2.5, 0 ], { rope: true } );

	return parts.build();

}

// Mesh infill drawn on a canvas: `across` × `up` openings in `colour`, the rest cut out. Both sides
// show, so a panel reads from inside and out.
function meshMaterial( key, across, up, colour ) {

	return drawn( key, [ 64 * across, 64 * up ], ( ctx, w, h ) => {

		ctx.strokeStyle = colour;
		ctx.lineWidth = 7;
		for ( let i = 0; i <= across; i ++ ) {

			ctx.beginPath();
			ctx.moveTo( i * 64, 0 );
			ctx.lineTo( i * 64, h );
			ctx.stroke();

		}

		for ( let j = 0; j <= up; j ++ ) {

			ctx.beginPath();
			ctx.moveTo( 0, j * 64 );
			ctx.lineTo( w, j * 64 );
			ctx.stroke();

		}

	}, { side: DoubleSide, metalness: 0.3 } );

}

// Self-levelling crane forks rated 4,000 lb: two 42 in tines on a carriage, the C-frame's back
// column rising behind the load to an arm reaching forward over it, where the bail hangs from a
// sliding balance block. A pallet of 90 concrete blocks sits on the tines.
function palletForks() {

	const parts = new Parts();
	const frame = yellow();
	const tine = 42 * IN;
	const heel = 0.12;

	// Tines and carriage. The tines run to the front (-Z) from the carriage face at z = heel.
	for ( const x of [ - 0.32, 0.32 ] ) {

		parts.box( dark(), [ 0.1, 0.045, tine ], [ x, 0, heel - tine / 2 ] );
		parts.box( dark(), [ 0.1, 0.55, 0.045 ], [ x, 0, heel + 0.022 ] );

	}

	parts.box( frame, [ 1.0, 0.1, 0.08 ], [ 0, 0.42, heel + 0.08 ] );
	parts.box( frame, [ 1.0, 0.1, 0.08 ], [ 0, 0.05, heel + 0.08 ] );

	// The back column and the top arm, boxed sections with a diagonal gusset at the corner.
	const colZ = heel + 0.22;
	const armY = 2.45;
	parts.box( frame, [ 0.14, armY + 0.18, 0.18 ], [ 0, 0.05, colZ ] );
	parts.box( frame, [ 0.5, 0.06, 0.24 ], [ 0, 0.42, colZ - 0.05 ] );
	parts.box( frame, [ 0.14, 0.18, 1.0 ], [ 0, armY, colZ - 0.45 ] );
	parts.block( frame, [ 0.1, 0.08, 0.6 ], [ 0, armY - 0.2, colZ - 0.2 ], [ Math.PI / 4, 0, 0 ] );

	// The balance: a block on the arm with its adjusting screw, and the bail up to the hook eye.
	const balZ = - 0.5;
	parts.box( dark(), [ 0.22, 0.14, 0.2 ], [ 0, armY + 0.18, balZ ] );
	parts.rod( steel(), [ 0, armY + 0.25, balZ + 0.1 ], [ 0, armY + 0.25, colZ ], 0.015, 6 );
	parts.path( frame, [ [ - 0.09, armY + 0.25, balZ ], [ - 0.09, armY + 0.45, balZ ], [ 0.09, armY + 0.45, balZ ], [ 0.09, armY + 0.25, balZ ] ], 0.025, 8 );
	ring( parts, steel(), [ 0, armY + 0.56, balZ ], 0.07, 0.018, 1.3 );

	// The pallet (48 in deep along the tines, 40 in wide) with its blocks, the tines in its openings.
	cmuPallet( parts, [ 0, 0, heel - 0.025 - 24 * IN ] );

	return parts.build();

}

// A wooden pallet of 90 8 in concrete blocks, 6 courses of 15, standing on `base` [ x, y, z ]
// (its middle): 40 in across x, 48 in along z.
function cmuPallet( parts, [ x0, y0, z0 ] ) {

	const wood = mat( 0xa88a5e, { roughness: 0.9 } );
	const block = mat( 0xa9a7a0, { roughness: 0.95 } );
	const shadow = mat( 0x55534e, { roughness: 1 } );
	const [ px, pz ] = [ 40 * IN, 48 * IN ];

	// Pallet: three stringers along z, deck boards across.
	for ( const x of [ - px / 2 + 0.02, 0, px / 2 - 0.02 ] ) parts.box( wood, [ 0.04, 0.09, pz ], [ x0 + x, y0, z0 ] );
	for ( let i = 0; i < 7; i ++ ) parts.box( wood, [ px, 0.02, 0.1 ], [ x0, y0 + 0.09, z0 - pz / 2 + 0.05 + i * ( pz - 0.1 ) / 6 ] );

	// Blocks, each a hair smaller than its space so the joints show dark against the core behind.
	const top = y0 + 0.11;
	const [ bl, bw, bh ] = [ 16 * IN, 8 * IN, 8 * IN ];
	parts.box( shadow, [ px - 0.04, 6 * bh - 0.02, pz - 0.04 ], [ x0, top, z0 ] );
	for ( let c = 0; c < 6; c ++ ) {

		for ( let i = 0; i < 5; i ++ ) {

			for ( let j = 0; j < 3; j ++ ) {

				parts.box( block, [ bw - 0.008, bh - 0.008, bl - 0.008 ], [ x0 - px / 2 + bw * ( i + 0.5 ), top + c * bh, z0 - pz / 2 + bl * ( j + 0.5 ) ] );

			}

		}

	}

	// Two bands round the stack.
	const band = mat( 0x2a2c2e, { roughness: 0.6 } );
	for ( const z of [ - pz / 4, pz / 4 ] ) {

		parts.box( band, [ px + 0.006, 0.006, 0.02 ], [ x0, top + 6 * bh, z0 + z ] );
		for ( const s of [ - 1, 1 ] ) parts.box( band, [ 0.006, 6 * bh, 0.02 ], [ x0 + s * ( px / 2 + 0.003 ), top, z0 + z ] );

	}

}

// A 2 yd³ self-dumping crane skip for clearing roofs and floors: a steel hopper with a sloped front
// lip (to the front), skids with fork pockets, a lifting lug at each top corner and a four-leg
// chain bridle to a master link.
function debrisSkip() {

	const parts = new Parts();
	const paint = mat( 0x2f6db0, { roughness: 0.55, metalness: 0.25 } );
	const inside = mat( 0x5b5f63, { roughness: 0.85, metalness: 0.2 } );
	const width = 1.3;
	const base = 0.15;
	const top = base + 0.85;
	const [ backZ, floorFront, lipZ ] = [ 0.55, - 0.55, - 1.05 ];
	const t = 0.012;

	// Skids along z, with two fork pockets across.
	for ( const x of [ - 0.45, 0.45 ] ) parts.box( dark(), [ 0.1, base, backZ - floorFront + 0.1 ], [ x, 0, 0 ] );
	for ( const z of [ - 0.25, 0.3 ] ) parts.box( dark(), [ width, 0.1, 0.22 ], [ 0, base - 0.1, z ] );

	// Floor, back, the two side plates (cut to the profile) and the sloped front.
	parts.box( paint, [ width, t, backZ - floorFront ], [ 0, base, ( backZ + floorFront ) / 2 ] );
	parts.box( paint, [ width, top - base, t ], [ 0, base, backZ ] );
	const profile = [ [ floorFront, base ], [ backZ, base ], [ backZ, top ], [ lipZ, top ] ];
	for ( const s of [ - 1, 1 ] ) {

		parts.prism( paint, profile, t, s * ( width / 2 - t / 2 ) );
		parts.prism( inside, profile.map( ( [ z, y ] ) => [ z * 0.98, base + ( y - base ) * 0.98 ] ), 0.002, s * ( width / 2 - t - 0.002 ) );

	}

	const slope = Math.hypot( lipZ - floorFront, top - base );
	const angle = Math.atan2( top - base, floorFront - lipZ );
	parts.block( paint, [ width, t, slope ], [ 0, ( top + base ) / 2, ( lipZ + floorFront ) / 2 ], [ angle, 0, 0 ] );
	parts.block( inside, [ width - 0.03, 0.002, slope - 0.04 ], [ 0, ( top + base ) / 2 + 0.008, ( lipZ + floorFront ) / 2 + 0.006 ], [ angle, 0, 0 ] );
	parts.box( inside, [ width - 0.03, 0.002, backZ - floorFront - 0.02 ], [ 0, base + t, ( backZ + floorFront ) / 2 ] );
	parts.box( inside, [ width - 0.03, top - base - 0.02, 0.002 ], [ 0, base + t, backZ - t / 2 - 0.002 ] );

	// A rolled rim round the top, and the lugs at the corners.
	parts.rod( paint, [ - width / 2, top, lipZ ], [ width / 2, top, lipZ ], 0.025, 8 );
	parts.rod( paint, [ - width / 2, top, backZ ], [ width / 2, top, backZ ], 0.025, 8 );
	for ( const s of [ - 1, 1 ] ) parts.rod( paint, [ s * width / 2, top, lipZ ], [ s * width / 2, top, backZ ], 0.025, 8 );
	const lugs = [ [ - 1, lipZ + 0.15 ], [ 1, lipZ + 0.15 ], [ 1, backZ ], [ - 1, backZ ] ].map( ( [ s, z ] ) => [ s * ( width / 2 + 0.03 ), top, z ] );
	for ( const [ x, y, z ] of lugs ) parts.box( paint, [ 0.03, 0.12, 0.1 ], [ x, y - 0.06, z ] );
	bridle( parts, lugs, [ 0, top + 1.9, ( lipZ + backZ ) / 2 + 0.05 ] );

	return parts.build();

}

// An 8 × 4 × 4 ft lifting cage for flying loose material: a welded angle frame on a plate floor,
// mesh sides and back, a mesh gate on the front with its hinges and drop latch, a lug at each top
// corner and a four-leg chain bridle. A few bundles and boxes ride inside.
function materialCage() {

	const parts = new Parts();
	const frame = mat( 0xd23b1e, { roughness: 0.55, metalness: 0.25 } );
	const mesh = meshMaterial( 'cage mesh', 16, 8, '#8f969c' );
	const [ length, width, height ] = [ 8 * FT, 4 * FT, 4 * FT ];
	const [ hx, hz ] = [ length / 2, width / 2 ];
	const skid = 0.1;

	for ( const x of [ - hx + 0.3, hx - 0.3 ] ) parts.box( dark(), [ 0.15, skid, width ], [ x, 0, 0 ] );
	parts.box( steel(), [ length, 0.012, width ], [ 0, skid, 0 ] );

	// Corner posts, the top and bottom frame and a post each side of the gate.
	const top = skid + height;
	for ( const [ x, z ] of [ [ - hx, - hz ], [ hx, - hz ], [ hx, hz ], [ - hx, hz ], [ - 0.6, - hz ], [ 0.6, - hz ], [ 0, hz ] ] ) parts.box( frame, [ 0.05, height, 0.05 ], [ x, skid, z ] );
	for ( const y of [ skid + 0.03, top - 0.025 ] ) {

		for ( const z of [ - hz, hz ] ) parts.box( frame, [ length, 0.05, 0.05 ], [ 0, y - 0.025, z ] );
		for ( const x of [ - hx, hx ] ) parts.box( frame, [ 0.05, 0.05, width ], [ x, y - 0.025, 0 ] );

	}

	// Mesh on the sides and back, and on each part of the front, the gate in the middle.
	const meshH = height - 0.06;
	const meshY = skid + 0.03 + meshH / 2;
	sign( parts, mesh, length - 0.05, meshH, [ 0, meshY, hz ] );
	for ( const x of [ - hx, hx ] ) parts.add( mesh, new PlaneGeometry( width - 0.05, meshH ), _m.makeRotationY( Math.PI / 2 ).setPosition( x, meshY, 0 ) );
	for ( const [ x0, x1 ] of [ [ - hx, - 0.6 ], [ - 0.6, 0.6 ], [ 0.6, hx ] ] ) sign( parts, mesh, x1 - x0 - 0.05, meshH, [ ( x0 + x1 ) / 2, meshY, - hz ] );

	// The gate's own frame, hinges on the left and the drop latch on the right.
	const gate = mat( 0xb32f17, { roughness: 0.55, metalness: 0.25 } );
	for ( const y of [ skid + 0.1, top - 0.1 ] ) parts.box( gate, [ 1.15, 0.04, 0.03 ], [ 0, y, - hz - 0.03 ] );
	for ( const x of [ - 0.56, 0.56 ] ) parts.box( gate, [ 0.04, height - 0.16, 0.03 ], [ x, skid + 0.08, - hz - 0.03 ] );
	for ( const y of [ skid + 0.25, top - 0.3 ] ) parts.rod( dark(), [ - 0.6, y, - hz - 0.04 ], [ - 0.6, y + 0.1, - hz - 0.04 ], 0.02, 8 );
	parts.box( dark(), [ 0.08, 0.14, 0.04 ], [ 0.6, skid + height * 0.55, - hz - 0.05 ] );

	// What's in it: a bundle of EMT conduit, boxes of fittings and a cord reel.
	const emt = mat( 0xc5c9cc, { roughness: 0.4, metalness: 0.6 } );
	const floor = skid + 0.012;
	for ( let i = 0; i < 4; i ++ ) {

		for ( let j = 0; j < 3; j ++ ) parts.rod( emt, [ - hx + 0.1, floor + 0.025 + j * 0.045, 0.2 + i * 0.045 ], [ hx - 0.1, floor + 0.025 + j * 0.045, 0.2 + i * 0.045 ], 0.022, 6 );

	}

	const carton = mat( 0xb88d5a, { roughness: 0.9 } );
	parts.box( carton, [ 0.5, 0.35, 0.4 ], [ - 0.75, floor, - 0.25 ] );
	parts.box( carton, [ 0.4, 0.3, 0.35 ], [ - 0.72, floor + 0.35, - 0.25 ] );
	parts.box( carton, [ 0.45, 0.3, 0.4 ], [ - 0.2, floor, - 0.28 ] );
	const reel = mat( 0xe3b512, { roughness: 0.6 } );
	parts.rod( reel, [ 0.55, floor + 0.25, - 0.4 ], [ 0.55, floor + 0.25, - 0.1 ], 0.25, 16 );
	parts.rod( mat( 0xe56b16, { roughness: 0.7 } ), [ 0.55, floor + 0.25, - 0.36 ], [ 0.55, floor + 0.25, - 0.14 ], 0.22, 16 );

	const lugs = [ [ - hx, - hz ], [ hx, - hz ], [ hx, hz ], [ - hx, hz ] ].map( ( [ x, z ] ) => [ x, top, z ] );
	for ( const [ x, y, z ] of lugs ) parts.box( frame, [ 0.08, 0.06, 0.08 ], [ x, y, z ] );
	bridle( parts, lugs.map( ( [ x, y, z ] ) => [ x, y + 0.04, z ] ), [ 0, top + 1.9, 0 ] );

	return parts.build();

}

// --- yard storage ----------------------------------------------------------------------------

// A box crib of 4 ft lengths of 6 × 6 timber, three to a layer and each layer crossed on the one
// under it, seven layers high: what girders, machines and jacking points sit on.
function cribbing() {

	const parts = new Parts();
	const tones = [ timber(), mat( 0x76583a, { roughness: 0.95 } ), mat( 0x9b7a50, { roughness: 0.95 } ) ];
	const side = 6 * IN;
	const length = 4 * FT;
	const offset = length / 2 - side / 2;
	for ( let layer = 0; layer < 7; layer ++ ) {

		for ( let i = 0; i < 3; i ++ ) {

			const at = ( i - 1 ) * offset;
			const tone = tones[ ( layer * 2 + i ) % 3 ];
			const y = layer * side;
			if ( layer % 2 ) parts.box( tone, [ side - 0.004, side, length ], [ at, y, 0 ] );
			else parts.box( tone, [ length, side, side - 0.004 ], [ 0, y, at ] );

		}

	}

	return parts.build();

}

// A double-sided cantilever rack: three columns 6 ft apart on base beams, braced in the middle
// line, with four arms each side reaching 4 ft. Steel pipe on the front arms, lumber bundles on
// the back, each load 16 ft long so it overhangs the end columns by 2 ft as it would.
function cantileverRack() {

	const parts = new Parts();
	const column = mat( 0x24508f, { roughness: 0.55, metalness: 0.3 } );
	const arm = mat( 0xe0731c, { roughness: 0.55, metalness: 0.3 } );
	const height = 12 * FT;
	const reach = 4 * FT;
	const depth = 0.25;
	const xs = [ - 6 * FT, 0, 6 * FT ];
	const base = 0.2;
	const levels = [ 0.75, 1.5, 2.25, 3.0 ];

	for ( const x of xs ) {

		// Base beam along z (an I: flanges and web), the column on it (web along z).
		const baseLength = 2 * reach + depth + 0.2;
		parts.box( column, [ 0.2, 0.02, baseLength ], [ x, 0, 0 ] );
		parts.box( column, [ 0.2, 0.02, baseLength ], [ x, base - 0.02, 0 ] );
		parts.box( column, [ 0.012, base - 0.04, baseLength ], [ x, 0.02, 0 ] );
		for ( const z of [ - depth / 2, depth / 2 ] ) parts.box( column, [ 0.2, height - base, 0.02 ], [ x, base, z ] );
		parts.box( column, [ 0.012, height - base, depth ], [ x, base, 0 ] );

		// Arms each side, deeper at the column, with a stop lip at the tip.
		for ( const y of levels ) {

			for ( const s of [ - 1, 1 ] ) {

				const z0 = s * depth / 2;
				const z1 = s * ( depth / 2 + reach );
				parts.prism( arm, s < 0 ? [ [ z1, y - 0.07 ], [ z0, y - 0.16 ], [ z0, y ], [ z1, y ] ] : [ [ z0, y - 0.16 ], [ z1, y - 0.07 ], [ z1, y ], [ z0, y ] ], 0.1, x );
				parts.box( arm, [ 0.1, 0.07, 0.02 ], [ x, y, z1 - s * 0.01 ] );

			}

		}

	}

	// Bracing between the columns: struts at top and middle and an X in each bay.
	const brace = column;
	for ( let i = 1; i < xs.length; i ++ ) {

		const [ a, b ] = [ xs[ i - 1 ] + 0.1, xs[ i ] - 0.1 ];
		for ( const y of [ 0.45, height / 2, height - 0.15 ] ) parts.box( brace, [ b - a, 0.08, 0.06 ], [ ( a + b ) / 2, y, 0 ] );
		parts.rod( brace, [ a, 0.5, 0 ], [ b, height / 2, 0 ], 0.02, 6 );
		parts.rod( brace, [ b, 0.5, 0 ], [ a, height / 2, 0 ], 0.02, 6 );
		parts.rod( brace, [ a, height / 2 + 0.05, 0 ], [ b, height - 0.2, 0 ], 0.02, 6 );
		parts.rod( brace, [ b, height / 2 + 0.05, 0 ], [ a, height - 0.2, 0 ], 0.02, 6 );

	}

	// Loads, 16 ft long. Front: two layers of 6 in pipe, a layer of 4 in, a bundle of 2 in.
	const load = 16 * FT;
	const [ x0, x1 ] = [ - load / 2, load / 2 ];
	const pipe = mat( 0x3b3d40, { roughness: 0.6, metalness: 0.5 } );
	const galvPipe = galvanised();
	const pipes = ( y, r, count, rows, material ) => {

		for ( let row = 0; row < rows; row ++ ) {

			const n = count - row;
			for ( let i = 0; i < n; i ++ ) {

				const z = - depth / 2 - reach + 0.06 + r + ( i + row * 0.5 ) * r * 2.02;
				parts.rod( material, [ x0, y + r + row * r * 1.75, z ], [ x1, y + r + row * r * 1.75, z ], r, 10 );

			}

		}

	};
	pipes( levels[ 0 ], 0.084, 6, 2, pipe );
	pipes( levels[ 1 ], 0.057, 9, 2, pipe );
	pipes( levels[ 2 ], 0.03, 14, 3, galvPipe );

	// Back: bundles of lumber (banded, with the end grain paler) and a few loose 2 × 12 planks.
	const lumber = mat( 0xc9a46c, { roughness: 0.9 } );
	const grain = mat( 0xe0c391, { roughness: 0.9 } );
	const band = mat( 0x2a2c2e, { roughness: 0.6 } );
	const bundle = ( y, w, h, z ) => {

		parts.box( lumber, [ load, h, w ], [ 0, y, z ] );
		for ( const x of [ x0, x1 ] ) parts.box( grain, [ 0.004, h - 0.01, w - 0.01 ], [ x, y + 0.005, z ] );
		for ( const x of [ - 1.8, 0.6, - 0.6, 1.8 ] ) parts.box( band, [ 0.02, h + 0.006, w + 0.006 ], [ x, y - 0.003, z ] );

	};
	const backZ = d => depth / 2 + reach - 0.06 - d;
	bundle( levels[ 0 ], 0.56, 0.48, backZ( 0.28 ) );
	bundle( levels[ 0 ], 0.56, 0.48, backZ( 0.9 ) );
	bundle( levels[ 1 ], 0.6, 0.42, backZ( 0.3 ) );
	bundle( levels[ 2 ], 0.56, 0.3, backZ( 0.28 ) );
	bundle( levels[ 2 ], 0.56, 0.3, backZ( 0.88 ) );
	for ( let i = 0; i < 3; i ++ ) parts.box( lumber, [ load, 0.04, 0.29 ], [ 0, levels[ 3 ] + i * 0.04, backZ( 0.2 + i * 0.05 ) ] );

	return parts.build();

}

// --- site services ---------------------------------------------------------------------------

// A 1,500 gal vertical poly water tank (87 in across, 68 in high, the size most makers sell) on a
// gravel pad, with its manway lid, a bottom outlet valve to the front feeding a small booster pump
// and pressure tank on a base, and a POTABLE WATER label.
function waterTank() {

	const parts = new Parts();
	const poly = mat( 0xe4ddc6, { roughness: 0.7 } );
	const ribs = mat( 0xd6ceb4, { roughness: 0.7 } );
	const gravel = mat( 0x8e8a82, { roughness: 1 } );
	const pvc = mat( 0xe9e9e6, { roughness: 0.5 } );
	const blue = mat( 0x2758a8, { roughness: 0.45, metalness: 0.3 } );
	const r = 87 / 2 * IN;
	const wall = 54 * IN;
	const dome = 14 * IN;
	const pad = 0.1;

	// Gravel pad and the tank: wall, ribs round it, dome top and the manway.
	parts.cylinder( gravel, r + 0.25, pad, [ 0, 0, 0 ], 28, r + 0.15 );
	parts.cylinder( poly, r, wall, [ 0, pad, 0 ], 32 );
	for ( const y of [ 0.35, 0.7, 1.05 ] ) parts.cylinder( ribs, r + 0.015, 0.06, [ 0, pad + y, 0 ], 32 );
	parts.sphere( poly, r, [ 0, pad + wall, 0 ], [ 32, 8 ], [ 1, dome / r, 1 ] );
	parts.cylinder( ribs, 0.24, 0.07, [ 0, pad + wall + dome - 0.03, 0 ], 20 );
	parts.cylinder( ribs, 0.04, 0.05, [ 0.4, pad + wall + dome - 0.06, 0.1 ], 10 ); // vent

	// The label on the front.
	const label = drawn( 'potable water label', [ 256, 96 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#1f5fbf';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#ffffff';
		ctx.font = 'bold 40px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText( 'POTABLE', w / 2, 42 );
		ctx.fillText( 'WATER', w / 2, 86 );

	} );
	sign( parts, label, 0.5, 0.19, [ 0, pad + 1.25, - r - 0.012 ] );

	// Outlet fitting and ball valve, the line to the pump, and the pump set on its base.
	const outY = pad + 0.12;
	parts.rod( pvc, [ 0, outY, - r + 0.02 ], [ 0, outY, - r - 0.2 ], 0.03, 10 );
	parts.box( blue, [ 0.08, 0.08, 0.08 ], [ 0, outY - 0.04, - r - 0.15 ] );
	parts.rod( dark(), [ 0, outY + 0.04, - r - 0.15 ], [ 0.12, outY + 0.04, - r - 0.15 ], 0.01, 6 );
	const pumpZ = - r - 0.55;
	parts.box( mat( 0x6f6a60, { roughness: 0.95 } ), [ 0.9, 0.08, 0.5 ], [ 0.2, 0, pumpZ ] );
	parts.path( pvc, [ [ 0, outY, - r - 0.2 ], [ 0, outY, pumpZ ], [ - 0.08, outY, pumpZ ] ], 0.025, 8 );
	parts.rod( blue, [ - 0.08, 0.2, pumpZ ], [ 0.25, 0.2, pumpZ ], 0.1, 14 ); // motor
	parts.box( blue, [ 0.16, 0.2, 0.18 ], [ - 0.1, 0.08, pumpZ ] ); // pump end
	parts.cylinder( blue, 0.17, 0.5, [ 0.5, 0.08, pumpZ ], 16 ); // pressure tank
	parts.sphere( blue, 0.17, [ 0.5, 0.58, pumpZ ], [ 16, 6 ], [ 1, 0.4, 1 ] );
	parts.path( pvc, [ [ - 0.1, 0.32, pumpZ ], [ - 0.1, 0.45, pumpZ ], [ 0.33, 0.45, pumpZ ] ], 0.02, 8 );
	// Pressure switch and gauge, and the discharge hose off to the right.
	parts.box( dark(), [ 0.08, 0.1, 0.06 ], [ 0.05, 0.4, pumpZ - 0.05 ] );
	parts.path( mat( 0x1c1d1f, { roughness: 0.9 } ), [ [ 0.5, 0.2, pumpZ - 0.17 ], [ 0.75, 0.04, pumpZ - 0.3 ], [ 1.6, 0.04, pumpZ - 0.4 ] ], 0.025, 8 );

	return parts.build();

}

// A 1,000 gal steel holding tank (9 × 5 × 3 ft) on a skid with fork pockets, set beside washroom
// and lunchroom trailers on a site with no sewer: a manway on top, the trailers' 4 in inlet and a
// vent stack, a float level gauge, and the pump-out camlock with its cap low on the front for the
// vac truck. Lifting lugs at the corners.
function holdingTank() {

	const parts = new Parts();
	const paint = mat( 0x3d5a45, { roughness: 0.6, metalness: 0.25 } );
	const pvc = mat( 0xe9e9e6, { roughness: 0.5 } );
	const [ length, width, height ] = [ 9 * FT, 5 * FT, 3 * FT ];
	const skid = 0.15;
	const top = skid + height;

	for ( const z of [ - width / 2 + 0.1, width / 2 - 0.1 ] ) parts.box( dark(), [ length + 0.1, skid, 0.1 ], [ 0, 0, z ] );
	for ( const x of [ - 0.6, 0.6 ] ) parts.box( dark(), [ 0.25, skid, width ], [ x, 0, 0 ] );
	parts.box( paint, [ length, height, width ], [ 0, skid, 0 ] );
	for ( const x of [ - length / 4, 0, length / 4 ] ) parts.box( paint, [ 0.06, 0.05, width + 0.03 ], [ x, top - 0.05, 0 ] );

	// Manway and the corner lugs.
	parts.cylinder( paint, 0.3, 0.08, [ - 0.6, top, 0 ], 20 );
	for ( let i = 0; i < 8; i ++ ) {

		const a = i * Math.PI / 4;
		parts.cylinder( steel(), 0.012, 0.03, [ - 0.6 + Math.cos( a ) * 0.26, top + 0.08, Math.sin( a ) * 0.26 ], 6 );

	}

	for ( const [ x, z ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ] ) {

		parts.box( paint, [ 0.02, 0.1, 0.12 ], [ x * ( length / 2 - 0.15 ), top, z * ( width / 2 - 0.1 ) ] );

	}

	// The 4 in inlet from the trailers coming in at the back top, and the vent stack.
	parts.path( pvc, [ [ 0.7, top + 0.06, 0.1 ], [ 0.7, top + 0.06, width / 2 + 0.6 ], [ 2.2, top + 0.06, width / 2 + 0.6 ] ], 0.057, 10 );
	parts.cylinder( paint, 0.08, 0.06, [ 0.7, top, 0.1 ], 12 );
	parts.cylinder( pvc, 0.03, 0.9, [ 1.1, top, - 0.2 ], 10 );
	parts.rod( pvc, [ 1.1, top + 0.9, - 0.2 ], [ 1.1, top + 0.9, - 0.32 ], 0.03, 10 );
	parts.rod( pvc, [ 1.1, top + 0.9, - 0.32 ], [ 1.1, top + 0.8, - 0.32 ], 0.03, 10 );

	// Float gauge: a clear tube with a red ball, and the pump-out camlock and cap on the front.
	const gaugeX = - 1.1;
	parts.cylinder( mat( 0xbcd0d8, { roughness: 0.2, transparent: true, opacity: 0.7 } ), 0.025, height - 0.1, [ gaugeX, skid + 0.05, - width / 2 - 0.04 ], 10 );
	parts.sphere( mat( 0xd02a1e, { roughness: 0.5 } ), 0.022, [ gaugeX, skid + 0.38, - width / 2 - 0.04 ], [ 10, 6 ] );
	parts.rod( steel(), [ 0.3, skid + 0.2, - width / 2 ], [ 0.3, skid + 0.2, - width / 2 - 0.25 ], 0.057, 14 );
	parts.rod( steel(), [ 0.3, skid + 0.2, - width / 2 - 0.12 ], [ 0.3, skid + 0.2, - width / 2 - 0.2 ], 0.07, 14 );
	parts.rod( mat( 0xd8b820, { roughness: 0.5, metalness: 0.4 } ), [ 0.3, skid + 0.2, - width / 2 - 0.25 ], [ 0.3, skid + 0.2, - width / 2 - 0.3 ], 0.065, 14 );
	for ( const s of [ - 1, 1 ] ) parts.rod( steel(), [ 0.3 + s * 0.07, skid + 0.2, - width / 2 - 0.26 ], [ 0.3 + s * 0.13, skid + 0.2, - width / 2 - 0.12 ], 0.01, 6 );

	const label = drawn( 'wastewater label', [ 320, 96 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#f1d21d';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#111111';
		ctx.font = 'bold 36px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText( 'NON-POTABLE', w / 2, 40 );
		ctx.font = 'bold 30px sans-serif';
		ctx.fillText( 'WASTEWATER', w / 2, 82 );

	} );
	sign( parts, label, 0.6, 0.18, [ - 0.4, skid + 0.6, - width / 2 - 0.004 ] );

	return parts.build();

}

// An 8 × 16 ft first aid trailer on blocking behind a skirt: white walls with green-and-white crosses and
// FIRST AID lettering, the door on the front with an AED sign by it, windows, a wall AC unit on
// the right end, and a landing at the door with steps down to the front and a railed ramp off to
// the right for a stretcher or wheelchair.
function firstAidTrailer() {

	const parts = new Parts();
	const wall = mat( 0xf2f2ee, { roughness: 0.6 } );
	const trim = mat( 0xb8bcbf, { roughness: 0.5, metalness: 0.4 } );
	const skirt = mat( 0x5c6064, { roughness: 0.8 } );
	const glass = mat( 0x2b3d48, { roughness: 0.1, metalness: 0.3 } );
	const alu = galvanised();
	const tread = mat( 0x8d9194, { roughness: 0.6, metalness: 0.5 } );
	const [ length, width ] = [ 16 * FT, 8 * FT ];
	const floor = 0.6;
	const box = 2.45;
	const roof = floor + box;
	const front = - width / 2;

	// Skirt, box, roof edge.
	parts.box( skirt, [ length - 0.04, floor, width - 0.04 ], [ 0, 0, 0 ] );
	parts.box( wall, [ length, box, width ], [ 0, floor, 0 ] );
	parts.box( trim, [ length + 0.06, 0.08, width + 0.06 ], [ 0, roof, 0 ] );
	parts.box( trim, [ length + 0.02, 0.05, width + 0.02 ], [ 0, floor, 0 ] );

	// Door, windows (front and back) and the AC unit on the right end.
	const doorX = - 1.2;
	parts.box( trim, [ 0.96, 2.06, 0.04 ], [ doorX, floor + 0.02, front - 0.02 ] );
	parts.box( glass, [ 0.3, 0.5, 0.01 ], [ doorX, floor + 1.25, front - 0.045 ] );
	parts.box( dark(), [ 0.04, 0.12, 0.06 ], [ doorX + 0.36, floor + 1.0, front - 0.06 ] );
	for ( const [ x, z ] of [ [ 1.6, front ], [ - 1.2, - front ], [ 1.2, - front ] ] ) {

		parts.box( trim, [ 0.84, 0.66, 0.03 ], [ x, floor + 1.15, z ] );
		parts.box( glass, [ 0.76, 0.58, 0.04 ], [ x, floor + 1.19, z ] );

	}

	parts.box( mat( 0xd9d9d4, { roughness: 0.6 } ), [ 0.35, 0.45, 0.6 ], [ length / 2 + 0.17, floor + 1.4, 0 ] );
	for ( let i = 0; i < 5; i ++ ) parts.box( dark(), [ 0.01, 0.02, 0.5 ], [ length / 2 + 0.35, floor + 1.5 + i * 0.06, 0 ] );

	// Markings: the first aid symbol (a white cross on a green square, ISO 7010 E003) and FIRST AID
	// on the front, back and both ends, and the AED sign.
	const marking = drawn( 'first aid marking', [ 512, 192 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#ffffff';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#1e9a4a';
		const c = 96;
		ctx.fillRect( c - 84, 12, 168, 168 );
		ctx.fillStyle = '#ffffff';
		ctx.fillRect( c - 20, 36, 40, 120 );
		ctx.fillRect( c - 60, 76, 120, 40 );
		ctx.fillStyle = '#145c2e';
		ctx.font = 'bold 76px sans-serif';
		ctx.textBaseline = 'middle';
		ctx.fillText( 'FIRST', 196, 60 );
		ctx.fillText( 'AID', 196, 140 );

	}, { alphaTest: 0 } );
	sign( parts, marking, 1.6, 0.6, [ 1.2, floor + 2.05, front - 0.005 ] );
	sign( parts, marking, 1.6, 0.6, [ 0, floor + 2.05, - front + 0.005 ], true );
	for ( const s of [ - 1, 1 ] ) parts.add( marking, new PlaneGeometry( 1.6, 0.6 ), _m.makeRotationY( s * Math.PI / 2 ).setPosition( s * ( length / 2 + 0.005 ), floor + 2.05, 0 ) );
	const aed = drawn( 'aed sign', [ 128, 160 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#1e9a4a';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#ffffff';
		ctx.beginPath();
		ctx.moveTo( 64, 120 );
		ctx.bezierCurveTo( 10, 80, 18, 24, 64, 48 );
		ctx.bezierCurveTo( 110, 24, 118, 80, 64, 120 );
		ctx.fill();
		ctx.fillStyle = '#1e9a4a';
		ctx.beginPath();
		ctx.moveTo( 70, 50 );
		ctx.lineTo( 52, 84 );
		ctx.lineTo( 66, 84 );
		ctx.lineTo( 58, 112 );
		ctx.lineTo( 80, 74 );
		ctx.lineTo( 66, 74 );
		ctx.closePath();
		ctx.fill();
		ctx.fillStyle = '#ffffff';
		ctx.font = 'bold 34px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText( 'AED', 64, 152 );

	} );
	sign( parts, aed, 0.3, 0.375, [ doorX - 0.75, floor + 1.55, front - 0.005 ] );

	// Landing in front of the door, steps down to the front, the ramp to the right.
	const landing = [ 1.5, 1.5 ];
	const landingZ = front - landing[ 1 ] / 2;
	parts.box( tread, [ landing[ 0 ], 0.05, landing[ 1 ] ], [ doorX, floor - 0.05, landingZ ] );
	for ( const [ x, z ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ], [ 1, 1 ] ] ) parts.box( alu, [ 0.06, floor - 0.05, 0.06 ], [ doorX + x * 0.7, 0, landingZ + z * 0.7 ] );
	const steps = 3;
	const rise = floor / ( steps + 1 );
	const run = 0.28;
	const stepFront = front - landing[ 1 ];
	for ( let i = 0; i < steps; i ++ ) parts.box( tread, [ 1.0, 0.04, run ], [ doorX, floor - rise * ( i + 1 ) - 0.04, stepFront - run * ( i + 0.5 ) ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.prism( alu, [ [ stepFront, floor - 0.05 ], [ stepFront, floor - 0.15 ], [ stepFront - run * steps, 0 ], [ stepFront - run * steps - 0.08, 0 ] ], 0.03, doorX + s * 0.5 );
		parts.path( alu, [ [ doorX + s * 0.52, rise + 0.9, stepFront - run * steps ], [ doorX + s * 0.52, floor + 0.9, stepFront ] ], 0.02, 8 );
		parts.rod( alu, [ doorX + s * 0.52, rise, stepFront - run * steps + 0.05 ], [ doorX + s * 0.52, rise + 0.9, stepFront - run * steps + 0.05 ], 0.02, 8 );

	}

	// The landing's guard rail on the left and front corner.
	const rail = floor + 1.07;
	parts.path( alu, [ [ doorX - 0.75, rail, front ], [ doorX - 0.75, rail, stepFront ], [ doorX - 0.5, rail, stepFront ] ], 0.02, 8 );
	parts.rod( alu, [ doorX - 0.75, floor, stepFront ], [ doorX - 0.75, rail, stepFront ], 0.02, 8 );

	// The ramp: 1 : 8 from the landing's right side down to the ground, 1.1 m wide, with rails.
	const rampW = 1.1;
	const rampZ = front - rampW / 2 - 0.02;
	const rampX0 = doorX + landing[ 0 ] / 2;
	const rampLength = floor * 8;
	const rampX1 = rampX0 + rampLength;
	const slope = Math.atan2( floor, rampLength );
	parts.block( tread, [ Math.hypot( rampLength, floor ), 0.05, rampW ], [ ( rampX0 + rampX1 ) / 2, floor / 2 - 0.02, rampZ ], [ 0, 0, - slope ] );
	for ( const t of [ 0.25, 0.5, 0.75 ] ) parts.box( alu, [ 0.05, floor * ( 1 - t ) - 0.04, rampW - 0.1 ], [ rampX0 + rampLength * t, 0, rampZ ] );
	for ( const z of [ rampZ - rampW / 2, rampZ + rampW / 2 - 0.03 ] ) {

		parts.rod( alu, [ rampX0, floor + 0.9, z ], [ rampX1, 0.9, z ], 0.02, 8 );
		for ( const t of [ 0, 0.5, 1 ] ) parts.rod( alu, [ rampX0 + rampLength * t, floor * ( 1 - t ) - 0.02, z ], [ rampX0 + rampLength * t, floor * ( 1 - t ) + 0.9, z ], 0.02, 8 );

	}

	return parts.build();

}

// A 4,000 W LED balloon light on its tripod stand, as rented for night roadwork and paving: three
// legs splayed 2 m across with a sandbag on each, a telescoping mast run up to 12 ft, the glowing
// pillow-shaped balloon on top and the driver box on the mast with its cord to the ground.
function balloonLight() {

	const parts = new Parts();
	const alu = galvanised();
	const glow = mat( 0xfffbf0, { roughness: 0.6, emissive: 0xfff1d6, emissiveIntensity: 0.9 } );
	const sand = mat( 0x9a8155, { roughness: 1 } );
	const hub = 0.85;
	const spread = 1.0;
	const mast = 12 * FT;

	for ( let i = 0; i < 3; i ++ ) {

		const a = - Math.PI / 2 + i * 2 * Math.PI / 3;
		const [ x, z ] = [ Math.cos( a ) * spread, Math.sin( a ) * spread ];
		parts.rod( alu, [ Math.cos( a ) * 0.06, hub, Math.sin( a ) * 0.06 ], [ x, 0.03, z ], 0.022, 8 );
		parts.rod( alu, [ Math.cos( a ) * 0.06, hub - 0.45, Math.sin( a ) * 0.06 ], [ x * 0.5, 0.42, z * 0.5 ], 0.012, 6 );
		parts.cylinder( rubber(), 0.04, 0.03, [ x, 0, z ], 10 );
		// A sandbag over the leg a little in from its foot.
		parts.sphere( sand, 0.18, [ x * 0.82, 0.16, z * 0.82 ], [ 10, 6 ], [ 1.3, 0.55, 0.8 ] );

	}

	// Mast sections, the collar at the hub, the driver box.
	parts.cylinder( alu, 0.05, hub + 0.3, [ 0, 0.3, 0 ], 12 );
	parts.cylinder( alu, 0.065, 0.12, [ 0, hub - 0.06, 0 ], 12 );
	parts.cylinder( alu, 0.04, 1.4, [ 0, hub + 0.3, 0 ], 12 );
	parts.cylinder( alu, 0.03, mast - hub - 1.7, [ 0, hub + 1.7, 0 ], 10 );
	parts.box( dark(), [ 0.22, 0.3, 0.12 ], [ 0, 1.0, - 0.12 ] );
	parts.path( rubber(), [ [ 0, 1.0, - 0.18 ], [ 0.05, 0.4, - 0.3 ], [ 0.15, 0.015, - 0.8 ], [ 0.5, 0.015, - 2.2 ] ], 0.012, 6 );

	// The balloon: a soft pillow about 1.3 m across, with its base cap and tether eyes.
	parts.cylinder( dark(), 0.12, 0.12, [ 0, mast - 0.05, 0 ], 14 );
	parts.sphere( glow, 0.68, [ 0, mast + 0.5, 0 ], [ 24, 12 ], [ 1, 0.72, 1 ] );

	return parts.build();

}

// A trailer that brings internet to a remote site: a single-axle trailer on its jacks with an
// equipment and battery cabinet, three solar panels over it, a satellite dish on the deck, and a
// 20 ft mast at the back topped with LTE panel antennas, Wi-Fi omnis and a beacon. The drawbar is
// to the front (-Z), like the generators and light towers.
function internetMast() {

	const parts = new Parts();
	const body = white();
	const alu = galvanised();
	const deckY = 0.5;
	signTrailer( parts, { width: 1.6, length: 2.6, deckY, colour: body, tongue: - 1 } );

	// The cabinet, with vents and a door seam on the front, and the solar panels above.
	const cabTop = deckY + 0.1 + 0.9;
	parts.box( body, [ 1.3, 0.9, 1.3 ], [ 0, deckY + 0.1, - 0.45 ] );
	parts.box( dark(), [ 0.004, 0.75, 0.004 ], [ 0, deckY + 0.15, - 1.105 ] );
	for ( let i = 0; i < 4; i ++ ) parts.box( dark(), [ 0.3, 0.015, 0.01 ], [ 0.35, deckY + 0.6 + i * 0.05, - 1.1 ] );
	solarPanels( parts, 3, [ 0.66, 1.6 ], [ cabTop + 0.75, - 0.5 ], - 18 * Math.PI / 180, cabTop );

	// The satellite dish on a short post at the front right of the deck, aimed up and forward.
	const dish = white();
	const post = [ 0.55, deckY + 0.1, - 1.2 ];
	parts.cylinder( alu, 0.035, 0.75, post, 10 );
	const centre = [ post[ 0 ], post[ 1 ] + 0.95, post[ 2 ] ];
	const aim = [ 0, Math.sin( 0.7 ), - Math.cos( 0.7 ) ];
	parts.rod( dish, centre, [ centre[ 0 ] - aim[ 0 ] * 0.14, centre[ 1 ] - aim[ 1 ] * 0.14, centre[ 2 ] - aim[ 2 ] * 0.14 ], [ 0.42, 0.06 ], 20 );
	parts.rod( alu, [ centre[ 0 ], centre[ 1 ] - 0.4, centre[ 2 ] ], [ centre[ 0 ], centre[ 1 ] - 0.12, centre[ 2 ] ], 0.03, 8 );
	parts.rod( alu, [ centre[ 0 ], centre[ 1 ] - 0.3, centre[ 2 ] - 0.02 ], [ centre[ 0 ], centre[ 1 ] + aim[ 1 ] * 0.5, centre[ 2 ] + aim[ 2 ] * 0.5 ], 0.012, 6 );
	parts.box( dark(), [ 0.08, 0.08, 0.12 ], [ centre[ 0 ], centre[ 1 ] + aim[ 1 ] * 0.5 - 0.04, centre[ 2 ] + aim[ 2 ] * 0.5 ] );

	// The mast: a base box and three sections narrowing to 20 ft.
	const mastZ = 0.6;
	const top = 20 * FT;
	parts.box( body, [ 0.22, 1.0, 0.22 ], [ 0, deckY + 0.1, mastZ ] );
	for ( const [ w, y0, y1 ] of [ [ 0.15, cabTop, 3.0 ], [ 0.11, 3.0, 4.6 ], [ 0.08, 4.6, top - 0.6 ] ] ) parts.box( alu, [ w, y1 - y0, w ], [ 0, y0, mastZ ] );

	// The head: a crossarm with an LTE panel at each end and a Wi-Fi omni beside it, the radio box
	// under the arm, and an amber beacon on the very top.
	const armY = top - 0.6;
	parts.box( alu, [ 1.1, 0.06, 0.06 ], [ 0, armY, mastZ ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.block( body, [ 0.16, 0.6, 0.07 ], [ s * 0.5, armY + 0.2, mastZ - 0.06 ], [ 0, s * 0.3, 0 ] );
		parts.cylinder( body, 0.015, 0.5, [ s * 0.3, armY + 0.06, mastZ ], 8 );

	}

	parts.box( body, [ 0.3, 0.35, 0.12 ], [ 0, armY - 0.45, mastZ - 0.1 ] );
	parts.cylinder( alu, 0.04, 0.55, [ 0, armY, mastZ ], 10 );
	parts.cylinder( mat( 0xffa020, { roughness: 0.3, emissive: 0xc76a00, emissiveIntensity: 0.5 } ), 0.05, 0.1, [ 0, armY + 0.55, mastZ ], 12 );

	return parts.build();

}

// --- barriers and work zone traffic control --------------------------------------------------

// A 10 ft jersey barrier (the same 32 in profile as jersey-barrier) with a 6 ft chain-link panel
// clamped on top: a post at each end in a sleeve bracket bolted to the barrier's top, rails top
// and bottom. Rows of them butt end to end, the panel ends meeting over the barrier joints.
function barrierFence() {

	const parts = new Parts();
	const concrete = mat( 0xb5b2aa, { roughness: 0.95 } );
	const fabric = drawn( 'chain link fabric', [ 1024, 512 ], ( ctx, w, h ) => {

		ctx.strokeStyle = '#b4b8bb';
		ctx.lineWidth = 3;
		const n = 48;
		const step = w / n;
		for ( let i = - n; i <= n * 2; i ++ ) {

			ctx.beginPath();
			ctx.moveTo( i * step, 0 );
			ctx.lineTo( i * step + h, h );
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo( i * step, 0 );
			ctx.lineTo( i * step - h, h );
			ctx.stroke();

		}

	}, { side: DoubleSide, metalness: 0.4 } );
	const length = 10 * FT;
	const barrier = 32 * IN;

	// The barrier: the profile across z extruded along x, with lifting slots through the foot.
	const half = [ [ 12, 0 ], [ 12, 3 ], [ 5, 13 ], [ 3, 32 ] ].map( ( [ z, y ] ) => [ z * IN, y * IN ] );
	const profile = [ ...half.map( ( [ z, y ] ) => [ - z, y ] ), ...half.slice().reverse().map( ( [ z, y ] ) => [ z, y ] ) ];
	parts.prism( concrete, profile.slice().reverse(), length );
	for ( const x of [ - 0.9, 0.9 ] ) parts.box( dark(), [ 0.3, 0.08, 24 * IN + 0.004 ], [ x, 0, 0 ] );

	// Sleeve brackets on the top and the panel in them.
	const galv = galvanised();
	const postX = length / 2 - 0.04;
	const panelBottom = barrier + 0.08;
	const panelTop = panelBottom + 6 * FT;
	for ( const s of [ - 1, 1 ] ) {

		parts.box( galv, [ 0.14, 0.012, 6 * IN ], [ s * ( postX - 0.03 ), barrier, 0 ] );
		parts.cylinder( galv, 0.03, 0.15, [ s * postX, barrier, 0 ], 10 );
		parts.cylinder( galv, 0.021, panelTop - barrier, [ s * postX, barrier, 0 ], 10 );

	}

	for ( const y of [ panelBottom, panelTop - 0.02 ] ) parts.rod( galv, [ - postX, y, 0 ], [ postX, y, 0 ], 0.017, 8 );
	parts.rod( galv, [ 0, panelBottom, 0 ], [ 0, panelTop - 0.02, 0 ], 0.017, 8 );
	sign( parts, fabric, 2 * postX - 0.04, panelTop - panelBottom - 0.04, [ 0, ( panelBottom + panelTop ) / 2 - 0.01, 0 ] );

	return parts.build();

}

// A radar speed display trailer: a single-axle trailer (tongue to the back) on its jacks with a
// battery box and a solar panel, and a mast carrying the SPEED LIMIT sign over the YOUR SPEED board
// with its amber LED digits, facing traffic at the front, and a strobe on each top corner.
function radarTrailer() {

	const parts = new Parts();
	const body = white();
	const deckY = 0.45;
	signTrailer( parts, { width: 1.3, length: 1.6, deckY, colour: body } );

	// Battery box and the solar panel on a frame above it.
	parts.box( body, [ 1.0, 0.55, 0.7 ], [ 0, deckY + 0.1, 0.35 ] );
	solarPanels( parts, 1, [ 1.0, 1.3 ], [ deckY + 1.6, 0.45 ], - 25 * Math.PI / 180, deckY + 0.65 );

	// The mast, the board and the speed limit sign above.
	const mastZ = - 0.5;
	const boardY = 1.55;
	const [ bw, bh ] = [ 1.2, 1.05 ];
	parts.box( galvanised(), [ 0.1, 2.75 - deckY, 0.1 ], [ 0, deckY + 0.1, mastZ ] );
	parts.box( dark(), [ bw, bh, 0.16 ], [ 0, boardY, mastZ - 0.13 ] );
	const board = drawn( 'radar speed board 27', [ 320, 280 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#ffffff';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#111111';
		ctx.font = 'bold 44px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText( 'YOUR SPEED', w / 2, 56 );
		ctx.fillRect( 24, 80, w - 48, h - 100 );
		// LED digits: dots in the shape of each figure.
		ctx.fillStyle = '#ffb21a';
		ctx.shadowColor = '#ff8a00';
		ctx.shadowBlur = 6;
		ctx.font = 'bold 170px monospace';
		ctx.fillText( '27', w / 2, h - 36 );

	}, { emissive: 0x332000, emissiveIntensity: 0.4 } );
	sign( parts, board, bw - 0.04, bh - 0.04, [ 0, boardY + bh / 2, mastZ - 0.212 ] );

	const limit = drawn( 'speed limit 30', [ 192, 240 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#111111';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#ffffff';
		ctx.fillRect( 6, 6, w - 12, h - 12 );
		ctx.fillStyle = '#111111';
		ctx.font = 'bold 42px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText( 'SPEED', w / 2, 56 );
		ctx.fillText( 'LIMIT', w / 2, 102 );
		ctx.font = 'bold 110px sans-serif';
		ctx.fillText( '30', w / 2, 212 );

	} );
	const limitY = boardY + bh + 0.08;
	parts.box( mat( 0x9fa3a6, { roughness: 0.5, metalness: 0.5 } ), [ 0.6, 0.75, 0.01 ], [ 0, limitY, mastZ - 0.06 ] );
	sign( parts, limit, 0.6, 0.75, [ 0, limitY + 0.375, mastZ - 0.067 ] );

	// Strobes on the board's top corners.
	const strobe = mat( 0xffa020, { roughness: 0.3, emissive: 0xc76a00, emissiveIntensity: 0.5 } );
	for ( const s of [ - 1, 1 ] ) parts.cylinder( strobe, 0.05, 0.1, [ s * ( bw / 2 - 0.08 ), boardY + bh, mastZ - 0.13 ], 12 );

	return parts.build();

}

// An automated flagger assistance device: a single-axle trailer (tongue to the back) with its
// battery box and solar panels, and a mast at the front carrying a red-over-amber signal head and
// the STOP/SLOW sign facing traffic, and a red and white gate arm lowered across the lane to the
// right (+X), as it stands at the right shoulder.
function afadTrailer() {

	const parts = new Parts();
	const body = mat( 0xf0c419, { roughness: 0.5, metalness: 0.2 } );
	const deckY = 0.5;
	signTrailer( parts, { width: 1.5, length: 2.2, deckY, colour: body } );

	// Battery box and the two panels over it.
	parts.box( body, [ 1.2, 0.7, 1.0 ], [ 0, deckY + 0.1, 0.45 ] );
	solarPanels( parts, 2, [ 0.7, 1.4 ], [ deckY + 1.75, 0.45 ], - 20 * Math.PI / 180, deckY + 0.8 );

	// The mast and the signal head on top: two 12 in lenses in a black housing with visors.
	const mastZ = - 0.75;
	const headY = 3.1;
	parts.box( galvanised(), [ 0.12, headY - deckY, 0.12 ], [ 0, deckY + 0.1, mastZ ] );
	parts.box( dark(), [ 0.4, 0.85, 0.25 ], [ 0, headY, mastZ - 0.06 ] );
	const red = mat( 0xe0141e, { roughness: 0.3, emissive: 0xb00a10, emissiveIntensity: 0.9 } );
	const amber = mat( 0x7a5a10, { roughness: 0.3 } );
	for ( const [ y, lens ] of [ [ headY + 0.62, red ], [ headY + 0.22, amber ] ] ) {

		parts.rod( lens, [ 0, y, mastZ - 0.18 ], [ 0, y, mastZ - 0.2 ], 0.15, 20 );
		parts.rod( dark(), [ 0, y + 0.02, mastZ - 0.19 ], [ 0, y + 0.02, mastZ - 0.4 ], [ 0.17, 0.17 ], 16, true );

	}

	// The STOP / SLOW sign on a bracket under the head, showing STOP to traffic; its back is bare.
	const size = 30 * IN;
	const signY = headY - 0.15 - size / 2;
	const stop = drawn( 'afad stop', [ 256, 256 ], ( ctx, w ) => {

		octagon( ctx, w, w / 2 / Math.cos( Math.PI / 8 ) );
		ctx.fillStyle = '#ffffff';
		ctx.fill();
		octagon( ctx, w, w / 2 / Math.cos( Math.PI / 8 ) * 0.92 );
		ctx.fillStyle = '#c8102e';
		ctx.fill();
		ctx.fillStyle = '#ffffff';
		ctx.font = 'bold 84px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText( 'STOP', w / 2, w / 2 + 4 );

	} );
	const back = drawn( 'afad stop back', [ 128, 128 ], ( ctx, w ) => {

		octagon( ctx, w, w / 2 / Math.cos( Math.PI / 8 ) );
		ctx.fillStyle = '#9fa3a6';
		ctx.fill();

	}, { metalness: 0.5 } );
	parts.box( galvanised(), [ 0.04, size * 0.9, 0.03 ], [ 0, signY - size * 0.45, mastZ - 0.08 ] );
	sign( parts, stop, size, size, [ 0, signY, mastZ - 0.1 ] );
	sign( parts, back, size, size, [ 0, signY, mastZ - 0.095 ], true );

	// The gate arm: a drive housing on the mast's right, the arm out 12 ft across the lane in red
	// and white bands with a counterweight stub on the left.
	const armY = 1.2;
	const armZ = mastZ - 0.12;
	parts.box( dark(), [ 0.3, 0.35, 0.22 ], [ 0.18, armY - 0.17, armZ + 0.05 ] );
	const reach = 12 * FT;
	const band = 0.3;
	const redPaint = mat( 0xd0202a, { roughness: 0.4 } );
	const whitePaint = mat( 0xf4f4f0, { roughness: 0.4 } );
	for ( let i = 0, x = 0.33; x < 0.33 + reach - 1e-6; i ++, x += band ) {

		const l = Math.min( band, 0.33 + reach - x );
		parts.box( i % 2 ? whitePaint : redPaint, [ l, 0.09, 0.05 ], [ x + l / 2, armY - 0.045, armZ - 0.08 ] );

	}

	parts.box( dark(), [ 0.35, 0.14, 0.1 ], [ - 0.05, armY - 0.07, armZ - 0.08 ] );
	parts.cylinder( red, 0.03, 0.05, [ 0.33 + reach - 0.1, armY + 0.045, armZ - 0.08 ], 10 );

	return parts.build();

}

function octagon( ctx, w, r ) {

	ctx.beginPath();
	for ( let i = 0; i < 8; i ++ ) {

		const a = ( i + 0.5 ) * Math.PI / 4;
		ctx[ i ? 'lineTo' : 'moveTo' ]( w / 2 + r * Math.cos( a ), w / 2 + r * Math.sin( a ) );

	}

	ctx.closePath();

}

// Three portable rumble strips across one lane, 10 ft apart: each 11 ft long and 13 in wide,
// about ¾ in high, orange with ridges along it and bevelled edges, weighted by their own mass.
function rumbleStrips() {

	const parts = new Parts();
	const orange = mat( 0xe8641c, { roughness: 0.7 } );
	const length = 11 * FT;
	const width = 13 * IN;
	const h = 0.75 * IN;
	const ridges = 5;

	// The cross-section across the strip (in z): bevels at each edge, ridges between.
	const profile = [ [ - width / 2, 0 ], [ width / 2, 0 ], [ width / 2 - 0.05, h * 0.7 ] ];
	const inner = width - 0.1;
	for ( let i = ridges - 1; i >= 0; i -- ) {

		const z0 = - inner / 2 + inner * i / ridges;
		const z1 = z0 + inner / ridges;
		profile.push( [ z1 - 0.008, h ], [ z0 + 0.03, h ], [ z0 + 0.015, h * 0.7 ] );

	}

	profile.push( [ - width / 2 + 0.05, h * 0.7 ] );
	for ( const z of [ - 10 * FT, 0, 10 * FT ] ) {

		parts.prism( orange, profile.map( ( [ pz, y ] ) => [ pz + z, y ] ), length );

	}

	return parts.build();

}
