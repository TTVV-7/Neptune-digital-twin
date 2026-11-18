// Where to drive on Mars (body.js, worlds.js): its start spots on the globe's panel, and the named
// places its search finds (no map service knows Mars, so they're all here). Each is a place as
// places.js has them, with world: 'mars'. Latitudes are planetocentric, north positive, and
// longitudes east positive, -180 to 180, as the IAU's coordinates for Mars have them (so 226.2° E is
// -133.8 here); craters and mountains by their middles (the USGS's Gazetteer of Planetary
// Nomenclature), the landing sites where the landers came down (NASA's). Ids all start "mars-", so
// none is ever taken for one of the Earth's or the Moon's spots.

import { MARS } from './worlds.js';

const mars = ( id, name, region, lat, lon, extra = {} ) => ( { id: `mars-${ id }`, name, region, lat, lon, world: MARS, ...extra } );

// The panel's dozen: the great volcano and the great canyon, the rovers' and landers' sites, the
// deepest basin and the north polar cap.
export const MARS_SPOTS = [
	mars( 'olympus-mons', 'Olympus Mons', 'The tallest volcano known', 18.65, - 133.8 ),
	mars( 'valles-marineris', 'Valles Marineris', 'Coprates Chasma · the great canyon', - 13.4, - 61.4, { also: [ 'Coprates Chasma', 'Mariner Valley' ] } ),
	mars( 'curiosity', 'Bradbury Landing', 'Curiosity, 2012 · Gale crater', - 4.5895, 137.4417, { also: [ 'Curiosity', 'Gale crater', 'Mars Science Laboratory' ] } ),
	mars( 'mount-sharp', 'Mount Sharp', 'Aeolis Mons · in Gale crater', - 5.08, 137.85, { also: [ 'Aeolis Mons' ] } ),
	mars( 'perseverance', 'Jezero crater', 'Perseverance, 2021', 18.4447, 77.4508, { also: [ 'Perseverance', 'Octavia E. Butler Landing', 'Ingenuity' ] } ),
	mars( 'hellas', 'Hellas Planitia', 'The deepest basin', - 42.4, 70.5, { also: [ 'Hellas basin' ] } ),
	mars( 'viking-1', 'Chryse Planitia', 'Viking 1, 1976 · the first landing', 22.27, - 47.95, { also: [ 'Viking 1', 'Thomas Mutch Memorial Station' ] } ),
	mars( 'opportunity', 'Meridiani Planum', 'Opportunity, 2004', - 1.9462, - 5.5266, { also: [ 'Opportunity', 'Eagle crater', 'Challenger Memorial Station' ] } ),
	mars( 'spirit', 'Gusev crater', 'Spirit, 2004', - 14.5684, 175.4726, { also: [ 'Spirit', 'Columbia Memorial Station' ] } ),
	mars( 'noctis-labyrinthus', 'Noctis Labyrinthus', 'The labyrinth of the night', - 7.0, - 102.2 ),
	mars( 'arsia-mons', 'Arsia Mons', 'A Tharsis volcano', - 8.35, - 120.09 ),
	mars( 'north-pole', 'Planum Boreum', 'The north polar cap', 87.32, 54.96, { also: [ 'North pole', 'North polar cap' ] } ),
];

// What the search finds, besides the spots: the other landers, volcanoes, basins and plains,
// canyons, craters and regions. `also`: other names it's found by (a lander's mission).
export const MARS_PLACES = [
	...MARS_SPOTS,
	mars( 'viking-2', 'Viking 2 site', 'Utopia Planitia, 1976', 47.64, 134.29, { also: [ 'Viking 2', 'Gerald Soffen Memorial Station' ] } ),
	mars( 'pathfinder', 'Ares Vallis', 'Mars Pathfinder, 1997', 19.13, - 33.22, { also: [ 'Pathfinder', 'Sojourner', 'Carl Sagan Memorial Station' ] } ),
	mars( 'phoenix', 'Phoenix landing site', 'Phoenix, 2008 · Green Valley', 68.22, - 125.75, { also: [ 'Phoenix' ] } ),
	mars( 'insight', 'Elysium Planitia', 'InSight, 2018', 4.5024, 135.6234, { also: [ 'InSight' ] } ),
	mars( 'zhurong', 'Zhurong landing site', 'Tianwen-1, 2021 · Utopia Planitia', 25.066, 109.925, { also: [ 'Zhurong', 'Tianwen-1' ] } ),
	mars( 'pavonis-mons', 'Pavonis Mons', 'The middle Tharsis volcano', 1.48, - 112.96 ),
	mars( 'ascraeus-mons', 'Ascraeus Mons', 'The northern Tharsis volcano', 11.92, - 104.08 ),
	mars( 'elysium-mons', 'Elysium Mons', 'Elysium\'s great volcano', 24.8, 146.9 ),
	mars( 'alba-mons', 'Alba Mons', 'The widest volcano', 40.47, - 109.04 ),
	mars( 'tharsis', 'Tharsis', 'The volcanic uplands', 0, - 100 ),
	mars( 'candor-chasma', 'Candor Chasma', 'Valles Marineris', - 6.53, - 70.78 ),
	mars( 'melas-chasma', 'Melas Chasma', 'Valles Marineris', - 10.4, - 72.7 ),
	mars( 'ophir-chasma', 'Ophir Chasma', 'Valles Marineris', - 4.0, - 72.5 ),
	mars( 'kasei-valles', 'Kasei Valles', 'Great outflow channels', 24.6, - 65.0 ),
	mars( 'argyre', 'Argyre Planitia', 'A great southern basin', - 49.7, - 43.4, { also: [ 'Argyre basin' ] } ),
	mars( 'isidis', 'Isidis Planitia', 'A great basin', 12.9, 87.0, { also: [ 'Isidis basin' ] } ),
	mars( 'utopia', 'Utopia Planitia', 'The largest basin', 46.7, 117.5 ),
	mars( 'acidalia', 'Acidalia Planitia', 'Northern plains', 49.76, - 20.31 ),
	mars( 'amazonis', 'Amazonis Planitia', 'Northern plains', 24.8, - 163.6 ),
	mars( 'huygens', 'Huygens crater', 'A great crater', - 13.88, 55.58 ),
	mars( 'schiaparelli', 'Schiaparelli crater', 'A great crater', - 2.71, 16.77 ),
	mars( 'korolev', 'Korolev crater', 'Filled with ice', 72.77, 164.58 ),
	mars( 'arabia-terra', 'Arabia Terra', 'Old cratered uplands', 21.0, 6.0 ),
	mars( 'syrtis-major', 'Syrtis Major Planum', 'A dark volcanic plain', 7.9, 68.4, { also: [ 'Syrtis Major' ] } ),
	mars( 'south-pole', 'Planum Australe', 'The south polar cap', - 83.9, 160.0, { also: [ 'South pole', 'South polar cap' ] } ),
];
