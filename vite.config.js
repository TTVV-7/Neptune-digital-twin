import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import { createAisFeed } from './server/ais.js';
import { AIS } from './src/config.js';

// Variable names accepted for the Google Maps key, matched case-insensitively, so a key
// stored in a cloud environment or shell (e.g. GOOGLE_MAPS_API_KEY or Google_api) works
// as well as VITE_GOOGLE_MAPS_API_KEY in .env.local.
const GOOGLE_KEY_NAMES = [
	'VITE_GOOGLE_MAPS_API_KEY',
	'GOOGLE_MAPS_API_KEY',
	'GOOGLE_API_KEY',
	'GOOGLE_MAPS_KEY',
	'GOOGLE_MAPS_API',
	'GOOGLE_API',
];

// Same for the AISStream key. It stays on the server: the page only sees ship positions.
const AIS_KEY_NAMES = [
	'AISSTREAM_API_KEY',
	'AISSTREAM_KEY',
	'AIS_API_KEY',
	'AISSTREAM_API',
	'AISSTREAM',
];

export default defineConfig( ( { mode } ) => {

	const env = loadEnv( mode, process.cwd(), '' );
	const byName = new Map( Object.entries( env ).map( ( [ name, value ] ) => [ name.toLowerCase(), value ] ) );
	const pick = names => names.map( name => byName.get( name.toLowerCase() ) ).find( Boolean ) ?? '';
	// `npm run build:site` makes the copy in site/ that is committed and served by the Cloudflare
	// Worker, so it must never carry a key: there the page asks the Worker for it (api/config).
	const googleKey = mode === 'site' ? '' : pick( GOOGLE_KEY_NAMES );

	return {
		// AISSTREAM_URL points the feed at a stand-in server, for testing.
		plugins: [ aisPlugin( pick( AIS_KEY_NAMES ), byName.get( 'aisstream_url' ) ) ],
		// Relative base so the built site works from any sub-path (e.g. GitHub Pages).
		base: './',
		// three.js alone is ~600 kB, so the default 500 kB warning is just noise here.
		build: { chunkSizeWarningLimit: 1500 },
		define: {
			'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify( googleKey ),
		},
	};

} );

// Serves live ship data at /api/ais while `npm run dev` or `npm run preview` is running.
// A static build has no server, so there the ships panel says so instead.
function aisPlugin( apiKey, url ) {

	const attach = server => {

		const logger = server.config.logger;
		const feed = createAisFeed( {
			apiKey,
			url,
			box: AIS.box,
			cacheFile: resolve( server.config.root, '.cache', 'ais-vessels.json' ),
			log: message => logger.info( message, { timestamp: true } ),
		} );
		if ( ! apiKey ) logger.info( 'AIS: no AISStream key set, so live ships are off. See "Live ships" in the README.' );

		server.middlewares.use( '/api/ais', ( req, res ) => {

			res.setHeader( 'Content-Type', 'application/json' );
			res.setHeader( 'Cache-Control', 'no-store' );
			res.end( JSON.stringify( feed.snapshot() ) );

		} );
		server.httpServer?.once( 'close', () => feed.stop() );

	};

	return { name: 'neptune-ais', configureServer: attach, configurePreviewServer: attach };

}
