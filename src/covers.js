import { BufferAttribute, BufferGeometry, ConeGeometry, DoubleSide, Matrix4, Shape, ShapeGeometry, Vector2 } from 'three';
import { BLACK, drawn, FT, GALVANISED, IN, mat, Parts, RUBBER, STEEL } from './parts.js';

// Temporary covers and hoarding at real size, in metres: tension fabric shelters, a canopy over two
// containers, a pop-up tent, a shrink-wrapped scaffold enclosure, a screened fence run and a
// plywood hoarding. Each stands on y = 0 with its open end or face toward -Z, so heading 0 points
// it north. Fabric is drawn from both sides, so the inside looks right when you walk in.

const FABRIC = () => mat( 0xf1f1ec, { roughness: 0.9, side: DoubleSide } );
const CANOPY = () => mat( 0x2b62b0, { roughness: 0.8, side: DoubleSide } );
const WRAP = () => mat( 0xe6ebee, { roughness: 0.45, side: DoubleSide } );
const STRAP = () => mat( 0x9aa3aa, { roughness: 0.6 } );
const SCREEN = () => mat( 0x1f3b2a, { roughness: 0.95, side: DoubleSide } );
const HEM = () => mat( 0x2f5a3f, { roughness: 0.9 } );
const PAINTED_PLY = () => mat( 0xd9d6cc, { roughness: 0.85 } );
const RAW_PLY = () => mat( 0xc4a46e, { roughness: 0.9 } );
const LUMBER = () => mat( 0xb38d5c, { roughness: 0.9 } );
const CONCRETE = () => mat( 0xb5b3ab, { roughness: 0.95 } );
const DOOR = () => mat( 0x8c9296, { roughness: 0.6, metalness: 0.3 } );

const _m = new Matrix4();

// --- arched fabric covers --------------------------------------------------------------------

// The arch's outline across x: straight legs from `base` up `legs`, then a full, round-shouldered
// arch rising `rise` more, from x = -span / 2 to span / 2. Each point has the outward normal.
function archProfile( { span, base, legs, rise }, steps = 28 ) {

	const points = [];
	if ( legs > 0 ) points.push( [ - span / 2, base ] );
	for ( let i = 0; i <= steps; i ++ ) {

		const t = Math.PI * ( 1 - i / steps );
		points.push( [ span / 2 * Math.cos( t ), base + legs + rise * Math.sin( t ) ** 0.85 ] );

	}

	if ( legs > 0 ) points.push( [ span / 2, base ] );
	return points.map( ( [ x, y ], i ) => {

		const [ ax, ay ] = points[ Math.max( i - 1, 0 ) ];
		const [ bx, by ] = points[ Math.min( i + 1, points.length - 1 ) ];
		const l = Math.hypot( bx - ax, by - ay );
		return { x, y, nx: - ( by - ay ) / l, ny: ( bx - ax ) / l };

	} );

}

// The fabric skin over the arch along z, pulled taut over each frame and sagging a little between
// them, as real ones do.
function fabricSkin( profile, length, bays, sag ) {

	const perBay = 8;
	const rows = bays * perBay + 1;
	const cols = profile.length;
	const positions = new Float32Array( rows * cols * 3 );
	const uvs = new Float32Array( rows * cols * 2 );
	for ( let j = 0; j < rows; j ++ ) {

		const z = - length / 2 + j * length / ( rows - 1 );
		const s = sag * Math.sin( Math.PI * ( j % perBay ) / perBay ) ** 2;
		for ( let i = 0; i < cols; i ++ ) {

			const { x, y, nx, ny } = profile[ i ];
			const k = j * cols + i;
			positions.set( [ x - nx * s, y - ny * s, z ], k * 3 );
			uvs.set( [ i / ( cols - 1 ), j / ( rows - 1 ) ], k * 2 );

		}

	}

	const index = [];
	for ( let j = 0; j < rows - 1; j ++ ) {

		for ( let i = 0; i < cols - 1; i ++ ) {

			const a = j * cols + i;
			index.push( a, a + 1, a + cols, a + 1, a + cols + 1, a + cols );

		}

	}

	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new BufferAttribute( positions, 3 ) );
	geometry.setAttribute( 'uv', new BufferAttribute( uvs, 2 ) );
	geometry.setIndex( index );
	geometry.computeVertexNormals();
	return geometry;

}

