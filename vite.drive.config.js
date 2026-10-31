import { createReadStream, readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { GOOGLE_KEY_NAMES } from './vite.config.js';
import { LIBRARY_VEHICLES } from './src/drive-app/catalog.js';

// World Drive (worlddrive.app, docs/world-drive.md): its own page, drive/index.html with
// src/drive-app/main.js, sharing src/ with the construction app. `npm run build:drive` builds it
// into dist-drive/ for its own Worker (wrangler.drive.jsonc, worker/drive/).
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
		// The page is drive/index.html, but its code is in src/ beside the construction app's, as
		// /src/... like that app's page has it.
		resolve: { alias: [ { find: /^\/src\//, replacement: `${ join( ROOT, 'src' ) }/` } ] },
		// three.js alone is ~600 kB, so the default 500 kB warning is just noise here.
		build: { outDir: join( ROOT, 'dist-drive' ), emptyOutDir: true, chunkSizeWarningLimit: 1500 },
		server: api ? { proxy: { '/api': { target: api } }, watch: { ignored: [ '**/.wrangler/**' ] } } : {},
		define: {
			__DEV_MAPS_KEY__: JSON.stringify( command === 'serve' ? envKey : '' ),
		},
		plugins: [ publishFromLibrary(), keyStaysOut( envKey ) ],
	};

} );

// The files the World Drive page loads from public/: the Google Maps logo, and the offered
// vehicles' models and pictures with a library.json listing just them. The dev server serves
// them from public/; the build copies them into dist-drive/.
function publishFromLibrary() {

	function files() {

		const library = JSON.parse( readFileSync( join( PUBLIC, 'library', 'library.json' ), 'utf8' ) );
		const items = LIBRARY_VEHICLES.map( id => {

			const item = library.find( entry => entry.id === id );
			if ( ! item ) throw new Error( `World Drive: ${ id } isn't in public/library/library.json` );
			return item;

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
