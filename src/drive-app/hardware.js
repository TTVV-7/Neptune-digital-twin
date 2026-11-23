import {
	BoxGeometry,
	CanvasTexture,
	ConeGeometry,
	CylinderGeometry,
	DoubleSide,
	Group,
	Mesh,
	MeshStandardMaterial,
	PlaneGeometry,
	RepeatWrapping,
	SphereGeometry,
	SRGBColorSpace,
	TorusGeometry,
} from 'three';

// Hardware left on the Moon (and, to come, Mars), built in code at its real size in metres (as
// procedural.js builds the site pieces): each builder returns a Group standing on y = 0 with its
// front facing -Z. Simplified, recognisable shapes from photographs and published dimensions, not
// engineering models: no downloads and no licences to track. HARDWARE lists them with where they are.

// --- materials -------------------------------------------------------------------------------------

// Crinkled foil: a canvas of soft blotches so the light breaks up as it does on the real thing.
export function foilTexture( base, light, dark ) {

	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = 128;
	const ctx = canvas.getContext( '2d' );
	ctx.fillStyle = base;
	ctx.fillRect( 0, 0, 128, 128 );
	let seed = 7;
	const random = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;
	for ( let i = 0; i < 90; i ++ ) {

		ctx.fillStyle = random() < 0.5 ? light : dark;
		ctx.globalAlpha = 0.25 + random() * 0.35;
		ctx.beginPath();
		const x = random() * 128;
		const y = random() * 128;
		ctx.moveTo( x, y );
		for ( let k = 0; k < 4; k ++ ) ctx.lineTo( x + ( random() - 0.5 ) * 40, y + ( random() - 0.5 ) * 40 );
		ctx.fill();

	}

	const texture = new CanvasTexture( canvas );
	texture.colorSpace = SRGBColorSpace;
	texture.wrapS = texture.wrapT = RepeatWrapping;
	return texture;

}

// Solar cells: dark blue in a fine grid.
function cellsTexture() {

	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = 128;
	const ctx = canvas.getContext( '2d' );
	ctx.fillStyle = '#16224a';
	ctx.fillRect( 0, 0, 128, 128 );
	ctx.strokeStyle = '#7d8bb8';
	ctx.lineWidth = 1;
	for ( let i = 0; i <= 128; i += 16 ) {

		ctx.beginPath();
		ctx.moveTo( i, 0 );
		ctx.lineTo( i, 128 );
		ctx.moveTo( 0, i );
		ctx.lineTo( 128, i );
		ctx.stroke();

	}

	const texture = new CanvasTexture( canvas );
	texture.colorSpace = SRGBColorSpace;
	texture.wrapS = texture.wrapT = RepeatWrapping;
	return texture;

}

let shared = null;
export function materials() {

	if ( shared ) return shared;
	shared = {
		// Low metalness: the worlds have no reflections to show (no environment map), and fully
		// metallic surfaces would read as black. The foil's sheen comes from its texture.
		gold: new MeshStandardMaterial( { color: 0xffffff, map: foilTexture( '#d4a63a', '#ffe08a', '#8a6518' ), metalness: 0.25, roughness: 0.45 } ),
		amber: new MeshStandardMaterial( { color: 0xffffff, map: foilTexture( '#c47a24', '#f2b25a', '#6e400c' ), metalness: 0.25, roughness: 0.45 } ),
		black: new MeshStandardMaterial( { color: 0x2a2b30, metalness: 0.1, roughness: 0.7 } ),
		silver: new MeshStandardMaterial( { color: 0xc9cdd4, metalness: 0.2, roughness: 0.4 } ),
		white: new MeshStandardMaterial( { color: 0xe9e9e4, metalness: 0, roughness: 0.7 } ),
		grey: new MeshStandardMaterial( { color: 0x7c8088, metalness: 0.2, roughness: 0.55 } ),
		cells: new MeshStandardMaterial( { color: 0xffffff, map: cellsTexture(), metalness: 0.1, roughness: 0.3, side: DoubleSide } ),
		mesh: new MeshStandardMaterial( { color: 0xaab0b8, metalness: 0.2, roughness: 0.5, wireframe: true } ),
	};
	return shared;

}

// --- helpers ---------------------------------------------------------------------------------------

export function box( w, h, d, material, x = 0, y = 0, z = 0 ) {

	const mesh = new Mesh( new BoxGeometry( w, h, d ), material );
	mesh.position.set( x, y, z );
	return mesh;

}

export function cylinder( rTop, rBottom, h, material, sides = 16 ) {

	return new Mesh( new CylinderGeometry( rTop, rBottom, h, sides ), material );

}

// A strut from point a to point b ([x, y, z]), radius r.
export function strut( a, b, r, material ) {

	const dx = b[ 0 ] - a[ 0 ];
	const dy = b[ 1 ] - a[ 1 ];
	const dz = b[ 2 ] - a[ 2 ];
	const length = Math.hypot( dx, dy, dz );
	const mesh = cylinder( r, r, length, material, 8 );
	mesh.position.set( ( a[ 0 ] + b[ 0 ] ) / 2, ( a[ 1 ] + b[ 1 ] ) / 2, ( a[ 2 ] + b[ 2 ] ) / 2 );
	mesh.lookAt( b[ 0 ], b[ 1 ], b[ 2 ] );
	mesh.rotateX( Math.PI / 2 );
	return mesh;

}

