import './finds.css';
import {
	AdditiveBlending, CylinderGeometry, DoubleSide, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, ShaderMaterial, Vector3,
} from 'three';
import { FINDS_ON, FIND_DATA, KINDS, findOf } from './finds-data.js';
import {
	STORAGE, approachFor, cardOf, collectable, countIn, dataLine, distance, formatDistance, missing, nearOnPlacing, nearestMissing, placeOf,
	readStored, stillNear, writeStored,
} from './finds-rules.js';
import { WORLDS, listOf } from './worlds.js';

// Discoveries (docs/world-drive.md, "Discoveries"; the list is finds-data.js, the rules finds-rules.js):
// real, named places on the Moon, Mars, Vesta and Ceres, each marked by a glowing beacon, to drive or
// fly to and collect. Collecting one shows a card of true facts about it, with its height in the very
// data the ground is built from and that data named, so the far worlds show off that they're real;
// each world's collection book keeps them, and they count toward achievements and XP (progress.js
// sends them, worker/drive/progress.js takes them).
//
// Seen at every range: on the globe each is a pin (gold not found, cyan found), so the globe is the
// map of what's left; while driving an arrow at the screen's edge (or a mark over it, once it's in
// view) always points at the nearest one not yet found, with its name and how far, however far that
// is; and the beacons stand over those within BEACONS of the car, tall enough to see from far off. A
// drop-in on one not yet found starts the car APPROACH from it, facing it (finds-rules.js's
// approachFor), so the first minute is driving up to a glowing column.
//
// Kept in this browser (localStorage, finds-rules.js's STORAGE), so they're everyone's, nickname or
// not; with a nickname they're the player's too, sent with the progress reports, and the Worker's list
// (an answer's `finds`) is merged in here, any it lacks sent again (applyServer). The Earth has none:
// its ground is Google's tiles, not data the game can show or credit as its own.

// The beacons: drawn for finds within BEACONS m of the car, redrawn every REDRAW s (the collecting is
// tested every frame); each as tall as its distance × TALL (from LOW to HIGH m) and as wide as × WIDE
// (THIN to THICK m), so one far off still reads; and a ring round the collecting distance once within
// RING m of it.
const BEACONS = 150000;
const REDRAW = 0.5;
const TALL = [ 0.06, 200, 4000 ];
const WIDE = [ 0.002, 8, 120 ];
const RING = 1000;
// The most beacons at once (finds within BEACONS: never near this many), and a ring.
const MOST = 24;
// Not found: a warm gold; found: a pale cyan, faint.
const GOLD = [ 1, 0.79, 0.3, 0.9 ];
const CYAN = [ 0.6, 0.95, 1, 0.35 ];
// The card goes after CARD_FOR ms.
const CARD_FOR = 14000;
// The pointer is kept EDGE px inside the screen.
const EDGE = 44;
// Collected on another device: kept with this as its time, which the book doesn't show as a date.
const ELSEWHERE = 1;

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _u = new Vector3();
const _s = new Vector3();
const _c = new Vector3();
const _d = new Vector3();
const Y = new Vector3( 0, 1, 0 );

