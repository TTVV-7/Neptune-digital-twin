import { HttpError, json, readJson, sha256Hex } from './http.js';

// Where models from MODELS in src/config.js stand, as moved on the live site: anyone can read
// them, so everyone sees a model where it was last saved, and saving needs the edit passcode
// (PLACEMENT_KEY), so viewers can move a model in their own browser but not for everyone. A
// saved position wins over the one in config.js; each model is known by its file (`url`).
//
// These work without accounts (no GOOGLE_CLIENT_ID), needing only the database.

const URL_PATTERN = /^models\/[A-Za-z0-9._\- ]{1,120}\.(glb|gltf)$/;
// Metres from the terminal centre, and above it; well past anywhere on the terminal.
const REACH = 20000;
const HEIGHT = 2000;

// The admin's edit passcode (PLACEMENT_KEY) in the X-Edit-Key header, for anything saved for
// everyone: models' positions here, and items (shared-items.js).
export async function checkEditKey( request, env ) {

	if ( ! env.PLACEMENT_KEY ) throw new HttpError( 403, 'Saving for everyone isn\'t set up' );
	const given = request.headers.get( 'X-Edit-Key' ) ?? '';
	// Compared as hashes, so the time it takes says nothing about how much of it was right.
	if ( ! given || await sha256Hex( given.trim() ) !== await sha256Hex( String( env.PLACEMENT_KEY ).trim() ) ) throw new HttpError( 403, 'Wrong passcode' );

}

export async function listPlacements( { env } ) {

	const { results } = await env.DB.prepare( 'SELECT url, east, north, up, heading, updated_at FROM placements' ).all();
	const placements = {};
	for ( const row of results ) placements[ row.url ] = { east: row.east, north: row.north, up: row.up, heading: row.heading, updatedAt: row.updated_at };
	return json( { placements } );

}

export async function savePlacement( { request, env } ) {

	await checkEditKey( request, env );

	const body = await readJson( request, 4096 );
	const { url, east, north, up, heading } = body ?? {};
	const inRange = ( v, limit ) => typeof v === 'number' && Number.isFinite( v ) && Math.abs( v ) <= limit;
	if ( typeof url !== 'string' || ! URL_PATTERN.test( url ) || url.includes( '..' ) ) throw new HttpError( 400, 'Bad model' );
	if ( ! inRange( east, REACH ) || ! inRange( north, REACH ) || ! inRange( heading, 720 ) || ! ( up === null || inRange( up, HEIGHT ) ) ) throw new HttpError( 400, 'Bad position' );

	const round = v => Math.round( v * 1000 ) / 1000;
	const placement = { east: round( east ), north: round( north ), up: up === null ? null : round( up ), heading: round( ( ( heading % 360 ) + 360 ) % 360 ), updatedAt: Date.now() };
	await env.DB.prepare( `
		INSERT INTO placements ( url, east, north, up, heading, updated_at ) VALUES ( ?, ?, ?, ?, ?, ? )
		ON CONFLICT ( url ) DO UPDATE SET east = excluded.east, north = excluded.north, up = excluded.up, heading = excluded.heading, updated_at = excluded.updated_at
	` ).bind( url, placement.east, placement.north, placement.up, placement.heading, placement.updatedAt ).run();
	return json( { url, ...placement } );

}
