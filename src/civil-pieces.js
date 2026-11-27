import { BackSide, BoxGeometry, CircleGeometry, CylinderGeometry, DoubleSide, ExtrudeGeometry, LatheGeometry, MathUtils, Matrix4, Path, PlaneGeometry, RingGeometry, Shape, Vector2 } from 'three';
import { drawn, FT, IN, mat, Parts } from './parts.js';
import { chainLink } from './fence-panel.js';

// Civil and utility precast, pipe, site setup, traffic and survey pieces, built in code at the
// sizes of the common North American products (no brands): box culvert, catch basin and manhole
// sections, a concrete pipe, headwall and curb, pipe stacks and a fused pipe string on rollers,
// the things at a site entrance, a portable signal, a covered walkway and survey instruments.
// Like the other built-in pieces each stands on y = 0 with its front facing -Z (+X is its right).

const DEG = MathUtils.DEG2RAD;
const _m = new Matrix4();
const _r = new Matrix4();

export const CIVIL_ITEMS = [
	// Precast concrete. The pieces laid in lines have a rowLength (rows.js): their laying length,
	// so a row nests each tongue or spigot into the next one's groove or bell.
	{ id: 'box-culvert-6x4', name: 'Precast box culvert section (6 × 4 ft inside, 8 ft long, ~5.4 t)', category: 'Utilities',
		keywords: 'box culvert precast concrete culvert section barrel storm drain crossing c1577 tongue groove', build: boxCulvert, rowLength: 8 * FT },
	{ id: 'catch-basin-2x3', name: 'Precast catch basin (2 × 3 ft inside, 4 ft deep) with frame and grate', category: 'Utilities',
		keywords: 'catch basin cb precast storm drain inlet grate frame sump drainage structure', build: catchBasin },
	{ id: 'manhole-precast-48', name: 'Precast manhole, assembled (48 in: base, riser, eccentric cone, grade rings, frame and cover, 3.4 m)', category: 'Utilities',
		keywords: 'manhole precast mh sanitary storm sewer riser cone eccentric frame cover lid barrel base structure', build: manhole },
	{ id: 'rcp-pipe-36in', name: 'Concrete pipe, RCP bell and spigot (36 in × 8 ft, ~2.9 t)', category: 'Utilities',
		keywords: 'rcp reinforced concrete pipe culvert storm sewer bell spigot 36 inch joint', build: rcpPipe, rowLength: 8 * FT },
	{ id: 'culvert-headwall-36in', name: 'Precast culvert headwall with wingwalls and apron (for 36 in pipe, 8 ft wide)', category: 'Utilities',
		keywords: 'headwall end wall endwall culvert outlet inlet wingwall wing wall apron precast pipe end section', build: headwall },
	{ id: 'curb-gutter-10ft', name: 'Precast curb and gutter (10 ft, 30 in wide, 6 in curb)', category: 'Materials',
		keywords: 'curb gutter kerb precast concrete barrier curb roadway edge', build: curbAndGutter, rowLength: 10 * FT },
	// Pipe.
	{ id: 'hdpe-pipe-stack-24in', name: 'Corrugated HDPE pipe stack (5 × 24 in × 20 ft, on dunnage)', category: 'Materials',
		keywords: 'hdpe pipe corrugated plastic culvert storm pipe stack n-12 dual wall ads black', build: hdpeStack },
	{ id: 'pvc-pipe-bundle-8in', name: 'PVC pipe bundle, C900 (20 × 8 in × 20 ft, banded)', category: 'Materials',
		keywords: 'pvc pipe c900 water main bundle blue banded unit lift bell gasket', build: pvcBundle },
	{ id: 'hdpe-string-16in', name: 'Fused HDPE pipe string on rollers (16 in, 40 ft section)', category: 'Utilities',
		keywords: 'hdpe pipe string fused butt fusion polyethylene pipeline rollers pull back hdd black poly', build: hdpeString, rowLength: 40 * FT },
	{ id: 'pipe-roller-stand', name: 'Pipe roller stand, V-roller (for 4–24 in pipe)', category: 'Utilities',
		keywords: 'pipe roller stand rollers v roller pipe stand hdpe fusion pullback support', build: rollerStandItem },
	// Site setup.
	{ id: 'site-sign-8x4', name: 'Project sign board (8 × 4 ft on posts)', category: 'Site services',
		keywords: 'project sign site sign board billboard contractor sign construction sign entrance', build: siteSign },
	{ id: 'safety-station', name: 'Safety station (first aid cabinet, eyewash, fire extinguisher on stand)', category: 'Site services',
		keywords: 'safety station first aid kit eyewash eye wash fire extinguisher emergency board', build: safetyStation },
	{ id: 'muster-point-sign', name: 'Muster point sign on post (24 × 30 in)', category: 'Site services',
		keywords: 'muster point assembly point sign emergency evacuation meeting point', build: musterSign },
	{ id: 'fence-gate-20ft', name: 'Temporary fence gate, double swing (20 ft wide, 6 ft high)', category: 'Barriers & fencing',
		keywords: 'gate fence gate double swing gate entrance site gate chain link temporary', build: fenceGate, rowLength: 20 * FT },
	{ id: 'rumble-grid-12x20', name: 'Rumble grid / track-out grid (12 × 20 ft, steel)', category: 'Site services',
		keywords: 'rumble grid track out trackout shaker grate cattle guard mud wash down exit stabilized entrance fods', build: rumbleGrid },
	{ id: 'cable-protector-5ch', name: 'Cable protector ramp, 5-channel (3 ft section, 20 in wide)', category: 'Access & scaffolding',
		keywords: 'cable protector cable ramp cord cover yellow jacket guard drop over ramp', build: cableProtector, rowLength: 3 * FT },
	{ id: 'hose-bridge-2ch', name: 'Hose bridge, 2-channel for 3 in hose (3 ft, 5 in high)', category: 'Access & scaffolding',
		keywords: 'hose bridge hose ramp hose protector fire hose water hose crossing', build: hoseBridge, rowLength: 3 * FT },
	{ id: 'pallet-racking-8ft', name: 'Pallet racking, 1 bay (8 ft beams, 42 in deep, 12 ft high, 3 levels, 3 loaded pallets)', category: 'Site services',
		keywords: 'pallet racking rack shelving storage warehouse beam upright selective', build: palletRacking },
	{ id: 'wheelie-bin-95', name: 'Garbage cart / wheelie bin (95 gal)', category: 'Waste',
		keywords: 'wheelie bin garbage can trash cart toter rollout cart refuse bin', build: () => wheelieBin( 0x2e3236, null ) },
	{ id: 'recycling-bin-95', name: 'Recycling cart / wheelie bin, blue (95 gal)', category: 'Waste',
		keywords: 'recycling bin blue box cart wheelie bin toter recycle cans bottles', build: () => wheelieBin( 0x1f5aa6, 'recycle' ) },
	{ id: 'fuel-cube-2000l', name: 'Fuel cube, double-walled (2,000 L / 528 gal, TransCube type)', category: 'Power & air',
		keywords: 'fuel cube transcube diesel tank double wall bunded skid fuel tank', build: fuelCube },
	// Traffic.
	{ id: 'traffic-signal-trailer', name: 'Portable traffic signal trailer (solar, mast arm, 2 signal heads)', category: 'Traffic control',
		keywords: 'portable traffic signal light trailer temporary stop light lane closure alternating flagger solar', build: signalTrailer },
	{ id: 'speed-bump-rubber', name: 'Speed bump, rubber (6 ft section, 12 in deep, 2¼ in high)', category: 'Traffic control',
		keywords: 'speed bump speed hump rubber traffic calming parking lot modular', build: speedBump, rowLength: 6 * FT },
	{ id: 'covered-walkway-20ft', name: 'Covered pedestrian walkway / sidewalk shed (20 ft section, 6 ft clear)', category: 'Access & scaffolding',
		keywords: 'covered walkway sidewalk shed pedestrian tunnel overhead protection hoarding scaffold canopy', build: coveredWalkway, rowLength: 20 * FT },
	// Survey.
	{ id: 'total-station-tripod', name: 'Total station on tripod (1.75 m)', category: 'Site services',
		keywords: 'total station survey surveyor instrument tripod layout robotic transit theodolite', build: totalStation },
	{ id: 'prism-pole-bipod', name: 'Prism pole on bipod (2 m, survey rod)', category: 'Site services',
		keywords: 'prism pole survey rod rover bipod surveyor layout stakeout', build: prismPole },
	{ id: 'rotating-laser-tripod', name: 'Rotating laser level on tripod', category: 'Site services',
		keywords: 'laser level rotating laser grade laser tripod survey elevation', build: rotatingLaser },
];

// --- shared materials and helpers ------------------------------------------------------------

const CONCRETE = () => mat( 0xb4b1a9, { roughness: 0.95 } );
const IRON = () => mat( 0x2a2b2c, { roughness: 0.75, metalness: 0.5 } );
const DARK = () => mat( 0x141516, { roughness: 1 } );
const STEEL = () => mat( 0x8a8f94, { roughness: 0.5, metalness: 0.6 } );
const GALV = () => mat( 0xa9adb0, { roughness: 0.45, metalness: 0.65 } );
const RUBBER = () => mat( 0x161718, { roughness: 0.9 } );
const TIMBER = () => mat( 0x9c7a50, { roughness: 0.95 } );
const paint = color => mat( color, { roughness: 0.5, metalness: 0.2 } );
const plastic = color => mat( color, { roughness: 0.6 } );

// A plane of [ w, h ] standing at `centre`, its face to the front (-Z) unless turned.
function face( parts, material, [ w, h ], centre, turn = Math.PI ) {

	parts.add( material, new PlaneGeometry( w, h ), _m.makeRotationY( turn ).setPosition( ...centre ) );

}

// A cross-section in x-y (an outline with any holes, each [ x, y ] points or a Path) extruded
// along z from z0 to z0 + depth.
function extrudeZ( outline, holes, depth, z0 = 0, curveSegments = 24 ) {

	const shape = new Shape( outline.map( ( [ x, y ] ) => new Vector2( x, y ) ) );
	for ( const hole of holes ) shape.holes.push( hole instanceof Path ? hole : new Path( hole.map( ( [ x, y ] ) => new Vector2( x, y ) ) ) );
	const geometry = new ExtrudeGeometry( shape, { depth, bevelEnabled: false, curveSegments } );
	geometry.translate( 0, 0, z0 );
	return geometry;

}

function circle( x, y, r ) {

	const path = new Path();
	path.absarc( x, y, r, 0, Math.PI * 2, true );
	return path;

}

// A turned shape (pipe, bell, ring) from a closed profile of [ radius, along ] points, each
// straight stretch its own band so the edges stay sharp. Its axis is y unless `matrix` moves it.
function turned( parts, material, profile, matrix, segments = 32 ) {

	for ( let i = 1; i < profile.length; i ++ ) {

		const [ a, b ] = [ profile[ i - 1 ], profile[ i ] ];
		if ( a[ 0 ] === b[ 0 ] && a[ 1 ] === b[ 1 ] ) continue;
		const geometry = new LatheGeometry( [ new Vector2( a[ 0 ], a[ 1 ] ), new Vector2( b[ 0 ], b[ 1 ] ) ], segments );
		parts.add( material, geometry, matrix );

	}

}

