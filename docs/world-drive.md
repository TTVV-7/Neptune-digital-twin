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
3. **Your ride**: the go-kart, a pickup or a haul truck, or with the [Supporter Pass](#supporter-pass-content)
   a sports coupe, a monster truck, a city bus or a hovercraft. The choice is remembered. **Garage**,
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
| B | Booster |
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
  up as you do them, dim while you're in the air and bright with their points when you land.
- **Drifting.** Hold **Space** (or the **DRIFT** button under the speed, with the mouse, or the
  **Drift** button on a touch screen) and steer: the kart slides wide round the bend in smoke, and
  the **DRIFT** chip and button fill with the mini-turbo's charge in its colour (yellow, then teal,
  then pink after 0.7, 1.5 and 2.5 s). Let go for a short, strong boost. Space held before you
  steer waits for the steering rather than hopping; a quick tap hops.

## Supporter Pass (content)

The Supporter Pass is a one-time payment (about CA$4.99) towards World Drive's running costs. This
part is what it unlocks and the switch that unlocks it; paying for it (Google sign-in, Stripe, its
webhook and the pass kept in D1) comes later, and until then nobody has it and the free game is
exactly as it was.

**The switch** is `src/drive-app/pro.js`: `isPro()`, `onProChange( fn )` and `setPro( on )`, off by
default. Everything locked asks `isPro()` and follows `onProChange`; the payments code will call
`setPro( true )` for a visitor who has the pass. For testing, `?pro=1` in the address turns it on, but
only when the page is on `localhost` or `127.0.0.1` (`testPass` decides), never on worlddrive.app.

