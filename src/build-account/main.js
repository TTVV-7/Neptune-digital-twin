import '../build-home/style.css';
import './style.css';
import { robotCheck, send } from '../drive-app/api.js';
import { PLANS } from '../build-plans.js';
import { PASSWORD_MAX_BYTES, PASSWORD_MIN, cleanUsername, passwordProblem } from '../drive-app/password-rules.js';

// World Drive Build's account page (worlddrive.app/build/account/, drive/build/account/index.html,
// docs/build.md): one page, its sections reached by their anchors (#profile, #security, #billing,
// #usage, #branding, #apps, #links, #data, #delete). It reads /build/api/home (who's signed in, and
// Google's client id), /build/api/me (the plan and what buying is set to) and /build/api/account
// (worker/drive/build-account.js: connected apps, share links, payments, usage), and /api/config
// for the robot check. Buying and managing Build Pro go through Stripe's pages (billing.js's
// billing/checkout and billing/portal); how the account signs in is changed through World Drive's
// own /api/account/* (logins.js), as the game's account panel (src/drive-app/account.js) does, with
// the same fresh proof: the password, or Google's button for the account's own Google account.
//
// Build stays cookieless apart from the session cookie (no analytics or ads here), and nothing
// about the account is kept in the browser.

const $ = id => document.getElementById( id );
const API = '/build/api/';
const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';
// Who to write to (drive/site/legal.js's contact email, put in by vite.drive.config.js's buildApp).
const SUPPORT = typeof __BUILD_SUPPORT_EMAIL__ === 'string' && __BUILD_SUPPORT_EMAIL__ ? __BUILD_SUPPORT_EMAIL__ : 'support@worlddrive.app';
const UNREACHABLE = 'Couldn\'t reach World Drive. Check your connection and try again.';
const LOGO_SIZE = 512;

let home = null;
let me = null;
let account = null;
let config = null;
let ids = 0;

// --- talking to the server -----------------------------------------------------------------

// A /build/api/ call: its JSON (null for a 204), or an Error with the status and what was said.
async function call( method, path, body ) {

	const init = { method, headers: { Accept: 'application/json' } };
	if ( method !== 'GET' ) {

		init.headers[ 'Content-Type' ] = 'application/json';
		init.body = JSON.stringify( body ?? {} );

	}

	const res = await fetch( API + path, init );
	const data = res.status === 204 ? null : await res.json().catch( () => null );
	if ( ! res.ok ) throw Object.assign( new Error( data?.error ?? `error ${ res.status }` ), { status: res.status, body: data ?? {} } );
	return data;

}

function toast( text ) {

	const el = $( 'toast' );
	el.textContent = text;
	el.hidden = false;
	clearTimeout( toast.timer );
	toast.timer = setTimeout( () => el.hidden = true, 5000 );

}

// What a failed answer means, in words (send()'s { status, body }, or call()'s Error).
function problem( answer ) {

	if ( answer.status === 0 ) return UNREACHABLE;
	if ( answer.status === 429 && answer.body?.reason === 'wait' ) return `Wait ${ answer.retryAfter || 5 } seconds and try again.`;
	const said = typeof answer.body?.error === 'string' ? answer.body.error : answer.message ?? '';
	if ( said ) return /[.!?]$/.test( said ) ? said : `${ said }.`;
	return 'That didn\'t work. Try again.';

}

// --- small parts -------------------------------------------------------------------------

function el( tag, className = '', text = '' ) {

	const element = document.createElement( tag );
	if ( className ) element.className = className;
	if ( text ) element.textContent = text;
	return element;

}

function paragraph( text, className = '' ) {

	return el( 'p', className, text );

}

function button( text, onClick, className = 'button' ) {

	const b = el( 'button', className, text );
	b.type = 'button';
	b.addEventListener( 'click', onClick );
	return b;

}

function link( text, href ) {

	return Object.assign( el( 'a', '', text ), { href } );

}

// A sentence with links in it: parts are text or [ words, href ].
function sentence( className, ...parts ) {

	const p = el( 'p', className );
	for ( const part of parts ) p.append( Array.isArray( part ) ? link( ...part ) : part );
	return p;

}

function statusLine() {

	const p = el( 'p', 'status-line' );
	p.setAttribute( 'role', 'status' );
	return p;

}

function say( status, text ) {

	status.textContent = text;

}

// The form's fields and buttons off while it's sent, and back after.
function busy( form, on ) {

	for ( const field of form.querySelectorAll( 'button, input' ) ) field.disabled = on;

}

// A row of facts: [ [ name, value ] ].
function facts( rows ) {

	const dl = el( 'dl', 'facts' );
	for ( const [ name, value ] of rows ) dl.append( el( 'dt', '', name ), value instanceof Node ? wrap( 'dd', value ) : el( 'dd', '', value ) );
	return dl;

}

function wrap( tag, child ) {

	const element = el( tag );
	element.append( child );
	return element;

}

function makeForm( className, words ) {

	const form = el( 'form', `account-form ${ className }` );
	form.method = 'post';
	form.action = '#';
	form.noValidate = true;
	const submit = words ? Object.assign( el( 'button', 'button', words ), { type: 'submit' } ) : null;
	return { form, status: statusLine(), submit };

}