// A landing leg: a main strut from the body's corner out and down to a round pad, with two braces.
export function leg( group, corner, foot, padRadius, m ) {

	group.add( strut( corner, foot, 0.06, m.gold ) );
	const pad = cylinder( padRadius, padRadius * 0.9, 0.12, m.silver, 20 );
	pad.position.set( foot[ 0 ], 0.06, foot[ 2 ] );
	group.add( pad );
	const side = Math.hypot( corner[ 0 ], corner[ 2 ] ) || 1;
	for ( const turn of [ - 1, 1 ] ) {

		const along = [ - corner[ 2 ] / side * turn * 0.7, 0, corner[ 0 ] / side * turn * 0.7 ];
		const brace = [ corner[ 0 ] * 0.75 + along[ 0 ], corner[ 1 ] - 0.3, corner[ 2 ] * 0.75 + along[ 2 ] ];
		const mid = [ ( corner[ 0 ] + foot[ 0 ] ) / 2, ( corner[ 1 ] + foot[ 1 ] ) / 2, ( corner[ 2 ] + foot[ 2 ] ) / 2 ];
		group.add( strut( brace, mid, 0.035, m.silver ) );

	}

}

// A wheel of radius r and width w, its axle along X, centred at (x, r, z).
export function wheel( r, w, material, x, z, spokes = false ) {

	const tyre = cylinder( r, r, w, material, 18 );
	tyre.rotation.z = Math.PI / 2;
	tyre.position.set( x, r, z );
	if ( ! spokes ) return tyre;
	const group = new Group();
	group.add( tyre );
	const hub = cylinder( r * 0.3, r * 0.3, w * 1.1, materials().grey, 10 );
	hub.rotation.z = Math.PI / 2;
	hub.position.set( x, r, z );
	group.add( hub );
	return group;

}

// A flat solar panel w × h, its cells facing +Y, centred at the origin.
export function panel( w, d, m ) {

	const group = new Group();
	const cells = new Mesh( new PlaneGeometry( w, d ), m.cells );
	cells.rotation.x = - Math.PI / 2;
	cells.position.y = 0.011;
	group.add( cells, box( w, 0.02, d, m.silver ) );
	return group;

}

// A flag on a pole with a crossbar along its top (as the Apollo flags had, so they'd show without
// air), `w` × `h` metres, drawn by `paint( ctx, width, height )`.
export function flag( paint, { w = 1.52, h = 0.91, pole = 2.3 } = {} ) {

	const m = materials();
	const group = new Group();
	const staff = cylinder( 0.019, 0.019, pole, m.silver, 8 );
	staff.position.y = pole / 2;
	const bar = cylinder( 0.012, 0.012, w, m.silver, 8 );
	bar.rotation.z = Math.PI / 2;
	bar.position.set( w / 2, pole - 0.02, 0 );
	const canvas = document.createElement( 'canvas' );
	canvas.width = 380;
	canvas.height = 200;
	paint( canvas.getContext( '2d' ), canvas.width, canvas.height );
	const texture = new CanvasTexture( canvas );
	texture.colorSpace = SRGBColorSpace;
	const cloth = new Mesh( new PlaneGeometry( w, h, 12, 4 ), new MeshStandardMaterial( { map: texture, side: DoubleSide, roughness: 0.9 } ) );
	// A gentle ripple, as the folds the Apollo flags kept from being packed.
	const position = cloth.geometry.attributes.position;
	for ( let i = 0; i < position.count; i ++ ) position.setZ( i, Math.sin( ( position.getX( i ) + w / 2 ) * 5 ) * 0.04 );
	cloth.geometry.computeVertexNormals();
	cloth.position.set( w / 2, pole - h / 2 - 0.03, 0 );
	group.add( staff, bar, cloth );
	return group;

}

function paintUsFlag( ctx, w, h ) {

	for ( let i = 0; i < 13; i ++ ) {

		ctx.fillStyle = i % 2 ? '#ffffff' : '#b22234';
		ctx.fillRect( 0, i * h / 13, w, h / 13 + 1 );

	}

	ctx.fillStyle = '#3c3b6e';
	ctx.fillRect( 0, 0, w * 0.4, h * 7 / 13 );
	ctx.fillStyle = '#ffffff';
	for ( let row = 0; row < 9; row ++ ) for ( let col = 0; col < ( row % 2 ? 5 : 6 ); col ++ ) {

		ctx.beginPath();
		ctx.arc( ( col + ( row % 2 ? 1 : 0.5 ) ) * w * 0.4 / 6, ( row + 0.5 ) * h * 7 / 13 / 9, 3, 0, Math.PI * 2 );
		ctx.fill();

	}

}

// --- the hardware ----------------------------------------------------------------------------------

