import { HttpError, fromBase64url } from './http.js';

// Checks a "Sign in with Google" ID token ourselves, as Google describes in
// https://developers.google.com/identity/gsi/web/guides/verify-google-id-token: an RS256
// signature by one of Google's current keys, issued by Google, for our client id, not expired,
// with a verified email.

const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = [ 'accounts.google.com', 'https://accounts.google.com' ];
// Seconds of clock difference allowed between Google and us.
const CLOCK_SKEW = 60;
// Google's keys say how long to cache them (hours); stay within these bounds whatever they say.
const MIN_CACHE = 60;
const MAX_CACHE = 24 * 3600;
// An unknown key id makes us look again (Google rotates keys), but not more often than this,
// so made-up tokens can't make every request fetch the keys.
const REFETCH_INTERVAL = 60;
const MAX_TOKEN = 4096;

const unauthorised = () => new HttpError( 401, 'Sign-in failed' );

// Per isolate: { url, keys: Map( kid -> CryptoKey ), expires, fetchedAt } in seconds.
let cache = null;
// A fetch of the keys in progress, shared by requests arriving meanwhile.
let pending = null;

// Returns the token's claims, or throws a 401.
export async function verifyIdToken( token, { clientId, certsUrl } ) {

	if ( typeof token !== 'string' || token.length > MAX_TOKEN ) throw unauthorised();
	const parts = token.split( '.' );
	if ( parts.length !== 3 ) throw unauthorised();
	const header = decodePart( parts[ 0 ] );
	const claims = decodePart( parts[ 1 ] );
	if ( header?.alg !== 'RS256' || typeof header.kid !== 'string' || ! claims ) throw unauthorised();

	const key = await googleKey( header.kid, certsUrl ?? GOOGLE_CERTS );
	let signature;
	try {

		signature = fromBase64url( parts[ 2 ] );

	} catch {

		throw unauthorised();

	}

	const signed = new TextEncoder().encode( `${ parts[ 0 ] }.${ parts[ 1 ] }` );
	if ( ! key || ! await crypto.subtle.verify( 'RSASSA-PKCS1-v1_5', key, signature, signed ) ) throw unauthorised();

	checkClaims( claims, clientId );
	return claims;

}

function checkClaims( claims, clientId ) {

	const now = Date.now() / 1000;
	const isTime = value => typeof value === 'number' && Number.isFinite( value );
	const valid =
		ISSUERS.includes( claims.iss ) &&
		typeof clientId === 'string' && clientId !== '' && claims.aud === clientId &&
		isTime( claims.exp ) && claims.exp + CLOCK_SKEW > now &&
		isTime( claims.iat ) && claims.iat - CLOCK_SKEW <= now &&
		( claims.nbf === undefined || ( isTime( claims.nbf ) && claims.nbf - CLOCK_SKEW <= now ) ) &&
		typeof claims.sub === 'string' && claims.sub.length > 0 && claims.sub.length <= 255 &&
		typeof claims.email === 'string' && claims.email.includes( '@' ) && claims.email.length <= 320 &&
		( claims.email_verified === true || claims.email_verified === 'true' );
	if ( ! valid ) throw unauthorised();

}

function decodePart( part ) {

	try {

		const value = JSON.parse( new TextDecoder().decode( fromBase64url( part ) ) );
		return value !== null && typeof value === 'object' && ! Array.isArray( value ) ? value : null;

	} catch {

		return null;

	}

}

// Google's public key with this id, from the cached key set, fetching it when it's stale or
// doesn't have the key yet.
async function googleKey( kid, url ) {

	const now = Date.now() / 1000;
	const cached = cache?.url === url ? cache : null;
	const fresh = cached && cached.expires > now;
	if ( fresh && cached.keys.has( kid ) ) return cached.keys.get( kid );
	if ( fresh && now - cached.fetchedAt < REFETCH_INTERVAL ) return null;

	try {

		pending ??= fetchKeys( url, now ).finally( () => {

			pending = null;

		} );
		cache = await pending;

	} catch ( err ) {

		// Google's keys change slowly, so keep using the ones we have while Google can't be reached.
		if ( cached?.keys.has( kid ) ) return cached.keys.get( kid );
		throw err;

	}

	return cache.keys.get( kid ) ?? null;

}

async function fetchKeys( url, now ) {

	let res;
	try {

		res = await fetch( url, { headers: { Accept: 'application/json' } } );

	} catch {

		throw new HttpError( 503, 'Sign-in is unavailable, try again shortly' );

	}

	const body = res.ok ? await res.json().catch( () => null ) : null;
	if ( ! Array.isArray( body?.keys ) ) throw new HttpError( 503, 'Sign-in is unavailable, try again shortly' );

	const imported = new Map();
	for ( const jwk of body.keys ) {

		if ( jwk?.kty !== 'RSA' || typeof jwk.kid !== 'string' || ( jwk.alg && jwk.alg !== 'RS256' ) || ( jwk.use && jwk.use !== 'sig' ) ) continue;
		try {

			const key = await crypto.subtle.importKey( 'jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
				{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [ 'verify' ] );
			imported.set( jwk.kid, key );

		} catch {

			// A key we can't read can't have signed anything we'd accept.

		}

	}

	const maxAge = Number( /max-age=(\d+)/.exec( res.headers.get( 'Cache-Control' ) ?? '' )?.[ 1 ] ?? 3600 );
	const ttl = Math.min( MAX_CACHE, Math.max( MIN_CACHE, maxAge ) );
	return { url, keys: imported, expires: now + ttl, fetchedAt: now };

}