// A labelled input added to `form` (its hint under it): the input.
function field( form, words, { name, type = 'text', autocomplete, minLength, maxLength, hint, required = true } ) {

	const id = `account-field-${ ++ ids }`;
	const label = Object.assign( el( 'label', '', words ), { htmlFor: id } );
	const input = Object.assign( el( 'input' ), { id, name, type, autocomplete, required } );
	if ( type === 'text' ) {

		input.autocapitalize = 'none';
		input.spellcheck = false;

	}

	if ( type === 'password' ) input.maxLength = PASSWORD_MAX_BYTES;
	if ( minLength ) input.minLength = minLength;
	if ( maxLength ) input.maxLength = maxLength;
	form.append( label, input );
	if ( hint ) {

		const p = Object.assign( paragraph( hint, 'hint' ), { id: `${ id }-hint` } );
		input.setAttribute( 'aria-describedby', p.id );
		form.append( p );

	}

	return input;

}

// The account's username in a form, out of sight, so a password manager knows whose password it is.
function hiddenUsername() {

	return Object.assign( el( 'input' ), { type: 'text', name: 'username', autocomplete: 'username', value: account.account.username ?? '', hidden: true, readOnly: true } );

}

// A rarer change folded away under its heading; Google's buttons in it are drawn when it's opened.
function folded( heading, ...content ) {

	const details = el( 'details', 'fold' );
	details.append( el( 'summary', '', heading ), ...content );
	details.addEventListener( 'toggle', () => {

		if ( ! details.open ) return;
		for ( const slot of details.querySelectorAll( '.google-confirm' ) ) {

			slot.draw?.();
			slot.draw = null;

		}

	} );
	return details;

}

const dateOf = time => new Date( time ).toLocaleDateString( 'en-CA', { year: 'numeric', month: 'long', day: 'numeric' } );

function money( amount, currency ) {

	if ( ! Number.isFinite( amount ) ) return '';
	try {

		return new Intl.NumberFormat( 'en-US', { style: 'currency', currency: ( currency || 'usd' ).toUpperCase() } ).format( amount / 100 );

	} catch {

		return `${ ( amount / 100 ).toFixed( 2 ) } ${ currency ?? '' }`.trim();

	}

}

// --- Google's button ---------------------------------------------------------------------

// Who the next Google credential is for: a confirming button's onCredential, or null for signing in.
let credentialFor = null;
let google = null;

function loadGoogle() {

	google ??= new Promise( ( resolve, reject ) => {

		const script = document.createElement( 'script' );
		script.src = GOOGLE_SCRIPT;
		script.async = true;
		script.onload = () => {

			const id = window.google?.accounts?.id;
			if ( ! id ) return reject( new Error( 'Google sign-in didn\'t load' ) );
			id.initialize( { client_id: home.googleClientId, callback: ( { credential } ) => ( credentialFor ?? signIn )( credential ), ux_mode: 'popup', auto_select: false } );
			resolve( id );

		};
		script.onerror = () => reject( new Error( 'Google sign-in didn\'t load' ) );
		document.head.append( script );

	} ).catch( err => {

		google = null;
		throw err;

	} );
	return google;

}

function drawGoogle( slot, { onCredential = null, text = 'signin_with' } = {} ) {

	loadGoogle().then( id => {

		if ( slot.isConnected ) id.renderButton( slot, { theme: 'filled_black', size: 'medium', text, shape: 'pill', click_listener: () => credentialFor = onCredential } );

	} ).catch( () => {

		slot.textContent = 'Google sign-in didn\'t load. Check your connection or ad blocker, then reload.';

	} );

}

// Google's button for fresh proof, its credential going to onCredential (not signing in). Drawn when
// its folded section opens, or at once with `now`.
function googleConfirm( onCredential, { now = false } = {} ) {

	if ( ! home?.googleClientId ) return paragraph( 'Google sign-in isn\'t available here right now.', 'hint' );
	const slot = el( 'div', 'google-confirm' );
	slot.draw = () => drawGoogle( slot, { onCredential, text: 'continue_with' } );
	if ( now ) queueMicrotask( () => {

		slot.draw?.();
		slot.draw = null;

	} );
	return slot;

}

async function signIn( credential ) {

	try {

		await call( 'POST', 'session', { credential } );
		await load();
		toast( `Signed in as ${ home.user.email }` );

	} catch ( err ) {

		toast( `Couldn't sign in: ${ err.message }` );

	}

}

// --- the robot check (only when the Worker asks, after wrong passwords) ---------------------

async function withRobot( form, status, ask ) {

	const answer = await ask( null );
	if ( answer.status !== 403 || answer.body?.reason !== 'robot' ) return answer;
	say( status, 'Checking you\'re not a robot...' );
	if ( ! config?.turnstileSiteKey ) {

		say( status, 'The robot check isn\'t set up here.' );
		return null;

	}

	let slot = form.querySelector( '.robot' );
	if ( ! slot ) {

		slot = el( 'div', 'robot' );
		form.append( slot );

	}

	try {

		return ask( await robotCheck( config.turnstileSiteKey, slot ) );

	} catch {

		say( status, 'The robot check didn\'t work. Try again.' );
		return null;

	}

}

// --- Profile -----------------------------------------------------------------------------

