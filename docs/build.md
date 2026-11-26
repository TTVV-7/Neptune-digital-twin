# World Drive Build

**worlddrive.app/build/**: the construction mock-up app (this repository's own app) offered to
anyone, on World Drive's site and accounts, with a free plan and a paid one, **Build Pro**. It's a
trial for now: the same app as the Neptune twin, built a second way, kept apart from both the game
and the Neptune twin.

- **`/build/`, the dashboard** (`drive/build/index.html`, `src/build-home/`): *Where's the site?*
  Type an address (World Drive's place search) and pick a result to open the editor there; your
  saved projects, each opening the editor at its site with it loaded; your plan, with the month's
  3D map views as a gauge and Go Build Pro (or Manage billing); Google sign-in. It never
  takes a 3D map view (it asks `/build/api/home`). Stripe's checkout brings buyers back to
  `/build/account/?checkout=done#billing` (or `/build/?checkout=cancelled`).
- **Buying is hidden for now (`BUILD_SALES`).** Unless the Worker's `BUILD_SALES` setting is
  `on` (unset by default, as now), nothing in Build offers Build Pro for sale, whatever Stripe's
  settings: no prices, no Go Build Pro, Subscribe with Stripe or monthly/yearly choice, no "Build
  Pro opens soon", no renewal lines, and `POST /build/api/billing/checkout` answers 404 ("Build Pro
  isn't available to buy right now"). The plans and their limits are exactly as below: free
  accounts keep the 33 items, 15 3D map views a month and 1 project, and Build Pro comes from the
  owner's comps, `BUILD_EMAILS` or `ADMIN_EMAILS`. The server says so in every plan payload
  (`/build/api/config`, `me`, `home`): `premium.billing` is `{ enabled: false, hidden: true,
  monthly: null, annual: null, portal }`, with no `premium.price`, and `plan.priceLabel` is null.
  The pages follow it: the editor's Build Pro dialog says the item is part of Build Pro, which
  isn't available to buy right now, with just OK; the dashboard's plan box shows the plan, what it
  includes and the 3D map view gauge (signed out, the Free and Build Pro cards without prices);
  the account page's `#billing` section is titled **Plan**, with payments and the refund line only
  for an account that has paid; the MCP server tells a free account its tools are part of Build
  Pro, with nowhere to buy. A free account's second project is refused with "Open or delete your
  project below" (no "or go Build Pro"), the Profile mentions receipts and billing only for an
  account that has paid, and a stale return link (`?checkout=done`, `?checkout=cancelled`,
  `?premium=thanks`) is tidied from the address and says nothing. `billing/portal` still opens for
  an account with a Stripe customer (`portal: true`), so anyone who ever paid can cancel and see
  invoices. The legal pages (`/build/terms/`, `/build/refunds/`, `drive/site/legal.js`) are built,
  not served by the Worker, so they read `BUILD_SALES` from the **build's** environment (the
  shell, or a `.env` file, when `npm run build:drive` runs): unset, the Terms say Build Pro isn't
  for sale and nothing is charged (no price, checkout or renewal), and Refunds says there's nothing
  to pay for, with how anyone who has paid before cancels and gets a refund. All the billing code is
  kept: set `BUILD_SALES` to `on` (with Stripe set up, "The owner's steps") and everything below
  about buying is back as it was.
- **Upgrading** (with `BUILD_SALES` on; the dashboard's plan box and the editor's Build Pro dialog, `src/premium.js`):
  monthly or yearly (yearly first, shown as "US$50/year - 2 months free"), then **Go Build Pro**
  (**Subscribe with Stripe** in the editor) asks the server for a Checkout Session
  (`billing/checkout`) and goes to Stripe's page in the same tab. Every such button has "Renews
  automatically every month/year until you cancel. Cancel any time in your account." beside it.
  Signed out, it asks to sign in first; until Build Pro is on sale it says it opens soon. Build Pro
  accounts get **Manage billing** (`billing/portal`, Stripe's billing portal) and a link to
  `/build/account/#billing`. The dashboard says when a renewal's payment failed ("Payment failed -
  update your card"), when Pro ends ("Pro ends on 3 Jan 2027"), and, back on `?checkout=done` or
  `?checkout=cancelled`, asks `/build/api/me` every 3 s (10 times) until Build Pro shows, or says
  nothing was charged.
- **Plan copy** (names, what each includes, the limits people are told) is in one module,
  `src/build-plans.js`, which every page that shows the plans imports; its limits match
  `limitsOf()` in `worker/drive/build.js`. Prices are never in it: they come from the server
  (`premium.billing.monthly` and `.annual`).
- **`/build/account/`, the account page** (`drive/build/account/index.html`, `src/build-account/`,
  `worker/drive/build-account.js`): one page, a section for each of Profile, Sign-in & security,
  Plan & billing, Usage, Branding, Connected apps, Share links, Your data and Delete account
  (`#profile` ... `#delete`). Linked from the dashboard's top bar and the editor's account area
  (Build only). See "The account page" below.
- **`/build/app/`, the editor**: the construction app, at `?at=lat,lon&place=Name`, opening
  `?project=<id>` from the dashboard; **Projects** (top) goes back to the dashboard and **Site**
  moves the project.

## What people get

| | Free | Build Pro | Owner |
|---|---|---|---|
| Who | anyone signed in with Google | a subscription bought through Stripe Checkout (US$5/month or US$50/year; only while `BUILD_SALES` is `on`), given by the owner (comps), or listed in `BUILD_EMAILS` | `ADMIN_EMAILS` (World Drive's owner) |
| Library | 33 everyday items (`FREE_ITEMS` in `src/product.js`) | everything, sets included | everything |
| 3D map views a month | 15 (`BUILD_FREE_MONTHLY`) | 300 (`BUILD_PRO_MONTHLY`) | unlimited, not counted |
| Saved projects | 1 | 200 (`BUILD_LAYOUT_LIMIT`) | 200 |
| Share links | no | yes (their viewers get the map on the owner's views) | yes |

- **A 3D map view** is a page load that's handed the Maps key: one billed Google 3D tiles session
  (about US$0.006). Signed out, or past the month's views, the page opens on flat ground and says
  why; everything else works.
- **Free views for everyone together** are capped at `BUILD_FREE_DAILY` a day (200: at most about
  US$1.20 a day), then free accounts get flat ground till midnight UTC.
- **The site** is wherever the project is: the **Site** button (top) searches an address (World
  Drive's place search) and reloads the page there (`?at=lat,lon&place=Name`). Projects are saved
  per site.
- **What's locked:** picking a Pro item (or a set with one) opens the **Build Pro** dialog. Already
  placed items, saved projects and shared links open for everyone, as with the Pro equipment pack.
- Left out of Build: the Neptune project's own models (`public/models`, `MODELS` in config.js), the
  race pieces, and the key prompt.

## Flatten areas: grading

A flatten area (the library's **Flatten area** tool, `src/flatten.js`) presses whatever stands in
Google's mesh inside it flat and can be surfaced (gravel, asphalt, concrete...) and fenced. Its
**ground** (P panel) says what shape the finished ground takes (`src/grade.js`, shared by the
flattening, the terrain and the surface so they agree):

| ground | what it is | its settings |
| --- | --- | --- |
| level (dead flat) | one height: the ground's median under a surfaced area, its lowest under a bare one. Areas saved before grading are level and save as they did (nothing about grading is saved for a level area). | |
| follow the ground (smoothed) | **new areas start with this** (the next area takes whatever was chosen last). A smoothed copy of the bare ground that follows the grade as it changes across the area (steeper at one end, a hump, a bend in the hillside). The ground is read on a grid about 2 to 3 m apart reaching one smoothing radius beyond each edge (33 × 33 readings at most, wider apart on large areas); what stands on it (a roof, a car, a stand of trees) is found as in point-cloud ground filtering (a progressive morphological filter whose openings may drop as far as 50% ground falls, then fit, leave out what stands more than 0.75 m above, fit again, coarse to fine) and left out, while ground that rounds over (a crest, a ridge, the rim of a cut) is kept: readings above the fit no further than it bows there, rising from the readings round them without a step bigger than ground at 50% climbs between readings (plus 0.5 m), are ground; then at each grid node a plane is fitted through the readings round it, Gaussian-weighted over the smoothing but never narrower than the readings are apart (so on a large area a small smoothing still has readings round every node; where something left out leaves too few round a node, or leaves them all to one side of it, the plane through those a little further off rather than one tipped out to it), and read between nodes bilinearly (`src/grade.js` `fitSurface`). | smoothing (m, 2 to 50, 10 to start: small hugs the ground, large is gentle); steepest (%, 0 = as the ground) caps every part of it, easing the steep parts and leaving gentle ones following the ground, with as much cut as fill |
| best-fit plane (one slope from the ground) | one plane fitted by least squares through the ground under it (7 × 7 readings, with what stands well above a first fit left out): what "follow the ground" was before it was smoothed | steepest (%) caps it |
| one slope | one plane through the area's middle height, falling toward a side | fall (0.5 to 20 %), falling toward front, back, left or right (front is the way it faces) |
| crowned (ridge down the middle) | a ridge along its length or width falling to both sides, set so half is above the middle height | fall (%), ridge runs along its length or width |
| swale (valley down the middle) | the same upside down | fall (%), swale runs |
| terraces (level benches) | 2 to 8 level benches stepping down the ground's fitted slope (along whichever side it falls more), joined by short batters | benches |

- **Batters.** Graded (anything but level), the area's edge meets the ground on batters at its
  **edge batters** ratio (1.5, 2 or 3 horizontal to 1 vertical, 2 : 1 to start): an embankment
  falling away where the area is above the ground, a cut slope climbing where it's below, out to
  30 m at most. The terrain (`src/terrain.js`, `composeGrading`) draws the graded ground and its
  batters, hides Google's mesh above them, and is what you walk and drive on. Batters meet the bare
  ground, not the tops of trees and houses round the area (read against the plane fitted under the
  area, the smoothed ground for a followed one, carried on beyond it: no higher than the lowest
  ground within 3 m, nor 1 m above that); what stands beyond
  them is left as it is.
- **Google's mesh** is pressed down onto the graded shape inside the area (a grid shape in
  `TileFlatteningPlugin`); where the area is built up above Google's ground, the terrain's drawn
  embankment and pad cover it.
- **The surface and the fence lie on the shape:** the gravel or asphalt is a grid on it with a thin
  edge (the batters take the place of the level pad's deep sides), each fence panel stands on the
  ground under its two ends, gates at their hinges.
- **Where overlapping**, the lowest graded height wins inside the areas (as the level floor always
  did); a pit dug in a graded area starts from the lowest of its shape over the pit.
- **Reading the ground** for a followed area is up to 1,089 raycasts against Google's tiles, so
  `models.js` (`readSurface`) reads a few milliseconds' worth a frame and keeps them: it reads
  again only when the area is moved, turned, resized or smoothed differently, or the ground under
  it changes (sharper tiles change the 7 × 7 plane). While it reads, the plane stands in (so an
  area being dragged lies on the plane and settles onto the smoothed ground once let go), or what
  was read before while it's where it was. What's fitted (`params.fit`, never saved) counts as a
  change only when it moves by more than about 2 cm anywhere (`sameFit`), so it doesn't refit in a
  loop. Areas saved with `follow` load onto the smoothed ground; the usual 10 m isn't saved.
- **Raising and lowering** (`src/raise.js`, `flatten.js` `raise` / `finished`): a selected area
  has an up-and-down arrow in its middle (`handles.js`); dragged up the screen it raises the whole
  design (pad, every graded shape, batters, surface, fence) live, down lowers it, in 0.05 m steps
  (0.01 m with Shift), and the label beside it says by how much and, for a graded area, the earth
  that comes to ("+0.75 m (cut 120 m³ / fill 340 m³)"). **PageUp / PageDown** raise or lower it
  0.25 m, 0.05 m with Shift, 1 m with Ctrl or Cmd (or Alt: some browsers keep Ctrl+PageUp for their
  tabs). The P panel has **raise / lower (m)** with − and + (0.25 m), **exact finished height** (a
  height as the panel's "up": metres above the site's origin) with its own number, − and +, and
  **Back to the ground's height**. The raise is kept relative to the ground's height the area snaps
  to (models.js `snap()`: `entry.groundUp`, then the kind's `snapLift`), so an area moved elsewhere
  keeps it; an exact height stays where it is wherever the area goes, the ground under it changing
  only its batters and earth moved. ±30 m at most. The batters meet, and the cut and fill are
  reckoned against, the ground's height, not the raised design (`terrain.js` `zone.plane` from
  `flatten.js` `liftNow`). A level pad raised shows its sides down to the ground (as deep as it's
  raised). Saved with the layout only when not 0 (`raise`), or `finished`; areas saved before load
  at the ground's height and save as before. Each change (a drag let go, a key, a field, a − or +,
  the exact-height box, Back to the ground's height) is one undo step: **Ctrl/Cmd+Z** undoes,
  **Ctrl/Cmd+Shift+Z** or **Ctrl+Y** redoes (`src/history.js`, in `sidebar.js`; while the library is
  open or something is selected). An area deleted and put back with the Undo toast is a new entry:
  its steps follow it there (the delete is a step itself, `sidebar.js` `deleteItems`, whose undo
  calls `history.replace`; the toast's Undo undoes that step, so Ctrl+Y deletes it again); a step
  whose area is gone for good says so rather than doing nothing. Opening another layout (a project, a share link)
  or clearing everything clears the steps (`layout.onReplace` → `history.clear`). The P panel's −
  and + keep the focus once clicked, but only a field being typed in is left alone by its refresh
  (`placement.js`), so the number still follows PageUp and undo meanwhile. With keep what's
  overhead, what's kept is measured from the raised floor.
- **Ground from the coarsest tiles is never used.** While the camera moves (and as tiles refine and
  fade) Google's globe-level tiles (a geometric error of kilometres) can be all a vertical line
  meets, or the first it meets; in North Vancouver they lie about 1,500 m above the ground. A graded
  area's smoothed ground was read a few milliseconds a frame without asking how coarse each reading
  was, after the plane through it had been read from fine tiles: one read while the camera moved
  took the globe's height, was kept as if as fine as the plane (`readSurface`), and nothing finer
  replaced it, so the pad, its batters (a brown tower) and everything on it went 1,500 m up for
  good. Now `flatten.js` `originalHeight` takes the finest tile along the line, readings from tiles
  coarser than `MAX_GROUND_ERROR` (300 m, `grade.js`) are left out of snapping (`models.js`), the
  plane, the smoothed ground and the earthworks' ground (`terrain.js` `sample`), a smoothed ground
  says how coarse the coarsest reading in it was (and is read again, every 5 s at most, while that's
  coarser than the plane), and one more than 50 m from the plane through the same ground is
  thrown away and read again.
- **The P panel** says how it's graded ("follows the ground, smoothed over 10 m: 4-11% down to the
  south-west", the least and most steep of its cells, leaving out the odd tenth at each end; "one
  slope from the ground: 6.8% down to the south-west" for the plane), with the
  **cut (bank)** and **fill (compacted)** in m³ against the bare ground, batters included; the
  resize label says it in a few words.
- **Claude (MCP):** `add_flatten_area` takes `grade` (`level`, `follow`, `plane`, `slope`,
  `ridge`, `valley`, `terraces`; `follow` if left out), `fall`, `toward`, `ridge_along`, `steps`,
  `smoothing` (follow), `max_grade` (follow and plane), `batter`, `raise` (m, −30 to 30) and
  `finished_height` (m as the editor's "up", instead of raise); numbers are clamped to what the
  editor offers, unknown words refused.
- **Tests:** `npm run test:grading-ui` (each grade's heights on a tilted stand-in ground; on a
  hillside that isn't a plane, 3% steepening to 15% and turning, with a hump, a shed and a tree,
  following the ground stays within 0.3 m of the bare ground where the best-fit plane is over 2 m
  out, the smoothing changes how closely it hugs, the steepest caps it, it saves and loads; the
  embankment and cut slope at the batter ratio, the earth moved, saving and loading, a pit's
  floor), `npm run test:grade-surface` (the smoothed ground in Node: a small smoothing on a large
  area still on a curved hillside, a crest, a dome and a road cut's rims followed as a valley is,
  and a shed, a car, a stand of trees and a 30 m building still left out), with
  `test:sets-flatten-ui`, `test:excavation-ui` and `test:build-mcp`. Raising and lowering (`test:grading-ui`): the arrow dragged up
  (0.05 m steps, its label, more fill and less cut), PageUp, Shift+PageDown, Ctrl+PageUp, each
  undone and redone, the P panel's number, − and +, + clicked for real (focused) still showing
  PageUp and undo and going on from there, an area deleted and put back with the toast's Undo still
  undoing its raises, another layout clearing the steps, an exact height that stays put when moved and
  goes back to a raise where it stood, Back to the ground's height, a raise kept when moved, saved
  and loaded (and one saved before at the ground's height, saving as before); every shape, a level
  floor and one keeping what's overhead shifted 1 m whole. And ground read from the coarsest tiles
  (1,500 m up) while a follow area reads its smoothed ground: it never goes up, and settles when
  the readings are right again.

## Flatten areas: walking on them, and keeping what's overhead

- **The floor is the ground.** `TileFlatteningPlugin` only ever presses Google's vertices *down*,
  and only vertices: a surfaced level pad snaps to the ground's median, so about half of it is
  built up over lower ground with nothing at its height to stand on, and Google's large triangles
  crossing its edge kept their slope inside it (a walker climbed them, up to 3.4 m above the pad).
  So a level area (and one too large to grade, over 300 m) now holds its floor in terrain chunks
  of its own over its rectangle (`terrain.js` `updateZone`, `zone.height`, made over the next
  frames by `ensureSoon`), as a graded one does: the floor is drawn, walked and driven on (the
  walker and the driver use the same colliders), and Google's mesh above it is hidden by the mask
  and passed through by `covers()`. With the stand-in ground too. No batters: a surfaced level pad
  still shows its deep sides where it's built up, as before. The gravel or asphalt itself is
  `noCollide` (3 cm above the floor). Over about 500 m square (`MAX_FLOOR_CHUNKS`) an area is only
  pressed down, as before. The ring of terrain nodes just outside the area (drawn with it) is read
  from above, so beside a tree or a roof it rose to that as a spike of earth off the edge; it's
  drawn no higher than the lowest ground outside the area within 3 m, nor than the ground within
  6 m rising at 30% from there (`EDGE_REACH`, `EDGE_SLOPE`: a conifer's crown is wider than 3 m),
  nor lower than the edge's floor (`terrain.js` `zoneLips` and `edgeGround`, as `lipHeights` does
  round a pit), so where the area is dug into a hillside the cut face still rises to the ground. A
  node read more than 2 m above that is marked standing (below), so the tree shows there; a small
  nub of earth can remain where the ground under a wide crown is guessed high.
- **Trees beside an area's edge** (`terrain.js` `edgeLips`). The ground round an area is read from
  above off Google's mesh, so beside a stand of trees it is the trees' crowns. The ring of nodes
  drawn just past what an area changes, and the drawn cells' outer corners past that, were at that
  height: on a treed hillside (a 60 × 40 m follow pad at east −1000, north 4250) they stood round
  the pad's back edges as brown faces of earth up to the crowns, 15 to 20 m high (the cells from the
  batter's foot up to them, in the cut colour). Now, round every area that holds its ground in
  chunks (graded or level): the ring round a graded area is drawn no higher than the bare ground its
  batters meet there (`chunk.bare`, from `composeGrading`) or the highest it changed within two
  nodes; any node there (a cut batter's included) whose ground as read is more than 2 m
  (`LIP_TALL`) above that is what stands there (`chunk.standing`): it is drawn at the ground,
  and Google's mesh over it isn't hidden (the mask and `covers()` leave it out), so the trees stand,
  their crowns' sides draped down to the pad's edge as Google made them, and walking bumps into
  them. (Google's mesh is a shell over the trees with nothing under a crown: cutting a crown off
  cleanly would leave a hole to the sky, so they're kept.) Small slivers of sky can still show
  where a crown hangs over a batter's foot. A fill embankment's nodes are never standing: raised,
  a pad's embankment buries the trees and sheds under it, hidden and walked on as earth (a 60 × 40 m
  follow pad raised 3 m showed crowns through its fill before).
- **Drawn over the pad.** The surface is drawn after the ground without writing depth
  (`SURFACE_ORDER`), so anything drawn before it went under it. What's placed was already drawn
  after it (`PLACED_ORDER`); now the walking character (`player.js`), a repair crew, a truck's load
  and the plane's parachute are too (`src/draw-order.js`'s `drawnAfterGround`).
- **Keep what's overhead** (P panel, `keep`): *nothing* (flatten everything, as areas always did),
  *auto* (bridge decks, viaducts, canopies), or *everything above a height* (the old "flatten up
  to", now shown only with that choice; areas saved with a height load as that and save as before;
  picking it with no height sets 5 m). Auto is saved as `keep: 'auto'`.
- **How auto works** (`flatten.js`, Overheads): over the area (and 1 m round it), on a 1 m grid
  (coarser over big areas, 10,000 lines at most), Google's mesh *as it was* is read along vertical
  lines (a vertical ray crosses the same triangles before and after pressing, so heights and facing
  come from the plugin's saved original vertices): the lowest surface facing down (an underside)
  at least 2.5 m (`CLEARANCE`) above the floor, looked for upwards from there, means open space
  under it: kept from 0.3 m under it up. Pillars and gaps in a deck within 3 m are closed over;
  a line with something above the clearance but no underside there (a pillar) is kept whole, so
  pillars stand, as obstacles. Patches under 12 m² (a tree's crown) are flattened. The flattening
  (a subclass of the plugin with a per-vertex limit, `AreaFlatteningPlugin`) keeps the lowest of
  that within 2 m, so a deck's lumpy underside isn't dragged into spikes; the terrain's mask hides
  Google's mesh from the floor up to the underside (per node `ceiling`, now also on the ring of
  nodes just outside an auto area, where the ground read from above is the deck and is drawn at the
  floor instead; not round one kept above a height, whose ring is the ground beside it, as for one
  keeping nothing). Curtains (Google's photogrammetry hangs walls of smeared texture from a deck's
  edge to the ground) have their feet pressed and the rest hidden, and walking and driving pass
  through them; the deck above still stops a jump. It's read a few milliseconds a frame (a quarter
  of the frame when frames are slow), again 3 s after more tiles load while the camera is within
  300 m of it (`RESCAN_NEAR`; farther off the tiles over it are coarse or not loaded, and flying
  round the city kept it busy), and from scratch when the area moves; until read, everything above
  2.5 m is kept. A read again from coarser tiles than the last (their geometric error on average
  along its lines over 1.1 times the last's) or seeing Google's mesh along fewer than 90 % of the
  lines the last did doesn't replace it, so flying away and back no longer loses the decks (they
  were pressed or cut through for about 50 s after coming back).
- **On real tiles** (under the Georgia and Dunsmuir viaducts, a 30 × 60 m level area): flattening
  everything presses both decks onto the floor (as level areas did before; there was no way to
  keep a deck but a height limit, under which a curtain's part above the limit stays as a wall to
  the deck, and these decks' undersides vary from 4 to 9 m above the floor); with *auto* both decks
  and their pillars stay, the curtains are gone, and the walker walks in from outside under the
  deck on the floor. Read along vertical lines, the Granville Bridge's deck over Granville Island
  (27 m up) has its underside captured the same way. Flown 4.5 to 6 km away and back, what's kept
  under both stays as first read throughout. What's left: small shards of curtain above the
  underside line. A level gravel pad on the hillside at (-40, 785) has no node of its ring more
  than 2 m above the ground there (70 before); its uphill side, dug about 8 m into the hill, shows
  the cut face. A bare level area (surface none) holds and draws its floor too, so it shows that
  floor rather than Google's photo pressed flat.
- **Claude (MCP):** `add_flatten_area` takes `keep_overhead` (`off`, `auto`, `height`) and
  `keep_above` (m, 0.5 to 200, 5 to start, for `height`); unknown choices are refused.
- **Tests:** `test:grading-ui` (a level pad's and a bare level area's ground is their floor where
  it's built up over the slope; the character is drawn after the pad; a stand-in overpass, a deck
  with curtains to the ground marked as Google's mesh, over an auto area: kept from under its
  underside, Google's mesh hidden to there, a curtain covered and walked through, a jump stopped by
  the deck; not read again from 5 km away with the overpass gone, read again back over it with what
  was found standing, and again with it back; round a level area kept above a height, the ground
  0.5 and 0.75 m outside its uphill edge is the slope and nothing's hidden there up to its limit, and
  a tree's crown read at a node just outside it is drawn at the ground, and a crown 12 m wide beside
  it too (under 2 m above the ground, where 7.9 m before) and marked standing; an 8 m tree
  overhanging a follow area's edge on the hillside: no drawn earth there rises more than 1.5 m
  across a cell, where 8 m before, and the tree is marked standing, and with the area raised 3 m
  nothing under its embankment is standing (72 nodes were)), `test:build-mcp`.

## Selecting several, copy and paste

The editor selects more than one thing at a time (`src/sidebar.js`), and copies and pastes them
(`src/clipboard.js`), with undo and redo for what's done to them (`src/history.js`).

- **Selecting.** A click selects one; **Shift+click** (or Ctrl/Cmd+click) adds another or takes one
  out. **Shift+drag on the ground** (library open) selects everything whose footprint is in the box
  or crosses it (a row by its line, not the empty ground in its box); on touch or a trackpad,
  **Select** on the edit bar turns a plain drag into a box. **Ctrl/Cmd+A** selects everything shown
  (not what's hidden by hand or by the Show panel, nor what loads for everyone: models from
  `config.js` and items saved for everyone, which Shift+click can still add). **Esc** selects nothing.
- **Seen as selected:** each one outlined in amber, one ring round them all with the turn knob,
  and the toolbar over them saying **N items** with Rotate left/right, Copy, Duplicate, Edit, Hide
  and Delete. The **edit bar** along the bottom (while the library is open, or several are
  selected; `src/edit-bar.js`) says how many are selected, with Select, Copy, Cut, Paste, Duplicate,
  Undo and Redo for touch. It keeps between the library and the Show and Controls panels, or goes
  to the top (under the status) where there's no room, and across the top on a phone.
- **Together:** dragging any of them moves them all, keeping where they are from each other, each
  settling on the ground where it lands (a flatten area with what stands on it moves with it, and
  they settle on the new ground). The knob, **R** / **Shift+R** and the toolbar turn them all about
  their middle (the mean of where they stand). **Delete** deletes them all, with one Undo. Hide
  hides them all. The **P panel** has them as one folder, **N items**: what they are ("2 Shipping
  container, 1 Flattened area"), the common actions, and, only when they're all the same kind (all
  flatten areas, all rows), that kind's numbers and choices, which change every one. Rows are moved
  and turned whole; nothing breaks one apart (a row saved for everyone never could be).
- **Copy, Cut, Paste, Duplicate:** **Ctrl/Cmd+C** copies what's selected (one or many), **X** cuts
  it, **V** pastes at the point on the ground under the pointer (from the edit bar, the middle of
  the view), laid out as copied and facing as they did, each snapped to the ground there; pasting
  again where the last went puts the next 2 m east and 2 m south of it, so they don't stack.
  **Ctrl/Cmd+D** duplicates in place, 2 m east and south. Pasted and duplicated things are new
  items, saved with the layout like anything placed (never shared or from `config.js`), and come
  out selected.
- **The clipboard** is kept in localStorage (`world-drive-build.clipboard`, listed in the Privacy
  Policy's `BUILD_STORAGE`): the items as saved (`toConfig`) with each one's offset from their
  middle, nothing about the project or account. So copying in one project and pasting in another,
  another tab, or at another site works. It also goes on the system clipboard as JSON (the copy
  event, or `navigator.clipboard` from the buttons) where the browser allows it, and Ctrl/Cmd+V
  takes the system clipboard's when it's newer (copied in another browser).
- **Build Pro:** a free account (or signed out) can't paste or duplicate Pro items: they're left
  out, with a toast saying how many ("2 Pro items weren't pasted: they need Build Pro"); the rest
  are pasted. Pro is judged as picking a card is (`sidebar.isLocked`), by the item, a row's item or
  a kind's own card. Cutting is the same: Pro items stay where they are, the rest are cut, and the
  Undo toast says how many were left ("Cut 1 item (1 Pro item wasn't cut: they need Build Pro)"),
  since paste wouldn't put them back.
- **Keys are left alone** while typing in a field (search, the P panel, a dialog), while text on
  the page is selected (Ctrl+C copies that), while a dialog is open and while driving. **Ctrl/Cmd+V**
  works only while building (the library open), and **Ctrl/Cmd+Z / Y** only then or with something
  selected, so pressing them out of habit while just looking round doesn't change the plan.
- **Undo and redo** (**Ctrl/Cmd+Z**, **Shift+Ctrl/Cmd+Z** or **Ctrl+Y**, the edit bar, and the
  Undo toasts after Delete and Cut) cover moving (by dragging), turning (keys, knob, toolbar; R
  pressed again and again is one step), resizing with a handle, deleting, cutting, pasting and
  duplicating, each one step however many things it touched; up to 100 steps. Something deleted and
  put back is loaded again as a new entry, and steps before it follow it (`history.replace`).
  Hiding keeps its own Undo toast, and changes typed in the P panel, breaking a row apart and
  digging aren't steps. Undoing or redoing a move, turn or resize puts back only what that step
  changed (where it stands, its heading, the size dragged), so a later change in the P panel (a
  width, a material) stays. What's undone is selected again, unless it's hidden. Opening another
  layout in this one's place (a project from your account, a shared one: `layout.replace`, heard
  through `layout.onReplace`) clears the steps, and a step still loading items back then drops
  them, so nothing from the old layout lands in the new one.
- **Many selected:** each one's box is measured when it changes (models' `change`), not every
  frame, so a few hundred selected (Ctrl+A on a busy site) don't slow the editor.
- Saving, autosave, share links and the MCP server are unchanged: what's pasted or moved is saved
  as any placed item is.
- **Tests:** `npm run test:multiselect-ui` (Shift+click and box selecting, a row by its line,
  Ctrl+A leaving hidden things out; moving several keeps their offsets, turning keeps their
  distances from the middle, each one step to undo and redo; Delete and one Undo; copy and paste at
  the pointer, again beside it; pasting in another tab from localStorage; duplicate and cut; a free
  account's paste leaving Pro items out; keys in a field and with text selected left alone; undo
  cleared when another layout opens; undoing a move keeping a later P-panel width; undo not
  selecting a hidden item; Ctrl+V/Z doing nothing with the library closed; cutting Pro items on a
  free account leaving them; 80 selected not measured every frame, outlines following a turn).

## Markups: dimensions, arrows and notes

Site markups as on a marked-up drawing (Bluebeam Revu, SketchUp), in `src/markups.js`. Each is a
placed kind (`markup`, `src/kinds.js`), so it's saved with the layout (and to the account),
selected, box-selected, moved, turned, copied and pasted, hidden, deleted and undone like any item.

- **Tools** (with the other tools at the top of the library): **Dimension**: click A, click B, then
  click where the dimension line goes; it's drawn offset sideways from the points, with end ticks,
  extension lines back to them and the distance on plan to a tenth of a metre ("24.6 m"). **Shift**
  on the second click squares it to north or east (whichever it's nearer). **Height** (or **Alt** on
  a dimension's second click): the difference in height between the two points ("2.6 m").
  **Arrow**: click what it points at (the arrowhead), then where its words go, and type them.
  **Note**: click a spot and type; red (hazard), amber (caution), blue (information), green or
  white. **Enter** puts it down (Shift+Enter for a new line), **Esc** cancels at any step. While a
  tool is in use the Controls panel says what the next click does (the sidebar's `custom` tool mode).
- **Points snap** to what's under the pointer: the ground, or a placed item's surface. A point put on
  an item is pinned to it: the item is given an `id` (saved with it from then on; `models.js`), and
  the point follows it when it's moved or turned, here or after a reload; the markup's other points
  stay. Dragging the point's dot (or the markup) away from the item lets go of it. Pasted markups
  aren't pinned (`kinds.js` `pasted`), and a copy of an item gets no id.
- **Seen at any distance:** lines, ticks and arrowheads are drawn over everything at a fixed width
  in pixels; labels are HTML over the scene, the same size on screen. Invisible boxes sized to the
  screen each frame over the lines and labels make them clickable in build mode only (walking
  doesn't bump into them).
- **Changing them:** dots on a selected markup's points to drag (always as many: no pluses, none
  taken out; `resize.fixed` in `handles.js`); **double-click** a note or arrow (or **Text** on its
  toolbar) to change its words and colour; the P panel has the words, colour and a dimension's
  offset. Adding one, changing its words, and dragging a point are each one step in the shared undo
  (`src/history.js`).
- **Show panel:** a **Markups** row with how many, to hide them all.
- **Saved as** `{ kind: 'markup', name, east, north, up, heading, params }` with params `type`
  (`dimension`, `arrow`, `note`), `points` (`[ east, north, up ]` metres from its origin, which is the
  middle of the points on plan at the first one's height, or `up: null` to sit on the ground),
  `text`, `colour`, a dimension's `offset` (m left of A to B) and `vertical` (a height), and, when a
  point is pinned, `attach` (`[ { item: id, at: [ x, y, z ] } or null ]`, `at` in the item's own
  frame). Layouts without markups load as before.
- **Claude (MCP):** `add_markup` takes `kind` (`dimension`, `arrow`, `note`), `points`
  (`{ east, north, up? }`: up for all or none), `text`, `colour`, `height` (a height dimension) and
  `offset`, refuses what doesn't make sense (a note without words, points in the same place, a
  height without ups) and returns the markup as stored. `get_project` lists markups (a dimension
  with what it `measures`) and `remove_items` takes them away.
- **Tests:** `npm run test:markups-ui` (each kind placed by clicking, the length label, Shift
  squaring, height by tool and by Alt, words typed and changed as one undo step with the camera
  still, the Show panel's row, save and reload, a point following a dragged item and back on Undo,
  copy and paste of several, delete, undo and redo, Esc at each step, layouts from before), and
  `npm run test:build-mcp` (`add_markup`, good and bad, and the markups in the editor).

## How it's put together

- **Pages:** `npm run build:drive` builds the dashboard into `dist-drive/build/` and the app a
  second time with `--mode worlddrive` (`vite.drive.config.js`'s `buildApp`) into
  `dist-drive/build/app/`, with the library and the walking workers copied in. `src/product.js`
  holds everything that differs in that mode.
- **Server:** World Drive's Worker answers `/build/api/*` and `/build/app/api/*` (each page asks
  beside itself; `worker/drive/build.js`):
  config (plan, views, the Maps key), sign-in with World Drive's accounts, saved projects and share
  links (`build_layouts`, with each project's place), views counted in `build_views`
  (`worker/drive/migrations/0016_build.sql` and `0017_build_places.sql`, applied by the deploy).
- **Payments** (`worker/drive/billing.js`, `stripe-api.js`, `migrations/0020_build_billing.sql`;
  all of it only while `BUILD_SALES` is `on`, see "Buying is hidden" above): Build Pro is a Stripe subscription, monthly or yearly, one named person each (quantity 1, which
  the buyer can't change), no trial. `POST /build/api/billing/checkout { interval: 'month' | 'year' }`
  makes a Checkout Session for the signed-in account (its own Stripe customer, made once and kept
  in `accounts.stripe_customer`; Stripe Tax and tax ids on; the Terms to accept; the auto-renewal
  sentence by the button) and answers `{ url }`; an account with a subscription running is refused
  (409). `POST /build/api/billing/portal` opens Stripe's billing portal for that customer (cancel,
  switch monthly and yearly, change the card, invoices). Nothing is sold until the secret key, both
  price ids, Google sign-in and the webhook's secret are all set and look right: until then
  `premium.billing.enabled` is false and the page says Build Pro opens soon. The page never has a
  price of its own: `premium.billing` carries `monthly` and `annual` as shown
  (`BUILD_PRICE_LABEL_MONTHLY`, `BUILD_PRICE_LABEL_ANNUAL`).
- **The webhook** (`supporter.js`, shared with the Supporter Pass) records Build Pro's checkout as
  `pass = 'build'` (its metadata says so), which never counts as the Supporter Pass (and the pass
  never counts as Build Pro). It keeps each event's id (`stripe_events`: one already acted on is
  skipped, and what became of each is there to look at), each subscription's price, interval,
  period and cancelling (`subscriptions`: an older event never undoes a newer one), and each
  invoice paid or failed with its charge (`invoices`). The plan (`/build/api/home`, `me`, `config`)
  says `subscribed`, `status`, `interval`, `renewsAt`, `cancelAtPeriodEnd`, `pastDue` and
  `priceLabel`. A failed renewal keeps Pro while Stripe retries the card (`past_due`, and
  `pastDue: true` for the page to ask for a new card); `canceled` or `unpaid` ends it. Cancelling
  ends it at the end of the period paid for. **A refund in full or a chargeback ends Pro at once**,
  found through the charge's invoice, and the subscription is cancelled at Stripe so it isn't
  billed again (a partial refund changes nothing). A paid checkout that matches nothing sold (no
  Payment Link and no Build Pro metadata) is never taken for a lifetime Supporter Pass: it's kept
  as `unmatched` and counted as `build_webhook:unmatched` in `stats_daily`.
- **Comps:** the owner gives Build Pro without paying, for a while or for good, with
  `POST /api/admin/build/comp { account: <email, username or id>, reason?, until?: <ms>, remove?: true }`
  (admins only; `GET /api/admin/build/comps` lists them), kept in `build_comps`. `BUILD_EMAILS`
  still works too.
- **Company logo (Build Pro):** uploaded on the dashboard (redrawn there as a PNG of 512 px at
  most), kept in `build_logos` (`migrations/0019_build_logo.sql`), served to its owner's editor and
  their share links (`/build/api/logo`, `/build/api/shared/<token>/logo`). `src/logo.js` lays it on
  both long sides of every vehicle, machine, trailer, container and bin, cut from the model's outer
  surface (the flattest panel of each side, checked out to the logo's very edge); the Show panel's
  "Company logo" hides it.
  - **Background removal**, in the browser only (`src/logo-background.js`, no outside service): a
    picked logo opens in an editor on the dashboard's logo box, before and after on a checkerboard
    (or yellow or dark paint, to see its edge), with **Remove background** (on), **Tolerance**
    (0-120, 40 by default) and **Also clear enclosed areas of the same colour** (off). The
    background's colour is the dominant one round the image's edge (up to three close shades of it);
    from every edge pixel a flood fill takes what's within the tolerance of it, so white letters
    inside a logo stay unless "enclosed areas" is on; specks of a few pixels go too; the boundary is
    un-mixed from the background (alpha its share of the logo's colour nearby, the colour the logo's
    own) so no light fringe is left; then it's trimmed to the logo with 2 % padding. Nothing's done
    to an image whose edge is see-through already, or that has no one colour round its edge (a
    photo), and the editor says so. **Remove background** on a saved logo opens it in the same
    editor and saves over it; undoing that is uploading the original again. A save over 250 KB as a
    PNG goes as a WebP where the browser makes one, else smaller, under the server's 256 KB.
  - On the equipment it's drawn with its alpha: transparent, `alphaTest` 0.02, no depth write,
    pulled forward with polygon offset over the 2.5 cm lift (no z-fighting), no plate behind it; its
    see-through texels take the nearest visible pixel's colour (a saved PNG keeps none for them), so
    filtering and mip levels leave no dark or light ring. The same in the editor and on share links.
- **Claude (MCP):** `https://worlddrive.app/mcp` is an MCP server (`worker/drive/mcp.js`), Build Pro
  and the owner only. Claude finds it as a custom connector: it registers itself, the person signs
  in on worlddrive.app and allows it (`worker/drive/oauth.js`: OAuth 2.1 with PKCE, codes and tokens
  kept only as hashes, access an hour, refresh 30 days and replaced on use;
  `migrations/0018_build_mcp.sql`). Its tools find a site, make and read projects, search the
  library and sets (`build-catalog.json`, made by `npm run make-build-catalog` whenever the library
  changes), place items, sets and rows, add flatten, laydown and stockpile areas and markups
  (`add_markup`: dimensions, arrows and notes), move and remove things and share a project; each answer has the editor link. `MCP_HOURLY` (default 300) caps an
  account's tool calls an hour. The dashboard's **Build with Claude** box shows the address and
  disconnects every connected app.
- **Legal pages:** `/build/terms/`, `/build/privacy/` (with **Cookies and storage**, `#cookies`),
  `/build/refunds/`, `/build/acceptable-use/` and `/build/credits/` (every model in
  `public/library/CREDITS.md`), made by `drive/site/legal.js`'s `buildLegalPages` with the game's
  contact settings (`DRIVE_CONTACT_NAME`, `DRIVE_CONTACT_EMAIL`, `DRIVE_CONTACT_ADDRESS`,
  `DRIVE_CONTACT_PHONE`) and written into `dist-drive/build/` by `buildApp`; out of search
  (noindex) like the rest of `/build/`. Their prices (`BUILD_PRICES`) change with the Stripe prices
  and the price labels. The dashboard's footer and the editor (the foot of the library and of the
  help) link to them, and every Google sign-in button in Build has "By continuing you agree to the
  Terms and Privacy Policy" beside it: that line is the Terms' clickwrap, so keep it by any new
  sign-in button. Have a
  British Columbia lawyer read the Terms, Privacy Policy and Refunds once before Build Pro is sold.
- **Privacy and cookies: no banner, so no tracking.** Build sets one cookie, `__Host-wd_session`,
  strictly necessary for signing in, and keeps only the editor's own state in `localStorage`
  (listed in `legal.js`'s `BUILD_STORAGE`, and so in the Privacy Policy). Visits are counted with
  the cookieless Cloudflare Web Analytics beacon and server-side totals. The dashboard's fonts are
  its own (`src/build-home/fonts/`, SIL Open Font License), not Google Fonts, and Google's sign-in
  script loads only where there's a button to show. That's why there's no consent banner. Adding
  Google Analytics, Tag Manager, Google Ads or AdSense, Meta or LinkedIn pixels, Hotjar, Clarity or
  any session replay to Build needs a consent tool first (Consent Mode v2, and a Google-certified
  TCF CMP for ads in the EEA, the UK and Switzerland), and a new `localStorage` key has to be added
  to `BUILD_STORAGE`: `npm run test:build-legal` fails otherwise.
- **Tests:** `npm run test:build-account` (the account page's Worker routes, against a stand-in for
  Stripe's API, and the built page in a browser), `npm run test:build-worker` (the server, under wrangler dev),
  `npm run test:build-ui` (the built page in a browser against the Worker),
  `npm run test:logo-background` (the logo's background removal on images made in the test, the
  dashboard's editor saving a PNG with alpha, and an excavator wearing it) and `npm run test:logo-ui`,
  `npm run test:build-mcp` (connecting as Claude does, every tool, and the result in the editor),
  `npm run test:build-admin` (the admin numbers from seeded rows, and the Build tab) and
  `npm run test:build-legal` (the legal pages, the cookie and storage list against the code, and no
  tracking in anything built for Build).
- **The account page** (`GET /build/api/account`: connected apps, share links, payments and usage,
  beside `/build/api/me`'s plan). Signing in is changed through World Drive's own `/api/account/*`
  (`logins.js`), as the game's account panel does, with the same fresh proof (the password, or
  Google's button for the account's own Google account). Buying goes to Stripe's checkout and
  managing to its billing portal; back from checkout the page asks until Pro shows. Connected apps
  are cut off one at a time (`DELETE /build/api/connections/:client`) or all at once; share links
  are revoked one at a time or all. **Your data**: `GET /build/api/account/export`, a JSON file of
  everything kept about the account (projects with their layouts, logo, views and Claude's calls by
  month, payments, the World Drive game profile), never a password's hash or a token's. **Delete
  account**: `DELETE /build/api/account { password }` or `{ credential }` (fresh proof; the owner's
  accounts can't be). Any subscription still running, Build Pro's or the Supporter Pass's, is
  cancelled at Stripe first, now and without a refund; if Stripe can't be reached (or there's no
  secret key) nothing is deleted. Then, in one batch: the account's leaderboard players (scores,
  times, ghosts, achievements; the challenges' driver counts put right) and feature requests are
  deleted, its purchases kept for the tax record with no account or email on them, and the account
  itself deleted, which cascades to its sessions, username, keys, projects, views, logo, comps and
  Claude's tokens; subscriptions and invoices keep only Stripe's ids and amounts. The page says
  plainly that the World Drive game profile goes too. The editor remembers its open project by the
  account's id, never its email (`src/cloud.js`; one remembered by email before still opens).
- **The owner's numbers** (`worker/drive/build-stats.js`, the **Build** tab of `/admin.html`, or
  `/admin.html#build`): `GET /api/admin/build?days=N` (admins only, as the rest of the admin page).
  The Worker counts Build's own events a day in `stats_daily` under metrics named `build_...`:
  visits by page (`build_visit`: `dashboard`, `editor`, `share`) and UTC hour, the dashboard's
  referring site by host only (`build_ref`, sent once by the page as `?ref=`), sign-ins and accounts
  made on Build, projects created and shared, checkouts started by interval, and 3D map views turned
  away. Never an address, an account or anything else that's someone's. The tab adds what Build's
  tables say of each day: new accounts, 3D map views by plan with an estimate of Google's bill
  (`BUILD_VIEW_COST_USD` each, US$0.006 if unset), MCP calls, logos, and **Build Pro's money from
  its own subscriptions and invoices only**: active, past due, set to end and ended subscriptions,
  MRR (each price brought to a month), new subscriptions, renewals, revenue, refunds and
  chargebacks. It also shows the latest Stripe events. `GET /api/admin/build/customer?q=<email,
  username or id>` looks one account up (plan, comp, this month's views, projects, subscription,
  invoices) for the tab's **Comp** and **Remove comp** buttons. The game's own money tiles leave
  Build Pro's purchases out, and its counts leave out `build_...`. Indexes for these reads are in
  `migrations/0022_build_admin.sql`.
- **Web Analytics:** the dashboard and the editor load Cloudflare's cookieless Web Analytics beacon
  with World Drive's own token, only on worlddrive.app, as the game's page does. The editor's page
  (the twin's `index.html`) has the twin's beacon swapped for it at build time
  (`vite.drive.config.js`'s `withBuildBeacon`). Page views, countries and Core Web Vitals are in
  Cloudflare's dashboard; no cookie banner is needed, as nothing is kept in the browser for it.

## Address search

The start-a-project search and the **Site** button use World Drive's place search
([docs/world-drive.md](world-drive.md#search)). Out of the box it's OpenStreetMap's, which finds
towns, landmarks and streets but often only the street for an address like "453 W 12th Ave,
Vancouver" (the list then says **Street only**: pick it and move the site into place). With a
Google Geocoding key set, addresses are found to the building. To set it up:

1. **Google Cloud Console** (the project the Maps key is in, or another with billing on):
   *APIs & Services → Library* → **Geocoding API** → **Enable**.
2. *APIs & Services → Credentials → Create credentials → API key*. Name it "World Drive geocoding
   (server)".
3. Edit the key: **API restrictions → Restrict key → Geocoding API** only. Leave **Application
   restrictions** at *None*: it's used from Cloudflare's servers, whose addresses aren't fixed, so an
   IP restriction isn't possible on Workers, and a website restriction doesn't apply to server
   requests. That's why it's a key of its own, kept secret, never the Maps key (which is a browser
   key restricted to worlddrive.app and the Map Tiles API).
4. **Cloudflare dashboard → Workers & Pages →** the drive Worker (`world-drive`) **→ Settings →
   Variables and Secrets → Add** → type **Secret**, name `GOOGLE_GEOCODING_KEY`, the key as its value
   → **Deploy**. (Or `npx wrangler secret put GOOGLE_GEOCODING_KEY -c wrangler.drive.jsonc`.)
5. Optional: `GEOCODE_DAILY` (a var in `wrangler.drive.jsonc`, 300 now) is the most Google lookups a
   day from everyone together; past it, search is OpenStreetMap's until midnight UTC. Only searches
   with a number in them go to Google first (and others only when OpenStreetMap finds nothing), and
   answers are cached a day, so 300 goes a long way. `GEOCODE_PER_VISITOR` (30 now) is each
   visitor's share of them (an address, an IPv6 one by its /48, or a Build account through the
   Claude connector), so one script can't use up everyone's day.
6. **Cost.** The Geocoding API is billed per request beyond a free monthly allowance; the numbers
   change, so check Google's [Geocoding usage and billing](https://developers.google.com/maps/documentation/geocoding/usage-and-billing)
   page, and set a **budget alert** (*Billing → Budgets & alerts*) and, if you like, a quota cap
   (*APIs & Services → Geocoding API → Quotas*, requests per day) a little over `GEOCODE_DAILY`.
7. **Check it**: search "453 W 12th Ave, Vancouver" on `/build/`: the first result should be the
   building, with "Search powered by Google" under the list. If the Worker's logs say
   `Geocoding answered REQUEST_DENIED`, the API isn't enabled or the key's restriction doesn't
   include it.

Without the key nothing changes: search is OpenStreetMap's, with its second try for addresses.

## The owner's steps

Build works as soon as it's deployed: you (in `ADMIN_EMAILS`) have everything, and everyone else is
on the free plan. With `BUILD_SALES` unset (the default) buying is hidden altogether: nothing says
anything about prices or subscribing, and Pro is given with comps or `BUILD_EMAILS`. To sell Build
Pro, do every step below and then set `BUILD_SALES` to `on` (step 8); with it on but a step
missing, the pages say **Build Pro opens soon**. Nothing is sold until every step is done. Do it all in Stripe's **test mode** first (with a staging Worker, or locally),
then again in live mode.

1. **Business details.** *Settings → Business*: your name as a sole proprietor, the PO box as the
   business address, `support@worlddrive.app` as the support email. *Settings → Public details*:
   the Terms URL (`https://worlddrive.app/build/terms/`) and the privacy and refund pages; Checkout
   shows the Terms checkbox only once the Terms URL is set.
2. **Product and prices.** *Product catalogue → Add product*: "World Drive Build Pro", tax code
   *Software as a service (SaaS), business use*, with two **recurring** prices in **USD**: US$5
   **per month** and US$50 **per year**, tax behaviour *exclusive* (tax added on top). Copy both
   price ids (`price_...`). No trial; no quantity (Checkout fixes it at 1).
3. **Stripe Tax.** *Tax → Settings*: turn it on, set the origin address, and add a registration
   wherever you're registered (British Columbia/Canada to start). Checkout collects the buyer's
   address and, for businesses, their tax id.
4. **Restricted key.** *Developers → API keys → Create restricted key*, "World Drive Build":
   **Checkout Sessions: Write**, **Customers: Write**, **Customer portal: Write**,
   **Subscriptions: Write** (to cancel one that's refunded, charged back or left behind by a deleted
   account, and to check for one running before a checkout), **Invoices: Read** (to find a paid
   invoice's payment, which newer API versions leave out of webhooks), everything else None. Copy it (`rk_live_...`).
5. **Customer portal.** *Settings → Billing → Customer portal*: add a configuration for Build Pro
   (or edit the default): customers may **cancel at the end of the billing period** (with reasons),
   **switch plans** between the monthly and yearly prices (with proration), **update payment
   methods**, see **invoice history** and update billing address and tax id; **no quantity
   changes**. Copy its id (`bpc_...`) if it isn't the default.
6. **Emails and retries.** *Settings → Billing → Subscriptions and emails*: Smart Retries on, emails
   for failed payments and expiring cards on, and a subscription that's still unpaid after the
   retries **cancelled**. *Settings → Customer emails*: receipts for successful payments and refunds on.
7. **Webhook.** *Developers → Webhooks*: World Drive's existing endpoint
   (`https://worlddrive.app/api/stripe/webhook`) needs these events added to the ones it has:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`,
   `charge.dispute.created`, `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated`,
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`,
   `invoice.payment_action_required`. Its signing secret stays `STRIPE_WEBHOOK_SECRET`. Any API
   version works: on 2025-03-31.basil and later the Worker asks Stripe for each Build Pro invoice's
   payment (Invoices: Read), and if that fails the event is retried.
8. **Settings** (secrets with `npx wrangler secret put <NAME> -c wrangler.drive.jsonc`, the rest as
   `wrangler.drive.jsonc` vars or in the Worker's dashboard):
   - secret `STRIPE_SECRET_KEY`: the restricted key (a `rk_test_` one sells in test mode, and the
     webhook then takes test-mode events for Build Pro only)
   - `BUILD_PRICE_MONTHLY`, `BUILD_PRICE_ANNUAL`: the two price ids
   - `BUILD_PRICE_LABEL_MONTHLY`, `BUILD_PRICE_LABEL_ANNUAL`: the prices as the page shows them, if
     not `US$5/month` and `US$50/year` (change them with the prices, never one without the other)
   - `BUILD_SALES`: `on` to put Build Pro on sale (a commented line in `wrangler.drive.jsonc`'s
     vars, or the dashboard), **and** `BUILD_SALES=on` in the environment of the build that deploys
     (the shell or `.env`), so the Terms and Refunds are built with the prices and renewal terms;
     set or unset both together. Unset, buying stays hidden everywhere whatever else is set; setting
     it back to anything else (or removing it) hides buying again, and accounts with a Stripe
     customer can still open the billing portal to cancel.
   - optional: `BUILD_PORTAL_CONFIG` (the `bpc_...` id), `BUILD_EMAILS` (testers given Pro),
     `BUILD_FREE_MONTHLY`, `BUILD_PRO_MONTHLY`, `BUILD_FREE_DAILY`, `BUILD_LAYOUT_LIMIT`,
     `BUILD_VIEW_COST_USD` (Google's price for a 3D map view, for the admin page's estimate)
   - `BUILD_PAYMENT_LINK` and `BUILD_PRICE` aren't used any more. Leave `BUILD_PAYMENT_LINK_ID` set
     if an old Build Pro Payment Link ever sold anything (its checkouts are still recognised), and
     deactivate that link in Stripe.
9. **Try it.** With `BUILD_SALES` on, buy Build Pro with a real card in live mode, check the account page shows it and the
   portal opens, then refund it in the Dashboard and check Pro ends and the subscription is
   cancelled. Then it's on sale.

**Refunds** follow the policy on `/build/refunds/`: a full refund within 14 days of the first charge
on request; renewals only for billing errors, duplicates or where the law requires. Refund **in
full** in the Dashboard: that ends Pro and cancels the subscription by itself. To refund a
duplicate charge without ending Pro, refund it partially (or comp the account afterwards).
**Google sign-in:** nothing new. Build is on worlddrive.app, which the OAuth client allows.

## Connecting Claude

In Claude: *Settings → Connectors → Add custom connector*, name it "World Drive Build", URL
`https://worlddrive.app/mcp`. Claude opens a worlddrive.app page: sign in with Google and press
**Allow** (a free account is told it needs Build Pro). Then ask it, e.g. "lay out a staging area for
a 3-storey build at 453 W 12th Ave, Vancouver: site office, two 40 ft containers, fencing along the
lane, a gravel pad for trucks", and open the editor link it gives you.
