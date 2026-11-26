import { CylinderGeometry, ExtrudeGeometry, Matrix4, Shape, TorusGeometry, Vector2, Vector3 } from 'three';
import { BLACK, FT, GALVANISED, GLASS, IN, mat, Parts, RUBBER, STEEL } from './parts.js';
import { memberGeometry } from './plant-parts.js';

// Sea cans (ISO shipping containers) and tool cribs, built in code at their real sizes, in metres.
// One builder makes every container: trapezoidal corrugated sides, ends, doors and a dished roof,
// corner posts and castings with their holes, side rails, fork pockets, and a door end with two
// doors, four locking bars and their cam keepers, handles, hinges and gaskets. The site office,
// stacked pair and tool cribs are that container with things cut into it or put inside. Like the
// other built-in pieces each stands on y = 0 with its front facing -Z: a container's doors, an
// office's man door, a roll-up door, a trailer's tongue, a gang box's locks.

export const CONTAINER_ITEMS = [
	{ id: 'container-10', name: 'Shipping container (10 ft)', category: 'Site trailers & containers',
		keywords: 'sea can seacan conex iso shipping container storage 10 foot small', build: () => shippingContainer( { length: 2.991, color: 0x8e3b2a, pockets: [ - 0.55, 0.55 ] } ) },
	{ id: 'container-40', name: 'Shipping container (40 ft standard)', category: 'Site trailers & containers',
		keywords: 'sea can seacan conex iso shipping container storage 40 foot standard height', build: () => shippingContainer( { length: 12.192, color: 0x8e3b2a } ) },
	{ id: 'container-20-open', name: 'Shipping container (20 ft, doors open)', category: 'Site trailers & containers',
		keywords: 'sea can seacan conex iso shipping container storage 20 foot open doors empty', build: () => shippingContainer( { length: 6.058, color: 0x2a4f8e, pockets: POCKETS_20, doors: 270 } ) },
	{ id: 'container-20-green', name: 'Shipping container (20 ft, green)', category: 'Site trailers & containers',
		keywords: 'sea can seacan conex iso shipping container storage 20 foot green', build: () => shippingContainer( { length: 6.058, color: 0x36573a, pockets: POCKETS_20 } ) },
	{ id: 'container-20-white', name: 'Shipping container (20 ft, white)', category: 'Site trailers & containers',
		keywords: 'sea can seacan conex iso shipping container storage 20 foot white grey gray', build: () => shippingContainer( { length: 6.058, color: 0xd3d5d1, pockets: POCKETS_20 } ) },
	{ id: 'container-20-stacked', name: 'Shipping containers, two 20 ft stacked (5.2 m high)', category: 'Site trailers & containers',
		keywords: 'sea can seacan conex iso shipping container storage 20 foot stacked double two high', build: stackedContainers },
	{ id: 'container-office-20', name: 'Sea can site office, 20 ft conversion (man door, window, wall AC, steel step)', category: 'Site trailers & containers',
		keywords: 'sea can seacan conex container office conversion site office shack man door window ac', build: containerOffice },
	{ id: 'tool-crib-8', name: 'Tool crib, 8 ft container (doors open, shelving)', category: 'Site trailers & containers',
		keywords: 'tool crib storage container sea can conex 8 foot small shelving bins open', build: toolCrib8 },
	{ id: 'tool-crib-20', name: 'Tool crib, 20 ft container (doors open, shelving, cords and hoses)', category: 'Site trailers & containers',
		keywords: 'tool crib storage container sea can conex 20 foot shelving bins extension cords hoses open', build: toolCrib20 },
	{ id: 'tool-crib-20-rollup', name: 'Tool crib, 20 ft container with side roll-up door (open)', category: 'Site trailers & containers',
		keywords: 'tool crib storage container sea can conex 20 foot roll up door overhead side opening shelving', build: toolCribRollUp },
	{ id: 'tool-crib-trailer-7x16', name: 'Tool crib trailer, enclosed cargo 7 × 16 ft (V-nose, tandem axle, ramp door)', category: 'Site trailers & containers',
		keywords: 'tool crib trailer enclosed cargo trailer job trailer tandem axle ramp door bumper pull 7x16', build: cargoTrailer },
	{ id: 'gang-box-48', name: 'Gang box / job box, steel (48 × 24 × 28 in)', category: 'Site trailers & containers',
		keywords: 'gang box job box jobox knaack tool box chest lockable steel', build: () => gangBox( { width: 48 * IN, depth: 24 * IN, height: 28 * IN, color: 0xe3a51c } ) },
	{ id: 'gang-box-60', name: 'Gang box / job box on casters, steel (60 × 30 × 33 in)', category: 'Site trailers & containers',
		keywords: 'gang box job box jobox knaack tool box chest lockable steel casters rolling', build: () => gangBox( { width: 60 * IN, depth: 30 * IN, height: 33 * IN, color: 0x2f5f96, casters: true, locks: 2 } ) },
	{ id: 'gang-box-piano-60', name: 'Piano job box on casters, steel (60 × 30 × 49 in)', category: 'Site trailers & containers',
		keywords: 'piano box gang box job box jobox knaack tool box lockable steel casters tall', build: () => gangBox( { width: 60 * IN, depth: 30 * IN, height: 49 * IN, color: 0x3c6b45, casters: true, locks: 2, piano: true } ) },
	{ id: 'tool-cage-8x4', name: 'Tool cage, lockable mesh on skids (8 × 4 × 7 ft)', category: 'Site trailers & containers',
		keywords: 'tool cage mesh cage lockable storage cage skid wire crib gas cylinder', build: toolCage },
];

// Fork pocket centres on a 20 ft container, from its middle.
const POCKETS_20 = [ - 1.025, 1.025 ];

const HOLE = () => mat( 0x121314, { roughness: 0.9 } );
const FLOOR_PLY = () => mat( 0x9c7449, { roughness: 0.85 } );
const UNDERSIDE = () => mat( 0x262728, { roughness: 0.9 } );
const SEAM = () => mat( 0x5e4429, { roughness: 0.9 } );

const _m = new Matrix4();

// A matrix that turns by `turn` (radians about y) and then moves to [ x, y, z ].
const turned = ( [ x, y, z ], turn = 0 ) => new Matrix4().makeRotationY( turn ).setPosition( x, y, z );

// Parts that land in another Parts moved by `matrix`: a container stacked on another, a door
// swung open on its hinges, a shelving unit stood against a wall, a whole item turned.
class Moved extends Parts {

	constructor( target, matrix ) {

		super();
		this.target = target;
		this.matrix = matrix;

	}

	add( material, geometry, matrix = null ) {

		if ( matrix ) geometry.applyMatrix4( matrix );
		return this.target.add( material, geometry, this.matrix );

	}

}

// Repeatable "random" numbers, so a crib's shelves come out the same each time.
function random( seed ) {

	let s = seed >>> 0;
	return () => {

		s = ( s + 0x6d2b79f5 ) >>> 0;
		let t = s;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	};

}

const pick = ( rand, list ) => list[ Math.floor( rand() * list.length ) ];

// --- corrugated steel ------------------------------------------------------------------------

// Trapezoidal corrugation: `pitch` crest to crest, `depth` trough to crest, `crest` and `trough`
// the widths of the flats (the rest is the two sloping flanks), a crest's middle at `phase`.
// The sides are the 278 mm pitch, 36 mm deep profile of an ISO box; the closed end is deeper and
// wider; the roof is shallow.
const SIDE_WAVE = { pitch: 0.278, depth: 0.036, crest: 0.072, trough: 0.068 };
const ROOF_WAVE = { pitch: 0.2, depth: 0.02, crest: 0.09, trough: 0.07 };

function waveHeight( u, { pitch, depth, crest, trough, phase = 0 } ) {

	const flank = ( pitch - crest - trough ) / 2;
	let t = ( ( u - phase + crest / 2 ) % pitch + pitch ) % pitch;
	if ( t <= crest ) return depth;
	t -= crest;
	if ( t <= flank ) return depth * ( 1 - t / flank );
	t -= flank;
	if ( t <= trough ) return 0;
	return depth * ( t - trough ) / flank;

}

// Where the profile bends between `from` and `to`, with the ends.
function waveBreaks( from, to, { pitch, crest, trough, phase = 0 } ) {

	const flank = ( pitch - crest - trough ) / 2;
	const offsets = [ - crest / 2, crest / 2, crest / 2 + flank, crest / 2 + flank + trough ];
	const us = [ from ];
	for ( let k = Math.floor( ( from - phase ) / pitch ) - 1; phase + k * pitch - crest / 2 < to; k ++ ) {

		for ( const o of offsets ) {

			const u = phase + k * pitch + o;
			if ( u > from + 1e-4 && u < to - 1e-4 ) us.push( u );

		}

	}

	us.push( to );
	return us;

}

