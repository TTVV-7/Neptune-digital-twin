import { Color, MathUtils, Matrix4, PerspectiveCamera, Quaternion, Scene, Timer, Vector3, WebGLRenderer } from 'three';
import { addLights, createGoogleTiles, createPlaceholderGround, recentreTiles } from '../world.js';
import { ModelManager } from '../models.js';
import { Driver } from '../drive.js';
import { isTyping } from '../walk.js';
import { useFastRaycast } from '../raycast.js';
import { enuToLocal, localToLatLon } from '../geo.js';
import { createDriveHud } from '../drive-hud.js';
import { GlobeView } from './globe.js';
import { Ground } from './spawn.js';
import { createTestGlobe, placeEarth } from './test-globe.js';
import { createMoon, MOON_ELLIPSOID, MOON_RADIUS } from './moon.js';
import { MOON } from './moon-places.js';
import { loadVehicle, loadVehicles, lookOf, specOf } from './vehicles.js';
import { setUpPanel } from './panel.js';
import { setUpGarage } from './garage.js';
import { createBoostPads, EARTH_RULES, MOON_RULES } from './pads.js';
import { createScreenFx } from './screen-fx.js';
import { createWater } from './water.js';
import { createSea, lakesNear, seaLevel, seaLevelNow, waterAt, waterAtNow } from './sea.js';
import { setUpLeaderboard } from './leaderboard.js';
import { buyArea, onPassOpen } from './pass.js';
import { fillAccountArea, fillBuyArea, linkPlayer, onLinked, setUpSupporter } from './supporter.js';
import { onProChange } from './pro.js';
import { applyLook } from './paint.js';
import { liftGlow } from './underglow.js';
import { createProgress, onLevelChange } from './progress.js';
import { setUpProfile } from './profile.js';
import { formatLatLon, LINK_PARAMS, linkedPlace, rememberPlace, worldOf } from './places.js';
import { createLive, flagsOf, velocityOf } from './live.js';
import { createStats } from './stats.js';
import { METRICS, dropinBucket } from './stats-protocol.js';
import { createGhosts } from './ghosts.js';
import { BUDGET_TOAST, setUpFriends } from './friends.js';
import { createOnline } from './online.js';
import { BUDGET_SPENT, cleanPartyCode } from './live-protocol.js';
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
// Worlds: the Earth (Google's tiles) and the Moon (moon.js), picked on the globe's panel. On the Moon
// the globe is the Moon's, what's driven on is its ground, gravity is the Moon's and there's no water;
// and you drive on your own: nothing is sent to the room of who's driving (it's as if you were on the
// globe), and the others' ghosts aren't drawn.

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
// after another (of BEARINGS round it: OPEN spans a quarter of the way round) on which nothing at any
// of OPEN_AT's distances (m) stands more than RISE m over the water's surface, nor is coloured as
// only dry land is, nor is missing (rays down from far over it, as for walled; a picture that can't
// be read is taken for land). On a straight coast the beach, a promenade and the houses behind it
// close at most the seven bearings on the land's side, and nine are open; beside a pier as well, five
// or more. Among houses any of a bearing's six rays that hits a roof or a tree closes it: on the test
// pad's streets (scripts/test-drive-ui.mjs) no more than two side by side were open, down a street,
// where with only RIM's three rays each five were at some spots. (Ground under the sea open and not
// coloured as land 150 m round on a quarter of the way, a wide car park behind a levee, still isn't
// told from the bed.) It's looked at only for ground that's passed everything else, for one spot a
// look at most, and only as far as it needs: a bearing that isn't clear rules out every run of OPEN
// through it.
const OPEN = 5;
const OPEN_AT = [ 25, 50, 75, 100, 125, 150 ];
const RISE = 1;
// Beside another driver out on the water's surface where Google draws the bed (laid by their
// watchSea), Go to or Join puts you on that surface with them, not on the bed under them: where
// their height is within ALONGSIDE m of the water's surface there (the sea's, on the sea or a coast,
// or a big lake's, in a square all of which is the lake) and the ground under them is the bed as
// watchSea has it (more than SEA_MARGIN, or a lake's BED, under that surface, not coloured as dry
// land and open to the water round it), it's laid there, as watchSea would lay it.
const ALONGSIDE = 1;
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
// The Moon: its gravity as a share of the Earth's (1.62 m/s²); where its globe first shows it (by the
// Apollo sites, on the side facing the Earth); the heights its ground can be at (m over its sphere:
// Antoniadi crater's floor is 9.1 km down, the Selenean summit 10.8 km up, and made-up craters go a
// little further); and its sun while driving, from the south-west, 20° up, so every crater rim and
// rock has its light and shade. On its globe the sun is over the viewer's left shoulder instead, so
// the side in view is lit. Its sunlight and the light from its sky (the Earth's light, and none from
// a sky of its own) on the vehicles.
const MOON_GRAVITY = 1.62 / 9.81;
const MOON_FIRST = { lat: 12, lon: 18 };
const MOON_HEIGHTS = { lowest: - 12000, highest: 12000 };
const MOON_SUN = enuToLocal( - 0.7, - 0.62, 0.34 ).normalize();
const MOON_LIGHT = { sun: 3, sky: 0.3 };
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

