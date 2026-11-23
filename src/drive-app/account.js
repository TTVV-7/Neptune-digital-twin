import './account.css';
import { robotCheck, send } from './api.js';
import { PASSWORD_MAX_BYTES, PASSWORD_MIN, cleanUsername, passwordProblem } from './password-rules.js';
import { toast } from './screens.js';

// The account panel (docs/world-drive.md, "Username and password accounts"): its own chunk, loaded
// the first time it's opened (supporter.js's openAccount), so nothing of it is on the first load.
// Signed out: "Sign in with Google" (with its sign-in set up) and a username and password form, to
// sign in or create an account. Signed in: what the account signs in with and signing out here or
// everywhere, first, then each rarer change folded away under its own heading (opened one at a
// time, so a phone sees about a screen): changing the password (or adding a username and password
// to a Google account), linking or unlinking Google, taking the password off. What changes how the
// account signs in asks for fresh proof, as the Worker does: Google's button to add a password to a
// Google account or unlink Google, the password to link Google or take the password off (or
// Google's button for that too). The forms are real forms with labels and autocomplete (username,
// current-password, new-password), so password managers fill them and offer to save. A password is
// only ever sent to the Worker's account routes.

const UNREACHABLE = 'Couldn\'t reach World Drive. Check your connection and try again.';
const NO_RECOVERY = 'The email is only for receipts: nothing is sent to it, so a forgotten password can\'t be recovered, unless you also link Google. Keep it in a password manager.';

let hooks = null;
let dialog = null;
// 'sign-in' or 'sign-up': which the signed-out form does.
let mode = 'sign-in';
// What the panel was last drawn for, so it's drawn again only when that changes (not as the user
// types, whenever /api/me is asked again).
let drawnFor = '';
let ids = 0;

// Opens the panel (made the first time), with supporter.js's hooks.
export function openAccount( from ) {

	hooks = from;
	if ( ! dialog ) {

		dialog = document.createElement( 'dialog' );
		dialog.id = 'account';
		dialog.setAttribute( 'aria-labelledby', 'account-title' );
		// A click on the backdrop closes it (the backdrop's clicks are the dialog's own, outside its
		// box); one on its padding or between its sections, also the dialog's own, doesn't, so a tap
		// just beside a field never loses what was typed.
		dialog.addEventListener( 'click', event => {

			const box = dialog.getBoundingClientRect();
			const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
			if ( event.target === dialog && outside ) dialog.close();

		} );
		// Keys pressed here are the panel's, never the game's (Esc would otherwise resume a paused
		// drive behind it, and a letter on a focused button steer): Esc still closes the panel, as the
		// pass's sheet and the Garage do.
		dialog.addEventListener( 'keydown', event => event.stopPropagation() );
		// And while it's open, keys whose focus has fallen out of it (to the page, as a field or button
		// that had it is disabled or drawn anew) aren't the game's either: the panel is modal. Esc still
		// closes it (the browser's own, which this doesn't stop).
		window.addEventListener( 'keydown', event => {

			if ( dialog.open && ! dialog.contains( event.target ) ) event.stopPropagation();

		}, true );
		document.body.append( dialog );
		hooks.onChange( () => dialog.open && draw() );

	}

	draw( true );
	if ( ! dialog.open ) dialog.showModal();

}

function stateOf( me ) {

	return me?.signedIn ? `in:${ me.username ?? '' }:${ me.google ? 1 : 0 }:${ me.email }:${ me.contactEmail ?? '' }:${ passState( me ) }` : `out:${ mode }`;

}

