import { HttpError, checkSameOrigin, isObject, json, randomToken, readJson, sha256Hex } from '../http.js';
import { PERIODS, forgetBoards } from './boards.js';
import { cleanName, nameAllowed, nameKey } from './names.js';
import { addressOf, setting } from './settings.js';

// Leaderboard players (docs/world-drive.md): no accounts and no sign-up, just a nickname. Picking
// one makes a player with a random id and a random secret; the page keeps both (in localStorage)
// and the secret is in this answer only: the database keeps its SHA-256, so a copy of it can't be
// used to post as anyone. Renaming, and every score, need the secret. If the page loses it, its
// player picks a new name.

export const PLAYER_ID = /^[A-Za-z0-9_-]{16}$/;
const SECRET = /^[A-Za-z0-9_-]{32}$/;
// New names and renames a visitor may make in a day (NAMES_PER_VISITOR_DAILY).
const NAMES_DAILY = 20;
const BAD_NAME = 'Names are 3 to 16 letters, numbers, spaces, _ or -';

// POST /api/player { name }: { id, secret, name }.
export async function createPlayer( { request, env, url, limits, now } ) {

	checkSameOrigin( request, url );
	const db = database( env );
	const body = await readJson( request, 1024 );
	const name = checkName( isObject( body ) ? body.name : null );
	await takeTurn( limits, request, 'name', now, setting( env.NAMES_PER_VISITOR_DAILY, NAMES_DAILY ) );

	const id = randomToken( 12 );
	const secret = randomToken( 24 );
	const { meta } = await db.prepare( 'INSERT INTO players ( id, name, name_key, secret_hash, created_at, last_seen_at ) VALUES ( ?, ?, ?, ?, ?, ? ) ON CONFLICT ( name_key ) DO NOTHING' )
		.bind( id, name, nameKey( name ), await sha256Hex( secret ), now, now ).run();
	if ( ! meta.changes ) throw new HttpError( 409, 'That name is taken' );
	return json( { id, secret, name }, 201 );

}

// POST /api/player/rename { id, secret, name }: { id, name }.
export async function renamePlayer( { request, env, url, limits, now } ) {

	checkSameOrigin( request, url );
	const db = database( env );
	const body = await readJson( request, 1024 );
	if ( ! isObject( body ) ) throw new HttpError( 400, 'Bad request' );
	const { id, secret } = credentials( body );
	const name = checkName( body.name );
	await authenticate( db, id, secret );
	await takeTurn( limits, request, 'name', now, setting( env.NAMES_PER_VISITOR_DAILY, NAMES_DAILY ) );

	// OR IGNORE: a name someone else has changes nothing (and their own, in another case, is fine).
	const { meta } = await db.prepare( 'UPDATE OR IGNORE players SET name = ?, name_key = ?, last_seen_at = ? WHERE id = ?' ).bind( name, nameKey( name ), now, id ).run();
	if ( ! meta.changes ) throw new HttpError( 409, 'That name is taken' );
	// The new name on today's, this week's and the all-time boards straight away (the boards of one
	// place catch up within half a minute).
	await forgetBoards( url, Object.values( PERIODS ).map( period => [ period( now ), '' ] ) );
	return json( { id, name } );

}

// The leaderboard's database (the DB binding in wrangler.drive.jsonc).
export function database( env ) {

	if ( ! env.DB ) throw new HttpError( 503, 'Not set up yet' );
	return env.DB;

}

// { id, secret } from a request body, or a 400 if they aren't the shape they're made in.
export function credentials( body ) {

	const { id, secret } = body;
	if ( typeof id !== 'string' || ! PLAYER_ID.test( id ) || typeof secret !== 'string' || ! SECRET.test( secret ) ) throw new HttpError( 400, 'Bad request' );
	return { id, secret };

}

// The player with this id and secret ({ id, name, last_score_at }), or a 403: the same for an
// unknown id as for the wrong secret.
export async function authenticate( db, id, secret ) {

	const player = await db.prepare( 'SELECT id, name, last_score_at FROM players WHERE id = ? AND secret_hash = ?' ).bind( id, await sha256Hex( secret ) ).first();
	if ( ! player ) throw new HttpError( 403, 'Forbidden', { reason: 'player' } );
	return player;

}

// One of today's `limit` turns at `kind` for this visitor (see DriveLimits.take), or a 429 until
// midnight UTC.
export async function takeTurn( limits, request, kind, now, limit ) {

	const turn = await limits.take( kind, addressOf( request ), { now, limit } );
	if ( turn.ok ) return;
	throw new HttpError( 429, 'That\'s all for today. Try again tomorrow', { retryAfter: turn.retryAfter }, { 'Retry-After': String( turn.retryAfter ) } );

}

function checkName( value ) {

	const name = cleanName( value );
	if ( ! name ) throw new HttpError( 400, BAD_NAME );
	if ( ! nameAllowed( name ) ) throw new HttpError( 400, 'That name isn\'t allowed. Pick another' );
	return name;

}
