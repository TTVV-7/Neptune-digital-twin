import './style.css';
import { BILLING_PAGE, PLANS, PRO_PHRASE, SOON, dateOf, intervalChoice, salesHidden } from '../build-plans.js';
import { TOLERANCE, TOLERANCE_MAX, hex, removeBackground } from '../logo-background.js';
import { STREET_ONLY, rankedPlaces, searchCredit, streetOnly } from '../search-results.js';

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
// At most 100 characters: the server refuses a longer site name (build.js's readFields).
const shortName = name => name.split( ',' ).slice( 0, 2 ).join( ',' ).trim().slice( 0, 100 ).trim();

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

		// Houses and numbered addresses first; when only the street was found, the list says so.
		const places = rankedPlaces( body );
		const street = streetOnly( body ) ? [ Object.assign( note( STREET_ONLY ), { className: 'note street-only' } ) ] : [];
		const credit = Object.assign( note( searchCredit( body ) ), { className: 'note credit' } );
		results.replaceChildren( ...street, ...places.map( place => {

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

		} ), credit );
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
			// Buying hidden: no "go Build Pro", as nothing can be bought.
			const more = salesHidden( home?.premium?.billing ) ? 'Open or delete your project below.' : 'Open or delete your project below, or go Build Pro.';
			said.textContent = err.status === 403 ? `${ err.message } ${ more }` : `Couldn't make the project: ${ err.message }`;
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

