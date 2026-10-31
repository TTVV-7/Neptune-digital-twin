# World Drive (worlddrive.app)

World Drive is the second app in this repository: pick anywhere on Earth from a globe of Google's
photorealistic 3D tiles, drop in and drive the real world, arcade style. It shares `src/` with the
construction app (the tiles, the models, the driving) but has its own page, build, Worker and
address, and the construction app is unchanged by it.

| | Construction app | World Drive |
| --- | --- | --- |
| Page | `index.html`, `src/main.js` | `drive/index.html`, `src/drive-app/` |
| Build | `npm run build` → `dist/` | `npm run build:drive` → `dist-drive/` |
| Worker | `wrangler.jsonc`, `worker/` | `wrangler.drive.jsonc`, `worker/drive/` |
| Address | `neptune-twin-app` Worker | https://worlddrive.app (and www) |

## Playing

1. **The globe.** It opens on the whole Earth, slowly turning, facing your part of the world (going by
   your clock). Drag to spin it, scroll or pinch to zoom, right-drag or two fingers to tilt.
2. **Pick a place**, any of these ways:
   - **Search** for a place or an address and press Enter (or **Go**). It only searches when you ask,
     never as you type. Typed coordinates (`46.57, 8.42`, or `46.57° N, 8.42° E`) need no search.
   - **Start spots**: a dozen places worth a drive (Neptune Terminals, the Sea-to-Sky Highway, the Lions
     Gate, Golden Gate and Sydney Harbour bridges, Times Square, Monaco, Shibuya, the Furka Pass, the
     Grand Canyon, the Arc de Triomphe and the Las Vegas Strip).
   - **Recent**: the last six places you drove (kept in this browser).
   - **Tap the globe** anywhere to drop a pin.

   Choosing a search result or a spot flies the globe down to it and pins it. The card under the pin
   says where it is, with **Drive here**.
3. **Your ride**: the go-kart, a pickup, a haul truck or the muscle car, or with the
   [Supporter Pass](#supporter-pass-content) five more [cars](#world-drives-cars) (a neon racer, a
   night cruiser, a dune buggy, a farm truck and a police cruiser) and four rides built for it (a
   sports coupe, a monster truck, a city bus and a hovercraft). The choice is remembered. **Garage**,
   under the rides, paints them.
