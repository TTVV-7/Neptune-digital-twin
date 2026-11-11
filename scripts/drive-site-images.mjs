// node scripts/drive-site-images.mjs [icons] [cards] [moon [<slug>...] [hub]]: draws World Drive's
// icons and the pictures its links unfurl with into drive/public/ (icons and cards, with none named):
//
// - icons: favicon.svg (the globe with its road, as the page always had it), favicon.ico (16, 32
//   and 48 px), apple-touch-icon.png (180 px), and the web app manifest's icons/icon-192.png,
//   icon-512.png and icon-maskable-512.png (its safe circle kept clear), from that drawing.
// - cards: og/world-drive.png, the 1200 × 630 card a link to the game shows in a chat or a post
//   (og:image), and og/<slug>.png for each place's page (drive/site/places.js). The name, the line
//   under it and the Earth are drawn in HTML and CSS; the car is the muscle car as World Drive
//   draws it, on nothing. No picture of Google's tiles: the cards are World Drive's own drawing.
// - moon: og/moon.png for the Moon's page (/moon/), the Moon from space as World Drive's globe shows
//   it, and og/moon-<slug>.png for each of its places' pages (drive/site/moon.js): World Drive
//   itself, dropped in at the place's start spot in a ride, the camera set by it, looking toward the
//   Earth where it's low enough in the sky to share the picture with the ground (so it's where it
//   really is), else across the sun, with the words over it as the other cards have them. The Moon
//   is NASA's (public domain) and drawn by the game, so these are pictures of it, not of Google's
//   tiles. Slow: a drop-in in Chromium's software renderer takes 15 to
//   30 s and a frame a second or two, so they're only drawn when asked for by name; `moon tycho
//   plato` draws just those places' cards, `moon hub` just the Moon's own.
//
// Run it after changing the places (a new page gets its card) or the look. Needs Playwright with
// Chromium for the cards, as the tests do; it starts World Drive's dev server (with no Maps key) on
// TEST_VITE_PORT or 5536 and loads nothing from anywhere else.

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { MOON_PAGES } from '../drive/site/moon.js';
import { PLACES } from '../drive/site/places.js';
import { startVite } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PUBLIC = new URL( '../drive/public/', import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5536;
const CARD = [ 1200, 630 ];
// The car on the card, and where the camera looks at it from: ahead (-z), to its right (+x) and
// a little above, so it faces out to the right of the card.
const CAR = 'muscle-car';
const VIEW = [ 1, 0.32, - 0.95 ];

const asked = process.argv.slice( 2 );
const wanted = what => asked.length === 0 ? what !== 'moon' : asked.includes( what );

// The globe with a road over it, as the page's favicon has been since the start: a 64-unit square.
const GLOBE = `<circle cx="32" cy="32" r="30" fill="#155a9c"/><path d="M10 40c8-4 14-4 22 0s14 4 22 0" stroke="#ffd23f" stroke-width="7" fill="none" stroke-linecap="round"/>`;
const svg = ( inner, { size = 64, background = null, scale = 1 } = {} ) => {

	const pad = 32 - 32 * scale;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${ size }" height="${ size }">${ background ? `<rect width="64" height="64" fill="${ background }"/>` : '' }<g transform="translate(${ pad } ${ pad }) scale(${ scale })">${ inner }</g></svg>`;

};

// The words on every card: the name (big, or small over a place's title), the line or the place's
// region, the chips and the address.
const WORDS_CSS = `
		.words { position: absolute; left: 64px; top: 58px; width: 640px; }
		.logo { margin: 0; font-size: 112px; font-weight: 900; font-style: italic; line-height: 0.95; letter-spacing: -2px; text-transform: uppercase; }
		.logo b, .small-logo b { color: #ffd23f; font-weight: 900; }
		.tagline { margin: 22px 0 0; font-size: 31px; font-weight: 700; color: rgba( 244, 247, 251, 0.85 ); }
		.small-logo { margin: 0; font-size: 34px; font-weight: 900; font-style: italic; text-transform: uppercase; letter-spacing: -0.5px; }
		.place { margin: 26px 0 0; font-size: 66px; line-height: 1.02; font-weight: 900; font-style: italic; letter-spacing: -1px; }
		.region { margin: 14px 0 0; font-size: 26px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: rgba( 244, 247, 251, 0.75 ); }
		.chips { display: flex; flex-wrap: wrap; gap: 12px; margin: 30px 0 0; }
		.chips span { padding: 10px 18px; border: 1px solid rgba( 255, 255, 255, 0.18 ); border-radius: 14px; background: rgba( 9, 15, 27, 0.7 ); font-size: 22px; font-weight: 800; }
		.url { position: absolute; left: 64px; bottom: 36px; font-size: 26px; font-weight: 800; color: #070c16; background: #ffd23f; padding: 8px 18px; border-radius: 12px; font-style: italic; }`;

// How each Moon place's card is framed (see frameMoon): the ride (vehicle), and where the camera
// looks: toward the Earth where it's in the sky ('earth'), on the near side where it's no higher than
// a picture with the ground in it can show (MOON_EARTH_HIGHEST); else along a heading (degrees from
// north) across the sun, which is from the south-west, so the ground shows its light and shade.
const MOON_SHOTS = {
	'tranquility-base': { vehicle: 'muscle-car', look: 315 },
	'hadley-rille': { vehicle: 'go-kart', look: 135 },
	'taurus-littrow': { vehicle: 'muscle-car', look: 315 },
	tycho: { vehicle: 'go-kart', look: 'earth' },
	copernicus: { vehicle: 'muscle-car', look: 135 },
	aristarchus: { vehicle: 'go-kart', look: 'earth' },
	plato: { vehicle: 'muscle-car', look: 'earth' },
	'mons-huygens': { vehicle: 'go-kart', look: 315 },
	shackleton: { vehicle: 'muscle-car', look: 135 },
	'mare-orientale': { vehicle: 'go-kart', look: 315 },
	tsiolkovskiy: { vehicle: 'muscle-car', look: 135 },
	'von-karman': { vehicle: 'go-kart', look: 315 },
};
// And what every one has, unless its own says otherwise: the field of view (°, driving's own); where
// on the card the ride and the Earth are (rideAt, earthAt: across and up, -1 to 1, both on the
// right, the words' side clear); how far the ride's turned from facing away from the camera (°);
// and, with no Earth to look at, how far up the camera looks (°).
const MOON_FRAME = { fov: 70, rideAt: [ 0.4, - 0.45 ], earthAt: [ 0.45, 0.75 ], turn: 145, pitch: - 5 };
// Higher in the sky than this (°), the Earth and the ground can't both be in the picture.
const MOON_EARTH_HIGHEST = 56;
// The cards are photographs, which a PNG keeps large: under this many bytes each, fewer colours
// as needed.
const MOON_CARD_BYTES = 200000;

if ( wanted( 'icons' ) ) await drawIcons();
if ( wanted( 'cards' ) ) await drawCards();
if ( wanted( 'moon' ) ) {

	// The Moon's places named after "moon" (and "hub" for its own page), or all of them.
	const named = asked.filter( word => word === 'hub' || MOON_PAGES.some( place => place.slug === word ) );
	const unknown = asked.filter( word => ! [ 'icons', 'cards', 'moon', 'hub' ].includes( word ) && ! MOON_PAGES.some( place => place.slug === word ) );
	if ( unknown.length ) throw new Error( `No Moon page called ${ unknown.join( ', ' ) }: they're ${ MOON_PAGES.map( place => place.slug ).join( ', ' ) }` );
	await drawMoon( named.length ? named : [ 'hub', ...MOON_PAGES.map( place => place.slug ) ] );

}

async function drawIcons() {

	mkdirSync( new URL( 'icons/', PUBLIC ), { recursive: true } );
	writeFileSync( new URL( 'favicon.svg', PUBLIC ), `${ svg( GLOBE ) }\n` );
	const png = ( text, size ) => sharp( Buffer.from( text ), { density: 72 * size / 64 } ).resize( size, size ).png( { compressionLevel: 9, palette: true } ).toBuffer();
	writeFileSync( new URL( 'favicon.ico', PUBLIC ), ico( await Promise.all( [ 16, 32, 48 ].map( size => png( svg( GLOBE, { size } ), size ) ) ), [ 16, 32, 48 ] ) );
	// On a home screen the icon is a square, cornered by the phone: the globe on the night sky.
	writeFileSync( new URL( 'apple-touch-icon.png', PUBLIC ), await png( svg( GLOBE, { size: 180, background: '#070c16', scale: 0.8 } ), 180 ) );
	for ( const size of [ 192, 512 ] ) writeFileSync( new URL( `icons/icon-${ size }.png`, PUBLIC ), await png( svg( GLOBE, { size } ), size ) );
	// Maskable: anything outside the middle 80 % may be cut off, so the globe sits inside that.
	writeFileSync( new URL( 'icons/icon-maskable-512.png', PUBLIC ), await png( svg( GLOBE, { size: 512, background: '#070c16', scale: 0.72 } ), 512 ) );
	console.log( 'Drew favicon.svg, favicon.ico, apple-touch-icon.png and icons/' );

}

// An .ico holding PNGs (as every browser since Windows Vista's time reads them).
function ico( images, sizes ) {

	const header = Buffer.alloc( 6 + 16 * images.length );
	header.writeUInt16LE( 0, 0 );
	header.writeUInt16LE( 1, 2 );
	header.writeUInt16LE( images.length, 4 );
	let offset = header.length;
	images.forEach( ( image, i ) => {

		const at = 6 + 16 * i;
		header.writeUInt8( sizes[ i ] % 256, at );
		header.writeUInt8( sizes[ i ] % 256, at + 1 );
		header.writeUInt8( 0, at + 2 );
		header.writeUInt8( 0, at + 3 );
		header.writeUInt16LE( 1, at + 4 );
		header.writeUInt16LE( 32, at + 6 );
		header.writeUInt32LE( image.length, at + 8 );
		header.writeUInt32LE( offset, at + 12 );
		offset += image.length;

	} );
	return Buffer.concat( [ header, ...images ] );

}

async function drawCards() {

	const { chromium } = require( 'playwright' );
	mkdirSync( new URL( 'og/', PUBLIC ), { recursive: true } );
	const vite = await startVite( PORT, {}, 'vite.drive.config.js' );
	const browser = await chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader' ] } );
	try {

		const page = await browser.newPage();
		await page.route( /^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort() );
		await page.goto( `http://127.0.0.1:${ PORT }/` );
		await page.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 60000 } );
		const car = await page.evaluate( drawCar, { id: CAR, size: [ 1400, 900 ], view: VIEW } );
		const trimmed = await sharp( Buffer.from( car.split( ',' )[ 1 ], 'base64' ) ).trim( { threshold: 1 } ).png().toBuffer();
		const carUrl = `data:image/png;base64,${ trimmed.toString( 'base64' ) }`;

		const cards = [
			{ file: 'world-drive.png', html: cardHtml( { carUrl } ) },
			...PLACES.map( place => ( { file: `${ place.slug }.png`, html: cardHtml( { carUrl, place } ) } ) ),
		];
		const card = await browser.newPage( { viewport: { width: CARD[ 0 ], height: CARD[ 1 ] } } );
		await card.route( /^https?:\/\//, route => route.abort() );
		for ( const { file, html } of cards ) {

			await card.setContent( html );
			await card.evaluate( () => document.fonts.ready );
			const shot = await card.screenshot( { type: 'png' } );
			// A palette keeps each card small (they're fetched by every chat a link is posted in).
			await sharp( shot ).png( { palette: true, quality: 92, dither: 0.6, compressionLevel: 9 } ).toFile( new URL( `og/${ file }`, PUBLIC ).pathname );
			console.log( `Drew og/${ file }` );

		}

	} finally {

		await browser.close();
		vite.stop();

	}

}