// A corrugated sheet `thick` thick: the profile runs `along` from u = `from` to `to` with its
// crests standing `out` from the trough plane through `origin`, and the sheet reaches `length`
// in the direction `extrude`. `bend` can move its points afterwards (to dish a roof).
function corrugated( parts, material, { origin, along, out, extrude = [ 0, 1, 0 ], from, to, length, wave, thick = 0.003, bend = null } ) {

	const a = new Vector3( ...along );
	const o = new Vector3( ...out );
	const e = new Vector3( ...extrude );
	let w = wave;
	// Keep the axes right-handed so the faces point outwards: run the profile the other way.
	if ( a.clone().cross( o ).dot( e ) < 0 ) {

		a.negate();
		[ from, to ] = [ - to, - from ];
		w = { ...wave, phase: - ( wave.phase || 0 ) };

	}

	const us = waveBreaks( from, to, w );
	const outer = us.map( u => new Vector2( u, waveHeight( u, w ) ) );
	const inner = us.slice().reverse().map( u => new Vector2( u, waveHeight( u, w ) - thick ) );
	const geometry = new ExtrudeGeometry( new Shape( [ ...outer, ...inner ] ), { depth: length, bevelEnabled: false } );
	geometry.applyMatrix4( _m.makeBasis( a, o, e ).setPosition( ...origin ) );
	if ( bend ) {

		bend( geometry.attributes.position );
		geometry.computeVertexNormals();

	}

	return parts.add( material, geometry );

}

// An oval hole (a corner casting's) on a face whose normal is along `axis`, of size [ a, b ]:
// across z and y on an x face, x and y on a z face, x and z on a y face.
const DISC = new CylinderGeometry( 1, 1, 1, 14 );
function hole( parts, centre, axis, [ a, b ] ) {

	const matrix = new Matrix4();
	if ( axis === 'y' ) matrix.makeScale( a / 2, 0.004, b / 2 );
	if ( axis === 'x' ) matrix.makeScale( b / 2, 0.004, a / 2 ).premultiply( _m.makeRotationZ( Math.PI / 2 ) );
	if ( axis === 'z' ) matrix.makeScale( a / 2, 0.004, b / 2 ).premultiply( _m.makeRotationX( Math.PI / 2 ) );
	matrix.premultiply( _m.makeTranslation( ...centre ) );
	parts.add( HOLE(), DISC.clone(), matrix );

}

// --- the container ---------------------------------------------------------------------------

const CASTING = [ 0.162, 0.118, 0.178 ]; // across, high, along
const FLOOR = 0.18; // top of the floor and the door sill
const POST = 0.14;

// A container, built lying along z with its doors at the -z end. `doors` is how far they're
// swung open, in degrees (270 folds them back flat against the sides). `openings` are holes cut
// in the right-hand (+x) side, [ z0, z1, y0, y1 ], for an office's door and window or a roll-up
// door; whatever fills them is the caller's. Returns the sizes the caller needs to fit things in.
function seaCan( parts, { length, height = 2.591, width = 8 * FT, color, doors = 0, pockets = [], openings = [], vents = true } ) {

	const paint = mat( color, { roughness: 0.6, metalness: 0.3 } );
	const hl = length / 2;
	const hw = width / 2;
	const H = height;
	const [ cx, cy, cz ] = CASTING;

	// Corner castings with their oval holes on the side, end and top.
	for ( const sx of [ - 1, 1 ] ) {

		for ( const sz of [ - 1, 1 ] ) {

			const x = sx * ( hw - cx / 2 );
			const z = sz * ( hl - cz / 2 );
			for ( const y of [ 0, H - cy ] ) {

				parts.box( paint, CASTING, [ x, y, z ] );
				hole( parts, [ sx * hw, y + cy / 2, z ], 'x', [ 0.08, 0.05 ] );
				hole( parts, [ x, y + cy / 2, sz * hl ], 'z', [ 0.05, 0.06 ] );

			}

			hole( parts, [ x, H, z ], 'y', [ 0.064, 0.124 ] );

		}

	}

	// Corner posts. The ones at the door end are narrower across so the doors fit between them.
	for ( const sx of [ - 1, 1 ] ) {

		parts.box( paint, [ POST, H - 2 * cy, POST ], [ sx * ( hw - 0.004 - POST / 2 ), cy, hl - 0.004 - POST / 2 ] );
		parts.box( paint, [ 0.09, H - 2 * cy, 0.16 ], [ sx * ( hw - 0.049 ), cy, - hl + 0.084 ] );

	}

	// Top and bottom side rails, standing a little proud of the corrugation.
	const rail = length - 2 * cz;
	for ( const s of [ - 1, 1 ] ) {

		parts.box( paint, [ 0.05, 0.1525, rail ], [ s * ( hw - 0.03 ), 0.0125, 0 ] );
		parts.box( paint, [ 0.06, 0.09, rail ], [ s * ( hw - 0.035 ), H - 0.1, 0 ] );

	}

	// Side walls, with the right one cut around any openings.
	const wallFrom = - hl + 0.144;
	const wallTo = hl - 0.144;
	const wallLow = 0.12;
	const wallHigh = H - 0.06;
	const side = ( s, z0, z1, y0, y1 ) => corrugated( parts, paint, {
		origin: [ s * ( hw - 0.048 ), y0, 0 ], along: [ 0, 0, 1 ], out: [ s, 0, 0 ], from: z0, to: z1, length: y1 - y0, wave: SIDE_WAVE,
	} );
	side( - 1, wallFrom, wallTo, wallLow, wallHigh );
	let z = wallFrom;
	for ( const [ z0, z1, y0, y1 ] of [ ...openings ].sort( ( a, b ) => a[ 0 ] - b[ 0 ] ) ) {

		if ( z0 > z ) side( 1, z, z0, wallLow, wallHigh );
		if ( y0 > wallLow ) side( 1, z0, z1, wallLow, y0 );
		if ( y1 < wallHigh ) side( 1, z0, z1, y1, wallHigh );
		z = z1;

	}

	side( 1, z, wallTo, wallLow, wallHigh );

	// Labyrinth vent covers up near the top of each side.
	if ( vents ) {

		for ( const s of [ - 1, 1 ] ) {

			for ( const vz of [ - hl + 0.5, hl - 0.5 ] ) parts.box( paint, [ 0.03, 0.08, 0.16 ], [ s * ( hw - 0.01 ), H - 0.27, vz ] );

		}

	}

	// Fork pockets through the bottom side rails: a reinforced plate round a dark slot.
	for ( const pz of pockets ) {

		for ( const s of [ - 1, 1 ] ) {

			parts.box( paint, [ 0.008, 0.16, 0.46 ], [ s * ( hw - 0.004 ), 0.0125, pz ] );
			parts.box( HOLE(), [ 0.004, 0.11, 0.36 ], [ s * hw, 0.035, pz ] );

		}

	}

	// The closed end: deeper vertical corrugations between its corner posts, a sill and a header.
	const endSpan = width - 2 * 0.144;
	const endPitch = endSpan / 5;
	corrugated( parts, paint, {
		origin: [ 0, wallLow, hl - 0.057 ], along: [ 1, 0, 0 ], out: [ 0, 0, 1 ], from: - endSpan / 2, to: endSpan / 2, length: wallHigh - wallLow,
		wave: { pitch: endPitch, depth: 0.045, crest: endPitch * 0.34, trough: endPitch * 0.3 },
	} );
	parts.box( paint, [ width - 2 * cx, 0.15, 0.06 ], [ 0, 0.0125, hl - 0.035 ] );
	parts.box( paint, [ width - 2 * cx, 0.1, 0.06 ], [ 0, H - 0.105, hl - 0.035 ] );

	// Roof: shallow ribs across, dished a little towards the middle.
	const roofHalf = hw - 0.05;
	corrugated( parts, paint, {
		origin: [ - roofHalf, H - 0.032, 0 ], along: [ 0, 0, 1 ], out: [ 0, 1, 0 ], extrude: [ 1, 0, 0 ], from: - hl + 0.1, to: hl - 0.04, length: 2 * roofHalf,
		wave: ROOF_WAVE, bend: position => {

			for ( let i = 0; i < position.count; i ++ ) {

				const t = position.getX( i ) / roofHalf;
				position.setY( i, position.getY( i ) - 0.012 * ( 1 - t * t ) );

			}

		},
	} );

	// Floor: plywood sheets with their seams, on cross members.
	const floorLength = length - 0.24;
	const floorZ = 0.055;
	parts.box( UNDERSIDE(), [ width - 0.11, 0.13, floorLength ], [ 0, 0.02, floorZ ] );
	parts.box( FLOOR_PLY(), [ width - 0.11, 0.028, floorLength ], [ 0, FLOOR - 0.028, floorZ ] );
	parts.box( SEAM(), [ 0.005, 0.001, floorLength ], [ 0, FLOOR, floorZ ] );
	for ( let sz = - hl + 0.175 + 2.44; sz < hl - 0.1; sz += 2.44 ) parts.box( SEAM(), [ width - 0.11, 0.001, 0.005 ], [ 0, FLOOR, sz ] );

	doorEnd( parts, paint, { hl, hw, H, width, open: doors } );
	return { hl, hw, H, paint };

}

