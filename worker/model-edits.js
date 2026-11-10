import { HttpError, isObject, json, noContent, readJson } from './http.js';
import { checkEditKey } from './placements.js';

// Changes the admin made to a model's structure in the twin (src/model-edits.js), for a model
// with areas (the B2D2 repair model): members added to it (beams: a box from one end to the
// other, so wide and so deep, in a colour) and faces painted (a wall, floor or soffit of a layer,
// found again from a point on it and the way it faces). All in the model's markup frame, each
// under an id. Anyone can read them, so everyone sees the model as the admin left it; saving or
// removing one needs the edit passcode (PLACEMENT_KEY). They need only the database.

const MODEL_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const COLOUR_PATTERN = /^#[0-9a-f]{6}$/i;
const LAYER_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_EDITS = 2000;
// Metres from the model's origin; well past anything in one model.
const REACH = 10000;

export async function listModelEdits( { env, params } ) {

	if ( ! MODEL_PATTERN.test( params.model ) ) throw new HttpError( 400, 'Bad model' );
	const { results } = await env.DB.prepare( 'SELECT id, data, updated_at FROM model_edits WHERE model = ? ORDER BY updated_at, id' ).bind( params.model ).all();
	return json( { edits: results.map( row => ( { id: row.id, ...JSON.parse( row.data ), updatedAt: Number( row.updated_at ) } ) ) } );

}

export async function saveModelEdit( { request, env, params } ) {

	await checkEditKey( request, env );
	if ( ! MODEL_PATTERN.test( params.model ) ) throw new HttpError( 400, 'Bad model' );
	if ( ! ID_PATTERN.test( params.id ) ) throw new HttpError( 400, 'Bad id' );
	const edit = checkEdit( await readJson( request, 8 * 1024 ) );

	const existing = await env.DB.prepare( 'SELECT id FROM model_edits WHERE model = ? AND id = ?' ).bind( params.model, params.id ).first();
	if ( ! existing ) {

		const { count } = await env.DB.prepare( 'SELECT COUNT(*) AS count FROM model_edits WHERE model = ?' ).bind( params.model ).first();
		if ( count >= MAX_EDITS ) throw new HttpError( 409, `No more than ${ MAX_EDITS } changes to a model can be kept` );

	}

	const now = Date.now();
	await env.DB.prepare( `
		INSERT INTO model_edits ( model, id, data, updated_at ) VALUES ( ?, ?, ?, ? )
		ON CONFLICT ( model, id ) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
	` ).bind( params.model, params.id, JSON.stringify( edit ), now ).run();
	return json( { id: params.id, ...edit, updatedAt: now } );

}

export async function deleteModelEdit( { request, env, params } ) {

	await checkEditKey( request, env );
	if ( ! MODEL_PATTERN.test( params.model ) ) throw new HttpError( 400, 'Bad model' );
	if ( ! ID_PATTERN.test( params.id ) ) throw new HttpError( 400, 'Bad id' );
	await env.DB.prepare( 'DELETE FROM model_edits WHERE model = ? AND id = ?' ).bind( params.model, params.id ).run();
	return noContent();

}

// A beam, { kind: 'beam', a, b, width, depth, colour, name? }, or a painted face, { kind: 'paint',
// layer, at, n, colour }: nothing else is kept.
function checkEdit( body ) {

	if ( ! isObject( body ) ) throw new HttpError( 400, 'Bad change' );
	const point = p => Array.isArray( p ) && p.length === 3 && p.every( v => typeof v === 'number' && Number.isFinite( v ) && Math.abs( v ) <= REACH );
	const { kind, colour } = body;
	if ( typeof colour !== 'string' || ! COLOUR_PATTERN.test( colour ) ) throw new HttpError( 400, 'Bad colour' );
	if ( kind === 'beam' ) {

		const { a, b, width, depth, name } = body;
		const size = v => typeof v === 'number' && Number.isFinite( v ) && v >= 0.01 && v <= 20;
		if ( ! point( a ) || ! point( b ) || Math.hypot( a[ 0 ] - b[ 0 ], a[ 1 ] - b[ 1 ], a[ 2 ] - b[ 2 ] ) < 0.05 ) throw new HttpError( 400, 'Bad ends' );
		if ( ! size( width ) || ! size( depth ) ) throw new HttpError( 400, 'Bad size' );
		if ( name != null && ( typeof name !== 'string' || name.length > 100 ) ) throw new HttpError( 400, 'Bad name' );
		return { kind, a, b, width, depth, colour, ...( name ? { name } : {} ) };

	}

	if ( kind === 'paint' ) {

		const { layer, at, n } = body;
		if ( typeof layer !== 'string' || ! LAYER_PATTERN.test( layer ) ) throw new HttpError( 400, 'Bad layer' );
		if ( ! point( at ) || ! point( n ) || Math.hypot( ...n ) < 1e-6 ) throw new HttpError( 400, 'Bad face' );
		return { kind, layer, at, n, colour };

	}

	throw new HttpError( 400, 'Bad change' );

}
