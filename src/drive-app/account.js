import './account.css';
import { robotCheck, send } from './api.js';
import { PASSWORD_MAX_BYTES, PASSWORD_MIN, cleanUsername, passwordProblem } from './password-rules.js';
import { toast } from './screens.js';

// The account panel (docs/world-drive.md, "Username and password accounts"): its own chunk, loaded
// the first time it's opened (supporter.js's openAccount), so nothing of it is on the first load.
// Signed out: "Sign in with Google" (with its sign-in set up) and a username and password form, to
// sign in or create an account. Signed in: what the account signs in with, changing the password
// (or adding a username and password to a Google account), linking or unlinking Google, and signing
// out here or everywhere. The forms are real forms with labels and autocomplete (username,
// current-password, new-password), so password managers fill them and offer to save. A password is
// only ever sent to the Worker's sign-in, sign-up and password posts.

const UNREACHABLE = 'Couldn\'t reach World Drive. Check your connection and try again.';
const NO_RECOVERY = 'There\'s no email here, so a forgotten password can\'t be recovered, unless you also link Google. Keep it in a password manager.';

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
		dialog.addEventListener( 'click', event => event.target === dialog && dialog.close() );
		document.body.append( dialog );
		hooks.onChange( () => dialog.open && draw() );

	}

	draw( true );
	if ( ! dialog.open ) dialog.showModal();

}

function stateOf( me ) {

	return me?.signedIn ? `in:${ me.username ?? '' }:${ me.google ? 1 : 0 }:${ me.email }` : `out:${ mode }`;

}

function draw( always = false ) {

	const me = hooks.me;
	const state = stateOf( me );
	if ( ! always && state === drawnFor ) return;
	drawnFor = state;
	const close = Object.assign( button( '×', () => dialog.close() ), { className: 'close' } );
	close.setAttribute( 'aria-label', 'Close' );
	const title = Object.assign( document.createElement( 'h2' ), { id: 'account-title', textContent: me?.signedIn ? 'Your account' : 'Sign in' } );
	const header = document.createElement( 'header' );
	header.append( title, close );
	dialog.replaceChildren( header, ...( me?.signedIn ? signedIn( me ) : signedOut() ) );

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
	form.append( Object.assign( paragraph( NO_RECOVERY ), { className: 'account-note' } ), robotSlot(), submit, status );
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
		const answer = await send( 'POST', '/api/account/sign-up', { username: name, password: password.value, token } );
		busy( form, false );
		if ( ! answer.ok ) return say( status, problem( answer ) );
		signedInNow( answer.body );

	} );
	return form;

}

function signedInNow( body ) {

	hooks.update( body );
	toast( body.supporter ? 'Signed in: Supporter Pass unlocked' : `Signed in as ${ hooks.who() }` );
	dialog.close();

}

// --- signed in ---

function signedIn( me ) {

	const parts = [];
	const list = document.createElement( 'ul' );
	list.className = 'account-ways';
	list.append(
		item( 'Google', me.google ? me.email : 'not linked' ),
		item( 'Username', me.username ?? 'none' ),
	);
	parts.push( Object.assign( paragraph( 'You sign in with:' ), { className: 'account-label' } ), list );
	if ( me.supporter ) parts.push( Object.assign( paragraph( '⭐ Supporter Pass' ), { className: 'account-pass' } ) );
	parts.push( me.username ? changeForm( me ) : addForm() );
	parts.push( googlePart( me ) );
	if ( me.username && me.google ) {

		parts.push( section( 'Username and password', paragraph( 'You can sign in with Google instead, and take the username and password off.' ),
			actionButton( 'Remove username and password', 'Removing...', () => send( 'DELETE', '/api/account/password', {} ), 'Username and password removed' ) ) );

	}

	const out = document.createElement( 'div' );
	out.className = 'account-out';
	out.append(
		button( 'Sign out', async () => await hooks.signOut() && dialog.close() ),
		button( 'Sign out everywhere', async () => await hooks.signOut( { everywhere: true } ) && dialog.close() ),
	);
	parts.push( out );
	return parts;

}

