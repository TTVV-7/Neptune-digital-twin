# Shoring: trench boxes, slide rail, hydraulic shores, and walls with support levels

An excavation can be shored instead of sloped, as a whole or side by side. Pick the system in its P
panel and it's drawn in the pit to scale, with a count of what goes in, the wall area it holds, a
rough weight, its support levels and the checks that apply, so you can see what the job needs on
site and plan where it's staged. The library's **Shoring** category has the steel pieces to lay
down before they go in.

There are two kinds of system:

- **Trench systems** (trench box, slide rail, hydraulic shores) span between opposite walls, so they
  shore the whole excavation.
- **Walls** (sheet piles, soldier piles with lagging, secant pile walls, contiguous pile walls) stand
  on their own, so each can line any side: sheet piles along the road, a secant wall along the rail,
  the open sides sloped. Deep walls are held by **support levels**: walers with struts across, rakers
  down to kicker blocks, or tiebacks drilled back into the ground.

**This is a planning aid, not an engineered design.** The sizes, counts and weights are typical
figures for laying out a site and talking to suppliers. Real shoring is chosen from the
manufacturer's tabulated data for the soil, depth and loads (surcharge from spoil, cranes and
traffic, water), or designed by a professional engineer, and checked on site by a qualified
person.

## Using it

