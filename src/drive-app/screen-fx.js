import { BufferAttribute, Color, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, MathUtils, Mesh, ShaderMaterial } from 'three';
import { storage } from './places.js';

// What World Drive does to the whole view for effect, besides what the Driver does to its camera
// (drive.js: a hit's shake, and the jolts as the booster lights, a mini-turbo goes and the sonic
// boom, which punch the field of view wider and nod the view; main.js adds `driver.punch` to the
// field of view): speed lines streaming out past the edges of the view while boosting, thicker the
// faster it goes, and the edges of the view flashing white going into overdrive.
//
// All of it is the pause menu's "Camera effects" switch (kept in this browser, on unless it's been
// turned off), and none of it is there for a visitor whose system asks for less motion
// (prefers-reduced-motion): then the bursts of drive-fx.js flash less too (`calm`), and the HUD's
// gauge glows rather than pulses. On a touch screen the bursts are thinner (`detail`) and there are
// half as many lines.
//
// The speed lines cost little: one instanced batch of thin quads placed straight on the screen by
// their shader, from numbers given them once; each frame only its time and how strong they are
// change. They're drawn over everything, without depth, as the HUD is.

const KEY = 'world-drive.camera-fx';
const LINES = 48;
// Boosting at `from` of the booster's top speed (twice the ride's, see drive.js) the lines start;
// at `full` they're as thick as they get. Overdrive has them at full.
const SPEED_LINES = { from: 0.3, full: 0.9, rise: 6, fall: 3 };
// How much of a share of the ride's top speed the booster's top speed is (BOOST_SPEED in drive.js).
const BOOSTED = 2;
// On a touch screen, this share of a burst's particles (drive-fx.js) and of the lines.
const TOUCH_DETAIL = 0.6;
// How long (ms) the white edges of overdrive flash.
const WHITEOUT_TIME = 600;

const VERTEX = /* glsl */`
attribute vec4 aLine;
uniform float uTime;
uniform float uAmount;
varying float vAlong;
varying float vAcross;
varying float vAlpha;

void main() {

	// Each line runs out from inside the view past its edge, again and again: aLine is its angle
	// round the middle, where in its run it starts, how fast it runs and how big it is.
	float t = fract( uTime * aLine.z + aLine.y );
	float head = mix( 0.7, 1.55, t );
	float length = ( 0.08 + 0.22 * uAmount ) * ( 0.6 + aLine.w );
	float along = position.y * 0.5 + 0.5;
	vec2 dir = vec2( cos( aLine.x ), sin( aLine.x ) );
	vec2 at = dir * ( head - length * ( 1.0 - along ) );
	at += vec2( - dir.y, dir.x ) * position.x * ( 0.002 + 0.0035 * aLine.w ) * ( 0.6 + 0.8 * uAmount );
	gl_Position = vec4( at, 0.0, 1.0 );
	vAlong = along;
	vAcross = position.x;
	// Fading in and out over its run, and only out by the edges, never over the vehicle.
	vAlpha = uAmount * sin( 3.14159 * t ) * smoothstep( 0.7, 1.0, head );

}
`;

const FRAGMENT = /* glsl */`
uniform vec3 uColour;
varying float vAlong;
varying float vAcross;
varying float vAlpha;

void main() {

	// Bright at its outer end, nothing at its inner one, and soft across.
	float alpha = vAlpha * vAlong * vAlong * ( 1.0 - abs( vAcross ) ) * 0.65;
	if ( alpha < 0.004 ) discard;
	gl_FragColor = vec4( uColour, alpha );

}
`;

