import { Color, MathUtils, Matrix4, PerspectiveCamera, Quaternion, Scene, Timer, Vector3, WebGLRenderer } from 'three';
import { addLights, createGoogleTiles, createPlaceholderGround, recentreTiles } from '../world.js';
import { ModelManager } from '../models.js';
import { Driver } from '../drive.js';
import { isTyping } from '../walk.js';
import { useFastRaycast } from '../raycast.js';
import { enuToLocal, localToEnu, localToLatLon, yawToHeading } from '../geo.js';
import { createDriveHud } from '../drive-hud.js';
import { GlobeView } from './globe.js';
import { Ground } from './spawn.js';
import { createTestGlobe, placeBody, placeEarth } from './test-globe.js';
import { levelFrame, levelled } from './level.js';
import { createBody, LOOKS } from './body.js';
import { EARTH, FALLBACK, MOON, OFF_EARTH, isWorld, listOf, onWorld, TheWorld, WORLD_IDS, WORLDS } from './worlds.js';
import { SPOTS_ON } from './world-places.js';
import { loadVehicle, loadVehicles, lookOf, specOf } from './vehicles.js';
import { setUpPanel } from './panel.js';
import { setUpGarage } from './garage.js';
import { createBoostPads, EARTH_RULES, MOON_RULES } from './pads.js';
import { createScreenFx } from './screen-fx.js';
import { createWater } from './water.js';
import { createSea, lakeShore, lakesNear, seaLevel, seaLevelNow, waterAt, waterAtNow } from './sea.js';
import { setUpLeaderboard } from './leaderboard.js';
import { buyArea, onPassOpen } from './pass.js';
import { fillAccountArea, fillBuyArea, linkPlayer, onLinked, setUpSupporter } from './supporter.js';
import { isPro, onProChange } from './pro.js';
import { applyLook } from './paint.js';
import { liftGlow } from './underglow.js';
import { createProgress, onLevelChange } from './progress.js';
import { ACHIEVEMENTS, ridesOf } from './achievement-rules.js';
import { onFeatsChange } from './feats.js';
import { setUpProfile } from './profile.js';
import { formatLatLon, LINK_PARAMS, linkedPlace, rememberPlace, SPOTS, worldOf } from './places.js';
import { createLive, flagsOf, velocityOf, worldsOf } from './live.js';
import { createStats } from './stats.js';
import { METRICS, dropinBucket } from './stats-protocol.js';
import { createGhosts, ghostModels } from './ghosts.js';
import { BUDGET_TOAST, budgetToast, setUpFriends } from './friends.js';
import { createOnline } from './online.js';
import { cleanPartyCode, FLAGS } from './live-protocol.js';
import { send } from './api.js';
import * as screens from './screens.js';

// World Drive (worlddrive.app, docs/world-drive.md): pick anywhere on Earth from a globe of
// Google's photorealistic 3D tiles, drop in and drive it. One page load is one Google Maps session
// (the root tileset is loaded once), so flying off somewhere else never reloads the tiles: the
// scene is recentred on each new place instead (recentre below). boot.js, the page's first script,
// runs the robot check while this loads, then asks for the visit and calls start.
//
// Modes: 'globe' (the globe and its panel), 'dropping' (flying down and waiting for the ground),
// 'driving' and 'paused'. M goes back to the globe from any of the others.
//
// Worlds (worlds.js): the Earth (Google's tiles), and the worlds made in the page from NASA's maps,
// the Moon, Mars, Vesta and Ceres (body.js), picked in the orrery (orrery.js, its own chunk: the
// panel's Worlds button, M on the globe), which shows the Sun, the planets and the belt and how many
// are driving on each world now. On another world the globe is its own, what's driven on is its
// ground, gravity is its own and there's no water. Driving with others is on every world
// (LIVE_WORLDS), each in its own rooms and frame (live.js), and a friend on another world is a Go to
// or a Join away (goBeside turns the globe there first). On a small world
// (Vesta, Ceres: WORLDS' `recentre`), whose ground curves away a few metres in a kilometre, the
// scene's frame is moved to the car as it drives (follow), so the flat frame it drives in is always
// level where it is.

// The worlds with driving with others (live-protocol.js's rooms and frames): all five. One taken out
// again is driven alone (nothing sent to the rooms: away, as on the globe), and its live UI hidden
// (body[data-live='off'], liveHere).
const LIVE_WORLDS = WORLD_IDS;

