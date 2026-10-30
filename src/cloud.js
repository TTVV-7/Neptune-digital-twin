import './cloud.css';
import { SITE } from './config.js';
import { isTyping } from './walk.js';
import { button, createLayoutsDialog, el } from './cloud-dialog.js';

// Your account, when the site runs on its Cloudflare Worker (worker/index.js): sign in with
// Google, save layouts to your account, open them on another computer, and share a read-only
// link. The layout you opened or saved last is the current one, and changes save to it as you
// go. Without the Worker (npm run dev on its own, a static host) none of this shows and the
// app saves in this browser only, as it always does.
//
// A share link is the app's address with ?view=<token>: it opens that layout without touching
// the viewer's own (layout.setLocalSaving( false )) until they choose Save a copy.

const API = 'api/';
const CONFIG_TIMEOUT = 4000;
const AUTOSAVE_DELAY = 2000;
const RETRY_DELAY = 15000;
const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';
// The current cloud layout, per site: { id, name, updatedAt, fingerprint, owner }.
const LINK_KEY = `neptune-twin.cloud.${ SITE.name }`;
// Where layout.js keeps this browser's layout, read to see what leaving a shared one replaces.
const LOCAL_LAYOUT_KEY = `neptune-twin.layout.${ SITE.name }`;
// Requests sent as the page closes (keepalive) can't carry more than 64 kB.
const KEEPALIVE_LIMIT = 60000;

let configPromise = null;
let dialog = null;

// Keys pressed in the dialog mustn't also walk, turn or delete things in the scene. The app's
// key handlers listen on window in the capture phase; this one is added as the module loads,
// before any of them, so it can stop them. Text fields are left alone: the app ignores typing.
window.addEventListener( 'keydown', e => {

	if ( dialog?.isOpen() && ! isTyping( e ) ) e.stopImmediatePropagation();

}, true );

// GET /api/config, once: { googleClientId, signedIn, user?, mapsKey? }, or null when there is
// no Worker behind this site. Started by main.js as the page boots.
export function loadConfig() {

	configPromise ??= fetchConfig();
	return configPromise;

}

// The Maps key that comes with your account or the share link you opened, if any.
export async function accountMapsKey() {

	return ( await loadConfig() )?.mapsKey ?? null;

}

async function fetchConfig() {

	const url = new URL( `${ API }config`, document.baseURI );
	const view = new URL( window.location.href ).searchParams.get( 'view' );
	if ( view ) url.searchParams.set( 'view', view );
	try {

		const res = await fetch( url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout( CONFIG_TIMEOUT ) } );
		if ( ! res.ok || ! res.headers.get( 'Content-Type' )?.includes( 'application/json' ) ) return null;
		const config = await res.json();
		return typeof config?.signedIn === 'boolean' ? config : null;

	} catch {

		return null;

	}

}

