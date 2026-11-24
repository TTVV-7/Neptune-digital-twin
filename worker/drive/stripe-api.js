// Stripe's REST API, for World Drive Build Pro (billing.js: Checkout Sessions, customers, the
// billing portal) and the webhook's follow-ups (supporter.js: a refunded or disputed subscription
// is cancelled so it isn't billed again). Plain fetch, form-encoded as Stripe wants, with the
// secret key; no Stripe library, so nothing is added to the Worker.
//
// Settings: STRIPE_SECRET_KEY (a secret: a restricted key, rk_live_..., with only what docs/build.md
// lists; a full sk_ key works too but isn't needed). STRIPE_API_BASE: where Stripe's API is
// (https://api.stripe.com if unset); only the tests set it, to a stand-in on this machine.

const SECRET_PATTERN = /^(sk|rk)_(live|test)_[A-Za-z0-9]{8,250}$/;
const TIMEOUT = 10000;

// STRIPE_SECRET_KEY when it's a Stripe secret or restricted key, else '' (unset, or something
// else pasted there: a publishable pk_ key, a webhook's whsec_ secret).
export function stripeSecret( env ) {

	const key = typeof env.STRIPE_SECRET_KEY === 'string' ? env.STRIPE_SECRET_KEY.trim() : '';
	return SECRET_PATTERN.test( key ) ? key : '';

}

// Whether the secret key is a test-mode one: then Build Pro is sold in Stripe's test mode, and the
// webhook takes test-mode events for Build Pro (only: the Supporter Pass's still follow its link).
export function stripeTestMode( env ) {

	return /^(sk|rk)_test_/.test( stripeSecret( env ) );

}

// STRIPE_API_BASE's origin: https anywhere, plain http only on this machine (the tests' stand-in).
function apiBase( env ) {

	try {

		const url = new URL( typeof env.STRIPE_API_BASE === 'string' && env.STRIPE_API_BASE.trim() ? env.STRIPE_API_BASE.trim() : 'https://api.stripe.com' );
		if ( url.protocol === 'https:' || ( url.protocol === 'http:' && ( url.hostname === '127.0.0.1' || url.hostname === 'localhost' ) ) ) return url.origin;

	} catch {

		// Not a URL: Stripe's own.

	}

	return 'https://api.stripe.com';

}

// Stripe's form encoding of nested parameters: { a: { b: 1 }, c: [ { d: 2 } ] } is a[b]=1&c[0][d]=2.
// undefined and null are left out.
export function formBody( params, prefix = '', out = new URLSearchParams() ) {

	for ( const [ key, value ] of Object.entries( params ) ) {

		if ( value === undefined || value === null ) continue;
		const name = prefix ? `${ prefix }[${ key }]` : key;
		if ( typeof value === 'object' ) formBody( value, name, out );
		else out.append( name, String( value ) );

	}

	return out;

}

// One call to Stripe's API: { ok, status, body } (body: Stripe's JSON, or {}). Never throws for
// Stripe's answer; a network failure or a timeout is { ok: false, status: 0 }. What Stripe sends
// back can hold a customer's details, so only its status and error code are ever logged.
export async function stripeApi( env, method, path, params = null, { idempotencyKey } = {} ) {

	const secret = stripeSecret( env );
	if ( ! secret ) return { ok: false, status: 0, body: {} };
	const headers = { Authorization: `Bearer ${ secret }` };
	let body;
	if ( params ) {

		headers[ 'Content-Type' ] = 'application/x-www-form-urlencoded';
		body = formBody( params ).toString();

	}

	if ( idempotencyKey ) headers[ 'Idempotency-Key' ] = idempotencyKey;
	try {

		const res = await fetch( apiBase( env ) + path, { method, headers, body, signal: AbortSignal.timeout( TIMEOUT ) } );
		let answer = {};
		try {

			answer = await res.json();

		} catch {

			// Not JSON: nothing to read.

		}

		if ( ! res.ok ) console.error( 'Stripe', method, path.split( '/' ).slice( 0, 3 ).join( '/' ), res.status, answer?.error?.code ?? answer?.error?.type ?? '' );
		return { ok: res.ok, status: res.status, body: answer && typeof answer === 'object' ? answer : {} };

	} catch ( err ) {

		console.error( 'Stripe', method, path.split( '/' ).slice( 0, 3 ).join( '/' ), err?.name );
		return { ok: false, status: 0, body: {} };

	}

}
