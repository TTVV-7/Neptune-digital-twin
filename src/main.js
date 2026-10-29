import './style.css';
import { PerspectiveCamera, Raycaster, Scene, Timer, Vector3, WebGLRenderer } from 'three';
import { MODELS, PLAYER, SITE, START, VIEWPOINTS } from './config.js';
import { enuToLocal, localToEnu, localToLatLon, yawToHeading } from './geo.js';
import { addLights, createGoogleTiles, createPlaceholderGround, GroundFlattener } from './world.js';
import { ModelManager } from './models.js';
import { createPlacementPanel } from './placement.js';
import { WalkController } from './walk.js';

const STORAGE_KEY = 'neptune-twin.google-api-key';
const $ = id => document.getElementById( id );

boot();

function boot() {

	const apiKey = readApiKey();
	if ( apiKey ) {

		start( apiKey );
		return;

	}

	const prompt = $( 'key-prompt' );
	const form = prompt.querySelector( 'form' );
	prompt.hidden = false;
	form.addEventListener( 'submit', e => {

		e.preventDefault();
		const key = form.elements.key.value.trim();
		storage( () => localStorage.setItem( STORAGE_KEY, key ) );
		prompt.hidden = true;
		start( key );

	} );
	$( 'skip' ).addEventListener( 'click', () => {

		prompt.hidden = true;
		start( null );

	} );

}

function start( apiKey ) {

	const renderer = new WebGLRenderer( { antialias: true, logarithmicDepthBuffer: true } );
	renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
	renderer.setSize( window.innerWidth, window.innerHeight );
	$( 'app' ).appendChild( renderer.domElement );

	const scene = new Scene();
	const camera = new PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 0.1, 60000 );
	addLights( scene );

	// The ground is either Google's photorealistic tiles or a flat stand-in.
	let tiles = null;
	let ground;
	if ( apiKey ) {

		tiles = createGoogleTiles( {
			apiKey,
			camera,
			renderer,
			onError: ( { error } ) => showBanner(
				`Google 3D tiles failed to load (${ error?.message ?? 'unknown error' }). ` +
				'Check that the key is right, the Map Tiles API is enabled and billing is on.',
			),
		} );
		ground = tiles.group;

	} else {

		ground = createPlaceholderGround();
		showBanner( 'Running without Google tiles: flat placeholder ground only. Press H to add an API key.', 8000 );

	}

	scene.add( ground );

	const flattener = tiles ? new GroundFlattener( tiles ) : null;
	const models = new ModelManager( { getGround: () => [ ground ], flattener } );
	scene.add( models.group );

	const controls = new WalkController( camera, renderer.domElement, () => [ ground, models.group ] );
	controls.setPose( enuToLocal( START.east, START.north, START.up ), START.heading, START.pitch );
	controls.setMode( START.mode );

	const feetPosition = () => camera.position.clone().setY( camera.position.y - PLAYER.eyeHeight );
	createPlacementPanel( models, {
		getPlayerPose: () => ( { position: feetPosition(), heading: yawToHeading( controls.yaw ) } ),
	} );

	for ( const config of MODELS ) {

		models.load( config ).catch( err => showBanner( `Could not load ${ config.url }: ${ err.message }` ) );

	}

	setUpDragAndDrop( models, () => {

		// Drop new models 20 m in front of the player.
		const ahead = new Vector3( - Math.sin( controls.yaw ), 0, - Math.cos( controls.yaw ) ).multiplyScalar( 20 );
		const { east, north } = localToEnu( feetPosition().add( ahead ) );
		return { east: Math.round( east ), north: Math.round( north ), heading: 0 };

	} );

	setUpOverlays( controls );
	setUpViewpoints( controls, () => [ ground, models.group ] );

	window.addEventListener( 'resize', () => {

		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
		renderer.setSize( window.innerWidth, window.innerHeight );
		tiles?.setResolutionFromRenderer( camera, renderer );

	} );

	const timer = new Timer();
	timer.connect( document );
	let hudTimer = 0;
	models.onLoading = () => hudTimer = 0;
	renderer.setAnimationLoop( time => {

		timer.update( time );
		const dt = Math.min( timer.getDelta(), 0.1 );
		controls.update( dt );
		camera.updateMatrixWorld();
		tiles?.update();
		models.update();
		renderer.render( scene, camera );

		hudTimer -= dt;
		if ( hudTimer <= 0 ) {

			hudTimer = 0.25;
			updateStatus( camera, controls, tiles, models );
			updateAttribution( tiles );

		}

	} );

	// Handy for poking around from the browser console.
	window.twin = { scene, camera, controls, models, tiles, SITE };

}