// Fabric on box-section trusses: the skin, a truss at each frame (chords and zigzag webs), purlins
// along the length, an end wall across the back (+Z) with `wall` as its outline, and the front
// (-Z) left open.
function archCover( parts, { span, length, base = 0, legs = 0, rise, bays, depth, sag = 0.08, wall, door } ) {

	const profile = archProfile( { span, base, legs, rise } );
	parts.add( FABRIC(), fabricSkin( profile, length, bays, sag ) );
	const frame = GALVANISED();
	const chord = Math.max( 0.035, depth / 10 );
	// Kept clear of the ground (or container tops) by the tube's own radius.
	const inset = ( p, d ) => [ p.x - p.nx * d, Math.max( p.y - p.ny * d, base + chord ) ];

	for ( let k = 0; k <= bays; k ++ ) {

		const z = - length / 2 + k * length / bays;
		const outer = profile.map( p => [ ...inset( p, chord + 0.02 ), z ] );
		const inner = profile.map( p => [ ...inset( p, depth ), z ] );
		parts.path( frame, outer, chord, 6, false );
		parts.path( frame, inner, chord * 0.8, 6, false );
		for ( let i = 0; i < profile.length - 1; i ++ ) parts.rod( frame, i % 2 ? inner[ i ] : outer[ i ], i % 2 ? outer[ i + 1 ] : inner[ i + 1 ], chord * 0.5, 4, true );
		// Base plates, kept within the cover's length at the end frames.
		const plateZ = Math.min( Math.max( z, 0.25 - length / 2 ), length / 2 - 0.25 );
		for ( const end of [ 0, profile.length - 1 ] ) parts.box( STEEL(), [ depth + 0.3, 0.03, 0.5 ], [ ( outer[ end ][ 0 ] + inner[ end ][ 0 ] ) / 2, base, plateZ ] );

	}

	// Purlins tie the frames together, kept clear of the sagging skin.
	for ( let i = 2; i < profile.length - 2; i += 4 ) {

		const [ x, y ] = inset( profile[ i ], sag + chord * 2 + 0.05 );
		parts.rod( frame, [ x, y, - length / 2 ], [ x, y, length / 2 ], chord * 0.6, 6 );

	}

	const shape = new Shape( wall.map( ( [ x, y ] ) => new Vector2( x, y ) ) );
	parts.add( FABRIC(), new ShapeGeometry( shape ), _m.makeTranslation( 0, 0, length / 2 - 0.01 ) );
	if ( door ) {

		const [ width, height ] = door;
		parts.box( DOOR(), [ width, height, 0.04 ], [ 0, base, length / 2 + 0.01 ] );
		parts.box( frame, [ width + 0.2, 0.25, 0.08 ], [ 0, base + height, length / 2 + 0.03 ] );

	}

	return profile;

}

// Tension fabric shelter (round-arch style) on the ground: straight legs to `legs`, then the arch.
export function fabricShelter( span, length, { legs, rise, bays, depth, door } ) {

	const parts = new Parts();
	const profile = archCover( parts, { span, length, legs, rise, bays, depth, door, wall: archProfile( { span, base: 0, legs, rise } ).map( p => [ p.x, p.y ] ) } );
	// Each frame foot is pinned to a concrete ballast block.
	for ( let k = 0; k <= bays; k ++ ) {

		const z = - length / 2 + k * length / bays;
		const blockZ = Math.min( Math.max( z, 0.3 - length / 2 ), length / 2 - 0.3 );
		for ( const x of [ profile[ 0 ].x, profile.at( - 1 ).x ] ) parts.box( CONCRETE(), [ 0.6, 0.3, 0.6 ], [ x - Math.sign( x ) * 0.3, 0, blockZ ] );

	}

	return parts.build();

}