const $ = id => document.getElementById( id );
const frame = () => new Promise( resolve => requestAnimationFrame( resolve ) );
// How far (m) the Earth curves away under the scene's flat frame ( east, north ) m from its middle.
const curve = ( east, north ) => ( east * east + north * north ) / ( 2 * EARTH_RADIUS );
// How far over the sea's height the water is where sea.js's waterAt says `at`: a big lake's height
// in a square all of which is the lake, 0 on the sea or a coast, and null on land or without the map.
const riseOf = at => at?.kind === 'lake' ? at.lake.height : at?.kind === 'sea' || at?.kind === 'coast' ? 0 : null;
const _p = new Vector3();
const _inverse = new Matrix4();
const _q = new Quaternion();
const _side = new Vector3();
const _ahead = new Vector3();
const _velocity = new Vector3();
const _focus = new Vector3();
const _sun = new Vector3();

// key: the Maps key (none: the test globe and pad); left: free drives left today; visit: the
// visit's token, for posting scores; worker: whether there's a Worker (not on the dev server alone);
// googleClientId: the sign-in button's, for the Supporter Pass ('' when there's no signing in);
// live: whether the Worker has driving with others on (its /api/config says), and liveReason why
// not when it's off for the rest of the day.
export async function start( { key, left = null, visit: token = null, worker = true, googleClientId = '', live: liveOn = false, liveReason = '' } ) {

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
	const earthLight = { sun: lights.sun.position.clone(), intensity: lights.sun.intensity, sky: lights.hemisphere.intensity };
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
		// On worlddrive.app there's always a Worker, so none answering means its settings didn't
		// come (or a crawler kept off /api/ by robots.txt): a word for a visitor, not the developer's.
		screens.toast( ! worker && location.hostname === 'worlddrive.app'
			? 'Couldn\'t reach World Drive\'s server, so this is only a preview globe. Reload the page to drive on the 3D map.'
			: 'No Google 3D tiles here: a test globe, and a flat test pad wherever you drop in.', 6000 );

	}

	// What's driven on: Google's tiles (or the test pad), and out at sea the sea's own surface.
	const sea = createSea( { scene } );
	// Out from a coast (watchSea): when the ground's next looked at, and whether the sea's height and
	// the map have been asked for since the drop-in, and have come (or failed to).
	const seaWatch = { in: 0, asked: false, ready: false };
	// And on the Moon, its ground (moon.js), shown when it's picked. Which world it is: 'earth' or
	// 'moon'.
	const moon = createMoon();
	moon.group.visible = false;
	scene.add( moon.group, moon.earth );
	let world = 'earth';
	const onMoon = () => world === MOON;
	// Where the globe was looking on each world when it last left it, and a turn to the Moon waiting
	// for it to load (setWorld).
	const lastLook = { earth: null, moon: null };
	let switching = null;
	const grounds = () => onMoon() ? [ moon.terrain ] : sea.shown ? [ tiles ? tiles.group : pad, sea.mesh ] : [ tiles ? tiles.group : pad ];
	const globe = new GlobeView( { camera, canvas, earth, surface: earth, ellipsoid, pin: $( 'pin' ) } );
	scene.add( globe.air );
	// The globe as each world has it (GlobeView.setBody).
	const earthBody = { earth, surface: earth, ellipsoid };
	const moonBody = { earth: moon.group, surface: moon.terrain, ellipsoid: MOON_ELLIPSOID, radius: MOON_RADIUS, air: false, ...MOON_HEIGHTS, heightAt: ( lat, lon ) => moon.heightAt( lat, lon ) };
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
	// Boost pads on the ground as you drive (pads.js), never on water, with their switch in the
	// pause menu.
	const pads = createBoostPads( { scene, driver, ground, water, toggle: $( 'pause' ).querySelector( '.pads-toggle' ), onPad: () => progress.pad() } );

	const panel = setUpPanel( {
		root: $( 'globe-ui' ),
		vehicles,
		flyTo: place => flyToPlace( place ),
		onDrive: place => dropIn( place ),
		onClearPin: () => pinAt( null ),
		onWorld: world => setWorld( world ),
		// (Its kind only, for the play stats: never what was typed.)
		onSearch: kind => stats.add( 'search', kind ),
	} );
	panel.vehiclePicker( $( 'pause' ).querySelector( '.vehicles' ), vehicle => swapVehicle( vehicle ) );
	globe.onPick = place => {

		stayPut();
		pinAt( { ...place, name: 'Dropped pin', region: '', ...onMoon() ? { world: MOON } : {} } );
		stats.once( 'funnel', 'pin' );

	};
	// The Garage and the Supporter Pass, by both ride pickers (garage.js, pass.js).
	const garage = setUpGarage( {
		vehicles, panel, models, current: () => state.entry && { entry: state.entry, vehicle: state.vehicle },
		onLook: () => live?.setRide( state.vehicle.id, lookOf( state.vehicle ) ),
		onOpen: () => stats.add( 'garage_open', 'all' ),
		onEdit: part => stats.add( 'garage_edit', part ),
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
	} );
	// The look on the ride being driven, with what's unlocked now (a level can lock nothing, but a
	// look chosen on a test page waits for its level).
	onLevelChange( () => {

		if ( ! state.entry ) return;
		applyLook( state.entry.pivot, lookOf( state.vehicle ), state.vehicle );
		live?.setRide( state.vehicle.id, lookOf( state.vehicle ) );

	} );
	// Linked to an account (whose players' XP counts together), or the pass bought (+50% XP): where
	// the player stands now.
	onLinked( () => progress.refresh() );
	onProChange( () => progress.refresh() );
	for ( const button of document.querySelectorAll( '.board-open' ) ) {

		button.hidden = ! worker;
		button.addEventListener( 'click', () => board.open() );

	}

	// Buying the Supporter Pass in its sheet, and signing in for it there and in the pause menu
	// (supporter.js). Without sign-in set up the sheet just says "Coming soon". Its sheet opened, and
	// Buy followed to Stripe, are counted for the play stats.
	const supporter = setUpSupporter( { worker, googleClientId, player: () => board.player, onBuy: () => stats.add( 'pass', 'buy' ) } );
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
	// The places under the panel's words, the Earth's and the Moon's, link to their pages (for
	// crawlers, and to open in a new tab), but a plain tap there flies the globe to the place, as a
	// start spot does (a Moon place's turns the globe to the Moon first): leaving the page would end
	// this visit, and its Drive here would spend another.
	$( 'globe-ui' ).querySelector( '.site-info' ).addEventListener( 'click', event => {

		const link = event.target.closest( 'a[data-play]' );
		if ( ! link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ) return;
		const place = linkedPlace( new URL( link.dataset.play, location.href ).search );
		if ( ! place ) return;
		event.preventDefault();
		if ( state.mode === 'globe' ) flyToPlace( place );

	} );
	if ( left !== null && left <= 2 ) screens.toast( left === 0 ? 'This is your last free drive today.' : `${ left } more free drive${ left === 1 ? '' : 's' } today after this one.` );

	// Driving with others (live.js, ghosts.js, friends.js): only when the Worker has it on and this
	// visit has a token to show the room. Without it, nothing of it is made. When the Worker couldn't
	// say ('unknown': DriveLimits didn't answer, as for a few minutes after a deploy while it still
	// runs its old code) it's made anyway: turned away at the door, it tries again as a dropped
	// connection does, so the visit isn't left without it for hours over a moment's hiccup.
	const liveVisit = LIVE_TEST?.visit ?? visit;
	const live = ( liveOn || liveReason === 'unknown' ) && typeof liveVisit === 'string' && liveVisit
		? createLive( { earth, ellipsoid, visit: liveVisit, player: () => board.player, ride: { vehicle: panel.vehicle.id, look: lookOf( panel.vehicle ) } } )
		: null;
	const ghosts = live && createGhosts( { scene, earth, camera, vehicles, loader: models.loader, live, tags: $( 'live-tags' ), own: () => state.entry?.pivot ?? null, effects: driver.effects } );
	// (On the Moon, they're told it's the Moon's: nothing of who's driving is for there.)
	const liveMode = () => onMoon() ? MOON : state.mode;
	const friends = live && setUpFriends( { live, ghosts, vehicles, mode: liveMode, goTo, onInvite: () => stats.add( 'party', 'made' ) } );
	// Where people are driving now, on the globe (online.js): with driving with others, and nothing
	// of it without.
	const globeUi = $( 'globe-ui' );
	const online = live && createOnline( {
		camera, earth, ellipsoid, canvas, live, panel, mode: liveMode, onPick: flyToPlace, onZoom: zoomTo,
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

	}
	else if ( partyCode && liveReason === BUDGET_SPENT ) screens.toast( BUDGET_TOAST, 10000 );
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
		const middle = ( top + sheet.top - PIN_CARD ) / 2;
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
	// On the Moon it says so ("Tycho crater (Moon)", "Moon, 43.31° S, 11.36° W"), so it's never the
	// board of the place on the Earth with the same name or at the same latitude and longitude.
	function placeLabel( place ) {

		if ( ! place ) return null;
		const moonly = worldOf( place ) === MOON;
		const pin = place.name === 'Dropped pin';
		let name = pin ? formatLatLon( place.lat, place.lon ).replace( /(\.\d\d)\d+/g, '$1' ) : place.name;
		if ( moonly ) name = pin ? `Moon, ${ name }` : `${ name } (Moon)`;
		const clean = text => [ ...String( text ).replace( /[–—]/g, '-' ).replace( PLACE_TEXT, ' ' ).replace( /\s+/g, ' ' ).trim() ].slice( 0, PLACE_LENGTH ).join( '' ).trim();
		return clean( name ) || clean( `${ moonly ? 'Moon, ' : '' }${ formatLatLon( place.lat, place.lon ) }` );

	}

	function setMode( mode ) {

		state.mode = mode;
		document.body.dataset.mode = mode;
		// A level-up waiting shows as the drive starts, and one showing goes as it pauses or ends.
		if ( mode === 'driving' ) profile.driving();
		else profile.hideLevelUp();
		globe.setEnabled( mode === 'globe' );
		$( 'globe-ui' ).hidden = mode !== 'globe';
		$( 'drive-ui' ).hidden = mode !== 'driving' && mode !== 'paused';
		if ( pad ) pad.visible = mode !== 'globe' && ! onMoon();

	}

	setMode( 'globe' );
	// How long from asking for the page to the globe, from where, and on what (the funnel's first step).
	stats.loaded( performance.now() );

	// A place's link (?spot= or ?at=, its "Drive here" on the places' pages, drive/site/): the
	// globe flies there and pins it, so Drive here is one more tap; it never drops in by itself.
	// Only once the panel shows (the pin is lifted clear of it), and on Google's tiles once their
	// root has arrived, as that moves the Earth under the camera. Then it's out of the address (a
	// ?party= stays), so a reload doesn't fly there again; not before, so the reload the root's
	// error screen asks for still goes there.
	const linked = linkedPlace( location.search );
	if ( linked ) {

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

		if ( tiles && ! tiles.root && worldOf( linked ) !== MOON ) tiles.addEventListener( 'load-root-tileset', flyToLinked );
		else flyToLinked();

	}

	// --- moving the scene to a new place, without loading anything again ---

	function recentre( place ) {

		globe.capture();
		if ( onMoon() ) placeEarth( moon.group, MOON_ELLIPSOID, place );
		else if ( tiles ) recentreTiles( tiles, place );
		else placeEarth( earth, ellipsoid, place );
		globe.restore();

	}

	// --- the Earth or the Moon ---

	// Turn the globe to the Earth or the Moon (only from the globe), the first time to the Moon once
	// it has loaded. `at`: a place to look at there (else where it was looking when it left). Resolves
	// true once it's turned, false if it didn't (the Moon didn't load, or another turn took over).
	async function setWorld( next, { at = null } = {} ) {

		if ( state.mode !== 'globe' ) return false;
		if ( next === world ) {

			switching = null;
			panel.setWorld( world );
			return true;

		}

		const ticket = switching = {};
		if ( next === MOON && ! moon.ready ) {

			panel.setWorld( world, { busy: MOON } );
			try {

				await moon.load();

			} catch ( err ) {

				if ( switching === ticket ) {

					switching = null;
					panel.setWorld( world );
					screens.toast( `The Moon didn't load (${ err.message }). Try again in a moment.`, 7000 );
					stats.add( 'problem', 'moon_failed' );

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
		world = next;
		const moonly = onMoon();
		if ( moonly ) stats.add( 'world', MOON );
		moon.group.visible = moonly;
		earth.visible = ! moonly;
		pinAt( null );
		globe.setBody( moonly ? moonBody : earthBody );
		panel.setWorld( world );
		const look = at ?? lastLook[ world ] ?? ( moonly ? MOON_FIRST : home );
		// The Moon's frame on the place looked at, as the Earth's is on the last place driven.
		if ( moonly ) placeEarth( moon.group, MOON_ELLIPSOID, { lat: look.lat, lon: look.lon, height: 0 } );
		// In from further out, as if arriving (and the light by where the camera now is).
		const orbit = globe.orbit( look.lat, look.lon );
		globe.place( { ...orbit, distance: orbit.distance * 2.4 } );
		globe.capture();
		lightFor();
		if ( ! at ) globe.flyTo( orbit, { duration: 2.2 } );
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
		// (A place on the other world: Join, from the Moon, to someone driving on the Earth.)
		if ( worldOf( place ) !== world && ! await setWorld( worldOf( place ) ) ) return;
		stayPut();
		stats.once( 'funnel', 'dropin' );
		if ( onMoon() ) return dropInMoon( place, began );
		const drop = state.drop = { cancelled: false, began };
		const gone = () => drop.cancelled || state.drop !== drop;
		let { lat, lon } = place;
		state.place = place;
		rememberPlace( place );
		panel.refreshRecent();
		pinAt( null );
		pads.clear();
		sea.clear();
		Object.assign( seaWatch, { in: 0, asked: false, ready: false } );
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
		// out on that surface over a shallower bed (see ALONGSIDE), on it with them.
		const floor = y === null ? null : estimate + y;
		const water = floor !== null && settled ? await waterOver( lat, lon, floor, y ) ?? ( place.beside ? await waterBeside( lat, lon, place.height, floor, y ) : null ) : null;
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

	// On the Moon: no tiles to wait for, no sea and no streets. Its ground's height is known before
	// any of it is built (moon-height.js), so the scene is centred on the ground at the pin at once;
	// then the squares round it are built on the way down (moon.js, faster while the loading screen is
	// up). Facing the way with the most open ground (ground.heading), and you're off.
	async function dropInMoon( place, began ) {

		const drop = state.drop = { cancelled: false, began };
		const gone = () => drop.cancelled || state.drop !== drop;
		const { lat, lon } = place;
		state.place = place;
		rememberPlace( place );
		panel.refreshRecent();
		pinAt( null );
		pads.clear();
		sea.clear();
		setMode( 'dropping' );
		$( 'drive-ui' ).querySelector( '.place' ).textContent = place.name;
		screens.loading( `Dropping in: ${ place.name }` );
		const height = moon.heightAt( lat, lon ) ?? 0;
		recentre( { lat, lon, height } );
		state.place = { ...place, height };
		removeVehicle();
		const vehicle = panel.vehicle;
		const vehicleLoading = loadVehicle( models, vehicle ).then( entry => {

			entry.pivot.visible = false;
			return entry;

		} );
		vehicleLoading.catch( () => {} );
		moon.rush = true;
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

				noGround( 'The Moon\'s ground didn\'t load here. Try again, or somewhere else.' );
				return;

			}

			await arrive( drop, vehicle, vehicleLoading, heading );

		} finally {

			// (Unless a newer drop-in has it now.)
			if ( ! state.drop || state.drop === drop ) moon.rush = false;

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
		progress.dropped();
		drive();
		stats.add( 'dropin', onMoon() ? MOON : METRICS.dropin.key( state.place?.id ) ?? 'other' );
		stats.add( 'ride', vehicle.id );
		stats.add( 'dropin_time', dropinBucket( performance.now() - drop.began ) );
		stats.once( 'funnel', 'driving' );
		live?.setRide( vehicle.id, lookOf( vehicle ) );
		// On the Moon nobody's told where you are: you're on the globe as far as they know.
		if ( onMoon() ) live?.setAway();
		else live?.setPlace( { name: placeLabel( state.place ), lat: state.place.lat, lon: state.place.lon, height: state.place.height } );
		// The keys, on a keyboard; a touch screen has its labelled buttons instead.
		if ( ! document.body.classList.contains( 'touch' ) ) screens.showKeys();

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

	// The same for a drop-in beside another driver (goTo's), `height` m over the ellipsoid being
	// theirs: the water's surface to start on with them where they're out on it over a bed less deep
	// than that, as watchSea lays it (see ALONGSIDE); or else null.
	async function waterBeside( lat, lon, height, floor, y ) {

		if ( ! Number.isFinite( height ) ) return null;
		const [ level, at ] = await Promise.all( [ seaLevel( lat, lon ), waterAt( lat, lon ) ] );
		const over = riseOf( at );
		if ( over === null ) return null;
		const surface = level + over;
		const bed = tiles ? floor : surface + y;
		if ( Math.abs( height - surface ) > ALONGSIDE || bed >= surface - ( at.kind === 'lake' ? BED : SEA_MARGIN ) ) return null;
		if ( water.land( 0, 0, y + 1, 2 ) || ! opensOut( 0, 0, y + surface - bed ) ) return null;
		return { height: surface, over, lake: at.lake ?? null };

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
	// OPEN that might be clear comes to it, from the run's far end back.
	function opensOut( east, north, surface ) {

		const top = surface + RISE;
		const clear = [];
		const isClear = i => {

			const bearing = i % BEARINGS;
			const angle = bearing / BEARINGS * Math.PI * 2;
			clear[ bearing ] ??= OPEN_AT.every( distance => {

				const at = water.under( east + Math.sin( angle ) * distance, north + Math.cos( angle ) * distance, top + GROUND_RANGE[ 1 ], GROUND_RANGE[ 1 ] + SEA_DEPTH );
				return at !== null && at.y <= top && ! at.land;

			} );
			return clear[ bearing ];

		};
		for ( let first = 0; first < BEARINGS; ) {

			// A bearing that isn't clear rules out every run through it: the next run starts past it.
			let shut = - 1;
			for ( let i = first + OPEN - 1; i >= first && shut < 0; i -- ) if ( ! isClear( i ) ) shut = i;
			if ( shut < 0 ) return true;
			first = shut + 1;

		}

		return false;

	}

	// Each frame while driving on the Earth with none of sea.js's water round the vehicle: every
	// SEA_EVERY s, whether the ground under it or ahead of it along its way is the bed of the sea or a
	// big lake, out past where Google draws the water's surface, and if so the surface laid there
	// (see SEA_MARGIN and OPEN). The Moon has no water.
	function watchSea( dt ) {

		if ( onMoon() || ! driver.active || sea.shown || ! state.place ) return;
		seaWatch.in -= dt;
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
			// Last, and for this spot alone this look, as it can take dozens of rays: open to the water.
			if ( opensOut( east, north, bed.surface ) ) sea.start( bed );
			return;

		}

	}

	// Whether the ground at ( east, north ) in the scene, looked for down from `from` (m, in the scene),
	// is deep enough under the water's surface there to be the bed of the sea or a big lake (see
	// SEA_MARGIN): sea.start's { lat, lon, height, over, lake, east, north } for that water, the scene
	// as it's centred, with { y } the ground's height and { surface } the water's (m, in the scene),
	// and { level } the water's over the ellipsoid; or null, as it is till the sea's height and the
	// map have come (asked for the first time the ground's low enough to need them).
	function bedAt( east, north, from ) {

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
		const at = waterAtNow( lat, lon );
		// How far over the sea's height the water is there: none on land (or without the map), where
		// only ground deeper than any land or lake bed is the sea's.
		const over = riseOf( at );
		const level = seaLevelNow( lat, lon ) + ( over ?? 0 );
		const bed = base + y + curve( east, north );
		if ( over === null ? bed >= LOWEST : bed >= level - ( at.kind === 'lake' ? BED : SEA_MARGIN ) ) return null;
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
	// lays it (see ALONGSIDE), so that it's laid there for you too; or null.
	function besideWater( east, north, y ) {

		if ( onMoon() || ! state.place || sea.shown ) return null;
		const bed = bedAt( east, north, y + 4 );
		if ( ! bed || Math.abs( bed.height + y + curve( east, north ) - bed.level ) > ALONGSIDE ) return null;
		return water.land( east, north, bed.y + 1, 2 ) || ! opensOut( east, north, bed.surface ) ? null : bed;

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
			// (On the Moon, its squares still to build.)
			const loading = onMoon() ? moon.pending > 0 : !! tiles?.isLoading;
			quiet = y !== null && ! loading ? quiet + ( now - last ) / 1000 : 0;
			last = now;
			screens.setProgress( onMoon() ? moon.progress : tiles ? tiles.loadProgress : 1 );
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
		// The Moon's gravity, and no water there (which its grey dust would look like to water.js).
		const moonly = onMoon();
		driver.gravity = moonly ? MOON_GRAVITY : 1;
		driver.water = moonly ? null : water;
		water.none = moonly;
		pads.rules = moonly ? MOON_RULES : EARTH_RULES;
		driver.start( state.entry, specOf( state.vehicle ) );

	}

	// drive.js stopped driving (Esc or V, or the pause button): that's a pause here.
	function stopped() {

		// What was driven goes to the Worker as the drive pauses (or ends: toGlobe).
		progress.report();
		if ( state.leaving ) return;
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
		screens.pause( false );
		drive();

	}

	async function swapVehicle( vehicle ) {

		const old = state.entry;
		if ( ! old || state.mode !== 'paused' ) return;
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
		if ( state.drop ) state.drop.cancelled = true;
		state.drop = null;
		moon.rush = false;
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
		const { lat, lon } = state.place ?? globe.pose();
		globe.flyTo( globe.orbit( lat, lon ) );

	}

	// --- driving with others ---

	// Where the car is ({ lat, lon }), or null without one.
	function carSpot() {

		if ( ! state.entry || onMoon() ) return null;
		earth.updateWorldMatrix( true, false );
		state.entry.pivot.getWorldPosition( _p ).applyMatrix4( _inverse.copy( earth.matrixWorld ).invert() );
		const spot = ellipsoid.getPositionToCartographic( _p, {} );
		return { lat: spot.lat * MathUtils.RAD2DEG, lon: spot.lon * MathUtils.RAD2DEG };

	}

	// A landed jump's points, for the others to see over your car.
	function landed( run ) {

		if ( state.entry !== runEntry ) {

			runEntry = state.entry;
			runScore = 0;

		}

		const gained = run.score - runScore;
		runScore = run.score;
		if ( gained >= 1 && ! onMoon() ) live?.trick( gained );

	}

	// What levels count each frame of driving (progress.js's drive).
	function driven() {

		const d = driver;
		return {
			speed: velocityOf( d, _velocity ).length(),
			air: ! d.grounded && ! d.flying,
			boost: d.boost,
			// (On the Moon, nobody's driving with you, and it's none of the Earth's areas or spots.)
			together: ! onMoon() && !! live && [ ...live.players.values() ].some( p => ! p.away ),
			where: onMoon() ? nowhere : carWhere,
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

		if ( ( state.mode !== 'driving' && state.mode !== 'paused' ) || ! state.entry || onMoon() ) return null;
		return { pivot: state.entry.pivot, velocity: velocityOf( driver, _velocity ), flags: flagsOf( driver, state.mode === 'paused' ) };

	}

	// To another driver (the list's "Go to", the party's "Join"): next to them, facing their way. In
	// this scene if they're near, straight there; anywhere else, a drop-in, in your own ride. Out on
	// the water's surface where Google draws the bed, on that surface with them (see ALONGSIDE).
	async function goTo( pid ) {

		const other = live.players.get( pid );
		if ( ! other || other.away ) return;
		const spot = besideOf( other );
		if ( ! spot ) return;
		const beside = { name: other.place?.name || 'Dropped pin', lat: spot.lat, lon: spot.lon, height: spot.height, heading: spot.heading, beside: true };
		// From the Moon, they're on the Earth: back there, and a drop-in beside them.
		if ( onMoon() ) {

			if ( state.mode !== 'globe' ) toGlobe();
			dropIn( beside );
			return;

		}

		const here = () => ( state.mode === 'driving' || state.mode === 'paused' ) && !! state.entry;
		if ( here() && spot.local.length() < GO_NEAR ) {

			// (Whether they're out on the water needs the sea's height and the map, where they're low
			// enough to be.)
			if ( spot.height < HIGHEST_SEA + Math.max( 0, ...lakesNear( spot.lat, spot.lon ).map( lake => lake.height ) ) + ALONGSIDE ) await askSea( spot.lat, spot.lon );
			if ( here() && moveCar( spot ) ) return;

		}

		if ( state.mode !== 'globe' ) toGlobe();
		dropIn( beside );

	}

	// GO_BESIDE m to the right of another driver's car, from the last word of it (or where they
	// dropped in): { lat, lon, height, heading, local: in this scene }.
	function besideOf( other ) {

		earth.updateWorldMatrix( true, false );
		if ( ! other.s ) {

			const { lat, lon, height } = other.place ?? {};
			if ( ! Number.isFinite( lat ) ) return null;
			ellipsoid.getCartographicToPosition( lat * MathUtils.DEG2RAD, lon * MathUtils.DEG2RAD, height, _p );
			return { lat, lon, height, heading: 0, local: _p.clone().applyMatrix4( earth.matrixWorld ) };

		}

		const [ x, y, z, qx, qy, qz, qw ] = other.s;
		_q.set( qx, qy, qz, qw );
		_p.set( x, y, z ).add( _side.set( 1, 0, 0 ).applyQuaternion( _q ).multiplyScalar( GO_BESIDE ) );
		const carto = {};
		ellipsoid.getPositionToCartographic( _p, carto );
		const lat = carto.lat * MathUtils.RAD2DEG;
		const lon = carto.lon * MathUtils.RAD2DEG;
		// Their heading, from the way they face along the ground there (east and north).
		_ahead.set( 0, 0, - 1 ).applyQuaternion( _q );
		const east = - Math.sin( carto.lon ) * _ahead.x + Math.cos( carto.lon ) * _ahead.y;
		const north = - Math.sin( carto.lat ) * Math.cos( carto.lon ) * _ahead.x - Math.sin( carto.lat ) * Math.sin( carto.lon ) * _ahead.y + Math.cos( carto.lat ) * _ahead.z;
		const heading = MathUtils.euclideanModulo( Math.atan2( east, north ) * MathUtils.RAD2DEG, 360 );
		return { lat, lon, height: carto.height, heading, local: _p.clone().applyMatrix4( earth.matrixWorld ) };

	}

	// Your car to `spot` (besideOf's) in this scene, on the ground there (or the water: every ride
	// drives on it), driving on. Only ground within 3 m of their car's height, as R takes (not a
	// roof, a tree or a deck over them); false otherwise, or where there's no ground loaded there to
	// put it on, and it's a drop-in instead (which finds the street). Out on the water's surface where
	// Google draws the bed, with none of it laid here, it's laid there first (see ALONGSIDE).
	function moveCar( { local, heading } ) {

		const out = besideWater( - local.x, local.z, local.y );
		if ( out ) sea.start( out );
		const y = ground.heightAt( local.x, local.z, local.y + 3, 6 );
		if ( y === null ) return false;
		const { entry } = state;
		state.leaving = true;
		if ( driver.active ) driver.stop();
		state.leaving = false;
		Object.assign( entry.state, { east: - local.x, north: local.z, heading, up: y } );
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

		// The leaderboard over everything: its own keys (Esc closes it).
		if ( board.isOpen || isTyping( e ) || e.ctrlKey || e.metaKey || e.altKey || e.repeat ) return;
		if ( e.code === 'KeyM' && state.mode !== 'globe' ) toGlobe();
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
		if ( driver.active ) driver.update( dt );
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
			stats.drove( state.vehicle.id, world, dt, !! live?.players.size && ! onMoon() );

		}

		live?.update( car() );
		pads.update( dt );
		globe.update( dt );

		// How high the camera is (over the world it's on) decides the sky, the field of view and, while
		// driving, clipping. The Moon has no sky: its stars, turned with it.
		camera.updateMatrixWorld();
		_p.copy( camera.position ).applyMatrix4( _inverse.copy( globe.earth.matrixWorld ).invert() );
		globe.ellipsoid.getPositionToCartographic( _p, carto );
		const altitude = carto.height - ( state.place?.height ?? 0 );
		if ( onMoon() ) {

			scene.background = moon.stars;
			scene.backgroundRotation.setFromQuaternion( moon.group.quaternion );

		} else {

			const space = MathUtils.smoothstep( altitude, ...SKY_BELOW );
			scene.background = space < 1 ? sky.lerpColors( SKY, SPACE, space ) : null;

		}

		if ( testEarth ) testEarth.visible = ! onMoon() && ( state.mode === 'globe' || altitude > 20000 );
		const driving = state.mode === 'driving' || state.mode === 'paused';
		const fov = driving ? DRIVE_FOV + SUPERSONIC_FOV * driver.warp : GLOBE_FOV;
		if ( Math.abs( view.fov - fov ) > 0.01 ) view.fov += ( fov - view.fov ) * Math.min( 1, dt * 3 );
		// A jolt's punch on top, at once rather than eased in.
		const punched = view.fov + ( driving ? driver.punch : 0 );
		if ( Math.abs( camera.fov - punched ) > 1e-3 ) {

			camera.fov = punched;
			camera.updateProjectionMatrix();

		}

		// (And while dropping in on the Moon, whose heights over its sphere go up to 10 km: a flight
		// clips by the height over that, which so high leaves the near plane metres out, cutting into
		// the ground in front of the camera as it comes down to it.)
		if ( state.mode === 'driving' || state.mode === 'paused' || ( state.mode === 'dropping' && onMoon() ) ) globe.clip( altitude );

		camera.updateMatrixWorld();
		// On the Moon, Google's tiles are left as they are (none load under the hidden Earth), and the
		// Moon's ground is made sharp round the camera and the vehicle.
		if ( onMoon() ) {

			moon.update( camera, state.entry ? state.entry.pivot.getWorldPosition( _focus ) : null );
			moonLight( dt );

		} else tiles?.update();
		models.update( dt );
		ghosts?.update( dt, ! onMoon() && ( state.mode === 'driving' || state.mode === 'paused' ) );
		online?.update();
		// Not while the Garage is open: its turntable draws instead, and on a phone it covers the
		// screen, so drawing the world behind it as well would only halve the frame rate.
		if ( ! garage.isOpen ) renderer.render( scene, camera );
		globe.capture();

		slow -= dt;
		if ( slow <= 0 ) {

			slow = 0.25;
			updateAttribution();

		}

	} );

	// The Moon's sun: over the viewer's shoulder on the globe, so the side in view is lit, and fixed
	// in the scene while dropping in and driving (MOON_SUN), easing from one to the other; on the
	// ground (moon.js) and the vehicles alike. The Earth in the sky with it, off the globe.
	const moonSun = MOON_SUN.clone();
	function moonLight( dt ) {

		if ( state.mode === 'globe' ) globeSun( _sun );
		else _sun.copy( MOON_SUN );
		moonSun.lerp( _sun, Math.min( 1, dt * 1.5 ) ).normalize();
		moon.setSun( moonSun );
		lights.sun.position.copy( moonSun ).multiplyScalar( 1000 );
		moon.earth.visible = state.mode !== 'globe';
		if ( moon.earth.visible ) moon.placeEarth( camera, camera.far * 0.6 );

	}

	// The sun on the Moon's globe: from space, over the viewer's left shoulder (the side in view lit,
	// as a Moon nearly full); coming down to the ground, low across it from the left and ahead (30° up),
	// as head-on light would show none of its craters.
	const _up = new Vector3();
	const _left = new Vector3();
	function globeSun( target ) {

		const high = MathUtils.smoothstep( globe.altitude(), 40000, 400000 );
		target.set( - 0.45, 0.55, 0.7 ).transformDirection( camera.matrixWorld );
		if ( high >= 1 ) return target;
		_up.setFromMatrixPosition( camera.matrixWorld ).sub( _p.setFromMatrixPosition( moon.group.matrixWorld ) ).normalize();
		_left.set( - 1, 0, - 0.6 ).transformDirection( camera.matrixWorld ).addScaledVector( _up, - _left.dot( _up ) ).normalize();
		_left.multiplyScalar( Math.cos( 30 * MathUtils.DEG2RAD ) ).addScaledVector( _up, Math.sin( 30 * MathUtils.DEG2RAD ) );
		return target.lerp( _left, 1 - high ).normalize();

	}

	// The lights for the world: the Earth's as addLights made them, or the Moon's harsh sun and dark
	// sky.
	function lightFor() {

		if ( onMoon() ) {

			lights.sun.intensity = MOON_LIGHT.sun;
			lights.hemisphere.intensity = MOON_LIGHT.sky;
			if ( state.mode === 'globe' ) globeSun( moonSun );

		} else {

			lights.sun.position.copy( earthLight.sun );
			lights.sun.intensity = earthLight.intensity;
			lights.hemisphere.intensity = earthLight.sky;
			moon.earth.visible = false;

		}

	}

	// Google's terms: the Google Maps logo and the data providers whenever the tiles are on screen;
	// on the Moon, NASA's credit instead.
	function updateAttribution() {

		$( 'moon-credit' ).hidden = ! onMoon();
		const root = $( 'attribution' );
		root.hidden = onMoon() || ! tiles || tiles.visibleTiles.size === 0;
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
		get entry() {

			return state.entry;

		},
		get world() {

			return world;

		},
		moon, setWorld,
		dropIn, toGlobe, resume, recentre, waterOver, watchSea, moveCar,
		where: () => formatLatLon( carto.lat * MathUtils.RAD2DEG, carto.lon * MathUtils.RAD2DEG ),
	};

}
