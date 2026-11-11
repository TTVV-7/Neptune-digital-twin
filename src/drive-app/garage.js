import './pro.css';
import {
	Box3,
	CanvasTexture,
	CircleGeometry,
	DirectionalLight,
	Group,
	HemisphereLight,
	MathUtils,
	Mesh,
	MeshBasicMaterial,
	PerspectiveCamera,
	Scene,
	SRGBColorSpace,
	Sphere,
	Vector3,
	WebGLRenderer,
} from 'three';
import { createDriveFx } from '../drive-fx.js';
import { frontToYaw } from '../library.js';
import { BOOSTS } from './boosts.js';
import { hornAudio, playHorn } from './horns.js';
import { applyLook, DECALS, defaultLook, FINISHES, FLAMES, fxOf, GLOWS, HORNS, isLocked, isPaintable, lookFor, RIMS, saveLook, savedLook, SMOKES, SWATCHES, TRAILS, unlockOf } from './paint.js';
import { openPass, proBadge } from './pass.js';
import { onProChange } from './pro.js';
import { getLevel, onLevelChange } from './progress.js';
import { access, rideLocked, rideUnlock, unlockChip } from './vehicles.js';

// The Garage: each ride's paint, decals, rims, underglow, boost style, trail and horn (paint.js),
// chosen with the ride turning on a turntable, and kept in this browser for each ride. Opened from a
// Garage button by the ride picker on the globe's panel and in the pause menu, beside one for the
// Supporter Pass. A row over the choices goes straight to each group of them (paint, rims, underglow,
// boost, trail, horn), all in one list that scrolls; a swatch's heading says which is picked.
// Each locked choice says what unlocks it: a level ("Lv 12", levels.js's track), the pass (pro.js:
// a star, with one word on the pass above them all), or either ("Lv 12 · or Pass"). Choosing one
// the pass unlocks opens the pass's sheet; one only a level unlocks says which. A ride that needs
// the pass or a level (vehicles.js's rideLocked) can still be looked at here, its tab starred or
// saying the level. Changes made while paused are on the ride as soon as it drives on.

// How fast the turntable turns (rad/s), and how long a flame or trail shows when it's picked (s).
const TURN = 0.45;
const DEMO = 3;
// The preview's camera: its field of view (°) and how far it looks down on the ride.
const FOV = 30;
const ELEVATION = 0.32;

const PARTS = [
	{ part: 'colour', title: 'Body colour', list: SWATCHES, kind: 'swatch', paint: true },
	{ part: 'finish', title: 'Finish', list: FINISHES, kind: 'word', paint: true },
	{ part: 'decal', title: 'Decal', list: DECALS, kind: 'word', paint: true },
	{ part: 'rim', title: 'Rims', list: RIMS, kind: 'swatch', paint: true },
	{ part: 'glow', title: 'Underglow', list: GLOWS, kind: 'swatch', note: 'A neon glow on the ground under it' },
	...boostParts(),
	{ part: 'trail', title: 'Trail', list: TRAILS, kind: 'word', note: 'Behind you while boosting or flying' },
	{ part: 'smoke', title: 'Smoke colour', list: SMOKES, kind: 'swatch' },
	{ part: 'horn', title: 'Horn', list: HORNS, kind: 'word', note: 'What you honk with (H), for those driving with you' },
];
// Each part's choices in a row of `swatches`, `words` or `styles` (pro.css, levels.css).
const PLURAL = { swatch: 'swatches', word: 'words', style: 'styles' };
// The row over the choices: each group's name and its parts, the first of them shown scrolled to.
const GROUPS = [
	{ name: 'Paint', parts: [ 'colour', 'finish', 'decal' ] },
	{ name: 'Rims', parts: [ 'rim' ] },
	{ name: 'Underglow', parts: [ 'glow' ] },
	{ name: 'Boost', parts: [ 'boost', 'flame' ] },
	{ name: 'Trail', parts: [ 'trail', 'smoke' ] },
	{ name: 'Horn', parts: [ 'horn' ] },
];

