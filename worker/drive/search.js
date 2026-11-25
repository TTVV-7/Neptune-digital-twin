import { HttpError, json } from '../http.js';
import { addressOf } from './settings.js';

// Place and address search for the globe, Build's start-a-project and its Site button.
//
// Two providers:
//  - Google's Geocoding API, when the server secret GOOGLE_GEOCODING_KEY is set (a key of its own,
//    restricted to the Geocoding API and never sent to a browser: not GOOGLE_MAPS_API_KEY, which
//    is the browser's). It finds street addresses ("453 W 12th Ave, Vancouver") where OpenStreetMap
//    often only finds the street. It's paid for past Google's free use, so at most GEOCODE_DAILY
//    lookups a day (300 if unset) are sent to it from everyone together (counted in the DriveLimits
//    object, geocodeTurn), after which it's OpenStreetMap only until midnight UTC; and each visitor
//    (an address, an IPv6 one by its /48, or a Build account through the MCP server) at most
//    GEOCODE_PER_VISITOR of them (30 if unset), then OpenStreetMap for it, so one visitor (a script
//    looping over made-up addresses) can't use up everyone's day. Google is asked
//    first only for queries with a number in them (a house number, a postcode, "12th Ave"): those
//    are the addresses OpenStreetMap misses. A place name ("Furka Pass", "CN Tower") goes to
//    OpenStreetMap first and to Google only when OpenStreetMap finds nothing. So the cap is spent
//    where it helps.
//  - OpenStreetMap's Nominatim, under its usage policy
//    (https://operations.osmfoundation.org/policies/nominatim/): the app names itself in the
//    User-Agent, sends at most one request a second from everyone together (the DriveLimits object
//    hands out turns, searchSlot), and the page only searches when Enter is pressed, never as you
//    type. When a query has a house number and none of the answers is a house, it's asked once more
//    (with another turn) with the street's abbreviations written out ("w 12th ave" -> "West 12th
//    Avenue"), as a structured query (street and city) when the query has a town after a comma.
//
// Answers are kept in Cloudflare's cache for a day, so a popular place is looked up once; but an
// OpenStreetMap answer given only because Google couldn't be asked just then (refused, failing, or
// today's lookups used up) is kept for 10 minutes only, so Google is asked again soon. The cache key
// says whether Google is set up, so setting the key up doesn't leave a day of older answers.
//
// Each answer says which provider gave it (provider: 'google' or 'osm'), so the page credits the
// right one: "Search © OpenStreetMap contributors", or "Search powered by Google" (Google's
// attribution for its geocoding results; they're shown on Google's own 3D map).

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const GEOCODING = 'https://maps.googleapis.com/maps/api/geocode/json';
const USER_AGENT = 'WorldDrive/1.0 (+https://worlddrive.app)';
const RESULTS = 6;
const MAX_QUERY = 120;
// Letters and numbers in any script, spaces and the punctuation of addresses: nothing else is
// passed on.
const QUERY = /^[\p{L}\p{M}\p{N} .,'’\-#&/()°]+$/u;
const CACHE_SECONDS = 24 * 60 * 60;
// An answer given while Google couldn't be asked (see above).
const BRIEF_SECONDS = 10 * 60;
// Google's lookups a day from everyone together, unless GEOCODE_DAILY says otherwise.
export const GEOCODE_DAILY = 300;
// Each visitor's share of them, unless GEOCODE_PER_VISITOR says otherwise.
export const GEOCODE_PER_VISITOR = 30;
// Google's result types that are a building or an address on a street, not the street itself.
const GOOGLE_HOUSE = new Set( [ 'street_address', 'premise', 'subpremise' ] );
// Nominatim's types for one.
const OSM_HOUSE = new Set( [ 'house', 'building', 'residential_building' ] );

// What Google answered that's been logged already (once each, per Worker instance).
const logged = new Set();

// GET /api/search?q=...: { results: [ { name, lat, lon, type, house } ], provider, streetOnly }.
// house: the result is a building or a numbered address, not a street or a town; those come first.
// streetOnly: the query has a house number but the best result isn't a house (the page says so).
// SEARCH_UPSTREAM and GEOCODING_UPSTREAM are for the tests only, which stand in for Nominatim and
// Google on this machine.
export async function search( { request, env, url, ctx, limits, now, account } ) {

	const q = cleanQuery( url.searchParams.get( 'q' ) );
	if ( ! q ) throw new HttpError( 400, 'Type a place or an address' );
	const key = geocodingKey( env );

	const cache = caches.default;
	const cacheKey = new Request( `${ url.origin }/api/search?q=${ encodeURIComponent( q ) }&via=${ key ? 'google' : 'osm' }` );
	const cached = await cache.match( cacheKey );
	if ( cached ) return marked( cached, 'hit' );

	const at = Number.isFinite( now ) ? now : Date.now();
	// Google couldn't be asked just now (refused, failing, the day's lookups used up): the answer is
	// kept only briefly.
	let brief = false;
	const askGoogle = async () => {

		const answer = await fromGoogle( { env, key, q, limits, now: at, visitor: visitorOf( request, account ) } );
		if ( answer.failed ) brief = true;
		return answer.results ?? [];

	};

	let results = [];
	let provider = 'osm';
	if ( key && /\d/.test( q ) ) {

		results = await askGoogle();
		if ( results.length ) provider = 'google';

	}

	if ( provider === 'osm' ) {

		results = await fromNominatim( { env, q, limits } );
		if ( ! results.length && key && ! /\d/.test( q ) ) {

			const found = await askGoogle();
			if ( found.length ) {

				results = found;
				provider = 'google';

			}

		}

	}

	results = ranked( results ).slice( 0, RESULTS );
	const streetOnly = hasHouseNumber( q ) && results.length > 0 && ! results[ 0 ].house;
	const seconds = brief && provider === 'osm' ? BRIEF_SECONDS : CACHE_SECONDS;
	const response = json( { results, provider, streetOnly }, 200, { 'Cache-Control': `public, max-age=${ seconds }` } );
	ctx.waitUntil( cache.put( cacheKey, response.clone() ) );
	const out = marked( response, 'miss' );
	out.headers.set( 'X-Search-Provider', provider );
	return out;

}

// The server's Geocoding key, or null: only a plausible one (a Google API key is "AIza" and 35
// more), so an empty or placeholder setting is the same as none. Tests set any non-empty text with
// GEOCODING_UPSTREAM.
function geocodingKey( env ) {

	const key = typeof env.GOOGLE_GEOCODING_KEY === 'string' ? env.GOOGLE_GEOCODING_KEY.trim() : '';
	if ( ! key ) return null;
	if ( env.GEOCODING_UPSTREAM ) return key;
	return /^[A-Za-z0-9_-]{20,}$/.test( key ) ? key : null;

}

// The day's Google lookups for everyone: GEOCODE_DAILY, or 300; each visitor's: GEOCODE_PER_VISITOR,
// or 30.
function dailyLookups( env, name = 'GEOCODE_DAILY', fallback = GEOCODE_DAILY ) {

	const n = Number( env[ name ] );
	return env[ name ] !== undefined && env[ name ] !== '' && Number.isFinite( n ) && n >= 0 ? Math.floor( n ) : fallback;

}

// Who a Google lookup is counted against: the Build account asking through the MCP server, else the
// address asking (an IPv6 one by its /48, so a block of them is one visitor); null without a request
// (not from the Worker).
function visitorOf( request, account ) {

	if ( account?.id !== undefined && account?.id !== null ) return `account:${ account.id }`;
	return request?.headers ? addressOf( request, 48 ) : null;

}

// Google's answer for `q`: { results } (perhaps none: ZERO_RESULTS), or { failed } when it couldn't
// be asked (today's lookups used up, for everyone or this visitor; DriveLimits not answering) or said no (OVER_QUERY_LIMIT,
// REQUEST_DENIED, INVALID_REQUEST, UNKNOWN_ERROR) or didn't answer.
async function fromGoogle( { env, key, q, limits, now, visitor } ) {

	let turn;
	try {

		turn = await limits.geocodeTurn( { now, daily: dailyLookups( env ), visitor, perVisitor: dailyLookups( env, 'GEOCODE_PER_VISITOR', GEOCODE_PER_VISITOR ) } );

	} catch ( err ) {

		logOnce( 'limits', `Geocoding: DriveLimits didn't answer (${ err?.message ?? err }); OpenStreetMap only` );
		return { failed: 'limits' };

	}

	if ( ! turn?.ok ) return { failed: turn?.reason ?? 'daily' };

	const upstream = new URL( env.GEOCODING_UPSTREAM || GEOCODING );
	upstream.search = new URLSearchParams( { address: q, language: 'en', key } );
	let body;
	try {

		const res = await fetch( upstream, { headers: { Accept: 'application/json' } } );
		body = res.ok ? await res.json() : null;
		if ( ! body ) logOnce( `http ${ res.status }`, `Geocoding answered HTTP ${ res.status }; OpenStreetMap instead` );

	} catch ( err ) {

		logOnce( 'network', `Geocoding couldn't be reached (${ err?.message ?? err }); OpenStreetMap instead` );
		return { failed: 'network' };

	}

	if ( ! body ) return { failed: 'http' };
	if ( body.status === 'ZERO_RESULTS' ) return { results: [] };
	if ( body.status !== 'OK' || ! Array.isArray( body.results ) ) {

		const status = typeof body.status === 'string' ? body.status.slice( 0, 40 ) : 'no status';
		// Google's error_message can name the key's project, never the key itself: logged as it is.
		const why = typeof body.error_message === 'string' ? `: ${ body.error_message.slice( 0, 200 ) }` : '';
		logOnce( status, `Geocoding answered ${ status }${ why }; OpenStreetMap instead` );
		return { failed: status };

	}

	return { results: body.results.map( fromGoogleResult ).filter( Boolean ) };

}

function fromGoogleResult( place ) {

	const lat = Number( place?.geometry?.location?.lat );
	const lon = Number( place?.geometry?.location?.lng );
	const name = tidyName( place?.formatted_address );
	const types = Array.isArray( place?.types ) ? place.types.filter( t => typeof t === 'string' ) : [];
	if ( ! name || ! onEarth( lat, lon ) ) return null;
	return { name, lat, lon, type: ( types[ 0 ] ?? '' ).slice( 0, 40 ), house: types.some( t => GOOGLE_HOUSE.has( t ) ) };

}

// Nominatim's answer for `q` (throws a 429 when its queue is full, a 502 when it doesn't answer),
// asked again once with the street written out (retryOf) when the query has a house number and no
// answer is a house.
async function fromNominatim( { env, q, limits } ) {

	await nominatimTurn( limits, true );
	const places = await askNominatim( env, { q } );
	if ( ! Array.isArray( places ) ) throw new HttpError( 502, 'Search isn\'t answering. Try again soon' );
	const results = places.map( fromNominatimPlace ).filter( Boolean );
	if ( ! hasHouseNumber( q ) || results.some( r => r.house ) ) return results;

	const retry = retryOf( q );
	if ( ! retry ) return results;
	// Another turn, unless the queue's full: then the first answer stands.
	if ( ! await nominatimTurn( limits, false ) ) return results;
	const more = await askNominatim( env, retry );
	if ( ! Array.isArray( more ) ) return results;
	const again = more.map( fromNominatimPlace ).filter( Boolean );
	const names = new Set( again.map( r => r.name ) );
	return [ ...again, ...results.filter( r => ! names.has( r.name ) ) ];

}

// Wait for a turn at Nominatim (one request a second from everyone). Busy: a 429 when `required`,
// or false.
async function nominatimTurn( limits, required ) {

	const turn = await limits.searchSlot();
	if ( turn.busy ) {

		if ( ! required ) return false;
		throw new HttpError( 429, 'Search is busy. Try again in a moment', { retryAfter: turn.retryAfter }, { 'Retry-After': String( turn.retryAfter ) } );

	}

	if ( turn.wait > 0 ) await new Promise( resolve => setTimeout( resolve, turn.wait ) );
	return true;

}

// Nominatim's places for `params` (q, or street and city), or null when it doesn't answer.
async function askNominatim( env, params ) {

	const upstream = new URL( env.SEARCH_UPSTREAM || NOMINATIM );
	upstream.search = new URLSearchParams( { ...params, format: 'jsonv2', addressdetails: '1', limit: String( RESULTS ), 'accept-language': 'en' } );
	try {

		const res = await fetch( upstream, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } } );
		return res.ok ? await res.json() : null;

	} catch {

		return null;

	}

}

