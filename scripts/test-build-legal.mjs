// npm run test:build-legal: World Drive Build's legal pages and its promise of no tracking
// (docs/build.md, "Privacy and cookies"). It builds the site (npm run build:drive, into dist-drive/;
// TEST_SEO_DIST=<folder> checks one already built there instead) and reads what's built, without a
// browser or a server:
//   - the Terms, Privacy Policy, Refunds and cancelling, Acceptable Use and Credits at /build/terms/
//     and the rest (drive/site/legal.js's buildLegalPages), kept out of search, each saying what the
//     owner decided (the price, 18 and over for work, the refund terms, the auto-renewal, Google's
//     terms, the planning-aid disclaimer, the liability cap, the law) with the contact details from
//     the environment, never made up;
//   - the Privacy Policy's "Cookies and storage" naming the one cookie and every key the editor keeps
//     in localStorage, checked against the code, so a new key can't ship unlisted;
//   - the credits listing every model in public/library/CREDITS.md;
//   - the dashboard's footer and sign-in line, and the game's pages pointing Build users to Build's;
//   - and nothing in any built Build page or its code that tracks or would need a consent banner:
//     no Google Analytics or Tag Manager, ad tags, Meta or LinkedIn pixels, Hotjar, Clarity or other
//     session replay, nor Google Fonts (the dashboard's fonts are its own).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { before, describe, test } from 'node:test';
import { BUILD_LEGAL_PATHS, buildSitePages } from '../drive/site/build.js';
import { BUILD_COOKIE, BUILD_STORAGE, buildSalesOn, creditEntries, NOT_IN_BUILD_STORAGE } from '../drive/site/legal.js';

