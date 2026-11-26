import { ExtrudeGeometry, PlaneGeometry, Matrix4, Shape, Vector2 } from 'three';
import { drawn, FT, IN, mat, Parts } from './parts.js';

// Rail track, a portable indirect-fired heater and stop signs, built in code at real North American
// sizes. Like the other built-in pieces each stands on y = 0 with its front facing -Z.

const _m = new Matrix4();

export const EXTRA_ITEMS = [
	// One 39 ft panel (the length of a standard rail) of standard-gauge track. A row of them
	// (rows.js) lays them end to end with the ties evenly spaced across each joint.
	{ id: 'rail-track-39ft', name: 'Rail track, standard gauge (39 ft panel, 136 lb rail, timber ties, ballast)', category: 'Rail',
		keywords: 'railway railroad track rails ties sleepers ballast spur siding', build: railTrack, rowLength: 39 * FT },
	{ id: 'heater-indirect-400k', name: 'Indirect-fired heater, 400,000 BTU/h (Herman Nelson BT400 type) with 2 flex ducts', category: 'Site services',
		keywords: 'herman nelson heater winter heat hoarding duct diesel tarp enclosure thaw', build: heater },
	{ id: 'stop-sign-post', name: 'Stop sign on post (30 in, 7 ft to bottom)', category: 'Traffic control',
		keywords: 'stop sign road sign r1-1', build: () => stopSign( { size: 30 * IN, bottom: 7 * FT, post: 2 * IN, base: null } ) },
	{ id: 'stop-sign-portable', name: 'Stop sign, portable small (18 in on rubber base)', category: 'Traffic control',
		keywords: 'stop sign small little portable base parking yard', build: () => stopSign( { size: 18 * IN, bottom: 3 * FT, post: 1 * IN, base: [ 24 * IN, 3 * IN ] } ) },
];

// --- rail track ------------------------------------------------------------------------------

const GAUGE = 56.5 * IN;
const TIE = [ 8.5 * FT, 7 * IN, 9 * IN ]; // length across, depth, width along the track
const TIES_PER_PANEL = 24; // 19.5 in centres
const PLATE = [ 14 * IN, 0.75 * IN, 7.75 * IN ];
const RAIL_HEAD = 2.94 * IN;

// 136RE rail, simplified, in inches: x across, y up from the base.
const RAIL_PROFILE = [
	[ - 3, 0 ], [ 3, 0 ], [ 3, 0.55 ], [ 0.9, 1.25 ], [ 0.344, 1.7 ], [ 0.344, 5.0 ], [ 1.47, 5.45 ], [ 1.47, 7.1 ], [ 1.3, 7.31 ],
	[ - 1.3, 7.31 ], [ - 1.47, 7.1 ], [ - 1.47, 5.45 ], [ - 0.344, 5.0 ], [ - 0.344, 1.7 ], [ - 0.9, 1.25 ], [ - 3, 0.55 ],
];

function railTrack() {

	const parts = new Parts();
	const length = 39 * FT;
	const ballast = mat( 0x807c75, { roughness: 1 } );
	const tie = mat( 0x3d3129, { roughness: 0.95 } );
	const plate = mat( 0x3a3633, { roughness: 0.7, metalness: 0.4 } );
	const rail = mat( 0x5f5048, { roughness: 0.75, metalness: 0.35 } );
	const head = mat( 0xb8bbbd, { roughness: 0.3, metalness: 0.7 } );

	// Ballast: 12 in under the ties and a 12 in shoulder past their ends, sloping 1.5 : 1, its top
	// an inch below the top of the ties so they show.
	const under = 12 * IN;
	const top = under + TIE[ 1 ] - 1 * IN;
	const halfTop = TIE[ 0 ] / 2 + 12 * IN;
	const halfBottom = halfTop + 1.5 * top;
	parts.add( ballast, extruded( [ [ - halfBottom, 0 ], [ halfBottom, 0 ], [ halfTop, top ], [ - halfTop, top ] ], length ) );

	// Ties, evenly spaced so a row of panels keeps the spacing through each joint.
	const pitch = length / TIES_PER_PANEL;
	const tieTop = under + TIE[ 1 ];
	const railX = GAUGE / 2 + RAIL_HEAD / 2;
	for ( let i = 0; i < TIES_PER_PANEL; i ++ ) {

		const z = - length / 2 + pitch * ( i + 0.5 );
		parts.box( tie, [ TIE[ 0 ], TIE[ 1 ], TIE[ 2 ] ], [ 0, under, z ] );
		for ( const x of [ - railX, railX ] ) parts.box( plate, PLATE, [ x, tieTop, z ] );

	}

	// Two rails, with the worn bright strip along the top of the head.
	const railBase = tieTop + PLATE[ 1 ];
	const profile = RAIL_PROFILE.map( ( [ x, y ] ) => [ x * IN, y * IN ] );
	for ( const x of [ - railX, railX ] ) {

		parts.add( rail, extruded( profile, length ), _m.makeTranslation( x, railBase, 0 ) );
		parts.box( head, [ 2.2 * IN, 0.004, length ], [ x, railBase + 7.31 * IN - 0.002, 0 ] );

	}

	return parts.build();

}

