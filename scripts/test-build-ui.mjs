// npm run test:build-ui: World Drive Build (/build/, src/product.js, worker/drive/build.js) in a
// real browser against World Drive's Worker under wrangler dev, serving the built page
// (npm run build:drive first; this builds it if it's missing). Requests anywhere else are blocked,
// so Google's tiles never load (their key here is a test one): what's checked is what the page is
// given and does. Signed out: no key prompt, flat ground, and why; the free plan's library open
// and the rest locked behind Build Pro (sets too), with its dialog; signed in, the Maps key; the
// owner with everything; and moving the project's site by address.
//
// Needs Playwright with Chromium. TEST_SCREENSHOTS=<folder> saves pictures.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { after, before, test } from 'node:test';
import { CLIENT_ID, ROOT, makeKey, makeToken, serveKeys, startWorker } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_BUILD_UI_PORT ) || 8785;
const SHOTS = process.env.TEST_SCREENSHOTS;
const MAPS_KEY = 'test-maps-key-not-real';
const BUILD_LINK = 'https://buy.stripe.com/test_build';
const DIST = join( ROOT, 'dist-drive', 'build' );

let server;
let keys;
let googleKey;
let upstream;
let browser;
let page;
const errors = [];

// The built page's files the test needs: the page, its code, the library's list and pictures, and
// the few models placed.
function assetsOf() {

	const files = {};
	const add = path => {

		files[ join( 'build', relative( DIST, path ) ) ] = readFileSync( path );

	};

	const walk = dir => {

		for ( const name of readdirSync( dir ) ) {

			const path = join( dir, name );
			if ( statSync( path ).isDirectory() ) walk( path );
			else add( path );

		}

	};

	// The dashboard (/build/) and the editor (/build/app/).
	add( join( DIST, 'index.html' ) );
	walk( join( DIST, 'home' ) );
	add( join( DIST, 'app', 'index.html' ) );
	add( join( DIST, 'app', 'google-maps-logo.svg' ) );
	walk( join( DIST, 'app', 'assets' ) );
	walk( join( DIST, 'app', 'library', 'thumbs' ) );
	add( join( DIST, 'app', 'library', 'library.json' ) );
	for ( const model of [ 'traffic-cone.glb', 'pickup-truck.glb' ] ) add( join( DIST, 'app', 'library', model ) );
	return files;

}

before( async () => {

	if ( ! existsSync( join( DIST, 'app', 'index.html' ) ) ) {

		const built = spawnSync( process.execPath, [ join( ROOT, 'node_modules', 'vite', 'bin', 'vite.js' ), 'build', '--config', 'vite.drive.config.js', '--logLevel', 'error' ], { cwd: ROOT, encoding: 'utf8' } );
		assert.equal( built.status, 0, built.stderr );

	}

	if ( SHOTS ) mkdirSync( SHOTS, { recursive: true } );
	// Place search's upstream (Nominatim's stand-in): one place for any query.
	upstream = createServer( ( req, res ) => {

		res.setHeader( 'Content-Type', 'application/json' );
		res.end( JSON.stringify( [ { lat: '43.6426', lon: '-79.3871', display_name: 'CN Tower, Front Street West, Toronto, Ontario, Canada', type: 'attraction' } ] ) );

	} );
	await new Promise( resolve => upstream.listen( 0, '127.0.0.1', resolve ) );
	googleKey = await makeKey( 'build-ui-key-1' );
	keys = await serveKeys( [ googleKey.jwk ] );
	server = await startWorker( {
		port: PORT,
		config: 'wrangler.drive.jsonc',
		vars: {
			GOOGLE_MAPS_API_KEY: MAPS_KEY,
			GOOGLE_CLIENT_ID: CLIENT_ID,
			GOOGLE_JWKS_URL: keys.url,
			STRIPE_WEBHOOK_SECRET: 'whsec_test_build_ui',
			BUILD_PAYMENT_LINK: BUILD_LINK,
			BUILD_PAYMENT_LINK_ID: 'plink_build0000000000000001',
			BUILD_PRICE: 'US$5/month',
			ADMIN_EMAILS: 'boss@example.com',
			SEARCH_UPSTREAM: `http://127.0.0.1:${ upstream.address().port }/search`,
		},
		assets: assetsOf(),
	} );

	const { chromium } = require( 'playwright' );
	browser = await chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader' ] } );
	page = await browser.newPage( { viewport: { width: 1280, height: 800 } } );
	page.on( 'pageerror', e => errors.push( String( e ) ) );
	await page.route( '**/*', route => route.request().url().startsWith( server.base ) ? route.continue() : route.abort() );

} );

