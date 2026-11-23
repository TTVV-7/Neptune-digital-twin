// node scripts/preview-hardware.mjs <folder> [model:view ...]: pictures of the hardware
// (src/drive-app/hardware.js) from scripts/preview-hardware.html, served from the repository on a
// local port, in Chromium. Each model:view is a HARDWARE id or a builder's name, and the camera's
// distance,height,turn (degrees); with none, each site's default.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Playwright from the project if it has it, else the machine's (as the tests find it).
let chromium;
try {

	( { chromium } = createRequire( import.meta.url )( 'playwright' ) );

} catch {

	( { chromium } = createRequire( '/opt/node-tools/' )( 'playwright' ) );

}

const ROOT = join( fileURLToPath( import.meta.url ), '..', '..' );
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const [ out = '.', ...wanted ] = process.argv.slice( 2 );
const shots = wanted.length ? wanted : [ 'apollo-11:17,4.5,215', 'lunokhod-1:6.5,2.6,205', 'change-4:22,5,205', 'chandrayaan-3:12,3.5,210', 'slim:9,3,240' ];

const server = createServer( async ( req, res ) => {

	const path = normalize( decodeURIComponent( new URL( req.url, 'http://x' ).pathname ) ).replace( /^(\.\.[/\\])+/, '' );
	try {

		const body = await readFile( join( ROOT, path === '/' ? 'scripts/preview-hardware.html' : path ) );
		res.setHeader( 'Content-Type', TYPES[ extname( path ) ] ?? 'application/octet-stream' );
		res.end( body );

	} catch {

		res.statusCode = 404;
		res.end();

	}

} ).listen( 0 );
const port = server.address().port;
const browser = await chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader' ] } );
const page = await browser.newPage( { viewport: { width: 1280, height: 720 } } );
page.on( 'pageerror', err => console.error( err.message ) );
for ( const shot of shots ) {

	const [ model, view ] = shot.split( ':' );
	await page.goto( `http://127.0.0.1:${ port }/scripts/preview-hardware.html?model=${ model }${ view ? `&view=${ view }` : '' }` );
	await page.waitForFunction( () => window.rendered, null, { timeout: 60000 } );
	await page.screenshot( { path: join( out, `${ model }.png` ) } );
	console.log( 'shot', model );

}

await browser.close();
server.close();
