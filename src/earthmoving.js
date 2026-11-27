import { ExtrudeGeometry, MathUtils, Matrix4, Path, PlaneGeometry, Shape, Vector2, Vector3 } from 'three';
import { drawn, FT, IN, mat, Parts } from './parts.js';
import { memberGeometry } from './plant-parts.js';
import { cab, carrier, conveyor, railing, tracks } from './heavy-civil.js';
import { truck, TRUCK_WIDTH } from './road-plant.js';

// Mass earthmoving, quarry and roadwork plant built in code at the sizes of the common North
// American classes (no brands): the big iron for a mass grading or quarry job (a push-pull wheel
// tractor scraper, a 70 t dozer, a 90 t mass excavator, a 30 t excavator with a hammer, a large
// wheel loader, a 100 t haul truck and an articulated water wagon), the quarry's drilling and
// blasting and aggregate plant (a tophammer drill rig, a Type 2 explosives magazine, a tracked
// impact crusher and a portable wash plant), the weigh-in (a truck scale and its scale house),
// and roadwork kit (a message board trailer, a truck-mounted attenuator and a hydroseeder). Like
// the other built-in pieces each stands on y = 0 with its front facing -Z (+X is its right).

const DEG = MathUtils.DEG2RAD;
const _m = new Matrix4();

export const EARTHMOVING_ITEMS = [
	// Mass earthmoving.
	{ id: 'wheel-tractor-scraper', name: 'Wheel tractor scraper, push-pull (CAT 627 class, 24 yd³ heaped)', category: 'Heavy equipment',
		keywords: 'scraper pan wheel tractor scraper push pull twin engine 627 mass grading cut fill earthmoving dirt',
		build: scraper },
	{ id: 'crawler-dozer-d10', name: 'Crawler dozer, large (D10 class, 70 t, SU blade and ripper)', category: 'Heavy equipment',
		keywords: 'dozer bulldozer cat d10 crawler tractor ripper semi u blade push mining quarry high drive',
		build: bigDozer },
	{ id: 'excavator-mass-90t', name: 'Mass excavator (90 t class, 6 yd³ bucket)', category: 'Heavy equipment',
		keywords: 'excavator mass excavation 90 ton 390 big hoe trackhoe digger loading haul trucks quarry',
		build: massExcavator },
	{ id: 'excavator-hammer-30t', name: 'Excavator with hydraulic hammer (30 t, 6,000 ft-lb breaker)', category: 'Heavy equipment',
		keywords: 'excavator hammer breaker hoe ram hoe pecker rock breaking demolition concrete 30 ton',
		build: hammerExcavator },
	{ id: 'wheel-loader-large-988', name: 'Wheel loader, large (988 class, 8 yd³ rock bucket)', category: 'Heavy equipment',
		keywords: 'wheel loader front end loader 988 big loader quarry stockpile face loading rock bucket',
		build: bigLoader },
	{ id: 'haul-truck-100t', name: 'Haul truck, off-highway (777 class, 100 t)', category: 'Vehicles',
		keywords: 'haul truck rock truck off highway 777 100 ton mining quarry dump truck rigid frame',
		build: haulTruck },
	{ id: 'water-wagon-articulated', name: 'Water wagon, articulated (40 t ADT chassis, 8,000 gal, rear sprays)', category: 'Vehicles',
		keywords: 'water wagon water truck articulated adt dust control haul road water cannon 8000 gallon',
		build: waterWagon },

	// Quarry: drilling, blasting and aggregates.
	{ id: 'drill-rig-surface-blasthole', name: 'Surface drill rig, tophammer blasthole (tracked, 26 ft feed, rod carousel)', category: 'Heavy equipment',
		keywords: 'drill rig blasthole surface drill top hammer rock drill quarry blasting crawler drill rock anchors',
		build: drillRig },
	{ id: 'explosives-magazine-type2', name: 'Explosives magazine, Type 2 (8 × 8 ft, bullet-resistant, on skids)', category: 'Site services',
		keywords: 'explosives magazine powder magazine blasting storage type 2 dynamite detonators atf box',
		build: magazine },
	{ id: 'impact-crusher-tracked', name: 'Impact crusher, tracked (HSI, 1,200 mm rotor, side conveyor)', category: 'Material handling',
		keywords: 'impact crusher impactor hsi horizontal shaft recycling concrete asphalt rap crusher tracked mobile',
		build: impactCrusher },
	{ id: 'wash-plant-sand-screw', name: 'Aggregate wash plant, portable (6 × 16 ft rinse screen, sand screw, 3 conveyors)', category: 'Material handling',
		keywords: 'wash plant sand screw rinse screen washed sand gravel aggregate classifier screw washer',
		build: washPlant },

	// Weigh-in.
	{ id: 'truck-scale-70ft', name: 'Truck scale, above-ground (70 × 11 ft, concrete deck, ramps)', category: 'Site services',
		keywords: 'truck scale weigh scale weighbridge platform scale weigh in out quarry landfill tickets',
		build: truckScale },
	{ id: 'scale-house', name: 'Scale house (8 × 12 ft, sliding window to the scale, steps)', category: 'Site trailers & containers',
		keywords: 'scale house weigh booth scale shack weighmaster ticket booth kiosk',
		build: scaleHouse },

	// Roadwork.
	{ id: 'vms-board-trailer', name: 'Message board trailer (VMS, full matrix, solar)', category: 'Traffic control',
		keywords: 'vms message board pcms changeable message sign portable sign trailer solar road work ahead',
		build: messageBoard },
	{ id: 'tma-truck', name: 'Truck-mounted attenuator (TMA crash cushion on 26,000 lb truck, arrow board)', category: 'Traffic control',
		keywords: 'tma attenuator crash truck shadow truck crash cushion impact attenuator lane closure arrow',
		build: tmaTruck },
	{ id: 'hydroseeder-truck', name: 'Hydroseeder truck (3,000 gal, deck tower and hose reel)', category: 'Environmental & erosion control',
		keywords: 'hydroseeder hydroseeding hydro mulch seeding truck slope stabilization erosion grass seed',
		build: hydroseeder },
];

// --- colours -----------------------------------------------------------------------------------

const paint = color => mat( color, { roughness: 0.5, metalness: 0.2 } );
const YELLOW = () => paint( 0xe2a41c );
const WHITE = () => paint( 0xe9e8e2 );
const DARK = () => mat( 0x2c2e31, { roughness: 0.7, metalness: 0.2 } );
const BLACK = () => mat( 0x18191b, { roughness: 0.85 } );
const RUBBER = () => mat( 0x161718, { roughness: 0.9 } );
const STEEL = () => mat( 0x7d8287, { roughness: 0.5, metalness: 0.6 } );
const BRIGHT = () => mat( 0xc9ccce, { roughness: 0.35, metalness: 0.3 } );
const GLASS = () => mat( 0x2b3d48, { roughness: 0.1, metalness: 0.3 } );
const GALV = () => mat( 0xa9adb0, { roughness: 0.45, metalness: 0.65 } );
const STONE = () => mat( 0x9a958c, { roughness: 1 } );
const SAND = () => mat( 0xb9a27a, { roughness: 1 } );
const CONCRETE = () => mat( 0xb9b5ab, { roughness: 0.95 } );
const AMBER = () => mat( 0xff9a1a, { roughness: 0.3, emissive: 0xc76a00, emissiveIntensity: 0.6 } );
const RED_LAMP = () => mat( 0xb3141b, { roughness: 0.3, emissive: 0x7a0a0e, emissiveIntensity: 0.6 } );
const HEADLAMP = () => mat( 0xfff3c9, { roughness: 0.3, emissive: 0x6b6040 } );

// --- shared pieces -----------------------------------------------------------------------------

const v = p => Array.isArray( p ) ? new Vector3( ...p ) : p.clone();
// The direction `a` degrees above level towards the front, and the one square to it on its top side.
const ahead = a => new Vector3( 0, Math.sin( a * DEG ), - Math.cos( a * DEG ) );
const above = a => new Vector3( 0, Math.cos( a * DEG ), Math.sin( a * DEG ) );

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

// A pin across x through point p, `width` long.
function pin( parts, p, width, radius ) {

	parts.rod( STEEL(), [ p.x - width / 2, p.y, p.z ], [ p.x + width / 2, p.y, p.z ], radius, 10 );

}

// A cross-section (points [ x, y ]) extruded along z from z0 to z1.
function alongZ( parts, material, points, z0, z1 ) {

	const shape = new Shape( points.map( ( [ x, y ] ) => new Vector2( x, y ) ) );
	const geometry = new ExtrudeGeometry( shape, { depth: z1 - z0, bevelEnabled: false, curveSegments: 4 } );
	parts.add( material, geometry, _m.makeTranslation( 0, 0, z0 ) );

}

// A band round an elliptical tank (`width` by `height`, its bottom at y0) at z: a ring standing
// a little proud of the shell.
function band( parts, material, width, height, y0, z ) {

	const shape = new Shape( ellipse( width + 0.05, height + 0.05, y0 - 0.025 ).map( ( [ x, y ] ) => new Vector2( x, y ) ) );
	shape.holes.push( new Path( ellipse( width - 0.05, height - 0.05, y0 + 0.025 ).map( ( [ x, y ] ) => new Vector2( x, y ) ) ) );
	const geometry = new ExtrudeGeometry( shape, { depth: 0.08, bevelEnabled: false } );
	parts.add( material, geometry, _m.makeTranslation( 0, 0, z - 0.04 ) );

}

// An ellipse (points [ x, y ]) `width` across and `height` high, its bottom at y0.
function ellipse( width, height, y0, steps = 24 ) {

	const points = [];
	for ( let i = 0; i < steps; i ++ ) {

		const a = i / steps * Math.PI * 2;
		points.push( [ Math.cos( a ) * width / 2, y0 + height / 2 + Math.sin( a ) * height / 2 ] );

	}

	return points;

}

// A rubber tyre on its rim, its axle across x and its middle `radius` up. `lugs` puts that many
// chevron tread bars round an earthmover's tyre (the carcass a little smaller inside them).
function tyre( parts, radius, width, [ x, z ], { rim = STEEL(), lugs = 0 } = {} ) {

	const body = lugs ? radius * 0.955 : radius;
	parts.rod( RUBBER(), [ x - width / 2, radius, z ], [ x + width / 2, radius, z ], body, 24 );
	parts.rod( rim, [ x - width / 2 - 0.01, radius, z ], [ x + width / 2 + 0.01, radius, z ], radius * 0.5, 16 );
	parts.rod( DARK(), [ x - width / 2 - 0.02, radius, z ], [ x + width / 2 + 0.02, radius, z ], radius * 0.2, 10 );
	for ( let i = 0; i < lugs; i ++ ) {

		// Two rows of bars, each from the shoulder to just past the middle, the rows staggered.
		for ( const side of [ - 1, 1 ] ) {

			const a = ( i + ( side > 0 ? 0.5 : 0 ) ) / lugs * Math.PI * 2;
			// Set in a little, as the turned bars' corners reach further out than their middles.
			const rho = radius * 0.972;
			const centre = [ x + side * width * 0.24, radius - Math.cos( a ) * rho, z + Math.sin( a ) * rho ];
			parts.block( RUBBER(), [ width * 0.5, radius * 0.047, radius * 0.16 ], centre, [ Math.PI - a, side * 0.2, 0 ] );

		}

	}

}

// Points on the convex hull of a set of [ z, y ] points (monotone chain), anticlockwise.
function hull( points ) {

	const p = points.slice().sort( ( a, b ) => a[ 0 ] - b[ 0 ] || a[ 1 ] - b[ 1 ] );
	const cross = ( o, a, b ) => ( a[ 0 ] - o[ 0 ] ) * ( b[ 1 ] - o[ 1 ] ) - ( a[ 1 ] - o[ 1 ] ) * ( b[ 0 ] - o[ 0 ] );
	const lower = [];
	for ( const q of p ) {

		while ( lower.length >= 2 && cross( lower[ lower.length - 2 ], lower[ lower.length - 1 ], q ) <= 0 ) lower.pop();
		lower.push( q );

	}

	const upper = [];
	for ( const q of p.reverse() ) {

		while ( upper.length >= 2 && cross( upper[ upper.length - 2 ], upper[ upper.length - 1 ], q ) <= 0 ) upper.pop();
		upper.push( q );

	}

	return [ ...lower.slice( 0, - 1 ), ...upper.slice( 0, - 1 ) ];

}

