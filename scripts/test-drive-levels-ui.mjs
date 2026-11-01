// npm run test:drive-levels-ui: levels in the page (src/drive-app/progress.js, profile.js, the
// Garage's locks) in Chromium on the test pad, against the real Worker (worker/drive/progress.js
// under `wrangler dev`) behind Vite's proxy. Driving fills the XP bar with pop-ups ("+46 XP · 1.4
// km", a new area, the day's bonus, a start spot); a level-up's burst says what it unlocked, and a
// look there opens the Garage, where it's on; before a nickname it's kept in the browser, said once
// at the first level-up, and claimed by the nickname; the profile card, the whole track and the
// title picker; a title on the leaderboard's rows and over the car on another page driving
// with it; the Garage's chips ("Lv 7 · or Pass", "Pass", "Lv 25"); with the pass, its looks
// unlocked and the level-only ones still not; a supporter's report earning ×1.5; and no Worker at
// all (the dev server alone), still levels, kept in the browser. Pictures of each at 1280 × 720
// and on a 375 × 740 touch screen.
//
// The test pad has no visit: main.js's dev-only seam (window.worldDriveVisitTest) hands each page a
// token made here with Turnstile's documented test secret, as /api/visit makes them, and
// window.worldDriveLiveTest the same for driving with others. Every request off this machine is
// blocked.
//
// TEST_VITE_PORT picks Vite's port (5646; the Worker-less one is the next), TEST_DRIVE_WORKER_PORT
// the Worker's (9216); TEST_SCREENSHOTS=<folder> saves pictures.

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { LEVEL_XP, XP, rewardsAt } from '../src/drive-app/levels.js';
import { makeVisit } from '../worker/drive/visits.js';
import { startVite, startWorker } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5646;
const WORKER_PORT = Number( process.env.TEST_DRIVE_WORKER_PORT ) || 9216;
const SHOTS = process.env.TEST_SCREENSHOTS;
const BASE = `http://127.0.0.1:${ PORT }`;
const ALONE = `http://127.0.0.1:${ PORT + 1 }`;
const PASS_SECRET = '1x0000000000000000000000000000000AA';
// The test pad at the Furka Pass start spot: driving there is a new area, the spot, and the day's
// first drive.
const PAD = { name: 'Test Pad', lat: 46.5725, lon: 8.4153 };
const VARS = {
	GOOGLE_MAPS_API_KEY: '', GOOGLE_CLIENT_ID: '', TURNSTILE_SECRET: PASS_SECRET, TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
	SUPPORTER_EMAILS: 'fan@example.com', NAMES_PER_VISITOR_DAILY: '1000',
};
const DESK = { width: 1280, height: 720 };
const PHONE = { width: 375, height: 740 };

let chromium;
let browser;
let worker;
let vite;
let alone;

before( async () => {

	try {

		( { chromium } = require( 'playwright' ) );

	} catch {

		( { chromium } = createRequire( '/opt/node-tools/' )( 'playwright' ) );

	}

	if ( SHOTS ) mkdirSync( SHOTS, { recursive: true } );
	worker = await startWorker( { port: WORKER_PORT, config: 'wrangler.drive.jsonc', vars: VARS } );
	vite = await startVite( PORT, { DRIVE_API: worker.base }, 'vite.drive.config.js' );
	alone = await startVite( PORT + 1, {}, 'vite.drive.config.js' );
	browser = await chromium.launch( { args: [
		'--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
		'--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
	] } );

} );

after( async () => {

	await browser?.close();
	vite?.stop();
	alone?.stop();
	worker?.stop();

} );

const visitToken = () => makeVisit( { TURNSTILE_SECRET: PASS_SECRET }, Date.now() );

// A leaderboard player made through the Worker, as the page makes one: { id, secret, name, visit }.
let addresses = 0;
async function makePlayer( name ) {

	const visit = await visitToken();
	const res = await fetch( `${ worker.base }/api/player`, {
		method: 'POST',
		headers: { Origin: worker.base, 'Content-Type': 'application/json', 'CF-Connecting-IP': `198.51.100.${ ++ addresses }` },
		body: JSON.stringify( { name, visit } ),
	} );
	assert.equal( res.status, 201, await res.clone().text() );
	return { ...await res.json(), visit };

}

