import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPOTS } from '../../src/drive-app/places.js';
import { PLACES } from './places.js';

// World Drive's pages for search engines and links (docs/world-drive.md, "Search engines"): a page
// for each place in places.js at /drive/<slug>/, a page listing them at /drive/, the list on the
// home page (drive/index.html's <!-- places --> becomes it) and /sitemap.xml. They're plain HTML,
// made when the site is built (and by the dev server as they're asked for), with their styles
// (site.css) in the page and no script, so they show at once and read the same to a crawler as
// to a person. Each "Drive here" opens the game with the place pinned on the globe: /?spot=<id>
// for a start spot, /?at=<lat>,<lon>&name=... for the others (places.js's linkedPlace reads them).

const HERE = dirname( fileURLToPath( import.meta.url ) );
const ROOT = join( HERE, '..', '..' );
const PUBLIC = join( ROOT, 'drive', 'public' );
export const SITE = 'https://worlddrive.app';
const NAME = 'World Drive';
// The shared picture links unfurl with (scripts/drive-site-images.mjs draws it and each place's).
const CARD = '/og/world-drive.png';
const CARD_SIZE = [ 1200, 630 ];
// The files each page is made from, for its date in the sitemap (see lastChanged).
const SOURCES = {
	home: [ 'drive/index.html', 'drive/site/places.js' ],
	places: [ 'drive/site/places.js', 'drive/site/build.js', 'drive/site/site.css' ],
};

// Each place with where it is ({ lat, lon }, a start spot's from SPOTS), its page's path and its
// "Drive here" link.
export function sitePlaces() {

	return PLACES.map( place => {

		const spot = place.spot ? SPOTS.find( s => s.id === place.spot ) : null;
		if ( place.spot && ! spot ) throw new Error( `World Drive's page for ${ place.slug } names a start spot that isn't one: ${ place.spot }` );
		const at = spot ? { lat: spot.lat, lon: spot.lon } : place.at;
		return { ...place, ...at, path: `/drive/${ place.slug }/`, play: playLink( place ) };

	} );

}

// The game's address with this place pinned (see linkedPlace in src/drive-app/places.js).
export function playLink( place ) {

	if ( place.spot ) return `/?spot=${ encodeURIComponent( place.spot ) }`;
	const { lat, lon, heading } = place.at;
	const params = new URLSearchParams( { at: `${ lat },${ lon }`, name: place.name, region: place.region } );
	if ( Number.isFinite( heading ) ) params.set( 'heading', String( heading ) );
	return `/?${ params }`;

}

// Every page the build makes here, as { path (the address), file (where it goes in dist-drive/),
// html }, and the sitemap. `when` is each page's date, from git (see lastChanged).
export function sitePages( { when = lastChanged } = {} ) {

	const places = sitePlaces();
	const pages = [
		{ path: '/drive/', file: 'drive/index.html', html: hubPage( places ) },
		...places.map( place => ( { path: place.path, file: `drive/${ place.slug }/index.html`, html: placePage( place, places ) } ) ),
	];
	const homeDate = when( SOURCES.home );
	const placesDate = when( SOURCES.places );
	const sitemap = sitemapXml( [ { path: '/', date: homeDate }, ...pages.map( page => ( { path: page.path, date: placesDate } ) ) ] );
	return { pages, sitemap };

}

// The home page's list of places (in its static content: drive/index.html). Each links to its
// page, and says where its Drive here goes (data-play), so a tap in the game flies the globe there
// rather than leaving the visit (main.js).
export function placesList() {

	return sitePlaces().map( place => `<li><a href="${ place.path }" data-play="${ esc( place.play ) }">${ esc( place.name ) }</a></li>` ).join( '' );

}

