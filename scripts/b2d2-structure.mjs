// Dumper 2's structure put on the Hatch drawings' grid.
//
// source-models/b2d2-site-model.glb (from the Shapr3D model) has the transfer pit 0.5 to 0.9 m
// off the drawings' grid with its two sides swapped (7.77 × 7.47 m for 7.47 × 7.77), its B1 slab
// as one thick plate with the wrong openings, the pit's lid solid, C32 0.64 m off with it, and the
// gallery's cross beams drifting 0.35 to 0.9 m along it. correctStructure() takes the site's
// layers as that file has them and gives them back as the drawings do, in plan:
//
// - the transfer pit, redrawn: walls, floor and sump, the B1 slab with its central opening and
//   two grated openings and beams B1 to B6 under it, and at grade the lid with its three openings,
//   the cross beam, the shed support beam and train support beams 1 and 2 over the pit;
// - the C31 gallery: its walls and floor kept, between the pit and the north end
//   where the drawings have them; at grade the pony walls, slab strips, train support beams 1
//   and 2 and cross beams G1 to G12 redrawn, the steel plates between them, and the north end's
//   lid with its two openings and G13, G14; and under the slab, the downstand along each wall
//   (the gallery's lowest ceiling, as the cross beams' elevations on -ST011 show it);
// - the gallery's hoppers (the two sloped plates under the slot between the rails) taken out of
//   it: they were broken out by 10 November 2026. hopperBays() gives them back bay by bay, G1 to
//   G13, for the timeline to show them until each bay went;
// - C32 moved over to the drawings' line and brought up to the pit's wall;
// - the beams on their own (their own layer and colour, so they can be told from the slabs and
//   walls they carry): train support beams 1 and 2 the length of the pit and the gallery, G1 to
//   G14 across the gallery, the cross beam and the shed support beam under the pit's lid, and B1
//   to B6 under its B1 slab.
//
// Plan dimensions are read off 620-24070-DWG-ST005 (ground floor and basement B1 plans) and
// -ST010 (B1 to B6): the linework of the PDF, to the centimetre. Heights are the model's, which
// the drawings' plans don't give: where a beam is new, its depth is scaled off the beam
// elevations of -ST010 and -ST011 (their grids "have no spatial relationship with other
// drawings", so these are to about 5 cm). The building, conveyors and ground are left alone.
//
// Coordinates are the model's: x = C31 numeric grid, y = elevation, z = minus the letter grid.
// Below, boxes are written [ x0, x1 ], [ letter0, letter1 ], [ el0, el1 ].

import polygonClipping from 'polygon-clipping';
import { ShapeUtils, Vector2 } from 'three';

// ---------- The drawings' dimensions (m) ----------

// The transfer pit, grid 0 to 8: inside and outside faces of its walls.
const PIT = { x: [ 0, 7.47 ], l: [ 0, 7.77 ], outer: { x: [ - 0.53, 8.00 ], l: [ - 0.53, 8.15 ] } };
// The model's heights: under the floor, floor, B1 slab, lid.
const EL = {
	pit: [ - 6.93, - 5.93 ], sump: - 6.82,
	b1: [ - 2.06, - 1.81 ], b1Beams: - 2.41, b3: - 2.63,
	lid: [ 4.62, 5.07 ], crossBeam: 3.42, shedBeam: 4.15,
	rail: [ 4.26, 5.05 ], gBeam: [ 3.19, 4.26 ], gUpstand: 5.03,
	strip: [ 4.06, 4.26 ], pony: [ 4.06, 5.15 ], plate: [ 4.26, 4.27 ],
	endLid: [ 3.66, 5.06 ], endBeams: 3.19,
};
// B1 level: what's open in the slab, and the beams under it.
const B1_OPENINGS = [
	{ x: [ 2.16, 4.42 ], l: [ 3.74, 6.02 ] },
	{ x: [ 0.00, 2.59 ], l: [ 0.00, 1.37 ] },
	{ x: [ 3.58, 6.50 ], l: [ 0.00, 1.37 ] },
];
const B1_BEAMS = {
	B1: { x: [ 1.86, 2.16 ], l: [ 3.74, 6.02 ] },
	B2: { x: [ 0.00, 7.47 ], l: [ 6.02, 6.32 ] },
	B3: { x: [ 4.42, 4.72 ], l: [ 3.74, 7.62 ], to: EL.b3 },
	B4: { x: [ 0.00, 7.47 ], l: [ 3.43, 3.74 ] },
	B5: { x: [ 0.00, 7.47 ], l: [ 1.37, 1.78 ] },
	B6: { x: [ 0.00, 7.47 ], l: [ 7.62, 7.77 ] },
};
// At grade over the pit.
const LID_OPENINGS = [
	{ x: [ 0.00, 3.20 ], l: [ 0.00, 1.22 ] },
	{ x: [ 4.88, 5.79 ], l: [ 0.57, 1.49 ] },
	{ x: [ 0.00, 0.92 ], l: [ 6.71, 7.77 ] },
];
const CROSS_BEAM = { x: [ 4.42, 4.88 ], l: [ 0.00, 7.77 ] };
const SHED_BEAM = { x: [ 0.00, 7.47 ], l: [ 1.64, 2.05 ] };
// Train support beams (the rail beams), the length of the pit and the gallery.
const TRAIN_BEAMS = { 1: [ 5.43, 5.84 ], 2: [ 3.92, 4.33 ] };
// The gallery at grade: where it runs, its pony walls, and the cross beams' south faces (each
// G_WIDTH along the gallery): G1 against the pit, G2 to G12 at 4.445 m, G13 and G14 in the north end.
const GALLERY = { x: [ 8.00, 61.57 ], end: [ 61.57, 68.35 ] };
const PONY = { east: [ 1.64, 1.98 ], west: [ 7.77, 8.12 ] };
const PLATE = 0.6; // steel plates beside the rail beams, across
// The downstand along each of the gallery's walls under the slab at grade, tight against the wall:
// 0.66 m out from its inside face, its underside at EL +1.22, up to the slab. Measured off -ST011's
// cross beam elevations (beam G4's south face, to about 2 cm) on the drawings' own grid, which puts
// the pony walls' tops at EL +3.69 (the drawings' 3.700) and the cross beams' undersides at +1.54.
// The walls' repair areas on -ST007 stop at about +1.2, where it starts. (The model's grade is
// higher than the drawings', by about 1.5 m: its slab and beams are the Shapr3D model's. The
// downstand goes up to them.) The model's walls' inside faces are at letter 2.832 (east) and 7.17
// (west).
const DOWNSTAND = { width: 0.66, el: [ 1.22, 4.26 ], east: 2.832, west: 7.17 };
const G_WIDTH = 0.455;
const G_BEAMS = [ 7.86, 12.45, 16.89, 21.34, 25.78, 30.22, 34.67, 39.12, 43.56, 48.01, 52.45, 56.90, 61.56, 65.03 ];
const G_ACROSS = [ 2.60, 7.20 ]; // into the walls, as the model has them
const END_OPENINGS = [
	{ x: [ 64.12, 65.03 ], l: [ 6.25, 7.32 ] },
	{ x: [ 65.49, 67.97 ], l: [ 6.10, 7.32 ] },
];
// C32's inside faces, as the drawings have them where it meets the pit.
const C32 = { x: [ 0.61, 3.96 ] };

