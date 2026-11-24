import './style.css';

// World Drive Build's dashboard (worlddrive.app/build/, drive/build/index.html, docs/build.md): find a
// site by address and open the editor there (/build/app/), your saved projects, your plan, and
// signing in. It talks to /build/api/ (worker/drive/build.js): home (no 3D map view taken), layouts,
// session; and World Drive's place search (/api/search).

const $ = id => document.getElementById( id );
const API = '/build/api/';
const EDITOR = '/build/app/';
const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';

let home = null;

// --- talking to the server -----------------------------------------------------------------

async function call( method, path, body ) {

	const init = { method, headers: { Accept: 'application/json' } };
	if ( method !== 'GET' ) {

		init.headers[ 'Content-Type' ] = 'application/json';
		init.body = JSON.stringify( body ?? {} );

	}

	const res = await fetch( API + path, init );
	const data = res.status === 204 ? null : await res.json().catch( () => null );
	if ( ! res.ok ) throw Object.assign( new Error( data?.error ?? `error ${ res.status }` ), { status: res.status } );
	return data;

}

function toast( text ) {

	const el = $( 'toast' );
	el.textContent = text;
	el.hidden = false;
	clearTimeout( toast.timer );
	toast.timer = setTimeout( () => el.hidden = true, 4000 );

}

// --- finding a site ------------------------------------------------------------------------

function editorAt( { lat, lon, name, project } ) {

	const url = new URL( EDITOR, location.href );
	if ( Number.isFinite( lat ) && Number.isFinite( lon ) ) url.searchParams.set( 'at', `${ lat.toFixed( 6 ) },${ lon.toFixed( 6 ) }` );
	if ( name ) url.searchParams.set( 'place', name );
	if ( project ) url.searchParams.set( 'project', project );
	return url.href;

}

// A place's name as the editor shows it: its first two parts ("CN Tower, Front Street West").
const shortName = name => name.split( ',' ).slice( 0, 2 ).join( ',' ).trim();

$( 'find' ).addEventListener( 'submit', async e => {

	e.preventDefault();
	const q = $( 'find-query' ).value.trim();
	const results = $( 'results' );
	if ( ! q ) return;
	$( 'find-go' ).disabled = true;
	results.replaceChildren( note( 'Searching…' ) );
	try {

		const res = await fetch( `/api/search?q=${ encodeURIComponent( q ) }`, { headers: { Accept: 'application/json' } } );
		const body = await res.json().catch( () => ( {} ) );
		if ( ! res.ok ) throw new Error( body.error ?? `search answered ${ res.status }` );
		if ( ! body.results?.length ) {

			results.replaceChildren( note( 'Nothing found. Try a street address with its town, or a landmark.' ) );
			return;

		}

		results.replaceChildren( ...body.results.map( place => {

			const item = document.createElement( 'li' );
			const link = document.createElement( 'a' );
			link.href = editorAt( { lat: place.lat, lon: place.lon, name: shortName( place.name ) } );
			const title = document.createElement( 'strong' );
			title.textContent = shortName( place.name );
			const rest = document.createElement( 'span' );
			rest.textContent = place.name.split( ',' ).slice( 2 ).join( ',' ).trim();
			const go = document.createElement( 'span' );
			go.className = 'go';
			go.textContent = 'Open the map →';
			link.append( title, rest, go );
			item.append( link );
			return item;

		} ) );
		results.querySelector( 'a' )?.focus();

	} catch ( err ) {

		results.replaceChildren( note( `Couldn't search just now: ${ err.message }` ) );

	} finally {

		$( 'find-go' ).disabled = false;

	}

} );

function note( text ) {

	const li = document.createElement( 'li' );
	li.className = 'note';
	li.textContent = text;
	return li;

}

// --- projects ----------------------------------------------------------------------------

function ago( time ) {

	const minutes = Math.round( ( Date.now() - time ) / 60000 );
	if ( minutes < 1 ) return 'just now';
	if ( minutes < 60 ) return `${ minutes } min ago`;
	const hours = Math.round( minutes / 60 );
	if ( hours < 24 ) return `${ hours } h ago`;
	const days = Math.round( hours / 24 );
	if ( days < 30 ) return `${ days } day${ days === 1 ? '' : 's' } ago`;
	return new Date( time ).toLocaleDateString( 'en-CA', { year: 'numeric', month: 'short', day: 'numeric' } );

}

