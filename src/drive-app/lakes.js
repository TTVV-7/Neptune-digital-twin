// The big, deep lakes whose beds Google's tiles may draw far from their shores, as they do the
// sea's (Lake Baikal's, 1.2 km under the ellipsoid where the lake's surface is 456 m over the sea):
// a pin on one whose ground is well under the lake's surface starts on that surface (main.js,
// sea.js), not on the bed. Lakes Google draws at their surface, as most are, drop in on that as
// before.
//
// height: the lake's surface over the sea (m), which sea.js puts that far over EGM96's geoid there
// (each country's heights are over its own mean sea level, within a metre or so of the geoid). Its
// source is beside it (the lake's Wikipedia article and what that cites, read in November 2026),
// and its deepest, to say why it's here. outline: its outline's names in Natural Earth's lakes at
// 1:10 million (the Caspian's is the other polygon of Natural Earth's ocean), which
// scripts/make-sea-mask.mjs puts in drive/public/sea/mask.bin, by its place in this list: so the
// map is made again whenever this list changes (sea.js won't read one made for another list).
// box: [ south, west, north, east ] (degrees) round the outline, a little wider than it (the
// script checks), so that only a pin near one asks the map.
export const LAKES = [
	// 455.5 m (Wikipedia, Lake Baikal); 1,642 m deep.
	{ name: 'Lake Baikal', height: 455.5, outline: [ 'Lake Baikal' ], box: [ 51.3, 103.5, 56, 110.2 ] },
	// −28 m (Wikipedia, Caspian Sea), falling by about 0.1 m a year since 1995; 1,025 m deep.
	{ name: 'the Caspian Sea', height: - 28, outline: [ 'Caspian Sea' ], box: [ 36.4, 46.5, 47.3, 55 ] },
	// 183.4 m (601.7 ft, the US Army Corps of Engineers' 2013 average); 406 m deep.
	{ name: 'Lake Superior', height: 183.4, outline: [ 'Lake Superior' ], box: [ 46.2, - 92.3, 49.2, - 84.2 ] },
	// 175.9 m (577 ft, the US EPA's Great Lakes physical facts), one lake joined at the Straits of
	// Mackinac; 281 m deep (Lake Michigan).
	{ name: 'Lakes Michigan and Huron', height: 175.9, outline: [ 'Lake Michigan', 'Lake Huron' ], box: [ 41.4, - 88.2, 46.6, - 79.5 ] },
	// 173.4 m (569 ft, the US EPA); 64 m deep.
	{ name: 'Lake Erie', height: 173.4, outline: [ 'Lake Erie' ], box: [ 41.2, - 83.7, 43.3, - 78.7 ] },
	// 74.1 m (243 ft, the US EPA); 244 m deep.
	{ name: 'Lake Ontario', height: 74.1, outline: [ 'Lake Ontario' ], box: [ 43, - 80, 44.7, - 75.6 ] },
	// 773 m (the International Lake Environment Committee's World Lake Database); 1,470 m deep.
	{ name: 'Lake Tanganyika', height: 773, outline: [ 'Lake Tanganyika' ], box: [ - 9, 28.8, - 3.1, 31.4 ] },
	// 468 m (Reader's Digest, Natural Wonders of the World, 1980); 706 m deep (the ILEC's).
	{ name: 'Lake Malawi', height: 468, outline: [ 'Lake Malawi' ], box: [ - 14.6, 33.7, - 9.3, 35.5 ] },
	// 1,135 m (DAHITI, the Technical University of Munich's satellite altimetry); 81 m deep.
	{ name: 'Lake Victoria', height: 1135, outline: [ 'Lake Victoria' ], box: [ - 3.2, 31.4, 0.7, 35.1 ] },
	// 156 m (the Encyclopedia of Earth); 446 m deep.
	{ name: 'Great Bear Lake', height: 156, outline: [ 'Great Bear Lake' ], box: [ 64.6, - 125.3, 67.2, - 117.3 ] },
	// 156 m (the Encyclopedia of Earth); 614 m deep.
	{ name: 'Great Slave Lake', height: 156, outline: [ 'Great Slave Lake' ], box: [ 60.6, - 117.9, 63, - 109.5 ] },
	// 5 m (Wikipedia, Lake Ladoga); 230 m deep.
	{ name: 'Lake Ladoga', height: 5, outline: [ 'Lake Ladoga' ], box: [ 59.7, 29.6, 62, 33.2 ] },
	// 33 m (Wikipedia, Lake Onega); 127 m deep.
	{ name: 'Lake Onega', height: 33, outline: [ 'Lake Onega' ], box: [ 60.7, 33.7, 63.1, 36.7 ] },
	// 3,812 m (the ILEC's); 281 m deep.
	{ name: 'Lake Titicaca', height: 3812, outline: [ 'Lago Titicaca' ], box: [ - 16.8, - 70.2, - 15, - 68.4 ] },
	// 1,607 m (Savvaitova and Petr, International Journal of Salt Lake Research, 1992); 668 m deep.
	{ name: 'Issyk-Kul', height: 1607, outline: [ 'Issyk-Kul' ], box: [ 42, 76, 42.9, 78.5 ] },
];
