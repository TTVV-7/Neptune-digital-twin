import { BoxGeometry, CatmullRomCurve3, CylinderGeometry, Euler, Matrix4, PlaneGeometry, TorusGeometry, Vector3 } from 'three';
import { drawn, FT, IN, mat, Parts } from './parts.js';

// Temporary construction power, built in code at the usual North American sizes: a service pole
// with its meter and panel, a spider box, a cord reel, cords hung on stands, a string of work
// lights and a panel on a plywood stand. Like the other built-in pieces each stands on y = 0 with
// its front facing -Z (+X is its right).

const _m = new Matrix4();
const _e = new Euler();

export const TEMP_POWER_ITEMS = [
	{ id: 'temp-power-pole', name: 'Temporary power pole with meter, disconnect and GFCI outlets (20 ft, 100 A service)', category: 'Power & air',
		keywords: 'temp power pole temporary service pole meter base meter socket disconnect panel gfci receptacles saw pole service drop weatherhead electrical hydro', build: powerPole },
	{ id: 'spider-box-50a', name: 'Spider box, temporary distribution box on stand with cords (50 A)', category: 'Power & air',
		keywords: 'spider box temporary power distribution box temp power cords outlets gfci 50 amp splitter extension cords', build: spiderBox },
	{ id: 'cord-reel-stand', name: 'Extension cord reel on stand (100 ft, 12/3 cord)', category: 'Power & air',
		keywords: 'cord reel extension cord reel stand stinger 100 ft cord hose reel temporary power', build: cordReel },
	// Laid in lines: a rowLength (rows.js) is the span from one stand to the next, so a row of them
	// is one cord or one string of lights carried stand to stand.
	{ id: 'cord-run-stands', name: 'Extension cord run on cord stands (25 ft span, 7 ft high)', category: 'Power & air',
		keywords: 'extension cord run cord stand cord tree cord hanger cable stand temporary power cords overhead off the ground stinger', build: cordRun, rowLength: 25 * FT },
	{ id: 'temp-light-string', name: 'Temporary lighting string on stands (25 ft span, LED lamps every 6 ft)', category: 'Power & air',
		keywords: 'temporary lighting string lights festoon lights work lights stringer temp lights cage lamps light stand', build: lightString, rowLength: 25 * FT },
	{ id: 'temp-panel-plywood', name: 'Temporary electrical panel on plywood stand (100 A, 4 × 4 ft board)', category: 'Power & air',
		keywords: 'temporary electrical panel temp panel plywood stand board load centre load center breaker panel disconnect gfci receptacles temp power', build: panelStand },
];

const POLE = () => mat( 0x6a5240, { roughness: 0.95 } );
const LUMBER = () => mat( 0xc9a878, { roughness: 0.9 } );
const PLYWOOD = () => mat( 0xc7a274, { roughness: 0.9 } );
const ENCLOSURE = () => mat( 0x9a9fa3, { roughness: 0.45, metalness: 0.5 } );
const PVC = () => mat( 0x8d9296, { roughness: 0.6 } );
const STEEL = () => mat( 0x8a8f94, { roughness: 0.5, metalness: 0.6 } );
const BLACK = () => mat( 0x1d1f21, { roughness: 0.7 } );
const RUBBER = () => mat( 0x161718, { roughness: 0.9 } );
const COPPER = () => mat( 0xb06a3a, { roughness: 0.4, metalness: 0.7 } );
const GLASS = () => mat( 0xcfd8dc, { roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.55 } );
const CORD = color => mat( color, { roughness: 0.6 } );
const ORANGE_CORD = 0xf06a1a;
const YELLOW_CORD = 0xf2c318;
const GREEN_CORD = 0x3f9a3a;

// --- power pole ------------------------------------------------------------------------------

