// node scripts/make-sea-mask.mjs [ocean.geojson lakes.geojson]: makes drive/public/sea/mask.bin,
// where the sea and the big lakes are, for World Drive's open sea (src/drive-app/sea.js).
//
// Google draws the sea bed out past what it photographs of a coast, and some deep lakes' beds too
// (Baikal's, 1.2 km under the ellipsoid), so how far down the ground is doesn't say on its own
// whether a pin is on the sea, a lake or land under the sea's height (the Dead Sea's shore, a
// polder): this map does. It's Natural Earth's ocean and lakes at 1:10 million (public domain,
// https://www.naturalearthdata.com), from their GeoJSON copies (fetched unless copies are given).
// The ocean is the sea and every sea joined to it, one polygon all the way round the world, with no
// lake in it; its other polygon is the Caspian, a lake. The lakes are src/drive-app/lakes.js's,
// each by its outline's names.
//
// Every 1/24° of latitude and longitude (4.6 km north to south) is a square: 4,320 rows from 90° N,
// each of 8,640 squares from 180° W. A square is the sea (2) if all of it is, a coast (1) if the
// sea's edge (a coast, an island's) crosses it, a lake (3) if all of it is that lake, and otherwise
// land (0). A square a lake's shore crosses is land, unlike one on a coast: right by a lake there
// can be ground far under its surface and open to it (the river out of it, below a falls or a dam:
// Niagara's gorge, 75 m under Lake Erie, by a square of Natural Earth's Erie, which goes down the
// river to the falls), where land by the sea under its height (the side of the Assal depression,
// 28 m under it in the square the Ghoubbet's shore crosses) is walled off from it by ground over
// its height, which src/drive-app/main.js looks for. It's kept as each row's runs of the same, a
// row's runs adding up to its 8,640 squares: each as its length times 4 plus what it is, and after
// a lake's, which lake (lakes.js's first is 0), each number in bytes of 7 bits, low bits first, the
// top bit set on all but the last. Before the rows, 24 and how many lakes there are, so that sea.js
// reads only a map made for its own list.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { LAKES } from '../src/drive-app/lakes.js';

const SOURCES = [ 'ocean', 'lakes' ].map( name => `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_${ name }.geojson` );
const OUT = new URL( '../drive/public/sea/mask.bin', import.meta.url );
const PER_DEGREE = 24;
const ROWS = 180 * PER_DEGREE;
const COLUMNS = 360 * PER_DEGREE;
const CELL = 1 / PER_DEGREE;
const [ LAND, COAST, SEA, LAKE ] = [ 0, 1, 2, 3 ];

const [ ocean, lakes ] = await Promise.all( SOURCES.map( async ( source, i ) => JSON.parse( process.argv[ 2 + i ] ? readFileSync( process.argv[ 2 + i ], 'utf8' ) : await ( await fetch( source ) ).text() ) ) );
const polygons = geometry => geometry.type === 'Polygon' ? [ geometry.coordinates ] : geometry.coordinates;
// The sea's polygon goes all the way round (180° W to 180° E); the Caspian's is the other one.
const oceans = ocean.features.flatMap( ( { geometry } ) => polygons( geometry ) );
const world = oceans.filter( polygon => polygon[ 0 ].some( ( [ lon ] ) => lon === 180 ) );
const caspian = oceans.filter( polygon => ! world.includes( polygon ) );
if ( world.length !== 1 || caspian.length !== 1 ) throw new Error( 'Not the ocean this expects' );
const outline = name => {

	const found = name === 'Caspian Sea' ? caspian : lakes.features.filter( ( { properties } ) => properties.name === name ).flatMap( ( { geometry } ) => polygons( geometry ) );
	if ( ! found.length ) throw new Error( `No ${ name } in Natural Earth's lakes` );
	return found.flat();

};

const map = new Uint8Array( ROWS * COLUMNS );