// A box narrowing from [ bx, bz ] at its base to [ tx, tz ] at its top, `height` tall, standing
// at [ x, y, z ]; the top can lean back by `lean` along z.
function taperedBox( [ bx, bz ], [ tx, tz ], height, [ x, y, z ], lean = 0 ) {

	const geometry = new BoxGeometry( 1, 1, 1 );
	const p = geometry.attributes.position;
	for ( let i = 0; i < p.count; i ++ ) {

		const top = p.getY( i ) > 0;
		p.setXYZ( i, p.getX( i ) * ( top ? tx : bx ) + x, ( p.getY( i ) + 0.5 ) * height + y, p.getZ( i ) * ( top ? tz : bz ) + z + ( top ? lean : 0 ) );

	}

	geometry.computeVertexNormals();
	return geometry;

}

// A wheel with its axle across x, centred at [ x, r, z ].
function wheel( parts, [ x, z ], r, width, hub = 0.55 ) {

	parts.rod( RUBBER(), [ x - width / 2, r, z ], [ x + width / 2, r, z ], r, 18 );
	const side = Math.sign( x ) || 1;
	parts.rod( GALV(), [ x + side * width / 2, r, z ], [ x + side * ( width / 2 + 0.01 ), r, z ], r * hub, 14 );

}

// --- precast concrete ------------------------------------------------------------------------

// A 6 x 4 ft box culvert to ASTM C1577: 7 in walls and floor, a 7.5 in top slab, 7 in haunches in
// the corners, 8 ft laying length. The tongue at the back (+Z) is the inner half of the wall,
// 2 in long; the groove at the front takes the tongue of the one ahead in a row.
function boxCulvert() {

	const parts = new Parts();
	const concrete = CONCRETE();
	const span = 6 * FT;
	const rise = 4 * FT;
	const wall = 7 * IN;
	const top = 7.5 * IN;
	const haunch = 7 * IN;
	const length = 8 * FT;
	const joint = 2 * IN;
	const w = span / 2 + wall;
	const h = rise + wall + top;

	// The opening, haunched in its four corners, and the outline grown or shrunk by half the wall
	// for the groove and tongue.
	const opening = ( grow = 0 ) => [
		[ - span / 2 - grow, wall + haunch ], [ - span / 2 + haunch, wall - grow ], [ span / 2 - haunch, wall - grow ], [ span / 2 + grow, wall + haunch ],
		[ span / 2 + grow, wall + rise - haunch ], [ span / 2 - haunch, wall + rise + grow ], [ - span / 2 + haunch, wall + rise + grow ], [ - span / 2 - grow, wall + rise - haunch ],
	];
	const outline = ( shrink = 0 ) => [ [ - w + shrink, shrink ], [ w - shrink, shrink ], [ w - shrink, h - shrink ], [ - w + shrink, h - shrink ] ];
	parts.add( concrete, extrudeZ( outline(), [ opening( wall / 2 ) ], joint, - length / 2, 4 ) );
	parts.add( concrete, extrudeZ( outline(), [ opening() ], length - joint, - length / 2 + joint, 4 ) );
	parts.add( concrete, extrudeZ( outline( wall / 2 ), [ opening() ], joint, length / 2, 4 ) );

	// Lifting holes in the top, and the stencilled size on the side.
	for ( const z of [ - length / 4, length / 4 ] ) parts.cylinder( DARK(), 1.5 * IN, 0.003, [ 0, h, z ], 10 );
	face( parts, culvertStencil(), [ 1.1, 0.28 ], [ w + 0.003, h * 0.62, 0 ], Math.PI / 2 );

	return parts.build();

}

function culvertStencil() {

	return drawn( 'box culvert stencil', [ 512, 128 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#3b3d40';
		ctx.font = 'bold 54px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText( '6 x 4  C1577', w / 2, h * 0.32 );
		ctx.font = 'bold 38px sans-serif';
		ctx.fillText( 'TOP  ▲', w / 2, h * 0.78 );

	}, { roughness: 0.95 } );

}

// A 24 x 36 in precast catch basin with 6 in walls, 4 ft deep, as it's delivered: a cast iron
// frame and bar grate on top, and knockouts for the pipes in each wall.
function catchBasin() {

	const parts = new Parts();
	const concrete = CONCRETE();
	const iron = IRON();
	const inside = [ 24 * IN, 36 * IN ];
	const wall = 6 * IN;
	const depth = 4 * FT;
	const outside = [ inside[ 0 ] + 2 * wall, inside[ 1 ] + 2 * wall ];

	parts.box( concrete, [ outside[ 0 ], depth, outside[ 1 ] ] );

	// Knockouts: thinned rounds the pipes break through, 15 in in the ends and 12 in in the sides.
	const knock = mat( 0xc3c0b7, { roughness: 0.95 } );
	const ky = 16 * IN;
	for ( const s of [ - 1, 1 ] ) {

		parts.rod( knock, [ 0, ky, s * outside[ 1 ] / 2 ], [ 0, ky, s * ( outside[ 1 ] / 2 + 0.008 ) ], 7.5 * IN, 20 );
		parts.rod( knock, [ s * outside[ 0 ] / 2, ky - 1 * IN, 0 ], [ s * ( outside[ 0 ] / 2 + 0.008 ), ky - 1 * IN, 0 ], 6 * IN, 20 );

	}

	// The frame, its flange on the top slab, the dark of the sump below and the bars over it.
	const frame = [ inside[ 0 ] + 6 * IN, inside[ 1 ] + 6 * IN ];
	const rim = 2.5 * IN;
	const fy = depth;
	for ( const s of [ - 1, 1 ] ) {

		parts.box( iron, [ frame[ 0 ], rim, 3 * IN ], [ 0, fy, s * ( frame[ 1 ] / 2 - 1.5 * IN ) ] );
		parts.box( iron, [ 3 * IN, rim, frame[ 1 ] - 6 * IN ], [ s * ( frame[ 0 ] / 2 - 1.5 * IN ), fy, 0 ] );

	}

	parts.box( DARK(), [ frame[ 0 ] - 6 * IN, 0.01, frame[ 1 ] - 6 * IN ], [ 0, fy, 0 ] );
	const bars = 9;
	const grate = frame[ 0 ] - 6 * IN;
	for ( let i = 0; i < bars; i ++ ) {

		const x = - grate / 2 + ( i + 0.5 ) * grate / bars;
		parts.box( iron, [ 1 * IN, rim - 0.4 * IN, frame[ 1 ] - 6 * IN ], [ x, fy + 0.01, 0 ] );

	}

	for ( const z of [ - 1, 0, 1 ] ) parts.box( iron, [ grate, rim - 0.6 * IN, 1 * IN ], [ 0, fy + 0.01, z * ( frame[ 1 ] - 6 * IN ) / 3 ] );

	return parts.build();

}

// A 48 in manhole assembled from precast sections (ASTM C478): a 4 ft base with its floor and
// two pipe openings in rubber boots, a 2 ft riser, a 4 ft eccentric cone to the 24 in opening
// (its straight side at the back, where the steps go), two 3 in grade rings, and the cast iron
// frame and cover.
function manhole() {

	const parts = new Parts();
	const concrete = CONCRETE();
	const joint = mat( 0x6d6a64, { roughness: 1 } );
	const outer = 24 * IN + 5 * IN;
	const base = 4 * FT;
	const riser = 2 * FT;
	const cone = 4 * FT;
	const neck = 12 * IN + 5 * IN;

	parts.cylinder( concrete, outer, base, [ 0, 0, 0 ], 32 );
	parts.cylinder( concrete, outer, riser, [ 0, base, 0 ], 32 );

	// The eccentric cone: a frustum whose top is pushed back so its back side stands straight.
	const coneGeometry = new CylinderGeometry( neck, outer, cone, 32 );
	const p = coneGeometry.attributes.position;
	for ( let i = 0; i < p.count; i ++ ) p.setZ( i, p.getZ( i ) + ( p.getY( i ) / cone + 0.5 ) * ( outer - neck ) );
	coneGeometry.computeVertexNormals();
	parts.add( concrete, coneGeometry, _m.makeTranslation( 0, base + riser + cone / 2, 0 ) );
	const axis = outer - neck;

	// Mortar at the joints.
	for ( const y of [ base, base + riser ] ) parts.cylinder( joint, outer + 0.3 * IN, 0.75 * IN, [ 0, y - 0.375 * IN, 0 ], 32 );

	// Pipe openings in the base: a rubber boot round each pipe stub.
	for ( const [ dx, dz, r ] of [ [ 0, - 1, 9 * IN ], [ 1, 0, 7.5 * IN ] ] ) {

		const at = [ dx * outer, 14 * IN, dz * outer ];
		const out = [ dx * ( outer + 0.02 ), 14 * IN, dz * ( outer + 0.02 ) ];
		parts.rod( RUBBER(), at, out, r + 1.5 * IN, 24 );
		parts.rod( DARK(), out, [ out[ 0 ] + dx * 0.002, out[ 1 ], out[ 2 ] + dz * 0.002 ], r - 1 * IN, 24 );

	}

	// Grade rings, the frame's flange and body, and the cover.
	let y = base + riser + cone;
	for ( let i = 0; i < 2; i ++ ) {

		parts.cylinder( i ? concrete : mat( 0xa29f97, { roughness: 0.95 } ), 18 * IN, 3 * IN, [ 0, y, axis ], 28 );
		y += 3 * IN;

	}

	const iron = IRON();
	parts.cylinder( iron, 17 * IN, 1.5 * IN, [ 0, y, axis ], 28 );
	parts.cylinder( iron, 14 * IN, 5.5 * IN, [ 0, y, axis ], 28, 13.5 * IN );
	y += 5.5 * IN;
	parts.add( coverFace(), new CircleGeometry( 11.9 * IN, 28 ), _m.makeRotationX( - Math.PI / 2 ).setPosition( 0, y + 0.002, axis ) );

	return parts.build();

}

function coverFace() {

	return drawn( 'manhole cover', [ 256, 256 ], ( ctx, w ) => {

		ctx.fillStyle = '#2d2e2f';
		ctx.fillRect( 0, 0, w, w );
		ctx.strokeStyle = '#46484a';
		ctx.lineWidth = 6;
		for ( let i = 1; i < 12; i ++ ) {

			ctx.beginPath();
			ctx.moveTo( i * w / 12, 0 );
			ctx.lineTo( i * w / 12, w );
			ctx.moveTo( 0, i * w / 12 );
			ctx.lineTo( w, i * w / 12 );
			ctx.stroke();

		}

		ctx.fillStyle = '#2d2e2f';
		ctx.fillRect( w * 0.2, w * 0.4, w * 0.6, w * 0.2 );
		ctx.fillStyle = '#5a5c5e';
		ctx.font = 'bold 40px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText( 'SEWER', w / 2, w / 2 + 2 );
		ctx.strokeStyle = '#3c3e40';
		ctx.lineWidth = 10;
		ctx.beginPath();
		ctx.arc( w / 2, w / 2, w / 2 - 6, 0, Math.PI * 2 );
		ctx.stroke();

	}, { roughness: 0.6, metalness: 0.5 } );

}