// vehicles: from loadVehicles(). panel: the globe's panel (for the ride picked there). models: the
// world's ModelManager, whose loader loads the trucks for the turntable. current(): the ride being
// driven, { entry, vehicle }, or null. onLook(): the ride being driven has a new look on. onOpen(),
// onEdit( part ): opened, and a part of a look changed (for the play stats).
// effects: the driving's effects ({ detail, calm }, which screen-fx.js keeps up to date), so the
// turntable's bursts are as calm and as many as driving's.
export function setUpGarage( { vehicles, panel, models, current, onLook = () => {}, onOpen = () => {}, onEdit = () => {}, effects } ) {

	const dialog = build();
	const canvas = dialog.querySelector( 'canvas' );
	let vehicle = panel.vehicle;
	let look = savedLook( vehicle );
	let preview = null;
	// How many horns have been played here, for the tests.
	let hornsPlayed = 0;

	// The buttons by both ride pickers.
	const globePanel = document.querySelector( '#globe-ui .panel' );
	const pauseCard = document.querySelector( '#pause .card' );
	addButtons( globePanel, () => panel.vehicle );
	addButtons( pauseCard, () => current()?.vehicle ?? panel.vehicle );

	function addButtons( root, which ) {

		const row = document.createElement( 'div' );
		row.className = 'ride-actions';
		row.innerHTML = `
			<button type="button" class="garage-open"><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M2 9 10 3l8 6v8H2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M6 17v-5h8v5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg> Garage</button>
			<button type="button" class="pass-open">⭐ Supporter Pass</button>`;
		row.querySelector( '.garage-open' ).addEventListener( 'click', () => open( which() ) );
		row.querySelector( '.pass-open' ).addEventListener( 'click', () => openPass() );
		// Under the rides, and the word on a locked one picked (panel.js) if there is one.
		( root.querySelector( '.vehicles + .ride-note' ) ?? root.querySelector( '.vehicles' ) ).after( row );

	}

	// --- the choices ---

	const tabs = dialog.querySelector( '.rides' );
	tabs.replaceChildren( ...vehicles.map( v => {

		const tab = document.createElement( 'button' );
		tab.type = 'button';
		tab.className = 'ride-tab';
		tab.dataset.id = v.id;
		tab.textContent = v.name;
		if ( v.pro ) tab.append( Object.assign( document.createElement( 'i' ), { className: 'star', textContent: '⭐', title: 'Supporter Pass' } ) );
		else if ( rideUnlock( v ) ) tab.append( Object.assign( document.createElement( 'i' ), { className: 'level-chip', textContent: unlockChip( rideUnlock( v ), true ), title: `Comes at level ${ rideUnlock( v ).level }, or with the Supporter Pass` } ) );
		tab.addEventListener( 'click', () => show( v ) );
		return tab;

	} ) );

	const options = dialog.querySelector( '.options' );
	for ( const { part, title, list, kind, note } of PARTS ) {

		const section = document.createElement( 'section' );
		section.dataset.part = part;
		section.innerHTML = `<h3><span class="title">${ title }</span><span class="picked"></span></h3>${ note ? `<p class="note">${ note }</p>` : '' }<div class="choices ${ PLURAL[ kind ] }"></div>`;
		section.querySelector( '.choices' ).replaceChildren( ...list.map( choice => {

			const button = document.createElement( 'button' );
			button.type = 'button';
			button.className = `choice ${ kind }`;
			button.dataset.id = choice.id;
			button.dataset.name = choice.name;
			button.title = choice.name;
			if ( kind === 'swatch' ) {

				button.style.setProperty( '--swatch', choice.css ?? `#${ choice.hex.toString( 16 ).padStart( 6, '0' ) }` );
				button.setAttribute( 'aria-label', choice.name );

			} else if ( kind === 'style' ) styleButton( button, choice );
			else button.textContent = choice.name;
			button.append( Object.assign( document.createElement( 'i' ), { className: 'star', textContent: '⭐' } ) );
			// What unlocks it, while it's locked (see mark).
			button.append( Object.assign( document.createElement( 'i' ), { className: 'unlock' } ) );
			button.addEventListener( 'click', () => choose( part, choice.id ) );
			return button;

		} ) );
		if ( part === 'decal' ) {

			const number = document.createElement( 'label' );
			number.className = 'number';
			number.innerHTML = 'Number <input type="number" min="0" max="99" step="1" inputmode="numeric" />';
			number.querySelector( 'input' ).addEventListener( 'change', e => {

				const value = MathUtils.clamp( Math.round( Number( e.target.value ) || 0 ), 0, 99 );
				e.target.value = value;
				look.number = value;
				changed( 'decal' );

			} );
			section.append( number );

		}

		options.append( section );

	}

	// The row of groups: each scrolls the list to its first part shown, just under the row (the first
	// group, to the top, with the word on the pass over it), and the one in view is lit.
	const jump = dialog.querySelector( '.jump' );
	jump.replaceChildren( ...GROUPS.map( group => {

		const button = document.createElement( 'button' );
		button.type = 'button';
		button.dataset.group = group.name;
		button.textContent = group.name;
		button.addEventListener( 'click', () => {

			const section = shownSection( group );
			if ( ! section ) return;
			const first = GROUPS.find( shownSection ) === group;
			const top = first ? 0 : options.scrollTop + section.getBoundingClientRect().top - options.getBoundingClientRect().top - jump.offsetHeight - 4;
			options.scrollTo( { top, behavior: 'smooth' } );

		} );
		return button;

	} ) );
	options.addEventListener( 'scroll', () => markJump(), { passive: true } );

	function shownSection( group ) {

		return group.parts.map( part => options.querySelector( `section[data-part="${ part }"]` ) ).find( section => ! section.hidden );

	}

	// The group whose section is under the row now (the last, scrolled to the bottom).
	function markJump() {

		const line = options.getBoundingClientRect().top + jump.offsetHeight + 12;
		const end = options.scrollTop + options.clientHeight >= options.scrollHeight - 2;
		let current = null;
		for ( const group of GROUPS ) {

			const section = shownSection( group );
			if ( section && ( end || section.getBoundingClientRect().top <= line ) ) current = group.name;

		}

		current ??= GROUPS.find( shownSection )?.name;
		for ( const button of jump.children ) button.setAttribute( 'aria-current', String( button.dataset.group === current ) );

	}

	dialog.querySelector( '.factory' ).addEventListener( 'click', () => {

		look = defaultLook( vehicle );
		changed( 'colour' );

	} );
	dialog.querySelector( '.locked-banner button' ).addEventListener( 'click', () => openPass() );
	const levelNote = dialog.querySelector( '.level-note' );
	const passNote = dialog.querySelector( '.pass-note' );
	passNote.prepend( proBadge(), ' ' );
	passNote.querySelector( 'button' ).addEventListener( 'click', () => openPass() );
	dialog.querySelector( '.demo' ).addEventListener( 'click', () => preview?.boost() );

	function locked( part, id ) {

		return rideLocked( vehicle ) || isLocked( vehicle, part, id, access() );

	}

	function choose( part, id ) {

		levelNote.hidden = true;
		if ( locked( part, id ) ) {

			// Only a level gives it: which one (the pass's sheet would only disappoint).
			const unlock = unlockOf( vehicle, part, id );
			if ( unlock && ! unlock.pass && ! rideLocked( vehicle ) ) {

				const name = PARTS.find( p => p.part === part ).list.find( choice => choice.id === id )?.name ?? id;
				levelNote.textContent = `${ name } comes at level ${ unlock.level }: you're level ${ getLevel() }. Drive on!`;
				levelNote.hidden = false;
				return;

			}

			openPass();
			return;

		}

		look[ part ] = id;
		// Smoke's colour only shows with the smoke trail, and the flame's with the classic flame.
		if ( part === 'smoke' ) look.trail = 'smoke';
		if ( part === 'flame' ) look.boost = 'classic';
		// A horn can't be seen on the turntable: it's heard (each pick, the same one again too).
		if ( part === 'horn' ) {

			playHorn( hornAudio(), id );
			hornsPlayed ++;

		}

		changed( part );
		onEdit( part );

	}

	// Keep it, and show it: on the turntable, on the ride being driven, and in the picker's drawing.
	function changed( part ) {

		saveLook( vehicle, look );
		mark();
		preview?.wear( vehicle, shown() );
		if ( SHOWN_OFF.includes( part ) ) preview?.boost();
		const ride = current();
		if ( ride?.vehicle.id === vehicle.id ) {

			applyLook( ride.entry.pivot, lookFor( vehicle, access() ), vehicle );
			onLook();

		}

		recolourIcons();

	}

	// What the turntable shows: the look as chosen, or for a locked ride (a look round it), as saved;
	// anything else locked, as it would be driven.
	function shown() {

		return rideLocked( vehicle ) ? look : lookFor( vehicle, access() );

	}

	function mark() {

		const wearing = shown();
		const rideShut = rideLocked( vehicle );
		for ( const tab of tabs.children ) {

			tab.setAttribute( 'aria-pressed', String( tab.dataset.id === vehicle.id ) );
			const chip = tab.querySelector( '.level-chip' );
			if ( chip ) chip.hidden = ! rideLocked( vehicles.find( v => v.id === tab.dataset.id ) );

		}

		// With the cars there are more rides than fit across: the one shown is scrolled into view.
		tabs.querySelector( '[aria-pressed="true"]' )?.scrollIntoView( { block: 'nearest', inline: 'nearest' } );
		const paintable = vehicle.paintable !== false;
		let anyLocked = false;
		for ( const section of options.querySelectorAll( 'section' ) ) {

			const { part } = section.dataset;
			const { paint, title, kind } = PARTS.find( p => p.part === part );
			section.hidden = paint && ! paintable || part === 'smoke' && wearing.trail !== 'smoke' || boostHidden( part, wearing );
			// A hovercraft's "rims" are its duct and rudders.
			section.querySelector( 'h3 .title' ).textContent = part === 'rim' ? vehicle.rims ?? title : title;
			// A swatch has no word on it: the one picked is named by the heading.
			const picked = kind === 'swatch' ? section.querySelector( `.choice[data-id="${ wearing[ part ] }"]` )?.dataset.name ?? '' : '';
			section.querySelector( 'h3 .picked' ).textContent = picked;
			for ( const button of section.querySelectorAll( '.choice' ) ) {

				const on = button.dataset.id === wearing[ part ];
				const shut = locked( part, button.dataset.id );
				const unlock = shut ? unlockOf( vehicle, part, button.dataset.id ) : null;
				// A locked ride's choices are all the pass's, whatever a level would unlock on the others.
				const pass = !! unlock?.pass || ( shut && rideShut );
				anyLocked ||= pass && ! section.hidden;
				button.classList.toggle( 'on', on );
				button.setAttribute( 'aria-pressed', String( on ) );
				button.classList.toggle( 'locked', shut );
				button.classList.toggle( 'pass', pass );
				button.classList.toggle( 'level-only', shut && ! pass );
				const chip = button.querySelector( '.unlock' );
				const says = unlock && ! rideShut;
				chip.textContent = says ? unlockText( unlock, button.classList.contains( 'swatch' ) ) : '';
				button.title = says ? `${ button.dataset.name }: ${ unlockSentence( unlock ) }` : button.dataset.name;

			}

		}

		// Once, over the choices, rather than on each part: the stars say which. A locked ride has its
		// own word on the pass, over the turntable.
		passNote.hidden = ! anyLocked || rideShut;
		// The groups with nothing shown (a truck's paint and rims) go from the row; a hovercraft's rims
		// are its trim there too.
		for ( const button of jump.children ) button.hidden = ! shownSection( GROUPS.find( group => group.name === button.dataset.group ) );
		jump.querySelector( '[data-group="Rims"]' ).textContent = vehicle.rims ?? 'Rims';
		markJump();

		const number = options.querySelector( '.number' );
		number.hidden = wearing.decal !== 'number';
		number.querySelector( 'input' ).value = wearing.number;
		dialog.querySelector( '.paint-note' ).hidden = paintable;
		const banner = dialog.querySelector( '.locked-banner' );
		banner.hidden = ! rideShut;
		banner.querySelector( 'span' ).textContent = vehicle.pro ? '⭐ A Supporter Pass ride' : `Comes at level ${ rideUnlock( vehicle )?.level }, or with the ⭐ Supporter Pass`;
		dialog.querySelector( '.ride-name' ).textContent = vehicle.name;

	}

	// The picker's drawings in each ride's colour (the trucks have photos).
	function recolourIcons() {

		for ( const v of vehicles ) {

			const swatch = SWATCHES.find( s => s.id === lookFor( v, rideUnlock( v ) ? { ...access(), pro: true } : access() ).colour );
			for ( const shape of document.querySelectorAll( `.vehicle[data-id="${ v.id }"] [data-paint]` ) ) shape.setAttribute( 'fill', `#${ swatch.hex.toString( 16 ).padStart( 6, '0' ) }` );

		}

	}

	// --- opening, closing ---

	function show( which ) {

		vehicle = which;
		look = savedLook( vehicle );
		levelNote.hidden = true;
		mark();
		preview?.load( vehicle, shown() );

	}

	function open( which ) {

		if ( ! dialog.open ) {

			dialog.showModal();
			onOpen();

		}

		preview ??= createPreview( canvas, models, () => vehicle, paintable => {

			vehicle.paintable = paintable;
			mark();

		}, effects );
		show( which ?? panel.vehicle );
		preview.start();

	}

	dialog.addEventListener( 'close', () => preview?.stop() );
	dialog.querySelector( '.done' ).addEventListener( 'click', () => dialog.close() );
	dialog.querySelector( '.close' ).addEventListener( 'click', () => dialog.close() );
	dialog.addEventListener( 'click', e => e.target === dialog && dialog.close() );
	// Keys pressed here are the Garage's, not the game's: Esc closes it, Enter doesn't drive on.
	dialog.addEventListener( 'keydown', e => e.stopPropagation() );
	// The pass coming or going, or a level reached, unlocks (or locks) choices here and on the rides.
	const unlocked = () => {

		mark();
		preview?.wear( vehicle, shown() );
		recolourIcons();

	};
	onProChange( unlocked );
	onLevelChange( unlocked );
	// Once the pickers are drawn.
	requestAnimationFrame( recolourIcons );

	return {
		open,
		close: () => dialog.close(),
		get isOpen() {

			return dialog.open;

		},
		get vehicle() {

			return vehicle;

		},
		get preview() {

			return preview;

		},
		get hornsPlayed() {

			return hornsPlayed;

		},
	};

}

