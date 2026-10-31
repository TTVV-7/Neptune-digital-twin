import './supporter.css';
import { endSession, getMe, linkPlayer as postLink, startSession } from './api.js';
import { PRICE } from './pass.js';
import { isPro, setPro } from './pro.js';
import { storage } from './places.js';
import { toast } from './screens.js';

// Buying the Supporter Pass, and signing in to have it (docs/world-drive.md): the pass is a Google
// account's, kept by the Worker (worker/drive/accounts.js, supporter.js), so it's yours in any
// browser. The pass's sheet (pass.js) has its buy area filled from here (fillBuyArea), and the pause
// menu an account line (fillAccountArea): "Sign in with Google" (Google's own button, its script
// loaded only once a button is on screen), then "Buy", which opens the Stripe Payment Link in a new
// tab saying whose it is (client_reference_id, the account's id, which Stripe hands back with the
// payment) and filling in the email (prefilled_email). Stripe brings the buyer back to
// /?supporter=thanks (the link's after-payment setting); there, or when this window gets focus back
// after Buy, /api/me is asked again, and once it says so the pass is unlocked here (setPro in
// pro.js). On load a supporter's is unlocked quietly. Restoring a purchase is signing in.
//
// None of it may get in the way of driving: every call to the Worker is allowed to fail, and
// without a Worker or a sign-in client id (sign-in not set up yet) nothing here shows and the sheet
// keeps its "Coming soon".

const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';
const THANKS_PARAM = 'supporter';
// The webhook usually arrives before the buyer is back from Stripe, but not always: ask a few more
// times, this far apart (ms).
const RECHECK_DELAY = 3000;
const RECHECKS = 10;
// How long after Buy (ms) the window getting focus back asks whether the pass has come.
const WAIT_FOR = 60 * 60 * 1000;
// The player last linked to the account, as "<player id> <email>", so it's linked once, not each visit.
const LINKED_KEY = 'world-drive.linked';
const UNREACHABLE = 'Couldn\'t reach World Drive. Check your connection and try again.';

let clientId = '';
let getPlayer = () => null;
// /api/me's answer, or null until it's known.
let me = null;
// What's going on, shown in each area ('' for nothing).
let status = '';
// When Buy was last pressed (ms), or 0.
let waitingSince = 0;
let checking = false;
// Whether the pass was switched on here, so it's only switched off again by what switched it on (not
// ?pro=1 on this computer, say).
let unlockedHere = false;
let google = null;
// The question to /api/me on its way, if there is one.
let asking = null;
const areas = new Map();
const observers = new Set();

// Once, as World Drive starts. worker: whether there's a Worker (not on the Vite dev server alone);
// googleClientId: /api/config's; player(): this browser's leaderboard player, { id, secret } or null.
export function setUpSupporter( { worker, googleClientId, player } ) {

	clientId = worker && typeof googleClientId === 'string' ? googleClientId : '';
	getPlayer = player ?? getPlayer;
	const thanks = takeThanks();
	if ( clientId ) {

		refresh().then( () => thanks && welcomeBack() );
		window.addEventListener( 'focus', recheck );
		document.addEventListener( 'visibilitychange', () => document.visibilityState === 'visible' && recheck() );

	} else if ( thanks ) toast( 'Thanks for supporting World Drive!' );

	return {
		// Whether there's signing in (and so perhaps buying) here at all.
		on: !! clientId,
		get me() {

			return me;

		},
		refresh,
		openSupporterCheckout,
		restorePurchases,
		signOut,
	};

}

// Fills the pass sheet's buy area (buyArea() in pass.js), and keeps it up to date. Without sign-in
// set up it's left as it is: "Coming soon".
export function fillBuyArea( root ) {

	addArea( root, 'buy' );

}

// The pause menu's account line: who's signed in, signing in and out.
export function fillAccountArea( root ) {

	addArea( root, 'account' );

}

function addArea( root, kind ) {

	if ( ! root || areas.has( root ) ) return;
	areas.set( root, kind );
	// Opened while /api/me couldn't be asked (a bad connection as the page started): ask again.
	new IntersectionObserver( entries => {

		if ( clientId && ! me && entries.some( entry => entry.isIntersecting ) ) refresh();

	} ).observe( root );
	render();

}

// Opens the Payment Link in a new tab for the signed-in account. false if buying isn't open, or
// nobody's signed in (the pass has to be someone's).
export function openSupporterCheckout() {

	const purchase = me?.purchase;
	if ( ! me?.signedIn || ! purchase?.enabled || ! purchase.link ) return false;
	const url = new URL( purchase.link );
	if ( purchase.clientReferenceId ) url.searchParams.set( 'client_reference_id', purchase.clientReferenceId );
	if ( me.email ) url.searchParams.set( 'prefilled_email', me.email );
	waitingSince = Date.now();
	window.open( url.href, '_blank', 'noopener' );
	render();
	return true;

}