// Apollo Lunar Module descent stage, as every Apollo crew left it (the ascent stage flew back up): an
// eight-sided body about 4.2 m across in gold and black foil, four legs reaching 9.4 m across the pads,
// the ladder on the front leg down to its porch, the engine bell under it. 3.2 m to the top deck.
export function apolloDescentStage() {

	const m = materials();
	const group = new Group();
	const body = cylinder( 2.1, 2.1, 1.65, m.amber, 8 );
	body.rotation.y = Math.PI / 8;
	body.position.y = 2.3;
	const deck = cylinder( 2.05, 2.05, 0.06, m.silver, 8 );
	deck.rotation.y = Math.PI / 8;
	deck.position.y = 3.15;
	const skirt = cylinder( 1.9, 1.9, 0.25, m.black, 8 );
	skirt.rotation.y = Math.PI / 8;
	skirt.position.y = 1.36;
	const bell = cylinder( 0.35, 0.75, 0.9, m.grey, 20 );
	bell.position.y = 0.85;
	group.add( body, deck, skirt, bell );
	// Four legs on the diagonals.
	for ( const [ sx, sz ] of [ [ 1, 1 ], [ 1, - 1 ], [ - 1, 1 ], [ - 1, - 1 ] ] ) {

		const r = Math.SQRT1_2;
		leg( group, [ sx * 1.85 * r, 2.4, sz * 1.85 * r ], [ sx * 4.7 * r, 0.12, sz * 4.7 * r ], 0.47, m );

	}

	// The ladder down the front-left leg (along its strut) to the porch, as in the photographs.
	const top = [ - 1.85 * Math.SQRT1_2, 2.6, - 1.85 * Math.SQRT1_2 ];
	const foot = [ - 3.9 * Math.SQRT1_2, 0.5, - 3.9 * Math.SQRT1_2 ];
	for ( const off of [ - 0.25, 0.25 ] ) {

		const ox = off * Math.SQRT1_2;
		group.add( strut( [ top[ 0 ] + ox, top[ 1 ], top[ 2 ] - ox ], [ foot[ 0 ] + ox, foot[ 1 ], foot[ 2 ] - ox ], 0.025, m.silver ) );

	}

	for ( let i = 1; i < 9; i ++ ) {

		const t = i / 9;
		const at = [ top[ 0 ] + ( foot[ 0 ] - top[ 0 ] ) * t, top[ 1 ] + ( foot[ 1 ] - top[ 1 ] ) * t, top[ 2 ] + ( foot[ 2 ] - top[ 2 ] ) * t ];
		group.add( strut( [ at[ 0 ] - 0.18, at[ 1 ], at[ 2 ] + 0.18 ], [ at[ 0 ] + 0.18, at[ 1 ], at[ 2 ] - 0.18 ], 0.018, m.silver ) );

	}

	// The plaque on that leg: "Here men from the planet Earth first set foot upon the Moon".
	const plaque = box( 0.23, 0.19, 0.01, m.silver );
	plaque.position.set( - 1.6, 2.0, - 1.6 );
	plaque.rotation.y = Math.PI / 4;
	group.add( plaque );
	return group;

}

// The Apollo 11 site: the descent stage, the flag where it was planted (it was blown over as the
// ascent stage lifted off, and every Apollo flag still standing has been bleached white since), the
// seismometer and the laser reflector, still used to measure the Moon's distance.
export function apollo11Site() {

	const m = materials();
	const group = new Group();
	group.add( apolloDescentStage() );
	const stars = flag( paintUsFlag );
	stars.position.set( - 2.5, 0, - 7 );
	stars.rotation.y = 0.5;
	group.add( stars );
	// The laser ranging reflector: a tilted panel of retroreflectors on legs.
	const reflector = box( 0.46, 0.05, 0.46, m.black );
	reflector.position.set( 3, 0.45, - 13 );
	reflector.rotation.x = - 0.4;
	group.add( reflector, strut( [ 3, 0, - 12.85 ], [ 3, 0.45, - 13 ], 0.015, m.silver ) );
	// The seismometer: a small box between two solar wings.
	const seismo = box( 0.5, 0.45, 0.5, m.gold, 4.5, 0.22, - 11 );
	const left = panel( 0.9, 0.6, m );
	left.position.set( 3.75, 0.4, - 11 );
	const right = panel( 0.9, 0.6, m );
	right.position.set( 5.25, 0.4, - 11 );
	group.add( seismo, left, right );
	return group;

}

