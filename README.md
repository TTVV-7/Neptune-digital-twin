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

| Key | Action |
| --- | --- |
| Click | Capture the mouse to look around (Esc releases it) |
| W A S D / arrows | Move |
| Shift | Run (walk) / boost (fly) |
| F | Switch between walking and flying |
| Space | Jump (walk) / up (fly) |
| E / Q | Up / down (fly) |
| G | Ghost: walk and fly through walls and buildings, to look inside; G again to bump into them |
| T | Turn the view along walls you run into: on / off |
| L | Library: place vehicles and site pieces, flatten areas |
| V | Drive the selected or nearest vehicle or machine (race mode); V again to get out |
| Space (excavator) | Hold to dig; Q / E swing, R / F reach, X dump side |
| P | Model placement panel |
| H | Help |

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
equipment (excavators, loaders, a dozer, graders, rollers, cranes, lifts, telehandlers, forklifts,
dump trucks...), site office trailers, containers, dumpsters, barriers, fencing, traffic control,
porta-potties, pallets and more, all at real scale and not tied to Neptune, so the same library works
at any site. What each downloaded machine is and where it came from is in
[docs/equipment.md](docs/equipment.md).

- **Place:** click an item, move the mouse over the ground and click. Or drag the item onto the scene.
  **R** or the mouse wheel rotates it, **Shift**+click places another, **Esc** cancels.
- **Edit:** click a placed item to select it, drag it to move it, **R** / **Shift+R** to turn it,
  **Delete** to remove it. **P** shows its exact position and heading.
- **Look around** while editing by holding the right mouse button.
- **Save:** what you place is saved in this browser. **Export layout** downloads it as a file and
  **Import** loads one, e.g. to share a layout or move it to another computer.
- **Flatten area** (top of the list): drag a rectangle on the ground and everything in Google's 3D
  mesh inside it (rail cars, parked trucks, a shed) is pressed flat to the lowest ground around it,
  to clear space for a layout. Draw it a little bigger than what you want gone: Google's mesh is made
  of large triangles, and ones that cross the edge slope up to the uncleared side. Areas show as red
  boxes while the library is open; select one to move, turn, resize (**P**) or delete it, which brings
  the original back. It only changes what this app draws; Google's data isn't touched.

Two kinds of items:

- **Built in** (`src/procedural.js`): simple standard pieces generated in code at exact North American
  dimensions, e.g. a 10 ft New Jersey barrier, 20/40 ft ISO containers, a 12 x 60 ft site office trailer,
  20/40 yd roll-offs. Add more there.
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

## Planning a site: laydown areas, cuts and stockpiles

The tools at the top of the library (**L**, under *Tools*) mark out and shape the ground. Each one is
drawn by dragging a rectangle on the ground (lined up with the way you're looking) or clicking a spot,
and is then selected, moved, turned, resized (**P**) and deleted like any other item.

- **Laydown area:** a coloured rectangle laid on the ground with its name, size and area floating
  above it, e.g. *Laydown A · 40 × 25 m · 1,000 m²*. The P panel sets its name, colour and a note, and
  counts the items inside it. See [docs/laydown.md](docs/laydown.md).
- **Excavation:** the rectangle is the top of the cut. It digs itself to its depth (2 m to start)
  with sloped or shored sides; the P panel shows the cut volume, the loose volume (a quarter more) and
  how many dump-truck loads that is, and **Spoil pile** pours the dug material beside it.
- **Stockpile:** click for a cone of material (50 m³ to start), or drag for a ridge pile that fills
  the rectangle. It pours itself: material falls and builds up at the material's natural slope
  (gravel, sand, topsoil, excavated soil, road base, riprap, coal, potash). The P panel shows its
  volume, weight, height and truck loads.
- **Flatten area:** see above; clears Google's mesh where you want clear ground.

Pits and piles are real ground: you can walk into a pit, drive over a pile, and things you place
sit on them. Volumes come out within about 1% of the textbook figure for the shape, measured from
Google's ground, so they are as good as the map. Details in [docs/earthworks.md](docs/earthworks.md).

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
boosts, **Space** hops, **C** switches between chase and bonnet cameras, **V** or **Esc** gets out and
parks it where it stopped. The speedometer shows km/h, your top speed and longest jump.

The construction machines drive too, at their own speeds: the dozer at 11 km/h, the wheel loader at
40, the crawler crane at walking pace (2 km/h) and the all-terrain crane at road speed (80), even with
its boom up. The cranes stand and turn on their carriers, and the cameras frame the carrier and look
out of the cab rather than from up the boom. The pickup tops out at 160 km/h (about 210 with boost), the semi at 120 and the haul truck at 70. The **Race**
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

Library items marked `"premium": true` in `library.json` (for now the cranes, lifts, forklift,
telehandler and container handler) form a **Pro equipment** pack, bought once through a Stripe
Payment Link. While it's locked, those cards show a **Pro** badge and picking one explains how to
buy it; Stripe's webhook tells the server who has paid. Layouts and share links with premium items
always open for everyone. It's **off** until the Payment Link, its id and the webhook's signing secret
are set, and then only in the app: the models are still public files. Stripe setup (test mode first),
testing with test cards and the known gaps are in [docs/premium.md](docs/premium.md).

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
src/walk.js         walk/fly controller with gravity, collisions, bounces and the view turn
src/models.js       loads and places your glTF models
src/placement.js    the P panel
src/raycast.js      fast raycasting (three-mesh-bvh) for walking and snapping
src/library.js      loads the library (downloaded models + built-in pieces)
src/procedural.js   built-in site pieces generated in code
src/sidebar.js      the library sidebar: placing, selecting, moving, drawing flatten areas
src/flatten.js      flatten areas: press Google's mesh flat inside a rectangle
src/drive.js        race mode: driving, jumps, speedometer
src/layout.js       saves placed items in the browser; export/import
src/kinds.js        placed things that aren't models (areas, pits, piles): how features register them
src/terrain.js      the ground that can be dug and piled: heights, volumes, drawing, saving
src/earthworks.js   excavations and stockpiles, and their tools; src/pour.js animates pouring
src/laydown.js      laydown areas: coloured site areas draped on the ground, with labels
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
