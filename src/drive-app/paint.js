import {
	Box3,
	CanvasTexture,
	EquirectangularReflectionMapping,
	Euler,
	Group,
	Mesh,
	MeshPhysicalMaterial,
	MeshStandardMaterial,
	SRGBColorSpace,
	Vector3,
} from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { BOOSTS } from './boosts.js';
import { HORNS } from './horns.js';
import { levelOnly, unlockLevel } from './levels.js';
import { storage } from './places.js';
import { setUnderglow } from './underglow.js';

// The Garage's paint shop: what each ride can wear, what this browser has chosen for each, and
// putting it on a model. A look is { colour, finish, decal, number, rim, glow, boost, flame, trail,
// smoke, horn }, each the id of a choice below, in boosts.js or in horns.js (number is 0 to 99).
// The first few choices of each are free; the rest come with the Supporter Pass (pro.js), and about
// half of those with levels too (levels.js's unlock track), and a few colours (levelOnly) only with
// levels. A saved look falls back to what's unlocked. `boost` is the boost style; `flame` the
// classic flame's colour, which was the only boost there was, so a look saved before the styles (a
// flame and no boost) is the classic flame in the colour it had. A look saved before the underglow
// and the horn has none and the beep, as the rides had then.
//
// Paint goes on what a model tags userData.paint = 'body' or 'rim' (the rides in rides/ and the
// kart); decals are projected onto its bodywork in the boxes its userData.decals gives (see
// project). The library's trucks have neither: only their underglow, flame, trail and horn change.
// The underglow goes under anything (underglow.js), sized to it.

const KEY = 'world-drive.garage';