const require = createRequire( import.meta.url );
const ROOT = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
const DIST = process.env.TEST_SEO_DIST || join( ROOT, 'dist-drive' );
// What a tracking or advertising tag, or a font from Google, looks like in a page or its code.
const TRACKING = /googletagmanager|google-analytics\.com|\bgtag\(|\bfbq\(|connect\.facebook\.net|adsbygoogle|googlesyndication|doubleclick|snap\.licdn|hotjar|clarity\.ms|fullstory|logrocket|mouseflow|smartlook|fonts\.googleapis|fonts\.gstatic/i;

const decode = text => text.replace( /&quot;/g, '"' ).replace( /&#39;/g, '\'' ).replace( /&lt;/g, '<' ).replace( /&gt;/g, '>' ).replace( /&amp;/g, '&' );
const textOf = html => decode( html.replace( /<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, ' ' ).replace( /<[^>]+>/g, ' ' ) ).split( /\s+/ ).filter( Boolean ).join( ' ' );
const linksOf = html => [ ...html.matchAll( /<a\s[^>]*href="([^"]+)"/g ) ].map( match => decode( match[ 1 ] ) );
const built = path => readFileSync( join( DIST, path.replace( /^\//, '' ), 'index.html' ), 'utf8' );

// Every file under a folder, as paths relative to it.
function filesUnder( dir ) {

	const found = [];
	const walk = folder => {

		for ( const name of readdirSync( folder ) ) {

			const file = join( folder, name );
			if ( statSync( file ).isDirectory() ) walk( file );
			else found.push( relative( dir, file ) );

		}

	};

	walk( dir );
	return found;

}

before( () => {

	if ( process.env.TEST_SEO_DIST ) return;
	// Never a Maps key in the build: blank every name it's read from.
	const noKey = Object.fromEntries( [ 'GOOGLE_API', 'google_api', 'GOOGLE_MAPS_API_KEY', 'VITE_GOOGLE_MAPS_API_KEY', 'GOOGLE_MAPS_KEY', 'GOOGLE_MAPS_API' ].map( name => [ name, '' ] ) );
	const vite = join( dirname( require.resolve( 'vite/package.json' ) ), 'bin', 'vite.js' );
	// Built as it ships by default: buying hidden (BUILD_SALES not 'on', whatever .env files say).
	const run = spawnSync( process.execPath, [ vite, 'build', '--config', 'vite.drive.config.js', '--logLevel', 'error' ], { cwd: ROOT, env: { ...process.env, ...noKey, BUILD_SALES: 'off' }, encoding: 'utf8' } );
	assert.equal( run.status, 0, `npm run build:drive failed:\n${ run.stdout }\n${ run.stderr }` );

} );

describe( 'World Drive Build\'s legal pages', () => {

	test( 'each is built at /build/<page>/, kept out of search, titled, and links to all the others and back to Build', () => {

		assert.deepEqual( BUILD_LEGAL_PATHS, [ 'terms', 'privacy', 'refunds', 'acceptable-use', 'credits' ] );
		for ( const slug of BUILD_LEGAL_PATHS ) {

			const path = `/build/${ slug }/`;
			const html = built( path );
			assert.match( html, /<meta name="robots" content="noindex, nofollow" \/>/, path );
			assert.match( html, /<title>[^<]+ – World Drive Build<\/title>/, path );
			assert.equal( ( html.match( /<h1>/g ) ?? [] ).length, 1, path );
			const links = linksOf( html );
			for ( const other of BUILD_LEGAL_PATHS ) assert.ok( links.includes( `/build/${ other }/` ), `${ path } doesn't link to /build/${ other }/` );
			assert.ok( links.includes( '/build/' ), `${ path } doesn't link back to Build` );
			// Every link within the site goes to a page that's built.
			for ( const href of links.filter( link => link.startsWith( '/' ) ) ) {

				const local = href.split( /[?#]/ )[ 0 ];
				assert.ok( local === '/' || existsSync( join( DIST, local, 'index.html' ) ), `${ path } links to ${ href }, which isn't built` );

			}

			// Not in the sitemap while /build/ is out of search.
			assert.ok( ! readFileSync( join( DIST, 'sitemap.xml' ), 'utf8' ).includes( path ), `${ path } is in the sitemap` );

		}

	} );

	// With BUILD_SALES 'on' (as the Worker's): the pages as they'd be built with Build Pro for sale.
	const onSale = slug => textOf( buildSitePages( { sales: true } ).find( p => p.path === `/build/${ slug }/` ).html );

	test( 'the Terms say what the owner decided: 18 and over for work, one named user, Google\'s terms, a planning aid, the cap, and the law; on sale, the price and auto-renewal', () => {

		// The build reads BUILD_SALES as the Worker's salesOn does: 'on', any case, else hidden.
		assert.equal( buildSalesOn( { BUILD_SALES: ' On ' } ), true );
		for ( const value of [ undefined, '', 'off', 'yes', 'true' ] ) assert.equal( buildSalesOn( { BUILD_SALES: value } ), false );
		const sale = onSale( 'terms' );
		for ( const words of [
			'US$5 a month or US$50 a year', 'Build Pro renews automatically', 'until you cancel', 'stays until the end of the period you\'ve paid for',
			'a full refund within 14 days of your first charge', 'A refund or a chargeback ends Build Pro at once', 'There\'s no free trial',
			'tick the box accepting them at checkout', 'Each Build Pro subscription is for one named person',
		] ) assert.ok( sale.includes( words ), `the Terms on sale don't say "${ words }"` );
		const terms = textOf( built( '/build/terms/' ) );
		for ( const words of [
			'You must be 18 or older', 'business and professional use', 'for one named person',
			'By using Build you agree to the Google Maps/Google Earth Additional Terms of Service and the Google Privacy Policy',
			'Never remove, hide or crop Google\'s logo', 'AI training data', 'indicative visualisations only', 'WorkSafeBC', 'qualified professional',
			'Claude (from Anthropic)', 'share link', 'logo', 'never deleted without telling you', 'for 30 days',
			'the greater of what you paid us in the 12 months before the claim and US$100',
			'laws of British Columbia', 'keep the protection of the consumer laws where you live', 'There\'s no arbitration',
			'a sole proprietor', 'aren\'t legal, engineering or other professional advice',
		] ) assert.ok( terms.includes( words ), `the Terms don't say "${ words }"` );
		assert.ok( linksOf( built( '/build/terms/' ) ).includes( 'https://maps.google.com/help/terms_maps/' ) );
		assert.ok( linksOf( built( '/build/terms/' ) ).includes( 'https://policies.google.com/privacy' ) );
		// Nothing sold that the owner decided against.
		for ( const text of [ terms, sale ] ) assert.ok( ! /per seat|founding|unlimited projects/i.test( text ) );
		// Buying hidden (as built: BUILD_SALES unset): the plans and their limits, but no price,
		// checkout or renewal, and it says Build Pro isn't for sale.
		for ( const words of [ '35 everyday library items, 15 3D map views a month and 1 saved project', 'Build Pro isn\'t for sale just now', 'using Build costs nothing' ] ) assert.ok( terms.includes( words ), `the Terms don't say "${ words }"` );
		assert.ok( ! /US\$5\b|US\$50\b|a month or|checkout|renews automatically|renewal|subscription/i.test( terms ), `the Terms talk about buying while it's hidden: ${ terms.match( /[^.]*(US\$5\b|US\$50\b|a month or|checkout|renews automatically|renewal|subscription)[^.]*/i )?.[ 0 ] }` );
		assert.ok( ! /buying Build Pro|renewal/i.test( built( '/build/terms/' ).match( /<meta name="description" content="([^"]*)"/ )[ 1 ] ) );

	} );

	test( 'Refunds and cancelling: online, at the end of the period, 14 days from the first charge, renewals only for errors, and nothing deleted; hidden, nothing to pay for', () => {

		const hidden = textOf( built( '/build/refunds/' ) );
		for ( const words of [
			'Build Pro isn\'t for sale just now, so there\'s nothing to pay for, cancel or refund', 'If you\'ve paid before',
			'A full refund within 14 days of your first charge, on request, no questions asked', 'never deleted without telling you',
		] ) assert.ok( hidden.includes( words ), `Refunds doesn't say "${ words }"` );
		assert.ok( ! /US\$|a month or|renews|renewal|checkout|subscri/i.test( hidden ), `Refunds talks about buying while it's hidden: ${ hidden.match( /[^.]*(US\$|a month or|renews|renewal|checkout|subscri)[^.]*/i )?.[ 0 ] }` );
		const refunds = onSale( 'refunds' );
		for ( const words of [
			'Cancel at any time, online', 'Build Pro stays until the end of the month or year you\'ve paid for',
			'Within 14 days of your first charge: a full refund on request, no questions asked',
			'aren\'t refunded, except a charge made in error, a duplicate charge, or where the law where you live requires it',
			'A refund ends Build Pro at once', 'So does a chargeback', 'can still open and edit them', 'never deleted without telling you',
			'Build Pro is US$5 a month or US$50 a year, and renews automatically until you cancel',
		] ) assert.ok( refunds.includes( words ), `Refunds on sale doesn't say "${ words }"` );

	} );

	test( 'the Privacy Policy names who\'s responsible (and Quebec\'s privacy officer), what\'s kept, who handles it, how long, and the rights', () => {

		const privacy = textOf( built( '/build/privacy/' ) );
		for ( const words of [
			'person in charge of the protection of personal information', 'Law 25',
			'Cloudflare', 'Google', 'Stripe', 'OpenStreetMap', 'Anthropic', 'never sees your IP address',
			'Payment records: six years', 'up to 13 months', 'within 30 days', 'Office of the Privacy Commissioner of Canada',
			'Commission d\'accès à l\'information', 'nothing is sold or shared', 'admin page', 'Build is for people 18 and over',
		] ) assert.ok( privacy.includes( words ), `the Privacy Policy doesn't say "${ words }"` );

	} );

	test( 'Cookies and storage: the one cookie, and every key the editor keeps in localStorage, as the code has them', () => {

		const html = built( '/build/privacy/' );
		assert.match( html, /<h2 id="cookies">Cookies and storage<\/h2>/ );
		const privacy = textOf( html );
		assert.match( privacy, new RegExp( `one cookie ?: ${ BUILD_COOKIE.name }` ) );
		assert.ok( privacy.includes( 'no cookie banner' ) );
		assert.ok( privacy.includes( 'Cloudflare Web Analytics, which uses no cookies' ) );
		// The cookie is the one the Worker sets: accounts.js's 'wd_session', with __Host- on worlddrive.app.
		assert.match( readFileSync( join( ROOT, 'worker', 'drive', 'accounts.js' ), 'utf8' ), /sessionCookies\( 'wd_session' \)/ );
		assert.equal( BUILD_COOKIE.name, '__Host-wd_session' );
		// Every key the construction app's code keeps (the game's own, src/drive-app/, isn't Build):
		// each file that uses localStorage names its keys, ${ SITE.name } standing for a site.
		const listed = BUILD_STORAGE.map( ( [ key ] ) => key );
		const found = new Set();
		for ( const file of filesUnder( join( ROOT, 'src' ) ).filter( file => file.endsWith( '.js' ) && ! file.startsWith( 'drive-app' ) ) ) {

			const code = readFileSync( join( ROOT, 'src', file ), 'utf8' );
			if ( ! code.includes( 'localStorage' ) ) continue;
			const keys = [ ...code.matchAll( /['`]((?:neptune-twin|world-drive-build|twin|drive)\.[\w.${ }-]+)['`]/g ) ].map( match => match[ 1 ].replace( /\$\{ SITE\.name \}/, '<site>' ) );
			assert.ok( keys.length, `src/${ file } uses localStorage, but no key this test knows how to find: list it in legal.js's BUILD_STORAGE` );
			for ( const key of keys ) found.add( key );

		}

		for ( const key of found ) assert.ok( listed.includes( key ) || NOT_IN_BUILD_STORAGE.includes( key ), `${ key } is kept in localStorage but isn't in the Privacy Policy (legal.js's BUILD_STORAGE)` );
		for ( const key of listed ) {

			assert.ok( found.has( key ), `${ key } is in the Privacy Policy but the code doesn't keep it any more` );
			assert.ok( privacy.includes( key ), `the Privacy Policy doesn't list ${ key }` );

		}

		// The dashboard keeps nothing in the browser.
		assert.ok( ! readFileSync( join( ROOT, 'src', 'build-home', 'main.js' ), 'utf8' ).includes( 'localStorage' ) );

	} );

	test( 'Acceptable use and credits: the rules, and every model in public/library/CREDITS.md with its author and licence', () => {

		const rules = textOf( built( '/build/acceptable-use/' ) );
		for ( const words of [ 'Copy Google\'s map', 'Get round the limits', 'official Claude connector', 'confidential site plans', 'Resell it', 'AI training sets', 'suspended or closed' ] ) assert.ok( rules.includes( words ), `Acceptable use doesn't say "${ words }"` );
		const markdown = readFileSync( join( ROOT, 'public', 'library', 'CREDITS.md' ), 'utf8' );
		const entries = creditEntries( markdown );
		assert.ok( entries.length >= 80, `only ${ entries.length } credits` );
		const html = built( '/build/credits/' );
		assert.equal( ( html.match( /<ul class="credits">[\s\S]*?<\/ul>/ )[ 0 ].match( /<li>/g ) ?? [] ).length, entries.length );
		assert.ok( html.includes( '<a href="https://creativecommons.org/licenses/by/4.0/">CC Attribution</a>' ) );
		assert.ok( textOf( html ).includes( 'map data © Google and its data providers' ) );
		assert.ok( ! /\*\*|\]\(/.test( html ), 'markdown left in the credits page' );

	} );

	test( 'the contact details come from the environment, never made up', () => {

		const page = ( contact, slug ) => buildSitePages( { contact } ).find( p => p.path === `/build/${ slug }/` ).html;
		const bare = BUILD_LEGAL_PATHS.map( slug => page( { name: '', address: '', phone: '', email: '' }, slug ) ).join( '' );
		assert.ok( ! /undefined|mailto:|tel:/.test( bare ) );
		assert.ok( textOf( bare ).includes( 'its owner, a sole proprietor in Vancouver, British Columbia, Canada' ) );
		const set = { name: 'Pat Example', address: 'PO Box 123, Vancouver BC', phone: '', email: 'help@example.com' };
		const terms = page( set, 'terms' );
		assert.match( terms, /Pat Example, a sole proprietor in Vancouver/ );
		assert.match( terms, /<dt>Mail<\/dt><dd>PO Box 123, Vancouver BC<\/dd>/ );
		assert.match( page( set, 'privacy' ), /protection of personal information \(as Quebec's Law 25 asks\) is Pat Example/ );
		assert.ok( ! /tel:/.test( terms ) );
		// As built: the defaults (Tom, support@worlddrive.app) unless the environment set them.
		assert.match( built( '/build/refunds/' ), /<dt>Email<\/dt><dd><a href="mailto:[^"]+">/ );

	} );

	test( 'the dashboard\'s footer links to them all and its sign-in says signing in accepts the Terms; the game\'s own policies stay the game\'s, with no link to Build\'s', () => {

		const home = built( '/build/' );
		for ( const slug of BUILD_LEGAL_PATHS ) assert.ok( linksOf( home ).includes( `/build/${ slug }/` ), `the dashboard doesn't link to /build/${ slug }/` );
		assert.match( home, /<div id="google-button" class="google-button"><\/div>\s*<p class="agree-note">By continuing you agree to the <a href="\/build\/terms\/">Terms<\/a> and <a href="\/build\/privacy\/">Privacy Policy<\/a>\.<\/p>/ );
		for ( const path of [ '/privacy/', '/terms/', '/refunds/' ] ) {

			const links = linksOf( built( path ) );
			assert.ok( ! links.some( link => link.startsWith( '/build/' ) ), `${ path } links to Build, which is kept apart from the game` );

		}

	} );

} );

describe( 'no tracking on Build', () => {

	test( 'no analytics or ad tags, pixels, session replay or Google Fonts in any built Build page or its code (adding one needs a consent banner first)', () => {

		const files = filesUnder( join( DIST, 'build' ) ).filter( file => /\.(html|js|mjs|css)$/.test( file ) );
		assert.ok( files.some( file => file === 'index.html' ) && files.some( file => file === join( 'app', 'index.html' ) ) );
		for ( const file of files ) {

			const found = readFileSync( join( DIST, 'build', file ), 'utf8' ).match( TRACKING );
			assert.equal( found, null, `build/${ file } has ${ found?.[ 0 ] }: Build is cookieless and untracked (docs/build.md, "Privacy and cookies")` );

		}

		// The dashboard's fonts are served from the site itself.
		assert.ok( filesUnder( join( DIST, 'build', 'home' ) ).some( file => file.endsWith( '.woff2' ) ), 'the dashboard\'s fonts aren\'t in the build' );

	} );

} );
