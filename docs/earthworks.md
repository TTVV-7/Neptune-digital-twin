# Earthworks: excavations and stockpiles

For laydown planning you can cut into the ground and pile material on it, and read off how much
material that is. Both tools are at the top of the library (**L**), under **Tools**, next to
**Flatten area**.

## Excavations

**A planning aid with WorkSafeBC flags, not engineering design or a compliance check.** The slopes,
benches, walls and support levels here are rules of thumb for laying out a site and talking to
suppliers and engineers. Walls are a professional engineer's design (OHS Regulation 20.81(1)(d),
G20.81); trench boxes, slide rail and hydraulic shores are used to the maker's tabulated data or
certification (20.81(1)(f), G20.81); over 6 m deep, beside a structure, with water coming in or
the ground beyond sloping steeper than 3 : 1, a qualified registered professional's (QRP's) written
instructions, a professional engineer's (PE's) with support (20.78). Every pit's P panel says so
under *planning aid*.

1. Click **Excavation**, then drag a rectangle on the ground. The rectangle is the **floor of the
   pit**, lined up with the way you're looking: the space the work needs down there. While you
   drag, the top of the cut it makes is outlined dashed round it, with both sizes by the pointer. A
   click without a drag makes a 10 x 10 m floor.
2. The pit digs itself, 2 m deep to start with, its sides sloped out from the floor at the soil's
   usual slope: Neptune's fill and sand by the water are type C, so 1.5 : 1 (OSHA's figure, for
   comparison: WorkSafeBC gives none for type C), and the top of the cut is 3 m wider than the
   floor all round.