export const SWATCHES = [
	{ id: 'blaze', name: 'Blaze orange', hex: 0xff4a1c, free: true },
	{ id: 'red', name: 'Racing red', hex: 0xd81e2c, free: true },
	{ id: 'white', name: 'Ice white', hex: 0xeef1f4, free: true },
	{ id: 'black', name: 'Jet black', hex: 0x17191d },
	{ id: 'sunburst', name: 'Sunburst', hex: 0xffc21a },
	{ id: 'lime', name: 'Lime', hex: 0x7ed321 },
	{ id: 'forest', name: 'Forest green', hex: 0x1f7a4a },
	{ id: 'teal', name: 'Teal', hex: 0x12a8a0 },
	{ id: 'electric', name: 'Electric blue', hex: 0x2d6bff },
	{ id: 'royal', name: 'Royal blue', hex: 0x2440c9 },
	{ id: 'violet', name: 'Violet', hex: 0x7b3fe4 },
	{ id: 'pink', name: 'Hot pink', hex: 0xff3fa4 },
	{ id: 'candy', name: 'Candy apple red', hex: 0xb3101e },
	{ id: 'sunset', name: 'Sunset orange', hex: 0xff7a45 },
	{ id: 'sand', name: 'Sand', hex: 0xd6bd8a },
	{ id: 'pearl-white', name: 'Pearl white', hex: 0xf2ede2 },
	{ id: 'sky', name: 'Sky blue', hex: 0x5cb8f0 },
	{ id: 'navy', name: 'Navy', hex: 0x1c2a52 },
	{ id: 'burgundy', name: 'Burgundy', hex: 0x6e1630 },
	{ id: 'gunmetal', name: 'Gunmetal', hex: 0x4b525c },
	// Only levels give these (levels.js), the pass doesn't: at 25, 35, 45 and 50.
	{ id: 'copper', name: 'Copper', hex: 0xc0703f, levelOnly: true },
	{ id: 'mint', name: 'Mint', hex: 0x7fe8c4, levelOnly: true },
	{ id: 'plum', name: 'Plum', hex: 0x7a1f5c, levelOnly: true },
	{ id: 'champion', name: 'Champion gold', hex: 0xe8b923, levelOnly: true },
];
// How the paint takes the light (FINISH_SETTINGS, below): colour-shift's reflections turn through
// the hues as the ride turns.
export const FINISHES = [
	{ id: 'gloss', name: 'Gloss', free: true },
	{ id: 'matte', name: 'Matte' },
	{ id: 'metallic', name: 'Metallic' },
	{ id: 'satin', name: 'Satin' },
	{ id: 'pearl', name: 'Pearl' },
	{ id: 'chrome', name: 'Chrome' },
	{ id: 'shift', name: 'Colour-shift' },
];
export const DECALS = [
	{ id: 'none', name: 'None', free: true },
	{ id: 'stripes', name: 'Racing stripes' },
	{ id: 'number', name: 'Number' },
	{ id: 'flames', name: 'Flames' },
	{ id: 'checker', name: 'Checker' },
	{ id: 'bolts', name: 'Lightning bolts' },
	{ id: 'camo', name: 'Camo' },
	{ id: 'dots', name: 'Polka dots' },
	{ id: 'two-tone', name: 'Two-tone' },
];
// Rims are shiny metal in their colour unless they say otherwise: chrome a mirror, black satin, and
// neon glowing a little of its own.
export const RIMS = [
	{ id: 'silver', name: 'Silver', hex: 0xd5dbe1, free: true },
	{ id: 'graphite', name: 'Graphite', hex: 0x3a3e45, free: true },
	{ id: 'gold', name: 'Gold', hex: 0xd9a63a },
	{ id: 'white', name: 'White', hex: 0xf4f6f8 },
	{ id: 'red', name: 'Red', hex: 0xe0262f },
	{ id: 'blue', name: 'Blue', hex: 0x2d7bff },
	{ id: 'lime', name: 'Lime', hex: 0x8be02b },
	{ id: 'pink', name: 'Pink', hex: 0xff4fae },
	{ id: 'chrome', name: 'Chrome', hex: 0xf6f8fa, roughness: 0.04, metalness: 1, envMapIntensity: 1.7 },
	{ id: 'black', name: 'Satin black', hex: 0x141518, roughness: 0.5, metalness: 0.3, envMapIntensity: 0.6 },
	{ id: 'bronze', name: 'Bronze', hex: 0xa86a36 },
	{ id: 'neon', name: 'Neon green', hex: 0x3cff2a, emissive: 0.55 },
];
// The underglow's colours (underglow.js draws it), and a rainbow going round them all. None's swatch
// is crossed out.
export const GLOWS = [
	{ id: 'none', name: 'None', css: 'linear-gradient( 135deg, transparent 44%, #c9d3e0 44%, #c9d3e0 56%, transparent 56% ), #1b2436', free: true },
	{ id: 'blue', name: 'Neon blue', hex: 0x2f6bff },
	{ id: 'ice', name: 'Ice blue', hex: 0x1fd8ff },
	{ id: 'green', name: 'Neon green', hex: 0x2bff5e },
	{ id: 'purple', name: 'Purple', hex: 0x9b3dff },
	{ id: 'pink', name: 'Hot pink', hex: 0xff2bc4 },
	{ id: 'red', name: 'Red', hex: 0xff2438 },
	{ id: 'amber', name: 'Amber', hex: 0xff9416 },
	{ id: 'white', name: 'White', hex: 0xe6f0ff },
	{ id: 'rainbow', name: 'Rainbow', css: 'conic-gradient( #ff3d3d, #ffd23d, #3dff6e, #3dc8ff, #8f3dff, #ff3d98, #ff3d3d )' },
];
// The classic boost flame's colours, by drive-fx.js's names for them.
export const FLAMES = [
	{ id: 'orange', name: 'Orange', css: '#ff6a1a', free: true },
	{ id: 'blue', name: 'Blue', css: '#2b6dff' },
	{ id: 'green', name: 'Green', css: '#22d04a' },
	{ id: 'purple', name: 'Purple', css: '#8f3dff' },
	{ id: 'pink', name: 'Pink', css: '#ff3d98' },
	{ id: 'rainbow', name: 'Rainbow', css: 'conic-gradient( #ff3d3d, #ffd23d, #3dff6e, #3dc8ff, #8f3dff, #ff3d98, #ff3d3d )' },
	{ id: 'red', name: 'Red', css: '#ff2410' },
	{ id: 'gold', name: 'Gold', css: 'radial-gradient( circle at 35% 30%, #fff6c8, #ffb01a 60% )' },
	{ id: 'teal', name: 'Teal', css: '#10d6bc' },
	{ id: 'ice', name: 'Ice', css: 'radial-gradient( circle at 35% 30%, #ffffff, #8ee6ff 65% )' },
	{ id: 'white', name: 'White-hot', css: 'radial-gradient( circle at 35% 30%, #ffffff, #fff0dc 55%, #ffd9a8 )' },
];
// Trails behind it boosting or flying (drive-fx.js); smoke comes in any of SMOKES.
export const TRAILS = [
	{ id: 'none', name: 'None', free: true },
	{ id: 'smoke', name: 'Smoke' },
	{ id: 'sparkle', name: 'Sparkle' },
	{ id: 'ribbon', name: 'Rainbow ribbon' },
	{ id: 'fire', name: 'Fire' },
	{ id: 'stars', name: 'Shooting stars' },
	{ id: 'neon', name: 'Neon streak' },
];
export const SMOKES = SWATCHES.filter( swatch => [ 'white', 'black', 'red', 'sunburst', 'lime', 'electric', 'violet', 'pink' ].includes( swatch.id ) );

