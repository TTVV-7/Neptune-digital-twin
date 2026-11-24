// The cities you can drive in City Drive (/city/), each built from OpenStreetMap by
// scripts/make-city.py into drive/public/cities/<id>.json. Add one by running that script for its
// box and listing it here.
export const CITIES = [
	{
		id: 'vancouver',
		name: 'Vancouver',
		blurb: 'Downtown, Stanley Park, the North Shore to Neptune Terminals, and the bridges, on 1 m lidar terrain',
		file: '/cities/vancouver.json',
		// Its box (make-city.py's origin and size: metres east and north), for knowing it's here without
		// loading it (hybrid.js).
		origin: [ 49.3025, - 123.0975 ],
		size: [ 9063, 7228 ],
	},
];
