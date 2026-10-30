// Everything you are likely to tweak lives here.
//
// Positions are in metres in a local frame centred on SITE:
//   east  = metres east of the origin (negative = west)
//   north = metres north of the origin (negative = south, toward the water)
//   up    = metres above the origin height; null means "snap to the ground"

export const SITE = {
	name: 'Neptune Terminals',
	// Centre of the terminal footprint (OpenStreetMap way 564571990).
	lat: 49.3054,
	lon: - 123.0491,
};

// Where the camera starts: over Burrard Inlet, looking north at the terminal.
export const START = {
	east: 0,
	north: - 450,
	up: 120,
	heading: 0, // degrees clockwise from north
	pitch: - 15, // degrees, negative looks down
	mode: 'fly', // 'fly' or 'walk'
};

export const PLAYER = {
	eyeHeight: 1.7,
	walkSpeed: 4, // m/s
	runSpeed: 12,
	flySpeed: 40,
	flyBoost: 4, // multiplier while holding Shift in fly mode
	// Flying speeds up with height above the ground, so crossing the terminal from high up takes
	// seconds: x1 below `from` metres, x`factor` at `to` metres, never more than x`max`.
	flyHeight: { from: 20, to: 1000, factor: 30, max: 40 },
	jumpSpeed: 5,
	gravity: 9.81,
	stepHeight: 0.6, // tallest ledge you can walk up
	radius: 0.4, // how close you can get to a wall
	flyRadius: 1, // how close flying gets to walls, the ground and models
	bounce: 0.3, // share of your speed into a wall you bounce back with; 0 just stops you
	autoTurn: true, // turn the view along a wall you run or fly into head-on (T switches it at run time)
};

// The mouse wheel (or a trackpad's scroll and pinch) zooms like Google Earth: each notch flies a
// share of the way to the point under the cursor, or back away from it.
export const ZOOM = {
	step: 0.25, // share of the distance to that point per notch
	shiftStep: 0.5, // the same with Shift held
	minStep: 1, // metres: close to the ground a notch still moves at least this much
	time: 0.15, // seconds a notch takes to glide there
	maxDistance: 20000, // metres from the point: zooming out stops here
	minClimb: 20, // degrees: zooming out rises at least this steeply, tipping the view down to match
};

// Your own detailed models. Put .glb / .gltf files in public/models/ and list them here.
// Use the in-app placement panel (press P) to line a model up with the Google tiles,
// then press "Copy config" and paste the result over the entry below.
export const MODELS = [
	// {
	// 	name: 'My section of the port',
	// 	url: 'models/my-section.glb',
	// 	east: 0,
	// 	north: 0,
	// 	up: null,
	// 	heading: 0,
	// 	scale: 1,
	// },
];