// The horns, whose sounds horns.js makes, are a part of the look like the rest.
export { HORNS };

const BASE = { finish: 'gloss', decal: 'none', number: 7, rim: 'silver', glow: 'none', boost: 'classic', flame: 'orange', trail: 'none', smoke: 'white', horn: 'beep' };
const LISTS = { colour: SWATCHES, finish: FINISHES, decal: DECALS, rim: RIMS, glow: GLOWS, boost: BOOSTS, flame: FLAMES, trail: TRAILS, smoke: SMOKES, horn: HORNS };

// The look a vehicle comes with: its own colour (vehicle.colour, an id in SWATCHES) and the free
// choices for the rest.
export function defaultLook( vehicle ) {

	return { colour: vehicle.colour ?? 'blaze', ...BASE };

}

// What's been chosen on this visit, by ride id. Kept here as well as in localStorage so the Garage
// still works for the visit in a browser that keeps nothing (site data blocked, some private
// windows), where reading back what was just saved finds nothing.
const chosen = new Map();

// What this browser has chosen for `vehicle`, over its defaults.
export function savedLook( vehicle ) {

	return cleanLook( vehicle, chosen.get( vehicle.id ) ?? stored()[ vehicle.id ] );

}

// `look` over `vehicle`'s defaults, part by part: a choice this page doesn't know (a damaged saved
// value, or another driver's look from a newer version, see ghosts.js) is the ride's own instead.
// Locked or not: another driver's pass is theirs to wear.
export function cleanLook( vehicle, look ) {

	const clean = defaultLook( vehicle );
	if ( ! look || typeof look !== 'object' ) return clean;
	for ( const [ part, list ] of Object.entries( LISTS ) ) if ( list.some( choice => choice.id === look[ part ] ) ) clean[ part ] = look[ part ];
	if ( Number.isInteger( look.number ) && look.number >= 0 && look.number <= 99 ) clean.number = look.number;
	return clean;

}

export function saveLook( vehicle, look ) {

	chosen.set( vehicle.id, { ...look } );
	storage( () => localStorage.setItem( KEY, JSON.stringify( { ...stored(), [ vehicle.id ]: look } ) ) );

}

// Every ride's saved look, { id: look }. Anything else there (a damaged value, or one from some
// other version) counts as nothing saved, so the next choice replaces it rather than failing on it
// for good.
function stored() {

	const all = storage( () => JSON.parse( localStorage.getItem( KEY ) ) );
	return all && typeof all === 'object' && ! Array.isArray( all ) ? all : {};

}

// What unlocks a choice: null when it's free (or the colour the vehicle comes in), else { level,
// pass }: the level that unlocks it (null if none does) and whether the Supporter Pass does.
export function unlockOf( vehicle, part, id ) {

	if ( part === 'number' ) return null;
	if ( part === 'colour' && id === defaultLook( vehicle ).colour ) return null;
	if ( LISTS[ part ].find( choice => choice.id === id )?.free ) return null;
	return { level: unlockLevel( part, id ), pass: ! levelOnly( part, id ) };

}

// Whether a choice is locked for someone with the pass or not and at a level: `access` is { pro,
// level } (level 1 when it isn't given; true or false alone, as before levels, is the pass).
export function isLocked( vehicle, part, id, access = {} ) {

	const { pro = false, level = 1 } = access && typeof access === 'object' ? access : { pro: access === true };
	const unlock = unlockOf( vehicle, part, id );
	if ( ! unlock ) return false;
	return ! ( ( unlock.pass && pro ) || ( unlock.level !== null && level >= unlock.level ) );

}

// The look to drive with: what's saved, with anything locked put back to its default (the pass may
// have run out, a level not be there yet, or it was chosen on a test page). access: { pro, level }.
export function lookFor( vehicle, access = {} ) {

	const look = savedLook( vehicle );
	const plain = defaultLook( vehicle );
	for ( const part of Object.keys( LISTS ) ) if ( isLocked( vehicle, part, look[ part ], access ) ) look[ part ] = plain[ part ];
	return look;

}

// The boost style, flame and trail drive-fx.js draws for a look.
export function fxOf( look ) {

	const smoke = SMOKES.find( choice => choice.id === look.smoke ) ?? SMOKES[ 0 ];
	return { boost: look.boost, flame: look.flame, trail: look.trail === 'none' ? null : { kind: look.trail, colour: smoke.hex } };

}

