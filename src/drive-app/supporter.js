import './supporter.css';
import { accountPlayer, endSession, getMe, send, startSession } from './api.js';
import { PRICE, setPrice } from './pass.js';
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
//
// Usernames and passwords (worker/drive/logins.js) sign in to the same accounts: where Google's
// button is, a link opens the account panel (account.js, loaded only then, with its own CSS), which
// has the username and password form, and signed in, changing the password and linking Google. With
// usernames on (passwords in /api/config), all of this shows even without Google's sign-in set up.

const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';
const THANKS_PARAM = 'supporter';
// The webhook usually arrives before the buyer is back from Stripe, but not always: ask a few more
// times, this far apart (ms).
const RECHECK_DELAY = 3000;
const RECHECKS = 10;
// How long after Buy (ms) the window getting focus back asks whether the pass has come.
const WAIT_FOR = 60 * 60 * 1000;
// The player last linked to the account, as "<player id> <email>", so it's linked once, not each visit.
// (.2: since one account has one player on every device, each browser signed in asks once more.)
const LINKED_KEY = 'world-drive.linked.2';
const UNREACHABLE = 'Couldn\'t reach World Drive. Check your connection and try again.';

let clientId = '';
// Whether usernames and passwords are on, and the Turnstile site key their robot checks use.
let passwords = false;
let siteKey = '';
let getPlayer = () => null;
// Takes the account's player for this browser in place of its own (the leaderboard's adopt), or null
// until the game has set it up.
let adoptPlayer = null;
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
// Settles once /api/me's first answer has come (or couldn't): at once without signing in here.
let known = Promise.resolve();
// Called once the account signed in here has the pass (see setUpSupporter), or null.
let onPass = null;
// Called as Buy opens the Payment Link (for the play stats).
let onBuy = () => {};
let handle = null;
const areas = new Map();
const observers = new Set();
// Called with the player each time one is linked to the account here (levels: a linked player's
// level is the account's, progress.js).
const linked = new Set();
// Called whenever /api/me says something new (the account panel, account.js, keeps up with it).
const changed = new Set();

// As World Drive starts. worker: whether there's a Worker (not on the Vite dev server alone);
// googleClientId: /api/config's; player(): this browser's leaderboard player, { id, secret } or null.
// The game sets it up as it starts (main.js), with onPass none; over the day's Earth drives,
// boot.js sets it up again after that with onPass(): called once, as soon as the account here has
// the pass, to ask for the visit again (a reload). Set up again, it only takes the new player(),
// onPass and onBuy(): Buy opening the Payment Link, for the play stats. The questions already
// asked, and their answers, carry on.
// passwords and turnstileSiteKey: /api/config's, for usernames and passwords.
export function setUpSupporter( { worker, googleClientId, passwords: passwordsOn = false, turnstileSiteKey = '', player, adopt = null, onPass: whenPass = null, onBuy: whenBuy = null } ) {

	getPlayer = player ?? getPlayer;
	adoptPlayer = adopt ?? adoptPlayer;
	onPass = whenPass;
	onBuy = whenBuy ?? onBuy;
	if ( handle ) {

		if ( me?.signedIn ) linkPlayer();
		return handle;

	}

	clientId = worker && typeof googleClientId === 'string' ? googleClientId : '';
	passwords = !! worker && passwordsOn === true;
	siteKey = typeof turnstileSiteKey === 'string' ? turnstileSiteKey : '';
	const thanks = takeThanks();
	if ( accountsOn() ) {

		const first = refresh();
		known = first.then( () => {}, () => {} );
		first.then( () => thanks && welcomeBack() );
		window.addEventListener( 'focus', recheck );
		document.addEventListener( 'visibilitychange', () => document.visibilityState === 'visible' && recheck() );

	} else if ( thanks ) toast( 'Thanks for supporting World Drive!' );

	handle = {
		// Whether there's signing in (and so perhaps buying) here at all.
		on: accountsOn(),
		// Settles once the Worker's first word on this browser's account has come (or couldn't), so
		// isPro() then says whether a supporter is here (the ads wait for it, main.js).
		known,
		get me() {

			return me;

		},
		refresh,
		openSupporterCheckout,
		restorePurchases,
		signOut,
	};
	return handle;

}