const SKY = new Color( 0x9fcbee );
const SPACE = new Color( 0x070c16 );
// Field of view on the globe, and driving; supersonic (drive.js), the view widens by this much more,
// and a jolt (the booster lighting, the sonic boom) punches it wider still for a moment.
const GLOBE_FOV = 50;
const DRIVE_FOV = 70;
const SUPERSONIC_FOV = 9;
// The sky fades from blue to space between these heights (m); above, the page's stars show.
const SKY_BELOW = [ 15000, 120000 ];
// How long (s) the drop-in waits for the ground at most: while flying down to look round, then
// again once low behind where the vehicle will be.
const GROUND_WAIT = [ 25, 15 ];
// The tiles must have stopped loading this long (s) for the ground to count as there.
const SETTLE = 0.6;
// Where the ground is looked for (m above the ellipsoid): below the deepest sea floor (the
// Challenger Deep, 10.9 km down) to above Everest. Ground under the pin lower than LOWEST is deeper
// than any land or lake bed (Baikal's is 1.2 km under the ellipsoid), so it's only ever the sea's.
const GROUND_RANGE = [ - 11500, 9500 ];
const LOWEST = - 1500;
// Out past what Google photographs of a coast, its tiles are the sea bed with the sea's picture on
// it, and the same for some deep lakes far from their shores (Lake Baikal's): there the drive
// starts on the water's surface instead (sea.js). That's where the ground under the pin is more
// than BED m under the sea's height and the pin is on the sea or a coast (sea.js's map of them,
// never a lake nor land: not the Dead Sea's shore, 430 m under the sea), or more than BED m under
// the surface of the big lake (lakes.js) it's on, with nothing within RIM m of it more than BED m
// over the water's surface (below); or it's lower than LOWEST anywhere. BED is twice as deep as the
// lowest land along most coasts (the Netherlands' polders, 7 m under the sea), with room for the
// sea's height as sea.js has it (up to 9.5 m low by volcanic islands, 3.9 m high at worst) and for
// Google's own water by a coast with the tide out: those drop in as before, on Google's ground and
// water. The sea is never more than HIGHEST_SEA m over the ellipsoid, so ground higher than that
// less BED, and not by a big lake, needn't ask how high the sea is nor where it is.
const BED = 15;
const HIGHEST_SEA = 86;
// A coast's square on the map takes in land up to 4.6 km from the sea, and land that close can be
// further under the sea than BED: the side of the Assal depression in Djibouti, in the square the
// Ghoubbet's shore crosses, is 28 m under it; so can a dry dock, a pit or a cutting be. Each is
// walled off from the water by ground over the water's height, or the water would be in it (the
// Assal depression's rim is 16 to 40 m over the sea within 150 m of each spot of it in that square),
// and the bed of open water has no such wall. So ground with anything more than BED m over the
// water's surface within RIM m of it (rays down at each of these distances on BEARINGS bearings
// round it) is land, not the bed. (A wide pit by the sea, its middle more than RIM m from its rim,
// still isn't told from the bed.)
const RIM = [ 50, 100, 150 ];
const BEARINGS = 16;
// Driven (or flown) out from a coast. Google draws water at the sea's height only close to a coast:
// past that its tiles are the bed, with the sea's picture on it, sloping down under the sea's
// height (in Santa Monica Bay 7.6 m under it 500 m off the pier and 129 m under it about 9 km off,
// about 1.4 m down in every 100 m between), and so out from a big lake's shore. So while driving on
// the Earth with none of sea.js's water laid, every SEA_EVERY s the ground is looked at under the
// vehicle and ahead of it along its way (as far as it goes in each of SEA_AHEAD's seconds, and at
// least that many metres). Where that's more than SEA_MARGIN m under the sea's height, on the sea or
// a coast on sea.js's map (or more than BED m under a big lake's, as for a drop-in, since Google
// draws some lakes' surfaces several metres from lakes.js's heights; in a square all of which is the
// lake, its shores being land, as below Niagara Falls), with the vehicle no lower than SEA_MARGIN
// under the water's height itself (not in a hollow or a polder under it, where the water would be
// over it, as sea.js's ABOVE has it), and isn't coloured as only dry land is (water.js's land: the
// Assal depression's desert, a polder's fields), and is open to the water round it (OPEN, below),
// the water's surface is laid there (sea.start, as for a drop-in), and the vehicle rolls or comes
// down onto it. Looking 60 m ahead, on a bed sloping down from the water's height 1 in 40 or more
// it's there before the vehicle is under that height; on a gentler one, as off Santa Monica, the
// vehicle can be up to SEA_MARGIN under it first, and is lifted onto it. Google's own water by a
// coast is within a metre or so of the sea's height as sea.js has it (1.0 m under it by Santa
// Monica Pier): within SEA_MARGIN it's driven on as it is. Anywhere, as for a drop-in, ground lower
// than LOWEST is the sea's, and without the map that's all. The sea's height and the map are asked
// for (once a drop-in) only once the ground looked at is lower than any water can be there
// (HIGHEST_SEA, or a big lake whose box it's in) less SEA_MARGIN.
const SEA_EVERY = 0.25;
const SEA_AHEAD = [ [ 1, 15 ], [ 3, 60 ] ];
const SEA_MARGIN = 1.5;
// Open to the water. Ground more than SEA_MARGIN under the sea in a coast's square isn't always its
// bed: a city or a polder under the sea behind its levee or dyke is too (New Orleans' streets, 2 m
// under it behind the levee on Lake Pontchartrain, which is the sea on the map, its lakefront in
// coast squares), in the grey of its streets and roofs, which water.js can't tell from the sea's
// picture. What tells them apart is that the bed of open water is open to it: on the seaward side
// the bed (or Google's water) goes on under the water's surface all the way round a wide arc, while
// ground under the sea in a city or a polder is closed in on most sides by levees, quays, houses,
// roofs and trees standing over the water's height, and a polder's fields and a park's lawns are
// coloured as land. So the water's surface is only laid over ground with OPEN bearings or more one
// after another (of BEARINGS round it: OPEN spans a quarter of the way round) on which nothing at
// any of OPEN_AT's distances (m) stands more than RISE m over the water's surface, nor is coloured
// as only dry land is, nor is missing (rays down from far over it, as for walled; a picture that
// can't be read is taken for land). On a straight coast the beach, a promenade and the houses
// behind it close at most the seven bearings on the land's side, and nine are open; beside a pier
// as well, five or more. Among houses any of a bearing's rays that hits a roof or a tree closes it:
// on the test pad's streets (scripts/test-drive-ui.mjs) no more than two side by side were open,
// down a street, where with only RIM's three rays each five were at some spots. Laid out more
// sparsely (lots 25 to 37 m long, a boulevard 49 or 64 m across, a fifth of the lots empty), a
// quarter of the way round can thread between the houses past every ray down, and over such towns'
// streets, grey all over, it's laid among the houses at some spots (docs/world-drive.md). The rays
// along the bearings and between them that close those beside another driver (see SKIM and FAN)
// aren't cast here: driving out from a harbour they'd close the way out too, past boats moored
// either side of it or between two jetties standing 2 m or more over the water within CLOSE m, and
// the vehicle would drive on down the bed; and each is the first into every tile it passes through.
// (Ground under the sea open and not coloured as land 150 m round on a quarter of the way, a wide
// car park behind a levee, still isn't told from the bed.) It's looked at only for ground that's
// passed everything else, for one spot at a time, and only as far as it needs: a bearing that isn't
// clear rules out every run of OPEN through it. And it's spread over frames. A tile's first ray
// builds its bounding volume hierarchy (src/raycast.js: on a mesh the size of a tile, in Chromium
// here, 3 ms for 10,000 triangles and 29 ms for 80,000), and these rays reach out 150 m round a
// spot up to 60 m ahead, to tiles no other ray has reached (those 3d-tiles-renderer keeps for rays
// out of view too, the siblings of those in it): all 96 in one frame could have held it up for
// seconds just as the vehicle came to the sea. So no frame casts more than OPEN_RAYS of them, nor
// any more once they've taken OPEN_MS (ms) in it: a quarter of a frame at 60 a second, or the one
// ray that took longer, as driving onto a new tile does anyway. Where tiles' bounds don't reach
// past each other, as the test pad's squares' don't, a ray down is the first into one tile at
// most, so no frame builds more than one tile's hierarchy, however small the tiles; one falling on
// two tiles' edge can be the first into both, and on Google's tiles, whose boxes are in each mesh's
// own frame, one near an edge may be the first into more (not tried). The rays under the vehicle
// and ahead that find the spot (bedAt's, outside the share) may build up to two more as a look
// begins, as they always have (docs/world-drive.md). What's known of the spot's bearings is kept
// (seaWatch's spot) and the look round it carried on each frame after till it's known, whatever
// spots the looks in the meantime would find ahead, and the surface is laid as soon as it's known
// to be open. (Begun afresh round each newer spot instead, 7 m on at each look at 100 km/h, its
// rays reached tiles new to them out at its edge every time, and at 20 frames a second it was
// often never done.)
const OPEN = 5;
const OPEN_AT = [ 25, 50, 75, 100, 125, 150 ];
const RISE = 1;
const OPEN_RAYS = 12;
const OPEN_MS = 4;
// Beside another driver out on the water's surface where Google draws the bed (laid by their
// watchSea), or in the air over it (a hop, a trick, flying), Go to or Join puts you on that surface
// with them, not on the bed under them: where they're no more than ALONGSIDE m under the water's
// surface there (the sea's, on the sea or a coast, or a big lake's, in a square all of which is the
// lake), however high over it, as watchSea lays it for a vehicle at any height over it, and the
// ground under them is the bed as watchSea has it (more than SEA_MARGIN, or a lake's BED, under that
// surface, not coloured as dry land and open to the water round it, here with the rays along each
// bearing and between them too, which watchSea's look hasn't: see OPEN, SKIM and FAN), it's laid
// there, and you're put on it beside them.
const ALONGSIDE = 1;
// Those checks are for laying a surface afresh. With yours laid already, beside someone flying over
// that water you're put on it under them, as you'd drive on it there: it covers whatever of that
// water's ground is under it, a big lake's shelf less than BED under it, a bed coloured as sand, or
// one closed in farther off, in an inlet or between a harbour's moles. Yours laid is in this scene;
// or, for a drop-in beside them (goBeside's `laid`), over the same big lake when you left, or over
// the sea within reach of yours as it's laid now (sea.js's reaches: not a sea laid on another
// coast, which says nothing of a field under the sea's height on this one). That water is, on the
// map, a square of the sea or a coast for the sea's; for a big lake's, one of its squares or one
// its shore crosses (sea.js's lakeShore), where most of a lake's shelf is, and where yours is kept
// as you drive there too (sea.js's REACH). Only not where the ground under them is built up, as a
// city's streets under the water behind a levee are: closed in close by on every quarter of the way
// round, with no OPEN bearings one after another on which nothing at OPEN_AT's distances up to
// CLOSE m stands more than RISE m over the surface (or is missing), nor anything along them or
// between them within CLOSE m SKIM m over it (see FAN). By heights alone, as a sandy bed's colour
// is a polder's fields' too. Houses either side of a street close all but the bearings along it
// that near; a channel's banks, 130 m or more apart, don't, out over its water (narrower, they
// close some of it: docs/world-drive.md). Beside another driver the look for laying it afresh
// (above) has the same rays along and between bearings, and its rays down go as far and farther, so
// where it lays a surface there the ground isn't built up either.
const CLOSE = 75;
// The rays down see three points of a bearing, and a bearing can thread between houses past all
// three: down a crossing street, through a gap between two houses or over the yards behind them,
// and on into the next street. Among the test pad's houses (scripts/test-drive-ui.mjs) that left a
// quarter of the way round open at 60 of the 3,546 spots under the sea inside its town, every 5 m;
// laid out a little differently (the houses' fronts 20 m apart across a street, not 16; 6 m between
// houses; yards 20 m deep; blocks 50 m across), at 18 to 31 % of the spots looked at along its
// streets and yards; and a fourth ray down, at 100 m, still left 170 to 576 of those open. So
// beside another driver (the look for laying a surface afresh there, and built up: see CLOSE), a
// ray along each bearing too, out to CLOSE: anything it meets SKIM m over the water's surface
// closes the bearing, and that closes all of them, in each of those towns. How high: over what open
// water has standing on it, and under houses' roofs. Google's own water stands within a metre or so
// of the sea's height as it's worked out here by most coasts (see SEA_MARGIN), and up to several
// metres over it by some (see BED: up to 9.5 m by volcanic islands); where it stands more than
// RISE m over it the rays down already close the bearings toward it, so the ray only needs to clear
// water drawn up to a metre over it, which isn't quite flat: over water drawn 1 m up with bumps of
// a quarter of a metre, a ray 1 m up met it on all 16 bearings, one 1.5 m up or more on none. Boats
// moored in a row 25 m off standing up to 2 m over the water, or a jetty's deck 15 m off less than
// 2 m over it, aren't met; boats standing 2.2 m or more over it moored either side of a fairway
// 50 m wide, or two jetties 2.5 m over it 80 m apart, close it in, as a street's houses do (so
// watchSea's look, driving out, has no rays along: see OPEN). A beach rising 1 in 10 from the water
// 40 m off closes three bearings toward it (as the rays down do), and a bridge's deck 5 m up isn't
// met, only its piers. The test pad's roofs stand 3.5 m over the water, and with them 2.5 m over it
// every spot is still closed; roofs lower than SKIM over it (lower houses, or a town deeper under
// the water) are told by the rays down alone, as before (with them 1.5 m over it, 50 of 3,546 spots
// open, as without this ray). It runs along the water's level there (see skims): the water curves
// away from the scene's middle under its flat frame, 1 in 640 at 10 km off, so a ray level in the
// frame comes 12 cm nearer it in 75 m toward the middle (over water drawn 1 m up, 10 km off, one
// 1 m up met it on 7 or 8 bearings); the Earth's own curve in 75 m is under half a millimetre.
const SKIM = 2;
// A run of OPEN clear bearings is OPEN lines 22.5° apart, and they can thread between houses
// standing farther apart than the test pad's: from where a street meets a crossing or a boulevard
// 45 m or more across, down the street, across the crossing and along the yards behind back-to-back
// rows, with houses between them. In the test pad's town with a boulevard across it, the houses'
// fronts either side 49 m apart, that left a quarter of the way round open by its edges at 42 of
// 5,272 spots (with them 64 m apart, 942 of 5,648), and in suburbs with a crossing 46 to 56 m
// across every 6th to 11th lot at 61 to 79 of 6,650 to 7,122. Over open water the whole quarter is
// clear, not five lines of it. So a run is only open where FAN more rays along between each two of
// its bearings, as along one (SKIM m up, out to CLOSE), meet nothing either: 5.6° apart, 7.4 m
// apart at CLOSE. That closed every spot in those towns, though not where a run threads farther:
// along a diagonal boulevard 40 to 50 m wide, where two boulevards cross, or by a lot left empty
// either side of a street at a boulevard or a crossing (docs/world-drive.md). Between two clear
// bearings over open water, a channel or an inlet, the rays between are clear too, so there it's as
// before. Each gap's rays are cast once a look, as its run comes to it: at most 48 more rays, and
// 12 where it's open.
const FAN = 3;
// And with none of it laid where you are, beside someone riding on that water's surface (their
// wheels on it: live.js's FLAGS.grounded, or where they dropped in) at its height, to within
// AT_SURFACE m, with the ground under their car and under the spot beside them more than SEA_MARGIN
// under it, it's laid for you there, as you'd see them on it, where the look for laying it afresh
// wouldn't (a big lake's shelf, a bed coloured as sand, an inlet): with Google's ground that far
// under them, what they're riding on can only be a surface of their own. Someone on ground at about
// the water's height (a levee, a quay, a beach, a bridge's deck) has that ground under their car,
// and someone in the air isn't riding. Only on that water's squares of the map, as above, and not
// where the ground round them is built up (see CLOSE): not a polder's streets someone rides over on
// a surface of theirs laid within its reach. AT_SURFACE takes in what their height can be off the
// surface's as it's worked out here, from the same table and the same lakes: a state's centimetre
// (a dropped-in place's 5 cm), their body leaning on its springs (its pivot a few centimetres over
// its wheels as most rides corner or brake, up to about half a metre for the bus braking flat out),
// and their scene's frame curving away as a sphere where the Earth is an ellipsoid, as sea.js lays
// the surface (within 10 km of where they dropped in, 5 cm at most; 0.2 m at 20 km; more than
// AT_SURFACE only past 34 km, by the equator, or 45 km at mid-latitudes, where they're missed). It's
// well under SEA_MARGIN, so they're a metre or more clear of the ground under them.
const AT_SURFACE = 0.5;
// How far down (m) the ground is looked for there: from just over the vehicle to past the deepest
// sea floor, so that flying high over the deep sea it finds the bed.
const SEA_DEPTH = 12000;
// On the test pad (no Google tiles), its sea, 2 m under its land, is at the water's height as it's
// driven on: Google's water by a coast, as the tests have it. (A drop-in instead takes the pad for
// ground at the water's surface wherever it's put: waterOver.)
const PAD_SEA = 2;
const EARTH_RADIUS = 6371000;
// Room (px) the pin's card takes over the panel when the panel is a sheet along the bottom.
const PIN_CARD = 84;
// What a place's name may hold on the leaderboard (as worker/drive/names.js takes it), and how long.
const PLACE_TEXT = /[^\p{L}\p{M}\p{N} .,'’\-#&/()°]+/gu;
const PLACE_LENGTH = 60;
// Driving with others: "Go to" someone this near (m) drives you to them in this scene; farther
// off, it's a drop-in where they are. Either way you start this far (m) to their side.
const GO_NEAR = 10000;
const GO_BESIDE = 5;
// The other worlds (worlds.js, body.js's LOOKS): each one's gravity as a share of the Earth's (the
// Moon's 1.62 m/s², Mars's 3.71), where its globe first shows it, the heights its ground can be at
// (m over its sphere, made-up craters in), and its sun while driving, fixed in the scene, low enough
// that every crater rim and rock has its light and shade (the Moon's from the south-west, 20° up).
// On a small world whose scene's frame follows the car (follow), that's fixed to the frame: as high
// over the ground wherever it's driven, and never jumping as the frame moves, while the stars turn
// with the world. On its globe the sun is over the viewer's left shoulder instead, so the side in
// view is lit. The sunlight and the light from its sky on the vehicles are its look's.
const SUNS = Object.fromEntries( OFF_EARTH.map( id => [ id, enuToLocal( ...LOOKS[ id ].sun ).normalize() ] ) );
// The longest air (s) a run may post: the Worker's limit (worker/drive/scores.js, MAX_AIR), which
// the Moon's slow jumps could pass.
const MAX_AIR = 120;
// Only the dev server: a test (scripts/test-drive-live-ui.mjs) can hand the page a visit's token,
// { visit }, for driving with others on the test pad, which has no visit of its own, and make who's
// driving now ask more often and go idle sooner, online: { poll, idle } (ms). Whether it's on is
// still the Worker's to say. import.meta.env.DEV is false in the build, so the built site has no
// such way in.
const LIVE_TEST = import.meta.env.DEV ? window.worldDriveLiveTest ?? null : null;
// Only the dev server too: a test (scripts/test-drive-levels-ui.mjs) can hand the page a visit's
// token, { visit }, for the leaderboard and levels on the test pad, as if it were a visit on
// Google's map.
const VISIT_TEST = import.meta.env.DEV ? window.worldDriveVisitTest ?? null : null;
// And a visit's token for the play stats alone, { visit } (scripts/test-drive-ui.mjs, which answers
// their posts itself), so what the page counts can be seen on the test pad.
const STATS_TEST = import.meta.env.DEV ? window.worldDriveStatsTest ?? null : null;
// The challenges' word to a visit that's driving (challengeNudge): after this many seconds of a
// visit's driving (a minute is when most visits end), today's challenge on that world, with a button
// to the challenges. On the dev server only when a test asks for it, { after } (s), as
// scripts/test-drive-ui.mjs does: the other tests drive longer than that, and look at what the toast
// says.
const NUDGE_AFTER = import.meta.env.DEV ? window.worldDriveNudgeTest?.after ?? null : 40;
// The orrery opens on its own only with ?worlds=1 in the address, never on a plain load; and on the
// dev server when a test asks for it as the page loads, { onLoad: true }
// (scripts/test-drive-orrery-ui.mjs).
const ORRERY_TEST = import.meta.env.DEV ? window.worldDriveOrreryTest ?? null : null;

const $ = id => document.getElementById( id );
const frame = () => new Promise( resolve => requestAnimationFrame( resolve ) );
// How far (m) the Earth curves away under the scene's flat frame ( east, north ) m from its middle.
const curve = ( east, north ) => ( east * east + north * north ) / ( 2 * EARTH_RADIUS );
// How far over the sea's height the water is where sea.js's waterAt says `at`: a big lake's height
// in a square all of which is the lake, 0 on the sea or a coast, and null on land or without the map.
const riseOf = at => at?.kind === 'lake' ? at.lake.height : at?.kind === 'sea' || at?.kind === 'coast' ? 0 : null;
// Whether sea.js's waterAt says `at` is `lake`'s water (lakes.js's; null for the sea's): a square all
// of which is that lake, or the sea or a coast.
const isWater = ( at, lake ) => riseOf( at ) !== null && ( at.lake ?? null ) === lake;
// Whose water ( lat, lon ) in degrees is beside another driver, where a surface of it is yours or
// they're riding on it (see CLOSE and AT_SURFACE), from the map as it is now: { over, lake } as
// riseOf and waterAt say on the sea, a coast or a big lake's square, or on land a big lake's whose
// shore crosses its square (sea.js's lakeShore); else null.
function waterBy( lat, lon ) {

	const at = waterAtNow( lat, lon );
	const shore = at?.kind === 'land' ? lakeShore( lat, lon ) : null;
	if ( shore ) return { over: shore.height, lake: shore };
	return riseOf( at ) === null ? null : { over: riseOf( at ), lake: at.lake ?? null };

}
const _p = new Vector3();
const _inverse = new Matrix4();
const _q = new Quaternion();
const _side = new Vector3();
const _ahead = new Vector3();
const _velocity = new Vector3();
const _skim = new Vector3();
const _skimFrom = new Vector3();
const _focus = new Vector3();
const _sun = new Vector3();
const _before = new Matrix4();

// key: the Maps key (none: the test globe and pad); left: free drives left today; visit: the
// visit's token, for posting scores; worker: whether there's a Worker (not on the dev server alone);
// googleClientId: the sign-in button's, for the Supporter Pass ('' when there's no signing in with
// Google); passwords: whether there are usernames and passwords, turnstileSiteKey their robot
// checks' (supporter.js, account.js);
// live: whether the Worker has driving with others on (its /api/config says), and liveReason why
// not when it's off for the rest of the day; liveMoon: whether it's on on the Moon (its rooms have a
// budget of their own: null when the Worker doesn't say), and liveMoonReason why not the same way
// (none when it's switched off there); liveWorlds: every world's at once, { earth, moon, mars,
// vesta, ceres: { open, reason } } (null from a Worker from before: the Earth's and the Moon's are
// then the keys before, and the rest are off: live.js's worldsOf); earthClosed: { onEarth, world }
// when there's no Earth this visit (today's Earth drives are used up, or the page opened on a link
// to another world: `world`, its id, boot.js): the globe opens on that world (a place's link flies
// there itself), or else the Moon (FALLBACK), which are never limited, and picking the Earth calls
// onEarth instead;
// challengeLink: a "challenge a friend" link's ({ link: { challenge, vs }, answer }, boot.js), or a
// promise of it (or of null: no link), opened once the globe is up and it's here (challenges.js);
// adsense: /api/config's { client, slot } while Google's ads are on (ads.js), else null.
export async function start( { key, left = null, visit: token = null, worker = true, googleClientId = '', passwords = false, turnstileSiteKey = '', live: liveOn = false, liveReason = '', liveMoon = null, liveMoonReason = '', liveWorlds = null, earthClosed = null, challengeLink = null, adsense = null } ) {

	const visit = token ?? VISIT_TEST?.visit ?? null;
	// Play stats for the owner's admin page (stats.js): only a real visit's, counts with nothing of who.
	const stats = createStats( { visit: token ?? STATS_TEST?.visit ?? null } );
	const vehicles = await loadVehicles();
	screens.hideSplash();

	const renderer = new WebGLRenderer( { antialias: true, alpha: true, logarithmicDepthBuffer: true } );
	renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
	renderer.setSize( window.innerWidth, window.innerHeight );
	$( 'app' ).appendChild( renderer.domElement );
	const canvas = renderer.domElement;

	const scene = new Scene();
	const camera = new PerspectiveCamera( GLOBE_FOV, window.innerWidth / window.innerHeight, 1, 1e8 );
	const lights = addLights( scene );
	const earthLight = { sun: lights.sun.position.clone(), intensity: lights.sun.intensity, sky: lights.hemisphere.intensity, colours: [ lights.hemisphere.color.clone(), lights.hemisphere.groundColor.clone() ] };
	// Space shows the page's starry background through the canvas; near the ground, the sky.
	scene.background = null;

	// The globe opens facing your part of the world, going by your clock.
	const home = { lat: 25, lon: MathUtils.clamp( - new Date().getTimezoneOffset() / 4, - 170, 170 ) };
	let tiles = null;
	let earth;
	let ellipsoid;
	let testEarth = null;
	let pad = null;
	if ( key ) {

		tiles = createGoogleTiles( { apiKey: key, camera, renderer, site: home, autoRefreshToken: false, onError: tileError } );
		scene.add( tiles.group );
		earth = tiles.group;
		ellipsoid = tiles.ellipsoid;

	} else {

		( { group: earth, mesh: testEarth, ellipsoid } = createTestGlobe() );
		placeEarth( earth, ellipsoid, home );
		useFastRaycast( earth );
		scene.add( earth );
		// The test pad to drive on: flat ground at whatever place you drop in.
		pad = createPlaceholderGround();
		pad.visible = false;
		scene.add( pad );
		// Only on the other worlds this visit: the test globe stays out of sight.
		if ( earthClosed ) earth.visible = false;
		// On worlddrive.app there's always a Worker, so none answering means its settings didn't
		// come (or a crawler kept off /api/ by robots.txt): a word for a visitor, not the developer's.
		else screens.toast( ! worker && location.hostname === 'worlddrive.app'
			? 'Couldn\'t reach World Drive\'s server, so this is only a preview globe. Reload the page to drive on the 3D map.'
			: 'No Google 3D tiles here: a test globe, and a flat test pad wherever you drop in.', 6000 );

	}

	// What's driven on: Google's tiles (or the test pad), and out at sea the sea's own surface.
	const sea = createSea( { scene } );
	// Out from a coast (watchSea): when the ground's next looked at, and whether the sea's height and
	// the map have been asked for since the drop-in, and have come (or failed to); and the spot it's
	// looking round to see that it's open to the water (see OPEN_RAYS), or null.
	const seaWatch = { in: 0, asked: false, ready: false, spot: null };
	// And the other worlds (body.js), each shown when it's picked: its ground, what hangs in its sky
	// and its own sky (Mars's). Nothing of their files is fetched until then. Which world it is:
	// worlds.js's id, 'earth', 'moon', 'mars', 'vesta' or 'ceres'.
	const bodies = Object.fromEntries( OFF_EARTH.map( id => [ id, createBody( id ) ] ) );
	for ( const body of Object.values( bodies ) ) {

		body.group.visible = false;
		scene.add( body.group, ...[ body.inSky, body.sky ].filter( Boolean ) );

	}

	const moon = bodies[ MOON ];
	let world = EARTH;
	const offEarth = () => world !== EARTH;
	// Whether driving with others is on the world being shown (LIVE_WORLDS: every world now); on one
	// without, you'd drive on your own, away as far as the room knows, and its live UI is hidden
	// (body[data-live], style.css). Set again on every turn to another world (setWorld).
	const liveHere = () => LIVE_WORLDS.includes( world );
	const markLive = () => {

		document.body.dataset.live = liveHere() ? 'on' : 'off';

	};
	markLive();
	// Whether the visitor asks for less motion (the orrery stands still, a world's globe comes in
	// without its fly-in), as it is now.
	const lessMotion = window.matchMedia?.( '(prefers-reduced-motion: reduce)' ) ?? null;
	const reducedMotion = () => !! lessMotion?.matches;
	// The world being driven's ground (body.js), or null on the Earth.
	const body = () => bodies[ world ] ?? null;
	// Where the globe was looking on each world when it last left it, and a turn to another world
	// waiting for it to load (setWorld).
	const lastLook = {};
	let switching = null;
	// What's driven on: the world's own ground, or Google's tiles (or the test pad) and the sea's
	// surface where it's round the vehicle, unless that's left out for a moment (`bare`: underSea).
	let bare = false;
	const grounds = () => offEarth() ? [ body().terrain ] : sea.shown && ! bare ? [ tiles ? tiles.group : pad, sea.mesh ] : [ tiles ? tiles.group : pad ];
	const globe = new GlobeView( { camera, canvas, earth, surface: earth, ellipsoid, pin: $( 'pin' ) } );
	scene.add( globe.air );
	// The globe as each world has it (GlobeView.setBody): the Earth's, and each other world's, its
	// size, its air (the Moon none, Mars a thin dusty glow), the heights its ground can be at, its
	// heights worked out and, for a small world far from round, its level (level.js).
	const earthBody = { earth, surface: earth, ellipsoid };
	const globeBodies = Object.fromEntries( OFF_EARTH.map( id => {

		const { group, terrain, ellipsoid: shape, radius } = bodies[ id ];
		const { lowest, highest } = WORLDS[ id ];
		return [ id, { earth: group, surface: terrain, ellipsoid: shape, radius, air: LOOKS[ id ].air ?? false, lowest, highest, heightAt: ( lat, lon ) => bodies[ id ].heightAt( lat, lon ), level: levelled( id ) ? id : null } ];

	} ) );
	globe.place( globe.orbit( home.lat, home.lon ) );
	globe.capture();
	// Until Google's root tileset arrives the tiles sit in the Earth's own frame; then
	// ReorientationPlugin moves them, and the camera has to move with them.
	tiles?.addEventListener( 'load-root-tileset', () => globe.restore() );

	const models = new ModelManager( { getGround: grounds, renderer } );
	scene.add( models.group );
	const ground = new Ground( grounds );
	const hud = createDriveHud( $( 'hud' ) );
	// Google's mesh doesn't say what's water: water.js tells it from the ground by how it looks.
	const water = createWater( ground );
	// drive.js hands the view back to the construction app's walk controller when you get out.
	// World Drive has no walking: this stands in for it.
	const walker = { keys: new Set(), enabled: false, yaw: 0, pitch: 0, setPose() {}, setMode() {} };
	const driver = new Driver( {
		camera, models, controls: walker, getColliders: grounds, hud, onStop: stopped,
		// Each landed jump, for the leaderboard: where, and in what; and for levels.
		onScore: run => {

			board.onScore( { ...run, airTime: Math.min( run.airTime, MAX_AIR ), place: placeLabel( state.place ), vehicle: state.vehicle?.id } );
			progress.landed( run, state.entry );
			landed( run );

		},
		// What World Drive drives with: F flies, Shift (or B) boosts, the kart drifts, hitting something
		// throws you into the air for stunts, and the hovercraft throws up spray on water (which every
		// ride drives on as on the ground). Its effects (bursts, fewer on a phone and calmer for those
		// asking for less motion) as screen-fx.js sets them.
		fly: true, booster: true, drift: true, crash: 'launch', water, effects: { detail: 1, calm: false },
	} );
	// Speed lines, overdrive's white edges and the camera's jolts and shakes, with their switch in
	// the pause menu (screen-fx.js).
	const screenFx = createScreenFx( { scene, driver, toggle: $( 'pause' ).querySelector( '.camera-toggle' ), touch: () => document.body.classList.contains( 'touch' ) } );

	const state = { mode: 'globe', place: null, entry: null, vehicle: null, drop: null, leaving: false };
	// Where the scene's frame is now ({ lat, lon, height }: degrees, and m over the world's ellipsoid
	// or sphere), which on a small world moves with the car (follow), as `state.place` (where you
	// dropped in, the leaderboard's place and the challenges') doesn't; and how many times it has
	// moved with it (for the tests).
	let origin = null;
	let recentres = 0;
	// Boost pads on the ground as you drive (pads.js), never on water, with their switch in the
	// pause menu.
	const pads = createBoostPads( { scene, driver, ground, water, toggle: $( 'pause' ).querySelector( '.pads-toggle' ), onPad: () => progress.pad() } );

	const panel = setUpPanel( {
		root: $( 'globe-ui' ),
		vehicles,
		flyTo: place => flyToPlace( place ),
		onDrive: place => dropIn( place ),
		onClearPin: () => pinAt( null ),
		// Its Worlds button: the orrery, to pick a world from.
		onWorlds: opener => openOrrery( opener ),
		// (Its kind only, for the play stats: never what was typed.)
		onSearch: kind => stats.add( 'search', kind ),
		onAchievements: () => openAchievements(),
	} );
	panel.vehiclePicker( $( 'pause' ).querySelector( '.vehicles' ), vehicle => swapVehicle( vehicle ) );
	globe.onPick = place => {

		stayPut();
		pinAt( { ...place, name: 'Dropped pin', region: '', ...offEarth() ? { world } : {} } );
		stats.once( 'funnel', 'pin' );

	};
	// The Garage and the Supporter Pass, by both ride pickers (garage.js, pass.js).
	const garage = setUpGarage( {
		vehicles, panel, models, current: () => state.entry && { entry: state.entry, vehicle: state.vehicle },
		onLook: () => live?.setRide( state.vehicle.id, lookOf( state.vehicle ) ),
		onOpen: () => stats.add( 'garage_open', 'all' ),
		onEdit: ( part, changed ) => {

			stats.add( 'garage_edit', part );
			// A look changed (not the same choice picked again), for the achievements (progress.js).
			if ( changed ) progress.look();

		},
		// Its ▶ Boost as driving's: no flare for a visitor asking for less motion, fewer sparks on a phone.
		effects: driver.effects,
	} );

	// The leaderboard, from the trophy on the globe and in the pause menu. "Only here" is the place
	// being driven, or on the globe the one pinned.
	const board = setUpLeaderboard( {
		dialog: $( 'leaderboard' ),
		card: $( 'best-card' ),
		vehicles,
		worker,
		getPlace: () => placeLabel( state.mode === 'globe' ? panel.pinned : state.place ),
		// A new player: linked to the account signed in here, then the XP driven before it claimed
		// (after the link, so a supporter's claim counts with the pass; linkPlayer never throws, and
		// once linked, onLinked below has sent the claim already).
		onPlayer: async () => {

			stats.add( 'board', 'named' );
			await linkPlayer();
			progress.report();

		},
		onName: () => live?.rehello(),
		onOpen: () => stats.add( 'board', 'open' ),
	} );
	board.setVisit( visit );

	// Levels (progress.js, profile.js): XP for what's driven, kept with the leaderboard player (or
	// in this browser until there's one), the bar and pop-ups while driving, a level-up's burst, and
	// the profile card on the globe's panel. A level reached unlocks Garage looks (paint.js asks
	// getLevel). The others in a room see it at the page's next hello there (the room looks it up):
	// saying hello again for each level would have the room see the driver leave and join.
	let profile = null;
	const progress = createProgress( {
		worker,
		visit: () => visit,
		player: () => board.player,
		onChange: () => profile?.render(),
		onPop: event => profile?.pop( event ),
		onLevelUp: event => {

			stats.add( 'level_up', 'all' );
			profile?.levelUp( event );

		},
		onAchievement: event => notifyAchievements( event ),
	} );
	profile = setUpProfile( {
		progress,
		player: () => board.player,
		canName: () => worker && !! visit,
		mode: () => state.mode,
		// A look to try on the ride being driven, or a ride (levels.js's ride rewards) to see.
		onGarage: reward => {

			pauseDrive();
			garage.open( ( reward?.kind === 'ride' && vehicles.find( v => v.id === reward.id ) ) || state.vehicle || panel.vehicle );

		},
		onNickname: () => {

			pauseDrive();
			board.open();

		},
		onTitle: () => live?.rehello(),
		onAchievements: () => openAchievements(),
	} );
	// The look on the ride being driven, with what's unlocked now (a level can lock nothing, but a
	// look chosen on a test page waits for its level).
	onLevelChange( () => {

		if ( ! state.entry ) return;
		applyLook( state.entry.pivot, lookOf( state.vehicle ), state.vehicle );
		live?.setRide( state.vehicle.id, lookOf( state.vehicle ) );

	} );
	// A construction ride just unlocked: the room hears it at a fresh hello (it looks the player's
	// achievements up then, and shows a ride they don't have as the default one), as for a new title.
	onFeatsChange( ( _, added ) => {

		if ( added.some( id => ridesOf( id ).length ) ) live?.rehello();

	} );
	// Achievements (achievement-rules.js; the grid is achievements.js, its own chunk, loaded the first
	// time it's opened): a toast as one is earned ("Achievement: 100 km driven"), and for one that
	// unlocks a construction ride, "Unlocked: Vac truck" with the Garage a tap away, as a level-up's
	// ride is. Never over a challenge's countdown or run: they wait for its end, one after another.
	const notices = [];
	let noticeUntil = 0;
	function notifyAchievements( { ids, local } ) {

		for ( const id of ids ) {

			const feat = ACHIEVEMENTS.find( a => a.id === id );
			if ( ! feat ) continue;
			notices.push( { text: `Achievement: ${ feat.name }${ local ? ' · pick a nickname to keep it' : '' }`, ms: 4500, action: local && worker && visit ? { label: 'Pick one', onClick: () => {

				pauseDrive();
				board.open();

			} } : null } );
			if ( local ) continue;
			for ( const ride of ridesOf( id ) ) {

				const vehicle = vehicles.find( v => v.id === ride );
				if ( vehicle ) notices.push( { text: `Unlocked: ${ vehicle.name }`, ms: 7000, action: { label: 'Garage', onClick: () => {

					pauseDrive();
					garage.open( vehicle );

				} } } );

			}

		}

		showNotices();

	}

	let noticeShown = null;
	function showNotices() {

		const run = challenges?.run;
		const busy = !! run && ( run.phase === 'countdown' || run.phase === 'racing' );
		if ( ! notices.length || performance.now() < noticeUntil ) return;
		if ( busy ) return void setTimeout( showNotices, 1000 );
		// Another toast up (the challenge nudge, a level-up's, a problem): after it, not over it, as the
		// nudge waits for others.
		const toast = $( 'toast' );
		if ( ! toast.hidden && toast.textContent !== noticeShown ) return void setTimeout( showNotices, 1000 );
		// (One with a button stays its whole time, for the tap; the others four seconds before the next.)
		const { text, ms, action } = notices.shift();
		screens.toast( text, ms, action );
		noticeShown = toast.textContent;
		const hold = action ? ms : Math.min( ms, 4000 );
		noticeUntil = performance.now() + hold;
		setTimeout( showNotices, hold + 50 );

	}

	// The grid of achievements (achievements.js): its chunk the first time it's opened.
	let achievementsLoading = null;
	async function openAchievements() {

		achievementsLoading ??= import( './achievements.js' );
		try {

			const module = await achievementsLoading;
			module.openAchievements( {
				progress, vehicles, worker: !! worker, player: () => board.player,
				onRide: vehicle => {

					pauseDrive();
					garage.open( vehicle );

				},
				onNickname: () => {

					pauseDrive();
					board.open();

				},
			} );

		} catch ( err ) {

			achievementsLoading = null;
			screens.toast( `The achievements didn't load (${ err.message }). Try again in a moment.`, 6000 );

		}

	}

	// Linked to an account (whose players' XP counts together), or the pass bought (+50% XP): where
	// the player stands now.
	onLinked( () => progress.refresh() );
	onProChange( () => progress.refresh() );
	for ( const button of document.querySelectorAll( '.board-open' ) ) {

		button.hidden = ! worker;
		button.addEventListener( 'click', () => board.open() );

	}

	// Challenges (challenges.js, its own chunk, loaded the first time they're opened: nothing of them
	// is in the page until then): a daily, a weekly and a monthly one on each world, from the globe's
	// panel and the pause menu. Once loaded, it's told of each drop-in, arrival, pause, resumption and
	// leaving, and its frame runs after the car's.
	let challenges = null;
	let challengesLoading = null;
	// Whether the keys card has been shown this visit: a challenge's drop-in shows it over its
	// countdown instead (a longer one, to read it by), the visit's first time only (a first drive may
	// well start as a challenge), and it's put away at GO, so nothing covers the road while the clock
	// runs.
	let keysShown = false;
	// What ghosts are drawn with (ghosts.js): the others' cars, and a challenge's ghost, sharing the
	// models read from a file.
	const ghostShapes = ghostModels( models.loader );
	// The challenges' chunk, loaded and set up the first time: whether it's here.
	async function loadChallenges() {

		if ( challenges ) return true;
		challengesLoading ??= import( './challenges.js' ).then( module => module.setUpChallenges( {
			visit: () => visit, player: () => board.player, pickName: board.pickName,
			world: () => world, earthClosed, mode: () => state.mode, place: () => state.place, vehicle: () => state.vehicle,
			driver, ground, camera, scene, globe, bodies, vehicles, stats,
			startAt: place => startChallenge( place ), placeCar, toGlobe,
			// On a small world, how far (m) the car goes before the scene's frame follows it (null on
			// the others), and the frame moved to a place as it does (shiftTo: a Retry back at a run's
			// start, before the car's put there); either way, the challenges are told (recentred).
			get recentring() {

				return recentring();

			},
			shiftTo,
			// (Gone by itself after 10 s too, for a run left before its GO.)
			keys: () => ! keysShown && showKeys( 10000 ),
			go: () => screens.hideKeys(),
			// Your car as drawn (a run's ghost is recorded from it), your ride's look (drawn with it), and
			// what a ghost to race is drawn with.
			pivot: () => state.entry?.pivot ?? null, look: () => lookOf( state.vehicle ), ghostModels: ghostShapes,
			driveUi: $( 'drive-ui' ), pauseCard: $( 'pause' ),
			// A time posted: where the player stands (a first finish may be an achievement).
			onPosted: () => progress.refresh(),
		} ) );
		try {

			challenges = await challengesLoading;
			return true;

		} catch ( err ) {

			challengesLoading = null;
			screens.toast( `The challenges didn't load (${ err.message }). Try again in a moment.`, 6000 );
			return false;

		}

	}

	async function openChallenges() {

		if ( ! await loadChallenges() ) return;
		pauseDrive();
		challenges.open();

	}

	// A page opened on a "challenge a friend" link (boot.js's challengeLink, which may still be on its
	// way: a slow answer opens its card when it comes, over whatever's going on, the drive paused as
	// Challenges does): out of the address, back to the home page's (/c is the link's own path, for
	// its preview card), so a reload doesn't open it again; and its card over the list.
	async function openChallengeLink( opening ) {

		const opened = await opening;
		if ( ! opened ) return;
		const { link, answer } = opened;
		const url = new URL( location.href );
		url.pathname = '/';
		for ( const name of [ 'challenge', 'vs' ] ) url.searchParams.delete( name );
		history.replaceState( history.state, '', url );
		if ( ! await loadChallenges() ) return;
		pauseDrive();
		challenges.openLink( answer, { named: !! link.vs } );

	}

	for ( const button of document.querySelectorAll( '.challenges-open' ) ) {

		button.hidden = ! worker;
		button.addEventListener( 'click', openChallenges );

	}

	// A challenge's start, from wherever the page is: back to the globe (a run going is left), on to
	// the challenge's world, and a drop-in at its start (challenges.js knows it by place.challenge).
	async function startChallenge( place ) {

		if ( state.mode !== 'globe' ) toGlobe();
		await dropIn( place );

	}

	// The keys card, on a keyboard (a touch screen has its labelled buttons instead), for `ms` (7 s
	// unless said): whether it's shown.
	function showKeys( ms ) {

		if ( document.body.classList.contains( 'touch' ) ) return false;
		keysShown = true;
		screens.showKeys( ms );
		return true;

	}

	// The challenges' word while driving (NUDGE_AFTER): the seconds of driving left before it, or null
	// once it's had its say (or isn't to have one: no Worker, or the challenges opened already, a run
	// among them). Not over another toast (a few seconds more, then); then today's challenge on the
	// world being driven, from the Worker's list (its place), with a button to the challenges. Both
	// counted for the play stats (challenge: nudge, nudge_open), so the owner can see whether it
	// keeps people longer.
	let nudgeLeft = worker ? NUDGE_AFTER : null;
	function challengeNudge( dt ) {

		if ( nudgeLeft === null || state.mode !== 'driving' ) return;
		if ( challenges ) return nudgeLeft = null;
		nudgeLeft -= dt;
		if ( nudgeLeft > 0 ) return;
		if ( ! $( 'toast' ).hidden ) return nudgeLeft = 3;
		nudgeLeft = null;
		const here = world;
		send( 'GET', '/api/challenges' ).then( answer => {

			const today = answer.ok && answer.body.challenges?.find?.( c => c.world === here && c.period === 'day' );
			if ( ! today || challenges || state.mode !== 'driving' || ! $( 'toast' ).hidden ) return;
			stats.add( 'challenge', 'nudge' );
			screens.toast( `Today's challenge ${ onWorld( here ) }: ${ today.place }. A timed run with its own board.`, 10000, { label: 'Challenges', onClick: () => {

				stats.add( 'challenge', 'nudge_open' );
				openChallenges();

			} } );

		} );

	}

	// Buying the Supporter Pass in its sheet, and signing in for it there and in the pause menu
	// (supporter.js). Without sign-in set up the sheet just says "Coming soon". Its sheet opened, and
	// Buy followed to Stripe, are counted for the play stats.
	const supporter = setUpSupporter( { worker, googleClientId, passwords, turnstileSiteKey, player: () => board.player, onBuy: () => stats.add( 'pass', 'buy' ) } );
	onPassOpen( () => stats.add( 'pass', 'open' ) );
	if ( supporter.on ) {

		fillBuyArea( buyArea() );
		fillAccountArea( $( 'pause' ).querySelector( '.account' ) );

	}

	// About, with the credits the vehicle models' licences ask for.
	const about = $( 'about' );
	const link = ( href, text ) => Object.assign( document.createElement( 'a' ), { href, textContent: text, target: '_blank', rel: 'noopener' } );
	about.querySelector( '.credits' ).replaceChildren( ...vehicles.filter( v => v.credit ).map( ( { name, credit, changes = 'compressed and rescaled' } ) => {

		const li = document.createElement( 'li' );
		li.append( `${ name }: `, link( credit.url, credit.title ), ` by ${ credit.author }, `, link( credit.licenseUrl, credit.license ), `. Modified: ${ changes }.` );
		return li;

	} ) );
	$( 'globe-ui' ).querySelector( '.about-open' ).addEventListener( 'click', () => about.showModal() );
	// The places under the panel's words, each world's, link to their pages (for crawlers, and to
	// open in a new tab), but a plain tap there flies the globe to the place, as a start spot does (a
	// Moon place's turns the globe to the Moon first): leaving the page would end this visit, and its
	// Drive here would spend another.
	$( 'globe-ui' ).querySelector( '.site-info' ).addEventListener( 'click', event => {

		const link = event.target.closest( 'a[data-play]' );
		if ( ! link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ) return;
		const place = linkedPlace( new URL( link.dataset.play, location.href ).search );
		if ( ! place ) return;
		event.preventDefault();
		if ( state.mode === 'globe' ) flyToPlace( place );

	} );
	// (The free worlds by name: "the Moon, Mars, Vesta and Ceres".)
	if ( left !== null && left <= 2 ) screens.toast( left === 0 ? `This is today's free Earth drive: drop in anywhere as often as you like while this page stays open. Reload and it's ${ listOf( OFF_EARTH ) } until tomorrow.` : `${ left } more Earth drive${ left === 1 ? '' : 's' } today after this one.`, left === 0 ? 8000 : 5000 );

	// The orrery (see openOrrery), once it's loaded: told of new counts and party changes from here on.
	let orrery = null;
	let orreryLoading = null;
	let orreryOpening = false;
	let orreryOpener = null;

	// Driving with others (live.js, ghosts.js, friends.js): only when the Worker has it on (on any
	// world) and this visit has a token to show the room. Without it, nothing of it is made. When the
	// Worker couldn't say ('unknown': DriveLimits didn't answer, as for a few minutes after a deploy
	// while it still runs its old code) it's made anyway: turned away at the door, it tries again as a
	// dropped connection does, so the visit isn't left without it for hours over a moment's hiccup.
	// A world whose budget for the day is spent starts closed: alone there, with others on the rest.
	// Each world's as /api/config said (live.js's worldsOf: its liveWorlds, or from a Worker from
	// before, the Earth's and the Moon's keys and the rest off): 'open', 'spent', 'off' or 'unknown'.
	const liveVisit = LIVE_TEST?.visit ?? visit;
	const liveStates = worldsOf( { live: liveOn, liveReason, liveMoon, liveMoonReason, ...( liveWorlds && typeof liveWorlds === 'object' ? { liveWorlds } : {} ) } );
	const closedWorlds = LIVE_WORLDS.filter( id => liveStates[ id ] === 'spent' || liveStates[ id ] === 'off' );
	// (Of those, the ones whose budget is spent, for the toast below: a world only switched off says
	// nothing of lots of drivers.)
	const spentWorlds = LIVE_WORLDS.filter( id => liveStates[ id ] === 'spent' );
	// Each other world's frame (body.js's group, the one a recentre moves, and its sphere), for the
	// rooms (live.js) and the dots (online.js).
	const liveBodies = Object.fromEntries( OFF_EARTH.map( id => [ id, { group: bodies[ id ].group, ellipsoid: bodies[ id ].ellipsoid } ] ) );
	const live = LIVE_WORLDS.some( id => liveStates[ id ] === 'open' || liveStates[ id ] === 'unknown' ) && typeof liveVisit === 'string' && liveVisit
		? createLive( {
			earth, ellipsoid, bodies: liveBodies, world: () => world, liveWorlds: LIVE_WORLDS, closed: closedWorlds,
			visit: liveVisit, player: () => board.player, ride: { vehicle: panel.vehicle.id, look: lookOf( panel.vehicle ) },
		} )
		: null;
	// The others' cars, through the frame of the world this page is on (drawn only for those on it,
	// and only while its rooms are this page's: ghosts.js).
	const ghosts = live && createGhosts( {
		scene, earth, frame: () => world === EARTH ? earth : bodies[ world ].group, camera, vehicles, models: ghostShapes, live, tags: $( 'live-tags' ), own: () => state.entry?.pivot ?? null,
		effects: driver.effects,
	} );
	// (On a world without driving with others, they're told it's that world's, as if not on the
	// globe or driving: nothing of who's driving is for there.)
	const liveMode = () => liveHere() ? state.mode : world;
	const friends = live && setUpFriends( { live, ghosts, vehicles, mode: liveMode, goTo, onInvite: () => stats.add( 'party', 'made' ) } );
	// Where people are driving now, on the globe (online.js): with driving with others, and nothing
	// of it without; on each world's globe, that world's. Its row for drivers on two or more other
	// worlds opens the orrery (onOthers), and each world's count (onCounts, null without) goes on the
	// panel's Worlds button and into the orrery.
	const globeUi = $( 'globe-ui' );
	const online = live && createOnline( {
		camera, earth, ellipsoid, bodies: liveBodies, world: () => world, onWorld: next => setWorld( next ),
		onOthers: row => openOrrery( row ),
		onCounts: worlds => {

			panel.setWorldCount( worlds?.[ world ]?.total ?? null );
			orrery?.update();

		},
		canvas, live, panel, mode: liveMode, onPick: flyToPlace, onZoom: zoomTo, earthless: !! earthClosed,
		// The Garage covers the globe (the whole screen on a phone): nothing's asked while it's open.
		paused: () => garage.isOpen,
		layer: globeUi.querySelector( '.online-dots' ),
		covers: [ globeUi.querySelector( '.panel' ), globeUi.querySelector( '.pin-card' ), globeUi.querySelector( '.party-banner' ) ],
		poll: LIVE_TEST?.online?.poll, idle: LIVE_TEST?.online?.idle,
	} );
	// A tap on one of its dots goes there rather than dropping a pin.
	globe.onTap = ( x, y ) => !! online?.tap( x, y );
	// A party's link (?party=CODE): its room, from the globe on. With driving with others off for
	// the rest of the day (its budget spent), a word on why nothing comes of the link.
	const partyCode = cleanPartyCode( new URLSearchParams( location.search ).get( 'party' ) );
	if ( friends && partyCode ) {

		friends.joinParty( partyCode );
		stats.add( 'party', 'joined' );
		// (Its rooms on this world are spent today: why nothing comes of it here; on the worlds still
		// open, it does, the party's room going on through one of them (live.js's here).)
		if ( live.closedHere && spentWorlds.includes( world ) ) screens.toast( budgetToast( world, live.openWorlds() ), 10000 );

	}
	else if ( partyCode && spentWorlds.length ) screens.toast( BUDGET_TOAST, 10000 );
	// Levels show from here on (a level-up says hello again in the room, so after that's made).
	progress.start();
	// The points of each landed jump: the run's score less what it was at the last, in this ride at
	// this place (a run of its own, see drive.js).
	let runScore = 0;
	let runEntry = null;

	// How far above the middle of the view a pin flown to should show (see GlobeView.lifted): on a
	// phone the panel is a sheet along the bottom with the pin's card over it, so the pin goes in the
	// middle of what's left between them and the title. Beside a panel down the side, the middle.
	function pinLift() {

		const sheet = $( 'globe-ui' ).querySelector( '.panel' ).getBoundingClientRect();
		const height = window.innerHeight;
		if ( sheet.top < height * 0.3 ) return 0;
		const top = $( 'globe-ui' ).querySelector( '.intro' ).getBoundingClientRect().bottom;
		// (An ad over the sheet (ads.js) is part of it here: the pin's card is above that.)
		const ad = $( 'globe-ui' ).querySelector( '.ad-slot' )?.getBoundingClientRect();
		const middle = ( top + Math.min( sheet.top, ad?.height ? ad.top : Infinity ) - PIN_CARD ) / 2;
		return MathUtils.clamp( 1 - 2 * middle / height, 0, 0.8 );

	}

	function pinAt( place ) {

		globe.setPin( place );
		panel.setPin( place );

	}

	// A spot, a search result or where people are driving: the globe flies there, pinned (on its own
	// world, turned to first).
	async function flyToPlace( place ) {

		if ( worldOf( place ) !== world && ! await setWorld( worldOf( place ), { at: place } ) ) return;
		stayPut();
		const height = globe.surfaceHeight( place.lat, place.lon );
		const pin = { ...place, height };
		globe.setPin( pin );
		panel.setPin( pin );
		stats.once( 'funnel', 'pin' );
		const view = { lat: place.lat, lon: place.lon, height: height ?? 0, distance: 2200, heading: place.heading ?? 0, pitch: - 50 };
		globe.flyTo( globe.lifted( view, pinLift(), GLOBE_FOV ) ).then( arrived => {

			// Sharper tiles have loaded on the way down: sit the pin on them.
			if ( arrived && globe.pin === pin ) pin.height = globe.surfaceHeight( pin.lat, pin.lon ) ?? pin.height;

		} );

	}

	// Straight down over a spot from `distance` (m) up, unpinned: where several areas of people
	// driving are, so they come apart.
	function zoomTo( { lat, lon, distance } ) {

		globe.flyTo( globe.lifted( { lat, lon, height: 0, distance, heading: globe.pose().heading, pitch: - 90 }, pinLift(), GLOBE_FOV ) );

	}

	// A place's name as the leaderboard has it: a dropped pin by where it is (to about a kilometre,
	// so pins near each other are one place), and only the characters the Worker takes.
	// On another world it says so ("Tycho crater (Moon)", "Mars, 4.59° S, 137.44° E"), so it's never
	// the board of the place on the Earth with the same name or at the same latitude and longitude:
	// a long name is cut short to leave room for its world, never its world cut off.
	function placeLabel( place ) {

		if ( ! place ) return null;
		const on = worldOf( place );
		if ( ! on ) return null;
		const other = on === EARTH ? null : WORLDS[ on ].name;
		const pin = place.name === 'Dropped pin';
		const clean = ( text, most = PLACE_LENGTH ) => [ ...String( text ).replace( /[–—]/g, '-' ).replace( PLACE_TEXT, ' ' ).replace( /\s+/g, ' ' ).trim() ].slice( 0, most ).join( '' ).trim();
		const named = ( text, most = PLACE_LENGTH ) => {

			if ( ! other ) return clean( text );
			// (A name that says so already, as one beside a friend there is theirs, isn't said twice.)
			if ( String( text ).startsWith( `${ other }, ` ) || String( text ).endsWith( ` (${ other })` ) ) return clean( text );
			if ( pin ) return clean( `${ other }, ${ text }` );
			const room = most - ` (${ other })`.length;
			const short = clean( text, room );
			return short ? `${ short } (${ other })` : '';

		};

		const name = pin ? formatLatLon( place.lat, place.lon ).replace( /(\.\d\d)\d+/g, '$1' ) : place.name;
		return named( name ) || clean( `${ other ? `${ other }, ` : '' }${ formatLatLon( place.lat, place.lon ) }` );

	}

	function setMode( mode ) {

		// Anything that leaves the globe (a drop-in, Join, a challenge's start) closes the orrery first.
		if ( mode !== 'globe' && orrery?.isOpen ) orrery.close();
		state.mode = mode;
		document.body.dataset.mode = mode;
		// A level-up waiting shows as the drive starts, and one showing goes as it pauses or ends.
		if ( mode === 'driving' ) profile.driving();
		else profile.hideLevelUp();
		globe.setEnabled( mode === 'globe' );
		$( 'globe-ui' ).hidden = mode !== 'globe';
		$( 'drive-ui' ).hidden = mode !== 'driving' && mode !== 'paused';
		if ( pad ) pad.visible = mode !== 'globe' && ! offEarth();

	}

	setMode( 'globe' );
	// How long from asking for the page to the globe, from where, and on what (the funnel's first step).
	stats.loaded( performance.now() );

	// Google's ad on the globe (ads.js, docs/world-drive.md "Ads"), only with an AdSense publisher id
	// in /api/config, and never for a supporter: its code, and Google's script, are only asked for
	// once the Worker has said whether the pass is here, and then when the browser is next idle, so
	// nothing of them is in the way of the globe coming up. Shown and blocked are counted once a visit.
	if ( adsense ) {

		const later = fn => window.requestIdleCallback ? requestIdleCallback( fn, { timeout: 5000 } ) : setTimeout( fn, 3000 );
		supporter.known.then( () => later( () => isPro() || import( './ads.js' ).then( ads => ads.showAds( {
			...adsense, root: $( 'globe-ui' ), onShown: () => stats.once( 'ad', 'shown' ), onBlocked: () => stats.once( 'ad', 'blocked' ),
		} ), err => console.warn( 'Ads didn\'t load', err?.message ) ) ) );

	}

	// A place's link (?spot= or ?at=, its "Drive here" on the places' pages, drive/site/): the
	// globe flies there and pins it, so Drive here is one more tap; it never drops in by itself.
	// Only once the panel shows (the pin is lifted clear of it), and on Google's tiles once their
	// root has arrived, as that moves the Earth under the camera. Then it's out of the address (a
	// ?party= stays), so a reload doesn't fly there again; not before, so the reload the root's
	// error screen asks for still goes there.
	// (With the Earth closed this visit, a link to the Earth's left in the address for later.)
	const linked = linkedPlace( location.search );
	if ( linked && ! ( earthClosed && worldOf( linked ) === EARTH ) ) {

		let flown = false;
		const flyToLinked = () => {

			if ( flown ) return;
			flown = true;
			const url = new URL( location.href );
			for ( const name of LINK_PARAMS ) url.searchParams.delete( name );
			history.replaceState( history.state, '', url );
			if ( state.mode !== 'globe' || panel.pinned ) return;
			flyToPlace( linked );

		};

		if ( tiles && ! tiles.root && worldOf( linked ) === EARTH ) tiles.addEventListener( 'load-root-tileset', flyToLinked );
		else flyToLinked();

	}

	if ( earthClosed && worldOf( linked ) === EARTH ) setWorld( earthClosed.world ?? FALLBACK );
	// A "challenge a friend" link: its card, over the challenges' list.
	if ( challengeLink ) openChallengeLink( challengeLink );
	// ?worlds=1 (and on the dev server a test's word): the orrery, open from the start; then it's out
	// of the address, so a reload is a plain one. Not over a challenge's card.
	const worldsLink = new URLSearchParams( location.search ).get( 'worlds' );
	if ( worldsLink !== null ) {

		const url = new URL( location.href );
		url.searchParams.delete( 'worlds' );
		history.replaceState( history.state, '', url );

	}

	// (challengeLink is boot.js's promise, of null for no link: it's what it comes to that counts.)
	if ( worldsLink === '1' || ORRERY_TEST?.onLoad ) Promise.resolve( challengeLink ).then( link => link || openOrrery(), () => openOrrery() );

	// --- the orrery (orrery.js, its own chunk, its CSS and pictures under /orrery/: nothing of it is
	// fetched until it's first opened) ---

	// It's a modal <dialog> (#orrery) over the globe, drawn by this page's renderer into its canvas
	// in place of the scene while it's open (the frame below), so there's no second WebGL context.
	// Picking a world there turns the globe to it (setWorld).
	async function loadOrrery() {

		if ( orrery ) return true;
		orreryLoading ??= import( './orrery.js' ).then( module => module.createOrrery( {
			dialog: $( 'orrery' ),
			renderer,
			current: () => world,
			counts: () => online?.worlds ?? null,
			party: () => live?.party ? [ ...live.players.values() ].map( ( { pid, name, world: on, away, globe: looking } ) => ( { pid, name, world: on, away, globe: looking ?? null } ) ) : [],
			spots: id => ( id === EARTH ? SPOTS : SPOTS_ON[ id ] ?? [] ).slice( 0, 4 ).map( spot => ( { id: spot.id, name: spot.name, place: spot } ) ),
			earthClosed: () => !! earthClosed,
			reducedMotion,
			onDrive: id => setWorld( id ),
			onPlace: place => flyToPlace( place ),
			onJoin: pid => goTo( pid ),
			onClose: orreryClosed,
		} ) );
		try {

			orrery = await orreryLoading;
			return true;

		} catch ( err ) {

			orreryLoading = null;
			screens.toast( `The worlds didn't load (${ err.message }). Try again in a moment.`, 6000 );
			return false;

		}

	}

	// Open it, from the globe only, and not over another dialog (the Garage, the leaderboard...).
	// `opener`: what opened it, which has the focus back when it closes (else the Worlds button).
	async function openOrrery( opener = null ) {

		if ( orreryOpening || orrery?.isOpen || state.mode !== 'globe' ) return false;
		orreryOpening = true;
		try {

			if ( ! await loadOrrery() ) return false;
			if ( state.mode !== 'globe' || orrery.isOpen || document.querySelector( 'dialog[open]:not( #orrery )' ) ) return false;
			orreryOpener = opener instanceof Element ? opener : document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
			document.body.dataset.orrery = 'open';
			globe.setEnabled( false );
			orrery.open( orreryOpener );
			return true;

		} finally {

			orreryOpening = false;

		}

	}

	// Its onClose (before any Drive, spot or Join it closed for): the globe back as it was, and the
	// focus back where it came from.
	function orreryClosed() {

		delete document.body.dataset.orrery;
		globe.setEnabled( state.mode === 'globe' );
		const back = orreryOpener?.isConnected && orreryOpener.getClientRects().length ? orreryOpener : globeUi.querySelector( '.worlds-open' );
		orreryOpener = null;
		back?.focus( { preventScroll: true } );

	}

	// The party's changes (who's in it, where they are) into the orrery's sheet while it's open.
	if ( live ) for ( const type of [ 'welcome', 'join', 'leave', 'place', 'away', 'party', 'clear', 'closed', 'ended' ] ) live.on( type, () => orrery?.isOpen && orrery.update() );

	// --- moving the scene to a new place, without loading anything again ---

	function recentre( place ) {

		frameOn( place );
		origin = { lat: place.lat, lon: place.lon, height: place.height ?? 0 };

	}

	// The scene's frame on `place`, the camera staying where it is on the world: on a small world far
	// from round, level with its level there (placeBody), else as the sphere or the Earth has it.
	function frameOn( place ) {

		globe.capture();
		if ( offEarth() ) placeFrame( place );
		else if ( tiles ) recentreTiles( tiles, place );
		else placeEarth( earth, ellipsoid, place );
		globe.restore();

	}

	function placeFrame( place ) {

		if ( levelled( world ) ) placeBody( body().group, world, place );
		else placeEarth( body().group, body().ellipsoid, place );

	}

	// On a small world (WORLDS' `recentre`), how far (m) the car goes from the scene's middle before
	// the frame follows it; null on the others, whose frame stays where it was dropped in.
	function recentring() {

		return offEarth() ? WORLDS[ world ].recentre ?? null : null;

	}

	// While driving on a small world, the car farther than `recentring` from the scene's middle
	// (along the ground): the frame moved to it (shiftTo), so its flat frame is level where it is.
	// Before its update, so the whole frame (the car, the challenges, the camera, the ground made
	// sharp round it) is in the new one. The ground's curve under the flat frame stays within a
	// third of a degree (Vesta's 1 km over its level's sharpest curve, 184 km across).
	function follow() {

		const most = recentring();
		if ( ! most || state.mode !== 'driving' || ! driver.active || Math.hypot( driver.east, driver.north ) <= most ) return;
		// Where the car stands (its pivot), on the world's sphere; the frame's middle on the ground
		// there, as for a drop-in.
		state.entry.pivot.getWorldPosition( _p ).applyMatrix4( _inverse.copy( body().group.matrixWorld ).invert() );
		const at = body().ellipsoid.getPositionToCartographic( _p, {} );
		const [ lat, lon ] = [ at.lat * MathUtils.RAD2DEG, at.lon * MathUtils.RAD2DEG ];
		shiftTo( { lat, lon, height: body().heightAt( lat, lon ) ?? at.height } );

	}

	// The scene's frame moved to `place` ({ lat, lon, height }) on a small world, everything in it
	// carried: the car (and its effects), the pads, a parked car, a challenge's run (challenges.js's
	// recentred) and the camera, by the frame's move M (a Matrix4: the scene before to the scene
	// after), so nothing is seen to jump. M, or null where the frame doesn't move (the Earth, the
	// Moon, Mars).
	function shiftTo( place ) {

		if ( ! recentring() ) return null;
		const { group } = body();
		_before.copy( group.matrixWorld );
		frameOn( place );
		const move = new Matrix4().multiplyMatrices( group.matrixWorld, _before.invert() );
		driver.transform( move );
		pads.transform( move );
		if ( ! driver.active && state.entry ) carryParked( state.entry, move );
		challenges?.recentred?.( move );
		// The others' cars' effects and what's worked out of them in the scene (their snaps, in the
		// world's own frame, are read through the frame's new matrixWorld anyway).
		ghosts?.transform?.( move );
		origin = { lat: place.lat, lon: place.lon, height: place.height ?? 0 };
		recentres ++;
		return move;

	}

	// A parked car (paused) carried by `move`: where it stands and how it's turned, as models.apply
	// puts it (its saved state and how it was parked kept in step, so it stays parked as it was).
	function carryParked( entry, move ) {

		const { pivot, state: saved, parked } = entry;
		pivot.updateMatrix();
		pivot.matrix.premultiply( move ).decompose( pivot.position, pivot.quaternion, _p );
		pivot.rotation.setFromQuaternion( pivot.quaternion, 'YXZ' );
		pivot.updateMatrixWorld( true );
		const { east, north, up } = localToEnu( pivot.position );
		const heading = yawToHeading( pivot.rotation.y );
		Object.assign( saved, { east, north, up, heading } );
		if ( parked ) Object.assign( parked, { east, north, up, heading, pitch: pivot.rotation.x * MathUtils.RAD2DEG, roll: pivot.rotation.z * MathUtils.RAD2DEG } );

	}

	// --- the Earth or another world ---

	// Turn the globe to another world (only from the globe), the first time to one made in the page
	// once it has loaded. `at`: a place to look at there (else where it was looking when it left).
	// Resolves true once it's turned, false if it didn't (it didn't load, or another turn took over).
	async function setWorld( next, { at = null } = {} ) {

		if ( state.mode !== 'globe' || ! WORLDS[ next ] ) return false;
		// No Earth this visit (earthClosed): boot.js says why, and how to get there.
		if ( earthClosed && next === EARTH ) {

			panel.setWorld( world );
			earthClosed.onEarth();
			return false;

		}

		if ( next === world ) {

			switching = null;
			panel.setWorld( world );
			return true;

		}

		const ticket = switching = {};
		const coming = bodies[ next ];
		if ( coming && ! coming.ready ) {

			panel.setWorld( world, { busy: next } );
			try {

				await coming.load();

			} catch ( err ) {

				if ( switching === ticket ) {

					switching = null;
					panel.setWorld( world );
					screens.toast( `${ TheWorld( next ) } didn't load (${ err.message }). Try again in a moment.`, 7000 );
					stats.add( 'problem', `${ next }_failed` );

				}

				return false;

			}

		}

		// Something else since (back to the Earth, a place or a drop-in on it): staying.
		if ( switching !== ticket || state.mode !== 'globe' ) {

			if ( switching === ticket ) stayPut();
			return false;

		}

		switching = null;
		const pose = globe.pose();
		lastLook[ world ] = { lat: pose.lat, lon: pose.lon };
		// The world left lets go of all but its coarsest ground (built again when it's back).
		body()?.release();
		world = next;
		if ( offEarth() ) stats.add( 'world', world );
		for ( const [ id, other ] of Object.entries( bodies ) ) other.group.visible = id === world;
		earth.visible = ! offEarth();
		pinAt( null );
		globe.setBody( globeBodies[ world ] ?? earthBody );
		panel.setWorld( world );
		panel.setWorldCount( online?.worlds?.[ world ]?.total ?? null );
		markLive();
		// A party is told which world's globe this is; an area's room of the world left goes. (On a
		// world whose rooms are closed today, live.js keeps a party in another world's still open,
		// away, looking at this one's globe.)
		live?.worldChanged();
		const look = at ?? lastLook[ world ] ?? WORLDS[ world ].first ?? home;
		// The world's frame on the place looked at, as the Earth's is on the last place driven.
		if ( offEarth() ) placeFrame( { lat: look.lat, lon: look.lon, height: 0 } );
		// In from further out, as if arriving (and the light by where the camera now is); for a
		// visitor asking for less motion, straight there.
		const orbit = globe.orbit( look.lat, look.lon );
		const still = ! at && reducedMotion();
		globe.place( still ? orbit : { ...orbit, distance: orbit.distance * 2.4 } );
		globe.capture();
		lightFor();
		if ( ! at && ! still ) globe.flyTo( orbit, { duration: 2.2 } );
		return true;

	}

	// Stay on this world: a turn to the other still waiting for it to load is dropped, and the panel
	// says so (a place picked or a drop-in on this world meanwhile is what's wanted).
	function stayPut() {

		if ( ! switching ) return;
		switching = null;
		panel.setWorld( world );

	}

	// --- dropping in ---

	async function dropIn( place ) {

		if ( state.mode !== 'globe' ) return;
		// When Drive here was pressed, for how long the drop-in takes (the play stats).
		const began = performance.now();
		// (A place on another world: Join, from the Moon, to someone driving on the Earth.)
		if ( ! worldOf( place ) ) return;
		if ( worldOf( place ) !== world && ! await setWorld( worldOf( place ) ) ) return;
		stayPut();
		stats.once( 'funnel', 'dropin' );
		// (A drop-in anywhere but a challenge's start ends a run that's going, if there's one.)
		challenges?.dropping( place );
		if ( offEarth() ) return dropInBody( place, began );
		const drop = state.drop = { cancelled: false, began };
		const gone = () => drop.cancelled || state.drop !== drop;
		let { lat, lon } = place;
		state.place = place;
		// (Not a place picked, as a landmark challenge's start isn't: recent: false.)
		if ( place.recent !== false ) rememberPlace( place );
		panel.refreshRecent();
		pinAt( null );
		pads.clear();
		sea.clear();
		Object.assign( seaWatch, { in: 0, asked: false, ready: false, spot: null } );
		setMode( 'dropping' );
		// (Where people are driving is a pin, or a start spot's own place, with the spot it's near.)
		const shown = place.near || place.name;
		$( 'drive-ui' ).querySelector( '.place' ).textContent = shown;
		screens.loading( `Dropping in: ${ shown }` );

		// Centre the scene on the pin, at about the height of the ground there.
		const estimate = place.height ?? globe.surfaceHeight( lat, lon ) ?? 0;
		recentre( { lat, lon, height: estimate } );
		removeVehicle();
		const vehicle = panel.vehicle;
		const vehicleLoading = loadVehicle( models, vehicle ).then( entry => {

			entry.pivot.visible = false;
			return entry;

		} );
		vehicleLoading.catch( () => {} );

		// Down to a few hundred metres, looking round, and wait for the ground to load.
		await globe.flyTo( { lat, lon, height: estimate, distance: 320, heading: place.heading ?? globe.pose().heading, pitch: - 40 } );
		if ( gone() ) return;
		screens.loading( 'Loading the ground...', 0 );
		// Looking for it anywhere from above the highest mountain to below the deepest sea floor,
		// whatever the estimate was.
		const { y, settled } = await settle( drop, GROUND_RANGE[ 1 ] - estimate, GROUND_RANGE[ 1 ] - GROUND_RANGE[ 0 ], GROUND_WAIT[ 0 ] );
		if ( gone() ) return;
		// The bed of the sea or a lake (with the tiles done loading, not a coarse tile cutting under
		// the curve of the Earth): the open water, started on its surface; and beside another driver
		// out on that surface over a shallower bed, or in the air over it (see ALONGSIDE, CLOSE and
		// AT_SURFACE), on it with them.
		const floor = y === null ? null : estimate + y;
		const water = floor !== null && settled ? await waterOver( lat, lon, floor, y ) ?? ( place.beside ? await waterBeside( lat, lon, place.height, floor, y, place.laid, place.riding ) : null ) : null;
		const open = water !== null;
		if ( gone() ) return;
		if ( floor === null || ( ! open && floor < LOWEST ) ) {

			noGround( 'There\'s no 3D map at this spot yet. Try somewhere else.' );
			return;

		}

		// A spot on a bridge starts on its deck, if its pin is a little off it, over the water; a pin
		// on a roof (or anything else raised) starts on the street below it.
		let height = open ? water.height : floor;
		const start = open ? null : place.deck ? ground.deck( y ) : ground.street( y );
		if ( start ) {

			( { lat, lon } = localToLatLon( enuToLocal( start.east, start.north, 0 ), { lat, lon } ) );
			height = estimate + start.y;

		}

		// Now the ground (or the sea) is at y = 0, and the street can be seen: down behind where
		// you'll start.
		recentre( { lat, lon, height } );
		if ( open ) sea.start( { lat, lon, height, over: water.over, lake: water.lake } );
		state.place = { ...place, lat, lon, height };
		const heading = ground.heading( 0, place.heading );
		await globe.flyTo( { lat, lon, height, distance: 16, heading, pitch: - 15 }, { duration: 1.8, ground: ! open } );
		if ( gone() ) return;
		screens.loading( 'Loading the ground...', 0 );
		await settle( drop, 300, 600, GROUND_WAIT[ 1 ] );
		if ( gone() ) return;
		await arrive( drop, vehicle, vehicleLoading, heading );

	}

	// On another world: no tiles to wait for, no sea and no streets. Its ground's height is known
	// before any of it is built (body-height.js), so the scene is centred on the ground at the pin at
	// once; then the squares round it are built on the way down (body.js, faster while the loading
	// screen is up). Facing the way with the most open ground (ground.heading), and you're off.
	async function dropInBody( place, began ) {

		const here = body();

		const drop = state.drop = { cancelled: false, began };
		const gone = () => drop.cancelled || state.drop !== drop;
		const { lat, lon } = place;
		state.place = place;
		if ( place.recent !== false ) rememberPlace( place );
		panel.refreshRecent();
		pinAt( null );
		pads.clear();
		sea.clear();
		setMode( 'dropping' );
		const shown = place.near || place.name;
		$( 'drive-ui' ).querySelector( '.place' ).textContent = shown;
		screens.loading( `Dropping in: ${ shown }` );
		const height = here.heightAt( lat, lon ) ?? 0;
		recentre( { lat, lon, height } );
		state.place = { ...place, height };
		removeVehicle();
		const vehicle = panel.vehicle;
		const vehicleLoading = loadVehicle( models, vehicle ).then( entry => {

			entry.pivot.visible = false;
			return entry;

		} );
		vehicleLoading.catch( () => {} );
		here.rush = true;
		try {

			await globe.flyTo( { lat, lon, height, distance: 320, heading: place.heading ?? globe.pose().heading, pitch: - 40 } );
			if ( gone() ) return;
			screens.loading( 'Loading the ground...', 0 );
			await settle( drop, 300, 600, GROUND_WAIT[ 0 ] );
			if ( gone() ) return;
			const heading = ground.heading( 0, place.heading );
			await globe.flyTo( { lat, lon, height, distance: 16, heading, pitch: - 15 }, { duration: 1.8 } );
			if ( gone() ) return;
			screens.loading( 'Loading the ground...', 0 );
			const { y } = await settle( drop, 300, 600, GROUND_WAIT[ 1 ] );
			if ( gone() ) return;
			if ( y === null ) {

				noGround( `${ TheWorld( world ) }'s ground didn't load here. Try again, or somewhere else.` );
				return;

			}

			await arrive( drop, vehicle, vehicleLoading, heading );

		} finally {

			// (Unless a newer drop-in has it now.)
			if ( ! state.drop || state.drop === drop ) here.rush = false;

		}

	}

	// The end of a drop-in, the camera down by where you'll start: the vehicle on the ground (out of
	// the way of anything in front), and driving.
	async function arrive( drop, vehicle, vehicleLoading, heading ) {

		const gone = () => drop.cancelled || state.drop !== drop;
		let entry;
		try {

			entry = await vehicleLoading;

		} catch ( err ) {

			// A model that didn't come (the pickup is 2.8 MB): the go-kart instead, which is drawn here and
			// can't fail to load, rather than no drive at all. A problem for the play stats either way.
			stats.add( 'problem', 'ride_failed' );
			const kart = vehicles.find( v => v.id === 'go-kart' ) ?? null;
			if ( ! kart || kart === vehicle ) {

				noGround( `The ${ vehicle.name.toLowerCase() } didn't load (${ err.message }). Try again or pick another ride.`, null );
				return;

			}

			screens.toast( `The ${ vehicle.name.toLowerCase() } didn't load (${ err.message }), so here's the ${ kart.name.toLowerCase() }.`, 7000 );
			vehicle = kart;
			entry = await loadVehicle( models, kart );

		}

		if ( gone() ) return models.remove( entry );
		// Something right in front (a car parked in Google's photo, a bollard): start across the
		// road from it, where there's a clear lane.
		const size = entry.footprint.getSize( _p );
		const halfWidth = Math.max( 0.6, Math.min( size.x, size.z ) * entry.state.scale / 2 );
		const step = ground.sideStep( heading, ground.heightAt( 0, 0, 30, 60 ) ?? 0, halfWidth );
		Object.assign( entry.state, { east: step?.east ?? 0, north: step?.north ?? 0, heading } );
		models.apply( entry );
		entry.pivot.visible = true;
		state.drop = null;
		state.entry = entry;
		state.vehicle = vehicle;
		// (The go-kart, if the ride picked didn't load: the pickers show what's driven.)
		panel.setDriven( vehicle );
		screens.hideLoading();
		progress.dropped( { world } );
		drive();
		stats.add( 'dropin', offEarth() ? world : METRICS.dropin.key( state.place?.id ) ?? 'other' );
		// And where, to about a kilometre (the cell it's in, never where in it), for the owner's map
		// of where people drop in.
		stats.dropped( world, state.place.lat, state.place.lon );
		stats.add( 'ride', vehicle.id );
		stats.add( 'dropin_time', dropinBucket( performance.now() - drop.began ) );
		stats.once( 'funnel', 'driving' );
		live?.setRide( vehicle.id, lookOf( vehicle ) );
		// Where you dropped in, on its world: each has its own rooms, and a place off the Earth says
		// which. (On a world without driving with others nobody's told: you're on the globe as far as
		// they know.)
		if ( ! liveHere() ) live?.setAway();
		else live?.setPlace( { name: placeLabel( state.place ), lat: state.place.lat, lon: state.place.lon, height: state.place.height, ...( offEarth() ? { world } : {} ) } );
		// A challenge's start: its gates or items and its countdown (challenges.js), which shows the keys
		// over it if they haven't been this visit.
		const started = challenges?.arrived( state.place ) ?? false;
		// The keys, on a keyboard; a touch screen has its labelled buttons instead.
		if ( ! started ) showKeys();

	}

	// The water's surface to start on if the ground under the pin at ( lat, lon ), `floor` m over the
	// ellipsoid and `y` in the scene, is the bed of the sea or a big lake: { height } over the
	// ellipsoid, { over } how far that is over the sea's height (a lake's height, 0 for the sea) and
	// { lake } (lakes.js's, or null for the sea); or else null. The test pad stands for ground at the
	// water's surface wherever it's put (the test globe under it is the ellipsoid drawn with few
	// faces, which sag hundreds of metres under it), lowered as far as a test lowers it.
	async function waterOver( lat, lon, floor, y ) {

		const highest = Math.max( 0, ...lakesNear( lat, lon ).map( lake => lake.height ) ) + HIGHEST_SEA - BED;
		if ( tiles ? floor > highest : y > - BED ) return null;
		const [ level, at ] = await Promise.all( [ seaLevel( lat, lon ), waterAt( lat, lon ) ] );
		// How far over the sea's height the water is there: none on land (or without the map).
		const over = riseOf( at );
		const surface = level + ( over ?? 0 );
		const bed = tiles ? floor : surface + y;
		// (The water's surface in the scene is as far over y as it's over the bed.)
		if ( over !== null && bed < surface - BED && ! walled( y + surface - bed ) ) return { height: surface, over, lake: at.lake ?? null };
		return bed < LOWEST ? { height: level, over: 0, lake: null } : null;

	}

	// The same for a drop-in beside another driver (goBeside's), `height` m over the ellipsoid being
	// theirs: the water's surface to start on with them where they're out on it, or in the air over
	// it, over a bed less deep than that, as the look for laying it afresh has it (see ALONGSIDE); or
	// else null. With `laid` (goBeside's: { lake }, the water whose surface is yours, a big lake of
	// lakes.js's or null for the sea) and that their water too, it's as moveCar has it with yours laid
	// in the scene (see CLOSE): over any of that water's ground more than SEA_MARGIN under it that
	// isn't built up. And so with `riding` (goBeside's: where their car is from the pin,
	// [ east, north ] m, its wheels on something) where they're riding on that water's surface (see
	// AT_SURFACE).
	async function waterBeside( lat, lon, height, floor, y, laid = null, riding = null ) {

		if ( ! Number.isFinite( height ) ) return null;
		const [ level, at ] = await Promise.all( [ seaLevel( lat, lon ), waterAt( lat, lon ) ] );
		const by = waterBy( lat, lon );
		if ( by === null ) return null;
		const surface = level + by.over;
		const bed = tiles ? floor : surface + y;
		// (The water's surface in the scene is as far over y as it's over the bed.)
		const top = y + surface - bed;
		if ( bed >= surface - SEA_MARGIN ) return null;
		const found = { height: surface, over: by.over, lake: by.lake };
		// Over yours (see CLOSE), or theirs that they're riding on (see AT_SURFACE): unless built up.
		// (The look below lays it nowhere built up, so beside a rider this comes to what besideWater
		// does in your scene, asking that look first.)
		const yours = laid !== null && laid.lake === by.lake && height >= surface - ALONGSIDE;
		if ( yours || riding !== null && rides( riding[ 0 ], riding[ 1 ], top + height - surface, top ) ) return builtUp( 0, 0, top ) ? null : found;
		// Else as it's laid afresh (see ALONGSIDE): only on the water's own squares (not a big lake's
		// shore's).
		if ( ! isWater( at, by.lake ) || height < surface - ALONGSIDE || by.lake !== null && bed >= surface - BED ) return null;
		return water.land( 0, 0, y + 1, 2 ) || ! opensOut( 0, 0, top ) ? null : found;

	}

	// Whether another driver whose car is at ( east, north, y ) in the scene, its wheels on something,
	// is riding on the water's surface whose height is `surface` there (m, in the scene), a surface of
	// their own (see AT_SURFACE): at that height, with the ground under their car (Google's, or the
	// test pad: none of the sea's laid here) more than SEA_MARGIN under it.
	function rides( east, north, y, surface ) {

		if ( Math.abs( y - surface ) > AT_SURFACE ) return false;
		const under = ground.heightBelow( east, north, y + 4, SEA_DEPTH );
		return under !== null && under < surface - SEA_MARGIN;

	}

	// Whether anything round the pin within RIM m stands more than BED m over `surface`, the water's
	// surface (m, in the scene): looked for down from far over that to it (see RIM).
	function walled( surface ) {

		const top = surface + BED;
		for ( const distance of RIM ) {

			for ( let i = 0; i < BEARINGS; i ++ ) {

				const angle = i / BEARINGS * Math.PI * 2;
				if ( ground.heightBelow( Math.sin( angle ) * distance, Math.cos( angle ) * distance, top + GROUND_RANGE[ 1 ], GROUND_RANGE[ 1 ] ) !== null ) return true;

			}

		}

		return false;

	}

	// Whether the ground round ( east, north ) in the scene is open to the water whose surface is
	// `surface` there (m, in the scene), as the bed of open water is (see OPEN): OPEN of BEARINGS one
	// after another with nothing at any of OPEN_AT's distances along them more than RISE m over that
	// surface, coloured as only dry land is or missing. Each bearing is looked along only when a run of
	// OPEN that might be clear comes to it, from the run's far end back. With `round` (watchSea's:
	// what's known so far of the bearings, carried on from frame to frame), no more rays than a
	// frame's share (see OPEN_RAYS), and null if that isn't enough to know yet. Without it (beside
	// another driver), all the rays it needs, now, with a ray along each bearing too, and FAN between
	// each two of a run's once they're all clear, that nothing SKIM m over the surface meets (see SKIM
	// and FAN). With `close`, only OPEN_AT's distances up to CLOSE m, and by heights alone: whether it
	// isn't built up (see CLOSE).
	function opensOut( east, north, surface, round = null, close = false ) {

		const top = surface + RISE;
		const reach = close ? OPEN_AT.filter( distance => distance <= CLOSE ) : OPEN_AT;
		const beside = round === null;
		round ??= { clear: [], along: [], first: 0, spread: false };
		const { clear, along } = round;
		const gaps = [];
		const until = round.spread ? performance.now() + OPEN_MS : Infinity;
		let cast = 0;
		// Whether bearing i is clear (true or false), or null where this frame's rays ran out on it,
		// to go on from there next time.
		const isClear = i => {

			const bearing = i % BEARINGS;
			if ( clear[ bearing ] !== undefined ) return clear[ bearing ];
			const angle = bearing / BEARINGS * Math.PI * 2;
			// (Beside another driver, first the ray along it, SKIM m up: among houses that closes most
			// bearings, each with that one ray.)
			if ( beside && skims( east, north, surface, angle ) ) return clear[ bearing ] = false;
			for ( let k = along[ bearing ] ?? 0; k < reach.length; k ++ ) {

				if ( round.spread && ( cast >= OPEN_RAYS || ( cast && performance.now() > until ) ) ) {

					along[ bearing ] = k;
					return null;

				}

				cast ++;
				const distance = reach[ k ];
				const at = water.under( east + Math.sin( angle ) * distance, north + Math.cos( angle ) * distance, top + GROUND_RANGE[ 1 ], GROUND_RANGE[ 1 ] + SEA_DEPTH );
				if ( at === null || at.y > top || ( at.land && ! close ) ) return clear[ bearing ] = false;

			}

			return clear[ bearing ] = true;

		};
		// Beside another driver, whether nothing stands SKIM m over the surface between bearing i and the
		// next: FAN rays along between them, as along a bearing, cast once a look.
		const isOpen = i => {

			const gap = i % BEARINGS;
			for ( let j = 1; gaps[ gap ] === undefined && j <= FAN; j ++ ) if ( skims( east, north, surface, ( gap + j / ( FAN + 1 ) ) / BEARINGS * Math.PI * 2 ) ) gaps[ gap ] = false;
			return gaps[ gap ] ??= true;

		};
		while ( round.first < BEARINGS ) {

			// A bearing that isn't clear rules out every run through it: the next run starts past it.
			// And beside another driver, so does a gap between two that isn't, once all the run's are.
			let shut = - 1;
			for ( let i = round.first + OPEN - 1; i >= round.first && shut < 0; i -- ) {

				const known = isClear( i );
				if ( known === null ) return null;
				if ( ! known ) shut = i;

			}

			for ( let i = round.first + OPEN - 2; beside && i >= round.first && shut < 0; i -- ) if ( ! isOpen( i ) ) shut = i;
			if ( shut < 0 ) return true;
			round.first = shut + 1;

		}

		return false;

	}

	// Whether something stands SKIM m over the water's surface at `surface` (m, in the scene) along
	// the bearing `angle` (radians east of north) from ( east, north ) in the scene, within CLOSE m of
	// it: a ray along the bearing that high, level with the water there (see SKIM).
	function skims( east, north, surface, angle ) {

		const [ e, n ] = [ Math.sin( angle ), Math.cos( angle ) ];
		// (The water curves away from the scene's middle under its flat frame, as curve has it: so
		// the ray slopes as the water's surface does there, down away from the middle.)
		_skim.set( - e, - ( east * e + north * n ) / EARTH_RADIUS, n ).normalize();
		return ground.cast( enuToLocal( east, north, surface + SKIM, _skimFrom ), _skim, CLOSE ) !== null;

	}

	// Whether the ground round ( east, north ) in the scene, under the water's surface at `surface`
	// there (m, in the scene), is built up, as a city's streets under it are (see CLOSE): looked at
	// with the sea's own surface left out, so that ground missing there counts as closing it.
	function builtUp( east, north, surface ) {

		return underSea( () => ! opensOut( east, north, surface, null, true ) );

	}

	// Each frame while driving on the Earth with none of sea.js's water round the vehicle: every
	// SEA_EVERY s, whether the ground under it or ahead of it along its way is the bed of the sea or a
	// big lake, out past where Google draws the water's surface, and if so the surface laid there
	// (see SEA_MARGIN and OPEN); and while the look round the spot found isn't done, that carried on
	// in each frame instead (see OPEN_RAYS). The other worlds have no water.
	function watchSea( dt ) {

		if ( offEarth() || ! driver.active || sea.shown || ! state.place ) {

			seaWatch.spot = null;
			return;

		}

		seaWatch.in -= dt;
		// Till it's known whether the spot found is open to the water (or the vehicle's gone too far
		// down under that water for it), it's looked round and nothing else is looked at. Looks in the
		// meantime would find newer spots farther on, but those are the bed of the same water, some
		// metres along the way, and laid round the first the surface is the same one: sea.js lays it
		// kilometres round, and again round the vehicle as it goes. Then the next look, at once if
		// it's due.
		if ( seaWatch.spot?.open === null ) {

			lookRound();
			return;

		}

		if ( seaWatch.in > 0 ) return;
		seaWatch.in = SEA_EVERY;
		const d = driver;
		// Under it, and ahead along its way: forward, or back while it reverses.
		const rad = d.course * MathUtils.DEG2RAD;
		const way = d.speed < 0 ? - 1 : 1;
		for ( const ahead of [ 0, ...SEA_AHEAD.map( ( [ seconds, least ] ) => Math.max( Math.abs( d.speed ) * seconds, least ) * way ) ] ) {

			const east = d.east + Math.sin( rad ) * ahead;
			const north = d.north + Math.cos( rad ) * ahead;
			const bed = bedAt( east, north, d.y + 4 );
			// Not with the vehicle in a hollow or a polder under the water's height itself, where the
			// water would be over it; nor over ground coloured as dry land (its colour only now: a ray
			// more, and a tile's picture copied the first time).
			if ( ! bed || bed.height + d.y + curve( d.east, d.north ) < bed.level - SEA_MARGIN || water.land( east, north, bed.y + 1, 2 ) ) continue;
			// Last, and for this spot alone, as it can take dozens of rays: open to the water (a spot
			// found closed is looked round afresh, as Google's tiles may have come in round it since).
			seaWatch.spot = { bed, round: { clear: [], along: [], first: 0, spread: true }, open: null };
			lookRound();
			return;

		}

		seaWatch.spot = null;

	}

	// watchSea's look round its spot (seaWatch's), for this frame: the water's surface laid there once
	// it's known to be open to the water, with the vehicle still no lower than SEA_MARGIN under it (it
	// may have gone on down a bed in the frames since).
	function lookRound() {

		const spot = seaWatch.spot;
		const { bed } = spot;
		const d = driver;
		if ( bed.height + d.y + curve( d.east, d.north ) < bed.level - SEA_MARGIN ) {

			seaWatch.spot = null;
			return;

		}

		spot.open = opensOut( bed.east, bed.north, bed.surface, spot.round );
		if ( spot.open ) sea.start( bed );

	}

	// Whether the ground at ( east, north ) in the scene, looked for down from `from` (m, in the scene),
	// is deep enough under the water's surface there to be the bed of the sea or a big lake (see
	// SEA_MARGIN): sea.start's { lat, lon, height, over, lake, east, north } for that water, the scene
	// as it's centred, with { y } the ground's height and { surface } the water's (m, in the scene),
	// and { level } the water's over the ellipsoid; or null, as it is till the sea's height and the
	// map have come (asked for the first time the ground's low enough to need them). With `shallow`
	// (beside someone riding on the water's surface: see AT_SURFACE), a square a big lake's shore
	// crosses is that lake's water too (waterBy), and any of its ground more than SEA_MARGIN under it
	// is deep enough; only ground on the water's squares.
	function bedAt( east, north, from, shallow = false ) {

		const y = ground.heightBelow( east, north, from, SEA_DEPTH );
		if ( y === null ) return null;
		const place = state.place;
		const { lat, lon } = localToLatLon( enuToLocal( east, north, 0 ), place );
		// Nothing to ask while the ground's higher than any water can be there.
		if ( tiles && place.height + y + curve( east, north ) > HIGHEST_SEA + Math.max( 0, ...lakesNear( lat, lon ).map( lake => lake.height ) ) - SEA_MARGIN ) return null;
		if ( ! seaWatch.ready ) {

			askSea( lat, lon );
			return null;

		}

		// The scene's y = 0 over the ellipsoid: where it was centred; on the test pad, PAD_SEA m over
		// the water's height at the place.
		const base = tiles ? place.height : seaLevelNow( place.lat, place.lon ) + ( riseOf( waterAtNow( place.lat, place.lon ) ) ?? 0 ) + PAD_SEA;
		const at = shallow ? waterBy( lat, lon ) : waterAtNow( lat, lon );
		// How far over the sea's height the water is there: none on land (or without the map), where
		// only ground deeper than any land or lake bed is the sea's.
		const over = shallow ? at?.over ?? null : riseOf( at );
		const level = seaLevelNow( lat, lon ) + ( over ?? 0 );
		const bed = base + y + curve( east, north );
		if ( over === null ? shallow || bed >= LOWEST : bed >= level - ( ! shallow && at.kind === 'lake' ? BED : SEA_MARGIN ) ) return null;
		return { lat: place.lat, lon: place.lon, height: base, over: over ?? 0, lake: at?.lake ?? null, east, north, y, level, surface: level - base - curve( east, north ) };

	}

	// The sea's height and the map, for watchSea: asked for once a drop-in, with seaWatch.ready once
	// they've come (or failed to). A promise of that.
	function askSea( lat, lon ) {

		if ( ! seaWatch.asked ) {

			const asked = seaWatch.asked = Promise.all( [ seaLevel( lat, lon ), waterAt( lat, lon ) ] );
			asked.then( () => {

				if ( seaWatch.asked === asked ) seaWatch.ready = true;

			} );

		}

		return seaWatch.asked;

	}

	// Beside another driver whose car is at ( east, north, y ) in the scene (moveCar's): bedAt's
	// { ... } there, for sea.start, where they're out on the water's surface over its bed as watchSea
	// lays it, or in the air over it (see ALONGSIDE), so that it's laid there for you too; and with
	// `riding` (besideOf's: their car's own spot from there, [ east, north ] m, its wheels on
	// something), where they're riding on that water's surface (see AT_SURFACE); or null. (Asked only
	// with none of it round you here: with yours laid, see CLOSE.) The look for laying it afresh is
	// asked first, and where it lays it the ground isn't built up either (see CLOSE), so beside a
	// rider it comes to what the drop-in beside them does (waterBeside, which asks whether it's built
	// up first).
	function besideWater( east, north, y, riding = null ) {

		if ( offEarth() || ! state.place ) return null;
		const bed = bedAt( east, north, y + 4 );
		if ( bed && bed.height + y + curve( east, north ) >= bed.level - ALONGSIDE && ! water.land( east, north, bed.y + 1, 2 ) && opensOut( east, north, bed.surface ) ) return bed;
		const shallow = riding && bedAt( east, north, y + 4, true );
		return shallow && rides( east + riding[ 0 ], north + riding[ 1 ], y, shallow.surface ) && ! builtUp( east, north, shallow.surface ) ? shallow : null;

	}

	// What `look` finds with the sea's surface round the vehicle left out of the ground: the ground
	// itself under it (Google's tiles, or the test pad).
	function underSea( look ) {

		bare = true;
		try {

			return look();

		} finally {

			bare = false;

		}

	}

	// Wait for ground under the pin with the tiles done loading for a moment: { y } its height (m, in
	// the scene), or null if there's still none after `timeout` seconds, and whether the tiles had
	// settled (not still loading when the time ran out).
	async function settle( drop, top, depth, timeout ) {

		const begun = performance.now();
		let quiet = 0;
		let last = begun;
		for ( ;; ) {

			await frame();
			if ( drop.cancelled ) return { y: null, settled: false };
			const now = performance.now();
			const y = ground.heightAt( 0, 0, top, depth );
			// (On another world, its squares still to build.)
			const loading = offEarth() ? body().pending > 0 : !! tiles?.isLoading;
			quiet = y !== null && ! loading ? quiet + ( now - last ) / 1000 : 0;
			last = now;
			screens.setProgress( offEarth() ? body().progress : tiles ? tiles.loadProgress : 1 );
			if ( quiet >= SETTLE || now - begun > timeout * 1000 ) return { y, settled: quiet >= SETTLE };

		}

	}

	// A drop-in that can't go on: back to the globe, saying why, and counted as `problem` (none when
	// it's counted already) for the play stats.
	function noGround( message, problem = 'no_ground' ) {

		if ( problem ) stats.add( 'problem', problem );
		state.drop = null;
		removeVehicle();
		screens.hideLoading();
		screens.toast( message, 7000 );
		toGlobe( { fromHere: true } );

	}

	// --- driving, pausing, changing ride ---

	function drive() {

		setMode( 'driving' );
		// Another world's gravity, and no water there (which its grey or red dust would look like to
		// water.js); its boost pads by the Moon's rules (open ground, no roofs or banks), and the dust a
		// landing throws up its colour.
		const other = offEarth();
		driver.gravity = WORLDS[ world ].gravity ?? 1;
		driver.water = other ? null : water;
		water.none = other;
		pads.rules = other ? MOON_RULES : EARTH_RULES;
		driver.dust = other ? LOOKS[ world ].dust : null;
		driver.start( state.entry, specOf( state.vehicle ) );

	}

	// drive.js stopped driving (Esc or V, or the pause button): that's a pause here.
	function stopped() {

		// What was driven goes to the Worker as the drive pauses (or ends: toGlobe).
		progress.report();
		if ( state.leaving ) return;
		// A pause ends a challenge's run (challenges.js: none of it counts, and nothing can be had by it).
		challenges?.paused();
		setMode( 'paused' );
		screens.pause( true );
		// The rides scroll sideways there: the one being driven in view.
		$( 'pause' ).querySelector( '.vehicle.picked' )?.scrollIntoView( { block: 'nearest', inline: 'nearest' } );

	}

	function pauseDrive() {

		if ( driver.active ) driver.stop();

	}

	function resume() {

		if ( state.mode !== 'paused' || ! state.entry ) return;
		// (Driving on: a challenge's run the pause stopped is over for good.)
		challenges?.resumed();
		screens.pause( false );
		drive();

	}

	async function swapVehicle( vehicle ) {

		const old = state.entry;
		if ( ! old || state.mode !== 'paused' ) return;
		// (Another ride: a challenge's run is left.)
		challenges?.left();
		const { east, north, heading } = old.state;
		try {

			const entry = await loadVehicle( models, vehicle, { east, north, heading } );
			if ( state.entry !== old ) return models.remove( entry );
			models.remove( old );
			state.entry = entry;
			state.vehicle = vehicle;
			panel.setDriven( vehicle );
			live?.setRide( vehicle.id, lookOf( vehicle ) );
			resume();

		} catch ( err ) {

			screens.toast( `The ${ vehicle.name.toLowerCase() } didn't load: ${ err.message }` );

		}

	}

	function removeVehicle() {

		if ( state.entry ) models.remove( state.entry );
		state.entry = null;

	}

	// --- back to the globe ---

	function toGlobe( { fromHere = false } = {} ) {

		if ( state.mode === 'globe' && ! fromHere ) return;
		const was = carSpot();
		// A drop-in left before it was driving (noGround has ended its own, so isn't one).
		if ( state.mode === 'dropping' && state.drop ) stats.add( 'problem', 'drop_abandoned' );
		// What was driven goes to the Worker (or, before a nickname, is kept here).
		progress.report();
		challenges?.left();
		if ( state.drop ) state.drop.cancelled = true;
		state.drop = null;
		for ( const other of Object.values( bodies ) ) other.rush = false;
		panel.setDriven( null );
		state.leaving = true;
		if ( driver.active ) driver.stop();
		state.leaving = false;
		removeVehicle();
		pads.clear();
		sea.clear();
		screens.pause( false );
		screens.hideLoading();
		screens.hideKeys();
		globe.cancelFlight();
		setMode( 'globe' );
		live?.setAway();
		if ( was ) online?.left( was );
		// (Over where the scene's frame last followed the car to, on a small world: the car may have
		// driven a long way from where it dropped in.)
		const { lat, lon } = ( recentring() && origin ) || state.place || globe.pose();
		globe.flyTo( globe.orbit( lat, lon ) );

	}

	// --- driving with others ---

	// Where the car is ({ lat, lon }, on the world it's on), or null without one.
	function carSpot() {

		if ( ! state.entry || ! liveHere() ) return null;
		const { group, shape } = frameOf( world );
		group.updateWorldMatrix( true, false );
		state.entry.pivot.getWorldPosition( _p ).applyMatrix4( _inverse.copy( group.matrixWorld ).invert() );
		const spot = shape.getPositionToCartographic( _p, {} );
		return { lat: spot.lat * MathUtils.RAD2DEG, lon: spot.lon * MathUtils.RAD2DEG };

	}

	// A world's frame: its group, whose matrixWorld takes positions in it (Earth-centred, or the
	// other world's own, body-fixed) into the scene, and its shape (the Earth's for anything else).
	function frameOf( which ) {

		return which !== EARTH && bodies[ which ] ? { group: bodies[ which ].group, shape: bodies[ which ].ellipsoid } : { group: earth, shape: ellipsoid };

	}

	// A landed jump's points, for the others to see over your car.
	function landed( run ) {

		if ( state.entry !== runEntry ) {

			runEntry = state.entry;
			runScore = 0;

		}

		const gained = run.score - runScore;
		runScore = run.score;
		if ( gained >= 1 && liveHere() ) live?.trick( gained );

	}

	// Whether others in the room are driving on this page's world (not on the globe, and not a party
	// friend on another world): what levels count as together, and the play stats as with others.
	// (Nobody is while this world's rooms are closed today and a party's room is another world's.)
	function withOthers() {

		return !! live && liveHere() && live.world === world && [ ...live.players.values() ].some( p => ! p.away && p.world === world );

	}

	// What levels count each frame of driving (progress.js's drive).
	function driven() {

		const d = driver;
		return {
			speed: velocityOf( d, _velocity ).length(),
			air: ! d.grounded && ! d.flying,
			boost: d.boost,
			// (With others driving on this world, the Moon's too; another world's ground is none of the
			// Earth's areas or spots.)
			together: withOthers(),
			where: offEarth() ? nowhere : carWhere,
			vehicle: state.vehicle?.id ?? null,
		};

	}

	function nowhere() {

		return {};

	}

	// Where the car is: { lat, lon } (degrees).
	function carWhere() {

		if ( ! state.entry ) return {};
		earth.updateWorldMatrix( true, false );
		state.entry.pivot.getWorldPosition( _p ).applyMatrix4( _inverse.copy( earth.matrixWorld ).invert() );
		const at = {};
		ellipsoid.getPositionToCartographic( _p, at );
		return { lat: at.lat * MathUtils.RAD2DEG, lon: at.lon * MathUtils.RAD2DEG };

	}

	// The car, for live.js to send: where it is, how fast it's going and what it's doing.
	function car() {

		if ( ( state.mode !== 'driving' && state.mode !== 'paused' ) || ! state.entry || ! liveHere() ) return null;
		return { pivot: state.entry.pivot, velocity: velocityOf( driver, _velocity ), flags: flagsOf( driver, state.mode === 'paused' ) };

	}

	// To another driver (the list's "Go to", the party's "Join"): next to them, facing their way. In
	// this scene if they're near, straight there; anywhere else, a drop-in, in your own ride. Out on
	// the water's surface where Google draws the bed, on that surface with them (see ALONGSIDE).
	async function goTo( pid ) {

		const other = live.players.get( pid );
		if ( ! other || other.away ) return;
		await goBeside( other );

	}

	// goTo's, beside `other` (live.js's: { s } their car's last state, or { place } where they
	// dropped in). With your own water's surface laid, a drop-in beside them over that water has it
	// as this scene would, laid (`laid`: see CLOSE): a big lake's wherever you are, the sea's only
	// where it reaches them as it's laid now. And beside them riding on a surface of their own, the
	// drop-in lays it for you too (`riding`: see AT_SURFACE).
	async function goBeside( other ) {

		const spot = besideOf( other );
		if ( ! spot ) return;
		const theirs = isWorld( other.world ) ? other.world : EARTH;
		const laid = theirs === world && sea.active && ( sea.lake !== null || sea.reaches( - spot.local.x, spot.local.z ) ) ? { lake: sea.lake } : null;
		const beside = {
			name: other.place?.name || 'Dropped pin', lat: spot.lat, lon: spot.lon, height: spot.height, heading: spot.heading, beside: true, laid, riding: spot.riding,
			...( theirs !== EARTH ? { world: theirs } : {} ),
		};
		// On another world: there (the globe turned to it, loading it the first time, or from a page
		// with no Earth this visit the way boot.js has to it), and a drop-in beside them.
		if ( theirs !== world ) {

			if ( state.mode !== 'globe' ) toGlobe();
			dropIn( beside );
			return;

		}

		const here = () => ( state.mode === 'driving' || state.mode === 'paused' ) && !! state.entry;
		// On another world, near enough: straight there, on its ground under them (no water there). On
		// a small world whose frame follows the car (WORLDS' recentre), only within that of the scene's
		// middle, where its ground is sharp already; farther, a drop-in, which settles the ground.
		if ( offEarth() && here() && spot.local.length() < Math.min( GO_NEAR, WORLDS[ world ].recentre ?? Infinity ) ) {

			const y = ground.heightAt( spot.local.x, spot.local.z, spot.local.y + 3, 6 );
			if ( y !== null ) {

				challenges?.left();
				if ( placeCar( { east: - spot.local.x, north: spot.local.z, heading: spot.heading, up: y } ) ) return;

			}

		}

		if ( world === EARTH && here() && spot.local.length() < GO_NEAR ) {

			// (Whether they're out on the water, or over it however high, needs the sea's height and
			// the map, where the ground under them, under any of the sea laid here, is low enough to be
			// its bed: bedAt asks for them.)
			underSea( () => bedAt( - spot.local.x, spot.local.z, spot.local.y + 4 ) );
			if ( seaWatch.asked ) await seaWatch.asked;
			if ( here() && moveCar( spot ) ) return;

		}

		if ( state.mode !== 'globe' ) toGlobe();
		dropIn( beside );

	}

	// GO_BESIDE m to the right of another driver's car, from the last word of it (or where they
	// dropped in), level with it: { lat, lon, height, heading, local: in this scene }, and { riding }
	// where their car is from there ([ east, north ] m) while its wheels are on something (FLAGS'
	// grounded; where they dropped in, they started on it), else null.
	function besideOf( other ) {

		// (In their world's frame: the Earth's, or their other world's own. `local` is only of use on
		// that world.)
		const theirs = isWorld( other.world ) ? other.world : EARTH;
		const { group, shape: ellipsoid } = frameOf( theirs );
		group.updateWorldMatrix( true, false );
		if ( ! other.s ) {

			const { lat, lon, height } = other.place ?? {};
			if ( ! Number.isFinite( lat ) ) return null;
			ellipsoid.getCartographicToPosition( lat * MathUtils.DEG2RAD, lon * MathUtils.DEG2RAD, height, _p );
			return { lat, lon, height, heading: 0, local: _p.clone().applyMatrix4( group.matrixWorld ), riding: [ 0, 0 ] };

		}

		const [ x, y, z, qx, qy, qz, qw ] = other.s;
		const flags = other.s[ 10 ];
		_q.set( qx, qy, qz, qw );
		_p.set( x, y, z );
		const carto = {};
		ellipsoid.getPositionToCartographic( _p, carto );
		// Their heading, from the way they face along the ground there (east and north).
		const [ sinLat, cosLat, sinLon, cosLon ] = [ Math.sin( carto.lat ), Math.cos( carto.lat ), Math.sin( carto.lon ), Math.cos( carto.lon ) ];
		_ahead.set( 0, 0, - 1 ).applyQuaternion( _q );
		const east = - sinLon * _ahead.x + cosLon * _ahead.y;
		// (North along the ground: on a small world far from round, along its level there (level.js),
		// which a car on it is level with; the step beside them stays along the sphere's.)
		const level = levelled( theirs ) ? levelFrame( theirs, carto.lat * MathUtils.RAD2DEG, carto.lon * MathUtils.RAD2DEG ).north : null;
		const north = level ? level[ 0 ] * _ahead.x + level[ 1 ] * _ahead.y + level[ 2 ] * _ahead.z
			: - sinLat * cosLon * _ahead.x - sinLat * sinLon * _ahead.y + cosLat * _ahead.z;
		const turn = Math.atan2( east, north );
		const heading = MathUtils.euclideanModulo( turn * MathUtils.RAD2DEG, 360 );
		// To the right of that heading along the ground (east and north there), at their height: not
		// along their car's own side, which in a barrel roll points down (at the bed, under the water
		// they're over) or up.
		const [ right, ahead ] = [ Math.cos( turn ) * GO_BESIDE, - Math.sin( turn ) * GO_BESIDE ];
		_p.x += - sinLon * right - sinLat * cosLon * ahead;
		_p.y += cosLon * right - sinLat * sinLon * ahead;
		_p.z += cosLat * ahead;
		ellipsoid.getPositionToCartographic( _p, carto );
		const lat = carto.lat * MathUtils.RAD2DEG;
		const lon = carto.lon * MathUtils.RAD2DEG;
		// (Their car is as far back the other way: right and ahead are that step east and north.)
		return { lat, lon, height: carto.height, heading, local: _p.clone().applyMatrix4( group.matrixWorld ), riding: flags & FLAGS.grounded ? [ - right, - ahead ] : null };

	}

	// Your car to `spot` (besideOf's) in this scene, on the ground there (or the water: every ride
	// drives on it), driving on. Only ground within 3 m of their car's height, as R takes (not a
	// roof, a tree or a deck over them); false otherwise, or where there's no ground loaded there to
	// put it on, and it's a drop-in instead (which finds the street). Out on the water's surface where
	// Google draws the bed, or in the air over it, or riding on a surface of their own (`riding`:
	// besideOf's), with none of it laid here, it's laid there first (see ALONGSIDE and AT_SURFACE);
	// where it isn't (built up round them, or in a channel too narrow: see CLOSE), it's the ground
	// within 3 m of them as anywhere, so beside a rider over a bed less than about 3 m under them
	// you're put on that bed, under their water, and over a deeper one it's a drop-in, which starts
	// on the bed as a pin there would (less than BED under the water);
	// and with them higher over the water's surface laid here than that (a hop, a trick, flying), it's
	// on that surface under them, where nothing's between (not a bridge's deck), they're over that
	// water on the map (see waterBy: a big lake's shore's square too) and the ground under them isn't
	// built up (see CLOSE): not a city's streets under the water within the reach of a surface laid
	// before, which it would be over too.
	function moveCar( { local, heading, riding = null } ) {

		// (A look round a spot where the car was is no longer of any use.)
		seaWatch.spot = null;
		const out = sea.shown ? null : besideWater( - local.x, local.z, local.y, riding );
		if ( out ) sea.start( out );
		let y = ground.heightAt( local.x, local.z, local.y + 3, 6 );
		if ( y === null && sea.shown ) {

			const hit = ground.cast( _p.set( local.x, local.y + 3, local.z ), _side.set( 0, - 1, 0 ), SEA_DEPTH );
			const { lat, lon } = localToLatLon( enuToLocal( - local.x, local.z, 0 ), state.place );
			if ( hit?.object === sea.mesh && ( out || waterBy( lat, lon )?.lake === sea.lake && ! builtUp( - local.x, local.z, hit.point.y ) ) ) y = hit.point.y;

		}

		if ( y === null ) return false;
		// (Put somewhere else: a challenge's run is left.)
		challenges?.left();
		return placeCar( { east: - local.x, north: local.z, heading, up: y } );

	}

	// Your car put at `east`, `north` (m in this scene), `up` its height there, facing `heading`, at a
	// standstill, and driving on: Go to beside someone (moveCar), and a challenge's Retry back at its
	// start (challenges.js).
	function placeCar( { east, north, heading, up } ) {

		const { entry } = state;
		if ( ! entry ) return false;
		state.leaving = true;
		if ( driver.active ) driver.stop();
		state.leaving = false;
		Object.assign( entry.state, { east, north, heading, up } );
		entry.parked = null;
		// At that height: not snapped as a placed model is, from high above onto the first thing in
		// the way, which under a roof is the roof. (While it's driven, nothing snaps it.)
		const { snap } = entry.state;
		entry.state.snap = false;
		models.apply( entry );
		entry.state.snap = snap;
		screens.pause( false );
		drive();
		return true;

	}

	// --- input ---

	$( 'drive-ui' ).querySelector( '.to-globe' ).addEventListener( 'click', () => toGlobe() );
	$( 'drive-ui' ).querySelector( '.pause-open' ).addEventListener( 'click', pauseDrive );
	$( 'drive-ui' ).querySelector( '.keys-toggle' ).addEventListener( 'click', () => screens.toggleKeys() );
	$( 'pause' ).querySelector( '.resume' ).addEventListener( 'click', resume );
	$( 'pause' ).querySelector( '.to-globe' ).addEventListener( 'click', () => toGlobe() );
	$( 'loading' ).querySelector( '.cancel' ).addEventListener( 'click', () => toGlobe() );

	window.addEventListener( 'keydown', e => {

		// The leaderboard (or the challenges, or the orrery, or that coming up) over everything: its
		// own keys (Esc closes it; the orrery's M too).
		if ( board.isOpen || challenges?.isOpen || orreryOpening || orrery?.isOpen || isTyping( e ) || e.ctrlKey || e.metaKey || e.altKey || e.repeat ) return;
		// M: out a level, from driving to the globe, and from the globe to the orrery.
		if ( e.code === 'KeyM' && state.mode !== 'globe' ) toGlobe();
		else if ( e.code === 'KeyM' && ! garage.isOpen ) openOrrery();
		else if ( e.code === 'KeyH' && state.mode === 'driving' && friends ) friends.honk();
		else if ( state.mode === 'paused' && ( e.code === 'Escape' || e.code === 'Enter' ) ) {

			e.preventDefault();
			resume();

		} else if ( state.mode === 'dropping' && e.code === 'Escape' ) toGlobe();
		else if ( state.mode === 'globe' && e.code === 'Escape' && ! panel.closeResults() ) pinAt( null );
		else if ( state.mode === 'globe' && e.code === 'Slash' ) {

			e.preventDefault();
			panel.focusSearch();

		} else if ( state.mode === 'globe' && e.code === 'Enter' && panel.pinned && e.target === document.body ) dropIn( panel.pinned );

	} );

	// The wheel moves the chase camera while driving (GlobeControls has it on the globe).
	canvas.addEventListener( 'wheel', e => {

		if ( ! driver.active ) return;
		e.preventDefault();
		driver.zoomChase( MathUtils.clamp( e.deltaY / 100, - 3, 3 ) );

	}, { passive: false } );

	// Touch screens get the HUD's driving buttons (drive-hud.js), and no keys card.
	const coarse = window.matchMedia( '(pointer: coarse)' );
	const showTouch = on => document.body.classList.toggle( 'touch', on );
	showTouch( coarse.matches );
	window.addEventListener( 'touchstart', () => showTouch( true ), { once: true, passive: true } );

	window.addEventListener( 'resize', () => {

		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
		renderer.setSize( window.innerWidth, window.innerHeight );
		tiles?.setResolutionFromRenderer( camera, renderer );

	} );

	// --- Google's tiles going wrong ---

	let tileErrors = 0;
	function tileError( { tile, error } ) {

		const message = error?.message ?? 'unknown error';
		const refused = /error code 40[013]\b/.test( message );
		if ( ! tile ) {

			screens.notice( 'error', { message: `Google's 3D map didn't load (${ message }). Reload the page to try again.`, onRetry: () => window.location.reload() } );
			stats.once( 'problem', 'map_failed' );
			return;

		}

		// After a few hours the visit's Google session runs out; a new one is a new visit. (Each tile
		// refused says so: counted once.)
		if ( refused ) {

			screens.toast( 'This drive\'s map session has ended. Reload the page for a fresh one.', 15000 );
			stats.once( 'problem', 'map_session_ended' );
			return;

		}

		if ( ++ tileErrors >= 3 && tiles.visibleTiles.size === 0 ) screens.toast( `Google's 3D tiles are having trouble loading (${ message }).`, 8000 );

	}

	// --- every frame ---

	const timer = new Timer();
	timer.connect( document );
	// The field of view as eased toward the globe's or driving's (the camera's has a jolt on top).
	const view = { fov: camera.fov };
	let slow = 0;
	const carto = {};
	const sky = new Color();
	renderer.setAnimationLoop( time => {

		timer.update( time );
		const dt = Math.min( timer.getDelta(), 0.1 );
		// On a small world, the scene's frame to the car first, if it's driven far enough from its
		// middle (follow).
		follow();
		if ( driver.active ) driver.update( dt );
		// A challenge's run: its clock (the same steps the car was driven by), its gates and its HUD; and
		// the challenges' word to a visit driving a while.
		challenges?.frame( dt );
		challengeNudge( dt );
		// The underglow fades as the ground falls away (a jump, flying) and comes back on it.
		if ( state.entry ) liftGlow( state.entry.pivot, flagsOf( driver, state.mode === 'paused' ), dt );
		screenFx.update( dt, state.mode === 'driving' || state.mode === 'paused' );
		// The open sea's surface stays round the vehicle; and driven out from a coast onto Google's
		// bed of the sea, it's laid there.
		if ( driver.active ) sea.follow( driver.east, driver.north, driver.y );
		watchSea( dt );
		if ( state.mode === 'driving' && driver.active ) {

			progress.drive( dt, driven() );
			// Play time by ride and world, with others or not, and the funnel's minutes driven.
			stats.drove( state.vehicle.id, world, dt, withOthers() );

		}

		live?.update( car() );
		pads.update( dt );
		globe.update( dt );

		// How high the camera is (over the world it's on) decides the sky, the field of view and, while
		// driving, clipping. The other worlds' stars are turned with them; the Moon has no sky over
		// them, and Mars its own, fading out on the way up (bodySky). Over the place dropped in at; on a
		// small world, whose ground goes tens of kilometres up and down from one place to the next, over
		// the ground under the camera (else, driven 20 km up a Vesta scarp, the near plane would be 20 m
		// out, cutting the car off).
		camera.updateMatrixWorld();
		_p.copy( camera.position ).applyMatrix4( _inverse.copy( globe.earth.matrixWorld ).invert() );
		globe.ellipsoid.getPositionToCartographic( _p, carto );
		const under = recentring() ? body().heightAt( carto.lat * MathUtils.RAD2DEG, carto.lon * MathUtils.RAD2DEG ) : null;
		const altitude = carto.height - ( under ?? state.place?.height ?? 0 );
		if ( offEarth() ) {

			scene.background = body().stars;
			scene.backgroundRotation.setFromQuaternion( body().group.quaternion );
			bodySky( altitude );

		} else {

			const space = MathUtils.smoothstep( altitude, ...SKY_BELOW );
			scene.background = space < 1 ? sky.lerpColors( SKY, SPACE, space ) : null;

		}

		if ( testEarth ) testEarth.visible = ! offEarth() && ( state.mode === 'globe' || altitude > 20000 );
		const driving = state.mode === 'driving' || state.mode === 'paused';
		const fov = driving ? DRIVE_FOV + SUPERSONIC_FOV * driver.warp : GLOBE_FOV;
		if ( Math.abs( view.fov - fov ) > 0.01 ) view.fov += ( fov - view.fov ) * Math.min( 1, dt * 3 );
		// A jolt's punch on top, at once rather than eased in.
		const punched = view.fov + ( driving ? driver.punch : 0 );
		if ( Math.abs( camera.fov - punched ) > 1e-3 ) {

			camera.fov = punched;
			camera.updateProjectionMatrix();

		}

		// (And while dropping in on another world, whose heights over its sphere go up to 10 km on the
		// Moon and 21 on Mars: a flight clips by the height over that, which so high leaves the near
		// plane metres out, cutting into the ground in front of the camera as it comes down to it.)
		if ( state.mode === 'driving' || state.mode === 'paused' || ( state.mode === 'dropping' && offEarth() ) ) globe.clip( altitude );

		camera.updateMatrixWorld();
		// On another world, Google's tiles are left as they are (none load under the hidden Earth),
		// and its ground is made sharp round the camera and the vehicle.
		if ( offEarth() ) {

			body().update( camera, state.entry ? state.entry.pivot.getWorldPosition( _focus ) : null );
			bodyLight( dt );

		} else tiles?.update();
		models.update( dt );
		ghosts?.update( dt, liveHere() && ( state.mode === 'driving' || state.mode === 'paused' ) );
		online?.update();
		// Not while the Garage is open: its turntable draws instead, and on a phone it covers the
		// screen, so drawing the world behind it as well would only halve the frame rate. While the
		// orrery's open, it draws in the world's place (into this canvas, under its dialog), and only
		// when something there has changed.
		if ( orrery?.isOpen ) orrery.render( dt );
		else {

			if ( ! garage.isOpen ) renderer.render( scene, camera );
			globe.capture();

		}

		slow -= dt;
		if ( slow <= 0 ) {

			slow = 0.25;
			updateAttribution();

		}

	} );

	// Another world's sun: over the viewer's shoulder on the globe, so the side in view is lit, and
	// fixed in the scene while dropping in and driving (SUNS), easing from one to the other; on the
	// ground (body.js) and the vehicles alike. What hangs in its sky with it, off the globe (the Earth
	// over the Moon, Phobos over Mars).
	const bodySun = SUNS[ MOON ].clone();
	function bodyLight( dt ) {

		const here = body();
		if ( state.mode === 'globe' ) globeSun( _sun );
		else _sun.copy( SUNS[ world ] );
		bodySun.lerp( _sun, Math.min( 1, dt * 1.5 ) ).normalize();
		here.setSun( bodySun );
		lights.sun.position.copy( bodySun ).multiplyScalar( 1000 );
		if ( ! here.inSky ) return;
		here.inSky.visible = state.mode !== 'globe';
		if ( here.inSky.visible ) here.placeInSky( camera, camera.far * 0.6, state.place?.lat ?? 0 );

	}

	// A world with air's own sky (Mars's), and the haze on its ground: all of it near the ground,
	// fading out between the heights its look says on the way up (none on the globe), round the
	// camera, over the stars.
	function bodySky( altitude ) {

		const { sky } = body().look;
		const day = sky && state.mode !== 'globe' ? 1 - MathUtils.smoothstep( altitude, ...sky.below ) : 0;
		_up.set( 0, 1, 0 );
		body().placeSky( camera, _up, day );

	}

	// The sun on another world's globe: from space, over the viewer's left shoulder (the side in view
	// lit, as a Moon nearly full); coming down to the ground, low across it from the left and ahead (30° up),
	// as head-on light would show none of its craters.
	const _up = new Vector3();
	const _left = new Vector3();
	function globeSun( target ) {

		const high = MathUtils.smoothstep( globe.altitude(), 40000, 400000 );
		target.set( - 0.45, 0.55, 0.7 ).transformDirection( camera.matrixWorld );
		if ( high >= 1 ) return target;
		_up.setFromMatrixPosition( camera.matrixWorld ).sub( _p.setFromMatrixPosition( body().group.matrixWorld ) ).normalize();
		_left.set( - 1, 0, - 0.6 ).transformDirection( camera.matrixWorld ).addScaledVector( _up, - _left.dot( _up ) ).normalize();
		_left.multiplyScalar( Math.cos( 30 * MathUtils.DEG2RAD ) ).addScaledVector( _up, Math.sin( 30 * MathUtils.DEG2RAD ) );
		return target.lerp( _left, 1 - high ).normalize();

	}

	// The lights for the world: the Earth's as addLights made them, or another world's (its look's):
	// the Moon's harsh sun and dark sky, Mars's softer sun and dusty sky.
	function lightFor() {

		for ( const other of Object.values( bodies ) ) {

			if ( other.inSky ) other.inSky.visible = false;
			if ( other.sky ) other.sky.visible = false;

		}

		if ( offEarth() ) {

			const { sun, sky, colours } = LOOKS[ world ].lights;
			lights.sun.intensity = sun;
			lights.hemisphere.intensity = sky;
			lights.hemisphere.color.set( colours?.[ 0 ] ?? earthLight.colours[ 0 ] );
			lights.hemisphere.groundColor.set( colours?.[ 1 ] ?? earthLight.colours[ 1 ] );
			if ( state.mode === 'globe' ) globeSun( bodySun );

		} else {

			lights.sun.position.copy( earthLight.sun );
			lights.sun.intensity = earthLight.intensity;
			lights.hemisphere.intensity = earthLight.sky;
			lights.hemisphere.color.copy( earthLight.colours[ 0 ] );
			lights.hemisphere.groundColor.copy( earthLight.colours[ 1 ] );

		}

	}

	// Google's terms: the Google Maps logo and the data providers whenever the tiles are on screen;
	// on another world, NASA's credit for its maps instead (each world's own: #moon-credit,
	// #mars-credit).
	function updateAttribution() {

		for ( const id of OFF_EARTH ) $( `${ id }-credit` ).hidden = world !== id;
		const root = $( 'attribution' );
		root.hidden = offEarth() || ! tiles || tiles.visibleTiles.size === 0;
		if ( root.hidden ) return;
		root.querySelector( '.credits' ).textContent = tiles.getAttributions()
			.filter( a => a.type === 'string' && a.value )
			.map( a => a.value )
			.join( ' · ' );

	}

	// For poking around from the browser console, and for the tests.
	window.drive = {
		scene, camera, renderer, tiles, globe, models, driver, ground, panel, leaderboard: board,
		garage, supporter, pads, water, sea, live, ghosts, friends, online, progress, profile, screenFx, stats,
		get mode() {

			return state.mode;

		},
		get place() {

			return state.place;

		},
		// Where the scene's frame is now (see origin), how many times it has followed the car on a small
		// world, and how far the car goes there before it does (see shiftTo).
		get origin() {

			return origin;

		},
		get recentres() {

			return recentres;

		},
		get recentring() {

			return recentring();

		},
		get entry() {

			return state.entry;

		},
		get world() {

			return world;

		},
		get challenges() {

			return challenges;

		},
		openChallenges, openAchievements,
		// The orrery: open() (resolves whether it opened), close() and whether it's open.
		orrery: {
			open: () => openOrrery(),
			close: () => orrery?.isOpen && orrery.close(),
			get isOpen() {

				return !! orrery?.isOpen;

			},
		},
		// The achievements' notices waiting to be shown (a challenge's run holds them).
		get notices() {

			return notices.map( notice => notice.text );

		},
		moon, bodies, setWorld,
		// The world being driven's ground (body.js), or null on the Earth.
		get body() {

			return body();

		},
		dropIn, toGlobe, resume, recentre, shiftTo, waterOver, watchSea, moveCar, besideOf, goBeside,
		where: () => formatLatLon( carto.lat * MathUtils.RAD2DEG, carto.lon * MathUtils.RAD2DEG ),
	};
	// The same, for boot.js (which world the globe is on, once it's up).
	return window.drive;

}