function draw( always = false ) {

	const me = hooks.me;
	const state = stateOf( me );
	if ( ! always && state === drawnFor ) return;
	drawnFor = state;
	const close = Object.assign( button( '×', () => dialog.close() ), { className: 'close' } );
	close.setAttribute( 'aria-label', 'Close' );
	const title = Object.assign( document.createElement( 'h2' ), { id: 'account-title', textContent: me?.signedIn ? 'Your account' : mode === 'sign-up' ? 'Create account' : 'Sign in' } );
	const header = document.createElement( 'header' );
	header.append( title, close );
	// Drawn again with the focus in it (a tab pressed, a form sent), the focus stays in it: on the
	// same button or field drawn anew, or the close button, never left on the page behind, where
	// the game would hear the next key.
	const focused = dialog.contains( document.activeElement ) ? focusKey( document.activeElement ) : null;
	// The folded section that was open stays open, if it's still there.
	const opened = dialog.querySelector( 'details[open] > summary' )?.textContent;
	dialog.replaceChildren( header, ...( me?.signedIn ? signedIn( me ) : signedOut() ) );
	if ( opened ) for ( const summary of dialog.querySelectorAll( 'details > summary' ) ) if ( summary.textContent === opened ) summary.parentElement.open = true;
	if ( focused !== null && dialog.open ) {

		( [ ...dialog.querySelectorAll( 'button, input, summary' ) ].find( el => focusKey( el ) === focused ) ?? close ).focus();
		// (One in a folded section can't take it.)
		if ( ! dialog.contains( document.activeElement ) ) close.focus();

	}

}

// What tells a button or field apart from the others, to find it again once drawn anew.
function focusKey( el ) {

	return `${ el.tagName }:${ el.name || el.textContent }`;

}

// --- signed out ---

function signedOut() {

	const parts = [];
	if ( hooks.google ) {

		const slot = Object.assign( document.createElement( 'div' ), { className: 'account-google' } );
		hooks.drawGoogle( slot );
		parts.push( slot, Object.assign( paragraph( 'or' ), { className: 'account-or' } ) );

	}

	const tabs = document.createElement( 'div' );
	tabs.className = 'account-tabs';
	tabs.setAttribute( 'role', 'group' );
	tabs.setAttribute( 'aria-label', 'Sign in or create an account' );
	for ( const [ value, words ] of [ [ 'sign-in', 'Sign in' ], [ 'sign-up', 'Create account' ] ] ) {

		const tab = button( words, () => {

			mode = value;
			draw();

		} );
		tab.setAttribute( 'aria-pressed', String( mode === value ) );
		tabs.append( tab );

	}

	parts.push( tabs, mode === 'sign-up' ? signUpForm() : signInForm() );
	return parts;

}

function signInForm() {

	const { form, status, submit } = makeForm( 'account-sign-in', 'Sign in' );
	const username = field( form, 'Username', { name: 'username', autocomplete: 'username' } );
	const password = field( form, 'Password', { name: 'password', type: 'password', autocomplete: 'current-password' } );
	form.append( submit, status );
	form.addEventListener( 'submit', async event => {

		event.preventDefault();
		if ( ! username.value.trim() || ! password.value ) return say( status, 'Type your username and password.' );
		busy( form, true );
		say( status, 'Signing in...' );
		const answer = await withRobot( form, status, token => send( 'POST', '/api/account/sign-in', { username: username.value, password: password.value, ...( token ? { token } : {} ) } ) );
		busy( form, false );
		if ( ! answer ) return;
		if ( ! answer.ok ) return say( status, problem( answer ) );
		signedInNow( answer.body );

	} );
	return form;

}