// The feature (see FEATURES in main.js).
export async function setUpCloud( { layout, models, sidebar, tiles, toast, showBanner } ) {

	const config = await loadConfig();
	if ( ! config ) return;

	let user = config.user ?? null;
	let link = readLink();
	// { token, name, owner } while looking at someone's shared layout.
	let viewing = null;
	// Why the last save didn't happen: 'conflict', 'gone', 'failed' or 'signed-out'.
	let problem = null;
	let saving = null;
	let timer = null;
	let googleButton = null;

	// --- the account area at the bottom of the library ------------------------------------

	const area = el( 'div', 'cloud-account' );
	const signedOut = el( 'div', 'signed-out' );
	const googleSlot = el( 'div', 'google-button' );
	const note = el( 'p', 'note', 'Sign in to keep layouts in your account, open them on any computer and share them by link.' );
	signedOut.append( googleSlot, note );

	const signedIn = el( 'div', 'signed-in' );
	const chip = el( 'span', 'chip' );
	const avatar = el( 'img', 'avatar' );
	avatar.alt = '';
	avatar.referrerPolicy = 'no-referrer';
	const initials = el( 'span', 'initials' );
	initials.setAttribute( 'aria-hidden', 'true' );
	const who = el( 'span', 'who' );
	chip.append( avatar, initials, who );
	const layoutsButton = button( 'Layouts', () => dialog.open( layoutsButton ) );
	layoutsButton.setAttribute( 'aria-haspopup', 'dialog' );
	signedIn.append( chip, layoutsButton, button( 'Sign out', signOut ) );

	const status = el( 'p', 'cloud-status' );
	status.setAttribute( 'role', 'status' );
	// Running without Google's tiles, but your account comes with a key: offer to reload.
	const tilesNote = el( 'p', 'note tiles-note' );
	tilesNote.hidden = true;
	tilesNote.append( 'Your account comes with Google\'s 3D tiles.', button( 'Reload to show them', () => window.location.reload(), 'link' ) );
	area.append( signedOut, signedIn, status, tilesNote );
	document.querySelector( '#library footer' ).append( area );

	avatar.addEventListener( 'error', () => {

		avatar.hidden = true;
		initials.hidden = false;

	} );
	models.addEventListener( 'buildmode', ( { on } ) => {

		if ( on && ! user ) showGoogleButton();

	} );

	dialog = createLayoutsDialog( {
		list: async () => ( await call( 'GET', `layouts?site=${ encodeURIComponent( SITE.name ) }` ) ).layouts,
		open: async summary => {

			const question = `Open "${ summary.name }"?`;
			if ( ! ( viewing ? confirmLeaving( question ) : confirmReplacing( question ) ) ) return false;
			await use( await call( 'GET', `layouts/${ summary.id }` ) );

		},
		saveAsNew,
		rename,
		remove: async summary => {

			if ( ! window.confirm( `Delete "${ summary.name }" from your account? This can't be undone. What's placed here stays.` ) ) return false;
			await call( 'DELETE', `layouts/${ summary.id }` );
			if ( link?.id === summary.id ) forgetLink();
			render();

		},
		share: async summary => ( await call( 'POST', `layouts/${ summary.id }/share` ) ).shareToken,
		unshare: summary => call( 'DELETE', `layouts/${ summary.id }/share` ),
		shareLink,
		currentId: () => link?.id ?? null,
		email: () => user?.email ?? '',
	} );

	function render() {

		area.hidden = ! config.googleClientId && ! user;
		signedOut.hidden = !! user;
		signedIn.hidden = ! user;
		if ( ! user ) tilesNote.hidden = true;
		if ( user ) {

			who.textContent = user.firstName || user.name || user.email;
			chip.title = `${ user.name } (${ user.email })`;
			initials.textContent = ( user.name || user.email ).split( /\s+/ ).slice( 0, 2 ).map( w => w[ 0 ] ).join( '' ).toUpperCase();
			avatar.hidden = ! user.picture;
			initials.hidden = !! user.picture;
			if ( user.picture && avatar.src !== user.picture ) avatar.src = user.picture;

		} else if ( sidebar.isOpen() ) {

			showGoogleButton();

		}

		renderStatus();

	}

	// One line under the account: where changes go, and buttons when something needs a decision.
	// It's only redrawn when it says something new, so screen readers don't repeat it.
	let shown = null;
	function renderStatus() {

		const name = link ? `"${ link.name }"` : '';
		const line = ( text, ...actions ) => {

			const says = [ text, ...actions.map( ( [ label ] ) => label ) ].join( '|' );
			if ( says === shown ) return;
			shown = says;
			status.replaceChildren( text, ...actions.map( ( [ label, action ] ) => button( label, action, 'link' ) ) );

		};
		if ( viewing ) return line( 'Viewing a shared layout. Changes aren\'t saved.' );
		if ( ! user ) return line( problem === 'signed-out' && link ? `You were signed out. Sign in to keep saving to ${ name }.` : '' );
		if ( ! link ) return line( 'This layout is only in this browser. Layouts > Save as new keeps it in your account.' );
		if ( problem === 'conflict' ) return line( `${ name } was changed somewhere else.`, [ 'Open that', openLatest ], [ 'Keep mine', () => saveNow( { force: true } ) ] );
		if ( problem === 'gone' ) return line( `${ name } isn't in your account any more.`, [ 'Save as new', () => saveAsNew( link.name ).catch( report ) ] );
		if ( problem === 'failed' ) return line( `${ name }: Couldn't save.`, [ 'Retry', () => saveNow() ] );
		line( `${ name }: ${ saving || timer ? 'Saving...' : 'Saved' }` );

	}

	// --- signing in and out ----------------------------------------------------------------

	// Google's script is only loaded once someone could press its button.
	function showGoogleButton() {

		if ( ! config.googleClientId || googleButton ) return;
		googleButton = loadScript( GOOGLE_SCRIPT ).then( () => {

			const google = window.google.accounts.id;
			google.initialize( { client_id: config.googleClientId, callback: ( { credential } ) => signIn( credential ), ux_mode: 'popup', auto_select: false } );
			google.renderButton( googleSlot, { theme: 'filled_black', size: 'medium', text: 'signin_with', shape: 'pill', width: 240 } );

		} ).catch( () => {

			note.textContent = 'Google sign-in didn\'t load. Check your connection or ad blocker, then reload the page.';

		} );

	}

	async function signIn( credential ) {

		try {

			const res = await api( 'POST', 'session', { credential } );
			user = res.user;
			problem = null;
			link = readLink();
			render();
			toast( `Signed in as ${ user.email }` );
			// Changes made while signed out go to the current layout now.
			if ( link ) scheduleSave();
			tilesNote.hidden = ! res.hasMapsKey || !! tiles;

		} catch ( err ) {

			showBanner( err.status === 403 ? 'That Google account isn\'t allowed to sign in here.' : `Couldn't sign in: ${ err.message }`, 8000 );

		}

	}

	async function signOut() {

		try {

			await api( 'DELETE', 'session' );

		} catch ( err ) {

			// Only the server can clear the cookie; 401 means the session had ended anyway.
			if ( err.status !== 401 ) return report( err );

		}

		window.google?.accounts.id.disableAutoSelect();
		clearTimeout( timer );
		timer = null;
		user = null;
		problem = null;
		forgetLink();
		render();
		toast( 'Signed out. Your layout is still saved in this browser.' );

	}

	// --- the current cloud layout and saving to it ------------------------------------------

	const canSave = () => user && link && ! viewing;

	layout.onChange( () => {

		if ( ! canSave() ) return;
		if ( fingerprint( layout.getData() ) === link.fingerprint ) {

			if ( problem === 'failed' ) problem = null;
			return renderStatus();

		}

		// Wait for a decision rather than saving over a newer version or into nothing.
		if ( problem === 'conflict' || problem === 'gone' ) return;
		scheduleSave();

	} );

	// When the tab is hidden (switching apps on a phone often ends in the page being thrown
	// away), save now; when the page closes, send what's left with keepalive.
	document.addEventListener( 'visibilitychange', () => {

		if ( document.hidden && timer ) saveNow();

	} );
	window.addEventListener( 'pagehide', () => {

		if ( ! timer || ! canSave() ) return;
		const body = JSON.stringify( { data: layout.getData() } );
		if ( body.length > KEEPALIVE_LIMIT ) return;
		fetch( new URL( `${ API }layouts/${ link.id }`, document.baseURI ), {
			method: 'PUT',
			keepalive: true,
			headers: { 'Content-Type': 'application/json', 'If-Match': `"${ link.updatedAt }"` },
			body,
		} ).catch( () => {} );

	} );

	function scheduleSave( delay = AUTOSAVE_DELAY ) {

		clearTimeout( timer );
		timer = setTimeout( saveNow, delay );
		renderStatus();

	}

	// Save what's placed to the current layout, unless it's already there. Without force, the
	// save says which version it started from, so it can't overwrite one saved elsewhere.
	async function saveNow( { force = false } = {} ) {

		clearTimeout( timer );
		timer = null;
		if ( ! canSave() ) return;
		if ( saving ) return scheduleSave();

		const target = link;
		const data = layout.getData();
		const print = fingerprint( data );
		if ( print === target.fingerprint && ! force ) return renderStatus();

		const headers = force ? {} : { 'If-Match': `"${ target.updatedAt }"` };
		saving = call( 'PUT', `layouts/${ target.id }`, { data }, { headers } );
		renderStatus();
		try {

			const saved = await saving;
			if ( link === target ) setLink( saved, print );
			problem = null;

		} catch ( err ) {

			if ( link === target ) problem = await whyNotSaved( err, target, print );
			if ( problem === 'failed' ) timer = setTimeout( saveNow, RETRY_DELAY );

		} finally {

			saving = null;
			renderStatus();

		}

	}

	// Refused because the layout changed elsewhere is fine if it now holds exactly what we were
	// saving: the save sent as the page closed last time, or another tab saving the same thing.
	async function whyNotSaved( err, target, print ) {

		if ( err.status === 404 ) return 'gone';
		if ( err.status === 401 ) return 'signed-out';
		if ( err.status !== 409 ) return 'failed';
		const latest = await call( 'GET', `layouts/${ target.id }` ).catch( () => null );
		if ( latest && fingerprint( latest.data ) === print ) {

			setLink( latest, print );
			return null;

		}

		return 'conflict';

	}

	// Make a layout from your account the current one: replace what's placed with it.
	async function use( saved ) {

		clearTimeout( timer );
		timer = null;
		problem = null;
		forgetLink();
		if ( viewing ) stopViewing();
		const failed = await layout.replace( saved.data );
		setLink( saved, fingerprint( layout.getData() ) );
		render();
		toast( failed ? `Opened "${ saved.name }". ${ failed } items could not be loaded.` : `Opened "${ saved.name }"` );

	}

	async function openLatest() {

		if ( ! window.confirm( `Replace what's placed with the version of "${ link.name }" saved elsewhere? Changes made here since are lost.` ) ) return;
		try {

			await use( await call( 'GET', `layouts/${ link.id }` ) );

		} catch ( err ) {

			report( err );

		}

	}

	async function saveAsNew( name ) {

		if ( viewing && ! confirmLeaving( `Save a copy of "${ viewing.name }" to your account and keep working on it here?` ) ) return null;
		const data = layout.getData();
		const saved = await call( 'POST', 'layouts', { site: SITE.name, name, data } );
		clearTimeout( timer );
		timer = null;
		problem = null;
		setLink( saved, fingerprint( data ) );
		if ( viewing ) stopViewing();
		// Anything changed while it was saving goes in next.
		if ( fingerprint( layout.getData() ) !== link.fingerprint ) scheduleSave();
		render();
		return saved;

	}

	async function rename( summary, name ) {

		// The current layout's version moves on with the rename, so let a save in flight land first.
		await saving?.catch( () => {} );
		const current = link?.id === summary.id;
		try {

			const saved = await call( 'PUT', `layouts/${ summary.id }`, { name }, { headers: current ? { 'If-Match': `"${ link.updatedAt }"` } : {} } );
			if ( link?.id === saved.id ) setLink( saved, link.fingerprint );
			renderStatus();
			return saved;

		} catch ( err ) {

			if ( err.status === 409 && current ) {

				problem = 'conflict';
				renderStatus();

			}

			throw err;

		}

	}

	function setLink( saved, print ) {

		link = { id: saved.id, name: saved.name, updatedAt: saved.updatedAt, fingerprint: print };
		storage( () => localStorage.setItem( LINK_KEY, JSON.stringify( { ...link, owner: user.email } ) ) );

	}

	function readLink() {

		const saved = storage( () => JSON.parse( localStorage.getItem( LINK_KEY ) ) );
		return user && saved?.owner === user.email && typeof saved.id === 'string' ? saved : null;

	}

	function forgetLink() {

		link = null;
		storage( () => localStorage.removeItem( LINK_KEY ) );

	}

	// Ask before replacing what's placed, unless it's all saved in your account already.
	function confirmReplacing( question ) {

		const data = layout.getData();
		return safe( data ) || window.confirm( `${ question } It replaces what's placed now${ count( data ) }, which isn't saved to your account.` );

	}

	// Leaving a shared layout makes it your layout in this browser: ask first if that throws
	// away one that isn't in your account.
	function confirmLeaving( question ) {

		const data = localLayout();
		return safe( data ) || window.confirm( `${ question } It replaces the layout saved in this browser${ count( data ) }, which isn't in your account.` );

	}

	function safe( data ) {

		const empty = ! data || ( data.items.length === 0 && Object.keys( data.extras ?? {} ).length === 0 );
		return empty || ( link && fingerprint( data ) === link.fingerprint );

	}

	// --- shared links ------------------------------------------------------------------------

	const banner = el( 'div', 'cloud-banner' );
	banner.setAttribute( 'role', 'region' );
	banner.setAttribute( 'aria-label', 'Shared layout' );
	banner.hidden = true;
	const bannerText = el( 'span' );
	const copyButton = button( 'Save a copy', saveCopy );
	banner.append( bannerText, copyButton );
	document.body.append( banner );

	const token = new URL( window.location.href ).searchParams.get( 'view' );
	if ( token ) await startViewing( token );
	render();

	// Show a shared layout without saving it over yours. This runs before the app restores your
	// own layout, which it then leaves alone because local saving is off.
	async function startViewing( token ) {

		let shared;
		try {

			shared = await api( 'GET', `shared/${ encodeURIComponent( token ) }` );

		} catch ( err ) {

			dropViewParam();
			showBanner( err.status === 404 ? 'That shared layout isn\'t available: sharing was turned off, or it was deleted.' : `Couldn't open the shared layout: ${ err.message }`, 10000 );
			return;

		}

		viewing = { token, name: shared.name, owner: shared.owner };
		layout.setLocalSaving( false );
		bannerText.textContent = `Viewing "${ shared.name }", shared by ${ shared.owner }. Changes aren't saved.`;
		banner.hidden = false;
		document.body.classList.add( 'viewing-shared' );
		// Not before it has all loaded, or the copy would miss what hadn't arrived yet.
		copyButton.disabled = true;
		const { data, dropped } = fromThisSite( shared.data );
		if ( dropped ) showBanner( `Left out ${ plural( dropped ) } of the shared layout that would load models from other websites.`, 10000 );
		layout.replace( data )
			.then( failed => failed && toast( `${ failed } items in the shared layout could not be loaded` ) )
			.catch( err => showBanner( `Couldn't show the shared layout: ${ err.message }`, 10000 ) )
			.finally( () => {

				copyButton.disabled = false;

			} );

	}

	// Signed in, the copy goes to your account and becomes the current layout. Either way it
	// becomes your layout in this browser.
	async function saveCopy() {

		if ( user ) {

			try {

				const saved = await saveAsNew( viewing.name );
				if ( saved ) toast( `Saved a copy of "${ saved.name }" to your account` );

			} catch ( err ) {

				report( err );

			}

			return;

		}

		if ( ! confirmLeaving( `Make "${ viewing.name }" your layout in this browser?` ) ) return;
		const { name } = viewing;
		stopViewing();
		toast( `"${ name }" is now your layout in this browser` );

	}

	function stopViewing() {

		viewing = null;
		layout.setLocalSaving( true );
		dropViewParam();
		banner.hidden = true;
		document.body.classList.remove( 'viewing-shared' );
		renderStatus();

	}

	function shareLink( shareToken ) {

		const url = new URL( window.location.href );
		url.search = '';
		url.hash = '';
		url.searchParams.set( 'view', shareToken );
		return url.href;

	}

	// --- requests ------------------------------------------------------------------------------

	// An API request that notices when the session has ended (expired, or signed out elsewhere).
	async function call( method, path, body, options ) {

		try {

			return await api( method, path, body, options );

		} catch ( err ) {

			if ( err.status === 401 && user ) {

				user = null;
				problem = 'signed-out';
				render();

			}

			throw err;

		}

	}

	function report( err ) {

		showBanner( `That didn't work: ${ err.message }`, 8000 );

	}

}

