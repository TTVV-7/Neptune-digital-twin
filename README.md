# Neptune Terminals digital twin

A web app you can walk around in. It shows Neptune Terminals in North Vancouver using
Google's photorealistic 3D map, and you can drop your own detailed models on top of it.

- **Base layer:** [Google Photorealistic 3D Tiles](https://developers.google.com/maps/documentation/tile/3d-tiles),
  streamed with [3d-tiles-renderer](https://github.com/NASA-AMMOS/3DTilesRendererJS) and three.js.
  It covers the whole terminal, the berths, Burrard Inlet and the North Shore mountains.
- **Your models:** any `.glb` / `.gltf` file, placed by east/north metres from the terminal centre.
- **Controls:** first-person walking with gravity and collisions, or free flying.

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
`GOOGLE_MAPS_API_KEY` (also accepted: `GOOGLE_API_KEY`, `GOOGLE_API`, `VITE_GOOGLE_MAPS_API_KEY`;
case doesn't matter). Either put it in `.env.local` (copy `.env.example`), or set it in your shell
or cloud environment. `npm run dev` and `npm run build` read it when they start.

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
| P | Model placement panel |
| H | Help |

You start flying over Burrard Inlet, looking north at the terminal. Fly in over the terminal with **W**,
then press **F** to drop to the ground and walk. If you press F over the water you'll stand on the water.

## Adding your own model

1. Export or convert the model to **.glb** (see below).
2. Drag the file onto the page. It appears 20 m in front of you, sitting on the ground.
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

## Google's terms, in short

- Stream the tiles; don't download them or bake them into Blender or Unreal files.
- Keep the attribution visible. The app shows the Google Maps logo and the data providers in the
  bottom-right corner, plus a note that models you add are your own data, not Google's.
- Your own models must not be traced or otherwise derived from Google's 3D mesh. Build them from your
  own drawings, photos or scans.
- Read the current [Map Tiles API policies](https://developers.google.com/maps/documentation/tile/policies)
  before you share the site widely.
