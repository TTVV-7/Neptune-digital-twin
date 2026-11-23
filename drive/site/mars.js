// Mars's own pages (worlddrive.app/mars/<slug>/, built by build.js): one for each of Mars's start
// spots on the globe's panel (MARS_SPOTS in src/drive-app/mars-places.js, by `spot`), and the words
// Mars's page (/mars/) and each of them share. As for the Moon's (moon.js), each says what the place
// is, in a few true sentences, and what there is to do there in the game, with a title and
// description of its own, and nothing on one is copied from another. Facts are kept to what's well
// sourced (NASA's, ESA's and the USGS's, and MOLA's own heights); where a number isn't certain it's
// left out.
//
// They're honest about the game too: World Drive's Mars has the real Mars's big shapes (MOLA's
// heights, an eighth of a degree apart, about 7.4 km) and colours (the Viking orbiters' pictures),
// but everything smaller is made up. Its landers, rovers and crash sites are set down where they are
// (world-hardware.js), as simplified models (hardware-mars.js); there are no tracks. Nothing here
// says you can see what's narrower than those heights can show: Jezero's delta, Eagle crater, the
// rocks the rovers studied. Olympus Mons's cliffs are steep slopes in the game, not sheer ones.
//
// The fields are the Moon's pages' (moon.js): slug, spot, name, called, region, title, description,
// about, todo and game.

