// The construction rides (docs/world-drive.md, "Achievements and rewards"): models from the
// construction app's library (public/library/, catalog.js's WORKS_RIDES), driven as the pickup is
// (vehicles.js loads them as library items: models.js stands each on the ground, its lowest point
// on y = 0, at the size the library made it, its real one), each unlocked by an achievement
// (achievement-rules.js's RIDE_FEATS). What World Drive makes of them is here: a name, a word on
// each, and how each handles (drive.js's specFor and HANDLING). All heavier and slower than the
// pickup (160 km/h, 0 to 100 in 4.6 s): low top speeds, slow away, wide turns, barely thrown up by a
// hit, squashing and shaking when they hit something. Those on tracks or skid-steered (the dozer,
// the skid steer) turn on the spot (pivot, °/s at a standstill), as tracks do.
//
// Nothing here is loaded until a ride is driven or looked at: only these few words are in the page.

export const WORKS = [
	{
		id: 'skid-steer-loader-cad', name: 'Skid steer', blurb: 'Tiny, turns on the spot',
		drive: {
			topSpeed: 30, accel: 3.5, brake: 8, reverse: 18,
			// Skid-steered: each side's wheels driven on their own, so it spins round where it stands.
			handling: { grip: 12, slip: 2, driftYaw: [ 40, 100 ], turn: [ 150, 90 ], lock: 40, pivot: 110, launch: 0.85, kick: 0.9, squash: 1.1, rebound: 0.1 },
		},
	},
	{
		id: 'telehandler-10k-stowed', name: 'Telehandler', blurb: 'Long boom, steady',
		drive: {
			topSpeed: 40, accel: 2.6, brake: 7, reverse: 18,
			handling: { grip: 11, slip: 2, driftYaw: [ 34, 90 ], turn: [ 110, 60 ], lock: 38, launch: 0.75, kick: 0.8, squash: 1.15, shake: 1.1 },
		},
	},
	{
		id: 'concrete-mixer-truck', name: 'Concrete mixer', blurb: 'Heavy, rolls on',
		drive: {
			topSpeed: 90, accel: 2.2, brake: 6, reverse: 15,
			handling: { grip: 9, slip: 2, driftYaw: [ 30, 84 ], turn: [ 90, 40 ], lock: 32, drag: 0.7, launch: 0.65, kick: 0.7, squash: 1.3, shake: 1.25 },
		},
	},
	{
		id: 'roller-single-drum-84in', name: 'Road roller', blurb: 'Slowest of all, flattens',
		drive: {
			topSpeed: 22, accel: 1.8, brake: 6, reverse: 15,
			handling: { grip: 12, slip: 2, driftYaw: [ 30, 80 ], turn: [ 90, 60 ], lock: 36, launch: 0.6, kick: 0.6, squash: 1.2, shake: 1.2 },
		},
	},
	{
		id: 'wheel-loader', name: 'Wheel loader', blurb: 'Big bucket, bends in the middle',
		drive: {
			topSpeed: 45, accel: 2.4, brake: 7, reverse: 20,
			// Articulated: it bends in the middle, so it turns tighter than its length would.
			handling: { grip: 10, slip: 2, driftYaw: [ 32, 88 ], turn: [ 115, 60 ], lock: 42, launch: 0.7, kick: 0.75, squash: 1.2, shake: 1.15 },
		},
	},
	{
		id: 'articulated-dump-truck', name: 'Dump truck', blurb: 'Six wheels, bends, hauls',
		drive: {
			topSpeed: 55, accel: 2, brake: 6, reverse: 15,
			handling: { grip: 9, slip: 2, driftYaw: [ 30, 84 ], turn: [ 95, 48 ], lock: 40, drag: 0.8, launch: 0.6, kick: 0.65, squash: 1.3, shake: 1.3 },
		},
	},
	{
		id: 'crawler-dozer-20t', name: 'Bulldozer', blurb: 'Tracks, pushes, pivots',
		drive: {
			topSpeed: 20, accel: 1.6, brake: 8, reverse: 14,
			// Tracks: one side forward and the other back turns it on the spot.
			handling: { grip: 16, slip: 2, driftYaw: [ 24, 60 ], turn: [ 70, 50 ], lock: 30, pivot: 45, launch: 0.5, kick: 0.5, squash: 1.1, shake: 1.3 },
		},
	},
	{
		id: 'hydrovac-truck', name: 'Vac truck', blurb: 'Big, red, sucks up the road',
		drive: {
			topSpeed: 95, accel: 2.3, brake: 6, reverse: 15,
			handling: { grip: 9, slip: 2, driftYaw: [ 30, 84 ], turn: [ 85, 38 ], lock: 30, drag: 0.7, launch: 0.6, kick: 0.65, squash: 1.35, shake: 1.3 },
		},
	},
];