// Whether a model has anything to paint.
export function isPaintable( model ) {

	let paintable = false;
	model.traverse( o => paintable ||= !! o.userData.paint );
	return paintable;

}

// --- putting a look on a model --------------------------------------------------------------

// Paint `vehicle`'s model over its bodywork and rims, put decals on top and its underglow under it,
// replacing any from a look before. In the colour and finish it comes in, and silver rims, it keeps
// its own materials, so a ride nobody has been to the Garage with is just as it was built.
export function applyLook( model, look, vehicle ) {

	const plain = defaultLook( vehicle );
	const swatch = SWATCHES.find( choice => choice.id === look.colour ) ?? SWATCHES[ 0 ];
	const body = look.colour === plain.colour && look.finish === plain.finish ? null : paintMaterial( swatch.hex, look.finish );
	const rim = look.rim === plain.rim ? null : rimMaterial( RIMS.find( choice => choice.id === look.rim ) ?? RIMS[ 0 ] );
	model.traverse( o => {

		const part = o.isMesh && o.userData.paint;
		if ( ! part ) return;
		o.userData.built ??= o.material;
		o.material = ( part === 'body' ? body : part === 'rim' ? rim : null ) ?? o.userData.built;

	} );
	setDecals( model, look, swatch );
	const glow = GLOWS.find( choice => choice.id === look.glow );
	setUnderglow( model, ! glow || glow.id === 'none' ? null : glow.hex ?? glow.id );

}

// A reflection of a plain sky over plain ground, for the paint to shine with (the world's own sky
// isn't a picture it can reflect). Made once; the renderer turns it into what it lights with.
let environment = null;
function getEnvironment() {

	if ( environment ) return environment;
	const canvas = document.createElement( 'canvas' );
	canvas.width = 128;
	canvas.height = 64;
	const ctx = canvas.getContext( '2d' );
	const gradient = ctx.createLinearGradient( 0, 0, 0, 64 );
	gradient.addColorStop( 0, '#5b8fd0' );
	gradient.addColorStop( 0.45, '#d8e8f6' );
	gradient.addColorStop( 0.5, '#f4f6f2' );
	gradient.addColorStop( 0.53, '#7d7a72' );
	gradient.addColorStop( 1, '#3c3b38' );
	ctx.fillStyle = gradient;
	ctx.fillRect( 0, 0, 128, 64 );
	environment = new CanvasTexture( canvas );
	environment.mapping = EquirectangularReflectionMapping;
	environment.colorSpace = SRGBColorSpace;
	return environment;

}

// How each finish takes the light. Satin between matte and gloss; pearl a soft white sheen and a
// faint shimmer of colours over a deep clear coat; chrome a mirror tinted with the colour (white
// paint is plain chrome); colour-shift a thin film over dark metal in the colour (its reflections
// turn through the colours with the angle it's seen at, as oil's on water do), with a sheen a third
// of the way round the colour wheel along its edges (see paintMaterial).
const FINISH_SETTINGS = {
	gloss: { roughness: 0.3, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.9 },
	matte: { roughness: 0.82, metalness: 0, clearcoat: 0, envMapIntensity: 0.35 },
	metallic: { roughness: 0.3, metalness: 0.7, clearcoat: 0.7, clearcoatRoughness: 0.12, envMapIntensity: 1.3 },
	satin: { roughness: 0.55, metalness: 0.15, clearcoat: 0.3, clearcoatRoughness: 0.45, envMapIntensity: 0.6 },
	pearl: { roughness: 0.32, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 1, sheenColor: 0xfff6ee, sheenRoughness: 0.4, iridescence: 0.45, iridescenceIOR: 1.5, iridescenceThicknessRange: [ 280, 420 ], envMapIntensity: 1.1 },
	chrome: { roughness: 0.05, metalness: 1, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6 },
	shift: { roughness: 0.24, metalness: 1, clearcoat: 1, clearcoatRoughness: 0.04, iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [ 100, 400 ], sheen: 0.6, sheenRoughness: 0.35, envMapIntensity: 2 },
};

// Paint and rim materials, made once each and shared (removing a ride leaves them be).
const paints = new Map();
function paintMaterial( hex, finish ) {

	const key = `${ hex }-${ finish }`;
	if ( ! paints.has( key ) ) {

		const material = new MeshPhysicalMaterial( { color: hex, envMap: getEnvironment(), ...FINISH_SETTINGS[ finish ] } );
		if ( finish === 'shift' ) {

			material.sheenColor.setHex( hex ).offsetHSL( 1 / 3, 0.2, 0.15 );
			material.color.multiplyScalar( 0.35 );

		}

		material.userData.shared = true;
		paints.set( key, material );

	}

	return paints.get( key );

}

