import { HttpError, checkSameOrigin, errorResponse, isObject, json, readJson } from '../http.js';
import { MAX_TOKEN, verifyTurnstile } from './turnstile.js';
import { search } from './search.js';
import { createPlayer, renamePlayer } from './players.js';
import { leaderboard, postScore } from './scores.js';
import { addressOf, clock, setting } from './settings.js';
import { makeVisit } from './visits.js';

export { DriveLimits } from './limits.js';

// The Cloudflare Worker behind World Drive (worlddrive.app, docs/world-drive.md). It only runs
// for /api/*; the site itself (npm run build:drive, dist-drive/) is served straight from
// Cloudflare's assets. Its job is to keep Google's bill in check: every page that loads Google's
// 3D tiles starts a billed Maps session, so the Maps key is handed out once per visit, only to a
// browser that passed Turnstile, and only while today's visits are under the caps. It also keeps
// the leaderboard (players.js, scores.js) in a D1 database: nicknames and each player's best stunt
// scores, posted with the visit's token so they come from visits that passed Turnstile.
//
// Settings (wrangler.drive.jsonc vars, or secrets):
//   GOOGLE_MAPS_API_KEY   secret: the Maps key for World Drive's own Google Cloud project (a
//                         secret named Google_maps_api, in any case, works as well: see mapsKey)
//   TURNSTILE_SECRET      secret: the Turnstile widget's secret key
//   TURNSTILE_SITE_KEY    the widget's site key (public)
//   DAILY_VISITS          visits a day for everyone together (300 if unset); 0 closes for the day
//   PER_VISITOR_DAILY     visits a day per visitor (8 if unset)
//   NAMES_PER_VISITOR_DAILY, SCORES_PER_VISITOR_DAILY   the leaderboard's new names and renames
//                         (20 if unset) and scores (1500) a day per visitor
//   DB                    the D1 database binding: the leaderboard's tables (worker/drive/migrations)
//   TURNSTILE_VERIFY_URL, SEARCH_UPSTREAM, TEST_CLOCK   tests only (see scripts/test-drive-worker.mjs)

// Other names the Maps key may be set under (see mapsKey).
const KEY_NAMES = /^google_maps_api(_key)?$/i;

const ROUTES = [
	{ method: 'GET', path: '/api/config', handler: getConfig },
	{ method: 'POST', path: '/api/visit', handler: visit },
	{ method: 'GET', path: '/api/search', handler: search },
	{ method: 'POST', path: '/api/player', handler: createPlayer },
	{ method: 'POST', path: '/api/player/rename', handler: renamePlayer },
	{ method: 'POST', path: '/api/score', handler: postScore },
	{ method: 'GET', path: '/api/leaderboard', handler: leaderboard },
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
			return await route.handler( { request, env, url, ctx, limits, now: clock( request, env ) } );

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

	return json( { turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? '', mapsOn: !! mapsKey( env ) } );

}

// POST /api/visit { token }: the page asks for the Maps key once as it starts. Turnstile first,
// then the caps (both counted at once), and only then the key, with the visit's token for posting
// scores (visits.js). Over a cap: 429 with retryAfter, the seconds until midnight UTC, when the
// counts start again.
async function visit( { request, env, url, limits, now } ) {

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
	const key = mapsKey( env );
	if ( ! key ) throw new HttpError( 503, 'Maps are off today' );

	const outcome = await limits.visit( addressOf( request ), {
		now,
		daily: setting( env.DAILY_VISITS, 300 ),
		perVisitor: setting( env.PER_VISITOR_DAILY, 8 ),
	} );
	if ( ! outcome.ok ) {

		const { reason, retryAfter } = outcome;
		const message = reason === 'daily' ? 'Today\'s free drives are used up' : 'You\'ve had today\'s free drives';
		throw new HttpError( 429, message, { reason, retryAfter }, { 'Retry-After': String( retryAfter ) } );

	}

	return json( { mapsKey: key, left: outcome.left, visit: await makeVisit( env, now ) } );

}

// The Maps key: the GOOGLE_MAPS_API_KEY secret, or one the owner set as Google_maps_api (or
// GOOGLE_MAPS_API, google_maps_api_key...) in the dashboard. Settings' names are case-sensitive
// there, so any case is taken. '' when there's none.
function mapsKey( env ) {

	if ( typeof env.GOOGLE_MAPS_API_KEY === 'string' && env.GOOGLE_MAPS_API_KEY.trim() ) return env.GOOGLE_MAPS_API_KEY.trim();
	for ( const [ name, value ] of Object.entries( env ) ) {

		if ( KEY_NAMES.test( name ) && typeof value === 'string' && value.trim() ) return value.trim();

	}

	return '';

}

