import { HttpError, cleanText, isObject, json, jsonText, noContent, randomToken, readJson } from './http.js';
import { isAllowed } from './sessions.js';

// Layouts saved to your account. Only the owner can list, read, change, share or delete one;
// anyone with a share link can read it. updatedAt (milliseconds) doubles as a version: a save
// that says which version it started from is refused with 409 if the layout has moved on, so
// two tabs or computers don't silently overwrite each other.

const LAYOUT_LIMIT = 200;
// Stored size of one layout and of everyone's layouts together per account, so one account
// (any Google account can sign in unless the allow-lists are set) can't fill the database.
const LAYOUT_BYTES = 1024 * 1024;
const ACCOUNT_BYTES = 25 * 1024 * 1024;
const ID_PATTERN = /^[A-Za-z0-9_-]{16}$/;
const SHARE_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const SUMMARY = 'id, site, name, share_token, updated_at';

const notFound = () => new HttpError( 404, 'Not found' );
const badRequest = () => new HttpError( 400, 'Bad request' );

export async function listLayouts( { env, url, user } ) {

	const site = url.searchParams.get( 'site' );
	const query = site === null
		? env.DB.prepare( `SELECT ${ SUMMARY } FROM layouts WHERE user_id = ? ORDER BY updated_at DESC` ).bind( user.id )
		: env.DB.prepare( `SELECT ${ SUMMARY } FROM layouts WHERE user_id = ? AND site = ? ORDER BY updated_at DESC` ).bind( user.id, site );
	const { results } = await query.all();
	return json( { layouts: results.map( summary ) } );

}

export async function createLayout( { request, env, user } ) {

	const fields = readFields( await readJson( request ), { create: true } );
	const { count, bytes } = await env.DB.prepare( 'SELECT COUNT(*) AS count, COALESCE( SUM( LENGTH( data ) ), 0 ) AS bytes FROM layouts WHERE user_id = ?' ).bind( user.id ).first();
	if ( count >= LAYOUT_LIMIT ) throw new HttpError( 403, 'Too many layouts. Delete some first.' );
	if ( bytes + fields.data.length > ACCOUNT_BYTES ) throw accountFull();

	const now = Date.now();
	const row = await env.DB.prepare( `
		INSERT INTO layouts ( id, user_id, site, name, data, created_at, updated_at ) VALUES ( ?, ?, ?, ?, ?, ?, ? )
		RETURNING ${ SUMMARY }
	` ).bind( randomToken( 12 ), user.id, fields.site, fields.name, fields.data, now, now ).first();
	return json( summary( row ), 201, etag( row ) );

}

export async function getLayout( { env, user, params } ) {

	const row = await ownLayout( env, user, params.id, `${ SUMMARY }, data` );
	return jsonWithData( summary( row ), row.data, etag( row ) );

}

// Change the name and/or data. The version it started from can be given as If-Match: "<updatedAt>"
// or as updatedAt in the body; without one, the save always wins.
export async function updateLayout( { request, env, user, params } ) {

	if ( ! ID_PATTERN.test( params.id ) ) throw notFound();
	const body = await readJson( request );
	const fields = readFields( body, { create: false } );
	if ( fields.name === undefined && fields.data === undefined ) throw badRequest();
	const expected = expectedVersion( request, body );
	if ( fields.data !== undefined ) {

		const { bytes } = await env.DB.prepare( 'SELECT COALESCE( SUM( LENGTH( data ) ), 0 ) AS bytes FROM layouts WHERE user_id = ? AND id != ?' ).bind( user.id, params.id ).first();
		if ( bytes + fields.data.length > ACCOUNT_BYTES ) throw accountFull();

	}

	const sets = [];
	const values = [];
	for ( const column of [ 'name', 'data' ] ) {

		if ( fields[ column ] === undefined ) continue;
		sets.push( `${ column } = ?` );
		values.push( fields[ column ] );

	}

	// Always later than before, even for two saves in the same millisecond, so it works as a version.
	sets.push( 'updated_at = MAX( ?, updated_at + 1 )' );
	values.push( Date.now(), params.id, user.id );
	let where = 'id = ? AND user_id = ?';
	if ( expected !== null ) {

		where += ' AND updated_at = ?';
		values.push( expected );

	}

	const row = await env.DB.prepare( `UPDATE layouts SET ${ sets.join( ', ' ) } WHERE ${ where } RETURNING ${ SUMMARY }` ).bind( ...values ).first();
	if ( row ) return json( summary( row ), 200, etag( row ) );

	// Nothing changed: it isn't yours (or is gone), or someone saved a newer version meanwhile.
	const current = await env.DB.prepare( 'SELECT updated_at FROM layouts WHERE id = ? AND user_id = ?' ).bind( params.id, user.id ).first();
	if ( ! current ) throw notFound();
	throw new HttpError( 409, 'This layout was changed somewhere else', { updatedAt: current.updated_at } );

}

