// npm run test:premium-ui: premium equipment in a real browser, against `wrangler dev` with
// made-up Stripe settings and the Vite dev server on this machine. Locked Pro items and their
// dialog, signing in from it, the buy link, unlocking when the window gets focus back and on
// ?premium=thanks, and layouts with premium items opening for everyone. Payments are webhooks
// signed here with the made-up secret; Google's sign-in script is a stand-in, and every request
// that isn't to the local server is blocked, so nothing reaches Google, Stripe or Cloudflare.
// (scripts/test-accounts-ui.mjs checks that nothing changes while premium isn't set up.)
//
// Needs Playwright with Chromium, as test-accounts-ui.mjs does. TEST_VITE_PORT and
// TEST_WORKER_PORT pick the ports; TEST_SCREENSHOTS=<folder> saves pictures.

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { CLIENT_ID, GOOGLE_STUB, makeKey, makeToken, serveKeys, startVite, startWorker, stripeSignature } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const VITE_PORT = Number( process.env.TEST_VITE_PORT ) || 5198;
const WORKER_PORT = Number( process.env.TEST_WORKER_PORT ) || 8789;
const SHOTS = process.env.TEST_SCREENSHOTS;
const BASE = `http://127.0.0.1:${ VITE_PORT }`;
const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';
const SITE = 'Neptune Terminals';
// Made up, in Stripe's formats.
const PAYMENT_LINK = 'https://buy.stripe.com/test_00g5kE1aB2cD3eF4gH';
const PAYMENT_LINK_ID = 'plink_1TestPremiumLink00000000';
const WEBHOOK_SECRET = 'whsec_test_not_a_real_secret_0123456789';
const PRICE = 'CA$19, one time';
// The Pro equipment pack: the Cranes & lifts and Material handling items, downloaded (library.json)
// and built in code (crane-models.js).
const BUILT_IN_PACK = [ 'tower-crane', 'crane-rough-terrain-40t', 'crane-carry-deck-8t', 'boom-truck-30t', 'crane-spider-3t', 'telehandler-compact-5500lb', 'telehandler-12k' ];
const PACK = [ 'crane-all-terrain', 'boom-lift-40ft', 'crane-crawler', 'scissor-lift-32ft', 'container-handler-empty', 'forklift-5000lb', 'telehandler-10k', ...BUILT_IN_PACK ];

let chromium;
let browser;
let worker;
let keys;
let vite;
let googleKey;
let page;
let shareLink;
let payments = 0;

before( async () => {

	try {

		( { chromium } = require( 'playwright' ) );

	} catch {

		throw new Error( 'Playwright is needed: npm i -D playwright && npx playwright install chromium' );

	}

	if ( SHOTS ) mkdirSync( SHOTS, { recursive: true } );
	googleKey = await makeKey( 'premium-ui-key' );
	keys = await serveKeys( [ googleKey.jwk ] );
	worker = await startWorker( {
		port: WORKER_PORT,
		vars: {
			GOOGLE_CLIENT_ID: CLIENT_ID,
			GOOGLE_JWKS_URL: keys.url,
			GOOGLE_MAPS_API_KEY: '',
			ALLOWED_EMAILS: '',
			ALLOWED_DOMAINS: '',
			STRIPE_PAYMENT_LINK: PAYMENT_LINK,
			STRIPE_PAYMENT_LINK_ID: PAYMENT_LINK_ID,
			STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
			PREMIUM_PRICE: PRICE,
			PREMIUM_EMAILS: '',
		},
	} );
	vite = await startVite( VITE_PORT, { TWIN_API: worker.base } );
	browser = await chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader' ] } );

} );

after( async () => {

	await browser?.close();
	vite?.stop();
	worker?.stop();
	keys?.close();

} );

// Requests the pages tried to make to anywhere but the local server.
const blocked = [];

