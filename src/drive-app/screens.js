// The screens and overlays round the globe and the drive: the splash while World Drive starts,
// full-screen notices (today's drives used up, the robot check, maps off, errors), the drop-in's
// loading card, the pause menu, the keys card and short messages.

import { listOf, MOON, OFF_EARTH, onWorld } from './worlds.js';

const $ = id => document.getElementById( id );
// "The Moon, Mars, Vesta and Ceres": every world but the Earth (all free), for the used-up notice.
const FREE = listOf( OFF_EARTH );
const FREE_WORLDS = FREE[ 0 ].toUpperCase() + FREE.slice( 1 );

let toastTimer;
let countdownTimer;
let keysTimer;

export function splash( text ) {

	$( 'splash' ).hidden = false;
	$( 'splash' ).querySelector( '.status' ).textContent = text;

}

export function hideSplash() {

	$( 'splash' ).hidden = true;

}

// A full-screen notice instead of the globe: kind is 'used-up', 'robot', 'resting' or 'error'.
// options: retryAfter (s, for used-up), reason (used-up: 'visitor' for this visitor's own free
// drive, else everyone's for the day), message (for error), onRetry, onTestPad, onMoon (used-up:
// another world instead, `world` (the Moon unless it's said: the one the game is on), never limited,
// as none but the Earth is), onPass (used-up: "Get more Earth drives", the pass's sheet, where a day
// pass or the pass for good gives more today, whichever cap it was).
export function notice( kind, { retryAfter = 0, reason = '', message = '', onRetry, onTestPad, onMoon, onPass, world = MOON } = {} ) {

	hideSplash();
	const root = $( 'notice' );
	const texts = {
		'used-up': onMoon
			? ( reason === 'visitor'
				? [ 'You\'ve had today\'s free Earth drive', `World Drive streams the real 3D Earth, and each drive costs us a little, so everyone gets one free Earth drive a day. ${ FREE_WORLDS } are free and unlimited: drive there as much as you like, and come back tomorrow for another Earth drive.${ onPass ? ' Or keep driving the Earth today with the Supporter Pass: 30 Earth drives a day, for 24 hours, monthly or for good.' : '' }` ]
				: [ 'Today\'s free Earth drives are used up', `World Drive streams the real 3D Earth, and each drive costs us a little, so there's a daily limit for everyone together. ${ FREE_WORLDS } are free and unlimited: drive there as much as you like, and come back tomorrow for a fresh set of Earth drives.${ onPass ? ' Or keep driving the Earth today with the Supporter Pass: 30 Earth drives a day, for 24 hours, monthly or for good.' : '' }` ] )
			: [ 'Today\'s free drives are used up', 'World Drive streams the real 3D world, and each drive costs us a little, so there\'s a daily limit. Come back tomorrow for a fresh set of drives.' ],
		robot: [ 'We couldn\'t check you\'re a person', 'The quick robot check didn\'t go through. It can help to turn off a blocker for this site, or try another browser.' ],
		resting: [ 'World Drive is getting ready', 'The 3D world is switched off for now. Check back soon.' ],
		error: [ 'Something went wrong', message || 'World Drive couldn\'t start. Try again in a moment.' ],
	}[ kind ];
	root.dataset.kind = kind;
	root.querySelector( '.title' ).textContent = texts[ 0 ];
	root.querySelector( '.message' ).textContent = texts[ 1 ];

	const buttons = root.querySelector( '.buttons' );
	buttons.replaceChildren();
	const button = ( text, onClick, primary = true ) => {

		const b = Object.assign( document.createElement( 'button' ), { type: 'button', textContent: text, className: primary ? 'primary' : '' } );
		b.addEventListener( 'click', onClick );
		buttons.append( b );

	};

	if ( onRetry ) button( 'Try again', () => {

		root.hidden = true;
		onRetry();

	} );
	if ( onPass ) button( 'Get more Earth drives', () => onPass() );
	if ( onMoon ) button( `Drive ${ onWorld( world ) }`, () => {

		root.hidden = true;
		onMoon();

	}, ! onPass );
	if ( onTestPad ) button( 'Drive the test pad', () => {

		root.hidden = true;
		onTestPad();

	}, ! onRetry );

	const countdown = root.querySelector( '.countdown' );
	clearInterval( countdownTimer );
	countdown.hidden = kind !== 'used-up' || ! retryAfter;
	if ( ! countdown.hidden ) {

		const until = Date.now() + retryAfter * 1000;
		const tick = () => {

			const left = Math.max( 0, until - Date.now() );
			const hours = Math.floor( left / 3600000 );
			const minutes = Math.ceil( ( left % 3600000 ) / 60000 );
			countdown.textContent = left > 0 ? `Fresh ${ onMoon ? 'Earth ' : '' }drives in ${ hours ? `${ hours } h ` : '' }${ minutes } min` : `Fresh ${ onMoon ? 'Earth ' : '' }drives are ready: reload the page.`;

		};

		tick();
		countdownTimer = setInterval( tick, 30000 );

	}

	root.hidden = false;

}