// A cross-section (points [ x, y ]) extruded along z, centred on z = 0.
function extruded( points, length ) {

	const shape = new Shape( points.map( ( [ x, y ] ) => new Vector2( x, y ) ) );
	const geometry = new ExtrudeGeometry( shape, { depth: length, bevelEnabled: false, curveSegments: 4 } );
	geometry.translate( 0, 0, - length / 2 );
	return geometry;

}

// --- indirect-fired heater -------------------------------------------------------------------

// A 400,000 BTU/h diesel indirect-fired heater of the size rental fleets carry (about 2.1 m long,
// 1.05 m wide and 1.7 m high to the flue cap): a cabinet on a skid fuel tank with fork pockets,
// the burner and flue at the back, and two 12 in outlets at the front with yellow flex ducts
// running forward along the ground, as when it's heating a hoarding.
function heater() {

	const parts = new Parts();
	const body = mat( 0xe4e2dc, { roughness: 0.5, metalness: 0.2 } );
	const trim = mat( 0x2c2e31, { roughness: 0.7, metalness: 0.2 } );
	const black = mat( 0x18191b, { roughness: 0.85 } );
	const steel = mat( 0x8a8f94, { roughness: 0.5, metalness: 0.6 } );
	const red = mat( 0xb3262a, { roughness: 0.5, metalness: 0.2 } );
	const duct = mat( 0xf0b41c, { roughness: 0.65 } );
	const lamp = mat( 0xff9a1a, { roughness: 0.3, emissive: 0xc76a00, emissiveIntensity: 0.6 } );

	const length = 2.1;
	const width = 1.05;
	const tank = 0.36;

	// Skid fuel tank with fork pockets through it.
	parts.box( trim, [ width, tank, length ], [ 0, 0, 0 ] );
	for ( const z of [ - 0.45, 0.45 ] ) parts.box( black, [ width + 0.01, 0.13, 0.26 ], [ 0, 0.06, z ] );
	parts.cylinder( steel, 0.05, 0.05, [ width / 2 - 0.15, tank, 0.75 ] ); // fill cap

	// Cabinet, with a red stripe round it and air intake louvres on the sides.
	const cab = [ width - 0.05, 1.0, length - 0.25 ];
	parts.box( body, cab, [ 0, tank, 0.05 ] );
	parts.box( red, [ cab[ 0 ] + 0.01, 0.07, cab[ 2 ] + 0.01 ], [ 0, tank + 0.12, 0.05 ] );
	for ( const x of [ - cab[ 0 ] / 2, cab[ 0 ] / 2 ] ) {

		for ( let i = 0; i < 6; i ++ ) parts.box( trim, [ 0.012, 0.03, 0.7 ], [ x, tank + 0.45 + i * 0.075, - 0.3 ] );

	}

	// Control panel on the right with a pilot lamp, and a lifting eye on top.
	parts.box( trim, [ 0.04, 0.32, 0.4 ], [ cab[ 0 ] / 2 + 0.02, tank + 0.45, 0.55 ] );
	parts.sphere( lamp, 0.025, [ cab[ 0 ] / 2 + 0.045, tank + 0.7, 0.45 ] );
	const roof = tank + cab[ 1 ];
	parts.box( steel, [ 0.04, 0.14, 0.18 ], [ 0, roof, 0 ] );

	// Burner housing at the back and the flue stack with its rain cap.
	const back = 0.05 + cab[ 2 ] / 2;
	parts.box( trim, [ 0.55, 0.5, 0.2 ], [ 0, tank + 0.25, back + 0.1 ] );
	parts.cylinder( steel, 0.1, 0.25, [ 0, roof, back - 0.25 ], 14 );
	parts.cylinder( steel, 0.17, 0.08, [ 0, roof + 0.3, back - 0.25 ], 14, 0.03 );

	// Outlet plenum at the front with two 12 in collars.
	const front = 0.05 - cab[ 2 ] / 2;
	const plenum = [ 0.9, 0.48, 0.18 ];
	const outletY = roof - 0.32;
	parts.box( body, plenum, [ 0, outletY - plenum[ 1 ] / 2, front - plenum[ 2 ] / 2 ] );
	const r = 6 * IN;
	for ( const x of [ - 0.22, 0.22 ] ) {

		const collar = [ x, outletY, front - plenum[ 2 ] ];
		parts.rod( steel, collar, [ x, outletY, collar[ 2 ] - 0.12 ], r * 1.05, 16 );

		// The duct: off the collar, down to the ground and along it, ribbed every 15 cm.
		const reach = collar[ 2 ] - 0.12;
		const splay = Math.sign( x ) * 0.35;
		const points = [
			[ x, outletY, reach ],
			[ x, outletY - 0.05, reach - 0.3 ],
			[ x + splay * 0.1, outletY * 0.55, reach - 0.65 ],
			[ x + splay * 0.25, r, reach - 1.1 ],
			[ x + splay, r, reach - 3.2 ],
		];
		parts.path( duct, points, r, 16 );
		for ( let i = 1; i < points.length; i ++ ) {

			const [ a, b ] = [ points[ i - 1 ], points[ i ] ];
			const span = Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ], b[ 2 ] - a[ 2 ] );
			const ribs = Math.floor( span / 0.15 );
			for ( let j = 1; j < ribs; j ++ ) {

				const t0 = j / ribs;
				const t1 = t0 + 0.02 / span;
				parts.rod( duct, lerp( a, b, t0 ), lerp( a, b, t1 ), r * 1.06, 16 );

			}

		}

	}

	return parts.build();

}

