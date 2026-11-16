import { base64url, fromBase64url, randomToken } from '../http.js';

// Visit tokens: a score is only taken with one, so it comes from a visit that passed Turnstile and
// was counted against the day's caps in the last few hours (a script can't post without spending
// a visit). /api/visit hands one out with the Maps key: "v2.<visit id>.<expiry, s>.<world>.<signature>",
// the world 'e' for a visit that had the Earth's caps checked (the Maps key handed out) and 'm' for
// one that didn't (the Moon's, never limited, and one turned away by the Earth's caps), and the
// signature an HMAC-SHA256 of all before it. The HMAC's key is derived (HKDF) from
// TURNSTILE_SECRET with a label of its own, so there's no further secret to set and none of
// this can be made without the Worker's secret. A token can't be changed without the signature
// failing, and it stops working VISIT_HOURS after the visit. The world says which drop-in places a
// visit may post (dropins.js): a Moon visit, which costs nothing but the robot check, posts the
// Moon's alone.
//
// Tokens before the world was in them, "v1.<visit id>.<expiry, s>.<signature>" (the HMAC of the id
// and the expiry), are taken as ever until they run out, as a Moon visit's: they don't say which.

export const VISIT_HOURS = 6;
const TTL = VISIT_HOURS * 60 * 60 * 1000;
const LABEL = 'world-drive visit token v1';
// 16 random bytes, 10 digits of seconds, the world (v2) and 32 bytes of HMAC, base64url.
const TOKEN = /^v2\.([A-Za-z0-9_-]{22})\.(\d{10})\.([em])\.([A-Za-z0-9_-]{43})$/;
const OLD_TOKEN = /^v1\.([A-Za-z0-9_-]{22})\.(\d{10})\.([A-Za-z0-9_-]{43})$/;
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

// A new visit's token, from `now` (ms), for `world`: 'earth' for a visit that passed the Earth's
// caps, 'moon' for any other.
export async function makeVisit( env, now, world = 'earth' ) {

	const id = randomToken( 16 );
	const expires = Math.floor( ( now + TTL ) / 1000 );
	const signed = `v2.${ id }.${ expires }.${ world === 'earth' ? 'e' : 'm' }`;
	const signature = await crypto.subtle.sign( 'HMAC', await signingKey( env.TURNSTILE_SECRET ), encoder.encode( signed ) );
	return `${ signed }.${ base64url( new Uint8Array( signature ) ) }`;

}

// { id, issuedAt, expiresAt, earth } (ms; earth whether the visit had the Earth's caps checked) for
// a token this Worker made that hasn't run out at `now`, or null for anything else.
export async function readVisit( env, token, now ) {

	if ( typeof token !== 'string' || ! env.TURNSTILE_SECRET ) return null;
	const match = token.match( TOKEN );
	const old = match ? null : token.match( OLD_TOKEN );
	if ( ! match && ! old ) return null;
	const [ , id, expires ] = match ?? old;
	const signature = match ? match[ 4 ] : old[ 3 ];
	const signed = match ? token.slice( 0, - signature.length - 1 ) : `${ id }.${ expires }`;
	// One way of writing each signature: its last letter has two bits to spare, which mustn't make
	// another token of the same visit (each token is one string, as the tests change one).
	const bytes = fromBase64url( signature );
	if ( base64url( bytes ) !== signature ) return null;
	// crypto.subtle.verify compares in constant time.
	const good = await crypto.subtle.verify( 'HMAC', await signingKey( env.TURNSTILE_SECRET ), bytes, encoder.encode( signed ) );
	const expiresAt = Number( expires ) * 1000;
	if ( ! good || now >= expiresAt ) return null;
	return { id, issuedAt: expiresAt - TTL, expiresAt, earth: !! match && match[ 3 ] === 'e' };

}
