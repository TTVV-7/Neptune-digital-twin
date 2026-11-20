// npm run test:drive-orrery-ui: World Drive's orrery (src/drive-app/orrery.js, orrery-bodies.js,
// orrery.css; main.js's openOrrery; panel.js's Worlds button; docs/world-drive.md, "The orrery") in a
// real browser, on the Vite dev server with no Maps key: open first on a plain load (orrery-first.js:
// a free visit, the orrery's, nothing of any world fetched behind it, its intro; Esc to the Moon with
// a toast; Mars picked with no reload; the Earth, or an Earth spot, picked by reloading at ?worlds=0 or
// the spot's link, which asks for the Earth's visit; not for ?worlds=0, place, challenge, party or
// supporter links; the used-up hint; the last world picked opening with its sheet; a Mars link's Earth;
// the Earth's drivers still pointed to), which a test's browser opts in to (else it's the plain Earth
// load, as before, so the other suites go on as they were); open from the panel's Worlds button, from M on the globe, from ?worlds=1 (then out of the address) and from the
// dev server's seam; its eleven bodies and their names; each world you can drive on picked and
// driven to (the globe turns there), "Back to" the game's world cancelling a switch still loading
// ("Loading Mars…" on the button meanwhile), and the used-up Earth's sheet; the rest of the Solar
// System picked but never driven; the radiogroup's arrow keys, Home, End and Enter, Esc and M (also
// with the focus left on the scene), the focus back where it came from, and a drop-in closing it;
// how many are driving on each world (a stand-in /api/online), in the radios' names, the total, the
// sheet and the panel's button, and the "On other worlds" row opening it; a phone held upright
// (360 × 640) and on its side (740 × 360): no sideways scroll, the five in one row, every tap
// target 44 px or more, Drive in view; reduced motion (no drawing while nothing changes); nothing of
// it or of the other worlds fetched before it opens, and one WebGL context; and Google's ad, never
// asked for under it and never taken away by it. Every request that isn't to the local server is
// blocked.
//
// Needs Playwright with Chromium, as test-drive-ui.mjs does. TEST_VITE_PORT picks the port;
// TEST_SCREENSHOTS=<folder> saves pictures.

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { MARS_SPOTS } from '../src/drive-app/mars-places.js';
import { VESTA_SPOTS } from '../src/drive-app/vesta-places.js';
import { CERES_SPOTS } from '../src/drive-app/ceres-places.js';
import { MOON_SPOTS } from '../src/drive-app/moon-places.js';
import { SPOTS } from '../src/drive-app/places.js';
import { startVite } from './worker-harness.mjs';
import { OPENER, openWorlds, pickWorld, radio, worldShown, worldsOpen } from './worlds-ui.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5601;
const SHOTS = process.env.TEST_SCREENSHOTS;
const BASE = `http://127.0.0.1:${ PORT }`;
const WORLD_ORDER = [ 'earth', 'moon', 'mars', 'vesta', 'ceres' ];
const OTHERS = [ 'mercury', 'venus', 'jupiter', 'saturn', 'uranus', 'neptune' ];
const TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';
const TURNSTILE_STUB = `window.turnstile = { render( el, options ) { setTimeout( () => options.callback( '${ TOKEN }' ), 50 ); return 'w1'; }, remove() {}, reset() {} };`;
// Made up, in AdSense's formats, with a stand-in for Google's script (as test-drive-ui.mjs has them).
const ADSENSE = { client: 'ca-pub-1234567890123456', slot: '1234567890' };
const ADS_SCRIPT = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1234567890123456';
const ADS_STUB = `( () => {
	const fill = () => document.querySelectorAll( 'ins.adsbygoogle:not( [data-adsbygoogle-status] )' ).forEach( ins => {
		ins.setAttribute( 'data-adsbygoogle-status', 'done' );
		ins.append( Object.assign( document.createElement( 'div' ), { className: 'stub-ad', textContent: 'A stand-in ad', style: 'width:100%;height:100%;background:#2d7a46' } ) );
		ins.setAttribute( 'data-ad-status', 'filled' );
	} );
	const queued = window.adsbygoogle || [];
	window.adsbygoogle = { loaded: true, push() { fill(); } };
	if ( queued.length ) fill();
} )();`;
// How many are driving on each world, as the stand-in /api/online says (the Earth's areas none).
const WORLD_COUNTS = { earth: { on: true, total: 0 }, moon: { on: true, total: 2 }, mars: { on: true, total: 3 }, vesta: { on: false, total: 0 }, ceres: { on: true, total: 0 } };

let chromium;
let browser;
let vite;

before( async () => {

	try {

		( { chromium } = require( 'playwright' ) );

	} catch {

		throw new Error( 'Playwright is needed: npm i -D playwright && npx playwright install chromium' );

	}

	if ( SHOTS ) mkdirSync( SHOTS, { recursive: true } );
	vite = await startVite( PORT, {}, 'vite.drive.config.js' );
	browser = await chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader' ] } );

} );

after( async () => {

	await browser?.close();
	vite?.stop();

} );