function signUpForm() {

	const { form, status, submit } = makeForm( 'account-sign-up', 'Create account' );
	const username = field( form, 'Username', { name: 'username', autocomplete: 'username', minLength: 3, maxLength: 20, hint: '3 to 20 letters, digits, _ or -. Only you see it: the boards show your nickname.' } );
	const password = field( form, 'Password', { name: 'password', type: 'password', autocomplete: 'new-password', minLength: PASSWORD_MIN, hint: `At least ${ PASSWORD_MIN } characters. A few words together make a good one.` } );
	const email = field( form, 'Email (optional)', { name: 'email', type: 'email', autocomplete: 'email', maxLength: 254, required: false, hint: 'For your receipts if you buy the pass. Never shown, never used for anything else.' } );
	form.append( Object.assign( paragraph( NO_RECOVERY ), { className: 'account-note' } ), agreeing(), robotSlot(), submit, status );
	form.addEventListener( 'submit', async event => {

		event.preventDefault();
		const name = cleanUsername( username.value );
		if ( ! name ) return say( status, 'Usernames are 3 to 20 letters (a to z), digits, _ or -.' );
		const wrong = passwordProblem( password.value, name );
		if ( wrong ) return say( status, `${ wrong }.` );
		busy( form, true );
		say( status, 'Checking you\'re not a robot...' );
		const token = await robot( form, status );
		if ( token === null ) return busy( form, false );
		say( status, 'Creating your account...' );
		const answer = await send( 'POST', '/api/account/sign-up', { username: name, password: password.value, token, ...( email.value.trim() ? { email: email.value.trim() } : {} ) } );
		busy( form, false );
		if ( ! answer.ok ) return say( status, problem( answer ) );
		signedInNow( answer.body );

	} );
	return form;

}

// What making an account agrees to (drive/site/legal.js), with the pages in a new tab so the game
// stays open.
function agreeing() {

	const p = linksLine( 'By creating an account you confirm you\'re 13 or older and agree to the ', [ '/terms/', 'terms' ], ' and the ', [ '/privacy/', 'privacy policy' ], '.' );
	p.classList.add( 'account-terms' );
	return p;

}

function signedInNow( body ) {

	// Signed out again later, the panel offers signing in, not making another account.
	mode = 'sign-in';
	hooks.update( body );
	toast( body.supporter ? 'Signed in: Supporter Pass unlocked' : `Signed in as ${ hooks.who() }` );
	dialog.close();

}

// --- signed in ---

// What the account signs in with and signing out, at the top where they're seen at once, then each
// rarer change folded away under its heading (section).
function signedIn( me ) {

	const parts = [];
	const list = document.createElement( 'ul' );
	list.className = 'account-ways';
	list.append(
		item( 'Google', me.google ? me.email : 'not linked' ),
		item( 'Username', me.username ?? 'none' ),
	);
	parts.push( Object.assign( paragraph( 'You sign in with:' ), { className: 'account-label' } ), list );
	if ( me.supporter ) parts.push( passPart( me ) );

	// Signing out here or everywhere: both buttons off while it's sent (a second tap doesn't send it
	// again), and what went wrong said just under them (the pass's sheet, which says it too, is
	// behind the panel).
	const out = document.createElement( 'div' );
	out.className = 'account-out';
	const outStatus = statusLine();
	const signOut = everywhere => async () => {

		busy( out, true );
		say( outStatus, everywhere ? 'Signing out everywhere...' : 'Signing out...' );
		const answer = await hooks.signOut( { everywhere } );
		busy( out, false );
		if ( ! answer.ok ) return say( outStatus, problem( answer ) );
		mode = 'sign-in';
		dialog.close();

	};
	out.append( button( 'Sign out', signOut( false ) ), button( 'Sign out everywhere', signOut( true ) ) );
	parts.push( out, outStatus );
	if ( ! me.google ) parts.push( emailForm( me ) );
	parts.push( me.username ? changeForm( me ) : addForm() );
	parts.push( googlePart( me ) );
	if ( me.username && me.google ) parts.push( removeForm( me ) );
	return parts;

}