// C32's take-up tower foundation, at grade past the tunnel's mouth: the new concrete pedestals of
// 624-24070-DWG-ST231 (plan) and -ST232 (sections and details), with -ME208's levels. On that set's
// own grid, 1X to 4 along the conveyor (4 nearest the tunnel) and A to C across it, on C32's centre
// line. Distances `d` are from grid 4 toward grid 3 (up the conveyor, away from the tunnel: more
// letter grid here), `a` across from the centre line toward grid A (+x here), levels as the
// drawings give them, on the C32 tunnel's datum: its floor where it comes out (y 3.6 at letter
// 44.5) is the take-up's ground, EL 3.825 at grid 4. (The model's grade over C31 is the Shapr3D
// model's, about 1.3 m higher: GRADE would lift the take-up to it, but then it stands above the
// tunnel's exit.)
//
// Where grid 4 is along C32 the drawings don't say. GRID_4 puts it 4 m past the tunnel's end
// (letter 44.5): there the belt, 6.15 m up at grid 4 on -ME208's Section A, is as high above
// C32's floor (FL in the progress script) as it would be in the tunnel. Change it if it's known.
const TAKE_UP = {
	GRID_4: 48.5,
	GRADE: 0,
	// P1: 450 × 450, top EL 4.237 (-ME208); one 1.70 m up the conveyor from grid 4, one at grid 4,
	// both 0.95 m toward grid B.
	p1: { size: [ 0.45, 0.45 ], top: 4.237, at: [ [ 1.70, - 0.95 ], [ 0, - 0.95 ] ] },
	// P2: 450 along × 550 across, top EL 3.825 (-ST232 Section A): 2.524 m up from grid 4 (1278 +
	// 1246), either side of the centre line at 1.067 m.
	p2: { size: [ 0.45, 0.55 ], top: 3.825, at: [ [ 2.524, 1.067 ], [ 2.524, - 1.067 ] ] },
	// The new sheave anchor pedestal (-ST232 Section A): from 0.222 m past grid 4 to 1.278 m up
	// from it, 1.29 m toward A to 0.20 m toward B; on the existing grade beam (EL 3.38) up to EL
	// 5.325, its top chamfered 200 mm down over the 600 mm at the tunnel end for the belt.
	sheave: { d: [ - 0.222, 1.278 ], a: [ - 0.20, 1.29 ], el: [ 3.38, 5.325 ], chamfer: [ 0.62, 0.2 ] },
	// What's under ground: the small pedestals go down to here.
	base: 2.9,
	// New concrete whose top is level with the ground (the pad, P2) stands this much proud of it
	// in the model, so its pale new concrete shows: level with it, Google's ground (bumpy by a few
	// centimetres) covers it, as it would a laydown area (laydown.js draws those 10 cm up, too).
	SHOW: 0.1,
	// The new tower foundation extension (-ST231 plan, -ST232 Section C): a pad 3.24 m along by
	// 3.13 m across, 1067 thick, its top at EL 3.825 to match the existing concrete, doweled into
	// the counterweight tower's existing foundation; the take-up hoist stands on it.
	pad: { d: [ 3.47, 6.71 ], a: [ - 5.745, - 2.619 ], el: [ 3.825 - 1.067, 3.825 ] },
	// The counterweight tower (-ME208 Sections B and C): 1550 up from grid 4, 1829 + 2060 toward B
	// from the centre line, legs 850 either way along and 600 either way across, from the concrete
	// (EL 3.825) to its top steel (EL 13.355). Drawn as its four legs and the frame at the top.
	tower: { d: 1.55, a: - 3.889, legs: [ 0.85, 0.6 ], el: [ 3.825, 13.355 ], leg: 0.2 },
	// The counterweight, CTWT-624-43 (-ME217): a concrete block 1300 along by 850 across by 3575
	// tall, (10) PL. 13 × 850 × 1300 on it, (2) MC200 across them and sheave assembly type 1 on top
	// (11,080 kg in all). Drawn where -ME208's Section B has it (its block's top at about EL 11.16);
	// it rides up and down the tower with the take-up.
	counterweight: { size: [ 1.3, 0.85 ], el: [ 11.155 - 3.575, 11.155 ], plates: 0.13, channel: [ 0.2, 0.076 ], sheave: 0.35,
		// (4) 1"Ø threaded anchor rods 1360 long, 560 proud of the concrete, through the plates.
		rods: { at: [ [ 0.255, 0.155 ], [ 0.255, - 0.155 ], [ - 0.255, 0.155 ], [ - 0.255, - 0.155 ] ], size: 0.0254, length: 1.36, proud: 0.56 } },
	// The take-up hoist (WCA-624-42, -ME208 Section B), on the pad in line with the tower, 4406
	// from grid 2 (5.5 m up from grid 4): its frame, drum (its axle across) and motor. Its base
	// detail is still to come on the drawings.
	hoist: { d: 5.5, a: - 3.889, frame: [ 1.24, 1.0, 0.15 ], drum: [ 0.3, 0.45 ], motor: [ 0.45, 0.4, 0.6 ] },
	// What's being demolished. The asphalt and the concrete under it broken out where the new
	// foundations go: the two areas marked on -ST231 (13.62 m² round the sheave anchor pedestal,
	// P1 and P2; 10.5 m² over the pad), 75 mm of asphalt over 200 mm of concrete from the ground
	// (EL 3.825) down. Outlines as [ along, across ] from grid 4 and the centre line, off the
	// markups (the plan at 1:40, grid 4 at x 1390.1 pt and the centre line at y 1090.3 pt).
	breakOut: {
		asphalt: 0.075, concrete: 0.2,
		areas: [
			[ [ 1147.7, 1165.3 ], [ 1147.7, 1228.1 ], [ 1195.5, 1227.7 ], [ 1300.1, 1228.3 ], [ 1300.1, 1189.6 ], [ 1401.9, 1190.5 ], [ 1432.5, 1190.1 ], [ 1432.1, 1168.7 ], [ 1432.5, 1008.3 ], [ 1432.5, 980.2 ], [ 1265.8, 979.4 ], [ 1266.7, 954.8 ], [ 1194.9, 955.2 ], [ 1149, 954.8 ] ],
			[ [ 907.1, 681.2 ], [ 1145.5, 681.2 ], [ 1145.5, 903 ], [ 908.2, 903 ] ],
		].map( area => area.map( ( [ x, y ] ) => [ ( 1390.1 - x ) / 70.866, ( y - 1090.3 ) / 70.866 ] ) ),
	},
	// Existing concrete the drawings mark for demolition: the C32 rope and sheave anchor pedestal
	// above the ground (-ST231, -ST232 Section A: from 1.37 to 2.28 m up from grid 4, 1.02 m toward A
	// to 0.20 m toward B, up to about EL 5.0), and the conveyor table pedestals where the new P2s go
	// (their height isn't given: drawn 300 mm up).
	demolish: [
		{ name: 'rope and sheave anchor pedestal', d: [ 1.37, 2.28 ], a: [ - 0.20, 1.02 ], el: [ 3.825, 5.0 ] },
		{ name: 'conveyor table pedestal', d: [ 2.524 - 0.25, 2.524 + 0.25 ], a: [ 1.067 - 0.25, 1.067 + 0.25 ], el: [ 3.825, 4.125 ] },
		{ name: 'conveyor table pedestal', d: [ 2.524 - 0.25, 2.524 + 0.25 ], a: [ - 1.067 - 0.25, - 1.067 + 0.25 ], el: [ 3.825, 4.125 ] },
	],
	// The existing structures round it, as -ME208's Section A and -ST231's plan draw them, on the
	// same grid: grids 3, 2, 1 and 1X are 6.706, 9.906, 16.612 and 19.66 m up from grid 4, rows A1
	// and B 1.829 m either side of the centre line and A 4.424 m toward A.
	grids: { d: { 4: 0, 3: 6.706, 2: 9.906, 1: 16.612, '1X': 19.66 }, a: { A: 4.424, A1: 1.829, B: - 1.829 } },
	// The conveyor: its belt's top 6.03 m up at grid 4 (EL), rising at 13.659° toward the drive,
	// from the tunnel's mouth (4 m short of grid 4) to past grid 1X. The belt's width isn't on these
	// drawings: 1.2 m; its stringers either side under the idlers, its legs on the new P2s.
	conveyor: { el: 6.03, slope: 13.659, from: - 4, to: 21, belt: 1.2, stringers: 0.9, idlers: 1.2, carryDrop: 0.15, returnDrop: 0.75 },
	// Its pulleys (-ME208 Section A): [ along from grid 4, centre EL, radius ].
	pulleys: [
		{ name: 'secondary drive pulley (PUL-624-04)', at: [ 16.612 - 2.286, 8.11, 0.5 ] },
		{ name: 'primary drive pulley (PUL-624-03)', at: [ 16.612 - 4.267, 8.1, 0.5 ] },
		{ name: 'LT bend pulley (PUL-624-06)', at: [ 9.906 + 0.61, 7.64, 0.36 ] },
		{ name: 'take-up pulley (PUL-624-05)', at: [ 6.706 + 1.78, 6.7, 0.4 ] },
	],
	// The take-up pulley carriage's support frame: rails at 15° under it, 1.2 m apart, T.O. steel
	// EL 5.277 and 6.142 where -ME208 marks them.
	carriage: { from: [ 4.0, 4.55 ], to: [ 10.5, 6.3 ], apart: 1.2 },
	// The tower's steel: columns at grids 3 and 2 on rows A, A1 and B (-ST231's plan) up to the
	// take-up frame (EL 9.737), and at grids 1 and 1X on rows A1 and B up to the drive's top steel
	// (EL 12.578), with the drive's platform at EL 7.45 from grid 2 to 1X.
	steel: { column: 0.25, takeUpTop: 9.737, driveTop: 12.578, platform: 7.45 },
	// How it's built (shown stage by stage in the twin): the pits dug for the new concrete, its
	// formwork and its reinforcing. Typical methods, not on the drawings.
	build: {
		// Under the new concrete: 100 mm of lean concrete; round the pad 300 mm to work in and its sides
		// cut back 1:1, except where it meets the existing tower foundation (toward grid 4); the
		// pedestals' pit is the broken-out area, its sides cut straight (inside the slab's edge).
		lean: 0.1, room: 0.3, batter: 1,
		pedestalPit: 2.8,
		// The existing grade beam the sheave anchor pedestal stands on (-ST232 Section A: its top at
		// about EL 3.38), drawn under the pedestal down to the pit's floor.
		gradeBeam: { d: [ - 0.32, 1.38 ], a: [ - 0.3, 1.39 ], el: [ 2.8, 3.38 ] },
		// Braces: on the pad's forms, from the upper waler down onto the cut slope (they bear on it
		// 250 mm above the floor); in the pedestals' pit, short kickers this far out to its floor,
		// left out where one would run into another form or out of the pit.
		kicker: 0.35,
		// Formwork: 19 mm plywood, 38 × 89 studs at 400, two 38 × 140 walers, braces every 1.2 m.
		ply: 0.019, stud: [ 0.038, 0.089 ], studs: 0.4, waler: [ 0.038, 0.14 ], braces: 1.2,
		// Reinforcing, as -ST232 calls it: the pad 20M @ 300 each way top and bottom; the sheave
		// anchor pedestal 25M @ 250 up each face and 20M @ 300 round it; P1 and P2 4-20M with 15M
		// ties; 75 mm cover (50 in the pedestals).
		bars: { pad: [ 0.0195, 0.3 ], vertical: [ 0.0252, 0.25 ], hoops: [ 0.0195, 0.3 ], column: 0.0195, ties: [ 0.016, 0.3 ], cover: 0.075, columnCover: 0.05 },
	},
	// The embedded items: anchor rods, [ along, across ] from where they're set out, `size` their
	// diameter, `embed` into the concrete and `proud` out of it, with a nut on top.
	anchors: [
		// Sheave assembly base plate on the sheave anchor pedestal (-ST231 Detail 1): (6) AR-3/4"-RS-350-125,
		// 200 apart along the sheave's line in two rows 300 apart, the sheave turned 15° in plan.
		{ name: 'sheave', at: [ 0.77, 0.36 ], turn: 15, size: 0.019, embed: 0.35, proud: 0.125,
			rods: [ - 0.2, 0, 0.2 ].flatMap( u => [ [ u, 0.15 ], [ u, - 0.15 ] ] ) },
		// Rope anchor base plate at grid 4 (-ST231 Detail 2): (4) AR-3/4"-RS-350-125, 130 × 100.
		{ name: 'rope anchor', at: [ 0, 0.98 ], size: 0.019, embed: 0.35, proud: 0.125,
			rods: [ [ - 0.065, - 0.05 ], [ - 0.065, 0.05 ], [ 0.065, - 0.05 ], [ 0.065, 0.05 ] ] },
		// The conveyor's legs on P1 and P2 (-ST232 Section A): 2-3/4"Ø A193 B7 HDG anchors each,
		// embedded 200 into the concrete.
		...[ 'p1', 'p2' ].flatMap( key => ( { p1: [ [ 1.70, - 0.95 ], [ 0, - 0.95 ] ], p2: [ [ 2.524, 1.067 ], [ 2.524, - 1.067 ] ] }[ key ] ).map( at => (
			{ name: `conveyor leg (${ key.toUpperCase() })`, at, size: 0.019, embed: 0.2, proud: 0.1, rods: [ [ 0, - 0.1 ], [ 0, 0.1 ] ] } ) ) ),
		// The hoist frame on the pad (-ST232 Section C: post-installed anchors), at its corners.
		{ name: 'hoist frame', at: [ 5.5, - 3.889 ], size: 0.019, embed: 0.2, proud: 0.1,
			rods: [ [ - 0.55, - 0.45 ], [ - 0.55, 0.45 ], [ 0.55, - 0.45 ], [ 0.55, 0.45 ] ] },
	],
};

// ---------- The model's own dimensions, to tell its parts by and to move them from ----------

const WAS = {
	gallery: { x: [ 8.90, 62.60 ], end: [ 62.59, 69.14 ] },
	c32: { x: [ 1.25, 4.60 ], start: 8.75, flat: 9.52 },
	// The pit's opening onto C32 and onto the gallery, in height.
	c32Mouth: [ - 4.35, - 1.61 ], doorway: { l: [ 2.83, 7.17 ], el: [ - 1.81, 1.69 ] },
	sump: { x: [ 5.37, 7.43 ], l: [ 6.61, 7.72 ] },
	endLid: { l: [ 1.89, 8.10 ] }, endBeams: { l: [ 2.50, 7.40 ] },
};

// ---------- Shapes ----------

// Triangles as flat lists of x, y, z. Every face is turned to look out of the concrete, whichever
// way round its corners are given: `out` says which way that is.
class Solid {

	constructor() {

		this.positions = [];

	}

	// A flat face through corners [ x, el, letter ] (three or four, in order round it), looking
	// the way of `out` (a direction, [ x, el, letter ]).
	face( corners, out ) {

		const xyz = ( [ x, el, l ] ) => [ x, el, - l ];
		const [ a, b, c ] = corners.map( xyz );
		const u = b.map( ( v, i ) => v - a[ i ] ), w = c.map( ( v, i ) => v - a[ i ] );
		const n = [ u[ 1 ] * w[ 2 ] - u[ 2 ] * w[ 1 ], u[ 2 ] * w[ 0 ] - u[ 0 ] * w[ 2 ], u[ 0 ] * w[ 1 ] - u[ 1 ] * w[ 0 ] ];
		const o = xyz( out );
		const round = n[ 0 ] * o[ 0 ] + n[ 1 ] * o[ 1 ] + n[ 2 ] * o[ 2 ] < 0 ? [ ...corners ].reverse() : corners;
		const list = round.length === 4 ? [ 0, 1, 2, 0, 2, 3 ] : [ 0, 1, 2 ];
		for ( const i of list ) this.positions.push( ...xyz( round[ i ] ) );

	}

