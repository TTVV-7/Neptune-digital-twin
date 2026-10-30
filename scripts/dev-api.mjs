// npm run dev:api: the Worker (worker/index.js) on http://localhost:8787 with a local D1
// database, for trying sign-in and cloud layouts on your computer. Run `npm run dev` beside it
// with TWIN_API=http://localhost:8787 set, and the app's /api requests go here.
// Settings come from wrangler.jsonc and .dev.vars (copy .dev.vars.example). Extra arguments are
// passed on to `wrangler dev`, e.g. npm run dev:api -- --port 8790
//
// Nothing here talks to Cloudflare: the database lives in .wrangler/state.

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
const wrangler = join( dirname( createRequire( import.meta.url ).resolve( 'wrangler/package.json' ) ), 'bin', 'wrangler.js' );
const options = { cwd: root, stdio: 'inherit' };

// Wrangler insists the site folder exists. npm run build fills it; until then the app comes
// from the Vite dev server anyway.
mkdirSync( join( root, 'dist' ), { recursive: true } );

const migrate = spawnSync( process.execPath, [ wrangler, 'd1', 'migrations', 'apply', 'DB', '--local' ], options );
if ( migrate.status !== 0 ) process.exit( migrate.status ?? 1 );

const args = process.argv.slice( 2 );
const dev = spawn( process.execPath, [ wrangler, 'dev', '--local', ...( args.includes( '--port' ) ? [] : [ '--port', '8787' ] ), ...args ], options );
dev.on( 'exit', code => process.exit( code ?? 0 ) );
