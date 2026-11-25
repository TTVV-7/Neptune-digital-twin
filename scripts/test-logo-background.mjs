// npm run test:logo-background: Build Pro's company logo with its background taken out
// (src/logo-background.js), on the dashboard (src/build-home/main.js's logo editor) and on the
// equipment (src/logo.js).
//
// First the pixel work itself, in Node, on images made here: a dark logo on a JPEG-like white with
// white letters inside it (the letters kept, the white round it gone, no light fringe left on its
// edge), one on a coloured background, a PNG that's see-through already (left as it is), a
// photo-like noisy background (the tolerance taking it, and taking less turned down), an O's hole
// (kept, or cleared with "enclosed areas"), a busy picture (left), and the texture's colour bleed.
// Then in a real browser against the Vite dev server: the dashboard (its API answered here, as a
// Build Pro account) given a real JPEG with the editor's before and after, its tolerance and
// options, saving a PNG with alpha; the saved logo's "Remove background"; and an excavator in the
// editor wearing the saved PNG, see-through round the logo.
//
// Needs Playwright with Chromium. TEST_VITE_PORT picks the port. TEST_SCREENSHOTS=<folder> saves
// logo-preview.png (the dashboard's editor) and logo-equipment.png (the excavator) there.

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { TOLERANCE, bleedColours, removeBackground } from '../src/logo-background.js';
import { dropProjectModels, startVite } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5931;
const SHOTS = process.env.TEST_SCREENSHOTS;

// --- images made here ------------------------------------------------------------------------

// A seeded random number in [0, 1), and a roughly normal one.
function random( seed ) {

	let s = seed;
	const next = () => ( s = s * 16807 % 2147483647 ) / 2147483647;
	next.normal = () => ( next() + next() + next() + next() - 2 ) * 1.73;
	return next;

}

// A width × height image, each pixel the mix of shapes over a background, 4 × 4 samples a pixel
// (anti-aliased as a drawn logo is): shapes are [ inside( x, y ), [ r, g, b ] ], the last one that
// holds a sample wins. noise: added to each channel (a JPEG's grain or a photo's).
function draw( width, height, background, shapes, { noise = 0, seed = 1 } = {} ) {

	const rnd = random( seed );
	const data = new Uint8ClampedArray( width * height * 4 );
	const S = 4;
	for ( let y = 0; y < height; y ++ ) for ( let x = 0; x < width; x ++ ) {

		const sum = [ 0, 0, 0 ];
		for ( let sy = 0; sy < S; sy ++ ) for ( let sx = 0; sx < S; sx ++ ) {

			const px = x + ( sx + 0.5 ) / S, py = y + ( sy + 0.5 ) / S;
			let colour = typeof background === 'function' ? background( px, py ) : background;
			for ( const [ inside, fill ] of shapes ) if ( inside( px, py ) ) colour = fill;
			for ( let c = 0; c < 3; c ++ ) sum[ c ] += colour[ c ];

		}

		const i = ( y * width + x ) * 4;
		for ( let c = 0; c < 3; c ++ ) data[ i + c ] = sum[ c ] / ( S * S ) + ( noise ? rnd.normal() * noise : 0 );
		data[ i + 3 ] = 255;

	}

	return { width, height, data };

}

const ellipse = ( cx, cy, rx, ry ) => ( x, y ) => ( ( x - cx ) / rx ) ** 2 + ( ( y - cy ) / ry ) ** 2 <= 1;
const rect = ( x0, y0, x1, y1 ) => ( x, y ) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const ring = ( cx, cy, r0, r1 ) => ( x, y ) => {

	const d = Math.hypot( x - cx, y - cy );
	return d >= r0 && d <= r1;

};

const NAVY = [ 24, 36, 64 ];
const WHITE = [ 255, 255, 255 ];
// A dark badge with three white letters (bars) inside it, on a white JPEG-like ground.
const badge = () => draw( 240, 120, [ 252, 252, 250 ], [
	[ ellipse( 120, 60, 90, 40 ), NAVY ],
	[ rect( 70, 45, 85, 75 ), WHITE ], [ rect( 112, 45, 127, 75 ), WHITE ], [ rect( 154, 45, 169, 75 ), WHITE ],
], { noise: 3 } );

const at = ( { width, data }, x, y ) => [ ...data.slice( ( y * width + x ) * 4, ( y * width + x ) * 4 + 4 ) ];
// The result's pixel for a pixel of the image it was made from (it's trimmed).
const from = ( image, x, y ) => at( image, x - image.x, y - image.y );

