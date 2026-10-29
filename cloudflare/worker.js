// Private hosting for the twin on Cloudflare Workers.
//
// It asks for a password (the browser's own sign-in box; any user name, the password is the
// SITE_PASSWORD secret), then serves the built app from site/ in the GitHub repository, as it
// was at COMMIT. Pinning one commit keeps the page and its files from the same build. To
// update: `npm run build:site`, commit and push, set COMMIT to that commit and redeploy this
// (`npx wrangler deploy`, see wrangler.jsonc).
//
// Secrets, all optional apart from the password:
//   GOOGLE_MAPS_API_KEY  handed to the page after the password check, so viewers don't need
//                        their own key. Restrict it to this site's address in Google Cloud.
//   AISSTREAM_API_KEY    live ships: the AisRelay below holds the AISStream connection.
//
// A cron trigger (every 10 minutes, see wrangler.jsonc) makes sure the relay is listening.

import { AIS } from '../src/config.js';
import { AISSTREAM_URL, AisFeed } from '../server/aisFeed.js';

const COMMIT = '549eebc0bc5752edfb71b2a7410d3a692921e01c';
const SOURCE = `https://raw.githubusercontent.com/TTVV-7/Neptune-digital-twin/${ COMMIT }/site`;

const TYPES = {
	html: 'text/html; charset=utf-8',
	js: 'text/javascript; charset=utf-8',
	css: 'text/css; charset=utf-8',
	json: 'application/json',
	wasm: 'application/wasm',
	glb: 'model/gltf-binary',
	png: 'image/png',
	jpg: 'image/jpeg',
	svg: 'image/svg+xml',
};

export default {

	async fetch( request, env ) {

		if ( ! await authorised( request, env.SITE_PASSWORD ) ) {

			return new Response( 'This site is private. Enter the password to continue.', {
				status: 401,
				headers: { 'WWW-Authenticate': 'Basic realm="Neptune Terminals twin", charset="UTF-8"' },
			} );

		}

		const url = new URL( request.url );
		if ( url.pathname === '/api/config' ) {

			return Response.json( { googleMapsApiKey: env.GOOGLE_MAPS_API_KEY ?? '' }, { headers: { 'Cache-Control': 'no-store' } } );

		}

		// Live ships: one relay for everyone, so there's only ever one AISStream connection.
		if ( url.pathname === '/api/ais' ) {

			if ( ! env.AIS ) return Response.json( { now: Date.now(), status: { state: 'unavailable' }, vessels: [] } );
			return env.AIS.get( env.AIS.idFromName( 'burrard-inlet' ) ).fetch( request );

		}

		if ( url.pathname.startsWith( '/api/' ) ) return new Response( 'Not available here', { status: 404 } );

		const path = url.pathname.endsWith( '/' ) ? `${ url.pathname }index.html` : url.pathname;
		const upstream = await fetch( SOURCE + path, { cf: { cacheEverything: true, cacheTtl: 86400 } } );
		if ( ! upstream.ok ) return new Response( 'Not found', { status: 404 } );

		return new Response( upstream.body, {
			headers: {
				'Content-Type': TYPES[ path.split( '.' ).pop() ] ?? 'application/octet-stream',
				'Cache-Control': 'private, max-age=300',
				'X-Content-Type-Options': 'nosniff',
			},
		} );

	},

	// Wakes the relay in case it was restarted and its alarm lost.
	async scheduled( controller, env ) {

		if ( env.AIS ) await env.AIS.get( env.AIS.idFromName( 'burrard-inlet' ) ).fetch( 'https://relay/wake' );

	},

};

const TICK_MS = 60 * 1000;

// Holds the AISStream connection (AISStream doesn't allow browsers to connect, and the key
// stays here), keeps the table of vessels in storage and answers the page's /api/ais polls.
// It listens all the time, not just while someone is looking: AISStream only catches some
// of a moored ship's reports at Neptune's berths, so the table needs hours of listening to
// know which ships are alongside. One object listening non-stop uses about 85% of the
// Workers free plan's daily Durable Objects allowance. What the messages mean is in
// server/aisFeed.js, shared with the dev server.
export class AisRelay {

	constructor( ctx, env ) {

		this.ctx = ctx;
		this.env = env;
		this.feed = new AisFeed( { apiKey: env.AISSTREAM_API_KEY, box: AIS.box, log: message => console.log( message ) } );
		this.socket = null;
		this.retryAt = 0;
		ctx.blockConcurrencyWhile( async () => {

			if ( env.AISSTREAM_API_KEY ) this.feed.load( await ctx.storage.get( 'vessels' ) );

		} );

	}

	async fetch() {

		if ( this.env.AISSTREAM_API_KEY ) {

			if ( ! this.socket && Date.now() >= this.retryAt ) this.connect();
			if ( ! await this.ctx.storage.getAlarm() ) await this.ctx.storage.setAlarm( Date.now() + TICK_MS );

		}

		return Response.json( this.feed.snapshot(), { headers: { 'Cache-Control': 'no-store' } } );

	}

	async connect() {

		this.socket = 'opening';
		this.feed.connecting();
		let ws;
		try {

			const res = await fetch( AISSTREAM_URL.replace( 'wss:', 'https:' ), { headers: { Upgrade: 'websocket' } } );
			ws = res.webSocket;
			if ( ! ws ) throw new Error( `HTTP ${ res.status }` );

		} catch ( err ) {

			this.socket = null;
			this.retryAt = Date.now() + this.feed.closed( 0, err.message ) * 1000;
			return;

		}

		ws.accept();
		ws.binaryType = 'arraybuffer'; // AISStream sends binary frames; the default here is Blob
		this.socket = ws;
		ws.addEventListener( 'message', e => this.feed.received( typeof e.data === 'string' ? e.data : new TextDecoder().decode( e.data ) ) );
		ws.addEventListener( 'close', e => this.dropped( ws, e.code ) );
		ws.addEventListener( 'error', () => this.dropped( ws, 1006 ) );
		ws.send( this.feed.subscription() );

	}

	dropped( ws, code ) {

		if ( this.socket !== ws ) return;
		this.socket = null;
		this.retryAt = Date.now() + this.feed.closed( code ) * 1000;

	}

	// Every minute: save the table and reconnect if the connection dropped.
	async alarm() {

		await this.ctx.storage.put( 'vessels', this.feed.list() );
		if ( ! this.env.AISSTREAM_API_KEY ) return;
		if ( ! this.socket && Date.now() >= this.retryAt ) this.connect();
		await this.ctx.storage.setAlarm( Date.now() + TICK_MS );

	}

}

// Basic auth, compared in constant time.
async function authorised( request, password ) {

	const [ scheme, encoded ] = ( request.headers.get( 'Authorization' ) ?? '' ).split( ' ' );
	if ( ! password || scheme !== 'Basic' || ! encoded ) return false;

	let given;
	try {

		const decoded = atob( encoded );
		given = decoded.slice( decoded.indexOf( ':' ) + 1 );

	} catch {

		return false;

	}

	const digest = text => crypto.subtle.digest( 'SHA-256', new TextEncoder().encode( text ) );
	return crypto.subtle.timingSafeEqual( await digest( given ), await digest( password ) );

}
