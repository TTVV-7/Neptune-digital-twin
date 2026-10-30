// Cloudflare Turnstile, the check that a visit comes from a person in a browser and not a script
// hammering /api/visit for Maps keys. The page gets a token from Turnstile's widget and sends it
// here; this asks Turnstile whether it's good. A token works once, for a few minutes.

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
// Turnstile's tokens are at most 2048 characters.
export const MAX_TOKEN = 2048;

// { ok } for whether Turnstile accepts the token, or { unavailable: true } when it couldn't be
// asked. TURNSTILE_VERIFY_URL is for the tests only, which answer as Turnstile's test keys do.
export async function verifyTurnstile( env, token, ip ) {

	const form = new FormData();
	form.append( 'secret', env.TURNSTILE_SECRET );
	form.append( 'response', token );
	if ( ip ) form.append( 'remoteip', ip );

	try {

		const res = await fetch( env.TURNSTILE_VERIFY_URL || SITEVERIFY, { method: 'POST', body: form } );
		if ( ! res.ok ) return { ok: false, unavailable: true };
		const outcome = await res.json();
		return { ok: outcome?.success === true };

	} catch {

		return { ok: false, unavailable: true };

	}

}