// A treated wood pole standing 20 ft out of the ground, braced by two 2×4 kickers behind. On its
// front: a plywood backboard with the meter base and its glass meter, a fused disconnect, a
// small panel and two weatherproof GFCI outlets with cords plugged in; PVC conduit up the pole to
// a weatherhead at the top, its wires looped down to the insulator the utility's drop ties off
// on; a ground rod at the foot.
function powerPole() {

	const parts = new Parts();
	const height = 20 * FT;
	const r = 0.11;
	parts.cylinder( POLE(), r, height, [ 0, 0, 0 ], 14, 0.095 );

	// Kickers: 2×4s from 6 ft up to stakes behind, left and right.
	for ( const s of [ - 1, 1 ] ) {

		const top = [ s * 0.06, 1.85, 0.08 ];
		const foot = [ s * 1.0, 0.02, 1.3 ];
		brace( parts, LUMBER(), top, foot, [ 1.5 * IN, 3.5 * IN ] );
		parts.box( LUMBER(), [ 0.05, 0.12, 0.05 ], [ foot[ 0 ], 0, foot[ 2 ] + 0.04 ] );

	}

	// Backboard, its face 2 in in front of the pole.
	const face = - r - 0.05;
	parts.box( PLYWOOD(), [ 0.6, 1.5, 0.019 ], [ 0, 0.65, face + 0.0095 ] );
	parts.box( LUMBER(), [ 0.09, 1.5, 0.04 ], [ 0, 0.65, face + 0.038 ] );
	equipment( parts, face, { meter: [ 0, 1.72 ], disconnect: [ 0.12, 1.25 ], panel: [ - 0.13, 1.18 ], outlets: [ [ - 0.2, 0.82 ], [ 0.2, 0.82 ] ] } );

	// Conduit up the pole from the meter to the weatherhead, strapped to the pole.
	const conduit = [ 0, 1.92, - r - 0.03 ];
	parts.rod( PVC(), [ 0, 1.86, face - 0.05 ], [ 0, 1.92, face - 0.05 ], 0.024, 10 );
	parts.path( PVC(), [ [ 0, 1.92, face - 0.05 ], [ 0, 1.98, - r - 0.03 ], [ 0, height - 0.25, - r - 0.03 ] ], 0.022, 10 );
	for ( let y = 2.6; y < height - 0.3; y += 1.2 ) parts.box( STEEL(), [ 0.06, 0.03, 0.012 ], [ 0, y, conduit[ 2 ] - 0.022 ] );
	const head = [ 0, height - 0.15, - r - 0.03 ];
	parts.cylinder( PVC(), 0.04, 0.1, [ head[ 0 ], head[ 1 ] - 0.1, head[ 2 ] ], 10 );
	parts.add( PVC(), new CylinderGeometry( 0.045, 0.05, 0.06, 10 ), _m.makeRotationX( 0.9 ).setPosition( head[ 0 ], head[ 1 ] + 0.01, head[ 2 ] + 0.02 ) );

	// Where the utility's drop will be tied off: an insulator on the side of the pole, with the
	// three service wires from the weatherhead looping down (the drip loop) and up to it.
	const spool = [ 0.15, height - 0.45, 0 ];
	parts.rod( STEEL(), [ r - 0.01, spool[ 1 ], 0 ], [ spool[ 0 ] + 0.03, spool[ 1 ], 0 ], 0.012, 6 );
	parts.cylinder( mat( 0xe9e4d8, { roughness: 0.3 } ), 0.035, 0.08, [ spool[ 0 ] + 0.04, spool[ 1 ] - 0.04, 0 ], 10 );
	for ( const [ i, dx ] of [ - 0.015, 0, 0.015 ].entries() ) {

		parts.path( BLACK(), smooth( [
			[ spool[ 0 ] + 0.05, spool[ 1 ] + 0.02 * i - 0.06, 0.02 + dx ], [ 0.24 + dx, spool[ 1 ] - 0.4, - 0.06 ],
			[ 0.1 + dx, spool[ 1 ] - 0.42, - 0.18 ], [ dx, head[ 1 ] - 0.05, head[ 2 ] - 0.06 ],
		], 16 ), 0.006, 6, false );

	}

	// Ground rod at the foot with its copper wire up to the meter base.
	parts.cylinder( COPPER(), 0.008, 0.12, [ 0.25, 0, - 0.2 ], 8 );
	parts.path( COPPER(), [ [ 0.25, 0.1, - 0.2 ], [ 0.08, 0.15, face - 0.03 ], [ 0.08, 1.55, face - 0.03 ] ], 0.003, 4 );

	// Cords from the outlets down to the ground and off to the front.
	cordFrom( parts, [ - 0.2, 0.76, face - 0.09 ], ORANGE_CORD, [ [ - 0.4, - 1.2 ], [ - 1.2, - 2.6 ] ] );
	cordFrom( parts, [ 0.2, 0.76, face - 0.09 ], YELLOW_CORD, [ [ 0.5, - 1.0 ], [ 1.4, - 1.8 ] ] );

	// A danger sign on the board between the outlets.
	sign( parts, [ 0, 0.8, face - 0.001 ], [ 0.21, 0.14 ] );
	return parts.build();

}

