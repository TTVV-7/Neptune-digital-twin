import './ads.css';
import { isPro, onProChange } from './pro.js';

// Google AdSense's one banner, on the globe and nowhere else (docs/world-drive.md, "Ads"). This
// module, its styles and Google's script are only loaded when /api/config has a publisher id
// (ADSENSE_CLIENT) and this visitor has no Supporter Pass, once the globe is up and the browser
// idle (main.js), so none of it is in the first load. The banner is in the globe's own section
// (#globe-ui), so it goes, and takes no room, whenever that does (driving, paused, dropping in,
// loading) and comes back with it (M); its space is only kept (body.ad-on, ads.css) while it's
// there. Google's script, or an ad that doesn't come (an ad blocker, nothing to show), takes the
// banner away again quietly, and so does the pass arriving mid-visit (signing in, or buying it).

const SCRIPT = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
// As the Worker checks them (worker/drive/settings.js's adsense): the page only shows what it says.
const CLIENT = /^ca-pub-\d{16}$/;
const SLOT = /^(\d{6,12})?$/;
// How long (ms) after Google's script has come the ad may take to say whether it's filled; past
// that (a blocker that stood in a script of its own for Google's, say), it's taken as blocked.
const FILL_WAIT = 20000;

let shown = null;
// What About World Drive says of the ads, for whoever they're shown to (a supporter, who has none,
// never loads this). The page's other words on what's kept are drive/index.html's.
const ABOUT = 'Ads: on the globe (never while you drive), World Drive shows an ad from Google AdSense, which helps pay for the 3D map; there\'s none with the Supporter Pass. Google and its partners use cookies and similar to show the ad, count it, keep it from showing too often and, where you allow it, choose it by what you like. In the EEA, the UK and Switzerland, Google asks you first. How Google uses this: ';
const GOOGLE_POLICY = 'https://policies.google.com/technologies/partner-sites';

// Puts the banner in `root` (the globe's section): client, slot as /api/config has them (slot ''
// for a responsive unit with no slot id); onShown() once an ad is in it, onBlocked() when Google's
// script or its ad didn't come. Once a page: { remove() }, or null when there's to be no ad.
export function showAds( { client, slot = '', root, onShown = () => {}, onBlocked = () => {} } ) {

	if ( shown ) return shown;
	if ( isPro() || ! CLIENT.test( client ?? '' ) || ! SLOT.test( slot ?? '' ) || ! root ) return null;

	const box = document.createElement( 'aside' );
	box.className = 'ad-slot';
	box.setAttribute( 'aria-label', 'Advertisement' );
	const frame = Object.assign( document.createElement( 'div' ), { className: 'ad-frame' } );
	const label = Object.assign( document.createElement( 'span' ), { className: 'ad-label', textContent: 'Ad' } );
	// Its size is the frame's (ads.css), as Google's guide to an exact size for a responsive unit has
	// it: no data-ad-format, and not widened to the whole screen on a phone.
	const ins = document.createElement( 'ins' );
	ins.className = 'adsbygoogle';
	ins.dataset.adClient = client;
	if ( slot ) ins.dataset.adSlot = slot;
	ins.dataset.fullWidthResponsive = 'false';
	frame.append( label, ins );
	box.append( frame );
	root.append( box );
	document.body.classList.add( 'ad-on' );
	aboutAds();

	let gone = false;
	let timer = 0;
	const watch = new MutationObserver( () => {

		const status = ins.getAttribute( 'data-ad-status' );
		if ( status === 'filled' ) {

			clearTimeout( timer );
			onShown();

		} else if ( status === 'unfilled' ) remove();

	} );
	watch.observe( ins, { attributes: true, attributeFilter: [ 'data-ad-status' ] } );
	let waiting = null;
	const stopListening = onProChange( on => on && remove() );

	function remove() {

		if ( gone ) return;
		gone = true;
		clearTimeout( timer );
		watch.disconnect();
		waiting?.disconnect();
		stopListening();
		box.remove();
		document.body.classList.remove( 'ad-on' );

	}

	function blocked() {

		if ( gone ) return;
		onBlocked();
		remove();

	}

	// Google's script, and the ad asked for, only while the globe shows: an ad slot with no width
	// (the globe's section hidden as a drive starts) is one Google can't fill.
	const load = () => {

		if ( gone ) return;
		const script = document.createElement( 'script' );
		script.async = true;
		script.crossOrigin = 'anonymous';
		script.src = `${ SCRIPT }?client=${ encodeURIComponent( client ) }`;
		script.addEventListener( 'error', blocked );
		script.addEventListener( 'load', () => {

			if ( ! ins.hasAttribute( 'data-ad-status' ) ) timer = setTimeout( blocked, FILL_WAIT );

		} );
		document.head.append( script );
		try {

			( window.adsbygoogle = window.adsbygoogle || [] ).push( {} );

		} catch ( err ) {

			// (Google's script says why in the console itself.)
			console.warn( 'Ad', err?.message );
			remove();

		}

	};
	if ( ! root.hidden ) load();
	else {

		waiting = new MutationObserver( () => {

			if ( root.hidden ) return;
			waiting.disconnect();
			waiting = null;
			load();

		} );
		waiting.observe( root, { attributes: true, attributeFilter: [ 'hidden' ] } );

	}

	shown = { remove, get gone() {

		return gone;

	} };
	return shown;

}

// The ads' paragraph in About World Drive, before its credits (once).
function aboutAds() {

	const about = document.getElementById( 'about' );
	if ( ! about || about.querySelector( '.ads-note' ) ) return;
	const note = Object.assign( document.createElement( 'p' ), { className: 'ads-note' } );
	note.append( ABOUT, Object.assign( document.createElement( 'a' ), { href: GOOGLE_POLICY, target: '_blank', rel: 'noopener', textContent: 'policies.google.com' } ), '. World Drive itself keeps nothing more about you.' );
	const credits = [ ...about.querySelectorAll( 'p' ) ].find( p => p.textContent.startsWith( 'Map data' ) );
	if ( credits ) credits.before( note );
	else about.querySelector( 'form' )?.before( note );

}
