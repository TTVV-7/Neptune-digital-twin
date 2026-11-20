import './style.css';
import { getConfig, postVisit, robotCheck, send } from './api.js';
import * as screens from './screens.js';
import { EARTH, FALLBACK, listOf, OFF_EARTH, onWorld, spotWorld } from './worlds.js';

// World Drive's first script (docs/world-drive.md): the splash, the Worker's settings and the robot
// check, while the game itself (main.js: three.js, the tiles, the driving, nearly all of the page's
// code) comes down beside them rather than before them; then the visit (the globe's, free: no Maps
// key). So the splash and what World Drive is show at once, the robot check runs while the game
// loads, and the globe is up as soon as both are done and the visit's answered. The Earth's drive
// (the Maps key, one of the day's Earth drives) is asked for later, only when the page first drives
// on the Earth (earthVisit).

// Only the dev server has this (vite.drive.config.js): a key from the environment, for driving on
// Google's tiles without the Worker. The built site always asks the Worker.
const DEV_KEY = __DEV_MAPS_KEY__;
// What a failed download of the game's code says, in Chromium, Firefox and Safari, and Vite's own
// when a chunk's styles don't come: a connection's fault, unlike an error in the code itself.
const NOT_LOADED = /dynamically imported module|Importing a module script failed|Unable to preload|Failed to fetch/i;
// How long (ms) the visit waits, after the robot check, for a challenge link's answer, to know its
// world (it's asked for beside the check, so it's nearly always there by then); one slower than that
// opens its card when it comes, on the world the visit took (the Earth, for want of knowing).
const LINK_WAIT = 4000;

const $ = id => document.getElementById( id );
// Without WebGL 2 (which three.js needs) there's no game to load, nor a visit to spend on it.
const webgl = hasWebGL();
const game = webgl ? import( './main.js' ) : null;
// Caught where it's waited for (start, visit); this only keeps a failed load from being reported twice.
game?.catch( () => {} );

boot();

async function boot() {

	if ( ! webgl ) return noWebGL();
	screens.splash( 'Warming up the engine...' );
	const config = await getConfig();
	// The Vite dev server on its own: a key from the environment, or the test globe.
	if ( ! config ) return start( { key: DEV_KEY || null, worker: false } );
	// (Maps off: the test pad, a challenge link's card over it all the same.)
	if ( ! config.mapsOn ) return screens.notice( 'resting', { onTestPad: () => start( { key: null, googleClientId: config.googleClientId, passwords: config.passwords === true, turnstileSiteKey: config.turnstileSiteKey, live: !! config.live, liveReason: config.liveReason, liveMoon: config.liveMoon ?? null, liveMoonReason: config.liveMoonReason ?? '', liveWorlds: config.liveWorlds ?? null, adsense: config.adsense ?? null, challengeLink: challengeLink() } ) } );
	visit( config );

}

// A "challenge a friend" link (/c?challenge=<id>&vs=<handle>, or the same at /): what the Worker
// says of it, asked for once, as the page starts, beside the robot check: a promise of { link:
// { challenge, vs } as the address has them, answer: send's (its body { challenge, vs }) }, or of
// null for no link. Its world is the visit's (a Moon challenge's spends none of the day's Earth
// drives, as a link to the Moon doesn't), and the game opens it (main.js, challenges.js).
let linkAsked = null;
function challengeLink() {

	if ( linkAsked ) return linkAsked;
	const params = new URLSearchParams( location.search );
	const id = Number( params.get( 'challenge' ) );
	if ( ! Number.isSafeInteger( id ) || id < 1 ) return linkAsked = Promise.resolve( null );
	const vs = params.get( 'vs' );
	linkAsked = send( 'GET', `/api/challenges/link?challenge=${ id }${ vs ? `&vs=${ encodeURIComponent( vs ) }` : '' }` ).then( answer => ( { link: { challenge: id, vs }, answer } ) );
	return linkAsked;

}

