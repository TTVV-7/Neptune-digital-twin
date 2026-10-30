// Where to drive: the starting spots on the globe's panel, typed coordinates, and the places
// you drove lately (kept in this browser).

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

export function formatLatLon( lat, lon ) {

	return `${ Math.abs( lat ).toFixed( 4 ) }° ${ lat < 0 ? 'S' : 'N' }, ${ Math.abs( lon ).toFixed( 4 ) }° ${ lon < 0 ? 'W' : 'E' }`;

}

// Latest first: [ { name, region, lat, lon, heading, deck } ].
export function recentPlaces() {

	const list = storage( () => JSON.parse( localStorage.getItem( RECENT_KEY ) ) );
	if ( ! Array.isArray( list ) ) return [];
	return list.filter( place => typeof place?.name === 'string' && Number.isFinite( place.lat ) && Number.isFinite( place.lon ) ).slice( 0, RECENT_MAX );

}

export function rememberPlace( { name, region = '', lat, lon, heading, deck } ) {

	const same = place => Math.abs( place.lat - lat ) < 1e-4 && Math.abs( place.lon - lon ) < 1e-4;
	const place = { name, region, lat, lon, ...( Number.isFinite( heading ) ? { heading } : {} ), ...( deck ? { deck: true } : {} ) };
	const list = [ place, ...recentPlaces().filter( place => ! same( place ) ) ].slice( 0, RECENT_MAX );
	storage( () => localStorage.setItem( RECENT_KEY, JSON.stringify( list ) ) );
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
