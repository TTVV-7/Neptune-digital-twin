// The places of the worlds made in the page (worlds.js), each world's own (moon-places.js,
// mars-places.js): its start spots on the globe's panel, and the places its search finds, all in
// the page, since no map service knows them. Plain data and small functions: the Worker names drop-
// ins and picks challenges' places from these too.

import { MARS_PLACES, MARS_SPOTS } from './mars-places.js';
import { MOON_PLACES, MOON_SPOTS } from './moon-places.js';
import { searchIn } from './place-search.js';
import { spotWorld } from './worlds.js';

// Each world's start spots, and everything its search finds (the spots among them).
export const SPOTS_ON = { moon: MOON_SPOTS, mars: MARS_SPOTS };
export const PLACES_ON = { moon: MOON_PLACES, mars: MARS_PLACES };

// The places on `world` whose name (or other name) has every word of `text` in it, best first
// (place-search.js). At most `most`.
export function searchWorld( world, text, most = 8 ) {

	return PLACES_ON[ world ] ? searchIn( PLACES_ON[ world ], text, most ) : [];

}

// A place of a world made in the page by its id ("moon-tycho", "mars-curiosity"), or null.
export function worldSpot( id ) {

	const world = spotWorld( id );
	return world ? PLACES_ON[ world ].find( place => place.id === id ) ?? null : null;

}
