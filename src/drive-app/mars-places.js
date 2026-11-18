// Where to drive on Mars (body.js, worlds.js): its start spots on the globe's panel, and the named
// places its search finds (no map service knows Mars, so they're all here). Each is a place as
// places.js has them, with world: 'mars'. Latitudes are planetocentric, north positive, and
// longitudes east positive, -180 to 180, as the IAU's coordinates for Mars have them (so 226.2° E is
// -133.8 here); craters and mountains by their middles (the USGS's Gazetteer of Planetary
// Nomenclature), the landing sites where the landers came down (NASA's). Ids all start "mars-", so
// none is ever taken for one of the Earth's or the Moon's spots.

import { MARS } from './worlds.js';

const mars = ( id, name, region, lat, lon, extra = {} ) => ( { id: `mars-${ id }`, name, region, lat, lon, world: MARS, ...extra } );

// The panel's dozen: the great volcano, the great canyon, the rovers' and landers' sites, the
// deepest basin, a maze of canyons, another volcano's caldera and a crater full of ice. Olympus Mons
// starts on its summit caldera's floor (the volcano's middle, by the Gazetteer, is down its western
// flank), Valles Marineris on Coprates Chasma's floor, both walls in reach.
export const MARS_SPOTS = [
	mars( 'olympus-mons', 'Olympus Mons', 'The summit caldera · 18 km up', 18.3, - 133.0, { also: [ 'Nix Olympica' ] } ),
	mars( 'valles-marineris', 'Valles Marineris', 'Coprates Chasma · the great canyon', - 13.37, - 60.74, { also: [ 'Coprates Chasma', 'Mariner Valley' ] } ),
	mars( 'curiosity', 'Bradbury Landing', 'Curiosity, 2012 · Gale crater', - 4.5895, 137.4417, { also: [ 'Curiosity', 'Mars Science Laboratory' ] } ),
	mars( 'mount-sharp', 'Mount Sharp', 'Aeolis Mons · 5 km high, in Gale crater', - 5.08, 137.85, { also: [ 'Aeolis Mons' ] } ),
	mars( 'perseverance', 'Jezero crater', 'Perseverance, 2021 · an old lake', 18.4447, 77.4508, { also: [ 'Perseverance', 'Octavia E. Butler Landing', 'Ingenuity', 'Mars 2020' ] } ),
	mars( 'hellas', 'Hellas Planitia', 'The deepest basin, 2,300 km across', - 42.43, 70.5, { also: [ 'Hellas basin' ] } ),
	mars( 'viking-1', 'Chryse Planitia', 'Viking 1, 1976 · the first landing', 22.273, - 47.946, { also: [ 'Viking 1', 'Thomas Mutch Memorial Station' ] } ),
	mars( 'opportunity', 'Meridiani Planum', 'Opportunity, 2004', - 1.9462, - 5.5266, { also: [ 'Opportunity', 'Eagle crater', 'Challenger Memorial Station' ] } ),
	mars( 'spirit', 'Gusev crater', 'Spirit, 2004', - 14.5692, 175.4729, { also: [ 'Spirit', 'Columbia Memorial Station' ] } ),
	mars( 'noctis-labyrinthus', 'Noctis Labyrinthus', 'The labyrinth of the night', - 6.36, - 101.19, { also: [ 'Labyrinth of the Night' ] } ),
	mars( 'arsia-mons', 'Arsia Mons', 'A Tharsis volcano\'s caldera', - 8.26, - 120.09 ),
	mars( 'korolev', 'Korolev crater', '82 km across, filled with ice', 72.77, 164.58 ),
];