// The pass, for a supporter: which kind it is, and for a monthly one where to cancel it or change the
// card (Stripe's customer portal, SUPPORTER_MANAGE_LINK) or, without that link, to ask. Never folded
// away: someone paying every month finds how to stop at once (drive/site/legal.js's /refunds/).
function passPart( me ) {

	const box = document.createElement( 'div' );
	box.className = 'account-pass';
	const manage = me.purchase?.manage;
	const lines = [ Object.assign( paragraph( '⭐ Supporter Pass' ), { className: 'account-pass-title' } ) ];
	if ( me.subscribed ) {

		lines.push( paragraph( 'Monthly subscription. Cancel any time: you won\'t be charged again, and the pass stays until the end of the month you\'ve paid for.' ) );
		if ( manage ) lines.push( Object.assign( pageLink( manage, 'Manage subscription' ), { className: 'account-manage' } ), Object.assign( paragraph( 'Cancel, change your card or see your receipts on Stripe, with the email you paid with.' ), { className: 'account-note' } ) );
		else lines.push( linksLine( 'To cancel or change your card, ', [ '/contact/', 'get in touch' ], ' and it\'s done for you.' ) );

	} else if ( me.dayPassUntil ) {

		lines.push( paragraph( '24-hour pass. Paid once: it simply ends, nothing to cancel.' ) );

	} else {

		lines.push( paragraph( 'Yours for good. Paid once: nothing to cancel.' ) );

	}

	lines.push( linksLine( '', [ '/refunds/', 'Refunds' ], ' · ', [ '/contact/', 'Help' ] ) );
	box.append( ...lines );
	return box;

}

// What the pass part shows, so the panel is drawn again when it changes.
function passState( me ) {

	return me.supporter ? `${ me.subscribed ? 'month' : me.dayPassUntil ? 'day' : 'life' }:${ me.purchase?.manage ?? '' }` : 'none';

}

// A link to a page, in a new tab so the game stays open.
function pageLink( href, words ) {

	return Object.assign( document.createElement( 'a' ), { href, target: '_blank', rel: 'noopener', textContent: words } );

}

// A line of words and links: each [ href, words ] a link.
function linksLine( ...parts ) {

	const p = Object.assign( document.createElement( 'p' ), { className: 'account-note' } );
	p.append( ...parts.filter( part => part !== '' ).map( part => Array.isArray( part ) ? pageLink( ...part ) : part ) );
	return p;

}

// A username's account (no Google, whose email it would use): an email for its receipts, or none.
function emailForm( me ) {

	const { form, status, submit } = makeForm( 'account-email', 'Save' );
	const email = field( form, 'Email for receipts', { name: 'email', type: 'email', autocomplete: 'email', maxLength: 254, required: false, hint: 'Put on the checkout if you buy the pass, so the receipt comes to you. Leave it empty for none.' } );
	email.value = me.contactEmail ?? '';
	form.append( submit, status );
	form.addEventListener( 'submit', async event => {

		event.preventDefault();
		busy( form, true );
		say( status, 'Saving...' );
		const answer = await send( 'POST', '/api/account/email', { email: email.value.trim() } );
		busy( form, false );
		if ( ! answer.ok ) return say( status, problem( answer ) );
		say( status, answer.body.contactEmail ? 'Saved.' : 'Taken off.' );
		hooks.update( answer.body );

	} );
	return section( me.contactEmail ? 'Email for receipts' : 'Add an email for receipts', form );

}

// Changing the password: the username (hidden, for password managers), the current one and the new.
function changeForm( me ) {

	const { form, status, submit } = makeForm( 'account-password', 'Change password' );
	form.append( hiddenUsername( me ) );
	const current = field( form, 'Current password', { name: 'current', type: 'password', autocomplete: 'current-password' } );
	const next = field( form, 'New password', { name: 'password', type: 'password', autocomplete: 'new-password', minLength: PASSWORD_MIN, hint: 'This signs you out on your other devices.' } );
	form.append( submit, status );
	form.addEventListener( 'submit', async event => {

		event.preventDefault();
		if ( ! current.value ) return say( status, 'Type your current password.' );
		const wrong = passwordProblem( next.value, me.username );
		if ( wrong ) return say( status, `${ wrong }.` );
		busy( form, true );
		say( status, 'Changing it...' );
		const answer = await withRobot( form, status, token => send( 'POST', '/api/account/password', { current: current.value, password: next.value, ...( token ? { token } : {} ) } ) );
		busy( form, false );
		if ( ! answer ) return;
		if ( ! answer.ok ) return say( status, problem( answer ) );
		current.value = next.value = '';
		say( status, 'Password changed. Your other devices are signed out.' );
		toast( 'Password changed' );
		hooks.update( answer.body );

	} );
	return section( 'Change password', form );

}

