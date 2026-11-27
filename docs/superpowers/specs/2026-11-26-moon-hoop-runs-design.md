# Moon hoop runs: design

## Why

Few people drive on the Moon, and most visits leave after about a minute. The free worlds cost
nothing to stream, so time spent there is time that doesn't cost Google tile money. The owner
wanted something on the Moon worth playing for its own sake, with a higher skill ceiling than the
plane has now (speed is set, climbing is a button, it can't crash and it hovers, so everyone flies
the same line).

## What

The Moon's weekly and monthly challenges become **hoop runs**: fly the plane through a line of
hoops against the clock, with the same boards, ghosts, Retry and links that challenges already
have. Other worlds keep their challenges as they are.

Prior art the owner named: Mario Kart's drift boost and trick boost, Rocket League's limited boost
with pads. Mockups: https://claude.ai/artifact/VwEcffuDt3sKgRQ7TMKdGz

### Goals

- A competitive time trial on the Moon, solo against the clock and a ghost.
- Route choice and boost management as the skill: a boost tank you refill, carve boosts on hard
  turns, trick boosts after hoops.
- Courses tied to the real map: hoops sit a set height over the real ground under them, and each
  course's style comes from the kind of place it's at.
- A fresh course every period with no hand work.

### Non-goals

- Live racing against others, and items. (Many Moon visits are alone; items need a grid, lag
  handling and opponents.)
- Hand-designed courses. (Possible later.)
- Changing how the plane flies anywhere outside a hoop run.
- Hoop runs on Mars, Vesta or Ceres. (Shapes make that a one-line change later.)

### Anti-goals

- Anything that lets a run's time beat what the course mode can fly: the Worker must still be able
  to turn away impossible times.
- Pass rides handling better: every ride flies the same in a hoop run (its own look).

## Approaches considered

- **A. A new generated kind, `hoops` (picked).** Laid out by the Worker as gates are now, with a
  height over the ground and a facing for each hoop, boost orbs and trick hoops, and a course mode
  for the plane during the run. Reuses everything challenges have; decent rather than clever
  courses.
- B. Hand-designed courses rotating. Better courses, but each built by hand, repeats after a few
  weeks, and a new path through the Worker, whose challenges are all generated now.

## Design

### Rules (`src/drive-app/challenge-rules.js`)

- A fourth kind, `hoops` ("Hoop run"). The kind a period's challenge is picked from depends on the
  world: on the Moon it's always `hoops`; elsewhere as before.
- A route's `points` are `[ lat, lon, up ]` for a hoop run: `up` the hoop's middle in metres over
  the ground there (both the Worker and the page have the Moon's heights, so the absolute height is
  never stored). `route.orbs` are `[ lat, lon, up ]`, `route.tricks` the indices of trick hoops,
  `route.radius` the hoop's radius, `route.style` the course style.
- **Course styles by place** (the place's name and region): crater, mountain, valley, sea, landing
  site, basin/pole. Each sets the spacing, how sharp and which way the turns go (a crater weaves, a
  mountain spirals one way, a valley runs gently, a sea slaloms, a landing site loops back round,
  a basin is long with dives), and the hoops' heights over the ground. The Worker's ground check
  counts hoops on steep ground, so the try with fewest is kept.
- **Missed hoops:** flying through a later hoop, or across a hoop's plane outside its ring, misses
  it: the clock jumps on `HOOP_MISS` (3 s) at once, and the pass is `[ index, ms, 1 ]`. The last
  hoop is the finish and can't be missed.
- **The cheat check** for a hoop run uses the course mode's top speed (`COURSE_FASTEST`, 250 m/s)
  instead of the ground's. A missed hoop doesn't constrain where the plane was; the next leg is
  measured from the last hoop hit, with all the time since. The ghost check skips missed passes
  and uses the same top speed.

### Course mode (`src/plane.js`)

Only during a hoop run (the challenges code turns it on and off):

- It cruises at 450 km/h on its own and never hovers. **W boosts** (to 900 km/h at most), burning a
  5-bar tank at a bar a second; S brakes, to 220 km/h at least.
- Momentum: diving gains speed, climbing costs it, turning hard bleeds it, all eased back to the
  cruise.
- **Carve:** hold a hard turn to charge yellow, teal, pink (as the car's drift); let go for a burst
  (+15 %, +25 %, +40 % of the cruise). Carving turns tighter and doesn't bleed speed.
- **Trick boost:** tricks paid within 2 s of a hoop add a bar; through a trick hoop, two.
- Orbs refill a bar each and come back after a few seconds.
- A wall slows it to its least rather than stopping it. No bailing out (T) during a run. Never over
  600 m above the ground, and climbing at no more than the course's rate.
- The ride's own speed doesn't matter: every ride flies the same.

### The page (`src/drive-app/challenges.js`, `main.js`)

- Starting a hoop run turns the ride into a plane at the start, held in the air for the countdown,
  and away at the cruise at GO.
- Hoops are drawn as glowing rings standing at their height and facing along the course (trick
  hoops pink, the next one brighter, the finish green); orbs as blue spheres.
- The HUD adds hoop dots (hit, missed, to come), the boost tank and the carve charge; a miss shows
  "+3.0 s". The finish card says how many hoops were missed.
- `canPlane` lets the plane be used in a hoop run's countdown and run (still not in other runs).

## Calls made without asking (the owner can overrule)

- Miss penalty 3 s and keep flying (mockup showed 2 s; 3 s keeps cutting straight to later hoops
  from paying off).
- Carve ring and boost tank kept separate on the HUD.
- W is the boost key in a hoop run (Shift is already "down" for the plane), so touch screens boost
  with GAS.
- The ghost is drawn as it is now (the ride's model, without the plane's wings).
- Day challenges on the Moon (if `CHALLENGE_PERIODS` brings them back) are hoop runs too.

## Left to the builder

Exact tuning numbers (spacing, heights, carve timings) within the shape above; the hoop and orb
look; where on the HUD the new parts go.

## Addendum, 2026-11-27: Mars, Vesta and Ceres

The owner wanted flying on the other free worlds too, each changed up: a different look for the
rings and a different pace. Agreed design:

- Mars, Vesta and Ceres's weekly and monthly challenges become hoop runs as well (`HOOP_WORLDS`);
  the Earth keeps driving.
- Mars: rust-orange rings, slower (380 km/h cruise) but rings close together (300-500 m), sharper
  turns, lower over the ground: the technical one.
- Vesta: violet rings 24 m across, fastest (650 km/h cruise, 1,300 boost), rings 1.2-2 km apart with
  gentle turns and fewer of them: the speed run.
- Ceres: icy white-cyan hexagonal rings that slowly turn, heights anywhere from 5 to 150 m: the
  climbing one.
- Everything else (tank, carve, tricks, orbs, misses) as on the Moon. Each world's times and ghosts
  are checked against its own top speed, and a missed hoop's reach scales with its longest leg.

Calls made: Vesta's hoop counts lowered (8/12/16) so a run stays about a minute and a half at its
cruise; the course-style words extended for Mars's, Vesta's and Ceres's feature names.
