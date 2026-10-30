# Excavators that dig

Two excavators are built into the library (**L**, under **Heavy equipment**): **Excavator (20 t)**
and **Mini excavator (3.5 t)**. Place one like any other item, then press **V** to get in and dig:
it bites into the ground in front, swings round and dumps the spoil on a pile beside the hole, or
into a dump truck or haul truck parked within reach. The hole and the pile are the same earthworks
as **Excavation** and **Stockpile** (see Earthworks), so they're saved with the layout.

| | Excavator (20 t) | Mini excavator (3.5 t) |
| --- | --- | --- |
| Tracks (length × overall width) | 4.45 × 3.2 m, 800 mm steel shoes | 2.1 × 1.74 m, rubber, dozer blade |
| Boom / stick | 5.7 m / 2.9 m | 2.55 m / 1.4 m |
| Bucket | 1.2 m wide, 1.0 m³ a pass (bank) | 0.5 m wide, 0.1 m³ a pass |
| Digs from the swing axis | 3.5 to 8.5 m | 2 to 4.4 m |
| Dumps | 5.5 m out to the side | 2.9 m out to the side |
| Deepest | 6 m below the original ground | 3 m |
| Top speed on its tracks | 5.5 km/h | 4.5 km/h |

Both are generic machines with the proportions of their class, not any one make.

## Driving and digging

Select the excavator (or stand within 25 m of it) and press **V**. The speedometer is replaced by
the excavator's readouts and keys.

| Key | Action |
| --- | --- |
| Hold **Space** or the left mouse button | Dig, one bucketful after another. Let go and it finishes the pass it's on |
| **Q** / **E** | Swing the dig direction left / right (relative to the tracks) |
| **R** / **F** or the mouse wheel | Reach further / closer |
| **X** | Dump on the left or the right of the dig direction |
| **W** / **S** | Tracks forward / back |
| **A** / **D** | Turn on the spot (or steer while moving) |
| **C** | Camera: high behind the machine, or the operator's seat |
| **V** or **Esc** | Get out. The arm folds back to its parked pose |

Outlines on the ground show what it's about to do: **orange** where the bucket will dig, **yellow**
where it will dump on the ground, and **green** round a truck's bed when it will load a truck.

Each pass takes about five seconds (faster than a real operator): the bucket reaches out and
bites in, drags back towards the machine taking a bucketful off the top, curls, lifts, swings to
the dump side, opens and swings back. The ground changes as the bucket drags; the spoil lands
when the bucket opens. Dug material swells by a quarter, so each 1.0 m³ taken out of the ground
(bank) makes a 1.25 m³ (loose) addition to the pile, which settles at the angle of repose of
*Excavated soil* (34°). Freshly dug walls stand up to about 65° and slump beyond that.

The machine rests on the ground under its tracks, tilting with it, and you can drive it into its
own hole or up a pile. It won't climb a wall steeper than about 60°, and containers, walls and
other things placed in the way stop its tracks ("Blocked"), and its tail when the house is turned
so that it leads. Getting out parks it as it stands, tilted on the pile or down in the hole, and
it's saved like that until you move or turn it. Other vehicles park the same way.

The readouts:

| Readout | Meaning |
| --- | --- |
| reach | Distance from the swing axis to the middle of the next bite |
| swing | Dig direction relative to the tracks |
| dump | Dump side, and whether it's going on the spoil pile or into which truck |
| cycles | Passes so far (since the page was opened) |
| dug | Bank m³ taken out of the ground |
| spoil | Loose m³ dumped on the ground |
| truck | The target truck's load: loose m³ of its capacity, and tonnes (at 1.5 t/m³) |

If the bucket can't reach deep enough where you're digging, a pass takes less, or nothing at all
("Too deep to reach"): reach further out, or drive closer.

## Loading trucks

Park a truck with its bed beside the excavator, on the dump side and within reach (for the 20 t,
3 to 8.5 m from the swing axis and within about 50° of straight out to the side). The dump
outline turns green round its bed, and each pass dumps into it instead of onto the pile. The load
shows as a heap in the bed, and the HUD shows how full it is. When it's full ("Truck full"), the
excavator goes back to the spoil pile.

Trucks are recognised by name: any vehicle whose name has *dump*, *haul*, *tipper* or *roll-off*
in it, such as **Haul truck (off-highway, 55 t)** (34 m³ heaped) and the **Roll-off dumpsters**
(20 and 40 yd). Front-load bins don't count: they have lids. A truck's load is saved with the
layout. Drive the truck away (V) and the load goes with it.

## Notes

- Getting out leaves the ground as it is. The library's **Clear** puts it back, along with
  everything else.
- With Google tiles, nothing can be dug until the tiles under the machine have loaded; digging
  presses Google's mesh down under the hole like an excavation does.
- The ground is a grid of 0.5 m cells, so a single bite is a coarse rectangle, and narrow
  trenches are wider than the bucket.
- The counters (cycles, dug, spoil) are per machine while the page is open; they're not saved.
  The hole, the pile and truck loads are.

## For developers

- `src/excavator-model.js` builds the machine: `buildExcavator( EXCAVATOR_20T )` returns a group
  whose `userData.rig` poses it: `rig.setPose( { swing, boom, stick, bucket } )` (radians),
  `rig.solve( { u, v, phi } )` (the joint angles that put the tooth tips at `u` m ahead of the
  swing axis and `v` m up, teeth at angle `phi`), `rig.rest` (the parked pose). Add a machine
  size by adding a spec like `EXCAVATOR_MINI` and a `PROCEDURAL_ITEMS` entry in `procedural.js`.
- `src/drive.js`: `driver.addMachine( type, create )` lets any vehicle whose library `drive`
  spec has that `type` be driven by its own controller instead of car physics. The excavator
  registers `'excavator'` in `src/excavator.js`.