function lerp( a, b, t ) {

	return a.map( ( v, i ) => v + ( b[ i ] - v ) * t );

}

// --- stop signs ------------------------------------------------------------------------------

// An R1-1 stop sign of `size` (across the flats) with its bottom at `bottom`, on a square steel
// post of side `post`. `base` [ side, height ] stands it in a square rubber base instead of the
// ground. The face is to the front (-Z), the bare aluminium back behind.
function stopSign( { size, bottom, post, base } ) {

	const parts = new Parts();
	const galvanised = mat( 0xa9adb0, { roughness: 0.45, metalness: 0.65 } );
	const centre = bottom + size / 2;
	const top = bottom + size - 0.05;
	const foot = base ? base[ 1 ] : 0;

	if ( base ) parts.box( mat( 0x1d1f21, { roughness: 0.95 } ), [ base[ 0 ], base[ 1 ], base[ 0 ] ], [ 0, 0, 0 ] );
	parts.box( galvanised, [ post, top - foot, post ], [ 0, foot, 0 ] );

	const square = () => new PlaneGeometry( size, size );
	parts.add( stopFace(), square(), _m.makeRotationY( Math.PI ).setPosition( 0, centre, - post / 2 - 0.006 ) );
	parts.add( stopBack(), square(), _m.makeTranslation( 0, centre, - post / 2 - 0.003 ) );

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

// Red with a white border and letters, as the MUTCD draws it.
function stopFace() {

	return drawn( 'stop sign face', [ 512, 512 ], ( ctx, w ) => {

		const r = w / 2 / Math.cos( Math.PI / 8 );
		octagon( ctx, w, r );
		ctx.fillStyle = '#ffffff';
		ctx.fill();
		octagon( ctx, w, r * 0.93 );
		ctx.fillStyle = '#c8102e';
		ctx.fill();
		ctx.fillStyle = '#ffffff';
		ctx.font = 'bold 170px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText( 'STOP', w / 2, w / 2 + 8, w * 0.8 );

	} );

}

function stopBack() {

	return drawn( 'stop sign back', [ 128, 128 ], ( ctx, w ) => {

		octagon( ctx, w, w / 2 / Math.cos( Math.PI / 8 ) );
		ctx.fillStyle = '#a7abae';
		ctx.fill();

	}, { metalness: 0.5, roughness: 0.45 } );

}
