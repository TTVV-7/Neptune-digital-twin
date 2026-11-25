import { cpSync, createReadStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as viteBuild, defineConfig, loadEnv } from 'vite';
import { GOOGLE_KEY_NAMES } from './vite.config.js';
import { LIBRARY_VEHICLES, WORKS_RIDES } from './src/drive-app/catalog.js';
import { buildSitePages, driveSite } from './drive/site/build.js';
import { CONTACT_VARS, contactDetails } from './drive/site/legal.js';

// World Drive (worlddrive.app, docs/world-drive.md): its own page, drive/index.html with
// src/drive-app/boot.js (which loads main.js), sharing src/ with the construction app, and its
// places' pages and each other world's (drive/site/). `npm run build:drive` builds it into
// dist-drive/ for its own Worker (wrangler.drive.jsonc, worker/drive/).
//
// The built site never holds a Maps key. On worlddrive.app the Worker hands the key out once per
// visit, after a Turnstile check and within the daily caps, so a key in the site would get round
// both. Only the dev server (`npm run dev:drive`) takes one from the environment, under the same
// names as vite.config.js, to drive on Google's tiles without a Worker; DRIVE_API=http://localhost:8790
// sends /api to a local Worker instead (`npm run dev:drive-api`), which then decides as it would live.

const ROOT = dirname( fileURLToPath( import.meta.url ) );
const PUBLIC = join( ROOT, 'public' );
const TYPES = { '.svg': 'image/svg+xml', '.json': 'application/json', '.glb': 'model/gltf-binary', '.webp': 'image/webp' };

