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

// Live ships from AIS (needs a free AISStream key, see "Live ships" in the README).
export const AIS = {
	// Area to receive ships from: Burrard Inlet from English Bay (where ships wait at anchor)
	// to past Second Narrows.
	box: { south: 49.25, west: - 123.32, north: 49.34, east: - 122.95 },
	staleMinutes: 30, // greyed out after this long without a position report
	hideAfterHours: 6, // and hidden after this long
};

// Berths watched for ships: rectangles on the water, centred on east/north, with the long
// side along `heading`. Estimated from Google's imagery, so rename them to the terminal's own
// numbering and nudge them if a moored ship shows up outside its berth.
//
// `googleShip` is the ship that happened to be moored there when Google photographed the
// terminal (same heading as the berth). Once live AIS is running it is pressed flat and
// painted over with water, so a ship only shows at the berth when AIS says one is there.
// Remove it if Google's imagery changes.
export const BERTHS = [
	{ name: 'West berth', east: - 480, north: - 144, heading: 116, length: 280, width: 70, googleShip: { east: - 483, north: - 149, length: 260, width: 48 } },
	{ name: 'Middle berth', east: - 215, north: - 263, heading: 117, length: 280, width: 70, googleShip: { east: - 218, north: - 268, length: 245, width: 48 } },
	{ name: 'East berth', east: 43, north: - 221, heading: 56, length: 260, width: 70, googleShip: { east: 46, north: - 226, length: 230, width: 48 } },
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

// Your own detailed models. Put .glb / .gltf files in public/models/ and list them here
// (big files: run `npm run optimize-models` first, see the README).
// Use the in-app placement panel (press P) to line a model up with the Google tiles,
// then press "Copy config" and paste the result over the entry below.
//
// Optional extras:
//   flatten: true      press Google's mesh flat under the model (2 m around it; a number sets the margin)
//   recenter: false    keep the file's own origin instead of the middle of its footprint
export const MODELS = [
	// {
	// 	name: 'My section of the port',
	// 	url: 'models/my-section.glb',
	// 	east: 0,
	// 	north: 0,
	// 	up: null,
	// 	heading: 0,
	// 	scale: 1,
	// 	flatten: true,
	// },
];