// A crawler track wrapped round wheels [ z, y, radius ] (radius to the outside of the track),
// `width` wide and centred on x, `t` thick: a dozer's elevated sprocket gives it a triangle.
function trackLoop( parts, material, wheels, width, x, t ) {

	const ring = grow => hull( wheels.flatMap( ( [ z, y, r ] ) => Array.from( { length: 24 }, ( _, i ) => {

		const a = i / 24 * Math.PI * 2;
		return [ z + Math.cos( a ) * ( r + grow ), y + Math.sin( a ) * ( r + grow ) ];

	} ) ) );
	const shape = new Shape( ring( 0 ).map( ( [ z, y ] ) => new Vector2( z, y ) ) );
	shape.holes.push( new Path( ring( - t ).map( ( [ z, y ] ) => new Vector2( z, y ) ) ) );
	const geometry = new ExtrudeGeometry( shape, { depth: width, bevelEnabled: false, curveSegments: 4 } );
	geometry.rotateY( - Math.PI / 2 );
	geometry.translate( x + width / 2, 0, 0 );
	parts.add( material, geometry );

}

// A bucket's side profile (points [ z, y ] from its hinge pin, for a bucket curled under a stick
// pointing straight down), turned by `angle` (degrees, towards the machine) and scaled by `s`.
const BUCKET = [ [ - 0.25, 0.12 ], [ 0.3, 0.1 ], [ 0.62, - 0.55 ], [ 0.4, - 0.88 ], [ - 0.12, - 0.95 ], [ - 0.5, - 0.62 ], [ - 0.45, - 0.1 ] ];
function bucketProfile( p, angle, s ) {

	const c = Math.cos( angle * DEG );
	const n = Math.sin( angle * DEG );
	return BUCKET.map( ( [ z, y ] ) => [ p.z + ( z * c - y * n ) * s, p.y + ( z * n + y * c ) * s ] );

}

// A digging bucket hanging off pin p, `width` wide, with teeth along its lip.
function bucket( parts, p, width, s, angle = 0 ) {

	const outline = bucketProfile( p, angle, s );
	parts.prism( DARK(), outline, width, p.x );
	const [ lipZ, lipY ] = outline[ 3 ];
	const [ nextZ, nextY ] = outline[ 2 ];
	const dz = ( lipZ - nextZ );
	const dy = ( lipY - nextY );
	const teeth = Math.round( width / 0.32 );
	for ( let i = 0; i < teeth; i ++ ) {

		const x = p.x - width / 2 + ( i + 0.5 ) * width / teeth;
		parts.rod( BLACK(), [ x, lipY, lipZ ], [ x, lipY + dy * 0.35, lipZ + dz * 0.35 ], [ 0.07 * s, 0.03 * s ], 5 );

	}

}

// A two-piece ("banana") excavator boom from its foot, bent at a knee, and the stick hanging from
// its tip: angles in degrees above level towards the front. Returns the points along it.
function front( parts, body, { foot, boom: [ a1, l1, a2, l2 ], stick: [ a3, l3 ], section, x = foot[ 0 ] } ) {

	const f = v( foot );
	const knee = f.clone().addScaledVector( ahead( a1 ), l1 );
	const tip = knee.clone().addScaledVector( ahead( a2 ), l2 );
	const end = tip.clone().addScaledVector( ahead( a3 ), l3 );
	const [ w, h ] = section;
	member( parts, body, [ w, h ], f, knee );
	member( parts, body, [ w * 0.95, h * 0.9 ], knee, tip );
	// The stick starts a little behind the boom tip (where its ram pulls) and narrows to the bucket.
	const heel = tip.clone().addScaledVector( ahead( a3 ), - h * 0.9 );
	member( parts, body, [ w * 0.8, h * 0.7 ], heel, end );
	for ( const p of [ f, tip, end ] ) pin( parts, p, w + 0.2, h * 0.14 );
	// Boom rams under the boom, the stick ram on top of it, the bucket ram along the stick.
	for ( const s of [ - 1, 1 ] ) {

		const off = new Vector3( s * ( w / 2 + h * 0.14 ), 0, 0 );
		ram( parts, h * 0.17, f.clone().add( off ).addScaledVector( ahead( a1 ), - 0.4 ).add( new Vector3( 0, - h * 0.7, - h * 0.6 ) ), knee.clone().add( off ).addScaledVector( above( a1 ), - h * 0.6 ) );

	}

	ram( parts, h * 0.16, knee.clone().addScaledVector( above( a2 ), h * 0.8 ).addScaledVector( ahead( a2 ), - h * 0.8 ), heel.clone().addScaledVector( above( a3 ), h * 0.5 ) );
	ram( parts, h * 0.13, tip.clone().addScaledVector( ahead( a3 ), h * 0.2 ).addScaledVector( above( a3 ), h * 0.45 ), end.clone().addScaledVector( ahead( a3 ), - h * 0.6 ).addScaledVector( above( a3 ), h * 0.42 ) );
	parts.path( BLACK(), [ f.clone().addScaledVector( above( a1 ), h * 0.6 ).toArray(), knee.clone().addScaledVector( above( a1 ), h * 0.62 ).toArray(), tip.clone().addScaledVector( above( a2 ), h * 0.6 ).toArray() ], h * 0.05, 5 );
	return { foot: f, knee, tip, end, x };

}

// Black-and-yellow chevrons (an inverted V pattern) for the back of a crash cushion.
function chevrons() {

	return drawn( 'tma chevrons', [ 512, 192 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#f5c400';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#141414';
		const pitch = 64;
		// Stripes slope down to the middle from both sides, each half drawn on its own.
		for ( const s of [ - 1, 1 ] ) {

			ctx.save();
			ctx.beginPath();
			ctx.rect( s < 0 ? 0 : w / 2, 0, w / 2, h );
			ctx.clip();
			for ( let i = - 4; i < 8; i ++ ) {

				const x0 = w / 2 + s * i * pitch;
				ctx.beginPath();
				ctx.moveTo( x0, h );
				ctx.lineTo( x0 + s * pitch / 2, h );
				ctx.lineTo( x0 + s * pitch / 2 + s * h * 0.8, 0 );
				ctx.lineTo( x0 + s * h * 0.8, 0 );
				ctx.closePath();
				ctx.fill();

			}

			ctx.restore();

		}

	} );

}

// A flashing arrow board's face: amber lamps in a right arrow on black.
function arrowFace() {

	return drawn( 'tma arrow board', [ 256, 128 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#16171a';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#ffb21c';
		const lamp = ( x, y ) => {

			ctx.beginPath();
			ctx.arc( x, y, 6, 0, Math.PI * 2 );
			ctx.fill();

		};

		for ( let x = 30; x <= 190; x += 16 ) lamp( x, h / 2 );
		for ( let i = 1; i <= 4; i ++ ) {

			lamp( 206 - i * 14, h / 2 - i * 12 );
			lamp( 206 - i * 14, h / 2 + i * 12 );

		}

		lamp( 210, h / 2 );

	} );

}

// --- wheel tractor scraper ---------------------------------------------------------------------

// A push-pull twin-engine wheel tractor scraper of the 627 class, about 14.6 m long, 3.55 m wide
// and 3.9 m to the top of its cab: the two-axle tractor at the front (engine over the axle, the
// cab behind it) with the push-pull bail out front, the gooseneck arching back to the yoke and
// the draft arms down the sides of the 24 yd³ bowl, the apron at the front of the bowl and the
// ejector at its back, the bowl lift rams, and the rear tractor with its second engine, the push
// block and the hook for the machine behind.
function scraper() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();
	const R = 0.97; // 33.25R29 tyres
	const TW = 0.84;
	const tx = 1.33;

	// Front tractor: frame, engine hood over the axle, radiator grille and the cab behind.
	const fz = - 5.55;
	parts.box( dark, [ 1.1, 0.55, 4.1 ], [ 0, 0.65, - 5.55 ] );
	parts.rod( dark, [ - tx, R, fz ], [ tx, R, fz ], 0.13, 10 );
	for ( const s of [ - 1, 1 ] ) tyre( parts, R, TW, [ s * tx, fz ], { rim: body, lugs: 18 } );
	parts.box( body, [ 1.7, 1.4, 2.5 ], [ 0, 1.15, - 6.2 ] );
	parts.box( dark, [ 1.5, 1.0, 0.05 ], [ 0, 1.3, - 7.47 ] );
	for ( let i = 0; i < 6; i ++ ) parts.box( BLACK(), [ 1.4, 0.04, 0.06 ], [ 0, 1.4 + i * 0.14, - 7.5 ] );
	parts.cylinder( BLACK(), 0.08, 0.6, [ 0.5, 2.55, - 6.6 ], 10 );
	parts.box( BLACK(), [ 1.0, 0.03, 1.2 ], [ - 0.1, 2.55, - 6.0 ] );
	// Fenders over the front tyres, joined to the hood by decks.
	for ( const s of [ - 1, 1 ] ) {

		parts.box( body, [ TW + 0.2, 0.08, 2.3 ], [ s * tx, 2.12, fz ] );
		parts.box( body, [ TW + 0.2, 0.45, 0.08 ], [ s * tx, 1.7, fz - 1.15 ] );
		parts.box( body, [ 0.5, 0.08, 1.4 ], [ s * 0.9, 2.12, fz + 0.3 ] );
		parts.box( HEADLAMP(), [ 0.2, 0.12, 0.04 ], [ s * 0.6, 2.25, - 7.46 ] );

	}

	cab( parts, [ 1.55, 1.75, 1.45 ], [ 0, 2.1, - 4.25 ], body );
	parts.box( body, [ 1.8, 0.1, 1.7 ], [ 0, 2.0, - 4.25 ] );
	parts.box( AMBER(), [ 0.16, 0.1, 0.16 ], [ 0, 3.88, - 4.0 ] );

	// Push-pull bail out front: a U of heavy tube on the bumper.
	parts.box( dark, [ 1.4, 0.4, 0.25 ], [ 0, 0.85, - 7.55 ] );
	parts.path( body, [ [ - 0.55, 1.25, - 7.5 ], [ - 0.55, 1.35, - 7.85 ], [ 0.55, 1.35, - 7.85 ], [ 0.55, 1.25, - 7.5 ] ], 0.09, 8 );

	// Gooseneck: up from the hitch behind the tractor, back over the bowl to the yoke, and the
	// draft arms down each side of the bowl to their trunnions.
	const hitch = new Vector3( 0, 1.25, - 3.45 );
	const crown = new Vector3( 0, 2.9, - 3.05 );
	const yoke = new Vector3( 0, 2.85, - 2.15 );
	member( parts, body, [ 0.75, 0.7 ], hitch, crown );
	member( parts, body, [ 0.75, 0.6 ], crown, yoke );
	parts.box( dark, [ 1.0, 0.7, 0.6 ], [ 0, 0.9, - 3.45 ] );
	member( parts, body, [ 0.45, 0.45 ], [ - 1.75, 2.75, - 2.15 ], [ 1.75, 2.75, - 2.15 ] );
	for ( const s of [ - 1, 1 ] ) {

		member( parts, body, [ 0.22, 0.5 ], [ s * 1.72, 2.75, - 2.15 ], [ s * 1.72, 1.0, 0.1 ] );
		pin( parts, new Vector3( s * 1.66, 1.0, 0.1 ), 0.2, 0.1 );
		// Bowl lift ram from the yoke down to the front of the bowl.
		ram( parts, 0.1, [ s * 1.45, 2.7, - 2.35 ], [ s * 1.45, 1.75, - 1.7 ] );

	}

	// Bowl: floor sloping to the cutting edge, side plates, the apron curving over the front and
	// the ejector across the back, a rail round the top.
	const b0 = - 1.95;
	const b1 = 2.9;
	parts.block( dark, [ 3.1, 0.12, b1 - b0 ], [ 0, 0.4, ( b0 + b1 ) / 2 ], [ - 0.05, 0, 0 ] );
	parts.box( BLACK(), [ 3.15, 0.12, 0.25 ], [ 0, 0.06, b0 + 0.2 ] );
	for ( const s of [ - 1, 1 ] ) parts.prism( body, [ [ b0, 0.15 ], [ b1, 0.6 ], [ b1, 2.45 ], [ b0 + 0.3, 2.45 ], [ b0, 2.1 ] ], 0.08, s * 1.57 );
	parts.prism( body, [ [ b0 - 0.25, 0.35 ], [ b0 - 0.05, 0.35 ], [ b0 + 0.25, 2.3 ], [ b0 + 0.05, 2.45 ], [ b0 - 0.45, 2.2 ], [ b0 - 0.4, 1.0 ] ], 3.08 );
	parts.box( body, [ 3.1, 1.9, 0.12 ], [ 0, 0.6, b1 - 0.1 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.12, 0.14, b1 - b0 - 0.2 ], [ s * 1.57, 2.45, ( b0 + b1 ) / 2 + 0.1 ] );

	// Rear tractor: axle, tyres and fenders, the second engine and its radiator, push block and hook.
	const rz = 3.95;
	parts.box( dark, [ 1.0, 0.6, 3.6 ], [ 0, 0.7, 4.6 ] );
	parts.rod( dark, [ - tx, R, rz ], [ tx, R, rz ], 0.13, 10 );
	for ( const s of [ - 1, 1 ] ) {

		tyre( parts, R, TW, [ s * tx, rz ], { rim: body, lugs: 18 } );
		parts.box( body, [ TW + 0.2, 0.08, 2.2 ], [ s * tx, 2.12, rz ] );
		parts.box( RED_LAMP(), [ 0.16, 0.12, 0.04 ], [ s * 0.7, 2.2, 6.22 ] );

	}

	parts.box( body, [ 1.75, 1.6, 2.9 ], [ 0, 1.0, 4.75 ] );
	parts.box( dark, [ 1.5, 1.0, 0.05 ], [ 0, 1.3, 6.22 ] );
	parts.cylinder( BLACK(), 0.08, 0.6, [ 0.5, 2.6, 4.2 ], 10 );
	parts.box( dark, [ 1.5, 0.75, 0.35 ], [ 0, 0.6, 6.35 ] );
	parts.box( BLACK(), [ 1.4, 0.55, 0.05 ], [ 0, 0.7, 6.53 ] );
	parts.path( body, [ [ - 0.2, 1.5, 6.2 ], [ - 0.2, 1.55, 6.6 ], [ 0.0, 1.4, 6.7 ], [ 0.2, 1.55, 6.6 ], [ 0.2, 1.5, 6.2 ] ], 0.08, 8 );
	return parts.build();

}