1. Draw an excavation (library **L** → *Tools* → **Excavation**) or select one, and press **P**.
2. Shore the whole pit with one system, or pick a method for each side: sloped, stepped or one of the
   walls (the excavation's fields are in [earthworks.md](earthworks.md)). Shored sides are cut
   vertical and the pit is redug; set them back to sloped and the slopes come back.
3. For walls, set the **support levels** (suggested from the depth, or none, struts, rakers or
   tiebacks), and if you like the **levels** themselves (metres down, e.g. *1.5, 4.5*), the
   **embedment**, the raker or anchor angle and the bond length. Empty or 0 means suggested.
4. Move the **dig stage** slider to see the works part way: walls in, dug to the first level, level
   1 in, and so on down to the floor.
5. **Section across** or **Section along** cuts through the pit: the walls down to their toe, the
   levels with their depths and spacing, struts, rakers and kicker blocks, tiebacks with their free
   and bond lengths and no-dig reach, drawn to scale, with the scene cut away to match
   ([excavation-section.md](excavation-section.md)).

The shoring is rebuilt from the pit's params whenever they change (but not for the dig stage, which
only shows and hides what's in), and follows the pit when it's moved or turned. Unlike the pit's
orange outline it shows all the time, library open or closed: it's a real thing on site. It's saved
with the layout. Pits saved before walls and support levels could be chosen look exactly as they
did: their sheet piles keep the one waler 0.7 m down they were drawn with.

Supports that line only two sides (trench boxes and hydraulic shores) run along the longer side
of the rectangle, whichever way it was drawn. Their ends can be left open (vertical) or sloped back
at the pit's slope: then the boxes or shores stand on the floor between the sloped ends, and the
open-ends note goes.

## The options

### Trench box

Two steel side panels held apart by spreader pipes, dropped into a trench and dragged along as the
pipe goes in. For utility trenches, where people work between the panels.

- Drawn: safety-yellow panels 120 mm thick with ribs down the outside, a channel along the top and
  collar posts where the 150 mm (6 in) spreaders pin on: two per end in a box, near the top and
  1.2 m up, which leaves about 1.1 m (44 in) under them for the pipe (boxes are sold with anything
  from about 0.5 to 2 m); one per end in a stacker. Lifting eyes on top.
- Sizes as they're sold: panels 2.4 m (8 ft) tall, and 1.2 m (4 ft) stackers; lengths 2.4, 3.0,
  3.7, 4.9, 6.1 and 7.3 m (8, 10, 12, 16, 20 and 24 ft).
- Along the trench: of the runs that leave less than the shortest box (2.4 m) uncovered, the one
  with the fewest boxes, then the longest run, longest boxes first, centred. A box may be up to 5 cm
  longer than the trench. For example 6 m takes one 16 ft box, 13.4 m a 24 and a 20, 20 m two 24s
  and a 16, 25.5 m three 24s and a 10.
- Up: 2.4 m boxes, with a 1.2 m stacker on top where that's enough, until the top stands at least
  0.3 m out of the ground (WorkSafeBC 20.81(5), see below). 1.5 m deep takes one box, 2.4 and 3 m
  a box and a stacker, 5 m two boxes and a stacker. A pit no deeper than 1.2 m, which needs no
  support, gets a 1.2 m box.
- The panels stand against the long sides. Over about 4.5 m between the panels the spreaders don't
  reach: it's still drawn, with a warning to use slide rail or sheet piles.
- The ends are open, as on real boxes: the notes say to slope them or fit end plates, and how much
  of each end the boxes don't reach.
- On most jobs one or two boxes are dragged along as the pipe goes in, rather than lining the whole
  trench: with more than two, the notes say so. The count and weight are for lining all of it.

Readout, e.g. a 3 x 20 m trench 3 m deep: *3 boxes: 2 × 2.4 × 7.3 m (8 × 24 ft) + 1 × 2.4 × 4.9 m
(8 × 16 ft), with stackers 2 × 1.2 × 7.3 m (4 × 24 ft) + 1 × 1.2 × 4.9 m (4 × 16 ft); 2.8 m
between panels, top 0.7 m above the rim*, 117 m² of shored wall, about 17 t of steel. Sizes are
height by length, as boxes are sold.

### Slide rail

Steel posts set at the corners and along the sides, with panels sliding down between them as the
pit is dug. For manholes, pump stations and pits where a box won't do, with all four sides held.

- Drawn: yellow posts at the corners and every 4 m or less, grey panels between them on all four
  sides, stacked like trench boxes (2.4 m, with 1.2 m on top) to at least 0.3 m out of the ground.
  The posts stand at least 0.6 m out of the ground.
- In a trench up to 6 m wide, a strut across between each pair of facing posts.
- Most systems go to about 7.5 m deep; deeper gets a warning.

### Hydraulic shores

Pairs of aluminium rails pressed against the trench walls by hydraulic cylinders across the trench.
Light and quick to set from the top, for trenches in reasonably firm ground.

- Drawn: a shore every 2.4 m (8 ft) or less along the trench, starting 0.6 m in from the ends, its
  rails from 0.3 m off the floor to 0.3 m out of the ground; the top cylinder 0.45 m below the rim
  and the rest spread down to 0.75 m above the floor, no more than 1.2 m apart (one row up to
  1.65 m deep, 2 rows at 2.4 m, 3 at 3 m). The trench walls between the rails are bare earth.
- Cylinders reach about 4 m: wider gets a warning. Tabulated data generally stops at 6 m (20 ft)
  deep: deeper gets a warning too.
- The ends are open, and in loose or wet ground the rails need plywood sheeting behind them: the
  notes say so.

### Sheet piles

Interlocking steel sheets driven round the pit before it's dug, holding back soil and much of the
water. For deep pits, soft ground and anywhere near the water, as on the berths here.

- Drawn: Z-profile sheets about 0.6 m wide and 0.38 m deep, centred on the side's line, standing
  1 m out of the ground, down to their embedment below the floor.
- With support levels (below): a steel waler (a W360 on its side) along the inside at each level.
- Pits saved before support levels could be chosen (and *one waler 0.7 m down, as first drawn*):
  sheets all round with a waler 0.7 m down; deeper than 4 m, struts across the short way (up to 12 m
  across) every 4.5 m or less, and braces across the corners of pits 6 m and wider. Wider than 12 m
  it says to use rakers or tie-backs. The sheets are 1 m out of the ground, the depth, and a toe of
  about the depth again for a cantilever (4 m deep or less) or 0.6 of it when braced, at least 1.5 m,
  rounded up to 0.5 m.

Readout, e.g. a 12 x 12 m pit 5 m deep saved before: *80 sheets, 48 m of wall, 9.0 m long each
(Z-profile, 0.6 m wide); waler round the inside, 2 struts across, 4 corner braces*, 240 m², about
55 t of steel. A 12 x 20 m floor 8 m deep, sheets on sides 1 and 3 and the others sloped for soil C:
*120 sheets (Z-profile, 0.6 m wide) on sides 1 and 3, 13.0 m long each; walers at 3 levels with 9
struts across and 3 king posts*, 384 m².

### Soldier piles + lagging

Steel H-piles driven or drilled in round the pit, with timber boards (lagging) slotted in behind
their flanges as it's dug. Cheaper than sheet piles where water isn't a problem; not watertight.

- Drawn: HP310 piles about 2.4 m apart along the side's line (1.5 to 3 m is usual, FHWA GEC 4),
  standing 0.5 m out of the ground, with 75 x 300 mm lagging boards from the floor to 0.3 m out of
  the ground. The lagging in the readout includes that 0.3 m, and only the face that's dug: where
  the wall runs on into a slope's or benches' wing, the soil stands in front of the piles below the
  slope, so no boards go there. It goes in from the top down, 1.2 to 1.5 m at a time, as the face
  is dug: the dig stages show it so.
- Pits saved before: piles all round, a toe of 0.75 of the depth (at least 1.5 m), and deeper than
  4 m a note that they need walers with struts, rakers or tie-backs.
- Pervious: below the groundwater the checks say to dewater, grout, or use sheet or secant piles.

### Secant pile wall

Bored concrete piles that overlap: unreinforced primaries drilled first, then reinforced secondaries
cut into them. Close to watertight, stiff, and quiet to build: for deep pits by the water and next
to structures that can't take the vibration of driving.

- Drawn: 0.88 m piles at 0.73 m centres (150 mm overlap) just outside the side's line, their faces on
  it, the primaries a shade lighter; a capping beam over them standing 0.3 m out of the ground.
- Piles drift up to 1 in 200 each as they're drilled (Lindquist): when the overlap would be gone at
  the toe, the checks say to check the drilling tolerance or use bigger piles.

Readout, e.g. a 24 x 40 m floor 10 m deep with tiebacks: *182 secant piles (0.88 m, 150 mm overlap)
on all four sides, 15.5 m long each, under a capping beam; walers at 3 levels with 162 tiebacks*.

### Contiguous pile wall

Bored piles side by side with gaps of about 100 mm between them (50 to 150 mm is usual): cheaper
than secant piles, but not watertight, so for dry or cohesive ground.

- Drawn: 0.6 m piles at 0.7 m centres just outside the side's line, under a capping beam.
- Below the groundwater the checks say to dewater, grout the gaps, or use secant or sheet piles.

## Walls on some sides

With a method for each side, each wall lines only its own side; trench systems can't (they span
between opposite walls), so they're for the whole pit.

