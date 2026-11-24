import { HttpError, checkSameOrigin, errorResponse, isObject, json, readJson } from '../http.js';
import { MAX_TOKEN, verifyTurnstile } from './turnstile.js';
import { search } from './search.js';
import { createPlayer, renamePlayer } from './players.js';
import { leaderboard, postScore } from './scores.js';
import { postProgress, progressPlaces, setTitle } from './progress.js';
import { addressOf, adsense, clock, googleClientId, setting } from './settings.js';
import { makeVisit } from './visits.js';
import { accountPlayer, currentAccount, getMe, linkPlayer, signIn, signOut } from './accounts.js';
import { adminRequestChange, adminRequests, sendRequest } from './requests.js';
import { adminResetLink, linkGoogle, passwordSignIn, passwordsOn, removePassword, resetCheck, resetPassword, setContactEmail, setPassword, signOutEverywhere, signUp, unlinkGoogle } from './logins.js';
import { isSupporter, stripeWebhook } from './supporter.js';
import { live, liveToday, online } from './live.js';
import { adminStats, countVisit, postStats } from './stats.js';
import { isAdmin } from './admin.js';
import { buildApi, isBuildApi } from './build.js';
import { adminComp, adminComps } from './billing.js';
import { adminBuildCustomer, adminBuildStats } from './build-stats.js';
import { isOAuth, oauth } from './oauth.js';
import { isMcp, mcp } from './mcp.js';
import { adminDropins } from './dropins.js';
import { LINK_PATH } from '../../src/drive-app/challenge-rules.js';
import { adminChallenges, adminChange, challengeBoard, challengeGhost, challengeLink, linkPage, listChallenges, postTime } from './challenges.js';
import { BUDGET_SPENT, LIVE_WORLD_IDS } from '../../src/drive-app/live-protocol.js';
import { adminAchievements, postAchievements } from './achievements.js';
import { EARTH, WORLDS, isWorld } from '../../src/drive-app/worlds.js';

export { DriveLimits } from './limits.js';
export { DriveRoom } from './live.js';

