// The Supporter Pass (docs/world-drive.md): a one-time payment towards World Drive's running costs
// that unlocks the four extra rides and the Garage's extras. Whether this visitor has it is kept
// here, and only here: everything locked asks isPro(), and follows onProChange. It's off until the
// payments code (Google sign-in, Stripe and the entitlement kept by the Worker) says otherwise with
// setPro( true ); nothing locked may stand in the way of the free game.
//
// For testing, ?pro=1 in the address turns it on, but only on this computer (localhost or
// 127.0.0.1), never on worlddrive.app or anywhere else it's served from.

const TEST_HOSTS = [ 'localhost', '127.0.0.1', '[::1]' ];

const listeners = new Set();
let pro = typeof location !== 'undefined' && testPass( location );

export function isPro() {

	return pro;

}

// fn( on ) whenever it changes. Returns a function that stops listening.
export function onProChange( fn ) {

	listeners.add( fn );
	return () => listeners.delete( fn );

}

export function setPro( on ) {

	on = !! on;
	if ( on === pro ) return;
	pro = on;
	for ( const fn of listeners ) {

		// One listener going wrong mustn't keep the others (or the game) from hearing of it.
		try {

			fn( pro );

		} catch ( err ) {

			console.error( err );

		}

	}

}

// Whether an address ({ hostname, search }, as location has them) turns the pass on for testing:
// ?pro=1, on this computer only.
export function testPass( { hostname = '', search = '' } ) {

	return TEST_HOSTS.includes( hostname ) && new URLSearchParams( search ).get( 'pro' ) === '1';

}