4. **Drive here.** The view flies down to the pin and waits for the ground to load ("Loading the
   ground..."), so the vehicle never drops through tiles that aren't there yet. It starts on the ground
   at the pin, facing along the street if there is one (a spot's road, or the longest clear line
   through the pin), else north. A spot on a bridge, or a search result that is a bridge, starts on the
   deck rather than on the water underneath. A pin on a roof (a search result that's a building's
   middle, or a tap on one) starts on the street beside it, and a start with something right in front
   of it (a car parked in Google's photo, a bollard) moves across the road to a clear lane. Where
   there's nothing at all to drive on, it says so and goes back to the globe.
5. **M** (or the **Globe** button) goes back to the globe, from driving or from a drop-in on its way
   down. Pick somewhere else and drop in again: as often as you like, without reloading.

### Keys

| Key | What it does |
| --- | --- |
| W / S | Gas; brake, and reverse once stopped |
| A / D | Steer |
| Space | Drift: hold it and steer round a bend, let go for a mini-turbo; tap it to hop |
| B | Booster: flat out for a moment, supersonic |
| Shift | Fly: hold to lift off, let go to glide down |
| In the air | A / D spin, W / S flip (W forward, S back), Q / E roll (or Space with A / D) |
| R | Stuck? Back on the road a few metres on |
| C | Chase or driver's-seat camera |
| Wheel | Chase camera nearer or farther |
| M | Back to the globe |
| Esc | Pause: keep driving, change ride, or back to the globe |

The keys card shows as each drive starts; **?** brings it back. Flying, the booster, drifts, stunts
and R come from `src/drive.js`, which World Drive starts with `fly`, `booster` and `drift` on and
`crash: 'launch'` (the construction app leaves them off, and its crashes stop the vehicle dead).

On a touch screen the globe's panel is a sheet along the bottom, and driving has on-screen buttons
(the driving HUD's, `src/drive-hud.js`): steering bottom left; **Gas** with **Drift** over it at the
right-hand edge, and **Brake**, **Boost** and **Fly** beside them; reset (↺) and **Cam** at the top
right, under the bar with **Globe** and pause. Several can be held at once. In the air ◀ ▶ spin,
**Gas** and **Brake** flip, and **Drift** held with ◀ ▶ rolls.

### Stunts

Hit something (a wall, a building, a parked car, a barrier) and you don't stop: you bounce off it.

- **The bounce.** You keep most of your speed along what you hit (85 %), come back off it with 40 %
  of your speed into it (at most 58 km/h), and are thrown up by more the harder you hit: a 0.4 m hop
  at 22 km/h, about 3.5 m at 80, 7.7 m at 120, and never more than 8.6 m however fast. Where you hit
  sets you spinning: clip a corner and you spin round; hit square on and the nose goes up and back.
  Left alone you come down on your wheels, tipped back 25° to 45° by a hit at up to 160 km/h; a
  harder one (with the booster) takes you over backwards, so finish the backflip with **S** or wipe
  out. Hits shake the view, squash the vehicle for a moment and throw sparks and bits, with a word
  for how hard: **BONK!**, **BOING!** or **WHAM!** The chase camera follows you up and down a little
  behind, so you see yourself thrown.
- **Not every hit launches.** Meet a wall at under 15° and you scrape along it in sparks. A nudge
  under about 11 km/h stops you against it, so pressing on into a wall doesn't jitter, and up to
  22 km/h it knocks you back along the ground. Kerbs and other low steps are still driven over.
- **In the air** (after a hit, off a ramp, a crest or a hop): **A**/**D** spin, **W**/**S** flip, **Q**/**E**
  (or **Space** with **A**/**D**) roll. Let go and the turn stops within about 45°. Keys you were
  already holding when you left the ground (the gas, say) don't count until you press them again,
  so holding the gas off a ramp doesn't flip you. Flying (**Shift**), **Space** with **W**/**S** flips
  and with **A**/**D** (or **Q**/**E**) rolls, and you right yourself when you let go.
- **Landing.** Within about 40° of upright you land: the suspension takes it, the tricks you did
  pay out, the booster is topped up (a fifth for each trick) and, going forward, you get a burst
  of speed. On your roof or side it's a **wipeout**: a short tumble, the tricks and the combo are
  lost, and the vehicle rolls back onto its wheels by itself (or press **R**).
- **Tricks and score.** A spin counts by half turns (180, 360, 720...), flips and barrel rolls by
  whole turns, give or take a little. Each scores: 300 a half turn, 1,000 a flip, 800 a roll, 150 a
  wall bounce (a **BOING!** or a **WHAM!**, 32 km/h or more into it) and 300 a second for big air
  (1.5 s or more). Two or more in one jump are a combo (half as much again). Everything is
  multiplied by the combo multiplier ("+1,310 ×2" adds 2,620), which goes up by one for each trick
  you land (to ×10) and back to ×1 on a wipeout, on R, or after 6 s without a trick. The
  score, the multiplier and your best score (kept in this browser) show under the speed; tricks pop
  up as you do them, dim while you're in the air and bright with their points when you land. Your
  best runs go on the [leaderboard](#the-leaderboard).
- **Drifting.** Hold **Space** (or the **DRIFT** button under the speed, with the mouse, or the
  **Drift** button on a touch screen) and steer: the kart slides wide round the bend in smoke, and
  the **DRIFT** chip and button fill with the mini-turbo's charge in its colour (yellow, then teal,
  then pink after 0.7, 1.5 and 2.5 s). Let go for a short, strong boost. Space held before you
  steer waits for the steering rather than hopping; a quick tap hops.

### Boosting

- **The booster** (**B**) fires the whole gauge, 2.5 s of it (it needs 15 % to light), pushing you up
  to twice the ride's top speed. The gauge refills by itself in 8 s; landed tricks top it up (a fifth
  each), and so do boost pads. What it leaves behind is the ride's **boost style** from the
  [Garage](#the-garage): the classic flame, bubbles or confetti, or with the pass one of nine more.
- **Supersonic.** Boost at 85 % or more of that doubled top speed for three quarters of a second and
  you go supersonic: a sonic boom (a shock ring blown out round you, a flash and a jolt), streaks of
  air streaming back past you, the view 9° wider and **SUPERSONIC** by the speed. It lasts, boosting
  or not, until you drop under three quarters of that speed: a moment after the gauge runs out, or at
  once if you hit something. Every ride can, each against its own top speed (the kart at about
  190 km/h, the haul truck at 120). It's all in `src/drive.js` (`SUPERSONIC`) and `drive-boosts.js`;
  World Drive widens the view by `driver.warp`.
- **Boost pads.** Glowing pads turn up on the ground ahead of and round you as you drive, each under
  a column of light: small gold ones (+12 % of the gauge) and big orange ones (a full gauge). Drive over
  one and it goes dark, lighting again 4 s later (a big one 10 s); with the gauge already full you
  leave it for later. There are at most 12 (9 small, 3 big), 15 m apart or more, and those you leave
  far behind are put down ahead again. **Boost pads on the road** in the pause menu turns them off
  (kept in this browser).

  Where they go (`src/drive-app/pads.js`): every 0.08 s one spot is tried, 30 to 100 m ahead along
  the way you're going (within 50° either side) or, one try in three, anywhere 25 to 70 m round you.
  Each spot is looked at straight down from 300 m up, so the first thing the ray meets is whatever is
  on top there: a roof, a tree or a bridge over the street rules it out, and nothing goes inside a
  building. The ground there must be as smooth as a road (tilted less than 16°, and within 15 cm of
  it at eight points just past the pad's edge: not on a parked car, a kerb, a slope or the lumpy top
  of a bush) and reachable from the street you were last on: looked at every 7 m at most on the
  way there, it may climb or fall up to 1 m from one look to the next (a street at 14 %), passing
  by something standing in the way (one look higher than those either side: a parked car), but
  never a step that stays up, onto a roof or a bus shelter or up the bank beside a highway. Nothing
  is put down while you're more than 20 m over where you last drove. One pad a frame is looked at
  again, so when sharper tiles arrive under it, it moves onto them (or goes, if the ground there
  moved more than a metre). It's three instanced meshes, and a try is two dozen rays at most, most
  of them ending after one or two.

## Supporter Pass (content)

The Supporter Pass is a one-time payment (CA$4.99) towards World Drive's running costs. This part is
what it unlocks and the switch that unlocks it; buying it (Google sign-in, Stripe, its webhook and the
pass kept in D1) is [below](#supporter-pass-buying-it). Without it the free game is exactly as it was.

**The switch** is `src/drive-app/pro.js`: `isPro()`, `onProChange( fn )` and `setPro( on )`, off by
default. Everything locked asks `isPro()` and follows `onProChange`; the payments code
(`supporter.js`) calls `setPro( true )` for a visitor who has the pass. For testing, `?pro=1` in the address turns it on, but
only when the page is on `localhost` or `127.0.0.1` (`testPass` decides), never on worlddrive.app.

**Locked things** show a small **⭐ Supporter Pass** badge (in the Garage, a ⭐ on each locked choice
under one line saying what the stars mean), and picking one opens the pass's sheet
instead (`src/drive-app/pass.js`): what the pass is and what comes with it (nine more rides, five cars
and four built in code, each with its picture; the Garage's extras, a ⭐ by your name on the
leaderboard, 30 drives a day instead of 8) and its buy
area (`buyArea()`), which says **Coming soon** until the payments code fills it. The sheet also opens from **⭐ Supporter
Pass** under the rides on the globe and in the pause menu. A ride or a look saved while the pass was
on falls back to the go-kart, or to the free choices, without it. Nothing comes up by itself: the
sheet only opens when something locked, or one of those buttons, is picked.

The leaderboard takes runs in the pass's rides and cars as in the free ones (`PASS_RIDES` and
`DRIVE_CARS` in `src/drive-app/catalog.js`, which `VEHICLES` in `worker/drive/scores.js` reads).

### The four rides

Built in code like the kart (`src/drive-app/rides/`), each 3,600 to 7,800 triangles, facing -Z on
y = 0 at its real size, with its own handling (`handling` in its tuning, which `drive.js` reads in
place of its constants: see `HANDLING` there; vehicles without it handle as before):

| Ride | Size | Top speed | Handling |
| --- | --- | --- | --- |
| Sports coupe | 4.4 × 1.9 m | 195 km/h | Quick (0 to 100 in 2.6 s, the kart's 5.2), grips hard, turns in sharply, long wide drifts |
| Monster truck | 5.4 × 3.5 m, 3.4 m tall | 125 km/h | Thrown about twice as high by the same hit (gravity at 0.75 in the air, launches × 1.3), quicker to flip than its size would make it (as quick as the kart) and landing up to 55° off upright, bouncing on soft springs; its bumpers are 1.5 m up, so it drives up over cars, barriers and kerbs |
| City bus | 12 × 2.55 m, 3.2 m tall | 90 km/h | Slow away (22 km/h after 3 s), rolls on and on off the gas, turns wide; barely thrown up by a crash, slow to turn in the air, and squashes and shakes the view the most |
| Hovercraft | 4.2 × 2.1 m | 135 km/h | No wheels: it floats 16 cm up on its skirt (water is just more ground to it), slides wide through every turn (about 50° at 50 km/h, under 10° for the others), glides on and stops slowly, and bounces on its cushion |

Wheels spin and front wheels steer (the monster truck steers all four, the back ones the other way);
the monster truck's body rides on springs that sink and rebound as it lands and lean it out of
turns; the hovercraft bobs, its fan spins up with the gas and its rudders follow the steering.
Nothing turns in the air faster than the kart, whatever its handling: the leaderboard's limits
(`SCORING` in `worker/drive/scores.js`) take the kart's rate as the most there is. Each
has a driver: behind tinted glass in the coupe and the truck, at the front of the bus (with its
passengers), in the open on the hovercraft. They follow the free rides in the picker with a drawing
each (in their paint) and the badge until the pass is on.

### World Drive's cars

Six cars from Sketchfab, each made ready to drive by `scripts/add-drive-car.mjs` (below) and tuned in
`src/drive-app/cars.js`. The muscle car is free; the rest come with the pass, locked like the rides
above, between the free rides and the built ones in the picker, each with its own picture. With
thirteen rides, the pause menu has them in two rows that scroll sideways (the one being driven in
view; on a phone about three across, the next peeking in, so each pass ride's badge fits), so it's
no taller than it was and the pass's sign-in under them stays on screen; the Garage's row of rides
scrolls to the one shown.

| Car | Model (CC BY 4.0) | Size | Top speed | Handling |
| --- | --- | --- | --- | --- |
| Muscle car (free) | "Classic Muscle car" by Lexyc16 | 4.7 × 2.1 m, 1.4 m tall | 175 km/h | 0 to 100 in 3.3 s. Loose: grip a little over the kart's, drifts that swing the tail far out; its paint is plain colour, so the Garage repaints it |
| Neon racer | "Green Bug Stylized Scifi Car Free" by ferofluid | 4.3 × 2.3 m | 185 km/h | 0 to 100 in 2.5 s, the quickest of the cars; grips hardest and turns in sharpest (131°/s at 50 km/h) |
| Night cruiser | "Blade Air Stylized Scifi Car Free" by ferofluid | 4.6 × 2.1 m | 205 km/h | 0 to 100 in 3.8 s. The fastest of everything, heavy: slow to turn, rolls on and on off the gas, thrown less by a hit |
| Dune buggy | "Dune Buggy \"jump\"" by XP_Frost | 3.5 × 3.1 m (its wheels out on long arms) | 145 km/h | 0 to 100 in 3.1 s. Light and bouncy: loose on the road, thrown highest of the cars, slow to fall, landing up to 50° off upright and bouncing |
| Farm truck | "Farm pickup truck" by Nekitron | 5.0 × 2.25 m, 2.8 m tall | 115 km/h | 0 to 100 in 9.4 s, turning wide (79°/s at 50 km/h), barely thrown up, squashes and shakes the view more |
| Police cruiser | the police car of "LowPoly Cars Pickup, Sedan, Police, StationWagon" by JG3D | 4.0 × 2.3 m | 180 km/h | 0 to 100 in 3.5 s. A steady all-rounder; plain black-and-white livery, no words or crest |

Their wheels spin with the speed (each by its own size) and the front ones steer, turned against a
drift as the rides' are. Nothing turns in the air faster than the kart, as for the rides.

**Where they live.** `drive/public/cars/`: each car's `.glb`, its picture in `thumbs/`, `cars.json`
(file, size, wheels, triangles and the source: title, author, link, licence) and `CREDITS.md`.
`vite.drive.config.js` makes `drive/public/` World Drive's public folder, so only its build publishes
them (at `/cars/...`); the construction app's library (`public/library/`) and its build never see
them. They add 2.8 MB to the built site (2.74 MB of models, 52 kB of pictures), and a model is only
fetched for the car being driven or looked at in the Garage. CC BY asks for credit: each car's model, author, licence and link (and what was
changed) are in the About box, under the ride picker while it's picked, and in `CREDITS.md`.

**Adding a car.** `npm run add-drive-car -- <sketchfab url> --id night-cruiser --length 4.6 --front=+z`
(with the same Sketchfab token as `add-asset`), then `npm run drive-car-thumbs -- night-cruiser`, then
its name, blurb, tuning and whether it needs the pass in `cars.js` and its id in `DRIVE_CARS`
(`catalog.js`). The importer:

- checks the licence (downloadable, CC0 or CC BY only) and prints the description, to read for anyone
  else to credit (`--credit`) and any conditions;
- bakes the model to its real size (`--length` along the front axis `--front` names), facing -Z on
  y = 0, with nothing left in its transforms; `--part <node>` takes one car out of a set;
- finds the wheels by shape, whatever they're called: a tyre is a piece of its own standing on the
  ground at a corner, about as long as it's tall, and whatever sits wholly inside its circle (rim,
  hub, disc) turns with it. Each wheel becomes a node at its axle (`wheel-front-left`...) with its
  radius and whether it steers; the rest is `body`. A model whose tyres are joined to the body, or
  rigged, is turned away with the reason;
- `--paint` and `--rims` name the materials the Garage may repaint (the muscle car's body and rims);
  `--lit` shades a model drawn unlit, as the rest of the world is;
- `--lamps` names the material of lamps drawn as a real maker draws theirs (three bars a side is one
  maker's mark): each side's become one plain lamp, the box round them, and the credits say so;
- compresses it (meshopt, WebP textures up to `--max-texture`, 1024; `--simplify` if it's heavy).

The muscle car, say, was `--id muscle-car --length 4.7 --front=+z --paint Material --rims Material.001
--lamps Material.004`.

`drive-car-thumbs.mjs` draws every picture the same way (World Drive's dev server in Chromium, the
car from ahead and to its left, on nothing), whatever Sketchfab's own pictures were.

**Choosing them** (Sketchfab, 31 October 2026: downloadable, CC0 or CC BY, under 60,000 triangles).
CC0 cars hardly exist there, so all six are CC BY. Turned away was anything named after or drawn from
a real car, maker, film or game (names, tags, descriptions and textures read), anything whose wheels
couldn't be made to turn, and other people's concepts:

| Model | Author | Verdict |
| --- | --- | --- |
| [Classic Muscle car](https://sketchfab.com/3d-models/classic-muscle-car-641efc889e5f4543bae51d0922e6f4b3) | Lexyc16 | ✔ Muscle car: a generic 1970s coupe with no badges, but its tail lamps were three bars a side, a well-known maker's mark, so the importer makes each side one plain lamp (`--lamps`); separate wheels; plain colours, so paintable; 5,500 triangles |
| [Green Bug Stylized Scifi Car Free](https://sketchfab.com/3d-models/green-bug-stylized-scifi-car-free-34f1a7734d474b34a8291f613a581ccb) | ferofluid | ✔ Neon racer: an original sci-fi design, separate wheels, clean textures (no writing); 27,000 |
| [Blade Air Stylized Scifi Car Free](https://sketchfab.com/3d-models/blade-air-stylized-scifi-car-free-8444b0a772624900a68049e270a01c29) | ferofluid | ✔ Night cruiser: original; wheels separated by shape; 15,000 |
| [Dune Buggy "jump"](https://sketchfab.com/3d-models/dune-buggy-jump-c9838cac69904010923d5024168b0893) | XP_Frost | ✔ Dune buggy: a tube-frame buggy of no make (a race number only); wheels separated by shape; 29,000 |
| [Farm pickup truck](https://sketchfab.com/3d-models/farm-pickup-truck-5615b16ba2e24f7ab6cd26eda7946ae8) | Nekitron | ✔ Farm truck: a hand-painted old truck of no make, separate wheels; 5,400 |
| [LowPoly Cars Pickup, Sedan, Police, StationWagon](https://sketchfab.com/3d-models/lowpoly-cars-pickup-sedan-police-stationwagon-8fb25f8fc1064f4d88a98294c757eef5) | JG3D | ✔ Police cruiser (its police car only): generic livery with no words or crest, blank plates; 6,000 |
| [Ice Cream Truck](https://sketchfab.com/3d-models/ice-cream-truck-b8b1294228044e64af8bfbae82c80ac0) | Bogdan Strielecki | ✘ Original and fun, but its tyres are one piece with the body: they couldn't turn |
| [Toony Yellow Formula Racer](https://sketchfab.com/3d-models/toony-yellow-formula-racer-cartoon-race-2c5e07abb88a441d85584cab8733c0d2) | ARTEL_3D | ✘ The whole car is one welded piece: no wheels to turn |
| [Colorful Cartoon Police Car](https://sketchfab.com/3d-models/colorful-cartoon-police-car-3d-model-c3b82fd5b86c4fd0931c0217b4670ee3) | Skill Artist | ✘ Stands at an angle in its file, so its wheels weren't found square; the JG3D car does the job |
| [Offroad Rally Trophy Truck 4x4 Lowpoly](https://sketchfab.com/3d-models/offroad-rally-trophy-truck-4x4-lowpoly-812abec58e8943a49c7f3a46d522d1a7) | nabeelashrafphotography | ✘ Rigged: its wheels hang off bones |
| [Low Poly Car Set](https://sketchfab.com/3d-models/low-poly-car-set-9b8a51478e404a3594e11584b90a0e91) | BetelgeuseMan | ✘ Original toy-like taxis and police cars, but so tall and boxy that at a car's length they stand 3.6 m high |
| [Cartoon Sports Car](https://sketchfab.com/3d-models/cartoon-sports-car-bd149c9a899d46bfa97326934dfa769c) | Nirvana Studio | ✘ A caricature of a well-known 1980s Japanese hatchback |
| [Cicada - Retro Cartoon Car](https://sketchfab.com/3d-models/cicada-retro-cartoon-car-135b16b4f77249d8ad13185270f94251) and [Cartoon Sports Car](https://sketchfab.com/3d-models/cartoon-sports-car-0fd87559642a41b7a7924876ad3e9399) | RCC Design | ✘ Cartoons of real cars (tagged with their makers' names) |
| [Modern Cartoon Sports Car](https://sketchfab.com/3d-models/modern-cartoon-sports-car-2186dbdfe51a42f9ae230431d1e9d754) | RCC Design | ✘ A cartoon of a current Italian supercar, its badge on the nose |
| [Cartoon_sports_car](https://sketchfab.com/3d-models/cartoon-sports-car-a0db886ee94f478aa629b5cdd38d2160) | Arham Abdullah | ✘ The same model as RCC Design's cartoon of a real car, uploaded again |
| [(FREE) Racing Car in 3 styles](https://sketchfab.com/3d-models/free-racing-car-in-3-styles-12cbb1078c37497caa3a9e205f665cdc) | Mena | ✘ A real supercar, its model name on the picture |
| [Free Generic Muscle Car - STYLIZED (1970s)](https://sketchfab.com/3d-models/free-generic-muscle-car-stylized-1970s-0cccd454adb44ea981862ac1d83ce250), [Stylized Low Poly Muscle Car](https://sketchfab.com/3d-models/stylized-low-poly-muscle-car-free-eedfeed9cebc497582cf962f25cbbe5e), [Derby car](https://sketchfab.com/3d-models/derby-car-free-30331d8e1355492f8be6ec7bb5b556bc) | bloxy_crazy, nano nova, FelikinRuslan | ✘ Each "based on" a named real muscle car (description or tags) |
| [Low-poly sports car](https://sketchfab.com/3d-models/low-poly-sports-car-23dfdeb55dc24970b36065afaab7a8a5), [NFX Car](https://sketchfab.com/3d-models/nfx-car-979875e117814e46ace66d1fc8697b5d), [Generic Toyama XR Sedan](https://sketchfab.com/3d-models/generic-toyama-xr-sedan-a161542c38ac44fca3b1c283f6d986bb), [Casual Daily Art / 03 - Car](https://sketchfab.com/3d-models/casual-daily-art-03-car-99109de883894ed494107aaed094acf5) | Juff22, Reivilodius, mk2design, Hellbrush | ✘ Based on named real cars (descriptions and tags) |
| [Coupe '33 Hot Rod #2](https://sketchfab.com/3d-models/coupe-33-hot-rod-2-low-poly-model-c880d700b7ec445ea9718e1b73f97e3e), [Fairheaven LT '80 Cop Cruiser](https://sketchfab.com/3d-models/fairheaven-lt-80-cop-cruiser-low-poly-model-61766c1e6e1e4b2b803c174f33433a74), [Canyon '75 Taxi](https://sketchfab.com/3d-models/canyon-75-taxi-low-poly-model-9e8f92a215784f3d8aaaaeab1bef54c4), [Saba V12 '95](https://sketchfab.com/3d-models/saba-v12-95-low-poly-model-3ab977050c334c13b6abb5de078b4957), [Sanremo '70](https://sketchfab.com/3d-models/sanremo-70-low-poly-model-b2261c471645417a8b7e5882d541c248) | Daniel Zhabotinsky | ✘ Well made, but real cars' bodies (a '33 hot rod coupe, a classic New York cab, 1980s police sedans, Italian supercars) under made-up names |
| [Hot Rod](https://sketchfab.com/3d-models/hot-rod-16d4373a090444688d87768e2b59f7e2) | Mario | ✘ "Based on Mad Max: Fury Road", a film's car |
| [Cyberpunk car](https://sketchfab.com/3d-models/cyberpunk-car-b4301ff99d214d16a7a43708a5866bf0) | 4d_Bob | ✘ Inspired by another game's cars |
| [Retro Police Car](https://sketchfab.com/3d-models/retro-police-car-987ac49f178d4fdb82ded6988a9e96e6) | MadeByYeshe | ✘ "Inspired by" a real car and styled after another game |
| [Car](https://sketchfab.com/3d-models/car-acccd15d4e454399a39dbe40f4f6df71) and [Retro car stylized](https://sketchfab.com/3d-models/retro-car-stylized-880582f91feb41aabd2c8ec6d4b8038a) | cuadot, makcutka250 | ✘ Modelled from other artists' concept art, which their licence can't speak for |
| [Flying Retro Car](https://sketchfab.com/3d-models/flying-retro-car-92b34852dc4144faa0e1d7a68d70411e), [Off Road 4X4 racer](https://sketchfab.com/3d-models/off-road-4x4-racer-with-4-different-skins-b065496a2a8a4bf6ba6ab4e4fe5ce133) | OzerGokmen, Duane's Mind | ✘ A famous small German car's body |
| [Futuristic racing car "Molnia"](https://sketchfab.com/3d-models/futuristic-racing-car-molnia-738a78a4c9154614b90029bf8bb80d61), [Hover-Car](https://sketchfab.com/3d-models/hover-car-low-poly-sci-fi-game-ready-95fc47d2715247f89c8e359dc1838b14) | TuppsM, Mert Tetik | ✘ Hover pods with no wheels (the hovercraft already floats); one with its doors open and a plate |
| [futuristic sports car](https://sketchfab.com/3d-models/futuristic-sports-car-c992e5e3924a4278b69e1c6b76113014) | k13473117 | ✘ Made by an AI generator (tagged Rodin): no telling what it was drawn from, and one lump |
| [Sylized Hand Painted Cartoon Car](https://sketchfab.com/3d-models/sylized-hand-painted-cartoon-car-01f98e92152d4d8386131ffe322f3210) and Van | ferofluid | ✘ The car is modelled with its doors and bonnet open; the van is tagged with a maker's name |

### The Garage

**Garage** under the rides on the globe, and in the pause menu, opens the paint shop
(`src/drive-app/garage.js`, the looks in `src/drive-app/paint.js`): every ride turning on a
turntable (drag to turn it; **▶ Boost** shows its boost and trail), and for each:

| | Free | With the pass |
| --- | --- | --- |
| Body colour | Blaze orange, racing red, ice white | 9 more |
| Finish | Gloss | Matte, metallic |
| Decal | None | Racing stripes, a number (0 to 99), flames, checker |
| Rims (a hovercraft's trim) | Silver, graphite | Gold, white, red, blue, lime, pink |
| Boost style | Classic flame, bubbles, confetti | Plasma, lightning, glitter, comet, neon rings, fireworks, hearts, pixel, ink |
| Flame colour (the classic flame's) | Orange | Blue, green, purple, pink, rainbow |
| Trail (boosting or flying) | None | Smoke (in 8 colours), sparkle, rainbow ribbon (six bands side by side) |

**Boost styles** (`src/drive-boosts.js`; the Garage's list, with a little picture for each, is
`src/drive-app/boosts.js`) are what the booster leaves behind:

| Style | |
| --- | --- |
| Classic flame | The flame as it always was, in its colour |
| Bubbles | Soap bubbles floating up and wobbling away, each popping at the end |
| Confetti | Paper rectangles in party colours, tumbling over and over as they flutter down behind |
| Plasma | A blue-white electric flame crackling with little arcs, throwing blue sparks |
| Lightning | Forked bolts crackling back and out from the exhaust, struck again every few hundredths of a second |
| Glitter | A stream of tiny twinkling stars in white, gold, pink, sky and lilac |
| Comet | A throbbing white-blue head and a long glowing tail that narrows and turns blue behind it |
| Neon rings | Glowing hoops thrown out flat across the way it's going, so the camera looks through them |
| Fireworks | Little rockets bursting over it into balls of sparks in one colour, which fall and twinkle out |
| Hearts | Hearts rising and swaying away, beating as they go |
| Pixel | Chunky squares in a bright palette on a grid in the world, shrinking in steps and blinking out |
| Ink | Blobs of bright paint flung out behind, leaving splats on the road for five seconds, drawn out longer the faster it goes |

The flame colour was the Garage's only boost choice before the styles. It's now the classic flame's
colour, shown under it, so a look saved before (a flame and no style) is the classic flame in the
colour it had; without the pass a saved style is the classic flame again, as anything else locked
goes back to its free choice.

Each style is one batch of quads drawn from one picture sheet, in one draw call: billboards, strips
along a line (a bolt, a comet's tail) or quads flat across a normal (a ring, a splat on the road).
It has a fixed number of particles, made once with its buffers (its budget, 40 to 280; the oldest
is reused when they're all in use), and each frame only the numbers in its buffers change, so
nothing is made while boosting. Most of what's thrown out is carried along at 85 to 97 % of the
vehicle's speed (ink and a comet's tail less), with the air slowing only its own motion, so at
150 km/h it trails a few metres behind, between the vehicle and the chase camera, rather than being left on the road, which at that
speed is behind the camera in a tenth of a second. The supersonic effects are one more batch (120).
On the test pad (software rendering in the test's browser), a minute of boosting each made nothing
new (no geometries, textures, programs, objects or materials) and kept within its budget (at most
205 alive, glitter's); the driving and its effects took 0.1 to 0.2 ms a frame with any style, and
drawing them added 2 to 10 % to a frame for most, and up to a fifth for those that cover the most
of the view (lightning 15 %, fireworks 22 %).

Choices are kept for each ride in this browser (`world-drive.garage` in localStorage) and put on
whenever it's driven; picked while paused they're on it as soon as it drives on. A browser that keeps
nothing (site data blocked) still wears them for the visit, and a damaged value there is simply
replaced by the next choice. Decals are projected
onto the bodywork through boxes each ride gives (its `userData.decals`). The trucks from the library,
and the cars whose paint is a picture on the model (all but the muscle car), keep their own paint:
only their flame and trail change, and the Garage says so ("Its paint is part of the model, so it
keeps it"). The muscle car's paint is plain colour, so it takes colours, finishes, rims and decals
as the rides do (the free ones without the pass). A ride in the colour and finish it came in
keeps its own materials, so the kart nobody has painted is just as it was. The trails are cheap: a
pool of sprites, or one ribbon whose buffers are rewritten in place, nothing made each frame. On the
test pad (software rendering in the test's browser), the booster's flame made a frame about 7 %
slower and a trail behind it a few per cent more again; the driving and its effects took 0.2 to
0.3 ms a frame with or without them. While the Garage is open the world behind it isn't drawn (its
turntable is, with a renderer of its own): on a phone, where it fills the screen, drawing both took
two to four times as long a frame.

`node --test scripts/test-drive-pro-ui.mjs` tries all of this on the test pad with no key: the locked
rides and choices opening the sheet, `?pro=1` counting only on this computer, the free kart
unchanged, each ride driving, drifting, thrown up by a wall and landing, their handling measured
against each other, the hovercraft hovering with no wheels, the monster truck over a car, the
Garage's choices on the ride and kept across a reload (and still made with a damaged saved value,
or none kept at all), the world not drawn behind the Garage, the frame time with trails, nothing
turning in the air faster than the kart, each ride going supersonic, the boost styles in the Garage
(three free, the rest opening the sheet), a look saved before the styles keeping its flame's colour,
every style drawn at 150 km/h (with a picture of each), making nothing new in a minute of boosting
and timed, and the Garage and the locked rides' badges on a phone. And the cars: each listed in
`cars.json`, `cars.js` and `DRIVE_CARS` alike, under 2 MB, CC BY or CC0 and in `CREDITS.md`, its real
size, with four wheels and the front two steering; without the pass the muscle car free, pictured,
credited under the picker and in About (all six, with links), driving, drifting, thrown up by a wall
and landing, and the others opening the sheet; with it each car driving, drifting, thrown up and
landing, its wheels spinning and the front ones steering the right way, its size as imported, and
their handling against each other (the night cruiser fastest, the neon racer quickest to 100, the
dune buggy thrown highest, the farm truck slowest); the Garage repainting the muscle car (colour,
rims, decals) and saying the others keep their paint, with only a boost and trail to pick.

## Supporter Pass (buying it)

The pass is one payment of **CA$4.99**, no subscription, through a Stripe Payment Link in World
Drive's own Stripe account. It comes with what's [above](#supporter-pass-content) (five cars, the four
rides and the whole Garage), a **⭐ by your name on the leaderboard**, and **30 drives a day** instead of 8.
A pass is a Google account's, so it's yours in any browser you sign in on: signing in is only ever
for the pass, and driving and the leaderboard never need it.

### What people see

- **The pass's sheet** (any locked ride or Garage choice, or **⭐ Supporter Pass** under the rides):
  signed out, Google's **Sign in with Google** button ("Sign in to buy, so the pass is yours in any
  browser. Bought it already? Signing in brings it back."). Signed in, **Buy for CA$4.99**, with
  "Signed in as ... · Restore purchases · Sign out" under it.
- **Buy** opens the Payment Link in a new tab, with `client_reference_id` (the account's id, which
  Stripe hands back with the payment, so the Worker knows whose it is) and `prefilled_email` (the
  Google address). The sheet says to finish paying there, with **Check again**.
- **Back from Stripe.** Stripe sends the buyer to `https://worlddrive.app/?supporter=thanks`: the page
  tidies the address, asks the Worker (again every 3 s for half a minute, in case Stripe's webhook is
  a moment behind) and says **Thanks! Supporter Pass unlocked**. Going back to the first tab instead,
  it asks as soon as the window has focus again. The rides and the Garage's extras unlock at once
  (`setPro( true )` in `pro.js`), mid-drive or not.
- **Every visit after**, signed in, the pass is simply on. On another browser, **Sign in with
  Google** (in the sheet, or in the pause menu: "Have the Supporter Pass? Sign in to use it here.")
  brings it back: that's "restore purchases". The pause menu also says who's signed in, with
  **Sign out**, which locks the pass again in that browser.
- **The used-up screen** ("Today's free drives are used up", this address's 8 gone, not everyone's
  300) has the same sign-in, for a supporter on a new browser or one who cleared the site's data, and
  for a buyer brought back from Stripe before its webhook arrived (that tab starts a visit of its own,
  counted by the address until the pass is known). Once the account there has the pass, the visit
  is asked for again, once: a supporter who has had their 30 sees the screen, saying who's signed in.
- Signed in, the browser's leaderboard player is linked to the account (once), so a supporter's ⭐
  shows by their name on every board. Signing out forgets that it was linked (the note holds the
  email), so signing in again links it again.
- With no sign-in set up (`GOOGLE_CLIENT_ID` empty), no Worker (the dev server alone) or the Worker
  not answering, the sheet keeps **Coming soon** and nothing else changes. With sign-in but buying
  off, it's **Coming soon** with a sign-in for those who already have the pass (`SUPPORTER_EMAILS`).
  No call failing ever stops the drive.

### How it works

- **Signing in** (`worker/drive/accounts.js`): the page posts the ID token from Google's button to
  `POST /api/session { credential }`. It's checked as the construction app checks its own (shared
  code, `worker/google.js`: RS256 by one of Google's current keys, issued by Google, for
  `GOOGLE_CLIENT_ID`, not expired, a verified email), and the account (`accounts`: Google's id,
  email and name) is made or updated. The answer sets a session cookie for 30 days, made by the
  construction app's code (`worker/sessions.js`) under its own name: `__Host-wd_session`, `Secure`,
  `HttpOnly`, `SameSite=Lax`, `Path=/`. Only the SHA-256 of its token is kept (`sessions`).
  `DELETE /api/session` signs that browser out. Anyone with a Google account can sign in, up to 50
  times a day from one visitor (counted like the leaderboard's names), so a token sent again and
  again for the hour it's good for can't fill the database with sessions.
- `GET /api/me`: `{ signedIn, name?, email?, supporter, purchase: { enabled, link?, price?,
  clientReferenceId? } }`.
- `POST /api/player/link { id, secret }`, signed in: the leaderboard player (proved by its secret, as
  a rename is) becomes the account's (`players.account_id`); 20 a day from one visitor.
- **Stripe's webhook**, `POST /api/stripe/webhook` (`worker/drive/supporter.js`): the one route without
  the same-origin and JSON checks (it comes from Stripe's servers, not a page) and without a session.
  It proves itself with its `Stripe-Signature`, checked by the code the construction app's webhook
  uses (`worker/stripe.js`): HMAC-SHA256 of `<t>.<raw body>` with the signing secret, compared in
  constant time with each `v1` (any may match, for when a secret is being rolled), refused with 400 if
  none does or `t` is more than five minutes off; bodies over 256 kB are a 413. While the link is a
  live one (not `https://buy.stripe.com/test_...`), or there's none, an event that isn't
  `livemode: true` is answered 200 and ignored: a test-mode endpoint's secret set here by mistake
  would otherwise let anyone with a test link pay with Stripe's test card, for nothing. Then:
  - `checkout.session.completed` with `payment_status: 'paid'`, or
    `checkout.session.async_payment_succeeded` (bank debits and the like complete unpaid first),
    records a purchase once per Checkout Session (the same event again changes nothing): the account
    named by `client_reference_id`, else nobody's yet, and whoever signs in with the email paid with
    (which Google has checked is theirs) has it. With `SUPPORTER_PAYMENT_LINK_ID` set, only that
    link's checkouts count; without it any paid checkout on the account does (it's World Drive's own).
  - `charge.refunded` with `refunded: true` (refunded in full) marks that payment's purchase refunded,
    which takes the pass away. A partial refund keeps it.
  - `charge.dispute.funds_withdrawn` (a chargeback: the bank has taken the money back) marks it
    `disputed`, which takes the pass away too; `charge.dispute.funds_reinstated` (the dispute won)
    gives it back, unless it was refunded meanwhile.
  - Stripe doesn't promise to deliver events in order, and a delivery that failed is retried for up
    to three days, so a refund or chargeback can arrive before its checkout. Each is also kept by its
    PaymentIntent (`reversals`), and a checkout arriving after it comes in already taken back.
  - Anything else properly signed is answered 200 and left alone, so Stripe doesn't send it again.
- **Who has the pass** (`hasPass`): an account with a purchase that isn't refunded, its own or one paid
  with its email by someone not signed in, or whose email is in `SUPPORTER_EMAILS`. It's looked up
  each time, never copied, so a refund or a change to `SUPPORTER_EMAILS` counts straight away.
- **30 drives a day**: `/api/visit` with a supporter's session counts the visit against the account
  (hashed with the day's salt, like an address) with `PER_VISITOR_DAILY_SUPPORTER` (30), not against
  the address. It still counts towards `DAILY_VISITS` for everyone. If the database can't be asked
  just then, the visit goes ahead as anyone's.
- **The ⭐**: leaderboard rows (and your own row) have `supporter: true` for a player linked to a
  supporter's account, looked up as the board is made (one look in each index per row); boards are
  cached for half a minute, so a new ⭐ or a refund shows within that.
- In the page, `src/drive-app/supporter.js` fills the sheet's buy area (`buyArea()` in `pass.js`) and
  the pause menu's account line. Google's script (`accounts.google.com/gsi/client`) is only loaded
  once one of its buttons is on screen.

### Settings

| Setting | Where | What it is |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | `vars` | The OAuth web client's id (public). Empty: no signing in, no buying, and the sheet says "Coming soon" |
| `SUPPORTER_PAYMENT_LINK` | `vars` | The Payment Link, `https://buy.stripe.com/9B6bJ0fSYaMf3nc0cCfrW00` (live, public) |
| `SUPPORTER_PRICE` | `vars` | The price as the page shows it: `CA$4.99` |
| `PER_VISITOR_DAILY_SUPPORTER` | `vars` | A supporter's drives a day (30) |
| `STRIPE_WEBHOOK_SECRET` | secret | The webhook endpoint's signing secret, `whsec_...`: the live endpoint's while the link is live |
| `SUPPORTER_EMAILS` | secret, optional | Comma-separated: people who have the pass without paying (you, testers) |
| `SUPPORTER_PAYMENT_LINK_ID` | dashboard text, optional (recommended) | The link's `plink_...` id: only its checkouts count |

Buying is on only when `GOOGLE_CLIENT_ID`, the link (an `https://` address) and a `whsec_` secret
are all set, and `SUPPORTER_PAYMENT_LINK_ID`, if set, is a `plink_` id. Anything else leaves it off,
so pasting the account's API key (`sk_...`) into the secret by mistake can't turn it on half-working.
The webhook itself only needs the secret: a payment that arrives is kept whether or not the page
offers buying just then.

### The owner's steps

1. **Google sign-in.** In Google Cloud, Google Auth Platform → **Clients**: the web client (the Print
   Yours one is fine) with `https://worlddrive.app` under **Authorized JavaScript origins**. Put its
   **Client ID** (it isn't a secret) in `wrangler.drive.jsonc` as `GOOGLE_CLIENT_ID`, commit and push:
   Workers Builds deploys it, and the deploy applies the new tables (`0002_supporter_pass.sql`) first.
2. **The Payment Link's redirect.** Stripe Dashboard (World Drive's account, **live**: the link in
   `wrangler.drive.jsonc` has no `test_` in it, so it takes real money) → **Payment Links** → the link
   → **Edit** → **After payment**: **Don't show confirmation page**, and redirect customers to
   `https://worlddrive.app/?supporter=thanks`. While there, turn off letting customers adjust the
   quantity. Recommended: copy the link's `plink_...` id (on its page, and in the page's address) into
   `SUPPORTER_PAYMENT_LINK_ID` as a dashboard text variable, so a checkout on anything else the
   account ever sells can't count as a pass.
3. **The webhook**, with **Test mode off** (a test-mode endpoint never hears of live payments, and its
   events are ignored here anyway while the link is live). Stripe Dashboard → **Developers →
   Webhooks → Add endpoint** (in Workbench: **Webhooks → Add destination**, your account's events,
   then **Webhook endpoint**):
   - Endpoint URL: `https://worlddrive.app/api/stripe/webhook` (not `www.`: Stripe doesn't follow the
     redirect)
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `charge.refunded`, `charge.dispute.funds_withdrawn` and `charge.dispute.funds_reinstated`
   - Any API version: only fields every version has are read.

   Create it and reveal its **Signing secret** (`whsec_...`).

   To try it all without real money first: a test-mode Payment Link (`https://buy.stripe.com/test_...`)
   in `SUPPORTER_PAYMENT_LINK` and a test-mode endpoint's secret in `STRIPE_WEBHOOK_SECRET`, then pay
   with Stripe's test card `4242 4242 4242 4242`. Put the live link and the live endpoint's secret
   back before anyone else can buy: while the link is a test one, anyone can get the pass with that
   card.
4. **The secret.** Cloudflare dashboard → Workers & Pages → **world-drive** → Settings → Variables and
   Secrets → **Add** → type **Secret**, name `STRIPE_WEBHOOK_SECRET`, the signing secret as its value
   (or `npx wrangler secret put STRIPE_WEBHOOK_SECRET -c wrangler.drive.jsonc`). It takes effect at
   once, and buying opens. Optionally add `SUPPORTER_EMAILS` the same way.
5. **Try it for real.** The link is live, so a test is a real purchase: open worlddrive.app, open the
   pass, sign in, **Buy for CA$4.99** and pay with your own card. Stripe brings you back and the page
   says *Thanks! Supporter Pass unlocked*; the webhook's page in Stripe lists the delivery with our
   answer (200). Then refund it in full (Stripe Dashboard → **Payments** → the payment → **Refund**):
   the pass locks again at your next visit. Stripe keeps its fee on a refunded payment, so the test
   costs that much.

### Giving and taking away a pass by hand

In the D1 console (Storage & Databases → D1 → **world-drive** → **Console**; times are milliseconds
since 1970):

```sql
-- Look someone up by their Google email: their account and passes.
SELECT a.id, a.email, a.name, p.checkout_session, p.status, p.refunded_at FROM accounts a
LEFT JOIN purchases p ON p.account_id = a.id OR ( p.account_id IS NULL AND p.email = a.email ) WHERE a.email LIKE '%eve@%';

-- Give someone the pass, by the email they sign in with (signed in or not yet).
INSERT INTO purchases ( checkout_session, email, status, created_at ) VALUES ( 'granted-eve', 'eve@example.com', 'granted', strftime( '%s', 'now' ) * 1000 );

-- Take it away (a pass given by hand, or anything Stripe didn't tell us): it stays on record, refunded.
UPDATE purchases SET status = 'refunded', refunded_at = strftime( '%s', 'now' ) * 1000 WHERE checkout_session = 'granted-eve';

-- A payment through the bare link with an email that isn't their Google one: give it to their account.
UPDATE purchases SET account_id = 12 WHERE checkout_session = 'cs_live_...';
```

`SUPPORTER_EMAILS` does the same as the first for anyone you name, without the console.

### Known gaps

- **The lock is in the page.** The pass's rides and the Garage's extras are code in the public site,
  so someone who digs through it can switch them on in their own browser. What the Worker keeps for
  supporters (the 30 drives and the ⭐) can't be had that way.
- A chargeback's "won" (`funds_reinstated`) delivered before its "withdrawn" leaves the pass taken
  away: Stripe would have to retry the first for longer than the whole dispute took. Give it back by
  hand (above). An early fraud warning or an inquiry takes no money, so it changes nothing.
- Only `paid` counts: a 100 % discount code (`no_payment_required`) doesn't give the pass. Use
  `SUPPORTER_EMAILS` or the console to give one away.
- A supporter on a new browser has the address's 8 drives until they sign in (in the pass's sheet,
  the pause menu or the used-up screen). Buying isn't offered on the used-up screen.
- Runs in the pass's rides and cars are accepted on the leaderboard from anyone (`PASS_RIDES` and
  `DRIVE_CARS` in `scores.js`): the lock is in the page, so a row may show one of those by a name
  without a ⭐. Likewise the cars' models are public files, as the library's are.
- No receipts or purchase history in the page: Stripe emails its own receipt if that's on in its
  settings.

## What a visit costs, and how it's capped

Google bills the Map Tiles API by the **3D tiles session**: each page that loads the root tileset
starts one. World Drive is built so that one page load is one session, however much you fly about:

- The root tileset is requested once per page load. **Drive here** doesn't load a new world: it moves
  the one already loaded so the new place is at the scene's centre (`recentreTiles` in `src/world.js`,
  the same transform `ReorientationPlugin` makes when the tiles arrive), and keeps the camera where it
  was on the Earth (`GlobeView.capture` / `restore`). Tiles already loaded stay loaded.
- The tiles' session isn't renewed by itself (`autoRefreshToken: false`): renewing would be a new
  billed session. After a few hours on one page, Google ends the session; World Drive then says to
  reload, which counts as a new visit.
- The built site never contains the Maps key. The page asks the Worker for it once as it starts
  (`POST /api/visit`), after an invisible Cloudflare Turnstile check, and only while the day's visits
  are under two caps: **DAILY_VISITS** for everyone together (300) and **PER_VISITOR_DAILY** for each
  visitor (8; a supporter signed in has **PER_VISITOR_DAILY_SUPPORTER**, 30, counted by their account).
  Both start again at midnight UTC.
- Over a cap the page shows **Today's free drives are used up**, with how long until fresh drives,
  and loads nothing from Google. A failed robot check shows **We couldn't check you're a person**
  with **Try again**. With no key set, it shows **World Drive is getting ready** (with a flat test pad
  to drive, which costs nothing).

A visitor is a hash of their IP address with a random salt made each day (for IPv6, the address's
first half, its /64: the block a home or a phone is given, so the billions of addresses in it are one
visitor); addresses are never stored, and each day's salt and counts are deleted when the next day
starts. Both caps are counted in
one Durable Object (`worker/drive/limits.js`, on SQLite storage, which every plan has), so two
visits at once can't both take the last drive.

The key still reaches the browser (that's how the tiles are fetched), so someone determined could copy
it from a visit. That's what the Google-side limits below are for: the key only works from
worlddrive.app, only for the Map Tiles API, and only up to a daily quota.

### Search

`GET /api/search?q=` passes the search to OpenStreetMap's Nominatim under its usage policy: World Drive
names itself in the User-Agent (`WorldDrive/1.0 (+https://worlddrive.app)`), sends at most one request
a second from everyone together (a busier queue gets "try again in a moment"), keeps each answer in
Cloudflare's cache for a day (by the tidied query, so `Furka  Pass` and `furka pass` are one lookup),
answers only with `{ name, lat, lon, type }`, and refuses queries over 120 characters or with
anything but letters, numbers and an address's punctuation. The globe's panel shows
"Search © OpenStreetMap contributors".

## The leaderboard

Each player's best stunt score today, this week and all time, for everyone on worlddrive.app to
see. There's no sign-up: a nickname is all it takes.

- **The trophy** at the top right of the globe (and **Leaderboard** in the pause menu) opens it:
  **Today**, **This week** and **All time**, the top 20 drivers' best runs with the tricks of
  their best jump, where, in what and (this week and all time) on which day. **Only Furka Pass**
  (whichever place you're driving, or have pinned on the globe) shows that place's board. Your own
  row is picked out; below the top 20 it says where you are: "You're #42 of 130, with 1,230".
- **A score is a run's**: everything from dropping in until you change ride or place (pauses don't
  end it). When a landed jump takes the run past your best today, anywhere or at that place, the
  run is posted, at most one every 15 s, while you drive on (so a place's board has your best there
  even on a day you did better somewhere else). The first time, a small card says **New best!** and asks **Post
  it to the leaderboard?**: **Post** asks for a name right there, without stopping the drive; **Not
  now** leaves it for later, from the pause menu's leaderboard, where picking a name posts the run
  that's waiting. After that, runs go up by themselves, and the card only shows for a new best ever
  or a better place on today's board.
- **Names** are 3 to 16 letters (any alphabet), numbers, spaces, _ or -, with nothing invisible in
  them, unique whatever their case and accents, with spaces, _ and - alike, and letters that look
  the same counted as one ("Speed Demon", "speed_demon" and "Ѕрееd Dеmоn" in Cyrillic letters are one
  name; so are "Alice" and "AIice"). A small built-in filter turns away slurs and obvious abuse,
  through the usual disguises (0 for o, 1 for i, Cyrillic or Greek letters for Latin ones, letters
  doubled, spaces between them), and names passing for World Drive (admin, worlddrive, moderator,
  staff...). **Rename** is in the panel. A name is picked on a drive on Google's map (it takes the
  visit's token, as a score does; the test pad has none). The name is kept in this browser (an id and
  a secret): in another browser, or after clearing the site's data, you pick a new one.
- **Days** start at midnight UTC and **weeks** on Monday, as the free drives' counts do.
- Only drives on Google's map post scores: the test pad (maps off, or the dev server) doesn't.
- A bad connection never gets in the way: a post that doesn't get through is tried again a couple
  of times, and the drive carries on regardless.

### How cheating is limited

The game runs in your browser, so the Worker never sees a score being made. What it can do is make
cheating cost something and keep the boards believable (`worker/drive/scores.js`):

- **A visit token.** A score is only taken with the token `/api/visit` hands out with the Maps key:
  "v1.<visit id>.<expiry>.<signature>", an HMAC-SHA256 whose key is derived (HKDF) from
  `TURNSTILE_SECRET`, so there's no new secret to set, and good for 6 hours. So every score comes
  from a visit that passed Turnstile and was counted against the day's caps: a script can't post
  without spending a drive. A new name takes the token too, and one visit makes one player and posts
  for that player only (the first to use it), so one robot check can't fill the board, or the
  database, with names: there are never more new names in a day than visits (`DAILY_VISITS`). A
  token that's forged, changed, expired or someone else's is a 403.
- **What the game can score.** Scores are whole tens; the tricks read exactly as the game names them
  (at most five in a jump); the vehicle is one World Drive offers. A run can't have lasted longer
  than its visit (give or take 30 s), nor scored more than **131,565 points a second** of it: three
  times the most the game can give, about 43,855 a second (spinning, flipping and rolling flat out
  all at once, every second in big air, with two wall bounces, all as a combo at ×10; worked out from
  the scoring in `src/drive.js`, and the tests fail if the two drift apart). Nothing over
  1,000,000,000 (six hours flat out is 947 million). Anything else is a 400.
- **How often.** One score every 10 s from a player (429 with Retry-After); 1,500 scores and 20 new
  names or renames a day from each visitor, counted, like the visits, as a hash of their address
  (an IPv6 address by its /64) with the day's salt (`SCORES_PER_VISITOR_DAILY`,
  `NAMES_PER_VISITOR_DAILY`).
- **Only bests are kept**, one per player on each board, so posting over and over adds nothing.
- The secret is kept only as its SHA-256, so a copy of the database can't post as anyone; addresses
  aren't kept at all.

What this can't stop is someone who reads the page's code and posts a made-up score that looks like
one the game could make, from a real visit. That's what the log and the console are for.

### Looking after it

The database is **world-drive** in D1 (binding `DB`): `players`, `best_scores` (each player's best
on each board: `period` is `all`, `day:2026-10-30` or `week:2026-10-26`, the Monday it starts;
`place_key` is `''` for anywhere or the place's name in lower case), `scores` (a log of every score
that changed a board, for 35 days) and `visits` (which player each visit made or posted for). The day and
week boards and the log go after 35 days, tidied as scores come in; the all-time board stays.

To look after it, open the Cloudflare dashboard → Storage & Databases → D1 → **world-drive** →
**Console**. Times are milliseconds since 1970. Boards, and each player's own row and rank on them,
are cached for half a minute, so a change shows within that.

```sql
-- Find a player by name (any case).
SELECT id, name, datetime( created_at / 1000, 'unixepoch' ) AS joined FROM players WHERE name LIKE '%demon%';

-- The fastest scoring in the last 35 days: where a cheat shows up first.
SELECT p.id, p.name, s.score, s.run_seconds, s.score / s.run_seconds AS per_second, s.place, datetime( s.created_at / 1000, 'unixepoch' ) AS at
FROM scores s JOIN players p ON p.id = s.player_id ORDER BY per_second DESC LIMIT 20;

-- One player's scores.
SELECT score, tricks, place, vehicle, run_seconds, air_time, visit, datetime( created_at / 1000, 'unixepoch' ) AS at
FROM scores WHERE player_id = 'PLAYER_ID' ORDER BY created_at DESC;

-- Rename an abusive name. name_key is how the Worker compares names (nameKey in
-- worker/drive/names.js): for a new name of plain letters and numbers with no l in it, like this
-- one, it's the name in lower case with - for the spaces.
UPDATE players SET name = 'Driver 4821', name_key = 'driver-4821' WHERE id = 'PLAYER_ID';

-- Take a cheat's scores off every board (they can carry on, from nothing).
DELETE FROM best_scores WHERE player_id = 'PLAYER_ID';
DELETE FROM scores WHERE player_id = 'PLAYER_ID';

-- Or remove the player and everything of theirs: their bests, log and visits go with them.
DELETE FROM players WHERE id = 'PLAYER_ID';
```

A removed player's browser is asked for a new name the next time it posts. There are no accounts to
ban; a determined nuisance is limited by the visit caps, and an address can be blocked with a
Cloudflare WAF rule if it comes to that.

## Settings

In `wrangler.drive.jsonc` (`vars`, set on every deploy; change them there, not in the dashboard):

| Setting | Default | What it is |
| --- | --- | --- |
| `DAILY_VISITS` | 300 | Visits a day for everyone together; 0 closes for the day |
| `PER_VISITOR_DAILY` | 8 | Visits a day per visitor |
| `TURNSTILE_SITE_KEY` | `0x4AAAAAAFs3k5sgUIQHSuGC` | The worlddrive.app Turnstile widget (public) |
| `PER_VISITOR_DAILY_SUPPORTER` | 30 | Visits a day for a supporter, signed in |
| `GOOGLE_CLIENT_ID` | empty | The Supporter Pass's Google sign-in (public); empty, no signing in or buying |
| `SUPPORTER_PAYMENT_LINK` | the live link | The Supporter Pass's Stripe Payment Link (public) |
| `SUPPORTER_PRICE` | `CA$4.99` | Its price, as the page shows it |

Secrets, set by the owner and never in a file (Cloudflare dashboard: Workers & Pages → world-drive →
Settings → Variables and Secrets, or `npx wrangler secret put NAME -c wrangler.drive.jsonc`):

| Secret | What it is |
| --- | --- |
| `GOOGLE_MAPS_API_KEY` | The Maps key from World Drive's own Google Cloud project (below). A secret named `Google_maps_api`, in any case, is taken too. |
| `TURNSTILE_SECRET` | The Turnstile widget's secret key |
| `STRIPE_WEBHOOK_SECRET` | The Supporter Pass webhook's signing secret, `whsec_...`; buying stays off without it |
| `SUPPORTER_EMAILS` | Optional, comma-separated: people with the pass without paying |

`keep_vars` is on, so anything set in the dashboard that isn't in `vars` survives a deploy. A few
more aren't in `vars` and needn't be set; add them in the dashboard (plain text) to change them:

| Setting | Default | What it is |
| --- | --- | --- |
| `SCORES_PER_VISITOR_DAILY` | 1500 | Scores a visitor may post a day (one every 10 s for four hours) |
| `NAMES_PER_VISITOR_DAILY` | 20 | New names and renames a visitor may make a day |
| `SUPPORTER_PAYMENT_LINK_ID` | none | The Payment Link's `plink_...` id: only its checkouts are a Supporter Pass |

The leaderboard's and the Supporter Pass's database is the `DB` binding in `wrangler.drive.jsonc`
(D1 **world-drive**, already made); its tables are `worker/drive/migrations`.

## Deploying

`npm run deploy:drive` applies the leaderboard's migrations to the world-drive database (`wrangler d1
migrations apply DB --remote -c wrangler.drive.jsonc`; ones already applied are skipped), builds the
site into `dist-drive/` and deploys the `world-drive` Worker with it (`vite build --config
vite.drive.config.js && wrangler deploy -c wrangler.drive.jsonc`). The Worker only runs for
`/api/*`; every other file is served straight from Cloudflare's assets.

To deploy from GitHub on every push with Workers Builds (as the construction app is): in the
Cloudflare dashboard open the **world-drive** Worker → Settings → Build, connect this repository and
set

- Deploy command: `npm run deploy:drive` (so the migrations are applied before the Worker that needs
  them goes out)
- Build command: none needed (`npm run build:drive` does no harm: the deploy builds again)
- Branch: the branch World Drive ships from

The first deploy replaces the holding page. `worlddrive.app` and `www.worlddrive.app` are the Worker's
custom domains (`routes` in `wrangler.drive.jsonc`; Cloudflare makes their DNS records and
certificates). `www` sends you on to `worlddrive.app` with the path kept. There's no `workers.dev`
address: the Turnstile widget only works on worlddrive.app, and one address keeps the counts simple.

## The owner's Google Cloud steps

Keep World Drive's key apart from the construction app's, so its limits and its bill are its own:

1. **A separate project.** In the Google Cloud console, create a project (e.g. "World Drive") on your
   billing account.
2. **Only the Map Tiles API.** APIs & Services → Library → **Map Tiles API** → Enable. Nothing else
   needs to be on.
3. **A key, restricted.** APIs & Services → Credentials → Create credentials → API key, then edit it:
   - Application restrictions: **Websites**, with `https://worlddrive.app/*` and
     `https://www.worlddrive.app/*`. (A copied key then doesn't work from other sites.)
   - API restrictions: **Restrict key** → **Map Tiles API** only.
4. **A daily quota cap.** APIs & Services → Map Tiles API → **Quotas & system limits**: lower the
   per-day limit on 3D Tiles root tileset requests (the sessions) to a little over `DAILY_VISITS`,
   e.g. 350, and the per-day limit on 3D tile requests to a sensible multiple of that (a long drive
   loads a few thousand tiles). The console's names for these change now and then: look for the
   per-day ones. It's the backstop if the key is copied and used from somewhere the referrer check
   doesn't stop; once a limit is reached, tiles stop loading until midnight Pacific time rather than
   costing more.
5. **Budget alerts.** Billing → Budgets & alerts → Create budget for the World Drive project, with
   email alerts at, say, 50 %, 90 % and 100 % of what you're happy to spend a month. Check Google's
   current [Map Tiles API pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
   and its monthly free allowance to choose `DAILY_VISITS` and the budget together.
6. **Give the key to the Worker:** `npx wrangler secret put GOOGLE_MAPS_API_KEY -c wrangler.drive.jsonc`
   (or the dashboard). The globe comes on at the next page load; no deploy needed.

## Turnstile

The widget for worlddrive.app already exists (site key above, its secret is `TURNSTILE_SECRET`). The
page runs it invisibly (`appearance: 'interaction-only'`): most people never see it; if Turnstile
wants a click, the widget shows on the start screen. The Worker checks each token once with
Turnstile's siteverify, with the visitor's IP address, before counting the visit. For local testing,
use Turnstile's test keys (in `.dev.vars.drive.example`): site key `1x00000000000000000000AA` with
secret `1x0000000000000000000000000000000AA` always passes; secret
`2x0000000000000000000000000000000AA` always fails.

## Trying it on your computer

- `npm run dev:drive` serves World Drive at http://localhost:5173/. With a Maps key in the
  environment (the names `vite.config.js` reads, e.g. `GOOGLE_MAPS_API_KEY`) it drives on Google's
  tiles directly, without the Worker; without one, it shows a test globe and a flat test pad wherever
  you drop in, so everything but the real world can be tried at no cost. The key is only ever taken
  into the dev server, never into `npm run build:drive`, whose build fails if it finds it in the
  output.
- With the Worker: copy `.dev.vars.drive.example` to `.dev.vars.drive`, run `npm run dev:drive-api`
  (the Worker on http://localhost:8790, with a local leaderboard database in `.wrangler/state`, its
  migrations applied first), and `DRIVE_API=http://localhost:8790 npm run dev:drive`. The page then
  goes through the robot check (Turnstile's test keys), the caps, the real search and the
  leaderboard. Small caps there make the used-up screen easy to see. For the Supporter Pass, put a
  Google web client whose origins include `http://localhost:5173` in `GOOGLE_CLIENT_ID` there, a
  test-mode Payment Link in `SUPPORTER_PAYMENT_LINK` (the one in `wrangler.drive.jsonc` is live, and
  `.dev.vars.drive.example` blanks it), and as `STRIPE_WEBHOOK_SECRET` the `whsec_...` that the
  [Stripe CLI](https://docs.stripe.com/stripe-cli) prints for
  `stripe listen --forward-to localhost:8790/api/stripe/webhook` (test mode). Or skip Stripe: put
  your address in `SUPPORTER_EMAILS` and sign in.
- In the browser console, `window.drive` has the scene, the globe, the driver and `dropIn( { name,
  lat, lon } )`.

Tests: `npm run test:drive-worker` (the Worker under `wrangler dev`, with stand-ins for Turnstile and
Nominatim: the caps, their reset at midnight UTC, Turnstile passing and failing, same-origin and JSON
checks, the search's validation, cache and one-a-second limit, www, and that the key is only ever in
the answer to a visit that passed; and the leaderboard on a throwaway D1 database: name rules, the
filter and uniqueness, renaming, scores with a visit token, every cheat above turned away, SQL-ish
names and places kept as text, the top 20 and your own rank, one place's board, the cache, days and
weeks turning over, the tidying after 35 days, what's stored, and the console's SQL above; and the
Supporter Pass, with test keys standing in for Google's and a made-up webhook secret for Stripe's:
signing in and every bad token turned away, the session cookie, `/api/me`, the webhook's signatures
and five minutes, a payment once, bank debits, buying before signing in, refunds and chargebacks
(either delivered before its checkout), another link's checkouts, test-mode payments with a live
link, the same-origin checks only the webhook goes without, `SUPPORTER_EMAILS`, 30 drives a day for a
supporter, the ⭐, the owner's SQL, and buying off without its settings), and `npm run test:drive-ui`
(the page in Chromium without a key: the globe and panel, search on Enter, spots, pins, dropping in
and driving, stunts (a wall throwing the kart into the air and never through it, a backflip landed
for points, the DRIFT button), changing ride, M and teleporting again without a reload, recent
places, a phone with touch buttons, boosting flat out going supersonic in each free ride (the boom,
the streaks, the tag and the wider view, and its end as it slows), boost pads on the test pad (put
down as it drives, never on a roof, a car, a shelter or a slope nor from high up, moved onto sharper
ground, a small one's 12 % and a big one's fill, dark then lit again, left lit with a full gauge,
recycled, and the pause menu's switch kept across a reload), the used-up, robot-check and
getting-ready screens, and the leaderboard with its answers made in the test: tabs, your own row, picking a name and renaming, a
landed jump posting the run with the card asking first, each place's best posted, a dead connection
changing nothing, and a phone; and buying the pass with Google's script stood in for: signing in
from the sheet, the pause menu and the used-up screen, Buy's link, "Check again" before Stripe's
word, unlocking on focus and on `?supporter=thanks`, on every load, signing out, the player linked,
the ⭐, and "Coming soon" with no sign-in or no Worker answering). `npm run test:drive-pro-ui` tries
the pass's rides, the Garage and the boost styles.

## How it fits together

```
drive/index.html             the page: panel, pin card, driving bar, keys card, screens
src/drive-app/main.js        starts it: the visit, the tiles, modes (globe, dropping, driving,
                             paused), dropping in, recentring, the render loop
src/drive-app/globe.js       GlobeView: GlobeControls, the slow spin, flights, the pin, picking
src/drive-app/spawn.js       Ground: the ground's height, which way the street runs, a bridge's deck
src/drive-app/panel.js       search, spots, recent places, the ride picker, the pin's card
src/drive-app/places.js      the start spots, typed coordinates, recent places
src/drive-app/vehicles.js    the go-kart, the library trucks (catalog.js lists which), the cars and the
                             pass's rides
src/drive-app/cars.js        the cars (drive/public/cars/): names, tuning, which are free; loading one
                             with its wheels turning, its paint and decals
src/drive-app/rides/         the Supporter Pass's rides, built in code, and parts.js they're built from
src/drive-app/pro.js         whether this visitor has the Supporter Pass (off until payments say so)
src/drive-app/pass.js        the Supporter Pass sheet and its badge
src/drive-app/supporter.js   buying it: Google sign-in, the Payment Link, unlocking, the pause menu's
                             account line
src/drive-app/garage.js      the Garage: choices and the turntable; paint.js the looks and decals;
                             boosts.js the boost styles it offers
src/drive-app/pads.js        boost pads: where they go, driving over them, the pause menu's switch
src/drive-app/api.js         /api/config, the visit with Turnstile, /api/search, the leaderboard's and
                             the Supporter Pass's calls
src/drive-app/leaderboard.js the leaderboard: the panel, names, posting runs, the new-best card
src/drive-app/screens.js     start screen, notices, loading card, pause, keys, messages
src/drive-app/test-globe.js  the Earth without Google's tiles, for working without a key
vite.drive.config.js         the build: no key, only the offered vehicles copied from public/, and
                             drive/public/ (the cars) as its own public folder
drive/public/cars/           the cars' models, pictures, cars.json and CREDITS.md
scripts/add-drive-car.mjs    imports a car from Sketchfab into it; drive-car-thumbs.mjs draws the pictures
worker/drive/                the Worker: index.js (routes), limits.js (caps, the search queue and
                             the leaderboard's turns), turnstile.js, search.js; the leaderboard:
                             players.js, scores.js, boards.js, names.js (rules and the filter),
                             visits.js (visit tokens); the Supporter Pass: accounts.js (sign-in,
                             sessions, /api/me), supporter.js (the webhook, who has it);
                             migrations/ (its D1 tables)
worker/google.js, sessions.js, stripe.js   shared with the construction app: Google's ID tokens,
                             the session cookie, Stripe's webhook signatures
wrangler.drive.jsonc         the Worker's settings, domains, Durable Object and D1 database
```

Shared modules take World Drive's place as a parameter, with the terminal as the default:
`createGoogleTiles( { site } )` and `recentreTiles` in `src/world.js`, and the `site` argument of
`localToLatLon` / `latLonToEnu` in `src/geo.js`.

## Known limits

- Where Google has no photogrammetry, the 3D tiles are smooth terrain with imagery on it: it still
  drives, without buildings.
- From far away only Google's coarsest tiles have loaded; heights read off them are ignored, and the
  pin and the flight down settle onto the ground as sharper tiles arrive.
- The search is only as good as OpenStreetMap's: a result is a point, which may be a building's middle
  rather than its street. Dropping in starts on the street beside it (within about 50 m) and faces
  along it; a big flat roof (a line 30 m long across it) counts as somewhere to drive.
- Collisions with Google's mesh are as good as the mesh: thin railings may not stop you (the kart can
  drift through the Lions Gate's railing and drop off the deck), and parked cars and trees in the
  photo are solid lumps, which you bounce off like anything else. In the air the vehicle is checked
  against walls as the box it is, turned as it is, which is close but not exact for a tumbling truck
  meeting a roof's edge.
- Flying over a valley, the glide down (3 m/s) can take a while: R puts you back on the road.

## Credits

The 3D world is Google's: the Google Maps logo and the data providers show whenever the tiles are on
screen. Place search © OpenStreetMap contributors. The trucks and the cars are models from Sketchfab
under CC BY 4.0, credited under **About World Drive** and on the ride picker (and the cars in
`drive/public/cars/CREDITS.md`); the go-kart and the pass's rides are built in code.
