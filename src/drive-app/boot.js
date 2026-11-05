import './style.css';
import { getConfig, postVisit, robotCheck } from './api.js';
import * as screens from './screens.js';

// World Drive's first script (docs/world-drive.md): the splash, the Worker's settings and the robot
// check, while the game itself (main.js: three.js, the tiles, the driving, nearly all of the page's
// code) comes down beside them rather than before them; then the visit (the Maps key). So the
// splash and what World Drive is show at once, the robot check runs while the game loads, and the
// globe is up as soon as both are done and the visit's answered.

// Only the dev server has this (vite.drive.config.js): a key from the environment, for driving on
// Google's tiles without the Worker. The built site always asks the Worker.
const DEV_KEY = __DEV_MAPS_KEY__;
// What a failed download of the game's code says, in Chromium, Firefox and Safari, and Vite's own
// when a chunk's styles don't come: a connection's fault, unlike an error in the code itself.
const NOT_LOADED = /dynamically imported module|Importing a module script failed|Unable to preload|Failed to fetch/i;

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
	if ( ! config.mapsOn ) return screens.notice( 'resting', { onTestPad: () => start( { key: null, googleClientId: config.googleClientId, live: !! config.live, liveReason: config.liveReason } ) } );
	visit( config );

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

	main.start( options ).catch( err => {

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

// Once per page load: the robot check, then the Maps key for this visit. The visit is one of the
// day's drives (the visitor's and everyone's), so it's only asked for once the game's code is here
// too: a download that fails, and each Try again after it, spends none. The two come down side by
// side, and whichever fails first says so.
async function visit( config ) {

	screens.splash( 'Checking the road is clear...' );
	const checked = robotCheck( config.turnstileSiteKey, $( 'robot-check' ) ).then( token => ( { token } ), () => ( { robot: true } ) );
	const loaded = game.then( main => ( { main } ), err => ( { err } ) );
	const first = await Promise.race( [ checked, loaded ] );
	if ( first.robot ) return screens.notice( 'robot', { onRetry: () => visit( config ) } );
	if ( first.err ) return loadFailed( first.err );
	const [ { token, robot }, { main, err } ] = await Promise.all( [ checked, loaded ] );
	if ( robot ) return screens.notice( 'robot', { onRetry: () => visit( config ) } );
	if ( err ) return loadFailed( err );

	const outcome = await postVisit( token );
	if ( outcome.key ) return run( main, { key: outcome.key, left: outcome.left, visit: outcome.visit, googleClientId: config.googleClientId, live: !! config.live, liveReason: config.liveReason } );
	if ( outcome.usedUp ) return usedUp( config, outcome );
	if ( outcome.robot ) return screens.notice( 'robot', { onRetry: () => visit( config ) } );
	screens.notice( 'error', { message: outcome.error, onRetry: () => visit( config ) } );

}

// Whether the visit has been asked for again as a supporter's (see usedUp).
let askedAsSupporter = false;

// Today's drives are used up. A supporter's are counted by their account, not this address (30 a
// day), so with signing in set up the screen has a sign-in too: a supporter on a new browser, or
// back from paying before Stripe's word arrived (?supporter=thanks, supporter.js), would otherwise be
// stuck here until tomorrow. Once the account here has the pass, the visit is asked for again: once,
// so a supporter who has had their 30 sees this screen rather than asking round and round.
// (supporter.js comes with the game's code, so it's waited for here.)
async function usedUp( config, { retryAfter, reason } ) {

	screens.notice( 'used-up', { retryAfter } );
	if ( reason !== 'visitor' || ! config.googleClientId ) return;
	let supporter;
	try {

		supporter = await import( './supporter.js' );

	} catch ( err ) {

		// The screen stays, without its sign-in.
		console.error( err );
		return;

	}

	const again = () => {

		askedAsSupporter = true;
		$( 'notice' ).hidden = true;
		visit( config );

	};
	supporter.setUpSupporter( { worker: true, googleClientId: config.googleClientId, onPass: askedAsSupporter ? null : again } );
	supporter.fillAccountArea( $( 'notice' ).querySelector( '.account' ) );

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
