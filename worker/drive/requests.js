import { HttpError, isObject, json, readJson } from '../http.js';
import { currentAccount } from './accounts.js';
import { adminAccount } from './admin.js';
import { database, takeTurn } from './players.js';

// Feature requests (docs/world-drive.md, "Feature requests"): a signed-in player writes what they'd
// like from the account panel's **Request a feature** (POST /api/requests), and the owner reads them
// on the admin page (GET /api/admin/requests), newest first, marking each done or deleting it (POST
// /api/admin/requests). Only signed-in accounts can send, REQUESTS_DAILY a day each and
// REQUESTS_ADDRESS_DAILY from one address (a school's included), so the list stays readable. Nothing
// is emailed: the admin page is where they're read.

export const REQUEST_MOST = 1000;
const REQUESTS_DAILY = 5;
const REQUESTS_ADDRESS_DAILY = 100;
// The most the admin page lists at once.
const LIST_MOST = 200;
const DAY = 24 * 60 * 60 * 1000;

// POST /api/requests { text }: kept, { ok: true }. 401 signed out, 400 for nothing or too much, 429
// past the day's.
export async function sendRequest( context ) {

	const { request, env, limits, now } = context;
	const db = database( env );
	const body = await readJson( request, 8 * 1024 );
	if ( ! isObject( body ) || typeof body.text !== 'string' ) throw new HttpError( 400, 'Bad request' );
	const text = body.text.replace( /\r\n?/g, '\n' ).trim();
	if ( ! text ) throw new HttpError( 400, 'Write what you\'d like first' );
	if ( text.length > REQUEST_MOST ) throw new HttpError( 400, `At most ${ REQUEST_MOST.toLocaleString( 'en' ) } characters` );
	const account = await currentAccount( context );
	if ( ! account ) throw new HttpError( 401, 'Sign in first' );
	const today = await db.prepare( 'SELECT COUNT(*) AS n FROM feature_requests WHERE account_id = ? AND created_at > ?' ).bind( account.id, now - DAY ).first();
	if ( today.n >= REQUESTS_DAILY ) throw new HttpError( 429, 'That\'s all for today. Thanks! Try again tomorrow', { retryAfter: 86400 } );
	await takeTurn( limits, request, 'request', now, REQUESTS_ADDRESS_DAILY, 48 );
	const player = await db.prepare( 'SELECT name FROM players WHERE account_id = ? ORDER BY created_at, id LIMIT 1' ).bind( account.id ).first();
	const name = player?.name || account.username || account.name || '';
	await db.prepare( 'INSERT INTO feature_requests ( account_id, name, text, created_at ) VALUES ( ?, ?, ?, ? )' ).bind( account.id, name, text, now ).run();
	return json( { ok: true } );

}

// GET /api/admin/requests: { requests: [ { id, name, text, createdAt, doneAt, supporter } ], open }:
// the newest LIST_MOST, and how many aren't done.
export async function adminRequests( context ) {

	await adminAccount( context );
	return json( await listed( database( context.env ) ) );

}

// POST /api/admin/requests { id, action: 'done' | 'open' | 'delete' }: the list as GET answers it.
export async function adminRequestChange( context ) {

	const { request, env, now } = context;
	await adminAccount( context );
	const db = database( env );
	const body = await readJson( request, 1024 );
	if ( ! isObject( body ) || ! Number.isSafeInteger( body.id ) ) throw new HttpError( 400, 'Bad request' );
	if ( body.action === 'done' ) await db.prepare( 'UPDATE feature_requests SET done_at = ? WHERE id = ?' ).bind( now, body.id ).run();
	else if ( body.action === 'open' ) await db.prepare( 'UPDATE feature_requests SET done_at = NULL WHERE id = ?' ).bind( body.id ).run();
	else if ( body.action === 'delete' ) await db.prepare( 'DELETE FROM feature_requests WHERE id = ?' ).bind( body.id ).run();
	else throw new HttpError( 400, 'Bad request' );
	return json( await listed( db ) );

}

async function listed( db ) {

	const [ rows, open ] = await db.batch( [
		db.prepare( `SELECT r.id, r.name, r.text, r.created_at, r.done_at, EXISTS ( SELECT 1 FROM purchases p WHERE p.account_id = r.account_id AND p.status = 'paid' ) AS supporter
			FROM feature_requests r ORDER BY r.created_at DESC, r.id DESC LIMIT ?` ).bind( LIST_MOST ),
		db.prepare( 'SELECT COUNT(*) AS n FROM feature_requests WHERE done_at IS NULL' ),
	] );
	return {
		requests: rows.results.map( r => ( { id: r.id, name: r.name, text: r.text, createdAt: r.created_at, doneAt: r.done_at, supporter: !! r.supporter } ) ),
		open: open.results[ 0 ].n,
	};

}