// In the page: the car alone, lit as World Drive lights it, on nothing (see-through), as a PNG's
// data URL. three.js's classes come from the objects window.drive holds.
async function drawCar( { id, size, view } ) {

	const { renderer: shown, scene: world, camera: worldCamera, models } = window.drive;
	const { loadVehicles } = await import( '/src/drive-app/vehicles.js' );
	const vehicle = ( await loadVehicles() ).find( v => v.id === id );
	const model = vehicle.build ? vehicle.build() : await vehicle.load( models.loader );
	const renderer = new shown.constructor( { antialias: true, alpha: true, preserveDrawingBuffer: true } );
	renderer.setSize( ...size );
	renderer.setClearColor( 0x000000, 0 );
	const scene = new world.constructor();
	for ( const light of world.children.filter( child => child.isLight ) ) {

		const copy = light.clone();
		scene.add( copy );
		if ( copy.target ) scene.add( copy.target );

	}

	scene.add( model );
	model.updateMatrixWorld( true );
	const point = model.position.clone();
	const centre = model.position.clone();
	const corners = [];
	model.traverse( object => {

		if ( ! object.isMesh ) return;
		const positions = object.geometry.attributes.position;
		for ( let i = 0; i < positions.count; i ++ ) corners.push( point.fromBufferAttribute( positions, i ).applyMatrix4( object.matrixWorld ).clone() );

	} );
	for ( const corner of corners ) centre.add( corner );
	centre.divideScalar( corners.length );
	const radius = Math.max( ...corners.map( corner => corner.distanceTo( centre ) ) );
	const camera = new worldCamera.constructor( 26, size[ 0 ] / size[ 1 ], 0.05, 500 );
	camera.position.set( ...view ).normalize().multiplyScalar( radius / Math.sin( 13 * Math.PI / 180 ) * 0.85 ).add( centre );
	camera.lookAt( centre );
	renderer.render( scene, camera );
	const data = renderer.domElement.toDataURL( 'image/png' );
	renderer.dispose();
	return data;

}