// A fabric canopy spanning `clear` between two containers `height` tall, its frames bolted to the
// tops of their corner castings. procedural.js stands the containers either side.
export function containerCanopy( { clear, length, height } ) {

	const parts = new Parts();
	// The arch springs from base rails along the containers' tops, a little in from their inner edges.
	const spring = clear / 2 + 0.6;
	const rise = 4;
	const arch = archProfile( { span: spring * 2, base: height, legs: 0, rise } ).map( p => [ p.x, p.y ] );
	const wall = [ [ - clear / 2, 0 ], [ - clear / 2, height ], ...arch, [ clear / 2, height ], [ clear / 2, 0 ] ];
	archCover( parts, { span: spring * 2, length, base: height, rise, bays: 4, depth: 0.45, wall } );
	for ( const x of [ - spring, spring ] ) parts.box( STEEL(), [ 0.3, 0.2, length ], [ x, height, 0 ] );
	return parts.build();

}

// --- pop-up canopy ---------------------------------------------------------------------------

// A 10 x 10 ft (3 x 3 m) folding canopy: square aluminium legs, scissor trusses under the eaves, a
// pyramid roof with a valance, and a weight on each foot.
export function popUpCanopy() {

	const parts = new Parts();
	const size = 3;
	const eave = 2.1;
	const peak = 3.1;
	const alu = GALVANISED();
	const h = size / 2 - 0.03;
	for ( const x of [ - h, h ] ) {

		for ( const z of [ - h, h ] ) {

			parts.box( alu, [ 0.035, eave, 0.035 ], [ x, 0, z ] );
			parts.box( STEEL(), [ 0.15, 0.01, 0.15 ], [ x, 0, z ] );
			parts.cylinder( BLACK(), 0.075, 0.3, [ x, 0.01, z ], 12 );

		}

	}

	// Scissor trusses: three crossings on each side, 0.45 m deep.
	const truss = ( a, b ) => {

		for ( let i = 0; i < 3; i ++ ) {

			const t0 = i / 3;
			const t1 = ( i + 1 ) / 3;
			const at = ( t, y ) => [ a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t, y, a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t ];
			parts.rod( alu, at( t0, eave ), at( t1, eave - 0.45 ), 0.012, 4 );
			parts.rod( alu, at( t0, eave - 0.45 ), at( t1, eave ), 0.012, 4 );

		}

	};

	const corners = [ [ - h, - h ], [ h, - h ], [ h, h ], [ - h, h ] ];
	for ( let i = 0; i < 4; i ++ ) truss( corners[ i ], corners[ ( i + 1 ) % 4 ] );
	// Rafters from each corner up to the centre pole.
	for ( const [ x, z ] of corners ) parts.rod( alu, [ x, eave, z ], [ 0, peak - 0.08, 0 ], 0.012, 4 );
	parts.rod( alu, [ 0, eave + 0.1, 0 ], [ 0, peak - 0.05, 0 ], 0.015, 6 );

	// The roof: a four-sided cone turned so its corners sit over the legs, and the valance round it.
	const roof = new ConeGeometry( size / Math.SQRT2, peak - eave, 4, 1, true );
	parts.add( CANOPY(), roof, _m.makeRotationY( Math.PI / 4 ).setPosition( 0, ( eave + peak ) / 2, 0 ) );
	const valance = 0.25;
	for ( const [ sx, sz, x, z ] of [ [ size, 0.01, 0, - size / 2 ], [ size, 0.01, 0, size / 2 ], [ 0.01, size, - size / 2, 0 ], [ 0.01, size, size / 2, 0 ] ] ) parts.box( CANOPY(), [ sx, valance, sz ], [ x, eave - valance, z ] );
	return parts.build();

}

// --- scaffold weather enclosure --------------------------------------------------------------

