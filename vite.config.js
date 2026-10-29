import { defineConfig } from 'vite';

// Relative base so the built site works from any sub-path (e.g. GitHub Pages).
export default defineConfig( {
	base: './',
	// three.js alone is ~600 kB, so the default 500 kB warning is just noise here.
	build: { chunkSizeWarningLimit: 1500 },
} );
