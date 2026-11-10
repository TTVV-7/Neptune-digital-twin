# Source models

Not loaded by the app (that's `public/models/`); kept here as originals to work from.

## b2d2-site-model.glb

The 3D model from the **B2D2 Repair Model** artifact (its published `site.json`, converted to
GLB with no change to the geometry): Dumper 2's C31 gallery, transfer pit, C32 tunnel, ground level
and rails, steel plates at grade, the dumper building, and the conveyors, tent and temporary works,
one named part each. It came from the Shapr3D model `C32_and_C31.3mf`.

Coordinates are in metres on the Hatch grids, not real-world:

- x = C31 numeric grid (grid 0 at the transfer end)
- y = elevation (C31 floor at EL −2.009; grade around 5.1)
- z = minus the letter grid (AA = 0, AJ = −8; C32 runs toward −z)

`scripts/b2d2-repair-model.mjs --site` builds the twin's `public/models/b2d2-repair.glb` from the
artifact's `site.json` (the same model) plus the repair markups.

The file is kept as it came. Its transfer pit, C32 and the gallery's framing at grade are 0.3 to
0.9 m off the Hatch drawings' grid; `scripts/b2d2-structure.mjs` puts them right as the twin's
model is built (see the README's B2D2 section), so nothing here needs redrawing in Shapr3D.