// Changing the password: the username (hidden, for password managers), the current one and the new.
function changeForm( me ) {

	const { form, status, submit } = makeForm( 'account-password', 'Change password' );
	const name = Object.assign( document.createElement( 'input' ), { type: 'text', name: 'username', autocomplete: 'username', value: me.username, hidden: true, readOnly: true } );
	form.append( name );
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

// A Google account adding a username and password, to sign in either way.
function addForm() {

	const { form, status, submit } = makeForm( 'account-add', 'Add username and password' );
	const username = field( form, 'Username', { name: 'username', autocomplete: 'username', minLength: 3, maxLength: 20, hint: '3 to 20 letters, digits, _ or -. Only you see it.' } );
	const password = field( form, 'Password', { name: 'password', type: 'password', autocomplete: 'new-password', minLength: PASSWORD_MIN, hint: `At least ${ PASSWORD_MIN } characters.` } );
	form.append( submit, status );
	form.addEventListener( 'submit', async event => {

		event.preventDefault();
		const name = cleanUsername( username.value );
		if ( ! name ) return say( status, 'Usernames are 3 to 20 letters (a to z), digits, _ or -.' );
		const wrong = passwordProblem( password.value, name );
		if ( wrong ) return say( status, `${ wrong }.` );
		busy( form, true );
		say( status, 'Adding it...' );
		const answer = await send( 'POST', '/api/account/password', { username: name, password: password.value } );
		busy( form, false );
		if ( ! answer.ok ) return say( status, problem( answer ) );
		toast( 'You can sign in with your username now too' );
		hooks.update( answer.body );

	} );
	return section( 'Add a username and password', paragraph( 'Then you can sign in either way.' ), form );

}

// Linking Google (its button, its credential sent here), or unlinking it.
function googlePart( me ) {

	if ( me.google ) {

		const why = me.username ? 'You can sign in with your username and password instead.' : 'Add a username and password first: Google is your only way to sign in.';
		const unlink = actionButton( 'Unlink Google', 'Unlinking...', () => send( 'DELETE', '/api/account/google', {} ), 'Google unlinked' );
		unlink.querySelector( 'button' ).disabled = ! me.username;
		return section( 'Google', paragraph( why ), unlink );

	}

	if ( ! hooks.google ) return document.createDocumentFragment();
	const status = statusLine();
	const slot = Object.assign( document.createElement( 'div' ), { className: 'account-google' } );
	hooks.drawGoogle( slot, async credential => {

		say( status, 'Linking...' );
		const answer = await send( 'POST', '/api/account/google', { credential } );
		if ( ! answer.ok ) return say( status, problem( answer ) );
		toast( 'Google linked: you can sign in with it too' );
		hooks.update( answer.body );

	} );
	return section( 'Link Google', paragraph( 'Sign in with Google too, and get back in if you forget your password.' ), slot, status );

}

// A button doing `run` (a request answering /api/me's body), saying `doing` meanwhile and `done` after.
function actionButton( words, doing, run, done ) {

	const wrap = document.createElement( 'div' );
	const status = statusLine();
	const b = button( words, async () => {

		b.disabled = true;
		say( status, doing );
		const answer = await run();
		b.disabled = false;
		if ( ! answer.ok ) return say( status, problem( answer ) );
		toast( done );
		hooks.update( answer.body );

	} );
	wrap.append( b, status );
	return wrap;

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
		form.querySelector( 'button[type="submit"]' ).before( slot );

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
	const submit = Object.assign( document.createElement( 'button' ), { type: 'submit', className: 'primary', textContent: words } );
	return { form, status: statusLine(), submit };

}

// A labelled input added to `form` (its hint, if any, under it): the input.
function field( form, words, { name, type = 'text', autocomplete, minLength, maxLength, hint } ) {

	const id = `account-field-${ ++ ids }`;
	const label = Object.assign( document.createElement( 'label' ), { htmlFor: id, textContent: words } );
	const input = Object.assign( document.createElement( 'input' ), { id, name, type, autocomplete, required: true } );
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

function section( heading, ...content ) {

	const s = document.createElement( 'section' );
	s.className = 'account-section';
	s.append( Object.assign( document.createElement( 'h3' ), { textContent: heading } ), ...content );
	return s;

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

function busy( form, on ) {

	for ( const el of form.querySelectorAll( 'button, input' ) ) el.disabled = on;

}

function button( text, onClick ) {

	const b = Object.assign( document.createElement( 'button' ), { type: 'button', textContent: text } );
	b.addEventListener( 'click', onClick );
	return b;

}
