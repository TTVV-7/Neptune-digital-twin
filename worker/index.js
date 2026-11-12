import { HttpError, checkSameOrigin, errorResponse, json } from './http.js';
import { currentUser, publicUser, signIn, signOut } from './sessions.js';
import { createLayout, deleteLayout, getLayout, getShared, isShared, listLayouts, shareLayout, unshareLayout, updateLayout } from './layouts.js';
import { premiumFor, stripeWebhook } from './premium.js';
import { listPlacements, savePlacement } from './placements.js';
import { deleteSharedItem, listSharedItems, saveSharedItem } from './shared-items.js';
import { deleteAreaEdit, listAreaEdits, saveAreaEdit } from './area-edits.js';
import { deleteModelEdit, listModelEdits, saveModelEdit } from './model-edits.js';
import { createAreaPhoto, deleteAreaPhoto, getAreaPhotoFile, listAreaPhotos, putAreaPhotoFile, updateAreaPhoto } from './area-photos.js';

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
//   MAPS_KEY_FOR          optional: "everyone" hands the Maps key to every visitor instead
//   ALLOWED_EMAILS        optional, comma-separated: only these people can sign in...
//   ALLOWED_DOMAINS       optional, comma-separated: ...or anyone in these Google Workspace domains
//   GOOGLE_JWKS_URL       tests only: where to get the keys ID tokens are signed with
//   STRIPE_*, PREMIUM_*   premium equipment, off unless set (see premium.js)
//   PLACEMENT_KEY         secret, optional: the admin's passcode for saving for everyone: models'
//                         positions (placements.js), items (shared-items.js), repair areas
//                         changed in the twin (area-edits.js), their photos (area-photos.js,
//                         kept in the PHOTOS bucket, R2: wrangler.jsonc) and beams and paint
//                         added to a model (model-edits.js); without it
//                         nothing can be saved for everyone
// Without a database or GOOGLE_CLIENT_ID there are no accounts: /api/config tells the app to run
// on its own, as on a static host, and everything else answers 503, except what's saved for
// everyone (accounts: false: models' positions, shared items, moved areas), which needs only the database.

// bytes: true takes an image's bytes instead of JSON (a photo's file). auth: 'required' (the
// default) answers 401 when signed out; 'optional' looks the user up if
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
	{ method: 'GET', path: '/api/placements', handler: listPlacements, auth: 'none', accounts: false },
	{ method: 'PUT', path: '/api/placements', handler: savePlacement, auth: 'none', accounts: false },
	{ method: 'GET', path: '/api/shared-items', handler: listSharedItems, auth: 'none', accounts: false },
	{ method: 'PUT', path: '/api/shared-items/:id', handler: saveSharedItem, auth: 'none', accounts: false },
	{ method: 'DELETE', path: '/api/shared-items/:id', handler: deleteSharedItem, auth: 'none', accounts: false },
	{ method: 'GET', path: '/api/area-edits/:model', handler: listAreaEdits, auth: 'none', accounts: false },
	{ method: 'PUT', path: '/api/area-edits/:model/:id', handler: saveAreaEdit, auth: 'none', accounts: false },
	{ method: 'DELETE', path: '/api/area-edits/:model/:id', handler: deleteAreaEdit, auth: 'none', accounts: false },
	{ method: 'GET', path: '/api/model-edits/:model', handler: listModelEdits, auth: 'none', accounts: false },
	{ method: 'PUT', path: '/api/model-edits/:model/:id', handler: saveModelEdit, auth: 'none', accounts: false },
	{ method: 'DELETE', path: '/api/model-edits/:model/:id', handler: deleteModelEdit, auth: 'none', accounts: false },
	{ method: 'GET', path: '/api/area-photos/:model', handler: listAreaPhotos, auth: 'none', accounts: false },
	{ method: 'POST', path: '/api/area-photos/:model/:area', handler: createAreaPhoto, auth: 'none', accounts: false },
	{ method: 'PUT', path: '/api/area-photos/:model/:area/:id', handler: updateAreaPhoto, auth: 'none', accounts: false },
	{ method: 'DELETE', path: '/api/area-photos/:model/:area/:id', handler: deleteAreaPhoto, auth: 'none', accounts: false },
	{ method: 'GET', path: '/api/area-photos/:model/:area/:id/:kind', handler: getAreaPhotoFile, auth: 'none', accounts: false },
	{ method: 'PUT', path: '/api/area-photos/:model/:area/:id/:kind', handler: putAreaPhotoFile, auth: 'none', accounts: false, bytes: true },
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

	if ( route.accounts === false ) {

		if ( ! env.DB ) throw new HttpError( 503, 'No database' );

	} else if ( ! env.DB || ! env.GOOGLE_CLIENT_ID ) return withoutAccounts( request, url, env );
	if ( route.sameOrigin !== false ) checkSameOrigin( request, url, route.bytes === true );
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
	if ( env.GOOGLE_MAPS_API_KEY && ( keyForEveryone( env ) || user || await isShared( env, url.searchParams.get( 'view' ) ) ) ) config.mapsKey = env.GOOGLE_MAPS_API_KEY;
	config.premium = await premiumFor( env, user );
	return json( config );

}

async function getMe( { env, user } ) {

	return json( { user: publicUser( user ), premium: await premiumFor( env, user ) } );

}

// No database or no sign-in client (a Vercel project before its database is connected, say): the
// app gets the answer that makes it run on its own, with no sign-in and the usual key prompt.
// Nothing else can work.
function withoutAccounts( request, url, env ) {

	if ( request.method === 'GET' && url.pathname === '/api/config' ) {

		const config = { googleClientId: '', signedIn: false, premium: { enabled: false } };
		if ( env.GOOGLE_MAPS_API_KEY && keyForEveryone( env ) ) config.mapsKey = env.GOOGLE_MAPS_API_KEY;
		return json( config );

	}

	throw new HttpError( 503, 'Accounts aren\'t set up' );

}

// MAPS_KEY_FOR=everyone hands the Maps key to every visitor, signed in or not, so the site opens
// on Google's tiles with no key prompt and no sign-in. Anyone with the address can then load tiles
// on the key (each visit is a billed session) and read the key itself, so it must be restricted to
// the site's address in the Google Cloud console.
function keyForEveryone( env ) {

	return String( env.MAPS_KEY_FOR ?? '' ).trim().toLowerCase() === 'everyone';

}