// The Cloudflare Worker behind World Drive (worlddrive.app, docs/world-drive.md). It only runs for
// /api/*, /c (LINK_PATH: a "challenge a friend" link's page, the home page with a preview card
// of its own for chat apps) and /ads.txt (AdSense's, made from ADSENSE_CLIENT); the rest of the
// site (npm run build:drive, dist-drive/), the home page included, is served straight from
// Cloudflare's assets. Its job is to keep Google's bill in check: every page that loads Google's 3D
// tiles starts a billed Maps session, so the Maps key is handed
// out once per visit, only to a browser that passed Turnstile, and only while today's visits are
// under the caps. It also keeps the leaderboard (players.js, scores.js) in a D1 database: nicknames
// and each player's best stunt scores, posted with the visit's token so they come from visits that
// passed Turnstile, and each player's XP and level (progress.js). And the Supporter Pass
// (accounts.js, logins.js, supporter.js): Google's sign-in or a username and password's, the pass
// bought through Stripe, and for supporters more drives a day and a ⭐ on the leaderboard. Driving
// with others (live.js) is a WebSocket to a room, one Durable Object a party or area, that tells
// everyone where the others are; /api/online says where people are driving now, for the globe's
// dots. And the owner's play stats (stats.js) with where people drop in (dropins.js), for the admin
// page. And achievements (achievements.js): badges for what a player has done, and the
// construction rides they unlock. And challenges (challenges.js): a daily, a weekly and a monthly
// one on each world, each with its own board of the best times, picked by themselves or by the
// owner on the admin page.
//
// Settings (wrangler.drive.jsonc vars, or secrets):
//   GOOGLE_MAPS_API_KEY   secret: the Maps key for World Drive's own Google Cloud project (a
//                         secret named Google_maps_api, in any case, works as well: see mapsKey)
//   TURNSTILE_SECRET      secret: the Turnstile widget's secret key
//   TURNSTILE_SITE_KEY    the widget's site key (public)
//   DAILY_VISITS          visits a day for everyone together (500 if unset); 0 closes for the day. A
//                         supporter's are neither held by it nor counted towards it
//   PER_VISITOR_DAILY     Earth visits a day per visitor (1 if unset); past it, the page opens on the Moon
//   NAMES_PER_VISITOR_DAILY, SCORES_PER_VISITOR_DAILY   the leaderboard's new names and renames
//                         (20 if unset) and scores (1500) a day per visitor
//   PER_VISITOR_DAILY_SUPPORTER   a supporter's visits a day (30 if unset), counted by account,
//                                 and never turned away by DAILY_VISITS
//   GOOGLE_CLIENT_ID, SUPPORTER_*, STRIPE_WEBHOOK_SECRET   the Supporter Pass (see supporter.js)
//   STRIPE_SECRET_KEY, BUILD_PRICE_*, BUILD_PORTAL_CONFIG   selling World Drive Build Pro (see billing.js)
//   PASSWORD_ACCOUNTS     'off' switches usernames and passwords off (logins.js); PASSWORD_ITERATIONS
//                         tests only (or to lower PBKDF2's count, see logins.js)
//   DB                    the D1 database binding: the leaderboard's and the accounts' tables
//                         (worker/drive/migrations)
//   LIVE                  'off' switches driving with others off (anything else, or unset, is on)
//   LIVE_DAILY_BUDGET     the Durable Object requests a day driving with others may use on the Earth
//                         (40000 if unset), then it's off there till midnight UTC (see live.js); 0 is off
//   LIVE_MOON_DAILY_BUDGET, LIVE_MARS_DAILY_BUDGET, LIVE_VESTA_DAILY_BUDGET, LIVE_CERES_DAILY_BUDGET
//                         each other world's, apart (20000, 4000, 3000 and 3000 if unset): spending one
//                         world's never shuts another's rooms; 0 is off on that world. A far world's
//                         (Mars's, Vesta's, Ceres's) pays only for its own rooms and connections, never
//                         for /api/config or anyone watching its globe (/api/online)
//   LIVE_ADDRESS_VISITS   the most visits not counted against the Earth's caps (the free worlds') that
//                         connect to rooms from one address (an IPv6 one by its /48) in a day (20)
//   LIVE_ADDRESS_SHARE    each world's budget over this (8 if unset) is what one address's
//                         connections may spend there in a day (the owner's aren't counted)
//   LIVE_ADDRESS_FLOOR    but never less than this on any world (1000 if unset; 0 for none), so a
//                         small world's share is still a drive of a while
//   LIVE_PARTY_MAX, LIVE_NEARBY_MAX   the most in a party (8 if unset) and in an area's room (20)
//   LIVE_VISIT_CONNECTS   the most connections to rooms a visit makes in a day (200 if unset)
//   ROOMS                 the Durable Object binding for the rooms (DriveRoom, live.js)
//   ADMIN_EMAILS          secret or var, comma-separated: the Google accounts that may see the play
//                         stats (GET /api/admin/stats and /api/admin/dropins, the page at
//                         /admin.html; see admin.js, stats.js and dropins.js)
//   ADMIN_LOOKS           the rate limiter binding for the admin page's asks, by account (admin.js)
//   BUILD_VIEW_COST_USD   what Google bills a World Drive Build 3D map view, for the admin page's
//                         Build tab's estimate (0.006 if unset; build-stats.js)
//   STATS_POSTS           the rate limiter binding for each visit's posts of play stats (stats.js)
//   DROPIN_PLACES_DAILY, DROPIN_PLACES_PER_VISITOR, DROPIN_PLACES_PER_VISIT   the most drop-in
//                         places counted a day on each world for everyone (1500 if unset), each
//                         visitor (30) and each visit (10); DROPIN_ASKS_PER_VISIT the most times a
//                         day a visit's places are asked about (twice its places) (dropins.js)
//   LIVE_CONNECTS         the rate limiter binding for each visit's connections to rooms (live.js)
//   PROGRESS_POSTS        the rate limiter binding for each player's reports of what they drove
//                         (progress.js)
//   CHALLENGE_LOOKS       the rate limiter binding for the challenges' lists, boards, links, ghosts
//                         and times, by a keyed hash of the address (an IPv6 one by its /48) and the
//                         day (never the address itself); CHALLENGE_MISSES the one for those of the
//                         lists, boards, links and ghosts that miss the cache and read D1, and the
//                         times posted that read it, by the same key;
//                         CHALLENGE_TIMES_PER_VISITOR_DAILY the times a visitor may post a day (300
//                         if unset), CHALLENGE_TIMES_PER_VISIT the times a visit may post (100 if
//                         unset), CHALLENGE_GHOST_BUDGET the most of its ghosts' text a challenge
//                         keeps (16,777,216 characters if unset) (challenges.js)
//   ACHIEVEMENT_LOOKS     the rate limiter binding for a visitor's asks for their achievements, by
//                         the same key as CHALLENGE_LOOKS; ACHIEVEMENT_LOOKS_PER_VISITOR_DAILY the
//                         asks a visitor (by their /48) may make a day (200 if unset) (achievements.js)
//   PASSWORD_TRIES        the rate limiter binding for a visitor's password sign-ins, checks and
//                         account changes, by the same key as CHALLENGE_LOOKS (logins.js)
//   ADSENSE_CLIENT, ADSENSE_SLOT   Google AdSense on the globe (settings.js's adsense): the publisher
//                         id (ca-pub-...) and, if wanted, a display unit's slot id; empty (or not
//                         one), no ads and /ads.txt is a 404
//   TURNSTILE_VERIFY_URL, SEARCH_UPSTREAM, TEST_CLOCK, GOOGLE_JWKS_URL   tests only (see
//                         scripts/test-drive-worker.mjs)

