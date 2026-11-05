import { Group, MathUtils } from 'three';

// World Drive's cars: models from Sketchfab (CC BY, credited in drive/public/cars/CREDITS.md, the
// About box and the ride picker), each made ready to drive by scripts/add-drive-car.mjs into
// drive/public/cars/, which only World Drive's build publishes (the construction app's library
// never sees them). cars.json there has each one's file, size, wheels and credit; what World Drive
// makes of it (name, blurb, tuning, and whether it needs the Supporter Pass) is here. One is free;
// six come with levels (levels.js's ride rewards, a level each) or the pass, whichever comes first;
// the rest only with the pass (pro.js), locked like the pass's built-in rides. levels.js's
// rideUnlock says which.
//
// Their ids are also in catalog.js's DRIVE_CARS, which the Worker's leaderboard accepts.

const BASE = 'cars/';
// How far the front wheels turn at full lock (rad), as the coupe's do.
const STEER_LOCK = 0.5;
// The speed (m/s) from which a leaning body leans all it does in a turn.
const LEAN_SPEED = 12;

// Tuning (see drive.js specFor and HANDLING), so each feels its own: cab is where the driver's eyes
// are, in metres from the middle of the car at ground level (for the driver's-seat camera). lean is
// how far (rad) the body leans out of a turn at full lock, the wheels staying on the road: a tall,
// narrow ride's sway (loadCar).
export const CARS = [
	{
		id: 'muscle-car', name: 'Muscle car', blurb: 'Loud, loose, slides wide', colour: 'blaze',
		// Its paint is plain colour (no picture on it), so the Garage can repaint it, with decals here:
		// over the top from nose to tail, along the doors, and on the bonnet.
		decals: {
			top: { at: [ 0, 1.3, 0 ], size: [ 0.6, 4.8, 1 ] },
			side: { at: [ 1, 0.62, 0.15 ], size: [ 2, 0.36, 0.5 ] },
			bonnet: { at: [ 0, 1, - 1.45 ], size: 0.6 },
		},
		drive: {
			topSpeed: 175, accel: 9.5, brake: 15, reverse: 28,
			cab: { ahead: 0.1, right: - 0.4, up: 1.12 },
			// Grip a little over the kart's and drifts that swing the tail far out.
			handling: { grip: 13, slip: 2.9, driftYaw: [ 46, 128 ], turn: [ 150, 60 ], lock: 34, drag: 0.85 },
		},
	},
	// Levels' rides (levels.js's ride rewards), or the pass's at once, in the order the levels bring
	// them: the odd ones first, the fast ones later.
	{
		id: 'golf-cart', name: 'Golf cart', blurb: 'Tiny, twitchy, zippy',
		drive: {
			topSpeed: 70, accel: 7.5, brake: 13, reverse: 22,
			cab: { ahead: - 0.05, right: - 0.24, up: 1.22 },
			// Tiny and light on its wheels: away in a flash, darting into turns at a touch, sliding
			// out easily and thrown about by every bump.
			handling: { grip: 10, slip: 1.8, driftYaw: [ 54, 136 ], turn: [ 195, 96 ], lock: 42, landTilt: 36, launch: 1.15, kick: 1.25, rebound: 0.15 },
			lean: 0.07,
		},
	},
	{
		id: 'tuk-tuk', name: 'Tuk-tuk', blurb: 'Slow, nimble, tippy', colour: 'lime',
		// Its green panels are plain colour, so the Garage can repaint them: stripes over the bonnet
		// and roof's edge, down the sides of the cab, and a number on its nose.
		decals: {
			top: { at: [ 0, 1.2, - 0.95 ], size: [ 0.4, 0.8, 1.2 ] },
			side: { at: [ 0.62, 0.62, 0.55 ], size: [ 1.1, 0.34, 0.4 ] },
			bonnet: { at: [ 0, 1.05, - 1.2 ], size: 0.36, deep: 1.2 },
		},
		drive: {
			topSpeed: 85, accel: 5, brake: 10, reverse: 18,
			// The driver sits in the middle up front, behind the handlebars; the passengers behind.
			cab: { ahead: 0.42, right: 0, up: 1.42 },
			// Three wheels and a tall cab: slow, but turning almost on the spot, leaning hard out of
			// every turn, over on its side from a landing a car would shrug off, and spun round by any
			// knock.
			handling: { grip: 8, slip: 2, driftYaw: [ 50, 128 ], turn: [ 180, 74 ], lock: 42, landTilt: 26, launch: 1.1, kick: 1.35, squash: 1.15 },
			lean: 0.13,
		},
	},
	{
		id: 'ice-cream-van', name: 'Ice-cream van', blurb: 'Tall, slow, sways',
		drive: {
			topSpeed: 120, accel: 5.5, brake: 10, reverse: 18,
			// Its windows are painted on (one picture with the rest of it), so its driver's-seat view is
			// from over its short bonnet, just in front of the windscreen.
			cab: { ahead: 2.05, right: - 0.45, up: 1.62 },
			// A van with a cone on its roof: slow away, swaying through turns, turning wide, and
			// squashing and shaking when it hits something.
			handling: { grip: 9, slip: 2, driftYaw: [ 38, 100 ], turn: [ 120, 50 ], lock: 33, drag: 1.1, launch: 0.8, kick: 0.9, squash: 1.25, shake: 1.15 },
			lean: 0.06,
		},
	},
	{
		id: 'lawn-tractor', name: 'Lawn tractor', blurb: 'Slowest, turns on a dime', colour: 'blaze',
		// Its paint is plain colour: stripes down the bonnet, a number on it and on its sides.
		decals: {
			top: { at: [ 0, 0.95, - 0.42 ], size: [ 0.32, 1.05, 0.5 ] },
			side: { at: [ 0.36, 0.62, - 0.45 ], size: [ 0.85, 0.24, 0.3 ] },
			bonnet: { at: [ 0, 0.9, - 0.62 ], size: 0.32 },
		},
		drive: {
			topSpeed: 60, accel: 4.5, brake: 10, reverse: 15,
			// Its seat is over the back axle, the bonnet out in front.
			cab: { ahead: - 0.32, right: 0, up: 1.32 },
			// A mower: the slowest of all, turning on the spot at walking pace, light enough to be
			// thrown up high and bounce when it lands.
			handling: { grip: 9, slip: 1.9, driftYaw: [ 56, 140 ], turn: [ 200, 100 ], lock: 48, landTilt: 44, launch: 1.2, gravity: 0.95, rebound: 0.22 },
			lean: 0.05,
		},
	},
	{
		id: 'retro-wedge', name: 'Retro wedge', blurb: 'Light, tail-happy, eighties',
		drive: {
			topSpeed: 190, accel: 10.5, brake: 16, reverse: 28,
			// Its windows are painted on too: the view from over its bonnet.
			cab: { ahead: 0.75, right: - 0.3, up: 1.08 },
			// Light at the back: quick, gripping well until the tail steps out into long drifts.
			handling: { grip: 15, slip: 2.7, driftYaw: [ 50, 130 ], turn: [ 158, 66 ], lock: 36, drag: 0.85 },
		},
	},
	{
		id: 'formula-racer', name: 'Formula racer', blurb: 'Grips hardest, turns sharpest',
		drive: {
			topSpeed: 210, accel: 12, brake: 24, reverse: 26,
			// One seat in the middle, low in the cockpit ahead of the engine.
			cab: { ahead: 0.25, right: 0, up: 0.88 },
			// Open wheels and wings: it grips harder and turns in sharper at speed than anything and
			// stops hardest, but its lock is a racer's, so it's clumsy at walking pace.
			handling: { grip: 21, slip: 2.1, driftYaw: [ 40, 116 ], turn: [ 178, 100 ], lock: 32, drag: 0.75, launch: 0.95, kick: 1.1 },
		},
	},
	// The pass's: the five that came with it first, and its showpieces.
	{
		id: 'neon-racer', name: 'Neon racer', blurb: 'Quick, sharp, glows', pro: true,
		drive: {
			topSpeed: 185, accel: 12.5, brake: 20, reverse: 30,
			cab: { ahead: 0.05, right: - 0.38, up: 1.25 },
			// Quick away, gripping hard, turning in fastest of the first cars.
			handling: { grip: 17, slip: 2.3, driftYaw: [ 44, 120 ], turn: [ 168, 72 ], lock: 38, drag: 0.85 },
		},
	},
	{
		id: 'night-cruiser', name: 'Night cruiser', blurb: 'Long-legged, heavy, glides', pro: true,
		drive: {
			topSpeed: 205, accel: 8, brake: 14, reverse: 26,
			cab: { ahead: 0.05, right: - 0.36, up: 1.15 },
			// Long-legged and heavy: the highest top speed, slow to turn, rolling on and on off the gas,
			// and a hit throws it less.
			handling: { grip: 14, slip: 2.5, driftYaw: [ 40, 110 ], turn: [ 135, 58 ], lock: 33, drag: 0.6, launch: 0.85, kick: 0.85, squash: 0.85 },
		},
	},
	{
		id: 'dune-buggy', name: 'Dune buggy', blurb: 'Light, bouncy, big air', pro: true,
		drive: {
			topSpeed: 145, accel: 11, brake: 14, reverse: 30,
			// Its one seat is in the middle, under the cage's roof: a little behind the car's middle, as
			// its nose is long and its engine short.
			cab: { ahead: - 0.38, right: 0, up: 1.38 },
			// Light on long springs: loose on the road, thrown higher, slower to fall, landing well off
			// upright and bouncing as it does.
			handling: { grip: 9, slip: 2.2, driftYaw: [ 52, 124 ], turn: [ 160, 66 ], lock: 36, gravity: 0.85, launch: 1.15, landTilt: 50, rebound: 0.2 },
		},
	},
	{
		id: 'farm-truck', name: 'Farm truck', blurb: 'Slow, sturdy, wallows', pro: true,
		drive: {
			topSpeed: 115, accel: 4.5, brake: 9, reverse: 18,
			cab: { ahead: 0.85, right: - 0.45, up: 2 },
			// Heavy and soft: slow away, turning wide, barely thrown up, and squashing and shaking more
			// than a car when it hits something.
			handling: { grip: 9, slip: 2, driftYaw: [ 36, 96 ], turn: [ 115, 46 ], lock: 32, drag: 1.2, launch: 0.75, kick: 0.8, squash: 1.3, shake: 1.2 },
		},
	},
	{
		id: 'police-cruiser', name: 'Police cruiser', blurb: 'Steady, all-round pursuit', pro: true,
		drive: {
			topSpeed: 180, accel: 9, brake: 17, reverse: 30,
			cab: { ahead: 0, right: - 0.4, up: 1.55 },
			handling: { grip: 15, slip: 2.4, driftYaw: [ 42, 114 ], turn: [ 152, 62 ], lock: 36 },
		},
	},
	{
		id: 'hypercar', name: 'Hypercar', blurb: 'Fastest, quickest, glued down', pro: true,
		drive: {
			topSpeed: 215, accel: 14, brake: 22, reverse: 30,
			// It has no inside (the model is its outside alone): the view from over its bonnet.
			cab: { ahead: 1.0, right: - 0.3, up: 1.02 },
			// The fastest of everything and the quickest away, gripping nearly as hard as the
			// formula racer and turning in sharply; a hit throws it a little less, low as it is.
			handling: { grip: 19, slip: 2.4, driftYaw: [ 46, 124 ], turn: [ 170, 78 ], lock: 37, drag: 0.7, launch: 0.9 },
		},
	},
	{
		id: 'cyber-muscle', name: 'Cyber muscle', blurb: 'Brutal, loud, slides wide', pro: true, colour: 'black',
		// Its black panels are plain colour, so the Garage repaints them (the orange stays): stripes
		// over the top, down the doors and a number on the bonnet.
		decals: {
			top: { at: [ 0, 1.45, 0 ], size: [ 0.62, 4.6, 1.2 ] },
			side: { at: [ 1.12, 0.72, 0.15 ], size: [ 2.2, 0.36, 0.6 ] },
			bonnet: { at: [ 0, 1.1, - 1.45 ], size: 0.62 },
		},
		drive: {
			topSpeed: 200, accel: 11.5, brake: 16, reverse: 30,
			// Its glass is tinted, with an instrument display drawn over it, too busy to drive through
			// from inside: the view from over its bonnet.
			cab: { ahead: 1.0, right: - 0.3, up: 1.28 },
			// Heavy and powerful: the longest, widest drifts of the cars, a little loose on the road.
			handling: { grip: 13, slip: 3.1, driftYaw: [ 52, 134 ], turn: [ 146, 60 ], lock: 34, drag: 0.8, launch: 0.9, squash: 1.1 },
		},
	},
];