// --- large dozer -------------------------------------------------------------------------------

// A 70 t class crawler dozer of the D10 kind, about 8.9 m long with its blade and ripper, 4.9 m
// across the semi-U blade and 4.2 m to the top of the ROPS cab: the high-drive tracks (the
// sprocket raised behind the cab, the track a triangle round it and the two idlers), the long
// engine hood and radiator, the cab over the rear with the fuel tank behind, the semi-U blade on
// its push arms with tilt braces and two lift rams, and a single-shank ripper on its
// parallelogram at the back.
function bigDozer() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();
	const track = mat( 0x2a2a2b, { roughness: 0.8, metalness: 0.35 } );
	const shoe = 0.61;
	const gx = 2.55 / 2;

	// Tracks: front idler, rear idler and the raised sprocket; frame and rollers between the idlers.
	const wheels = [ [ - 2.05, 0.55, 0.55 ], [ 1.75, 0.55, 0.55 ], [ 1.15, 1.75, 0.72 ] ];
	for ( const s of [ - 1, 1 ] ) {

		const x = s * gx;
		trackLoop( parts, track, wheels, shoe, x, 0.11 );
		for ( let z = - 2.0; z < 1.75; z += 0.25 ) parts.box( track, [ shoe, 0.05, 0.06 ], [ x, 0, z ] );
		parts.box( dark, [ shoe * 0.55, 0.55, 3.6 ], [ x, 0.2, - 0.15 ] );
		for ( const [ z, y, r ] of wheels ) parts.rod( dark, [ x - shoe * 0.4, y, z ], [ x + shoe * 0.4, y, z ], r - 0.13, 16 );
		for ( let i = 0; i < 7; i ++ ) parts.rod( STEEL(), [ x - shoe * 0.3, 0.27, - 1.55 + i * 0.47 ], [ x + shoe * 0.3, 0.27, - 1.55 + i * 0.47 ], 0.14, 10 );
		// The sprocket's teeth show as a ring round its hub.
		parts.rod( STEEL(), [ x - shoe * 0.45, 1.75, 1.15 ], [ x + shoe * 0.45, 1.75, 1.15 ], 0.3, 12 );
		// Track guard plates (recoil housing) along the top of the frame.
		parts.box( dark, [ shoe * 0.7, 0.3, 2.0 ], [ s * gx, 0.75, - 0.9 ] );

	}

	// Main frame between the tracks, the engine hood and radiator, fenders over the tracks.
	parts.box( dark, [ 1.9, 0.9, 4.0 ], [ 0, 0.55, - 0.6 ] );
	parts.box( body, [ 1.85, 1.55, 2.9 ], [ 0, 1.35, - 1.45 ] );
	parts.box( body, [ 1.95, 1.65, 0.45 ], [ 0, 1.25, - 3.05 ] );
	parts.box( BLACK(), [ 1.6, 1.25, 0.05 ], [ 0, 1.45, - 3.29 ] );
	for ( let i = 0; i < 7; i ++ ) parts.box( dark, [ 1.6, 0.04, 0.06 ], [ 0, 1.5 + i * 0.17, - 3.31 ] );
	parts.box( BLACK(), [ 1.2, 0.03, 2.0 ], [ 0, 2.9, - 1.5 ] );
	parts.cylinder( BLACK(), 0.11, 0.75, [ 0.55, 2.9, - 0.8 ], 12 );
	parts.cylinder( STEEL(), 0.14, 0.35, [ - 0.55, 2.9, - 0.9 ], 12 );
	for ( const s of [ - 1, 1 ] ) {

		// Fenders over the tracks, rising with the track's top run to the deck.
		member( parts, body, [ 0.95, 0.08 ], [ s * ( gx + 0.05 ), 1.35, - 2.75 ], [ s * ( gx + 0.05 ), 2.3, - 0.1 ] );
		member( parts, body, [ 0.08, 0.3 ], [ s * ( gx + 0.5 ), 1.22, - 2.75 ], [ s * ( gx + 0.5 ), 2.17, - 0.1 ] );
		parts.box( HEADLAMP(), [ 0.18, 0.12, 0.05 ], [ s * 0.75, 2.75, - 3.3 ] );

	}

	// Cab on the deck over the sprocket, ROPS posts, and the fuel tank behind it.
	parts.box( body, [ 2.3, 0.15, 2.3 ], [ 0, 2.2, 1.05 ] );
	cab( parts, [ 2.0, 1.75, 1.9 ], [ 0, 2.35, 0.95 ], body );
	parts.box( AMBER(), [ 0.16, 0.1, 0.16 ], [ 0.6, 4.16, 1.5 ] );
	parts.box( body, [ 2.1, 1.3, 0.65 ], [ 0, 1.0, 2.25 ] );

	// Semi-U blade: the moldboard curved forward at the top, its end wings, the cutting edge, the
	// push arms back to the track frames and the lift rams up over the radiator.
	const bz = - 3.75;
	const bw = 4.86;
	const blade = [ [ 0.0, 0 ], [ 0.25, 0 ], [ 0.25, 0.35 ], [ 0.15, 1.2 ], [ - 0.05, 1.9 ], [ - 0.4, 2.26 ], [ - 0.5, 2.18 ], [ - 0.2, 1.8 ], [ - 0.08, 1.1 ], [ - 0.12, 0.35 ] ];
	parts.prism( body, blade.map( ( [ z, y ] ) => [ bz + z, y ] ), bw * 0.72 );
	for ( const s of [ - 1, 1 ] ) {

		// The wings, turned 22° forward from the ends of the blade.
		const wing = bw * 0.15;
		const geometry = parts.prism( body, blade, wing );
		geometry.translate( s * wing / 2, 0, 0 );
		geometry.applyMatrix4( _m.makeRotationY( s * 22 * DEG ) );
		geometry.translate( s * bw * 0.36, 0, bz );

	}

	parts.box( BLACK(), [ bw * 0.72, 0.2, 0.3 ], [ 0, 0, bz + 0.05 ] );
	for ( const s of [ - 1, 1 ] ) {

		member( parts, body, [ 0.3, 0.4 ], [ s * 1.9, 0.75, - 0.2 ], [ s * 1.6, 0.55, bz + 0.25 ] );
		pin( parts, new Vector3( s * 1.9, 0.75, - 0.2 ), 0.4, 0.15 );
		ram( parts, 0.13, [ s * 1.1, 2.2, - 2.75 ], [ s * 1.1, 1.65, bz + 0.15 ] );
		member( parts, dark, [ 0.12, 0.12 ], [ s * 1.35, 1.0, - 2.4 ], [ s * 1.35, 1.6, bz + 0.15 ] );

	}

	// Single-shank ripper: the frame on its parallelogram links and the shank down to the ground.
	const rz = 3.1;
	parts.box( dark, [ 1.6, 0.6, 0.4 ], [ 0, 0.9, 2.65 ] );
	for ( const s of [ - 1, 1 ] ) {

		member( parts, dark, [ 0.18, 0.3 ], [ s * 0.6, 1.0, 2.7 ], [ s * 0.55, 0.95, rz + 0.9 ] );
		member( parts, dark, [ 0.18, 0.3 ], [ s * 0.6, 1.55, 2.7 ], [ s * 0.55, 1.75, rz + 0.9 ] );
		ram( parts, 0.11, [ s * 0.3, 1.5, 2.75 ], [ s * 0.3, 1.25, rz + 0.75 ] );

	}

	parts.box( dark, [ 1.3, 1.0, 0.55 ], [ 0, 0.85, rz + 1.0 ] );
	member( parts, dark, [ 0.12, 0.4 ], [ 0, 2.3, rz + 1.35 ], [ 0, 0.25, rz + 1.45 ] );
	member( parts, BLACK(), [ 0.1, 0.25 ], [ 0, 0.3, rz + 1.45 ], [ 0, 0.13, rz + 1.2 ] );
	return parts.build();

}

// --- excavators --------------------------------------------------------------------------------

// A 90 t class mass excavator, the size that loads 100 t haul trucks in four passes: wide-gauge
// tracks, the house with its counterweight to a 4.7 m tail swing, the cab on the left, a 7 m
// mass boom with twin boom rams, a 2.9 m stick and a 6 yd³ rock bucket held up as if swinging
// to the truck. About 15 m long in this pose, 4.4 m wide and 6.5 m high.
function massExcavator() {

	const parts = new Parts();
	const body = YELLOW();
	carrier( parts, body, {
		track: { length: 6.35, width: 4.4, shoe: 0.65, height: 1.3 },
		swing: 1.5, width: 3.75, front: - 2.5, tail: 4.7, deck: 1.95, hood: 3.4, counterweight: 3.45,
	} );
	cab( parts, [ 1.1, 1.85, 2.1 ], [ - 1.28, 1.95, - 1.4 ], body );
	parts.box( DARK(), [ 0.9, 0.1, 1.2 ], [ - 1.28, 3.8, - 1.2 ] );
	railing( parts, [ 0.35, 1.85 ], [ - 2.3, 1.2 ], 3.4, [ 1 ], DARK() );
	for ( const x of [ - 0.4, 0.8 ] ) parts.box( DARK(), [ 0.16, 1.1, 1.6 ], [ x, 1.95, - 1.9 ] );
	const { end } = front( parts, body, { foot: [ 0.2, 2.75, - 1.9 ], boom: [ 44, 3.7, 14, 3.4 ], stick: [ - 72, 2.9 ], section: [ 0.85, 1.1 ] } );
	bucket( parts, end, 2.05, 2.0, 25 );
	return parts.build();

}

