import { HttpError, isObject, json, noContent, readJson } from './http.js';
import { checkEditKey } from './placements.js';

// Items the admin saved for everyone (src/shared-items.js): library items, flatten areas,
// excavations, stockpiles, laydown areas, rows... each the config the app places it from, as in
// MODELS in src/config.js. Anyone can read them, so everyone who opens the site sees them; saving
// or removing one needs the edit passcode (PLACEMENT_KEY), like models' positions. They work
// without accounts, needing only the database.

const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
// A model file of this site's own: never another site's address, or a path out of these folders.
const URL_PATTERN = /^(models|library)\/[A-Za-z0-9._\- /]{1,200}\.(glb|gltf)$/;
const MAX_ITEMS = 500;
const MAX_BYTES = 32 * 1024;
// Metres from the terminal centre; well past anywhere on the terminal.
const REACH = 20000;

export async function listSharedItems( { env } ) {

	const { results } = await env.DB.prepare( 'SELECT id, data, updated_at FROM shared_items ORDER BY created_at, id' ).all();
	return json( { items: results.map( row => ( { id: row.id, config: JSON.parse( row.data ), updatedAt: row.updated_at } ) ) } );

}

export async function saveSharedItem( { request, env, params } ) {

	await checkEditKey( request, env );
	if ( ! ID_PATTERN.test( params.id ) ) throw new HttpError( 400, 'Bad id' );
	const body = await readJson( request, MAX_BYTES + 1024 );
	const config = checkConfig( body?.config );
	const data = JSON.stringify( config );
	if ( data.length > MAX_BYTES ) throw new HttpError( 413, 'Too big' );

	const existing = await env.DB.prepare( 'SELECT id FROM shared_items WHERE id = ?' ).bind( params.id ).first();
	if ( ! existing ) {

		const { count } = await env.DB.prepare( 'SELECT COUNT(*) AS count FROM shared_items' ).first();
		if ( count >= MAX_ITEMS ) throw new HttpError( 409, `No more than ${ MAX_ITEMS } items can be saved for everyone` );

	}

	const now = Date.now();
	await env.DB.prepare( `
		INSERT INTO shared_items ( id, data, created_at, updated_at ) VALUES ( ?, ?, ?, ? )
		ON CONFLICT ( id ) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
	` ).bind( params.id, data, now, now ).run();
	return json( { id: params.id, config, updatedAt: now } );

}

export async function deleteSharedItem( { request, env, params } ) {

	await checkEditKey( request, env );
	if ( ! ID_PATTERN.test( params.id ) ) throw new HttpError( 400, 'Bad id' );
	await env.DB.prepare( 'DELETE FROM shared_items WHERE id = ?' ).bind( params.id ).run();
	return noContent();

}

// A config the app can place: something to place (a library item, a kind with its params, or a
// model file of this site's), somewhere on the terminal.
function checkConfig( config ) {

	if ( ! isObject( config ) ) throw new HttpError( 400, 'Bad item' );
	const { library, kind, url, procedural, params, name, east, north } = config;
	const what = [ library, kind, url, procedural ].filter( v => v != null );
	if ( what.length === 0 ) throw new HttpError( 400, 'Bad item' );
	for ( const v of [ library, kind, name ] ) if ( v != null && ( typeof v !== 'string' || v.length > 200 ) ) throw new HttpError( 400, 'Bad item' );
	if ( url != null && ( typeof url !== 'string' || ! URL_PATTERN.test( url ) || url.includes( '..' ) ) ) throw new HttpError( 400, 'Bad model' );
	if ( params != null && ! isObject( params ) ) throw new HttpError( 400, 'Bad item' );
	if ( ! [ east, north ].every( v => typeof v === 'number' && Number.isFinite( v ) && Math.abs( v ) <= REACH ) ) throw new HttpError( 400, 'Bad position' );
	// Only what's placed: not how it's being used in someone's browser right now.
	const { placing, inConfig, ...kept } = config;
	return kept;

}