// The usual temporary-service gear on a board whose face is at z = `face`: meter base with its
// round glass meter, a fused disconnect with its handle, a small breaker panel and weatherproof
// GFCI outlets with in-use covers, each at [ x, centre height ].
function equipment( parts, face, { meter, disconnect, panel, outlets } ) {

	const box = ENCLOSURE();
	if ( meter ) {

		const [ x, y ] = meter;
		parts.block( box, [ 0.28, 0.38, 0.11 ], [ x, y, face - 0.055 ] );
		parts.add( box, new CylinderGeometry( 0.095, 0.095, 0.03, 20 ), _m.makeRotationX( Math.PI / 2 ).setPosition( x, y, face - 0.125 ) );
		parts.add( GLASS(), new CylinderGeometry( 0.08, 0.08, 0.1, 20 ), _m.makeRotationX( Math.PI / 2 ).setPosition( x, y, face - 0.19 ) );
		parts.add( mat( 0xf2f2ee, { roughness: 0.5 } ), new CylinderGeometry( 0.06, 0.06, 0.004, 20 ), _m.makeRotationX( Math.PI / 2 ).setPosition( x, y, face - 0.17 ) );
		parts.add( GLASS(), new CylinderGeometry( 0.08, 0.08, 0.001, 20 ), _m.makeRotationX( Math.PI / 2 ).setPosition( x, y, face - 0.2405 ) );

	}

	if ( disconnect ) {

		const [ x, y ] = disconnect;
		parts.block( box, [ 0.22, 0.34, 0.13 ], [ x, y, face - 0.065 ] );
		parts.block( mat( 0x2a2c2f, { roughness: 0.5 } ), [ 0.025, 0.12, 0.03 ], [ x + 0.125, y + 0.02, face - 0.07 ], [ 0, 0, - 0.5 ] );

	}

	if ( panel ) {

		const [ x, y ] = panel;
		parts.block( box, [ 0.26, 0.46, 0.1 ], [ x, y, face - 0.05 ] );
		parts.block( mat( 0x7d8286, { roughness: 0.5, metalness: 0.5 } ), [ 0.2, 0.38, 0.006 ], [ x, y, face - 0.102 ] );

	}

	for ( const [ x, y ] of outlets || [] ) {

		parts.block( box, [ 0.1, 0.15, 0.06 ], [ x, y, face - 0.03 ] );
		parts.block( mat( 0x5c6064, { roughness: 0.5 } ), [ 0.1, 0.14, 0.07 ], [ x, y - 0.005, face - 0.095 ] );

	}

}

// A 2×4 (or any [ thickness, width ] timber) from a to b, its wide face upright.
function brace( parts, material, a, b, [ t, w ] ) {

	const dx = b[ 0 ] - a[ 0 ];
	const dy = b[ 1 ] - a[ 1 ];
	const dz = b[ 2 ] - a[ 2 ];
	const length = Math.hypot( dx, dy, dz );
	const yaw = Math.atan2( dx, dz );
	const pitch = Math.atan2( - dy, Math.hypot( dx, dz ) );
	_m.makeRotationFromEuler( _e.set( pitch, yaw, 0, 'YXZ' ) ).setPosition( ( a[ 0 ] + b[ 0 ] ) / 2, ( a[ 1 ] + b[ 1 ] ) / 2, ( a[ 2 ] + b[ 2 ] ) / 2 );
	parts.add( material, new BoxGeometry( t, w, length ), _m );

}

