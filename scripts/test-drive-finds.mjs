// node --test scripts/test-drive-finds.mjs: the Discoveries (docs/world-drive.md, "Discoveries"):
// their list (src/drive-app/finds-data.js) keeps the facts rule, their heights (finds-heights.js) are
// what the game's own data says today, the card's words are built from the data, and the rules for
// reaching one, the approach spawn and what's kept in a browser hold. Plain functions, so no browser:
// the page's own behaviour is test-drive-finds-ui.mjs's, the Worker's test-drive-levels.mjs's.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { ACHIEVEMENTS, CLAIM_TALLY, TALLY_DAY, addTallies, checkTallies, claimTallies, countsOf, findCounts, mergeTallies, readTallies } from '../src/drive-app/achievement-rules.js';
import { createGround } from '../src/drive-app/body-height.js';
import { FINDS, FINDS_ON, FIND_DATA, FIND_IDS, KINDS } from '../src/drive-app/finds-data.js';
import { FIND_HEIGHTS } from '../src/drive-app/finds-heights.js';
import {
	APPROACH, ARM, REACH, approachFor, bearing, cardOf, collectable, countIn, dataLine, destination, distance, gridSize, heightLine, missing,
	nearOnPlacing, nearestMissing, overUnder, placeOf, readStored, reliefLine, stillNear, writeStored,
} from '../src/drive-app/finds-rules.js';
import { levelRadius } from '../src/drive-app/level.js';
import { PLACES_ON, SPOTS_ON } from '../src/drive-app/world-places.js';
import { WORLDS } from '../src/drive-app/worlds.js';

const PUBLIC = new URL( '../drive/public/', import.meta.url );

describe( 'the list keeps the facts rule', () => {

	test( 'every find is a place on its world, once, on the Moon, Mars, Vesta or Ceres', () => {

		assert.equal( FIND_IDS.size, FINDS.length, 'an id twice' );
		for ( const find of FINDS ) {

			assert.ok( [ 'moon', 'mars', 'vesta', 'ceres' ].includes( find.world ), find.id );
			assert.ok( PLACES_ON[ find.world ].some( place => place.id === find.id ), `${ find.id } isn't a place on ${ find.world }` );
			assert.ok( find.id.startsWith( WORLDS[ find.world ].prefix ), find.id );

		}

		for ( const world of Object.keys( FINDS_ON ) ) assert.ok( FINDS_ON[ world ].length > 0, world );
		assert.equal( FINDS_ON.earth, undefined, 'the Earth has none' );

	} );

	test( 'every fact is short and says where it\'s from; every kind is one there is', () => {

		for ( const find of FINDS ) {

			assert.ok( KINDS[ find.kind ], `${ find.id }: kind ${ find.kind }` );
			assert.ok( find.facts.length >= 1 && find.facts.length <= 3, `${ find.id }: ${ find.facts.length } facts` );
			for ( const fact of find.facts ) {

				assert.ok( fact.text.length > 0 && fact.text.length <= 160, `${ find.id }: "${ fact.text }" is ${ fact.text.length } characters` );
				assert.ok( typeof fact.source === 'string' && fact.source.length > 0, `${ find.id }: a fact without a source` );

			}

			assert.ok( find.relief === null || ( Number.isFinite( find.relief ) && find.relief > 0 ), find.id );

		}

	} );

	test( 'every landing site says what the map does and doesn\'t show of it', () => {

		for ( const find of FINDS.filter( f => f.kind === 'landing' ) ) {

			assert.ok( find.seeing?.length > 0, find.id );
			assert.ok( find.mission && Number.isInteger( find.year ), find.id );

		}

	} );

	test( 'no two finds on a world are within 2 km of each other', () => {

		for ( const world of Object.keys( FINDS_ON ) ) {

			const places = FINDS_ON[ world ].map( placeOf );
			for ( let i = 0; i < places.length; i ++ ) {

				for ( let j = i + 1; j < places.length; j ++ ) {

					const metres = distance( places[ i ], places[ j ], WORLDS[ world ].radius );
					assert.ok( metres >= 2000, `${ places[ i ].id } and ${ places[ j ].id } are ${ Math.round( metres ) } m apart` );

				}

			}

		}

	} );

	test( 'every world names what its ground is built from', () => {

		for ( const world of Object.keys( FINDS_ON ) ) {

			assert.ok( FIND_DATA[ world ]?.short && FIND_DATA[ world ].heights && FIND_DATA[ world ].picture && FIND_DATA[ world ].datum, world );
			assert.match( dataLine( world ), /grid, ~[\d.]+ (km|m)\)/ );

		}

	} );

} );