// A tube-and-coupler scaffold (2.5 m bays, 2 m lifts) round a work area, wrapped in shrink-wrap
// with a pitched roof; the middle bay of the front is a door, its flap rolled up.
export function scaffoldEnclosure( { baysX = 3, baysZ = 2, bay = 2.5, lifts = 2, lift = 2, ridge = 1 } = {} ) {

	const parts = new Parts();
	const tube = GALVANISED();
	const r = 0.024;
	const lx = baysX * bay;
	const lz = baysZ * bay;
	const eave = lifts * lift;
	const xs = Array.from( { length: baysX + 1 }, ( _, i ) => - lx / 2 + i * bay );
	const zs = Array.from( { length: baysZ + 1 }, ( _, i ) => - lz / 2 + i * bay );

	// Standards round the outside (not in the middle of the floor), with base plates on sole boards.
	const standards = [];
	for ( const x of xs ) for ( const z of [ - lz / 2, lz / 2 ] ) standards.push( [ x, z ] );
	for ( const z of zs.slice( 1, - 1 ) ) for ( const x of [ - lx / 2, lx / 2 ] ) standards.push( [ x, z ] );
	for ( const [ x, z ] of standards ) {

		const corner = Math.abs( x ) === lx / 2 && Math.abs( z ) === lz / 2;
		parts.rod( tube, [ x, 0.05, z ], [ x, eave + ( corner ? 0.6 : 0.1 ), z ], r, 6 );
		parts.box( STEEL(), [ 0.15, 0.01, 0.15 ], [ x, 0.04, z ] );
		// Sole boards run along the wall (in from the corners), so they don't stick out of the wrap.
		if ( Math.abs( z ) === lz / 2 ) parts.box( LUMBER(), [ 0.45, 0.04, 0.23 ], [ Math.min( Math.max( x, 0.2 - lx / 2 ), lx / 2 - 0.2 ), 0, z ] );
		else parts.box( LUMBER(), [ 0.23, 0.04, 0.45 ], [ x, 0, z ] );

	}

	// Ledgers round each lift (left out of the door bay below the door's head), transoms across the
	// top, rafters up to the ridge.
	const doorTop = 2.6;
	const doorBay = Math.floor( baysX / 2 );
	const door = [ xs[ doorBay ], xs[ doorBay + 1 ] ];
	for ( let i = 0; i <= lifts; i ++ ) {

		const y = i === 0 ? 0.2 : i * lift;
		parts.rod( tube, [ - lx / 2, y, lz / 2 ], [ lx / 2, y, lz / 2 ], r, 6 );
		if ( y < doorTop ) {

			parts.rod( tube, [ - lx / 2, y, - lz / 2 ], [ door[ 0 ], y, - lz / 2 ], r, 6 );
			parts.rod( tube, [ door[ 1 ], y, - lz / 2 ], [ lx / 2, y, - lz / 2 ], r, 6 );

		} else {

			parts.rod( tube, [ - lx / 2, y, - lz / 2 ], [ lx / 2, y, - lz / 2 ], r, 6 );

		}

		for ( const x of [ - lx / 2, lx / 2 ] ) parts.rod( tube, [ x, y, - lz / 2 ], [ x, y, lz / 2 ], r, 6 );

	}

	for ( const x of xs ) {

		parts.rod( tube, [ x, eave, - lz / 2 ], [ x, eave, lz / 2 ], r, 6 );
		parts.rod( tube, [ x, eave, - lz / 2 ], [ x, eave + ridge, 0 ], r, 6 );
		parts.rod( tube, [ x, eave + ridge, 0 ], [ x, eave, lz / 2 ], r, 6 );

	}

	parts.rod( tube, [ - lx / 2, eave + ridge, 0 ], [ lx / 2, eave + ridge, 0 ], r, 6 );

	// Shrink-wrap just outside the tubes: walls, gables and roof, leaving the front door bay open
	// below its rolled-up flap.
	const out = 0.05;
	const wrap = WRAP();
	parts.box( wrap, [ lx + 2 * out, eave - 0.1, 0.01 ], [ 0, 0.1, lz / 2 + out ] );
	for ( const x of [ - lx / 2 - out, lx / 2 + out ] ) parts.box( wrap, [ 0.01, eave - 0.1, lz + 2 * out ], [ x, 0.1, 0 ] );
	for ( let i = 0; i < baysX; i ++ ) {

		const x = - lx / 2 + ( i + 0.5 ) * bay;
		const doorway = i === doorBay;
		const from = doorway ? doorTop + 0.3 : 0.1;
		parts.box( wrap, [ bay + ( i === 0 || i === baysX - 1 ? out : 0 ), eave - from, 0.01 ], [ x + ( i === 0 ? - out / 2 : i === baysX - 1 ? out / 2 : 0 ), from, - lz / 2 - out ] );
		if ( doorway ) parts.rod( wrap, [ x - bay / 2 + 0.1, from - 0.1, - lz / 2 - out - 0.08 ], [ x + bay / 2 - 0.1, from - 0.1, - lz / 2 - out - 0.08 ], 0.09, 10 );

	}

	const gable = new Shape( [ new Vector2( - lz / 2 - out, eave ), new Vector2( lz / 2 + out, eave ), new Vector2( 0, eave + ridge + out ) ] );
	for ( const x of [ - lx / 2 - out, lx / 2 + out ] ) parts.add( wrap, new ShapeGeometry( gable ), _m.makeRotationY( Math.PI / 2 ).setPosition( x, 0, 0 ) );
	const slope = Math.hypot( lz / 2 + out, ridge );
	const pitch = Math.atan2( ridge, lz / 2 );
	for ( const side of [ - 1, 1 ] ) parts.block( wrap, [ lx + 2 * out + 0.1, 0.01, slope + 0.1 ], [ 0, eave + ridge / 2 + out, side * ( lz / 4 + out / 2 ) ], [ side * pitch, 0, 0 ] );

	// Straps round the wrap at each lift and down each standard, as it's tied to the scaffold.
	const strap = STRAP();
	const front = - lz / 2 - out - 0.01;
	for ( let i = 1; i < lifts; i ++ ) {

		const y = i * lift;
		parts.box( strap, [ lx + 2 * out + 0.02, 0.05, 0.01 ], [ 0, y, lz / 2 + out + 0.01 ] );
		for ( const x of [ - lx / 2 - out - 0.01, lx / 2 + out + 0.01 ] ) parts.box( strap, [ 0.01, 0.05, lz + 2 * out + 0.02 ], [ x, y, 0 ] );
		const left = door[ 0 ] + lx / 2 + out;
		const right = lx / 2 + out - door[ 1 ];
		parts.box( strap, [ left, 0.05, 0.01 ], [ - lx / 2 - out + left / 2, y, front ] );
		parts.box( strap, [ right, 0.05, 0.01 ], [ door[ 1 ] + right / 2, y, front ] );

	}

	for ( const x of xs.slice( 1, - 1 ) ) for ( const z of [ lz / 2 + out + 0.01, front ] ) parts.box( strap, [ 0.05, eave - 0.1, 0.01 ], [ x, 0.1, z ] );
	for ( const z of zs.slice( 1, - 1 ) ) for ( const x of [ - lx / 2 - out - 0.01, lx / 2 + out + 0.01 ] ) parts.box( strap, [ 0.01, eave - 0.1, 0.05 ], [ x, 0.1, z ] );
	return parts.build();

}