function build() {

	const dialog = document.createElement( 'dialog' );
	dialog.id = 'garage';
	dialog.setAttribute( 'aria-labelledby', 'garage-title' );
	dialog.innerHTML = `
		<div class="sheet">
			<header>
				<h2 id="garage-title">Garage</h2>
				<button type="button" class="close" aria-label="Close the Garage">&times;</button>
			</header>
			<div class="rides" role="group" aria-label="Ride"></div>
			<div class="body">
				<div class="stage">
					<canvas aria-label="The ride, turning"></canvas>
					<p class="ride-name"></p>
					<button type="button" class="demo">▶ Boost</button>
					<p class="hint">Drag to turn it</p>
					<div class="locked-banner" hidden><span>⭐ A Supporter Pass ride</span><button type="button" class="link">What's in the pass</button></div>
				</div>
				<div class="options">
					<nav class="jump" aria-label="Go to"></nav>
					<p class="pass-note" hidden>Starred choices come with the pass; levels unlock some of them as you drive. <button type="button" class="link">What's in it</button></p>
					<p class="level-note" hidden role="status"></p>
					<p class="paint-note small" hidden>Its paint is part of the model, so it keeps it: pick its underglow, boost, trail and horn.</p>
				</div>
			</div>
			<footer>
				<button type="button" class="factory">Back to how it came</button>
				<button type="button" class="primary done">Done</button>
			</footer>
		</div>`;
	document.body.append( dialog );
	return dialog;

}