describe( 'the heights are the game\'s own data', () => {

	// Measured again here, the way make-finds.mjs does (but written out on its own): the measured grid
	// alone, over the world's level.
	const grounds = {};
	const heightOf = ( world, lat, lon ) => {

		if ( ! grounds[ world ] ) {

			const info = WORLDS[ world ];
			const ground = createGround( info );
			const file = readFileSync( new URL( `.${ info.heights.url }`, PUBLIC ) );
			ground.setHeights( new Int16Array( file.buffer, file.byteOffset, file.length / 2 ) );
			grounds[ world ] = ground;

		}

		return WORLDS[ world ].radius + grounds[ world ].heightAt( lat, lon, 1e7 ) - levelRadius( world, lat );

	};

	test( 'finds-heights.js has every find, within 10 m of the grid today (run scripts/make-finds.mjs if not)', () => {

		assert.deepEqual( Object.keys( FIND_HEIGHTS ).sort(), [ ...FIND_IDS ].sort() );
		for ( const find of FINDS ) {

			const place = placeOf( find.id );
			const h = heightOf( find.world, place.lat, place.lon );
			assert.ok( Math.abs( FIND_HEIGHTS[ find.id ].h - h ) <= 10, `${ find.id }: kept ${ FIND_HEIGHTS[ find.id ].h }, measured ${ Math.round( h ) }` );
			if ( find.relief ) {

				const { low, high, km } = FIND_HEIGHTS[ find.id ];
				assert.equal( km, find.relief, find.id );
				assert.ok( low <= FIND_HEIGHTS[ find.id ].h + 10 && high >= FIND_HEIGHTS[ find.id ].h - 10, find.id );

			}

		}

	} );

	test( 'the highest and lowest finds are the grid\'s highest and lowest ground (within a few cells)', () => {

		for ( const world of [ 'moon', 'mars' ] ) {

			const info = WORLDS[ world ];
			const file = readFileSync( new URL( `.${ info.heights.url }`, PUBLIC ) );
			const grid = new Int16Array( file.buffer, file.byteOffset, file.length / 2 );
			let [ low, high ] = [ Infinity, - Infinity ];
			for ( const value of grid ) [ low, high ] = [ Math.min( low, value ), Math.max( high, value ) ];
			const top = FINDS.find( f => f.world === world && f.kind === 'highest' );
			const bottom = FINDS.find( f => f.world === world && f.kind === 'lowest' );
			assert.ok( high - FIND_HEIGHTS[ top.id ].h < 500, `${ top.id }: ${ FIND_HEIGHTS[ top.id ].h } against the grid's ${ high }` );
			// (The lowest place's own height, or the lowest of the ground round it the card gives.)
			const deepest = Math.min( FIND_HEIGHTS[ bottom.id ].h, FIND_HEIGHTS[ bottom.id ].low ?? Infinity );
			assert.ok( deepest - low < 500, `${ bottom.id }: ${ deepest } against the grid's ${ low }` );

		}

	} );

} );

