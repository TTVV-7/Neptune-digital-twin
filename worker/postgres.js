import { neon } from '@neondatabase/serverless';
import { MIGRATIONS } from './postgres-schema.js';

// The part of Cloudflare D1's API the Worker uses, on Postgres, so the same code runs as a Vercel
// Function (vercel.js) with a Neon database:
//   env.DB.prepare( sql ).bind( ...values ).first() -> the first row or null
//                                          .all()   -> { results: rows }
//                                          .run()   -> { meta: { changes } }
//   env.DB.batch( [ statements ] ) -> their results, run in one transaction
// The Worker's SQL is written once for both. Placeholders are SQLite's ? and ?NNN, which become
// Postgres's $1, $2...; 64-bit integers and numerics (ids, times in milliseconds, counts, sums)
// come back as numbers, as D1 gives them. The tables are made on first use (postgres-schema.js).
//
// Underneath is a driver: query( text, values ) -> { rows, fields: [ { name, dataTypeID } ],
// rowCount }, and transaction( [ { text, values } ] ) -> their results, all or nothing.
// neonDriver is the real one; the tests use the same interface on PGlite.

// Postgres sends int8 and numeric as text, since they can hold more than a JavaScript number can
// exactly. Ours never come near 2^53.
const NUMBER_TYPES = new Set( [ 20, 1700 ] );
// Names this app's schema changes for pg_advisory_xact_lock, so two instances starting together
// take turns rather than tripping over each other's CREATE TABLE.
const SCHEMA_LOCK = 74613;
const UNDEFINED_TABLE = '42P01';

// Neon's HTTP driver: one fetch per query or transaction, nothing to keep open between requests.
export function neonDriver( url ) {

	const sql = neon( url, { fullResults: true } );
	return {
		query: ( text, values ) => sql.query( text, values ),
		transaction: queries => sql.transaction( queries.map( ( { text, values } ) => sql.query( text, values ) ) ),
	};

}

export function postgresDatabase( driver, migrations = MIGRATIONS ) {

	let schema = null;
	// A failure isn't kept, so the next request tries again.
	const ready = () => schema ??= applySchema( driver, migrations ).catch( err => {

		schema = null;
		throw err;

	} );

	async function execute( query ) {

		await ready();
		return driver.query( query.text, query.values );

	}

	function statement( text, values ) {

		const query = { text, values };
		return {
			query,
			bind: ( ...bound ) => statement( text, checked( bound ) ),
			async first( column ) {

				const row = rowsOf( await execute( query ) )[ 0 ] ?? null;
				return column === undefined || row === null ? row : row[ column ] ?? null;

			},
			all: async () => d1Result( await execute( query ) ),
			run: async () => d1Result( await execute( query ) ),
		};

	}

	return {
		prepare: sql => statement( toPostgres( sql ), [] ),
		async batch( statements ) {

			await ready();
			return ( await driver.transaction( statements.map( s => s.query ) ) ).map( d1Result );

		},
	};

}

// ? and ?NNN to $1, $2..., numbered as SQLite numbers them: ?NNN is parameter NNN and a bare ? is
// one more than the largest so far. Quoted text and comments are left as they are.
export function toPostgres( sql ) {

	let out = '';
	let largest = 0;
	for ( let i = 0; i < sql.length; i ++ ) {

		const c = sql[ i ];
		if ( c === '\'' || c === '"' ) {

			const end = sql.indexOf( c, i + 1 );
			const stop = end === - 1 ? sql.length : end + 1;
			out += sql.slice( i, stop );
			i = stop - 1;

		} else if ( c === '-' && sql[ i + 1 ] === '-' ) {

			const end = sql.indexOf( '\n', i );
			const stop = end === - 1 ? sql.length : end;
			out += sql.slice( i, stop );
			i = stop - 1;

		} else if ( c === '?' ) {

			const digits = /^[0-9]*/.exec( sql.slice( i + 1 ) )[ 0 ];
			const n = digits ? Number( digits ) : largest + 1;
			largest = Math.max( largest, n );
			out += `$${ n }`;
			i += digits.length;

		} else {

			out += c;

		}

	}

	return out;

}

// D1 refuses undefined (it would be a bug: a field that was never set), so this does too.
function checked( values ) {

	if ( values.some( value => value === undefined ) ) throw new TypeError( 'Bound value is undefined' );
	return values;

}

function d1Result( result ) {

	return { success: true, results: rowsOf( result ), meta: { changes: result.rowCount ?? 0 } };

}

function rowsOf( { rows, fields } ) {

	const numbers = ( fields ?? [] ).filter( field => NUMBER_TYPES.has( field.dataTypeID ) ).map( field => field.name );
	for ( const row of numbers.length ? rows : [] ) {

		for ( const name of numbers ) if ( row[ name ] !== null && row[ name ] !== undefined ) row[ name ] = Number( row[ name ] );

	}

	return rows;

}

// The migrations this database hasn't had yet, all in one transaction. Nobody has to run anything
// by hand: the first request after a deploy that adds one brings the database up to date.
async function applySchema( driver, migrations ) {

	let current = 0;
	try {

		const { rows } = await driver.query( 'SELECT MAX( version ) AS version FROM schema_version', [] );
		current = Number( rows[ 0 ]?.version ?? 0 );

	} catch ( err ) {

		// A new, empty database.
		if ( err?.code !== UNDEFINED_TABLE ) throw err;

	}

	const pending = migrations.filter( migration => migration.version > current );
	if ( pending.length === 0 ) return;
	const queries = [
		{ text: `SELECT pg_advisory_xact_lock( ${ SCHEMA_LOCK } )`, values: [] },
		{ text: 'CREATE TABLE IF NOT EXISTS schema_version ( version INTEGER PRIMARY KEY, applied_at BIGINT NOT NULL )', values: [] },
	];
	for ( const { version, sql } of pending ) {

		for ( const text of statements( sql ) ) queries.push( { text, values: [] } );
		queries.push( { text: 'INSERT INTO schema_version ( version, applied_at ) VALUES ( $1, $2 ) ON CONFLICT ( version ) DO NOTHING', values: [ version, Date.now() ] } );

	}

	await driver.transaction( queries );

}

// One statement per query: Postgres won't take several in one with parameters, and neither will
// Neon's HTTP API.
function statements( sql ) {

	return sql.replace( /--[^\n]*/g, '' ).split( ';' ).map( s => s.trim() ).filter( Boolean );

}