// A rim's material: shiny metal in its colour unless the choice says otherwise (RIMS).
function rimMaterial( { hex, roughness = 0.22, metalness = 0.8, envMapIntensity = 1.1, emissive = 0 } ) {

	const key = `rim-${ hex }-${ roughness }-${ metalness }-${ emissive }`;
	if ( ! paints.has( key ) ) {

		const material = new MeshStandardMaterial( { color: hex, roughness, metalness, envMap: getEnvironment(), envMapIntensity, emissive: emissive ? hex : 0x000000, emissiveIntensity: emissive } );
		material.userData.shared = true;
		paints.set( key, material );

	}

	return paints.get( key );

}

// --- decals ---------------------------------------------------------------------------------

// A model's userData.decals says where they go, in metres in its own frame, as boxes they're
// projected through onto its bodywork: `top` [ across, along, deep ] straight down onto the
// bonnet, roof and deck; `side` [ along, up, deep ] in from the right side, and mirrored, the left;
// `bonnet` a square `size` across, down onto where a number goes on top. They go in
// userData.decalParent (the group the bodywork is in, if it moves on springs) or the model.
// Stripes and the checker go along the top, flames and lightning bolts down the sides, and a number
// on the bonnet and both doors. Camo and polka dots go all over: along the sides, taller than the
// side's box, and over the top (camo wider than its box); two-tone below the line along the middle
// of the doors, from nose to tail. On light paint, stripes and dots are dark.
const DOWN = new Euler( Math.PI / 2, 0, 0 );
const INTO_RIGHT = new Euler( 0, - Math.PI / 2, 0 );
const INTO_LEFT = new Euler( 0, Math.PI / 2, 0 );
const _at = new Vector3();
const _size = new Vector3();
const _body = new Box3();
const _piece = new Box3();

function setDecals( model, look, swatch ) {

	// The ride itself may be inside what it's loaded in (models.js's pivot).
	let ride = null;
	model.traverse( o => ride ??= o.userData.decals ? o : null );
	if ( ! ride ) return;
	const parent = ride.userData.decalParent ?? ride;
	const old = parent.getObjectByName( 'decals' );
	if ( old ) {

		parent.remove( old );
		old.traverse( o => o.geometry?.dispose() );

	}

	const spots = ride.userData.decals;
	if ( look.decal === 'none' ) return;
	const group = new Group();
	group.name = 'decals';
	const light = luminance( swatch.hex ) > 0.55;
	const { top, side, bonnet } = spots;
	if ( look.decal === 'stripes' || look.decal === 'checker' ) {

		const map = look.decal === 'stripes' ? stripes( light ) : checker();
		project( parent, group, map, top.at, top.size, DOWN );

	} else if ( look.decal === 'flames' ) {

		project( parent, group, flames(), side.at, side.size, INTO_RIGHT );
		project( parent, group, flames(), mirror( side.at ), side.size, INTO_LEFT, { flipU: true } );

	} else if ( look.decal === 'number' ) {

		const map = roundel( look.number );
		project( parent, group, map, bonnet.at, [ bonnet.size, bonnet.size, bonnet.deep ?? 0.6 ], DOWN, { flipV: true } );
		const size = Math.min( side.size[ 1 ] * 1.15, side.size[ 0 ] * 0.45 );
		project( parent, group, map, side.at, [ size, size, side.size[ 2 ] ], INTO_RIGHT, { flipU: true } );
		project( parent, group, map, mirror( side.at ), [ size, size, side.size[ 2 ] ], INTO_LEFT, { flipU: true } );

	} else if ( look.decal === 'bolts' ) {

		project( parent, group, bolts(), side.at, side.size, INTO_RIGHT );
		project( parent, group, bolts(), mirror( side.at ), side.size, INTO_LEFT, { flipU: true } );

	} else if ( look.decal === 'camo' || look.decal === 'dots' ) {

		// Camo over the top as wide as the bodywork; dots, which would be drawn out into dashes where
		// it curves down, only as wide as the top's box.
		const tall = [ side.size[ 0 ] * 1.25, side.size[ 1 ] * 1.8, side.size[ 2 ] ];
		const wide = look.decal === 'camo' ? [ Math.max( top.size[ 0 ], Math.abs( side.at[ 0 ] ) * 1.5 ), top.size[ 1 ], top.size[ 2 ] ] : top.size;
		const pattern = look.decal === 'camo' ? camo : ( across, along ) => dots( across, along, light );
		project( parent, group, pattern( wide[ 0 ], wide[ 1 ] ), top.at, wide, DOWN );
		const sides = pattern( tall[ 0 ], tall[ 1 ] );
		project( parent, group, sides, side.at, tall, INTO_RIGHT );
		project( parent, group, sides, mirror( side.at ), tall, INTO_LEFT, { flipU: true } );

	} else if ( look.decal === 'two-tone' ) {

		// From the line along the middle of the doors down to the bottom of the bodywork, a little over
		// the line for the pinstripe above it.
		const body = bodyBox( parent );
		const line = side.at[ 1 ] + side.size[ 1 ] * 0.12;
		const box = [ body.max.z - body.min.z, line - body.min.y, side.size[ 2 ] ];
		const at = [ side.at[ 0 ], ( line + body.min.y ) / 2, ( body.min.z + body.max.z ) / 2 ];
		const map = twoTone( luminance( swatch.hex ) < 0.2, light, box[ 1 ] / side.size[ 1 ] );
		project( parent, group, map, at, box, INTO_RIGHT );
		project( parent, group, map, mirror( at ), box, INTO_LEFT, { flipU: true } );

	}

	parent.add( group );

}