// A cord from a plug at `from` hanging to the ground, then along it through the points [ x, z ]
// to a plug end.
function cordFrom( parts, from, color, run ) {

	const r = 0.008;
	const cord = CORD( color );
	const [ x, y, z ] = from;
	const points = smooth( [ [ x, y, z ], [ x, y - 0.08, z - 0.05 ], [ x, Math.min( y * 0.3, 0.15 ), z - 0.2 ], [ x, r, z - 0.4 ], ...run.map( ( [ px, pz ] ) => [ px, r, pz ] ) ], 40 );
	parts.path( cord, points, r, 6, false );
	parts.box( cord, [ 0.035, 0.03, 0.05 ], [ x, y - 0.015, z + 0.01 ] );
	const [ ex, , ez ] = points.at( - 1 );
	parts.box( cord, [ 0.04, 0.03, 0.06 ], [ ex, 0, ez ] );

}

// A smooth curve through the points, as `count` points, for cords and cables.
function smooth( points, count ) {

	const curve = new CatmullRomCurve3( points.map( p => new Vector3( ...p ) ), false, 'centripetal' );
	return curve.getPoints( count ).map( p => [ p.x, Math.max( p.y, 0.008 ), p.z ] );

}

// A small sign on a board: a danger notice, front-facing at `centre`.
function sign( parts, centre, [ w, h ] ) {

	const face = drawn( 'temp power danger sign', [ 256, 170 ], ( ctx, cw, ch ) => {

		ctx.fillStyle = '#ffffff';
		ctx.fillRect( 0, 0, cw, ch );
		ctx.fillStyle = '#111111';
		ctx.fillRect( 0, 0, cw, 58 );
		ctx.fillStyle = '#d0202a';
		ctx.beginPath();
		ctx.ellipse( cw / 2, 29, 92, 23, 0, 0, Math.PI * 2 );
		ctx.fill();
		ctx.fillStyle = '#ffffff';
		ctx.font = 'bold 36px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText( 'DANGER', cw / 2, 30 );
		ctx.fillStyle = '#111111';
		ctx.font = 'bold 30px sans-serif';
		ctx.fillText( 'HIGH VOLTAGE', cw / 2, 96, cw - 20 );
		ctx.font = 'bold 22px sans-serif';
		ctx.fillText( 'TEMPORARY POWER', cw / 2, 138, cw - 20 );

	} );
	parts.add( face, new PlaneGeometry( w, h ), _m.makeRotationY( Math.PI ).setPosition( ...centre ) );

}

// --- spider box ------------------------------------------------------------------------------