// Lunokhod 1 (Luna 17, 1970), the first rover on another world: a tub on eight mesh wheels, about
// 2.2 m long and 1.6 m wide, under a round lid that opened up as its solar panel, with its antennas
// and the laser reflector on its nose, which scientists still bounce lasers off.
export function lunokhod() {

	const m = materials();
	const group = new Group();
	// The tub: wider at the top, silver.
	const tub = cylinder( 1.05, 0.85, 0.65, m.silver, 24 );
	tub.scale.set( 1, 1, 1.25 );
	tub.position.y = 0.95;
	group.add( tub );
	// The top of the tub, and the lid opened back on its hinge at the rear like a clam: solar cells
	// on its inside, facing forward and up.
	const top = cylinder( 1.03, 1.03, 0.04, m.grey, 24 );
	top.scale.set( 1, 1, 1.25 );
	top.position.y = 1.28;
	group.add( top );
	const hinge = new Group();
	hinge.position.set( 0, 1.3, 1.25 );
	const lid = new Group();
	const shell = new Mesh( new SphereGeometry( 1.07, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2.6 ), m.silver );
	shell.scale.set( 1, 0.35, 1.25 );
	const cells = new Mesh( new CylinderGeometry( 1.02, 1.02, 0.02, 24 ), m.cells );
	cells.scale.set( 1, 1, 1.25 );
	lid.add( shell, cells );
	// The lid's middle is a lid's length in front of the hinge; opened past upright, it leans back.
	lid.position.z = - 1.25;
	hinge.add( lid );
	hinge.rotation.x = 1.75;
	group.add( hinge );
	// Eight wheels, four a side, on a frame.
	for ( const x of [ - 0.82, 0.82 ] ) for ( const z of [ - 0.9, - 0.3, 0.3, 0.9 ] ) group.add( wheel( 0.255, 0.2, m.mesh, x, z, true ) );
	group.add( box( 1.5, 0.08, 2.1, m.grey, 0, 0.45, 0 ) );
	// The pencil antenna and the cone antenna, and the reflector on the nose.
	const pencil = cylinder( 0.012, 0.012, 1.4, m.silver, 6 );
	pencil.position.set( 0.5, 1.9, - 0.4 );
	const cone = new Mesh( new ConeGeometry( 0.13, 0.4, 12 ), m.silver );
	cone.position.set( - 0.5, 1.55, - 0.5 );
	cone.rotation.x = Math.PI;
	const nose = box( 0.4, 0.2, 0.08, m.black, 0, 1.05, - 1.38 );
	group.add( pencil, cone, nose );
	return group;

}

// Chang'e 4 (2019), the first landing on the far side: a gold box about 2 m on four legs, its two
// solar wings, the mast with its cameras, and the ramp Yutu-2 rolled down.
export function change4Lander() {

	const m = materials();
	const group = new Group();
	group.add( box( 2.2, 1.3, 2.2, m.gold, 0, 1.55, 0 ) );
	group.add( box( 2.25, 0.08, 2.25, m.silver, 0, 2.24, 0 ) );
	for ( const [ sx, sz ] of [ [ 1, 1 ], [ 1, - 1 ], [ - 1, 1 ], [ - 1, - 1 ] ] ) leg( group, [ sx * 1.0, 1.2, sz * 1.0 ], [ sx * 2.0, 0.12, sz * 2.0 ], 0.3, m );
	for ( const side of [ - 1, 1 ] ) {

		const wing = panel( 1.6, 1.0, m );
		wing.position.set( side * 1.95, 2.3, 0 );
		wing.rotation.z = side * 0.35;
		group.add( wing );

	}

	const mast = cylinder( 0.04, 0.04, 1.2, m.silver, 8 );
	mast.position.set( 0.6, 2.85, 0.6 );
	const head = box( 0.3, 0.2, 0.2, m.white, 0.6, 3.5, 0.6 );
	// The two ramps, still down at the front.
	const ramp = box( 0.9, 0.04, 2.0, m.silver, 0, 0.6, - 1.9 );
	ramp.rotation.x = 0.55;
	group.add( mast, head, ramp );
	return group;

}

// Yutu-2: a six-wheeled rover about 1.5 m long, gold, with a solar wing each side (the left one folds
// up over the night) and a mast of cameras.
export function yutu2() {

	const m = materials();
	const group = new Group();
	group.add( box( 1.0, 0.55, 1.4, m.gold, 0, 0.75, 0 ) );
	for ( const x of [ - 0.6, 0.6 ] ) for ( const z of [ - 0.55, 0, 0.55 ] ) group.add( wheel( 0.15, 0.15, m.silver, x, z ) );
	const left = panel( 0.9, 1.1, m );
	left.position.set( - 0.95, 1.05, 0 );
	left.rotation.z = - 0.25;
	const right = panel( 0.9, 1.1, m );
	right.position.set( 0.95, 1.1, 0 );
	right.rotation.z = 0.2;
	const mast = cylinder( 0.03, 0.03, 0.55, m.white, 8 );
	mast.position.set( 0, 1.3, - 0.5 );
	const cams = box( 0.4, 0.12, 0.12, m.white, 0, 1.6, - 0.5 );
	group.add( left, right, mast, cams );
	return group;

}

// Chandrayaan-3's Vikram lander (India, 2023), near the south pole: a gold box about 2 m on four
// legs, a solar panel down one side, and the ramp Pragyan used.
export function vikram() {

	const m = materials();
	const group = new Group();
	group.add( box( 2.0, 1.2, 2.0, m.gold, 0, 1.4, 0 ) );
	group.add( box( 1.6, 0.25, 1.6, m.silver, 0, 2.12, 0 ) );
	for ( const [ sx, sz ] of [ [ 1, 1 ], [ 1, - 1 ], [ - 1, 1 ], [ - 1, - 1 ] ] ) leg( group, [ sx * 0.9, 1.05, sz * 0.9 ], [ sx * 1.7, 0.12, sz * 1.7 ], 0.28, m );
	const side = panel( 1.6, 1.1, m );
	side.position.set( 1.03, 1.4, 0 );
	side.rotation.z = Math.PI / 2;
	const ramp = box( 0.7, 0.04, 1.6, m.silver, 0, 0.55, - 1.6 );
	ramp.rotation.x = 0.6;
	group.add( side, ramp );
	return group;

}