// The Moon's cards: for each of `which` (a Moon page's slug, or 'hub' for /moon/), World Drive on
// the Moon in a page of the card's size, its picture with the words over it.
async function drawMoon( which ) {

	const { chromium } = require( 'playwright' );
	mkdirSync( new URL( 'og/', PUBLIC ), { recursive: true } );
	const vite = await startVite( PORT, {}, 'vite.drive.config.js' );
	const browser = await chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader' ] } );
	const base = `http://127.0.0.1:${ PORT }`;
	try {

		const card = await browser.newPage( { viewport: { width: CARD[ 0 ], height: CARD[ 1 ] } } );
		await card.route( /^https?:\/\//, route => route.abort() );
		for ( const slug of which ) {

			const place = MOON_PAGES.find( p => p.slug === slug ) ?? null;
			const shot = place ? { ...MOON_FRAME, ...MOON_SHOTS[ slug ] } : null;
			// A fresh page each time, with the ride picked and the boost pads off (they'd be in the picture).
			const context = await browser.newContext( { viewport: { width: CARD[ 0 ], height: CARD[ 1 ] } } );
			await context.addInitScript( ride => {

				localStorage.setItem( 'world-drive.vehicle', ride );
				localStorage.setItem( 'world-drive.pads', 'off' );

			}, shot?.vehicle ?? 'go-kart' );
			const page = await context.newPage();
			await page.route( /^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort() );
			let photo;
			try {

				photo = place ? await moonGround( page, base, place, shot ) : await moonGlobe( page, base );

			} finally {

				await context.close();

			}

			await card.setContent( moonCardHtml( { photo, place } ) );
			await card.evaluate( () => document.fonts.ready );
			const file = `og/${ place ? `moon-${ slug }` : 'moon' }.png`;
			const png = await smallPng( await card.screenshot( { type: 'png' } ) );
			writeFileSync( new URL( file, PUBLIC ), png );
			console.log( `Drew ${ file } (${ Math.round( png.length / 1000 ) } kB)` );

		}

	} finally {

		await browser.close();
		vite.stop();

	}

}

// Dropped in at the place's start spot (its link pins it, as its page's Drive here does), framed
// (frameMoon), the ground sharpened round the camera and the ride, and the picture with nothing
// over it: a PNG's data URL.
async function moonGround( page, base, place, shot ) {

	await page.goto( `${ base }/?spot=${ place.spot }` );
	await page.waitForFunction( id => window.drive?.world === 'moon' && window.drive.panel.pinned?.id === id && ! window.drive.globe.flight, place.spot, { timeout: 120000 } );
	await page.evaluate( () => {

		window.drive.dropIn( window.drive.panel.pinned );

	} );
	await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 300000 } );
	const framed = await page.evaluate( frameMoon, { ...shot, highest: MOON_EARTH_HIGHEST } );
	console.log( `${ place.slug }: ${ JSON.stringify( framed ) }` );
	return snapshot( page );

}