// The door end: sill and header with cam keepers, hinge knuckles on the corner posts, and the
// two doors, each a framed corrugated panel with two locking bars, handles and a gasket.
function doorEnd( parts, paint, { hl, hw, H, width, open } ) {

	const steel = GALVANISED();
	const sill = [ width - 0.188, 0.1675, 0.17 ];
	parts.box( paint, sill, [ 0, FLOOR - sill[ 1 ], - hl + 0.09 ] );
	parts.box( paint, [ width - 0.188, 0.165, 0.17 ], [ 0, H - 0.17, - hl + 0.09 ] );

	const xh = hw - 0.096; // the closed doors' hinge edges
	const leafWidth = xh - 0.004;
	const y0 = 0.185;
	const y1 = H - 0.175;
	const bars = [ 0.24, leafWidth - 0.29 ];
	const hinges = [ 0.12, 0.38, 0.62, 0.88 ].map( t => y0 + 0.05 + t * ( y1 - y0 - 0.1 ) );

	for ( const s of [ - 1, 1 ] ) {

		// Cam keepers on the sill and header, which stay put when the bars swing away.
		for ( const u of bars ) {

			parts.box( paint, [ 0.07, 0.065, 0.05 ], [ s * ( xh - u ), FLOOR, - hl + 0.04 ] );
			parts.box( paint, [ 0.07, 0.065, 0.05 ], [ s * ( xh - u ), H - 0.17 - 0.065, - hl + 0.04 ] );

		}

		// Hinge knuckles on the corner posts; the doors turn about their pins.
		const pivot = [ s * ( hw - 0.025 ), 0, - hl - 0.005 ];
		for ( const y of hinges ) parts.cylinder( paint, 0.018, 0.09, [ pivot[ 0 ], y - 0.045, pivot[ 2 ] ], 10 );

		// The leaf is drawn with its hinge edge at x = 0 and its outer face at z = 0, and turned
		// about the pin (outwards, so the right door turns the negative way about y).
		const closed = [ s * xh, 0, - hl + 0.07 ];
		const angle = - s * open * Math.PI / 180;
		const matrix = new Matrix4().makeTranslation( closed[ 0 ] - pivot[ 0 ], 0, closed[ 2 ] - pivot[ 2 ] )
			.premultiply( _m.makeRotationY( angle ) )
			.premultiply( _m.makeTranslation( pivot[ 0 ], 0, pivot[ 2 ] ) );
		doorLeaf( new Moved( parts, matrix ), paint, steel, { s, width: leafWidth, y0, y1, bars, hinges, pin: [ pivot[ 0 ] - closed[ 0 ], pivot[ 2 ] - closed[ 2 ] ] } );

	}

}

function doorLeaf( leaf, paint, steel, { s, width, y0, y1, bars, hinges, pin } ) {

	const dir = - s; // from the hinge edge towards the middle
	const at = u => dir * u;
	const high = y1 - y0;
	const depth = 0.05;

	// Frame round a corrugated panel with four broad vertical ribs.
	leaf.box( paint, [ 0.07, high, depth ], [ at( 0.035 ), y0, depth / 2 ] );
	leaf.box( paint, [ 0.07, high, depth ], [ at( width - 0.035 ), y0, depth / 2 ] );
	for ( const y of [ y0, y1 - 0.09 ] ) leaf.box( paint, [ width - 0.14, 0.09, depth ], [ at( width / 2 ), y, depth / 2 ] );
	const pitch = ( width - 0.14 ) / 4;
	corrugated( leaf, paint, {
		origin: [ 0, y0 + 0.09, 0.03 ], along: [ dir, 0, 0 ], out: [ 0, 0, - 1 ], from: 0.07, to: width - 0.07, length: high - 0.18,
		wave: { pitch, depth: 0.022, crest: pitch * 0.42, trough: pitch * 0.32, phase: 0.07 + pitch / 2 },
	} );

	// Rubber gasket round the inside face.
	const gasket = RUBBER();
	for ( const y of [ y0, y1 - 0.03 ] ) leaf.box( gasket, [ width, 0.03, 0.006 ], [ at( width / 2 ), y, depth + 0.003 ] );
	for ( const u of [ 0.015, width - 0.015 ] ) leaf.box( gasket, [ 0.03, high, 0.006 ], [ at( u ), y0, depth + 0.003 ] );

	// Hinge blades from the leaf to the pins.
	for ( const y of hinges ) leaf.rod( paint, [ at( 0.1 ), y, - 0.006 ], [ pin[ 0 ], y, pin[ 1 ] ], 0.012, 4 );

	// Two locking bars with their cams, guides, handles and handle catches.
	bars.forEach( ( u, i ) => {

		const x = at( u );
		leaf.rod( steel, [ x, y0 + 0.02, - 0.035 ], [ x, y1 - 0.02, - 0.035 ], 0.0135, 8 );
		for ( const y of [ y0 + 0.02, y1 - 0.05 ] ) leaf.box( steel, [ 0.05, 0.03, 0.03 ], [ x, y, - 0.05 ] );
		for ( const t of [ 0.25, 0.75 ] ) leaf.box( paint, [ 0.07, 0.05, 0.045 ], [ x, y0 + t * high, - 0.022 ] );
		const y = 1.0 + i * 0.12;
		const tip = at( Math.min( u + 0.33, width - 0.04 ) );
		leaf.box( steel, [ 0.05, 0.08, 0.03 ], [ x, y - 0.04, - 0.05 ] );
		leaf.rod( steel, [ x, y, - 0.055 ], [ tip, y, - 0.055 ], 0.011, 6 );
		leaf.box( paint, [ 0.05, 0.1, 0.04 ], [ tip, y - 0.05, - 0.02 ] );

	} );

	// The data plate on the left door.
	if ( s < 0 ) leaf.box( mat( 0xb9bcbd, { roughness: 0.5, metalness: 0.5 } ), [ 0.18, 0.12, 0.004 ], [ at( 0.55 ), 1.55, - 0.002 ] );

}

// A container item: the container alone, as built.
export function shippingContainer( spec ) {

	const parts = new Parts();
	seaCan( parts, spec );
	return parts.build();

}

function stackedContainers() {

	const parts = new Parts();
	seaCan( parts, { length: 6.058, color: 0x36573a, pockets: POCKETS_20 } );
	seaCan( new Moved( parts, turned( [ 0, 2.591, 0 ] ) ), { length: 6.058, color: 0x8e3b2a, pockets: POCKETS_20 } );
	return parts.build();

}

// --- site office conversion ------------------------------------------------------------------

