// Vesta's own pages (worlddrive.app/vesta/<slug>/, built by build.js): one for each of Vesta's start
// spots on the globe's panel (VESTA_SPOTS in src/drive-app/vesta-places.js, by `spot`), and the
// words Vesta's page (/vesta/) and each of them share. As for the Moon's and Mars's (moon.js,
// mars.js), each says what the place is, in a few true sentences, and what there is to do there in
// the game, with a title and description of its own, and nothing on one is copied from another.
// Facts are kept to what's well sourced (NASA's and JPL's, the IAU's gazetteer, the Dawn team's
// papers); where a number isn't certain it's left out.
//
// They're honest about the game too: World Drive's Vesta has the real Vesta's big shapes (the DLR's
// heights from Dawn's pictures, an eighth of a degree apart, about 570 m at the equator) and its
// greys (Dawn's framing camera's), but everything smaller is made up, and Dawn, which only orbited
// it, isn't in it. The heights and distances the pages give for the game (how far a rim is, how much
// lower a floor) were measured in drive/public/vesta/height.bin, over the spheroid the game takes
// up from (worlds.js's `level`), not taken from papers; nothing here says you can see what's
// narrower than those heights can show: Marcia's and Cornelia's pits, the tiny crater Claudia.
//
// The fields are the Moon's pages' (moon.js): slug, spot, name, called, region, title, description,
// about, todo and game.