// The link's answer (challengeLink's), or null if it hasn't come within LINK_WAIT (the Earth, then).
function linkWithin() {

	return Promise.race( [ challengeLink(), new Promise( resolve => setTimeout( () => resolve( null ), LINK_WAIT ) ) ] );

}

// The game, once its code is here (main.js's start, with the visit's key and settings).
async function start( options ) {

	let main;
	try {

		main = await game;

	} catch ( err ) {

		return loadFailed( err );

	}

	run( main, options );

}

// A start that fails (WebGL there when looked for, but no context to be had after all) says so,
// rather than leaving a blank page.
function run( main, options ) {

	return main.start( options ).catch( err => {

		console.error( err );
		const message = /WebGL/i.test( err?.message ?? '' )
			? 'World Drive couldn\'t start in this browser. It needs 3D graphics (WebGL): try another browser, or turn on hardware acceleration in this one.'
			: 'World Drive couldn\'t start. Try again in a moment.';
		screens.notice( 'error', { message, onRetry: () => window.location.reload() } );

	} );

}

// The game's code didn't come (a dropped connection), or it broke as it ran (an older browser).
function loadFailed( err ) {

	console.error( err );
	const message = NOT_LOADED.test( err?.message ?? '' )
		? 'World Drive didn\'t finish loading. Check your connection and try again.'
		: 'World Drive couldn\'t start in this browser. Try another browser, or update this one.';
	screens.notice( 'error', { message, onRetry: () => window.location.reload() } );

}

// Once per page load: the robot check, then this visit: the globe's (globe: true), which costs
// nothing and is never limited, or a link's to another world, the same. Neither is one of the day's
// Earth drives: the page asks for that (earthVisit) only when it first drives on the Earth, a Drive
// here there, a Join or Go to a friend there, an Earth challenge's start, a link to an Earth place or
// challenge as much as anything else (they only fly the globe there, or open the challenge's card).
// So the Google session it pays for goes only to pages that drive on the Earth, where the globe it
// was spent on used to cost one a page. It's still only asked for once the game's code is here too
// (a download that fails, and each Try again after it, is asked nothing); the two come down side by
// side, and whichever fails first says so.
async function visit( config ) {

	screens.splash( 'Checking the road is clear...' );
	challengeLink();
	const checked = robotCheck( config.turnstileSiteKey, $( 'robot-check' ) ).then( token => ( { token } ), () => ( { robot: true } ) );
	const loaded = game.then( main => ( { main } ), err => ( { err } ) );
	const first = await Promise.race( [ checked, loaded ] );
	if ( first.robot ) return screens.notice( 'robot', { onRetry: () => visit( config ) } );
	if ( first.err ) return loadFailed( first.err );
	const [ { token, robot }, { main, err } ] = await Promise.all( [ checked, loaded ] );
	if ( robot ) return screens.notice( 'robot', { onRetry: () => visit( config ) } );
	if ( err ) return loadFailed( err );

	const challenge = await linkWithin();
	const linkedWorld = opensOffEarth( location.search ) ?? offEarth( challenge?.answer.body?.challenge?.world );
	const outcome = await postVisit( token, linkedWorld ? { world: linkedWorld } : { globe: true } );
	// (The link's answer as it comes, if it hadn't within LINK_WAIT.)
	const settings = { googleClientId: config.googleClientId, passwords: config.passwords === true, turnstileSiteKey: config.turnstileSiteKey, live: !! config.live, liveReason: config.liveReason, liveMoon: config.liveMoon ?? null, liveMoonReason: config.liveMoonReason ?? '', liveWorlds: config.liveWorlds ?? null, adsense: config.adsense ?? null, challengeLink: challengeLink() };
	// (A Worker from before the globe's visit takes it for an Earth visit: the key now, as it was.)
	if ( outcome.key ) return run( main, { key: outcome.key, left: outcome.left, visit: outcome.visit, ...settings } );
	// The globe, or a link to another world (a challenge's there too) opening on that world: none of
	// the day's Earth drives spent, and one asked for when the page drives on the Earth.
	if ( outcome.free ) {

		let game = null;
		const started = run( main, { key: null, visit: outcome.visit, ...settings, earthVisit: earthVisit( config, () => game ), opensOn: linkedWorld } );
		started.then( handle => game = handle ?? null );
		return started;

	}

	if ( outcome.usedUp ) return usedUp( config, outcome, main, challengeLink() );
	if ( outcome.robot ) return screens.notice( 'robot', { onRetry: () => visit( config ) } );
	screens.notice( 'error', { message: outcome.error, onRetry: () => visit( config ) } );

}