// A 20 ft container fitted out as a site office: a steel man door and a barred window cut into one
// long side, a through-the-wall AC unit, a light and a disconnect, on timber blocks with a steel
// landing and step at the door. Built along z with the fit-out on +x, then turned so it faces -Z.
function containerOffice() {

	const parts = new Parts();
	const lift = 0.15;
	const office = new Moved( parts, turned( [ 0, lift, 0 ], Math.PI / 2 ) );
	const door = [ 0, 1.0, FLOOR, FLOOR + 2.1 ];
	const window = [ - 1.9, - 1.0, 1.1, 2.0 ];
	const ac = [ 1.75, 2.45, 1.55, 2.0 ];
	const { hl, hw } = seaCan( office, { length: 6.058, color: 0xc9c7bd, pockets: POCKETS_20, openings: [ door, window, ac ] } );
	const trim = mat( 0x3c4a5a, { roughness: 0.6, metalness: 0.2 } );
	const white = mat( 0xe6e4dc, { roughness: 0.5, metalness: 0.2 } );
	const steel = GALVANISED();

	// Timber blocks under the corners.
	const timber = mat( 0x6b5137, { roughness: 0.95 } );
	for ( const x of [ - 1, 1 ] ) for ( const z of [ - 1, 1 ] ) office.box( timber, [ 0.6, lift, 0.3 ], [ x * ( hw - 0.25 ), - lift, z * ( hl - 0.2 ) ] );

	// A steel tube frame welded round each opening.
	const frame = ( [ z0, z1, y0, y1 ], w = 0.05 ) => {

		for ( const z of [ z0 - w / 2, z1 + w / 2 ] ) office.box( trim, [ 0.065, y1 - y0 + 2 * w, w ], [ hw - 0.0325, y0 - w, z ] );
		for ( const y of [ y0 - w, y1 ] ) office.box( trim, [ 0.065, w, z1 - z0 ], [ hw - 0.0325, y, ( z0 + z1 ) / 2 ] );

	};

	// Man door: a 36 in steel door with lever, deadbolt and closer, a light above.
	frame( door );
	const doorZ = ( door[ 0 ] + door[ 1 ] ) / 2;
	office.box( white, [ 0.045, 2.09, 0.99 ], [ hw - 0.05, FLOOR, doorZ ] );
	office.rod( steel, [ hw - 0.02, FLOOR + 0.95, door[ 1 ] - 0.1 ], [ hw + 0.04, FLOOR + 0.95, door[ 1 ] - 0.1 ], 0.012, 8 );
	office.rod( steel, [ hw + 0.04, FLOOR + 0.95, door[ 1 ] - 0.1 ], [ hw + 0.04, FLOOR + 0.95, door[ 1 ] - 0.24 ], 0.01, 8 );
	office.rod( steel, [ hw - 0.02, FLOOR + 1.12, door[ 1 ] - 0.1 ], [ hw - 0.005, FLOOR + 1.12, door[ 1 ] - 0.1 ], 0.025, 12 );
	office.box( BLACK(), [ 0.05, 0.06, 0.3 ], [ hw - 0.005, FLOOR + 1.98, door[ 1 ] - 0.25 ] );
	office.box( trim, [ 0.12, 0.12, 0.2 ], [ hw + 0.06, door[ 3 ] + 0.07, doorZ ] );
	office.box( mat( 0xf4f0d8, { roughness: 0.3, emissive: 0x6b6450, emissiveIntensity: 0.5 } ), [ 0.1, 0.01, 0.16 ], [ hw + 0.06, door[ 3 ] + 0.065, doorZ ] );

	// Sliding window with a welded bar guard standing off the wall.
	frame( window );
	const [ wz0, wz1, wy0, wy1 ] = window;
	const wz = ( wz0 + wz1 ) / 2;
	office.box( GLASS(), [ 0.01, wy1 - wy0, wz1 - wz0 ], [ hw - 0.04, wy0, wz ] );
	office.box( white, [ 0.04, wy1 - wy0, 0.04 ], [ hw - 0.03, wy0, wz ] );
	for ( const y of [ wy0, wy1 - 0.035 ] ) office.box( white, [ 0.04, 0.035, wz1 - wz0 ], [ hw - 0.03, y, wz ] );
	const guard = hw + 0.06;
	for ( const y of [ wy0 - 0.08, wy1 + 0.04 ] ) office.box( trim, [ 0.012, 0.04, wz1 - wz0 + 0.16 ], [ guard, y, wz ] );
	for ( let gz = wz0 - 0.05; gz <= wz1 + 0.051; gz += ( wz1 - wz0 + 0.1 ) / 8 ) office.rod( trim, [ guard, wy0 - 0.08, gz ], [ guard, wy1 + 0.08, gz ], 0.008, 6 );
	office.box( trim, [ 0.012, 0.03, wz1 - wz0 + 0.16 ], [ guard, ( wy0 + wy1 ) / 2, wz ] );
	for ( const y of [ wy0 - 0.06, wy1 + 0.06 ] ) for ( const gz of [ wz0 - 0.06, wz1 + 0.06 ] ) office.box( trim, [ guard - hw + 0.01, 0.025, 0.025 ], [ ( hw + guard ) / 2 - 0.005, y - 0.0125, gz ] );

	// Through-the-wall AC: the casing sleeved through the wall, grille fins on its face, louvres on
	// its sides and two angle braces under it.
	frame( ac, 0.04 );
	const [ az0, az1, ay0, ay1 ] = ac;
	const az = ( az0 + az1 ) / 2;
	const casing = mat( 0xd9d6cc, { roughness: 0.6, metalness: 0.2 } );
	const grille = mat( 0x55595c, { roughness: 0.7, metalness: 0.3 } );
	office.box( casing, [ 0.62, ay1 - ay0, az1 - az0 - 0.02 ], [ hw + 0.01, ay0, az ] );
	office.box( grille, [ 0.01, ay1 - ay0 - 0.08, az1 - az0 - 0.1 ], [ hw + 0.32, ay0 + 0.04, az ] );
	for ( let y = ay0 + 0.06; y < ay1 - 0.04; y += 0.035 ) office.box( casing, [ 0.012, 0.008, az1 - az0 - 0.1 ], [ hw + 0.326, y, az ] );
	for ( const z of [ az0 + 0.004, az1 - 0.004 ] ) {

		for ( let y = ay0 + 0.08; y < ay1 - 0.06; y += 0.04 ) office.box( grille, [ 0.2, 0.012, 0.006 ], [ hw + 0.18, y, z ] );

	}

	for ( const z of [ az0 + 0.08, az1 - 0.08 ] ) office.rod( trim, [ hw, ay0 - 0.35, z ], [ hw + 0.28, ay0, z ], 0.012, 4 );

	// Disconnect box with conduit up to the roof line.
	office.box( mat( 0x9da3a6, { roughness: 0.5, metalness: 0.4 } ), [ 0.09, 0.3, 0.22 ], [ hw + 0.045, 1.25, - 0.4 ] );
	office.rod( steel, [ hw + 0.03, 1.55, - 0.4 ], [ hw + 0.03, 2.48, - 0.4 ], 0.013, 6 );

	// Steel landing and step at the door, with handrails both sides. The ground is at y = -lift.
	const ground = - lift;
	const landing = [ hw + 0.01, hw + 0.91 ];
	const lz = [ door[ 0 ] - 0.1, door[ 1 ] + 0.1 ];
	const lzMid = ( lz[ 0 ] + lz[ 1 ] ) / 2;
	const top = FLOOR - 0.015;
	const grate = mat( 0x8e9396, { roughness: 0.55, metalness: 0.55 } );
	office.box( grate, [ landing[ 1 ] - landing[ 0 ], 0.04, lz[ 1 ] - lz[ 0 ] ], [ ( landing[ 0 ] + landing[ 1 ] ) / 2, top - 0.04, lzMid ] );
	for ( const x of [ landing[ 0 ] + 0.04, landing[ 1 ] - 0.04 ] ) for ( const z of [ lz[ 0 ] + 0.04, lz[ 1 ] - 0.04 ] ) office.box( steel, [ 0.05, top - 0.04 - ground, 0.05 ], [ x, ground, z ] );
	const step = top - ( top - ground ) / 2;
	const tread = [ landing[ 1 ], landing[ 1 ] + 0.28 ];
	office.box( grate, [ 0.28, 0.04, 1.0 ], [ ( tread[ 0 ] + tread[ 1 ] ) / 2, step - 0.04, lzMid ] );
	for ( const z of [ lzMid - 0.52, lzMid + 0.52 ] ) {

		const from = [ landing[ 1 ] - 0.02, top - 0.06 ];
		const to = [ tread[ 1 ] + 0.06, ground + 0.06 ];
		const run = Math.hypot( to[ 0 ] - from[ 0 ], to[ 1 ] - from[ 1 ] );
		office.block( steel, [ run, 0.12, 0.012 ], [ ( from[ 0 ] + to[ 0 ] ) / 2, ( from[ 1 ] + to[ 1 ] ) / 2, z ], [ 0, 0, Math.atan2( to[ 1 ] - from[ 1 ], to[ 0 ] - from[ 0 ] ) ] );

	}

	for ( const z of [ lz[ 0 ] + 0.02, lz[ 1 ] - 0.02 ] ) {

		const rail = top + 0.95;
		office.rod( steel, [ landing[ 0 ] + 0.04, top, z ], [ landing[ 0 ] + 0.04, rail, z ], 0.02, 8 );
		office.rod( steel, [ landing[ 1 ] - 0.03, top, z ], [ landing[ 1 ] - 0.03, rail, z ], 0.02, 8 );
		office.rod( steel, [ tread[ 1 ] - 0.03, ground, z ], [ tread[ 1 ] - 0.03, step + 0.9, z ], 0.02, 8 );
		office.path( steel, [ [ landing[ 0 ] + 0.04, rail, z ], [ landing[ 1 ] - 0.03, rail, z ], [ tread[ 1 ] - 0.03, step + 0.9, z ] ], 0.02, 8 );
		office.rod( steel, [ landing[ 0 ] + 0.04, top + 0.47, z ], [ landing[ 1 ] - 0.03, top + 0.47, z ], 0.016, 8 );

	}

	return parts.build();

}

// --- tool crib fit-out -----------------------------------------------------------------------

const UPRIGHT = () => mat( 0x2d4e7e, { roughness: 0.55, metalness: 0.3 } );
const BEAM = () => mat( 0xd66a1f, { roughness: 0.55, metalness: 0.2 } );
const DECK = () => mat( 0x9aa0a5, { roughness: 0.6, metalness: 0.3 } );
const PLASTIC = [ 0x2364b8, 0xc92a2a, 0xe8b41c, 0x2f8a46 ];
const CASES = [ 0xb82020, 0xe2b218, 0x1e1f21, 0x1f6f7a, 0x2a5ab0 ];
const CARTON = () => mat( 0xb48a5a, { roughness: 0.9 } );
const CORDS = [ 0xe86a10, 0xf0c419, 0x2b9a3e, 0xc22424, 0x2b63c0 ];

// A steel shelving unit (bolted uprights, orange beams, steel decks) `length` long and `depth`
// deep, stocked with bins, cases, cartons, cans and coiled cords. Drawn with its front edge along
// z = 0 and its back towards +z, then placed by `place`.
function shelving( parts, place, { length = 48 * IN, depth = 18 * IN, height = 72 * IN, levels = 5, seed = 1, top = 0.28 } ) {

	const unit = new Moved( parts, place );
	const post = 0.035;
	for ( const x of [ - length / 2 + post / 2, length / 2 - post / 2 ] ) {

		for ( const z of [ post / 2, depth - post / 2 ] ) unit.box( UPRIGHT(), [ post, height, post ], [ x, 0, z ] );

	}

	const rand = random( seed );
	const gap = ( height - 0.15 ) / ( levels - 1 );
	for ( let i = 0; i < levels; i ++ ) {

		const y = 0.12 + i * gap;
		unit.box( DECK(), [ length - 0.01, 0.02, depth - 0.01 ], [ 0, y - 0.02, depth / 2 ] );
		for ( const z of [ 0.0125, depth - 0.0125 ] ) unit.box( BEAM(), [ length - 2 * post, 0.045, 0.025 ], [ 0, y - 0.05, z ] );
		const room = i === levels - 1 ? top : gap - 0.07;
		if ( room > 0.1 ) stock( unit, rand, [ length - 0.08, room, depth - 0.06 ], [ 0, y, 0.03 ] );

	}

}

