// The built World Drive site (dist-drive/, npm run build:drive) served as Cloudflare's assets serve
// it on worlddrive.app, for the SEO test and the load measurements (test-drive-seo.mjs): a folder's
// index.html at its address with the slash, the address without it sent on to it (307), /index.html
// sent on to /, anything else that isn't a file a 404, and text compressed. There's no Worker, so
// /api/* is a 404 too, and the page starts on the test globe as the dev server does without a key.

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json',
	'.webmanifest': 'application/manifest+json',
	'.xml': 'application/xml; charset=utf-8',
	'.txt': 'text/plain; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ico': 'image/x-icon',
	'.webp': 'image/webp',
	'.glb': 'model/gltf-binary',
	'.wasm': 'application/wasm',
	'.bin': 'application/octet-stream',
	'.md': 'text/markdown; charset=utf-8',
};
const COMPRESSED = /^(text\/|application\/(json|manifest\+json|xml|wasm)|image\/svg)/;

// Resolves to { base, stop }. requests: an array each request's path is pushed to, if given.
export function serveDist( dir, port, { requests = null } = {} ) {

	const server = createServer( ( req, res ) => {

		const url = new URL( req.url, 'http://localhost' );
		const path = decodeURIComponent( url.pathname );
		requests?.push( path );
		const file = normalize( join( dir, path ) );
		if ( ! file.startsWith( normalize( dir ) ) ) return send( res, 404 );
		if ( path.endsWith( '/index.html' ) ) return redirect( res, path.slice( 0, - 'index.html'.length ) + url.search );
		let target = file;
		if ( path.endsWith( '/' ) ) target = join( file, 'index.html' );
		else if ( existsSync( file ) && statSync( file ).isDirectory() ) return existsSync( join( file, 'index.html' ) ) ? redirect( res, `${ path }/${ url.search }` ) : send( res, 404 );
		if ( ! existsSync( target ) || ! statSync( target ).isFile() ) return send( res, 404 );
		const type = TYPES[ extname( target ) ] ?? 'application/octet-stream';
		let body = readFileSync( target );
		const headers = { 'Content-Type': type, 'Cache-Control': 'no-store' };
		if ( COMPRESSED.test( type ) && /gzip/.test( req.headers[ 'accept-encoding' ] ?? '' ) ) {

			body = gzipSync( body );
			headers[ 'Content-Encoding' ] = 'gzip';

		}

		res.writeHead( 200, headers );
		res.end( req.method === 'HEAD' ? undefined : body );

	} );

	return new Promise( ( resolve, reject ) => {

		server.on( 'error', reject );
		server.listen( port, '127.0.0.1', () => resolve( { base: `http://127.0.0.1:${ port }`, stop: () => new Promise( done => server.close( done ) ) } ) );

	} );

}

function redirect( res, location ) {

	res.writeHead( 307, { Location: location } );
	res.end();

}

function send( res, status ) {

	res.writeHead( status, { 'Content-Type': 'text/plain' } );
	res.end( status === 404 ? 'Not found' : '' );

}

// The text of a built file, for the checks.
export function readBuilt( dir, path ) {

	return readFileSync( join( dir, path ), 'utf8' );

}

// How a page loads in Chromium on a phone's connection, as Lighthouse's mobile test has it (150 ms
// round trips, 1.6 Mbit/s down, the CPU 4 times slower): first contentful paint, largest
// contentful paint and what it was, when the globe was up (window.drive.mode, the game's own
// page only), and the scripts and styles fetched (their bytes over the wire, compressed). Times
// are ms from the start of navigation.
export async function measureLoad( browser, url, { throttle = true, game = true, timeout = 180000 } = {} ) {

	const context = await browser.newContext( { viewport: { width: 412, height: 823 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true } );
	const page = await context.newPage();
	await page.route( /^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort() );
	await page.addInitScript( () => {

		window.__load = { lcp: null, fcp: null, globe: null };
		new PerformanceObserver( list => {

			for ( const entry of list.getEntries() ) {

				const el = entry.element;
				window.__load.lcp = {
					time: Math.round( entry.startTime ),
					size: entry.size,
					element: el ? `${ el.tagName.toLowerCase() }${ el.id ? `#${ el.id }` : '' }${ el.className && typeof el.className === 'string' ? `.${ el.className.trim().split( /\s+/ ).join( '.' ) }` : '' }` : null,
					text: el?.textContent?.trim().slice( 0, 60 ) ?? null,
				};

			}

		} ).observe( { type: 'largest-contentful-paint', buffered: true } );
		new PerformanceObserver( list => {

			for ( const entry of list.getEntries() ) if ( entry.name === 'first-contentful-paint' ) window.__load.fcp = Math.round( entry.startTime );

		} ).observe( { type: 'paint', buffered: true } );
		const poll = setInterval( () => {

			if ( window.drive?.mode === 'globe' ) {

				window.__load.globe = Math.round( performance.now() );
				clearInterval( poll );

			}

		}, 50 );

	} );
	if ( throttle ) {

		const cdp = await context.newCDPSession( page );
		await cdp.send( 'Network.enable' );
		await cdp.send( 'Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 } );
		await cdp.send( 'Emulation.setCPUThrottlingRate', { rate: 4 } );

	}

	try {

		await page.goto( url, { waitUntil: 'load', timeout } );
		if ( game ) await page.waitForFunction( () => window.__load.globe !== null, null, { timeout } );
		else await page.waitForTimeout( 1000 );
		// LCP is final once the page has settled; a moment more for its last entry.
		await page.waitForTimeout( 500 );
		return await page.evaluate( () => {

			const resources = performance.getEntriesByType( 'resource' );
			const sum = kind => resources.filter( r => r.initiatorType === kind || ( kind === 'script' && /\.js(\?|$)/.test( r.name ) ) ).reduce( ( total, r ) => total + r.transferSize, 0 );
			const nav = performance.getEntriesByType( 'navigation' )[ 0 ];
			return {
				...window.__load,
				domContentLoaded: Math.round( nav.domContentLoadedEventEnd ),
				load: Math.round( nav.loadEventEnd ),
				js: sum( 'script' ),
				css: resources.filter( r => /\.css(\?|$)/.test( r.name ) ).reduce( ( total, r ) => total + r.transferSize, 0 ),
				html: nav.transferSize,
			};

		} );

	} finally {

		await context.close();

	}

}
