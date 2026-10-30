// The screens and overlays round the globe and the drive: the splash while World Drive starts,
// full-screen notices (today's drives used up, the robot check, maps off, errors), the drop-in's
// loading card, the pause menu, the keys card and short messages.

const $ = id => document.getElementById( id );

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
// options: retryAfter (s, for used-up), message (for error), onRetry, onTestPad.
export function notice( kind, { retryAfter = 0, message = '', onRetry, onTestPad } = {} ) {

	hideSplash();
	const root = $( 'notice' );
	const texts = {
		'used-up': [ 'Today\'s free drives are used up', 'World Drive streams the real 3D world, and each drive costs us a little, so there\'s a daily limit. Come back tomorrow for a fresh set of drives.' ],
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
			countdown.textContent = left > 0 ? `Fresh drives in ${ hours ? `${ hours } h ` : '' }${ minutes } min` : 'Fresh drives are ready: reload the page.';

		};

		tick();
		countdownTimer = setInterval( tick, 30000 );

	}

	root.hidden = false;

}

// The drop-in's card: what's happening, and how far the tiles have loaded (0 to 1, or null).
export function loading( title, progress = null ) {

	const root = $( 'loading' );
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

export function toast( text, ms = 5000 ) {

	const root = $( 'toast' );
	root.textContent = text;
	root.hidden = false;
	clearTimeout( toastTimer );
	toastTimer = setTimeout( () => root.hidden = true, ms );

}
