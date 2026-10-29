# Neptune Terminals digital twin

A web app you can walk around in. It shows Neptune Terminals in North Vancouver using
Google's photorealistic 3D map, and you can drop your own detailed models on top of it.

- **Base layer:** [Google Photorealistic 3D Tiles](https://developers.google.com/maps/documentation/tile/3d-tiles),
  streamed with [3d-tiles-renderer](https://github.com/NASA-AMMOS/3DTilesRendererJS) and three.js.
  It covers the whole terminal, the berths, Burrard Inlet and the North Shore mountains.
- **Your models:** any `.glb` / `.gltf` file, placed by east/north metres from the terminal centre.
  Big ones are compressed by `npm run optimize-models`, and Google's mesh can be flattened under them.
- **Controls:** first-person walking with gravity and collisions, free flying, and viewpoints on keys 1–9.

The step-by-step plan, with prompts you can paste to Claude, is in [docs/ROADMAP.md](docs/ROADMAP.md).

## Quick start

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
```

```bash
npm run dev
```

Open the URL it prints, usually http://localhost:5173. Paste your Google API key when asked,
or click **Continue without Google tiles** to try the controls on flat ground.

To skip the prompt each time, give the app the key through an environment variable named
`GOOGLE_MAPS_API_KEY` (also accepted: `GOOGLE_API_KEY`, `GOOGLE_API`, `VITE_GOOGLE_MAPS_API_KEY`;
case doesn't matter). Either put it in `.env.local` (copy `.env.example`), or set it in your shell
or cloud environment. `npm run dev` and `npm run build` read it when they start.

## Getting a Google API key

1. Go to the [Google Cloud console](https://console.cloud.google.com/) and create a project.
2. Turn on billing. The Map Tiles API has a monthly free allowance, but it still needs a billing account.
   Set a budget alert while you're there.
3. Open **APIs & Services → Library**, search for **Map Tiles API** and enable it.
4. Open **APIs & Services → Credentials → Create credentials → API key**.
5. Restrict the key: under *API restrictions* allow only **Map Tiles API**. Under *Website restrictions*
   add `http://localhost:5173/*` and, later, the address where you host the site.

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
| P | Model placement panel |
| 1–9 | Jump to a viewpoint (also listed under H) |
| H | Help |

You start flying over the water, looking north at the terminal. Press **F** to drop to the ground and walk,
or **4** / **5** to start on foot at the west berth or by the coal pile. The viewpoints are `VIEWPOINTS` in
[src/config.js](src/config.js). To add one, go to the spot and copy *east*, *north* and *heading* from the
panel in the top-left corner.

## Adding your own model

1. Export or convert the model to **.glb** (see below). If it's bigger than about 20 MB, optimise it
   first (see [Big models](#big-models)).
2. Drag the file onto the page. It appears 20 m in front of you, sitting on the ground.
3. Press **P**. Line the model up with the Google mesh using *east*, *north*, *heading* and *scale*,
   or walk to where it belongs and click **Move to where I am**.
4. Tick **flatten Google under it** if Google's version of the same building pokes through yours.
   It presses Google's mesh flat inside the model's footprint, plus 2 m around it, down to the model's base.
   Ground and water lower than that are left alone.
5. Click **Copy config**, copy the file into `public/models/`, and paste the entry into `MODELS` in
   [src/config.js](src/config.js). It will now load every time.

By default the model is recentred, so *east/north* is the middle of its footprint and *up* is its base.
That stops CAD files with real-world coordinates (UTM eastings in the hundreds of thousands) from
landing kilometres away. Add `recenter: false` to an entry to keep the file's own origin.

**Heading 0** assumes the model's +X axis points east and its +Y (Blender/SketchUp/CAD) points north.
If your model comes in back to front, try heading 180.

### Converting to .glb

| You have | Route |
| --- | --- |
| Blender `.blend`, `.fbx`, `.obj`, `.dae` | Import into [Blender](https://www.blender.org/), then *File → Export → glTF 2.0 (.glb)* |
| SketchUp `.skp` | SketchUp's glTF exporter extension, or export `.dae` and go through Blender |
| Revit `.rvt` / IFC | Export IFC or FBX, then Blender (the free Bonsai add-on reads IFC) |
| AutoCAD `.dwg` | Usually 2D. Ask for a 3D export, or rebuild the key parts in Blender |
| Drone or laser scan (`.las`, `.e57`, mesh) | Mesh it in RealityCapture, Metashape or CloudCompare, then export `.glb` |

## Big models

1. Put the original `.glb` / `.gltf` in `models-src/`. Git ignores that folder, so a huge file can't
   be committed by accident.
2. Run:

   ```bash
   npm run optimize-models
   ```

   It writes a compressed copy to `public/models/` and prints the sizes before and after. It uses
   [gltf-transform](https://gltf-transform.dev/) for meshopt geometry compression and WebP textures,
   merges parts into fewer draw calls, and simplifies the mesh only where the change is under 0.01% of the model's size.
   Files often end up 5–20 times smaller. Useful options (put them after `--`, e.g.
   `npm run optimize-models -- --texture-size 4096`):

   | Option | Effect |
   | --- | --- |
   | `--texture-size 4096` | Keep sharper textures (default 2048). Bigger textures use much more GPU memory. |
   | `--keep-parts` | Don't merge named parts, e.g. so equipment can be made clickable later. Slower to draw. |
   | `--no-simplify` | Keep every triangle. |
   | `--force` | Redo files that are already up to date. |

3. Add the new file to `MODELS` in `src/config.js` (step 5 above).

While a big model loads, the status panel shows its progress. The page then pauses briefly on
*preparing*, about a second per million triangles, while it builds a collision index. Without that
index, walking on a model with millions of triangles would drop to a few frames per second.

**Where to keep the file depends on its size after optimising:**

| Size | What to do |
| --- | --- |
| Under 100 MB | Commit it in `public/models/` like any other file. Under 50 MB is better: GitHub warns above that. |
| 100 MB to about 1 GB | GitHub refuses files over 100 MB. Use [Git LFS](https://git-lfs.com/) (it has storage and bandwidth quotas), or put the file in cloud storage (Cloudflare R2, Amazon S3, Google Cloud Storage) with CORS enabled and use its full `https://` address as the `url`. |
| Several GB, or the browser runs out of memory | Convert it to [3D Tiles](https://www.ogc.org/standards/3DTiles/) so it streams in pieces, like Google's mesh does. Cesium ion or the open-source *obj2tiles* can do the conversion. Ask Claude to add 3D Tiles loading when you get there. |

Some hosts limit file size: Cloudflare Pages, for example, refuses files over 25 MiB. For a model
bigger than that, use cloud storage or 3D Tiles.

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
src/walk.js         walk/fly controller with gravity and collisions
src/models.js       loads and places your glTF models
src/placement.js    the P panel
src/geo.js          lat/lon <-> local metres
public/models/      optimised .glb files that the app loads
models-src/         original models (not committed); `npm run optimize-models` reads these
scripts/            the model optimiser
```

The scene uses metres with the origin at the terminal centre (`SITE` in `config.js`):
+Y is up, +Z is north and +X is west. Always go through `enuToLocal()` / `localToEnu()` in `geo.js`
rather than setting x/z by hand.

## Building and hosting

```bash
npm run build
```

`dist/` is a static site, so it can go on GitHub Pages, Netlify, Vercel or Cloudflare Pages.
Add the site's address to the API key's website restrictions.

## Google's terms, in short

- Stream the tiles; don't download them or bake them into Blender or Unreal files.
- Keep the Google attribution visible. The app shows it in the bottom-right corner.
- Read the current [Map Tiles API policies](https://developers.google.com/maps/documentation/tile/policies)
  before you share the site widely.
