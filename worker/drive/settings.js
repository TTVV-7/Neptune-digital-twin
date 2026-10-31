// Small helpers the World Drive Worker's routes share: its settings and its clock.

// A whole number setting of 0 or more, or `fallback` when it's unset or isn't one.
export function setting( value, fallback ) {

	const n = Number( value );
	return value !== undefined && value !== '' && Number.isInteger( n ) && n >= 0 ? n : fallback;

}

// The OAuth client id of the "Sign in with Google" button (GOOGLE_CLIENT_ID, public), or '' when
// it isn't set: then there's no signing in, and no buying the Supporter Pass (accounts.js).
export function googleClientId( env ) {

	return typeof env.GOOGLE_CLIENT_ID === 'string' ? env.GOOGLE_CLIENT_ID.trim() : '';

}

// The time (ms) visits and scores are counted at. The tests (TEST_CLOCK=header, never set live)
// send it in X-Test-Time to check what happens at midnight UTC, a week on or hours later.
export function clock( request, env ) {

	const sent = Number( request.headers.get( 'X-Test-Time' ) );
	return env.TEST_CLOCK === 'header' && Number.isFinite( sent ) && sent > 0 ? sent : Date.now();

}

// The visitor's address, as Cloudflare gives it: only ever hashed (see limits.js). An IPv6 address
// counts by its first half, its /64: that's the block a home or a phone is given, and every one of
// the billions of addresses in it would otherwise be a visitor of its own, with caps of its own.
export function addressOf( request ) {

	const ip = request.headers.get( 'CF-Connecting-IP' ) || 'unknown';
	if ( ! ip.includes( ':' ) || ip.includes( '.' ) ) return ip;
	const [ head, tail ] = ip.toLowerCase().split( '::' );
	const left = head ? head.split( ':' ) : [];
	const right = tail ? tail.split( ':' ) : [];
	const groups = tail === undefined ? left : [ ...left, ...Array( Math.max( 0, 8 - left.length - right.length ) ).fill( '0' ), ...right ];
	if ( groups.length !== 8 ) return ip;
	return `${ groups.slice( 0, 4 ).map( group => group.replace( /^0+(?=.)/, '' ) ).join( ':' ) }::/64`;

}
