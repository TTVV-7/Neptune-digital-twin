// World Drive's music (docs/world-drive.md, "Music"): a song for each world, looping, from the first
// drive on (a browser only plays sound after a click or a key, and a drive is always one), changing
// as the world does: "Road to Nowhere" on the Earth, "The Long Way Round the Moon" on the Moon, and
// "The Long Way Round" on Mars, Vesta and Ceres. Made by the owner with Suno. It goes on through
// pausing and the globe, quieter while paused, and the pause menu's "Music" switch turns it off
// (kept in this browser; on unless it's been switched off). Nothing is downloaded until it plays: an
// <audio> element streams its song (about 3.5 MB each, AAC, so every browser plays it) as it's
// heard, and only the song of the world being driven.

const KEY = 'world-drive.music';
const SONGS = {
	earth: { src: 'music/road-to-nowhere.m4a', title: 'Road to Nowhere' },
	moon: { src: 'music/the-long-way-round-the-moon.m4a', title: 'The Long Way Round the Moon' },
	other: { src: 'music/the-long-way-round.m4a', title: 'The Long Way Round' },
};
// Loud enough to hear, quiet enough for the horn and the bursts (horns.js) over it.
const VOLUME = 0.35;
const PAUSED_VOLUME = 0.15;
// How long (s) a song fades in, and out as another takes its place.
const FADE = 1.2;

// toggle: the pause menu's checkbox. Answers { setWorld( id ), start(), setPaused( paused ), song }.
export function createMusic( { toggle = null } = {} ) {

	let on = stored();
	let started = false;
	let world = 'earth';
	let paused = false;
	let audio = null;

	if ( toggle ) {

		toggle.checked = on;
		toggle.addEventListener( 'change', () => {

			on = toggle.checked;
			store( on );
			if ( on && started ) play();
			else stop();

		} );

	}

	// The song for a world.
	const songOf = id => SONGS[ id ] ?? SONGS.other;

	function target() {

		return paused ? PAUSED_VOLUME : VOLUME;

	}

	// Fades `element` to `volume` over FADE seconds, then calls done().
	function fade( element, volume, done = () => {} ) {

		const from = element.volume;
		const since = performance.now();
		const step = () => {

			const t = Math.min( 1, ( performance.now() - since ) / ( FADE * 1000 ) );
			element.volume = from + ( volume - from ) * t;
			if ( t < 1 ) requestAnimationFrame( step );
			else done();

		};
		step();

	}

	function play() {

		const song = songOf( world );
		const src = new URL( song.src, document.baseURI ).href;
		if ( audio?.src === src ) {

			if ( audio.paused ) audio.play().catch( () => {} );
			fade( audio, target() );
			return;

		}

		// Another world's song: the old one fades out as this one fades in.
		if ( audio ) {

			const old = audio;
			fade( old, 0, () => old.pause() );

		}

		audio = new Audio();
		audio.preload = 'none';
		audio.loop = true;
		audio.volume = 0;
		audio.src = src;
		const element = audio;
		element.play().then( () => fade( element, target() ) ).catch( () => {} );

	}

	function stop() {

		if ( ! audio ) return;
		const old = audio;
		audio = null;
		fade( old, 0, () => old.pause() );

	}

	return {
		// The world now being shown (worlds.js ids).
		setWorld( id ) {

			if ( id === world ) return;
			world = id;
			if ( on && started ) play();

		},
		// A drive has started (after a click or a key): the music starts, if it's on.
		start() {

			started = true;
			paused = false;
			if ( on ) play();

		},
		setPaused( value ) {

			paused = value;
			if ( audio && on ) fade( audio, target() );

		},
		get song() {

			return audio && ! audio.paused ? songOf( world ).title : null;

		},
		get playing() {

			return !! audio && ! audio.paused;

		},
	};

}

function stored() {

	try {

		return localStorage.getItem( KEY ) !== 'off';

	} catch {

		return true;

	}

}

function store( on ) {

	try {

		localStorage.setItem( KEY, on ? 'on' : 'off' );

	} catch {

		// Without storage it's on again next visit; no worse.

	}

}
