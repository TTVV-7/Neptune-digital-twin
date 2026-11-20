import './orrery.css';
import {
	AdditiveBlending, AmbientLight, BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, Group, Line,
	LineBasicMaterial, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PointLight, Points, PointsMaterial,
	Raycaster, RingGeometry, SRGBColorSpace, Scene, SphereGeometry, Sprite, SpriteMaterial, TextureLoader, Vector2, Vector3,
} from 'three';
import { BELT, BODIES, DRIVE_BODIES, ICONS, OTHER_BODIES, SUN, bodyById, EARTH_GRAVITY } from './orrery-bodies.js';
import { PLACES_ON } from './world-places.js';
import { WORLDS, WORLD_IDS, onWorld } from './worlds.js';

// The orrery: the Sun's family, the worlds you can drive on picked from it (docs/world-drive.md,
// "The orrery"). A lazy chunk of its own (main.js imports it the first time it opens), with its styles
// (orrery.css) and its pictures (/orrery/, scripts/make-orrery.mjs), so a plain load fetches none of
// it.
//
// It fills the page's empty modal <dialog id="orrery"> (drive/index.html) and is drawn by the page's
// own renderer into the page's own canvas (main.js calls render( dt ) each frame in place of its own
// drawing while it's open): no second WebGL context. The dialog and its backdrop are see-through, so
// the scene shows behind its buttons; a full-screen layer in it (.orrery-stage) takes the pointer, and
// the bodies are picked by casting a ray from it. Everything drawn is also in the DOM: the five worlds
// you can drive on are a radiogroup (the arrow keys move along it, a world's sheet following the
// focus; Enter, or the sheet's Drive, turns the game's globe to it), the rest plain buttons, and each
// world's count of drivers now goes in its radio's name ("Mars, 3 driving now"), never in a live
// region. It opens on the whole Solar System; picking a body zooms in on it and opens its sheet.
//
// The contract (main.js):
// createOrrery( {
//   dialog,              the #orrery <dialog>
//   renderer,            the page's WebGLRenderer (never disposed here; its clear colour, alpha,
//                        autoClear and render target are put back after each frame drawn)
//   current: () => id,   the game's world, read again each frame (a switch can finish while it's open)
//   counts: () => map,   { earth: { on, total }, … } (online.js's, discounted of this page), or null
//   party: () => [ { pid, name, world, away, globe } ],
//   spots: id => [ { id, name, place } ],  up to 4 of a world's start spots
//   earthClosed: () => bool,               today's Earth drives used up (its sheet says so)
//   reducedMotion: () => bool,             nothing orbits or spins, the camera moves at once
//   onDrive: id => …, onPlace: place => …, onJoin: pid => …,   each after it's closed
//   onClose: () => …,                      called by close() before it returns
// } ) → { open( opener ), close(), render( dt ), update(), isOpen, dispose() }

const FOV = 40;
const HALF = Math.tan( FOV / 2 * Math.PI / 180 );
// The light, as the prototype's (ambient 0.8, the Sun's 1.9 with no fall-off) in three's physical
// units, which have a Lambert surface take a π less than its old ones did.
const AMBIENT = 0.8 * Math.PI;
const SUNLIGHT = 1.9 * Math.PI;
// Where a picked body sits: this share of the room left beside (or above) the sheet across.
const FILL = 0.55;
// The camera eases this much of the way per second (as a share left after a second), and stops
// within these of where it's going (scene units, radians).
const EASE = 0.0015;
const NEAR_ENOUGH = 1e-4;
// A press that moves no more than this (px) is a tap; a small world within this of one (px) is hit.
const TAP = 5;
const REACH = 22;
// The app's phone layouts (style.css, orrery.css).
const NARROW = '(max-width: 760px)';
const LANDSCAPE = '(orientation: landscape) and (max-height: 520px)';
// While a world's picture is on its way.
const STAND_IN = { earth: '#3b6ea8', moon: '#9b9b98', mars: '#b4643d', vesta: '#8e877b', ceres: '#6d6a67' };