// A Vite plugin (vite.drive.config.js): the places' pages, /drive/ and /sitemap.xml in the build
// and from the dev server, and the home page's list of places.
export function driveSite() {

	return {
		name: 'world-drive-site',
		transformIndexHtml( html ) {

			if ( ! html.includes( '<!-- places -->' ) ) throw new Error( 'drive/index.html has lost its <!-- places --> list' );
			return html.replace( '<!-- places -->', placesList() );

		},
		configureServer( server ) {

			server.middlewares.use( ( req, res, next ) => {

				const url = new URL( req.url ?? '/', 'http://localhost' );
				if ( url.pathname !== '/sitemap.xml' && ! url.pathname.startsWith( '/drive' ) ) return next();
				// Made afresh each time, so an edit to places.js shows on a reload.
				const { pages, sitemap } = sitePages( { when: () => today() } );
				if ( url.pathname === '/sitemap.xml' ) return send( res, 'application/xml; charset=utf-8', sitemap );
				const page = pages.find( p => p.path === url.pathname );
				if ( page ) return send( res, 'text/html; charset=utf-8', page.html );
				// As Cloudflare's assets do: the address without its slash is sent on to it.
				if ( pages.some( p => p.path === `${ url.pathname }/` ) ) {

					res.statusCode = 307;
					res.setHeader( 'Location', `${ url.pathname }/${ url.search }` );
					return res.end();

				}

				next();

			} );

		},
		generateBundle() {

			const { pages, sitemap } = sitePages();
			for ( const page of pages ) this.emitFile( { type: 'asset', fileName: page.file, source: page.html } );
			this.emitFile( { type: 'asset', fileName: 'sitemap.xml', source: sitemap } );

		},
	};

}

function send( res, type, text ) {

	res.setHeader( 'Content-Type', type );
	res.end( text );

}

// --- the pages ---

function placePage( place, places ) {

	const others = places.filter( other => other !== place );
	const url = SITE + place.path;
	const card = existsSync( join( PUBLIC, 'og', `${ place.slug }.png` ) ) ? `/og/${ place.slug }.png` : CARD;
	const data = [
		breadcrumbs( [ [ NAME, '/' ], [ 'Places to drive', '/drive/' ], [ place.name, place.path ] ] ),
		{
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			name: place.title,
			description: place.description,
			url,
			inLanguage: 'en',
			isPartOf: { '@type': 'WebSite', name: NAME, url: `${ SITE }/` },
			primaryImageOfPage: SITE + card,
			about: {
				'@type': 'Place',
				name: place.name,
				address: place.region,
				geo: { '@type': 'GeoCoordinates', latitude: place.lat, longitude: place.lon },
			},
		},
	];

	return page( {
		title: `${ place.title } – ${ NAME }`,
		social: place.title,
		description: place.description,
		path: place.path,
		card,
		cardAlt: `${ place.name } in World Drive: drive it in 3D, free in your browser`,
		data,
		body: `
	<nav class="crumbs" aria-label="Breadcrumb"><a href="/">World Drive</a> <span aria-hidden="true">›</span> <a href="/drive/">Places to drive</a> <span aria-hidden="true">›</span> <span aria-current="page">${ esc( place.name ) }</span></nav>
	<section class="hero">
		<p class="region">${ esc( place.region ) }</p>
		<h1>${ esc( place.title ) }</h1>
		<p class="lede">${ esc( place.description ) }</p>
		<p><a class="go" href="${ esc( place.play ) }">Drive here</a></p>
		<p class="note">Opens World Drive with ${ esc( place.called ?? place.name ) } pinned on the globe: pick your ride and press <b>Drive here</b> to drop in. Free, in your browser, with nothing to download.</p>
	</section>
	<section>
		<h2>About ${ esc( place.called ?? place.name ) }</h2>
		${ place.about.map( text => `<p>${ esc( text ) }</p>` ).join( '\n\t\t' ) }
	</section>
	<section>
		<h2>What to do there</h2>
		<ul>
			${ place.todo.map( text => `<li>${ esc( text ) }</li>` ).join( '\n\t\t\t' ) }
		</ul>
		${ place.open ? '<p class="note">Out here it\'s mostly open country: the land, the road and the view, with few buildings.</p>' : '' }
	</section>
	${ howToPlay() }
	<section>
		<h2>More places to drive</h2>
		<ul class="places">
			${ others.map( other => `<li><a href="${ other.path }">${ esc( other.name ) }<span>${ esc( other.region ) }</span></a></li>` ).join( '\n\t\t\t' ) }
		</ul>
		<p>Or anywhere else: search for any city, landmark or address on the globe, type coordinates, or tap the globe to drop a pin.</p>
	</section>`,
	} );

}