// Pragyan: a small six-wheeled rover, about 0.9 m long, its solar panel tilted up over it.
export function pragyan() {

	const m = materials();
	const group = new Group();
	group.add( box( 0.6, 0.35, 0.85, m.gold, 0, 0.45, 0 ) );
	for ( const x of [ - 0.38, 0.38 ] ) for ( const z of [ - 0.33, 0, 0.33 ] ) group.add( wheel( 0.1, 0.1, m.silver, x, z ) );
	const top = panel( 0.75, 0.9, m );
	top.position.set( 0, 0.85, 0.05 );
	top.rotation.x = - 0.6;
	const cams = box( 0.25, 0.08, 0.08, m.white, 0, 0.75, - 0.42 );
	group.add( top, cams );
	return group;

}

// SLIM (Japan, 2024): landed within 55 m of its target, then tipped onto its nose, its main engine
// pointing at the sky, its solar cells facing west. About 2.7 m long, 1.7 m wide and 2.4 m tall.
export function slim() {

	const m = materials();
	const craft = new Group();
	craft.add( box( 1.7, 2.4, 1.6, m.gold, 0, 1.2, 0 ) );
	const tanks = cylinder( 0.45, 0.45, 1.4, m.silver, 16 );
	tanks.rotation.x = Math.PI / 2;
	tanks.position.set( 0, 1.2, 0 );
	const cellsUp = panel( 1.6, 2.2, m );
	cellsUp.rotation.z = Math.PI / 2;
	cellsUp.position.set( 0.86, 1.2, 0 );
	const engine = cylinder( 0.15, 0.32, 0.5, m.grey, 16 );
	engine.position.set( 0, - 0.25, 0 );
	craft.add( tanks, cellsUp, engine );
	// Its crushable aluminium lattice feet.
	for ( const x of [ - 0.7, 0.7 ] ) for ( const z of [ - 0.65, 0.65 ] ) craft.add( box( 0.25, 0.2, 0.25, m.silver, x, - 0.05, z ) );
	// Tipped over onto its nose: the engine up, leaning a little on the slope.
	const group = new Group();
	craft.rotation.x = Math.PI - 0.25;
	craft.position.y = 2.55;
	group.add( craft );
	return group;

}

// LEV-2 (SORA-Q), the baseball-sized ball rover that photographed SLIM: two halves that split open.
export function soraQ() {

	const m = materials();
	const group = new Group();
	for ( const side of [ - 1, 1 ] ) {

		const half = new Mesh( new SphereGeometry( 0.04, 16, 12, 0, Math.PI ), m.silver );
		half.rotation.y = side * Math.PI / 2;
		half.position.set( side * 0.03, 0.04, 0 );
		const tread = new Mesh( new TorusGeometry( 0.038, 0.006, 6, 16 ), m.black );
		tread.rotation.y = Math.PI / 2;
		tread.position.set( side * 0.05, 0.04, 0 );
		group.add( half, tread );

	}

	return group;

}

// --- more of the Moon's hardware -------------------------------------------------------------------

// The US flag on its pole and crossbar, as each Apollo crew planted one (the paint is long bleached by
// the sun, but it's shown as it was).
export function usFlag() {

	return flag( paintUsFlag );

}

// The Apollo Lunar Surface Experiments Package (ALSEP): a central station box with its antenna, the
// radioisotope generator, and a couple of instruments on the ground nearby.
export function alsep() {

	const m = materials();
	const group = new Group();
	group.add( box( 0.6, 0.3, 0.5, m.silver, 0, 0.3, 0 ) );
	group.add( box( 0.7, 0.03, 0.6, m.white, 0, 0.47, 0 ) );
	const mast = cylinder( 0.015, 0.015, 0.6, m.silver, 6 );
	mast.position.set( 0.15, 0.8, 0 );
	const dish = new Mesh( new ConeGeometry( 0.12, 0.25, 12, 1, true ), m.white );
	dish.position.set( 0.15, 1.15, 0 );
	dish.rotation.x = - 0.6;
	for ( const [ x, z ] of [ [ - 0.28, - 0.22 ], [ 0.28, - 0.22 ], [ - 0.28, 0.22 ], [ 0.28, 0.22 ] ] ) group.add( strut( [ x, 0, z ], [ x, 0.18, z ], 0.012, m.silver ) );
	// The generator a few metres off, its fins round a drum.
	const rtg = cylinder( 0.2, 0.2, 0.45, m.black, 12 );
	rtg.position.set( 2.6, 0.32, 1.2 );
	for ( let i = 0; i < 8; i ++ ) {

		const fin = box( 0.02, 0.45, 0.14, m.black );
		const a = i / 8 * Math.PI * 2;
		fin.position.set( 2.6 + Math.cos( a ) * 0.25, 0.32, 1.2 + Math.sin( a ) * 0.25 );
		fin.rotation.y = - a;
		group.add( fin );

	}

	// The seismometer under its skirt of foil.
	const seismo = cylinder( 0.15, 0.4, 0.3, m.gold, 16 );
	seismo.position.set( - 3, 0.15, - 2 );
	group.add( mast, dish, rtg, seismo );
	return group;

}