export const VESTA_PAGES = [
	{
		slug: 'rheasilvia-central-peak',
		spot: 'vesta-rheasilvia-peak',
		name: 'Rheasilvia\'s central peak',
		region: 'The south pole basin · its central peak',
		title: 'Drive Rheasilvia\'s Central Peak, the Great Mountain on Vesta',
		description: 'Drive down the central peak of Rheasilvia, the giant basin at Vesta\'s south pole, rising some 20 km over the floor round it, in 3D from NASA\'s Dawn maps. Free.',
		about: [
			'Rheasilvia is the great impact basin round Vesta\'s south pole, about 505 km across: about 90% of Vesta\'s own width.',
			'In its middle stands a central peak about 200 km wide that rises some 19 to 22 km over its base. Guinness World Records lists it as the tallest central peak of any impact crater.',
		],
		todo: [
			'Start on the top and drive down: the ground falls about 9 km in the first 20 km to the south-east.',
			'Drive off the steepest slope you can find: in 2.5% of the gravity a jump lasts about six times as long as on the Earth.',
			'Search for Rheasilvia to drop in on the peak\'s north flank, about 30 km from the top.',
			'Search for Matronalia Rupes to drop in on a scarp high on the basin\'s rim.',
		],
		game: 'In World Drive the peak is a broad dome, some 200 km across, rather than a sharp summit: its top is about 18 km over the basin\'s floor 100 km off, and the lowest place on World Drive\'s Vesta, about 22 km under its level, is on that floor about 120 km from the top.',
	},
	{
		slug: 'rheasilvia',
		spot: 'vesta-rheasilvia',
		name: 'Rheasilvia',
		region: 'The giant basin at the south pole',
		title: 'Drive Rheasilvia, the Giant Basin at Vesta\'s South Pole',
		description: 'Drive Rheasilvia, the impact basin some 500 km across that covers Vesta\'s south pole, from its central peak down to its floor and out to its rim, in 3D. Free.',
		about: [
			'Vesta is 572 by 557 by 446 km, far from round, and Rheasilvia, an impact basin about 505 km across, covers much of its southern half. The IAU\'s gazetteer gives it as 450 km.',
			'It was made partly over an older giant basin, Veneneia, about 400 km across. On its rim is Matronalia Rupes, a scarp about 210 km long.',
		],
		todo: [
			'Drop in on the central peak\'s north flank, about 4 km over Vesta\'s level, and drive up to its top, about 30 km south and 3 km higher.',
			'Drive down the other way, north-west to the basin\'s floor: 50 km off, it\'s some 14 km lower.',
			'Head for the rim: about 250 km west-north-west of the middle is the highest place on World Drive\'s Vesta, about 19.5 km over its level.',
		],
		game: 'In World Drive the basin is far too big to see across: Vesta\'s horizon is close, and from the floor the rim is long out of sight over it.',
	},
	{
		slug: 'marcia',
		spot: 'vesta-snowman',
		name: 'Marcia',
		region: 'The Snowman\'s biggest crater',
		title: 'Drive Marcia, the Biggest of Vesta\'s Snowman Craters, in 3D',
		description: 'Drive Marcia, the biggest of the three craters on Vesta that look like a snowman, climb its rim and drive on to the others, in 3D from NASA\'s Dawn maps. Free.',
		about: [
			'Marcia, about 68 km across, is the biggest of three craters in a row in Vesta\'s northern hemisphere that look, from above, like a snowman: Marcia, Calpurnia (50 km) and Minucia (23 km).',
			'Its floor is pitted. Marcia and Calpurnia may have been made by a double impact; Minucia, the smallest, by a later one.',
		],
		todo: [
			'Drop in on Marcia\'s floor, about 15 km under Vesta\'s level, and climb out: the rim is 30 to 40 km off.',
			'Drive about 56 km north-east to Calpurnia, the Snowman\'s middle crater, or search for it.',
			'Keep going north-east to Minucia, the smallest, about 94 km from the start.',
			'Jump off the rim on the way back down: in 2.5% of the gravity you\'re in the air a long time.',
		],
		game: 'In World Drive Marcia is a deep bowl, its rim 6 to 12 km over its floor and highest to the east; its pits are far too small for heights 570 m apart.',
	},
	{
		slug: 'calpurnia',
		spot: 'vesta-calpurnia',
		name: 'Calpurnia',
		region: 'The Snowman\'s middle crater',
		title: 'Drive Calpurnia, the Middle of Vesta\'s Snowman Craters',
		description: 'Drive Calpurnia, the 50 km crater in the middle of Vesta\'s Snowman, between Marcia and Minucia, in 3D from NASA\'s Dawn maps, in 2.5% of the gravity. Free.',
		about: [
			'Calpurnia, about 50 km across, is the middle of the three craters of Vesta\'s Snowman, with Marcia to its south-west and Minucia to its north-east.',
			'It and Marcia may have been made together, by a double impact. Minucia, about 23 km across, was made later.',
		],
		todo: [
			'Drop in on Calpurnia\'s floor, about 7 km under Vesta\'s level, and climb its rim to the east.',
			'Drive about 39 km north-east to Minucia, the smallest of the three.',
			'Drive south-west down into Marcia, the biggest, about 56 km away.',
		],
		game: 'In World Drive Calpurnia\'s rim is high to the north and east, some 10 km over its floor, and low to the south-west, where it meets Marcia.',
	},
	{
		slug: 'divalia-fossae',
		spot: 'vesta-divalia-fossae',
		name: 'Divalia Fossae',
		region: 'The troughs round the equator',
		title: 'Drive Divalia Fossae, the Troughs Round Vesta\'s Equator',
		description: 'Drive across Divalia Fossae, the great troughs that run round Vesta\'s equator, the biggest some 465 km long and 22 km wide, in 3D from NASA\'s Dawn maps. Free.',
		about: [
			'Divalia Fossae are the troughs that run round Vesta\'s equator. The biggest, as JPL gives it, is about 465 km long, up to 22 km wide and about 5 km deep.',
			'The IAU\'s gazetteer gives the system as 549 km long. Its partner in the north is Saturnalia Fossae.',
		],
		todo: [
			'Drop in among the troughs and drive north or south across them: the ground rises and falls 2 to 4 km between troughs and ridges.',
			'Drive east or west along a trough: they run round Vesta\'s middle.',
			'Take off over a ridge at speed: in 2.5% of the gravity you\'re up for ages.',
			'Search for Saturnalia Fossae to drive the troughs in the north.',
		],
		game: 'In World Drive the troughs are in Dawn\'s heights, softened: heights 570 m apart round off their walls, and the narrowest disappear.',
	},
	{
		slug: 'matronalia-rupes',
		spot: 'vesta-matronalia-rupes',
		name: 'Matronalia Rupes',
		region: 'A scarp on Rheasilvia\'s rim',
		title: 'Drive Off Matronalia Rupes, a Scarp High on Vesta in 3D',
		description: 'Drive off Matronalia Rupes, the scarp some 210 km long on the rim of Vesta\'s giant Rheasilvia basin, about 15 km up, in 3D from NASA\'s Dawn maps. Free.',
		about: [
			'Matronalia Rupes is a scarp about 210 km long on the rim of Rheasilvia, the giant basin round Vesta\'s south pole.',
			'It stands about 16 km over Vesta\'s mean level, among the highest ground on Vesta.',
		],
		todo: [
			'Drop in near the top, about 15 km over Vesta\'s level, and drive off the edge to the south: the ground falls about 13 km in 20 km.',
			'Drive along the top, north of the start, where it\'s highest, about 16 km up.',
			'Drive down into Rheasilvia, and search for its central peak to drop in on that.',
		],
		game: 'In World Drive the scarp is a long, steep slope, not a cliff: heights 570 m apart round off its edge.',
	},
	{
		slug: 'veneneia',
		spot: 'vesta-veneneia',
		name: 'Veneneia',
		region: 'An older basin, 400 km across',
		title: 'Drive Veneneia, the Older Giant Basin on Vesta, in 3D',
		description: 'Drive Veneneia, the giant basin about 400 km across on Vesta that Rheasilvia was made partly over, down to the lowest ground on Vesta, in 3D from Dawn\'s maps. Free.',
		about: [
			'Veneneia is a giant impact basin about 400 km across in Vesta\'s southern hemisphere.',
			'It\'s older than Rheasilvia, the even bigger basin round the south pole, which was made partly over it.',
		],
		todo: [
			'Drop in in Veneneia\'s middle, about 7.5 km under Vesta\'s level, and drive south-south-east down toward Rheasilvia\'s floor.',
			'Find the lowest place on World Drive\'s Vesta, about 22 km under its level, on that floor about 135 km from the start, where the two basins overlap.',
			'Drive west instead, uphill: 150 km off, the ground is some 10 km higher.',
		],
		game: 'In World Drive Veneneia is hard to tell as a basin: Rheasilvia cut away its southern part, so from its middle the ground falls away to the south.',
	},
	{
		slug: 'saturnalia-fossae',
		spot: 'vesta-saturnalia-fossae',
		name: 'Saturnalia Fossae',
		region: 'The northern troughs',
		title: 'Drive Saturnalia Fossae, the Northern Troughs of Vesta',
		description: 'Drive Saturnalia Fossae, the system of troughs some 345 km long across Vesta\'s northern hemisphere, in 3D from NASA\'s Dawn maps, in low gravity. Free.',
		about: [
			'Saturnalia Fossae is a system of troughs about 345 km long in Vesta\'s northern hemisphere.',
			'It\'s one of Vesta\'s two great systems of troughs; the other, Divalia Fossae, runs round its equator.',
		],
		todo: [
			'Drop in among the troughs, about 8 km under Vesta\'s level, and drive south: the ground falls about 6 km in 40 km.',
			'Open up and drift: the ground round the start is gentle.',
			'Search for Divalia Fossae to drive the troughs round the equator.',
		],
		game: 'In World Drive the troughs here are broad rises and falls; the narrower ones are softened between heights 570 m apart.',
	},
	{
		slug: 'vestalia-terra',
		spot: 'vesta-vestalia-terra',
		name: 'Vestalia Terra',
		region: 'A highland plateau',
		title: 'Drive Vestalia Terra, the Highland Plateau on Vesta in 3D',
		description: 'Drive Vestalia Terra, a highland plateau about 340 km across just south of Vesta\'s equator, up to the highest ground on Vesta, in 3D from NASA\'s Dawn maps. Free.',
		about: [
			'Vestalia Terra is a large highland plateau, about 340 km across, just south of Vesta\'s equator.',
			'Cornelia, a crater with a pitted floor, lies about 85 km west-south-west of its middle.',
		],
		todo: [
			'Drop in and drive south, uphill: the plateau rises toward Rheasilvia\'s rim.',
			'Drive about 120 km south-south-west to the highest place on World Drive\'s Vesta, about 19.5 km over its level, on Rheasilvia\'s rim.',
			'Search for Cornelia to drop in on its floor.',
		],
		game: 'In World Drive the start is a little under Vesta\'s level, and the ground climbs some 20 km over the 120 km south to Rheasilvia\'s rim.',
	},
	{
		slug: 'cornelia',
		spot: 'vesta-cornelia',
		name: 'Cornelia',
		region: 'A pitted crater, 15 km',
		title: 'Drive Cornelia, the Pitted Crater on Vesta, in 3D',
		description: 'Drive Cornelia, a crater about 15 km across on Vesta whose floor is pitted where water escaped as gas after the impact, in 3D from NASA\'s Dawn maps. Free.',
		about: [
			'Cornelia is a crater about 15 km across. Its floor is pitted terrain, thought to have formed as water held in the rock escaped as gas after the impact.',
			'Marcia, the biggest of Vesta\'s Snowman craters, has the same kind of pits.',
		],
		todo: [
			'Drop in on Cornelia\'s floor and climb out over its rim, which is highest to the south.',
			'Jump off the rim back into the crater: in 2.5% of the gravity you hang over it.',
			'Search for Marcia, about 185 km west-north-west, to drive its pitted floor.',
		],
		game: 'Cornelia is about 26 of World Drive\'s heights of Vesta across, so its bowl is there, deep for its size: its rim stands 2 to 5 km over its floor. Its pits are far too small to show.',
	},
	{
		slug: 'claudia',
		spot: 'vesta-claudia',
		name: 'Claudia',
		region: 'Where Vesta\'s longitudes start',
		title: 'Drive Claudia, the Little Crater That Marks Vesta\'s Longitudes',
		description: 'Drive to Claudia, the tiny crater the IAU made the mark of Vesta\'s longitudes in 2014, at 146° east, in 3D from NASA\'s Dawn maps, in low gravity. Free.',
		about: [
			'Claudia is a tiny crater, about 600 m across, just south of Vesta\'s equator. In 2014 the IAU made it the mark Vesta\'s longitudes are measured from, putting it at 146° east.',
			'Papers and pictures from the time of the Dawn mission used an older frame, in which Claudia was at 356° east: their longitudes are 150° off the IAU\'s, which World Drive uses.',
		],
		todo: [
			'Drop in where Claudia is, 1.65° south and 146° east, and drive.',
			'Type coordinates in the globe\'s search to drop in anywhere on Vesta, in the IAU\'s longitudes.',
			'Search for Divalia Fossae, the troughs round Vesta\'s equator.',
		],
		game: 'At 600 m across Claudia is about one of World Drive\'s heights of Vesta wide, so there\'s no sign of it in the game: the craters round you are made up.',
	},
];

