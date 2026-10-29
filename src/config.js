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
	hideAfterHours: 6, // and hidden after this long; a ship moored in a berth keeps it until then
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

// Named places on site; press M to add your own or move these. A block (length, width and
// height in metres, long side along `heading`) is drawn for things Google's mesh doesn't
// show; leave it out for a label only. These were marked up on a screenshot, so check them.
export const PLACES = [
	{ name: 'SWC ATCO trailer', east: - 77, north: - 132, heading: 0, length: 8, width: 4, height: 3 },
	{ name: 'Dumper 2', east: 9.5, north: - 152 },
	{ name: 'g3', east: 211, north: - 120 },
];

// Vehicles to drive around the site with T, to see whether they fit. Sizes are in metres
// and only typical: set the real vehicle's and load's in the T panel, then "Copy vehicle
// config" and paste it here.
//   look            the shape drawn
//   wheelbase       front axle (group) to rear axle (group); frontOverhang is front to front axle
//   steerAxles, driveAxles   axles in the front and rear groups (drawn, and for the record)
//   maxSteer        degrees of wheel cut; maxSpeed in km/h
//   trailers        towed in order. Each hooks on `hitch` metres ahead of the axle group of the
//                   unit in front (negative: a pintle hook behind it), and `kingpinToAxle` runs
//                   from that hitch back to its own axle group. `frontOverhang` is how far the
//                   hitch is behind the trailer's front (negative for a drawbar reaching ahead).
//                   A full trailer is two units: its dolly, then the trailer on the dolly's turntable.
//   legal           BC legal weights in kg: the most the whole vehicle and each axle group
//                   (front to back) may carry, from the BC Stone, Sand & Gravel Association's
//                   truck weights chart (2022).
const STEER_NOTE = 'A 9,100 kg steer axle needs 445 mm wide tires and an axle rated for it.';
const DUMP = {
	single: { look: 'dump', length: 7.4, width: 2.6, height: 3.4, wheelbase: 4.6, frontOverhang: 1.2, steerAxles: 1, driveAxles: 1, maxSteer: 38, maxSpeed: 30 },
	tandem: { look: 'dump', length: 9.2, width: 2.6, height: 3.4, wheelbase: 5.4, frontOverhang: 1.3, steerAxles: 1, driveAxles: 2, maxSteer: 36, maxSpeed: 30 },
	tridem: { look: 'dump', length: 10.0, width: 2.6, height: 3.4, wheelbase: 5.8, frontOverhang: 1.3, steerAxles: 1, driveAxles: 3, maxSteer: 36, maxSpeed: 30 },
};
const TRACTOR = {
	tandem: { look: 'tractor', length: 7.0, width: 2.6, height: 3.9, wheelbase: 4.6, frontOverhang: 1.2, steerAxles: 1, driveAxles: 2, maxSteer: 38, maxSpeed: 30 },
	tridem: { look: 'tractor', length: 8.7, width: 2.6, height: 3.9, wheelbase: 5.6, frontOverhang: 1.2, steerAxles: 1, driveAxles: 3, maxSteer: 38, maxSpeed: 30 },
};
const PUP = {
	tandem: { name: 'pup', look: 'dump-trailer', length: 6.6, width: 2.6, height: 3.2, frontOverhang: - 2.2, kingpinToAxle: 6.1, axles: 2 },
	tridem: { name: 'pup', look: 'dump-trailer', length: 7.6, width: 2.6, height: 3.2, frontOverhang: - 2.2, kingpinToAxle: 6.6, axles: 3 },
};
const FULL = {
	triAxle: [
		{ name: 'dolly', look: 'dolly', length: 1.2, width: 2.5, height: 1.1, kingpinToAxle: 3.4, axles: 1 },
		{ name: 'full trailer', look: 'dump-trailer', length: 8.0, width: 2.6, height: 3.2, hitch: 0, frontOverhang: 1.1, kingpinToAxle: 5.6, axles: 2 },
	],
	quadAxle: [
		{ name: 'dolly', look: 'dolly', length: 2.6, width: 2.5, height: 1.1, kingpinToAxle: 3.8, axles: 2 },
		{ name: 'full trailer', look: 'dump-trailer', length: 9.3, width: 2.6, height: 3.2, hitch: 0, frontOverhang: 1.6, kingpinToAxle: 6.4, axles: 2 },
	],
};
const SEMI = {
	tandemEndDump: { name: 'trailer', look: 'end-dump', length: 11.6, width: 2.6, height: 3.4, hitch: 0.3, frontOverhang: 0.9, kingpinToAxle: 9.4, axles: 2 },
	tridemBellyDump: { name: 'trailer', look: 'belly-dump', length: 13.0, width: 2.6, height: 3.4, hitch: 0.3, frontOverhang: 0.9, kingpinToAxle: 10.0, axles: 3 },
};

// A dump truck towing a pup or a full trailer, hooked on 0.2 m behind the truck's frame.
function towing( name, truck, trailers, legal ) {

	const pintle = - ( truck.length - truck.frontOverhang - truck.wheelbase + 0.2 );
	return { name, ...truck, trailers: trailers.map( ( trailer, i ) => ( { ...trailer, hitch: i === 0 ? pintle : trailer.hitch } ) ), legal };

}