async function api( method, path, body, { headers = {} } = {} ) {

	const init = { method, headers: { Accept: 'application/json', ...headers } };
	if ( method !== 'GET' ) {

		init.headers[ 'Content-Type' ] = 'application/json';
		init.body = JSON.stringify( body ?? {} );

	}

	let res;
	try {

		res = await fetch( new URL( API + path, document.baseURI ), init );

	} catch {

		throw new Error( 'no connection' );

	}

	const data = res.status === 204 ? null : await res.json().catch( () => null );
	if ( ! res.ok ) throw Object.assign( new Error( data?.error ?? `error ${ res.status }` ), { status: res.status } );
	return data;

}

function loadScript( src ) {

	return new Promise( ( resolve, reject ) => {

		const script = document.createElement( 'script' );
		script.src = src;
		script.async = true;
		script.onload = resolve;
		script.onerror = reject;
		document.head.append( script );

	} );

}

// A shared layout is someone else's data: its items may only load models from this site, not
// from any address it names (which could track who opens the link, or be enormous).
function fromThisSite( data ) {

	const items = data.items.filter( item => ! item?.url || isOnThisSite( item.url ) );
	return { data: { ...data, items }, dropped: data.items.length - items.length };

}

function isOnThisSite( url ) {

	try {

		return new URL( url, document.baseURI ).origin === window.location.origin;

	} catch {

		return false;

	}

}