test( 'signed out, the Pro equipment is locked and explains itself', async () => {

	page = await newPage();
	await openApp( page );
	await page.keyboard.press( 'KeyL' );
	await page.locator( '#library .card.locked' ).first().waitFor();
	assert.deepEqual( await lockedIds( page ), [ ...PACK ].sort() );
	assert.equal( await page.locator( '#library .card.locked .pro:visible' ).count(), PACK.length );
	// Everything else is as it was.
	assert.equal( await page.locator( '#library .card:not(.locked) .pro:visible' ).count(), 0 );
	await page.locator( '#library .card', { hasText: 'Crawler crane' } ).scrollIntoViewIfNeeded();
	await shot( page.locator( '#library' ), 'locked-library' );

	await page.locator( '#library .card', { hasText: 'Scissor lift' } ).click();
	const dialog = page.locator( '.premium-dialog' );
	await dialog.waitFor();
	assert.match( await dialog.locator( 'p.small' ).first().textContent(), /Scissor lift \(32 ft, electric\) is part of the Pro equipment pack/ );
	assert.equal( await dialog.locator( '.pack li' ).count(), PACK.length );
	// Downloaded items show their picture file; built-in ones the picture the library drew for them.
	const thumbs = await dialog.locator( '.pack img' ).evaluateAll( images => images.map( img => img.src.startsWith( 'data:image/png' ) ? 'drawn' : new URL( img.src ).pathname ) );
	assert.ok( thumbs.every( path => /^\/library\/thumbs\/.+\.webp$/.test( path ) || path === 'drawn' ), thumbs.join( ' ' ) );
	assert.equal( thumbs.filter( path => path === 'drawn' ).length, BUILT_IN_PACK.length );
	assert.equal( await dialog.locator( '.price' ).textContent(), PRICE );
	// Signed out: sign in first, no way to pay yet.
	await dialog.locator( '.sign-in .stub-google' ).waitFor();
	assert.equal( await dialog.locator( '.buy' ).isVisible(), false );
	assert.equal( await page.evaluate( () => window.twin.models.entries.length ), 0, 'picking a locked item placed it' );
	assert.equal( await page.locator( '#library.placing' ).count(), 0 );
	await shot( dialog, 'dialog-signed-out' );

	// Keys in the dialog stay there; Esc closes it.
	await page.keyboard.press( 'KeyL' );
	assert.equal( await page.evaluate( () => window.twin.sidebar.isOpen() ), true, 'L in the dialog closed the library' );
	await page.keyboard.press( 'Escape' );
	await dialog.waitFor( { state: 'hidden' } );

	// Dragging one doesn't place it either.
	await page.locator( '#library .card', { hasText: 'Forklift' } ).dispatchEvent( 'dragstart', { dataTransfer: await page.evaluateHandle( () => new DataTransfer() ) } );
	await dialog.waitFor();
	assert.match( await dialog.locator( 'p.small' ).first().textContent(), /Forklift/ );
	assert.equal( await page.evaluate( () => window.twin.models.entries.length ), 0 );
	await page.keyboard.press( 'Escape' );
	await dialog.waitFor( { state: 'hidden' } );

} );

test( 'signing in from the dialog offers the buy link, saying who is buying', async () => {

	await page.locator( '#library .card[data-item="telehandler-10k"]' ).click();
	const dialog = page.locator( '.premium-dialog' );
	await page.evaluate( token => window.testCredential = token, await makeToken( googleKey ) );
	await dialog.locator( '.stub-google' ).click();
	const buy = dialog.locator( 'a.buy' );
	await buy.waitFor();
	assert.equal( await dialog.locator( '.sign-in' ).isVisible(), false );
	const href = new URL( await buy.getAttribute( 'href' ) );
	const { premium } = await api( page, 'GET', '/api/me' );
	assert.equal( `${ href.origin }${ href.pathname }`, PAYMENT_LINK );
	assert.match( premium.clientReferenceId, /^[1-9][0-9]*$/ );
	assert.equal( href.searchParams.get( 'client_reference_id' ), premium.clientReferenceId );
	assert.equal( href.searchParams.get( 'prefilled_email' ), 'alice@example.com' );
	assert.deepEqual( [ ...href.searchParams.keys() ].sort(), [ 'client_reference_id', 'prefilled_email' ] );
	assert.equal( await buy.getAttribute( 'target' ), '_blank' );
	assert.equal( await buy.getAttribute( 'rel' ), 'noopener' );
	// Still locked: signing in isn't paying.
	assert.equal( ( await lockedIds( page ) ).length, PACK.length );
	await shot( dialog, 'dialog-buy' );

} );

test( 'paying in the other tab unlocks the pack when the window gets focus back', async () => {

	const { premium } = await api( page, 'GET', '/api/me' );
	// Focus coming back before Stripe has said anything changes nothing.
	await page.evaluate( () => window.dispatchEvent( new Event( 'focus' ) ) );
	await page.waitForTimeout( 500 );
	assert.equal( await page.locator( '.premium-dialog' ).isVisible(), true );

	assert.equal( await pay( { client_reference_id: premium.clientReferenceId, customer_details: { email: 'alice@example.com' } } ), 200 );
	await page.evaluate( () => window.dispatchEvent( new Event( 'focus' ) ) );
	await page.locator( '.toast', { hasText: 'Premium unlocked' } ).waitFor();
	await page.locator( '.premium-dialog' ).waitFor( { state: 'hidden' } );
	assert.deepEqual( await lockedIds( page ), [] );
	assert.equal( await page.locator( '#library .card .pro:visible' ).count(), 0 );

	// Now it places like anything else.
	await page.locator( '#library .card', { hasText: 'Scissor lift' } ).click();
	await page.waitForFunction( () => window.twin.models.entries.some( e => e.placing && e.library === 'scissor-lift-32ft' ) );
	await page.keyboard.press( 'Escape' );
	await page.waitForFunction( () => window.twin.models.entries.length === 0 );

} );

