// Discoveries (docs/world-drive.md, "Discoveries"): real, named places on the Moon, Mars, Vesta and
// Ceres that a glowing beacon marks, to drive (or fly) to and collect, each with a card of true facts
// and its height in the very data the ground is built from. Called "Discoveries" on screen only: in
// the code they're `finds` everywhere, since "discoveries" already means a player's first drives in
// the Earth's areas and spots (levels.js's XP.area and XP.spot, the Worker's `discoveries` table).
//
// Plain data, importing only worlds.js, so the page (finds.js), the achievements' rules
// (achievement-rules.js, which the Worker shares) and the tests all read the one list. A find's id is
// its place's id in the world's *-places.js, which is where its name and where it is come from: never
// typed again here, so the two can't drift apart (scripts/test-drive-finds.mjs checks every id is a
// place). Its height isn't typed here either: scripts/make-finds.mjs measures it in the game's own
// height grid and writes finds-heights.js.
//
// The facts are kept to what can be traced, and each says where it's from (`source`; never shown):
// - 'site:<world>.js': the hand-checked pages of drive/site/<world>.js for that place, shortened but
//   not changed in meaning;
// - 'region': the place's own line in *-places.js;
// - otherwise a short name of the reference it was checked against ('NASA NSSDCA', 'IAU WGPSN
//   Gazetteer', 'MOLA MEGDR label': the line MOLA's data file itself gives its highest and lowest).
// Nothing else: where a fact couldn't be traced (a size the sources disagree on, a namesake not
// confirmed), it's left out rather than guessed. No sentence about how a world's features are named
// in general, since the rules have exceptions; each namesake is its own.
//
// Each find: id; world; kind (one of KINDS: the card's label and the icon); mission and year, for a
// landing site; relief, the radius (km) make-finds.mjs measures the lowest and highest ground within
// (null for none: a landing site on a plain, a basin far bigger than the grid can sum up in one ring);
// facts, one to three sentences of 160 characters at most; seeing ("What you're looking at"), for
// every landing site and anything smaller than the grid, what the map does and doesn't show of it
// ({grid} is the grid's spacing, filled in from worlds.js); and published, where a well-known figure
// for the same height sits beside the one measured here, { h (m), by (whose figure), source }, so the
// card can say why the two differ.

import { CERES, MARS, MOON, VESTA } from './worlds.js';

// The kinds, as the card and the book say them, and each one's icon.
export const KINDS = {
	landing: { label: 'Landing site', icon: '🚩' },
	crater: { label: 'Crater', icon: '🕳️' },
	basin: { label: 'Impact basin', icon: '🌀' },
	mountain: { label: 'Mountain', icon: '⛰️' },
	volcano: { label: 'Volcano', icon: '🌋' },
	canyon: { label: 'Canyon', icon: '🏞️' },
	plain: { label: 'Plateau', icon: '🗺️' },
	scarp: { label: 'Scarp', icon: '🧗' },
	trough: { label: 'Troughs', icon: '〰️' },
	bright: { label: 'Bright spot', icon: '✨' },
	highest: { label: 'Highest point', icon: '🔺' },
	lowest: { label: 'Lowest point', icon: '🔻' },
};

// A fact and where it's from.
const fact = ( text, source ) => ( { text, source } );

