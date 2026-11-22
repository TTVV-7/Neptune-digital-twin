// Which loads open on the orrery, and the address that goes to the Earth from one that did
// (docs/world-drive.md, "The orrery", "Opening it"). Plain functions and the two small things kept in
// the browser, with no imports, so the page's first script (boot.js), the orrery (orrery.js) and the
// tests (scripts/test-drive-orrery-first.mjs, in node) share them.
//
// A plain load opens on the orrery, the Sun's family, to pick a world from: the Earth isn't the one
// everyone drives first just because it's the one the page used to start on. Such a load spends none
// of the day's Earth drives (each costs a little in Google's 3D tiles): it asks the Worker for a free
// visit, and picking the Earth reloads the page at an Earth address (earthUrl), which asks for the
// Earth's visit then. So the Earth's visits count only people who chose the Earth.

// What, in the address, says the page was opened for something else than picking a world, so it goes
// there instead: a place (spot, at), a challenge (challenge, vs), a party to join, and the way back from
// paying for the Supporter Pass (supporter=thanks: they've just paid for Earth drives, and its toast
// mustn't land under a modal).
const NOT_FIRST = [ 'spot', 'at', 'challenge', 'vs', 'party', 'supporter' ];
// Whether a plain load opens on the orrery at all. It did from 2026-11-20 till 2026-11-22, when the
// owner had it open on the Earth's globe again, as it used to (a free visit: the globe's, which
// spends none of the day's Earth drives; one is asked for when it first drives on the Earth). The
// orrery is a tap away (the panel's Worlds), and ?worlds=1 still opens it. True opens on it again.
export const ORRERY_FIRST = false;
// What earthUrl takes out of the address before putting its own target in: a place's link (places.js's
// LINK_PARAMS) and a challenge's.
const TARGET_PARAMS = [ 'spot', 'at', 'name', 'region', 'heading', 'world', 'challenge', 'vs' ];
// A challenge link's own path (challenge-rules.js's LINK_PATH, /c), with or without more after it.
const CHALLENGE_PATH = /^\/c(\/|$)/;

// Whether a load opens on the orrery: `search`, the address's ?query, and `path` its path. Not for
// anything NOT_FIRST names, nor a challenge link's path, nor ?worlds=1 (which opens it all the same,
// over an Earth visit, as it always has: main.js) or ?worlds=0 (today's Earth, no orrery: the address
// every Earth reload goes to). On the dev server (`dev`) a test's browser (`webdriver`, which the page
// reads only there) gets the plain Earth load as before, so the tests written for it go on as they
// were, unless its seam (window.worldDriveOrreryTest) asks for this, { first: true }.
export function orreryFirstFor( search = '', { path = '/', dev = false, webdriver = false, seam = null } = {} ) {

	const params = new URLSearchParams( search );
	if ( NOT_FIRST.some( name => params.has( name ) ) ) return false;
	if ( CHALLENGE_PATH.test( path ) ) return false;
	const worlds = params.get( 'worlds' );
	if ( worlds === '0' || worlds === '1' ) return false;
	// (A test's browser on the dev server: as its seam asks, whatever ORRERY_FIRST says, so the
	// orrery-first load stays tested for the day it's switched on again.)
	if ( dev && webdriver ) return seam?.first === true;
	return ORRERY_FIRST;

}