function showProfile() {

	const a = account.account;
	const body = $( 'profile-body' );
	body.replaceChildren( facts( [
		[ 'Name', a.name || a.username || 'None' ],
		[ 'Google account', a.google ? a.email : 'Not linked' ],
		[ 'Username', a.username ?? 'None' ],
		[ 'Member since', a.createdAt ? dateOf( a.createdAt ) : 'Unknown' ],
	] ) );
	if ( a.google ) {

		body.append( paragraph( `Receipts and billing emails go to ${ a.email }. Your name and email come from Google: change them there.`, 'hint' ) );
		return;

	}

	// A username's account has no email of Google's: one for its receipts, or none.
	const { form, status, submit } = makeForm( 'email-form', 'Save' );
	const email = field( form, 'Email for receipts', { name: 'email', type: 'email', autocomplete: 'email', maxLength: 254, required: false, hint: 'Put on Stripe\'s checkout so your receipts come to you, and how support knows it\'s you. Not checked yet. Leave it empty for none.' } );
	email.value = a.contactEmail;
	form.append( submit, status );
	form.addEventListener( 'submit', async event => {

		event.preventDefault();
		busy( form, true );
		say( status, 'Saving...' );
		const answer = await send( 'POST', '/api/account/email', { email: email.value.trim() } );
		busy( form, false );
		if ( ! answer.ok ) return say( status, problem( answer ) );
		say( status, answer.body.contactEmail ? 'Saved.' : 'Taken off.' );
		account.account.contactEmail = answer.body.contactEmail ?? '';

	} );
	body.append( form );

}

// --- Sign-in & security ------------------------------------------------------------------

// After a change: said, and everything read again and drawn afresh.
async function changed( words ) {

	toast( words );
	await load();

}

function showSecurity() {

	const a = account.account;
	const body = $( 'security-body' );
	const ways = el( 'ul', 'ways' );
	ways.append(
		wrap( 'li', document.createTextNode( a.google ? `Google: ${ a.email }` : 'Google: not linked' ) ),
		wrap( 'li', document.createTextNode( a.username ? `Username and password: ${ a.username }` : 'Username and password: none' ) ),
	);
	body.replaceChildren( paragraph( 'You sign in with:', 'label' ), ways );

	const out = el( 'div', 'row' );
	const outStatus = statusLine();
	out.append(
		button( 'Sign out here', async () => {

			await call( 'DELETE', 'session' ).catch( () => {} );
			location.href = '/build/';

		}, 'button quiet' ),
		button( 'Sign out everywhere', async () => {

			if ( ! window.confirm( 'Sign out on every device, this one too? Connected apps (Claude) are disconnected as well.' ) ) return;
			say( outStatus, 'Signing out everywhere...' );
			const answer = await send( 'POST', '/api/account/sign-out-everywhere' );
			if ( ! answer.ok ) return say( outStatus, problem( answer ) );
			location.href = '/build/';

		}, 'button quiet' ),
	);
	body.append( out, outStatus, paragraph( 'Sign out everywhere also disconnects Claude and any other connected app.', 'hint' ) );
	if ( config && config.passwords === false ) return;
	body.append( a.username ? changeForm() : addForm() );
	body.append( googlePart() );
	if ( a.username && a.google ) body.append( removeForm() );

}

// Changing the password: the current one and the new.
function changeForm() {

	const { form, status, submit } = makeForm( 'password-form', 'Change password' );
	form.append( hiddenUsername() );
	const current = field( form, 'Current password', { name: 'current', type: 'password', autocomplete: 'current-password' } );
	const next = field( form, 'New password', { name: 'password', type: 'password', autocomplete: 'new-password', minLength: PASSWORD_MIN, hint: `At least ${ PASSWORD_MIN } characters. This signs you out on your other devices.` } );
	form.append( submit, status );
	form.addEventListener( 'submit', async event => {

		event.preventDefault();
		if ( ! current.value ) return say( status, 'Type your current password.' );
		const wrong = passwordProblem( next.value, account.account.username );
		if ( wrong ) return say( status, `${ wrong }.` );
		busy( form, true );
		say( status, 'Changing it...' );
		const answer = await withRobot( form, status, token => send( 'POST', '/api/account/password', { current: current.value, password: next.value, ...( token ? { token } : {} ) } ) );
		busy( form, false );
		if ( ! answer ) return;
		if ( ! answer.ok ) return say( status, problem( answer ) );
		await changed( 'Password changed. Your other devices are signed out.' );

	} );
	return folded( 'Change password', form );

}

// A Google account adding a username and password, confirmed with Google's button.
function addForm() {

	const { form, status } = makeForm( 'add-form', '' );
	const username = field( form, 'Username', { name: 'username', autocomplete: 'username', minLength: 3, maxLength: 20, hint: '3 to 20 letters, digits, _ or -. Only you see it.' } );
	const password = field( form, 'Password', { name: 'password', type: 'password', autocomplete: 'new-password', minLength: PASSWORD_MIN, hint: `At least ${ PASSWORD_MIN } characters.` } );
	const checked = () => {

		const name = cleanUsername( username.value );
		if ( ! name ) return say( status, 'Usernames are 3 to 20 letters (a to z), digits, _ or -.' ), null;
		const wrong = passwordProblem( password.value, name );
		if ( wrong ) return say( status, `${ wrong }.` ), null;
		return name;

	};

	form.append( paragraph( 'Then confirm it\'s you with Google:' ), googleConfirm( async credential => {

		const name = checked();
		if ( ! name ) return;
		busy( form, true );
		say( status, 'Adding it...' );
		const answer = await send( 'POST', '/api/account/password', { username: name, password: password.value, credential } );
		busy( form, false );
		if ( ! answer.ok ) return say( status, problem( answer ) );
		await changed( 'You can sign in with your username now too' );

	} ), status );
	form.addEventListener( 'submit', event => {

		event.preventDefault();
		if ( checked() ) say( status, 'Now confirm it\'s you with Google, just above.' );

	} );
	return folded( 'Add a username and password', paragraph( 'Then you can sign in either way.' ), form );

}