// A 50 A spider box (temporary power distribution box) on a steel stand to keep it out of the
// wet: a yellow rubber housing about 22 × 13 × 10 in with black bumpers, GFCI duplex outlets and
// twist-lock sockets with flip covers on both long sides, its 50 A input cord running off behind
// and three extension cords plugged in and laid out on the ground.
function spiderBox() {

	const parts = new Parts();
	const housing = mat( 0xf2c318, { roughness: 0.6 } );
	const rubber = RUBBER();
	const steel = mat( 0x3c4045, { roughness: 0.5, metalness: 0.5 } );

	// The stand: a steel cradle on four legs, 16 in up.
	const top = 0.4;
	const [ sx, sz ] = [ 0.24, 0.13 ];
	for ( const x of [ - sx, sx ] ) for ( const z of [ - sz, sz ] ) parts.rod( steel, [ x, top, z ], [ x * 1.25, 0, z * 1.4 ], 0.012, 6 );
	for ( const z of [ - sz, sz ] ) parts.rod( steel, [ - sx, top, z ], [ sx, top, z ], 0.012, 6 );
	for ( const x of [ - sx, sx ] ) parts.rod( steel, [ x, top, - sz ], [ x, top, sz ], 0.012, 6 );

	// The housing, long side to the front, with its bumpers and carry handle.
	const [ w, h, d ] = [ 0.56, 0.25, 0.33 ];
	const y0 = top + 0.012;
	parts.box( housing, [ w, h, d ], [ 0, y0, 0 ] );
	for ( const x of [ - w / 2, w / 2 ] ) parts.box( rubber, [ 0.05, h + 0.03, d + 0.03 ], [ x, y0 - 0.015, 0 ] );
	parts.path( rubber, [ [ - 0.12, y0 + h, 0 ], [ - 0.1, y0 + h + 0.06, 0 ], [ 0.1, y0 + h + 0.06, 0 ], [ 0.12, y0 + h, 0 ] ], 0.015, 6 );

	// Outlets with flip covers along the front and the back, a breaker strip on top.
	const cover = mat( 0x2a2c2f, { roughness: 0.6 } );
	for ( const z of [ - d / 2, d / 2 ] ) for ( const x of [ - 0.17, - 0.06, 0.06, 0.17 ] ) {

		parts.block( cover, [ 0.075, 0.1, 0.02 ], [ x, y0 + h / 2, z + Math.sign( z ) * 0.01 ] );

	}

	parts.box( cover, [ 0.26, 0.012, 0.08 ], [ 0, y0 + h, 0.08 ] );

	// The 50 A input cord, heavy and black, off the back and away.
	parts.path( RUBBER(), smooth( [ [ 0.2, y0 + 0.08, d / 2 + 0.01 ], [ 0.22, y0 + 0.02, d / 2 + 0.1 ], [ 0.25, 0.1, d / 2 + 0.3 ], [ 0.3, 0.017, d / 2 + 0.5 ], [ 0.6, 0.017, 1.3 ], [ 0.4, 0.017, 2.6 ] ], 40 ).map( ( [ px, py, pz ] ) => [ px, Math.max( py, 0.017 ), pz ] ), 0.017, 8, false );

	// Three cords plugged in at the front, out across the ground.
	cordFrom( parts, [ - 0.17, y0 + h / 2 - 0.02, - d / 2 - 0.03 ], ORANGE_CORD, [ [ - 0.6, - 0.9 ], [ - 1.4, - 1.9 ] ] );
	cordFrom( parts, [ - 0.06, y0 + h / 2 - 0.02, - d / 2 - 0.03 ], YELLOW_CORD, [ [ - 0.1, - 1.1 ], [ 0.1, - 2.4 ] ] );
	cordFrom( parts, [ 0.17, y0 + h / 2 - 0.02, - d / 2 - 0.03 ], GREEN_CORD, [ [ 0.7, - 0.8 ], [ 1.6, - 1.3 ] ] );
	return parts.build();

}

// --- cord reel -------------------------------------------------------------------------------

// A steel cord reel on its tubular stand with a crank handle, wound with 100 ft of orange 12/3
// cord, the plug end pulled off the front.
function cordReel() {

	const parts = new Parts();
	const frame = mat( 0xc22a22, { roughness: 0.5, metalness: 0.4 } );
	const axle = 0.42;
	const half = 0.17;

	// Stand: an A-frame each side on a base tube, a top handle across.
	for ( const s of [ - 1, 1 ] ) {

		const x = s * ( half + 0.03 );
		parts.path( frame, [ [ x, 0.015, - 0.22 ], [ x, axle, 0 ], [ x, 0.015, 0.22 ] ], 0.014, 8 );
		parts.rod( frame, [ x, 0.015, - 0.26 ], [ x, 0.015, 0.26 ], 0.015, 8 );
		parts.path( frame, [ [ x, axle, 0 ], [ x, axle + 0.28, 0.06 ] ], 0.014, 8, false );

	}

	parts.rod( frame, [ - half - 0.03, axle + 0.28, 0.06 ], [ half + 0.03, axle + 0.28, 0.06 ], 0.014, 8 );
	parts.rod( frame, [ - half - 0.03, 0.12, 0.13 ], [ half + 0.03, 0.12, 0.13 ], 0.012, 8 );

	// The drum: two flanges, the cord wound between, the axle and crank.
	const flange = mat( 0x2a2c2f, { roughness: 0.5, metalness: 0.4 } );
	for ( const s of [ - 1, 1 ] ) parts.add( flange, new CylinderGeometry( 0.19, 0.19, 0.012, 24 ), _m.makeRotationZ( Math.PI / 2 ).setPosition( s * half, axle, 0 ) );
	parts.add( CORD( ORANGE_CORD ), new CylinderGeometry( 0.15, 0.15, 2 * half - 0.012, 24 ), _m.makeRotationZ( Math.PI / 2 ).setPosition( 0, axle, 0 ) );
	for ( let i = 1; i < 8; i ++ ) parts.add( CORD( 0xd85a12 ), new TorusGeometry( 0.15, 0.006, 4, 24 ), _m.makeRotationY( Math.PI / 2 ).setPosition( - half + i * ( 2 * half / 8 ), axle, 0 ) );
	parts.rod( STEEL(), [ - half - 0.06, axle, 0 ], [ half + 0.06, axle, 0 ], 0.012, 8 );
	parts.rod( flange, [ half + 0.06, axle, 0 ], [ half + 0.06, axle - 0.12, 0 ], 0.01, 6 );
	parts.rod( BLACK(), [ half + 0.06, axle - 0.12, 0 ], [ half + 0.14, axle - 0.12, 0 ], 0.014, 6 );

	// The cord off the bottom of the drum to the front and along the ground.
	cordFrom( parts, [ 0.02, axle - 0.15, - 0.04 ], ORANGE_CORD, [ [ 0.1, - 0.8 ], [ - 0.2, - 1.5 ] ] );
	return parts.build();

}