// A page with everything off this machine blocked, the go-kart picked and boost pads off.
// page.asked: every path asked of this server (and its query) in order; page.worlds: the other
// worlds' files and the orrery's, and the orrery's own code.
async function newPage( { viewport = { width: 1000, height: 620 }, touch = false, reducedMotion = 'no-preference', init = null } = {} ) {

	const context = await browser.newContext( { viewport, hasTouch: touch, isMobile: touch, reducedMotion } );
	await context.addInitScript( init => {

		if ( ! localStorage.getItem( 'world-drive.vehicle' ) ) localStorage.setItem( 'world-drive.vehicle', 'go-kart' );
		localStorage.setItem( 'world-drive.pads', 'off' );
		if ( init ) Object.assign( window, init );

	}, init );
	const page = await context.newPage();
	page.outside = [];
	page.errors = [];
	page.worlds = [];
	page.on( 'pageerror', err => page.errors.push( err.message ) );
	page.on( 'request', request => {

		const { pathname } = new URL( request.url() );
		if ( /^\/(moon|mars|vesta|ceres|orrery)\//.test( pathname ) || /\/orrery(-bodies)?\.(js|css)$/.test( pathname ) ) page.worlds.push( pathname );

	} );
	await page.route( /^https?:\/\/(?!127\.0\.0\.1)/, route => {

		const url = route.request().url();
		if ( url.startsWith( 'https://challenges.cloudflare.com/turnstile/' ) && page.turnstile ) return route.fulfill( { contentType: 'text/javascript', body: TURNSTILE_STUB } );
		if ( url === ADS_SCRIPT && page.ads ) return route.fulfill( { contentType: 'text/javascript', body: ADS_STUB } );
		page.outside.push( url );
		route.abort();

	} );
	return page;

}

const json = ( route, body, status = 200 ) => route.fulfill( { status, contentType: 'application/json', body: JSON.stringify( body ) } );

// The Worker's side answered here: /api/config with maps off (the test pad), driving with others
// on everywhere but Vesta, Google's ad when `adsense`; /api/me signed out; /api/online saying who's
// driving where (WORLD_COUNTS); and the rooms' sockets taken in and never answered. The page is
// handed a visit's token for driving with others (main.js's dev seam), asking who's driving often.
async function workerPage( { adsense = null, stats = false, ...options } = {} ) {

	const init = { worldDriveLiveTest: { visit: 'v1.orrery-live-test', online: { poll: 1500 } }, ...( stats ? { worldDriveStatsTest: { visit: 'v1.orrery-stats-test' } } : {} ), ...( options.init ?? {} ) };
	const page = await newPage( { ...options, init } );
	page.ads = !! adsense;
	page.online = [];
	page.adAsked = [];
	page.on( 'request', request => request.url().includes( 'googlesyndication' ) && page.adAsked.push( request.url() ) );
	const liveWorlds = Object.fromEntries( WORLD_ORDER.map( id => [ id, id === 'vesta' ? { open: false, reason: 'off' } : { open: true } ] ) );
	await page.route( `${ BASE }/api/config`, route => json( route, { turnstileSiteKey: '1x00000000000000000000AA', mapsOn: false, live: true, liveMoon: true, liveWorlds, ...( adsense ? { adsense } : {} ) } ) );
	await page.route( `${ BASE }/api/me`, route => json( route, { signedIn: false, supporter: false } ) );
	await page.route( `${ BASE }/api/stats`, route => route.fulfill( { status: 204 } ) );
	await page.route( `${ BASE }/api/online*`, route => {

		const world = new URL( route.request().url() ).searchParams.get( 'world' ) ?? 'earth';
		page.online.push( world );
		json( route, { on: WORLD_COUNTS[ world ]?.on !== false, total: WORLD_COUNTS[ world ]?.total ?? 0, areas: [], worlds: WORLD_COUNTS } );

	} );
	await page.routeWebSocket( /\/api\/live/, () => {} );
	return page;

}

async function openGlobe( page, path = '/' ) {

	await page.goto( BASE + path );
	await page.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 30000 } );

}

// On to the test pad's globe past the Worker's "maps are resting" notice.
async function testPad( page, path = '/' ) {

	await page.goto( BASE + path );
	await page.locator( '#notice button', { hasText: 'Drive the test pad' } ).click();
	await page.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 30000 } );

}

const flown = page => page.waitForFunction( () => ! window.drive.globe.flight, null, { timeout: 60000 } );
const shot = ( page, name ) => SHOTS ? page.screenshot( { path: join( SHOTS, `${ name }.png` ), timeout: 120000 } ) : null;
const names = page => page.locator( '#globe-ui .spots button b' ).allTextContents();
const closed = page => page.waitForFunction( () => ! document.querySelector( '#orrery' ).open && ! window.drive.orrery.isOpen );
const sheetShown = page => page.locator( '#orrery .orrery-sheet' ).isVisible();
// (Drive's words, then its arrow, which is hidden from screen readers.)
const driveText = page => page.locator( '#orrery .orrery-drive' ).evaluate( b => [ ...b.children ].map( span => span.textContent ).join( '' ) + ( b.lastElementChild?.getAttribute( 'aria-hidden' ) === 'true' ? '' : ' (arrow read out)' ) );
// Who has the focus: its world, its body, or its class.
const focused = page => page.evaluate( () => {

	const el = document.activeElement;
	return el?.dataset?.world ?? el?.dataset?.body ?? ( el === document.body ? 'body' : el?.id || el?.className || el?.tagName );

} );
// A tap target's size, and whether it's at least 44 px both ways.
const big = box => box && box.width >= 44 && box.height >= 44;

