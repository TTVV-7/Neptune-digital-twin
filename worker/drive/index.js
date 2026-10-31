import { HttpError, checkSameOrigin, errorResponse, isObject, json, readJson } from '../http.js';
import { MAX_TOKEN, verifyTurnstile } from './turnstile.js';
import { search } from './search.js';
import { createPlayer, renamePlayer } from './players.js';
import { leaderboard, postScore } from './scores.js';
import { addressOf, clock, googleClientId, setting } from './settings.js';
import { makeVisit } from './visits.js';
import { currentAccount, getMe, linkPlayer, signIn, signOut } from './accounts.js';
import { isSupporter, stripeWebhook } from './supporter.js';

export { DriveLimits } from './limits.js';

// The Cloudflare Worker behind World Drive (worlddrive.app, docs/world-drive.md). It only runs
// for /api/*; the site itself (npm run build:drive, dist-drive/) is served straight from
// Cloudflare's assets. Its job is to keep Google's bill in check: every page that loads Google's
// 3D tiles starts a billed Maps session, so the Maps key is handed out once per visit, only to a
// browser that passed Turnstile, and only while today's visits are under the caps. It also keeps
// the leaderboard (players.js, scores.js) in a D1 database: nicknames and each player's best stunt
// scores, posted with the visit's token so they come from visits that passed Turnstile. And the
// Supporter Pass (accounts.js, supporter.js): Google sign-in, the pass bought through Stripe, and
// for supporters more drives a day and a ⭐ on the leaderboard.
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
//   PER_VISITOR_DAILY_SUPPORTER   a supporter's visits a day (30 if unset), counted by account
//   GOOGLE_CLIENT_ID, SUPPORTER_*, STRIPE_WEBHOOK_SECRET   the Supporter Pass (see supporter.js)
//   DB                    the D1 database binding: the leaderboard's and the accounts' tables
//                         (worker/drive/migrations)
//   TURNSTILE_VERIFY_URL, SEARCH_UPSTREAM, TEST_CLOCK, GOOGLE_JWKS_URL   tests only (see
//                         scripts/test-drive-worker.mjs)

// Other names the Maps key may be set under (see mapsKey).
const KEY_NAMES = /^google_maps_api(_key)?$/i;

// sameOrigin: false skips the checks that a request comes from this site's own pages, for Stripe's
// webhook only: it comes from Stripe's servers, not a page, and is signed instead (supporter.js).
const ROUTES = [
	{ method: 'GET', path: '/api/config', handler: getConfig },
	{ method: 'POST', path: '/api/visit', handler: visit },
	{ method: 'GET', path: '/api/search', handler: search },
	{ method: 'POST', path: '/api/player', handler: createPlayer },
	{ method: 'POST', path: '/api/player/rename', handler: renamePlayer },
	{ method: 'POST', path: '/api/player/link', handler: linkPlayer },
	{ method: 'POST', path: '/api/score', handler: postScore },
	{ method: 'GET', path: '/api/leaderboard', handler: leaderboard },
	{ method: 'POST', path: '/api/session', handler: signIn },
	{ method: 'DELETE', path: '/api/session', handler: signOut },
	{ method: 'GET', path: '/api/me', handler: getMe },
	{ method: 'POST', path: '/api/stripe/webhook', handler: stripeWebhook, sameOrigin: false },
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

			const paths = ROUTES.filter( r => r.path === url.pathname );
			if ( ! paths.length ) throw new HttpError( 404, 'Not found' );
			const route = paths.find( r => r.method === request.method );
			if ( ! route ) throw new HttpError( 405, 'Method not allowed', {}, { Allow: paths.map( r => r.method ).join( ', ' ) } );
			if ( route.sameOrigin !== false ) {

				// Pages on other sites mustn't use the search or the visits either: browsers say where a
				// request comes from. And whatever changes something must be JSON from this site's own
				// pages (checkSameOrigin), which a form or a script on another site can't send.
				const site = request.headers.get( 'Sec-Fetch-Site' );
				if ( site && site !== 'same-origin' && site !== 'none' ) throw new HttpError( 403, 'Forbidden' );
				checkSameOrigin( request, url );

			}

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

// What the page needs before it starts: the Turnstile site key, whether there are maps today
// (without a key it shows a "back soon" screen instead of the globe), and the sign-in button's
// client id ('' when there's no signing in, see accounts.js).
function getConfig( { env } ) {

	return json( { turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? '', mapsOn: !! mapsKey( env ), googleClientId: googleClientId( env ) } );

}

// POST /api/visit { token }: the page asks for the Maps key once as it starts. Turnstile first,
// then the caps (both counted at once), and only then the key, with the visit's token for posting
// scores (visits.js). Over a cap: 429 with retryAfter, the seconds until midnight UTC, when the
// counts start again. A supporter signed in here is counted by their account, with a cap of their
// own; everyone else by their address.
async function visit( { request, env, url, limits, now } ) {

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

	const supporter = await supporterOf( { request, env, url, now } );
	const outcome = await limits.visit( supporter ? `account:${ supporter.id }` : addressOf( request ), {
		now,
		daily: setting( env.DAILY_VISITS, 300 ),
		perVisitor: supporter ? setting( env.PER_VISITOR_DAILY_SUPPORTER, 30 ) : setting( env.PER_VISITOR_DAILY, 8 ),
	} );
	if ( ! outcome.ok ) {

		const { reason, retryAfter } = outcome;
		const message = reason === 'daily' ? 'Today\'s free drives are used up' : 'You\'ve had today\'s free drives';
		throw new HttpError( 429, message, { reason, retryAfter }, { 'Retry-After': String( retryAfter ) } );

	}

	return json( { mapsKey: key, left: outcome.left, visit: await makeVisit( env, now ) } );

}

// The signed-in account if it has the Supporter Pass, else null. If the database can't say just now,
// the visit goes ahead as anyone's rather than not at all.
async function supporterOf( context ) {

	try {

		const account = await currentAccount( context );
		return account && await isSupporter( context.env, account ) ? account : null;

	} catch ( err ) {

		console.error( 'Supporter check', err?.name, err?.message );
		return null;

	}

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