// --- fencing and hoarding --------------------------------------------------------------------

// A run of 10 x 6 ft temporary fence panels with a green privacy (wind) screen tied on, clamped at
// each joint on rubber feet, and braced behind (+Z) as a screened fence has to be for the wind.
export function screenedFence( panels = 3 ) {

	const parts = new Parts();
	const width = 10 * FT;
	const height = 6 * FT;
	const lift = 0.08;
	const length = panels * width;
	const tube = GALVANISED();
	const x0 = - length / 2;

	for ( let i = 0; i < panels; i ++ ) {

		const a = x0 + i * width + 0.03;
		const b = a + width - 0.06;
		for ( const x of [ a, b ] ) parts.rod( tube, [ x, lift, 0 ], [ x, lift + height, 0 ], 0.02, 8 );
		for ( const y of [ lift, lift + height ] ) parts.rod( tube, [ a, y, 0 ], [ b, y, 0 ], 0.02, 8 );
		parts.rod( tube, [ ( a + b ) / 2, lift, 0 ], [ ( a + b ) / 2, lift + height, 0 ], 0.012, 6 );

		// The screen just in front of the mesh, with a darker hem and ties round the frame.
		const sx = ( a + b ) / 2;
		const sh = height - 0.1;
		parts.box( SCREEN(), [ width - 0.1, sh, 0.004 ], [ sx, lift + 0.05, - 0.025 ] );
		for ( const y of [ lift + 0.05, lift + 0.05 + sh - 0.04 ] ) parts.box( HEM(), [ width - 0.1, 0.04, 0.006 ], [ sx, y, - 0.026 ] );
		for ( let t = 0; t < 6; t ++ ) {

			const x = a + 0.15 + t * ( width - 0.36 ) / 5;
			for ( const y of [ lift, lift + height ] ) parts.box( BLACK(), [ 0.008, 0.05, 0.05 ], [ x, y - 0.025, - 0.005 ] );

		}

	}

	// Feet and clamps at each joint; a brace stay behind every joint, on a foot of its own.
	for ( let i = 0; i <= panels; i ++ ) {

		const x = x0 + i * width;
		parts.box( RUBBER(), [ 0.2, 0.12, 0.6 ], [ x, 0, 0 ] );
		for ( const y of [ 0.5, lift + height - 0.3 ] ) parts.box( STEEL(), [ 0.12, 0.06, 0.06 ], [ x, y, 0 ] );
		parts.rod( tube, [ x, lift + height - 0.25, 0.03 ], [ x, 0.12, 1.2 ], 0.017, 6 );
		parts.rod( tube, [ x, 0.12, 0.25 ], [ x, 0.12, 1.2 ], 0.017, 6 );
		parts.box( RUBBER(), [ 0.2, 0.12, 0.6 ], [ x, 0, 1.0 ] );

	}

	return parts.build();

}