// A 30 t excavator with a 6,000 ft-lb class hydraulic hammer (about 2 t) on the stick in place of
// a bucket, its chisel down on the rock in front: the carrier, the cab, the boom and stick, the
// hammer's mounting bracket and body, and its supply and return hoses along the stick.
function hammerExcavator() {

	const parts = new Parts();
	const body = YELLOW();
	carrier( parts, body, {
		track: { length: 4.65, width: 3.19, shoe: 0.6, height: 0.95 },
		swing: 1.05, width: 2.99, front: - 2.0, tail: 3.17, deck: 1.35, hood: 2.5, counterweight: 2.45,
	} );
	cab( parts, [ 1.0, 1.7, 1.9 ], [ - 0.98, 1.35, - 1.05 ], body );
	for ( const x of [ - 0.2, 0.55 ] ) parts.box( DARK(), [ 0.1, 0.9, 1.2 ], [ x, 1.35, - 1.3 ] );
	const { end } = front( parts, body, { foot: [ 0.18, 2.1, - 1.35 ], boom: [ 50, 3.0, 6, 3.2 ], stick: [ - 52, 3.0 ], section: [ 0.55, 0.8 ] } );

	// The hammer: from the stick's end pin, its bracket, body and chisel, leaning back a little so
	// the chisel stands on the ground below.
	const length = 2.7;
	const drop = Math.asin( Math.min( 1, ( end.y - 0.02 ) / length ) );
	const axis = new Vector3( 0, - Math.sin( drop ), Math.cos( drop ) );
	const at = t => end.clone().addScaledVector( axis, t );
	member( parts, mat( 0x1f3f75, { roughness: 0.5, metalness: 0.2 } ), [ 0.6, 0.62 ], at( 0.05 ), at( 0.5 ) );
	member( parts, mat( 0x1f3f75, { roughness: 0.5, metalness: 0.2 } ), [ 0.5, 0.55 ], at( 0.5 ), at( 1.95 ) );
	member( parts, DARK(), [ 0.36, 0.4 ], at( 1.95 ), at( 2.1 ) );
	parts.rod( STEEL(), at( 2.1 ).toArray(), at( length - 0.08 ).toArray(), 0.075, 10 );
	parts.rod( STEEL(), at( length - 0.08 ).toArray(), at( length ).toArray(), [ 0.075, 0.02 ], 10 );
	const back = new Vector3( 0, Math.cos( drop ), Math.sin( drop ) );
	parts.path( BLACK(), [ end.clone().add( new Vector3( 0.18, 0.3, 0.3 ) ).toArray(), at( 0.6 ).addScaledVector( back, 0.32 ).add( new Vector3( 0.18, 0, 0 ) ).toArray() ], 0.03, 5 );
	parts.path( BLACK(), [ end.clone().add( new Vector3( - 0.18, 0.3, 0.3 ) ).toArray(), at( 0.6 ).addScaledVector( back, 0.32 ).add( new Vector3( - 0.18, 0, 0 ) ).toArray() ], 0.03, 5 );
	// A few broken rocks round the chisel.
	for ( const [ x, z, r ] of [ [ 0.5, 0.2, 0.22 ], [ - 0.4, - 0.3, 0.3 ], [ 0.1, - 0.6, 0.18 ], [ - 0.6, 0.4, 0.16 ] ] ) parts.sphere( STONE(), r, [ end.x + x, r * 0.5, at( length ).z + z ], [ 7, 5 ], [ 1.2, 0.5, 1 ] );
	return parts.build();

}

// --- large wheel loader ------------------------------------------------------------------------

