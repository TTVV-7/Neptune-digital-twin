// Positions of models from MODELS in config.js saved on the live site (worker/placements.js), so
// a model dragged into place shows there for everyone. Anyone sees the saved positions; saving one
// asks for the edit passcode once (kept in this browser). Without the API (npm run dev, a static
// host) nothing is saved and models stand where config.js puts them.

import { loadConfig } from './cloud.js';

const API = new URL( 'api/placements', document.baseURI );
const KEY_STORE = 'twin.placementKey';
const TIMEOUT = 8000;

// Fetched once; models from config.js are moved to their saved spot as they load.
export function useSavedPlacements( models ) {

	const saved = fetchPlacements();
	const applyTo = async entry => {

		if ( ! entry.inConfig || ! entry.url ) return;
		const placement = ( await saved )[ entry.url ];
		if ( ! placement || ! models.entries.includes( entry ) ) return;
		Object.assign( entry.state, {
			east: placement.east,
			north: placement.north,
			heading: placement.heading,
			snap: placement.up === null,
			up: placement.up ?? entry.state.up,
		} );
		models.apply( entry );

	};

	models.addEventListener( 'add', ( { entry } ) => applyTo( entry ) );
	for ( const entry of models.entries ) applyTo( entry );

}

async function fetchPlacements() {

	// No server (cloud.js asked already): nothing saved, and no request that can only fail.
	if ( ! await loadConfig() ) return {};
	try {

		const res = await fetch( API, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout( TIMEOUT ) } );
		// A dev server or static host answers with the page itself.
		if ( ! res.ok || ! /json/.test( res.headers.get( 'Content-Type' ) ?? '' ) ) return {};
		return ( await res.json() ).placements ?? {};

	} catch {

		return {};

	}

}

// Saves where a model from config.js stands now, for everyone. Resolves to a message to show.
export async function savePlacement( entry ) {

	let key = readKey();
	if ( ! key ) key = window.prompt( 'Passcode for saving positions for everyone:' )?.trim();
	if ( ! key ) return 'Not saved.';

	const { east, north, up, snap, heading } = entry.state;
	let res;
	try {

		res = await fetch( API, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Edit-Key': key },
			body: JSON.stringify( { url: entry.url, east, north, up: snap ? null : up, heading } ),
			signal: AbortSignal.timeout( TIMEOUT ),
		} );

	} catch {

		return 'Couldn\'t reach the site to save. Check your connection and try again.';

	}

	const body = /json/.test( res.headers.get( 'Content-Type' ) ?? '' ) ? await res.json().catch( () => ( {} ) ) : {};
	if ( res.ok ) {

		writeKey( key );
		return `Saved. Everyone now sees ${ entry.state.name } here.`;

	}

	if ( res.status === 403 && body.error === 'Wrong passcode' ) {

		writeKey( null );
		return 'Wrong passcode, not saved. Try again.';

	}

	if ( res.status === 403 ) return 'Saving positions isn\'t set up on this site (no PLACEMENT_KEY).';
	if ( res.status === 404 || ! body.error ) return 'Saving for everyone only works on the live site. Use Copy config here.';
	return `Not saved: ${ body.error }.`;

}

function readKey() {

	try {

		return localStorage.getItem( KEY_STORE );

	} catch {

		return null;

	}

}

function writeKey( key ) {

	try {

		if ( key ) localStorage.setItem( KEY_STORE, key );
		else localStorage.removeItem( KEY_STORE );

	} catch {

		// Private browsing: it asks again next time.

	}

}
