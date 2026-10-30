// Talking to World Drive's Worker (worker/drive/): the settings, the visit that hands out the Maps
// key after a Turnstile check, and the place search.

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
// widget shows in `container`) and trade it for the Maps key. Answers { key, left }, or
// { usedUp: true, retryAfter } over a daily cap, { robot: true } when the check failed, or
// { error } for anything else.
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

	if ( res.ok && typeof body.mapsKey === 'string' && body.mapsKey ) return { key: body.mapsKey, left: body.left };
	if ( res.status === 429 ) return { usedUp: true, retryAfter: Number( body.retryAfter ) || 0, reason: body.reason };
	if ( res.status === 403 ) return { robot: true };
	return { error: body.error ?? `World Drive answered ${ res.status }.` };

}

function turnstileToken( siteKey, container ) {

	return loadTurnstile().then( turnstile => new Promise( ( resolve, reject ) => {

		const timer = setTimeout( () => reject( new Error( 'The robot check took too long' ) ), TURNSTILE_TIMEOUT );
		container.replaceChildren();
		turnstile.render( container, {
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

let turnstileLoading = null;
function loadTurnstile() {

	turnstileLoading ??= new Promise( ( resolve, reject ) => {

		if ( window.turnstile ) return resolve( window.turnstile );
		const script = document.createElement( 'script' );
		script.src = TURNSTILE_SCRIPT;
		script.async = true;
		script.onload = () => window.turnstile ? resolve( window.turnstile ) : reject( new Error( 'Turnstile didn\'t load' ) );
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
