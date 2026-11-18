// The worlds World Drive drives (docs/world-drive.md, "Worlds"): the Earth, on Google's tiles, and the
// worlds made in the page from NASA's maps (body.js): the Moon and Mars. Plain data and small
// functions, with no imports, so the page, its first script (boot.js), the Worker, the site's build
// and the tests all share the one list: which worlds there are, what each is called, its size, its
// gravity, its files, and how its ground is made up below what its heights show (body-height.js).
//
// A world's id is short (five letters at most: a drop-in's cell is "<world>:<row>:<column>") and
// never changes; nor does its radius once anything's been counted on it (dropin-cells.js's grid and
// the challenges' places are on a sphere of it). Every world but the Earth is free: its ground is
// our own files, so it costs nothing to stream and a visit there is never limited (worker/drive/
// index.js). A place on one carries `world`, its id; the Earth's carry none (worldOf).

export const EARTH = 'earth';
export const MOON = 'moon';
export const MARS = 'mars';

// The Moon's made-up ground (body-height.js): craters of thirteen sizes, from 12.8 km across down to
// 3 m, as many of each as the Moon has, most old and worn, a few fresh and bright; and four layers of
// gentle rolling ground. These numbers are the Moon's ground as it has always been: changing any of
// them moves every height on it (and so the Worker's checks of its challenges' routes).
const MOON_GROUND = {
	// The craters' cubes (m), largest first, and the share of them holding a crater.
	cells: [ 32000, 16000, 8000, 4000, 2000, 1000, 500, 250, 125, 62.5, 31.25, 15.625, 7.8125 ],
	presence: [ 0.3, 0.4, 0.5, 0.65, 0.75, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8 ],
	// How fresh a crater is: fresh = a + b × u^p of an even u, so most are old.
	fresh: [ 0.2, 0.8, 2 ],
	// The fresh ones (fresher than `above`) are brighter (`by` > 0) or darker inside and out.
	bright: { above: 0.5, by: 0.7 },
	// A bowl `small` as deep as it's wide, `large` from `across` m across; a rim `lip` as high; big
	// ones' floors flat from `floor.across` m across.
	depth: { small: 0.19, large: 0.11, across: 3000 },
	lip: 0.034,
	floor: { across: 600, depth: - 0.7 },
	// The rolling ground: [ wavelength, height ] (m), finest last.
	rolls: [ [ 900, 9 ], [ 260, 2.2 ], [ 70, 0.45 ], [ 18, 0.08 ] ],
	// Which made-up ground this is: the cubes' turns and the hashes' salts (0 is the Moon's).
	seed: 0,
};

// Mars's: fewer small craters than the Moon's (its air stops the smallest bodies, and wind and dust
// fill and wear the rest), most of them old and soft, the fresh ones darker than their ground (they
// blast away the bright dust); shallower bowls, flat floors from smaller sizes (its gravity is more
// than twice the Moon's); and rougher rolling ground, wind-worn.
const MARS_GROUND = {
	cells: MOON_GROUND.cells,
	presence: [ 0.25, 0.3, 0.35, 0.4, 0.4, 0.36, 0.32, 0.28, 0.24, 0.2, 0.16, 0.12, 0.08 ],
	fresh: [ 0.12, 0.6, 2.5 ],
	bright: { above: 0.55, by: - 0.45 },
	depth: { small: 0.17, large: 0.08, across: 1500 },
	lip: 0.03,
	floor: { across: 300, depth: - 0.65 },
	rolls: [ [ 1500, 16 ], [ 420, 4 ], [ 95, 0.8 ], [ 22, 0.16 ] ],
	seed: 1,
};

// Each world: its id; its name (as a heading, "Mars"), in a sentence ("the Moon", "Mars"); its
// radius (m: the sphere its heights are over); whether it's free (never limited); the prefix of its
// start spots' ids (places.js); its gravity (a share of the Earth's 9.81 m/s²); its heights (Int16
// metres over the sphere, `columns` × `rows` from 90° N and 180° W, each the middle of its cell);
// its picture (the whole world, 2:1, from 180° W); the heights its ground can be at (m, made-up
// craters in); its credit; its made-up ground; and where its globe first looks.
export const WORLDS = {
	earth: {
		id: EARTH,
		name: 'Earth',
		the: 'the Earth',
		radius: 6371008.8,
		free: false,
	},
	moon: {
		id: MOON,
		name: 'Moon',
		the: 'the Moon',
		radius: 1737400,
		free: true,
		prefix: 'moon-',
		gravity: 1.62 / 9.81,
		heights: { url: '/moon/height.bin', columns: 1440, rows: 720 },
		picture: '/moon/colour.webp',
		lowest: - 12000,
		highest: 12000,
		credit: 'Moon: NASA LRO (LROC, LOLA)',
		ground: MOON_GROUND,
		// By the Apollo sites, on the side facing the Earth.
		first: { lat: 12, lon: 18 },
	},
	mars: {
		id: MARS,
		name: 'Mars',
		the: 'Mars',
		// Mars's mean radius: its heights are over the areoid (its "sea level"), laid on this sphere.
		radius: 3389500,
		free: true,
		prefix: 'mars-',
		gravity: 3.71 / 9.81,
		heights: { url: '/mars/height.bin', columns: 2880, rows: 1440 },
		picture: '/mars/colour.webp',
		// Hellas's floor is 8.2 km under the areoid, Olympus Mons 21.2 km over it.
		lowest: - 9500,
		highest: 22500,
		credit: 'Mars: NASA MGS MOLA, Viking (USGS)',
		ground: MARS_GROUND,
		// Over Valles Marineris, with the Tharsis volcanoes to the west.
		first: { lat: - 5, lon: - 80 },
	},
};

export const WORLD_IDS = Object.keys( WORLDS );
// The worlds made in the page, the free ones.
export const OFF_EARTH = WORLD_IDS.filter( id => id !== EARTH );
// Where a visit with no Earth drive left opens (boot.js).
export const FALLBACK = MOON;

export function isWorld( id ) {

	return typeof id === 'string' && Object.hasOwn( WORLDS, id );

}

// Which world a place is on: its `world`, or the Earth for a place with none (the Earth's places
// carry none); null for a world that isn't one of these.
export function worldOf( place ) {

	const world = place?.world;
	if ( world === undefined || world === null || world === EARTH ) return EARTH;
	return isWorld( world ) ? world : null;

}

// The world whose start spots' ids begin like `id` ("moon-tycho", "mars-gale"), or null.
export function spotWorld( id ) {

	if ( typeof id !== 'string' ) return null;
	return OFF_EARTH.find( world => id.startsWith( WORLDS[ world ].prefix ) ) ?? null;

}

// "on the Moon", "on Mars"; "On the Moon", "On Mars".
export function onWorld( id ) {

	return `on ${ WORLDS[ id ].the }`;

}

export function OnWorld( id ) {

	const words = onWorld( id );
	return words[ 0 ].toUpperCase() + words.slice( 1 );

}

// "the Moon", "Mars", with a capital first letter: "The Moon", "Mars".
export function TheWorld( id ) {

	const words = WORLDS[ id ].the;
	return words[ 0 ].toUpperCase() + words.slice( 1 );

}