// Painted plywood hoarding, 8 ft high, 4 x 8 ft sheets standing on end on 2 x 4 rails and 4 x 4
// posts at 8 ft, with a kicker brace behind every other post. The painted face is the front (-Z).
export function plywoodHoarding( length = 10 ) {

	const parts = new Parts();
	const height = 8 * FT;
	const sheet = 4 * FT;
	const ply = 0.019;
	const x0 = - length / 2;
	parts.box( PAINTED_PLY(), [ length, height, ply ], [ 0, 0.05, - ply / 2 ] );
	parts.box( RAW_PLY(), [ length, height, 0.002 ], [ 0, 0.05, 0.001 ] );
	// Sheet joints show as fine lines on the painted face.
	for ( let x = x0 + sheet; x < length / 2 - 0.05; x += sheet ) parts.box( mat( 0xb8b5ac, { roughness: 0.9 } ), [ 0.006, height, 0.002 ], [ x, 0.05, - ply - 0.001 ] );

	// The usual notice at eye level.
	parts.box( notice(), [ 1.2, 0.6, 0.004 ], [ - length / 4, 1.3, - ply - 0.003 ] );

	const lumber = LUMBER();
	const rail = [ 1.5 * IN, 3.5 * IN ];
	for ( const y of [ 0.15, height / 2, height - 0.1 ] ) parts.box( lumber, [ length, rail[ 1 ], rail[ 0 ] ], [ 0, y, 0.002 + rail[ 0 ] / 2 ] );
	// Posts evenly spaced, no more than 8 ft apart.
	const post = 3.5 * IN;
	const spaces = Math.ceil( ( length - post ) / ( 8 * FT ) );
	for ( let i = 0; i <= spaces; i ++ ) {

		const x = x0 + post / 2 + i * ( length - post ) / spaces;
		const z = 0.002 + rail[ 0 ] + post / 2;
		parts.box( lumber, [ post, height + 0.05, post ], [ x, 0, z ] );
		if ( i % 2 === 0 ) {

			parts.rod( lumber, [ x, height * 0.65, z ], [ x, 0.06, z + 1.1 ], 0.035, 4 );
			parts.box( lumber, [ 0.05, 0.25, 0.05 ], [ x, 0, z + 1.15 ] );

		}

	}

	return parts.build();

}

function notice() {

	return drawn( 'hoarding notice', [ 512, 256 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#ffffff';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#c8102e';
		ctx.fillRect( 0, 0, w, 84 );
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = 'bold 54px sans-serif';
		ctx.fillStyle = '#ffffff';
		ctx.fillText( 'DANGER', w / 2, 44, w - 40 );
		ctx.fillStyle = '#111111';
		ctx.font = 'bold 40px sans-serif';
		ctx.fillText( 'CONSTRUCTION SITE', w / 2, 130, w - 40 );
		ctx.font = '30px sans-serif';
		ctx.fillText( 'Authorized personnel only', w / 2, 192, w - 40 );

	} );

}