export const MARS_PAGES = [
	{
		slug: 'olympus-mons',
		spot: 'mars-olympus-mons',
		name: 'Olympus Mons',
		region: 'The summit caldera · 18 km up',
		title: 'Drive Olympus Mons, the Highest Place on Mars, in 3D',
		description: 'Drive up Olympus Mons, the volcano some 600 km across whose summit is the highest place on Mars, in 3D from NASA\'s maps, in low gravity. Free in your browser.',
		about: [
			'Olympus Mons is a volcano about 600 km across, ringed by steep cliffs. On its western side the cliff, a scarp, rises more than 7 km from the plains below.',
			'Its summit is the highest place on Mars. The laser altimeter on NASA\'s Mars Global Surveyor (MOLA) measured it at 21,171 m above Mars\'s datum, its "sea level", on the summit plateau just south of the caldera.',
			'The caldera on its top is a cluster of pits up to about 3 km deep: in MOLA\'s heights its floor is at about 17.8 km and its south wall rises to about 21 km.',
		],
		todo: [
			'Start on the caldera\'s floor, about 18 km up, and climb its walls.',
			'Search for "highest point" to drop in on the summit plateau, about 57 km south of the start.',
			'Head down the flanks: the volcano is so wide that its foot is some 300 km from the top.',
			'Drive off the steepest slope you can find: in 38% of the gravity a jump lasts about 1.6 times as long as on the Earth.',
		],
		game: 'In World Drive the caldera is a soft bowl about ten of Mars\'s heights across, and the cliffs round the volcano\'s foot are steep slopes, not sheer: heights 7.4 km apart round them off.',
	},
	{
		slug: 'valles-marineris',
		spot: 'mars-valles-marineris',
		name: 'Valles Marineris',
		region: 'Coprates Chasma · the great canyon',
		title: 'Drive Valles Marineris, the Great Canyon of Mars, in 3D',
		description: 'Drive the floor of Valles Marineris, the canyons some 4,000 km long across Mars, and climb walls about 9 km high, in 3D from NASA\'s maps. Free in your browser.',
		about: [
			'Valles Marineris is the great canyon system of Mars, about 4,000 km long. In Melas Chasma its floor lies more than 9 km below the plateau round it, and the walls there show many huge landslides.',
			'It\'s named after Mariner 9, which photographed it from orbit in 1971 and 1972. Coprates Chasma, where World Drive starts you, is its long eastern trough, about 960 km long.',
			'At its western end is Noctis Labyrinthus, a maze of steep valleys that\'s one of the start spots too.',
		],
		todo: [
			'Drop in on the floor of Coprates Chasma and drive for the walls, 20 to 60 km away.',
			'Climb a wall: in the game they rise about 9 km from the floor.',
			'Search for Melas Chasma to drop in further west, where the floor is more than 9 km below the plateau.',
			'Look up to the north-east: Phobos, one of Mars\'s two moons, is in the sky.',
		],
		game: 'In World Drive the canyon\'s floor round the start is flat and its walls rise about 9 km within 60 km of it; only the biggest of its landslides show.',
	},
	{
		slug: 'bradbury-landing',
		spot: 'mars-curiosity',
		name: 'Bradbury Landing',
		region: 'Curiosity, 2012 · Gale crater',
		title: 'Drive Bradbury Landing, Where Curiosity Landed on Mars',
		description: 'Drive Gale crater on Mars where NASA\'s Curiosity rover landed in 2012, toward Mount Sharp, in 3D from NASA\'s maps, in low gravity. Free in your browser.',
		about: [
			'On 6 August 2012 (still 5 August in California) NASA\'s rover Curiosity touched down on the floor of Gale crater, a crater 154 km across, 2.39 km from the middle of its landing ellipse and 4,501 m below Mars\'s datum.',
			'NASA named the spot Bradbury Landing on 22 August 2012, after the writer Ray Bradbury, on what would have been his 92nd birthday.',
			'At Yellowknife Bay, mudstones studied by Curiosity showed an ancient lake there that could have supported microbial life.',
		],
		todo: [
			'Drop in on Gale\'s floor where Curiosity came down, and drive for Mount Sharp, whose middle is about 38 km to the south-east.',
			'Climb Mount Sharp\'s slopes, or pick it from the start spots to drop in near its top.',
			'Drive out to the crater\'s rim: Gale is 154 km across, so it\'s a long way.',
			'Look up to the north-east for Phobos, one of Mars\'s two moons.',
		],
		game: 'Gale crater and Mount Sharp are big enough for World Drive\'s heights of Mars, 7.4 km apart, to show; Yellowknife Bay\'s rocks are far too small, and there\'s no rover or track in the game.',
	},
	{
		slug: 'mount-sharp',
		spot: 'mars-mount-sharp',
		name: 'Mount Sharp',
		region: 'Aeolis Mons · in Gale crater',
		title: 'Drive Up Mount Sharp, the Mountain in Mars\'s Gale Crater',
		description: 'Drive up Mount Sharp, the mountain about 5 km high in Gale crater that Curiosity reached in 2014, in 3D from NASA\'s maps, then jump off it. Free in your browser.',
		about: [
			'Mount Sharp is the mountain inside Gale crater, about 89 km across and about 5 km high from the crater\'s floor, made of layer upon layer of rock.',
			'NASA named it informally after the geologist Robert P. Sharp in March 2012, and on 16 May 2012 the IAU approved its official name, Aeolis Mons.',
			'Curiosity, which landed on the crater\'s floor in August 2012, reached the mountain\'s base in September 2014.',
		],
		todo: [
			'Start near the top and drive down: Gale\'s floor is about 4.5 km below.',
			'Drive off a slope at speed and fly: in 38% of the gravity you\'re in the air about 1.6 times as long.',
			'Look out over Gale crater toward its rim.',
			'Search for Bradbury Landing to drop in where Curiosity landed.',
		],
		game: 'In World Drive it rises about 4.8 km over Gale\'s floor, as heights 7.4 km apart round off its top a little, and its layers are far too fine to show.',
	},
	{
		slug: 'jezero',
		spot: 'mars-perseverance',
		name: 'Jezero crater',
		called: 'Jezero',
		region: 'Perseverance, 2021 · an old lake',
		title: 'Drive Jezero Crater, Where Perseverance Landed on Mars',
		description: 'Drive Jezero crater on Mars, an old lake where Perseverance and the Ingenuity helicopter landed in 2021, in 3D from NASA\'s maps. Free in your browser.',
		about: [
			'On 18 February 2021 NASA\'s rover Perseverance landed in Jezero crater, carrying the little helicopter Ingenuity. On 5 March NASA named the site Octavia E. Butler Landing.',
			'Jezero is about 45 km across, named after a town in Bosnia and Herzegovina. A river delta and old lake beds show that it held a lake billions of years ago, and a study in 2024 confirmed the lake\'s sediments.',
			'On 19 April 2021 Ingenuity flew there for 39.1 seconds: the first powered, controlled flight on another planet. NASA named the place it took off from Wright Brothers Field.',
		],
		todo: [
			'Drop in where Perseverance landed and drive west to the crater\'s rim, about 10 km off, and over it.',
			'Fly as long as you can: Ingenuity\'s first flight lasted 39.1 seconds.',
			'Search for Curiosity, Opportunity or Spirit to drop in where the other rovers landed.',
		],
		game: 'Jezero is only about six of World Drive\'s heights of Mars across, so in the game it\'s a soft dip about 0.7 km deep, and its delta is far too small to show.',
	},
	{
		slug: 'hellas-planitia',
		spot: 'mars-hellas',
		name: 'Hellas Planitia',
		called: 'Hellas',
		region: 'An impact basin 2,300 km across',
		title: 'Drive the Hellas Basin, 2,300 km Across, on Mars in 3D',
		description: 'Drive the floor of Hellas, the impact basin 2,300 km across that holds the lowest place on Mars, in 3D from NASA\'s maps, in low gravity. Free in your browser.',
		about: [
			'Hellas is an impact basin about 2,300 km across and over 7 km deep, one of the largest in the solar system, made about 3.8 to 4.1 billion years ago.',
			'The lowest place on Mars is in it: in Badwater crater, 33 km across, in the north-west of Hellas, MOLA measured 8,177 m below Mars\'s datum.',
			'The middle of its floor, where World Drive starts you, is about 6 km below the datum, so it isn\'t the basin\'s deepest part.',
		],
		todo: [
			'Drop in on the floor and open up across the plain.',
			'Search for "lowest point" to drop in at Badwater crater, the lowest place on Mars, about 2 km lower than the start.',
			'Boost into overdrive and drift: there\'s room to turn any way you like.',
		],
		game: 'The basin is so wide that from its floor in World Drive you see only a vast, low plain: its rim is far over the horizon.',
	},
	{
		slug: 'chryse-planitia',
		spot: 'mars-viking-1',
		name: 'Chryse Planitia',
		region: 'Viking 1, 1976',
		title: 'Drive Chryse Planitia, Where Viking 1 Landed on Mars',
		description: 'Drive Chryse Planitia, the wide, flat plain where Viking 1 landed on Mars in 1976, in 3D from NASA\'s maps, in low gravity. Free in your browser.',
		about: [
			'On 20 July 1976, seven years to the day after Apollo 11 landed on the Moon, Viking 1\'s lander came down in western Chryse Planitia. NASA calls it the first U.S. mission to land safely on Mars and send back pictures of the surface.',
			'It was planned to work for 90 days, and it lasted about six years: its last transmission was in November 1982.',
			'The lander was renamed the Thomas Mutch Memorial Station, after Thomas A. Mutch (1931–1980), who led its imaging team. In 2006 the HiRISE camera photographed it from orbit.',
		],
		todo: [
			'Drop in and open up: one of the flattest of the start spots, good for top speed and long drifts.',
			'Look up to the north-east for Phobos.',
			'Search for Viking 2 or Pathfinder to drop in where other landers came down.',
		],
		game: 'The plain is very flat in World Drive: for 15 km round the start the ground rises and falls about 100 m at most, made-up craters and all, and there\'s no lander in the game.',
	},
	{
		slug: 'meridiani-planum',
		spot: 'mars-opportunity',
		name: 'Meridiani Planum',
		region: 'Opportunity, 2004',
		title: 'Drive Meridiani Planum, Where Opportunity Landed on Mars',
		description: 'Drive Meridiani Planum on Mars, where Opportunity landed in 2004 and found signs of water long gone, in 3D from NASA\'s maps. Free in your browser.',
		about: [
			'On 25 January 2004 NASA\'s rover Opportunity landed on Meridiani Planum, inside Eagle crater, a hollow only about 20 m across.',
			'There it found hematite "blueberries", small spheres formed in acidic groundwater: evidence of water there in the past.',
			'It was built to last 90 sols (a sol, Mars\'s day, is about 24 hours and 40 minutes) and kept going for more than 14 years, driving 45.16 km, until it was last heard from on 10 June 2018, in a dust storm over the whole planet. NASA declared the mission over on 13 February 2019.',
		],
		todo: [
			'Drop in where Opportunity landed: gentle, open ground, good for speed.',
			'Drive about 28 km south-east to Endeavour crater, 22 km across, where Opportunity later went, or search for it.',
			'Out-drive the rover: Opportunity took over 14 years to drive 45 km.',
		],
		game: 'Eagle crater is far too small for World Drive\'s heights, 7.4 km apart, and Endeavour is at most a soft dip in the game; the craters round you are made up, and there\'s no rover.',
	},
	{
		slug: 'gusev',
		spot: 'mars-spirit',
		name: 'Gusev crater',
		called: 'Gusev',
		region: 'Spirit, 2004',
		title: 'Drive Gusev Crater, Where Spirit Landed on Mars, in 3D',
		description: 'Drive Gusev crater on Mars, where the rover Spirit landed in 2004, across its flat floor to the rim, in 3D from NASA\'s maps. Free in your browser.',
		about: [
			'On 4 January 2004 (3 January in the United States) NASA\'s rover Spirit landed in Gusev crater, about 165 km across, about 13.4 km from the point it was aimed at. The site was named Columbia Memorial Station, after the crew lost on the Space Shuttle Columbia.',
			'In 2007, near a feature called Home Plate, Spirit dug up a patch of nearly pure silica.',
			'It got stuck in soft sand on 1 May 2009 and was last heard from on 22 March 2010, having driven 7.73 km in all.',
		],
		todo: [
			'Drop in and drive the flat floor: room to open up any way you like.',
			'Drive for the rim, 60 to 80 km away, and climb it.',
			'Search for Opportunity to drop in where it landed, three weeks after Spirit.',
		],
		game: 'Gusev\'s floor is flat in World Drive and its rim is 60 to 80 km from the start, far off in the haze; the small craters round you are made up, and there\'s no rover.',
	},
	{
		slug: 'noctis-labyrinthus',
		spot: 'mars-noctis-labyrinthus',
		name: 'Noctis Labyrinthus',
		region: 'The west end of Valles Marineris',
		title: 'Drive Noctis Labyrinthus, the Labyrinth of the Night on Mars',
		description: 'Drive Noctis Labyrinthus, the maze of canyons up to 6 km deep at the west end of Valles Marineris, in 3D from NASA\'s maps. Free in your browser.',
		about: [
			'Noctis Labyrinthus, "the labyrinth of the night", is a maze of steep valleys stretching about 1,190 km at the western end of Valles Marineris.',
			'Its canyons are up to 30 km wide and 6 km deep. They formed as the Tharsis region bulged upward.',
		],
		todo: [
			'Drop in on the high ground between the canyons, about 7 km up, and drive to the edge.',
			'Drive down into a canyon and out the other side: from the start the ground falls 2 to 3 km within 20 km to the north, the east and the west.',
			'Take off over a canyon\'s rim at speed: in 38% of the gravity you\'re up a long time.',
			'Search for Valles Marineris to drop in on the floor of its eastern trough.',
		],
		game: 'Its wide canyons, 20 to 30 km across, are in World Drive\'s heights of Mars; the narrower ones mostly disappear between heights 7.4 km apart.',
	},
	{
		slug: 'arsia-mons',
		spot: 'mars-arsia-mons',
		name: 'Arsia Mons',
		region: 'Tharsis · the summit caldera',
		title: 'Drive Arsia Mons and Its 120 km Caldera on Mars in 3D',
		description: 'Drive the caldera of Arsia Mons, 120 km wide and over 16 km up on a Tharsis volcano, in 3D from NASA\'s maps, in low gravity. Free in your browser.',
		about: [
			'Arsia Mons is the southernmost of the Tharsis volcanoes, about 450 km across. Its summit caldera is about 120 km wide, and its highest point in MOLA\'s heights, about 17.8 km above Mars\'s datum, is on the caldera\'s south-east rim.',
			'All three of the Tharsis volcanoes have collapse features on their south-west and north-east flanks, which may mean they share one system of fractures.',
		],
		todo: [
			'Drop in near the middle of the caldera\'s floor and drive across it: its rim is 55 to 85 km off all round.',
			'Climb the rim and look down the volcano\'s flanks.',
			'Search for Pavonis Mons and Ascraeus Mons, the other two Tharsis volcanoes, or for Olympus Mons.',
		],
		game: 'In World Drive the caldera\'s floor is about 16.3 km up and its rim rises to about 17.5 km: it\'s so wide that from the middle the rim is lost in the haze.',
	},
	{
		slug: 'korolev',
		spot: 'mars-korolev',
		name: 'Korolev crater',
		called: 'Korolev',
		region: 'The far north · a crater full of ice',
		title: 'Drive Korolev, the Crater on Mars Filled With Ice',
		description: 'Drive Korolev, the crater 82 km across in the far north of Mars that\'s filled with ice 1.8 km thick, in 3D from NASA\'s maps. Free in your browser.',
		about: [
			'Korolev is a crater 82 km across in the far north of Mars. Its floor, 2 km below the rim, is covered all year round by a mound of water ice 1.8 km thick.',
			'About 2,200 cubic kilometres of ice lie in it, kept there because the crater is a natural cold trap.',
		],
		todo: [
			'Drop in on the top of the ice and drive down to the moat round it.',
			'Climb out of the moat to the crater\'s rim.',
			'Search for "north pole" to drive on the polar cap.',
		],
		game: 'MOLA measured the top of the ice, so its dome and the moat round it are in World Drive\'s heights, the moat softened. And this far north there\'s no Phobos in the sky: in World Drive it\'s never in sight past 69° of latitude.',
	},
];