	box( { x, l }, [ e0, e1 ] ) {

		const [ x0, x1 ] = x, [ l0, l1 ] = l;
		this.face( [ [ x0, e1, l0 ], [ x1, e1, l0 ], [ x1, e1, l1 ], [ x0, e1, l1 ] ], [ 0, 1, 0 ] );
		this.face( [ [ x0, e0, l0 ], [ x1, e0, l0 ], [ x1, e0, l1 ], [ x0, e0, l1 ] ], [ 0, - 1, 0 ] );
		this.face( [ [ x0, e0, l0 ], [ x1, e0, l0 ], [ x1, e1, l0 ], [ x0, e1, l0 ] ], [ 0, 0, - 1 ] );
		this.face( [ [ x0, e0, l1 ], [ x1, e0, l1 ], [ x1, e1, l1 ], [ x0, e1, l1 ] ], [ 0, 0, 1 ] );
		this.face( [ [ x0, e0, l0 ], [ x0, e1, l0 ], [ x0, e1, l1 ], [ x0, e0, l1 ] ], [ - 1, 0, 0 ] );
		this.face( [ [ x1, e0, l0 ], [ x1, e1, l0 ], [ x1, e1, l1 ], [ x1, e0, l1 ] ], [ 1, 0, 0 ] );
		return this;

	}

	// A cylinder about `axis` ('x', 'el' or 'l') through c [ x, el, letter ], radius r, half as long
	// as `half` each way, in `n` flat sides.
	cylinder( c, axis, r, half, n = 20 ) {

		const k = { x: 0, el: 1, l: 2 }[ axis ];
		const [ i, j ] = [ 0, 1, 2 ].filter( v => v !== k );
		const at = ( t, along ) => {

			const p = [ ...c ];
			p[ i ] += r * Math.cos( t );
			p[ j ] += r * Math.sin( t );
			p[ k ] += along;
			return p;

		};
		const end = sign => {

			const p = [ ...c ];
			p[ k ] += sign * half;
			return p;

		};
		for ( let m = 0; m < n; m ++ ) {

			const t0 = m / n * Math.PI * 2, t1 = ( m + 1 ) / n * Math.PI * 2, tm = ( t0 + t1 ) / 2;
			const out = [ 0, 0, 0 ];
			out[ i ] = Math.cos( tm );
			out[ j ] = Math.sin( tm );
			this.face( [ at( t0, - half ), at( t1, - half ), at( t1, half ), at( t0, half ) ], out );
			for ( const sign of [ - 1, 1 ] ) {

				const o = [ 0, 0, 0 ];
				o[ k ] = sign;
				this.face( [ end( sign ), at( t0, sign * half ), at( t1, sign * half ) ], o );

			}

		}

		return this;

	}

	// A round bar from p0 to p1 ( [ x, el, letter ] ), radius r, in n flat sides, its ends closed.
	tube( p0, p1, r, n = 8 ) {

		const u = p1.map( ( v, k ) => v - p0[ k ] );
		const len = Math.hypot( ...u );
		if ( len < 1e-6 ) return this;
		const ax = u.map( v => v / len );
		const pick = Math.abs( ax[ 1 ] ) < 0.9 ? [ 0, 1, 0 ] : [ 1, 0, 0 ];
		const cross = ( a, b ) => [ a[ 1 ] * b[ 2 ] - a[ 2 ] * b[ 1 ], a[ 2 ] * b[ 0 ] - a[ 0 ] * b[ 2 ], a[ 0 ] * b[ 1 ] - a[ 1 ] * b[ 0 ] ];
		const norm = a => {

			const l = Math.hypot( ...a );
			return a.map( v => v / l );

		};
		const v = norm( cross( ax, pick ) ), w = cross( ax, v );
		const ring = ( c, t ) => c.map( ( x, k ) => x + r * ( Math.cos( t ) * v[ k ] + Math.sin( t ) * w[ k ] ) );
		for ( let m = 0; m < n; m ++ ) {

			const t0 = m / n * Math.PI * 2, t1 = ( m + 1 ) / n * Math.PI * 2, tm = ( t0 + t1 ) / 2;
			const out = v.map( ( x, k ) => Math.cos( tm ) * x + Math.sin( tm ) * w[ k ] );
			this.face( [ ring( p0, t0 ), ring( p0, t1 ), ring( p1, t1 ), ring( p1, t0 ) ], out );
			this.face( [ p0, ring( p0, t0 ), ring( p0, t1 ) ], ax.map( x => - x ) );
			this.face( [ p1, ring( p1, t0 ), ring( p1, t1 ) ], ax );

		}

		return this;

	}

	// Six faces through eight corners [ x, el, letter ]: the bottom four in order round, then the
	// top four above them. Each face looks away from the middle.
	brick( corners ) {

		const mid = [ 0, 1, 2 ].map( k => corners.reduce( ( s, c ) => s + c[ k ] / 8, 0 ) );
		const faces = [ [ 0, 1, 2, 3 ], [ 4, 5, 6, 7 ], [ 0, 1, 5, 4 ], [ 1, 2, 6, 5 ], [ 2, 3, 7, 6 ], [ 3, 0, 4, 7 ] ];
		for ( const f of faces ) {

			const c = f.map( i => corners[ i ] );
			const centre = [ 0, 1, 2 ].map( k => c.reduce( ( s, p ) => s + p[ k ] / 4, 0 ) );
			this.face( c, centre.map( ( v, k ) => v - mid[ k ] ) );

		}

		return this;

	}

	// A flat-topped solid: the outline [ [ x, letter ], ... ] (in order round it) from el e0 to e1.
	prism( outline, [ e0, e1 ] ) {

		const ring = outline.map( ( [ x, l ] ) => new Vector2( x, l ) );
		if ( ShapeUtils.isClockWise( ring ) ) ring.reverse();
		for ( const [ a, b, c ] of ShapeUtils.triangulateShape( ring, [] ) ) {

			const [ p, q, r ] = [ a, b, c ].map( n => ring[ n ] );
			this.face( [ p, q, r ].map( v => [ v.x, e1, v.y ] ), [ 0, 1, 0 ] );
			this.face( [ p, q, r ].map( v => [ v.x, e0, v.y ] ), [ 0, - 1, 0 ] );

		}

		const mid = ring.reduce( ( m, v ) => m.add( v.clone().divideScalar( ring.length ) ), new Vector2() );
		for ( let i = 0; i < ring.length; i ++ ) {

			const p = ring[ i ], q = ring[ ( i + 1 ) % ring.length ];
			// Away from the middle (the outlines here are near enough convex at each edge).
			const n = new Vector2( q.y - p.y, p.x - q.x );
			if ( n.dot( p.clone().sub( mid ) ) < 0 ) n.negate();
			this.face( [ [ p.x, e0, p.y ], [ q.x, e0, q.y ], [ q.x, e1, q.y ], [ p.x, e1, p.y ] ], [ n.x, 0, n.y ] );

		}

		return this;

	}

	// A plate with openings cut out of it, however they meet its edge. `axis`: what it's thin
	// along ('el': a slab, outline and openings in x and letter; 'x': a wall across the gallery,
	// in letter and el; 'l': a wall along it, in x and el). [ t0, t1 ]: its two faces along that axis.
	plate( axis, [ t0, t1 ], outline, openings = [] ) {

		const rect = ( [ a0, a1 ], [ b0, b1 ] ) => [ [ [ a0, b0 ], [ a1, b0 ], [ a1, b1 ], [ a0, b1 ], [ a0, b0 ] ] ];
		const [ u, v ] = { el: [ 'x', 'l' ], x: [ 'l', 'el' ], l: [ 'x', 'el' ] }[ axis ];
		const left = polygonClipping.difference( rect( outline[ u ], outline[ v ] ), ...openings.map( o => rect( o[ u ], o[ v ] ) ) );
		// A point, or a direction, from ( a, b ) across the plate and t through it: [ x, el, letter ].
		const at = { el: ( a, b, t ) => [ a, t, b ], x: ( a, b, t ) => [ t, b, a ], l: ( a, b, t ) => [ a, b, t ] }[ axis ];
		for ( const polygon of left ) {

			const rings = polygon.map( ring => ring.slice( 0, - 1 ).map( ( [ a, b ] ) => new Vector2( a, b ) ) );
			const [ outer, ...holes ] = rings;
			// The outer ring anticlockwise and holes clockwise, so the concrete is on the left of every edge.
			if ( ShapeUtils.isClockWise( outer ) ) outer.reverse();
			for ( const hole of holes ) if ( ! ShapeUtils.isClockWise( hole ) ) hole.reverse();
			const points = rings.flat();
			for ( const corners of ShapeUtils.triangulateShape( outer, holes ) ) {

				const [ p, q, r ] = corners.map( n => points[ n ] );
				this.face( [ p, q, r ].map( c => at( c.x, c.y, t1 ) ), at( 0, 0, 1 ) );
				this.face( [ p, q, r ].map( c => at( c.x, c.y, t0 ) ), at( 0, 0, - 1 ) );

			}

			// Its edges, round the outside and round each opening: looking away from the concrete.
			for ( const ring of rings ) for ( let i = 0; i < ring.length; i ++ ) {

				const p = ring[ i ], q = ring[ ( i + 1 ) % ring.length ];
				this.face( [ at( p.x, p.y, t0 ), at( q.x, q.y, t0 ), at( q.x, q.y, t1 ), at( p.x, p.y, t1 ) ], at( q.y - p.y, p.x - q.x, 0 ) );

			}

		}

		return this;

	}

	// A part of the model as it is: its triangles, each corner through `move`.
	add( positions, index, triangles, move = p => p ) {

		for ( const t of triangles ) for ( let k = 0; k < 3; k ++ ) {

			const i = index[ t * 3 + k ] * 3;
			this.positions.push( ...move( [ positions[ i ], positions[ i + 1 ], positions[ i + 2 ] ] ) );

		}

		return this;

	}

	// As a layer: corners that meet are one corner, so the twin's copy of it is small.
	layer() {

		const corners = new Map(), positions = [], index = [];
		for ( let i = 0; i < this.positions.length; i += 3 ) {

			const p = this.positions.slice( i, i + 3 ).map( v => Math.round( v * 1e4 ) / 1e4 );
			const key = p.join( ',' );
			if ( ! corners.has( key ) ) {

				corners.set( key, positions.length / 3 );
				positions.push( ...p );

			}

			index.push( corners.get( key ) );

		}

		return { positions: Float32Array.from( positions ), index: Uint32Array.from( index ) };

	}

}