function dropViewParam() {

	const url = new URL( window.location.href );
	url.searchParams.delete( 'view' );
	window.history.replaceState( null, '', url.href );

}

// This browser's own saved layout, as { items, extras }, or null.
function localLayout() {

	const saved = storage( () => JSON.parse( localStorage.getItem( LOCAL_LAYOUT_KEY ) ) );
	if ( Array.isArray( saved ) ) return { items: saved, extras: {} };
	return Array.isArray( saved?.items ) ? saved : null;

}

// " (3 items)", for the questions above.
function count( data ) {

	const n = data.items.length;
	return n === 0 ? '' : ` (${ plural( n ) })`;

}

function plural( n ) {

	return n === 1 ? '1 item' : `${ n } items`;

}

// A short hash of a layout that ignores the order of its items (they finish loading in any
// order), to tell whether there's anything new to save. 53 bits (cyrb53), so a change going
// unnoticed is vanishingly unlikely.
function fingerprint( data ) {

	const text = JSON.stringify( { ...data, items: data.items.map( item => JSON.stringify( item ) ).sort() } );
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for ( let i = 0; i < text.length; i ++ ) {

		const c = text.charCodeAt( i );
		h1 = Math.imul( h1 ^ c, 2654435761 );
		h2 = Math.imul( h2 ^ c, 1597334677 );

	}

	h1 = Math.imul( h1 ^ ( h1 >>> 16 ), 2246822507 ) ^ Math.imul( h2 ^ ( h2 >>> 13 ), 3266489909 );
	h2 = Math.imul( h2 ^ ( h2 >>> 16 ), 2246822507 ) ^ Math.imul( h1 ^ ( h1 >>> 13 ), 3266489909 );
	return ( 4294967296 * ( 2097151 & h2 ) + ( h1 >>> 0 ) ).toString( 36 );

}

// localStorage can throw in private windows; the account still works, it just isn't remembered.
function storage( fn ) {

	try {

		return fn();

	} catch {

		return null;

	}

}