// What every Mars page says about how World Drive's Mars is made, and what's made up.
export const MARS_MADE = [
	'World Drive\'s Mars is the real Mars\'s shape: its heights are from the laser altimeter (MOLA) on NASA\'s Mars Global Surveyor, every eighth of a degree (7.4 km apart at the equator), measured from the areoid, Mars\'s "sea level", so the volcanoes, canyons, basins and big craters are where they are; and its colours are from the Viking orbiters\' photographs of the whole planet, as the USGS\'s colour mosaic has them. Both are in the public domain.',
	'Everything smaller than that is made up: the craters you drive among, from about 13 km across down to a few metres (fewer than on the Moon, most of them worn soft, the fresh ones darker than the dust round them), and the gentle rolls of the ground, the same on every visit. The landers, rovers and crash sites people sent there are set down where they really are (the rovers that drove on, where they ended up or were last reported), as simplified models built for the game; there are no tracks.',
];

// Driving there, as a list on each Mars page and Mars's own page.
export const MARS_DRIVING = [
	'<b>38% of the gravity.</b> A jump goes as high as on the Earth and lasts about 1.6 times as long, so there\'s time for more spins and flips (each is worth fewer points, to be fair to the Earth\'s).',
	'<b>A butterscotch sky.</b> A dusty yellow-brown, hazy far off, with a paler glow round the sun, which is always from the south-west, about 34° up, wherever you are. Phobos, one of Mars\'s two moons, hangs in it to the north-east, lit by the same sun: where it is in the sky is made up, and past 69° north or south it\'s never in sight.',
	'<b>No water and no roads.</b> Dust and rock to the horizon: plains, crater rims, canyon walls and the slopes of volcanoes.',
	'<b>With others.</b> See who\'s driving near you on Mars, in Mars\'s own rooms, or bring friends in a party, wherever each of you is: a friend on the Earth, the Moon, Vesta or Ceres is a tap away. Mars\'s globe shows where others are driving now: those who let drivers nearby see them. Mars\'s daily allowance for driving with others is smaller than the Earth\'s, so on a busy day it\'s back after midnight UTC. Driving, air, drifts and tricks earn XP, and your best runs go on the leaderboard (the bonuses for new start spots and areas are the Earth\'s).',
];

