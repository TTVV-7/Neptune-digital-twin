// npm run test:drive-seo: World Drive as search engines and link previews see it (docs/world-drive.md,
// "Search engines"). It builds the site (npm run build:drive, into dist-drive/; TEST_SEO_DIST=<folder>
// checks one already built there instead) and serves it as Cloudflare's assets do (drive-static.mjs).
// Every public page's title, description, canonical address, Open Graph and Twitter tags and
// structured data (valid JSON with what Google asks for, and no ratings made up), the Moon's pages
// among them (with no Earth coordinates); the owner's private page (admin.html) kept out of search
// (noindex) and out of the sitemap; the sitemap listing every public page and only real addresses,
// with dates; robots.txt; the icons and the manifest; every link within the site answering, and the
// Moon's data files still served beside its pages; the home page's words for a crawler, in the page
// itself and shown on the globe's panel, a tap on an Earth place there flying the globe to it and on
// a Moon place turning it to the Moon; each place's "Drive here" opening the game on the test globe
// with its pin there (the address tidied after, a ?party= kept, a link's rude name or bad place
// refused), and a drop-in from it; a Moon page's opening the game on the Moon with its spot pinned;
// the dev server making the same pages and passing the Moon's files on; and the load on a phone's
// connection: what World Drive is shows at once, before the game's code, and counts as the page's
// largest paint. Every request off this machine is blocked.
//
// Needs Playwright with Chromium, as test-drive-ui.mjs does. TEST_VITE_PORT picks the ports (it and
// the next one); TEST_SCREENSHOTS=<folder> saves pictures.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { measureLoad, serveDist } from './drive-static.mjs';
import { startVite } from './worker-harness.mjs';
import { MOON_PAGES } from '../drive/site/moon.js';
import { PLACES } from '../drive/site/places.js';
import { sitePages } from '../drive/site/build.js';
import { MOON_SPOTS } from '../src/drive-app/moon-places.js';
import { linkedPlace, SPOTS } from '../src/drive-app/places.js';

const require = createRequire( import.meta.url );
const ROOT = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5531;
const SHOTS = process.env.TEST_SCREENSHOTS;
const DIST = process.env.TEST_SEO_DIST || join( ROOT, 'dist-drive' );
const SITE = 'https://worlddrive.app';
// Fewer words than this and the home page says too little for a search engine to know what it is.
const HOME_WORDS = 350;
// Each link card is fetched by every chat a link is posted in: no bigger than this (bytes).
const CARD_BYTES = 250000;
// The Moon's data files the game fetches, beside its pages under /moon/, and their sizes (bytes).
const MOON_FILES = { '/moon/height.bin': 2073600, '/moon/colour.webp': 674590 };

let chromium;
let browser;
let server;
// The public pages (each { path, html }), and those marked noindex (the owner's admin.html), which
// are in the build but not for search engines.
let pages;
let hidden;

before( async () => {

	try {

		( { chromium } = require( 'playwright' ) );

	} catch {

		throw new Error( 'Playwright is needed: npm i -D playwright && npx playwright install chromium' );

	}

	if ( SHOTS ) mkdirSync( SHOTS, { recursive: true } );
	if ( ! process.env.TEST_SEO_DIST ) {

		// Never a Maps key in the build (it would fail anyway): blank every name it's read from.
		const noKey = Object.fromEntries( [ 'GOOGLE_API', 'google_api', 'GOOGLE_MAPS_API_KEY', 'VITE_GOOGLE_MAPS_API_KEY', 'GOOGLE_MAPS_KEY', 'GOOGLE_MAPS_API' ].map( name => [ name, '' ] ) );
		const vite = join( dirname( require.resolve( 'vite/package.json' ) ), 'bin', 'vite.js' );
		const built = spawnSync( process.execPath, [ vite, 'build', '--config', 'vite.drive.config.js', '--logLevel', 'error' ], { cwd: ROOT, env: { ...process.env, ...noKey }, encoding: 'utf8' } );
		assert.equal( built.status, 0, `npm run build:drive failed:\n${ built.stdout }\n${ built.stderr }` );

	}

	const built = htmlPages( DIST );
	pages = built.filter( page => ! noindex( page.html ) );
	hidden = built.filter( page => noindex( page.html ) );
	server = await serveDist( DIST, PORT );
	browser = await chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader' ] } );

} );

after( async () => {

	await browser?.close();
	await server?.stop();

} );

// Every page in the build: { path (its address), html }.
function htmlPages( dir ) {

	const found = [];
	const walk = folder => {

		for ( const name of readdirSync( folder ) ) {

			const file = join( folder, name );
			if ( statSync( file ).isDirectory() ) walk( file );
			else if ( name.endsWith( '.html' ) ) found.push( { path: `/${ relative( dir, file ).replace( /index\.html$/, '' ) }`, html: readFileSync( file, 'utf8' ) } );

		}

	};

	walk( dir );
	return found;

}

// A page that asks search engines to leave it out (as the owner's play stats page does).
function noindex( html ) {

	return /<meta\s+name="robots"\s+content="[^"]*noindex/i.test( html );

}

const decode = text => text.replace( /&quot;/g, '"' ).replace( /&#39;/g, '\'' ).replace( /&lt;/g, '<' ).replace( /&gt;/g, '>' ).replace( /&amp;/g, '&' );

function metaOf( html, key ) {

	const tag = html.match( new RegExp( `<meta\\s+(?:name|property)="${ key.replace( /[:.]/g, '\\$&' ) }"\\s+content="([^"]*)"`, 'i' ) );
	return tag ? decode( tag[ 1 ] ) : null;

}

const titleOf = html => decode( html.match( /<title>([^<]*)<\/title>/ )?.[ 1 ] ?? '' );
const canonicalOf = html => html.match( /<link rel="canonical" href="([^"]+)"/ )?.[ 1 ] ?? null;
const jsonLd = html => [ ...html.matchAll( /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g ) ].map( match => JSON.parse( match[ 1 ] ) );
const linksOf = html => [ ...html.matchAll( /<a\s[^>]*href="([^"]+)"/g ) ].map( match => decode( match[ 1 ] ) );
// The words a crawler reads without running the page: no scripts, styles, comments or tags.
const wordsOf = html => html.replace( /<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, ' ' ).replace( /<[^>]+>/g, ' ' ).split( /\s+/ ).filter( word => /\p{L}/u.test( word ) );