function updateStatus( camera, controls, tiles, models ) {

	const { lat, lon } = localToLatLon( camera.position );
	const { east, north } = localToEnu( camera.position );
	const lines = [
		`${ controls.mode === 'walk' ? 'WALKING' : 'FLYING' }${ controls.mode === 'walk' && ! controls.groundFound ? ' (waiting for ground)' : '' }`,
		`lat ${ lat.toFixed( 6 ) }  lon ${ lon.toFixed( 6 ) }`,
		`east ${ east.toFixed( 1 ) } m  north ${ north.toFixed( 1 ) } m`,
		`heading ${ yawToHeading( controls.yaw ).toFixed( 0 ) }°`,
	];
	if ( tiles && tiles.loadProgress < 1 ) lines.push( `loading tiles ${ Math.round( tiles.loadProgress * 100 ) }%` );
	for ( const { name, loaded, total, stage } of models.loading ) {

		const mb = bytes => ( bytes / 1e6 ).toFixed( 0 );
		if ( stage === 'preparing' ) lines.push( `preparing ${ name }...` );
		else if ( total ) lines.push( `loading ${ name } ${ Math.round( 100 * loaded / total ) }% (${ mb( loaded ) } / ${ mb( total ) } MB)` );
		else lines.push( `loading ${ name } ${ mb( loaded ) } MB` );

	}

	const status = $( 'status' );
	status.hidden = false;
	status.textContent = lines.join( '\n' );

}

// Google's terms require the logo text and the data providers to stay visible.
function updateAttribution( tiles ) {

	if ( ! tiles ) return;
	const text = tiles.getAttributions()
		.filter( a => a.type === 'string' && a.value )
		.map( a => a.value )
		.join( ' · ' );
	const el = $( 'attribution' );
	el.innerHTML = '';
	if ( tiles.visibleTiles.size === 0 ) return;

	const logo = document.createElement( 'b' );
	logo.textContent = 'Google';
	el.append( logo, text ? ` ${ text }` : '' );

}

function setUpOverlays( controls ) {

	const hint = $( 'hint' );
	const help = $( 'help' );
	hint.hidden = false;
	controls.onLockChange = locked => {

		hint.hidden = locked;
		if ( locked ) help.hidden = true;

	};

	window.addEventListener( 'keydown', e => {

		if ( e.code === 'KeyH' && ! e.repeat && ! ( e.target instanceof HTMLInputElement ) ) {

			help.hidden = ! help.hidden;
			if ( ! help.hidden ) document.exitPointerLock();

		}

	} );

	$( 'change-key' ).addEventListener( 'click', () => {

		storage( () => localStorage.removeItem( STORAGE_KEY ) );
		const url = new URL( window.location.href );
		url.searchParams.delete( 'key' );
		window.location.href = url.href;

	} );

}

// Number keys jump to the VIEWPOINTS in config.js; the help panel lists them too.
function setUpViewpoints( controls, getColliders ) {

	const raycaster = new Raycaster();
	const goTo = view => {

		let up = view.up ?? 0;
		if ( view.mode === 'walk' ) {

			// Drop in from a little above the ground, which gives the detailed tiles a moment to load.
			raycaster.set( enuToLocal( view.east, view.north, 2000 ), new Vector3( 0, - 1, 0 ) );
			up = ( raycaster.intersectObjects( getColliders(), true )[ 0 ]?.point.y ?? 0 ) + 25;

		}

		controls.setMode( view.mode ?? 'fly' );
		controls.setPose( enuToLocal( view.east, view.north, up ), view.heading ?? 0, view.pitch ?? 0 );

	};

	const list = $( 'viewpoints' );
	VIEWPOINTS.slice( 0, 9 ).forEach( ( view, i ) => {

		const row = document.createElement( 'tr' );
		const key = document.createElement( 'td' );
		const cell = document.createElement( 'td' );
		const button = document.createElement( 'button' );
		key.textContent = i + 1;
		button.type = 'button';
		button.textContent = view.name;
		button.addEventListener( 'click', () => {

			$( 'help' ).hidden = true;
			goTo( view );

		} );
		cell.append( button );
		row.append( key, cell );
		list.append( row );

	} );

	window.addEventListener( 'keydown', e => {

		const match = /^Digit([1-9])$/.exec( e.code );
		const view = match && VIEWPOINTS[ match[ 1 ] - 1 ];
		if ( view && ! e.repeat && ! ( e.target instanceof HTMLInputElement ) ) goTo( view );

	} );

}

function setUpDragAndDrop( models, getPlacement ) {

	window.addEventListener( 'dragover', e => e.preventDefault() );
	window.addEventListener( 'drop', e => {

		e.preventDefault();
		for ( const file of e.dataTransfer.files ) {

			if ( ! /\.(glb|gltf)$/i.test( file.name ) ) {

				showBanner( `${ file.name } is not a .glb/.gltf file. Convert it first (see README).`, 6000 );
				continue;

			}

			models.loadFile( file, getPlacement() )
				.catch( err => showBanner( `Could not load ${ file.name }: ${ err.message }` ) );

		}

	} );

}

let bannerTimer;
function showBanner( message, timeout = 0 ) {

	const banner = $( 'banner' );
	banner.textContent = message;
	banner.hidden = false;
	clearTimeout( bannerTimer );
	if ( timeout ) bannerTimer = setTimeout( () => banner.hidden = true, timeout );

}

// Key order: ?key= in the URL, then this browser's saved key, then .env.local.
function readApiKey() {

	const fromUrl = new URLSearchParams( window.location.search ).get( 'key' );
	if ( fromUrl ) {

		storage( () => localStorage.setItem( STORAGE_KEY, fromUrl ) );
		return fromUrl;

	}

	return storage( () => localStorage.getItem( STORAGE_KEY ) ) || import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

}

// localStorage can throw in private windows; the app still works without it.
function storage( fn ) {

	try {

		return fn();

	} catch {

		return null;

	}

}
