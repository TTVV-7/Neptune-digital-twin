// npm run test:drive-levels-ui: levels in the page (src/drive-app/progress.js, profile.js, the
// Garage's locks) in Chromium on the test pad, against the real Worker (worker/drive/progress.js
// under `wrangler dev`) behind Vite's proxy. Driving fills the XP bar with pop-ups ("+46 XP · 1.4
// km", a new area, the day's bonus, a start spot); a level-up's burst says what it unlocked (three
// at most, a milestone's badge drawn small), and a look there opens the Garage, where it's on;
// before a nickname it's kept in the browser, said once at the first level-up, and claimed by the
// nickname; the profile card, the whole track and the title picker; a title on the leaderboard's
// rows and over the car on another page driving with it; the Garage's chips ("Lv 7 · or Pass",
// "Pass", "Lv 25"); a report on its way (the day's bonus and a new area said once, the level
// steady), one whose answer was lost sent again and counted once, and a backlog of areas sent a
// report's worth at a time; with the pass, its looks unlocked and the level-only ones still not, a
// level-up that says they're the supporter's already, and a supporter's report earning ×1.5; the
// cars levels bring (locked before their level, saying which, and driven from it; a level-up that
// brings one, opening the Garage on it; with the pass, all of them at once; the pass's own cars
// never, whatever the level); a phone (the level-up clear of the buttons); and no Worker at all
// (the dev server alone), still levels, kept in the browser. Pictures of each at 1280 × 720 and on
// a 375 × 740 touch screen.
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
import { LEVEL_XP, RIDES, XP, areaOf, levelOf, nextReward, rewardsAt, rewardsBetween } from '../src/drive-app/levels.js';
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
// `player` if any; base: the Vite to use (ALONE: no Worker); xp: what this browser has driven
// already (kept before a nickname), as it loads.
async function levelsPage( { visit = null, live = false, player = null, touch = false, viewport = touch ? PHONE : DESK, query = '', base = BASE, xp = null } = {} ) {

	const context = await browser.newContext( { viewport, hasTouch: touch, isMobile: touch } );
	await context.addInitScript( ( { visit, live, player, xp } ) => {

		if ( xp !== null ) localStorage.setItem( 'world-drive.progress', JSON.stringify( { local: { xp } } ) );
		if ( visit ) window.worldDriveVisitTest = { visit };
		if ( live ) window.worldDriveLiveTest = { visit };
		localStorage.setItem( 'world-drive.pads', 'off' );
		// The go-kart, as before the pickup (219,000 triangles, slow in the software renderer) was the
		// default, unless a ride is picked already.
		if ( ! localStorage.getItem( 'world-drive.vehicle' ) ) localStorage.setItem( 'world-drive.vehicle', 'go-kart' );
		if ( player && ! localStorage.getItem( 'world-drive.player' ) ) localStorage.setItem( 'world-drive.player', JSON.stringify( player ) );
		// Every pop-up's words, however briefly it showed.
		window.popTexts = [];
		new MutationObserver( records => {

			for ( const record of records ) for ( const node of record.addedNodes ) if ( node.classList?.contains( 'xp-pop' ) ) window.popTexts.push( node.textContent );

		} ).observe( document, { childList: true, subtree: true } );

	}, { visit, live, player: player && { id: player.id, secret: player.secret, name: player.name }, xp } );
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
const today = () => new Date().toISOString().slice( 0, 10 );
// What the page counts as said: pop-ups with these words.
const said = ( page, words ) => page.evaluate( words => window.popTexts.filter( text => text.startsWith( words ) ).length, words );
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
		// Level 2 with the start spot, 100 m in: its burst is held up for the next test by the pointer
		// on it, as it is for anyone reading it.
		await page.waitForFunction( () => window.drive.progress.level === 2, null, { timeout: 30000 } );
		await page.locator( '#level-up button.reward', { hasText: 'Sunburst paint' } ).hover();
		// Driving on: the spot after 100 m, the day's bonus after 250 m, the area after a km, and
		// what's driven every 10 s.
		await page.waitForFunction( () => window.popTexts.some( text => text.startsWith( 'New area' ) ) && window.popTexts.some( text => /^\+\d+ XP · \d+\.\d km/.test( text ) ), null, { timeout: 90000 } );
		const pops = await page.evaluate( () => window.popTexts );
		for ( const words of [ `Furka Pass +${ XP.spot } XP`, `New area +${ XP.area } XP`, `Daily bonus +${ XP.daily } XP` ] ) assert.ok( pops.includes( words ), `${ words }: ${ pops }` );
		await shot( page, 'levels-0-bar' );
		// The bar: the level and on into it.
		const { level } = await shown( page );
		assert.ok( level >= 2, `level ${ level }` );
		assert.equal( await page.locator( '#drive-ui .xp-level' ).textContent(), `Lv ${ level }` );
		const width = await page.locator( '#drive-ui .xp-hud .xp-bar i' ).evaluate( i => parseFloat( i.style.width ) );
		assert.ok( width >= 0 && width < 100, `${ width }` );
		assert.match( await page.locator( '#drive-ui .xp-count' ).textContent(), new RegExp( `^\\d+ / ${ LEVEL_XP[ level + 1 ] - LEVEL_XP[ level ] } XP$` ) );
		assert.deepEqual( page.errors, [] );

	} );

	test( 'a level-up says what it unlocked, once that there\'s no nickname; its look opens the Garage, and it\'s there', async () => {

		const card = page.locator( '#level-up' );
		await card.waitFor();
		assert.equal( await card.locator( '.heading' ).textContent(), 'Level 2!' );
		// Its reward, the Sunburst paint, a way to the Garage that says so.
		assert.deepEqual( await card.locator( 'button.reward' ).allTextContents(), rewardsAt( 2 ).map( r => r.name ) );
		assert.equal( await card.locator( 'button.reward' ).getAttribute( 'aria-label' ), 'Try Sunburst paint on in the Garage' );
		assert.ok( await card.locator( '.nickname' ).isVisible(), 'no "Pick a nickname"' );
		await shot( page, 'levels-1-level-up' );
		await card.locator( 'button.reward', { hasText: 'Sunburst paint' } ).click();
		const garage = page.locator( '#garage' );
		await garage.waitFor();
		assert.equal( await page.evaluate( () => window.drive.mode ), 'paused' );
		// The sunburst paint is unlocked, and worn once picked (and said to be, aria-pressed).
		const sunburst = garage.locator( '[data-part="colour"] .choice[data-id="sunburst"]' );
		assert.equal( await sunburst.evaluate( b => b.classList.contains( 'locked' ) ), false );
		await sunburst.click();
		assert.equal( await sunburst.evaluate( b => b.classList.contains( 'on' ) ), true );
		assert.equal( await sunburst.getAttribute( 'aria-pressed' ), 'true' );
		assert.equal( await garage.locator( '[data-part="colour"] .choice[data-id="blaze"]' ).getAttribute( 'aria-pressed' ), 'false' );
		await page.locator( '#garage .done' ).click();
		await page.locator( '#pause .resume' ).click();
		assert.equal( await page.evaluate( () => JSON.parse( localStorage.getItem( 'world-drive.garage' ) )[ 'go-kart' ].colour ), 'sunburst' );
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
		assert.equal( await chip( 'colour', 'sunburst' ), '' );
		assert.equal( await garage.locator( '[data-part="colour"] .choice[data-id="teal"]' ).getAttribute( 'title' ), 'Teal: unlocks at level 11, or with the Supporter Pass' );
		await shot( page, 'levels-2-garage' );
		// A level-only colour says which level; the pass's sheet doesn't open for it.
		await garage.locator( '[data-part="colour"] .choice[data-id="copper"]' ).click();
		assert.equal( await garage.locator( '.level-note' ).textContent(), `Copper comes at level 25: you're level ${ ( await shown( page ) ).level }. Drive on!` );
		assert.equal( await page.locator( '#pass' ).isVisible(), false );
		// One the pass unlocks opens it.
		await garage.locator( '[data-part="boost"] .choice[data-id="plasma"]' ).click();
		await page.locator( '#pass' ).waitFor();
		await page.locator( '#pass .close' ).click();
		await page.locator( '#garage .done' ).click();

	} );

	test( 'a milestone\'s level-up draws its badge reward small; a long one lists three and says how many more', async () => {

		await page.locator( '#pause .resume' ).click();
		await page.waitForFunction( () => window.drive.mode === 'driving' );
		const card = page.locator( '#level-up' );
		const levelUp = ( from, to ) => page.evaluate( event => {

			window.drive.profile.hideLevelUp();
			window.drive.profile.levelUp( event );

		}, { level: to, from, rewards: rewardsBetween( from, to ), nickname: false } );
		await levelUp( 9, 10 );
		await card.waitFor();
		assert.equal( await card.locator( '.heading' ).textContent(), 'Level 10!' );
		assert.deepEqual( await card.locator( '.reward' ).allTextContents(), [ '10Bronze badge' ] );
		// (Once it's come in: it springs a little past its size on the way.)
		await card.locator( '.level-card' ).evaluate( el => Promise.all( el.getAnimations().map( a => a.finished ) ) );
		const reward = await card.locator( '.unlocked .level-badge' ).boundingBox();
		const own = await card.locator( '.level-card > .level-badge' ).boundingBox();
		assert.ok( reward.width <= 22 && reward.height <= 22, JSON.stringify( reward ) );
		assert.ok( Math.abs( own.width - 54 ) <= 1, `${ own.width }` );
		await shot( page, 'levels-1b-level-10' );
		// Levels 4 to 12 at once: three, and the rest counted.
		await levelUp( 3, 12 );
		assert.equal( await card.locator( '.reward' ).count(), 3 );
		assert.equal( await card.locator( '.more' ).textContent(), `+${ rewardsBetween( 3, 12 ).length - 3 } more` );
		assert.deepEqual( await card.locator( '.reward.title' ).first().allTextContents(), [ 'Title:Joyrider' ] );
		await page.waitForTimeout( 600 );
		await shot( page, 'levels-1c-level-12' );
		// Clear of the trick callouts under it (a level-up often comes with a landed trick).
		await page.evaluate( () => window.drive.driver.hud.tricks( { lines: [ 'Backflip!', '360 Spin!' ], points: 1950, mult: 3, combo: true } ) );
		const box = await card.locator( '.level-card' ).boundingBox();
		const tricks = await page.locator( '#hud .dhud-tricks b' ).first().boundingBox();
		assert.ok( box.y + box.height <= tricks.y, `the card (${ box.y + box.height }) runs into the tricks (${ tricks.y })` );
		await page.evaluate( () => window.drive.profile.hideLevelUp() );
		await page.keyboard.press( 'Escape' );
		await page.waitForFunction( () => window.drive.mode === 'paused' );

	} );

	test( 'before a nickname it\'s kept in this browser; the nickname claims it', async () => {

		// Back on the globe: what was driven is added in here.
		await page.locator( '#pause .to-globe' ).click();
		await page.waitForFunction( () => window.drive.mode === 'globe' );
		const local = ( await stored( page ) ).local;
		assert.ok( local.xp >= LEVEL_XP[ 2 ], JSON.stringify( local ) );
		assert.ok( local.totals.km > 1 );
		// The day's bonus, kept apart for the claim.
		assert.deepEqual( [ local.bonus, local.streakDay, local.streak ], [ XP.daily, today(), 1 ] );
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
		assert.deepEqual( claim.sent.days, { xp: XP.daily, streak: 1, day: today() } );
		assert.equal( claim.sent.daily, false );
		const server = row( named.id );
		// The Worker works it out again, from what was driven: the same, give or take rounding.
		assert.ok( Math.abs( server.xp - before.xp ) <= 3, `${ server.xp } on the Worker, ${ before.xp } here` );
		assert.equal( ( await shown( page ) ).xp, server.xp );
		assert.equal( ( await shown( page ) ).level, levelOf( server.xp ) );
		// Today's bonus is had, so the next drive doesn't say it again.
		assert.equal( ( await stored( page ) ).server.streakDay, today() );
		await page.locator( '#leaderboard .close' ).click();
		assert.deepEqual( page.errors, [] );

	} );

	test( 'the profile card and the whole track', async () => {

		const profile = page.locator( '#globe-ui .profile' );
		const { level } = await shown( page );
		assert.equal( await profile.locator( '.name' ).textContent(), 'Level Racer' );
		assert.equal( await profile.locator( '.title' ).textContent(), `Lv ${ level } · Rookie` );
		assert.equal( await profile.locator( '.level-badge b' ).textContent(), String( level ) );
		assert.equal( await profile.locator( '.next' ).textContent(), `Next: ${ nextReward( level ).name } at Lv ${ nextReward( level ).level }` );
		assert.equal( await profile.locator( '.save-note' ).isVisible(), false );
		assert.ok( await profile.locator( '.title-pick' ).isVisible() );
		assert.deepEqual( await profile.locator( 'select option' ).allTextContents(), [ 'Newest (Rookie)', 'Rookie' ] );
		// None picked: "Newest" is.
		assert.equal( await profile.locator( 'select' ).inputValue(), '' );
		await shot( page, 'levels-4-profile' );
		await profile.locator( '.track-open' ).click();
		const track = page.locator( '#track' );
		await track.waitFor();
		assert.equal( await track.locator( 'li' ).count(), 50 );
		assert.equal( await track.locator( 'li.done' ).count(), level );
		assert.equal( await track.locator( 'li.next' ).getAttribute( 'data-level' ), String( level + 1 ) );
		assert.deepEqual( await track.locator( 'li[data-level="7"] .reward' ).allTextContents(), [ 'Plasma boostor ⭐ Pass' ] );
		assert.deepEqual( await track.locator( 'li[data-level="4"] .reward' ).allTextContents(), [ 'Title:Joyrider', 'Red flameor ⭐ Pass' ] );
		// Each level's XP on one line.
		const xp = await track.locator( 'li[data-level="30"] .level-head .xp' ).boundingBox();
		assert.ok( xp.height < 16, `${ xp.height }` );
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
		// None picked (the Worker resolves '' to Drifter for others, but the page keeps '' as picked).
		assert.equal( await select.inputValue(), '' );
		assert.equal( await page.evaluate( () => window.drive.progress.chosenTitle ), '' );
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

describe( 'World Drive levels: reports on their way', () => {

	test( 'while a report is on its way, the day\'s bonus and a new area are said once, and the level holds', async () => {

		const racer = await makePlayer( 'Flight Racer' );
		const page = await levelsPage( { visit: racer.visit, player: racer } );
		try {

			await dropIn( page );
			// The spot, the day's bonus and a new area, a km in.
			await page.waitForFunction( () => window.popTexts.some( text => text.startsWith( 'New area' ) ), null, { timeout: 90000 } );
			assert.equal( await said( page, 'Daily bonus' ), 1 );
			// A landed trick's boost isn't a drift boost.
			const drifts = await page.evaluate( () => window.drive.progress.unsent.drifts );
			await page.evaluate( () => {

				window.drive.driver.boost = { time: 0.5, speed: 1.2, name: 'Trick boost', left: 0.5 };

			} );
			await page.waitForTimeout( 300 );
			assert.equal( await page.evaluate( () => window.drive.progress.unsent.drifts ), drifts );
			// The report takes a second and a half to be answered, and the drive goes on meanwhile.
			await page.route( '**/api/progress', async route => {

				await new Promise( resolve => setTimeout( resolve, 1500 ) );
				await route.continue();

			} );
			const flight = await page.evaluate( async () => {

				const seen = [];
				let going = true;
				const look = () => {

					seen.push( { xp: window.drive.progress.progress.xp, level: window.drive.progress.level } );
					if ( going ) requestAnimationFrame( look );

				};
				look();
				await window.drive.progress.report();
				// And a few seconds after it (discoveries are looked for each second).
				await new Promise( resolve => setTimeout( resolve, 2500 ) );
				going = false;
				return { seen, flying: window.drive.progress.flying };

			} );
			await page.unroute( '**/api/progress' );
			assert.equal( await said( page, 'Daily bonus' ), 1, 'the day\'s bonus said again' );
			assert.equal( await said( page, 'New area' ), 1, 'the area said again' );
			assert.equal( flight.flying, null );
			// What's shown never went down (it goes on up as it's driven; the Worker's rounding may be a
			// point off the page's), nor did the level.
			for ( let i = 1; i < flight.seen.length; i ++ ) {

				assert.ok( flight.seen[ i ].xp >= flight.seen[ i - 1 ].xp - 1, `${ flight.seen[ i - 1 ].xp } then ${ flight.seen[ i ].xp }` );
				assert.ok( flight.seen[ i ].level >= flight.seen[ i - 1 ].level );

			}
			const answered = await until( () => page.reports.find( r => r.sent?.km > 0 ) );
			assert.equal( answered.status, 200 );
			assert.deepEqual( [ answered.sent.daily, answered.sent.spots, answered.sent.areas.length ], [ true, [ 'furka' ], 1 ] );
			assert.equal( ( await stored( page ) ).server.streakDay, today() );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

	test( 'a report whose answer was lost goes again with its id, after a reload too, and counts once', async () => {

		const racer = await makePlayer( 'Lost Answer' );
		const page = await levelsPage( { visit: racer.visit, player: racer } );
		try {

			// Two km driven, reported; the Worker takes it, but the answer never comes back.
			await page.route( '**/api/progress', async route => {

				await route.fetch();
				await route.abort();

			} );
			await page.evaluate( () => {

				Object.assign( window.drive.progress.unsent, { km: 2 } );
				return window.drive.progress.report();

			} );
			await page.unroute( '**/api/progress' );
			assert.equal( row( racer.id ).xp, 2 * XP.km );
			const flying = await page.evaluate( () => window.drive.progress.flying );
			assert.equal( flying.sent.km, 2 );
			// Still shown, and kept in the browser.
			assert.equal( ( await shown( page ) ).xp, 2 * XP.km );
			assert.equal( ( await stored( page ) ).flying.id, flying.id );
			// The page goes and comes back: as it starts, the report goes again, with its id.
			await page.reload();
			await page.locator( '#notice button', { hasText: 'Drive the test pad' } ).click();
			await page.waitForFunction( () => window.drive?.mode === 'globe' );
			await page.waitForFunction( () => window.drive.progress.flying === null, null, { timeout: 15000 } );
			const again = await until( () => page.reports.find( r => r.sent?.id === flying.id ) );
			assert.equal( again.status, 200 );
			assert.equal( again.body.repeated, true );
			assert.equal( row( racer.id ).xp, 2 * XP.km );
			assert.equal( ( await shown( page ) ).xp, 2 * XP.km );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

	test( 'a backlog of areas goes a report\'s worth at a time, the rest kept for the next', async () => {

		const racer = await makePlayer( 'Backlog Racer' );
		const page = await levelsPage( { visit: racer.visit, player: racer } );
		try {

			// 250 areas waiting (more than a report may list).
			const areas = [ ...new Set( Array.from( { length: 400 }, ( _, i ) => areaOf( - 60 + ( i % 20 ) * 0.5, - 170 + Math.floor( i / 20 ) * 0.5 ) ) ) ].slice( 0, 250 );
			assert.equal( areas.length, 250 );
			await page.evaluate( areas => {

				Object.assign( window.drive.progress.unsent, { km: 1, areas } );
				return window.drive.progress.report();

			}, areas );
			const sent = await until( () => page.reports.find( r => r.sent?.km > 0 ) );
			assert.equal( sent.status, 200 );
			assert.equal( sent.sent.areas.length, 200 );
			// The first report (an hour's worth) takes 60 places; the other 190 wait.
			assert.equal( sent.body.accepted.areas.length, 60 );
			assert.equal( await page.evaluate( () => window.drive.progress.unsent.areas.length ), 190 );
			assert.equal( row( racer.id ).xp, XP.km + 60 * XP.area );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

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
			// What's next is new to a supporter: not the Sunburst paint their pass has.
			assert.equal( await page.locator( '#globe-ui .profile .next' ).textContent(), 'Next: Joyrider at Lv 4' );
			await page.locator( '#globe-ui .profile .track-open' ).click();
			const track = page.locator( '#track' );
			await track.waitFor();
			assert.deepEqual( await track.locator( 'li[data-level="2"] .reward' ).allTextContents(), [ 'Sunburst paint✓ Pass' ] );
			assert.deepEqual( await track.locator( 'li[data-level="25"] .reward' ).allTextContents(), [ 'Copper paintLevels only' ] );
			await shot( page, 'levels-pass-track' );
			await track.locator( '.close' ).click();
			// The first answer says the Worker counts it ×1.5.
			await page.waitForFunction( () => window.drive.progress.supporter );
			await dropIn( page );
			await page.evaluate( () => window.drive.driver.release( 'KeyW' ) );
			// A level-up that brings only a look the pass has: no news, but it says so.
			const card = page.locator( '#level-up' );
			await page.evaluate( event => window.drive.profile.levelUp( event ), { level: 2, from: 1, rewards: rewardsAt( 2 ), nickname: false } );
			await card.waitFor();
			assert.equal( await card.locator( '.heading' ).textContent(), 'Level 2!' );
			assert.equal( await card.locator( '.unlocked' ).isVisible(), false );
			assert.equal( await card.locator( '.had' ).textContent(), 'Already yours with the pass: Sunburst paint' );
			// One that brings a title too: the title is news.
			await page.evaluate( event => {

				window.drive.profile.hideLevelUp();
				window.drive.profile.levelUp( event );

			}, { level: 4, from: 2, rewards: rewardsBetween( 2, 4 ), nickname: false } );
			assert.deepEqual( await card.locator( '.reward' ).allTextContents(), [ 'Title:Joyrider' ] );
			assert.equal( await card.locator( '.had' ).textContent(), 'Already yours with the pass: Hearts boost, Red flame' );
			await page.waitForTimeout( 600 );
			await shot( page, 'levels-pass-level-up' );
			await page.evaluate( () => window.drive.profile.hideLevelUp() );
			// Two km driven, as the page counts it, reported: ×1.5.
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
			assert.equal( last.gained, 2 * XP.km * 1.5 );
			assert.equal( row( fan.id ).xp, before + 2 * XP.km * 1.5 );
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

} );

describe( 'World Drive levels: the cars they bring', () => {

	// A page with no Worker whose browser has driven `xp` already (as kept before a nickname).
	async function at( xp, query = '' ) {

		return levelsPage( { base: ALONE, query, xp } );

	}

	const LEVEL_CARS = [ 'Golf cart', 'Tuk-tuk', 'Ice-cream van', 'Lawn tractor', 'Retro wedge', 'Formula racer' ];
	const card = ( page, name ) => page.locator( '#globe-ui .vehicle', { hasText: name } );

	test( 'a level\'s car is locked before it, says which, and drives from it; the level-up that brings it opens the Garage on it', async () => {

		const page = await at( LEVEL_XP[ 8 ] - 2 );
		try {

			assert.equal( ( await shown( page ) ).level, 7 );
			// The golf cart (level 5) is there to drive; the tuk-tuk (8) and later ones say their level.
			const locked = await page.locator( '#globe-ui .vehicle.locked b' ).allTextContents();
			assert.deepEqual( locked.filter( name => LEVEL_CARS.includes( name ) ), LEVEL_CARS.slice( 1 ) );
			assert.equal( await card( page, 'Golf cart' ).locator( '.level-chip' ).isVisible(), false );
			assert.equal( await card( page, 'Tuk-tuk' ).locator( '.level-chip' ).textContent(), 'Lv 8 · or Pass' );
			// Picked, it says which level (and that the pass has it), and the ride stays as it was.
			await card( page, 'Tuk-tuk' ).click();
			const note = page.locator( '#globe-ui .ride-note' );
			assert.equal( await note.textContent(), 'The tuk-tuk comes at level 8: you\'re level 7. Drive on, or get it now with the Supporter Pass.' );
			// In view, though it's under three rows of rides: the panel scrolled to it.
			assert.ok( await note.evaluate( element => element.getBoundingClientRect().bottom <= element.closest( '.panel' ).getBoundingClientRect().bottom ), 'the note is below the fold' );
			assert.equal( await page.locator( '#globe-ui .vehicle.picked b' ).textContent(), 'Go-kart' );
			await shot( page, 'levels-ride-locked' );
			await note.locator( 'button', { hasText: 'Supporter Pass' } ).click();
			await page.locator( '#pass' ).waitFor();
			await page.locator( '#pass .close' ).click();
			// The Garage shows it, locked, with its level on its tab.
			await page.locator( '#globe-ui .garage-open' ).click();
			const garage = page.locator( '#garage' );
			await garage.waitFor();
			assert.equal( await garage.locator( '.ride-tab', { hasText: 'Tuk-tuk' } ).locator( '.level-chip' ).textContent(), 'Lv 8' );
			await garage.locator( '.ride-tab', { hasText: 'Tuk-tuk' } ).click();
			assert.equal( await garage.locator( '.locked-banner span' ).textContent(), 'Comes at level 8, or with the ⭐ Supporter Pass' );
			await garage.locator( '.done' ).click();

			// The golf cart drives; a pad's XP makes level 8, and its level-up brings the tuk-tuk.
			await card( page, 'Golf cart' ).click();
			assert.equal( await page.locator( '#globe-ui .vehicle.picked b' ).textContent(), 'Golf cart' );
			await dropIn( page );
			assert.equal( await page.evaluate( () => window.drive.driver.entry.state.name ), 'Golf cart' );
			await page.evaluate( () => window.drive.progress.pad() );
			const levelUp = page.locator( '#level-up' );
			await levelUp.waitFor();
			assert.equal( await levelUp.locator( '.heading' ).textContent(), 'Level 8!' );
			assert.deepEqual( await levelUp.locator( '.reward' ).allTextContents(), [ 'Ride:Tuk-tuk', 'Title:Drifter' ] );
			assert.match( await levelUp.locator( '.reward.ride img' ).getAttribute( 'src' ), /\/cars\/thumbs\/tuk-tuk\.webp$/ );
			assert.equal( await levelUp.locator( 'button.reward.ride' ).getAttribute( 'aria-label' ), 'See the tuk-tuk in the Garage' );
			await page.waitForTimeout( 600 );
			await shot( page, 'levels-ride-level-up' );
			await levelUp.locator( 'button.reward.ride' ).click();
			await garage.waitFor();
			await page.waitForFunction( () => window.drive.garage.preview?.model?.name === 'Tuk-tuk', null, { timeout: 20000 } );
			assert.equal( await garage.locator( '.ride-tab[aria-pressed="true"]' ).getAttribute( 'data-id' ), 'tuk-tuk' );
			assert.equal( await garage.locator( '.ride-tab[aria-pressed="true"] .level-chip' ).isVisible(), false );
			assert.equal( await garage.locator( '.locked-banner' ).isVisible(), false );
			await garage.locator( '.done' ).click();
			// Unlocked in the pause menu too: driven from there.
			assert.equal( await page.locator( '#pause .vehicle.locked', { hasText: 'Tuk-tuk' } ).count(), 0 );
			await page.locator( '#pause .vehicle', { hasText: 'Tuk-tuk' } ).click();
			await page.waitForFunction( () => window.drive.mode === 'driving' && window.drive.driver.entry.state.name === 'Tuk-tuk', null, { timeout: 30000 } );
			await shot( page, 'levels-ride-driving' );
			// The track has it at 8.
			await page.evaluate( () => window.drive.toGlobe() );
			await page.locator( '#globe-ui .profile .track-open' ).click();
			assert.deepEqual( await page.locator( '#track li[data-level="8"] .reward' ).allTextContents(), [ 'Ride:Tuk-tukor ⭐ Pass', 'Title:Drifter' ] );
			assert.equal( await page.locator( '#globe-ui .profile .next' ).textContent(), `Next: Racing stripes at Lv 9` );
			await page.locator( '#track .close' ).click();
			assert.deepEqual( page.errors, [] );

		} finally {

			await page.context().close();

		}

	} );

	test( 'with the pass, every car at once; at the top level, the pass\'s own still not', async () => {

		const pass = await at( 0, '?pro=1' );
		try {

			assert.equal( await pass.locator( '#globe-ui .vehicle.locked' ).count(), 0 );
			assert.equal( await pass.locator( '#globe-ui .vehicle .level-chip:visible' ).count(), 0 );
			await card( pass, 'Formula racer' ).click();
			assert.equal( await pass.locator( '#globe-ui .vehicle.picked b' ).textContent(), 'Formula racer' );
			// A level-up that brings a car a supporter has: said to be theirs already.
			await dropIn( pass );
			await pass.evaluate( event => window.drive.profile.levelUp( event ), { level: 5, from: 4, rewards: rewardsAt( 5 ), nickname: false } );
			assert.equal( await pass.locator( '#level-up .had' ).textContent(), 'Already yours with the pass: Golf cart, Lime paint' );
			assert.deepEqual( pass.errors, [] );

		} finally {

			await pass.context().close();

		}

		const top = await at( LEVEL_XP[ 50 ] );
		try {

			assert.equal( ( await shown( top ) ).level, 50 );
			const locked = await top.locator( '#globe-ui .vehicle.locked b' ).allTextContents();
			assert.ok( LEVEL_CARS.every( name => ! locked.includes( name ) ), locked.join( ', ' ) );
			for ( const name of [ 'Hypercar', 'Cyber muscle' ] ) {

				assert.ok( locked.includes( name ), name );
				// Picked, the pass's sheet: no level brings it.
				await card( top, name ).click();
				await top.locator( '#pass' ).waitFor();
				await top.locator( '#pass .close' ).click();

			}

			assert.equal( await top.locator( '#globe-ui .ride-note' ).isVisible(), false );
			await shot( top, 'levels-ride-top' );
			assert.deepEqual( top.errors, [] );

		} finally {

			await top.context().close();

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
			// The card clear of the buttons on the right (FLY, BOOST, DRIFT, GAS), however long it is.
			const clear = async () => {

				const box = await page.locator( '#level-up .level-card' ).boundingBox();
				for ( const button of await page.locator( '#hud .dhud-touch button:visible' ).all() ) {

					const b = await button.boundingBox();
					const overlap = box.x < b.x + b.width && b.x < box.x + box.width && box.y < b.y + b.height && b.y < box.y + box.height;
					assert.ok( ! overlap, `the card ${ JSON.stringify( box ) } is over ${ await button.getAttribute( 'class' ) } ${ JSON.stringify( b ) }` );

				}

			};
			await clear();
			await page.evaluate( event => {

				window.drive.profile.hideLevelUp();
				window.drive.profile.levelUp( event );

			}, { level: 12, from: 1, rewards: rewardsBetween( 1, 12 ), nickname: true } );
			await page.waitForTimeout( 600 );
			await clear();
			await shot( page, 'levels-phone-1b-level-12' );
			await page.evaluate( () => window.drive.profile.hideLevelUp() );
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