// --- cord run and light string -----------------------------------------------------------------

// A cord stand: a steel post on a round rubber base with a hook at the top, `height` high.
function stand( parts, height ) {

	parts.cylinder( RUBBER(), 0.26, 0.06, [ 0, 0, 0 ], 18, 0.22 );
	parts.cylinder( STEEL(), 0.04, 0.05, [ 0, 0.06, 0 ], 10 );
	parts.cylinder( mat( 0xf2c318, { roughness: 0.5, metalness: 0.3 } ), 0.022, height - 0.08, [ 0, 0.08, 0 ], 10 );
	parts.path( mat( 0x2a2c2f, { roughness: 0.6 } ), [ [ 0, height - 0.02, 0 ], [ 0, height + 0.06, - 0.04 ], [ 0, height + 0.04, - 0.07 ] ], 0.01, 6 );

}

// Points along a cord carried over a stand at x = 0 (at `top`) and sagging `sag` to the middle of
// the span each side, at x = ±length / 2, where the next stand's cord carries on level.
function sagging( length, top, sag, z, steps = 16 ) {

	const points = [];
	for ( let i = 0; i <= steps; i ++ ) {

		const x = - length / 2 + ( i / steps ) * length;
		const u = Math.abs( x ) / ( length / 2 );
		points.push( [ x, top - sag * ( 2 * u - u * u ), z ] );

	}

	return points;

}

// One 25 ft span of a 10/3 extension cord hung on stands 7 ft high to keep it off the ground and
// out of the wet: the stand in the middle, the cord sagging to the next stand each side.
function cordRun() {

	const parts = new Parts();
	const length = 25 * FT;
	const top = 7 * FT;
	stand( parts, top );
	parts.path( CORD( ORANGE_CORD ), sagging( length, top + 0.06, 0.35, - 0.05 ), 0.009, 6, false );
	return parts.build();

}

