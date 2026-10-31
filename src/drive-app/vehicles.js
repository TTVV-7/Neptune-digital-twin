import { itemConfig } from '../library.js';
import { specFor } from '../drive.js';
import { makeKart } from '../kart.js';
import { loadCars } from './cars.js';
import { LIBRARY_VEHICLES } from './catalog.js';
import { applyLook, fxOf, lookFor } from './paint.js';
import { isPro } from './pro.js';
import { PRO_RIDES } from './rides/index.js';

// What you can drive: the go-kart, built in code (kart.js), a few trucks from the library, loaded
// as models.js loads anything placed, so drive.js drives them as it does in the construction app,
// then World Drive's own cars (cars.js: models from Sketchfab whose wheels turn, one free and the
// rest with the pass), and after them the Supporter Pass's rides (rides/), built in code. What
// needs the pass is locked without it (`pro`, see pro.js). Each wears its look from the Garage
// (paint.js).

const KART = {
	id: 'go-kart',
	name: 'Go-kart',
	blurb: 'Quick, light, drifts',
	colour: 'blaze',
	build: makeKart,
	// Its tuning, as a library item gives it (see specFor in drive.js).
	drive: { topSpeed: 110, accel: 9, brake: 14, reverse: 25 },
};

// Friendlier names than the library's, and a word on each.
const NAMES = {
	'pickup-truck': { name: 'Pickup', blurb: 'All-rounder' },
};

// [ { id, name, blurb, thumb, credit, item } ]: the kart, then whichever of the library's
// vehicles the site has (the build publishes just those, see vite.drive.config.js), then the cars
// (free first; the rest pro, as the pass's rides, which come last with an icon for a thumb).
export async function loadVehicles() {

	let library = [];
	const cars = loadCars();
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
	const built = ride => ( { ...ride, thumb: null, credit: null, topSpeed: ride.drive.topSpeed, item: ride } );
	return [ built( KART ), ...trucks, ...await cars, ...PRO_RIDES.map( built ) ];

}

// Load `vehicle` into `models` at east, north (m from the place) and heading, its wheels on the
// ground, in its look from the Garage. Resolves to its entry.
export async function loadVehicle( models, vehicle, { east = 0, north = 0, heading = 0 } = {} ) {

	const placement = { name: vehicle.name, east, north, heading, up: null };
	let entry;
	if ( vehicle.build || vehicle.load ) {

		// Built (a ride) or made ready to drive (a car) rather than loaded as it is: a loader that
		// hands over a new one.
		const loader = { loadAsync: async () => ( { scene: vehicle.build ? vehicle.build() : await vehicle.load( models.loader ) } ) };
		entry = await models.load( { ...placement, url: vehicle.id, library: vehicle.id }, vehicle.id, loader );

	} else entry = await models.load( itemConfig( vehicle.item, placement ) );

	applyLook( entry.pivot, lookOf( vehicle ), vehicle );
	return entry;

}

// The look it's driven in: the Garage's choices for it, those that need the pass only with it.
export function lookOf( vehicle ) {

	return lookFor( vehicle, isPro() );

}

// The tuning drive.js drives it with, and its flame and trail.
export function specOf( vehicle ) {

	return { ...specFor( vehicle.item ), fx: fxOf( lookOf( vehicle ) ) };

}
