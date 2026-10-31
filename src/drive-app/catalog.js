// The library vehicles World Drive offers, by their id in public/library/library.json, besides
// the go-kart (src/kart.js). Kept apart, with no imports, because vite.drive.config.js reads it
// too: only these models and their pictures are published with the World Drive site. Not the semi
// (semi-tractor-w900): the model has a pin-up decal and maker's logos, fine on a work site but not
// in a public game. Nor the haul truck (haul-truck-hd465): it's a real maker's machine, named in
// its credit.
export const LIBRARY_VEHICLES = [ 'pickup-truck' ];

// The Supporter Pass rides (src/drive-app/rides/), by id. Here too so the Worker can accept their
// runs on the leaderboard without importing the models.
export const PASS_RIDES = [ 'sports-coupe', 'monster-truck', 'city-bus', 'hovercraft' ];

// World Drive's own cars (cars.js, models in drive/public/cars/), by id: the muscle car is free, the
// rest come with the Supporter Pass. Here too so the Worker can accept their runs.
export const DRIVE_CARS = [ 'muscle-car', 'neon-racer', 'night-cruiser', 'dune-buggy', 'farm-truck', 'police-cruiser' ];
