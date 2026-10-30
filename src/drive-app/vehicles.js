import { itemConfig } from '../library.js';
import { specFor } from '../drive.js';
import { makeKart } from '../kart.js';
import { LIBRARY_VEHICLES } from './catalog.js';

// What you can drive: the go-kart, built in code (kart.js), and a few trucks from the library,
// loaded as models.js loads anything placed, so drive.js drives them as it does in the
// construction app.

const KART = {
	id: 'go-kart',
	name: 'Go-kart',
	blurb: 'Quick, light, drifts',
	// Its tuning, as a library item gives it (see specFor in drive.js).
	drive: { topSpeed: 110, accel: 9, brake: 14, reverse: 25 },
};

// Friendlier names than the library's, and a word on each.
const NAMES = {
	'pickup-truck': { name: 'Pickup', blurb: 'All-rounder' },
	'semi-tractor-w900': { name: 'Semi truck', blurb: 'Long nose, big rig' },
	'haul-truck-hd465': { name: 'Haul truck', blurb: 'Huge, slow, unstoppable' },
};

// [ { id, name, blurb, thumb, credit, item } ]: the kart, then whichever of the library's
// vehicles the site has (the build publishes just those, see vite.drive.config.js).
export async function loadVehicles() {

	let library = [];
	try {

		const res = await fetch( new URL( 'library/library.json', document.baseURI ) );
		if ( res.ok ) library = await res.json();

	} catch {

		// The kart still works.

	}

	const trucks = LIBRARY_VEHICLES.map( id => library.find( item => item.id === id ) ).filter( Boolean ).map( item => ( {
		id: item.id,
		...NAMES[ item.id ],
		thumb: item.thumb ? new URL( `library/${ item.thumb }`, document.baseURI ).href : null,
		credit: item.source ?? null,
		topSpeed: specFor( item ).topSpeed,
		item,
	} ) );
	return [ { ...KART, thumb: null, credit: null, topSpeed: KART.drive.topSpeed, item: KART }, ...trucks ];

}

// Load `vehicle` into `models` at east, north (m from the place) and heading, its wheels on the
// ground. Resolves to its entry.
export function loadVehicle( models, vehicle, { east = 0, north = 0, heading = 0 } = {} ) {

	const placement = { name: vehicle.name, east, north, heading, up: null };
	if ( vehicle.id === KART.id ) {

		// Built rather than loaded: a loader that hands over a new kart.
		const loader = { loadAsync: async () => ( { scene: makeKart() } ) };
		return models.load( { ...placement, url: 'go-kart', library: KART.id }, 'go-kart', loader );

	}

	return models.load( itemConfig( vehicle.item, placement ) );

}

// The tuning drive.js drives it with.
export function specOf( vehicle ) {

	return specFor( vehicle.item );

}
