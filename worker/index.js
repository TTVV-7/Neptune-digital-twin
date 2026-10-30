import { HttpError, checkSameOrigin, errorResponse, json } from './http.js';
import { currentUser, publicUser, signIn, signOut } from './sessions.js';
import { createLayout, deleteLayout, getLayout, getShared, isShared, listLayouts, shareLayout, unshareLayout, updateLayout } from './layouts.js';
import { premiumFor, stripeWebhook } from './premium.js';

// The Cloudflare Worker behind the app: "Sign in with Google", layouts saved to your account
// and shared by link (see docs/accounts.md), and premium equipment bought with Stripe
// (premium.js, docs/premium.md). It only runs for /api/*; everything else is the built site in
// dist/, served straight from Cloudflare's assets. The same code runs as a Vercel Function on
// Postgres (vercel.js, docs/deploy-vercel.md).
//
// Settings (wrangler.jsonc vars, or secrets):
//   GOOGLE_CLIENT_ID      the OAuth client id of the "Sign in with Google" button (public)
//   GOOGLE_MAPS_API_KEY   secret, optional: the Maps key, handed only to signed-in users and to
//                         people opening a share link, so it isn't built into the public site
//   ALLOWED_EMAILS        optional, comma-separated: only these people can sign in...
//   ALLOWED_DOMAINS       optional, comma-separated: ...or anyone in these Google Workspace domains
//   GOOGLE_JWKS_URL       tests only: where to get the keys ID tokens are signed with
//   STRIPE_*, PREMIUM_*   premium equipment, off unless set (see premium.js)
// Without a database or GOOGLE_CLIENT_ID there are no accounts: /api/config tells the app to run
// on its own, as on a static host, and everything else answers 503.

// auth: 'required' (the default) answers 401 when signed out; 'optional' looks the user up if
// there's a session; 'none' doesn't. sameOrigin: false skips the cross-site check, for Stripe's
// webhook only: it comes from Stripe's servers, not a page, and is signed instead.
const ROUTES = [
	{ method: 'GET', path: '/api/config', handler: getConfig, auth: 'optional' },
	{ method: 'POST', path: '/api/session', handler: signIn, auth: 'none' },
	{ method: 'DELETE', path: '/api/session', handler: signOut, auth: 'none' },
	{ method: 'GET', path: '/api/me', handler: getMe },
	{ method: 'GET', path: '/api/layouts', handler: listLayouts },
	{ method: 'POST', path: '/api/layouts', handler: createLayout },
	{ method: 'GET', path: '/api/layouts/:id', handler: getLayout },
	{ method: 'PUT', path: '/api/layouts/:id', handler: updateLayout },
	{ method: 'DELETE', path: '/api/layouts/:id', handler: deleteLayout },
	{ method: 'POST', path: '/api/layouts/:id/share', handler: shareLayout },
	{ method: 'DELETE', path: '/api/layouts/:id/share', handler: unshareLayout },
	{ method: 'GET', path: '/api/shared/:token', handler: getShared, auth: 'none' },
	{ method: 'POST', path: '/api/stripe/webhook', handler: stripeWebhook, auth: 'none', sameOrigin: false },
];

export default {

	async fetch( request, env ) {

		const url = new URL( request.url );
		if ( ! url.pathname.startsWith( '/api/' ) ) return env.ASSETS.fetch( request );

		try {

			return await handle( request, env, url );

		} catch ( err ) {

			if ( err instanceof HttpError ) return errorResponse( err );
			// Just what went wrong, never the request: bodies, cookies and tokens stay out of the logs.
			console.error( 'API error', err?.name, err?.message );
			return json( { error: 'Something went wrong' }, 500 );

		}

	},

};

async function handle( request, env, url ) {

	const { route, params, allowed } = findRoute( request.method, url.pathname );
	if ( ! route ) {

		if ( allowed.length ) throw new HttpError( 405, 'Method not allowed', {}, { Allow: allowed.join( ', ' ) } );
		throw new HttpError( 404, 'Not found' );

	}

	if ( ! env.DB || ! env.GOOGLE_CLIENT_ID ) return withoutAccounts( request, url );
	if ( route.sameOrigin !== false ) checkSameOrigin( request, url );
	const auth = route.auth ?? 'required';
	const user = auth === 'none' ? null : await currentUser( request, env, url );
	if ( auth === 'required' && ! user ) throw new HttpError( 401, 'Sign in first' );
	return route.handler( { request, env, url, user, params } );

}

// The route for this method and path, with :params filled in. If the path exists but not for
// this method, allowed lists the methods it takes.
function findRoute( method, pathname ) {

	const parts = pathname.split( '/' );
	const allowed = [];
	for ( const route of ROUTES ) {

		const pattern = route.path.split( '/' );
		if ( pattern.length !== parts.length ) continue;
		const params = {};
		const same = pattern.every( ( segment, i ) => {

			if ( ! segment.startsWith( ':' ) ) return segment === parts[ i ];
			params[ segment.slice( 1 ) ] = parts[ i ];
			return parts[ i ] !== '';

		} );
		if ( ! same ) continue;
		if ( route.method === method ) return { route, params, allowed };
		allowed.push( route.method );

	}

	return { route: null, params: null, allowed };

}

// What the page needs before it starts: whether sign-in is set up, who is signed in, the Maps
// key if this visitor may have it, and whether premium is on and theirs.
async function getConfig( { env, url, user } ) {

	const config = { googleClientId: env.GOOGLE_CLIENT_ID ?? '', signedIn: !! user };
	if ( user ) config.user = publicUser( user );
	if ( env.GOOGLE_MAPS_API_KEY && ( user || await isShared( env, url.searchParams.get( 'view' ) ) ) ) config.mapsKey = env.GOOGLE_MAPS_API_KEY;
	config.premium = await premiumFor( env, user );
	return json( config );

}

async function getMe( { env, user } ) {

	return json( { user: publicUser( user ), premium: await premiumFor( env, user ) } );

}

// No database or no sign-in client (a Vercel project before its database is connected, say): the
// app gets the answer that makes it run on its own, with no sign-in and the usual key prompt.
// Nothing else can work.
function withoutAccounts( request, url ) {

	if ( request.method === 'GET' && url.pathname === '/api/config' ) return json( { googleClientId: '', signedIn: false, premium: { enabled: false } } );
	throw new HttpError( 503, 'Accounts aren\'t set up' );

}