// The light fringe left on a logo's edge: for each pixel that shows next to one that doesn't, how
// much lighter than the logo's own colour it would show over black paint (its colour × alpha),
// the worst of them.
function fringe( { width, height, data }, logo ) {

	const own = ( logo[ 0 ] + logo[ 1 ] + logo[ 2 ] ) / 3;
	let worst = 0;
	for ( let y = 1; y < height - 1; y ++ ) for ( let x = 1; x < width - 1; x ++ ) {

		const i = ( y * width + x ) * 4;
		const a = data[ i + 3 ] / 255;
		if ( a === 0 ) continue;
		const edge = [ - 1, 1, - width, width ].some( d => data[ i + d * 4 + 3 ] === 0 );
		if ( ! edge ) continue;
		const light = ( data[ i ] + data[ i + 1 ] + data[ i + 2 ] ) / 3;
		worst = Math.max( worst, ( light - own ) * a );

	}

	return worst;

}

describe( 'taking the background out (src/logo-background.js)', () => {

	test( 'a dark logo on a JPEG-like white: the white round it gone, the white letters inside kept, no light fringe', () => {

		const image = badge();
		const out = removeBackground( image );
		assert.equal( out.skipped, null );
		assert.equal( out.colours.length, 1 );
		assert.ok( out.colours[ 0 ].every( v => v > 245 ), `background ${ out.colours[ 0 ] }` );
		const result = out.image;
		// Trimmed to the badge (180 × 80) with a little padding.
		assert.ok( result.width >= 180 && result.width <= 192, `${ result.width } wide` );
		assert.ok( result.height >= 80 && result.height <= 92, `${ result.height } high` );
		// The letters, inside: white and solid.
		for ( const [ x, y ] of [ [ 77, 60 ], [ 120, 60 ], [ 161, 60 ] ] ) {

			const [ r, g, b, a ] = from( result, x, y );
			assert.equal( a, 255, `letter at ${ x },${ y } kept` );
			assert.ok( r > 240 && g > 240 && b > 240, `letter at ${ x },${ y } still white` );

		}

		// The badge itself solid, its corners' white gone.
		assert.equal( from( result, 100, 30 )[ 3 ], 255 );
		assert.equal( at( result, 0, 0 )[ 3 ], 0 );
		assert.equal( at( result, result.width - 1, result.height - 1 )[ 3 ], 0 );
		// About the badge's share of the picture left: an ellipse of 90 × 40 in 240 × 120.
		const shows = [ ...Array( result.width * result.height ).keys() ].filter( i => result.data[ i * 4 + 3 ] > 0 ).length;
		const ellipseArea = Math.PI * 90 * 40;
		assert.ok( Math.abs( shows - ellipseArea ) < ellipseArea * 0.05, `${ shows } px show, the badge is ${ Math.round( ellipseArea ) }` );
		// No light fringe: its edge's pixels no lighter than the navy, give or take.
		const halo = fringe( result, NAVY );
		assert.ok( halo < 30, `edge up to ${ halo.toFixed( 1 ) } lighter than the logo` );
		// Without the un-mixing, that edge would be a light ring: what's being guarded against.
		assert.ok( fringe( { ...image, data: image.data.map( ( v, i ) => i % 4 === 3 && image.data[ i - 1 ] > 240 ? 0 : v ) }, NAVY ) > 60 );

	} );

	test( 'a logo on a coloured background', () => {

		const BLUE = [ 30, 90, 168 ];
		const image = draw( 200, 100, BLUE, [
			[ rect( 30, 25, 170, 75 ), [ 255, 205, 0 ] ],
			[ rect( 60, 40, 140, 60 ), WHITE ],
		], { noise: 2 } );
		const out = removeBackground( image );
		assert.equal( out.skipped, null );
		assert.ok( out.colours[ 0 ].every( ( v, c ) => Math.abs( v - BLUE[ c ] ) < 4 ), `background ${ out.colours[ 0 ] }` );
		assert.equal( at( out.image, 0, 0 )[ 3 ], 0 );
		assert.equal( from( out.image, 100, 50 )[ 3 ], 255, 'the white inside kept' );
		assert.equal( from( out.image, 40, 30 )[ 3 ], 255, 'the yellow kept' );
		assert.ok( out.removed > 0.6 && out.removed < 0.7, `${ ( out.removed * 100 ).toFixed( 1 ) } % taken` );
		// Its edge un-mixed from the blue: no blue left showing in it.
		for ( let y = 0; y < out.image.height; y ++ ) for ( let x = 0; x < out.image.width; x ++ ) {

			const [ r, g, b, a ] = at( out.image, x, y );
			if ( a > 20 ) assert.ok( ! ( b > r + 30 && b > g + 10 ), `blue fringe at ${ x },${ y }: ${ [ r, g, b, a ] }` );

		}

	} );

	test( 'a PNG that\'s see-through already is left as it is', () => {

		const image = draw( 120, 60, WHITE, [ [ ellipse( 60, 30, 40, 20 ), NAVY ] ] );
		for ( let i = 0; i < 120 * 60; i ++ ) if ( ! ellipse( 60, 30, 40, 20 )( i % 120 + 0.5, Math.floor( i / 120 ) + 0.5 ) ) image.data[ i * 4 + 3 ] = 0;
		const copy = new Uint8ClampedArray( image.data );
		const out = removeBackground( image );
		assert.equal( out.skipped, 'transparent' );
		assert.equal( out.image, image );
		assert.deepEqual( out.image.data, copy );

	} );

	test( 'a photo-like noisy background: taken at the default tolerance, less of it turned down, no specks left', () => {

		// A beige wall's grain and a light falling across it, behind a dark logo.
		const image = draw( 240, 140, ( x, y ) => [ 196 + x * 0.06 - y * 0.05, 180 + x * 0.05, 150 ], [
			[ ellipse( 120, 70, 70, 35 ), [ 40, 30, 28 ] ],
			[ rect( 95, 62, 145, 78 ), [ 235, 230, 220 ] ],
		], { noise: 9, seed: 7 } );
		const out = removeBackground( image );
		assert.equal( out.skipped, null );
		const background = 240 * 140 - Math.PI * 70 * 35;
		assert.ok( out.removed * 240 * 140 > background * 0.97, `${ ( out.removed * 100 ).toFixed( 1 ) } % taken` );
		// Specks: what shows outside the logo's ellipse (by more than its 2 px edge).
		let specks = 0;
		for ( let y = 0; y < out.image.height; y ++ ) for ( let x = 0; x < out.image.width; x ++ ) {

			const ox = x + out.image.x + 0.5, oy = y + out.image.y + 0.5;
			if ( at( out.image, x, y )[ 3 ] > 25 && ! ellipse( 120, 70, 73, 38 )( ox, oy ) ) specks ++;

		}

		assert.ok( specks < 20, `${ specks } specks left` );
		assert.equal( from( out.image, 120, 70 )[ 3 ], 255, 'the light panel inside kept' );
		// Turned down, the grain stops much of it.
		const tight = removeBackground( image, { tolerance: 8 } );
		assert.ok( tight.removed < out.removed * 0.6, `${ ( tight.removed * 100 ).toFixed( 1 ) } % at 8, ${ ( out.removed * 100 ).toFixed( 1 ) } % at ${ TOLERANCE }` );

	} );

	test( 'an O\'s hole: kept, or cleared with "Also clear enclosed areas"', () => {

		const image = draw( 160, 120, WHITE, [ [ ring( 80, 60, 25, 45 ), NAVY ] ], { noise: 2 } );
		const kept = removeBackground( image );
		assert.equal( from( kept.image, 80, 60 )[ 3 ], 255 );
		const cleared = removeBackground( image, { enclosed: true } );
		assert.equal( from( cleared.image, 80, 60 )[ 3 ], 0 );
		assert.equal( from( cleared.image, 80, 20 )[ 3 ], 255, 'the ring kept' );

	} );

	test( 'a busy picture, a photo to its edges, is left; a tolerance that takes everything says so', () => {

		const rnd = random( 3 );
		const noise = { width: 64, height: 64, data: Uint8ClampedArray.from( { length: 64 * 64 * 4 }, ( _, i ) => i % 4 === 3 ? 255 : rnd() * 255 ) };
		assert.equal( removeBackground( noise ).skipped, 'busy' );
		const pale = draw( 60, 40, WHITE, [ [ rect( 20, 10, 40, 30 ), [ 235, 235, 235 ] ] ] );
		assert.equal( removeBackground( pale, { tolerance: 100 } ).empty, true );

	} );

	test( 'the texture\'s see-through pixels take their neighbours\' colour', () => {

		const image = { width: 4, height: 1, data: new Uint8ClampedArray( [ 0, 0, 0, 0, 200, 100, 50, 255, 0, 0, 0, 0, 0, 0, 0, 0 ] ) };
		bleedColours( image );
		assert.deepEqual( [ ...image.data ], [ 200, 100, 50, 0, 200, 100, 50, 255, 200, 100, 50, 0, 200, 100, 50, 0 ] );

	} );

} );

