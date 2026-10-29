import './style.css';
import { PerspectiveCamera, Scene, Timer, Vector3, WebGLRenderer } from 'three';
import { MODELS, PLAYER, SITE, START } from './config.js';
import { enuToLocal, localToEnu, localToLatLon, yawToHeading } from './geo.js';
import { addLights, createGoogleTiles, createPlaceholderGround } from './world.js';
import { ModelManager } from './models.js';
import { createPlacementPanel } from './placement.js';
import { isTyping, WalkController } from './walk.js';

const STORAGE_KEY = 'neptune-twin.google-api-key';
const ENV_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const $ = id => document.getElementById( id );

boot();

function boot() {

	const url = new URL( window.location.href );
	const urlKey = url.searchParams.get( 'key' );
	const askForKey = url.searchParams.has( 'prompt' );

	// Don't leave keys or one-off flags sitting in the address bar or history.
	if ( urlKey !== null || askForKey ) {

		url.searchParams.delete( 'key' );
		url.searchParams.delete( 'prompt' );
		window.history.replaceState( null, '', url.href );

	}

	// Use a key from the link for this visit even if the browser won't let us save it.
	if ( urlKey ) saveKey( urlKey );

	const key = askForKey ? null : urlKey ? { value: urlKey, source: 'the link' } : resolveKey();
	if ( key ) start( key.value, key.source );
	else showKeyPrompt();

}

function showKeyPrompt() {

	const prompt = $( 'key-prompt' );
	const form = prompt.querySelector( 'form' );
	$( 'env-key-note' ).hidden = ! ENV_KEY;
	prompt.hidden = false;
	form.elements.key.focus();

	form.addEventListener( 'submit', e => {

		e.preventDefault();
		const key = form.elements.key.value.trim();
		saveKey( key );
		prompt.hidden = true;
		start( key, 'this browser' );

	} );
	$( 'skip' ).addEventListener( 'click', () => {

		prompt.hidden = true;
		start( null );

	} );

}

// A key typed into the prompt (or passed as ?key=) is saved together with a tag of the
// environment key it replaced. It wins until the environment key changes, so a bad env
// key can be overridden, and fixing the env key later isn't blocked by an old saved one.
function resolveKey() {

	const saved = storage( () => JSON.parse( localStorage.getItem( STORAGE_KEY ) ) );
	if ( saved?.key && saved.env === envTag() ) return { value: saved.key, source: 'this browser' };
	if ( ENV_KEY ) return { value: ENV_KEY, source: 'the environment' };
	return null;

}

function saveKey( key ) {

	storage( () => localStorage.setItem( STORAGE_KEY, JSON.stringify( { key, env: envTag() } ) ) );

}

function envTag() {

	return `${ ENV_KEY.length }:${ ENV_KEY.slice( - 4 ) }`;

}

function start( apiKey, keySource ) {

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

		let tileErrors = 0;
		tiles = createGoogleTiles( {
			apiKey,
			camera,
			renderer,
			onError: ( { tile, error } ) => {

				// Single tiles can fail on a network blip. Speak up when the root fails or Google refuses
				// the key (e.g. revoked mid-session), and briefly when tiles keep failing with none showing.
				const refused = /error code 40[013]\b/.test( error?.message ?? '' );
				if ( tile && ! refused ) {

					tileErrors ++;
					if ( tileErrors >= 2 && tiles.visibleTiles.size === 0 ) {

						showBanner( `Google 3D tiles are failing to load (${ error?.message ?? 'unknown error' }). This is often temporary; if it keeps happening, check your connection.` );
						// Take it back if tiles turn up after all.
						tiles.addEventListener( 'tile-visibility-change', function onVisible( { visible } ) {

							if ( ! visible ) return;
							tiles.removeEventListener( 'tile-visibility-change', onVisible );
							hideBanner();

						} );

					}

					return;

				}

				showBanner(
					`Google 3D tiles failed to load (${ error?.message ?? 'unknown error' }) using the key from ${ keySource }. ` +
					'Check that the key is right, the Map Tiles API is enabled, billing is on, and the key allows this site. ' +
					'Press H to change the key.',
				);

			},
		} );
		ground = tiles.group;

	} else {

		ground = createPlaceholderGround();
		showBanner( 'Running without Google tiles: flat placeholder ground only. Press H to add an API key.', 8000 );

	}

	scene.add( ground );

	const models = new ModelManager( { getGround: () => [ ground ], renderer } );
	scene.add( models.group );

	const controls = new WalkController( camera, renderer.domElement, {
		getColliders: () => [ ground, models.group ],
		getGround: () => [ ground ],
		isInsideModel: point => models.contains( point ),
	} );
	controls.setPose( enuToLocal( START.east, START.north, START.up ), START.heading, START.pitch );
	controls.setMode( START.mode );

	const feetPosition = () => camera.position.clone().setY( camera.position.y - PLAYER.eyeHeight );
	createPlacementPanel( models, { getPlayerPosition: feetPosition } );

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

	window.addEventListener( 'resize', () => {

		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
		renderer.setSize( window.innerWidth, window.innerHeight );
		tiles?.setResolutionFromRenderer( camera, renderer );

	} );

	const timer = new Timer();
	timer.connect( document );
	let hudTimer = 0;
	renderer.setAnimationLoop( time => {

		timer.update( time );
		const dt = Math.min( timer.getDelta(), 0.1 );
		controls.update( dt );
		camera.updateMatrixWorld();
		tiles?.update();
		models.update( dt );
		renderer.render( scene, camera );

		hudTimer -= dt;
		if ( hudTimer <= 0 ) {

			hudTimer = 0.25;
			updateStatus( camera, controls, tiles );
			updateAttribution( tiles, models );

		}

	} );

	// Handy for poking around from the browser console.
	window.twin = { scene, camera, controls, models, tiles, SITE };

}