// Other names the Maps key may be set under (see mapsKey).
const KEY_NAMES = /^google_maps_api(_key)?$/i;

// Where AdSense's crawler looks for who may sell ads on the site (run_worker_first in
// wrangler.drive.jsonc, so it's the Worker's, not a file's).
const ADS_TXT = '/ads.txt';
// Google's certification authority id, the same in every AdSense publisher's ads.txt line.
const GOOGLE_TAG = 'f08c47fec0942fa0';

// sameOrigin: false skips the checks that a request comes from this site's own pages, for Stripe's
// webhook only: it comes from Stripe's servers, not a page, and is signed instead (supporter.js).
const ROUTES = [
	{ method: 'GET', path: '/api/config', handler: getConfig },
	{ method: 'POST', path: '/api/visit', handler: visit },
	{ method: 'GET', path: '/api/search', handler: search },
	{ method: 'POST', path: '/api/player', handler: createPlayer },
	{ method: 'POST', path: '/api/player/rename', handler: renamePlayer },
	{ method: 'POST', path: '/api/player/link', handler: linkPlayer },
	{ method: 'POST', path: '/api/player/mine', handler: accountPlayer },
	{ method: 'POST', path: '/api/player/title', handler: setTitle },
	{ method: 'POST', path: '/api/achievements', handler: postAchievements },
	{ method: 'POST', path: '/api/score', handler: postScore },
	{ method: 'POST', path: '/api/progress', handler: postProgress },
	{ method: 'GET', path: '/api/leaderboard', handler: leaderboard },
	{ method: 'POST', path: '/api/session', handler: signIn },
	{ method: 'DELETE', path: '/api/session', handler: signOut },
	{ method: 'GET', path: '/api/me', handler: getMe },
	{ method: 'POST', path: '/api/account/sign-up', handler: signUp },
	{ method: 'POST', path: '/api/account/sign-in', handler: passwordSignIn },
	{ method: 'POST', path: '/api/account/password', handler: setPassword },
	{ method: 'DELETE', path: '/api/account/password', handler: removePassword },
	{ method: 'POST', path: '/api/account/google', handler: linkGoogle },
	{ method: 'DELETE', path: '/api/account/google', handler: unlinkGoogle },
	{ method: 'POST', path: '/api/account/sign-out-everywhere', handler: signOutEverywhere },
	{ method: 'POST', path: '/api/account/email', handler: setContactEmail },
	{ method: 'POST', path: '/api/account/reset-check', handler: resetCheck },
	{ method: 'POST', path: '/api/account/reset', handler: resetPassword },
	{ method: 'POST', path: '/api/requests', handler: sendRequest },
	{ method: 'POST', path: '/api/progress/places', handler: progressPlaces },
	{ method: 'GET', path: '/api/live', handler: live },
	{ method: 'GET', path: '/api/online', handler: online },
	{ method: 'POST', path: '/api/stats', handler: postStats },
	{ method: 'GET', path: '/api/admin/stats', handler: adminStats },
	{ method: 'POST', path: '/api/admin/reset-link', handler: adminResetLink },
	{ method: 'GET', path: '/api/admin/requests', handler: adminRequests },
	{ method: 'POST', path: '/api/admin/requests', handler: adminRequestChange },
	{ method: 'GET', path: '/api/admin/dropins', handler: adminDropins },
	{ method: 'GET', path: '/api/admin/achievements', handler: adminAchievements },
	// World Drive Build Pro given without paying, or taken back (billing.js).
	{ method: 'GET', path: '/api/admin/build/comps', handler: adminComps },
	{ method: 'POST', path: '/api/admin/build/comp', handler: adminComp },
	// World Drive Build's own numbers, and one customer looked up, for the admin page's Build tab (build-stats.js).
	{ method: 'GET', path: '/api/admin/build', handler: adminBuildStats },
	{ method: 'GET', path: '/api/admin/build/customer', handler: adminBuildCustomer },
	{ method: 'GET', path: '/api/challenges', handler: listChallenges },
	{ method: 'GET', path: '/api/challenges/board', handler: challengeBoard },
	{ method: 'POST', path: '/api/challenges/time', handler: postTime },
	{ method: 'GET', path: '/api/challenges/link', handler: challengeLink },
	{ method: 'GET', path: '/api/challenges/ghost', handler: challengeGhost },
	{ method: 'GET', path: '/api/admin/challenges', handler: adminChallenges },
	{ method: 'POST', path: '/api/admin/challenges', handler: adminChange },
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

		// AdSense's ads.txt, saying who may sell ads here: only with a publisher id set (adsTxt).
		if ( url.pathname === ADS_TXT ) return adsTxt( request, env );

		// World Drive Build's MCP server (/mcp, mcp.js) and the OAuth that connects Claude to it (oauth.js).
		if ( isMcp( url ) || isOAuth( url ) ) {

			try {

				const limits = env.LIMITS.get( env.LIMITS.idFromName( 'global' ) );
				const context = { request, env, url, ctx, limits, now: clock( request, env ) };
				return await ( isMcp( url ) ? mcp( context ) : oauth( context ) );

			} catch ( err ) {

				if ( err instanceof HttpError ) return errorResponse( err );
				console.error( 'MCP error', err?.name, err?.message );
				return json( { error: 'Something went wrong' }, 500 );

			}

		}

		// World Drive Build's page (/build/: the construction mock-up app) asks /build/api/* (build.js).
		if ( isBuildApi( url ) ) {

			try {

				const limits = env.LIMITS.get( env.LIMITS.idFromName( 'global' ) );
				return await buildApi( { request, env, url, ctx, limits, now: clock( request, env ), mapsKey: mapsKey( env ) } );

			} catch ( err ) {

				if ( err instanceof HttpError ) return errorResponse( err );
				console.error( 'Build API error', err?.name, err?.message );
				return json( { error: 'Something went wrong' }, 500 );

			}

		}

		if ( ! url.pathname.startsWith( '/api/' ) ) {

			// A "challenge a friend" link (/c?challenge=&vs=, LINK_PATH): the page with its own preview for
			// chat apps (challenges.js), and if anything goes wrong in that, the page as it is. The Worker
			// runs for nothing else but /api/* (run_worker_first in wrangler.drive.jsonc: the home page
			// and the rest are files, served free and never turned away), so anything else here is
			// passed on as it is.
			if ( url.pathname !== LINK_PATH ) return env.ASSETS.fetch( request );
			const plain = () => env.ASSETS.fetch( new Request( new URL( '/', url ).href, { method: request.method === 'HEAD' ? 'HEAD' : 'GET', headers: request.headers } ) );
			if ( request.method !== 'GET' ) return plain();
			try {

				return await linkPage( { request, env, url, ctx, now: clock( request, env ) } );

			} catch ( err ) {

				console.error( 'Challenge link page', err?.name, err?.message );
				return plain();

			}

		}

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

// /ads.txt (the IAB's ads.txt: who may sell ads on the site): AdSense's one line, with the publisher
// id from ADSENSE_CLIENT (pub-..., without its ca-), while ads are on; a 404 while they're off, as
// any missing file is.
function adsTxt( request, env ) {

	const ads = adsense( env );
	if ( request.method !== 'GET' && request.method !== 'HEAD' ) return new Response( 'Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' } } );
	if ( ! ads ) return new Response( 'Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } } );
	const body = `google.com, ${ ads.client.slice( 3 ) }, DIRECT, ${ GOOGLE_TAG }\n`;
	return new Response( request.method === 'HEAD' ? null : body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } } );

}

