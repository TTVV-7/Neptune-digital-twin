import { CanvasTexture, DoubleSide, Euler, IcosahedronGeometry, Matrix4, MeshStandardMaterial, PlaneGeometry, RepeatWrapping, SRGBColorSpace, TorusGeometry } from 'three';
import { BLACK, drawn, FT, GALVANISED, IN, made, mat, Parts, RUBBER, STEEL } from './parts.js';
import { chainLink } from './fence-panel.js';
import { wheelieBin } from './civil-pieces.js';
import { hookBlock } from './plant-parts.js';

// Erosion and sediment control, spill and washout gear, tree protection and a couple of demolition
// and glazing pieces, built in code at the sizes of the common North American products (no brands):
// the things an erosion and sediment control plan or an environmental permit drawing shows. Like the
// other built-in pieces each stands on y = 0 with its front facing -Z (+X is its right). Fences and
// rolls laid along a slope face their front upslope, the side the water and sediment come from.

const _m = new Matrix4();
const _e = new Euler();
const CATEGORY = 'Environmental & erosion control';

export const ENVIRONMENTAL_ITEMS = [
	// Sediment barriers laid in lines: a rowLength (rows.js) is their laying length, so a row of
	// silt fence has its end stakes side by side at each joint, to be wrapped together as specified.
	{ id: 'silt-fence-10ft', name: 'Silt fence (10 ft section, 30 in geotextile on wood stakes, toe trenched)', category: CATEGORY,
		keywords: 'silt fence sediment fence filter fabric geotextile esc erosion control perimeter stakes trenched swppp', build: siltFence, rowLength: 10 * FT },
	{ id: 'super-silt-fence-10ft', name: 'Super silt fence (10 ft section, geotextile on 42 in chain-link, steel posts)', category: CATEGORY,
		keywords: 'super silt fence reinforced chain link sediment fence filter fabric esc erosion control perimeter', build: superSiltFence, rowLength: 10 * FT },
	{ id: 'straw-wattle-25ft', name: 'Straw wattle / fibre roll (9 in × 25 ft, staked)', category: CATEGORY,
		keywords: 'straw wattle fiber roll fibre roll log sediment roll erosion control slope swale stakes esc', build: () => fibreRoll( WATTLE ), rowLength: 25 * FT },
	{ id: 'compost-sock-25ft', name: 'Compost filter sock (12 in × 25 ft, staked)', category: CATEGORY,
		keywords: 'compost filter sock silt sock filtrexx sediment log berm erosion control perimeter esc', build: () => fibreRoll( SOCK ), rowLength: 25 * FT },
	{ id: 'rock-check-dam', name: 'Rock check dam (12 ft across a ditch, 2 ft high, 6 in notch)', category: CATEGORY,
		keywords: 'rock check dam riprap ditch swale velocity control stone weir erosion esc', build: rockCheckDam },
	{ id: 'inlet-filter-bag', name: 'Inlet protection, filter bag under a 2 × 3 ft catch basin grate', category: CATEGORY,
		keywords: 'inlet protection catch basin filter bag insert silt sack grate sediment storm drain esc swppp', build: inletFilterBag },
	{ id: 'inlet-gravel-bag-ring', name: 'Inlet protection, gravel bag ring round a 2 × 3 ft grate (2 courses)', category: CATEGORY,
		keywords: 'inlet protection gravel bags sandbags catch basin grate ring sediment storm drain esc', build: gravelBagRing },
	{ id: 'construction-entrance-20x50', name: 'Stabilized construction entrance (20 × 50 ft, 8 in of 3 in stone on geotextile)', category: CATEGORY,
		keywords: 'construction entrance stabilized gravel pad rock entrance track out tracking pad mud mat esc', build: constructionEntrance },
	{ id: 'erosion-blanket-8ft', name: 'Erosion control blanket, straw (8 ft wide, 30 ft laid and stapled, roll)', category: CATEGORY,
		keywords: 'erosion control blanket ecb straw mat netting rolled erosion product slope staples', build: erosionBlanket },
	// Washout, spill and tree protection.
	{ id: 'washout-rolloff', name: 'Concrete washout container, roll-off (8 × 14 ft, 3.5 ft walls, lined)', category: CATEGORY,
		keywords: 'concrete washout container roll off bin lined pit slurry chute wash environmental', build: washoutRollOff },
	{ id: 'washout-frame-bag', name: 'Concrete washout, prefab frame and bag (8 × 8 ft, 2.5 ft deep)', category: CATEGORY,
		keywords: 'concrete washout bag portable prefab liner pit slurry chute wash environmental', build: washoutFrameBag },
	{ id: 'spill-berm-12x20', name: 'Spill containment berm, collapsible (12 × 20 ft, 12 in walls)', category: CATEGORY,
		keywords: 'spill containment berm collapsible drive over secondary containment refuelling pad environmental', build: spillBerm },
	{ id: 'spill-kit-95gal', name: 'Spill kit, wheeled bin (95 gal)', category: CATEGORY,
		keywords: 'spill kit absorbent pads booms cart bin environmental oil fuel', build: spillKit },
	{ id: 'drum-spill-pallet-4', name: 'Drum spill containment pallet (4 × 55 gal drums, 51 × 51 in)', category: CATEGORY,
		keywords: 'spill pallet drum containment pallet sump secondary containment barrel 55 gallon oil', build: drumPallet },
	{ id: 'tree-protection-fence-10ft', name: 'Tree protection fence (10 ft, 4 ft orange mesh on T-posts)', category: CATEGORY,
		keywords: 'tree protection fence orange safety fence snow fence barrier mesh t-post tpz critical root zone', build: treeFence, rowLength: 10 * FT },
	{ id: 'tree-protection-sign', name: 'Tree protection zone sign (18 × 24 in on T-post)', category: CATEGORY,
		keywords: 'tree protection zone sign tpz keep out do not enter', build: treeSign },
	// Demolition and glazing.
	{ id: 'debris-chute-tower', name: 'Debris chute on scaffold tower (3.9 m deck, hopper and 3 sections)', category: 'Waste',
		keywords: 'debris chute rubbish chute garbage chute trash chute demolition hopper scaffold', build: debrisChute },
	{ id: 'glass-vacuum-lifter', name: 'Glass vacuum lifter on a crane hook, 4 pads (with 8 × 6 ft pane)', category: 'Material handling',
		keywords: 'vacuum lifter glass lifter suction cups glazing curtain wall below the hook pane', build: vacuumLifter },
];

// --- shared materials and helpers --------------------------------------------------------------

const GEOTEXTILE = () => mat( 0x242528, { roughness: 0.9 } );
const STAKE = () => mat( 0x9c7a50, { roughness: 0.9 } );
const SOIL = () => mat( 0x6b5843, { roughness: 1 } );
const LINER = () => mat( 0x151618, { roughness: 0.55 } );
const SLURRY = () => mat( 0x9d9c96, { roughness: 0.9 } );
const YELLOW = () => mat( 0xf0c419, { roughness: 0.6 } );

// A material whose texture, drawn once on a `size` px square, repeats: the geometry's UVs say how
// many times (tileUV).
function tiled( key, size, draw, options = {} ) {

	return made( key, () => {

		const canvas = document.createElement( 'canvas' );
		canvas.width = canvas.height = size;
		draw( canvas.getContext( '2d' ), size );
		const map = new CanvasTexture( canvas );
		map.colorSpace = SRGBColorSpace;
		map.wrapS = map.wrapT = RepeatWrapping;
		map.anisotropy = 4;
		return new MeshStandardMaterial( { map, roughness: 0.95, ...options } );

	} );

}