// The parts of a layer: triangles that share corners, with the box each fills. [ { triangles, min, max } ]
function partsOf( { positions, index } ) {

	const ids = new Map(), parent = [];
	const find = a => {

		while ( parent[ a ] !== a ) a = parent[ a ] = parent[ parent[ a ] ];
		return a;

	};
	const corner = i => {

		const key = `${ Math.round( positions[ i * 3 ] * 1000 ) },${ Math.round( positions[ i * 3 + 1 ] * 1000 ) },${ Math.round( positions[ i * 3 + 2 ] * 1000 ) }`;
		if ( ! ids.has( key ) ) {

			ids.set( key, parent.length );
			parent.push( parent.length );

		}

		return ids.get( key );

	};
	for ( let t = 0; t < index.length; t += 3 ) {

		const [ a, b, c ] = [ 0, 1, 2 ].map( k => corner( index[ t + k ] ) );
		parent[ find( a ) ] = find( b );
		parent[ find( b ) ] = find( c );

	}

	const parts = new Map();
	for ( let t = 0; t < index.length; t += 3 ) {

		const root = find( corner( index[ t ] ) );
		if ( ! parts.has( root ) ) parts.set( root, { triangles: [], min: [ Infinity, Infinity, Infinity ], max: [ - Infinity, - Infinity, - Infinity ] } );
		const part = parts.get( root );
		part.triangles.push( t / 3 );
		for ( let k = 0; k < 3; k ++ ) for ( let a = 0; a < 3; a ++ ) {

			const v = positions[ index[ t + k ] * 3 + a ];
			part.min[ a ] = Math.min( part.min[ a ], v );
			part.max[ a ] = Math.max( part.max[ a ], v );

		}

	}

	return [ ...parts.values() ];

}

// From one stretch to another, in proportion.
const stretch = ( [ a0, a1 ], [ b0, b1 ] ) => v => b0 + ( v - a0 ) * ( b1 - b0 ) / ( a1 - a0 );

// ---------- The pit ----------

function pit() {

	const s = new Solid();
	const { x, l, outer } = PIT;
	const walls = [ EL.pit[ 0 ], EL.lid[ 0 ] ];
	// Under the floor, and the floor with the sump let into it.
	s.box( outer, [ EL.pit[ 0 ], EL.sump ] );
	s.plate( 'el', [ EL.sump, EL.pit[ 1 ] ], outer, [ WAS.sump ] );
	// Walls: AA and AJ sides the length of the pit, the ends between them. The AJ side opens onto
	// C32, the north end onto the gallery.
	s.plate( 'l', [ outer.l[ 0 ], l[ 0 ] ], { x: outer.x, el: walls } );
	s.plate( 'l', [ l[ 1 ], outer.l[ 1 ] ], { x: outer.x, el: walls }, [ { x: C32.x, el: WAS.c32Mouth } ] );
	s.plate( 'x', [ outer.x[ 0 ], x[ 0 ] ], { l, el: walls } );
	s.plate( 'x', [ x[ 1 ], outer.x[ 1 ] ], { l, el: walls }, [ WAS.doorway ] );
	// B1: the slab, open in the middle and at two gratings along the AA side (its beams: beams()).
	s.plate( 'el', EL.b1, { x, l }, B1_OPENINGS );
	// At grade: the lid (and what carries it: beams()).
	s.plate( 'el', EL.lid, outer, LID_OPENINGS );
	return s.layer();

}

// ---------- The gallery ----------

function gallery( was ) {

	const s = new Solid();
	const along = stretch( WAS.gallery.x, GALLERY.x ), end = stretch( WAS.gallery.end, GALLERY.end );
	for ( const part of partsOf( was ) ) {

		const north = part.min[ 0 ] > WAS.gallery.end[ 0 ] - 0.1;
		const long = part.max[ 0 ] - part.min[ 0 ] > 40;
		// Kept: the floor and the walls up to their tops, and the north end below its lid. Everything
		// at grade is redrawn below, and the hoppers are gone (hopperBays).
		const keep = north ? part.max[ 1 ] < EL.endLid[ 0 ] : long && ! isHopper( part ) && part.max[ 1 ] < EL.rail[ 0 ] + 0.01 && part.min[ 1 ] < EL.strip[ 0 ] - 1;
		if ( keep ) s.add( was.positions, was.index, part.triangles, ( [ x, y, z ] ) => [ ( north ? end : along )( x ), y, z ] );

	}

	const x = GALLERY.x;
	const [ rail2, rail1 ] = [ TRAIN_BEAMS[ 2 ], TRAIN_BEAMS[ 1 ] ];
	// Pony walls, and the slab strips inside them as far as the steel plates (the rail beams and the
	// cross beams: beams()).
	s.box( { x, l: PONY.east }, EL.pony ).box( { x, l: PONY.west }, EL.pony );
	s.box( { x, l: [ PONY.east[ 1 ], rail2[ 0 ] - PLATE ] }, EL.strip ).box( { x, l: [ rail1[ 1 ] + PLATE, PONY.west[ 0 ] ] }, EL.strip );
	// The downstand along each wall, the length of the gallery.
	s.box( { x, l: [ DOWNSTAND.east, DOWNSTAND.east + DOWNSTAND.width ] }, DOWNSTAND.el );
	s.box( { x, l: [ DOWNSTAND.west - DOWNSTAND.width, DOWNSTAND.west ] }, DOWNSTAND.el );
	// The north end's lid, open twice (G13 and G14 under it: beams()).
	s.plate( 'el', EL.endLid, { x: GALLERY.end, l: WAS.endLid.l }, END_OPENINGS );
	return s.layer();

}

// ---------- The beams ----------

// Every beam the drawings name, as the drawings have them in plan.
function beams() {

	const s = new Solid();
	const [ rail2, rail1 ] = [ TRAIN_BEAMS[ 2 ], TRAIN_BEAMS[ 1 ] ];
	// Train support beams 1 and 2 (the rail beams): over the pit, under its lid, and along the
	// gallery to its north end.
	for ( const across of [ rail2, rail1 ] ) {

		s.box( { x: PIT.x, l: across }, [ EL.rail[ 0 ], EL.lid[ 0 ] ] );
		s.box( { x: GALLERY.x, l: across }, EL.rail );

	}

	// G1 to G12: across the gallery under the rails, into its walls, and up between the rails.
	for ( const g of G_BEAMS.filter( g => g < GALLERY.x[ 1 ] - 1 ) ) {

		const span = [ g, g + G_WIDTH ];
		s.box( { x: span, l: G_ACROSS }, EL.gBeam );
		s.box( { x: span, l: [ rail2[ 1 ], rail1[ 0 ] ] }, [ EL.gBeam[ 1 ], EL.gUpstand ] );

	}

	// G13 and G14, under the north end's lid.
	for ( const g of G_BEAMS.filter( g => g > GALLERY.x[ 1 ] - 1 ) ) s.box( { x: [ Math.max( g, GALLERY.end[ 0 ] ), g + G_WIDTH ], l: WAS.endBeams.l }, [ EL.endBeams, EL.endLid[ 0 ] ] );
	// Under the pit's lid: the cross beam and the shed support beam.
	s.box( CROSS_BEAM, [ EL.crossBeam, EL.lid[ 0 ] ] );
	s.box( SHED_BEAM, [ EL.shedBeam, EL.lid[ 0 ] ] );
	// B1 to B6, under the pit's B1 slab.
	for ( const beam of Object.values( B1_BEAMS ) ) s.box( beam, [ beam.to ?? EL.b1Beams, EL.b1[ 0 ] ] );
	return s.layer();

}

// The hoppers: the gallery's two long sloped plates under the slot between the rail beams, the
// model's only parts the length of the gallery between EL 0.5 and 3.
const HOPPER_EL = [ 0.5, 3 ];
const isHopper = part => part.max[ 0 ] - part.min[ 0 ] > 40 && part.min[ 1 ] > HOPPER_EL[ 0 ] && part.max[ 1 ] < HOPPER_EL[ 1 ];

// The hoppers bay by bay, from the pit to the north end: [ { name, x: [ x0, x1 ], positions, index } ].
// A bay runs from the middle of one cross beam to the middle of the next (G1 against the pit to G13
// at the north end). Each hopper plate is the same all along (a shape drawn out along the gallery),
// so a bay's piece is the plate fitted between the bay's ends.
export function hopperBays( site ) {

	const was = site.c31;
	const plates = partsOf( was ).filter( isHopper );
	if ( plates.length !== 2 ) throw new Error( `expected the gallery's two hopper plates, found ${ plates.length }` );
	for ( const part of plates ) for ( const t of part.triangles ) for ( let k = 0; k < 3; k ++ ) {

		const x = was.positions[ was.index[ t * 3 + k ] * 3 ];
		if ( Math.min( Math.abs( x - part.min[ 0 ] ), Math.abs( x - part.max[ 0 ] ) ) > 0.002 ) throw new Error( 'a hopper plate changes along the gallery: it can\'t be cut into bays this way' );

	}

	const middles = G_BEAMS.filter( g => g > GALLERY.x[ 0 ] && g < GALLERY.x[ 1 ] - 1 ).map( g => g + G_WIDTH / 2 );
	const ends = [ GALLERY.x[ 0 ], ...middles, GALLERY.x[ 1 ] ];
	return ends.slice( 0, - 1 ).map( ( x0, i ) => {

		const x1 = ends[ i + 1 ];
		const s = new Solid();
		for ( const part of plates ) s.add( was.positions, was.index, part.triangles, ( [ x, y, z ] ) => [ x0 + ( x - part.min[ 0 ] ) / ( part.max[ 0 ] - part.min[ 0 ] ) * ( x1 - x0 ), y, z ] );
		return { name: `G${ i + 1 }–G${ i + 2 } bay`, x: [ +x0.toFixed( 3 ), +x1.toFixed( 3 ) ], ...s.layer() };

	} );

}

// Steel plates at grade, beside the rail beams, from one cross beam to the next.
function plates() {

	const s = new Solid();
	const beams = G_BEAMS.filter( g => g < GALLERY.x[ 1 ] );
	for ( let i = 0; i + 1 < beams.length; i ++ ) {

		const x = [ beams[ i ] + G_WIDTH, beams[ i + 1 ] ];
		s.box( { x, l: [ TRAIN_BEAMS[ 2 ][ 0 ] - PLATE, TRAIN_BEAMS[ 2 ][ 0 ] ] }, EL.plate );
		s.box( { x, l: [ TRAIN_BEAMS[ 1 ][ 1 ], TRAIN_BEAMS[ 1 ][ 1 ] + PLATE ] }, EL.plate );

	}

	return s.layer();

}

// ---------- C32 ----------

// Over to the drawings' line, and its first stretch drawn out to the pit's wall where that is now.
function c32( was ) {

	const s = new Solid();
	const over = C32.x[ 0 ] - WAS.c32.x[ 0 ];
	const toPit = stretch( [ WAS.c32.start, WAS.c32.flat ], [ PIT.outer.l[ 1 ], WAS.c32.flat ] );
	s.add( was.positions, was.index, Array.from( { length: was.index.length / 3 }, ( _, i ) => i ), ( [ x, y, z ] ) => [ x + over, y, - z < WAS.c32.flat ? - toPit( - z ) : z ] );
	return s.layer();

}

// ---------- C32's take-up pedestals ----------

