// npm run make-build-catalog: worker/drive/build-catalog.json, the library as World Drive Build's
// MCP server (worker/drive/mcp.js) offers it to Claude: every item (downloaded and built in code)
// with its id, name, category, real size (m: length along its front, width, height) and whether the
// free plan has it, how far apart its joints are where it shares them in a row (rowLength: a fence
// panel's 10 ft, not its box's 3.25 m), and the sets with their pieces. Items built in code are measured in a browser,
// as the app's own library does (sidebar.js's measure), against the dev server. Run it again after
// adding to the library.
//
// Needs Playwright with Chromium.

import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ROOT, startVite } from './worker-harness.mjs';

const require = createRequire( import.meta.url );
const { chromium } = require( 'playwright' );
const vite = await startVite( Number( process.env.TEST_VITE_PORT ) || 5186 );
const browser = await chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader' ] } );
try {

	const page = await browser.newPage();
	await page.goto( `${ vite.base }/?prompt` );
	const catalog = await page.evaluate( async () => {

		const { loadLibrary } = await import( '/src/library.js' );
		const { buildProcedural } = await import( '/src/procedural.js' );
		const { FREE_ITEMS } = await import( '/src/product.js' );
		const { SETS } = await import( '/src/sets.js' );
		const { Box3, Vector3 } = await import( '/node_modules/three/build/three.module.js' );
		const round = v => Math.round( v * 100 ) / 100;
		const library = ( await loadLibrary() ).filter( item => item.category !== 'Race' );
		const items = library.map( item => {

			let dimensions = item.dimensions ?? null;
			if ( item.procedural || item.kind ) {

				// Built in code: facing -Z, so its length is along z.
				const size = new Box3().setFromObject( buildProcedural( item.id ) ).getSize( new Vector3() );
				dimensions = { length: round( size.z ), width: round( size.x ), height: round( size.y ) };

			}

			return {
				id: item.id,
				name: item.name,
				category: item.category,
				dimensions,
				free: FREE_ITEMS.has( item.id ),
				...( Number( item.rowLength ) > 0 ? { rowLength: Number( item.rowLength ) } : {} ),
				...( item.kind ? { kind: item.kind, params: item.params } : {} ),
			};

		} );
		const ids = new Set( items.map( i => i.id ) );
		const sets = SETS.map( set => ( { id: set.id, name: set.name, keywords: set.keywords, members: set.members.filter( m => ids.has( m.item ) ) } ) ).filter( set => set.members.length >= 2 );
		return { items, sets };

	} );
	const out = join( ROOT, 'worker', 'drive', 'build-catalog.json' );
	writeFileSync( out, JSON.stringify( catalog ) + '\n' );
	console.log( `${ out }: ${ catalog.items.length } items, ${ catalog.sets.length } sets` );

} finally {

	await browser.close();
	vite.stop();

}