3. Press **P** to change it (the fields that don't apply are left out):
   - **width**, **length**: the rectangle, in metres. **depth**: from the rim down to the floor.
   - **the rectangle is**: *the floor of the pit* (new pits), or *the top of the cut*, as every
     pit was before sides had methods: then the floor shrinks as the sides come in, and if the
     rectangle is too small for them the floor shrinks to a line and the pit is shallower. Changing
     it keeps the numbers, so the pit grows or shrinks round the same rectangle.
   - **sides**: *sloped*, *stepped (benched)*, *shored*, or *per side*.
   - **each side** (per side): **side 1 (N)** to **side 4 (W)**, each *Sloped*, *Stepped* or held by
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
   - **slope** (sloped sides, its label saying the ratio in use, e.g. *slope (1.5 : 1)*): *usual
     for the soil* (the table below), or *a ratio of my own*, then **slope (h : v)**, horizontal to
     vertical, 0 (vertical) to 4. A 1 : 1 slope goes out 1 m for every 1 m down.
   - **bench height**, **bench width** (stepped sides): 0 for WorkSafeBC's figure (below); while
     it's 0 the label says what it works out to, e.g. *bench height (0 = 1.2 m)*.
   - **support levels**, **levels**, **embedment** and the raker or tieback angles (walls): the
     shoring's, see [shoring.md](shoring.md).
   - **groundwater (m down)**: 2 m to start with, Neptune being on the water.
   - **dig stage**: a slider through the order the pit is dug in (below), counted from 1, its label
     saying how many there are or that the pit shown is *finished*. Pits dug in one go (sloped,
     stepped, a trench system) have just before and after, which the Show panel's **Before** /
     **After** shows, and no slider.
   - **Dig** plays the digging again, down to the dig stage shown.
   - **Spoil pile** pours what came out of the pit beside it, clear of the top of the cut: a pile
     of *Excavated soil* holding the loose volume: a ridge running along a trench (or any pit at
     least twice as long as it is wide, one a cone wouldn't fit beside, or one with more spoil than
     a cone can hold), otherwise a cone. It goes beside a long side that's sloped or stepped where
     there is one, as a pile beside shoring loads it (20.86).
   - The buttons (**Dig**, **Spoil pile**, **Section across**, **Section along**) come before the
     readouts, which can run long.

The rim is the lowest ground around the top of the cut as it was before anything was dug, so the
pit doesn't sink after itself, and whatever stands inside it in Google's mesh (rail cars, a shed) is
dug away with it rather than holding the floor up. Where a flatten area reaches the pit, its floor
counts as the ground there. Where the ground beyond the top of a sloped side is higher, the slope
keeps climbing (up to 3 m out) until it meets it.

### Sloped, stepped or shored

| Soil | Usual slope (h : v) | Where the figure comes from |
| --- | --- | --- |
| A: hard and solid | 0.75 : 1 (3 : 4) | WorkSafeBC Figure 20-1, the law |
| B: likely to crack or crumble | 1 : 1 | OSHA's Table B-1, for comparison: WorkSafeBC gives none |
| C: soft, sandy, filled or loose | 1.5 : 1 | OSHA's Table B-1, for comparison |
| C, wet: water seeping or submerged | 3 : 1 | Ontario's type 4, for comparison; a QRP's instructions too |

- **Sloped**: each sloped side runs straight from the floor's edge up to the top of the cut. Two
  slopes meet on a straight hip at the corner.
- **Stepped**: equal risers no taller than the bench height (1.2 m, WorkSafeBC's most), and benches
  1.5 times as wide as a riser (Figure 20-2: with equal benches, narrower ones bring the steps
  inside its 3H:4V line). For example 4.8 m deep is four 1.2 m risers and 1.8 m benches, the top
  5.4 m out from the floor. The top riser starts at the top of the cut, the bottom one meets the
  floor. WorkSafeBC shows benching only for hard soil and trenches (not over 3.7 m wide, G20.81),
  and OSHA allows none in type C: the checks say so.
- **Shored**: the side is cut vertical and held by its wall or the trench system, drawn in the pit
  ([shoring.md](shoring.md)). Next to a slope or benches, the wall runs the whole length of its top
  edge, standing in the slope's wing.

The corners work themselves out where two sides meet, and the volumes and the top of the cut
follow. With the rectangle as the floor, changing how the sides are cut changes the top of the cut
(what the pit takes up at the surface), not the floor. Nothing here is engineering: over 6 m deep,
or with water coming in, or a structure beside it, WorkSafeBC wants a QRP's written instructions, a
PE's with support (20.78); walls are an engineer's design (20.81(1)(d)), and trench systems are
used to their maker's data (20.81(1)(f)).

### Dig stages

**dig stage** shows the pit part way dug, and is saved with the layout. A sloped, stepped or
trench-shored pit goes from *before digging* to *dug*. With walls, they go in first; then each
lift is dug to 0.6 m below the next support level, which goes in before the next lift, down to the
floor. With rakers, the middle is dug to the floor first, leaving a berm of soil against the walls
until the rakers and their kicker blocks are in. The stage readout says what's happening, e.g.
*4 of 8: Dig to 4.25 m*. **Dig** digs down to the stage shown.

### What the P panel shows

The excavation's own readouts come first:

| Readout | Meaning |
| --- | --- |
| cut (bank) | Volume taken out of the ground, in m³ as it was in the ground |
| loose (×1.25) | The same material dug up: it takes about a quarter more room |
| truck loads | Tandem dump truck loads of 10 m³ loose, rounded up |
| floor | Size of the flat floor, or how deep the sides meet if there isn't one |
| top of the cut | Size and area of the pit at the surface: what it takes up on the site |
| stage | The dig stage shown, unless it's the finished pit |
| planning aid | What these figures are, and aren't (always shown) |

Then the shoring's (*shoring*, *shored wall*, *weight*, *shoring notes*, *support levels*,
*checks*: [shoring.md](shoring.md)) and the section's (*compared*, *nearby*: below). Notes, written
out across the panel, each have their name over them as a small heading.

### Section, quantities and checks

- **Section across** and **Section along** (P panel) cut through the pit and draw it to scale on a
  card: the ground before digging, the slopes with their ratios, the benches with their height and
  width, the walls down to their embedment, each support level, struts, rakers and kicker blocks,
  tiebacks with their free and bond lengths and no-dig reach, and the groundwater. A slider moves
  the cut through the pit, and with **3D** ticked the scene is cut away too, so a deep pit's profile
  can be seen in place. See [excavation-section.md](excavation-section.md).
- The section card has the full quantities: the design's volume from flat ground at the rim (*cut
  (bank)* is measured from the map's ground, so it differs on slopes), walls, sheets or piles,
  walers, struts, rakers, tiebacks.
- **compared**: the same floor dug the other ways. For a 30 × 20 m floor 8 m deep with sheet piles
  on side 1, benches on side 2 and the other two sloped for soil C: *Sloped (1.5 : 1, soil C)
  instead: 2,388 m³ more cut, top 54.0 × 44.0 m. Stepped (not for soil C: benching shown for hard
  soil only; over 3.7 m wide: a QRP's design) instead: 1,389 m³ more cut, top 50.6 × 40.6 m.
  Shored instead: 3,948 m³ less cut, top 30.0 × 20.0 m.* Stepped says when benching wouldn't be
  allowed there: in soil C or wet ground, or over 3.7 m wide.
- **nearby**: placed items that the cut, the spoil set-back (1.2 m, 0.6 m for a trench, a cut
  under 3.7 m wide at the bottom and over 1.2 m deep: WorkSafeBC 20.90) or the band WorkSafeBC calls
  adjacent (the depth out from the toe: 20.78(1)(b)) reaches, the first of those only; and besides,
  any over a tieback no-dig zone, and spoil beside a wall or trench system, whose shoring must allow
  for it if it's over 0.6 m deep (20.86). It also reads the ground beyond each side from the map
  and says where it rises or falls steeper than 1 in 3 (20.78(1)(d)). Rail lines, roads and
  buildings in Google's map aren't items, so place one there to have it checked.
- **checks** (the shoring's readout, and the section card's *Checks*): the flags below, the gravest
  first, each with its source. What the shoring notes already say isn't said twice.

| Check | When | Source |
| --- | --- | --- |
| Sides too steep (stop) | over 1.2 m deep, sloped sides steeper than 3 : 4 | WorkSafeBC 20.81(1), Figure 20-1 |
| Steeper than the soil | over 1.2 m, sloped steeper than the soil's ratio above | WorkSafeBC 20.81(1); OSHA, Ontario for comparison |
| Over 6 m deep | slopes: a QRP's written instructions; benches: a professional engineer's design; any pit: a QRP's or (shored) PE's written instructions | WorkSafeBC 20.78(1)(a), 20.81(1)(a), Figures 20-1 and 20-2 |
| Benches | risers over 1.2 m (stop: unsupported vertical faces); benches narrower than 1.5 × the riser (warn: inside Figure 20-2's 3H:4V line); benched in type C or wet; wider than 3.7 m (warn: Figure 20-2 doesn't apply) | WorkSafeBC 20.81(1), Figure 20-2, G20.81; OSHA App. B |
| Groundwater, wet | the floor below the groundwater depth (2 m down at Neptune, said to be assumed until it's set from site data); wet soil: a QRP's written instructions, a PE's with support | WorkSafeBC 20.78(1)(c), (2) |
| Engineered | any wall: a professional engineer designs it and its support | WorkSafeBC 20.81(1)(d), G20.81 |
| Pervious wall | soldier piles or a contiguous wall below the groundwater | NAVFAC DM 7.02, FHWA GEC 4 |
| Secant overlap | under 75 mm, or gone at the toe from drilling drift | Lindquist (DFI 2011) |
| Cantilever | walls with no support levels: over 4 m (warn), over 5.5 m (stop: a practice limit, not WorkSafeBC's) | USACE EM 1110-2-2504, Caltrans |
| Levels | typed levels: the first over 1.5 m down, gaps over 3 m, the last over 3 m above the floor; levels at or below the floor | CN shoring criteria 11-13 |
| Struts | over 12 m long (king posts), over about 20 m (rakers or tiebacks); a wall with no wall opposite (rakers instead); walls too close for walers (the struts bear on their faces) | NAVFAC DM 7.02 Table 5; planning default |
| Tiebacks | the top row's bond under 4.5 m of soil | FHWA GEC 4 5.3.7 |
| Rakers | rakers and kicker blocks over half the floor; the berm left for them steeper than the soil's slope | NAVFAC DM 7.02 Table 6 |
| Hydraulic shores | in type C or wet ground, or below the water | NAXSA; OSHA App. D |
| Access | a trench over 1.2 m deep: a ladder or ramp within 8 m of anyone in it | WorkSafeBC 20.87(2) |

WorkSafeBC gives a slope only for hard soil (Figure 20-1, 3 : 4); the B, C and wet slopes are
OSHA's and Ontario's, used for comparison, and the checks say so. These are reminders for planning,
not a check against the regulation: read the current regulation and its guidelines, and have a
qualified person look at the actual ground. A check whose figure no source sets says *planning
default*.

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

An excavation's design comes from its params alone: `src/excavation-design.js` (no scene or DOM)
works out each side, the design surface the terrain digs to (`depthAt`), the support levels and
their members, the dig stages, the quantities, the comparison of methods and the checks, once per
set of params (`planExcavation( params )`). The terrain, the shoring and the section all read it.
`npm run test:excavation` checks it in Node, old pits against the surface they had bit for bit;
`npm run test:excavation-ui` checks the pits, the P panel, the side labels, the tool and saving in a
browser without Google's tiles.