// The cars this site has, from cars.json: CARS as vehicles for the ride picker (vehicles.js), each
// with its picture, credit and how to load its model (load). A car missing from cars.json (or the
// file not there at all) is left out, and the rest still drive.
export async function loadCars() {

	let listed = [];
	try {

		const res = await fetch( new URL( `${ BASE }cars.json`, document.baseURI ) );
		if ( res.ok ) listed = await res.json();

	} catch {

		// The kart and the rest still work.

	}

	return CARS.map( car => ( { car, entry: listed.find( item => item.id === car.id ) } ) ).filter( ( { entry } ) => entry ).map( ( { car, entry } ) => ( {
		...car,
		thumb: entry.thumb ? new URL( `${ BASE }${ entry.thumb }`, document.baseURI ).href : null,
		credit: entry.source,
		// What was done to it, for the credits: CC BY asks for that to be said.
		changes: `compressed, rescaled${ entry.plainLamps ? ', its lamps made plain' : '' }${ entry.paintedOver ? `, its ${ entry.paintedOver.join( ' and ' ) } painted over` : '' } and its wheels made to turn`,
		topSpeed: car.drive.topSpeed,
		load: loader => loadCar( loader, car, entry ),
		item: { ...car, file: entry.file },
	} ) );

}

// The car's model, ready to drive: standing on y = 0 facing -Z (as the importer left it), its
// wheels spinning with the speed and the front ones steering (onDrive, which drive.js calls each
// frame), and its paint and decals where the Garage can find them (paint.js).
export async function loadCar( loader, car, entry ) {

	const gltf = await loader.loadAsync( new URL( `${ BASE }${ entry.file }`, document.baseURI ).href );
	const model = new Group();
	model.name = car.name;
	model.add( gltf.scene );
	const wheels = [];
	let body = null;
	gltf.scene.traverse( object => {

		if ( object.userData.wheel ) wheels.push( object );
		if ( object.name === 'body' ) body = object;
		// The importer marks what may be repainted on its materials (--paint, --rims).
		const part = object.isMesh && object.material.userData.paint;
		if ( part ) object.userData.paint = part;

	} );

	// A body that leans (lean) does so in a group of its own, its wheels staying on the road; its
	// decals go in that group too, to lean with it. It's marked, so what leans can be found (the
	// cars' test looks for it).
	let sprung = body;
	if ( car.drive?.lean && body?.isMesh ) {

		sprung = new Group();
		sprung.name = 'sprung';
		body.parent.add( sprung );
		sprung.add( body );

	}

	if ( car.drive?.lean && sprung ) sprung.userData.leans = true;

	if ( car.decals && body ) {

		// Decals go onto the meshes in decalParent (paint.js), in the car's metres. The compression
		// keeps a part's positions small and puts a transform on its node to undo that (meshopt's
		// quantization), so a body of more than one material, a group of meshes, hands its transform
		// down to them first.
		if ( ! body.isMesh ) {

			body.updateMatrix();
			for ( const mesh of body.children ) mesh.applyMatrix4( body.matrix );
			body.matrix.identity().decompose( body.position, body.quaternion, body.scale );

		}

		model.userData.decals = car.decals;
		model.userData.decalParent = body.isMesh ? body.parent : body;

	}

	// Each wheel turns about its axle (cars.json has where it is), whatever that same transform has
	// made of its node's origin: held in a hub of its own there, which spins by how far the car has
	// gone (for each wheel's own size) and, at the front, steers before it spins.
	const hubs = wheels.map( wheel => {

		const hub = new Group();
		hub.name = `${ wheel.name } hub`;
		hub.userData.wheel = wheel.userData.wheel;
		delete wheel.userData.wheel;
		hub.position.fromArray( entry.wheels?.find( w => w.name === wheel.name )?.at ?? wheel.position.toArray() );
		hub.rotation.order = 'YXZ';
		wheel.parent.add( hub );
		wheel.position.sub( hub.position );
		hub.add( wheel );
		return hub;

	} );
	const turns = hubs.map( () => 0 );
	let lean = 0;
	model.userData.onDrive = ( { steer, speed, dt, airborne = false } ) => {

		hubs.forEach( ( hub, i ) => {

			turns[ i ] = ( turns[ i ] + speed * dt / hub.userData.wheel.radius ) % ( Math.PI * 2 );
			hub.rotation.x = - turns[ i ];
			if ( hub.userData.wheel.steers ) hub.rotation.y = - steer * STEER_LOCK;

		} );
		if ( ! car.drive?.lean || ! sprung || dt <= 0 ) return;

		// Out of the turn (steering right leans it left), more the faster it goes, up to LEAN_SPEED;
		// upright again in the air.
		const want = airborne ? 0 : steer * MathUtils.clamp( Math.abs( speed ) / LEAN_SPEED, 0, 1 ) * car.drive.lean;
		lean += ( want - lean ) * Math.min( 1, dt * 5 );
		sprung.rotation.z = lean;

	};

	return model;

}
