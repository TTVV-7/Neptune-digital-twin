import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPOTS } from '../../src/drive-app/places.js';
import { SPOTS_ON } from '../../src/drive-app/world-places.js';
import { OFF_EARTH, onWorld, OnWorld, TheWorld, WORLDS } from '../../src/drive-app/worlds.js';
import { MARS_SITE } from './mars.js';
import { MOON_SITE } from './moon.js';
import { PLACES } from './places.js';

// World Drive's pages for search engines and links (docs/world-drive.md, "Search engines"): a page
// for each place in places.js at /drive/<slug>/, a page listing them at /drive/, and for each world
// made in the page (worlds.js's OFF_EARTH: the Moon, Mars) its own page at /<world>/ with one for
// each of its start spots at /<world>/<slug>/ (its words in drive/site/<world>.js: moon.js,
// mars.js); the lists on the home page (drive/index.html's <!-- places --> and <!-- <world> places
// -->, <!-- moon places --> and <!-- mars places -->, become them) and /sitemap.xml. They're plain
// HTML, made when the site is built (and by the dev server as they're asked for), with their styles
// (site.css) in the page and no script, so they show at once and read the same to a crawler as to a
// person. Each "Drive here" opens the game with the place pinned on the globe: /?spot=<id> for a
// start spot (another world's spot's id, "moon-<name>" or "mars-<name>", turns the globe to that
// world), /?at=<lat>,<lon>&name=... for the others (places.js's linkedPlace reads them).
//
// A world's pages live beside the files the game fetches from /<world>/ (height.bin and
// colour.webp, from drive/public/<world>/): the build puts <world>/index.html and
// <world>/<slug>/index.html next to them, and the dev server makes the pages and passes every other
// /<world>/ request on to them.

const HERE = dirname( fileURLToPath( import.meta.url ) );
const ROOT = join( HERE, '..', '..' );
const PUBLIC = join( ROOT, 'drive', 'public' );
export const SITE = 'https://worlddrive.app';
const NAME = 'World Drive';
// The shared picture links unfurl with (scripts/drive-site-images.mjs draws it, each place's, and
// each other world's from World Drive itself: og/<world>.png and og/<world>-<slug>.png).
const CARD = '/og/world-drive.png';
const CARD_SIZE = [ 1200, 630 ];
// Each world made in the page's words (drive/site/<world>.js): its places' pages (each with its
// start spot, by `spot`), what they share about how it's made and driving there, its own page's
// words, and its credit.
export const WORLD_SITES = { moon: MOON_SITE, mars: MARS_SITE };
for ( const id of OFF_EARTH ) if ( ! WORLD_SITES[ id ] ) throw new Error( `World Drive's site has no pages for ${ id }: drive/site/${ id }.js` );
// The files each page is made from, for its date in the sitemap (see lastChanged): a world's pages
// from its words, its places and the look; the Earth's places' pages from the other worlds' words
// too (each lists them, with their lines).
const SOURCES = {
	home: [ 'drive/index.html', 'drive/site/places.js', ...OFF_EARTH.map( id => `drive/site/${ id }.js` ) ],
	places: [ 'drive/site/places.js', 'drive/site/build.js', 'drive/site/site.css', ...OFF_EARTH.map( id => `drive/site/${ id }.js` ) ],
	world: id => [ `drive/site/${ id }.js`, 'drive/site/build.js', 'drive/site/site.css', `src/drive-app/${ id }-places.js` ],
};
// The footer's credit for the Earth's map and search (each other world's is its own: its `credit`).
const EARTH_CREDIT = 'World Drive is a free arcade driving game on Google\'s photorealistic 3D map; it isn\'t made or endorsed by Google. Map data © Google and its data providers; place search © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors.';

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

// Each of a world's pages with its start spot's place ({ lat, lon }, as the world's coordinates
// have them: north and east positive), its page's path and its "Drive here" link, which turns the
// globe to that world.
export function worldPlaces( id ) {

	const { name } = WORLDS[ id ];
	return WORLD_SITES[ id ].pages.map( place => {

		const spot = SPOTS_ON[ id ].find( s => s.id === place.spot );
		if ( ! spot ) throw new Error( `World Drive's ${ name } page for ${ place.slug } names a ${ name } start spot that isn't one: ${ place.spot }` );
		return { ...place, lat: spot.lat, lon: spot.lon, path: `/${ id }/${ place.slug }/`, play: playLink( place ) };

	} );

}

