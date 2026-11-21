import './lens.css';
import { ClampToEdgeWrapping, DataTexture, HalfFloatType, LinearFilter, RedFormat, RepeatWrapping, RGBAFormat, SRGBColorSpace, UnsignedByteType } from 'three';
import { hasLens, hereLine, LENS_WORDS, lensHeightAt, lensRange, lensTexels, lensTicks, RAMP, STEPS, tickLabel, whatLine } from './lens-heights.js';

// The data lens (docs/world-drive.md, "Data lens"): a switch that colours a world's ground by its real
// measured height, with a scale bar, the dataset named, and while driving the height under the car.
// The far worlds are built from NASA's maps, but a photograph laid on hills doesn't say so: this shows
// it. The colours come from the measured grid alone (lens-heights.js), never the made-up craters the
// game adds for close-up driving, so where the colours stop changing is where the data's detail ends.
//
// It paints with the world's own ground material (body.js: lensAmount and the rest), so it works the
// same on the globe and while driving, needs no square rebuilt, and costs one uniform test when it's
// off. Not on the Earth: its ground is Google's tiles, with no grid of ours under it.
//
// main.js makes one: createLens( { root, body, car } ), `root` the element its button and bar go in,
// `body()` the world's body (body.js) now, `car()` the car's { lat, lon } while driving (or null).
// It keeps its own key (L) and remembers, per viewer, whether it's on and which range was picked.

// How long (s) the colours take to come in or go.
const EASE = 0.25;
// How often (ms) the readout under the car is read.
const READ_EVERY = 500;
const STORE = 'world-drive.lens';