// Things along a shelf `size` [ long, high, deep ] whose front middle is at `at`.
function stock( parts, rand, [ long, high, deep ], [ x0, y, z0 ] ) {

	let x = x0 - long / 2;
	while ( true ) {

		const kind = rand();
		if ( kind < 0.3 ) {

			// A row of open-fronted parts bins.
			const count = 2 + Math.floor( rand() * 3 );
			const w = rand() < 0.5 ? 0.105 : 0.15;
			if ( x + count * w > x0 + long / 2 ) break;
			const h = Math.min( 0.13, high - 0.01 );
			const d = Math.min( 0.28, deep );
			const colour = mat( pick( rand, PLASTIC ), { roughness: 0.5 } );
			for ( let i = 0; i < count; i ++ ) {

				const bx = x + w * ( i + 0.5 );
				parts.box( colour, [ w - 0.006, h, d ], [ bx, y, z0 + d / 2 ] );
				parts.box( HOLE(), [ w - 0.03, h * 0.4, 0.004 ], [ bx, y + h * 0.55, z0 - 0.001 ] );

			}

			x += count * w;

		} else if ( kind < 0.5 ) {

			// Cardboard cartons.
			const w = 0.26 + rand() * 0.18;
			if ( x + w > x0 + long / 2 ) break;
			const h = Math.min( 0.16 + rand() * 0.16, high - 0.02 );
			parts.box( CARTON(), [ w, h, Math.min( 0.3 + rand() * 0.1, deep ) ], [ x + w / 2, y, z0 + Math.min( 0.35, deep ) / 2 ] );
			x += w;

		} else if ( kind < 0.72 ) {

			// Tool cases, one or two high, with their handles to the front.
			const w = 0.4 + rand() * 0.1;
			if ( x + w > x0 + long / 2 ) break;
			const d = Math.min( 0.32, deep );
			const stack = high > 0.27 && rand() < 0.5 ? 2 : 1;
			for ( let i = 0; i < stack; i ++ ) {

				const cy = y + i * 0.12;
				parts.box( mat( pick( rand, CASES ), { roughness: 0.45 } ), [ w, 0.11, d ], [ x + w / 2, cy, z0 + d / 2 ] );
				parts.rod( BLACK(), [ x + w / 2 - 0.06, cy + 0.07, z0 - 0.015 ], [ x + w / 2 + 0.06, cy + 0.07, z0 - 0.015 ], 0.01, 6 );

			}

			x += w;

		} else if ( kind < 0.86 ) {

			// Cans: paint, lubricant, sealant.
			const count = 2 + Math.floor( rand() * 3 );
			if ( x + count * 0.1 > x0 + long / 2 ) break;
			const h = Math.min( 0.12 + rand() * 0.06, high - 0.02 );
			const colour = mat( pick( rand, [ 0xb5b9bc, 0xd3c9a5, 0x5b6a7a ] ), { roughness: 0.35, metalness: 0.6 } );
			for ( let i = 0; i < count; i ++ ) parts.cylinder( colour, 0.045, h, [ x + 0.05 + i * 0.1, y, z0 + 0.06 + ( i % 2 ) * 0.1 ], 12 );
			x += count * 0.1;

		} else {

			// A coiled extension cord lying flat.
			const r = 0.13;
			if ( x + 2 * r + 0.03 > x0 + long / 2 || deep < 2 * r + 0.02 ) break;
			const colour = mat( pick( rand, CORDS ), { roughness: 0.6 } );
			for ( let i = 0; i < 3; i ++ ) {

				const coil = new TorusGeometry( r - i * 0.006, 0.012, 5, 18 );
				coil.rotateX( Math.PI / 2 );
				coil.translate( x + r + 0.015, y + 0.012 + i * 0.022, z0 + r + 0.01 );
				parts.add( colour, coil );

			}

			x += 2 * r + 0.03;

		}

		x += 0.015 + rand() * 0.05;
		if ( rand() < 0.12 ) x += 0.15;

	}

}

// A cord or hose coiled over a hook on a wall: the wall is the z = 0 plane of `place`, the coil
// hanging in front of it towards -z, with its top at the hook.
function hangingCoil( parts, place, colour, radius = 0.2, tube = 0.014 ) {

	const coil = new Moved( parts, place );
	const material = mat( colour, { roughness: 0.6 } );
	coil.rod( STEEL(), [ 0, 0, 0 ], [ 0, 0, - 0.1 ], 0.007, 6 );
	coil.rod( STEEL(), [ 0, 0, - 0.1 ], [ 0, 0.04, - 0.1 ], 0.007, 6 );
	coil.box( STEEL(), [ 0.06, 0.06, 0.006 ], [ 0, - 0.03, - 0.003 ] );
	for ( let i = 0; i < 3; i ++ ) {

		const loop = new TorusGeometry( radius - i * 0.012, tube, 5, 20 );
		loop.scale( 1, 1.25, 1 );
		loop.rotateZ( ( i - 1 ) * 0.1 );
		loop.translate( ( i - 1 ) * 0.012, - ( radius - i * 0.012 ) * 1.25, - 0.06 - i * tube * 1.8 );
		coil.add( material, loop );

	}

	// The plug end hanging down below the loops.
	const bottom = - 2.5 * radius;
	coil.rod( material, [ radius * 0.4, bottom + 0.02, - 0.07 ], [ radius * 0.45, bottom - 0.25, - 0.08 ], tube, 6 );
	coil.box( material, [ 0.04, 0.07, 0.03 ], [ radius * 0.45, bottom - 0.32, - 0.08 ] );

}

// Shelving down both long walls of a container from z0, `units` per side, each `length` long.
function shelvesAlongSides( parts, { hw, z0, units, length = 48 * IN, depth = 18 * IN, height = 72 * IN, seed } ) {

	for ( const s of [ - 1, 1 ] ) {

		for ( let i = 0; i < units; i ++ ) {

			const z = z0 + ( i + 0.5 ) * ( length + 0.02 );
			const x = s * ( hw - 0.06 - depth );
			shelving( parts, turned( [ x, FLOOR, z ], s * Math.PI / 2 ), { length, depth, height, seed: seed + i * 7 + ( s > 0 ? 100 : 0 ) } );

		}

	}

}

// An 8 ft storage container (8 ft long, 7 ft 3 in wide, 7 ft 6 in high), doors folded back, with
// shelving down both sides and cords hung on the end wall.
function toolCrib8() {

	const parts = new Parts();
	const { hw, hl } = seaCan( parts, { length: 8 * FT, width: 87 * IN, height: 90 * IN, color: 0x3e6b8a, pockets: [ - 0.55, 0.55 ], doors: 270, vents: false } );
	shelvesAlongSides( parts, { hw, z0: - hl + 0.28, units: 1, depth: 16 * IN, height: 64 * IN, seed: 3 } );
	CORDS.slice( 0, 3 ).forEach( ( colour, i ) => hangingCoil( parts, turned( [ ( i - 1 ) * 0.42, 1.75, hl - 0.06 ] ), colour, 0.16 ) );
	return parts.build();

}

// A 20 ft tool crib: doors folded back, four shelving units down each side, extension cords and
// air and water hoses hung on the end wall and on the sides past the shelving.
function toolCrib20() {

	const parts = new Parts();
	const { hw, hl } = seaCan( parts, { length: 6.058, color: 0x7b8287, pockets: POCKETS_20, doors: 270 } );
	shelvesAlongSides( parts, { hw, z0: - hl + 0.3, units: 4, seed: 11 } );
	[ 0xe86a10, 0xf0c419, 0xc22424, 0x2b9a3e ].forEach( ( colour, i ) => hangingCoil( parts, turned( [ ( i - 1.5 ) * 0.42, 2.0, hl - 0.06 ] ), colour, i === 2 ? 0.22 : 0.18, i === 2 ? 0.016 : 0.013 ) );
	for ( const s of [ - 1, 1 ] ) hangingCoil( parts, turned( [ s * ( hw - 0.055 ), 2.0, hl - 0.42 ], s * Math.PI / 2 ), s > 0 ? 0x2b63c0 : 0xe86a10, 0.2 );
	return parts.build();

}

// A 20 ft tool crib with an 8 x 7 ft roll-up door cut into a long side and rolled up: steel jambs
// and guides, the hood with the curtain's bottom bar showing under it, a pull strap, and shelving
// along the far wall and either side of the opening. Built along z with the door on +x, then
// turned so the door faces -Z.
function toolCribRollUp() {

	const parts = new Parts();
	const crib = new Moved( parts, turned( [ 0, 0, 0 ], Math.PI / 2 ) );
	const opening = [ - 1.22, 1.22, FLOOR, FLOOR + 7 * FT ];
	const { hw, hl, H } = seaCan( crib, { length: 6.058, color: 0xb9a27a, pockets: POCKETS_20, openings: [ opening ] } );
	const [ z0, z1, , y1 ] = opening;
	const trim = mat( 0x4a4d50, { roughness: 0.6, metalness: 0.4 } );
	const steel = GALVANISED();

	// Jambs, header and the guides the curtain runs in.
	for ( const z of [ z0 - 0.03, z1 + 0.03 ] ) {

		crib.box( trim, [ 0.07, y1 - FLOOR + 0.08, 0.06 ], [ hw - 0.035, FLOOR, z ] );
		crib.box( steel, [ 0.06, y1 - FLOOR, 0.05 ], [ hw - 0.1, FLOOR, z ] );

	}

	crib.box( trim, [ 0.07, 0.08, z1 - z0 ], [ hw - 0.035, y1, 0 ] );
	crib.box( mat( 0xd8d5cc, { roughness: 0.5, metalness: 0.4 } ), [ 0.36, 0.26, z1 - z0 + 0.14 ], [ hw - 0.31, H - 0.32, 0 ] );
	crib.box( mat( 0xe4e2da, { roughness: 0.45, metalness: 0.4 } ), [ 0.05, 0.05, z1 - z0 - 0.02 ], [ hw - 0.1, y1 - 0.05, 0 ] );
	crib.box( BLACK(), [ 0.004, 0.55, 0.03 ], [ hw - 0.07, y1 - 0.6, 0 ] );

	// Shelving down the far wall and either side of the door, cords hung at the end.
	for ( let i = 0; i < 4; i ++ ) shelving( crib, turned( [ - hw + 0.06 + 18 * IN, FLOOR, - 2.48 + 1.24 * i + 0.61 ], - Math.PI / 2 ), { seed: 40 + i } );
	for ( const z of [ - 2.1, 2.1 ] ) shelving( crib, turned( [ hw - 0.06 - 18 * IN, FLOOR, z ], Math.PI / 2 ), { length: 36 * IN, seed: 60 + z } );
	[ 0xf0c419, 0x2b9a3e ].forEach( ( colour, i ) => hangingCoil( crib, turned( [ ( i - 0.5 ) * 0.45, 2.0, hl - 0.06 ] ), colour, 0.18 ) );
	return parts.build();

}