// A page on the test pad's globe with a visit's token (the dev-only seams), the leaderboard's
// `player` if any; base: the Vite to use (ALONE: no Worker).
async function levelsPage( { visit = null, live = false, player = null, touch = false, viewport = touch ? PHONE : DESK, query = '', base = BASE } = {} ) {

	const context = await browser.newContext( { viewport, hasTouch: touch, isMobile: touch } );
	await context.addInitScript( ( { visit, live, player } ) => {

		if ( visit ) window.worldDriveVisitTest = { visit };
		if ( live ) window.worldDriveLiveTest = { visit };
		localStorage.setItem( 'world-drive.pads', 'off' );
		if ( player && ! localStorage.getItem( 'world-drive.player' ) ) localStorage.setItem( 'world-drive.player', JSON.stringify( player ) );
		// Every pop-up's words, however briefly it showed.
		window.popTexts = [];
		new MutationObserver( records => {

			for ( const record of records ) for ( const node of record.addedNodes ) if ( node.classList?.contains( 'xp-pop' ) ) window.popTexts.push( node.textContent );

		} ).observe( document, { childList: true, subtree: true } );

	}, { visit, live, player: player && { id: player.id, secret: player.secret, name: player.name } } );
	const page = await context.newPage();
	page.errors = [];
	page.reports = [];
	page.on( 'pageerror', err => page.errors.push( err.message ) );
	page.on( 'console', message => message.type() === 'error' && ! /Failed to load resource|WebSocket connection to .* failed|closed before the connection is established/.test( message.text() ) && page.errors.push( message.text() ) );
	page.on( 'response', async res => {

		if ( new URL( res.url() ).pathname !== '/api/progress' ) return;
		const body = await res.json().catch( () => null );
		page.reports.push( { status: res.status(), sent: res.request().postDataJSON()?.report, body } );

	} );
	await page.route( /^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort() );
	await page.goto( `${ base }/${ query }` );
	if ( base === BASE ) await page.locator( '#notice button', { hasText: 'Drive the test pad' } ).click();
	await page.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 30000 } );
	return page;

}

async function dropIn( page, place = PAD ) {

	await page.evaluate( p => window.drive.dropIn( p ), place );
	await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 60000 } );
	await page.evaluate( () => window.drive.driver.press( 'KeyW' ) );

}

// What `fn` gives once it gives something (a report Playwright saw answered, say), within 10 s.
async function until( fn ) {

	for ( let i = 0; i < 200; i ++ ) {

		const value = fn();
		if ( value ) return value;
		await new Promise( resolve => setTimeout( resolve, 50 ) );

	}

	throw new Error( `Nothing came of ${ fn }` );

}

const shown = page => page.evaluate( () => ( { level: window.drive.progress.level, ...window.drive.progress.progress, local: window.drive.progress.local } ) );
const stored = page => page.evaluate( () => JSON.parse( localStorage.getItem( 'world-drive.progress' ) ) );
const row = id => worker.d1( `SELECT xp, title, progress_at FROM players WHERE id = '${ id }'` )[ 0 ];

async function shot( page, name ) {

	if ( SHOTS ) await page.screenshot( { path: join( SHOTS, `${ name }.png` ) } );

}

