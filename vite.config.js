import { defineConfig, loadEnv } from 'vite';

// Variable names accepted for the Google Maps key, matched case-insensitively, so a key
// stored in a cloud environment or shell (e.g. GOOGLE_MAPS_API_KEY or google_api) works
// as well as VITE_GOOGLE_MAPS_API_KEY in .env.local. GOOGLE_API_KEY is deliberately left out:
// it often holds a different Google key (e.g. Gemini), and whatever is used here ends up
// readable in the built site.
const GOOGLE_KEY_NAMES = [
	'VITE_GOOGLE_MAPS_API_KEY',
	'GOOGLE_MAPS_API_KEY',
	'GOOGLE_MAPS_KEY',
	'GOOGLE_MAPS_API',
	'GOOGLE_API',
];

export default defineConfig( ( { command, mode } ) => {

	const env = loadEnv( mode, process.cwd(), '' );
	const byName = new Map( Object.entries( env ).map( ( [ name, value ] ) => [ name.toLowerCase(), value ] ) );
	// `npm run deploy` builds with --mode cloudflare: there the Worker hands the key to signed-in
	// users (src/cloud.js), so it's left out of the public site.
	const keyName = mode === 'cloudflare' ? null : GOOGLE_KEY_NAMES.find( name => byName.get( name.toLowerCase() ) );
	const googleKey = keyName ? byName.get( keyName.toLowerCase() ) : '';
	if ( keyName && command === 'build' ) {

		console.log( `Google Maps key from ${ keyName } is embedded in dist/. Restrict it to your site in the Google Cloud console.` );

	}

	// TWIN_API=http://localhost:8787 (npm run dev:api) sends the app's /api requests to the local
	// Worker, for sign-in and cloud layouts. Without it the app runs on its own, as it always has.
	const api = env.TWIN_API;
	const server = api ? { proxy: { '/api': { target: api } }, watch: { ignored: [ '**/.wrangler/**' ] } } : {};

	return {
		// Relative base so the built site works from any sub-path (e.g. GitHub Pages).
		base: './',
		// three.js alone is ~600 kB, so the default 500 kB warning is just noise here.
		build: { chunkSizeWarningLimit: 1500 },
		server,
		define: {
			'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify( googleKey ),
		},
	};

} );
