// Items the admin saved for everyone on the live site (worker/shared-items.js): library items,
// flatten areas, excavations, stockpiles, laydown areas, rows... Everyone who opens the site sees
// them, as they see models from MODELS in config.js: they load every time and aren't part of
// anyone's own layout. Placing more, or moving one of them, changes only your own browser.
//
// The admin saves an item with its P panel's "Save for everyone" (the edit passcode is asked for
// once, as for models' positions), which also takes it out of their own layout, so it isn't there
// twice; saving a shared item again saves where it is and how it's set now. "Remove for everyone"
// takes it away for everyone, the admin included. Without a server (npm run dev, a static host)
// there's nothing to load and nothing can be saved.

import { loadConfig } from './cloud.js';
import { resolveItem } from './layout.js';
import { sendForEveryone } from './placements.js';

const API = new URL( 'api/shared-items', document.baseURI );
const TIMEOUT = 8000;

// Load what's saved for everyone. getLibrary: a promise of the library's items, so a library item
// is placed as the library has it now (as a saved layout is).
export async function loadSharedItems( { models, getLibrary, onError } ) {

	if ( ! await loadConfig() ) return;
	let items;
	try {

		const res = await fetch( API, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout( TIMEOUT ) } );
		if ( ! res.ok || ! /json/.test( res.headers.get( 'Content-Type' ) ?? '' ) ) return;
		( { items } = await res.json() );

	} catch {

		return;

	}

	const library = await getLibrary();
	const failed = [];
	await Promise.all( ( items ?? [] ).map( ( { id, config } ) => models.load( { ...resolveItem( config, library ), inConfig: true, sharedId: id } ).catch( () => failed.push( config.name ?? id ) ) ) );
	if ( failed.length ) onError?.( `${ failed.length } item${ failed.length === 1 ? '' : 's' } saved for everyone couldn't be loaded: ${ failed.join( ', ' ) }` );

}

// Saves an item for everyone as it is now. Resolves to a message to show.
export async function saveShared( entry, models ) {

	// A model dropped on the page is only in this browser until its file is put in public/models/.
	if ( entry.url && ! entry.library && ! entry.kind && ! await onSite( entry.url ) ) return `${ entry.state.name }'s file (${ entry.url }) isn't on the site, so others couldn't load it. Put it in public/models/ first.`;
	const id = entry.sharedId ?? newId();
	const config = models.toConfig( entry );
	// Shown to everyone: whether it's hidden in this browser isn't part of it.
	delete config.hidden;
	const result = await sendForEveryone( 'PUT', `${ API }/${ id }`, { config } );
	if ( ! result.ok ) return result.message;
	const first = ! entry.sharedId;
	entry.sharedId = id;
	// Out of this browser's own layout now (layout.js saves what isn't inConfig), so it isn't there
	// twice after a reload. The change is said first, while it's still this browser's: the layout
	// doesn't save for changes to items that aren't, and its save, a moment later, leaves it out.
	models.apply( entry );
	entry.inConfig = true;
	return first ? `Saved for everyone: ${ entry.state.name }` : `Saved for everyone as it is now: ${ entry.state.name }`;

}

// Takes a shared item away for everyone. Resolves to a message to show.
export async function removeShared( entry, models ) {

	if ( ! entry.sharedId ) return 'Not saved for everyone.';
	const result = await sendForEveryone( 'DELETE', `${ API }/${ entry.sharedId }` );
	if ( ! result.ok ) return result.message;
	models.remove( entry );
	return `Removed for everyone: ${ entry.state.name }`;

}

async function onSite( url ) {

	try {

		const res = await fetch( new URL( url, document.baseURI ), { method: 'HEAD', signal: AbortSignal.timeout( TIMEOUT ) } );
		// A dev server answers a missing file with the page itself.
		return res.ok && ! /text\/html/.test( res.headers.get( 'Content-Type' ) ?? '' );

	} catch {

		return false;

	}

}

function newId() {

	return crypto.randomUUID?.().replace( /-/g, '' ) ?? Array.from( crypto.getRandomValues( new Uint8Array( 16 ) ), b => b.toString( 16 ).padStart( 2, '0' ) ).join( '' );

}
