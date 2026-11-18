import { base64url, fromBase64url, randomToken } from '../http.js';

// Visit tokens: a score is only taken with one, so it comes from a visit that passed Turnstile and
// was counted against the day's caps in the last few hours (a script can't post without spending
// a visit). /api/visit hands one out with the Maps key: "v1.<visit id>.<expiry, s>.<signature>",
// the signature an HMAC-SHA256 of the id and the expiry. The HMAC's key is derived (HKDF) from
// TURNSTILE_SECRET with a label of its own, so there's no further secret to set and none of
// this can be made without the Worker's secret. A token can't be changed without the signature
// failing, and it stops working VISIT_HOURS after the visit.
//
// The id is 21 random letters and then one saying what kind of visit it is (KINDS): 'e' for one
// that had the Earth's caps checked (the Maps key handed out), 'm' for one that didn't (a free
// world's, the Moon's or Mars's, never limited, and one turned away by the Earth's caps: 'm' as it
// was when the Moon was the only one) and 'o' for the owner's (ADMIN_EMAILS). The signature covers
// the id, so the kind can't be changed either. It says which drop-in places a visit may post
// (dropins.js): a free world's visit, which costs nothing but the robot check, posts the free
// worlds' alone, and the owner's none (so the admin page's own Drive links don't add to what it
// shows). The kind is in the id rather than a field of its own so that a token is written as it
// always was: the Worker before it takes these tokens as its own, so a rollback (or a gradual
// deployment sending some requests to the old version) doesn't turn away every open page's visit.
// A token from before the kind was there, whose id is 16 random bytes, always ends in A, Q, g or w
// (the last letter of 16 bytes in base64url has two bits of them and four of nothing), so it never
// passes for a kind: it's taken as ever until it runs out, as a free world's visit's.

export const VISIT_HOURS = 6;
const TTL = VISIT_HOURS * 60 * 60 * 1000;
const LABEL = 'world-drive visit token v1';
// The id's 22 letters (21 random and the kind's, or 16 random bytes before), 10 digits of seconds
// and 32 bytes of HMAC, base64url.
const TOKEN = /^v1\.([A-Za-z0-9_-]{22})\.(\d{10})\.([A-Za-z0-9_-]{43})$/;
// The kinds of visit, by the last letter of its id.
const KINDS = { earth: 'e', free: 'm', owner: 'o' };
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

// A new visit's token, from `now` (ms), of `kind`: 'earth' for a visit that passed the Earth's caps,
// 'owner' for the owner's, 'free' (a free world's) for any other.
export async function makeVisit( env, now, kind = 'earth' ) {

	const id = `${ randomToken( 16 ).slice( 0, 21 ) }${ KINDS[ kind ] ?? KINDS.free }`;
	const expires = Math.floor( ( now + TTL ) / 1000 );
	const signature = await crypto.subtle.sign( 'HMAC', await signingKey( env.TURNSTILE_SECRET ), encoder.encode( `${ id }.${ expires }` ) );
	return `v1.${ id }.${ expires }.${ base64url( new Uint8Array( signature ) ) }`;

}

// { id, issuedAt, expiresAt, earth, owner } (ms; earth whether the visit had the Earth's caps
// checked, owner whether it's the owner's) for a token this Worker made that hasn't run out at
// `now`, or null for anything else.
export async function readVisit( env, token, now ) {

	const match = typeof token === 'string' && env.TURNSTILE_SECRET ? token.match( TOKEN ) : null;
	if ( ! match ) return null;
	const [ , id, expires, signature ] = match;
	// One way of writing each signature: its last letter has two bits to spare, which mustn't make
	// another token of the same visit (each token is one string, as the tests change one).
	const bytes = fromBase64url( signature );
	if ( base64url( bytes ) !== signature ) return null;
	// crypto.subtle.verify compares in constant time.
	const good = await crypto.subtle.verify( 'HMAC', await signingKey( env.TURNSTILE_SECRET ), bytes, encoder.encode( `${ id }.${ expires }` ) );
	const expiresAt = Number( expires ) * 1000;
	if ( ! good || now >= expiresAt ) return null;
	return { id, issuedAt: expiresAt - TTL, expiresAt, earth: id.endsWith( KINDS.earth ), owner: id.endsWith( KINDS.owner ) };

}