// The Moon from space, as the globe shows it once turned there, on the right of the card.
async function moonGlobe( page, base ) {

	await page.goto( base );
	await page.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 120000 } );
	await page.evaluate( () => window.drive.setWorld( 'moon' ) );
	await page.waitForFunction( () => window.drive.world === 'moon' && ! window.drive.globe.flight, null, { timeout: 120000 } );
	await page.evaluate( ( [ width, height ] ) => {

		const { globe, camera } = window.drive;
		const orbit = globe.orbit( 10, 8 );
		globe.place( { ...orbit, distance: orbit.distance * 0.9 } );
		// Moved right of the middle, the words' side left to the stars.
		camera.setViewOffset( width, height, - width * 0.2, 0, width, height );

	}, CARD );
	return snapshot( page );

}

// Once the Moon's ground has nothing more to build for a few frames (built faster meanwhile, as
// while the loading screen is up), the page's picture with everything over the 3D view hidden.
async function snapshot( page ) {

	await page.evaluate( () => {

		window.drive.moon.rush = true;
		window.__quiet = 0;

	} );
	await page.waitForFunction( () => {

		window.__quiet = window.drive.moon.pending === 0 ? window.__quiet + 1 : 0;
		return window.__quiet >= 4;

	}, null, { polling: 'raf', timeout: 300000 } );
	await page.addStyleTag( { content: 'body > :not( #app ) { display: none !important; }' } );
	await page.evaluate( () => new Promise( resolve => requestAnimationFrame( () => requestAnimationFrame( resolve ) ) ) );
	const png = await page.screenshot( { type: 'png', timeout: 120000 } );
	return `data:image/png;base64,${ png.toString( 'base64' ) }`;

}