// The drop-in's card: what's happening, and how far the tiles have loaded (0 to 1, or null).
export function loading( title, progress = null ) {

	const root = $( 'loading' );
	if ( root.hidden ) startTips( root );
	root.hidden = false;
	root.querySelector( '.title' ).textContent = title;
	setProgress( progress );

}

export function setProgress( progress ) {

	const bar = $( 'loading' ).querySelector( '.bar' );
	bar.hidden = progress === null;
	if ( progress !== null ) bar.firstElementChild.style.transform = `scaleX(${ Math.max( 0.04, Math.min( 1, progress ) ) })`;

}

export function hideLoading() {

	$( 'loading' ).hidden = true;
	clearInterval( tipTimer );

}

// The drop-in's card's car (the splash's, drive/index.html) and a tip, a new one every few seconds
// while it's up.
let tipTimer;
function startTips( root ) {

	const loading = window.worldDriveLoading;
	const tip = root.querySelector( '.tip' );
	const ride = root.querySelector( '.mini .ride' );
	clearInterval( tipTimer );
	if ( ! loading ) {

		tip.hidden = true;
		root.querySelector( '.mini' ).hidden = true;
		return;

	}

	if ( ! ride.firstChild ) ride.innerHTML = loading.car;
	const show = () => {

		tip.classList.remove( 'in' );
		void tip.offsetWidth;
		tip.innerHTML = `<b>Tip</b> ${ loading.nextTip() }`;
		tip.classList.add( 'in' );

	};
	show();
	tipTimer = setInterval( show, 5000 );

}

export function pause( show ) {

	$( 'pause' ).hidden = ! show;
	if ( show ) $( 'pause' ).querySelector( '.resume' ).focus();

}

export function isPaused() {

	return ! $( 'pause' ).hidden;

}

// The driving keys, shown for a while as a drive starts (and with the ? button).
export function showKeys( ms = 7000 ) {

	const keys = $( 'drive-ui' ).querySelector( '.keys' );
	keys.hidden = false;
	clearTimeout( keysTimer );
	if ( ms ) keysTimer = setTimeout( () => keys.hidden = true, ms );

}

export function toggleKeys() {

	const keys = $( 'drive-ui' ).querySelector( '.keys' );
	if ( keys.hidden ) showKeys( 0 );
	else hideKeys();

}

export function hideKeys() {

	clearTimeout( keysTimer );
	$( 'drive-ui' ).querySelector( '.keys' ).hidden = true;

}

// A short message; with `action` ({ label, onClick }), a button after it (driving with others'
// "Join").
export function toast( text, ms = 5000, action = null ) {

	const root = $( 'toast' );
	root.textContent = text;
	if ( action ) {

		const button = Object.assign( document.createElement( 'button' ), { type: 'button', className: 'toast-action', textContent: action.label } );
		button.addEventListener( 'click', () => {

			root.hidden = true;
			action.onClick();

		} );
		root.append( ' ', button );

	}

	root.hidden = false;
	clearTimeout( toastTimer );
	toastTimer = setTimeout( () => root.hidden = true, ms );

}