// root: the element the card, book, pointer and pins go in; scene, camera: the view (the pointer and
// pins are placed by the camera); bodyOf( id ): the world's body ({ group, ellipsoid, heightAt }) or
// null; progress: progress.js's (progress.found( id ) sends a find with the next report); onLens():
// turn the data lens on; onShowPlace( place ): fly the globe there; onDriveTo( find, approach ): drop
// in at approach ({ lat, lon, heading }), or at the find's place if that's null; toast( text );
// pause(): pause the drive, before the book opens over it (as every other dialog opened mid-drive
// does: drive.js listens for its keys before the book could stop them).
export function createFinds( { root = document.body, camera, bodyOf = () => null, progress = null, onLens = () => {}, onShowPlace = () => {}, onDriveTo = () => {}, toast = () => {}, pause = () => {} } = {} ) {

	// The finds collected here: { id: ms }.
	let at = load();
	let world = null;
	let mode = 'globe';
	// Finds within ARM of where the car was last put down, not counting until it's been that far
	// from each; where the car was last frame; the drawing's clock.
	let near = new Set();
	let last = null;
	let since = REDRAW;
	let clock = 0;
	let target = null;
	let beacons = null;
	let card = null;
	let cardTimer = 0;
	let book = null;
	let bookWorld = null;
	const pointer = makePointer( root );
	const pins = makePins( root );

	const has = id => Object.hasOwn( at, id );
	const ids = () => Object.keys( at );
	const hasFinds = id => ( FINDS_ON[ id ]?.length ?? 0 ) > 0;

	// --- the world and the mode ---

	function setWorld( id ) {

		if ( id === world ) return;
		world = id;
		clearBeacons();
		near = new Set();
		last = null;
		target = null;
		pointer.root.hidden = true;
		pins.build( hasFinds( id ) ? FINDS_ON[ id ] : [], has, id => openBook( world, id ) );
		pins.root.hidden = mode !== 'globe' || ! hasFinds( id );
		if ( ! hasFinds( id ) ) return;
		const body = bodyOf( id );
		if ( body ) {

			beacons = makeBeacons();
			body.group.add( beacons );

		}

		since = REDRAW;

	}

	// main.js's modes: 'globe' (the pins), 'driving' (the beacons and the pointer), 'paused' (the
	// beacons stay in view), 'dropping' (nothing yet).
	function setMode( next ) {

		mode = next === 'drive' ? 'driving' : next;
		// The card is the drive's: gone with it (paused, back to the globe). Esc, which drive.js takes
		// first to pause, so closes it too.
		if ( mode !== 'driving' ) hideCard();
		if ( beacons ) beacons.visible = mode === 'driving' || mode === 'paused';
		pointer.root.hidden = true;
		pins.root.hidden = mode !== 'globe' || ! hasFinds( world );
		last = null;

	}

	// The car put down at ( lat, lon ): a drop-in, a reset, a respawn, a world changed to.
	function placed( { lat, lon } ) {

		if ( ! hasFinds( world ) ) return;
		near = nearOnPlacing( world, { lat, lon } );
		last = null;
		since = REDRAW;

	}

	// --- each frame ---

	// Every frame. While driving, `car`: { lat, lon, above (m over the ground), flying (in the air: a
	// plane, a jump, a fall, a parachute), compact (a challenge run: the card small) }; otherwise
	// nothing (on the globe, the pins are placed).
	function update( dt, car = null ) {

		clock += dt;
		if ( ! hasFinds( world ) ) return;
		if ( beacons ) beacons.material.uniforms.time.value = clock;
		if ( mode !== 'driving' || ! car ) {

			if ( mode === 'globe' ) pins.place( bodyOf( world ), camera );
			if ( mode !== 'driving' ) pointer.root.hidden = true;
			return;

		}

		const radius = WORLDS[ world ].radius;
		if ( near.size ) near = stillNear( near, world, car );
		for ( const id of FINDS_ON[ world ] ) {

			if ( has( id ) ) continue;
			const place = placeOf( id );
			// (Only those within a few km are worth the closer look.)
			if ( distance( place, car, radius ) > 5000 + ( last ? distance( last, car, radius ) : 0 ) ) continue;
			if ( collectable( place, { radius, armed: ! near.has( id ) }, last, car ) ) collect( id, car );

		}

		last = { lat: car.lat, lon: car.lon, above: car.above, flying: !! car.flying };
		since += dt;
		if ( since >= REDRAW ) {

			since = 0;
			drawBeacons( car );
			target = nearestMissing( world, car, new Set( ids() ) );

		}

		placePointer( car );

	}

	// --- collecting ---

	function collect( id, car ) {

		at[ id ] = Date.now();
		save();
		near.delete( id );
		progress?.found?.( id );
		since = REDRAW;
		showCard( id, { compact: !! car?.compact } );
		pins.refresh( has );
		if ( book?.open ) renderBook();

	}

	// --- the beacons ---

	function makeBeacons() {

		// An open eight-sided tube a unit high, from its foot up; its colour and alpha each instance's.
		const geometry = new CylinderGeometry( 1, 1, 1, 8, 1, true ).translate( 0, 0.5, 0 );
		geometry.setAttribute( 'tint', new InstancedBufferAttribute( new Float32Array( MOST * 4 ), 4 ) );
		const material = new ShaderMaterial( {
			uniforms: { time: { value: 0 } },
			vertexShader: /* glsl */ `
				attribute vec4 tint;
				varying vec4 vTint;
				varying float vUp;
				#include <common>
				#include <logdepthbuf_pars_vertex>
				void main() {
					vTint = tint;
					vUp = position.y;
					gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
					#include <logdepthbuf_vertex>
				}
			`,
			fragmentShader: /* glsl */ `
				uniform float time;
				varying vec4 vTint;
				varying float vUp;
				#include <common>
				#include <logdepthbuf_pars_fragment>
				void main() {
					#include <logdepthbuf_fragment>
					// Brightest at the foot, fading to nothing at the top, with a slow pulse.
					float fade = pow( 1.0 - clamp( vUp, 0.0, 1.0 ), 1.6 );
					float pulse = 0.8 + 0.2 * sin( time * 2.4 - vUp * 6.0 );
					gl_FragColor = vec4( vTint.rgb * fade * pulse * vTint.a, 1.0 );
				}
			`,
			transparent: true,
			depthWrite: false,
			depthTest: true,
			blending: AdditiveBlending,
			side: DoubleSide,
		} );
		const mesh = new InstancedMesh( geometry, material, MOST );
		mesh.name = 'finds-beacons';
		mesh.count = 0;
		// Instances move with the car: a bounding sphere worked out once would hide them at the edges.
		mesh.frustumCulled = false;
		mesh.raycast = () => {};
		mesh.renderOrder = 2;
		mesh.visible = mode === 'driving' || mode === 'paused';
		return mesh;

	}

	function clearBeacons() {

		if ( ! beacons ) return;
		beacons.removeFromParent();
		beacons.geometry.dispose();
		beacons.material.dispose();
		beacons = null;

	}

	// Each find within BEACONS of the car, standing on the drawn ground (all its detail in), and a ring
	// round any within RING.
	function drawBeacons( car ) {

		const body = bodyOf( world );
		if ( ! beacons || ! body ) return;
		const radius = WORLDS[ world ].radius;
		const tint = beacons.geometry.getAttribute( 'tint' );
		let n = 0;
		const put = ( place, height, wide, colour ) => {

			body.ellipsoid.getCartographicToPosition( place.lat * Math.PI / 180, place.lon * Math.PI / 180, body.heightAt( place.lat, place.lon ) ?? 0, _p );
			body.ellipsoid.getCartographicToPosition( place.lat * Math.PI / 180, place.lon * Math.PI / 180, 1, _u ).sub( _p ).normalize();
			_q.setFromUnitVectors( Y, _u );
			beacons.setMatrixAt( n, _m.compose( _p, _q, _s.set( wide, height, wide ) ) );
			tint.setXYZW( n, ...colour );
			n ++;

		};

		for ( const id of FINDS_ON[ world ] ) {

			if ( n >= MOST - 1 ) break;
			const place = placeOf( id );
			const metres = distance( place, car, radius );
			if ( metres > BEACONS ) continue;
			const colour = has( id ) ? CYAN : GOLD;
			put( place, clamp( metres * TALL[ 0 ], TALL[ 1 ], TALL[ 2 ] ), clamp( metres * WIDE[ 0 ], WIDE[ 1 ], WIDE[ 2 ] ), colour );
			// The collecting distance, as a low glowing band round it (a plaque's ring, at a landing site).
			if ( metres < RING && ! has( id ) && n < MOST ) put( place, 3, car.flying ? 250 : 150, [ colour[ 0 ], colour[ 1 ], colour[ 2 ], 0.7 ] );

		}

		beacons.count = n;
		beacons.instanceMatrix.needsUpdate = true;
		tint.needsUpdate = true;

	}

	// --- the pointer ---

	// The nearest find not yet found: a mark over it once it's in view, else held at the screen's edge
	// on its side and pointing there; with its name and how far. Placed toward it along the ground
	// from the car (at most 3 km out), so one over the horizon is pointed to, not looked for under it.
	function placePointer( car ) {

		const body = bodyOf( world );
		const hidden = ! target || ! body || document.querySelector( 'dialog[open]' );
		if ( hidden ) {

			pointer.root.hidden = true;
			return;

		}

		const place = placeOf( target.id );
		const rad = Math.PI / 180;
		const ground = body.heightAt( car.lat, car.lon ) ?? 0;
		body.ellipsoid.getCartographicToPosition( car.lat * rad, car.lon * rad, ground + ( car.above ?? 0 ), _c );
		body.ellipsoid.getCartographicToPosition( car.lat * rad, car.lon * rad, ground + ( car.above ?? 0 ) + 1, _u ).sub( _c ).normalize();
		body.ellipsoid.getCartographicToPosition( place.lat * rad, place.lon * rad, body.heightAt( place.lat, place.lon ) ?? 0, _d ).sub( _c );
		const reach = Math.min( target.metres, 3000 );
		_d.addScaledVector( _u, - _d.dot( _u ) );
		if ( _d.lengthSq() < 1e-6 ) _d.set( 1, 0, 0 );
		_p.copy( _c ).addScaledVector( _d.normalize(), reach ).addScaledVector( _u, 40 + reach * 0.05 );
		body.group.localToWorld( _p );
		const { x, y, off, angle } = onScreen( _p, camera );
		pointer.root.hidden = false;
		pointer.root.style.transform = `translate( ${ x }px, ${ y }px )`;
		pointer.root.classList.toggle( 'off', off );
		pointer.arrow.style.transform = `rotate( ${ angle }deg )`;
		const text = `${ cardOf( target.id )?.name ?? '' } · ${ formatDistance( target.metres ) }`;
		if ( pointer.label.textContent !== text ) pointer.label.textContent = text;

	}

	// --- the card ---

	function showCard( id, { compact = false } = {} ) {

		const info = cardOf( id );
		if ( ! info ) return;
		card ??= makeCard();
		const { have, of } = countIn( ids(), info.world );
		card.classList.toggle( 'compact', compact );
		card.querySelector( '.finds-card-icon' ).textContent = info.icon;
		card.querySelector( '.finds-card-kind' ).textContent = `Discovered · ${ info.kind } · ${ WORLDS[ info.world ].name }`;
		card.querySelector( '.finds-card-count' ).textContent = `${ have } / ${ of }`;
		card.querySelector( '.finds-card-name' ).textContent = info.name;
		const body = card.querySelector( '.finds-card-body' );
		body.replaceChildren(
			...info.facts.map( text => element( 'p', 'finds-fact', text ) ),
			...info.seeing ? [ labelled( 'p', 'finds-seeing', 'What you\'re looking at: ', info.seeing ) ] : [],
			labelled( 'p', 'finds-height', '', [ info.height, info.relief ].filter( Boolean ).join( ' ' ) ),
			element( 'p', 'finds-note small', info.note ),
			labelled( 'p', 'finds-data small', 'You\'re driving on: ', `${ info.data }.` ),
		);
		card.dataset.id = id;
		card.hidden = false;
		clearTimeout( cardTimer );
		cardTimer = setTimeout( hideCard, CARD_FOR );

	}

	function hideCard() {

		clearTimeout( cardTimer );
		if ( card ) card.hidden = true;

	}

	function makeCard() {

		const node = element( 'div', 'finds-card' );
		node.setAttribute( 'role', 'status' );
		node.hidden = true;
		node.innerHTML = `
			<div class="finds-card-head"><span class="finds-card-icon" aria-hidden="true"></span><span class="finds-card-kind"></span><span class="finds-card-count"></span>
				<button type="button" class="finds-card-close" aria-label="Close">&times;</button></div>
			<h3 class="finds-card-name"></h3>
			<div class="finds-card-body"></div>
			<div class="finds-card-actions"><button type="button" class="finds-lens">See the heights</button><button type="button" class="finds-open">Collection</button></div>`;
		// Its buttons are pressed, never focused: the keys stay the game's.
		for ( const button of node.querySelectorAll( 'button' ) ) button.addEventListener( 'mousedown', e => e.preventDefault() );
		node.querySelector( '.finds-card-close' ).addEventListener( 'click', hideCard );
		node.querySelector( '.finds-lens' ).addEventListener( 'click', () => onLens() );
		node.querySelector( '.finds-open' ).addEventListener( 'click', () => {

			hideCard();
			openBook( findOf( node.dataset.id )?.world ?? world );

		} );
		window.addEventListener( 'keydown', e => {

			if ( e.key === 'Escape' && ! node.hidden ) hideCard();

		} );
		root.append( node );
		return node;

	}

	// --- the book ---

	// The collection book, on `which` world's tab (the first with finds, for one without), with find
	// `focus`'s tile in view.
	function openBook( which = world, focus = null ) {

		// Not over a drive going on behind it.
		if ( mode === 'driving' ) pause();
		book ??= makeBook();
		bookWorld = hasFinds( which ) ? which : Object.keys( FINDS_ON )[ 0 ];
		renderBook();
		if ( ! book.open ) book.showModal();
		if ( focus ) book.querySelector( `[data-id="${ CSS.escape( focus ) }"]` )?.scrollIntoView( { block: 'center' } );

	}

	function makeBook() {

		const node = document.createElement( 'dialog' );
		node.className = 'finds-book';
		node.setAttribute( 'aria-labelledby', 'finds-book-title' );
		node.innerHTML = `
			<header>
				<h2 id="finds-book-title">Discoveries</h2>
				<button type="button" class="close" aria-label="Close">&times;</button>
			</header>
			<div class="finds-tabs" role="group" aria-label="Worlds"></div>
			<div class="finds-progress"><i></i></div>
			<p class="small finds-empty" hidden></p>
			<ol class="finds-tiles"></ol>
			<p class="small finds-footer"></p>`;
		node.querySelector( '.close' ).addEventListener( 'click', () => node.close() );
		node.addEventListener( 'click', e => e.target === node && node.close() );
		// Keys pressed here are the book's, not the game's.
		node.addEventListener( 'keydown', e => e.stopPropagation() );
		document.body.append( node );
		return node;

	}

	function renderBook() {

		const all = ids();
		// The worlds are plain buttons, the one shown pressed (not a tab widget's roles, which promise
		// arrow keys and panels). Built again each time, so a world's button that had the focus gets it
		// back, rather than the focus falling out of the book.
		const tabs = book.querySelector( '.finds-tabs' );
		const focused = tabs.contains( document.activeElement ) ? document.activeElement.dataset.world : null;
		tabs.replaceChildren( ...Object.keys( FINDS_ON ).map( id => {

			const { have, of } = countIn( all, id );
			const tab = element( 'button', 'finds-tab', `${ WORLDS[ id ].name } ${ have } / ${ of }` );
			tab.type = 'button';
			tab.dataset.world = id;
			tab.setAttribute( 'aria-pressed', String( id === bookWorld ) );
			tab.addEventListener( 'click', () => {

				bookWorld = id;
				renderBook();

			} );
			return tab;

		} ) );
		if ( focused ) tabs.querySelector( `[data-world="${ CSS.escape( focused ) }"]` )?.focus();
		const { have, of } = countIn( all, bookWorld );
		book.querySelector( '.finds-progress i' ).style.width = `${ ( have / of * 100 ).toFixed( 1 ) }%`;
		const empty = book.querySelector( '.finds-empty' );
		empty.hidden = all.length > 0;
		empty.textContent = `Discoveries are on ${ listOf( Object.keys( FINDS_ON ) ) }: drive to a glowing beacon to collect one.`;
		book.querySelector( '.finds-footer' ).textContent = `${ WORLDS[ bookWorld ].name }: ${ dataLine( bookWorld ) }.`;
		book.querySelector( '.finds-tiles' ).replaceChildren( ...FINDS_ON[ bookWorld ].map( tile ) );

	}

	function tile( id ) {

		const info = cardOf( id );
		const found = has( id );
		const item = element( 'li', `finds-tile ${ found ? 'found' : 'missing' }` );
		item.dataset.id = id;
		const icon = element( 'span', 'icon', info.icon );
		icon.setAttribute( 'aria-hidden', 'true' );
		const body = element( 'div', 'body' );
		body.append( element( 'b', 'name', info.name ), element( 'span', 'kind small', info.kind ) );
		if ( found ) {

			body.append( ...info.facts.map( text => element( 'p', 'finds-fact small', text ) ) );
			if ( info.seeing ) body.append( labelled( 'p', 'finds-seeing small', 'What you\'re looking at: ', info.seeing ) );
			body.append( element( 'p', 'finds-height small', [ info.height, info.relief ].filter( Boolean ).join( ' ' ) ) );
			if ( at[ id ] > ELSEWHERE ) body.append( element( 'span', 'when small', `Found ${ new Date( at[ id ] ).toLocaleDateString( 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' } ) }` ) );

		} else {

			body.append( element( 'span', 'region small', info.region ) );
			const actions = element( 'div', 'actions' );
			const drive = element( 'button', 'finds-drive small', 'Drive to it' );
			drive.type = 'button';
			drive.addEventListener( 'click', () => {

				book.close();
				onDriveTo( findOf( id ), approachFor( id, heightsOf( info.world ) ) );

			} );
			actions.append( drive );
			if ( mode === 'globe' && info.world === world ) {

				const show = element( 'button', 'finds-show small', 'Show on the globe' );
				show.type = 'button';
				show.addEventListener( 'click', () => {

					book.close();
					onShowPlace( placeOf( id ) );

				} );
				actions.append( show );

			}

			body.append( actions );

		}

		item.append( icon, body );
		return item;

	}

	// The heights of world `id`'s ground ( lat, lon ) => m, null until they've loaded.
	function heightsOf( id ) {

		const body = bodyOf( id );
		return ( lat, lon ) => body?.heightAt?.( lat, lon ) ?? null;

	}

	// --- kept here ---

	function load() {

		try {

			return readStored( localStorage.getItem( STORAGE ) );

		} catch {

			return {};

		}

	}

	function save() {

		try {

			localStorage.setItem( STORAGE, writeStored( at ) );

		} catch {

			// (Private windows, storage full: they're still this page's.)

		}

	}

	// The Worker's list for the player (a progress or achievements answer's `finds`): those found on
	// another device added here; and those found here that it lacks, returned to be sent again.
	function applyServer( list ) {

		if ( ! Array.isArray( list ) ) return [];
		let added = false;
		for ( const id of list ) {

			if ( findOf( id ) && ! has( id ) ) {

				at[ id ] = ELSEWHERE;
				added = true;

			}

		}

		if ( added ) {

			save();
			pins.refresh( has );
			if ( book?.open ) renderBook();

		}

		// Only those collected in this browser go back to be sent again: one marked ELSEWHERE came from
		// the Worker (an achievements answer has the whole account's, every player's, where a progress
		// answer has only this player's), so it's another player's to have been paid for, not this one's.
		return missing( ids().filter( id => at[ id ] !== ELSEWHERE ), list );

	}

	return {
		setWorld,
		setMode,
		placed,
		// The approach spawn for find `placeId` if it isn't found yet ({ lat, lon, heading }), else null
		// (a drop-in on one already found starts on it, as any place).
		approachFor( placeId ) {

			const find = findOf( placeId );
			if ( ! find || has( placeId ) ) return null;
			return approachFor( placeId, heightsOf( find.world ) );

		},
		update,
		openBook,
		countOf( id ) {

			return countIn( ids(), id );

		},
		// The data line for world `id`'s orrery sheet, or '' for one without finds.
		dataOf( id ) {

			return FIND_DATA[ id ]?.short ?? '';

		},
		applyServer,
		has,
		// Every find collected here (ids).
		get ids() {

			return ids();

		},
		dispose() {

			clearBeacons();
			hideCard();
			pointer.root.remove();
			pins.root.remove();
			card?.remove();
			book?.remove();

		},
	};

}