// Linking Google (with the account's password as proof), or unlinking it (Google's button again).
function googlePart() {

	const a = account.account;
	if ( a.google ) {

		if ( ! a.username ) return paragraph( 'To unlink Google, add a username and password first: it\'s your only way to sign in.', 'hint' );
		const status = statusLine();
		return folded( 'Unlink Google', paragraph( 'You can sign in with your username and password instead. Confirm with Google to unlink it; this signs you out on your other devices.' ),
			googleConfirm( async credential => {

				say( status, 'Unlinking...' );
				const answer = await send( 'DELETE', '/api/account/google', { credential } );
				if ( ! answer.ok ) return say( status, problem( answer ) );
				await changed( 'Google unlinked' );

			} ), status );

	}

	if ( ! home?.googleClientId ) return document.createDocumentFragment();
	const { form, status } = makeForm( 'link-form', '' );
	form.append( hiddenUsername() );
	const password = field( form, 'Your password', { name: 'password', type: 'password', autocomplete: 'current-password' } );
	form.append( paragraph( 'Then choose your Google account:' ), googleConfirm( async credential => {

		if ( ! password.value ) return say( status, 'Type your password first.' );
		busy( form, true );
		say( status, 'Linking...' );
		const answer = await withRobot( form, status, token => send( 'POST', '/api/account/google', { credential, password: password.value, ...( token ? { token } : {} ) } ) );
		busy( form, false );
		if ( ! answer ) return;
		if ( ! answer.ok ) return say( status, problem( answer ) );
		await changed( 'Google linked: you can sign in with it too' );

	} ), status );
	form.addEventListener( 'submit', event => {

		event.preventDefault();
		say( status, password.value ? 'Now choose your Google account, just above.' : 'Type your password first.' );

	} );
	return folded( 'Link Google', paragraph( 'Sign in with Google too, and get back in if you forget your password.' ), form );

}

// Taking the username and password off (Google is linked): confirmed with the password or Google.
function removeForm() {

	const { form, status, submit } = makeForm( 'remove-form', 'Remove username and password' );
	form.append( hiddenUsername() );
	const password = field( form, 'Your password', { name: 'password', type: 'password', autocomplete: 'current-password' } );
	const done = async answer => {

		if ( ! answer.ok ) return say( status, problem( answer ) );
		await changed( 'Username and password removed' );

	};

	form.append( submit, status );
	form.addEventListener( 'submit', async event => {

		event.preventDefault();
		if ( ! password.value ) return say( status, 'Type your password, or confirm with Google below.' );
		busy( form, true );
		say( status, 'Removing...' );
		const answer = await withRobot( form, status, token => send( 'DELETE', '/api/account/password', { password: password.value, ...( token ? { token } : {} ) } ) );
		busy( form, false );
		if ( answer ) await done( answer );

	} );
	return folded( 'Remove username and password', paragraph( 'You can sign in with Google instead. This signs you out on your other devices.' ), form,
		paragraph( 'Or confirm with Google:' ), googleConfirm( async credential => done( await send( 'DELETE', '/api/account/password', { credential } ) ) ) );

}

// --- Plan & billing ----------------------------------------------------------------------

const ENDED = { canceled: 'cancelled', unpaid: 'stopped after payments failed', refunded: 'refunded', disputed: 'charged back', incomplete_expired: 'not started' };

