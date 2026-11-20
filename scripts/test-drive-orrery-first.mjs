// node --test scripts/test-drive-orrery-first.mjs: which loads open World Drive on the orrery
// (src/drive-app/orrery-first.js, docs/world-drive.md, "Opening it"), and the address every way to
// the Earth from such a page reloads at. Plain functions, so no browser: the page's own behaviour is
// test-drive-orrery-ui.mjs's (a plain load opening on it) and test-drive-seo.mjs's (the built site).

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { EARTH_USED_UP, LAST_WORLD, earthTarget, earthUrl, orreryFirstFor, readStored, usedUpToday, utcDay, writeStored } from '../src/drive-app/orrery-first.js';
import { SPOTS } from '../src/drive-app/places.js';

const BASE = 'https://worlddrive.app';

describe( 'orreryFirstFor: which loads open on the orrery', () => {

	test( 'a plain load does, whatever else is in the address', () => {

		assert.equal( orreryFirstFor( '' ), true );
		assert.equal( orreryFirstFor( '?pro=1' ), true );
		assert.equal( orreryFirstFor( '?feats=1&utm_source=x' ), true );

	} );

	test( 'a link to a place, a challenge, a party, or the way back from paying, does not', () => {

		for ( const search of [ '?spot=moon-tycho', '?spot=neptune', '?at=10,20', '?at=1,2&world=mars', '?challenge=12', '?challenge=12&vs=abc', '?vs=abc', '?party=ABCD', '?supporter=thanks', '?supporter=' ] ) {

			assert.equal( orreryFirstFor( search ), false, search );

		}

	} );

	test( 'nor a challenge link\'s own path', () => {

		assert.equal( orreryFirstFor( '', { path: '/c' } ), false );
		assert.equal( orreryFirstFor( '', { path: '/c/' } ), false );
		assert.equal( orreryFirstFor( '', { path: '/c/12' } ), false );
		assert.equal( orreryFirstFor( '', { path: '/cars' } ), true );

	} );

	test( '?worlds=0 is the Earth as before; ?worlds=1 opens it over an Earth visit (main.js), not this way', () => {

		assert.equal( orreryFirstFor( '?worlds=0' ), false );
		assert.equal( orreryFirstFor( '?worlds=1' ), false );
		assert.equal( orreryFirstFor( '?worlds=2' ), true );

	} );

	test( 'a test\'s browser on the dev server gets the plain Earth load unless its seam asks', () => {

		assert.equal( orreryFirstFor( '', { dev: true, webdriver: true } ), false );
		assert.equal( orreryFirstFor( '', { dev: true, webdriver: true, seam: { onLoad: true } } ), false );
		assert.equal( orreryFirstFor( '', { dev: true, webdriver: true, seam: { first: true } } ), true );
		assert.equal( orreryFirstFor( '?spot=neptune', { dev: true, webdriver: true, seam: { first: true } } ), false );
		// A person on the dev server, and any browser on a built page (where webdriver isn't read).
		assert.equal( orreryFirstFor( '', { dev: true, webdriver: false } ), true );
		assert.equal( orreryFirstFor( '', { dev: false, webdriver: true } ), true );

	} );

} );