// What every Vesta page says about how World Drive's Vesta is made, and what's made up.
export const VESTA_MADE = [
	'World Drive\'s Vesta is the real Vesta\'s shape: its heights are from the model of its shape the DLR made from the pictures of the framing camera on NASA\'s Dawn spacecraft, which orbited it, every eighth of a degree (about 570 m apart at the equator), so its basins, troughs, scarps and big craters are where they are; and its greys are from the framing camera\'s photographs of the whole of it. Up is up from a spheroid 570 km across its equator and 458 km from pole to pole, the level the Dawn team gives Vesta\'s heights from, not toward Vesta\'s middle.',
	'Everything smaller than that is made up: the craters you drive among, under a kilometre across down to a few metres, and the gentle rolls of the ground, the same on every visit. Dawn never landed, and there\'s no spacecraft in it.',
];

// Driving there, as a list on each Vesta page and Vesta's own page.
export const VESTA_DRIVING = [
	'<b>2.5% of the gravity.</b> A jump goes as high as on the Earth and lasts about six times as long, so there\'s time for many more spins and flips (each is worth fewer points, to be fair to the Earth\'s). And no ride is fast enough to fly off: it would take about 1,300 km/h.',
	'<b>A black sky full of stars.</b> No air, so the stars are out day and night, with the sun low in the south-west wherever you drive. Vesta has no moons.',
	'<b>A world far from round.</b> Vesta is 572 by 557 by 446 km, so its ground curves away fast and the horizon is close, about a kilometre off on level ground, and its slopes go on for tens of kilometres.',
	'<b>No water and no roads.</b> Grey dust and rock to the horizon: basin floors, crater rims, troughs and scarps.',
	'<b>On your own.</b> Driving with others is on the Earth: on Vesta you drive alone. Driving, air, drifts and tricks still earn XP, and your best runs go on the leaderboard (the bonuses for new start spots and areas are the Earth\'s).',
];