// The box round the bodywork decals go on (as project finds it), in `parent`'s frame.
function bodyBox( parent ) {

	_body.makeEmpty();
	for ( const mesh of parent.children ) {

		if ( ! mesh.isMesh || ! ( mesh.userData.paint === 'body' || mesh.userData.decalable ) ) continue;
		mesh.updateMatrix();
		if ( ! mesh.geometry.boundingBox ) mesh.geometry.computeBoundingBox();
		_body.union( _piece.copy( mesh.geometry.boundingBox ).applyMatrix4( mesh.matrix ) );

	}

	return _body;

}

function mirror( [ x, y, z ] ) {

	return [ - x, y, z ];

}

// Project `map` onto the bodywork in `parent` (its meshes tagged as body, or decalable) through
// the box at `at`, `size` big, turned by `turn` (its z axis is the way it's projected). flipU and
// flipV turn the picture round so it reads the right way from outside.
function project( parent, group, map, at, size, turn, { flipU = false, flipV = false } = {} ) {

	_at.fromArray( at );
	_size.fromArray( size );
	for ( const mesh of parent.children ) {

		if ( ! mesh.isMesh || ! ( mesh.userData.paint === 'body' || mesh.userData.decalable ) ) continue;
		mesh.updateMatrix();
		const geometry = new DecalGeometry( { geometry: mesh.geometry, matrixWorld: mesh.matrix }, _at, turn, _size );
		if ( geometry.attributes.position.count === 0 ) {

			geometry.dispose();
			continue;

		}

		const uv = geometry.attributes.uv;
		for ( let i = 0; i < uv.count; i ++ ) uv.setXY( i, flipU ? 1 - uv.getX( i ) : uv.getX( i ), flipV ? 1 - uv.getY( i ) : uv.getY( i ) );
		const decal = new Mesh( geometry, decalMaterial( map ) );
		decal.raycast = () => {};
		decal.renderOrder = 1;
		group.add( decal );

	}

}

const decalMaterials = new Map();
function decalMaterial( map ) {

	if ( ! decalMaterials.has( map ) ) {

		const material = new MeshStandardMaterial( { map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: - 4, polygonOffsetUnits: - 4, roughness: 0.35, metalness: 0.05 } );
		material.userData.shared = true;
		decalMaterials.set( map, material );

	}

	return decalMaterials.get( map );

}

function luminance( hex ) {

	return ( 0.299 * ( hex >> 16 & 255 ) + 0.587 * ( hex >> 8 & 255 ) + 0.114 * ( hex & 255 ) ) / 255;

}

// The pictures, drawn once each (a number once per number).
const pictures = new Map();
function picture( key, width, height, draw ) {

	if ( ! pictures.has( key ) ) {

		const canvas = document.createElement( 'canvas' );
		canvas.width = width;
		canvas.height = height;
		draw( canvas.getContext( '2d' ), width, height );
		const texture = new CanvasTexture( canvas );
		texture.colorSpace = SRGBColorSpace;
		texture.anisotropy = 4;
		pictures.set( key, texture );

	}

	return pictures.get( key );

}

// Two stripes down the middle with a gap between, along the picture's height.
function stripes( dark ) {

	return picture( `stripes-${ dark }`, 64, 256, ( ctx, w, h ) => {

		ctx.fillStyle = dark ? '#16181c' : '#f6f7f9';
		ctx.fillRect( w * 0.06, 0, w * 0.36, h );
		ctx.fillRect( w * 0.58, 0, w * 0.36, h );

	} );

}