// In the page, once dropped in: the camera looking toward the Earth so it's at `earthAt` on the
// card, or along the heading `look` with the camera `pitch`° up; the ride turned `turn`° from facing
// straight away from it (and let settle on the ground that way for a few frames, so it sits on a
// slope as it would), then it and the camera held still (the driver's update and the field of view
// taken over), the ride at `rideAt` on the card, a little over its length away. Where that would put
// the camera under the ground (a high Earth, looked up at), the ride and the camera go up together,
// as in a jump. Says where the Earth was and what was done.
async function frameMoon( { look, fov, rideAt: [ rideX, rideY ], earthAt: [ earthX, earthY ], turn, pitch: level, highest } ) {

	const { driver, camera, moon, entry, ground } = window.drive;
	const Vector = camera.position.constructor;
	const DEG = Math.PI / 180;
	// (The loop eases the field of view toward driving's and sets it each frame: this one stays.)
	Object.defineProperty( camera, 'fov', { configurable: true, get: () => fov, set: () => {} } );
	camera.updateProjectionMatrix();
	const tan = Math.tan( fov * DEG / 2 );
	const { aspect } = camera;
	// The Earth, over the middle of the near side: its heading and height in the sky here.
	moon.group.updateMatrixWorld();
	const toEarth = new Vector( 1, 0, 0 ).transformDirection( moon.group.matrixWorld );
	const earthUp = Math.asin( toEarth.y ) / DEG;
	const earthHeading = Math.atan2( - toEarth.x, toEarth.z ) / DEG;
	const seen = look === 'earth' && earthUp > 2 && earthUp <= highest;
	const heading = seen ? earthHeading - Math.atan( earthX * tan * aspect ) / DEG : ( typeof look === 'number' ? look : 135 );
	const pitch = seen ? earthUp - Math.atan( earthY * tan ) / DEG : level;
	// (The scene's frame: x west, y up, z north.)
	const forward = new Vector( - Math.sin( heading * DEG ) * Math.cos( pitch * DEG ), Math.sin( pitch * DEG ), Math.cos( heading * DEG ) * Math.cos( pitch * DEG ) );
	// The ride turned, and let settle there with the camera ours.
	driver.placeCamera = () => {};
	const facing = ( ( heading + turn ) % 360 + 360 ) % 360;
	Object.assign( driver, { heading: facing, view: facing, speed: 0, vy: 0 } );
	for ( let i = 0; i < 6; i ++ ) await new Promise( resolve => requestAnimationFrame( resolve ) );
	driver.update = () => {};
	camera.up.set( 0, 1, 0 );
	camera.position.set( 0, 0, 0 );
	camera.lookAt( forward );
	const { pivot } = entry;
	const centre = pivot.getWorldPosition( new Vector() );
	centre.y += driver.height / 2;
	const ray = new Vector( rideX * tan * aspect, rideY * tan, - 1 ).normalize().applyQuaternion( camera.quaternion );
	const distance = Math.max( 4.5, driver.length * 1.8 );
	camera.position.copy( centre ).addScaledVector( ray, - distance );
	const under = ground.heightAt( camera.position.x, camera.position.z, camera.position.y + 300, 1000 );
	const lift = under === null ? 0 : Math.max( 0, under + 0.8 - camera.position.y );
	camera.position.y += lift;
	pivot.position.y += lift;
	pivot.updateMatrixWorld( true );
	camera.updateMatrixWorld();
	// Where the Earth and the ride came out on the card (-1 to 1 across and up), to check by.
	const round = value => Math.round( value * 100 ) / 100;
	const onCard = point => point.project( camera ).toArray().slice( 0, 2 ).map( round );
	return {
		earthUp: round( earthUp ), earthHeading: round( earthHeading ), heading: round( heading ), pitch: round( pitch ), lift: round( lift ), under: under === null ? null : round( under ),
		earth: seen ? onCard( camera.position.clone().addScaledVector( toEarth, 1000 ) ) : null,
		ride: onCard( pivot.getWorldPosition( new Vector() ).add( new Vector( 0, driver.height / 2, 0 ) ) ),
	};

}