// One 25 ft span of a temporary lighting string (LED cage lamps every 6 ft 3 in, so they stay
// evenly spaced span to span) hung on 8 ft light stands.
function lightString() {

	const parts = new Parts();
	const length = 25 * FT;
	const top = 8 * FT;
	const sag = 0.3;
	stand( parts, top );
	const cable = sagging( length, top + 0.06, sag, - 0.05 );
	parts.path( CORD( 0xf2c318 ), cable, 0.008, 6, false );

	// Lamps hanging from the cable: a socket, the bulb and its yellow guard.
	const bulb = mat( 0xfff6d8, { roughness: 0.3, emissive: 0xffe2a0, emissiveIntensity: 1.2 } );
	const guard = mat( 0xf2b200, { roughness: 0.5 } );
	const pitch = length / 4;
	for ( let i = 0; i < 4; i ++ ) {

		const x = - length / 2 + pitch * ( i + 0.5 );
		const u = Math.abs( x ) / ( length / 2 );
		const y = top + 0.06 - sag * ( 2 * u - u * u );
		parts.cylinder( BLACK(), 0.018, 0.07, [ x, y - 0.075, - 0.05 ], 8 );
		parts.sphere( bulb, 0.045, [ x, y - 0.12, - 0.05 ], [ 10, 8 ] );
		for ( const a of [ 0, Math.PI / 2 ] ) parts.add( guard, new TorusGeometry( 0.05, 0.004, 4, 14 ), _m.makeRotationY( a ).setPosition( x, y - 0.125, - 0.05 ) );
		parts.add( guard, new TorusGeometry( 0.05, 0.004, 4, 14 ), _m.makeRotationX( Math.PI / 2 ).setPosition( x, y - 0.125, - 0.05 ) );

	}

	return parts.build();

}

// --- panel on a plywood stand ----------------------------------------------------------------

// A 4 × 4 ft sheet of plywood on two 4×4 posts 6 ft high, standing on 4×4 skids with 2×4 kickers,
// carrying a 100 A breaker panel, a fused disconnect and a row of weatherproof GFCI outlets; the
// feeder cord comes in at the bottom from behind.
function panelStand() {

	const parts = new Parts();
	const post = 3.5 * IN;
	const width = 4 * FT;
	const x = width / 2 - post / 2;
	for ( const s of [ - 1, 1 ] ) {

		parts.box( LUMBER(), [ post, 6 * FT, post ], [ s * x, post, 0 ] );
		parts.box( LUMBER(), [ post, post, 1.4 ], [ s * x, 0, 0.1 ] );
		brace( parts, LUMBER(), [ s * ( x - post / 2 - 0.02 ), 1.0, post / 2 ], [ s * ( x - post / 2 - 0.02 ), post, 0.75 ], [ 1.5 * IN, 3.5 * IN ] );
		brace( parts, LUMBER(), [ s * ( x - post / 2 - 0.02 ), 0.55, - post / 2 ], [ s * ( x - post / 2 - 0.02 ), post, - 0.5 ], [ 1.5 * IN, 3.5 * IN ] );

	}

	const face = - post / 2 - 0.019;
	parts.box( PLYWOOD(), [ width, 4 * FT, 0.019 ], [ 0, 6 * FT + post - 4 * FT, face + 0.0095 ] );
	const bottom = 6 * FT + post - 4 * FT;
	equipment( parts, face, { disconnect: [ - 0.33, bottom + 0.85 ], panel: [ 0.05, bottom + 0.8 ], outlets: [ [ - 0.3, bottom + 0.3 ], [ - 0.1, bottom + 0.3 ], [ 0.1, bottom + 0.3 ], [ 0.3, bottom + 0.3 ] ] } );
	sign( parts, [ 0.4, bottom + 1.02, face - 0.001 ], [ 0.24, 0.16 ] );

	// Conduit from the disconnect over to the panel, the feeder cord down from under the disconnect
	// and away behind, and a cord plugged in.
	parts.path( PVC(), [ [ - 0.22, bottom + 0.9, face - 0.05 ], [ - 0.08, bottom + 0.9, face - 0.05 ] ], 0.016, 8 );
	parts.path( RUBBER(), smooth( [ [ - 0.33, bottom + 0.68, face - 0.06 ], [ - 0.33, bottom + 0.4, face - 0.09 ], [ - 0.5, bottom + 0.05, face - 0.1 ], [ - 0.52, 0.1, face - 0.1 ], [ - 0.5, 0.017, 0.4 ], [ - 0.3, 0.017, 1.8 ] ], 40 ).map( ( [ px, py, pz ] ) => [ px, Math.max( py, 0.017 ), pz ] ), 0.017, 8, false );
	cordFrom( parts, [ 0.1, bottom + 0.24, face - 0.09 ], ORANGE_CORD, [ [ 0.4, - 1.0 ], [ 1.1, - 1.8 ] ] );
	return parts.build();

}
