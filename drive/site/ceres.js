// Ceres's own pages (worlddrive.app/ceres/<slug>/, built by build.js): one for each of Ceres's start
// spots on the globe's panel (CERES_SPOTS in src/drive-app/ceres-places.js, by `spot`), and the
// words Ceres's page (/ceres/) and each of them share. As for the Moon's, Mars's and Vesta's
// (moon.js, mars.js, vesta.js), each says what the place is, in a few true sentences, and what there
// is to do there in the game, with a title and description of its own, and nothing on one is copied
// from another. Facts are kept to what's well sourced (NASA's and JPL's, the IAU's gazetteer, the
// Dawn team's papers); where a number isn't certain it's left out.
//
// They're honest about the game too: World Drive's Ceres has the real Ceres's big shapes (the DLR's
// heights from Dawn's pictures, an eighth of a degree apart, about a kilometre at the equator) and
// its greys (Dawn's framing camera's, its bright spots white), but everything smaller is made up,
// and Dawn, which only orbited it, isn't in it. The heights and distances the pages give for the
// game were measured in drive/public/ceres/height.bin, over the spheroid the game takes up from
// (worlds.js's `level`), not taken from papers; nothing here says you can see what's narrower than
// those heights can show: the dome in Occator's middle, the tiny crater Kait, Juling's ice.
//
// The fields are the Moon's pages' (moon.js): slug, spot, name, called, region, title, description,
// about, todo and game.

