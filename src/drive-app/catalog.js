// The library vehicles World Drive offers, by their id in public/library/library.json, besides
// the go-kart (src/kart.js). Kept apart, with no imports, because vite.drive.config.js reads it
// too: only these models and their pictures are published with the World Drive site. Not the semi
// (semi-tractor-w900): the model has a pin-up decal and maker's logos, fine on a work site but not
// in a public game.
export const LIBRARY_VEHICLES = [ 'pickup-truck', 'haul-truck-hd465' ];

// The Supporter Pass rides (src/drive-app/rides/), by id. Here too so the Worker can accept their
// runs on the leaderboard without importing the models.
export const PASS_RIDES = [ 'sports-coupe', 'monster-truck', 'city-bus', 'hovercraft' ];