// A card as a palette PNG under MOON_CARD_BYTES: fewer colours until it fits.
async function smallPng( shot ) {

	let png;
	for ( const colours of [ 256, 192, 128, 96, 64 ] ) {

		png = await sharp( shot ).png( { palette: true, colours, quality: 90, dither: 0.8, compressionLevel: 9, effort: 10 } ).toBuffer();
		if ( png.length < MOON_CARD_BYTES ) break;

	}

	return png;

}

// A Moon card: World Drive's picture of it, shaded on the left under the words, as the others have them.
function moonCardHtml( { photo, place = null } ) {

	const words = place
		? `<p class="small-logo">World <b>Drive</b></p>
			<h1 class="place${ place.title.length > 40 ? ' long' : '' }">${ esc( place.title ) }</h1>
			<p class="region">${ esc( place.region ) }</p>
			<p class="chips"><span>The real Moon, from NASA</span><span>Free in your browser</span></p>`
		: `<h1 class="logo">World <b>Drive</b></h1>
			<p class="tagline">Drive on the Moon.</p>
			<p class="chips"><span>The real Moon, from NASA</span><span>A sixth of the gravity</span><span>Free in your browser</span></p>`;
	return `<!doctype html><html><head><meta charset="utf-8"><style>
		* { box-sizing: border-box; }
		html, body { margin: 0; width: ${ CARD[ 0 ] }px; height: ${ CARD[ 1 ] }px; overflow: hidden; }
		body {
			position: relative;
			font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
			color: #f4f7fb;
			background: #000 url( ${ photo } ) center / cover no-repeat;
		}
		.shade { position: absolute; inset: 0; background: linear-gradient( 90deg, rgba( 4, 7, 14, 0.82 ) 0%, rgba( 4, 7, 14, 0.6 ) 40%, rgba( 4, 7, 14, 0 ) 64% ); }
		.place.long { font-size: 54px; }
		${ WORDS_CSS }
	</style></head><body>
		<div class="shade"></div>
		<div class="words">${ words }</div>
		<p class="url">worlddrive.app</p>
	</body></html>`;

}

function esc( text ) {

	return String( text ).replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' ).replace( /"/g, '&quot;' );

}