export const FINDS = [

	// --- the Moon: NASA LRO's laser altimeter (LOLA) heights, LROC's colour ---

	{
		id: 'moon-apollo-11', world: MOON, kind: 'landing', mission: 'Apollo 11', year: 1969, relief: null,
		facts: [
			fact( 'Neil Armstrong and Buzz Aldrin landed here on 20 July 1969, the first people to walk on the Moon.', 'site:moon.js' ),
			fact( 'Armstrong named the landing site Tranquility Base. Michael Collins stayed in orbit in Columbia.', 'site:moon.js' ),
		],
		seeing: 'The lander isn\'t in the map: this is the ground around it, the Moon\'s shape as LOLA measured it from orbit, {grid} apart. The small craters are made up.',
	},
	{
		id: 'moon-apollo-15', world: MOON, kind: 'landing', mission: 'Apollo 15', year: 1971, relief: null,
		facts: [
			fact( 'Apollo 15 landed here on 30 July 1971: the first mission to take the Lunar Roving Vehicle, the "Moon buggy".', 'site:moon.js' ),
			fact( 'Here David Scott dropped a hammer and a falcon\'s feather together; with no air, they hit the ground at the same moment.', 'site:moon.js' ),
		],
		seeing: 'Hadley Rille is narrower than the {grid} between the map\'s heights, so it isn\'t here: the plain and the Apennines are, softened, with no rover tracks.',
	},
	{
		id: 'moon-apollo-17', world: MOON, kind: 'landing', mission: 'Apollo 17', year: 1972, relief: null,
		facts: [
			fact( 'Apollo 17 landed here on 11 December 1972, the last of the Apollo landings.', 'site:moon.js' ),
			fact( 'Eugene Cernan and the geologist Harrison Schmitt stayed about three days, and Schmitt found orange soil: beads of volcanic glass.', 'site:moon.js' ),
		],
		seeing: 'The valley is narrow next to the {grid} between the map\'s heights, so its mountains are softened and it\'s shallower than it really is. No lander is in it.',
	},
	{
		id: 'moon-lunokhod-1', world: MOON, kind: 'landing', mission: 'Luna 17', year: 1970, relief: null,
		facts: [
			fact( 'The Soviet Luna 17 landed here in November 1970 and set down Lunokhod 1, the first rover to drive on another world.', 'NASA NSSDCA' ),
		],
		seeing: 'Neither the lander nor the rover is in the map: this is the plain of the Sea of Rains around them, from LOLA\'s heights {grid} apart.',
	},
	{
		id: 'moon-change-4', world: MOON, kind: 'landing', mission: 'Chang\'e 4', year: 2019, relief: null,
		facts: [
			fact( 'On 3 January 2019 China\'s Chang\'e 4 landed on the floor of Von Kármán, the first gentle landing on the far side, with the rover Yutu-2.', 'site:moon.js' ),
			fact( 'The far side never faces the Earth, so they talked to it through a relay satellite, Queqiao, out beyond the Moon.', 'site:moon.js' ),
			fact( 'Von Kármán is named after Theodore von Kármán, a pioneer of aeronautics and rocketry.', 'site:moon.js' ),
		],
		seeing: 'There\'s no lander or rover in the map, and the small craters round you are made up; the crater itself is in LOLA\'s heights, {grid} apart.',
	},
	{
		id: 'moon-chandrayaan-3', world: MOON, kind: 'landing', mission: 'Chandrayaan-3', year: 2023, relief: null,
		facts: [
			fact( 'India\'s Chandrayaan-3 landed here on 23 August 2023 with the rover Pragyan: the first spacecraft to land near the Moon\'s south pole.', 'NASA NSSDCA' ),
		],
		seeing: 'The lander and rover aren\'t in the map: this is the ground around them, from LOLA\'s heights {grid} apart. The small craters are made up.',
	},
	{
		id: 'moon-tycho', world: MOON, kind: 'crater', relief: 65,
		facts: [
			fact( 'Tycho is about 85 km across, named after the Danish astronomer Tycho Brahe. Its bright rays run out for well over a thousand kilometres.', 'site:moon.js' ),
			fact( 'It\'s young for a crater on the Moon, thought to be about 100 million years old. Surveyor 7 landed just north of it in January 1968.', 'site:moon.js' ),
		],
	},
	{
		id: 'moon-copernicus', world: MOON, kind: 'crater', relief: 70,
		facts: [
			fact( 'Copernicus is about 93 km across, named after Nicolaus Copernicus. Its walls step down in terraces to a broad floor and central peaks.', 'site:moon.js' ),
			fact( 'It\'s thought to be about 800 million years old; its bright rays spread for hundreds of kilometres over the dark plains round it.', 'site:moon.js' ),
		],
		seeing: 'Its terraces and central peaks are finer than the {grid} between the map\'s heights, so here they\'re smoothed away and its floor is broad and gentle.',
	},
	{
		id: 'moon-aristarchus', world: MOON, kind: 'crater', relief: 30,
		facts: [
			fact( 'The brightest large crater on the Moon, about 40 km across: its walls are fresh rock, not yet darkened by long ages in space.', 'site:moon.js' ),
			fact( 'Named after Aristarchus of Samos, the Greek astronomer who argued that the Earth goes round the Sun.', 'site:moon.js' ),
		],
	},
	{
		id: 'moon-plato', world: MOON, kind: 'crater', relief: 75,
		facts: [
			fact( 'Plato is about 100 km across. Lava flooded it long ago and set into a dark, nearly level floor inside a bright rim.', 'site:moon.js' ),
			fact( 'Named after the Greek philosopher, it lies at the western end of the lunar Alps, on the shore of the Sea of Rains.', 'site:moon.js' ),
		],
		seeing: 'The small craters you drive among on its floor are made up, not Plato\'s own: the map\'s heights are {grid} apart.',
	},
	{
		id: 'moon-huygens', world: MOON, kind: 'mountain', relief: 30,
		facts: [
			fact( 'The highest peak of the Moon\'s Apennine Mountains, named after the Dutch astronomer Christiaan Huygens.', 'site:moon.js' ),
			fact( 'The range is part of the rim of the Imbrium basin, thrown up by the impact that made it.', 'site:moon.js' ),
		],
	},
	{
		id: 'moon-shackleton', world: MOON, kind: 'crater', relief: 15,
		facts: [
			fact( 'Shackleton is about 21 km across, with the Moon\'s south pole on its rim. It\'s named after the Antarctic explorer Ernest Shackleton.', 'site:moon.js' ),
			fact( 'Its floor is in shadow all the time, bitterly cold, and water ice may lie frozen in it.', 'site:moon.js' ),
		],
		seeing: 'So few of the map\'s heights, {grid} apart, span it that its bowl is softened and shallower than the real one; and the game lights its floor as it never really is.',
	},
	{
		id: 'moon-orientale', world: MOON, kind: 'basin', relief: 300,
		facts: [
			fact( 'One of the youngest of the Moon\'s great impact basins: rings of mountains, the outermost, the Montes Cordillera, nearly 1,000 km across.', 'site:moon.js' ),
			fact( 'From the Earth it\'s seen only edge-on, so its rings were first seen properly in photographs from orbit in the 1960s.', 'site:moon.js' ),
		],
	},
	{
		id: 'moon-tsiolkovskiy', world: MOON, kind: 'crater', relief: 120,
		facts: [
			fact( 'Named after Konstantin Tsiolkovsky, who worked out much of the theory of rockets and spaceflight.', 'site:moon.js' ),
			fact( 'One of the few far-side features clear enough to name in the first photographs of the far side, taken by Luna 3 in October 1959.', 'site:moon.js' ),
		],
	},
	{
		id: 'moon-alphonsus', world: MOON, kind: 'crater', relief: 80,
		facts: [
			fact( 'NASA\'s Ranger 9 crashed here on purpose in March 1965, sending back pictures until the moment it hit.', 'NASA NSSDCA' ),
			fact( 'Named after Alfonso X of Castile.', 'IAU WGPSN Gazetteer' ),
		],
	},
	{
		id: 'moon-clavius', world: MOON, kind: 'crater', relief: 170,
		facts: [
			fact( 'A great crater in the Moon\'s southern highlands.', 'region' ),
			fact( 'Named after the mathematician Christopher Clavius.', 'IAU WGPSN Gazetteer' ),
		],
	},
	{
		id: 'moon-theophilus', world: MOON, kind: 'crater', relief: 75,
		facts: [
			fact( 'A crater about 100 km across, with central peaks.', 'region' ),
			fact( 'Named after Theophilus of Alexandria.', 'IAU WGPSN Gazetteer' ),
		],
	},
	{
		id: 'moon-petavius', world: MOON, kind: 'crater', relief: 100,
		facts: [
			fact( 'A great crater whose floor is cut by a cleft.', 'region' ),
			fact( 'Named after the scholar Dionysius Petavius.', 'IAU WGPSN Gazetteer' ),
		],
	},
	{
		id: 'moon-schickard', world: MOON, kind: 'crater', relief: 170,
		facts: [
			fact( 'A great crater in the south-west of the Moon\'s near side.', 'region' ),
			fact( 'Named after the astronomer Wilhelm Schickard.', 'IAU WGPSN Gazetteer' ),
		],
	},
	{
		id: 'moon-selenean-summit', world: MOON, kind: 'highest', relief: null,
		facts: [
			fact( 'The highest place on the Moon in LOLA\'s laser measurements, on the far side.', 'region' ),
		],
	},
	{
		// (Its lowest ground is about 20 km from the crater's middle, where the place is: the relief ring
		// reaches it, so the card gives its depth too.)
		id: 'moon-antoniadi', world: MOON, kind: 'lowest', relief: 30,
		facts: [
			fact( 'The lowest place on the Moon in LOLA\'s laser measurements is in this far-side crater.', 'region' ),
			fact( 'Named after the astronomer Eugène Antoniadi.', 'IAU WGPSN Gazetteer' ),
		],
	},

	// --- Mars: NASA MGS's laser altimeter (MOLA) heights, the Viking orbiters' colour ---

	{
		id: 'mars-olympus-mons', world: MARS, kind: 'volcano', relief: 300,
		facts: [
			fact( 'Olympus Mons is a volcano about 600 km across, ringed by cliffs: on its western side the scarp rises more than 7 km.', 'site:mars.js' ),
			fact( 'The caldera on top is a cluster of pits up to about 3 km deep.', 'site:mars.js' ),
		],
		seeing: 'Here the caldera is a soft bowl and the cliffs round the foot are steep slopes, not sheer: heights {grid} apart round them off.',
	},
	{
		id: 'mars-olympus-summit', world: MARS, kind: 'highest', relief: null,
		facts: [
			fact( 'The highest place on Mars, on the summit plateau of Olympus Mons, just south of the caldera.', 'site:mars.js' ),
		],
		published: { h: 21171, by: 'MOLA\'s 1/16° grid', source: 'MOLA MEGDR label' },
	},
	{
		id: 'mars-valles-marineris', world: MARS, kind: 'canyon', relief: 60,
		facts: [
			fact( 'Valles Marineris is the great canyon system of Mars, about 4,000 km long. This is Coprates Chasma, its long eastern trough.', 'site:mars.js' ),
			fact( 'It\'s named after Mariner 9, which photographed it from orbit in 1971 and 1972.', 'site:mars.js' ),
		],
	},
	{
		id: 'mars-noctis-labyrinthus', world: MARS, kind: 'canyon', relief: 40,
		facts: [
			fact( '"The labyrinth of the night": a maze of steep valleys about 1,190 km across, at the western end of Valles Marineris.', 'site:mars.js' ),
			fact( 'Its canyons are up to 30 km wide and 6 km deep. They formed as the Tharsis region bulged upward.', 'site:mars.js' ),
		],
	},
	{
		id: 'mars-arsia-mons', world: MARS, kind: 'volcano', relief: 60,
		facts: [
			fact( 'The southernmost of the Tharsis volcanoes, about 450 km across, with a summit caldera about 120 km wide.', 'site:mars.js' ),
		],
	},
	{
		id: 'mars-pavonis-mons', world: MARS, kind: 'volcano', relief: 60,
		facts: [
			fact( 'The middle one of the three great Tharsis volcanoes, on Mars\'s equator.', 'region' ),
		],
	},
	{
		id: 'mars-ascraeus-mons', world: MARS, kind: 'volcano', relief: 60,
		facts: [
			fact( 'The northernmost of the three great Tharsis volcanoes.', 'region' ),
		],
	},
	{
		id: 'mars-elysium-mons', world: MARS, kind: 'volcano', relief: 60,
		facts: [
			fact( 'The great volcano of the Elysium region, in Mars\'s northern hemisphere.', 'region' ),
		],
	},
	{
		id: 'mars-hellas', world: MARS, kind: 'basin', relief: null,
		facts: [
			fact( 'Hellas is an impact basin about 2,300 km across and over 7 km deep, one of the largest in the solar system.', 'site:mars.js' ),
			fact( 'It was made about 3.8 to 4.1 billion years ago. The lowest place on Mars is in it, in Badwater crater.', 'site:mars.js' ),
		],
	},
	{
		id: 'mars-argyre', world: MARS, kind: 'basin', relief: null,
		facts: [
			fact( 'A great impact basin in Mars\'s southern hemisphere.', 'region' ),
		],
	},
	{
		id: 'mars-badwater', world: MARS, kind: 'lowest', relief: null,
		facts: [
			fact( 'The lowest place on Mars, in a crater 33 km across in the north-west of the Hellas basin.', 'site:mars.js' ),
		],
		published: { h: - 8177, by: 'MOLA\'s 1/16° grid', source: 'MOLA MEGDR label' },
	},
	{
		id: 'mars-curiosity', world: MARS, kind: 'landing', mission: 'Curiosity', year: 2012, relief: null,
		facts: [
			fact( 'NASA\'s rover Curiosity touched down here, on the floor of Gale crater, on 6 August 2012 (UTC).', 'site:mars.js' ),
			fact( 'NASA named the spot Bradbury Landing, after the writer Ray Bradbury.', 'site:mars.js' ),
			fact( 'Mudstones Curiosity studied nearby showed an ancient lake that could have supported microbial life.', 'site:mars.js' ),
		],
		seeing: 'Gale crater and Mount Sharp are big enough for heights {grid} apart to show; the rocks Curiosity studied are far too small, and there\'s no rover or track.',
	},
	{
		id: 'mars-mount-sharp', world: MARS, kind: 'mountain', relief: 25,
		facts: [
			fact( 'The mountain inside Gale crater, about 5 km high from the crater\'s floor, made of layer upon layer of rock.', 'site:mars.js' ),
			fact( 'NASA named it Mount Sharp after the geologist Robert P. Sharp; the IAU\'s name for it is Aeolis Mons.', 'site:mars.js' ),
		],
		seeing: 'Heights {grid} apart round its top off a little, and its layers are far too fine to show.',
	},
	{
		id: 'mars-gale', world: MARS, kind: 'crater', relief: 80,
		facts: [
			fact( 'Gale is a crater 154 km across, with Mount Sharp in its middle. Curiosity landed on its floor in 2012.', 'site:mars.js' ),
			fact( 'Named after the astronomer Walter F. Gale.', 'IAU WGPSN Gazetteer' ),
		],
	},
	{
		id: 'mars-perseverance', world: MARS, kind: 'landing', mission: 'Perseverance', year: 2021, relief: null,
		facts: [
			fact( 'NASA\'s Perseverance landed in Jezero crater on 18 February 2021; the spot is named Octavia E. Butler Landing.', 'site:mars.js' ),
			fact( 'Its helicopter Ingenuity flew here on 19 April 2021: the first powered, controlled flight on another planet.', 'site:mars.js' ),
			fact( 'A river delta and old lake beds show that Jezero held a lake billions of years ago.', 'site:mars.js' ),
		],
		seeing: 'Jezero is only about six of the map\'s heights across ({grid} apart), so it\'s a soft dip, and its delta is far too small to show. No rover is in it.',
	},
	{
		id: 'mars-viking-1', world: MARS, kind: 'landing', mission: 'Viking 1', year: 1976, relief: null,
		facts: [
			fact( 'Viking 1\'s lander came down here on 20 July 1976, seven years to the day after Apollo 11 landed on the Moon.', 'site:mars.js' ),
			fact( 'Planned to work for 90 days, it lasted about six years: its last transmission was in November 1982.', 'site:mars.js' ),
		],
		seeing: 'The plain is very flat here, and there\'s no lander: the ground is MOLA\'s heights {grid} apart, with made-up small craters.',
	},
	{
		id: 'mars-pathfinder', world: MARS, kind: 'landing', mission: 'Mars Pathfinder', year: 1997, relief: null,
		facts: [
			fact( 'Mars Pathfinder landed here in Ares Vallis in July 1997; its little rover Sojourner was the first to drive on Mars.', 'NASA NSSDCA' ),
		],
		seeing: 'The lander and rover aren\'t in the map: this is the ground around them, from MOLA\'s heights {grid} apart. The small craters are made up.',
	},
	{
		id: 'mars-opportunity', world: MARS, kind: 'landing', mission: 'Opportunity', year: 2004, relief: null,
		facts: [
			fact( 'NASA\'s rover Opportunity landed on Meridiani Planum on 25 January 2004, and found signs that water was here in the past.', 'site:mars.js' ),
			fact( 'Built to last 90 sols, it kept going for more than 14 years and drove 45.16 km, until it was last heard from in June 2018.', 'site:mars.js' ),
		],
		seeing: 'The crater it landed in is only about 20 m across, far too small for heights {grid} apart; the craters round you are made up, and there\'s no rover.',
	},
	{
		id: 'mars-zhurong', world: MARS, kind: 'landing', mission: 'Tianwen-1', year: 2021, relief: null,
		facts: [
			fact( 'China\'s Tianwen-1 landed the rover Zhurong here, on Utopia Planitia, in May 2021.', 'NASA NSSDCA' ),
		],
		seeing: 'Neither lander nor rover is in the map: this is the plain around them, from MOLA\'s heights {grid} apart. The small craters are made up.',
	},
	{
		id: 'mars-korolev', world: MARS, kind: 'crater', relief: 60,
		facts: [
			fact( 'Korolev is 82 km across, in the far north. A mound of water ice 1.8 km thick covers its floor all year round.', 'site:mars.js' ),
			fact( 'Named after Sergei Korolev, the Soviet rocket designer.', 'IAU WGPSN Gazetteer' ),
		],
	},

	// --- Vesta: NASA Dawn's heights (DLR's HAMO terrain model) and pictures ---

	{
		id: 'vesta-rheasilvia-peak', world: VESTA, kind: 'mountain', relief: 100,
		facts: [
			fact( 'The central peak of the Rheasilvia basin, about 200 km wide, rises some 19 to 22 km over its base.', 'site:vesta.js' ),
		],
	},
	{
		id: 'vesta-rheasilvia', world: VESTA, kind: 'basin', relief: null,
		facts: [
			fact( 'The great impact basin round Vesta\'s south pole, about 90% of Vesta\'s own width across.', 'site:vesta.js' ),
			fact( 'Named after Rhea Silvia, the Vestal Virgin who was the mother of Romulus and Remus.', 'IAU WGPSN Gazetteer' ),
		],
	},
	{
		id: 'vesta-veneneia', world: VESTA, kind: 'basin', relief: null,
		facts: [
			fact( 'A giant impact basin about 400 km across, older than Rheasilvia, which was made partly over it.', 'site:vesta.js' ),
		],
	},
	{
		id: 'vesta-snowman', world: VESTA, kind: 'crater', relief: 50,
		facts: [
			fact( 'Marcia, about 68 km across, is the biggest of three craters in a row that look from above like a snowman.', 'site:vesta.js' ),
			fact( 'Marcia was a Vestal Virgin.', 'IAU WGPSN Gazetteer' ),
		],
		seeing: 'The bowl is in Dawn\'s heights; the pits on its floor are far too small for heights {grid} apart.',
	},
	{
		id: 'vesta-calpurnia', world: VESTA, kind: 'crater', relief: 40,
		facts: [
			fact( 'Calpurnia, about 50 km across, is the Snowman\'s middle crater. It and Marcia may have been made together, by a double impact.', 'site:vesta.js' ),
			fact( 'Named after Calpurnia, the wife of Julius Caesar.', 'IAU WGPSN Gazetteer' ),
		],
	},
	{
		id: 'vesta-minucia', world: VESTA, kind: 'crater', relief: 18,
		facts: [
			fact( 'Minucia, about 23 km across, is the Snowman\'s third and smallest crater, made later than the other two.', 'site:vesta.js' ),
			fact( 'Minucia was a Vestal Virgin.', 'IAU WGPSN Gazetteer' ),
		],
	},
	{
		id: 'vesta-divalia-fossae', world: VESTA, kind: 'trough', relief: null,
		facts: [
			fact( 'The troughs that run round Vesta\'s equator: the IAU gives the system as 549 km long, and the biggest is about 5 km deep.', 'site:vesta.js' ),
			fact( 'Divalia was a Roman festival.', 'IAU WGPSN Gazetteer' ),
		],
	},
	{
		id: 'vesta-saturnalia-fossae', world: VESTA, kind: 'trough', relief: null,
		facts: [
			fact( 'A system of troughs about 345 km long in Vesta\'s northern hemisphere, the partner of Divalia Fossae round the equator.', 'site:vesta.js' ),
			fact( 'Saturnalia was a Roman festival.', 'IAU WGPSN Gazetteer' ),
		],
	},
	{
		id: 'vesta-matronalia-rupes', world: VESTA, kind: 'scarp', relief: 40,
		facts: [
			fact( 'A scarp about 210 km long on the rim of Rheasilvia, among the highest ground on Vesta.', 'site:vesta.js' ),
			fact( 'Matronalia was a Roman festival.', 'IAU WGPSN Gazetteer' ),
		],
		seeing: 'Here the scarp is a long, steep slope, not a cliff: heights {grid} apart round off its edge.',
	},
	{
		id: 'vesta-vestalia-terra', world: VESTA, kind: 'plain', relief: null,
		facts: [
			fact( 'A large highland plateau, about 340 km across, just south of Vesta\'s equator.', 'site:vesta.js' ),
			fact( 'Vestalia was the festival of Vesta.', 'IAU WGPSN Gazetteer' ),
		],
	},
	{
		id: 'vesta-cornelia', world: VESTA, kind: 'crater', relief: 12,
		facts: [
			fact( 'Cornelia is about 15 km across. Its floor is pitted, thought to be where water held in the rock escaped as gas after the impact.', 'site:vesta.js' ),
		],
		seeing: 'Its bowl is in the map, deep for its size, but its pits are far smaller than the {grid} between the map\'s heights.',
	},
	{
		id: 'vesta-numisia', world: VESTA, kind: 'crater', relief: 25,
		facts: [
			fact( 'A crater about 30 km across.', 'region' ),
		],
	},
	// The one find added for a start spot with none near it (Claudia, 49 km off: Claudia itself is far
	// smaller than Vesta's grid).
	{
		id: 'vesta-aconia', world: VESTA, kind: 'crater', relief: 15,
		facts: [
			fact( 'A crater about 19 km across, just north of Vesta\'s equator.', 'region' ),
		],
	},

	// --- Ceres: NASA Dawn's heights (DLR's HAMO terrain model) and pictures ---

	{
		id: 'ceres-occator', world: CERES, kind: 'crater', relief: 70,
		facts: [
			fact( 'Occator is 92 km across, famous for the bright spots on its floor: deposits of salts left by brine.', 'site:ceres.js' ),
			fact( 'Named after the Roman god of harrowing.', 'IAU WGPSN Gazetteer' ),
		],
	},
	{
		id: 'ceres-cerealia-facula', world: CERES, kind: 'bright', relief: null,
		facts: [
			fact( 'The brightest spot on Ceres: salts, mostly sodium carbonate, left by brine in a pit in the middle of Occator.', 'site:ceres.js' ),
			fact( 'Cerealia was the festival of Ceres.', 'IAU WGPSN Gazetteer' ),
		],
		seeing: 'The spot is white in Dawn\'s pictures on the ground; its small dome, Cerealia Tholus, is too small for heights {grid} apart.',
	},
	{
		id: 'ceres-vinalia-faculae', world: CERES, kind: 'bright', relief: null,
		facts: [
			fact( 'The thinner bright spots on Occator\'s floor, east of Cerealia Facula: salts too.', 'site:ceres.js' ),
			fact( 'Vinalia was a Roman wine festival.', 'IAU WGPSN Gazetteer' ),
		],
	},
	{
		// (No relief: the ground round it falls away on one side far below its foot, so any ring wide
		// enough to take in its foot gives a rise well over its own 4 km.)
		id: 'ceres-ahuna-mons', world: CERES, kind: 'mountain', relief: null,
		facts: [
			fact( 'A lone mountain about 17 km wide and 4 km high, read as an ice volcano: built by icy material welling up rather than molten rock.', 'site:ceres.js' ),
			fact( 'Named after Ahuna, a post-harvest festival of the Sümi Naga people of Nagaland, India.', 'IAU WGPSN Gazetteer' ),
		],
		seeing: 'Its real flanks slope at 30 to 40°; here heights {grid} apart round them off to gentler slopes.',
	},
	{
		// (No relief: from its middle the ground climbs some 9 km within its own 140 km radius, which
		// read beside "shallow for its size" as its depth.)
		id: 'ceres-kerwan', world: CERES, kind: 'crater', relief: null,
		facts: [
			fact( 'Kerwan, about 280 km across, is the biggest crater on Ceres. It\'s shallow for its size, with no central peak.', 'site:ceres.js' ),
			fact( 'Named after the Hopi spirit of sprouting maize.', 'IAU WGPSN Gazetteer' ),
		],
	},
	{
		id: 'ceres-yalode', world: CERES, kind: 'basin', relief: 120,
		facts: [
			fact( 'A giant basin about 260 km across in Ceres\'s southern hemisphere.', 'site:ceres.js' ),
			fact( 'Named after a Dahomey goddess honoured at harvest.', 'IAU WGPSN Gazetteer' ),
		],
	},
	{
		id: 'ceres-urvara', world: CERES, kind: 'crater', relief: 120,
		facts: [
			fact( 'Urvara is about 170 km across and 6 km deep, with a central peak about 3 km high, made partly over Yalode.', 'site:ceres.js' ),
			fact( 'Named after an Indian and Iranian goddess of plants and fields.', 'IAU WGPSN Gazetteer' ),
		],
	},
	{
		id: 'ceres-dantu', world: CERES, kind: 'crater', relief: 90,
		facts: [
			fact( 'A young crater about 125 km across, its floor fractured and ringed by small bright spots.', 'site:ceres.js' ),
			fact( 'Named after a Ghanaian god of the planting of corn.', 'IAU WGPSN Gazetteer' ),
		],
	},
	{
		id: 'ceres-haulani', world: CERES, kind: 'crater', relief: 25,
		facts: [
			fact( 'A young crater about 34 km across, with bright rays of material thrown out by the impact that made it.', 'site:ceres.js' ),
			fact( 'Named after a Hawaiian plant goddess.', 'IAU WGPSN Gazetteer' ),
		],
	},
	{
		id: 'ceres-ernutet', world: CERES, kind: 'crater', relief: 40,
		facts: [
			fact( 'Round this crater, about 50 km across, Dawn found organic matter: the first found from orbit on a body in the main asteroid belt.', 'site:ceres.js' ),
			fact( 'Named after the Egyptian cobra-headed goddess of harvest.', 'IAU WGPSN Gazetteer' ),
		],
		seeing: 'The organic matter is far too thin a trace to show; the crater is here, from Dawn\'s heights {grid} apart.',
	},
	{
		id: 'ceres-juling', world: CERES, kind: 'crater', relief: 15,
		facts: [
			fact( 'On this crater\'s wall in shadow, Dawn found water ice.', 'site:ceres.js' ),
		],
		seeing: 'The ice on its shaded wall is far smaller than the {grid} between the map\'s heights; the crater is here, its rim a few km over its floor.',
	},
	{
		id: 'ceres-kait', world: CERES, kind: 'crater', relief: null,
		facts: [
			fact( 'A tiny crater, under a kilometre across: Ceres\'s longitudes are measured from it, so it\'s at 0°.', 'site:ceres.js' ),
			fact( 'Named after a Hittite goddess of grain.', 'IAU WGPSN Gazetteer' ),
		],
		seeing: 'Kait is far smaller than the {grid} between the map\'s heights, so there\'s no sign of it: the craters round you are made up.',
	},
	{
		id: 'ceres-ezinu', world: CERES, kind: 'crater', relief: 85,
		facts: [
			fact( 'A crater about 116 km across in Ceres\'s northern hemisphere.', 'region' ),
		],
	},
	{
		id: 'ceres-azacca', world: CERES, kind: 'crater', relief: 40,
		facts: [
			fact( 'A crater about 50 km across, just south of Ceres\'s equator.', 'region' ),
		],
	},
];