// What the page needs before it starts: the Turnstile site key, whether there are maps today
// (without a key it shows a "back soon" screen instead of the globe), the sign-in button's client
// id ('' when there's no signing in with Google, see accounts.js), whether there are usernames and
// passwords (passwords, logins.js), adsense: { client, slot } only while Google's ads are on
// (settings.js's adsense; nothing about ads otherwise), and whether driving with others is on on the
// Earth (live), with liveReason: BUDGET_SPENT when it's off for the rest of the day (its budget, see
// live.js), and on the Moon (liveMoon: its rooms have a budget of their own, so it can be on there
// with the Earth's spent; a page from before the Moon had drivers doesn't read it), with
// liveMoonReason the same way for the Moon's (none when it's only switched off there, so the page
// says nothing of lots of drivers). And every world's at once, liveWorlds: { earth: { open,
// reason? }, moon, mars, vesta, ceres }, reason the same way (a page since Mars, Vesta and Ceres
// have drivers reads only this; one from before reads the others, which are as they always were).
// If DriveLimits can't say, every world is off, with liveReason, liveMoonReason and each reason
// 'unknown': a page already driving with others that was turned away tries again rather than
// stopping.
async function getConfig( { env, limits, now } ) {

	const today = await liveToday( { env, limits, now } );
	const ads = adsense( env );
	return json( {
		turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? '', mapsOn: !! mapsKey( env ), googleClientId: googleClientId( env ), passwords: passwordsOn( env ), live: today.open, liveMoon: today.moon.open,
		...( ads ? { adsense: ads } : {} ),
		...( today.reason === BUDGET_SPENT || today.reason === 'unknown' ? { liveReason: today.reason } : {} ),
		...( today.moon.reason === BUDGET_SPENT || today.moon.reason === 'unknown' ? { liveMoonReason: today.moon.reason } : {} ),
		liveWorlds: Object.fromEntries( LIVE_WORLD_IDS.map( world => {

			const { open, reason } = today.worlds?.[ world ] ?? { open: false, reason: 'unknown' };
			return [ world, { open, ...( reason === BUDGET_SPENT || reason === 'unknown' ? { reason } : {} ) } ];

		} ) ),
	} );

}