// A large wheel loader of the 988 class, about 11.3 m long with its bucket on the ground, 4.2 m
// across the 8 yd³ rock bucket and 4.5 m to the top of the cab: the articulated frames (the front
// one carrying the lift arms, Z-bar tilt linkage and bucket, the rear one the cab, the engine and
// the counterweight grille), 35/65R33 tyres with fenders, and the access ladder to the cab.
function bigLoader() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();
	const R = 1.0;
	const TW = 0.89;
	const tx = 1.38;
	const fz = - 2.28;
	const rz = 2.28;

	// Wheels, axles and fenders.
	for ( const z of [ fz, rz ] ) {

		parts.rod( dark, [ - tx, R, z ], [ tx, R, z ], 0.18, 12 );
		for ( const s of [ - 1, 1 ] ) {

			tyre( parts, R, TW, [ s * tx, z ], { rim: body, lugs: 20 } );
			parts.box( body, [ TW + 0.12, 0.08, 1.4 ], [ s * tx, 2.1, z + ( z < 0 ? 0.2 : - 0.1 ) ] );

		}

	}

	// Front frame and the articulation; rear frame.
	parts.box( dark, [ 1.3, 0.9, 3.4 ], [ 0, 0.75, - 1.9 ] );
	parts.box( dark, [ 1.0, 0.9, 0.9 ], [ 0, 0.75, 0 ] );
	parts.box( dark, [ 1.6, 1.0, 4.6 ], [ 0, 0.7, 2.6 ] );
	// The towers the lift arms pivot on.
	for ( const s of [ - 1, 1 ] ) parts.box( body, [ 0.25, 1.9, 1.0 ], [ s * 0.7, 0.9, - 0.9 ] );

	// Lift arms down to the bucket, the cross tube, the lift rams and the Z-bar tilt linkage.
	const pivot = new Vector3( 0, 2.6, - 0.95 );
	const bucketPin = new Vector3( 0, 0.75, - 4.2 );
	for ( const s of [ - 1, 1 ] ) {

		const x = s * 0.92;
		member( parts, body, [ 0.22, 0.55 ], [ x, pivot.y, pivot.z ], [ x, bucketPin.y, bucketPin.z ] );
		pin( parts, new Vector3( x, pivot.y, pivot.z ), 0.4, 0.1 );
		ram( parts, 0.13, [ s * 0.72, 0.95, - 1.0 ], [ s * 0.95, 1.85, - 2.75 ] );

	}

	member( parts, body, [ 0.35, 0.35 ], [ - 0.92, 1.85, - 2.8 ], [ 0.92, 1.85, - 2.8 ] );
	const lever = new Vector3( 0, 2.1, - 2.85 );
	member( parts, body, [ 0.3, 0.3 ], lever.clone().add( new Vector3( 0, 1.0, 0.25 ) ), lever.clone().add( new Vector3( 0, - 0.5, - 0.2 ) ) );
	ram( parts, 0.15, [ 0, 2.2, - 0.6 ], lever.clone().add( new Vector3( 0, 1.0, 0.25 ) ) );
	member( parts, dark, [ 0.18, 0.2 ], lever.clone().add( new Vector3( 0, - 0.5, - 0.2 ) ), [ 0, 1.75, - 4.15 ] );

	// The rock bucket on the ground: a shell open at the front and top, side plates, the cutting
	// edge with its teeth.
	const shell = [ [ - 5.95, 0.0 ], [ - 4.35, 0.0 ], [ - 4.08, 0.35 ], [ - 4.08, 1.6 ], [ - 4.32, 2.0 ], [ - 5.15, 2.05 ], [ - 5.15, 1.9 ], [ - 4.4, 1.85 ], [ - 4.23, 1.6 ], [ - 4.23, 0.42 ], [ - 4.42, 0.13 ], [ - 5.95, 0.13 ] ];
	parts.prism( dark, shell, 4.1 );
	for ( const s of [ - 1, 1 ] ) parts.prism( dark, [ [ - 5.95, 0.0 ], [ - 4.35, 0.0 ], [ - 4.08, 0.35 ], [ - 4.08, 1.6 ], [ - 4.32, 2.0 ], [ - 5.15, 2.05 ], [ - 5.7, 0.5 ] ], 0.06, s * 2.05 );
	for ( let i = 0; i < 9; i ++ ) parts.rod( BLACK(), [ - 1.85 + i * 0.4625, 0.07, - 5.9 ], [ - 1.85 + i * 0.4625, 0.05, - 6.2 ], [ 0.07, 0.025 ], 5 );

	// Cab on the rear frame with the platform round it, the ladder down the left.
	parts.box( body, [ 2.6, 0.12, 2.2 ], [ 0, 2.35, 0.85 ] );
	cab( parts, [ 1.75, 2.0, 1.85 ], [ 0, 2.47, 0.85 ], body );
	parts.box( AMBER(), [ 0.16, 0.1, 0.16 ], [ 0.6, 4.47, 1.4 ] );
	railing( parts, [ - 1.3, 1.3 ], [ - 0.25, 1.95 ], 2.47, [ 0 ], dark );
	for ( let i = 0; i < 6; i ++ ) parts.box( dark, [ 0.5, 0.04, 0.22 ], [ - 1.6, 0.35 + i * 0.35, 0.3 + i * 0.1 ] );
	for ( const z of [ 0.15, 0.95 ] ) member( parts, dark, [ 0.05, 0.05 ], [ - 1.85, 0.3, z ], [ - 1.85, 2.4, z + 0.5 ] );

	// Engine hood, stacks, and the radiator grille and counterweight at the back.
	parts.box( body, [ 1.9, 1.5, 2.6 ], [ 0, 1.2, 3.4 ] );
	parts.box( BLACK(), [ 1.3, 0.03, 1.4 ], [ 0, 2.7, 3.3 ] );
	parts.cylinder( BLACK(), 0.1, 0.7, [ 0.55, 2.7, 2.6 ], 12 );
	parts.cylinder( STEEL(), 0.15, 0.4, [ - 0.5, 2.7, 2.6 ], 12 );
	parts.box( body, [ 2.3, 2.0, 0.55 ], [ 0, 0.6, 4.95 ] );
	parts.box( BLACK(), [ 1.9, 1.3, 0.04 ], [ 0, 1.05, 5.23 ] );
	for ( let i = 0; i < 8; i ++ ) parts.box( dark, [ 1.9, 0.04, 0.05 ], [ 0, 1.1 + i * 0.16, 5.26 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( RED_LAMP(), [ 0.16, 0.12, 0.04 ], [ s * 1.0, 2.4, 5.24 ] );
	return parts.build();

}

// --- haul truck --------------------------------------------------------------------------------

// A 100 t off-highway rigid haul truck of the 777 class, about 10.5 m long, 6.1 m wide over its
// body and 5.2 m to the top of the canopy: 27.00R49 tyres (singles in front, duals behind), the
// frame, the radiator and engine under the upper deck with its handrails and the diagonal stair
// up the front, the cab on the left of the deck, and the dump body with its canopy over the
// cab, its floor rising to the front and its tail swept up, on hoist rams.
function haulTruck() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();
	const R = 1.35;
	const TW = 0.69;
	const fz = - 2.9;
	const rz = 1.67;

	// Frame, axles and wheels.
	for ( const x of [ - 0.6, 0.6 ] ) parts.box( dark, [ 0.3, 0.8, 8.6 ], [ x, 1.15, - 0.3 ] );
	parts.rod( dark, [ - 2.0, R, fz ], [ 2.0, R, fz ], 0.2, 12 );
	parts.box( dark, [ 3.0, 0.9, 1.0 ], [ 0, R - 0.45, rz ] );
	for ( const s of [ - 1, 1 ] ) {

		tyre( parts, R, TW, [ s * 2.2, fz ], { rim: body, lugs: 22 } );
		for ( const x of [ 1.7, 2.43 ] ) tyre( parts, R, TW, [ s * x, rz ], { rim: body, lugs: 22 } );

	}

	// Front: bumper, radiator and hood under the deck, the deck itself with handrails, fenders.
	parts.box( dark, [ 4.4, 0.6, 0.4 ], [ 0, 1.15, - 4.85 ] );
	parts.box( body, [ 2.2, 1.9, 2.4 ], [ 0, 1.3, - 3.75 ] );
	parts.box( BLACK(), [ 1.9, 1.5, 0.05 ], [ 0, 1.45, - 4.97 ] );
	for ( let i = 0; i < 8; i ++ ) parts.box( dark, [ 1.9, 0.04, 0.05 ], [ 0, 1.5 + i * 0.18, - 5.0 ] );
	parts.box( body, [ 5.7, 0.12, 2.9 ], [ 0, 3.1, - 3.55 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.box( body, [ 1.0, 1.3, 0.1 ], [ s * 2.2, 1.85, - 4.25 ] );
		parts.box( HEADLAMP(), [ 0.3, 0.15, 0.05 ], [ s * 0.75, 2.9, - 4.98 ] );

	}

	railing( parts, [ - 2.8, 2.8 ], [ - 4.95, - 2.15 ], 3.22, [ 0, 1 ], dark );
	railing( parts, [ - 2.8, - 0.9 ], [ - 4.95, - 2.15 ], 3.22, [ 3 ], dark );
	// Diagonal stair up across the front from the bumper's left end to the deck.
	for ( let i = 0; i < 8; i ++ ) parts.box( dark, [ 0.25, 0.04, 0.5 ], [ - 2.6 + i * 0.28, 1.5 + i * 0.22, - 5.15 ] );
	for ( const dz of [ - 0.26, 0.26 ] ) member( parts, dark, [ 0.05, 0.15 ], [ - 2.8, 1.4, - 5.15 + dz ], [ - 0.5, 3.15, - 5.15 + dz ] );

	// Cab on the left of the deck, the air filters on the right.
	cab( parts, [ 1.8, 1.65, 1.8 ], [ - 1.85, 3.22, - 3.4 ], body );
	for ( const x of [ 1.1, 1.7 ] ) parts.cylinder( dark, 0.22, 0.9, [ x, 3.22, - 4.2 ], 14 );

	// Dump body: the floor rising from the tail to the front wall, the side walls with their top
	// rails, the front wall up to the canopy, the canopy out over the deck and cab.
	const t0 = 5.2;
	const f0 = - 2.0;
	const floor = [ [ f0, 3.0 ], [ 3.7, 2.85 ], [ t0, 3.3 ] ];
	for ( let i = 1; i < floor.length; i ++ ) member( parts, body, [ 5.9, 0.15 ], [ 0, floor[ i - 1 ][ 1 ], floor[ i - 1 ][ 0 ] ], [ 0, floor[ i ][ 1 ], floor[ i ][ 0 ] ] );
	const side = [ ...floor, [ t0, 4.25 ], [ f0, 4.75 ] ];
	for ( const s of [ - 1, 1 ] ) {

		parts.prism( body, side, 0.1, s * 2.98 );
		parts.prism( dark, [ [ t0, 4.25 ], [ f0, 4.75 ], [ f0, 4.55 ], [ t0, 4.05 ] ], 0.16, s * 3.0 );
		for ( const z of [ - 0.5, 1.2, 2.9 ] ) parts.box( body, [ 0.12, 1.2, 0.2 ], [ s * 3.08, 3.05, z ] );

	}

	parts.box( body, [ 6.05, 2.1, 0.15 ], [ 0, 2.95, f0 - 0.07 ] );
	parts.block( body, [ 6.1, 0.15, 3.1 ], [ 0, 5.12, f0 - 1.45 ], [ 0.04, 0, 0 ] );
	for ( const s of [ - 1, 1 ] ) member( parts, body, [ 0.12, 0.3 ], [ s * 3.0, 4.7, f0 ], [ s * 3.0, 5.05, - 4.9 ] );
	// Hoist rams from the frame up to the body floor.
	for ( const s of [ - 1, 1 ] ) ram( parts, 0.16, [ s * 0.95, 1.2, - 1.1 ], [ s * 0.95, 2.9, - 0.6 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( RED_LAMP(), [ 0.2, 0.15, 0.04 ], [ s * 0.7, 1.4, 4.06 ] );
	return parts.build();

}

// --- articulated water wagon -------------------------------------------------------------------

// An 8,000 gal water wagon on a 40 t articulated dump truck chassis, about 11.2 m long, 3.45 m wide
// and 3.85 m to the top of the cab: the tractor (engine hood, cab, front axle on 29.5R25 tyres),
// the articulation, the tandem bogie behind, and the elliptical tank with its baffled walkway and
// rails on top, the pump at its front, a water cannon on the front of the tank and the four
// rear spray heads on their bar.
function waterWagon() {

	const parts = new Parts();
	const body = YELLOW();
	const dark = DARK();
	const R = 0.94;
	const TW = 0.75;
	const tx = 1.35;

	// Tractor: frame, front axle and tyres, fenders, hood, cab.
	parts.box( dark, [ 1.0, 0.6, 3.6 ], [ 0, 0.75, - 3.8 ] );
	parts.rod( dark, [ - tx, R, - 3.85 ], [ tx, R, - 3.85 ], 0.14, 10 );
	for ( const s of [ - 1, 1 ] ) {

		tyre( parts, R, TW, [ s * tx, - 3.85 ], { rim: body, lugs: 18 } );
		parts.box( body, [ TW + 0.15, 0.08, 1.9 ], [ s * tx, 2.0, - 3.95 ] );
		parts.box( body, [ TW + 0.15, 0.5, 0.08 ], [ s * tx, 1.55, - 4.88 ] );
		parts.box( HEADLAMP(), [ 0.22, 0.14, 0.05 ], [ s * 0.62, 1.95, - 5.57 ] );

	}

	parts.box( body, [ 1.6, 1.15, 2.0 ], [ 0, 1.05, - 4.55 ] );
	parts.block( body, [ 1.6, 0.06, 0.6 ], [ 0, 2.1, - 5.35 ], [ - 0.5, 0, 0 ] );
	parts.box( BLACK(), [ 1.3, 0.7, 0.05 ], [ 0, 1.2, - 5.56 ] );
	parts.box( dark, [ 2.4, 0.35, 0.25 ], [ 0, 0.7, - 5.5 ] );
	cab( parts, [ 1.95, 1.65, 1.7 ], [ 0, 2.2, - 3.25 ], body );
	parts.box( body, [ 2.2, 0.12, 2.0 ], [ 0, 2.08, - 3.3 ] );
	parts.box( AMBER(), [ 0.16, 0.1, 0.16 ], [ 0.5, 3.85, - 2.75 ] );
	parts.cylinder( BLACK(), 0.08, 0.9, [ 0.85, 2.1, - 4.05 ], 10 );

	// The articulation and hitch, the rear frame and the tandem bogie.
	parts.box( dark, [ 0.9, 0.8, 0.9 ], [ 0, 0.6, - 2.0 ] );
	parts.box( dark, [ 1.1, 0.5, 6.8 ], [ 0, 0.9, 1.75 ] );
	for ( const z of [ 1.55, 3.25 ] ) {

		parts.rod( dark, [ - tx, R, z ], [ tx, R, z ], 0.14, 10 );
		for ( const s of [ - 1, 1 ] ) tyre( parts, R, TW, [ s * tx, z ], { rim: body, lugs: 18 } );

	}

	for ( const s of [ - 1, 1 ] ) {

		parts.box( dark, [ 0.35, 0.4, 2.3 ], [ s * 0.75, 0.8, 2.4 ] );
		parts.box( body, [ TW + 0.15, 0.08, 3.9 ], [ s * tx, 1.93, 2.4 ] );

	}

	// The tank: an ellipse 2.9 m across and 2.0 m high, 6.4 m long, with end caps and bands round it.
	const t0 = - 1.55;
	const t1 = 4.85;
	alongZ( parts, body, ellipse( 2.9, 2.0, 1.45 ), t0, t1 );
	for ( const z of [ t0, 0.6, 2.7, t1 ] ) band( parts, dark, 2.9, 2.0, 1.45, z );
	// Walkway and rails along the top, the fill hatch and the ladder at the back.
	parts.box( dark, [ 0.7, 0.05, 5.6 ], [ 0, 3.42, 1.7 ] );
	for ( const s of [ - 1, 1 ] ) {

		parts.rod( dark, [ s * 0.4, 3.95, - 1.0 ], [ s * 0.4, 3.95, 4.4 ], 0.025, 6 );
		for ( let z = - 1.0; z < 4.5; z += 1.35 ) parts.rod( dark, [ s * 0.4, 3.47, z ], [ s * 0.4, 3.95, z ], 0.025, 6 );

	}

	parts.cylinder( dark, 0.3, 0.15, [ 0, 3.42, 3.8 ], 16 );
	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.04, 2.4, 0.04 ], [ 0.6 + s * 0.2, 1.0, t1 + 0.12 ] );
	for ( let y = 1.2; y < 3.4; y += 0.3 ) parts.box( dark, [ 0.42, 0.03, 0.04 ], [ 0.6, y, t1 + 0.12 ] );

	// Pump at the front of the tank, the water cannon on top, the spray bar and four heads behind.
	parts.box( dark, [ 0.9, 0.6, 0.6 ], [ 0.6, 1.0, - 1.25 ] );
	parts.path( dark, [ [ 0.6, 1.6, - 1.25 ], [ 0.6, 2.95, - 1.65 ], [ 0.6, 3.5, - 1.65 ] ], 0.07, 8 );
	parts.cylinder( dark, 0.12, 0.25, [ 0.6, 3.45, - 1.65 ], 10 );
	parts.rod( BRIGHT(), [ 0.6, 3.62, - 1.65 ], [ 0.6, 3.75, - 2.25 ], [ 0.06, 0.035 ], 8 );
	parts.rod( dark, [ - 1.3, 1.25, t1 + 0.35 ], [ 1.3, 1.25, t1 + 0.35 ], 0.07, 8 );
	parts.rod( dark, [ 0, 1.3, t1 ], [ 0, 1.25, t1 + 0.35 ], 0.07, 8 );
	for ( const x of [ - 1.2, - 0.4, 0.4, 1.2 ] ) parts.box( BRIGHT(), [ 0.18, 0.12, 0.15 ], [ x, 1.1, t1 + 0.45 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( RED_LAMP(), [ 0.18, 0.12, 0.04 ], [ s * 1.25, 1.55, t1 + 0.02 ] );
	return parts.build();

}

// --- surface drill rig -------------------------------------------------------------------------

// A tracked tophammer surface drill rig of the class that drills 3 to 5 in blastholes and rock
// anchor holes, about 7.2 m long, 2.5 m wide and 8.4 m to the top of its feed standing up: the
// oscillating tracks, the power pack and compressor housing at the back with the dust collector,
// the cab on the left front, the boom out the front right to the 26 ft feed standing upright with
// its stinger on the ground, the rock drill on its cradle, the rod carousel beside the feed and
// the hose bundle up to the drill.
function drillRig() {

	const parts = new Parts();
	const body = mat( 0xd9a521, { roughness: 0.5, metalness: 0.2 } );
	const dark = DARK();
	tracks( parts, { length: 3.7, width: 2.5, shoe: 0.4, height: 0.72 }, 0, 0.75 );

	// Upper frame and the power pack housing, louvred, with its exhaust and the dust collector.
	parts.box( dark, [ 2.3, 0.3, 5.0 ], [ 0, 0.72, 0.5 ] );
	parts.box( body, [ 2.3, 1.55, 2.5 ], [ 0, 1.02, 1.75 ] );
	for ( const s of [ - 1, 1 ] ) for ( let i = 0; i < 7; i ++ ) parts.box( dark, [ 0.02, 0.04, 1.4 ], [ s * 1.15, 1.3 + i * 0.14, 1.85 ] );
	parts.cylinder( BLACK(), 0.07, 0.4, [ - 0.7, 2.57, 2.5 ], 10 );
	parts.box( body, [ 0.95, 1.4, 1.1 ], [ 0.65, 1.02, - 0.35 ] );
	parts.cylinder( dark, 0.12, 0.6, [ 0.65, 2.42, - 0.35 ], 10 );

	// Cab on the left front.
	cab( parts, [ 1.15, 1.9, 1.6 ], [ - 0.55, 1.02, - 1.2 ], body );
	parts.box( AMBER(), [ 0.14, 0.1, 0.14 ], [ - 0.55, 2.92, - 0.6 ] );

	// Boom out the front, the feed's cradle and the feed standing upright with its stinger down.
	const fz = - 3.75;
	const fx = 0.35;
	member( parts, body, [ 0.32, 0.4 ], [ 0.55, 1.3, - 1.8 ], [ fx, 2.1, fz + 0.45 ] );
	ram( parts, 0.08, [ 0.55, 0.95, - 1.9 ], [ fx, 1.6, fz + 0.5 ] );
	parts.box( dark, [ 0.5, 0.8, 0.35 ], [ fx, 1.75, fz + 0.3 ] );
	parts.box( body, [ 0.3, 8.1, 0.24 ], [ fx, 0.3, fz ] );
	parts.box( dark, [ 0.34, 0.3, 0.3 ], [ fx, 0, fz ] );
	parts.box( dark, [ 0.36, 0.25, 0.3 ], [ fx, 8.15, fz ] );
	// Rock drill on its cradle high on the feed, the drill string down through the centralizer.
	parts.box( mat( 0x3d4044, { roughness: 0.5, metalness: 0.4 } ), [ 0.42, 1.0, 0.45 ], [ fx, 6.4, fz - 0.3 ] );
	parts.rod( BRIGHT(), [ fx, 0.35, fz - 0.3 ], [ fx, 6.4, fz - 0.3 ], 0.035, 8 );
	parts.box( dark, [ 0.4, 0.25, 0.35 ], [ fx, 0.5, fz - 0.25 ] );
	// Rod carousel beside the feed with its rods.
	parts.cylinder( dark, 0.24, 0.12, [ fx - 0.42, 1.5, fz - 0.1 ], 14 );
	parts.cylinder( dark, 0.24, 0.12, [ fx - 0.42, 5.5, fz - 0.1 ], 14 );
	for ( let i = 0; i < 7; i ++ ) {

		const a = i / 7 * Math.PI * 2;
		parts.cylinder( BRIGHT(), 0.025, 4.0, [ fx - 0.42 + Math.cos( a ) * 0.17, 1.55, fz - 0.1 + Math.sin( a ) * 0.17 ], 6 );

	}

	// Hoses up from the boom to the drill, looping out at the top.
	parts.path( BLACK(), [ [ 0.6, 1.9, - 1.9 ], [ fx + 0.25, 3.0, fz + 0.4 ], [ fx + 0.3, 7.3, fz + 0.3 ], [ fx + 0.15, 7.1, fz - 0.3 ] ], 0.05, 6 );
	// Dust hood at the collar of the hole and its hose back to the collector.
	parts.cylinder( dark, 0.22, 0.25, [ fx, 0.05, fz - 0.3 ], 12 );
	parts.path( BLACK(), [ [ fx + 0.2, 0.2, fz - 0.2 ], [ 0.8, 0.5, - 2.2 ], [ 0.75, 1.2, - 0.9 ] ], 0.08, 8 );
	return parts.build();

}

// --- explosives magazine -----------------------------------------------------------------------

// A Type 2 outdoor explosives magazine, the 8 x 8 ft size with a 7 ft high box (about 2.3 m to the
// top on its skids): a welded plate steel box lined against bullets and fire, on two steel skids
// with tow eyes, double doors at the front with heavy hinges and a hood over the padlock hasp,
// screened vents low on the sides, lifting lugs at the top corners and "EXPLOSIVES" signs.
function magazine() {

	const parts = new Parts();
	const body = paint( 0xe3e1da );
	const dark = DARK();
	const S = 8 * FT;
	const H = 7 * FT;
	const skid = 0.15;

	for ( const s of [ - 1, 1 ] ) {

		parts.box( dark, [ 0.15, skid, S + 0.3 ], [ s * ( S / 2 - 0.25 ), 0, 0 ] );
		for ( const e of [ - 1, 1 ] ) parts.rod( dark, [ s * ( S / 2 - 0.25 ), skid * 0.5, e * ( S / 2 + 0.15 ) ], [ s * ( S / 2 - 0.25 ), skid * 0.5, e * ( S / 2 + 0.25 ) ], 0.05, 8 );

	}

	parts.box( body, [ S, H, S ], [ 0, skid, 0 ] );
	parts.box( body, [ S + 0.06, 0.06, S + 0.06 ], [ 0, skid + H - 0.03, 0 ] );
	for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) parts.box( dark, [ 0.12, 0.12, 0.03 ], [ sx * ( S / 2 - 0.1 ), skid + H, sz * ( S / 2 - 0.1 ) ] );

	// Double doors on the front, hinges at their outer edges and the hood over the hasp between.
	const z = - S / 2;
	const doorW = 1.0;
	const doorH = 1.85;
	for ( const s of [ - 1, 1 ] ) {

		parts.box( body, [ doorW - 0.01, doorH, 0.04 ], [ s * doorW / 2, skid + 0.1, z - 0.02 ] );
		for ( const y of [ 0.3, 1.0, 1.7 ] ) parts.box( dark, [ 0.06, 0.18, 0.06 ], [ s * doorW, skid + y, z - 0.04 ] );
		parts.box( dark, [ 0.03, 0.2, 0.03 ], [ s * 0.08, skid + 1.0, z - 0.055 ] );

	}

	parts.box( dark, [ 0.25, 0.3, 0.2 ], [ 0, skid + 0.85, z - 0.1 ] );
	parts.box( dark, [ 2.15, 0.06, 0.04 ], [ 0, skid + doorH + 0.12, z - 0.02 ] );
	// Vents low on each side.
	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.03, 0.15, 0.3 ], [ s * ( S / 2 + 0.01 ), skid + 0.2, 0.6 ] );

	// Signs on the doors and both sides.
	const sign = drawn( 'explosives sign', [ 512, 192 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#ffffff';
		ctx.fillRect( 0, 0, w, h );
		ctx.strokeStyle = '#c8102e';
		ctx.lineWidth = 10;
		ctx.strokeRect( 8, 8, w - 16, h - 16 );
		ctx.fillStyle = '#c8102e';
		ctx.font = 'bold 92px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText( 'EXPLOSIVES', w / 2, h * 0.42, w * 0.88 );
		ctx.font = 'bold 34px sans-serif';
		ctx.fillText( 'KEEP FIRE AWAY', w / 2, h * 0.78, w * 0.8 );

	} );
	const [ sw, sh ] = [ 0.9, 0.34 ];
	parts.add( sign, new PlaneGeometry( sw, sh ), _m.makeRotationY( Math.PI ).setPosition( 0, skid + 1.55, z - 0.045 ) );
	for ( const s of [ - 1, 1 ] ) parts.add( sign, new PlaneGeometry( sw, sh ), _m.makeRotationY( s * Math.PI / 2 ).setPosition( s * ( S / 2 + 0.005 ), skid + 1.5, 0 ) );
	return parts.build();

}

