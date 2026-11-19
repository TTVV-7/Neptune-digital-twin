# World Drive (worlddrive.app)

World Drive is the second app in this repository: pick anywhere on Earth from a globe of Google's
photorealistic 3D tiles, drop in and drive the real world, arcade style; or switch the globe to
[the Moon](#the-moon) and drive that. It shares `src/` with the
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
   says where it is, with **Drive here**. A link to a place does the same once the visit has started:
   a [place's page](#search-engines)'s **Drive here** (`/?spot=monaco`, or
   `/?at=48.86,2.2945&name=Eiffel%20Tower` for anywhere), and so does a tap on one of the places
   listed at the foot of the panel (each a link to its page, which a middle-click or "open in new
   tab" still opens: a plain tap stays in the game, as leaving it would end the visit).
3. **Your ride**: the pickup to start with, or the go-kart or the muscle car; six more [cars](#world-drives-cars) as
   your [level](#levels) climbs (a golf cart at level 5, a tuk-tuk at 8, an ice-cream van at 15, a
   lawn tractor at 22, a retro wedge at 30 and a formula racer at 40); or with the
   [Supporter Pass](#supporter-pass-content) those six at once, seven cars of its own (a neon racer, a
   night cruiser, a dune buggy, a farm truck, a police cruiser, a hypercar and a cyber muscle car) and
   four rides built for it (a sports coupe, a monster truck, a city bus and a hovercraft). They're in
   three rows that scroll sideways. A locked one says what it needs ("Lv 8 · or Pass", or the pass's
   badge); picked, a level's says which level you're at, and the pass's opens its sheet. The choice
   is remembered; until one is picked (and while the one picked is locked) it's the pickup, or the
   go-kart on a site without the pickup's model (it's the library's, `vehicles.js`). Should the
   picked ride's model not load (the pickup's is 2.8 MB), the drop-in goes on in the go-kart, which
   is drawn in code and can't fail to, with a word saying so. **Garage**, under the rides, paints them.
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
6. **Challenges** (under **Earth | Moon** on the panel, and in the pause menu): a daily, a weekly
   and a monthly one on each world, a checkpoint sprint, a hunt for stars or a drive to a landmark
   against the clock, each with its own board ([Challenges](#challenges)).

### Keys

| Key | What it does |
| --- | --- |
| W / S | Gas; brake, and reverse once stopped |
| A / D | Steer |
| Space | Drift: hold it and steer round a bend, let go for a mini-turbo; tap it to hop |
| Shift (or B) | Booster: hold for overdrive while the gauge lasts; let go to save the rest |
| F | Fly: hold to lift off, let go to glide down |
| In the air | A / D spin, W / S flip (W forward, S back), Q / E roll (or Space with A / D) |
| R | Stuck? Back on the road a few metres on (on water too) |
| C | Chase or driver's-seat camera |
| Wheel | Chase camera nearer or farther |
| M | Back to the globe |
| H | Horn, for those [driving with you](#driving-with-others) (only while that's on) |
| Esc | Pause: keep driving, change ride, or back to the globe |

The keys card shows as each drive starts; **?** brings it back. Under the place's name at the top,
a slim bar shows your [level](#levels) and the XP to the next, with small "+46 XP" pop-ups under it. Flying, the booster, drifts, stunts,
water and R come from `src/drive.js`, which World Drive starts with `fly`, `booster` and `drift` on,
`crash: 'launch'` and its `water` (the construction app leaves them off: its crashes stop the
vehicle dead, and nothing there is water), and on the Moon its `gravity` (a share of the Earth's:
[the Moon](#driving-there)).

On a touch screen the globe's panel is a sheet along the bottom, and driving has on-screen buttons
(the driving HUD's, `src/drive-hud.js`): steering bottom left; **Gas** with **Drift** over it at the
right-hand edge, and **Brake**, **Boost** and **Fly** beside them; reset (↺) and **Cam** at the top
right, under the bar with **Globe** and pause. Several can be held at once. In the air ◀ ▶ spin,
**Gas** and **Brake** flip, and **Drift** held with ◀ ▶ rolls. The speed and boost sit at the top in
the middle with the phone upright (over the sky); with it on its side they're one low row at the
bottom in the middle, between the steering and the pedals, so they don't cover the road ahead
(style.css).

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

- **The booster** (**Shift**, or **B**, or the BOOST button) burns while it's held: a full gauge lasts
  2.5 s (it needs 15 % to light), and letting go puts it out with the rest saved, pushing you up
  to twice the ride's top speed. The gauge refills by itself in 8 s; landed tricks top it up (a fifth
  each), and so do boost pads (once they're switched on). What it leaves behind is the ride's **boost style** from the
  [Garage](#the-garage): the classic flame, bubbles, confetti, music notes or cherry blossom, or
  with the pass (or, for some, a level) one of seventeen more.
- **Overdrive.** Boost at 85 % or more of that doubled top speed for three quarters of a second and
  you hit overdrive (the code calls it supersonic): a sonic boom (shock rings blown out round you, a flash and a jolt, the edges of the view flashing white), streaks of
  air streaming back past you, the view 9° wider and **OVERDRIVE** by the speed. It lasts, boosting
  or not, until you drop under three quarters of that speed: a moment after the gauge runs out, or at
  once if you hit something. Every ride can, each against its own top speed (the kart at about
  190 km/h, the pickup at about 290). It's all in `src/drive.js` (`SUPERSONIC`) and `drive-boosts.js`;
  World Drive widens the view by `driver.warp`.
- **Boost pads.** Switched on, glowing pads turn up on the ground ahead of and round you as you drive,
  each under a column of light: small gold ones (+12 % of the gauge) and big orange ones (a full
  gauge). Drive over one and it goes dark, lighting again 4 s later (a big one 10 s); with the gauge
  already full you leave it for later. There are at most 12 (9 small, 3 big), 15 m apart or more,
  and those you leave far behind are put down ahead again. They never go down on [water](#water),
  nor by it. They're off until **Boost pads on the road** in the pause menu turns them on, and that's
  kept in this browser (`world-drive.pads` in its storage: `on`, or `off` once turned off again;
  until 11 November 2026 they were on unless it said `off`, so a browser that turned them off then
  keeps them off). Pads driven over still earn their XP ([levels](#how-xp-is-earned)).

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
  9. The boom's rings keep up with the vehicle (0.97 of its speed): slower, at overdrive's speed
  they fell back through the chase camera while still growing, and with the camera inside a ring's
  bright band the whole view went white, twice.
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
  somewhere else at a stop (R, say), it doesn't lurch. It's in how the car is
  turned, so those driving with you see it too.

Where each burst goes, and how big it is, follows from the vehicle's size rather than its model:
the exhaust in the middle of its back a third of the way up, the sparks at its rear tyres, the rings
and flashes as wide as it is. So they fit every ride, from the lawn tractor to the city bus: the
[cars](#world-drives-cars) were each looked at lighting the booster, drifting to a mini-turbo and
over a pad on the test pad, the flame between the formula racer's rear wheels and out of the
ice-cream van's back doors (its cone makes it tall, so a third of the way up is halfway up the
doors).

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
as the booster lights nor in overdrive's boom, whose rings are fainter (0.6 as bright); no flash of
a style's own as it lights (its `ignite` is told `calm`): no bright core to the galaxy's burst, no
flare to the comet's, no flashes at the ends of lightning's forks nor in the fireworks' starburst
and the bursts of the three rockets lit with it (their sparks are all there), the neon laser's
starburst half as many beams and dim (0.35 as bright), and its hoop and the
afterburner's shock ring fainter (0.6); the vehicle not lit up on a pad, and the gauge glowing
steadily when it's full rather than pulsing, and flashing once as it runs dry. Overdrive's 9° wider view is as it was, either way. On a
touch screen the bursts have 60 % of their sparks (and most styles' own bursts as they light fewer
too), and there are 24 speed lines rather than 48. The Garage's
**▶ Boost** has the same effects as driving (main.js hands it `driver.effects`): no flare for a
visitor asking for less motion, and a phone's fewer sparks.

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
effects going with a pause and made again; every boost style lighting with a burst of its own and
streaming its particles while it boosts, as a phone has it (no more, and fewer for the newer ones)
and for a visitor asking for less motion (no more, and fewer for the galaxy, the comet, lightning,
the fireworks and the neon laser, whose flashes are left out or thinned); the flame's cone, core and
glow drawn in the order they were made from behind it and from all round it (the red flame's and the
galaxy's too), and their bounds holding all of the flame on rides from a little one to a bus; the
fireworks' first half second, their starburst and three rockets bursting into 56 sparks round four
flashes, and for a visitor asking for less motion into the same sparks with no flash; the neon
streak behind the kart pinned against a wall, boosting with W held, laid in one spot rather than
drawn out as on the Garage's turntable; the speed
lines thickening with speed and going, overdrive's white edges, the gauge pulsing, flashing and
refilling; the switch turning it all off,
kept across a reload, and on again; asking for less motion; the sonic boom's rings keeping up with
the kart (read back off the canvas frame by frame: under half of the view near white, 28 % at
most, where rings falling back through the camera had 95 % of it), with no flare for a
visitor asking for less motion, nor in the Garage's **▶ Boost**; and a phone's thinner bursts and
fewer lines.
`test-drive-live-ui.mjs` checks another's car lights and runs dry with their booster, and has a
burst at each of their drift's charge levels and for its mini-turbo.

### Water

Google's 3D tiles don't say what's water: a bay, a harbour or a river is just more ground in them,
and every ride drives on it as on any other ground. Drive off a quay, down a beach or over a
bridge's railing, or come down onto the water out of the air, and you're on its surface, driving on
as you would on a car park: no splash, nothing sinks and nothing puts you back. Out past where
Google draws the water by a coast its tiles are the sea bed, sloping down under the sea: drive or
fly out there and the sea's own surface is laid ahead of you, and you drive on at the sea's height
([out from a coast](#out-from-a-coast)). A trick landed on the water scores as on the ground. **R**
puts you a few metres on as it does anywhere, out there or on the edge facing the water: on the
water, if that's where those few metres are. **Go to** (or **Join**) beside another driver who's
out on the water, or in the air over it, puts you there too, on its surface with them (out past
Google's water, where they ride or fly over the sea's own surface over its bed, that's laid there
for you as well: [out from a coast](#out-from-a-coast)), and Esc parks you on the water, to drive on
from there.

Until 11 November 2026 driving or coming down into water was a splash: every ride but the
hovercraft sank nose first and was put back on the last dry ground it had been on, facing away from
the water. It's gone, at the owner's asking, and with it the Driver's splash, its trail of dry
ground to go back to and the HUD's splash word and fade. The measurements in this section (how
water is told, the open sea, the big lakes) were made while it was a splash, which is why they
speak of splashes and of the way back; `water.js` tells water the same way still, for three things
(all on the Earth: the Moon has none):

- **The hovercraft** rides on water as every ride does, but throws up spray behind it there. It
  says `floats: true` in its tuning, and under it the Driver looks for water every 0.2 s while it's
  on the ground: that's the Driver's `water` option (`src/drive.js`; off unless an app gives one, so
  the construction app's driving never looks), which World Drive gives `src/drive-app/water.js`.
  The spray comes out of `drive-fx.js`'s pools (150 droplets and 48 puffs, and 6 rings and 2
  patches of foam), made with a ride's other effects only when it floats: no other throws any up.
- **Boost pads** never go down on water, nor by it: they belong on the streets, and Google's water,
  as flat and open as anything on its mesh, would take most of them by a coast or a river.
- **The open sea**: a drop-in far out at sea, where Google draws only the sea bed, starts on a
  surface of the sea's own ([below](#the-open-sea)), which water.js calls water like any other; and
  driven or flown out onto that bed from a coast, it's laid there, but not over ground coloured as
  only dry land is, nor over ground closed in by levees, houses and roofs as streets under the sea
  behind a levee are ([out from a coast](#out-from-a-coast)).

**Others' cars** from a page loaded before the change can still say they're sinking
(`FLAGS.splash` in `live-protocol.js`, which `live.js` no longer sends): `ghosts.js` shows their
car's splash and its foam as it sinks, as it did, and nothing else comes of it.

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
round, is as often water by a shore, a pier or a ship as an even grey square, so it can't tell: it
isn't taken for water, nor for dry ground. (While water was a splash it also said where the water
past the edge was, which the Driver took for water when the vehicle came down into it there.) So
is a colour in between (a brown, a green) on level, even ground that's the lowest round about. And
turquoise (green and blue both 40 or more over red) is never dry, whatever its shape: Geneva's
clear lake, the Bellagio's and the sea by Copacabana's surf are drawn from photographs, beds and
all, neither level nor even. Boost pads take only surely dry ground (and so did the trail back from
a splash and R's few metres on, while water was a splash). What it can't be sure of (no picture, a ray that finds nothing) is never water: it
misses a little water rather than take a road for it. It looks at the cheapest things first: on
most ground one ray, on a road seven or so; all of it is 23 rays.

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
like any other: every ride drives on it, the hovercraft throwing up spray, no boost pad goes down on
it, and driven or flown off an island or a coast out onto it, you're on its surface, not the bed;
with none laid yet, it's laid as you go out ([out from a coast](#out-from-a-coast)). The flight down
to it doesn't look for Google's ground (it would come down onto the bed). M, or a drop-in anywhere
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
360 heights from 180° W, each a signed byte in metres), fetched the first time it's needed
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
`drive/public/sea/mask.bin`, 251,556 bytes, fetched with the sea's height the first time it's
needed. A square is the sea if all of it is, a coast if the sea's edge (a coast, an island's)
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
of its islands, a pin drops in on Google's ground as before. (Beside another driver over the lake
there, with its surface yours or theirs that they're riding on, a square its shore crosses is the
lake's: [beside another driver](#out-from-a-coast).)

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

#### Out from a coast

Google draws water at the sea's height only close to a coast; past that its tiles are the bed, with
the sea's picture on it, sloping down under the sea (in Santa Monica Bay 7.6 m under it 500 m off
the pier and 129 m under it about 9 km off, about 1.4 m down in every 100 m between:
[above](#the-big-lakes); further out, 2 m in 100). While driving into water was a splash, only the
hovercraft got that far; with none, a ride driven down off the sand at Copacabana and out across
the sea followed the bed down, metres then tens of metres under where the sea's surface should be.
So while you drive on the Earth with none of [the open sea's](#the-open-sea) water round you, four
times a second (`watchSea` in `src/drive-app/main.js`) the ground is looked at under you and ahead
of you along your way (as far as you'll go in 1 s and in 3 s, and at least 15 and 60 m; behind you
while you reverse), and where all of this holds there, the water's surface is laid as for a
drop-in:

- the ground is more than 1.5 m under the sea's height, on the sea or a coast on the map; or more
  than 15 m under a big lake's, in a square of the map all of which is the lake (a square its shore
  crosses is land, as below Niagara Falls; and Google draws some lakes' surfaces several metres from
  the table's height, above); or, anywhere, lower than 1.5 km under the ellipsoid, which is all
  there is if the map didn't load. Google's own water by a coast is within a metre or so of the
  sea's height as EGM96 has it (1.0 m under it by Santa Monica Pier), so within 1.5 m it's driven on
  as it is (and driven out from it onto the bed, you're lifted that much onto the sea's);
- you're no lower than 1.5 m under the water's height yourself: not in a hollow or a polder under
  it, where it would be over you (as when it comes back within reach, above);
- it isn't coloured as only dry land is, as water.js has it (sand, soil, brick, a field's green,
  bright concrete; never turquoise): so not the side of the Assal depression, desert 28 m under the
  sea in the Ghoubbet's coast square, nor a polder's fields behind its dyke. Ground whose picture
  can't be read is taken for land, as water.js takes it for not water: Google's pictures are read
  (only the test pad's own ground has none);
- it's open to the water round it: of 16 bearings round it, five one after another (a quarter of
  the way round) have nothing at 25, 50, 75, 100, 125 or 150 m along them standing more than 1 m
  over the water's surface, coloured as only dry land is, or missing (rays down from far over it,
  as for [walled off](#the-open-sea)).

**Open to the water.** Ground more than 1.5 m under the sea in a coast's square isn't always its
bed. New Orleans' streets are about 2 m under the sea behind the levee on Lake Pontchartrain, which
is the sea on the map (it's joined to the Gulf), and its lakefront (Lakeview, Gentilly) is in coast
squares; their grey asphalt and roofs aren't coloured as only dry land is. Before it looked for
what follows (11 November 2026), on the test pad a kart driven off a levee toward such a street,
2.5 m under the sea, had the sea laid over it 57 m short of the edge and drove across the city on
it, and so did one flown over it. What tells them apart is that the bed of open water is open to
it: on the seaward side the bed (or Google's water) goes on under the water's surface all the way
round a wide arc, while ground under the sea in a city or a polder is closed in on most sides by
its levee, quays, houses, roofs and trees, standing over the water's height, and a polder's fields
and a park's lawns are coloured as land. On a straight coast the beach, a promenade and the houses
behind it close at most the seven bearings on the land's side (those that reach it within 150 m),
and nine are open; beside a pier running out to sea as well, five or more. Among houses, any of a
bearing's six rays down that hits a roof or a tree closes it: along the test pad's streets (below)
no more than two bearings side by side were open (down a street), never five, with those alone. A
simulation of the same houses with rays at 50, 100 and 150 m only, as walled off has them, found
five open side by side at 45 of the 2,595 spots along those streets it tried, which is why it looks
every 25 m. The bed isn't told from ground under the sea that's open, and not coloured as land,
150 m round on a quarter of the way (a wide car park or an airfield's apron behind a levee: [known
limits](#known-limits)).

Houses standing farther apart than the test pad's let a quarter of the way round through past every
ray down, though, and this look has its rays down alone. Flown 20 m over the streets of the test
pad's town laid out more sparsely (lots 25 to 37 m long, with 12 to 20 m between houses), with a
boulevard 49 or 64 m across it, or with a fifth of its lots left empty, it lays the surface among
the houses at 6 to 617 of 6,200 to 7,300 spots a town every 4 m (the boulevards 7 and 133; lots 25,
30 and 31 m long 66, 122 and 617; suburbs with crossings 46 to 56 m across 14 to 167; a fifth of the
lots empty 6), and you come down on it there; driven along those towns' streets at the water's
height (on a raised road, say), it's laid on all 7 streets of four of them (lots 25, 30, 31 and 37 m
long), at the first crossing it came to, 4 to 178 m on, and on none of the other five's. In the test
pad's own town and the four laid out a little differently ([built up](#out-from-a-coast), below) it
lays it nowhere. In a 2D model of the same rays over suburbs of random layout, roofs 3.5 m over the
water, it opened 0.9 % of the spots in 40 with 3 to 8 m between houses (4,816 of 545,004, in 25 of
them), 4.3 % in 60 with 3 to 20 m (in 44) and 14 % in 30 with 16 to 20 m; and driven off a levee
toward the swept towns at 30 km/h (from every metre of 400 m of its top, at seven headings from
south-east to south-west), it was laid ahead among the houses from 82 of 2,807 of those by the town
on lots 25 m long and from 60 of 2,298 by the suburb on lots 37 m long, and from none by the test
pad's town or eleven others. Beside another driver the rays along each bearing and between bearings
close all of those (built up, below), and from 12 November 2026's ninth change to its tenth this
look had them too. But driving out from a harbour they closed the way out as well, where nothing
else did: past a row of boats moored 90 m past the water's edge (8 m long, 2.2 to 3 m over the
water, 15 or 25 m apart, a gap of 37 m where the kart went), through three such rows or a marina
(jetties 50 m apart with boats moored along them), or between two jetties 50 or 80 m apart with
decks 2.5 or 4 m over the water, it was never laid, and the kart drove on down the bed to 20 m under
the water; with Google's water drawn 1 m up with bumps as well, at 25 km/h it was laid with the kart
0.9 m under it, and past rocks or groynes up to 11 m later. And a ray along passes through every
tile within its 75 m, building the hierarchy of each it's the first into, up to seven in one frame
where tiles are 10 m across (below). So the frame loop's look is back to its rays down, which lay it
on all of those coasts where they did before; a surface laid among a sparse town's houses is the
price (you drive on the water between them), and the lesser harm. On Google's tiles a town's lawns,
trees and tiled roofs may be coloured as only dry land is, which these rays take for land and close,
where the test pad's streets and boxes are grey all over; that wasn't tried (there's no key).

Driven out from the test pad's coast at 50 and 25 km/h it's laid where it was before the ninth
change, within a few metres, with the kart still on Google's water or the land: off the plain coast,
past rocks, groynes, buoys, an island, breakwaters, a bank, a pier 15 or 30 m off, a single jetty,
houses behind the beach and the boats and jetties above, with Google's water drawn 1 m over the
sea's height with bumps, or 3 or 9.5 m over it (as by a volcanic island, where the rays down already
close the bearings toward it), off a beach rising 1 in 10 or 1 in 40, and between banks 240 m apart;
between two jetties 50 m apart with a row of boats moored across the end of the way, with the kart
0.6 m under it. Never, as before, between banks or moles 160 m apart, jetties 70 or 100 m apart
(60, 80 or 120 m apart, it's laid), or islands 100 m apart either side, and only in some runs under
a bridge's deck 5 m over the water across the way out (5 of 12 at 25 and 50 km/h, and 4 of 10
before the ninth change, when the look was done before the kart was 1.5 m under it, 0.8 m under):
those are closed in on most sides within 150 m, as an inlet is ([known limits](#known-limits)).

Flown out 20 m over the water at 50 km/h, 30 frames a second, past the row of boats (90 m or 70 m
past the edge), four rows of them 20 m apart, the jetties 50 or 80 m apart, jetties 80 m apart
reaching 360 m out, and a marina (low jetties 80 m apart with boats moored either side of a fairway
22 m wide), it was laid 12 to 28 m short of Google's water's edge, the look casting no rays along
the ground, and at 100 km/h 35 to 49 m short of it, as before the ninth change. With the rays along,
from the ninth change to the tenth, it was laid 30 to 290 m farther out at 50 km/h (3 m past the
edge with the boats 70 m past it, and 84 to 266 m past it with the rest), so coming down among them
before that you'd have landed on the bed.

It's looked at last, only for ground that's passed the rest, and for one spot at a time; and a
bearing's rays are only cast as a run of five that might be clear comes to it, from the run's far
end back, out from the spot, since one that isn't clear rules out every run through it. Among the
test pad's houses that was five rays a look, and finding the bed open off its coast, 36; at most
it's 96 (every bearing's six).

**Spread over frames.** Those rays reach out 150 m round a spot up to 60 m ahead, farther than any
other ray cast while driving (water.js's widest ring is 35 m), into tiles no ray may have reached
yet; and on Google's tiles a tile's first ray builds its bounding volume hierarchy
(`src/raycast.js`), which once took 40 ms ([above](#how-water-is-told-from-the-ground)). Measured
here (12 November 2026, in Chromium, with the game's own `raycast.js`, a ray straight down onto a
mesh the size of a tile, on this shared machine), a mesh's first ray took 0.7 ms with 2,500
triangles, 1.5 ms with 5,000, 2.8 ms with 10,000, 6 ms with 20,000, 13 ms with 40,000 and 29 ms with
80,000 (about 0.3 ms a thousand; up to 40 ms with 80,000 with the machine busy, and 14 ms with
10,000 for the first in the page, its code not yet compiled), and each ray after it a few
thousandths of a millisecond; Node gave much the same. How many triangles Google's tiles have, and
how many of them a look's rays reach first, wasn't measured: there's no key here. A ray reaches
every tile 3d-tiles-renderer (0.5.3) has active, in view or not: with its quick raycast by tiles'
bounds off (`src/world.js`, as it can miss Google's geometry poking out of its tile's bounds),
`TilesRenderer.raycast` tries each active tile's mesh; and with `loadSiblings` (on by default) a
tile in view that's refined has all its children used, those out of view too, which are loaded and
made active and kept with the tiles' group for rays, though not drawn. So out of view there's ground
for a ray everywhere: beside the tiles in view their siblings, as fine as they are, and farther off
the siblings of tiles a level or more up, coarser and coarser. As a model of that (square tiles,
each level half the last, refined in the 70° view while driving to the library's error target of
16 pixels, each 8 to 64 times as wide as its geometric error, leaves 10 to 40 m wide; on a desktop's
screen, or a phone's held either way), the 96 rays fall on 26 to 85 active tiles: 16 to 62 of them
in view, and 8 to 34 out of it, 10 to 80 m wide. (Counting only tiles in view, as this said before,
gave 16 to 59: too few.) So the look that first found a coast's bed could have built dozens of
hierarchies in one frame: 26 at 2.8 ms to 85 at 29 ms is about 70 ms to two and a half seconds here,
and more on a phone.

So no frame casts more than 12 of them, nor any more once they've taken 4 ms in it: a quarter of a
frame at 60 frames a second, or the one ray that took longer, as driving onto a new tile costs
anyway. Where tiles' bounds don't reach past each other, as the test pad's squares' don't, a ray
down is the first into one tile at most, so then no frame builds more than one tile's hierarchy,
however small the tiles are; one falling on two tiles' edge can be the first into both, and on
Google's tiles, whose boxes are each in its own mesh's frame and may reach past their neighbours',
one near an edge may be the first into more (below). What's known of the spot's bearings is kept
(`seaWatch`'s spot), and the look round it carried on in each frame after till it's known, nothing
else looked at meanwhile (a spot found closed is looked round afresh at the next look, as more of
Google's tiles may have come in round it); the surface is laid as soon as it's known to be open,
with you still no lower than 1.5 m under it. Looks in the meantime would have found newer spots
farther on (at 100 km/h, 7 m on at each look), but those are the bed of the same water some metres
along the way, and the surface laid round the first is the same one: it's laid kilometres round it
(below), and again round you as you go. Until 12 November 2026 the look round a spot began afresh
whenever a later look found one in another 10 m square, which at speed was most looks, and each time
its rays reached tiles new to them out at its edge: in the emulation below at 100 km/h and 20 frames
a second it was laid in only 2 of 5 runs, the kart by then 1.1 m under the surface, and in the other
3 not at all, the kart driving on down the bed to 13 m under it.

That lays it a little later than a look all in one frame would. On the test pad, off its coast,
driven out at up to 50 km/h, the 36 rays took four frames and it was laid with the kart 26 to 29 m
short of the water's edge. With the first ray into each 25 m square made 5 ms slower, as if each
were a tile of about 15,000 triangles reached for the first time, the look took 30 frames (30 of its
rays slow) and it was laid with the kart 21 m short of the edge, on Google's water, as before. At
100 km/h and 20 frames a second (a slow phone), set off 90 m short of the edge with the look falling
at five points in its quarter of a second, it was laid every time, from 4.7 to 11.6 m short of the
edge, on Google's water, 2.8 to 3.05 s after setting off: never more than one slow ray in a frame
(5.1 to 5.4 ms a frame, and once 14 ms with the machine busy). Swept wider (60, 100 and 300 km/h at
20 frames a second, and some at 30 and 60, each tile's first ray 20 ms or in 10 runs 5 ms, on
squares 10, 15, 25 and 40 m across, as near the camera Google's can be 10 m, the look falling at
five points each: 85 runs), it was laid every time, the kart at most 1.25 m under the surface (300
km/h, squares 10 m across), never with more than one slow ray in a frame (20 to 25 ms frames with
the 20 ms rays). With the rays along each bearing and between them in this look, from the ninth
change to the tenth, a ray along built as many as its 75 m passed through first: up to 2 a frame
with squares 25 m across, 3 with 15 m and 7 with 10 m (frames of 120 to 140 ms with the 20 ms rays),
and at 300 km/h and 20 frames a second with squares of 10 or 15 m it was laid in none of 5 runs, the
kart driving on down the bed to 20 m under it.

That emulation makes a ray slow by where it lands. Emulated by what it builds instead, each square
its own mesh with its own hierarchy, built on its first ray and that made 20 ms slower, its box
reaching 10 m over its ground, and each ray trying only the squares along its way (as
3d-tiles-renderer tries its active tiles), driven and flown 20 m up at 100 and 300 km/h and 20
frames a second over squares 10 and 15 m across (and 25 m flown), the look falling at five points
each: the look's own rays built one hierarchy a frame driven; flown, with its spot at east 0 so that
its rays north and south fell on two squares' edge, two in some frames at 100 km/h over 10 and 15 m
squares, as before the ninth change. The rays under the vehicle and ahead that find the spot, which
aren't counted in the look's share, built up to two more as a look began: three in a frame, 60 ms,
as before the ninth change too. (The first run over each size of square also had one frame of 0.25
to 1.5 s, before the ninth change as now, not from the hierarchies.) It was laid every time, driven
and flown, 330 to 368 m out (Google's water ending at 340), the kart at most 1.16 m under the
surface. A mesh's box on Google's tiles is in that mesh's own frame and may reach past its
neighbours' (that wasn't tried): with each square's box reaching 3 m past it every way, the look's
own rays built up to four hierarchies in a frame and all the rays five to eight (frames of 100 to
160 ms), and it was still laid every time, the kart at most 1.42 m under the surface. Holding the
look's rays to one hierarchy a frame there (a ray that would build a second cast again the next
frame) was tried and isn't done: driven over 10 m squares at 100 and 300 km/h and over 15 m squares
at 300 km/h it was laid in none of 5 runs each, the kart driving on down the bed to 20 m under it,
and the frames were still 120 to 160 ms, from the rays under the vehicle and ahead. In the worst
case modelled, all 96 rays needed, falling on 85 tiles none had reached (above), each taking more
than 4 ms, it would take 85 frames: 1.4 s at 60 frames a second, over 4 s at 20, at 100 km/h 118 m,
farther than the 83 m it looks ahead; on a bed sloping down 1 in 20 from the water's edge you'd be
more than 1.5 m under the water by then, and it isn't laid (you drive on along the bed, as when
started on it). That's the trade-off taken for never stalling a frame for seconds; none of it was
tried on Google's tiles. (A Go to's look round the spot beside the other driver, below, still casts
all it needs at once, its rays along each bearing and between them too: it's a jump to somewhere
else, whose tiles have their first rays then anyway.)

It's laid round that spot (sea.js's `start`, as for a drop-in, its reach the map's square there),
and you roll onto it, or come down on it: driven out over Google's water and on over the bed, you're
on at the water's height; flown out and let down, you land on it. Looking 60 m ahead, on a bed
sloping down from the water's height 1 in 40 or more it's there before you're under that height; on
a gentler one you can be up to 1.5 m under it first, and are lifted onto it. Off Santa Monica the
bed is the gentler kind (1.3 m down in 100 from the pier's water, 1.0 m under the sea's height, to
7.6 m under it 500 m off), so there you'd be lifted. Every ride the same, the hovercraft throwing up
spray on it; R out there puts you a few metres on, on it; from then on it's the open sea's surface
as above, gone out over land past its reach. On the Moon nothing's looked at. The sea's height and
the map are only fetched (once a drop-in) when the ground looked at is lower than any water could
be there (86 m over the ellipsoid, or a big lake's height over that in its box) less 1.5 m; on
higher ground a look is three rays down and nothing more. On the test pad such a look took 0.02 to
0.09 ms in software rendering (three rays, and the map and the sea's height read); on Google's tiles
a ray takes 0.03 to 0.07 ms, so four looks a second are a few tenths of a millisecond a second.
(On the test pad, driving, its sea, 2 m under its land, is at the water's height: Google's water by
a coast. A drop-in instead takes the pad for ground at the water's surface wherever it's put, as
above.)

**Beside another driver.** Go to or Join beside someone out on that surface, or in the air over it
(a hop, a trick, flying: every ride can fly), puts you on it with them. You're put 5 m to the right
of the way they're heading, along the ground, at their height (`besideOf`): not along their car's
own side, which mid barrel roll points down at the bed, or up. (Until 12 November 2026 it was along
that side, and beside a car rolled onto its side 3 m over the surface, the bed 2 m under it, you
were put on the bed; with the bed 7 m under, the drop-in beside them started on it.) Their height
is what says they're out there: no more than 1 m under the water's surface there (the sea's, on the
sea or a coast; a big lake's, in a square all of which is the lake), however high over it, as the
look above lays it for a vehicle at any height over it. Then:

- **With none of that surface laid in your scene**, it's laid there for you where the ground under
  them is the bed as above (more than 1.5 m under that surface, or 15 m under a lake's; not coloured
  as dry land; open to the water round it), here with the rays along each bearing and between
  bearings too, as built up has them (below), which the frame loop's look no longer has: in this
  scene (within 10 km), before your car is put beside them, on the ground within 3 m under them as
  anywhere, or else on that surface under them, at its height, where nothing's in between (a
  bridge's deck, say: then it's a drop-in, as anywhere there's no ground within 3 m under them);
  farther off, for the drop-in beside them, which otherwise starts on a bed less than 15 m under the
  sea, as any drop-in does ([the open sea](#the-open-sea)). Before, you were put on the bed under
  them, 1.5 to 15 m down, and stayed on it, too low for the surface to be laid as you drove on;
  until 12 November 2026 that was so for anyone more than 1 m over the surface too, even a hop.
  Elsewhere that look doesn't lay it: over a city's streets under the sea (below), however high they
  are, you start on the street; over a big lake's shelf less than 15 m under it, a bed coloured as
  sand or one closed in on most sides (an inlet, a harbour's mouth), beside someone flying over it,
  on that bed, under the water, as a pin there does ([known limits](#known-limits)); beside someone
  riding on it, as next. (Until 12 November 2026's ninth change that look had no rays along (above),
  and among houses standing farther apart than the test pad's it laid the surface beside someone
  flying 20 m over the streets: in your scene at 4 to 473 of 5,000 to 7,000 spots a town, and the
  drop-in beside them from the globe started on it, between the houses.) With them, it's closed in
  between two jetties 50 or 80 m apart, or in a marina's fairway, as a street is, so beside someone
  flying over the water there, with none laid, it's a drop-in, onto the bed under them, till past
  the jetties' ends: on the test pad, of 7 spots 40 to 160 m out past Google's water, at the 4
  nearer the shore (the bed 2 to 5 m under the water there), and it was laid at the other 3; and so
  beside a rider, and beside a flier with yours laid (built up, below); before the ninth change your
  scene laid it there at 5 to 7 of the 7 beside a rider or a flier with none laid, but the drop-in
  beside a rider, from the globe, didn't (it asked whether it's built up first).
- **Beside someone riding on it**, with none of it laid where you are (from the globe, from the
  Moon, from a page just opened, from another place, or with none in your scene), it's laid for you
  there too, and you start on it beside them, as you'd see them on it: where their wheels are on
  something (live.js's grounded flag in what their page sends; or, with no word of their car, the
  place they dropped in, which they started on), at the water's height there to within 0.5 m, with
  Google's ground under their car, and under the spot beside them, more than 1.5 m under that
  height. With Google's ground that far under them, what they're riding on can only be a surface of
  their own: so over a big lake's shelf, a bed coloured as sand and an inlet too (one wide enough:
  below). Someone on ground at about the water's height (a levee, a quay, a beach, a low bridge's
  deck) has that ground under their car, and isn't taken; nor is someone in the air at that height
  (a hop, flying), whose wheels aren't on anything. Only on that water's squares of the map (the
  sea's or a coast's; a big lake's own, or one its shore crosses: next) and where the ground round
  the spot isn't built up (next, and below), so not over a city's streets under the sea that someone
  rides over on a surface of theirs laid within its reach: beside them you start on the street. The
  0.5 m takes in what their height can be off the water's as it's worked out here, from the same
  table of the sea's height and the same lakes: a centimetre in what their page sends (5 cm in the
  place they dropped in); their body leaning on its springs, its pivot a few centimetres over its
  wheels as most rides corner or brake and up to about half a metre for the bus braking flat out;
  and their scene's flat frame, which sea.js curves away as if the Earth were a sphere 6,371 km
  round, where it's an ellipsoid: within 10 km of where they dropped in their surface is within 5 cm
  of the water's height as it's worked out here, 0.2 m at 20 km, and more than 0.5 m only past 34 km
  (by the equator; 45 km at mid-latitudes). It's well under 1.5 m, so whoever it takes is a metre or
  more clear of the ground under them. In a channel between banks or moles standing over the water,
  it's laid where a quarter of the way round is clear out to 75 m, as with yours laid (next): in one
  130 m wide or more, everywhere; 120 m, all but one spot of 30 across it (8 m off its middle);
  100 m, 13 of 25 (the half nearer its banks, and 20 m off its middle); 80 m, 2 of 20, by a bank;
  60 m or narrower, nowhere. Where it isn't laid you start on its bed under them, as for none above:
  in your scene, where Google draws that bed less than about 3 m under them, you're put on it there,
  under their water (Go to takes ground within 3 m of their height, as anywhere); otherwise it's a
  drop-in, which starts on it as a pin there does (a bed less than 15 m under the sea). (Before
  12 November 2026's change, joined from the globe beside someone riding on a surface of their own
  over a lake's shelf, a sandy bed or an inlet, you started on that bed under the water; and in your
  scene, beside one over a sandy bed 2 m down, on that bed. Then for a while that day it was looked
  at out to 75 m with the rays down alone, and beside a rider in a street 25 m from a crossing you
  were put on the surface among the houses, in your scene and from the globe; then out to 100 m,
  which kept you off it among the test pad's houses but not among houses laid out a little
  differently (below), and laid it in a channel 120 m wide only within 18 m of a bank, and in one
  100 m wide or narrower nowhere. And until its ninth change, in your scene the look for laying it
  afresh was asked first, with no rays along, so among houses standing farther apart than the test
  pad's it laid the surface beside a rider over the street (at 4 to 473 of 5,000 to 7,000 spots in
  nine towns laid out so), and where built up held it off (all over three of them), the drop-in from
  the globe, asking that first, started on the street: your scene and the globe didn't agree. That
  look now has the rays along each bearing and between them, out to 75 m, as built up has (below;
  the frame loop's look, driving, hasn't them since the tenth change), and its rays down reach as
  far or farther and see colours too, so where it lays a surface the ground isn't built up either,
  and both come to the same.)
- **With your own surface laid already**, those checks aren't asked: they're for laying it afresh,
  and it's over all of that water's ground under its height anyway, as you'd drive on it there.
  Beside someone flying over that water, with nothing in between, you're put on it under them
  whatever the ground under it is: a big lake's shelf less than 15 m under it, a bed coloured as
  sand, the bed of an inlet or of a harbour's mouth between its moles. That water, on the map, is a
  square of the sea or a coast for the sea's surface; for a lake's, one of the lake's squares or
  one its shore crosses (`lakeShore` in `sea.js`: a land square with one of the lake's among the
  eight round it), where nearly all of a big lake's shelf is, and where yours is kept as you drive
  there too ([the open sea](#the-open-sea)'s reach). A square a shore crosses has one, unless the
  lake's narrower than two squares there: of Natural Earth's water of each big lake, its own
  squares and these hold 99.7 % of Baikal's, 98.9 % of Erie's, 96.7 % of Ontario's and 93.4 % of
  Onega's (the rest in bays and straits; its own squares alone, 72 % to 91 %). Not a hollow inland,
  nor the valley below a lake's outlet farther off: Niagara's gorge is four squares from Lake
  Ontario's and five from Erie's, the Nile below the dam at Jinja five from Lake Victoria's, the
  Karagiye Depression four from the Caspian's. (Until 12 November 2026 a lake's counted only in its
  own squares, and beside someone flying over its shelf in a square its shore crosses, you started
  on the shelf.) Only not where that ground is built up, as a city's streets under the water behind
  its levee are: closed in close by on every quarter of the way round, with no five bearings of 16
  one after another with nothing at 25, 50 or 75 m along them standing more than 1 m over the
  surface (or missing), nor anything along them or between them within 75 m standing 2 m over it
  (below). It goes by heights alone, as a sandy bed is coloured as a polder's fields are. Houses
  either side of a street close all but the bearings along it that near; banks or moles 130 m or
  more apart don't, out over the water between them. Over those streets it's a drop-in beside them,
  which starts on the street. (Until 12 November 2026 you were put on that surface among the houses;
  then for a while the checks for laying it afresh were asked with yours laid too, so beside someone
  flying over a lake's shelf, a sandy bed or between a harbour's moles it was a drop-in as well, and
  that started on the bed under the water; till the ray along each bearing (below), in a street 25 m
  from a crossing among the test pad's houses, you were put on the surface among them; and till the
  rays between bearings, by a boulevard 49 m across, or crossings 46 to 56 m across in suburbs laid
  out more sparsely, so too.)
- **Joined from farther off** (more than 10 km, a drop-in), with your surface laid when you left,
  `goBeside` says whose water it was, and beside someone over that same water the drop-in starts on
  its surface by the same rule: the ground under the pin more than 1.5 m under it and not built up.
  For a big lake that's wherever you were on it, or off it: its squares and its shore's hold little
  ground under its height but its shelf (a marsh by its shore, what's below an outlet within a
  square of it: the upper Niagara at Buffalo, at about the lake's height). For the sea it's only
  where your surface reaches them as it's laid now: round you, out to its edge 65 km off (`reaches`
  in `sea.js`), where you'd see it under them if you looked. Farther, a sea laid on one coast says
  nothing of ground under the sea's height on another, and it's as for none above: joined from off
  Santa Monica beside someone flying 20 m over a field 3 m under the sea at New Orleans (in a
  coast's square), you start on the field. (Until 12 November 2026 the sea's counted wherever it
  was laid, and there you started on the sea over the field, which then covered the city's streets
  round it within its reach.) From the globe or the Moon you have none laid, and it's as for none
  above: beside someone flying over a lake's shelf, the drop-in starts on the shelf; beside someone
  riding on it there, on its surface.

**Built up.** Beside a rider with none laid and beside a flier with yours laid alike, whether the
ground round the spot is built up goes by heights alone, out to 75 m (`CLOSE` in `main.js`): on each
of 16 bearings, rays down at 25, 50 and 75 m, and a ray along it 2 m over the water's surface
(`SKIM`), which anything it meets closes; and a run of five clear bearings counts only where three
more rays along between each two of them (`FAN`) meet nothing either. The rays down see three points
of a bearing, and one can thread between houses past all three: down a crossing street, through a
gap between two houses or over the yards behind them, and on into the next street. On the test pad's
New Orleans (below), with the rays down alone, a quarter of the way round was open at 60 of the
3,546 spots under the sea inside its town every 5 m (in its streets 25 m from a crossing, and by its
outer street's kerb), and beside a rider there you were put on the surface among the houses (and
beside someone flying over it with yours laid, at 30 of the 2,607 spots along its streets looked at
before). With the town laid out a little differently (its houses' fronts 20 m apart across a street,
not 16 m; 6 m between houses, not 4 m; yards 20 m deep, not 12 m; or blocks 50 m across, not 60 m),
at 18 to 31 % of the spots looked at along its streets and yards: 1,295 of 5,229, 576 of 3,012,
1,072 of 3,486 and 170 of 946, in your scene and from the globe. A fourth ray down at 100 m, as
beside a rider for a while on 12 November 2026, kept you off it in the test pad's town (but at 22
spots by its outer street's kerb, on a grid 2.5 m off the other) and not in those: at 195, 576, 256
and 170 of the same spots. With the ray along each bearing, nowhere, beside a rider or a flier: at
none of 77,161 spots in those five towns (3 to 7 blocks either side), every 5 m, on a grid 2.5 m off
that and at those spots; at none of the 2,607; and by none of 46 drop-ins from the globe, beside
riders and beside fliers with yours laid, at 23 spots, most of them where one rule or another had
laid it. A 2D model of the same rays over 40 suburbs of random layout (the sizes of the houses, the
gaps between them, the yards and the blocks drawn at random), whose houses' roofs stand 3.5 m over
the water, found spots open in all 40 with the rays down alone out to 75 m (96,767 of 738,716) and
in 39 out to 100 m (48,486); with the ray along, none.

Those suburbs' crossings were a lot wide or less (15 to 30 m), though. A run of five clear bearings
is five lines 22.5° apart, and from where a street meets a boulevard or a crossing 45 m or more
across, five could run down the street, across it and along the yards behind back-to-back rows past
every ray along them too, with houses standing between them. In the test pad's town with a
boulevard across it (the lots at north -625 to -655 left empty, so the houses' fronts either side
are 49 m apart), a quarter of the way round was open at 42 of 5,272 spots every 2.5 m, by its edges
where the streets meet it (with the fronts 64 m apart, at 942 of 5,648; 34 m apart, none); and in
suburbs with wider lots and a crossing 46 to 56 m across every 6th to 11th lot, at 61 to 79 of
6,650 to 7,122 spots every 5 m. There, until 12 November 2026's ninth change, beside someone flying
over the street with yours laid you were put on the surface among the houses, beside a rider it was
laid (at 42 to 1,074 spots a town), and the drop-ins beside them from the globe started on it. Open
water is clear all the way across its quarter, not on five lines of it. So the three rays between
each two bearings of a run (5.6° apart, 7.4 m apart 75 m off), cast once each a look as a run comes
to them, closed every one of those spots, and the rest of those towns; not every town laid out so,
though (below).

Swept so in the real app on the test pad, beside a rider (0.1 m over the sea's height) with none
laid, beside someone flying 20 m over with yours laid and with none laid, at every spot more than
1.5 m under the sea in the streets, yards and crossings (every 5 m on a grid 1.25 m off the streets'
lines, the boulevards every 2.5 m) of fifteen towns, 6 blocks either side: the test pad's own; with
the boulevard 34, 49 or 64 m across; the four laid out a little differently (above); lots 25 m long
with houses 13 m long (12 m between them, crossings 37 m across) or 30 m with 14 m; the test pad's
on lots 31 m long (20 m between houses); three suburbs with crossings 46 to 56 m across (lots 30 to
37 m with houses 14 to 18 m); and the test pad's with a fifth of its lots left empty at random:
92,310 spots, and 43,321 more for seven of them on a grid 3.75 m off. None were laid or put on the
surface, any of those three ways (flown over them, the frame loop's look, with its rays down alone,
lays it in nine of them: [out from a coast](#out-from-a-coast)). On the eighth change's rule the
same sweep laid it beside a rider at 4 to 1,074 spots in each of nine of those towns (the boulevards
49 and 64 m across, the sparser ones and the fifth-empty one), beside a flier with none laid and
flown over at 4 to 473 in the same nine, and put you on it beside a flier with yours laid at 42 to
942 in six (the boulevards and the wide crossings). From the globe, 48 drop-ins at spots where one
of those had laid it in the scene, beside riders, fliers with yours laid and fliers with none laid,
all started on the street. The 2D model, with the rays between bearings too, found none open in
check7's 40 suburbs, nor in 60 drawn with gaps of 3 to 20 m between houses (370,518 spots, 830 of
them open with the ray along alone), 60 with their rows staggered, 60 turned 11.25° or 30° against
the bearings, 30 each with gaps of 8 to 12, 12 to 16 and 16 to 20 m (4,296 open with the ray along
alone), nor 42 towns with crossings 15 to 65 m across and gaps of 4 to 20 m between houses (with the
ray along alone, those 50 m across or more opened).

A run of five can still thread farther than the rays between bearings see, though, where houses are
left out along a line: a boulevard 40 to 50 m wide running at a slant across the streets, two
boulevards crossing, a plaza where a boulevard or a wide crossing meets a street, or a lot left
empty either side of a street by a boulevard or a crossing 37 to 56 m across. Swept in the real app
every 4 m within 210 m of a town's middle, built up was open (beside a rider with none laid, and
beside a flier with yours laid, you're put on the surface there, in your scene and from the globe
alike): with the boulevard town's two houses facing each other across a street by the boulevard left
empty, at 17 of 6,253 spots (a test pins one such spot: below); in the suburb on lots 37 m long with
crossings 56 m across, with the pair by a crossing left empty, 166 of 6,773, and with a plaza 40 to
60 m across where that crossing meets a street, 174 of 6,777; with two lots empty each side of a
street, 12 to 224 in five of the sparser towns; with a boulevard 40 m wide at 22.5° to 60° through
four of them, 32 to 379, and 50 m wide through the test pad's own town, 3 and 10; with two
boulevards 49 m wide crossing, 221, and 207 with the town turned 30°; with a round plaza 60 m across
where the boulevard meets a street, 17, and one 50 m across in the suburb on lots 32 m long, 15;
with a tenth of the lots of the town on lots 30 m long left empty at random, 14. Beside a flier with
none laid the look for laying it afresh, out to 150 m, laid it at none to 17 of those spots. In the
2D model, with a fifth of the lots of random suburbs with 3 to 8 m between houses left empty, 294 of
196,277 spots were open (in 4 of 30 suburbs), with three tenths 493 of 205,319 (in 7), and with
wider gaps, a fifth empty and the town turned, 248 of 405,761 (in 11 of 60); and of 641,298 spots in
35 towns with crossings 15 to 70 m across, 291, all by those 70 m across (below). Rays along out to
100 m, not 75, close all of those in the model, but they close a channel's water too: across one
between banks 100, 110, 120, 130, 140 or 160 m apart, built up was open at 13 of 25, 21 of 28, 29 of
30, 33 of 33, 35 of 35 and 40 of 40 spots, and would be at 0, 5, 9, 15, 23 and 38. Built up keeps to
75 m, as the water beside someone on it in a harbour matters more than a few spots of a sparse town.

How high the ray runs is a choice between what open water has standing on it and what a town has.
Google's own water stands within a metre or so of the sea's height as it's worked out here by most
coasts (1.0 m under it by Santa Monica Pier), and up to several metres over it by some (that height
is up to 9.5 m low by volcanic islands: [the open sea](#the-open-sea)). Where it stands more than
1 m over it, the rays down already close the bearings toward it, so the ray only needs to clear
water drawn up to a metre over the sea's height, and that isn't quite flat: over water drawn 1 m up
with bumps of a quarter of a metre either way, a ray 1 m up met it on all 16 bearings, and 1.5 m up
or more on none. Boats moored in a row 25 m off, standing 1 m over the water, weren't met by a ray
1.5 m up; 1.5 m over it, 2 m up; 2.5 m over it, only 3 m up, and with boats that tall moored either
side of a fairway 50 m wide the spot in its middle was closed in 2 m up, as a street is. A jetty's
deck 15 m off, 1.2 m up, wasn't met 1.5 m up, and one 2.2 m up was met 2 m up. A beach rising 1 in
10 from the water 40 m off closed 3 bearings toward it 2 m up (5 at 1 m), and 1 in 20 none; a
bridge's deck 5 m up wasn't met, only one of its piers; a quay's wall 1.5 m over the water wasn't
met 2 m up (the rays down find its top). The test pad's roofs stand 3.5 m over the water; with them
2.5 m over it every spot was still closed, and with them 1.5 m over it (lower houses, or a town
deeper under the water) 50 of 3,546 were open, as with the rays down alone, where a ray 1.5 m up
would close them. With each house's roof drawn at random from 1 to 5 m over the water in the model's
40 suburbs, 31 of their 738,716 spots were open with the ray 1.5 m up, 358 with it 2 m up, 1,495
2.5 m up and 4,907 3 m up. 2 m up stays a metre clear of Google's water where the rays down don't
already close it, and over most moored boats and low jetties, and meets a house more than 3.5 m high
on a street 1.5 m or more under the water. The ray runs level with the water's surface there: it
curves away from the scene's middle under the scene's flat frame, 1 in 640 at 10 km off (as far as
Go to puts you in your scene), so a ray level in the frame comes 12 cm nearer it in 75 m toward the
middle (over water drawn 1 m up 10 km off, one 1 m up met it on 7 or 8 bearings; 1.5 m up or more,
on none, either way). The Earth's own curve in 75 m is under half a millimetre.

What that still gets wrong. With your surface laid: open ground under the water's height with
nothing standing on it within 75 m (a polder's fields, a park, a wide car park behind a levee) isn't
built up, so beside someone flying over it you're put on the surface over it, as you would be
driving on it there, and so among houses where a clear quarter of the way round opens onto such
ground nearly as wide as the reach, or threading farther than the rays between bearings see: a
boulevard, a square or a park 70 m or more across (in the model, crossings 70 m across opened 35 to
76 of about 19,000 spots a town, where they met a street; 75 m or more across, hundreds to
thousands, most of them out in the crossing), narrower ones laid out so (a boulevard 40 to 50 m wide
at a slant, two crossing, a plaza by one or by a crossing, or a lot left empty either side of a
street by one or by a crossing 37 to 56 m across: 3 to 379 spots a town, above), or lots left empty
(in the model, with up to a fifth of a town's lots left empty at random, 4 of 360,046 spots open,
and in towns with 3 to 8 m between houses 294 of 196,277, and 493 of 205,319 with three tenths
empty; with up to two fifths, 341 of 374,460; and the look for laying it afresh, with its rays down
out to 150 m, opened none, 3, 12 and 64); between two jetties 50 or 80 m apart, or in a marina's
fairway, it's closed in as a street is, and beside someone flying over the water there it's a
drop-in, which starts on its bed under them (on the test pad, till past the jetties' ends, 2 to 5 m
under the water); and a channel less than about 130 m wide between banks or moles standing over the
water is closed in close by over some or all of it, as a street is, so beside someone flying over
that it's a drop-in, which starts on its bed if Google draws that more than 1.5 m under the water
(water that narrow it mostly draws as water, at its height, which the drop-in starts on). Houses
whose roofs stand less than 2 m over the water (lower houses, or a town deeper under it) aren't met
by the ray along each bearing, and are told by the rays down alone, which a bearing can thread past
(above); and moored boats taller than that, close together either side of a fairway, close it in as
houses do. A big lake's shore squares take in its shore too, so what's under its height on land
within a square of its own (below an outlet, as the upper Niagara at Buffalo is, about at its
height) is under yours; and its bays and straits narrower than two squares (0.3 % of Baikal's water
to 6.6 % of Onega's) aren't its water to this, so beside someone flying over a shelf there it's a
drop-in, onto the shelf. Beside someone riding on a surface of their own: over open ground under the
water's height within its reach (a polder's fields, a park), not built up, you start on it over that
ground, as they're driving on it there, and so among a town's houses by such ground where a quarter
of the way round is open onto it within 75 m (on the test pad, with that ground all round its town,
at 285 of the 1,260 spots under the sea in its outer blocks, as before the rays between bearings,
where the rays down alone found 697 open out to 75 m and 691 out to 100 m; with a dyke round the
town instead, 75 m past its last houses, at 5 of the 4,806 among its houses, where its five streets
end by the open ground before the dyke, and at none on that ground, where before the rays between
bearings it was 142, and out to 100 m, which reached the dyke, none and 40); in a channel less than
about 130 m wide between banks or moles standing over the water, where it isn't laid over some or
all of it (above), and between two jetties 50 or 80 m apart or in a marina's fairway till past the
jetties' ends, you start on its bed under them: in your scene where Google draws that bed less than
about 3 m under them, put on it there under their water, otherwise by a drop-in, which starts on it
if it's less than 15 m under the sea (water that narrow Google mostly draws as water, at its height,
and then you start on that); someone riding more than 34 km from where they dropped in (45 km at
mid-latitudes), or leaning more than 0.5 m (the bus braking flat out), or in a hop off it when you
join, may not be taken for riding on it, and it's as for none above (beside someone over a lake's
shelf, a sandy bed or an inlet, on that bed); and what's under their car is looked at in your scene,
from where you'll start, which may draw it unlike theirs (a pier's thin deck under them that your
tiles don't show would have you start on the water beside it). Measured on the test pad, across a
channel between two banks standing 5 m over the sea, out over the coast's bed 7 m under it, at spots
every 2 m from its middle to a bank, beside someone flying 20 m over them with yours laid and beside
someone riding on their surface 0.1 m over the sea's height with none laid alike: across one 130 m
wide or more (130, 140, 150, 160, 180, 200 and 240 m), every spot was put on the surface; 120 m
wide, all but one of 30 (8 m off its middle); 100 m wide, 13 of 25, the half nearer its banks and
one 20 m off its middle (in its middle both banks are within 75 m on the bearings across it); 80 m
wide, 2 of 20, by a bank; 60 m wide, none: just as with the rays down alone, as the banks close the
bearings across, and those meet them. Looked at out to 100 m with the rays down alone, as beside a
rider for a while on 12 November 2026: 160 m wide, all but 2 of 40; 140 m, 23 of 35; 120 m, 9 of 30;
100 m, none. Beside the rider where it wasn't laid, with that bed 7 m under them it was a drop-in,
which started on the bed; with a bed 2.5 m under them instead, you were put on it in your scene: at
all 15 spots of the 60 m channel, 18 of 20 at 80 m, 12 of 25 at 100 m and the one at 120 m. Joined
from the globe, the pin in the middle of the channel or 12 m from a bank over a bed coloured dark or
as sand, beside the rider and beside the flier with yours laid it started on the surface just where
those did in the scene, and on the bed elsewhere. It's at most 112 rays, once a Go to: 48 down, 16
along the bearings and 48 between them (and one more under a rider's car); with none laid, the look
for laying it afresh comes first, at most 160 more (96 down, 16 along and 48 between); where it's
open, the rays between bearings are 12 of those. On the test pad, all at once, built up took 11 to
17 rays at the middle spot of each town swept (26 to 50 at most, the most by the 64 m boulevard) and
32 to 37 out over the bed and across channels (38 at most); the look for laying it afresh 12 to 23
among the houses (38 to 52 at most) and 23 to 55 over open water (71 at most). Each was under 0.1 ms
in the middle (the page's clock reads to a tenth of one) and 16 ms at most, but 1.3 to 1.8 s for the
first after a new picture of the ground, which copied it (the rays down read each hit's colour,
though built up doesn't ask it: 0.7 ms at most for a picture of Google's). A pin, a search or a
start spot isn't anyone's height, and drops in as before.

**Tested** on the test pad (`npm run test:drive-ui`), not on Google's tiles: in Santa Monica Pier's
square (a coast's), the pad's land 2 m over the sea, its water at the sea's height 60 m out (one
even colour, as Google draws it), and then a bed 1,200 m across in the sea's colours (as dark as
Google's out at sea), sloping down 1 in 20 for 400 m and on, level. Driven out at 50 km/h, the
surface was laid with the kart 27 m short of the water's edge, and it drove on at the sea's height,
never lower, 18 m over the bed at the end; R there put it 4 m on, on the water; flown out over the
bed in a lagoon's turquoise, the surface was laid under it 12 m up, and let go it came down on it.
The same slope coloured as sand, or with no picture, had no water over it, nor did it in Death
Valley's square (land), and the kart drove on down it to 13 m under the sea. With houses 10 m high a
promenade's width (15 m) behind the beach and Google's water only 10 m wide, driven straight out,
and reversed out, the surface was laid with the kart still on the land, 18 m short of the beach's
edge; started on the bed 5.5 m under the sea's height, in a hollow, nothing was laid, and the kart
drove on down the bed. Driven out with the keyboard, the page's frames looking as they do (no look
but theirs), it was laid with the kart on Google's water, never under it, and it drove on on it. In
Lake Baikal's square, flown out over the same slope, the lake's surface was laid only once the bed
ahead was more than 15 m under it, and the kart came down on it. In New Orleans' square (a coast's,
by Lake Pontchartrain), the pad's land the levee's top, 2 m over the sea, and south of it streets
2.5 m under the sea, 60 m apart, with houses along them (two rows back to back on each block, 16 m
deep on lots of 15 m, a street across every seven lots) whose roofs stand 3.5 m over the sea: driven
off the levee and 470 m down a street, flown off it 59 m up over the houses and let down, and
started in a street, nothing was laid, and the kart stayed on the streets. Go to beside a car out on
the surface 2 m and 7 m over the bed laid it there and put the kart on it beside them, and driven on
it stayed on it; so did Go to beside one 1.5 m over the surface (the bed 2 m under it), 3 m over it,
and flying 20 m over it, the kart on the surface under them; beside one rolled onto its side 3 m
over the surface (the bed 2 m or 7 m under it), its own side pointing down or up, the spot was 5 m
to the right of its heading at its height, as beside one not rolled, and the kart was put on the
surface there, laid; and with the surface laid already, beside one flying 20 m over the bed, on it
under them. With it laid already, so too beside one flying 5 m or 20 m over the same bed coloured as
sand, 7 m and 13 m under the surface, and over the bed as far under it between two moles 160 m apart
running out from the shore, standing 5 m over the sea (closed in on most sides within 150 m, which
the look never lays a surface over); with the moles 40 m apart it found no ground in reach (a
drop-in), nor over a hollow as far under the sea 8 km inland (land on the map). In Lake Baikal's
square, its surface laid by a drop-in, beside one flying 5 m or 20 m over a shelf 10 m under it, the
kart was put on the surface under them, as over its bed 200 m down; joined from 12 km off with that
surface the kart's own, the drop-in beside one flying 20 m over such a shelf started on the surface,
and from the globe, with none laid, on the shelf. Laid in a square of the lake at 53.25° N, 108.452°
E, beside one flying 5 m or 20 m over a shelf 10 m under it 1 km east, in the next square (land on
the map, Baikal's shore crossing it), the kart was put on the surface under them, as in the lake's
own square; over a shelf as far under it at 108.60° E, 9.9 km off, two squares from the lake's (land
on the map, the surface drawn there still), or a hollow 24 km off, four squares from them, not; and
joined from 24 km off with Baikal's surface laid in its square at 108.1° E, the drop-in beside one
flying 20 m over that shore square's shelf started on the surface, and laid there, in the shore
square, beside one flying 20 m over the shelf at 108.60° E the kart wasn't put on it either; it went
once the kart was out over land four squares from the lake's. (With the shore squares taken two
squares round, both fliers at 108.60° E were put on the surface, and the test fails.) With the sea's
surface laid off Santa Monica, the drop-in beside one flying 20 m over a sandbank coloured as sand 7
m under the sea 14 km off started on the surface, and beside one flying 20 m over a field 3 m under
the sea in New Orleans' square started on the field, as it did from the globe. From the globe, with
none laid, the drop-in beside one riding on a surface of their own (level, their wheels on it, 0.1 m
over its height), Google's ground 10 m under it in a square of Baikal and in one its shore crosses,
7 m under the sea by Santa Monica Pier coloured as sand, and in an inlet there between banks 160 m
apart standing 5 m over the sea, started on the surface beside them, and so did one beside where
someone dropped in on such a sandy bed's surface; beside one on a levee whose top was at the sea's
height, by a field 3 m under it, and one in the air at that height over the field, it started on the
field. Driving by the pier with none laid, Go to beside one riding on their surface over the bed
coloured as sand 2 m under it put the kart on the surface, laid, 5 m to their right, not on the bed.
Beside one at the sea's height in New Orleans' street it put the kart on the street, laying nothing;
beside one flying 3.5 m, 20 m or 200 m over that street it laid nothing and found no ground in reach
(so it would be a drop-in), and so too with the surface already laid over the street; and the
drop-in beside them, with the street under the pin 2.5 m under the sea among those houses, started
on the street with nothing laid, with the kart's own sea's surface laid when it left or not; and so
did Go to beside one riding on a surface of their own over that street at the sea's height, in the
scene and joined from the globe, there and 25 m from a crossing (north -365 and -415 of the pad,
open a quarter of the way round to the rays down out to 75 m: with those alone, the sea was laid
there among the houses, both ways, and the kart put on it). With the town's houses' fronts 20 m
apart across its streets (its rows 10 to 24 m and 36 to 50 m from a street's middle), beside one
riding on their surface over the street at north -321, where a bearing threads between the houses
past the rays down out to 100 m, nothing was laid and the kart was put on the street, in the scene
and by the drop-in from the globe; beside one flying 20 m over it with the sea's surface laid, in
the scene the kart wasn't put on that surface (nor anywhere: no ground in reach, so Go to falls back
to a drop-in), and the drop-in beside them, with the kart's own sea's surface laid when it left,
started on the street. With the rays down alone, out to 100 m beside the rider and 75 m beside the
flier, as before the eighth change, the sea was laid there all four ways, and the kart put on it.
With the lots at north -625 to -655 of that town (its houses' fronts 16 m apart again) left empty, a
boulevard across it with the houses' fronts either side 49 m apart, so too where the street at east
0 meets it (6.25, -623.75), where five bearings run down the street, across the boulevard and along
the yards behind the houses past every ray down and along them: beside the rider on the street, in
the scene and from the globe, and beside the flier with the sea laid not put on it, the drop-in
starting on the street; with only a ray along each bearing, no rays between them, as before the
ninth change, the sea was laid there all four ways. With the two houses facing each other across the
street at east 0 by the boulevard left out too (their middles at ±16, -615.5), beside one riding on
their surface where that street meets the crossing street by them (1.3, -594.7), where a quarter of
the way round threads out through the gap and along the boulevard farther than the rays between
bearings see, the sea was laid and the kart put on it, in the scene and by the drop-in from the
globe alike (a known limit, above); beside one flying 20 m over it with none laid, nothing was laid
(a drop-in); and with those two houses there, beside the rider nothing was laid. And with its lots
25 m long and its houses 13 m long (12 m between them, crossings 37 m across), over the street at
east 0 by a gap between two houses (6.25, -416.25): beside one riding on their surface there, and
beside one flying 20 m over it with none of the sea laid, nothing was laid, in the scene (the kart
put on the street, and beside the flier not moved: a drop-in) and by the drop-ins from the globe,
which started on the street; flown over it 20 m up, though, the frame loop's look, with its rays
down alone, laid it (as above). Before the ninth change, the look for laying it afresh, with no rays
along, laid it there in the scene beside the rider and the flier and flown over it, and the drop-in
beside the flier started on it; beside the rider, the drop-in started on the street, so the scene
and the globe didn't agree. A drop-in beside a driver at the sea's height, the pad 7 m under it in
the sea's colour, started on the surface, and so did one beside a driver 3 m and 20 m over it; a pin
at that height started on the pad, 7 m under it. The look round a spot was spread over frames
(above): off the pier, its 36 rays down over four frames, never more than 12 in one and none along
the ground, in the page's own frames driven with the keyboard too; past the houses behind a beach,
forward and reversing, and down New Orleans' street, never more than 12 a frame, none along; with
the first ray into each 25 m square 5 ms slower, one slow ray a frame, and laid 5 to 8 m later,
before the kart was under; and so at 100 km/h and 20 frames a second, the look falling at five
points in its quarter of a second, laid every time on Google's water; and with squares 15 or 10 m
across, each one's first ray 20 ms, at 100 and 300 km/h, one a frame, laid with the kart no more
than 1.05 m under the surface. Driven out at 50 and 25 km/h past a row of boats moored 90 m out
(2.2, 2.5 or 3 m over the water, every 15 or 25 m), between two jetties 50 or 80 m apart (decks 2.5
or 4 m over it) and through a marina, it was laid with the kart still on Google's water, 12 to 28 m
short of its edge; and flown out 20 m over the water at 50 km/h past the boats 2.5 m over it, either
pair of jetties and the marina, 12 to 26 m short of it, the look casting no rays along the ground
(from the ninth change to the tenth, with them, driven it was never laid, the kart 13 m under the
water 260 m past the edge, and flown it was laid 85 to 120 m past it). Without the map, off Santa
Monica Pier, the kart drove on down the slope.

## The Moon

The globe's panel has **Earth** and **Moon** at its top. The Moon is a whole Moon, made in the page
(`src/drive-app/moon.js`) rather than streamed: its shapes are the real Moon's down to a few
kilometres, from NASA's Lunar Reconnaissance Orbiter, its colours LRO's photographs of the whole
Moon, and everything smaller made up, the same on every visit. It needs no Google tiles and no Maps
key, so it's the real Moon under `npm run dev:drive` too.

### Going there

- **Earth | Moon.** The first time, the Moon's two files are fetched (never before: the Earth never
  asks for them, nor makes its stars), the heights (`/moon/height.bin`, 2.1 MB) and the picture
  (`/moon/colour.webp`, 0.7 MB), the Moon button dimmed meanwhile; if they don't come, a word says so
  and the globe stays on the Earth. Earth, or a place or a drop-in on the Earth, while they're on
  their way stays on the Earth. Then the globe turns to the Moon, coming in from further out, over the Apollo sites
  (12° N, 18° E) the first time, else where it was looking when it left; the Earth's tiles are
  hidden and not updated, so none load under it. Earth turns back, to where it was.
- **Start spots**: a dozen (`MOON_SPOTS` in `src/drive-app/moon-places.js`): Tranquility Base
  (Apollo 11), Hadley Rille (Apollo 15), the Taurus-Littrow valley (Apollo 17), Tycho, Copernicus,
  Aristarchus, Plato, Mons Huygens, Shackleton crater's rim by the south pole, Mare Orientale,
  Tsiolkovskiy and Von Kármán (Chang'e 4) on the far side. Latitude north and longitude east are
  positive, as the IAU's selenographic coordinates have them.
- **Search** finds the Moon's own places, all in the page (no map service knows the Moon): the spots
  and about forty more (`MOON_PLACES`: the other landing sites, the seas, more craters and mountains,
  the poles, the highest and lowest places), by their names or others ("Sea of Rains" is Mare
  Imbrium, "Apollo 11" Tranquility Base), accents and apostrophes not minded ("schroteri",
  "change 4"). Typed coordinates are the Moon's. A tap on the globe drops a pin.
- **Recent places** are kept apart, six of the Moon's own (`world-drive.recent-moon`), and the
  panel shows the world's. The Earth's are untouched.
- **A link**: `/?spot=moon-tycho` (any Moon spot's id), or `/?at=-43.31,-11.36&world=moon`, turns the
  globe to the Moon and pins the place, as an Earth spot's link does. Each spot has a page of its
  own, `/moon/<slug>/`, whose **Drive here** is that link, and the home page's words list them (a
  tap there turns the globe to the Moon too): see [The Moon's pages](#the-moons-pages).
- On the Moon the panel says "Pick anywhere on the Moon" and has no search credit (it's not
  OpenStreetMap's); [driving with others](#driving-with-others-on-the-moon) is the Moon's own there,
  its **Driving now** and dots the Moon's drivers. NASA's credit is in the corner where Google's
  would be.

### Driving there

- **The drop-in** has no tiles to wait for, no sea and no streets: the ground's height at the pin
  is worked out (the same sum that builds the ground, below), so the scene is centred on the ground
  there at once, and the ground round it is built on the way down, faster while the loading screen
  is up. The vehicle faces the way with the most open ground round it (`Ground.heading`, as on the
  Earth). In Chromium's software renderer (no GPU) a drop-in took 13 to 18 s.
- **Gravity** is the Moon's, 1.62 m/s², a sixth of the Earth's: `driver.gravity = 0.165`
  (`src/drive.js`). What throws a vehicle up (a hop, a hit's throw, a crest's climb, a wipeout's
  tumble, a bounce on soft springs) is multiplied by its square root, 0.41 (`driver.leap`), so each
  goes as high as on the Earth and stays up two and a half times as long (what a landing's speed is
  measured against, for a hard one losing speed or soft springs bouncing, too): a hop 2.5 m up for 3.5 s
  (1.43 s on the Earth). Thrown as hard as on the Earth they'd go six times as high and stay up six
  times as long: a hit's throw 52 m up, a hop 8.6 s. A drift's little hop is as short as on the
  Earth. The ground is looked for 2.4 km down rather than 400 m, and a vehicle fallen 1.2 km under
  where it last stood with no ground found is put back there (200 m on the Earth), as long jumps go
  higher over ground falling away. Sparks and bits from a hit fall as slowly.
- **Scores** are fair to the Earth's: big air counts the time the same jump would have taken on the
  Earth (the air time × 0.41), so a plain hop is no more big air than on the Earth, and a spin, a
  flip or a roll is worth 0.41 of its points (to the nearest 10), there being that much longer to
  turn in each jump (not while flying, which lasts as long anywhere); wall bounces are as they are. The leaderboard has the place as "Tycho crater
  (Moon)", or for a pin "Moon, 43.31° S, 11.36° W", never the board of a place on the Earth with the
  same name or at the same latitude and longitude, and a run's longest air is posted up to the
  Worker's 120 s.
- **The sky** is black with stars (a picture all round, turned with the Moon) and the Earth hangs in
  it over the near side, where the Moon always faces it: 1.9° across as it really is, drawn at 2.5°
  (a body low in the sky looks bigger than it is), lit by the same sun, so it shows a phase. The sun
  is from the south-west, 20° up, so every crater rim and rock has its light and its shade. On the
  globe from space it's over the viewer's left shoulder (the side in view lit, a Moon nearly full),
  and low across the ground from the left coming down to it, as light from straight ahead would
  show none of its craters.
- **No water**: `water.none` (`water.js`) says everywhere is surely dry, the Driver is given no
  water at all and nothing looks for [the open sea](#out-from-a-coast); the grey dust, flat and even
  on a mare's floor, would otherwise look like water to it. **Boost pads**, switched on, go down by
  [their own rules](#boosting) for the Moon (`MOON_RULES` in `pads.js`): ground tilted up to 25° and
  bumpy to 40 cm round the pad, reached over ground rising or falling up to 3 m every 7 m (a crater's
  rim), up to 40 m over or under where the vehicle last stood, and while it's up to 60 m over the
  ground in its long jumps. The Earth's rules keep pads off roofs and banks, and the Moon has none.
- **M** goes back to the Moon's globe, **Earth** on the panel to the Earth's.

### Driving with others on the Moon

[Driving with others](#driving-with-others) is on the Moon as on the Earth: the Moon is never
limited (its ground is our own and costs nothing to stream), and a minute's drive alone on a grey
plain is where most visits ended, so it's where company helps most. Everything the Earth has, the
Moon has, in rooms of its own:

- **Nearby, in the Moon's own areas.** Its areas are rooms of their own, `moon:BAND.COL` (and
  `moon:BAND.COL#1` to `#3` for their shards), so a Moon driver only ever shares an area's room
  with Moon drivers. They're the Earth's size: bands 0.36° of latitude tall (10.9 km on the Moon's
  1,737.4 km sphere, as 0.1° is 11.1 km of the Earth), cut into columns about as wide, the same
  grid sums as the Earth's (`cellOf( lat, lon, 'moon' )` in `live-protocol.js`). Drive into the next
  area and stay 5 s, and the room follows, as on the Earth.
- **Their cars on the Moon's ground.** Positions and turns are sent Moon-centred, in the Moon's own
  frame (moon.js's: Z through its north pole, X through 0° N 0° E), and each page draws them through
  the Moon's group's matrix as it is now, as an Earth car is drawn through the tiles'. A car is
  where its own page has it, on the ground it drives (moon-height.js's ground, the same on every
  page), so it sits on the ground on everyone's screen (in the tests, within 3 m of where it is and
  1.5 m of the ground under it, a car having just stopped); with their ride, Garage look and name
  tag, a construction ride shown only with the achievement that unlocks it, as on the Earth. A state is checked against the Moon's ground (from
  12 km under its sphere to 30 km over: the deepest crater to well over the highest summit, flying)
  and a place's height to ±12 km; one in the other world's frame is no car and is dropped.
- **The globe.** On the Moon's globe, the panel's **Driving now** is the Moon's ("3 driving on the
  Moon now"), its areas named after the Moon's start spots ("Near Tranquility Base"), and the dots
  are over the Moon (`/api/online?world=moon`): tap one, **Drive here**, and you're in their room. On
  the Earth's globe the list ends with a line **On the Moon** with how many drive there, and the
  Moon's with **On the Earth**: a tap turns the globe to the other world. With nobody on this world
  and some on the other, the panel says so ("Nobody driving on the Earth right now: 2 drivers on the
  Moon.") rather than "be the first" over that line. With this world's budget for the day spent, its
  dots go but the line to the other world stays while anyone's there ("2 drivers on the Moon right
  now."), as the Worker's answer that's off still says how many are on the other. Just back on the
  globe from driving on one world and turned to the other, the page takes itself off the other's
  count, as it does off an area's. A visit with no Earth (a link to the Moon, or today's Earth drives
  used up) has no **On the Earth** line: it would lead only to the used-up screen.
- **Parties span both worlds.** A party's room has its members wherever they are: one on the other
  world is "on the Moon" (or "on the Earth") in the list and the party's members, and their place's
  name says it too ("Ana is driving at Tranquility Base (Moon)"). **Go to**, **Join** on the banner
  and **Join** on a toast ("Sam went to Tycho crater (Moon).") go to them across worlds: the globe
  turns to the other world (the Moon's files loaded the first time, as the **Moon** button does),
  then a drop-in beside them, 5 m to their right, facing their way. On the Moon, within 10 km, **Go
  to** puts you there straight away, on the ground under them. From a page opened with no Earth
  this visit (a link to the Moon, or today's Earth drives used up), a friend on the Earth is the way
  the **Earth** button is: a reload without the link, or the used-up screen. The party's banner
  shows on the Moon's globe, the pause menu has **Drive with friends**, the horn and tricks' points
  go to the room, and a party counts for its achievements (**Party time**, **Party regular**) there
  the same way.
- **What a page does with friends on the other world.** Its car is no use to them to see, so it
  goes once every 2 s (for their **Join**, as with friends on the globe), and 5 times a second only
  for those on its own world; they're not drawn, nor heard.
- **Levels** count minutes driving with others there too (with others on the Moon); still not the
  Earth's areas or start spots, which are the Earth's.

**Why the Moon's budget is its own.** The day's budget is the Durable Objects bill itself (see
[The day's budget](#the-days-budget)): on the Free plan, past 100,000 requests a day every Durable
Object fails, `DriveLimits` too, and then nobody could start a drive, the Moon's visits included.
So the Moon's rooms can't go unbounded; but they mustn't be shut by the Earth's being spent either.
They keep a day's budget of their own, `LIVE_MOON_DAILY_BUDGET` (**20,000**), counted the same way
in a table of its own in `DriveLimits` (`live_moon`): spending the Earth's switches off only the
Earth's rooms (and in a party, only those on the Earth: the others drive on), and the Moon's only
the Moon's. The two together leave 40,000 of the Free plan's 100,000 for visits, names and scores.
A connection counts against the world it's on (an area's own; in a party, where its page last said
it was), and a room's own alarms and reports against its world (a party's against the Earth's
unless everyone in it is on the Moon). `/api/config` says both: `live` (and `liveReason`) for the
Earth, `liveMoon` (and `liveMoonReason`, `budget` or `unknown`, none when it's only switched off
there) for the Moon, its ask counted against the Earth's while that's open and else the Moon's. A
page whose world's budget is spent is alone there ("Lots of drivers on the Earth today: driving
with others there is back after midnight UTC. You can still drive with others on the Moon."), and
with others on the other world; with both spent, it's over for the visit as before. A world
switched off (its budget of 0) closes there without a word: it isn't lots of drivers. On Workers
Paid either can be raised.

**Nobody drives on a world that's closed, even in a party.** A party's connection is let in on the
budget of the world its page says it's on (`?world=`), and in the room a driver's world is wherever
its page says it is (its hello, a place, back on a world's globe). So a page let in on the Moon,
or a script saying it's on the Moon, could otherwise say hello at the Furka Pass and drive with the
party on an Earth whose budget is spent, until the room's next report a minute on; and again on a
fresh connection, each costing the Earth requests the Moon's budget never saw. So `DriveLimits`'
`liveOpen` also says whether the other world's day is spent (looked at, not counted), `/api/live`
hands that to the room (`X-Live-Closed`), the room keeps it in each connection's attachment
(through hibernation, for that UTC day) along with every world its reports have heard is spent,
and a party's driver who says it's on a closed world (hello, place or a world's globe) is closed
there and then (`CLOSE.off`, `budget`), before anyone hears where; on a world switched off,
`CLOSE.off`, `off`. What such a connection spent counts against the world it was let in on (the
room keeps it, `admitted`), as does what a connection still on a spent world's ground had spent
when the room closes it, if it was let in on the other, still open: the Moon's budget bounds what
connections let in on the Moon cost. And a connection's spend, as it goes, is carried by one on the
same world if there is one; with nobody left on that world (a party with only the other world's
drivers in it), one on the other carries it apart from its own, in its attachment (so it outlasts
hibernation), as that world's: either way it's counted against the world it was spent on, never the
other's.

**Bounded per address, as the Earth's are.** The Earth's visits are capped at 8 a day for each
address (30 a day for a supporter, counted by account; the owner's not at all), and so are their
connections (each visit's 20 a minute and 200 a day, one room at a time).
The Moon's visits aren't capped (anyone gets one for each robot check they pass), so a visit not
counted against the Earth's caps (a Moon visit; never the owner's) connects to rooms from one address
(an IPv6 one by its /48) with at most `LIVE_ADDRESS_VISITS` (**20**) others a day: the next is
turned away (429, "Too many drivers from here today") before any room is touched, and remembered by
that Worker instance. Each such visit has every visit's own limits too. `DriveLimits` keeps only a
hash of the day's salt with the address's keyed hash (the challenges' `lookKey`, an HMAC of its /48
and the day with a key from the Worker's secret) and one of the salt with the visit's id
(`live_addresses`, deleted with the day): neither an address nor a visit can be read from it, nor
linked to the next day. So one address has at most 8 Earth visits a day (30 for a supporter, by
account) and 20 Moon visits, each with one room at a time.

But a count of visits doesn't bound what each connection spends: one may send 20 messages a second,
each a twentieth of a request whatever it is (even keepalives, even alone in its room), about
3,700 requests an hour. Twenty Moon visits from one address would spend the Moon's 20,000 in about
16 minutes, and its 8 Earth visits and 20 Moon visits (which can drive on the Earth too) the Earth's
40,000 in about 23, closing that world for everyone until midnight UTC. So **each address may spend only its share of each world's day**: the budget
over `LIVE_ADDRESS_SHARE` (**8**), 5,000 requests on the Earth and 2,500 on the Moon (about five
and a half hours of driving with others on the Earth, nearly three on the Moon, and many more alone).
Every visit but the owner's counts, Earth and Moon visits alike, on whichever world it's driving. A
room's reports say what each address's connections spent themselves (by the same keyed hash,
`from`: never what one carries for another as it goes), `DriveLimits` adds each up for the day under
a hash of the day's salt with it (`live_address_spent`, deleted with the day, as `live_addresses`)
and says which are past their share on a world; the room closes those addresses' connections on that
world (`CLOSE.rate`, which any page, old or new, takes as a dropped connection), and `/api/live`
turns that address away there for the rest of the day (429, "Too many drivers from here today"),
remembered by the Worker instance until midnight UTC, so the next visit from it isn't another ask of
`DriveLimits` (the same for an address past its Moon visits). An address is closed within about a
minute of passing its share (its rooms report once a minute while they've that much to say), so it
can go past it by what its connections send in that minute (up to about 1,200 requests with all 20
Moon visits flat out, about 1,700 with its 28 visits on the Earth): so it takes about six addresses
(or /48s) to spend either world's day flat out, and eight at the least.
In a party, an address's connection let in on one world's share could drive on the other once its
address had spent that one's, and come back on a fresh connection let in on the first: so
`DriveLimits`' `liveOpen` also says, for a party's room, whether the address is past its share of
the other world (`over`, looked at, not counted), `/api/live` hands that to the room
(`X-Live-Over`, never for the owner's), the room keeps it in the connection's attachment along with
every world its reports have said the address is past, and a driver who says it's on such a world
is closed there and then (`CLOSE.rate`, as at a report). What a connection spent itself before it
went is kept by address in the attachment of one still in the room (up to 8 addresses each), so it
outlasts hibernation, as what's carried for the budget does; and a connection the room closes with
nobody left in it (too many messages, say) has the room report there and then, rather than keep it
in memory until the page answers the close, which a script needn't ever do. Only what a report says
beyond 64 addresses (a room has far fewer) is counted against the world's budget but not its
address's.
An address past its share on one world is turned away there, and a page turned away 8 times in a
row while the Worker says it's on stops driving with others for the rest of the visit (see [When it
stops](#driving-with-others)), on both worlds: a page can't tell why it was turned away. That takes
hours of driving with others from one address in a day (5,000 requests is about five and a half on
the Earth), so it's left at that.

**Old pages.** The page speaks a new version of the protocol, `worlddrive-live.v2` (PLACE and
PLAYER with a `world`, an away with the world of its globe, the Moon's areas and frame), and offers
`[ 'worlddrive-live.v2', 'worlddrive-live.v1', <token> ]`, so a room still running the old code for
a few minutes after a deploy answers v1, and the page then stays on the globe as far as that room
knows while it's on the Moon (as a page from before did). A page from before (v1) gets on as ever:
it's never let into a Moon area (400), and in a party a Moon driver is on the globe to it, with no
place, car, trick or honk (the room's `seenBy`); a place it sends is always the Earth's.

**What's kept:** nothing more than on the Earth: a room keeps nothing once it empties, a Moon
area's dots go to `live_online` like the Earth's (positions to about a kilometre and counts), and the
budget and address counts are deleted with the day. A drop-in on the Moon is counted in the [play
stats](#play-stats) as the Moon's (`dropin:moon`, which never says where), with its cell, to about a
kilometre, in [where people drop in](#where-people-drop-in); its driving as the Moon's play time
(with others or not), and each turn of the globe to the Moon (and the Moon not loading) is counted
too.

**What it costs:** a Moon driver is billed as an Earth one (900 requests an hour with others, about
93 alone, [What it costs](#what-it-costs)), and the globe's Moon dots are the same asks as the
Earth's, counted against the Moon's budget, kept 30 s apart from the Earth's (their own cache key).
The default 20,000 a day is about 20 driver-hours with others on the Moon. Nothing is added to the
page's first load (it's all in the game's own code, which loads with the globe), and alone on the
Moon a page sends nothing but its keepalive, as on the Earth, and draws no ghost. Before, a page on
the Moon had no car for driving with others; now each frame works out where its car is in the
Moon's frame (a few matrix sums, as on the Earth): measured in Node on its own (`live.update` 200,000
times, a shared machine), 0.6 to 1.2 µs a frame, against 0.1 µs with no car, so well under a
microsecond more, a hundred-thousandth of a 60 fps frame even on a phone several times slower. The
others' cars (`ghosts.update`) and the dots (`online.update`, nothing while driving) loop over
nothing when alone, as before. Frame time in Chromium's software renderer can't show that: on a
phone on its side (760 × 390), a frame with five others' cars drawn took within about 5% either way
of a frame alone, which is the noise of a shared machine (the middle of 12 frames each, measured in
`test-drive-live-ui.mjs`, the Moon's ground being nearly all of it there; 0.94 to 1.05 times as long
across nine runs). What a frame takes in itself depends on how loaded
the shared machine was: from about 0.6 s to 1.3 s alone across those runs (1,033 ms both alone and
with five in the last). Five cars cost nothing that shows, and that comparison was only
made on the new code. The game's code (loaded with the globe, after the robot check, as
before) is 3.7 kB bigger, 1.5 kB gzipped; the page's first script 0.1 kB.

**How it's tested:** `npm run test:drive-live` has the protocol's Moon (an area as big as the
Earth's, Moon-centred metres and back, a dot on its sphere, states and places checked against its
ground), the rooms under `wrangler dev` (a Moon area's drivers seeing each other's cars and never the
Earth's area at the same numbers, a v1 page turned away, states in the Earth's frame dropped; a
party on the Moon counted for its players' achievement, a friend going to the Moon heard of with
its world; the Earth's budget spent and a Moon area and a Moon party let in, an Earth party not,
a page let in on the Moon saying hello at the Furka Pass closed at once, and a Moon driver going to
Monaco the same, `/api/config` saying `liveMoon: true`, `/api/online` off with the Moon's count; a Moon visit's address held to 2 visits, an IPv6 /48 as one,
the Earth's and the owner's visits not), the room on a stand-in runtime (a Moon area's frame, a party
across worlds as v2 and v1 pages hear it, each world's spend to its own budget and a spent world
closing only its own drivers, a Moon area's dots, a Moon budget of 0; with the Earth's spent, a
party's driver let in on the Moon closed as its hello, place or globe says the Earth, what it spent
the Moon's, and a report saying so remembered through hibernation and until the next day),
`DriveLimits` on SQLite (the Moon's dots apart, each world's budget, `liveOpen` saying the other
world is spent without counting it, the address table as hashes only, a new day) and
`/api/online?world=moon` on stand-ins (an answer that's off with the other world's count), the
page's `live.js` on stand-ins (the subprotocols, the Moon's area, a party told it's on the Moon, an
old room on the Moon, friends on the other world, a world closed and then both, the Moon switched off
closing quietly), and `online.js` on stand-ins (nobody here and two on the Moon, the Earth spent with
its line to the Moon kept, no **On the Earth** on a visit with no Earth, the page itself not counted
on the world it's just left). `npm run test:drive-worker` has `/api/config`'s `liveMoon` and
`liveMoonReason`. And `npm run
test:drive-live-ui`: two pages at Tranquility Base seeing each other's car on the Moon's ground
within 3 m of where it is and 1.5 m of the ground; a page on the Earth's globe with **On the Moon · 2
drivers**, turned to the Moon by it, its dot and **Driving now** there, and **Drive here** into
their room; a party made on the Moon whose link opened on a phone on the Earth shows the banner, and
**Join** drops in beside her on the Moon; the banner on the Moon's globe; a friend gone to the Earth
told of with **Join** and "on the Earth" in the list, one gone to the Moon told of on the Earth,
**Join** across worlds, and **Go to** on the Moon; driving on the Earth with the party's only other
driver on the Moon not counted as with others in the play stats; a phone on its side with five others' cars drawn,
its frame time measured. Screenshots `moon-live-*`.

### How it's made

- **The heights** are LRO's laser altimeter's (LOLA), as NASA's Scientific Visualization Studio's
  [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/) has them (`ldem_4.tif`): four to the degree (7.6 km
  apart at the equator), kilometres over or under a sphere of 1,737.4 km, from the 8.9 km deep floor
  of Antoniadi crater to the Selenean summit 10.5 km up (both on the far side, as this grid has
  them). `scripts/make-moon.mjs` (`npm run make-moon`) rounds them to the metre as signed 16-bit
  integers: `drive/public/moon/height.bin`, 1440 × 720 from 90° N and 180° W, 2,073,600 bytes
  (compressed it would be 1.4 MB; it's kept plain, as the sea's tables are). The page reads between
  its points with smooth (Catmull-Rom) curves, across a pole from the row on the other side, the last
  stretch to a pole easing to the polar row's mean (else every column would meet there at its own
  height).
- **The picture** is LRO's wide-angle camera's mosaic in colour, with the polar mosaics filled in
  (`lroc_color_poles_4k.tif`), as WebP at quality 72: `drive/public/moon/colour.webp`, 4096 × 2048,
  674,590 bytes. Read by each point's direction, so it has no seam where squares meet; across the
  180th meridian its gradients are taken from a copy that doesn't jump.
- **The made-up detail** (`src/drive-app/moon-height.js`): craters of thirteen sizes, from 12.8 km
  across down to 3 m, as many of each as the Moon has (about four times as many each time the size
  halves). For each size space is cut into cubes (32 km down to 7.8 m, each size turned another way
  so they don't line up), and each may hold one crater centred in its middle 40 %, its ball reaching
  at most 30 % of the cube: no crater reaches out of its cube, so a point only looks at the one cube
  it's in, thirteen looks in all. A crater is where its ball cuts the surface (a crater centred off
  the surface is just a smaller one): a bowl about a fifth as deep as it's wide (a ninth for the big
  ones, whose floors are flat), a rim a thirtieth as high, and ejecta sloping away to half a radius
  past the rim; most are old, shallow with soft rims, and the fresh ones are brighter inside and out.
  Under them, four layers of gentle rolling ground (9 m over 900 m down to 8 cm over 18 m). At
  Tranquility Base, measured every 2 m over 800 m square, half the ground slopes under 1.7° and one
  point in a hundred over 26° (50° at most, short of the 60° a wall is), with 27 m between the
  highest and lowest; at Tycho the slopes are steeper (13° in the middle) and the relief 229 m. A
  point costs a few microseconds with everything in (1.8 to 3.6 µs, measured in Node).
- **The ground** is a cube of six faces blown up into a sphere (equal-angle, so squares are much the
  same size all over a face), each face a quadtree: a square of 32 × 32 squares of ground is split
  into four where the camera (or the vehicle) is nearer its middle than 1.2 times its size, and
  joined again past 1.4 times, so it's a point every 1.3 m by the vehicle (squares 41.6 m across,
  the finest), every 13 to 26 m a kilometre off, and six squares for the whole Moon from space. A
  square surely over the horizon (from ground 150 m lower than under the camera all the way, to its
  own highest ground) isn't split. Each square's points are kept round its middle, so they're
  precise to the millimetre so far from the Moon's middle; where a fine square meets a coarse one a
  skirt hangs from their edges to fill the gap. Each is a plain mesh with its own bounding volume
  hierarchy (`raycast.js`), so the Driver, Ground, the boost pads and the globe's taps hit it as they
  hit Google's tiles; only the squares drawn are where they're raycast (`moon.terrain`: three.js's
  raycasts don't look at `visible`). Driving, about 240 squares are drawn, 2,304 triangles each
  with their skirts (about 550,000, of which about 400,000 were in view in the tests); squares are
  built 5 ms a frame at most, 40 ms while the loading screen is up. A square's smaller squares are
  only looked into once all four are built, so the ground comes down a size a frame, and the drop-in
  waits until a frame wants nothing more built.
- **Its look** is a shader of its own: the picture, brighter where moon-height.js says (fresh
  craters), Lambert's light with a share of Lommel-Seeliger's (how the Moon's dust really scatters
  light: its edge as bright as its middle at full Moon), a little earthshine where the sun doesn't
  reach, and within 220 m fine grit and gravel (a tile of speckle 4 m and 32 m across, triplanar by
  the Moon's own axes, each square's measured from a corner of a 512 m grid so neighbours' meet) so
  the ground is seen to move under you. Its frame is the Moon's own, as 3d-tiles-renderer's
  `Ellipsoid` has a body (Z through the north pole, X through 0° N 0° E), recentred on the place
  driven as the Earth's tiles are (`placeEarth`), and the globe (`GlobeView.setBody`) uses its size,
  its heights and its worked-out ground.

### How the Moon is tested

`npm run test:drive-moon-ui`: the globe turned to the Moon (its files fetched only then, its spots,
its words, NASA's credit, the Earth hidden), its search (names, other names, accents, coordinates,
nothing found), a drop-in at Tranquility Base (on its ground to 30 cm, the Moon's gravity, the
stars and the Earth in the sky, no water and no sea, the Moon's pad rules, its ground the only thing
driven on and at its finest by the vehicle), a hop as high as on the Earth that stays up 3 to 4.2 s
and scores nothing, M back to the Moon's globe with its own recent places, back to the Earth
(driving there as it was: its gravity, its water), `?spot=moon-tycho`, and a phone's sheet. The
tests drive the go-kart: the Moon's ground is heavy drawing without a GPU, about a frame a second
in Chromium's software renderer at 800 × 500.

## Driving with others

Other people driving World Drive show up as they drive: their car, in their own ride and Garage
look, with their name over it. Everyone is a **ghost**: cars pass straight through each other, and
other cars are never in the way of yours or of the camera. There's no chat. Two ways to be with
others:

- **Nearby** (the default). After you drop in, you're in the room for the area you're in (about
  11 km across) and see everyone else driving there, so a popular spot is busy.
- **A party.** **Invite friends** makes a link (`https://worlddrive.app/?party=CODE`); whoever
  opens it is in your party wherever each of you is, on the Earth or the Moon, and can join you
  where you are.

On the Moon it's the same, in the Moon's own rooms (see [Driving with others on the
Moon](#driving-with-others-on-the-moon)).

And on the globe, **who's driving now**: a glowing dot wherever people are driving in an area's
room, with how many (see [On the globe: who's driving now](#on-the-globe-whos-driving-now)).

It's only on when the Worker says so (`live: true` in `/api/config`, or for the Moon `liveMoon:
true`: the `LIVE` setting below, and [the day's budget](#the-days-budget) of that world not spent)
and the visit has a token, which every visit has (the Earth's, the Moon's and the owner's; the test
pad has none). When it's off, nothing of it appears: no chip, no **Drive with friends**, no H in
the keys card, no horn button, no dots or **Driving now** on the globe, and driving alone is as it
always was.

### What you see and do

- **The chip** in the driving bar, by the place's name: "Nearby · 5", "Nearby · just you",
  "Party · 3", "Nearby is busy" or "... · connecting", with a green light while connected (on a
  phone only the light and the count, so the place's name keeps its room; the words are its label
  for a screen reader). Tap or click it for **the list**, nearest first: each driver's name (⭐ for
  the Supporter Pass), ride and distance, or "paused", "on the globe" or "at <place>". **Go to** puts
  you 5 m to their right, facing their way: within 10 km, straight there in the same scene, on the
  ground (or the water) within 3 m of their car's height (as R takes it: never the roof, tree or
  deck over them); farther, or with no such ground, a drop-in at their spot in your own ride, which
  finds the street.
  **Hide** hides that driver for this visit (**Show** brings them back).
- **Other cars** are drawn 0.3 s behind where their drivers are, moving smoothly and turning with
  them: each page hears of the others' cars 5 times a second, and draws them along a curve through
  each of those words that leaves and arrives at the speed and heading it had there, so a car
  rounds a bend rather than cutting its corners (in the tests, a kart driving off and turning was
  drawn within 5 to 9 cm of where it really was at the median, and 45 cm at most, as close as it
  was at 8 words a second with straight lines between). A word that's late, it carries on along the
  bend it was taking. Each wears its driver's look, its underglow too (fading off the ground as
  yours does, by what its car sends). Their flame or boost style, trail, drift smoke and sparks,
  the bursts as their booster lights and runs dry and as a drift charges and pays out
  ([below](#how-boosting-and-driving-look)), overdrive's boom and streaks, the hovercraft's spray
  (and a sinking car's splash, from a page loaded while water was still a splash: [water](#water))
  show for the nearest 6 within
  300 m, and their wheels turn. A name tag hangs over each (hidden beyond 400 m), with a 📣 when they
  honk and "+1,234" when they land a trick. A car within 8 m of yours or of the camera turns
  see-through, so it never blocks the view. A paused driver's car stays parked where it stopped, and
  so does the car of a driver whose page goes out of sight (another tab or window in front of it,
  minimised, or a phone's screen off: the browser stops drawing it, so it sends nothing more, and as
  it hides it says it's parked, "paused" in the list); a driver back on the globe disappears, and so
  does a car with no word of it for 15 s. At most the
  12 nearest are drawn. A new ride or paint shows once it has held for a second (and no more than
  once every 5 s for each car; a new horn alone is no new model), swapped in when it's ready, so
  someone clicking through colours in the Garage (or changing ride twenty times a second on
  purpose) costs the others one build; a model
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
  car on your screen and everyone else's, and your horn from the [Garage](#the-garage) (the beep
  unless you've picked another) plays for your own honk, and each driver's own for theirs within
  150 m, quieter farther off (once you've clicked, tapped or pressed a key: browsers want that
  before sound). It's part of the look that travels, so a page hears each driver's horn as they
  picked it; one it doesn't know (from a newer page) is the beep. **Horn sounds** in the pause menu
  turns them off, and the Garage's horns played as they're picked too (kept in this browser, by
  `horns.js`). One honk every 0.8 s at most.
- **When it stops.** A dropped connection comes back by itself, waiting 1, 2, 5, 10 and then 30 s
  between tries, and so does one that goes quiet without a word (a network that drops everything):
  the page sends its keepalive when it has heard nothing for 25 s too, and with no answer 10 s later
  it's dropped. It stops for the rest of the visit when another tab with the same visit takes over
  ("Driving with others moved to another tab."), when the visit runs out after 6 hours ("Driving
  with others has ended for this visit (after 6 hours). It's on again on your next visit."), when
  the day's budget is spent ("Lots of drivers today: driving with others is back after midnight
  UTC.", once), when it's turned away at the door 8 times in a row while the Worker says it's on
  ("Driving with others couldn't connect from here, so you're driving on your own.": a network
  that blocks WebSockets, say, or an address past its share of that world's day, see [Bounded per
  address](#driving-with-others-on-the-moon), which ends it on both worlds), or, without a word, when it's switched off. Then none of it shows.
  Driving alone carries on. A party's link opened while the day's budget is spent says the same.

### What others can see about you

- **Your name**: the leaderboard nickname this browser has, with a ⭐ if it's linked to an account
  with the Supporter Pass and your [level and title](#levels) under it ("Lv 12 · Drifter"), looked
  up by the room from the player's id and secret as the page says hello (never a name or level the
  page says). Without one you're "Guest" and four figures, the same for the whole visit (made from
  it), so **Hide** holds and a friend coming back is the same guest. Never your Google name or
  email.
- **Your ride and its look** from the Garage (paint, decals, rims, underglow, boost, trail and horn).
  The look's parts are `LOOK_PARTS` in `live-protocol.js`; the room keeps only those, each an id
  (`checkLook`), so a page that doesn't know a part (one from before the underglow and the horn)
  never gets it, and one that doesn't know a choice draws its own instead.
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

**Timing.** A new driver shows within about half a minute: their room says where its drivers are
in a report 3 s after they've changed (someone joined, left, went to the globe or came back), but
no sooner than 15 s after its last report (a room's first, 15 s after its first driver connected),
so a page coming and going can't have a room report more than four times a minute; a dot moving to another rounded spot waits for the room's next report as
before (50 to 60 s after the last). Then `/api/online` is kept up to 30 s, and a page asks when the
globe shows and every 20 s while it's showing and the tab can be seen, but not while the Garage is
open over it, nor once nobody has touched the page (a click, tap, key or wheel) for 10 minutes: a
tab left on the globe on a second screen stops asking, and asks again at once at the next touch.
One who's gone goes the same way within about half a minute, or at once when their room empties
(its last report says none); a room that went without a word (a restart) is left out once its last
report is 12 minutes old. (Until November 2026 a room's first report came a minute after its first
driver, and a page asked once a minute: up to about 2½ minutes.)

**How it works.** Each area's room puts its dots (`live-protocol.js`'s `dotsOf`) in the reports of
what it has spent that it makes to `DriveLimits` anyway (`liveSpent`), which keeps them in a table
of its own, `live_online`: one row a room, replaced at each report, deleted when the room reports
none (or as it reports with the day's budget spent, as it then closes everyone); a row older than 12
minutes (the TTL: a room still there reports at least every 10 minutes and its next alarm) is left
out and deleted. A room knows what it last reported from what its connections keep through
hibernation, so waking up doesn't make it report again. `GET /api/online` answers the Earth's
`{ on, total, areas: [ { lat, lon, height, count } ], moon }`, and `GET /api/online?world=moon` the
Moon's, `{ on, total, areas, earth }`: at most 200 areas, busiest first (those of an area's rooms at
the same spot as one), `total` counting them all, and `moon` (or `earth`) how many are driving on
the other world, as its rooms last said. It's kept 30 s in Cloudflare's cache (the Cache API,
`caches.default`, under the address without its query but for `?world=moon`, which has a key of its
own, so no other query can get round it; each Cloudflare location has its own), and by browsers for what's left of that
(`Cache-Control: public, max-age=30` and the `Date` it was made), and by each Worker instance
(as plain values: what it last heard, answered with the same `Date`). Only a request that finds none
kept asks `DriveLimits` (`liveOnline`), which counts that ask against the day's budget in the same
go, as any Durable Object request. Cloudflare's cache doesn't make requests arriving together wait
for one another (each that finds nothing kept would ask), so while a Worker instance has an ask
out, the others it gets are answered with what it last heard, a little old and kept nowhere
(`max-age=0`), and an ask that doesn't come back within 5 s (its request cancelled) is given up on;
`/api/config`'s ask has the same guard. `on: false` (with total 0 and no areas) once that world's
budget is spent or switched off, asking nothing for it then (a Worker instance remembers a spent
day, as for `/api/config`, and an answer that it's off for the day is kept no later than midnight
UTC: a page told it's off shows none of that world's dots for the rest of its visit, though it goes
on asking for the other's count). Unless the other world is off too, an answer that's off still says
how many are driving on the other, as the other's own answer does (from wherever that's kept, or
asked for as a request for it would be, counted against the other's budget), so the page can point
there. If `DriveLimits` can't say, it's `on: true` with nobody, kept 10 s: never an
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
location is an ask every 40 s or so (each 20 s ask, every other one answered from the 30 s kept), about 90 an hour (a lone driver's room is about 93), and however many
watch in one location it's about 120 an hour there; it stops once nobody has touched the page for
10 minutes, so a tab forgotten on the globe costs 10 minutes' worth. Each such ask reads a row for
each area's room with drivers (rows read: Free 5 million a day). Every ask that reaches the Worker
is a Worker request (Free: 100,000 a day): a page on the globe asks every 20 s, and the browser
answers any ask within 30 s of the last itself.

### The rooms

Each room is one Durable Object (`DriveRoom`, `worker/drive/live.js`) on the WebSocket Hibernation
API: `party:CODE`, or `near:BAND.COL` for an area of the Earth (bands 0.1° of latitude tall, cut
into columns about as wide) and `near:BAND.COL#1` to `#3` for its other shards, and `moon:BAND.COL`
(0.36° bands) for the Moon's. What's said is `src/drive-app/live-protocol.js`, which the page and
the Worker both import:

- The page opens `GET /api/live?room=<room>` (with `&world=moon` for a party from the Moon) with the
  subprotocols `[ 'worlddrive-live.v2', 'worlddrive-live.v1', <visit token> ]` (a page from before
  the Moon had drivers, `[ 'worlddrive-live.v1', <visit token> ]`; see [Old
  pages](#driving-with-others-on-the-moon)), as a browser can't set headers on a WebSocket, and a
  token in the address would end up in logs. Before the room is touched the Worker turns away anything that isn't a WebSocket (426), from
  another site (403: the Origin must be worlddrive.app's own, as WebSockets have no CORS), while
  `LIVE` is off (503), to a room that isn't one (400), without the protocol (400), without a good
  visit token (401: forged, changed or run out), from a visit connecting more than 20 times a
  minute (429, on Cloudflare's rate limiter, `LIVE_CONNECTS`, which costs no Durable Object
  request) or more than 200 times a day (429, `LIVE_VISIT_CONNECTS`) or once the day's budget is
  spent (503 with `reason: 'budget'`, asked of `DriveLimits` only after everything else checks
  out; a Moon visit's address is held to its day's visits then too, 429). A v1 page asking for a
  Moon area, or a `world` that isn't one, is 400. The room gets only what was checked. A visit is in
  one room at a time: `DriveLimits` keeps
  each visit's room today (a `live_visits` table, deleted with the day), and when it connects to
  another the Worker has the room it was in let go of it first (4002, as another tab in the same
  room would be; one of its connections still on its way in there is turned away too), so one
  visit can't be in a hundred rooms at once.
- Positions are Earth-centred (ECEF metres) and turns a quaternion in that frame, so two pages
  centred on different places agree on where a car is; on the Moon, Moon-centred in its own frame. A page sends its car 5 times a second while
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
| `LIVE_DAILY_BUDGET` | 40000 (in `vars`) | The Durable Object requests a day it may use on the Earth; 0 is off there |
| `LIVE_MOON_DAILY_BUDGET` | 20000 (in `vars`) | The Moon's, apart; 0 is off on the Moon |
| `LIVE_ADDRESS_VISITS` | 20 (unset) | The most Moon visits (not counted by the Earth's caps) connecting from one address a day |
| `LIVE_ADDRESS_SHARE` | 8 (unset) | One address's connections may spend each world's budget over this in a day (5,000 on the Earth, 2,500 on the Moon); the owner's aren't counted |
| `LIVE_PARTY_MAX` | 8 (unset) | The most in a party |
| `LIVE_NEARBY_MAX` | 20 (unset) | The most in each of an area's rooms |
| `LIVE_VISIT_CONNECTS` | 200 (unset) | The most connections to rooms a visit makes in a day |
| `LIVE_CONNECTS` | 20 a minute (`ratelimits`) | The rate limiter for each visit's connections |

### The day's budget

On the Free plan, once all of an account's Durable Objects together have made 100,000 requests in
a day, every one of them fails until 00:00 UTC, `DriveLimits` included: `/api/visit` would fail
and nobody could start a drive. It isn't known which plan the account is on, so driving with others
keeps to a budget of its own, `LIVE_DAILY_BUDGET` billed requests a day (**40,000** in
`wrangler.drive.jsonc`), and the Moon's rooms to theirs, `LIVE_MOON_DAILY_BUDGET` (**20,000**,
counted the same way and apart, so neither world's shuts the other's: see [Driving with others on
the Moon](#driving-with-others-on-the-moon)), and leaves the rest for visits, names, scores and
searches. What follows is the Earth's; the Moon's is the same:

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
  with others is back after midnight UTC.", hides it all and drives on alone. With only one world's
  spent (the Earth's, say), it says so ("Lots of drivers on the Earth today: driving with others
  there is back after midnight UTC. You can still drive with others on the Moon."), hides it all on
  that world (the chip, the list, **Drive with friends**, the banner, **Driving now**'s areas and
  its dots: only its line to the other world stays, while anyone's there) and has it on the other; a
  party's link opened then says the same. A world switched off (its budget of 0) closes the same way
  without a word. At 00:00 UTC it's a
  fresh day: pages loaded after that have it again. Once a Worker instance has heard the day is
  spent it stops asking until the next day.
- **If `DriveLimits` can't say**, a room carries on as if it's open (and adds what it couldn't
  report to its next report, at its next alarm); `/api/config` and `/api/live` take it as off, so
  nothing new starts (`/api/config` with `liveReason: 'unknown'`), and a page already driving with
  others that's turned away keeps trying, asking `/api/config` the first time and then every 5
  minutes (each time while the Worker can't be reached at all).
- The count runs a minute behind (up to 10 for quiet rooms, with less than 5 each to add), which is
  why the budget isn't all of what's left: 40,000 of the Free plan's requests are left for the rest
  of the site (with the Moon's 20,000), and for the last minutes' driving.
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
| A room with drivers moving in it, an hour (an alarm and a report to `DriveLimits` each minute) | | 120, and 120 rows written (and one more a report for each address its drivers come from, its share's count) |
| A driver alone in a room, an hour, all told (its keepalives, the room's alarm about every 50 s, a report every 5 minutes or so) | 144 | about 93 (110 for a tab in the background, keepalives once a minute) |
| Connecting to a room (the Worker's ask, the connection, and an alarm 10 s later for its hello) | | 3 (and 2 rows written), 1 more on a change of room |
| A page load (`/api/config`'s ask, at most one every 30 s in each Worker instance) | | 0 or 1 |
| A page on the globe, an hour (`/api/online` every 20 s, kept 30 s; none after 10 minutes untouched, or with the Garage open) | | about 90 alone in its Cloudflare location; about 120 a location however many watch |

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

**On the Moon** everything above costs the same, counted against the Moon's own budget,
`LIVE_MOON_DAILY_BUDGET` (20,000 a day: about 20 driver-hours with others, or about 215 hours of
drivers each alone in their area's room), so the Earth's and the Moon's together are at most 60,000
of the Free plan's 100,000 a day, 40,000 left for the rest of the site. On Workers Paid both are at
most 1.8 million a month, 0.8 million past the included million: $0.12 a month at most; each 100,000
a day more on either is $0.45 a month. A Moon dot's ask (`/api/online?world=moon`) is kept 30 s
apart from the Earth's, so a page on the Moon's globe is the same ask a minute.

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

What's tested of the Moon's rooms, budget and pages is in [Driving with others on the
Moon](#driving-with-others-on-the-moon).

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
with an Earth budget of 40, spent by connecting: a page turned away toasting once that it's spent on
the Earth (and that you can still drive with others on the Moon) and showing none of it there, a party's link on a new page
saying why, both driving as ever. Who's driving now: a driver dropping
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
[Supporter Pass](#supporter-pass-content)'s Garage looks come with levels on the way to 49, and six
[cars](#world-drives-cars) from 5 to 40 (the pass still gives them all at once), and some rewards
only levels give, supporters included: titles for your nametag, the level badge's frame and four
colours. The pass's own rides (its first nine and its two showpiece cars, the hypercar and the
cyber muscle car) are never on the track. The rules are `src/drive-app/levels.js`, which the page and
the Worker both import, so the page shows what the Worker counts.

### How XP is earned

| What | XP |
| --- | --- |
| Each km driven, on the ground or flying | 20 |
| Each second in the air off a jump (not flying) | 3 |
| Each drift boost paid out | 8 |
| Each boost pad driven over | 4 |
| Each minute driving with others in your room (someone else there, driving on the same world: not on the globe, nor a party friend on the other world) | 6 |
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

⭐: a Supporter Pass look or car, which the pass unlocks at once; "levels only": the pass doesn't
give it. A car is driven from its level on (or with the pass), and is the first of its level's
rewards.

| Level | XP | Unlocks |
| --- | --- | --- |
| 1 | 0 | Title: Rookie; Steel badge |
| 2 | 200 | Sunburst paint ⭐ |
| 3 | 500 | Hearts boost ⭐ |
| 4 | 900 | Title: Joyrider; Red flame ⭐ |
| 5 | 1,450 | **Golf cart** ⭐; Lime paint ⭐ |
| 6 | 2,100 | White rims ⭐ |
| 7 | 2,900 | Plasma boost ⭐ |
| 8 | 3,800 | **Tuk-tuk** ⭐; Title: Drifter |
| 9 | 4,850 | Racing stripes ⭐ |
| 10 | 6,050 | Bronze badge; Neon blue underglow ⭐ |
| 11 | 7,450 | Teal paint ⭐ |
| 12 | 9,050 | Title: Street Racer; Frost boost ⭐ |
| 13 | 10,750 | Pixel boost ⭐ |
| 14 | 12,650 | Blue flame ⭐ |
| 15 | 14,850 | **Ice-cream van** ⭐; Title: Stunt Ace |
| 16 | 17,250 | Smoke trail ⭐ |
| 17 | 19,850 | Title: Speedster; Sky blue paint ⭐ |
| 18 | 22,750 | Electric blue paint ⭐ |
| 19 | 25,850 | Title: Trickster; Gold flame ⭐ |
| 20 | 29,250 | Silver badge; Lightning bolts ⭐ |
| 21 | 32,950 | Red rims ⭐ |
| 22 | 36,950 | **Lawn tractor** ⭐; Title: Explorer |
| 23 | 41,250 | Glitter boost ⭐ |
| 24 | 45,950 | Title: Globetrotter; Satin black rims ⭐ |
| 25 | 50,950 | Copper paint (levels only) |
| 26 | 56,350 | Number decal ⭐ |
| 27 | 62,150 | Title: Road Warrior; Spooky boost ⭐ |
| 28 | 68,350 | Green flame ⭐ |
| 29 | 74,950 | Title: Sky Pilot; Satin finish ⭐ |
| 30 | 82,050 | **Retro wedge** ⭐; Gold badge |
| 31 | 89,550 | Matte finish ⭐ |
| 32 | 97,550 | Title: Daredevil; Air horn ⭐ |
| 33 | 106,050 | Title: Trailblazer; Teal flame ⭐ |
| 34 | 115,050 | Violet paint ⭐ |
| 35 | 124,650 | Mint paint (levels only) |
| 36 | 134,750 | Title: Pathfinder; Candy apple red paint ⭐ |
| 37 | 145,450 | Blue rims ⭐ |
| 38 | 156,750 | Title: Storm Chaser; Neon green underglow ⭐ |
| 39 | 168,650 | Title: High Flyer; Dragon fire boost ⭐ |
| 40 | 181,150 | **Formula racer** ⭐; Platinum badge; Purple flame ⭐ |
| 41 | 194,350 | Title: Thrill Seeker; Camo ⭐ |
| 42 | 208,250 | Title: Wheel Wizard; Chrome rims ⭐ |
| 43 | 222,850 | Title: Night Owl; White-hot flame ⭐ |
| 44 | 238,150 | Title: Road Captain; Gunmetal paint ⭐ |
| 45 | 254,250 | Plum paint (levels only) |
| 46 | 271,050 | Title: Cartographer; Pearl finish ⭐ |
| 47 | 288,650 | Title: Supersonic; Afterburner boost ⭐ |
| 48 | 307,050 | Title: World Tourer; Fanfare horn ⭐ |
| 49 | 326,350 | Title: Icon; Purple underglow ⭐ |
| 50 | 346,450 | Title: Legend; Legend badge; Champion gold paint (levels only) |

That's 41 of the pass's 88 Garage looks (8 of its 17 colours, 3 of its 6 finishes, 4 of its 8
decals, 5 of its 10 rim colours, 3 of its 9 underglows, 8 of its 17 boost styles, 7 of its 10 flame
colours, the smoke trail and 2 of its 5 horns; a colour unlocked is a smoke colour too). The later
looks (the underglow, the horns, the boost styles, flame colours, paint, finishes, decals and rims
added with them) went where the track had a title or a badge alone, one at each, so the track has a
look to drive for to the end. The showiest stay the pass's alone: jet black, forest green, royal
blue, hot pink, sunset orange, sand, pearl white, navy and burgundy paint, metallic, chrome and
colour-shift, flames, checker, polka dots and two-tone, gold, lime, pink, bronze and neon green
rims, the ice blue, hot pink, red, amber, white and rainbow underglows, the lightning, comet, neon
rings, fireworks, ink, galaxy, butterflies, neon laser and slime boosts, pink, rainbow and ice
flames, the sparkle, rainbow ribbon, fire, shooting stars and neon streak trails, and the bike horn,
ahooga and laser. The four level-only colours are in `paint.js`'s `SWATCHES` with `levelOnly`.

The cars come about as often as a regular comes back for more: the golf cart in a first session,
the tuk-tuk within the first hour, then each a little further apart than the last (15, 22, 30,
40), so there's always one ahead until the formula racer at about 45 hours. The odd small ones come
first and the fast ones later. They're `ride` rewards in `REWARDS` (`rideLevel`, `rideUnlock` and
`rideLocked` say what a ride needs); the pass gives all six with the rest of its rides.

### What the Supporter Pass gives

Every Garage look at once (the 41 on the track and the 47 that are the pass's alone), the six cars
on the track and its own eleven rides, **+50% XP**; and still a ⭐ and 30 drives a day
([below](#supporter-pass-buying-it)). Levels' own rewards (titles, badges, the level-only colours)
come with levels for everyone, supporters too. The ×1.5 is the Worker's: it looks up the pass of the
account the player is linked to, never anything the page says.

A supporter has the track's 41 pass looks and its six cars already, so for them those levels bring
nothing new:
18 of their level-ups from 2 to 39 (2, 3, 5, 6, 7, 9, 11, 13, 14, 16, 18, 21, 23, 26, 28, 31, 34
and 37). The page says so rather than "Unlocked": a level-up says "Already yours with the pass:
Sunburst paint" (or "Golf cart, Lime paint"), the profile card's "Next" is the next reward that's
new to them, and the track tags those looks and cars "✓ Pass". What levels add for a supporter is the titles, the badges and the
level-only colours.

### What you see

- **Driving**: a slim XP bar under the place's name, with your level ("Lv 7") and, on a wider
  screen, "1,240 / 1,600 XP". Small pop-ups under it, batched every 10 s of driving: "+46 XP · 1.4
  km · 6 s air · 2 drift boosts", and at once for "New area +100 XP", "Furka Pass +250 XP", "Daily
  bonus +125 XP · 2 days in a row" and "+50 XP · tricks". On a phone the count goes and the pop-ups
  sit at the left, under the horn. Toasts while driving move down under them.
- **A level-up**: a burst of rays and "Level 7!", with "Unlocked: Plasma boost" (three at most, and
  "+6 more", when several levels came at once: the track has them all; a title says "Title:
  Drifter", a car "Ride: Tuk-tuk" with its picture). A look there opens the Garage (pausing the
  drive) to try it on; a car opens it on that car. It goes after 5 s (10
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
- **The ride pickers**: a level's car, while it's locked, wears "Lv 8 · or Pass" where the pass's
  own wear its badge; picked, it says "The tuk-tuk comes at level 8: you're level 3. Drive on, or get
  it now with the Supporter Pass." under the rides, the panel scrolling to it (the pass's opens its
  sheet), and the ride doesn't change. From that level on it's driven like any other; one saved
  before is the pickup until then, as a pass ride is without the pass. The Garage's tab for it says
  "Lv 8" and its banner "Comes at level 8, or with the ⭐ Supporter Pass".
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
  wherever that nickname is. **One account, one player:** signed in (Google or a username), every
  browser drives as the account's player, its oldest (`accounts.js`'s `accountPlayer`,
  `POST /api/player/mine`). The first browser signed in gives the account its player; any other is
  handed that player with a secret of its own (`player_keys`; the player's own secret stays the
  first browser's), and a nickname made there before signing in is folded into it and deleted: the
  higher XP of the two (never the sum), the later streak, the achievements' counts the more of each,
  and all of both's discoveries, achievements, scores, challenge times and visits, the account's
  player's kept where both have one (a best score keeps the higher). Its name is free again. A
  player that's another account's is left alone, and a key is never used to move a player to
  another account. A browser's key goes as it signs out (the page sends it with
  `DELETE /api/session`, and forgets the player), and every key of the account as it signs out
  everywhere: a shared computer doesn't go on driving as you. Accounts with several players from before still
  show the level of their best (`xpOf`) until each browser has signed in once more. (Each player's
  XP is its own, and the caps below are each player's: an account's players added up would let
  several players' caps add up too.) The page reports what it drove every 2 minutes while
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
spots: [ SPOTS ids ], daily, days?, feats? }`: id the page's own for the report (8 to 40 letters, digits,
`_` or `-`), tricks the landed runs' XP, and only in a claim, days `{ xp, streak, day }`, the days'
bonuses counted in the browser before the nickname; feats `{ moon, looks, rides }`, when there's
anything in it, the [achievements'](#achievements-and-rewards) counts only the page can tell. Anything the page couldn't send (a negative or
non-number amount, a count that isn't whole, an area that isn't one, a spot that isn't one, over 200
of either, an id or days that aren't) is a 400; a forged, changed, expired or another player's
visit a 403 (`reason: 'visit'`), the wrong secret a 403 (`reason: 'player'`). The answer: `{ xp,
own, level, gained, unlocked: [ rewards ], supporter, title, chosen, streakDay, streak, accepted: {
areas, spots }, daily?: { streak, xp }, repeated? }`: xp and level the account's best (or the
player's), own the player's own XP, title the one shown and chosen the one picked (`''` for the
newest), streakDay and streak the last daily bonus's day and its days in a row; earned the
achievements the report reached, and to a report with nothing in it whose body asks for them
(`feats: true`, the page's once as it starts) feats, all the player's and their account's, once a
visit ([achievements](#achievements-and-rewards)). A report with
nothing in it changes nothing, and is how the page asks where it stands as it starts.

The page says what it drove, so the Worker can't know it's true. What it does is keep each report to
what could have been driven in the real time since the player's last (`progress_at`, kept in D1;
for a player's first report, the claim, an hour):

| Cap | |
| --- | --- |
| Time counted | 5 minutes at most per report (an hour for the first, the claim) |
| km | 450 km/h of it: faster than any ride goes flat out with the booster (the hypercar's 215, doubled), flying or not |
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
from 2 to 50 gives something, level 2 within the first drive's bonuses, its six cars (each a car
the leaderboard takes, spread out from level 5) and the pass's own rides never on it, a level's car
locked until its level unless with the pass and the pass's own whatever the level, 41 of its 88
looks on it by level 49 and the showiest not, the later looks each where a title or a badge was
alone, every look a choice the Garage has, the level-only
colours never with the pass, the Garage's locks, a supporter's "Next"), reports'
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
and a level-up saying the pass looks are theirs already, and a supporter's report earning ×1.5;
the cars levels bring (at level 7 the tuk-tuk locked, "Lv 8 · or Pass", picked saying which level
and opening the pass from there, its Garage tab and banner; the golf cart driven, a pad's XP making
level 8, whose level-up says "Ride: Tuk-tuk" with its picture and opens the Garage on it; then the
tuk-tuk driven from the pause menu and on the track at 8; with the pass every car at once, and a
level-up's car already the supporter's; at level 50 the pass's showpieces still locked); a
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
instead (`src/drive-app/pass.js`): what the pass is and what comes with it (seventeen more rides,
thirteen cars, six of which levels bring too, and four built in code, each with its picture in two
rows; every Garage look at once, which levels otherwise unlock some of over time; +50% XP; a ⭐ by
your name on the leaderboard, 30 Earth drives a day instead of 1) and its buy
area (`buyArea()`), which says **Coming soon** until the payments code fills it. The sheet also opens from **⭐ Supporter
Pass** under the rides on the globe and in the pause menu. A ride or a look saved while the pass was
on falls back to the pickup, or to the free choices, without it (a level's car, until its level).
Nothing comes up by itself: the
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
| Hovercraft | 4.2 × 2.1 m | 135 km/h | No wheels: it floats 16 cm up on its skirt, over [water](#water) too (which every ride drives on), throwing up spray there; slides wide through every turn (about 50° at 50 km/h, under 10° for the others), glides on and stops slowly, and bounces on its cushion |

Wheels spin and front wheels steer (the monster truck steers all four, the back ones the other way);
the monster truck's body rides on springs that sink and rebound as it lands and lean it out of
turns; the hovercraft bobs, its fan spins up with the gas and its rudders follow the steering.
Nothing turns in the air faster than the kart, whatever its handling: the leaderboard's limits
(`SCORING` in `worker/drive/scores.js`) take the kart's rate as the most there is. Each
has a driver: behind tinted glass in the coupe and the truck, at the front of the bus (with its
passengers), in the open on the hovercraft. They follow the free rides in the picker with a drawing
each (in their paint) and the badge until the pass is on.

### World Drive's cars

Fourteen cars from Sketchfab, each made ready to drive by `scripts/add-drive-car.mjs` (below) and
tuned in `src/drive-app/cars.js`. The muscle car is free; six come with [levels](#the-unlock-track)
(from the golf cart at 5 to the formula racer at 40) or the pass, whichever is first; the rest only
with the pass, locked like the rides above. In the picker they come after the free rides: the
levels' cars in the order the levels bring them, then the pass's, each with its own picture. With
twenty rides, the globe's panel has them in three rows and the pause menu in two, both scrolling
sideways (the one picked in view; three across on the panel and four in the pause menu, the next
column peeking in at the edge to say there are more, as a scrollbar may only show while scrolling;
on a phone about three across, the next peeking in, so each locked one's badge fits), so neither is
taller than it was with twelve and what's under them (the Garage, the pass, the pass's sign-in in
the pause menu) stays on screen; the Garage's row of rides scrolls to the one shown.

| Car | Model (CC BY 4.0) | Size | Top speed | Handling |
| --- | --- | --- | --- | --- |
| Muscle car (free) | "Classic Muscle car" by Lexyc16 | 4.7 × 2.1 m, 1.4 m tall | 175 km/h | 0 to 100 in 3.3 s. Loose: grip a little over the kart's, drifts that swing the tail far out; its paint is plain colour, so the Garage repaints it |
| Golf cart (level 5) | "Golf Cart" by pixelsquare | 2.4 × 1.2 m, 1.6 m tall | 70 km/h | Tiny and twitchy: 57 km/h after 3 s, darting into turns at a touch (195°/s at walking pace), sliding out easily and thrown up by every hit (3.2 m by the wall at 70 km/h); its body sways out of turns |
| Tuk-tuk (level 8) | "Pakistani Rickshaw" by aminzafar | 2.7 × 1.3 m, 2.0 m tall, three wheels | 85 km/h | Slow and nimble: turning almost on the spot, leaning hard out of every turn, over on its side from a landing more than 26° off upright (a car takes 40°) and spun round hardest by a knock; its green panels take the Garage's paint |
| Ice-cream van (level 15) | "Ice Cream Car Low_Poly" by Sidra | 4.8 × 2.4 m, 3.6 m tall with its cone | 120 km/h | 0 to 100 in 7.3 s, swaying, turning wide (84°/s at 50 km/h), barely thrown up, squashing and shaking when it hits something |
| Lawn tractor (level 22) | "Lawn Tractor" by mirrol | 2.0 × 1.1 m | 60 km/h | The slowest of all, turning on the spot at walking pace (200°/s), light enough to be thrown high and bounce when it lands; plain orange paint, so the Garage repaints it |
| Retro wedge (level 30) | "Stylized low-poly retro sports car" by Serg_Stark... (Serg_str) | 4.2 × 2.0 m | 190 km/h | 0 to 100 in 2.9 s. Light at the back: gripping well until the tail steps out into long drifts |
| Formula racer (level 40) | "Stylized Formula One car" by TimMod | 4.6 × 2.3 m, 1.0 m tall | 210 km/h | 0 to 100 in 2.5 s; grips hardest, turns in sharpest at speed (the most of anything at 50 km/h) and stops hardest, but its lock is a racer's |
| Neon racer | "Green Bug Stylized Scifi Car Free" by ferofluid | 4.3 × 2.3 m | 185 km/h | 0 to 100 in 2.5 s, the quickest of the first six cars; grips hard and turns in sharply (131°/s at 50 km/h) |
| Night cruiser | "Blade Air Stylized Scifi Car Free" by ferofluid | 4.6 × 2.1 m | 205 km/h | 0 to 100 in 3.8 s. Long-legged and heavy: slow to turn, rolls on and on off the gas, thrown less by a hit |
| Dune buggy | "Dune Buggy \"jump\"" by XP_Frost | 3.5 × 3.1 m (its wheels out on long arms) | 145 km/h | 0 to 100 in 3.1 s. Light and bouncy: loose on the road, thrown highest of the cars, slow to fall, landing up to 50° off upright and bouncing |
| Farm truck | "Farm pickup truck" by Nekitron | 5.0 × 2.25 m, 2.8 m tall | 115 km/h | 0 to 100 in 9.4 s, turning wide (79°/s at 50 km/h), barely thrown up, squashes and shakes the view more |
| Police cruiser | the police car of "LowPoly Cars Pickup, Sedan, Police, StationWagon" by JG3D | 4.0 × 2.3 m | 180 km/h | 0 to 100 in 3.5 s. A steady all-rounder; plain black-and-white livery, no words or crest |
| Hypercar (the pass's showpiece) | "Fictional supercar - V12 Goblin" by ollitei | 4.6 × 2.2 m, 1.2 m tall | 215 km/h | The fastest of everything and the quickest away (0 to 100 in 2.1 s), gripping nearly as hard as the formula racer; low, so a hit throws it a little less |
| Cyber muscle (the pass's showpiece) | "Futuristic Muscle car (Launch Control Ready)" by Jungle Jim | 4.7 × 2.5 m | 200 km/h | 0 to 100 in 2.7 s. Heavy and powerful: the longest, widest drifts of the cars; its black panels take the Garage's paint, the orange stays |

Their wheels spin with the speed (each by its own size) and the front ones steer, turned against a
drift as the rides' are; the tuk-tuk's lone front wheel steers. The tall, narrow ones (the golf
cart, the tuk-tuk, the ice-cream van and the lawn tractor) lean out of a turn: their body, not their
wheels, rolls by up to their `lean` (rad, 0.13 for the tuk-tuk) at full lock from 43 km/h, and is
upright again in the air. Nothing turns in the air faster than the kart, as for the rides.

**Driver's seats.** Each car's `cab` is where its driver's eyes are for the driver's-seat camera
(**C**), checked by looking from it: over the bars and wheels in the formula racer and the lawn
tractor, over the steering wheel in the golf cart, behind the green panel in the tuk-tuk. The
ice-cream van and the retro wedge have their windows painted on (one picture with the rest of the
body, nothing to see through), the cyber muscle car's tinted glass has an instrument display drawn
over it (its cabin shows through, but from inside the road would be seen through the picture), and
the hypercar has no inside (its model is its outside alone), so their seat is a bonnet camera,
over the bonnet just in front of the windscreen.

**Where they live.** `drive/public/cars/`: each car's `.glb`, its picture in `thumbs/`, `cars.json`
(file, size, wheels, triangles and the source: title, author, link, licence) and `CREDITS.md`.
`vite.drive.config.js` makes `drive/public/` World Drive's public folder, so only its build publishes
them (at `/cars/...`); the construction app's library (`public/library/`) and its build never see
them. They add 7.1 MB to the built site (6.97 MB of models, the biggest 1.08 MB, and 113 kB of
pictures), and a model is only fetched for the car being driven or looked at in the Garage (or
driven by someone in your room). CC BY asks for credit: each car's model, author, licence and link (and what was
changed) are in the About box, under the ride picker while it's picked, and in `CREDITS.md`.

**Adding a car.** `npm run add-drive-car -- <sketchfab url> --id night-cruiser --length 4.6 --front=+z`
(with the same Sketchfab token as `add-asset`), then `npm run drive-car-thumbs -- night-cruiser`, then
its name, blurb, tuning and whether it needs the pass in `cars.js` (or a `ride` reward in
`levels.js`'s `REWARDS` for a level's), its id in `DRIVE_CARS` (`catalog.js`) and its facts in the
test's `FACING`. The importer:

- checks the licence (downloadable, CC0 or CC BY only) and prints the description, to read for anyone
  else to credit (`--credit`) and any conditions;
- bakes the model to its real size (`--length` along the front axis `--front` names), facing -Z on
  y = 0, with nothing left in its transforms; `--up` stands up a model saved lying on its side or
  back (`+z` for one whose up is +z; `--front` then names the front once it's upright); `--part
  <node>` takes one car out of a set, and `--leave` leaves out nodes or materials that aren't the car
  (a shadow drawn on a plane under it, the patch of ground or the stand it was shown on, a shell
  over its body), so they don't count in its size either;
- finds the wheels by shape, whatever they're called: a tyre is a piece of its own standing on the
  ground at a corner, about as long as it's tall, and whatever sits wholly inside its circle (rim,
  hub, disc) turns with it. Each wheel becomes a node at its axle (`wheel-front-left`...) with its
  radius and whether it steers; the rest is `body`. A model whose tyres are joined to the body, or
  rigged, is turned away with the reason. `--tyres` names the material (or node) the tyres are made
  of, where something else would pass for one (the formula racer's front wing's end plates, low at
  its corners, did); `--trike` takes a three-wheeler, its lone wheel in the middle at one end
  (`wheel-front`, steering, for the tuk-tuk);
- `--paint` and `--rims` name the materials the Garage may repaint (the muscle car's body and rims);
  `--lit` shades a model drawn unlit, as the rest of the world is;
- `--lamps` names the material of lamps drawn as a real maker draws theirs (three bars a side is one
  maker's mark): each side's become one plain lamp, the box round them, and the credits say so;
- `--blank "number plate=car_body:0.148,0.137,0.231,0.243"` paints over a patch of a material's
  pictures (a real place's number plate, a sticker), in every picture it has (colour, normals and
  the rest), with the colour just round it: the patch's corners as shares of the picture from its
  top left, found by looking at the picture. The credits say what was painted over;
- compresses it (meshopt, WebP textures up to `--max-texture`, 1024; `--simplify` if it's heavy).

The muscle car, say, was `--id muscle-car --length 4.7 --front=+z --paint Material --rims Material.001
--lamps Material.004`. The eight after it:

| Car | Imported with |
| --- | --- |
| Golf cart | `--id golf-cart --length 2.4 --front=+z` |
| Tuk-tuk | `--id tuk-tuk --length 2.7 --front=-z --trike --paint Green --rims LightGray` |
| Ice-cream van | `--id ice-cream-van --length 4.8 --front=-z` |
| Lawn tractor | `--id lawn-tractor --length 2 --front=+z --paint Cart_Color --rims Tire_2` |
| Retro wedge | `--id retro-wedge --length 4.2 --front=+z` |
| Formula racer | `--id formula-racer --length 4.6 --front=+z --leave Bolid_f1:Asphalt --tyres lambert2` |
| Hypercar | `--id hypercar --length 4.6 --front=-z --leave car_shadow,clearcoat --blank "number plate=car_body:0.148,0.137,0.231,0.243"` (the clearcoat is a second skin over the body that the conversion of its old spec/gloss materials made opaque black; the patch is its New York plate, in the corner of its body's pictures) |
| Cyber muscle | `--id cyber-muscle --length 4.7 --front=+z --paint Body_gameasset_Mat_1` |

Look at a new car in the Garage and from its driver's seat (C) to check which way it faces: by its
seat, steering wheel, lamps and exhaust. The dune buggy was first imported back to front, so it
drove tail first (its wider axle is the rear one, not the front). It was turned round in its file
rather than imported again: each part's node turned 180° about y, the wheels renamed front for rear
and left for right (the new front pair steering), `cars.json`'s wheels to match, and its picture
drawn again. Its one seat is in the middle, so its driver's-seat camera is too. Imported again from
Sketchfab, it needs `--front` to name the side its seat, steering wheel and lamps face in the
downloaded model (the opposite of the side first used), or it comes back tail first; the car checks
in `test-drive-pro-ui.mjs` would say so (its steering pair must be the narrower axle).

Since then each car is checked that way, by something about it that turns round with it, seen when
it was imported (`FACING` in the test): its steering axle the narrower (the hypercar, the cyber
muscle car) or its tyres the smaller (the lawn tractor); its nose shorter than its tail (the golf
cart, the tuk-tuk, the ice-cream van, the cyber muscle car) or longer (the formula racer, the
hypercar); its body highest behind the middle (the retro wedge's roof, the formula racer's wing,
the hypercar's); a three-wheeler's lone wheel steering. A car added after these without one fails
the test. Each was also looked at from ahead, behind and its left side as imported, driven on the
test pad (pictures as it went away from the camera, turning) and from its driver's seat.

`drive-car-thumbs.mjs` draws every picture the same way (World Drive's dev server in Chromium, the
car from ahead and to its left, on nothing), whatever Sketchfab's own pictures were.

**Choosing them** (Sketchfab, 31 October 2026: downloadable, CC0 or CC BY, under 60,000 triangles;
and again on 4 November 2026 for sports cars and supercars, and fun and odd rides, up to 120,000).
CC0 cars hardly exist there, so all fourteen are CC BY. Turned away was anything named after or drawn
from a real car, maker, film or game (names, tags, descriptions and textures read), anything whose
wheels couldn't be made to turn, and other people's concepts:

| Model | Author | Verdict |
| --- | --- | --- |
| [Classic Muscle car](https://sketchfab.com/3d-models/classic-muscle-car-641efc889e5f4543bae51d0922e6f4b3) | Lexyc16 | ✔ Muscle car: a generic 1970s coupe with no badges, but its tail lamps were three bars a side, a well-known maker's mark, so the importer makes each side one plain lamp (`--lamps`); separate wheels; plain colours, so paintable; 5,500 triangles |
| [Green Bug Stylized Scifi Car Free](https://sketchfab.com/3d-models/green-bug-stylized-scifi-car-free-34f1a7734d474b34a8291f613a581ccb) | ferofluid | ✔ Neon racer: an original sci-fi design, separate wheels, clean textures (no writing); 27,000 |
| [Blade Air Stylized Scifi Car Free](https://sketchfab.com/3d-models/blade-air-stylized-scifi-car-free-8444b0a772624900a68049e270a01c29) | ferofluid | ✔ Night cruiser: original; wheels separated by shape; 15,000 |
| [Dune Buggy "jump"](https://sketchfab.com/3d-models/dune-buggy-jump-c9838cac69904010923d5024168b0893) | XP_Frost | ✔ Dune buggy: a tube-frame buggy of no make (a race number only); wheels separated by shape; 29,000 |
| [Farm pickup truck](https://sketchfab.com/3d-models/farm-pickup-truck-5615b16ba2e24f7ab6cd26eda7946ae8) | Nekitron | ✔ Farm truck: a hand-painted old truck of no make, separate wheels; 5,400 |
| [LowPoly Cars Pickup, Sedan, Police, StationWagon](https://sketchfab.com/3d-models/lowpoly-cars-pickup-sedan-police-stationwagon-8fb25f8fc1064f4d88a98294c757eef5) | JG3D | ✔ Police cruiser (its police car only): generic livery with no words or crest, blank plates; 6,000 |
| [Fictional supercar - V12 Goblin](https://sketchfab.com/3d-models/fictional-supercar-v12-goblin-0a20e49ad5774d778567cb5c3f345786) | ollitei | ✔ Hypercar: the author's own design ("a fictional car design project"), its badge the design's own, wheels separate; a shadow plane and a clearcoat skin left out, and its New York number plate (with the author's web address on it) painted over (`--blank`); 66,000 |
| [Stylized Formula One car](https://sketchfab.com/3d-models/stylized-formula-one-car-1e3caa8d9f8f4f5287ed33e1267fac33) | TimMod | ✔ Formula racer: an open-wheeler of no team, in plain bronze, no sponsors or numbers; the patch of ground it stands on left out; 32,000 |
| [Stylized low-poly retro sports car](https://sketchfab.com/3d-models/stylized-low-poly-retro-sports-car-55ec976f0cb347fcb7cba7912f77d907) | Serg_Stark... (Serg_str) | ✔ Retro wedge: a generic 1980s wedge coupe, louvres over its back window, no badges or plates; 6,400 |
| [Futuristic Muscle car (Launch Control Ready)](https://sketchfab.com/3d-models/futuristic-muscle-car-launch-control-ready-47d7ffa796d84d1bbdebe9a007028e0e) | Jungle Jim | ✔ Cyber muscle: an original cyberpunk muscle car, separate wheels, plain black panels; 103,000 |
| [Golf Cart](https://sketchfab.com/3d-models/golf-cart-5637f77fc2fd42439b006802741c1cc0) | pixelsquare | ✔ Golf cart: a chunky blue cart of no make; 10,500 |
| [Pakistani Rickshaw](https://sketchfab.com/3d-models/pakistani-rickshaw-0d0c90ca58cc49f2bfcd43619f9e3111) | aminzafar | ✔ Tuk-tuk: a generic three-wheeled rickshaw in plain colours (a blank plate), each wheel its own part; 7,300 |
| [Ice Cream Car Low_Poly](https://sketchfab.com/3d-models/ice-cream-car-low-poly-83900ff5231944569eda3ee2bc98a230) | Sidra | ✔ Ice-cream van: an old van of no make with a cone on its roof, "ICE CREAM" its only words, wheels separate; 3,300 |
| [Lawn Tractor](https://sketchfab.com/3d-models/lawn-tractor-97ec916314324ed8a828176f3d310f82) | mirrol | ✔ Lawn tractor: a "simple retro lawn tractor" of no make, plain colours; 9,900 |
| [Ice Cream Truck](https://sketchfab.com/3d-models/ice-cream-truck-57ba94f1def5409d8588a15d497e1368) | Pooi Woon Hoh | ✘ "Modeled after Sugar Shack", a real ice-cream truck's livery under a changed name |
| [Generic Sport Coupé Car](https://sketchfab.com/3d-models/generic-sport-coupe-car-820a13c4831c41959ce75e6c2014e882) | MMC Works | ✘ A good GT coupe, but rigged: its wheels hang off bones |
| [Golf Kart \| DAE IGP \| MoustacheKart](https://sketchfab.com/3d-models/golf-kart-dae-igp-moustachekart-4c961dfb4e9748539a18d2838d35d1a5) | Félicien Lebegge | ✘ Rigged too |
| [Substance Futuristic Sports Car](https://sketchfab.com/3d-models/substance-futuristic-sports-car-1eee26c0b72342ddbec8601a6d05620d) | Samize | ✘ Textures for a model whose design is another artist's concept (the model's own page says so) |
| [Le Mans Prototype](https://sketchfab.com/3d-models/le-mans-prototype-8f711f4dc62648fb8b9d5b3c6c1ec931), [Cyberpunk Car HyperCar Stylized](https://sketchfab.com/3d-models/cyberpunk-car-hypercar-stylized-c0d1ea5206bc4eadad4afe51577c31f6) | mudkipz321, ImADefaultCube117 | ✘ Each "based on" a named real car |
| [low poly supercar](https://sketchfab.com/3d-models/low-poly-supercar-6a00959ab47b4fc5b08e8c92590904bd), [El Triello '70](https://sketchfab.com/3d-models/el-triello-70-retro-styled-model-fefa94b06cce47ab8ce4d96b973336dd), [Exterminator '00](https://sketchfab.com/3d-models/exterminator-00-low-poly-model-857f048c4bbb40b4be4fb0b765a52116), [Club '90](https://sketchfab.com/3d-models/club-90-low-poly-model-5c3f4d1c558746808711eb84ec4b5731) | the 86 guy, Daniel Zhabotinsky | ✘ Real cars' shapes: an Italian supercar's, a famous 1970 wedge concept's, a 2000s American coupe's, and a golf-cart maker's (by its name too) |
| [Riva Speedster](https://sketchfab.com/3d-models/riva-speedster-2a69ee87b41f48b18d08fc6c1eb9055d) | leoferraro | ✘ Named after a boat maker, shown on its stand |
| [Modern Sport Car 3D Concept - Firestorm Inferno](https://sketchfab.com/3d-models/modern-sport-car-3d-concept-firestorm-inferno-92cf1159a0314ad8880dbc720be6880c) | jojoclaim | ✘ All black (and a logo on it): a silhouette on the road |
| [Ice Cream Truck](https://sketchfab.com/3d-models/ice-cream-truck-7b99fd196e7d414290688ed19c0dc7bd), [icecream truck challenge - o' trerrote](https://sketchfab.com/3d-models/icecream-truck-challenge-o-trerrote-efdffc58c8de442cacf2a13256650d10) | AlessioPassera, ross.afeltra | ✘ A tutorial's design, its cone twice the van's height; a well-known Italian three-wheeler's shape |
| [Autorikshaw - Indian Tuk Tuk](https://sketchfab.com/3d-models/autorikshaw-indian-tuk-tuk-5775d012693741008acff9dad410e92d) | bhagathartworks | ✘ One mesh with see-through textures that drew as patches |
| [The Ducky Kart](https://sketchfab.com/3d-models/the-ducky-kart-e042fc3fc3344a92854f0e7d943956db), [Vintage Kart (CycleKart)](https://sketchfab.com/3d-models/vintage-kart-cyclekart-962316b91e914fc1808f6fb574b46ba5), [Soap Box Racer I Built When I Was 11](https://sketchfab.com/3d-models/soap-box-racer-i-built-when-i-was-11-1f5e044044a140adbcf78edf0e23ca61), [Sigma](https://sketchfab.com/3d-models/sigma-752b0562e5d8463fa5864cde0620c8bb), [Pizza Food Vendor Truck](https://sketchfab.com/3d-models/pizza-food-vendor-truck-f9faf8cfe0b44b6ca1dc146411bc651b) | Coco Jinjo, Mike_hbrt, Jorma Rysky, NETRUNNER_pl, siapap | ✔ for later: fine, but eight was enough this time (a rubber-duck ride-on, a 1920s-style cyclekart, a home-made soapbox, a three-wheeled open sports car, a van with a slice of pizza on its roof) |
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
| Body colour | Blaze orange, racing red, ice white | Sunburst (2), lime (5), teal (11), sky blue (17), electric blue (18), violet (34), candy apple red (36), gunmetal (44) | Jet black, forest green, royal blue, hot pink, sunset orange, sand, pearl white, navy, burgundy | Copper (25), mint (35), plum (45), champion gold (50) |
| Finish | Gloss | Satin (29), matte (31), pearl (46) | Metallic, chrome, colour-shift | |
| Decal | None | Racing stripes (9), lightning bolts (20), a number, 0 to 99 (26), camo (41) | Flames, checker, polka dots, two-tone | |
| Rims (a hovercraft's trim) | Silver, graphite | White (6), red (21), satin black (24), blue (37), chrome (42) | Gold, lime, pink, bronze, neon green | |
| Underglow | None | Neon blue (10), neon green (38), purple (49) | Ice blue, hot pink, red, amber, white, rainbow | |
| Boost style | Classic flame, bubbles, confetti, music notes, cherry blossom | Hearts (3), plasma (7), frost (12), pixel (13), glitter (23), spooky (27), dragon fire (39), afterburner (47) | Lightning, comet, neon rings, fireworks, ink, galaxy, butterflies, neon laser, slime | |
| Flame colour (the classic flame's) | Orange | Red (4), blue (14), gold (19), green (28), teal (33), purple (40), white-hot (43) | Pink, rainbow, ice | |
| Trail (boosting or flying) | None | Smoke (16; its colours as the body colours unlock) | Sparkle, rainbow ribbon (six bands side by side), fire, shooting stars, neon streak | |
| Horn | Beep | Air horn (32), fanfare (48) | Bike horn, ahooga, laser | |

With so many choices, a row of the groups sits over them (**Paint**, **Rims**, **Underglow**,
**Boost**, **Trail**, **Horn**; a hovercraft's **Trim**, and a truck's paint and rims left out),
staying at the top as the choices scroll, each going straight to its own and the one in view lit.
The one gone to stays lit while the list scrolls there and while it sits there: on a wide screen
Trail and Horn together are shorter than the list, so going to Trail ends at the bottom, where the
last group would otherwise count as the one in view. Where the list is decides it, not what moved
it: once the list turns back on its way, stops short (still for ten frames after the scroll's end,
or after each scroll where the browser doesn't say when one ends), or moves on from where it went
(the wheel, a finger, the keys, the scroll bar, Tab moving the focus, find in the page, a drag
starting on the row), the one in view is lit again. A choice picked there keeps it lit: a part
shown or hidden below what's in view leaves the list where it was or pulls its end up (the place
gone to coming up with it), and one above has the browser keep what's in view where it was, which
is just where going to the group now leaves the list. Another ride shown (or a ride's paint
turning out to be its model's, the first time it's shown) while the list is still on its way sends
it on to that group's place on the new list, worked out once all of the new list is in place (its
decal's number box and the word on paint that can't be changed too), so the group stays lit all
the way there: shown the muscle car on the kart's way to Trail, the list goes on to the end of the
car's list with Trail lit, not the horn. A ride that doesn't show the group (a car whose paint is its
model's has no Paint or Rims) stops the list where it is, and the one in view is lit. With the list
sitting where it went, another ride keeps the group lit only if the list sits just where going to
that group on the new list would leave it: from a bus gone to Trail, at the end of its list, to a
monster truck whose smoke's colours make its list longer, the list is no longer at its end, and the
one in view is lit. Closing the Garage ends a jump still on its way; opened again, the one in view
is lit.
Everything stays in the one list, so nothing's behind a tab. A swatch has no word on it, so the
colour picked is named at the end of its part's heading (BODY COLOUR ... Candy apple red). On a
phone, at 375 px across, the six fit in one line; on a narrower one that line scrolls sideways by
itself, never the page.

**Finishes.** Satin is between matte and gloss; pearl a soft sheen (a quarter as strong as it can
be) over a deep clear coat with a faint shimmer of colours (a thin film's iridescence), the sheen
white over halfway to the paint's own colour, mixed as the colours look (sRGB), so navy is still navy
and candy apple red still red (a full white sheen laid silver over dark paint and turned red salmon
pink, and mixed as light, dark paint's being next to none, the tint was nearly grey); chrome a mirror
tinted with the colour (on white, plain chrome); colour-shift dark metal in the colour under a thin
film whose reflections turn
through the colours as the ride turns, as oil's on water do, with a sheen of a hue a third of the way
round the colour wheel at its edges. They're three.js's `MeshPhysicalMaterial` (iridescence and
sheen), made once each and shared, like the others. **Rims** are shiny metal in their colour unless
the choice says otherwise: chrome a mirror, satin black dull, neon green glowing a little of its own.
**Decals**, drawn like the first ones: lightning bolts down the sides (the ⚡ sign lying on its side,
white-hot to yellow, as flames are); camo (olive with khaki, dark green, brown and black blobs, the
same every time) and polka dots (white, or dark on light paint) all over. Camo goes down onto the
whole top of the bodywork and in from both sides through a box taller than the side's, each from
nose to tail, its blobs as big on top as on the sides. Dots go through the top's box (three rows
across it) and about the side's own (as many whole rows as come nearest to dots that size, so
they're about as big on the sides as on top). Each picture is made for its box's size so the blobs
and dots come out round, and each projection goes only onto the faces turned within 50° of it: a
projection draws its picture out along a face it meets at a slant (by 1 / cos of the angle), and
through a side's box made taller a dot reached up onto a kart's side pod's top and came out a dash
across it. Now a dot is drawn out 1.56 times at most; what one projection leaves, another meets head
on, or it's left bare (the nose and tail, and with dots the tops of a kart's side pods). Two-tone is
a second colour (charcoal, or silver under dark paint) from the middle of the doors down to the
bottom of the bodywork, from nose to tail, with a pinstripe over it.

**Underglow** (`src/drive-app/underglow.js`) is a neon glow on the ground under the ride and round
it, on every ride: the kart, the built rides, the cars and the library's trucks (paint or not), on
the Earth and the Moon, on the turntable and under the others' ghosts. It isn't a light, which would
cost every car a pass over the whole scene: it's one flat mesh in the ride's own frame, 5 cm over the
ground its wheels stand on, drawn additively (no depth written) with a soft picture that's brightest
at the edge of the footprint and fades out past it, so it's one draw call whatever the ride. It's
sized from the ride's own box as its look goes on (a skinned body's, the pickup's, as its bones place
it), spreading 0.45 of the ride's width past it (0.6 to 1.4 m) on every side; the mesh is nine pieces,
the picture's corners rounded and its middle stretched along the sides, so the spread is the same
on a kart as on a bus. Its own box is left empty, so nothing that measures the ride (drive.js's size
and chase camera, the ghosts', the turntable's) counts it. Off the ground it stays 0.3 s (a bump in
the road doesn't flicker it), then fades out over 0.6 s, as the ground it lights falls away: off a
jump, flying, or (a car on an older page) sinking in water; back on the ground it's lit again
within a moment. Yours follows what you're doing (main.js, each frame), a ghost what its driver's
car sends (its flags). The
rainbow goes round the colours every four seconds. Back on the globe the ride, and its glow with
it, isn't drawn.

**The horn** you honk with (**H**) is part of the look too (`src/drive-app/horns.js`): each a short
sound made with WebAudio as it's needed (oscillators, a filter and a gain), nothing to load, none
longer than the 0.8 s between honks. The beep is as it always was; the air horn three low buzzing
notes at once; the bike horn two rubber-bulb squeaks; the ahooga an old car's swooping buzz; the
fanfare four notes up a chord; the laser two falling zaps. Picking one in the Garage plays it, a
locked one too (heard before it's bought, though picking it doesn't keep it), unless **Horn sounds**
is switched off in the pause menu: `horns.js` keeps that switch (`hornsOn`, `setHornsOn`) for the
honks and the Garage alike. Only those [driving with you](#driving-with-others) hear it: your honk in
your horn, theirs in theirs.

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
| Music notes | Eighth notes and beamed pairs in bright colours, rising and swaying away, all bobbing to one beat (two a second) | A chord: a ring of notes thrown out round the exhaust |
| Cherry blossom | Pink petals fluttering out behind, tumbling over and over as they drift down, and now and then a whole flower | A gust of blossom swirling out round the exhaust |
| Afterburner | A jet's long blue cone with a row of white shock diamonds burning in it, throbbing, a rosy glow at its tail and blue sparks streaming off it | A shock ring blown out behind, diamonds shot back down the cone, and a spray of sparks |
| Frost | Snowflakes turning as they drift, and glints of ice, out of a cold mist | Shards of ice thrown out all round the exhaust, a cold puff and a flurry of snow |
| Galaxy | A violet flame streaming twinkling stars through drifting pink and blue clouds of nebula | A little spiral galaxy, two arms of stars swirling out round a bright core |
| Dragon fire | A deep red flame roaring out tongues of fire that cool from orange to a deep red, with glowing embers floating up and curls of dark smoke | A roar: a fireball of tongues, a shower of embers and a ring of smoke |
| Butterflies | Butterflies in bright colours fluttering up and away, wings beating, each wandering its own way | A flutter of butterflies bursting out every way |
| Spooky | Glowing wisps curling up out of a ghostly green flame, and now and then a little ghost floating off behind, bobbing as it goes | "Boo!": a ring of ghosts popping out round the exhaust, and a puff of wisps |
| Neon laser | A laser show: beams in cyan, pink, lime and blue fanning up and out behind and sweeping, with bolts of light shot along them | A starburst of beams all round at once, and a hoop of light |
| Slime | Blobs of green goo flung out behind, wobbling as they fly, bubbles that swell and pop, and puddles on the road for a couple of seconds | A splurt of blobs in a fan, a froth of bubbles and a puddle or two |

The flame colour was the Garage's only boost choice before the styles. It's now the classic flame's
colour, shown under it, so a look saved before (a flame and no style) is the classic flame in the
colour it had; without the pass (or the level) a saved style is the classic flame again, as anything
else locked goes back to its free choice. The flames' cones and glow are added to what's behind
them, so they glow, but the red flame's outer cone and glow (and the galaxy's violet flame's) are
drawn over it, the cone with a red-hot core (the galaxy's a violet one) added to it: added to a
bright sky or a grey road, a red only ever came out salmon, between the orange and the pink, and
the galaxy's flame white with a violet edge (`DEEP` in `drive-fx.js`, a style's `deep`). Drawn over
what's behind them, the order matters: three.js draws see-through things farthest first, a mesh by
the middle of its bounds and a sprite (the glow) by where it is, so with bounds of their own the
outer cone, whose middle is half its length back, would be drawn last from behind, over the core,
hiding most of it, and the look would change as the turntable turned. Both cones' bounds are a ball
round the exhaust, where the glow is (still round all of the cone however it's stretched, so it's
never left out of view while any of it is on screen), so the three are as far from the camera from
any side, and three.js draws them in the order they were made: the cone, the core over it and the
glow over both.

Each style is one batch of quads drawn from one picture sheet, in one draw call (dragon fire and
spooky two: their glowing parts are added to what's behind, their tongues of fire, smoke and ghosts
drawn over it, so the fire stays red and the ghosts white against a bright sky): billboards, strips
along a line (a bolt, a comet's tail, a laser's beam, a tongue of fire) or quads flat across a
normal (a ring, a splat on the road). The sheet is drawn once on a canvas, 6 by 6 pictures of
128 px: soft glows, stars, a heart, pixels, rings, bubbles, splats, sparks, a shock diamond, a
snowflake, notes, a petal and a blossom, a ghost, a shard of ice, a puff of cloud, a butterfly, a
wisp and a beam. A style has a fixed number of particles, made once with its buffers (its budget,
40 to 280; the oldest is reused when they're all in use), and each frame only the numbers in its
buffers change, so
nothing is made while boosting. Most of what's thrown out is carried along at 85 to 97 % of the
vehicle's speed (ink and a comet's tail less), with the air slowing only its own motion, so at
150 km/h it trails a few metres behind, between the vehicle and the chase camera, rather than being left on the road, which at that
speed is behind the camera in a tenth of a second. The supersonic effects are one more batch (120).
On the test pad (software rendering in the test's browser), a minute of boosting each made nothing
new (no geometries, textures, programs, objects or materials) and kept within its budget (at most
205 alive, glitter's); the driving and its effects took 0.1 to 0.2 ms a frame with any style, and
drawing them added 2 to 10 % to a frame for most, and up to a fifth for those that cover the most
of the view (lightning 15 %, fireworks 22 %). The ten styles that came after them, timed the same
way but on a machine busy with other test runs (so the times are rougher), took 0.2 to 0.3 ms a
frame, added under a tenth to a frame for most and about a seventh at most (dragon fire 14 %, the
galaxy 11 %), and had at most 167 particles alive (the galaxy's).

Choices are kept for each ride in this browser (`world-drive.garage` in localStorage) and put on
whenever it's driven; picked while paused they're on it as soon as it drives on. A look saved before
the underglow and the horn has none and the beep. A browser that keeps
nothing (site data blocked) still wears them for the visit, and a damaged value there is simply
replaced by the next choice. Decals are projected
onto the bodywork through boxes each ride gives (its `userData.decals`). The trucks from the library,
and the cars whose paint is a picture on the model (all but four), keep their own paint: only their
underglow, boost, trail and horn change, and the Garage says so ("Its paint is part of the model, so
it keeps it").
The muscle car's, the tuk-tuk's, the lawn tractor's and the cyber muscle car's paint is plain colour,
so they take colours, finishes, rims and decals as the rides do (the free ones without the pass).
A level's car, or the pass's, can be looked at and its look chosen before it's yours, as a pass
ride's can; its choices open the pass's sheet until then. A ride in the colour and finish it came in
keeps its own materials, so the kart nobody has painted is just as it was. The trails are cheap: a
pool of sprites (smoke, sparkles, fire's tongues, recoloured from gold to red as they cool, and the
shooting stars, turning as they fly) or one ribbon whose buffers are rewritten in place (the
rainbow's six bands, or the neon streak's two lines of light off the back corners, each a white core
in a glow of cyan or pink), nothing made each frame. A ribbon is laid as the ride goes, so on the
turntable (which turns the ride but never moves it) it would fold up into a short arc behind it:
there (the Garage tells the effects so, `preview`) its points are carried back out of the ride's
back as if it drove on, at 2.5 of its lengths a second (`RIBBON_SHOW`), so it's drawn out as on the
road, curving away as the turntable turns. Anywhere else it's as it was: stopped on the road (pinned
against a wall while boosting, hovering at the flying ceiling, a ghost standing still), it isn't
going anywhere, and folds up behind it. On the
test pad (software rendering in the test's browser), the booster's flame made a frame about 7 %
slower and a trail behind it a few per cent more again; the driving and its effects took 0.2 to
0.3 ms a frame with or without them. While the Garage is open the world behind it isn't drawn (its
turntable is, with a renderer of its own): on a phone, where it fills the screen, drawing both took
two to four times as long a frame.

`node --test scripts/test-drive-pro-ui.mjs` tries all of this on the test pad with no key: the locked
rides and choices opening the sheet, `?pro=1` counting only on this computer, the free kart
unchanged, each ride driving, drifting, thrown up by a wall and landing, their handling measured
against each other, the hovercraft hovering with no wheels and riding over the test pad's sea
(spray behind it there only, no boost pads on it) and the coupe driving across it too with none,
the monster truck over
a car, the
Garage's choices on the ride and kept across a reload (and still made with a damaged saved value,
or none kept at all), the free and locked choices of each part (the underglow and horns too) and
the levels' new looks saying their level, the row of groups going to each (Trail lit on every
frame, never the horn, from the top of the list until it has got to its end and stopped there,
waited for rather than timed, and the same with the muscle car shown while the list is still on its
way; the one in view lit again once the wheel turns it, once Tab moves the focus back up the list,
and once another ride's longer list is shown with the list at rest, and Trail kept lit on one whose
list ends just there), a horn
played as it's picked (a locked one too, not kept), the underglow under the kart, a
ride, two cars and the pickup (its footprint and the same margin all round, just over the ground,
the ride's size as it was), the new finishes (pearl's sheen tinted toward the paint), rims and
decals on the coupe and the kart, camo and polka dots on every ride that takes decals drawn out no
more than 1.65 times anywhere (each triangle's stretch, from its corners and its picture), a ghost
wearing its driver's underglow (fading off the ground, a new horn building no new model) and their
horn heard in its own sound (one this page doesn't know the beep, yours in yours), Horn sounds
switched off in the pause menu silencing the honks and the Garage's horns alike (and on again, both
heard), the world not drawn behind the Garage, the frame time with trails, nothing
turning in the air faster than the kart, each ride going supersonic, the boost styles in the Garage
(five free, the rest opening the sheet, each with its picture and saying what unlocks it: "Pass", or
"Lv 12 · or Pass" for those on the track), a look saved before the styles keeping its flame's colour,
every style drawn at 150 km/h (with a picture of each), making nothing new in a minute of boosting
and timed, every flame colour drawn in its own colours and every trail drawn (seen from behind and
off to the side, a good deal more than the flame alone), the ribbons drawn out on the turntable
(more than 3 m behind a 2 m ride in three quarters of a second) and as they were standing still
anywhere else and moving, and the Garage (375 px across, its row of
groups all on screen, no sideways scrolling, Trail lit when it's tapped, all the way until its
heading is under the row, and the one in view once a finger drags the list back) and the locked
rides' badges (and the levels' cars'
"Lv 8 · or Pass") on a phone. `test-drive-ui.mjs` drives the kart with an underglow (on the ground
under it and round it, left out of its size, staying through a bump, fading out off the ground and
flying, back as it lands), and `test-drive-moon-ui.mjs` has it lying on the Moon's ground. And the
cars: each listed in `cars.json`, `cars.js` and `DRIVE_CARS` alike, one free, six
levels' and the rest the pass's, under 2 MB, CC BY or CC0 and in `CREDITS.md` (with what was
painted over: the hypercar's number plate, there and in About), its real size (the
small odd ones shorter, the ice-cream van taller with its cone), with four wheels (the tuk-tuk
three) and the front ones steering, facing the way it drives (`FACING`, above); without the pass
the muscle car free, pictured, credited under the picker and in About (all fourteen, with links),
driving, drifting, thrown up by a wall and landing, and the others opening the sheet; with it each
car driving, drifting, thrown up and landing, going supersonic, its wheels spinning and the front
ones steering the right way, the leaning ones' bodies leaning out of the turn, its size as imported,
a picture from its driver's seat, and their handling against each other (among the first six the
night cruiser fastest, the neon racer quickest to 100, the dune buggy thrown highest, the farm truck
slowest; among them all the hypercar fastest and quickest, the formula racer turning sharpest at
50 km/h, the golf cart, the tuk-tuk and the lawn tractor slower than every other, the lawn tractor
slowest); the Garage repainting the muscle car (colour, rims, decals) and the tuk-tuk, the lawn
tractor and the cyber muscle car (colour, stripes and a number on their bodywork), and saying the
others keep their paint, with only an underglow, boost, trail and horn to pick.

## Supporter Pass (buying it)

The pass is a **subscription** (`SUPPORTER_PRICE`, CA$1.99/month as set), through a Stripe Payment
Link in World Drive's own Stripe account, and lasts while the subscription is active. Passes bought
before it was a subscription (one payment each, no subscription id) are **legacy passes, kept for
good**. It comes with what's [above](#supporter-pass-content) (seven cars of its
own, the six levels bring, the four rides and every Garage look at once), **+50% XP** for
[levels](#levels), a **⭐ by your name on the leaderboard**, and **30 Earth drives a day** instead of 1.
A pass is an account's (Google's sign-in, or a [username and password](#username-and-password-accounts)),
so it's yours in any browser you sign in on: signing in is only ever for the pass and your level
and times on every device, and driving and the leaderboard never need it.

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
- **The used-up screen** ("Today's free Earth drives are used up", this address's 8 gone, not everyone's
  300) has the same sign-in, for a supporter on a new browser or one who cleared the site's data, and
  for a buyer brought back from Stripe before its webhook arrived (that tab starts a visit of its own,
  counted by the address until the pass is known). Once the account there has the pass, the visit
  is asked for again, once: a supporter who has had their 30 sees the screen, saying who's signed in.
  (Already driving on the Moon from that screen, the page reloads instead.)
- Wherever Google's button is, **Or use a username and password** opens the account panel, to sign
  in or create an account without Google ([Username and password
  accounts](#username-and-password-accounts)); signed in, **Account** in the account line opens it.
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
- `GET /api/me`: `{ signedIn, name?, email?, google?, username?, supporter, purchase: { enabled,
  link?, price?, clientReferenceId? } }`: `google` whether a Google account is linked (`name` and
  `email` are its, `''` without one), `username` the account's own username or `null` (see
  [Username and password accounts](#username-and-password-accounts)).
- `POST /api/player/link { id, secret }`, signed in: the leaderboard player (proved by its secret, as
  a rename is) becomes the account's (`players.account_id`); 20 a day from one visitor.
- `POST /api/player/mine { id?, secret? }`, signed in: `{ player: { id, name, secret? } | null,
  merged? }`, the account's player for this browser. With no player, the account takes this
  browser's (as `/api/player/link`); with one that isn't this browser's, it's handed over with a
  `secret` of this browser's own, and this browser's player (unlinked, or the same account's) is
  folded into it (`merged`). A player sent that doesn't check out is as none. 401 signed out; 20 a
  day from one visitor (with `/api/player/link`). The page asks once for each player and account
  (`world-drive.linked.2`).
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
- **Subscriptions** (`0010_supporter_subscriptions.sql`): a checkout through a subscription link
  (`mode: 'subscription'`) keeps its subscription's id on the purchase. `customer.subscription.created`,
  `.updated` and `.deleted` keep each subscription's status (`subscriptions`), an older event never
  overwriting a newer one. `active`, `trialing` and `past_due` (Stripe still retrying the card) keep
  the pass; anything else (`canceled`, `unpaid`, `incomplete_expired`, `paused`) takes it away until
  it's active again. A subscription's renewals are charged on its invoices, not its checkout, so to
  refund a subscriber, cancel the subscription in Stripe (that takes the pass away), then refund.
- **Who has the pass** (`hasPass`): an account with a purchase that isn't refunded (and, for a
  subscription, still active), its own or one paid with its email by someone not signed in, or whose
  email is in `SUPPORTER_EMAILS`. `/api/me` also says `subscribed: true` when it's a running
  subscription's, and the sheet then links to `SUPPORTER_MANAGE_LINK` (**Manage your subscription**). It's looked up
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
| `SUPPORTER_PAYMENT_LINK` | `vars` | The Payment Link, `https://buy.stripe.com/00weVc36c5rVaPE7F4frW01` (live, public) |
| `SUPPORTER_PRICE` | `vars` | The price as the page shows it: `CA$1.99/month` |
| `SUPPORTER_MANAGE_LINK` | `vars` or dashboard text, optional | Stripe's customer portal login link, `https://billing.stripe.com/p/login/...`: where subscribers cancel or change their card |
| `PER_VISITOR_DAILY_SUPPORTER` | `vars` | A supporter's Earth drives a day (30) |
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
     `charge.refunded`, `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated`,
     `customer.subscription.created`, `customer.subscription.updated` and
     `customer.subscription.deleted` (an endpoint made before the pass was a subscription needs the
     last three added: **Edit** → **Select events**)
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

### Switching the pass to a subscription

1. **Stripe** (live, World Drive's account): **Product catalog** → the pass → **Add another price**:
   **Recurring**, monthly (or whatever you choose), e.g. CA$1.99. Then **Payment Links → New**, with
   that price, the same **After payment** redirect (`https://worlddrive.app/?supporter=thanks`) and
   quantity locked.
2. **Deactivate the old one-time link** (Payment Links → the old link → **Deactivate**), so nobody
   can buy a lifetime pass any more. Passes already bought through it stay (legacy).
3. **The webhook**: add `customer.subscription.created`, `customer.subscription.updated` and
   `customer.subscription.deleted` to the endpoint's events. The signing secret doesn't change.
4. **Optional: the customer portal**, so subscribers can cancel themselves: Settings → Billing →
   **Customer portal** → activate it and copy its **login link** into `SUPPORTER_MANAGE_LINK`.
5. **`wrangler.drive.jsonc`**: the new link in `SUPPORTER_PAYMENT_LINK`, the price as it should read
   in `SUPPORTER_PRICE` (`CA$1.99/month`), and if `SUPPORTER_PAYMENT_LINK_ID` is set in the
   dashboard, the new link's `plink_...` there. Commit and push: the deploy applies
   `0010_supporter_subscriptions.sql` first.

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
- Runs in the pass's rides and cars, and the levels' cars, are accepted on the leaderboard from
  anyone at any level (`PASS_RIDES` and `DRIVE_CARS` in `scores.js`): the lock is in the page, so a
  row may show one of those by a name without a ⭐ or at a lower level. Likewise the cars' models are public files, as the library's are.
- No receipts or purchase history in the page: Stripe emails its own receipt if that's on in its
  settings.

## Username and password accounts

Beside **Sign in with Google**, an account can be made with a **username and a password**, for
people who don't want to use Google, or can't (a school's or a shared computer, no Google account
at all). It's the same kind of account with the same session: the Supporter Pass (bought or
restored on it), the player linked to it and so its level and XP, its leaderboard and challenge
times and ghosts, the nickname and the Garage are the account's, whichever way you signed in. A
Google account can add a username and password, and a username's account can link Google; then
either signs in to the one account. Driving and the leaderboard still never need an account.

### What people see

- **Where Google's button is** (the pass's sheet, the pause menu, the used-up screen), a link under
  it: **Or use a username and password** (or, with Google's sign-in not set up,
  **Sign in or create an account**). It opens the **account panel**, a dialog of its own: Google's
  button (when it's set up), "or", and a small form with two tabs, **Sign in** and **Create
  account**. Signed in, the account line says "Signed in as *Racer_1* · ... · **Account** · Sign
  out", and **Account** opens the panel again. Where the pass is bought (its sheet, and the toast on
  signing in) the line names a Google account by its email, since that's whose the purchase is, and
  the pause menu by its name; an account with no Google account by its username.
- **Creating an account**: Username ("3 to 20 letters, digits, _ or -. Only you see it: the boards
  show your nickname.") and Password ("At least 8 characters. A few words together make a good
  one."), then, in a box: "There's no email here, so a forgotten password can't be recovered,
  unless you also link Google. Keep it in a password manager." The rules are checked in the page
  before anything is sent (the same code as the Worker's, `password-rules.js`), then the robot
  check (Turnstile, usually without a click), then the account is made and signed in.
- **Signing in**: a wrong password and a username nobody has both say "Wrong username or password."
  After a username's fifth try of the day that didn't get in (or an address's twentieth) the next
  asks for the robot check first (the panel does it and tries again), and a try from the same
  address within 5 s of its last at that username says "Wait 5 seconds and try again."
- The panel's title says what it's for: "Sign in", "Create account" (with that tab chosen) or
  "Your account". Keys pressed in it are its own (Esc closes it, and never resumes a paused drive
  behind it), and only a tap outside it closes it, not one on its padding beside a field. While a
  form is sent its fields are disabled, which drops the focus to the page behind; it's put back in
  the field or button that had it once the answer's in, so typing again after "Wrong username or
  password." goes to the field. And while the panel is open, a key whose focus has fallen out of
  it anyway never reaches the game (M would otherwise leave a paused drive for the globe).
- **Signed in**, the panel ("Your account") lists what the account signs in with (Google: its
  email, or "not linked"; Username: it, or "none"), then **Sign out** and **Sign out everywhere**
  (every device's session), the commonest things done here, in sight at once on a phone held
  either way. Below them each rarer change is folded under its heading, a row with a chevron (a
  `<details>`), and opening one folds the others, so the panel is about a screen on a phone (before,
  with every form open, a phone held upright scrolled 1,084 px in an 818 px panel to reach Sign
  out). The forms are in the page all along, folded or not, so password managers still find them;
  Google's buttons in a section are drawn the first time it's opened.
  - **Change password** (current, new: "This signs you out on your other devices."), or for a
    Google account with no username yet, **Add a username and password** ("Then you can sign in
    either way."): the username and password, then "Then confirm it's you with Google:" and
    Google's button, which sends them.
  - **Link Google** ("Sign in with Google too, and get back in if you forget your password"): "Your
    password", then Google's own button ("Continue with Google"), which links the Google account
    chosen. With it linked, **Unlink Google**, confirmed with Google's button ("this signs you out
    on your other devices"), only while there's a username to sign in with instead (else the panel
    says "To unlink Google, add a username and password first: it's your only way to sign in.").
  - With both, **Remove username and password**: "Your password" and the button, or "Or confirm
    with Google:" and Google's button.
- The forms are real `<form>`s with `<label>`s and `autocomplete` (`username`, `current-password`,
  `new-password`; the change form carries the username hidden), so password managers fill them and
  offer to save; the username field doesn't capitalise or autocorrect. On a phone held upright the
  panel fills the width, and scrolls only once a change is opened.
- **The panel is its own chunk** (`account.js` and `account.css`), loaded the first time it's
  opened: 13.6 kB of script (4.7 kB gzipped) and 3.9 kB of CSS (1.1 kB), none of it on the first
  load. The links and the account line are a few lines in `supporter.js`, which was already loaded.

### The rules

- **Usernames** (`src/drive-app/password-rules.js`, shared by the page and the Worker): normalised
  with NFKC and trimmed, then 3 to 20 of `A`-`Z`, `a`-`z`, `0`-`9`, `_` and `-`. Only plain Latin
  letters, so a Cyrillic а can't pass for an a; NFKC makes a full-width Ｒ an R first. Two are the
  same whatever their case: they're unique by their lower case (`username_key`), so "Racer_1",
  "RACER_1" and "Ｒacer＿1" are one. And through the nickname's filter (`names.js`'s `nameAllowed`):
  slurs, and names that pass for World Drive (admin, worlddrive, support, moderator...) are refused.
  A username is private: it's for signing in, shown only to its owner in the panel, never on a
  board, a nametag, the admin page or anywhere else. The boards show the nickname, as before.
- **Passwords**: at least 8 characters and at most 128 bytes (after NFKC, so the same passphrase
  typed on another keyboard is the same; 128 bytes is a long passphrase, and keeps what's hashed
  bounded), not one of about a hundred of the very commonest (`password1`, `12345678`, `qwertyuiop`,
  `iloveyou`, `worlddrive`..., in any case), not one letter over and over, and not the username.
  No other rules: as NIST's SP 800-63B says, rules about digits and symbols make passwords people
  can't remember, not ones others can't guess.

### How passwords are kept

- **PBKDF2-SHA-256** through WebCrypto (`crypto.subtle.deriveBits`), with a **random 16-byte salt**
  for each password, made anew every time one is set, and a 32-byte result. Kept in `logins`
  (base64url) with the **iteration count it was made with**.
- **100,000 iterations**, the most the Workers runtime allows: workerd has a cap on PBKDF2's count
  ("Pbkdf2 failed: iteration counts above ... are not supported"), set to 100,000 on Cloudflare
  (local `wrangler dev` doesn't apply it: 100,001 ran there). OWASP asks for 600,000 for
  PBKDF2-SHA-256 today, so this is as strong as Workers can make it, not as strong as wished; a
  memory-hard hash (scrypt, Argon2) in WebAssembly would be stronger but costs far more CPU than
  the Free plan's 10 ms.
- **What it costs**: measured in workerd (`wrangler dev`, a 4-core machine with SHA extensions,
  while other work ran): 16 to 18 ms of CPU a hash at 100,000 (8 ms at 50,000, 2 ms at 10,000), and
  Node the same, 17.7 ms. Cloudflare's machines may well be quicker. That's over the **Free plan's
  10 ms of CPU a request**, which Cloudflare allows "infrequently" ("each isolate has some built-in
  flexibility"): a sign-in, a sign-up or a password change is rare next to everything else the
  Worker answers, and the limits below keep a stranger from making them often. On **Workers Paid**
  (30 s a request) it's nothing. A password change hashes twice (the current one, then the new),
  and a sign-in with an older count twice; everything else once.
- If sign-ins were ever cut off for CPU on the Free plan (Error 1102 on `/api/account/*` in the
  Worker's metrics), **the remedy is Workers Paid** (30 s of CPU a request, so a hash is nothing).
  `PASSWORD_ITERATIONS` (a dashboard text variable, 10,000 to 100,000) lowers the count for new
  hashes at once, without a deploy, but it helps far less than it sounds: it makes **sign-ups,
  password changes and the sign-ins after each password's rehash** cheaper, and nothing else.
  **Refusals stay at 100,000** (a wrong password or a username nobody has always costs the
  stand-in's count, below: that's the trade chosen, so a refusal's time never says whether a
  username is someone's), and **the first right sign-in of each password made before costs more**,
  not less: its own 100,000 to check it, then a hash at the lowered count to keep it (150,000 at
  50,000). Whenever a password's count isn't the one new hashes are made with (lowered, raised again
  later, or if Workers ever allows more: `ITERATIONS` in `logins.js`), it **is hashed again at its
  next right sign-in** with a new salt (`changed_at` says when), since each row keeps its own count.
- Compared in **constant time** (`crypto.subtle.timingSafeEqual`, or an XOR of every byte without
  it), so the time doesn't say how much matched.
- **A username nobody has** is hashed against a stand-in (a random salt and random "hash", made once
  per Worker instance, which nothing can match) at 100,000, the most any stored hash can have, so it
  takes one hash's time, as a wrong password does, and gets the same 401 "Wrong username or
  password". A wrong password for a hash made with fewer (`PASSWORD_ITERATIONS` lowered) is hashed
  on to make up the difference, so **every refusal costs 100,000 iterations**, lowered or not, and
  its time never says whether the username is someone's (a Node test adds up every hash's
  iterations for each case, and times them: 17.6 to 20.3 ms each). Measured as whole requests to `wrangler
  dev` (the median of four each, November 2026): 29.7 ms for a wrong password and 28.4 ms for a
  username nobody has on the quietest run, 32.5 and 31.5 ms, and 38.9 and 38.0 ms with other suites
  running beside it; the two always within a few percent of each other. (The day's failure counts in
  `DriveLimits` don't tell them apart either: a username that can't be one is counted under its
  lower case, as a real one would be.)
- A password is **never logged, kept or sent anywhere** but the sign-in, sign-up and password posts
  to the Worker; the page doesn't keep it (the fields are emptied after a change), and the Worker
  only hashes it. The test suites look for the passwords they used in what the Worker logged and
  kept, and in every request the page made elsewhere.

### Guessing, and how it's slowed

- **Each try is counted as it's checked** (`DriveLimits`' `passwordCheck`, asked before hashing,
  counts it in the same go, as a Durable Object answers one call at a time), and given back once it
  gets in (`passwordSucceeded`). So tries sent all at once are counted one after another: a test
  sends 40 wrong passwords from one address at once and gets 20 refusals and 20 robot checks, and
  40 for one username from 40 addresses, 5 and 35 (counting only after the hash, as at first, let
  38 of 60 through).
- **Per username**: after a username has had **5 tries in the day** that didn't get in
  (`FREE_FAILS`, from anywhere), each further try for it needs a **robot check** (Turnstile; a 403
  with `reason: 'robot'` without one, which the panel answers by running the check and trying
  again). So a script guessing one account from many addresses needs a solved robot check for every
  guess.
- **Per address**: after a visitor (an address, an IPv6 one by its /48, as challenges count) has had
  **20 such tries in the day** (`ADDRESS_FAILS`), whatever the usernames, each further try from it
  needs a robot check too; and past **200** (`HARD_FAILS`) it tries no more until midnight UTC, a
  429 before any hashing (and, once this Worker instance has heard it, before any Durable Object
  request: below). Not a lock at 20: many phones share a carrier's address, and a school one,
  so one person failing there doesn't keep everyone else there out for the day; they click the
  robot check.
- **A gap**: past either, a visitor's tries at one username come at least **5 s apart** (`FAIL_GAP`;
  a 429 with `reason: 'wait'` and `Retry-After`), so a burst of solved robot checks from one address
  gets one guess in. The gap is the visitor's and the username's together, so **tries from other
  addresses never make the owner wait**, and **nothing ever locks a username**: whatever a stranger
  does from elsewhere, the owner signs in with a click on the robot check at most (a test has a
  stranger fail every 5 s from a new address while the owner, between, signs in every time). Only
  someone on the owner's own address, past 200 tries, can keep them out until midnight UTC. The next
  day the counts start afresh.
- These are kept in `DriveLimits`' table `password_fails`: a row a day for each visitor, each
  username and each visitor and username together with tries, each kept as a SHA-256 of the day's
  salt and it (never the address or the username, and not linkable from one day to the next),
  deleted with the day's other counts.
- **Before any of that, `PASSWORD_TRIES`**: every `DriveLimits` check above is a Durable Object
  request, and the Free plan's 100,000 a day are shared with every visit, Earth drive and room. So
  each sign-in with a password, each check of one (a password change, linking Google, taking the
  password off) and each change to an account is first one of the visitor's **10 a minute** on
  Cloudflare's rate limiter (no Durable Object request; counted by the challenges' keyed hash of the
  address, an IPv6 one by its /48, and the day), a 429 with `reason: 'busy'` past it ("Too many
  tries. Wait a minute and try again."), once a request however much it checks. And what
  `DriveLimits` has said of a visitor for the rest of the day is remembered in the Worker instance
  that heard it (`refused`), so a script is turned away there without asking again: every try from
  the visitor needs a robot check now, or, past 200, none at all till midnight UTC (both forgotten
  the moment a try from that visitor gets in); one username asks this visitor for a robot check
  (kept for the visitor and that username together); the visitor's 50 sign-ins or 30 changes of
  the day are used up (kept till midnight UTC whatever gets in). A sign-in asks `DriveLimits`
  whether the visitor has a sign-in left with the same request that checks the try, before any
  hashing, and one that gets in gives the try back and takes the day's sign-in in one more request,
  so a request costs at most one Durable Object request (a sign-in that gets in two). Without
  these a script on one address sending a try every second or so (nothing but same-origin JSON: no
  visit, robot check or session needed) used up the day's 100,000; and until the sign-in's turn was
  folded into the check, one signing in again and again with its own account's right password
  cost three Durable Object requests and a 100,000-round hash a try all day, past the 50 sign-ins
  too (43,200 requests a day from one address). Now one address reaches `DriveLimits` at most about
  14,450 times a day (10 a minute, and 50 sign-ins at two), whatever it sends, and in practice far
  fewer: the right password over and over is asked about 101 times (50 sign-ins, then one
  refusal, then nothing, no hash either; a test counts it), changes 31 times, a wrong password
  until the visitor needs robot checks (20 failures), each username asking it for one once. Each
  Worker instance remembers for itself, so a script landing on many is asked about once in each.
- **Signing in** (successes) shares Google's **50 a day** from one visitor (`SIGN_INS_DAILY`, counted
  as the leaderboard's names are, an IPv6 one by its /48 for Google's and passwords' alike, as
  players linked are too): each is a session kept for 30 days, so knowing a password still can't
  fill the database with sessions, not even from each of a /48's 65,536 /64s in turn (counted by the
  /64 before, one account was signed in 70 times from one /48; now the 51st from any of its /64s is
  refused, Google's too).
- **Signing up** always needs a robot check, and a visitor (by /48) makes **10 accounts a day** at
  most; adding a username to a Google account is counted among those 10 too (it can say a username
  is taken). **Changes** (a username and password added, the password changed, Google linked or
  unlinked, the password removed, signing out everywhere) are 30 a day for a visitor. Everything
  that proves a password (a password change, linking Google, taking the password off) goes through
  the same check and counts as a sign-in would.
- Every route is JSON (`application/json`) from the site itself (the same-origin checks every post
  has: `Origin`, and `Sec-Fetch-Site` when sent), with a body of at most 4 kB (a robot check's token
  of up to 2,048 characters and a 128-byte password, escaped), or 16 kB for the routes that carry
  Google's ID token too (as `/api/session` takes one), a 413 past it; an object of strings of the
  right shape (a 400 otherwise), and a robot check's token, when sent, a string of Turnstile's size.
  (At 2 kB for all, Google's token of 1,100 to 1,400 characters and a robot check's long token
  together didn't fit, so once a stranger's five tries had made the username ask for robot checks,
  **Link Google** couldn't be done for the rest of the day.)

### The Worker's routes

All in `worker/drive/logins.js`; each answers `/api/me`'s body (sign-up and sign-in with the session
cookie, as Google's `POST /api/session` does):

| Route | Does |
| --- | --- |
| `POST /api/account/sign-up { username, password, token }` | A new account and its login, signed in. 400 (which rule), 403 `robot`, 429 (10 a day), 409 "That username is taken" |
| `POST /api/account/sign-in { username, password, token? }` | Signed in. 401 "Wrong username or password", 403 `robot`, 429 `address`, `wait` or `busy` (`PASSWORD_TRIES`) |
| `POST /api/account/password { current, password, token? }` | Signed in with a username: the password changed, the account's **other sessions deleted** (this browser stays in). 401 "That isn't your current password" |
| `POST /api/account/password { username, password, credential }` | Signed in with Google and no username yet: a username and password added, with Google's ID token for the account's own Google account (401 without, 403 another's; 403 for an owner's account; counted as a sign-up) |
| `DELETE /api/account/password { password, token? }` or `{ credential }` | The username and password taken off, with the password or Google's ID token for the account; only while Google is linked (else 409); other sessions deleted |
| `POST /api/account/google { credential, password, token? }` | Google's ID token (checked as a sign-in's is) linked to this account, with its password (401 wrong); 403 for an owner's Google account |
| `DELETE /api/account/google { credential }` | Google unlinked, with Google's ID token for it; only while there's a username (else 409); other sessions deleted |
| `POST /api/account/sign-out-everywhere` | Every session of the account deleted, this one's too (204, the cookie cleared) |

`/api/config` says `passwords: true` while they're on: with the database, Turnstile's secret (signing
up needs a robot check) and `PASSWORD_ACCOUNTS` not `off`. They work without Google's sign-in set
up too; the session is then a username's alone.

### Linking, and what's never merged

- **Fresh proof, not only the session**: a session cookie can be copied, and a signed-in browser
  borrowed for a moment. With the session alone, someone could add their own password to a Google
  account and unlink its Google, keeping the account and its pass and leaving its owner a new, empty
  one. So whatever changes how an account signs in asks for proof again: **adding a username and
  password** to a Google account needs Google's ID token for that same Google account (its button
  in the panel); **linking Google** to a username's account needs the new Google account's ID token
  and the account's password; **unlinking Google** needs Google's ID token for it (the password
  isn't enough: someone who guessed it mustn't take Google away); **taking the password off**
  needs the password, or Google's ID token for the account (so its owner can always take off a
  password they've forgotten, or didn't set). Unlinking and taking the password off also sign out
  the account's other sessions.
- **The owner's accounts** (`ADMIN_EMAILS`) sign in with Google only: no username and password is
  added to one (403 "The owner's accounts sign in with Google only"), nor is one's Google account
  linked to a username's; and an account with a username never passes as an admin
  (`admin.js`'s `isAdmin`), even if `ADMIN_EMAILS` later named it. So the admin page can't be
  reached by guessing a password.
- **A Google account that already has its own World Drive account** is linked only if that account
  has nothing to lose: no username, no player linked to it and no purchase of its own (someone who
  once signed in with Google and did nothing since). Then that empty account is deleted (its
  sessions with it) and the Google account becomes this one's way in. Otherwise it's a 409: "That
  Google account has its own World Drive account, with its own progress or pass. Sign in with
  Google to use that one." The delete itself checks that again, in one batch with the link, so a
  player linked or a pass bought in between makes it a 409 rather than cutting them loose.
  **Nothing is ever merged**: two accounts' players, levels, times and
  passes put together would double or drop something (whose level, whose best time, which pass),
  and doing it safely isn't simple, so it isn't done. Signing in with Google, then adding a username
  and password there, gets the same result for anyone starting from Google.
- An account with a Google account linked already can't link another (409 "Unlink it first").
- **Unlinking keeps a way in**: Google only while there's a username and password; the username and
  password only while Google is linked. The update and the delete check that themselves, so taking
  the password off and unlinking Google at once (two tabs, a double tap) can't leave an account
  with neither: one of them is a 409. Unlinked, the Google account's email and name go from the
  account; a pass bought with that email before signing in (a purchase that was nobody's yet) is
  made the account's first, so unlinking never loses a bought pass. A pass given by
  `SUPPORTER_EMAILS` goes with the email. Signing in with that Google account afterwards makes a new,
  separate account.
- An account made with a username has no email: a pass bought from it is the account's by
  `client_reference_id`, as a Google account's is. A purchase Stripe sends with no email (`''`)
  never matches an account with no email (the pass's SQL, `hasPass`, only matches an email when
  there is one).

### What's kept

- `logins` (`0008_password_logins.sql`): the account's id, the username as typed (after NFKC) and
  its lower-case key (unique), the hash, its salt and iterations, when it was made and when the
  password was last set. **Nothing else about the person**: no email, no address, no device.
- An account made with a username is an `accounts` row with `email` and `name` empty, and for
  `google_sub` `none:` and a random token: the column can't be made nullable without building the
  table again, and in D1 dropping it would run its `ON DELETE` actions (every session, purchase and
  player let go of). Sessions are the same `sessions` rows as Google's (only the SHA-256 of the
  cookie's token).
- `DriveLimits`' `password_fails`: today's counts of tries by salted hashes (above), gone at the end
  of the day.
- Signing up makes the account and its login in one D1 batch, so a failure part way leaves neither
  (no account nobody can sign in to, and the admin page's kinds always add up to its accounts).
- **The admin page** shows the accounts now by kind: "Accounts 9 · Google 5 · password 3 · both 1"
  (counts only; never a username), and "New accounts" counts both kinds.
- The privacy words in the page's About say what a username's account keeps.

### What it costs

- **Sign-up**: a robot check (Turnstile's siteverify), one `DriveLimits` request (the day's turn),
  one hash, and in D1 a read and three writes (the account, the login, the session). **Sign-in**:
  one of `PASSWORD_TRIES` (free), then one `DriveLimits` request for a refusal (the check, counting
  the try, which also says whether the visitor has a sign-in left today), two for a success (the
  check, then the try given back and the day's sign-in taken in one), one hash, a read and two
  writes; past the visitor's 50 sign-ins, one request and no hash, then nothing at all once the
  instance has heard it. A change: one of `PASSWORD_TRIES`, then one `DriveLimits` request (the
  day's turn; none past the 30 once heard), and for one that proves the password one more. A few a
  day at today's traffic: nothing next to the [Free plan's](#what-a-visit-costs-and-how-its-capped)
  100,000 Durable Object requests or D1's rows. A stranger's guessing is held to 20 tries a day an
  address without a robot check, 200 with; a refusal `DriveLimits` would give again (a robot check
  wanted, past 200, the day's sign-ins or changes used up) costs no Durable Object request once the
  Worker instance has heard it; and whatever is sent, a request costs at most one `DriveLimits`
  request (a sign-in that gets in two, 50 a day), held to 10 a minute (`PASSWORD_TRIES`): about
  14,450 a day from one address, so even if no instance remembered a thing it would take seven or
  more addresses (or /48s) sending all day to use up the day's 100,000, against one before.
  The CPU is the cost that matters on the Free plan (above).
- **Storage**: a login row is about 150 bytes.

### What it can't protect against

- **A forgotten password** can't be recovered without Google linked: there's no email, on purpose.
  The owner can only help by hand (the D1 console), and can't tell who the account's owner is.
- **A reused password** that leaked elsewhere, **phishing**, or someone with the owner's unlocked
  device; there's no second factor.
- **A stolen session cookie** (it's `HttpOnly`, `Secure` and `SameSite=Lax`) works until it
  expires, the password is changed or **Sign out everywhere** is pressed; but with it alone nobody
  can change how the account signs in (above), so the owner keeps their way in and can end it.
- **A leaked database**: 100,000 rounds of PBKDF2 slows guessing each password offline but doesn't
  stop it for weak ones.
- **Someone with many addresses and robot checks solved by people or services** can keep guessing
  one username, a solved check a guess, one every 5 s from each address and 200 a day from each; a
  password that isn't among the commonest holds out against that.
- **Someone on the owner's own address** (the same carrier's or school's) who fails 200 times keeps
  everyone there from signing in with a password until midnight UTC (Google's sign-in still works).
- **Usernames can be found taken**: signing up says "That username is taken", as it must, and so
  does adding a username to a Google account; that's one of the visitor's 10 sign-ups a day each
  (and for signing up a robot check, for adding a Google account's fresh ID token). Signing in
  never says.

### How usernames and passwords are tested

`npm run test:drive-worker`: the rules (usernames' shape, NFKC, look-alikes and case; passwords'
length in characters and bytes, the commonest, the username), PBKDF2 against RFC 7914's test vector
and the count (and `PASSWORD_ITERATIONS` only lowering it), `DriveLimits`' failures per address and
per username (counted as they're checked, given back on getting in, the robot check from a
username's 5 or an address's 20, the gap only for one address at one username, the hard cap of 200)
kept only as salted hashes, every refusal adding up to 100,000 iterations with
`PASSWORD_ITERATIONS` lowered or not (and a right password hashed again at the lowered count),
`PASSWORD_TRIES` turning a burst from one /48 away before `DriveLimits` is asked (a stand-in
counting its calls) and what `DriveLimits` said of a visitor (a robot check wanted, or past the cap)
not asked again that day, a username's robot check asked once for that visitor and username (and
afresh for another username or visitor), the right password sent 100 times from one address
against the real `DriveLimits` in memory (two requests and a hash for each of the 50 sign-ins, one
request and no hash for the 51st, then nothing at all) and 40 changes (31 requests), the batch that loses a
username made by two at once taking its account back (on node:sqlite with 0001 to 0008),
migration 0008 on top of 0001 to 0007 with every account,
session, purchase and player kept; then against `wrangler dev` with D1 (with `PASSWORD_TRIES`
left out, so a test can send hundreds of tries from one address; the World Drive Worker suite,
with it, sees the eleventh try in a minute from a /48 turned away): every route's same-origin,
JSON, size (4 kB, and 16 kB with Google's token) and shape checks and 401 signed out; signing up (each rule, the name filter, the robot
check, the cookie, what's kept and that the password isn't in D1 or the Worker's log); taken and
look-alike usernames; signing in in any case, a wrong password and unknown and impossible usernames
alike in answer and in time; a stranger failing from many addresses (a robot check, then 5 s apart
from one address) while the owner still signs in; 40 tries sent at once from one address (20
through) and for one username from 40 (5 through), and a burst of solved robot checks (1 through);
a stranger failing every 5 s from a new address while the owner signs in every time between; an
address's 20 tries (then a robot check, which lets someone else there in) and 200 (then nothing), its
10 accounts and its 50 sign-ins (with Google's), from one /48's many /64s too, and its 20 players
linked, by its /48 too; linking Google with a
robot check needed, a 1,400-character Google token and a 2,000-character robot check's token, and
taking off a 128-byte password with a 2,048-character one; `DriveLimits` keeping no username or address;
changing the password (the current one needed, other sessions signed out); hashing again at a
raised count; linking both ways (Google's token and the password, neither alone), refusing a Google
account with a player, a pass or a username of its own and taking in an empty one, and one gaining a
player as it's linked never cutting it loose; unlinking keeping a way in and a bought pass, needing
Google's token (not the session or the password) and signing out other sessions; taking the password
off needing it or Google's token, and signing out the other sessions either way; a session alone unable to add a password to a Google account or
unlink it; taking the password off and unlinking Google at once always leaving a way in; the
owner's Google account never given a password nor linked, and an account with a username never an
admin; adding a username counted as a sign-up; a username made by two at once leaving no account
behind; the pass, the player and its ⭐ the same either way; a purchase without an email no
username's; signing out everywhere; the admin page's counts by kind; and no username on the boards.

`npm run test:drive-ui`: the panel not loaded until opened; creating an account (the rules said in
the page, a taken username, the robot check, signed in, the password sent nowhere else);
signing in (a wrong password said so, a robot check when asked for, signing out), and signed out
again after creating one the panel back on Sign in; signing out from the panel with the Worker
not reached or saying no (said in the panel, both buttons off while it's sent, one post for two
taps); signed in with a
username (changing the password, linking Google with the password, unlinking it with Google's
button, signing out everywhere); signed in with Google (adding a username and password confirmed
with Google's button; Google not unlinkable before; taking the password off with it); each form's
labels and `autocomplete`; the panel opened from the pause menu, where Esc closes it and keys never
reach the game, after a wrong password too (the focus back in the field, and kept from the game
with it fallen to the page); signed in with both on a phone held either way, Sign out in sight
without scrolling, the changes folded, Google's buttons drawn only once opened and one open at a
time; a tap on its padding keeping what's typed, and one outside closing it; its title
following the tab; the panel on a phone held upright and without Google's sign-in; and the admin page's
accounts by kind. Pictures: `account-1-create-desktop` to `account-11-sign-out-failed-phone` with
`TEST_SCREENSHOTS`.

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
  (`POST /api/visit`), after an invisible Cloudflare Turnstile check and once the game's code has
  arrived (so a download that fails spends no drive: [the load](#the-load)), and only while the
  day's visits are under two caps: **DAILY_VISITS** for everyone together (300) and
  **PER_VISITOR_DAILY** for each visitor (1: one free Earth drive a day; a supporter signed in has
  **PER_VISITOR_DAILY_SUPPORTER**, 30, counted by their account). Both start again at midnight UTC.
  The owner's accounts (`ADMIN_EMAILS`, signed in) aren't counted at all.
- **The Moon is never limited.** Its ground is our own (moon.js), so it costs nothing to stream.
  A page opened on a link to the Moon (`?spot=moon-...`, or `?at=` with `world=moon`) asks for a
  visit with `world: 'moon'`: after the robot check it gets `{ moon: true, visit }`, no key, and
  nothing is counted. It opens on the Moon with the Earth closed (main.js's `moonOnly`): picking the
  Earth reloads the page without the link, which asks for one of the day's Earth drives as usual.
- **Over a cap the page opens on the Moon by itself**: the 429 carries a visit (for scores and
  stats), the game starts on the Moon's globe without a key, loading nothing from Google, and a
  toast says why (*You've had today's free Earth drive, so you're on the Moon...*, or *Today's free
  Earth drives are all taken...* when it's the cap for everyone). Picking the Earth there shows
  **You've had today's free Earth drive** (or **Today's free Earth drives are used up**), with how
  long until fresh ones and **Drive on the Moon** to go back; over the visitor's own cap it also has
  a sign-in, so a supporter on a new browser, or back from paying before Stripe's webhook, signs in
  and the page reloads once to ask for an Earth drive as theirs.
- **Every visit is counted for the admin page**, those over a cap too: `visit` for all of them, and
  `visit_kind` by where it went (`earth`, `earth_supporter`, `owner`, `moon_link`, and
  `moon_daily_cap` or `moon_visitor_cap` for one sent to the Moon). The admin page shows **Earth
  drives** and **Over a cap, sent to the Moon** beside **Visits**. (Before this, a visit turned away
  wasn't counted at all, so the visits seemed to stop at `DAILY_VISITS`.) A failed robot check shows **We couldn't check you're a person**
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
  "v1.<visit id>.<expiry>.<signature>", an HMAC-SHA256 of the id and the expiry whose key is derived
  (HKDF) from `TURNSTILE_SECRET`, so there's no new secret to set, and good for 6 hours. The id is
  21 random letters and one saying the kind of visit: `e` for a visit the Earth's caps let through,
  `o` for the owner's (`ADMIN_EMAILS`, on either world) and `m` for the Moon's and one turned away
  by the caps; it says which [drop-in places](#where-people-drop-in) the visit may post (the Earth's
  and the Moon's, the Moon's alone, or none for the owner). The signature covers the id, so the kind
  can't be changed. It's in the id, not a field of its own, so a token is written as it always was:
  the Worker before kinds (20bf893) takes these tokens as its own, so rolling back to it leaves
  every open page's visit working ([Deploying](#deploying)). A token from before kinds, whose id is
  16 random bytes, always ends in `A`, `Q`, `g` or `w` (base64url's last letter of 16 bytes has two
  bits of them and four of nothing), never a kind's letter, so it's taken until it runs out, as a
  Moon visit's. A signature is taken written one way only (base64url's last letter has two spare
  bits). So every score comes from a visit that passed Turnstile and was counted against the day's
  caps: a script can't post without spending a drive. A new name takes the token too, and one visit
  makes one player and posts for that player only (the first to use it), so one robot check can't
  fill the board, or the database, with names: there are never more new names in a day than visits
  (`DAILY_VISITS`). A token that's forged, changed, expired or someone else's is a 403.
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
  `NAMES_PER_VISITOR_DAILY`). A player whose visitor has had the day's scores is held till midnight
  UTC by their own 10 s (`last_score_at` set to run out then), so their tries after it are turned
  away before they write anything or ask DriveLimits again (one every 10 s all day would otherwise
  cost a write and a Durable Object request each).
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

## Play stats

The owner's page of how World Drive is played: **`https://worlddrive.app/admin.html`**, for a Google
account in `ADMIN_EMAILS`, signed in on worlddrive.app (the globe's panel). It shows the last 7, 30 or
90 days or the year (UTC days, the last of them today so far), each figure with ▲ or ▼ against the
as many days just before (in per cent, or in points for a share; green for better and red for worse,
fewer being better for problems and load times). A figure is compared only when its counts cover the
period before from its first day: the play figures from the first day with visits counted, the
funnel's, the Moon's, searches' and problems' from the first with the funnel counted (they began a
deploy later), so a period before the counts began, or only partly after, shows no false rise; the
page says which have no ▲ or ▼, and why. The facts from the Worker's own tables are always compared. On it:

- **Tiles**: today so far (visits and play time), visits, play time, play per visit, drop-ins, the
  share of visits that drove and that drove 10 minutes or more, the share of play with others and on
  the Moon, searches, problems, the mean load time, new players, new accounts, passes bought and the
  revenue.
- **Each day**: visits as bars and play time as a line; and **any count by day**, picked from what
  the period has (all of a metric's keys together, or one), today's bar paler.
- **How far visits get** (the funnel): visits, then the globe shown, a place pinned, a drop-in
  started, driving, and driving 1, 10 and 30 minutes, each with its share of the visits and of the
  step before. Where the shares drop is where visitors give up.
- **Devices**: phones, tablets and computers. **Earth and Moon**: play on each, turns to the Moon and
  drop-ins there. **Searches** by kind, and how many found nothing. **Drop-in time**, from Drive here
  to driving, in buckets. **Problems.** **The leaderboard, the pass and levels**: the boards opened,
  nicknames picked, the pass's sheet opened and its Buy followed to Stripe, levels reached, parties
  made and joined.
- **From the leaderboard and the pass** (the Worker's own tables, below): new players, new bests, new
  accounts (Google and username), passes by status and the revenue; and now, the players, the accounts, the accounts
  with the pass and the passes nobody has signed in for yet.
- As before: visits by hour of the day (counted in UTC hours, shown in the viewer's time), where
  people come from, play time by ride, the rides dropped in with and the start spots dropped in at,
  the Garage's changes by part, and load time.
- **Where people drop in**: a heat map of the Earth and of the Moon, and the top places, for today,
  the week, the month or longer ([its own section](#where-people-drop-in)), between **Each day** and
  the rest.
- **Download CSV**: the period's rows, `day,metric,key,n`, counts and the Worker's facts alike.

Referrers, countries, browsers and page speed in more detail are Cloudflare Web Analytics', in
Cloudflare's dashboard (Analytics & Logs → Web Analytics), from its beacon in `drive/index.html`.

**What's counted** (`METRICS` in `src/drive-app/stats-protocol.js`, which the page and the Worker
share), a day, as `metric:key`:

| Metric | Keys | What it's for |
| --- | --- | --- |
| `visit`, `visit_hour` | `all`; the UTC hour | Visits (each Maps key handed out, counted by the Worker as `/api/visit` answers), and when |
| `load` | the referring site's host name, or `direct` | Where people come from (once a visit) |
| `load_time`, `load_ms` | a bucket (under 2 s to over 20 s); `total` | From asking for the page to the globe showing, and the milliseconds together for the mean |
| `funnel` | `globe`, `pin`, `dropin`, `driving`, `drove_1m`, `drove_10m`, `drove_30m` | How far a visit gets, each step once a visit as it's reached: the globe shown, a place first pinned (a spot, a search result, a recent place, a link, a tap, an area of people driving), a drop-in first started, the first drive, and the visit's driving (not paused) passing 1, 10 and 30 minutes. A party's Join drops in without a pin, so a step can be more than the one before |
| `device` | `phone`, `tablet`, `computer` | What the visit's on (once): a fine main pointer (a mouse, a trackpad) is a computer's, whatever its screen; a coarse one (a finger, `pointer: coarse`) is a tablet's when the screen's shorter side is 600 CSS px or more, else a phone's. A laptop with a touch screen is a computer, and so is a tablet with a trackpad |
| `dropin`, `ride` | a start spot's id, `other` or `moon`; a ride | Where drop-ins are and in what: this key never says where off a start spot; the drop-in's cell, to about a kilometre, goes to [where people drop in](#where-people-drop-in) |
| `dropin_time` | under 5 s, 5-10 s, 10-20 s, 20-40 s, over 40 s | How long each drop-in took, from Drive here to driving |
| `play`, `play_world`, `play_with_others` | a ride; `earth` or `moon`; `all` | Seconds driven, not paused: by ride, by world, and with others driving on the same world (as levels count together: not those on the globe, nor a party friend on the other world). From the release that brought driving with others to the Moon (November 2026), `play_with_others` means that: before, it counted any time with anyone else in the room (a party friend on the globe too) and never the Moon, so the admin page's **With others** row against the period before it compares two meanings, not a trend |
| `world` | `moon` | Each time the globe turns to the Moon |
| `search` | `earth`, `moon`, `coordinates`, `nothing` | Searches made: of the map, of the Moon's places, coordinates typed; and, as well, each map or Moon search that found nothing. Never what was typed |
| `problem` | `no_ground`, `ride_failed`, `moon_failed`, `map_failed`, `map_session_ended`, `drop_abandoned` | What went wrong: no ground at a drop-in (no 3D map there, or the Moon's ground not loading), a ride's model not loading (whether the go-kart was driven instead or not), the Moon not loading, Google's map not loading at all, Google refusing the visit's tiles (its map session over), and a drop-in left for the globe before it was driving. The two map ones once a visit; the others each time |
| `garage_open`, `garage_edit` | `all`; a part (colour, finish, decal, rim, glow, boost, flame, trail, smoke, horn) | The Garage opened, and each change made in it |
| `party` | `made`, `joined` | Parties made (Invite friends) and joined (a party's link) |
| `board`, `pass`, `level_up` | `open`, `named`; `open`, `buy`; `all` | The leaderboard opened and a nickname picked (a new player); the Supporter Pass's sheet opened (from anywhere) and its Buy followed to Stripe; a level reached |
| `ad` | `shown`, `blocked` | [Google's ad on the globe](#ads), once a visit each: an ad filled it; its script, or its ad, didn't come (an ad blocker, mostly). On the admin page beside the pass's, once there are any |
| `challenge` | `open`, `start`, `finish`, `posted`, `nudge`, `nudge_open`, `share`, `link`, `link_start` | [Challenges](#challenges): the list opened, a run started (at GO), finished, and its time posted to a board (a new best); the word to a visit driving 40 s (today's challenge) said, and its **Challenges** button pressed; a "challenge a friend" link shared or copied, a page opened on one, and a run started from its card ([ghosts](#ghosts-and-challenge-a-friend)). On the admin page's **any count by day** |

The Worker adds, as the admin page asks (nothing more is kept for it), what its own tables say of
each day, by the UTC day of `created_at`: `players:new` (nicknames made; not those the owner has
removed since), `scores:new_best` (runs that beat a player's best on a board: the `scores` log has
only those, and only for 35 days, so for a longer period the page says the count is partial, and
compares it only for the last 7 days), `accounts:new` (accounts made: Google accounts signed in
for the first time and accounts made with a username), `purchases:<status>` (`paid`, or `granted` by hand) and `revenue:<currency>` (in the
currency's smallest unit, cents, shown as money), both leaving out purchases refunded or charged
back; and totals now: players, accounts, the accounts with the pass (bought and not taken back, or in
`SUPPORTER_EMAILS`), and passes not taken back that nobody has signed in for yet. Only counts: no
name, email or id leaves those tables for it.

**No cookie, so no consent banner.** Only counts a day are kept: no id of the visitor, their
player or their browser, no address, nothing stored in the browser for it, and nothing that follows
anyone from one visit to the next. Never counted: where anyone is or searched for any finer than a
cell about a kilometre each way (a drop-in somewhere other than a start spot is "other" here, and
[where people drop in](#where-people-drop-in) has only its cell, counted apart, since a search can
be someone's own street), what was typed (a search is only its kind), a device's make, model or
screen size (only phone, tablet or computer), or a referring page's address (only its site's host
name). The About dialog (`drive/index.html`) tells visitors what's counted.

**How it works.** The page (`src/drive-app/stats.js`) adds up what it counts and posts it to `POST
/api/stats` with the visit's token (and the places of the drop-ins it counts: [where people drop
in](#where-people-drop-in)), every 3 minutes and as the page goes out of sight or closes
(`keepalive`), keeping the fractions of a second for the next post and a post that didn't go for
the next try; a 403 (the visit run out) stops it for the visit. What's once a visit (the funnel's
steps, the device, the map problems) is remembered in the page's memory for the visit, and nowhere
else. It counts nothing without a visit's token (the test pad, the dev server alone; on the dev
server only, `scripts/test-drive-ui.mjs` hands the page a test one, `worldDriveStatsTest`, to see
its posts). The Worker (`worker/drive/stats.js`) takes only what `stats-protocol.js` says may be
counted, each metric's keys checked (a ride, a start spot, a funnel step, a search's kind...) and
held to what one post may add (600 s of play, one load, the funnel's seven steps, one device, 20
drop-ins...), at most 100 counts a post (`MAX_COUNTS`: the once-a-visit ones, the fraction of a
second of play kept for each ride driven and a few minutes of everything else fit, and a post stays
well under the Worker's 8 KB), only with a good visit token and at most `STATS_POSTS` posts a minute
a visit, so a script can't add more than a few visits' worth; then one upsert a row into D1's
`stats_daily` (day, metric, key, n). A page can't post the Worker's own facts: they aren't metrics
it takes.

`GET /api/admin/stats?days=30` answers, to an account in `ADMIN_EMAILS` (401 signed out, 403 anyone
else, 429 past `ADMIN_LOOKS`' 30 asks a minute for the account: `worker/drive/admin.js`), those days' rows and the facts in the same `[ day, metric, key, n ]` shape; the as many days
before, added up by metric and key in D1 (what the page compares with: a year's comparison is a few
hundred rows, not tens of thousands), with the first day in them with visits and with the funnel
counted (`previous.first`, each null if none); the totals; and how far back the counts and the scores log go.
A year at most, and rows older than two years (730 days, so a year can be set against the year
before; it was 400 days before the comparisons) are deleted as it's asked. Every query is bounded by
the days asked for, but the totals, which count the tables whole. The page draws it all with no
library and nothing loaded from elsewhere, and is `noindex`.

**What it costs.** D1 only: a visit is a row or two written as it starts, and a few rows each 3
minutes it plays (an hour's drive about 60 rows); the admin page reads the period's rows and the
period before's (up to about 150 a day each), and reads through `players`, `accounts` and
`purchases` (which have no index on when they were made) for the facts and the totals: a few
thousand rows a look. Well within the Free plan's 100,000 rows written and 5 million read a day at
the visit caps.

**The owner's steps.** Deploy (`npm run deploy:drive` applies `0004_stats.sql` first), then set
`ADMIN_EMAILS` to your Google account's email (dashboard: Workers & Pages → world-drive → Settings →
Variables and Secrets, as a secret; or `npx wrangler secret put ADMIN_EMAILS -c
wrangler.drive.jsonc`), sign in on worlddrive.app, and open `/admin.html`. Counts start from that
deploy: there's nothing from before it, and the page says on which day they start. The funnel,
devices, worlds, searches, drop-in times, problems and the leaderboard's and the pass's counts start
from the deploy that brought them; the Worker's facts go back as far as its tables do.

## Where people drop in

The [play stats](#play-stats) say how far a visit gets: most visits drop in and drive, and most of
those leave after about a minute. To see *where* they go (which places draw people, which start
spots nobody uses, where the next featured spot or challenge should be), each drop-in's place is
counted too, rounded to about a kilometre, and the owner's admin page draws it as a heat map of the
Earth and of the Moon with a table of the top places. What's kept is counts of places a day, never
who: no player, account, visit or address goes with a place, and no place is finer than its cell.

### What the owner sees

On **`/admin.html`**, between the tiles and **Each day** and the rest of the play stats, **Where
people drop in**:

- **Today**, **Week**, **Month**, **90 days** and **Year**: the last 1, 7, 30, 90 or 365 UTC days,
  each ending with today so far, as the rest of the page's are. It starts at the page's own period
  and follows it when that changes.
- **Earth** and **Moon**, each with its count in the period: the **drop-ins counted**, each visitor
  once a day in each cell (and once for each visit). That isn't a count of people: one visitor at
  Golden Gate, Times Square and Lyon on one day is three, and one at the same place every day of a
  month is thirty. They're fewer than the **Drop-ins** tile above, which counts every drop-in. The
  line over the map says "356 drop-ins counted in 86 cells (1 km)": cells, not places, as a start
  spot's cells are one place in the table but each a cell on the map. One place's count is its
  **visitors** over one day (Today: each counted once there) and its **visitor-days** over longer
  (each visitor once a day, added up), and the table's column and the map's notes say which.
- **The heat map**: the world as a flat map (longitude across, latitude up), the Earth's land and
  sea from the game's own Natural Earth map (`/sea/mask.bin`, as `src/drive-app/sea.js` reads it),
  the Moon from its own picture (`/moon/colour.webp`), each fetched only when its map is first
  shown, in the page's light or dark. Each cell is a soft spot, darker as it has more visitors (on a
  log scale, so one still shows beside a hundred), the spots adding up where they're close, and
  coloured from yellow to deep red, with a legend saying which way it runs and the most in one 1 km
  cell. The top ten places with more than one have their table numbers beside them (a number on each
  single visitor would say nothing). Drag to move it; click it, then scroll to zoom (or Ctrl and
  scroll, as a trackpad's pinch is), double-click, or **+**, **−** and **⤢** (the whole map). On a
  phone: pinch, or two fingers moved together, or the buttons; on the whole map one finger drags
  sideways (up and down scrolls the page), zoomed in it drags every way. It zooms in to a view 150
  km across at the most, and a place shown from the table is 300 km across: the Earth's map is
  squares of about 5 km (24 to a degree) and the Moon's picture pixels of about 2.7 km, so closer
  than that it would be a mosaic of a few dozen; **Drive ↗** is how to see the streets. Zoomed in on
  the Earth, the towns are named (more of them the further in, at most 80, none over another:
  Natural Earth's towns, below), and a scale bar says how far is how far. Resting the mouse on a
  cell, or tapping it, says what it is and how many visitors or visitor-days (for one of a start
  spot's cells, its own and the spot's in all: "2 visitor-days here, 6 at the place"). The map has
  the period's 2,000 cells with the most; the rest (single visitors scattered about) are only in its
  totals, and the page says so. It's never taller than about two thirds of the screen (`65svh`), so
  on a phone on its side there's page beside it to scroll by, and a place shown from the table
  scrolls the whole map, its buttons too, into view.
- **Top places**: the 25 with the most, each with its name and region, its visitors or visitor-days,
  their share of the world's (one under 1% shows as "<1%"), on how many of the period's days it had
  any, and **Drive ↗**, which opens the game there in a new tab. Those with more than one are listed
  (three at least, ten at most); the rest, over a week or a month mostly single visitors named by
  their coordinates, are behind **Show all 25** ("20 more, each with one visitor-day"), so on a
  phone the section isn't screens of them between the day chart and the funnel. A start spot's or a
  place page's is the game's own link to it (`/?spot=golden-gate`, or the page's `/?at=...`), marked
  **in the game**, and is one row however many of its cells were dropped in at (below); any other
  place's pins the cell's middle by name (`/?at=45.83862,4.95052&name=12 km NE of Lyon&region=...`,
  with `world=moon` on the Moon), and the drop-in finds the street, or the sea's surface, there as
  for any pin. A place's name shows it on the map, zoomed in on it, saying what it is.
- Asked too often (`ADMIN_LOOKS`, below), the stats and the map each say "Asked too often just now:
  try again in a minute." Whatever goes wrong (that, the server not reached, an error), the map says
  it too, over the map, and nothing of the last answer is left (the worlds' counts, the table, the
  legend), so an empty map doesn't pass for a period with nobody in it. Switching worlds while a
  period's answer is still coming shows nothing of the last period's, and the line says
  "Loading..." till it comes.
- Each period's answer is kept on the page for 10 minutes, so clicking between periods asks the
  Worker once for each (the Worker keeps its own as long, [below](#the-admin-pages-answer)).
- The owner's own visits (`ADMIN_EMAILS`) post no places, so the page's own **Drive ↗** links, and
  whatever the owner tries out, aren't counted in what it shows (nor in [what challenges are picked
  from](#for-challenges-the-most-dropped-in-places)).

How a place is named, by the Worker (`nameCell` and `placesOf` in `worker/drive/dropins.js`), at no
cost per look:

1. A featured place is a start spot (`places.js`), a place's page with its own pin
   (`drive/site/places.js`: the Eiffel Tower, the Colosseum...) or one of the Moon's places
   (`moon-places.js`, its spots and the places its search finds). Its cells are the one its pin is
   in and any its pin is within 250 m of: a drop-in there starts within 60 m of the pin (the street
   or a bridge's deck found nearest it: `spawn.js`), and a search of the same landmark pins a little
   off, so a pin by its cell's edge has its drop-ins on both sides of it (the Arc de Triomphe's is 5 m
   from the next row). Those cells are the place, by its name, and one row in the top places: their
   visitors added up, at the place's own pin, on as many days as its busiest cell (the place had
   visitors on at least that many), with its cells' middles in `cells`.
2. Else the nearest town or featured place within 50 km (300 km on the Moon, which has only its
   featured places): a town's own name within 2 km ("Lyon"), else how far and which way, of the
   compass's eight ("12 km NE of Lyon", "1 km S of Golden Gate Bridge", "91 km N of Copernicus
   crater"), with the region on the Earth ("Rhône-Alpes, France"; a Moon place's words, "93 km
   across", aren't said of a place beside it). A featured place's neighbours are always "1 km ... of"
   it, so a search a kilometre from a spot isn't counted as the spot.
3. Else its coordinates, to two decimals ("0.00° N, 150.00° W").

The towns are Natural Earth's populated places at 1:10 million (public domain): 7,342 towns and
cities, every country's capital and its regions' among them, kept in `drive/public/places/towns.tsv`
(262 KB, 116 KB compressed; `node scripts/make-towns.mjs` makes it, and says how it's kept) with
each one's region and rank. Natural Earth lost letters of 38 towns' states (34 of Vietnam's and
Azerbaijan's, "H? Chí Minh city", "G?nc?"), and no other field of it has them right, so their region
is their country alone ("Vietnam"); the script stops if a "?" is left in any name or region. The
Worker reads it through its `ASSETS` binding, the site's own files, once per Worker instance (about
2.5 ms of CPU to read; naming 25 places is a fraction of a millisecond, and a featured place's cells
are worked out once per instance), so a look asks nothing of anyone. The admin page fetches it only
once the Earth's map is zoomed in. The game never loads it. Natural Earth is sparse in places
(France's towns at that scale are its cities), so "35 km E of Geneva" can be a village's own name in
a fuller atlas.

### How a place is rounded

Each world is cut into a grid of cells about a kilometre each way (`src/drive-app/dropin-cells.js`,
which the page, the Worker and the tests share): rows 1 km tall from the south pole to the north, on
a sphere of the world's radius (6,371 km for the Earth, 1,737.4 km for the Moon), a whole number of
them from pole to pole (20,015 on the Earth, 5,458 on the Moon), and each row cut into as many
cells as fit 1 km wide round its middle (40,030 round the Earth's equator, 10,916 round the Moon's,
fewer towards the poles). So a cell is a kilometre across to within a metre, except within about
70 km of the poles (73 km on the Earth, 66 km on the Moon), where it's within 5%: the rows nearest
each pole hold 3, 9, 16, 22, 28... cells, 1,047, 1,047, 982, 1,000, 1,010... m wide. Never a sliver
a few metres wide by a pole, as rounded degrees would be (the Moon's Shackleton start spot, 20 km
from its south pole, is in a row of cells 1.5 m off a kilometre), and anywhere in a cell is within
0.75 km of its middle. A cell is written `earth:14212:5052` (the world, the row from the south pole,
the column eastward from 180° W): Golden Gate's. The page works out its cell and sends only that;
the precise place never leaves the browser.

### What's sent, and what's counted

- **When.** A drop-in's place is taken as it arrives, the moment the vehicle is down and driving
  (`arrive` in `main.js`): where it starts, after the street or the sea's surface has been found. A
  drop-in given up on the way down, or with no ground there, has none. Joining a party or going
  beside someone is a drop-in like any other.
- **How.** It rides along with the play stats' next post (`POST /api/stats`, every 3 minutes and as
  the page goes out of sight), as `places: [ "earth:14212:5052" ]` beside that drop-in's own
  `dropin:...` count: no request of its own. The page sends a cell once a visit, at most 6 a post
  (`PLACES_PER_POST`; one more waits for nothing, its drop-in still counted), and a post that didn't
  get through (a 429, a network blip) keeps its places for the next, in front of any since, with
  their drop-ins. Without a visit's token (the test pad, the dev server alone) nothing is counted,
  as for the rest of the stats.
- **What the Worker takes** (`checkPlaces`, then `recordPlaces` in `worker/drive/dropins.js`): a
  list of at most 6, or the whole post is a 400; each a cell of the grid (anything else, coordinates
  among them, is left out); and no more on a world than the drop-ins the same post counts there
  (`dropin:moon` on the Moon, the others on the Earth), so a place can't come without its drop-in.
  An **Earth** place only from a visit whose token says the Earth's caps let it through (`e`: the
  visit token, [above](#how-cheating-is-limited)); a Moon visit, one turned away by the caps and an
  old token post the Moon's places alone, and the owner's (`o`) none. Then **DriveLimits** says which
  to count (`places` in `worker/drive/limits.js`), all in one go:
  - a cell counts **once a day for each visitor** (an address; an IPv6 address by its **/48**, not
    the /64 the visit caps count by: one free tunnel broker's /48 holds 65,536 /64s, which would
    otherwise be as many visitors), whichever of their visits posts it, **and once for each visit**,
    whichever address posts it (a visit's token sent from many addresses adds a cell once): a count
    is how many visitors dropped in there that day;
  - **no faster than one each 10 s of the visit** (a drop-in takes that long at least: the flight
    down, the ground loading), so a script with a fresh visit can't post a visit's worth at once;
  - at most **10 a visit**, **30 a visitor** and **1,500 a day on each world**
    (`DROPIN_PLACES_PER_VISIT`, `DROPIN_PLACES_PER_VISITOR`, `DROPIN_PLACES_DAILY`), the Earth's and
    the Moon's apart, so neither can crowd out the other's;
  - a visit is heard **20 times a day** at most (`DROPIN_ASKS_PER_VISIT`, twice its places: an
    honest page asks once a post with new places).
  DriveLimits says when a visit can add no more (its places counted, its visitor's, or its asks) and
  when a world's day is full, and each Worker instance then asks no more for that visit (until its
  token runs out or the day ends, as `live.js` does with visits it has turned away) or that world
  (till midnight UTC). Those it takes are upserted into D1's `dropins_daily`, one row a world, day
  and cell. The post's answer is the play stats' 204 whatever was counted, and a place that can't be
  counted (DriveLimits or D1 not answering) is only logged: never in the stats' way.

**Making it hard to poison.** Every place needs a visit that passed Turnstile (the visit's token),
a drop-in counted with it, and time: one place each 10 s of the visit, 10 a visit. A cell counts
once a day for each address (an IPv6 /48) and once for each visit, so adding one to a cell takes both
a new visit and a new address: one robot check and its token, replayed from a block of addresses,
add a cell once, and a /48's 65,536 /64s are one visitor. An Earth place takes an Earth visit, one of
the day's capped drives (`DAILY_VISITS`, 300, and `PER_VISITOR_DAILY`, 1 an address): pushing an
Earth place up the table by 50 a day spends 50 of the day's drives from 50 addresses, each passing
the robot check. Moon visits aren't capped (the Moon costs nothing to stream), so a Moon place can be
pushed by many robot checks from many addresses (IPv4 addresses or /48s); its day's 1,500 are its
own, so that can't crowd out the Earth's. `days` in the answer (on how many days a place had
visitors) tells a place busy one day from one busy every day, but a script run daily is busy every
day too.

So the ranking **isn't proof against many addresses** (a Sybil attack): someone with a few hundred
addresses and robot checks a day (solving services sell them for a few dollars a thousand) can put
a 1 km cell of their choosing, a private address say, at the top of the Moon's places, and of the
Earth's at the cost of the day's drives. What it can't stop is many addresses passing the robot
check, as for the leaderboard. The owner reads the map knowing that; and challenges picked by
themselves from it take only featured places (`topPlaces`' `featuredOnly`, below) or cells the owner
has approved, with the busy cells that aren't featured offered to the owner to choose from rather
than picked. The owner's own visits post none, so what the owner looks at isn't pushed up by
looking.

### What's kept

- **D1**, `dropins_daily` (migration `0005_dropins.sql`): `day`, `world`, `cell_row`, `cell_column`
  and `n`, the visitors counted there that day; nothing else. Keyed by the world, then the day, so a
  look at one world's period reads only its rows. It's kept as long as `stats_daily`'s rows are, 730
  days, and older rows go as the admin page asks (as the play stats' do).
- **DriveLimits**, for today only, to count each visitor and visit once at a cell and hold them to
  their limits: `place_seen`, for each place counted, one HMAC of the day's salt, the address (an
  IPv6 one's /48) and the cell and one of the salt, the visit's id and the cell; `place_visitors`
  and `place_visits`, an HMAC of the salt and the address, or the visit's id, with how many places
  it has had counted (and for a visit how many times it has asked); and `place_totals`, each world's
  count. The HMAC's key is derived (HKDF) from the Worker's `TURNSTILE_SECRET` with a label of its
  own, and isn't in the storage, so a copy of it (a restore, Cloudflare's 30 days of point-in-time
  recovery for its SQLite storage, a bug that dumps it) can't test an address, a visit's id or a
  cell against any of it, nor pair a visit with an address or say which cell any row is; the tables
  have no rowids, so the order rows went in doesn't pair them either. All four are deleted, with the
  day's salt, when the next UTC day starts. (The visit caps' own `visitors` table, by a plain hash
  of the salt and the address, is as it was: it never held a place.)

  Deleted from the live storage, that is: Cloudflare keeps 30 days of point-in-time recovery for a
  Durable Object's SQLite storage, so for 30 days a day's `place_seen` can be restored, salt and
  all. Without the Worker's secret that's no use (the HMACs can't be tested). But someone holding
  `TURNSTILE_SECRET`, or able to deploy code to the Worker (which has it), could restore a past day
  and test a given address against every cell (about 510 million on the Earth: minutes of HMACs),
  and so learn which 1 km cells that address dropped in at on any of the last 30 days. Before
  places were counted, nothing stored paired an address with a place. That's the price of counting
  each address once a day at a cell, which is what keeps one address from pushing a cell up; the
  other choice, keeping only a count for each address and each visit's cells, would let one address
  with many visits add a cell many times. This keeps the per-address count, and says so: only the
  owner holds the secret, and the About dialog tells players.
- **In each Worker instance's memory**: the visits that can add no more today, by their random id,
  till their tokens run out or the day ends; never a place or an address.
- Nothing in the browser, and no cookie.

The About dialog says it: "roughly where else they drop in (to about a kilometre, counted once a day
for each visitor at each place)", and that "a keyed hash of their address and the place is kept that
day and then deleted; Cloudflare's backups of the game's storage can hold it for up to 30 days more,
and only someone with the game's own secret key could check an address against it". A cell can hold
someone's home, and a place counted once on a day says someone dropped in near
there; but not who, nor which visit, and only the owner sees it. (The globe's dots of who's driving
now, which everyone sees, are already to about a kilometre.)

### The admin page's answer

`GET /api/admin/dropins?days=30` (1 to 365, 30 if it isn't a number), to an account in
`ADMIN_EMAILS` (401 signed out, 403 anyone else, 429 past `ADMIN_LOOKS`' 30 asks a minute for the
account, as `/api/admin/stats` is: `worker/drive/admin.js`):

```
{ from, to, first, cell: 1000, kept: 730,
  worlds: { earth: WORLD, moon: WORLD } }
WORLD: { dropins, places, heat: [ [ lat, lon, n ] ],
  top: [ { lat, lon, n, days, cells: [ [ lat, lon ] ], name, region, link, featured } ] }
```

`first` is the first day any place was counted (the page says "counted from" when the period starts
before it). `dropins` is the period's visitors on the world and `places` how many cells they were
in; `heat` the period's 2,000 cells with the most (each cell's middle, the most first), and `top` its
25 top places, named, a featured place's cells as one (at its pin, `cells` their middles). One batch
of three queries: each world's cells, which reads that world's rows for the period once (its totals
counted over every cell with window functions, before the 2,000 are taken), and the first day (each
world's key's first row).

The answer is kept in the Worker instance that worked it out, for that period and day: 10 minutes,
or an hour for a period longer than a month (90 days, the year), at most 8 of them, today's only
(`X-Dropins-Cache: hit` or `miss` says which). It's given only after the account and `ADMIN_LOOKS`
are checked, so it's the owner's alone and the asks are counted as ever; the same look again reads
nothing. So a drop-in shows on the page within 10 minutes (an hour on the long periods).

### For challenges: the most dropped-in places

[Challenges](#challenges) use these: the admin page offers the busy places that aren't featured
(`topPlaces` over the last 30 days, its featured ones left out) for the owner to approve into the
rotation, or choose for a period by hand, and nothing from them goes in by itself.

In `worker/drive/dropins.js`, for picking challenges from where people go:

- `topPlaces( db, { world, from, to, most, featuredOnly }, towns )`: `world`'s most dropped-in places
  from the UTC day `from` to `to` (both included, `'2026-11-16'`), at most `most` (25 if not given),
  as the admin page's top places are: a featured place's cells as one, named, with the game's link
  there (`[ { lat, lon, n, days, cells, name, region, link, featured } ]`), the most first, then
  those on the most days; with `featuredOnly: true`, the featured places alone (the start spots, the
  places' pages' and the Moon's places), busiest first. `towns` is `townsFor( env, url )`'s (or null,
  to name by the featured places alone); `townsFor( env )` works without a request too, as in a
  scheduled handler (the site's own address stands in: the `ASSETS` binding goes by the path).
- `topCells( db, { world, from, to, most } )`: the cells themselves, at most `most` (up to 2,000), as
  `[ { world, row, column, lat, lon, n, days } ]`, the most first, then those on the most days.
- `nameCell( world, lat, lon, towns )` names one cell, with the game's link there.

Two things for whoever picks challenges from these. Their ranking **isn't proof against many
addresses** ([above](#whats-sent-and-whats-counted)): a challenge rotated in by itself should be a
featured place (`featuredOnly`), or a cell the owner has approved, and the busy cells that aren't
featured are a list to offer the owner, not to pick from blindly. And each call reads the period's
rows (up to 1,500 a day a world), with nothing kept, so a caller keeps what it picked (the challenge
itself) rather than calling again for each request.

### What it costs

- **The game**: no request of its own (places ride on the play stats' posts), and 0.8 KB more
  minified code in `main.js`'s chunk, 0.33 KB compressed (measured: 1,117.12 to 1,117.93 kB, and
  343.29 to 343.62 kB gzipped; the grid's arithmetic, `dropin-cells.js`, and the stats' few lines),
  nothing in the page's first script, which is unchanged. The towns, the maps and the admin page's
  code are never loaded by it.
- **Durable Objects**: one DriveLimits request for each stats post that carries new places (at most
  one a drop-in, fewer when several fall in one post's 3 minutes): at about 300 Earth visits a day
  and the Moon's besides, with a drop-in or two each, a few hundred a day of the Free plan's 100,000
  (which the visits and driving with others share). At worst, a script posting all it can: 20 a
  visit a day (`DROPIN_ASKS_PER_VISIT`), and once a visit can add no more each Worker instance stops
  asking (one more for each other instance it reaches); none for an Earth place from a Moon visit,
  nor for a world whose day is full. So using up the day's requests this way takes about 5,000 robot
  checks a day.
- **D1**: one row written for each place counted (at most 1,500 a day on each world; a few hundred
  at today's traffic) of the Free plan's 100,000 a day, and a Moon visit from someone signed in
  reads their session (a row or two) to tell whether it's the owner's (signed out, nothing). An
  admin look reads each world's rows for the period once: with a few hundred places a day, a month
  is about 10,000 rows read and a year about 110,000, of the 5 million a day. At both worlds' caps
  every day (someone posting all they can, which on the Earth spends the day's drives, and on the
  Moon takes a few hundred robot checks a day from 50 addresses or /48s) a month's look reads 90,000
  rows, 90 days' 270,000 and a year's 1.1 million. A look is kept in the Worker instance for 10
  minutes (an hour past a month), and the page keeps each period's for 10 minutes, so clicking
  between periods, or the same one again, reads nothing more; but at those caps, four year-long
  looks in a day each worked out afresh would be most of a Free day's reads. A monthly roll-up of
  each month's 2,000 busiest cells would bound a year's look at about 110,000 rows a world whatever
  is posted, but the period's totals would then no longer be exact (how many cells a year's drop-ins
  were in can't be added up from months' busiest 2,000, and at a few hundred places a day a month
  can have more than 2,000 cells), so it's left until the counts come near it: then the daily cap
  (`DROPIN_PLACES_DAILY`) is the lever. Kept for two years at a few hundred a day, the table is a
  few hundred thousand rows of about 40 bytes: well under 50 MB of the 5 GB free.
- **Workers Paid**: all of that is well within what the plan includes (50 million D1 rows written
  and 25 billion read a month, a million Durable Object requests a month).
- **The admin page**: the Earth's map (250 KB) and the Moon's picture (675 KB) when each is first
  shown, the towns (262 KB, 116 KB compressed) once zoomed in: the site's own files, from
  Cloudflare's cache, at no cost. Drawing the map with 2,000 places takes about 23 ms for the whole
  world, 11 ms zoomed in a little and 2 to 3 ms on a region (measured in headless Chromium on the
  development machine, a desktop's window and a phone's alike; the canvas is drawn at no more than
  twice the screen's pixels), once a frame at most while it's dragged.

### How it's tested

- `npm run test:drive-worker`: the grid (a kilometre each way at every latitude on both worlds,
  within a few per cent at the poles, anything in a cell within 0.75 km of its middle, both sides of
  the 180th meridian one cell); only the grid's cells taken, each with its drop-in, at most 6 a post;
  naming from the game's places (a start spot's own cells, and its neighbours as "1 km W of" it),
  the towns and coordinates, across the 180th meridian; `topCells` and `topPlaces` on the migration's
  table (the most first, then on the most days; each end of the period; each world's own, read by
  the table's key and nothing else, in SQLite's own plan of the query; 1 to 2,000; a start spot's
  cells as one); DriveLimits by itself (its storage node:sqlite's) hearing a visit its 20 (here 3)
  times and counting nothing of it after, whichever Worker instance asks; a post that didn't get
  through keeping its places, with their drop-ins, for the next (the page's own `stats.js`); and
  against the Worker under wrangler: a place
  counted once a day for each visitor (another visit from the same address too), none without its
  drop-in or on the wrong world, a post with too many or not a list turned away whole, no visit or
  one run out a 403; one each 10 s of a visit, its 10 (here 4), a visitor's 30 (here 6) and each
  world's day's 1,500 (here 12, the Moon's still counted with the Earth's full), the stats counted
  all the same, and the next day afresh; one visit's token from six addresses adding a cell once and
  its 4 in all; a Moon visit's, an over-the-caps visit's and an old token's Earth places refused and
  their Moon places counted, and the owner's visits' (on either world) none at all; two /64s of one
  IPv6 /48 adding a cell once and sharing a visitor's places, another /48 another visitor, and the
  visit caps still each /64's; a visit heard `DROPIN_ASKS_PER_VISIT` times (here 5) and no more, and
  not asked about again once it's done (read from DriveLimits' storage); D1's table holding only day,
  world, cell and count; no cell, address or visit's id in the Worker's stored files; a copy of
  DriveLimits' storage tried for every salted hash of the address, the visit and the cell (none
  there: only HMACs with the Worker's key, in tables without rowids), and all of a day's places gone
  when the next day starts; the admin page's answer for a day, a week, a month and a year (totals,
  the most first, names, regions, links, on how many days; a start spot's two cells, the Arc de
  Triomphe's, one place at its pin, and the cell a kilometre off it named by how far), 401 and 403,
  `ADMIN_LOOKS` (429 with Retry-After, the answers kept counted all the same), rows older than two
  years deleted, and an answer kept 10 minutes (an hour past a month) for its period and day, given
  only to the owner, then worked out afresh with what's been counted since; `topPlaces`' featured
  places alone; the towns read without a request (as a scheduled handler would), and none of their
  regions with a "?" (Ho Chi Minh City's region "Vietnam"); the About dialog saying what's kept of an
  address with a place, Cloudflare's 30 days of backups too. The visit tokens are written as the
  Worker before kinds took them (its readVisit's check run on one), and a token with its kind
  changed, or written as a `v2` one, is a 403. A post with 6 of the longest cells still fits in a
  post with all of the stats' counts, well under the Worker's 8 KB.
- `npm run test:drive-ui`: a drop-in at Golden Gate posts its cell with its drop-in (and no
  coordinates), once a visit, and one given up on the way down none; and the admin page with its
  answers made in the test: the heat over the land and sea (seen in the map's own pixels: warm at
  the places, the base map's colours in the Sahara and the South Pacific), the top places and their
  links, today, the week and the month (and the page's period), a place shown from the table with
  what it is, 300 km across, the towns named zoomed in, dragging, the wheel and the buttons, no
  closer than 150 km across, the Moon on its picture with a start spot's second cell saying the
  spot's count, the section between the day chart and the rest, both parts saying "Asked too often"
  to a 429, the world switching after an error, "356 drop-ins counted in 86 cells (1 km)" and "1
  drop-in counted in 1 cell (1 km)", the most in one 1 km cell, visitors over a day and visitor-days
  over longer, a period clicked again not asked again, the places with more than one listed and the
  rest behind **Show all 25** (and numbers on the map for none with one), a share under 1%; after
  the server can't be reached, the worlds' counts, the table and the legend gone and the map saying
  so, and asked again, the answer; the Moon pressed while today's answer is slow saying "Loading..."
  with nothing of the week's; a phone in the dark with no sideways scrolling and the section under
  1,200 px tall, a tap saying what's there and two fingers (and one, zoomed in) moving the map
  without scrolling the page; a phone on its side with the map no more than 65% of the screen, a
  place shown from the table with the whole map and its buttons in view, and a finger beside it
  scrolling the page; and nothing for someone signed out. Pictures of it are saved
  (`admin-places-*.png`).
- `npm run test:drive-moon-ui`: a drop-in at Tranquility Base posts its cell of the Moon's grid with
  `dropin:moon`.

**The owner's steps.** Deploy (`npm run deploy:drive` applies `0005_dropins.sql` first, and the new
`ADMIN_LOOKS` rate limiter comes with `wrangler.drive.jsonc`). Places are counted from that deploy;
the page says from which day. Your own visits (signed in with an `ADMIN_EMAILS` account) aren't
counted, so to see a drop-in counted, drop in signed out (or in a private window). Nothing else to
set: `DROPIN_PLACES_DAILY`, `DROPIN_PLACES_PER_VISITOR`, `DROPIN_PLACES_PER_VISIT` and
`DROPIN_ASKS_PER_VISIT` can be added in the dashboard to change the limits (raise the daily one if
the page's busiest days stop growing at 1,500 places a world).

## Challenges

The [play stats](#play-stats) say most visits drop in and drive, and almost everyone leaves after
about a minute. Challenges give a reason to stay, and to come back: a **daily**, a **weekly** and a
**monthly** challenge on the Earth and on the Moon, six live at once, each a place and a route the
same for everyone in its period, with its own board of each player's best time.

### What players see

- **Challenges**, under **Earth | Moon** at the top of the globe's panel and in the pause menu. Its
  code is a chunk of its own (`src/drive-app/challenges.js` with `challenges.css`), fetched the first
  time it's pressed: nothing of it is in the page's first load ([what it costs](#what-challenges-cost)).
  Without a Worker (the dev server alone) the button isn't there, as the trophy isn't.
- **The list**: the six, the current world's three first ("On the Earth", "On the Moon"). Each card
  says **Daily**, **Weekly** or **Monthly** with the time it has left, ticking ("5 h 12 m left", "2
  d 5 h left", "12 m 30 s left"), the place and its region, the kind and what it is ("Checkpoint
  sprint · 6 gates · 1.5 km", "Collect them all · 6 stars · 260 m round", "Drive to a landmark · To
  Tycho crater · 2.1 km"), the board's top three (with the leaderboard's names, a supporter's ⭐ and
  levels, "Lv 12 · Drifter"), your best and place ("Your best 0:48.20 · #3 of 41"; past a thousand
  ahead of you, "#1000+": a rank is found among a board's first thousand times), **Start** and
  **Board**. On a phone on its side (520 px high or less) the cards are short and side by side: no
  intro or footnote, the place and what it is beside **Start** and **Board**, the board's best
  alone, and yours, so two whole cards and their **Start** are on the screen as the list opens (the
  test checks the first card's). A period ending while the list is open brings the new one: the
  ended card says "Over: the next one is on its way", dimmed with its **Start** off (a run of it
  wouldn't be taken), and a new list is asked for once. If that doesn't come (the Worker not
  answering, or busy at the turn of a period), it's asked again after 5 s, then after 10 and 20 more
  (or after the Worker's `Retry-After`): four asks at most, then not till the list is opened again,
  never every second, which would hold an address at `CHALLENGE_LOOKS`' limit for everyone behind
  it. **Board** shows the top 20 with your own row picked out, and below them where you are ("You're
  #42 of 130, with 1:02.40"). A board slow to answer, left for another's, never shows its rows under
  the other's title (only the last board asked for is shown); one turned away for being asked too
  often says so ("Asked too often just now. Try again in a minute.").
- **Told while driving.** A visit that has driven 40 s (and hasn't opened the challenges) is told of
  today's challenge on the world it's on, as a toast with a **Challenges** button: "Today's
  challenge on the Earth: Furka Pass. A timed run with its own board." (main.js's
  `challengeNudge`; the place is from one ask of the list, then, and the challenges' own code still
  only loads on the button). Not over another toast (it waits a few seconds more), once a visit.
  Both are counted for the play stats (`challenge`: `nudge`, `nudge_open`), so the owner can see
  whether it keeps people longer than the minute most stay. On the dev server it's off unless a
  test asks for it (`window.worldDriveNudgeTest = { after }`), as the other tests drive longer than
  that and look at what the toasts say.
- **Start** goes back to the globe if you're driving (a run going is left), turns the globe to the
  challenge's world and drops in at its start, as any drop-in there does: an Earth challenge needs
  an Earth drive, a Moon one none. A sprint's and a hunt's start is the place itself, named so; a
  landmark's is a pin kilometres from it, so it's a **Dropped pin** to everything that names places
  (a stunt score's board, others in the room: by its coordinates, as `placeLabel` names a pin), "On
  the way to Eiffel Tower" on the top bar and the loading screen, and not one of the recent places
  (`recent: false`: picking it there later would drop you kilometres from the landmark). Pressed as
  its period ends (the list a moment behind), a challenge that's over doesn't start: the list says
  why ("That challenge has ended, so a run of it wouldn't count. Here are the new ones."). With
  today's Earth drives used up (or a page opened on a link to the Moon: main.js's `moonOnly`), the
  Earth's cards say **Needs an Earth drive**, which shows why (the used-up screen, or for a page
  opened on the Moon, the reload to the Earth); the Moon's start there as anywhere, from the used-up
  screen's **Drive on the Moon** too.
- **The run.** The car comes down at the start and a countdown, **3, 2, 1, GO!**, holds it there:
  the gas can be held down, ready, and nothing moves till GO. The visit's first time on a computer,
  the keys card is shown over the countdown, which is longer then (6 s, "Get ready" till the 3), and
  put away at GO (or after 10 s, for a run left before it): a first drive may well start as a
  challenge, that card is how a first-timer learns the keys, and nothing covers the road while the
  clock runs. Then the timer runs on the HUD with
  how many are passed ("2 / 6", "3 / 6 ★", or a landmark's name) and an arrow to the next one (the
  nearest star not taken), turned as it lies from where the camera looks, with how far it is. A
  sprint's gates are rings standing across the way, a landmark's one ring, collectibles spinning
  stars; each has a beam of light up from the ground, seen from a long way off (twice as tall on the
  Moon), the next gate's yellow, the last green, the rest blue, stars gold. The next gate's beam is
  wider and its ring breathes, and a marker sits over it on the screen (a diamond with how far it
  is), held at the screen's edge with an arrow pointing the way when it's off the screen or behind
  you. On the Moon, whose heights are known everywhere, the course is laid on the ground too: glowing
  chevrons on the ground (leaned up a little, so they read from a low view) every 18 m on the line to the next gate (from the car up to 720 m ahead, a wave of light
  running along them toward it) and dim ones on the first 260 m of the leg after it, so the turn
  coming shows; for a star hunt, from the car to the nearest star. A gate goes as it's
  passed, with "Gate 2 / 6" (or "3 / 6 stars") said over the speed. A sprint's gates count in their
  order only; stars in any.
- **Passing** one is driving into its zone: within its radius across the ground (30 m for a gate on
  the Earth, 40 on the Moon; 18 and 22 for a star; 45 and 60 for a landmark), and up and down from
  2 m over its ground to 2 m over its top, and twice its radius beyond them (a pillar with rounded
  ends: `TALL` in challenge-rules.js). On the Earth its ground is the lowest and its top the
  highest of what rays down across its zone meet (below), so a gate beside a tower is on the street
  and passed there, on the roof too, and one by a bridge on the deck or under it; flying over low
  passes it. On the Moon both are its one height. One whose ground hasn't loaded yet counts across
  the ground alone.
- **The finish card**, as the last is passed: the time ("0:42.37"), **New best!** when it is, your
  place on the board ("#2 of 5 on the board"), its top five with your row picked out, and
  **Retry** (back at the start for another countdown), **Back** (to the globe, the list open) and
  **Keep driving here**. The card is over the road (and on a phone over the boost, fly and brake
  buttons), so the car is **brought to a stop** under it and **held there**, as the countdown holds
  it at the start, till the card's put away (any of its buttons, or a pause): the booster and a
  drift's or a trick's boost are put out at the line (and again if fired under the card), and it
  slows in a second from its speed at the line (at least 12 m/s each second) plus whatever the gas
  adds (a ride's acceleration, half as much again with Shift), so it stops whatever's held down,
  then stays where it stopped. The test holds the gas and Shift (the booster) down after the finish
  and, in the game's own time (the driver's clock: a slow machine's frames are fewer, not longer),
  the car's stopped within two seconds and hasn't moved a second later. With no nickname yet it
  asks for one there (the leaderboard's, with
  its rules) and posts the time with it. Not your best: it says your best and where it stands, and
  nothing is posted. On the test pad (no visit) it says times go on the board from a drive on the
  real map. **Retry** once the challenge has ended (its period over while it was driven, or while
  the card waited) goes to the list instead, saying why: a run of it wouldn't count. What's posted is
  a copy of the run as it finished (its id, time, passes and **the ride it was driven in**): a post
  that didn't get through (no signal, a 5xx, a 429 asking for a minute or less) is tried again with
  that same copy, up to three times, 4 s apart (or after the 429's `Retry-After`), whatever happens
  meanwhile, so pressing **Retry** (each Retry is a new run, with its own id), pausing or picking
  another ride never loses a time or sends one run's time with another's passes or ride; the card
  only shows the answer while it's still up for that run. If it still hasn't got through (a phone in
  a tunnel or a lift for longer than those 12 s, the Worker down), it's **kept** in the page, the
  best for each challenge ("No connection just now: your time is kept here, and goes up when you're
  back online."), and posted again, once each time, when the browser says it's back online (its
  `online` event), when the list is opened and at the next finish, while its challenge would still
  take it (till its end and `GRACE`); a better finish drops it (only bests count). The Worker
  answers the same run posted again within 5 minutes (its answer lost on the way) as it was taken,
  so it still says **New best!**. Pausing on the card (Esc, the pause button) puts it away with the
  run, its time still on its way, and the pause menu is all that's left.
- **What ends a run, quietly**: going back to the globe (**M**), another ride, another place (a
  drop-in anywhere but the challenge's start), Go to or Join someone, and **pausing** (Esc, the
  pause button, or anything else that pauses the drive, as a level-up's Garage does). The pause menu
  then says "Challenge run stopped. Pausing ends a run, so a pause never counts." with **Retry the
  challenge**; **Keep driving** instead is the end of that run, the word gone from the menu the next
  time it's paused. **R** (back on the road) doesn't end it: it puts the car 4 m on at a standstill.
  Why pausing ends a run rather than stopping the clock: a pause would otherwise be free time to look
  ahead while Google's tiles load (they do while paused), and a timer that ran on through it would
  count time nobody drove. So no pause is ever in a time, and none can be had from one.
- **The time is the game's own clock**: the frames' steps the car was driven by, from GO to the
  last pass (main.js gives the run the same `dt` it gives the Driver). Each step is 0.1 s at most,
  so on a phone drawing under 10 frames a second the game runs slow and so does its clock: a slow
  phone's time isn't made worse by its frame rate, and a time always fits how far the car went. The
  page out of sight draws no frames, so its clock and the car stop together. Each pass is the clock
  at the end of the frame that passed it, to the millisecond, and the time is the last pass's.
- **Where it shows**: the HUD under the **Globe** button at the top left, clear of the speed (bottom
  right on a computer, and on a phone on its side its low row in the middle at the bottom), the level
  bar in the middle and the touch buttons in the corners; on a phone held upright it's narrower
  there, beside the speed card in the middle (the test checks none of them overlap), and a touch
  screen's XP pop-ups, at the top left too, move down under it while it shows. The countdown is big
  in the middle; the finish card in the middle, shorter on a phone on its side (its buttons on the
  screen: the test checks).

### The kinds and their routes

A route is laid out once, by the Worker, the first time its period's challenge is asked for
(`makeRoute` in `src/drive-app/challenge-rules.js`), from the period's own random numbers, and kept
in D1 as latitudes and longitudes (to 6 decimals, 10 cm): `{ start: { lat, lon, heading }, points:
[ [ lat, lon ] ], radius, goal }`. Only the points' heights are the page's to find, on the ground
it actually has.

| | Earth: day | week | month | Moon: day | week | month |
| --- | --- | --- | --- | --- | --- | --- |
| Sprint: gates, m apart, turn | 6, 200-300, ±30° | 9, 250-380, ±35° | 14, 300-450, ±40° | 6, 280-420, ±55° | 9, 350-520, ±60° | 14, 400-600, ±65° |
| Collect: stars, within m, apart m | 6, 260, 70 | 10, 450, 90 | 15, 700, 110 | 6, 350, 90 | 10, 600, 120 | 15, 900, 150 |
| Landmark: from m off | 1,200-1,800 | 2,500-3,500 | 4,500-6,500 | 1,600-2,400 | 3,200-4,500 | 6,000-8,500 |

A daily one is about 30 to 90 s for a good driver (a city's streets at 100 km/h or so, with the
booster now and then: a daily sprint is about 1.5 km), a weekly one longer and a monthly one longer
still. A daily is a sprint or a hunt for stars four times in five (a landmark's drive is the
longest of the three), the others any of the three alike.

- **A sprint** starts at the place, its first gate along the place's own road (a start spot's
  `heading` is the way along its road) and each after turning a little from the way before. **Stars**
  are anywhere in a disc round the place (as likely anywhere in it), apart from each other and at
  least 60 m from the start. **A landmark** is the place itself, its goal ring at its pin, the start a
  few kilometres back along the road it's on (on the Moon, any way), facing it.
- **On the Earth**, Google's tiles have no roads in them: nobody can see the streets a route crosses
  in advance. So what makes a route fair and fun there is that it's forgiving: gates follow the
  start's road first and turn gently, a gate's zone is 30 m wide (a parallel street, a square, a car
  park beside it passes), every ride can drive over what it meets (the stunts' bounce) or fly over
  it (**F**), and the check against the fastest the game goes is on straight lines, so a run that
  flies is no faster than the rules allow. A landmark's start is a pin like any other: the drop-in
  finds the street (or the deck, or the sea's surface) near it. A gate's ground is found by rays
  straight down from 9 km up, as the drop-in's is (spawn.js's `heightAt`), on whatever has loaded
  there: nine of them, at its middle and at eight points round it 0.6 of its radius out (18 m for a
  sprint's gate). The lowest they meet is its **ground**, where it's drawn and its zone's middle is
  over: the street beside a tower rather than the tower's roof, which the one ray at its middle
  would meet first (a start spot like the Strip's or Shibuya's is among towers). The highest is its
  **top**, and its zone reaches up to that too, so it's passed on the roof as well, or on a bridge's
  deck over the water it's drawn on. **A few rays a frame**: a tile's first ray builds its bounding
  volume hierarchy on the main thread (src/raycast.js: 3 to 13 ms on a computer for 10,000 to 40,000
  triangles, several times that on a phone, [above](#out-from-a-coast)), and a gate's rays reach
  tiles the car's never do, so they're cast as the sea's look's are (`OPEN_MS`): one gate at a time,
  and no more rays in a frame once they've taken 4 ms (`PROBE_MS`), the rest the next frame; none in
  the frame the car arrives in. Only the gates within 800 m of the car are looked at (`PROBE_NEAR`:
  a far one's tiles are coarse, so what a ray finds there is rough anyway, and its 320 m beam hides
  that): the nearest not looked at yet first, then one every 0.2 s, so they move onto sharper tiles
  as those load. One farther off shows at the start's height (its beam seen all the same) and is
  passed across the ground alone till the car comes within 800 m of it. One over water is at
  Google's water (or the sea's surface where it's laid). What can't be helped: a gate can be on a
  building wider than 36 m (every ray meets the roof: it's drawn there, its zone reaching 60 m under
  it), in a courtyard or among buildings with no street to it (fly), and a sprint can lead off the
  road it started on.
- **On the Moon** the ground is open, and its heights are the game's own (moon-height.js): exact
  before any of its ground is built, the same in the Worker as in the page. So the page puts each
  point on them at once, and the Worker **checks each route**, at its points and along its legs. No
  point (and no landmark's start) on ground sloping 20° or more across ±15 m, craters under 30 m
  left out (the car drives over those), so no gate is on a crater's wall; and each leg in its order
  (a sprint's from the start through its gates, a landmark's from its start to it; a hunt's stars
  are taken in any order, so its legs aren't known) looked along the straight line, its heights
  every 25 m, each stretch of 100 m rising or falling 20° or more a fault (`legFaults`), so the way
  from gate to gate isn't over a crater's wall or up a mountainside either. A steep point counts as
  ten stretches (a gate on a wall is worse than a wall on the way, which can be driven round or
  flown over). The place's own pin (a sprint's start, a landmark's goal) is where it is, the same in
  every try, so it isn't counted: no faults means nothing could be better. A sprint or a hunt is laid
  out up to 8 times and the one with fewest faults kept (`moonFaults` in
  worker/drive/challenges.js; counting stops once a try has as many as the best so far). **A
  landmark's drive**, with no road to come along, is tried from **every 5°** round it at one
  distance (drawn from its range, in whole metres), from a bearing chosen at random (in whole
  degrees), and the first with fewest faults kept: on rough ground the way in that's clear may be a
  narrow window (at Shackleton's rim, 20° or so either way along the rim), which 8 bearings spread
  round, as it was first, missed on 13 of the 1,664 drives below (one crossing 10 steep stretches up
  and down Shackleton's wall where a way along the rim was clear). Each bearing is first only asked
  whether its leg has any fault, looked for from the landmark's end, where its own crater wall or
  mountainside is, so a leg that crosses one is told in a few reads; only where none is clear are
  they counted. The Worker reads the Moon's heights from the site's own `/moon/height.bin` through
  its `ASSETS` binding once per Worker instance (2 MB, 0.3 ms to read in Node); a point's check is
  four looks at about 1 µs each, a sprint's 0.7 ms with its tries and legs (a monthly's too), a
  landmark's 0.2 ms as a rule and 2 ms at most (Shackleton's rim), well within the Free plan's 10 ms
  of CPU a request. Laid out for 24 of the Moon's places, each kind at a week's size, 9 of their 480
  points were left on ground that steep (18 unchecked), on the roughest ground, where none of the
  tries found better; for all 52 places, sprints and landmarks of each length, 20 of their 1,664
  legs cross a steep stretch, 6 at most, all sprints' on Shackleton's rim and Mons Hadley, where
  none of their 8 tries was clear (with the points alone checked, 50, up to 31 on one); and of the
  landmarks the Worker lays out with its own random numbers for every place over 20 days, 8 weeks and
  4 months (1,664 drives), 10 cross a steep stretch (7 at most), on Shackleton's rim and Mons Hadley
  on days whose distance has no clear way in from any bearing, and none where another bearing at its
  distance is clearer. The tests check all three.

### How they're picked

- **Periods** are the UTC day, the week from Monday (as the leaderboard's and the visit caps') and
  the calendar month: `day:2026-11-16`, `week:2026-11-16`, `month:2026-11`. Each ends where the
  next begins (midnight UTC, Monday's, the first of the month's).
- **The rotation** goes round the places on each world: the game's featured places (on the Earth
  the 12 start spots and the 5 places' pages with a pin of their own, the Eiffel Tower, the
  Colosseum, Piccadilly Circus, Hollywood Boulevard and Copacabana; on the Moon its 52 places, the
  spots and those its search finds) and the busy drop-in places the owner has approved. They're
  shuffled afresh each time round (a round is as many periods as there are places: 17 days for the
  Earth's dailies), sorted by an HMAC-SHA256 of the round and each place's id, and each period takes
  the next (its own place): so each place comes about once a round. Two rules on top. **The three
  live on a world are three places**: a period never takes the rotation's pick for a longer period
  it's in (a day its week's or its month's; a week the month it starts in or the one it ends in, as
  a week across a month's end is live beside both). **No place comes twice in a row**: a period
  never takes the period before's pick. One whose own place is ruled out steps aside to the place
  half a round on in the order, or the first free one after that, never the next or the last in the
  order (the periods either side's own places); that place then comes twice that round, and the one
  stepped from not at all. The period before's pick is only worked out where it could clash (at a
  round's start, whose first may be the last round's last or its step aside, and where a period
  steps aside anyway; anywhere else it's the order's last place or a step aside, never this one's
  own), so working back stops within a few periods: a round's own places are all different, and
  only the few its longer periods took make one step aside. The tests check both rules over three
  years of days, ten of weeks and thirty of months on each world with four keys. The kind is an HMAC
  of the period's key too, and so are the route's random numbers (of the period's key, the world,
  the kind and the place: sfc32 from its bytes).
- **The rules against what's fixed.** Worked out alone, the rotation's rules hold only while its
  places stay as they are: approving or unapproving a place changes how many there are, and with it
  each period's round, order and place, so what it would choose now for yesterday or this week isn't
  what was fixed then; and an owner's pick for a week or a month is no rotation pick at all. So when
  the Worker fixes a period from the rotation it keeps clear of **the places D1 has fixed**: those
  of the other kinds live beside it (a day's week and month, a week's month, a month's week, by
  whoever chose them) and the period before's of its kind, read with the owner's picks (one more
  indexed read, only when a period is fixed); and of what the rotation alone would give a longer
  period it's in that isn't fixed yet (a week across a month's end, the month it ends in), as
  before. The periods to fix are fixed the longest first (the month, the week, then the day), each
  clear of those fixed just before it. Places are the same to these rules by their ids where both
  are the rotation's own, else by their names or pins within 1 km (an owner's pick of the Eiffel
  Tower by its coordinates is the Eiffel Tower). Every instance reads the same rows, so they still
  agree. The admin page's next six are worked out the same way, the longest first, each clear of
  what's fixed now and of those worked out before it (on a Sunday, Monday's day clear of next week's
  pick of yours, as it will be when the two are fixed together). A test
  fixes a year of days as the Worker does, with the owner picking every third week and every other
  month the place the rotation alone would give one of its days, and places approved and
  unapproved on the way (the rotation alone would have clashed on 20 days or more of each): never a
  day the one before's, nor any of the three live alike where the rotation chose the later; and the
  Worker's own, through its routes, with a place approved and the owner's picks for a Tuesday and its
  week: the Wednesday and Thursday clear of both; and a Monday whose week and day are fixed by the
  same ask, the owner having picked for the week the place the rotation would give the day were it
  fixed first: the day another place, as the admin page's next up said the evening before.
- **The HMACs' key** is derived (HKDF) from the Worker's `TURNSTILE_SECRET` with a label of its own
  (`world-drive challenges v1`), as the visit tokens' is: every Worker instance agrees (the tests
  work them out in another process and get the same place, kind and route), and nobody without the
  secret can work out next week's from the code.
- **Only featured or approved places.** [Part 1's ranking](#for-challenges-the-most-dropped-in-places)
  of where people drop in can be pushed by anyone with many addresses passing the robot check, so
  nothing it ranks goes into the rotation by itself: the busy places that aren't the game's own are
  a list the owner approves from.
- **Fixed in D1 the first time it's asked for.** The first ask in a period (anyone's list, a time,
  or the admin page) writes the period's challenges into D1, each from the owner's pick for it if
  there is one, else the rotation's; two Worker instances doing so at once both insert, and the
  first's row stays (a unique index on the period and world of live rows). From then on it's read,
  never worked out: a later change to the rotation's code, the places or the approvals never changes
  a live challenge (only those not yet fixed, which the admin page shows as they'd be fixed now), and
  the rules keep clear of what it fixed.

### The owner's controls

On **`/admin.html`** (an account in `ADMIN_EMAILS`, as the rest of the page), under where people
drop in, **Challenges**:

- **Live now**: the six, each with where it came from (**rotation** or **yours**), how many drivers
  have a time on it, the best and who, the time left, and **Change**. **Next up**: the six of the
  next day, week and month, as they'd be fixed now (yours, or the rotation's, clear of what's fixed
  now and of the longer ones next up). You know each place and kind ahead, not its route: that's
  laid out as the period's first ask fixes it.
- **Your picks ahead**: every pick of yours from the live periods on, however far ahead (Christmas
  Day's, chosen in November), soonest first, each with its period ("· live now" for a live one), the
  place and the kind, **Change** (the form set to it: picked in the list if it's live or next, else
  as its day typed in with its kind beside it) and **Back to the rotation** (asked about first if
  it's live, as below). The Worker lists them by ranges of their key from each kind's live period
  on (2,000 at most, far more than the 400 days ahead a pick can be made for).
- **Choose one**: a period (today's, this week's or this month's, live now, or the next of each; or
  **another day** typed in, up to 400 days ahead, with **Its** day, week or month beside it), the
  world, the kind, and the place: one of the game's places, a busy place you've approved, a busy
  drop-in place of the last 30 days (part 1's top places that aren't the game's own, with their
  visitor-days), or coordinates with a name, a region and the heading along its road if you know it.
  A day typed in is the period (the list says "The day picked beside it"), and picking another in
  the list clears the day, so the form never shows one period and saves another. **Save** keeps it
  for that period and says which ("Saved for month:2027-01, the Moon."); **Back to the rotation**
  drops yours ("Back to the rotation for ..."). For a period ahead that's all: it's fixed from your
  pick when it comes.
- **A live one** is asked about before anything's sent: **Save** for any live one, and **Back to the
  rotation** for a live one of yours (one the rotation chose stays as it is: below). With times on
  it: "This challenge is live, and 12 drivers have times on it. Changing it now changes what the
  times mean, so it starts a new board; the old one is kept apart, with its places." With none yet,
  it still turns away anyone driving it: "This challenge is live, though nobody has a time on it
  yet. Changing it now turns away anyone driving it (their runs won't count), and it starts on a
  board of its own." Each says which period and world. **Change it anyway** replaces it: the old one
  is marked replaced, its board kept and given its final places at once, and a new one fixed from
  your choice, with a board of its own (from nothing). Players' pages see the new one within a
  minute (each Worker instance keeps the six that long); a time posted for the old one after that is
  turned away ("This challenge is over (or the owner has changed it)"). The Worker asks too (409,
  `live`) if times have come since the page looked, and the page warns then.
- **Nothing to replace**: **Back to the rotation** on a live one the rotation chose leaves it as it
  is, its board going on, whatever the rotation would choose now: it's the rotation's already, and
  what it would choose changes under it (approving or unapproving a place reshuffles its order, as
  a new version of its code could), which shouldn't turn away anyone driving it. Only a pick for it,
  if there was one, goes. And a change that gives the live one again (a pick of the place and kind
  it already is: the same route, as it's laid out from those; or **Back to the rotation** on one of
  yours that the rotation would choose just as it is) leaves it as it is too, with no warning; only
  whose it's said to be changes.
- **Busy drop-in places for the rotation**: part 1's busy places that aren't the game's own, each
  with **Approve** (into the rotation's places from the next period not yet fixed: it reshuffles the
  rotation's order from then on), and those approved with **Unapprove**. A place is kept by its 1 km
  cell, at the cell's middle, named as part 1 names it ("12 km NE of Lyon"); 100 a world at most.
- Your own runs (with the owner's visits, `o`) are taken and answered with the place they'd have
  ("would be #3"), but kept off the boards and out of their counts: you know each place and kind
  before it's live, and choose them.

### The boards, and what's kept

In D1 (migration `0006_challenges.sql`):

- `challenges`: each period's challenge on each world: `period`, `world`, `kind`, `place`,
  `region`, `route` (the JSON above), `source` (`rotation` or `owner`), `starts_at`, `ends_at`,
  `drivers` (how many players have a time on it, the owner's not counted), `created_at`,
  `replaced_at` (the owner changed it while it was live) and `final_at` (when its final places were
  written). A unique index on `period, world` for the live ones (`replaced_at IS NULL`).
- `challenge_times`: each player's best on each challenge (`WITHOUT ROWID`, keyed by the challenge
  and the player): `ms`, `passes` (when each point was passed: `[ [ index, ms ] ]` in the order
  passed), `vehicle`, `run_id` (the page's own id for the run: 12 random bytes), `visit` (the id in
  its token, as the scores log keeps), `owner` (1: set by the owner's visit, kept off the board),
  `created_at` (when the best was set), `first_at` (when they first finished it) and `final_rank`
  (their place once it's over: 1 the fastest; none for the owner's). Indexed by the board's order
  (`challenge_id, owner, ms, created_at`), by player, and **uniquely by `challenge_id, run_id`**
  (`challenge_times_run`): a run's id names one time on a challenge, and another player's post with
  it (copied from a link to that run, say) is turned away (400, reason `run`), nothing of it
  written.
- `challenge_picks`: the owner's choices of a period's challenge (the place, its coordinates and
  heading, the kind); `challenge_places`: the busy places approved, by cell, with their name.
- `players.last_time_at`: a player's last time taken (one each 10 s; once their visitor's day is
  used up, 10 s before the next midnight UTC, which holds them till then), apart from
  `last_score_at` so a time never holds up a stunt score or the other way round.
- `visits.times`: how many times each visit (the leaderboard's binding of a visit to its player)
  has had taken: 100 at most (`CHALLENGE_TIMES_PER_VISIT`), so one robot check buys that many,
  whatever addresses its token is sent from.

A board is each player's best, quickest first (the same time: who set it first). The top 20, with
names, the ⭐ and levels looked up as the leaderboard's are (a rename or a refund shows at once), and
your own row with its rank, are kept in Cloudflare's cache as the leaderboard's boards are: a live
challenge's board, the list's top threes and each player's own rows on the six **a minute**, so
each of the six live boards is read from D1 at most once a minute in one of Cloudflare's locations,
whoever asks; a **finished** challenge's board **a day**, as its times can't change (a name cleaned
up on it, or a cheat removed, shows within the day where it was looked at, or at once after
**Purge Everything** in the Cloudflare dashboard, which clears what the Worker keeps there
everywhere; few look at an old board). A new best clears what it changes in that one of
Cloudflare's locations; elsewhere they're at most a minute behind.

**A rank** is found, never counted: each board's **order** (its first 1,000 times, quickest first,
read from the board's index alone, as many rows as it has up to 1,000) is kept in Cloudflare's cache
for 10 minutes (a finished one's a day), and a player's rank is where their time falls in it,
found by halving: so their own row is one read by its key however far down they are (on the list,
their rows on the six, six reads), and a board is read whole at most once in 10 minutes in a
location, whoever asks, and again after a new best there (the time's answer reads it afresh, to
give the new rank). Past the order's thousand it's "#1000+". Where your row is among the board's
top 20 shown, its rank is the row's; on a finished board, your final place (`final_rank`). Ranks
further down can be up to 10 minutes behind others' new bests made in other locations; your own
new best is ranked at once (its answer, and the looks after it there).

**Nothing is deleted.** Once a challenge's period has been over for a minute (`GRACE`: a run finished
a moment before midnight is still taken in that minute, if it began before the end), the next ask
that reads the six from D1 (each Worker instance does once a minute) writes each player's
`final_rank` and its `final_at`, after its answer has gone (`ctx.waitUntil`: it's no part of a list
or a time's answer, so it can't slow one or turn one into an error); a replaced one gets them as
it's replaced. A time is written only while its challenge isn't finished or replaced, checked in
the write itself (not just when its row was read, a few round trips before), so none lands after
its final places. Its board stays, as it ended, at `/api/challenges/board?challenge=<id>`. A row is
about 150 bytes: at a few hundred times a week it's a few megabytes a year, well under D1's 5 GB.

**What achievements can rely on** (part 4: challenges finished, placed in): a player has finished a
challenge when `challenge_times` has a row for it (`first_at` when), and placed in it once its
`challenges.final_at` is set, at `final_rank` (`NULL` for the owner's runs, which aren't on boards).
A challenge's period and kind are `challenges.period` (`day:` / `week:` / `month:`) and `kind`; one
the owner replaced has `replaced_at` (its board was cut short: whether its places count is part 4's
to say). Final ranks never change once written, and no time is written after them (a cheat's row
deleted later leaves a gap rather than moving everyone up; see the SQL below). `final_at` comes
within a minute or two of `GRACE` after the period's end (with the first ask after it). A player's
challenges, finished and placed, are one indexed look (`challenge_times_by_player`):

```sql
SELECT c.period, c.world, c.kind, c.place, t.ms, t.final_rank, c.final_at IS NOT NULL AS over
FROM challenge_times t JOIN challenges c ON c.id = t.challenge_id WHERE t.player_id = 'PLAYER_ID' ORDER BY t.first_at;
```

**Ghosts and links** (migration `0007_challenge_ghosts.sql`, [below](#ghosts-and-challenge-a-friend)):
`challenge_times.handle`, each time's handle (unique on its challenge), `challenge_times.ghost`,
whether its ghost is kept and one to race (0 none, 1 kept, 2 kept and plausible: what a board's
rows and the list's race go by, so no ghost's row is read to rank a board), with the index
`challenge_times_raced` of the times with one to race (the list's race: one row), `challenge_ghosts`,
the best's ghost on each challenge for each player, kept while the challenge is live, and
`challenges.ghost_bytes`, how much of them each challenge keeps (16 MB at most).

### Ghosts and challenge a friend

Most visits end after a minute. A ghost to beat gives a run a rival that's always there, and a
friend's link brings someone new in with a reason to play past the first minute and a time to
beat. Every challenge run is **recorded** as it's driven and posted with its time; the Worker takes
the time only if the recording (its **ghost**) agrees with it, keeps the best's, and hands it to
anyone racing it; and **"Challenge a friend"** shares a link to your best that opens the game on
it, racing your ghost. The code is the challenges' own chunk's (`src/drive-app/challenges.js`,
`challenge-ghost.js`, and `ghost-rules.js`, which the Worker shares): nothing of it is in the
page's first load but the few lines `boot.js` needs to ask what a link is (below).

**What players see.**

- **A ghost car to beat.** A run races your own best's ghost by default (the run this page just
  posted, or the Worker's, by the list's `me.run`); with no best of yours yet (a first run, which
  is most visits' only one), the board's quickest plausible time's, by the list's top rows' one
  `run` (the way round to follow, and a time to race: the Worker hands out the run of one row
  alone, the quickest with its ghost kept and a time no quicker than twice the least its route
  allows, below, so a made-up leader isn't the one every newcomer races); the one a friend's link
  names; or that row's from the board (**Race their ghost** on it, not on yours). It's drawn as the others' cars are when driving
  with others ([ghosts.js](#what-you-see-and-do)'s `ghostModels`, shared, so a ride's file is read
  once for both): its ride in its Garage look, its wheels turning and steering as it goes (its
  ride's own animation, fed its speed and turning from its samples), its name over it ("Your best",
  "Ann Racer"), see-through within 8 m of your car or the camera, and nothing in it to hit (its
  meshes' rays go nowhere, and nothing the car, the camera or the ground casts at is near it). Its
  model is made light first (below). It waits at the start through the countdown and goes at GO, on
  the run's own clock (the same steps the car is driven by), between its samples, so a run that's
  level with it is beside it; after you finish it drives on to its own finish and waits there (a
  slower one is seen coming in). A ghost asked for that can't be had (a friend's that a better time
  of theirs has replaced, the Worker not answering) is said on the HUD as the run starts ("Ann
  Racer's ghost couldn't be loaded, so this run is without it."), and the run goes on.
- **Splits**: at each gate passed (a sprint's by its number, a hunt's stars by how many are taken),
  how far ahead or behind the ghost you are there, on the HUD beside the clock for 3 s ("-1.2 s" in
  green, "+0.8 s" in red), and on the finish card ("1.24 s quicker than your best", "0.80 s behind
  Ann Racer's 0:21.40").
- **Ghost** on the HUD (its one button, so it alone takes a press; on a phone held upright its icon
  alone) hides it, or shows it again; kept in the browser (`world-drive.ghost`) for the visit's next
  runs and the next visit's. Splits go on with it hidden.
- **Challenge a friend**, on the finish card once the time's gone up (and for a run that isn't
  your best, your best's link, by the handle the list said with your best or, if it didn't, the
  board's own row the card shows), on your own row of a board, or beside "You're #42 of 130" when
  your row is further down. It shares a link to your best,
  `https://worlddrive.app/c?challenge=<id>&vs=<handle>` (its own path, `/c`, for its preview card:
  below), with its words ("Beat my 0:21.40 on today's Furka Pass sprint in World Drive", "...on
  this week's drive to Eiffel Tower...", "...on today's Tycho crater star hunt on the Moon...")
  through the browser's own share sheet where it has one (a
  phone's: messages, chats), else copies them ("Link copied!"), else shows them in a field picked
  out to copy by hand. Closing the sheet without sharing does nothing more. Shared or copied is
  counted for the [play stats](#play-stats) (`challenge: share`).
- **A friend's link.** The page asks the Worker what it is (`/api/challenges/link`) as it starts,
  beside the robot check, so it costs no wait: the visit waits for its answer at most `LINK_WAIT`
  (4 s) after the check, to know its world, and one slower than that opens its card when it comes
  (over whatever's going on, a drive paused as Challenges does), the visit's world the Earth for
  want of knowing. The challenge's world is the visit's: **an Earth challenge spends an Earth
  drive** as any page load on the Earth does, **a Moon challenge none**, the game opening in the
  Moon-only mode (`moonOnly`, as a [link to the Moon](#going-there) does).
  With today's Earth drives used up an Earth challenge's link shows the used-up screen, and **Drive
  on the Moon** opens the Moon with the link's card, its Start saying **Needs an Earth drive**. The
  globe comes up as for a link to a place, then the challenges' list with the link's card over it:
  "Ann Racer's time to beat: 0:21.40 on the daily checkpoint sprint at Furka Pass, 5 h 12 m left."
  and **Start: race their ghost** (a drop-in at its start, racing their ghost). The link leaves the
  address once it's opened, the address back to the home page's `/` (a reload doesn't open it
  again; a `?ref=` stays). The page reads a link the same at `/` (`/?challenge=<id>&vs=<handle>`),
  without the preview card. A handle that names nobody (cut short in a message, or that player
  removed) opens the challenge without a ghost and
  says so ("That link's time wasn't found..."); a link to a challenge that's over shows its final
  board, their time and place on it ("This challenge is over. Ann Racer finished ... #2 on its
  board.") and **Today's challenges**; one to no challenge says so over today's. A link's page and
  a run started from it are counted (`challenge: link`, `link_start`), so the owner can see whether
  links bring people. On the test pad (maps off) a link's card shows too, its run raced, its time
  not posted (as any time there).

**Recording.** Each frame of a run (after the car's own step, before the passes), the car's model
(its pivot, as drawn: continuous through a jump's take-off and landing, where the Driver's own
`east`/`north` move to and from the middle of its box) is read for where it is and which way it
faces, and every sample due since the frame before is found between the two, at 0, 100, 200... ms
of the run's clock (`GHOST_EVERY`), and at the finish the last pass's time itself. Into arrays made
once when the chunk loads (positions and turns for 4,097 samples, the packed numbers and a 48 KB
buffer: 311,360 bytes, about 300 KB), so a frame allocates nothing. A run longer than 4,096 samples (6 min 49 s)
drops every other one and goes on every 200 ms, and so on (`everyFor`): a two-hour run, the longest
a time can be, is sampled every 3.2 s. At the finish it's put into the **ghost's frame**, the
route's start on the world's ellipsoid at height 0 (east, north, up; as the scene's own frame is at
a place, through the globe's own matrices), and packed (`packGhost`): a version, the interval, the
count, then each sample's position as its second difference in centimetres (the change in its step:
along a road a few centimetres) and its yaw, pitch and roll as their change in 1/1024 of a turn,
each a zigzag varint. Measured: a run of 73 s driven on the test pad by a bot pressing the game's
own keys (the physics' turns, braking and body roll), 4,416 bytes (5,888 characters as posted);
a run of 4 min 44 s (twice round a loop of eight gates up and down the pad), 17,076 bytes (22,768
characters); and on a path of a road's turns, a bump now and then, a minute 3.6 KB, five
minutes 18 KB, two hours 21.8 KB (every 3.2 s), against `GHOST_BYTES`' 48 KB at most. The posted
text is base64url: 33 % more.

**Racing one.** Its numbers are unpacked once and put into this scene once as its run starts (a
drop-in elsewhere near the same start is another scene: from the start's frame through the globe's
matrices, so it's where it was, to the millimetre), then each frame it's placed between two samples
and turned between their turns, its wheels turned, and its name tag moved: a few dozen numbers.
**Its cost** is its model's own draws and triangles and no more, and the model is **made light**
for it (`lighten` in challenge-ghost.js), once for each ride and look on a page: each material's
still parts merged into one mesh (on the model, or on a wheel its ride's own animation turns,
found by running that once; a mirrored part's triangles turned the right way round as it's merged),
then **simplified** with meshoptimizer's simplifier (`simplifyWithAttributes`, in **a worker of its
own**, `ghost-light-worker.js`: 54.7 kB, 19.5 kB gzipped with its WebAssembly, started with the
first ghost raced, on neither the first load nor the challenges' chunk): it only takes triangles away, so every vertex left is one of the ride's own
(its place, its normal and its place in its picture as the file has them), and it opens no holes.
It stops at a tenth of a part's triangles, or sooner where a place would move more than 0.4 % of the
part's size (the pickup's body: 2 cm, under which a panel's layers stay in their order) or a normal
or, on a part with a picture, a picture's place would change much (a tyre's tread, finer than the
triangles left, isn't stretched). Glass, decals and the underglow are left as they are, a ride's file's skinned meshes
merged as their bones hold them; where WebAssembly can't run, or the worker can't start, the parts
are only merged. **None of it holds the page up**: the page's own share (reading each part's
vertices into one, in the carrier's frame) is done 8 ms at a time with the page's thread let go
between (a frame drawn), and the simplifying, the long part (the pickup's body alone is a few
hundred milliseconds on a computer, seconds on a phone), is the worker's, the arrays copied to it
and handed back. Made in one task, as it first was, the pickup's held the page's thread for 1,037
ms in the UI test (a frozen countdown, or, on a phone whose ride's file came late, a frozen run);
in the worker, 180 ms at most while it's made (a SwiftShader frame drawn among it), the test
failing past 400. **And never mid-race**: a ghost is raced from a run's start only if it's ready
before GO; one whose data comes while a run is racing isn't even built (reading a ride's file is
itself half a second here for the pickup's) till that run's done, and is raced from the next
(Retry), so nothing appears, or is drawn for the first time, while you race. What's left of its
cost falls before GO: building it (the pickup's file read, 0.5 s in SwiftShader, once a page) and
drawing it the first time (0.6 to 0.8 s there, its shaders made; a phone's GPU makes them in a
fraction of that). Measured
(Chromium, SwiftShader): the pickup, the default ride, from 39 meshes and 219,049 triangles (its 79
draws as you drive it, with its glass drawn both sides) to 25 and 89,552, ready about 9 s after
Start in SwiftShader on a loaded machine (its file loaded and simplified, while its drop-in loads);
close up from behind it looks as the whole model does (`challenges-ghost-pickup-close.png`); the
go-kart, already light at 17,224 triangles in 132 meshes, to 34 meshes and 15,574 (its round
parts' normals and edges kept). Its
first light model merged vertices into cells of 10 cm instead (22,387 triangles), which smeared its
pictures, opened holes in its tailgate and bent its shading across creases: the triangles a ghost
saves aren't worth a broken-looking car, the one most races are against. A ghost of the pickup
unlightened had doubled the frame's triangles (442,000 to 882,000, 79 draws more) and slowed
SwiftShader's frame by a third; light, it's two fifths of your own car's in 25 draws. Drawing time
in Chromium's software renderer on a loaded machine is within its noise either way (the UI tests'
medians by turns shown and hidden; headless, frames are paced at 16.4 ms either way).

**What the Worker checks** (`ghostFault` in ghost-rules.js, after `checkPasses`, before anything is
read of the player or written; a 400 with `reason: 'ghost'` and the fault):

- `form`: a ghost (base64url, 48 KB at most packed, this version, no number longer than four bytes,
  no more samples than 4,097, no byte too many or too few, no sample further than 60 km from the
  start or 20 km up or down) sampled at the interval its time should be (`everyFor( ms )`: one
  sampled more coarsely, where a corner could be cut between samples, is refused), and **no more
  than 10 bytes a sample** on average (`GHOST_DENSITY`, and 8 for its head): driving packs into
  about six (a fair run in the test under seven, the bot's 73 s run 6.0, a crash or a jump more for
  a moment), while one packed as densely as the speed rule lets it be (half a metre's jitter each
  way every sample, its turns anything) takes about twelve, twice a real run's room of a
  challenge's ghosts. Its count is
  checked before anything of that size is made, so no post has the Worker make more than 4,097
  samples' arrays.
- `time`: as long as the time (`countFor( ms )` samples, the last at the time itself).
- `start`: its first sample (the car at GO) within `START_SLACK` (100 m) of the start, as the first
  leg's check has it.
- `speed`: between any two samples no further across the ground, nor up or down, than `FASTEST`
  (430 km/h, the fastest the game goes: [below](#how-cheating-is-limited-1)) covers in the time
  between them, and 0.3 m for the rounding to the centimetre and the line between two frames
  (nothing climbs or falls faster than it drives: a fall is stopped 200 m down, by then at about
  63 m/s, and a hit's throw is 13 m/s). Past that, only the game's own jumps: **R** puts the car 4 m
  on (`RESPAWN_AHEAD`; 5.5 m let off, for its model levelling as it does), and R with no way on, or
  falling off the edge of the world, puts it back where it drove before (onto the path it drove,
  however long before: within 4 m of a line between two samples of it; R goes back to where the car
  last drove freely on the ground, a second or so before mostly, but **after a flight, where it took
  off**, which can be minutes back: every ride can fly, a landmark's drive is 1.2 to 8.5 km, and
  drive.js keeps the last free place only on the ground), up or down as far as that is. At most 4
  such a run, and one more for each 15 s of it, 32 at most. A jump back is looked for from the most
  recent sample back (where it nearly always is), as far back as the start, so a ghost's jumps cost
  the check 32 looks at its 4,097 samples at most: about 130,000 lines measured against, under a
  millisecond. (It looked only a minute back at first, and an honest run with a flight of over a
  minute and then R was refused as too fast.)
- `pass`: each point within its radius (and 3 m, `PASS_SLACK`: the model's middle is a little off
  the point a pass is told by, in the air) at its pass time, between the samples either side of it,
  or at a sample within one interval of it (a ghost that goes through a gate a second before or
  after its pass says, or 3.5 m wide of its radius, is refused).

A **new best's run id must be new** (400, `run`, for the best's own id with a better time): a run's
ghost is kept, and cached, by its id, so it never changes.

**What it can't stop.** A script can still make up a run that fits: a path at 430 km/h straight
from gate to gate, its samples as the rules want them. It has to make a whole path now (not only
the passes), one the board's other drivers will see driving through buildings at three or four
times a good driver's speed if they race it; the jumps let off add at most 5.5 m each, 4 to 32 of
them, and the 0.3 m a sample 3 m/s. Such a time tops the board. **Newcomers don't race it by
default**: a first run races the one row the Worker hands out a run on, the quickest whose ghost is
kept and whose time is at least twice the least its route allows along its passes (`PLAUSIBLE`;
`least_ms` kept with the ghost, `leastTime`: the crow's way at 430 km/h, boosted all the way), so a
run averaging more than half the game's top speed in a straight line, made up or flown that way, is
on the board but not every newcomer's ghost. A made-up time slower than that (a straight line at
215 km/h, or a path along the roads at a good driver's pace) still is the one newcomers race,
until the owner takes it off; it's then a path a car could have driven, so what they race is at
worst a fast drive.

And **a real run can be posted again, a little quicker.** A ghost handed out is a whole run that
fits the rules, its passes and its ride with it: a script that fetches one, scales its times by
0.97 and posts it as its own (with its own visit, player and run id) is taken as a time 3 %
quicker, the same line, ride and paint, and indistinguishable from a skilled run. Handing out fewer
makes fewer templates: a board's rows (and the list's tops) carry their run's id on one row alone
(the one raced from a board, above), your own and a link's (a link is its sender's to give). Leaving the passes out, or handing ghosts out coarser, wouldn't stop it: the passes come out
of the path and the route (both public), and a coarser path filled in between its samples still
fits. Nor does the Worker turn away a near copy by itself: two honest drivers can make the same
path (the same ride held flat out along a straight route from the same start is the same line,
and a time a few milliseconds apart), so a copy can't be told from that by the path alone, and a
copier only has to move the path a metre to get past such a check. So it's the owner's to look at,
and to take off the board (its ghost goes with it). The SQL below finds only **a naive copy**: a
time whose passes are another's all scaled by one factor (two honest runs differ leg by leg). A
copier who scales each leg differently (between 0.96 and 0.98, say) gets past it. For those, look
at the suspect's ghost beside the one it may have been copied from while the challenge is live
(both decoded with `readGhost`, each resampled by distance along its path, and compared point by
point: a copy keeps the other's line to the centimetre, every bend and wobble; two honest runs of
the same route are metres apart in places), or race it from the board. A copier who moves the path
too can get past that as well; what's left is that a copy can only be as good as a real run, a
little quicker.

```sql
-- The ghost of a board's fastest times (while the challenge is live: they're gone with its final
-- places), with who and the ride: race it in the game from the board's Race their ghost, or decode it
-- with src/drive-app/ghost-rules.js's readGhost.
SELECT p.name, g.ms, g.vehicle, g.look, length( g.ghost ) AS characters, g.run_id
FROM challenge_ghosts g JOIN players p ON p.id = g.player_id WHERE g.challenge_id = 42 ORDER BY g.ms LIMIT 10;

-- Naive copies: pairs of the board's top 50 whose every pass is the other's scaled by the same
-- factor (within 0.2 %), the quicker one's player first. A pair of honest runs differs leg by leg; a
-- pair at a factor of 1 (the same pass times) may be two runs of a straight route held flat out. A
-- copy scaled leg by leg differently isn't found by this (compare the two ghosts' paths: above).
WITH top AS ( SELECT player_id, ms, passes FROM challenge_times WHERE challenge_id = 42 AND owner = 0 ORDER BY ms LIMIT 50 )
SELECT a.player_id AS quicker, b.player_id AS slower, a.ms, b.ms AS their_ms,
	MIN( CAST( pa.value ->> 1 AS REAL ) / ( pb.value ->> 1 ) ) AS least, MAX( CAST( pa.value ->> 1 AS REAL ) / ( pb.value ->> 1 ) ) AS most
FROM top a JOIN top b ON a.ms < b.ms JOIN json_each( a.passes ) pa JOIN json_each( b.passes ) pb ON pa.key = pb.key AND pa.value ->> 0 = pb.value ->> 0
GROUP BY a.player_id, b.player_id HAVING COUNT(*) = json_array_length( a.passes ) AND most - least < 0.002 * most;
```

**The handle** a link names a time by is the Worker's own: the first 12 bytes of an HMAC-SHA256 of
`handle:<challenge id>:<player id>` under the challenges' key derived from the Worker's secret (as
the rotation's and `CHALLENGE_LOOKS`' are), base64url (16 letters). Nobody without the secret can
make one (so no link to a time that isn't), and it says nothing of who: the player's id is half of
their credentials, and in a link would let anyone look them up on every board and follow them. It's
**made once**, as the player's first time on the challenge is written, and kept with it in
`challenge_times.handle` (a better time keeps it: `COALESCE` in the write), with a unique index on
the challenge, so a link finds its time in one indexed look; and what's handed out (with each time
posted, and your own rows: the list's and a board's `me.handle`) is the one kept, never worked out
afresh. So the same player's link on the same challenge is always the same (one shared before a
better run shows the better one), whatever happens to the secret since: changing
`TURNSTILE_SECRET` (after a leak) reshuffles the rotation and the look keys, as it does, but links
already shared go on working, and a new player's first time after it gets a handle under the new
key. A link shows nothing of the sender but the name and time the board shows (and their run's id,
12 random bytes the page chose, which its ghost is fetched by: it says nothing of anyone).

**The link's preview card.** Chat apps show a link's title and description from the page's Open
Graph tags, which a crawler reads without running the page. So a link has a path of its own, `/c`
(`LINK_PATH`), and the Worker runs for it, `/api/*` and `/ads.txt` alone (`run_worker_first` in
`wrangler.drive.jsonc`): the home page and every other page stay files served straight from the
assets. (Running the Worker for `/` instead would make every page view a Worker request, and on the
Free plan, once the day's 100,000 are used up, a path the Worker runs first for is answered with a
429 rather than its file: the home page would be gone for everyone, Googlebot too, until midnight
UTC. `/c` going that way leaves a link's page down, not the site.) `/c` is the home page's
`index.html` (the page reads the link from the address wherever it is, and puts the address back to
`/` as it opens it) with its `og:title`, `og:description`, `twitter:title`, `twitter:description`
and `og:url` replaced through the HTMLRewriter (each tag written whole with `element.replace`, its
words escaped by `escapeHtml` first: the HTMLRewriter's `setAttribute` escapes a quote but not an
ampersand), from the link's own answer (`linkData`: in
Cloudflare's cache, so a crawler costs a look at the cache, and a D1 read at most once a minute in
a place): "Beat Ann Racer's 0:21.40 on today's Furka Pass sprint" and "A daily checkpoint sprint at
Furka Pass (Swiss Alps) in World Drive, on till the end of Monday 16 November (UTC). Drive it in
your browser and race Ann Racer's ghost." (or "...and beat it." when their ghost isn't kept, past
the challenge's budget below, so the card promises no ghost there isn't); one that's over, "Ann
Racer finished in 0:21.40 at Furka Pass" and that it has ended, with their place. **When it ends,
not how long is left**: a chat app fetches a link's card once, as it's first posted, and shows it
as long as the chat is there, so "5 h 12 m left" would still say so the next day; the page's own
link card counts down. It's sent `no-store` (a time bettered or a challenge over shows at once). Anything that won't
do (no such challenge, a look too many, D1 not answering, the Worker failing) is the page as it is:
the page always opens. The cost: one Worker request each time a link is opened or previewed, held
to `CHALLENGE_LOOKS`; nothing for anything else.

**What's kept, and for how long.**

- `challenge_times.handle`: each time's handle, made with its first and kept with the time
  (forever, as the boards are).
- `challenge_ghosts`: the best's ghost on each challenge for each player (`challenge_id`,
  `player_id`, `run_id`, `ms`, `passes`, `vehicle`, `look`: the ride's Garage look as a room takes
  it, `checkLook`'s parts alone, `ghost`: the text as posted, `bytes`: its length, and `least_ms`:
  the least time its route allows along its passes), written with the time in the same
  batch, only where the time is now this run's, so it's always the best's, **replaced with it**. A
  foreign key to the time with `ON DELETE CASCADE`: a cheat's time taken off the board, or a player
  removed, takes the ghost. **Deleted for a whole challenge as its final places are written**
  (`finishQueries`: a minute or two after its period ends, or as the owner replaces it): nothing
  races a finished challenge, and a link to one shows its board instead. Nothing of an address, an
  account or an email in either.
- **At most 16 MB of ghosts a challenge** (`CHALLENGE_GHOST_BUDGET`, characters, which are bytes:
  base64url), counted in `challenges.ghost_bytes` in the same batch as each is written (and let go,
  when a better one replaces it; set to 0 as the challenge finishes). **The quickest are kept**: a
  new best's ghost that wouldn't fit lets the slowest kept go, slowest first, till it does (only
  ghosts slower than it; up to 64 looked at, one read of as many rows by the index on `( challenge_id,
  ms )`, only while the challenge's ghosts are full; their times' `ghost` set to 0, their `bytes`
  taken off the count and the rows deleted in the same batch as the time and its ghost are written,
  each found **by its key**, the challenge and the player, and only if it's still slower: a post
  reads a row or two of the ghosts however many a challenge keeps. (Round 2's let its eviction's
  clause into the statements every post runs, which SQLite answered by reading every ghost slower
  than the new time, twice: 3,531 rows for a new best on a challenge keeping 1,240, against 45 now,
  which the test pins.) Whether there's room is worked out once, as the time is written, into its
  own row (`ghost`), and the rest goes by that, so the ghost is written exactly when its time says
  it's kept); only a new best that would be
  the slowest kept is taken without its ghost (nobody can race it, and its link has no ghost:
  "Start", not "race their ghost"). The largest ghost the rules take is about 64 KB of text (48 KB
  packed: a sample's numbers each at the most the speed rule lets them be, its turns anything, for
  4,097 samples), against about 4.8 KB of text a minute of a real run (3.6 KB packed), so a script
  posting the most a /48 can (300 a day) of the largest could otherwise have stored 19 MB a day, and
  from ten /48s filled D1's 500 MB (the Free plan's for a database, after which every write fails:
  new players, times, sign-ins, passes bought) in under three days. With the budget the six live
  challenges keep 96 MB of ghosts at most, whoever posts what. What's left: slow runs posted to fill
  a challenge's budget (about 260 of the largest, 6 min 49 s each: a robot check, a player and a
  visit each) are let go one by one as quicker bests come, so they keep no leader's or newcomer's
  ghost out; while it's full, though, a time slower than every kept one has none, until quicker
  times have pushed the filler out or the challenge ends (a weekly's or monthly's period, not just
  a day). **Quick made-up ghosts** are another matter: a made-up run a little quicker than most
  honest ones is kept ahead of them, so about 16 MB of them keeps every slower honest best's ghost
  out (those players lose their own best's ghost and their link's) until the owner removes them.
  `GHOST_DENSITY` (above) holds each to about the room of a real run of its length, so on a monthly
  of runs of a few minutes that's about 400 to 600 made-up runs of 3 to 5 minutes (each a robot
  check, a visit and a player: 20 to 30 days of one /48's 20 new names a day), rather than half as
  many packed twice as densely. If it happens: the SQL below takes their players off, and the
  recount gives the room back. The owner can take a script's players off (the SQL below) and
  recount. On Workers Paid (10 GB a database) the budget can be raised in the dashboard.
- In Cloudflare's cache: a run's ghost by its run, 30 days (`GHOST_KEPT`: it never changes); a
  link's answer as a board is (a live challenge's a minute, its player's new best clearing it in
  that place; a finished one's a day).

**The Worker's routes** (with those [below](#the-workers-routes)):

- `POST /api/challenges/time` takes `look` and `ghost` too (the body 69 KB at most: 2 KB, the
  ghost's 65,536 characters and 1 KB of look), and answers `run` (the best's) and `handle`.
- `GET /api/challenges/link?challenge=<id>&vs=<handle>`: `{ challenge: CHALLENGE + { replacedAt,
  finalAt }, vs: { name, ms, vehicle, run, ghost, date, level, title, supporter?, rank? } | null }`
  (nothing of whether it's the owner's time: the name and the time alone) (`ghost`: whether it has one kept; `rank`: their final place, once it's over; `vs` null
  for a handle that names nobody, or isn't one). 404 for no such challenge, 400 for a challenge that
  isn't a number.
- `GET /api/challenges/ghost?challenge=<id>&run=<run>`: `{ run, ms, passes, vehicle, look, ghost }`,
  404 when that run isn't a best with a ghost kept (bettered, or the challenge finished; not kept in
  the cache, so asked again it's asked of D1, which `CHALLENGE_MISSES` holds), 400 for one that
  isn't a run's id.
- The list's and the board's `me` have `run` and `handle` (the one kept with the time); of a
  board's and the list's top rows one alone has `run` (its ghost to race): the quickest with its
  ghost kept and a time at least `PLAUSIBLE` (2) times its `least_ms`, none if none is, as each
  time's own row says (`challenge_times.ghost` 2, set as its ghost is written and cleared as it's
  let go), so a board's miss reads its 20 rows and their players, 41 rows, with or without ghosts
  kept (a `LEFT JOIN` of the ghosts, as round 2 had it, made it 61, which the test now refuses).
- The list has `race` for each challenge too: **the quickest time with a ghost to race, wherever it
  is on the board** (as a row, with its `run`), or null; what a newcomer's first run races. One row
  of `challenge_times_raced`, an index of only the times with one to race, and its player's, cached
  with the list: so three made-up quick times without a ghost to race at the top (or with ghosts
  not kept past the budget) don't leave newcomers with nothing to follow, as choosing from the top
  three alone did.

Both new routes are held as the boards are: `CHALLENGE_LOOKS` (60 a minute) first, then those that
miss the cache and read D1 `CHALLENGE_MISSES` (10 a minute), by the keyed hash of the address (an
IPv6 one by its /48), never the address. **So is every time posted** that gets as far as reading D1
(its body, its visit token and its ghost's form checked first): each is one of its address's
`CHALLENGE_MISSES`, shared with its lists and boards, asked before the challenge's row is read, as
a post reads D1 (the challenge, the player, the visit, the best, the gap: about nine rows) before the
gap, the visit's times or the visitor's day can turn it away. A page posts once a run (again only if
its answer's lost), never near ten a minute; a script resending a good body, which before read nine
rows each of `CHALLENGE_LOOKS`' 60 a minute (777,600 rows a day from one address), is held to ten.

**What it costs.**

- **The page**: the challenges' chunk from 23.40 kB (9.39 kB gzipped) to 45.98 kB (18.29 kB
  gzipped; 6 kB of it making a ghost's model light; 44.62 and 17.69 before its work moved to a
  worker), and meshoptimizer's simplifier in the ghost-light worker, 54.69 kB (19.50 kB gzipped),
  fetched with the first ghost raced, its stylesheet from 9.17 kB (2.41) to 11.39 kB
  (2.85), fetched when they're first opened (or a link's page opens them); the page's first script
  12.84 to 13.42 kB (5.00 to 5.21 gzipped: asking what a link is, as it starts); the game's chunk
  1,120.47 to 1,121.13 kB (344.64 to 345.10 gzipped: the ghosts' models shared, the hooks, three
  play stats' words). Nothing of the ghosts, the splits, the sharing or the link's card is in the
  first load (the build's test checks).
- **A run**: recording, a few numbers a frame; racing, one light model's draws and triangles
  (above) and a few dozen numbers. Making the model light, once a ride a page, as the run is got
  ready, while its drop-in loads (the pickup's ghost ready about 10 s after Start in SwiftShader on a
  loaded machine, its file read and simplified), off the page's thread (above).
- **D1, per time posted**, by workerd's own count (`meta.rows_written`, every row and every index
  entry, the test measuring it): a player's first time on a challenge 16 rows (the visit's binding,
  the gap and the visit's count, the time and its five indexes, the ghost and its three, and the
  challenge's counts, its drivers and its ghosts' room, in one write), a new best 14 (the old ghost
  let go too), a time that
  isn't one 2 (the gap and the visit's count, as before ghosts); a new best that lets slower
  ghosts go (only while the challenge's are full) writes 2 more and deletes those it lets go (16 in
  the test, letting one go). The challenge's counts (its drivers, its ghosts' room) are one write
  however they change, and the time's row says whether its ghost is kept (its new index entry is
  the one more a time to race writes). **Reads**, by `meta.rows_read`, on a challenge keeping 1,240
  slower ghosts: a first time 28 rows, a new best 45, one that isn't 22, one the gap turns away 9;
  a new best that lets one go 190 (makeRoom's look, 64 ghosts by their index and their rows, D1
  counting both). The rank in the answer is found in the board's order kept in Cloudflare's cache,
  **the new best put into it there** (`placeIn`) and kept again for the rest of its 10 minutes (so
  never more than that behind the bests posted in Cloudflare's other places): before, every new
  best read the board's order afresh, up to 1,000 rows (1,045 rows for a new best then). Storage: a ghost is about 4.8 KB of text a minute of run (3.6 KB packed); only the live challenges' bests are kept, 16 MB a challenge
  at most (above; at a few hundred bests a day, a few megabytes), deleted as each challenge
  finishes. Reads: a ghost once in 30 days a place per run (one row), a link's answer once a minute
  a place (the challenge, the time by its handle, its player: about four rows). What one address can
  cost is still bounded by `CHALLENGE_MISSES`' 10 misses a minute, posts among them: a miss of
  either new route reads at most four rows, a post nine (45 for one of the few new bests the
  visitor's day allows), less than a board's ([what one address can cost](#what-challenges-cost)).
- **The Worker's CPU**: the check is written to be cheap on its first call, as on an isolate just
  started (the text decoded by `atob` and a plain loop, its numbers in one pass into one array, the
  speed rule in squared centimetres, a jump back looked for from the most recent sample back).
  Measured in Node on a loaded machine (4 cores, a load of 4 to 5 from other tests), a fresh process
  each time: a fair 5 minutes (24,027 characters) 3 to 9 ms the first call and 1.5 to 3 ms after
  (before: 9 to 42 and 3.4 to 5.7); a ghost made to be slow to check (400 s, 26 jumps each back to
  where it drove most of a minute before, on ground it hasn't driven since) 8 to 22 ms the first call
  and 2 to 4 ms after (before: 24 to 44 and 5 to 9); looking for a jump back as far as the start
  (since round two), a 409 s ghost with 31 jumps each back to its start, found only at the end of
  each look, 2 to 5 ms the first call and 1 to 2 after, within the same noise as one with none. A
  daily's minute is well under 1 ms warm. So a
  fair run's check fits the Free plan's 10 ms of CPU a request; the worst a crafted ghost can do on
  an isolate's first request is have its own post turned away (error 1102), nobody else's. The test
  checks a five-minute monthly's under 10 ms.
- **Workers Paid**: all of it within what's included, as the rest of the challenges are.

**How it's tested.** `npm run test:drive-worker`: the ghost's frame where 3d-tiles-renderer's object
frame puts a point, to the millimetre, on the Earth's ellipsoid and the Moon's sphere; packed and
unpacked as it was (angles the short way round), the interval doubling past 4,096 samples, and
everything that isn't a ghost refused (not base64url, too long, another version, cut short, a byte
too many; and, each in a ghost whole and well made but for it, so it's that check that turns it
away, a count past the most, a number written in five bytes, a place 60 km off, 20 km down);
`ghostFault`'s every fault (a ghost of another interval, a sample short or a time longer, its
first sample 150 m off, a gate passed nowhere near, a dash at twice the speed with fair passes, a
jump of 20 m, up and down 20 m a sample) and what it lets off (R's 4 m on, four in a run of 10 s, a
fifth refused; back onto the path; both together; a fall at the Earth's gravity to 60 m/s, one of
200 m stopped and put back up); a pass at its pass time give or take a sample (half a sample late
taken, a second early or late refused, though the path goes through the gate) and within its
radius and `PASS_SLACK` (3 m: half a metre inside taken, half a metre outside refused); a jump back
onto the path half a minute, 65 s and 90 s back taken; R in the air after a flight of 40 s to 200
s (a landmark's drive of 8 km) putting the car back where it took off taken, the same jump back to
60 m off the path refused; bytes for a minute, five and two
hours, and the time to check five minutes' (under 10 ms); by workerd's own D1 count (wrangler's
`getPlatformProxy`), what a time posted writes (a first 16 rows, a new best 14, one that isn't 2)
and how long the cache keeps each (a board's order 10 minutes, a live link's answer a minute, a
finished one's a day, a ghost 30 days); and against the Worker under wrangler: the migration on top
of 0001-0006 (the handle and its unique index, the ghosts' table with its `bytes` and `least_ms`,
its index by time, its foreign key cascading from the time, the challenges' ghost count, nothing of
an address), a time with its ghost and look (only the
Garage's parts kept), its ghost fetched by its run and then from the cache, a slower run changing
nothing, a new best under the best's own run id refused, a new best's ghost replacing it and the old
run's gone; every bad ghost refused with its fault and nothing written or counted (not one, too
big, missing, too fast, not through a gate, not as long as the time); the ghosts' budget (counted
as each is written and replaced; past it a new best taken without its ghost and the old one's room
given back; room again, the next kept; and over D1's SQL in Node with the budget room for three:
three slow runs filling it, a quicker best letting the slowest go and kept, one slower than every
kept one taken without its ghost and nothing let go for it, the count always the kept ghosts' bytes;
a made-up leader, a second a gate over the crow's way at top speed, kept and on top, and the board
handing out the next row's run alone, the quickest plausible one); the handle (the same as this process works out with the
secret, another with another secret or challenge, nothing of the player in it or in the link's
answer; the one kept handed out by the list, the board and a post, kept by a new best, and a link
by it still answering: as after the secret's changed), the link's answer from the cache after, a
new best clearing it, the list's and the board's own `run` and `handle`, a handle that names nobody
(or isn't one) none, one row's run (the quickest plausible: not Bea Fast's on top, a second a gate
over the crow's way) and its ghost by it, no other row's run; the link's answer saying nothing of
whether it's the owner's; the link's page at `/c` (its card's title and description with the time,
place and period, escaped, when it ends and not how long is left: a daily's, a weekly's and a
monthly's last day, "beat it" for a time whose ghost isn't kept, a place with
markup in it text in its tags, the link its address, the rest of the page as it is; no challenge,
one that isn't, a place's link: the page as it is), the home page with the same link the file as it
is (the Worker not run for it: `run_worker_first` is `/api/*`, `/c` and `/ads.txt`), and its answer from the
cache; the two routes held to `CHALLENGE_MISSES` from one /48 (ten answered, the rest 429, the
cache's still answered, another /48 too); a time posted one of them (past them a 429 before D1 is
touched, one asked a post); what a post reads by D1's own count on a challenge keeping 1,240
slower ghosts (a first 40 rows at most, a new best 60, one that isn't 30, one the gap turns away
12: no slower ghost looked at, the rank from the order kept with the new best put into it), one
letting the slowest go (by its key: its time's `ghost` 0, the count what's kept), a board's miss
with every row's ghost kept 41 rows at most and the list's 52, the list's race the quickest ghost
to race eleven rows down (the ten above not plausible); each time's `ghost` agreeing with the
ghosts kept after every post of the budget's test (the made-up leader's 1, kept but not raced);
`placeIn` (the new best in its place, the old out, 1,000 at most, one past them left out); a ghost
packed denser than 10 bytes a sample refused (`form`); and yesterday's challenge's link (over, their final
place, the ghosts gone and none counted, its page's card saying so). `npm run test:drive-ui`: a run
posted with its ghost (as the Worker checks it), and the booster fired under the finish card every
frame from the line (put out every frame, the car only slowing), each sample where the car's model
was at its time (between the frames either side of it, to 5 cm: a recorder taking each frame's own
place is metres off, 3.9 m in the test); racing your own best (from Retry:
at the start till GO beside you, see-through, nothing in it to hit, its name over it, its wheels
turning; splits ahead at each gate and on the card; it drives on to its finish and waits there;
its draws its own light model's and no more, by turns shown and hidden, fewer than your own
kart's triangles in a few dozen meshes (the kart, 17,224 triangles, keeps 15,574: its round parts'
normals and edges kept); the button hiding it, kept: another page, the next visit, racing it from the Worker's by
the list's run, hidden from the start); a run that doesn't count (no badge, nothing posted, no
ghost of it raced from Retry); a first run racing the ghost of the list's one row with a run (a
made-up leader above it without one), and the list's race (three made-up quick times on top
without one, row 7's raced); a friend's ghost answered only once the run's racing not built or
shown while it races, then raced from Retry; the pickup's ghost close up (89,552 triangles in 25
draws, its normals the file's, a picture: `challenges-ghost-pickup-close.png`), made light without
holding the page's thread more than 400 ms (a timer's beat and the long tasks while it's made:
180 ms at most here, 1,037 when it was made in one task); a friend's
ghost that can't be had said on the HUD; challenge a friend (the card's button through a
share sheet stubbed, with its words and the Worker's handle at `/c`; a sheet closed, nothing; copied
where there's none; a field to copy where neither; your own row of a board; the row with a run (not
the first, a made-up leader's without one) racing their ghost; after a run that isn't your best, the link by the list's handle, or the board's); a
friend's link on the test pad at `/c` (its card, the address back to `/` without the link, their
ghost fetched by its run and drawn where their run was, on the ground and in sight, the splits and
the card); one answered 6 s late, its card opening then; a handle naming nobody, a challenge that's
over, none at all; an Earth challenge's link asking for an Earth drive, and with them used up the
Moon opening with its card needing one; and a phone upright and on its side and a computer (the
card, the HUD with its split and button clear of the driving buttons, the finish card with its link,
all on the screen). `npm run test:drive-moon-ui`: a Moon challenge's link at `/c` with today's Earth
drives used up (the visit the Moon's, no Earth drive asked for, no used-up screen; their ghost raced
on the Moon, the split, the time posted with the Moon visit and a ghost the Worker would take).
`npm run test:drive-seo`: none of it in the first load. Pictures with `TEST_SCREENSHOTS`
(`challenges-ghost-*.png`, `challenges-share-*.png`, `challenges-link-*.png`,
`challenges-moon-4-link.png`, `challenges-moon-5-link-finish.png`).

### The Worker's routes

- `GET /api/challenges?id=<player>`: `{ now, challenges: [ { id, period, key, world, kind, place,
  region, route, startsAt, endsAt, total, top, me } ] }`, `top` the board's best three (`{ rank,
  name, ms, vehicle, date, level, title, supporter? }`) and `me`, with a player's id, their `{ ms,
  rank }` (and `owner: true` for the owner's) or null. The first ask in a period fixes its
  challenges. A rank is at most 1,001: past the board's first thousand (the page's "#1000+").
- `GET /api/challenges/board?challenge=<id>&id=<player>`: `{ challenge, total, rows, me }`, the top 20
  of any challenge, live or past (`challenge` with its `replacedAt` and `finalAt`); 404 for none.
- `POST /api/challenges/time { id, secret, visit, challenge, run, ms, passes, vehicle, look, ghost }`:
  `{ ms, rank, total, isNewBest, top, run, handle }`, `ms` the player's best, `top` the board's five
  (with `owner: true`, and the rank it would have, for the owner's), `run` and `handle` the best's
  run and what a link to it names it by ([ghosts](#ghosts-and-challenge-a-friend): the time is taken
  only with a ghost that agrees with it, 400 `{ reason: 'ghost', fault }` otherwise). The same run posted again within 5 minutes of its being
  taken (`REPOST`: the same `run` and `ms` as the best kept; its answer was lost and the page tried
  again) is answered as it was taken (`X-Time-Cache: hit`), from Cloudflare's cache, where the answer
  was put as the time was taken for those 5 minutes (in another of its places, the first one asked
  there is worked out and put there): nothing written, counted or read again of the board, however
  often and from wherever it's posted. Later than that it's a post like any other (the gap, the
  visitor's day) and not a new best, so the same run can't be had answered over and over for
  nothing. 400 `{ reason: 'run' }` for a run's id that's another player's on the board, or a new
  best under the best's own. 429 `{
  retryAfter }` for one inside a player's 10 s, `{ retryAfter, reason: 'daily' }` once the
  visitor's day is used up (till midnight UTC), and `{ retryAfter, reason: 'visit' }` once the
  visit's 100 are (till it runs out: "That's all the times one visit can post. Reload the page to
  post more.").
- `GET /api/admin/challenges` and `POST /api/admin/challenges { action: 'pick' | 'unpick' | 'approve'
  | 'unapprove', ... }`, ADMIN_EMAILS only (401 signed out, 403 anyone else, 429 past
  `ADMIN_LOOKS`' 30 a minute), as above; GET's `picks` are the owner's from the live periods on,
  however far ahead, each with its `startsAt`, soonest first.
- `GET /api/challenges/link` and `GET /api/challenges/ghost`, a link's answer and a run's ghost:
  [above](#ghosts-and-challenge-a-friend).

Every one is checked as the others are: same-origin and JSON for a change (index.js), sizes (a time's
body 69 KB at most with its ghost, an admin's 2 KB), types and values (400), and held to a rate: the lists, the
boards, the links, the ghosts and the times to **`CHALLENGE_LOOKS`** first, before anything's read (Cloudflare's rate
limiter, 60 a minute by address: no Durable Object request, and a page asks a few times a minute at
most); and those of the lists and boards that find something missing from Cloudflare's cache and
are to read D1 (a board's rows, the list's tops, a player's own rows, a board's order), and every
time posted that gets as far as reading D1, to
**`CHALLENGE_MISSES`** too, asked once a request just before that first read: **10 a minute** by
address, room for a page's list, all six boards, a time and the list again, while what the cache has is
answered past it all the same (429 `{ retryAfter: 60 }` past either). An address is **an IPv6 one
by its /48**, as the [drop-in places](#where-people-drop-in) count a visitor: a /48, which a free
tunnel broker hands out, holds 65,536 /64s, each of which would otherwise have limits of its own.
Neither is given an address as it is: each is counted by an HMAC of the day and the address under a
key derived from the Worker's secret (`lookKey`), so its key for an address changes each day and
says nothing of it, as DriveLimits counts by a hash with the day's salt (without asking DriveLimits
for the salt, which would be a Durable Object request a look). A time is then held to one each
10 s from a player, **100 from a visit** (`CHALLENGE_TIMES_PER_VISIT`, `visits.times`: each visit is
a robot check, so that's what one buys, whatever addresses its token is sent from) and **300 a day
from a visitor** (`CHALLENGE_TIMES_PER_VISITOR_DAILY`, counted in DriveLimits as the leaderboard's
scores are, a hash of the address with the day's salt, but an IPv6 one by its /48), the admin
page's to `ADMIN_LOOKS`. The 10 s and the visit's count are claimed first, together in one
transaction (a write of `last_time_at` only while the visit has times left, then its count only if
that write was made), and the visitor's day asked of DriveLimits after, so when DriveLimits says
the day's used up, the player's `last_time_at` is set so their 10 s runs out at midnight UTC (and
the visit given back the try it took): until then each of their tries stops at that first claim,
which writes nothing, and never asks DriveLimits again. (The leaderboard's scores do the same with
`last_score_at`, and still count a visitor by the /64.)

### How cheating is limited

The run is the page's, so the Worker can't see it driven; as for [scores](#how-cheating-is-limited),
it makes cheating cost something and keeps the boards believable (`postTime` in
worker/drive/challenges.js):

- **A visit token of the right kind.** A time is only taken with a token `/api/visit` handed out:
  for an Earth challenge, an Earth visit (`e`, one the Earth's caps let through) or the owner's
  (`o`); a Moon visit (`m`, which costs nothing but a robot check, and one turned away by the caps)
  posts the Moon's alone (403, reason `world`). A token forged, changed, run out (6 hours) or
  another player's is a 403 (`visit`): one visit posts for one player, as for scores. So every time
  comes from a visit that passed Turnstile, and an Earth one from one of the day's capped drives.
- **A player**, by the leaderboard's id and secret (403, `player`).
- **So many from a visit, a player and a visitor**: 100 times from a visit (each a robot check),
  one each 10 s from a player, 300 a day from a visitor (an IPv6 one by its /48) (429; above).
- **A live challenge only**: its row read from D1 (not the minute-old list) and taken only while
  it's in its period, not replaced and not yet finished, or in the minute after its end for a run
  that began before it (403, `challenge`).
- **A run the game could drive** (400 otherwise), checked against the route as it's kept
  (`checkPasses` in challenge-rules.js, which the page checks too before it posts): every point
  passed once, a sprint's gates and a landmark's goal in their order, collectibles in any; the
  times never going back, and the run's time the last pass's; no longer than the visit has lasted
  (with 30 s to spare for clocks) nor two hours; and **each leg no quicker than the fastest the game
  goes** allows: from within the last point's radius (the first leg from within 100 m of the start,
  `START_SLACK`, where the drop-in may have found the street) to within the next's, as the crow flies
  along the ground, at **430 km/h**, less 100 ms a leg (a frame at its longest, `LEG_SLACK`: a pass
  is seen at the end of the frame it happened in).
- **430 km/h, worked out from the game.** The fastest any ride goes is its top speed boosted: the
  booster pushes up to twice a ride's top speed (`BOOST_SPEED` in src/drive.js), and the fastest
  ride's is the hypercar's 215 km/h (src/drive-app/cars.js). Nothing else goes faster along the
  ground: a drift's mini-turbo is at most 1.5 times the top speed and a landed trick's burst 1.25
  (`DRIFT_BOOSTS`, `TRICK_BOOST`), a boost pad only fills the booster, flying goes at the ride's own
  speed, a hit keeps 85 % of the speed along the wall, R stops the car 4 m on, and going downhill or
  falling adds nothing along the ground (drive.js keeps the upward speed apart). So `FASTEST` is
  215 × 2 / 3.6 = 119.4 m/s (`TOP_SPEED`, `BOOSTED` in challenge-rules.js), and
  test-drive-worker.mjs reads `BOOST_SPEED`, the drift and trick boosts, Shift's own boost (a third
  more) and every top speed written where rides are tuned (drive.js's tuning by name, the kart's,
  the cars', every file in `rides/`, whatever is added there) from the game's own files, and finds
  each ride the game offers (the kart, `DRIVE_CARS`, `PASS_RIDES` and the library's, as the Worker
  takes them) its top speed as the game tunes it, failing if any is missing or faster.
- **Only bests are kept**, one per player per challenge: a slower time changes nothing (and the page
  doesn't post one: it shows the board instead).
- **A run's id is one time's**: another player's post with a run id that's on the board already is
  turned away (400, `run`), so a link to a run can't be made to show someone else's; and a new best
  is a new run (its ghost is kept by its id).
- **The run itself agreeing with its time**: its [ghost](#ghosts-and-challenge-a-friend), posted
  with it, through each point at its pass time, as long as the time, from the start, and never
  faster between two of its samples, across the ground or up and down, than the fastest the game
  goes (R's few metres and its putting the car back where it drove in the minute before let off, a
  few a run).
- **The same run posted again** is answered as taken only within 5 minutes, from the cache; after
  that it's a post like any other, so it can't be used to have a board read over and over without
  the 10 s gap or the visitor's day.

**What this can't stop.** Someone who reads the code can post a made-up run that fits the rules: a
straight line between the gates at 430 km/h is three or four times what a good driver manages on a
city's streets, so the rules let through far faster times than anyone drives (and its ghost, made
up to fit as well, is a whole path now, one anyone racing it sees: [ghosts](#ghosts-and-challenge-a-friend)),
and someone with a real run's ghost (the leader's, or a link's) can post it again a little quicker
(the same section: what it can't stop, and SQL that finds such copies). The checks keep the
impossible out; what's merely unlikely is the owner's to look at. A day's run at the top of a board
by a wide margin, with legs all at about the same speed, is the sign: the SQL below works out each
leg's speed from the route and the passes kept.

### Looking after them

In the Cloudflare dashboard → Storage & Databases → D1 → **world-drive** → **Console**, as for
[the leaderboard](#looking-after-it). Times are milliseconds; live boards are cached for a minute, a
finished one's for a day (**Purge Everything**, under Caching → Configuration, shows a change to
an old board at once).

```sql
-- What's live, and what's been: each challenge, its board's size and whether it's over.
SELECT id, period, world, kind, place, source, drivers, datetime( ends_at / 1000, 'unixepoch' ) AS ends, replaced_at IS NOT NULL AS replaced, final_at IS NOT NULL AS over
FROM challenges ORDER BY id DESC LIMIT 20;

-- A board: its fastest, with who and their run's passes.
SELECT p.name, t.player_id, t.ms, t.vehicle, t.passes, t.owner, t.final_rank, datetime( t.created_at / 1000, 'unixepoch' ) AS at
FROM challenge_times t JOIN players p ON p.id = t.player_id WHERE t.challenge_id = 42 ORDER BY t.owner, t.ms LIMIT 30;

-- The fastest runs of the last week, with their passes and their route, to work out their legs'
-- speeds: a good driver on city streets is well under 150 km/h; 430 is the most the rules let through.
SELECT c.id, c.place, c.kind, p.name, t.ms, t.passes, c.route
FROM challenge_times t JOIN challenges c ON c.id = t.challenge_id JOIN players p ON p.id = t.player_id
WHERE t.created_at > ( strftime( '%s', 'now' ) - 7 * 86400 ) * 1000 ORDER BY t.ms LIMIT 50;

-- One player's times everywhere.
SELECT c.period, c.world, c.place, t.ms, t.final_rank, t.visit, datetime( t.created_at / 1000, 'unixepoch' ) AS at
FROM challenge_times t JOIN challenges c ON c.id = t.challenge_id WHERE t.player_id = 'PLAYER_ID' ORDER BY t.created_at DESC;

-- Take a cheat's time off a board, and count its drivers again (its final places, if it's over, are
-- left as they are: a gap where the cheat was).
DELETE FROM challenge_times WHERE challenge_id = 42 AND player_id = 'PLAYER_ID';
UPDATE challenges SET drivers = ( SELECT COUNT(*) FROM challenge_times WHERE challenge_id = 42 AND owner = 0 ) WHERE id = 42;

-- Or remove the player and everything of theirs, their times included (players' ON DELETE CASCADE).
DELETE FROM players WHERE id = 'PLAYER_ID';

-- Then count the live challenges' ghosts again (their times' ghosts went with them, uncounted), so
-- their room is back for the next bests' ghosts. (After deleting ghosts by hand, without their times,
-- also set those times' ghost to 0, so no board hands out a run whose ghost is gone:
-- UPDATE challenge_times SET ghost = 0 WHERE ghost > 0 AND NOT EXISTS ( SELECT 1 FROM challenge_ghosts g
-- WHERE g.challenge_id = challenge_times.challenge_id AND g.player_id = challenge_times.player_id );)
UPDATE challenges SET ghost_bytes = ( SELECT COALESCE( SUM( length( ghost ) ), 0 ) FROM challenge_ghosts g WHERE g.challenge_id = challenges.id ) WHERE final_at IS NULL;

-- How full each live challenge's ghosts are, of the 16,777,216 characters each may keep.
SELECT id, period, world, place, ghost_bytes, ( SELECT COUNT(*) FROM challenge_ghosts g WHERE g.challenge_id = challenges.id ) AS ghosts FROM challenges WHERE final_at IS NULL;
```

A route's length as the crow flies is what the challenges' list says of it ("6 gates · 1.5 km"); a
run's average speed is that over its time, and each leg's its distance (the points are in `route`)
over the time between its passes. Removing a player, or the owner's choices and approvals, needs nothing
else: the live boards catch up within a minute (ranks further down within 10), a finished one's
within a day, or at once after a purge of the cache.

### What challenges cost

- **The page.** Nothing new in its first load but the two buttons, the hooks main.js calls and the
  word while driving: the game's chunk 1,117.93 to 1,120.47 kB minified (343.62 to 344.64 kB
  gzipped: +1.02 kB), the first stylesheet 27.68 to 28.25 kB (6.33 to 6.41 kB gzipped), the page's
  first script unchanged but for an export the chunks share (12.77 to 12.84 kB). The challenges' own
  chunk, 23.4 kB (9.4 kB gzipped) and its stylesheet 9.2 kB (2.4 kB), come only when **Challenges**
  is first pressed (the build's test checks none of them is in the page or the game's chunk).
- **Drawing.** Two draws for a route of any length: the beams in one instanced mesh (both sides in
  one pass) and the rings or stars in another; 456 triangles a gate (a ring of 432 and a beam of
  24), so a monthly's 14 gates are 6,384 triangles. Measured on the test pad in Chromium's software
  renderer (SwiftShader, no GPU, on a machine shared with other test runs), at 1280 × 800 and 390 ×
  844, the gates shown and hidden by turns: drawing 0.4 to 0.9 ms a frame either way, the two within
  0.1 ms of each other (the noise), and the run's own work each frame (its passes, its HUD, the stars
  turning) 0.01 ms. The HUD writes into the page only what has changed (the arrow to the degree, the
  distance to the metre), and nothing but the time once a run's done; turning stars re-place only
  the stars.
- **The gates' rays down, on the Earth.** Nine a gate, only for those within 800 m of the car, a
  gate at a time and no more in a frame once they've taken 4 ms, none as the car arrives (above).
  On the test pad with the first ray into each 25 m square made 20 ms slower (as a tile's first ray
  is, building the hierarchy of one of Google's bigger tiles, or a smaller one's on a phone), a
  monthly hunt's 15 stars up to 700 m round its start took 135 rays, 48 of them slow, over 61
  frames: never two slow ones in a frame, and no ray in a frame once those before it there had taken
  4 ms (at most 23 to 26 ms of rays in one: a slow ray's 20 and the few before it), and all 15 on
  the ground 4 to 6 s after the drop-in ended, in SwiftShader's few frames a second (a phone's 30
  to 60 would take a second or two); a 16th star 1,300 m off isn't looked at while the car waits at
  the start, and is once it's within 800 m. (The test checks what the budget bounds, not the
  milliseconds, which a loaded machine stretches.) Cast as they were before (all of them as the car
  arrived, then one gate every 0.2 s wherever it was), those 48 slow rays would have been one frame
  of about a second as the run began, and a gate kilometres off looked at again every few seconds,
  its tiles' hierarchies built for rays the car's never needed. After the first look, one gate's
  nine rays every 0.2 s: on tiles already hit, a few thousandths of a millisecond each.
- **The Worker and D1.** Each Worker instance keeps the six live challenges for a minute, and
  Cloudflare's cache keeps the list's tops, the live boards and each player's own rows for a
  minute, a finished board for a day and each board's order for 10 minutes, so a list view reads at
  most: the six challenges (once a minute an instance), each board's top three, its one to race
  and its count (50 rows) when the cache has none, and a player's own rows on the six (six reads by
  their key: 12 rows by D1's count). A board view reads its top 20 and their players (41 rows) and the player's
  own row (2). **A rank** is found in its board's order, read whole (as many rows as the board has,
  1,000 at most, from its index alone) at most once in 10 minutes in a location, whoever asks (a new
  best there is put into the order kept, not read afresh). The test measures it in workerd's own D1 (`meta.rows_read`) on six boards
  of 1,240: the list for a player at the bottom of all six read 12 rows, a board's own row 2, and
  the first look, reading the six orders, 6,060 (counting the rows ahead, as at first, a list read
  6,012 every time, so a script asking as each of its own players in turn read that on every ask).
  The first ask in a period writes its new challenges (one to six rows) and reads the owner's
  picks, the approved places and the periods before's six; finishing a challenge writes its board's
  final places once. A time: the challenge's row, the player, the visit's binding (a write the first
  time), the best, `last_time_at` and the visit's count (writes), the best again (a write only when
  it's better), the top five, its rank in the board's order kept (a new best put into it), and one
  DriveLimits request; the same run posted again within 5 minutes reads those first four and the
  answer kept in Cloudflare's cache, nothing of the board. At today's 300 visits a day, with every
  one opening the list a few times and a fifth posting a few times each, on boards of tens, that's a
  few thousand rows read and a few hundred written a day: a tenth of a percent of the Free plan's 5
  million reads and 100,000 writes, and a few hundred of its 100,000 Durable Object requests (which
  the visits and driving with others share). The once-a-visit word while driving asks for the list
  once (cached as any list is).
- **What one address can cost, whatever it asks.** Everything that reads D1, the looks and the
  times posted alike, is one of 10 a minute from an address (`CHALLENGE_MISSES`; an IPv6 address by
  its /48), and what the looks can make it read is bounded by the cache besides, whoever asks: each
  live board's rows once a minute in a location, the list's tops once, a finished board once a day,
  a board's order once in 10 minutes. So asking for boards, past boards, lists for players or
  players that aren't, or posting times, in turn, costs an address at most about 6 × 41 rows for
  the live boards, 50 for the list and 3 × 12 for players or posts a minute (a post the gap turns
  away reads 9), 332 rows, about 478,000 a day; the 300 new bests a /48's visitor may post a day
  read 45 each instead (about 10,000 more), or 190 while a challenge's ghosts are full and each lets
  one go (about 53,000 more): about a tenth of the Free plan's 5 million at the very most. (Before,
  posts weren't counted in `CHALLENGE_MISSES` at all, and each new best read its board's order
  afresh: resending a good body at `CHALLENGE_LOOKS`' 60 a minute read 777,600 rows a day, each of
  the 300 new bests about 1,040 more, and each read every slower ghost kept on its challenge twice,
  well over 1.5 million a day from one /48. Before that, past boards asked for in turn read 41 rows
  each, and lists as a script's own players 6,000 each, at `CHALLENGE_LOOKS`' 60 a minute from every
  /64 of a /48: hundreds of millions a day.) A board's order, read whole, is a cost of the board's
  size, not of who asks: on six boards of 1,000 (thousands of players a day) a location reads at
  most 6,000 rows each 10 minutes, 864,000 a day; at boards of 100, 86,000. Times written: by D1's
  own count (every row and index entry), a new best with its ghost writes 14 rows (a player's first
  on a challenge 16, with the visit's binding; one that lets a slower ghost go 16), one that isn't 2
  (`last_time_at`, the visit's count), and asks DriveLimits once; any post can be a new best by
  shaving a millisecond, so a script's are 14 each. A visit posts 100 at most (one robot check buys
  about 1,400 rows written) and a visitor 300 a day (about 4,200 rows written, 4,800 if each is a new
  player's first, and 300 DriveLimits requests from a /48 a day); past that each of its players
  costs one more try (a write and a DriveLimits request, which holds that player till midnight) and
  then nothing. It would take about 21 to 24 /48s, each with its three robot checks a day, to write
  the Free plan's 100,000 rows, and over 300 to use its 100,000 Durable Object requests (and so
  `/api/visit` for everyone). The ghosts those posts store are bounded apart from that: 16 MB a
  challenge at most ([ghosts](#ghosts-and-challenge-a-friend)), 96 MB for the six live, of D1's 500
  MB, whoever posts them. Before, with the visitor counted by its /64 and no count a visit, one
  player with one robot check could post every 10 s from a new /64 all day: 46,000 rows written
  and 8,640 DriveLimits requests.
  **What's left**: those bounds are an address's, so a script with many addresses (many /48s, or a
  pool of IPv4 addresses) gets them many times over, and each of its times still needs a robot
  check per 100. If it happens, lower `CHALLENGE_MISSES` or `CHALLENGE_LOOKS` in
  wrangler.drive.jsonc and set `CHALLENGE_TIMES_PER_VISIT` lower, and remove the script's players
  (the SQL above: their times go with them).
- **Workers Paid**: all of it is well within what the plan includes (50 million D1 rows written and
  25 billion read a month, a million Durable Object requests).

### How challenges are tested

- `npm run test:drive-worker`: the fastest the game goes from its own files (`BOOST_SPEED`, the drift
  and trick boosts, Shift's boost, every top speed written where rides are tuned and each offered
  ride's own: it fails if one changes, or a ride's can't be found); periods turning over at
  midnight UTC, on Monday and at a month's end (a leap year's February and a year's end too), and
  their keys; routes laid out as their shapes say (the gates' spacing and first heading, the stars
  in their disc and apart, a landmark's distance), the same from the same numbers; a time checked
  (as fast as the game goes and a frame quicker taken, quicker refused; out of order, a gate missed
  or twice, times going back, a time not the last pass's, fractions, too long; collectibles any
  order); the rotation over 60 days on each world (no place twice in a row, never a day's its
  week's or month's, every kind, another key another order, an approved place joining it) and its
  rules over three years of days, ten of weeks and thirty of months with four keys (never twice in a
  row; a day never its week's or month's, a week never either month it's in); and against what's
  fixed, a year of days fixed as the Worker fixes them with the owner's picks of weeks and months
  and places approved and unapproved on the way (fails if the rotation works its rules out alone); a
  time written only while its challenge is open, checked in the write (`postTime` on D1's shape over
  node:sqlite, the challenge finished between its check and its write: turned away, nothing kept); a
  rank found in the board's order (read from the board's index alone, by SQLite's plan, 1,000 rows
  at most, and no count of the rows ahead anywhere: the last of 1,201 "1000+", one further up
  exact), and by halving (ties, the player's own old time left out, the owner's); **what a look
  reads**, by workerd's own D1 count (`meta.rows_read`, wrangler's `getPlatformProxy`): six boards of
  1,240, a list for each of 40 players at the bottom of all six in turn 24 rows at most (12), a
  board's own row 6 at most (2), a finished board's its final place with no order read, kept a day
  and a live one a minute (fails if a rank is counted, or the order isn't kept); a visit's times
  (3 there) from four addresses, the fourth turned away (429, `visit`) writing nothing, a new visit
  posting again, the visitor's day asked by the /48 and a try it turns away given back to the visit;
  a run's id another player's turned away (a new row or a new best), nothing of it written;
  `CHALLENGE_LOOKS`' and `CHALLENGE_MISSES`' key a keyed hash of the address and the day (the same
  all day, not the next, an IPv6 address by its /48: every /64 of it the same, another /48
  another); the Moon's routes off steep ground, at their points and along their legs (every Moon
  place's sprints and landmarks: none with more than 6 steep stretches on a leg, few with any, far
  fewer than with the points alone checked), and every place's landmarks as the Worker lays them
  out over 20 days, 8 weeks and 4 months, none crossing more than a way in from any other bearing
  at its distance would (fails with the 8 bearings tried at first); and against the Worker
  under wrangler: the migration's tables (and nothing of an address in them, a run's id unique on
  its challenge); six fixed in D1 at the first ask, the same on every ask and as
  this process works them out with the same secret (place, kind, route, the Moon's checked on its
  heights), a live one staying as fixed; times taken (only bests, the board in order with names and
  levels, the list's tops and your own, a Moon challenge with an Earth visit) and every way of
  cheating turned away (too fast, out of order, a gate missed, a time not the last pass's, longer
  than the visit, bad bodies: 400; no visit, forged, another kind, someone else's, run out, the
  wrong secret, an Earth challenge with a Moon visit, from another site: 403; another period's or
  none: 403; a player's 10 s and a visitor's day: 429, with nothing kept, and past the day the
  player held till midnight, the next tries writing nothing); the same run posted again answered as
  taken from the cache, from any address, writing nothing, a burst of it from one address a 429,
  another inside the 10 s still a 429, and the same run after 5 minutes a post like any other (the
  gap claimed, not a new best); the owner's runs off the board and its count; the cache (a new best
  clearing it) and `CHALLENGE_LOOKS`; yesterday's board kept with each player's final place (the
  owner's none, written in the background), a run finished just before midnight taken in the minute
  after and none later; the same at a week's turn (Sunday 23:59:50 to Monday 00:00:20, a new week
  fixed, the month the same one, the old week finished and the month not) and a month's (30
  November to 1 December, a new month, the week the same one, the three live on the Moon three
  places); `CHALLENGE_MISSES` (from a /48's /64s in turn, boards that aren't and lists for players
  that aren't, a miss each: ten answered, the rest 429; the cache's list still answered, another
  /48 too); a visitor's day by the /48 (four times from four /64s, the fifth from another turned
  away, the player held till midnight); the rotation clear of what's fixed through the routes (a
  place approved and the owner's picks for a Tuesday and its week: the Wednesday and Thursday
  neither the day before's nor the week's; fails if the rotation works its rules out alone); a
  Monday's week and day fixed by one ask, the owner's pick for the week the place the day would
  get were it fixed first: the day another place, as the admin page's next up said on the Sunday
  (fails if the day is fixed first, or next up ignores the pick); and the admin routes
  (ADMIN_EMAILS only;
  picks ahead and back to the rotation, bad ones refused, a pick fixing its day when it comes; the
  owner's picks listed however far ahead, soonest first; a live one changed only after the warning,
  then a new board, the old one kept, finished and closed; back to the rotation on the rotation's
  own, after a place is approved too, or a pick of what it already is, changing nothing; busy places
  approved and unapproved, a hundred at most). The leaderboard's scores past a visitor's day hold
  the player till midnight the same way.
- `npm run test:drive-ui` (the Worker's answers made in the test): the list (loaded only when it's
  opened, its chunk and routes looked for by what's served, not the checkout's path; this world's
  first, the time left ticking, the top three and your best, a board; a board slow to answer, left
  for another's, not shown under the other's title); an Earth challenge on the test pad (its start,
  the countdown holding the car with the gas held, the keys card over the visit's first countdown
  ("Get ready") and put away at GO, the gates found on the pad's ground, two draws for them
  (counted as three.js draws them), the HUD's count and arrow, the gates driven through by steering
  the car at them, the finish card and what was posted, its legs possible, the car brought to a
  stop under the card and held there with the gas and the booster held down, in the game's own
  time); a hunt for stars, **Retry** at the start, a pause
  ending the run with **Retry** in the pause menu (room under it), **Keep driving** ending it for
  good, the globe and another ride leaving it; no name yet (asked on the finish card, then posted)
  on a landmark's drive (its start a pin "On the way to" it on the top bar, nothing of it added to
  the recent places),
  and **Retry** once it's ended (the list, saying why); a time that can't be posted for want of a
  connection (kept, said so, posted when the browser's back online, once, with the ride it was
  driven in though another's been picked since); **Retry** while a post that didn't get through
  waits to be tried again (the same run's time and passes go up, the new run its own); Esc on the
  finish card (the pause menu, the card and the run put away); a gate by a 120 m tower on the pad
  (drawn on the street beside it, its top the roof, passed driving by on the street); a monthly's 15
  stars with each first ray into a 25 m square 20 ms slow (never two slow rays in a frame, no ray
  in a frame once those before it there had taken 4 ms, none as the car arrives, every star on the
  ground soon after, and a 16th 1,300 m off not looked at till the car's within 800 m of it); a
  period ending with the list open while
  the Worker fails (three asks in 16 s, not one a second; the ended card over, its Start off); the
  word while driving (today's place, its button opening the list, both counted, nothing of the chunk
  loaded before); a phone upright and on its side (the first card and its Start on the screen as
  the list opens, unscrolled; the HUD clear of the speed, the buttons and the level bar; the card on
  the screen); and the admin page's part (choosing one by a featured place, by a day typed in with
  today's still picked in the list (that day's saved, and said), and by coordinates a month ahead;
  your picks ahead listed, each's Change setting the form to it, one back to the rotation from there;
  a live one warned about before anything's sent, kept, then changed, one with nobody on it warned
  about too; back to the rotation sent as it is and the Worker's warning shown; a busy place
  approved).
- `npm run test:drive-moon-ui`: with today's Earth drives used up, from **Drive on the Moon**: the
  Moon's first, the Earth's needing an Earth drive (the used-up screen again), a Moon challenge's
  gate on the Moon's own heights (where a ray down meets the ground built there, within a metre),
  driven through and posted with the Moon visit.
- `npm run test:drive-seo`: in the build, the challenges a chunk of their own, script and styles,
  none of them in the page or the game's chunk.

Pictures of each are saved with `TEST_SCREENSHOTS` (`challenges-*.png`).

### The owner's steps

Deploy (`npm run deploy:drive` applies `0006_challenges.sql` and `0007_challenge_ghosts.sql`
first; the `CHALLENGE_LOOKS` and `CHALLENGE_MISSES` rate limiters, and the Worker running for a
link's own path, `/c`, come with `wrangler.drive.jsonc`). Nothing else to set: the first ask fixes
the day's six, from the rotation. To choose one, the admin page. A link's preview card can be
checked after a deploy with a chat app's link inspector (or `curl -s
'https://worlddrive.app/c?challenge=<id>' | grep og:`).
`CHALLENGE_TIMES_PER_VISITOR_DAILY` and `CHALLENGE_TIMES_PER_VISIT` can be added in the dashboard
to change a visitor's times a day (300) and a visit's (100), and `CHALLENGE_GHOST_BUDGET` a
challenge's ghosts (16,777,216 characters).

## Achievements and rewards

Badges for what a player has done, and eight construction rides to drive for some of them: a
reason to come back after the first minute (a skid steer after 10 km, a telehandler for three days
in a row, a concrete mixer for a first challenge), and something to show for a challenge placed in
(the vac truck for a weekly podium). The list and its rules are `src/drive-app/achievement-rules.js`,
which the page and the Worker both import (as `challenge-rules.js` and `levels.js` are), so the page
shows what the Worker counts. The Worker keeps what's earned (`worker/drive/achievements.js`,
migration `0009_achievements.sql`), and checks a construction ride wherever it shows to others.

### What players see

- **The grid.** **🏅 Achievements** on the profile card (the globe's panel, under the level, with
  "3 / 25"), and **Achievements** in a locked construction ride's note, open it: a dialog of badges,
  three across on a computer, one on a phone held upright, each with its name, its one line ("Drive
  100 km"), a bar and how far toward it ("10.5 / 100 km", "1 / 10 drives", "0 / 1 finished"; for a
  place on a board, "On a weekly board"), and once earned "Earned 17 Nov 2026" in gold. One that
  unlocks a construction ride shows it, with its picture: "Unlocks the vac truck", or once earned
  **Drive the skid steer**, which opens the Garage on it. Its own chunk (`achievements.js` and
  `achievements.css`, 3.6 kB and 2.8 kB), loaded the first time it's opened: nothing of it is in the
  first load. Its one line of lead: "Badges for what you've done; some unlock construction rides."
  What it shows is the Worker's (below) plus what this browser has driven since its last report:
  that is added to the player's own count (their reports add to nothing else), no more of it than
  the Worker will still take today (its answer's `left`), and the account's best is shown where
  it's more (its answer's `counts` against `own`), so a count never runs ahead and falls back, on a
  linked account too; before a nickname, this browser's own counts, nothing earned, and "Pick a
  nickname to earn them: what you've driven counts when you do."
- **Toasts.** As one is earned, "Achievement: 100 km driven"; for one that unlocks a ride, then
  "Unlocked: Skid steer" with **Garage** (pausing the drive, the Garage on that ride, as a level-up's
  ride does). One after another, about four seconds each (one with a button its whole seven, for
  the tap), never over a challenge's countdown or run (they wait for its end), and never over another
  toast that's up, such as the day's challenge nudge (they wait for it to go, as the nudge waits for
  others): `showNotices` in `main.js`. A report goes out as the drive pauses, so they often come with
  the pause menu open: paused, a toast sits at the foot of the screen, clear of the menu's **Keep
  driving** (`levels.css`), so a tap meant for it never lands on one. Earned on another device, or
  before this browser knew the player, they're not told again here; those earned meanwhile (a
  challenge's places, written as its board ended) are told at the next visit. Before a nickname,
  what this browser's counts reach of what the nickname's claim will keep (`CLAIM_TALLY`, below: the
  first drive, 10 km, a first Moon drive, a first look, three rides; never 100 km, ten Moon drives or
  days in a row, which take driving after the nickname) is told once ("Achievement: First drive ·
  pick a nickname to keep it", with **Pick one**), and isn't told again when the claim earns it; the
  rest are told when the Worker earns them, so nothing is promised that the nickname won't keep.
- **Locked rides.** In the ride pickers each wears its achievement's chip ("🔒 10 km", "🔒 Weekly
  top 3") where a level's car wears "Lv 8 · or Pass"; picked, it says "Finish a weekly challenge in
  its top 3 to unlock the vac truck. See your Achievements." under the rides, and the ride doesn't
  change. The Garage's tab has the chip, its banner "🔒 Finish a weekly challenge in its top 3 to
  unlock" (no word on the pass, which doesn't give them), and a look picked on it says the same. A
  ride saved before is the default ride until it's unlocked, as a level's car is. They come after
  the cars and before the pass's rides in the pickers, so a new player's rows start with what they
  can drive or earn by a level, and their pictures load only as their cards are scrolled near (a
  browser's own lazy loading takes in a whole sideways row): none of them in the first load.
- **Remembered here.** The achievements the Worker has said a player has are kept in this browser
  (`progress.js`'s `heard.list`, only ever the Worker's word), so an earned ride is unlocked as the
  page starts, before the Worker answers or if it can't, as a level's car is by the level kept here;
  the Worker checks it wherever it shows to others all the same. Those told before the nickname are
  kept apart (`heard.told`), only so they aren't told twice, never as earned: the Worker's whole list
  settles them. Another player in the browser (a name removed, or
  another picked) starts with none of them, until the Worker says. A ride unlocked during a party
  shows to the others at once: the page says hello to its room again (as for a new title).
- **A refused run.** A score or a challenge time posted in a construction ride the Worker doesn't
  have as unlocked (a 403 with `reason: 'ride'`) says so with what unlocks it ("Drive 10 km to
  unlock: scores in it go on the board once it is."); the visit goes on posting the rest.

### The list

25 achievements, in the grid's order. **Checked**: the Worker counts it from its own records.
**Trusted**: only the page can say it (as it says what it drove for XP), so the Worker takes it within
its caps.

| Achievement | Goal | Counted from | | Unlocks |
| --- | --- | --- | --- | --- |
| First drive | Drive your first 250 m | km in progress reports | trusted | |
| 10 km driven | Drive 10 km | km in progress reports | trusted | **Skid steer** |
| 100 km driven | Drive 100 km | km in progress reports | trusted | **Wheel loader** |
| 1,000 km driven | Drive 1,000 km | km in progress reports | trusted | |
| One small step, Moon regular, Lunar legend | Drive on the Moon (1, 10, 50 times) | Moon drives (a drop-in there and 250 m driven) in reports | trusted | |
| First challenge, 10 challenges, 50 challenges | Finish a challenge (1, 10, 50) | `challenge_times`: a time on the board | checked | **Concrete mixer** (1), **Dump truck** (10) |
| Top 10, Podium, Winner | Finish a challenge in its top 10, top 3, first | `final_rank` on a finished board, any period | checked | **Bulldozer** (top 10) |
| Daily winner | First on a daily | `final_rank` on a finished daily | checked | |
| Weekly podium | Top 3 on a weekly | `final_rank` on a finished weekly | checked | **Vac truck** |
| Monthly top 10 | Top 10 on a monthly | `final_rank` on a finished monthly | checked | |
| Party time, Party regular | Drive in a party with someone else (1, 10 parties) | the party's room (`live.js`): another player there, or a guest from another address | checked | **Road roller** (1) |
| New look, Stylist | Change a look in the Garage (1, 25) | Garage choices that change the look (not one picked again), in reports | trusted | |
| Test driver, Collector | Drive 3, 8 different rides (250 m in each) | ride ids, in reports | trusted | |
| 3 days in a row, A week in a row, 30 days in a row | Drive on 3, 7, 30 UTC days in a row | the days the Worker gave the daily bonus, by its own clock (never the streak a new nickname's claim brings) | checked (the days); the 250 m driven each day is the page's word | **Telehandler** (3) |

The rides were mapped so that the first comes in a first or second session (10 km is about ten
minutes), the next for coming back (three days running, a first challenge, a party), and the last
for the challenges' boards. **The Supporter Pass gives none of them**: as with levels' titles, badges
and level-only colours, which the pass doesn't give either, they come only by earning them, so
supporters and everyone else earn them alike (`rideUnlock` in `vehicles.js` says `pass: false`).

### Where each count comes from, and how it's bounded

- **Trusted counts ride on the progress reports** (`POST /api/progress`, [levels](#reports-and-how-cheating-is-limited)):
  the report's own km (already capped by the time since the last report, 450 km/h of it), and a new
  `feats: { moon, looks, rides }` (Moon drives, Garage changes, the ids of rides tried, each since
  the last report; `checkTallies`: whole numbers, ride ids the game offers, a 400 otherwise; a Garage
  change is counted only when it changes the look, `garage.js`). The Worker adds them to the player's
  `players.tallies` (JSON: `{ km, moon, looks, rides: [ ids ], streak, run, runDay, day, today }`),
  each held to a day's worth (`TALLY_DAY`): 500 km, 10 Moon drives, 10 Garage changes and 4 new
  rides a UTC day, whatever the reports say. So 1,000 km takes at least two days of a script (and
  more than two hours of reports at the time cap), 25 looks three days, 50 Moon drives five. The
  claim (a new nickname's first report, carrying what was driven before it) counts for XP as before
  (an hour's km at most), but toward the achievements only `CLAIM_TALLY`'s 25 km, 2 Moon drives, 5
  looks and 3 rides: a first hour's 10 km and its skid steer, never the 100 km's wheel loader, which
  takes driving after the nickname. Reading and writing them costs nothing more: they're in the
  player's row, read and written by the report's own statements.
- **Days in a row** are the days the Worker itself gave the daily bonus (once a UTC day, by its own
  clock): one more in a row after a bonus yesterday, else the first (`run` and `runDay` in the
  tallies); the best is kept (`streak`), so an achievement stays when the run breaks. The streak a
  new nickname's claim brings from before it (`days.streak`, the page's word) counts for the daily
  bonus's XP as before, never for these: a claim saying 10,000 days earns no streak achievement and
  no telehandler. A player's streak from before achievements (their tallies never written) counts at
  their next report, but only as far as the Worker could have seen it (`fromBefore` in
  `progress.js`): no more days than from the player's first (`created_at`) to the streak's last, since
  the streak in their row may be a claim's (taken for XP, up to 10,000 days, before achievements as
  now). A player made two days ago has three days in a row at most, with today's; a streak whose last
  day is past keeps only that capped best, with no run to add to.
- **Challenges finished** are counted where a player's first time on a challenge is written
  (`postTime`, `finishedQuery`): whether their 1st, 10th or 50th time exists, found by the player's key,
  never counting the rows. Times from before achievements are written the first time the player's grid
  asks (`POST /api/achievements`).
- **Placings** are written where a challenge's final places are (`finishQueries`, as its period ends
  or the owner replaces it): `placingQuery` turns each final_rank (1 the fastest; the owner's runs,
  kept off the boards, have none) into the placings it reaches, on any board or on that period's. The
  page has no way to name a place: nothing it sends is read for them. Boards finished before
  achievements have no placings (their final ranks are there; the console below writes every
  placing from them, the weekly podium's vac truck among them).
- **Parties** are counted by the party's room, for each player there (not guests) who has someone
  else with them: another player, not of their own account, or a guest connecting from an address
  none of the player's own connections there comes from (`partied` and `companion` in `live.js`;
  `/api/live` hands the room the challenges' keyed hash of the address's /48 and the day, never the
  address, and nothing of it is kept). So one person in two tabs, with a nickname or without, is no
  one else. Each party is counted once (`creditParty`, after the answer), both for whoever made it
  and whoever joined, and not again as a page reconnects or the player goes back to it: the row
  keeps the last 10 parties counted (`players.party_marks`), each as a short HMAC of the player's id
  with the party's code under a key derived from the Worker's secret (the challenges' `seed`,
  `keyedHex`), never the code. Keyed, because party codes are few enough (32^7) that anyone with a
  copy of the table could otherwise hash every code for each player and find who drove together;
  without the secret they can't. An area's room counts nothing.
- **Earned** as each count passes its target (`crossed`): written in the report's own batch, only
  if the report's update was the one taken (the player's time is the report's), one row an
  achievement a player (`achievements`, `ON CONFLICT DO NOTHING`).

### Following the player

As levels show an account's best player, achievements are the account's: a player linked to an
account (Google or a username and password, `accounts.js`, `logins.js`) has every achievement any of
the account's players has earned, and the grid's counts are the most any of them has of each. So
signing in on a second device and picking a nickname there brings the first device's achievements
and rides, and what's earned on the second shows on the first, both ways. Each row stays the player's
own (the owner's counts are players'), and each player's caps are its own. Before a nickname, nothing
is kept but this browser's counts; the nickname's claim carries them.

### The construction rides

From the construction app's library (`public/library/`), driven as the pickup is (library items,
`works.js` for World Drive's names, words and tuning): `models.js` stands each with its lowest point
on the ground at its real size (the library's), and `drive.js` drives it. They're published with the
World Drive site beside the pickup (`vite.drive.config.js`, `WORKS_RIDES` in `catalog.js`), loaded
only when one is driven or looked at in the Garage (or driven by someone in your room), and their
pictures were drawn once for World Drive the way the cars' are (`node scripts/drive-car-thumbs.mjs
--works`, into `drive/public/works/`, committed), rather than the library's own (some on grey, some
on nothing, each from its own angle).

| Ride | Model (`public/library/`) | Source | Size | Download | Triangles | Top speed | Handling |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Skid steer | `skid-steer-loader-cad.glb` | our own CAD model | 3.1 × 1.8 m, 2.0 m tall | 218 kB | 32,900 | 30 km/h | Tiny and quick to turn; skid-steered, so it spins on the spot (110°/s standing) |
| Telehandler | `telehandler-10k-stowed.glb` (boom stowed) | our own | 8.7 × 2.6 m, 2.6 m tall | 81 kB | 11,800 | 40 km/h | Long and steady, wide turns |
| Concrete mixer | `concrete-mixer-truck.glb` | "Concrete Mixer Truck" by doty_aecom, CC BY 4.0 | 8.5 × 2.6 m, 3.8 m tall | 422 kB | 44,300 | 90 km/h | A road truck: slow away (2.2 m/s²), rolls on, wallows and shakes when it hits something |
| Road roller | `roller-single-drum-84in.glb` | our own | 6.0 × 2.3 m, 3.1 m tall | 461 kB | 62,200 | 22 km/h | The slowest of all, barely thrown up by anything |
| Wheel loader | `wheel-loader.glb` | "Wheel Loader" by doty_aecom, CC BY 4.0 | 8.3 × 2.8 m, 3.5 m tall | 371 kB | 31,500 | 45 km/h | Bends in the middle, so it turns tighter than its length (lock 42°) |
| Dump truck | `articulated-dump-truck.glb` | "Articulated Dumptruck" by doty_aecom, CC BY 4.0 | 10.8 × 3.5 m, 4.1 m tall | 422 kB | 41,800 | 55 km/h | Six wheels and articulated: heavy, wide, shaking the most when it hits something |
| Bulldozer | `crawler-dozer-20t.glb` | our own | 6.6 × 3.4 m, 3.3 m tall | 597 kB | 84,000 | 20 km/h | Tracks: grips hardest, turns on the spot (45°/s standing), slowest away (1.6 m/s²) |
| Vac truck | `hydrovac-truck.glb` | our own | 11.1 × 3.8 m, 3.8 m tall | 456 kB | 55,200 | 95 km/h | Big, red and long: turns widest of them (85°/s at walking pace) |

**How they were chosen**: the smaller file of each kind, nothing named after a maker, and each
reading clearly as itself from the chase camera. The project's own CAD models (no licence to honour)
where there's one, and three of doty_aecom's (CC BY 4.0, credited in `public/library/CREDITS.md`, the
About box and under the picker, as the pickup is) for a wheel loader, an articulated dump truck and
a concrete mixer. Left out: the motor grader (2.8 MB, and its credit names a real maker's model), the
off-highway haul truck (1.9 MB, a real maker's machine by name, which `catalog.js` already keeps out),
the Sketchfab skid steer (1.2 MB, against the CAD one's 218 kB), the CAD wheel loader (610 kB against
371 kB), the telehandler with its boom (2.1 MB against the stowed one's 81 kB), the backhoe loaders
(687 kB and 1.8 MB, their arms out behind) and the tandem rollers (1.2 and 2.3 MB). None needed
simplifying or compressing again: the library's are already meshopt-compressed with WebP textures,
the biggest 612 kB, all under the cars' 2 MB limit and a quarter of the pickup's 2.8 MB.

**Handling** (`works.js`): all slower and heavier than the pickup (160 km/h): low top speeds, slow
away, wide turns, barely thrown up by a hit (`launch` 0.5 to 0.85), squashing and shaking more when
they hit something. The bulldozer's tracks and the skid steer's skid-steered wheels turn it on the
spot: a new `pivot` in `drive.js`'s handling (°/s at a standstill, easing out by 3 m/s, where the
wheels' own steering takes over; 0 for everything else, so nothing else changes). Their wheels don't
turn (the CAD models' tyres are one mesh each side), as the pickup's don't. Their paint is the
model's (the Garage says so): underglow, boost, trail and horn as any ride.

**Checked where it shows to others.** A construction ride is driven by the page alone once it's
unlocked there, but wherever it would show to others the Worker checks the achievement itself (one
look by the player's key, only for a construction ride; nothing read for any other): a score posted
in one (`POST /api/score`: the boards' vehicle field), a challenge time (`POST /api/challenges/time`:
its board's row and its ghost) are turned away without it (403, `reason: 'ride'`, with the unlock's
words), and a room (`live.js`) shows anyone without it in the default ride (the pickup), at hello and
at each change of ride. The room asks only when a construction ride is picked (`rideOf`), and then
once a connection for all of them together (`unlockedRides`: one look by key for each construction
ride's achievement, for the player and their account's): the answer is kept with the driver, so a
page going back and forth between rides, or trying each in turn, doesn't ask again, and while it's
being asked the ask itself is kept, so a burst of looks (or a hello and a look at once) waits on
that one ask, and the others are told once, of the ride picked last. A hello or change in any other
ride reads nothing of achievements (a ride unlocked since shows from the page's next hello, which
the page says as one unlocks). A score is checked after its gap and the visitor's day
(`SCORE_GAP`, `SCORES_PER_VISITOR_DAILY`) and a time after its gap, the visit's count and the
visitor's day (`TIME_GAP`, `CHALLENGE_TIMES_PER_VISIT`, `CHALLENGE_TIMES_PER_VISITOR_DAILY`), so one
refused for its ride costs what any other post does, never a loop of lookups. For testing, `?feats=all`
on this computer (localhost or 127.0.0.1, `feats.js`, as `?pro=1`) unlocks them in the page alone.

### The Worker's routes

- `POST /api/progress` (levels') answers with `earned: [ ids ]`, the achievements that report reached,
  and to an empty report whose body asks (`feats: true`, as the page does once as it starts),
  `feats: [ ids ]`, every one the player and their account have, the first time a visit asks
  (`visits.listed`, written as it's had; after that, and to a report sent again, the answer without
  it). No Durable Object is asked: a visit takes a robot check, and the Earth's are a few a day an
  address.
- `POST /api/achievements { id, secret }`: `{ achievements: [ { id, at } ], counts: { km, moon, looks,
  rides, streak, parties, challenges }, own: { km, moon, looks, rides }, left: { km, moon, looks,
  rides }, rides: [ unlocked construction rides ] }`, the player's and their account's (`counts`:
  the most any of the account's players has of each; `own`: this player's own trusted counts, which
  their reports add to; `left`: what more of each the Worker will take from this player today).
  JSON from the site itself (`checkSameOrigin`, 1 kB at most), a 400 for anything but a player's id
  and secret, a 403 for the wrong secret; held to `ACHIEVEMENT_LOOKS` (Cloudflare's rate limiter, 6
  a minute by the challenges' keyed hash of the address's /48 and the day, before anything's read)
  and `ACHIEVEMENT_LOOKS_PER_VISITOR_DAILY` (200 a day by `DriveLimits`, by the /48), a 429 past
  either. Never cached anywhere shared (`no-store`): it's the player's own; the page
  keeps an answer a minute.
- `GET /api/admin/achievements` (the owner's, as `/api/admin/stats`: `ADMIN_EMAILS`, `ADMIN_LOOKS`):
  `{ players, earners, achievements: [ { id, name, goal, checked, ride, players } ] }`, how many
  players there are, how many have any, and how many have each. The admin page shows them as bars
  with each one's share of the players, whether it's checked or trusted, and the ride it unlocks.

### What's kept, and what isn't

`achievements`: a player's id, an achievement's id and when, 25 rows a player at most, removed with
the player. `players.tallies` (a few numbers, the ids of up to 31 rides, the days in a row and the
day's counts), `players.parties` and `players.party_marks` (up to 10 short HMACs of the player's id
with a party's code under a key from the Worker's secret, so a party isn't counted twice; not the
codes, so no two players' match, nor can anyone with the table and not the secret work them back),
and `visits.listed` (whether a visit has had its player's list). A party's room holds, while it's
open, a keyed hash of each connection's /48 and the day, to tell one address from another; it's
never written anywhere. Nothing of an address, a device or where anyone drove is kept; the owner
sees counts of players only.

### What it costs

The free plan (D1, 1 November 2026: 5 million rows read and 100,000 written a day; Workers 100,000
requests; Durable Objects 100,000 requests) and the paid one (25 billion read and 50 million written
a month included):

| | Rows read | Rows written | Other |
| --- | --- | --- | --- |
| A report with something in it | none more (the tallies are in the player's row) | none more, and 1 an achievement earned (25 a player, ever) | |
| An empty report | the player's row, as before | none | |
| The page's ask for the whole list (an empty report with `feats: true`, once a visit) | the account's achievements: a few dozen, about 250 at most whatever the account (its first 20 players, 200 rows of the others', each counted again as they're grouped) | 1 (`visits.listed`) | |
| A challenge time, a player's first on that challenge | up to 50 (their nth time, by key), usually 1 to 10 | 1 an achievement earned | |
| A challenge's final places | its board's rows, once more (as its final ranks are written) | 1 a placing | |
| A room's hello or change of ride (a player) | as before; and in a construction ride, every construction ride's achievement at once (`unlockedRides`: a look by key for each of the eight, for each of the account's players: 14 rows measured alone, 281 for an account of 20 players or more), once a connection whatever rides it picks and however many looks it sends at once | none | nothing for any other ride, nor for a guest |
| A party joined with someone else | 1 or 2 | 1 or 2 (the count and its mark, an achievement) | after the answer, from the room |
| A score or a time in a construction ride | that achievement's row (`hasRide`): 3 alone, 61 measured for an account of 20 players or more | none | nothing for any other ride; asked after the post's gap and the visitor's day (a time's after its visit's count too), so a refused one costs what any post does |
| The grid (`POST /api/achievements`) | about 30 alone; about 410 at most whatever the account (21 players' rows, their achievements as the list's, their times to 50) | none (or a few, once) | 1 Durable Object request (the day's count) |
| The admin counts | every achievement row (the owner, rarely) | none | |

At the day's 300 visits, about 300 grid views and 300 lists as pages start are some 30,000 rows read
for most players (under 1 % of the free plan's) and 300 Durable Object requests (0.3 %); the
achievements earned are a few hundred rows written. What one ask reads is bounded whatever the
account: `playersOf` reads at most 20 of its players and `featRows` the player's own achievements
and at most 200 of the others' (measured with D1's own `rows_read` in the tests: the same for an
account of 80 players as of 160). **One address** can ask for the grid 6 times a minute and 200
times a day: at about 410 rows an ask at most, 82,000 rows a day, under 2 % of the free plan's reads,
and no writes. An empty report reads only the player's row; the whole list comes once a visit (8 Earth
visits a day an address, and a robot check each for the Moon's), so about 250 rows a page load at
most. Its reports, times and parties were bounded already (levels' 30 s gap and `PROGRESS_POSTS`,
the challenges' `CHALLENGE_MISSES` and daily caps, `LIVE_CONNECTS`), and achievements add at most 25
rows written a player, ever, 2 a party joined and 1 a visit's list. A score in a locked construction
ride is refused only after the score's gap (one every 10 s a player) and the visitor's day (1,500 an
address), as any score is: at most 1,500 lookups of about 60 rows, 90,000 rows a day. A time in
one likewise only after the time's gap (one every 10 s a player), its visit's count and the
visitor's day (300 an address): at most 300 lookups, 18,000 rows a day. A room reads nothing of
achievements at a hello or a change of ride except for a construction ride, and then one ask once
a connection for all eight of them, however many looks it sends and whichever rides (14 rows
measured for a player alone, 281 for an account of 20 players or more, the most `playersOf` reads):
a visit's 200 connections a day (`LIVE_VISIT_CONNECTS`) in construction rides are about 2,800 rows
for most players and 56,000 at most, and an address's 8 Earth visits 450,000 at most, under a tenth
of the free plan's reads (a Moon visit, as for everything a visit buys, takes a robot check each).
(Round 2 asked once for each ride, about 60 rows each for a big account, and again for each look
sent while D1 was answering: forty looks at once were forty asks, some 580,000 rows a visit.) (Round 1 read the account's whole list, about
250 rows, at every hello, whatever the ride: 10 visits' worth of reconnects from one address came to
500,000 rows, a tenth of the free plan's reads, and the day's 40,000 connects to twice its reads.)
So one address stays well under a tenth of the free plan's daily reads and writes. Storage: about 40
bytes an achievement row, 300 a player's tallies and 180 their party marks.

**The page's first load**: the shared rules (`achievement-rules.js`, needed there for the locks, the
reports' counts and the toasts' words) and the construction rides' names and tuning (`works.js`)
add 8.3 kB to the game's chunk (1,121.22 to 1,129.55 kB minified, 345.15 to 348.28 kB gzipped:
+3.1 kB, the second round's fixes 0.4 kB of it) and a shared chunk of 5.0 kB (1.7 kB gzipped) it
imports; the first stylesheet 11.22 to 11.77 kB (the profile card's button, the locks' chips and a
paused toast's place), the page's first script 13.70 to 13.86 kB
(a name `catalog.js` exports). `library/library.json`, fetched as the page starts, lists the eight
rides too but only what the page reads of each: 660 bytes to 3.3 kB. The rides' pictures (8 to 12 kB
each, 84 kB in all) come only as their cards are scrolled near (`panel.js`, an
`IntersectionObserver` on each row: none of them in the first load, on a phone held either way or a
computer, as `test-drive-levels-ui.mjs` checks); their models (3.1 MB together) only when one is
picked. The grid (3.6 kB of script, 1.8 kB gzipped, and 2.8 kB of styles) comes the first time
it's opened; the build's test checks none of it is in the page or the game's chunk.

### Measured

On a 375 × 740 phone screen in Chromium's software renderer (SwiftShader, no GPU, on a machine
shared with other test runs, so the times are rough), each ride picked from the pause menu on the
test pad (`test-drive-levels-ui.mjs`, three runs, the machine busier for some than others):

| Ride | Download | Triangles | Frame (middle of 60) | Its lowest point over the ground | 2 s of gas from a standstill | 1 s of steering, standing |
| --- | --- | --- | --- | --- | --- | --- |
| Skid steer | 223 kB | 32,884 | 39 to 65 ms | 0 | 6.4 m, 21 km/h | 101° |
| Telehandler | 83 kB | 11,756 | 38 to 55 ms | 0 | 5.1 m, 17 km/h | 0 |
| Concrete mixer | 432 kB | 44,310 | 65 to 109 ms | 0 | 4.4 m, 16 km/h | 0 |
| Road roller | 472 kB | 62,160 | 69 to 99 ms | 0 | 3.4 m, 12 km/h | 0 |
| Wheel loader | 379 kB | 31,506 | 57 to 91 ms | 1 cm | 4.7 m, 16 km/h | 0 |
| Dump truck | 432 kB | 41,799 | 65 to 100 ms | 0 | 4.0 m, 14 km/h | 0 |
| Bulldozer | 612 kB | 84,044 | 84 to 119 ms | 0 | 3.1 m, 10 km/h | 41° |
| Vac truck | 467 kB | 55,162 | 64 to 93 ms | 0 | 4.6 m, 16 km/h | 0 |
| *Go-kart* (for comparison) | built in code | 17,224 | 33 to 57 ms | 0 | 17.2 m, 58 km/h | 0 |
| *Pickup* (the default ride) | 2,846 kB | 219,049 | 853 to 858 ms | -1 cm | 12 m, 42 km/h | 0 |

So each draws within about twice the kart's time and a seventh to a twentieth of the pickup's (whose
219,000 triangles in many draws are the software renderer's worst case), and downloads a fifth of it
or less: none needed simplifying. (These are the software renderer's times; on a phone's GPU they
weren't measured, but at 12,000 to 84,000 triangles each they're a fraction of the pickup's 219,000,
which phones already draw.)

### How it's tested

- `npm run test:drive-levels` (`scripts/test-drive-levels.mjs`): the rules as written (25, each
  count known, every construction ride unlocked by one, the pass none; `checkTallies` turning away a
  ride that isn't one, a count that isn't whole or is negative; a day's worth taken by `addTallies`
  and again the next day; what `crossed` reaches; the grid's lines), then the Worker under `wrangler
  dev`: the migration's columns and table; trusted counts with reports (the claim held to
  `CLAIM_TALLY`, its 25 km giving the skid steer and not the wheel loader, what's left of a day's 10
  Moon drives, 10 looks and 4 rides, five minutes' km more the same day at the time cap, only what's
  left of the day's 500 km, the next UTC day's worth, earned once, 400s for what the page can't send,
  an empty report's every one only when it asks, and none to one that doesn't); the whole list once a
  visit (again from a new visit, nothing from another player's); three days in a row by the Worker's
  clock (earned on the third, kept through a day off); a claim saying 10,000 days in a row earning no
  streak achievement and leaving the telehandler locked until the Worker has seen three days, and a
  player from before achievements starting from their streak, but only as far as the Worker could
  have seen it (10,000 days in the row of a player made two days ago giving three days and the 3
  days' achievement, never the 7 or 30; an old one only its capped best, the telehandler locked);
  the rows an ask reads (D1's
  `rows_read`, through wrangler's platform proxy) the same for an account of 80 players as of 160,
  and a few hundred at most; challenges finished from the times as the grid asks, and placings from final
  ranks alone (top 10, podium, winner, daily, weekly: the vac truck's), the rides refused (a 403
  with `reason: 'ride'` and the unlock's words) on the leaderboard until earned and let through
  after, and checked only after the score's gap (forty at once in a locked ride: one 403, then 429s,
  as in the go-kart); the rows a room's ask for every construction ride reads (`ridesSql`: 14 alone,
  281 for the big account, the same for 80 players as for 160); the docs' console SQL writing every placing of a board finished before
  achievements (a weekly's first and third: top 10, podium, the weekly podium, the first a winner;
  the eleventh none; nothing more run again); following sign-in both ways (two players linked to one
  account each having the other's, the grid's counts the account's best and `own` each player's
  own, the rows each player's own); the grid's route (its player,
  `no-store`, 400s, 413, 405, another site's page, the day's cap from one address, the rate
  limiter before anything's read, today's `left`); the owner's counts (every achievement, its
  players, nothing of who, 401 and 403).
- `npm run test:drive-worker`: migration 0009 on top of 0001 to 0008 with a player kept and their
  counts none yet, one row an achievement, removed with the player; in the challenges' story a
  player's first time writing their first challenge finished (and the rows a time writes, one more
  for that), a construction ride's time turned away (twelve at once in one: one 403, then 429s, the
  ride checked after the time's gap and the visitor's day), yesterday's board's final places writing each
  player's placings (the owner's none), and the replaced weekly's winner having the weekly podium;
  the top speeds and the play stats' keys including the construction rides.
- `npm run test:drive-live`: in a party, a construction ride shown as it is with its achievement,
  as the pickup without it (or for a guest), at hello and at a change of ride, and once unlocked
  from the next hello; the party counted once for each player in it (and its achievement written),
  not again as a page joins the same party again, and not alone in one; one player in two tabs on
  one address in three parties counting none, nor with a guest on that address or their own
  nickname from another, a guest from another address counting, and going back and forth between
  two parties counting each once, their marks keyed hashes (the Worker's secret's: not the codes,
  not another player's, not another secret's, not the plain hash); a construction ride looked up
  only when one is picked (an achievement written after a hello in the go-kart shows as the ride is
  changed to its ride) and once a connection (taken away at the console, it still shows going back
  and forth; another without its achievement shows as the pickup); and, on the stand-in room, a
  connection's construction rides asked of D1 once for all of them: a burst of looks (as many as the
  rate lets through) while D1 holds its answer one ask and one message to the others, of the ride
  picked last, and every construction ride in turn after asking nothing more.
- `npm run test:drive-levels-ui`: a locked construction ride's chip, picture and words in the picker
  ("Finish a weekly challenge in its top 3 to unlock the vac truck. See your Achievements.", the ride
  picked staying the same) and the Garage (its tab, its banner, a look on it); the grid from the
  profile card (each earned one's date, how far toward the rest, the bars, the rides they unlock);
  a report that earns two showing "Achievement: 10 km driven", "Unlocked: Skid steer" (whose
  **Garage** opens the Garage on it, unlocked) and "Achievement: New look", in that order, nothing
  told of what was earned before, the toast clear of the pause menu's **Keep driving**, and the ride
  driven from the pause menu; 120 km driven before a nickname telling only the first drive and 10 km
  (what the claim keeps, never 100 km), waiting behind another toast that's up, not told again as the
  claim earns them, the wheel loader locked after the claim and as the page starts again with the
  Worker out of reach, and "Achievement: 100 km driven" and "Unlocked: Wheel loader" told when the
  Worker earns it later; each construction ride
  (with `?feats=all`) loading only when picked, on the ground, driving, the tracked ones turning on
  the spot and the others not, with its download and frame time (the table above); earned rides
  unlocked as the page starts from what this browser kept (the Worker's whole list heard once, then
  the Worker out of reach), none for another player, and taken away when the owner removes the
  player; a Garage choice picked again not counting again; and a phone held upright and on its side
  and a computer (no construction ride's picture in the first load, the chips inside their cards,
  the grid inside the screen with no sideways scrolling), with pictures of each
  (`TEST_SCREENSHOTS`).
- `npm run test:drive-ui`: the admin page's achievements (each one's players and share, checked or
  trusted, the ride it unlocks; nothing signed out); the rides' order in the picker (the
  construction rides after the cars); achievements earned in a challenge's countdown held through it
  and the run (no toast, `window.drive.notices` keeping them) and told in turn at its end; a score
  refused for its ride ("Not posted", the unlock's words, and the next run posted) and a time
  refused for its ride (the unlock's words, not "Couldn't reach World Drive"). `npm run test:drive-seo`: the grid a chunk of
  its own, script and styles, none of its words in the page or the game's chunk; the rides' models
  and pictures in the build, and `library.json` only what the page reads.

### Looking after it

In the D1 console (as for [levels](#looking-after-levels)):

```sql
-- Who has the most (by player id), and a player's own.
SELECT player_id, COUNT(*) AS n FROM achievements GROUP BY player_id ORDER BY n DESC LIMIT 20;
SELECT achievement, datetime( earned_at / 1000, 'unixepoch' ) FROM achievements WHERE player_id = 'PLAYER_ID';

-- Take a cheat's back (and their counts), so they're earned again.
DELETE FROM achievements WHERE player_id = 'PLAYER_ID';
UPDATE players SET tallies = '{}', parties = 0, party_marks = '[]' WHERE id = 'PLAYER_ID';

-- Write the placings of boards finished before achievements, from their final ranks: every one
-- (top 10, podium, winner, and the daily, weekly and monthly ones by the board's period), as
-- placingQuery writes them. (The placings are a VALUES list, not SELECTs joined with UNION ALL: D1
-- allows at most five terms in a compound SELECT, and there are six.)
INSERT INTO achievements ( player_id, achievement, earned_at )
SELECT t.player_id, p.id, c.final_at FROM challenge_times t JOIN challenges c ON c.id = t.challenge_id,
	( SELECT column1 AS id, column2 AS rank, column3 AS period FROM ( VALUES ( 'top-10', 10, NULL ), ( 'podium', 3, NULL ), ( 'winner', 1, NULL ),
	( 'daily-winner', 1, 'day' ), ( 'weekly-podium', 3, 'week' ), ( 'monthly-top-10', 10, 'month' ) ) ) p
WHERE c.final_at IS NOT NULL AND t.final_rank IS NOT NULL AND t.final_rank <= p.rank AND ( p.period IS NULL OR c.period LIKE p.period || ':%' )
ON CONFLICT DO NOTHING;
```

## Ads

World Drive can show one Google AdSense display ad, and only on the globe: off until the owner sets
a publisher id, and never for anyone with the [Supporter Pass](#supporter-pass-buying-it).

### What people see

- **On the globe only.** A small banner with "Ad" over it: on a computer along the bottom beside the
  panel (728 × 90 where the screen is at least 1116 px wide and 600 high, else 320 × 50); on a phone
  upright, 320 × 50 just above the sheet along the bottom; on a phone on its side, 320 × 50 at the
  bottom beside the panel. The pin's card, a party's banner and the map's credits move up out of its
  way while it's there, so it covers none of the panel, the search, the trophy or the buttons.
- **Never anywhere else.** It's in the globe's own section (`#globe-ui`), so it's gone, and takes no
  room, while dropping in, driving, paused, on the loading, robot-check, used-up and other screens,
  and back when the globe is (**M**). It's the one ad a visit asks for, so there's nothing between
  drops either. The places' pages and the Moon's (`/drive/`, `/moon/`) have none: they have no script
  at all.
- **Supporters never see one**, and Google's script isn't even loaded for them: the page waits for
  the Worker's word on the pass (`/api/me`, which `supporter.js` asks anyway) before asking for the
  ad's code. A pass that comes mid-visit (bought, or signed in) takes the ad away at once, with its
  room.
- **Blocked, or no ad to show**, it goes quietly: Google's script not loading (an ad blocker), an ad
  Google says is `unfilled`, or none saying anything 20 s after the script came, and the space goes
  as if it had never been there. No error, nothing in the way.
- **About World Drive** then has a paragraph on the ads and Google's cookies (put there by `ads.js`,
  so it's only there while there are ads, and not for a supporter).

### How it works

- `GET /api/config` has `adsense: { client, slot }` only while ads are on (`adsense()` in
  `worker/drive/settings.js`): `ADSENSE_CLIENT` is `ca-pub-` and 16 digits, and `ADSENSE_SLOT` is
  empty or 6 to 12 digits. Anything else (a typo, the id without its `ca-`, a slot that isn't one)
  is off, rather than half on. Off, the answer is exactly what it was before ads, and nothing about
  them is loaded or shown.
- **Nothing in the first load.** The ad is `src/drive-app/ads.js` (and `ads.css`), a chunk of its
  own (under 2 kB compressed) that `main.js` imports only once the globe is showing, the Worker has
  said whether the pass is here, the visitor hasn't it, and the browser is idle
  (`requestIdleCallback`, at most 5 s; 3 s on a browser without it). Google's script,
  `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=<ADSENSE_CLIENT>` (`async`,
  `crossorigin="anonymous"`), is only asked for while the globe shows (dropped in before then, it
  waits for the globe), as an ad slot with no width is one Google can't fill.
- The slot is an `<ins class="adsbygoogle">` with `data-ad-client`, `data-ad-slot` when there is
  one and `data-full-width-responsive="false"`, sized by `ads.css` (Google's way to give a
  responsive unit an exact size: no `data-ad-format`), so the ad can't grow over the sheet. Its
  room (`body.ad-on`) is only kept from when `ads.js` puts it up until it goes, so nothing moves
  before.
- **`/ads.txt`**: the Worker answers it (it's in `run_worker_first` in `wrangler.drive.jsonc`, next
  to `/api/*` and `/c`, so it's never a file), with AdSense's one line, `google.com,
  pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0` (the publisher id without its `ca-`; the last part
  is Google's own and the same for everyone), while ads are on, and a 404 while they're off. It's one
  Worker request each time a crawler asks, a few a day.
- **No Content-Security-Policy** is set anywhere for World Drive (not by the Worker, nor a `_headers`
  file, nor a `<meta>`), so AdSense's hosts need nothing allowed. If one is ever added, it must allow
  `pagead2.googlesyndication.com`, `*.googlesyndication.com`, `*.doubleclick.net`,
  `*.google.com`, `*.gstatic.com` and `*.adtrafficquality.google` for scripts, frames, images and
  connections (Google's list for AdSense with a CSP).
- **Play stats**: `ad:shown` (an ad filled the slot) and `ad:blocked` (its script, or its ad, didn't
  come), each once a visit, only counts like the rest; the admin page shows them beside the pass's
  when there are any.

### Consent and privacy

There's no consent banner of World Drive's own. Google's consent message is a Google-certified CMP
(IAB TCF) that AdSense serves itself, with the ad script, to visitors in the EEA, the UK and
Switzerland (and, set up for them, in US states with their own laws), and it must be turned on before
ads go live there: see the owner's steps. Without it, Google serves those visitors only limited ads,
or none. The About box's ads paragraph says what Google does with cookies and links to
[Google's page on it](https://policies.google.com/technologies/partner-sites).

### The ads' settings

| Setting | Where | What it is |
| --- | --- | --- |
| `ADSENSE_CLIENT` | `vars` | The AdSense publisher id, `ca-pub-` and 16 digits (public). Set to the owner's id; `drive/index.html` also carries it as `<meta name="google-adsense-account">` for AdSense's site check. Empty: no ads, and `/ads.txt` is a 404 |
| `ADSENSE_SLOT` | `vars` | Optional: a display ad unit's id, 6 to 12 digits. Empty: the slot has no unit id |

Both are in `wrangler.drive.jsonc`'s `vars`, which every deploy sets: change them there (a value put
in the dashboard instead is replaced by the file's at the next deploy). A slot id is recommended: an
`<ins>` without one only gets an ad if Google has one for it, else it's `unfilled` and the space
goes. Keep **Auto ads** off for worlddrive.app in AdSense (Ads → By site): once Google's script is
on a page, Auto ads would place ads of its own wherever it likes, while driving too.

### The owner's steps

1. **Apply.** At [adsense.google.com](https://adsense.google.com), sign up with the Google account
   that should be paid, and add the site `worlddrive.app`. Copy the publisher id (`ca-pub-` and 16
   digits: Account → Settings → Account information).
2. **Turn it on.** Put the id in `wrangler.drive.jsonc` as `ADSENSE_CLIENT` (leave `ADSENSE_SLOT`
   empty for now), commit and push: Workers Builds deploys it. Google's script is then on the globe
   for everyone but supporters, and `https://worlddrive.app/ads.txt` has the line AdSense asks for.
3. **Connect the site** in AdSense (Sites → worlddrive.app): verify it with **AdSense code snippet**
   (it's on the page) or **Ads.txt snippet** (it's served), then **Request review**. The review
   takes days to a few weeks; until then Google fills nothing, so the slot goes again each visit,
   quietly.
4. **Consent.** AdSense → **Privacy & messaging** → **European regulations**: create a message for
   worlddrive.app (Google's certified CMP for the EEA, the UK and Switzerland) and publish it; then
   **US state regulations** the same, if wanted. Do it before approval brings real ads.
5. **An ad unit** (once approved, recommended): Ads → **By ad unit** → **Display ads**, horizontal,
   **Responsive**; copy its `data-ad-slot` number into `ADSENSE_SLOT`, commit and push. Keep
   **Auto ads** off for the site (Ads → By site).
6. **Check it.** Open worlddrive.app in a private window (not signed in, no ad blocker): a few
   seconds after the globe comes up the banner shows, goes when you drop in and is back on M.
   Signed in with the pass: none, and no request to `googlesyndication.com` in the browser's Network
   tab. Sites → worlddrive.app says whether ads.txt was found (a day or so after it first is).

To switch ads off again, empty `ADSENSE_CLIENT` and deploy (and `/ads.txt` goes with it).

### How ads are tested

`npm run test:drive-worker`: `/api/config`'s `adsense` only for ids in their formats (spaces round
them taken off, every kind of wrong one off, and nothing about ads in the answer then), `/ads.txt`'s
line and its 404, HEAD and 405, `www` sent on; and under `wrangler dev` with `wrangler.drive.jsonc`,
`/ads.txt` reaching the Worker, even with a stale file of that name among the assets, and off as the
file ships. `npm run test:drive-ui` ("World Drive's ad on the globe"), with Google's script stood in
for (Playwright answers its request, so nothing goes out): with ads off nothing of them asked for or
shown; on, the banner on a computer (728 × 90 beside the panel, the script asked for as AdSense
says, About's paragraph), clear of everything on the globe, pinned too, gone while dropping in,
driving and paused and back on M, and its script waiting for the globe when the drive started first;
never for a supporter (neither `ads.js` nor Google's script asked for) and gone with its room when the
pass comes mid-visit; blocked and unfilled, gone quietly with the pin's card where it always is; and
on a phone upright and on its side, clear of the sheet, the title, the trophy and the pin's card
(with the pin still between the title and its card), with a picture of each (`drive-ad-desktop.png`,
`drive-ad-phone.png`, `drive-ad-phone-landscape.png`, in `TEST_SCREENSHOTS` or the system's temporary
folder).

## Settings

In `wrangler.drive.jsonc` (`vars`, set on every deploy; change them there, not in the dashboard):

| Setting | Default | What it is |
| --- | --- | --- |
| `DAILY_VISITS` | 300 | Visits a day for everyone together; 0 closes for the day |
| `PER_VISITOR_DAILY` | 8 | Visits a day per visitor |
| `TURNSTILE_SITE_KEY` | `0x4AAAAAAFs3k5sgUIQHSuGC` | The worlddrive.app Turnstile widget (public) |
| `PER_VISITOR_DAILY_SUPPORTER` | 30 | Visits a day for a supporter, signed in |
| `PASSWORD_ACCOUNTS` | unset (on) | [Username and password accounts](#username-and-password-accounts); `off` switches them off |
| `GOOGLE_CLIENT_ID` | empty | The Supporter Pass's Google sign-in (public); empty, no signing in or buying |
| `SUPPORTER_PAYMENT_LINK` | the live link | The Supporter Pass's Stripe Payment Link (public) |
| `SUPPORTER_PRICE` | `CA$4.99` | Its price, as the page shows it |
| `LIVE` | `on` | [Driving with others](#switching-it-off); `off` switches it off |
| `LIVE_DAILY_BUDGET` | 40000 | [The Durable Object requests a day](#the-days-budget) driving with others may use on the Earth; 0 is off there |
| `LIVE_MOON_DAILY_BUDGET` | 20000 | [The Moon's own](#driving-with-others-on-the-moon), apart; 0 is off on the Moon |
| `ADSENSE_CLIENT`, `ADSENSE_SLOT` | empty | [Google's ad on the globe](#ads): the AdSense publisher id (empty: no ads) and, if wanted, a display unit's id |

Secrets, set by the owner and never in a file (Cloudflare dashboard: Workers & Pages → world-drive →
Settings → Variables and Secrets, or `npx wrangler secret put NAME -c wrangler.drive.jsonc`):

| Secret | What it is |
| --- | --- |
| `GOOGLE_MAPS_API_KEY` | The Maps key from World Drive's own Google Cloud project (below). A secret named `Google_maps_api`, in any case, is taken too. |
| `TURNSTILE_SECRET` | The Turnstile widget's secret key |
| `STRIPE_WEBHOOK_SECRET` | The Supporter Pass webhook's signing secret, `whsec_...`; buying stays off without it |
| `SUPPORTER_EMAILS` | Optional, comma-separated: people with the pass without paying |
| `ADMIN_EMAILS` | Comma-separated: the Google accounts that may see [the play stats](#play-stats) and [where people drop in](#where-people-drop-in), choose [challenges](#the-owners-controls) and see how many players have each [achievement](#achievements-and-rewards), at `/admin.html` |

`keep_vars` is on, so anything set in the dashboard that isn't in `vars` survives a deploy. A few
more aren't in `vars` and needn't be set; add them in the dashboard (plain text) to change them:

| Setting | Default | What it is |
| --- | --- | --- |
| `SCORES_PER_VISITOR_DAILY` | 1500 | Scores a visitor may post a day (one every 10 s for four hours) |
| `NAMES_PER_VISITOR_DAILY` | 20 | New names and renames a visitor may make a day |
| `SUPPORTER_PAYMENT_LINK_ID` | none | The Payment Link's `plink_...` id: only its checkouts are a Supporter Pass |
| `PASSWORD_ITERATIONS` | 100,000 | PBKDF2's iterations for [new password hashes](#how-passwords-are-kept), 10,000 to 100,000: only to lower it if sign-ins were ever cut off for CPU on the Free plan |
| `LIVE_PARTY_MAX`, `LIVE_NEARBY_MAX` | 8, 20 | The most in a party, and in each of an area's rooms |
| `DROPIN_PLACES_DAILY` | 1500 | [Drop-in places](#where-people-drop-in) counted a day on each world for everyone together |
| `DROPIN_PLACES_PER_VISITOR`, `DROPIN_PLACES_PER_VISIT` | 30, 10 | Drop-in places counted a day for each visitor, and for each visit |
| `DROPIN_ASKS_PER_VISIT` | twice `DROPIN_PLACES_PER_VISIT` (20) | How many times a day DriveLimits is asked about a visit's drop-in places at most |
| `CHALLENGE_TIMES_PER_VISITOR_DAILY` | 300 | [Challenge](#challenges) times a visitor may post a day (an IPv6 visitor by its /48) |
| `CHALLENGE_TIMES_PER_VISIT` | 100 | [Challenge](#challenges) times a visit may post (what one robot check buys) |
| `ACHIEVEMENT_LOOKS_PER_VISITOR_DAILY` | 200 | Asks a visitor (by the /48) may make a day for their [achievements' grid](#achievements-and-rewards) |
| `CHALLENGE_GHOST_BUDGET` | 16,777,216 (16 MB) | The most of its [ghosts](#challenges)' text a challenge keeps (characters, which are bytes); past it a new best lets the slowest kept ghosts go to make room, or is kept without its own |

Eight rate limiters are `ratelimits` in `wrangler.drive.jsonc` (Cloudflare's, which cost no Durable
Object request): `LIVE_CONNECTS` (each visit's connections to rooms, 20 a minute),
`PROGRESS_POSTS` (each player's [level](#levels) reports and title changes, 10 a minute),
`STATS_POSTS` (each visit's posts of [play stats](#play-stats), 6 a minute), `ADMIN_LOOKS` (each
admin account's asks for the admin page's stats, [drop-in places](#where-people-drop-in) and
challenges, 30 a minute), `CHALLENGE_LOOKS` (each address's asks for [challenges'](#challenges)
lists and boards and its times posted, 60 a minute), `CHALLENGE_MISSES` (those of its lists and
boards that miss the cache and read D1, 10 a minute), `PASSWORD_TRIES` (each address's
[sign-ins with a password, checks of one and account changes](#guessing-and-how-its-slowed), 10 a
minute) and `ACHIEVEMENT_LOOKS` (each address's asks for its [achievements](#achievements-and-rewards),
6 a minute), each address (an IPv6 one by its /48) counted by a keyed hash of it and the day, never as
it is.

The leaderboard's, levels' and the Supporter Pass's database is the `DB` binding in
`wrangler.drive.jsonc` (D1 **world-drive**, already made); its tables are `worker/drive/migrations`
(`0003_levels.sql` levels': XP and the rest on `players`, and `discoveries`; `0004_stats.sql` the
[play stats'](#play-stats) `stats_daily`; `0005_dropins.sql` [where people drop
in](#where-people-drop-in)'s `dropins_daily`; `0006_challenges.sql` [challenges'](#challenges)
`challenges`, `challenge_times`, `challenge_picks`, `challenge_places`, `players.last_time_at` and
`visits.times`; `0007_challenge_ghosts.sql` their ghosts; `0008_password_logins.sql`
[usernames and passwords'](#username-and-password-accounts) `logins`).

## Deploying

`npm run deploy:drive` applies the database's migrations to the world-drive database (`wrangler d1
migrations apply DB --remote -c wrangler.drive.jsonc`; ones already applied are skipped, and
`0003_levels.sql` adds levels' columns and table before the Worker that needs them goes out), builds the
site into `dist-drive/` and deploys the `world-drive` Worker with it (`vite build --config
vite.drive.config.js && wrangler deploy -c wrangler.drive.jsonc`; `0006_challenges.sql` adds the
challenges' tables, `players.last_time_at` and `visits.times` before the Worker that needs them;
`0007_challenge_ghosts.sql` the times' handles and the ghosts' table). The Worker only runs for
`/api/*`, `/c`, the path a ["challenge a friend" link](#ghosts-and-challenge-a-friend) is shared
at, which gets its own preview card there, and `/ads.txt` ([ads](#ads)) (`run_worker_first` in
`wrangler.drive.jsonc`); every
other file, the home page included, is served straight from Cloudflare's assets, free and never
turned away (on the Free plan, once the day's Worker requests are used up, a path the Worker runs
first for is answered 429 instead of its file). The Durable Objects'
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

**Rolling back** (a version picked in the dashboard's Deployments, or a gradual deployment sending
some requests to an older one) past the deploy that brought [where people drop
in](#where-people-drop-in): visit tokens are written as they always were (`v1`, with the [kind of
visit](#how-cheating-is-limited) in the id, which the older Worker takes as any id), so open pages'
scores, XP, stats and driving with others carry on. The older Worker counts no places, and its
`DriveLimits` doesn't know the `place_*` tables, so that day's HMACs stay in them until the newer
code runs again and the next day starts (they're no use without the Worker's secret); D1's
`dropins_daily` stays as it is, with a gap for the days rolled back. Going forward again needs
nothing.

To deploy from GitHub on every push with Workers Builds (as the construction app is): in the
Cloudflare dashboard open the **world-drive** Worker → Settings → Build, connect this repository and
set

- Deploy command: `npm run deploy:drive` (so the migrations are applied before the Worker that needs
  them goes out)
- Build command: none needed (`npm run build:drive` does no harm: the deploy builds again)
- Branch: the branch World Drive ships from

The first deploy replaces the holding page. `worlddrive.app` and `www.worlddrive.app` are the Worker's
custom domains (`routes` in `wrangler.drive.jsonc`; Cloudflare makes their DNS records and
certificates). `www` sends you on to `worlddrive.app` with the path and query kept: a redirect rule in
the Cloudflare dashboard (a 301, for everything on `www`, before the Worker or the assets see it),
with the page's own script moving a page along too should the rule ever be off. There's no
`workers.dev` address: the Turnstile widget only works on worlddrive.app, and one address keeps the
counts simple (and [search engines](#search-engines) see one site).

## Search engines

Google hadn't indexed a single page of worlddrive.app: its head had a bare title and no picture,
there was no sitemap, robots.txt was only Cloudflare's own block, and there was nothing for a crawler
to read but the buttons' labels. Now it follows Google Search Central's guidance (linked at each
point). The space it's in (other "drive the Earth" sites, a Steam game called WorldDrive, Google Earth
driving simulators) is why every page says plainly what World Drive is and what it does that they
don't: Google's photorealistic 3D cities, anywhere on Earth, arcade stunts, boosts, drifting and
flying, other drivers as ghosts and party links, levels, free in the browser with nothing to
download. "Drive on the Moon" is a search with only throwaway games in it, and World Drive's Moon
is made from NASA's own maps of it, so [the Moon has pages of its own](#the-moons-pages) too.

### What a search engine reads

- **The home page's head** (`drive/index.html`). A title that says what it is ("World Drive – Drive
  Anywhere on Earth in 3D | Free Browser Driving Game"; with the Moon it would be over 70 characters,
  so the Moon is in the description instead) and a description of about 160 characters, the most
  important first ("Drive anywhere on Earth in photorealistic 3D, or on the Moon: ...")
  ([title links](https://developers.google.com/search/docs/appearance/title-link),
  [snippets](https://developers.google.com/search/docs/appearance/snippet)); the canonical address
  `https://worlddrive.app/`, so a party's link (`?party=`) or a place's (`?spot=`) counts as the home
  page ([canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls));
  Open Graph and Twitter tags with the link card (below), so a link posted anywhere, a party's
  included, unfurls with the picture, the name and what it is; the icons and the web app manifest.
- **Structured data** (JSON-LD in the head): `WebSite` with the site's name
  ([site names](https://developers.google.com/search/docs/appearance/site-names)), and the game as
  `VideoGame` co-typed `WebApplication` ([software apps](https://developers.google.com/search/docs/appearance/structured-data/software-app):
  Google only reads a game co-typed so), with its genres, `gamePlatform` "Web browser",
  `applicationCategory` `GameApplication` (the value Google takes, rather than "Game"), free
  (`offers.price` 0), and World Drive as its publisher; its description has the Moon in it too.
  Google's app rich result also needs a rating or reviews; World Drive has none to give, so none are
  made up, and it shows as an ordinary result.
- **Words a crawler can read**, in the page itself, so they're there for a crawler that doesn't run
  scripts and shown to everyone ([JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)):
  the splash's line under the name (on the screen while World Drive loads), and at the foot of the
  globe's panel, under the start spots: what World Drive is, what you can do, the keys, links to the
  places' pages and the Moon's (`<!-- places -->` and `<!-- moon places -->`, filled in by the
  build) and a few questions (is it free, does it work on a phone, can I drive my own street, can I
  drive on the Moon, can I play with friends, what's kept about me). It's plain text in the panel,
  there for anyone who scrolls down, nothing hidden. **About World Drive** opens from there as
  before; its words are in the page too. In the game a plain tap on one of the places flies the
  globe there (main.js, by the link's `data-play`, for any link in the panel's words that has one)
  rather than leaving for its page; on one of the Moon's it turns the globe to the Moon first, as
  its link (`/?spot=moon-<id>`) does. The lists of them all, `/drive/` and `/moon/`, open in a new
  tab.
- **What Google renders.** Google runs the page as well, but its renderer has no WebGL
  ([Google says so](https://developers.google.com/search/docs/crawling-indexing/javascript/fix-search-javascript)),
  and robots.txt keeps it off `/api/`. `boot.js` looks for WebGL 2 (which three.js needs) before
  anything else: without it there's no globe and no visit, and the panel shows only its words about
  World Drive under the title, with a line on why there's no globe ("World Drive needs 3D graphics
  (WebGL)..."). So that's what Google renders, and what a visitor whose browser has WebGL off or
  blocked sees, rather than an empty page after a spent drive. Google never starts a visit or meets
  the robot check, so it costs nothing and never sees "We couldn't check you're a person". A
  renderer with WebGL but kept off `/api/` gets the test globe with the panel; on worlddrive.app its
  6 s note then says the server couldn't be reached (the developer's "No Google 3D tiles here" note
  is only for other addresses), as it does for a visitor whose `/api/config` didn't answer.

### The places' pages

`/drive/` lists them; each place has its own at `/drive/<slug>/`: one for each start spot and five
more famous places (the Eiffel Tower, the Colosseum, Piccadilly Circus, Hollywood Boulevard and
Copacabana). (The Burj Khalifa had a page until it was seen on Google's tiles that there are no 3D
buildings in Dubai, only flat imagery, and Route 66 through Oatman until every drop-in there, four on
real tiles, found no 3D map at all: a place's page has to promise only what the game shows there.) Their words are `drive/site/places.js`: what the
place is, in a few true sentences, and what to do there in the game, with a title and description
of its own. `drive/site/build.js` makes them as plain HTML when the site is built (and the dev server
makes them as they're asked for), with their styles in the page and no script, so they show at once.
Each has its canonical address, its own link card, breadcrumbs (`BreadcrumbList`, and a `WebPage`
about the place with its coordinates), a big **Drive here**, links to every other place and home.

**Drive here** opens the game with the place pinned: `/?spot=<id>` for a start spot,
`/?at=<lat>,<lon>&name=...&region=...&heading=...` for the others (`linkedPlace` in
`src/drive-app/places.js`, which works for any place). The visit and the robot check come first, as
always; once the globe is up it flies there and pins it (on Google's tiles once their root has
arrived, which moves the Earth under the camera), and **Drive here** on the pin's card drops in. It
never drops in by itself. Then the place is out of the address, so a reload doesn't fly there again;
a `?party=` stays. On Google's tiles that's once the root has arrived, not before, so if it doesn't
come, the reload its error screen asks for still goes to the place. A link's name and region are
taken only as the leaderboard takes a place's name (`cleanPlace`: letters, numbers and an address's
punctuation, nothing rude), as the others driving there see it; otherwise it's a dropped pin. A link
to somewhere that isn't on Earth, or a spot that isn't one, pins nothing.

To add a place: an entry in `places.js` with true facts (check them), its own words (nothing copied
from another page) and a pin on a road, dropped in on Google's tiles first (that there are 3D
buildings there if the page says so, that the start is on the road and not beside it, and that the
heading faces what the page is about); then `npm run drive-site-images` draws its card. Each page
has to be worth reading on its own: a pile of near-identical pages for every town would be what
Google calls [doorway pages](https://developers.google.com/search/docs/essentials/spam-policies#doorways).
Each place's list of the others ends with the Moon, and `/drive/` says it's there.

### The Moon's pages

`/moon/` is about driving on the Moon in World Drive: what it is (the real Moon's shapes from the
Lunar Reconnaissance Orbiter's laser altimeter, LOLA, and its colours from the orbiter's camera,
LROC, NASA's and in the public domain; the small craters made up), what's different there (a sixth
of the gravity, jumps as high and two and a half times as long, the Earth in the sky, no water, and
driving with others there as on the Earth), its places and a big **Drive on the Moon** that opens the game on the Moon with
Tranquility Base pinned. Each of the Moon's twelve start spots (`MOON_SPOTS`) has its own page at
`/moon/<slug>/` (Tranquility Base, Hadley Rille, the Taurus-Littrow valley, Tycho, Copernicus,
Aristarchus, Plato, Mons Huygens, Shackleton, Mare Orientale, Tsiolkovskiy and Von Kármán), shaped
as an Earth place's: its own title and description, breadcrumbs (World Drive › The Moon › the place),
what the place is in a few true sentences, what to do there, how the Moon is in World Drive, the
keys, links to the other Moon pages, `/moon/`, `/drive/` and home, and NASA's credit in the footer.
Its **Drive here** is the spot's link, `/?spot=moon-<id>` (`linkedPlace`): the game turns the
globe to the Moon and pins the spot there, and never drops in by itself.

Their words are `drive/site/moon.js` (`MOON_PAGES`, and the paragraphs every Moon page shares).
They keep to well-known facts (Apollo 11 on 20 July 1969, Apollo 15 the first to take the Lunar
Roving Vehicle, Apollo 17 the last Apollo landing, Chang'e 4 the first soft landing on the far side), and
a number that isn't certain is left out. And they're honest about the game: its big shapes are the
real Moon's, its heights every quarter of a degree (7.6 km apart), so anything narrower (Hadley
Rille itself, the Taurus-Littrow valley's depth, Copernicus's terraces) is softened or not there;
the small craters you drive among are made up; and there are no landers, flags or rover tracks, so
no page says you can see the Apollo hardware. A place's own `game` line says what's different about
it in the game, where something is (Shackleton's floor lit, as World Drive lights every place on
the Moon alike, with the sun 20° up). Their structured data is a `BreadcrumbList` and a `WebPage`
about a `Place` contained in the Moon, with no schema.org `GeoCoordinates` (they're the Earth's): the
page gives its selenographic latitude and longitude in its words instead.

They live beside the files the game fetches from `/moon/` (`height.bin` and `colour.webp`, from
`drive/public/moon/`): the build makes `dist-drive/moon/index.html` and
`dist-drive/moon/<slug>/index.html` next to them, and Cloudflare's assets serve each as a folder's
page, as the places' are. The dev server's `driveSite` makes the pages at `/moon/` and
`/moon/<slug>/` (a `/moon/<slug>` without its slash is sent on to it, 307) and passes every other
`/moon/` address, any with a file's ending, on untouched to be served from `drive/public/`.

To add one: a start spot in `MOON_SPOTS` first (dropped in on, to see the ground is worth driving),
then an entry in `moon.js` with its `spot`, true facts (check them, against more than one source,
and leave out what isn't certain), its own words, and its `game` line if the game shows it
differently; then `npm run drive-site-images -- moon <slug>` draws its card. A page for a place
narrower than the Moon's heights can show would promise what the game hasn't got.

### Sitemap, robots.txt and one address

- **`/sitemap.xml`** is made by the build: the home page, `/drive/` and every place's page, `/moon/`
  and every Moon place's page, each with the day the files it's made from were last committed
  (`git log`: for the Moon's, `moon.js`, `build.js`, `site.css` and `moon-places.js`), so its
  `lastmod` only moves when the page does, which is the only `lastmod` Google trusts ([sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)).
  Built from a shallow clone (a build server's may be one), whose oldest commit seems to add every
  file, there's no `lastmod` at all rather than that commit's date on every page.
- **`/robots.txt`** (`drive/public/robots.txt`): everything may be crawled but `/api/`, which only
  the game talks to, and the sitemap's address
  ([robots.txt](https://developers.google.com/search/docs/crawling-indexing/robots/intro)). The game's
  scripts, styles and models stay open, as Google needs them to render the page. Cloudflare's managed
  robots.txt, which is on for the zone (it was all robots.txt said before), puts its own block (the
  Content Signals Policy, and any AI crawlers it's told to turn away) in front of this file's lines;
  ours follow unchanged. Look at https://worlddrive.app/robots.txt after a deploy to see both.
- **One address**: `www` is sent to `worlddrive.app` with a 301 (above), and every page names its
  canonical address.
- **The owner's page** (`/admin.html`, the [play stats](#play-stats)) is `noindex, nofollow` and not
  in the sitemap. robots.txt doesn't keep crawlers off it, as one that couldn't fetch it would never
  see its `noindex` (and could still list the bare address from a link).

### The load

Google counts how fast a page shows ([Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals):
largest contentful paint within 2.5 s), and World Drive was one 1.37 MB script (411 kB compressed)
that had to arrive and run before the visit was even asked for. Now `boot.js`, 12 kB, shows the splash
and runs the robot check while the game (`main.js`: three.js, the tiles and the rest) comes down
beside it, then asks for the visit; the splash's line about World Drive is on the screen with the
first paint and is its largest paint, so the page counts as loaded then; and on worlddrive.app the
head opens the connections to Turnstile and to Google's tiles at once.

The visit (`POST /api/visit`) is one of the day's drives, the visitor's and everyone's, so it waits
for both the robot check and the game's code: a download that fails (a phone losing its connection)
spends none, nor does each **Try again** after it, which reloads the page. Whichever of the two fails
first says so: the robot check's screen, or "World Drive didn't finish loading. Check your
connection" (a script that arrives but breaks as it runs, as on an older browser, says "World Drive
couldn't start in this browser" instead, and both are logged to the console). The check's 45 s
deadline counts from the start, Turnstile's script included, so a script that never arrives ends
on the robot check's screen too rather than on the splash for good. Only the short POST and its
siteverify come after the download, which on the phone below starts the game a few tenths of a
second later than asking for the visit beside the download did (3.2 s).

Measured with `scripts/drive-static.mjs`'s `measureLoad` on the built site on the test globe, as a
phone on Lighthouse's mobile settings (150 ms round trips, 1.6 Mbit/s, the CPU 4 times slower), three
loads each:

| | Before | After |
| --- | --- | --- |
| First contentful paint | 0.49 to 0.58 s | 0.45 to 0.54 s |
| Largest contentful paint | 3.5 to 3.8 s (the test globe's message; on the real site the globe's panel, later still) | 0.45 to 0.54 s (the splash's line) |
| Globe up, no Worker | 3.5 to 3.7 s | 3.4 to 3.9 s |
| The game started, with a stand-in Worker and a 1.5 s robot check | 4.6 to 4.7 s | 3.3 to 3.7 s |
| Script over the wire | 408 kB, all before anything ran | 424 kB: 5 kB first, the rest beside the robot check |

A place's page shows in about 0.25 s, with no script at all. Real visitors' numbers are in Cloudflare
Web Analytics (its Core Web Vitals) and, once enough people visit, Search Console's Core Web Vitals
report.

### Link cards and icons

`npm run drive-site-images` (`scripts/drive-site-images.mjs`) draws them into `drive/public/`:
`og/world-drive.png` (1200 × 630, the card for the home page and a party's link: the name, the line
under it and the muscle car driving over the curve of the Earth, all drawn, no Google imagery),
`og/<slug>.png` for each place, `favicon.svg`, `favicon.ico` (16, 32 and 48 px), `apple-touch-icon.png`
and the manifest's icons (`site.webmanifest`). Run it after adding a place, with Playwright, as the
tests run (it starts the dev server on `TEST_VITE_PORT`). A party's **Share** says where you're
driving ("Drive with me at Monaco harbour in World Drive"), and its link unfurls with the card.

The Moon's cards are pictures of World Drive's own Moon (NASA's data, drawn by the game, so nothing
of Google's), drawn only when asked for: `npm run drive-site-images -- moon` draws `og/moon.png`
(the Moon from space, as the globe shows it once turned there) and `og/moon-<slug>.png` for each
Moon page; `-- moon tycho plato` just those, `-- moon hub` just the Moon's own. For each it opens
the place's link in a page the card's size, with a ride picked (`world-drive.vehicle`: the go-kart
or the muscle car) and the boost pads off, drops in, turns the ride to the camera and lets it settle
on the ground that way, then holds it and the camera still (the driver's update and the field of
view taken over), frames them, waits until the Moon's ground has nothing more to build round the
camera and the ride, and photographs the 3D view with everything over it hidden; the words go over
it in the same style as the other cards (`MOON_SHOTS` in the script says which ride and which way
for each). At Tycho, Aristarchus and Plato, where the Earth is low enough in the sky (56° at most)
to share a picture with the ground, the camera looks toward it, so it's on the card where it really
is; elsewhere (where it's higher, or where looking at it would be looking into the sun, as at
Taurus-Littrow, or on the far side) the camera looks across the sun, which is from the south-west,
at the ride on the ground. Where
looking up toward the Earth would put the camera under the ground, the ride and the camera go up
together, as in a jump. Each is a palette PNG under 200 kB. In Chromium's software renderer a
drop-in takes 15 to 30 s and the ground's building round the camera a minute or two more, so all
thirteen take about half an hour.

### How the search pages are tested

`npm run test:drive-seo` builds the site and serves it as Cloudflare does. A page marked `noindex`
(the owner's `/admin.html`) is in the build but isn't one of the public pages it checks: it's
checked to be `noindex, nofollow` and out of the sitemap. For the public pages: every page's title
and description (each its own), canonical address, Open Graph and Twitter tags and card (a 1200 ×
630 PNG that's there, under 250 kB; the Moon's own), structured data (valid JSON, Google's fields,
no ratings, breadcrumbs that lead to real pages, and on the Moon's pages World Drive › The Moon and
no `GeoCoordinates`), one heading and words of its own on each place's page and each Moon page (the
Moon's saying where they are on it, that the small craters are made up and that there are no
landers, flags or rover tracks, with their Drive here to their spot on the Moon, and links to the
others, `/moon/`, `/drive/` and home); the Moon among each Earth place's others, and on `/drive/`;
the sitemap (every public page, nothing else, real addresses, dates) and robots.txt (and with no
date known, as from a shallow clone, no `lastmod` rather than a wrong one); the icons and the
manifest; every link within the site answering 200, and the Moon's `height.bin` and `colour.webp`
still served whole beside its pages; the home page's words (over 350 of them, the Moon in its head
and its questions, the places and the Moon's linked, shown on the panel, About opening from there, a
tap on a place there flying the globe to it and a tap on a Moon place turning the globe to the Moon
and pinning it, without leaving the page); the home page in a browser without WebGL (the panel's
words shown with the line on why there's no globe, no visit and no game's code asked for, no
errors, on a computer and a phone); each place's **Drive here** opening the game on the test globe
with its pin there and the address tidied, Tycho's page's opening it on the Moon with Tycho pinned,
a drop-in from a link, the pin clear of the sheet on a phone, a `?party=` kept, a rude name or a
place off the Earth refused; the dev server making the same pages, the Moon's included, and passing
the Moon's files on; and the load above on a phone's connection (the first paint is the largest,
under 2.5 s, before the game's code).

### The owner's steps

The domain is verified in Google Search Console already (a DNS record).

1. **Search Console → Sitemaps**: submit `https://worlddrive.app/sitemap.xml`.
2. **URL Inspection**: inspect `https://worlddrive.app/`, **Test live URL** (it should be "URL is
   available to Google", with the page's words in the rendered HTML), then **Request indexing**; the
   same for `/drive/`, `/moon/` and a few places' pages. There's a daily limit on requests: a handful is enough,
   as the sitemap and the links bring the rest.
3. **Pages** (Indexing → Pages) over the next weeks: what's indexed, and why anything isn't. A new
   domain takes days to weeks.
4. **Bing Webmaster Tools**: add the site by importing it from Search Console, and submit the sitemap
   there too (Bing's results also show in DuckDuckGo and Yahoo).

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
  driving with others), as `scripts/test-drive-levels-ui.mjs` does, and `window.worldDriveStatsTest
  = { visit }` one for the [play stats](#play-stats) alone, as `scripts/test-drive-ui.mjs` does.
- In the browser console, `window.drive` has the scene, the globe, the driver and `dropIn( { name,
  lat, lon } )`, levels' `progress` (`progress.level`, `progress.progress`, what's `unsent` and the
  report on its way, `flying`) and
  `profile`, the play stats' `stats` (`stats.counts`, what's counted and not posted yet), and with
  driving with others on, `live`, `ghosts` and `friends`.

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
supporter, the ⭐, the owner's SQL, and buying off without its settings; [usernames and
passwords](#how-usernames-and-passwords-are-tested) (all that's listed there); and the [play
stats](#play-stats): each metric's keys checked and held to a post's most, `MAX_COUNTS`, and the
admin page's answer with the facts from the leaderboard's and the pass's tables, refunds left out,
the period before added up, the totals and the tidying after two years), and `npm run test:drive-ui`
(the page in Chromium without a key: the globe and panel, search on Enter, spots, pins, dropping in
and driving, the play stats it posts (the funnel once a visit, the device, searches by kind and
never what was typed, play time, a drop-in's time and one left for the globe), stunts (a wall throwing the kart into the air and never through it, a backflip landed
for points, the DRIFT button), changing ride, M and teleporting again without a reload, recent
places, a phone with touch buttons, boosting flat out going supersonic in each free ride (the boom,
the streaks, the tag and the wider view, and its end as it slows), boost pads on the test pad (off
until the pause menu's switch turns them on, kept across a reload, and off again; put down as it
drives, never on a roof, a car, a shelter or a slope nor from high up, moved onto sharper ground, a
small one's 12 % and a big one's fill, dark then lit again, left lit with a full gauge, recycled;
each test that needs them switches them on), water (the test pad's sea given one even sea colour,
as Google draws water, driven on as on the ground: off its edge at speed and slowly, down onto its
surface and on across it, never sinking, splashing or put back; off a ramp, a spin landed on it
scoring; slowly down a beach, out across the sea and back up onto the land; flown out and let down
onto it; R on it and by it putting it a few metres on, on the water; paused out on it and driven
on, sending others no splash or spray; boost pads never on it or by it; Google's other water
colours, a bluish lawn among ball fields and a lagoon's turquoise; a canal's water by its wall
never taken for dry), the open sea and the big lakes (the pad lowered under the water's surface,
as Google draws the bed: started on the sea's surface or Lake Baikal's, ridden on, flown over and
come down on, no boost pads on it, a floating ride's spray, from an island out across it and back
onto the island; 14 m under the sea, on Google's water as before; the Dead Sea's shore, land, never;
the map's sea, coasts, lakes and land; land walled off from the sea by ground over it, the side
of the Assal depression, never; Lake Erie's surface gone out over land to Niagara's gorge and back
by the lake; driven and flown out from a coast over a bed sloping under the sea in the sea's
colours, the sea's surface laid before the kart is under it (by the frame loop's own look too, with
houses behind the beach, and reversing out, and driven and flown past moored boats, between two
jetties and through a marina), its look round the bed spread over frames (never more than 12 rays
in one, all down, nor more than one first ray into new ground made slow as a tile's, with tiles 25,
15 or 10 m across) and carried on till it's known (laid in time at 100 and 300 km/h and 20 frames a
second too), but not over ground coloured as sand or with no picture, nor in Death Valley's square,
nor with the kart in a hollow under it, and a big lake's only over its bed 15 m under it; New
Orleans' streets under the sea behind its levee, among houses, driven into, flown over and started
in, never, nor beside someone flying over them, even with the surface already laid; Go to beside a
driver out on the sea's surface, or hopping, flying or rolled onto their side over it (beside them
at their height), in the scene and by a drop-in, on it with them; with the surface laid, beside
someone flying over Lake Baikal's shelf, a sandy bed or the bed between a harbour's moles, on it
with them, and by a drop-in from 12 km off over that shelf too, and over its shelf in a square its
shore crosses, in the scene and by a drop-in from 24 km off, but not between moles a street's width
apart nor over a hollow inland, nor two or four squares from the lake's (laid in its own square or
the shore square); with the sea laid off Santa Monica, by a drop-in beside someone flying over a
sandbank 14 km off, on it, but over a field under the sea in New Orleans, on the field; with none
laid, beside someone riding on a surface of their own over Baikal's shelf, a sandy bed or an inlet,
from the globe, or over a sandy bed 2 m down in the scene, on it with them, but not beside one on a
levee at the sea's height, one in the air at that height, nor one riding over New Orleans' street,
there or 25 m from a crossing, nor, with its houses' fronts 20 m apart, one riding or flying over
its street where a bearing threads between them past every ray down, nor, with a boulevard 49 m
across it, one riding or flying over the street where it meets it, where five bearings thread
between the houses past every ray down and along them (but, as a known limit, with the two houses
facing each other across a street by it left empty, beside one riding by them, there and from the
globe, on it with them), nor, laid out more sparsely, one riding or flying over its street, there or
from the globe (though flown over it, the frame loop's look lays it); without the map, only the deep
sea), the used-up, robot-check and getting-ready screens, the visit asked for only once the game's
code is here (a download that fails, and its Try again, spend none; a script that breaks is told
from a dropped
connection, and logged), a Turnstile script that never comes ending on the robot check's screen at
its deadline (and Try again asking for it afresh), a place's link kept in the address until Google's
root has come, and the leaderboard with its answers made in the test: tabs, your own row, picking a
name and renaming, a landed jump posting the run with the card asking first, each place's best posted, a dead connection
changing nothing, and a phone; and buying the pass with Google's script stood in for: signing in
from the sheet, the pause menu and the used-up screen, Buy's link, "Check again" before Stripe's
word, unlocking on focus and on `?supporter=thanks`, on every load, signing out, the player linked,
the ⭐, and "Coming soon" with no sign-in or no Worker answering). `npm run test:drive-pro-ui` tries
the pass's rides, the Garage and the boost styles, `npm run test:drive-seo` what
[search engines](#how-the-search-pages-are-tested) see, `npm run test:drive-live` and
`npm run test:drive-live-ui` [driving with others](#how-its-tested), `npm run test:drive-levels`
and `npm run test:drive-levels-ui` [levels](#how-levels-are-tested), and `npm run test:drive-moon-ui`
[the Moon](#how-the-moon-is-tested). The UI tests drive the go-kart unless a test picks another (the
pickup, the default, is 219,000 triangles, about a frame a second in Chromium's software renderer);
`npm run test:drive-ui` checks the pickup is the default, and that the go-kart takes over if its
model doesn't load. `TEST_VITE_PORT` picks a test's port,
and `TEST_VITE_CACHE` a folder for its dev server's pre-bundled dependencies (else
`node_modules/.vite`), so tests run side by side on one checkout don't redo each other's.

## How it fits together

```
drive/index.html             the page: panel (and what World Drive is, at its foot), pin card,
                             driving bar, keys card, screens; its head for search engines
src/drive-app/boot.js        the page's first script: WebGL looked for (without it, the panel's
                             words), the splash, /api/config and the robot check while main.js
                             loads, then the visit
src/drive-app/main.js        the game: the tiles, modes (globe, dropping, driving, paused), a
                             place's link, dropping in, recentring, the render loop
drive/site/                  the places' pages, /drive/ and /sitemap.xml (build.js, a Vite plugin;
                             places.js their words; site.css their look)
src/drive-app/globe.js       GlobeView: GlobeControls, the slow spin, flights, the pin, picking
src/drive-app/spawn.js       Ground: the ground's height, which way the street runs, a bridge's deck
src/drive-app/panel.js       search, spots, recent places, the ride picker, the pin's card
src/drive-app/places.js      the start spots, typed coordinates, a place's link, recent places
src/drive-app/vehicles.js    the go-kart, the library trucks (catalog.js lists which), the cars and the
                             pass's rides; what's locked (rideLocked) and its chip
src/drive-app/cars.js        the cars (drive/public/cars/): names, tuning, which need the pass; loading
                             one with its wheels turning, its body leaning, its paint and decals
src/drive-app/rides/         the Supporter Pass's rides, built in code, and parts.js they're built from
src/drive-app/pro.js         whether this visitor has the Supporter Pass (off until payments say so)
src/drive-app/pass.js        the Supporter Pass sheet and its badge
src/drive-app/supporter.js   buying it: Google sign-in, the Payment Link, unlocking, the pause menu's
                             account line
src/drive-app/ads.js         Google's ad on the globe (AdSense), a chunk of its own (ads.css its
                             look) loaded only when /api/config has a publisher id, for someone
                             without the pass, once the globe is up and the browser idle
src/drive-app/account.js     the account panel, a chunk of its own loaded when it's opened
                             (account.css its look): signing in or up with a username and password,
                             changing it, linking Google; password-rules.js the rules for usernames
                             and passwords the page and the Worker share
src/drive-app/garage.js      the Garage: choices and the turntable; paint.js the looks and decals;
                             boosts.js the boost styles it offers; underglow.js the glow under a
                             ride; horns.js the horns' sounds and the Horn sounds switch
src/drive-app/pads.js        boost pads: where they go, driving over them, the pause menu's switch
src/drive-app/screen-fx.js   what's done to the view: speed lines, overdrive's white edges, the pause
                             menu's Camera effects switch and asking for less motion
src/drive-app/water.js       water on Google's mesh, told by how it's drawn: for the hovercraft's
                             spray and to keep boost pads off it; and dry land's colours, kept
                             from under the open sea's surface
src/drive-app/sea.js         the open sea: its surface where Google draws only the bed of the sea
                             or a big lake (laid for a drop-in there, or as main.js's watchSea
                             finds it out from a coast), round the vehicle while it's by that
                             water, the sea's height (EGM96, drive/public/sea/egm96.bin, which
                             scripts/make-sea-level.mjs makes) and where the sea and the big lakes
                             are (Natural Earth's, drive/public/sea/mask.bin, which
                             scripts/make-sea-mask.mjs makes)
src/drive-app/lakes.js       the big lakes whose beds Google may draw: their surfaces' heights,
                             with sources, and their outlines' names in Natural Earth
src/drive-app/moon.js        the Moon: its ground's quadtree of squares, their look, its stars and
                             the Earth in its sky; moon-height.js its ground's height anywhere (LOLA's
                             heights, drive/public/moon/height.bin, and the made-up craters);
                             moon-places.js its spots and the places its search finds. Its picture
                             is drive/public/moon/colour.webp; scripts/make-moon.mjs makes both files
src/drive-app/api.js         /api/config, the visit with Turnstile, /api/search, the leaderboard's and
                             the Supporter Pass's calls
src/drive-app/leaderboard.js the leaderboard: the panel, names, posting runs, the new-best card
src/drive-app/challenges.js  challenges in the page, a chunk of its own loaded when they're opened
                             (challenges.css its look): the list and boards, a run (its gates and
                             items, countdown, timer and arrow), the finish card and posting the
                             time; challenge-rules.js what the page and the Worker share: the
                             periods, laying a route out, checking a time; challenge-ghost.js
                             recording a run and racing a ghost; ghost-rules.js what the page and
                             the Worker share of ghosts: packing, the ghost's frame, its checks;
                             with sharing a link and a friend's link's card (challenges.js)
src/drive-app/levels.js      levels' rules, which the page and the Worker share: XP, the curve, the
                             caps and the unlock track (looks, cars, titles, badges); what a ride needs
src/drive-app/progress.js    levels in the page: counting what's driven, reporting it (or keeping it
                             here before a nickname), the level the Garage's locks follow
src/drive-app/profile.js     what levels show: the XP bar and pop-ups, a level-up, the profile card,
                             the whole track (levels.css)
src/drive-app/achievement-rules.js  achievements' rules, which the page and the Worker share: the
                             list, the counts and their day's caps, the construction rides each
                             unlocks; feats.js the achievements this visitor has (the rides' locks)
src/drive-app/achievements.js  the Achievements grid, a chunk of its own loaded when it's opened
                             (achievements.css its look)
src/drive-app/works.js       the construction rides: names, words and tuning (their models the
                             library's, catalog.js's WORKS_RIDES; pictures in drive/public/works/)
src/drive-app/live-protocol.js  driving with others: the rooms, messages, limits and checks the page
                             and the Worker share, and who's driving now's dots (where, how many)
src/drive-app/live.js        the page's connection to its room: which room, sending the car, what
                             the room says
src/drive-app/ghosts.js      the others' cars, their name tags and effects
src/drive-app/friends.js     the chip and list, Drive with friends, the party's banner and toasts,
                             the horn (each driver's, horns.js)
src/drive-app/online.js      who's driving now on the globe: /api/online, the dots, Driving now
src/drive-app/screens.js     start screen, notices, loading card, pause, keys, messages
src/drive-app/test-globe.js  the Earth without Google's tiles, for working without a key
src/drive-app/stats.js       the play stats in the page: counting, posting with the visit's token;
                             stats-protocol.js what may be counted (the page and the Worker share
                             it); dropin-cells.js the grid drop-in places are counted by
drive/public/admin.html      the owner's page: the play stats, where people drop in (its maps
                             drawn from /sea/mask.bin and /moon/colour.webp), the challenges and
                             how many players have each achievement
vite.drive.config.js         the build: no key, only the offered vehicles copied from public/, and
                             drive/public/ (the cars) as its own public folder; in dev, /api passed
                             on to DRIVE_API, WebSockets too
drive/public/cars/           the cars' models, pictures, cars.json and CREDITS.md
scripts/add-drive-car.mjs    imports a car from Sketchfab into it; drive-car-thumbs.mjs draws the pictures
                             (--works: the construction rides', into drive/public/works/)
drive/public/                also robots.txt, site.webmanifest, the icons and og/ (the link cards,
                             which scripts/drive-site-images.mjs draws with the icons), and
                             places/towns.tsv (Natural Earth's towns, which scripts/make-towns.mjs
                             makes) that drop-in places are named by
worker/drive/                the Worker: index.js (routes), limits.js (caps, the search queue and
                             the leaderboard's turns), turnstile.js, search.js; the leaderboard:
                             players.js, scores.js, boards.js, names.js (rules and the filter),
                             visits.js (visit tokens), settings.js (settings, AdSense's ids
                             checked; index.js answers /ads.txt); the Supporter Pass: accounts.js (sign-in,
                             sessions, /api/me), logins.js (usernames and passwords, linking
                             Google), supporter.js (the webhook, who has it); driving
                             with others: live.js (/api/live and the rooms, DriveRoom, and
                             /api/online, who's driving now); levels: progress.js
                             (/api/progress, titles); achievements: achievements.js
                             (/api/achievements, what's earned and where, a construction ride's
                             check); the owner's page: stats.js (the play stats),
                             dropins.js (where people drop in), admin.js (who may see them, how
                             often); challenges.js (picking and fixing them, their boards, times
                             and ghosts, a friend's link and its page's preview card, the owner's
                             choices); migrations/ (its D1 tables)
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

- [Achievements](#achievements-and-rewards) the page counts (km, Moon drives, Garage changes,
  rides tried) are its word, held to a day's worth each: a script reporting the most the caps allow
  earns the 1,000 km in two days and the wheel loader's 100 km on the second report after the claim,
  not in one go. What a script can have on its first day: the skid steer (10 km, its claim's 25 km
  can give it), the concrete mixer (a first challenge time, which the challenges' checks of a run's
  passes make a real drive) and, from a party, the road roller; the telehandler needs three days the
  Worker sees, the others more driving, more days or places on boards. A party counts another
  player, so one person with two nicknames in two tabs can still earn the party ones (each a
  nickname the leaderboard's daily cap allows, and party 10 needs ten parties). A construction ride
  can be driven alone by a page changed to unlock it (as the pass's can): only where it would show
  to others is it checked. Boards finished before achievements have no placings until the owner
  writes them ([Looking after it](#achievements-and-rewards)).
- Challenges on the Earth are laid out without seeing its streets (Google's tiles have none in
  them): a gate can be among buildings with no street to it, or a sprint lead off the road it began
  on; its zone is wide and every ride can fly, but such a route is slower by the streets than by the
  air. The time check is on straight lines at 430 km/h, three or four times a good driver's speed in
  a city, so a made-up time that fits it gets through: the owner looks after the boards
  ([Looking after them](#looking-after-them)).
- On the Moon, driving with others has a budget of its own (see [there](#driving-with-others-on-the-moon)),
  so the Free plan's 100,000 a day are shared three ways: the Earth's rooms, the Moon's and the rest. Its shapes
  are the real Moon's only down to a few kilometres; every crater smaller than about 20 km across
  that you drive in is made up. Nothing casts a shadow there: a crater's far wall is darker for
  facing away from the sun, but its floor isn't in its rim's shade. As on the Earth the scene isn't
  recentred while driving, and the Moon curves away four times as fast: 10 km from the drop-in the
  ground is 29 m lower and gravity 0.33° off true. Driving fast enough (in overdrive), the vehicle
  can outrun the finest squares being built (5 ms a frame), and drives on the next size up (a point
  every 2.6 m) until they catch up.

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
  water to it (Santa Monica Bay's was, 184 m down, and Baikal's), but not always (20 km off Waikiki,
  578 m down, it was dry ground, so boost pads could go down on it there). Close in, by a coast,
  it's mostly Google's own water, at the water's height; but a tap on the sea within a kilometre or
  so of a beach can find the bed there less than 15 m under it (7.6 m, 500 m off Santa Monica Pier),
  and starts on that, under the water. Started on a bed more than 1.5 m under the water's height,
  you're too low for the water's surface to be laid as you drive on
  ([out from a coast](#out-from-a-coast)): it would be over you, so you drive on along the bed. (Go
  to or Join beside someone out on that surface, or in the air over it, is the exception: you're put
  on it with them, though not everywhere: below.) The other way, land more than 15 m under the sea
  in a coast's square with nothing over the sea's height within 150 m of it (the middle of a wide
  pit dug by a coast) would still start on the sea's surface.
- Driven or flown out from a coast ([out from a coast](#out-from-a-coast)), the sea's surface is
  laid where the ground is more than 1.5 m under its height, not coloured as dry land and open to
  the water round it, which doesn't tell the bed from Google's own water more than 1.5 m under
  EGM96's sea (its pictures taken with the tide out, or EGM96 high: up to 3.9 m, by Lake Maracaibo):
  come at that from higher ground and the sea's surface is laid over it, that far over Google's
  water; driven on from on that water, it's left as it is. Nor does it tell the bed from ground
  under the sea in a coast's square that's open and not coloured as land 150 m round on a quarter of
  the way or more, with nothing standing over the water's height on it (a wide car park, an
  airfield's apron or a dry dock's floor behind a levee): the surface is laid over that too, and so
  among houses by such ground. Streets among houses, roofs and trees under the sea behind a levee,
  as New Orleans' are, built as closely as the test pad's, aren't laid over; laid out more sparsely
  (lots 25 to 37 m long, a boulevard 49 m or more across, crossings 46 to 56 m across), flown over
  or driven along at the water's height they are at some spots (on the test pad, 6 to 617 of 6,200
  to 7,300 a town, 1,152 of the 90,334 spots of fourteen towns, and on every street of four of them
  at its first crossing; in a 2D model of random suburbs, 0.9 % of the spots with 3 to 8 m between
  houses, 14 % with 16 to 20 m; and driven off a levee toward them at 30 km/h, from 82 of 2,807 and
  60 of 2,298 starts by two of fourteen towns), as this look has its rays down alone: rays along the
  ground, as beside another driver, would close the way out from a harbour too, past moored boats or
  between two jetties ([out from a coast](#out-from-a-coast)). That was tried only on the test pad's
  boxes, grey all over, not on Google's tiles, where houses, trees and levees are lumps of mesh and
  lawns and roofs have colours of their own. Where Google draws the bed closed in on most sides
  itself (an inlet or a harbour mouth less than about 90° wide within 150 m of its sides, right by a
  pier with a breakwater on the other side, between two jetties 70 or 100 m apart or two islands 100
  m apart either side of the way out, and in more than half the runs under a bridge's deck across
  it), it isn't laid there, as before the ninth change and since; driven on down that bed with none
  laid you're soon more than 1.5 m under the water's height, too low for it, and drive on along the
  bed. On a bed sloping more gently than 1 in 40 you can be up to 1.5 m under the surface when it's
  laid, and are lifted onto it in a frame. Out from a big lake's shore the bed is followed down as
  before till a square of the map that's all the lake (up to about 5 km out), and there the lake's
  surface is only laid over a bed more than 15 m under it with you no more than 1.5 m under it:
  flown out and let down, it is; driven out along a bed sloping down from the shore (off Chicago,
  above), you're under it by then, and drive on along the bed. Once it's laid it covers a polder's
  streets within its reach too (below): Go to or Join beside someone riding on it there puts you on
  the streets under them where it isn't laid in your scene, as the houses close them in (by rays
  down, along each bearing and between them out to 75 m round), and on it where it is (beside
  someone flying over those streets, though, it's a drop-in beside them, onto the street; and beside
  someone riding on it over a polder's open fields in a coast's square, on it with them: next). The
  look round a spot to see that it's open is spread over frames, at most 12 rays and about 4 ms a
  frame, and carried on till it's known; on Google's tiles its rays may be the first into dozens of
  tiles, so it may be known open a second or more after it's first looked at (as a model, if all 96
  of its rays down were needed, falling on 85 tiles none had reached, 85 frames: over 4 s at 20
  frames a second), and if you're more than 1.5 m under the water by then it isn't laid. Each ray
  down builds one tile's hierarchy at most where tiles' bounds don't reach past each other, two
  where it falls on two tiles' edge, and as emulated with each tile's box reaching 3 m past its
  neighbours' (as Google's, each in its own mesh's frame, may) up to four in a frame from the look's
  rays, frames of up to 160 ms with each build 20 ms, all as before 12 November 2026's ninth change;
  the rays under the vehicle and ahead that find the spot, outside its share, build up to two more
  as a look begins. Holding the look's rays to one a frame was tried, and with the boxes reaching
  past each other it was then never laid, driven ([out from a coast](#out-from-a-coast)). Its rays
  reach the tiles 3d-tiles-renderer keeps active out of the camera's view (the siblings of those in
  view, at every level: [out from a coast](#out-from-a-coast)), not only those in view; but out
  there they're coarser the farther they are from the tiles in view, so a bearing out of view (on a
  phone held upright, about 36° across while driving, 46 to 62 of the 96 rays' places, as modelled)
  is looked along on ground drawn with less detail, its levees, quays and houses smoothed, which may
  find it clear where finer tiles wouldn't, or the other way. None of it was tried on Google's
  tiles.
- Go to or Join beside someone over the water ([beside another driver](#out-from-a-coast)) goes by
  what can be seen of the ground under them and of their car, which doesn't always say what it is.
  With none of that water's surface laid in your scene, it's laid for you where the look above would
  lay it afresh, with the rays along each bearing and between them as well (which close a marina's
  fairway or the water between two jetties 50 or 80 m apart, as below), or where they're riding on a
  surface of their own: their wheels on something at the water's height to within 0.5 m, with
  Google's ground under their car and beside them more than 1.5 m under it, and that ground not
  built up, told by heights alone within 75 m (below). So beside someone flying over a big lake's
  shelf less than 15 m under it, a bed coloured as sand or one closed in on most sides (an inlet, a
  harbour's mouth), with none of yours laid (from the globe, from the Moon, or with none laid where
  you are), you start on that bed under the water, as a pin there does, and stay on it; and so
  beside someone riding on it there who's driven more than 34 km from where they dropped in (45 km
  at mid-latitudes: their surface, laid as if the Earth were a sphere, can then be more than 0.5 m
  off the water's height as it's worked out here), leaning more than 0.5 m on their springs (the bus
  braking flat out), or in a hop off it as you join. Beside someone riding on it over open ground
  under the water's height that isn't built up (a polder's fields or a park, in a coast's square),
  you start on it over that ground, as they're driving on it there, and so among a town's houses by
  such ground where a quarter of the way round is open onto it (on the test pad, by its town's open
  ground, at 285 of the 1,260 spots of its outer blocks; with a dyke round it 75 m past its last
  houses instead, at 5 of its houses' 4,806, where its streets end by the ground before the dyke);
  in a channel less than about 130 m wide between banks or moles standing over the water you may
  start on its bed under them (in one 60 m wide or narrower, always: [beside another
  driver](#out-from-a-coast)), put on it in your scene where Google draws it less than about 3 m
  under them, and otherwise by a drop-in onto it; and a thin thing under their car that your tiles
  don't show (a pier's deck) has you start on the water beside it. With yours laid (in your scene;
  for a drop-in, over the same big lake when you left, or the sea within reach of yours as it's laid
  then), you're put on it under someone flying over that water (its squares on the map; a big lake's
  own and those its shore crosses) wherever the ground under them isn't built up, told by heights
  alone within 75 m. Built up or not, by heights alone, gets three things wrong, for both: open
  ground under the water's height with nothing standing on it that near (a polder's fields, a park,
  a wide car park behind a levee) gets the surface over it, as you'd drive on it there, and so do
  houses by such ground nearly as wide as the reach (a boulevard, a square or a park 70 m or more
  across) or where houses are left out along a line (below); a channel less than about 130 m wide
  between banks or moles standing over the water is closed in over some or all of it, as a street
  among houses is, so beside someone flying over that it's a drop-in, which starts on its bed if
  Google draws that more than 1.5 m under the water (water that narrow it mostly draws as water, at
  its height); and houses whose roofs stand less than 2 m over the water (lower houses, or a town
  deeper under it) are told by the rays down alone, which a bearing can thread past between houses
  (as at 60 of the 3,546 spots inside the test pad's town, its roofs 3.5 m over the water, before
  the ray along each bearing), while boats taller than that, moored close together either side of a
  fairway, close it in as houses do. Tried on the test pad's boxes, the rays along each bearing and
  between them 2 m over the water closed every spot among the houses of fifteen towns (the test
  pad's, four laid out a little differently, lots up to 37 m long, crossings up to 56 m across and
  boulevards up to 64 m), though not where houses are left out along a line (a boulevard 40 to 50 m
  wide at a slant, two crossing, a plaza by one or by a crossing, or a lot left empty either side of
  a street by one or by a crossing 37 to 56 m across: 3 to 379 of 6,000 to 7,500 spots a town; in
  the 2D model, with a fifth to three tenths of the lots left empty where houses stand 3 to 8 m
  apart, 294 to 493 of about 200,000: [built up](#out-from-a-coast); rays along out to 100 m would
  close those, but also a channel 120 m wide at 20 of its 29 open spots, and so it stays 75 m);
  between two jetties 50 or 80 m apart, or in a marina's fairway, it's closed in as a street is, and
  you start on the bed under them; and they didn't meet water drawn a metre over the sea's height
  with bumps of a quarter of a metre (Google's stands within a metre or so of it by most coasts;
  where it stands more than that over it, the rays down close those bearings anyway: [beside another
  driver](#out-from-a-coast)); on Google's tiles, where houses, trees and boats are lumps of mesh,
  it wasn't tried. A big lake's shore squares are only as near as the map can say: its bays and
  straits narrower than two squares (0.3 % of Baikal's water to 6.6 % of Onega's) aren't its water
  to this, so beside someone flying over a shelf there it's a drop-in, onto the shelf; and they take
  in what's under its height on land within a square of its own (a marsh by its shore, the upper
  Niagara at Buffalo below Lake Erie's outlet, at about its height). In your scene it looks at the
  tiles round them as they are, coarser the farther off they are (up to 10 km), where houses and
  levees may be smoothed away; and none of it was tried on Google's tiles, where they're lumps of
  mesh.
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
  ship it can't tell water from an even grey square. What it misses only matters for the
  hovercraft's spray (none there) and boost pads: where it can't tell it never puts them down, but
  surf's foam is bright, so it's taken for dry ground, and pads can go down on a wide band of surf.
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
  nickname removed by the owner takes its XP with it. A level's car is locked only in the page, as
  the pass's are: a run in one is taken on the leaderboard at any level.
- [Where people drop in](#where-people-drop-in): a place is the page's word, so a script with many
  addresses, each passing the robot check each day (and on the Earth each spending one of the day's
  drives), can still push a place up the table (one count a day for each address and visit); `days`
  shows a place busy on one day only. Everyone behind one address (a home, a school, a phone network
  sharing addresses) counts once a day at a place, so a busy start spot's count there is low beside
  its `dropin` count in the play stats. The owner's own drop-ins aren't counted as places at all
  (their visits' tokens say they're the owner's), so what the owner tries out isn't seen there; their
  play stats are counted as anyone's. A visit's
  places past its 10 aren't counted, so a long party's later drop-ins are left out. Natural Earth's
  towns are sparse in places, so a place is named by the nearest of them, which isn't always the
  nearest town. The base map is the game's own, squares of about 5 km on the Earth and pixels of
  about 2.7 km on the Moon, so it's zoomed no closer than 150 km across: Drive is how to see the
  streets. A start spot's row is on at least as many days as its busiest cell, maybe more. The map
  has a period's 2,000 busiest cells; with both worlds at their day's cap every day for a year, a
  year-long look reads 1.1 million D1 rows. An answer is kept for an hour in the Worker instance that
  worked it out, so looking again costs nothing, but four year-long looks in a day, each worked out
  afresh (an hour apart, or in different Worker instances), would read most of a Free day's rows;
  [What it costs](#what-it-costs-1) says why that's left so. Visitors behind one IPv6 /48 (a site's,
  or many phones of one network's) count once a day at a place, as those behind one IPv4 address do.
- [The cars](#world-drives-cars): the importer turns a car's wheels, not what steers them, so the
  tuk-tuk's handlebars and the golf cart's and the lawn tractor's steering wheels stay still while
  their front wheels steer. The tuk-tuk's green panels are small, so the Garage's stripes and number
  on it are small too. The two with painted windows, the cyber muscle car with a picture drawn
  on its glass and the hypercar with no inside look from their bonnet rather than their seat.
- [How boosting and driving look](#how-boosting-and-driving-look): the lean tilts the whole model,
  wheels and all, about the low side's axle, so on a steep lean a wheel on the other side lifts a
  few centimetres off the road (a kart, which has no suspension, leans as a car would). The bursts
  fade out down to a flat plane under the vehicle, so where the ground isn't flat round it (a kerb,
  a crest) one can still meet the ground along a line, and in the air they don't fade at all. The jolts
  move the view (the look, never the camera, so a jolt can't put it in a wall), and a jolt from the
  booster lighting right after a hit's shake adds to it. Others' cars show only what their flags
  say: no boost pad bursts or wheelspin, and a booster already lit when their car comes into view
  shows no ignition. The exhaust is where the vehicle's size puts it, not found on the model: in
  the middle of the back a third of the way up, not at the model's own exhaust pipe if it has one
  (the ice-cream van's flame comes out of its back doors).

## Credits

The 3D world is Google's: the Google Maps logo and the data providers show whenever the tiles are on
screen. The Moon's heights and pictures are NASA's (public domain), from the Lunar Reconnaissance
Orbiter's laser altimeter (LOLA) and wide-angle camera (LROC), as NASA's Scientific Visualization
Studio's CGI Moon Kit has them (https://svs.gsfc.nasa.gov/4720/), credited under **About World Drive**
and in the corner while you're there. The open sea's height is NGA's EGM96 geoid (public domain), from PROJ's copy of it, and
where the sea and the big lakes are is Natural Earth's ocean and lakes at 1:10 million (public
domain, naturalearthdata.com), from its GitHub copy, as are the towns the owner's map of where
people drop in names places by (its populated places). Place search © OpenStreetMap contributors. The
trucks and the cars are models from Sketchfab under CC BY 4.0, credited under **About World Drive**
and on the ride picker (and the cars in `drive/public/cars/CREDITS.md`): the muscle car by Lexyc16,
the golf cart by pixelsquare, the tuk-tuk by aminzafar, the ice-cream van by Sidra, the lawn tractor
by mirrol, the retro wedge by Serg_Stark... (Serg_str), the formula racer by TimMod, the neon racer
and the night cruiser by ferofluid, the dune buggy by XP_Frost, the farm truck by Nekitron, the
police cruiser by JG3D, the hypercar by ollitei and the cyber muscle car by Jungle Jim. The go-kart
and the pass's rides are built in code. The link cards (`drive/public/og/`) show the muscle car,
drawn as World Drive draws it, on an Earth drawn in CSS: no picture of Google's tiles is used outside
the map itself.