function tileUV( geometry, su, sv ) {

	const uv = geometry.attributes.uv;
	for ( let i = 0; i < uv.count; i ++ ) uv.setXY( i, uv.getX( i ) * su, uv.getY( i ) * sv );
	return geometry;

}

// Random numbers that come out the same every time, so an item looks the same in every project.
function seeded( seed ) {

	return () => {

		seed = ( seed + 0x6d2b79f5 ) | 0;
		let t = Math.imul( seed ^ seed >>> 15, 1 | seed );
		t = t + Math.imul( t ^ t >>> 7, 61 | t ) ^ t;
		return ( ( t ^ t >>> 14 ) >>> 0 ) / 4294967296;

	};

}

// Short strokes scattered over a tile, wrapped round its edges so it repeats without a seam.
function straw( ctx, w, colours, count, length, random ) {

	ctx.lineWidth = Math.max( 1, w / 64 );
	for ( let i = 0; i < count; i ++ ) {

		const [ x, y ] = [ random() * w, random() * w ];
		const a = random() * Math.PI;
		const l = length * ( 0.5 + random() );
		ctx.strokeStyle = colours[ i % colours.length ];
		for ( const dx of [ - w, 0, w ] ) {

			for ( const dy of [ - w, 0, w ] ) {

				ctx.beginPath();
				ctx.moveTo( x + dx, y + dy );
				ctx.lineTo( x + dx + Math.cos( a ) * l, y + dy + Math.sin( a ) * l );
				ctx.stroke();

			}

		}

	}

}

// A flat sign face drawn with a coloured header and lines of text: [ text, size px, colour ].
function signFace( key, [ width, height ], { background, header, headerHeight, lines } ) {

	return drawn( key, [ width, height ], ( ctx, w, h ) => {

		ctx.fillStyle = background;
		ctx.fillRect( 0, 0, w, h );
		if ( header ) {

			ctx.fillStyle = header;
			ctx.fillRect( 0, 0, w, headerHeight );

		}

		ctx.strokeStyle = '#222222';
		ctx.lineWidth = 6;
		ctx.strokeRect( 3, 3, w - 6, h - 6 );
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		for ( const [ text, size, colour, y ] of lines ) {

			ctx.fillStyle = colour;
			ctx.font = `bold ${ size }px sans-serif`;
			ctx.fillText( text, w / 2, y, w * 0.9 );

		}

	} );

}

// A sign plate of [ width, height ] centred at `centre`, its face to the front (-Z).
function plate( parts, face, [ width, height ], [ x, y, z ] ) {

	parts.add( face, new PlaneGeometry( width, height ), _m.makeRotationY( Math.PI ).setPosition( x, y, z ) );

}

// Backfill over a geotextile toe keyed into a 6 × 6 in trench along the front of a barrier whose
// fabric face is at z0: a low strip of tamped soil banked against the fabric.
function trenchedToe( parts, length, z0 ) {

	parts.prism( SOIL(), [ [ z0, 0 ], [ z0, 3 * IN ], [ z0 - 5 * IN, 2.5 * IN ], [ z0 - 14 * IN, 0 ] ], length );

}

// --- silt fences -------------------------------------------------------------------------------

// Woven geotextile 36 in wide, 30 in of it standing on 2 × 2 in hardwood stakes driven at most
// 6 ft apart, the rest down in the trench along the front and backfilled. The end stakes sit an
// inch in from the ends, so in a row the next section's stake is beside it to be wrapped together.
function siltFence() {

	const parts = new Parts();
	const length = 10 * FT;
	const high = 30 * IN;
	const stake = 2 * IN;
	const staple = mat( 0xb8bcc0, { roughness: 0.4, metalness: 0.7 } );

	for ( const x of [ - length / 2 + stake / 2, 0, length / 2 - stake / 2 ] ) {

		parts.box( STAKE(), [ stake, high + 4 * IN, stake ], [ x, 0, 0 ] );
		for ( const y of [ 4 * IN, 15 * IN, 26 * IN ] ) parts.box( staple, [ 0.6 * IN, 0.3 * IN, 0.006 ], [ x, y, - stake / 2 - 0.004 ] );

	}

	const face = - stake / 2 - 0.004;
	parts.box( GEOTEXTILE(), [ length, high, 0.004 ], [ 0, 0, face + 0.002 ] );
	trenchedToe( parts, length, face + 0.001 );
	return parts.build();

}

// Reinforced silt fence: 2⅜ in galvanised posts 10 ft apart (in a row the next section's end post
// is the same post), 42 in chain-link on their upslope face with a top tension wire, and the
// geotextile on the chain-link, its toe trenched in front.
function superSiltFence() {

	const parts = new Parts();
	const length = 10 * FT;
	const high = 42 * IN;
	const post = 2.375 * IN / 2;
	const steel = GALVANISED();

	for ( const x of [ - length / 2, length / 2 ] ) {

		parts.cylinder( steel, post, high + 3 * IN, [ x, 0, 0 ], 12 );
		parts.sphere( steel, post * 1.2, [ x, high + 3 * IN, 0 ], [ 12, 6 ], [ 1, 0.6, 1 ] );

	}

	// The chain-link, its texture (fence-panel.js) set for a 10 × 6 ft panel, so cut to 42 in high.
	const mesh = tileUV( new PlaneGeometry( length, high - 1 * IN ), 1, ( high - 1 * IN ) / ( 6 * FT ) );
	parts.add( chainLink(), mesh, _m.makeTranslation( 0, 1 * IN + ( high - 1 * IN ) / 2, - post - 0.004 ) );
	parts.rod( steel, [ - length / 2, high, - post - 0.004 ], [ length / 2, high, - post - 0.004 ], 0.15 * IN, 6 );
	const ties = mat( 0x1d1f21, { roughness: 0.7 } );
	for ( const x of [ - length / 2, length / 2 ] ) for ( const y of [ 8 * IN, 22 * IN, 36 * IN ] ) parts.box( ties, [ post * 2.4, 0.3 * IN, 0.4 * IN ], [ x, y, - post * 0.4 ] );

	const face = - post - 0.012;
	parts.box( GEOTEXTILE(), [ length, 33 * IN, 0.004 ], [ 0, 0, face + 0.002 ] );
	trenchedToe( parts, length, face + 0.001 );
	return parts.build();

}

// --- fibre rolls -------------------------------------------------------------------------------

// Rice straw in photodegradable netting, 9 in across, keyed 2 in into the ground and staked with
// 2 × 2 in stakes every 4 ft; and compost in a mesh sock, 12 in across, staked every 10 ft.
const WATTLE = {
	key: 'wattle', diameter: 9 * IN, length: 25 * FT, stakes: 7, seed: 3,
	base: '#b39a5c', fibres: [ '#d4bd7c', '#8f7a45', '#c7ad69' ], net: 'rgba( 70, 58, 36, 0.85 )',
};
const SOCK = {
	key: 'compost sock', diameter: 12 * IN, length: 25 * FT, stakes: 3, seed: 5,
	base: '#3f3226', fibres: [ '#5a4836', '#2c231b', '#6a5641' ], net: 'rgba( 214, 210, 196, 0.95 )',
};