// One 8 ft length of 36 in reinforced concrete pipe (ASTM C76, B wall: 4 in thick, 44 in
// outside), lying on its bell. The spigot at the front goes 3.5 in into the bell of the next.
const RCP = { inside: 18 * IN, outside: 22 * IN, spigot: 20.6 * IN, bell: 26 * IN, socket: 22.4 * IN, insert: 3.5 * IN, length: 8 * FT };

function rcpPipe() {

	const parts = new Parts();
	const { inside, outside, spigot, bell, socket, insert, length } = RCP;
	const end = insert + length;
	const profile = [
		[ spigot, 0 ], [ spigot, insert ], [ outside, insert + 0.5 * IN ], [ outside, end - 4 * IN ], [ bell, end - 2.5 * IN ], [ bell, end ],
		[ socket, end ], [ socket, end - insert ], [ inside, end - insert - 1 * IN ], [ inside, 0 ], [ spigot, 0 ],
	];

	// The axis turned from up to along z, the spigot at the front, the laying length centred.
	_r.makeRotationX( Math.PI / 2 ).setPosition( 0, bell, - insert - length / 2 );
	turned( parts, CONCRETE(), profile, _r, 36 );
	return parts.build();

}

// A precast end wall for a 36 in pipe: an 8 ft wide, 10 in wall with the pipe's opening, two
// wingwalls running forward and stepping down, and an apron slab between them for the outfall.
function headwall() {

	const parts = new Parts();
	const concrete = CONCRETE();
	const width = 8 * FT;
	const height = 5.5 * FT;
	const thick = 10 * IN;
	const apron = 8 * IN;
	const wing = 4 * FT;
	const wingThick = 8 * IN;

	// The wall, its front face at z = 0, with the pipe's opening at the apron's level.
	const hole = circle( 0, apron + RCP.outside + 0.25 * IN, RCP.outside + 0.25 * IN );
	parts.add( concrete, extrudeZ( [ [ - width / 2, 0 ], [ width / 2, 0 ], [ width / 2, height ], [ - width / 2, height ] ], [ hole ], thick, 0, 36 ) );

	// Wingwalls, from the full height at the wall down to 2 ft at their front ends.
	const low = 2 * FT;
	for ( const s of [ - 1, 1 ] ) {

		parts.prism( concrete, [ [ - wing, 0 ], [ 0, 0 ], [ 0, height ], [ - 0.8 * FT, height ], [ - wing, low ] ], wingThick, s * ( width / 2 - wingThick / 2 ) );

	}

	// The apron between them, and a darker invert where the water runs.
	parts.box( concrete, [ width - 2 * wingThick, apron, wing ], [ 0, 0, - wing / 2 ] );
	parts.box( mat( 0x8f8b82, { roughness: 1 } ), [ 2 * RCP.inside, 0.004, wing ], [ 0, apron, - wing / 2 ] );
	return parts.build();

}

// A 10 ft precast curb and gutter: a 24 in gutter pan, 7 in thick at its lip, falling to the
// curb's 6 in face, and the 6 in curb top behind.
function curbAndGutter() {

	const parts = new Parts();
	const length = 10 * FT - 0.25 * IN;
	const profile = [
		[ - 15 * IN, 0 ], [ 15 * IN, 0 ], [ 15 * IN, 13 * IN ], [ 9.5 * IN, 13 * IN ], [ 9 * IN, 12.5 * IN ], [ 8.5 * IN, 6.5 * IN ],
		[ 8 * IN, 5.5 * IN ], [ - 15 * IN, 7 * IN ],
	];
	parts.prism( CONCRETE(), profile, length );
	return parts.build();

}

// --- pipe ------------------------------------------------------------------------------------

// Corrugated HDPE drainage pipe, 24 in (28 in outside, a smooth liner inside, a bell at one
// end), 20 ft lengths: three on two timber dunnage with two nested on top, bells alternating.
function hdpeStack() {

	const parts = new Parts();
	const r = 14 * IN;
	const bellR = 15.5 * IN;
	const length = 20 * FT;
	const sill = 4 * IN;
	const pitch = 2 * bellR;
	const base = sill + r;
	const lift = Math.sqrt( ( 2 * r ) ** 2 - ( pitch / 2 ) ** 2 );

	for ( const z of [ - length / 4, length / 4 ] ) parts.box( TIMBER(), [ 3 * pitch + 0.3, sill, 4 * IN ], [ 0, 0, z ] );
	const pipes = [ [ - pitch, base ], [ 0, base ], [ pitch, base ], [ - pitch / 2, base + lift ], [ pitch / 2, base + lift ] ];
	pipes.forEach( ( [ x, y ], i ) => corrugatedPipe( parts, [ x, y ], r, bellR, length, i % 2 ? - 1 : 1 ) );

	// Wedges on the dunnage chocking the outside pipes, their thin ends under them.
	for ( const s of [ - 1, 1 ] ) for ( const z of [ - length / 4, length / 4 ] ) {

		const wedge = [ [ - 2 * IN, sill ], [ 2 * IN, sill ], [ 2 * IN, sill + 3 * IN ] ];
		parts.prism( TIMBER(), wedge, 3 * IN ).rotateY( s * Math.PI / 2 ).translate( s * ( pitch + 0.75 * r ), 0, z );

	}

	return parts.build();

}

function corrugatedPipe( parts, [ x, y ], r, bellR, length, bellEnd ) {

	const shell = corrugation();
	const black = plastic( 0x1d1e1f );
	const liner = mat( 0x232425, { roughness: 0.7, side: BackSide } );
	const bell = 12 * IN;
	const a = - length / 2;
	const b = length / 2;
	const [ za, zb ] = bellEnd > 0 ? [ a, b - bell ] : [ a + bell, b ];
	parts.rod( shell, [ x, y, za ], [ x, y, zb ], r, 24, true );
	parts.rod( liner, [ x, y, a ], [ x, y, b ], r - 2 * IN, 24, true );

	// The bell, and the rings at each end between the liner and the outside.
	const bz = bellEnd > 0 ? zb : za;
	const ez = bellEnd > 0 ? b : a;
	parts.rod( black, [ x, y, bz ], [ x, y, ez ], bellR, 24, true );
	parts.rod( mat( 0x1d1e1f, { roughness: 0.6, side: BackSide } ), [ x, y, bz ], [ x, y, ez ], bellR - 0.4 * IN, 24, true );
	const plainEnd = bellEnd > 0 ? a : b;
	ringAt( parts, black, [ x, y, plainEnd ], r - 2 * IN, r, - Math.sign( bellEnd ) );
	ringAt( parts, black, [ x, y, ez ], r - 2 * IN, bellR, Math.sign( bellEnd ) );
	ringAt( parts, black, [ x, y, bz ], r, bellR, - Math.sign( bellEnd ) );

}

// A flat ring in x-y at `centre`, facing +Z (side 1) or -Z (side -1).
function ringAt( parts, material, centre, inner, outer, side, segments = 24 ) {

	parts.add( material, new RingGeometry( inner, outer, segments ), _m.makeRotationY( side > 0 ? 0 : Math.PI ).setPosition( ...centre ) );

}

function corrugation() {

	return drawn( 'hdpe corrugation', [ 4, 512 ], ( ctx, w, h ) => {

		const bands = 80;
		for ( let i = 0; i < bands; i ++ ) {

			const y = i * h / bands;
			ctx.fillStyle = '#323436';
			ctx.fillRect( 0, y, w, h / bands * 0.55 );
			ctx.fillStyle = '#131415';
			ctx.fillRect( 0, y + h / bands * 0.55, w, h / bands * 0.45 );

		}

	}, { roughness: 0.65 } );

}

// A bundle of 20 lengths of 8 in C900 PVC water pipe (DR18, 9.05 in outside), 5 wide and 4 high
// in a frame of 2 x 4s with steel bands, the bells alternating ends.
function pvcBundle() {

	const parts = new Parts();
	const blue = plastic( 0x2c5fae );
	const inner = mat( 0xdfe3e8, { roughness: 0.6, side: BackSide } );
	const r = 9.05 * IN / 2;
	const wall = 0.5 * IN;
	const bellR = 5.45 * IN;
	const bell = 7 * IN;
	const length = 20 * FT;
	const across = 5;
	const high = 4;
	const board = [ 1.5 * IN, 3.5 * IN ];
	const width = across * 2 * r;
	const height = high * 2 * r;

	for ( let i = 0; i < across; i ++ ) for ( let j = 0; j < high; j ++ ) {

		const x = - width / 2 + r + i * 2 * r;
		const y = board[ 1 ] + r + j * 2 * r;
		const flip = ( i + j ) % 2 ? - 1 : 1;
		const shift = flip * bell / 2;
		const [ a, b ] = [ - length / 2 + shift, length / 2 + shift ];
		const bz = flip > 0 ? b : a;
		parts.rod( blue, [ x, y, a ], [ x, y, b ], r, 16, true );
		parts.rod( inner, [ x, y, a ], [ x, y, b ], r - wall, 16, true );
		ringAt( parts, blue, [ x, y, flip > 0 ? a : b ], r - wall, r, - flip, 16 );

		// The bell: a taper up from the pipe, the socket and its open end.
		const neck = bz + flip * 2 * IN;
		const mouth = bz + flip * bell;
		parts.rod( blue, [ x, y, bz ], [ x, y, neck ], [ r, bellR ], 16, true );
		parts.rod( blue, [ x, y, neck ], [ x, y, mouth ], bellR, 16, true );
		parts.rod( inner, [ x, y, neck ], [ x, y, mouth ], bellR - wall, 16, true );
		ringAt( parts, blue, [ x, y, mouth ], bellR - wall, bellR, flip, 16 );

	}

	// Frames of 2 x 4s round the bundle at three places, banded.
	const timber = mat( 0xc9a46e, { roughness: 0.9 } );
	const band = GALV();
	for ( const z of [ - length * 0.38, 0, length * 0.38 ] ) {

		const w = width + 2 * board[ 0 ];
		parts.box( timber, [ w + 0.1, board[ 1 ], board[ 0 ] ], [ 0, 0, z ] );
		parts.box( timber, [ w + 0.1, board[ 1 ], board[ 0 ] ], [ 0, board[ 1 ] + height, z ] );
		for ( const s of [ - 1, 1 ] ) parts.box( timber, [ board[ 0 ], height, board[ 1 ] ], [ s * ( width / 2 + board[ 0 ] / 2 ), board[ 1 ], z ] );
		for ( const dz of [ - 1, 1 ] ) {

			const bz = z + dz * ( board[ 0 ] / 2 + 0.5 * IN );
			const top = 2 * board[ 1 ] + height;
			parts.box( band, [ w + 0.11, 0.003, 1.25 * IN ], [ 0, top, bz ] );
			parts.box( band, [ w + 0.11, 0.003, 1.25 * IN ], [ 0, - 0.0005, bz ] );
			for ( const s of [ - 1, 1 ] ) parts.box( band, [ 0.003, top, 1.25 * IN ], [ s * ( w / 2 + 0.055 ), 0, bz ] );

		}

	}

	return parts.build();

}