// --- the boost ------------------------------------------------------------------------------

// What's picked here is shown off at once with a moment of boosting on the turntable.
const SHOWN_OFF = [ 'boost', 'flame', 'trail', 'smoke' ];

// The boost's parts: its style (boosts.js), each a button with a little picture, and the classic
// flame's colour, which was the only boost there was and now shows only under the classic flame.
function boostParts() {

	return [
		{ part: 'boost', title: 'Boost', list: BOOSTS, kind: 'style', note: 'What your booster leaves behind' },
		{ part: 'flame', title: 'Flame colour', list: FLAMES, kind: 'swatch' },
	];

}

// What unlocks a choice, on its chip: "Lv 12 · or Pass", "Pass" or "Lv 25" (a swatch, being
// small, only the level, or "Pass").
function unlockText( { level, pass }, small ) {

	if ( level === null ) return 'Pass';
	if ( small || ! pass ) return `Lv ${ level }`;
	return `Lv ${ level } · or Pass`;

}

function unlockSentence( { level, pass } ) {

	if ( level === null ) return 'comes with the Supporter Pass';
	if ( ! pass ) return `unlocks at level ${ level }`;
	return `unlocks at level ${ level }, or with the Supporter Pass`;

}

function styleButton( button, choice ) {

	button.classList.add( 'word' );
	button.innerHTML = choice.icon;
	button.append( Object.assign( document.createElement( 'span' ), { textContent: choice.name } ) );

}