// --- the pointer and the pins: marks over the view ---

function makePointer( parent ) {

	const root = element( 'div', 'finds-pointer' );
	root.hidden = true;
	root.setAttribute( 'aria-hidden', 'true' );
	root.innerHTML = '<span class="finds-pointer-arrow"><svg viewBox="0 0 20 20" width="18" height="18"><path d="M10 1 17 13H3z" fill="currentColor"/></svg></span><span class="finds-pointer-dot"></span><span class="finds-pointer-label"></span>';
	parent.append( root );
	return { root, arrow: root.querySelector( '.finds-pointer-arrow' ), label: root.querySelector( '.finds-pointer-label' ) };

}

// The globe's pins: one a find on the world shown, gold until it's found, then cyan; a click opens its
// tile in the book. Those on the far side of the world are hidden.
function makePins( parent ) {

	const root = element( 'div', 'finds-pins' );
	root.hidden = true;
	parent.append( root );
	let list = [];
	return {
		root,
		build( ids, has, open ) {

			list = ids.map( id => {

				const pin = element( 'button', 'finds-pin' );
				pin.type = 'button';
				pin.dataset.id = id;
				pin.title = cardOf( id )?.name ?? '';
				pin.setAttribute( 'aria-label', `Discovery: ${ pin.title }` );
				pin.classList.toggle( 'found', has( id ) );
				pin.addEventListener( 'click', () => open( id ) );
				return { id, pin };

			} );
			root.replaceChildren( ...list.map( item => item.pin ) );

		},
		refresh( has ) {

			for ( const { id, pin } of list ) pin.classList.toggle( 'found', has( id ) );

		},
		place( body, camera ) {

			if ( ! body || root.hidden ) return;
			const rad = Math.PI / 180;
			camera.getWorldPosition( _s );
			body.group.getWorldPosition( _c );
			const width = window.innerWidth;
			const height = window.innerHeight;
			for ( const { id, pin } of list ) {

				const place = placeOf( id );
				body.ellipsoid.getCartographicToPosition( place.lat * rad, place.lon * rad, body.heightAt( place.lat, place.lon ) ?? 0, _p );
				body.group.localToWorld( _p );
				// Facing the camera (its side of the world), and in front of it.
				const facing = _d.copy( _p ).sub( _c ).dot( _u.copy( _s ).sub( _p ) ) > 0;
				_p.project( camera );
				const shown = facing && _p.z < 1 && Math.abs( _p.x ) <= 1 && Math.abs( _p.y ) <= 1;
				pin.hidden = ! shown;
				if ( shown ) pin.style.transform = `translate( ${ Math.round( ( _p.x + 1 ) / 2 * width ) }px, ${ Math.round( ( 1 - _p.y ) / 2 * height ) }px )`;

			}

		},
	};

}

