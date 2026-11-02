# Excavation sections, quantities and what's nearby

Any excavation can be cut through to see its profile: the ground, the slopes or benches, the walls
down to their toe, the support levels, rakers and tiebacks, with their dimensions. Its P panel also
says how the other methods would compare for the same floor and what's placed on the map where the
pit reaches; the section card lists what the design takes (the cut, its footprint at the surface,
the walls, piles and members).

**This is a planning aid with WorkSafeBC flags, not engineering design.** The figures come from the
excavation's design ([earthworks.md](earthworks.md), [shoring.md](shoring.md)): rules of thumb for
laying out a site and talking to suppliers and engineers. Walls, support levels and anchors are a
professional engineer's to design (WorkSafeBC 20.81(1)(d), G20.81), trench systems are used to
their maker's data (20.81(1)(f)), and excavations over 6 m deep, next to a structure, with water
coming in or with the ground beyond sloping steeper than 3 : 1 need a qualified registered
professional's written instructions, a professional engineer's if shored (20.78(1), (2)).

## Opening a section

1. Select an excavation and press **P**.
2. Press **Section across** or **Section along** (above the readouts):
   - *across* cuts across the pit's width, looking toward side 1: side 4 on the left and side 2 on
     the right are seen in profile;
   - *along* cuts along its length, looking toward side 4: side 3 on the left and side 1 on the
     right.

   The sides are numbered from the pit's front (the way it was drawn, the far side from where you
   stood), clockwise: 1 front, 2 right, 3 back, 4 left. The card names each with the compass point
   it faces, e.g. *side 2 (E)*.
3. **Cut at** moves the cut through the pit, from one end to the other; at 0 it's through the
   middle, and the card says how far from it and toward which side. Near an end the cut goes
   through the sloped or benched end, so it's shallower there. A pit with tiebacks or rakers on the
   sides in profile, none at the middle, opens with the cut through the row nearest it. The arrow
   keys move it too while it has the focus (the camera stays put).
4. **Across** and **Along** at the top of the card switch the cut. **×** or **Esc** closes it and
   puts the view back as it was (Esc only closes the section: the pit stays selected; the Controls
   panel says so). Selecting another excavation moves the section to it; selecting anything else
   leaves it open, to watch what's nearby as you move it. The card's title names the pit by its top
   and depth.

Where there's room, the card stands on the left beside the library with the cut-away to its right;
with the 3D cut-away on a laptop (the library and the P panel open, under about 1,580 px wide)
it's a sheet along the bottom between them, above Google's logo and credits, the cut-away framed
above it. The help (**H**) opens over it.

The section is drawn from the design, so it's exact and doesn't wait for Google's tiles: walls are
vertical lines, where the dug ground, on its 0.5 m grid, eases them across a cell either side. Only
the original ground line is read from the map: the ground as it was before anything was dug (the
earthworks' ground where it has any, Google's mesh further out), read again as sharper tiles load.

## What the drawing shows

Drawn to scale, the same horizontally and vertically (*same scale up and across*), so slopes look
as steep as they are; the bar in the corner gives the scale. A legend under the drawing says what
each line is. Labels that would land on a dimension's figures are moved a line up or down.

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
  the pit is drawn faintly beyond, with its levels dashed; a tieback's bond beyond the cut is still
  drawn strongly enough to read.