function showBilling() {

	const { plan, premium } = me;
	const billing = premium.billing ?? {};
	const body = $( 'billing-body' );
	const head = el( 'div', 'plan-line' );
	head.append( el( 'span', `tier tier-${ plan.tier }`, PLANS[ plan.tier ]?.name ?? plan.tier ) );
	body.replaceChildren( head );

	if ( plan.tier === 'owner' ) {

		body.append( paragraph( 'Everything, with 3D map views that are never counted. Never billed.' ) );
		return;

	}

	if ( plan.subscribed ) {

		const every = plan.interval === 'year' ? 'billed yearly' : plan.interval === 'month' ? 'billed monthly' : 'a subscription';
		head.append( el( 'span', 'price', plan.priceLabel ? `${ plan.priceLabel }, ${ every }` : every ) );
		if ( plan.pastDue ) body.append( paragraph( 'Your last payment didn\'t go through. Stripe tries the card again over the next few days: update it in Manage billing to keep Build Pro.', 'warning' ) );
		if ( plan.renewsAt ) body.append( paragraph( plan.cancelAtPeriodEnd
			? `Cancels on ${ dateOf( plan.renewsAt ) }. Build Pro stays on until then, and you won't be charged again.`
			: `Renews on ${ dateOf( plan.renewsAt ) }.`, plan.cancelAtPeriodEnd ? 'notice' : '' ) );
		if ( plan.interval === 'month' && billing.annual ) body.append( paragraph( `Switch to yearly in Manage billing: ${ billing.annual }, two months free.`, 'hint' ) );

	} else if ( plan.tier === 'pro' && plan.comped ) {

		body.append( paragraph( 'Build Pro, given to you by World Drive. Nothing is billed.' ) );

	} else if ( plan.tier === 'pro' ) {

		body.append( paragraph( 'Build Pro.' ) );

	}

	if ( billing.portal ) {

		const portal = button( 'Manage billing', async () => {

			portal.disabled = true;
			try {

				location.href = ( await call( 'POST', 'billing/portal' ) ).url;

			} catch ( err ) {

				toast( problem( err ) );
				portal.disabled = false;

			}

		} );
		portal.id = 'manage-billing';
		body.append( wrap( 'div', portal ), paragraph( 'On Stripe: cancel (it ends at the end of the period you\'ve paid for), switch between monthly and yearly, change your card or billing address, and download invoices.', 'hint' ) );

	}

	if ( plan.tier === 'free' ) {

		if ( plan.status && ENDED[ plan.status ] ) body.append( paragraph( `Your Build Pro subscription was ${ ENDED[ plan.status ] }. You're on the free plan.`, 'notice' ) );
		body.append( paragraph( `Free: ${ PLANS.free.blurb } Build Pro: ${ PLANS.pro.blurb }` ) );
		body.append( buy( billing ) );
		body.append( paragraph( 'Back on the free plan, projects past the first are kept and never deleted, and you can still open and edit them; a new one past the free plan\'s limit needs Build Pro.', 'hint' ) );

	}

	body.append( payments() );
	body.append( sentence( 'hint', `Full refund within 14 days of your first payment, no questions asked: write to ${ SUPPORT }. Renewals aren't refunded except for billing errors or duplicates, or where the law says so. See the `, [ 'refund policy', '/build/refunds/' ], ' and the ', [ 'terms', '/build/terms/' ], '.' ) );

}

// Free plan: buying Build Pro, monthly or yearly, through Stripe's checkout (or "opens soon").
function buy( billing ) {

	const box = el( 'div', 'buy' );
	if ( ! billing.enabled ) {

		box.append( paragraph( 'Build Pro opens soon.', 'notice' ) );
		return box;

	}

	const row = el( 'div', 'row' );
	const status = statusLine();
	for ( const [ interval, words, extra ] of [ [ 'month', billing.monthly, '' ], [ 'year', billing.annual, ' · two months free' ] ] ) {

		const b = button( `Go Build Pro · ${ words }${ extra }`, async () => {

			for ( const other of row.querySelectorAll( 'button' ) ) other.disabled = true;
			say( status, 'Opening Stripe\'s checkout...' );
			try {

				location.href = ( await call( 'POST', 'billing/checkout', { interval } ) ).url;

			} catch ( err ) {

				say( status, problem( err ) );
				for ( const other of row.querySelectorAll( 'button' ) ) other.disabled = false;

			}

		} );
		b.dataset.interval = interval;
		row.append( b );

	}

	box.append( row, status, paragraph( 'Build Pro renews automatically at the price you choose until you cancel. Cancel any time here, under Manage billing: it ends at the end of the period you\'ve paid for. One named person per subscription. Prices in US dollars; tax is added where it applies.', 'hint' ) );
	return box;

}

function payments() {

	const box = el( 'div', 'payments' );
	box.append( el( 'h3', '', 'Payments' ) );
	if ( ! account.payments.length ) {

		box.append( paragraph( 'None yet.', 'hint' ) );
		return box;

	}

	const table = el( 'table' );
	table.innerHTML = '<thead><tr><th scope="col">Date</th><th scope="col">Amount</th><th scope="col">Status</th></tr></thead>';
	const rows = el( 'tbody' );
	for ( const p of account.payments ) {

		const tr = el( 'tr' );
		const status = p.refunded ? 'Refunded' : p.status === 'paid' ? 'Paid' : p.status === 'payment_failed' ? 'Failed' : p.status === 'action_required' ? 'Needs your confirmation' : p.status;
		tr.append( el( 'td', '', dateOf( p.date ) ), el( 'td', 'mono', money( p.amount, p.currency ) ), el( 'td', '', status ) );
		rows.append( tr );

	}

	table.append( rows );
	box.append( table );
	if ( me.premium.billing?.portal ) box.append( paragraph( 'Invoices and receipts to download are in Manage billing.', 'hint' ) );
	return box;

}