// The Laser Ranging Retroreflector: a panel of corner cubes tilted to the Earth on its stand, about
// 46 cm across (Apollo 11 and 14; Apollo 15's was three times the size).
export function laserReflector() {

	const m = materials();
	const group = new Group();
	const face = box( 0.46, 0.05, 0.46, m.black );
	face.position.set( 0, 0.45, 0 );
	face.rotation.x = - 0.4;
	group.add( face, strut( [ 0, 0, 0.15 ], [ 0, 0.45, 0 ], 0.015, m.silver ), strut( [ - 0.2, 0, - 0.1 ], [ - 0.15, 0.4, 0 ], 0.012, m.silver ), strut( [ 0.2, 0, - 0.1 ], [ 0.15, 0.4, 0 ], 0.012, m.silver ) );
	return group;

}

// The Lunar Roving Vehicle (Apollo 15, 16, 17), parked where the crews left it: 3.1 m long, 2.3 m
// wide, four wire-mesh wheels 81 cm across, two seats, the console, the high-gain dish on its mast
// and the TV camera.
export function lrv() {

	const m = materials();
	const group = new Group();
	group.add( box( 1.4, 0.12, 3.0, m.silver, 0, 0.62, 0 ) );
	for ( const x of [ - 1.0, 1.0 ] ) for ( const z of [ - 1.15, 1.15 ] ) {

		group.add( wheel( 0.41, 0.23, m.mesh, x, z, true ) );
		const fender = box( 0.3, 0.03, 0.9, m.gold, x, 0.88, z );
		group.add( fender );

	}

	// Two seats, folded-tube frames with webbing.
	for ( const x of [ - 0.35, 0.35 ] ) {

		group.add( box( 0.5, 0.05, 0.5, m.grey, x, 0.75, 0.1 ) );
		const back = box( 0.5, 0.45, 0.04, m.grey, x, 0.98, 0.35 );
		back.rotation.x = - 0.2;
		group.add( back );

	}

	group.add( box( 0.35, 0.35, 0.12, m.grey, 0, 1.0, - 0.45 ) );
	const mast = cylinder( 0.015, 0.015, 1.0, m.silver, 6 );
	mast.position.set( - 0.45, 1.25, - 1.1 );
	const dish = new Mesh( new SphereGeometry( 0.45, 16, 6, 0, Math.PI * 2, 0, 0.6 ), m.mesh );
	dish.position.set( - 0.45, 1.9, - 1.1 );
	dish.rotation.x = 0.9;
	const camera = box( 0.15, 0.15, 0.25, m.white, 0.4, 1.25, - 1.3 );
	group.add( mast, dish, camera );
	return group;

}

// Surveyor (1966-68), America's robotic landers before Apollo: a triangular frame about 3 m tall on
// three legs, a mast with the solar panel and the flat dish on top, and the TV camera.
export function surveyor() {

	const m = materials();
	const group = new Group();
	const frame = cylinder( 0.65, 0.65, 0.9, m.silver, 3 );
	frame.position.y = 1.0;
	group.add( frame );
	for ( let i = 0; i < 3; i ++ ) {

		const a = i / 3 * Math.PI * 2 + Math.PI / 6;
		leg( group, [ Math.cos( a ) * 0.6, 0.8, Math.sin( a ) * 0.6 ], [ Math.cos( a ) * 2.1, 0.12, Math.sin( a ) * 2.1 ], 0.15, m );

	}

	group.add( box( 0.35, 0.35, 0.35, m.white, 0.35, 1.6, 0 ) );
	group.add( box( 0.25, 0.4, 0.25, m.silver, - 0.3, 1.65, 0.2 ) );
	const mast = cylinder( 0.03, 0.03, 1.6, m.silver, 8 );
	mast.position.y = 2.2;
	const solar = panel( 0.86, 0.86, m );
	solar.position.y = 3.0;
	solar.rotation.x = 0.4;
	const dish = box( 0.95, 0.03, 0.95, m.white, 0, 2.75, 0 );
	dish.rotation.x = - 0.5;
	group.add( mast, solar, dish );
	return group;

}

// Luna 9 (1966), the first soft landing on another world: a 58 cm ball that rolled to a stop and
// opened four petals, its antennas sticking out.
export function lunaLander() {

	const m = materials();
	const group = new Group();
	const ball = new Mesh( new SphereGeometry( 0.29, 20, 14 ), m.silver );
	ball.position.y = 0.35;
	group.add( ball );
	for ( let i = 0; i < 4; i ++ ) {

		const a = i / 4 * Math.PI * 2;
		const petal = box( 0.3, 0.02, 0.55, m.silver );
		petal.position.set( Math.cos( a ) * 0.45, 0.08, Math.sin( a ) * 0.45 );
		petal.rotation.y = - a + Math.PI / 2;
		petal.rotation.x = 0.25;
		group.add( petal );
		group.add( strut( [ Math.cos( a + 0.8 ) * 0.2, 0.5, Math.sin( a + 0.8 ) * 0.2 ], [ Math.cos( a + 0.8 ) * 0.5, 1.0, Math.sin( a + 0.8 ) * 0.5 ], 0.006, m.silver ) );

	}

	return group;

}