// A 40 ft section of 16 in DR17 HDPE pipe fused into a string, on two V-roller stands, the
// fusion bead at the back end where it joins the next.
function hdpeString() {

	const parts = new Parts();
	const r = 8 * IN;
	const wall = 0.94 * IN;
	const length = 40 * FT;
	const y = rollerStand( parts, - length / 4, r );
	rollerStand( parts, length / 4, r );
	const black = plastic( 0x1b1c1d );
	parts.rod( black, [ 0, y, - length / 2 ], [ 0, y, length / 2 ], r, 32, true );
	parts.rod( mat( 0x202122, { roughness: 0.6, side: BackSide } ), [ 0, y, - length / 2 ], [ 0, y, length / 2 ], r - wall, 32, true );
	for ( const s of [ - 1, 1 ] ) ringAt( parts, black, [ 0, y, s * length / 2 ], r - wall, r, s, 32 );

	// The fusion bead, rolled out from the joint, and a print line along the top.
	parts.rod( black, [ 0, y, length / 2 - 0.6 * IN ], [ 0, y, length / 2 ], r + 0.35 * IN, 32 );
	parts.box( mat( 0x2f6fc0, { roughness: 0.6 } ), [ 0.75 * IN, 0.002, length - 0.1 ], [ 0, y + r - 0.0005, 0 ] );
	return parts.build();

}

function rollerStandItem() {

	const parts = new Parts();
	rollerStand( parts, 0, 8 * IN );
	return parts.build();

}

// A pipe roller stand at z: a yellow steel base frame with two rubber rollers set in a V, placed
// to carry a pipe of radius r touching each 40° either side of its bottom. Returns the height of
// the pipe's centre.
function rollerStand( parts, z, r ) {

	const frame = paint( 0xf2b200 );
	const roller = RUBBER();
	const rr = 2.5 * IN;
	const span = 30 * IN;
	const tube = 2 * IN;
	const angle = 40 * DEG;
	const bottom = 9 * IN;
	const y = bottom + r;

	// Base frame: two rails across and two along.
	for ( const dz of [ - 1, 1 ] ) parts.box( frame, [ span, tube, tube ], [ 0, 0, z + dz * 7 * IN ] );
	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ tube, tube, 16 * IN ], [ s * ( span / 2 - tube / 2 ), 0, z ] );

	// The rollers, each on a bracket of two side plates down to the frame.
	for ( const s of [ - 1, 1 ] ) {

		const c = [ s * ( r + rr ) * Math.sin( angle ), y - ( r + rr ) * Math.cos( angle ) ];
		const along = [ Math.cos( angle ), s * Math.sin( angle ) ];
		const end = k => [ c[ 0 ] + along[ 0 ] * k, c[ 1 ] + along[ 1 ] * k, z ];
		const half = 4 * IN;
		parts.rod( roller, end( - half ), end( half ), rr, 14 );
		parts.rod( STEEL(), end( - half - 0.6 * IN ), end( half + 0.6 * IN ), 0.4 * IN, 8 );
		for ( const dz of [ - 1, 1 ] ) {

			const pz = z + dz * ( rr + 0.6 * IN );
			parts.block( frame, [ 2 * half + 1.6 * IN, 2.2 * IN, 0.25 * IN ], [ c[ 0 ], c[ 1 ], pz ], [ 0, 0, s * angle ] );
			const foot = [ c[ 0 ] * 0.9, tube ];
			parts.rod( frame, [ c[ 0 ], c[ 1 ] - 0.8 * IN, pz ], [ foot[ 0 ], foot[ 1 ], pz ], 0.6 * IN, 6 );

		}

	}

	return y;

}

// --- site setup ------------------------------------------------------------------------------

// A project sign: an 8 x 4 ft painted plywood board on two 6 x 6 posts, its bottom 4 ft up, with
// 2 x 4 kickers behind.
function siteSign() {

	const parts = new Parts();
	const board = [ 8 * FT, 4 * FT, 0.75 * IN ];
	const bottom = 4 * FT;
	const post = 5.5 * IN;
	const ply = mat( 0xc9ab7c, { roughness: 0.9 } );
	const lumber = mat( 0xa88a5e, { roughness: 0.9 } );
	const px = board[ 0 ] / 2 - 1.2 * FT;

	for ( const s of [ - 1, 1 ] ) {

		parts.box( lumber, [ post, bottom + board[ 1 ] + 2 * IN, post ], [ s * px, 0, post / 2 ] );
		// A kicker from high on the post to a stake behind.
		parts.rod( lumber, [ s * px, 5.5 * FT, post ], [ s * px, 0.05, post + 4 * FT ], 1.75 * IN, 4 );
		parts.box( lumber, [ 1.5 * IN, 0.35, 1.5 * IN ], [ s * px, 0, post + 4 * FT + 2 * IN ] );

	}

	parts.box( ply, board, [ 0, bottom, - board[ 2 ] / 2 ] );
	face( parts, signFace(), [ board[ 0 ], board[ 1 ] ], [ 0, bottom + board[ 1 ] / 2, - board[ 2 ] - 0.003 ] );
	return parts.build();

}

function signFace() {

	return drawn( 'project sign face', [ 1024, 512 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#f4f4f0';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#163a63';
		ctx.fillRect( 0, 0, w, 130 );
		ctx.fillStyle = '#ffffff';
		ctx.textBaseline = 'middle';
		ctx.font = 'bold 76px sans-serif';
		ctx.fillText( 'PROJECT NAME', 40, 58 );
		ctx.font = '30px sans-serif';
		ctx.fillText( '123 Street Address  ·  Now under construction', 42, 108 );

		// The architect's rendering: a building against the sky.
		ctx.fillStyle = '#bcd3e6';
		ctx.fillRect( 40, 160, 460, 300 );
		ctx.fillStyle = '#7f8c99';
		ctx.fillRect( 90, 230, 250, 230 );
		ctx.fillStyle = '#5d6b78';
		ctx.fillRect( 340, 290, 120, 170 );
		ctx.fillStyle = '#d7e6f2';
		for ( let i = 0; i < 5; i ++ ) for ( let j = 0; j < 6; j ++ ) ctx.fillRect( 104 + i * 46, 246 + j * 34, 34, 22 );
		ctx.fillStyle = '#6f9a5a';
		ctx.fillRect( 40, 440, 460, 20 );

		// Who's building it.
		ctx.fillStyle = '#1f2a33';
		const rows = [ [ 'Owner', 'Owner Name' ], [ 'Architect', 'Architect Name' ], [ 'Engineer', 'Engineer Name' ] ];
		rows.forEach( ( [ role, name ], i ) => {

			ctx.font = '26px sans-serif';
			ctx.fillText( role.toUpperCase(), 540, 180 + i * 72 );
			ctx.font = 'bold 34px sans-serif';
			ctx.fillText( name, 540, 212 + i * 72 );

		} );
		ctx.fillStyle = '#f2b200';
		ctx.fillRect( 520, 392, 464, 88 );
		ctx.fillStyle = '#1f2a33';
		ctx.font = '22px sans-serif';
		ctx.fillText( 'GENERAL CONTRACTOR', 540, 414 );
		ctx.font = 'bold 40px sans-serif';
		ctx.fillText( 'Contractor', 540, 452 );
		ctx.font = '26px sans-serif';
		ctx.textAlign = 'right';
		ctx.fillText( '555-0100', 970, 452 );

	}, { roughness: 0.7 } );

}

// A free-standing safety station: a white board 4 ft wide on two steel posts with feet, its header
// and labels drawn, carrying a first aid cabinet, a gravity eyewash station and a 20 lb ABC
// extinguisher on its bracket.
function safetyStation() {

	const parts = new Parts();
	const steel = paint( 0x2f6b3c );
	const board = [ 4 * FT, 5 * FT, 0.5 * IN ];
	const bottom = 2 * FT;
	const post = 2 * IN;
	const px = board[ 0 ] / 2 - 2 * IN;

	for ( const s of [ - 1, 1 ] ) {

		parts.box( steel, [ post, bottom + board[ 1 ] + 1 * IN, post ], [ s * px, 0, post / 2 ] );
		parts.box( steel, [ 2.5 * IN, 1.5 * IN, 3 * FT ], [ s * px, 0, 0 ] );
		parts.box( RUBBER(), [ 3 * IN, 0.5 * IN, 4 * IN ], [ s * px, 0, - 1.5 * FT + 2 * IN ] );

	}

	const front = - 0.5 * IN;
	parts.box( mat( 0xf2f2ee, { roughness: 0.6 } ), board, [ 0, bottom, front + board[ 2 ] / 2 ] );
	face( parts, stationFace(), [ board[ 0 ], board[ 1 ] ], [ 0, bottom + board[ 1 ] / 2, front - 0.002 ] );
	const z0 = front - 0.003;

	// First aid cabinet, upper left.
	const cab = [ 16 * IN, 13 * IN, 5 * IN ];
	const cabAt = [ 11 * IN, bottom + 39 * IN ];
	parts.box( mat( 0xf6f6f3, { roughness: 0.4, metalness: 0.2 } ), cab, [ cabAt[ 0 ], cabAt[ 1 ], z0 - cab[ 2 ] / 2 ] );
	face( parts, firstAidFace(), [ cab[ 0 ] - 0.02, cab[ 1 ] - 0.02 ], [ cabAt[ 0 ], cabAt[ 1 ] + cab[ 1 ] / 2, z0 - cab[ 2 ] - 0.002 ] );

	// Eyewash station, upper right: a green case with its yellow pull-down front.
	const eye = [ 13 * IN, 16 * IN, 7 * IN ];
	const eyeAt = [ - 12 * IN, bottom + 36 * IN ];
	parts.box( plastic( 0x1f8a4c ), eye, [ eyeAt[ 0 ], eyeAt[ 1 ], z0 - eye[ 2 ] / 2 ] );
	parts.box( plastic( 0xf2c200 ), [ eye[ 0 ] - 1.5 * IN, 5 * IN, 1 * IN ], [ eyeAt[ 0 ], eyeAt[ 1 ] + 1 * IN, z0 - eye[ 2 ] - 0.5 * IN ] );

	// The extinguisher on its bracket, lower left: cylinder, valve, handle and hose.
	const red = mat( 0xc21e1e, { roughness: 0.35, metalness: 0.2 } );
	const ex = [ 12 * IN, bottom + 3 * IN, z0 - 4.5 * IN ];
	parts.box( STEEL(), [ 3 * IN, 4 * IN, 4 * IN ], [ ex[ 0 ], ex[ 1 ] + 14 * IN, z0 - 2 * IN ] );
	parts.cylinder( red, 3.5 * IN, 17 * IN, ex, 18 );
	parts.sphere( red, 3.5 * IN, [ ex[ 0 ], ex[ 1 ] + 17 * IN, ex[ 2 ] ], [ 18, 6 ], [ 1, 0.5, 1 ] );
	parts.cylinder( mat( 0x1f2022, { roughness: 0.5, metalness: 0.5 } ), 0.9 * IN, 3.2 * IN, [ ex[ 0 ], ex[ 1 ] + 18.5 * IN, ex[ 2 ] ], 10 );
	parts.block( STEEL(), [ 5 * IN, 0.4 * IN, 1 * IN ], [ ex[ 0 ] + 1.5 * IN, ex[ 1 ] + 21.6 * IN, ex[ 2 ] ], [ 0, 0, 0.15 ] );
	parts.path( RUBBER(), [
		[ ex[ 0 ] + 1 * IN, ex[ 1 ] + 19.5 * IN, ex[ 2 ] - 1 * IN ], [ ex[ 0 ] + 4 * IN, ex[ 1 ] + 17 * IN, ex[ 2 ] - 2.5 * IN ],
		[ ex[ 0 ] + 4.2 * IN, ex[ 1 ] + 8 * IN, ex[ 2 ] - 3.6 * IN ],
	], 0.4 * IN, 8 );
	face( parts, extinguisherLabel(), [ 4.5 * IN, 6 * IN ], [ ex[ 0 ], ex[ 1 ] + 8 * IN, ex[ 2 ] - 3.5 * IN - 0.002 ] );

	return parts.build();

}

