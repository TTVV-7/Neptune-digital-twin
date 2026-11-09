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
| U | See underground: Google's ground cut away over your own models, to look and walk down into them; U again to put it back (see [Models under the ground](#models-under-the-ground)) |
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
| Tools (top of the library) | Laydown area, Excavation, Stockpile, Flatten area: drag a rectangle, or click for the usual size. Fill in: drag over an excavator's digging to put the ground back (**Fill in digging**, beside Clear, puts all of it back) |
| Row (on a card) | Row: draw a line to place many. Click points on the ground, double-click or Enter to finish, or click the first point to close a loop; drag for a straight row. Backspace takes a point back (see [Rows](#rows-many-of-an-item-along-a-line)) |
| Dots on a selected row | Drag one to move that point; drag or click a plus to add one; double-click a dot to take it out |
| Click a placed item | Select it; drag it to move it |
| Round handle | Drag to rotate the selected item; Shift snaps to 15° |
| Square handles | On an area, excavation or stockpile: drag to resize; Shift for any size |
| Arrow in a pit | Drag down to dig deeper, up for shallower |
| P on a pit | Its sides sloped, stepped or shored (the whole pit or each side), support levels, dig stage; **Section across** / **Section along** cuts through it (Esc closes the section) |
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
| Show panel | Above the Controls (an eye when folded): hide flatten areas, excavations, stockpiles, laydown areas, shoring in pits, tieback no-dig zones, labels, or a whole category such as Vehicles |
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

### Models under the ground

Part of a model can lie below Google's ground: a tunnel, a basement, a pit. Google's mesh is a
surface, so from inside the model it would show through the floor and walls and stop you walking.
While you're inside one of your own models (dropped in or in `MODELS`; not library items or
earthworks) and below Google's ground there, Google's mesh is cut away over the model's footprint:
not drawn, and you walk and fly through where it was. The status readout says so. Above the
ground again, it comes back.

To get in, fly (**F**) with ghost on (**G**) down through the ground into the model, then **F** to
walk inside it. **U** (see underground) cuts Google's ground away over all your models wherever you
are, to look down into them from above, or to walk in through an opening. Snapping a model to the
ground still uses Google's ground as it is, so cutting it away doesn't move the model.

The **Show** panel has the same with a tap, plus two more, remembered in your browser:

- **Ground over your models**: eye off is the same as **U**.
- **Solid models**: eye off makes your models see-through, so a closed gallery or tunnel seen from
  above shows what's inside. Parts marked `xraySolid` in their glTF node extras stay solid: the
  B2D2 model's repair areas, chipped concrete and rebar.
- **Google 3D map**: eye off hides Google's tiles altogether, drawn and solid, so only your models
  and earthworks are left to see and fly into. Your models stay where they are.

Parts of a model marked `noCollide` in their node extras don't stop you walking or flying (the
B2D2 model's see-through building shell and conveyors). Concrete you can see through still does,
like a real wall: go through with ghost (**G**).

By default the model is recentred, so *east/north* is the middle of its footprint and *up* is its base.
That stops CAD files with real-world coordinates (UTM eastings in the hundreds of thousands) from
landing kilometres away. Add `recenter: false` to an entry to keep the file's own origin.

**Heading 0** assumes the model's +X axis points east and its +Y (Blender/SketchUp/CAD) points north.
If your model comes in back to front, try heading 180.

### B2D2 repair model (Dumper 2)

`public/models/b2d2-repair.glb` is Dumper 2's below-grade structure (C31 gallery, transfer pit,
C32 tunnel, the steel plates at grade) with the repair areas marked up in the **B2D2 Repair Model**
artifact, the dumper building as a see-through orange shell
to line the model up against Google's copy of it, and the conveyors, tent and temporary works,
also see-through. It's in `MODELS` with `recenter: false`: the model's origin is the middle of C31
at grade, so snapping puts grade on Google's ground and the structure goes underground. Ground
level is left out, since it would flicker against Google's ground. Heading 0 points C31's grid
numbers (0 to 69) east. It's compressed with meshopt (about 1 MB).

Areas marked **Chipped / hydro-demo** are drawn as they are on site: the area is cut out of the
wall, floor or soffit it was marked on, and in its place is a recess of rough, fresh concrete about
100 mm deep (a measured depth in the markup wins) with the rebar exposed in it: 15M bars both ways
at 300 mm and 50 mm cover, running on into the concrete past the edge. These are typical numbers,
not read from the drawings: `CHIP` at the top of the script sets them. The chipping is random but
the same on every rebuild. Other areas (marked on site, not yet chipped) are cyan patches with a
dark outline.