test( 'a shared layout with premium items opens for someone who hasn\'t bought them', async () => {

	await page.evaluate( () => window.twin.models.load( { name: 'Scissor lift', library: 'scissor-lift-32ft', url: 'library/scissor-lift-32ft.glb', scale: 1, east: 10, north: 20, heading: 0, up: null } ) );
	await page.waitForFunction( () => window.twin.layout.getData().items.some( item => item.library === 'scissor-lift-32ft' ) );
	const saved = await api( page, 'POST', '/api/layouts', { site: SITE, name: 'Lift plan', data: await page.evaluate( () => window.twin.layout.getData() ) } );
	const { shareToken } = await api( page, 'POST', `/api/layouts/${ saved.id }/share`, {} );
	shareLink = `${ BASE }/?view=${ shareToken }&prompt`;

	const viewer = await newPage();
	await openApp( viewer, shareLink );
	await viewer.locator( '.cloud-banner' ).waitFor();
	await viewer.waitForFunction( () => window.twin.models.entries.some( e => e.library === 'scissor-lift-32ft' && e.pivot ) );
	await viewer.keyboard.press( 'KeyL' );
	await viewer.locator( '#library .card.locked' ).first().waitFor();
	assert.equal( ( await lockedIds( viewer ) ).length, PACK.length, 'the viewer hasn\'t bought it' );
	assert.equal( await viewer.locator( '.toast', { hasText: 'could not be loaded' } ).count(), 0 );
	await viewer.context().close();

} );

test( 'back from Stripe on ?premium=thanks, the pack is unlocked and the address tidied', async () => {

	// Bob paid on the link itself (no reference), with his account's email.
	const bob = await newPage();
	await openApp( bob );
	await bob.keyboard.press( 'KeyL' );
	await bob.evaluate( token => window.testCredential = token, await makeToken( googleKey, { sub: '2002', email: 'bob@example.com', name: 'Bob Builder', given_name: 'Bob' } ) );
	await bob.locator( '.cloud-account .stub-google' ).click();
	await bob.locator( '.cloud-account .who', { hasText: 'Bob' } ).waitFor();
	assert.equal( ( await lockedIds( bob ) ).length, PACK.length );

	assert.equal( await pay( { customer_details: { email: 'bob@example.com' } } ), 200 );
	await openApp( bob, `${ BASE }/?premium=thanks&prompt` );
	await bob.locator( '.toast', { hasText: 'Premium unlocked' } ).waitFor();
	assert.equal( new URL( bob.url() ).searchParams.has( 'premium' ), false );
	await bob.keyboard.press( 'KeyL' );
	assert.deepEqual( await lockedIds( bob ), [] );
	await bob.context().close();

} );

test( 'signing out locks it again, and nothing was sent anywhere but this computer', async () => {

	await page.locator( '.cloud-account' ).getByRole( 'button', { name: 'Sign out' } ).click();
	await page.locator( '.cloud-account .stub-google' ).waitFor();
	assert.equal( ( await lockedIds( page ) ).length, PACK.length );
	assert.deepEqual( blocked.filter( url => ! url.startsWith( 'https://accounts.google.com/' ) ), [] );
	await page.context().close();

} );

// --- helpers -------------------------------------------------------------------------------

// A checkout through the Payment Link, paid, sent to the Worker as Stripe would.
async function pay( fields ) {

	payments ++;
	const session = { id: `cs_test_ui_${ payments }`, object: 'checkout.session', payment_link: PAYMENT_LINK_ID, payment_status: 'paid', payment_intent: `pi_test_ui_${ payments }`, client_reference_id: null, ...fields };
	const body = JSON.stringify( { id: `evt_test_ui_${ payments }`, type: 'checkout.session.completed', data: { object: session } } );
	const res = await fetch( `${ worker.base }/api/stripe/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': stripeSignature( body, WEBHOOK_SECRET ) }, body } );
	return res.status;

}

// The library items whose cards are locked.
function lockedIds( target ) {

	return target.evaluate( () => [ ...document.querySelectorAll( '#library .card.locked' ) ].map( card => card.dataset.item ).sort() );

}

async function newPage() {

	const context = await browser.newContext( { viewport: { width: 1000, height: 700 } } );
	// Only the local server answers; Google's sign-in script is the stand-in; the rest is blocked.
	await context.route( '**/*', route => {

		const url = route.request().url();
		if ( url.startsWith( BASE ) ) return route.continue();
		if ( url.startsWith( GOOGLE_SCRIPT ) ) return route.fulfill( { contentType: 'text/javascript', body: GOOGLE_STUB } );
		blocked.push( url );
		return route.abort();

	} );
	return context.newPage();

}

async function openApp( target, url = `${ BASE }/?prompt` ) {

	await target.goto( url );
	await target.locator( '#skip' ).click();
	await target.waitForFunction( () => window.twin?.sidebar, null, { timeout: 60000 } );
	await target.waitForTimeout( 500 );

}

// The API as the page's signed-in user (Playwright shares the page's cookies).
async function api( target, method, path, body ) {

	const res = await target.request.fetch( BASE + path, { method, headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: body } );
	assert.ok( res.ok(), `${ method } ${ path }: ${ res.status() }` );
	return res.status() === 204 ? null : res.json();

}

async function shot( target, name ) {

	if ( SHOTS ) await target.screenshot( { path: join( SHOTS, `premium-${ name }.png` ), timeout: 150000 } );

}
