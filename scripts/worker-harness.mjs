// Test helpers for the Worker: test signing keys standing in for Google's, ID tokens signed with
// them, a local server for the key set, and `wrangler dev` with a throwaway database. Nothing
// here talks to Google or Cloudflare.

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
export const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const wrangler = join( dirname( createRequire( import.meta.url ).resolve( 'wrangler/package.json' ) ), 'bin', 'wrangler.js' );

// --- keys and tokens -------------------------------------------------------------------

// An RSA key pair like the ones Google signs ID tokens with, plus its public key as a JWK.
export async function makeKey( kid ) {

	const { privateKey, publicKey } = await crypto.subtle.generateKey(
		{ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array( [ 1, 0, 1 ] ), hash: 'SHA-256' },
		true,
		[ 'sign', 'verify' ],
	);
	const jwk = { ...await crypto.subtle.exportKey( 'jwk', publicKey ), kid, alg: 'RS256', use: 'sig' };
	delete jwk.key_ops;
	delete jwk.ext;
	return { kid, privateKey, jwk };

}

// A signed ID token for a test user. Claims set to undefined are left out.
export async function makeToken( key, claims = {}, header = {} ) {

	const now = Math.floor( Date.now() / 1000 );
	const payload = {
		iss: 'https://accounts.google.com',
		azp: CLIENT_ID,
		aud: CLIENT_ID,
		sub: '1001',
		email: 'alice@example.com',
		email_verified: true,
		name: 'Alice Example',
		given_name: 'Alice',
		iat: now,
		exp: now + 3600,
		...claims,
	};
	const input = `${ encode( { alg: 'RS256', kid: key.kid, typ: 'JWT', ...header } ) }.${ encode( payload ) }`;
	const signature = await crypto.subtle.sign( 'RSASSA-PKCS1-v1_5', key.privateKey, new TextEncoder().encode( input ) );
	return `${ input }.${ Buffer.from( signature ).toString( 'base64url' ) }`;

}

function encode( value ) {

	return Buffer.from( JSON.stringify( value ) ).toString( 'base64url' );

}

// Serves { keys } the way Google serves its certs, on a free port on this machine.
export async function serveKeys( keys ) {

	const server = createServer( ( req, res ) => {

		res.writeHead( 200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' } );
		res.end( JSON.stringify( { keys } ) );

	} );
	await new Promise( resolve => server.listen( 0, '127.0.0.1', resolve ) );
	return { url: `http://127.0.0.1:${ server.address().port }/oauth2/v3/certs`, close: () => server.close() };

}

// --- the Worker ------------------------------------------------------------------------

// `wrangler dev` on this machine with a fresh database (migrations applied) and the given vars,
// which replace any in wrangler.jsonc or .dev.vars. Resolves once it answers.
export async function startWorker( { port, vars } ) {

	const dir = mkdtempSync( join( tmpdir(), 'twin-worker-' ) );
	const state = join( dir, 'state' );
	const assets = join( dir, 'assets' );
	mkdirSync( assets );
	writeFileSync( join( assets, 'index.html' ), '<!doctype html><title>test site</title>' );
	const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' };

	const migrate = spawnSync( process.execPath, [ wrangler, 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', state ], { cwd: ROOT, env, encoding: 'utf8' } );
	if ( migrate.status !== 0 ) throw new Error( `migrations failed:\n${ migrate.stdout }\n${ migrate.stderr }` );

	const args = [
		wrangler, 'dev', '--local', '--ip', '127.0.0.1', '--port', String( port ), '--inspector-port', String( await freePort() ),
		'--persist-to', state, '--assets', assets, '--show-interactive-dev-session=false',
		...Object.entries( vars ).flatMap( ( [ name, value ] ) => [ '--var', `${ name }:${ value }` ] ),
	];
	const child = spawn( process.execPath, args, { cwd: ROOT, env, detached: process.platform !== 'win32', stdio: [ 'ignore', 'pipe', 'pipe' ] } );
	let log = '';
	child.stdout.on( 'data', chunk => log += chunk );
	child.stderr.on( 'data', chunk => log += chunk );

	const stop = () => {

		if ( child.exitCode === null ) {

			if ( process.platform === 'win32' ) spawnSync( 'taskkill', [ '/pid', String( child.pid ), '/t', '/f' ] );
			else process.kill( - child.pid, 'SIGTERM' );

		}

		rmSync( dir, { recursive: true, force: true } );

	};

	const base = `http://127.0.0.1:${ port }`;
	const deadline = Date.now() + 90000;
	while ( Date.now() < deadline ) {

		if ( child.exitCode !== null ) break;
		try {

			const res = await fetch( `${ base }/api/config` );
			if ( res.ok ) return { base, stop, log: () => log };

		} catch {

			// Not listening yet.

		}

		await new Promise( resolve => setTimeout( resolve, 300 ) );

	}

	stop();
	throw new Error( `wrangler dev didn't start:\n${ log }` );

}

function freePort() {

	return new Promise( resolve => {

		const server = createServer();
		server.listen( 0, '127.0.0.1', () => {

			const { port } = server.address();
			server.close( () => resolve( port ) );

		} );

	} );

}
