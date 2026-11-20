// npm run test:drive-seo: World Drive as search engines and link previews see it (docs/world-drive.md,
// "Search engines"). It builds the site (npm run build:drive, into dist-drive/; TEST_SEO_DIST=<folder>
// checks one already built there instead) and serves it as Cloudflare's assets do (drive-static.mjs).
// Every public page's title, description, canonical address, Open Graph and Twitter tags and
// structured data (valid JSON with what Google asks for, and no ratings made up), the Moon's and
// Mars's pages among them (with no Earth coordinates); the owner's private page (admin.html) kept
// out of search (noindex) and out of the sitemap; the sitemap listing every public page and only
// real addresses, with dates; robots.txt; the icons and the manifest; every link within the site
// answering, and each world's data files still served beside its pages; the home page's words for a
// crawler, in the page itself and shown on the globe's panel, a tap on an Earth place there flying
// the globe to it and on a Moon or Mars place turning it to that world; each place's "Drive here"
// opening the game on the test globe with its pin there (the address tidied after, a ?party= kept, a
// link's rude name or bad place refused), and a drop-in from it; a Moon page's and a Mars page's
// opening the game on that world with its spot pinned; the dev server making the same pages and
// passing each world's files on; and the load on a phone's connection: what World Drive is shows at
// once, before the game's code, and counts as the page's largest paint; and the challenges a chunk
// of their own, none of them in the first load. Every request off this machine is blocked.
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
import { WORKS_RIDES } from '../src/drive-app/catalog.js';
import { PLACES } from '../drive/site/places.js';
import { sitePages, WORLD_SITES } from '../drive/site/build.js';
import { linkedPlace, SPOTS } from '../src/drive-app/places.js';
import { SPOTS_ON } from '../src/drive-app/world-places.js';
import { OFF_EARTH, onWorld, OnWorld, TheWorld } from '../src/drive-app/worlds.js';

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
// The other worlds (worlds.js), each with its pages (drive/site/<world>.js) and start spots.
const MOON_PAGES = WORLD_SITES.moon.pages;
const MOON_SPOTS = SPOTS_ON.moon;
const MARS_PAGES = WORLD_SITES.mars.pages;
// What each one's pages must say and have: its own page's title; where a place is, as its
// coordinates are named; that nothing of the landers is in it; its credit's link; on its own page,
// what it's made from and what's different there; and its data files, which the game fetches
// beside its pages under /<world>/, and their sizes (bytes).
const WORLD_CHECKS = {
	moon: {
		title: 'Drive on the Moon in 3D, Free in Your Browser – World Drive',
		coordinates: 'selenographic latitude and longitude',
		honest: /no landers, flags or rover tracks/,
		credit: 'https://svs.gsfc.nasa.gov/4720/',
		phrases: [ 'LOLA', 'LROC', 'public domain', 'made up', 'a sixth of the gravity', 'two and a half times as long', 'The Earth in the sky', 'No water', 'With others', 'bring friends in a party' ],
		files: { '/moon/height.bin': 2073600, '/moon/colour.webp': 674590 },
	},
	mars: {
		title: 'Drive on Mars in 3D, Free in Your Browser – World Drive',
		coordinates: 'areocentric latitude and longitude',
		honest: /no landers, rovers or tracks/,
		credit: 'https://astrogeology.usgs.gov/search/map/mars_viking_colorized_global_mosaic_232m',
		phrases: [ 'MOLA', 'Mars Global Surveyor', 'Viking', 'USGS', 'areoid', 'public domain', 'made up', '38% of the gravity', 'about 1.6 times as long', 'butterscotch sky', 'Phobos', 'No water', 'With others', 'Mars\'s own rooms' ],
		files: { '/mars/height.bin': 8294400, '/mars/colour.webp': 1050320 },
	},
	vesta: {
		title: 'Drive on the Asteroid Vesta in 3D, Free in Your Browser – World Drive',
		coordinates: 'planetocentric latitude and longitude',
		honest: /Dawn never landed, and there's no spacecraft in it/,
		credit: 'https://planetarymaps.usgs.gov/mosaic/',
		phrases: [ 'Dawn', 'DLR', 'framing camera', 'made up', '2.5% of the gravity', 'about six times as long', 'black sky full of stars', 'No water', 'With others', 'Vesta\'s own rooms' ],
		files: { '/vesta/height.bin': 8294400, '/vesta/colour.webp': 444068 },
	},
	ceres: {
		title: 'Drive on the Dwarf Planet Ceres in 3D, Free in Your Browser – World Drive',
		coordinates: 'planetocentric latitude and longitude',
		honest: /Dawn never landed, and there's no spacecraft in it/,
		credit: 'https://planetarymaps.usgs.gov/mosaic/',
		phrases: [ 'Dawn', 'DLR', 'framing camera', 'made up', '2.9% of the gravity', 'nearly six times as long', 'black sky full of stars', 'No water', 'With others', 'Ceres\'s own rooms' ],
		files: { '/ceres/height.bin': 8294400, '/ceres/colour.webp': 781442 },
	},
};
// The worlds whose link cards are drawn (npm run drive:site-images): the Moon's and Mars's always;
// Vesta's and Ceres's once drawn, until then their pages have World Drive's own card.
const DRAWN = new Set( [ 'moon', 'mars' ] );
const WORLD_FILES = Object.assign( {}, ...OFF_EARTH.map( id => WORLD_CHECKS[ id ].files ) );
// "43.31° S, 11.36° W": where a place on another world is, as its page says it.
const latLon = ( { lat, lon } ) => `${ Math.abs( lat ).toFixed( 2 ) }° ${ lat < 0 ? 'S' : 'N' }, ${ Math.abs( lon ).toFixed( 2 ) }° ${ lon < 0 ? 'W' : 'E' }`;

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
// And all of them, numbers too ("38% of the gravity"), as one line of text.
const textOf = html => decode( html.replace( /<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, ' ' ).replace( /<[^>]+>/g, ' ' ) ).split( /\s+/ ).filter( Boolean ).join( ' ' );

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

	test( 'the pages: the home page, the list of places, one page for each place, and the other worlds\', each at a clean address', () => {

		assert.deepEqual( OFF_EARTH, [ 'moon', 'mars', 'vesta', 'ceres' ] );
		const paths = pages.map( page => page.path ).sort();
		const expected = [ '/', '/drive/', ...PLACES.map( place => `/drive/${ place.slug }/` ), ...OFF_EARTH.flatMap( id => [ `/${ id }/`, ...WORLD_SITES[ id ].pages.map( place => `/${ id }/${ place.slug }/` ) ] ) ].sort();
		assert.deepEqual( paths, expected );
		assert.ok( paths.includes( '/mars/olympus-mons/' ) && paths.includes( '/moon/tycho/' ) && paths.includes( '/vesta/' ) && paths.includes( '/ceres/' ) );
		for ( const place of [ ...PLACES, ...OFF_EARTH.flatMap( id => WORLD_SITES[ id ].pages ) ] ) assert.match( place.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${ place.slug } isn't a clean address` );
		// One for each start spot, the Earth's, the Moon's and Mars's, and those exist (each page a spot
		// of its own world's, none twice).
		for ( const spot of SPOTS ) assert.ok( PLACES.some( place => place.spot === spot.id ), `no page for the start spot ${ spot.id }` );
		for ( const spot of MOON_SPOTS ) assert.ok( MOON_PAGES.some( place => place.spot === spot.id ), `no page for the Moon's start spot ${ spot.id }` );
		for ( const id of OFF_EARTH ) {

			const own = WORLD_SITES[ id ].pages;
			for ( const spot of SPOTS_ON[ id ] ) assert.ok( own.some( place => place.spot === spot.id ), `no page for ${ id }'s start spot ${ spot.id }` );
			assert.equal( new Set( own.map( place => place.spot ) ).size, own.length, `${ id }: two pages for one spot` );
			for ( const place of own ) assert.ok( SPOTS_ON[ id ].some( spot => spot.id === place.spot ), `${ id }/${ place.slug }: ${ place.spot } isn't one of its spots` );

		}

		assert.equal( MARS_PAGES.length, 12 );
		assert.deepEqual( [ WORLD_SITES.vesta.pages.length, WORLD_SITES.ceres.pages.length ], [ 11, 11 ] );

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
		// The Moon's page and Mars's, and each of their places, have their own, drawn from World Drive's
		// Moon and Mars; Vesta's and Ceres's theirs once drawn, World Drive's own card until then.
		const cardOf = ( id, name ) => DRAWN.has( id ) || existsSync( join( ROOT, 'drive', 'public', 'og', `${ name }.png` ) ) ? `${ SITE }/og/${ name }.png` : `${ SITE }/og/world-drive.png`;
		for ( const id of OFF_EARTH ) {

			const own = pages.find( page => page.path === `/${ id }/` ).html;
			assert.equal( metaOf( own, 'og:image' ), cardOf( id, id ) );
			assert.equal( titleOf( own ), WORLD_CHECKS[ id ].title );
			for ( const place of WORLD_SITES[ id ].pages ) {

				const { html } = pages.find( page => page.path === `/${ id }/${ place.slug }/` );
				assert.equal( metaOf( html, 'og:image' ), cardOf( id, `${ id }-${ place.slug }` ), place.slug );
				assert.equal( titleOf( html ), `${ place.title } – World Drive` );
				assert.equal( metaOf( html, 'description' ), place.description );

			}

		}

		// The home page's words in its head say it has the Moon and Mars too.
		const home = pages.find( page => page.path === '/' ).html;
		for ( const key of [ 'description', 'og:description', 'twitter:description' ] ) {

			assert.match( metaOf( home, key ), /Moon/, key );
			assert.match( metaOf( home, key ), /Mars/, key );

		}

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
		assert.match( game.description, /Mars/ );

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
			const world = OFF_EARTH.find( id => path.startsWith( `/${ id }/` ) );
			if ( world ) {

				// Another world's: World Drive › The Moon, Mars, Vesta or Ceres (› the place), and no coordinates of
				// schema.org's, which are the Earth's (the page says where it is on that world in its words).
				assert.deepEqual( crumbs.itemListElement.slice( 0, 2 ).map( crumb => [ crumb.name, crumb.item ] ), [ [ 'World Drive', `${ SITE }/` ], [ TheWorld( world ), `${ SITE }/${ world }/` ] ], path );
				assert.doesNotMatch( text, /GeoCoordinates|"geo"|"latitude"|"longitude"/, `${ path }: the Earth's coordinates on ${ TheWorld( world ) }` );

			}

			if ( path === '/moon/' ) assert.equal( crumbs.itemListElement[ 1 ].name, 'The Moon' );
			if ( path === '/mars/' ) assert.equal( crumbs.itemListElement[ 1 ].name, 'Mars' );
			if ( path === '/vesta/' ) assert.equal( crumbs.itemListElement[ 1 ].name, 'Vesta' );
			if ( path === '/ceres/' ) assert.equal( crumbs.itemListElement[ 1 ].name, 'Ceres' );
			const place = PLACES.find( p => `/drive/${ p.slug }/` === path );
			const worldPlace = world && WORLD_SITES[ world ].pages.find( p => `/${ world }/${ p.slug }/` === path );
			if ( ! place && ! worldPlace ) continue;
			const page = items.find( item => item[ '@type' ] === 'WebPage' );
			assert.equal( page.url, SITE + path );
			assert.equal( crumbs.itemListElement.length, 3 );
			if ( worldPlace ) {

				assert.equal( page.about.name, worldPlace.name );
				assert.equal( page.about.containedInPlace.name, { moon: 'The Moon', mars: 'Mars', vesta: 'Vesta', ceres: 'Ceres' }[ world ] );
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
			// And to the other worlds, among the other places.
			for ( const id of OFF_EARTH ) assert.ok( new RegExp( `<ul class="places">[\\s\\S]*<li><a href="/${ id }/">${ TheWorld( id ) }<span>` ).test( html ), `${ place.slug }: no ${ TheWorld( id ) } among the other places` );

		}

		// The list of them all says the other worlds are there too.
		const hub = pages.find( page => page.path === '/drive/' ).html;
		for ( const id of OFF_EARTH ) assert.ok( linksOf( hub ).includes( `/${ id }/` ), `/drive/ doesn't link to ${ TheWorld( id ) }` );
		assert.match( hub, /<h2>And the Moon, Mars, Vesta and Ceres<\/h2>/ );
		// And every page's footer links to each world's.
		for ( const { path, html } of pages.filter( page => page.path !== '/' ) ) assert.match( html, /<footer>[\s\S]*<a href="\/moon\/">Drive on the Moon<\/a> · <a href="\/mars\/">Drive on Mars<\/a> · <a href="\/vesta\/">Drive on Vesta<\/a> · <a href="\/ceres\/">Drive on Ceres<\/a>/, path );

	} );

	test( 'the other worlds\' pages (the Moon\'s, Mars\'s, Vesta\'s and Ceres\'s): one heading, their own words, where on that world, a Drive here to its spot there, and links to the others', () => {

		// Nothing shared with another place's page, the Earth's included, nor the Moon's with Mars's.
		const texts = new Set( PLACES.flatMap( place => place.about ) );
		for ( const id of OFF_EARTH ) {

			const checks = WORLD_CHECKS[ id ];
			const own = WORLD_SITES[ id ].pages;
			for ( const place of own ) {

				const { html } = pages.find( page => page.path === `/${ id }/${ place.slug }/` );
				assert.equal( html.match( /<h1[\s>]/g )?.length, 1, `${ place.slug }: one h1` );
				for ( const paragraph of [ ...place.about, ...place.game ? [ place.game ] : [] ] ) {

					assert.ok( ! texts.has( paragraph ), `${ place.slug }: a paragraph from another page` );
					texts.add( paragraph );

				}

				assert.ok( wordsOf( html ).length > 300, `${ place.slug }: only ${ wordsOf( html ).length } words` );
				// Where it is, as that world's latitude and longitude (the Moon's selenographic, Mars's
				// areocentric), from its start spot.
				const spot = SPOTS_ON[ id ].find( s => s.id === place.spot );
				assert.ok( html.includes( `${ OnWorld( id ) } at ${ latLon( spot ) } (${ checks.coordinates }, north and east positive)` ), `${ place.slug }: doesn't say it's at ${ latLon( spot ) }` );
				// Honest about the game: the small craters are made up, and nothing of the landers is there.
				assert.match( html, /made up/, place.slug );
				assert.match( html, checks.honest, place.slug );
				// Its Drive here turns the game to that world with its spot pinned (see linkedPlace).
				const go = html.match( /<a class="go" href="([^"]+)"/ );
				assert.ok( go, `${ place.slug }: no Drive here` );
				assert.equal( decode( go[ 1 ] ), `/?spot=${ place.spot }` );
				assert.ok( place.spot.startsWith( `${ id }-` ), place.spot );
				const linked = linkedPlace( new URL( decode( go[ 1 ] ), SITE ).search );
				assert.deepEqual( [ linked?.id, linked?.world, linked?.name ], [ spot.id, id, spot.name ], `${ place.slug }: Drive here pins ${ linked?.name }` );
				const links = linksOf( html );
				for ( const other of own ) if ( other !== place ) assert.ok( links.includes( `/${ id }/${ other.slug }/` ), `${ place.slug } doesn't link to ${ other.slug }` );
				for ( const page of [ '/', '/drive/', `/${ id }/`, ...OFF_EARTH.map( world => `/${ world }/` ) ] ) assert.ok( links.includes( page ), `${ place.slug } doesn't link to ${ page }` );
				// The world's credit, as the game gives it (NASA's for the Moon, the USGS's mosaic for Mars).
				assert.ok( links.includes( checks.credit ), `${ place.slug }: no credit to ${ checks.credit }` );

			}

			// The world's own page: what it is, every place, and a Drive on <world> that opens the game there.
			const { html } = pages.find( page => page.path === `/${ id }/` );
			assert.equal( html.match( /<h1[\s>]/g )?.length, 1 );
			assert.ok( html.includes( `<h1>Drive ${ onWorld( id ) }</h1>` ), `/${ id }/: its heading` );
			assert.ok( wordsOf( html ).length > 500, `/${ id }/: only ${ wordsOf( html ).length } words` );
			const text = textOf( html );
			for ( const phrase of checks.phrases ) assert.ok( text.toLowerCase().includes( phrase.toLowerCase() ), `/${ id }/: no "${ phrase }"` );
			// Driving with others on every world now: none of it "on your own".
			assert.doesNotMatch( text, /on your own/i, `/${ id }/` );
			const links = linksOf( html );
			for ( const place of own ) {

				assert.ok( links.includes( `/${ id }/${ place.slug }/` ), `/${ id }/ doesn't link to ${ place.slug }` );
				assert.ok( links.includes( `/?spot=${ place.spot }` ), `/${ id }/ has no Drive here for ${ place.slug }` );

			}

			assert.ok( links.includes( '/drive/' ) && links.includes( '/' ) );
			assert.ok( links.includes( checks.credit ), `/${ id }/: no credit to ${ checks.credit }` );
			const go = decode( html.match( /<a class="go" href="([^"]+)"/ )[ 1 ] );
			assert.equal( linkedPlace( new URL( go, SITE ).search )?.world, id );

		}

		// Mars's own page names what its Drive on Mars pins, and links back to the Moon's.
		const mars = pages.find( page => page.path === '/mars/' ).html;
		assert.match( mars, /<h1>Drive on Mars<\/h1>/ );
		assert.match( mars, /with Olympus Mons, whose summit is the highest place on Mars, pinned on the globe/ );
		assert.ok( linksOf( mars ).includes( '/moon/' ) );
		assert.equal( decode( mars.match( /<a class="go" href="([^"]+)"/ )[ 1 ] ), '/?spot=mars-olympus-mons' );

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
		// Off the site, only the credits: OpenStreetMap's copyright page, NASA's for the Moon, the
		// USGS's colour mosaic for Mars and its planetary maps for Vesta and Ceres.
		const outside = new Set( pages.flatMap( ( { html } ) => linksOf( html ) ).filter( href => /^https?:/.test( href ) && ! href.startsWith( SITE ) ) );
		assert.deepEqual( [ ...outside ].sort(), [ 'https://astrogeology.usgs.gov/search/map/mars_viking_colorized_global_mosaic_232m', 'https://planetarymaps.usgs.gov/mosaic/', 'https://svs.gsfc.nasa.gov/4720/', 'https://www.instagram.com/printyours.ca/', 'https://www.openstreetmap.org/copyright' ] );

		// Each world's pages are beside the files the game fetches from /moon/ and /mars/, which are
		// still there, whole.
		for ( const [ path, size ] of Object.entries( WORLD_FILES ) ) {

			const res = await fetch( server.base + path, { redirect: 'manual' } );
			assert.equal( res.status, 200, path );
			assert.equal( ( await res.arrayBuffer() ).byteLength, size, path );

		}

		// And an address without its slash is sent on to the page, as for the places'.
		const bare = await fetch( `${ server.base }/moon/tycho`, { redirect: 'manual' } );
		assert.deepEqual( [ bare.status, bare.headers.get( 'location' ) ], [ 307, '/moon/tycho/' ] );
		const marsBare = await fetch( `${ server.base }/mars/olympus-mons`, { redirect: 'manual' } );
		assert.deepEqual( [ marsBare.status, marsBare.headers.get( 'location' ) ], [ 307, '/mars/olympus-mons/' ] );

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
		// The Moon's and Mars's pages among them; the owner's stats page (noindex) never.
		for ( const id of OFF_EARTH ) for ( const path of [ `/${ id }/`, ...WORLD_SITES[ id ].pages.map( place => `/${ id }/${ place.slug }/` ) ] ) assert.ok( entries.some( entry => entry.loc === SITE + path ), `${ path } isn't in the sitemap` );
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
		for ( const phrase of [ 'Drive anywhere on Earth', 'photorealistic 3D', 'free arcade driving game', 'nothing to download', 'Stunts', 'Boost', 'drift', 'Fly', 'party', 'levels', 'Can I drive on the Moon?', 'Can I drive on Mars?', 'Can I drive on Vesta?', 'Can I drive on Ceres?', 'NASA\'s maps',
			// Every world by the panel's Worlds button, and driving with others on each.
			'press Worlds at the top of this panel and pick Mars', 'on every world', 'You can drive with others on Vesta too', 'You can drive with others on Ceres too' ] ) assert.ok( text.includes( phrase ), `no "${ phrase }"` );
		assert.doesNotMatch( text, /on your own/i );
		const links = linksOf( html );
		for ( const place of PLACES ) assert.ok( links.includes( `/drive/${ place.slug }/` ), `the home page doesn't link to ${ place.slug }` );
		for ( const place of MOON_PAGES ) assert.ok( links.includes( `/moon/${ place.slug }/` ), `the home page doesn't link to the Moon's ${ place.slug }` );
		assert.ok( links.includes( '/drive/' ) && OFF_EARTH.every( id => links.includes( `/${ id }/` ) ) );
		// Mars's, Vesta's and Ceres's lists: each of their places linked, its data-play the spot's own
		// link (as its page's Drive here).
		for ( const id of [ 'mars', 'vesta', 'ceres' ] ) for ( const place of WORLD_SITES[ id ].pages ) assert.ok( html.includes( `<li><a href="/${ id }/${ place.slug }/" data-play="/?spot=${ place.spot }">${ place.name }</a></li>` ), `the home page's ${ TheWorld( id ) } list has no ${ place.slug }` );
		assert.doesNotMatch( html, /<!-- (moon|mars|vesta|ceres) places -->/ );

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
		// Who made it, with a plain link (no embed) that opens in a tab of its own.
		assert.match( await page.locator( 'dialog#about' ).textContent(), /Made by Thomas in Vancouver, Canada/ );
		const insta = page.locator( 'dialog#about a[href="https://www.instagram.com/printyours.ca/"]' );
		assert.equal( await insta.count(), 1 );
		assert.equal( await insta.getAttribute( 'target' ), '_blank' );
		assert.match( await insta.getAttribute( 'rel' ), /noopener/ );
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
		// And one of Mars's, from the Moon, turns it to Mars.
		const gale = page.locator( '#globe-ui .site-places a[href="/mars/bradbury-landing/"]' );
		assert.equal( await gale.getAttribute( 'data-play' ), '/?spot=mars-curiosity' );
		await gale.scrollIntoViewIfNeeded();
		await gale.click();
		await page.waitForFunction( () => window.drive.world === 'mars' && window.drive.panel.pinned?.id === 'mars-curiosity' && ! window.drive.globe.flight, null, { timeout: 120000 } );
		assert.equal( await page.locator( '.pin-card .name' ).textContent(), 'Bradbury Landing' );
		assert.equal( page.url(), `${ server.base }/` );
		assert.equal( await page.evaluate( () => window.__left ?? false ), false, 'the page was left' );
		// The lists of them all open in a tab of their own.
		assert.equal( await page.locator( '#globe-ui .site-info a[href="/drive/"]' ).getAttribute( 'target' ), '_blank' );
		assert.equal( await page.locator( '#globe-ui .site-info a[href="/moon/"]' ).getAttribute( 'target' ), '_blank' );
		assert.equal( await page.locator( '#globe-ui .site-info a[href="/mars/"]' ).getAttribute( 'target' ), '_blank' );
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

	for ( const [ world, slug ] of [ [ 'moon', 'tycho' ], [ 'mars', 'olympus-mons' ] ] ) test( `from a ${ world === 'moon' ? 'Moon' : 'Mars' } page: the game starts, turns the globe to ${ TheWorld( world ).replace( /^T/, 't' ) } and pins its spot there, and the address is tidied`, async () => {

		const page = await newPage();
		const place = WORLD_SITES[ world ].pages.find( p => p.slug === slug );
		const spot = SPOTS_ON[ world ].find( s => s.id === place.spot );
		await page.goto( `${ server.base }/${ world }/${ place.slug }/` );
		await page.locator( 'a.go' ).click();
		await page.waitForFunction( ( [ id, world ] ) => window.drive?.mode === 'globe' && window.drive.world === world && window.drive.panel.pinned?.id === id && ! window.drive.globe.flight, [ spot.id, world ], { timeout: 120000 } );
		const pin = await page.evaluate( () => {

			const { lat, lon, world } = window.drive.globe.pin;
			return { lat, lon, world, name: document.querySelector( '.pin-card .name' ).textContent, card: ! document.querySelector( '.pin-card' ).hidden };

		} );
		assert.deepEqual( pin, { lat: spot.lat, lon: spot.lon, world, name: spot.name, card: true } );
		// It never drops in by itself, and the place is out of the address.
		assert.equal( await page.evaluate( () => window.drive.mode ), 'globe' );
		assert.equal( new URL( page.url() ).search, '' );
		if ( SHOTS ) await page.screenshot( { path: join( SHOTS, `seo-${ world }-link.png` ) } );
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

	test( 'the dev server makes the same pages: the places, the list, the Moon\'s and Mars\'s, the sitemap, the home page\'s lists; each world\'s files pass through', async () => {

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
			assert.match( sitemap, /<loc>https:\/\/worlddrive\.app\/mars\/<\/loc>/ );
			assert.match( sitemap, /<loc>https:\/\/worlddrive\.app\/mars\/korolev\/<\/loc>/ );
			const home = await ( await fetch( `${ base }/` ) ).text();
			assert.match( home, /<li><a href="\/drive\/copacabana\/" data-play="\/\?at=[^"]+">Copacabana<\/a><\/li>/ );
			assert.match( home, /<li><a href="\/moon\/tycho\/" data-play="\/\?spot=moon-tycho">Tycho crater<\/a><\/li>/ );
			assert.match( home, /<li><a href="\/mars\/jezero\/" data-play="\/\?spot=mars-perseverance">Jezero crater<\/a><\/li>/ );

			// The Moon's pages at /moon/ and /moon/<slug>/, and every other /moon/ address (the files the
			// game fetches) passed on untouched.
			assert.match( await ( await fetch( `${ base }/moon/` ) ).text(), /<h1>Drive on the Moon<\/h1>/ );
			const tycho = await fetch( `${ base }/moon/tycho/` );
			assert.equal( tycho.status, 200 );
			assert.equal( titleOf( await tycho.text() ), 'Drive Tycho Crater on the Moon in 3D – World Drive' );
			const moonBare = await fetch( `${ base }/moon/tycho`, { redirect: 'manual' } );
			assert.deepEqual( [ moonBare.status, moonBare.headers.get( 'location' ) ], [ 307, '/moon/tycho/' ] );
			// And Mars's at /mars/ and /mars/<slug>/ (not the game's page, which Vite would answer any
			// address it doesn't know with), its files passed on as the Moon's are.
			const marsHub = await fetch( `${ base }/mars/` );
			assert.equal( marsHub.status, 200 );
			assert.match( await marsHub.text(), /<h1>Drive on Mars<\/h1>/ );
			const korolev = await fetch( `${ base }/mars/korolev/` );
			assert.equal( korolev.status, 200 );
			assert.equal( titleOf( await korolev.text() ), 'Drive Korolev, the Crater on Mars Filled With Ice – World Drive' );
			const marsBare = await fetch( `${ base }/mars/korolev`, { redirect: 'manual' } );
			assert.deepEqual( [ marsBare.status, marsBare.headers.get( 'location' ) ], [ 307, '/mars/korolev/' ] );
			for ( const [ path, size ] of Object.entries( WORLD_FILES ) ) {

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

	test( 'the challenges are a chunk of their own, script and styles: nothing of them in the page\'s first load, only fetched when they\'re opened', () => {

		const assets = readdirSync( join( DIST, 'assets' ) );
		const chunk = assets.find( name => /^challenges-[\w-]+\.js$/.test( name ) );
		const styles = assets.find( name => /^challenges-[\w-]+\.css$/.test( name ) );
		assert.ok( chunk && styles, assets.join( ' ' ) );
		const html = readFileSync( join( DIST, 'index.html' ), 'utf8' );
		assert.ok( ! html.includes( chunk ) && ! html.includes( styles ) && ! /assets\/challenges-/.test( html ), 'the page itself asks for them' );
		// The page's first script and the game's own: the chunk only named (imported when opened), none
		// of its words or its styles in them.
		const read = name => readFileSync( join( DIST, 'assets', name ), 'utf8' );
		const game = assets.filter( name => /^(main|index)-[\w-]+\.(js|css)$/.test( name ) );
		assert.ok( game.length >= 3, game.join( ' ' ) );
		for ( const name of game ) {

			const text = read( name );
			for ( const word of [ 'Needs an Earth drive', 'Pausing ends a run', 'ch-finish', 'ch-hud', 'Checkpoint sprint', 'Challenge a friend', 'time to beat', 'ch-ghost', 'Race their ghost', 'world-drive.ghost' ] ) assert.ok( ! text.includes( word ), `${ name } has "${ word }"` );

		}

		assert.ok( game.some( name => name.endsWith( '.js' ) && read( name ).includes( chunk ) ), 'the game never imports the chunk' );
		assert.match( read( chunk ), /Needs an Earth drive/ );
		// (Its ghosts and links with it: the share, the link's card, the ghost's button.)
		for ( const word of [ 'Challenge a friend', 'time to beat', 'world-drive.ghost' ] ) assert.ok( read( chunk ).includes( word ), word );

	} );

	test( 'the orrery (the worlds to pick from) is a chunk of its own, script and styles, with its pictures under /orrery/: nothing of it in the page\'s first load', () => {

		const assets = readdirSync( join( DIST, 'assets' ) );
		const chunk = assets.find( name => /^orrery-[\w-]+\.js$/.test( name ) );
		const styles = assets.find( name => /^orrery-[\w-]+\.css$/.test( name ) );
		assert.ok( chunk && styles, assets.join( ' ' ) );
		const html = readFileSync( join( DIST, 'index.html' ), 'utf8' );
		assert.ok( ! /assets\/orrery-/.test( html ) && ! /\/orrery\//.test( html ), 'the page itself asks for it' );
		// Only its empty dialog in the page, and the Worlds button that opens it.
		assert.match( html, /<dialog id="orrery" class="orrery" aria-labelledby="orrery-title" tabindex="-1"><\/dialog>/ );
		assert.match( html, /<button type="button" class="worlds-open"[^>]*aria-haspopup="dialog" aria-controls="orrery"/ );
		const read = name => readFileSync( join( DIST, 'assets', name ), 'utf8' );
		const game = assets.filter( name => /^(main|index)-[\w-]+\.(js|css)$/.test( name ) );
		for ( const name of game ) {

			const text = read( name );
			for ( const word of [ 'Worlds you can drive on', 'not in the game yet', 'no ground to drive on', 'orrery-sheet', 'Saturn' ] ) assert.ok( ! text.includes( word ), `${ name } has "${ word }"` );

		}

		assert.ok( game.some( name => name.endsWith( '.js' ) && read( name ).includes( chunk ) ), 'the game never imports the chunk' );
		assert.match( read( chunk ), /Worlds you can drive on/ );
		// Its pictures: the five worlds', and Vesta's and Ceres's shapes (1°, 360 × 180 Int16).
		for ( const id of [ 'earth', 'moon', 'mars', 'vesta', 'ceres' ] ) assert.ok( existsSync( join( DIST, 'orrery', `${ id }.webp` ) ), id );
		for ( const id of [ 'vesta', 'ceres' ] ) assert.equal( statSync( join( DIST, 'orrery', `${ id }-height.bin` ) ).size, 360 * 180 * 2, id );

	} );

	test( 'the achievements\' grid is a chunk of its own, script and styles, and the construction rides\' models and pictures nothing the page loads first', () => {

		const assets = readdirSync( join( DIST, 'assets' ) );
		const chunk = assets.find( name => /^achievements-[\w-]+\.js$/.test( name ) );
		const styles = assets.find( name => /^achievements-[\w-]+\.css$/.test( name ) );
		assert.ok( chunk && styles, assets.join( ' ' ) );
		const html = readFileSync( join( DIST, 'index.html' ), 'utf8' );
		assert.ok( ! /assets\/achievements-/.test( html ), 'the page itself asks for them' );
		const read = name => readFileSync( join( DIST, 'assets', name ), 'utf8' );
		const game = assets.filter( name => /^(main|index)-[\w-]+\.(js|css)$/.test( name ) );
		for ( const name of game ) {

			const text = read( name );
			for ( const word of [ 'Earned ', 'Unlocks the ', 'Pick a nickname to earn them', '#achievements' ] ) assert.ok( ! text.includes( word ), `${ name } has "${ word }"` );

		}

		assert.ok( game.some( name => name.endsWith( '.js' ) && read( name ).includes( chunk ) ), 'the game never imports the chunk' );
		assert.match( read( chunk ), /Unlocks the / );
		// The rides' models and pictures are published, and named only in library.json and the game's
		// list of them: no page asks for one before it's picked.
		const library = JSON.parse( readFileSync( join( DIST, 'library', 'library.json' ), 'utf8' ) );
		for ( const id of WORKS_RIDES ) {

			const item = library.find( entry => entry.id === id );
			assert.ok( item && existsSync( join( DIST, 'library', item.file ) ) && existsSync( join( DIST, 'works', `${ id }.webp` ) ), id );
			assert.ok( ! html.includes( item.file ), `${ id }'s model in the page` );

		}

		// library.json is fetched as the page starts: only what the page reads of each.
		assert.ok( library.every( item => ! ( 'triangles' in item ) && ! ( 'category' in item ) && ! ( 'own' in item ) ) );

	} );

} );
