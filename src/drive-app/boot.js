import './style.css';
import { getConfig, startVisit } from './api.js';
import * as screens from './screens.js';

// World Drive's first script (docs/world-drive.md): the splash, the Worker's settings and the
// visit (the robot check, then the Maps key), while the game itself (main.js: three.js, the tiles,
// the driving, nearly all of the page's code) comes down beside them rather than before them. So
// the splash and what World Drive is show at once, the robot check runs while the game loads, and
// the globe is up as soon as both are done.

// Only the dev server has this (vite.drive.config.js): a key from the environment, for driving on
// Google's tiles without the Worker. The built site always asks the Worker.
const DEV_KEY = __DEV_MAPS_KEY__;

const $ = id => document.getElementById( id );
const game = import( './main.js' );
// Caught where it's waited for (start); this only keeps a failed load from being reported twice.
game.catch( () => {} );

boot();

async function boot() {

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

	} catch {

		return screens.notice( 'error', { message: 'World Drive didn\'t finish loading. Check your connection and try again.', onRetry: () => window.location.reload() } );

	}

	main.start( options );

}

// Once per page load: the robot check, then the Maps key for this visit.
async function visit( config ) {

	screens.splash( 'Checking the road is clear...' );
	const outcome = await startVisit( config.turnstileSiteKey, $( 'robot-check' ) );
	if ( outcome.key ) return start( { key: outcome.key, left: outcome.left, visit: outcome.visit, googleClientId: config.googleClientId, live: !! config.live, liveReason: config.liveReason } );
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

	} catch {

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