// A band of black and white squares, four across.
function checker() {

	return picture( 'checker', 64, 512, ( ctx, w, h ) => {

		const square = w / 4;
		for ( let y = 0; y < h; y += square ) for ( let x = 0; x < w; x += square ) {

			ctx.fillStyle = ( x + y ) / square % 2 ? '#111317' : '#f6f7f9';
			ctx.fillRect( x, y, square, square );

		}

	} );

}

// Flames licking back from the front (the left of the picture): tongues of fire of different
// lengths, yellow at their roots to red at their tips, with a dark edge.
const TONGUES = [ [ 0.6, 0.2 ], [ 0.97, 0.36 ], [ 0.74, 0.54 ], [ 1, 0.72 ], [ 0.56, 0.88 ] ];
function flames() {

	return picture( 'flames', 512, 128, ( ctx, w, h ) => {

		ctx.beginPath();
		ctx.moveTo( 0, h * 0.08 );
		let y = h * 0.08;
		TONGUES.forEach( ( [ reach, tip ], i ) => {

			const x = w * reach;
			// Out along the tongue's top to its tip, and back along its underside to where the next
			// one starts.
			ctx.bezierCurveTo( x * 0.4, y - h * 0.08, x * 0.75, tip * h - h * 0.14, x, tip * h );
			const next = TONGUES[ i + 1 ];
			const valley = next ? ( tip + next[ 1 ] ) / 2 : 0.96;
			const back = next ? x * 0.32 : 0;
			ctx.bezierCurveTo( x * 0.82, tip * h + h * 0.08, back + w * 0.12, valley * h - h * 0.02, back, valley * h );
			y = valley * h;

		} );
		ctx.closePath();
		const gradient = ctx.createLinearGradient( 0, 0, w, 0 );
		gradient.addColorStop( 0, '#fff38a' );
		gradient.addColorStop( 0.28, '#ffc21a' );
		gradient.addColorStop( 0.6, '#ff6a1a' );
		gradient.addColorStop( 1, '#d61f1f' );
		ctx.fillStyle = gradient;
		ctx.fill();
		ctx.lineWidth = 6;
		ctx.lineJoin = 'round';
		ctx.strokeStyle = 'rgba( 30, 8, 4, 0.85 )';
		ctx.stroke();

	} );

}

// Lightning bolts flashing back from the front (the left of the picture): a big one along the
// middle and a thinner one over it, white-hot at their front to yellow, with a dark edge. Each is
// the zigzag of the ⚡ sign lying on its side, its point to the back.
const BOLT = [ [ 0.6, 0 ], [ 0.15, 0.55 ], [ 0.45, 0.55 ], [ 0.3, 1 ], [ 0.85, 0.42 ], [ 0.55, 0.42 ], [ 0.8, 0 ] ];
function bolts() {

	return picture( 'bolts', 512, 128, ( ctx, w, h ) => {

		for ( const [ from, length, middle, thick ] of [ [ 0.03, 0.94, 0.56, 0.86 ], [ 0.3, 0.55, 0.24, 0.4 ] ] ) {

			ctx.beginPath();
			BOLT.forEach( ( [ across, along ], i ) => {

				const x = ( from + along * length ) * w;
				const y = ( middle + ( across - 0.5 ) * thick ) * h;
				if ( i === 0 ) ctx.moveTo( x, y );
				else ctx.lineTo( x, y );

			} );
			ctx.closePath();
			const gradient = ctx.createLinearGradient( from * w, 0, ( from + length ) * w, 0 );
			gradient.addColorStop( 0, '#fffbe0' );
			gradient.addColorStop( 0.35, '#ffe14a' );
			gradient.addColorStop( 1, '#ffb11a' );
			ctx.fillStyle = gradient;
			ctx.fill();
			ctx.lineWidth = 5;
			ctx.lineJoin = 'round';
			ctx.strokeStyle = 'rgba( 30, 16, 4, 0.85 )';
			ctx.stroke();

		}

	} );

}

// A picture for a box `across` by `along` (m) as its width and height: its longer side 512, so what's
// drawn on it in metres comes out round on any ride.
function sized( across, along ) {

	const long = Math.max( across, along );
	return [ Math.max( 32, Math.round( 512 * across / long ) ), Math.max( 32, Math.round( 512 * along / long ) ) ];

}

