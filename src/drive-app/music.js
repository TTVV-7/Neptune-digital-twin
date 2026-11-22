// The music (docs/world-drive.md, "Music"): the owner's own tracks, made in Suno on a paid plan
// (so World Drive may use them), from drive/public/music/ (AAC, 96 kbps, all at -16 LUFS so none is
// louder than the others). A playlist for each scene: the globe's while picking a place (and on
// through a drop-in, which is too short for a track of its own), and each world's while driving
// there, its tracks in turn. A track fades into the next as the scene changes, and goes on to the
// next of its playlist when it ends (a playlist of one loops). Paused, it's quieter.
//
// Through WebAudio (horns.js's AudioContext, made at the first click or key, as a browser won't
// start sound before): an <audio> element a track, each through a gain, so a fade works on an
// iPhone too, where an element's own volume can't be set. A track's file is only asked for once
// it's about to play. The switch and the volume are kept in this browser (the pause menu's and the
// globe panel's, main.js); off, nothing is loaded at all.

import { hornAudio } from './horns.js';
import { storage } from './places.js';

const KEY = 'world-drive.music';
const VOLUME_KEY = 'world-drive.music-volume';
const PATH = '/music/';
// The tracks, by their file's name in drive/public/music/.
export const TRACKS = {
	'warm-analog-pads': 'Warm Analog Pads',
	'arcade-momentum': 'Arcade Momentum',
	'golden-hour-drive': 'Golden Hour Drive',
	'buant-groove': 'Buant Groove',
	'moonlit-driver': 'Moonlit Driver',
	'weightless-pulse': 'Weightless Pulse',
	'canyon-echoes': 'Canyon Echoes',
	'crystalline-waves': 'Crystalline Waves',
	'crystalline-pads': 'Crystalline Pads',
	'drive-anywhere': 'Drive Anywhere',
	'countdown-groove': 'Countdown Groove',
	'gliding-above-the-clouds': 'Gliding Above the Clouds',
};
// Each scene's tracks, in the order they're played: the globe's (with the theme song, Drive
// Anywhere), each world's while driving, and two that take over from a world's while they last: a
// challenge's run (from its countdown to its finish) and the plane.
export const PLAYLISTS = {
	globe: [ 'warm-analog-pads', 'drive-anywhere' ],
	earth: [ 'arcade-momentum', 'golden-hour-drive', 'buant-groove' ],
	moon: [ 'moonlit-driver', 'weightless-pulse' ],
	mars: [ 'canyon-echoes' ],
	vesta: [ 'crystalline-waves' ],
	ceres: [ 'crystalline-pads' ],
	challenge: [ 'countdown-groove' ],
	plane: [ 'gliding-above-the-clouds' ],
};
// How long (ms) after a challenge run or a flight ends the world's music comes back: a quick hop
// out of the plane and in again doesn't swap the music twice.
const AFTER = 4000;
const VOLUME = 0.6;
const PAUSED = 0.4;
const FADE = 1.5;