function fibreRoll( { key, diameter, length, stakes, seed, base, fibres, net } ) {

	const parts = new Parts();
	const r = diameter / 2;
	const cover = tiled( `env ${ key } netting`, 128, ( ctx, w ) => {

		ctx.fillStyle = base;
		ctx.fillRect( 0, 0, w, w );
		straw( ctx, w, fibres, 160, w / 6, seeded( seed ) );
		ctx.strokeStyle = net;
		ctx.lineWidth = w / 28;
		ctx.beginPath();
		ctx.moveTo( 0, 0 );
		ctx.lineTo( w, w );
		ctx.moveTo( w, 0 );
		ctx.lineTo( 0, w );
		ctx.stroke();

	} );

	// The roll, the netting's diamonds about 2 in, and each end gathered and tied off.
	const mesh = 2 * IN;
	const tied = r * 1.2;
	const body = parts.rod( cover, [ - length / 2 + tied, r, 0 ], [ length / 2 - tied, r, 0 ], r, 16 );
	tileUV( body, 2 * Math.PI * r / mesh, ( length - 2 * tied ) / mesh );
	for ( const s of [ - 1, 1 ] ) {

		const end = parts.rod( cover, [ s * ( length / 2 - tied ), r, 0 ], [ s * length / 2, r * 0.8, 0 ], [ r, r * 0.3 ], 16 );
		tileUV( end, 2 * Math.PI * r / mesh, tied / mesh );

	}

	// Stakes through the middle, a few inches proud, and the soil of the shallow trench it sits in.
	const step = ( length - 2 * FT ) / ( stakes - 1 );
	for ( let i = 0; i < stakes; i ++ ) parts.box( STAKE(), [ 2 * IN, diameter + 3 * IN, 2 * IN ], [ - length / 2 + 1 * FT + i * step, 0, 0 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.prism( SOIL(), [ [ s * r * 0.75, 0 ], [ s * r * 0.75, 2 * IN ], [ s * ( r + 5 * IN ), 0 ] ], length - 2 * tied );

	}

	return parts.build();

}

// --- rock check dam ----------------------------------------------------------------------------

// Riprap (4 to 10 in stone) heaped across a ditch 2 ft high with 2 : 1 faces up and downstream,
// the middle 6 in lower than the ends so water goes over there rather than round them, on a
// geotextile underlay. Flow comes from the front.
function rockCheckDam() {

	const parts = new Parts();
	const random = seeded( 11 );
	const greys = [ mat( 0x8a8781, { roughness: 1, flatShading: true } ), mat( 0x6f6c67, { roughness: 1, flatShading: true } ), mat( 0xa29d93, { roughness: 1, flatShading: true } ) ];
	const across = 12 * FT;
	const high = 2 * FT;
	const notch = 6 * IN;
	const along = 2 * ( 2 * high ) + 1 * FT;

	// How high the heap is at (x, z): the crest dipping to the notch, the faces at 2 : 1 and the ends
	// at 1.5 : 1 where they'd tie into the ditch sides.
	const top = ( x, z ) => {

		const u = x / ( across / 2 );
		const crest = high - notch * ( 1 - u * u );
		return Math.max( 0, Math.min( crest, ( along / 2 - Math.abs( z ) ) / 2, ( across / 2 - Math.abs( x ) ) / 1.5 ) );

	};

	parts.box( GEOTEXTILE(), [ across + 1 * FT, 0.004, along + 1 * FT ], [ 0, 0, 0 ] );
	const pitch = 0.17;
	for ( let x = - across / 2; x <= across / 2; x += pitch ) {

		for ( let z = - along / 2; z <= along / 2; z += pitch ) {

			const [ px, pz ] = [ x + ( random() - 0.5 ) * pitch, z + ( random() - 0.5 ) * pitch ];
			const h = top( px, pz );
			if ( h < 0.03 ) continue;
			for ( let y = 0; y < h; y += pitch * 0.75 ) {

				const size = ( 5 + random() * 6 ) * IN / 2;
				const rock = new IcosahedronGeometry( 1, 0 );
				_m.makeRotationFromEuler( _e.set( random() * 3, random() * 3, random() * 3 ) );
				rock.applyMatrix4( _m );
				rock.scale( size * ( 0.9 + random() * 0.5 ), size * ( 0.6 + random() * 0.3 ), size * ( 0.9 + random() * 0.4 ) );
				const lift = Math.min( y + size * 0.5, h - size * 0.3 );
				parts.add( greys[ Math.floor( random() * greys.length ) ], rock, _m.makeTranslation( px, Math.max( size * 0.45, lift ), pz ) );

			}

		}

	}

	return parts.build();

}

// --- inlet protection --------------------------------------------------------------------------

// A cast iron frame and grate for a 2 × 3 ft catch basin (as on the precast catch basin) with
// its rim at y = 0 up to 2.5 in.
function grate( parts, y0 = 0, under = mat( 0x101112, { roughness: 1 } ) ) {

	const iron = mat( 0x2e2c2a, { roughness: 0.8, metalness: 0.3 } );
	const frame = [ 30 * IN, 42 * IN ];
	const rim = 2 * IN;
	for ( const s of [ - 1, 1 ] ) {

		parts.box( iron, [ frame[ 0 ], rim, 3 * IN ], [ 0, y0, s * ( frame[ 1 ] / 2 - 1.5 * IN ) ] );
		parts.box( iron, [ 3 * IN, rim, frame[ 1 ] - 6 * IN ], [ s * ( frame[ 0 ] / 2 - 1.5 * IN ), y0, 0 ] );

	}

	const open = [ frame[ 0 ] - 6 * IN, frame[ 1 ] - 6 * IN ];
	parts.box( under, [ open[ 0 ], 0.01, open[ 1 ] ], [ 0, y0, 0 ] );
	for ( let i = 0; i < 9; i ++ ) parts.box( iron, [ 1 * IN, rim - 0.3 * IN, open[ 1 ] ], [ - open[ 0 ] / 2 + ( i + 0.5 ) * open[ 0 ] / 9, y0 + 0.01, 0 ] );
	for ( const z of [ - 1, 0, 1 ] ) parts.box( iron, [ open[ 0 ], rim - 0.5 * IN, 1 * IN ], [ 0, y0 + 0.01, z * open[ 1 ] / 3 ] );
	return frame;

}

// A geotextile sack hung in the catch basin under the grate: its cuff folded out over the frame
// seat shows round the grate, the bag's light inside through the bars, and the blue lifting loops
// it's emptied by stick out at each end.
function inletFilterBag() {

	const parts = new Parts();
	const cuff = 4 * IN;
	const frame = [ 30 * IN, 42 * IN ];
	parts.box( GEOTEXTILE(), [ frame[ 0 ] + 2 * cuff, 0.5 * IN, frame[ 1 ] + 2 * cuff ], [ 0, 0, 0 ] );
	grate( parts, 0.5 * IN, mat( 0x8e8d88, { roughness: 1 } ) );

	const strap = mat( 0x2456a8, { roughness: 0.7 } );
	for ( const s of [ - 1, 1 ] ) {

		for ( const x of [ - 8 * IN, 8 * IN ] ) {

			const z = s * ( frame[ 1 ] / 2 + cuff );
			parts.path( strap, [ [ x - 2 * IN, 0.5 * IN, z - s * 1 * IN ], [ x - 1.5 * IN, 2.5 * IN, z + s * 3 * IN ], [ x + 1.5 * IN, 2.5 * IN, z + s * 3 * IN ], [ x + 2 * IN, 0.5 * IN, z - s * 1 * IN ] ], 0.4 * IN, 6 );

		}

	}

	return parts.build();

}

// Gravel-filled bags (about 18 × 12 × 4 in, 30 lb) two courses high in a ring a foot out from a
// 2 × 3 ft grate, so water ponds and drops its sediment before it seeps through the stone.
function gravelBagRing() {

	const parts = new Parts();
	grate( parts );
	const bags = [ mat( 0xcfc6ad, { roughness: 0.95 } ), mat( 0xbdb398, { roughness: 0.95 } ) ];
	const half = [ 9 * IN, 2.3 * IN, 6 * IN ]; // half length, height and width of a filled bag
	const inner = [ 27 * IN, 33 * IN ]; // half the ring's inside, x and z

	// One course: bags end to end along each side, the front and back runs reaching over the corners.
	const course = ( y, shift, count ) => {

		let k = 0;
		const ex = inner[ 0 ] + half[ 2 ];
		const ez = inner[ 1 ] + half[ 2 ];
		for ( const s of [ - 1, 1 ] ) {

			const span = 2 * ( ex + half[ 2 ] ) - 2 * half[ 0 ];
			for ( let i = 0; i < count[ 0 ]; i ++ ) {

				const x = - span / 2 + span * ( i + shift ) / ( count[ 0 ] - 1 + 2 * shift );
				parts.sphere( bags[ k ++ % 2 ], 1, [ x, y, s * ez ], [ 12, 6 ], half );

			}

			const run = 2 * ( ez - half[ 2 ] ) - 2 * half[ 0 ];
			for ( let i = 0; i < count[ 1 ]; i ++ ) {

				const z = count[ 1 ] === 1 ? 0 : - run / 2 + run * i / ( count[ 1 ] - 1 );
				parts.sphere( bags[ k ++ % 2 ], 1, [ s * ex, y, z ], [ 12, 6 ], [ half[ 2 ], half[ 1 ], half[ 0 ] ] );

			}

		}

	};

	course( half[ 1 ], 0, [ 5, 3 ] );
	course( half[ 1 ] * 2.6, 0.5, [ 4, 2 ] );
	return parts.build();

}

// --- construction entrance ---------------------------------------------------------------------

// A pad of 2 to 3 in crushed stone 8 in thick, 20 ft wide and 50 ft long with its ends ramped, on a
// woven geotextile that shows a foot past each side. Trucks drive along it (front to back), the
// stone knocking the mud off their tires before the road.
function constructionEntrance() {

	const parts = new Parts();
	const width = 20 * FT;
	const length = 50 * FT;
	const thick = 8 * IN;
	const ramp = 4 * FT;

	// The stone: a tile a metre square (ExtrudeGeometry's UVs are in metres).
	const stone = tiled( 'env entrance stone', 256, ( ctx, w ) => {

		const random = seeded( 7 );
		ctx.fillStyle = '#6f6c66';
		ctx.fillRect( 0, 0, w, w );
		const shades = [ '#8d8a83', '#a19d95', '#7b7871', '#b3aea4', '#66635d', '#958f84' ];
		for ( let i = 0; i < 900; i ++ ) {

			const [ x, y ] = [ random() * w, random() * w ];
			const r = ( 4 + random() * 9 ) * w / 256;
			const sides = 5 + Math.floor( random() * 3 );
			const turn = random() * Math.PI;
			ctx.fillStyle = shades[ i % shades.length ];
			for ( const dx of [ - w, 0, w ] ) {

				for ( const dy of [ - w, 0, w ] ) {

					ctx.beginPath();
					for ( let k = 0; k < sides; k ++ ) {

						const a = turn + k * 2 * Math.PI / sides;
						const rr = r * ( 0.7 + 0.3 * Math.sin( k * 2.3 + i ) );
						ctx[ k ? 'lineTo' : 'moveTo' ]( x + dx + Math.cos( a ) * rr, y + dy + Math.sin( a ) * rr * 0.8 );

					}

					ctx.closePath();
					ctx.fill();

				}

			}

		}

	} );

	parts.prism( stone, [ [ - length / 2, 0 ], [ - length / 2 + ramp, thick ], [ length / 2 - ramp, thick ], [ length / 2, 0 ] ], width );
	parts.box( mat( 0x34363a, { roughness: 0.9 } ), [ width + 2 * FT, 0.006, length - 1 * FT ], [ 0, 0, 0 ] );
	return parts.build();

}

// --- erosion control blanket -------------------------------------------------------------------

// A single-net straw blanket 8 ft wide: 30 ft of it unrolled toward the back and stapled (6 in U
// staples, three across every 3 ft), and the rest still on the roll, about 18 in across, at the
// front where it's being rolled out from.
function erosionBlanket() {

	const parts = new Parts();
	const width = 8 * FT;
	const laid = 30 * FT;
	const thick = 0.4 * IN;
	const r = 9 * IN;
	const blanket = tiled( 'env straw blanket', 128, ( ctx, w ) => {

		ctx.fillStyle = '#b89d5e';
		ctx.fillRect( 0, 0, w, w );
		straw( ctx, w, [ '#d6c084', '#9b8450', '#c9b06f', '#a88e55', '#e0cf98' ], 600, w / 4, seeded( 9 ) );
		ctx.strokeStyle = 'rgba( 52, 84, 50, 0.55 )';
		ctx.lineWidth = w / 128;
		ctx.beginPath();
		for ( let i = 0; i < 4; i ++ ) {

			ctx.moveTo( i * w / 4 + 0.5, 0 );
			ctx.lineTo( i * w / 4 + 0.5, w );
			ctx.moveTo( 0, i * w / 4 + 0.5 );
			ctx.lineTo( w, i * w / 4 + 0.5 );

		}

		ctx.stroke();

	} );

	// A tile is 8 in, the net's squares 2 in.
	const tile = 8 * IN;
	const z0 = - r;
	const sheet = parts.box( blanket, [ width, thick, laid ], [ 0, 0, z0 + laid / 2 ] );
	tileUV( sheet, width / tile, laid / tile );
	const staple = mat( 0xb8bcc0, { roughness: 0.4, metalness: 0.7 } );
	for ( let z = 2 * FT; z < z0 + laid; z += 3 * FT ) {

		for ( const x of [ - width / 2 + 3 * IN, 0, width / 2 - 3 * IN ] ) parts.box( staple, [ 1 * IN, 0.15 * IN, 0.15 * IN ], [ x, thick, z ] );

	}

	// The roll at the front end, lying across the strip's start; this is where it's unrolled from.
	const roll = parts.rod( blanket, [ - width / 2, r, - r ], [ width / 2, r, - r ], r, 20 );
	tileUV( roll, 2 * Math.PI * r / tile, width / tile );
	return parts.build();

}

// --- concrete washouts -------------------------------------------------------------------------

function washoutSign() {

	return signFace( 'env concrete washout sign', [ 512, 384 ], {
		background: '#ffffff', header: '#1f4e8c', headerHeight: 120,
		lines: [ [ 'CONCRETE', 92, '#ffffff', 62 ], [ 'WASHOUT', 112, '#1f4e8c', 210 ], [ 'ONLY', 72, '#222222', 316 ] ],
	} );

}

// A low steel roll-off bin set aside for washing out mixer chutes and pump hoppers: 8 × 14 ft and
// 3.5 ft deep on its rails, lined with black poly folded over the top rail, grey slurry settling in
// it and CONCRETE WASHOUT signs on three sides.
function washoutRollOff() {

	const parts = new Parts();
	const paint = mat( 0x4f6f3f, { roughness: 0.7, metalness: 0.3 } );
	const width = 8 * FT;
	const length = 14 * FT;
	const height = 3.5 * FT;
	const base = 0.12;
	const plateT = 0.05;

	// Rails, floor, walls and ribs.
	for ( const x of [ - 0.5, 0.5 ] ) parts.box( BLACK(), [ 0.1, base, length - 0.3 ], [ x, 0, 0 ] );
	parts.box( paint, [ width, plateT, length ], [ 0, base, 0 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( paint, [ plateT, height - base, length ], [ s * ( width / 2 - plateT / 2 ), base, 0 ] );
		parts.box( paint, [ width, height - base, plateT ], [ 0, base, s * ( length / 2 - plateT / 2 ) ] );
		for ( let z = - length / 2 + 0.5; z < length / 2; z += 0.9 ) parts.box( paint, [ 0.08, height - base, 0.08 ], [ s * ( width / 2 + 0.04 ), base, z ] );

	}

	parts.rod( STEEL(), [ - 0.3, 0.45, - length / 2 - 0.12 ], [ 0.3, 0.45, - length / 2 - 0.12 ], 0.03, 8 ); // the hook bar

	// The liner: up the inside, over the rail and a foot down the outside.
	const liner = LINER();
	const skirt = 1 * FT;
	const t = 0.006;
	for ( const s of [ - 1, 1 ] ) {

		parts.box( liner, [ t, height - base - plateT, length - 2 * plateT ], [ s * ( width / 2 - plateT - t / 2 ), base + plateT, 0 ] );
		parts.box( liner, [ width - 2 * plateT, height - base - plateT, t ], [ 0, base + plateT, s * ( length / 2 - plateT - t / 2 ) ] );
		parts.box( liner, [ t, skirt, length + 0.2 ], [ s * ( width / 2 + 0.085 ), height - skirt + t, 0 ] );
		parts.box( liner, [ width + 0.17, skirt, t ], [ 0, height - skirt + t, s * ( length / 2 + 0.003 ) ] );

	}

	for ( const s of [ - 1, 1 ] ) {

		parts.box( liner, [ 0.17, t, length + 0.006 ], [ s * ( width / 2 ), height, 0 ] );
		parts.box( liner, [ width + 0.17, t, plateT + t ], [ 0, height, s * ( length / 2 - plateT / 2 ) ] );

	}

	parts.box( SLURRY(), [ width - 2 * plateT - 2 * t, 0.45, length - 2 * plateT - 2 * t ], [ 0, base + plateT, 0 ] );

	// Signs on the front and both sides.
	const sign = washoutSign();
	const size = [ 24 * IN, 18 * IN ];
	plate( parts, sign, size, [ 0, height - skirt / 2 - 0.05, - length / 2 - 0.01 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.add( sign, new PlaneGeometry( ...size ), _m.makeRotationY( - s * Math.PI / 2 ).setPosition( s * ( width / 2 + 0.095 ), height - skirt / 2 - 0.05, 0 ) );

	}

	return parts.build();

}

// A self-contained washout that's craned out full: a welded tube frame 8 × 8 ft and 30 in high with
// lifting eyes at the corners, the heavy black vinyl bag hung inside it, its cuff folded over the
// top rail, and a sign on the front.
function washoutFrameBag() {

	const parts = new Parts();
	const frame = mat( 0x8c9196, { roughness: 0.55, metalness: 0.5 } );
	const side = 8 * FT;
	const height = 30 * IN;
	const tube = 2 * IN;
	const h = side / 2 - tube / 2;

	// Skid, posts, top and middle rails and the eyes.
	for ( const s of [ - 1, 1 ] ) {

		for ( const y of [ 0, height / 2, height - tube ] ) {

			parts.box( frame, [ side, tube, tube ], [ 0, y, s * h ] );
			parts.box( frame, [ tube, tube, side - 2 * tube ], [ s * h, y, 0 ] );

		}

		for ( const z of [ - 1, 1 ] ) {

			parts.box( frame, [ tube, height, tube ], [ s * h, 0, z * h ] );
			const eye = new TorusGeometry( 1.6 * IN, 0.4 * IN, 6, 12 );
			parts.add( frame, eye, _m.makeRotationY( s * z * Math.PI / 4 ).setPosition( s * h, height + 1.6 * IN, z * h ) );

		}

	}

	// The bag: walls inside the frame, the cuff over the top rail and 8 in down the outside.
	const liner = LINER();
	const t = 0.006;
	const inside = side - 2 * tube;
	const cuff = 8 * IN;
	for ( const s of [ - 1, 1 ] ) {

		parts.box( liner, [ t, height - 1 * IN, inside ], [ s * ( inside / 2 - t / 2 ), 1 * IN, 0 ] );
		parts.box( liner, [ inside, height - 1 * IN, t ], [ 0, 1 * IN, s * ( inside / 2 - t / 2 ) ] );
		parts.box( liner, [ t, cuff, side + 2 * t ], [ s * ( side / 2 + t / 2 ), height - cuff + t, 0 ] );
		parts.box( liner, [ side, cuff, t ], [ 0, height - cuff + t, s * ( side / 2 + t / 2 ) ] );
		parts.box( liner, [ t * 2, t, side + 2 * t ], [ s * ( side / 2 - tube / 2 ), height, 0 ] );

	}

	parts.box( liner, [ side, t, tube + t ], [ 0, height, - h ] );
	parts.box( liner, [ side, t, tube + t ], [ 0, height, h ] );
	parts.box( liner, [ tube + t, t, side ], [ - h, height, 0 ] );
	parts.box( liner, [ tube + t, t, side ], [ h, height, 0 ] );
	parts.box( liner, [ inside, t, inside ], [ 0, 1 * IN, 0 ] );
	parts.box( SLURRY(), [ inside - 2 * t, 10 * IN, inside - 2 * t ], [ 0, 1 * IN + t, 0 ] );
	plate( parts, washoutSign(), [ 20 * IN, 15 * IN ], [ 0, height - cuff - 8 * IN, - side / 2 - 0.012 ] );
	return parts.build();

}

// --- spill containment -------------------------------------------------------------------------

// A drive-over berm for refuelling or parking a leaking machine: a yellow PVC floor 12 × 20 ft with
// walls a foot high held up by fold-down L brackets every 2 ft along the outside (folded flat at
// one end to drive in, all standing here) and a foam roll along the top edge.
function spillBerm() {

	const parts = new Parts();
	const pvc = mat( 0xe9c21c, { roughness: 0.55 } );
	const bracket = mat( 0x9da2a6, { roughness: 0.5, metalness: 0.5 } );
	const width = 12 * FT;
	const length = 20 * FT;
	const wall = 12 * IN;
	const t = 0.006;

	parts.box( pvc, [ width, t, length ], [ 0, 0, 0 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( pvc, [ t * 2, wall, length ], [ s * width / 2, 0, 0 ] );
		parts.box( pvc, [ width, wall, t * 2 ], [ 0, 0, s * length / 2 ] );
		parts.rod( pvc, [ s * width / 2, wall, - length / 2 ], [ s * width / 2, wall, length / 2 ], 0.8 * IN, 8 );
		parts.rod( pvc, [ - width / 2, wall, s * length / 2 ], [ width / 2, wall, s * length / 2 ], 0.8 * IN, 8 );

	}

	// The brackets: an upright against the wall and a strut down to the ground 8 in out.
	const brace = ( x, z, nx, nz ) => {

		const out = 0.6 * IN;
		const [ ux, uz ] = [ x + nx * out, z + nz * out ];
		parts.box( bracket, [ 1 * IN, wall - 1 * IN, 1 * IN ], [ ux, 0, uz ] );
		parts.rod( bracket, [ ux, wall - 2 * IN, uz ], [ x + nx * 8 * IN, 0.3 * IN, z + nz * 8 * IN ], 0.4 * IN, 6 );
		parts.box( bracket, [ nx ? 8 * IN : 1 * IN, 0.25 * IN, nz ? 8 * IN : 1 * IN ], [ x + nx * 4 * IN, 0, z + nz * 4 * IN ] );

	};

	for ( const s of [ - 1, 1 ] ) {

		for ( let z = - length / 2 + 1 * FT; z < length / 2; z += 2 * FT ) brace( s * width / 2, z, s, 0 );
		for ( let x = - width / 2 + 1 * FT; x < width / 2; x += 2 * FT ) brace( x, s * length / 2, 0, s );

	}

	return parts.build();

}

// A 95 gal wheeled cart (the garbage cart's body, civil-pieces.js) in safety yellow, packed with
// pads, booms and socks: SPILL KIT on its lid and front.
function spillKit() {

	const group = wheelieBin( 0xf2c419, false );
	const parts = new Parts();
	const label = signFace( 'env spill kit label', [ 512, 256 ], {
		background: '#ffffff', header: '#c8102e', headerHeight: 256,
		lines: [ [ 'SPILL KIT', 120, '#ffffff', 132 ] ],
	} );
	const lidTop = 43 * IN + 1.6 * IN + 0.003;
	parts.add( label, new PlaneGeometry( 20 * IN, 10 * IN ), _m.makeRotationX( - Math.PI / 2 ).setPosition( 0, lidTop, - 2 * IN ) );

	// On the front face, which leans back with the cart's taper: [ 22, 26 ] in at the foot to
	// [ 26.5, 32 ] in at the rim over 41.5 in, the body set 1 in back.
	const rise = 43 * IN - 1.5 * IN;
	const lean = Math.atan2( ( 32 - 26 ) / 2 * IN + 1 * IN, rise );
	const y = 30 * IN;
	const f = ( y - 1.5 * IN ) / rise;
	const z = 1 * IN - ( 26 * IN + 6 * IN * f ) / 2 - 1 * IN * f - 0.004;
	parts.add( label, new PlaneGeometry( 18 * IN, 9 * IN ), _m.makeRotationY( Math.PI ).premultiply( new Matrix4().makeRotationX( - lean ) ).setPosition( 0, y, z ) );
	return parts.build( group );

}

// Four 55 gal drums on a polyethylene containment pallet 51 × 51 in and 13.5 in high (a 66 gal
// sump under a removable black grate, fork pockets front and back): two steel drums, two poly.
function drumPallet() {

	const parts = new Parts();
	const poly = YELLOW();
	const side = 51 * IN;
	const high = 13.5 * IN;
	const rimW = 2.5 * IN;

	parts.box( poly, [ side, high - 1.5 * IN, side ], [ 0, 0, 0 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( poly, [ side, 1.5 * IN, rimW ], [ 0, high - 1.5 * IN, s * ( side / 2 - rimW / 2 ) ] );
		parts.box( poly, [ rimW, 1.5 * IN, side - 2 * rimW ], [ s * ( side / 2 - rimW / 2 ), high - 1.5 * IN, 0 ] );
		for ( const x of [ - 13 * IN, 13 * IN ] ) parts.box( BLACK(), [ 9 * IN, 3.5 * IN, 0.006 ], [ x, 1 * IN, s * ( side / 2 + 0.003 ) ] );

	}

	// The grate, bars 1 in wide at 1.5 in centres over the dark sump, with two cross bars.
	const grid = mat( 0x1e1f21, { roughness: 0.7 } );
	const open = side - 2 * rimW;
	const gy = high - 1.5 * IN;
	parts.box( mat( 0x0c0c0d, { roughness: 1 } ), [ open, 0.01, open ], [ 0, gy - 0.01, 0 ] );
	const bars = Math.floor( open / ( 1.5 * IN ) );
	for ( let i = 0; i < bars; i ++ ) parts.box( grid, [ 0.8 * IN, 1.2 * IN, open ], [ - open / 2 + ( i + 0.5 ) * open / bars, gy, 0 ] );
	for ( const z of [ - open / 4, open / 4, 0 ] ) parts.box( grid, [ open, 1.2 * IN, 0.8 * IN ], [ 0, gy, z ] );

	const d = 12.25 * IN;
	drum( parts, [ - d, high, - d ], 'steel' );
	drum( parts, [ d, high, - d ], 'poly' );
	drum( parts, [ - d, high, d ], 'poly' );
	drum( parts, [ d, high, d ], 'steel' );
	return parts.build();

}

// A 55 gal drum standing at [ x, y, z ]: steel (23.5 in across, 34.5 in high, two rolling hoops and
// rimmed ends) or blue polyethylene closed-head (23 in across, 35 in high, two bungs).
function drum( parts, [ x, y, z ], kind ) {

	if ( kind === 'steel' ) {

		const paint = mat( 0x24282c, { roughness: 0.55, metalness: 0.4 } );
		const r = 22.5 * IN / 2;
		const h = 34.5 * IN;
		parts.cylinder( paint, r, h, [ x, y, z ], 20 );
		for ( const f of [ 0, 1 / 3, 2 / 3 ] ) if ( f ) parts.cylinder( paint, r + 0.4 * IN, 0.8 * IN, [ x, y + h * f, z ], 20 );
		for ( const yy of [ y, y + h - 0.8 * IN ] ) parts.cylinder( paint, r + 0.3 * IN, 0.8 * IN, [ x, yy, z ], 20 );
		parts.cylinder( STEEL(), 1 * IN, 0.4 * IN, [ x + r * 0.6, y + h, z ], 8 );
		return;

	}

	const blue = mat( 0x1f4fa3, { roughness: 0.5 } );
	const r = 23 * IN / 2;
	const h = 35 * IN;
	parts.cylinder( blue, r, h - 1 * IN, [ x, y, z ], 20 );
	parts.cylinder( blue, r, 1 * IN, [ x, y + h - 1 * IN, z ], 20, r - 1 * IN );
	for ( const f of [ 1 / 3, 2 / 3 ] ) parts.cylinder( blue, r + 0.3 * IN, 1 * IN, [ x, y + h * f, z ], 20 );
	for ( const s of [ - 1, 1 ] ) parts.cylinder( mat( 0x1a3f82, { roughness: 0.5 } ), 1.2 * IN, 0.6 * IN, [ x + s * r * 0.6, y + h, z ], 10 );

}

// --- tree protection ---------------------------------------------------------------------------

// A green studded steel T-post (1⅜ in flange, white top) at [ x, z ] standing `high` out of the
// ground, its flange across the line of the fence (x) and facing the front.
function tPost( parts, [ x, z ], high ) {

	const green = mat( 0x2f5a39, { roughness: 0.55, metalness: 0.3 } );
	const white = mat( 0xe8e8e2, { roughness: 0.55, metalness: 0.2 } );
	const tip = 3 * IN;
	parts.box( green, [ 1.375 * IN, high - tip, 0.15 * IN ], [ x, 0, z ] );
	parts.box( green, [ 0.15 * IN, high - tip, 1.3 * IN ], [ x, 0, z + 0.65 * IN ] );
	parts.box( white, [ 1.375 * IN, tip, 0.15 * IN ], [ x, high - tip, z ] );
	parts.box( white, [ 0.15 * IN, tip, 1.3 * IN ], [ x, high - tip, z + 0.65 * IN ] );

}

// 4 ft orange HDPE barrier mesh (about 3½ × 2 in oval openings) cable-tied to the front of
// T-posts 10 ft apart, keeping machines and stockpiles off a tree's root zone. A row's sections
// share the posts at their ends.
function treeFence() {

	const parts = new Parts();
	const length = 10 * FT;
	const high = 4 * FT;
	const lift = 1 * IN;
	for ( const x of [ - length / 2, length / 2 ] ) tPost( parts, [ x, 0 ], high + 5 * IN );

	const mesh = drawn( 'env tree fence mesh', [ 1024, 512 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#ff6a13';
		ctx.fillRect( 0, 0, w, h );
		ctx.globalCompositeOperation = 'destination-out';
		const [ cx, cy ] = [ w / ( length / IN ), h / ( high / IN ) ]; // px per inch
		for ( let row = 0, y = 2.2; y < high / IN - 1.5; row ++, y += 2 ) {

			for ( let x = ( row % 2 ) * 1.75 + 1.75; x < length / IN - 1; x += 3.5 ) {

				ctx.beginPath();
				ctx.ellipse( x * cx, h - y * cy, 1.35 * cx, 0.68 * cy, 0, 0, Math.PI * 2 );
				ctx.fill();

			}

		}

	}, { side: DoubleSide, roughness: 0.7 } );
	parts.add( mesh, new PlaneGeometry( length, high ), _m.makeTranslation( 0, lift + high / 2, - 0.008 ) );

	const tie = BLACK();
	for ( const x of [ - length / 2, length / 2 ] ) for ( const y of [ 4 * IN, 24 * IN, 44 * IN ] ) parts.box( tie, [ 2 * IN, 0.3 * IN, 0.4 * IN ], [ x, y, - 0.01 ] );
	return parts.build();

}

// The sign hung on tree protection fencing, here on its own T-post: 18 × 24 in aluminium, its
// bottom 30 in up.
function treeSign() {

	const parts = new Parts();
	const size = [ 18 * IN, 24 * IN ];
	const bottom = 30 * IN;
	tPost( parts, [ 0, 0 ], bottom + size[ 1 ] + 2 * IN );
	const face = signFace( 'env tree protection sign', [ 384, 512 ], {
		background: '#ffffff', header: '#1d6b35', headerHeight: 230,
		lines: [
			[ 'TREE', 76, '#ffffff', 52 ], [ 'PROTECTION', 62, '#ffffff', 122 ], [ 'ZONE', 76, '#ffffff', 190 ],
			[ 'KEEP OUT', 66, '#c8102e', 290 ],
			[ 'No grading, parking,', 30, '#222222', 370 ], [ 'storage or dumping', 30, '#222222', 410 ], [ 'inside this fence', 30, '#222222', 450 ],
		],
	} );
	const back = mat( 0xa7abae, { roughness: 0.45, metalness: 0.5 } );
	const y = bottom + size[ 1 ] / 2;
	parts.box( back, [ size[ 0 ], size[ 1 ], 0.003 ], [ 0, bottom, - 0.005 ] );
	plate( parts, face, size, [ 0, y, - 0.0075 ] );
	parts.box( STEEL(), [ 0.5 * IN, 0.5 * IN, 0.4 * IN ], [ 0, y + 8 * IN, - 0.001 ] );
	parts.box( STEEL(), [ 0.5 * IN, 0.5 * IN, 0.4 * IN ], [ 0, y - 8 * IN, - 0.001 ] );
	return parts.build();

}

// --- debris chute ------------------------------------------------------------------------------

// A two-lift frame scaffold tower (5 × 7 ft) with a planked deck and guardrails at 3.9 m and, off
// its front, a pair of beams holding the chute: a hopper at waist height above the deck and three
// tapered plastic sections nested and chained below it, ending about 1.4 m up, over the bin that's
// set under it.
function debrisChute() {

	const parts = new Parts();
	const steel = GALVANISED();
	const plastic = mat( 0xf0a21c, { roughness: 0.6, side: DoubleSide } );
	const plank = mat( 0x9a7b55, { roughness: 0.9 } );
	const toeBoard = mat( 0xc49a3d, { roughness: 0.85 } );
	const [ hx, hz ] = [ 2.5 * FT, 3.5 * FT ];
	const deck = 3.86;
	const r = 0.024;
	const top = deck + 1.07;

	// The tower: posts on base plates, ledgers at each lift, X braces on the sides, the deck with toe
	// boards and top and mid guardrails all round (the front ones low, under the hopper's rim).
	for ( const x of [ - hx, hx ] ) {

		for ( const z of [ - hz, hz ] ) {

			parts.box( STEEL(), [ 0.15, 0.01, 0.15 ], [ x, 0, z ] );
			parts.rod( steel, [ x, 0.01, z ], [ x, top, z ], r, 8 );

		}

		for ( const y of [ 0.3, 1.93, deck ] ) parts.rod( steel, [ x, y, - hz ], [ x, y, hz ], r, 8 );
		for ( const [ y0, y1 ] of [ [ 0.3, 1.93 ], [ 1.93, deck ] ] ) {

			parts.rod( steel, [ x, y0, - hz ], [ x, y1, hz ], r * 0.8, 6 );
			parts.rod( steel, [ x, y1, - hz ], [ x, y0, hz ], r * 0.8, 6 );

		}

	}

	for ( const z of [ - hz, hz ] ) {

		for ( const y of [ 0.3, 1.93, deck ] ) parts.rod( steel, [ - hx, y, z ], [ hx, y, z ], r, 8 );
		for ( let y = 0.6; y < deck; y += 0.33 ) parts.rod( steel, [ - hx, y, z ], [ hx, y, z ], r * 0.6, 6 ); // rungs

	}

	parts.box( plank, [ 2 * hx, 0.05, 2 * hz ], [ 0, deck, 0 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( toeBoard, [ 0.025, 0.1, 2 * hz ], [ s * hx, deck + 0.05, 0 ] );
		parts.box( toeBoard, [ 2 * hx, 0.1, 0.025 ], [ 0, deck + 0.05, s * hz ] );
		for ( const y of [ deck + 0.53, top ] ) {

			parts.rod( steel, [ s * hx, y, - hz ], [ s * hx, y, hz ], r, 8 );
			parts.rod( steel, [ - hx, y, hz ], [ hx, y, hz ], r, 8 );

		}

	}

	parts.rod( steel, [ - hx, deck + 0.53, - hz ], [ hx, deck + 0.53, - hz ], r, 8 );

	// The beams out over the front and the hopper's chains.
	const cz = - hz - 0.55;
	const beamY = top + 0.15;
	const beam = mat( 0x2c2e31, { roughness: 0.6, metalness: 0.3 } );
	for ( const x of [ - 0.5, 0.5 ] ) {

		parts.box( beam, [ 0.08, 0.1, 2 * hz + 1.2 ], [ x, beamY, - 0.6 ] );
		parts.rod( steel, [ x, top, hz ], [ x, beamY, hz ], r, 6 );
		parts.rod( steel, [ x, top, - hz ], [ x, beamY, - hz ], r, 6 );

	}

	parts.rod( beam, [ - hx, top, hz ], [ hx, top, hz ], r * 1.2, 6 );
	parts.rod( beam, [ - hx, top, - hz ], [ hx, top, - hz ], r * 1.2, 6 );

	// Hopper: a wide funnel with its rim at waist height, and the sections nested under it.
	const hopperTop = deck + 0.95;
	const hopperBottom = deck + 0.3;
	parts.rod( plastic, [ 0, hopperBottom, cz ], [ 0, hopperTop, cz ], [ 0.3, 0.45 ], 20, true );
	parts.rod( plastic, [ 0, hopperTop - 0.04, cz ], [ 0, hopperTop, cz ], 0.47, 20 );
	const chain = mat( 0x3a3c3f, { roughness: 0.5, metalness: 0.6 } );
	let bottom = hopperBottom;
	for ( let i = 0; i < 3; i ++ ) {

		const y1 = hopperBottom + 0.12 - i * 0.9;
		const y0 = y1 - 1.1;
		parts.rod( plastic, [ 0, y0, cz ], [ 0, y1, cz ], [ 0.265, 0.33 ], 20, true );
		for ( const f of [ 0.25, 0.6 ] ) parts.rod( plastic, [ 0, y0 + 1.1 * f - 0.02, cz ], [ 0, y0 + 1.1 * f + 0.02, cz ], 0.33 - 0.065 * ( 1 - f ) + 0.015, 20 );
		for ( const s of [ - 1, 1 ] ) parts.box( STEEL(), [ 0.08, 0.06, 0.05 ], [ s * 0.35, y1 - 0.12, cz ] );
		bottom = y0;

	}

	for ( const s of [ - 1, 1 ] ) {

		parts.rod( chain, [ s * 0.38, bottom + 0.9, cz ], [ s * 0.38, hopperTop, cz ], 0.008, 4 );
		parts.rod( chain, [ s * 0.45, hopperTop, cz ], [ s * 0.5, beamY, cz ], 0.008, 4 );

	}

	return parts.build();

}

// --- glass vacuum lifter -----------------------------------------------------------------------

// A battery-powered below-the-hook vacuum lifter (about 700 lb capacity) holding an 8 × 6 ft
// insulated glass unit upright on two blocks as it's set: four 10 in pads on an H frame against the
// front face, the vacuum pump and battery box with its gauge, and the lifting bar curving up and
// over the pane's top edge to the eye under the hook, so the hook is over the glass's balance point.
function vacuumLifter() {

	const parts = new Parts();
	const pane = [ 96 * IN, 72 * IN, 1 * IN ];
	const block = 3.5 * IN;
	const frame = mat( 0x2a5ba8, { roughness: 0.5, metalness: 0.3 } );
	const glass = mat( 0x7fa7b2, { roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.45 } );
	const edge = mat( 0x3a3d40, { roughness: 0.6 } );

	for ( const x of [ - 0.75, 0.75 ] ) parts.box( mat( 0x9a7b55, { roughness: 0.9 } ), [ block, block, 0.35 ], [ x, 0, 0 ] );
	parts.box( glass, pane, [ 0, block, 0 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( edge, [ pane[ 0 ], 0.5 * IN, pane[ 2 ] + 0.002 ], [ 0, block + ( s > 0 ? pane[ 1 ] - 0.5 * IN : 0 ), 0 ] );
		parts.box( edge, [ 0.5 * IN, pane[ 1 ], pane[ 2 ] + 0.002 ], [ s * ( pane[ 0 ] / 2 - 0.25 * IN ), block, 0 ] );

	}

	// Pads on the front face.
	const cy = block + pane[ 1 ] / 2;
	const face = - pane[ 2 ] / 2;
	const padR = 5 * IN;
	const fz = face - 1 * IN - 0.05;
	for ( const x of [ - 0.4, 0.4 ] ) {

		for ( const y of [ cy - 0.3, cy + 0.3 ] ) {

			parts.rod( RUBBER(), [ x, y, face ], [ x, y, face - 1 * IN ], padR, 20 );
			parts.rod( frame, [ x, y, face - 1 * IN ], [ x, y, fz ], padR * 0.8, 16 );

		}

		parts.box( frame, [ 2 * IN, 0.6 + 2 * IN, 2 * IN ], [ x, cy - 0.3 - 1 * IN, fz - 1 * IN ] );

	}

	parts.box( frame, [ 0.8, 2.5 * IN, 2.5 * IN ], [ 0, cy - 1.25 * IN, fz - 2.5 * IN ] );

	// Pump and battery box with the gauge and a red release handle.
	const boxZ = fz - 3.75 * IN - 0.1;
	parts.box( mat( 0x26282b, { roughness: 0.6 } ), [ 0.36, 0.26, 0.15 ], [ 0, cy - 0.3, boxZ ] );
	parts.rod( mat( 0xf2f2ee, { roughness: 0.4 } ), [ 0.09, cy - 0.12, boxZ - 0.075 ], [ 0.09, cy - 0.12, boxZ - 0.085 ], 0.045, 16 );
	parts.rod( mat( 0xc8102e, { roughness: 0.5 } ), [ - 0.12, cy - 0.12, boxZ - 0.075 ], [ - 0.12, cy - 0.04, boxZ - 0.16 ], 0.012, 6 );

	// The lifting bar: up from the frame, back over the top edge, to the eye above the pane.
	const barTop = block + pane[ 1 ] + 0.3;
	parts.path( frame, [ [ 0, cy, fz - 3 * IN ], [ 0, block + pane[ 1 ] + 0.15, fz - 3 * IN ], [ 0, barTop, - 0.04 ], [ 0, barTop, 0 ] ], 1.2 * IN, 10 );
	const eye = new TorusGeometry( 2.2 * IN, 0.6 * IN, 8, 16 );
	parts.add( STEEL(), eye, _m.makeTranslation( 0, barTop + 2.6 * IN, 0 ) );

	// The hook block above it and its rope going on up out of the picture.
	const group = parts.build();
	const blockTop = barTop + 2.6 * IN + 0.42;
	hookBlock( group, [ 0, blockTop, 0 ], 0.38 );
	const rope = new Parts();
	for ( const x of [ - 0.05, 0.05 ] ) rope.rod( mat( 0x55585c, { roughness: 0.5, metalness: 0.6 } ), [ x, blockTop - 0.05, 0 ], [ x, blockTop + 1.5, 0 ], 0.008, 6 );
	return rope.build( group );

}
