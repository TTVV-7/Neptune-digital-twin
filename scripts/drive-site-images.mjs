// node scripts/drive-site-images.mjs [icons] [cards]: draws World Drive's icons and the pictures
// its links unfurl with into drive/public/ (both, with neither named):
//
// - icons: favicon.svg (the globe with its road, as the page always had it), favicon.ico (16, 32
//   and 48 px), apple-touch-icon.png (180 px), and the web app manifest's icons/icon-192.png,
//   icon-512.png and icon-maskable-512.png (its safe circle kept clear), from that drawing.
// - cards: og/world-drive.png, the 1200 × 630 card a link to the game shows in a chat or a post
//   (og:image), and og/<slug>.png for each place's page (drive/site/places.js). The name, the line
//   under it and the Earth are drawn in HTML and CSS; the car is the muscle car as World Drive
//   draws it, on nothing. No picture of Google's tiles: the cards are World Drive's own drawing.
//
// Run it after changing the places (a new page gets its card) or the look. Needs Playwright with
// Chromium for the cards, as the tests do; it starts World Drive's dev server (with no Maps key) on
// TEST_VITE_PORT or 5536 and loads nothing from anywhere else.

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import sharp from 'sharp';
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
const wanted = what => asked.length === 0 || asked.includes( what );

// The globe with a road over it, as the page's favicon has been since the start: a 64-unit square.
const GLOBE = `<circle cx="32" cy="32" r="30" fill="#155a9c"/><path d="M10 40c8-4 14-4 22 0s14 4 22 0" stroke="#ffd23f" stroke-width="7" fill="none" stroke-linecap="round"/>`;
const svg = ( inner, { size = 64, background = null, scale = 1 } = {} ) => {

	const pad = 32 - 32 * scale;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${ size }" height="${ size }">${ background ? `<rect width="64" height="64" fill="${ background }"/>` : '' }<g transform="translate(${ pad } ${ pad }) scale(${ scale })">${ inner }</g></svg>`;

};

if ( wanted( 'icons' ) ) await drawIcons();
if ( wanted( 'cards' ) ) await drawCards();

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
		.words { position: absolute; left: 64px; top: 58px; width: 640px; }
		.logo { margin: 0; font-size: 112px; font-weight: 900; font-style: italic; line-height: 0.95; letter-spacing: -2px; text-transform: uppercase; }
		.logo b, .small-logo b { color: #ffd23f; font-weight: 900; }
		.tagline { margin: 22px 0 0; font-size: 31px; font-weight: 700; color: rgba( 244, 247, 251, 0.85 ); }
		.small-logo { margin: 0; font-size: 34px; font-weight: 900; font-style: italic; text-transform: uppercase; letter-spacing: -0.5px; }
		.place { margin: 26px 0 0; font-size: 66px; line-height: 1.02; font-weight: 900; font-style: italic; letter-spacing: -1px; }
		.region { margin: 14px 0 0; font-size: 26px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: rgba( 244, 247, 251, 0.75 ); }
		.chips { display: flex; flex-wrap: wrap; gap: 12px; margin: 30px 0 0; }
		.chips span { padding: 10px 18px; border: 1px solid rgba( 255, 255, 255, 0.18 ); border-radius: 14px; background: rgba( 9, 15, 27, 0.7 ); font-size: 22px; font-weight: 800; }
		.url { position: absolute; left: 64px; bottom: 36px; font-size: 26px; font-weight: 800; color: #070c16; background: #ffd23f; padding: 8px 18px; border-radius: 12px; font-style: italic; }
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