// A Google account adding a username and password, to sign in either way: confirmed with Google's
// button (the Worker wants fresh proof it's the account's own Google, not only this browser's
// session).
function addForm() {

	const { form, status } = makeForm( 'account-add', '' );
	const username = field( form, 'Username', { name: 'username', autocomplete: 'username', minLength: 3, maxLength: 20, hint: '3 to 20 letters, digits, _ or -. Only you see it.' } );
	const password = field( form, 'Password', { name: 'password', type: 'password', autocomplete: 'new-password', minLength: PASSWORD_MIN, hint: `At least ${ PASSWORD_MIN } characters.` } );
	// What's typed, checked as the Worker will: the username, or null (said in status).
	const checked = () => {

		const name = cleanUsername( username.value );
		if ( ! name ) return say( status, 'Usernames are 3 to 20 letters (a to z), digits, _ or -.' ), null;
		const wrong = passwordProblem( password.value, name );
		if ( wrong ) return say( status, `${ wrong }.` ), null;
		return name;

	};

	form.append( paragraph( 'Then confirm it\'s you with Google:' ), googleConfirm( status, async credential => {

		const name = checked();
		if ( ! name ) return;
		busy( form, true );
		say( status, 'Adding it...' );
		const answer = await send( 'POST', '/api/account/password', { username: name, password: password.value, credential } );
		busy( form, false );
		if ( ! answer.ok ) return say( status, problem( answer ) );
		toast( 'You can sign in with your username now too' );
		hooks.update( answer.body );

	} ), status );
	form.addEventListener( 'submit', event => {

		event.preventDefault();
		if ( checked() ) say( status, 'Now confirm it\'s you with Google, just above.' );

	} );
	return section( 'Add a username and password', paragraph( 'Then you can sign in either way.' ), form );

}

// Linking Google (its button, its credential sent here with the account's password, as proof it's
// the account's owner), or unlinking it (Google's button again, for the Google account linked).
function googlePart( me ) {

	if ( me.google ) {

		if ( ! me.username ) return Object.assign( paragraph( 'To unlink Google, add a username and password first: it\'s your only way to sign in.' ), { className: 'account-hint' } );
		const status = statusLine();
		return section( 'Unlink Google', paragraph( 'You can sign in with your username and password instead. Confirm with Google to unlink it; this signs you out on your other devices.' ),
			googleConfirm( status, async credential => {

				say( status, 'Unlinking...' );
				const answer = await send( 'DELETE', '/api/account/google', { credential } );
				if ( ! answer.ok ) return say( status, problem( answer ) );
				toast( 'Google unlinked' );
				hooks.update( answer.body );

			} ), status );

	}

	if ( ! hooks.google ) return document.createDocumentFragment();
	const { form, status } = makeForm( 'account-link', '' );
	form.append( hiddenUsername( me ) );
	const password = field( form, 'Your password', { name: 'password', type: 'password', autocomplete: 'current-password' } );
	form.append( paragraph( 'Then choose your Google account:' ), googleConfirm( status, async credential => {

		if ( ! password.value ) return say( status, 'Type your password first.' );
		busy( form, true );
		say( status, 'Linking...' );
		const answer = await withRobot( form, status, token => send( 'POST', '/api/account/google', { credential, password: password.value, ...( token ? { token } : {} ) } ) );
		busy( form, false );
		if ( ! answer ) return;
		if ( ! answer.ok ) return say( status, problem( answer ) );
		password.value = '';
		toast( 'Google linked: you can sign in with it too' );
		hooks.update( answer.body );

	} ), status );
	form.addEventListener( 'submit', event => {

		event.preventDefault();
		say( status, password.value ? 'Now choose your Google account, just above.' : 'Type your password first.' );

	} );
	return section( 'Link Google', paragraph( 'Sign in with Google too, and get back in if you forget your password.' ), form );

}

