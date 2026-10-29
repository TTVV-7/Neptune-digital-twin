import { defineConfig, loadEnv } from 'vite';

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

export default defineConfig( ( { mode } ) => {

	const env = loadEnv( mode, process.cwd(), '' );
	const byName = new Map( Object.entries( env ).map( ( [ name, value ] ) => [ name.toLowerCase(), value ] ) );
	const googleKey = GOOGLE_KEY_NAMES.map( name => byName.get( name.toLowerCase() ) ).find( Boolean ) ?? '';

	return {
		// Relative base so the built site works from any sub-path (e.g. GitHub Pages).
		base: './',
		// three.js alone is ~600 kB, so the default 500 kB warning is just noise here.
		build: { chunkSizeWarningLimit: 1500 },
		define: {
			'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify( googleKey ),
		},
	};

} );