// --- impact crusher ----------------------------------------------------------------------------

// A tracked horizontal shaft impact crusher of the 1,200 mm rotor class used for recycled concrete
// and asphalt and for limestone, about 17.6 m long and 9 m wide working: the feed hopper at the
// back over a vibrating feeder and pre-screen, the impactor's housing mid-machine with its apron
// adjusters, the power unit under the hopper's front, the main product conveyor out the front
// under a magnet that pulls the rebar off, and the side conveyor taking the pre-screened fines out
// to the right.
function impactCrusher() {

	const parts = new Parts();
	const body = paint( 0xc8461f );
	const dark = DARK();
	tracks( parts, { length: 4.4, width: 3.0, shoe: 0.5, height: 0.85 }, 0, 1.4 );
	parts.box( body, [ 2.5, 0.55, 12.0 ], [ 0, 0.85, 1.6 ] );

	// Feed hopper, the vibrating feeder in it and the pre-screen at its front.
	const hz = 5.9;
	parts.box( body, [ 2.5, 1.2, 4.0 ], [ 0, 1.4, hz ] );
	for ( const s of [ - 1, 1 ] ) parts.block( body, [ 0.08, 1.2, 4.0 ], [ s * 1.6, 3.1, hz ], [ 0, 0, - s * 32 * DEG ] );
	parts.block( body, [ 3.4, 1.2, 0.08 ], [ 0, 3.1, hz + 2.25 ], [ 32 * DEG, 0, 0 ] );
	parts.box( STONE(), [ 2.3, 0.1, 3.6 ], [ 0, 2.6, hz ] );
	parts.cylinder( STONE(), 1.4, 0.7, [ 0, 2.65, hz + 0.6 ], 14, 0.3 );
	parts.block( dark, [ 2.2, 0.5, 2.0 ], [ 0, 2.4, 3.2 ], [ 0.12, 0, 0 ] );

	// The impactor: its lower housing, the rotor housing rounded over the top, the hinged top
	// with the apron adjusting rods, and a walkway beside it.
	const iz = 1.0;
	parts.box( body, [ 2.6, 1.6, 2.6 ], [ 0, 1.4, iz ] );
	const top = [];
	for ( let i = 0; i <= 10; i ++ ) {

		const a = Math.PI * i / 10;
		top.push( [ iz + Math.cos( a ) * 1.3, 3.0 + Math.sin( a ) * 1.1 ] );

	}

	parts.prism( body, top, 2.4 );
	parts.rod( dark, [ - 1.4, 3.0, iz ], [ 1.4, 3.0, iz ], 0.35, 16 );
	for ( const s of [ - 1, 1 ] ) for ( const z of [ iz - 0.6, iz + 0.5 ] ) parts.rod( BRIGHT(), [ s * 0.8, 3.6, z ], [ s * 0.8, 4.4, z + 0.1 ], 0.05, 6 );
	parts.box( STEEL(), [ 0.8, 0.05, 4.0 ], [ - 1.7, 2.4, 1.6 ] );
	railing( parts, [ - 2.1, - 2.1 ], [ - 0.4, 3.6 ], 2.45, [ 1 ], dark );

	// Power unit behind the impactor, its exhaust, the fuel tank under the chassis front.
	parts.box( body, [ 2.4, 1.3, 1.8 ], [ 0, 1.4, - 1.3 ] );
	parts.box( dark, [ 0.04, 0.7, 1.2 ], [ 1.21, 1.7, - 1.3 ] );
	parts.cylinder( BLACK(), 0.08, 0.5, [ - 0.7, 2.7, - 1.6 ], 10 );

	// Main conveyor out the front, the overband magnet over it; side conveyor out to the right.
	conveyor( parts, [ 0, 0.75, 0.0 ], [ 0, 3.9, - 9.6 ], 1.2, body );
	parts.box( dark, [ 1.4, 0.45, 1.8 ], [ 0, 3.1, - 4.7 ] );
	parts.path( body, [ [ 1.3, 1.4, - 2.3 ], [ 1.3, 3.8, - 4.7 ], [ 0, 3.8, - 4.7 ], [ 0, 3.55, - 4.7 ] ], 0.07, 6 );
	parts.rod( body, [ 0, 1.0, - 3.0 ], [ 0, 2.2, - 5.8 ], 0.09, 6 );
	conveyor( parts, [ 1.0, 1.25, 3.4 ], [ 7.8, 3.6, 3.0 ], 0.65, body );
	parts.rod( body, [ 1.25, 1.2, 3.2 ], [ 4.6, 2.4, 3.1 ], 0.07, 6 );
	return parts.build();

}

// --- wash plant --------------------------------------------------------------------------------