// The card: the night sky, the top of the Earth (the test globe's blue, with its lines) curving
// along the bottom, the car driving over it with a boost's trail, and the words.
function cardHtml( { carUrl, place = null } ) {

	const words = place
		? `<p class="small-logo">World <b>Drive</b></p>
			<h1 class="place">${ esc( place.title ) }</h1>
			<p class="region">${ esc( place.region ) }</p>
			<p class="chips"><span>Free in your browser</span><span>Stunts · Boosts · Fly</span></p>`
		: `<h1 class="logo">World <b>Drive</b></h1>
			<p class="tagline">Pick anywhere on Earth. Drop in. Drive.</p>
			<p class="chips"><span>Real cities in 3D</span><span>Stunts · Boosts · Fly</span><span>Free in your browser</span></p>`;
	return `<!doctype html><html><head><meta charset="utf-8"><style>
		* { box-sizing: border-box; }
		html, body { margin: 0; width: ${ CARD[ 0 ] }px; height: ${ CARD[ 1 ] }px; overflow: hidden; }
		body {
			position: relative;
			font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
			color: #f4f7fb;
			background:
				radial-gradient( 1.5px 1.5px at 12% 18%, rgba( 255, 255, 255, 0.9 ), transparent 60% ),
				radial-gradient( 1.5px 1.5px at 46% 9%, rgba( 255, 255, 255, 0.7 ), transparent 60% ),
				radial-gradient( 2px 2px at 72% 14%, rgba( 255, 255, 255, 0.8 ), transparent 60% ),
				radial-gradient( 1.5px 1.5px at 88% 34%, rgba( 255, 255, 255, 0.6 ), transparent 60% ),
				radial-gradient( 1.5px 1.5px at 58% 30%, rgba( 255, 255, 255, 0.5 ), transparent 60% ),
				radial-gradient( 1px 1px at 33% 42%, rgba( 255, 255, 255, 0.6 ), transparent 60% ),
				radial-gradient( 1.5px 1.5px at 94% 8%, rgba( 255, 255, 255, 0.7 ), transparent 60% ),
				radial-gradient( ellipse at 70% 120%, #16407a 0%, #0b1a33 45%, #070c16 75% );
		}
		.earth { position: absolute; left: -200px; top: 430px; width: 1600px; height: 1600px; border-radius: 50%;
			background: radial-gradient( circle at 50% 8%, #2f8ad6 0%, #1d6fb8 18%, #155a9c 40%, #0d3b6b 70% );
			box-shadow: 0 0 60px 18px rgba( 62, 193, 255, 0.45 ), inset 0 18px 40px rgba( 207, 232, 255, 0.35 ); overflow: hidden; }
		.earth::before { content: ''; position: absolute; inset: 0; border-radius: 50%;
			background:
				repeating-linear-gradient( 90deg, transparent 0 118px, rgba( 255, 255, 255, 0.22 ) 118px 121px ),
				repeating-radial-gradient( circle at 50% 50%, transparent 0 96px, rgba( 255, 255, 255, 0.18 ) 96px 99px ); }
		.trail { position: absolute; left: 420px; top: 452px; width: 420px; height: 26px; border-radius: 13px;
			background: linear-gradient( 90deg, transparent, rgba( 255, 210, 63, 0.25 ) 35%, rgba( 255, 210, 63, 0.9 ) 85%, #fff4c2 );
			filter: blur( 3px ); transform: rotate( -3deg ); }
		.streak { position: absolute; height: 3px; border-radius: 2px; background: linear-gradient( 90deg, transparent, rgba( 255, 255, 255, 0.75 ) ); }
		.car { position: absolute; right: 30px; bottom: 120px; width: 560px; filter: drop-shadow( 0 18px 18px rgba( 0, 0, 0, 0.55 ) ); }
		${ WORDS_CSS }
	</style></head><body>
		<div class="earth"></div>
		<div class="trail"></div>
		<div class="streak" style="left: 470px; top: 410px; width: 220px"></div>
		<div class="streak" style="left: 520px; top: 500px; width: 170px"></div>
		<div class="streak" style="left: 430px; top: 470px; width: 140px; opacity: 0.6"></div>
		<img class="car" src="${ carUrl }" alt="">
		<div class="words">${ words }</div>
		<p class="url">worlddrive.app</p>
	</body></html>`;

}