export default defineConfig( ( { command, mode } ) => {

	const env = loadEnv( mode, ROOT, '' );
	const byName = new Map( Object.entries( env ).map( ( [ name, value ] ) => [ name.toLowerCase(), value ] ) );
	const envKey = GOOGLE_KEY_NAMES.map( name => byName.get( name.toLowerCase() ) ).find( Boolean ) ?? '';
	const api = env.DRIVE_API;
	// Who runs World Drive, for the contact page and policies (drive/site/legal.js), from .env files
	// too, not only the shell's environment.
	for ( const name of Object.values( CONTACT_VARS ) ) if ( env[ name ] && ! process.env[ name ] ) process.env[ name ] = env[ name ];
	// Whether Build's Terms and Refunds offer Build Pro for sale (legal.js's buildSalesOn): 'on' as the
	// Worker's BUILD_SALES is, from .env files too. Unset, they say nothing about buying.
	if ( env.BUILD_SALES && ! process.env.BUILD_SALES ) process.env.BUILD_SALES = env.BUILD_SALES;

	return {
		root: join( ROOT, 'drive' ),
		envDir: ROOT,
		// Nothing from the environment reaches the page by its name: not even VITE_GOOGLE_MAPS_API_KEY,
		// which Vite would otherwise hand to any code reading import.meta.env.
		envPrefix: 'WORLD_DRIVE_PUBLIC_',
		// public/ holds the whole construction library (35 MB): World Drive publishes its few files from
		// there itself (publishFromLibrary). Its own, the cars (scripts/add-drive-car.mjs), are in
		// drive/public/, which only this build publishes.
		publicDir: join( ROOT, 'drive', 'public' ),
		base: '/',
		// TEST_VITE_CACHE: a folder of its own for the dev server's pre-bundled dependencies (else
		// node_modules/.vite), so dev servers for tests running side by side don't redo each other's.
		cacheDir: process.env.TEST_VITE_CACHE || undefined,
		// The page is drive/index.html, but its code is in src/ beside the construction app's, as
		// /src/... like that app's page has it.
		resolve: { alias: [ { find: /^\/src\//, replacement: `${ join( ROOT, 'src' ) }/` } ] },
		// three.js alone is ~600 kB, so the default 500 kB warning is just noise here.
		build: { outDir: join( ROOT, 'dist-drive' ), emptyOutDir: true, chunkSizeWarningLimit: 1500 },
		// ws: driving with others' rooms (/api/live) are WebSockets, which the proxy passes on too.
		server: api ? { proxy: { '/api': { target: api, ws: true } }, watch: { ignored: [ '**/.wrangler/**' ] } } : {},
		define: {
			__DEV_MAPS_KEY__: JSON.stringify( command === 'serve' ? envKey : '' ),
		},
		// driveSite: the places' pages, /drive/, the Moon's and Mars's pages (/moon/, /mars/: each world
		// in worlds.js's OFF_EARTH, beside its files from drive/public/<world>/) and /sitemap.xml, for
		// search engines (drive/site/).
		plugins: [ publishFromLibrary(), driveSite(), keyStaysOut( envKey ), ...command === 'build' ? [ cityDrive(), buildApp() ] : [] ],
	};

} );

// The files the World Drive page loads from public/: the Google Maps logo, and the offered
// vehicles' models and pictures with a library.json listing just them: the pickup, and the
// construction rides (whose pictures are drawn for World Drive, into drive/public/works/, so the
// library's own aren't published). library.json keeps only what the page reads of each, as it's
// fetched as the page starts. The dev server serves them from public/; the build copies them into
// dist-drive/.
function publishFromLibrary() {

	function files() {

		const library = JSON.parse( readFileSync( join( PUBLIC, 'library', 'library.json' ), 'utf8' ) );
		const items = [ ...LIBRARY_VEHICLES, ...WORKS_RIDES ].map( id => {

			const item = library.find( entry => entry.id === id );
			if ( ! item ) throw new Error( `World Drive: ${ id } isn't in public/library/library.json` );
			const { name, file, thumb, front, scale, dimensions, source, drive } = item;
			return { id, name, file, ...WORKS_RIDES.includes( id ) ? {} : { thumb }, front, scale, dimensions, ...source ? { source } : {}, ...drive ? { drive } : {} };

		} );
		const published = new Map( [ [ 'google-maps-logo.svg', null ], [ 'library/library.json', JSON.stringify( items ) ] ] );
		for ( const item of items ) {

			published.set( `library/${ item.file }`, null );
			if ( item.thumb ) published.set( `library/${ item.thumb }`, null );

		}

		return published;

	}

	return {
		name: 'world-drive-library',
		configureServer( server ) {

			const published = files();
			server.middlewares.use( ( req, res, next ) => {

				const path = decodeURIComponent( ( req.url ?? '' ).split( '?' )[ 0 ] ).replace( /^\//, '' );
				if ( ! published.has( path ) ) return next();
				res.setHeader( 'Content-Type', TYPES[ extname( path ) ] ?? 'application/octet-stream' );
				const text = published.get( path );
				if ( text !== null ) res.end( text );
				else createReadStream( join( PUBLIC, path ) ).pipe( res );

			} );

		},
		generateBundle() {

			for ( const [ fileName, text ] of files() ) {

				this.emitFile( { type: 'asset', fileName, source: text ?? readFileSync( join( PUBLIC, fileName ) ) } );

			}

		},
	};

}

// A last check on the build: if there's a Maps key in the environment, it must not be anywhere
// in what's about to be published.
function keyStaysOut( key ) {

	return {
		name: 'world-drive-key-stays-out',
		apply: 'build',
		generateBundle( options, bundle ) {

			if ( ! key ) return;
			for ( const file of Object.values( bundle ) ) {

				const text = file.type === 'chunk' ? file.code : typeof file.source === 'string' ? file.source : '';
				if ( text.includes( key ) ) this.error( `The Maps key ended up in ${ file.fileName }; World Drive's build must never hold it.` );

			}

		},
	};

}

// City Drive (/city/, drive/city/index.html: a city built from OpenStreetMap, src/drive-app/city/),
// built after the game in a build of its own into dist-drive/city/, so the game's page and its
// chunks are exactly as they'd be without it (two pages in one build would split what they share
// into chunks of their own). The dev server serves it as it is, from drive/city/.
function cityDrive() {

	return {
		name: 'world-drive-city',
		apply: 'build',
		async closeBundle() {

			await viteBuild( {
				configFile: false,
				root: join( ROOT, 'drive', 'city' ),
				base: '/city/',
				publicDir: false,
				logLevel: 'warn',
				resolve: { alias: [ { find: /^\/src\//, replacement: `${ join( ROOT, 'src' ) }/` } ] },
				define: { __DEV_MAPS_KEY__: '""' },
				build: { outDir: join( ROOT, 'dist-drive', 'city' ), emptyOutDir: true, chunkSizeWarningLimit: 1500 },
			} );

		},
	};

}

// Cloudflare Web Analytics on World Drive Build's editor (/build/app/), as on its dashboard
// (drive/build/index.html) and the game (drive/index.html): World Drive's own site's token, only on
// worlddrive.app. The editor's page is the Neptune twin's index.html, whose beacon is the twin's own
// site's (its token, on any https host): that one is swapped for this, or the editor's visits would
// count as the twin's. No cookies, nothing kept in the browser.
const BUILD_BEACON = `<script>
			// Cloudflare Web Analytics (no cookies): World Drive's, only on worlddrive.app itself, so local
			// development and tests aren't counted (vite.drive.config.js's withBuildBeacon).
			if ( location.hostname === 'worlddrive.app' ) {

				const beacon = document.createElement( 'script' );
				beacon.defer = true;
				beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
				beacon.dataset.cfBeacon = '{"token": "f788bd8a2fb34dc2a64001b4ebab52c2"}';
				document.head.append( beacon );

			}
		</script>`;

// The editor's page with the twin's beacon swapped for World Drive's (BUILD_BEACON). A page with no
// beacon of the twin's left to swap (index.html changed) fails the build, rather than quietly
// counting the editor somewhere else, or nowhere.
function withBuildBeacon( html ) {

	const twin = /<script>(?:(?!<\/script>)[\s\S])*?cloudflareinsights(?:(?!<\/script>)[\s\S])*<\/script>/;
	if ( ! twin.test( html ) ) throw new Error( 'index.html has no Cloudflare Web Analytics beacon for World Drive Build\'s to replace (vite.drive.config.js, withBuildBeacon)' );
	return html.replace( twin, BUILD_BEACON );

}

// World Drive Build (/build/, docs/build.md): its dashboard at /build/, and the construction mock-up
// app (the repository's own app, index.html and src/main.js) built with --mode worlddrive
// (src/product.js: wherever the project is, Build Pro's gate, its Maps key from World Drive's server,
// worker/drive/build.js) at /build/app/, each in a build of its own as City Drive is. Of public/ it takes only the library
// and what the app itself loads (the Google Maps logo, the walking workers): never public/models'
// own project models.
function buildApp() {

	return {
		name: 'world-drive-build',
		apply: 'build',
		async closeBundle() {

			// Its dashboard first (drive/build/, src/build-home/: finding a site, your projects and
			// plan), at /build/, which empties the folder; then the editor at /build/app/.
			await viteBuild( {
				configFile: false,
				root: join( ROOT, 'drive', 'build' ),
				base: '/build/',
				publicDir: false,
				logLevel: 'warn',
				resolve: { alias: [ { find: /^\/src\//, replacement: `${ join( ROOT, 'src' ) }/` } ] },
				build: { outDir: join( ROOT, 'dist-drive', 'build' ), emptyOutDir: true, assetsDir: 'home' },
			} );
			// Its legal pages (/build/terms/ and the rest, drive/site/legal.js), into the folder that
			// build has just emptied.
			for ( const page of buildSitePages() ) {

				mkdirSync( dirname( join( ROOT, 'dist-drive', page.file ) ), { recursive: true } );
				writeFileSync( join( ROOT, 'dist-drive', page.file ), page.html );

			}

			// The account page (drive/build/account/, src/build-account/: plan and billing, sign-in,
			// connected apps, share links, your data) at /build/account/, after the dashboard, whose
			// build empties /build/. Support's email is legal.js's, as the policies have it.
			await viteBuild( {
				configFile: false,
				root: join( ROOT, 'drive', 'build', 'account' ),
				base: '/build/account/',
				publicDir: false,
				logLevel: 'warn',
				resolve: { alias: [ { find: /^\/src\//, replacement: `${ join( ROOT, 'src' ) }/` } ] },
				define: { __BUILD_SUPPORT_EMAIL__: JSON.stringify( contactDetails().email ) },
				build: { outDir: join( ROOT, 'dist-drive', 'build', 'account' ), emptyOutDir: true, assetsDir: 'assets' },
			} );
			const outDir = join( ROOT, 'dist-drive', 'build', 'app' );
			await viteBuild( {
				configFile: join( ROOT, 'vite.config.js' ),
				root: ROOT,
				mode: 'worlddrive',
				base: '/build/app/',
				publicDir: false,
				logLevel: 'warn',
				build: { outDir, emptyOutDir: true, chunkSizeWarningLimit: 1500 },
				plugins: [ {
					name: 'world-drive-build-page',
					transformIndexHtml: html => withBuildBeacon( html )
						.replace( /<title>[^<]*<\/title>/, '<title>World Drive Build · construction site mock-ups</title>' )
						// Out of search, like the rest of /build/ while it's on trial (its dashboard, account
						// and legal pages are noindex too, and none of it is in the sitemap).
						.replace( '<head>', '<head>\n\t\t<meta name="robots" content="noindex, nofollow" />\n\t\t<meta name="description" content="Lay out a construction site on a 3D map of anywhere: real-scale equipment, trailers, barriers and earthworks, in your browser." />' ),
				} ],
			} );
			cpSync( join( PUBLIC, 'library' ), join( outDir, 'library' ), { recursive: true } );
			cpSync( join( PUBLIC, 'google-maps-logo.svg' ), join( outDir, 'google-maps-logo.svg' ) );
			for ( const file of [ 'player-worker.glb', 'player-worker-2.glb' ] ) cpSync( join( PUBLIC, 'models', file ), join( outDir, 'models', file ) );

		},
	};

}