// What the search finds, besides the spots: the other landers, volcanoes, basins and plains,
// canyons, craters and regions, and the highest and lowest places. `also`: other names it's found
// by (a lander's mission).
export const MARS_PLACES = [
	...MARS_SPOTS,
	mars( 'viking-2', 'Viking 2 site', 'Utopia Planitia, 1976', 47.673, 134.3, { also: [ 'Viking 2', 'Gerald Soffen Memorial Station' ] } ),
	mars( 'pathfinder', 'Ares Vallis', 'Mars Pathfinder and Sojourner, 1997', 19.086, - 33.237, { also: [ 'Pathfinder', 'Sojourner', 'Carl Sagan Memorial Station' ] } ),
	mars( 'phoenix', 'Phoenix site', '2008 · the arctic plains', 68.2188, - 125.7492, { also: [ 'Phoenix' ] } ),
	mars( 'insight', 'InSight site', '2018 · Elysium Planitia', 4.5024, 135.6234, { also: [ 'InSight' ] } ),
	mars( 'zhurong', 'Zhurong site', 'Tianwen-1, 2021 · Utopia Planitia', 25.066, 109.925, { also: [ 'Zhurong', 'Tianwen-1' ] } ),
	mars( 'beagle-2', 'Beagle 2', '2003 · Isidis Planitia', 11.53, 90.43 ),
	mars( 'olympus-summit', 'Olympus Mons summit', 'The highest place on Mars, 21 km up', 17.34, - 133.03, { also: [ 'Highest point' ] } ),
	mars( 'badwater', 'Badwater crater', 'The lowest place on Mars, 8 km down', - 32.79, 62.14, { also: [ 'Lowest point' ] } ),
	mars( 'pavonis-mons', 'Pavonis Mons', 'The middle Tharsis volcano', 1.48, - 112.96 ),
	mars( 'ascraeus-mons', 'Ascraeus Mons', 'The northern Tharsis volcano', 11.92, - 104.08 ),
	mars( 'tharsis-montes', 'Tharsis Montes', 'Three volcanoes in a row', 1.57, - 112.58, { also: [ 'Tharsis' ] } ),
	mars( 'elysium-mons', 'Elysium Mons', 'Elysium\'s great volcano', 25.02, 147.21 ),
	mars( 'alba-mons', 'Alba Mons', 'A broad, low volcano', 41.08, - 110.71, { also: [ 'Alba Patera' ] } ),
	mars( 'apollinaris-mons', 'Apollinaris Mons', 'A lone volcano north of Gusev', - 9.17, 174.79 ),
	mars( 'tharsis-tholus', 'Tharsis Tholus', 'A smaller Tharsis volcano', 13.35, - 90.8 ),
	mars( 'melas-chasma', 'Melas Chasma', 'Valles Marineris · its deepest part', - 10.52, - 72.54 ),
	mars( 'ophir-chasma', 'Ophir Chasma', 'Valles Marineris · the northern trough', - 4.0, - 72.35 ),
	mars( 'candor-chasma', 'Candor Chasma', 'Valles Marineris', - 6.53, - 70.78 ),
	mars( 'ius-chasma', 'Ius Chasma', 'Valles Marineris · the western trough', - 7.29, - 84.39 ),
	mars( 'kasei-valles', 'Kasei Valles', 'A giant flood channel', 25.14, - 62.88 ),
	mars( 'maadim-vallis', 'Ma\'adim Vallis', 'A valley 900 km long', - 21.98, 177.5 ),
	mars( 'argyre', 'Argyre Planitia', 'A great basin, 890 km across', - 49.84, - 43.31, { also: [ 'Argyre basin' ] } ),
	mars( 'isidis', 'Isidis Planitia', 'A basin 1,200 km across', 13.94, 88.38, { also: [ 'Isidis basin' ] } ),
	mars( 'utopia', 'Utopia Planitia', 'The great northern plain', 46.74, 117.52 ),
	mars( 'acidalia', 'Acidalia Planitia', 'The northern plains', 49.76, - 20.74 ),
	mars( 'amazonis', 'Amazonis Planitia', 'Smooth plains west of Olympus Mons', 25.75, - 162.91 ),
	mars( 'arcadia', 'Arcadia Planitia', 'The northern plains', 49.02, - 171.85 ),
	mars( 'elysium-planitia', 'Elysium Planitia', 'InSight\'s plain', 2.98, 154.74 ),
	mars( 'gale', 'Gale crater', '154 km across · Curiosity\'s crater', - 5.37, 137.81 ),
	mars( 'huygens', 'Huygens crater', '467 km across', - 13.9, 55.6 ),
	mars( 'schiaparelli', 'Schiaparelli crater', '459 km across', - 2.71, 16.77 ),
	mars( 'cassini', 'Cassini crater', '408 km across', 23.35, 32.11 ),
	mars( 'herschel', 'Herschel crater', '298 km across', - 14.5, 129.9 ),
	mars( 'holden', 'Holden crater', '153 km across', - 26.04, - 34.02 ),
	mars( 'eberswalde', 'Eberswalde crater', 'Beside Holden', - 23.98, - 33.3 ),
	mars( 'lomonosov', 'Lomonosov crater', 'In the northern plains', 65.04, - 9.24 ),
	mars( 'endeavour', 'Endeavour crater', '22 km across · explored by Opportunity', - 2.28, - 5.2 ),
	mars( 'ptolemaeus', 'Ptolemaeus crater', 'Mars 3, 1971', - 45.86, - 157.6, { also: [ 'Mars 3' ] } ),
	mars( 'arabia-terra', 'Arabia Terra', 'Old cratered highlands', 21.25, 5.72 ),
	mars( 'syrtis-major', 'Syrtis Major Planum', 'A dark volcanic plateau', 9.2, 67.1, { also: [ 'Syrtis Major' ] } ),
	mars( 'noachis-terra', 'Noachis Terra', 'The old southern highlands', - 50.41, 5.16 ),
	mars( 'north-pole', 'Planum Boreum', 'The north polar cap', 87.32, 54.96, { also: [ 'North pole', 'North polar cap' ] } ),
	mars( 'south-pole', 'Planum Australe', 'The south polar cap', - 83.35, 157.7, { also: [ 'South pole', 'South polar cap' ] } ),
];
