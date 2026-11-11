// The Moon's own pages (worlddrive.app/moon/<slug>/, built by build.js): one for each of the Moon's
// start spots on the globe's panel (MOON_SPOTS in src/drive-app/moon-places.js, by `spot`), and the
// words the Moon's page (/moon/) and each of them share. As for the Earth's places (places.js), each
// says what the place is, in a few true sentences, and what there is to do there in the game, with
// a title and description of its own, and nothing on one is copied from another. Facts are kept to
// what's well known (dates, names, sizes); where a number isn't certain it's left out.
//
// They're honest about the game too: World Drive's Moon has the real Moon's big shapes (LOLA's
// heights, a quarter of a degree apart) and colours (LROC's photographs), but everything smaller is
// made up, and there are no landers, flags or rover tracks in it. Nothing here says you can see the
// Apollo hardware, or anything narrower than those heights can show.
//
// slug: the page's address under /moon/; spot: the Moon start spot its Drive here pins; name: as
// the page says it (called: the name in a sentence, where that's not just the name); region: the
// line over its heading; title and description: the page's <title> and meta description (about 150
// characters, the most important first); about: what the place is, a paragraph each; todo: what to
// do there in World Drive; game: what's different about it in the game, where something is.

export const MOON_PAGES = [
	{
		slug: 'tranquility-base',
		spot: 'moon-apollo-11',
		name: 'Tranquility Base',
		region: 'Apollo 11 · Sea of Tranquillity',
		title: 'Drive to Tranquility Base, Where Apollo 11 Landed',
		description: 'Drive on the Moon at Tranquility Base, where Apollo 11 landed in 1969, on ground made from NASA\'s maps, in a sixth of the gravity. Free in your browser.',
		about: [
			'On 20 July 1969 Apollo 11\'s lunar module, Eagle, landed in the south-west of the Sea of Tranquillity (Mare Tranquillitatis), and Neil Armstrong and Buzz Aldrin became the first people to walk on the Moon, while Michael Collins stayed in orbit in the command module, Columbia. Armstrong named the landing site Tranquility Base.',
			'In the last minutes of the descent Armstrong took over by hand and flew on past a crater strewn with boulders, landing with little fuel to spare. The two of them spent about two and a half hours outside, setting up experiments, taking photographs and gathering rock and soil to bring home.',
			'The Sea of Tranquillity is no sea: like the Moon\'s other maria it\'s a wide plain of dark basalt, lava that welled up and set more than three billion years ago, and its smooth, level ground is why it was chosen for the first landing.',
		],
		todo: [
			'Drop in and drive out across the plain: some of the flattest ground on the Moon, good for picking up speed.',
			'Hit a crater\'s rim at speed and you\'re in the air for seconds: a jump lasts two and a half times as long as on the Earth.',
			'Look up: the Earth hangs high in the western sky.',
			'The other Apollo sites are on the globe too: pick Hadley Rille or the Taurus-Littrow valley from the start spots, or search for Apollo 16.',
		],
		game: 'Eagle\'s descent stage is still there on the real Moon, but there\'s no lander, flag or footprint in World Drive: the ground is the Moon\'s shape as mapped from orbit, and the small craters round the start are made up.',
	},
	{
		slug: 'hadley-rille',
		spot: 'moon-apollo-15',
		name: 'Hadley Rille',
		region: 'Apollo 15 · Apennine Mountains',
		title: 'Drive the Apollo 15 Site, Where Astronauts First Drove on the Moon',
		description: 'Drive the Moon where Apollo 15\'s astronauts first drove there in 1971: the plain at Hadley, below the Apennine Mountains, from NASA\'s maps. Free in your browser.',
		about: [
			'Apollo 15 landed on 30 July 1971 on the plain at Hadley, between Hadley Rille and the Apennine Mountains, which form the south-eastern edge of the Sea of Rains (Mare Imbrium). David Scott and James Irwin spent nearly three days there while Alfred Worden orbited above.',
			'It was the first mission to take the Lunar Roving Vehicle, the battery-driven "Moon buggy", and Scott and Irwin drove it about 28 km over three trips out, to the edge of the rille and up the slopes of the mountains. Among the rocks they brought home was a piece of the Moon\'s ancient crust that became known as the Genesis Rock.',
			'Hadley Rille is a winding channel more than a kilometre wide and a few hundred metres deep, most likely cut by flowing lava. At the end of the last moonwalk Scott dropped a hammer and a falcon\'s feather together, and with no air to slow the feather they hit the ground at the same moment.',
		],
		todo: [
			'Drive along the foot of the Apennines, whose big slopes rise from the plain.',
			'Climb a slope and drive off the top: in a sixth of the gravity you\'re in the air two and a half times as long.',
			'Take the go-kart and the pickup and see which would have made the better Moon buggy.',
			'Search for Mons Hadley or Mons Huygens to drive further along the range.',
		],
		game: 'The rille itself is narrower than the 7.6 km between the Moon\'s heights World Drive has, so you won\'t find it in the game: the plain and the mountains are there, softened, and there are no rover tracks.',
	},
	{
		slug: 'taurus-littrow',
		spot: 'moon-apollo-17',
		name: 'Taurus-Littrow valley',
		called: 'the Taurus-Littrow valley',
		region: 'Apollo 17 · Sea of Serenity',
		title: 'Drive the Taurus-Littrow Valley, Where Apollo 17 Landed',
		description: 'Drive the Taurus-Littrow valley on the Moon, where Apollo 17, the last Apollo landing, came down in 1972, on ground made from NASA\'s maps. Free in your browser.',
		about: [
			'Apollo 17 landed on 11 December 1972 in the Taurus-Littrow valley, among the mountains on the south-eastern edge of the Sea of Serenity (Mare Serenitatis). Eugene Cernan and Harrison Schmitt spent about three days there, the longest stay of any Apollo crew, while Ronald Evans orbited above.',
			'Schmitt was a geologist, the only one to walk on the Moon. They drove their rover about 35 km over three trips, and at a small crater called Shorty, Schmitt found orange soil, which turned out to be tiny beads of volcanic glass.',
			'It was the last of the Apollo landings, and Cernan was the last of Apollo\'s twelve moonwalkers to climb back into the lunar module, Challenger. On the way out to the Moon the crew had taken the photograph of the whole, sunlit Earth known as The Blue Marble.',
		],
		todo: [
			'Drive the valley floor between the mountains on either side.',
			'Climb a mountain\'s slope and jump off it: a sixth of the gravity keeps you up a long time.',
			'Look up: the Earth is high in the south-western sky.',
		],
		game: 'The valley is narrow next to the 7.6 km between World Drive\'s heights of the Moon, so in the game its mountains are softened and the valley is shallower than it really is.',
	},
	{
		slug: 'tycho',
		spot: 'moon-tycho',
		name: 'Tycho crater',
		called: 'Tycho',
		region: 'Near side · southern highlands',
		title: 'Drive Tycho Crater on the Moon in 3D',
		description: 'Drive into Tycho, the young crater with bright rays in the Moon\'s southern highlands, in 3D from NASA\'s maps, with low-gravity jumps. Free in your browser.',
		about: [
			'Tycho is a crater about 85 km across in the Moon\'s southern highlands, named after the Danish astronomer Tycho Brahe. At full Moon it\'s easy to see without a telescope: a bright spot with rays of pale ejecta running out from it for well over a thousand kilometres.',
			'It\'s young for a crater on the Moon, thought to be about 100 million years old, so its terraced walls and central peak are still sharp and its rays haven\'t yet faded. NASA\'s Surveyor 7 landed just north of it in January 1968, on the ground its impact threw out.',
			'In the film 2001: A Space Odyssey, Tycho is where the black monolith is dug up.',
		],
		todo: [
			'Start on the crater\'s floor, near its middle, and climb the central peak.',
			'Drive out to the walls, some 40 km away, and up them.',
			'Drive off a steep slope at speed and fly: a jump here lasts two and a half times as long as on the Earth.',
			'Look north: the Earth hangs halfway up the sky.',
		],
	},
	{
		slug: 'copernicus',
		spot: 'moon-copernicus',
		name: 'Copernicus crater',
		called: 'Copernicus',
		region: 'Near side · Ocean of Storms',
		title: 'Drive Copernicus Crater on the Moon in 3D',
		description: 'Drive Copernicus, the Moon\'s great terraced crater south of the Sea of Rains, in 3D from NASA\'s maps, and jump its walls in low gravity. Free in your browser.',
		about: [
			'Copernicus is a crater about 93 km across in the eastern Ocean of Storms (Oceanus Procellarum), south of the Sea of Rains, named after Nicolaus Copernicus. Its walls step down in terraces to a broad floor with a group of central peaks.',
			'It\'s thought to be about 800 million years old, and its bright rays spread for hundreds of kilometres over the dark plains round it, which makes it one of the easiest craters to pick out with binoculars.',
			'In 1966 NASA\'s Lunar Orbiter 2 photographed it from the side, low across its floor to the mountains of its far wall, a view that was called one of the pictures of the century.',
		],
		todo: [
			'Drive across the floor to the walls, some 45 km out, and climb them.',
			'Fly up over the rim and look out over the Ocean of Storms.',
			'Look up: the Earth is high in the eastern sky.',
			'Search for Kepler or Eratosthenes, two more big craters of the near side.',
		],
		game: 'Its terraces and central peaks are too fine for the 7.6 km between World Drive\'s heights of the Moon, so in the game they\'re smoothed away and its floor is broad and gentle.',
	},
	{
		slug: 'aristarchus',
		spot: 'moon-aristarchus',
		name: 'Aristarchus',
		region: 'Near side · Ocean of Storms',
		title: 'Drive Aristarchus, the Moon\'s Brightest Crater, in 3D',
		description: 'Drive Aristarchus, the brightest big crater on the Moon, and the plateau beside it, in 3D from NASA\'s maps, with low-gravity jumps. Free in your browser.',
		about: [
			'Aristarchus is a crater about 40 km across on the Aristarchus Plateau, a raised block in the Ocean of Storms (Oceanus Procellarum), named after Aristarchus of Samos, the Greek astronomer who argued that the Earth goes round the Sun.',
			'It\'s the brightest large crater on the Moon, so bright it can be seen even on the part of the Moon lit only by earthshine: its walls and the ground round it are fresh rock, not yet darkened by long ages in space.',
			'Beside it Vallis Schröteri, the largest of the Moon\'s winding valleys (sinuous rilles), wanders across the plateau, probably cut by lava.',
		],
		todo: [
			'Start inside the crater and drive up its walls.',
			'Climb out over the rim and across the plateau.',
			'Search for Vallis Schröteri to drop in where it winds across the plateau.',
			'Look east: the Earth is in the sky, less than halfway up.',
		],
	},
	{
		slug: 'plato',
		spot: 'moon-plato',
		name: 'Plato crater',
		called: 'Plato',
		region: 'Near side · Sea of Rains',
		title: 'Drive Plato Crater\'s Dark, Flat Floor on the Moon',
		description: 'Drive the dark, flat floor of Plato, a crater 100 km across by the Moon\'s Sea of Rains, in 3D from NASA\'s maps, with low-gravity jumps. Free in your browser.',
		about: [
			'Plato is a crater about 100 km across on the north-eastern shore of the Sea of Rains (Mare Imbrium), at the western end of the lunar Alps (Montes Alpes), named after the Greek philosopher. Lava flooded it long ago and set into a floor that\'s dark and nearly level, so through a telescope it looks like a dark oval inside a bright rim.',
			'It\'s one of the darkest patches on the near side, and the few small craters on its floor are a favourite test for amateur astronomers\' telescopes and the steadiness of the air on the night.',
		],
		todo: [
			'Drop in on the floor and open up: there\'s little on it to stop you.',
			'Drive to the rim, about 50 km away, and climb it.',
			'Fly up over the rim to see the Alps and the Sea of Rains.',
			'Look south: the Earth is in the sky, less than halfway up.',
		],
		game: 'The small craters you drive among on its floor in World Drive are made up, not Plato\'s own.',
	},
	{
		slug: 'mons-huygens',
		spot: 'moon-huygens',
		name: 'Mons Huygens',
		region: 'Near side · Apennine Mountains',
		title: 'Drive Mons Huygens in the Moon\'s Apennine Mountains',
		description: 'Drive up Mons Huygens, the highest peak of the Moon\'s Apennine Mountains, in 3D from NASA\'s maps, then jump off it in low gravity. Free in your browser.',
		about: [
			'Mons Huygens is the highest peak of the Montes Apenninus, the Moon\'s Apennine Mountains, named after the Dutch astronomer Christiaan Huygens. The range runs for about 600 km along the south-eastern edge of the Sea of Rains (Mare Imbrium): it\'s part of the rim of the Imbrium basin, thrown up by the impact that made it.',
			'Like several of the Moon\'s ranges, the Apennines are named after mountains on the Earth, here the Apennines of Italy. Apollo 15 landed at their foot at Hadley, about 260 km to the north-east.',
		],
		todo: [
			'Drop in on the mountain and drive up it.',
			'Drive off the steepest slope you can find and fly: from this high it\'s a long way down.',
			'Look up: the Earth is high in the southern sky.',
			'Search for Mons Hadley, or pick Hadley Rille from the start spots, to drive further along the range.',
		],
	},
	{
		slug: 'shackleton',
		spot: 'moon-shackleton',
		name: 'Shackleton crater',
		called: 'Shackleton',
		region: 'The south pole',
		title: 'Drive Shackleton Crater at the Moon\'s South Pole',
		description: 'Drive the rim of Shackleton, the crater at the Moon\'s south pole whose floor never sees the Sun, in 3D from NASA\'s maps, in low gravity. Free in your browser.',
		about: [
			'Shackleton is a crater about 21 km across at the Moon\'s south pole, named after the Antarctic explorer Ernest Shackleton. The pole itself is on its rim.',
			'The Sun never climbs more than a degree or two above the horizon there, so the inside of the crater is in shadow all the time, bitterly cold, and water ice may lie frozen in it. Parts of its rim, though, are in sunlight most of the time, which is why the region round the south pole is a favourite for missions to come: sunlight for power, and ice for water.',
			'From the pole the Earth sits on the horizon, rising and setting a little as the Moon rocks back and forth over the month (its libration).',
		],
		todo: [
			'Drive round the rim, then down into the crater and back out.',
			'Cross the crater, about 20 km, to the far rim and you\'re at the south pole.',
			'Search for "south pole" to drop in at the pole itself.',
		],
		game: 'World Drive lights every place on the Moon the same way, the sun 20° up, so here the crater\'s floor is lit as it never really is; and as so few of the Moon\'s heights span it, its bowl is softened and shallower than the real one.',
	},
	{
		slug: 'mare-orientale',
		spot: 'moon-orientale',
		name: 'Mare Orientale',
		region: 'The western limb',
		title: 'Drive Mare Orientale, the Moon\'s Great Ringed Basin',
		description: 'Drive Mare Orientale, the ringed basin on the Moon\'s western edge that\'s hard to see from the Earth, in 3D from NASA\'s maps, in low gravity. Free in your browser.',
		about: [
			'Mare Orientale is one of the youngest of the Moon\'s great impact basins: rings of mountains one inside another, the outermost, the Montes Cordillera, nearly a thousand kilometres across. Lava has filled only its middle, the small dark sea that gives it its name.',
			'It lies on the Moon\'s western limb, between the near and far sides, so from the Earth it\'s seen only edge-on, and its rings were first seen properly in photographs from orbit in the 1960s. Its name, the "Eastern Sea", is from when east and west on the Moon were reckoned as seen in the Earth\'s sky; they were swapped later, to agree with how they\'d be seen standing on the Moon.',
		],
		todo: [
			'Drop in on the dark middle of the basin and drive out toward its rings.',
			'Fly up and look out over the basin.',
			'Search for other basins: Mare Imbrium, Mare Crisium or the South Pole-Aitken basin.',
		],
		game: 'On the real Moon the Earth sits on the horizon here, rising and setting a little over the month; in World Drive it stays just below it, so from the ground the sky is all stars.',
	},
	{
		slug: 'tsiolkovskiy',
		spot: 'moon-tsiolkovskiy',
		name: 'Tsiolkovskiy crater',
		called: 'Tsiolkovskiy',
		region: 'The far side',
		title: 'Drive Tsiolkovskiy Crater on the Moon\'s Far Side',
		description: 'Drive Tsiolkovskiy, the far-side crater with a dark lava floor and a central peak, in 3D from NASA\'s maps: a side of the Moon never seen from the Earth. Free.',
		about: [
			'Tsiolkovskiy is a great crater on the far side of the Moon, named after Konstantin Tsiolkovsky, the Russian teacher who worked out much of the theory of rockets and spaceflight. It was one of the few features clear enough to name in the first photographs of the far side, taken by the Soviet probe Luna 3 in October 1959.',
			'The far side is almost all bright, cratered highland, with few of the dark lava plains of the side facing the Earth, so Tsiolkovskiy\'s floor, flooded with dark lava round a bright central peak, stands out.',
			'The Moon turns once on its axis for each time it goes round the Earth, so the same side always faces us: the far side can\'t be seen from the Earth, and from here the Earth is never in the sky.',
		],
		todo: [
			'Start by the central peak: climb it and jump off.',
			'Drive out across the dark floor to the walls.',
			'Look up: no Earth here, only the stars.',
		],
	},
	{
		slug: 'von-karman',
		spot: 'moon-change-4',
		name: 'Von Kármán crater',
		called: 'Von Kármán',
		region: 'The far side · Chang\'e 4, 2019',
		title: 'Drive Von Kármán Crater, Where Chang\'e 4 Landed',
		description: 'Drive Von Kármán, the crater where China\'s Chang\'e 4 made the first soft landing on the Moon\'s far side in 2019, in 3D from NASA\'s maps. Free in your browser.',
		about: [
			'Von Kármán is a large crater on the far side of the Moon, inside the South Pole-Aitken basin, the biggest and oldest of the Moon\'s known impact basins. It\'s named after Theodore von Kármán, the Hungarian-American engineer who was a pioneer of aeronautics and rocketry.',
			'On 3 January 2019 China\'s Chang\'e 4 landed on its floor, the first spacecraft to land gently on the far side, and sent out the rover Yutu-2. As the far side never faces the Earth, they talked to it through a relay satellite, Queqiao, out beyond the Moon.',
		],
		todo: [
			'Drop in on the floor where Chang\'e 4 came down: flat, smooth ground, good for speed.',
			'Drive to the crater\'s walls, tens of kilometres away, and climb them.',
			'Look up: no Earth in the sky here, only the stars.',
		],
		game: 'There\'s no lander or rover in World Drive, and the small craters round you are made up.',
	},
];