- **Beside a slope or benches** a wall runs the full length of its top edge: past the floor's
  corners and on into the slope's wing, until the slope's face meets it (the notes say how far).
  Otherwise the slope would undercut the ground behind the wall's end.
- **Where two walls meet** they close the corner: two of the same share a corner pile; of two
  different ones, the one standing less far out (sheets, soldier piles) runs on to the other's
  back, and the other stops at its face.
- The pile counts in the summary are what's drawn, corner piles counted once; the section card's
  quantities use the same counts.

## Support levels

Walls deeper than about 4 m are held up at levels down the wall. **Suggested** picks none (a
cantilever) up to 4 m deep; deeper, struts when there's a pair of opposite walls no more than about
20 m apart, else rakers. Any can be chosen.

| Support levels | Drawn | Notes |
| --- | --- | --- |
| None (cantilever) | the walls only | flagged past 4 m, stopped past 5.5 m (USACE, Caltrans) |
| Walers and struts | walers along every wall at each level; pipe struts square across between the pair of walls, at most 4.5 m apart; braces across the corners of pits 6 m and wider; king posts under struts longer than 12 m | struts past about 20 m flagged: rakers or tiebacks (NAVFAC DM 7.02). A wall with no wall opposite takes rakers. Walls too close for two walers and 0.3 m between them (a sheet-piled pit about 1 m wide) get no walers: the struts bear on their faces, with a warning that a trench system may suit better |
| Rakers to kicker blocks | inclined struts from each waler down at the raker angle (45° by default) to a concrete kicker block (1.2 x 1 x 0.6 m) half cast into the floor | flagged when rakers and kickers take more than half the floor; the berm left for them flagged when steeper than the soil's slope |
| Tiebacks | anchor heads on the walers; the strand out through the wall and down at the anchor angle (20° by default), its unbonded length past the active wedge (which rises from the foot of the wall's face, 0.36 m behind the heads) and max( 1.5 m, 0.2 H ) more, at least 4.5 m, then the grouted bond length (9 m by default) | the no-dig zone behind the wall is in the readout; flagged when the bond's centre is under less than 4.5 m of soil (FHWA GEC 4) |
| One waler 0.7 m down | as pits saved before had it | |

- **Levels**: suggested with the first a quarter of the depth down, 1.5 m at most, then the rest of
  the depth split evenly so no gap, nor the last level to the floor, is over 3 m (a rule of thumb
  from CN's shoring criteria; the owner's "about every 3 m"): 6 m deep gives 1.5 and 3.75 m, 8 m
  1.5, 3.65 and 5.85 m, 12 m 1.5, 4.15, 6.75 and 9.4 m. Left blank, the levels box shows the
  suggested ones greyed. Typed levels are flagged if they don't keep to those limits, and come back
  the same each time they're read (to 5 cm, at least 0.3 m apart).
- **How many supports**, for a big, deep pit that would otherwise be a thicket of rakers: *number
  of levels* (0 for the suggested ones; otherwise the first level as above and the rest of the depth
  split evenly into that many, at least 0.5 m apart; levels typed in the box win) and *support
  spacing* along each wall (0 for 4.5 m between struts and between rakers, 2.4 m between tiebacks;
  otherwise 1.2 to 20 m, for all three). Fewer levels bring the notes on gaps over 3 m and the last
  level's height over the floor; a spacing over the usual one notes that the walers span that far
  between supports, so they're bigger. Both are saved only when set, so pits saved before load the
  same.
- **Embedment** below the floor: suggested, as a rule of thumb, as 1.5 times the depth for a
  cantilever in loose fill, half the depth when braced or anchored, at least 1.5 m; while it's 0 its
  label says what that comes to, e.g. *embedment (0 = 4 m)*. The walls, and king posts 3 m below
  the floor, are drawn down to it: it shows in a section.
- Pile and sheet lengths are the stick-up, the depth and the embedment, rounded up to 0.5 m.

These are layouts to talk about, from rules of thumb, not a design: every wall and its support is a
professional engineer's design (WorkSafeBC 20.81(1)(d), G20.81), and the notes say so.

## Dig stages

The **dig stage** slider steps through how the pit is dug (excavation-design.js gives the stages):

- walls first, before any digging;
- with struts or tiebacks: dig to 0.6 m below level 1, put level 1 in, dig to 0.6 m below level 2,
  and so on, then the last lift to the floor (FHWA GEC 4 9.5.3: no more than 0.6 m below a level
  before it's in; WorkSafeBC 20.83(1): top down);
- with rakers: dig to below level 1, then the middle to the floor leaving a berm against the walls,
  then the kicker blocks and rakers at level 1, the berm down to below level 2, and so on;
- trench systems: before digging, then dug and shored as it goes (no slider for just the two:
  the Show panel's Before / After shows them).

The slider counts from 1, as the stage readout does, and its label says how many stages there are,
or *finished* at the last.

The shoring shows what's in at the stage: the walls once they're in, the levels installed, soldier
pile lagging down to the depth dug. Nothing is rebuilt: each level is drawn after the one above it,
so a stage just draws less of each mesh.

## P panel readouts

| Readout | Meaning |
| --- | --- |
| shoring | What goes in and how many: boxes and their sizes, sheets and their length, piles and lagging |
| shored wall | Area of excavation wall the support holds, m² |
| weight (approx.) | Rough weight of the steel (aluminium for hydraulic shores), from typical weights: steel box panels 105 kg/m², slide rail panels 120 kg/m² and posts 200 kg/m, Z-sheets 65 kg/m, HP310 piles 79 kg/m |
| shoring notes | Warnings: open ends, too wide or too deep for the system, needs bracing or an engineer, walls running into slopes, rakers' berm, tiebacks' no-dig zone, WorkSafeBC; for trench systems, that they're used to the maker's tabulated data or certification for the soil and depth, with a copy on site (20.81(1)(f), G20.81) |
| support levels | For walls: what holds them (and whether it's suggested), the levels, the struts and their span, corner braces and king posts, rakers and how much floor they take, tiebacks with their unbonded and bonded lengths and the no-dig zone behind each side, the embedment and the pile lengths |
| checks | The WorkSafeBC and practice checks for the pit, the gravest first, each with its source: groundwater, steeper than the soil allows, benches, pervious walls below water, cantilevers, levels, strut spans, anchor cover, rakers' floor, hydraulic shores in soft or wet ground, ladders in a trench. What the shoring notes already say isn't said again |

The shoring lines are left out for an unsupported pit. The weight for walls adds the walers,
struts, king posts, rakers and tiebacks (W360 walers 100 kg/m, strut pipe 97 to 200 kg/m by span),
and the concrete of pile walls, capping beams, kicker blocks and bond lengths, in m³.

## WorkSafeBC

In British Columbia, excavations are covered by Part 20 of WorkSafeBC's Occupational Health and
Safety Regulation (sections 20.78 to 20.95). The parts the notes and drawings follow:

- **20.81(1):** before anyone goes into an excavation over 1.2 m (4 ft) deep, its sides are
  sloped, benched or supported. Sloped sides follow Figure 20-1, whose steepest face, in hard and
  solid soil, is 3 horizontal to 4 vertical; softer ground needs flatter. So an unsupported pit
  over 1.2 m deep with sides steeper than that (*0.5 : 1* or *vertical*) gets *Over 1.2 m deep,
  with sides steeper than WorkSafeBC allows even in hard, solid soil (3 : 4): slope, bench or
  shore them before anyone goes in (OHS Regulation 20.81).* *1 : 1* gets no note, but it's only
  right where the ground holds it.
- **20.81(2):** the open end of a trench over 1.2 m deep is sloped, or shored. Trench boxes and
  hydraulic shores line only the long walls, so their notes say so.
- **20.81(5):** shoring extends from at least 0.3 m (1 ft) above the ground. The shoring is drawn
  that way, so that what's at the edge can't roll in: trench box and slide rail stacks get a
  stacker where the panels below would only reach the rim (a 2.4 m deep trench takes an 8 ft box
  and a 4 ft stacker), hydraulic shore rails and soldier pile lagging go 0.3 m up, and sheet piles
  stand 1 m out.
- **20.78:** an excavation over 6 m (20 ft) deep is dug to a qualified registered professional's
  written instructions, and one that uses support structures to a professional engineer's. The
  notes say which. So is one with water coming in (20.78(1)(c)), unless it's dewatered: the checks
  compare the floor with the groundwater depth (2 m down by default at Neptune, said to be assumed
  until it's set from site data). A structure in the adjacent band (20.78(1)(b)) and ground beyond a
  side sloping steeper than 3 : 1 (20.78(1)(d)) are the section's nearby check
  ([excavation-section.md](excavation-section.md)).
- **20.81(1)(d), (f):** walls are a professional engineer's design; trench boxes, slide rail and
  hydraulic shores are used to their maker's tabulated data or certification (G20.81). The notes
  say so.
- **20.86:** spoil over 0.6 m deep on average beside a supported excavation must be allowed for in
  choosing the shoring. The nearby check flags a stockpile in the band behind a wall or trench
  system, and **Spoil pile** puts the spoil beside a sloped or stepped side where there's one.

Walls aren't picked from a supplier's table: their notes say a professional engineer designs the
walls and their support, and that the lengths, sizes and levels here are rough. Where WorkSafeBC
gives no number, the checks use practice and say whose: FHWA GEC 4 (tiebacks, lagging, over-dig),
NAVFAC DM 7.02 (strut spans, pervious walls, berms), CN's shoring criteria (levels), USACE and
Caltrans (cantilevers), Lindquist (secant piles); the research behind them is summarised in
`src/excavation-design.js`.

These are reminders for planning, not a check against the regulation: read the current
regulation and its guidelines, and have a qualified person look at the actual ground.

## Library pieces

Under **Shoring** in the library, built in code at real size, placed, turned, saved and reloaded
like any other piece:

| Piece | Size | Weight |
| --- | --- | --- |
| Trench box 8 x 16 ft | 4.9 x 1.8 x 2.6 m, assembled, standing, 1.5 m inside | ~2.9 t |
| Trench box 8 x 20 ft | 6.1 x 1.8 x 2.6 m | ~3.5 t |
| Trench box 8 x 24 ft | 7.3 x 1.8 x 2.6 m | ~4.1 t |
| Trench box stacker 4 x 20 ft | 6.1 x 1.8 x 1.4 m | ~1.8 t |
| Trench box panel, lying flat | 8 x 20 ft on timbers | ~1.6 t |
| Sheet piles, bundle of 10 | 12 m Z-sheets nested five high in two rows | ~7.8 t |
| H-piles, bundle of 7 | 12 m HP310, four and three on timbers | ~6.6 t |
| Hydraulic shore | 2.4 m (8 ft) rails, two cylinders, lying flat | ~40 kg |

## How it's drawn

- The ground is a grid of heights 0.5 m apart, so a vertical side is a steep face about 1 m wide
  centred on the outline (see [earthworks.md](earthworks.md)), which keeps the volume right. Left
  like that, soil would stand in front of the shoring at the foot of the walls, up to half the
  depth. So where a wall is shored, the ground is drawn differently (`src/shoring-ground.js`): the
  face is moved onto the back of the shoring, the floor running flat up to it and the ground
  outside at rim level. A metre-wide strip of earth at rim level runs round the shoring, as the
  worked edge, and evens out the colour of ground that was dug and drawn back up. A trench box's
  run and a hydraulic shore's rails line only the long walls: the trench's ends, and its walls
  beyond the last box, stay as dug. Each side is shored on its own: sloped or stepped sides aren't
  moved, and a wall beside one is straightened only as far as that side's top edge, the face of the
  slope running on up to the wall. While a berm is left for rakers, the walls are straightened
  between the floor's corners. Up to 32 shored pits are drawn this way at once; more keep the steep
  face.
- Only the drawing changes: the volumes are the pit's (W x L x depth for a shored pit, whatever
  the shoring), and walking and clicking still use the steep face.
- Shoring isn't solid: you walk and drive through it, and clicking it selects the pit.
- Repeated parts are merged into one mesh per material, each level after the one above it so a dig
  stage draws a part of each mesh: a 60 x 40 m sheet-piled pit 12 m deep is five or six draw calls
  whatever holds it (struts, rakers or tiebacks), and a pit with a different wall on each side
  eight.

## For developers

`src/excavation-design.js` works out the pit's design from its params (which sides are walls, the
support levels and every member, in the shoring's frame, the stages and the flags);
`src/shoring.js` plans and draws the support from it; `src/shoring-models.js` builds the pieces, for
both the pits and the library (it has no DOM or app imports: World Drive bundles it);
`src/shoring-ground.js` chains onto the terrain's material, as `hideUnderEarthworks` does onto
Google's, to move the nodes of a shored side's face onto the back of the shoring (each side's line,
how far behind it the back is, and how far along it it's shored).
`window.twin.shoring.planShoring( params )` gives the plan (summary, wall area, weight, notes,
support levels, checks, and `design`, the design module's) for any excavation params, the first
`{ width, length, depth, slope, support }` included; `window.twin.shoring.shown` maps each pit to its
group. `boxRun( length )` / `boxStack( depth )` in `shoring.js` give the trench box choice (in feet).
`npm run test:shoring` checks the plans and drawings in Node (old pits against the first shoring's,
the ground's shader as JavaScript), and `npm run test:shoring-ui` and `npm run test:bracing-ui` in a
browser without Google's tiles.