async function showProjects() {

	const list = $( 'project-list' );
	const empty = $( 'projects-empty' );
	list.replaceChildren();
	$( 'project-count' ).textContent = '';
	if ( ! home?.signedIn ) {

		empty.textContent = 'Sign in (top right) to keep projects in your account and open them on any computer.';
		empty.hidden = false;
		return;

	}

	let layouts = [];
	try {

		( { layouts } = await call( 'GET', 'layouts' ) );

	} catch ( err ) {

		empty.textContent = `Couldn't load your projects: ${ err.message }`;
		empty.hidden = false;
		return;

	}

	const most = home.plan?.layouts;
	$( 'project-count' ).textContent = most ? `${ layouts.length } of ${ most }` : String( layouts.length );
	empty.hidden = layouts.length > 0;
	empty.textContent = 'No projects yet. Find your site above, lay a few things out, then save it from the editor\'s library (Layouts → Save as new).';
	list.replaceChildren( ...layouts.map( project => {

		const item = document.createElement( 'li' );
		const link = document.createElement( 'a' );
		link.className = 'project';
		link.href = editorAt( { lat: project.lat, lon: project.lon, name: project.site, project: project.id } );
		const name = document.createElement( 'strong' );
		name.textContent = project.name;
		const site = document.createElement( 'span' );
		site.className = 'site';
		site.textContent = project.site;
		const meta = document.createElement( 'span' );
		meta.className = 'meta';
		meta.textContent = `Saved ${ ago( project.updatedAt ) }${ project.shared ? ' · shared by link' : '' }`;
		link.append( name, site, meta );
		item.append( link );
		return item;

	} ) );

}

// --- the plan ------------------------------------------------------------------------------

const PLANS = {
	free: { name: 'Free', blurb: 'Everyday site pieces, 15 3D map views a month, one saved project.' },
	pro: { name: 'Build Pro', blurb: 'The whole library and sets, 300 3D map views a month, unlimited projects and share links.' },
	owner: { name: 'Owner', blurb: 'Everything, with 3D map views that are never counted.' },
};

function showPlan() {

	const body = $( 'plan-body' );
	body.replaceChildren();
	const premium = home?.premium ?? {};
	if ( ! home?.signedIn ) {

		body.append( compare( premium ) );
		return;

	}

	const plan = home.plan;
	const info = PLANS[ plan.tier ] ?? PLANS.free;
	const head = document.createElement( 'div' );
	head.className = 'plan-head';
	head.innerHTML = `<span class="tier tier-${ plan.tier }"></span><p class="plan-blurb"></p>`;
	head.querySelector( '.tier' ).textContent = info.name;
	head.querySelector( '.plan-blurb' ).textContent = info.blurb;
	body.append( head );

	// 3D map views this month: a gauge, as a site's fuel or hours meter.
	const views = plan.views;
	const meter = document.createElement( 'div' );
	meter.className = 'meter';
	if ( views.limit === null ) meter.innerHTML = '<span class="meter-label">3D map views</span><span class="meter-value">Unlimited</span>';
	else {

		const share = Math.min( 1, views.used / Math.max( 1, views.limit ) );
		meter.innerHTML = `<span class="meter-label">3D map views this month</span><span class="meter-value"></span><span class="bar"><i></i></span><span class="meter-note"></span>`;
		meter.querySelector( '.meter-value' ).textContent = `${ views.used } / ${ views.limit }`;
		meter.querySelector( 'i' ).style.width = `${ share * 100 }%`;
		meter.classList.toggle( 'low', share >= 0.8 );
		meter.querySelector( '.meter-note' ).textContent = views.used >= views.limit ? 'Used up: the editor opens on flat ground till the 1st.' : 'Each time the editor opens on the 3D map is one view. They start again on the 1st.';

	}

	body.append( meter );
	if ( plan.tier === 'free' ) body.append( upgrade( premium ) );
	else if ( premium.manage ) {

		const manage = document.createElement( 'a' );
		manage.className = 'plain-link';
		manage.href = premium.manage;
		manage.target = '_blank';
		manage.rel = 'noopener';
		manage.textContent = 'Manage your subscription';
		body.append( manage );

	}

}

