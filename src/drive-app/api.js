// Talking to World Drive's Worker (worker/drive/): the settings, the visit that hands out the Maps
// key after a Turnstile check, the place search and the leaderboard.

const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TURNSTILE_TIMEOUT = 45000;

// { turnstileSiteKey, mapsOn }, or null where there's no Worker (the Vite dev server on its own).
export async function getConfig() {

	try {

		const res = await fetch( '/api/config', { headers: { Accept: 'application/json' } } );
		if ( ! res.ok || ! /json/.test( res.headers.get( 'Content-Type' ) ?? '' ) ) return null;
		return await res.json();

	} catch {

		return null;

	}

}

// Once per page load: get a Turnstile token (invisible unless Turnstile wants a click, then its
// widget shows in `container`) and trade it for the Maps key. Answers { key, left, visit } (visit:
// the token scores are posted with, see postScore), or { usedUp: true, retryAfter } over a daily
// cap, { robot: true } when the check failed, or { error } for anything else.
export async function startVisit( siteKey, container ) {

	let token;
	try {

		token = await turnstileToken( siteKey, container );

	} catch ( err ) {

		return { robot: true, error: err.message };

	}

	let res;
	let body = {};
	try {

		res = await fetch( '/api/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { token } ) } );
		body = await res.json().catch( () => ( {} ) );

	} catch {

		return { error: 'Couldn\'t reach World Drive. Check your connection.' };

	}

	if ( res.ok && typeof body.mapsKey === 'string' && body.mapsKey ) return { key: body.mapsKey, left: body.left, visit: typeof body.visit === 'string' ? body.visit : null };
	if ( res.status === 429 ) return { usedUp: true, retryAfter: Number( body.retryAfter ) || 0, reason: body.reason };
	if ( res.status === 403 ) return { robot: true };
	return { error: body.error ?? `World Drive answered ${ res.status }.` };

}

let widget = null;
function turnstileToken( siteKey, container ) {

	return loadTurnstile().then( turnstile => new Promise( ( resolve, reject ) => {

		const timer = setTimeout( () => reject( new Error( 'The robot check took too long' ) ), TURNSTILE_TIMEOUT );
		// Trying again: the last widget goes first.
		if ( widget !== null ) {

			try {

				turnstile.remove( widget );

			} catch {

				// Already gone.

			}

		}

		container.replaceChildren();
		widget = turnstile.render( container, {
			sitekey: siteKey,
			action: 'visit',
			// Out of sight unless Turnstile needs a click.
			appearance: 'interaction-only',
			callback: token => {

				clearTimeout( timer );
				resolve( token );

			},
			'error-callback': () => {

				clearTimeout( timer );
				reject( new Error( 'The robot check didn\'t work' ) );

			},
		} );

	} ) );

}

// Turnstile's script makes window.turnstile. (Checked for render: an element with the id
// "turnstile" would show up as window.turnstile too.)
const loaded = () => typeof window.turnstile?.render === 'function';

let turnstileLoading = null;
function loadTurnstile() {

	turnstileLoading ??= new Promise( ( resolve, reject ) => {

		if ( loaded() ) return resolve( window.turnstile );
		const script = document.createElement( 'script' );
		script.src = TURNSTILE_SCRIPT;
		script.async = true;
		script.onload = () => loaded() ? resolve( window.turnstile ) : reject( new Error( 'Turnstile didn\'t load' ) );
		script.onerror = () => {

			turnstileLoading = null;
			reject( new Error( 'Turnstile didn\'t load' ) );

		};
		document.head.append( script );

	} );
	return turnstileLoading;

}

// [ { name, lat, lon, type } ] for a place or address. Throws with a message to show.
export async function searchPlaces( query ) {

	let res;
	try {

		res = await fetch( `/api/search?q=${ encodeURIComponent( query ) }`, { headers: { Accept: 'application/json' } } );

	} catch {

		throw new Error( 'Couldn\'t reach the search. Check your connection.' );

	}

	const body = /json/.test( res.headers.get( 'Content-Type' ) ?? '' ) ? await res.json().catch( () => null ) : null;
	if ( ! body ) throw new Error( 'Search isn\'t available here. Type a latitude and longitude, like 46.57, 8.42.' );
	if ( res.status === 429 ) throw new Error( 'Lots of people are searching. Try again in a moment.' );
	if ( res.status === 400 ) throw new Error( 'Type a place or an address: letters, numbers and simple punctuation.' );
	if ( ! res.ok || ! Array.isArray( body.results ) ) throw new Error( 'Search isn\'t answering. Try again soon.' );
	return body.results;

}

// --- the leaderboard (worker/drive/players.js, scores.js) ---
// None of these throw: each answers { ok, status, body, retryAfter }, status 0 when the Worker
// couldn't be reached, so a bad connection never gets in the way of driving.

// A new player, made with this visit's token (one visit, one player): body { id, secret, name }.
export function createPlayer( name, visit ) {

	return send( 'POST', '/api/player', { name, visit } );

}

// body { id, name }.
export function renamePlayer( { id, secret }, name ) {

	return send( 'POST', '/api/player/rename', { id, secret, name } );

}

// A run's score: { id, secret, visit, score, tricks, place, vehicle, airTime, runSeconds }. body
// { best, rank, isNewBest } for all time, and the same as `today` and `week`.
export function postScore( run ) {

	return send( 'POST', '/api/score', run );

}

// A board: period 'today', 'week' or 'all', place (or null for anywhere), id (or null) for the
// player's own row. body { total, rows: [ { rank, name, score, tricks, place, vehicle, date } ], me }.
export function getBoard( { period, place = null, id = null } ) {

	const query = new URLSearchParams( { period } );
	if ( place ) query.set( 'place', place );
	if ( id ) query.set( 'id', id );
	return send( 'GET', `/api/leaderboard?${ query }` );

}

async function send( method, path, body ) {

	try {

		const res = await fetch( path, {
			method,
			headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
			body: body ? JSON.stringify( body ) : undefined,
		} );
		const json = /json/.test( res.headers.get( 'Content-Type' ) ?? '' ) ? await res.json().catch( () => null ) : null;
		// Not the Worker answering (the Vite dev server on its own): as good as no connection.
		if ( ! json ) return { ok: false, status: 0, body: {}, retryAfter: 0 };
		return { ok: res.ok, status: res.status, body: json, retryAfter: Number( res.headers.get( 'Retry-After' ) ) || 0 };

	} catch {

		return { ok: false, status: 0, body: {}, retryAfter: 0 };

	}

}