// "Restore purchases": a pass is an account's, so it's signing in (Google's One Tap, where it
// offers it; the button is there either way), or, signed in, asking the Worker again. true once
// the pass is here.
export async function restorePurchases() {

	if ( ! clientId ) return false;
	if ( me?.signedIn ) {

		say( 'Checking...' );
		const known = await refresh();
		say( ! known ? UNREACHABLE : me.supporter ? '' : 'No Supporter Pass on this account yet. Bought it with another? Sign out and sign in with that one.' );
		if ( me.supporter ) unlocked();
		return !! me.supporter;

	}

	try {

		( await loadGoogle() ).prompt();

	} catch {

		say( 'Google sign-in didn\'t load. Check your connection, or allow accounts.google.com.' );

	}

	return false;

}

export async function signOut() {

	say( 'Signing out...' );
	const answer = await endSession();
	if ( ! answer.ok ) return say( UNREACHABLE );
	say( '' );
	window.google?.accounts?.id?.disableAutoSelect?.();
	if ( ! await refresh() ) update( { signedIn: false, supporter: false, purchase: { enabled: false } } );
	toast( 'Signed out' );

}

// This browser's leaderboard player, linked to the signed-in account so a supporter's ⭐ is by its
// name: once for each player and account. Called again when a player is made (leaderboard.js).
export async function linkPlayer() {

	const player = getPlayer();
	if ( ! me?.signedIn || ! player ) return;
	const key = `${ player.id } ${ me.email }`;
	if ( storage( () => localStorage.getItem( LINKED_KEY ) ) === key ) return;
	const answer = await postLink( player );
	if ( answer.ok ) storage( () => localStorage.setItem( LINKED_KEY, key ) );

}

// --- what the Worker says ---

// Asks /api/me again (once, however many ask at once): false if it couldn't be asked, and then
// nothing changes.
function refresh() {

	asking ??= getMe().then( answer => {

		asking = null;
		if ( ! answer.ok || typeof answer.body.signedIn !== 'boolean' ) return false;
		update( answer.body );
		return true;

	} );
	return asking;

}

function update( next ) {

	me = next;
	if ( me.supporter && ! isPro() ) {

		unlockedHere = true;
		setPro( true );

	} else if ( ! me.supporter && unlockedHere ) {

		// Signed out, or refunded.
		unlockedHere = false;
		setPro( false );

	}

	if ( me.supporter ) waitingSince = 0;
	render();
	if ( me.signedIn ) linkPlayer();

}

// Back from Stripe on ?supporter=thanks: the address is tidied straight away (so a reload doesn't
// thank again), and true returned.
function takeThanks() {

	const url = new URL( window.location.href );
	if ( url.searchParams.get( THANKS_PARAM ) !== 'thanks' ) return false;
	url.searchParams.delete( THANKS_PARAM );
	window.history.replaceState( window.history.state, '', url.href );
	return true;

}

async function welcomeBack() {

	for ( let i = 0; i <= RECHECKS; i ++ ) {

		if ( i > 0 ) {

			await new Promise( resolve => setTimeout( resolve, RECHECK_DELAY ) );
			await refresh();

		}

		if ( me?.supporter ) return unlocked();
		if ( me && ! me.signedIn ) return toast( 'Thanks for supporting World Drive! Sign in with the Google account you paid with to unlock the pass.', 10000 );

	}

	toast( 'Thanks! The pass unlocks as soon as Stripe confirms the payment: reload in a minute or two.', 10000 );

}

// The window has focus again (back from paying in the other tab): has the pass come?
async function recheck() {

	if ( ! waitingSince || Date.now() - waitingSince > WAIT_FOR || checking ) return;
	checking = true;
	await refresh();
	checking = false;
	if ( me?.supporter ) unlocked();

}

function unlocked() {

	toast( 'Thanks! Supporter Pass unlocked', 8000 );

}

// --- signing in ---

async function signIn( credential ) {

	say( 'Signing in...' );
	const answer = await startSession( credential );
	if ( ! answer.ok ) {

		const why = {
			0: UNREACHABLE,
			429: 'That\'s all the signing in from here for today. Try again tomorrow.',
			503: 'Signing in isn\'t open right now. Try again later.',
		}[ answer.status ] ?? 'Signing in didn\'t work. Try again.';
		return say( why );

	}

	say( '' );
	update( answer.body );
	toast( me.supporter ? 'Signed in: Supporter Pass unlocked' : `Signed in as ${ me.email }` );

}

