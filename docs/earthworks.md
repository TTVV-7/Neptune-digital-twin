# Earthworks: excavations and stockpiles

For laydown planning you can cut into the ground and pile material on it, and read off how much
material that is. Both tools are at the top of the library (**L**), under **Tools**, next to
**Flatten area**.

## Excavations

1. Click **Excavation**, then drag a rectangle on the ground. The rectangle is the **top edge of the
   cut**, lined up with the way you're looking. A click without a drag makes a 10 x 10 m pit.
2. The pit digs itself: it deepens from the ground to its full depth over a few seconds.
3. Press **P** to change it:
   - **width**, **length**: the top of the cut, in metres.
   - **depth**: from the rim down to the floor (2 m to start with).
   - **side slope**, horizontal : vertical: *vertical (shored)*, *0.5 : 1*, *1 : 1* (the default),
     *1.5 : 1* or *2 : 1*. A 1 : 1 slope goes out 1 m for every 1 m down. If the rectangle is too
     small for its slopes at that depth, the floor shrinks to a line and the pit is shallower.
   - **Dig** plays the digging again.
   - **Spoil pile** pours what came out of the pit beside it, clear of the rim: a pile of
     *Excavated soil* holding the loose volume: a ridge running along a trench (or any pit at least
     twice as long as it is wide, one a cone wouldn't fit beside, or one with more spoil than a
     cone can hold), otherwise a cone.

The rim is the lowest ground around the rectangle as it was before anything was dug, so the pit
doesn't sink after itself, and whatever stands inside it in Google's mesh (rail cars, a shed) is dug
away with it rather than holding the floor up. Where a flatten area reaches the pit, its floor
counts as the ground there. Where the ground beyond the outline is higher, the sides keep climbing
(up to 3 m out) until they meet it.

The P panel shows:

| Readout | Meaning |
| --- | --- |
| cut (bank) | Volume taken out of the ground, in m³ as it was in the ground |
| loose (×1.25) | The same material dug up: it takes about a quarter more room |
| truck loads | Tandem dump truck loads of 10 m³ loose, rounded up |
| floor | Size of the flat floor, or how deep the sides meet if there isn't one |

With the library open, click anywhere over a pit to select it, drag it to move it, **R** to turn it,
**Delete** to remove it: the ground comes back exactly as it was (apart from any digging an
excavator has done there, see Saving).

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
the shape; for example a 20 x 10 m pit, 2 m deep with 1 : 1 sides, reads 290.5 m³ against 290.7 m³
by the prismoidal formula. They are measured from the ground as Google's map has it (inside a
flatten area, from the area's floor), so they're as good as the map: Google's mesh can be off by
a few tenths of a metre, which over a large area adds up. Use them for planning, not for quantities
you'll be paid on.

## With Google's 3D map

Pits and piles are drawn on top of Google's mesh: around them you still see Google's photo
texture. Under a pit Google's mesh is pressed down out of sight, like a flatten area, and the
attribution in the corner says so. Google's ground loads in stages as you get closer, so a pit can
shift by a few centimetres while the map sharpens.

## Saving

Excavations and stockpiles are saved with the layout like any other item, and come back when you
reload or open an exported layout. Ground dug or dumped some other way (see below) is saved with
the layout too.

An excavator's digging is kept as dips below the ground or pit it dug into: a bite out of a pit's
floor stays as just that dip if the pit is moved or deleted, and a pit drawn over earlier digging
is that much deeper there. A bite out of a stockpile comes off the pile's volume; when the pile is
moved, changed or deleted it is planned afresh, and the bites go with it rather than leaving holes
in the ground it stood on.

## Limits

- The ground is a grid of heights 0.5 m apart, so there are no overhangs or tunnels, and a
  *vertical (shored)* side is drawn as a very steep face about 1 m wide.
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