function showPlan() {

	const body = $( 'plan-body' );
	body.replaceChildren();
	const premium = home?.premium ?? {};
	// Buying hidden (the server's BUILD_SALES isn't 'on'): the plan and what it includes, never a
	// price or a way to buy.
	const hidden = salesHidden( premium.billing );
	if ( ! home?.signedIn ) {

		body.append( compare( premium ) );
		if ( premium.billing?.enabled ) body.append( upgrade( premium ) );
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
	const billed = billedLine( plan, hidden );
	if ( billed ) body.append( billed );

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
	if ( hidden ) {

		// Pro's what it includes, beside the free plan's, with no way to buy it; Manage billing only
		// for an account that has billing to manage (one that once paid).
		if ( plan.tier === 'free' ) body.append( proIncludes() );
		else if ( premium.billing?.portal ) body.append( manage( premium ) );

	} else if ( plan.tier === 'free' ) body.append( upgrade( premium ) );
	else if ( plan.subscribed || premium.billing?.portal ) body.append( manage( premium ) );

}

// Free, with buying hidden: what Build Pro includes, without a price or a way to buy it.
function proIncludes() {

	const box = document.createElement( 'div' );
	box.className = 'upgrade pro-includes';
	const lead = document.createElement( 'p' );
	lead.innerHTML = '<strong>Build Pro:</strong> ';
	lead.append( `${ PRO_PHRASE }.` );
	box.append( lead );
	return box;

}

// How Build Pro is paid for, under the plan's name: "US$5/month · renews on 3 Jan 2027", "ends on",
// or given by World Drive. null when there's nothing to say (free, the owner; a subscription while
// buying is hidden: no prices, no renewals).
function billedLine( plan, hidden = false ) {

	let text = '';
	if ( plan.subscribed && hidden ) return null;
	if ( plan.subscribed ) {

		const when = plan.renewsAt ? ` · ${ plan.cancelAtPeriodEnd ? 'ends' : 'renews' } on ${ dateOf( plan.renewsAt ) }` : '';
		text = `${ plan.priceLabel ?? 'Subscribed' }${ when }`;

	} else if ( plan.tier === 'pro' && plan.comped ) text = 'Given to you by World Drive';
	if ( ! text ) return null;
	return Object.assign( document.createElement( 'p' ), { className: 'billed', textContent: text } );

}

// Build Pro's: Manage billing (Stripe's billing portal for this account's customer: cancel, card,
// monthly or yearly, invoices), and the page where billing's shown in full.
function manage( premium ) {

	const box = document.createElement( 'div' );
	box.className = 'manage';
	if ( premium.billing?.portal ) box.append( portalButton( 'Manage billing' ) );
	box.append( Object.assign( document.createElement( 'a' ), { className: 'plain-link', href: BILLING_PAGE, textContent: 'Billing details' } ) );
	return box;

}

// A button that opens Stripe's billing portal for this account, in this tab (Stripe brings them
// back to the account page).
function portalButton( label ) {

	const open = Object.assign( document.createElement( 'button' ), { type: 'button', className: 'button portal', textContent: label } );
	open.addEventListener( 'click', async () => {

		open.disabled = true;
		try {

			const { url } = await call( 'POST', 'billing/portal' );
			location.assign( url );

		} catch ( err ) {

			toast( `Couldn't open billing: ${ err.message }` );
			open.disabled = false;

		}

	} );
	return open;

}

// The company logo shown on the equipment in the editor (src/logo.js). Build Pro's. Whatever is
// picked (PNG, JPEG, SVG...) is redrawn here as a PNG of LOGO_SIZE px at most before it's sent,
// after the logo editor (logoEditor) has shown it and, unless that's turned off, taken the plain
// box from behind it (src/logo-background.js), all in this page.
const LOGO_SIZE = 512;
// The server takes 256 KB of image at most (worker/drive/build.js's LOGO_BYTES): a little under.
const LOGO_MOST = 250 * 1024;
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

	note.textContent = home.hasLogo ? 'On both sides of your trucks, machines, trailers and bins. The Show panel can hide it.' : 'Put your logo on the trucks, machines and trailers in your projects. A white or coloured box behind it can be taken out here.';
	const shown = document.createElement( 'div' );
	if ( home.hasLogo ) {

		const img = document.createElement( 'img' );
		img.className = 'logo-preview';
		img.alt = 'Your company logo';
		img.src = `${ API }logo?at=${ Date.now() }`;
		shown.append( img );

	}

	box.append( shown );
	const row = document.createElement( 'div' );
	row.className = 'logo-actions';
	const input = Object.assign( document.createElement( 'input' ), { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', hidden: true, id: 'logo-file' } );
	const pick = Object.assign( document.createElement( 'button' ), { type: 'button', className: 'link', textContent: home.hasLogo ? 'Change' : 'Upload logo' } );
	pick.addEventListener( 'click', () => input.click() );
	// The picked file, or the saved logo, in the editor in place of the card's picture and links,
	// till it's saved or cancelled.
	const edit = async ( source, existing ) => {

		try {

			const canvas = await logoCanvas( source );
			const editor = logoEditor( canvas, { existing, close: () => {

				editor.remove();
				shown.hidden = row.hidden = false;
				input.value = '';

			} } );
			shown.hidden = row.hidden = true;
			box.append( editor );

		} catch {

			toast( 'Couldn\'t open that image. Try a PNG or JPEG.' );
			input.value = '';

		}

	};

	input.addEventListener( 'change', () => {

		const file = input.files?.[ 0 ];
		if ( file ) edit( file, false );

	} );
	row.append( input, pick );
	if ( home.hasLogo ) {

		const clean = Object.assign( document.createElement( 'button' ), { type: 'button', className: 'link', id: 'logo-clean', textContent: 'Remove background' } );
		clean.addEventListener( 'click', () => edit( `${ API }logo?at=${ Date.now() }`, true ) );
		const remove = Object.assign( document.createElement( 'button' ), { type: 'button', className: 'link', textContent: 'Remove' } );
		remove.addEventListener( 'click', async () => {

			await call( 'DELETE', 'logo' );
			await load();
			toast( 'Logo removed' );

		} );
		row.append( clean, remove );

	}

	box.append( row );
	return box;

}

// The logo editor: the logo before and after its background is taken out, on a checkerboard (or a
// machine's paint, to see its edge), with "Remove background" (on), its tolerance, and "Also clear
// enclosed areas of the same colour" (off); Save sends the after. existing: the saved logo, opened
// with "Remove background" (undone by uploading the original again).
function logoEditor( source, { existing, close } ) {

	const panel = document.createElement( 'div' );
	panel.className = 'logo-edit';
	panel.id = 'logo-edit';
	panel.innerHTML = `
		<div class="logo-compare">
			<figure><div class="logo-stage checker"><canvas id="logo-before"></canvas></div><figcaption>Before</figcaption></figure>
			<figure><div class="logo-stage checker" id="logo-after-stage"><canvas id="logo-after"></canvas></div><figcaption>After <span class="backdrops" role="group" aria-label="Show it on">
				<button type="button" class="backdrop checker" data-backdrop="checker" aria-label="On see-through" aria-pressed="true"></button>
				<button type="button" class="backdrop" data-backdrop="paint" style="--paint: #f2b705" aria-label="On yellow paint" aria-pressed="false"></button>
				<button type="button" class="backdrop" data-backdrop="dark" style="--paint: #2a2f35" aria-label="On dark paint" aria-pressed="false"></button>
			</span></figcaption></figure>
		</div>
		<label class="check"><input type="checkbox" id="logo-remove-bg" checked /> Remove background</label>
		<label class="range"><span>Tolerance</span><input type="range" id="logo-tolerance" min="0" max="${ TOLERANCE_MAX }" step="1" value="${ TOLERANCE }" /><output id="logo-tolerance-value">${ TOLERANCE }</output></label>
		<label class="check"><input type="checkbox" id="logo-enclosed" /> Also clear enclosed areas of the same colour</label>
		<p class="small logo-edit-note" id="logo-edit-note" aria-live="polite"></p>
		<div class="logo-actions"><button type="button" class="button" id="logo-save">Save logo</button><button type="button" class="link" id="logo-cancel">Cancel</button></div>`;
	const q = id => panel.querySelector( `#${ id }` );
	const before = q( 'logo-before' ), after = q( 'logo-after' );
	before.width = source.width;
	before.height = source.height;
	before.getContext( '2d' ).drawImage( source, 0, 0 );
	const pixels = source.getContext( '2d', { willReadFrequently: true } ).getImageData( 0, 0, source.width, source.height );
	const remove = q( 'logo-remove-bg' ), tolerance = q( 'logo-tolerance' ), enclosed = q( 'logo-enclosed' ), note = q( 'logo-edit-note' );
	let result = null;
	const run = () => {

		q( 'logo-tolerance-value' ).textContent = tolerance.value;
		tolerance.disabled = enclosed.disabled = ! remove.checked;
		const out = remove.checked ? removeBackground( pixels, { tolerance: Number( tolerance.value ), enclosed: enclosed.checked } ) : { image: pixels, skipped: 'off' };
		const image = out.empty ? pixels : out.image;
		after.width = image.width;
		after.height = image.height;
		after.getContext( '2d' ).putImageData( new ImageData( new Uint8ClampedArray( image.data ), image.width, image.height ), 0, 0 );
		result = out;
		note.textContent = {
			off: existing ? 'Kept as it is.' : 'Kept as it is: the whole picture goes on the equipment.',
			transparent: 'Its background is see-through already: nothing to take out.',
			busy: 'No one plain colour round its edge to take out (a photo?): kept as it is.',
		}[ out.skipped ] ?? ( out.empty
			? 'That tolerance takes the whole logo: turn it down.'
			: `Took out the ${ out.colours.length > 1 ? 'shades of ' : '' }${ hex( out.colours[ 0 ] ) } background (${ Math.round( out.removed * 100 ) } % of the picture) and trimmed to the logo.${ existing ? ' To undo, upload the original again.' : '' }` );
		q( 'logo-save' ).disabled = !! out.empty;
		panel.dataset.state = out.skipped ?? ( out.empty ? 'empty' : 'removed' );

	};

	// Redrawn once a frame at most while the slider's dragged.
	let pending = false;
	const later = () => {

		if ( pending ) return;
		pending = true;
		requestAnimationFrame( () => {

			pending = false;
			run();

		} );

	};

	tolerance.addEventListener( 'input', later );
	remove.addEventListener( 'change', run );
	enclosed.addEventListener( 'change', run );
	for ( const button of panel.querySelectorAll( '.backdrop' ) ) button.addEventListener( 'click', () => {

		const stage = q( 'logo-after-stage' );
		stage.className = `logo-stage ${ button.dataset.backdrop === 'checker' ? 'checker' : 'paint' }`;
		stage.style.setProperty( '--paint', button.style.getPropertyValue( '--paint' ) );
		for ( const other of panel.querySelectorAll( '.backdrop' ) ) other.setAttribute( 'aria-pressed', String( other === button ) );

	} );
	q( 'logo-cancel' ).addEventListener( 'click', close );
	q( 'logo-save' ).addEventListener( 'click', async () => {

		const save = q( 'logo-save' );
		save.disabled = true;
		try {

			await call( 'PUT', 'logo', { image: logoDataUrl( after ) } );
			close();
			await load();
			toast( result?.skipped ? 'Logo saved. It shows on your equipment next time the editor opens.' : 'Logo saved with its background taken out. It shows on your equipment next time the editor opens.' );

		} catch ( err ) {

			save.disabled = false;
			toast( `Couldn't save the logo: ${ err.message }` );

		}

	} );
	run();
	return panel;

}

// A picked file, or the saved logo's address, drawn on a canvas LOGO_SIZE px on its longer side at
// most, its transparency kept.
async function logoCanvas( source ) {

	const url = typeof source === 'string' ? source : URL.createObjectURL( source );
	try {

		const img = new Image();
		img.src = url;
		await img.decode();
		const w = img.naturalWidth || LOGO_SIZE, h = img.naturalHeight || LOGO_SIZE;
		const k = Math.min( 1, LOGO_SIZE / Math.max( w, h ) );
		const canvas = document.createElement( 'canvas' );
		canvas.width = Math.max( 1, Math.round( w * k ) );
		canvas.height = Math.max( 1, Math.round( h * k ) );
		canvas.getContext( '2d', { willReadFrequently: true } ).drawImage( img, 0, 0, canvas.width, canvas.height );
		return canvas;

	} finally {

		if ( typeof source !== 'string' ) URL.revokeObjectURL( url );

	}

}

// The canvas as a PNG data: URL (alpha and all) under the server's limit: a busy one too big as a
// PNG goes as a WebP where the browser makes one (alpha kept), else smaller till it fits.
function logoDataUrl( canvas ) {

	const bytes = url => Math.floor( ( url.length - url.indexOf( ',' ) - 1 ) * 3 / 4 );
	let png = canvas.toDataURL( 'image/png' );
	if ( bytes( png ) <= LOGO_MOST ) return png;
	const webp = canvas.toDataURL( 'image/webp', 0.92 );
	if ( webp.startsWith( 'data:image/webp' ) && bytes( webp ) <= LOGO_MOST ) return webp;
	let current = canvas;
	while ( bytes( png ) > LOGO_MOST && current.width > 16 ) {

		const smaller = document.createElement( 'canvas' );
		smaller.width = Math.max( 1, Math.round( current.width * 0.8 ) );
		smaller.height = Math.max( 1, Math.round( current.height * 0.8 ) );
		smaller.getContext( '2d' ).drawImage( current, 0, 0, smaller.width, smaller.height );
		current = smaller;
		png = current.toDataURL( 'image/png' );

	}

	return png;

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

// Going Build Pro: monthly or yearly, then Stripe's checkout (a Checkout Session made for this
// account, billing.js) in this tab. Signed out it asks to sign in first, so Build Pro has an
// account to go to; until it's on sale it says it opens soon.
function upgrade( premium ) {

	const box = document.createElement( 'div' );
	box.className = 'upgrade';
	const billing = premium.billing;
	const lead = document.createElement( 'p' );
	if ( ! billing?.enabled ) {

		lead.innerHTML = `<strong>${ SOON }</strong> `;
		lead.append( `Build Pro: ${ PRO_PHRASE }.` );
		box.append( lead );
		return box;

	}

	lead.innerHTML = '<strong>Build Pro:</strong> ';
	lead.append( `${ PRO_PHRASE }.` );
	const choice = intervalChoice( billing, 'upgrade-interval' );
	const go = Object.assign( document.createElement( 'button' ), { type: 'button', className: 'button go-pro', textContent: 'Go Build Pro' } );
	const said = Object.assign( document.createElement( 'p' ), { className: 'small upgrade-note', hidden: true } );
	go.addEventListener( 'click', async () => {

		said.hidden = true;
		if ( ! home?.signedIn ) {

			said.textContent = 'Sign in first (top right), so Build Pro goes to your account.';
			said.hidden = false;
			$( 'google-button' ).scrollIntoView( { block: 'nearest' } );
			return;

		}

		go.disabled = true;
		try {

			const { url } = await call( 'POST', 'billing/checkout', { interval: choice.interval() } );
			location.assign( url );

		} catch ( err ) {

			said.textContent = err.status === 409 ? err.message : `Couldn't start the checkout: ${ err.message }`;
			said.hidden = false;
			go.disabled = false;
			// Subscribed already (in another tab, say): show it.
			if ( err.status === 409 ) load();

		}

	} );
	box.append( lead, choice.choices, go, choice.renews, said );
	return box;

}

// Signed out: the two plans side by side.
function compare( premium ) {

	const wrap = document.createElement( 'div' );
	wrap.className = 'compare';
	const billing = premium.billing;
	// Buying hidden: Build Pro's card has no price, nor "opens soon".
	const pro = salesHidden( billing ) ? '' : billing?.enabled ? billing.monthly : 'Opens soon';
	for ( const [ tier, price ] of [ [ 'free', 'Free' ], [ 'pro', pro ] ] ) {

		const card = document.createElement( 'div' );
		card.className = `compare-card compare-${ tier }`;
		card.innerHTML = '<span class="tier"></span><span class="price"></span><p></p>';
		card.querySelector( '.tier' ).textContent = PLANS[ tier ].name;
		card.querySelector( '.price' ).textContent = price;
		card.querySelector( '.price' ).hidden = ! price;
		card.querySelector( 'p' ).textContent = PLANS[ tier ].blurb;
		wrap.append( card );

	}

	return wrap;

}

// --- notices -------------------------------------------------------------------------------

// A line above the page that needs reading: a failed payment, Build Pro ending, back from Stripe's
// checkout. One for each `key`, replaced when said again. action: an element (a button or link).
function notice( key, text, { action = null, tone = '' } = {} ) {

	const list = $( 'notices' );
	let line = list.querySelector( `[data-notice="${ key }"]` );
	if ( ! line ) {

		line = document.createElement( 'div' );
		line.dataset.notice = key;
		line.setAttribute( 'role', 'status' );
		list.append( line );

	}

	line.className = tone ? `notice notice-${ tone }` : 'notice';
	const words = document.createElement( 'span' );
	words.textContent = text;
	line.replaceChildren( words );
	if ( action ) line.append( action );
	list.hidden = false;

}

function clearNotice( key ) {

	const list = $( 'notices' );
	list.querySelector( `[data-notice="${ key }"]` )?.remove();
	list.hidden = ! list.children.length;

}

// What the subscription needs said: its card failed (Stripe retries it, and Pro stays on meanwhile),
// or it's been cancelled and ends when the period paid for does.
function showNotices() {

	const plan = home?.plan;
	const portal = !! home?.premium?.billing?.portal;
	// Buying hidden: nothing about a subscription's payments or renewal, unless there's billing to
	// manage (Stripe's portal, where it's fixed or cancelled).
	if ( salesHidden( home?.premium?.billing ) && ! portal ) {

		clearNotice( 'past-due' );
		clearNotice( 'ends' );
		return;

	}

	const fix = label => portal ? portalButton( label ) : Object.assign( document.createElement( 'a' ), { className: 'plain-link', href: BILLING_PAGE, textContent: label } );
	if ( plan?.pastDue ) notice( 'past-due', 'Payment failed - update your card to keep Build Pro.', { action: fix( 'Update card' ), tone: 'warn' } );
	else clearNotice( 'past-due' );
	if ( plan?.cancelAtPeriodEnd && plan.renewsAt ) notice( 'ends', `Pro ends on ${ dateOf( plan.renewsAt ) }.`, { action: fix( 'Keep Build Pro' ) } );
	else clearNotice( 'ends' );

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

// The site this page was opened from, as its host ('direct' for none, or this site): sent with the
// first ask only, so the owner's admin page counts the visit and where it came from
// (worker/drive/build.js), never who. Later asks (after signing in, or paying) send nothing.
let openedFrom = referrerHost();

function referrerHost() {

	try {

		const from = new URL( document.referrer ).hostname.toLowerCase().replace( /^www\./, '' );
		return from && from !== location.hostname.replace( /^www\./, '' ) ? from : 'direct';

	} catch {

		return 'direct';

	}

}

async function load() {

	try {

		const path = openedFrom === null ? 'home' : `home?ref=${ encodeURIComponent( openedFrom ) }`;
		openedFrom = null;
		home = await call( 'GET', path );

	} catch {

		home = null;
		$( 'projects-empty' ).textContent = 'Couldn\'t reach World Drive Build just now. Reload to try again.';

	}

	showAccount();
	showPlan();
	showNotices();
	await showProjects();
	// All shown (for the tests).
	document.body.dataset.loaded = 'yes';

}

// Back from Stripe's checkout. ?checkout=done (or ?premium=thanks, from the old Payment Link) asks
// GET me until Build Pro shows, because the webhook can take a moment; ?checkout=cancelled says
// nothing was bought. With buying hidden there's no checkout to come back from, so a stale link
// (a bookmark, an old Stripe return) just loses its ?checkout and says nothing.
const RECHECKS = 10;
const RECHECK_DELAY = 3000;
async function welcomeBack() {

	const url = new URL( location.href );
	const back = url.searchParams.get( 'checkout' ) ?? ( url.searchParams.get( 'premium' ) === 'thanks' ? 'done' : null );
	if ( back !== 'done' && back !== 'cancelled' ) return;
	url.searchParams.delete( 'checkout' );
	url.searchParams.delete( 'premium' );
	history.replaceState( null, '', url.href );
	if ( salesHidden( home?.premium?.billing ) ) return;
	if ( back === 'cancelled' ) {

		notice( 'checkout', 'Checkout cancelled. Nothing was charged.' );
		return;

	}

	if ( ! home?.signedIn ) {

		notice( 'checkout', 'Thanks for subscribing! Sign in with the account you subscribed with to use Build Pro.' );
		return;

	}

	for ( let i = 0; i < RECHECKS; i ++ ) {

		const me = await call( 'GET', 'me' ).catch( () => null );
		if ( me?.plan && me.plan.tier !== 'free' ) {

			await load();
			notice( 'checkout', 'Build Pro is on. Thanks for subscribing!', { tone: 'good' } );
			return;

		}

		notice( 'checkout', 'Thanks! Waiting for Stripe to confirm your subscription...' );
		await new Promise( resolve => setTimeout( resolve, RECHECK_DELAY ) );

	}

	notice( 'checkout', 'Stripe hasn\'t confirmed it yet. Build Pro turns on by itself once it has: reload in a few minutes.' );

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
