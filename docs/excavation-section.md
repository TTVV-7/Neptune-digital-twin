# Excavation sections, quantities and what's nearby

Any excavation can be cut through to see its profile: the ground, the slopes or benches, the walls
down to their toe, the support levels, rakers and tiebacks, with their dimensions. Its P panel also
says what the design takes (the cut and its footprint at the surface; the shoring's readouts say
the walls, piles and members), how the other methods would compare for the same floor, and what's
placed on the map where the pit reaches.

**This is a planning aid with WorkSafeBC flags, not engineering design.** The figures come from the
excavation's design ([earthworks.md](earthworks.md), [shoring.md](shoring.md)): rules of thumb for
laying out a site and talking to suppliers and engineers. Walls, support levels and anchors are a
professional engineer's to design (WorkSafeBC 20.78(2)), and sloped or benched excavations over 6 m
deep, or next to a structure, a qualified registered professional's (20.78(1)).

## Opening a section

1. Select an excavation and press **P**.
2. Press **Section across** or **Section along**:
   - *across* cuts across the pit's width, looking toward side 1: side 4 on the left and side 2 on
     the right are seen in profile;
   - *along* cuts along its length, looking toward side 4: side 3 on the left and side 1 on the
     right.

   The sides are numbered from the pit's front (the way it was drawn, the far side from where you
   stood), clockwise: 1 front, 2 right, 3 back, 4 left. The card names each with the compass point
   it faces, e.g. *side 2 (E)*.
3. **Cut at** moves the cut through the pit, from one end to the other; at 0 it's through the
   middle. Near an end the cut goes through the sloped or benched end, so it's shallower there.
4. **Across** and **Along** at the top of the card switch the cut. **×** or **Esc** closes it and
   puts the view back as it was (Esc only closes the section: the pit stays selected).

The section is drawn from the design, so it's exact and doesn't wait for Google's tiles: walls are
vertical lines, where the dug ground, on its 0.5 m grid, eases them across a cell either side. Only
the original ground line is read from the map: the ground as it was before anything was dug (the
earthworks' ground where it has any, Google's mesh further out), read again as sharper tiles load.

## What the drawing shows

Drawn to scale, the same horizontally and vertically, so slopes look as steep as they are; the bar
in the corner gives the scale. A legend under the drawing says what each line is.

- **The ground before digging** (dashed), **the cut** (orange) and the soil (hatched). What's dug out
  is pale.
- **Walls**, as cut, from where they stand out of the ground down to their toe: sheet piles (steel),
  secant and contiguous pile walls (concrete, with their capping beam), soldier piles (the piles
  seen past the timber lagging the cut goes through, lagging down to the floor), and trench boxes,
  slide rail and hydraulic shores' panels.
- **Support levels**: walers cut through at each level (L1, L2...), struts cut through as squares
  where they cross the cut, or drawn along it where they run with it (the one in the cut solid,
  those beyond it dashed), king posts, rakers down to their kicker blocks, and tiebacks (the free
  length thin, the bond thick), with the active wedge they reach past. A wall on the far side of
  the pit is drawn faintly beyond, with its levels dashed.
