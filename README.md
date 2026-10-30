# Neptune Terminals digital twin

A web app you can walk around in. It shows Neptune Terminals in North Vancouver using
Google's photorealistic 3D map, and you can drop your own detailed models on top of it.

- **Base layer:** [Google Photorealistic 3D Tiles](https://developers.google.com/maps/documentation/tile/3d-tiles),
  streamed with [3d-tiles-renderer](https://github.com/NASA-AMMOS/3DTilesRendererJS) and three.js.
  It covers the whole terminal, the berths, Burrard Inlet and the North Shore mountains.
- **Your models:** any `.glb` / `.gltf` file, placed by east/north metres from the terminal centre.
- **Controls:** first-person walking with gravity and collisions, or flying. Walls, buildings and
  models stop you either way, with a small bounce, and the view turns along a wall you hit head-on.
- **Site planning:** a library of vehicles, construction equipment and site pieces at real scale,
  laydown areas, excavations and stockpiles with volumes, and machines you can drive.
- **Accounts (optional):** sign in with Google to keep layouts in your account and share them by link,
  hosted on Cloudflare or Vercel.
- **Premium (work in progress, off until set up):** a Pro equipment pack bought once with Stripe.

The same repository also holds a second app, **[World Drive](#world-drive-worlddriveapp)**: pick
anywhere on Earth from a globe and drive it.

The step-by-step plan, with prompts you can paste to Claude, is in [docs/ROADMAP.md](docs/ROADMAP.md).

## Quick start

You need [Node.js](https://nodejs.org) 20.19+ or 22.12+ (the current LTS is fine).

```bash
npm install
```

```bash
npm run dev
```

Open the URL it prints, usually http://localhost:5173. Paste your Google API key when asked,
or click **Continue without Google tiles** to try the controls on flat ground.

To skip the prompt each time, give the app the key through an environment variable named
`GOOGLE_MAPS_API_KEY` (also accepted: `GOOGLE_API`, `VITE_GOOGLE_MAPS_API_KEY`; case doesn't
matter). Either put it in `.env.local` (copy `.env.example`), or set it in your shell or cloud
environment. `npm run dev` and `npm run build` read it when they start. `npm run build` embeds the
key in the built site, so only use a Maps key restricted to your site (see below).

A key pasted into the app is saved in that browser and wins over the environment key it replaced.
If the environment key changes later, the new environment key wins. **H → Change Google API key**
always brings the prompt back.

## Getting a Google API key

1. Go to the [Google Cloud console](https://console.cloud.google.com/) and create a project.
2. Turn on billing. The Map Tiles API has a monthly free allowance, but it still needs a billing account.
   Set a budget alert while you're there.
3. Open **APIs & Services → Library**, search for **Map Tiles API** and enable it.
4. Open **APIs & Services → Credentials → Create credentials → API key**.
5. Restrict the key: under *API restrictions* allow only **Map Tiles API**. Under *Website restrictions*
   add `http://localhost:5173/*` and, later, your hosting site's **origin** with `/*`, for example
   `https://yourname.github.io/*`. Browsers only send the origin to Google, so a restriction that
   includes a path (such as `https://yourname.github.io/neptune-twin/*`) will block the tiles.

The key ends up in the browser, so restricting it is what keeps it safe.

## Controls

The **Controls** panel in the bottom right shows the keys and mouse moves for what you're doing right
now (walking, flying, the library, placing, drawing an area, a selected item, driving, digging) and
changes as you do. Fold it away with its arrow; it stays as a small **Controls** button, and the app
remembers which you chose. On a phone it starts as the button. Above it, the **Show** panel hides
things and switches between before and after (see [Showing and hiding](#showing-and-hiding-the-show-panel)).
**H** (or **All controls** in the panel) shows the full list:

| Moving | |
| --- | --- |
| W A S D / arrows | Move |
| Shift | Run (walk) / faster (fly) |
| F | Switch between walking and flying |
| Space | Jump (walk) / up (fly) |
| E / Q | Up / down (fly); C also goes down |
| Wheel | Zoom toward the point under the cursor, or away from it; Shift for bigger steps. A trackpad's pinch zooms too |
| G | Ghost: walk and fly through walls and buildings, to look inside; G again to bump into them |
| T | Turn the view along walls you run into: on / off |

| Looking | |
| --- | --- |
| Click the map | Capture the mouse to look around (Esc frees it) |
| Right-drag | Look around without capturing the mouse |

| Building | |
| --- | --- |
| L | Library: place vehicles, equipment and site pieces |
| Click a card, then the ground | Place it; Shift+click places another |
| Drag a card onto the map | Place it there |
| R or the wheel | Turn the item you're placing |
| Tools (top of the library) | Laydown area, Excavation, Stockpile, Flatten area: drag a rectangle, or click for the usual size |
| Row (on a card) | Row: draw a line to place many. Click points on the ground, double-click or Enter to finish, or click the first point to close a loop; drag for a straight row. Backspace takes a point back (see [Rows](#rows-many-of-an-item-along-a-line)) |
| Dots on a selected row | Drag one to move that point; drag or click a plus to add one; double-click a dot to take it out |
| Click a placed item | Select it; drag it to move it |
| Round handle | Drag to rotate the selected item; Shift snaps to 15° |
| Square handles | On an area, excavation or stockpile: drag to resize; Shift for any size |
| Arrow in a pit | Drag down to dig deeper, up for shallower |
| Toolbar | The buttons over the selected item: rotate, size (type it in), drive, row (more of it along a line), break apart (a row), edit, hide, delete |
| R / Shift+R | Turn the selected item 15° |
| Delete | Remove the selected item (Undo for 5 seconds) |
| Esc | Cancel placing or drawing / deselect |
| P | Placement panel: exact position, heading and size |

| Driving | |
| --- | --- |
| V | Drive the selected or nearest (within 25 m) vehicle or machine, or a new pickup |
| W / S | Gas / brake (hold S to reverse) |
| A / D | Steer |
| Shift | Boost |
| Space | Hop |
| R | Stuck? Back on the ground a few metres ahead, upright |
| C | Chase or driver's-seat camera |
| Wheel | Chase camera nearer or farther |
| V or Esc | Get out |

| Excavator | |
| --- | --- |
| Space or hold the mouse button | Dig |
| Q / E | Swing |
| R / F or the wheel | Reach |
| X | Dump side |
| W A S D | Drive the tracks |
| C | Operator camera |
| V or Esc | Get out |

| Showing | |
| --- | --- |
| B | Before / after: the site as Google captured it (nothing flattened, dug, piled or placed), or with your changes |
| Show panel | Above the Controls (an eye when folded): hide flatten areas, excavations, stockpiles, laydown areas, shoring in pits, labels, or a whole category such as Vehicles |
| Hide (toolbar) | Hide just the selected item; the Show panel lists it to show again |

| Other | |
| --- | --- |
| H | Help: all the controls |

The wheel zooms like Google Earth: each notch flies a quarter of the way to the point under the
cursor (half with Shift), or back by a third, gliding there in a moment; close to the ground a notch
still moves at least a metre. Zooming while walking switches to flying. Zooming out always climbs, at
least 20° (`minClimb`), tipping the view down to keep the point under the cursor, so from the ground
it rises instead of backing into what's behind you. It stops 1 m short of the
ground, buildings and your models, like flying does (unless ghost is on). Flying gets faster with
height above the ground: as before below 20 m, 16 times faster at 500 m and 30 times at 1 km, so from
up high you cross the terminal in seconds. `ZOOM` and `flyHeight` in [src/config.js](src/config.js)
tune both.

Walk or fly up to a vehicle or machine and a prompt near the bottom says **Press V to drive** it, with
a **Drive** button; the status readout top left always says what V will do.

You start flying over Burrard Inlet, looking north at the terminal. Fly in over the terminal with **W**,
then press **F** to drop to the ground and walk. If you press F over the water you'll stand on the water.

Flying keeps 1 m clear of Google's buildings, the ground and your models, and glides along them
when you meet them at a shallow angle. Fly or run into a wall square on and you bounce back off it,
harder the faster you were going, and the view turns to look along the wall (to whichever side is
nearer where you were looking) instead of into it. In a corner it turns toward the open side, and
it stays put where both ways are shut in or drop away, such as at a site trailer's door. Moving the
mouse during the turn takes the view back. **T** stops the turning (`autoTurn` in `PLAYER` in
[src/config.js](src/config.js) sets it for good, with `flyRadius` for the clearance and `bounce` for
how hard you bounce), and **G** (ghost) lets you through walls on purpose, e.g. to look inside a
building; the status top left says when it's on.

## Adding your own model

1. Export or convert the model to **.glb** (see below).
2. Drag the file onto the page. It appears 20 m in front of you, sitting on the ground. For a `.gltf`
   saved as separate files, drag it together with its `.bin` and texture files (and later copy them
   all into `public/models/`).
3. Press **P**. Line the model up with the Google mesh using *east*, *north*, *heading* and *scale*,
   or walk to where it belongs and click **Move to where I am**.
4. Click **Copy config**, copy the file into `public/models/`, and paste the entry into `MODELS` in
   [src/config.js](src/config.js). It will now load every time.

By default the model is recentred, so *east/north* is the middle of its footprint and *up* is its base.
That stops CAD files with real-world coordinates (UTM eastings in the hundreds of thousands) from
landing kilometres away. Add `recenter: false` to an entry to keep the file's own origin.

**Heading 0** assumes the model's +X axis points east and its +Y (Blender/SketchUp/CAD) points north.
If your model comes in back to front, try heading 180.

### Converting to .glb

| You have | Route |
| --- | --- |
| Blender `.blend`, `.fbx`, `.obj` | Import into [Blender](https://www.blender.org/), then *File → Export → glTF 2.0 (.glb)*. Blender 5 dropped `.dae` (COLLADA); use Blender 4.5 LTS for those |
| SketchUp `.skp` | A glTF exporter extension from the SketchUp Extension Warehouse, or export `.fbx`/`.obj` (SketchUp Pro) and go through Blender |
| Revit `.rvt` / IFC | Export IFC or FBX, then Blender (the free Bonsai add-on reads IFC) |
| AutoCAD `.dwg` | Usually 2D. Ask for a 3D export, or rebuild the key parts in Blender |
| Drone or laser scan (`.las`, `.e57`, mesh) | Mesh it in RealityCapture, Metashape or CloudCompare, export `.obj` or `.ply`, then convert in Blender |

Large models load faster after compression with [gltf-transform](https://gltf-transform.dev/):

```bash
npx @gltf-transform/cli optimize input.glb public/models/output.glb --compress meshopt --texture-compress webp
```

## Library: vehicles and site pieces

Press **L** (or the **Library** button, bottom left) to open the library: vehicles, construction
equipment (excavators, loaders, a dozer, graders, rollers, mobile and tower cranes, lifts,
telehandlers, forklifts, dump trucks...), generators, compressors and fuel tanks, site trailers in
seven sizes, containers, fabric shelters and other temporary covers, dumpsters, barriers, fencing and
hoarding, traffic control, porta-potties, dewatering and water treatment, people for scale, pallets,
shoring and more, all at real scale and not tied to Neptune, so the same library works at any site.
What each machine is, its size and where it came from is in [docs/equipment.md](docs/equipment.md).

- **Place:** click an item, move the mouse over the ground and click. Or drag the item onto the scene.
  **R** or the mouse wheel rotates it, **Shift**+click places another, **Esc** cancels.
- **Row:** the **Row** button on a card places many along a line drawn on the ground: a run of
  barriers, cones every 3 m, light towers down a road. See [Rows](#rows-many-of-an-item-along-a-line).
- **Edit:** click (or tap) a placed item to select it and drag it to move it. A ring appears around it:
  drag its round knob to turn it (**Shift** snaps to 15°), or use **R** / **Shift+R**, or the wheel
  while you drag it. A toolbar over it turns it 15° (hold, or **Shift**+click, for 90°), drives it if
  it's a vehicle or machine, opens its settings (**P**: exact position and heading), hides it and
  deletes it, with **Undo** for 5 seconds. **Delete** removes it too.
- **Look around** while editing by holding the right mouse button.
- **Save:** what you place is saved in this browser. **Export layout** downloads it as a file and
  **Import** loads one, e.g. to share a layout or move it to another computer.
- **Flatten area** (top of the list): drag a rectangle on the ground and everything in Google's 3D
  mesh inside it (rail cars, parked trucks, a shed) is pressed flat to the lowest ground around it,
  to clear space for a layout. Draw it a little bigger than what you want gone: Google's mesh is made
  of large triangles, and ones that cross the edge slope up to the uncleared side. Areas show as red
  boxes while the library is open (the Show panel hides them); select one to move, turn, resize or
  delete it, which brings the original back, and **B** shows the original everywhere for a moment.
  It only changes what this app draws; Google's data isn't touched.

Two kinds of items:

- **Built in** (`src/procedural.js`): simple standard pieces generated in code at exact North American
  dimensions, e.g. a 10 ft New Jersey barrier, 20/40 ft ISO containers, site office trailers from 8 x 20
  to 24 x 60 ft, 20/40 yd roll-offs, fabric shelters, a frac tank, workers. Add more there. Plant with
  no clean download is built in code too, at the size of a common machine of its class: generators,
  compressors and a fuel tank (`src/power-models.js`), mobile cranes and telehandlers
  (`src/crane-models.js`) and the tower crane (`src/tower-crane.js`).
- **Downloaded** (`public/library/`): models from Sketchfab and Poly Haven, listed in `library.json` with
  their size, facing and licence. `CREDITS.md` credits the authors; the app shows the credits under **H**.

To add a downloaded model, put a Sketchfab API token (sketchfab.com → Settings → Password & API) in an
environment variable named `SKETCHFAB_API_TOKEN` (Poly Haven needs none) and run:

```bash
npm run add-asset -- https://sketchfab.com/3d-models/<model>-<uid> --id forklift --name "Forklift" --category "Heavy equipment" --length 3.6
```

```bash
npm run add-asset -- https://polyhaven.com/a/<asset> --id oil-drum --category Materials --length 0.6
```

- `--length` is the real item's length in metres along its front axis, used to scale the model.
  Rigged models (with a skeleton) need `--scale` instead, the factor from file units to metres:
  they're measured in their rest pose, which may not be how they're drawn.
- `--front` is the axis its front points along in the file: `+z` (the glTF default), `-z`, `+x` or `-x`.
  Write negative axes with an equals sign, e.g. `--front=-z`.
  If a placed item faces sideways or backwards, run the command again with another value.
- Only downloadable models under **CC0** or **CC Attribution** are accepted, so they can be stored in the
  repository and used commercially. The script refuses anything else.
- Models from SketchUp's 3D Warehouse can't go in the library: its terms forbid redistributing them.
  You can still drop one you've downloaded onto the page for your own use.
- Textures are shrunk to 1024 px and geometry compressed; `--max-texture 2048` keeps more detail.
- The script prints the model's description. Read it: if it names someone else to credit (a logo's
  designer, say), run again with `--credit "Logo by ..."` so they're listed too.

## Rows: many of an item along a line

A run of jersey barriers, cones every 3 m along a lane, light towers down a haul road, trucks parked
side by side: **Row** on a library card (it shows where the pointer is, and always on a phone) places
many of one item along a line drawn on the ground. **Row** on a placed item's toolbar does the same
from that item, which becomes the first of the row. Any library item works.

- **Drawing:** click points on the ground, corners and all, then double-click (or press **Enter**)
  to finish, or click the first point again to close a loop (its dot grows as you come over it). A
  drag from where you start makes a straight row at once. **Backspace** takes the last point back
  and **Esc** cancels. On a phone, tap the points and then **Done**; the library sheet steps aside
  while you draw, and stays folded afterwards so the new row's points can be dragged (**Library**
  brings it back).
- **Spacing,** in the panel at the top while drawing:
  - *End to end*: each copy runs its real length along the line, and the next starts the gap after
    it (none for barriers, fencing and hoarding, which touch; a metre for plant and vehicles). Fence
    panels go 10 ft apart, sharing the foot at each joint as they do on site. Round a corner a copy
    cuts across it, so they meet end to end there too.
  - *Every X m*: no further apart than that centre to centre, measured along the line and on round
    its corners. Cones and drums start at 3 m, bollards at 1.5 m, light towers at 30 m and people at
    1.5 m.
  - *Line up*: *along* puts each copy's long side along the line (a wall of barriers, trucks nose to
    tail), *across* turns them square to it (trucks parked side by side).
  - *Ends*: *from the ends* starts the run at the start of the line; every X m it puts one on each
    point you clicked, the ends and every corner (the start and end of a cone taper), and spaces the
    rest evenly between them, a little closer than X where X doesn't go exactly. *Centred* keeps the
    spacing exact and splits what's over between the two ends.
  - A line that ends where it started is a loop (a fence round a laydown area): it has no copy
    twice where it closes.

  It remembers what you chose for each item. As you draw, the copies show along the line with how
  many there are, the line's length and, where the item's name gives its weight (a jersey barrier
  ~1.9 t, a lock block ~2.1 t, trench boxes), what they weigh in all.
- **One thing:** the row is selected (click any copy), moved, turned, hidden, deleted (with Undo)
  and saved as one item. The Show panel lists it under its item's category, counting its copies, as
  does the library's footer.
- **Editing:** a selected row has a dot on each point of its line: drag one to move that point, drag
  or click a plus between two to add a point there, double-click a dot to take it out. The P panel,
  or **Size** on its toolbar, changes the spacing, line-up and ends, turns every copy round, and
  swaps the item (a row of barriers becomes lock blocks). **Break apart** (toolbar or P panel) turns
  it into single items where its copies stood, with Undo.
- **On the ground:** each copy sits on the ground under it (Google's mesh, dug or piled earth) and
  follows it as sharper tiles load. Long, low copies (barriers, fence panels, trucks along the line)
  tilt along the line on a slope, up to 12°; anything else stands level on the highest ground under
  it, so nothing floats or digs in. With *snap to ground* off in the P panel they stand level at its
  *up*.
- **Light:** the copies are drawn as instances, so a row costs a draw call for each part of its item
  however many copies it has (300 cones are one), and walking and driving bump into each copy rather
  than the space between them.
- **Pro items** need the Pro pack for a new row, as for placing one; rows already placed open for
  everyone.

A saved or exported layout keeps a row as `kind: "row"` with its item, its points (metres from its
middle, as if it faced north), the spacing, and each copy's height and tilt as last found.

## Showing and hiding: the Show panel

The **Show** panel sits above the Controls panel, bottom right. Fold it away with its arrow and it
stays as a small eye button (the eye is crossed out while something is hidden); the app remembers
which you chose, and on a phone it starts folded.

- **Before / After** (or **B**): *Before* is the site as Google captured it. Flattening is off, so
  Google's mesh is back as it was; the ground is shown as it was instead of your cuts, piles and
  digging, and pits no longer hide any of Google's mesh; nothing you placed is drawn. *After* puts
  it all back, exactly as it was, at once. The status readout says when you're looking at Before.
  Placing something new switches back to After. It waits while you're driving.
- **Layers**, each with an eye and a count: *Flatten areas* (the red boxes; the ground stays
  flattened), *Excavations* and *Stockpiles* (their outlines and labels; the ground stays dug and
  piled), *Laydown areas*, *Shoring in pits*, *Labels* (every floating label), then one row per
  library category with something placed (*Vehicles*, *Heavy equipment*, *Site trailers &
  containers*, ...), which come and go by themselves. Placing something in a hidden layer shows
  that layer again.
- **Hidden items**: **Hide** on the selection toolbar hides just that item (with Undo). Hidden
  items are listed at the bottom of the panel with **Show** each and **Show all**.

Hidden things aren't drawn, can't be clicked or selected, and don't block walking or driving;
nothing is moved or deleted. Items hidden one by one are part of the plan: they're saved with the
layout, exported with it, and hidden on its share link too. The layers and Before / After are
yours alone, remembered in this browser.

## Planning a site: laydown areas, cuts and stockpiles

The tools at the top of the library (**L**, under *Tools*) mark out and shape the ground. Each one is
drawn by dragging a rectangle on the ground (lined up with the way you're looking) or clicking a spot,
and is then selected, moved, turned and deleted like any other item. To resize a selected area, drag
the squares on its corners and edges (the opposite side stays put; sizes snap to 0.5 m, **Shift** for
any size, and a label shows the size as you go), type it in with **Size** on its toolbar, or use the P
panel, which has the size at the top. A pit has an arrow in the middle: drag it down to dig deeper.

- **Laydown area:** a coloured rectangle laid on the ground with its name, size and area floating
  above it, e.g. *Laydown A · 40 × 25 m · 1,000 m²*. The P panel sets its name, colour and a note, and
  counts the items inside it. See [docs/laydown.md](docs/laydown.md).
- **Excavation:** the rectangle is the top of the cut. It digs itself to its depth (2 m to start)
  with sloped or shored sides; the P panel shows the cut volume, the loose volume (a quarter more) and
  how many dump-truck loads that is, and **Spoil pile** pours the dug material beside it.
- **Stockpile:** click for a cone of material (50 m³ to start), or drag for a ridge pile that fills
  the rectangle. It pours itself: material falls and builds up at the material's natural slope
  (gravel, sand, topsoil, excavated soil, road base, riprap, coal, potash). The P panel shows its
  volume, weight, height and truck loads. Resizing a ridge keeps its height limit, and the label says
  how much the new footprint holds; a cone has one handle on its edge, which sets its volume.
- **Flatten area:** see above; clears Google's mesh where you want clear ground.

Pits and piles are real ground: you can walk into a pit, drive over a pile, and things you place
sit on them. Volumes come out within about 1% of the textbook figure for the shape, measured from
Google's ground, so they are as good as the map. Details in [docs/earthworks.md](docs/earthworks.md).

### Tower crane and its reach

The **Tower crane** (library, *Cranes & lifts*) is set up after it's placed: in the P panel (or
**Size** on its toolbar), **height under hook** (10 to 90 m) and **jib**, its working radius (20 to
80 m), rebuild it, with a mast, counter-jib, counterweights and tower head to suit; **hook radius**
and **hook height** move the trolley and hook. Turn it to point the jib. Its **reach circle**, an
orange disc on the ground at the working radius with a fainter ring where the counter-jib's tail
swings, shows what it can reach and what it swings over; untick *reach circle* to hide it. The
circle drapes over the ground like a laydown area, is saved with the layout, and doesn't count in
the crane's size (selecting, turning and snapping go by the crane itself). It's a planning aid
without a load chart: check the real crane's chart for what it lifts at a radius. More in
[docs/equipment.md](docs/equipment.md).

### Shoring: trench boxes, sheet piles and more

An excavation's **support** (P panel) shores it instead of sloping it: **trench box**, **slide
rail**, **hydraulic shores**, **sheet piles** or **soldier piles + lagging**. The sides are then cut
vertical and the shoring is drawn in the pit to scale, from standard sizes (trench boxes 8 ft tall
and 8 to 24 ft long, with 4 ft stackers; 0.6 m Z-sheets...), and rebuilt when the pit is resized. It
shows with the library closed too. The P panel lists what goes in (e.g. *3 boxes: 2 × 2.4 × 7.3 m
(8 × 24 ft) + ...*, *80 sheets, 48 m of wall, 9.0 m long each*), the shored wall area, a rough
weight, and warnings: open box ends, too wide for the system, needs bracing or an engineer, and
for an unsupported pit over 1.2 m deep with sides steeper than 3 : 4, WorkSafeBC's rule about
sloping, benching or shoring before anyone goes in. The library's **Shoring** category has trench
boxes, a stacker, a panel, bundles of sheet piles and H-piles and a hydraulic shore to lay down.
It's a planning aid, not an engineered design: see [docs/shoring.md](docs/shoring.md).

## Digging with an excavator

The library's **Excavator (20 t)** and **Mini excavator (3.5 t)** (under *Heavy equipment*) really
dig. Place one, press **V** to get in, and hold **Space** (or the left mouse button): it bites into the
ground in front, swings round and dumps the spoil beside the hole, where it piles up at its natural
slope, or into a dump truck, haul truck or roll-off parked on that side (the HUD counts the load).
**Q**/**E** swing the dig direction, **R**/**F** or the wheel set the reach, **X** switches the dump side,
**W**/**S** and **A**/**D** drive the tracks. The hole and the spoil are saved with the layout. See
[docs/excavator.md](docs/excavator.md).

## Race mode

Press **V** to get in and drive: the selected vehicle from the library's Vehicles, else the nearest
one within 25 m, else a pickup appears in front of you. **W**/**S** gas and brake (hold S to reverse), **A**/**D** steer, **Shift**
boosts, **Space** hops, **C** switches between the chase camera and the driver's seat, **R** puts it
back on the ground a few metres ahead (or where it last drove freely) if it's stuck, **V** or **Esc**
gets out and parks it where it stopped. The speedometer shows km/h, your top speed and longest jump.
Vehicles also include a go-kart (with its driver), built in code.

The construction machines drive too, at their own speeds: the dozer at 11 km/h, the wheel loader at
40, the crawler crane at walking pace (2 km/h), the spider crane at 2.5, the carry-deck crane at 27,
the rough-terrain crane at 40, the all-terrain crane at road speed (80) and the boom truck at 100, even
with their booms up. The cranes stand and turn on their carriers, and the cameras frame the carrier
and look out of the cab rather than from up the boom. The chase camera keeps outside the machine's own box,
boom and all (backed up to a wall, it looks on from above), and the driver's-seat camera is at the
operator's eyes: library.json gives each machine's `drive.cab` point. A cab whose windows are only
painted on is seen from just past its windscreen, and see-through glass is left out of that view. The pickup tops out at 160 km/h (about 210 with boost), the semi at 120 and the haul truck at 70. The **Race**
category has two jump ramps (1.2 m and 3 m); hit the big one at highway speed for about 1.7 s of air.
Hit a wall, a container, a barrier or one of Google's buildings and the vehicle just stops against
it; back up (**S**) to drive off again. Flatten a strip
first for a clear run. The chase camera stays in front of anything between it and the vehicle, so
it never ends up inside a building.

## Accounts: sign in and share layouts

When the app is hosted on its Cloudflare Worker (`worker/`, `wrangler.jsonc`) or on Vercel with a
database (below), the library footer has
**Sign in with Google**. Signed in, **Layouts** saves what you've placed to your account (it then
saves itself as you work), opens it on another computer, and makes a read-only **share link** for
people who should see the plan but not change it. Without the Worker (e.g. plain `npm run dev`) none of
this shows and layouts are saved in the browser as before.

The Worker also hands out the Google Maps key to signed-in people and share-link viewers, so the key
doesn't have to be built into the public site. Setting it up (a Google sign-in client, a D1 database,
`npm run deploy`), trying it locally and the security model are in [docs/accounts.md](docs/accounts.md).

## Hosting on Vercel

The same app and API run on Vercel: `vercel.json` builds the site without the Maps key and sends
`/api/*` to one Vercel Function (`api/index.js`), which runs the Worker's code with a Postgres
database (Neon, from the project's *Storage* tab) in place of D1. The tables are made by themselves;
there's no migration to run. Without a database or a sign-in client the site works like any static
host. Creating the project, the database, the environment variables (`GOOGLE_CLIENT_ID`,
`GOOGLE_MAPS_API_KEY`, `ALLOWED_EMAILS`) and the Google settings are in
[docs/deploy-vercel.md](docs/deploy-vercel.md).

## Premium equipment (work in progress)

Library items marked `"premium": true` (in `library.json`, or on a built-in item in
`src/crane-models.js`: for now the *Cranes & lifts* and *Material handling* categories) form a
**Pro equipment** pack, bought once through a Stripe Payment Link. While it's locked, those cards show a **Pro** badge and picking one explains how to
buy it; Stripe's webhook tells the server who has paid. Layouts and share links with premium items
always open for everyone. It's **off** until the Payment Link, its id and the webhook's signing secret
are set, and then only in the app: the models are still public files. Stripe setup (test mode first),
testing with test cards and the known gaps are in [docs/premium.md](docs/premium.md).

## World Drive (worlddrive.app)

A second app in this repository, on its own address: pick anywhere on Earth from a globe of Google's
3D tiles (search, a dozen start spots, recent places, or a tap on the globe), choose a go-kart, pickup
or haul truck, press **Drive here** and drive the real world arcade-style: drift, boost, fly
with Shift, **M** back to the globe and drop in somewhere else without reloading. Phones get a bottom
sheet and touch buttons.

It shares `src/` with this app but has its own page (`drive/index.html`, `src/drive-app/`), build
(`npm run dev:drive`, `npm run build:drive` into `dist-drive/`) and Cloudflare Worker
(`worker/drive/`, `wrangler.drive.jsonc`, `npm run deploy:drive`). Each page load is one billed Google
Maps session, so the built site holds no key: the Worker hands it out once per visit, after a
Cloudflare Turnstile check, and only while the day's visits are under a cap for everyone (300) and
for each visitor (8); over a cap the page says today's free drives are used up. Teleporting moves the
loaded world rather than loading a new one, so it costs nothing extra. Place search goes through the
Worker to OpenStreetMap's Nominatim, cached and at most once a second.

How to play, the settings and limits, deploying, and the owner's Google Cloud steps (a separate
project and key, restricted to worlddrive.app and the Map Tiles API, a daily quota and budget alerts)
are in [docs/world-drive.md](docs/world-drive.md). Tests: `npm run test:drive-worker` and
`npm run test:drive-ui`.

## About the Sketchfab model

The [Neptune Terminal (North Vancouver)](https://skfb.ly/oyAVS) model on Sketchfab belongs to
`plowright.andrew`. It is set to **not downloadable** and has no licence, so this project can't use it as is.
Contact the author for the file and permission to use it. If they agree, export it as `.glb` and add it
like any other model. It has about 760k vertices, which is probably about as detailed as Google's mesh.

## Project layout

```
index.html          page shell and overlays
src/config.js       site location, start position, player tuning, your models  <- edit this
src/main.js         sets everything up and runs the render loop
src/world.js        Google tiles, lights, the flat stand-in ground
src/walk.js         walk/fly controller with gravity, collisions, bounces, the view turn and the zoom's glide
src/zoom.js         the mouse wheel and trackpad pinch: zoom toward the cursor, chase camera distance
src/legend.js       the Controls panel: the keys for what you're doing now
src/layers.js       the Show panel: layers, hidden items and Before / After (B)
src/drive-prompt.js V: what it drives, the "Press V to drive" prompt and twin.startDriving()
src/models.js       loads and places your glTF models
src/placement.js    the P panel
src/raycast.js      fast raycasting (three-mesh-bvh) for walking and snapping
src/library.js      loads the library (downloaded models + built-in pieces)
src/procedural.js   built-in site pieces generated in code
src/parts.js        builds those pieces from parts merged into one mesh per material
src/trailers.js     site trailers: offices, double-wide, washroom, lunchroom; src/covers.js fabric
                    shelters, canopies, scaffold enclosure, fence runs, hoarding
src/water-treatment.js  frac and weir tanks, sand filter, dosing trailer, trash pump, dewatering bag
src/people.js       workers and a traffic control person, for scale
src/power-models.js generators, compressors and the fuel tank, built in code
src/crane-models.js mobile cranes and telehandlers, built in code; src/plant-parts.js their parts
src/tower-crane.js  the tower crane (a kind, set up in the P panel) and its reach circle
src/sidebar.js      the library sidebar: placing, selecting, moving, drawing flatten areas
src/handles.js      on-map handles for the selected item: turning, resizing areas, a pit's depth
src/toolbar.js      the toolbar over the selected item, its size editor and Undo after deleting
src/flatten.js      flatten areas: press Google's mesh flat inside a rectangle
src/drive.js        race mode: driving, jumps, cameras, speedometer; flying, booster and drifts as options
src/drive-hud.js    a self-contained driving HUD with touch buttons, for other apps (World Drive)
src/drive-fx.js     booster flame, tyre smoke and drift sparks
src/kart.js         the go-kart model and its library item
src/layout.js       saves placed items in the browser; export/import
src/kinds.js        placed things that aren't models (areas, pits, piles): how features register them
src/terrain.js      the ground that can be dug and piled: heights, volumes, drawing, saving
src/earthworks.js   excavations and stockpiles, and their tools; src/pour.js animates pouring
src/shoring.js      shoring in excavations: trench boxes, slide rail, sheet piles...; readouts
src/shoring-models.js  the shoring pieces, for pits and the library's Shoring category
src/shoring-ground.js  draws a shored pit's walls straight up behind the shoring
src/laydown.js      laydown areas: coloured site areas draped on the ground, with labels
src/rows.js         rows: many of one library item along a line drawn on the ground (Row on a card)
src/excavator.js    digging with an excavator; src/excavator-model.js builds the machines
src/cloud.js        sign in with Google, layouts in your account, share links (needs the Worker)
src/premium.js      the Pro equipment pack: locked cards and the buy dialog (needs the Worker)
worker/             the Cloudflare Worker: accounts, layouts and premium API (D1), serves the built site
worker/premium.js   premium settings and the Stripe webhook
worker/vercel.js    the Worker as a Vercel Function; worker/postgres.js gives it D1's API on Postgres
api/index.js        the Vercel Function (vercel.json sends /api/* to it)
scripts/add-asset.mjs   imports a model from Sketchfab or Poly Haven into public/library
public/library/     downloaded models, library.json catalog, thumbs/ and CREDITS.md
src/geo.js          lat/lon <-> local metres
public/models/      put your .glb files here
drive/index.html    World Drive's page; its code is src/drive-app/ (docs/world-drive.md)
worker/drive/       World Drive's Worker: the Maps key per visit, caps, Turnstile, search
vite.drive.config.js, wrangler.drive.jsonc   World Drive's build and Worker settings
```

The scene uses metres with the origin at the terminal centre (`SITE` in `config.js`):
+Y is up, +Z is north and +X is west. Always go through `enuToLocal()` / `localToEnu()` in `geo.js`
rather than setting x/z by hand.

## Building and hosting

```bash
npm run build
```

`dist/` is a static site, so it can go on GitHub Pages, Netlify, Vercel or Cloudflare Pages.
Add the site's origin (for example `https://yourname.github.io/*`) to the API key's website restrictions.

For accounts and share links, host it on its Cloudflare Worker instead: `npm run deploy` builds the
site without the environment key and deploys the Worker (see [docs/accounts.md](docs/accounts.md)).
It runs as the `neptune-twin-app` Worker (address in its Cloudflare dashboard), deployed by Workers Builds on
every push to `claude/kind-ride-ovicsk`.
Or on Vercel, whose build (`npm run build:server`) also leaves the key out: see
[docs/deploy-vercel.md](docs/deploy-vercel.md).

## Google's terms, in short

- Stream the tiles; don't download them or bake them into Blender or Unreal files.
- Keep the attribution visible. The app shows the Google Maps logo and the data providers in the
  bottom-right corner, plus a note that models you add are your own data, not Google's.
- Your own models must not be traced or otherwise derived from Google's 3D mesh. Build them from your
  own drawings, photos or scans.
- Flattened areas change how the mesh is drawn in the browser only, and the attribution says so when
  any are in use. Hiding parts of the mesh to show proposed work is common practice (CesiumJS clips
  Google's tiles the same way), but check the terms if you publish screenshots of edited areas.
- Read the current [Map Tiles API policies](https://developers.google.com/maps/documentation/tile/policies)
  before you share the site widely.
