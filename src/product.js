// World Drive Build (worlddrive.app/build/, docs/build.md): this app, built for World Drive's site
// with `vite build --mode worlddrive` (vite.drive.config.js's buildApp), as a construction mock-up
// tool anyone can sign up for. There it:
//   - is at whatever site the project is (picked by address with the Site button, kept in the
//     address as ?at=lat,lon&place=Name, and in this browser), not the Neptune terminal;
//   - loads none of the Neptune project's own models (config.js's MODELS);
//   - gets the Maps key from World Drive's server for a signed-in account's plan (worker/drive/
//     build.js), never asking for one, and says why when there's none;
//   - locks all but FREE_ITEMS of the library behind Build Pro (premium.js's gate).
// Everywhere else (the Neptune twin), none of this applies.

import { STREET_ONLY, rankedPlaces, searchCredit, streetOnly } from './search-results.js';
import { BLANK_AT, BLANK_NAME, MAX_SLOPE, blankOf, compassPoint, describeSlope, readSlopeParam, slopeParam } from './blank-site.js';

// (No Vite in Node, where tests load some modules: not Build there.)
export const BUILD_APP = import.meta.env?.MODE === 'worlddrive';

const SITE_KEY = 'world-drive-build.site';
// Where a new visitor starts: a working waterfront terminal, with plenty to plan around.
const EXAMPLE = { name: 'North Vancouver waterfront (example)', lat: 49.3054, lon: - 123.0491 };

// The free plan's library: everyday site pieces. Everything else is Build Pro.
export const FREE_ITEMS = new Set( [
	'jersey-barrier', 'water-barrier', 'fence-panel', 'lock-block',
	'traffic-cone', 'traffic-drum', 'barricade-type-3-road-closed', 'delineator-post',
	'stop-sign-post', 'stop-sign-portable',
	'office-trailer-8x20', 'office-trailer-10x40', 'container-20', 'porta-potty',
	'rolloff-20', 'frontload-6yd',
	'pickup-truck', 'dump-truck-tandem', 'cargo-van',
	'mini-excavator-cad', 'excavator-20t', 'skid-steer-loader-cad', 'wheel-loader-3yd', 'backhoe-loader-cad',
	'light-tower', 'generator-20kva',
	'worker-standing', 'worker-walking', 'flagger',
	'pallet', 'pallet-concrete-bags', 'oil-drum', 'ibc-tote', 'popup-canopy-3x3', 'wheelbarrow',
] );

// The project's site: ?at=lat,lon&place=Name, else the last one in this browser, else the example.
// Kept for next time. ?blank is a blank site instead (blank-site.js): no place on the map, so it
// isn't kept as the last one; its blank says how its ground slopes.
export function buildSite() {

	const url = new URL( window.location.href );
	if ( url.searchParams.has( 'blank' ) ) return { name: BLANK_NAME, ...BLANK_AT, blank: readSlopeParam( url.searchParams.get( 'blank' ) ) };
	const at = url.searchParams.get( 'at' )?.split( ',' ).map( Number );
	let site = null;
	if ( at?.length === 2 && at.every( Number.isFinite ) && Math.abs( at[ 0 ] ) <= 85 && Math.abs( at[ 1 ] ) <= 180 ) {

		site = { name: cleanName( url.searchParams.get( 'place' ) ) || `${ at[ 0 ].toFixed( 4 ) }, ${ at[ 1 ].toFixed( 4 ) }`, lat: at[ 0 ], lon: at[ 1 ] };

	}

	if ( ! site ) {

		try {

			const saved = JSON.parse( localStorage.getItem( SITE_KEY ) );
			if ( Number.isFinite( saved?.lat ) && Number.isFinite( saved?.lon ) && typeof saved.name === 'string' ) site = { name: cleanName( saved.name ), lat: saved.lat, lon: saved.lon };

		} catch {

			// No storage: the example.

		}

	}

	site ??= { ...EXAMPLE };
	try {

		localStorage.setItem( SITE_KEY, JSON.stringify( site ) );

	} catch {

		// Fine: it's in the address.

	}

	return site;

}

// The editor's address says where its project is (?at, or ?blank for a blank site). One with just
// ?project=<id> is at the last place this browser had, on the map: if the project is a blank site,
// it's opened at its own address instead, asked before the page asks for its config, so that
// opening it doesn't take a 3D map view on the way. Returns true while going there.
export async function openBlankProject() {

	const url = new URL( window.location.href );
	const id = url.searchParams.get( 'project' );
	if ( ! id || [ 'at', 'blank', 'view' ].some( name => url.searchParams.has( name ) ) ) return false;
	try {

		const res = await fetch( `api/layouts/${ encodeURIComponent( id ) }`, { headers: { Accept: 'application/json' } } );
		const blank = res.ok ? blankOf( ( await res.json() ).data ) : null;
		if ( ! blank ) return false;
		url.search = '';
		url.searchParams.set( 'blank', slopeParam( blank ) );
		url.searchParams.set( 'project', id );
		window.location.replace( url.href );
		return true;

	} catch {

		// Not signed in, not found or no server: the page opens as it is.
		return false;

	}

}