To line it up, click the orange shell and drag it onto Google's dumper building; turn it with the
round handle (or **R**), and fine-tune in the **P** panel. Then **Save position for everyone** in
the P panel: on the live site that keeps it there for every visitor, with no change to the code.
It asks once for the edit passcode, the Worker's `PLACEMENT_KEY` secret; viewers without it can
still move it, but only in their own browser. A saved position wins over the one in
`src/config.js` (`GET` / `PUT /api/placements`, [docs/accounts.md](docs/accounts.md)).
**Copy config** into `src/config.js` makes it the default for a new copy of the site too.
**Preset views**, as the artifact has them, are in a bar at the top: **Overview**, **C31**, **C32**,
**Pit** and **Ground** glide the camera there, wherever the model is placed (Overview also cuts
Google's ground away over it). Any model can carry views: `views: [ { name, from, at,
underground } ]` in its glTF scene's extras, in the model's own frame (`src/views.js`).

**Moving areas in the twin.** An area in the wrong spot, or turned the wrong way, can be fixed
right in the twin: **Edit areas** at the end of the views bar opens a panel. Click an area to pick it
(the click goes through walls, so it's easiest with **Solid models** off in the Show panel), then:

- **drag** it to slide it along its wall, floor or soffit;
- **← → ↑ ↓** nudge it as you see it (1 cm to 1 m a press), **⟲ ⟳** turn it in its face (1° to 90°);
- **Move to another surface…**, then click the wall, floor or soffit it belongs on: it goes there,
  its middle where you clicked, facing you;
- **Back to the drawing** puts it where the markups have it, and **Undo** takes back the last change.

It's rebuilt as you go with the build's own code (`src/repair-geometry.js`): the recess, rebar and
coloured rim go with it, and the concrete is cut again where it now is. Right-drag looks round and
WASD moves while editing; clicks are the editor's. **Save for everyone** sends every moved area to
the site with the admin passcode (the one for Save position for everyone), and everyone who opens
it then sees them there (`/api/area-edits`, [docs/accounts.md](docs/accounts.md)); until then only
you see them, and closing the page asks first. A move is kept by the area's id, so it outlasts a rebuild
from a new progress drawing that keeps the id, and wins over where that drawing puts the area:
**Back to the drawing** (and save) takes the drawing's. The script writes
`public/models/b2d2-repair.json` beside the model for this: the areas as drawn and the concrete
they're cut out of.

To see inside, press **U** to cut Google's ground away over it, or press **G** (ghost) and fly down
through the ground into the gallery or tunnel, then **F** to walk; Google's ground stays cut away
while you're under it there ([Models under the ground](#models-under-the-ground)).

**From a progress drawing.** A Bluebeam progress markup of the Hatch drawings (ST005 to ST010,
filled polygons coloured by date as its legend says) is read straight into the model's areas:

```bash
node scripts/b2d2-progress.mjs "2026.11.08 - Progress.pdf"
node scripts/b2d2-repair-model.mjs
```

The first finds each page's sheet from its title block (with `pdftotext`, or `--sheets ST007,...`),
places each polygon on the wall, floor or soffit of the model it's drawn on, keeps the ids of areas
that are still there, and lists what's new, what's gone and anything it couldn't place (`--dry-run`
only lists). Areas take the drawing's measured m². Each chipped area gets a rim in its date's colour.

To bring in markups from the artifact instead, save its `markups` collection (one JSON file per
markup, or a `{ markups: [...] }` file) and rebuild; a folder is also saved as `scripts/data/b2d2-markups.json`:

```bash
node scripts/b2d2-repair-model.mjs --markups path/to/markups
```

It's built from `source-models/b2d2-site-model.glb` (the artifact's model; `--site` takes another,
or the artifact's `site.json`). Each area's node keeps its grid, face, area, defect, status and
notes in glTF `extras`.

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
- **Save for everyone (admin):** on the live site, the P panel of anything you place (equipment,
  a flatten area, an excavation, a stockpile, a laydown area, a row) has **Save for everyone**. It
  asks once per browser for the admin passcode (the Worker's `PLACEMENT_KEY` secret), and from then
  on everyone who opens the site sees that item; it leaves your own layout so it isn't there
  twice. Move or change it and save again to update it, or **Remove for everyone**. What visitors
  place or move stays in their own browser. Excavator digging isn't saved for everyone.
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
- **Excavation:** the rectangle is the floor of the pit. It digs itself to its depth (2 m to start)
  with its sides sloped out for the soil (WorkSafeBC's soil types; Neptune's fill is type C,
  1.5 : 1). In the P panel the sides are *sloped*, *stepped* (benched) or *shored*, for the whole pit
  or side by side (numbered in the scene with the way each faces), and a slider steps through the
  dig stages; it shows the cut volume, the loose volume (a quarter more), how many dump-truck loads
  that is, the floor and the top of the cut, how the other methods compare for the same floor and
  what's placed where the pit reaches; **Spoil pile** pours the dug material beside it, and
  **Section across** / **along** draws the pit's profile to scale (see below).
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

An excavation can be shored instead of sloped (P panel): as a whole with a **trench box**, **slide
rail** or **hydraulic shores**, or with walls, which can line any side on their own: **sheet
piles**, **soldier piles + lagging**, **secant pile walls** or **contiguous pile walls** (say sheet
piles along the road and the open sides sloped). Shored sides are cut vertical and the shoring is
drawn in the pit to scale, from standard sizes (trench boxes 8 ft tall and 8 to 24 ft long, with
4 ft stackers; 0.6 m Z-sheets; 0.88 m secant piles at 0.73 m...), down to its embedment below the
floor, and rebuilt when the pit changes. Deep walls get **support levels**, suggested about every
3 m: walers with struts, corner braces and king posts, rakers to kicker blocks, or tiebacks with
their no-dig zone; a **dig stage** slider shows what's in as the pit goes down. It shows with the
library closed too. The P panel lists what goes in (e.g. *3 boxes: 2 × 2.4 × 7.3 m (8 × 24 ft) +
...*, *120 sheets (Z-profile, 0.6 m wide) on sides 1 and 3, 13.0 m long each; walers at 3 levels
with 9 struts across and 3 king posts*), the shored wall area, a rough weight, the support levels,
warnings, and planning checks drawn from WorkSafeBC Part 20 and practice (not a compliance check): water
above the floor, slopes steeper than the soil allows, cantilevers too tall, levels too far apart,
struts too long, tiebacks too shallow, pervious walls below the water. The library's **Shoring**
category has trench boxes, a stacker, a panel, bundles of sheet piles and H-piles and a hydraulic
shore to lay down.
It's a planning aid, not an engineered design: see [docs/shoring.md](docs/shoring.md).

### Excavation sections, quantities and what's nearby

**Section across** and **Section along** in a pit's P panel cut through it: a card draws the profile
to scale (the ground before digging, the slopes with their ratios, benches, the walls down to their
embedment, the support levels, struts, rakers and kicker blocks, tiebacks with their free and bond
lengths and no-dig reach, the groundwater), with a slider to move the cut, and the scene is cut away
in 3D to match. The card lists the quantities (cut, top of the cut, wall area, sheets or piles,
walers, struts, rakers, tiebacks), compares the methods for the same floor (*Shored instead: 912 m³
less cut*), and gives every planning check with its source (WorkSafeBC's, or practice's where it
gives no number). The P panel's **nearby** warns when the cut, a tieback no-dig zone, the spoil
set-back, the band behind shoring or the adjacent band reaches something placed on the map, and
where the ground beyond a side slopes steeper than 3 : 1. See
[docs/excavation-section.md](docs/excavation-section.md).

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
3D tiles (search, a dozen start spots, recent places, or a tap on the globe), choose a go-kart,
pickup or muscle car (more as your level climbs), press **Drive here** and drive the real world
arcade-style: drift (Space), boost (Shift), fly (F), and hit something to bounce off it into the
air, where **A**/**D** spin, **W**/**S** flip and **Q**/**E** roll for tricks that score (times a
combo multiplier) when you land on your wheels; a wipeout loses the combo and rolls you back onto
them. Boosting flat out hits **overdrive** (a sonic boom, streaks of air, a wider view), and glowing
**boost pads** turn up on open ground as you drive to top the booster up (a switch in the pause menu
turns them off). Lighting the booster, running it dry, a pad, each drift charge level and its
mini-turbo have bursts of their own, the view jolts and streams with speed lines, and the body leans
on its springs (**Camera effects** in the pause menu, or asking the system for less motion, keeps
the view still). Drive or come down into **water** and it's a splash: spray and rings of foam, the
vehicle sinking nose first, then back on the last dry ground you were on, facing away from it (the
hovercraft rides on it). Google's mesh doesn't say what's water, so `src/drive-app/water.js` tells
it by how Google draws it: level, one even colour, the lowest thing round about. **M** goes back to
the globe to drop in somewhere else without reloading. Phones get a bottom sheet and touch buttons.

It shares `src/` with this app but has its own page (`drive/index.html`, `src/drive-app/`), build
(`npm run dev:drive`, `npm run build:drive` into `dist-drive/`) and Cloudflare Worker
(`worker/drive/`, `wrangler.drive.jsonc`, `npm run deploy:drive`). Each page load is one billed Google
Maps session, so the built site holds no key: the Worker hands it out once per visit, after a
Cloudflare Turnstile check, and only while the day's visits are under a cap for everyone (300) and
for each visitor (8); over a cap the page says today's free drives are used up. Teleporting moves the
loaded world rather than loading a new one, so it costs nothing extra. Place search goes through the
Worker to OpenStreetMap's Nominatim, cached and at most once a second. A leaderboard keeps each
player's best stunt run today, this week and all time (a nickname, no sign-up) in a D1 database,
posted with the visit's signed token and checked against what the game can score.

**Driving with others**: everyone else driving the same area (about 11 km across) shows up live as a
ghost car you pass straight through, with their nickname, ride and Garage paint; **Invite friends**
makes a party link (`/?party=CODE`) that brings friends to you anywhere on Earth, and **H** honks.
No chat; the others see your nickname (or a guest name), your ride and where your car is in the
game, including the spot you dropped in, and nothing else of you. On the globe, a glowing dot
wherever people are driving in an area right now shows how many (and the panel's **Driving now** the
busiest areas): tap one to fly there and **Drive here** into their room (or, for several drawn as
one, down over them till they part). Only those visible nearby count (never a party, or anyone with
**Show me to drivers nearby** off), as positions to about a kilometre and counts, no names; the
rooms add their dots to the reports they already make, and `/api/online` is kept 30 s by
Cloudflare's cache, each Worker instance and browsers. A page alone on the globe in its Cloudflare
location still costs about 60 of the day's budget an hour (about 120 an hour in a location however
many watch), so it stops asking once nobody has touched it for 10 minutes. Each room is a Durable
Object on the WebSocket Hibernation API (`worker/drive/live.js`, speaking
`src/drive-app/live-protocol.js`). It switches itself off for the rest of the UTC day once it has
used its daily budget of Durable Object requests (`LIVE_DAILY_BUDGET`), so it can't use up what the
visits need, and `LIVE` in `wrangler.drive.jsonc` switches it all off (see
[Driving with others](docs/world-drive.md#driving-with-others), with what it costs).

**Levels**: driving earns XP (each km, air off jumps, drift boosts, boost pads, landed tricks, the
first drive in each area and at each start spot, minutes with others, and the day's first drive,
more for days in a row), climbing 50 levels: level 2 in the first few minutes, 50 a long goal. Levels
unlock six new cars (a golf cart at level 5, a tuk-tuk at 8, an ice-cream van at 15, a lawn tractor
at 22, a retro wedge at 30 and a formula racer at 40), about half the Supporter Pass's Garage looks
on the way to 40, and titles for your nametag, a level badge whose frame changes every ten levels
and four colours that only levels give. While driving a slim XP bar shows under the place's name,
with "+46 XP · 1.4 km" pop-ups and a burst at each level-up; the globe's panel has a profile card
with the whole track. XP is kept with the
leaderboard nickname in D1 (an account showing its best nickname's level), or in the browser until
you pick one, which claims it. The Worker caps each report by the time since the last
(`worker/drive/progress.js`, sharing its rules with the page in `src/drive-app/levels.js`), on a
rate limiter rather than a Durable Object (see [Levels](docs/world-drive.md#levels)).

World Drive's fourteen cars are models from Sketchfab (CC BY, credited in its About box and ride
picker): sports cars and supercars (a retro wedge, a formula racer, a hypercar, a cyber muscle car)
and fun and odd rides (a golf cart, a tuk-tuk, an ice-cream van, a lawn tractor) among them, each
with handling of its own. They're kept out of the construction app's library: `npm run
add-drive-car` imports one into `drive/public/cars/`, which only World Drive's build publishes,
finding its wheels so they spin and steer (a three-wheeler's too, and standing up a model saved
lying down, or painting over a real place's number plate), and `npm run drive-car-thumbs` draws its
picture for the picker (see [World Drive's cars](docs/world-drive.md#world-drives-cars)).

A **Supporter Pass** (one payment of CA$4.99 towards the running costs) unlocks seventeen more
rides: the six cars levels bring, at once; seven cars of its own (a neon racer, a night cruiser, a
dune buggy, a farm truck, a police cruiser and two showpieces, a hypercar and a cyber muscle car);
and four built in code (a sports coupe, a monster truck, a city bus and a hovercraft), each handling
its own way; every look in the Garage at once (paint, finishes, decals, rims, nine more boost styles,
flame colours and trails, some of which levels unlock over time), +50% XP, a ⭐ on the leaderboard and
30 drives a day. It's bought with a Stripe Payment Link after
signing in with Google, so it's yours in any browser; Stripe's signed webhook records it. Buying
stays off ("Coming soon") until `GOOGLE_CLIENT_ID` and the webhook's secret are set (see
[Supporter Pass (buying it)](docs/world-drive.md#supporter-pass-buying-it) for the owner's steps).

For search engines and links, the site has a page for each start spot and a few more famous places
(`/drive/<place>/`, built from `drive/site/`, each with a **Drive here** that opens the game with the
place pinned), a sitemap, robots.txt, structured data and link cards (`npm run drive-site-images`
draws them); see [Search engines](docs/world-drive.md#search-engines).

How to play, the leaderboard (how cheating is limited, and looking after it in the D1 console), the
settings and limits, deploying (`npm run deploy:drive` applies the database's migrations first), and
the owner's Google Cloud steps (a separate project and key, restricted to worlddrive.app and the Map
Tiles API, a daily quota and budget alerts) are in [docs/world-drive.md](docs/world-drive.md).
Tests: `npm run test:drive-worker`, `npm run test:drive-ui`, `npm run test:drive-pro-ui`,
`npm run test:drive-seo`, `npm run test:drive-live`, `npm run test:drive-live-ui`,
`npm run test:drive-levels` and `npm run test:drive-levels-ui`.

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
src/underground.js  under Google's ground in your own models: the mesh over them cut away (U, or by itself)
src/views.js        preset views carried by models (the bar at the top): glide the camera to each
src/repair-areas.js Edit areas: move the B2D2 model's repair areas in the twin, saved for everyone
src/repair-geometry.js  the repair areas' geometry (cut-outs, recesses, rebar), shared with the build
src/placements.js   models' positions saved on the live site for everyone (Save position for everyone),
                    and the admin passcode for anything saved for everyone
src/shared-items.js items the admin saved for everyone: loaded for everyone, Save / Remove for everyone
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
src/drive.js        race mode: driving, jumps, cameras, speedometer; flying, booster, drifts, stunts
                    (crash: 'launch': bounce and launch, air tricks, score) and water (a splash, then
                    back on dry land) as options
src/drive-hud.js    a self-contained driving HUD with touch buttons, the DRIFT button, hit words,
                    trick pop-ups and the score, a splash's word and the fade after it, for other
                    apps (World Drive)
src/drive-fx.js     booster flame, tyre smoke and drift sparks; a hit's sparks and bits, scrapes, dust;
                    a splash's spray and foam, a hovercraft's spray
src/drive-boosts.js boost styles (plasma, lightning, bubbles, a comet...) and the supersonic boom and
                    streaks, each a fixed batch of quads drawn in one go, for drive-fx.js
src/kart.js         the go-kart model and its library item
src/layout.js       saves placed items in the browser; export/import
src/kinds.js        placed things that aren't models (areas, pits, piles): how features register them
src/terrain.js      the ground that can be dug and piled: heights, volumes, drawing, saving
src/earthworks.js   excavations and stockpiles, and their tools; src/pour.js animates pouring
src/excavation-design.js  an excavation worked out from its params, no scene or DOM: sides, the
                    design surface, support levels, stages, quantities, WorkSafeBC checks
src/excavation-section.js  the section card, 3D cut-away, quantities and nearby check;
                    src/excavation-section-drawing.js works the section out (no scene or DOM)
src/shoring.js      shoring in excavations: trench systems, walls side by side, support levels; readouts
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
scripts/add-drive-car.mjs, drive-car-thumbs.mjs   import a car for World Drive into drive/public/cars
                    (its own cars.json, thumbs/ and CREDITS.md; World Drive's build only)
src/geo.js          lat/lon <-> local metres
public/models/      put your .glb files here
drive/index.html    World Drive's page; its code is src/drive-app/ (docs/world-drive.md)
worker/drive/       World Drive's Worker: the Maps key per visit, caps, Turnstile, search, the leaderboard,
                    levels' XP, the Supporter Pass (Google sign-in, Stripe's webhook), driving with
                    others' rooms
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