// Google's sign-in (its script makes window.google.accounts.id), loaded once and set up with our
// client id; the button's callback hands over the ID token.
function loadGoogle() {

	google ??= new Promise( ( resolve, reject ) => {

		const script = document.createElement( 'script' );
		script.src = GOOGLE_SCRIPT;
		script.async = true;
		script.onload = () => {

			const id = window.google?.accounts?.id;
			if ( ! id ) return reject( new Error( 'Google sign-in didn\'t load' ) );
			id.initialize( { client_id: clientId, callback: ( { credential } ) => signIn( credential ), ux_mode: 'popup', auto_select: false, cancel_on_tap_outside: true } );
			resolve( id );

		};
		script.onerror = () => reject( new Error( 'Google sign-in didn\'t load' ) );
		document.head.append( script );

	} ).catch( err => {

		// Tried again next time a button shows.
		google = null;
		throw err;

	} );
	return google;

}

// A place for Google's button, drawn into once it's on screen (an open sheet or pause menu), so the
// script is only loaded for someone who might sign in.
function googleButton() {

	const slot = document.createElement( 'div' );
	slot.className = 'supporter-google';
	const observer = new IntersectionObserver( entries => {

		if ( ! entries.some( entry => entry.isIntersecting ) ) return;
		observer.disconnect();
		observers.delete( observer );
		loadGoogle().then( id => {

			if ( slot.isConnected ) id.renderButton( slot, { theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'pill', width: 240 } );

		} ).catch( () => {

			slot.replaceChildren( line( 'Google sign-in didn\'t load. Check your connection, or allow accounts.google.com.' ) );

		} );

	} );
	observer.observe( slot );
	observers.add( observer );
	return slot;

}

// --- drawing it ---

function say( text ) {

	status = text;
	render();

}

function render() {

	// Buttons no longer drawn don't need Google's script.
	for ( const observer of observers ) observer.disconnect();
	observers.clear();
	for ( const [ root, kind ] of areas ) {

		if ( kind === 'buy' ) renderBuy( root );
		else renderAccount( root );

	}

}

// The pass's sheet: sign in, then buy; or the pass, with thanks.
function renderBuy( root ) {

	if ( ! clientId || ! me ) return;
	const purchase = me.purchase ?? { enabled: false };
	const parts = [];
	if ( me.supporter ) parts.push( Object.assign( line( '⭐ You have the Supporter Pass. Thanks for helping keep World Drive on the road!' ), { className: 'supporter-thanks' } ) );
	else if ( ! purchase.enabled ) {

		parts.push( Object.assign( button( 'Coming soon' ), { className: 'primary buy', disabled: true } ) );
		if ( ! me.signedIn ) parts.push( line( 'Have the pass already? Sign in to use it here.' ), googleButton() );

	} else if ( ! me.signedIn ) {

		parts.push( googleButton(), line( 'Sign in to buy, so the pass is yours in any browser. Bought it already? Signing in brings it back.' ) );

	} else {

		const buy = button( `Buy for ${ purchase.price || PRICE }`, () => openSupporterCheckout() );
		buy.className = 'primary buy';
		parts.push( buy );
		if ( waitingSince ) parts.push( line( 'Finish paying in the new tab: the pass unlocks here as soon as it\'s done. ', linkButton( 'Check again', () => restorePurchases() ) ) );

	}

	if ( me.signedIn ) {

		const restore = me.supporter || ! purchase.enabled || waitingSince ? [] : [ linkButton( 'Restore purchases', () => restorePurchases() ), ' · ' ];
		parts.push( line( 'Signed in as ', bold( me.email ), ' · ', ...restore, linkButton( 'Sign out', () => signOut() ) ) );

	}

	if ( status ) parts.push( statusLine() );
	if ( ! me.supporter ) parts.push( Object.assign( line( purchase.enabled ? 'One payment, no subscription. Paid securely with Stripe.' : 'One payment, no subscription. Buying opens soon.' ), { className: 'small' } ) );
	root.replaceChildren( ...parts );

}

// The pause menu: who's signed in, or a way to sign in for someone with the pass.
function renderAccount( root ) {

	root.hidden = ! clientId || ! me;
	if ( root.hidden ) return;
	const parts = me.signedIn
		? [ line( 'Signed in as ', bold( me.name || me.email ), me.supporter ? ' · ⭐ Supporter Pass' : '', ' · ', linkButton( 'Sign out', () => signOut() ) ) ]
		: [ line( 'Have the Supporter Pass? Sign in to use it here.' ), googleButton() ];
	if ( status ) parts.push( statusLine() );
	root.replaceChildren( ...parts );

}

function line( ...content ) {

	const p = document.createElement( 'p' );
	p.className = 'supporter-line';
	p.append( ...content );
	return p;

}

function statusLine() {

	const p = Object.assign( line( status ), { className: 'supporter-status' } );
	p.setAttribute( 'role', 'status' );
	return p;

}

function bold( text ) {

	return Object.assign( document.createElement( 'b' ), { textContent: text } );

}

function button( text, onClick ) {

	const b = Object.assign( document.createElement( 'button' ), { type: 'button', textContent: text } );
	if ( onClick ) b.addEventListener( 'click', onClick );
	return b;

}

function linkButton( text, onClick ) {

	return Object.assign( button( text, onClick ), { className: 'link' } );

}