**Locked things** show a small **⭐ Supporter Pass** badge, and picking one opens the pass's sheet
instead (`src/drive-app/pass.js`): what the pass is and what comes with it (the four rides, the
Garage's extras, a ⭐ by your name on the leaderboard, 30 drives a day instead of 8) and a **Coming
soon** button, which the payments code replaces (`buyArea()`). The sheet also opens from **⭐ Supporter
Pass** under the rides on the globe and in the pause menu. A ride or a look saved while the pass was
on falls back to the go-kart, or to the free choices, without it.

### The four rides

Built in code like the kart (`src/drive-app/rides/`), each 3,600 to 7,800 triangles, facing -Z on
y = 0 at its real size, with its own handling (`handling` in its tuning, which `drive.js` reads in
place of its constants: see `HANDLING` there; vehicles without it handle as before):

| Ride | Size | Top speed | Handling |
| --- | --- | --- | --- |
| Sports coupe | 4.4 × 1.9 m | 195 km/h | Quick (0 to 100 in 2.6 s, the kart's 5.2), grips hard, turns in sharply, long wide drifts |
| Monster truck | 5.4 × 3.5 m, 3.4 m tall | 125 km/h | Thrown about twice as high by the same hit (gravity at 0.75 in the air, launches × 1.3), quicker to flip and landing up to 55° off upright, bouncing on soft springs; its bumpers are 1.5 m up, so it drives up over cars, barriers and kerbs |
| City bus | 12 × 2.55 m, 3.2 m tall | 90 km/h | Slow away (22 km/h after 3 s), rolls on and on off the gas, turns wide; barely thrown up by a crash, slow to turn in the air, and squashes and shakes the view the most |
| Hovercraft | 4.2 × 2.1 m | 135 km/h | No wheels: it floats 16 cm up on its skirt (water is just more ground to it), slides wide through every turn (about 50° at 50 km/h, under 10° for the others), glides on and stops slowly, and bounces on its cushion |

Wheels spin and front wheels steer (the monster truck steers all four, the back ones the other way);
the monster truck's body rides on springs that sink and rebound as it lands and lean it out of
turns; the hovercraft bobs, its fan spins up with the gas and its rudders follow the steering. Each
has a driver: behind tinted glass in the coupe and the truck, at the front of the bus (with its
passengers), in the open on the hovercraft. They follow the free rides in the picker with a drawing
each (in their paint) and the badge until the pass is on.

### The Garage

**Garage** under the rides on the globe, and in the pause menu, opens the paint shop
(`src/drive-app/garage.js`, the looks in `src/drive-app/paint.js`): every ride turning on a
turntable (drag to turn it; **▶ Boost** shows its flame and trail), and for each:

| | Free | With the pass |
| --- | --- | --- |
| Body colour | Blaze orange, racing red, ice white | 9 more |
| Finish | Gloss | Matte, metallic |
| Decal | None | Racing stripes, a number (0 to 99), flames, checker |
| Rims (a hovercraft's trim) | Silver, graphite | Gold, white, red, blue, lime, pink |
| Boost flame | Orange | Blue, green, purple, pink, rainbow |
| Trail (boosting or flying) | None | Smoke (in 8 colours), sparkle, rainbow ribbon |

Choices are kept for each ride in this browser (`world-drive.garage` in localStorage) and put on
whenever it's driven; picked while paused they're on it as soon as it drives on. Decals are projected
onto the bodywork through boxes each ride gives (its `userData.decals`). The trucks from the library
keep their own paint: only their flame and trail change. A ride in the colour and finish it came in
keeps its own materials, so the kart nobody has painted is just as it was. The trails are cheap: a
pool of sprites, or one ribbon whose buffers are rewritten in place, nothing made each frame. On the
test pad, boosting with a trail took a frame 3 to 8 % longer than without (software rendering in the
test's browser) and about 0.1 ms more of updating.

`node --test scripts/test-drive-pro-ui.mjs` tries all of this on the test pad with no key: the locked
rides and choices opening the sheet, `?pro=1` counting only on this computer, the free kart
unchanged, each ride driving, drifting, thrown up by a wall and landing, their handling measured
against each other, the hovercraft hovering with no wheels, the monster truck over a car, the
Garage's choices on the ride and kept across a reload, the frame time with trails, and the Garage on
a phone.

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
  visitor (8). Both start again at midnight UTC.
- Over a cap the page shows **Today's free drives are used up**, with how long until fresh drives,
  and loads nothing from Google. A failed robot check shows **We couldn't check you're a person**
  with **Try again**. With no key set, it shows **World Drive is getting ready** (with a flat test pad
  to drive, which costs nothing).

A visitor is a hash of their IP address with a random salt made each day; addresses are never
stored, and each day's salt and counts are deleted when the next day starts. Both caps are counted in
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

## Settings

In `wrangler.drive.jsonc` (`vars`, set on every deploy; change them there, not in the dashboard):

| Setting | Default | What it is |
| --- | --- | --- |
| `DAILY_VISITS` | 300 | Visits a day for everyone together; 0 closes for the day |
| `PER_VISITOR_DAILY` | 8 | Visits a day per visitor |
| `TURNSTILE_SITE_KEY` | `0x4AAAAAAFs3k5sgUIQHSuGC` | The worlddrive.app Turnstile widget (public) |

Secrets, set by the owner and never in a file (Cloudflare dashboard: Workers & Pages → world-drive →
Settings → Variables and Secrets, or `npx wrangler secret put NAME -c wrangler.drive.jsonc`):

| Secret | What it is |
| --- | --- |
| `GOOGLE_MAPS_API_KEY` | The Maps key from World Drive's own Google Cloud project (below). A secret named `Google_maps_api`, in any case, is taken too. |
| `TURNSTILE_SECRET` | The Turnstile widget's secret key |

`keep_vars` is on, so anything set in the dashboard that isn't in `vars` survives a deploy.

## Deploying

`npm run deploy:drive` builds the site into `dist-drive/` and deploys the `world-drive` Worker with
it (`vite build --config vite.drive.config.js && wrangler deploy -c wrangler.drive.jsonc`). The
Worker only runs for `/api/*`; every other file is served straight from Cloudflare's assets.

To deploy from GitHub on every push with Workers Builds (as the construction app is): in the
Cloudflare dashboard open the **world-drive** Worker → Settings → Build, connect this repository and
set

- Build command: `npm run build:drive`
- Deploy command: `npx wrangler deploy -c wrangler.drive.jsonc`
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
  (the Worker on http://localhost:8790), and `DRIVE_API=http://localhost:8790 npm run dev:drive`. The
  page then goes through the robot check (Turnstile's test keys), the caps and the real search.
  Small caps there make the used-up screen easy to see.
- In the browser console, `window.drive` has the scene, the globe, the driver and `dropIn( { name,
  lat, lon } )`.

Tests: `npm run test:drive-worker` (the Worker under `wrangler dev`, with stand-ins for Turnstile and
Nominatim: the caps, their reset at midnight UTC, Turnstile passing and failing, same-origin and JSON
checks, the search's validation, cache and one-a-second limit, www, and that the key is only ever in
the answer to a visit that passed) and `npm run test:drive-ui` (the page in Chromium without a key:
the globe and panel, search on Enter, spots, pins, dropping in and driving, stunts (a wall throwing
the kart into the air and never through it, a backflip landed for points, the DRIFT button), changing
ride, M and teleporting again without a reload, recent places, a phone with touch buttons, and the
used-up, robot-check and getting-ready screens).

## How it fits together

```
drive/index.html             the page: panel, pin card, driving bar, keys card, screens
src/drive-app/main.js        starts it: the visit, the tiles, modes (globe, dropping, driving,
                             paused), dropping in, recentring, the render loop
src/drive-app/globe.js       GlobeView: GlobeControls, the slow spin, flights, the pin, picking
src/drive-app/spawn.js       Ground: the ground's height, which way the street runs, a bridge's deck
src/drive-app/panel.js       search, spots, recent places, the ride picker, the pin's card
src/drive-app/places.js      the start spots, typed coordinates, recent places
src/drive-app/vehicles.js    the go-kart, the library trucks (catalog.js lists which) and the pass's rides
src/drive-app/rides/         the Supporter Pass's rides, built in code, and parts.js they're built from
src/drive-app/pro.js         whether this visitor has the Supporter Pass (off until payments say so)
src/drive-app/pass.js        the Supporter Pass sheet and its badge
src/drive-app/garage.js      the Garage: choices and the turntable; paint.js the looks and decals
src/drive-app/api.js         /api/config, the visit with Turnstile, /api/search
src/drive-app/screens.js     start screen, notices, loading card, pause, keys, messages
src/drive-app/test-globe.js  the Earth without Google's tiles, for working without a key
vite.drive.config.js         the build: no key, only the offered vehicles copied from public/
worker/drive/                the Worker: index.js (routes), limits.js (caps and the search queue),
                             turnstile.js, search.js
wrangler.drive.jsonc         the Worker's settings, domains and Durable Object
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
screen. Place search © OpenStreetMap contributors. The trucks are models from Sketchfab under CC BY
4.0, credited under **About World Drive** and on the ride picker; the go-kart is built in code.