function updateStatus( camera, controls, tiles ) {

	const { lat, lon } = localToLatLon( camera.position );
	const { east, north } = localToEnu( camera.position );
	const lines = [
		`${ controls.mode === 'walk' ? 'WALKING' : 'FLYING' }${ controls.mode === 'walk' && ! controls.groundFound ? ' (waiting for ground)' : '' }`,
		`lat ${ lat.toFixed( 6 ) }  lon ${ lon.toFixed( 6 ) }`,
		`east ${ east.toFixed( 1 ) } m  north ${ north.toFixed( 1 ) } m`,
		`heading ${ yawToHeading( controls.yaw ).toFixed( 0 ) }°`,
	];
	if ( tiles && tiles.loadProgress < 1 ) lines.push( `loading tiles ${ Math.round( tiles.loadProgress * 100 ) }%` );

	const status = $( 'status' );
	status.hidden = false;
	status.textContent = lines.join( '\n' );

}

// Google's Map Tiles policies require the Google Maps logo next to the data providers
// whenever tiles are on screen, and a note saying which parts of the scene aren't Google's.
function updateAttribution( tiles, models ) {

	const el = $( 'attribution' );
	el.hidden = ! tiles || tiles.visibleTiles.size === 0;
	if ( el.hidden ) return;

	$( 'attribution-credits' ).textContent = tiles.getAttributions()
		.filter( a => a.type === 'string' && a.value )
		.map( a => a.value )
		.join( ' · ' );
	$( 'attribution-hybrid' ).hidden = models.entries.length === 0;

}

function setUpOverlays( controls ) {

	const hint = $( 'hint' );
	const help = $( 'help' );
	hint.hidden = false;
	controls.onLockChange = locked => {

		hint.hidden = locked;
		if ( locked ) help.hidden = true;

	};

	// Capture phase, because lil-gui stops key events from bubbling out of its controls.
	window.addEventListener( 'keydown', e => {

		if ( e.code === 'KeyH' && ! e.repeat && ! isTyping( e ) && ! e.ctrlKey && ! e.metaKey && ! e.altKey ) {

			help.hidden = ! help.hidden;
			if ( ! help.hidden ) document.exitPointerLock();

		}

	}, true );

	$( 'change-key' ).addEventListener( 'click', () => {

		const url = new URL( window.location.href );
		url.searchParams.set( 'prompt', '' );
		window.location.href = url.href;

	} );

}

function setUpDragAndDrop( models, getPlacement ) {

	window.addEventListener( 'dragover', e => e.preventDefault() );
	window.addEventListener( 'drop', e => {

		e.preventDefault();
		const files = [ ...e.dataTransfer.files ];
		const isModel = file => /\.(glb|gltf)$/i.test( file.name );
		const modelFiles = files.filter( isModel );
		// Anything else dropped alongside a .gltf is treated as its .bin and texture files.
		const companions = files.filter( file => ! isModel( file ) );

		if ( modelFiles.length === 0 ) {

			showBanner( `${ files.map( f => f.name ).join( ', ' ) }: not a .glb/.gltf file. Convert it first (see README).`, 6000 );
			return;

		}

		for ( const file of modelFiles ) {

			models.loadFile( file, getPlacement(), companions )
				.then( () => {

					// The dev server can't serve these names from public/models, so the copied config would break.
					if ( /[#?%]/.test( file.name ) ) showBanner( `Rename ${ file.name } without # ? or % before copying it to public/models.`, 8000 );

				} )
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
	if ( timeout ) bannerTimer = setTimeout( hideBanner, timeout );

}

function hideBanner() {

	clearTimeout( bannerTimer );
	$( 'banner' ).hidden = true;

}

// localStorage can throw in private windows; the app still works without it.
function storage( fn ) {

	try {

		return fn();

	} catch {

		return null;

	}

}