// Each square whose middle is inside the rings (in from the west along the row's middle, inside
// from each odd crossing of an edge to the next), then each square an edge crosses: to `inside` and
// `edge`. A square no edge crosses is all inside or all out, so for a lake (`lake` its name, `edge`
// land) that leaves the squares all of which are the lake; each must be land, or the lake's, till
// then.
function fill( rings, inside, edge, lake = null ) {

	const set = ( at, kind ) => {

		if ( lake && map[ at ] !== LAND && map[ at ] !== inside ) throw new Error( `${ lake } meets the sea or another lake at row ${ Math.floor( at / COLUMNS ) }` );
		map[ at ] = kind;

	};
	const crossings = Array.from( { length: ROWS }, () => [] );
	for ( const ring of rings ) {

		for ( let i = 0; i < ring.length - 1; i ++ ) {

			const [ [ x1, y1 ], [ x2, y2 ] ] = [ ring[ i ], ring[ i + 1 ] ];
			if ( y1 !== y2 ) {

				const first = Math.max( 0, Math.ceil( ( 90 - Math.max( y1, y2 ) ) / CELL - 0.5 ) );
				const last = Math.min( ROWS - 1, Math.floor( ( 90 - Math.min( y1, y2 ) ) / CELL - 0.5 ) );
				for ( let row = first; row <= last; row ++ ) {

					const lat = 90 - ( row + 0.5 ) * CELL;
					if ( lat >= Math.min( y1, y2 ) && lat < Math.max( y1, y2 ) ) crossings[ row ].push( x1 + ( lat - y1 ) * ( x2 - x1 ) / ( y2 - y1 ) );

				}

			}

		}

	}

	for ( let row = 0; row < ROWS; row ++ ) {

		const xs = crossings[ row ].sort( ( a, b ) => a - b );
		for ( let i = 0; i + 1 < xs.length; i += 2 ) {

			const from = Math.ceil( ( xs[ i ] + 180 ) / CELL - 0.5 );
			const to = Math.ceil( ( xs[ i + 1 ] + 180 ) / CELL - 0.5 );
			for ( let column = from; column < to; column ++ ) set( row * COLUMNS + column, inside );

		}

	}

	// The edges, square by square along each. The sea's edges along 180° and 90° N only close its
	// polygon (the sea goes on over them), so they're no coast.
	for ( const ring of rings ) {

		for ( let i = 0; i < ring.length - 1; i ++ ) {

			const [ [ x1, y1 ], [ x2, y2 ] ] = [ ring[ i ], ring[ i + 1 ] ];
			if ( ( Math.abs( x1 ) === 180 && x1 === x2 ) || ( y1 === 90 && y2 === 90 ) ) continue;
			along( ( x1 + 180 ) * PER_DEGREE, ( 90 - y1 ) * PER_DEGREE, ( x2 + 180 ) * PER_DEGREE, ( 90 - y2 ) * PER_DEGREE, ( column, row ) => set( row * COLUMNS + column, edge ) );

		}

	}

}

// Each square ( column, row ) the line from ( u1, v1 ) to ( u2, v2 ) (in squares) passes through,
// in order.
function along( u1, v1, u2, v2, visit ) {

	const clamp = ( n, top ) => Math.min( top - 1, Math.max( 0, n ) );
	let [ u, v ] = [ clamp( Math.floor( u1 ), COLUMNS ), clamp( Math.floor( v1 ), ROWS ) ];
	const [ endU, endV ] = [ clamp( Math.floor( u2 ), COLUMNS ), clamp( Math.floor( v2 ), ROWS ) ];
	const [ du, dv ] = [ u2 - u1, v2 - v1 ];
	const [ stepU, stepV ] = [ Math.sign( du ), Math.sign( dv ) ];
	// How far along the line (0 to 1) the next square's edge across and down is, and each square on.
	const [ eachU, eachV ] = [ stepU ? Math.abs( 1 / du ) : Infinity, stepV ? Math.abs( 1 / dv ) : Infinity ];
	let nextU = stepU > 0 ? ( u + 1 - u1 ) * eachU : stepU < 0 ? ( u1 - u ) * eachU : Infinity;
	let nextV = stepV > 0 ? ( v + 1 - v1 ) * eachV : stepV < 0 ? ( v1 - v ) * eachV : Infinity;
	visit( u, v );
	for ( let steps = Math.abs( endU - u ) + Math.abs( endV - v ); steps > 0; steps -- ) {

		if ( nextU < nextV ) {

			u += stepU;
			nextU += eachU;

		} else {

			v += stepV;
			nextV += eachV;

		}

		visit( clamp( u, COLUMNS ), clamp( v, ROWS ) );

	}

}

fill( world.flat(), SEA, COAST );
LAKES.forEach( ( lake, i ) => fill( lake.outline.flatMap( outline ), LAKE + i, LAND, lake.name ) );

// Each lake's box (for sea.js, which asks the map only by one) round all its squares, with room.
for ( let at = 0; at < map.length; at ++ ) {

	if ( map[ at ] < LAKE ) continue;
	const { name, box: [ south, west, north, east ] } = LAKES[ map[ at ] - LAKE ];
	const [ lat, lon ] = [ 90 - ( Math.floor( at / COLUMNS ) + 0.5 ) * CELL, ( at % COLUMNS + 0.5 ) * CELL - 180 ];
	if ( lat < south + CELL || lat > north - CELL || lon < west + CELL || lon > east - CELL ) throw new Error( `${ name } is out of its box at ${ lat }, ${ lon }` );

}

