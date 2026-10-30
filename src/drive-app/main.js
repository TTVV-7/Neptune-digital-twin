import './style.css';
import { Color, MathUtils, Matrix4, PerspectiveCamera, Scene, Timer, Vector3, WebGLRenderer } from 'three';
import { addLights, createGoogleTiles, createPlaceholderGround, recentreTiles } from '../world.js';
import { ModelManager } from '../models.js';
import { Driver } from '../drive.js';
import { isTyping } from '../walk.js';
import { useFastRaycast } from '../raycast.js';
import { enuToLocal, localToLatLon } from '../geo.js';
import { createDriveHud } from '../drive-hud.js';
import { getConfig, startVisit } from './api.js';
import { GlobeView } from './globe.js';
import { Ground } from './spawn.js';
import { createTestGlobe, placeEarth } from './test-globe.js';
import { loadVehicle, loadVehicles, specOf } from './vehicles.js';
import { setUpPanel } from './panel.js';
import { setUpLeaderboard } from './leaderboard.js';
import { formatLatLon, rememberPlace } from './places.js';
import * as screens from './screens.js';

// World Drive (worlddrive.app, docs/world-drive.md): pick anywhere on Earth from a globe of
// Google's photorealistic 3D tiles, drop in and drive it. One page load is one Google Maps session
// (the root tileset is loaded once), so flying off somewhere else never reloads the tiles: the
// scene is recentred on each new place instead (recentre below).
//
// Modes: 'globe' (the globe and its panel), 'dropping' (flying down and waiting for the ground),
// 'driving' and 'paused'. M goes back to the globe from any of the others.

