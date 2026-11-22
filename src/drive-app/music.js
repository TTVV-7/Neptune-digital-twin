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
// A moment of silence (a WAV of 0.1 s, 8 kHz), which the decks are unlocked with (see decks).
const SILENCE = ( () => {

	const samples = 800;
	const bytes = new Uint8Array( 44 + samples );
	const view = new DataView( bytes.buffer );
	const text = ( at, value ) => [ ...value ].forEach( ( c, i ) => view.setUint8( at + i, c.charCodeAt( 0 ) ) );
	text( 0, 'RIFF' ); view.setUint32( 4, 36 + samples, true ); text( 8, 'WAVE' ); text( 12, 'fmt ' );
	view.setUint32( 16, 16, true ); view.setUint16( 20, 1, true ); view.setUint16( 22, 1, true );
	view.setUint32( 24, 8000, true ); view.setUint32( 28, 8000, true ); view.setUint16( 32, 1, true ); view.setUint16( 34, 8, true );
	text( 36, 'data' ); view.setUint32( 40, samples, true );
	bytes.fill( 128, 44 );
	let binary = '';
	for ( const byte of bytes ) binary += String.fromCharCode( byte );
	return `data:audio/wav;base64,${ typeof btoa === 'function' ? btoa( binary ) : '' }`;

} )();

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
		makeDecks();
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

	// Two decks, each an <audio> element through a gain: the track playing on one, the one before
	// fading out on the other. Always these two, whatever's played: an iPhone lets a page start an
	// element playing only in a tap (or a moment after it), so a new element for each track was
	// turned away (play() rejected, silence) whenever its scene came later than that, as driving
	// does, after the drop-in's wait: only the globe's (started in the first tap) and the plane's
	// (its ✈ a tap just before) were heard. An element once played in a tap may change its track and
	// play again whenever, so both are started (on a moment of silence) in the first tap, then given
	// each track's file in turn.
	const decks = [];
	function deckFor( id ) {

		const free = decks.find( deck => deck !== playing ) ?? decks[ 0 ];
		if ( playing?.id === id ) return playing;
		const url = `${ PATH }${ id }.m4a`;
		if ( free.id !== id ) {

			free.id = id;
			free.element.src = url;

		}

		return free;

	}

	function makeDecks() {

		for ( let i = 0; i < 2; i ++ ) {

			const element = new Audio();
			element.preload = 'auto';
			const gain = context.createGain();
			gain.gain.value = 0;
			context.createMediaElementSource( element ).connect( gain );
			gain.connect( master );
			const deck = { id: null, element, gain, unlocked: false };
			element.addEventListener( 'ended', () => {

				if ( playing === deck ) next();

			} );
			decks.push( deck );

		}

	}

	// In a tap: each deck not yet played plays a moment of silence (unless it's already playing), so
	// it's one the browser lets play later.
	function unlockDecks() {

		for ( const deck of decks ) {

			if ( deck.unlocked || deck === playing ) continue;
			deck.unlocked = true;
			deck.id = null;
			deck.element.src = SILENCE;
			deck.element.play().then( () => {

				if ( deck.element.src === SILENCE ) deck.element.pause();

			}, () => {

				deck.unlocked = false;

			} );

		}

	}

	function fade( deck, to ) {

		const now = context.currentTime;
		deck.gain.gain.cancelScheduledValues( now );
		deck.gain.gain.setValueAtTime( deck.gain.gain.value, now );
		deck.gain.gain.linearRampToValueAtTime( to, now + FADE );

	}

	function stop( deck ) {

		fade( deck, 0 );
		setTimeout( () => {

			if ( playing !== deck ) deck.element.pause();

		}, FADE * 1000 + 100 );

	}

	function start( id ) {

		const deck = deckFor( id );
		if ( playing && playing !== deck ) stop( playing );
		if ( playing === deck && ! deck.element.paused ) return;
		deck.element.loop = PLAYLISTS[ scene ].length === 1;
		if ( deck.element.ended ) deck.element.currentTime = 0;
		playing = deck;
		deck.element.play().catch( () => {} );
		fade( deck, 1 );

	}

	// The scene's next track.
	function next() {

		const list = PLAYLISTS[ scene ];
		const at = turns[ scene ] ?? 0;
		turns[ scene ] = ( at + 1 ) % list.length;
		const id = list[ at ];
		if ( playing?.id === id ) playing.element.currentTime = 0;
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

	// Sound only after a click or a key. Every one of them (not only the first): the decks unlocked,
	// the context going, and the scene's track started, or started again if the browser turned it
	// away (a track that should be playing and isn't).
	if ( enabled && typeof document !== 'undefined' ) {

		const tapped = () => {

			if ( ! on || ! ready() ) return;
			unlockDecks();
			if ( context.state === 'suspended' ) context.resume();
			if ( playing && playing.element.paused && PLAYLISTS[ scene ]?.includes( playing.id ) ) playing.element.play().catch( () => {} );
			else play();

		};

		document.addEventListener( 'pointerdown', tapped, true );
		document.addEventListener( 'keydown', tapped, true );
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