// --- tool crib trailer -----------------------------------------------------------------------

// A 7 x 16 ft enclosed cargo trailer used as a tool crib: white aluminium skin on a steel frame,
// a 2 ft V-nose with diamond-plate stone guard, a curb-side door, a rear ramp door, tandem
// 3,500 lb axles on 15 in wheels under wrap-round fenders, and an A-frame tongue with a 2 5/16 in
// coupler, jack and safety chains. About 22 ft long, 8 ft 6 in wide over the fenders.
function cargoTrailer() {

	const parts = new Parts();
	const skin = mat( 0xeeeeea, { roughness: 0.45, metalness: 0.25 } );
	const alu = mat( 0xd2d5d7, { roughness: 0.4, metalness: 0.3 } );
	const frame = mat( 0x1d1f21, { roughness: 0.6, metalness: 0.3 } );
	const seam = mat( 0xc9c9c4, { roughness: 0.5, metalness: 0.3 } );
	const red = mat( 0xc01818, { roughness: 0.3, emissive: 0x700a0a, emissiveIntensity: 0.6 } );
	const amber = mat( 0xff9a1a, { roughness: 0.3, emissive: 0xc76a00, emissiveIntensity: 0.6 } );

	const box = 16 * FT;
	const nose = 0.6;
	const hw = 1.09; // the box's half width outside; the wheels sit outside it under the fenders
	const zr = 3.31; // back of the box
	const zf = zr - box; // front corners of the box
	const zn = zf - nose; // flat of the V-nose
	const zc = zn - 1.2; // coupler tip
	const bottom = 0.51;
	const top = 0.55 + 78 * IN + 0.06;

	// The box: walls in plan, with the V-nose, extruded up.
	const plan = ( grow, flat = 0.25 ) => [ [ - hw - grow, zr + grow ], [ hw + grow, zr + grow ], [ hw + grow, zf ], [ flat + grow * 0.6, zn - grow ], [ - flat - grow * 0.6, zn - grow ], [ - hw - grow, zf ] ];
	const prismUp = ( material, points, y0, y1 ) => {

		const geometry = new ExtrudeGeometry( new Shape( points.map( ( [ x, z ] ) => new Vector2( x, - z ) ) ), { depth: y1 - y0, bevelEnabled: false } );
		geometry.rotateX( - Math.PI / 2 );
		geometry.translate( 0, y0, 0 );
		parts.add( material, geometry );

	};

	prismUp( skin, plan( 0 ), bottom, top );
	prismUp( alu, plan( 0.015 ), top - 0.05, top + 0.015 );
	prismUp( alu, plan( 0.012 ), bottom - 0.01, bottom + 0.07 );

	// Diamond-plate stone guard round the nose.
	const guard = 0.6;
	for ( const s of [ - 1, 1 ] ) {

		const a = [ s * hw, zf ];
		const b = [ s * 0.25, zn ];
		const run = Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] );
		const out = [ s * ( a[ 1 ] - b[ 1 ] ) / run * 0.005, s * ( b[ 0 ] - a[ 0 ] ) / run * 0.005 ];
		const angle = Math.atan2( a[ 1 ] - b[ 1 ], b[ 0 ] - a[ 0 ] );
		parts.block( alu, [ run, guard, 0.006 ], [ ( a[ 0 ] + b[ 0 ] ) / 2 + out[ 0 ], bottom + 0.07 + guard / 2, ( a[ 1 ] + b[ 1 ] ) / 2 + out[ 1 ] ], [ 0, angle, 0 ] );
		parts.box( alu, [ 0.006, guard, 0.3 ], [ s * ( hw + 0.004 ), bottom + 0.07, zf + 0.15 ] );

	}

	parts.box( alu, [ 0.52, guard, 0.006 ], [ 0, bottom + 0.07, zn - 0.004 ] );

	// Skin seams down the sides at the posts, and the curb-side door.
	const doorZ = zf + 0.75;
	for ( let z = zf + 0.3; z < zr - 0.1; z += 24 * IN ) {

		if ( Math.abs( z - doorZ ) < 0.5 ) continue;
		for ( const s of [ - 1, 1 ] ) parts.box( seam, [ 0.004, top - bottom - 0.12, 0.03 ], [ s * ( hw + 0.002 ), bottom + 0.07, z ] );

	}

	const doorW = 32 * IN;
	const doorH = 72 * IN;
	const doorY = 0.6;
	parts.box( skin, [ 0.012, doorH, doorW ], [ hw + 0.006, doorY, doorZ ] );
	for ( const z of [ doorZ - doorW / 2 - 0.015, doorZ + doorW / 2 + 0.015 ] ) parts.box( frame, [ 0.016, doorH + 0.06, 0.03 ], [ hw + 0.008, doorY - 0.03, z ] );
	for ( const y of [ doorY - 0.03, doorY + doorH ] ) parts.box( frame, [ 0.016, 0.03, doorW + 0.06 ], [ hw + 0.008, y, doorZ ] );
	parts.box( frame, [ 0.03, 0.14, 0.06 ], [ hw + 0.02, doorY + 0.95, doorZ + doorW / 2 - 0.08 ] );
	for ( const y of [ doorY + 0.2, doorY + doorH - 0.25 ] ) parts.box( alu, [ 0.02, 0.1, 0.03 ], [ hw + 0.016, y, doorZ - doorW / 2 + 0.02 ] );

	// Clearance and marker lights, and a roof vent.
	for ( const s of [ - 1, 1 ] ) {

		parts.box( amber, [ 0.015, 0.05, 0.08 ], [ s * ( hw + 0.008 ), top - 0.14, zf + 0.15 ] );
		parts.box( red, [ 0.015, 0.05, 0.08 ], [ s * ( hw + 0.008 ), top - 0.14, zr - 0.12 ] );
		parts.box( amber, [ 0.015, 0.05, 0.08 ], [ s * ( hw + 0.008 ), bottom + 0.2, zf + 1.3 ] );

	}

	parts.box( alu, [ 0.36, 0.07, 0.36 ], [ 0, top, zr - 1.3 ] );

	// Rear frame and ramp door: hinged along the bottom, a spring tube each side, two latch bars.
	const rear = zr;
	for ( const s of [ - 1, 1 ] ) {

		parts.box( frame, [ 0.09, top - bottom, 0.06 ], [ s * ( hw - 0.045 ), bottom, rear + 0.03 ] );
		parts.box( red, [ 0.07, 0.14, 0.01 ], [ s * ( hw - 0.045 ), 0.85, rear + 0.065 ] );
		parts.rod( frame, [ s * ( hw - 0.2 ), 0.6, rear + 0.08 ], [ s * ( hw - 0.6 ), 0.6, rear + 0.08 ], 0.03, 10 );
		parts.rod( alu, [ s * ( hw - 0.1 ), top - 0.6, rear + 0.08 ], [ s * ( hw - 0.1 ), top - 0.22, rear + 0.08 ], 0.012, 8 );
		parts.box( frame, [ 0.06, 0.1, 0.04 ], [ s * ( hw - 0.1 ), top - 0.5, rear + 0.07 ] );

	}

	parts.box( frame, [ 2 * hw, 0.12, 0.06 ], [ 0, top - 0.12, rear + 0.03 ] );
	for ( let i = - 1; i <= 1; i ++ ) parts.box( red, [ 0.07, 0.03, 0.01 ], [ i * 0.12, top - 0.08, rear + 0.065 ] );
	parts.box( frame, [ 2 * hw, 0.13, 0.08 ], [ 0, bottom - 0.11, rear + 0.04 ] );
	const ramp = [ 2 * hw - 0.2, top - 0.12 - ( bottom + 0.04 ) ];
	parts.box( skin, [ ramp[ 0 ], ramp[ 1 ], 0.04 ], [ 0, bottom + 0.03, rear + 0.025 ] );
	parts.box( seam, [ ramp[ 0 ] - 0.04, 0.012, 0.004 ], [ 0, top - 0.5, rear + 0.046 ] );
	parts.rod( frame, [ - ramp[ 0 ] / 2, bottom + 0.03, rear + 0.05 ], [ ramp[ 0 ] / 2, bottom + 0.03, rear + 0.05 ], 0.02, 8 );

	// Frame: main rails and cross members under the box.
	const frameY = [ 0.4, bottom ];
	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ 0.075, frameY[ 1 ] - frameY[ 0 ], box ], [ s * 0.85, frameY[ 0 ], ( zr + zf ) / 2 ] );
	for ( let z = zf + 0.1; z < zr; z += 0.6 ) parts.box( frame, [ 1.7, 0.08, 0.05 ], [ 0, frameY[ 1 ] - 0.08, z ] );

	// Tandem axles: wheels, springs, hangers, and the fenders over them.
	const axleMid = ( zr + zf ) / 2 + 0.3;
	const axles = [ axleMid - 0.42, axleMid + 0.42 ];
	const r = 0.343;
	const wheelX = hw + 0.11;
	for ( const z of axles ) {

		parts.rod( frame, [ - wheelX + 0.1, r, z ], [ wheelX - 0.1, r, z ], 0.035, 8 );
		for ( const s of [ - 1, 1 ] ) {

			parts.rod( RUBBER(), [ s * ( wheelX - 0.1 ), r, z ], [ s * ( wheelX + 0.1 ), r, z ], r, 20 );
			parts.rod( mat( 0xd9dadb, { roughness: 0.35, metalness: 0.6 } ), [ s * ( wheelX - 0.09 ), r, z ], [ s * ( wheelX + 0.102 ), r, z ], 0.19, 14 );
			parts.rod( alu, [ s * ( wheelX + 0.1 ), r, z ], [ s * ( wheelX + 0.13 ), r, z ], 0.06, 10 );
			parts.box( frame, [ 0.05, 0.03, 0.66 ], [ s * 0.85, 0.375, z ] );

		}

	}

	for ( const s of [ - 1, 1 ] ) {

		for ( const z of [ axles[ 0 ] - 0.36, axleMid, axles[ 1 ] + 0.36 ] ) parts.box( frame, [ 0.06, 0.04, 0.05 ], [ s * 0.85, 0.37, z ] );
		const [ a, b ] = [ axles[ 0 ] - r - 0.08, axles[ 1 ] + r + 0.08 ];
		const fender = [ [ a - 0.2, bottom + 0.02 ], [ a, 0.76 ], [ b, 0.76 ], [ b + 0.2, bottom + 0.02 ], [ b + 0.186, bottom + 0.02 ], [ b - 0.006, 0.748 ], [ a + 0.006, 0.748 ], [ a - 0.186, bottom + 0.02 ] ];
		parts.prism( alu, fender, 0.25, s * ( hw + 0.12 ) );

	}

	// A-frame tongue, coupler, jack, safety chains and the breakaway battery box.
	const tongueY = 0.4;
	const rails = [];
	for ( const s of [ - 1, 1 ] ) {

		const from = [ s * 0.85, tongueY + 0.05, zf + 0.2 ];
		const to = [ s * 0.05, tongueY + 0.05, zc + 0.3 ];
		rails.push( [ from, to ] );
		parts.add( frame, memberGeometry( [ 0.075, 0.1 ], from, to ) );

	}

	parts.box( frame, [ 0.11, 0.1, 0.34 ], [ 0, tongueY, zc + 0.17 ] );
	parts.sphere( frame, 0.06, [ 0, tongueY + 0.06, zc + 0.07 ], [ 12, 6 ], [ 1, 0.8, 1.1 ] );
	parts.box( alu, [ 0.04, 0.03, 0.16 ], [ 0, tongueY + 0.1, zc + 0.2 ] );
	const jackZ = zc + 0.55;
	parts.box( frame, [ 0.3, 0.02, 0.1 ], [ 0, tongueY + 0.1, jackZ ] );
	parts.cylinder( alu, 0.03, 0.82, [ 0, 0.1, jackZ ], 12 );
	parts.rod( alu, [ 0, 0.92, jackZ ], [ 0.16, 0.92, jackZ ], 0.008, 6 );
	parts.rod( frame, [ 0.16, 0.92, jackZ ], [ 0.16, 0.84, jackZ ], 0.014, 6 );
	parts.rod( RUBBER(), [ - 0.025, 0.06, jackZ ], [ 0.025, 0.06, jackZ ], 0.06, 12 );
	parts.box( alu, [ 0.07, 0.04, 0.1 ], [ 0, 0.1, jackZ ] );
	for ( const s of [ - 1, 1 ] ) parts.path( GALVANISED(), [ [ s * 0.06, tongueY, zc + 0.36 ], [ s * 0.1, 0.16, zc + 0.24 ], [ s * 0.07, 0.2, zc + 0.08 ], [ s * 0.03, tongueY, zc + 0.02 ] ], 0.008, 5 );
	const [ from, to ] = rails[ 1 ];
	const t = ( zc + 0.9 - from[ 2 ] ) / ( to[ 2 ] - from[ 2 ] );
	parts.box( BLACK(), [ 0.09, 0.1, 0.13 ], [ from[ 0 ] + ( to[ 0 ] - from[ 0 ] ) * t, tongueY + 0.1, zc + 0.9 ] );

	return parts.build();

}