function pngSize( file ) {

	const bytes = readFileSync( file );
	assert.equal( bytes.toString( 'latin1', 1, 4 ), 'PNG', `${ file } isn't a PNG` );
	return [ bytes.readUInt32BE( 16 ), bytes.readUInt32BE( 20 ) ];

}

// The file in the build an address of the site is, or null.
function builtFile( path ) {

	const file = join( DIST, decodeURIComponent( path.split( /[?#]/ )[ 0 ] ) );
	if ( path.split( /[?#]/ )[ 0 ].endsWith( '/' ) ) return existsSync( join( file, 'index.html' ) ) ? join( file, 'index.html' ) : null;
	return existsSync( file ) && statSync( file ).isFile() ? file : null;

}

describe( 'what search engines read', () => {

	test( 'the pages: the home page, the list of places, one page for each place, and the Moon\'s, each at a clean address', () => {

		const paths = pages.map( page => page.path ).sort();
		const expected = [ '/', '/drive/', ...PLACES.map( place => `/drive/${ place.slug }/` ), '/moon/', ...MOON_PAGES.map( place => `/moon/${ place.slug }/` ) ].sort();
		assert.deepEqual( paths, expected );
		for ( const place of [ ...PLACES, ...MOON_PAGES ] ) assert.match( place.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${ place.slug } isn't a clean address` );
		// One for each start spot, the Earth's and the Moon's, and those exist.
		for ( const spot of SPOTS ) assert.ok( PLACES.some( place => place.spot === spot.id ), `no page for the start spot ${ spot.id }` );
		for ( const spot of MOON_SPOTS ) assert.ok( MOON_PAGES.some( place => place.spot === spot.id ), `no page for the Moon's start spot ${ spot.id }` );

	} );

	test( 'the owner\'s play stats page (admin.html) is in the build but kept out of search: noindex, nofollow', () => {

		const admin = hidden.find( page => page.path === '/admin.html' );
		assert.ok( admin, 'no /admin.html in the build' );
		for ( const { path, html } of hidden ) assert.equal( metaOf( html, 'robots' ), 'noindex, nofollow', path );
		// (The sitemap leaves it out: see below.)

	} );

	test( 'each has its own title, description and canonical address, and the tags a link unfurls with', () => {

		const titles = new Set();
		const descriptions = new Set();
		for ( const { path, html } of pages ) {

			const title = titleOf( html );
			assert.ok( title.length >= 20 && title.length <= 80, `${ path }: title "${ title }" (${ title.length })` );
			assert.match( title, /World Drive/, `${ path }: the title doesn't name World Drive` );
			assert.ok( ! titles.has( title ), `${ path }: the same title as another page` );
			titles.add( title );
			const description = metaOf( html, 'description' );
			assert.ok( description && description.length >= 100 && description.length <= 170, `${ path }: description "${ description }" (${ description?.length })` );
			assert.ok( ! descriptions.has( description ), `${ path }: the same description as another page` );
			descriptions.add( description );
			assert.match( html, /<html lang="en">/ );
			assert.match( html, /<meta name="viewport" content="width=device-width, initial-scale=1/ );

			const url = SITE + path;
			assert.equal( canonicalOf( html ), url, `${ path }: canonical` );
			assert.equal( metaOf( html, 'og:url' ), url, `${ path }: og:url` );
			assert.equal( metaOf( html, 'og:site_name' ), 'World Drive' );
			assert.equal( metaOf( html, 'og:type' ), 'website' );
			assert.ok( metaOf( html, 'og:title' )?.length > 10, `${ path }: og:title` );
			assert.ok( metaOf( html, 'og:description' )?.length > 50, `${ path }: og:description` );
			assert.equal( metaOf( html, 'twitter:card' ), 'summary_large_image' );
			assert.equal( metaOf( html, 'twitter:title' ), metaOf( html, 'og:title' ) );
			const image = metaOf( html, 'og:image' );
			assert.equal( metaOf( html, 'twitter:image' ), image );
			assert.ok( image.startsWith( `${ SITE }/og/` ), `${ path }: og:image ${ image }` );
			const file = builtFile( image.slice( SITE.length ) );
			assert.ok( file, `${ path }: ${ image } isn't in the build` );
			assert.deepEqual( pngSize( file ), [ 1200, 630 ], `${ path }: ${ image } isn't 1200 × 630` );
			assert.ok( statSync( file ).size < CARD_BYTES, `${ path }: ${ image } is ${ statSync( file ).size } bytes` );
			assert.equal( metaOf( html, 'og:image:width' ), '1200' );
			assert.equal( metaOf( html, 'og:image:height' ), '630' );
			assert.ok( metaOf( html, 'og:image:alt' )?.length > 10 );
			for ( const icon of [ '/favicon.ico', '/favicon.svg', '/apple-touch-icon.png', '/site.webmanifest' ] ) assert.ok( html.includes( `href="${ icon }"` ), `${ path }: no ${ icon }` );

		}

		// A place's own card.
		const golden = pages.find( page => page.path === '/drive/golden-gate-bridge/' ).html;
		assert.equal( metaOf( golden, 'og:image' ), `${ SITE }/og/golden-gate-bridge.png` );
		assert.equal( titleOf( golden ), 'Drive the Golden Gate Bridge in 3D – World Drive' );
		// The Moon's page and each of its places have their own, drawn from World Drive's Moon.
		const moon = pages.find( page => page.path === '/moon/' ).html;
		assert.equal( metaOf( moon, 'og:image' ), `${ SITE }/og/moon.png` );
		assert.equal( titleOf( moon ), 'Drive on the Moon in 3D, Free in Your Browser – World Drive' );
		for ( const place of MOON_PAGES ) {

			const { html } = pages.find( page => page.path === `/moon/${ place.slug }/` );
			assert.equal( metaOf( html, 'og:image' ), `${ SITE }/og/moon-${ place.slug }.png`, place.slug );
			assert.equal( titleOf( html ), `${ place.title } – World Drive` );
			assert.equal( metaOf( html, 'description' ), place.description );

		}

		// The home page's words in its head say it has the Moon too.
		const home = pages.find( page => page.path === '/' ).html;
		for ( const key of [ 'description', 'og:description', 'twitter:description' ] ) assert.match( metaOf( home, key ), /Moon/, key );

	} );

	test( 'structured data: valid JSON, what Google asks for, and no ratings made up', () => {

		const home = pages.find( page => page.path === '/' ).html;
		const data = jsonLd( home );
		const site = data.find( item => item[ '@type' ] === 'WebSite' );
		assert.equal( site?.name, 'World Drive' );
		assert.equal( site.url, `${ SITE }/` );
		const game = data.find( item => [].concat( item[ '@type' ] ).includes( 'VideoGame' ) );
		assert.ok( game, 'no VideoGame' );
		// Google only reads a game as an app co-typed with one of its app types.
		assert.ok( [].concat( game[ '@type' ] ).includes( 'WebApplication' ) );
		assert.equal( game.name, 'World Drive' );
		assert.equal( game.url, `${ SITE }/` );
		assert.equal( game.gamePlatform, 'Web browser' );
		assert.equal( game.applicationCategory, 'GameApplication' );
		assert.ok( game.genre.length > 0 );
		assert.ok( game.operatingSystem );
		assert.equal( game.offers[ '@type' ], 'Offer' );
		assert.equal( game.offers.price, '0' );
		assert.ok( game.publisher?.name );
		assert.ok( builtFile( game.publisher.logo.slice( SITE.length ) ), 'the publisher\'s logo isn\'t in the build' );
		assert.ok( builtFile( game.image.slice( SITE.length ) ) );
		assert.match( game.description, /Moon/ );

		for ( const { path, html } of pages ) {

			const items = jsonLd( html );
			assert.ok( items.length > 0, `${ path }: no structured data` );
			const text = JSON.stringify( items );
			assert.doesNotMatch( text, /aggregateRating|"review"|ratingValue/, `${ path }: a rating` );
			for ( const item of items ) assert.equal( item[ '@context' ], 'https://schema.org' );
			if ( path === '/' ) continue;
			const crumbs = items.find( item => item[ '@type' ] === 'BreadcrumbList' );
			assert.ok( crumbs, `${ path }: no breadcrumbs` );
			crumbs.itemListElement.forEach( ( crumb, i ) => {

				assert.equal( crumb.position, i + 1 );
				assert.ok( crumb.name );
				assert.ok( builtFile( crumb.item.slice( SITE.length ) ), `${ path }: crumb ${ crumb.item }` );

			} );
			assert.equal( crumbs.itemListElement.at( - 1 ).item, SITE + path );
			if ( path.startsWith( '/moon/' ) ) {

				// The Moon's: World Drive › The Moon (› the place), and no coordinates of schema.org's,
				// which are the Earth's (the page says where it is on the Moon in its words).
				assert.deepEqual( crumbs.itemListElement.slice( 0, 2 ).map( crumb => [ crumb.name, crumb.item ] ), [ [ 'World Drive', `${ SITE }/` ], [ 'The Moon', `${ SITE }/moon/` ] ], path );
				assert.doesNotMatch( text, /GeoCoordinates|"geo"|latitude|longitude/, `${ path }: the Earth's coordinates on the Moon` );

			}

			const place = PLACES.find( p => `/drive/${ p.slug }/` === path );
			const moonPlace = MOON_PAGES.find( p => `/moon/${ p.slug }/` === path );
			if ( ! place && ! moonPlace ) continue;
			const page = items.find( item => item[ '@type' ] === 'WebPage' );
			assert.equal( page.url, SITE + path );
			assert.equal( crumbs.itemListElement.length, 3 );
			if ( moonPlace ) {

				assert.equal( page.about.name, moonPlace.name );
				assert.equal( page.about.containedInPlace.name, 'The Moon' );
				continue;

			}

			assert.equal( page.about.name, place.name );
			assert.ok( Number.isFinite( page.about.geo.latitude ) && Number.isFinite( page.about.geo.longitude ) );

		}

	} );

	test( 'each place\'s page: one heading, its own words, a Drive here link to its place, and links to the others', () => {

		const texts = new Set();
		for ( const place of PLACES ) {

			const { html } = pages.find( page => page.path === `/drive/${ place.slug }/` );
			assert.equal( html.match( /<h1[\s>]/g )?.length, 1, `${ place.slug }: one h1` );
			for ( const paragraph of place.about ) {

				assert.ok( ! texts.has( paragraph ), `${ place.slug }: a paragraph from another page` );
				texts.add( paragraph );

			}

			assert.ok( wordsOf( html ).length > 300, `${ place.slug }: only ${ wordsOf( html ).length } words` );
			const go = html.match( /<a class="go" href="([^"]+)"/ );
			assert.ok( go, `${ place.slug }: no Drive here` );
			const linked = linkedPlace( new URL( decode( go[ 1 ] ), SITE ).search );
			assert.equal( linked?.name, place.spot ? SPOTS.find( s => s.id === place.spot ).name : place.name, `${ place.slug }: Drive here pins ${ linked?.name }` );
			if ( place.at ) assert.deepEqual( [ linked.lat, linked.lon ], [ place.at.lat, place.at.lon ] );
			const links = linksOf( html );
			for ( const other of PLACES ) if ( other !== place ) assert.ok( links.includes( `/drive/${ other.slug }/` ), `${ place.slug } doesn't link to ${ other.slug }` );
			assert.ok( links.includes( '/' ) && links.includes( '/drive/' ) );
			// And to the Moon, among the other places.
			assert.match( html, /<ul class="places">[\s\S]*<li><a href="\/moon\/">The Moon<span>/, `${ place.slug }: no Moon among the other places` );

		}

		// The list of them all says the Moon is there too.
		assert.ok( linksOf( pages.find( page => page.path === '/drive/' ).html ).includes( '/moon/' ), '/drive/ doesn\'t link to the Moon' );

	} );

	test( 'the Moon\'s pages: one heading, their own words, where on the Moon, a Drive here to its spot there, and links to the others', () => {

		// Nothing shared with another place's page, the Earth's included.
		const texts = new Set( PLACES.flatMap( place => place.about ) );
		for ( const place of MOON_PAGES ) {

			const { html } = pages.find( page => page.path === `/moon/${ place.slug }/` );
			assert.equal( html.match( /<h1[\s>]/g )?.length, 1, `${ place.slug }: one h1` );
			for ( const paragraph of [ ...place.about, ...place.game ? [ place.game ] : [] ] ) {

				assert.ok( ! texts.has( paragraph ), `${ place.slug }: a paragraph from another page` );
				texts.add( paragraph );

			}

			assert.ok( wordsOf( html ).length > 300, `${ place.slug }: only ${ wordsOf( html ).length } words` );
			// Where it is, as selenographic latitude and longitude, from its start spot.
			const spot = MOON_SPOTS.find( s => s.id === place.spot );
			const where = `${ Math.abs( spot.lat ).toFixed( 2 ) }° ${ spot.lat < 0 ? 'S' : 'N' }, ${ Math.abs( spot.lon ).toFixed( 2 ) }° ${ spot.lon < 0 ? 'W' : 'E' }`;
			assert.ok( html.includes( `On the Moon at ${ where }` ), `${ place.slug }: doesn't say it's at ${ where }` );
			// Honest about the game: the small craters are made up, and nothing of the landers is there.
			assert.match( html, /made up/, place.slug );
			assert.match( html, /no landers, flags or rover tracks/, place.slug );
			// Its Drive here turns the game to the Moon with its spot pinned (see linkedPlace).
			const go = html.match( /<a class="go" href="([^"]+)"/ );
			assert.ok( go, `${ place.slug }: no Drive here` );
			assert.equal( decode( go[ 1 ] ), `/?spot=${ place.spot }` );
			const linked = linkedPlace( new URL( decode( go[ 1 ] ), SITE ).search );
			assert.deepEqual( [ linked?.id, linked?.world, linked?.name ], [ spot.id, 'moon', spot.name ], `${ place.slug }: Drive here pins ${ linked?.name }` );
			const links = linksOf( html );
			for ( const other of MOON_PAGES ) if ( other !== place ) assert.ok( links.includes( `/moon/${ other.slug }/` ), `${ place.slug } doesn't link to ${ other.slug }` );
			for ( const page of [ '/', '/drive/', '/moon/' ] ) assert.ok( links.includes( page ), `${ place.slug } doesn't link to ${ page }` );
			// NASA's credit, as the game gives it.
			assert.ok( links.includes( 'https://svs.gsfc.nasa.gov/4720/' ), `${ place.slug }: no credit to NASA` );

		}

		// The Moon's own page: what it is, every place, and a Drive on the Moon that opens the game there.
		const { html } = pages.find( page => page.path === '/moon/' );
		assert.equal( html.match( /<h1[\s>]/g )?.length, 1 );
		assert.ok( wordsOf( html ).length > 500, `/moon/: only ${ wordsOf( html ).length } words` );
		const text = wordsOf( html ).join( ' ' );
		for ( const phrase of [ 'LOLA', 'LROC', 'public domain', 'made up', 'a sixth of the gravity', 'two and a half times as long', 'The Earth in the sky', 'No water', 'On your own' ] ) assert.ok( text.toLowerCase().includes( phrase.toLowerCase() ), `/moon/: no "${ phrase }"` );
		const links = linksOf( html );
		for ( const place of MOON_PAGES ) {

			assert.ok( links.includes( `/moon/${ place.slug }/` ), `/moon/ doesn't link to ${ place.slug }` );
			assert.ok( links.includes( `/?spot=${ place.spot }` ), `/moon/ has no Drive here for ${ place.slug }` );

		}

		assert.ok( links.includes( '/drive/' ) && links.includes( '/' ) );
		const go = decode( html.match( /<a class="go" href="([^"]+)"/ )[ 1 ] );
		assert.equal( linkedPlace( new URL( go, SITE ).search )?.world, 'moon' );

	} );

	test( 'every link within the site answers (no redirects, no 404s)', async () => {

		const checked = new Map();
		for ( const { path, html } of pages ) {

			const hrefs = [ ...linksOf( html ), ...[ ...html.matchAll( /<link [^>]*href="([^"]+)"/g ) ].map( match => match[ 1 ] ) ];
			for ( const href of hrefs ) {

				const url = new URL( href, SITE + path );
				if ( url.origin !== SITE ) continue;
				const local = url.pathname + url.search;
				if ( ! checked.has( local ) ) {

					const res = await fetch( server.base + local, { redirect: 'manual' } );
					checked.set( local, res.status );

				}

				assert.equal( checked.get( local ), 200, `${ path } links to ${ href }: ${ checked.get( local ) }` );

			}

		}

		assert.ok( checked.size > 30, `only ${ checked.size } links` );
		// Off the site, only the credits: OpenStreetMap's copyright page, and NASA's for the Moon.
		const outside = new Set( pages.flatMap( ( { html } ) => linksOf( html ) ).filter( href => /^https?:/.test( href ) && ! href.startsWith( SITE ) ) );
		assert.deepEqual( [ ...outside ].sort(), [ 'https://svs.gsfc.nasa.gov/4720/', 'https://www.openstreetmap.org/copyright' ] );

		// The Moon's pages are beside the files the game fetches from /moon/, which are still there.
		for ( const [ path, size ] of Object.entries( MOON_FILES ) ) {

			const res = await fetch( server.base + path, { redirect: 'manual' } );
			assert.equal( res.status, 200, path );
			assert.equal( ( await res.arrayBuffer() ).byteLength, size, path );

		}

		// And an address without its slash is sent on to the page, as for the places'.
		const bare = await fetch( `${ server.base }/moon/tycho`, { redirect: 'manual' } );
		assert.deepEqual( [ bare.status, bare.headers.get( 'location' ) ], [ 307, '/moon/tycho/' ] );

	} );

	test( 'the sitemap lists every page and nothing else, with its date; robots.txt points to it and keeps crawlers off /api/', async () => {

		const res = await fetch( `${ server.base }/sitemap.xml` );
		assert.equal( res.status, 200 );
		assert.match( res.headers.get( 'content-type' ), /xml/ );
		const xml = await res.text();
		assert.match( xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/ );
		const entries = [ ...xml.matchAll( /<url>\s*<loc>([^<]+)<\/loc>\s*(?:<lastmod>([^<]+)<\/lastmod>\s*)?<\/url>/g ) ].map( match => ( { loc: match[ 1 ], lastmod: match[ 2 ] } ) );
		assert.equal( entries.length, ( xml.match( /<url>/g ) ?? [] ).length );
		assert.deepEqual( entries.map( entry => entry.loc ).sort(), pages.map( page => SITE + page.path ).sort() );
		// The Moon's pages among them; the owner's stats page (noindex) never.
		for ( const path of [ '/moon/', ...MOON_PAGES.map( place => `/moon/${ place.slug }/` ) ] ) assert.ok( entries.some( entry => entry.loc === SITE + path ), `${ path } isn't in the sitemap` );
		for ( const { path } of hidden ) assert.ok( ! xml.includes( SITE + path ), `${ path } is in the sitemap` );
		assert.doesNotMatch( xml, /admin/ );
		// Built from a shallow clone there are no dates (see lastChanged in drive/site/build.js).
		const shallow = spawnSync( 'git', [ 'rev-parse', '--is-shallow-repository' ], { cwd: ROOT, encoding: 'utf8' } ).stdout.trim() === 'true';
		for ( const { loc, lastmod } of entries ) {

			assert.doesNotMatch( loc, /[?#]/ );
			assert.ok( builtFile( loc.slice( SITE.length ) ), `${ loc } isn't a page` );
			if ( shallow && ! process.env.TEST_SEO_DIST ) {

				assert.equal( lastmod, undefined, `${ loc }: a date from a shallow clone` );
				continue;

			}

			assert.match( lastmod ?? '', /^\d{4}-\d\d-\d\d$/, `${ loc }: no date` );
			assert.ok( new Date( lastmod ) <= new Date( Date.now() + 86400000 ) && new Date( lastmod ) > new Date( '2026-01-01' ), `${ loc }: ${ lastmod }` );

		}

		// No date known (a shallow clone's): every page still listed, with no <lastmod> rather than a wrong one.
		const undated = sitePages( { when: () => null } ).sitemap;
		assert.equal( ( undated.match( /<url>/g ) ?? [] ).length, entries.length );
		assert.doesNotMatch( undated, /lastmod|null|undefined/ );

		const robots = await ( await fetch( `${ server.base }/robots.txt` ) ).text();
		const lines = robots.split( '\n' ).map( line => line.trim() ).filter( line => line && ! line.startsWith( '#' ) );
		assert.deepEqual( lines, [ 'User-agent: *', 'Allow: /', 'Disallow: /api/', `Sitemap: ${ SITE }/sitemap.xml` ] );

	} );

	test( 'the icons and the web app manifest', async () => {

		const manifest = JSON.parse( readFileSync( join( DIST, 'site.webmanifest' ), 'utf8' ) );
		assert.equal( manifest.name, 'World Drive' );
		assert.equal( manifest.start_url, '/' );
		assert.ok( manifest.theme_color && manifest.background_color );
		for ( const icon of manifest.icons ) {

			const file = builtFile( icon.src );
			assert.ok( file, `${ icon.src } isn't in the build` );
			const [ width, height ] = pngSize( file );
			assert.equal( `${ width }x${ height }`, icon.sizes );

		}

		assert.ok( manifest.icons.some( icon => icon.purpose === 'maskable' ) );
		assert.deepEqual( pngSize( join( DIST, 'apple-touch-icon.png' ) ), [ 180, 180 ] );
		const ico = readFileSync( join( DIST, 'favicon.ico' ) );
		assert.deepEqual( [ ico.readUInt16LE( 0 ), ico.readUInt16LE( 2 ), ico.readUInt16LE( 4 ) ], [ 0, 1, 3 ] );
		assert.equal( ico[ 6 + 32 ], 48, 'the favicon has no 48 px picture' );
		assert.match( readFileSync( join( DIST, 'favicon.svg' ), 'utf8' ), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/ );

	} );

	test( 'the home page says what World Drive is in its own words, links to the places, and shows it on the globe\'s panel', async () => {

		const { html } = pages.find( page => page.path === '/' );
		const words = wordsOf( html );
		assert.ok( words.length >= HOME_WORDS, `only ${ words.length } words` );
		const text = words.join( ' ' );
		for ( const phrase of [ 'Drive anywhere on Earth', 'photorealistic 3D', 'free arcade driving game', 'nothing to download', 'Stunts', 'Boost', 'drift', 'Fly', 'party', 'levels', 'Can I drive on the Moon?', 'NASA\'s maps' ] ) assert.ok( text.includes( phrase ), `no "${ phrase }"` );
		const links = linksOf( html );
		for ( const place of PLACES ) assert.ok( links.includes( `/drive/${ place.slug }/` ), `the home page doesn't link to ${ place.slug }` );
		for ( const place of MOON_PAGES ) assert.ok( links.includes( `/moon/${ place.slug }/` ), `the home page doesn't link to the Moon's ${ place.slug }` );
		assert.ok( links.includes( '/drive/' ) && links.includes( '/moon/' ) );

		// In the page: the words are on the panel, not tucked away, and the pitch is on the splash.
		const page = await browser.newPage( { viewport: { width: 1280, height: 800 } } );
		await page.route( /^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort() );
		// (Looked for as the page arrives: served from this machine, the globe can be up by its load event.)
		await page.goto( server.base, { waitUntil: 'commit' } );
		await page.locator( '#splash .pitch' ).waitFor( { state: 'visible', timeout: 10000 } );
		await page.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 60000 } );
		const info = page.locator( '#globe-ui .site-info' );
		await info.scrollIntoViewIfNeeded();
		assert.ok( await info.isVisible() );
		assert.ok( await page.locator( '#globe-ui .site-info a[href="/drive/golden-gate-bridge/"]' ).isVisible() );
		const style = await info.evaluate( el => {

			const s = getComputedStyle( el );
			return { size: parseFloat( s.fontSize ), opacity: Number( s.opacity ), color: s.color };

		} );
		assert.ok( style.size >= 12 && style.opacity === 1, JSON.stringify( style ) );
		if ( SHOTS ) await page.screenshot( { path: join( SHOTS, 'seo-home-info.png' ) } );
		// About still opens from it.
		await page.locator( '#globe-ui .site-info .about-open' ).click();
		assert.ok( await page.locator( 'dialog#about' ).isVisible() );
		await page.locator( 'dialog#about button', { hasText: 'Close' } ).click();

		// A tap on a place there flies the globe to it, as a start spot does, rather than leaving the
		// game (which would end the visit, and the place's Drive here would spend another).
		await page.evaluate( () => window.addEventListener( 'beforeunload', () => window.__left = true ) );
		const times = page.locator( '#globe-ui .site-places a[href="/drive/times-square/"]' );
		assert.equal( await times.getAttribute( 'data-play' ), '/?spot=manhattan' );
		await times.click();
		await page.waitForFunction( () => window.drive.globe.pin && ! window.drive.globe.flight, null, { timeout: 60000 } );
		const manhattan = SPOTS.find( spot => spot.id === 'manhattan' );
		const pin = await page.evaluate( () => ( { lat: window.drive.globe.pin.lat, lon: window.drive.globe.pin.lon, name: document.querySelector( '.pin-card .name' ).textContent } ) );
		assert.deepEqual( pin, { lat: manhattan.lat, lon: manhattan.lon, name: manhattan.name } );
		const eiffel = PLACES.find( place => place.slug === 'eiffel-tower' );
		await page.locator( '#globe-ui .site-places a[href="/drive/eiffel-tower/"]' ).click();
		await page.waitForFunction( lat => window.drive.globe.pin?.lat === lat && ! window.drive.globe.flight, eiffel.at.lat, { timeout: 60000 } );
		assert.equal( await page.locator( '.pin-card .name' ).textContent(), 'Eiffel Tower' );
		assert.equal( page.url(), `${ server.base }/` );
		assert.equal( await page.evaluate( () => window.__left ?? false ), false, 'the page was left' );
		// A tap on one of the Moon's places turns the globe to the Moon (its files fetched now, from
		// beside its pages) and flies there, pinned, still without leaving.
		const tycho = page.locator( '#globe-ui .site-places a[href="/moon/tycho/"]' );
		assert.equal( await tycho.getAttribute( 'data-play' ), '/?spot=moon-tycho' );
		await tycho.click();
		await page.waitForFunction( () => window.drive.world === 'moon' && window.drive.panel.pinned?.id === 'moon-tycho' && ! window.drive.globe.flight, null, { timeout: 120000 } );
		assert.equal( await page.locator( '.pin-card .name' ).textContent(), 'Tycho crater' );
		assert.equal( page.url(), `${ server.base }/` );
		assert.equal( await page.evaluate( () => window.__left ?? false ), false, 'the page was left' );
		// The lists of them all open in a tab of their own.
		assert.equal( await page.locator( '#globe-ui .site-info a[href="/drive/"]' ).getAttribute( 'target' ), '_blank' );
		assert.equal( await page.locator( '#globe-ui .site-info a[href="/moon/"]' ).getAttribute( 'target' ), '_blank' );
		await page.close();

	} );

	test( 'without WebGL (as Google\'s renderer has none) the panel\'s words show, with why there\'s no globe, and no visit is asked for', async t => {

		const plain = await chromium.launch( { args: [ '--disable-webgl', '--disable-3d-apis' ] } );
		t.after( () => plain.close() );
		const page = await plain.newPage( { viewport: { width: 1280, height: 800 } } );
		const errors = [];
		const asked = [];
		page.on( 'pageerror', err => errors.push( err.message ) );
		page.on( 'request', request => asked.push( new URL( request.url() ).pathname ) );
		await page.route( /^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort() );
		await page.goto( server.base );
		const note = page.locator( '#globe-ui .no-webgl-note' );
		await note.waitFor();
		assert.match( await note.textContent(), /needs 3D graphics \(WebGL\)/ );
		await page.waitForTimeout( 500 );
		const seen = await page.evaluate( () => {

			const info = document.querySelector( '#globe-ui .site-info' );
			const shown = el => !! el && el.checkVisibility( { opacityProperty: true, visibilityProperty: true } );
			return {
				info: shown( info ),
				title: shown( document.querySelector( '#globe-ui .logo' ) ),
				search: shown( document.querySelector( '#globe-ui .search' ) ),
				spots: shown( document.querySelector( '#globe-ui .spots' ) ),
				splash: shown( document.getElementById( 'splash' ) ),
				words: info.innerText.split( /\s+/ ).filter( word => /\p{L}/u.test( word ) ).length,
				game: !! window.drive,
			};

		} );
		assert.deepEqual( { ...seen, words: seen.words > 300 }, { info: true, title: true, search: false, spots: false, splash: false, words: true, game: false } );
		// Neither the Worker nor the game's code was asked for: a visit would spend a drive on a blank page.
		assert.deepEqual( asked.filter( path => path.startsWith( '/api/' ) ), [] );
		assert.ok( ! asked.some( path => /\/assets\/main-[^/]*\.js$/.test( path ) ), asked.join( ' ' ) );
		assert.deepEqual( errors, [] );
		await page.locator( '#globe-ui .site-info a[href="/drive/golden-gate-bridge/"]' ).scrollIntoViewIfNeeded();
		assert.ok( await page.locator( '#globe-ui .site-info a[href="/drive/golden-gate-bridge/"]' ).isVisible() );
		await page.locator( '#globe-ui .site-info .about-open' ).click();
		assert.ok( await page.locator( 'dialog#about' ).isVisible() );
		if ( SHOTS ) await page.screenshot( { path: join( SHOTS, 'seo-no-webgl.png' ) } );
		const phone = await plain.newPage( { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } );
		await phone.route( /^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort() );
		await phone.goto( server.base );
		await phone.locator( '#globe-ui .no-webgl-note' ).waitFor();
		assert.ok( await phone.locator( '#globe-ui .site-info h2' ).isVisible() );
		if ( SHOTS ) await phone.screenshot( { path: join( SHOTS, 'seo-no-webgl-phone.png' ) } );

	} );

} );

describe( 'Drive here: a place\'s link opens the game with it pinned', () => {

	// A page that records errors and anything asked of the world outside (all blocked).
	async function newPage( viewport = { width: 1280, height: 800 } ) {

		const page = await browser.newPage( { viewport, hasTouch: viewport.width < 500, isMobile: viewport.width < 500 } );
		page.errors = [];
		page.outside = [];
		page.on( 'pageerror', err => page.errors.push( err.message ) );
		await page.route( /^https?:\/\/(?!127\.0\.0\.1)/, route => {

			page.outside.push( route.request().url() );
			route.abort();

		} );
		return page;

	}

	const pinned = page => page.waitForFunction( () => window.drive?.mode === 'globe' && window.drive.globe.pin && ! window.drive.globe.flight, null, { timeout: 60000 } );

	test( 'from every place\'s page: the game starts on the globe, flies there and pins it, and the address is tidied', async () => {

		const page = await newPage();
		for ( const place of PLACES ) {

			await page.goto( `${ server.base }/drive/${ place.slug }/` );
			await page.locator( 'a.go' ).click();
			await pinned( page );
			const pin = await page.evaluate( () => {

				const { lat, lon } = window.drive.globe.pin;
				return { lat, lon, name: document.querySelector( '.pin-card .name' ).textContent, coords: document.querySelector( '.pin-card .coords' ).textContent, card: ! document.querySelector( '.pin-card' ).hidden };

			} );
			const spot = SPOTS.find( s => s.id === place.spot );
			const where = spot ?? place.at;
			assert.ok( pin.card, `${ place.slug }: no pin card` );
			assert.equal( pin.name, spot?.name ?? place.name, place.slug );
			assert.ok( Math.abs( pin.lat - where.lat ) < 1e-6 && Math.abs( pin.lon - where.lon ) < 1e-6, `${ place.slug }: pinned at ${ pin.lat }, ${ pin.lon }` );
			assert.ok( pin.coords.startsWith( spot?.region ?? place.region ), `${ place.slug }: ${ pin.coords }` );
			// It never drops in by itself, and the place is out of the address.
			assert.equal( await page.evaluate( () => window.drive.mode ), 'globe' );
			assert.equal( new URL( page.url() ).search, '', place.slug );
			// The pin is in sight, over the globe and clear of the panel.
			const box = await page.locator( '#pin span' ).boundingBox();
			assert.ok( box && box.x > 360 && box.x < 1280 && box.y > 0 && box.y < 800, `${ place.slug }: the pin at ${ JSON.stringify( box ) }` );

		}

		if ( SHOTS ) await page.screenshot( { path: join( SHOTS, 'seo-deep-link.png' ) } );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );
		await page.close();

	} );

	test( 'from a Moon page: the game starts, turns the globe to the Moon and pins its spot there, and the address is tidied', async () => {

		const page = await newPage();
		const place = MOON_PAGES.find( p => p.slug === 'tycho' );
		const spot = MOON_SPOTS.find( s => s.id === place.spot );
		await page.goto( `${ server.base }/moon/${ place.slug }/` );
		await page.locator( 'a.go' ).click();
		await page.waitForFunction( id => window.drive?.mode === 'globe' && window.drive.world === 'moon' && window.drive.panel.pinned?.id === id && ! window.drive.globe.flight, spot.id, { timeout: 120000 } );
		const pin = await page.evaluate( () => {

			const { lat, lon, world } = window.drive.globe.pin;
			return { lat, lon, world, name: document.querySelector( '.pin-card .name' ).textContent, card: ! document.querySelector( '.pin-card' ).hidden };

		} );
		assert.deepEqual( pin, { lat: spot.lat, lon: spot.lon, world: 'moon', name: spot.name, card: true } );
		// It never drops in by itself, and the place is out of the address.
		assert.equal( await page.evaluate( () => window.drive.mode ), 'globe' );
		assert.equal( new URL( page.url() ).search, '' );
		if ( SHOTS ) await page.screenshot( { path: join( SHOTS, 'seo-moon-link.png' ) } );
		assert.deepEqual( page.errors, [] );
		assert.deepEqual( page.outside, [] );
		await page.close();

	} );

	test( 'then Drive here drops in at the place, as a start spot does; on a phone the pin is clear of the sheet', async () => {

		const page = await newPage();
		await page.goto( `${ server.base }/?at=48.86,2.2945&name=Eiffel%20Tower&region=Paris%2C%20France&heading=236` );
		await pinned( page );
		await page.locator( '.pin-card .go' ).click();
		await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 60000 } );
		assert.equal( await page.locator( '#drive-ui .place' ).textContent(), 'Eiffel Tower' );
		const recent = await page.evaluate( () => JSON.parse( localStorage.getItem( 'world-drive.recent' ) )[ 0 ] );
		assert.deepEqual( [ recent.name, recent.region, recent.lat, recent.lon, recent.heading ], [ 'Eiffel Tower', 'Paris, France', 48.86, 2.2945, 236 ] );
		if ( SHOTS ) await page.screenshot( { path: join( SHOTS, 'seo-deep-link-driving.png' ) } );
		assert.deepEqual( page.errors, [] );
		await page.close();

		const phone = await newPage( { width: 390, height: 844 } );
		await phone.goto( `${ server.base }/?spot=monaco` );
		await pinned( phone );
		const pin = await phone.locator( '#pin span' ).boundingBox();
		const card = await phone.locator( '.pin-card' ).boundingBox();
		assert.ok( pin.y + pin.height < card.y, `the pin (${ pin.y }) is under its card (${ card.y })` );
		if ( SHOTS ) await phone.screenshot( { path: join( SHOTS, 'seo-deep-link-phone.png' ) } );
		await phone.close();

	} );

	test( 'a ?party= stays in the address; a link\'s rude name, a bad place or an unknown spot isn\'t taken', async () => {

		const page = await newPage();
		await page.goto( `${ server.base }/?spot=monaco&party=ABCD234` );
		await pinned( page );
		assert.equal( new URL( page.url() ).search, '?party=ABCD234' );

		// A name the leaderboard wouldn't show, nor would the others driving there see: a dropped pin.
		await page.goto( `${ server.base }/?at=40.7,-74&name=${ encodeURIComponent( 'fuck this' ) }&region=${ encodeURIComponent( '<b>x</b>' ) }` );
		await pinned( page );
		assert.equal( await page.locator( '.pin-card .name' ).textContent(), 'Dropped pin' );
		assert.doesNotMatch( await page.locator( '.pin-card .coords' ).textContent(), /<|x/ );

		for ( const search of [ '?at=91,10&name=Nowhere', '?at=hello', '?spot=atlantis', '?at=10,200' ] ) {

			await page.goto( `${ server.base }/${ search }` );
			await page.waitForFunction( () => window.drive?.mode === 'globe', null, { timeout: 60000 } );
			await page.waitForTimeout( 300 );
			assert.equal( await page.evaluate( () => window.drive.globe.pin ), null, search );
			assert.ok( await page.locator( '.pin-card' ).isHidden(), search );

		}

		assert.deepEqual( page.errors, [] );
		await page.close();

	} );

} );

describe( 'the dev server and the load', () => {

	test( 'the dev server makes the same pages: the places, the list, the Moon\'s, the sitemap, the home page\'s lists; the Moon\'s files pass through', async () => {

		const vite = await startVite( PORT + 1, {}, 'vite.drive.config.js' );
		try {

			const base = `http://127.0.0.1:${ PORT + 1 }`;
			const place = await fetch( `${ base }/drive/golden-gate-bridge/` );
			assert.equal( place.status, 200 );
			assert.equal( titleOf( await place.text() ), 'Drive the Golden Gate Bridge in 3D – World Drive' );
			const bare = await fetch( `${ base }/drive/monaco`, { redirect: 'manual' } );
			assert.equal( bare.status, 307 );
			assert.equal( bare.headers.get( 'location' ), '/drive/monaco/' );
			assert.match( await ( await fetch( `${ base }/drive/` ) ).text(), /<h1>Places to drive<\/h1>/ );
			const sitemap = await ( await fetch( `${ base }/sitemap.xml` ) ).text();
			assert.match( sitemap, /<loc>https:\/\/worlddrive\.app\/drive\/colosseum\/<\/loc>/ );
			assert.match( sitemap, /<loc>https:\/\/worlddrive\.app\/moon\/tycho\/<\/loc>/ );
			const home = await ( await fetch( `${ base }/` ) ).text();
			assert.match( home, /<li><a href="\/drive\/copacabana\/" data-play="\/\?at=[^"]+">Copacabana<\/a><\/li>/ );
			assert.match( home, /<li><a href="\/moon\/tycho\/" data-play="\/\?spot=moon-tycho">Tycho crater<\/a><\/li>/ );

			// The Moon's pages at /moon/ and /moon/<slug>/, and every other /moon/ address (the files the
			// game fetches) passed on untouched.
			assert.match( await ( await fetch( `${ base }/moon/` ) ).text(), /<h1>Drive on the Moon<\/h1>/ );
			const tycho = await fetch( `${ base }/moon/tycho/` );
			assert.equal( tycho.status, 200 );
			assert.equal( titleOf( await tycho.text() ), 'Drive Tycho Crater on the Moon in 3D – World Drive' );
			const moonBare = await fetch( `${ base }/moon/tycho`, { redirect: 'manual' } );
			assert.deepEqual( [ moonBare.status, moonBare.headers.get( 'location' ) ], [ 307, '/moon/tycho/' ] );
			for ( const [ path, size ] of Object.entries( MOON_FILES ) ) {

				const res = await fetch( base + path );
				assert.equal( res.status, 200, path );
				assert.equal( ( await res.arrayBuffer() ).byteLength, size, path );

			}

		} finally {

			vite.stop();

		}

	} );

	test( 'on a phone\'s connection, what World Drive is shows at once: the first paint is the largest, long before the game\'s code is in', async t => {

		const home = await measureLoad( browser, `${ server.base }/` );
		t.diagnostic( `home: ${ JSON.stringify( home ) }` );
		assert.equal( home.lcp.element, 'p.pitch' );
		assert.ok( home.fcp < 1500, `first contentful paint ${ home.fcp } ms` );
		assert.ok( home.lcp.time < 2500, `largest contentful paint ${ home.lcp.time } ms` );
		assert.ok( home.lcp.time <= home.fcp + 100, 'the largest paint came later than the first' );
		// The game's code (three.js and the rest) comes after: the first paint doesn't wait for it.
		assert.ok( home.globe > home.lcp.time + 1000, `the globe at ${ home.globe } ms` );
		assert.ok( home.js > 200000, `only ${ home.js } bytes of script` );

		const place = await measureLoad( browser, `${ server.base }/drive/golden-gate-bridge/`, { game: false } );
		t.diagnostic( `a place's page: ${ JSON.stringify( place ) }` );
		assert.equal( place.js, 0, 'a place\'s page loads a script' );
		assert.ok( place.lcp.time < 1500, `largest contentful paint ${ place.lcp.time } ms` );

	} );

} );