// scene: where the lines are drawn. driver: the Driver, whose `motion` and `effects` this sets.
// toggle: the pause menu's checkbox. touch(): whether this is a touch screen (now).
export function createScreenFx( { scene, driver, toggle = null, touch = () => false } ) {

	const reduced = window.matchMedia?.( '(prefers-reduced-motion: reduce)' ) ?? null;
	let chosen = storage( () => localStorage.getItem( KEY ) ) !== 'off';
	driver.effects ??= { detail: 1, calm: false };

	const lines = makeLines();
	scene.add( lines );
	const whiteout = document.getElementById( 'whiteout' );
	let whiteoutTimer;
	let amount = 0;
	let clock = 0;
	let wasSonic = false;

	if ( toggle ) toggle.addEventListener( 'change', () => setEnabled( toggle.checked ) );
	reduced?.addEventListener?.( 'change', apply );
	apply();

	// What's on: the switch, unless the system asks for less motion.
	function apply() {

		const calm = !! reduced?.matches;
		driver.effects.calm = calm;
		driver.motion = chosen && ! calm;
		if ( toggle ) toggle.checked = chosen;
		if ( ! driver.motion ) {

			driver.shake = 0;
			flash( false );

		}

	}

	function setEnabled( on ) {

		chosen = !! on;
		storage( () => localStorage.setItem( KEY, chosen ? 'on' : 'off' ) );
		apply();

	}

	function flash( on ) {

		if ( ! whiteout ) return;
		clearTimeout( whiteoutTimer );
		whiteout.classList.remove( 'on' );
		if ( ! on ) return;
		void whiteout.offsetWidth;
		whiteout.classList.add( 'on' );
		whiteoutTimer = setTimeout( () => whiteout.classList.remove( 'on' ), WHITEOUT_TIME );

	}

	return {

		// Each frame: `driving`, whether the view is the driver's (driving or paused).
		update( dt, driving ) {

			const small = touch();
			driver.effects.detail = small ? TOUCH_DETAIL : 1;
			const on = driving && driver.active && driver.motion;
			let want = 0;
			if ( on ) {

				const top = ( driver.spec?.topSpeed ?? 100 ) / 3.6 * BOOSTED;
				const boosting = driver.firing || !! driver.boost || driver.supersonic;
				const share = Math.abs( driver.speed ) / top;
				// (Overdrive's view eases out, never quite to nothing.)
				want = Math.max( boosting ? MathUtils.smoothstep( share, SPEED_LINES.from, SPEED_LINES.full ) : 0, driver.warp > 0.01 ? driver.warp : 0 );

			}

			amount += ( want - amount ) * Math.min( 1, dt * ( want > amount ? SPEED_LINES.rise : SPEED_LINES.fall ) );
			if ( amount < 0.01 && want < 0.01 ) amount = 0;
			// Faster as they get thicker.
			clock += dt * ( 0.6 + amount );
			lines.visible = amount > 0;
			lines.material.uniforms.uTime.value = clock;
			lines.material.uniforms.uAmount.value = amount;
			lines.geometry.instanceCount = small ? LINES / 2 : LINES;

			// Into overdrive: the edges of the view flash white.
			const sonic = on && driver.supersonic;
			if ( sonic && ! wasSonic ) flash( true );
			wasSonic = sonic;

		},

		setEnabled,

		// Whether the switch is on (the visitor's choice; the system may still ask for less motion).
		get enabled() {

			return chosen;

		},

		// How thick the speed lines are now, 0 to 1.
		get lines() {

			return amount;

		},

		dispose() {

			scene.remove( lines );
			lines.geometry.dispose();
			lines.material.dispose();
			reduced?.removeEventListener?.( 'change', apply );
			flash( false );

		},

	};

}

// The lines: a quad each (across it -1 to 1, along it from its inner end -1 to its outer 1),
// scattered round the middle of the view at random.
function makeLines() {

	const geometry = new InstancedBufferGeometry();
	geometry.setIndex( [ 0, 1, 2, 0, 2, 3 ] );
	geometry.setAttribute( 'position', new BufferAttribute( new Float32Array( [ - 1, - 1, 0, 1, - 1, 0, 1, 1, 0, - 1, 1, 0 ] ), 3 ) );
	const line = new Float32Array( LINES * 4 );
	for ( let i = 0; i < LINES; i ++ ) {

		// Spread evenly round, give or take, so half of them (a touch screen's) are too.
		line[ i * 4 ] = ( ( i * 0.618034 ) % 1 + ( Math.random() - 0.5 ) * 0.04 ) * Math.PI * 2;
		line[ i * 4 + 1 ] = Math.random();
		line[ i * 4 + 2 ] = 0.9 + Math.random() * 0.9;
		line[ i * 4 + 3 ] = Math.random();

	}

	geometry.setAttribute( 'aLine', new InstancedBufferAttribute( line, 4 ) );
	geometry.instanceCount = LINES;
	const material = new ShaderMaterial( {
		uniforms: { uTime: { value: 0 }, uAmount: { value: 0 }, uColour: { value: new Color( 0xf4faff ) } },
		vertexShader: VERTEX,
		fragmentShader: FRAGMENT,
		transparent: true,
		depthTest: false,
		depthWrite: false,
		// Turned on the screen, half of them face away.
		side: DoubleSide,
	} );
	const mesh = new Mesh( geometry, material );
	mesh.name = 'speed-lines';
	// Placed on the screen by its shader: never culled, never in the way of a ray, drawn last.
	mesh.frustumCulled = false;
	mesh.raycast = () => {};
	mesh.renderOrder = 1000;
	mesh.visible = false;
	return mesh;

}
