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

export const BUILD_APP = import.meta.env.MODE === 'worlddrive';

const SITE_KEY = 'world-drive-build.site';
// Where a new visitor starts: a working waterfront terminal, with plenty to plan around.
const EXAMPLE = { name: 'North Vancouver waterfront (example)', lat: 49.3054, lon: - 123.0491 };

// The free plan's library: everyday site pieces. Everything else is Build Pro.
export const FREE_ITEMS = new Set( [
	'jersey-barrier', 'water-barrier', 'fence-panel', 'lock-block',
	'traffic-cone', 'traffic-drum', 'barricade-type-3-road-closed', 'delineator-post',
	'office-trailer-8x20', 'office-trailer-10x40', 'container-20', 'porta-potty',
	'rolloff-20', 'frontload-6yd',
	'pickup-truck', 'dump-truck-tandem', 'cargo-van',
	'mini-excavator-cad', 'excavator-20t', 'skid-steer-loader-cad', 'wheel-loader-3yd', 'backhoe-loader-cad',
	'light-tower', 'generator-20kva',
	'worker-standing', 'worker-walking', 'flagger',
	'pallet', 'pallet-concrete-bags', 'oil-drum', 'ibc-tote', 'popup-canopy-3x3', 'wheelbarrow',
] );

// The project's site: ?at=lat,lon&place=Name, else the last one in this browser, else the example.
// Kept for next time.
export function buildSite() {

	const url = new URL( window.location.href );
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

function cleanName( name ) {

	return typeof name === 'string' ? name.replace( /[\u0000-\u001f\u007f]/g, '' ).trim().slice( 0, 120 ) : '';

}

// Why there's no 3D map (build.js's mapsReason), as the page says it.
export function noMapReason( reason, plan ) {

	const free = plan?.views?.limit;
	switch ( reason ) {

		case 'used-up': return plan?.tier === 'pro'
			? `You've used this month's ${ free } 3D map views. They start again on the 1st.`
			: `You've used this month's ${ free ?? '' } free 3D map views. Build Pro gives you 300 a month. You can still lay out on flat ground.`;
		case 'busy': return 'Today\'s free 3D map views are all taken. Try again tomorrow, or go Build Pro. You can still lay out on flat ground.';
		case 'owner-free': return 'This shared project opens on flat ground: the 3D map comes with its owner\'s Build Pro.';
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
		<button type="button" class="site-current" aria-expanded="false" title="Where this project is: click to move it"><span class="site-label">Site</span> <span class="site-name"></span></button>
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

			results.replaceChildren( ...body.results.map( place => {

				const item = document.createElement( 'li' );
				const pick = document.createElement( 'button' );
				pick.type = 'button';
				pick.textContent = place.name;
				pick.addEventListener( 'click', () => moveTo( place ) );
				item.append( pick );
				return item;

			} ) );

		} catch ( err ) {

			results.replaceChildren( Object.assign( document.createElement( 'li' ), { textContent: `Couldn't search: ${ err.message }`, className: 'note' } ) );

		}

	} );

	function moveTo( place ) {

		const url = new URL( window.location.href );
		url.search = '';
		url.searchParams.set( 'at', `${ place.lat.toFixed( 6 ) },${ place.lon.toFixed( 6 ) }` );
		url.searchParams.set( 'place', place.name.split( ',' ).slice( 0, 2 ).join( ',' ) );
		toast?.( 'Moving the project…' );
		window.location.href = url.href;

	}

}