// The rest of what Vesta's pages say (build.js): its page's title, description and words, the line
// over the coordinates, the search, its place in the Earth's pages' lists, and its credit.
export const VESTA_SITE = {
	pages: VESTA_PAGES,
	made: VESTA_MADE,
	driving: VESTA_DRIVING,
	// Its page, /vesta/.
	title: 'Drive on the Asteroid Vesta in 3D, Free in Your Browser',
	description: 'Drive on the real asteroid Vesta in 3D, made from NASA\'s Dawn maps: the giant Rheasilvia basin and its peak, the Snowman craters and the troughs, in 2.5% of the gravity.',
	social: 'Drive on the Asteroid Vesta in 3D',
	cardAlt: 'Vesta from space in World Drive: pick anywhere on it, drop in and drive, free in your browser',
	lede: 'World Drive\'s globe turns to Vesta, an asteroid 525 km across and far from round: pick anywhere on it, drop in and drive, in 2.5% of the Earth\'s gravity under a black sky full of stars. Its basins, troughs and craters are where the real ones are, from NASA\'s Dawn mission.',
	// Said of the first of its places, which its Drive on Vesta pins.
	first: 'which rises some 20 km over the floor of Vesta\'s biggest basin',
	data: 'It\'s the whole of Vesta (the little round its north pole that Dawn couldn\'t map is filled in on its map), its heights from about 22 km under its level on Rheasilvia\'s floor to about 19.5 km over it on the basin\'s rim, made in your browser from about 8.7 MB of data, so it needs no map service: the globe\'s search knows every place on Vesta the IAU has named, its craters, troughs, scarps and hills.',
	elsewhere: {
		heading: 'And the Earth, the Moon, Mars and Ceres',
		html: 'On the Earth, World Drive drops you into Google\'s photorealistic 3D map of the real world, anywhere: your own street, or <a href="/drive/">famous roads, bridges and cities</a> like the Golden Gate Bridge, Times Square and Monaco. And the globe turns to <a href="/moon/">the Moon</a>, <a href="/mars/">Mars</a> and <a href="/ceres/">Ceres</a> too, the dwarf planet Dawn visited after Vesta.',
	},
	// Where on it a place is, as its pages say.
	coordinates: 'planetocentric latitude and longitude, north and east positive',
	search: 'search for a crater, a trough or a basin by name',
	// Among the Earth's places, in each one's list of the others, and on /drive/.
	tagline: 'The giant Rheasilvia basin and its peak',
	others: 'And to the asteroid Vesta, 525 km across and far from round, from NASA\'s Dawn maps, in 2.5% of the Earth\'s gravity. <a href="/vesta/">Drive on Vesta</a>: the giant Rheasilvia basin and its central peak, the Snowman craters and the troughs round its middle.',
	// Its pages' footer: Dawn's maps, made by the DLR, from the USGS's planetary maps, as the game
	// credits them.
	credit: 'World Drive is a free arcade driving game. Its Vesta is made from NASA\'s Dawn mission\'s maps (NASA/JPL-Caltech/UCLA/MPS/DLR/IDA): the DLR\'s model of its shape and the framing camera\'s photographs, as the USGS\'s <a href="https://planetarymaps.usgs.gov/mosaic/">planetary maps</a> have them; World Drive isn\'t made or endorsed by NASA, the DLR or the USGS.',
};
