import { button, el } from './cloud-dialog.js';

// Premium equipment, a work in progress. The library items marked "premium": true in
// public/library/library.json make up the Pro equipment pack, bought once through a Stripe
// Payment Link; the server (worker/premium.js) hears from Stripe who has paid. Until the server
// has its Stripe settings, /api/config says premium is off, cloud.js doesn't set this up, and
// every item works for everyone as before.
//
// While the pack is locked its cards in the library show a Pro badge, and picking one opens a
// dialog: what's in the pack, the price, and Buy with Stripe. Signed out, it asks you to sign in
// first, so the purchase has an account to go to. Only picking new items is gated: ones already
// placed, and saved or shared layouts that have them, load for everyone. The models are still
// public files, so this is a gate in the app rather than a lock on the files.
//
// Stripe brings the buyer back to <site>/?premium=thanks (the Payment Link's "after payment"
// setting, see docs/premium.md). There, and whenever the window gets focus back while the dialog
// is open (from paying in the other tab), the app asks the server again.

const THANKS_PARAM = 'premium';
// The webhook usually arrives before the buyer is back, but not always: ask a few more times.
const RECHECK_DELAY = 3000;
const RECHECKS = 10;

// premium: the premium part of /api/config ({ enabled, link, price, unlocked, clientReferenceId });
// user: who is signed in, or null; fetchMe() -> GET /api/me ({ user, premium });
// renderSignIn( element ) -> draws Google's sign-in button there (a promise).
export function createPremium( { library, sidebar, toast, showBanner, premium, user, fetchMe, renderSignIn } ) {

	const pack = library.filter( item => item.premium );
	const gate = { isLocked: () => ! premium.unlocked, onLocked: item => open( item ) };
	let picked = null;
	let opener = null;
	let signInShown = false;

	const dialog = el( 'dialog', 'cloud-dialog premium-dialog' );
	dialog.setAttribute( 'aria-labelledby', 'premium-dialog-title' );
	const header = el( 'header' );
	const title = el( 'h2', '', 'Pro equipment' );
	title.id = 'premium-dialog-title';
	const close = button( '×', () => dialog.close(), 'close' );
	close.setAttribute( 'aria-label', 'Close' );
	header.append( title, close );
	const lead = el( 'p', 'small' );

	const list = el( 'ul', 'pack' );
	// Items built in code (a tower crane, say) have no picture file: they borrow the one the
	// library drew for their card, once it has been drawn (see open()).
	const drawn = [];
	for ( const item of pack ) {

		const entry = el( 'li' );
		const thumb = el( 'img' );
		thumb.alt = '';
		thumb.loading = 'lazy';
		if ( item.thumb ) thumb.src = new URL( `library/${ item.thumb }`, document.baseURI ).href;
		else drawn.push( [ thumb, item ] );
		entry.append( thumb, el( 'span', 'name', item.name ) );
		list.append( entry );

	}

	const price = el( 'p', 'price' );

	const buying = el( 'div', 'buying' );
	const buy = el( 'a', 'buy', 'Buy with Stripe' );
	buy.target = '_blank';
	buy.rel = 'noopener';
	buy.addEventListener( 'click', () => say( 'Finish paying in Stripe\'s tab, then come back here. The pack unlocks as soon as Stripe confirms the payment.' ) );
	const again = button( 'Check again', checkAgain, 'link' );
	const paid = el( 'p', 'small', 'Paid already?' );
	paid.append( again );
	buying.append( buy, el( 'p', 'small', 'Stripe\'s checkout opens in a new tab. One payment; the pack stays in your account.' ), paid );

	const signIn = el( 'div', 'sign-in' );
	const slot = el( 'div', 'google-button' );
	signIn.append( el( 'p', '', 'Sign in first, so the pack goes to your account.' ), slot );

	const message = el( 'p', 'message' );
	message.setAttribute( 'role', 'status' );
	dialog.append( header, lead, list, price, buying, signIn, message );
	document.body.append( dialog );

	dialog.addEventListener( 'close', () => opener?.focus() );
	window.addEventListener( 'focus', () => {

		if ( dialog.open && user && ! premium.unlocked ) refresh().then( now => now && unlocked() );

	} );

	sidebar.setGate( gate );
	welcomeBack();

	function open( item ) {

		picked = item;
		opener = document.activeElement;
		for ( const [ thumb, { id } ] of drawn ) {

			const card = document.querySelector( `#library .card[data-item="${ id }"] img` );
			if ( ! thumb.src && card?.src ) thumb.src = card.src;

		}

		document.exitPointerLock?.();
		say( '' );
		render();
		dialog.showModal();
		( user ? buy : close ).focus();

	}

	function render() {

		lead.textContent = picked
			? `${ picked.name } is part of the Pro equipment pack. Buy it once to place any of these, in any layout:`
			: 'Buy the Pro equipment pack once to place any of these, in any layout:';
		price.textContent = premium.price ?? '';
		price.hidden = ! premium.price;
		buying.hidden = ! user;
		signIn.hidden = !! user;
		if ( user ) buy.href = buyUrl();
		else if ( ! signInShown ) {

			signInShown = true;
			renderSignIn( slot ).catch( () => {

				signInShown = false;
				slot.replaceChildren( el( 'p', 'small', 'Google sign-in didn\'t load. Check your connection or ad blocker, then reload the page.' ) );

			} );

		}

	}

	// The Payment Link, saying who's buying: Stripe hands client_reference_id back with the
	// payment, and prefilled_email fills in the checkout's email.
	function buyUrl() {

		const url = new URL( premium.link );
		if ( premium.clientReferenceId ) url.searchParams.set( 'client_reference_id', premium.clientReferenceId );
		url.searchParams.set( 'prefilled_email', user.email );
		return url.href;

	}

	// Premium as the server now says, for whoever is signed in. announce: say so if this unlocked it.
	function update( next, nextUser, { announce = false } = {} ) {

		const was = premium.unlocked;
		premium = next ?? { enabled: false };
		user = nextUser;
		// The server stopped selling it (its Stripe settings were removed): everything is free again.
		sidebar.setGate( premium.enabled ? gate : null );
		if ( announce && ! was && premium.unlocked ) unlocked();
		else if ( dialog.open ) render();

	}

	// Whether it's unlocked, according to the server now.
	async function refresh() {

		try {

			const me = await fetchMe();
			update( me.premium, me.user );

		} catch {

			// Offline, or signed out meanwhile (cloud.js deals with that); nothing changes.

		}

		return premium.unlocked;

	}

	async function checkAgain() {

		say( 'Checking...' );
		if ( await refresh() ) unlocked();
		else say( 'Stripe hasn\'t confirmed a payment yet. It can take a minute; try again shortly.' );

	}

	function unlocked() {

		if ( dialog.open ) dialog.close();
		toast( 'Premium unlocked' );

	}

	// Back from Stripe's checkout on ?premium=thanks.
	async function welcomeBack() {

		const url = new URL( window.location.href );
		if ( url.searchParams.get( THANKS_PARAM ) !== 'thanks' ) return;
		url.searchParams.delete( THANKS_PARAM );
		window.history.replaceState( null, '', url.href );
		if ( ! user ) {

			showBanner( 'Thanks for buying Pro equipment! Sign in with the Google account you paid with to use it.', 10000 );
			return;

		}

		for ( let i = 0; i <= RECHECKS; i ++ ) {

			if ( i > 0 ) await new Promise( resolve => setTimeout( resolve, RECHECK_DELAY ) );
			if ( await refresh() ) return unlocked();
			if ( ! user ) return;

		}

		showBanner( 'Stripe hasn\'t confirmed the payment yet. The pack unlocks by itself once it has: reload the page in a few minutes.', 10000 );

	}

	function say( text ) {

		message.textContent = text;

	}

	return {
		update,
		// Signed out: locked again, whatever the account had.
		signedOut: () => user && update( { ...premium, unlocked: false, clientReferenceId: undefined }, null ),
		isOpen: () => dialog.open,
	};

}
