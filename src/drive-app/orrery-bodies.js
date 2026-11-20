// What the orrery (orrery.js) shows: the Sun's family, out from it, each with where it's drawn and
// what its sheet says. Plain data, from the prototype's (docs/world-drive.md, "The orrery"). The
// worlds you can drive on carry the game's id (`world`), and take their names, radius and gravity
// from worlds.js, so there's one of each; the rest are here only.
//
// Orbits and sizes are squeezed so the whole family fits one screen (scene units, not to scale);
// distances from the Sun (AU), gravity, radius and the length of a day are the real ones. `ground`:
// 'drive' (a world in the game), 'later' (solid ground, not in the game yet) or 'none' (a giant, no
// ground). `start`: where along its orbit it is when the orrery opens (°). `spin`: how fast it turns,
// for show. A world's picture is under /orrery/ (scripts/make-orrery.mjs), Vesta's and Ceres's
// shapes too (`shape`: 360 × 180 heights, in their worlds.js `heights.step`); the giants are banded
// and Mercury and Venus a flat colour, drawn in the page.

import { WORLDS, WORLD_IDS, TheWorld } from './worlds.js';

export const EARTH_GRAVITY = 9.81;
// Where its files are.
export const ORRERY_FILES = '/orrery/';

const DRIVABLE = {
	earth: {
		orbit: 9.6, size: 0.62, au: 1, spin: 1, start: 60, day: '24 h',
		lede: 'Anywhere Google has photorealistic 3D: cities, mountain passes, coastlines. Pick a place and drop in.',
		credit: 'In the game: Google\'s photorealistic 3D tiles. Here: NASA Blue Marble (NASA Visible Earth).',
	},
	moon: {
		parent: 'earth', orbit: 1.25, size: 0.17, au: 1, spin: 0.04, start: 30, day: '29.5 days',
		lede: 'Every crater and mare, from NASA\'s Lunar Reconnaissance Orbiter. The Earth hangs in the sky where it really is.',
	},
	mars: {
		orbit: 12.6, size: 0.44, au: 1.52, spin: 0.97, start: 150, day: '24 h 37 min',
		lede: 'Olympus Mons, Valles Marineris and the rovers\' landing sites, from the Mars Global Surveyor\'s laser altimeter.',
	},
	vesta: {
		orbit: 15.4, size: 0.2, au: 2.36, spin: 4.5, start: 215, day: '5 h 20 min', belt: true, shape: true,
		lede: 'A lumpy protoplanet in the asteroid belt. Rheasilvia\'s central peak is one of the tallest mountains in the Solar System.',
	},
	ceres: {
		orbit: 17.4, size: 0.24, au: 2.77, spin: 2.6, start: 95, day: '9 h 4 min', belt: true, shape: true,
		lede: 'The biggest thing in the asteroid belt, a dwarf planet. Occator crater holds its famous bright spots of salt.',
	},
};

// The worlds you can drive on, in worlds.js's order (the radios' order).
const DRIVE = WORLD_IDS.map( id => {

	const world = WORLDS[ id ];
	const extra = DRIVABLE[ id ];
	return {
		...extra,
		id,
		world: id,
		ground: 'drive',
		name: world.name,
		heading: TheWorld( id ),
		gravity: ( world.gravity ?? 1 ) * EARTH_GRAVITY,
		radius: Math.round( world.radius / 1000 ),
		picture: `${ ORRERY_FILES }${ id }.webp`,
		shape: extra.shape ? { url: `${ ORRERY_FILES }${ id }-height.bin`, step: world.heights?.step ?? 1, radius: world.radius } : null,
		credit: extra.credit ?? world.credit.replace( /^[^:]*:\s*/, '' ),
	};

} );