export async function deleteLayout( { env, user, params } ) {

	if ( ! ID_PATTERN.test( params.id ) ) throw notFound();
	const { meta } = await env.DB.prepare( 'DELETE FROM layouts WHERE id = ? AND user_id = ?' ).bind( params.id, user.id ).run();
	if ( meta.changes === 0 ) throw notFound();
	return noContent();

}

// Sharing again returns the same link, so links already sent keep working.
export async function shareLayout( { env, user, params } ) {

	if ( ! ID_PATTERN.test( params.id ) ) throw notFound();
	const row = await env.DB.prepare( 'UPDATE layouts SET share_token = COALESCE( share_token, ? ) WHERE id = ? AND user_id = ? RETURNING share_token' )
		.bind( randomToken( 16 ), params.id, user.id ).first();
	if ( ! row ) throw notFound();
	return json( { shared: true, shareToken: row.share_token } );

}

export async function unshareLayout( { env, user, params } ) {

	if ( ! ID_PATTERN.test( params.id ) ) throw notFound();
	const { meta } = await env.DB.prepare( 'UPDATE layouts SET share_token = NULL WHERE id = ? AND user_id = ?' ).bind( params.id, user.id ).run();
	if ( meta.changes === 0 ) throw notFound();
	return noContent();

}

// A shared layout, for anyone with the link: read only, and only the owner's first name (never
// anything taken from their email address).
export async function getShared( { env, params } ) {

	const row = await sharedLayout( env, params.token, 'layouts.name, layouts.site, layouts.data, layouts.updated_at, users.name AS owner_name, users.given_name' );
	if ( ! row ) throw notFound();
	const owner = row.given_name || row.owner_name?.split( ' ' )[ 0 ] || 'someone';
	return jsonWithData( { name: row.name, site: row.site, updatedAt: row.updated_at, owner }, row.data, { 'X-Robots-Tag': 'noindex' } );

}

export async function isShared( env, token ) {

	return !! await sharedLayout( env, token, 'layouts.id' );

}

// Links only work while their owner is still allowed to sign in, so taking someone off the
// allow-lists also turns off the links they made (and the Maps key that comes with them).
async function sharedLayout( env, token, columns ) {

	if ( typeof token !== 'string' || ! SHARE_PATTERN.test( token ) ) return null;
	const row = await env.DB.prepare( `SELECT ${ columns }, users.email AS owner_email, users.hosted_domain AS owner_hd FROM layouts JOIN users ON users.id = layouts.user_id WHERE layouts.share_token = ?` ).bind( token ).first();
	return row && isAllowed( { email: row.owner_email, hd: row.owner_hd }, env ) ? row : null;

}

function accountFull() {

	return new HttpError( 403, 'Your account is full. Delete some layouts first.' );

}

async function ownLayout( env, user, id, columns ) {

	if ( ! ID_PATTERN.test( id ) ) throw notFound();
	// Someone else's layout is "not found" too, so ids can't be probed.
	const row = await env.DB.prepare( `SELECT ${ columns } FROM layouts WHERE id = ? AND user_id = ?` ).bind( id, user.id ).first();
	if ( ! row ) throw notFound();
	return row;

}

// Checked request fields: site (on create only), name and data, each stored as text.
function readFields( body, { create } ) {

	if ( ! isObject( body ) ) throw badRequest();
	const fields = {};
	if ( create ) fields.site = required( cleanText( body.site, 100 ) );
	if ( create || body.name !== undefined ) fields.name = required( cleanText( body.name, 100 ) );
	if ( create || body.data !== undefined ) {

		// The app's layout format: { version, items: [...], extras: {...}, ... }.
		if ( ! isObject( body.data ) || ! Array.isArray( body.data.items ) ) throw badRequest();
		fields.data = JSON.stringify( body.data );
		// Measured as stored: re-encoding can make it bigger than the request was.
		if ( fields.data.length > LAYOUT_BYTES ) throw new HttpError( 413, 'This layout is too big to save' );

	}

	return fields;

}

function required( value ) {

	if ( value === null ) throw badRequest();
	return value;

}

function expectedVersion( request, body ) {

	const header = request.headers.get( 'If-Match' );
	if ( header === null && body.updatedAt === undefined ) return null;
	if ( header?.trim() === '*' ) return null;
	const value = header !== null ? Number( header.replace( /^W\//, '' ).replace( /"/g, '' ) ) : body.updatedAt;
	if ( ! Number.isSafeInteger( value ) ) throw badRequest();
	return value;

}

function summary( row ) {

	return {
		id: row.id,
		site: row.site,
		name: row.name,
		updatedAt: row.updated_at,
		shared: row.share_token !== null,
		shareToken: row.share_token,
	};

}

function etag( row ) {

	return { ETag: `"${ row.updated_at }"` };

}

// The stored layout JSON goes out as it is, rather than being parsed and encoded again.
function jsonWithData( fields, data, headers ) {

	const head = JSON.stringify( fields );
	return jsonText( `${ head.slice( 0, - 1 ) },"data":${ data }}`, 200, headers );

}
