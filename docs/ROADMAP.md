# Roadmap: from walkable model to digital twin

A digital twin has three parts:

1. **Geometry:** what the terminal looks like. This comes from data, such as Google's 3D tiles,
   your model, scans and drawings. Prompting can't invent accurate geometry of Neptune.
   Claude can only place, convert and build on data you provide.
2. **Experience:** walking, flying, clicking on things and sharing it. This is mostly code,
   and Claude can write it.
3. **Live state:** ships at the berths, tide, weather, equipment status and stockpiles. This makes
   it a *twin* rather than a model. It needs data feeds, and Claude can wire them up.

Work through the phases in order and make each prompt one step. Commit after every step that works,
so you can roll back.

---

## Phase 0: Walkable base (done)

Google Photorealistic 3D Tiles, walk/fly controls, drag-and-drop `.glb` models and a placement panel.
See the [README](../README.md).

## Phase 1: See the real terminal (done)

The app streams Google's tiles with a real key, and `SITE` is centred on the terminal: (0, 0) is on
the storage sheds, next to the coal stockpile. Keys 1–9 jump to the named viewpoints in `VIEWPOINTS`
in `src/config.js`.

**Prompts for later:**

> Change the start position so I spawn on foot on the apron at [describe the spot, or paste lat/lon
> from Google Maps: right-click → copy coordinates], facing [the water / the shiploader / east].

> Rename the viewpoints and add these: [Berth 1 at lat,lon], [car dumper at lat,lon], ...

## Phase 2: Bring in your model

**You do:** export your model to `.glb` (conversion table in the README) and put it in `public/models/`.

**Prompt (fill in the brackets, because this detail matters most):**

> I've added `public/models/[file].glb`. It was exported from [SketchUp / Revit / Blender / a drone scan],
> the units are [metres / feet / millimetres], it is [Z-up / Y-up], and its coordinates are
> [local, with no real-world position / UTM zone 10N NAD83 / BC Albers / a site grid].
> It covers [describe the area, e.g. the potash shed and the conveyor to Berth 2].
> Add it to `MODELS` in `src/config.js`. If it has real-world coordinates, calculate its exact
> position from them instead of eyeballing it. Then run the app and show me screenshots next to the
> Google mesh so I can check the alignment.

**Already in place:**

- `npm run optimize-models` shrinks big files (put originals in `models-src/`). See "Big models" in the README.
- `flatten: true` (or the tick box in the P panel) presses Google's mesh flat under a model, so its
  blobby buildings don't poke through yours. The footprint is the model's bounding rectangle.
  If that's too coarse for an L-shaped or diagonal model, ask:

> Flattening under `[file].glb` takes out too much around it. Flatten under the model's real outline
> instead of its bounding rectangle.

If the model is still too big after optimising (over 100 MB, or the browser runs out of memory):

> `[file].glb` is [N] MB after optimising. Convert it to 3D Tiles so it streams in pieces, and load it
> from `MODELS` like the other models.

## Phase 3: Add detail where Google is blurry

Google's mesh comes from aerial photos. Large sheds look fine, but thin steel such as conveyors,
shiploader booms, railings and rail cars melts at ground level. Choose the most important pieces and add detail.

> From the ground, these areas look melted: [list them or attach screenshots]. For each one, tell me
> whether it's best modelled by hand in Blender, scanned, or built procedurally in code, and why.

> Build a parametric three.js model of a [travelling shiploader / stacker-reclaimer / conveyor gallery]
> with these dimensions: [boom length, rail gauge, height, from drawings or photos]. Let me place several
> instances from `config.js`, like the other models.

> Here are photos of [equipment] from [angles]. Model it in Blender as a clean low-poly `.glb`
> under 50k triangles, using real dimensions [if you know them].

**Sketchfab model:** it is not downloadable. Contact `plowright.andrew` for the file and permission
first. If you get it, it's just another `.glb` for Phase 2.

**Scanning more of the site yourself:** Neptune is a secure marine facility. Drone or scanner work
needs permission from the terminal and the Vancouver Fraser Port Authority, as well as following
Transport Canada drone rules.

## Phase 4: Make it a twin (live data)

Start with public data, which proves the plumbing works. Then move to internal data.

**Ships (done):** live AIS through AISStream, relayed by the dev server. Ships are drawn to size, the
three berths show occupied or free, and Google's photographed ships at the berths are hidden.
See "Live ships" in the README. Next steps:

> Deploy the AIS relay as a Cloudflare Worker so the hosted site has live ships too, and keep the key
> as a Worker secret.

> Show ships that are on their way: list vessels whose AIS destination mentions Neptune or Vancouver,
> with their ETA, and the ships waiting at anchor in English Bay.

> Keep a log of berth arrivals and departures (ship, berth, times) and show the last week in a table.

**Trains**

There is no free, public live feed of train or rail car positions. Railways only share them with their
customers: CN has an API with GPS car locations for shippers, and Railinc's RailSight covers North
American rail cars. The terminal's own systems know the most, such as unit train arrival schedules,
car counts and car dumper or unloading logs. The Port of Vancouver's Connect+ dashboard has
daily rail figures by terminal, but nothing live. Start with whatever the terminal can export:

> Here is a sample of our rail data: [paste a few rows of train arrivals / car dumper log / CN or
> Railinc car location messages], with columns [...]. Show the trains that are on site or due today,
> draw the cars on the tracks of the rail loop, and colour them loaded or empty.

**Conditions**

> Add a conditions panel: tide height from DFO's IWLS API (station 07735, Vancouver), plus wind and weather
> from Open-Meteo for the terminal. Refresh every 5 minutes. Show the wind as an arrow in the scene.

**Your operations data:** start with a file and switch to a live feed later.

> Here is a sample export of [stockpile volumes / equipment status / rail car arrivals]:
> [paste a few rows or attach a CSV] with these columns: [...]. Load it from `public/data/`, make each
> [stockpile / machine] clickable with an info card, and colour equipment by status
> (running / idle / fault).

> Replace the CSV with a live feed from our [PI historian / SCADA / MQTT broker / REST API] at
> [details]. Design a small backend that reads it and serves the twin. This is internal data,
> so include authentication, and explain the security choices.

> Add a time slider that replays the last 24 hours of vessel movements and equipment status.

## Phase 5: Share and polish

> Add touch controls (a virtual joystick and drag to look) so it works on phones and tablets.

> Add a WebXR mode so I can walk the terminal in a Quest headset.

> Add a minimap in the corner showing my position and heading on a 2D map of the terminal.

> Deploy this to [Cloudflare Pages / Vercel / GitHub Pages] behind a login, and restrict the Google
> key to that domain.

---

## Prompting tips

- **One step per prompt.** "Add ships" works better than "make it a digital twin".
- **Give facts, not vibes:** file names, units, axis conventions, coordinate systems, lat/lon from
  Google Maps, and screenshots of what's wrong.
- **Say what "done" looks like:** "I should be able to walk up the conveyor gallery stairs."
- **Ask for proof:** "Run it in the headless browser and show me screenshots before you commit."
- **Say what must not change:** "Don't touch the controls or `config.js` layout."
- **Keep one source of truth.** Positions and settings live in `src/config.js`, so ask for new
  things to be configured there too.

## Bigger decision: web app or game engine?

This project is a **web app**: anyone with the link can open it, with nothing to install. If you later
want film-quality lighting, VR on a PC headset, or physics-heavy simulation, the same data (Google tiles
plus your `.glb` files) works in **Unreal Engine 5 with Cesium for Unreal**. You can ask Claude to
compare the two once Phases 1–2 are done and you know what you need.