// At most 100 characters: every save sends the site's name, and the server refuses a longer one
// (build.js's readFields), so a long ?place would leave the project unable to save.
function cleanName( name ) {

	return typeof name === 'string' ? name.replace( /[\u0000-\u001f\u007f]/g, '' ).trim().slice( 0, 100 ).trim() : '';

}

// Why there's no 3D map (build.js's mapsReason), as the page says it. hidden: buying Build Pro is
// hidden (premium.billing.hidden), so nothing says to go and get it.
export function noMapReason( reason, plan, hidden = false ) {

	const free = plan?.views?.limit;
	switch ( reason ) {

		case 'used-up': return plan?.tier === 'pro'
			? `You've used this month's ${ free } 3D map views. They start again on the 1st.`
			: `You've used this month's ${ free ?? '' } free 3D map views. Build Pro gives you 300 a month. You can still lay out on flat ground.`;
		case 'busy': return `Today's free 3D map views are all taken. Try again tomorrow${ hidden ? '' : ', or go Build Pro' }. You can still lay out on flat ground.`;
		case 'owner-used-up': return 'This shared project opens on flat ground: its owner has used this month\'s 3D map views.';
		case 'owner-free': return 'This shared project opens on flat ground: the 3D map comes with its owner\'s Build Pro.';
		case 'unreachable': return 'Couldn\'t reach the server for the 3D map. You can still lay out on flat ground; reload to try again.';
		case 'off': return 'The 3D map is off just now. You can still lay out on flat ground.';
		default: return 'Sign in (top right) to load the 3D map of your site: the free plan has 15 views a month. Until then, lay out on flat ground.';

	}

}

// The Site button (top left): where this project is, and a search to move it anywhere. Picking a
// place reloads the page there (a new 3D map view: one of the month's).
export function setUpSitePicker( site, { toast } ) {

	const root = document.createElement( 'div' );
	root.className = 'site-picker';
	root.innerHTML = `
		<div class="site-bar">
			<a class="site-home" href="/build/" title="Your projects and plan">Projects</a>
			<button type="button" class="site-current" aria-expanded="false" title="Where this project is: click to move it"><span class="site-label">Site</span> <span class="site-name"></span></button>
			<span class="project-status" id="project-status" role="status" hidden></span>
		</div>
		<form class="site-search" hidden>
			<input type="search" id="site-query" placeholder="Address, city or place" autocomplete="off" aria-label="Find a site">
			<button type="submit">Find</button>
			<ul class="site-results"></ul>
		</form>`;
	document.body.append( root );
	// The banner (top middle too) goes below it.
	document.body.classList.add( 'has-site-picker' );
	const current = root.querySelector( '.site-current' );
	const form = root.querySelector( 'form' );
	const input = form.querySelector( 'input' );
	const results = form.querySelector( '.site-results' );
	root.querySelector( '.site-name' ).textContent = site.name;
	form.append( site.blank ? groundSettings( site.blank, moveTo ) : blankChoice( () => moveTo( null ) ) );
	if ( site.blank ) {

		current.title = 'A blank site, with no map: click to set its slope or move it to an address';
		input.placeholder = 'Move it to an address, city or place';

	}

	current.addEventListener( 'click', () => {

		form.hidden = ! form.hidden;
		current.setAttribute( 'aria-expanded', String( ! form.hidden ) );
		if ( ! form.hidden ) input.focus();

	} );

	form.addEventListener( 'submit', async e => {

		e.preventDefault();
		const q = input.value.trim();
		if ( ! q ) return;
		results.replaceChildren( Object.assign( document.createElement( 'li' ), { textContent: 'Searching…', className: 'note' } ) );
		try {

			const res = await fetch( `/api/search?q=${ encodeURIComponent( q ) }`, { headers: { Accept: 'application/json' } } );
			const body = await res.json().catch( () => ( {} ) );
			if ( ! res.ok ) throw new Error( body.error ?? `search answered ${ res.status }` );
			if ( ! body.results?.length ) {

				results.replaceChildren( Object.assign( document.createElement( 'li' ), { textContent: 'Nothing found. Try a street address or a town.', className: 'note' } ) );
				return;

			}

			// Houses and numbered addresses first; when only the street was found, the list says so.
			const line = ( textContent, className ) => Object.assign( document.createElement( 'li' ), { textContent, className } );
			results.replaceChildren( ...( streetOnly( body ) ? [ line( STREET_ONLY, 'note street-only' ) ] : [] ), ...rankedPlaces( body ).map( place => {

				const item = document.createElement( 'li' );
				const pick = document.createElement( 'button' );
				pick.type = 'button';
				pick.textContent = place.name;
				pick.addEventListener( 'click', () => moveTo( place ) );
				item.append( pick );
				return item;

			} ), line( searchCredit( body ), 'note credit' ) );

		} catch ( err ) {

			results.replaceChildren( Object.assign( document.createElement( 'li' ), { textContent: `Couldn't search: ${ err.message }`, className: 'note' } ) );

		}

	} );

	// To a place, or with none to a blank site (blank-site.js), whose ground slopes as `slope` says.
	function moveTo( place, slope = null ) {

		const url = new URL( window.location.href );
		// The open project (cloud.js keeps it in the address) goes with it, and is saved at the new place.
		const project = url.searchParams.get( 'project' );
		url.search = '';
		if ( project ) url.searchParams.set( 'project', project );
		if ( place ) {

			url.searchParams.set( 'at', `${ place.lat.toFixed( 6 ) },${ place.lon.toFixed( 6 ) }` );
			url.searchParams.set( 'place', place.name.split( ',' ).slice( 0, 2 ).join( ',' ) );

		} else url.searchParams.set( 'blank', slopeParam( slope ) );

		toast?.( place || ! site.blank ? 'Moving the project…' : 'Changing the ground…' );
		window.location.href = url.href;

	}

}

