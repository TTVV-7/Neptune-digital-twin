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
3. **Your ride**: the go-kart, a pickup or the muscle car, or with the
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
   of it (a car parked in Google's photo, a bollard) moves across the road to a clear lane. A pin
   out on the sea, or on a big lake, where Google's tiles are only the bed below, starts on the
   water's surface ([the open sea](#the-open-sea)). Where there's nothing at all to drive on, it
   says so and goes back to the globe.
5. **M** (or the **Globe** button) goes back to the globe, from driving or from a drop-in on its way
   down. Pick somewhere else and drop in again: as often as you like, without reloading.

### Keys

| Key | What it does |
| --- | --- |
| W / S | Gas; brake, and reverse once stopped |
| A / D | Steer |
| Space | Drift: hold it and steer round a bend, let go for a mini-turbo; tap it to hop |
| Shift (or B) | Booster: flat out for a moment, overdrive |
| F | Fly: hold to lift off, let go to glide down |
| In the air | A / D spin, W / S flip (W forward, S back), Q / E roll (or Space with A / D) |
| R | Stuck? Back on the road a few metres on (in water: back on dry land at once) |
| C | Chase or driver's-seat camera |
| Wheel | Chase camera nearer or farther |
| M | Back to the globe |
| H | Horn, for those [driving with you](#driving-with-others) (only while that's on) |
| Esc | Pause: keep driving, change ride, or back to the globe |

The keys card shows as each drive starts; **?** brings it back. Under the place's name at the top,
a slim bar shows your [level](#levels) and the XP to the next, with small "+46 XP" pop-ups under it. Flying, the booster, drifts, stunts,
water and R come from `src/drive.js`, which World Drive starts with `fly`, `booster` and `drift` on,
`crash: 'launch'` and its `water` (the construction app leaves them off: its crashes stop the
vehicle dead, and nothing there is water).

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
  so holding the gas off a ramp doesn't flip you. Flying (**F**), **Space** with **W**/**S** flips
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

- **The booster** (**Shift**, or **B**) fires the whole gauge, 2.5 s of it (it needs 15 % to light), pushing you up
  to twice the ride's top speed. The gauge refills by itself in 8 s; landed tricks top it up (a fifth
  each), and so do boost pads. What it leaves behind is the ride's **boost style** from the
  [Garage](#the-garage): the classic flame, bubbles or confetti, or with the pass one of nine more.
- **Overdrive.** Boost at 85 % or more of that doubled top speed for three quarters of a second and
  you hit overdrive (the code calls it supersonic): a sonic boom (shock rings blown out round you, a flash and a jolt, the edges of the view flashing white), streaks of
  air streaming back past you, the view 9° wider and **OVERDRIVE** by the speed. It lasts, boosting
  or not, until you drop under three quarters of that speed: a moment after the gauge runs out, or at
  once if you hit something. Every ride can, each against its own top speed (the kart at about
  190 km/h, the pickup at about 290). It's all in `src/drive.js` (`SUPERSONIC`) and `drive-boosts.js`;
  World Drive widens the view by `driver.warp`.
- **Boost pads.** Glowing pads turn up on the ground ahead of and round you as you drive, each under
  a column of light: small gold ones (+12 % of the gauge) and big orange ones (a full gauge). Drive over
  one and it goes dark, lighting again 4 s later (a big one 10 s); with the gauge already full you
  leave it for later. There are at most 12 (9 small, 3 big), 15 m apart or more, and those you leave
  far behind are put down ahead again. They never go down on [water](#water), nor by it. **Boost
  pads on the road** in the pause menu turns them off (kept in this browser).

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
  moved more than a metre). Last, it must be surely dry ground there and 8 m round it, north, east,
  south and west (water.js, [below](#how-water-is-told-from-the-ground)): not water, and not where
  it can't tell, as by a shore. It's three instanced meshes, and a try is two dozen rays at most,
  most of them ending after one or two, and for the few spots that get that far, five looks for
  water (on most ground a ray or seven each).

### How boosting and driving look

Each moment of boosting and driving has a burst of its own (`src/drive-bursts.js`). drive-fx.js only
makes them for a Driver with the booster, drifts or stunts on, which only World Drive's has, so the
construction app's driving looks and behaves as it always has.

- **Lighting the booster.** A flash and a flare at the exhaust, a shock ring blown out behind it and
  sparks popping out, in the boost style's colour (the classic flame's glow's), and the flame pops,
  more than twice as long for a moment. Each style has its own burst besides (in the
  [Garage's table](#the-garage)): a crackle of arcs, a strike of lightning, a party popper's
  confetti, an old game's explosion of pixels... The car squats as it surges off, its nose kicked
  up, and the view is jolted: about 4.5° wider at most and nodded up for a moment, springing back
  in about a third of a second.
- **While it burns** the flame flickers harder, and speed lines stream out past the edges of the
  view, from 30 % of the booster's top speed on, thicker and faster the faster you go. Overdrive's
  sonic boom adds a wide ring that lingers as it spreads to seven times the vehicle's size, the
  edges of the view flash white and the view is punched about 6° wider for a moment, on top of its
  9.
- **Running dry.** The exhaust glows on and cools, white-hot in the style's colour, through orange
  to a dull red and out in 0.9 s, with a few embers drifting off it. The car settles: its nose
  dips as it slows back to its top speed, and it bounces back level.
- **Boost pads.** Driven over one, a ring spreads out from the pad, chevrons rise off it, sparkles
  fly up round it and the vehicle lights up in the pad's colour for a quarter of a second. The burst
  is carried along with the vehicle, so it's seen round it rather than left on the pad behind it,
  under the camera. The gauge fills up to what it took before your eyes, a shine running along it,
  with "+12%" by it.
- **The gauge** glows on and off while it's full, ready to fire, and flashes red as it runs dry.
- **Drifting.** Each charge level reached (yellow, teal, then pink) puts a ring on the ground and a
  burst of sparks at each rear tyre in its colour, as the sparks after it are. Let go, the
  mini-turbo has a flash, a ring and a spray of sparks out of the exhaust in the same colour,
  bigger for a bigger boost; the flame pops and the view is jolted a little (about 1° wider for
  each level).
- **Flooring it from a standstill** spins the rear tyres up: they turn as if it were going 12 m/s
  faster, and smoke, for 0.9 s at most or until it's doing 32 km/h.
- **The body leans on its springs** (`BODY` in `src/drive.js`): nose up as it speeds up and down
  under the brakes (nearly 4° braking hard in the kart), and out of a turn (less in a drift, which
  leans it already), at most 4° either way besides the booster's kick, sooner and kicked up further
  on a ride with soft suspension (its handling's `squash`: the farm truck wallows). It leans about
  the wheels on the low side, so they stay on the ground, and settles with a little bounce. Put
  somewhere else at a stop (R, or back from a splash), it doesn't lurch. It's in how the car is
  turned, so those driving with you see it too.

Near the vehicle on its wheels, these bursts and the boost styles' particles fade out down to the
ground under it (a plane through its lower rear tyre, 4 m round it for a kart, more for something
bigger), so a flash or a ring at a low exhaust never ends along a hard line where the ground cuts it
off. Particles lying flat on the ground (a drift level's ring, ink's splats) are drawn whole, and
those further off are as they were. The flame's glow is as big as it always was, only brighter as
it lights: a sprite that low would be cut off by the ground.

**Camera effects** in the pause menu (kept in this browser, `world-drive.camera-fx`; on until it's
turned off) turns off everything done to the view: the jolts, the shake of a hit, the speed lines
and overdrive's white edges (`src/drive-app/screen-fx.js`; main.js adds a jolt's `driver.punch` to
the field of view). The bursts in the world stay. A visitor whose system asks for less motion
(`prefers-reduced-motion`) has none of those whatever the switch says, and fewer flashes: no flare
as the booster lights, the vehicle not lit up on a pad, and the gauge glowing steadily when it's
full rather than pulsing, and flashing once as it runs dry. Overdrive's 9° wider view is as it
was, either way. On a touch screen the bursts have 60 % of their sparks, and there are 24 speed
lines rather than 48.

**Others' cars** show what can be told from what they send (`FLAGS` in `live-protocol.js`, which is
unchanged): the booster lighting and running dry, each drift charge level and the mini-turbo, and
the lean. A boost pad taken and wheelspin aren't among what's sent, so those don't show on them.

**What it costs.** Every burst comes out of pools made with the effects as a drive starts: one more
batch of quads (160 of them, one draw, the oldest reused when it's full), one sprite for a pad's
flash, and each style's own burst from its own batch's budget. The speed lines are one instanced
batch of thin quads whose numbers are set once and placed on the screen by their shader: each frame
only their time and thickness change. So a drive makes nothing new: in the tests below, a dozen
ignitions and boosts run dry made no geometries, textures, objects or materials, and no more were
alive than the budgets. Measured on the test pad, drawn in software (SwiftShader) on a machine
shared with other test runs:

- **What's drawn.** Driving along, exactly what it was before (94 draws, 6,762 triangles a frame);
  boosting, one draw and about 120 triangles more; drifting and over pads, about 50 triangles more
  and a draw or two while a burst lasts.
- **Updating it all** was 0.2 to 0.3 ms a frame before and after: no difference that could be told.
- **Drawing it**, the new effects shown and hidden by turns every two frames in the same run (so
  both had the same load; driving plainly, where nothing new is drawn, read 6 % apart, which is the
  noise): on a 1280 × 800 view, boosting (lit every 1.6 s, far more often than anyone does) took
  10 % longer to draw (77 ms against 70), driving over a pad every 0.6 s 9 % (92 against 84) and
  drifting no longer; on a phone-sized view, 2 to 5 % for each (boosting 33.2 ms against 32.6).

`node --test scripts/test-drive-ui.mjs` ("World Drive boost and driving effects") tries it on the
test pad with the classic flame, confetti and lightning: lighting the booster (the burst, the jolt,
the squat), running it dry (the glow, then nothing left), a pad (its burst carried along and the
flash), the ground the bursts fade out down to (and none in the air), a drift's three levels and its
mini-turbo, a standing start's wheelspin and smoke, braking's dip and a turn's lean, no lurch put
back at a stop, settling back level, nothing made in a dozen ignitions and the budgets kept; the
effects going
with a pause and made again; the speed lines thickening with speed and going, overdrive's white
edges, the gauge pulsing, flashing and refilling; the switch turning it all off, kept across a
reload, and on again; asking for less motion; and a phone's thinner bursts and fewer lines.
`test-drive-live-ui.mjs` checks another's car lights and runs dry with their booster, and has a
burst at each of their drift's charge levels and for its mini-turbo.

### Water

Google's 3D tiles don't say what's water: a bay, a harbour or a river is just more ground in them,
so everything used to drive on the sea. Now driving into water, or coming down in it, is a splash:

- **The splash.** Droplets and spray thrown up round you, a ring of foam spreading over the water
  over a patch of foam where you went in, and a word for how hard: **SPLISH!** driving in slowly,
  **SPLASH!**, or **KER-SPLOOSH!** off something high (how fast you came down, and 0.4 of how fast
  you were going, 4 and 14 m/s being the steps). The vehicle slows hard in the water, dips under
  by how hard it hit and bobs back up, tips nose down and sinks, rocking, sending ripples of foam
  out every half second, while the camera holds on it: it stops turning after you and rising and
  falling with you, only carried along as you drift on.
- **Back on dry land.** A second and a half in, the view fades out to deep water and back in a
  quarter of a second later, "Back on dry land", with you stopped on the last dry ground you were
  on: the newest spot on a trail kept as you drive (one every 3 m on ground that's surely dry, the
  last 24) at least 8 m back from the last of them (about where you left the shore, the quay, the
  pier or the bridge's deck) and 20 m from where you went in, and not one within a metre of the
  water's level if there's one that isn't (water the tiles drew unlike water would be about level
  with it, give or take how far Google's water slopes across a harbour). You face the way you were
  going there, or the other way if that was toward the water: straight off a beach into the sea, you
  come back facing up the beach; off a bridge, along its deck. Each splash trims the trail to that
  spot, so another goes back further. Put back on a spot that then turns out to be water (sharper
  tiles telling what coarser ones couldn't), that spot is dropped from the trail and, with nothing
  older on it, there's no splash rather than the same one over and over. A pause (Esc) keeps the
  trail.
- **R** in the water does it at once, and **R** by the water never puts you in it (only onto ground
  that's surely dry, else where you last drove freely). Esc while sinking parks you back on dry land.
- **Like a wipeout**: tricks you were doing in the air and the combo are lost ("Combo ×3 lost", or
  "Sunk"); the score so far is kept.
- **Off a quay or a bank**, down into the water by its edge is a splash there and then: within a
  dozen metres of the shore it can't tell water from the shore (below), but coming down into it,
  half a metre or more from the last dry ground or landing there, is coming down into the water.
  **Slowly** off a beach into the sea is the same once you're about a dozen metres out (until then
  the beach is in reach of the rings it's told by). **Flying** (F) over water is fine until you
  come down in it.
- **The hovercraft** rides on water as on land, throwing up spray behind it as it goes.
  **Boost pads** never go down on water, nor by it.
- **Dropped in on water** (a pin on the sea), you ride on it until you've been on dry ground: with
  nowhere to go back to, a splash would only be followed by another. So too on the
  [open sea](#the-open-sea) (and a big lake's open water), where there may be no dry ground for a
  thousand kilometres: any ride drives on it, and flies and comes down on it, until it reaches land;
  from then on, back into it is a splash and back on that land.

It's the Driver's `water` option (`src/drive.js`; off unless an app gives one, so the construction
app's driving never splashes), which World Drive gives `src/drive-app/water.js`. The Driver looks
every 0.2 s on the ground and wherever it comes down (off a jump, a wipeout's first touch, a drift's
hop, gliding down from flying). The hovercraft says `floats: true` in its tuning. The splash's
droplets, spray, foam and ripples are `drive-fx.js` (fixed pools made with the vehicle's other
effects, only when there's water: 150 droplets, 48 puffs, 6 rings and 2 patches of foam), and its
word and the fade `drive-hud.js`.

#### How water is told from the ground

Google draws water unlike anything else on its mesh: as a flat sheet (most of it level to the
millimetre) of one even colour (a fill, not a photograph: no waves, wakes or glints), at the lowest
level round about. `water.js` looks for exactly that, with rays looking down round the spot:

1. **Colour**: the tile's own picture where the ray hit it. Google's pictures arrive as
   ImageBitmaps (GLTFLoader decodes each tile's from its glTF); each is drawn once onto a 64-pixel
   canvas, kept as long as the picture is, and the hit's UV picks a pixel. Water-like is bluish,
   grey or a river's brownish grey, not green (a field), warm (sand, soil, brick) or bright
   (concrete, a pale beach): luma at most 150, blue at least red less 12 (the Thames) and at least
   green less 6. A harbour's teal and a canal's olive grey are greener (blue at least green less
   14: Hong Kong's harbour, the IJ behind Amsterdam Centraal), but so is a lawn in New York's
   bluish pictures: Central Park's Great Lawn is (81, 121, 112), Hong Kong's harbour (78, 117,
   107), as level and as even. Those are water only where the far ring (4, below), wherever it's
   level with the spot, is that colour too and as bright to within 8: open water, not a lawn among
   ball fields, paths and patches (the Great Lawn's far ring was 20 to 25 off).
2. **Level**, to within 50 cm, at 6 points 5 m round it and 8 points 12 m round it (most of
   Google's water is level to millimetres; Hong Kong's harbour only to half a metre).
3. **Even**: the brightness of the 15 colours there varies by at most 6 (its standard deviation,
   out of 255). Roads have markings, cars and patches; fields their lines and mowing.
4. **The lowest**: nothing at 8 points 35 m round it more than 1.5 m lower (a ray that finds
   nothing counts as lower). A quay, a pier, a beach, a bridge's deck or a roof has the water or the
   street below it.

It says one of three things: **water** (at that height), **surely dry**, or **can't tell**. Surely
dry is anything coloured clearly unlike water (brighter than 170, red over blue by more than 25:
sand, soil, brick, a tiled roof; or grass green, green over blue by more than 30 and over red by
more than 10), over something lower, or uneven close by (within 5 m) with no water at its level 13 m
on past what's uneven (water by its edge has the shore close by too, and 13 m out the rings are
clear of it), nor water-coloured ground at its level there that it can't tell either (water in a
canal, by a sea wall or among boats). What's left, water-coloured and level close by but not all
round, is as often water by a shore, a pier or a ship as an even grey square, so it can't tell: no
splash, and it isn't taken for dry ground, but it says where the water past the edge is, which the
Driver takes for water when it came down into it. So is a colour in between (a brown, a green) on
level, even ground that's the lowest round about. And turquoise (green and blue both 40 or more over
red) is never dry, whatever its shape: Geneva's clear lake, the Bellagio's and the sea by
Copacabana's surf are drawn from photographs, beds and all, neither level nor even. The trail back
from a splash, R's few metres on and boost pads take only surely dry ground. What it can't be sure
of (no picture, a ray that finds nothing) is never water: it misses a little water rather than
splash on a road. It looks at the cheapest things first: on most ground one ray, on a road seven or
so; all of it is 23 rays.

**First measured** on Google's tiles, 31 October 2026, with the first rule (water's colour no
warmer than blue at least red less 2 and no greener than green less 6, level to 35 cm, nothing 1 m
lower, anything not water-coloured surely dry): 47 spots, each with 4 more 8 m round it, looked at
with the vehicle parked there (so with the tiles a drive has) and labelled from a picture of it.
Water (19): Burrard Inlet by Neptune Terminals (two) and by the Lions Gate (two, one in the
bridge's shadow), San Francisco Bay under the Golden Gate (three), Sydney Harbour (three), the
Seine by the Louvre (three, one of them twice), the Pacific off Santa Monica Pier (three) and in
Ocean Beach's surf, and the Bellagio's lake in Las Vegas. Look-alikes (28): Neptune's grey yard and
its road (Google's pictures there are bluish), its jetty, the Lions Gate's deck and the tidal flats
under it, the Golden Gate's deck, the Sydney Harbour Bridge's arch, three of the Louvre's quays and
streets, Dodger Stadium's field and four of its car parks and banks, the Las Vegas Strip (two, its
asphalt dark) and the trees beside it, Times Square and two of its roofs, the Sydney Cricket
Ground's field and stand, Ocean Beach's sand (two) and road, and Santa Monica's beach (two).

| | Said water | Said not water |
| --- | --- | --- |
| Water (95) | 72 | 23 |
| Land look-alikes (133) | 0 | 133 |

The water it missed: the inlet in the Lions Gate's shadow (its colour varying by 7 to 10 there), a
seam under the Golden Gate between sharper and coarser tiles (the water 2.8 m lower on one side), a
spot beside a ship, the Bellagio's lake (photographed water, with fountains), Ocean Beach's surf (a
coarse tile, sloping) and three spots by seams on the Seine and off Santa Monica. Google's open
water was level to a few millimetres in San Francisco and Sydney and to 4 to 26 cm in Burrard
Inlet, the Seine and off Santa Monica, its colour varying by 0.6 to 4.4. Land as level as that
varied more (Neptune's yard 14 to 28, Santa Monica's beach 11) or wasn't water-coloured anyway
(the fields, green, varied by 8.4 and 13).

**Tried on Google's tiles** (scratch scripts, one page load, every place reached by the globe's
drop-in): off the Lions Gate's deck into the inlet, 70 m down at 38 m/s, **KER-SPLOOSH!**, sinking,
and back on the deck 1.75 s later, facing along it (twice; and once more when the kart, driving the
deck, went over the railing by itself); thrown off the side of Santa Monica Pier, 7 m down,
**SPLASH!** and back on the pier; across a Dodger Stadium car park (four 5 s runs) and along the
Golden Gate's deck (three) with no splash, all 116 looks saying surely dry; and the hovercraft
across Sydney Harbour for 14 s, on the water all the way (48 looks, all water), throwing spray,
never splashing, with no boost pad put down. A look took 0.2 to 0.3 ms on average on the car park
and the deck and 1.1 ms on open water (at most 3.6 ms), in the test's software rendering.

**Measured again**, played where the first rule wasn't measured (the review, 31 October 2026, three
page loads, every place reached by the globe's drop-in). At each place the camera looked straight
down from 80 to 150 m, the detector gave its verdict on an 11 × 7 grid (15 to 29 m apart) drawn
over the picture, each point was labelled from the picture (water, land, or can't say: a shore
line, a boat, a moored barge), and the heights and colours every 2 m round it were kept, so other
rules could be tried on the same ground offline (that agreed with the page's own verdicts at 94 to
98 % of the points). Places: the IJ behind Amsterdam Centraal and the Prinsengracht, Venice's
Rialto, Molo and Piazza San Marco, Tsim Sha Tsui in Hong Kong, Port Hercule and the Monaco harbour
start, Copacabana's beach and sea, Geneva's lake by the Jet d'Eau, the Thames by the London Eye,
the Chicago River, the Seine by the Louvre, Sydney Harbour, LAX's apron, Highway 401 and Yorkdale's
car park, the Lingotto's roof, the US Open's courts, the Bonneville Salt Flats, the Sea-to-Sky
Highway, Neptune Terminals, the Arc de Triomphe, the Las Vegas Strip and the Bellagio's lake, a
Dodger Stadium car park, Shibuya Crossing, and Central Park's Great Lawn and Sheep Meadow (some of
them twice). The same 2,700 points, by the first rule and by this one:

| | First rule: water | can't tell | dry | This rule: water | can't tell | dry |
| --- | --- | --- | --- | --- | --- | --- |
| Water (796) | 232 | 82 | 482 | 412 | 285 | 99 |
| Land (1,904) | 0 | 10 | 1,894 | 0 | 79 | 1,825 |

The first rule called most of this water dry: Hong Kong's teal harbour (78, 117, 107), the IJ's
olive grey (76, 89, 82) and the Thames's brownish grey (91, 90, 85) failed its colour, so they
were dry ground: no splash, boost pads put down on the Thames, Geneva's lake and the IJ, and the
way back from a splash in the IJ was a spot on the water. A wider colour alone (green up to 14 over
blue) took the Great Lawn for water at two points in the second page load, hence the far ring's
colours. The water this rule still calls dry is mostly Geneva's lake bed and Copacabana's surf
(photographed, uneven, foam bright), Hong Kong's harbour where its water slopes 1.6 to 2.3 m within
35 m on a coarse tile, and Venice's busy Grand Canal. None of the builder's 103 land samples above
is water by it either.

**Tried again on Google's tiles** (scratch scripts; the kart sent at the water from a surely dry
spot 25 to 60 m off, at 20 to 60 km/h). With the first rule it splashed within 10 s at 3 of 9 places
(in the IJ only after 21 m on the water, and came back onto the water); Monaco's harbour, Geneva's
lake (140 m out), the Thames, the Prinsengracht and Venice's canals it rode on. With this rule's
earlier steps, 10 of 10 (Monaco's start twice, the IJ twice, Hong Kong twice, the Thames, Copacabana
twice and the Seine): **SPLASH!** or **KER-SPLOOSH!** off Hong Kong's promenade, 7 m down; in the IJ
off the quay, right by it (down into the water by its edge); slowly down Copacabana's beach into the
sea. Each time it came back on ground the detector called dry, facing away (within 30° of straight
away from where it went in), drove on 3 s with no second splash, and R there facing the water never
put it in. Three times the way back was by the water: on Copacabana's teal sea by the surf
(turquoise is never dry since), on Hong Kong's water by the sea wall (fixed since: the probe past
the edge, and a metre over the water) and in Copacabana's surf (below). The hovercraft crossed the
IJ and Hong Kong's harbour (three runs) with no splash. Driving about the look-alikes (the Great
Lawn, Sheep Meadow, Neptune's yard, the Arc de Triomphe, the Strip, a Dodger car park, Shibuya, the
Sea-to-Sky Highway, LAX, the 401, Bonneville, Piazza San Marco), no splash at all. One root tileset
request per page load.

**What it costs** (the page's own timings, in software rendering on a shared machine): a look took
0.1 to 1.5 ms at the median by place and at most 7.4 ms; a ray 0.03 to 0.07 ms; a tile picture's
64-pixel copy 0.7 ms at most, once per picture. At five looks a second that's well under 1 % of the
time. Boost pads' check of a spot and 8 m round it (five looks, only for the few spots that pass
everything else) took up to 21 ms, once 44 ms when a single ray took 40 ms (a tile's first ray).

#### The open sea

Out past what Google photographs of a coast, its 3D tiles aren't the sea at all: they're the sea
bed, with the sea's picture on it, and nothing at the surface. Measured on Google's tiles (2
November 2026): by Santa Monica Pier, Google's photographed water is at the sea's height (36.7 m
under the ellipsoid there), as everywhere it photographs; 8 km out in Santa Monica Bay (33.95° N,
118.6° W) the tiles under the pin were 220 m under the ellipsoid, the bay's bed 184 m down, coarse
(a leaf tile with 64 m of geometric error, the most there is there) and sloping up to the shore 2 m
in 100; 7 km off Kona, Hawaii, 1.7 km down; and in the middle of the Pacific (30° N, 140° W and
145.3° W), 4.7 and 5.2 km down (leaf tiles, 1 km of error).

So a pin out at sea didn't work. The drop-in looked for ground no lower than 1.5 km under the
ellipsoid (lower than any land), found none, and after waiting 25 s for it said "There's no 3D map
at this spot yet. Try somewhere else." and went back to the globe. (A pin over the shelf found the
sea bed and started on it: in Santa Monica Bay water-coloured, level to half a metre close by and
the lowest round about, so water.js called it water, and you rode on it, 184 m under the sea; 20 km
off Waikiki, 578 m under it, water.js called it dry ground.) Coming down into the water, and a
drop-in on the water by the shore, were never the trouble: a kart flown out 550 m from Santa
Monica's beach and let glide down into the sea there splashed (**SPLISH!**) and was back on dry
land, and so it did thrown in from 15 m; a pin on the water by the pier started on the water, riding
on it.

Now the drop-in looks for ground down to below the deepest sea floor (11.5 km under the ellipsoid;
the Challenger Deep is 10.9 km down), and with the tiles done loading (not a coarse tile cutting
under the curve of the Earth before sharper ones arrive) it starts on the water's surface instead
of the ground under the pin where that ground is:

- more than 15 m under the sea's height there, and the pin is on the sea or a coast (the map,
  below);
- more than 15 m under the surface of a big lake the pin is on ([the lakes](#the-big-lakes), below):
  Google draws some deep lakes' beds as it does the sea's, Lake Baikal's 1.6 km under the lake;
- either of those with nothing within 150 m of it more than 15 m over the water's surface
  (walled off, below);
- or lower than 1.5 km under the ellipsoid, wherever it is: deeper than any land or lake bed.

How far down the ground is doesn't say on its own what it is: the Dead Sea's shore is 430 m under
the sea, Death Valley 86 m, and they're land on the map, which never starts on water, however far
under the sea it is. 15 m is twice as deep as the lowest land along most coasts (the Netherlands'
polders, about 7 m under the sea; New Orleans, 2 m), with room for the sea's height as it's had here
(up to 9.5 m low by volcanic islands, 3.9 m high at worst: below) and for Google's own water by a
coast with the tide out, which drop in as before, on Google's water. So the shelf seas, where most
taps on the sea land, start on the sea: Santa Monica Bay (Google's bed there 184 m under the sea),
13 and 20 km off Waikiki (546 and 578 m), the Strait of Georgia (328 m). At first it went by depth
alone, ground more than 1 km under the sea's height being the sea bed: that took Baikal's bed for
the sea, laying the sea's surface 455 m under the lake's, and left the shelf on its bed; then 30 m
under the sea's height, with a map of the sea but not of lakes, which left Baikal on its bed; then
without the walls (next), which put the side of the Assal depression, land, on the sea.

**Walled off.** A coast's square on the map (below) takes in land up to 4.6 km from the sea, and
land that close to it can be further under it than 15 m. Lake Assal in Djibouti, 155 m under the
sea, is 10 km from the Ghoubbet, the head of the Gulf of Tadjoura, and the east side of its
depression reaches into the square the Ghoubbet's shore crosses (11.583° to 11.625° N, 42.5° to
42.542° E): along that square's west edge Google's ground is up to 28 m under the sea. A pin there
started on the sea's surface, 28 m over the land, and the kart drove across it at 103 km/h on water.
A dry dock, a pit or a cutting by the sea can be that far under it too. But land under the sea's
height is only dry because something over the sea's height walls it off from the sea, and the bed of
open water has no such wall round it. So where anything within 150 m of the ground under the pin
(rays down at 50, 100 and 150 m on 16 bearings, to 15 m over the water's surface) stands more than
15 m over the water's surface, the ground is land, and the drop-in starts on it as before.

On Google's tiles (2 November 2026, typed pins) each of the 12 spots in that square more than 15 m
under the sea (a probe every 30 m) has ground 16 to 40 m over the sea within 150 m of it (within
100 m for nine of them, the depression's rim); a pin at 11.6045° N, 42.5004° E started on Google's
ground there, 15.4 m under the sea, dry ground to water.js, with no sea's surface, the drop-in's
19th ray finding ground 26.8 m over the sea 100 m north-east, and the kart drove on over dry ground
with no splash. In the Strait of Georgia, on Lake Baikal and on Lake Ontario (43.55° N, 79.35° W)
the drive started on the water's surface as before, all 48 rays finding Google's ground there, none
of it over the water. A wide pit dug under the sea's height by a coast (an open-pit mine), its
middle more than 150 m from its rim, still isn't told from the bed.

The drive starts on the water's surface: `src/drive-app/sea.js` lays a disc of water there, 130 km
across, round the vehicle and following it as it drives (laid again each 50 m), fine by the vehicle
and coarse at the horizon, each point of it where the water is over that point of the Earth: at the
sea's height there, or as far over it as the lake is (a lake's surface lies along the geoid as the
sea's does), curving away under the scene's flat frame as the Earth does, 2 m lower 5 km on. It's
one deep blue, mottled so that driving over it is seen to move (Google's picture of the bed out
there is its shaded relief, as dark as (12, 13, 19) at 30° N, 140° W, so it isn't taken from that).
The Driver drives on it as on any ground, and water.js calls anywhere on it water, so it is water
like any other: you ride on it until you've been on dry ground (an island, a coast), the hovercraft
floats on it throwing up spray, no boost pad goes down on it, and once you've been on dry ground,
driving or coming down into it is a splash and back on that ground, not the bed. The flight down to
it doesn't look for Google's ground (it would come down onto the bed). M, or a drop-in anywhere
else, takes it away. It's only by its own water: out over land, with two of the map's squares or
more between the vehicle's and the nearest of its water's (the sea's and its coasts', or the lake's
own: more than 9 km north or south, 7 km east or west at 43° N), it's gone, so that the ground under
the water's height there isn't under it (Niagara's gorge below Lake Erie, Irkutsk below Baikal's
outlet, the Jordan valley inland from the Mediterranean); it's laid again when the vehicle comes
back within reach on ground half a metre or more over the water's height (not in a hollow under it,
where it would be over the vehicle). Land, bridges, roofs and Google's own water drop in as before:
ground more than 71 m over the ellipsoid (the sea's highest, 86 m, less 15), unless it's in a big
lake's box (a little wider than the lake), never asks how high the sea is nor where it is.

**The sea's height.** Google's heights are over the WGS 84 ellipsoid, and the sea's surface isn't:
it lies on the geoid, from 107 m under the ellipsoid south of India to 85 m over it by New Guinea,
so the sea at 0 would have been tens of metres from a coast's own water. It's NGA's EGM96 geoid
(public domain), every degree: `drive/public/sea/egm96.bin`, 65,160 bytes (181 rows from 90° N, of
360 heights from 180° W, each a signed byte in metres), fetched the first time a drop-in needs it
and read bilinearly. `node scripts/make-sea-level.mjs` makes it from PROJ's copy of the model's
15-minute grid (https://cdn.proj.org/us_nga_egm96_15.tif, fetched, or a copy given). It's within
0.5 m of the full model on average (1.9 m at the 99th percentile, 14 m at worst, by the deep
trenches). On the map's 333,804 coast squares it's 0.4 m from it on average and within 2.5 m on 98
in 100; it's furthest out by round volcanic islands, whose own bump is narrower than a degree: up to
9.5 m low on the Big Island of Hawaii's south coast (19.27° N, 155.31° W), and more than 6 m low on
86 squares, by the Big Island, Puerto Rico, the Canaries, Leyte, the Bonin Islands and the
Aleutians. It's 3.9 m high at worst (by Lake Maracaibo). If it doesn't load, the sea is at 0.

**Where the sea and the big lakes are.** It's Natural Earth's ocean and lakes at 1:10 million
(public domain), every 1/24° (4.6 km north to south, 3.4 km across at 43° N):
`drive/public/sea/mask.bin`, 251,556 bytes, fetched with the sea's height the first time a drop-in
needs it. A square is the sea if all of it is, a coast if the sea's edge (a coast, an island's)
crosses it, a big lake's if all of it is that lake, and otherwise land; the sea and a coast both
count as the sea. Natural Earth's ocean is the sea and every sea joined to it (the Black Sea, the
Baltic, Hudson Bay), one polygon all the way round the world, with no lake in it (its other polygon,
the Caspian, is a lake here). A pin anywhere on the sea is in the sea or a coast, whatever
1:10 million's coast is off by (a kilometre or so); a coast square takes in land up to 4.6 km from
the sea, which is why 15 m and the walls (above) matter. Lake Assal is land (though its depression's
side reaches into a coast's square, above), as are the Dead Sea's shore, Death Valley, the Qattara
Depression, the Salton Sea, the Karagiye Depression by the Caspian and the Salinas Grandes on
Argentina's Valdés Peninsula (42 m under the sea, five squares from the nearest coast's). A square a
lake's shore crosses is land, not the lake's: right by a lake there can be ground far under it (the
river out of it below a falls or a dam), which by the sea there isn't. Natural Earth's Lake Erie
goes down the Niagara River to the falls, whose gorge is 75 m under the lake; Lake Victoria's
reaches Jinja, where the Nile leaves it through a dam. So within a square of a big lake's shore, and
of its islands, a pin drops in on Google's ground as before.

Each of its 4,320 rows (from 90° N) is its runs of the same along the row's 8,640 squares (from
180° W): each as its length times 4 plus what it is (land 0, a coast 1, the sea 2, a lake 3), and
after a lake's, which lake, each number in bytes of 7 bits, low bits first, the top bit set on all
but the last; before the rows, 24 and how many lakes there are, so a map made for another list of
lakes isn't read. `node scripts/make-sea-mask.mjs` makes it from Natural Earth's GeoJSON copies
(`ne_10m_ocean.geojson` and `ne_10m_lakes.geojson` from
https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/, fetched, or copies
given) and checks it on the way: the middle of the Pacific (and at 180°), Santa Monica Bay, off
Waikiki, the Strait of Georgia, the Black Sea and the Baltic are the sea, Santa Monica Pier a coast,
the big lakes theirs, and Olkhon (an island in Baikal), Denver and the places above land. If the
map doesn't load, only ground lower than 1.5 km under the ellipsoid is the sea bed: the deep sea
still starts on the sea, and the shelf and the lakes on their beds.

#### The big lakes

A lake is here if it's big and deep enough that Google may draw its bed far from its shores, as it
does Baikal's and the Great Lakes' (tried, below); where it draws the lake's surface instead (Lake
Tanganyika's, Lake Malawi's), a pin there drops in on that as before. Its height is its surface over
the sea as its country measures it (over its own mean sea level, within a metre or so of the geoid),
so its water is laid that far over EGM96's geoid there. They're `LAKES` in `src/drive-app/lakes.js`,
with their sources there too and their outlines' names in Natural Earth's lakes (the Caspian's is
its ocean's other polygon) and a box round each: a lake is added there, and the map made again.

| Lake | Surface over the sea | Deepest | Its height's source |
| --- | --- | --- | --- |
| Baikal | 455.5 m | 1,642 m | Wikipedia, *Lake Baikal* |
| The Caspian Sea | −28 m | 1,025 m | Wikipedia, *Caspian Sea* (falling since 1995) |
| Superior | 183.4 m | 406 m | US Army Corps of Engineers, 2013's average (601.7 ft) |
| Michigan and Huron (one lake) | 175.9 m | 281 m | US EPA, *Great Lakes: Physical Facts* (577 ft) |
| Erie | 173.4 m | 64 m | US EPA (569 ft) |
| Ontario | 74.1 m | 244 m | US EPA (243 ft) |
| Tanganyika | 773 m | 1,470 m | ILEC, World Lake Database |
| Malawi | 468 m | 706 m | Reader's Digest, *Natural Wonders of the World* (1980) |
| Victoria | 1,135 m | 81 m | DAHITI, TU Munich's satellite altimetry |
| Great Bear | 156 m | 446 m | *Encyclopedia of Earth* |
| Great Slave | 156 m | 614 m | *Encyclopedia of Earth* |
| Ladoga | 5 m | 230 m | Wikipedia, *Lake Ladoga* |
| Onega | 33 m | 127 m | Wikipedia, *Lake Onega* |
| Titicaca | 3,812 m | 281 m | ILEC, World Lake Database |
| Issyk-Kul | 1,607 m | 668 m | Savvaitova and Petr, *Int. J. of Salt Lake Research* (1992) |

(Each as its Wikipedia article gave it on 2 November 2026, with the source it cites where it cites
one.) A lake whose level has moved since (the Caspian's, down about 2 m since 1995) has its water
laid that far from Google's photographed water by its shore.

**Tried on Google's tiles** (scratch scripts, three page loads, every place reached by the globe's
drop-in): the middle of the Pacific, by a tap on the globe from space (30° N, 145.1° and 145.3° W)
and by typed coordinates (30° N, 140° W): driving 7 to 11 s after **Drive here**, on the sea at 20.7
to 28 m under the ellipsoid, the bed 4.7 to 5.2 km under it; the kart driven on for 4 to 5 s, on
the water all the way with no splash, flown 25 m up and glided down onto it, and thrown 25 m up and
down onto it, with no splash; the hovercraft across it throwing up spray. 7 km off Kona, Hawaii,
with the island in sight: the sea at 15.5 m over the ellipsoid (EGM96 at a degree; at its full 15
minutes, 19.3), the bed 1.7 km down; held 400 m off the coast, 6.5 km on, Google's own water there
was 1.0 m over the open sea's surface, a kerb's step, the coast rising straight out of the sea in
the view. On Google's ground by that coast (its photographed water by the shore, dark and not
even, which water.js takes for dry ground), flown 900 m out over the open sea and let glide down:
**SPLASH!**, and back there, "Back on dry land". Santa Monica Bay, the pier's water and the beach
dropped in as before, the same ground at the same heights, and a kart flown out from the beach
into the sea, and thrown in, still went **SPLISH!** and was back on dry land.

**With the map and the lakes** (three more page loads, typed pins, the kart unless said). The first,
with a map of the sea alone: on from Santa Monica Bay toward the pier, Google's ground rose from
129 m under the open sea's surface 2 km on to 7.6 m under it 10.8 km on (500 m short of the pier),
all of it water to water.js; the Caspian (38.2° N, 51.2° E) is a flat surface of Google's 6.2 m
under the ellipsoid, 6.8 m over the sea's height there and 35 m over the Caspian's own, so a pin
there starts on that; and the pier's water was 36.5 m under the ellipsoid, 1.0 m under the sea's
height as EGM96 has it there. Then as it is now (two loads, one root tileset request each):

- **Lake Baikal** (53.25° N, 108.1° E): on the lake's surface, 422.2 m over the ellipsoid (455.5 m
  over the sea's height there, which is 33.3 m under it), with its shores in view; Google's bed
  1,634 m under it.
- **Lake Superior** (47.7° N, 87.5° W): Google draws its bed too. On the lake's surface, 147.9 m
  over the ellipsoid (183.4 m over the sea's height there, which is 35.5 m under it); the bed
  171.6 m under it.
- **The sea**: 13 and 20 km off Waikiki (21.15° and 21.08° N, 157.85° W) at 11.5 and 12.0 m over the
  ellipsoid, the bed 546 and 578 m under it; the Strait of Georgia (49.2° N, 123.55° W) at 18.4 m
  under it, the bed 328 m down; Santa Monica Bay (33.95° N, 118.6° W) at 35.9 m under it, the bed
  184 m down; the middle of the Pacific (30° N, 140° W) at 28 m under it, the bed 4.7 km down. Each
  driven on for 4 s, on the water all the way, with no splash.
- **Land, as before**: the Dead Sea (31.5° N, 35.48° E: Google's lake there, 396 m under the
  ellipsoid and 416 m under the sea, land on the map, and dry ground to water.js, its salt-flecked
  picture not even), Death Valley (36.25° N, 116.83° W: 116 m under the ellipsoid, 86 m under the
  sea), Neptune Terminals' start spot (in a coast square, its ground 6 m over the sea) and the
  Golden Gate's, on its deck at 48.3 m over the ellipsoid: none with water of their own.
- **Back into the sea from the beach**: from the open sea in Santa Monica Bay the kart was put on
  Santa Monica's beach north of the pier, 11 km off, over Google's sand 2 to 0.6 m over the open
  sea's surface, sloping down to where water.js called it water 330 m on, and driven into the sea: a
  splash, and "Back on dry land" on the beach, 2.7 m over the sea's surface, not the bed. Flown out
  with F and let glide down, it came down on the sand, rolled on into the sea and sank there with a
  splash.
- **The hovercraft** on Lake Baikal: on the lake's surface, floating for 10 s at up to 113 km/h,
  throwing up spray, with no splash.
- **More lakes**: Google draws Lake Michigan's bed (44° N, 87° W) 104 m under the lake's surface and
  Lake Ontario's (43.6° N, 77.8° W) 205 m under it, and each started on its surface, at 139.9 and
  38.0 m over the ellipsoid. It draws the others tried at their surface, a few metres from the
  table's height: Tanganyika (6° S, 29.5° E) 5.4 m under it, Malawi (12° S, 34.5° E) 5.1 m over,
  Victoria (1° S, 33° E) 0.6 m under, Titicaca (15.8° S, 69.4° W) 3.1 m over, Issyk-Kul (42.45° N,
  77.25° E) 7.5 m under, Great Slave (61.5° N, 114° W) 7.8 m over, and the Caspian 35 m over: each
  started on Google's surface, as before (Tanganyika's and Malawi's, from cloud-flecked pictures,
  dry ground to water.js; at Issyk-Kul water.js took the start for dry ground and 2 m on it splashed
  and came back).
- **Below Niagara Falls** (43.0885° N, 79.0712° W, in the gorge, 75 m under Lake Erie and in a
  square of Natural Earth's Erie that's land on the map): on Google's ground there, with no water of
  its own.

**With the walls and the reach** (one more page load, typed pins), as well as what's under
[walled off](#the-open-sea): from Lake Ontario's surface, the vehicle put 3 m over the lake's height
at Rochester (four squares from the lake's) had no lake's surface round it, and at Toronto (one
square from them) had it again; from Lake Baikal's, at Irkutsk (11 squares off) it was gone. In the
Strait of Georgia the kart drove on the sea for 4 s, on the water all the way, with no splash.

## Driving with others

Other people driving World Drive show up as they drive: their car, in their own ride and Garage
look, with their name over it. Everyone is a **ghost**: cars pass straight through each other, and
other cars are never in the way of yours or of the camera. There's no chat. Two ways to be with
others:

- **Nearby** (the default). After you drop in, you're in the room for the area you're in (about
  11 km across) and see everyone else driving there, so a popular spot is busy.
- **A party.** **Invite friends** makes a link (`https://worlddrive.app/?party=CODE`); whoever
  opens it is in your party wherever on Earth each of you is, and can join you where you are.

And on the globe, **who's driving now**: a glowing dot wherever people are driving in an area's
room, with how many (see [On the globe: who's driving now](#on-the-globe-whos-driving-now)).

It's only on when the Worker says so (`live: true` in `/api/config`: the `LIVE` setting below, and
[the day's budget](#the-days-budget) not spent) and the visit has a token, which only visits on
Google's map get. When it's off, nothing of it appears: no chip, no **Drive with friends**, no H in
the keys card, no horn button, no dots or **Driving now** on the globe, and driving alone is as it
always was.

### What you see and do

- **The chip** in the driving bar, by the place's name: "Nearby · 5", "Nearby · just you",
  "Party · 3", "Nearby is busy" or "... · connecting", with a green light while connected (on a
  phone only the light and the count, so the place's name keeps its room; the words are its label
  for a screen reader). Tap or click it for **the list**, nearest first: each driver's name (⭐ for
  the Supporter Pass), ride and distance, or "paused", "on the globe" or "at <place>". **Go to** puts
  you 5 m to their right, facing their way: within 10 km, straight there in the same scene, on the
  ground within 3 m of their car's height (as R takes it: never the roof, tree or deck over them) and
  not where it's surely water (unless your ride floats), with a fresh trail of dry ground from there;
  farther, or with no such ground, a drop-in at their spot in your own ride, which finds the street.
  **Hide** hides that driver for this visit (**Show** brings them back).
- **Other cars** are drawn 0.3 s behind where their drivers are, moving smoothly and turning with
  them: each page hears of the others' cars 5 times a second, and draws them along a curve through
  each of those words that leaves and arrives at the speed and heading it had there, so a car
  rounds a bend rather than cutting its corners (in the tests, a kart driving off and turning was
  drawn within 5 to 9 cm of where it really was at the median, and 45 cm at most, as close as it
  was at 8 words a second with straight lines between). A word that's late, it carries on along the
  bend it was taking. Their flame or boost style, trail, drift smoke and sparks, the bursts as
  their booster lights and runs dry and as a drift charges and pays out
  ([below](#how-boosting-and-driving-look)), overdrive's boom and streaks, splashes and the
  hovercraft's spray show for the nearest 6 within
  300 m, and their wheels turn. A name tag hangs over each (hidden beyond 400 m), with a 📣 when they
  honk and "+1,234" when they land a trick. A car within 8 m of yours or of the camera turns
  see-through, so it never blocks the view. A paused driver's car stays parked where it stopped; a
  driver back on the globe disappears, and so does a car with no word of it for 15 s. At most the
  12 nearest are drawn. A new ride or paint shows once it has held for a second (and no more than
  once every 5 s for each car), swapped in when it's ready, so someone clicking through colours in
  the Garage (or changing ride twenty times a second on purpose) costs the others one build; a model
  read from a file is kept 15 s after the last car in it goes, so changing back, or a reconnect,
  reads nothing again. The pickup's skinned body is copied with skeletons of its own, so it's drawn
  with its ghost.
- **Nearby rooms.** An area takes 20 drivers; when it's full you go to the next of its up to four
  rooms (shards), and with all four full the chip says **Nearby is busy** (and the list "This area
  is full just now, so you're driving on your own here.") and you drive alone. Drive into another
  area and stay there 5 s and your room follows you. Back on the globe you stay in the area's room
  for a minute (the others see you as "on the globe"), then leave it. A drop-in there again goes
  back to the area's first room (a busy area is tried again) unless you're still in a shard with
  others in it. **Show me to drivers nearby** (on by default, kept in this browser) turns nearby
  off, and with it the horn while you're not in a party.
- **Drive with friends**, on the globe's panel and in the pause menu: **Invite friends**, then the
  link with **Copy** and **Share** (where the browser can share), the party's members ("You
  (Guest 1234)" first, by the name the others see), **Leave party**, and the nearby switch. A party
  takes 8; its code is 7 letters and figures with nothing that reads two ways (no I, O, 0 or 1).
  The party stays in the address while you're in it, so a reload keeps you in it; **Leave party**
  takes it out and puts you back with those nearby.
- **Opening a party's link**: you're in the party from the globe on. A banner there says "<name> is
  driving at <place>" with **Join** (5 m to their right, facing their way, in the ride you picked),
  or "Waiting for your friends: pick a place and they can join you". Toasts say who joined and left
  the party and where a friend went ("Ana went to Monaco." with **Join**), or "Ana dropped in near
  you." when that's your area (as **Join** does, beside you); on the globe the banner says it
  already, so no toast repeats it. A full party says "That party is full: 8 drivers at most." and
  you drive on with those nearby.
- **The horn**: **H** while driving, or 📣 at the top left on a touch screen. A 📣 shows over your
  car on your screen and everyone else's, and a soft beep plays for your own honk and for those
  within 150 m (once you've clicked, tapped or pressed a key: browsers want that before sound).
  **Horn sounds** in the pause menu turns the beep off (kept in this browser). One honk every 0.8 s
  at most.
- **When it stops.** A dropped connection comes back by itself, waiting 1, 2, 5, 10 and then 30 s
  between tries, and so does one that goes quiet without a word (a network that drops everything):
  the page sends its keepalive when it has heard nothing for 25 s too, and with no answer 10 s later
  it's dropped. It stops for the rest of the visit when another tab with the same visit takes over
  ("Driving with others moved to another tab."), when the visit runs out after 6 hours ("Driving
  with others has ended for this visit (after 6 hours). It's on again on your next visit."), when
  the day's budget is spent ("Lots of drivers today: driving with others is back after midnight
  UTC.", once), when it's turned away at the door 8 times in a row while the Worker says it's on
  ("Driving with others couldn't connect from here, so you're driving on your own.": a network
  that blocks WebSockets, say), or, without a word, when it's switched off. Then none of it shows.
  Driving alone carries on. A party's link opened while the day's budget is spent says the same.

### What others can see about you

- **Your name**: the leaderboard nickname this browser has, with a ⭐ if it's linked to an account
  with the Supporter Pass and your [level and title](#levels) under it ("Lv 12 · Drifter"), looked
  up by the room from the player's id and secret as the page says hello (never a name or level the
  page says). Without one you're "Guest" and four figures, the same for the whole visit (made from
  it), so **Hide** holds and a friend coming back is the same guest. Never your Google name or
  email.
- **Your ride and its look** from the Garage.
- **Where you drive in the game**: your car's position, turn and speed in the game's world, what
  it's doing (boosting, drifting, flying, paused), and where you dropped in (the place's name as the
  game shows it, and its coordinates). Never where you really are: World Drive never asks the
  browser for its location. But a place you drop in at is shown to your party or that area's room,
  so a search for your own street shows it to them.
- Whether you're on the globe, your tricks' points and your honks.
- Not your address (IP), not your leaderboard id or secret, and nothing you type. In a nearby room,
  where your car is only goes to those driving within 5 km of it (and to anyone there not driving
  just then); the place you dropped in goes to the whole room. The room keeps nothing once
  everyone's gone. The About box says this too.
- **On the globe**, while you're in a nearby room and driving (or paused), everyone sees a count
  where you are, to about a kilometre, with no name or anything else of you (below). Not in a party,
  on the globe, or with **Show me to drivers nearby** off; the switch says so ("Also counts you,
  with no name, on the globe's map of who's driving."), and so does the About box.

### On the globe: who's driving now

**What shows.** On the globe, a glowing green dot, pulsing gently, wherever people are driving
just now, with how many on it: 32 px across for one (a touch target), bigger for more, up to 60.
Dots that would overlap on screen are drawn as one with all their drivers, at the busiest one's
spot, again until none overlap (so from far out the San Francisco and Las Vegas areas are one dot,
two as you come down). A dot isn't drawn round the back of the Earth, off the screen, or under the
panel, the pin's card or the party banner. Tapping (or clicking) a dot of one area flies the globe
there as a search result does and pins it, its card saying "3 drivers here" (or "1 driver here"),
with "Near Golden Gate Bridge" and the coordinates under it, and **Drive here**: dropping in there
puts you in that area's nearby room (each dot is kept inside its room's area), so you see them.
The card's count follows each new answer. Tapping a dot that's several areas drawn as one doesn't
pin anything: the globe flies straight down over them (their mean, weighted by how many drive in
each), near enough that the nearest two come apart on screen and at least four times nearer than
it was, and far enough that all of them stay in sight (never nearer than 6 km), so each can then be
tapped; tapping one that's still several parts it further. On the panel, **Driving now** says how
many are driving in all ("12 driving now. Tap a glowing dot to join them.", or "Nobody driving
right now: be the first.") and lists the 5 busiest areas, each named after the nearest start spot
within 25 km ("Near Times Square", "4 drivers"), or else by its coordinates, and each going there
as a dot of one does. A drag, pinch or wheel that starts on a dot moves the globe as anywhere else:
the dots let the pointer through to it, and the globe hands its taps on one back to `online.js`
(GlobeView's `onTap`), with the pointer cursor over one. None of it while driving, and none of it
at all while driving with others is off (no Worker, `LIVE` off, the day's budget spent, or over for
this visit, or the visit run out: then the page doesn't even ask). Each dot is a button, for the
keyboard and screen readers, whose label says "3 drivers driving here", or for several areas "3
drivers driving round here: show them".

**Where a dot drops you in.** A dot's place is the start spot's own (its name and region, so its
leaderboard is the spot's) when the dot is within 2 km of it; otherwise it's a pin, which the
leaderboard and the others know by where it is (to 0.01°), as any pin. Either way it's where the
dot is, so **Drive here** is in its room, and the card and the driving bar say which spot it's
near ("Near Golden Gate Bridge"), as text only.

**Who's counted, and what's said** (decided, and kept to by the rooms, `worker/drive/live.js`):

- Only drivers in **nearby rooms**: those already visible to anyone who drops in there. A party's
  room is private and never says. A page with **Show me to drivers nearby** off isn't in a nearby
  room, so it never shows. Drivers on the globe (still in the area's room for a minute) don't
  count; paused ones do, as they're parked in the game.
- Only positions and counts: no names, no place names (one typed into the search can be a home
  address), no pids. A position is rounded to 0.01° (about a kilometre) and its height to 10 m.
- Drivers in one room more than 2 km apart are dots of their own: greedily, each joins the nearest
  dot begun within 2 km of it, or begins one, at most 3 a room (past that, each joins the
  nearest). A dot is at its drivers' mean position, rounded, and kept at least 0.002° inside its
  room's area (so a dot by an area's edge can sit a kilometre or so from them, on their side of
  it: dropping in on it puts you in their room). A car is where it is when the room has word of it;
  a page alone in its room sends no states, so then it's where its driver dropped in (which can be
  a place they searched for, as the About box says), or, if that's in another area (they drove
  into this one), the middle of this area; and once the others have gone, where it last sent.
- A page just back on the globe from driving in a nearby room doesn't count itself: for 100 s
  (its room's next report and an answer's 30 s) it takes 1 off the area within 3 km of where it
  was, if that area has more than the others it knows are driving in its room there. Each of those
  is taken to be in the area nearest where it last knew their car to be (or where they dropped in),
  if there's one within 5 km, so others in the room driving in dots of their own don't stop it.

**Timing.** A new driver shows within about a minute: their room says where its drivers are at
its next report, which goes when they've changed (someone joined, left, went to the globe, came
back, or a dot moved to another rounded spot) as soon as a report may, 50 to 60 s after the last
(a room's first comes a minute after its first driver connected), even with little else to
report. Then `/api/online` is kept up to 30 s, and a page asks when the globe shows and every
minute while it's showing and the tab can be seen, but not while the Garage is open over it, nor
once nobody has touched the page (a click, tap, key or wheel) for 10 minutes: a tab left on the
globe on a second screen stops asking, and asks again at once at the next touch. One who's gone
goes the same way within about a minute, or at once when their room empties (its last report says
none); a room that went without a word (a restart) is left out once its last report is 12 minutes
old.

**How it works.** Each area's room puts its dots (`live-protocol.js`'s `dotsOf`) in the reports of
what it has spent that it makes to `DriveLimits` anyway (`liveSpent`), which keeps them in a table
of its own, `live_online`: one row a room, replaced at each report, deleted when the room reports
none (or as it reports with the day's budget spent, as it then closes everyone); a row older than 12
minutes (the TTL: a room still there reports at least every 10 minutes and its next alarm) is left
out and deleted. A room knows what it last reported from what its connections keep through
hibernation, so waking up doesn't make it report again. `GET /api/online` answers
`{ on, total, areas: [ { lat, lon, height, count } ] }`: at most 200 areas, busiest first (those of
an area's rooms at the same spot as one), and `total` counting them all. It's kept 30 s in
Cloudflare's cache (the Cache API, `caches.default`, under the address without its query, so a query
can't get round it; each Cloudflare location has its own), and by browsers for what's left of that
(`Cache-Control: public, max-age=30` and the `Date` it was made), and by each Worker instance
(as plain values: what it last heard, answered with the same `Date`). Only a request that finds none
kept asks `DriveLimits` (`liveOnline`), which counts that ask against the day's budget in the same
go, as any Durable Object request. Cloudflare's cache doesn't make requests arriving together wait
for one another (each that finds nothing kept would ask), so while a Worker instance has an ask
out, the others it gets are answered with what it last heard, a little old and kept nowhere
(`max-age=0`), and an ask that doesn't come back within 5 s (its request cancelled) is given up on;
`/api/config`'s ask has the same guard. `on: false` once the budget is spent or with `LIVE` off, asking
nothing then (a Worker instance remembers a spent day, as for `/api/config`, and an answer that it's
off for the day is kept no later than midnight UTC: a page told it's off shows none of it for the
rest of its visit). If `DriveLimits` can't say, it's `on: true` with nobody, kept 10 s: never an
error. The same-origin checks every route has apply. On the page it's `src/drive-app/online.js` (the
dots, projected each frame through the globe's ellipsoid and the Earth's matrix as it is then) and
the panel's part in `panel.js`; `window.drive.online` has what it shows, for the tests.

**What it costs.** No Durable Object requests of its own from the rooms: the dots ride on reports
they already make. The only extra is a report when a quiet room's dots change (a lone driver's
room reports a minute after they arrive rather than a few minutes later), at most one a minute, as
ever: a request and a row written, and the dots' own row in `DriveLimits` (an upsert or a delete
for each report of an area's room). An answer not kept is a `DriveLimits` request, counted against
the day's budget: about two a minute in each Worker instance where someone's on the globe (those
in one Cloudflare location share its cache when their requests are spread out, and a burst in one
instance asks once), and none at all while nobody looks. So a page alone on the globe in its
location is an ask a minute, about 60 an hour (a lone driver's room is about 93), and however many
watch in one location it's about 120 an hour there; it stops once nobody has touched the page for
10 minutes, so a tab forgotten on the globe costs 10 minutes' worth. Each such ask reads a row for
each area's room with drivers (rows read: Free 5 million a day). Every ask that reaches the Worker
is a Worker request (Free: 100,000 a day): a page on the globe asks once a minute, and the browser
answers any ask within 30 s of the last itself.

### The rooms

Each room is one Durable Object (`DriveRoom`, `worker/drive/live.js`) on the WebSocket Hibernation
API: `party:CODE`, or `near:BAND.COL` for an area (bands 0.1° of latitude tall, cut into columns
about as wide) and `near:BAND.COL#1` to `#3` for its other shards. What's said is
`src/drive-app/live-protocol.js`, which the page and the Worker both import:

- The page opens `GET /api/live?room=<room>` with the subprotocols `[ 'worlddrive-live.v1', <visit
  token> ]` (a browser can't set headers on a WebSocket, and a token in the address would end up in
  logs). Before the room is touched the Worker turns away anything that isn't a WebSocket (426), from
  another site (403: the Origin must be worlddrive.app's own, as WebSockets have no CORS), while
  `LIVE` is off (503), to a room that isn't one (400), without the protocol (400), without a good
  visit token (401: forged, changed or run out), from a visit connecting more than 20 times a
  minute (429, on Cloudflare's rate limiter, `LIVE_CONNECTS`, which costs no Durable Object
  request) or more than 200 times a day (429, `LIVE_VISIT_CONNECTS`) or once the day's budget is
  spent (503 with `reason: 'budget'`, asked of `DriveLimits` only after everything else checks
  out). The room gets only what was checked. A visit is in one room at a time: `DriveLimits` keeps
  each visit's room today (a `live_visits` table, deleted with the day), and when it connects to
  another the Worker has the room it was in let go of it first (4002, as another tab in the same
  room would be; one of its connections still on its way in there is turned away too), so one
  visit can't be in a hundred rooms at once.
- Positions are Earth-centred (ECEF metres) and turns a quaternion in that frame, so two pages
  centred on different places agree on where a car is. A page sends its car 5 times a second while
  it moves, once every 2 s while it's still (and once more at 5 a second as it stops, so where it
  stopped isn't what waits), and at once when what it's doing changes (at most 14 messages a second
  on average and 24 at once, under the room's limit). **Alone in its room it sends none**: they'd
  be for nobody, and every message in is billed; with only those on the globe there, who can't see
  it (only their **Join** needs to know where it is), once every 2 s, and at once when one of them
  drops in. As someone joins (or it joins a room with someone
  in it) it sends its car at once, from the message itself rather than the next frame, so the
  newcomer sees it straight away even if its tab is in the background; the room, for its part,
  forgets the last state of a driver left on its own, so nobody's shown where that car was a while
  ago. The room sends everyone what's moved at most once every 100 ms, with the next message to
  arrive once that's passed (there's no timer: it would keep the room from hibernating), each car's
  state with how long the room held it, so a page knows when it was where it says. A car's first
  state goes at once, and one held back goes with its car's next (both, oldest first, if they came
  100 ms or more apart), so none is lost at 5 a second. In an area, only cars within 5 km.
- Limits, each closing the connection with its own code: hello within 10 s (4003); nothing heard
  for 75 s (4007: the page's keepalive every 25 s counts); over 20 messages a second, or 40 at once
  (4004), keepalives and honks included (a honk within 0.8 s of the last is dropped, but counts);
  a message it can't take (4000); the visit run out (4005); another connection with the same visit,
  in this room or another (4002, the older goes); a full room (a `full` message, then 4001);
  switched off (4006), or the day's budget spent (4006 with the reason `budget`). A state no car
  could be in is dropped, not closed on, and a place's name that isn't text is no name. The room
  answers the keepalive itself (`ping`, `pong`), not with the runtime's auto-response: that would
  answer it without the room seeing it, so it could be neither counted nor held to the rate.
- A connection the room has closed whose page goes on sending (never answering the close, as no
  browser does) is billed for each message all the same: each is counted, and past 40 the room
  resets itself (`ctx.abort`, the only way to cut one connection off), reporting what it has spent
  first. Everyone's connection to it drops, and their pages come back by themselves; the one that
  wouldn't stop has to connect again, a request, to carry on.
- A room stores nothing but its alarm (about once a minute while anyone's in it: the limits above,
  and adding what it has spent to the day's), and deletes that when it empties.

### Switching it off

`LIVE` in `wrangler.drive.jsonc` (`vars`) is the kill switch: `"off"` and deploy. New connections
are turned away at the door (503). A page that was connected is closed (4006) as it next says
anything or at its room's next alarm, once its room runs the new version: Durable Objects keep an
active one's code for up to 5 minutes after a deploy (until it hibernates), so a busy room can
take that long. Deployed with `npx wrangler deploy -c wrangler.drive.jsonc
--durable-objects-code-update-mode immediate` instead, every room starts again on the new version
at once, which drops their connections; their pages then find the door shut. A page whose
connection dropped (as then, or when the rooms restart) asks `/api/config` when it's turned away
and sees `live: false`. Either way it stops for the visit without a word, everything of it
disappears from the page and driving alone carries on; pages loaded afterwards show none of it.
`"on"` and deploy turns it back on for the next page load. It also switches itself off for the rest
of each day once it has spent that day's budget (below).

| Setting | Default | What it is |
| --- | --- | --- |
| `LIVE` | `on` (in `vars`) | `off` switches driving with others off |
| `LIVE_DAILY_BUDGET` | 40000 (in `vars`) | The Durable Object requests a day it may use; 0 is off |
| `LIVE_PARTY_MAX` | 8 (unset) | The most in a party |
| `LIVE_NEARBY_MAX` | 20 (unset) | The most in each of an area's rooms |
| `LIVE_VISIT_CONNECTS` | 200 (unset) | The most connections to rooms a visit makes in a day |
| `LIVE_CONNECTS` | 20 a minute (`ratelimits`) | The rate limiter for each visit's connections |

### The day's budget

On the Free plan, once all of an account's Durable Objects together have made 100,000 requests in
a day, every one of them fails until 00:00 UTC, `DriveLimits` included: `/api/visit` would fail
and nobody could start a drive. It isn't known which plan the account is on, so driving with others
keeps to a budget of its own, `LIVE_DAILY_BUDGET` billed requests a day (**40,000** in
`wrangler.drive.jsonc`), and leaves the rest for visits, names, scores and searches:

- **What's counted**, in billed requests as Cloudflare counts them (below): each connection (1),
  each message a room is sent (1/20 each, keepalives included, and those a closed connection goes
  on sending), each of a room's alarms (1) and each of its reports (1), each time the Worker asks
  `DriveLimits` whether it's open (1: on every connection to a room, and for `/api/config` at most
  once every 30 s in each Worker instance, as an open answer is kept that long: anyone can ask
  without a visit, and each asking would let a loop of requests spend the day's budget by itself),
  and the request that has a visit's last room let go of it when it connects to another (1).
- **Where.** Each connection keeps its own count in what it keeps through hibernation; at the
  room's alarm (about once a minute while anyone's in it), and as the last one leaves, the room adds
  its count to the day's in `DriveLimits` (a `live` table, one row a UTC day, deleted with the days
  before it as visits' are). But with less than 5 to add (a room of drivers each alone or parked,
  whose own alarm and report would be nearly all of it) it waits, up to 10 minutes, its alarms
  counted for the next.
- **Spent**, the next room to report closes everyone in it (4006, `budget`); the others do at their
  next report, within the minute for rooms with drivers moving, within a few for quiet ones.
  `/api/live` turns new connections away (503 with
  `reason: 'budget'`) and `/api/config` says `live: false` with `liveReason: 'budget'`, so new page
  loads show none of it. A page turned off this way toasts once, "Lots of drivers today: driving
  with others is back after midnight UTC.", hides it all and drives on alone. At 00:00 UTC it's a
  fresh day: pages loaded after that have it again. Once a Worker instance has heard the day is
  spent it stops asking until the next day.
- **If `DriveLimits` can't say**, a room carries on as if it's open (and adds what it couldn't
  report to its next report, at its next alarm); `/api/config` and `/api/live` take it as off, so
  nothing new starts (`/api/config` with `liveReason: 'unknown'`), and a page already driving with
  others that's turned away keeps trying, asking `/api/config` the first time and then every 5
  minutes (each time while the Worker can't be reached at all).
- The count runs a minute behind (up to 10 for quiet rooms, with less than 5 each to add), which is
  why the budget isn't all of what's left: 60,000 of the Free plan's requests are left for the rest
  of the site, and for the last minutes' driving.
  On Workers Paid, going over costs money rather than switching everything off, so it can be
  raised there (see what that costs below).

### What it costs

From Cloudflare's [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
(read 1 November 2026):

- **Requests.** "A request is needed to create a WebSocket connection. There is no charge for
  outgoing WebSocket messages, nor for incoming WebSocket protocol pings." Incoming WebSocket
  messages count 20 to 1 (100 messages are 5 requests), and each alarm is one. Free plan: 100,000 a
  day; Paid: 1 million a month included, then $0.15 a million.
- **Duration**, billed at 128 MB while a room is running or idle but unable to hibernate: "Durable
  Objects that are idle and eligible for hibernation are not billed for duration, even before the
  runtime has hibernated them". Free: 13,000 GB-s a day; Paid: 400,000 GB-s a month, then $12.50 a
  million. Nothing keeps a room awake between messages, so this is only the time spent handling
  them, each keepalive's included (the room answers it itself, so it can be counted and limited).
- **Storage** (SQLite): "Each setAlarm() is billed as a single row written" (Free: 100,000 rows a day;
  Paid: 50 million a month, then $1.00 a million), and a room's storage is deleted when it empties.
- **Over a Free plan limit**, "further operations of that type will fail with an error" until
  00:00 UTC, for every Durable Object: `DriveLimits` too, so nobody could start a drive. That's what
  [the day's budget](#the-days-budget) is for.

Worked through:

| | Messages | Billed requests |
| --- | --- | --- |
| A driver with others, an hour on the move (5 a second) | 18,000 | 900 |
| With others, parked, an hour (once every 2 s); or on the move with only those on the globe | 1,800 | 90 |
| The keepalives of a page with nothing else to say (alone, or on the globe in a party), an hour | 144 | about 7 |
| A room with drivers moving in it, an hour (an alarm and a report to `DriveLimits` each minute) | | 120, and 120 rows written |
| A driver alone in a room, an hour, all told (its keepalives, the room's alarm about every 50 s, a report every 5 minutes or so) | 144 | about 93 (110 for a tab in the background, keepalives once a minute) |
| Connecting to a room (the Worker's ask, the connection, and an alarm 10 s later for its hello) | | 3 (and 2 rows written), 1 more on a change of room |
| A page load (`/api/config`'s ask, at most one every 30 s in each Worker instance) | | 0 or 1 |
| A page on the globe, an hour (`/api/online` once a minute, kept 30 s; none after 10 minutes untouched, or with the Garage open) | | about 60 alone in its Cloudflare location; about 120 a location however many watch |

So the default budget of 40,000 a day is about **40 driver-hours with others** (two driving
together for an hour is 2 × 900 + 120 = 1,920), or about 430 hours of drivers each alone in their
area's room (about 93 an hour, mostly the room's alarm; 360 hours of tabs left in the background),
and leaves 60,000 of the Free plan's 100,000 for everything else. (The globe's dots of who's driving
now add a report when a quiet room's drivers change, and an ask of `DriveLimits` about twice a
minute in each Worker instance where someone's on the globe, all within the budget: the 40,000 are
also about 667 hours of a page alone on the globe in its location, being used.) (Before, at 8 a
second whether anyone was there or not, a driver was 1,440 an hour, and nothing stopped the rooms
using all 100,000.) On **Workers
Paid** (1 million requests a month included, for all Durable Objects together, then $0.15 a
million) the default is at most 1.2 million a month. Raising `LIVE_DAILY_BUDGET` there costs at
most $0.45 a month for each 100,000 a day more (3 million a month): 200,000 a day, about 200
driver-hours with others, is at most 6 million a month, $0.75 past the included million (more if
visits and scores use some of it); a driver-hour with others is about $0.00014.

A room kept awake for a whole hour would be 460.8 GB-s (Free: about 28 room-hours a day; Paid:
about $0.006 a room-hour), but a room only runs while it handles a message. Connections and
reconnects are Worker requests too, as every `/api/` call is. Limits that matter here ([WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/),
[state](https://developers.cloudflare.com/durable-objects/api/state/)): what a room keeps for each
connection through hibernation (its count of what it has spent included) is under 1 kB of the
16,384 bytes allowed, and a Durable Object holds up to 32,768 hibernating WebSockets, far more than
a room lets in.

### How it's tested

`npm run test:drive-live` (the rooms, `scripts/test-drive-live.mjs`): under `wrangler dev`, with
WebSockets opened as the page opens them, every connection turned away before the room, welcome,
join and leave, names from the leaderboard (never the page's), guests and the ⭐, batches every
100 ms with each state's age, never back to its own, rounded and checked, only within 5 km in an
area, a car alone in its room going to nobody and not kept, its first state after a join going at
once, a held-back state going with its car's next, everything else passed on at once, honks
spaced and held to the rate, a place's name that isn't text, the rate, sizes and order, full
parties and areas and their shards, a visit connecting again in the same room and in another (the
first room letting go of it at once) as the same guest, one visit connecting 41 times in a row
(past 20 a minute, 429), a raw client that ignores the room's close and goes on sending (the room
resets, everyone else gets back in), keepalives answered and held to the rate, the hello deadline,
a visit running out and a room carrying on after hibernating. The day's budget, on a Worker of
its own with a budget of 30: every ask counting (and `/api/config` taking an open answer for 30
s), a room adding what it spent as it empties, a room closing everyone with 4006 `budget` at its
report, `/api/live`'s 503 and `/api/config`'s `liveReason`, a fresh day at midnight UTC (the tests'
clock), and a visit's connections a day (3 there). And the room in-process on a stand-in for
Cloudflare's runtime and clock: batches with nothing after them, idle connections, waking from its
attachments, the alarm, `LIVE` switched off, emptying, a name still being looked up, the
attachment's size, no timers, quiet when alone, held states, a visit gone to another room (and one
of its connections still on its way in), a closed connection that goes on talking (counted, then
the room resets), and what it spends: every billed request counted exactly once over twenty
minutes, reported once a minute while drivers move and every few minutes while they're parked, a
driver alone for an hour (about 93 billed requests, 110 with a keepalive a minute), a lone driver
connecting again keeping what it hadn't reported, everyone closed when the day's is spent, and a
room carrying on when `DriveLimits` fails, counting it all in the next report. Then the page's
`live.js` on stand-ins for the browser (WebSockets, `/api/config` and the clock the test moves):
turned away 8 times while the Worker's on and stopping, asking `/api/config` only the first time;
turned away while `DriveLimits` can't say or the Worker can't be reached and trying on, asking
every 5 minutes (each time while it can't be reached, so a Worker back with `LIVE` off is heard of
at once); a connection gone quiet taken as dropped; a busy area tried again on a new
drop-in; and sending once every 2 s with only those on the globe there. Who's driving now:
Earth-centred metres to latitude, longitude and height (and back) against known points and three.js's
ellipsoid, to a millimetre; the dots (within 2 km together, greedily, at most 3, the mean rounded,
inside the area, on the area's side of 180°); a room's reports with its dots (a lone driver's at REPORT_MS though there's little
to report, then only with the room's own; a party's never; those on the globe not counted, paused
ones counted; a change within a minute; spread drivers as dots of their own; a lone one from another
area in the middle of this one; dots taken off as the room empties or `LIVE` goes off, and not
again for the budget; waking without reporting the same again; a failed report's dots going with
the next; the attachment still under 1 kB); `DriveLimits` on Node's own SQLite (one row a room,
shards at a spot as one area, none letting go, a party's and what isn't a dot kept nowhere, the
TTL, the 200 busiest of 260 with the total of all, each ask charged to the budget and `open:
false` once it's spent, a report that spends it deleting its row); `/api/online` on stand-ins
(kept 30 s whatever the query, DriveLimits not asked again within it, 20 asks at once as it runs
out asking once and the others answered with the last, kept nowhere, an ask that never comes back
given up on after 5 s, a failure `on: true` with nobody for 10 s, a spent day `on: false` and not
asked again, `LIVE` off asking nothing, another site's page 403); and the whole way round under `wrangler dev` (an area's driver in `/api/online`
where she dropped in, a party's and one on the globe never, the real Cache API keeping the answer
after she's gone, the TTL), with `on: false` from the Worker with `LIVE` off and once the budget's
spent. `npm run test:drive-worker`
checks `/api/config` asking (at most every 30 s, one at a time for 20 at once, and not again once
the day's spent, or when it's off; `liveReason: 'unknown'` when `DriveLimits` fails) on a stand-in
`DriveLimits`.

`npm run test:drive-live-ui` (`scripts/test-drive-live-ui.mjs`): two to four pages in Chromium on
the test pad, against the real Worker under `wrangler dev` behind Vite's proxy (the test pad has no
visit, so a dev-only seam in `main.js`, `window.worldDriveLiveTest = { visit }`, hands each page a
token made with Turnstile's test secret, and `online: { poll, idle }` makes who's driving now ask
and go idle sooner; the built site has no such seam). Two drivers at one spot
seeing each other; a ghost following (measured), boosting, parked, gone to the globe and back, in
another ride and paint; real leaderboard names with a supporter's ⭐ and an HTML name shown as text;
driving through a ghost; Go to; the horn and a trick's points; the nearby switch freeing what a
ghost was drawn with; the pickup's skinned body drawn at its ghost; forty new rides and looks in two
seconds building nothing; a hidden driver's states not piling up; Go to under a roof landing on the
ground. A party: the link, the banner and Join (the friend driving sending once every 2 s while the
other is on the globe, and told "... dropped in near you." after); a third driver at the same spot
seeing neither of the party but a fourth; a ninth member told it's full; a reload rejoining, with
no toast over the banner; a friend going elsewhere; leaving. A full area's next shard and a busy
one, saying so in its list and tried again at the next drop-in there; a dropped connection (the
test cuts the line between Vite and the Worker) coming back, and one gone quiet (the line passing
nothing and closing nothing) coming back within 40 s; another tab, after which none of it shows; a
visit running out; a phone, with the compact chip; the room following the car into another area;
only the page's own origin through the proxy; and the Worker restarted with `LIVE` off, an open
page stopping without a word and a new one showing none of it, both driving as ever. A page alone
in its room sends no states (as Playwright sees its frames go) and a second driver joining sees it
within 1.5 s; the following is measured at 5 a second, and that A sent at that rate. And the Worker
with a budget of 40, spent by connecting: a page turned away toasting once and showing none of it,
a party's link on a new page saying why, both driving as ever. Who's driving now: a driver dropping
in at Golden Gate Park in `/api/online` within 70 s (her room's first report), and on a
second page's globe, its **Driving now** saying "11 driving now." with the 5 busiest named after
their start spots (the test's own drivers parked at Times Square, Shibuya, the Arc de Triomphe and
the Strip), a party's driver (Monaco) and one with nearby off (Sydney) never; the first back on the
globe not counting herself while her room still does; the dots over North America (the Strip and
the park as one of 2 from far out, Shibuya's round the back, bigger for more, at least 32 px, never
two overlapping) and on a phone above the sheet; tapping the 2 flying down over them, unpinned, till
they're two; the pointer cursor over a dot, and a drag that starts on one spinning the globe; tapping the park's dot flying there with "1 driver here" on the card, and **Drive
here** dropping in to her room (as a pin, by where it is, shown as "Near Golden Gate Bridge") with
her ghost in sight, asking nothing while driving; back on the globe again with another driver in
her room in a dot of their own 3.8 km off, still not counting herself; a page asking every second
while touched (the seam), nothing once idle and at once at the next touch, nothing while the Garage
is open, and nothing more once its visit has run out; and with `LIVE` off or the budget spent, no
dots, no **Driving now**, and with `LIVE` off on a page loaded then, not even an ask.

## Levels

Driving earns **XP**, and XP climbs **50 levels**, each with something to unlock. About half of the
[Supporter Pass](#supporter-pass-content)'s Garage looks come with levels on the way to 40 (the pass
still gives them all at once), and some rewards only levels give, supporters included: titles for
your nametag, the level badge's frame and four colours. The pass's nine rides are never on the
track. The rules are `src/drive-app/levels.js`, which the page and the Worker both import, so the
page shows what the Worker counts.

### How XP is earned

| What | XP |
| --- | --- |
| Each km driven, on the ground or flying | 20 |
| Each second in the air off a jump (not flying) | 3 |
| Each drift boost paid out | 8 |
| Each boost pad driven over | 4 |
| Each minute driving with others in your room (someone else there and not on the globe) | 6 |
| The first drive in an area (live-protocol.js's `cellOf`, about 11 km across), once you've driven a km in it | 100 |
| Each start spot, the first time (driving within 300 m of it, 100 m into the drive) | 250 |
| The day's first drive (UTC days), once you've driven 250 m | 100, and 25 more for each day in a row before it, up to 200 from the fifth |
| A landed trick run | half the square root of the run's points (10,000 points is 50 XP, 40,000 is 100), 300 at most a run |
| With the Supporter Pass | everything ×1.5 |

A run is the leaderboard's (from dropping in until you change ride or place), so its later points
count for less and one huge combo can't be worth more than 300. The page counts each landed jump's
share (what the run's new points add) and reports it with the rest, every run alike, with a nickname
or without, whether the leaderboard takes the run or not. Driving is the steady part: a kart flat
out makes about 37 XP a minute, a car about 50, and driving about at some 72 km/h on average, with
some air, a drift boost and a pad now and then, about 46; a few landed runs add 10 or so. A new
area is worth a couple of minutes of driving, and takes a km of it, so hopping between drop-ins for
them doesn't beat driving by much.

### The curve

XP to the next level grows with each level (`100 + 100n + 0.9n^2.5` from level n, rounded to 50s
below 10 and 100s from there). Level 2 comes with the first drive's bonuses (the day's first drive
and a new area, or a start spot, a minute or two in), 5 in a first session, 10 in a few sessions,
30 for regulars and 50 a long goal. "About" is the play a regular takes, as the levels test
simulates one: 30 minutes a day of the driving above (46 XP a minute, and 10 of tricks), the day's
bonus each day, a start spot on each of the first 12 days, and two new areas a day for the first
10, then one. Someone who only cruises (about 39 XP a minute) takes about a third longer; a stunter
in the air a lot, about 40 % less.

| Level | XP | About |
| --- | --- | --- |
| 2 | 200 | the first couple of minutes |
| 3 | 500 | |
| 5 | 1,450 | a first session (about 17 minutes) |
| 10 | 6,050 | about 80 minutes |
| 20 | 29,250 | about 6½ hours |
| 30 | 82,050 | about 20 hours |
| 40 | 181,150 | about 45 hours |
| 50 | 346,450 | about 87 hours |

### The unlock track

⭐: a Supporter Pass look, which the pass unlocks at once; "levels only": the pass doesn't give it.

| Level | XP | Unlocks |
| --- | --- | --- |
| 1 | 0 | Title: Rookie; Steel badge |
| 2 | 200 | Sunburst paint ⭐ |
| 3 | 500 | Hearts boost ⭐ |
| 4 | 900 | Title: Joyrider |
| 5 | 1,450 | Lime paint ⭐ |
| 6 | 2,100 | White rims ⭐ |
| 7 | 2,900 | Plasma boost ⭐ |
| 8 | 3,800 | Title: Drifter |
| 9 | 4,850 | Racing stripes ⭐ |
| 10 | 6,050 | Bronze badge |
| 11 | 7,450 | Teal paint ⭐ |
| 12 | 9,050 | Title: Street Racer |
| 13 | 10,750 | Pixel boost ⭐ |
| 14 | 12,650 | Blue flame ⭐ |
| 15 | 14,850 | Title: Stunt Ace |
| 16 | 17,250 | Smoke trail ⭐ |
| 17 | 19,850 | Title: Speedster |
| 18 | 22,750 | Electric blue paint ⭐ |
| 19 | 25,850 | Title: Trickster |
| 20 | 29,250 | Silver badge |
| 21 | 32,950 | Red rims ⭐ |
| 22 | 36,950 | Title: Explorer |
| 23 | 41,250 | Glitter boost ⭐ |
| 24 | 45,950 | Title: Globetrotter |
| 25 | 50,950 | Copper paint (levels only) |
| 26 | 56,350 | Number decal ⭐ |
| 27 | 62,150 | Title: Road Warrior |
| 28 | 68,350 | Green flame ⭐ |
| 29 | 74,950 | Title: Sky Pilot |
| 30 | 82,050 | Gold badge |
| 31 | 89,550 | Matte finish ⭐ |
| 32 | 97,550 | Title: Daredevil |
| 33 | 106,050 | Title: Trailblazer |
| 34 | 115,050 | Violet paint ⭐ |
| 35 | 124,650 | Mint paint (levels only) |
| 36 | 134,750 | Title: Pathfinder |
| 37 | 145,450 | Blue rims ⭐ |
| 38 | 156,750 | Title: Storm Chaser |
| 39 | 168,650 | Title: High Flyer |
| 40 | 181,150 | Platinum badge; Purple flame ⭐ |
| 41 | 194,350 | Title: Thrill Seeker |
| 42 | 208,250 | Title: Wheel Wizard |
| 43 | 222,850 | Title: Night Owl |
| 44 | 238,150 | Title: Road Captain |
| 45 | 254,250 | Plum paint (levels only) |
| 46 | 271,050 | Title: Cartographer |
| 47 | 288,650 | Title: Supersonic |
| 48 | 307,050 | Title: World Tourer |
| 49 | 326,350 | Title: Icon |
| 50 | 346,450 | Title: Legend; Legend badge; Champion gold paint (levels only) |

That's 19 of the pass's 38 Garage looks (5 of its 9 colours, matte, stripes and a number, 3 of its
6 rim colours, 4 of its 9 boost styles, 3 of its 5 flame colours and the smoke trail; a colour
unlocked is a smoke colour too). The showiest stay the pass's alone: jet black, forest green, royal
blue and hot pink paint, metallic, flames and checker, gold, lime and pink rims, the lightning,
comet, neon rings, fireworks and ink boosts, pink and rainbow flames, and the sparkle and rainbow
ribbon trails. The four level-only colours are in `paint.js`'s `SWATCHES` with `levelOnly`.

### What the Supporter Pass gives

Every Garage look at once (the 19 on the track and the 19 that are the pass's alone), **+50% XP**,
and the nine rides, as before; and still a ⭐ and 30 drives a day
([below](#supporter-pass-buying-it)). Levels' own rewards (titles, badges, the level-only colours)
come with levels for everyone, supporters too. The ×1.5 is the Worker's: it looks up the pass of the
account the player is linked to, never anything the page says.

A supporter has the track's 19 pass looks already, so for them those levels bring nothing new:
18 of their level-ups from 2 to 39 (2, 3, 5, 6, 7, 9, 11, 13, 14, 16, 18, 21, 23, 26, 28, 31, 34
and 37). The page says so rather than "Unlocked": a level-up says "Already yours with the pass:
Sunburst paint", the profile card's "Next" is the next reward that's new to them, and the track
tags those looks "✓ Pass". What levels add for a supporter is the titles, the badges and the
level-only colours.

### What you see

- **Driving**: a slim XP bar under the place's name, with your level ("Lv 7") and, on a wider
  screen, "1,240 / 1,600 XP". Small pop-ups under it, batched every 10 s of driving: "+46 XP · 1.4
  km · 6 s air · 2 drift boosts", and at once for "New area +100 XP", "Furka Pass +250 XP", "Daily
  bonus +125 XP · 2 days in a row" and "+50 XP · tricks". On a phone the count goes and the pop-ups
  sit at the left, under the horn. Toasts while driving move down under them.
- **A level-up**: a burst of rays and "Level 7!", with "Unlocked: Plasma boost" (three at most, and
  "+6 more", when several levels came at once: the track has them all; a title says "Title:
  Drifter"). A look there opens the Garage (pausing the drive) to try it on. It goes after 5 s (10
  with the word on nicknames below), or stays while the pointer's on its buttons, and only its
  buttons catch clicks: it shows in the middle of a drive, under the bar and ending above where
  landed tricks' callouts start; on a touch screen at the left, clear of the buttons on the right
  (over the callouts a moment there: there's no room above them). One that comes on the globe shows
  as the next drive starts, and one showing goes as the drive pauses. The others see your new level
  by your name the next time the page says hello to a room (moving to another area's room, or
  connecting again): saying hello again for each level would have them see you leave and join.
  Without a nickname, the first says "Pick a nickname to save your progress", once (only where a
  nickname can be picked: a drive on Google's map).
- **The globe's panel**: a profile card under the search: your nickname (or "You"), the level badge
  (its ring steel, then bronze at 10, silver at 20, gold at 30, platinum at 40 and rainbow at 50),
  "Lv 9 · Drifter", the bar to the next level, "Next: Racing stripes at Lv 9", a **Title** picker
  ("Newest", the newest you have, or any one unlocked) and **All rewards**, the whole track: every
  level with its XP and rewards (each with its swatch, boost picture or tag), done, next or still to
  come.
  Without a nickname, "Your progress is kept in this browser. Pick a nickname to save it."
- **The Garage**: each locked choice says what unlocks it: "Lv 12 · or Pass" (a swatch, being
  small, only "Lv 12"), "Pass", or "Lv 25" for a level-only colour, with the whole sentence as its
  tooltip. Picking one the pass unlocks opens the pass's sheet; a level-only one says "Copper comes
  at level 25: you're level 3. Drive on!". Locks follow the level as it changes, and the ride being
  driven wears what's unlocked (`lookFor` puts back anything locked, a level not there yet or a look
  chosen on a test page, as it does without the pass).
- **The others**: the leaderboard's rows say each driver's level and title ("Lv 12 · Drifter", as
  they are now), and so do the nametags over the cars of those driving with you, small under the
  name.

### Saving it, and claiming it

- **With a nickname**, XP is kept with the leaderboard player in D1 (`players.xp`), so it's yours
  wherever that nickname is. A player linked to a Google account (signing in for the pass links the
  browser's player, `accounts.js`) shows the level of the account's best player: sign in on another
  device and pick a nickname there, and it shows the account's level until its own XP passes it.
  (Each player's XP is its own, and the caps below are each player's: an account's players added up
  would let several players' caps add up too.) The page reports what it drove every 2 minutes while
  driving, as it pauses, as it goes back to the globe, and as the page goes (`pagehide`, with
  `fetch( ..., { keepalive: true } )`: `navigator.sendBeacon` can't send JSON with the right
  Content-Type). What hasn't been reported is kept in the browser (`world-drive.progress`), and so
  is the report on its way until its answer comes: each has an id, so one whose answer never came
  (the page went, or the connection dropped) goes again as it was, and the Worker counts it once. A
  reload or a report that didn't get through loses nothing. While a report is on its way, what it
  carries still shows, and its places and the day's bonus aren't said again.
- **Before a nickname**, it's kept in this browser and shown all the same (level-ups, unlocks and
  all), with everything driven totted up. Picking a nickname claims it: the new player's first
  report carries all of it, with the days' bonuses counted in this browser and the streak they
  made, and the Worker counts it as any report, with an hour's worth allowed however long the visit
  has lasted (an hour of the caps is several hours of real driving), the days' bonuses up to 14
  days' worth, and their streak carried on if its last day was today or yesterday. It goes once the
  new player is linked to the account signed in here, if there is one, so a supporter's claim counts
  ×1.5. The Worker's XP then replaces the browser's.
- **Without a Worker** (the dev server alone) it's only ever this browser's, and nothing asks for a
  nickname. A drive with a nickname but no visit (the test pad) keeps what it drove for the next
  report a visit can make.

### Reports, and how cheating is limited

`POST /api/progress { id, secret, visit, report }` (`worker/drive/progress.js`), with the visit's
token as scores are posted (`visits.js`'s `readVisit`) and the player's secret. The report is what
was driven since the last: `{ id, km, air, drifts, pads, together, tricks, areas: [ cellOf names ],
spots: [ SPOTS ids ], daily, days? }`: id the page's own for the report (8 to 40 letters, digits,
`_` or `-`), tricks the landed runs' XP, and only in a claim, days `{ xp, streak, day }`, the days'
bonuses counted in the browser before the nickname. Anything the page couldn't send (a negative or
non-number amount, a count that isn't whole, an area that isn't one, a spot that isn't one, over 200
of either, an id or days that aren't) is a 400; a forged, changed, expired or another player's
visit a 403 (`reason: 'visit'`), the wrong secret a 403 (`reason: 'player'`). The answer: `{ xp,
own, level, gained, unlocked: [ rewards ], supporter, title, chosen, streakDay, streak, accepted: {
areas, spots }, daily?: { streak, xp }, repeated? }`: xp and level the account's best (or the
player's), own the player's own XP, title the one shown and chosen the one picked (`''` for the
newest), streakDay and streak the last daily bonus's day and its days in a row. A report with
nothing in it changes nothing, and is how the page asks where it stands as it starts.

The page says what it drove, so the Worker can't know it's true. What it does is keep each report to
what could have been driven in the real time since the player's last (`progress_at`, kept in D1;
for a player's first report, the claim, an hour):

| Cap | |
| --- | --- |
| Time counted | 5 minutes at most per report (an hour for the first, the claim) |
| km | 450 km/h of it: faster than any ride goes flat out with the booster (the night cruiser's 205, doubled), flying or not |
| Air | a second a second |
| Drift boosts, pads | one every 1.5 s, one every 2 s |
| Minutes with others | a minute a minute |
| All the driving together | 300 XP a minute (km, air, drift boosts, pads and minutes together), which no driving comes near |
| New areas and spots | one a minute of it (whole ones: a report sooner carries none); those over the cap aren't taken (`accepted` says which were) and the page sends them again with the next |
| Areas and spots | each once a player (the `discoveries` table), 2,000 at most a player |
| The day's bonus | once a UTC day; the streak counts days in a row, back to 1 after a day off |
| Trick XP | 150 a minute (what doesn't fit isn't counted) |
| The claim's days' bonuses | 14 days' worth of the biggest at most (2,800 XP), only in the claim |
| Reports | none with anything in it sooner than 30 s after the last (each is a row written: a 429 with Retry-After, and the page keeps it for later); 10 a minute a player in all (`PROGRESS_POSTS`, Cloudflare's rate limiter, as `LIVE_CONNECTS`: 429 with Retry-After) |
| One visit, one player | as for scores: a visit reports for the player that first used it |

Two reports at once can't both count the same minutes: each is claimed with one statement against
the last report's time, and the second is a 409 (the page sends it again); its places are written
only with that statement (`changes()`), so they aren't kept without their XP. A report with the id
of the last one taken is that one sent again: it's answered with where the player stands
(`repeated: true`) and counts nothing. Titles are checked the same way: `POST /api/player/title {
id, secret, title }` takes only a title the player's level has (403 `reason: 'title'` otherwise),
and `''` is the newest they have (`{ level, title, chosen }`).

What this can't stop is someone who reads the page's code and reports the most the caps allow from
a real visit, every minute it lasts: about ten times as fast as driving does (300 XP a minute of
driving, 150 of tricks and a new area's 100), so level 30 in under three hours of a script running
rather than a regular's 20 hours of driving. A new player's claim counts an hour of that at once
(about 37,000 XP, level 22), and no more however old the visit; an account shows its best player,
so several players can't add up their caps. The Garage's unlocks are in the page anyway (as the
pass's are, see [Known gaps](#known-gaps)); what the Worker keeps (the level and title others see)
is what the caps are for, and the console below sets it right.

### What levels cost

Reports ask no Durable Object: they don't touch `DriveLimits` (the free plan's 100,000 a day are for
the visit caps and driving with others), and the rate limiter is Cloudflare's, as `LIVE_CONNECTS`
is. A level reached says nothing to a room. A title picked while driving with others does say hello
to the room again, as renaming does: about 3 Durable Object requests (the Worker's ask of
`DriveLimits`, the connection, and the old one's leave), counted in the day's
[budget](#the-days-budget) and held by `LIVE_CONNECTS` and `LIVE_VISIT_CONNECTS`. Scores cost what
they did: trick XP comes with the reports.

Each report is one Worker request and, in D1 ([pricing](https://developers.cloudflare.com/d1/platform/pricing/),
read 1 November 2026: Free 5 million rows read and 100,000 rows written a day; Paid 25 billion read
and 50 million written a month included; "Indexes will add an additional written row when writes
include the indexed column"):

| | Rows read | Rows written |
| --- | --- | --- |
| A report | about 8 (the player, their account's players, whether it has the pass, the visit, the places the time since the last lets it take: 5 at most after the claim) | 1 (the player's row: no indexed column changes), and 1 for each new area or spot (`discoveries` has no rowid, so its key is the table) |
| A visit's first report | the same | 2 more (the visit's row and its index) |
| An empty report (the page starting) | about 6 | none |

At a report every 2 minutes, an hour's drive is 30 reports: about 240 rows read and 30 to 40
written. The day's 300 visits at 20 minutes each (100 driver-hours) are about 3,000 reports: some
24,000 rows read (half a per cent of the Free plan's) and 3,000 to 5,000 written (3 to 5 %), and
3,000 Worker requests of the Free plan's 100,000. A script can't make a report read much more:
listing 200 places, only those the time allows are looked up; and with a report no sooner than 30 s
after the last, a player writes at most 2 rows a minute (2,880 a day), and a row for each new place
(2,000 at most a player, ever). The leaderboard's rows now look up each player's account's best XP as a board is made (a
look in `players_by_account` a row), and boards are cached for half a minute as before. Storage: a
few numbers a player, and a 30-byte row a discovery (2,000 at most a player).

### Looking after levels

In the D1 console (as for [the leaderboard](#looking-after-it)):

```sql
-- The players climbing fastest: XP, level's worth, since when.
SELECT id, name, xp, discoveries, datetime( created_at / 1000, 'unixepoch' ) AS joined FROM players ORDER BY xp DESC LIMIT 20;

-- Set a cheat's XP back (or to 0), and forget their discoveries so they're earned again.
UPDATE players SET xp = 0, title = '', discoveries = 0 WHERE id = 'PLAYER_ID';
DELETE FROM discoveries WHERE player_id = 'PLAYER_ID';
```

Removing a player removes their discoveries with them.

### How levels are tested

`npm run test:drive-levels` (`scripts/test-drive-levels.mjs`): the curve as a simulated regular
climbs it (printing the play to levels 2, 5, 10, 30 and 50) and the track as written (every level
from 2 to 50 gives something, level 2 within the first drive's bonuses, the pass's rides never on
it, 19 of its 38 looks on it by level 40 and the showiest not, every look a choice the Garage has,
the level-only colours never with the pass, the Garage's locks, a supporter's "Next"), reports'
shapes and caps, and that progress.js asks no Durable Object; then the Worker under `wrangler dev`:
a report's XP and its answer, every cap by the time since the last (a minute's worth, half a
minute's, an hour later only five minutes', one sooner than 30 s after the last a 429), the claim
(an hour's worth, and no more from a visit nearly six hours old), the days' bonuses a claim brings
and their streak, a report sent again with its id counted once, forged, changed, expired and
someone else's visits, the wrong secret and reports it can't take, areas and spots only once
(those over the cap taken by the next report, 2,000 at most, and none kept by a report that lost
to another at the same moment), the day's bonus once a UTC day and its streak across midnight and
after a day off, trick XP in reports (the 150 a minute, and none with a score), a supporter's ×1.5
(signed in with test keys standing in for Google's, an email in `SUPPORTER_EMAILS`, both players
linked), an account's players not adding up (three claims linked to one account show the best),
titles (locked ones refused, the one picked in each answer, on the leaderboard's rows), the rate
limiter (the 11th report in a minute a 429), and discoveries going with a removed player.
`npm run test:drive-levels-ui` (`scripts/test-drive-levels-ui.mjs`): the page on the test pad, with
the real Worker behind Vite's proxy (a dev-only seam in `main.js`, `window.worldDriveVisitTest = {
visit }`, hands it a visit's token, as the live tests' does): driving fills the bar with its pop-ups
(the start spot, a new area, the day's bonus, the km); the level-up's burst with its reward and
"Pick a nickname", its look opening the Garage where it's unlocked, worn and pressed; a milestone's
level-up with its badge reward drawn small, and a long one listing three and "+6 more", clear of the
trick callouts; the Garage's chips and what picking a locked one does; the progress kept in the
browser, across a reload, then claimed by a nickname (the Worker's XP within a rounding of the
page's, the day's bonus as days); the profile card and the track; a title picked ("Newest" when
none is), on the leaderboard and over the car on another page driving with it; a report on its way
for a second and a half (the day's bonus and the new area said once, what's shown never going
down), one whose answer was lost sent again with its id after a reload and counted once, and 250
areas sent 200 at a time; with the pass, everything unlocked but the level-only colours, the track
and a level-up saying the pass looks are theirs already, and a supporter's report earning ×1.5; a
phone (the bar clear of the speed, the level-up clear of the buttons); and no Worker at all. Pictures
of the bar, level-ups, the profile card, the track and the Garage's locks at 1280 × 720 and on a 375
× 740 touch screen with `TEST_SCREENSHOTS`.

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
and four built in code, each with its picture; every Garage look at once, which levels otherwise
unlock some of over time; +50% XP; a ⭐ by your name on the leaderboard, 30 drives a day instead of
8) and its buy
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
| Hovercraft | 4.2 × 2.1 m | 135 km/h | No wheels: it floats 16 cm up on its skirt, over [water](#water) too (where the others splash), throwing up spray there; slides wide through every turn (about 50° at 50 km/h, under 10° for the others), glides on and stops slowly, and bounces on its cushion |

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

Look at a new car in the Garage and from its driver's seat (C) to check which way it faces: by its
seat, steering wheel, lamps and exhaust. The dune buggy was first imported back to front, so it
drove tail first (its wider axle is the rear one, not the front). It was turned round in its file
rather than imported again: each part's node turned 180° about y, the wheels renamed front for rear
and left for right (the new front pair steering), `cars.json`'s wheels to match, and its picture
drawn again. Its one seat is in the middle, so its driver's-seat camera is too. Imported again from
Sketchfab, it needs `--front` to name the side its seat, steering wheel and lamps face in the
downloaded model (the opposite of the side first used), or it comes back tail first; the car checks
in `test-drive-pro-ui.mjs` would say so (its steering pair must be the narrower axle).

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

| | Free | With the pass, or a [level](#the-unlock-track) | With the pass | With a level only |
| --- | --- | --- | --- | --- |
| Body colour | Blaze orange, racing red, ice white | Sunburst (2), lime (5), teal (11), electric blue (18), violet (34) | Jet black, forest green, royal blue, hot pink | Copper (25), mint (35), plum (45), champion gold (50) |
| Finish | Gloss | Matte (31) | Metallic | |
| Decal | None | Racing stripes (9), a number, 0 to 99 (26) | Flames, checker | |
| Rims (a hovercraft's trim) | Silver, graphite | White (6), red (21), blue (37) | Gold, lime, pink | |
| Boost style | Classic flame, bubbles, confetti | Hearts (3), plasma (7), pixel (13), glitter (23) | Lightning, comet, neon rings, fireworks, ink | |
| Flame colour (the classic flame's) | Orange | Blue (14), green (28), purple (40) | Pink, rainbow | |
| Trail (boosting or flying) | None | Smoke (16; its colours as the body colours unlock) | Sparkle, rainbow ribbon (six bands side by side) | |

**Boost styles** (`src/drive-boosts.js`; the Garage's list, with a little picture for each, is
`src/drive-app/boosts.js`) are what the booster leaves behind:

| Style | | As it lights ([more](#how-boosting-and-driving-look)) |
| --- | --- | --- |
| Classic flame | The flame as it always was, in its colour | The flame popping, a flash and a ring in its glow's colour |
| Bubbles | Soap bubbles floating up and wobbling away, each popping at the end | A froth of big bubbles blown out round the exhaust |
| Confetti | Paper rectangles in party colours, tumbling over and over as they flutter down behind | A party popper: a cone of confetti shot up and out |
| Plasma | A blue-white electric flame crackling with little arcs, throwing blue sparks | Arcs crackling out all round the exhaust at once, and a spray of sparks |
| Lightning | Forked bolts crackling back and out from the exhaust, struck again every few hundredths of a second | A strike: four long forks thrown out behind and to both sides, each with a flash |
| Glitter | A stream of tiny twinkling stars in white, gold, pink, sky and lilac | A puff of stars bursting out every way |
| Comet | A throbbing white-blue head and a long glowing tail that narrows and turns blue behind it | Its head flaring up, and a shower of specks |
| Neon rings | Glowing hoops thrown out flat across the way it's going, so the camera looks through them | Three hoops at once, one inside the next |
| Fireworks | Little rockets bursting over it into balls of sparks in one colour, which fall and twinkle out | A starburst at the exhaust and a salvo of three rockets bursting just over it |
| Hearts | Hearts rising and swaying away, beating as they go | A ring of hearts thrown out round the exhaust, then rising |
| Pixel | Chunky squares in a bright palette on a grid in the world, shrinking in steps and blinking out | An old game's explosion: pixels thrown out eight ways in rings, white-hot inside |
| Ink | Blobs of bright paint flung out behind, leaving splats on the road for five seconds, drawn out longer the faster it goes | A big splash of blobs in a fan, and a few splats on the road at once |

The flame colour was the Garage's only boost choice before the styles. It's now the classic flame's
colour, shown under it, so a look saved before (a flame and no style) is the classic flame in the
colour it had; without the pass (or the level) a saved style is the classic flame again, as anything
else locked goes back to its free choice.

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
against each other, the hovercraft hovering with no wheels and riding over the test pad's sea
(spray behind it there only, no boost pads on it) where the coupe splashes, the monster truck over
a car, the
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
landing, going supersonic, its wheels spinning and the front ones steering the right way, its size
as imported, and their handling against each other (the night cruiser fastest, the neon racer
quickest to 100, the dune buggy thrown highest, the farm truck slowest); the Garage repainting the
muscle car (colour, rims, decals) and saying the others keep their paint, with only a boost and
trail to pick.

## Supporter Pass (buying it)

The pass is one payment of **CA$4.99**, no subscription, through a Stripe Payment Link in World
Drive's own Stripe account. It comes with what's [above](#supporter-pass-content) (five cars, the four
rides and every Garage look at once), **+50% XP** for [levels](#levels), a **⭐ by your name on the
leaderboard**, and **30 drives a day** instead of 8.
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

Driving with others costs nothing at Google; its rooms are Cloudflare's Durable Objects, with
[costs of their own](#what-it-costs).

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
  Each row says the driver's [level and title](#levels) as they are now ("Lv 12 · Drifter").
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
| `LIVE` | `on` | [Driving with others](#switching-it-off); `off` switches it off |
| `LIVE_DAILY_BUDGET` | 40000 | [The Durable Object requests a day](#the-days-budget) driving with others may use; 0 is off |

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
| `LIVE_PARTY_MAX`, `LIVE_NEARBY_MAX` | 8, 20 | The most in a party, and in each of an area's rooms |

Two rate limiters are `ratelimits` in `wrangler.drive.jsonc` (Cloudflare's, which cost no Durable
Object request): `LIVE_CONNECTS` (each visit's connections to rooms, 20 a minute) and
`PROGRESS_POSTS` (each player's [level](#levels) reports and title changes, 10 a minute).

The leaderboard's, levels' and the Supporter Pass's database is the `DB` binding in
`wrangler.drive.jsonc` (D1 **world-drive**, already made); its tables are `worker/drive/migrations`
(`0003_levels.sql` levels': XP and the rest on `players`, and `discoveries`).

## Deploying

`npm run deploy:drive` applies the database's migrations to the world-drive database (`wrangler d1
migrations apply DB --remote -c wrangler.drive.jsonc`; ones already applied are skipped, and
`0003_levels.sql` adds levels' columns and table before the Worker that needs them goes out), builds the
site into `dist-drive/` and deploys the `world-drive` Worker with it (`vite build --config
vite.drive.config.js && wrangler deploy -c wrangler.drive.jsonc`). The Worker only runs for
`/api/*`; every other file is served straight from Cloudflare's assets. The Durable Objects'
classes are `migrations` in `wrangler.drive.jsonc`, which `wrangler deploy` applies itself: `v1`
the visit counts' `DriveLimits`, `v2` the rooms' `DriveRoom` (both on SQLite storage, which the
Free plan needs).

A deploy that changes what the Worker asks `DriveLimits` (as the first with driving with others
did: `liveOpen` and `liveSpent`) needs nothing special. Durable Objects keep an active object's code
for up to 5 minutes after a deploy by default (until it hibernates), so for those minutes the new
Worker can ask the old `DriveLimits` for something it hasn't got. Visits and scores carry on (their
calls are the same in both), `/api/config` answers `live: false` with `liveReason: 'unknown'`, and a
page loaded then makes driving with others anyway and is turned away at the door (503) until
`DriveLimits` runs the new code; it tries again as after a dropped connection, so it's in a room a
few minutes later at most. `npx wrangler deploy -c wrangler.drive.jsonc
--durable-objects-code-update-mode immediate` (after `npm run build:drive` and the migrations)
skips the wait, at the cost of dropping everyone's connection to their room for a moment.

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
- [Driving with others](#driving-with-others) needs the Worker (`DRIVE_API`: Vite's proxy passes its
  WebSockets on, and the browser's Origin with them, which `wrangler dev` takes as its own) and a
  visit's token, so a drive on Google's map. The test pad has no visit: the tests hand the page one
  through a seam only the dev server has (`window.worldDriveLiveTest = { visit }` before the page
  loads, see `scripts/test-drive-live-ui.mjs`). `window.worldDriveVisitTest = { visit }` hands the
  test pad a visit for everything a visit does (names, scores, [levels](#levels)' reports and
  driving with others), as `scripts/test-drive-levels-ui.mjs` does.
- In the browser console, `window.drive` has the scene, the globe, the driver and `dropIn( { name,
  lat, lon } )`, levels' `progress` (`progress.level`, `progress.progress`, what's `unsent` and the
  report on its way, `flying`) and
  `profile`, and with driving with others on, `live`, `ghosts` and `friends`.

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
recycled, and the pause menu's switch kept across a reload), water (the test pad's sea given one
even sea colour, as Google draws water: off its edge at speed, off a ramp with a spin and a ×3
combo lost, slowly down a beach into it, each a splash, sinking nose first with the camera holding
on it and the view fading, then back on the dry ground it came from facing away; flying over it
until coming down, R in it and by it, and boost pads never on it or by it; Google's other water
colours, a bluish lawn among ball fields and a lagoon's turquoise; a canal's water by its wall
never taken for dry; slowly off a quay, a splash right by it; never the same splash twice; the way
back past a spot level with the water and kept across a pause), the open sea and the big lakes (the
pad lowered under the water's surface, as Google draws the bed: started on the sea's surface or Lake
Baikal's, ridden on, flown over and come down on, a floating ride's spray, a splash off an island
and back on it; 14 m under the sea, on Google's water as before; the Dead Sea's shore, land, never;
the map's sea, coasts, lakes and land; land walled off from the sea by ground over it, the side
of the Assal depression, never; Lake Erie's surface gone out over land to Niagara's gorge and back
by the lake; without the map, only the deep sea), the used-up,
robot-check and getting-ready screens, and the leaderboard with its answers made in the test: tabs, your own row, picking a name and renaming, a
landed jump posting the run with the card asking first, each place's best posted, a dead connection
changing nothing, and a phone; and buying the pass with Google's script stood in for: signing in
from the sheet, the pause menu and the used-up screen, Buy's link, "Check again" before Stripe's
word, unlocking on focus and on `?supporter=thanks`, on every load, signing out, the player linked,
the ⭐, and "Coming soon" with no sign-in or no Worker answering). `npm run test:drive-pro-ui` tries
the pass's rides, the Garage and the boost styles, `npm run test:drive-live` and
`npm run test:drive-live-ui` [driving with others](#how-its-tested), and `npm run test:drive-levels`
and `npm run test:drive-levels-ui` [levels](#how-levels-are-tested).

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
src/drive-app/screen-fx.js   what's done to the view: speed lines, overdrive's white edges, the pause
                             menu's Camera effects switch and asking for less motion
src/drive-app/water.js       water on Google's mesh, told by how it's drawn: for splashes, the way
                             back from one, R and boost pads
src/drive-app/sea.js         the open sea: its surface where Google draws only the bed of the sea
                             or a big lake, round the vehicle while it's by that water, the sea's
                             height (EGM96, drive/public/sea/egm96.bin, which
                             scripts/make-sea-level.mjs makes) and where the sea and the big lakes
                             are (Natural Earth's, drive/public/sea/mask.bin, which
                             scripts/make-sea-mask.mjs makes)
src/drive-app/lakes.js       the big lakes whose beds Google may draw: their surfaces' heights,
                             with sources, and their outlines' names in Natural Earth
src/drive-app/api.js         /api/config, the visit with Turnstile, /api/search, the leaderboard's and
                             the Supporter Pass's calls
src/drive-app/leaderboard.js the leaderboard: the panel, names, posting runs, the new-best card
src/drive-app/levels.js      levels' rules, which the page and the Worker share: XP, the curve, the
                             caps and the unlock track
src/drive-app/progress.js    levels in the page: counting what's driven, reporting it (or keeping it
                             here before a nickname), the level the Garage's locks follow
src/drive-app/profile.js     what levels show: the XP bar and pop-ups, a level-up, the profile card,
                             the whole track (levels.css)
src/drive-app/live-protocol.js  driving with others: the rooms, messages, limits and checks the page
                             and the Worker share, and who's driving now's dots (where, how many)
src/drive-app/live.js        the page's connection to its room: which room, sending the car, what
                             the room says
src/drive-app/ghosts.js      the others' cars, their name tags and effects
src/drive-app/friends.js     the chip and list, Drive with friends, the party's banner and toasts,
                             the horn
src/drive-app/online.js      who's driving now on the globe: /api/online, the dots, Driving now
src/drive-app/screens.js     start screen, notices, loading card, pause, keys, messages
src/drive-app/test-globe.js  the Earth without Google's tiles, for working without a key
vite.drive.config.js         the build: no key, only the offered vehicles copied from public/, and
                             drive/public/ (the cars) as its own public folder; in dev, /api passed
                             on to DRIVE_API, WebSockets too
drive/public/cars/           the cars' models, pictures, cars.json and CREDITS.md
scripts/add-drive-car.mjs    imports a car from Sketchfab into it; drive-car-thumbs.mjs draws the pictures
worker/drive/                the Worker: index.js (routes), limits.js (caps, the search queue and
                             the leaderboard's turns), turnstile.js, search.js; the leaderboard:
                             players.js, scores.js, boards.js, names.js (rules and the filter),
                             visits.js (visit tokens); the Supporter Pass: accounts.js (sign-in,
                             sessions, /api/me), supporter.js (the webhook, who has it); driving
                             with others: live.js (/api/live and the rooms, DriveRoom, and
                             /api/online, who's driving now); levels: progress.js
                             (/api/progress, titles); migrations/ (its D1 tables)
worker/google.js, sessions.js, stripe.js   shared with the construction app: Google's ID tokens,
                             the session cookie, Stripe's webhook signatures
wrangler.drive.jsonc         the Worker's settings, domains, Durable Objects (the visit counts and
                             the rooms), rate limiters and D1 database
```

The driving and its effects are shared with the construction app, World Drive's only with its
options on: `src/drive.js` (the Driver; its feel, `BODY`, `SPIN` and the jolts, only with the
booster, drifts or stunts), `src/drive-fx.js` (the flame, smoke, sparks and the rest),
`src/drive-boosts.js` (the boost styles, each one's ignition, overdrive), `src/drive-bursts.js` (the
bursts of each moment) and `src/drive-hud.js` (the HUD, its gauge pulsing and flashing).

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
- Where Google draws the bed of the sea or a lake and the drop-in doesn't take it for
  [open water](#the-open-sea), it starts on that bed, as it always did: the sea less than 15 m under
  its height (a bank), a big lake's shallow water (its bed less than 15 m under the table's height:
  off Chicago, at 41.9° N, 87.45° W, Google draws Lake Michigan's bed 10.5 m under it, 8 to 9 m
  under its own photographed water by Navy Pier, and so in Lake Erie's shallow western basin, 7 m
  deep on average), a bed with ground more than 15 m over the water within 150 m of it
  ([walled off](#the-open-sea): by a cliff, or an island's steep shore), the water within a square
  of the map (up to about 5 km) of a big lake's shore or its islands, a lake that isn't in
  [the table](#the-big-lakes), and the shelf and the lakes if the map didn't load. water.js tells
  that bed from dry ground by how it's drawn, as it does Google's water, and the bed under the
  water's picture is mostly the water's colour, level close by and the lowest round about, so mostly
  water to it (Santa Monica Bay's was, 184 m down, and Baikal's), and you ride on it until you've
  been on dry ground; but not always (20 km off Waikiki, 578 m down, it was dry ground), and dry
  ground is where the way back from a later splash puts you, back on the bed. Close in, by a coast,
  it's mostly Google's own water, at the water's height. The other way, land more than 15 m under
  the sea in a coast's square with nothing over the sea's height within 150 m of it (the middle of a
  wide pit dug by a coast) would still start on the sea's surface.
- The open water's surface is EGM96's at a degree, a metre or a few from a coast's own water: 1 m
  under it off Kona (by round volcanic islands up to 9.5 m low, below Kilauea on the Big Island's
  south coast), so driving from the open sea to that coast is a step up onto Google's water; 1 m
  over it by Santa Monica Pier, so there it covers Google's water and the lowest of the beach. A big
  lake's is its height in the table that far over EGM96's, and where Google draws a lake's surface
  it was 0.6 to 7.8 m from that (the Caspian's 35 m over it), within the 15 m that keeps such a
  surface from being taken for a bed; so by a lake's shore its water and Google's may be a step of a
  few metres apart (how they meet wasn't tried). Within reach of its water (till there are two of
  the map's squares between the vehicle's and the nearest of the sea's and its coasts', or of the
  lake's own: 7 to 14 km), any ground under the water's surface is under the disc too: by the sea, a
  polder behind its dyke (New Orleans' lowest streets, 2 m under the sea, two squares from the
  coast's; the Haarlemmermeer, three squares from it, is out of reach); by a lake, the river out of
  it below the outlet (the Niagara above the falls) or a lower lake (Lake Huron, 7.5 m under
  Superior) while the vehicle is still within reach of the lake. Out of reach the disc is gone, from
  under the vehicle too if it's riding on it there (down a river from the lake, say), which then
  comes down onto whatever is below. Coming back within reach, it's back only once the vehicle is
  half a metre over the water's height, so a vehicle coming back along Google's own water at about
  the lake's height has none till it's on the shore. And it's one deep blue, whatever Google's
  pictures of the water round it are (by Kona, dark navy).
- [Water](#water) is told by how Google draws it, which isn't always the same: it misses water
  that's photographed rather than filled (a fountain lake, Geneva's clear lake, a lagoon; a big
  lake's surface drawn from cloud-flecked pictures, Lake Tanganyika's, Lake Malawi's, the Dead
  Sea's), busy with boats and wakes (Venice's Grand Canal), in a narrow canal (Amsterdam's,
  Venice's: the rings reach the banks), in a bridge's shadow, at a seam between sharper and coarser
  tiles, where it slopes on a coarse tile (surf, parts of Hong Kong's harbour), and teal or olive
  grey water within 35 m of a bank or a moored boat; and within about 12 m of a shore, a pier or a
  ship it can't tell water from an even grey square, so there you ride on it (a kart dropped between
  a jetty and the ship moored at it floated), unless you came down into it. Out from there, it
  splashes. Where it can't tell it never puts boost pads down nor takes you back there, but surf's
  foam is bright, so it's taken for dry ground: pads can go down on a wide band of surf, and the way
  back from the sea off a beach can be in the surf.
- [Driving with others](#driving-with-others): each page says where its own car is, and the room
  only checks it's somewhere a car could be (on Earth, at a speed a ride can go), so someone who
  digs into the page can put their ghost anywhere; it can't touch anyone, as nothing collides. A car
  on a poor connection lags or jumps (a state carries the room's time, not the sender's, so the
  way up from a phone shows in how a ghost moves). **Hide** goes by name, so two guests who happen
  to have the same one (1 in 10,000) are hidden together. It switches itself off for the rest of
  the UTC day once it has spent [its budget](#the-days-budget) (by default about 40 driver-hours
  with others), so on a busy day it ends early for everyone; its count of what it has spent runs a
  minute behind (up to 10 for quiet rooms). One connection can still send at the room's limit, 20
  messages a second (four times what a page sends), for its visit's six hours: about 3,600 billed
  requests an hour, which nothing but the day's budget stops.
- [Who's driving now](#on-the-globe-whos-driving-now) is a minute behind (a room says what's
  changed at its next report, and an answer is kept 30 s), and a room that went without a word (a
  restart) shows its last dots for up to 12 minutes. A page alone in its room sends no states, so its
  room only knows where its driver dropped in (or, if they drove in from another area, the middle of
  it): a dot for a lone driver who has driven off can be several kilometres from them, though in
  their area, so dropping in on it still puts you in their room. And as for ghosts, a page that's
  been dug into can put its dot anywhere in its area: one dot a visit, as a visit is in one room.
  Areas are 0.1° columns from 180° W, so each band's last column, just west of 180°, is whatever is
  left over, and in about 150 bands that's under 0.014° wide: no spot to 0.01° fits 0.002° inside
  it, so a dot there is drawn in the column before, and Drive here on it joins that column's room
  (open ocean, Antarctica, Chukotka and a few Fiji and Aleutian bands).
- [Levels](#levels): the page says what it drove, so a script reporting the most the caps allow
  from a real visit levels about ten times as fast as driving, and a new player's claim counts an
  hour of that at once; the Garage's unlocks are in the page, as the pass's are. Each device's
  nickname is a player of its own: signed in, an account shows its best player's level, but a new
  device still picks a nickname of its own and its XP is its own. Others in a room see a new level
  at the page's next hello there, not as it comes. A report whose answer was lost is counted once
  only while it's the player's last (another device reporting in between would let it count again),
  and if it listed more new places than its time allowed, the extra ones aren't sent again. A
  nickname removed by the owner takes its XP with it.
- [How boosting and driving look](#how-boosting-and-driving-look): the lean tilts the whole model,
  wheels and all, about the low side's axle, so on a steep lean a wheel on the other side lifts a
  few centimetres off the road (a kart, which has no suspension, leans as a car would). The bursts
  fade out down to a flat plane under the vehicle, so where the ground isn't flat round it (a kerb,
  a crest) one can still meet the ground along a line, and in the air they don't fade at all. The jolts
  move the view (the look, never the camera, so a jolt can't put it in a wall), and a jolt from the
  booster lighting right after a hit's shake adds to it. Others' cars show only what their flags
  say: no boost pad bursts or wheelspin, and a booster already lit when their car comes into view
  shows no ignition.

## Credits

The 3D world is Google's: the Google Maps logo and the data providers show whenever the tiles are on
screen. The open sea's height is NGA's EGM96 geoid (public domain), from PROJ's copy of it, and
where the sea and the big lakes are is Natural Earth's ocean and lakes at 1:10 million (public
domain, naturalearthdata.com), from its GitHub copy. Place search © OpenStreetMap contributors. The
trucks and the cars are models from Sketchfab under CC BY 4.0, credited under **About World Drive**
and on the ride picker (and the cars in `drive/public/cars/CREDITS.md`); the go-kart and the pass's
rides are built in code.