// Only the dev server has this (vite.drive.config.js): a key from the environment, for driving on
// Google's tiles without the Worker. The built site always asks the Worker.
const DEV_KEY = __DEV_MAPS_KEY__;
const SKY = new Color( 0x9fcbee );
const SPACE = new Color( 0x070c16 );
// Field of view on the globe, and driving.
const GLOBE_FOV = 50;
const DRIVE_FOV = 70;
// The sky fades from blue to space between these heights (m); above, the page's stars show.
const SKY_BELOW = [ 15000, 120000 ];
// How long (s) the drop-in waits for the ground at most: while flying down to look round, then
// again once low behind where the vehicle will be.
const GROUND_WAIT = [ 25, 15 ];
// The tiles must have stopped loading this long (s) for the ground to count as there.
const SETTLE = 0.6;
// Where the ground is looked for (m above the ellipsoid): below the Dead Sea to above Everest.
const GROUND_RANGE = [ - 1500, 9500 ];
// Room (px) the pin's card takes over the panel when the panel is a sheet along the bottom.
const PIN_CARD = 84;
// What a place's name may hold on the leaderboard (as worker/drive/names.js takes it), and how long.
const PLACE_TEXT = /[^\p{L}\p{M}\p{N} .,'’\-#&/()°]+/gu;
const PLACE_LENGTH = 60;

const $ = id => document.getElementById( id );
const frame = () => new Promise( resolve => requestAnimationFrame( resolve ) );
const _p = new Vector3();
const _inverse = new Matrix4();

boot();

async function boot() {

	screens.splash( 'Warming up the engine...' );
	const config = await getConfig();
	// The Vite dev server on its own: a key from the environment, or the test globe.
	if ( ! config ) return start( { key: DEV_KEY || null, worker: false } );
	if ( ! config.mapsOn ) return screens.notice( 'resting', { onTestPad: () => start( { key: null } ) } );
	visit( config );

}

// Once per page load: the robot check, then the Maps key for this visit.
async function visit( config ) {

	screens.splash( 'Checking the road is clear...' );
	const outcome = await startVisit( config.turnstileSiteKey, $( 'robot-check' ) );
	if ( outcome.key ) return start( { key: outcome.key, left: outcome.left, visit: outcome.visit } );
	if ( outcome.usedUp ) return screens.notice( 'used-up', { retryAfter: outcome.retryAfter } );
	if ( outcome.robot ) return screens.notice( 'robot', { onRetry: () => visit( config ) } );
	screens.notice( 'error', { message: outcome.error, onRetry: () => visit( config ) } );

}

// key: the Maps key (none: the test globe and pad); left: free drives left today; visit: the
// visit's token, for posting scores; worker: whether there's a Worker (not on the dev server alone).
async function start( { key, left = null, visit = null, worker = true } ) {

	const vehicles = await loadVehicles();
	screens.hideSplash();

	const renderer = new WebGLRenderer( { antialias: true, alpha: true, logarithmicDepthBuffer: true } );
	renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
	renderer.setSize( window.innerWidth, window.innerHeight );
	$( 'app' ).appendChild( renderer.domElement );
	const canvas = renderer.domElement;

	const scene = new Scene();
	const camera = new PerspectiveCamera( GLOBE_FOV, window.innerWidth / window.innerHeight, 1, 1e8 );
	addLights( scene );
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
		screens.toast( 'No Google 3D tiles here: a test globe, and a flat test pad wherever you drop in.', 6000 );

	}

	const grounds = () => [ tiles ? tiles.group : pad ];
	const globe = new GlobeView( { camera, canvas, earth, surface: earth, ellipsoid, pin: $( 'pin' ) } );
	scene.add( globe.air );
	globe.place( globe.orbit( home.lat, home.lon ) );
	globe.capture();
	// Until Google's root tileset arrives the tiles sit in the Earth's own frame; then
	// ReorientationPlugin moves them, and the camera has to move with them.
	tiles?.addEventListener( 'load-root-tileset', () => globe.restore() );

	const models = new ModelManager( { getGround: grounds, renderer } );
	scene.add( models.group );
	const ground = new Ground( grounds );
	const hud = createDriveHud( $( 'hud' ) );
	// drive.js hands the view back to the construction app's walk controller when you get out.
	// World Drive has no walking: this stands in for it.
	const walker = { keys: new Set(), enabled: false, yaw: 0, pitch: 0, setPose() {}, setMode() {} };
	const driver = new Driver( {
		camera, models, controls: walker, getColliders: grounds, hud, onStop: stopped,
		// Each landed jump, for the leaderboard: where, and in what.
		onScore: run => board.onScore( { ...run, place: placeLabel( state.place ), vehicle: state.vehicle?.id } ),
		// What World Drive drives with: Shift flies, B boosts, the kart drifts, and hitting something
		// throws you into the air for stunts.
		fly: true, booster: true, drift: true, crash: 'launch',
	} );

	const state = { mode: 'globe', place: null, entry: null, vehicle: null, drop: null, leaving: false };

	const panel = setUpPanel( {
		root: $( 'globe-ui' ),
		vehicles,
		flyTo: place => {

			const height = globe.surfaceHeight( place.lat, place.lon );
			const pin = { ...place, height };
			globe.setPin( pin );
			panel.setPin( pin );
			const view = { lat: place.lat, lon: place.lon, height: height ?? 0, distance: 2200, heading: place.heading ?? 0, pitch: - 50 };
			globe.flyTo( globe.lifted( view, pinLift(), GLOBE_FOV ) ).then( arrived => {

				// Sharper tiles have loaded on the way down: sit the pin on them.
				if ( arrived && globe.pin === pin ) pin.height = globe.surfaceHeight( pin.lat, pin.lon ) ?? pin.height;

			} );

		},
		onDrive: place => dropIn( place ),
		onClearPin: () => pinAt( null ),
	} );
	panel.vehiclePicker( $( 'pause' ).querySelector( '.vehicles' ), vehicle => swapVehicle( vehicle ) );
	globe.onPick = place => pinAt( { ...place, name: 'Dropped pin', region: '' } );

	// The leaderboard, from the trophy on the globe and in the pause menu. "Only here" is the place
	// being driven, or on the globe the one pinned.
	const board = setUpLeaderboard( {
		dialog: $( 'leaderboard' ),
		card: $( 'best-card' ),
		vehicles,
		worker,
		getPlace: () => placeLabel( state.mode === 'globe' ? panel.pinned : state.place ),
	} );
	board.setVisit( visit );
	for ( const button of document.querySelectorAll( '.board-open' ) ) {

		button.hidden = ! worker;
		button.addEventListener( 'click', () => board.open() );

	}

	// About, with the credits the vehicle models' licences ask for.
	const about = $( 'about' );
	const link = ( href, text ) => Object.assign( document.createElement( 'a' ), { href, textContent: text, target: '_blank', rel: 'noopener' } );
	about.querySelector( '.credits' ).replaceChildren( ...vehicles.filter( v => v.credit ).map( ( { name, credit } ) => {

		const li = document.createElement( 'li' );
		li.append( `${ name }: `, link( credit.url, credit.title ), ` by ${ credit.author }, `, link( credit.licenseUrl, credit.license ), '. Modified: compressed and rescaled.' );
		return li;

	} ) );
	$( 'globe-ui' ).querySelector( '.about-open' ).addEventListener( 'click', () => about.showModal() );
	if ( left !== null && left <= 2 ) screens.toast( left === 0 ? 'This is your last free drive today.' : `${ left } more free drive${ left === 1 ? '' : 's' } today after this one.` );

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

	// A place's name as the leaderboard has it: a dropped pin by where it is (to about a kilometre,
	// so pins near each other are one place), and only the characters the Worker takes.
	function placeLabel( place ) {

		if ( ! place ) return null;
		const name = place.name === 'Dropped pin' ? formatLatLon( place.lat, place.lon ).replace( /(\.\d\d)\d+/g, '$1' ) : place.name;
		const label = [ ...String( name ).replace( /[–—]/g, '-' ).replace( PLACE_TEXT, ' ' ).replace( /\s+/g, ' ' ).trim() ].slice( 0, PLACE_LENGTH ).join( '' ).trim();
		return label || formatLatLon( place.lat, place.lon );

	}

	function setMode( mode ) {

		state.mode = mode;
		document.body.dataset.mode = mode;
		globe.setEnabled( mode === 'globe' );
		$( 'globe-ui' ).hidden = mode !== 'globe';
		$( 'drive-ui' ).hidden = mode !== 'driving' && mode !== 'paused';
		if ( pad ) pad.visible = mode !== 'globe';

	}

	setMode( 'globe' );

	// --- moving the scene to a new place, without loading anything again ---

	function recentre( place ) {

		globe.capture();
		if ( tiles ) recentreTiles( tiles, place );
		else placeEarth( earth, ellipsoid, place );
		globe.restore();

	}

	// --- dropping in ---

	async function dropIn( place ) {

		if ( state.mode !== 'globe' ) return;
		const drop = state.drop = { cancelled: false };
		const gone = () => drop.cancelled || state.drop !== drop;
		let { lat, lon } = place;
		state.place = place;
		rememberPlace( place );
		panel.refreshRecent();
		pinAt( null );
		setMode( 'dropping' );
		$( 'drive-ui' ).querySelector( '.place' ).textContent = place.name;
		screens.loading( `Dropping in: ${ place.name }` );

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
		// Looking for it anywhere from above the highest mountain to below the Dead Sea, whatever
		// the estimate was.
		const y = await settle( drop, GROUND_RANGE[ 1 ] - estimate, GROUND_RANGE[ 1 ] - GROUND_RANGE[ 0 ], GROUND_WAIT[ 0 ] );
		if ( gone() ) return;
		if ( y === null ) {

			noGround( 'There\'s no 3D map at this spot yet. Try somewhere else.' );
			return;

		}

		// A spot on a bridge starts on its deck, if its pin is a little off it, over the water; a pin
		// on a roof (or anything else raised) starts on the street below it.
		let height = estimate + y;
		const start = place.deck ? ground.deck( y ) : ground.street( y );
		if ( start ) {

			( { lat, lon } = localToLatLon( enuToLocal( start.east, start.north, 0 ), { lat, lon } ) );
			height = estimate + start.y;

		}

		// Now the ground is at y = 0, and the street can be seen: down behind where you'll start.
		recentre( { lat, lon, height } );
		state.place = { ...place, lat, lon, height };
		const heading = ground.heading( 0, place.heading );
		await globe.flyTo( { lat, lon, height, distance: 16, heading, pitch: - 15 }, { duration: 1.8 } );
		if ( gone() ) return;
		screens.loading( 'Loading the ground...', 0 );
		await settle( drop, 300, 600, GROUND_WAIT[ 1 ] );
		if ( gone() ) return;

		let entry;
		try {

			entry = await vehicleLoading;

		} catch ( err ) {

			noGround( `The ${ vehicle.name.toLowerCase() } didn't load (${ err.message }). Try again or pick another ride.` );
			return;

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
		screens.hideLoading();
		drive();
		// The keys, on a keyboard; a touch screen has its labelled buttons instead.
		if ( ! document.body.classList.contains( 'touch' ) ) screens.showKeys();

	}

	// Wait for ground under the pin with the tiles done loading for a moment: its height (m, in the
	// scene), or null if there's still none after `timeout` seconds.
	async function settle( drop, top, depth, timeout ) {

		const begun = performance.now();
		let quiet = 0;
		let last = begun;
		for ( ;; ) {

			await frame();
			if ( drop.cancelled ) return null;
			const now = performance.now();
			const y = ground.heightAt( 0, 0, top, depth );
			quiet = y !== null && ! tiles?.isLoading ? quiet + ( now - last ) / 1000 : 0;
			last = now;
			screens.setProgress( tiles ? tiles.loadProgress : 1 );
			if ( quiet >= SETTLE || now - begun > timeout * 1000 ) return y;

		}

	}

	function noGround( message ) {

		state.drop = null;
		removeVehicle();
		screens.hideLoading();
		screens.toast( message, 7000 );
		toGlobe( { fromHere: true } );

	}

	// --- driving, pausing, changing ride ---

	function drive() {

		setMode( 'driving' );
		driver.start( state.entry, specOf( state.vehicle ) );

	}

	// drive.js stopped driving (Esc or V, or the pause button): that's a pause here.
	function stopped() {

		if ( state.leaving ) return;
		setMode( 'paused' );
		screens.pause( true );

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
		if ( state.drop ) state.drop.cancelled = true;
		state.drop = null;
		state.leaving = true;
		if ( driver.active ) driver.stop();
		state.leaving = false;
		removeVehicle();
		screens.pause( false );
		screens.hideLoading();
		screens.hideKeys();
		globe.cancelFlight();
		setMode( 'globe' );
		const { lat, lon } = state.place ?? globe.pose();
		globe.flyTo( globe.orbit( lat, lon ) );

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
			return;

		}

		// After a few hours the visit's Google session runs out; a new one is a new visit.
		if ( refused ) {

			screens.toast( 'This drive\'s map session has ended. Reload the page for a fresh one.', 15000 );
			return;

		}

		if ( ++ tileErrors >= 3 && tiles.visibleTiles.size === 0 ) screens.toast( `Google's 3D tiles are having trouble loading (${ message }).`, 8000 );

	}

	// --- every frame ---

	const timer = new Timer();
	timer.connect( document );
	let slow = 0;
	const carto = {};
	const sky = new Color();
	renderer.setAnimationLoop( time => {

		timer.update( time );
		const dt = Math.min( timer.getDelta(), 0.1 );
		if ( driver.active ) driver.update( dt );
		globe.update( dt );

		// How high the camera is decides the sky, the field of view and, while driving, clipping.
		camera.updateMatrixWorld();
		_p.copy( camera.position ).applyMatrix4( _inverse.copy( earth.matrixWorld ).invert() );
		ellipsoid.getPositionToCartographic( _p, carto );
		const altitude = carto.height - ( state.place?.height ?? 0 );
		const space = MathUtils.smoothstep( altitude, ...SKY_BELOW );
		scene.background = space < 1 ? sky.lerpColors( SKY, SPACE, space ) : null;
		if ( testEarth ) testEarth.visible = state.mode === 'globe' || altitude > 20000;
		const fov = state.mode === 'driving' || state.mode === 'paused' ? DRIVE_FOV : GLOBE_FOV;
		if ( Math.abs( camera.fov - fov ) > 0.01 ) {

			camera.fov += ( fov - camera.fov ) * Math.min( 1, dt * 3 );
			camera.updateProjectionMatrix();

		}

		if ( state.mode === 'driving' || state.mode === 'paused' ) globe.clip( altitude );

		camera.updateMatrixWorld();
		tiles?.update();
		models.update( dt );
		renderer.render( scene, camera );
		globe.capture();

		slow -= dt;
		if ( slow <= 0 ) {

			slow = 0.25;
			updateAttribution();

		}

	} );

	// Google's terms: the Google Maps logo and the data providers whenever the tiles are on screen.
	function updateAttribution() {

		const root = $( 'attribution' );
		root.hidden = ! tiles || tiles.visibleTiles.size === 0;
		if ( root.hidden ) return;
		root.querySelector( '.credits' ).textContent = tiles.getAttributions()
			.filter( a => a.type === 'string' && a.value )
			.map( a => a.value )
			.join( ' · ' );

	}

	// For poking around from the browser console, and for the tests.
	window.drive = {
		scene, camera, renderer, tiles, globe, models, driver, ground, panel, leaderboard: board,
		get mode() {

			return state.mode;

		},
		get place() {

			return state.place;

		},
		get entry() {

			return state.entry;

		},
		dropIn, toGlobe, resume, recentre,
		where: () => formatLatLon( carto.lat * MathUtils.RAD2DEG, carto.lon * MathUtils.RAD2DEG ),
	};

}