after( async () => {

	await browser?.close();
	server?.stop();
	keys?.close();
	upstream?.close();

} );

async function open( path = '/build/app/' ) {

	await page.goto( server.base + path );
	await page.waitForFunction( () => window.twin?.sidebar && window.twin.layout, null, { timeout: 60000 } );

}

async function shot( name ) {

	if ( SHOTS ) await page.screenshot( { path: join( SHOTS, `${ name }.png` ) } );

}

// Signs this browser in as `claims`' Google account, as Google's button would (its token, posted).
async function signInAs( claims ) {

	const credential = await makeToken( googleKey, claims );
	const res = await page.evaluate( async credential => {

		const r = await fetch( '/build/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { credential } ) } );
		return { status: r.status, body: await r.json() };

	}, credential );
	assert.equal( res.status, 200, JSON.stringify( res.body ) );
	return res.body;

}

async function library( open ) {

	await page.evaluate( open => {

		if ( window.twin.sidebar.isOpen() !== open ) document.getElementById( 'library-toggle' ).click();

	}, open );

}

const lockedCards = () => page.evaluate( () => ( {
	locked: [ ...document.querySelectorAll( '#library .card.locked' ) ].map( c => c.dataset.item ),
	open: [ ...document.querySelectorAll( '#library .card[data-item]:not(.locked)' ) ].map( c => c.dataset.item ),
} ) );

test( 'signed out: no key prompt, flat ground and why, the example site, and the free library open', async () => {

	await open();
	const state = await page.evaluate( () => ( {
		prompt: document.getElementById( 'key-prompt' ).hidden,
		tiles: !! window.twin.tiles,
		banner: document.getElementById( 'banner' )?.textContent ?? '',
		site: document.querySelector( '.site-picker .site-name' )?.textContent,
		title: document.title,
		models: window.twin.models.entries.length,
	} ) );
	assert.equal( state.prompt, true, 'no key prompt' );
	assert.equal( state.tiles, false );
	assert.match( state.banner, /Sign in/ );
	assert.equal( state.site, 'North Vancouver waterfront (example)' );
	assert.match( state.title, /World Drive Build/ );
	assert.equal( state.models, 0, 'none of the Neptune project\'s models' );

	await library( true );
	const cards = await lockedCards();
	for ( const id of [ 'traffic-cone', 'jersey-barrier', 'pickup-truck', 'office-trailer-10x40', 'excavator-20t' ] ) assert.ok( cards.open.includes( id ), `${ id } is free` );
	for ( const id of [ 'crane-all-terrain', 'tri-tri', 'drill-rig-cfa', 'concrete-boom-pump-38m' ] ) assert.ok( cards.locked.includes( id ), `${ id } is Pro` );
	await shot( 'build-signed-out' );

} );

test( 'a locked item or set opens Build Pro\'s dialog; signed out it asks to sign in first', async () => {

	await page.click( '#library .card[data-item="crane-all-terrain"]' );
	await page.waitForSelector( '.premium-dialog[open]' );
	const dialog = await page.evaluate( () => {

		const d = document.querySelector( '.premium-dialog' );
		return { title: d.querySelector( 'h2' ).textContent, lead: d.querySelector( 'p' ).textContent, price: d.querySelector( '.price' ).textContent, signIn: ! d.querySelector( '.sign-in' ).hidden };

	} );
	assert.equal( dialog.title, 'Build Pro' );
	assert.match( dialog.lead, /is part of Build Pro/ );
	assert.equal( dialog.price, 'US$5/month' );
	assert.equal( dialog.signIn, true );
	await shot( 'build-pro-dialog' );
	await page.keyboard.press( 'Escape' );
	// A set with Pro pieces is locked too.
	await page.click( '#library .card[data-set="set-concrete-pour"]' );
	await page.waitForSelector( '.premium-dialog[open]' );
	await page.keyboard.press( 'Escape' );

} );

test( 'signed in on the free plan: the Maps key from the server, and a free item placed', async () => {

	const signed = await signInAs( { sub: 'ui-free', email: 'free@example.com', name: 'Fran Free' } );
	assert.equal( signed.plan.tier, 'free' );
	assert.equal( signed.hasMapsKey, true );
	await open();
	assert.equal( await page.evaluate( () => !! window.twin.tiles ), true, 'Google\'s tiles made with the key' );
	await library( true );
	assert.ok( ( await lockedCards() ).locked.includes( 'crane-all-terrain' ) );
	await page.click( '#library .card[data-item="traffic-cone"]' );
	const canvas = await page.$( 'canvas' );
	const box = await canvas.boundingBox();
	await page.mouse.move( box.x + box.width / 2, box.y + box.height / 2 );
	await page.waitForFunction( () => window.twin.models.entries.some( e => e.placing ), null, { timeout: 30000 } );
	await page.mouse.down();
	await page.mouse.up();
	await page.waitForFunction( () => window.twin.models.entries.some( e => e.library === 'traffic-cone' && ! e.placing ) );
	// Locked for a free account: the dialog offers Stripe with this account on it.
	await page.click( '#library .card[data-item="tri-tri"]' );
	await page.waitForSelector( '.premium-dialog[open]' );
	const href = await page.evaluate( () => document.querySelector( '.premium-dialog a.buy' ).href );
	assert.ok( href.startsWith( BUILD_LINK ), href );
	assert.match( href, /client_reference_id=\d+/ );
	assert.match( href, /prefilled_email=free%40example\.com/ );
	await page.keyboard.press( 'Escape' );

} );

test( 'the owner: everything open', async () => {

	await page.context().clearCookies();
	const signed = await signInAs( { sub: 'ui-boss', email: 'boss@example.com', name: 'Big Boss' } );
	assert.equal( signed.plan.tier, 'owner' );
	await open();
	await library( true );
	assert.deepEqual( ( await lockedCards() ).locked, [] );
	await shot( 'build-owner' );

} );

test( 'moving the project\'s site by address', async () => {

	await library( false );
	await page.click( '.site-picker .site-current' );
	await page.fill( '#site-query', 'CN Tower' );
	await page.click( '.site-picker form > button' );
	await page.waitForSelector( '.site-picker .site-results button' );
	await Promise.all( [ page.waitForNavigation(), page.click( '.site-picker .site-results button' ) ] );
	assert.match( page.url(), /\/build\/app\/\?/ );
	assert.match( page.url(), /at=43\.642600%2C-79\.387100/ );
	await page.waitForFunction( () => window.twin?.SITE );
	const site = await page.evaluate( () => window.twin.SITE );
	assert.equal( site.lat, 43.6426 );
	assert.equal( site.name, 'CN Tower, Front Street West' );
	assert.equal( await page.evaluate( () => document.querySelector( '.site-picker .site-name' ).textContent ), 'CN Tower, Front Street West' );

} );

// --- the dashboard (/build/) ---------------------------------------------------------------

async function dashboard() {

	await page.goto( `${ server.base }/build/` );
	await page.waitForSelector( 'body[data-loaded]', { timeout: 30000 } );

}

test( 'the dashboard signed out: find a site, the two plans, and sign in to keep projects', async () => {

	await page.context().clearCookies();
	await dashboard();
	const state = await page.evaluate( () => ( {
		title: document.querySelector( 'h1' ).textContent,
		empty: document.getElementById( 'projects-empty' ).textContent,
		plans: [ ...document.querySelectorAll( '.compare-card .tier' ) ].map( t => t.textContent ),
		prices: [ ...document.querySelectorAll( '.compare-card .price' ) ].map( t => t.textContent ),
		example: document.getElementById( 'example' ).getAttribute( 'href' ),
	} ) );
	assert.equal( state.title, 'Where\'s the site?' );
	assert.match( state.empty, /Sign in/ );
	assert.deepEqual( state.plans, [ 'Free', 'Build Pro' ] );
	assert.deepEqual( state.prices, [ 'Free', 'US$5/month' ] );
	assert.match( state.example, /^\/build\/app\/\?at=49\.3054/ );
	await shot( 'dashboard-signed-out' );

	// An address: its places, each opening the editor there.
	await page.fill( '#find-query', 'CN Tower' );
	await page.click( '#find-go' );
	await page.waitForSelector( '#results a' );
	const href = await page.getAttribute( '#results a', 'href' );
	assert.match( href, /\/build\/app\/\?at=43\.642600%2C-79\.387100&place=CN\+Tower%2C\+Front\+Street\+West$/ );
	await shot( 'dashboard-search' );
	await Promise.all( [ page.waitForNavigation(), page.click( '#results a' ) ] );
	await page.waitForFunction( () => window.twin?.SITE );
	assert.equal( await page.evaluate( () => window.twin.SITE.name ), 'CN Tower, Front Street West' );

} );

test( 'the dashboard signed in: the plan with its views, and projects that open in the editor', async () => {

	await page.goto( `${ server.base }/build/` );
	const signed = await signInAs( { sub: 'ui-dash', email: 'dash@example.com', name: 'Dana Dash' } );
	assert.equal( signed.plan.tier, 'free' );
	// A project saved at Toronto (as the editor saves one: the layout with its site's lat and lon).
	const saved = await page.evaluate( async () => {

		const data = { version: 2, site: 'CN Tower, Front Street West', lat: 43.6426, lon: - 79.3871, items: [ { name: 'Traffic cone', library: 'traffic-cone', url: 'library/traffic-cone.glb', east: 2, north: 3, heading: 0, up: null } ], extras: {} };
		const res = await fetch( '/build/app/api/layouts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { site: data.site, name: 'Tower crane pad', data } ) } );
		return { status: res.status, body: await res.json() };

	} );
	assert.equal( saved.status, 201, JSON.stringify( saved.body ) );
	assert.equal( saved.body.lat, 43.6426 );
	await dashboard();
	const state = await page.evaluate( () => ( {
		who: document.getElementById( 'who-name' ).textContent,
		pill: document.getElementById( 'plan-pill' ).textContent,
		tier: document.querySelector( '.plan-head .tier' ).textContent,
		views: document.querySelector( '.meter-value' ).textContent,
		soon: document.querySelector( '.upgrade' )?.textContent ?? '',
		projects: [ ...document.querySelectorAll( '.project' ) ].map( p => ( { name: p.querySelector( 'strong' ).textContent, href: p.getAttribute( 'href' ) } ) ),
		count: document.getElementById( 'project-count' ).textContent,
	} ) );
	assert.equal( state.who, 'Dana Dash' );
	assert.equal( state.pill, 'Free' );
	assert.equal( state.tier, 'Free' );
	assert.equal( state.views, '0 / 15' );
	assert.match( state.soon, /Go Build Pro · US\$5\/month/ );
	assert.equal( state.count, '1 of 1' );
	assert.equal( state.projects.length, 1 );
	assert.equal( state.projects[ 0 ].name, 'Tower crane pad' );
	assert.match( state.projects[ 0 ].href, new RegExp( `project=${ saved.body.id }` ) );
	await shot( 'dashboard-signed-in' );

	// Opening it: the editor at Toronto, with the project's cone.
	await Promise.all( [ page.waitForNavigation(), page.click( '.project' ) ] );
	await page.waitForFunction( () => window.twin?.models?.entries.some( e => e.library === 'traffic-cone' ), null, { timeout: 30000 } );
	assert.equal( await page.evaluate( () => window.twin.SITE.lat ), 43.6426 );
	assert.equal( await page.evaluate( () => document.querySelector( '.site-picker .site-home' ).getAttribute( 'href' ) ), '/build/' );
	await page.goto( `${ server.base }/build/` );
	await page.waitForSelector( 'body[data-loaded]' );
	assert.equal( await page.evaluate( () => document.querySelector( '.meter-value' ).textContent ), '1 / 15', 'opening the editor took a view' );

} );

test( 'starting a project from the dashboard, moving it, and renaming and deleting it', async () => {

	await page.goto( `${ server.base }/build/` );
	await signInAs( { sub: 'ui-start', email: 'start@example.com', name: 'Sam Start' } );
	await dashboard();
	assert.match( await page.textContent( '#projects-empty' ), /Start a project here/ );
	await page.fill( '#find-query', 'CN Tower' );
	await page.click( '#find-go' );
	await page.waitForSelector( '.start-here input' );
	assert.equal( await page.inputValue( '.start-here input' ), 'CN Tower, Front Street West' );
	await page.fill( '.start-here input', 'Tower crane base' );
	await shot( 'dashboard-start-here' );
	await Promise.all( [ page.waitForNavigation(), page.click( '.start-here button' ) ] );
	assert.match( page.url(), /project=[\w-]{16}/ );
	const id = new URL( page.url() ).searchParams.get( 'project' );
	// Saved, said in the site bar at the top, which is always in view.
	await page.locator( '#project-status[data-state="saved"]', { hasText: 'Tower crane base · Saved' } ).waitFor( { timeout: 30000 } );
	assert.equal( await page.evaluate( () => [ ...document.querySelectorAll( 'button' ) ].some( b => b.textContent === 'Projects' ) ), true, 'the editor calls them projects' );
	await shot( 'editor-project-saved' );

	// Moved by the site picker (which opens it at the new place, the project in the address): saved there.
	await page.goto( `${ server.base }/build/app/?at=43.650000,-79.380000&place=Somewhere+Else&project=${ id }` );
	await page.locator( '#project-status', { hasText: 'Tower crane base · Saved' } ).waitFor( { timeout: 30000 } );
	await page.waitForFunction( async id => {

		const r = await fetch( `/build/api/layouts/${ id }` );
		const body = await r.json();
		return body.site === 'Somewhere Else' && body.lat === 43.65;

	}, id, { timeout: 15000 } );

	// The free plan's one project: a second is refused with what to do.
	await dashboard();
	await page.fill( '#find-query', 'CN Tower' );
	await page.click( '#find-go' );
	await page.waitForSelector( '.start-here button' );
	await page.click( '.start-here button' );
	await page.locator( '.start-note', { hasText: 'free plan saves one project' } ).waitFor();

	// Rename and delete, from the list.
	page.once( 'dialog', d => d.accept( 'Crane base, north side' ) );
	await page.click( '.project-actions button:has-text("Rename")' );
	await page.locator( '.project strong', { hasText: 'Crane base, north side' } ).waitFor();
	page.once( 'dialog', d => d.accept() );
	await page.click( '.project-actions button:has-text("Delete")' );
	await page.locator( '.project' ).waitFor( { state: 'detached' } );

} );

test( 'no page errors', () => {

	// Google's tiles (blocked here) report through the banner, not as page errors.
	assert.deepEqual( errors, [] );

} );