function hubPage( places ) {

	const title = 'Places to Drive in 3D';
	const description = 'Famous roads, bridges and cities to drive in World Drive, the free 3D driving game: the Golden Gate Bridge, Times Square, Monaco, Shibuya and more.';
	const data = [
		breadcrumbs( [ [ NAME, '/' ], [ 'Places to drive', '/drive/' ] ] ),
		{
			'@context': 'https://schema.org',
			'@type': 'CollectionPage',
			name: title,
			description,
			url: `${ SITE }/drive/`,
			inLanguage: 'en',
			isPartOf: { '@type': 'WebSite', name: NAME, url: `${ SITE }/` },
			mainEntity: {
				'@type': 'ItemList',
				itemListElement: places.map( ( place, i ) => ( { '@type': 'ListItem', position: i + 1, url: SITE + place.path, name: place.name } ) ),
			},
		},
	];

	return page( {
		title: `${ title } – ${ NAME }`,
		social: title,
		description,
		path: '/drive/',
		card: CARD,
		cardAlt: 'World Drive: pick anywhere on Earth, drop in and drive it in 3D',
		data,
		body: `
	<nav class="crumbs" aria-label="Breadcrumb"><a href="/">World Drive</a> <span aria-hidden="true">›</span> <span aria-current="page">Places to drive</span></nav>
	<section class="hero">
		<h1>Places to drive</h1>
		<p class="lede">World Drive drops you into Google's photorealistic 3D map of the real world, anywhere on Earth. These are a few places to start: each opens the game with the place pinned on the globe.</p>
		<p><a class="go" href="/">Play World Drive</a></p>
	</section>
	<ul class="cards">
		${ places.map( place => `<li>
			<h2><a href="${ place.path }">${ esc( place.name ) }</a></h2>
			<p class="region">${ esc( place.region ) }</p>
			<p>${ esc( place.description ) }</p>
			<p><a class="small-go" href="${ esc( place.play ) }">Drive here</a></p>
		</li>` ).join( '\n\t\t' ) }
	</ul>
	<p>Or anywhere else: search for any city, landmark or address on the globe, type coordinates, or tap the globe to drop a pin.</p>
	${ howToPlay() }`,
	} );

}

function howToPlay() {

	return `<section>
		<h2>How to play</h2>
		<p>World Drive is a free arcade driving game in your browser. Pick a ride (a pickup, a go-kart or a muscle car to start, and six more cars as you level up), drop in and drive: hit a wall and you bounce off it into the air, so spin, flip and roll and land on your wheels to score. Boost into overdrive, drift for a mini-turbo, fly over the rooftops, and drive with friends with a party link. Driving earns XP for 50 levels of cars, paint, boost trails and titles. And you can switch the globe to the Moon and drive that, in low gravity.</p>
		<p class="keys"><kbd>W</kbd> <kbd>S</kbd> gas and brake · <kbd>A</kbd> <kbd>D</kbd> steer · <kbd>Space</kbd> drift · <kbd>Shift</kbd> boost · <kbd>F</kbd> fly · <kbd>R</kbd> back on the road · <kbd>M</kbd> back to the globe. On a phone or a tablet, buttons on the screen.</p>
	</section>`;

}