// What every Moon page says about how World Drive's Moon is made, and what's made up.
export const MOON_MADE = [
	'World Drive\'s Moon is the real Moon\'s shape: its heights are from the laser altimeter (LOLA) on NASA\'s Lunar Reconnaissance Orbiter, every quarter of a degree (7.6 km apart at the equator), so the seas, basins, mountains and big craters are where they are, and its colours are from the orbiter\'s camera (LROC). They\'re NASA\'s, in the public domain.',
	'Everything smaller than that is made up: the craters you drive among, from about 13 km across down to a few metres, and the gentle rolls of the ground, the same on every visit. There are no landers, flags or rover tracks in it.',
];

// Driving there, as a list on each Moon page and the Moon's own page.
export const MOON_DRIVING = [
	'<b>A sixth of the gravity.</b> A jump goes as high as on the Earth and lasts two and a half times as long, so there\'s time for more spins and flips (each is worth fewer points, to be fair to the Earth\'s).',
	'<b>The Earth in the sky.</b> Over the near side it hangs in the black sky, lit by the same sun, so it shows a phase. From the far side it\'s never in sight.',
	'<b>No water and no roads.</b> Grey dust and rock to the horizon, plains, crater rims and mountainsides.',
	'<b>On your own.</b> Driving with others is on the Earth: on the Moon you drive alone. Driving, air, drifts and tricks still earn XP, and your best runs go on the leaderboard (the bonuses for new start spots and areas are the Earth\'s).',
];