// Where world point `point` is on the screen: { x, y } (px), or, behind the camera or off the screen,
// held EDGE px inside the edge on its side, with off and the angle (degrees) to point the arrow.
function onScreen( point, camera ) {

	camera.getWorldPosition( _s );
	camera.getWorldDirection( _d );
	const behind = _u.copy( point ).sub( _s ).dot( _d ) < 0;
	_c.copy( point ).project( camera );
	let x = behind ? - _c.x : _c.x;
	let y = behind ? - _c.y : _c.y;
	const width = window.innerWidth;
	const height = window.innerHeight;
	const ex = 1 - 2 * EDGE / width;
	const ey = 1 - 2 * EDGE / height;
	const off = behind || Math.abs( x ) > ex || Math.abs( y ) > ey;
	let angle = 0;
	if ( off ) {

		if ( behind && Math.abs( x ) < 1e-3 && Math.abs( y ) < 1e-3 ) y = - 1;
		const scale = 1 / Math.max( Math.abs( x ) / ex, Math.abs( y ) / ey );
		x *= scale;
		y *= scale;
		angle = Math.round( Math.atan2( x * width, y * height ) * 180 / Math.PI );

	}

	return { x: Math.round( ( x + 1 ) / 2 * width ), y: Math.round( ( 1 - y ) / 2 * height ), off, angle };

}

function clamp( value, low, high ) {

	return Math.min( high, Math.max( low, value ) );

}

function element( tag, className = '', text = null ) {

	const node = document.createElement( tag );
	if ( className ) node.className = className;
	if ( text !== null ) node.textContent = text;
	return node;

}

// A paragraph starting with a bold label.
function labelled( tag, className, label, text ) {

	const node = element( tag, className );
	if ( label ) node.append( element( 'b', '', label ) );
	node.append( text );
	return node;

}

export { KINDS };