function upgrade( premium ) {

	const box = document.createElement( 'div' );
	box.className = 'upgrade';
	if ( ! premium.link ) {

		box.innerHTML = '<p><strong>Build Pro opens soon.</strong> The whole library, sets, 300 views a month, unlimited projects and share links.</p>';
		return box;

	}

	const link = document.createElement( 'a' );
	link.className = 'button';
	const url = new URL( premium.link );
	if ( premium.clientReferenceId ) url.searchParams.set( 'client_reference_id', premium.clientReferenceId );
	if ( home.user?.email?.includes( '@' ) ) url.searchParams.set( 'prefilled_email', home.user.email );
	link.href = url.href;
	link.target = '_blank';
	link.rel = 'noopener';
	link.textContent = `Go Build Pro · ${ premium.price }`;
	box.append( link, Object.assign( document.createElement( 'p' ), { className: 'small', textContent: 'Billed monthly through Stripe. Cancel any time.' } ) );
	return box;

}

// Signed out: the two plans side by side.
function compare( premium ) {

	const wrap = document.createElement( 'div' );
	wrap.className = 'compare';
	for ( const [ tier, price ] of [ [ 'free', 'Free' ], [ 'pro', premium.link ? premium.price : 'Opens soon' ] ] ) {

		const card = document.createElement( 'div' );
		card.className = `compare-card compare-${ tier }`;
		card.innerHTML = '<span class="tier"></span><span class="price"></span><p></p>';
		card.querySelector( '.tier' ).textContent = PLANS[ tier ].name;
		card.querySelector( '.price' ).textContent = price;
		card.querySelector( 'p' ).textContent = PLANS[ tier ].blurb;
		wrap.append( card );

	}

	return wrap;

}

// --- signing in ----------------------------------------------------------------------------

function showAccount() {

	const signedIn = !! home?.signedIn;
	$( 'who' ).hidden = ! signedIn;
	$( 'google-button' ).hidden = signedIn;
	if ( signedIn ) {

		$( 'who-name' ).textContent = home.user.name || home.user.email;
		const tier = home.plan.tier;
		$( 'plan-pill' ).textContent = PLANS[ tier ]?.name ?? tier;
		$( 'plan-pill' ).className = `plan-pill tier-${ tier }`;

	} else if ( home?.googleClientId ) renderGoogleButton();

}

let google = null;
function renderGoogleButton() {

	google ??= new Promise( ( resolve, reject ) => {

		const script = document.createElement( 'script' );
		script.src = GOOGLE_SCRIPT;
		script.async = true;
		script.onload = () => resolve( window.google.accounts.id );
		script.onerror = reject;
		document.head.append( script );

	} );
	google.then( id => {

		id.initialize( { client_id: home.googleClientId, callback: ( { credential } ) => signIn( credential ), ux_mode: 'popup', auto_select: false } );
		id.renderButton( $( 'google-button' ), { theme: 'filled_black', size: 'medium', text: 'signin_with', shape: 'pill' } );

	} ).catch( () => {

		$( 'google-button' ).textContent = 'Google sign-in didn\'t load. Check your connection or ad blocker, then reload.';

	} );

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

$( 'sign-out' ).addEventListener( 'click', async () => {

	try {

		await call( 'DELETE', 'session' );

	} catch {

		// Signed out either way.

	}

	await load();
	toast( 'Signed out' );

} );

// --- start -------------------------------------------------------------------------------

async function load() {

	try {

		home = await call( 'GET', 'home' );

	} catch {

		home = null;
		$( 'projects-empty' ).textContent = 'Couldn\'t reach World Drive Build just now. Reload to try again.';

	}

	showAccount();
	showPlan();
	await showProjects();
	// All shown (for the tests).
	document.body.dataset.loaded = 'yes';

}

// Back from Stripe (?premium=thanks): ask until Build Pro shows (the webhook can take a moment).
async function welcomeBack() {

	const url = new URL( location.href );
	if ( url.searchParams.get( 'premium' ) !== 'thanks' ) return;
	url.searchParams.delete( 'premium' );
	history.replaceState( null, '', url.href );
	for ( let i = 0; i < 10; i ++ ) {

		if ( home?.plan && home.plan.tier !== 'free' ) {

			toast( 'Build Pro is on. Thanks for subscribing!' );
			return;

		}

		await new Promise( resolve => setTimeout( resolve, 3000 ) );
		await load();

	}

	toast( 'Stripe hasn\'t confirmed it yet. Build Pro turns on by itself once it has: reload in a few minutes.' );

}

window.buildHome = { get home() {

	return home;

}, load };

await load();
welcomeBack();