// Fills the pass sheet's buy area (buyArea() in pass.js), and keeps it up to date. Without sign-in
// set up it's left as it is: "Coming soon".
export function fillBuyArea( root ) {

	addArea( root, 'buy' );

}

// The pause menu's account line, and the used-up screen's: who's signed in, signing in and out.
export function fillAccountArea( root ) {

	addArea( root, 'account' );

}

function addArea( root, kind ) {

	if ( ! root || areas.has( root ) ) return;
	areas.set( root, kind );
	// Opened while /api/me couldn't be asked (a bad connection as the page started): ask again.
	new IntersectionObserver( entries => {

		if ( accountsOn() && ! me && entries.some( entry => entry.isIntersecting ) ) refresh();

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
	onBuy();
	render();
	return true;

}

// "Restore purchases": a pass is an account's, so it's signing in (Google's One Tap, where it
// offers it; the button is there either way), or, signed in, asking the Worker again. true once
// the pass is here.
export async function restorePurchases() {

	if ( ! accountsOn() ) return false;
	if ( me?.signedIn ) {

		say( 'Checking...' );
		const known = await refresh();
		// Just paid, it's most likely Stripe's word still on its way (days, for a bank debit).
		const notYet = waitingSince ? 'Not confirmed yet: it can take a minute after paying (a few days for a bank debit). It unlocks here by itself.' : 'No Supporter Pass on this account yet. Bought it with another? Sign out and sign in with that one.';
		say( ! known ? UNREACHABLE : me.supporter ? '' : notYet );
		if ( me.supporter ) unlocked();
		return !! me.supporter;

	}

	if ( ! clientId ) {

		openAccount();
		return false;

	}

	try {

		credentialFor = null;
		( await loadGoogle() ).prompt();

	} catch {

		say( 'Google sign-in didn\'t load. Check your connection, or allow accounts.google.com.' );

	}

	return false;

}

// Signed out here, or with everywhere, on every device (every session of the account). The
// Worker's answer (api.js's send): not ok when it couldn't be reached (status 0) or said no (a 429
// past the day's changes, say), its words in the sheet's status line, and in the account panel's.
export async function signOut( { everywhere = false } = {} ) {

	say( 'Signing out...' );
	// The account's player, handed to this browser as it signed in (not one made here), goes with
	// the session: a shared computer doesn't go on driving as them.
	const handed = getPlayer()?.handed ? getPlayer() : null;
	const answer = everywhere ? await send( 'POST', '/api/account/sign-out-everywhere', {} ) : await endSession( handed?.secret );
	if ( ! answer.ok ) {

		say( answer.status && typeof answer.body?.error === 'string' ? answer.body.error.replace( /([^.!?])$/, '$1.' ) : UNREACHABLE );
		return answer;

	}

	say( '' );
	// The email in it stays off a shared computer; signing in again links the player again, once.
	storage( () => localStorage.removeItem( LINKED_KEY ) );
	if ( handed && getPlayer()?.id === handed.id ) adoptPlayer?.( null );
	window.google?.accounts?.id?.disableAutoSelect?.();
	if ( ! await refresh() ) update( { signedIn: false, supporter: false, purchase: { enabled: false } } );
	toast( everywhere ? 'Signed out everywhere' : 'Signed out' );
	return answer;

}

// One account, one player, on every device: signed in here, this browser's leaderboard player is the
// account's (accounts.js's accountPlayer). If the account has none yet, it takes this browser's
// (so a supporter's ⭐ is by its name); if it has one, this browser switches to it, and a nickname
// made here before (a "Tom 2") is folded into it, its level, achievements and scores with it. Once
// for each player and account; called again when a player is made here (leaderboard.js), and not
// before the game is there to take a player (adoptPlayer).
let linking = null;
let linkingFor = null;
export function linkPlayer() {

	// Asked again for another player (one made here while it asked for none): after that ask.
	const id = getPlayer()?.id ?? null;
	if ( linking && linkingFor !== id ) return linking.then( linkPlayer );
	if ( ! linking ) {

		linkingFor = id;
		linking = link().finally( () => linking = null );

	}

	return linking;

}

async function link() {

	const player = getPlayer();
	if ( ! me?.signedIn || ! adoptPlayer ) return;
	const who = me.email || me.username;
	if ( storage( () => localStorage.getItem( LINKED_KEY ) ) === `${ player?.id ?? '' } ${ who }` ) return;
	const answer = await accountPlayer( player );
	if ( ! answer.ok || ! isObjectLike( answer.body ) ) return;
	const mine = answer.body.player;
	// Signed out, or another player made here, while it asked: asked again then.
	if ( ! me?.signedIn || getPlayer()?.id !== player?.id ) return;
	let now = player;
	if ( mine && typeof mine.id === 'string' && typeof mine.name === 'string' && typeof mine.secret === 'string' ) {

		now = { id: mine.id, secret: mine.secret, name: mine.name, handed: true };
		adoptPlayer( now, { merged: answer.body.merged === true, from: player } );

	} else if ( ! mine && answer.body.foreign === true && player?.handed ) {

		// Another account's player, left here by someone who didn't sign out: not this account's to
		// drive as. A nickname is picked for this one instead.
		now = null;
		adoptPlayer( null );

	}

	storage( () => localStorage.setItem( LINKED_KEY, `${ now?.id ?? '' } ${ who }` ) );
	if ( now ) for ( const fn of linked ) fn( now );

}

function isObjectLike( value ) {

	return !! value && typeof value === 'object';

}

// fn( player ) whenever this browser's player is linked to the account signed in here.
export function onLinked( fn ) {

	linked.add( fn );
	return () => linked.delete( fn );

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
	for ( const fn of changed ) fn();
	if ( me.signedIn ) linkPlayer();
	if ( me.supporter && onPass ) {

		const fn = onPass;
		onPass = null;
		fn();

	}

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
	toast( me.supporter ? 'Signed in: Supporter Pass unlocked' : `Signed in as ${ who( { email: true } ) }` );

}

// Whether there's any signing in here: Google's, or usernames and passwords.
function accountsOn() {

	return !! clientId || passwords;

}

// Who's signed in, in words: their Google name or email, or their username. Where a pass is bought
// or restored (the sheet, and the toast on signing in) it's the email first, since that's whose the
// purchase is; elsewhere (the pause menu) the name.
function who( { email = false } = {} ) {

	return ( email ? me?.email || me?.name : me?.name || me?.email ) || me?.username || '';

}

// The account panel (account.js, its own chunk, loaded the first time it's opened), with what it
// needs from here.
let panel = null;
export function openAccount() {

	panel ??= import( './account.js' ).catch( err => {

		panel = null;
		throw err;

	} );
	panel.then( module => module.openAccount( hooks ) ).catch( () => toast( UNREACHABLE ) );

}

const hooks = {
	get me() {

		return me;

	},
	get google() {

		return !! clientId;

	},
	get siteKey() {

		return siteKey;

	},
	// /api/me's body as another route answered it (signed in, a password changed, Google linked).
	update( body ) {

		if ( typeof body?.signedIn === 'boolean' ) update( body );

	},
	signOut,
	who,
	// Google's button drawn into `slot` (in the open panel), for linking: its credential goes to
	// onCredential rather than signing in.
	drawGoogle: ( slot, onCredential = null ) => drawGoogle( slot, { onCredential, text: onCredential ? 'continue_with' : 'signin_with' } ),
	// fn() whenever who's signed in, or how, may have changed.
	onChange( fn ) {

		changed.add( fn );

	},
};

// Who the next Google credential is for: a linking button's onCredential (see drawGoogle), or null
// for signing in.
let credentialFor = null;

// Google's sign-in (its script makes window.google.accounts.id), loaded once and set up with our
// client id; the button's callback hands over the ID token, to sign in, or to the linking button
// clicked last.
function loadGoogle() {

	google ??= new Promise( ( resolve, reject ) => {

		const script = document.createElement( 'script' );
		script.src = GOOGLE_SCRIPT;
		script.async = true;
		script.onload = () => {

			const id = window.google?.accounts?.id;
			if ( ! id ) return reject( new Error( 'Google sign-in didn\'t load' ) );
			id.initialize( { client_id: clientId, callback: ( { credential } ) => ( credentialFor ?? signIn )( credential ), ux_mode: 'popup', auto_select: false, cancel_on_tap_outside: true } );
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
		drawGoogle( slot );

	} );
	observer.observe( slot );
	observers.add( observer );
	return slot;

}

// Google's button drawn into `slot` now. With onCredential (the account panel's link button, drawn
// as the panel opens), a click on it sends the credential there instead of signing in.
function drawGoogle( slot, { onCredential = null, text = 'signin_with' } = {} ) {

	loadGoogle().then( id => {

		if ( slot.isConnected ) id.renderButton( slot, { theme: 'filled_black', size: 'large', text, shape: 'pill', width: 240, click_listener: () => credentialFor = onCredential } );

	} ).catch( () => {

		slot.replaceChildren( line( 'Google sign-in didn\'t load. Check your connection, or allow accounts.google.com.' ) );

	} );

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

	if ( ! accountsOn() || ! me ) return;
	const purchase = me.purchase ?? { enabled: false };
	if ( purchase.enabled ) setPrice( purchase.price );
	const parts = [];
	if ( me.supporter ) {

		parts.push( Object.assign( line( '⭐ You have the Supporter Pass. Thanks for helping keep World Drive on the road!' ), { className: 'supporter-thanks' } ) );
		// A running subscription's: where to cancel it or change the card (Stripe's portal).
		if ( me.subscribed && purchase.manage ) parts.push( line( Object.assign( document.createElement( 'a' ), { href: purchase.manage, target: '_blank', rel: 'noopener', textContent: 'Manage your subscription' } ) ) );

	}
	else if ( ! purchase.enabled ) {

		parts.push( Object.assign( button( 'Coming soon' ), { className: 'primary buy', disabled: true } ) );
		if ( ! me.signedIn ) parts.push( line( 'Have the pass already? Sign in to use it here.' ), ...signInParts() );

	} else if ( ! me.signedIn ) {

		parts.push( ...signInParts(), line( 'Sign in to buy, so the pass is yours in any browser. Bought it already? Signing in brings it back.' ) );

	} else {

		const buy = button( `Buy for ${ purchase.price || PRICE }`, () => openSupporterCheckout() );
		buy.className = 'primary buy';
		parts.push( buy );
		if ( waitingSince ) parts.push( line( 'Finish paying in the new tab: the pass unlocks here as soon as it\'s done. ', linkButton( 'Check again', () => restorePurchases() ) ) );

	}

	if ( me.signedIn ) {

		const restore = me.supporter || ! purchase.enabled || waitingSince ? [] : [ linkButton( 'Restore purchases', () => restorePurchases() ), ' · ' ];
		parts.push( line( 'Signed in as ', bold( who( { email: true } ) ), ' · ', ...restore, ...accountLink(), linkButton( 'Sign out', () => signOut() ) ) );

	}

	if ( status ) parts.push( statusLine() );
	if ( ! me.supporter ) parts.push( Object.assign( line( purchase.enabled ? 'A subscription: cancel any time. Paid securely with Stripe.' : 'A subscription: cancel any time. Buying opens soon.' ), { className: 'small' } ) );
	root.replaceChildren( ...parts );

}

// The pause menu's and the used-up screen's: who's signed in, or a way to sign in for someone with
// the pass.
function renderAccount( root ) {

	root.hidden = ! accountsOn() || ! me;
	if ( root.hidden ) return;
	const parts = me.signedIn
		? [ line( 'Signed in as ', bold( who() ), me.supporter ? ' · ⭐ Supporter Pass' : '', ' · ', ...accountLink(), linkButton( 'Sign out', () => signOut() ) ) ]
		: [ line( 'Have the Supporter Pass? Sign in to use it here.' ), ...signInParts() ];
	if ( status ) parts.push( statusLine() );
	root.replaceChildren( ...parts );

}

// Signed out: Google's button (with its sign-in set up), and with usernames on, a link to the account
// panel's username and password form.
function signInParts() {

	const parts = clientId ? [ googleButton() ] : [];
	if ( passwords ) {

		const words = clientId ? 'Or use a username and password' : 'Sign in or create an account';
		parts.push( Object.assign( line( linkButton( words, () => openAccount() ) ), { className: 'supporter-line supporter-passwords' } ) );

	}

	return parts;

}

// Signed in, with usernames on: "Account", to the account panel (password, what's linked).
function accountLink() {

	return passwords ? [ linkButton( 'Account', () => openAccount() ), ' · ' ] : [];

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