// A portable aggregate wash plant of the kind that washes and sizes sand and gravel, about 21 m
// long, 11 m wide and 6 m high set up: the trailer chassis on its jacks, the 6 x 16 ft double-deck
// rinse screen up at the back with its spray bars and water manifold, the 36 in x 25 ft sand screw
// along the left side lifting washed sand out of its tub onto a pile, and three conveyors: the
// feed conveyor in from behind and the two product conveyors off the screen decks to the right.
function washPlant() {

	const parts = new Parts();
	const body = paint( 0x3c6e4a );
	const dark = DARK();

	// Chassis: rails, the gooseneck at the front, jacks, and the axles at the back.
	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.25, 0.45, 13.0 ], [ s * 1.05, 1.15, 0.5 ] );
	parts.box( dark, [ 2.3, 0.4, 2.2 ], [ 0, 1.6, - 6.6 ] );
	for ( const [ x, z ] of [ [ - 1.1, - 6.8 ], [ 1.1, - 6.8 ], [ - 1.1, - 1.0 ], [ 1.1, - 1.0 ], [ - 1.1, 4.0 ], [ 1.1, 4.0 ] ] ) {

		parts.box( dark, [ 0.2, 1.3, 0.2 ], [ x, 0.1, z ] );
		parts.box( dark, [ 0.45, 0.1, 0.45 ], [ x, 0, z ] );

	}

	for ( const z of [ 5.3, 6.45 ] ) {

		parts.rod( dark, [ - 1.0, 0.5, z ], [ 1.0, 0.5, z ], 0.07, 8 );
		for ( const s of [ - 1, 1 ] ) for ( const d of [ 0.82, 1.1 ] ) tyre( parts, 0.5, 0.26, [ s * d, z ], { rim: STEEL() } );

	}

	// The screen: a double-deck box 1.83 m by 4.9 m sloping down to the front on its support
	// frame, spray bars across it fed by the manifold, and the walkway round it.
	const slope = 18 * DEG;
	const mid = new Vector3( 0, 4.0, 2.8 );
	const len = 4.9;
	parts.block( body, [ 2.1, 1.1, len ], mid.toArray(), [ - slope, 0, 0 ] );
	const dir = new Vector3( 0, Math.sin( slope ), Math.cos( slope ) );
	for ( let i = 0; i < 2; i ++ ) {

		const lip = mid.clone().addScaledVector( dir, - len / 2 - 0.25 - i * 0.2 ).add( new Vector3( 0, 0.3 - i * 0.45, 0 ) );
		parts.block( STEEL(), [ 1.9, 0.05, 0.6 ], lip.toArray(), [ - slope, 0, 0 ] );

	}

	for ( let i = 0; i < 6; i ++ ) {

		const p = mid.clone().addScaledVector( dir, - len / 2 + 0.5 + i * 0.75 ).add( new Vector3( 0, 0.75, 0 ) );
		parts.rod( BRIGHT(), [ - 0.95, p.y, p.z ], [ 0.95, p.y, p.z ], 0.04, 6 );

	}

	const hi = mid.clone().addScaledVector( dir, len / 2 );
	parts.path( dark, [ [ 1.15, 1.6, 5.0 ], [ 1.15, hi.y + 0.75, hi.z - 0.2 ], [ 1.15, mid.y - 0.15, mid.z - len / 2 + 0.3 ] ], 0.08, 8 );
	for ( const [ z, h ] of [ [ 1.0, 2.0 ], [ 4.6, 3.0 ] ] ) for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.2, h, 0.2 ], [ s * 0.95, 1.6, z ] );
	parts.box( body, [ 2.0, 1.0, 0.8 ], [ 0, hi.y + 0.1, hi.z + 0.25 ] );
	parts.box( STEEL(), [ 0.7, 0.05, 4.4 ], [ 1.45, 2.9, 2.8 ] );
	railing( parts, [ 1.8, 1.8 ], [ 0.6, 5.0 ], 2.95, [ 1 ], dark );

	// Fines chute down from under the screen to the sand screw's tub.
	parts.block( body, [ 1.6, 0.06, 2.0 ], [ - 0.7, 2.55, 1.6 ], [ - 0.35, 0, - 0.35 ] );

	// Sand screw: the tub inclined along the left, the screw's flights showing in it, the
	// drive at the top end, the tub's pool end at the bottom, and the washed sand pile.
	const low = new Vector3( - 2.3, 0.55, 2.4 );
	const high = new Vector3( - 2.3, 3.0, - 4.8 );
	const along = high.clone().sub( low ).normalize();
	member( parts, body, [ 1.1, 0.9 ], low, high );
	parts.box( body, [ 1.6, 1.6, 1.6 ], [ - 2.0, 0, 2.9 ] );
	for ( let t = 0.6; t < low.distanceTo( high ) - 0.4; t += 0.45 ) {

		const p = low.clone().addScaledVector( along, t ).add( new Vector3( 0, 0.5, 0 ) );
		parts.block( STEEL(), [ 0.85, 0.05, 0.12 ], p.toArray(), [ 0, 0, 0.5 ] );

	}

	const driveEnd = high.clone().addScaledVector( along, 0.3 );
	parts.box( dark, [ 0.8, 0.6, 0.7 ], [ driveEnd.x, driveEnd.y + 0.3, driveEnd.z ] );
	parts.cylinder( dark, 0.22, 0.5, [ driveEnd.x + 0.3, driveEnd.y + 0.9, driveEnd.z ], 12 );
	for ( const t of [ 0.45, 0.85 ] ) {

		const p = low.clone().lerp( high, t );
		parts.box( dark, [ 0.15, p.y - 0.45, 0.15 ], [ p.x, 0, p.z ] );
		parts.box( dark, [ 0.4, 0.05, 0.4 ], [ p.x, 0, p.z ] );

	}
	// The washed sand pile under the screw's top end, out to the left clear of the chassis jacks.
	parts.cylinder( SAND(), 2.0, 1.4, [ - 3.0, 0, - 5.7 ], 18, 0.2 );

	// Conveyors: the feed in from behind to the screen's feed box, and the two product belts out
	// to the right off the screen's lips, each with its stone pile.
	conveyor( parts, [ 0, 0.9, 13.5 ], [ 0, 5.35, hi.z + 0.3 ], 0.9, body );
	for ( const z of [ 9.0, 11.5 ] ) parts.rod( body, [ 0, 0, z ], [ 0, 1.0 + ( 13.5 - z ) * 0.5, z ], 0.07, 6 );
	conveyor( parts, [ 0.8, 2.75, 0.15 ], [ 8.6, 5.0, - 0.4 ], 0.65, body );
	conveyor( parts, [ 0.6, 2.3, - 0.3 ], [ 6.2, 4.4, - 6.2 ], 0.65, body );
	for ( const [ a, b ] of [ [ [ 1.2, 1.6, 0.0 ], [ 5.0, 3.6, - 0.2 ] ], [ [ 1.1, 1.6, - 1.0 ], [ 3.8, 3.0, - 3.6 ] ] ] ) parts.rod( body, a, b, 0.07, 6 );
	parts.cylinder( STONE(), 2.0, 1.8, [ 8.9, 0, - 0.4 ], 16, 0.2 );
	parts.cylinder( STONE(), 1.8, 1.6, [ 6.5, 0, - 6.5 ], 16, 0.2 );
	return parts.build();

}

// --- truck scale and scale house ---------------------------------------------------------------

// An above-ground truck scale 70 ft long and 11 ft wide, the usual size for tri-axles and
// tractor-trailers: three weighbridge modules with concrete decks in steel side channels, 14 in
// above the ground on their load cells, low curb rails along the sides, and a 10 ft concrete ramp
// at each end. 90 ft (27.4 m) long in all.
function truckScale() {

	const parts = new Parts();
	const steel = paint( 0x34557d );
	const dark = DARK();
	const L = 70 * FT;
	const W = 11 * FT;
	const H = 14 * IN;
	const ramp = 10 * FT;

	// Three modules: the deck slab, side channels, the gaps at the joints, and a load cell box at
	// each corner.
	const module = L / 3;
	for ( let i = 0; i < 3; i ++ ) {

		const z = - L / 2 + module * ( i + 0.5 );
		parts.box( CONCRETE(), [ W - 0.1, 0.2, module - 0.03 ], [ 0, H - 0.2, z ] );
		for ( const s of [ - 1, 1 ] ) {

			parts.box( steel, [ 0.1, H - 0.05, module - 0.03 ], [ s * ( W / 2 - 0.05 ), 0.05, z ] );
			for ( const e of [ - 1, 1 ] ) parts.box( dark, [ 0.3, 0.25, 0.3 ], [ s * ( W / 2 + 0.1 ), 0, z + e * ( module / 2 - 0.3 ) ] );

		}

		parts.box( steel, [ W - 0.2, H - 0.25, 0.15 ], [ 0, 0.05, z ] );

	}

	for ( const s of [ - 1, 1 ] ) {

		parts.box( steel, [ 0.15, 0.15, L - 0.1 ], [ s * ( W / 2 - 0.12 ), H, 0 ] );
		for ( let i = 0; i <= 6; i ++ ) parts.box( steel, [ 0.15, 0.15, 0.12 ], [ s * ( W / 2 - 0.12 ), H - 0.15, - L / 2 + 0.2 + i * ( L - 0.4 ) / 6 ] );

	}

	// Ramps at each end, with a steel nosing where they meet the deck.
	for ( const e of [ - 1, 1 ] ) {

		const z0 = e * L / 2;
		const z1 = e * ( L / 2 + ramp );
		parts.prism( CONCRETE(), e > 0 ? [ [ z0, 0 ], [ z1, 0 ], [ z0, H ] ] : [ [ z1, 0 ], [ z0, 0 ], [ z0, H ] ], W );
		parts.box( dark, [ W, 0.02, 0.1 ], [ 0, H - 0.01, z0 + e * 0.05 ] );

	}

	return parts.build();

}

// A scale house 12 ft wide and 8 ft deep: the weighmaster's booth beside the scale, with a big
// sliding window and ticket shelf on the front facing the scale, a smaller window at the back and
// left end, the door on the right end up a short flight of steps with a landing and rail, a
// wall-mounted air conditioner, and a shallow roof with overhangs. About 3.1 m high on its skids.
function scaleHouse() {

	const parts = new Parts();
	const siding = paint( 0xd9d0b9 );
	const trim = WHITE();
	const dark = DARK();
	const W = 12 * FT;
	const D = 8 * FT;
	const floor = 0.3;
	const wall = 8 * FT;

	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ W, floor, 0.15 ], [ 0, 0, s * ( D / 2 - 0.2 ) ] );
	parts.box( siding, [ W, wall, D ], [ 0, floor, 0 ] );
	for ( let y = floor + 0.2; y < floor + wall; y += 0.2 ) parts.box( mat( 0xcac1aa, { roughness: 0.7 } ), [ W + 0.01, 0.015, D + 0.01 ], [ 0, y, 0 ] );
	for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) parts.box( trim, [ 0.08, wall, 0.08 ], [ sx * ( W / 2 - 0.02 ), floor, sz * ( D / 2 - 0.02 ) ] );
	// Roof: a shallow slope down to the back with overhangs and a fascia.
	parts.prism( trim, [ [ - D / 2 - 0.35, floor + wall + 0.25 ], [ D / 2 + 0.35, floor + wall + 0.05 ], [ D / 2 + 0.35, floor + wall - 0.05 ], [ - D / 2 - 0.35, floor + wall + 0.12 ] ], W + 0.6 );
	parts.prism( siding, [ [ - D / 2, floor + wall ], [ D / 2, floor + wall ], [ D / 2, floor + wall + 0.06 ], [ - D / 2, floor + wall + 0.2 ] ], W );

	// Front: the sliding window and ticket shelf; a window at the back and on the left end.
	const z = - D / 2;
	parts.box( trim, [ 1.9, 1.15, 0.06 ], [ - 0.3, floor + 0.95, z - 0.02 ] );
	parts.box( GLASS(), [ 1.75, 1.0, 0.04 ], [ - 0.3, floor + 1.02, z - 0.04 ] );
	parts.box( trim, [ 0.04, 1.0, 0.05 ], [ - 0.3, floor + 1.02, z - 0.06 ] );
	parts.box( trim, [ 1.2, 0.05, 0.35 ], [ - 0.3, floor + 0.92, z - 0.17 ] );
	for ( const s of [ - 1, 1 ] ) parts.block( dark, [ 0.03, 0.25, 0.03 ], [ - 0.3 + s * 0.5, floor + 0.8, z - 0.1 ], [ - 0.8, 0, 0 ] );
	parts.box( trim, [ 1.0, 0.8, 0.06 ], [ 0.6, floor + 1.15, - z + 0.02 ] );
	parts.box( GLASS(), [ 0.9, 0.7, 0.04 ], [ 0.6, floor + 1.2, - z + 0.04 ] );
	parts.box( trim, [ 0.06, 0.8, 0.9 ], [ - W / 2 - 0.02, floor + 1.15, 0 ] );
	parts.box( GLASS(), [ 0.04, 0.7, 0.8 ], [ - W / 2 - 0.04, floor + 1.2, 0 ] );
	// Air conditioner through the back wall.
	parts.box( paint( 0xc7c9c8 ), [ 0.65, 0.45, 0.35 ], [ - 1.0, floor + 1.4, - z + 0.17 ] );

	// Door on the right end, steps up to a landing and a handrail.
	const x = W / 2;
	parts.box( trim, [ 0.06, 2.05, 0.95 ], [ x + 0.02, floor, 0.35 ] );
	parts.box( paint( 0x8a8d8f ), [ 0.04, 1.95, 0.85 ], [ x + 0.04, floor + 0.02, 0.35 ] );
	parts.box( BRIGHT(), [ 0.04, 0.04, 0.12 ], [ x + 0.07, floor + 1.0, 0.0 ] );
	parts.box( GALV(), [ 1.0, 0.05, 1.2 ], [ x + 0.5, floor - 0.05, 0.35 ] );
	for ( const [ dx, y ] of [ [ 1.25, 0.1 ] ] ) parts.box( GALV(), [ 0.3, 0.05, 1.0 ], [ x + dx, y, 0.35 ] );
	for ( const sz of [ - 1, 1 ] ) {

		parts.box( GALV(), [ 0.05, floor, 0.05 ], [ x + 0.95, 0, 0.35 + sz * 0.55 ] );
		parts.rod( GALV(), [ x + 0.95, floor, 0.35 + sz * 0.58 ], [ x + 0.95, floor + 0.95, 0.35 + sz * 0.58 ], 0.02, 6 );
		parts.rod( GALV(), [ x + 0.95, floor + 0.95, 0.35 + sz * 0.58 ], [ x + 0.05, floor + 0.95, 0.35 + sz * 0.58 ], 0.02, 6 );

	}

	parts.box( AMBER(), [ 0.1, 0.1, 0.1 ], [ x - 0.2, floor + wall + 0.1, - D / 2 + 0.2 ] );
	return parts.build();

}

// --- message board trailer ---------------------------------------------------------------------