// The query as it's looked up and cached: control characters out, spaces squeezed, lower case.
// Null when it's empty, too long or has characters an address doesn't.
export function cleanQuery( value ) {

	if ( typeof value !== 'string' ) return null;
	const q = value.normalize( 'NFC' ).replace( /[\u0000-\u001f\u007f]/g, ' ' ).replace( /\s+/g, ' ' ).trim().toLowerCase();
	if ( q.length < 2 || q.length > MAX_QUERY || ! QUERY.test( q ) ) return null;
	return q;

}

// Words a number follows in a place's own name, not a street's house number: "pier 39", "route 66",
// "highway 1", "studio 54", "area 51", "terminal 5".
const NAMED_NUMBERS = new Set( [
	'pier', 'route', 'highway', 'hwy', 'interstate', 'motorway', 'autobahn', 'exit', 'junction', 'studio', 'area', 'terminal',
	'gate', 'platform', 'track', 'dock', 'berth', 'wharf', 'hangar', 'building', 'block', 'level', 'floor', 'unit', 'suite',
	'lot', 'zone', 'sector', 'district', 'arrondissement', 'ward', 'station', 'stage', 'camp', 'base', 'site', 'mile',
	'apollo', 'phase', 'county', 'township', 'lock', 'bay', 'hall', 'lake', 'fort',
] );