export const VEHICLES = [
	{ name: 'Car (SUV)', look: 'car', length: 4.8, width: 1.9, height: 1.75, wheelbase: 2.85, frontOverhang: 0.95, maxSteer: 36, maxSpeed: 40 },
	{ name: 'Pickup truck', look: 'pickup', length: 5.9, width: 2.0, height: 1.9, wheelbase: 3.7, frontOverhang: 0.9, maxSteer: 35, maxSpeed: 40 },
	{ name: 'Mobile crane, travelling', look: 'crane', length: 13.5, width: 2.75, height: 4.0, wheelbase: 7.5, frontOverhang: 2.6, steerAxles: 2, driveAxles: 3, maxSteer: 30, maxSpeed: 25 },
	{
		name: 'Semi-trailer, 53 ft', ...TRACTOR.tandem,
		trailers: [ { name: 'trailer', look: 'trailer', length: 16.2, width: 2.6, height: 4.15, hitch: 0.3, frontOverhang: 1.0, kingpinToAxle: 12.5, axles: 2 } ],
	},
	{
		name: 'Lowbed with oversize load', ...TRACTOR.tandem, maxSpeed: 25,
		trailers: [ { name: 'lowbed and load', look: 'lowbed', length: 16.0, width: 4.0, height: 5.0, hitch: 0.3, frontOverhang: 1.5, kingpinToAxle: 12.0, axles: 3 } ],
	},

	// Gravel trucks, as on the BCSSGA truck weights chart.
	{ name: 'Single axle dump (18,200 kg)', ...DUMP.single, legal: { gvw: 18200, groups: [ 9100, 9100 ], note: STEER_NOTE } },
	{ name: 'Tandem dump (26,100 kg)', ...DUMP.tandem, legal: { gvw: 26100, groups: [ 9100, 17000 ], note: STEER_NOTE } },
	{ name: 'Tridem dump (33,100 kg)', ...DUMP.tridem, legal: { gvw: 33100, groups: [ 9100, 24000 ], note: STEER_NOTE } },
	{
		name: 'Tandem steer dump (34,000 kg)', ...DUMP.tandem, length: 10.8, wheelbase: 5.9, frontOverhang: 2.2, steerAxles: 2, maxSteer: 30,
		legal: { gvw: 34000, groups: [ 17000, 17000 ] },
	},
	{
		name: 'Tandem steer slinger (40,700 kg)', ...DUMP.tridem, look: 'slinger', length: 12.0, wheelbase: 6.4, frontOverhang: 2.2, steerAxles: 2, maxSteer: 30,
		legal: { gvw: 40700, groups: [ 17000, 24000 ], note: 'The most any single vehicle may weigh.' },
	},
	towing( 'Tandem dump + tandem pup (43,100 kg)', DUMP.tandem, [ PUP.tandem ], { gvw: 43100, groups: [ 9100, 17000, 17000 ] } ),
	towing( 'Tandem dump + tridem pup (47,100 kg)', DUMP.tandem, [ PUP.tridem ], { gvw: 47100, groups: [ 9100, 17000, 21000 ] } ),
	towing( 'Tridem dump + tandem pup (50,100 kg)', DUMP.tridem, [ PUP.tandem ], { gvw: 50100, groups: [ 9100, 24000, 17000 ] } ),
	towing( 'Tridem dump + tridem pup (54,100 kg)', DUMP.tridem, [ PUP.tridem ], { gvw: 54100, groups: [ 9100, 24000, 21000 ] } ),
	towing( 'Tandem dump + tri-axle full trailer (50,100 kg)', DUMP.tandem, FULL.triAxle, { gvw: 50100, groups: [ 9100, 17000, 9100, 17000 ], note: 'Full trailer 24,000 kg at most.' } ),
	towing( 'Tandem dump + quad-axle full trailer (60,100 kg)', DUMP.tandem, FULL.quadAxle, { gvw: 60100, groups: [ 9100, 17000, 17000, 17000 ], note: 'Full trailer 34,000 kg at most.' } ),
	towing( 'Tridem dump + tri-axle full trailer (57,100 kg)', DUMP.tridem, FULL.triAxle, { gvw: 57100, groups: [ 9100, 24000, 9100, 17000 ], note: 'Full trailer 24,000 kg at most.' } ),
	towing( 'Tridem dump + quad-axle full trailer (63,500 kg)', DUMP.tridem, FULL.quadAxle, { gvw: 63500, groups: [ 9100, 24000, 17000, 17000 ], note: 'Full trailer 31,000 kg at most, if its axle spacing is over 8 m.' } ),
	{ name: 'Tractor + tandem end dump (39,500 kg)', ...TRACTOR.tandem, trailers: [ SEMI.tandemEndDump ], legal: { gvw: 39500, groups: [ 5500, 17000, 17000 ] } },
	{ name: 'Tractor + tridem belly or end dump (46,500 kg)', ...TRACTOR.tandem, trailers: [ SEMI.tridemBellyDump ], legal: { gvw: 46500, groups: [ 5500, 17000, 24000 ] } },
	{ name: 'Tridem tractor + tridem belly or end dump (55,300 kg)', ...TRACTOR.tridem, trailers: [ SEMI.tridemBellyDump ], legal: { gvw: 55300, groups: [ 7300, 24000, 24000 ] } },
	{
		name: 'Super B (63,500 kg)', ...TRACTOR.tandem,
		trailers: [
			{ name: 'lead trailer', look: 'belly-dump', length: 10.4, width: 2.6, height: 3.4, hitch: 0.3, frontOverhang: 0.9, kingpinToAxle: 7.5, axles: 3 },
			{ name: 'rear trailer', look: 'belly-dump', length: 9.4, width: 2.6, height: 3.4, hitch: - 0.3, frontOverhang: 0.9, kingpinToAxle: 7.0, axles: 2 },
		],
		legal: { gvw: 63500, groups: [ 5500, 17000, 24000, 17000 ] },
	},
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
