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
			go.textContent = home?.signedIn ? 'Just look around →' : 'Open the map →';
			link.append( title, rest, go );
			item.append( link );
			// Signed in: start a project here, saved to the account before the editor opens.
			if ( home?.signedIn ) item.append( startHere( place ) );
			return item;

		} ) );
		results.querySelector( 'a' )?.focus();

	} catch ( err ) {

		results.replaceChildren( note( `Couldn't search just now: ${ err.message }` ) );

	} finally {

		$( 'find-go' ).disabled = false;

	}

} );

// A place's "Start a project here": a name (the place's, to begin with) and Create, which saves an
// empty project there and opens it, so everything placed is saved to it from the start.
function startHere( place ) {

	const form = document.createElement( 'form' );
	form.className = 'start-here';
	const site = shortName( place.name );
	const name = Object.assign( document.createElement( 'input' ), { type: 'text', value: site, maxLength: 100, required: true, ariaLabel: 'Project name' } );
	name.setAttribute( 'aria-label', 'Project name' );
	const create = Object.assign( document.createElement( 'button' ), { type: 'submit', textContent: 'Start a project here' } );
	const said = document.createElement( 'p' );
	said.className = 'small start-note';
	said.hidden = true;
	form.append( name, create, said );
	form.addEventListener( 'submit', async e => {

		e.preventDefault();
		create.disabled = true;
		try {

			const data = { version: 2, site, lat: place.lat, lon: place.lon, items: [], extras: {} };
			const made = await call( 'POST', 'layouts', { site, name: name.value.trim() || site, data } );
			location.href = editorAt( { lat: place.lat, lon: place.lon, name: site, project: made.id } );

		} catch ( err ) {

			said.hidden = false;
			said.textContent = err.status === 403 ? `${ err.message } Open or delete your project below, or go Build Pro.` : `Couldn't make the project: ${ err.message }`;
			create.disabled = false;

		}

	} );
	return form;

}

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
	empty.textContent = 'No projects yet. Search for your site above and choose Start a project here.';
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
		const actions = document.createElement( 'div' );
		actions.className = 'project-actions';
		const rename = Object.assign( document.createElement( 'button' ), { type: 'button', className: 'link', textContent: 'Rename' } );
		rename.addEventListener( 'click', async () => {

			const to = window.prompt( 'Rename the project:', project.name )?.trim();
			if ( ! to || to === project.name ) return;
			try {

				await call( 'PUT', `layouts/${ project.id }`, { name: to.slice( 0, 100 ) } );
				await showProjects();

			} catch ( err ) {

				toast( `Couldn't rename it: ${ err.message }` );

			}

		} );
		const remove = Object.assign( document.createElement( 'button' ), { type: 'button', className: 'link danger', textContent: 'Delete' } );
		remove.addEventListener( 'click', async () => {

			if ( ! window.confirm( `Delete "${ project.name }"? This can't be undone.` ) ) return;
			try {

				await call( 'DELETE', `layouts/${ project.id }` );
				await showProjects();
				toast( `Deleted "${ project.name }"` );

			} catch ( err ) {

				toast( `Couldn't delete it: ${ err.message }` );

			}

		} );
		actions.append( rename, remove );
		item.append( link, actions );
		return item;

	} ) );

}

// --- the plan ------------------------------------------------------------------------------

const PLANS = {
	free: { name: 'Free', blurb: 'Everyday site pieces, 15 3D map views a month, one saved project.' },
	// Not "unlimited projects": the server caps Pro at BUILD_LAYOUT_LIMIT (worker/drive/build.js, 200
	// unless set), so the blurb promises more of them, and proBlurb() puts the number in once the
	// server has said it (a Pro account's plan.layouts).
	pro: { name: 'Build Pro', blurb: 'The whole library and sets, 300 3D map views a month, far more projects and share links.' },
	owner: { name: 'Owner', blurb: 'Everything, with 3D map views that are never counted.' },
};

// Build Pro's blurb with how many projects it keeps, when that's known: only a Pro account is told
// (its plan.layouts); everyone else gets the plain words.
function proBlurb( layouts ) {

	return Number.isFinite( layouts ) && layouts > 1 ? `The whole library and sets, 300 3D map views a month, up to ${ layouts } projects and share links.` : PLANS.pro.blurb;

}

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
	head.querySelector( '.plan-blurb' ).textContent = plan.tier === 'pro' ? proBlurb( plan.layouts ) : info.blurb;
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
	body.append( claudeCard( plan.tier ) );
	body.append( logoCard( plan.tier ) );
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

