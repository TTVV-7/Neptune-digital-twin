import {
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
import { storage } from './places.js';

// The Garage's paint shop: what each ride can wear, what this browser has chosen for each, and
// putting it on a model. A look is { colour, finish, decal, number, rim, flame, trail, smoke }, each
// the id of a choice below (number is 0 to 99). The first few choices of each are free; the rest
// come with the Supporter Pass (pro.js), and without it a saved look falls back to the free ones.
//
// Paint goes on what a model tags userData.paint = 'body' or 'rim' (the rides in rides/ and the
// kart); decals are projected onto its bodywork in the boxes its userData.decals gives (see
// project). The library's trucks have neither: only their flame and trail change.

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
];
export const FINISHES = [
	{ id: 'gloss', name: 'Gloss', free: true },
	{ id: 'matte', name: 'Matte' },
	{ id: 'metallic', name: 'Metallic' },
];
export const DECALS = [
	{ id: 'none', name: 'None', free: true },
	{ id: 'stripes', name: 'Racing stripes' },
	{ id: 'number', name: 'Number' },
	{ id: 'flames', name: 'Flames' },
	{ id: 'checker', name: 'Checker' },
];
export const RIMS = [
	{ id: 'silver', name: 'Silver', hex: 0xd5dbe1, free: true },
	{ id: 'graphite', name: 'Graphite', hex: 0x3a3e45, free: true },
	{ id: 'gold', name: 'Gold', hex: 0xd9a63a },
	{ id: 'white', name: 'White', hex: 0xf4f6f8 },
	{ id: 'red', name: 'Red', hex: 0xe0262f },
	{ id: 'blue', name: 'Blue', hex: 0x2d7bff },
	{ id: 'lime', name: 'Lime', hex: 0x8be02b },
	{ id: 'pink', name: 'Pink', hex: 0xff4fae },
];
// Booster flames, by drive-fx.js's names for them.
export const FLAMES = [
	{ id: 'orange', name: 'Orange', css: '#ff6a1a', free: true },
	{ id: 'blue', name: 'Blue', css: '#2b6dff' },
	{ id: 'green', name: 'Green', css: '#22d04a' },
	{ id: 'purple', name: 'Purple', css: '#8f3dff' },
	{ id: 'pink', name: 'Pink', css: '#ff3d98' },
	{ id: 'rainbow', name: 'Rainbow', css: 'conic-gradient( #ff3d3d, #ffd23d, #3dff6e, #3dc8ff, #8f3dff, #ff3d98, #ff3d3d )' },
];
// Trails behind it boosting or flying (drive-fx.js); smoke comes in any of SMOKES.
export const TRAILS = [
	{ id: 'none', name: 'None', free: true },
	{ id: 'smoke', name: 'Smoke' },
	{ id: 'sparkle', name: 'Sparkle' },
	{ id: 'ribbon', name: 'Rainbow ribbon' },
];
export const SMOKES = SWATCHES.filter( swatch => [ 'white', 'black', 'red', 'sunburst', 'lime', 'electric', 'violet', 'pink' ].includes( swatch.id ) );

const BASE = { finish: 'gloss', decal: 'none', number: 7, rim: 'silver', flame: 'orange', trail: 'none', smoke: 'white' };
const LISTS = { colour: SWATCHES, finish: FINISHES, decal: DECALS, rim: RIMS, flame: FLAMES, trail: TRAILS, smoke: SMOKES };

// The look a vehicle comes with: its own colour (vehicle.colour, an id in SWATCHES) and the free
// choices for the rest.
export function defaultLook( vehicle ) {

	return { colour: vehicle.colour ?? 'blaze', ...BASE };

}

// What this browser has chosen for `vehicle`, over its defaults.
export function savedLook( vehicle ) {

	const saved = storage( () => JSON.parse( localStorage.getItem( KEY ) ) )?.[ vehicle.id ];
	const look = defaultLook( vehicle );
	if ( ! saved || typeof saved !== 'object' ) return look;
	for ( const [ part, list ] of Object.entries( LISTS ) ) if ( list.some( choice => choice.id === saved[ part ] ) ) look[ part ] = saved[ part ];
	if ( Number.isInteger( saved.number ) && saved.number >= 0 && saved.number <= 99 ) look.number = saved.number;
	return look;

}

