import { HttpError, checkSameOrigin, errorResponse, isObject, json, readJson } from '../http.js';
import { MAX_TOKEN, verifyTurnstile } from './turnstile.js';
import { search } from './search.js';

export { DriveLimits } from './limits.js';

// The Cloudflare Worker behind World Drive (worlddrive.app, docs/world-drive.md). It only runs
// for /api/*; the site itself (npm run build:drive, dist-drive/) is served straight from
// Cloudflare's assets. Its job is to keep Google's bill in check: every page that loads Google's
// 3D tiles starts a billed Maps session, so the Maps key is handed out once per visit, only to a
// browser that passed Turnstile, and only while today's visits are under the caps.
//
// Settings (wrangler.drive.jsonc vars, or secrets):
//   GOOGLE_MAPS_API_KEY   secret: the Maps key for World Drive's own Google Cloud project
//   TURNSTILE_SECRET      secret: the Turnstile widget's secret key
//   TURNSTILE_SITE_KEY    the widget's site key (public)
//   DAILY_VISITS          visits a day for everyone together (300 if unset); 0 closes for the day
//   PER_VISITOR_DAILY     visits a day per visitor (8 if unset)
//   TURNSTILE_VERIFY_URL, SEARCH_UPSTREAM, TEST_CLOCK   tests only (see scripts/test-drive-worker.mjs)

const ROUTES = [
	{ method: 'GET', path: '/api/config', handler: getConfig },
	{ method: 'POST', path: '/api/visit', handler: visit },
	{ method: 'GET', path: '/api/search', handler: search },
];

export default {

	async fetch( request, env, ctx ) {

		const url = new URL( request.url );
		// www.worlddrive.app is the same site: send it to worlddrive.app, path and all. (Pages
		// served from the assets never reach the Worker; the page itself moves those along.)
		if ( url.hostname.startsWith( 'www.' ) ) {

			url.hostname = url.hostname.slice( 4 );
			return Response.redirect( url.href, 301 );

		}

		if ( ! url.pathname.startsWith( '/api/' ) ) return env.ASSETS.fetch( request );

		try {

			const route = ROUTES.find( r => r.path === url.pathname );
			if ( ! route ) throw new HttpError( 404, 'Not found' );
			if ( route.method !== request.method ) throw new HttpError( 405, 'Method not allowed', {}, { Allow: route.method } );
			// Pages on other sites mustn't use the search or the visits either: browsers say where a
			// request comes from (checkSameOrigin does the same for the POST).
			const site = request.headers.get( 'Sec-Fetch-Site' );
			if ( site && site !== 'same-origin' && site !== 'none' ) throw new HttpError( 403, 'Forbidden' );
			const limits = env.LIMITS.get( env.LIMITS.idFromName( 'global' ) );
			return await route.handler( { request, env, url, ctx, limits } );

		} catch ( err ) {

			if ( err instanceof HttpError ) return errorResponse( err );
			// Just what went wrong, never the request: tokens and addresses stay out of the logs.
			console.error( 'API error', err?.name, err?.message );
			return json( { error: 'Something went wrong' }, 500 );

		}

	},

};

// What the page needs before it starts: the Turnstile site key, and whether there are maps today
// (without a key it shows a "back soon" screen instead of the globe).
function getConfig( { env } ) {

	return json( { turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? '', mapsOn: !! env.GOOGLE_MAPS_API_KEY } );

}

// POST /api/visit { token }: the page asks for the Maps key once as it starts. Turnstile first,
// then the caps (both counted at once), and only then the key. Over a cap: 429 with retryAfter,
// the seconds until midnight UTC, when the counts start again.
async function visit( { request, env, url, limits } ) {

	checkSameOrigin( request, url );
	const body = await readJson( request, 8192 );
	const token = isObject( body ) && typeof body.token === 'string' ? body.token : '';
	if ( ! token || token.length > MAX_TOKEN ) throw new HttpError( 400, 'Bad request' );
	if ( ! env.TURNSTILE_SECRET ) throw new HttpError( 503, 'Not set up yet' );

	const ip = request.headers.get( 'CF-Connecting-IP' ) ?? '';
	const check = await verifyTurnstile( env, token, ip );
	if ( check.unavailable ) throw new HttpError( 503, 'Couldn\'t check right now. Try again' );
	if ( ! check.ok ) throw new HttpError( 403, 'The robot check didn\'t pass' );
	// Before counting: with no key there's nothing to count.
	if ( ! env.GOOGLE_MAPS_API_KEY ) throw new HttpError( 503, 'Maps are off today' );

	const outcome = await limits.visit( ip || 'unknown', {
		now: clock( request, env ),
		daily: setting( env.DAILY_VISITS, 300 ),
		perVisitor: setting( env.PER_VISITOR_DAILY, 8 ),
	} );
	if ( ! outcome.ok ) {

		const { reason, retryAfter } = outcome;
		const message = reason === 'daily' ? 'Today\'s free drives are used up' : 'You\'ve had today\'s free drives';
		throw new HttpError( 429, message, { reason, retryAfter }, { 'Retry-After': String( retryAfter ) } );

	}

	return json( { mapsKey: env.GOOGLE_MAPS_API_KEY, left: outcome.left } );

}

// A whole number setting of 0 or more, or `fallback` when it's unset or isn't one.
function setting( value, fallback ) {

	const n = Number( value );
	return value !== undefined && value !== '' && Number.isInteger( n ) && n >= 0 ? n : fallback;

}

// The time visits are counted at. The tests (TEST_CLOCK=header, never set live) send it in
// X-Test-Time to check that the counts start again at midnight UTC.
function clock( request, env ) {

	const sent = Number( request.headers.get( 'X-Test-Time' ) );
	return env.TEST_CLOCK === 'header' && Number.isFinite( sent ) && sent > 0 ? sent : Date.now();

}