function pedestals() {

	const s = new Solid();
	const { GRID_4, GRADE, SHOW, p1, p2, sheave, base } = TAKE_UP;
	const line = ( C32.x[ 0 ] + C32.x[ 1 ] ) / 2;
	for ( const { size: [ along, across ], top, at } of [ p1, p2 ] ) for ( const [ d, a ] of at ) {

		s.box( { x: [ line + a - across / 2, line + a + across / 2 ], l: [ GRID_4 + d - along / 2, GRID_4 + d + along / 2 ] }, [ base + GRADE, top + GRADE + ( top <= 3.825 ? SHOW : 0 ) ] );

	}

	// The pad, and the counterweight's concrete block in its tower.
	const box = ( [ d0, d1 ], [ a0, a1 ], [ e0, e1 ] ) => s.box( { x: [ line + a0, line + a1 ], l: [ GRID_4 + d0, GRID_4 + d1 ] }, [ e0 + GRADE, e1 + GRADE ] );
	const { pad, tower, counterweight: cw } = TAKE_UP;
	box( pad.d, pad.a, [ pad.el[ 0 ], pad.el[ 1 ] + SHOW ] );
	box( [ tower.d - cw.size[ 0 ] / 2, tower.d + cw.size[ 0 ] / 2 ], [ tower.a - cw.size[ 1 ] / 2, tower.a + cw.size[ 1 ] / 2 ], cw.el );

	// The sheave anchor pedestal: its outline along the conveyor ( letter, el ), drawn across it.
	const [ d0, d1 ] = sheave.d, [ e0, e1 ] = sheave.el, [ run, drop ] = sheave.chamfer;
	const outline = [ [ d0, e0 ], [ d1, e0 ], [ d1, e1 ], [ d0 + run, e1 ], [ d0, e1 - drop ] ].map( ( [ d, e ] ) => [ GRID_4 + d, e + GRADE ] );
	const [ x0, x1 ] = sheave.a.map( a => line + a );
	for ( const [ x, out ] of [ [ x0, - 1 ], [ x1, 1 ] ] ) for ( let i = 1; i + 1 < outline.length; i ++ ) {

		s.face( [ outline[ 0 ], outline[ i ], outline[ i + 1 ] ].map( ( [ l, e ] ) => [ x, e, l ] ), [ out, 0, 0 ] );

	}

	for ( let i = 0; i < outline.length; i ++ ) {

		const [ l0, e0_ ] = outline[ i ], [ l1, e1_ ] = outline[ ( i + 1 ) % outline.length ];
		// Out of the outline: to the right of each edge, going round it anticlockwise in ( letter, el ).
		s.face( [ [ x0, e0_, l0 ], [ x1, e0_, l0 ], [ x1, e1_, l1 ], [ x0, e1_, l1 ] ], [ 0, - ( l1 - l0 ), e1_ - e0_ ] );

	}

	return s.layer();

}

// The take-up's steel: the counterweight tower, the counterweight's plates, channels, sheave and
// rods, the hoist, and the anchor rods cast into the concrete, each with its nut.
function takeUpSteel() {

	const s = new Solid();
	const { GRID_4, GRADE, tower, counterweight: cw, hoist, anchors, sheave } = TAKE_UP;
	const line = ( C32.x[ 0 ] + C32.x[ 1 ] ) / 2;
	const box = ( [ d0, d1 ], [ a0, a1 ], [ e0, e1 ] ) => s.box( { x: [ line + a0, line + a1 ], l: [ GRID_4 + d0, GRID_4 + d1 ] }, [ e0 + GRADE, e1 + GRADE ] );
	const around = ( c, half ) => [ c - half, c + half ];
	const P = ( d, a, el ) => [ line + a, el + GRADE, GRID_4 + d ];

	// The tower: four legs, and a frame round their tops.
	const [ ld, la ] = tower.legs, w = tower.leg / 2;
	for ( const sd of [ - 1, 1 ] ) for ( const sa of [ - 1, 1 ] ) box( around( tower.d + sd * ld, w ), around( tower.a + sa * la, w ), tower.el );
	const top = [ tower.el[ 1 ] - 0.2, tower.el[ 1 ] ];
	for ( const sd of [ - 1, 1 ] ) box( around( tower.d + sd * ld, w ), [ tower.a - la - w, tower.a + la + w ], top );
	for ( const sa of [ - 1, 1 ] ) box( [ tower.d - ld - w, tower.d + ld + w ], around( tower.a + sa * la, w ), top );

	// The counterweight's plates, channels and sheave over its concrete.
	const [ cl, ca ] = cw.size, [ e0, e1 ] = cw.el;
	box( around( tower.d, cl / 2 ), around( tower.a, ca / 2 ), [ e1, e1 + cw.plates ] );
	const [ ch, cwid ] = cw.channel, onTop = e1 + cw.plates;
	for ( const sa of [ - 1, 1 ] ) box( around( tower.d, cl / 2 ), around( tower.a + sa * 0.2, cwid / 2 ), [ onTop, onTop + ch ] );
	s.cylinder( P( tower.d, tower.a, onTop + ch + cw.sheave + 0.05 ), 'x', cw.sheave, 0.06 );
	for ( const [ u, v ] of cw.rods.at ) box( around( tower.d + u, cw.rods.size / 2 ), around( tower.a + v, cw.rods.size / 2 ), [ e1 + cw.rods.proud - cw.rods.length, e1 + cw.rods.proud ] );

	// The hoist on the pad: frame, drum (axle across) and motor beside it.
	const [ fl, fa, fh ] = hoist.frame, pad = TAKE_UP.pad.el[ 1 ] + TAKE_UP.SHOW;
	box( around( hoist.d, fl / 2 ), around( hoist.a, fa / 2 ), [ pad, pad + fh ] );
	const [ dr, dh ] = hoist.drum;
	s.cylinder( P( hoist.d - 0.15, hoist.a, pad + fh + dr + 0.1 ), 'x', dr, dh );
	const [ ml, ma, mh ] = hoist.motor;
	box( around( hoist.d + 0.35, ml / 2 ), around( hoist.a, ma / 2 ), [ pad + fh, pad + fh + mh ] );

	// Anchor rods: where the concrete's top is under each, in, out, and a nut. A layer of their own:
	// they're set in the forms before the concrete is poured.
	const embeds = new Solid();
	const rod = ( [ d0, d1 ], [ a0, a1 ], [ e0, e1 ] ) => embeds.box( { x: [ line + a0, line + a1 ], l: [ GRID_4 + d0, GRID_4 + d1 ] }, [ e0 + GRADE, e1 + GRADE ] );
	const sheaveTop = d => {

		const [ d0 ] = sheave.d, [ run, drop ] = sheave.chamfer, e1 = sheave.el[ 1 ];
		return d >= d0 + run ? e1 : e1 - drop + drop * ( d - d0 ) / run;

	};
	const topAt = ( name, d ) => name.startsWith( 'conveyor leg (P1' ) ? TAKE_UP.p1.top
		: name.startsWith( 'conveyor leg (P2' ) ? TAKE_UP.p2.top + TAKE_UP.SHOW
			: name === 'hoist frame' ? pad : sheaveTop( d );
	for ( const { name, at: [ d, a ], turn = 0, size, embed, proud, rods } of anchors ) {

		const t = turn * Math.PI / 180;
		for ( const [ u, v ] of rods ) {

			const rd = d + u * Math.cos( t ) - v * Math.sin( t ), ra = a + u * Math.sin( t ) + v * Math.cos( t );
			const surface = topAt( name, rd );
			rod( around( rd, size / 2 ), around( ra, size / 2 ), [ surface - embed, surface + proud ] );
			rod( around( rd, size * 0.8 ), around( ra, size * 0.8 ), [ surface + proud - 0.06, surface + proud - 0.03 ] );

		}

	}

	return { takeUpSteel: s.layer(), takeUpEmbeds: embeds.layer() };

}

