import { HttpError, isObject, json, noContent, readBytes, readJson } from './http.js';
import { checkEditKey } from './placements.js';

// Photos of a model's repair areas (src/repair-photos.js): for a model with areas (the B2D2 repair
// model), by the area's id. A photo is a row here (which area, the stage it shows, the day it was
// taken, a caption) and three files in the PHOTOS bucket (R2): the photo as it was taken (full),
// a copy to look at on screen (view) and a small one for lists (thumb), the last two made by the
// browser that sent it. Anyone can list and see them; adding, captioning or removing one needs
// the edit passcode (PLACEMENT_KEY), as for the areas themselves. They need the database and the
// bucket, not accounts; without the bucket (the Vercel copy of the site) there are no photos.
//
// Sending a photo: POST its details, which answers with its id; then PUT thumb, view and full,
// in that order. It's listed once the last has arrived. One left unfinished is cleared away a
// day later, the next time a photo is sent.

const MODEL_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
// Bytes, at most: a phone's photo as taken; the copies the browser makes of it.
const KINDS = { thumb: 400 * 1024, view: 4 * 1024 * 1024, full: 40 * 1024 * 1024 };
const TYPES = new Set( [ 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif' ] );
const MAX_PHOTOS = 5000;
const UNFINISHED = 24 * 3600 * 1000;
const TEXT = { stage: 100, taken: 40, caption: 500 };

const bucket = env => {

	if ( ! env.PHOTOS ) throw new HttpError( 503, 'No photo storage' );
	return env.PHOTOS;

};
const key = ( model, area, id, kind ) => `${ model }/${ area }/${ id }/${ kind }`;
const row = r => ( { id: r.id, area: r.area, stage: r.stage, taken: r.taken, caption: r.caption, width: r.width, height: r.height, size: Number( r.size ), createdAt: Number( r.created_at ) } );

function checkPath( params, ...names ) {

	if ( ! MODEL_PATTERN.test( params.model ) ) throw new HttpError( 400, 'Bad model' );
	for ( const name of names ) if ( ! ID_PATTERN.test( params[ name ] ) ) throw new HttpError( 400, 'Bad id' );

}

// The details that can be set: only strings of a sensible length.
function details( body ) {

	if ( ! isObject( body ) ) throw new HttpError( 400, 'Bad photo' );
	const out = {};
	for ( const [ name, max ] of Object.entries( TEXT ) ) {

		if ( body[ name ] == null ) continue;
		if ( typeof body[ name ] !== 'string' || body[ name ].length > max ) throw new HttpError( 400, 'Bad photo' );
		out[ name ] = body[ name ];

	}

	return out;

}

export async function listAreaPhotos( { env, params } ) {

	checkPath( params );
	// Without the bucket there are none to show.
	if ( ! env.PHOTOS ) return json( { photos: [] } );
	const { results } = await env.DB.prepare( 'SELECT * FROM area_photos WHERE model = ? AND ready = 1 ORDER BY area, taken, created_at' ).bind( params.model ).all();
	return json( { photos: results.map( row ) } );

}

export async function createAreaPhoto( { request, env, params } ) {

	await checkEditKey( request, env );
	checkPath( params, 'area' );
	const photos = bucket( env );
	const body = await readJson( request, 8 * 1024 );
	const { stage = '', taken = '', caption = '' } = details( body );
	const size = n => Number.isInteger( n ) && n > 0 && n <= 100000 ? n : 0;

	// Ones never finished go first, files and all.
	const { results: stale } = await env.DB.prepare( 'SELECT id, model, area FROM area_photos WHERE ready = 0 AND created_at < ?' ).bind( Date.now() - UNFINISHED ).all();
	for ( const old of stale ) await remove( env, photos, old );

	const { count } = await env.DB.prepare( 'SELECT COUNT(*) AS count FROM area_photos WHERE model = ?' ).bind( params.model ).first();
	if ( count >= MAX_PHOTOS ) throw new HttpError( 409, `No more than ${ MAX_PHOTOS } photos of a model can be kept` );

	const id = Array.from( crypto.getRandomValues( new Uint8Array( 12 ) ), b => b.toString( 16 ).padStart( 2, '0' ) ).join( '' );
	const now = Date.now();
	await env.DB.prepare( 'INSERT INTO area_photos ( id, model, area, stage, taken, caption, width, height, size, type, ready, created_at ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, 0, \'\', 0, ? )' )
		.bind( id, params.model, params.area, stage, taken, caption, size( body.width ), size( body.height ), now ).run();
	return json( { id, area: params.area, stage, taken, caption, width: size( body.width ), height: size( body.height ), size: 0, createdAt: now }, 201 );

}

// One of a photo's three files, as bytes.
export async function putAreaPhotoFile( { request, env, params } ) {

	await checkEditKey( request, env );
	checkPath( params, 'area', 'id' );
	const photos = bucket( env );
	const limit = KINDS[ params.kind ];
	if ( ! limit ) throw new HttpError( 404, 'Not found' );
	const type = ( request.headers.get( 'Content-Type' ) ?? '' ).split( ';' )[ 0 ].trim().toLowerCase();
	if ( ! TYPES.has( type ) ) throw new HttpError( 415, 'Not a photo' );
	const photo = await env.DB.prepare( 'SELECT id FROM area_photos WHERE id = ? AND model = ? AND area = ?' ).bind( params.id, params.model, params.area ).first();
	if ( ! photo ) throw new HttpError( 404, 'Not found' );

	const bytes = await readBytes( request, limit );
	if ( bytes.byteLength === 0 ) throw new HttpError( 400, 'Bad photo' );
	await photos.put( key( params.model, params.area, params.id, params.kind ), bytes, { httpMetadata: { contentType: type } } );
	if ( params.kind === 'full' ) {

		// The last to arrive: listed from now on, if the copies are there.
		const [ thumb, view ] = await Promise.all( [ 'thumb', 'view' ].map( kind => photos.head( key( params.model, params.area, params.id, kind ) ) ) );
		if ( ! thumb || ! view ) throw new HttpError( 409, 'Send the copies first' );
		await env.DB.prepare( 'UPDATE area_photos SET ready = 1, size = ?, type = ? WHERE id = ?' ).bind( bytes.byteLength, type, params.id ).run();

	}

	return noContent();

}

// A photo's file. They never change once sent, so browsers may keep them.
export async function getAreaPhotoFile( { request, env, params } ) {

	checkPath( params, 'area', 'id' );
	if ( ! KINDS[ params.kind ] ) throw new HttpError( 404, 'Not found' );
	const object = await bucket( env ).get( key( params.model, params.area, params.id, params.kind ) );
	if ( ! object ) throw new HttpError( 404, 'Not found' );
	if ( request.headers.get( 'If-None-Match' ) === object.httpEtag ) return new Response( null, { status: 304, headers: { ETag: object.httpEtag, 'Cache-Control': 'public, max-age=31536000, immutable' } } );
	return new Response( object.body, { headers: {
		'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
		'Content-Length': String( object.size ),
		'Cache-Control': 'public, max-age=31536000, immutable',
		ETag: object.httpEtag,
		'X-Content-Type-Options': 'nosniff',
		// Only ever shown as a picture, never run as a page.
		'Content-Security-Policy': 'default-src \'none\'; sandbox',
	} } );

}

export async function updateAreaPhoto( { request, env, params } ) {

	await checkEditKey( request, env );
	checkPath( params, 'area', 'id' );
	const changes = details( await readJson( request, 8 * 1024 ) );
	const names = Object.keys( changes );
	if ( names.length ) {

		await env.DB.prepare( `UPDATE area_photos SET ${ names.map( name => `${ name } = ?` ).join( ', ' ) } WHERE id = ? AND model = ? AND area = ?` )
			.bind( ...names.map( name => changes[ name ] ), params.id, params.model, params.area ).run();

	}

	const photo = await env.DB.prepare( 'SELECT * FROM area_photos WHERE id = ? AND model = ? AND area = ?' ).bind( params.id, params.model, params.area ).first();
	if ( ! photo ) throw new HttpError( 404, 'Not found' );
	return json( row( photo ) );

}

export async function deleteAreaPhoto( { request, env, params } ) {

	await checkEditKey( request, env );
	checkPath( params, 'area', 'id' );
	await remove( env, bucket( env ), params );
	return noContent();

}

async function remove( env, photos, { model, area, id } ) {

	await photos.delete( Object.keys( KINDS ).map( kind => key( model, area, id, kind ) ) );
	await env.DB.prepare( 'DELETE FROM area_photos WHERE id = ? AND model = ? AND area = ?' ).bind( id, model, area ).run();

}