export const CERES_PAGES = [
	{
		slug: 'occator',
		spot: 'ceres-occator',
		name: 'Occator',
		region: 'The bright spots · 92 km across',
		title: 'Drive Occator, the Crater of Ceres\'s Bright Spots, in 3D',
		description: 'Drive Occator, the crater 92 km across whose bright spots are salts left by brine, the most famous place on Ceres, in 3D from NASA\'s Dawn maps. Free in your browser.',
		about: [
			'Occator is a crater 92 km across in Ceres\'s northern hemisphere, famous for the bright spots on its floor: deposits of salts left by brine.',
			'The brightest, Cerealia Facula, is in a pit in its middle; the thinner Vinalia Faculae lie to the east.',
			'A study published in 2020 found that the brine came mostly from a chamber of melt made by the impact, and partly from a reservoir deeper down.',
		],
		todo: [
			'Drop in on Occator\'s floor, about 1 km under Ceres\'s level, and drive for the rim, about 45 km off and some 4 km higher.',
			'Drive about 20 km east to Vinalia Faculae, or search for them.',
			'Search for Cerealia Facula to drop in on the brightest spot of all.',
			'Jump off the rim back into the crater: in 2.9% of the gravity you\'re in the air for ages.',
		],
		game: 'In World Drive Occator\'s floor is a wide, flat bowl and its rim rises about 4 km over it; the bright spots are there on the ground, white in Dawn\'s pictures.',
	},
	{
		slug: 'cerealia-facula',
		spot: 'ceres-cerealia-facula',
		name: 'Cerealia Facula',
		region: 'The brightest spot on Ceres',
		title: 'Drive Cerealia Facula, the Brightest Spot on Ceres, in 3D',
		description: 'Drive across Cerealia Facula, the brightest spot on Ceres, salts in a pit in the middle of Occator crater, in 3D from NASA\'s Dawn maps, in low gravity. Free.',
		about: [
			'Cerealia Facula is the brightest spot on Ceres: a deposit of salts in a pit in the middle of Occator crater.',
			'The brine that left it came mostly from a chamber melted by the heat of the impact that dug Occator, and partly from brine deeper inside Ceres.',
			'In the pit\'s middle is a small dome, Cerealia Tholus, about 3 km across.',
		],
		todo: [
			'Drop in on the bright spot and drive off it any way you like: Occator\'s floor is wide and flat.',
			'Drive about 19 km east to Vinalia Faculae, the thinner bright spots.',
			'Head for Occator\'s rim, some 45 km out, and look back over the crater.',
		],
		game: 'Cerealia Facula is white in the picture of Ceres World Drive\'s ground is coloured with; its dome, Cerealia Tholus, is too small for World Drive\'s heights of Ceres, a kilometre apart.',
	},
	{
		slug: 'ahuna-mons',
		spot: 'ceres-ahuna-mons',
		name: 'Ahuna Mons',
		region: 'A lone ice volcano, 4 km high',
		title: 'Drive Off Ahuna Mons, the Ice Volcano on Ceres, in 3D',
		description: 'Drive off Ahuna Mons, a lone mountain about 4 km high on Ceres that\'s read as an ice volcano, in 3D from NASA\'s Dawn maps, in 2.9% of the gravity. Free.',
		about: [
			'Ahuna Mons is a lone mountain on Ceres, about 17 km wide and about 4 km high, with flanks that slope at 30 to 40°, covered with debris.',
			'Scientists read it as an ice volcano, a cryovolcano: one built by icy material welling up rather than molten rock. It was described in the journal Science in 2016.',
		],
		todo: [
			'Drop in on its top and drive off the edge: the ground round it is about 4.5 km lower, 15 to 20 km away.',
			'Fly off the steepest side at speed: in 2.9% of the gravity a jump lasts nearly six times as long as on the Earth.',
			'Search for Occator, about 670 km to the west-north-west, to drive among the bright spots.',
		],
		game: 'In World Drive Ahuna Mons stands about 4.5 km over the ground round it, but its flanks are gentler than the real 30 to 40°: heights a kilometre apart round them off.',
	},
	{
		slug: 'kerwan',
		spot: 'ceres-kerwan',
		name: 'Kerwan',
		region: 'The biggest crater, 280 km across',
		title: 'Drive Kerwan, the Biggest Crater on Ceres, in 3D',
		description: 'Drive Kerwan, the biggest and oldest certain impact basin on Ceres, about 280 km across, shallow and with no central peak, in 3D from NASA\'s Dawn maps. Free.',
		about: [
			'Kerwan, about 280 km across, is the biggest crater on Ceres, and its largest and oldest certain impact basin.',
			'It\'s shallow for its size, and has no central peak.',
		],
		todo: [
			'Drop in in the middle, about 6.4 km under Ceres\'s level, and drive for the rim, about 140 km off.',
			'Open up and drift: there\'s room to turn any way you like.',
			'Search for Dantu, about 310 km north-north-east, a young crater ringed by bright spots.',
		],
		game: 'Kerwan\'s floor rises so gently in World Drive, about 7 km over the 140 km to its rim, that from the middle it looks like open plain.',
	},
	{
		slug: 'yalode',
		spot: 'ceres-yalode',
		name: 'Yalode',
		region: 'A great southern basin',
		title: 'Drive Yalode, the Great Southern Basin of Ceres, in 3D',
		description: 'Drive Yalode, a giant basin about 260 km across in Ceres\'s southern hemisphere, next to the younger crater Urvara, in 3D from NASA\'s Dawn maps. Free in your browser.',
		about: [
			'Yalode is a giant basin about 260 km across in Ceres\'s southern hemisphere.',
			'Urvara, a younger crater about 170 km across, was made partly over its western side.',
		],
		todo: [
			'Drop in on the floor, about 4 km under Ceres\'s level, and drive for the rim, about 150 km off.',
			'Drive about 250 km west-south-west to Urvara, or search for it, and climb its central peak.',
			'Boost into overdrive across the floor: it\'s wide and gentle.',
		],
		game: 'In World Drive Yalode\'s rim, about 150 km from the middle, is some 5 km over its floor: far over Ceres\'s close horizon from the start.',
	},
	{
		slug: 'urvara',
		spot: 'ceres-urvara',
		name: 'Urvara',
		region: '170 km across, with a central peak',
		title: 'Drive Urvara and Its Central Peak on Ceres in 3D',
		description: 'Drive Urvara, a crater about 170 km across and 6 km deep on Ceres, up its central peak and out to its rim, in 3D from NASA\'s Dawn maps, in low gravity. Free.',
		about: [
			'Urvara is a crater about 170 km across in Ceres\'s southern hemisphere, about 6 km deep, with a central peak about 3 km high.',
			'It was made partly over Yalode, an older and bigger basin to its east.',
		],
		todo: [
			'Drop in on the floor and drive about 11 km north-west to the central peak, about 3 km higher.',
			'Jump off the peak: in 2.9% of the gravity you\'re up a long time.',
			'Climb out to the rim, 80 to 100 km away.',
		],
		game: 'In World Drive Urvara\'s floor is flat for 40 km round the start, and its rim rises about 6 km over it, 80 to 100 km away.',
	},
	{
		slug: 'dantu',
		spot: 'ceres-dantu',
		name: 'Dantu',
		region: 'A young crater ringed by bright spots',
		title: 'Drive Dantu, the Young Crater Ringed by Bright Spots on Ceres',
		description: 'Drive Dantu, a young crater about 125 km across on Ceres, its fractured floor ringed by small bright spots, in 3D from NASA\'s Dawn maps, in low gravity. Free.',
		about: [
			'Dantu is a young crater about 125 km across. Its floor is fractured, and it\'s ringed by small bright spots (faculae).',
		],
		todo: [
			'Drop in on the floor, about 4.7 km under Ceres\'s level: it\'s flat for 30 km round.',
			'Drive for the rim, about 60 km off and some 4 km higher.',
			'Search for Kerwan, about 310 km south-south-west, the biggest crater on Ceres.',
		],
		game: 'Dantu\'s bright spots show as pale patches on the ground in World Drive, from Dawn\'s pictures; its fractures are too narrow for heights a kilometre apart.',
	},
	{
		slug: 'haulani',
		spot: 'ceres-haulani',
		name: 'Haulani',
		region: 'A bright young crater, 34 km',
		title: 'Drive Haulani, the Bright Young Crater on Ceres, in 3D',
		description: 'Drive Haulani, a young crater about 34 km across on Ceres with bright rays thrown out by its impact, in 3D from NASA\'s Dawn maps, in 2.9% of the gravity. Free.',
		about: [
			'Haulani is a young crater, about 34 km across, with bright rays of material thrown out by the impact that made it.',
		],
		todo: [
			'Drop in on the floor and climb the rim, about 17 km off and nearly 3 km higher.',
			'Jump off the rim back in: in 2.9% of the gravity you hang over the crater.',
			'Drive about 110 km south-west to Kait, the little crater Ceres\'s longitudes start from.',
		],
		game: 'Haulani is bright in Dawn\'s pictures, so in World Drive its floor and rays are some of the palest ground on Ceres.',
	},
	{
		slug: 'ernutet',
		spot: 'ceres-ernutet',
		name: 'Ernutet',
		region: 'Where Dawn found organic matter',
		title: 'Drive Ernutet, Where Dawn Found Organic Matter on Ceres',
		description: 'Drive Ernutet, the crater on Ceres where NASA\'s Dawn found organic matter, the first seen from orbit in the asteroid belt, in 3D from Dawn\'s maps. Free.',
		about: [
			'Ernutet is a crater about 50 km across in Ceres\'s northern hemisphere.',
			'Round it, Dawn\'s VIR spectrometer found organic matter (aliphatic, chains of carbon and hydrogen): the first found from orbit on a body in the main asteroid belt, reported in Science in 2017.',
		],
		todo: [
			'Drop in on the floor and drive for the rim, 25 to 30 km off and 2 to 3 km higher.',
			'Take off over the rim at speed: in 2.9% of the gravity a jump lasts nearly six times as long.',
			'Search for Occator to drive among Ceres\'s bright spots.',
		],
		game: 'The organic matter is far too thin a trace for Dawn\'s pictures to show, and there\'s nothing of it in World Drive: just the crater, from Dawn\'s heights.',
	},
	{
		slug: 'juling',
		spot: 'ceres-juling',
		name: 'Juling',
		region: 'A crater with ice on its shaded wall',
		title: 'Drive Juling, the Crater with Ice on Its Wall, on Ceres',
		description: 'Drive Juling, a crater on Ceres where NASA\'s Dawn found water ice on its shaded wall, up its rim and over, in 3D from Dawn\'s maps, in low gravity. Free.',
		about: [
			'Juling is a crater in Ceres\'s southern hemisphere. On its wall in shadow, Dawn found water ice.',
		],
		todo: [
			'Drop in on the floor and climb the rim, about 10 km off, highest to the north and east.',
			'Jump the rim on the way out: in 2.9% of the gravity you\'re in the air for ages.',
			'Search for Kerwan to drive the biggest crater on Ceres.',
		],
		game: 'The ice is far too small a patch for World Drive\'s picture of Ceres to show; the crater is there, its rim 2 to 3 km over its floor.',
	},
	{
		slug: 'kait',
		spot: 'ceres-kait',
		name: 'Kait',
		region: 'Where Ceres\'s longitudes start',
		title: 'Drive Kait, the Little Crater That Marks Ceres\'s Longitudes',
		description: 'Drive to Kait, the tiny crater just south of Ceres\'s equator that its longitudes are measured from, at 0°, in 3D from NASA\'s Dawn maps, in low gravity. Free.',
		about: [
			'Kait is a tiny crater, under a kilometre across, just south of Ceres\'s equator. Ceres\'s longitudes are measured from it: it\'s at 0°, and it\'s kept there whenever the model of how Ceres turns is improved.',
		],
		todo: [
			'Drop in where Kait is, 2.1° south and 0° east, and drive.',
			'Type coordinates in the globe\'s search to drop in anywhere on Ceres, east positive, as the IAU has them.',
			'Drive about 110 km north-east to Haulani, a bright young crater.',
		],
		game: 'Kait is far smaller than the kilometre between World Drive\'s heights of Ceres, so there\'s no sign of it in the game: the craters round you are made up.',
	},
];