// The existing structures round C32's take-up, with their detail: the conveyor (troughed belt on
// three-roll idlers, return rolls, channel stringers, a walkway with handrails on the A side, its
// legs), the drive (pulleys on shafts in pillow blocks, gearboxes and motors on the drive pulleys),
// the take-up (its carriage on 15° rails, the rope reeved from the hoist over the counterweight
// tower's sheaves and round the counterweight to the take-up sheave), and the steel (wide-flange
// columns and beams, X-bracing, the drive's platform and handrails, the counterweight tower's
// bracing, top sheaves and ladder). Sizes the drawings don't give are typical.
function takeUpSurroundings() {

	const { GRID_4, GRADE, SHOW, grids, conveyor: cv, pulleys, carriage, steel, p1, p2, tower, hoist, pad, counterweight: cw } = TAKE_UP;
	const line = ( C32.x[ 0 ] + C32.x[ 1 ] ) / 2;
	const P = ( d, a, el ) => [ line + a, el + GRADE, GRID_4 + d ];
	const tan = Math.tan( cv.slope * Math.PI / 180 );
	const belt = d => cv.el + d * tan;
	// What stays through the work (the take-up frame and drive tower, the pulleys, the take-up
	// carriage), what's taken out for it and put back (the conveyor), and what's new (the
	// counterweight tower, its ladder and the rope): layers of their own, for the twin's stages.
	const s = new Solid(), yellow = new Solid();
	const conveyor = new Solid(), rubber = new Solid(), walkRails = new Solid();
	const cwtSteel = new Solid(), cage = new Solid(), rope = new Solid();
	const ground = 3.825;
	// A box between two corners ( d, a, el ).
	const box = ( solid, [ d0, a0, e0 ], [ d1, a1, e1 ] ) => solid.box( { x: [ line + Math.min( a0, a1 ), line + Math.max( a0, a1 ) ], l: [ GRID_4 + Math.min( d0, d1 ), GRID_4 + Math.max( d0, d1 ) ] }, [ Math.min( e0, e1 ) + GRADE, Math.max( e0, e1 ) + GRADE ] );
	// Along the conveyor, from d0 to d1: a solid whose cross-section ( a, height over the idlers'
	// line ) is the quad q, following the slope.
	const along = ( solid, [ d0, d1 ], [ q0, q1, q2, q3 ] ) => {

		const at = ( d, [ a, h ] ) => P( d, a, belt( d ) + h );
		solid.brick( [ at( d0, q0 ), at( d1, q0 ), at( d1, q1 ), at( d0, q1 ), at( d0, q3 ), at( d1, q3 ), at( d1, q2 ), at( d0, q2 ) ] );

	};

	// ---- The conveyor ----
	// Heights under the belt's top line ( belt() ): the carrying idlers' centre roll, its wings at
	// 35°, the return roll, the stringers.
	const centre = - 0.25, wing = 0.42, trough = 35 * Math.PI / 180, roll = 0.065, half = 0.2;
	const wingEnd = [ half + wing * Math.cos( trough ), centre + wing * Math.sin( trough ) ];
	const ret = centre - 0.6, stringer = [ 0.72, centre - 0.32, centre - 0.12 ];
	const span = [ cv.from, cv.to ];
	// The belt, troughed over the idlers (its centre and two wings, 12 mm), and returning flat.
	const t = 0.012, on = centre + roll;
	along( rubber, span, [ [ - half, on ], [ half, on ], [ half, on + t ], [ - half, on + t ] ] );
	for ( const sa of [ - 1, 1 ] ) {

		const a0 = sa * half, a1 = sa * ( wingEnd[ 0 ] + 0.02 ), h1 = wingEnd[ 1 ] + roll;
		along( rubber, span, [ [ a0, on ], [ a1, h1 ], [ a1, h1 + t ], [ a0, on + t ] ] );

	}

	along( rubber, span, [ [ - wingEnd[ 0 ], ret + roll ], [ wingEnd[ 0 ], ret + roll ], [ wingEnd[ 0 ], ret + roll + t ], [ - wingEnd[ 0 ], ret + roll + t ] ] );
	// Channel stringers either side: web and flanges.
	for ( const sa of [ - 1, 1 ] ) {

		const a = sa * stringer[ 0 ];
		along( conveyor, span, [ [ a - 0.005, stringer[ 1 ] ], [ a + 0.005, stringer[ 1 ] ], [ a + 0.005, stringer[ 2 ] ], [ a - 0.005, stringer[ 2 ] ] ] );
		for ( const h of [ stringer[ 1 ], stringer[ 2 ] - 0.01 ] ) along( conveyor, span, [ [ a - sa * 0.075, h ], [ a, h ], [ a, h + 0.01 ], [ a - sa * 0.075, h + 0.01 ] ] );

	}

	// Idler sets every `idlers` m: three carrying rolls on a frame across the stringers, and a
	// return roll every other one.
	let k = 0;
	for ( let d = cv.from + 0.6; d < cv.to; d += cv.idlers, k ++ ) {

		const at = ( a, h ) => P( d, a, belt( d ) + h );
		conveyor.tube( at( - half, centre ), at( half, centre ), roll, 10 );
		for ( const sa of [ - 1, 1 ] ) conveyor.tube( at( sa * ( half + 0.02 ), centre + 0.01 ), at( sa * wingEnd[ 0 ], wingEnd[ 1 ] ), roll, 10 );
		box( conveyor, [ d - 0.04, - stringer[ 0 ], belt( d ) + centre - 0.14 ], [ d + 0.04, stringer[ 0 ], belt( d ) + centre - 0.08 ] );
		for ( const sa of [ - 1, 1 ] ) box( conveyor, [ d - 0.03, sa * ( wingEnd[ 0 ] + 0.04 ) - 0.02, belt( d ) + centre - 0.14 ], [ d + 0.03, sa * ( wingEnd[ 0 ] + 0.04 ) + 0.02, belt( d ) + wingEnd[ 1 ] ] );
		if ( k % 2 === 0 ) {

			conveyor.tube( at( - wingEnd[ 0 ], ret ), at( wingEnd[ 0 ], ret ), roll, 10 );
			for ( const sa of [ - 1, 1 ] ) box( conveyor, [ d - 0.02, sa * stringer[ 0 ] - 0.01, belt( d ) + ret - 0.05 ], [ d + 0.02, sa * stringer[ 0 ] + 0.01, belt( d ) + stringer[ 1 ] ] );

		}

	}

	// The walkway on the A side, from past the tunnel's mouth up to the take-up frame: a grating
	// deck, its handrail (posts every 1.5 m, top and mid rails, toe board) on the outer edge.
	const walk = [ cv.from + 1, grids.d[ '2' ] ], deck = [ 0.85, 1.65 ], under = stringer[ 1 ] - 0.05;
	along( conveyor, walk, [ [ deck[ 0 ], under - 0.05 ], [ deck[ 1 ], under - 0.05 ], [ deck[ 1 ], under ], [ deck[ 0 ], under ] ] );
	for ( const a of deck ) along( conveyor, walk, [ [ a - 0.04, under - 0.2 ], [ a + 0.04, under - 0.2 ], [ a + 0.04, under - 0.05 ], [ a - 0.04, under - 0.05 ] ] );
	for ( let d = walk[ 0 ]; d <= walk[ 1 ] + 1e-6; d += 1.5 ) {

		box( conveyor, [ d - 0.04, stringer[ 0 ], belt( d ) + under - 0.17 ], [ d + 0.04, deck[ 1 ], belt( d ) + under - 0.11 ] );
		walkRails.tube( P( d, deck[ 1 ] - 0.03, belt( d ) + under ), P( d, deck[ 1 ] - 0.03, belt( d ) + under + 1.07 ), 0.024, 8 );

	}

	for ( const h of [ 0.53, 1.07 ] ) walkRails.tube( P( walk[ 0 ], deck[ 1 ] - 0.03, belt( walk[ 0 ] ) + under + h ), P( walk[ 1 ], deck[ 1 ] - 0.03, belt( walk[ 1 ] ) + under + h ), 0.021, 8 );
	along( walkRails, walk, [ [ deck[ 1 ] - 0.01, under ], [ deck[ 1 ], under ], [ deck[ 1 ], under + 0.1 ], [ deck[ 1 ] - 0.01, under + 0.1 ] ] );

	// Its legs: on the new P2s and P1s, and bents of two legs and a tie every 3 m from the tunnel's
	// mouth to the take-up frame where nothing else carries it.
	const leg = ( d, a, foot ) => {

		const top = belt( d ) + stringer[ 1 ];
		box( conveyor, [ d - 0.06, a - 0.06, foot ], [ d + 0.06, a + 0.06, top ] );
		box( conveyor, [ d - 0.15, a - 0.15, foot ], [ d + 0.15, a + 0.15, foot + 0.02 ] );

	};
	for ( const [ d, a ] of p2.at ) leg( d, Math.sign( a ) * stringer[ 0 ], p2.top + SHOW );
	for ( const [ d ] of p1.at ) leg( d, - stringer[ 0 ], p1.top );
	for ( const d of [ - 2.5, 4.4 ] ) {

		for ( const sa of [ - 1, 1 ] ) leg( d, sa * stringer[ 0 ], ground + SHOW );
		box( conveyor, [ d - 0.04, - stringer[ 0 ], ground + 1 ], [ d + 0.04, stringer[ 0 ], ground + 1.08 ] );

	}

	// ---- Pulleys and the drive ----
	const shaft = cv.belt / 2 + 0.35;
	for ( const { at: [ d, el, r ] } of pulleys ) {

		s.cylinder( P( d, 0, el ), 'x', r, cv.belt / 2 + 0.05, 24 );
		s.tube( P( d, - shaft, el ), P( d, shaft, el ), 0.07, 12 );
		for ( const sa of [ - 1, 1 ] ) box( s, [ d - 0.15, sa * ( shaft - 0.12 ) - 0.09, el - 0.2 ], [ d + 0.15, sa * ( shaft - 0.12 ) + 0.09, el + 0.08 ] );

	}

	// Gearboxes and motors on the two drive pulleys, on the B side, on the platform.
	for ( const { at: [ d, el ] } of pulleys.slice( 0, 2 ) ) {

		box( s, [ d - 0.4, - shaft - 0.7, el - 0.45 ], [ d + 0.4, - shaft, el + 0.35 ] );
		s.tube( P( d - 0.15, - shaft - 0.35, el - 0.05 ), P( d - 1.15, - shaft - 0.35, el - 0.05 ), 0.25, 16 );
		box( s, [ d - 1.25, - shaft - 0.65, steel.platform ], [ d + 0.45, - shaft - 0.05, el - 0.45 ] );

	}

	// The take-up carriage: side frames either side of the take-up pulley, on the rails.
	const tp = pulleys[ 3 ].at;
	const [ [ f0, e0 ], [ f1, e1 ] ] = [ carriage.from, carriage.to ];
	const rail = d => e0 + ( d - f0 ) * ( e1 - e0 ) / ( f1 - f0 );
	for ( const sa of [ - 1, 1 ] ) {

		const a = sa * carriage.apart / 2;
		s.brick( [ P( f0, a - 0.05, e0 - 0.2 ), P( f1, a - 0.05, e1 - 0.2 ), P( f1, a + 0.05, e1 - 0.2 ), P( f0, a + 0.05, e0 - 0.2 ),
			P( f0, a - 0.05, e0 ), P( f1, a - 0.05, e1 ), P( f1, a + 0.05, e1 ), P( f0, a + 0.05, e0 ) ] );
		box( s, [ tp[ 0 ] - 0.7, sa * ( shaft - 0.05 ) - 0.01, rail( tp[ 0 ] ) ], [ tp[ 0 ] + 0.7, sa * ( shaft - 0.05 ) + 0.01, tp[ 1 ] + 0.15 ] );
		for ( const w of [ - 0.5, 0.5 ] ) s.cylinder( P( tp[ 0 ] + w, a, rail( tp[ 0 ] + w ) + 0.08 ), 'x', 0.08, 0.04, 12 );

	}

	// The rails' supports down to the ground every 2 m.
	for ( let d = f0 + 0.3; d < f1; d += 2 ) for ( const sa of [ - 1, 1 ] ) box( s, [ d - 0.05, sa * carriage.apart / 2 - 0.05, ground + SHOW ], [ d + 0.05, sa * carriage.apart / 2 + 0.05, rail( d ) - 0.2 ] );

	// ---- The tower steel ----
	// A wide-flange column (flanges across the conveyor) and beam (flanges up and down).
	const W = { depth: 0.25, flange: 0.25, tf: 0.016, tw: 0.01 };
	const column = ( d, a, top ) => {

		const [ h, b ] = [ W.depth / 2, W.flange / 2 ];
		for ( const sd of [ - 1, 1 ] ) box( s, [ d + sd * h - ( sd > 0 ? W.tf : 0 ), a - b, ground + SHOW ], [ d + sd * h + ( sd < 0 ? W.tf : 0 ), a + b, top ] );
		box( s, [ d - h, a - W.tw / 2, ground + SHOW ], [ d + h, a + W.tw / 2, top ] );
		box( s, [ d - 0.25, a - 0.25, ground + SHOW ], [ d + 0.25, a + 0.25, ground + SHOW + 0.025 ] );

	};
	const beam = ( [ d0, a0 ], [ d1, a1 ], el ) => {

		const b = W.flange / 2, alongD = Math.abs( d1 - d0 ) > Math.abs( a1 - a0 );
		// Flanges and web, from one end to the other, `lo` to `hi` across the beam's line.
		const part = ( e0, e1, lo, hi ) => alongD
			? box( s, [ Math.min( d0, d1 ), a0 + lo, e0 ], [ Math.max( d0, d1 ), a0 + hi, e1 ] )
			: box( s, [ d0 + lo, Math.min( a0, a1 ), e0 ], [ d0 + hi, Math.max( a0, a1 ), e1 ] );
		part( el - W.tf, el, - b, b );
		part( el - W.depth, el - W.depth + W.tf, - b, b );
		part( el - W.depth, el, - W.tw / 2, W.tw / 2 );

	};
	// X-bracing between two columns' faces, in a bay from el0 to el1.
	const brace = ( [ d0, a0 ], [ d1, a1 ], el0, el1, solid = s ) => {

		solid.tube( P( d0, a0, el0 ), P( d1, a1, el1 ), 0.035, 6 );
		solid.tube( P( d0, a0, el1 ), P( d1, a1, el0 ), 0.035, 6 );

	};
	const { d: gd, a: ga } = grids;
	const frame = ( gs, rows, top ) => {

		for ( const g of gs ) for ( const r of rows ) column( gd[ g ], ga[ r ], top );
		for ( const g of gs ) beam( [ gd[ g ], ga[ rows[ 0 ] ] ], [ gd[ g ], ga[ rows.at( - 1 ) ] ], top );
		for ( const r of rows ) beam( [ gd[ gs[ 0 ] ], ga[ r ] ], [ gd[ gs[ 1 ] ], ga[ r ] ], top );
		// Bracing in the outer rows' bays, along, and across the outer grid lines, in two tiers.
		const mid = ( ground + top ) / 2;
		for ( const r of [ rows[ 0 ], rows.at( - 1 ) ] ) for ( const [ e0, e1 ] of [ [ ground + 0.3, mid ], [ mid, top - 0.3 ] ] ) brace( [ gd[ gs[ 0 ] ], ga[ r ] ], [ gd[ gs[ 1 ] ], ga[ r ] ], e0, e1 );
		for ( const g of gs ) for ( let i = 0; i + 1 < rows.length; i ++ ) brace( [ gd[ g ], ga[ rows[ i ] ] ], [ gd[ g ], ga[ rows[ i + 1 ] ] ], ground + 0.3, mid );

	};
	frame( [ '3', '2' ], [ 'A', 'A1', 'B' ], steel.takeUpTop );
	frame( [ '1', '1X' ], [ 'A1', 'B' ], steel.driveTop );
	// The drive's platform (grating on beams), grid 2 to 1X between rows A1 and B, with handrails.
	box( s, [ gd[ '2' ], ga.B, steel.platform - 0.05 ], [ gd[ '1X' ], ga.A1, steel.platform ] );
	for ( const r of [ 'A1', 'B' ] ) beam( [ gd[ '2' ], ga[ r ] ], [ gd[ '1X' ], ga[ r ] ], steel.platform - 0.05 );
	for ( const sa of [ ga.A1 - 0.05, ga.B + 0.05 ] ) {

		for ( let d = gd[ '2' ]; d <= gd[ '1X' ] + 1e-6; d += ( gd[ '1X' ] - gd[ '2' ] ) / 6 ) yellow.tube( P( d, sa, steel.platform ), P( d, sa, steel.platform + 1.07 ), 0.024, 8 );
		for ( const h of [ 0.53, 1.07 ] ) yellow.tube( P( gd[ '2' ], sa, steel.platform + h ), P( gd[ '1X' ], sa, steel.platform + h ), 0.021, 8 );

	}

	// ---- The counterweight tower: bracing, top sheaves, ladder, the rope ----
	const [ ld, la ] = tower.legs, top = tower.el[ 1 ];
	for ( let e = tower.el[ 0 ] + 0.4; e + 2 < top; e += 2.3 ) {

		for ( const sd of [ - 1, 1 ] ) brace( [ tower.d + sd * ld, tower.a - la ], [ tower.d + sd * ld, tower.a + la ], e, e + 2.3, cwtSteel );
		for ( const sa of [ - 1, 1 ] ) brace( [ tower.d - ld, tower.a + sa * la ], [ tower.d + ld, tower.a + sa * la ], e, e + 2.3, cwtSteel );

	}

	// Two sheaves on the top frame, 710 apart along the conveyor, their axles across.
	const sheaveR = 0.35, topSheaves = [ - 0.355, 0.355 ].map( u => [ tower.d + u, top + sheaveR + 0.05 ] );
	for ( const [ d, el ] of topSheaves ) {

		cwtSteel.cylinder( P( d, tower.a, el ), 'x', sheaveR, 0.06, 24 );
		for ( const sa of [ - 1, 1 ] ) box( cwtSteel, [ d - 0.12, tower.a + sa * 0.14 - 0.02, top ], [ d + 0.12, tower.a + sa * 0.14 + 0.02, el + 0.06 ] );

	}

	// A ladder up the tower's face toward B, from the ground to its top.
	const ladderA = tower.a - la - 0.35;
	for ( const u of [ - 0.22, 0.22 ] ) cwtSteel.tube( P( tower.d + u, ladderA, ground + SHOW ), P( tower.d + u, ladderA, top + 1.0 ), 0.03, 6 );
	for ( let e = ground + 0.3; e < top + 0.9; e += 0.3 ) cwtSteel.tube( P( tower.d - 0.22, ladderA, e ), P( tower.d + 0.22, ladderA, e ), 0.012, 6 );
	for ( let e = ground + 2.4; e < top + 0.9; e += 1.2 ) for ( const [ a0, a1 ] of [ [ ladderA, ladderA - 0.7 ] ] ) {

		cage.tube( P( tower.d - 0.35, a0, e ), P( tower.d - 0.35, a1, e ), 0.015, 6 );
		cage.tube( P( tower.d + 0.35, a0, e ), P( tower.d + 0.35, a1, e ), 0.015, 6 );
		cage.tube( P( tower.d - 0.35, a1, e ), P( tower.d + 0.35, a1, e ), 0.015, 6 );

	}

	// The take-up rope (25 mm): off the hoist's drum, up over the tower's first top sheave, down round
	// the counterweight's sheave, up over the second, down to a sheave at the tower's foot, across
	// to the take-up sheave on the new sheave anchor pedestal, and up the rails to the carriage.
	const ropeR = 0.0125, R = ( d, a, el ) => P( d, a, el );
	const drumTop = [ hoist.d - 0.15, hoist.a, pad.el[ 1 ] + SHOW + hoist.frame[ 2 ] + hoist.drum[ 0 ] * 2 + 0.1 ];
	const [ s1, s2 ] = topSheaves;
	const cwSheave = cw.el[ 1 ] + cw.plates + cw.channel[ 0 ] + cw.sheave + 0.05;
	const foot = [ tower.d - 0.355, tower.a, ground + 0.6 ];
	const takeUpSheave = [ 0.77, 0.36, 5.325 + 0.35 ];
	const path = [
		drumTop,
		[ s2[ 0 ] + sheaveR, tower.a, s2[ 1 ] ],
		[ s2[ 0 ] - sheaveR, tower.a, s2[ 1 ] ],
		[ tower.d + cw.sheave, tower.a, cwSheave ],
		[ tower.d - cw.sheave, tower.a, cwSheave ],
		[ s1[ 0 ] + sheaveR, tower.a, s1[ 1 ] ],
		[ s1[ 0 ] - sheaveR, tower.a, s1[ 1 ] ],
		foot,
		takeUpSheave,
		[ tp[ 0 ] - 0.75, 0, rail( tp[ 0 ] - 0.75 ) + 0.1 ],
	];
	// Over a sheave the rope runs across its top (the pair of points either side); elsewhere straight.
	for ( let i = 0; i + 1 < path.length; i ++ ) rope.tube( R( ...path[ i ] ), R( ...path[ i + 1 ] ), ropeR, 6 );
	cwtSteel.cylinder( P( foot[ 0 ], foot[ 1 ], foot[ 2 ] ), 'x', 0.3, 0.05, 20 );
	cwtSteel.cylinder( P( ...takeUpSheave.slice( 0, 2 ), takeUpSheave[ 2 ] - 0.3 ), 'x', 0.3, 0.05, 20 );
	return {
		takeUpExisting: s.layer(), takeUpRails: yellow.layer(),
		conveyorSteel: conveyor.layer(), conveyorBelt: rubber.layer(), conveyorRails: walkRails.layer(),
		cwtTower: cwtSteel.layer(), cwtCage: cage.layer(), takeUpRope: rope.layer(),
	};

}