// Taking the username and password off (Google is linked to sign in with): confirmed with the
// password, or with Google's button.
function removeForm( me ) {

	const { form, status, submit } = makeForm( 'account-remove', 'Remove username and password' );
	form.append( hiddenUsername( me ) );
	const password = field( form, 'Your password', { name: 'password', type: 'password', autocomplete: 'current-password' } );
	const done = answer => {

		if ( ! answer.ok ) return say( status, problem( answer ) );
		toast( 'Username and password removed' );
		hooks.update( answer.body );

	};

	form.append( submit, status );
	form.addEventListener( 'submit', async event => {

		event.preventDefault();
		if ( ! password.value ) return say( status, 'Type your password, or confirm with Google below.' );
		busy( form, true );
		say( status, 'Removing...' );
		const answer = await withRobot( form, status, token => send( 'DELETE', '/api/account/password', { password: password.value, ...( token ? { token } : {} ) } ) );
		busy( form, false );
		if ( answer ) done( answer );

	} );
	const google = hooks.google ? [ paragraph( 'Or confirm with Google:' ), googleConfirm( status, async credential => {

		say( status, 'Removing...' );
		done( await send( 'DELETE', '/api/account/password', { credential } ) );

	} ) ] : [];
	return section( 'Remove username and password', paragraph( 'You can sign in with Google instead. This signs you out on your other devices.' ), form, ...google );

}

// Google's button, its credential going to onCredential (not signing in), or words saying it
// isn't here. Drawn when its section is first opened (section), not while it's folded away.
function googleConfirm( status, onCredential ) {

	if ( ! hooks.google ) return paragraph( 'Google sign-in isn\'t available here right now.' );
	const slot = Object.assign( document.createElement( 'div' ), { className: 'account-google' } );
	slot.draw = () => hooks.drawGoogle( slot, onCredential );
	return slot;

}

// The account's username in a form, out of sight, so a password manager knows whose password it is.
function hiddenUsername( me ) {

	return Object.assign( document.createElement( 'input' ), { type: 'text', name: 'username', autocomplete: 'username', value: me.username, hidden: true, readOnly: true } );

}

// --- the robot check ---

// A place for Turnstile's widget (out of sight unless it wants a click).
function robotSlot() {

	return Object.assign( document.createElement( 'div' ), { className: 'account-robot' } );

}

// A robot check's token, or null (said in `status`) when it couldn't be had.
async function robot( form, status ) {

	let slot = form.querySelector( '.account-robot' );
	if ( ! slot ) {

		slot = robotSlot();
		const submit = form.querySelector( 'button[type="submit"]' );
		if ( submit ) submit.before( slot );
		else form.append( slot );

	}

	if ( ! hooks.siteKey ) {

		say( status, 'The robot check isn\'t set up here.' );
		return null;

	}

	try {

		return await robotCheck( hooks.siteKey, slot );

	} catch {

		say( status, 'The robot check didn\'t work. Try again.' );
		return null;

	}

}

// send() as `ask( token )` does it, and once more with a robot check's token if the Worker asks for
// one (too many wrong passwords for that username today). null when the check couldn't be had.
async function withRobot( form, status, ask ) {

	const answer = await ask( null );
	if ( answer.status !== 403 || answer.body?.reason !== 'robot' ) return answer;
	say( status, 'Checking you\'re not a robot...' );
	const token = await robot( form, status );
	if ( token === null ) return null;
	return ask( token );

}

// --- words and parts ---

