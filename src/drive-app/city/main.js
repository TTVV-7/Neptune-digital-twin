import { Color, Fog, PerspectiveCamera, Raycaster, Scene, Timer, Vector3, WebGLRenderer } from 'three';
import { addLights } from '../../world.js';
import { ModelManager } from '../../models.js';
import { Driver } from '../../drive.js';
import { useFastRaycast } from '../../raycast.js';
import { createDriveHud } from '../../drive-hud.js';
import { loadVehicle, loadVehicles, rideLocked, specOf } from '../vehicles.js';
import { buildCity } from './build.js';
import { CITIES } from './cities.js';

// City Drive (/city/, drive/city/index.html): World Drive's cars in a whole city built from
// OpenStreetMap (build.js, scripts/make-city.py) instead of Google's tiles: nothing to pay per
// visit, no daily cap, no sign-in. Pick a city, where to start and a ride, and drive: the same
// driving as World Drive (drive.js: boost, drift, stunts, R back on the road, T to fly), with Esc
// back to the menu. Rides locked in World Drive stay locked here.

const $ = id => document.getElementById( id );
const SKY = new Color( 0xbcd6ea );

const renderer = new WebGLRenderer( { antialias: true, logarithmicDepthBuffer: true } );
renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
renderer.setSize( window.innerWidth, window.innerHeight );
$( 'app' ).append( renderer.domElement );

const scene = new Scene();
scene.background = SKY;
scene.fog = new Fog( SKY, 600, 4500 );
addLights( scene );
scene.background = SKY;
const camera = new PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 0.5, 30000 );
camera.position.set( 0, 400, 600 );
camera.lookAt( 0, 0, 0 );

let city = null; // { spec, group, colliders }
const grounds = () => city ? [ city.colliders ] : [];
const models = new ModelManager( { getGround: grounds, renderer } );
scene.add( models.group );
const hud = createDriveHud( $( 'hud' ) );
// drive.js hands the view back to a walk controller when you get out; there's none here.
const walker = { keys: new Set(), enabled: false, yaw: 0, pitch: 0, setPose() {}, setMode() {} };
const driver = new Driver( {
	camera, models, controls: walker, getColliders: grounds, hud, onStop: () => showMenu( true ),
	fly: false, booster: true, drift: true, crash: 'launch', plane: true, effects: { detail: 1, calm: false },
} );

const state = { vehicle: null, entry: null, start: null };

// --- the menu ---------------------------------------------------------------------------

const vehicles = ( await loadVehicles() ).filter( v => ! rideLocked( v ) );
fill( $( 'city' ), CITIES.map( c => [ c.id, c.name ] ) );
fill( $( 'ride' ), vehicles.map( v => [ v.id, v.name ] ) );
$( 'city' ).addEventListener( 'change', () => openCity( $( 'city' ).value ) );
$( 'go' ).addEventListener( 'click', () => drive() );
$( 'resume' ).addEventListener( 'click', () => resume() );

function fill( select, options ) {

	select.replaceChildren( ...options.map( ( [ value, label ] ) => Object.assign( document.createElement( 'option' ), { value, textContent: label } ) ) );

}

function showMenu( paused = false ) {

	$( 'menu' ).hidden = false;
	$( 'resume' ).hidden = ! paused || ! state.entry;
	$( 'go' ).textContent = paused ? 'Start again' : 'Drive';

}

async function openCity( id ) {

	const spec = CITIES.find( c => c.id === id ) ?? CITIES[ 0 ];
	$( 'loading' ).hidden = false;
	$( 'go' ).disabled = true;
	try {

		const res = await fetch( spec.file );
		if ( ! res.ok ) throw new Error( `${ res.status }` );
		const data = await res.json();
		if ( city ) {

			scene.remove( city.group );
			city.group.traverse( o => o.geometry?.dispose() );

		}

		if ( state.entry ) {

			if ( driver.active ) driver.stop();
			models.remove( state.entry );
			state.entry = null;

		}

		const built = buildCity( data );
		useFastRaycast( built.colliders );
		scene.add( built.group );
		city = { spec, data, ...built };
		fill( $( 'start' ), data.starts.map( ( s, i ) => [ i, s.name ] ) );
		$( 'blurb' ).textContent = spec.blurb;
		$( 'credit' ).textContent = data.credit.replace( '(c)', '©' );
		document.title = `${ spec.name } · City Drive · World Drive`;
		history.replaceState( null, '', `?city=${ spec.id }` );
		// A look over the city while the menu's up.
		const [ w, h ] = data.size;
		camera.position.set( w * 0.35, Math.max( w, h ) * 0.35, h * 0.55 );
		camera.lookAt( 0, 0, 0 );

	} catch ( err ) {

		$( 'blurb' ).textContent = `Couldn't load ${ spec.name } (${ err.message }). Reload to try again.`;

	} finally {

		$( 'loading' ).hidden = true;
		$( 'go' ).disabled = false;

	}

}

// Put the picked ride down at the picked start (or swap rides where the car is), and drive.
async function drive() {

	if ( ! city ) return;
	const vehicle = vehicles.find( v => v.id === $( 'ride' ).value ) ?? vehicles[ 0 ];
	const start = city.data.starts[ Number( $( 'start' ).value ) || 0 ];
	const [ east, north ] = start.at;
	$( 'go' ).disabled = true;
	try {

		if ( driver.active ) driver.stop();
		if ( state.entry ) models.remove( state.entry );
		state.entry = await loadVehicle( models, vehicle, { east, north, heading: start.heading } );
		state.vehicle = vehicle;
		resume();

	} finally {

		$( 'go' ).disabled = false;

	}

}

function resume() {

	if ( ! state.entry ) return;
	$( 'menu' ).hidden = true;
	driver.start( state.entry, specOf( state.vehicle ) );

}

window.addEventListener( 'resize', () => {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );

} );

const timer = new Timer();
renderer.setAnimationLoop( time => {

	timer.update( time );
	const dt = Math.min( timer.getDelta(), 0.1 );
	if ( driver.active ) driver.update( dt );
	models.update( dt );
	renderer.render( scene, camera );

} );

// For the tests, and poking around from the console.
window.cityDrive = { scene, camera, driver, models, get city() {

	return city;

}, drive, openCity, groundAt };

// The height of what's driven on at (east, north): the top of a bridge's deck over the water, say.
function groundAt( east, north ) {

	const raycaster = new Raycaster( new Vector3( - east, 1000, north ), new Vector3( 0, - 1, 0 ) );
	const hit = city && raycaster.intersectObject( city.colliders, true )[ 0 ];
	return hit ? { y: hit.point.y, what: hit.object.name } : null;

}

const wanted = new URLSearchParams( location.search ).get( 'city' );
$( 'city' ).value = CITIES.some( c => c.id === wanted ) ? wanted : CITIES[ 0 ].id;
await openCity( $( 'city' ).value );
showMenu();