// POST /api/visit { token, world, globe, fromGlobe }: the page asks for a visit as it starts, and for
// the Maps key when it first drives on the Earth. Turnstile first, then the caps (both counted at
// once), and only then the key, with the visit's token for posting scores (visits.js). The caps are
// the Earth's: Google's tiles cost a little each visit, and the worlds made in the page (worlds.js's
// free ones, every one but the Earth: body.js, our own ground) cost nothing to stream, so they're
// never limited:
// - globe: true (and no free world): the page's own globe, our picture of the Earth, which costs
//   nothing either. The page asks for this as it starts, so the leaderboard, the stats and driving
//   with others have a visit, and asks for the Earth's drive (fromGlobe) only once someone drives on
//   the Earth: { free: true, globe: true, world: 'earth', visit }, no key and nothing counted against
//   the caps, counted for the admin page as 'globe'.
// - fromGlobe: true: an Earth visit (the caps, the key) for a page already counted as a visit (its
//   globe's, the orrery's, or a link's to another world): counted by where it went (visit_kind) but not again as
//   a visit, so the admin page's Visits stay one a page.
// - world: one of those, 'moon', 'mars', 'vesta' or 'ceres' (the page opened on a link to it): no
//   key and nothing counted against the caps, { moon: true, free: true, world, visit } (moon: true
//   as the answer always was for the Moon, which a page from before Mars, still in a browser's
//   cache, goes by).
//   The Earth from there is the page's own globe, its drive asked for with fromGlobe. Any other
//   world (one that isn't one, or 'earth') is the globe's (globe: true) or the Earth's visit.
//   With start: 'orrery' (a plain load, which opens on the orrery to pick a world before any of the
//   day's Earth drives is spent: boot.js) it's counted as 'orrery' rather than as a link to that
//   world; any other start is ignored. A page from before sends none, and is counted as before.
// - Over a cap: 429 with retryAfter (the seconds until midnight UTC, when the counts start again)
//   and a visit all the same, so the page can still open on the Moon.
// Those two visits' tokens say so (visits.js: a free world's), so they post no Earth drop-in places
// (dropins.js); a visit the Earth's caps let through says it's the Earth's, and the owner's, on
// any world, says it's theirs (so it posts no places at all: the admin page's Drive links mustn't
// add to the places it shows).
// A supporter signed in here is counted by their account, with a cap of their own; the owner's
// accounts (ADMIN_EMAILS) aren't counted at all; everyone else is counted by their address.
async function visit( { request, env, url, ctx, limits, now } ) {

	const body = await readJson( request, 8192 );
	const token = isObject( body ) && typeof body.token === 'string' ? body.token : '';
	if ( ! token || token.length > MAX_TOKEN ) throw new HttpError( 400, 'Bad request' );
	const world = isWorld( body.world ) && WORLDS[ body.world ].free ? body.world : EARTH;
	if ( ! env.TURNSTILE_SECRET ) throw new HttpError( 503, 'Not set up yet' );

	const ip = request.headers.get( 'CF-Connecting-IP' ) ?? '';
	const check = await verifyTurnstile( env, token, ip );
	if ( check.unavailable ) throw new HttpError( 503, 'Couldn\'t check right now. Try again' );
	if ( ! check.ok ) throw new HttpError( 403, 'The robot check didn\'t pass' );

	// Counted for the admin page's stats (stats.js), without holding up the answer.
	if ( world !== EARTH ) {

		const kind = body.start === 'orrery' ? 'orrery' : `${ world }_link`;
		ctx?.waitUntil?.( countVisit( env, now, kind ) );
		const { admin } = await whoIsVisiting( { request, env, url, now }, { supporter: false } );
		return json( { moon: true, free: true, world, visit: await makeVisit( env, now, admin ? 'owner' : 'free' ) } );

	}

	// The globe's visit: a free one, as a free world's is (no `moon: true`: only a page that knows
	// the globe's visit asks for it).
	if ( body.globe === true ) {

		ctx?.waitUntil?.( countVisit( env, now, 'globe' ) );
		const { admin } = await whoIsVisiting( { request, env, url, now }, { supporter: false } );
		return json( { free: true, globe: true, world: EARTH, visit: await makeVisit( env, now, admin ? 'owner' : 'free' ) } );

	}

	// (An Earth drive for a page counted already as a visit: by where it went, not as a visit again.)
	const again = { again: body.fromGlobe === true };

	// Before counting: with no key there's nothing to count.
	const key = mapsKey( env );
	if ( ! key ) throw new HttpError( 503, 'Maps are off today' );

	const { supporter, admin } = await whoIsVisiting( { request, env, url, now } );
	if ( admin ) {

		ctx?.waitUntil?.( countVisit( env, now, 'owner', again ) );
		return json( { mapsKey: key, left: null, visit: await makeVisit( env, now, 'owner' ) } );

	}

	// A supporter (a lifetime, monthly or day pass) has paid for their drives: counted by their account,
	// never by the address they're at (a school's, shared by hundreds), and outside the day's cap for
	// everyone, which neither turns them away nor counts their drives, so they never use up the free
	// players' share.
	const outcome = await limits.visit( supporter ? `account:${ supporter.id }` : addressOf( request ), {
		now,
		daily: supporter ? null : setting( env.DAILY_VISITS, 500 ),
		perVisitor: supporter ? setting( env.PER_VISITOR_DAILY_SUPPORTER, 30 ) : setting( env.PER_VISITOR_DAILY, 1 ),
	} );
	if ( ! outcome.ok ) {

		const { reason, retryAfter } = outcome;
		// Counted all the same (the page opens on the Moon instead, or from its globe stays there), so
		// the admin page shows every visit, not only the ones under the caps.
		ctx?.waitUntil?.( countVisit( env, now, reason === 'daily' ? 'moon_daily_cap' : 'moon_visitor_cap', again ) );
		const message = reason === 'daily' ? 'Today\'s free drives are used up' : 'You\'ve had today\'s free drives';
		throw new HttpError( 429, message, { reason, retryAfter, visit: await makeVisit( env, now, 'free' ) }, { 'Retry-After': String( retryAfter ) } );

	}

	ctx?.waitUntil?.( countVisit( env, now, supporter ? 'earth_supporter' : 'earth', again ) );
	return json( { mapsKey: key, left: outcome.left, visit: await makeVisit( env, now ) } );

}

// Who's asking for a visit: { supporter } the signed-in account if it has the Supporter Pass (not
// asked with supporter: false, for a free world's visit, which no pass changes), and { admin }
// whether it's one of the owner's (ADMIN_EMAILS). Signed out, that's no request to the database. If
// the database can't say just now, the visit goes ahead as anyone's rather than not at all.
async function whoIsVisiting( context, { supporter = true } = {} ) {

	try {

		const account = await currentAccount( context );
		if ( ! account ) return { supporter: null, admin: false };
		if ( isAdmin( context.env, account ) ) return { supporter: null, admin: true };
		return { supporter: supporter && await isSupporter( context.env, account, context.now ) ? account : null, admin: false };

	} catch ( err ) {

		console.error( 'Supporter check', err?.name, err?.message );
		return { supporter: null, admin: false };

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