export function saveLook( vehicle, look ) {

	storage( () => {

		const all = JSON.parse( localStorage.getItem( KEY ) ) ?? {};
		all[ vehicle.id ] = look;
		localStorage.setItem( KEY, JSON.stringify( all ) );

	} );

}

// Whether a choice needs the pass: anything not free, except the colour the vehicle comes in.
export function isLocked( vehicle, part, id ) {

	if ( part === 'number' ) return false;
	if ( part === 'colour' && id === defaultLook( vehicle ).colour ) return false;
	return ! LISTS[ part ].find( choice => choice.id === id )?.free;

}

// The look to drive with: what's saved, with anything locked put back to its default without the
// pass (it may have run out, or been chosen on a test page).
export function lookFor( vehicle, pro ) {

	const look = savedLook( vehicle );
	if ( pro ) return look;
	const plain = defaultLook( vehicle );
	for ( const part of Object.keys( LISTS ) ) if ( isLocked( vehicle, part, look[ part ] ) ) look[ part ] = plain[ part ];
	return look;

}

// The flame and trail drive-fx.js draws for a look.
export function fxOf( look ) {

	const smoke = SMOKES.find( choice => choice.id === look.smoke ) ?? SMOKES[ 0 ];
	return { flame: look.flame, trail: look.trail === 'none' ? null : { kind: look.trail, colour: smoke.hex } };

}

// Whether a model has anything to paint.
export function isPaintable( model ) {

	let paintable = false;
	model.traverse( o => paintable ||= !! o.userData.paint );
	return paintable;

}

// --- putting a look on a model --------------------------------------------------------------

// Paint `vehicle`'s model over its bodywork and rims, and put decals on top, replacing any from a
// look before. In the colour and finish it comes in, and silver rims, it keeps its own materials,
// so a ride nobody has been to the Garage with is just as it was built.
export function applyLook( model, look, vehicle ) {

	const plain = defaultLook( vehicle );
	const swatch = SWATCHES.find( choice => choice.id === look.colour ) ?? SWATCHES[ 0 ];
	const body = look.colour === plain.colour && look.finish === plain.finish ? null : paintMaterial( swatch.hex, look.finish );
	const rim = look.rim === plain.rim ? null : rimMaterial( ( RIMS.find( choice => choice.id === look.rim ) ?? RIMS[ 0 ] ).hex );
	model.traverse( o => {

		const part = o.isMesh && o.userData.paint;
		if ( ! part ) return;
		o.userData.built ??= o.material;
		o.material = ( part === 'body' ? body : part === 'rim' ? rim : null ) ?? o.userData.built;

	} );
	setDecals( model, look, swatch );

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

// Paint and rim materials, made once each and shared (removing a ride leaves them be).
const paints = new Map();
function paintMaterial( hex, finish ) {

	const key = `${ hex }-${ finish }`;
	if ( ! paints.has( key ) ) {

		const settings = {
			gloss: { roughness: 0.3, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.9 },
			matte: { roughness: 0.82, metalness: 0, clearcoat: 0, envMapIntensity: 0.35 },
			metallic: { roughness: 0.3, metalness: 0.7, clearcoat: 0.7, clearcoatRoughness: 0.12, envMapIntensity: 1.3 },
		}[ finish ] ?? {};
		const material = new MeshPhysicalMaterial( { color: hex, envMap: getEnvironment(), ...settings } );
		material.userData.shared = true;
		paints.set( key, material );

	}

	return paints.get( key );

}

function rimMaterial( hex ) {

	const key = `rim-${ hex }`;
	if ( ! paints.has( key ) ) {

		const material = new MeshStandardMaterial( { color: hex, roughness: 0.22, metalness: 0.8, envMap: getEnvironment(), envMapIntensity: 1.1 } );
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
// Stripes and the checker go along the top, flames down the sides, and a number on the bonnet and
// both doors. On light paint, stripes are dark.
const DOWN = new Euler( Math.PI / 2, 0, 0 );
const INTO_RIGHT = new Euler( 0, - Math.PI / 2, 0 );
const INTO_LEFT = new Euler( 0, Math.PI / 2, 0 );
const _at = new Vector3();
const _size = new Vector3();

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

	}

	parent.add( group );

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