// A portable changeable message sign trailer of the full-matrix kind (about 3.2 x 1.9 m face),
// raised to work with its bottom 2.4 m up (4.4 m to the top): the trailer frame on a single axle
// with its drawbar and jack, four levelling jacks, the battery box with solar panels tilted over
// the drawbar, the mast and the sign cabinet facing traffic at the back (-Z), showing ROAD WORK
// AHEAD in amber.
function messageBoard() {

	const parts = new Parts();
	const body = paint( 0xe8771e );
	const dark = DARK();

	// Frame, axle, wheels and fenders, drawbar, jacks.
	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.12, 0.15, 3.0 ], [ s * 0.8, 0.5, 0.4 ] );
	for ( const z of [ - 1.0, 0.4, 1.8 ] ) parts.box( dark, [ 1.6, 0.12, 0.1 ], [ 0, 0.5, z ] );
	parts.rod( dark, [ - 0.95, 0.35, 0.3 ], [ 0.95, 0.35, 0.3 ], 0.05, 8 );
	for ( const s of [ - 1, 1 ] ) {

		tyre( parts, 0.35, 0.2, [ s * 1.0, 0.3 ] );
		parts.box( body, [ 0.28, 0.04, 0.9 ], [ s * 1.0, 0.75, 0.3 ] );
		member( parts, dark, [ 0.08, 0.1 ], [ s * 0.8, 0.55, 1.8 ], [ 0, 0.55, 3.2 ] );

	}

	parts.box( dark, [ 0.16, 0.12, 0.3 ], [ 0, 0.5, 3.3 ] );
	parts.cylinder( STEEL(), 0.04, 0.5, [ 0, 0, 2.95 ], 8 );
	for ( const [ x, z ] of [ [ - 0.8, - 0.95 ], [ 0.8, - 0.95 ], [ - 0.8, 1.75 ], [ 0.8, 1.75 ] ] ) {

		parts.cylinder( STEEL(), 0.035, 0.5, [ x, 0, z ], 8 );
		parts.box( dark, [ 0.18, 0.03, 0.18 ], [ x, 0, z ] );

	}

	// Battery box and the solar panels on a frame over the front of the trailer.
	parts.box( body, [ 1.3, 0.55, 0.9 ], [ 0, 0.62, 1.4 ] );
	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.05, 0.8, 0.05 ], [ s * 0.6, 1.17, 1.4 ] );
	parts.block( mat( 0x1c2a44, { roughness: 0.25, metalness: 0.4 } ), [ 1.6, 0.04, 1.1 ], [ 0, 2.05, 1.4 ], [ 0.45, 0, 0 ] );
	parts.block( STEEL(), [ 1.66, 0.03, 1.16 ], [ 0, 2.03, 1.4 ], [ 0.45, 0, 0 ] );

	// Mast up from the middle of the frame, the sign cabinet on it, its face to the back.
	parts.box( body, [ 0.6, 0.5, 0.5 ], [ 0, 0.62, 0.0 ] );
	parts.box( dark, [ 0.2, 2.2, 0.2 ], [ 0, 0.6, 0.0 ] );
	parts.box( STEEL(), [ 0.15, 1.1, 0.15 ], [ 0, 2.8, 0.0 ] );
	const [ fw, fh ] = [ 3.2, 1.95 ];
	const bottom = 2.42;
	parts.box( body, [ fw, fh, 0.35 ], [ 0, bottom, 0.0 ] );
	const face = drawn( 'vms face road work ahead', [ 512, 312 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#0d0e10';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#ffb000';
		ctx.font = 'bold 118px monospace';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText( 'ROAD WORK', w / 2, h * 0.3, w * 0.94 );
		ctx.fillText( 'AHEAD', w / 2, h * 0.72, w * 0.94 );
		// A dark grid over the letters breaks them into the sign's pixels.
		ctx.fillStyle = '#0d0e10';
		for ( let x = 0; x < w; x += 7 ) ctx.fillRect( x, 0, 2, h );
		for ( let y = 0; y < h; y += 7 ) ctx.fillRect( 0, y, w, 2 );

	} );
	parts.add( face, new PlaneGeometry( fw - 0.16, fh - 0.16 ), _m.makeRotationY( Math.PI ).setPosition( 0, bottom + fh / 2, - 0.18 ) );
	parts.box( dark, [ fw + 0.04, 0.06, 0.37 ], [ 0, bottom + fh, 0.0 ] );
	return parts.build();

}

// --- truck-mounted attenuator ------------------------------------------------------------------

// A truck-mounted attenuator: a 26,000 lb single-axle truck (about 7.6 m long) ballasted as a
// shadow vehicle, its flatbed with the ballast block, the arrow board raised behind the cab, and
// the TMA crash cushion unfolded behind on its frame, its back covered in chevrons; about 11.6 m
// long in all and 3.9 m to the top of the raised arrow board.
function tmaTruck() {

	const parts = new Parts();
	const body = WHITE();
	const dark = DARK();
	const front = - 4.0;
	const back = 3.6;
	const { cabBack, frameTop } = truck( parts, { colour: 0xe9e8e2, front, rear: 2.0, back, axles: 1 } );

	// Flatbed with stake pockets, headache rack, and the ballast block.
	const d0 = cabBack + 0.2;
	parts.box( body, [ TRUCK_WIDTH - 0.1, 0.15, back - d0 ], [ 0, frameTop, ( d0 + back ) / 2 ] );
	parts.box( dark, [ TRUCK_WIDTH - 0.1, 0.12, back - d0 ], [ 0, frameTop - 0.12, ( d0 + back ) / 2 ] );
	parts.box( CONCRETE(), [ 1.6, 0.7, 1.2 ], [ 0, frameTop + 0.15, 2.4 ] );
	parts.box( dark, [ TRUCK_WIDTH - 0.2, 1.0, 0.1 ], [ 0, frameTop + 0.15, d0 + 0.1 ] );

	// Arrow board raised on its post behind the cab.
	const ab = [ 2.4, 1.2 ];
	const abY = 2.65;
	parts.box( dark, [ 0.15, abY - frameTop, 0.15 ], [ 0, frameTop + 0.15, d0 + 0.35 ] );
	parts.box( paint( 0xe8771e ), [ ab[ 0 ], ab[ 1 ], 0.15 ], [ 0, abY, d0 + 0.45 ] );
	parts.add( arrowFace(), new PlaneGeometry( ab[ 0 ] - 0.1, ab[ 1 ] - 0.1 ), _m.makeTranslation( 0, abY + ab[ 1 ] / 2, d0 + 0.53 ) );

	// The attenuator: the mounting frame on the truck's back, the strut frame and the cushion
	// cartridge behind, the chevron panel on its back, lamps.
	parts.box( dark, [ 2.2, 0.5, 0.25 ], [ 0, 0.55, back + 0.1 ] );
	for ( const s of [ - 1, 1 ] ) for ( const y of [ 0.45, 1.15 ] ) member( parts, dark, [ 0.1, 0.1 ], [ s * 0.9, 0.85, back + 0.2 ], [ s * 1.0, y, back + 0.95 ] );
	const c0 = back + 0.95;
	const c1 = c0 + 3.0;
	parts.box( paint( 0xf5c400 ), [ 2.3, 0.85, c1 - c0 ], [ 0, 0.35, ( c0 + c1 ) / 2 ] );
	for ( let i = 1; i < 4; i ++ ) parts.box( dark, [ 2.32, 0.87, 0.04 ], [ 0, 0.34, c0 + i * ( c1 - c0 ) / 4 ] );
	parts.add( chevrons(), new PlaneGeometry( 2.25, 0.8 ), _m.makeTranslation( 0, 0.775, c1 + 0.005 ) );
	for ( const s of [ - 1, 1 ] ) parts.box( RED_LAMP(), [ 0.12, 0.12, 0.04 ], [ s * 1.0, 1.22, c1 - 0.05 ] );
	return parts.build();

}

// --- hydroseeder truck -------------------------------------------------------------------------

// A 3,000 gal hydroseeder on a tandem-axle truck, about 9.6 m long and 4.1 m to the top of the deck
// tower's rail: the elliptical tank with its agitator drive at the front, the engine and pump unit
// behind the cab, the hose reel on the front corner of the deck, and the deck tower over the
// back of the tank with its rails, ladder and the discharge cannon on its swivel.
function hydroseeder() {

	const parts = new Parts();
	const body = paint( 0x2e7d4f );
	const dark = DARK();
	const front = - 5.0;
	const back = 4.6;
	const { cabBack, frameTop } = truck( parts, { colour: 0xe9e8e2, front, rear: 2.8, back } );

	// Subframe, engine and pump unit behind the cab.
	const d0 = cabBack + 0.2;
	parts.box( dark, [ 2.3, 0.15, back - d0 ], [ 0, frameTop, ( d0 + back ) / 2 ] );
	const deck = frameTop + 0.15;
	parts.box( body, [ 2.0, 1.1, 1.1 ], [ 0, deck, d0 + 0.6 ] );
	for ( let i = 0; i < 6; i ++ ) parts.box( dark, [ 0.012, 0.035, 0.7 ], [ 1.005, deck + 0.3 + i * 0.1, d0 + 0.6 ] );
	parts.cylinder( BLACK(), 0.05, 0.6, [ - 0.75, deck + 1.1, d0 + 0.3 ], 10 );

	// The tank: an ellipse 2.3 m across and 1.6 m high, 3.9 m long, its agitator drive at the front.
	const t0 = d0 + 1.3;
	const t1 = t0 + 3.6;
	alongZ( parts, body, ellipse( 2.3, 1.6, deck + 0.1 ), t0, t1 );
	for ( const z of [ t0, t1 ] ) band( parts, dark, 2.3, 1.6, deck + 0.1, z );
	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.25, 0.12, 0.4 ], [ s * 0.8, deck, t0 + 0.4 ] );
	parts.rod( dark, [ 0, deck + 0.9, t0 - 0.2 ], [ 0, deck + 0.9, t0 ], 0.15, 12 );
	parts.box( dark, [ 0.5, 0.4, 0.2 ], [ 0, deck + 0.7, t0 - 0.3 ] );
	const tankTop = deck + 1.7;
	parts.cylinder( dark, 0.3, 0.1, [ 0, tankTop - 0.02, t0 + 1.0 ], 16 );
	// Hose reel on the front right of the deck with its hose wound on.
	parts.rod( dark, [ 0.55, deck + 1.25, d0 + 1.3 ], [ 1.15, deck + 1.25, d0 + 1.3 ], 0.12, 10 );
	for ( const x of [ 0.55, 1.15 ] ) parts.rod( dark, [ x - 0.02, deck + 1.25, d0 + 1.3 ], [ x + 0.02, deck + 1.25, d0 + 1.3 ], 0.4, 16 );
	parts.rod( BLACK(), [ 0.58, deck + 1.25, d0 + 1.3 ], [ 1.12, deck + 1.25, d0 + 1.3 ], 0.3, 16 );
	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.06, 1.3, 0.06 ], [ 0.85 + s * 0.3, deck, d0 + 1.3 ] );

	// Deck tower over the back of the tank: the platform, its rails, the ladder up the back, and the
	// cannon on its swivel pointing forward.
	const pz = t1 - 0.4;
	const py = tankTop + 0.1;
	parts.box( dark, [ 1.6, 0.06, 1.3 ], [ 0, py, pz ] );
	for ( const sx of [ - 1, 1 ] ) parts.box( dark, [ 0.08, py - tankTop + 0.3, 0.08 ], [ sx * 0.5, tankTop - 0.3, pz ] );
	railing( parts, [ - 0.8, 0.8 ], [ pz - 0.65, pz + 0.65 ], py, [ 0, 1, 3 ], paint( 0xf2b200 ) );
	for ( const s of [ - 1, 1 ] ) parts.box( dark, [ 0.04, py - 0.4 + 1.0, 0.04 ], [ s * 0.22, 0.4, back + 0.05 ] );
	for ( let y = 0.6; y < py; y += 0.3 ) parts.box( dark, [ 0.44, 0.03, 0.04 ], [ 0, y, back + 0.05 ] );
	parts.cylinder( dark, 0.12, 0.5, [ 0, py, pz - 0.35 ], 10 );
	parts.rod( BRIGHT(), [ 0, py + 0.55, pz - 0.35 ], [ 0, py + 0.75, pz - 1.4 ], [ 0.08, 0.04 ], 10 );
	parts.path( dark, [ [ 0.35, deck + 0.8, d0 + 1.05 ], [ 0.9, tankTop - 0.2, t0 + 0.4 ], [ 0.9, tankTop, pz - 0.3 ], [ 0.12, py + 0.25, pz - 0.35 ] ], 0.05, 6 );
	return parts.build();

}
