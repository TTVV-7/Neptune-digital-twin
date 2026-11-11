import { cleanPlace } from '../../worker/drive/names.js';
import { MOON, moonSpot } from './moon-places.js';

// Where to drive: the starting spots on the globe's panel, typed coordinates, a place a link
// opens on, and the places you drove lately (kept in this browser).

// Spots worth a drive, each on its road as OpenStreetMap has it (Times Square on 7th Avenue, the
// Grand Canyon's on Hermit Road, Monaco's on Boulevard Albert 1er, the Strip on Las Vegas
// Boulevard), not on a roof or over a cliff beside it. `heading` (degrees from north) is the way
// along the road or bridge there: a hint the drop-in follows if the street really goes that way
// (see spawn.js). `deck`: the spot is on a bridge, so the drop-in looks round the pin for the deck
// rather than the water under it.
export const SPOTS = [
	{ id: 'neptune', name: 'Neptune Terminals', region: 'North Vancouver, Canada', lat: 49.30653, lon: - 123.04957, heading: 59 },
	{ id: 'sea-to-sky', name: 'Sea-to-Sky Highway', region: 'Howe Sound, Canada', lat: 49.55656, lon: - 123.23345, heading: 189 },
	{ id: 'lions-gate', name: 'Lions Gate Bridge', region: 'Vancouver, Canada', lat: 49.3151, lon: - 123.1389, heading: 25, deck: true },
	{ id: 'golden-gate', name: 'Golden Gate Bridge', region: 'San Francisco, USA', lat: 37.8199, lon: - 122.4783, heading: 352, deck: true },
	{ id: 'manhattan', name: 'Times Square', region: 'Manhattan, New York', lat: 40.75765, lon: - 73.98577, heading: 29 },
	{ id: 'monaco', name: 'Monaco harbour', region: 'Monte Carlo, Monaco', lat: 43.73658, lon: 7.42144, heading: 34 },
	{ id: 'shibuya', name: 'Shibuya Crossing', region: 'Tokyo, Japan', lat: 35.6595, lon: 139.7005 },
	{ id: 'furka', name: 'Furka Pass', region: 'Swiss Alps, 2,429 m up', lat: 46.5725, lon: 8.4153 },
	{ id: 'grand-canyon', name: 'Grand Canyon rim road', region: 'Arizona, USA', lat: 36.0708, lon: - 112.15374, heading: 159 },
	{ id: 'sydney', name: 'Sydney Harbour Bridge', region: 'Sydney, Australia', lat: - 33.8523, lon: 151.2108, heading: 15, deck: true },
	{ id: 'arc', name: 'Arc de Triomphe', region: 'Paris, France', lat: 48.8738, lon: 2.2962, heading: 0 },
	{ id: 'vegas', name: 'Las Vegas Strip', region: 'Nevada, USA', lat: 36.1129, lon: - 115.1728, heading: 1 },
];

const RECENT_KEY = 'world-drive.recent';
// The Moon's recent places are kept apart (moon-places.js), six of its own.
const RECENT_MOON_KEY = 'world-drive.recent-moon';
const RECENT_MAX = 6;

// "49.3054, -123.0491", "49.3054 -123.0491" or "49.3054° N, 123.0491° W" as { lat, lon }, or null.
export function parseLatLon( text ) {

	const match = String( text ).trim().match( /^([+-]?\d{1,2}(?:\.\d+)?)\s*°?\s*([NS])?\s*[,;\s]\s*([+-]?\d{1,3}(?:\.\d+)?)\s*°?\s*([EW])?$/i );
	if ( ! match ) return null;
	const lat = Number( match[ 1 ] ) * ( /s/i.test( match[ 2 ] ?? '' ) ? - 1 : 1 );
	const lon = Number( match[ 3 ] ) * ( /w/i.test( match[ 4 ] ?? '' ) ? - 1 : 1 );
	if ( Math.abs( lat ) > 90 || Math.abs( lon ) > 180 ) return null;
	return { lat, lon };

}