const bytes = [];
const write = n => {

	for ( ; n >= 128; n = Math.floor( n / 128 ) ) bytes.push( ( n % 128 ) | 128 );
	bytes.push( n );

};
write( PER_DEGREE );
write( LAKES.length );
for ( let row = 0; row < ROWS; row ++ ) {

	for ( let column = 0; column < COLUMNS; ) {

		const kind = map[ row * COLUMNS + column ];
		let length = 1;
		while ( column + length < COLUMNS && map[ row * COLUMNS + column + length ] === kind ) length ++;
		write( length * 4 + Math.min( kind, LAKE ) );
		if ( kind >= LAKE ) write( kind - LAKE );
		column += length;

	}

}

mkdirSync( new URL( '.', OUT ), { recursive: true } );
writeFileSync( OUT, Uint8Array.from( bytes ) );

// Places to see it read right.
const at = ( lat, lon ) => {

	const kind = map[ Math.floor( ( 90 - lat ) * PER_DEGREE ) * COLUMNS + Math.floor( ( lon + 180 ) * PER_DEGREE ) % COLUMNS ];
	return kind >= LAKE ? LAKES[ kind - LAKE ].name : [ 'land', 'coast', 'sea' ][ kind ];

};
for ( const [ name, lat, lon, kind ] of [
	[ 'the middle of the Pacific', 30, - 140, 'sea' ], [ 'the Pacific at 180°', 30, 180, 'sea' ], [ 'Santa Monica Bay', 33.95, - 118.6, 'sea' ],
	[ '13 km off Waikiki', 21.15, - 157.85, 'sea' ], [ '20 km off Waikiki', 21.08, - 157.85, 'sea' ], [ 'the Strait of Georgia', 49.2, - 123.55, 'sea' ],
	[ 'the Black Sea', 43, 34, 'sea' ], [ 'the Baltic', 58, 20, 'sea' ], [ 'Santa Monica Pier', 34.0065, - 118.4985, 'coast' ],
	[ 'Lake Baikal', 53.25, 108.1, 'Lake Baikal' ], [ 'the Caspian', 38.2, 51.2, 'the Caspian Sea' ], [ 'Lake Superior', 47.7, - 87.5, 'Lake Superior' ],
	[ 'Lake Michigan', 44, - 87, 'Lakes Michigan and Huron' ], [ 'Lake Huron', 44.8, - 82.4, 'Lakes Michigan and Huron' ], [ 'Lake Titicaca', - 15.8, - 69.4, 'Lake Titicaca' ],
	[ 'Issyk-Kul', 42.45, 77.25, 'Issyk-Kul' ], [ 'Lake Tanganyika', - 6, 29.5, 'Lake Tanganyika' ], [ 'Lake Victoria', - 1, 33, 'Lake Victoria' ],
	[ 'Olkhon, in Baikal', 53.15, 107.35, 'land' ], [ 'Denver', 39.74, - 104.99, 'land' ], [ 'the Dead Sea', 31.5, 35.5, 'land' ],
	[ 'the Dead Sea\'s shore', 31.5, 35.48, 'land' ], [ 'Death Valley', 36.25, - 116.83, 'land' ], [ 'Lake Assal', 11.65, 42.42, 'land' ],
	[ 'the Qattara Depression', 29.5, 27, 'land' ], [ 'the Karagiye Depression', 43.45, 51.75, 'land' ], [ 'the Salton Sea', 33.3, - 115.8, 'land' ],
	[ 'Niagara Falls', 43.08, - 79.07, 'land' ], [ 'the Nile below the dam at Jinja', 0.44, 33.19, 'land' ],
] ) {

	if ( at( lat, lon ) !== kind ) throw new Error( `${ name } should be ${ kind }, not ${ at( lat, lon ) }` );

}

const counts = new Map();
for ( const kind of map ) counts.set( kind, ( counts.get( kind ) ?? 0 ) + 1 );
console.log( `${ bytes.length } bytes to ${ OUT.pathname }: ${ [ 'land', 'coast', 'sea' ].map( ( name, kind ) => `${ ( counts.get( kind ) / map.length * 100 ).toFixed( 1 ) }% ${ name }` ).join( ', ' ) }, ${ LAKES.map( ( lake, i ) => `${ lake.name } ${ counts.get( LAKE + i ) ?? 0 }` ).join( ', ' ) } squares` );