// The descent stage of the Soviet sample-return landers (Luna 16, 20, 24): four spherical fuel tanks
// in a frame on four legs, about 4 m across; the ascent stage flew the sample home.
export function lunaSampleReturn() {

	const m = materials();
	const group = new Group();
	for ( const [ x, z ] of [ [ - 0.55, - 0.55 ], [ 0.55, - 0.55 ], [ - 0.55, 0.55 ], [ 0.55, 0.55 ] ] ) {

		const tank = new Mesh( new SphereGeometry( 0.45, 16, 12 ), m.silver );
		tank.position.set( x, 1.0, z );
		group.add( tank );

	}

	group.add( box( 1.9, 0.12, 1.9, m.grey, 0, 1.5, 0 ) );
	group.add( cylinder( 0.35, 0.35, 0.4, m.gold, 12 ).translateY( 1.75 ) );
	for ( const [ sx, sz ] of [ [ 1, 1 ], [ 1, - 1 ], [ - 1, 1 ], [ - 1, - 1 ] ] ) leg( group, [ sx * 0.9, 0.9, sz * 0.9 ], [ sx * 2.0, 0.12, sz * 2.0 ], 0.25, m );
	// The drill arm, swung down to the ground.
	group.add( strut( [ 0.9, 1.5, 0 ], [ 1.8, 0.2, 0 ], 0.03, m.silver ) );
	return group;

}

// The landing stage that carried Lunokhod 1 and 2 (Luna 17, 21): the same tanks and frame, with the
// two pairs of ramps the rover rolled down.
export function lunaLunokhodLander() {

	const m = materials();
	const group = lunaSampleReturn();
	for ( const z of [ - 1, 1 ] ) {

		const ramp = box( 0.6, 0.04, 2.0, m.silver, z * 0.6, 0.75, - 1.9 );
		ramp.rotation.x = 0.7;
		group.add( ramp );

	}

	return group;

}

// Chang'e 3 (2013), the same lander as Chang'e 4, and Yutu, the same rover as Yutu-2.
export const change3Lander = change4Lander;
export const yutu = yutu2;

// Chang'e 5 and 6 (2020, 2024) left their landers when the ascender took the samples up: a wide,
// low body on four legs, two big solar wings, the drill and the scoop arm, and the flag (China's
// first, on Chang'e 5).
export function change5Lander() {

	const m = materials();
	const group = new Group();
	const body = cylinder( 1.6, 1.6, 1.0, m.gold, 8 );
	body.rotation.y = Math.PI / 8;
	body.position.y = 1.5;
	group.add( body, box( 2.8, 0.06, 2.8, m.silver, 0, 2.03, 0 ) );
	for ( const [ sx, sz ] of [ [ 1, 1 ], [ 1, - 1 ], [ - 1, 1 ], [ - 1, - 1 ] ] ) leg( group, [ sx * 1.1, 1.2, sz * 1.1 ], [ sx * 2.6, 0.12, sz * 2.6 ], 0.35, m );
	for ( const side of [ - 1, 1 ] ) {

		const wing = panel( 2.4, 1.3, m );
		wing.position.set( side * 2.8, 2.1, 0 );
		wing.rotation.z = side * 0.25;
		group.add( wing );

	}

	group.add( strut( [ 1.2, 1.8, - 1.0 ], [ 2.0, 0.3, - 2.0 ], 0.04, m.silver ) );
	const china = flag( paintChinaFlag, { w: 0.9, h: 0.6, pole: 1.0 } );
	china.position.set( - 0.6, 2.05, 0.6 );
	group.add( china );
	return group;

}

function paintChinaFlag( ctx, w, h ) {

	ctx.fillStyle = '#de2910';
	ctx.fillRect( 0, 0, w, h );
	ctx.fillStyle = '#ffde00';
	const star = ( x, y, r ) => {

		ctx.beginPath();
		for ( let i = 0; i < 10; i ++ ) {

			const a = - Math.PI / 2 + i * Math.PI / 5;
			const d = i % 2 ? r * 0.4 : r;
			ctx.lineTo( x + Math.cos( a ) * d, y + Math.sin( a ) * d );

		}

		ctx.fill();

	};
	star( w * 0.17, h * 0.27, h * 0.16 );
	for ( const [ x, y ] of [ [ 0.33, 0.1 ], [ 0.4, 0.2 ], [ 0.4, 0.35 ], [ 0.33, 0.45 ] ] ) star( w * x, h * y, h * 0.05 );

}