// The world a link opens on, if it's one of the worlds made in the page (worlds.js): a spot's
// ?spot=moon-..., ?spot=vesta-... and so on, or ?at= with world=moon, world=vesta and so on
// (places.js's linkedPlace); else null.
function opensOffEarth( search ) {

	const params = new URLSearchParams( search );
	return spotWorld( params.get( 'spot' ) ) ?? ( params.has( 'at' ) ? offEarth( params.get( 'world' ) ) : null );

}

// `id` if it's one of the worlds made in the page, else null.
function offEarth( id ) {

	return OFF_EARTH.includes( id ) ? id : null;

}

// The Earth's drive for a page on the globe (main.js's earthVisit, called by its openEarth the first
// time the page drives on the Earth, and never again once it's had a key): the robot check again
// (Turnstile's tokens are good for one ask each; its widget, if it needs a click, in the drop-in's
// loading card, which is up meanwhile), then POST /api/visit as an Earth drive for a page already
// counted as a visit (fromGlobe). Resolves { key, left, visit }, or null with a word on why: over a
// cap, the used-up notice (usedUpNotice, as for a page opened over one), its button turning the globe
// to the Moon (game(): main.js's handle, once it has started); the check or the Worker failing, a
// toast, to try Drive here again. Over a cap, a Drive here again before the caps start afresh shows
// the notice again without asking (the Worker would only say the same); a supporter signing in in it
// (the visitor's own drive used up, with signing in set up) has it asked for again, by their account.
function earthVisit( config, game ) {

	let refused = null;
	const accounts = !! ( config.googleClientId || config.passwords === true );
	const turnedAway = async outcome => {

		refused = { outcome, until: Date.now() + outcome.retryAfter * 1000 };
		const pitch = game()?.pitchPass;
		usedUpNotice( outcome, { world: FALLBACK, onMoon: () => game()?.setWorld( FALLBACK ), onPass: accounts && pitch ? () => pitch() : undefined } );
		// (The sign-in: with signing in set up, over either cap, as usedUp's; a supporter's drives are
		// their account's.)
		if ( ! accounts ) return;
		let supporter;
		try {

			// (Already here: it comes with the game's code.)
			supporter = await import( './supporter.js' );

		} catch ( err ) {

			console.error( err );
			return;

		}

		supporter.fillAccountArea( $( 'notice' ).querySelector( '.account' ) );
		// A supporter here already has had their 10 today; anyone else signing in with the pass (or
		// getting it) is a supporter whose drives are their account's: asked again at the next Drive here.
		const setUp = onPass => supporter.setUpSupporter( { worker: true, googleClientId: config.googleClientId, passwords: config.passwords === true, turnstileSiteKey: config.turnstileSiteKey, onPass } );
		if ( setUp( null )?.me?.supporter ) return;
		setUp( () => {

			refused = null;
			$( 'notice' ).hidden = true;
			screens.toast( 'You have the Supporter Pass: press Drive here again for your Earth drive.', 8000 );

		} );

	};

	return async () => {

		if ( refused && Date.now() < refused.until ) {

			turnedAway( refused.outcome );
			return null;

		}

		let token;
		try {

			token = await robotCheck( config.turnstileSiteKey, $( 'loading' ).querySelector( '.robot-check' ) );

		} catch {

			screens.toast( 'The quick robot check didn\'t go through, so the 3D Earth didn\'t open. Try Drive here again (it can help to turn off a blocker for this site).', 9000 );
			return null;

		}

		const outcome = await postVisit( token, { fromGlobe: true } );
		if ( outcome.key ) return outcome;
		if ( outcome.usedUp ) {

			turnedAway( outcome );
			return null;

		}

		screens.toast( outcome.robot ? 'The quick robot check didn\'t go through, so the 3D Earth didn\'t open. Try Drive here again.' : `${ outcome.error } Try Drive here again.`, 9000 );
		return null;

	};

}