// --- in the browser --------------------------------------------------------------------------

// A PNG's colour type (6: RGBA) and its pixels' alpha, read here (8-bit, non-interlaced, as a
// canvas makes them).
function pngAlpha( bytes ) {

	assert.equal( bytes.subarray( 1, 4 ).toString(), 'PNG' );
	const width = bytes.readUInt32BE( 16 ), height = bytes.readUInt32BE( 20 );
	const type = bytes[ 25 ];
	const chunks = [];
	for ( let p = 8; p < bytes.length; ) {

		const length = bytes.readUInt32BE( p );
		const kind = bytes.subarray( p + 4, p + 8 ).toString();
		if ( kind === 'IDAT' ) chunks.push( bytes.subarray( p + 8, p + 8 + length ) );
		p += 12 + length;

	}

	const raw = inflateSync( Buffer.concat( chunks ) );
	const bpp = type === 6 ? 4 : 3;
	const stride = width * bpp;
	const rows = Buffer.alloc( height * stride );
	for ( let y = 0; y < height; y ++ ) {

		const filter = raw[ y * ( stride + 1 ) ];
		for ( let x = 0; x < stride; x ++ ) {

			const v = raw[ y * ( stride + 1 ) + 1 + x ];
			const left = x >= bpp ? rows[ y * stride + x - bpp ] : 0;
			const up = y ? rows[ ( y - 1 ) * stride + x ] : 0;
			const corner = x >= bpp && y ? rows[ ( y - 1 ) * stride + x - bpp ] : 0;
			const paeth = () => {

				const p = left + up - corner, pa = Math.abs( p - left ), pb = Math.abs( p - up ), pc = Math.abs( p - corner );
				return pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;

			};

			rows[ y * stride + x ] = ( v + [ 0, left, up, ( left + up ) >> 1, paeth() ][ filter ] ) & 255;

		}

	}

	const alpha = type === 6 ? Array.from( { length: width * height }, ( _, i ) => rows[ i * 4 + 3 ] ) : null;
	return { width, height, type, alpha };

}

