import { Group } from 'three';

// World Drive's cars: models from Sketchfab (CC BY, credited in drive/public/cars/CREDITS.md, the
// About box and the ride picker), each made ready to drive by scripts/add-drive-car.mjs into
// drive/public/cars/, which only World Drive's build publishes (the construction app's library
// never sees them). cars.json there has each one's file, size, wheels and credit; what World Drive
// makes of it (name, blurb, tuning, and whether it needs the Supporter Pass) is here. One is free;
// the rest come with the pass (pro.js), locked like the pass's built-in rides.
//
// Their ids are also in catalog.js's DRIVE_CARS, which the Worker's leaderboard accepts.

const BASE = 'cars/';
// How far the front wheels turn at full lock (rad), as the coupe's do.
const STEER_LOCK = 0.5;

// Tuning (see drive.js specFor and HANDLING), so each feels its own: cab is where the driver's eyes
// are, in metres from the middle of the car at ground level (for the driver's-seat camera).
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
	{
		id: 'neon-racer', name: 'Neon racer', blurb: 'Quick, sharp, glows', pro: true,
		drive: {
			topSpeed: 185, accel: 12.5, brake: 20, reverse: 30,
			cab: { ahead: 0.05, right: - 0.38, up: 1.25 },
			// Quick away, gripping hard, turning in fastest of the cars.
			handling: { grip: 17, slip: 2.3, driftYaw: [ 44, 120 ], turn: [ 168, 72 ], lock: 38, drag: 0.85 },
		},
	},
	{
		id: 'night-cruiser', name: 'Night cruiser', blurb: 'Fastest, heavy, glides', pro: true,
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
			cab: { ahead: 0.25, right: - 0.35, up: 1.2 },
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
		changes: 'compressed, rescaled and its wheels made to turn',
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

	if ( car.decals && body ) {

		// Decals go onto the meshes in decalParent (paint.js): the body's, which a body of more than
		// one material holds as a group.
		model.userData.decals = car.decals;
		model.userData.decalParent = body.isMesh ? body.parent : body;

	}

	// Spun by how far it's gone, each wheel by its own size; turned about y before it spins.
	const turns = wheels.map( () => 0 );
	for ( const wheel of wheels ) wheel.rotation.order = 'YXZ';
	model.userData.onDrive = ( { steer, speed, dt } ) => {

		wheels.forEach( ( wheel, i ) => {

			turns[ i ] = ( turns[ i ] + speed * dt / wheel.userData.wheel.radius ) % ( Math.PI * 2 );
			wheel.rotation.x = - turns[ i ];
			if ( wheel.userData.wheel.steers ) wheel.rotation.y = - steer * STEER_LOCK;

		} );

	};

	return model;

}
