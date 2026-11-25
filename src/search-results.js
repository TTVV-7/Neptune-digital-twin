// What the pages make of /api/search's answer (worker/drive/search.js): Build's start-a-project
// (src/build-home/main.js), its Site button (src/product.js) and the game's globe
// (src/drive-app/panel.js).

// The places, houses and numbered addresses first (the Worker ranks them so too; an older cached
// answer may not have), otherwise in the order given.
export function rankedPlaces( body ) {

	const results = Array.isArray( body?.results ) ? body.results : [];
	return [ ...results.filter( r => r.house === true ), ...results.filter( r => r.house !== true ) ];

}

// The Worker found only the street for an address with a house number (streetOnly).
export const STREET_ONLY = 'Street only: the exact address wasn\'t found; pick it and move the site into place.';
export const STREET_ONLY_DRIVE = 'Street only: the exact address wasn\'t found; pick the street and drive along to it.';

export function streetOnly( body ) {

	return body?.streetOnly === true;

}

// Whose search answered, to credit it: Google's results "powered by Google", else OpenStreetMap's.
export function searchCredit( body ) {

	return body?.provider === 'google' ? 'Search powered by Google' : 'Search © OpenStreetMap contributors';

}
