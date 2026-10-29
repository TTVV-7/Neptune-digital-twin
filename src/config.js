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

// Press 1-9 to jump to these (also listed under H). Walk viewpoints drop you onto the
// ground, so they need no height.
export const VIEWPOINTS = [
	{ name: 'Over the inlet', east: 0, north: - 450, up: 120, heading: 0, pitch: - 15, mode: 'fly' },
	{ name: 'Whole terminal from the west', east: - 700, north: - 250, up: 200, heading: 80, pitch: - 18, mode: 'fly' },
	{ name: 'Storage sheds from the south-east', east: 250, north: - 250, up: 60, heading: 315, pitch: - 10, mode: 'fly' },
	{ name: 'On foot: west berth wharf', east: - 327, north: - 143, heading: 110, pitch: 0, mode: 'walk' },
	{ name: 'On foot: north side of the coal pile', east: - 62, north: 191, heading: 200, pitch: 0, mode: 'walk' },
];

export const PLAYER = {
	eyeHeight: 1.7,
	walkSpeed: 4, // m/s
	runSpeed: 12,
	flySpeed: 40,
	flyBoost: 4, // multiplier while holding Shift in fly mode
	jumpSpeed: 5,
	gravity: 9.81,
	stepHeight: 0.6, // tallest ledge you can walk up
	radius: 0.4, // how close you can get to a wall
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
