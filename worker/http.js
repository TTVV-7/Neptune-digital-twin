// Small helpers for JSON requests and responses.

// Bodies are capped at 1 MB; a layout with a few hundred items is well under 100 kB.
export const MAX_BODY = 1024 * 1024;

const SAFE_METHODS = new Set( [ 'GET', 'HEAD', 'OPTIONS' ] );

// Thrown by handlers for anything that isn't a 2xx; index.js turns it into a JSON response.
// Messages are short and generic, so they never echo back what was sent.
export class HttpError extends Error {

	constructor( status, message, extra = {}, headers = {} ) {

		super( message );
		this.status = status;
		this.extra = extra;
		this.headers = headers;

	}

}

export function json( body, status = 200, headers = {} ) {

	return jsonText( JSON.stringify( body ), status, headers );

}

// A response whose body is already JSON text.
export function jsonText( text, status = 200, headers = {} ) {

	return new Response( text, {
		status,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			// Answers depend on who is signed in, so nothing may be cached on the way.
			'Cache-Control': 'no-store',
			'X-Content-Type-Options': 'nosniff',
			...headers,
		},
	} );

}

export function noContent( headers = {} ) {

	return new Response( null, { status: 204, headers: { 'Cache-Control': 'no-store', ...headers } } );

}

export function errorResponse( err ) {

	return json( { error: err.message, ...err.extra }, err.status, err.headers );

}

// Cross-site request forgery: a form or script on another site can make the browser send our
// cookie, but it can't send JSON without a CORS preflight (which we never answer), and the
// browser always says where the request came from in Origin. So every request that changes
// something must be JSON and come from this site's own pages.
export function checkSameOrigin( request, url ) {

	if ( SAFE_METHODS.has( request.method ) ) return;
	if ( request.headers.get( 'Origin' ) !== url.origin ) throw new HttpError( 403, 'Forbidden' );
	const type = ( request.headers.get( 'Content-Type' ) ?? '' ).split( ';' )[ 0 ].trim().toLowerCase();
	if ( type !== 'application/json' ) throw new HttpError( 415, 'Send JSON' );

}

// The body as JSON, refusing anything over the limit before reading all of it.
export async function readJson( request, limit = MAX_BODY ) {

	const bytes = await readBytes( request, limit );
	try {

		return JSON.parse( new TextDecoder().decode( bytes ) );

	} catch {

		throw new HttpError( 400, 'Bad request' );

	}

}

// The body exactly as it was sent (a signature covers these bytes), refusing anything over the
// limit before reading all of it.
export async function readBytes( request, limit = MAX_BODY ) {

	if ( Number( request.headers.get( 'Content-Length' ) ) > limit ) throw new HttpError( 413, 'Too large' );
	if ( ! request.body ) throw new HttpError( 400, 'Bad request' );

	const reader = request.body.getReader();
	const chunks = [];
	let size = 0;
	for ( ;; ) {

		const { done, value } = await reader.read();
		if ( done ) break;
		size += value.byteLength;
		if ( size > limit ) {

			await reader.cancel();
			throw new HttpError( 413, 'Too large' );

		}

		chunks.push( value );

	}

	const bytes = new Uint8Array( size );
	let offset = 0;
	for ( const chunk of chunks ) {

		bytes.set( chunk, offset );
		offset += chunk.byteLength;

	}

	return bytes;

}

// A plain object (not an array or null), as every request body must be.
export function isObject( value ) {

	return value !== null && typeof value === 'object' && ! Array.isArray( value );

}

// A trimmed string of 1 to max characters with control characters removed, or null.
export function cleanText( value, max ) {

	if ( typeof value !== 'string' ) return null;
	const text = value.replace( /[\u0000-\u001f\u007f]/g, '' ).trim();
	return text.length > 0 && text.length <= max ? text : null;

}

// A comma-separated setting (ALLOWED_EMAILS, PREMIUM_EMAILS...) as trimmed, lower-case entries.
export function list( value ) {

	return ( value ?? '' ).split( ',' ).map( s => s.trim().toLowerCase() ).filter( Boolean );

}

export function randomToken( bytes ) {

	return base64url( crypto.getRandomValues( new Uint8Array( bytes ) ) );

}

export function base64url( bytes ) {

	let binary = '';
	for ( const byte of bytes ) binary += String.fromCharCode( byte );
	return btoa( binary ).replace( /\+/g, '-' ).replace( /\//g, '_' ).replace( /=+$/, '' );

}

export function fromBase64url( text ) {

	const binary = atob( text.replace( /-/g, '+' ).replace( /_/g, '/' ) );
	return Uint8Array.from( binary, c => c.charCodeAt( 0 ) );

}

export async function sha256Hex( text ) {

	const digest = await crypto.subtle.digest( 'SHA-256', new TextEncoder().encode( text ) );
	return [ ...new Uint8Array( digest ) ].map( b => b.toString( 16 ).padStart( 2, '0' ) ).join( '' );

}