// Whether a (cleaned) query looks like a street address with a house number: a number starting one
// of its comma-separated parts and followed by at least two words ("453 w 12th ave", "10 downing
// street", "221b baker street"; not "10115 berlin", a postcode and a town), or a street name ending
// in one before a comma ("hauptstraße 5, berlin"; not a name like "pier 39, san francisco").
export function hasHouseNumber( q ) {

	return q.split( ',' ).some( part => {

		const words = part.trim().split( ' ' ).filter( Boolean );
		if ( /^\d+[a-z]?([-/]\d+[a-z]?)?$/.test( words[ 0 ] ?? '' ) && words.length >= 3 ) return true;
		return false;

	} ) || [ ...q.matchAll( /(\p{L}{3,})\.? \d+[a-z]? ?,/gu ) ].some( match => ! NAMED_NUMBERS.has( match[ 1 ] ) );

}

const DIRECTIONS = { n: 'north', s: 'south', e: 'east', w: 'west', ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest' };
const SUFFIXES = {
	st: 'street', ave: 'avenue', av: 'avenue', rd: 'road', blvd: 'boulevard', dr: 'drive', hwy: 'highway', cres: 'crescent',
	pl: 'place', ct: 'court', ln: 'lane', pkwy: 'parkway', sq: 'square', terr: 'terrace', ter: 'terrace',
};

// "St" is Saint unless it ends the street ("rue st denis", but "9 oak st" and "100 e st nw").
const SAINT = new Set( [ 'st' ] );

// A street's abbreviations written out: a direction just after the house number or at the end
// ("453 w 12th ave nw" -> "453 west 12th avenue northwest") and a street type after the first word
// of its name ("st clair ave" -> "st clair avenue": a first "St" is Saint; so is one that doesn't end
// the street, "rue st denis"). A letter that is the street's name is left as it is: one followed by
// just a street type ("100 e st nw", Washington's E Street) or following just one ("avenue e").
export function expandStreet( street ) {

	const words = street.trim().split( ' ' ).filter( Boolean );
	const bare = words.map( word => word.replace( /\.$/, '' ) );
	const start = /^\d/.test( words[ 0 ] ?? '' ) ? 1 : 0;
	const isDirection = i => Object.hasOwn( DIRECTIONS, bare[ i ] );
	const isType = i => Object.hasOwn( SUFFIXES, bare[ i ] );
	// The street's last word that isn't a direction after it ("100 e st nw": st).
	let end = words.length - 1;
	while ( end > start && isDirection( end ) ) end --;
	return words.map( ( word, i ) => {

		if ( i >= start && isDirection( i ) && words.length - start > 1 ) {

			// Just after the number: a direction only if a word of the name (not a type) follows.
			if ( i === start && i + 1 < words.length && ! isType( i + 1 ) && ! isDirection( i + 1 ) ) return DIRECTIONS[ bare[ i ] ];
			// At the end: a direction only if the name before it is more than a street type.
			if ( i === words.length - 1 && ! ( i - start === 1 && ( isType( start ) || Object.values( SUFFIXES ).includes( bare[ start ] ) ) ) ) return DIRECTIONS[ bare[ i ] ];

		}

		if ( i > start && isType( i ) && ( ! SAINT.has( bare[ i ] ) || i === end ) ) return SUFFIXES[ bare[ i ] ];
		return word;

	} ).join( ' ' );

}

// The second question for Nominatim when the first found no house: a structured one (street and
// city) when the query is just "<number> <street>, <town>", else the whole query with its street
// written out, so a state, province or country after the town still says which town it is
// ("123 main st, springfield, illinois"); null when that's no different from what was asked.
export function retryOf( q ) {

	const parts = q.split( ',' ).map( part => part.trim() ).filter( Boolean );
	const street = expandStreet( parts[ 0 ] );
	if ( parts.length === 2 && /^\d/.test( parts[ 0 ] ) ) return { street, city: parts[ 1 ] };
	const whole = [ street, ...parts.slice( 1 ) ].join( ', ' );
	return whole !== q ? { q: whole } : null;

}

// Only what the pages need from a Nominatim place. Its type is OpenStreetMap's ('bridge',
// 'motorway', 'city'...): a bridge starts on its deck (src/drive-app/spawn.js).
function fromNominatimPlace( place ) {

	const lat = Number( place?.lat );
	const lon = Number( place?.lon );
	const name = tidyName( place?.display_name );
	if ( ! name || ! onEarth( lat, lon ) ) return null;
	const type = typeof place.type === 'string' ? place.type : typeof place.addresstype === 'string' ? place.addresstype : '';
	const house = typeof place.address?.house_number === 'string' && place.address.house_number !== '' || OSM_HOUSE.has( place.addresstype ) || OSM_HOUSE.has( type );
	return { name, lat, lon, type: type.slice( 0, 40 ), house };

}

// Houses first, otherwise in the provider's order.
function ranked( results ) {

	return [ ...results.filter( r => r.house ), ...results.filter( r => ! r.house ) ];

}

function tidyName( name ) {

	return typeof name === 'string' ? name.replace( /[\u0000-\u001f\u007f]/g, '' ).trim().slice( 0, 200 ) : '';

}

function onEarth( lat, lon ) {

	return Number.isFinite( lat ) && Number.isFinite( lon ) && Math.abs( lat ) <= 90 && Math.abs( lon ) <= 180;

}

function logOnce( what, message ) {

	if ( logged.has( what ) ) return;
	logged.add( what );
	console.warn( message );

}

// Say whether the answer came from the cache (the tests look).
function marked( response, cache ) {

	const copy = new Response( response.body, response );
	copy.headers.set( 'X-Search-Cache', cache );
	return copy;

}