// Every page the build makes here, as { path (the address), file (where it goes in dist-drive/),
// html }, and the sitemap. `when` is each page's date, from git (see lastChanged).
export function sitePages( { when = lastChanged } = {} ) {

	const places = sitePlaces();
	const earthPages = [
		{ path: '/drive/', file: 'drive/index.html', html: hubPage( places ) },
		...places.map( place => ( { path: place.path, file: `drive/${ place.slug }/index.html`, html: placePage( place, places ) } ) ),
	];
	// Each other world's: its own page, and each of its places'.
	const worldPages = OFF_EARTH.map( id => {

		const own = worldPlaces( id );
		return [
			{ path: `/${ id }/`, file: `${ id }/index.html`, html: worldHubPage( id, own ) },
			...own.map( place => ( { path: place.path, file: `${ id }/${ place.slug }/index.html`, html: worldPage( id, place, own ) } ) ),
		];

	} );
	const homeDate = when( SOURCES.home );
	const placesDate = when( SOURCES.places );
	const sitemap = sitemapXml( [
		{ path: '/', date: homeDate },
		...earthPages.map( page => ( { path: page.path, date: placesDate } ) ),
		...OFF_EARTH.flatMap( ( id, i ) => {

			const date = when( SOURCES.world( id ) );
			return worldPages[ i ].map( page => ( { path: page.path, date } ) );

		} ),
	] );
	return { pages: [ ...earthPages, ...worldPages.flat() ], sitemap };

}

// The home page's list of places (in its static content: drive/index.html). Each links to its
// page, and says where its Drive here goes (data-play), so a tap in the game flies the globe there
// rather than leaving the visit (main.js).
export function placesList() {

	return sitePlaces().map( place => `<li><a href="${ place.path }" data-play="${ esc( place.play ) }">${ esc( place.name ) }</a></li>` ).join( '' );

}

// The same for another world's places: each links to its page, and a tap in the game turns the
// globe to that world and flies there (its data-play is that world's spot's link).
export function worldPlacesList( id ) {

	return worldPlaces( id ).map( place => `<li><a href="${ place.path }" data-play="${ esc( place.play ) }">${ esc( place.name ) }</a></li>` ).join( '' );

}

// The addresses the site's pages are at: /drive/... and each other world's, /moon/..., /mars/...
const PAGES_AT = new RegExp( `^/(${ [ 'drive', ...OFF_EARTH ].join( '|' ) })(/|$)` );