function stationFace() {

	return drawn( 'safety station board', [ 384, 480 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#f2f2ee';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#138a43';
		ctx.fillRect( 0, 0, w, 64 );
		ctx.fillStyle = '#ffffff';
		ctx.font = 'bold 40px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText( 'SAFETY STATION', w / 2, 34, w - 20 );

		// Labels under where each thing hangs, and the emergency numbers.
		ctx.font = 'bold 20px sans-serif';
		ctx.fillStyle = '#138a43';
		ctx.fillText( 'FIRST AID', w * 0.27, 196 );
		ctx.fillText( 'EYE WASH', w * 0.75, 232 );
		ctx.fillStyle = '#c21e1e';
		ctx.fillText( 'FIRE', w * 0.27, 284 );
		ctx.fillStyle = '#1f2a33';
		ctx.fillRect( w * 0.52, 260, w * 0.42, 170 );
		ctx.fillStyle = '#ffffff';
		ctx.fillRect( w * 0.54, 270, w * 0.38, 150 );
		ctx.fillStyle = '#1f2a33';
		ctx.font = 'bold 17px sans-serif';
		ctx.fillText( 'EMERGENCY', w * 0.73, 290 );
		ctx.font = '15px sans-serif';
		[ 'Call 911', 'Site office', 'First aider', 'Muster point' ].forEach( ( line, i ) => ctx.fillText( line, w * 0.73, 320 + i * 26 ) );

	}, { roughness: 0.6 } );

}

function firstAidFace() {

	return drawn( 'first aid cabinet', [ 128, 104 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#f6f6f3';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#138a43';
		ctx.fillRect( w / 2 - 34, 10, 68, 68 );
		ctx.fillStyle = '#ffffff';
		ctx.fillRect( w / 2 - 8, 18, 16, 52 );
		ctx.fillRect( w / 2 - 26, 36, 52, 16 );
		ctx.fillStyle = '#138a43';
		ctx.font = 'bold 15px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText( 'FIRST AID', w / 2, 96 );

	}, { roughness: 0.4 } );

}

function extinguisherLabel() {

	return drawn( 'extinguisher label', [ 64, 84 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#f2f2ee';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#1f2a33';
		ctx.font = 'bold 22px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText( 'ABC', w / 2, 30 );
		ctx.fillStyle = '#c21e1e';
		ctx.fillRect( 6, 44, w - 12, 30 );

	}, { roughness: 0.5 } );

}

// A muster point sign, 24 x 30 in, on a square steel post with its bottom 5 ft up: the assembly
// point symbol (people in a square with arrows in from the corners) over the words.
function musterSign() {

	const parts = new Parts();
	const size = [ 24 * IN, 30 * IN ];
	const bottom = 5 * FT;
	const post = 2 * IN;
	parts.box( GALV(), [ post, bottom + size[ 1 ] - 0.05, post ], [ 0, 0, 0 ] );
	parts.box( GALV(), [ size[ 0 ], size[ 1 ], 0.08 * IN ], [ 0, bottom, - post / 2 - 0.08 * IN / 2 ] );
	face( parts, musterFace(), size, [ 0, bottom + size[ 1 ] / 2, - post / 2 - 0.08 * IN - 0.002 ] );
	return parts.build();

}

function musterFace() {

	return drawn( 'muster point face', [ 320, 400 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#ffffff';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#00843d';
		ctx.fillRect( 8, 8, w - 16, h - 16 );

		// The square, its corner arrows pointing in, and a family in the middle.
		const c = [ w / 2, 140 ];
		const s = 100;
		ctx.strokeStyle = '#ffffff';
		ctx.fillStyle = '#ffffff';
		ctx.lineWidth = 9;
		for ( const [ dx, dy ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ] ) {

			const tip = [ c[ 0 ] + dx * s * 0.62, c[ 1 ] + dy * s * 0.62 ];
			const tail = [ c[ 0 ] + dx * s * 1.12, c[ 1 ] + dy * s * 1.12 ];
			ctx.beginPath();
			ctx.moveTo( ...tail );
			ctx.lineTo( tip[ 0 ] + dx * 14, tip[ 1 ] + dy * 14 );
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo( ...tip );
			ctx.lineTo( tip[ 0 ] + dx * 30, tip[ 1 ] + dy * 4 );
			ctx.lineTo( tip[ 0 ] + dx * 4, tip[ 1 ] + dy * 30 );
			ctx.closePath();
			ctx.fill();

		}

		const person = ( x, scale ) => {

			ctx.beginPath();
			ctx.arc( x, c[ 1 ] - 40 * scale, 10 * scale, 0, Math.PI * 2 );
			ctx.fill();
			ctx.fillRect( x - 9 * scale, c[ 1 ] - 28 * scale, 18 * scale, 36 * scale );
			ctx.fillRect( x - 8 * scale, c[ 1 ] + 6 * scale, 6 * scale, 32 * scale );
			ctx.fillRect( x + 2 * scale, c[ 1 ] + 6 * scale, 6 * scale, 32 * scale );

		};

		person( c[ 0 ] - 30, 1 );
		person( c[ 0 ] + 30, 1 );
		person( c[ 0 ], 0.7 );
		ctx.font = 'bold 52px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText( 'MUSTER', w / 2, 300, w - 40 );
		ctx.fillText( 'POINT', w / 2, 354, w - 40 );

	}, { roughness: 0.5 } );

}

// A double swing gate for temporary chain-link fence: two 10 ft leaves of the same tube and mesh
// as the fence panels, each braced corner to corner, hung on 2 in posts in rubber feet, with a
// castor under each free end and a drop rod at the middle.
function fenceGate() {

	const parts = new Parts();
	const tube = STEEL();
	const leaf = 10 * FT - 2 * IN;
	const height = 6 * FT;
	const lift = 0.1;
	const half = 10 * FT;

	for ( const s of [ - 1, 1 ] ) {

		// Gate posts in their feet at the ends.
		parts.cylinder( tube, 1.25 * IN, height + lift + 4 * IN, [ s * half, 0, 0 ], 10 );
		parts.box( RUBBER(), [ 0.22, 0.14, 0.62 ], [ s * half, 0, 0 ] );

		// The leaf: mesh, frame and brace, hung from the post and closed at the middle.
		const outer = s * ( half - 2 * IN );
		const inner = s * 1 * IN;
		const mid = ( outer + inner ) / 2;
		parts.add( chainLink(), new BoxGeometry( leaf, height, 0.005 ), _m.makeTranslation( mid, lift + height / 2, 0 ) );
		for ( const x of [ outer, inner ] ) parts.cylinder( tube, 0.02, height, [ x, lift, 0 ], 8 );
		for ( const y of [ lift, lift + height ] ) parts.rod( tube, [ outer, y, 0 ], [ inner, y, 0 ], 0.02, 8 );
		parts.rod( tube, [ outer, lift + height, 0 ], [ inner, lift, 0 ], 0.016, 8 );

		// Hinges, and the castor under the free end.
		for ( const y of [ lift + 0.2, lift + height - 0.2 ] ) parts.rod( GALV(), [ s * half, y, 0 ], [ outer, y, 0 ], 0.03, 8 );
		parts.box( GALV(), [ 0.04, lift - 0.06, 0.04 ], [ s * 0.15, 0.06, 0 ] );
		parts.rod( RUBBER(), [ s * 0.15 - 0.02, 0.03, 0 ], [ s * 0.15 + 0.02, 0.03, 0 ], 0.03, 12 );

	}

	// Drop rod and latch at the middle.
	parts.cylinder( GALV(), 0.012, lift + 1.1, [ 0.05, 0, - 0.04 ], 8 );
	parts.box( GALV(), [ 0.18, 0.08, 0.05 ], [ 0, lift + height / 2, 0 ] );
	return parts.build();

}

