// Private hosting for the twin on Cloudflare Workers.
//
// It asks for a password (the browser's own sign-in box; any user name, the password is the
// SITE_PASSWORD secret), then serves the built app from site/ in the GitHub repository.
// Rebuild that copy with `npm run build:site` and push; the Worker picks it up within minutes.
//
// Optional secret GOOGLE_MAPS_API_KEY: handed to the page after the password check, so viewers
// don't need their own key. Restrict that key to this site's address in Google Cloud.

const SOURCE = 'https://raw.githubusercontent.com/TTVV-7/Neptune-digital-twin/refs/heads/claude/wonderful-faraday-iq3krk/site';

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

		// Live ships need the dev server's AIS connection, which this site doesn't have yet.
		if ( url.pathname.startsWith( '/api/' ) ) return new Response( 'Not available here', { status: 404 } );

		const path = url.pathname.endsWith( '/' ) ? `${ url.pathname }index.html` : url.pathname;
		const upstream = await fetch( SOURCE + path, { cf: { cacheEverything: true, cacheTtl: 120 } } );
		if ( ! upstream.ok ) return new Response( 'Not found', { status: 404 } );

		return new Response( upstream.body, {
			headers: {
				'Content-Type': TYPES[ path.split( '.' ).pop() ] ?? 'application/octet-stream',
				'Cache-Control': 'private, max-age=120',
				'X-Content-Type-Options': 'nosniff',
			},
		} );

	},

};

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