// The page round `body`: the head every page has (title, description, canonical address, the
// pictures links unfurl with, icons, structured data) and the header and footer.
function page( { title, social, description, path, card, cardAlt, data, body } ) {

	const url = SITE + path;
	const css = readFileSync( join( HERE, 'site.css' ), 'utf8' );
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>${ esc( title ) }</title>
	<meta name="description" content="${ esc( description ) }" />
	<link rel="canonical" href="${ url }" />
	<meta name="theme-color" content="#070c16" />
	<meta property="og:site_name" content="${ NAME }" />
	<meta property="og:type" content="website" />
	<meta property="og:title" content="${ esc( social ) }" />
	<meta property="og:description" content="${ esc( description ) }" />
	<meta property="og:url" content="${ url }" />
	<meta property="og:image" content="${ SITE + card }" />
	<meta property="og:image:type" content="image/png" />
	<meta property="og:image:width" content="${ CARD_SIZE[ 0 ] }" />
	<meta property="og:image:height" content="${ CARD_SIZE[ 1 ] }" />
	<meta property="og:image:alt" content="${ esc( cardAlt ) }" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="${ esc( social ) }" />
	<meta name="twitter:description" content="${ esc( description ) }" />
	<meta name="twitter:image" content="${ SITE + card }" />
	<meta name="twitter:image:alt" content="${ esc( cardAlt ) }" />
	<link rel="icon" href="/favicon.ico" sizes="48x48" />
	<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
	<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
	<link rel="manifest" href="/site.webmanifest" />
	${ data.map( item => `<script type="application/ld+json">${ json( item ) }</script>` ).join( '\n\t' ) }
	<style>
${ css }	</style>
</head>
<body>
<header class="top">
	<a class="brand" href="/">World <b>Drive</b></a>
	<a class="play" href="/">Play free</a>
</header>
<main>
${ body }
</main>
<footer>
	<p><a href="/">Play World Drive</a> · <a href="/drive/">All places to drive</a></p>
	<p>World Drive is a free arcade driving game on Google's photorealistic 3D map; it isn't made or endorsed by Google. Map data © Google and its data providers; place search © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors.</p>
</footer>
</body>
</html>
`;

}

function breadcrumbs( trail ) {

	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: trail.map( ( [ name, path ], i ) => ( { '@type': 'ListItem', position: i + 1, name, item: SITE + path } ) ),
	};

}

// A page without a date (see lastChanged) has no <lastmod>: none is better than a wrong one.
function sitemapXml( entries ) {

	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${ entries.map( ( { path, date } ) => `\t<url>\n\t\t<loc>${ esc( SITE + path ) }</loc>\n${ date ? `\t\t<lastmod>${ date }</lastmod>\n` : '' }\t</url>` ).join( '\n' ) }
</urlset>
`;

}

// The day (YYYY-MM-DD) the last commit touching `files` was made, so a page's date in the sitemap
// moves when what it says does (Google only trusts lastmod that does) and not on every build.
// Outside git, or for files never committed, today. In a shallow clone (a build server's, cloned
// with only the last commits) the oldest commit there seems to add every file, so every page would
// get that commit's date, moving on every deploy: null instead, and the sitemap gives no date.
export function lastChanged( files ) {

	try {

		const shallow = execFileSync( 'git', [ 'rev-parse', '--is-shallow-repository' ], { cwd: ROOT, encoding: 'utf8', stdio: [ 'ignore', 'pipe', 'ignore' ] } ).trim();
		if ( shallow === 'true' ) return null;
		const date = execFileSync( 'git', [ 'log', '-1', '--format=%cs', '--', ...files ], { cwd: ROOT, encoding: 'utf8', stdio: [ 'ignore', 'pipe', 'ignore' ] } ).trim();
		if ( /^\d{4}-\d\d-\d\d$/.test( date ) ) return date;

	} catch {

		// No git here (a copy of the site's files): today will do.

	}

	return today();

}

function today() {

	return new Date().toISOString().slice( 0, 10 );

}

export function esc( text ) {

	return String( text ).replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' ).replace( /"/g, '&quot;' );

}

// JSON for a <script> in the page: nothing in it can end the script early.
function json( value ) {

	return JSON.stringify( value ).replace( /</g, '\\u003c' );

}