// --- gang boxes ------------------------------------------------------------------------------

// A steel gang box (job box): a heavy-gauge body with pressed stiffening ribs, a lid with a deep
// skirt, lock shrouds on the front over the padlock hasps, side handles and a lifting ring at
// each end, on fork skids or 5 in casters. A piano box is tall with a fold-down front panel.
// `height` is the box itself, casters extra; the front (locks) faces -Z.
function gangBox( { width, depth, height, color, casters = false, locks = 1, piano = false } ) {

	const parts = new Parts();
	const paint = mat( color, { roughness: 0.5, metalness: 0.3 } );
	const dark = mat( 0x1e1f21, { roughness: 0.6, metalness: 0.3 } );
	const steel = GALVANISED();
	const lift = casters ? 6.5 * IN : 0;
	const base = lift + 0.07;
	const top = lift + height;
	const lid = piano ? 0.08 : 0.1;
	const hw = width / 2;
	const hd = depth / 2;

	// Skids or casters.
	if ( casters ) {

		for ( const x of [ - hw + 0.1, hw - 0.1 ] ) {

			for ( const z of [ - hd + 0.1, hd - 0.1 ] ) {

				parts.box( steel, [ 0.11, 0.012, 0.11 ], [ x, lift - 0.012, z ] );
				parts.box( steel, [ 0.07, 0.06, 0.05 ], [ x, lift - 0.072, z ] );
				parts.rod( RUBBER(), [ x - 0.022, 2.5 * IN, z ], [ x + 0.022, 2.5 * IN, z ], 2.5 * IN, 14 );

			}

		}

		parts.box( dark, [ width - 0.04, 0.07, depth - 0.04 ], [ 0, lift, 0 ] );

	} else {

		for ( const x of [ - hw + 0.2, hw - 0.2 ] ) {

			parts.box( dark, [ 0.1, 0.07, depth ], [ x, 0, 0 ] );
			for ( const z of [ - hd - 0.001, hd + 0.001 ] ) parts.box( HOLE(), [ 0.08, 0.05, 0.004 ], [ x, 0, z ] );

		}

	}

	// Body, ribs pressed into front and back, and the lid.
	parts.box( paint, [ width, top - lid - base, depth ], [ 0, base, 0 ] );
	const ribs = piano ? [ 0.25, 0.45 ] : [ 0.3, 0.6 ];
	for ( const t of ribs ) {

		const y = base + t * ( top - lid - base );
		for ( const z of [ - hd - 0.003, hd + 0.003 ] ) parts.box( paint, [ width - 0.12, 0.03, 0.006 ], [ 0, y, z ] );

	}

	parts.box( paint, [ width + 0.016, lid, depth + 0.016 ], [ 0, top - lid, 0 ] );
	for ( const x of [ - width / 4, width / 4 ] ) parts.box( paint, [ 0.05, 0.006, depth - 0.1 ], [ x, top, 0 ] );

	// A piano box's front panel folds down from under the lid.
	let shroudY = top - lid - 0.08;
	if ( piano ) {

		const panel = 0.55;
		parts.box( paint, [ width - 0.04, panel, 0.012 ], [ 0, top - lid - panel, - hd - 0.006 ] );
		parts.rod( steel, [ - hw + 0.05, top - lid - panel, - hd - 0.012 ], [ hw - 0.05, top - lid - panel, - hd - 0.012 ], 0.008, 6 );
		for ( const x of [ - hw + 0.18, hw - 0.18 ] ) parts.rod( dark, [ x - 0.07, top - lid - 0.15, - hd - 0.03 ], [ x + 0.07, top - lid - 0.15, - hd - 0.03 ], 0.01, 6 );
		shroudY = top - lid - 0.08;

	}

	// Lock shrouds over the hasps, with the padlock slot.
	for ( let i = 0; i < locks; i ++ ) {

		const x = locks === 1 ? 0 : ( i - 0.5 ) * width * 0.55;
		parts.box( dark, [ 0.14, 0.15, 0.04 ], [ x, shroudY, - hd - 0.03 - ( piano ? 0.012 : 0 ) ] );
		parts.box( HOLE(), [ 0.05, 0.07, 0.004 ], [ x, shroudY + 0.03, - hd - 0.05 - ( piano ? 0.012 : 0 ) ] );

	}

	// Side handles and lifting rings on the ends.
	for ( const s of [ - 1, 1 ] ) {

		const x = s * hw;
		const y = base + ( top - lid - base ) * 0.55;
		parts.path( steel, [ [ x, y, - 0.13 ], [ x + s * 0.05, y, - 0.1 ], [ x + s * 0.05, y, 0.1 ], [ x, y, 0.13 ] ], 0.011, 6 );
		const ringY = top - lid - 0.07;
		parts.box( dark, [ 0.02, 0.05, 0.08 ], [ x + s * 0.01, ringY, 0 ] );
		const ring = new TorusGeometry( 0.035, 0.008, 6, 14 );
		ring.rotateY( Math.PI / 2 );
		ring.translate( x + s * 0.028, ringY - 0.025, 0 );
		parts.add( steel, ring );

	}

	return parts.build();

}