// How it's built: the pits (their sides and floors, in the ground's colour, open at the top; the
// twin cuts Google's ground away over them for this stage), the formwork (plywood, studs, walers and
// braces) round the new concrete, and its reinforcing.
function takeUpBuild() {

	const { GRID_4, GRADE, pad, sheave, p1, p2, base, breakOut, build: b } = TAKE_UP;
	const line = ( C32.x[ 0 ] + C32.x[ 1 ] ) / 2;
	const P = ( d, a, el ) => [ line + a, el + GRADE, GRID_4 + d ];
	const ground = 3.825;
	const pits = new Solid(), forms = new Solid(), rebar = new Solid();
	const box = ( solid, [ d0, a0, e0 ], [ d1, a1, e1 ] ) => solid.box( { x: [ line + Math.min( a0, a1 ), line + Math.max( a0, a1 ) ], l: [ GRID_4 + Math.min( d0, d1 ), GRID_4 + Math.max( d0, d1 ) ] }, [ Math.min( e0, e1 ) + GRADE, Math.max( e0, e1 ) + GRADE ] );

	// A pit: its floor `bottom` ( [ d, a ] round it, in order) at el `floor`, its sides up to `top`
	// at the ground, each face looking into the pit.
	const pit = ( bottom, top, floor ) => {

		const c = bottom.reduce( ( m, [ d, a ] ) => [ m[ 0 ] + d / bottom.length, m[ 1 ] + a / bottom.length ], [ 0, 0 ] );
		const ring = bottom.map( ( [ d, a ] ) => new Vector2( line + a, GRID_4 + d ) );
		if ( ShapeUtils.isClockWise( ring ) ) ring.reverse();
		for ( const tri of ShapeUtils.triangulateShape( ring, [] ) ) pits.face( tri.map( n => [ ring[ n ].x, floor + GRADE, ring[ n ].y ] ), [ 0, 1, 0 ] );
		for ( let i = 0; i < bottom.length; i ++ ) {

			const j = ( i + 1 ) % bottom.length;
			const mid = [ ( bottom[ i ][ 0 ] + bottom[ j ][ 0 ] ) / 2, ( bottom[ i ][ 1 ] + bottom[ j ][ 1 ] ) / 2 ];
			const into = P( c[ 0 ] - mid[ 0 ], c[ 1 ] - mid[ 1 ], 0 ).map( ( v, k ) => v - P( 0, 0, 0 )[ k ] );
			pits.face( [ P( ...bottom[ i ], floor ), P( ...bottom[ j ], floor ), P( ...top[ j ], ground ), P( ...top[ i ], ground ) ], into );

		}

	};
	// The pad's pit: room round it, cut back 1:1 except on its side at the existing foundation.
	const floor = pad.el[ 0 ] - b.lean, depth = ground - floor, out = depth * b.batter;
	const [ d0, d1 ] = pad.d, [ a0, a1 ] = pad.a;
	const lo = [ [ d0, a0 - b.room ], [ d1 + b.room, a0 - b.room ], [ d1 + b.room, a1 + b.room ], [ d0, a1 + b.room ] ];
	const hi = [ [ d0, a0 - b.room - out ], [ d1 + b.room + out, a0 - b.room - out ], [ d1 + b.room + out, a1 + b.room + out ], [ d0, a1 + b.room + out ] ];
	pit( lo, hi, floor );
	// The pedestals' pit: the broken-out area, straight down.
	pit( breakOut.areas[ 0 ], breakOut.areas[ 0 ], b.pedestalPit );
	// Lean concrete under the pad.
	box( pits, [ d0, a0, floor ], [ d1, a1, pad.el[ 0 ] ] );
	// The existing grade beam under the sheave anchor pedestal, there at every stage.
	const old = new Solid();
	box( old, [ b.gradeBeam.d[ 0 ], b.gradeBeam.a[ 0 ], b.gradeBeam.el[ 0 ] ], [ b.gradeBeam.d[ 1 ], b.gradeBeam.a[ 1 ], b.gradeBeam.el[ 1 ] ] );

	// ---- Formwork ----
	// A form along one face: plywood from e0 to e1 on the line from p to q ( [ d, a ] ), `outward`
	// the way away from the concrete ( [ dd, da ], unit), studs, two walers and braces to the floor.
	const formFace = ( p, q, e0, e1, outward, braceFoot ) => {

		const [ od, oa ] = outward;
		const off = n => [ od * n, oa * n ];
		const [ pd, pa ] = p, [ qd, qa ] = q;
		const len = Math.hypot( qd - pd, qa - pa );
		const along = [ ( qd - pd ) / len, ( qa - pa ) / len ];
		const corner = ( t, n ) => [ pd + along[ 0 ] * t + off( n )[ 0 ], pa + along[ 1 ] * t + off( n )[ 1 ] ];
		// Plywood.
		box( forms, [ ...corner( - b.ply, 0 ), e0 ], [ ...corner( len + b.ply, b.ply ), e1 + 0.05 ] );
		// Studs.
		for ( let t = 0.1; t < len; t += b.studs ) box( forms, [ ...corner( t - b.stud[ 0 ] / 2, b.ply ), e0 ], [ ...corner( t + b.stud[ 0 ] / 2, b.ply + b.stud[ 1 ] ), e1 + 0.05 ] );
		// Walers, a pair at a third and two-thirds up.
		const outer = b.ply + b.stud[ 1 ];
		for ( const f of [ 1 / 3, 2 / 3 ] ) {

			const e = e0 + ( e1 - e0 ) * f;
			for ( const k of [ 0, 1 ] ) box( forms, [ ...corner( - 0.15, outer + k * b.waler[ 0 ] ), e - b.waler[ 1 ] / 2 ], [ ...corner( len + 0.15, outer + ( k + 1 ) * b.waler[ 0 ] ), e + b.waler[ 1 ] / 2 ] );

		}

		// Braces from the upper waler down to where braceFoot puts their feet (none where it says not),
		// a cleat at each foot.
		const out0 = outer + 2 * b.waler[ 0 ];
		for ( let t = 0.3; t < len; t += b.braces ) {

			const top = [ ...corner( t, out0 ), e0 + ( e1 - e0 ) * 2 / 3 ];
			const foot = braceFoot( t, out0, corner );
			if ( ! foot ) continue;
			forms.tube( P( ...top ), P( ...foot ), 0.035, 4 );
			box( forms, [ foot[ 0 ] - 0.04, foot[ 1 ] - 0.04, foot[ 2 ] - 0.05 ], [ foot[ 0 ] + 0.04, foot[ 1 ] + 0.04, foot[ 2 ] + 0.05 ] );

		}

	};
	// Round a rectangle [ d0, d1 ] × [ a0, a1 ], on the sides listed ( 'd0', 'd1', 'a0', 'a1' ).
	const formBox = ( [ fd0, fd1 ], [ fa0, fa1 ], e0, e1, sides, braceFoot ) => {

		if ( sides.includes( 'd0' ) ) formFace( [ fd0, fa1 ], [ fd0, fa0 ], e0, e1, [ - 1, 0 ], braceFoot );
		if ( sides.includes( 'd1' ) ) formFace( [ fd1, fa0 ], [ fd1, fa1 ], e0, e1, [ 1, 0 ], braceFoot );
		if ( sides.includes( 'a0' ) ) formFace( [ fd0, fa0 ], [ fd1, fa0 ], e0, e1, [ 0, - 1 ], braceFoot );
		if ( sides.includes( 'a1' ) ) formFace( [ fd1, fa1 ], [ fd0, fa1 ], e0, e1, [ 0, 1 ], braceFoot );

	};
	// The pad, on its three open sides (the fourth is against the existing foundation): braced onto
	// the cut slope, 250 mm up it, inside the pit.
	const onSlope = ( t, out0, corner ) => {

		const up = 0.25, x = b.room + up / b.batter;
		return x > out0 + 0.05 ? [ ...corner( t, x ), floor + up ] : null;

	};
	formBox( pad.d, pad.a, pad.el[ 0 ], pad.el[ 1 ], [ 'd1', 'a0', 'a1' ], onSlope );
	// The pedestals' pit: the sheave anchor pedestal formed all round on the grade beam, kickers to
	// the pit's floor where they clear P1's and P2's forms and stay in the pit.
	const inPit = ( [ d, a ], margin ) => {

		const poly = breakOut.areas[ 0 ];
		let inside = false;
		for ( let i = 0, j = poly.length - 1; i < poly.length; j = i ++ ) {

			const [ di, ai ] = poly[ i ], [ dj, aj ] = poly[ j ];
			if ( ( ai > a ) !== ( aj > a ) && d < ( dj - di ) * ( a - ai ) / ( aj - ai ) + di ) inside = ! inside;

		}

		if ( ! inside ) return false;
		for ( let i = 0, j = poly.length - 1; i < poly.length; j = i ++ ) {

			const [ di, ai ] = poly[ i ], [ dj, aj ] = poly[ j ];
			const len = Math.hypot( dj - di, aj - ai ) || 1;
			const u = Math.max( 0, Math.min( 1, ( ( d - di ) * ( dj - di ) + ( a - ai ) * ( aj - ai ) ) / ( len * len ) ) );
			if ( Math.hypot( d - di - u * ( dj - di ), a - ai - u * ( aj - ai ) ) < margin ) return false;

		}

		return true;

	};
	const columns = [ p1, p2 ].flatMap( ( { size: [ al, ac ], at } ) => at.map( ( [ d, a ] ) => [ d - al / 2 - 0.12, d + al / 2 + 0.12, a - ac / 2 - 0.12, a + ac / 2 + 0.12 ] ) );
	const clear = ( [ d, a ] ) => inPit( [ d, a ], 0.08 ) && ! columns.some( ( [ cd0, cd1, ca0, ca1 ] ) => d > cd0 && d < cd1 && a > ca0 && a < ca1 );
	const kicker = ( t, out0, corner ) => {

		const foot = corner( t, out0 + b.kicker );
		for ( let f = 0; f <= 1.0001; f += 0.1 ) if ( ! clear( corner( t, out0 + b.kicker * f ) ) ) return null;
		return [ ...foot, b.pedestalPit ];

	};
	formBox( sheave.d, sheave.a, sheave.el[ 0 ], sheave.el[ 1 ], [ 'd0', 'd1', 'a0', 'a1' ], kicker );
	// P1 and P2: plywood boxes with steel column clamps every 400.
	for ( const { size: [ al, ac ], top, at } of [ p1, p2 ] ) for ( const [ d, a ] of at ) {

		const [ cd0, cd1, ca0, ca1 ] = [ d - al / 2, d + al / 2, a - ac / 2, a + ac / 2 ];
		box( forms, [ cd0 - b.ply, ca0 - b.ply, base ], [ cd1 + b.ply, ca0, top + 0.05 ] );
		box( forms, [ cd0 - b.ply, ca1, base ], [ cd1 + b.ply, ca1 + b.ply, top + 0.05 ] );
		box( forms, [ cd0 - b.ply, ca0, base ], [ cd0, ca1, top + 0.05 ] );
		box( forms, [ cd1, ca0, base ], [ cd1 + b.ply, ca1, top + 0.05 ] );
		for ( let e = base + 0.2; e < top; e += 0.4 ) {

			const g = b.ply + 0.05;
			box( forms, [ cd0 - g, ca0 - g, e ], [ cd1 + g, ca0 - g + 0.05, e + 0.06 ] );
			box( forms, [ cd0 - g, ca1 + g - 0.05, e ], [ cd1 + g, ca1 + g, e + 0.06 ] );

		}

	}

	// ---- Reinforcing ----
	const bar = ( p, q, r ) => rebar.tube( P( ...p ), P( ...q ), r / 2, 6 );
	// The pad: a mat top and bottom, each way.
	{

		const [ r, at ] = b.bars.pad, c = b.cover;
		for ( const e of [ pad.el[ 0 ] + c, pad.el[ 1 ] - c ] ) {

			for ( let d = d0 + c; d <= d1 - c + 1e-6; d += at ) bar( [ d, a0 + c, e ], [ d, a1 - c, e ], r );
			for ( let a = a0 + c; a <= a1 - c + 1e-6; a += at ) bar( [ d0 + c, a, e + r ], [ d1 - c, a, e + r ], r );

		}

		// Dowels into the existing foundation, 20M @ 300 top and bottom, 800 in and 300 out of it.
		for ( let a = a0 + c; a <= a1 - c + 1e-6; a += at ) for ( const e of [ pad.el[ 0 ] + c, pad.el[ 1 ] - c ] ) bar( [ d0 - 0.3, a, e + r * 2 ], [ d0 + 0.8, a, e + r * 2 ], r );

	}

	// The sheave anchor pedestal: bars up each face, hoops round them.
	{

		const c = b.bars.columnCover, [ rv, sv ] = b.bars.vertical, [ rh, sh ] = b.bars.hoops;
		const [ sd0, sd1 ] = sheave.d, [ sa0, sa1 ] = sheave.a, [ se0, se1 ] = sheave.el;
		const top = se1 - c - 0.2;
		for ( let d = sd0 + c; d <= sd1 - c + 1e-6; d += sv ) for ( const a of [ sa0 + c, sa1 - c ] ) bar( [ d, a, se0 + c ], [ d, a, top ], rv );
		for ( let a = sa0 + c + sv; a < sa1 - c - 1e-6; a += sv ) for ( const d of [ sd0 + c, sd1 - c ] ) bar( [ d, a, se0 + c ], [ d, a, top ], rv );
		for ( let e = se0 + c + 0.1; e <= top; e += sh ) {

			const cr = [ [ sd0 + c, sa0 + c ], [ sd1 - c, sa0 + c ], [ sd1 - c, sa1 - c ], [ sd0 + c, sa1 - c ] ];
			for ( let i = 0; i < 4; i ++ ) bar( [ ...cr[ i ], e ], [ ...cr[ ( i + 1 ) % 4 ], e ], rh );

		}

	}

	// P1 and P2: four bars in the corners, ties round them.
	for ( const { size: [ al, ac ], top, at } of [ p1, p2 ] ) for ( const [ d, a ] of at ) {

		const c = b.bars.columnCover, [ rt, st ] = b.bars.ties;
		const cr = [ [ d - al / 2 + c, a - ac / 2 + c ], [ d + al / 2 - c, a - ac / 2 + c ], [ d + al / 2 - c, a + ac / 2 - c ], [ d - al / 2 + c, a + ac / 2 - c ] ];
		for ( const p of cr ) bar( [ ...p, base + c ], [ ...p, top - c ], b.bars.column );
		for ( let e = base + c + 0.05; e <= top - c; e += st ) for ( let i = 0; i < 4; i ++ ) bar( [ ...cr[ i ], e ], [ ...cr[ ( i + 1 ) % 4 ], e ], rt );

	}

	return { takeUpPits: pits.layer(), takeUpForms: forms.layer(), takeUpRebar: rebar.layer(), takeUpOldConcrete: old.layer() };

}