// Odysseus (Intuitive Machines IM-1, 2024), the first private Moon landing: a hexagonal body about
// 4 m tall on six legs, which caught a leg on landing and came to rest tipped on its side.
export function odysseus() {

	const m = materials();
	const craft = new Group();
	const body = cylinder( 0.8, 0.8, 3.0, m.silver, 6 );
	body.position.y = 2.0;
	craft.add( body );
	for ( let i = 0; i < 6; i ++ ) {

		const a = i / 6 * Math.PI * 2;
		leg( craft, [ Math.cos( a ) * 0.75, 0.9, Math.sin( a ) * 0.75 ], [ Math.cos( a ) * 1.6, 0.12, Math.sin( a ) * 1.6 ], 0.18, m );
		const cells = panel( 0.7, 2.2, m );
		cells.rotation.z = Math.PI / 2;
		cells.rotation.y = - a;
		cells.position.set( Math.cos( a ) * 0.82, 2.2, Math.sin( a ) * 0.82 );
		craft.add( cells );

	}

	// On its side, propped a little on a leg.
	const group = new Group();
	craft.rotation.z = Math.PI / 2 - 0.3;
	craft.position.set( 1.6, 0.6, 0 );
	group.add( craft );
	return group;

}

// Blue Ghost (Firefly, 2025), which landed upright in Mare Crisium: a squat gold-and-white box about
// 2 m tall and 3.5 m wide on four legs, solar cells round its sides.
export function blueGhost() {

	const m = materials();
	const group = new Group();
	group.add( box( 2.4, 1.2, 2.4, m.gold, 0, 1.4, 0 ) );
	group.add( box( 2.5, 0.08, 2.5, m.white, 0, 2.04, 0 ) );
	for ( const side of [ - 1, 1 ] ) {

		const cells = panel( 2.2, 1.0, m );
		cells.rotation.z = Math.PI / 2;
		cells.position.set( side * 1.22, 1.4, 0 );
		group.add( cells );

	}

	for ( const [ sx, sz ] of [ [ 1, 1 ], [ 1, - 1 ], [ - 1, 1 ], [ - 1, - 1 ] ] ) leg( group, [ sx * 1.1, 1.0, sz * 1.1 ], [ sx * 1.9, 0.12, sz * 1.9 ], 0.28, m );
	return group;

}

// A crash site: a small fresh crater, darker and brighter rays round it, and a few twisted pieces.
// No two crashes leave the same scar: the debris is placed from a seed.
export function impact( seed = 1 ) {

	const m = materials();
	const group = new Group();
	let s = seed * 9973 + 17;
	const random = () => ( s = ( s * 16807 ) % 2147483647 ) / 2147483647;
	const scar = new Mesh( new CylinderGeometry( 4, 6, 0.04, 24 ), new MeshStandardMaterial( { color: 0x4a4844, roughness: 1 } ) );
	scar.position.y = 0.01;
	const pit = new Mesh( new CylinderGeometry( 2.5, 1.2, 0.05, 20 ), new MeshStandardMaterial( { color: 0x2c2b29, roughness: 1 } ) );
	pit.position.y = 0.035;
	group.add( scar, pit );
	for ( let i = 0; i < 9; i ++ ) {

		const a = random() * Math.PI * 2;
		const d = 2 + random() * 9;
		const piece = box( 0.2 + random() * 0.6, 0.05 + random() * 0.2, 0.15 + random() * 0.5, random() < 0.5 ? m.silver : m.gold );
		piece.position.set( Math.cos( a ) * d, 0.08, Math.sin( a ) * d );
		piece.rotation.set( random() * 0.6, random() * Math.PI, random() * 0.6 );
		group.add( piece );

	}

	return group;

}

// Each site: what's there, laid out as the photographs from orbit show it (metres east and north of
// the first piece), and where on the Moon (planetocentric degrees, LROC's published positions).
export const HARDWARE = [
	{ id: 'apollo-11', name: 'Apollo 11', country: 'USA', year: 1969, world: 'moon', lat: 0.67409, lon: 23.47298, build: apollo11Site },
	{ id: 'lunokhod-1', name: 'Lunokhod 1', country: 'USSR', year: 1970, world: 'moon', lat: 38.3332, lon: - 35.0081, build: lunokhod },
	{ id: 'change-4', name: 'Chang\'e 4 and Yutu-2', country: 'China', year: 2019, world: 'moon', lat: - 45.4446, lon: 177.5991, build: () => site( [ [ change4Lander, 0, 0, 0 ], [ yutu2, 14, 9, - 0.8 ] ] ) },
	{ id: 'chandrayaan-3', name: 'Chandrayaan-3: Vikram and Pragyan', country: 'India', year: 2023, world: 'moon', lat: - 69.373, lon: 32.319, build: () => site( [ [ vikram, 0, 0, 0 ], [ pragyan, 3, - 7, 0.4 ] ] ) },
	{ id: 'slim', name: 'SLIM', country: 'Japan', year: 2024, world: 'moon', lat: - 13.3160, lon: 25.2510, build: () => site( [ [ slim, 0, 0, 0 ], [ soraQ, 6, - 3, 0 ] ] ) },
];

// Several pieces in one Group: [ builder, east, north, heading ] each.
export function site( pieces ) {

	const group = new Group();
	for ( const [ build, east, north, heading ] of pieces ) {

		const piece = build();
		piece.position.set( east, 0, - north );
		piece.rotation.y = heading;
		group.add( piece );

	}

	return group;

}
