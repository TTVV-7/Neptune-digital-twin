// Where people drop in (docs/world-drive.md, "Where people drop in"): each drop-in's place, on the
// Earth or the Moon, rounded to a cell about a kilometre each way before it leaves the page, and
// counted a day by the Worker (worker/drive/dropins.js) for the owner's admin page's heat map and
// top places. Plain data and small functions, so the page, the Worker and the tests share them.
//
// The grid. Each world is cut into rows CELL metres tall from the south pole to the north (on a
// sphere of the world's radius, so a row is a whole number of them from pole to pole: 20,015 on the
// Earth, 5,458 on the Moon), and each row into as many cells as fit CELL metres wide round it at its
// middle (40,030 at the Earth's equator, fewer towards the poles, three in the rows round each pole).
// So a cell is about a kilometre on the ground each way at every latitude on both worlds: never a
// strip a few metres wide by a pole, as whole degrees' fractions would be. A cell is
// "<world>:<row>:<column>", the row from the south pole (0) and the column eastward from 180° W (0).
// The page sends only that, never where in it.

export const CELL = 1000;
export const WORLDS = [ 'earth', 'moon' ];
// Each world's radius (m): the Earth's mean, and the sphere the Moon's heights are over (moon.js).
export const RADIUS = { earth: 6371008.8, moon: 1737400 };
// The most places one post may carry (the page keeps no more between posts: stats.js).
export const PLACES_PER_POST = 6;

const CELL_TEXT = /^(earth|moon):(\d{1,5}):(\d{1,5})$/;
const ROWS = Object.fromEntries( WORLDS.map( world => [ world, Math.round( Math.PI * RADIUS[ world ] / CELL ) ] ) );

// How many cells there are round `row` of `world`'s grid.
function columns( world, row ) {

	const middle = ( - 90 + ( row + 0.5 ) * 180 / ROWS[ world ] ) * Math.PI / 180;
	return Math.max( 1, Math.round( 2 * Math.PI * RADIUS[ world ] * Math.cos( middle ) / CELL ) );

}

// The cell ( lat, lon ) in degrees is in on `world` ('earth' or 'moon'), as "<world>:<row>:<column>",
// or null for anything else.
export function cellOf( world, lat, lon ) {

	if ( ! WORLDS.includes( world ) || ! Number.isFinite( lat ) || ! Number.isFinite( lon ) || Math.abs( lat ) > 90 ) return null;
	const rows = ROWS[ world ];
	const row = Math.min( rows - 1, Math.floor( ( lat + 90 ) * rows / 180 ) );
	const count = columns( world, row );
	const east = ( ( lon + 180 ) % 360 + 360 ) % 360;
	const column = Math.min( count - 1, Math.floor( east * count / 360 ) );
	return `${ world }:${ row }:${ column }`;

}

// A cell as a page sends it, { world, row, column, key } with the key as written here; or null when
// it isn't one of the grid's cells.
export function checkCell( text ) {

	const match = typeof text === 'string' ? text.match( CELL_TEXT ) : null;
	if ( ! match ) return null;
	const [ , world ] = match;
	const row = Number( match[ 2 ] );
	const column = Number( match[ 3 ] );
	if ( row >= ROWS[ world ] || column >= columns( world, row ) ) return null;
	return { world, row, column, key: `${ world }:${ row }:${ column }` };

}

// The middle of `world`'s cell at `row`, `column`: { lat, lon } in degrees, to 5 decimals.
export function cellMiddle( world, row, column ) {

	const lat = - 90 + ( row + 0.5 ) * 180 / ROWS[ world ];
	const lon = - 180 + ( column + 0.5 ) * 360 / columns( world, row );
	return { lat: Math.round( lat * 1e5 ) / 1e5, lon: Math.round( lon * 1e5 ) / 1e5 };

}

// The edges of `world`'s cell at `row`, `column`: { south, north, west, east } in degrees, west and
// east from 180° W to 180° E.
export function cellBounds( world, row, column ) {

	const count = columns( world, row );
	return {
		south: - 90 + row * 180 / ROWS[ world ], north: - 90 + ( row + 1 ) * 180 / ROWS[ world ],
		west: - 180 + column * 360 / count, east: - 180 + ( column + 1 ) * 360 / count,
	};

}

// How far apart (m) two places on `world` are along its ground, on a sphere of its radius.
export function metresOn( world, latA, lonA, latB, lonB ) {

	const rad = Math.PI / 180;
	const a = Math.sin( ( latB - latA ) * rad / 2 ) ** 2 + Math.cos( latA * rad ) * Math.cos( latB * rad ) * Math.sin( ( lonB - lonA ) * rad / 2 ) ** 2;
	return 2 * RADIUS[ world ] * Math.asin( Math.min( 1, Math.sqrt( a ) ) );

}

// The places a post carries (`places`: [ "<world>:<row>:<column>" ]), cleaned against the drop-ins it
// counts (`counts`, checkCounts' [ [ metric, key, n ] ]): each a cell of the grid, once, and no
// more on a world than the drop-ins counted there in the same post (dropin:moon on the Moon, the
// others on the Earth), since the page posts each drop-in's place with the drop-in itself. [] for
// none; null when it isn't a list of at most PLACES_PER_POST.
export function checkPlaces( places, counts ) {

	if ( places === undefined || places === null ) return [];
	if ( ! Array.isArray( places ) || places.length > PLACES_PER_POST ) return null;
	const room = { earth: 0, moon: 0 };
	for ( const [ metric, key, n ] of counts ) if ( metric === 'dropin' ) room[ key === 'moon' ? 'moon' : 'earth' ] += n;
	const clean = new Map();
	for ( const text of places ) {

		const cell = checkCell( text );
		if ( ! cell || clean.has( cell.key ) || room[ cell.world ] < 1 ) continue;
		room[ cell.world ] --;
		clean.set( cell.key, cell );

	}

	return [ ...clean.values() ];

}