// A Vite plugin (vite.drive.config.js): the places' pages, /drive/, each other world's pages and
// /sitemap.xml in the build and from the dev server, and the home page's lists of places.
export function driveSite() {

	return {
		name: 'world-drive-site',
		transformIndexHtml( html ) {

			const lists = [ [ '<!-- places -->', placesList ], ...OFF_EARTH.map( id => [ `<!-- ${ id } places -->`, () => worldPlacesList( id ) ] ) ];
			for ( const [ list ] of lists ) if ( ! html.includes( list ) ) throw new Error( `drive/index.html has lost its ${ list } list` );
			return lists.reduce( ( text, [ list, make ] ) => text.replace( list, make() ), html );

		},
		configureServer( server ) {

			server.middlewares.use( ( req, res, next ) => {

				const url = new URL( req.url ?? '/', 'http://localhost' );
				// (Every world's, or Vite's fallback would answer /mars/ with the game's own page.)
				if ( url.pathname !== '/sitemap.xml' && ! PAGES_AT.test( url.pathname ) ) return next();
				// A file (a world's height.bin and colour.webp, which the game fetches from /moon/ and
				// /mars/) is never a page: it's passed on, to be served from drive/public/ as before.
				if ( /\.[a-z0-9]+$/i.test( url.pathname ) && url.pathname !== '/sitemap.xml' ) return next();
				// Made afresh each time, so an edit to places.js, moon.js or mars.js shows on a reload.
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
			${ OFF_EARTH.map( worldLink ).join( '\n\t\t\t' ) }
		</ul>
		<p>Or anywhere else: search for any city, landmark or address on the globe, type coordinates, or tap the globe to drop a pin.</p>
	</section>`,
	} );

}

// Another world among the Earth's places, in each one's list of the others.
function worldLink( id ) {

	return `<li><a href="/${ id }/">${ esc( TheWorld( id ) ) }<span>${ esc( WORLD_SITES[ id ].tagline ) }</span></a></li>`;

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
	<section>
		<h2>And ${ listed( OFF_EARTH.map( id => WORLDS[ id ].the ), 'and' ) }</h2>
		${ OFF_EARTH.map( id => `<p>${ WORLD_SITES[ id ].others }</p>` ).join( '\n\t\t' ) }
	</section>
	${ howToPlay() }`,
	} );

}

// A place's page on another world: as an Earth place's, under that world (The Moon, Mars), with
// where it is on it in its words (schema.org's GeoCoordinates are the Earth's, so its structured
// data has none), what World Drive's world is and isn't, and links to its other places.
function worldPage( id, place, places ) {

	const site = WORLD_SITES[ id ];
	const world = TheWorld( id );
	const on = onWorld( id );
	const others = places.filter( other => other !== place );
	const url = SITE + place.path;
	const card = existsSync( join( PUBLIC, 'og', `${ id }-${ place.slug }.png` ) ) ? `/og/${ id }-${ place.slug }.png` : CARD;
	const called = place.called ?? place.name;
	const data = [
		breadcrumbs( [ [ NAME, '/' ], [ world, `/${ id }/` ], [ place.name, place.path ] ] ),
		{
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			name: place.title,
			description: place.description,
			url,
			inLanguage: 'en',
			isPartOf: { '@type': 'WebSite', name: NAME, url: `${ SITE }/` },
			primaryImageOfPage: SITE + card,
			about: { '@type': 'Place', name: place.name, containedInPlace: { '@type': 'Place', name: world } },
		},
	];

	return page( {
		title: `${ place.title } – ${ NAME }`,
		social: place.title,
		description: place.description,
		path: place.path,
		card,
		cardAlt: `${ place.name } ${ on } in World Drive: drive it in 3D, free in your browser`,
		data,
		credit: site.credit,
		body: `
	<nav class="crumbs" aria-label="Breadcrumb"><a href="/">World Drive</a> <span aria-hidden="true">›</span> <a href="/${ id }/">${ esc( world ) }</a> <span aria-hidden="true">›</span> <span aria-current="page">${ esc( place.name ) }</span></nav>
	<section class="hero">
		<p class="region">${ esc( world ) } · ${ esc( place.region ) }</p>
		<h1>${ esc( place.title ) }</h1>
		<p class="lede">${ esc( place.description ) }</p>
		<p><a class="go" href="${ esc( place.play ) }">Drive here</a></p>
		<p class="note">Opens World Drive ${ on } with ${ esc( called ) } pinned on the globe: pick your ride and press <b>Drive here</b> to drop in. Free, in your browser, with nothing to download.</p>
	</section>
	<section>
		<h2>About ${ esc( called ) }</h2>
		${ place.about.map( text => `<p>${ esc( text ) }</p>` ).join( '\n\t\t' ) }
		<p class="note">${ OnWorld( id ) } at ${ latLon( place ) } (${ esc( site.coordinates ) }).</p>
	</section>
	<section>
		<h2>What to do there</h2>
		<ul>
			${ place.todo.map( text => `<li>${ esc( text ) }</li>` ).join( '\n\t\t\t' ) }
		</ul>
	</section>
	<section>
		<h2>${ esc( world ) } in World Drive</h2>
		<ul>
			${ site.driving.map( text => `<li>${ text }</li>` ).join( '\n\t\t\t' ) }
		</ul>
		${ site.made.map( text => `<p>${ esc( text ) }</p>` ).join( '\n\t\t' ) }
		${ place.game ? `<p>${ esc( place.game ) }</p>` : '' }
	</section>
	${ howToPlay() }
	<section>
		<h2>More places to drive ${ on }</h2>
		<ul class="places">
			${ others.map( other => `<li><a href="${ other.path }">${ esc( other.name ) }<span>${ esc( other.region ) }</span></a></li>` ).join( '\n\t\t\t' ) }
		</ul>
		<p>Or anywhere else ${ on }: ${ esc( site.search ) }, type coordinates, or tap the globe to drop a pin. <a href="/${ id }/">All about driving ${ on }</a> · <a href="/drive/">Places to drive on the Earth</a></p>
	</section>`,
	} );

}

// Another world's own page: what driving it in World Drive is, how World Drive's is made, and its
// places. Its driving list (`driving`) is trusted HTML, as on its places' pages.
function worldHubPage( id, places ) {

	const site = WORLD_SITES[ id ];
	const world = TheWorld( id );
	const on = onWorld( id );
	const { title, description } = site;
	const card = existsSync( join( PUBLIC, 'og', `${ id }.png` ) ) ? `/og/${ id }.png` : CARD;
	// Its Drive on <world> pins the first of them (the Moon's Tranquility Base, Mars's Olympus Mons).
	const first = places[ 0 ];
	const data = [
		breadcrumbs( [ [ NAME, '/' ], [ world, `/${ id }/` ] ] ),
		{
			'@context': 'https://schema.org',
			'@type': 'CollectionPage',
			name: title,
			description,
			url: `${ SITE }/${ id }/`,
			inLanguage: 'en',
			isPartOf: { '@type': 'WebSite', name: NAME, url: `${ SITE }/` },
			primaryImageOfPage: SITE + card,
			about: { '@type': 'Place', name: world },
			mainEntity: {
				'@type': 'ItemList',
				itemListElement: places.map( ( place, i ) => ( { '@type': 'ListItem', position: i + 1, url: SITE + place.path, name: place.name } ) ),
			},
		},
	];

	return page( {
		title: `${ title } – ${ NAME }`,
		social: site.social,
		description,
		path: `/${ id }/`,
		card,
		cardAlt: site.cardAlt,
		data,
		credit: site.credit,
		body: `
	<nav class="crumbs" aria-label="Breadcrumb"><a href="/">World Drive</a> <span aria-hidden="true">›</span> <span aria-current="page">${ esc( world ) }</span></nav>
	<section class="hero">
		<h1>Drive ${ on }</h1>
		<p class="lede">${ esc( site.lede ) }</p>
		<p><a class="go" href="${ esc( first.play ) }">Drive ${ on }</a></p>
		<p class="note">Opens World Drive ${ on } with ${ esc( first.called ?? first.name ) }, ${ esc( site.first ) }, pinned on the globe: press <b>Drive here</b> to drop in there, or pick anywhere else. Free, in your browser, with nothing to download.</p>
	</section>
	<section>
		<h2>The real ${ esc( WORLDS[ id ].name ) }, from NASA's maps</h2>
		${ site.made.map( text => `<p>${ esc( text ) }</p>` ).join( '\n\t\t' ) }
		<p>${ esc( site.data ) }</p>
	</section>
	<section>
		<h2>Driving there</h2>
		<ul>
			${ site.driving.map( text => `<li>${ text }</li>` ).join( '\n\t\t\t' ) }
		</ul>
	</section>
	<h2>Where to drive ${ on }</h2>
	<ul class="cards">
		${ places.map( place => `<li>
			<h2><a href="${ place.path }">${ esc( place.name ) }</a></h2>
			<p class="region">${ esc( place.region ) }</p>
			<p>${ esc( place.description ) }</p>
			<p><a class="small-go" href="${ esc( place.play ) }">Drive here</a></p>
		</li>` ).join( '\n\t\t' ) }
	</ul>
	<p>Or anywhere else ${ on }: ${ esc( site.search ) }, type coordinates, or tap the globe to drop a pin.</p>
	${ howToPlay() }
	<section>
		<h2>${ esc( site.elsewhere.heading ) }</h2>
		<p>${ site.elsewhere.html }</p>
	</section>`,
	} );

}

// "43.31° S, 11.36° W": a place on another world, as its pages say it.
function latLon( { lat, lon } ) {

	return `${ Math.abs( lat ).toFixed( 2 ) }° ${ lat < 0 ? 'S' : 'N' }, ${ Math.abs( lon ).toFixed( 2 ) }° ${ lon < 0 ? 'W' : 'E' }`;

}

function howToPlay() {

	return `<section>
		<h2>How to play</h2>
		<p>World Drive is a free arcade driving game in your browser. Pick a ride (a pickup, a go-kart or a muscle car to start, and six more cars as you level up), drop in and drive: hit a wall and you bounce off it into the air, so spin, flip and roll and land on your wheels to score. Boost into overdrive, drift for a mini-turbo, fly over the rooftops, and drive with friends with a party link. Driving earns XP for 50 levels of cars, paint, boost trails and titles. And you can switch the globe to ${ listed( OFF_EARTH.map( id => WORLDS[ id ].the ), 'or' ) } and drive that, in low gravity.</p>
		<p class="keys"><kbd>W</kbd> <kbd>S</kbd> gas and brake · <kbd>A</kbd> <kbd>D</kbd> steer · <kbd>Space</kbd> drift · <kbd>Shift</kbd> boost · <kbd>F</kbd> fly · <kbd>R</kbd> back on the road · <kbd>M</kbd> back to the globe. On a phone or a tablet, buttons on the screen.</p>
	</section>`;

}

// The page round `body`: the head every page has (title, description, canonical address, the
// pictures links unfurl with, icons, structured data) and the header and footer, with the credits
// for the Earth's map or, on another world's pages, that world's.
function page( { title, social, description, path, card, cardAlt, data, body, credit = EARTH_CREDIT } ) {

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
	<p><a href="/">Play World Drive</a> · <a href="/drive/">All places to drive</a> · ${ OFF_EARTH.map( id => `<a href="/${ id }/">Drive ${ onWorld( id ) }</a>` ).join( ' · ' ) }</p>
	<p>${ credit }</p>
</footer>
</body>
</html>
`;

}

// "the Moon and Mars", "the Moon or Mars" ("the Moon, Mars and Vesta" with more).
function listed( words, joiner ) {

	return words.length < 2 ? words.join( '' ) : `${ words.slice( 0, - 1 ).join( ', ' ) } ${ joiner } ${ words.at( - 1 ) }`;

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