// What's being demolished, as two layers: the asphalt, and the concrete (the slab under the asphalt
// and the existing pedestals). Like the new concrete level with the ground, drawn SHOW up so they
// show over Google's ground, the asphalt just over the new pad's top.
function demolition() {

	const { GRID_4, GRADE, SHOW, breakOut, demolish } = TAKE_UP;
	const line = ( C32.x[ 0 ] + C32.x[ 1 ] ) / 2;
	const ground = 3.825 + GRADE + SHOW + 0.01;
	const plan = area => area.map( ( [ d, a ] ) => [ line + a, GRID_4 + d ] );
	const asphalt = new Solid(), concrete = new Solid();
	for ( const area of breakOut.areas ) {

		asphalt.prism( plan( area ), [ ground - breakOut.asphalt, ground ] );
		concrete.prism( plan( area ), [ ground - breakOut.asphalt - breakOut.concrete, ground - breakOut.asphalt ] );

	}

	for ( const { d: [ d0, d1 ], a: [ a0, a1 ], el: [ e0, e1 ] } of demolish ) concrete.box( { x: [ line + a0, line + a1 ], l: [ GRID_4 + d0, GRID_4 + d1 ] }, [ e0 + GRADE + SHOW + 0.01, e1 + GRADE ] );
	return { demoAsphalt: asphalt.layer(), demoConcrete: concrete.layer() };

}

// The site's layers ({ key: { positions, index } }, keys c31, pit, c32, steel and the rest) with
// the structure put on the drawings' grid, and the beams as a layer of their own (beams).
export function correctStructure( site ) {

	return { ...site, pit: pit(), c31: gallery( site.c31 ), beams: beams(), steel: plates(), c32: c32( site.c32 ), pedestals: pedestals(), ...takeUpSteel(), ...demolition(), ...takeUpSurroundings(), ...takeUpBuild() };

}

// Where the views of the model look from, which move with it.
export const C32_LINE = ( C32.x[ 0 ] + C32.x[ 1 ] ) / 2;
export const C32_INSIDE = C32.x;
export const PIT_INSIDE = PIT;
export const C32_TAKE_UP = { ...TAKE_UP, line: ( C32.x[ 0 ] + C32.x[ 1 ] ) / 2 };
export const C31_DOWNSTAND = { ...DOWNSTAND, x: GALLERY.x };