describe( 'in the browser', () => {

	let browser;
	let vite;
	let base;
	let context;
	let page;
	const errors = [];
	let saved = null;
	let homeHasLogo = false;
	let storedLogo = null;

	before( async () => {

		const { chromium } = require( 'playwright' );
		vite = await startVite( PORT );
		base = vite.base;
		browser = await chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader' ] } );
		context = await browser.newContext( { viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 } );
		page = await context.newPage();
		page.on( 'pageerror', e => errors.push( String( e ) ) );
		await page.route( '**/*', route => {

			const url = route.request().url();
			return url.startsWith( base ) || url.startsWith( 'data:' ) || url.startsWith( 'blob:' ) ? route.continue() : route.abort();

		} );
		// The dashboard's API, as for a Build Pro account.
		await page.route( `${ base }/build/api/**`, async route => {

			const request = route.request();
			const path = new URL( request.url() ).pathname.replace( '/build/api/', '' );
			const json = body => route.fulfill( { status: 200, contentType: 'application/json', body: JSON.stringify( body ) } );
			if ( path === 'home' ) return json( {
				signedIn: true, user: { name: 'Tester', email: 'tester@example.com' }, googleClientId: null,
				plan: { tier: 'pro', views: { used: 3, limit: null }, layouts: null },
				premium: { billing: { enabled: false } }, hasLogo: homeHasLogo, connections: 0, notices: [],
			} );
			if ( path === 'layouts' ) return json( { layouts: [] } );
			if ( path === 'logo' && request.method() === 'PUT' ) {

				saved = request.postDataJSON().image;
				storedLogo = Buffer.from( saved.split( ',' )[ 1 ], 'base64' );
				homeHasLogo = true;
				return route.fulfill( { status: 204 } );

			}

			if ( path === 'logo' && request.method() === 'GET' && storedLogo ) return route.fulfill( { status: 200, contentType: 'image/png', body: storedLogo } );
			return route.fulfill( { status: 404, contentType: 'application/json', body: '{"error":"not found"}' } );

		} );

	} );

	after( async () => {

		await browser?.close();
		vite?.stop();

	} );

	// A logo file made in the page: a dark badge with white letters on a white box, as a JPEG.
	const jpegLogo = () => page.evaluate( async () => {

		const canvas = document.createElement( 'canvas' );
		canvas.width = 640;
		canvas.height = 320;
		const g = canvas.getContext( '2d' );
		g.fillStyle = '#fdfdfb';
		g.fillRect( 0, 0, 640, 320 );
		g.fillStyle = '#1b2a44';
		g.beginPath();
		g.roundRect( 60, 70, 520, 180, 40 );
		g.fill();
		g.fillStyle = '#ffd60a';
		g.beginPath();
		g.moveTo( 100, 220 );
		g.lineTo( 150, 100 );
		g.lineTo( 200, 220 );
		g.fill();
		g.fillStyle = '#ffffff';
		g.font = 'bold 96px sans-serif';
		g.textBaseline = 'middle';
		g.fillText( 'ACME', 230, 165 );
		const blob = await new Promise( resolve => canvas.toBlob( resolve, 'image/jpeg', 0.85 ) );
		const bytes = new Uint8Array( await blob.arrayBuffer() );
		let s = '';
		for ( const b of bytes ) s += String.fromCharCode( b );
		return btoa( s );

	} );

	test( 'the dashboard: a JPEG logo shown before and after, its background taken, saved as a PNG with alpha', async () => {

		await page.goto( `${ base }/drive/build/index.html` );
		await page.waitForSelector( 'body[data-loaded="yes"]' );
		await page.waitForSelector( '#logo-card #logo-file', { state: 'attached' } );
		const jpeg = Buffer.from( await jpegLogo(), 'base64' );
		await page.setInputFiles( '#logo-file', { name: 'acme.jpg', mimeType: 'image/jpeg', buffer: jpeg } );
		await page.waitForSelector( '#logo-edit' );
		assert.equal( await page.isChecked( '#logo-remove-bg' ), true, 'on by default' );
		assert.equal( await page.isChecked( '#logo-enclosed' ), false, 'off by default' );
		assert.equal( await page.inputValue( '#logo-tolerance' ), String( TOLERANCE ) );
		assert.equal( await page.getAttribute( '#logo-edit', 'data-state' ), 'removed' );
		assert.match( await page.textContent( '#logo-edit-note' ), /Took out the #f[a-f0-9]{5} background/ );
		// The after: trimmed to the badge (520 × 180 of 640 × 320, at 512 px wide: about 416 × 144).
		const size = await page.evaluate( () => [ document.querySelector( '#logo-after' ).width, document.querySelector( '#logo-after' ).height ] );
		assert.ok( size[ 0 ] > 410 && size[ 0 ] < 440 && size[ 1 ] > 140 && size[ 1 ] < 165, `after is ${ size }` );

		// Off: the picture as it is; on again, with the tolerance moved.
		await page.uncheck( '#logo-remove-bg' );
		assert.equal( await page.getAttribute( '#logo-edit', 'data-state' ), 'off' );
		assert.equal( await page.isDisabled( '#logo-tolerance' ), true );
		await page.check( '#logo-remove-bg' );
		await page.fill( '#logo-tolerance', '60' );
		await page.waitForFunction( () => document.querySelector( '#logo-tolerance-value' ).textContent === '60' );
		await page.fill( '#logo-tolerance', String( TOLERANCE ) );
		await page.waitForFunction( t => document.querySelector( '#logo-tolerance-value' ).textContent === String( t ), TOLERANCE );
		// On dark paint, to see its edge.
		await page.click( '.backdrop[data-backdrop="dark"]' );
		if ( SHOTS ) {

			mkdirSync( SHOTS, { recursive: true } );
			await page.locator( '#logo-card' ).screenshot( { path: join( SHOTS, 'logo-preview.png' ) } );

		}

		await page.click( '#logo-save' );
		await page.waitForFunction( () => ! document.querySelector( '#logo-edit' ) && document.querySelector( '#logo-card .logo-preview' ) );
		assert.match( saved, /^data:image\/png;base64,/ );
		const png = pngAlpha( storedLogo );
		assert.equal( png.type, 6, 'RGBA' );
		assert.ok( png.width > 410 && png.width < 440, `${ png.width } wide` );
		assert.equal( png.alpha[ 0 ], 0, 'its corner see-through' );
		const clear = png.alpha.filter( a => a === 0 ).length / png.alpha.length;
		assert.ok( clear > 0.04 && clear < 0.3, `${ ( clear * 100 ).toFixed( 1 ) } % see-through (the badge's rounded corners and padding)` );
		// The white letters inside kept: the middle row through "ACME" all shows.
		const middle = Math.floor( png.height / 2 );
		const row = png.alpha.slice( middle * png.width, ( middle + 1 ) * png.width );
		const shows = row.filter( a => a === 255 ).length;
		assert.ok( shows > png.width * 0.85, `${ shows } of ${ png.width } solid across the middle` );

	} );

	test( 'the saved logo: "Remove background" on one with a box behind it; one see-through already says so', async () => {

		// A logo saved before: a red mark on a light grey box, as a PNG with no alpha to speak of.
		storedLogo = Buffer.from( ( await page.evaluate( () => {

			const canvas = document.createElement( 'canvas' );
			canvas.width = 300;
			canvas.height = 150;
			const g = canvas.getContext( '2d' );
			g.fillStyle = '#e4e6e8';
			g.fillRect( 0, 0, 300, 150 );
			g.fillStyle = '#c62828';
			g.beginPath();
			g.arc( 150, 75, 50, 0, Math.PI * 2 );
			g.fill();
			return canvas.toDataURL( 'image/png' );

		} ) ).split( ',' )[ 1 ], 'base64' );
		await page.evaluate( () => window.buildHome.load() );
		await page.click( '#logo-clean' );
		await page.waitForSelector( '#logo-edit[data-state="removed"]' );
		assert.match( await page.textContent( '#logo-edit-note' ), /To undo, upload the original again/ );
		await page.click( '#logo-save' );
		await page.waitForFunction( () => ! document.querySelector( '#logo-edit' ) );
		const png = pngAlpha( storedLogo );
		assert.equal( png.type, 6 );
		assert.ok( png.width < 120 && png.height < 120, `trimmed to the circle: ${ png.width } × ${ png.height }` );
		assert.equal( png.alpha[ 0 ], 0 );
		assert.equal( png.alpha[ Math.floor( png.height / 2 ) * png.width + Math.floor( png.width / 2 ) ], 255 );

		// Again: it's see-through now, nothing to take.
		await page.click( '#logo-clean' );
		await page.waitForSelector( '#logo-edit[data-state="transparent"]' );
		assert.match( await page.textContent( '#logo-edit-note' ), /see-through already/ );
		await page.click( '#logo-cancel' );
		assert.equal( await page.isVisible( '#logo-card .logo-actions' ), true );

	} );

	test( 'on the equipment: the saved PNG on an excavator, see-through round the logo, no plate', async () => {

		// The ACME badge, saved by the first test's editor (with its background out), again.
		await page.evaluate( () => window.buildHome.load() );
		const jpeg = Buffer.from( await jpegLogo(), 'base64' );
		await page.setInputFiles( '#logo-file', { name: 'acme.jpg', mimeType: 'image/jpeg', buffer: jpeg } );
		await page.waitForSelector( '#logo-edit[data-state="removed"]' );
		await page.click( '#logo-save' );
		await page.waitForFunction( () => ! document.querySelector( '#logo-edit' ) );
		const logo = storedLogo;

		const app = await context.newPage();
		app.on( 'pageerror', e => errors.push( String( e ) ) );
		await app.setViewportSize( { width: 960, height: 600 } );
		await app.route( '**/*', route => {

			const url = route.request().url();
			return url.startsWith( base ) || url.startsWith( 'data:' ) || url.startsWith( 'blob:' ) ? route.continue() : route.abort();

		} );
		await app.route( '**/test-api/logo', route => route.fulfill( { status: 200, contentType: 'image/png', body: logo } ) );
		await app.goto( `${ base }/?prompt` );
		await app.click( '#skip' );
		await app.waitForFunction( () => window.twin?.sidebar && window.twin.layers );
		await dropProjectModels( app );
		const state = await app.evaluate( async () => {

			const { models } = window.twin;
			for ( const entry of [ ...models.entries ] ) models.remove( entry );
			const { itemConfig, loadLibrary } = await import( '/src/library.js' );
			const library = await loadLibrary();
			await models.load( itemConfig( library.find( i => i.id === 'excavator-20t' ), { east: 0, north: 0, heading: 0, up: null } ) );
			const { setUpLogo } = await import( '/src/logo.js' );
			let layer = null;
			setUpLogo( { models, apiBase: '/test-api/', layers: { addLayer: ( id, spec ) => layer = spec, update() {} } } );
			const end = performance.now() + 30000;
			while ( ! layer && performance.now() < end ) await new Promise( resolve => setTimeout( resolve, 100 ) );
			const entry = models.entries.find( e => e.library === 'excavator-20t' );
			const logos = [];
			entry.pivot.traverse( o => o.name === 'Company logo' && logos.push( o ) );
			const material = logos[ 0 ]?.material;
			const texture = material?.map;
			const data = texture?.image.data;
			let clear = 0, black = 0;
			for ( let i = 0; data && i < data.length; i += 4 ) if ( data[ i + 3 ] === 0 ) {

				clear ++;
				if ( data[ i ] === 0 && data[ i + 1 ] === 0 && data[ i + 2 ] === 0 ) black ++;

			}

			return {
				count: logos.length,
				transparent: material?.transparent, alphaTest: material?.alphaTest, depthWrite: material?.depthWrite,
				polygonOffset: material?.polygonOffset, premultiplied: texture?.premultiplyAlpha,
				clear, black, texels: data ? data.length / 4 : 0,
				aspect: texture ? texture.image.width / texture.image.height : 0,
			};

		} );
		assert.ok( state.count >= 1, 'the excavator wears it' );
		assert.equal( state.transparent, true );
		assert.ok( state.alphaTest > 0 && state.alphaTest < 0.1 );
		assert.equal( state.depthWrite, false );
		assert.equal( state.polygonOffset, true );
		assert.equal( state.premultiplied, false );
		assert.ok( state.clear > state.texels * 0.04, `${ state.clear } of ${ state.texels } texels see-through` );
		assert.ok( state.black < state.clear * 0.01, `${ state.black } of its see-through texels black: they carry the logo's colour` );
		assert.ok( state.aspect > 2.6 && state.aspect < 3.1, `the badge's shape: ${ state.aspect.toFixed( 2 ) }` );

		// The logo as it shows: looking at the excavator's side, the decal's own pixels.
		const shown = await app.evaluate( async () => {

			const { Box3, Vector3 } = await import( '/node_modules/three/build/three.module.js' );
			const { models, controls, camera, renderer, scene } = window.twin;
			const entry = models.entries.find( e => e.library === 'excavator-20t' );
			const logos = [];
			entry.pivot.traverse( o => o.name === 'Company logo' && logos.push( o ) );
			// The side that faces the camera most squarely: the first.
			const logo = logos[ 0 ];
			const box = new Box3().setFromObject( logo );
			const centre = box.getCenter( new Vector3() );
			const whole = new Box3().setFromObject( entry.pivot );
			const middle = whole.getCenter( new Vector3() );
			// Its sides face the pivot's ±x (logo.js): out of the one this logo's on.
			const across = new Vector3( 1, 0, 0 ).transformDirection( entry.pivot.matrixWorld ).setY( 0 ).normalize();
			const out = across.multiplyScalar( Math.sign( centre.clone().sub( middle ).dot( across ) ) || 1 );
			const position = centre.clone().addScaledVector( out, 5.5 ).add( new Vector3( 0, 0.8, 0 ) ).addScaledVector( new Vector3( - out.z, 0, out.x ), - 1.2 );
			const look = centre.clone().sub( position ).normalize();
			if ( controls.mode === 'walk' ) controls.setMode( 'fly' );
			controls.setPose( position, ( Math.atan2( - look.x, look.z ) * 180 / Math.PI + 360 ) % 360, Math.asin( look.y ) * 180 / Math.PI );
			for ( let i = 0; i < 30; i ++ ) await new Promise( requestAnimationFrame );
			renderer.render( scene, camera );
			return { centre: centre.toArray() };

		} );
		assert.equal( shown.centre.length, 3 );
		if ( SHOTS ) await app.screenshot( { path: join( SHOTS, 'logo-equipment.png' ) } );
		await app.close();

	} );

	test( 'no page errors', () => {

		assert.deepEqual( errors, [] );

	} );

} );