export function createOrrery( {
	dialog,
	renderer,
	current = () => 'earth',
	counts = () => null,
	party = () => [],
	spots = () => [],
	earthClosed = () => false,
	reducedMotion = () => false,
	onDrive = () => {},
	onPlace = () => {},
	onJoin = () => {},
	onClose = () => {},
} ) {

	let isOpen = false;
	let ui = null;
	let gl = null;
	// The body whose sheet is open (null: the whole Solar System), and the drivable world checked in
	// the radiogroup (the game's, until another's picked).
	let chosen = null;
	let picked = current();
	let shownCurrent = null;
	let countsKey = '';
	let partyKey = '';
	// Whether the scene needs drawing again, and whether the camera's where it's going.
	let dirty = true;
	let settled = false;

	// --- the DOM ---

	function el( tag, props = {}, ...children ) {

		const node = document.createElement( tag );
		for ( const [ key, value ] of Object.entries( props ) ) {

			if ( key === 'class' ) node.className = value;
			else if ( key === 'text' ) node.textContent = value;
			else if ( key === 'html' ) node.innerHTML = value;
			else if ( key.startsWith( 'on' ) ) node.addEventListener( key.slice( 2 ), value );
			else if ( value === true ) node.setAttribute( key, '' );
			else if ( value !== false && value !== null && value !== undefined ) node.setAttribute( key, value );

		}

		node.append( ...children );
		return node;

	}

	function buildUi() {

		const stage = el( 'div', { class: 'orrery-stage', 'aria-hidden': 'true' } );
		const tags = el( 'div', { class: 'orrery-tags', 'aria-hidden': 'true' } );
		const total = el( 'p', { class: 'orrery-total', hidden: true } );
		const close = el( 'button', { type: 'button', class: 'orrery-close', 'aria-label': 'Close the worlds', html: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>' } );
		const bar = el( 'header', { class: 'orrery-bar' },
			el( 'h2', { id: 'orrery-title', text: 'Pick a world' } ),
			total,
			el( 'p', { class: 'orrery-hint' },
				el( 'span', { class: 'orrery-hint-mouse', text: 'Drag to turn, scroll to zoom' } ),
				el( 'span', { class: 'orrery-hint-touch', text: 'Drag to turn, pinch to zoom' } ) ),
			close );
		const worlds = el( 'div', { class: 'orrery-worlds', role: 'radiogroup', 'aria-label': 'Worlds you can drive on' } );
		const radios = {};
		for ( const body of DRIVE_BODIES ) {

			radios[ body.id ] = el( 'button', { type: 'button', role: 'radio', 'data-world': body.id, 'aria-checked': 'false', tabindex: '-1' },
				el( 'span', { class: 'orrery-icon', html: ICONS[ body.id ] } ),
				el( 'span', { class: 'orrery-name', text: body.name } ),
				el( 'span', { class: 'orrery-n' } ) );
			worlds.append( radios[ body.id ] );

		}

		const others = el( 'div', { class: 'orrery-others', role: 'group', 'aria-label': 'The rest of the Solar System' } );
		const buttons = {};
		for ( const body of OTHER_BODIES ) {

			buttons[ body.id ] = el( 'button', { type: 'button', 'data-body': body.id, 'aria-label': `${ body.name }, ${ body.ground === 'later' ? 'not in the game yet' : 'no ground to drive on' }`, text: body.name } );
			others.append( buttons[ body.id ] );

		}

		const pick = el( 'div', { class: 'orrery-pick' }, worlds, others );
		const sheet = {
			kicker: el( 'p', { class: 'orrery-kicker' } ),
			name: el( 'h3', { id: 'orrery-sheet-name' } ),
			count: el( 'p', { class: 'orrery-count' } ),
			counted: el( 'p', { class: 'orrery-counted', text: 'Counted: drivers in an area\'s room, who show themselves to drivers nearby. Not anyone on a globe, or only in a party.' } ),
			lede: el( 'p', { class: 'orrery-lede' } ),
			facts: el( 'dl', { class: 'orrery-facts' } ),
			spots: el( 'div', { class: 'orrery-spots' } ),
			party: el( 'div', { class: 'orrery-party' } ),
			note: el( 'p', { class: 'orrery-note' } ),
			source: el( 'p', { class: 'orrery-source' } ),
			drive: el( 'button', { type: 'button', class: 'orrery-drive' } ),
		};
		const content = el( 'div', { class: 'orrery-sheet-body' }, sheet.kicker, sheet.name, sheet.count, sheet.lede, sheet.facts, sheet.spots, sheet.party, sheet.note, sheet.counted, sheet.source );
		sheet.root = el( 'section', { class: 'orrery-sheet', 'aria-labelledby': 'orrery-sheet-name', hidden: true }, content, el( 'div', { class: 'orrery-go' }, sheet.drive ) );
		const credit = el( 'p', { class: 'orrery-credit', text: 'Not to scale. Pictures: NASA (Blue Marble, LRO, MGS, Viking, Dawn).' } );

		dialog.replaceChildren( stage, tags, bar, pick, sheet.root, credit );
		dialog.classList.add( 'orrery' );

		// The worlds you can drive on: a radiogroup, the arrows moving along it (and round), Home and
		// End to its ends, the sheet following; Enter drives there. A click (or Space) only picks.
		worlds.addEventListener( 'keydown', event => {

			const id = event.target.closest?.( '[role=radio]' )?.dataset.world;
			if ( ! id ) return;
			const at = WORLD_IDS.indexOf( id );
			const to = { ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1, Home: 0, End: WORLD_IDS.length - 1 }[ event.key ];
			if ( to !== undefined ) {

				event.preventDefault();
				const next = WORLD_IDS[ ( to + WORLD_IDS.length ) % WORLD_IDS.length ];
				choose( next );
				radios[ next ].focus();

			} else if ( event.key === 'Enter' ) {

				event.preventDefault();
				drive( id );

			}

		} );
		worlds.addEventListener( 'click', event => {

			const id = event.target.closest( '[role=radio]' )?.dataset.world;
			if ( id ) choose( id );

		} );
		others.addEventListener( 'click', event => {

			const id = event.target.closest( '[data-body]' )?.dataset.body;
			if ( id ) choose( id );

		} );
		tags.addEventListener( 'click', event => {

			const id = event.target.closest( '[data-tag]' )?.dataset.tag;
			if ( id ) choose( id );

		} );
		close.addEventListener( 'click', () => closeOrrery() );
		sheet.drive.addEventListener( 'click', () => chosen && bodyById[ chosen ].world && drive( chosen ) );
		content.addEventListener( 'click', event => {

			const spot = event.target.closest( '[data-spot]' );
			const join = event.target.closest( '[data-join]' );
			if ( spot ) {

				const place = shownSpots.find( item => item.id === spot.dataset.spot )?.place;
				if ( ! place ) return;
				closeOrrery();
				onPlace( place );

			} else if ( join ) {

				closeOrrery();
				onJoin( join.dataset.join );

			}

		} );

		// Keys pressed here are the orrery's, never the game's (main.js's would otherwise see an M
		// closing it as one opening it again, and an Esc as unpinning): M closes it, as Esc does (the
		// browser's cancel, below).
		dialog.addEventListener( 'keydown', event => {

			event.stopPropagation();
			if ( isM( event ) ) {

				event.preventDefault();
				closeOrrery();

			}

		} );
		// Esc: an "other body"'s sheet first (back to the whole Solar System), then the orrery. Done
		// here rather than by the browser, so closing is this page's (and synchronous).
		dialog.addEventListener( 'cancel', event => {

			event.preventDefault();
			if ( chosen && ! bodyById[ chosen ].world ) {

				overview();
				radios[ picked ]?.focus();

			} else closeOrrery();

		} );
		// Should the browser close it all the same (a second Esc it won't let a page stop), it's closed.
		dialog.addEventListener( 'close', () => isOpen && closeOrrery() );

		// The scene: dragged to turn, wheeled or pinched to zoom, a tap picking what's under it (a
		// tap on nothing going back to the whole Solar System).
		const pointers = new Map();
		let press = null;
		let pinch = null;
		stage.addEventListener( 'pointerdown', event => {

			pointers.set( event.pointerId, { x: event.clientX, y: event.clientY } );
			stage.setPointerCapture?.( event.pointerId );
			if ( pointers.size === 1 ) press = { x: event.clientX, y: event.clientY, moved: 0, ...turnOf() };
			else if ( pointers.size === 2 ) {

				press = null;
				pinch = { apart: apart( pointers ), zoom: zoomOf() };

			}

		} );
		stage.addEventListener( 'pointermove', event => {

			const pointer = pointers.get( event.pointerId );
			if ( pointer ) {

				pointer.x = event.clientX;
				pointer.y = event.clientY;

			}

			if ( pinch && pointers.size === 2 ) {

				setZoom( pinch.zoom * pinch.apart / Math.max( 1, apart( pointers ) ) );

			} else if ( press && pointer ) {

				const dx = event.clientX - press.x;
				const dy = event.clientY - press.y;
				press.moved = Math.max( press.moved, Math.hypot( dx, dy ) );
				if ( press.moved > TAP ) {

					stage.classList.add( 'dragging' );
					setTurn( press.yaw - dx * 0.005, press.pitch + dy * 0.004 );

				}

			} else if ( event.pointerType === 'mouse' ) stage.classList.toggle( 'pointing', !! bodyAt( event.clientX, event.clientY ) );

		} );
		const lift = event => {

			const wasPress = press && pointers.size === 1 && press.moved <= TAP && event.type === 'pointerup';
			pointers.delete( event.pointerId );
			if ( pointers.size < 2 ) pinch = null;
			stage.classList.remove( 'dragging' );
			if ( wasPress ) {

				const id = bodyAt( event.clientX, event.clientY );
				if ( id ) choose( id );
				else if ( chosen ) overview();

			}

			if ( pointers.size === 0 ) press = null;

		};
		stage.addEventListener( 'pointerup', lift );
		stage.addEventListener( 'pointercancel', lift );
		stage.addEventListener( 'wheel', event => {

			event.preventDefault();
			setZoom( zoomOf() * Math.exp( event.deltaY * 0.001 ) );

		}, { passive: false } );

		const tagOf = {};
		for ( const body of BODIES ) {

			tagOf[ body.id ] = el( 'button', { type: 'button', tabindex: '-1', class: `orrery-tag${ body.world ? ' drive' : '' }`, 'data-tag': body.id, hidden: true },
				el( 'span', { text: body.name } ), el( 'span', { class: 'orrery-tag-n' } ) );
			tags.append( tagOf[ body.id ] );

		}

		return { stage, tags, tagOf, total, close, worlds, radios, others, buttons, pick, sheet, credit };

	}

	const isM = event => event.code === 'KeyM' && ! event.ctrlKey && ! event.metaKey && ! event.altKey && ! event.repeat;
	const apart = pointers => {

		const [ a, b ] = [ ...pointers.values() ];
		return Math.hypot( a.x - b.x, a.y - b.y );

	};

	// While it's open, keys whose focus has fallen out of it (to the page's body) aren't the game's
	// either; M there closes it too.
	function guard( event ) {

		if ( ! isOpen || dialog.contains( event.target ) ) return;
		event.stopPropagation();
		if ( isM( event ) ) {

			event.preventDefault();
			closeOrrery();

		}

	}

	// --- the sheet ---

	let shownSpots = [];

	function choose( id ) {

		const body = bodyById[ id ];
		if ( ! body ) return;
		if ( body.world ) picked = id;
		const changed = chosen !== id;
		chosen = id;
		if ( changed ) {

			near.turn = near.tilt = 0;
			near.zoom = 1;

		}

		markRadios();
		for ( const [ other, button ] of Object.entries( ui.buttons ) ) button.classList.toggle( 'is-chosen', other === id );
		fill( id );
		ui.sheet.root.hidden = false;
		dialog.classList.add( 'has-sheet' );
		changed && ui.sheet.root.querySelector( '.orrery-sheet-body' ).scrollTo?.( 0, 0 );
		relayout();

	}

	function overview() {

		chosen = null;
		for ( const button of Object.values( ui.buttons ) ) button.classList.remove( 'is-chosen' );
		ui.sheet.root.hidden = true;
		dialog.classList.remove( 'has-sheet' );
		relayout();

	}

	function markRadios() {

		const here = current();
		for ( const [ id, radio ] of Object.entries( ui.radios ) ) {

			radio.setAttribute( 'aria-checked', String( id === picked ) );
			radio.tabIndex = id === picked ? 0 : - 1;
			radio.classList.toggle( 'is-here', id === here );

		}

	}

	// "3 driving now", "Driving with others is off there today", or nothing (no counts: live is off).
	function countOf( id ) {

		const worlds = counts();
		const world = worlds?.[ id ];
		if ( ! world ) return null;
		if ( world.on === false ) return { off: true, text: 'Driving with others is off there today' };
		const total = Number.isFinite( world.total ) ? Math.max( 0, world.total ) : 0;
		return { total, text: `${ total } driving now` };

	}

	function fill( id ) {

		const body = bodyById[ id ];
		const { sheet } = ui;
		const drivable = !! body.world;
		const here = drivable && id === current();
		sheet.kicker.textContent = here ? 'You\'re here' : drivable ? 'You can drive here' : body.ground === 'later' ? 'Not in the game yet' : 'No ground to drive on';
		sheet.kicker.classList.toggle( 'yes', drivable );
		sheet.name.textContent = body.heading;
		sheet.lede.textContent = body.lede;

		const share = body.gravity / EARTH_GRAVITY * 100;
		const facts = [
			[ 'Gravity', share >= 10 ? `${ Math.round( share ) }%` : `${ share.toFixed( 1 ) }%`, 'of Earth\'s' ],
			[ 'Radius', body.radius.toLocaleString( 'en-GB' ), 'km' ],
			[ 'A day', body.day, '' ],
			[ 'From the Sun', String( body.au ), 'AU' ],
		];
		sheet.facts.replaceChildren( ...facts.map( ( [ name, value, unit ] ) => el( 'div', {},
			el( 'dt', { text: name } ),
			el( 'dd', {}, value, unit ? ' ' : '', unit ? el( 'small', { text: unit } ) : '' ) ) ) );

		shownSpots = drivable ? ( spots( id ) ?? [] ).slice( 0, 4 ) : [];
		const many = drivable && id !== 'earth' ? PLACES_ON[ id ]?.length : 0;
		sheet.spots.hidden = ! shownSpots.length;
		sheet.spots.replaceChildren( ...( shownSpots.length ? [
			el( 'h4', { text: many ? `${ many } named places, including` : 'A few of the places' } ),
			el( 'ul', {}, ...shownSpots.map( spot => el( 'li', {}, el( 'button', { type: 'button', 'data-spot': spot.id, text: spot.name } ) ) ) ),
		] : [] ) );

		const closed = id === 'earth' && earthClosed();
		sheet.note.textContent = ! drivable ? ( body.ground === 'later' ? 'Coming later, maybe.' : 'Nothing to land on.' )
			: closed ? 'The Earth is used up for today: this visit\'s Earth drives are spent.'
				: id !== 'earth' ? `Gravity there is ${ +body.gravity.toFixed( 2 ) } m/s², so every bump is a long, slow hop.` : '';
		sheet.note.classList.toggle( 'closed', closed );
		sheet.source.textContent = body.credit ?? '';

		sheet.drive.hidden = ! drivable;
		sheet.drive.parentElement.hidden = ! drivable;
		if ( drivable ) {

			sheet.drive.replaceChildren(
				el( 'span', { text: here ? `Back to ${ WORLDS[ id ].the }` : `Drive ${ onWorld( id ) }` } ),
				el( 'span', { 'aria-hidden': 'true', text: '→' } ) );

		}

		fillCount();
		partyKey = '';
		fillParty();

	}

	function fillCount() {

		const { sheet } = ui;
		const count = chosen && bodyById[ chosen ].world ? countOf( chosen ) : null;
		sheet.count.hidden = ! count;
		sheet.counted.hidden = ! count || count.off;
		sheet.count.textContent = count?.text ?? '';
		sheet.count.classList.toggle( 'off', !! count?.off );

	}

	// The party on the chosen world: those driving there (Join), and those looking at its globe.
	function fillParty() {

		const { sheet } = ui;
		const members = chosen && bodyById[ chosen ].world ? party() ?? [] : [];
		const there = members.filter( member => member.world === chosen && ! member.away );
		const looking = members.filter( member => member.away && member.globe === chosen );
		const key = JSON.stringify( [ chosen, there.map( member => [ member.pid, member.name ] ), looking.map( member => [ member.pid, member.name ] ) ] );
		if ( key === partyKey ) return;
		partyKey = key;
		const had = document.activeElement?.dataset?.join;
		sheet.party.hidden = ! there.length && ! looking.length;
		sheet.party.replaceChildren( ...( sheet.party.hidden ? [] : [
			el( 'h4', { text: 'Your party here' } ),
			el( 'ul', {},
				...there.map( member => el( 'li', {}, el( 'button', { type: 'button', 'data-join': member.pid, 'aria-label': `Join ${ member.name }` }, el( 'span', { text: member.name } ), el( 'span', { class: 'orrery-join', 'aria-hidden': 'true', text: 'Join' } ) ) ) ),
				...looking.map( member => el( 'li', { class: 'orrery-looking', text: `${ member.name } · on its globe` } ) ) ),
		] ) );
		if ( had ) sheet.party.querySelector( `[data-join="${ CSS.escape( had ) }"]` )?.focus();

	}

	// Each world's count, on its radio (in its name), its tag, the sheet and the total.
	function fillCounts() {

		const worlds = counts();
		const key = worlds ? WORLD_IDS.map( id => `${ worlds[ id ]?.on }:${ worlds[ id ]?.total }` ).join( ',' ) : '';
		if ( key === countsKey ) return;
		countsKey = key;
		let sum = 0;
		for ( const body of DRIVE_BODIES ) {

			const count = countOf( body.id );
			const n = count && ! count.off ? count.total : null;
			if ( n ) sum += n;
			ui.radios[ body.id ].setAttribute( 'aria-label', n === null ? body.name : `${ body.name }, ${ n } driving now` );
			ui.radios[ body.id ].querySelector( '.orrery-n' ).textContent = n ? String( n ) : '';
			ui.tagOf[ body.id ].querySelector( '.orrery-tag-n' ).textContent = n ? ` · ${ n }` : '';

		}

		ui.total.hidden = ! worlds;
		ui.total.textContent = `${ sum } driving now`;
		fillCount();
		dirty = true;

	}

	function drive( id ) {

		closeOrrery();
		onDrive( id );

	}

	// --- the scene (built the first time it opens; freed as the page goes) ---

	const camera = new PerspectiveCamera( FOV, 1, 0.01, 2000 );
	const raycaster = new Raycaster();
	const ndc = new Vector2();
	const size = new Vector2( 1, 1 );
	const seen = new Vector2( 0, 0 );
	const _v = new Vector3();
	const _target = new Vector3();
	const _offset = new Vector3();
	const clearColour = new Color();
	// The overview's turn and zoom, and a picked body's (from where the Sun lights it).
	const view = { yaw: - 0.5, pitch: 0.62, zoom: 1 };
	const near = { turn: 0, tilt: 0, zoom: 1 };
	const look = { target: new Vector3(), distance: 58, yaw: - 0.5, pitch: 0.62 };
	// The room the scene has beside the sheet and above the dock: its middle's offset from the
	// screen's middle, and its smaller side (px).
	const room = { x: 0, y: 0, across: 1, aspect: 1 };

	function turnOf() {

		return chosen ? { yaw: near.turn, pitch: near.tilt } : { yaw: view.yaw, pitch: view.pitch };

	}

	function setTurn( yaw, pitch ) {

		if ( chosen ) {

			near.turn = yaw;
			near.tilt = Math.min( 1.1, Math.max( - 0.25, pitch ) );

		} else {

			view.yaw = yaw;
			view.pitch = Math.min( 1.45, Math.max( 0.08, pitch ) );

		}

		dirty = true;

	}

	const zoomOf = () => chosen ? near.zoom : view.zoom;
	function setZoom( zoom ) {

		if ( chosen ) near.zoom = Math.min( 3, Math.max( 0.45, zoom ) );
		else view.zoom = Math.min( 2.4, Math.max( 0.3, zoom ) );
		dirty = true;

	}

	function glowTexture( inner, outer ) {

		const canvas = document.createElement( 'canvas' );
		canvas.width = canvas.height = 128;
		const context = canvas.getContext( '2d' );
		const gradient = context.createRadialGradient( 64, 64, 0, 64, 64, 64 );
		gradient.addColorStop( 0, inner );
		gradient.addColorStop( 0.25, outer );
		gradient.addColorStop( 1, 'rgba(0,0,0,0)' );
		context.fillStyle = gradient;
		context.fillRect( 0, 0, 128, 128 );
		const texture = new CanvasTexture( canvas );
		texture.colorSpace = SRGBColorSpace;
		return texture;

	}

	// A gas giant's bands, with a little turbulence along them.
	function bandTexture( colours, seed ) {

		const canvas = document.createElement( 'canvas' );
		canvas.width = 512;
		canvas.height = 256;
		const context = canvas.getContext( '2d' );
		const random = seeded( seed );
		for ( let y = 0; y < 256; ) {

			const h = 6 + random() * 26;
			context.fillStyle = colours[ Math.floor( random() * colours.length ) ];
			context.fillRect( 0, y, 512, h + 1 );
			y += h;

		}

		context.globalAlpha = 0.18;
		for ( let i = 0; i < 260; i ++ ) {

			context.fillStyle = colours[ Math.floor( random() * colours.length ) ];
			context.beginPath();
			context.ellipse( random() * 512, random() * 256, 8 + random() * 40, 1.5 + random() * 3, 0, 0, Math.PI * 2 );
			context.fill();

		}

		const texture = new CanvasTexture( canvas );
		texture.colorSpace = SRGBColorSpace;
		return texture;

	}

	// Saturn's rings, the Cassini Division in them.
	function ringTexture() {

		const canvas = document.createElement( 'canvas' );
		canvas.width = 512;
		canvas.height = 4;
		const context = canvas.getContext( '2d' );
		for ( let i = 0; i < 512; i ++ ) {

			const f = i / 512;
			const gap = f > 0.62 && f < 0.67 ? 0.08 : 1;
			const a = ( 0.35 + 0.5 * Math.abs( Math.sin( f * 41 ) ) * ( 0.6 + 0.4 * Math.sin( f * 9 ) ) ) * gap * ( f < 0.05 ? f / 0.05 : 1 );
			context.fillStyle = `rgba(222,205,170,${ a.toFixed( 3 ) })`;
			context.fillRect( i, 0, 1, 4 );

		}

		const texture = new CanvasTexture( canvas );
		texture.colorSpace = SRGBColorSpace;
		return texture;

	}

	function seeded( seed ) {

		let s = seed;
		return () => ( s = ( s * 16807 ) % 2147483647 ) / 2147483647;

	}

	function orbitLine( radius, colour, opacity ) {

		const points = new Float32Array( 257 * 3 );
		for ( let i = 0; i <= 256; i ++ ) {

			const a = i / 256 * Math.PI * 2;
			points.set( [ Math.cos( a ) * radius, 0, Math.sin( a ) * radius ], i * 3 );

		}

		const geometry = new BufferGeometry();
		geometry.setAttribute( 'position', new BufferAttribute( points, 3 ) );
		return new Line( geometry, new LineBasicMaterial( { color: colour, transparent: true, opacity, depthWrite: false } ) );

	}

	// Vesta's and Ceres's shapes: the sphere moved out or in by their heights (1° grid, rows from
	// 90° N, columns from 180° W, each the middle of its cell), read where each vertex's uv puts it.
	async function shape( geometry, { url, step, radius }, signal ) {

		const response = await fetch( url, { signal } );
		if ( ! response.ok ) throw new Error( `${ url }: ${ response.status }` );
		const data = new DataView( await response.arrayBuffer() );
		const heights = new Float32Array( 360 * 180 );
		for ( let i = 0; i < heights.length; i ++ ) heights[ i ] = data.getInt16( i * 2, true ) * step;
		const at = ( lat, lon ) => {

			const fr = Math.min( 179, Math.max( 0, 89.5 - lat ) );
			const fc = ( ( lon + 179.5 ) % 360 + 360 ) % 360;
			const r0 = Math.floor( fr ), c0 = Math.floor( fc ), r1 = Math.min( 179, r0 + 1 ), c1 = ( c0 + 1 ) % 360;
			const a = fr - r0, b = fc - c0;
			const h = ( r, c ) => heights[ r * 360 + c ];
			return ( h( r0, c0 ) * ( 1 - b ) + h( r0, c1 ) * b ) * ( 1 - a ) + ( h( r1, c0 ) * ( 1 - b ) + h( r1, c1 ) * b ) * a;

		};

		const position = geometry.attributes.position;
		const uv = geometry.attributes.uv;
		for ( let i = 0; i < position.count; i ++ ) {

			_v.fromBufferAttribute( position, i ).multiplyScalar( 1 + at( uv.getY( i ) * 180 - 90, uv.getX( i ) * 360 - 180 ) / radius );
			position.setXYZ( i, _v.x, _v.y, _v.z );

		}

		position.needsUpdate = true;
		geometry.computeVertexNormals();
		geometry.boundingSphere = null;
		geometry.computeBoundingSphere();

	}

	function buildScene() {

		const scene = new Scene();
		const loading = new AbortController();
		scene.add( new AmbientLight( 0x334055, AMBIENT ) );
		scene.add( new PointLight( 0xfff4e0, SUNLIGHT, 0, 0 ) );

		// Stars, the Sun and its glow.
		const stars = new Float32Array( 2400 * 3 );
		const random = seeded( 7 );
		for ( let i = 0; i < 2400; i ++ ) {

			const u = random() * 2 - 1, t = random() * Math.PI * 2, r = 600 + random() * 300, s = Math.sqrt( 1 - u * u );
			stars.set( [ r * s * Math.cos( t ), r * u, r * s * Math.sin( t ) ], i * 3 );

		}

		const starGeometry = new BufferGeometry();
		starGeometry.setAttribute( 'position', new BufferAttribute( stars, 3 ) );
		scene.add( new Points( starGeometry, new PointsMaterial( { color: 0xbfcbe0, size: 1.3, sizeAttenuation: false } ) ) );
		scene.add( new Mesh( new SphereGeometry( SUN.size, 48, 24 ), new MeshBasicMaterial( { color: 0xffe6a8 } ) ) );
		const glow = new Sprite( new SpriteMaterial( { map: glowTexture( 'rgba(255,236,170,0.9)', 'rgba(255,170,60,0.25)' ), blending: AdditiveBlending, depthWrite: false } ) );
		glow.scale.set( SUN.glow, SUN.glow, 1 );
		scene.add( glow );

		// The asteroid belt.
		const rocks = new Float32Array( BELT.count * 3 );
		const scatter = seeded( 11 );
		for ( let i = 0; i < BELT.count; i ++ ) {

			const a = scatter() * Math.PI * 2, r = BELT.inner + Math.pow( scatter(), 0.7 ) * BELT.depth, y = ( scatter() - 0.5 ) * 0.5;
			rocks.set( [ Math.cos( a ) * r, y, Math.sin( a ) * r ], i * 3 );

		}

		const beltGeometry = new BufferGeometry();
		beltGeometry.setAttribute( 'position', new BufferAttribute( rocks, 3 ) );
		const belt = new Points( beltGeometry, new PointsMaterial( { color: 0x8a8578, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.7, depthWrite: false } ) );
		scene.add( belt );

		const loader = new TextureLoader();
		const anisotropy = Math.min( 4, renderer.capabilities.getMaxAnisotropy() );
		const halo = glowTexture( 'rgba(255,210,63,0.0)', 'rgba(255,210,63,0.22)' );
		const bodies = {};
		for ( const body of BODIES ) {

			const pivot = new Group();
			const geometry = new SphereGeometry( body.size, ...( body.shape ? [ 192, 96 ] : [ 64, 32 ] ) );
			const material = new MeshStandardMaterial( { roughness: 1, metalness: 0 } );
			if ( body.bands ) material.map = bandTexture( body.bands, body.orbit * 1000 | 0 );
			else material.color.set( body.colour ?? STAND_IN[ body.id ] ?? '#888888' );
			if ( body.picture ) {

				loader.load( body.picture, texture => {

					texture.colorSpace = SRGBColorSpace;
					texture.anisotropy = anisotropy;
					material.map = texture;
					material.color.set( 0xffffff );
					material.needsUpdate = true;
					dirty = true;

				} );

			}

			if ( body.shape ) shape( geometry, body.shape, loading.signal ).then( () => dirty = true, () => {} );
			const mesh = new Mesh( geometry, material );
			mesh.userData.id = body.id;
			pivot.add( mesh );
			if ( body.rings ) {

				const inner = body.size * 1.25, outer = body.size * 2.3;
				const ringGeometry = new RingGeometry( inner, outer, 128, 1 );
				const uv = ringGeometry.attributes.uv, position = ringGeometry.attributes.position;
				for ( let i = 0; i < uv.count; i ++ ) uv.setXY( i, ( _v.fromBufferAttribute( position, i ).length() - inner ) / ( outer - inner ), 0.5 );
				const rings = new Mesh( ringGeometry, new MeshBasicMaterial( { map: ringTexture(), transparent: true, side: DoubleSide, depthWrite: false } ) );
				rings.rotation.x = - Math.PI / 2 + 0.47;
				pivot.add( rings );

			}

			// The worlds you can drive on wear a faint yellow halo, so they read from far out.
			let glowing = null;
			if ( body.world ) {

				glowing = new Sprite( new SpriteMaterial( { map: halo, blending: AdditiveBlending, depthWrite: false, transparent: true } ) );
				glowing.scale.setScalar( Math.max( body.size * 5, 1.1 ) );
				pivot.add( glowing );

			}

			( body.parent ? bodies[ body.parent ].pivot : scene ).add( pivot );
			if ( ! body.parent ) scene.add( orbitLine( body.orbit, body.world ? 0xffd23f : 0x5a6a86, body.world ? 0.35 : 0.22 ) );
			// Kepler's third law, squeezed: the further out, the slower round.
			bodies[ body.id ] = {
				body, pivot, mesh, halo: glowing,
				angle: ( body.start ?? 0 ) * Math.PI / 180,
				pace: body.parent ? 0.6 : 0.9 * Math.pow( 9.6 / body.orbit, 1.5 ),
				screen: new Vector3(), shown: false, tagAt: [ NaN, NaN ],
			};

		}

		const list = Object.values( bodies );
		const meshes = list.map( entry => entry.mesh );
		place( list, 0, 0 );
		return { scene, bodies, list, meshes, belt, loading };

	}

	function freeScene() {

		if ( ! gl ) return;
		gl.loading.abort();
		const textures = new Set();
		gl.scene.traverse( object => {

			object.geometry?.dispose();
			for ( const material of [ object.material ].flat().filter( Boolean ) ) {

				if ( material.map ) textures.add( material.map );
				material.dispose();

			}

		} );
		for ( const texture of textures ) texture.dispose();
		gl = null;

	}

	// Each body along its orbit (and turning on its axis) after `dt` at `speed`.
	function place( list, dt, speed ) {

		for ( const entry of list ) {

			entry.angle += entry.pace * speed * dt;
			const r = entry.body.orbit;
			entry.pivot.position.set( Math.cos( entry.angle ) * r, 0, - Math.sin( entry.angle ) * r );
			entry.mesh.rotation.y += entry.body.spin * dt * speed * 5;

		}

	}

	// --- the layout: where the scene has room (read only when it changes, never each frame) ---

	function relayout() {

		if ( ! isOpen ) return;
		renderer.getSize( size );
		seen.copy( size );
		const [ w, h ] = [ size.x, size.y ];
		const box = { left: 0, top: 0, right: w, bottom: h };
		const pick = ui.pick.getBoundingClientRect();
		const narrow = matchMedia( NARROW ).matches;
		const landscape = matchMedia( LANDSCAPE ).matches;
		box.top = Math.min( h * 0.5, pick.bottom );
		if ( chosen ) {

			const sheet = ui.sheet.root.getBoundingClientRect();
			if ( narrow && ! landscape ) box.bottom = Math.max( box.top + 80, sheet.top );
			else box.right = Math.max( 80, sheet.left );

		}

		room.x = w / 2 - ( box.left + box.right ) / 2;
		room.y = h / 2 - ( box.top + box.bottom ) / 2;
		room.across = Math.max( 60, Math.min( box.right - box.left, box.bottom - box.top ) );
		room.aspect = ( box.right - box.left ) / Math.max( 1, box.bottom - box.top );
		camera.aspect = w / h;
		camera.setViewOffset( w, h, room.x, room.y, w, h );
		camera.updateProjectionMatrix();
		settled = false;
		dirty = true;

	}

	// Where the camera's going: round the whole family, or at a picked body from its sunny side.
	const goal = { distance: 58, yaw: 0, pitch: 0 };
	function aim( bodies ) {

		if ( chosen ) {

			const entry = bodies[ chosen ];
			entry.mesh.getWorldPosition( _target );
			const extent = entry.body.size * ( entry.body.rings ? 2.4 : 1.1 );
			goal.distance = extent * size.y / ( FILL * room.across * HALF ) * near.zoom;
			goal.yaw = Math.atan2( _target.z, _target.x ) - 0.55 + near.turn;
			goal.pitch = 0.28 + near.tilt;

		} else {

			_target.set( 0, 0, 0 );
			goal.distance = ( room.aspect < 0.8 ? 92 : room.aspect < 1.2 ? 70 : 58 ) * view.zoom;
			goal.yaw = view.yaw;
			goal.pitch = view.pitch;

		}

		return goal;

	}

	function draw( dt ) {

		const reduced = reducedMotion();
		const { bodies, list } = gl;
		if ( ! reduced ) {

			// Slower once a body's picked, so it isn't chased round its orbit.
			place( list, dt, chosen ? 0.012 : 0.05 );
			gl.belt.rotation.y += dt * 0.004;

		}

		const goal = aim( bodies );
		const ease = reduced || ! settledOnce ? 1 : 1 - Math.pow( EASE, dt );
		settledOnce = true;
		let turn = goal.yaw - look.yaw;
		turn = Math.atan2( Math.sin( turn ), Math.cos( turn ) );
		const off = look.target.distanceTo( _target ) + Math.abs( goal.distance - look.distance ) / Math.max( 1, goal.distance ) + Math.abs( turn ) + Math.abs( goal.pitch - look.pitch );
		if ( off < NEAR_ENOUGH * Math.max( 1, goal.distance ) ) {

			look.target.copy( _target );
			look.distance = goal.distance;
			look.yaw = goal.yaw;
			look.pitch = goal.pitch;
			settled = true;

		} else {

			look.target.lerp( _target, ease );
			look.distance += ( goal.distance - look.distance ) * ease;
			look.yaw += turn * ease;
			look.pitch += ( goal.pitch - look.pitch ) * ease;
			settled = false;

		}

		_offset.set( Math.cos( look.pitch ) * Math.cos( look.yaw ), Math.sin( look.pitch ), Math.cos( look.pitch ) * Math.sin( look.yaw ) ).multiplyScalar( look.distance );
		camera.position.copy( look.target ).add( _offset );
		camera.lookAt( look.target );
		camera.updateMatrixWorld();
		for ( const entry of list ) if ( entry.halo ) entry.halo.visible = ! chosen;

		// Drawn with the page's renderer, everything of its own put back after.
		const target = renderer.getRenderTarget();
		const autoClear = renderer.autoClear;
		renderer.getClearColor( clearColour );
		const clearAlpha = renderer.getClearAlpha();
		renderer.setRenderTarget( null );
		renderer.autoClear = true;
		renderer.setClearColor( 0x000000, 0 );
		renderer.render( gl.scene, camera );
		renderer.setClearColor( clearColour, clearAlpha );
		renderer.autoClear = autoClear;
		renderer.setRenderTarget( target );

		moveTags( list );

	}

	// The tags under the bodies: all of them (but the Moon, which would sit on the Earth's) over the
	// whole family on a wide screen; only the picked body's on a phone or once one's picked.
	function moveTags( list ) {

		const narrow = size.x <= 760 || size.y <= 520;
		for ( const entry of list ) {

			const { body } = entry;
			entry.mesh.getWorldPosition( _v );
			entry.screen.copy( _v ).project( camera );
			entry.shown = entry.screen.z < 1;
			_v.y -= body.size * 1.15;
			_v.project( camera );
			const show = entry.shown && ( chosen ? body.id === chosen : ! narrow && ! body.parent );
			const tag = ui.tagOf[ body.id ];
			if ( tag.hidden === show ) tag.hidden = ! show;
			if ( ! show ) continue;
			const x = Math.round( ( _v.x + 1 ) / 2 * size.x );
			const y = Math.round( ( 1 - _v.y ) / 2 * size.y + 2 );
			if ( entry.tagAt[ 0 ] === x && entry.tagAt[ 1 ] === y ) continue;
			entry.tagAt[ 0 ] = x;
			entry.tagAt[ 1 ] = y;
			tag.style.transform = `translate(${ x }px, ${ y }px) translate(-50%, 0)`;

		}

	}

	// The body under a point on the screen: hit, or else the nearest within REACH px (small worlds
	// are hard to hit).
	function bodyAt( x, y ) {

		if ( ! gl ) return null;
		ndc.set( x / size.x * 2 - 1, - y / size.y * 2 + 1 );
		raycaster.setFromCamera( ndc, camera );
		const hit = raycaster.intersectObjects( gl.meshes, false )[ 0 ];
		if ( hit ) return hit.object.userData.id;
		let best = null;
		let nearest = REACH;
		for ( const entry of gl.list ) {

			if ( ! entry.shown ) continue;
			const d = Math.hypot( ( entry.screen.x + 1 ) / 2 * size.x - x, ( 1 - entry.screen.y ) / 2 * size.y - y );
			if ( d < nearest ) {

				nearest = d;
				best = entry.body.id;

			}

		}

		return best;

	}

	let settledOnce = false;

	// --- the API ---

	function open() {

		if ( isOpen ) return;
		ui ??= buildUi();
		if ( ! gl ) {

			gl = buildScene();
			settledOnce = false;

		}

		isOpen = true;
		picked = current();
		shownCurrent = picked;
		countsKey = null;
		fillCounts();
		chosen = null;
		overview();
		markRadios();
		view.zoom = 1;
		dialog.showModal();
		window.addEventListener( 'keydown', guard, true );
		relayout();
		settledOnce = false;
		ui.radios[ picked ]?.focus( { preventScroll: true } );
		dirty = true;

	}

	// Synchronous: onClose has run (the page's own things shown again, the focus back) by the time it
	// returns, so whatever closed it (Drive, a spot, Join) finds the globe as it was.
	function closeOrrery() {

		if ( ! isOpen ) return;
		isOpen = false;
		window.removeEventListener( 'keydown', guard, true );
		if ( dialog.open ) dialog.close();
		onClose();

	}

	function render( dt = 0 ) {

		if ( ! isOpen ) return;
		if ( ! gl ) {

			// Freed as the page went (pagehide), and the page is back.
			gl = buildScene();
			settledOnce = false;

		}

		renderer.getSize( size );
		if ( size.x !== seen.x || size.y !== seen.y ) relayout();
		const here = current();
		if ( here !== shownCurrent ) {

			shownCurrent = here;
			markRadios();
			if ( chosen ) fill( chosen );
			dirty = true;

		}

		if ( ! dirty && settled && reducedMotion() ) return;
		dirty = false;
		draw( Math.min( Math.max( dt, 0 ), 0.05 ) );

	}

	// The counts, the party and the game's world read again (main.js: on new counts, on the party's
	// changes).
	function update() {

		if ( ! ui ) return;
		fillCounts();
		const here = current();
		if ( here !== shownCurrent ) {

			shownCurrent = here;
			markRadios();
			if ( chosen ) fill( chosen );

		} else fillParty();
		dirty = true;

	}

	function dispose() {

		closeOrrery();
		freeScene();
		removeEventListener( 'pagehide', freeScene );
		ui = null;
		dialog.replaceChildren();

	}

	// The pictures and shapes go from the GPU as the page goes (built again should it come back).
	addEventListener( 'pagehide', freeScene );

	return {
		open,
		close: closeOrrery,
		render,
		update,
		dispose,
		get isOpen() {

			return isOpen;

		},
	};

}