// Back from Stripe's checkout (?checkout=done): ask until Build Pro shows (the webhook can take a
// moment). Only the plan is asked for meanwhile, so nothing being typed on the page is redrawn
// under the user; the page is shown again once, when Build Pro is on. Signed out, there's nothing
// to ask: sign in with the account that subscribed.
async function welcomeBack() {

	const url = new URL( location.href );
	if ( url.searchParams.get( 'checkout' ) !== 'done' ) return;
	url.searchParams.delete( 'checkout' );
	history.replaceState( null, '', url.href );
	if ( ! home?.signedIn ) {

		toast( 'Thanks for subscribing! Sign in with the account you subscribed with to use Build Pro.' );
		return;

	}

	for ( let i = 0; i < 10; i ++ ) {

		if ( me?.plan && me.plan.tier !== 'free' ) {

			if ( i > 0 ) await load();
			toast( 'Build Pro is on. Thanks for subscribing!' );
			return;

		}

		await new Promise( resolve => setTimeout( resolve, 3000 ) );
		try {

			me = await call( 'GET', 'me' );

		} catch {

			// Not this time: asked again in a moment.

		}

	}

	toast( 'Stripe hasn\'t confirmed it yet. Build Pro turns on by itself once it has: reload in a few minutes.' );

}

// --- Usage -------------------------------------------------------------------------------

function showUsage() {

	const { views } = me.plan;
	const body = $( 'usage-body' );
	const meter = el( 'div', 'meter' );
	if ( views.limit === null ) meter.append( el( 'span', 'meter-label', '3D map views' ), el( 'span', 'meter-value', 'Unlimited' ) );
	else {

		const share = Math.min( 1, views.used / Math.max( 1, views.limit ) );
		const bar = el( 'span', 'bar' );
		const fill = el( 'i' );
		fill.style.width = `${ share * 100 }%`;
		bar.append( fill );
		meter.append( el( 'span', 'meter-label', '3D map views this month' ), el( 'span', 'meter-value', `${ views.used } / ${ views.limit }` ), bar,
			el( 'span', 'meter-note', 'Each time the editor opens on the 3D map is one view, and each time someone opens your share link. They start again on the 1st (UTC).' ) );
		meter.classList.toggle( 'low', share >= 0.8 );

	}

	const { usage } = account;
	body.replaceChildren( meter, facts( [
		[ 'Saved projects', me.plan.tier === 'owner' ? String( usage.projects ) : `${ usage.projects } of ${ usage.projectLimit }` ],
		[ 'Claude tool calls this month', String( usage.mcpCalls ) ],
	] ) );

}

// --- Branding ----------------------------------------------------------------------------

