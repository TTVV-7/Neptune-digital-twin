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

import { AIS } from '../src/config.js';
import { AISSTREAM_URL, AisFeed } from '../server/aisFeed.js';

const COMMIT = 'e8c1f094939f10c177a6ea30eb4ca896a010bec8';
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

};

const IDLE_MS = 10 * 60 * 1000; // stop listening this long after the last viewer
const TICK_MS = 60 * 1000;

// Holds the AISStream connection while someone has the site open (AISStream doesn't allow
// browsers to connect, and the key stays here), keeps the table of vessels in storage
// between visits, and answers the page's /api/ais polls. What the messages mean is in
// server/aisFeed.js, shared with the dev server.
export class AisRelay {

	constructor( ctx, env ) {

		this.ctx = ctx;
		this.env = env;
		this.feed = new AisFeed( { apiKey: env.AISSTREAM_API_KEY, box: AIS.box, log: message => console.log( message ) } );
		this.socket = null;
		this.retryAt = 0;
		this.lastViewed = 0;
		ctx.blockConcurrencyWhile( async () => {

			if ( env.AISSTREAM_API_KEY ) this.feed.load( await ctx.storage.get( 'vessels' ) );

		} );

	}

	async fetch() {

		this.lastViewed = Date.now();
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

	// Every minute while someone is watching: save the table, reconnect if the connection
	// dropped, and stop once nobody has looked for a while (an open connection keeps this
	// object running, and AISStream allows only a few per account).
	async alarm() {

		await this.ctx.storage.put( 'vessels', this.feed.list() );

		if ( Date.now() - this.lastViewed > IDLE_MS ) {

			const ws = this.socket;
			this.socket = null;
			if ( ws && ws !== 'opening' ) ws.close( 1000, 'nobody watching' );
			return;

		}

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