// The place a link to the game pins on the globe, or null: ?spot=<a start spot's id>, or
// ?at=<lat>,<lon> with name=, region= and heading= (degrees from north) if it has them; on the Moon
// (moon-places.js), a Moon spot's id ("moon-tycho"), or ?at= with world=moon. The places'
// pages link here ("Drive here", drive/site/), and anyone can make such a link, so its name and
// region are only taken as the leaderboard takes a place's name (letters, numbers and an address's
// punctuation, nothing rude: cleanPlace), since the others driving there see it; else it's a
// dropped pin.
export function linkedPlace( search ) {

	const params = new URLSearchParams( search );
	const id = params.get( 'spot' );
	const spot = SPOTS.find( s => s.id === id ) ?? ( id?.startsWith( 'moon-' ) ? moonSpot( id ) : null );
	if ( spot ) return spot;
	const at = parseLatLon( params.get( 'at' ) ?? '' );
	if ( ! at ) return null;
	const heading = Number( params.get( 'heading' ) ?? '' );
	return {
		name: cleanPlace( params.get( 'name' ) ?? '' ) ?? 'Dropped pin',
		region: cleanPlace( params.get( 'region' ) ?? '' ) ?? '',
		...at,
		...( params.get( 'heading' ) && Number.isFinite( heading ) ? { heading: ( heading % 360 + 360 ) % 360 } : {} ),
		...( params.get( 'world' ) === MOON ? { world: MOON } : {} ),
	};

}

// What linkedPlace reads, for taking it out of the address once it's been used.
export const LINK_PARAMS = [ 'spot', 'at', 'name', 'region', 'heading', 'world' ];

export function formatLatLon( lat, lon ) {

	return `${ Math.abs( lat ).toFixed( 4 ) }° ${ lat < 0 ? 'S' : 'N' }, ${ Math.abs( lon ).toFixed( 4 ) }° ${ lon < 0 ? 'W' : 'E' }`;

}

// The start spot nearest ( lat, lon ) if there's one within `within` metres, else null.
export function spotNear( lat, lon, within ) {

	let nearest = null;
	let gap = within;
	for ( const spot of SPOTS ) {

		const d = metresBetween( lat, lon, spot.lat, spot.lon );
		if ( d <= gap ) {

			nearest = spot;
			gap = d;

		}

	}

	return nearest;

}

// How far apart (m) two spots are along the ground: on a sphere, which is near enough.
export function metresBetween( latA, lonA, latB, lonB ) {

	const rad = Math.PI / 180;
	const a = Math.sin( ( latB - latA ) * rad / 2 ) ** 2 + Math.cos( latA * rad ) * Math.cos( latB * rad ) * Math.sin( ( lonB - lonA ) * rad / 2 ) ** 2;
	return 2 * 6371000 * Math.asin( Math.min( 1, Math.sqrt( a ) ) );

}

// Latest first, on the Earth or the Moon (`world`): [ { name, region, lat, lon, heading, deck } ],
// the Moon's with world: 'moon'.
export function recentPlaces( world = 'earth' ) {

	const moon = world === MOON;
	const list = storage( () => JSON.parse( localStorage.getItem( moon ? RECENT_MOON_KEY : RECENT_KEY ) ) );
	if ( ! Array.isArray( list ) ) return [];
	return list
		.filter( place => typeof place?.name === 'string' && Number.isFinite( place.lat ) && Number.isFinite( place.lon ) )
		.slice( 0, RECENT_MAX )
		.map( place => moon ? { ...place, world: MOON } : place );

}

// Which world a place is on: 'moon' or 'earth'.
export function worldOf( place ) {

	return place?.world === MOON ? MOON : 'earth';

}

export function rememberPlace( { name, region = '', lat, lon, heading, deck, world } ) {

	const moon = world === MOON;
	const same = place => Math.abs( place.lat - lat ) < 1e-4 && Math.abs( place.lon - lon ) < 1e-4;
	const place = { name, region, lat, lon, ...( Number.isFinite( heading ) ? { heading } : {} ), ...( deck ? { deck: true } : {} ) };
	const list = [ place, ...recentPlaces( worldOf( { world } ) ).filter( place => ! same( place ) ).map( ( { world, ...rest } ) => rest ) ].slice( 0, RECENT_MAX );
	storage( () => localStorage.setItem( moon ? RECENT_MOON_KEY : RECENT_KEY, JSON.stringify( list ) ) );
	return list;

}

// localStorage can throw (private windows, blocked site data); the app works without it.
export function storage( fn ) {

	try {

		return fn();

	} catch {

		return null;

	}

}