// The company logo shown on the equipment in the editor (src/logo.js). Build Pro's. Whatever is
// picked (PNG, JPEG, SVG...) is redrawn here as a PNG of LOGO_SIZE px at most before it's sent.
const LOGO_SIZE = 512;
function logoCard( tier ) {

	const box = document.createElement( 'div' );
	box.className = 'claude logo-card';
	box.id = 'logo-card';
	box.innerHTML = '<h3>Company logo</h3><p class="small"></p>';
	const note = box.querySelector( 'p' );
	if ( tier === 'free' ) {

		note.textContent = 'With Build Pro, your logo goes on the trucks, machines and trailers in your projects.';
		return box;

	}

	note.textContent = home.hasLogo ? 'On both sides of your trucks, machines, trailers and bins. The Show panel can hide it.' : 'Put your logo on the trucks, machines and trailers in your projects. A PNG with a see-through background looks best.';
	if ( home.hasLogo ) {

		const img = document.createElement( 'img' );
		img.className = 'logo-preview';
		img.alt = 'Your company logo';
		img.src = `${ API }logo?at=${ Date.now() }`;
		box.append( img );

	}

	const row = document.createElement( 'div' );
	row.className = 'logo-actions';
	const input = Object.assign( document.createElement( 'input' ), { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', hidden: true, id: 'logo-file' } );
	const pick = Object.assign( document.createElement( 'button' ), { type: 'button', className: 'link', textContent: home.hasLogo ? 'Change' : 'Upload logo' } );
	pick.addEventListener( 'click', () => input.click() );
	input.addEventListener( 'change', async () => {

		const file = input.files?.[ 0 ];
		if ( ! file ) return;
		try {

			await call( 'PUT', 'logo', { image: await logoImage( file ) } );
			await load();
			toast( 'Logo saved. It shows on your equipment next time the editor opens.' );

		} catch ( err ) {

			toast( `Couldn't save the logo: ${ err.message }` );

		}

	} );
	row.append( input, pick );
	if ( home.hasLogo ) {

		const remove = Object.assign( document.createElement( 'button' ), { type: 'button', className: 'link', textContent: 'Remove' } );
		remove.addEventListener( 'click', async () => {

			await call( 'DELETE', 'logo' );
			await load();
			toast( 'Logo removed' );

		} );
		row.append( remove );

	}

	box.append( row );
	return box;

}

// A picked image file as a PNG data: URL, LOGO_SIZE px on its longer side at most, its transparency kept.
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

// Claude, connected through the MCP server (/mcp): how to, and the way to cut it off. Build Pro's.
function claudeCard( tier ) {

	const box = document.createElement( 'div' );
	box.className = 'claude';
	box.id = 'claude';
	const address = new URL( '/mcp', location.origin ).href;
	box.innerHTML = '<h3>Build with Claude</h3><p class="small"></p><div class="mcp-url"><code></code><button type="button" class="link copy">Copy</button></div><p class="small claude-state"></p>';
	box.querySelector( 'code' ).textContent = address;
	box.querySelector( 'p' ).textContent = tier === 'free'
		? 'With Build Pro, Claude can lay out your sites for you: add this as a custom connector in Claude.'
		: 'Add this as a custom connector in Claude (Settings, Connectors), then ask it to lay out a site.';
	box.querySelector( '.copy' ).addEventListener( 'click', async () => {

		try {

			await navigator.clipboard.writeText( address );
			toast( 'Copied' );

		} catch {

			toast( address );

		}

	} );
	const state = box.querySelector( '.claude-state' );
	const connected = home.connections ?? 0;
	if ( connected ) {

		state.textContent = `Connected: ${ connected === 1 ? 'one app' : `${ connected } apps` }. `;
		const cut = document.createElement( 'button' );
		cut.type = 'button';
		cut.className = 'link';
		cut.id = 'disconnect-claude';
		cut.textContent = 'Disconnect';
		cut.addEventListener( 'click', async () => {

			await call( 'DELETE', 'connections' );
			await load();
			toast( 'Disconnected. Claude asks to be allowed again next time.' );

		} );
		state.append( cut );

	} else state.hidden = true;
	return box;

}

function upgrade( premium ) {

	const box = document.createElement( 'div' );
	box.className = 'upgrade';
	if ( ! premium.link ) {

		box.innerHTML = '<p><strong>Build Pro opens soon.</strong> The whole library, sets, 300 views a month, far more projects and share links.</p>';
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
	// The price only when the server has one (BUILD_PRICE): without it the button just says so, and
	// Stripe's checkout shows the price, rather than the page making one up.
	link.textContent = premium.price ? `Go Build Pro · ${ premium.price }` : 'Go Build Pro';
	box.append( link, Object.assign( document.createElement( 'p' ), { className: 'small', textContent: 'Billed monthly through Stripe. Cancel any time.' } ), terms() );
	return box;

}

// The small print under the button, as the Supporter Pass has it (src/drive-app/supporter.js): what
// buying agrees to and how to get the money back, before anyone pays (drive/site/legal.js covers
// Build Pro in its terms and refunds). Built from text nodes and links, nothing from the server in it.
function terms() {

	const page = ( href, words ) => Object.assign( document.createElement( 'a' ), { href, target: '_blank', rel: 'noopener', textContent: words } );
	const small = Object.assign( document.createElement( 'p' ), { className: 'small upgrade-terms' } );
	small.append( 'By buying you agree to the ', page( '/terms/', 'terms' ), '. Prices in CAD, plus tax where it applies. Changed your mind? A full refund within 14 days: see ', page( '/refunds/', 'refunds' ), '.' );
	return small;

}

// Signed out: the two plans side by side.
function compare( premium ) {

	const wrap = document.createElement( 'div' );
	wrap.className = 'compare';
	for ( const [ tier, price ] of [ [ 'free', 'Free' ], [ 'pro', premium.link ? premium.price ?? 'Monthly' : 'Opens soon' ] ] ) {

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

// New project: back up to the search, which starts one.
$( 'new-project' ).addEventListener( 'click', () => {

	const query = $( 'find-query' );
	query.scrollIntoView( { behavior: 'smooth', block: 'center' } );
	query.focus();
	toast( 'Search for the site, then choose Start a project here' );

} );