// The flame's colour only matters with the classic flame.
function boostHidden( part, wearing ) {

	return part === 'flame' && wearing.boost !== 'classic';

}

// --- the turntable --------------------------------------------------------------------------

// A little scene of its own on the Garage's canvas: the ride on a lit disc, turning, its flame and
// trail shown for a moment when picked (with drive-fx.js, as driving does). It only draws while
// the Garage is open. onPaintable( yes ): whether the ride shown has paint to change. effects: as
// setUpGarage's.
function createPreview( canvas, models, getVehicle, onPaintable, effects ) {

	const renderer = new WebGLRenderer( { canvas, antialias: true, alpha: true } );
	renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
	const scene = new Scene();
	scene.add( new HemisphereLight( 0xffffff, 0x3a4250, 1.7 ) );
	const sun = new DirectionalLight( 0xffffff, 2.2 );
	sun.position.set( 4, 9, 6 );
	scene.add( sun );
	const rim = new DirectionalLight( 0x9fc8ff, 0.9 );
	rim.position.set( - 6, 4, - 5 );
	scene.add( rim );
	const floor = new Mesh( new CircleGeometry( 1, 48 ), new MeshBasicMaterial( { map: floorPicture(), transparent: true, depthWrite: false } ) );
	floor.rotation.x = - Math.PI / 2;
	scene.add( floor );
	const turntable = new Group();
	scene.add( turntable );
	const camera = new PerspectiveCamera( FOV, 1, 0.05, 500 );
	const target = new Vector3();
	const sphere = new Sphere();
	const box = new Box3();
	const still = new Vector3();
	const size = { width: 1, height: 1, length: 1, rear: 1, scale: 1 };
	const wheels = [ new Vector3(), new Vector3() ];
	let model = null;
	let fx = null;
	let fxKey = '';
	let demo = 0;
	let lit = false;
	let angle = 0.7;
	let loading = 0;
	let last = 0;
	let drag = null;

	canvas.addEventListener( 'pointerdown', e => {

		drag = { x: e.clientX, angle };
		canvas.setPointerCapture( e.pointerId );

	} );
	canvas.addEventListener( 'pointermove', e => {

		if ( drag ) angle = drag.angle + ( e.clientX - drag.x ) * 0.012;

	} );
	const letGo = () => drag = null;
	canvas.addEventListener( 'pointerup', letGo );
	canvas.addEventListener( 'pointercancel', letGo );

	function frame( time ) {

		const dt = Math.min( 0.1, last ? ( time - last ) / 1000 : 0 );
		last = time;
		resize();
		if ( ! drag ) angle += TURN * dt;
		turntable.rotation.y = angle;
		demo = Math.max( 0, demo - dt );
		model?.userData.onDrive?.( { steer: 0, speed: 0, dt, airborne: false, vy: 0, throttle: demo > 0 } );
		if ( model && fx ) {

			model.updateMatrixWorld( true );
			// Run dry at the end of the show, as the booster does.
			if ( lit && demo <= 0 ) fx.cool();
			lit = demo > 0;
			fx.update( { pivot: model, size, wheels, velocity: still, flame: demo > 0 ? 1 : 0, trail: demo > 0 ? 1 : 0, drifting: false, level: 0, grounded: true, dt } );

		}

		renderer.render( scene, camera );

	}

	function resize() {

		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		if ( ! width || ! height ) return;
		const ratio = renderer.getPixelRatio();
		if ( canvas.width !== Math.round( width * ratio ) || canvas.height !== Math.round( height * ratio ) ) {

			renderer.setSize( width, height, false );
			camera.aspect = width / height;
			frameModel();

		}

	}

	// Far enough back that the ride fits however it's turned, looking a little down on it.
	function frameModel() {

		if ( ! model ) return;
		const radius = sphere.radius;
		const fit = Math.max( radius / Math.sin( FOV / 2 * MathUtils.DEG2RAD ), radius / Math.sin( Math.atan( Math.tan( FOV / 2 * MathUtils.DEG2RAD ) * camera.aspect ) ) );
		target.set( 0, sphere.center.y * 0.8, 0 );
		camera.position.set( 0, Math.sin( ELEVATION ), Math.cos( ELEVATION ) ).multiplyScalar( fit ).add( target );
		camera.near = fit / 50;
		camera.far = fit * 10;
		camera.lookAt( target );
		camera.updateProjectionMatrix();
		floor.scale.setScalar( Math.max( sphere.radius * 1.1, 1.5 ) );

	}

	// A ride's model, as driving shows it: built, a car made ready to drive (cars.js) or a truck
	// loaded from the library, standing on y = 0 in the middle and facing -Z.
	async function modelOf( vehicle ) {

		if ( vehicle.build ) return vehicle.build();
		if ( vehicle.load ) return vehicle.load( models.loader );
		const { item } = vehicle;
		const content = ( await models.loader.loadAsync( new URL( `library/${ item.file }`, document.baseURI ).href ) ).scene;
		content.rotation.y = frontToYaw( item.front );
		content.scale.setScalar( item.scale ?? 1 );
		const holder = new Group();
		holder.add( content );
		holder.updateMatrixWorld( true );
		box.setFromObject( holder );
		content.position.set( - ( box.min.x + box.max.x ) / 2, - box.min.y, - ( box.min.z + box.max.z ) / 2 );
		return holder;

	}

	async function load( vehicle, look ) {

		const ask = ++ loading;
		let next;
		try {

			next = await modelOf( vehicle );

		} catch {

			return;

		}

		if ( ask !== loading ) return dispose( next );
		if ( model ) {

			turntable.remove( model );
			dispose( model );

		}

		model = next;
		turntable.add( model );
		model.updateMatrixWorld( true );
		box.setFromObject( model );
		box.getBoundingSphere( sphere );
		box.getSize( still );
		Object.assign( size, { width: still.x, height: still.y, length: still.z, rear: box.max.z, scale: 1 } );
		wheels[ 0 ].set( - still.x * 0.4, 0.05, box.max.z * 0.6 );
		wheels[ 1 ].set( still.x * 0.4, 0.05, box.max.z * 0.6 );
		still.set( 0, 0, 0 );
		onPaintable( isPaintable( model ) );
		wear( vehicle, look );
		frameModel();

	}

	function wear( vehicle, look ) {

		if ( ! model || vehicle !== getVehicle() ) return;
		applyLook( model, look, vehicle );
		// A new flame or trail is a new set of effects.
		const want = fxOf( look );
		const key = JSON.stringify( want );
		if ( key === fxKey ) return;
		fx?.dispose();
		fx = createDriveFx( scene, want, { effects } );
		fxKey = key;

	}

	function dispose( object ) {

		object.traverse( o => {

			if ( ! o.geometry?.userData.shared ) o.geometry?.dispose();
			const materials = Array.isArray( o.material ) ? o.material : [ o.material ];
			materials.forEach( m => m && ! m.userData.shared && m.dispose() );

		} );

	}

	return {
		load,
		wear,
		boost() {

			// Lit as it is driving, with its burst (unless it's burning already).
			if ( demo <= 0 ) fx?.ignite();
			demo = DEMO;

		},
		start() {

			last = 0;
			renderer.setAnimationLoop( frame );

		},
		stop() {

			renderer.setAnimationLoop( null );

		},
		get model() {

			return model;

		},
		get fx() {

			return fx;

		},
		get demo() {

			return demo;

		},
		renderer,
	};

}

// The turntable's floor: a soft round shadow fading out to its edge.
let floorTexture = null;
function floorPicture() {

	if ( floorTexture ) return floorTexture;
	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = 128;
	const ctx = canvas.getContext( '2d' );
	const gradient = ctx.createRadialGradient( 64, 64, 0, 64, 64, 64 );
	gradient.addColorStop( 0, 'rgba(255,255,255,0.22)' );
	gradient.addColorStop( 0.55, 'rgba(255,255,255,0.14)' );
	gradient.addColorStop( 0.9, 'rgba(255,255,255,0.05)' );
	gradient.addColorStop( 1, 'rgba(255,255,255,0)' );
	ctx.fillStyle = gradient;
	ctx.fillRect( 0, 0, 128, 128 );
	floorTexture = new CanvasTexture( canvas );
	floorTexture.colorSpace = SRGBColorSpace;
	return floorTexture;

}