describe( 'the card\'s words come from the data', () => {

	test( 'on the Moon, over its sphere, with the grid named and a landing site\'s seeing line', () => {

		const card = cardOf( 'moon-apollo-11' );
		assert.equal( card.name, placeOf( 'moon-apollo-11' ).name );
		assert.equal( card.kind, 'Landing site' );
		const h = FIND_HEIGHTS[ 'moon-apollo-11' ].h;
		assert.equal( card.height, `In this map: ${ overUnder( h ) } the Moon's 1,737.4 km reference sphere.` );
		assert.match( card.seeing, new RegExp( gridSize( 'moon' ) ) );
		assert.doesNotMatch( card.seeing, /\{grid\}/ );
		assert.match( card.data, /^NASA LRO: LOLA heights \(0\.25° grid, ~7\.6 km\)/ );
		assert.match( card.note, /The grid is 7\.6 km/ );

	} );

	test( 'on Mars, over the areoid, and the published figure beside the measured one, with why they differ', () => {

		const line = heightLine( 'mars-olympus-summit' );
		assert.match( line, /Mars's datum \(the areoid\)/ );
		assert.match( line, /21,171 m above; this map's 7\.4 km cells average it to/ );
		assert.ok( line.includes( overUnder( FIND_HEIGHTS[ 'mars-olympus-summit' ].h ) ) );

	} );

	test( 'on Vesta, over the Dawn team\'s spheroid; on Ceres, over the game\'s own', () => {

		assert.match( heightLine( 'vesta-rheasilvia-peak' ), /Vesta's 285 × 229 km reference spheroid \(the level the Dawn team gives heights over\)/ );
		assert.match( heightLine( 'ceres-occator' ), /the game's 482 × 446 km reference spheroid for Ceres/ );
		const { low, high, km } = FIND_HEIGHTS[ 'vesta-rheasilvia-peak' ];
		assert.equal( reliefLine( 'vesta-rheasilvia-peak' ), `Rises ${ ( high - low ).toLocaleString( 'en-CA' ) } m from its lowest to its highest point within ${ km } km.` );
		assert.equal( reliefLine( 'vesta-rheasilvia' ), '' );

	} );

	test( 'a height below the datum reads "… m below", never a minus sign', () => {

		assert.equal( overUnder( - 1930 ), '1,930 m below' );
		assert.equal( overUnder( 21160 ), '21,160 m above' );
		const below = FINDS.find( f => FIND_HEIGHTS[ f.id ].h < 0 );
		assert.ok( below );
		assert.match( heightLine( below.id ), / m below / );
		assert.doesNotMatch( heightLine( below.id ), /−|-\d/ );

	} );

	test( 'every find has a whole card', () => {

		for ( const find of FINDS ) {

			const card = cardOf( find.id );
			for ( const field of [ 'name', 'kind', 'icon', 'height', 'note', 'data' ] ) assert.ok( card[ field ], `${ find.id }: no ${ field }` );
			assert.doesNotMatch( JSON.stringify( card ), /\{grid\}|\{radius\}|\{level\}|undefined|NaN/, find.id );

		}

	} );

} );

describe( 'reaching one', () => {

	const R = WORLDS.moon.radius;
	const find = { lat: 0, lon: 0 };
	// A point `east` and `north` metres from the find.
	const at = ( east, north, extra = {} ) => ( { lat: north / R * 180 / Math.PI, lon: east / R * 180 / Math.PI, above: 0, flying: false, ...extra } );

	test( 'a car within 150 m, not beyond', () => {

		assert.equal( collectable( find, { radius: R }, null, at( 0, 140 ) ), true );
		assert.equal( collectable( find, { radius: R }, null, at( 0, 160 ) ), false );
		assert.equal( REACH.CAR, 150 );

	} );

	test( 'in the air, within 250 m along the ground and no more than 2,000 m over it', () => {

		assert.equal( collectable( find, { radius: R }, null, at( 0, 240, { flying: true, above: 500 } ) ), true );
		assert.equal( collectable( find, { radius: R }, null, at( 0, 240, { flying: true, above: 2100 } ) ), false );
		assert.equal( collectable( find, { radius: R }, null, at( 0, 240 ) ), false, 'a car at 240 m' );

	} );

	test( 'tested along the step from the last frame: a 65 m step passing 100 m off counts', () => {

		const from = at( - 32, 100 );
		const to = at( 33, 100 );
		assert.equal( collectable( find, { radius: R }, null, to ), true, 'ends within reach anyway' );
		// A plane's step of 1 km straight over it, ending far past it.
		assert.equal( collectable( find, { radius: R }, at( - 500, 100, { flying: true, above: 600 } ), at( 500, 100, { flying: true, above: 600 } ) ), true );
		assert.equal( collectable( find, { radius: R }, at( - 500, 400, { flying: true, above: 600 } ), at( 500, 400, { flying: true, above: 600 } ) ), false );
		assert.equal( collectable( find, { radius: R }, at( - 500, 100 ), at( 500, 100 ) ), true, 'a car\'s step too' );
		assert.ok( from && to );

	} );

	test( 'nothing counts until the car has been 1 km from it since it was put down', () => {

		const place = placeOf( 'moon-tycho' );
		assert.equal( collectable( place, { radius: R, armed: false }, null, place ), false );
		const near = nearOnPlacing( 'moon', place );
		assert.deepEqual( [ ...near ], [ 'moon-tycho' ] );
		assert.deepEqual( [ ...stillNear( near, 'moon', destination( place, 90, 500, R ) ) ], [ 'moon-tycho' ] );
		assert.deepEqual( [ ...stillNear( near, 'moon', destination( place, 90, ARM + 10, R ) ) ], [] );

	} );

} );

describe( 'the approach spawn', () => {

	test( '2.5 km from the find, facing it, from the flattest of eight ways', () => {

		const place = placeOf( 'mars-olympus-mons' );
		const R = WORLDS.mars.radius;
		// Ground rising to the north: the flattest way in is along the slope's contour, east or west.
		const heightAt = ( lat ) => lat * 100000;
		const spawn = approachFor( 'mars-olympus-mons', heightAt );
		assert.ok( Math.abs( distance( spawn, place, R ) - APPROACH ) < 1 );
		const from = bearing( place, spawn );
		assert.ok( Math.abs( Math.sin( from * Math.PI / 180 ) ) > 0.99, `came in from ${ from }°` );
		const facing = bearing( spawn, place );
		assert.ok( Math.abs( ( ( spawn.heading - facing + 540 ) % 360 ) - 180 ) < 0.5 );

	} );

	test( 'without heights yet, from the south, facing north', () => {

		const spawn = approachFor( 'moon-tycho' );
		assert.ok( spawn.lat < placeOf( 'moon-tycho' ).lat );
		assert.ok( Math.min( spawn.heading, 360 - spawn.heading ) < 0.5 );
		assert.equal( approachFor( 'nowhere' ), null );

	} );

} );

describe( 'kept in this browser, and sent again', () => {

	test( 'what\'s kept is read back, and anything that isn\'t a find (or is damaged) left out', () => {

		assert.deepEqual( readStored( writeStored( { 'moon-tycho': 5, 'moon-nowhere': 6, 'mars-gale': 'x' } ) ), { 'moon-tycho': 5 } );
		assert.deepEqual( readStored( null ), {} );
		assert.deepEqual( readStored( '{' ), {} );
		assert.deepEqual( readStored( JSON.stringify( { v: 2, at: { 'moon-tycho': 5 } } ) ), {} );

	} );

	test( 'the ones the Worker\'s list lacks are sent again', () => {

		assert.deepEqual( missing( [ 'moon-tycho', 'mars-gale', 'moon-nowhere' ], [ 'mars-gale' ] ), [ 'moon-tycho' ] );
		assert.deepEqual( missing( [], [ 'mars-gale' ] ), [] );

	} );

	test( 'counts and the nearest not yet found', () => {

		assert.deepEqual( countIn( [ 'moon-tycho', 'mars-gale' ], 'moon' ), { have: 1, of: FINDS_ON.moon.length } );
		const all = new Set( FINDS_ON.ceres );
		assert.equal( nearestMissing( 'ceres', { lat: 0, lon: 0 }, all ), null );
		const nearest = nearestMissing( 'ceres', placeOf( 'ceres-occator' ), new Set( [ 'ceres-occator' ] ) );
		assert.equal( nearest.id, 'ceres-cerealia-facula' );

	} );

	test( 'every start spot on the globe\'s panel has a find within 80 km, or the pointer to one', () => {

		// (Reported, not required: a spot with none still has the pointer and the approach spawn.)
		const bare = [];
		for ( const world of Object.keys( FINDS_ON ) ) {

			for ( const spot of SPOTS_ON[ world ] ) {

				if ( ! FINDS_ON[ world ].some( id => distance( placeOf( id ), spot, WORLDS[ world ].radius ) < 80000 ) ) bare.push( spot.id );

			}

		}

		assert.ok( bare.length <= 2, `bare spots: ${ bare.join( ', ' ) }` );

	} );

} );

describe( 'the achievements\' rules count them', () => {

	test( 'eleven achievements, every target from the list', () => {

		const ids = ACHIEVEMENTS.filter( a => a.count.startsWith( 'finds' ) );
		assert.equal( ids.length, 11 );
		assert.equal( ACHIEVEMENTS.find( a => a.id === 'finds-all' ).target, FIND_IDS.size );
		for ( const world of Object.keys( FINDS_ON ) ) {

			assert.equal( ACHIEVEMENTS.find( a => a.id === `${ world }-book` ).target, FINDS_ON[ world ].length );
			assert.equal( ACHIEVEMENTS.find( a => a.id === `${ world }-half` ).target, Math.ceil( FINDS_ON[ world ].length / 2 ) );

		}

	} );

	test( 'a report\'s finds: real ids only, each once', () => {

		assert.deepEqual( checkTallies( { finds: [ 'moon-tycho', 'moon-tycho' ] } ).finds, [ 'moon-tycho' ] );
		assert.equal( checkTallies( { finds: [ 'moon-nowhere' ] } ), null );
		assert.equal( checkTallies( { finds: 'moon-tycho' } ), null );
		assert.deepEqual( checkTallies( {} ).finds, [] );

	} );

	test( 'kept, added once, a day\'s worth and a report\'s rate at most, the rest left for later', () => {

		const kept = readTallies( JSON.stringify( { finds: [ 'moon-tycho', 'moon-nowhere' ] } ) );
		assert.deepEqual( kept.finds, [ 'moon-tycho' ] );
		const { tallies, taken } = addTallies( kept, { feats: { finds: [ 'moon-tycho', 'mars-gale', 'ceres-kait', 'vesta-snowman' ] }, findsMost: 2 }, '2026-11-20' );
		assert.deepEqual( taken.finds, [ 'mars-gale', 'ceres-kait' ] );
		assert.deepEqual( tallies.finds, [ 'moon-tycho', 'mars-gale', 'ceres-kait' ] );
		assert.equal( tallies.today.finds, 2 );
		const day = readTallies( JSON.stringify( { finds: [], day: '2026-11-20', today: { finds: TALLY_DAY.finds - 1 } } ) );
		assert.deepEqual( addTallies( day, { feats: { finds: [ 'mars-gale', 'ceres-kait' ] } }, '2026-11-20' ).taken.finds, [ 'mars-gale' ] );
		assert.equal( claimTallies( { feats: { moon: 0, looks: 0, rides: [], finds: [ ...FIND_IDS ] } } ).feats.finds.length, CLAIM_TALLY.finds );

	} );

	test( 'counted on each world from the list, and an account\'s from all its players\' together', () => {

		const counts = countsOf( readTallies( JSON.stringify( { finds: [ 'moon-tycho', 'moon-plato', 'mars-gale' ] } ) ) );
		assert.equal( counts.finds, 3 );
		assert.equal( counts[ 'finds-moon' ], 2 );
		assert.equal( counts[ 'finds-mars' ], 1 );
		assert.equal( counts[ 'finds-vesta' ], 0 );
		assert.equal( countsOf( readTallies( '{}' ), { finds: FINDS_ON.moon } )[ 'finds-moon' ], FINDS_ON.moon.length );
		assert.deepEqual( findCounts( [ 'ceres-kait', 'ceres-kait', 'x' ] ), { finds: 1, 'finds-moon': 0, 'finds-mars': 0, 'finds-vesta': 0, 'finds-ceres': 1 } );
		assert.deepEqual( mergeTallies( { finds: [ 'moon-tycho' ] }, { finds: [ 'mars-gale', 'moon-tycho' ] } ).finds, [ 'moon-tycho', 'mars-gale' ] );

	} );

} );
