import { HttpError, isObject, readBytes } from './http.js';

// Stripe's webhooks, for both apps: the construction app's Pro equipment pack (premium.js) and World
// Drive's Supporter Pass (drive/supporter.js). A webhook comes from Stripe's servers, not a page, so
// it has no session and no Origin: it proves where it came from with its Stripe-Signature header,
// made with the endpoint's signing secret (whsec_...), which is checked here with Web Crypto.

// Stripe signs "<timestamp>.<body>"; an event signed longer ago than this (seconds) is refused,
// so a copy of an old one can't be sent again.
const TOLERANCE = 300;
// Stripe's events are a few kB; Checkout Sessions arrive without their line items.
export const MAX_EVENT = 256 * 1024;
const MAX_SIGNATURE_HEADER = 4096;
const MAX_STRIPE_ID = 255;
// A Payment Link's id, as its page in Stripe's Dashboard shows it.
export const LINK_ID_PATTERN = /^plink_[A-Za-z0-9]{1,200}$/;

const badRequest = () => new HttpError( 400, 'Bad request' );

// The event a webhook request carries, once its signature checks out with `secret`: the body is
// read (at most MAX_EVENT bytes, else 413) exactly as it was sent, since the signature covers those
// bytes, and only then parsed. A 400 for a signature that doesn't match, or a body that isn't a
// JSON object.
export async function readEvent( request, secret ) {

	const body = await readBytes( request, MAX_EVENT );
	if ( ! await verifySignature( request.headers.get( 'Stripe-Signature' ), body, secret ) ) throw badRequest();

	let event;
	try {

		event = JSON.parse( new TextDecoder().decode( body ) );

	} catch {

		throw badRequest();

	}

	if ( ! isObject( event ) ) throw badRequest();
	return event;

}

// Stripe-Signature: t=<seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">[,v1=...]. There can be more
// than one v1 while a secret is being rolled; any of them may match.
export async function verifySignature( header, body, secret ) {

	if ( typeof header !== 'string' || header.length > MAX_SIGNATURE_HEADER ) return false;
	let time = null;
	const signatures = [];
	for ( const part of header.split( ',' ) ) {

		const at = part.indexOf( '=' );
		const key = part.slice( 0, at ).trim();
		const value = part.slice( at + 1 ).trim();
		if ( key === 't' && time === null ) time = value;
		else if ( key === 'v1' && /^[0-9a-f]{64}$/.test( value ) ) signatures.push( value );

	}

	if ( ! /^[0-9]{1,12}$/.test( time ?? '' ) || signatures.length === 0 ) return false;
	if ( Math.abs( Date.now() / 1000 - Number( time ) ) > TOLERANCE ) return false;

	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey( 'raw', encoder.encode( secret ), { name: 'HMAC', hash: 'SHA-256' }, false, [ 'sign' ] );
	const prefix = encoder.encode( `${ time }.` );
	const signed = new Uint8Array( prefix.byteLength + body.byteLength );
	signed.set( prefix );
	signed.set( body, prefix.byteLength );
	const expected = [ ...new Uint8Array( await crypto.subtle.sign( 'HMAC', key, signed ) ) ].map( b => b.toString( 16 ).padStart( 2, '0' ) ).join( '' );
	// Every one is compared, all the way through, so the time taken says nothing about how close
	// a made-up signature came.
	let match = false;
	for ( const signature of signatures ) match = sameText( signature, expected ) || match;
	return match;

}

function sameText( a, b ) {

	if ( a.length !== b.length ) return false;
	let difference = 0;
	for ( let i = 0; i < a.length; i ++ ) difference |= a.charCodeAt( i ) ^ b.charCodeAt( i );
	return difference === 0;

}

// A Stripe id (cs_..., pi_...), given as the id itself or as the object it names, or null.
export function stripeId( value ) {

	const id = isObject( value ) ? value.id : value;
	return typeof id === 'string' && id.length > 0 && id.length <= MAX_STRIPE_ID ? id : null;

}

// The email a buyer paid with, in lower case, or '' for anything that isn't one.
export function cleanEmail( value ) {

	if ( typeof value !== 'string' ) return '';
	const email = value.trim().toLowerCase();
	return email.includes( '@' ) && email.length <= 320 ? email : '';

}