// A cattle-guard style track-out grid, 12 ft wide and 20 ft long: 3 in pipes across the way at
// 5 in centres on five longitudinal beams, steel ramps at both ends, painted edge channels, for
// trucks to shake their tyres off on the way out.
function rumbleGrid() {

	const parts = new Parts();
	const width = 12 * FT;
	const length = 20 * FT;
	const ramp = 2 * FT;
	const beam = 6 * IN;
	const pipe = 1.75 * IN;
	const top = beam + 2 * pipe;
	const grid = length - 2 * ramp;
	const steel = mat( 0x6a6660, { roughness: 0.7, metalness: 0.5 } );
	const edge = paint( 0xf2b200 );

	for ( let i = 0; i < 5; i ++ ) parts.box( steel, [ 4 * IN, beam, grid ], [ - width / 2 + 6 * IN + i * ( width - 12 * IN ) / 4, 0, 0 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( edge, [ 4 * IN, top, length - 0.1 ], [ s * ( width / 2 - 2 * IN ), 0, 0 ] );
	const count = Math.floor( grid / ( 5 * IN ) );
	for ( let i = 0; i < count; i ++ ) {

		const z = - grid / 2 + ( i + 0.5 ) * grid / count;
		parts.rod( steel, [ - width / 2 + 4 * IN, beam + pipe, z ], [ width / 2 - 4 * IN, beam + pipe, z ], pipe, 8, true );

	}

	// Ramps, a plate up from the ground to the grid at each end.
	for ( const s of [ - 1, 1 ] ) {

		const z0 = s * grid / 2;
		const z1 = s * length / 2;
		const points = s < 0 ? [ [ z1, 0 ], [ z0, 0 ], [ z0, top ] ] : [ [ z0, 0 ], [ z1, 0 ], [ z0, top ] ];
		parts.prism( steel, points, width - 8 * IN );

	}

	return parts.build();

}

// A 5-channel cable protector, 36 in long, 20.5 in across and 3.25 in high: the yellow hinged lid
// over the channels and an orange ramp each side; the channels show at the ends.
function cableProtector() {

	const parts = new Parts();
	const length = 3 * FT - 0.1 * IN;
	const half = 20.5 * IN / 2;
	const lid = 4.75 * IN;
	const height = 3.25 * IN;
	const ramp = plastic( 0xe8641b );
	for ( const s of [ - 1, 1 ] ) {

		const points = s < 0 ? [ [ - half, 0 ], [ - lid, 0 ], [ - lid, height - 0.25 * IN ], [ - half, 0.25 * IN ] ] : [ [ lid, 0 ], [ half, 0 ], [ half, 0.25 * IN ], [ lid, height - 0.25 * IN ] ];
		parts.prism( ramp, points, length );

	}

	parts.box( plastic( 0xf2c200 ), [ length, height, 2 * lid ], [ 0, 0, 0 ] );
	for ( let i = 0; i < 5; i ++ ) for ( const s of [ - 1, 1 ] ) {

		parts.box( DARK(), [ 0.002, 1.25 * IN, 1.25 * IN ], [ s * ( length / 2 + 0.0005 ), 0.4 * IN, - lid + 0.6 * IN + i * ( 2 * lid - 1.2 * IN ) / 4 ] );

	}

	// Tread ribs across the ramps.
	for ( const s of [ - 1, 1 ] ) for ( let i = 1; i < 4; i ++ ) {

		const z = s * ( lid + i * ( half - lid ) / 4 );
		const y = 0.25 * IN + ( height - 0.5 * IN ) * ( 1 - i / 4 );
		parts.block( ramp, [ length - 0.02, 0.3 * IN, 0.4 * IN ], [ 0, y + 0.1 * IN, z ], [ s * 0.27, 0, 0 ] );

	}

	return parts.build();

}

// A 2-channel hose bridge for hose up to 3 in, 36 in long, 24 in across and 5 in high: a yellow
// body with black ribbed ramps, its two arched channels showing at the ends.
function hoseBridge() {

	const parts = new Parts();
	const length = 3 * FT - 0.1 * IN;
	const half = 12 * IN;
	const top = 5.5 * IN;
	const height = 5 * IN;
	const body = plastic( 0xf2c200 );
	const black = plastic( 0x1d1e20 );
	parts.box( body, [ length, height, 2 * top ], [ 0, 0, 0 ] );
	for ( const s of [ - 1, 1 ] ) {

		const points = s < 0 ? [ [ - half, 0 ], [ - top, 0 ], [ - top, height - 0.3 * IN ], [ - half, 0.3 * IN ] ] : [ [ top, 0 ], [ half, 0 ], [ half, 0.3 * IN ], [ top, height - 0.3 * IN ] ];
		parts.prism( black, points, length );
		for ( let i = 1; i < 5; i ++ ) {

			const z = s * ( top + i * ( half - top ) / 5 );
			const y = 0.3 * IN + ( height - 0.6 * IN ) * ( 1 - i / 5 );
			parts.block( black, [ length - 0.02, 0.35 * IN, 0.4 * IN ], [ 0, y + 0.12 * IN, z ], [ s * 0.6, 0, 0 ] );

		}

	}

	// The arched channels at each end.
	for ( const x of [ - 1, 1 ] ) for ( const z of [ - 2.3 * IN, 2.3 * IN ] ) {

		const ex = x * ( length / 2 + 0.0005 );
		parts.box( DARK(), [ 0.002, 1.8 * IN, 3.2 * IN ], [ ex, 0, z ] );
		parts.rod( DARK(), [ ex - 0.001, 1.8 * IN, z ], [ ex + 0.001, 1.8 * IN, z ], 1.6 * IN, 14 );

	}

	return parts.build();

}

// One bay of selective pallet racking: two 42 in deep upright frames 12 ft high, blue, with
// their bracing; three pairs of 8 ft orange beams (low, 4 ft 6 and 8 ft 6), wire decks on the upper
// two; two loaded pallets on the low beams and one on the next.
function palletRacking() {

	const parts = new Parts();
	const blue = paint( 0x1f4f99 );
	const orange = paint( 0xe66a1e );
	const deck = GALV();
	const clear = 8 * FT;
	const depth = 42 * IN;
	const height = 12 * FT;
	const post = 3 * IN;
	const levels = [ 6 * IN, 4.5 * FT, 8.5 * FT ];
	const px = clear / 2 + post / 2;

	for ( const s of [ - 1, 1 ] ) {

		for ( const dz of [ - 1, 1 ] ) {

			parts.box( blue, [ post, height, post ], [ s * px, 0, dz * ( depth / 2 - post / 2 ) ] );
			parts.box( GALV(), [ 5 * IN, 0.25 * IN, 5 * IN ], [ s * px, 0, dz * ( depth / 2 - post / 2 ) ] );

		}

		// Bracing: horizontals and diagonals between the two posts of the frame.
		const zs = [ - depth / 2 + post, depth / 2 - post ];
		const step = 2 * FT;
		for ( let y = 6 * IN, k = 0; y < height - 0.1; y += step, k ++ ) {

			parts.rod( blue, [ s * px, y, zs[ 0 ] ], [ s * px, y, zs[ 1 ] ], 0.6 * IN, 6 );
			if ( y + step < height ) parts.rod( blue, [ s * px, y, zs[ k % 2 ] ], [ s * px, y + step, zs[ 1 - k % 2 ] ], 0.5 * IN, 6 );

		}

	}

	for ( const y of levels ) {

		for ( const dz of [ - 1, 1 ] ) parts.box( orange, [ clear, 4.5 * IN, 1.75 * IN ], [ 0, y - 4.5 * IN, dz * ( depth / 2 - 1 * IN ) ] );
		if ( y > 1 ) parts.box( deck, [ clear - 0.02, 0.4 * IN, depth - 2 * IN ], [ 0, y - 0.4 * IN, 0 ] );

	}

	// Loaded pallets, 40 in wide faces to the front, shrink-wrapped boxes on them.
	const load = mat( 0xd8d0c0, { roughness: 0.4 } );
	for ( const [ x, y ] of [ [ - 22 * IN, levels[ 0 ] ], [ 22 * IN, levels[ 0 ] ], [ - 22 * IN, levels[ 1 ] ] ] ) {

		parts.box( TIMBER(), [ 40 * IN, 5.5 * IN, 48 * IN ], [ x, y, 0 ] );
		parts.box( load, [ 39 * IN, 36 * IN, 46 * IN ], [ x, y + 5.5 * IN, 0 ] );

	}

	return parts.build();

}

// A 95 gal rollout cart: tapered body 26.5 in wide and 34 in deep at the top, 45.5 in to the top
// of the lid, its handle and wheels at the back, as it's put out (front to the street).
export function wheelieBin( color, decal ) {

	const parts = new Parts();
	const body = plastic( color );
	const dark = plastic( 0x1d1e20 );
	const top = [ 26.5 * IN, 32 * IN ];
	const bottom = [ 22 * IN, 26 * IN ];
	const height = 43 * IN;
	const r = 6 * IN;

	parts.add( body, taperedBox( bottom, top, height - 1.5 * IN, [ 0, 1.5 * IN, 1 * IN ], - 1 * IN ) );
	// The lid, overhanging at the front, and the handle across the back.
	parts.box( body, [ top[ 0 ] + 1 * IN, 1.6 * IN, top[ 1 ] + 2 * IN ], [ 0, height, - 0.5 * IN ] );
	parts.box( body, [ top[ 0 ] - 3 * IN, 2 * IN, 3 * IN ], [ 0, height - 1.2 * IN, top[ 1 ] / 2 + 1.5 * IN ] );
	parts.rod( dark, [ - top[ 0 ] / 2 + 2 * IN, height - 0.2 * IN, top[ 1 ] / 2 + 3.5 * IN ], [ top[ 0 ] / 2 - 2 * IN, height - 0.2 * IN, top[ 1 ] / 2 + 3.5 * IN ], 0.6 * IN, 8 );

	// Wheels and axle at the back, a foot rest at the front.
	const wz = bottom[ 1 ] / 2 + 1 * IN;
	for ( const s of [ - 1, 1 ] ) wheel( parts, [ s * ( bottom[ 0 ] / 2 + 1.25 * IN ), wz ], r, 2 * IN, 0.4 );
	parts.rod( STEEL(), [ - bottom[ 0 ] / 2 - 0.5 * IN, r, wz ], [ bottom[ 0 ] / 2 + 0.5 * IN, r, wz ], 0.4 * IN, 8 );
	parts.box( body, [ bottom[ 0 ] - 4 * IN, 1.5 * IN, 2 * IN ], [ 0, 0, - bottom[ 1 ] / 2 + 2 * IN ] );

	// A recycling decal on the front face, which leans with the taper.
	if ( decal ) {

		const lean = Math.atan2( ( top[ 1 ] - bottom[ 1 ] ) / 2 + 1 * IN, height - 1.5 * IN );
		const y = 26 * IN;
		const z = 1 * IN - ( bottom[ 1 ] + ( top[ 1 ] - bottom[ 1 ] ) * ( y - 1.5 * IN ) / ( height - 1.5 * IN ) ) / 2 - 1 * IN * ( y - 1.5 * IN ) / ( height - 1.5 * IN ) - 0.003;
		parts.add( recycleDecal(), new PlaneGeometry( 13 * IN, 13 * IN ), _m.makeRotationY( Math.PI ).premultiply( _r.makeRotationX( - lean ) ).setPosition( 0, y, z ) );

	}

	return parts.build();

}

function recycleDecal() {

	return drawn( 'recycling decal', [ 128, 128 ], ( ctx, w ) => {

		ctx.fillStyle = '#ffffff';
		ctx.strokeStyle = '#ffffff';
		ctx.lineWidth = 11;
		for ( let i = 0; i < 3; i ++ ) {

			const a = i * 2 * Math.PI / 3 - Math.PI / 2;
			ctx.beginPath();
			ctx.arc( w / 2, w / 2, 40, a + 0.35, a + 1.75 );
			ctx.stroke();
			const tip = a + 2.05;
			const [ x, y ] = [ w / 2 + 40 * Math.cos( tip ), w / 2 + 40 * Math.sin( tip ) ];
			ctx.beginPath();
			ctx.moveTo( x, y );
			ctx.lineTo( x + 18 * Math.cos( tip - 2.4 ), y + 18 * Math.sin( tip - 2.4 ) );
			ctx.lineTo( x + 18 * Math.cos( tip + 2.0 ), y + 18 * Math.sin( tip + 2.0 ) );
			ctx.closePath();
			ctx.fill();

		}

	} );

}

// A 2,000 L double-walled fuel cube: the bunded tank in a steel frame with corner posts and
// lifting lugs, fork pockets in the base, and the lockable pump cabinet at the front with its
// DIESEL and flammable placards.
function fuelCube() {

	const parts = new Parts();
	const length = 1.92;
	const width = 1.37;
	const height = 1.63;
	const shell = mat( 0xe9e9e4, { roughness: 0.5, metalness: 0.2 } );
	const frame = paint( 0x4b5157 );
	const base = 0.16;

	parts.box( frame, [ width, base, length ], [ 0, 0, 0 ] );
	for ( const z of [ - 0.4, 0.4 ] ) for ( const s of [ - 1, 1 ] ) parts.box( DARK(), [ 0.01, 0.1, 0.24 ], [ s * ( width / 2 + 0.003 ), 0.03, z ] );
	parts.box( shell, [ width - 0.1, height - base - 0.06, length - 0.1 ], [ 0, base, 0 ] );
	for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) {

		parts.box( frame, [ 0.09, height, 0.09 ], [ sx * ( width / 2 - 0.045 ), 0, sz * ( length / 2 - 0.045 ) ] );
		parts.block( paint( 0xf2b200 ), [ 0.03, 0.12, 0.12 ], [ sx * ( width / 2 - 0.045 ), height + 0.06, sz * ( length / 2 - 0.045 ) ], [ 0, sx * sz * Math.PI / 4, 0 ] );

	}

	for ( const s of [ - 1, 1 ] ) {

		parts.box( frame, [ width, 0.07, 0.07 ], [ 0, height - 0.07, s * ( length / 2 - 0.035 ) ] );
		parts.box( frame, [ 0.07, 0.07, length ], [ s * ( width / 2 - 0.035 ), height - 0.07, 0 ] );

	}

	// The cabinet door, its hinges and handle, and the placards on it.
	const front = - length / 2 + 0.05;
	parts.box( frame, [ width - 0.3, 0.9, 0.03 ], [ 0, 0.4, front - 0.015 ] );
	for ( const y of [ 0.55, 1.15 ] ) parts.box( DARK(), [ 0.04, 0.1, 0.04 ], [ - width / 2 + 0.17, y, front - 0.04 ] );
	parts.box( STEEL(), [ 0.14, 0.04, 0.04 ], [ width / 2 - 0.3, 0.85, front - 0.05 ] );
	face( parts, dieselPlacard(), [ 0.6, 0.3 ], [ 0, 1.05, front - 0.032 ] );

	// Fill cap, vent and gauge on top.
	const top = height - 0.06;
	parts.cylinder( frame, 0.09, 0.1, [ 0.3, top, 0.45 ], 14 );
	parts.cylinder( STEEL(), 0.025, 0.25, [ - 0.4, top, 0.6 ], 8 );
	parts.cylinder( STEEL(), 0.06, 0.035, [ - 0.4, top + 0.25, 0.6 ], 10 );
	parts.cylinder( DARK(), 0.07, 0.05, [ - 0.15, top, - 0.5 ], 14 );
	return parts.build();

}

function dieselPlacard() {

	return drawn( 'diesel placard', [ 256, 128 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#ffffff';
		ctx.fillRect( 0, 0, 150, h );
		ctx.fillStyle = '#1f2a33';
		ctx.font = 'bold 40px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText( 'DIESEL', 75, h / 2, 140 );

		// The flammable diamond: red, a flame, class 3.
		ctx.save();
		ctx.translate( 203, h / 2 );
		ctx.rotate( Math.PI / 4 );
		ctx.fillStyle = '#d02020';
		ctx.fillRect( - 40, - 40, 80, 80 );
		ctx.restore();
		ctx.fillStyle = '#ffffff';
		ctx.font = 'bold 26px sans-serif';
		ctx.fillText( '3', 203, h / 2 + 30 );
		ctx.beginPath();
		ctx.moveTo( 203, h / 2 - 34 );
		ctx.quadraticCurveTo( 220, h / 2 - 6, 203, h / 2 + 10 );
		ctx.quadraticCurveTo( 186, h / 2 - 6, 203, h / 2 - 34 );
		ctx.fill();

	}, { roughness: 0.5 } );

}

// --- traffic ---------------------------------------------------------------------------------

// A solar portable traffic signal on its single-axle trailer: a battery cabinet and tilted solar
// panel, four stabiliser jacks, a mast with one signal head on it and another hung from an arm
// out over the lane to its right, the heads facing the front (-Z), red lit.
function signalTrailer() {

	const parts = new Parts();
	const frame = paint( 0xe9a91a );
	const dark = mat( 0x2c2e31, { roughness: 0.7, metalness: 0.2 } );
	const width = 1.7;
	const length = 2.6;
	const deck = 0.5;

	// Chassis, deck and tongue (to the back), axle and wheels, fenders.
	for ( const s of [ - 1, 1 ] ) parts.box( frame, [ 0.08, 0.14, length ], [ s * ( width / 2 - 0.04 ), deck - 0.14, 0 ] );
	parts.box( frame, [ width, 0.02, length ], [ 0, deck, 0 ] );
	parts.path( frame, [ [ - width / 2 + 0.1, deck - 0.07, length / 2 ], [ 0, deck - 0.07, length / 2 + 1.1 ], [ width / 2 - 0.1, deck - 0.07, length / 2 ] ], 0.05, 8 );
	parts.rod( frame, [ 0, deck - 0.07, length / 2 + 1.1 ], [ 0, deck - 0.07, length / 2 + 1.35 ], 0.05, 8 );
	parts.sphere( STEEL(), 0.06, [ 0, deck - 0.02, length / 2 + 1.35 ] );
	parts.cylinder( STEEL(), 0.03, deck - 0.05, [ 0, 0.05, length / 2 + 0.85 ], 8 );
	parts.box( STEEL(), [ 0.12, 0.05, 0.12 ], [ 0, 0, length / 2 + 0.85 ] );
	const r = 0.3;
	parts.rod( STEEL(), [ - width / 2 - 0.1, r, 0.25 ], [ width / 2 + 0.1, r, 0.25 ], 0.03, 8 );
	for ( const s of [ - 1, 1 ] ) {

		wheel( parts, [ s * ( width / 2 + 0.12 ), 0.25 ], r, 0.18 );
		parts.box( frame, [ 0.24, 0.02, 0.8 ], [ s * ( width / 2 + 0.12 ), 2 * r + 0.06, 0.25 ] );

	}

	// Stabiliser jacks at the corners, with their pads.
	for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) {

		const at = [ sx * ( width / 2 + 0.05 ), sz * ( length / 2 - 0.15 ) ];
		parts.box( STEEL(), [ 0.06, deck, 0.06 ], [ at[ 0 ], 0.03, at[ 1 ] ] );
		parts.box( dark, [ 0.18, 0.03, 0.18 ], [ at[ 0 ], 0, at[ 1 ] ] );

	}

	// Battery cabinet at the back, the solar panel tilted over it.
	parts.box( dark, [ 1.1, 0.6, 0.7 ], [ 0, deck + 0.02, 0.75 ] );
	const panel = [ 1.6, 0.04, 1.0 ];
	const tilt = 30 * DEG;
	parts.block( mat( 0x1c2a44, { roughness: 0.25, metalness: 0.4 } ), panel, [ 0, deck + 1.15, 0.75 ], [ - tilt, 0, 0 ] );
	parts.block( GALV(), [ panel[ 0 ] + 0.04, 0.03, panel[ 2 ] + 0.04 ], [ 0, deck + 1.12, 0.75 ], [ - tilt, 0, 0 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( GALV(), [ 0.05, 0.6, 0.05 ], [ s * 0.6, deck + 0.6, 0.75 ] );

	// The mast and its arm out to the right.
	const mastZ = - 0.6;
	const mastTop = 5.4;
	const reach = 2.6;
	parts.box( frame, [ 0.16, mastTop - deck, 0.16 ], [ 0, deck, mastZ ] );
	parts.box( frame, [ 0.4, 0.1, 0.4 ], [ 0, deck, mastZ ] );
	parts.box( frame, [ reach + 0.08, 0.1, 0.1 ], [ reach / 2, mastTop - 0.1, mastZ ] );
	parts.rod( frame, [ 0.08, mastTop - 0.7, mastZ ], [ reach * 0.55, mastTop - 0.1, mastZ ], 0.03, 6 );

	signalHead( parts, [ reach, mastTop - 0.12 - 0.62, mastZ - 0.02 ] );
	signalHead( parts, [ 0, 2.9, mastZ - 0.08 - 0.13 ] );
	parts.box( GALV(), [ 0.04, 0.06, 0.04 ], [ reach, mastTop - 0.18, mastZ - 0.02 ] );
	return parts.build();

}

// A 3-section signal head with 12 in lenses centred at `centre` (its back face at z), in a yellow
// housing on a black backplate with a yellow reflective border; red lit.
function signalHead( parts, [ x, y, z ] ) {

	const housing = paint( 0xf0c419 );
	const visor = mat( 0xf0c419, { roughness: 0.5, metalness: 0.2, side: DoubleSide } );
	const black = mat( 0x141516, { roughness: 0.6 } );
	const size = [ 0.36, 1.12, 0.26 ];
	const plate = [ 0.6, 1.3 ];
	const back = z;

	parts.box( black, [ plate[ 0 ], plate[ 1 ], 0.01 ], [ x, y - plate[ 1 ] / 2, back - 0.02 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( housing, [ 0.05, plate[ 1 ], 0.004 ], [ x + s * ( plate[ 0 ] / 2 - 0.025 ), y - plate[ 1 ] / 2, back - 0.027 ] );
		parts.box( housing, [ plate[ 0 ] - 0.1, 0.05, 0.004 ], [ x, y + s * ( plate[ 1 ] / 2 - 0.025 ) - 0.025, back - 0.027 ] );

	}

	parts.box( housing, size, [ x, y - size[ 1 ] / 2, back - 0.03 - size[ 2 ] / 2 ] );
	const front = back - 0.03 - size[ 2 ];
	const lenses = [
		mat( 0xff2a1a, { roughness: 0.3, emissive: 0xff1a0a, emissiveIntensity: 1.4 } ),
		mat( 0x5a3d0c, { roughness: 0.3 } ),
		mat( 0x0d3b26, { roughness: 0.3 } ),
	];
	lenses.forEach( ( lens, i ) => {

		const ly = y + ( 1 - i ) * 0.355;
		parts.rod( black, [ x, ly, front ], [ x, ly, front - 0.006 ], 0.17, 24 );
		parts.rod( lens, [ x, ly, front - 0.006 ], [ x, ly, front - 0.012 ], 0.15, 24 );
		parts.rod( visor, [ x, ly + 0.02, front - 0.012 ], [ x, ly + 0.02, front - 0.24 ], 0.165, 16, true );

	} );

}

// A 6 ft section of rubber speed bump, 12 in across and 2 1/4 in high, black with yellow
// sections, so a row of them keeps the stripes going.
function speedBump() {

	const parts = new Parts();
	const length = 6 * FT - 0.1 * IN;
	const profile = [ [ - 6 * IN, 0 ], [ 6 * IN, 0 ], [ 5 * IN, 0.9 * IN ], [ 3 * IN, 1.85 * IN ], [ 1 * IN, 2.25 * IN ], [ - 1 * IN, 2.25 * IN ], [ - 3 * IN, 1.85 * IN ], [ - 5 * IN, 0.9 * IN ] ];
	const black = plastic( 0x1a1b1c );
	const yellow = plastic( 0xf2c200 );
	const pieces = 6;
	for ( let i = 0; i < pieces; i ++ ) parts.prism( i % 2 ? yellow : black, profile, length / pieces, - length / 2 + ( i + 0.5 ) * length / pieces );
	return parts.build();

}

// A 20 ft section of covered walkway (sidewalk shed): scaffold tube posts every 10 ft both sides,
// 8 ft clear under 2 in plank deck on timber joists, a plywood wall on the site side (+X) and a
// guardrail on the street side, a 42 in plywood parapet round the deck. The posts at the ends are
// shared with the next section in a row.
function coveredWalkway() {

	const parts = new Parts();
	const tube = GALV();
	const r = 0.024;
	const length = 20 * FT;
	const width = 6 * FT + 2 * 2 * IN;
	const clear = 8 * FT;
	const half = width / 2;
	const plank = mat( 0xb08a58, { roughness: 0.95 } );
	const ply = mat( 0xdedbd2, { roughness: 0.85 } );
	const green = mat( 0x2f5a3f, { roughness: 0.85 } );

	for ( const z of [ - length / 2, 0, length / 2 ] ) for ( const s of [ - 1, 1 ] ) {

		parts.cylinder( tube, r, clear + 0.2, [ s * half, 0, z ], 10 );
		parts.box( STEEL(), [ 0.15, 0.006, 0.15 ], [ s * half, 0, z ] );
		parts.box( TIMBER(), [ 0.22, 0.04, 0.22 ], [ s * half, 0, z ] );

	}

	// Ledgers along each side, transoms across at each post, and joists and planks over them.
	for ( const s of [ - 1, 1 ] ) {

		parts.rod( tube, [ s * half, clear, - length / 2 ], [ s * half, clear, length / 2 ], r, 10 );
		if ( s < 0 ) for ( const y of [ 0.55, 1.07 ] ) parts.rod( tube, [ s * half, y, - length / 2 ], [ s * half, y, length / 2 ], r, 10 );

	}

	for ( const z of [ - length / 2, 0, length / 2 ] ) parts.rod( tube, [ - half - 0.1, clear + 2 * r, z ], [ half + 0.1, clear + 2 * r, z ], r, 10 );
	const deck = clear + 4 * r;
	for ( let x = - half; x <= half + 0.01; x += width / 4 ) parts.box( TIMBER(), [ 1.5 * IN, 7.25 * IN, length ], [ x, deck, 0 ] );
	parts.box( plank, [ width + 0.3, 2 * IN, length ], [ 0, deck + 7.25 * IN, 0 ] );

	// The parapet round the deck's two long sides, and the site side wall.
	const parapet = 42 * IN;
	for ( const s of [ - 1, 1 ] ) parts.box( ply, [ 0.75 * IN, parapet, length ], [ s * ( half + 0.15 ), deck, 0 ] );
	parts.box( ply, [ 0.75 * IN, clear, length ], [ half + r + 0.75 * IN / 2, 0, 0 ] );
	parts.box( green, [ 0.8 * IN, 0.3, length ], [ half + r + 0.75 * IN / 2, 0, 0 ] );
	for ( let z = - length / 2 + 4 * FT; z < length / 2; z += 4 * FT ) parts.box( mat( 0xbdbab1, { roughness: 0.9 } ), [ 0.8 * IN, clear - 0.3, 0.006 ], [ half + r + 0.75 * IN / 2, 0.3, z ] );

	// Lights under the deck.
	const lamp = mat( 0xfff4d6, { roughness: 0.3, emissive: 0xfff0c0, emissiveIntensity: 0.8 } );
	for ( const z of [ - length / 4, length / 4 ] ) parts.box( lamp, [ 0.1, 0.05, 1.2 ], [ 0, clear - 0.05, z ] );
	return parts.build();

}

// --- survey ----------------------------------------------------------------------------------

// A survey tripod: three legs from a head at `head` metres to feet spread `spread` round, with a
// bit of yellow at the top of each leg, and the head plate. `turn` is where the first leg points
// (radians round from behind). Exported for the surveyor in people.js.
export function tripod( parts, head, spread, color = 0xd9b03a, turn = Math.PI / 6 ) {

	const leg = mat( color, { roughness: 0.6 } );
	const alu = mat( 0xb9bdc0, { roughness: 0.4, metalness: 0.6 } );
	for ( let i = 0; i < 3; i ++ ) {

		const a = ( i / 3 ) * Math.PI * 2 + turn;
		const top = [ 0.06 * Math.sin( a ), head - 0.03, 0.06 * Math.cos( a ) ];
		const foot = [ spread * Math.sin( a ), 0.01, spread * Math.cos( a ) ];
		const knee = top.map( ( v, k ) => v + ( foot[ k ] - v ) * 0.55 );
		parts.rod( leg, top, knee, 0.022, 6 );
		parts.rod( alu, knee, foot, 0.015, 6 );
		parts.rod( STEEL(), foot, [ foot[ 0 ] * 1.02, 0, foot[ 2 ] * 1.02 ], 0.008, 6 );

	}

	parts.cylinder( leg, 0.085, 0.04, [ 0, head - 0.04, 0 ], 3 );
	parts.cylinder( alu, 0.075, 0.012, [ 0, head, 0 ], 16 );

}

// A total station on a wooden tripod, its telescope to the front: tribrach, the body with its
// keypad and screen, the standards and the handle.
function totalStation() {

	const parts = new Parts();
	const head = 1.42;
	tripod( parts, head, 0.5 );
	stationHead( parts, head );
	return parts.build();

}

// The total station itself on a tripod head at `head` metres, its telescope to the front (-Z)
// and the eyepiece to the back. Exported for the surveyor in people.js.
export function stationHead( parts, head ) {

	const white = mat( 0xeceeea, { roughness: 0.45 } );
	const grey = mat( 0x3a3e44, { roughness: 0.5 } );
	let y = head + 0.012;
	parts.cylinder( grey, 0.075, 0.05, [ 0, y, 0 ], 16 );
	y += 0.05;
	parts.cylinder( white, 0.085, 0.08, [ 0, y, 0 ], 20 );
	parts.box( grey, [ 0.13, 0.07, 0.02 ], [ 0, y + 0.005, - 0.085 ] );
	parts.box( mat( 0x23313b, { roughness: 0.15, metalness: 0.3 } ), [ 0.08, 0.04, 0.003 ], [ 0, y + 0.03, - 0.096 ] );
	y += 0.08;
	for ( const s of [ - 1, 1 ] ) parts.box( white, [ 0.04, 0.17, 0.11 ], [ s * 0.075, y, 0 ] );
	const axis = y + 0.11;
	parts.rod( grey, [ 0, axis, - 0.13 ], [ 0, axis, 0.09 ], 0.038, 16 );
	parts.rod( mat( 0x1a2430, { roughness: 0.1, metalness: 0.4 } ), [ 0, axis, - 0.131 ], [ 0, axis, - 0.135 ], 0.03, 16 );
	parts.rod( grey, [ - 0.095, axis, 0 ], [ 0.095, axis, 0 ], 0.02, 10 );
	parts.path( grey, [ [ - 0.075, y + 0.17, 0 ], [ - 0.05, y + 0.22, 0 ], [ 0.05, y + 0.22, 0 ], [ 0.075, y + 0.17, 0 ] ], 0.01, 6 );

}

// A 2 m prism pole standing on its point, held by a bipod, the round prism at the top facing the
// front and a bubble level on the pole.
function prismPole() {

	const parts = new Parts();
	const alu = mat( 0xc8ccd0, { roughness: 0.35, metalness: 0.6 } );
	const red = mat( 0xc22a22, { roughness: 0.5 } );
	const height = 2.0;
	parts.rod( STEEL(), [ 0, 0, 0 ], [ 0, 0.08, 0 ], [ 0.002, 0.014 ], 8 );
	parts.rod( alu, [ 0, 0.08, 0 ], [ 0, height, 0 ], 0.0145, 10 );
	for ( let y = 0.3; y < height; y += 0.5 ) parts.rod( red, [ 0, y, 0 ], [ 0, y + 0.1, 0 ], 0.0152, 10 );

	// The prism in its yellow housing, the bubble level and a clamp for the bipod.
	const yellow = plastic( 0xf2b200 );
	parts.rod( yellow, [ 0, height + 0.06, 0.02 ], [ 0, height + 0.06, - 0.04 ], 0.045, 20 );
	parts.rod( mat( 0x9fb6c9, { roughness: 0.05, metalness: 0.7 } ), [ 0, height + 0.06, - 0.04 ], [ 0, height + 0.06, - 0.042 ], 0.032, 20 );
	parts.box( yellow, [ 0.03, 0.03, 0.03 ], [ 0, height - 0.01, 0 ] );
	parts.box( mat( 0x3c3e42, { roughness: 0.5 } ), [ 0.03, 0.05, 0.03 ], [ 0.03, 1.3, 0 ] );
	parts.cylinder( STEEL(), 0.022, 0.05, [ 0, 1.45, 0 ], 10 );

	// The bipod: two legs from the clamp out behind, left and right.
	for ( const s of [ - 1, 1 ] ) {

		const foot = [ s * 0.45, 0, 0.6 ];
		parts.rod( alu, [ 0, 1.47, 0.015 ], foot, 0.011, 6 );
		parts.rod( RUBBER(), [ foot[ 0 ] * 0.97, 0.03, foot[ 2 ] * 0.97 ], foot, 0.014, 6 );

	}

	return parts.build();

}

// A rotating laser level on an aluminium elevator tripod: the orange body with its roll cage and
// the glass rotor head on top.
function rotatingLaser() {

	const parts = new Parts();
	const head = 1.4;
	tripod( parts, head, 0.55, 0xb9bdc0 );
	const orange = plastic( 0xe8641b );
	const black = plastic( 0x222326 );
	parts.cylinder( black, 0.02, 0.15, [ 0, head - 0.14, 0 ], 10 );
	let y = head + 0.012;
	parts.box( black, [ 0.17, 0.03, 0.17 ], [ 0, y, 0 ] );
	y += 0.03;
	parts.box( orange, [ 0.15, 0.17, 0.15 ], [ 0, y, 0 ] );
	parts.box( mat( 0x23313b, { roughness: 0.15, metalness: 0.3 } ), [ 0.07, 0.05, 0.003 ], [ 0, y + 0.06, - 0.077 ] );
	y += 0.17;
	parts.cylinder( mat( 0x7fa6c4, { roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.7 } ), 0.04, 0.06, [ 0, y, 0 ], 16 );
	parts.cylinder( black, 0.05, 0.02, [ 0, y + 0.06, 0 ], 16 );

	// Roll cage: two hoops over the top.
	for ( const s of [ - 1, 1 ] ) {

		parts.path( black, [ [ s * 0.09, y - 0.17, - 0.09 ], [ s * 0.09, y + 0.11, - 0.09 ], [ s * 0.09, y + 0.11, 0.09 ], [ s * 0.09, y - 0.17, 0.09 ] ], 0.009, 6 );

	}

	return parts.build();

}
