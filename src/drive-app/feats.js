import { ACHIEVEMENTS } from './achievement-rules.js';

// The achievements this visitor has (achievement-rules.js), as the Worker last said: what the
// construction rides' locks follow (vehicles.js's rideLocked), as the pass's do pro.js. progress.js
// sets them from its reports' answers (the player's and their account's), and achievements.js from
// the grid's. Before a nickname, or without a Worker, there are none: the Worker records them, and
// checks them wherever a ride shows to others.
//
// For testing, ?feats=all in the address gives every one, but only on this computer (localhost or
// 127.0.0.1), as pro.js's ?pro=1: the page alone, which the Worker never takes for anything.

const TEST_HOSTS = [ 'localhost', '127.0.0.1', '[::1]' ];

const listeners = new Set();
let feats = new Set( typeof location !== 'undefined' && testFeats( location ) ? ACHIEVEMENTS.map( a => a.id ) : [] );
const testing = feats.size > 0;

export function hasFeat( id ) {

	return feats.has( id );

}

export function getFeats() {

	return new Set( feats );

}

// fn( feats, added ) whenever they change (added: the ids new to this page). Returns a function
// that stops listening.
export function onFeatsChange( fn ) {

	listeners.add( fn );
	return () => listeners.delete( fn );

}

// The Worker's whole list (an empty report's answer, the grid's), or more of them (`add`: a report
// that earned some). Returns the ids new to this page.
export function setFeats( ids, { add = false } = {} ) {

	if ( testing ) return [];
	const next = new Set( add ? [ ...feats, ...ids ] : ids );
	const added = [ ...next ].filter( id => ! feats.has( id ) );
	const same = next.size === feats.size && ! added.length;
	if ( same ) return [];
	feats = next;
	for ( const fn of listeners ) {

		// One listener going wrong mustn't keep the others (or the game) from hearing of it.
		try {

			fn( getFeats(), added );

		} catch ( err ) {

			console.error( err );

		}

	}

	return added;

}

// Whether an address ({ hostname, search }) gives every achievement for testing: ?feats=all, on
// this computer only.
export function testFeats( { hostname = '', search = '' } ) {

	return TEST_HOSTS.includes( hostname ) && new URLSearchParams( search ).get( 'feats' ) === 'all';

}