- **Groundwater**, as assumed (the excavation's groundwater setting), dashed blue; *(assumed)* by
  its depth while it's the tool's 2 m.
- **At a dig stage** (the excavation's *dig stage* setting): what's dug so far, what's still to dig
  hatched, only the levels installed by then, and the stage named at the top.

Dimensions, in metres:

| Dimension | Where |
| --- | --- |
| depth | rim to floor, inside the right-hand wall or slope; *dug* to so far at a stage |
| top, floor | between the top edges above the ground, and across the floor (under it) |
| slope | each sloped side's ratio, h : v, on its face |
| benches | the top riser's height and the first bench's width, and how many steps |
| support levels | down the left wall (the right one if only it is a wall): rim to L1, then between levels, then the last to the floor |
| toe | the embedment below the floor, behind the wall; each side's pile or sheet length is in its heading |
| tiebacks | the top row's free and bond lengths and angle, the other rows' free lengths, the soil over the top row's bond (at least 4.5 m, FHWA GEC 4), and the no-dig reach behind the wall |
| rakers | how much of the floor the rakers and kicker blocks take, below the floor's own dimension |
| spoil | the spoil set-back: 1.2 m from an excavation's edge, 0.6 m from a trench's (WorkSafeBC 20.90) |
| adjacent | the depth out from the toe, where WorkSafeBC calls a structure adjacent (20.1, 20.78(1)(b)); drawn where it reaches past the top of the cut |

## The 3D cut-away

With **3D** ticked (the default), the scene is cut too. The ground, Google's tiles, the shoring and
placed models are cut away on the camera's side of the cut, in a box as wide as the drawing and
reaching back past the camera, and the cut face is filled in (the ground being a surface, not a
solid) with the walls and members the cut goes through. The camera moves to look at the cut square
on, a little from above, in the part of the view the card, the library and the P panel leave
clear (the Show and Controls panels fold to their buttons meanwhile, as they were once it's
closed; open one by hand and it stays), and the
dimensions are drawn over it, following the camera as you look round. Clicks and walking go
through what's cut away. While it's cut, the selected pit's toolbar, handles, label and side
numbers are hidden, as they'd sit on the cut face; they're back when the 3D is unticked or the
section closed.

Untick **3D** to put the scene back and keep the card. Hiding **Labels** in the Show panel hides
the dimensions over the scene too.

The first cut-away of a visit may pause for a moment while the browser prepares the ground and
tiles to be cut; after that it's immediate.

## Quantities

The excavation's P panel lists, after its own readouts (*top of the cut* gives the footprint's
area too) and the shoring's:

- **compared**: the same floor dug the other ways: sloped at the soil's usual slope, stepped, and
  shored (with the system it has, or sheet piles), e.g. *Shored instead: 912 m³ less cut, top
  10.0 × 20.0 m*. Stepped says when benching wouldn't be allowed there (*not for soil C: benching
  shown for hard soil only*, *over 3.7 m wide: a QRP's design*), as its cut is then no fair
  comparison. For an excavation drawn as the top of the cut, its floor is the one it has now; with
  no floor (the slopes meet) there's nothing to compare.
- **nearby**: what's placed where the pit reaches (below). Left out when there's nothing.

The walls and what holds them are the shoring's readouts (*shoring*, *shored wall*, *support
levels*, [shoring.md](shoring.md)). The section card has all of it as one table: the cut, loose
volume and truck loads from flat ground at the rim (the *cut (bank)* readout is measured from the
ground on the map, so it differs where the ground isn't flat or the pit runs into others), the top
and floor, the spoil set-back, the wall area, the sheets or piles
of each system (counted as the shoring draws them, corner piles and all) and their length, the
embedment, the support levels, walers, struts, corner braces, king posts, rakers and kicker blocks,
tiebacks and each side's no-dig zone. Below it are the comparison as a table (*vs plan* is the
change in cut), and every WorkSafeBC flag for the design under **Checks**: the gravest first,
the summary counting the stops or warnings, open by itself while there are any (until you open or
close it). With nothing to flag it says *Nothing flagged by these planning checks.*

## What's placed nearby

Every placed library item (equipment, trailers, stockpiles, other excavations; not laydown or
flatten areas) is checked against the pit's zones at the surface, at the first of these it reaches:

1. **the cut**: *The cut reaches Trailer 2.*
2. **the spoil set-back**, for stockpiles: *Stockpile 1 is inside the spoil set-back (1.2 m,
   WorkSafeBC 20.90).*
3. **the adjacent band**, the depth out from the toe: *Within 8.0 m of the toe (adjacent): Rail car
   4. A structure there means a QRP's written instructions (WorkSafeBC 20.78(1)(b)).* For a
   shored pit, a PE's (20.78(2)).

and, besides (unless it's in the cut):

- **a tieback no-dig zone**, the strip behind a wall its tiebacks run under: *Tiebacks on side 2
  run under Conveyor footing: consent, or steeper or shorter anchors (FHWA GEC 4 5.3.6).*
- **beside shoring**, for stockpiles in the band behind a wall or trench system: *Stockpile 1 is
  beside the shoring on side 2: over 0.6 m deep on average, the shoring must allow for it
  (WorkSafeBC 20.86).*

The ground beyond each side is read from the map (as it was before digging), from the top edge
out to the depth (3 m at least), at three places along it: where it rises or falls steeper than
1 in 3, *The ground beyond side 3 falls steeper than 1 in 3 (as the map has it): a QRP's written
instructions, a PE's with support (WorkSafeBC 20.78(1)(d), (2)).* Buildings and piles in Google's
mesh count as ground here, so check it on site.

It's checked again whenever something is placed, moved or changed, and the ground every few
seconds as sharper tiles load. An item counts by its box,
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
  earthworks.js), the card and its SVG, the 3D cut-away (five shared clipping planes, given to each
  Google tile as it loads, and to the terrain, shoring paint and models the first time one opens,
  which is when the renderer's local clipping goes on; the filled-in faces, depth biased like
  laydown areas; the camera; a hit filter), the dimensions over the scene, and the
  no-dig zones. `window.twin.section` has `open( entry, along )`, `close()`, `view`, `nearby( entry )`
  and the planes, cap, card and zones, for tests.
- `terrain.groundAt( x, z )` reads the ground as it was before digging; `rectsOverlap` (terrain.js)
  tests the zones against items.
- Tests: `npm run test:excavation-section-ui` (Playwright, no tiles).