- **Groundwater**, as assumed (the excavation's groundwater setting), dashed blue.
- **At a dig stage** (the excavation's *dig stage* setting): what's dug so far, what's still to dig
  hatched, only the levels installed by then, and the stage named at the top.

Dimensions, in metres:

| Dimension | Where |
| --- | --- |
| depth | rim to floor, inside the right-hand wall or slope; *dug* to so far at a stage |
| top, floor | between the top edges above the ground, and across the floor |
| slope | each sloped side's ratio, h : v, on its face |
| benches | the top riser's height and the first bench's width, and how many steps |
| support levels | down the left wall (the right one if only it is a wall): rim to L1, then between levels, then the last to the floor |
| toe | the embedment below the floor; each side's pile or sheet length is in its heading |
| tiebacks | the top row's free and bond lengths and angle, the other rows' free lengths, the soil over the top row's bond (at least 4.5 m, FHWA GEC 4), and the no-dig reach behind the wall |
| rakers | how much of the floor the rakers and kicker blocks take |
| spoil | the spoil set-back: 1.2 m from an excavation's edge, 0.6 m from a trench's (WorkSafeBC 20.90) |
| adjacent | the depth out from the toe, where WorkSafeBC calls a structure adjacent (20.1, 20.78(1)(b)); drawn where it reaches past the top of the cut |

## The 3D cut-away

With **3D** ticked (the default), the scene is cut too. The ground, Google's tiles, the shoring and
placed models are cut away on the camera's side of the cut, in a box as wide as the drawing and
reaching back past the camera, and the cut face is filled in (the ground being a surface, not a
solid) with the walls and members the cut goes through. The camera moves to look at the cut square
on, a little from above, in the part of the view the card and the P panel leave clear, and the
dimensions are drawn over it, following the camera as you look round. Clicks and walking go
through what's cut away. While it's cut, the selected pit's toolbar, handles, label and side
numbers are hidden, as they'd sit on the cut face; they're back when the 3D is unticked or the
section closed.

Untick **3D** to put the scene back and keep the card. Hiding **Labels** in the Show panel hides
the dimensions over the scene too.

The first cut-away of a visit may pause for a moment while the browser prepares the ground and
tiles to be cut; after that it's immediate.

## Quantities

The excavation's P panel lists, after its own readouts and the shoring's:

- **design cut (flat ground)**: the design's volume from flat ground at the rim, loose (×1.25) and
  in tandem truck loads (10 m³). The *cut (bank)* above it is measured from the ground on the map,
  so it differs where the ground isn't flat or the pit runs into others.
- **footprint**: the area and size of the top of the cut.
- **compared**: the same floor dug the other ways: sloped at the steepest the soil allows, stepped,
  and shored (with the system it has, or sheet piles), e.g. *Shored instead: 912 m³ less cut, top
  10.0 × 20.0 m*. For an excavation drawn as the top of the cut, its floor is the one it has now;
  with no floor (the slopes meet) there's nothing to compare.
- **nearby**: what's placed where the pit reaches (below). Left out when there's nothing.

The walls and what holds them are the shoring's readouts (*shoring*, *shored wall*, *support
levels*, [shoring.md](shoring.md)). The section card has all of it as one table: the cut, loose
volume and truck loads, the top and floor, the spoil set-back, the wall area, the sheets or piles
of each system (counted as the shoring draws them, corner piles and all) and their length, the
embedment, the support levels, walers, struts, corner braces, king posts, rakers and kicker blocks,
tiebacks and each side's no-dig zone. Below it are the comparison as a table (*vs plan* is the
change in cut), and every WorkSafeBC flag for the design under **Checks**.

## What's placed nearby

Every placed library item (equipment, trailers, stockpiles, other excavations; not laydown or
flatten areas) is checked against the pit's zones at the surface, each item once, at the first it
reaches:

1. **the cut**: *The cut reaches Trailer 2.*
2. **a tieback no-dig zone**, the strip behind a wall its tiebacks run under: *Tiebacks on side 2
   run under Conveyor footing: consent, or steeper or shorter anchors (FHWA GEC 4 5.3.6).*
3. **the spoil set-back**, for stockpiles: *Stockpile 1 is inside the spoil set-back (1.2 m,
   WorkSafeBC 20.90).*
4. **the adjacent band**, the depth out from the toe: *Within 8.0 m of the toe (adjacent): Rail car
   4. A structure there means a QRP's written instructions (WorkSafeBC 20.78(1)(b)).*

It's checked again whenever something is placed, moved or changed. An item counts by its box,
turned with it; a long or bent row of items counts by the box round all of it.

Tieback no-dig zones are drawn on the ground in red while the library is open, like laydown areas,
and listed in the Show panel as **Tieback no-dig zones**, where they can be hidden.

## Limits

- Rail lines, roads and buildings in Google's tiles aren't placed items, so they aren't checked:
  place an item there (a rail car, say; laydown areas don't count) to have it checked, or look at
  the no-dig zones against the map.
- The quantities are on flat ground at the rim; the section's ground line and the measured cut are
  the real ground.
- The no-dig zone is a plain strip behind each anchored wall: anchors fanning out at the corners
  aren't drawn.

## For developers

- `src/excavation-section-drawing.js` works the section out with no scene or DOM:
  `sectionDrawing( planExcavation( params ), { along, at, groundAt, heading, unit } )` gives its
  fills, lines, dimensions and labels in the cut's frame (s along the cut from the middle, y up
  from the rim), with the design surface exact (`depthLine`, `surfaceLine`). It also has the
  quantity and comparison rows and texts (`quantityRows( design, piles )` takes the sheet and pile
  counts from `planShoring( params ).piles`, as drawn), and the conflict check (`zoneRects`,
  `findConflicts`, `conflictsText`).
- `src/excavation-section.js` draws it: the readouts and actions (wired into the excavation kind by
  earthworks.js), the card and its SVG, the 3D cut-away (five shared clipping planes, given to the
  terrain, tiles, shoring paint and models the first time one opens; the filled-in faces, depth
  biased like laydown areas; the camera; a hit filter), the dimensions over the scene, and the
  no-dig zones. `window.twin.section` has `open( entry, along )`, `close()`, `view`, `nearby( entry )`
  and the planes, cap, card and zones, for tests.
- `terrain.groundAt( x, z )` reads the ground as it was before digging; `rectsOverlap` (terrain.js)
  tests the zones against items.
- Tests: `npm run test:excavation-section-ui` (Playwright, no tiles).