// The used-up notice (screens.js's 'used-up'), wherever today's Earth drives turn out to be used up:
// a page whose visit was turned away as it loaded (usedUp) and a Drive here on the Earth turned away
// (earthVisit). outcome: postVisit's { retryAfter, reason }; world: the free world its button names,
// onMoon what it does; onPass, with signing in set up, its "Get more Earth drives" (main.js's
// pitchPass: the pass's sheet).
function usedUpNotice( { retryAfter, reason }, { world, onMoon, onPass } ) {

	screens.notice( 'used-up', { retryAfter, reason, world, onMoon, onPass } );

}

// Today's Earth drives are used up (this visitor's free one, or everyone's for the day). The other
// worlds (the Moon, Mars, Vesta and Ceres) are ours to stream and cost nothing, so they're never
// limited: the game starts on the Moon at once, on the Moon's globe with the Earth closed (main.js's
// earthClosed; the others are a tap away), and a toast says why. Picking the Earth shows the used-up
// notice, with its countdown and a way back to the Moon. A supporter's drives (a day pass's too) are
// counted by their account, not this address (10 a day), and the day's cap for everyone doesn't
// turn them away, so with signing in set up that notice has a sign-in too, and the pitch: this is
// the moment someone wants more of the Earth, so the toast and the notice both offer "Get more Earth
// drives" (the pass's sheet: 24 hours, or for good). A supporter on a new browser, or back from
// paying (?supporter=thanks, supporter.js, or the tab they paid in closed), would otherwise be stuck
// on the Moon until tomorrow. Once the account here has the pass (signing in there, paying, or the
// page's own first word on it), the page reloads to ask for the visit again: once, so a supporter
// who has had their 10 stays on the Moon rather than reloading round and round.
// (supporter.js comes with the game's code, so it's waited for here.)
async function usedUp( config, outcome, main, link = null ) {

	const { retryAfter, reason } = outcome;
	// The notice's sign-in and the pitch: only with signing in set up (a pass is an account's).
	const accounts = !! ( config.googleClientId || config.passwords === true );
	const watch = accounts && ! askedAgain();
	let supporter = null;
	const again = () => {

		markAskedAgain();
		location.reload();

	};
	const watchForPass = () => {

		if ( ! watch || ! supporter ) return;
		const handle = supporter.setUpSupporter( { worker: true, googleClientId: config.googleClientId, passwords: config.passwords === true, turnstileSiteKey: config.turnstileSiteKey, onPass: again } );
		// The pass already known here (it came after the visit was counted): at once.
		if ( handle?.me?.supporter ) again();

	};
	// (The game, once it has started: which world it's on names the notice's way back there.)
	let game = null;
	const earthClosed = () => {

		usedUpNotice( outcome, { world: game?.world ?? FALLBACK, onMoon: () => {}, onPass: accounts && game?.pitchPass ? () => game.pitchPass() : undefined } );
		if ( ! supporter ) return;
		watchForPass();
		supporter.fillAccountArea( $( 'notice' ).querySelector( '.account' ) );

	};
	const started = run( main, {
		key: null, visit: outcome.visit, googleClientId: config.googleClientId, passwords: config.passwords === true, turnstileSiteKey: config.turnstileSiteKey, live: !! config.live, liveReason: config.liveReason, liveMoon: config.liveMoon ?? null, liveMoonReason: config.liveMoonReason ?? '', liveWorlds: config.liveWorlds ?? null, adsense: config.adsense ?? null, challengeLink: link,
		earthClosed: { onEarth: earthClosed },
	} );
	// Once the globe has turned to the Moon (it loads after the game starts), so it's read with the
	// Moon in view rather than running out over the splash; named by the world it's on by then (Mars,
	// say, picked before the Moon had loaded), and the others listed as free too.
	started.then( started => {

		game = started;
		if ( ! game ) return;
		onceOffEarth( game, () => {

			const here = game.world;
			const others = OFF_EARTH.filter( id => id !== here );
			const free = `so you're ${ onWorld( here ) }: free and unlimited, as ${ listOf( others ) } ${ others.length > 1 ? 'are' : 'is' }. The Earth opens again tomorrow.`;
			const more = accounts && game.pitchPass ? { label: 'Get more Earth drives', onClick: () => game.pitchPass() } : null;
			screens.toast( reason === 'daily' ? `Today's free Earth drives are all taken, ${ free }` : `You've had today's free Earth drive, ${ free }`, more ? 15000 : 10000, more );

		} );

	} );
	if ( ! accounts ) return;
	try {

		supporter = await import( './supporter.js' );

	} catch ( err ) {

		// The notice goes without its sign-in.
		console.error( err );
		return;

	}

	// After the game has set up the pass's sign-in itself (which clears onPass), so a supporter whose
	// account here has the pass (or gets it: back from paying) is sent back to the Earth.
	if ( await started ) watchForPass();

}