export const FIND_IDS = new Set( FINDS.map( find => find.id ) );

// The finds of each world they're on, by id, in the list's order (the book's order).
export const FINDS_ON = Object.fromEntries( [ MOON, MARS, VESTA, CERES ].map( world => [ world, FINDS.filter( find => find.world === world ).map( find => find.id ) ] ) );

// A find by its id, or null.
export function findOf( id ) {

	return FINDS_BY_ID.get( id ) ?? null;

}

const FINDS_BY_ID = new Map( FINDS.map( find => [ find.id, find ] ) );

// What each world's ground is built from, as the card, the book and the orrery's sheet say it: short,
// a line for the orrery; heights and picture, the datasets (the grid's size is added from worlds.js);
// datum, what its heights are over, in a sentence ("above <datum>"), with {radius} (km) and {level}
// ("285 × 229 km") filled in from worlds.js. The wording is the make scripts' (scripts/make-moon.mjs,
// make-mars.mjs, make-asteroids.mjs) and worlds.js's credits: Vesta's spheroid is the one the Dawn
// team gives heights over (make-asteroids.mjs); Ceres's is the game's own, not claimed as Dawn's.
export const FIND_DATA = {
	moon: {
		short: 'Built from NASA LRO\'s laser altimeter heights',
		heights: 'NASA LRO: LOLA heights',
		picture: 'LROC colour',
		datum: 'the Moon\'s {radius} km reference sphere',
	},
	mars: {
		short: 'Built from NASA Mars Global Surveyor\'s laser altimeter heights',
		heights: 'NASA MGS: MOLA heights',
		picture: 'Viking colour (USGS)',
		datum: 'Mars\'s datum (the areoid)',
	},
	vesta: {
		short: 'Built from NASA Dawn\'s heights and pictures',
		heights: 'NASA Dawn: DLR\'s HAMO terrain model',
		picture: 'Dawn framing camera pictures',
		datum: 'Vesta\'s {level} reference spheroid (the level the Dawn team gives heights over)',
	},
	ceres: {
		short: 'Built from NASA Dawn\'s heights and pictures',
		heights: 'NASA Dawn: DLR\'s HAMO terrain model',
		picture: 'Dawn framing camera pictures',
		datum: 'the game\'s {level} reference spheroid for Ceres',
	},
};
