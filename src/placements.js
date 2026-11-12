// Positions of models from MODELS in config.js saved on the live site (worker/placements.js), so
// a model dragged into place shows there for everyone. Anyone sees the saved positions; saving one
// asks for the edit passcode once (kept in this browser). Without the API (npm run dev, a static
// host) nothing is saved and models stand where config.js puts them.

import { loadConfig } from './cloud.js';

const API = new URL( 'api/placements', document.baseURI );
const KEY_STORE = 'twin.placementKey';
const TIMEOUT = 8000;
const FILE_TIMEOUT = 120000;

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

	const { east, north, up, snap, heading } = entry.state;
	const result = await sendForEveryone( 'PUT', API, { url: entry.url, east, north, up: snap ? null : up, heading } );
	return result.ok ? `Saved. Everyone now sees ${ entry.state.name } here.` : result.message;

}

// A change for everyone (models' positions, shared items, repair areas and their photos): sent
// with the admin's passcode, asked for the first time and kept in this browser once it works
// (forgotten when it doesn't). payload: what to send as JSON, or a Blob (a photo's file) to send
// as it is. Resolves to { ok, body } or { ok: false, message } saying why not.
export async function sendForEveryone( method, url, payload ) {

	let key = readKey();
	if ( ! key ) key = window.prompt( 'Admin passcode, for saving for everyone:' )?.trim();
	if ( ! key ) return { ok: false, message: 'Not saved.' };

	let res;
	try {

		// A file (a photo) goes as it is, and is given longer.
		const file = payload instanceof Blob;
		res = await fetch( url, {
			method,
			headers: { 'Content-Type': file ? payload.type : 'application/json', Accept: 'application/json', 'X-Edit-Key': key },
			// Otherwise always JSON, even with nothing to say: the server takes nothing else from a page.
			body: file ? payload : JSON.stringify( payload ?? {} ),
			signal: AbortSignal.timeout( file ? FILE_TIMEOUT : TIMEOUT ),
		} );

	} catch {

		return { ok: false, message: 'Couldn\'t reach the site. Check your connection and try again.' };

	}

	const body = /json/.test( res.headers.get( 'Content-Type' ) ?? '' ) ? await res.json().catch( () => ( {} ) ) : {};
	if ( res.ok ) {

		writeKey( key );
		return { ok: true, body };

	}

	if ( res.status === 403 && body.error === 'Wrong passcode' ) {

		writeKey( null );
		return { ok: false, message: 'Wrong passcode, nothing saved. Try again.' };

	}

	if ( res.status === 403 ) return { ok: false, message: 'Saving for everyone isn\'t set up on this site (no PLACEMENT_KEY).' };
	if ( res.status === 404 || ! body.error ) return { ok: false, message: 'Saving for everyone only works on the live site.' };
	return { ok: false, message: `Not saved: ${ body.error }.` };

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
