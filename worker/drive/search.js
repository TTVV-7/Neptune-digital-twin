import { HttpError, json } from '../http.js';

// Place search for the globe, passed on to OpenStreetMap's Nominatim under its usage policy
// (https://operations.osmfoundation.org/policies/nominatim/): the app names itself in the
// User-Agent, sends at most one request a second from everyone together (the DriveLimits object
// hands out turns), keeps answers for a day in Cloudflare's cache so a popular place is looked up
// once, and the page only searches when Enter is pressed, never as you type. The page shows
// "Search © OpenStreetMap contributors".

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'WorldDrive/1.0 (+https://worlddrive.app)';
const RESULTS = 6;
const MAX_QUERY = 120;
// Letters and numbers in any script, spaces and the punctuation of addresses: nothing else is
// passed on.
const QUERY = /^[\p{L}\p{M}\p{N} .,'’\-#&/()°]+$/u;
const CACHE_SECONDS = 24 * 60 * 60;

// GET /api/search?q=...: { results: [ { name, lat, lon, type } ] }. SEARCH_UPSTREAM is for the
// tests only, which stand in for Nominatim on this machine.
export async function search( { env, url, ctx, limits } ) {

	const q = cleanQuery( url.searchParams.get( 'q' ) );
	if ( ! q ) throw new HttpError( 400, 'Type a place or an address' );

	const cache = caches.default;
	const key = new Request( `${ url.origin }/api/search?q=${ encodeURIComponent( q ) }` );
	const cached = await cache.match( key );
	if ( cached ) return marked( cached, 'hit' );

	const turn = await limits.searchSlot();
	if ( turn.busy ) throw new HttpError( 429, 'Search is busy. Try again in a moment', { retryAfter: turn.retryAfter }, { 'Retry-After': String( turn.retryAfter ) } );
	if ( turn.wait > 0 ) await new Promise( resolve => setTimeout( resolve, turn.wait ) );

	const upstream = new URL( env.SEARCH_UPSTREAM || NOMINATIM );
	upstream.search = new URLSearchParams( { q, format: 'jsonv2', limit: String( RESULTS ), 'accept-language': 'en' } );
	let places;
	try {

		const res = await fetch( upstream, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } } );
		places = res.ok ? await res.json() : null;

	} catch {

		places = null;

	}

	if ( ! Array.isArray( places ) ) throw new HttpError( 502, 'Search isn\'t answering. Try again soon' );

	const results = places.map( toResult ).filter( Boolean ).slice( 0, RESULTS );
	const response = json( { results }, 200, { 'Cache-Control': `public, max-age=${ CACHE_SECONDS }` } );
	ctx.waitUntil( cache.put( key, response.clone() ) );
	return marked( response, 'miss' );

}

// The query as it's looked up and cached: control characters out, spaces squeezed, lower case.
// Null when it's empty, too long or has characters an address doesn't.
export function cleanQuery( value ) {

	if ( typeof value !== 'string' ) return null;
	const q = value.normalize( 'NFC' ).replace( /[\u0000-\u001f\u007f]/g, ' ' ).replace( /\s+/g, ' ' ).trim().toLowerCase();
	if ( q.length < 2 || q.length > MAX_QUERY || ! QUERY.test( q ) ) return null;
	return q;

}

// Only what the globe needs from a Nominatim place. Its type is OpenStreetMap's ('bridge',
// 'motorway', 'city'...): a bridge starts on its deck (src/drive-app/spawn.js).
function toResult( place ) {

	const lat = Number( place?.lat );
	const lon = Number( place?.lon );
	const name = typeof place?.display_name === 'string' ? place.display_name.replace( /[\u0000-\u001f\u007f]/g, '' ).trim().slice( 0, 200 ) : '';
	if ( ! name || ! Number.isFinite( lat ) || ! Number.isFinite( lon ) || Math.abs( lat ) > 90 || Math.abs( lon ) > 180 ) return null;
	const type = typeof place.type === 'string' ? place.type : typeof place.addresstype === 'string' ? place.addresstype : '';
	return { name, lat, lon, type: type.slice( 0, 40 ) };

}

// Say whether the answer came from the cache (the tests look).
function marked( response, cache ) {

	const copy = new Response( response.body, response );
	copy.headers.set( 'X-Search-Cache', cache );
	return copy;

}