// What every Ceres page says about how World Drive's Ceres is made, and what's made up.
export const CERES_MADE = [
	'World Drive\'s Ceres is the real Ceres\'s shape: its heights are from the model of its shape the DLR made from the pictures of the framing camera on NASA\'s Dawn spacecraft, which orbited it, every eighth of a degree (about a kilometre apart at the equator), so its craters, basins and mountains are where they are; and its greys are from the framing camera\'s photographs of the whole of it, its bright spots white. Up is up from a spheroid 964 km across its equator and 892 km from pole to pole, about Ceres\'s own shape, not toward its middle.',
	'Everything smaller than that is made up: the craters you drive among, a few hundred metres across down to a few metres, and the gentle rolls of the ground, the same on every visit. Dawn never landed, and there\'s no spacecraft in it.',
];

// Driving there, as a list on each Ceres page and Ceres's own page.
export const CERES_DRIVING = [
	'<b>2.9% of the gravity.</b> A jump goes as high as on the Earth and lasts nearly six times as long, so there\'s time for many more spins and flips (each is worth fewer points, to be fair to the Earth\'s). And no ride is fast enough to fly off: it would take about 1,860 km/h.',
	'<b>A black sky full of stars.</b> No air, so the stars are out day and night, with the sun low in the south-west wherever you drive. Ceres has no moons.',
	'<b>A dark world.</b> Ceres is a very dark body: its ground is a dark grey, but for the bright spots in Occator and round Dantu.',
	'<b>No water and no roads.</b> Dust and rock to the horizon, a little over a kilometre off on level ground: crater floors, rims and the slopes of mountains.',
	'<b>On your own.</b> Driving with others is on the Earth and the Moon: on Ceres you drive alone. Driving, air, drifts and tricks still earn XP, and your best runs go on the leaderboard (the bonuses for new start spots and areas are the Earth\'s).',
];