// --- tool cage -------------------------------------------------------------------------------

// A welded wire mesh panel: 2 in squares of 4 mm wire, in the plane `axis` = `at`, spanning
// [ u0, u1 ] and [ v0, v1 ] (z and y on an x plane, x and y on a z plane, x and z on a y plane).
function mesh( parts, material, axis, at, [ u0, u1 ], [ v0, v1 ], pitch = 2 * IN ) {

	const w = 0.004;
	const um = ( u0 + u1 ) / 2;
	const vm = ( v0 + v1 ) / 2;
	for ( let u = u0 + pitch / 2; u < u1; u += pitch ) {

		if ( axis === 'z' ) parts.box( material, [ w, v1 - v0, w ], [ u, v0, at ] );
		if ( axis === 'x' ) parts.box( material, [ w, v1 - v0, w ], [ at, v0, u ] );
		if ( axis === 'y' ) parts.box( material, [ w, w, v1 - v0 ], [ u, at - w / 2, vm ] );

	}

	for ( let v = v0 + pitch / 2; v < v1; v += pitch ) {

		if ( axis === 'z' ) parts.box( material, [ u1 - u0, w, w ], [ um, v - w / 2, at + w ] );
		if ( axis === 'x' ) parts.box( material, [ w, w, u1 - u0 ], [ at + w, v - w / 2, um ] );
		if ( axis === 'y' ) parts.box( material, [ u1 - u0, w, w ], [ um, at - w / 2 + w, v ] );

	}

}

// An 8 x 4 x 7 ft lockable tool cage: square tube frame on two skids with fork pockets, a
// diamond-plate floor, kick plates, welded mesh on the back, ends and roof, two mesh doors on the
// front with a padlocked hasp, lifting eyes on top, and a shelf of stock inside.
function toolCage() {

	const parts = new Parts();
	const yellow = mat( 0xe0b51a, { roughness: 0.5, metalness: 0.3 } );
	const wire = mat( 0x8d9296, { roughness: 0.45, metalness: 0.6 } );
	const plate = mat( 0x9aa0a4, { roughness: 0.5, metalness: 0.6 } );
	const L = 8 * FT;
	const D = 4 * FT;
	const H = 7 * FT;
	const t = 0.05;
	const hl = L / 2;
	const hd = D / 2;
	const floor = 0.22;

	// Skids, fork pockets and the floor frame with its plate.
	for ( const z of [ - hd + 0.1, hd - 0.1 ] ) parts.box( yellow, [ L, 0.1, 0.08 ], [ 0, 0, z ] );
	for ( const x of [ - 0.55, 0.55 ] ) {

		parts.box( yellow, [ 0.22, 0.07, D ], [ x, 0.1, 0 ] );
		for ( const z of [ - hd - 0.001, hd + 0.001 ] ) parts.box( HOLE(), [ 0.18, 0.05, 0.004 ], [ x, 0.11, z ] );

	}

	for ( const z of [ - hd + t / 2, hd - t / 2 ] ) parts.box( yellow, [ L, t, t ], [ 0, 0.17, z ] );
	for ( const x of [ - hl + t / 2, hl - t / 2 ] ) parts.box( yellow, [ t, t, D - 2 * t ], [ x, 0.17, 0 ] );
	parts.box( plate, [ L - 0.02, 0.006, D - 0.02 ], [ 0, floor - 0.006, 0 ] );

	// Posts and top frame.
	for ( const x of [ - hl + t / 2, hl - t / 2 ] ) for ( const z of [ - hd + t / 2, hd - t / 2 ] ) parts.box( yellow, [ t, H - floor - t, t ], [ x, floor, z ] );
	parts.box( yellow, [ t, H - floor - t, t ], [ 0, floor, hd - t / 2 ] );
	for ( const z of [ - hd + t / 2, hd - t / 2 ] ) parts.box( yellow, [ L, t, t ], [ 0, H - t, z ] );
	for ( const x of [ - hl + t / 2, hl - t / 2 ] ) parts.box( yellow, [ t, t, D - 2 * t ], [ x, H - t, 0 ] );

	// Kick plates and mesh on the back, ends and roof.
	const kick = 0.2;
	parts.box( yellow, [ L - 2 * t, kick, 0.004 ], [ 0, floor, hd - t / 2 ] );
	for ( const x of [ - hl + t / 2, hl - t / 2 ] ) parts.box( yellow, [ 0.004, kick, D - 2 * t ], [ x, floor, 0 ] );
	for ( const [ x0, x1 ] of [ [ - hl + t, - t / 2 ], [ t / 2, hl - t ] ] ) mesh( parts, wire, 'z', hd - t / 2, [ x0, x1 ], [ floor + kick, H - t ] );
	for ( const x of [ - hl + t / 2, hl - t / 2 ] ) mesh( parts, wire, 'x', x, [ - hd + t, hd - t ], [ floor + kick, H - t ] );
	mesh( parts, wire, 'y', H - t / 2, [ - hl + t, hl - t ], [ - hd + t, hd - t ] );

	// Two doors hung on the front corner posts, meeting in the middle at the hasp.
	const leaf = hl - t - 0.01;
	const front = - hd + t / 2;
	const d = 0.04;
	const dy0 = floor + 0.02;
	const dy1 = H - t - 0.02;
	for ( const s of [ - 1, 1 ] ) {

		const x0 = s * ( hl - t );
		const x1 = s * 0.005;
		const xm = ( x0 + x1 ) / 2;
		for ( const x of [ x0 - s * d / 2, x1 + s * d / 2 ] ) parts.box( yellow, [ d, dy1 - dy0, d ], [ x, dy0, front ] );
		for ( const y of [ dy0, dy1 - d, dy0 + kick ] ) parts.box( yellow, [ leaf - 2 * d, d, d ], [ xm, y, front ] );
		parts.box( yellow, [ leaf - 2 * d, kick - d, 0.004 ], [ xm, dy0 + d, front ] );
		mesh( parts, wire, 'z', front, [ Math.min( x0, x1 ) + ( s > 0 ? d : d ), Math.max( x0, x1 ) - d ], [ dy0 + kick + d, dy1 - d ] );
		for ( const y of [ dy0 + 0.25, dy1 - 0.25 ] ) parts.cylinder( STEEL(), 0.014, 0.1, [ s * ( hl - t / 2 ), y, front - 0.03 ], 8 );

	}

	// Hasp and padlock.
	const haspY = 1.15;
	parts.box( STEEL(), [ 0.16, 0.06, 0.008 ], [ 0, haspY, front - 0.025 ] );
	parts.box( mat( 0xb08d2a, { roughness: 0.35, metalness: 0.7 } ), [ 0.05, 0.05, 0.02 ], [ 0, haspY - 0.07, front - 0.04 ] );
	const shackle = new TorusGeometry( 0.016, 0.004, 5, 12, Math.PI );
	shackle.translate( 0, haspY - 0.02, front - 0.04 );
	parts.add( STEEL(), shackle );

	// Lifting eyes at the top corners.
	for ( const x of [ - hl + 0.05, hl - 0.05 ] ) {

		for ( const z of [ - hd + 0.05, hd - 0.05 ] ) {

			parts.box( yellow, [ 0.012, 0.08, 0.09 ], [ x, H, z ] );
			hole( parts, [ x, H + 0.045, z ], 'x', [ 0.04, 0.04 ] );

		}

	}

	// A shelf on the back wall with stock on it, and cans and buckets on the floor.
	const shelfY = 1.2;
	parts.box( plate, [ L - 0.2, 0.025, 0.42 ], [ 0, shelfY - 0.025, hd - t - 0.21 ] );
	for ( const x of [ - hl + 0.3, 0, hl - 0.3 ] ) parts.rod( yellow, [ x, shelfY - 0.03, hd - t ], [ x, shelfY - 0.3, hd - t ], 0.012, 4 );
	stock( parts, random( 77 ), [ L - 0.3, 0.4, 0.38 ], [ 0, shelfY, hd - t - 0.42 ] );
	const red = mat( 0xc22424, { roughness: 0.5 } );
	for ( const x of [ - 0.9, - 0.65 ] ) {

		parts.box( red, [ 0.2, 0.32, 0.34 ], [ x, floor, hd - 0.3 ] );
		parts.rod( BLACK(), [ x, floor + 0.36, hd - 0.4 ], [ x, floor + 0.36, hd - 0.2 ], 0.012, 6 );
		parts.cylinder( mat( 0xe0b51a, { roughness: 0.5 } ), 0.02, 0.05, [ x, floor + 0.32, hd - 0.44 ], 8 );

	}

	const bucket = mat( 0xe8741c, { roughness: 0.55 } );
	for ( let i = 0; i < 3; i ++ ) parts.cylinder( bucket, 0.13, 0.36, [ 0.7, floor + i * 0.06, hd - 0.35 ], 18, 0.15 );

	return parts.build();

}