// fn() once the game's globe is on another world (looked at a few times a second, for up to two
// minutes: a world that doesn't load says so itself).
function onceOffEarth( game, fn ) {

	const since = Date.now();
	const look = () => {

		if ( game.world !== EARTH ) return fn();
		if ( Date.now() - since < 120000 ) setTimeout( look, 250 );

	};
	look();

}

// Whether the page has already reloaded once to ask for the visit as a supporter's (see usedUp),
// this tab: kept for the tab's session, as the reload starts the page afresh.
const ASKED_AGAIN = 'world-drive-asked-as-supporter';

function askedAgain() {

	try {

		return sessionStorage.getItem( ASKED_AGAIN ) === String( new Date().toISOString().slice( 0, 10 ) );

	} catch {

		return false;

	}

}

function markAskedAgain() {

	try {

		sessionStorage.setItem( ASKED_AGAIN, String( new Date().toISOString().slice( 0, 10 ) ) );

	} catch {

		// Without storage, a supporter past their 30 could reload once more each time; no worse.

	}

}

// Whether this browser can draw the game: WebGL 2, which three.js needs. The context made to find
// out is let go of at once.
function hasWebGL() {

	try {

		const gl = document.createElement( 'canvas' ).getContext( 'webgl2' );
		gl?.getExtension( 'WEBGL_lose_context' )?.loseContext();
		return !! gl;

	} catch {

		return false;

	}

}

// No WebGL (turned off, blocked, or a crawler's renderer: Google's has none): no visit, and instead
// of the globe the panel's words about World Drive (drive/index.html's .site-info), with a line on
// why there's no globe. Only those words show on the panel (style.css, body.no-webgl).
function noWebGL() {

	screens.hideSplash();
	document.body.classList.add( 'no-webgl' );
	const ui = $( 'globe-ui' );
	const note = Object.assign( document.createElement( 'p' ), {
		className: 'no-webgl-note',
		textContent: 'World Drive needs 3D graphics (WebGL), which this browser has turned off or doesn\'t have, so there\'s no globe to drive from here. Try another browser, or turn on hardware acceleration in this one.',
	} );
	ui.querySelector( '.intro' ).after( note );
	ui.querySelector( '.about-open' ).addEventListener( 'click', () => $( 'about' ).showModal() );
	ui.hidden = false;

}