describe( 'World Drive\'s orrery: where it opens from', () => {

	test( 'a test\'s browser on the dev server: never on a plain load (orrery-first.js\'s seam; a plain load\'s own orrery is tested below), and nothing of it (nor of the other worlds) fetched until it opens; then from the Worlds button, with the focus back on it as it closes; one WebGL context', async () => {

		const page = await newPage();
		try {

			await openGlobe( page );
			await page.waitForTimeout( 2000 );
			assert.equal( await worldsOpen( page ), false );
			assert.equal( await page.evaluate( () => window.drive.orrery.isOpen ), false );
			assert.deepEqual( page.worlds, [], 'the orrery or another world\'s files fetched on a plain load' );
			assert.equal( await page.evaluate( () => document.body.dataset.orrery ?? null ), null );
			// The Worlds button: the Earth's, and what it opens.
			const opener = page.locator( OPENER );
			assert.deepEqual( await opener.evaluate( b => ( { world: b.dataset.world, label: b.getAttribute( 'aria-label' ), popup: b.getAttribute( 'aria-haspopup' ), controls: b.getAttribute( 'aria-controls' ), name: b.querySelector( '.worlds-name' ).textContent, icons: [ ...b.querySelectorAll( '[data-icon]:not( [hidden] )' ) ].map( icon => icon.dataset.icon ) } ) ),
				{ world: 'earth', label: 'Change world. On the Earth now', popup: 'dialog', controls: 'orrery', name: 'Earth', icons: [ 'earth' ] } );
			const canvases = await page.locator( 'canvas' ).count();

			await openWorlds( page );
			assert.equal( await page.evaluate( () => document.body.dataset.orrery ), 'open' );
			assert.equal( await page.locator( '#orrery' ).getAttribute( 'aria-labelledby' ), 'orrery-title' );
			assert.equal( await page.locator( '#orrery-title' ).textContent(), 'Pick a world' );
			// The panel's out of sight behind it, and the globe takes no input.
			assert.equal( await page.locator( '#globe-ui' ).evaluate( el => getComputedStyle( el ).visibility ), 'hidden' );
			assert.equal( await page.evaluate( () => window.drive.globe.enabled ), false );
			// Its pictures under /orrery/ only: nothing of the other worlds' own files.
			await page.waitForTimeout( 1500 );
			assert.ok( page.worlds.some( path => path.startsWith( '/orrery/' ) ), JSON.stringify( page.worlds ) );
			assert.deepEqual( page.worlds.filter( path => /^\/(moon|mars|vesta|ceres)\//.test( path ) ), [] );
			// Drawn with the page's own renderer: no second canvas (so no second WebGL context).
			assert.equal( await page.locator( 'canvas' ).count(), canvases );
			// It opens on the whole Solar System, the game's world checked and focused, no sheet.
			assert.equal( await focused( page ), 'earth' );
			assert.equal( await page.locator( radio( 'earth' ) ).getAttribute( 'aria-checked' ), 'true' );
			assert.equal( await sheetShown( page ), false );
			await shot( page, 'orrery-1-open' );

			// Its close button: closed, the panel back, the focus on the Worlds button.
			await page.locator( '#orrery .orrery-close' ).click();
			await closed( page );
			assert.equal( await page.evaluate( () => document.body.dataset.orrery ?? null ), null );
			assert.equal( await page.locator( '#globe-ui' ).evaluate( el => getComputedStyle( el ).visibility ), 'visible' );
			assert.equal( await page.evaluate( () => window.drive.globe.enabled ), true );
			assert.equal( await page.evaluate( () => document.activeElement?.classList.contains( 'worlds-open' ) ), true );
			assert.equal( await page.evaluate( () => window.drive.world ), 'earth' );
			assert.deepEqual( page.errors, [] );
			assert.deepEqual( page.outside, [] );

		} finally {

			await page.context().close();

		}

	} );

	test( 'M on the globe opens it and M closes it again (not opened again); Esc closes it, also with the focus left on the scene, the pin kept', async () => {

		const page = await newPage();
		try {

			await openGlobe( page );
			await page.locator( '#globe-ui .spots button', { hasText: 'Golden Gate Bridge' } ).click();
			await page.locator( '.pin-card' ).waitFor();
			await flown( page );
			await page.evaluate( () => document.activeElement?.blur() );

			await page.keyboard.press( 'KeyM' );
			await page.locator( '#orrery[open] .orrery-worlds [role=radio]' ).first().waitFor( { timeout: 60000 } );
			await page.keyboard.press( 'KeyM' );
			await closed( page );
			await page.waitForTimeout( 800 );
			assert.equal( await worldsOpen( page ), false, 'M opened it again' );
			assert.equal( await page.evaluate( () => window.drive.mode ), 'globe' );

			// The scene clicked (on nothing: the focus stays in the dialog, never the game's), then Esc.
			for ( const key of [ 'Escape', 'KeyM' ] ) {

				await page.evaluate( () => document.activeElement?.blur() );
				await page.keyboard.press( 'KeyM' );
				await page.locator( '#orrery[open] .orrery-worlds [role=radio]' ).first().waitFor( { timeout: 60000 } );
				await page.mouse.click( 500, 600 );
				await page.waitForTimeout( 200 );
				await page.keyboard.press( key );
				await closed( page );
				await page.waitForTimeout( 500 );
				assert.equal( await worldsOpen( page ), false, `${ key } on the scene opened it again` );
				assert.equal( await page.evaluate( () => window.drive.panel.pinned?.name ?? null ), 'Golden Gate Bridge', `${ key } took the pin away` );
				assert.equal( await page.evaluate( () => window.drive.mode ), 'globe' );

			}

			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

	test( '?worlds=1 opens it as the page loads, then it\'s out of the address; so does the dev server\'s seam; a drop-in closes it', async () => {

		const page = await newPage();
		try {

			await page.goto( `${ BASE }/?worlds=1&ref=news` );
			await page.locator( '#orrery[open] .orrery-worlds [role=radio]' ).first().waitFor( { timeout: 60000 } );
			const url = new URL( page.url() );
			assert.equal( url.searchParams.get( 'worlds' ), null );
			assert.equal( url.searchParams.get( 'ref' ), 'news' );
			assert.equal( await page.evaluate( () => window.drive.mode ), 'globe' );
			// Something leaving the globe (a drop-in) closes it first.
			await page.evaluate( () => window.drive.dropIn( { name: 'Test pad', lat: 46.5725, lon: 8.4153 } ) );
			await closed( page );
			await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 60000 } );
			// M while driving goes back to the globe, as ever, and doesn't open it.
			await page.keyboard.press( 'KeyM' );
			await page.waitForFunction( () => window.drive.mode === 'globe' );
			await page.waitForTimeout( 500 );
			assert.equal( await worldsOpen( page ), false );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

		const seam = await newPage( { init: { worldDriveOrreryTest: { onLoad: true } } } );
		try {

			await seam.goto( BASE );
			await seam.locator( '#orrery[open] .orrery-worlds [role=radio]' ).first().waitFor( { timeout: 60000 } );
			assert.deepEqual( seam.errors, [] );

		} finally {

			await seam.context().close();

		}

	} );

} );

// --- a plain load: the orrery first (orrery-first.js, boot.js, main.js) ---

// A page that opts in to a plain load's orrery (the dev server gives a test's browser the plain Earth
// load unless its seam says { first: true }), with the Worker's side answered here: /api/config with
// maps on, Turnstile's stand-in, and /api/visit answering a free world's visit and the globe's as
// free, and the Earth's drive with `earth` (route => ...; used up unless it says, so no Google key is
// needed). page.visits: each visit's body, in order. `noConfig`: no Worker at all (the dev server
// alone), so no visit either.
async function firstPage( { noConfig = false, live = false, init = {}, earth = null, ...options } = {} ) {

	const page = await newPage( { ...options, init: { worldDriveOrreryTest: { first: true }, ...( live ? { worldDriveLiveTest: { visit: 'v1.first-live', online: { poll: 1000 } } } : {} ), ...init } } );
	page.visits = [];
	page.docs = [];
	page.on( 'request', request => {

		const url = new URL( request.url() );
		if ( url.pathname === '/api/visit' ) page.visits.push( JSON.parse( request.postData() ?? '{}' ) );
		// The page's own loads, as asked for (the game takes its link out of the address as it starts).
		if ( request.resourceType() === 'document' && url.origin === BASE ) page.docs.push( url.pathname + url.search );

	} );
	if ( noConfig ) return page;
	page.turnstile = true;
	await page.route( `${ BASE }/api/config`, route => json( route, { turnstileSiteKey: '1x00000000000000000000AA', mapsOn: true, live } ) );
	await page.route( `${ BASE }/api/me`, route => json( route, { signedIn: false, supporter: false } ) );
	await page.route( `${ BASE }/api/stats`, route => route.fulfill( { status: 204 } ) );
	await page.route( `${ BASE }/api/challenges/link*`, route => json( route, { error: 'No such challenge' }, 404 ) );
	await page.route( `${ BASE }/api/visit`, route => {

		const body = JSON.parse( route.request().postData() ?? '{}' );
		if ( body.world && body.world !== 'earth' ) return json( route, { moon: true, free: true, world: body.world, visit: 'v1.free-visit' } );
		if ( body.globe === true ) return json( route, { free: true, globe: true, world: 'earth', visit: 'v1.globe-visit' } );
		if ( earth ) return earth( route );
		json( route, { error: 'You\'ve had today\'s free drives', reason: 'visitor', retryAfter: 3600, visit: 'v1.moon-visit' }, 429 );

	} );
	if ( live ) await page.routeWebSocket( /\/api\/live/, () => {} );
	return page;

}

// A page load asked for at an address `match`es (a regular expression on its path and query).
async function loadedAt( page, match ) {

	const since = Date.now();
	while ( ! page.docs.some( doc => match.test( doc ) ) ) {

		if ( Date.now() - since > 60000 ) throw new Error( `No load at ${ match }: ${ JSON.stringify( page.docs ) }` );
		await new Promise( resolve => setTimeout( resolve, 100 ) );

	}

	await page.waitForLoadState( 'load' );
	await page.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 90000 } );

}

// The Earth picked on the orrery's sheet: Drive (the page turns to the Earth's globe in place).
async function driveEarth( page ) {

	await page.locator( radio( 'earth' ) ).click();
	await page.locator( '#orrery .orrery-drive' ).click();

}

const orreryUp = page => page.locator( '#orrery[open] .orrery-worlds [role=radio]' ).first().waitFor( { timeout: 90000 } );
// The worlds' own files (heights, colours) fetched: none while a plain load's orrery is up.
const worldFiles = page => page.worlds.filter( path => /^\/(moon|mars|vesta|ceres)\//.test( path ) );
// A load past its splash onto the globe, with the orrery left shut a moment (it would be up by then).
async function notFirst( page, path ) {

	await page.goto( BASE + path );
	await page.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 90000 } );
	await page.waitForTimeout( 1500 );
	assert.equal( await worldsOpen( page ), false, `the orrery opened on ${ path }` );

}

describe( 'World Drive\'s orrery: first, on a plain load', () => {

	test( 'a plain load opens it, asking for a free visit (the orrery\'s), not the Earth\'s; nothing of any world fetched behind it; its intro', async () => {

		const page = await firstPage();
		try {

			await page.goto( BASE );
			await orreryUp( page );
			assert.deepEqual( page.visits, [ { token: TOKEN, world: 'moon', start: 'orrery' } ] );
			assert.equal( await page.locator( '#orrery-title' ).textContent(), 'Pick a world' );
			assert.equal( await page.locator( '#orrery .orrery-intro' ).isVisible(), true );
			assert.match( await page.locator( '#orrery .orrery-intro' ).textContent(), /built from real spacecraft maps/ );
			assert.equal( await page.locator( '#orrery' ).getAttribute( 'aria-describedby' ), 'orrery-intro' );
			// The first time: the whole Solar System, nothing chosen.
			assert.equal( await sheetShown( page ), false );
			await page.waitForTimeout( 2000 );
			assert.deepEqual( worldFiles( page ), [], 'a world\'s files fetched behind the orrery' );
			assert.equal( await page.evaluate( () => document.body.dataset.orrery ), 'open' );
			await shot( page, 'orrery-first-1-plain-load' );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

		// The dev server alone (no Worker): the same, with no visit at all.
		const alone = await firstPage( { noConfig: true } );
		try {

			await alone.goto( BASE );
			await orreryUp( alone );
			await alone.waitForTimeout( 1000 );
			assert.deepEqual( alone.visits, [] );
			assert.deepEqual( worldFiles( alone ), [] );
			assert.deepEqual( alone.errors, [] );

		} finally {

			await alone.context().close();

		}

	} );

	test( 'Esc without picking: on the Moon, a toast saying how to pick another, the globe back', async () => {

		const page = await firstPage();
		try {

			await page.goto( BASE );
			await orreryUp( page );
			await page.keyboard.press( 'Escape' );
			await closed( page );
			await page.waitForFunction( () => window.drive.world === 'moon', null, { timeout: 90000 } );
			assert.match( await page.locator( '#toast' ).textContent(), /You're on the Moon\. Worlds \(M\) to pick another\./ );
			assert.equal( await page.evaluate( () => document.body.dataset.orrery ?? null ), null );
			assert.equal( await page.evaluate( () => window.drive.globe.enabled ), true );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

	test( 'Mars picked: on Mars with no reload; the Earth\'s sheet says no reload, and the Discoveries line comes from sheetExtra', async () => {

		const page = await firstPage();
		try {

			await page.goto( BASE );
			await orreryUp( page );
			await page.evaluate( () => window.__marker = 'same page' );
			await page.locator( radio( 'earth' ) ).click();
			assert.doesNotMatch( await page.locator( '#orrery .orrery-note' ).textContent(), /reload/ );
			assert.equal( await page.locator( '#orrery .orrery-note' ).evaluate( el => el.classList.contains( 'closed' ) ), false );
			assert.equal( await page.locator( '#orrery .orrery-hint-used' ).isVisible(), false );
			await pickWorld( page, 'mars' );
			await page.waitForFunction( () => window.drive.world === 'mars', null, { timeout: 90000 } );
			assert.equal( await page.evaluate( () => window.__marker ), 'same page' );
			assert.deepEqual( page.visits.length, 1 );
			assert.equal( await page.evaluate( () => localStorage.getItem( 'world-drive.last-world' ) ), 'mars' );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

	test( 'the Earth picked: the page turns to our own globe of the Earth in place, no reload and no visit asked; Drive here asks for the Earth\'s drive, once; an Earth spot picked is flown to and pinned on the same page', async () => {

		const page = await firstPage( { earth: route => json( route, { mapsKey: 'test-key-not-real', left: 0, visit: 'v1.earth-visit' } ) } );
		try {

			await page.goto( BASE );
			await orreryUp( page );
			await page.evaluate( () => window.__marker = 'same page' );
			await driveEarth( page );
			await closed( page );
			await page.waitForFunction( () => window.drive.world === 'earth' && window.drive.scene.getObjectByName( 'test-globe' ).visible, null, { timeout: 60000 } );
			assert.equal( await page.evaluate( () => window.__marker ), 'same page' );
			assert.deepEqual( page.docs, [ '/' ] );
			assert.deepEqual( page.visits, [ { token: TOKEN, world: 'moon', start: 'orrery' } ] );
			assert.equal( await page.evaluate( () => window.drive.tiles ), null );
			// Our own Earth, NASA's picture on it, fetched now it's shown.
			await page.waitForFunction( () => window.drive.scene.getObjectByName( 'test-earth' ).userData.picture === '/earth/colour.webp', null, { timeout: 30000 } );
			assert.ok( ! page.outside.some( url => /tile\.googleapis|maps\.googleapis/.test( url ) ), page.outside.join( ' ' ) );
			await shot( page, 'orrery-first-3-earth-globe' );
			// Drive here: the Earth's drive, from the globe, and Google's tiles (blocked here).
			await page.locator( '.spots button' ).first().click();
			await page.locator( '.pin-card .go' ).click();
			await page.waitForFunction( () => window.drive.tiles, null, { timeout: 30000 } );
			assert.deepEqual( page.visits, [ { token: TOKEN, world: 'moon', start: 'orrery' }, { token: TOKEN, fromGlobe: true } ] );
			assert.equal( await page.evaluate( () => window.drive.earthAsked ), 1 );
			assert.deepEqual( page.docs, [ '/' ] );

		} finally {

			await page.context().close();

		}

		const spot = await firstPage();
		try {

			await spot.goto( BASE );
			await orreryUp( spot );
			await spot.locator( radio( 'earth' ) ).click();
			await spot.locator( `#orrery .orrery-spots button[data-spot="${ SPOTS[ 0 ].id }"]` ).click();
			await closed( spot );
			await spot.waitForFunction( id => window.drive.world === 'earth' && window.drive.panel.pinned?.id === id, SPOTS[ 0 ].id, { timeout: 60000 } );
			assert.deepEqual( spot.docs, [ '/' ] );
			assert.deepEqual( spot.visits, [ { token: TOKEN, world: 'moon', start: 'orrery' } ] );
			assert.deepEqual( spot.errors, [] );

		} finally {

			await spot.context().close();

		}

	} );

	test( 'over a cap at Drive here on the Earth picked from the orrery: the used-up notice, with "Get more Earth drives" (signing in set up), still on the Earth\'s globe', async () => {

		const page = await firstPage();
		await page.route( `${ BASE }/api/config`, route => json( route, { turnstileSiteKey: '1x00000000000000000000AA', mapsOn: true, googleClientId: 'test-client.apps.googleusercontent.com' } ) );
		try {

			await page.goto( BASE );
			await orreryUp( page );
			await driveEarth( page );
			await closed( page );
			await page.waitForFunction( () => window.drive.world === 'earth', null, { timeout: 60000 } );
			await page.locator( '.spots button' ).first().click();
			await page.locator( '.pin-card .go' ).click();
			await page.locator( '#notice[data-kind="used-up"]' ).waitFor( { timeout: 30000 } );
			assert.equal( await page.locator( '#notice .title' ).textContent(), 'You\'ve had today\'s free Earth drive' );
			await page.locator( '#notice button', { hasText: 'Get more Earth drives' } ).waitFor();
			await shot( page, 'orrery-first-4-used-up-drive-here' );
			assert.deepEqual( page.visits, [ { token: TOKEN, world: 'moon', start: 'orrery' }, { token: TOKEN, fromGlobe: true } ] );
			assert.equal( await page.evaluate( () => [ window.drive.world, window.drive.mode, !! window.drive.tiles ] ).then( JSON.stringify ), JSON.stringify( [ 'earth', 'globe', false ] ) );
			await page.locator( '#notice button', { hasText: 'Get more Earth drives' } ).click();
			await page.locator( '#pass' ).waitFor();
			assert.deepEqual( page.docs, [ '/' ] );

		} finally {

			await page.context().close();

		}

	} );

	test( 'not for ?worlds=0, a place\'s link, a challenge\'s, a party\'s, or the way back from paying', async () => {

		// (The Earth's are the globe's free visit: its drive is asked for at Drive here.)
		for ( const [ path, visit ] of [
			[ '/?worlds=0', { token: TOKEN, globe: true } ],
			[ '/?spot=moon-tycho', { token: TOKEN, world: 'moon' } ],
			[ '/?challenge=1', { token: TOKEN, globe: true } ],
			[ '/?party=ABCDEF', { token: TOKEN, globe: true } ],
			[ '/?supporter=thanks', { token: TOKEN, globe: true } ],
		] ) {

			const page = await firstPage();
			try {

				await notFirst( page, path );
				assert.deepEqual( page.visits[ 0 ], visit, path );
				assert.deepEqual( page.errors, [], path );

			} finally {

				await page.context().close();

			}

		}

	} );

	test( 'the world last picked: the next plain load opens with its sheet up and Drive in focus', async () => {

		const page = await firstPage();
		try {

			await page.goto( BASE );
			await orreryUp( page );
			await pickWorld( page, 'vesta' );
			await page.reload();
			await orreryUp( page );
			await page.locator( '#orrery .orrery-sheet' ).waitFor();
			assert.equal( await page.locator( '#orrery-sheet-name' ).textContent().then( text => /Vesta/.test( text ) ), true );
			assert.equal( await focused( page ), 'orrery-drive' );
			assert.equal( await driveText( page ), 'Drive on Vesta→' );
			await shot( page, 'orrery-first-2-last-world' );
			await page.keyboard.press( 'Enter' );
			await closed( page );
			await page.waitForFunction( () => window.drive.world === 'vesta', null, { timeout: 120000 } );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

	test( 'a Mars place\'s link: its Earth is our own globe, on the same page (no orrery, no visit asked)', async () => {

		const page = await firstPage();
		try {

			await page.goto( `${ BASE }/?spot=mars-curiosity` );
			await page.waitForFunction( () => window.drive?.mode === 'globe' && window.drive.world === 'mars', null, { timeout: 120000 } );
			assert.equal( await worldsOpen( page ), false );
			await openWorlds( page );
			await driveEarth( page );
			await closed( page );
			await page.waitForFunction( () => window.drive.world === 'earth', null, { timeout: 60000 } );
			assert.equal( page.docs.length, 1 );
			assert.deepEqual( page.visits, [ { token: TOKEN, world: 'mars' } ] );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

	test( 'who\'s driving still points to the Earth\'s drivers on a plain load (the Earth is open, not shut)', async () => {

		const page = await firstPage( { live: true } );
		await page.route( `${ BASE }/api/online*`, route => json( route, { on: true, total: 0, areas: [], worlds: { earth: { on: true, total: 4 }, moon: { on: true, total: 0 }, mars: { on: true, total: 0 }, vesta: { on: true, total: 0 }, ceres: { on: true, total: 0 } } } ) );
		try {

			await page.goto( BASE );
			await orreryUp( page );
			await page.keyboard.press( 'Escape' );
			await closed( page );
			await page.waitForFunction( () => window.drive.world === 'moon', null, { timeout: 90000 } );
			const row = page.locator( '#globe-ui .online .areas button', { hasText: 'Earth' } );
			await row.waitFor( { timeout: 30000 } );
			assert.match( await row.textContent(), /4 drivers/ );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

} );

describe( 'World Drive\'s orrery: the worlds', () => {

	let page;

	before( async () => {

		page = await newPage();
		await openGlobe( page );

	} );

	after( () => page?.context().close() );

	test( 'eleven bodies: the five you can drive on, a radiogroup in the game\'s order; the rest named for why not', async () => {

		await openWorlds( page );
		assert.equal( await page.locator( '#orrery .orrery-worlds' ).getAttribute( 'role' ), 'radiogroup' );
		assert.equal( await page.locator( '#orrery .orrery-worlds' ).getAttribute( 'aria-label' ), 'Worlds you can drive on' );
		assert.deepEqual( await page.locator( '#orrery .orrery-worlds [role=radio]' ).evaluateAll( radios => radios.map( r => [ r.dataset.world, r.getAttribute( 'aria-label' ) ?? r.textContent.trim() ] ) ),
			[ [ 'earth', 'Earth' ], [ 'moon', 'Moon' ], [ 'mars', 'Mars' ], [ 'vesta', 'Vesta' ], [ 'ceres', 'Ceres' ] ] );
		assert.deepEqual( await page.locator( '#orrery .orrery-others [data-body]' ).evaluateAll( buttons => buttons.map( b => [ b.dataset.body, b.getAttribute( 'aria-label' ) ] ) ), [
			[ 'mercury', 'Mercury, not in the game yet' ], [ 'venus', 'Venus, not in the game yet' ],
			[ 'jupiter', 'Jupiter, no ground to drive on' ], [ 'saturn', 'Saturn, no ground to drive on' ],
			[ 'uranus', 'Uranus, no ground to drive on' ], [ 'neptune', 'Neptune, no ground to drive on' ],
		] );
		// The floating tags and the scene are for the eye only.
		assert.equal( await page.locator( '#orrery .orrery-tags' ).getAttribute( 'aria-hidden' ), 'true' );
		assert.equal( await page.locator( '#orrery .orrery-stage' ).getAttribute( 'aria-hidden' ), 'true' );
		// No counts without driving with others: no total, no live region.
		assert.equal( await page.locator( '#orrery .orrery-total' ).isVisible(), false );
		assert.equal( await page.locator( '#orrery [aria-live], #orrery [role=status]' ).count(), 0 );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'the rest of the Solar System: a sheet saying why, and no Drive; Esc back to the whole of it, then closed', async () => {

		for ( const id of OTHERS ) {

			await page.locator( `#orrery .orrery-others [data-body="${ id }"]` ).click();
			assert.equal( await sheetShown( page ), true );
			assert.equal( await page.locator( '#orrery .orrery-kicker' ).textContent(), [ 'mercury', 'venus' ].includes( id ) ? 'Not in the game yet' : 'No ground to drive on' );
			assert.equal( await page.locator( '#orrery .orrery-drive' ).isVisible(), false, `${ id } can be driven` );
			// Enter on it only picks it.
			await page.locator( `#orrery .orrery-others [data-body="${ id }"]` ).press( 'Enter' );
			assert.equal( await worldsOpen( page ), true );

		}

		await shot( page, 'orrery-2-jupiter' );
		assert.equal( await page.evaluate( () => window.drive.world ), 'earth' );
		await page.keyboard.press( 'Escape' );
		assert.equal( await sheetShown( page ), false );
		assert.equal( await worldsOpen( page ), true );
		assert.equal( await focused( page ), 'earth' );
		await page.keyboard.press( 'Escape' );
		await closed( page );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'the radiogroup: the arrows (and round), Home and End move the focus and the pick and its sheet, only the one picked in the tab order; Space picks; Enter drives there', async () => {

		await openWorlds( page );
		const tabs = () => page.locator( '#orrery .orrery-worlds [role=radio]' ).evaluateAll( radios => radios.map( r => r.tabIndex ) );
		const checked = () => page.locator( '#orrery .orrery-worlds [role=radio]' ).evaluateAll( radios => radios.filter( r => r.getAttribute( 'aria-checked' ) === 'true' ).map( r => r.dataset.world ) );
		assert.deepEqual( await tabs(), [ 0, - 1, - 1, - 1, - 1 ] );
		await page.keyboard.press( 'ArrowRight' );
		assert.deepEqual( [ await focused( page ), await checked(), await tabs() ], [ 'moon', [ 'moon' ], [ - 1, 0, - 1, - 1, - 1 ] ] );
		assert.equal( await sheetShown( page ), true );
		assert.equal( await page.locator( '#orrery-sheet-name' ).textContent(), 'The Moon' );
		assert.equal( await driveText( page ), 'Drive on the Moon→' );
		await page.keyboard.press( 'ArrowDown' );
		assert.equal( await focused( page ), 'mars' );
		await page.keyboard.press( 'End' );
		assert.deepEqual( [ await focused( page ), await checked() ], [ 'ceres', [ 'ceres' ] ] );
		await page.keyboard.press( 'ArrowRight' );
		assert.equal( await focused( page ), 'earth' );
		await page.keyboard.press( 'ArrowLeft' );
		assert.equal( await focused( page ), 'ceres' );
		await page.keyboard.press( 'Home' );
		assert.deepEqual( [ await focused( page ), await tabs() ], [ 'earth', [ 0, - 1, - 1, - 1, - 1 ] ] );
		// The game's own world: Back to it.
		assert.equal( await page.locator( '#orrery .orrery-kicker' ).textContent(), 'You\'re here' );
		assert.equal( await driveText( page ), 'Back to the Earth→' );
		await page.keyboard.press( 'ArrowUp' );
		await page.keyboard.press( 'ArrowUp' );
		assert.equal( await focused( page ), 'vesta' );
		await page.keyboard.press( 'Space' );
		assert.equal( await worldsOpen( page ), true, 'Space drove' );
		// None of it changed the game's world.
		assert.equal( await page.evaluate( () => window.drive.world ), 'earth' );
		await page.keyboard.press( 'Enter' );
		await closed( page );
		await page.waitForFunction( () => window.drive.world === 'vesta', null, { timeout: 90000 } );
		await flown( page );
		assert.deepEqual( await names( page ), VESTA_SPOTS.map( spot => spot.name ) );
		// The focus back on the Worlds button, which says so.
		assert.equal( await page.evaluate( () => document.activeElement?.classList.contains( 'worlds-open' ) ), true );
		assert.equal( await worldShown( page ), 'vesta' );
		assert.equal( await page.locator( OPENER ).getAttribute( 'aria-label' ), 'Change world. On Vesta now' );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'each world you can drive on, picked and driven to: the globe turns there, its spots; the sheet\'s spots fly to one', async () => {

		for ( const [ id, spots ] of [ [ 'moon', MOON_SPOTS ], [ 'mars', MARS_SPOTS ], [ 'ceres', CERES_SPOTS ], [ 'earth', SPOTS ] ] ) {

			await pickWorld( page, id );
			await page.waitForFunction( world => window.drive.world === world, id, { timeout: 90000 } );
			await flown( page );
			assert.equal( await worldShown( page ), id );
			assert.equal( await page.evaluate( () => document.body.dataset.world ), id );
			assert.deepEqual( await names( page ), spots.map( spot => spot.name ), id );

		}

		// From the sheet, a spot: closed, the globe flies there and pins it.
		await openWorlds( page );
		await page.locator( radio( 'earth' ) ).click();
		const spot = page.locator( '#orrery .orrery-spots [data-spot]' ).first();
		const name = await spot.textContent();
		assert.equal( await page.locator( '#orrery .orrery-spots [data-spot]' ).count(), 4 );
		await spot.click();
		await closed( page );
		await page.waitForFunction( name => window.drive.panel.pinned?.name === name, name );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );

	} );

} );

describe( 'World Drive\'s orrery: switching', () => {

	test( 'a switch loading says so on the Worlds button ("Loading Mars…", busy); Back to the Earth in the orrery meanwhile cancels it', async () => {

		const page = await newPage();
		try {

			let release;
			const held = new Promise( resolve => release = resolve );
			await page.route( `${ BASE }/mars/height.bin`, async route => {

				await held;
				route.continue();

			} );
			await openGlobe( page );
			await pickWorld( page, 'mars' );
			await page.waitForFunction( () => document.querySelector( '#globe-ui .worlds-open' ).getAttribute( 'aria-busy' ) === 'true' );
			assert.deepEqual( await page.locator( OPENER ).evaluate( b => ( { name: b.querySelector( '.worlds-name' ).textContent, label: b.getAttribute( 'aria-label' ), icon: [ ...b.querySelectorAll( '[data-icon]:not( [hidden] )' ) ].map( icon => icon.dataset.icon ) } ) ),
				{ name: 'Loading Mars…', label: 'Change world. Loading Mars…', icon: [ 'mars' ] } );
			assert.equal( await page.evaluate( () => window.drive.world ), 'earth' );

			// The orrery again: the game's still on the Earth, so the Earth's is Back to.
			await openWorlds( page );
			await page.locator( radio( 'earth' ) ).click();
			assert.equal( await driveText( page ), 'Back to the Earth→' );
			await page.locator( '#orrery .orrery-drive' ).click();
			await closed( page );
			release();
			await page.waitForFunction( () => window.drive.bodies.mars.ready, null, { timeout: 90000 } );
			await page.waitForTimeout( 800 );
			assert.equal( await page.evaluate( () => window.drive.world ), 'earth' );
			assert.deepEqual( await page.locator( OPENER ).evaluate( b => ( { busy: b.getAttribute( 'aria-busy' ), name: b.querySelector( '.worlds-name' ).textContent } ) ), { busy: null, name: 'Earth' } );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

	test( 'the Earth used up for today: on the Moon, the Earth\'s sheet says so, and its Drive shows why', async () => {

		const page = await newPage();
		try {

			page.turnstile = true;
			await page.route( `${ BASE }/api/config`, route => json( route, { turnstileSiteKey: '1x00000000000000000000AA', mapsOn: true } ) );
			await page.route( `${ BASE }/api/visit`, route => json( route, { error: 'Today\'s free drives are used up', reason: 'daily', retryAfter: 3600, visit: 'v1.moon-visit' }, 429 ) );
			await page.goto( BASE );
			await page.waitForFunction( () => window.drive?.mode === 'globe' && window.drive.world === 'moon', null, { timeout: 90000 } );
			await openWorlds( page );
			assert.equal( await focused( page ), 'moon' );
			await page.locator( radio( 'earth' ) ).click();
			assert.match( await page.locator( '#orrery .orrery-note' ).textContent(), /The Earth is used up for today/ );
			assert.equal( await driveText( page ), 'Drive on the Earth→' );
			await page.locator( '#orrery .orrery-drive' ).click();
			await closed( page );
			await page.locator( '#notice[data-kind="used-up"]' ).waitFor();
			assert.equal( await page.evaluate( () => window.drive.world ), 'moon' );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

} );

describe( 'World Drive\'s orrery: how many are driving', () => {

	test( 'each world\'s count in its radio\'s name, the total, the sheet with what counts; the panel\'s button; the "On other worlds" row opens it, the focus back there', async () => {

		const page = await workerPage();
		try {

			await testPad( page );
			// Who's driving now, asked of the Worker: the Moon and Mars with drivers, so a row for both.
			const row = page.locator( '#globe-ui .online .areas button', { hasText: 'On other worlds' } );
			await row.waitFor( { timeout: 30000 } );
			assert.match( await row.textContent(), /5 drivers/ );
			assert.equal( await page.locator( OPENER ).getAttribute( 'aria-label' ), 'Change world. On the Earth now' );
			await row.click();
			await page.locator( '#orrery[open] .orrery-worlds [role=radio]' ).first().waitFor( { timeout: 60000 } );
			assert.deepEqual( await page.locator( '#orrery .orrery-worlds [role=radio]' ).evaluateAll( radios => radios.map( r => r.getAttribute( 'aria-label' ) ) ),
				[ 'Earth, 0 driving now', 'Moon, 2 driving now', 'Mars, 3 driving now', 'Vesta', 'Ceres, 0 driving now' ] );
			assert.equal( await page.locator( '#orrery .orrery-total' ).textContent(), '5 driving now' );
			assert.equal( await page.locator( '#orrery [aria-live], #orrery [role=status]' ).count(), 0 );
			await page.locator( radio( 'mars' ) ).click();
			assert.equal( await page.locator( '#orrery .orrery-count' ).textContent(), '3 driving now' );
			assert.match( await page.locator( '#orrery .orrery-counted' ).textContent(), /Counted: drivers in an area's room/ );
			await page.locator( radio( 'vesta' ) ).click();
			assert.equal( await page.locator( '#orrery .orrery-count' ).textContent(), 'Driving with others is off there today' );
			assert.equal( await page.locator( '#orrery .orrery-counted' ).isVisible(), false );
			// Still drivable, on your own.
			assert.equal( await driveText( page ), 'Drive on Vesta→' );
			await shot( page, 'orrery-3-counts' );
			await page.keyboard.press( 'Escape' );
			await closed( page );
			assert.equal( await page.evaluate( () => document.activeElement?.textContent ?? '' ).then( text => /On other worlds/.test( text ) ), true, 'the focus isn\'t back on the row' );

			// On Mars: its own count on the panel's button.
			await pickWorld( page, 'mars' );
			await page.waitForFunction( () => window.drive.world === 'mars', null, { timeout: 90000 } );
			await page.waitForFunction( () => /On Mars now, 3 driving/.test( document.querySelector( '#globe-ui .worlds-open' ).getAttribute( 'aria-label' ) ), null, { timeout: 30000 } );
			assert.equal( await page.locator( '#globe-ui .worlds-open .worlds-count' ).textContent(), '3 driving' );
			assert.ok( page.online.includes( 'mars' ), JSON.stringify( page.online ) );
			// Opening it asks nothing more of the Worker.
			const asked = page.online.length;
			await openWorlds( page );
			assert.ok( page.online.length <= asked + 1, JSON.stringify( page.online ) );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

} );

describe( 'World Drive\'s orrery on a phone', () => {

	// No sideways scroll, the five in one row inside the screen, every tap target 44 px or more, the
	// sheet's Drive in view (scrolling its words doesn't move it).
	async function fits( page, viewport, why ) {

		assert.equal( await page.evaluate( () => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth ), true, `${ why }: the page scrolls sideways` );
		assert.equal( await page.locator( '#orrery' ).evaluate( d => d.scrollWidth <= d.clientWidth ), true, `${ why }: the orrery scrolls sideways` );
		const radios = await page.locator( '#orrery .orrery-worlds [role=radio]' ).evaluateAll( radios => radios.map( r => {

			const box = r.getBoundingClientRect();
			return { left: box.left, right: box.right, top: box.top, width: box.width, height: box.height, fits: r.scrollWidth <= r.clientWidth };

		} ) );
		assert.ok( radios.every( box => box.left >= 0 && box.right <= viewport.width && box.fits && box.width >= 44 && box.height >= 44 && Math.abs( box.top - radios[ 0 ].top ) < 1 ), `${ why }: ${ JSON.stringify( radios ) }` );
		const others = await page.locator( '#orrery .orrery-others [data-body]' ).evaluateAll( buttons => buttons.map( b => b.getBoundingClientRect().height ) );
		assert.ok( others.every( height => height >= 44 ), `${ why }: ${ JSON.stringify( others ) }` );
		assert.ok( big( await page.locator( '#orrery .orrery-close' ).boundingBox() ), `${ why }: the close button` );
		const drive = await page.locator( '#orrery .orrery-drive' ).boundingBox();
		assert.ok( big( drive ) && drive.x >= 0 && drive.x + drive.width <= viewport.width + 0.5 && drive.y >= 0 && drive.y + drive.height <= viewport.height + 0.5, `${ why }: Drive ${ JSON.stringify( drive ) }` );
		for ( const spot of await page.locator( '#orrery .orrery-spots [data-spot]' ).all() ) {

			await spot.scrollIntoViewIfNeeded();
			assert.ok( ( await spot.boundingBox() ).height >= 44, `${ why }: a spot` );

		}

		await page.locator( '#orrery .orrery-sheet-body' ).evaluate( body => body.scrollTo( 0, body.scrollHeight ) );
		assert.deepEqual( await page.locator( '#orrery .orrery-drive' ).boundingBox(), drive, `${ why }: Drive moved with the sheet's words` );

	}

	for ( const viewport of [ { width: 360, height: 640 }, { width: 740, height: 360 } ] ) {

		test( `${ viewport.width } × ${ viewport.height }: the Worlds button tapped; the five in one row; Mars's sheet with Drive in view; Mars tapped there`, async () => {

			const page = await newPage( { viewport, touch: true } );
			try {

				await openGlobe( page );
				assert.ok( big( await page.locator( OPENER ).boundingBox() ) );
				await openWorlds( page, { tap: true } );
				await page.locator( radio( 'mars' ) ).tap();
				assert.equal( await sheetShown( page ), true );
				await page.waitForTimeout( 300 );
				await fits( page, viewport, `${ viewport.width } × ${ viewport.height }` );
				// Touch hints, not the mouse's.
				assert.equal( await page.locator( '#orrery .orrery-hint-touch' ).isVisible() || ! await page.locator( '#orrery .orrery-hint-mouse' ).isVisible(), true );
				await shot( page, `orrery-4-phone-${ viewport.width }x${ viewport.height }` );
				await page.locator( '#orrery .orrery-drive' ).tap();
				await closed( page );
				await page.waitForFunction( () => window.drive.world === 'mars', null, { timeout: 90000 } );
				await flown( page );
				assert.deepEqual( await names( page ), MARS_SPOTS.map( spot => spot.name ) );
				assert.equal( await page.evaluate( () => document.documentElement.scrollWidth <= innerWidth ), true );
				assert.deepEqual( page.errors, [] );

			} finally {

				await page.context().close();

			}

		} );

	}

} );

describe( 'World Drive\'s orrery with reduced motion', () => {

	// How many times the page's renderer draws in `ms`.
	const draws = ( page, ms ) => page.evaluate( ms => new Promise( resolve => {

		const { renderer } = window.drive;
		const render = renderer.render;
		let n = 0;
		renderer.render = function ( ...args ) {

			n ++;
			return render.apply( this, args );

		};
		setTimeout( () => {

			renderer.render = render;
			resolve( n );

		}, ms );

	} ), ms );

	test( 'nothing orbits or spins: once still it isn\'t drawn again until something changes; with motion, it keeps being drawn', async () => {

		const still = await newPage( { reducedMotion: 'reduce' } );
		const moving = await newPage();
		try {

			for ( const page of [ still, moving ] ) {

				await openGlobe( page );
				await openWorlds( page );
				// Its pictures in, and the camera settled.
				await page.waitForTimeout( 4000 );

			}

			assert.equal( await draws( still, 2500 ), 0, 'drawn again with nothing changing' );
			assert.ok( await draws( moving, 2500 ) > 0, 'never drawn with motion allowed' );
			// A pick is a change: drawn (at once, no easing), then still again.
			await still.locator( radio( 'mars' ) ).click();
			await still.waitForTimeout( 1000 );
			assert.equal( await draws( still, 2000 ), 0, 'still drawn after the pick settled' );
			assert.deepEqual( still.errors, [] );
			assert.deepEqual( moving.errors, [] );

		} finally {

			await still.context().close();
			await moving.context().close();

		}

	} );

} );

describe( 'World Drive\'s orrery and Google\'s ad', () => {

	test( '?worlds=1: no ad asked for under it; closed, one ad asked for and shown, none counted blocked; open again, the ad hidden but kept, back as it closes', async () => {

		const page = await workerPage( { adsense: ADSENSE, stats: true } );
		try {

			await testPad( page, '/?worlds=1' );
			await page.locator( '#orrery[open] .orrery-worlds [role=radio]' ).first().waitFor( { timeout: 60000 } );
			// Past the idle wait's longest (5 s): nothing of Google's asked for under the orrery.
			await page.waitForTimeout( 6500 );
			assert.deepEqual( page.adAsked, [] );
			await page.keyboard.press( 'Escape' );
			await closed( page );
			await page.locator( '#globe-ui .ad-slot ins[data-ad-status="filled"]' ).waitFor( { timeout: 20000 } );
			assert.deepEqual( page.adAsked, [ ADS_SCRIPT ] );
			const counts = await page.evaluate( () => window.drive.stats.counts );
			assert.equal( counts[ 'ad:shown' ], 1, JSON.stringify( counts ) );
			assert.equal( counts[ 'ad:blocked' ], undefined, JSON.stringify( counts ) );

			// Open again: hidden, not taken away; closed, the same ad.
			await openWorlds( page );
			assert.equal( await page.locator( '#globe-ui .ad-slot' ).isVisible(), false );
			assert.equal( await page.locator( '#globe-ui .ad-slot ins[data-ad-status="filled"]' ).count(), 1 );
			await page.locator( '#orrery .orrery-close' ).click();
			await closed( page );
			assert.equal( await page.locator( '#globe-ui .ad-slot' ).isVisible(), true );
			assert.equal( await page.locator( '#globe-ui .ad-slot ins[data-ad-status="filled"]' ).count(), 1 );
			await page.waitForTimeout( 1000 );
			assert.deepEqual( page.adAsked, [ ADS_SCRIPT ] );
			assert.equal( ( await page.evaluate( () => window.drive.stats.counts ) )[ 'ad:blocked' ], undefined );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

} );
