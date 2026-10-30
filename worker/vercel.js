import worker from './index.js';
import { json } from './http.js';
import { neonDriver, postgresDatabase } from './postgres.js';

// The Worker as a Vercel Function (api/index.js, docs/deploy-vercel.md): the same code, with its
// settings from environment variables and Postgres (Neon) in place of D1.
//
// vercel.json rewrites every /api/* request to the one function as /api?__path=<the rest>, keeping
// the other query parameters. The address is put back together here, on the public host, before
// the Worker sees the request, so its routes, the cross-site check and the cookie all see what the
// browser asked for.
//
// Without DATABASE_URL (or POSTGRES_URL, which Vercel's Neon integration sets too) there's no
// database, and the Worker answers as a site without accounts (see index.js).

// Everything the Worker reads; nothing else from the environment is passed on.
const SETTINGS = [
	'GOOGLE_CLIENT_ID',
	'GOOGLE_MAPS_API_KEY',
	'ALLOWED_EMAILS',
	'ALLOWED_DOMAINS',
	'GOOGLE_JWKS_URL',
	'STRIPE_PAYMENT_LINK',
	'STRIPE_PAYMENT_LINK_ID',
	'STRIPE_WEBHOOK_SECRET',
	'PREMIUM_PRICE',
	'PREMIUM_EMAILS',
];
const PATH_PARAM = '__path';

// The static site is Vercel's to serve; only /api/* is sent here.
const ASSETS = { fetch: () => json( { error: 'Not found' }, 404 ) };

// options, for tests: getEnv() instead of process.env, connect( url ) instead of Neon.
export function vercelApi( { getEnv = () => process.env, connect = neonDriver } = {} ) {

	// Per instance, so warm requests reuse it (and the schema check is done once).
	let database = null;

	function databaseFor( url ) {

		if ( ! url ) return undefined;
		if ( database?.url !== url ) database = { url, db: postgresDatabase( connect( url ) ) };
		return database.db;

	}

	return {

		fetch( request ) {

			const vars = getEnv();
			const env = { ASSETS, DB: databaseFor( vars.DATABASE_URL || vars.POSTGRES_URL ) };
			for ( const name of SETTINGS ) env[ name ] = vars[ name ] ?? '';
			return worker.fetch( publicRequest( request ), env );

		},

	};

}

// The request as the browser sent it: /api?__path=layouts/x&site=y becomes /api/layouts/x?site=y.
// Vercel says which host and protocol the visitor used in X-Forwarded-Host and X-Forwarded-Proto;
// without them (or if the rewrite left the path alone) the address is taken as it is.
export function publicUrl( request ) {

	const url = new URL( request.url );
	const host = request.headers.get( 'X-Forwarded-Host' )?.split( ',' )[ 0 ].trim();
	const proto = request.headers.get( 'X-Forwarded-Proto' )?.split( ',' )[ 0 ].trim();
	if ( host ) url.host = host;
	if ( proto === 'http' || proto === 'https' ) url.protocol = proto;
	const path = url.searchParams.get( PATH_PARAM );
	if ( path !== null ) {

		url.searchParams.delete( PATH_PARAM );
		url.pathname = `/api/${ path.replace( /^\/+/, '' ) }`;

	} else if ( url.pathname === '/api' ) {

		url.pathname = '/api/';

	}

	return url;

}

function publicRequest( request ) {

	const hasBody = request.body !== null && request.method !== 'GET' && request.method !== 'HEAD';
	return new Request( publicUrl( request ), {
		method: request.method,
		headers: request.headers,
		body: hasBody ? request.body : null,
		// A body that is a stream (it is here) has to say so to be passed on.
		duplex: 'half',
		signal: request.signal,
	} );

}