// The rest of what Mars's pages say (build.js): its page's title, description and words, the line
// over the coordinates, the search, its place in the Earth's pages' lists, and its credit.
export const MARS_SITE = {
	pages: MARS_PAGES,
	made: MARS_MADE,
	driving: MARS_DRIVING,
	// Its page, /mars/.
	title: 'Drive on Mars in 3D, Free in Your Browser',
	description: 'Drive on the real Mars in 3D, made from NASA\'s maps: Olympus Mons, Valles Marineris and where the rovers landed, in 38% of the gravity. Free in your browser.',
	social: 'Drive on Mars in 3D',
	cardAlt: 'Mars from space in World Drive: pick anywhere on it, drop in and drive, free in your browser',
	lede: 'World Drive\'s globe turns to Mars: pick anywhere on it, drop in and drive, in 38% of the Earth\'s gravity under a butterscotch sky. Its volcanoes, canyons and craters are where the real ones are, from NASA\'s maps.',
	// Said of the first of its places, which its Drive on Mars pins.
	first: 'whose summit is the highest place on Mars',
	data: 'It\'s a whole planet, from pole to pole, its heights from over 8 km below the areoid in Hellas to over 21 km above it on Olympus Mons, made in your browser from a little over 9 MB of data, so it needs no map service: the globe\'s search knows Mars\'s own places, its volcanoes, canyons, craters, plains and landing sites, by name.',
	elsewhere: {
		heading: 'And the Earth and the Moon',
		html: 'On the Earth, World Drive drops you into Google\'s photorealistic 3D map of the real world, anywhere: your own street, or <a href="/drive/">famous roads, bridges and cities</a> like the Golden Gate Bridge, Times Square and Monaco. And the globe turns to <a href="/moon/">the Moon</a> too, in a sixth of the Earth\'s gravity, with the Earth in its black sky.',
	},
	// Where on it a place is, as its pages say.
	coordinates: 'areocentric latitude and longitude, north and east positive',
	search: 'search for a volcano, a canyon or a crater by name',
	// Among the Earth's places, in each one's list of the others, and on /drive/.
	tagline: 'Volcanoes, canyons and the rovers\' sites',
	others: 'And to Mars: its volcanoes, canyons and craters, from NASA\'s maps too, 38% of the Earth\'s gravity and a butterscotch sky. <a href="/mars/">Drive on Mars</a>: Olympus Mons, Valles Marineris and where the rovers landed.',
	// Its pages' footer: MOLA's heights (from NASA's Planetary Data System) and the Viking orbiters'
	// colours (the USGS's mosaic), as the game credits them.
	credit: 'World Drive is a free arcade driving game. Its Mars is made from the heights measured by the laser altimeter (MOLA) on NASA\'s Mars Global Surveyor, from NASA\'s Planetary Data System, and the Viking orbiters\' pictures, as the USGS\'s <a href="https://astrogeology.usgs.gov/search/map/mars_viking_colorized_global_mosaic_232m">Viking colour mosaic</a> has them, all in the public domain; World Drive isn\'t made or endorsed by NASA or the USGS.',
};
