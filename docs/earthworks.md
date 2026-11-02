# Earthworks: excavations and stockpiles

For laydown planning you can cut into the ground and pile material on it, and read off how much
material that is. Both tools are at the top of the library (**L**), under **Tools**, next to
**Flatten area**.

## Excavations

1. Click **Excavation**, then drag a rectangle on the ground. The rectangle is the **floor of the
   pit**, lined up with the way you're looking: the space the work needs down there. A click
   without a drag makes a 10 x 10 m floor.
2. The pit digs itself, 2 m deep to start with, its sides sloped out from the floor at the steepest
   WorkSafeBC allows for the soil: Neptune's fill and sand by the water are type C, so 1.5 : 1, and
   the top of the cut is 3 m wider than the floor all round.
3. Press **P** to change it (the fields that don't apply are left out):
   - **width**, **length**: the rectangle, in metres. **depth**: from the rim down to the floor.
   - **the rectangle is**: *the floor of the pit* (new pits), or *the top of the cut*, as every
     pit was before sides had methods: then the floor shrinks as the sides come in, and if the
     rectangle is too small for them the floor shrinks to a line and the pit is shallower. Changing
     it keeps the numbers, so the pit grows or shrinks round the same rectangle.
   - **sides**: *sloped*, *stepped (benched)*, *shored*, or *per side*.
   - **each side** (per side): **side 1 (N)** to **side 4 (W)**, each *sloped*, *stepped* or held by
     a wall: *Sheet piles*, *Soldier piles + lagging*, *Secant pile wall* or *Contiguous pile
     wall*. Shore it along a road or a rail line and slope the open side, for example. The sides
     are numbered clockwise from the far side of the rectangle as you drew it (side 1 faces the way
     you were looking), and the letter is the compass point each faces, which follows the pit when
     it's turned. While a pit is selected (or its settings are open in the P panel) each side's
     number floats over the middle of its top edge in the scene, e.g. **1 · N**.
   - **system** (shored): the trench systems, *Trench box*, *Slide rail* and *Hydraulic shores*,
     span between opposite walls, so they shore the whole pit; the walls above can also line single
     sides. **ends** (trench box, hydraulic shores): *open (vertical)*, as before, or *sloped*.
   - **soil (WorkSafeBC)**: *A: hard and solid*, *B: likely to crack or crumble*, *C: soft, sandy,
     filled or loose* (the default) or *C, wet*. See the table below.
   - **slope** (sloped sides): *the steepest for the soil*, or *a ratio of my own*, then **slope
     (h : v)**, horizontal to vertical, 0 (vertical) to 4. A 1 : 1 slope goes out 1 m for every 1 m
     down.
   - **bench height**, **bench width** (stepped sides): 0 for WorkSafeBC's figure (below).
   - **support levels**, **levels**, **embedment** and the raker or tieback angles (walls): the
     shoring's, see [shoring.md](shoring.md).
   - **groundwater (m down)**: 2 m to start with, Neptune being on the water.
   - **dig stage**: a slider through the order the pit is dug in (below).
   - **Dig** plays the digging again, down to the dig stage shown.
   - **Spoil pile** pours what came out of the pit beside it, clear of the top of the cut: a pile
     of *Excavated soil* holding the loose volume: a ridge running along a trench (or any pit at
     least twice as long as it is wide, one a cone wouldn't fit beside, or one with more spoil than
     a cone can hold), otherwise a cone.

The rim is the lowest ground around the top of the cut as it was before anything was dug, so the
pit doesn't sink after itself, and whatever stands inside it in Google's mesh (rail cars, a shed) is
dug away with it rather than holding the floor up. Where a flatten area reaches the pit, its floor
counts as the ground there. Where the ground beyond the top of a sloped side is higher, the slope
keeps climbing (up to 3 m out) until it meets it.

### Sloped, stepped or shored

| Soil | Steepest slope (h : v) | Where the figure comes from |
| --- | --- | --- |
| A: hard and solid | 0.75 : 1 (3 : 4) | WorkSafeBC Figure 20-1, the law |
| B: likely to crack or crumble | 1 : 1 | OSHA's Table B-1, for comparison: WorkSafeBC gives none |
| C: soft, sandy, filled or loose | 1.5 : 1 | OSHA's Table B-1, for comparison |
| C, wet: water seeping or submerged | 3 : 1 | Ontario's type 4, for comparison; a QRP's instructions too |

- **Sloped**: each sloped side runs straight from the floor's edge up to the top of the cut. Two
  slopes meet on a straight hip at the corner.
- **Stepped**: equal risers no taller than the bench height (1.2 m, WorkSafeBC's most), and benches
  1.5 times as wide as a riser (Figure 20-2, with workers on the benches). For example 4.8 m deep
  is four 1.2 m risers and 1.8 m benches, the top 5.4 m out from the floor. The top riser starts at
  the top of the cut, the bottom one meets the floor. WorkSafeBC shows benching only for hard soil
  and OSHA allows none in type C: the shoring notes say so.
- **Shored**: the side is cut vertical and held by its wall or the trench system, drawn in the pit
  ([shoring.md](shoring.md)). Next to a slope or benches, the wall runs the whole length of its top
  edge, standing in the slope's wing.

The corners work themselves out where two sides meet, and the volumes and the top of the cut
follow. With the rectangle as the floor, changing how the sides are cut changes the top of the cut
(what the pit takes up at the surface), not the floor. Nothing here is engineering: over 6 m deep,
or with water coming in, or a structure beside it, WorkSafeBC wants a qualified professional's
written instructions, and shoring is always an engineer's design (20.78).

### Dig stages

**dig stage** shows the pit part way dug, and is saved with the layout. A sloped, stepped or
trench-shored pit goes from *before digging* to *dug*. With walls, they go in first; then each
lift is dug to 0.6 m below the next support level, which goes in before the next lift, down to the
floor. With rakers, the middle is dug to the floor first, leaving a berm of soil against the walls
until the rakers and their kicker blocks are in. The stage readout says what's happening, e.g.
*4 of 8: Dig to 4.25 m*. **Dig** digs down to the stage shown.

The P panel shows:

| Readout | Meaning |
| --- | --- |
| cut (bank) | Volume taken out of the ground, in m³ as it was in the ground |
| loose (×1.25) | The same material dug up: it takes about a quarter more room |
| truck loads | Tandem dump truck loads of 10 m³ loose, rounded up |
| floor | Size of the flat floor, or how deep the sides meet if there isn't one |
| top of the cut | Size of the pit at the surface: what it takes up on the site |
| stage | The dig stage shown, unless it's the finished pit |

With the library open, click anywhere over a pit to select it, drag it to move it, **R** to turn it,
**Delete** to remove it: the ground comes back exactly as it was (apart from any digging an
excavator has done there, see Saving). While you resize it with its handles, the top of the cut is
outlined at the rim and the floor at its depth, and the label gives both sizes and the cut.

## Stockpiles

1. Click **Stockpile**, then either
   - **click** the ground: a **cone** of 50 m³ is poured there, or
   - **drag** a rectangle: a **ridge** pile that fills it. Its sides are at the material's angle of
     repose and they meet in a ridge along the longer side (a hip roof).
2. A new pile pours itself: material falls onto it and it grows to its full size in about five
   seconds. **Pour** in the P panel plays it again.
3. Press **P** to change it:
   - **material** (below). New piles use the material you last chose.
   - **shape**: *cone* or *ridge*.
   - **volume**: for a cone, in m³ (loose).
   - **width**, **length**: for a ridge.
   - **max height**: for a ridge, gives it a flat top at that height (0 = no limit).

| Material | Angle of repose | Loose density |
| --- | --- | --- |
| Gravel 20 mm | 37° | 1.6 t/m³ |
| Sand | 33° | 1.55 t/m³ |
| Topsoil | 35° | 1.3 t/m³ |
| Excavated soil | 34° | 1.5 t/m³ |
| Road base / crushed rock | 38° | 1.7 t/m³ |
| Riprap | 40° | 1.6 t/m³ |
| Coal | 38° | 0.85 t/m³ |
| Potash | 32° | 1.1 t/m³ |

The P panel shows the pile's **volume** (m³ loose), **weight** (tonnes, from the density),
**height**, **base** size and **truck loads** (10 m³ each). For example 50 m³ of gravel is a cone
about 3.0 m high and 8 m across, weighing 80 t.

A pile sits on whatever is under it: uneven ground, the floor of a pit, or another pile. A cone
always holds the volume you gave it, so poured into a pit it rises less above the rim. Piles are
solid: you can walk and drive over them, and things you place snap onto them.

## Labels and volumes

While the library is open (build mode) each excavation and stockpile has a label with its volume,
e.g. *Gravel 20 mm · 50 m³ · 80 t* or *Excavation · 291 m³ cut*. The outlines show in build mode
too; the pits and piles themselves always show.

Volumes are worked out on a 0.5 m grid and come out within about 1% of the textbook figure for
the shape; for example a 20 x 10 m pit (drawn by its top), 2 m deep with 1 : 1 sides, reads
290.5 m³ against 290.7 m³ by the prismoidal formula, and a 10 x 20 m floor 4 m down at 1.5 : 1
reads 1,711.7 m³ against 1,712 m³. They are measured from the ground as Google's map has it (inside a
flatten area, from the area's floor), so they're as good as the map: Google's mesh can be off by
a few tenths of a metre, which over a large area adds up. Use them for planning, not for quantities
you'll be paid on.

## With Google's 3D map

Pits and piles are drawn on top of Google's mesh: around them you still see Google's photo
texture. Inside a pit (and under a pile, and a 1 m lip of dug earth round a pit) whatever of
Google's mesh stands above the earthworks is hidden, rail cars and sheds included, and can't be
walked or driven on; the attribution in the corner says the map has been edited.

Google's ground loads in stages, coarse first, and is coarser far from where you are. Earthworks and
flatten areas take the ground from the sharpest tiles they've had: as the map sharpens they settle
(a pit by a few centimetres up close), and flying away doesn't move them. After a reload, or seen
from far off, they stand on the coarser ground shown there (the first tiles to load can be metres
out, briefly) and come back exactly where they were, heights and volumes, once you're close enough
for the tiles to be as sharp as when you placed them. The ground itself isn't saved: it's Google's.

## Saving

Excavations and stockpiles are saved with the layout like any other item, and come back when you
reload or open an exported layout (they don't dig or pour themselves again; a pit comes back at the
dig stage it was saved at). A pit saved before its sides had methods comes back exactly as it was,
its rectangle the top of the cut, and saves again just as it was saved. Ground dug or dumped
some other way (see below) is saved with the layout too, to the centimetre.

The layout is saved in this browser, which has room for about 5 MB. A site of placed items takes a
kilobyte or two, and digging with an excavator adds about 10 to 20 kB for every 32 m square it
works over. If the browser ever runs out of room, a message says so: the copy saved before is kept, but
what you've changed since would be lost on reloading, so use **Export layout** (or delete something)
and it saves again as soon as there's room.

An excavator's digging is kept as dips below the ground or pit it dug into: a bite out of a pit's
floor stays as just that dip if the pit is moved or deleted, and a pit drawn over earlier digging
is that much deeper there. A bite out of a stockpile comes off the pile's volume; when the pile is
moved, changed or deleted it is planned afresh, and the bites go with it rather than leaving holes
in the ground it stood on.

## Limits

- The ground is a grid of heights 0.5 m apart, so there are no overhangs or tunnels, and a
  *vertical* side or riser is drawn as a very steep face about 1 m wide (behind shoring, it's drawn
  straight: [shoring.md](shoring.md)). Benches narrower than about 1 m, or risers under 0.5 m, are
  too fine for the grid to show well; their volumes still come out right.
- One slope ratio and one bench size serve all of a pit's sloped and stepped sides.
- Excavations and ridges can be up to 200 m long; cones up to 20,000 m³ (**Spoil pile** makes a
  ridge for more).

## For developers: digging from code

The terrain is `window.twin.terrain` (and is passed around as `terrain`). An excavator, or anything
else, can dig and dump with it. Positions are in the scene's frame in metres (`x` is west, `z` is
north: use `enuToLocal()` in `src/geo.js`), headings are compass degrees, volumes are m³.

- `terrain.dig( { x, z, heading, width, length, volume, maxDepth } )` takes up to `volume` m³ (bank)
  from under a bucket `width` across and `length` along `heading`, no deeper than `maxDepth` (default
  6 m) below the original ground, and returns what it took. The bucket skims what's highest first;
  walls steeper than about 65° slump into the hole. It bites into stockpiles and dumped material too;
  `terrain.lastDig` then gives `{ bank, loose }`: how much was ground as it lay (it swells by `SWELL`
  when dumped) and how much was already loose (it doesn't swell again).
- `terrain.deposit( { x, z, volume, material, radius } )` dumps `volume` m³ (loose) of a material
  (`'soil'`, `'gravel'`... or its name) spread over `radius` metres; it settles at the material's
  angle of repose on whatever is there. Multiply bank volumes by `SWELL` (1.25) for loose.
- `terrain.heightAt( x, z )` is the ground height there, earthworks included.
- `terrain.resetFreeform()` undoes all such digging and dumping.
