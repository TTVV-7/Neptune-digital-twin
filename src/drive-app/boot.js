import './style.css';
import { getConfig, postVisit, robotCheck, send } from './api.js';
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
	if ( ! config.mapsOn ) return screens.notice( 'resting', { onTestPad: () => start( { key: null, googleClientId: config.googleClientId, passwords: config.passwords === true, turnstileSiteKey: config.turnstileSiteKey, live: !! config.live, liveReason: config.liveReason, challengeLink: challengeLink() } ) } );
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
	const moonLink = opensOnMoon( location.search ) || challenge?.answer.body?.challenge?.world === 'moon';
	const outcome = await postVisit( token, { world: moonLink ? 'moon' : 'earth' } );
	// (The link's answer as it comes, if it hadn't within LINK_WAIT.)
	const settings = { googleClientId: config.googleClientId, passwords: config.passwords === true, turnstileSiteKey: config.turnstileSiteKey, live: !! config.live, liveReason: config.liveReason, challengeLink: challengeLink() };
	if ( outcome.key ) return run( main, { key: outcome.key, left: outcome.left, visit: outcome.visit, ...settings } );
	// A link to the Moon (a Moon challenge's too): on the Moon, with none of the day's Earth drives
	// spent. The Earth is a reload away (without the link, so that one does ask for a drive).
	if ( outcome.moon ) return run( main, { key: null, visit: outcome.visit, ...settings, moonOnly: { onEarth: toEarth } } );
	if ( outcome.usedUp ) return usedUp( config, outcome, main, challengeLink() );
	if ( outcome.robot ) return screens.notice( 'robot', { onRetry: () => visit( config ) } );
	screens.notice( 'error', { message: outcome.error, onRetry: () => visit( config ) } );

}

// Whether the visit has been asked for again as a supporter's (see usedUp).
let askedAsSupporter = false;
// Whether the game has started on the Moon from the used-up notice (see usedUp).
let onMoonOnly = false;

// A link to the Moon (a Moon spot's ?spot=moon-..., or ?at= with world=moon; places.js's linkedPlace).
function opensOnMoon( search ) {

	const params = new URLSearchParams( search );
	return ( params.get( 'spot' ) ?? '' ).startsWith( 'moon-' ) || ( params.has( 'at' ) && params.get( 'world' ) === 'moon' );

}

// From a page opened on the Moon by a link, to the Earth: the same page without the link (at /, a
// challenge link's /c too), which asks for one of the day's drives as it loads (a ?party= stays).
function toEarth() {

	const url = new URL( location.href );
	url.pathname = '/';
	for ( const name of [ 'spot', 'at', 'name', 'region', 'heading', 'world', 'challenge', 'vs' ] ) url.searchParams.delete( name );
	location.assign( url );

}

// Today's Earth drives are used up. The Moon is ours to stream and costs nothing, so it's never
// limited: the notice offers it, and the game starts there with the Earth closed (main.js's
// moonOnly); picking the Earth shows this notice again. A supporter's drives are counted by their
// account, not this address (30 a day), so with signing in set up the screen has a sign-in too: a
// supporter on a new browser, or back from paying before Stripe's word arrived (?supporter=thanks,
// supporter.js), would otherwise be stuck here until tomorrow. Once the account here has the pass,
// the visit is asked for again: once, so a supporter who has had their 30 sees this screen rather
// than asking round and round (a reload, if the game's already going on the Moon).
// (supporter.js comes with the game's code, so it's waited for here.)
async function usedUp( config, outcome, main, link = null ) {

	const { retryAfter, reason } = outcome;
	const toMoon = () => {

		if ( onMoonOnly ) return;
		onMoonOnly = true;
		run( main, {
			key: null, visit: outcome.visit, googleClientId: config.googleClientId, passwords: config.passwords === true, turnstileSiteKey: config.turnstileSiteKey, live: !! config.live, liveReason: config.liveReason, challengeLink: link,
			moonOnly: { onEarth: () => usedUp( config, outcome, main ) },
		} );

	};
	screens.notice( 'used-up', { retryAfter, onMoon: toMoon } );
	if ( reason !== 'visitor' || ! ( config.googleClientId || config.passwords === true ) ) return;
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
		if ( onMoonOnly ) return location.reload();
		$( 'notice' ).hidden = true;
		visit( config );

	};
	supporter.setUpSupporter( { worker: true, googleClientId: config.googleClientId, passwords: config.passwords === true, turnstileSiteKey: config.turnstileSiteKey, onPass: askedAsSupporter ? null : again } );
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
