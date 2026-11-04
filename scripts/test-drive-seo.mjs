// npm run test:drive-seo: World Drive as search engines and link previews see it (docs/world-drive.md,
// "Search engines"). It builds the site (npm run build:drive, into dist-drive/; TEST_SEO_DIST=<folder>
// checks one already built there instead) and serves it as Cloudflare's assets do (drive-static.mjs).
// Every page's title, description, canonical address, Open Graph and Twitter tags and structured
// data (valid JSON with what Google asks for, and no ratings made up); the sitemap listing every
// page and only real addresses, with dates; robots.txt; the icons and the manifest; every link
// within the site answering; the home page's words for a crawler, in the page itself and shown on
// the globe's panel; each place's "Drive here" opening the game on the test globe with its pin
// there (the address tidied after, a ?party= kept, a link's rude name or bad place refused), and a
// drop-in from it; the dev server making the same pages; and the load on a phone's connection:
// what World Drive is shows at once, before the game's code, and counts as the page's largest
// paint. Every request off this machine is blocked.
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
import { PLACES } from '../drive/site/places.js';
import { linkedPlace, SPOTS } from '../src/drive-app/places.js';

const require = createRequire( import.meta.url );
const ROOT = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
const PORT = Number( process.env.TEST_VITE_PORT ) || 5531;
const SHOTS = process.env.TEST_SCREENSHOTS;
const DIST = process.env.TEST_SEO_DIST || join( ROOT, 'dist-drive' );
const SITE = 'https://worlddrive.app';
// Fewer words than this and the home page says too little for a search engine to know what it is.
const HOME_WORDS = 350;

let chromium;
let browser;
let server;
let pages;

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

	pages = htmlPages( DIST );
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

	test( 'the pages: the home page, the list of places and one page for each place, each at a clean address', () => {

		const paths = pages.map( page => page.path ).sort();
		const expected = [ '/', '/drive/', ...PLACES.map( place => `/drive/${ place.slug }/` ) ].sort();
		assert.deepEqual( paths, expected );
		for ( const place of PLACES ) assert.match( place.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${ place.slug } isn't a clean address` );
		// One for each start spot, and those exist.
		for ( const spot of SPOTS ) assert.ok( PLACES.some( place => place.spot === spot.id ), `no page for the start spot ${ spot.id }` );

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
			assert.equal( metaOf( html, 'og:image:width' ), '1200' );
			assert.equal( metaOf( html, 'og:image:height' ), '630' );
			assert.ok( metaOf( html, 'og:image:alt' )?.length > 10 );
			for ( const icon of [ '/favicon.ico', '/favicon.svg', '/apple-touch-icon.png', '/site.webmanifest' ] ) assert.ok( html.includes( `href="${ icon }"` ), `${ path }: no ${ icon }` );

		}

		// A place's own card.
		const golden = pages.find( page => page.path === '/drive/golden-gate-bridge/' ).html;
		assert.equal( metaOf( golden, 'og:image' ), `${ SITE }/og/golden-gate-bridge.png` );
		assert.equal( titleOf( golden ), 'Drive the Golden Gate Bridge in 3D – World Drive' );

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
			const place = PLACES.find( p => `/drive/${ p.slug }/` === path );
			if ( ! place ) continue;
			const page = items.find( item => item[ '@type' ] === 'WebPage' );
			assert.equal( page.url, SITE + path );
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

		}

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
		// Off the site, only OpenStreetMap's copyright page.
		const outside = new Set( pages.flatMap( ( { html } ) => linksOf( html ) ).filter( href => /^https?:/.test( href ) && ! href.startsWith( SITE ) ) );
		assert.deepEqual( [ ...outside ], [ 'https://www.openstreetmap.org/copyright' ] );

	} );

	test( 'the sitemap lists every page and nothing else, with its date; robots.txt points to it and keeps crawlers off /api/', async () => {

		const res = await fetch( `${ server.base }/sitemap.xml` );
		assert.equal( res.status, 200 );
		assert.match( res.headers.get( 'content-type' ), /xml/ );
		const xml = await res.text();
		assert.match( xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/ );
		const entries = [ ...xml.matchAll( /<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>\s*<\/url>/g ) ].map( match => ( { loc: match[ 1 ], lastmod: match[ 2 ] } ) );
		assert.equal( entries.length, ( xml.match( /<url>/g ) ?? [] ).length );
		assert.deepEqual( entries.map( entry => entry.loc ).sort(), pages.map( page => SITE + page.path ).sort() );
		for ( const { loc, lastmod } of entries ) {

			assert.doesNotMatch( loc, /[?#]/ );
			assert.ok( builtFile( loc.slice( SITE.length ) ), `${ loc } isn't a page` );
			assert.match( lastmod, /^\d{4}-\d\d-\d\d$/ );
			assert.ok( new Date( lastmod ) <= new Date( Date.now() + 86400000 ) && new Date( lastmod ) > new Date( '2026-01-01' ), `${ loc }: ${ lastmod }` );

		}

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
		for ( const phrase of [ 'Drive anywhere on Earth', 'photorealistic 3D', 'free arcade driving game', 'nothing to download', 'Stunts', 'Boost', 'drift', 'Fly', 'party', 'levels' ] ) assert.ok( text.includes( phrase ), `no "${ phrase }"` );
		const links = linksOf( html );
		for ( const place of PLACES ) assert.ok( links.includes( `/drive/${ place.slug }/` ), `the home page doesn't link to ${ place.slug }` );
		assert.ok( links.includes( '/drive/' ) );

		// In the page: the words are on the panel, not tucked away, and the pitch is on the splash.
		const page = await browser.newPage( { viewport: { width: 1280, height: 800 } } );
		await page.route( /^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort() );
		await page.goto( server.base );
		assert.ok( await page.locator( '#splash .pitch' ).isVisible() );
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
		await page.close();

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

	test( 'then Drive here drops in at the place, as a start spot does; on a phone the pin is clear of the sheet', async () => {

		const page = await newPage();
		await page.goto( `${ server.base }/?at=48.86,2.2945&name=Eiffel%20Tower&region=Paris%2C%20France&heading=56` );
		await pinned( page );
		await page.locator( '.pin-card .go' ).click();
		await page.waitForFunction( () => window.drive.mode === 'driving', null, { timeout: 60000 } );
		assert.equal( await page.locator( '#drive-ui .place' ).textContent(), 'Eiffel Tower' );
		const recent = await page.evaluate( () => JSON.parse( localStorage.getItem( 'world-drive.recent' ) )[ 0 ] );
		assert.deepEqual( [ recent.name, recent.region, recent.lat, recent.lon, recent.heading ], [ 'Eiffel Tower', 'Paris, France', 48.86, 2.2945, 56 ] );
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

	test( 'the dev server makes the same pages: the places, the list, the sitemap, the home page\'s list', async () => {

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
			assert.match( await ( await fetch( `${ base }/sitemap.xml` ) ).text(), /<loc>https:\/\/worlddrive\.app\/drive\/route-66\/<\/loc>/ );
			assert.match( await ( await fetch( `${ base }/` ) ).text(), /<li><a href="\/drive\/copacabana\/">Copacabana<\/a><\/li>/ );

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
