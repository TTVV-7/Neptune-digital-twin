import { HttpError, json, noContent, readJson } from './http.js';
import { checkEditKey } from './placements.js';

// Repair areas the admin moved, added or took away in the twin (src/repair-areas.js): for a model
// with areas (the B2D2 repair model), by the area's id, each moved or added area's outline and the
// way it faces, in the model's markup frame, and its details for one added. Anyone can read them, so everyone sees the areas where the admin put them;
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

// Back where the drawing has it (or, for one added in the twin, gone).
export async function deleteAreaEdit( { request, env, params } ) {

	await checkEditKey( request, env );
	if ( ! MODEL_PATTERN.test( params.model ) ) throw new HttpError( 400, 'Bad model' );
	if ( ! ID_PATTERN.test( params.id ) ) throw new HttpError( 400, 'Bad id' );
	await env.DB.prepare( 'DELETE FROM area_edits WHERE model = ? AND id = ?' ).bind( params.model, params.id ).run();
	return noContent();

}

// What's kept of an area: { deleted: true } for one taken away, or where it is, { pts: [ [ x, y,
// z ], ... ] (three corners or more), n: [ x, y, z ] }, with, for one added in the twin (added:
// true) or one whose details were changed, its details: f { type, status, text, and the day it
// reached each stage: chipped, sandblasted, epoxy, shotcreted }, its panel number (no), zone, face,
// grid and area (m²). Nothing else is kept.
const TEXT = { type: 100, status: 100, chipped: 40, sandblasted: 40, epoxy: 40, shotcreted: 40, text: 1000 };
const LABELS = { no: 40, zone: 40, face: 120, grid: 120 };

function checkEdit( body ) {

	if ( body?.deleted === true ) return { deleted: true };
	const point = p => Array.isArray( p ) && p.length === 3 && p.every( v => typeof v === 'number' && Number.isFinite( v ) && Math.abs( v ) <= REACH );
	const { pts, n, f, area, added } = body ?? {};
	if ( ! Array.isArray( pts ) || pts.length < 3 || pts.length > MAX_CORNERS || ! pts.every( point ) ) throw new HttpError( 400, 'Bad outline' );
	if ( ! point( n ) || Math.hypot( ...n ) < 1e-6 ) throw new HttpError( 400, 'Bad normal' );
	const edit = { pts, n };
	if ( added === true ) edit.added = true;
	if ( f != null ) {

		if ( typeof f !== 'object' || Array.isArray( f ) ) throw new HttpError( 400, 'Bad details' );
		edit.f = {};
		for ( const [ key, max ] of Object.entries( TEXT ) ) {

			if ( f[ key ] == null ) continue;
			if ( typeof f[ key ] !== 'string' || f[ key ].length > max ) throw new HttpError( 400, 'Bad details' );
			edit.f[ key ] = f[ key ];

		}

	}

	for ( const [ key, max ] of Object.entries( LABELS ) ) {

		if ( body[ key ] == null ) continue;
		if ( typeof body[ key ] !== 'string' || body[ key ].length > max ) throw new HttpError( 400, 'Bad details' );
		edit[ key ] = body[ key ];

	}

	if ( area != null ) {

		if ( typeof area !== 'number' || ! Number.isFinite( area ) || area < 0 || area > 10000 ) throw new HttpError( 400, 'Bad area' );
		edit.area = area;

	}

	if ( edit.added && ! edit.f ) throw new HttpError( 400, 'Bad details' );
	return edit;

}