// The address that goes to the Earth from this page (`href`), as a path and query: one that asks for
// the Earth's visit as it loads, never the orrery again. `target`:
// - null: this page as it is, the Earth asked for again (a supporter's pass come: boot.js's usedUp),
// - {}: this page without its link (a place's, a challenge's), at / (the Earth button on a page opened
//   on another world's link: boot.js's toEarth),
// - { spot }: an Earth start spot's id, which the page flies to and pins (one picked on the orrery's
//   Earth sheet),
// - { at: { lat, lon, name, region, heading } }: any other place on the Earth, the same way (an Earth
//   driver picked in "who's driving"); with a spot too, as a fallback for an id that isn't one,
// - { challenge, vs }: a challenge's id (and a friend's handle, for their ghost), whose card opens there.
// Anything else in the address (?party=, ?pro=1) stays. ?worlds=0 is added only when nothing in it
// already keeps the orrery shut, so a link to a spot stays the link it would be anyway.
export function earthUrl( target = null, href = 'https://worlddrive.app/' ) {

	const url = new URL( href );
	url.searchParams.delete( 'worlds' );
	if ( target ) {

		url.pathname = '/';
		for ( const name of TARGET_PARAMS ) url.searchParams.delete( name );
		const { spot, at, challenge, vs } = target;
		if ( typeof spot === 'string' && spot ) url.searchParams.set( 'spot', spot );
		// (With a spot too, where it is as well: places.js's linkedPlace takes a spot it knows first,
		// and an id it doesn't know falls back to this rather than to nothing.)
		if ( at && Number.isFinite( at.lat ) && Number.isFinite( at.lon ) ) {

			url.searchParams.set( 'at', `${ +at.lat.toFixed( 6 ) },${ +at.lon.toFixed( 6 ) }` );
			if ( at.name ) url.searchParams.set( 'name', String( at.name ) );
			if ( at.region ) url.searchParams.set( 'region', String( at.region ) );
			if ( Number.isFinite( at.heading ) ) url.searchParams.set( 'heading', String( Math.round( at.heading ) ) );

		}

		if ( Number.isSafeInteger( Number( challenge ) ) && Number( challenge ) > 0 ) {

			url.searchParams.set( 'challenge', String( Number( challenge ) ) );
			if ( typeof vs === 'string' && vs ) url.searchParams.set( 'vs', vs );

		}

	}

	if ( orreryFirstFor( url.search, { path: url.pathname } ) ) url.searchParams.set( 'worlds', '0' );
	return url.pathname + url.search;

}

// What goes to the Earth for something picked on a page with the Earth a reload away (main.js's
// setWorld( EARTH, { at } ), passed on as onEarth( at )): a place (an Earth start spot, by its id;
// anything else by where it is) or a challenge ({ challenge, vs }, challenges.js), as earthUrl takes it;
// {} for nothing in particular.
export function earthTarget( picked ) {

	if ( ! picked || typeof picked !== 'object' ) return {};
	if ( picked.challenge != null ) return { challenge: picked.challenge, vs: picked.vs ?? null };
	// (A place on another world never comes here: only the Earth's are reloaded for.) A start spot
	// goes by its id; where it is goes too, should the id be some other kind of place's.
	const spot = typeof picked.id === 'string' && picked.id && ! picked.world ? picked.id : null;
	const at = Number.isFinite( picked.lat ) && Number.isFinite( picked.lon ) ? picked : null;
	return { ...( spot ? { spot } : {} ), ...( at ? { at } : {} ) };

}

// --- kept in the browser (each read and write in a try, the page working without them) ---

// The world last picked on the orrery (orrery.js writes it on each Drive): the next plain load's
// orrery opens with its sheet up and Drive in focus, so a returning player is one tap or Enter from
// where they were, with the whole Solar System still the first thing they see.
export const LAST_WORLD = 'world-drive.last-world';
// The UTC day an Earth visit was last turned away as used up (boot.js), cleared by any Earth visit that
// gets in: only for the orrery's Earth sheet to say it may be, since Drive there still reloads and the
// Worker decides (a supporter, or a cap that's changed, gets in).
export const EARTH_USED_UP = 'world-drive.earth-used-up';

export const utcDay = ( now = Date.now() ) => new Date( now ).toISOString().slice( 0, 10 );

export function readStored( key, storage = globalThis.localStorage ) {

	try {

		return storage?.getItem( key ) ?? null;

	} catch {

		return null;

	}

}

export function writeStored( key, value, storage = globalThis.localStorage ) {

	try {

		if ( value === null ) storage?.removeItem( key );
		else storage?.setItem( key, value );

	} catch {

		// Without storage (a private window, site data blocked), nothing's remembered; no worse.

	}

}

// Whether today's Earth drive looks used up here (EARTH_USED_UP is today's date).
export function usedUpToday( storage = globalThis.localStorage, now = Date.now() ) {

	return readStored( EARTH_USED_UP, storage ) === utcDay( now );

}
