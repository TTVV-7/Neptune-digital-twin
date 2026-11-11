// The horns: the Garage's Horn (a look's `horn`, paint.js), the sound your honk makes for you and
// for those driving near you, who hear it in your horn as it travels with your look. Each is a
// short sound made with WebAudio as it's needed (oscillators, a filter and a gain), nothing to
// load, and none longer than the 0.8 s between honks (live-protocol.js's HONK_GAP). The beep was
// the only horn there was, so it's the free one, and a look from before horns (or a horn this
// page doesn't know, from a newer one) honks with it. friends.js plays the honks; the Garage
// plays a horn as it's picked.

export const HORNS = [
	{ id: 'beep', name: 'Beep', free: true },
	{ id: 'air', name: 'Air horn' },
	{ id: 'bike', name: 'Bike horn' },
	{ id: 'ahooga', name: 'Ahooga' },
	{ id: 'fanfare', name: 'Fanfare' },
	{ id: 'laser', name: 'Laser' },
];

// One AudioContext for the page, made the first time it's asked for after a click or a key
// (a browser won't start sound before), or null where there's none.
let audio = null;
export function hornAudio() {

	if ( audio ) return audio;
	try {

		audio = new AudioContext();

	} catch {

		return null;

	}

	return audio;

}

// Play horn `id` on `context` at `volume` (0 to 1: 1 for your own, less for one farther off), or
// the beep for an id this page doesn't know. Returns the id played (null with no sound).
export function playHorn( context, id, volume = 1 ) {

	if ( ! context ) return null;
	if ( context.state === 'suspended' ) context.resume();
	const played = Object.hasOwn( SOUNDS, id ) ? id : 'beep';
	SOUNDS[ played ]( context, context.currentTime + 0.01, volume );
	return played;

}

// A gain from silence up to `peak` in `attack` s, held until `hold`, and down to silence by `end`
// (s after t), into `to` (the speakers unless it's given).
function envelope( context, t, peak, attack, hold, end, to = context.destination ) {

	const gain = context.createGain();
	gain.gain.setValueAtTime( 0.0001, t );
	gain.gain.exponentialRampToValueAtTime( peak, t + attack );
	gain.gain.setValueAtTime( peak, t + hold );
	gain.gain.exponentialRampToValueAtTime( 0.0001, t + end );
	gain.connect( to );
	return gain;

}

// An oscillator of `type` at `frequency` (Hz), into `to` from `start` to `stop` (s, the context's
// time); returned so its pitch can be moved.
function tone( context, type, frequency, to, start, stop ) {

	const osc = context.createOscillator();
	osc.type = type;
	osc.frequency.setValueAtTime( frequency, start );
	osc.connect( to );
	osc.start( start );
	osc.stop( stop );
	return osc;

}

const SOUNDS = {

	// A soft two-note beep (the horn as it always was).
	beep( context, t, volume ) {

		const gain = envelope( context, t, 0.12 * volume, 0.03, 0.16, 0.38 );
		for ( const frequency of [ 415, 523 ] ) tone( context, 'triangle', frequency, gain, t, t + 0.4 );

	},

	// A lorry's air horn: three low buzzing notes at once, a little flat as the air comes, through
	// a filter that takes the edge off.
	air( context, t, volume ) {

		const filter = context.createBiquadFilter();
		filter.type = 'lowpass';
		filter.frequency.value = 1400;
		const gain = envelope( context, t, 0.07 * volume, 0.05, 0.5, 0.72, filter );
		filter.connect( context.destination );
		for ( const frequency of [ 155, 196, 233 ] ) {

			const osc = tone( context, 'sawtooth', frequency * 0.94, gain, t, t + 0.75 );
			osc.frequency.exponentialRampToValueAtTime( frequency, t + 0.08 );

		}

	},

	// A bicycle's rubber-bulb horn: honk-honk, two squeaks that drop as the bulb empties.
	bike( context, t, volume ) {

		for ( const at of [ t, t + 0.2 ] ) {

			const filter = context.createBiquadFilter();
			filter.type = 'bandpass';
			filter.frequency.value = 900;
			filter.Q.value = 1.5;
			filter.connect( context.destination );
			const gain = envelope( context, at, 0.16 * volume, 0.015, 0.07, 0.16, filter );
			const osc = tone( context, 'square', 520, gain, at, at + 0.17 );
			osc.frequency.exponentialRampToValueAtTime( 380, at + 0.15 );

		}

	},

	// An old car's "a-oo-ga": a buzz that swoops up and falls back, its filter opening with it
	// like a mouth.
	ahooga( context, t, volume ) {

		const filter = context.createBiquadFilter();
		filter.type = 'lowpass';
		filter.Q.value = 6;
		filter.frequency.setValueAtTime( 500, t );
		filter.frequency.exponentialRampToValueAtTime( 1900, t + 0.3 );
		filter.frequency.exponentialRampToValueAtTime( 700, t + 0.7 );
		filter.connect( context.destination );
		const gain = envelope( context, t, 0.09 * volume, 0.04, 0.55, 0.74, filter );
		const osc = tone( context, 'sawtooth', 150, gain, t, t + 0.76 );
		osc.frequency.exponentialRampToValueAtTime( 320, t + 0.32 );
		osc.frequency.setValueAtTime( 320, t + 0.42 );
		osc.frequency.exponentialRampToValueAtTime( 230, t + 0.7 );

	},

	// Four notes up a major chord, the last held: a little fanfare.
	fanfare( context, t, volume ) {

		[ 523, 659, 784, 1047 ].forEach( ( frequency, i ) => {

			const at = t + i * 0.1;
			const last = i === 3;
			const gain = envelope( context, at, 0.07 * volume, 0.012, last ? 0.3 : 0.07, last ? 0.5 : 0.11 );
			tone( context, 'square', frequency, gain, at, at + ( last ? 0.52 : 0.12 ) );

		} );

	},

	// A space gun: two quick falling zaps.
	laser( context, t, volume ) {

		for ( const at of [ t, t + 0.22 ] ) {

			const gain = envelope( context, at, 0.11 * volume, 0.01, 0.06, 0.2 );
			const osc = tone( context, 'sawtooth', 1600, gain, at, at + 0.21 );
			osc.frequency.exponentialRampToValueAtTime( 180, at + 0.19 );

		}

	},

};