// The music for the page: update( { mode, world } ) as either changes (main.js's setMode and
// setWorld); setOn, setVolume and on / volume for the settings, and onChange( fn ) to hear of them
// (so the pause menu's switch and the globe's stay the same). `enabled` false (the dev server's
// tests, unless one asks) makes it do nothing at all.
export function createMusic( { enabled = true } = {} ) {

	let on = storage( () => localStorage.getItem( KEY ) ) !== 'off';
	let volume = Number( storage( () => localStorage.getItem( VOLUME_KEY ) ) );
	if ( ! Number.isFinite( volume ) || volume < 0 || volume > 1 || storage( () => localStorage.getItem( VOLUME_KEY ) ) === null ) volume = VOLUME;
	let context = null;
	let master = null;
	let scene = null;
	let paused = false;
	let base = null; // the scene without an activity
	let activity = null; // 'challenge', 'plane' or null
	let activityEnds = 0;
	let playing = null; // { id, element, gain }
	const turns = {}; // each scene's next track (its index in the playlist)
	const listeners = new Set();
	const elements = new Map();

	function sceneOf( mode, world ) {

		if ( mode === 'driving' || mode === 'paused' ) return PLAYLISTS[ world ] ? world : 'globe';
		// The globe, and a drop-in (on with the globe's, too short for its own).
		return mode === 'dropping' && scene ? scene : 'globe';

	}

	// The AudioContext and the master gain, once there's been a click or a key.
	function ready() {

		if ( context ) return true;
		context = hornAudio();
		if ( ! context ) return false;
		master = context.createGain();
		master.gain.value = level();
		master.connect( context.destination );
		return true;

	}

	function level() {

		return on ? volume * ( paused ? PAUSED : 1 ) : 0;

	}

	function setLevel() {

		if ( ! master ) return;
		const now = context.currentTime;
		master.gain.cancelScheduledValues( now );
		master.gain.setValueAtTime( master.gain.value, now );
		master.gain.linearRampToValueAtTime( level(), now + 0.3 );

	}

	function nodeFor( id ) {

		let node = elements.get( id );
		if ( node ) return node;
		const element = new Audio();
		element.preload = 'auto';
		element.src = `${ PATH }${ id }.m4a`;
		const gain = context.createGain();
		gain.gain.value = 0;
		context.createMediaElementSource( element ).connect( gain );
		gain.connect( master );
		element.addEventListener( 'ended', () => {

			if ( playing?.element === element ) next();

		} );
		node = { id, element, gain };
		elements.set( id, node );
		return node;

	}

	function fade( node, to ) {

		const now = context.currentTime;
		node.gain.gain.cancelScheduledValues( now );
		node.gain.gain.setValueAtTime( node.gain.gain.value, now );
		node.gain.gain.linearRampToValueAtTime( to, now + FADE );

	}

	function stop( node ) {

		fade( node, 0 );
		setTimeout( () => {

			if ( playing !== node ) node.element.pause();

		}, FADE * 1000 + 100 );

	}

	function start( id ) {

		const node = nodeFor( id );
		if ( playing && playing !== node ) stop( playing );
		if ( playing === node && ! node.element.paused ) return;
		const list = PLAYLISTS[ scene ];
		node.element.loop = list.length === 1;
		if ( node.element.ended ) node.element.currentTime = 0;
		playing = node;
		node.element.play().catch( () => {} );
		fade( node, 1 );

	}

	// The scene's next track.
	function next() {

		const list = PLAYLISTS[ scene ];
		const at = turns[ scene ] ?? 0;
		turns[ scene ] = ( at + 1 ) % list.length;
		const id = list[ at ];
		const node = nodeFor( id );
		if ( playing === node ) node.element.currentTime = 0;
		start( id );

	}

	function play() {

		if ( ! enabled || ! on || ! scene || ! ready() ) return;
		if ( context.state === 'suspended' ) context.resume();
		// Back to a scene that's playing already (the globe after a drop-in that failed): on with it.
		if ( playing && PLAYLISTS[ scene ].includes( playing.id ) && ! playing.element.paused ) return;
		next();

	}

	// The scene: the activity's while there is one, otherwise the mode's and world's.
	function choose() {

		const was = scene;
		scene = activity && base !== 'globe' ? activity : base;
		if ( scene !== was && context ) play();

	}

	function silence() {

		if ( playing ) stop( playing );
		playing = null;

	}

	// Sound only after a click or a key; then whatever the scene is.
	if ( enabled && typeof document !== 'undefined' ) {

		const unlock = () => {

			document.removeEventListener( 'pointerdown', unlock, true );
			document.removeEventListener( 'keydown', unlock, true );
			play();

		};

		document.addEventListener( 'pointerdown', unlock, true );
		document.addEventListener( 'keydown', unlock, true );
		// Not on while the page is out of sight (another tab, the phone locked).
		document.addEventListener( 'visibilitychange', () => {

			if ( ! context ) return;
			if ( document.hidden ) context.suspend();
			else if ( on ) context.resume();

		} );

	}

	function told() {

		for ( const fn of listeners ) fn( { on, volume } );

	}

	return {
		get on() {

			return on;

		},
		get volume() {

			return volume;

		},
		update( { mode, world } ) {

			base = sceneOf( mode, world );
			paused = mode === 'paused';
			if ( mode !== 'driving' && mode !== 'paused' ) activity = null;
			setLevel();
			choose();

		},
		// What's going on in the drive, every frame (main.js): 'challenge' (a run counting down or
		// racing), 'plane' (flying), or null. The world's music is back AFTER ms after one ends.
		setActivity( what, now = performance.now() ) {

			if ( what ) {

				activityEnds = 0;
				if ( what === activity ) return;
				activity = what;
				choose();

			} else if ( activity ) {

				if ( ! activityEnds ) activityEnds = now + AFTER;
				if ( now < activityEnds ) return;
				activity = null;
				activityEnds = 0;
				choose();

			}

		},
		setOn( yes ) {

			on = !! yes;
			storage( () => localStorage.setItem( KEY, on ? 'on' : 'off' ) );
			if ( on ) {

				setLevel();
				play();

			} else {

				setLevel();
				silence();

			}

			told();

		},
		setVolume( value ) {

			volume = Math.min( 1, Math.max( 0, Number( value ) || 0 ) );
			storage( () => localStorage.setItem( VOLUME_KEY, String( volume ) ) );
			setLevel();
			told();

		},
		onChange( fn ) {

			listeners.add( fn );
			return () => listeners.delete( fn );

		},
		// What's playing, for the tests: { scene, track } (track null when nothing is).
		get now() {

			return { scene, track: playing && ! playing.element.paused ? playing.id : null };

		},
	};

}
