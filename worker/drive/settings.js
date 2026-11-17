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

// Google AdSense on the globe (docs/world-drive.md, "Ads"): { client, slot } when ADSENSE_CLIENT is a
// publisher id (ca-pub- and 16 digits) and ADSENSE_SLOT is empty (the unit without a slot id) or an
// ad unit's id (6 to 12 digits), else null: ads off, as they are with ADSENSE_CLIENT empty. Anything
// else (a typo, the id pasted without its ca-, a slot that isn't one) is off too, rather than half on.
export function adsense( env ) {

	const text = value => typeof value === 'string' ? value.trim() : '';
	const client = text( env.ADSENSE_CLIENT );
	const slot = text( env.ADSENSE_SLOT );
	return /^ca-pub-\d{16}$/.test( client ) && /^(\d{6,12})?$/.test( slot ) ? { client, slot } : null;

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
// With `prefix` 48, by its /48 instead: the block a site, or a free tunnel broker's customer, is
// given, which holds 65,536 /64s. The drop-in places count a visitor so (dropins.js), as a cell
// counted once for each of those /64s could be pushed up the top places from one /48 for nothing.
export function addressOf( request, prefix = 64 ) {

	const ip = request.headers.get( 'CF-Connecting-IP' ) || 'unknown';
	if ( ! ip.includes( ':' ) || ip.includes( '.' ) ) return ip;
	const [ head, tail ] = ip.toLowerCase().split( '::' );
	const left = head ? head.split( ':' ) : [];
	const right = tail ? tail.split( ':' ) : [];
	const groups = tail === undefined ? left : [ ...left, ...Array( Math.max( 0, 8 - left.length - right.length ) ).fill( '0' ), ...right ];
	if ( groups.length !== 8 ) return ip;
	const kept = prefix === 48 ? 3 : 4;
	return `${ groups.slice( 0, kept ).map( group => group.replace( /^0+(?=.)/, '' ) ).join( ':' ) }::/${ kept * 16 }`;

}