describe( 'World Drive levels in the page', () => {

	let page;
	let named;

	after( async () => {

		await page?.context().close();

	} );

	test( 'driving fills the XP bar, with pop-ups: a new area, the start spot, the day\'s first drive, the km', async () => {

		page = await levelsPage( { visit: await visitToken() } );
		// Nothing driven yet: level 1, and no nickname (kept in this browser).
		assert.deepEqual( await shown( page ), { level: 1, xp: 0, floor: 0, next: LEVEL_XP[ 2 ], into: 0, span: LEVEL_XP[ 2 ], fraction: 0, local: true } );
		assert.equal( await page.locator( '#globe-ui .profile .title' ).textContent(), 'Lv 1 · Rookie' );
		assert.ok( await page.locator( '#globe-ui .profile .save-note' ).isVisible(), 'no word on saving it' );
		assert.equal( await page.locator( '#globe-ui .profile .title-pick' ).isVisible(), false );
		await dropIn( page );
		assert.equal( await page.locator( '#drive-ui .xp-level' ).textContent(), 'Lv 1' );
		// Level 3 within the first 250 m (the spot, the area and the day's bonus): its burst is held up
		// for the next test by the pointer on it, as it is for anyone reading it.
		await page.waitForFunction( () => window.drive.progress.level === 3, null, { timeout: 30000 } );
		await page.locator( '#level-up button.reward', { hasText: 'Hearts boost' } ).hover();
		// Driving on: the spot after 100 m, the area and the day's bonus after 250 m, and what's
		// driven every 10 s.
		await page.waitForFunction( () => window.popTexts.some( text => /^\+\d+ XP · \d+\.\d km/.test( text ) ), null, { timeout: 30000 } );
		const pops = await page.evaluate( () => window.popTexts );
		for ( const said of [ `Furka Pass +${ XP.spot } XP`, `New area +${ XP.area } XP`, `Daily bonus +${ XP.daily } XP` ] ) assert.ok( pops.includes( said ), `${ said }: ${ pops }` );
		await shot( page, 'levels-0-bar' );
		// The bar: level 3 (500 XP) and on into it.
		assert.equal( await page.locator( '#drive-ui .xp-level' ).textContent(), 'Lv 3' );
		const width = await page.locator( '#drive-ui .xp-hud .xp-bar i' ).evaluate( i => parseFloat( i.style.width ) );
		assert.ok( width >= 0 && width < 100, `${ width }` );
		assert.match( await page.locator( '#drive-ui .xp-count' ).textContent(), /^\d+ \/ 400 XP$/ );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'a level-up says what it unlocked, once that there\'s no nickname; its look opens the Garage, and it\'s there', async () => {

		const card = page.locator( '#level-up' );
		await card.waitFor();
		assert.equal( await card.locator( '.heading' ).textContent(), 'Level 3!' );
		// Both levels' rewards: the Sunburst paint and the Hearts boost, each a way to the Garage.
		assert.deepEqual( await card.locator( 'button.reward' ).allTextContents(), [ ...rewardsAt( 2 ), ...rewardsAt( 3 ) ].map( r => r.name ) );
		assert.ok( await card.locator( '.nickname' ).isVisible(), 'no "Pick a nickname"' );
		await shot( page, 'levels-1-level-up' );
		await card.locator( 'button.reward', { hasText: 'Hearts boost' } ).click();
		const garage = page.locator( '#garage' );
		await garage.waitFor();
		assert.equal( await page.evaluate( () => window.drive.mode ), 'paused' );
		// The hearts boost and the sunburst paint are unlocked; what's next on the track says so.
		const hearts = garage.locator( '[data-part="boost"] .choice[data-id="hearts"]' );
		assert.equal( await hearts.evaluate( b => b.classList.contains( 'locked' ) ), false );
		await hearts.click();
		assert.equal( await hearts.evaluate( b => b.classList.contains( 'on' ) ), true );
		assert.equal( await garage.locator( '[data-part="colour"] .choice[data-id="sunburst"]' ).evaluate( b => b.classList.contains( 'locked' ) ), false );
		await page.locator( '#garage .done' ).click();
		await page.locator( '#pause .resume' ).click();
		assert.equal( await page.evaluate( () => window.drive.driver.spec.fx.boost ), 'hearts' );
		// "Pick a nickname" only that once.
		assert.equal( ( await stored( page ) ).asked, true );

	} );

	test( 'the Garage\'s locks say what unlocks them: "Lv 7 · or Pass", "Pass", "Lv 25"', async () => {

		await page.keyboard.press( 'Escape' );
		await page.locator( '#pause .garage-open' ).click();
		const garage = page.locator( '#garage' );
		await garage.waitFor();
		const chip = async ( part, id ) => garage.locator( `[data-part="${ part }"] .choice[data-id="${ id }"] .unlock` ).textContent();
		assert.equal( await chip( 'boost', 'plasma' ), 'Lv 7 · or Pass' );
		assert.equal( await chip( 'boost', 'lightning' ), 'Pass' );
		assert.equal( await chip( 'finish', 'matte' ), 'Lv 31 · or Pass' );
		assert.equal( await chip( 'colour', 'teal' ), 'Lv 11' );
		assert.equal( await chip( 'colour', 'black' ), 'Pass' );
		assert.equal( await chip( 'colour', 'copper' ), 'Lv 25' );
		assert.equal( await chip( 'boost', 'hearts' ), '' );
		assert.equal( await garage.locator( '[data-part="colour"] .choice[data-id="teal"]' ).getAttribute( 'title' ), 'Teal: unlocks at level 11, or with the Supporter Pass' );
		await shot( page, 'levels-2-garage' );
		// A level-only colour says which level; the pass's sheet doesn't open for it.
		await garage.locator( '[data-part="colour"] .choice[data-id="copper"]' ).click();
		assert.equal( await garage.locator( '.level-note' ).textContent(), 'Copper comes at level 25: you\'re level 3. Drive on!' );
		assert.equal( await page.locator( '#pass' ).isVisible(), false );
		// One the pass unlocks opens it.
		await garage.locator( '[data-part="boost"] .choice[data-id="plasma"]' ).click();
		await page.locator( '#pass' ).waitFor();
		await page.locator( '#pass .close' ).click();
		await page.locator( '#garage .done' ).click();

	} );

	test( 'before a nickname it\'s kept in this browser; the nickname claims it', async () => {

		// Back on the globe: what was driven is added in here.
		await page.locator( '#pause .to-globe' ).click();
		await page.waitForFunction( () => window.drive.mode === 'globe' );
		const local = ( await stored( page ) ).local;
		assert.ok( local.xp >= LEVEL_XP[ 3 ], JSON.stringify( local ) );
		assert.ok( local.totals.km > 0.25 );
		assert.deepEqual( local.totals.spots, [ 'furka' ] );
		assert.equal( local.totals.areas.length, 1 );
		const before = await shown( page );
		assert.equal( before.xp, local.xp );
		assert.equal( page.reports.length, 0, 'reported with no player' );
		// A reload keeps it.
		await page.reload();
		await page.locator( '#notice button', { hasText: 'Drive the test pad' } ).click();
		await page.waitForFunction( () => window.drive?.mode === 'globe' );
		assert.equal( ( await shown( page ) ).xp, before.xp );
		await shot( page, 'levels-3-profile-local' );
		// "Pick a nickname" on the profile card: the leaderboard's name form.
		await page.locator( '#globe-ui .profile .save-note button' ).click();
		const form = page.locator( '#leaderboard .name-form' );
		await form.waitFor();
		await form.locator( 'input' ).fill( 'Level Racer' );
		await form.locator( 'button[type=submit]' ).click();
		await page.locator( '#leaderboard .named .name', { hasText: 'Level Racer' } ).waitFor();
		named = await page.evaluate( () => window.drive.leaderboard.player );
		// The claim: everything driven before, in its first report.
		await page.waitForFunction( () => ! window.drive.progress.local && JSON.parse( localStorage.getItem( 'world-drive.progress' ) ).local.xp === 0, null, { timeout: 15000 } );
		const claim = await until( () => page.reports.find( r => r.sent?.km > 0 ) );
		assert.equal( claim.status, 200 );
		assert.deepEqual( claim.sent.spots, [ 'furka' ] );
		assert.equal( claim.sent.daily, true );
		const server = row( named.id );
		// The Worker works it out again, from what was driven: the same, give or take rounding.
		assert.ok( Math.abs( server.xp - before.xp ) <= 3, `${ server.xp } on the Worker, ${ before.xp } here` );
		assert.equal( ( await shown( page ) ).xp, server.xp );
		assert.equal( ( await shown( page ) ).level, 3 );
		await page.locator( '#leaderboard .close' ).click();
		assert.deepEqual( page.errors, [] );

	} );

	test( 'the profile card and the whole track', async () => {

		const profile = page.locator( '#globe-ui .profile' );
		assert.equal( await profile.locator( '.name' ).textContent(), 'Level Racer' );
		assert.equal( await profile.locator( '.title' ).textContent(), 'Lv 3 · Rookie' );
		assert.equal( await profile.locator( '.level-badge b' ).textContent(), '3' );
		assert.equal( await profile.locator( '.next' ).textContent(), 'Next: Joyrider at Lv 4' );
		assert.equal( await profile.locator( '.save-note' ).isVisible(), false );
		assert.ok( await profile.locator( '.title-pick' ).isVisible() );
		assert.deepEqual( await profile.locator( 'select option' ).allTextContents(), [ 'Newest (Rookie)', 'Rookie' ] );
		await shot( page, 'levels-4-profile' );
		await profile.locator( '.track-open' ).click();
		const track = page.locator( '#track' );
		await track.waitFor();
		assert.equal( await track.locator( 'li' ).count(), 50 );
		assert.equal( await track.locator( 'li.done' ).count(), 3 );
		assert.equal( await track.locator( 'li.next' ).getAttribute( 'data-level' ), '4' );
		assert.deepEqual( await track.locator( 'li[data-level="7"] .reward' ).allTextContents(), [ 'Plasma boostor ⭐ Pass' ] );
		assert.deepEqual( await track.locator( 'li[data-level="25"] .reward' ).allTextContents(), [ 'Copper paintLevels only' ] );
		assert.equal( await track.locator( 'li[data-level="50"] .level-head .level-badge' ).getAttribute( 'data-frame' ), 'legend' );
		await shot( page, 'levels-5-track' );
		await track.locator( '.close' ).click();

	} );

	test( 'a title picked shows on the leaderboard and over the car on another page', async () => {

		// Level 9, as if driven there (the owner's console), seen at the next report.
		worker.d1( `UPDATE players SET xp = ${ LEVEL_XP[ 9 ] + 10 } WHERE id = '${ named.id }'` );
		await page.evaluate( () => window.drive.progress.refresh() );
		await page.waitForFunction( () => window.drive.progress.level === 9 );
		const select = page.locator( '#globe-ui .profile select' );
		assert.deepEqual( await select.locator( 'option' ).allTextContents(), [ 'Newest (Drifter)', 'Rookie', 'Joyrider', 'Drifter' ] );
		await select.selectOption( 'joyrider' );
		await page.waitForFunction( () => window.drive.progress.chosenTitle === 'joyrider' );
		assert.equal( row( named.id ).title, 'joyrider' );
		assert.equal( await page.locator( '#globe-ui .profile .title' ).textContent(), 'Lv 9 · Joyrider' );
		// A run on the board, as the page posts one: the row says the level and the title.
		const res = await fetch( `${ worker.base }/api/score`, {
			method: 'POST',
			headers: { Origin: worker.base, 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.200' },
			body: JSON.stringify( { id: named.id, secret: named.secret, visit: await page.evaluate( () => window.worldDriveVisitTest.visit ), score: 4320, tricks: 'Backflip!', place: 'Test Pad', vehicle: 'go-kart', airTime: 1, runSeconds: 30 } ),
		} );
		assert.equal( res.status, 200, await res.text() );
		await page.locator( '#globe-ui .board-open' ).click();
		const mine = page.locator( '#leaderboard .rows li', { hasText: 'Level Racer' } );
		await mine.waitFor();
		assert.equal( await mine.locator( '.lvl' ).textContent(), 'Lv 9 · Joyrider' );
		await shot( page, 'levels-6-leaderboard' );
		await page.locator( '#leaderboard .close' ).click();
		// Two pages driving together: each sees the other's level and title under their name.
		const visit = await page.evaluate( () => window.worldDriveVisitTest.visit );
		const racer = await levelsPage( { visit, live: true, player: named } );
		const friend = await levelsPage( { visit: await visitToken(), live: true, player: await makePlayer( 'Tag Friend' ) } );
		try {

			await Promise.all( [ dropIn( racer ), dropIn( friend ) ] );
			await Promise.all( [ racer, friend ].map( p => p.evaluate( () => window.drive.driver.release( 'KeyW' ) ) ) );
			const levelOf = ( p, name ) => p.waitForFunction( name => window.drive.ghosts.list().find( g => g.name === name )?.tag.querySelector( '.level' )?.textContent, name, { timeout: 30000 } );
			assert.equal( await ( await levelOf( friend, 'Level Racer' ) ).jsonValue(), 'Lv 9 · Joyrider' );
			assert.equal( await ( await levelOf( racer, 'Tag Friend' ) ).jsonValue(), 'Lv 1 · Rookie' );
			// The name tag itself is as it was, the level under it.
			assert.equal( await friend.evaluate( () => window.drive.ghosts.list().find( g => g.name === 'Level Racer' ).tag.querySelector( '.label' ).textContent ), 'Level Racer' );
			const ghost = friend.evaluate( () => window.drive.ghosts.list().find( g => g.name === 'Level Racer' ) );
			assert.deepEqual( [ ( await ghost ).level, ( await ghost ).title ], [ 9, 'joyrider' ] );
			await shot( friend, 'levels-7-nametag' );
			assert.deepEqual( [ ...racer.errors, ...friend.errors ], [] );

		} finally {

			await racer.context().close();
			await friend.context().close();

		}

	} );

} );

describe( 'World Drive levels with the Supporter Pass', () => {

	test( 'with the pass its looks are unlocked, the level-only ones not; a supporter\'s reports earn ×1.5', async () => {

		// A player linked to an account whose email has the pass (SUPPORTER_EMAILS).
		const fan = await makePlayer( 'Fan Racer' );
		worker.d1( 'INSERT INTO accounts ( id, google_sub, email, name, created_at, last_login_at ) VALUES ( 7, \'test-fan\', \'fan@example.com\', \'Fan\', 0, 0 )' );
		worker.d1( `UPDATE players SET account_id = 7 WHERE id = '${ fan.id }'` );
		const page = await levelsPage( { visit: fan.visit, player: fan, query: '?pro=1' } );
		try {

			await page.locator( '#globe-ui .garage-open' ).click();
			const garage = page.locator( '#garage' );
			await garage.waitFor();
			const locked = await garage.locator( '.choice.locked' ).evaluateAll( buttons => buttons.map( b => `${ b.closest( 'section' ).dataset.part } ${ b.dataset.id } ${ b.querySelector( '.unlock' ).textContent }` ) );
			assert.deepEqual( locked, [ 'colour copper Lv 25', 'colour mint Lv 35', 'colour plum Lv 45', 'colour champion Lv 50' ] );
			await page.locator( '#garage .done' ).click();
			// The first answer says the Worker counts it ×1.5.
			await page.waitForFunction( () => window.drive.progress.supporter );
			await dropIn( page );
			await page.evaluate( () => window.drive.driver.release( 'KeyW' ) );
			// Two km driven, as the page counts it, reported: 20 XP, ×1.5.
			const before = row( fan.id ).xp;
			const [ res ] = await Promise.all( [
				page.waitForResponse( r => new URL( r.url() ).pathname === '/api/progress' && r.request().postDataJSON()?.report?.km === 2 ),
				page.evaluate( () => {

					Object.assign( window.drive.progress.unsent, { km: 2, air: 0, drifts: 0, pads: 0, together: 0, areas: [], spots: [], daily: false } );
					return window.drive.progress.report();

				} ),
			] );
			const last = await res.json();
			assert.equal( last.supporter, true );
			assert.equal( last.gained, 30 );
			assert.equal( row( fan.id ).xp, before + 30 );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

} );

describe( 'World Drive levels on a phone, and with no Worker', () => {

	test( 'a touch screen: the bar, a level-up, the profile card, the track and the Garage', async () => {

		const page = await levelsPage( { visit: await visitToken(), touch: true } );
		try {

			await dropIn( page );
			await page.locator( '#level-up' ).waitFor( { timeout: 30000 } );
			await page.waitForTimeout( 400 );
			await shot( page, 'levels-phone-1-level-up' );
			// The count goes on a phone; the level and the bar stay, clear of the speed under them.
			assert.equal( await page.locator( '#drive-ui .xp-count' ).isVisible(), false );
			const bar = await page.locator( '#drive-ui .xp-hud' ).boundingBox();
			const speed = ( await page.locator( '#hud .dhud-cluster' ).boundingBox() ).y;
			assert.ok( bar.y + bar.height <= speed, `the bar (${ bar.y + bar.height }) runs into the speed (${ speed })` );
			assert.ok( bar.x >= 0 && bar.x + bar.width <= PHONE.width );
			await page.waitForTimeout( 6000 );
			await shot( page, 'levels-phone-2-bar' );
			await page.evaluate( () => window.drive.toGlobe() );
			await page.waitForTimeout( 2500 );
			await shot( page, 'levels-phone-3-profile' );
			await page.locator( '#globe-ui .profile .track-open' ).click();
			await page.locator( '#track' ).waitFor();
			await shot( page, 'levels-phone-4-track' );
			await page.locator( '#track .close' ).click();
			await page.locator( '#globe-ui .garage-open' ).click();
			await page.locator( '#garage' ).waitFor();
			await page.waitForTimeout( 800 );
			await shot( page, 'levels-phone-5-garage' );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

	test( 'with no Worker (the dev server alone), levels still come, kept in this browser, without a word on nicknames', async () => {

		const page = await levelsPage( { base: ALONE } );
		try {

			assert.equal( await page.locator( '#globe-ui .profile .save-note' ).isVisible(), false );
			await dropIn( page );
			await page.waitForFunction( () => window.drive.progress.level >= 2, null, { timeout: 30000 } );
			await page.locator( '#level-up' ).waitFor();
			assert.equal( await page.locator( '#level-up .nickname' ).isVisible(), false );
			await page.evaluate( () => window.drive.toGlobe() );
			assert.ok( ( await stored( page ) ).local.xp >= LEVEL_XP[ 2 ] );
			assert.equal( page.reports.length, 0 );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

} );