export function createLens( { root, body: bodyNow = () => null, car = () => null } ) {

	const saved = load();
	let on = saved.on;
	// The range picked for driving ("Around me" unless "Whole world" was); the globe always shows the
	// whole world (there's no car to be around).
	let nearPicked = saved.range !== 'world';
	let world = null;
	let body = null;
	let mode = 'globe';
	// The texture of the world being shown, and its lowest and highest (lens-heights.js's lensTexels).
	let built = null;
	let builtFor = null;
	let measuring = false;
	let amount = 0;
	let easing = 0;
	let reading = 0;
	let waiting = 0;
	let here = null;
	const ramp = rampTexture();

	// --- the page's parts ---

	const box = document.createElement( 'div' );
	box.className = 'lens';
	box.hidden = true;
	box.innerHTML = `
		<button type="button" class="lens-button" aria-pressed="false" title="Colour the ground by its real measured height (L)">
			<span class="lens-swatch" aria-hidden="true"></span><span class="lens-label">Heights</span><kbd>L</kbd>
		</button>
		<div class="lens-panel" hidden>
			<div class="lens-top">
				<div class="lens-scale">
					<div class="lens-bar" role="img"><span class="lens-marker" hidden aria-hidden="true">▲</span></div>
					<div class="lens-ticks" aria-hidden="true"></div>
				</div>
				<div class="lens-range" role="group" aria-label="Colour scale range" hidden>
					<button type="button" data-range="world">Whole world</button>
					<button type="button" data-range="near">Around me</button>
				</div>
			</div>
			<p class="lens-here" hidden></p>
			<p class="lens-what"></p>
			<p class="lens-source"></p>
		</div>
	`;
	root.append( box );
	const $ = selector => box.querySelector( selector );
	const button = $( '.lens-button' );
	const label = $( '.lens-label' );
	const panel = $( '.lens-panel' );
	const bar = $( '.lens-bar' );
	const marker = $( '.lens-marker' );
	const ticks = $( '.lens-ticks' );
	const rangeGroup = $( '.lens-range' );
	const hereText = $( '.lens-here' );
	const what = $( '.lens-what' );
	const source = $( '.lens-source' );
	const gradient = `linear-gradient( to right, ${ RAMP.join( ', ' ) } )`;
	bar.style.background = gradient;
	$( '.lens-swatch' ).style.background = gradient;

	button.addEventListener( 'click', () => set( ! on ) );
	rangeGroup.addEventListener( 'click', event => {

		const pick = event.target.closest( '[data-range]' );
		if ( ! pick ) return;
		nearPicked = pick.dataset.range === 'near';
		save();
		show();

	} );

	// L, as long as nothing's being typed, no dialog's open, and the world has a lens.
	function onKey( event ) {

		if ( event.code !== 'KeyL' || event.repeat || event.ctrlKey || event.metaKey || event.altKey ) return;
		const target = event.target;
		if ( target instanceof Element && target.closest( 'input, textarea, select, [contenteditable=""], [contenteditable="true"]' ) ) return;
		if ( document.querySelector( 'dialog[open]' ) ) return;
		if ( ! hasLens( world ) ) return;
		event.preventDefault();
		set( ! on );

	}

	addEventListener( 'keydown', onKey );

	// --- on, off, which world ---

	function set( value ) {

		value = !! value;
		if ( value && ! hasLens( world ) ) return;
		on = value;
		save();
		if ( on ) ensure();
		show();
		ease();

	}

	// The world now (its id and body, as main.js's setWorld has them): the last world's texture goes
	// (8 MB each), and this one's is made when the lens is first on here.
	function setWorld( id, next = bodyNow() ) {

		if ( id === world && next === body ) return;
		if ( body ) {

			body.material.uniforms.lensAmount.value = 0;
			body.material.uniforms.lensHeights.value = placeholder;

		}

		if ( built ) built.texture.dispose();
		built = null;
		builtFor = null;
		world = id;
		body = hasLens( id ) ? next : null;
		amount = 0;
		here = null;
		if ( on && body ) ensure();
		show();
		ease();

	}

	// main.js's mode ('globe', 'driving', 'paused'): the readout and the range switch are for
	// driving (and paused, which is still on the road).
	function setMode( next ) {

		mode = next === 'globe' ? 'globe' : 'drive';
		here = null;
		show();

	}

	// Make this world's texture, once its heights are in (a world's body loads them when it's first
	// shown: until then, try again shortly). It takes a moment, so the button says so first.
	function ensure() {

		if ( ! body || builtFor === body || measuring ) return;
		const table = body.heights?.();
		if ( ! table ) {

			clearTimeout( waiting );
			waiting = setTimeout( () => on && ensure(), 300 );
			measuring = false;
			show();
			return;

		}

		measuring = true;
		show();
		const forBody = body;
		const forWorld = world;
		// Let the button's "Measuring…" be drawn before the work.
		requestAnimationFrame( () => setTimeout( () => {

			measuring = false;
			// Another world since: make that one's instead, if the lens is still on.
			if ( forBody !== body ) {

				if ( on ) ensure();
				return;

			}

			const texels = lensTexels( forWorld, table );
			const texture = new DataTexture( texels.half, texels.columns, texels.rows, RedFormat, HalfFloatType );
			texture.wrapS = RepeatWrapping;
			texture.wrapT = ClampToEdgeWrapping;
			texture.magFilter = LinearFilter;
			texture.minFilter = LinearFilter;
			texture.generateMipmaps = false;
			texture.needsUpdate = true;
			built = { texture, low: texels.low, high: texels.high };
			builtFor = forBody;
			const uniforms = forBody.material.uniforms;
			uniforms.lensHeights.value = texture;
			uniforms.lensRamp.value = ramp;
			show();
			ease();

		}, 0 ) );

	}

	// --- what's shown ---

	function rangeKind() {

		return mode === 'drive' && nearPicked ? 'near' : 'world';

	}

	function show() {

		const available = hasLens( world ) && !! body;
		box.hidden = ! available;
		button.setAttribute( 'aria-pressed', String( on ) );
		box.classList.toggle( 'on', on );
		const busy = on && available && ! built;
		label.textContent = busy ? 'Measuring…' : 'Heights';
		panel.hidden = ! on || ! built;
		if ( ! available || ! built ) {

			stopReading();
			return;

		}

		const kind = rangeKind();
		const [ low, high ] = lensRange( kind, built, here ?? 0 );
		const uniforms = body.material.uniforms;
		uniforms.lensLow.value = low;
		uniforms.lensHigh.value = high;
		uniforms.lensStep.value = STEPS[ kind ];
		const span = high - low;
		ticks.replaceChildren( ...lensTicks( low, high ).map( value => {

			const tick = document.createElement( 'span' );
			tick.textContent = tickLabel( value );
			const at = ( value - low ) / span;
			tick.style.left = `${ at * 100 }%`;
			tick.classList.toggle( 'start', at < 0.05 );
			tick.classList.toggle( 'end', at > 0.95 );
			return tick;

		} ) );
		bar.setAttribute( 'aria-label', `Colour scale: dark violet at ${ tickLabel( low ) } to yellow at ${ tickLabel( high ) }` );
		const driving = mode === 'drive';
		rangeGroup.hidden = ! driving;
		for ( const pick of rangeGroup.querySelectorAll( '[data-range]' ) ) pick.setAttribute( 'aria-pressed', String( ( pick.dataset.range === 'near' ) === ( kind === 'near' ) ) );
		what.textContent = whatLine( world, kind );
		source.textContent = `${ LENS_WORDS[ world ].source } Colours show the measured grid only.`;
		if ( on && driving ) startReading();
		else stopReading();
		hereText.hidden = ! ( on && driving && here !== null );
		marker.hidden = hereText.hidden;
		if ( here !== null ) {

			hereText.textContent = hereLine( world, here );
			marker.style.left = `${ Math.min( 1, Math.max( 0, ( here - low ) / span ) ) * 100 }%`;

		}

	}

	// The height under the car, twice a second while driving with the lens on, from the same grid as
	// the colours (so the number agrees with the colour under the car).
	function startReading() {

		if ( reading ) return;
		reading = setInterval( read, READ_EVERY );
		read();

	}

	function stopReading() {

		clearInterval( reading );
		reading = 0;

	}

	function read() {

		const at = car();
		const table = body?.heights?.();
		if ( ! at || ! table || ! Number.isFinite( at.lat ) || ! Number.isFinite( at.lon ) ) return;
		const h = lensHeightAt( world, table, at.lat, at.lon );
		const before = here;
		here = h;
		// Around the car, the scale follows it a kilometre at a time (lensRange): redraw then; else
		// just the line and the marker.
		if ( before === null || Math.round( before / 1000 ) !== Math.round( h / 1000 ) ) show();
		else {

			const [ low, high ] = lensRange( rangeKind(), built, h );
			hereText.textContent = hereLine( world, h );
			marker.style.left = `${ Math.min( 1, Math.max( 0, ( h - low ) / ( high - low ) ) ) * 100 }%`;

		}

	}

	// Fade the colours in or out over EASE.
	function ease() {

		if ( easing ) return;
		let last = performance.now();
		const step = now => {

			const dt = Math.min( 0.1, ( now - last ) / 1000 );
			last = now;
			const target = on && built && body ? 1 : 0;
			amount = target > amount ? Math.min( target, amount + dt / EASE ) : Math.max( target, amount - dt / EASE );
			if ( body ) body.material.uniforms.lensAmount.value = amount;
			if ( amount === target ) {

				easing = 0;
				return;

			}

			easing = requestAnimationFrame( step );

		};

		easing = requestAnimationFrame( step );

	}

	function save() {

		try {

			localStorage.setItem( STORE, JSON.stringify( { on, range: nearPicked ? 'near' : 'world' } ) );

		} catch {

			// (Private windows and blocked storage: it just isn't remembered.)

		}

	}

	function dispose() {

		removeEventListener( 'keydown', onKey );
		stopReading();
		cancelAnimationFrame( easing );
		clearTimeout( waiting );
		if ( body ) {

			body.material.uniforms.lensAmount.value = 0;
			body.material.uniforms.lensHeights.value = placeholder;

		}

		built?.texture.dispose();
		ramp.dispose();
		box.remove();

	}

	if ( bodyNow() ) setWorld( bodyNow().id, bodyNow() );

	return {
		setWorld,
		setMode,
		set,
		toggle: () => set( ! on ),
		get on() {

			return on;

		},
		// For the tests: the world's measured lowest and highest over its datum (m), once measured.
		get range() {

			return built && { low: built.low, high: built.high };

		},
		dispose,
	};

}

