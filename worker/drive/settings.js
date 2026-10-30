// Small helpers the World Drive Worker's routes share: its number settings and its clock.

// A whole number setting of 0 or more, or `fallback` when it's unset or isn't one.
export function setting( value, fallback ) {

	const n = Number( value );
	return value !== undefined && value !== '' && Number.isInteger( n ) && n >= 0 ? n : fallback;

}

// The time (ms) visits and scores are counted at. The tests (TEST_CLOCK=header, never set live)
// send it in X-Test-Time to check what happens at midnight UTC, a week on or hours later.
export function clock( request, env ) {

	const sent = Number( request.headers.get( 'X-Test-Time' ) );
	return env.TEST_CLOCK === 'header' && Number.isFinite( sent ) && sent > 0 ? sent : Date.now();

}

// The visitor's address, as Cloudflare gives it: only ever hashed (see limits.js).
export function addressOf( request ) {

	return request.headers.get( 'CF-Connecting-IP' ) || 'unknown';

}
