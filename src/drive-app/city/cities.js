// The cities you can drive in City Drive (/city/), each built from OpenStreetMap by
// scripts/make-city.py into drive/public/cities/<id>.json. Add one by running that script for its
// box and listing it here.
export const CITIES = [
	{
		id: 'vancouver',
		name: 'Vancouver',
		blurb: 'Downtown, Stanley Park and the bridges over False Creek and the Lions Gate',
		file: '/cities/vancouver.json',
		// Its box (make-city.py's origin and size: metres east and north), for knowing it's here without
		// loading it (hybrid.js).
		origin: [ 49.29275, - 123.1275 ],
		size: [ 4714, 5059 ],
		// Its ground's real heights (scripts/make-city-terrain.py): the city is laid over them.
		terrain: '/cities/vancouver-terrain.bin',
	},
];
