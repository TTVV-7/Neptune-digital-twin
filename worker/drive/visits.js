import { base64url, fromBase64url, randomToken } from '../http.js';

// Visit tokens: a score is only taken with one, so it comes from a visit that passed Turnstile and
// was counted against the day's caps in the last few hours (a script can't post without spending
// a visit). /api/visit hands one out with the Maps key: "v1.<visit id>.<expiry, s>.<signature>",
// the signature an HMAC-SHA256 of the id and the expiry. The HMAC's key is derived (HKDF) from
// TURNSTILE_SECRET with a label of its own, so there's no further secret to set and none of
// this can be made without the Worker's secret. A token can't be changed without the signature
// failing, and it stops working VISIT_HOURS after the visit.

export const VISIT_HOURS = 6;
const TTL = VISIT_HOURS * 60 * 60 * 1000;
const LABEL = 'world-drive visit token v1';
// 16 random bytes, 10 digits of seconds and 32 bytes of HMAC, base64url.
const TOKEN = /^v1\.([A-Za-z0-9_-]{22})\.(\d{10})\.([A-Za-z0-9_-]{43})$/;
const encoder = new TextEncoder();

// The derived key, made once per Worker instance.
let derived = null;

async function signingKey( secret ) {

	if ( derived?.secret === secret ) return derived.key;
	const base = await crypto.subtle.importKey( 'raw', encoder.encode( secret ), 'HKDF', false, [ 'deriveKey' ] );
	const key = await crypto.subtle.deriveKey(
		{ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array( 0 ), info: encoder.encode( LABEL ) },
		base,
		{ name: 'HMAC', hash: 'SHA-256', length: 256 },
		false,
		[ 'sign', 'verify' ],
	);
	derived = { secret, key };
	return key;

}

// A new visit's token, from `now` (ms).
export async function makeVisit( env, now ) {

	const id = randomToken( 16 );
	const expires = Math.floor( ( now + TTL ) / 1000 );
	const signature = await crypto.subtle.sign( 'HMAC', await signingKey( env.TURNSTILE_SECRET ), encoder.encode( `${ id }.${ expires }` ) );
	return `v1.${ id }.${ expires }.${ base64url( new Uint8Array( signature ) ) }`;

}

// { id, issuedAt, expiresAt } (ms) for a token this Worker made that hasn't run out at `now`, or
// null for anything else.
export async function readVisit( env, token, now ) {

	const match = typeof token === 'string' && env.TURNSTILE_SECRET ? token.match( TOKEN ) : null;
	if ( ! match ) return null;
	const [ , id, expires, signature ] = match;
	// crypto.subtle.verify compares in constant time.
	const good = await crypto.subtle.verify( 'HMAC', await signingKey( env.TURNSTILE_SECRET ), fromBase64url( signature ), encoder.encode( `${ id }.${ expires }` ) );
	const expiresAt = Number( expires ) * 1000;
	if ( ! good || now >= expiresAt ) return null;
	return { id, issuedAt: expiresAt - TTL, expiresAt };

}