const OTHERS = [
	{ id: 'mercury', name: 'Mercury', ground: 'later', orbit: 5, size: 0.32, colour: '#9a8f86', au: 0.39, start: 200, gravity: 3.7, radius: 2440, day: '176 days',
		lede: 'Solid rock, and NASA\'s MESSENGER mapped all of it. It isn\'t in World Drive yet.', credit: 'Would come from NASA MESSENGER (USGS).' },
	{ id: 'venus', name: 'Venus', ground: 'later', orbit: 7, size: 0.58, colour: '#d9b981', au: 0.72, start: 125, gravity: 8.87, radius: 6052, day: '117 days',
		lede: 'Solid ground under a crushing, cloudy sky. Magellan\'s radar mapped it, but only coarsely. It isn\'t in World Drive yet.', credit: 'Would come from NASA Magellan\'s radar.' },
	{ id: 'jupiter', name: 'Jupiter', ground: 'none', orbit: 22.5, size: 1.55, bands: [ '#c9b08f', '#e8d9bf', '#b98d63', '#efe3cc', '#a8774f', '#e2cfb0' ], au: 5.2, start: 40, gravity: 24.8, radius: 69911, day: '9 h 56 min',
		lede: 'A giant ball of gas. There\'s no ground to drive on, only deeper and denser cloud.' },
	{ id: 'saturn', name: 'Saturn', ground: 'none', orbit: 28.5, size: 1.3, bands: [ '#d8c49a', '#eadbb6', '#c7ad7f', '#f0e5c8', '#bfa273' ], rings: true, au: 9.54, start: 170, gravity: 10.4, radius: 58232, day: '10 h 33 min',
		lede: 'Gas all the way down, so nowhere to drive. The rings are ice and rock, in pieces from dust to house-sized.' },
	{ id: 'uranus', name: 'Uranus', ground: 'none', orbit: 33.5, size: 0.95, bands: [ '#a9dbe0', '#b8e3e6', '#9fd2d8' ], au: 19.2, start: 120, gravity: 8.87, radius: 25362, day: '17 h 14 min',
		lede: 'An ice giant: gas over a hot, slushy mantle. No ground to drive on.' },
	{ id: 'neptune', name: 'Neptune', ground: 'none', orbit: 38, size: 0.92, bands: [ '#3f63c9', '#5378d8', '#3456b8', '#4a6fd0' ], au: 30.1, start: 20, gravity: 11.15, radius: 24622, day: '16 h 6 min',
		lede: 'The windiest planet, and another ice giant. No ground to drive on.' },
].map( body => ( { heading: body.name, spin: 0.6, ...body } ) );

// Every body but the Sun, out from it (the Moon after the Earth); and the others' buttons' order.
export const BODIES = [ OTHERS[ 0 ], OTHERS[ 1 ], ...DRIVE, ...OTHERS.slice( 2 ) ];
export const DRIVE_BODIES = DRIVE;
export const OTHER_BODIES = OTHERS;
export const bodyById = Object.fromEntries( BODIES.map( body => [ body.id, body ] ) );

// The Sun, and the asteroid belt (between Mars and Jupiter: scene units, from the middle).
export const SUN = { size: 2.2, glow: 13 };
export const BELT = { inner: 14.6, depth: 4.2, count: 3200 };

// The world's icons, as the panel's Worlds button has them (drive/index.html).
export const ICONS = {
	earth: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M2 10h16M10 2c3 3 3 13 0 16M10 2c-3 3-3 13 0 16" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
	moon: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M13.5 3.2A7.5 7.5 0 1 0 16.8 14 6 6 0 0 1 13.5 3.2z" fill="currentColor"/></svg>',
	mars: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="7.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4.2 11.4c2.2-1.3 4.6-.4 6.6-1.3 1.6-.7 3-1.9 5-1.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="7" cy="6.6" r="1.3" fill="currentColor"/></svg>',
	vesta: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4.6 5.6C6.4 3.2 10.6 2.5 13.7 3.5c2.8.9 4.1 3.4 3.6 6.3-.5 2.9-2.3 5.9-5.6 6.5-3.6.7-7.6-.7-8.6-3.8-.7-2.1-.1-4.6 1.5-6.9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M6.8 13c1.8 1.4 4.6 1.5 6.4.1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8.4" cy="7.4" r="1.2" fill="currentColor"/></svg>',
	ceres: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="7.6" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12.4" cy="7.6" r="1.6" fill="currentColor"/><circle cx="14.6" cy="9.8" r=".8" fill="currentColor"/><path d="M5.2 11.8a3.4 3.4 0 0 0 4.4 1.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
};