// What a world's lens texture is put back to when it goes (a single cell: the shader doesn't read it
// while lensAmount is 0).
const placeholder = ( () => {

	const texture = new DataTexture( new Uint8Array( [ 0, 0, 0, 255 ] ), 1, 1 );
	texture.needsUpdate = true;
	return texture;

} )();

// The colour scale as a 256 × 1 texture, blended between RAMP's stops, in sRGB (as the world's
// picture is), so the GPU turns it to linear light as it reads it.
function rampTexture() {

	const stops = RAMP.map( hex => [ 1, 3, 5 ].map( i => parseInt( hex.slice( i, i + 2 ), 16 ) ) );
	const data = new Uint8Array( 256 * 4 );
	for ( let i = 0; i < 256; i ++ ) {

		const t = i / 255 * ( stops.length - 1 );
		const k = Math.min( stops.length - 2, Math.floor( t ) );
		const f = t - k;
		for ( let j = 0; j < 3; j ++ ) data[ i * 4 + j ] = Math.round( stops[ k ][ j ] * ( 1 - f ) + stops[ k + 1 ][ j ] * f );
		data[ i * 4 + 3 ] = 255;

	}

	const texture = new DataTexture( data, 256, 1, RGBAFormat, UnsignedByteType );
	texture.colorSpace = SRGBColorSpace;
	texture.magFilter = LinearFilter;
	texture.minFilter = LinearFilter;
	texture.wrapS = ClampToEdgeWrapping;
	texture.wrapT = ClampToEdgeWrapping;
	texture.needsUpdate = true;
	return texture;

}

function load() {

	try {

		const value = JSON.parse( localStorage.getItem( STORE ) ?? '{}' );
		return { on: value?.on === true, range: value?.range === 'world' ? 'world' : 'near' };

	} catch {

		return { on: false, range: 'near' };

	}

}