describe( 'earthUrl: the Earth from a page that opened on the orrery or another world', () => {

	test( 'nothing in particular: ?worlds=0 at /', () => {

		assert.equal( earthUrl( {}, `${ BASE }/` ), '/?worlds=0' );
		assert.equal( earthUrl( {}, `${ BASE }/?worlds=1` ), '/?worlds=0' );

	} );

	test( 'a link to another world loses its link; a party and anything else stays', () => {

		assert.equal( earthUrl( {}, `${ BASE }/?spot=mars-curiosity` ), '/?worlds=0' );
		assert.equal( earthUrl( {}, `${ BASE }/?at=1,2&world=vesta&name=X&region=Y&heading=4` ), '/?worlds=0' );
		assert.equal( earthUrl( {}, `${ BASE }/c?challenge=9&vs=abc` ), '/?worlds=0' );
		// (A party keeps the orrery shut by itself, so no worlds=0.)
		assert.equal( earthUrl( {}, `${ BASE }/?spot=moon-tycho&party=ABCD` ), '/?party=ABCD' );
		assert.equal( earthUrl( {}, `${ BASE }/?pro=1` ), '/?pro=1&worlds=0' );

	} );

	test( 'an Earth spot or place picked: its link, which needs no worlds=0', () => {

		assert.equal( earthUrl( { spot: 'golden-gate' }, `${ BASE }/` ), '/?spot=golden-gate' );
		const url = new URL( earthUrl( { at: { lat: 48.858370123, lon: 2.294481, name: 'Eiffel Tower', region: 'Paris', heading: 12.4 } }, `${ BASE }/` ), BASE );
		assert.equal( url.searchParams.get( 'at' ), '48.85837,2.294481' );
		assert.equal( url.searchParams.get( 'name' ), 'Eiffel Tower' );
		assert.equal( url.searchParams.get( 'region' ), 'Paris' );
		assert.equal( url.searchParams.get( 'heading' ), '12' );
		assert.equal( url.searchParams.has( 'worlds' ), false );

	} );

	test( 'a challenge picked: its card opens there, with the friend\'s handle', () => {

		assert.equal( earthUrl( { challenge: 42 }, `${ BASE }/` ), '/?challenge=42' );
		assert.equal( earthUrl( { challenge: 42, vs: 'ab-c' }, `${ BASE }/` ), '/?challenge=42&vs=ab-c' );
		// Not a challenge's id: nothing opens, the plain Earth.
		assert.equal( earthUrl( { challenge: 'x' }, `${ BASE }/` ), '/?worlds=0' );
		assert.equal( earthUrl( { challenge: 0 }, `${ BASE }/` ), '/?worlds=0' );

	} );

	test( 'null: this page as it is, the Earth asked for again (never the orrery)', () => {

		assert.equal( earthUrl( null, `${ BASE }/` ), '/?worlds=0' );
		assert.equal( earthUrl( null, `${ BASE }/?spot=neptune` ), '/?spot=neptune' );
		assert.equal( earthUrl( null, `${ BASE }/c?challenge=3&vs=q` ), '/c?challenge=3&vs=q' );

	} );

	test( 'whatever it makes is a load that does not open the orrery', () => {

		for ( const [ target, href ] of [ [ {}, '/' ], [ null, '/?pro=1' ], [ { spot: 'x' }, '/' ], [ { challenge: 5 }, '/?worlds=1' ], [ {}, '/c?challenge=1' ] ] ) {

			const url = new URL( earthUrl( target, `${ BASE }${ href }` ), BASE );
			assert.equal( orreryFirstFor( url.search, { path: url.pathname } ), false, `${ JSON.stringify( target ) } ${ href }` );

		}

	} );

} );

describe( 'earthTarget: what was picked, as earthUrl takes it', () => {

	test( 'an Earth start spot by its id (and where it is, should the id not be one)', () => {

		const spot = SPOTS[ 0 ];
		const target = earthTarget( spot );
		assert.equal( target.spot, spot.id );
		assert.equal( target.at, spot );
		const url = new URL( earthUrl( target, `${ BASE }/` ), BASE );
		assert.equal( url.searchParams.get( 'spot' ), spot.id );

	} );

	test( 'a dropped pin by where it is; a challenge; nothing', () => {

		assert.deepEqual( earthTarget( { lat: 1, lon: 2, name: 'Dropped pin' } ), { at: { lat: 1, lon: 2, name: 'Dropped pin' } } );
		assert.deepEqual( earthTarget( { challenge: 7, vs: 'h' } ), { challenge: 7, vs: 'h' } );
		assert.deepEqual( earthTarget( { challenge: 7 } ), { challenge: 7, vs: null } );
		assert.deepEqual( earthTarget( null ), {} );
		assert.deepEqual( earthTarget( undefined ), {} );
		assert.deepEqual( earthTarget( 'earth' ), {} );

	} );

} );

describe( 'what\'s kept in the browser', () => {

	const memory = () => {

		const map = new Map();
		return { getItem: key => map.get( key ) ?? null, setItem: ( key, value ) => map.set( key, String( value ) ), removeItem: key => map.delete( key ) };

	};

	test( 'the used-up word is today\'s only, and cleared', () => {

		const storage = memory();
		const now = Date.UTC( 2026, 10, 20, 12 );
		assert.equal( usedUpToday( storage, now ), false );
		writeStored( EARTH_USED_UP, utcDay( now ), storage );
		assert.equal( usedUpToday( storage, now ), true );
		assert.equal( usedUpToday( storage, now + 24 * 3600e3 ), false );
		writeStored( EARTH_USED_UP, null, storage );
		assert.equal( readStored( EARTH_USED_UP, storage ), null );

	} );

	test( 'storage that throws (a private window) is no storage, never an error', () => {

		const broken = { getItem() { throw new Error( 'no' ); }, setItem() { throw new Error( 'no' ); }, removeItem() { throw new Error( 'no' ); } };
		assert.equal( readStored( LAST_WORLD, broken ), null );
		assert.doesNotThrow( () => writeStored( LAST_WORLD, 'mars', broken ) );
		assert.equal( usedUpToday( broken ), false );
		// And none at all (node's, here).
		assert.equal( readStored( LAST_WORLD, undefined ), null );

	} );

} );
