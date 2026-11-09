import { HttpError, json, noContent, readJson } from './http.js';
import { checkEditKey } from './placements.js';

// Repair areas the admin moved in the twin (src/repair-areas.js): for a model with areas (the
// B2D2 repair model), each moved area's outline and the way it faces, by the area's id, in the
// model's markup frame. Anyone can read them, so everyone sees the areas where the admin put them;
// saving or putting one back where it was drawn needs the edit passcode (PLACEMENT_KEY), as for
// models' positions. They work without accounts, needing only the database.

// A model's file name without .glb, and an area's id.
const MODEL_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_AREAS = 2000;
const MAX_CORNERS = 200;
// Metres from the model's origin; well past anything in one model.
const REACH = 10000;

export async function listAreaEdits( { env, params } ) {

	if ( ! MODEL_PATTERN.test( params.model ) ) throw new HttpError( 400, 'Bad model' );
	const { results } = await env.DB.prepare( 'SELECT id, data, updated_at FROM area_edits WHERE model = ? ORDER BY id' ).bind( params.model ).all();
	return json( { edits: results.map( row => ( { id: row.id, ...JSON.parse( row.data ), updatedAt: row.updated_at } ) ) } );

}

export async function saveAreaEdit( { request, env, params } ) {

	await checkEditKey( request, env );
	if ( ! MODEL_PATTERN.test( params.model ) ) throw new HttpError( 400, 'Bad model' );
	if ( ! ID_PATTERN.test( params.id ) ) throw new HttpError( 400, 'Bad id' );
	const edit = checkEdit( await readJson( request, 64 * 1024 ) );

	const existing = await env.DB.prepare( 'SELECT id FROM area_edits WHERE model = ? AND id = ?' ).bind( params.model, params.id ).first();
	if ( ! existing ) {

		const { count } = await env.DB.prepare( 'SELECT COUNT(*) AS count FROM area_edits WHERE model = ?' ).bind( params.model ).first();
		if ( count >= MAX_AREAS ) throw new HttpError( 409, `No more than ${ MAX_AREAS } areas of a model can be moved` );

	}

	const now = Date.now();
	await env.DB.prepare( `
		INSERT INTO area_edits ( model, id, data, updated_at ) VALUES ( ?, ?, ?, ? )
		ON CONFLICT ( model, id ) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
	` ).bind( params.model, params.id, JSON.stringify( edit ), now ).run();
	return json( { id: params.id, ...edit, updatedAt: now } );

}

// Back where the drawing has it.
export async function deleteAreaEdit( { request, env, params } ) {

	await checkEditKey( request, env );
	if ( ! MODEL_PATTERN.test( params.model ) ) throw new HttpError( 400, 'Bad model' );
	if ( ! ID_PATTERN.test( params.id ) ) throw new HttpError( 400, 'Bad id' );
	await env.DB.prepare( 'DELETE FROM area_edits WHERE model = ? AND id = ?' ).bind( params.model, params.id ).run();
	return noContent();

}

// { pts: [ [ x, y, z ], ... ] (three corners or more), n: [ x, y, z ] }: nothing else is kept.
function checkEdit( body ) {

	const point = p => Array.isArray( p ) && p.length === 3 && p.every( v => typeof v === 'number' && Number.isFinite( v ) && Math.abs( v ) <= REACH );
	const { pts, n } = body ?? {};
	if ( ! Array.isArray( pts ) || pts.length < 3 || pts.length > MAX_CORNERS || ! pts.every( point ) ) throw new HttpError( 400, 'Bad outline' );
	if ( ! point( n ) || Math.hypot( ...n ) < 1e-6 ) throw new HttpError( 400, 'Bad normal' );
	return { pts, n };

}