// Below the search on a site on the map: a blank site instead, with no map at all.
function blankChoice( go ) {

	const row = document.createElement( 'div' );
	row.className = 'site-blank';
	const words = Object.assign( document.createElement( 'span' ), { textContent: 'No address, or no map wanted?' } );
	const button = Object.assign( document.createElement( 'button' ), { type: 'button', className: 'blank-go', textContent: 'Blank site (no map)', title: 'Lay out on plain ground with a metre grid: no Google map, and no 3D map view used' } );
	button.addEventListener( 'click', go );
	row.append( words, button );
	return row;

}

// Below the search on a blank site: how its ground slopes (moveTo( null, slope ) opens it so).
function groundSettings( blank, moveTo ) {

	const row = document.createElement( 'div' );
	row.className = 'site-blank ground';
	row.innerHTML = `
		<span class="ground-label">Ground</span>
		<label>Slope <input type="number" class="ground-slope" min="0" max="${ MAX_SLOPE }" step="0.5" inputmode="decimal" aria-label="Slope in percent"> %</label>
		<label>falling to the <select class="ground-toward" aria-label="Which way it falls"></select></label>
		<button type="button" class="ground-apply">Apply</button>
		<span class="ground-now"></span>`;
	const slope = row.querySelector( '.ground-slope' );
	const toward = row.querySelector( '.ground-toward' );
	slope.value = String( blank.slope );
	const options = [ 0, 45, 90, 135, 180, 225, 270, 315 ];
	if ( ! options.includes( blank.toward ) ) options.push( blank.toward );
	toward.append( ...options.sort( ( a, b ) => a - b ).map( degrees => Object.assign( document.createElement( 'option' ), {
		value: String( degrees ),
		textContent: degrees % 45 ? `${ degrees }°` : compassPoint( degrees ),
	} ) ) );
	toward.value = String( blank.toward );
	row.querySelector( '.ground-now' ).textContent = `Now ${ describeSlope( blank ).toLowerCase() }. Or search above to move it to a real address.`;
	row.querySelector( '.ground-apply' ).addEventListener( 'click', () => moveTo( null, { slope: Number( slope.value ), toward: Number( toward.value ) } ) );
	return row;

}

// Build's legal pages (drive/site/legal.js's BUILD_LEGAL_LINKS, which can't be imported here: it's
// built in Node), opened in a new tab so the project stays open.
const LEGAL_LINKS = [
	[ 'Terms', '/build/terms/' ],
	[ 'Privacy', '/build/privacy/' ],
	[ 'Cookies', '/build/privacy/#cookies' ],
	[ 'Refunds', '/build/refunds/' ],
	[ 'Acceptable use', '/build/acceptable-use/' ],
	[ 'Credits', '/build/credits/' ],
];

function legalLink( [ name, href ] ) {

	const link = document.createElement( 'a' );
	link.href = href;
	link.target = '_blank';
	link.rel = 'noopener';
	link.textContent = name;
	return link;

}

// The line beside each Google sign-in button: signing in is accepting the Terms (the clickwrap the
// Terms of Service count on), so it has to be there wherever the button is.
export function agreeNote() {

	const note = document.createElement( 'p' );
	note.className = 'agree-note';
	note.append( 'By continuing you agree to the ', legalLink( [ 'Terms', '/build/terms/' ] ), ' and ', legalLink( [ 'Privacy Policy', '/build/privacy/' ] ), '.' );
	return note;

}

// A small line of links to the legal pages at the foot of the library and of the help (H).
export function setUpLegalLinks() {

	for ( const place of [ document.querySelector( '#library footer' ), document.querySelector( '#help' ) ] ) {

		if ( ! place ) continue;
		const line = document.createElement( 'nav' );
		line.className = 'legal-links';
		line.setAttribute( 'aria-label', 'Legal' );
		LEGAL_LINKS.forEach( ( item, i ) => line.append( ...i ? [ ' · ' ] : [], legalLink( item ) ) );
		place.append( line );

	}

}
