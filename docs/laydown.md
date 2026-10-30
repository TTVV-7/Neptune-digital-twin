# Laydown areas

Laydown areas mark out a site on the map: where the materials, trailers and equipment go. Each one is
a coloured rectangle laid on the ground, with its name and size floating above it.

- **Draw:** press **L**, click **Laydown area** (under *Tools*) and drag a rectangle on the ground. It
  lines up with the way you're looking, so face along the site first. A click without a drag makes a
  20 × 15 m area there. New areas are named *Laydown A*, *B*, *C*... (the first letter not already
  used) and take the colour used least so far: yellow, cyan, magenta, lime, orange, violet or blue.
- **Edit:** with the library open, click an area to select it, drag it to move it, **R** / **Shift+R** to
  turn it and **Delete** to remove it. **P** shows its settings: *label*, *colour*, *width*, *length*
  and a *note* (e.g. "Rebar and formwork, contractor B"). Text applies when you press Enter or click
  away, a colour when you close the picker.
- **Figures:** the P panel also shows its *area* (m²), *perimeter* (m) and *items inside*: how many
  placed library items have their middle inside it (other laydown and flatten areas don't count).
  Stockpiles and excavations do.
- **Label:** the floating label shows the name, the size and area (e.g. "40 × 25 m · 1,000 m²") and
  the note. Labels stay the same size on screen at any distance and hide past 1.5 km. Where labels
  would overlap, the selected area's label wins, then the nearest; the others hide until you get closer.
- **Always shown,** whether the library is open or not, but you can only click one while the library
  is open: with it closed, a click on an area captures the mouse to look around as usual. Areas don't
  block walking or driving.
- **Saved** with the rest of the layout in this browser, and included in **Export layout** / **Import**.

Areas follow the ground: Google's 3D mesh (or the flat stand-in), and dug or piled earth. They
re-fit themselves as sharper tiles stream in, and when ground under them is flattened or dug. Google's
mesh includes whatever was there when it was captured, so an area drawn over parked trucks or rail cars
is draped over them; flatten the area first (**Flatten area**) to lay it on clear ground.

## Notes for developers

- `src/laydown.js` registers the kind `'laydown'` (see `src/kinds.js`) and the sidebar tool. Its params
  are `{ label, colour, width, length, note }`; `colour` is a `#rrggbb` string. It snaps `'median'`,
  isn't solid and isn't build-only. Saved layouts store it like any kind:
  `{ name, kind: 'laydown', params: { ... }, east, north, up: null, heading, scale }`.
- The area is built as a flat grid (about 1.5 m spacing, coarser for big areas so no area takes more
  than about 2,500 samples) with a `Line2` outline round its edge. Draping raycasts straight down
  through each grid point against `features.getGround()`, testing only the ground meshes whose boxes
  overlap the area. Each ray starts just above the highest of those boxes, so a box is measured again
  whenever its mesh's vertices change (earth piled up after it was measured would stand above it).
  An area is draped again when it moves, turns or is rebuilt (at most ten times a second while
  dragged); otherwise each area checks twice a second whether the ground meshes under it, or their
  vertices, changed (cheap: no raycasts) and drapes again only if so.
- It's drawn a little nearer the camera than it is (10 cm plus 0.3 % of the distance, in the
  logarithmic depth shader; `polygonOffset` is ignored when a shader writes its depth), so it stays
  on top of Google's mesh between samples while things standing on it lose only a pixel or two.
- The P panel (`src/placement.js`) now renames a kind's folder when `entry.state.name` changes (a
  laydown area takes its label as its name), shows readouts from the start, applies a colour when its
  picker closes, ignores leaving a field unchanged, and leaves the field being typed in alone when the
  entry changes meanwhile (e.g. it re-snaps as sharper tiles stream in).