// What a failed answer means, in words.
function problem( answer ) {

	if ( answer.status === 0 ) return UNREACHABLE;
	if ( answer.status === 429 && answer.body?.reason === 'wait' ) return `Wait ${ answer.retryAfter || 5 } seconds and try again.`;
	const said = typeof answer.body?.error === 'string' ? answer.body.error : '';
	if ( said ) return /[.!?]$/.test( said ) ? said : `${ said }.`;
	return 'That didn\'t work. Try again.';

}

function makeForm( className, words ) {

	const form = document.createElement( 'form' );
	form.className = `account-form ${ className }`;
	form.method = 'post';
	form.action = '#';
	form.noValidate = true;
	// (A form confirmed with Google's button alone has no words for one, and no submit button.)
	const submit = words ? Object.assign( document.createElement( 'button' ), { type: 'submit', className: 'primary', textContent: words } ) : null;
	return { form, status: statusLine(), submit };

}

// A labelled input added to `form` (its hint, if any, under it): the input.
function field( form, words, { name, type = 'text', autocomplete, minLength, maxLength, hint, required = true } ) {

	const id = `account-field-${ ++ ids }`;
	const label = Object.assign( document.createElement( 'label' ), { htmlFor: id, textContent: words } );
	const input = Object.assign( document.createElement( 'input' ), { id, name, type, autocomplete, required } );
	if ( type === 'text' ) {

		input.autocapitalize = 'none';
		input.spellcheck = false;
		input.setAttribute( 'autocorrect', 'off' );

	}

	if ( type === 'password' ) input.maxLength = PASSWORD_MAX_BYTES;
	if ( minLength ) input.minLength = minLength;
	if ( maxLength ) input.maxLength = maxLength;
	form.append( label, input );
	if ( hint ) {

		const p = Object.assign( paragraph( hint ), { className: 'account-hint', id: `${ id }-hint` } );
		input.setAttribute( 'aria-describedby', p.id );
		form.append( p );

	}

	return input;

}

// A change folded away under its heading, opened with a tap on it; opening one folds the others
// (the details' shared name). Its forms are in the page all along, so password managers still find
// them; Google's buttons in it are drawn the first time it opens.
function section( heading, ...content ) {

	const details = document.createElement( 'details' );
	details.className = 'account-section';
	details.setAttribute( 'name', 'account-change' );
	details.append( Object.assign( document.createElement( 'summary' ), { textContent: heading } ), ...content );
	details.addEventListener( 'toggle', () => {

		if ( ! details.open ) return;
		// Opened, the others fold (for a browser without the shared name too).
		for ( const other of dialog.querySelectorAll( 'details[open]' ) ) if ( other !== details ) other.open = false;
		for ( const slot of details.querySelectorAll( '.account-google' ) ) {

			if ( slot.draw ) slot.draw();
			slot.draw = null;

		}

	} );
	return details;

}

function item( kind, value ) {

	const li = document.createElement( 'li' );
	li.append( Object.assign( document.createElement( 'span' ), { textContent: kind } ), Object.assign( document.createElement( 'b' ), { textContent: value } ) );
	return li;

}

function paragraph( text ) {

	return Object.assign( document.createElement( 'p' ), { textContent: text } );

}

function statusLine() {

	const p = Object.assign( document.createElement( 'p' ), { className: 'account-status' } );
	p.setAttribute( 'role', 'status' );
	return p;

}

function say( status, text ) {

	status.textContent = text;

}

// The form's fields and buttons disabled while it's sent, and back after. Disabling the field or
// button with the focus drops it to the page, where the next key would be the game's, so it's put
// back where it was once the form's done.
function busy( form, on ) {

	if ( on ) form.focused = form.contains( document.activeElement ) ? document.activeElement : null;
	for ( const el of form.querySelectorAll( 'button, input' ) ) el.disabled = on;
	if ( ! on && form.focused?.isConnected ) form.focused.focus();
	if ( ! on ) form.focused = null;

}

function button( text, onClick ) {

	const b = Object.assign( document.createElement( 'button' ), { type: 'button', textContent: text } );
	b.addEventListener( 'click', onClick );
	return b;

}