// The rest of what Ceres's pages say (build.js): its page's title, description and words, the line
// over the coordinates, the search, its place in the Earth's pages' lists, and its credit.
export const CERES_SITE = {
	pages: CERES_PAGES,
	made: CERES_MADE,
	driving: CERES_DRIVING,
	// Its page, /ceres/.
	title: 'Drive on the Dwarf Planet Ceres in 3D, Free in Your Browser',
	description: 'Drive on the real Ceres in 3D, the dwarf planet in the asteroid belt, made from NASA\'s Dawn maps: Occator\'s bright spots and Ahuna Mons, in 2.9% of the gravity. Free.',
	social: 'Drive on the Dwarf Planet Ceres in 3D',
	cardAlt: 'Ceres from space in World Drive: pick anywhere on it, drop in and drive, free in your browser',
	lede: 'World Drive\'s globe turns to Ceres, a dwarf planet and the biggest body in the asteroid belt, about 940 km across: pick anywhere on it, drop in and drive, in 2.9% of the Earth\'s gravity under a black sky full of stars. Its craters, bright spots and mountains are where the real ones are, from NASA\'s Dawn mission.',
	// Said of the first of its places, which its Drive on Ceres pins.
	first: 'whose bright spots are salts left by brine',
	data: 'It\'s the whole of Ceres, from pole to pole, its heights from about 7 km under its level to about 9.4 km over it on Yamor Mons, near its north pole, made in your browser from a little over 9 MB of data, so it needs no map service: the globe\'s search knows every place on Ceres the IAU has named, its craters, bright spots, mountains and hills.',
	elsewhere: {
		heading: 'And the Earth, the Moon, Mars and Vesta',
		html: 'On the Earth, World Drive drops you into Google\'s photorealistic 3D map of the real world, anywhere: your own street, or <a href="/drive/">famous roads, bridges and cities</a> like the Golden Gate Bridge, Times Square and Monaco. And the globe turns to <a href="/moon/">the Moon</a>, <a href="/mars/">Mars</a> and <a href="/vesta/">Vesta</a> too, the asteroid Dawn visited before Ceres.',
	},
	// Where on it a place is, as its pages say.
	coordinates: 'planetocentric latitude and longitude, north and east positive',
	search: 'search for a crater, a bright spot or a mountain by name',
	// Among the Earth's places, in each one's list of the others, and on /drive/.
	tagline: 'Bright salt spots and an ice volcano',
	others: 'And to Ceres, the dwarf planet in the asteroid belt, from NASA\'s Dawn maps, in 2.9% of the Earth\'s gravity. <a href="/ceres/">Drive on Ceres</a>: Occator and its bright spots of salt, the lone ice volcano Ahuna Mons and the great crater Kerwan.',
	// Its pages' footer: Dawn's maps, made by the DLR, from the USGS's planetary maps, as the game
	// credits them.
	credit: 'World Drive is a free arcade driving game. Its Ceres is made from NASA\'s Dawn mission\'s maps (NASA/JPL-Caltech/UCLA/MPS/DLR/IDA): the DLR\'s model of its shape and the framing camera\'s photographs, as the USGS\'s <a href="https://planetarymaps.usgs.gov/mosaic/">planetary maps</a> have them; World Drive isn\'t made or endorsed by NASA, the DLR or the USGS.',
};