function showBranding() {

	const body = $( 'branding-body' );
	body.replaceChildren( el( 'h3', '', 'Company logo' ) );
	if ( me.plan.tier === 'free' ) {

		body.append( paragraph( 'With Build Pro, your logo goes on the trucks, machines and trailers in your projects, and on your share links.' ) );
		return;

	}

	body.append( paragraph( home.hasLogo ? 'On both sides of your trucks, machines, trailers and bins. The editor\'s Show panel can hide it.' : 'Put your logo on the trucks, machines and trailers in your projects. A PNG with a see-through background looks best.' ) );
	if ( home.hasLogo ) body.append( Object.assign( el( 'img', 'logo-preview' ), { alt: 'Your company logo', src: `${ API }logo?at=${ Date.now() }` } ) );
	const row = el( 'div', 'row' );
	const input = Object.assign( el( 'input' ), { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', hidden: true, id: 'logo-file' } );
	input.addEventListener( 'change', async () => {

		const file = input.files?.[ 0 ];
		if ( ! file ) return;
		try {

			await call( 'PUT', 'logo', { image: await logoImage( file ) } );
			await changed( 'Logo saved. It shows on your equipment next time the editor opens.' );

		} catch ( err ) {

			toast( `Couldn't save the logo: ${ problem( err ) }` );

		}

	} );
	row.append( input, button( home.hasLogo ? 'Change' : 'Upload logo', () => input.click(), 'button quiet' ) );
	if ( home.hasLogo ) row.append( button( 'Remove', async () => {

		await call( 'DELETE', 'logo' );
		await changed( 'Logo removed' );

	}, 'button quiet' ) );
	body.append( row );

}

// A picked image file as a PNG data: URL, LOGO_SIZE px on its longer side at most.
async function logoImage( file ) {

	const url = URL.createObjectURL( file );
	try {

		const img = new Image();
		img.src = url;
		await img.decode();
		const w = img.naturalWidth || LOGO_SIZE, h = img.naturalHeight || LOGO_SIZE;
		const k = Math.min( 1, LOGO_SIZE / Math.max( w, h ) );
		const canvas = document.createElement( 'canvas' );
		canvas.width = Math.max( 1, Math.round( w * k ) );
		canvas.height = Math.max( 1, Math.round( h * k ) );
		canvas.getContext( '2d' ).drawImage( img, 0, 0, canvas.width, canvas.height );
		return canvas.toDataURL( 'image/png' );

	} finally {

		URL.revokeObjectURL( url );

	}

}

// --- Connected apps ----------------------------------------------------------------------

function showApps() {

	const body = $( 'apps-body' );
	const address = new URL( '/mcp', location.origin ).href;
	const code = el( 'div', 'mcp-url' );
	code.append( el( 'code', '', address ), button( 'Copy', async () => {

		try {

			await navigator.clipboard.writeText( address );
			toast( 'Copied' );

		} catch {

			toast( address );

		}

	}, 'link' ) );
	body.replaceChildren( paragraph( me.plan.tier === 'free'
		? 'With Build Pro, Claude can lay out your sites for you: add this address as a custom connector in Claude (Settings, Connectors).'
		: 'Add this address as a custom connector in Claude (Settings, Connectors), then ask it to lay out a site. Each app you allow is listed here.' ), code );

	const { connections, lastCall } = account;
	if ( ! connections.length ) {

		body.append( paragraph( 'No apps are connected.', 'hint' ) );
		return;

	}

	const list = el( 'ul', 'items apps' );
	for ( const app of connections ) {

		const li = el( 'li' );
		li.dataset.client = app.client;
		const text = el( 'div' );
		text.append( el( 'strong', '', app.name ), el( 'span', 'meta', `Connected since ${ dateOf( app.since ) }` ) );
		li.append( text, button( 'Disconnect', async () => {

			await call( 'DELETE', `connections/${ encodeURIComponent( app.client ) }` );
			await changed( `${ app.name } is disconnected. It asks to be allowed again next time.` );

		}, 'link danger' ) );
		list.append( li );

	}

	body.append( list );
	if ( lastCall ) body.append( paragraph( `Last tool call: ${ dateOf( lastCall ) }.`, 'hint' ) );
	if ( connections.length > 1 ) body.append( button( 'Disconnect all', async () => {

		await call( 'DELETE', 'connections' );
		await changed( 'Every app is disconnected.' );

	}, 'button quiet' ) );

}

// --- Share links -------------------------------------------------------------------------

function shareUrl( share ) {

	const url = new URL( '/build/app/', location.origin );
	if ( Number.isFinite( share.lat ) && Number.isFinite( share.lon ) ) url.searchParams.set( 'at', `${ share.lat.toFixed( 6 ) },${ share.lon.toFixed( 6 ) }` );
	if ( share.site ) url.searchParams.set( 'place', share.site );
	url.searchParams.set( 'view', share.shareToken );
	return url.href;

}

function showLinks() {

	const body = $( 'links-body' );
	const { shares } = account;
	body.replaceChildren( paragraph( 'Anyone with a project\'s link can open it, read-only, on the 3D map (counted on your views). Revoke a link and it stops working at once; sharing again makes a new one.' ) );
	if ( ! shares.length ) {

		body.append( paragraph( me.plan.tier === 'free' ? 'Share links come with Build Pro.' : 'None of your projects is shared. Share one from the editor\'s Projects.', 'hint' ) );
		return;

	}

	const revoke = async share => call( 'DELETE', `layouts/${ encodeURIComponent( share.id ) }/share` );
	const list = el( 'ul', 'items shares' );
	for ( const share of shares ) {

		const li = el( 'li' );
		li.dataset.project = share.id;
		const text = el( 'div' );
		const open = Object.assign( el( 'a', '', share.name ), { href: shareUrl( share ), target: '_blank', rel: 'noopener' } );
		text.append( wrap( 'strong', open ), el( 'span', 'meta', `${ share.site } · saved ${ dateOf( share.updatedAt ) }` ) );
		const actions = el( 'div', 'row' );
		actions.append( button( 'Copy link', async () => {

			try {

				await navigator.clipboard.writeText( shareUrl( share ) );
				toast( 'Link copied' );

			} catch {

				toast( shareUrl( share ) );

			}

		}, 'link' ), button( 'Revoke', async () => {

			await revoke( share );
			await changed( `"${ share.name }" isn't shared any more` );

		}, 'link danger' ) );
		li.append( text, actions );
		list.append( li );

	}

	body.append( list );
	if ( shares.length > 1 ) body.append( button( 'Revoke all', async () => {

		if ( ! window.confirm( `Stop sharing all ${ shares.length } projects? Their links stop working at once.` ) ) return;
		await Promise.all( shares.map( revoke ) );
		await changed( 'No project is shared any more' );

	}, 'button quiet' ) );

}

// --- Your data ---------------------------------------------------------------------------

function showData() {

	const body = $( 'data-body' );
	const status = statusLine();
	const download = button( 'Download my data', async () => {

		download.disabled = true;
		say( status, 'Gathering it...' );
		try {

			const res = await fetch( `${ API }account/export`, { headers: { Accept: 'application/json' } } );
			if ( ! res.ok ) throw Object.assign( new Error( `error ${ res.status }` ), { status: res.status, body: await res.json().catch( () => ( {} ) ) } );
			const blob = await res.blob();
			const a = Object.assign( el( 'a' ), { href: URL.createObjectURL( blob ), download: `world-drive-account-${ account.account.id }.json` } );
			document.body.append( a );
			a.click();
			a.remove();
			setTimeout( () => URL.revokeObjectURL( a.href ), 10000 );
			say( status, 'Downloaded.' );

		} catch ( err ) {

			say( status, problem( err ) );

		} finally {

			download.disabled = false;

		}

	} );
	download.id = 'download-data';
	body.replaceChildren(
		paragraph( 'A JSON file of everything World Drive keeps about your account: your profile, projects with their layouts and places, share links, logo, map views and Claude calls by month, connected apps, payments and subscriptions, and your World Drive game profile (nickname, level, scores, times and achievements). Never your password or sign-in tokens.' ),
		download, status,
		sentence( 'hint', 'Something wrong in it? Write to ', [ SUPPORT, `mailto:${ SUPPORT }` ], ' and it\'s put right. How it\'s used is in the ', [ 'privacy policy', '/privacy/' ], '.' ),
	);

}

// --- Delete account ----------------------------------------------------------------------

function showDelete() {

	const a = account.account;
	const body = $( 'delete-body' );
	if ( me.plan.tier === 'owner' ) {

		body.replaceChildren( paragraph( 'The owner\'s accounts can\'t be deleted here.', 'hint' ) );
		return;

	}

	const what = el( 'ul', 'consequences' );
	for ( const line of [
		'Your Build projects, share links, logo and connected apps are deleted.',
		'Your World Drive game profile goes too: it\'s the same account. Your leaderboard nickname, scores, challenge times and ghosts, level, achievements and Supporter Pass are deleted.',
		me.plan.subscribed ? 'Your Build Pro subscription is cancelled now, not at the end of the period, and the time left isn\'t refunded.' : 'Any subscription you have (Build Pro, or the World Drive Supporter Pass) is cancelled now, and the time left isn\'t refunded.',
		'Payment records are kept without your name or email, as tax law requires, and Stripe keeps its own. Backups keep deleted data for up to 30 days.',
	] ) what.append( el( 'li', '', line ) );
	body.replaceChildren( paragraph( 'This can\'t be undone.', 'warning' ), what );

	const { form, status, submit } = makeForm( 'delete-form', 'Delete my account' );
	submit.classList.add( 'danger' );
	const sure = Object.assign( el( 'input' ), { type: 'checkbox', id: 'delete-sure', required: true } );
	const sureLabel = Object.assign( el( 'label', 'check' ), { htmlFor: 'delete-sure' } );
	sureLabel.append( sure, ' I understand: my account, my projects and my World Drive game profile are deleted for good.' );
	form.append( sureLabel );
	const remove = async proof => {

		if ( ! sure.checked ) return say( status, 'Tick the box first.' );
		busy( form, true );
		say( status, 'Deleting...' );
		const answer = await withRobot( form, status, token => send( 'DELETE', `${ API }account`, { ...proof, ...( token ? { token } : {} ) } ) );
		busy( form, false );
		if ( ! answer ) return;
		if ( ! answer.ok ) return say( status, problem( answer ) );
		deleted();

	};

	let password = null;
	if ( a.username ) {

		form.append( hiddenUsername() );
		password = field( form, 'Your password', { name: 'password', type: 'password', autocomplete: 'current-password' } );
		form.append( submit );

	}

	form.append( status );
	form.addEventListener( 'submit', event => {

		event.preventDefault();
		if ( ! password ) return say( status, 'Confirm with Google below.' );
		if ( ! password.value ) return say( status, a.google ? 'Type your password, or confirm with Google below.' : 'Type your password.' );
		remove( { password: password.value } );

	} );
	if ( a.google ) form.append( paragraph( a.username ? 'Or confirm with Google to delete:' : 'Confirm with Google to delete:' ), googleConfirm( credential => remove( { credential } ), { now: true } ) );
	body.append( form );

}

function deleted() {

	$( 'signed-in' ).hidden = true;
	$( 'who' ).hidden = true;
	const done = $( 'signed-out' );
	done.hidden = false;
	done.replaceChildren( el( 'h2', '', 'Your account is deleted' ), sentence( '', 'Everything is gone, and you\'re signed out. Thanks for trying World Drive Build. ', [ 'Back to Build', '/build/' ] ) );
	document.body.dataset.deleted = 'yes';

}

// --- start -------------------------------------------------------------------------------

function showWho() {

	const signedIn = !! home?.signedIn;
	$( 'who' ).hidden = ! signedIn;
	$( 'signed-in' ).hidden = ! signedIn;
	$( 'signed-out' ).hidden = signedIn;
	if ( signedIn ) {

		$( 'who-name' ).textContent = home.user.name || home.user.email;
		$( 'plan-pill' ).textContent = PLANS[ home.plan.tier ]?.name ?? home.plan.tier;
		$( 'plan-pill' ).className = `plan-pill tier-${ home.plan.tier }`;

	} else if ( home?.googleClientId ) {

		credentialFor = null;
		drawGoogle( $( 'google-button' ) );

	} else $( 'google-button' ).textContent = 'Signing in isn\'t available here right now.';

}

async function load() {

	try {

		home = await call( 'GET', 'home' );
		if ( home.signedIn ) [ me, account ] = await Promise.all( [ call( 'GET', 'me' ), call( 'GET', 'account' ) ] );

	} catch ( err ) {

		home = null;
		$( 'signed-out' ).hidden = false;
		$( 'signed-out' ).replaceChildren( paragraph( err.status === 401 ? 'You were signed out. Reload to sign in again.' : 'Couldn\'t reach World Drive Build just now. Reload to try again.' ) );
		document.body.dataset.loaded = 'yes';
		return;

	}

	showWho();
	if ( home.signedIn ) for ( const show of [ showProfile, showSecurity, showBilling, showUsage, showBranding, showApps, showLinks, showData, showDelete ] ) show();
	// All shown (for the tests).
	document.body.dataset.loaded = 'yes';

}

window.buildAccount = { get me() {

	return me;

}, get account() {

	return account;

}, load };

// The robot check's site key and whether passwords are on (World Drive's config), alongside.
config = await fetch( '/api/config', { headers: { Accept: 'application/json' } } ).then( res => res.ok ? res.json() : null ).catch( () => null );
await load();
welcomeBack();
