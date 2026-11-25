import { SITE } from './config.js';

// The editor's clipboard (sidebar.js): what Copy or Cut took, kept in this browser's localStorage
// so that it can be pasted into another project, tab or site, and put on the system clipboard as
// JSON too where the browser lets it (another browser or computer can paste that). It holds the
// items as they're saved (models.js toConfig) with where each was from their middle, so a paste
// puts them down round the point under the cursor, the way they were laid out and facing as they
// were. Nothing about which project or account they came from is kept: they're new items wherever
// they're pasted.
//
// { format: FORMAT, version: 1, copiedAt: ms, from: site name, items: [ { config, east, north } ] },
// east and north in metres from the middle of what was copied.

const STORAGE = 'world-drive-build.clipboard';
const FORMAT = 'world-drive-build-items';
// More than this isn't kept (a whole site's worth is better moved with Export layout).
const MAX_ITEMS = 1000;

// What to put on the clipboard for these entries.
export function clipboardOf( entries, models ) {

	const configs = entries.map( entry => {

		const config = models.toConfig( entry );
		// Shown wherever it's pasted, and new there.
		delete config.hidden;
		return config;

	} );
	const middle = middleOf( configs );
	return {
		format: FORMAT,
		version: 1,
		copiedAt: Date.now(),
		from: SITE.name,
		items: configs.slice( 0, MAX_ITEMS ).map( config => ( { config, east: round( config.east - middle.east ), north: round( config.north - middle.north ) } ) ),
	};

}

// The middle of placements ({ east, north }): halfway between the furthest each way.
export function middleOf( placements ) {

	if ( placements.length === 0 ) return { east: 0, north: 0 };
	const easts = placements.map( p => p.state?.east ?? p.east );
	const norths = placements.map( p => p.state?.north ?? p.north );
	return { east: ( Math.min( ...easts ) + Math.max( ...easts ) ) / 2, north: ( Math.min( ...norths ) + Math.max( ...norths ) ) / 2 };

}

// The clipboard as text, for the system clipboard.
export function clipboardText( data ) {

	return JSON.stringify( data );

}

// A clipboard read back (from text or a parsed value), or null if it isn't one.
export function parseClipboard( value ) {

	let data = value;
	if ( typeof value === 'string' ) {

		if ( ! value.includes( FORMAT ) ) return null;
		try {

			data = JSON.parse( value );

		} catch {

			return null;

		}

	}

	if ( data?.format !== FORMAT || ! Array.isArray( data.items ) ) return null;
	const items = data.items.filter( item => item?.config && typeof item.config === 'object' && Number.isFinite( item.east ) && Number.isFinite( item.north ) ).slice( 0, MAX_ITEMS );
	if ( items.length === 0 ) return null;
	return { ...data, copiedAt: Number( data.copiedAt ) || 0, items };

}

export function storeClipboard( data ) {

	try {

		localStorage.setItem( STORAGE, clipboardText( data ) );
		return true;

	} catch {

		// A private window, or no room: the system clipboard (or this tab) still has it.
		return false;

	}

}

export function readStoredClipboard() {

	try {

		return parseClipboard( localStorage.getItem( STORAGE ) ?? '' );

	} catch {

		return null;

	}

}

// The config a pasted item is loaded with: the copied one where it lands, as a new item. It's
// snapped to the ground there (a height kept from another place would be wrong), keeping how it was
// parked (tilted on a pile, say), which is relative to the ground.
export function pastedConfig( { config }, at ) {

	const { inConfig, sharedId, hidden, ...rest } = config;
	return { ...rest, east: round( at.east ), north: round( at.north ), up: null };

}

// The library items a copied config is made of (a row's item, a kind's own card), as ids.
export function libraryIdsOf( config ) {

	return [ config.library, config.kind, config.params?.item, config.procedural ].filter( id => typeof id === 'string' );

}

function round( v ) {

	return Math.round( v * 100 ) / 100;

}
