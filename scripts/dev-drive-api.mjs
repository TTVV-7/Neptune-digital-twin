// npm run dev:drive-api: World Drive's Worker (worker/drive/) on http://localhost:8790, for trying
// the robot check, the daily caps and the search on your computer. Run `npm run dev:drive` beside
// it with DRIVE_API=http://localhost:8790 set, and the page's /api requests go here.
// Settings come from wrangler.drive.jsonc and .dev.vars.drive (copy .dev.vars.drive.example),
// not .dev.vars, which is the construction app's. Extra arguments are passed on to `wrangler dev`,
// e.g. npm run dev:drive-api -- --port 8791
//
// Nothing here talks to Cloudflare: the visit counts live in .wrangler/state. The search does go
// to OpenStreetMap, at most once a second, like the live site.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
const wrangler = join( dirname( createRequire( import.meta.url ).resolve( 'wrangler/package.json' ) ), 'bin', 'wrangler.js' );

// Wrangler insists the site folder exists. npm run build:drive fills it; until then the page
// comes from the Vite dev server anyway.
mkdirSync( join( root, 'dist-drive' ), { recursive: true } );

const settings = join( root, '.dev.vars.drive' );
if ( ! existsSync( settings ) ) console.warn( 'No .dev.vars.drive: copy .dev.vars.drive.example to it for the Turnstile test keys and a Maps key.' );
const args = process.argv.slice( 2 );
const dev = spawn( process.execPath, [
	wrangler, 'dev', '-c', 'wrangler.drive.jsonc', '--local',
	// Always a settings file of its own, so the construction app's .dev.vars is never read.
	'--env-file', existsSync( settings ) ? settings : join( root, '.dev.vars.drive.example' ),
	...( args.includes( '--port' ) ? [] : [ '--port', '8790' ] ),
	...args,
], { cwd: root, stdio: 'inherit' } );
dev.on( 'exit', code => process.exit( code ?? 0 ) );