// Woodland camouflage: olive, with blobs of khaki, dark green, brown and black over it, their size a
// share of the box's shorter side (`across` by `along`, m), so a kart's are smaller than a bus's.
// The same blobs every time.
function camo( across, along ) {

	const [ width, height ] = sized( across, along );
	return picture( `camo-${ width }-${ height }`, width, height, ( ctx, w, h ) => {

		const random = seeded( 7 );
		const blobSize = Math.min( w, h ) * 0.32;
		ctx.fillStyle = '#69703f';
		ctx.fillRect( 0, 0, w, h );
		for ( const colour of [ '#a3935f', '#3f4a26', '#4a3a28', '#23241c' ] ) {

			ctx.fillStyle = colour;
			const count = Math.ceil( w * h / ( blobSize * blobSize ) * 0.55 );
			for ( let i = 0; i < count; i ++ ) blob( ctx, random() * w, random() * h, blobSize * ( 0.45 + random() * 0.6 ), random );

		}

	} );

}

// A lumpy blob round ( x, y ), about `size` across and wider than it's tall: points round an oval at
// random distances, joined by curves through the middles between them.
function blob( ctx, x, y, size, random ) {

	const points = Array.from( { length: 7 }, ( _, i ) => {

		const angle = i / 7 * Math.PI * 2;
		const reach = size * ( 0.55 + random() * 0.5 );
		return [ x + Math.cos( angle ) * reach * 1.3, y + Math.sin( angle ) * reach * 0.8 ];

	} );
	const middle = ( a, b ) => [ ( a[ 0 ] + b[ 0 ] ) / 2, ( a[ 1 ] + b[ 1 ] ) / 2 ];
	ctx.beginPath();
	ctx.moveTo( ...middle( points[ 6 ], points[ 0 ] ) );
	points.forEach( ( point, i ) => ctx.quadraticCurveTo( ...point, ...middle( point, points[ ( i + 1 ) % 7 ] ) ) );
	ctx.fill();

}

// Polka dots in staggered rows, white (or, on light paint, dark), three rows across the shorter side
// of a box `across` by `along` (m) whatever the ride, so they're round.
function dots( across, along, dark ) {

	const [ width, height ] = sized( across, along );
	return picture( `dots-${ width }-${ height }-${ dark }`, width, height, ( ctx, w, h ) => {

		const gap = Math.min( w, h ) / 3;
		ctx.fillStyle = dark ? '#16181c' : '#f6f7f9';
		for ( let row = 0; row * gap < h + gap; row ++ ) for ( let x = row % 2 ? gap / 2 : 0; x < w + gap; x += gap ) {

			ctx.beginPath();
			ctx.arc( x, row * gap + gap / 2, gap * 0.3, 0, Math.PI * 2 );
			ctx.fill();

		}

	} );

}

// The lower colour of two-tone paint: charcoal (or, under dark paint, silver), with a pinstripe over
// it, dark on light paint. `tall`: how many times as tall as the side's box it is, so the pinstripe is
// as thick for every ride, against its side.
function twoTone( silver, dark, tall ) {

	return picture( `two-tone-${ silver }-${ dark }-${ Math.round( tall * 10 ) }`, 16, 256, ( ctx, w, h ) => {

		// The pinstripe and the gap under it, each 5 % of the side's box.
		const line = h * 0.05 / tall;
		ctx.fillStyle = dark ? '#16181c' : '#f6f7f9';
		ctx.fillRect( 0, 0, w, line );
		ctx.fillStyle = silver ? '#c3c9d1' : '#1d2026';
		ctx.fillRect( 0, line * 2.2, w, h );

	} );

}

// The same numbers between 0 and 1 every time from `seed` (mulberry32), for patterns drawn alike on
// every page.
function seeded( seed ) {

	let a = seed >>> 0;
	return () => {

		a = a + 0x6d2b79f5 >>> 0;
		let t = a;
		t = Math.imul( t ^ t >>> 15, t | 1 );
		t ^= t + Math.imul( t ^ t >>> 7, t | 61 );
		return ( ( t ^ t >>> 14 ) >>> 0 ) / 4294967296;

	};

}

// A white disc with a black ring and the number.
function roundel( number ) {

	return picture( `number-${ number }`, 128, 128, ( ctx, w, h ) => {

		ctx.beginPath();
		ctx.arc( w / 2, h / 2, w * 0.47, 0, Math.PI * 2 );
		ctx.fillStyle = '#f6f7f9';
		ctx.fill();
		ctx.lineWidth = w * 0.05;
		ctx.strokeStyle = '#111317';
		ctx.stroke();
		ctx.fillStyle = '#111317';
		ctx.font = `900 italic ${ number > 9 ? 60 : 72 }px system-ui, sans-serif`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText( String( number ), w / 2, h / 2 + 4 );

	} );

}
