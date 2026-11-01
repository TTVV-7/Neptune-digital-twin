import { MathUtils, Vector3 } from 'three';
import { busiest, checkDot, ONLINE_AREAS } from './live-protocol.js';
import { formatLatLon, metresBetween, spotNear } from './places.js';

// Who's driving now, on the globe (docs/world-drive.md, "On the globe: who's driving now"): where
// people are driving just now, from GET /api/online, as a glowing dot over each area with how many
// are driving there (bigger for more), and the panel's "Driving now", with how many in all and the
// busiest few areas. A dot or an area flies the globe there and pins it, with "3 drivers here now"
// on the pin's card; Drive here drops in there, in that area's room, so you see them. Only where and
// how many come: never who.
//
// It asks when the globe shows, then every POLL_MS while the globe shows and the tab can be seen,
// never while driving. An answer is kept 30 s, by the Worker in each of Cloudflare's locations and by
// the browser, and only a Worker with none kept asks DriveLimits, which counts it against driving
// with others' budget for the day. Answered off (LIVE, or the day's budget spent), or with driving
// with others over for this visit (live.js's ended), it's gone for the visit.

const POLL_MS = 60000;
// The panel lists the busiest this many areas.
const LISTED = 5;
// An area is named after the nearest start spot this near (m), else by where it is.
const NAMED_WITHIN = 25000;
// Dots from 32 px across (a touch target), for one driver, up to this for many.
const DOT_LARGEST = 60;
// How often (ms) where the panel and the pin's card are is looked at again: a dot under them isn't
// drawn.
const COVERS_MS = 500;
// Back on the globe from driving where this page was counted (an area's room), an answer for this
// long (ms) may still count it there: its room says it's gone at its next report, a minute at most
// after, and an answer is kept 30 s. So it's taken off the area this near (m) where it was, if that
// area has more than the others it knows are driving in its room.
const YOU_MS = 100000;
const YOU_NEAR = 3000;

const DEG = MathUtils.DEG2RAD;
const _pos = new Vector3();
const _normal = new Vector3();
const _to = new Vector3();
const _cam = new Vector3();

// camera, earth (the tiles' group, or the test globe, whose matrixWorld takes Earth-centred
// positions into the scene), ellipsoid: as main.js has them; canvas: the renderer's; live: live.js's;
// layer: the element the dots go in; panel: panel.js's; covers: the elements a dot isn't drawn
// under; mode(): main.js's; onPick( place ): fly the globe to a place and pin it.
export function createOnline( { camera, earth, ellipsoid, canvas, live, layer, panel, covers, mode, onPick } ) {

	// Off, as an answer said (for this visit); total, and the areas (DOTs with where they are in the
	// Earth's frame, and which way is up there), busiest first.
	let off = false;
	let total = 0;
	let areas = [];
	let asking = null;
	let nextAsk = 0;
	let lastMode = null;
	// This page, just back on the globe (see left).
	let you = null;
	// The dots' buttons (made as they're needed, kept), and what they show.
	const buttons = [];
	let drawn = [];
	let covered = [];
	let coveredAt = - Infinity;

	// --- asking ---

	function ask() {

		asking ??= ( async () => {

			try {

				const res = await fetch( '/api/online', { headers: { Accept: 'application/json' } } );
				take( res.ok && /json/.test( res.headers.get( 'Content-Type' ) ?? '' ) ? await res.json() : null );

			} catch {

				// Not reached (offline): what's shown stays till the next ask.

			} finally {

				asking = null;
				nextAsk = performance.now() + POLL_MS;

			}

		} )();
		return asking;

	}

	// An answer, { on, total, areas }, checked as the Worker checks what rooms say; null for none (a
	// Worker without it).
	function take( answer ) {

		if ( off ) return;
		if ( answer?.on === false ) {

			off = true;
			show( [], 0 );
			return;

		}

		const found = answer?.on === true && Array.isArray( answer.areas ) ? answer.areas.slice( 0, ONLINE_AREAS ).map( checkDot ).filter( Boolean ) : null;
		if ( ! found ) {

			show( [], 0, false );
			return;

		}

		const counted = found.reduce( ( sum, area ) => sum + area.count, 0 );
		const all = Number.isInteger( answer.total ) && answer.total >= counted ? answer.total : counted;
		const mine = discount( found );
		show( found.filter( area => area.count > 0 ).sort( busiest ), all - mine );

	}

	// This page itself, still counted where it was driving: 1 taken off that area, or 0 (see left).
	function discount( found ) {

		if ( ! you || performance.now() > you.until ) {

			you = null;
			return 0;

		}

		// The others it knows are driving there: those in its room, while it's still in it (it stays a
		// minute back on the globe), else as it last knew.
		if ( live.room === you.room ) you.others = othersDriving();
		const area = found.find( a => a.count > you.others && you.spots.some( spot => metresBetween( spot.lat, spot.lon, a.lat, a.lon ) < YOU_NEAR ) );
		if ( ! area ) return 0;
		area.count --;
		return 1;

	}

	function othersDriving() {

		return [ ...live.players.values() ].filter( p => ! p.away ).length;

	}

	// --- showing it ---

	// The areas and the total, in the panel and as dots; listed: false hides the panel's part.
	function show( found, all, listed = true ) {

		areas = found.map( area => ( {
			...area,
			at: ellipsoid.getCartographicToPosition( area.lat * DEG, area.lon * DEG, area.height, new Vector3() ),
			up: ellipsoid.getCartographicToNormal( area.lat * DEG, area.lon * DEG, new Vector3() ),
		} ) );
		total = Math.max( 0, all );
		panel.setOnline( off || ! listed ? null : {
			summary: total ? `${ total } driving now. Tap a glowing dot to join them.` : 'Nobody driving right now: be the first.',
			areas: areas.slice( 0, LISTED ).map( area => ( { title: nameOf( area ), subtitle: drivers( area.count ), place: placeOf( area ) } ) ),
		} );
		// A pin on an area says how many are there now.
		const pinned = panel.pinned;
		if ( pinned && 'drivers' in pinned ) {

			const count = areas.find( area => area.lat === pinned.lat && area.lon === pinned.lon )?.count ?? 0;
			if ( count !== pinned.drivers ) {

				pinned.drivers = count;
				panel.setPin( pinned );

			}

		}

		if ( ! areas.length ) hideFrom( 0 );

	}

	// The place a dot or a row pins: named after the start spot near it, if there's one (else a pin,
	// which the leaderboard and the others know by where it is), with how many are driving there.
	function placeOf( area ) {

		const spot = spotNear( area.lat, area.lon, NAMED_WITHIN );
		return { name: spot ? `Near ${ spot.name }` : 'Dropped pin', region: spot?.region ?? '', lat: area.lat, lon: area.lon, drivers: area.count };

	}

	function nameOf( area ) {

		const spot = spotNear( area.lat, area.lon, NAMED_WITHIN );
		return spot ? `Near ${ spot.name }` : formatLatLon( area.lat, area.lon );

	}

	// Each frame, the dots over where they are: through the earth's matrix as it is now (a recentre
	// moves it), not round the back of the Earth or off the screen, nor under the panel or the pin's
	// card. Dots that would overlap are one, with all their drivers, at the busiest's spot (which a tap
	// flies to).
	function place() {

		const now = performance.now();
		if ( now - coveredAt > COVERS_MS ) {

			coveredAt = now;
			covered = covers.map( element => element.getBoundingClientRect() ).filter( rect => rect.width > 0 && rect.height > 0 );

		}

		earth.updateWorldMatrix( true, false );
		camera.getWorldPosition( _cam );
		const width = window.innerWidth;
		const height = window.innerHeight;
		const dots = [];
		for ( const area of areas ) {

			_pos.copy( area.at ).applyMatrix4( earth.matrixWorld );
			_normal.copy( area.up ).transformDirection( earth.matrixWorld );
			if ( _normal.dot( _to.subVectors( _cam, _pos ) ) <= 0 ) continue;
			_pos.project( camera );
			if ( Math.abs( _pos.x ) > 1 || Math.abs( _pos.y ) > 1 || _pos.z > 1 ) continue;
			const x = ( _pos.x + 1 ) / 2 * width;
			const y = ( 1 - _pos.y ) / 2 * height;
			if ( covered.some( rect => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom ) ) continue;
			const size = sizeOf( area.count );
			const near = dots.find( dot => Math.hypot( dot.x - x, dot.y - y ) < ( dot.size + size ) / 2 );
			if ( near ) {

				near.count += area.count;
				near.size = sizeOf( near.count );

			} else dots.push( { x, y, count: area.count, size, lead: area } );

		}

		dots.forEach( ( dot, i ) => {

			const button = buttons[ i ] ?? makeButton();
			button.lead = dot.lead;
			if ( button.count !== dot.count ) {

				button.count = dot.count;
				button.textContent = String( dot.count );
				button.setAttribute( 'aria-label', `${ drivers( dot.count ) } driving here` );
				button.style.setProperty( '--size', `${ dot.size }px` );
				button.classList.toggle( 'many', dot.count >= 100 );

			}

			button.style.transform = `translate( ${ dot.x.toFixed( 1 ) }px, ${ dot.y.toFixed( 1 ) }px )`;
			button.hidden = false;

		} );
		hideFrom( dots.length );
		drawn = dots;

	}

	function makeButton() {

		const button = Object.assign( document.createElement( 'button' ), { type: 'button', className: 'online-dot', hidden: true } );
		button.addEventListener( 'click', () => button.lead && onPick( placeOf( button.lead ) ) );
		// The wheel over a dot zooms the globe as it does anywhere else on it.
		button.addEventListener( 'wheel', e => canvas.dispatchEvent( new WheelEvent( 'wheel', e ) ), { passive: true } );
		layer.append( button );
		buttons.push( button );
		return button;

	}

	function hideFrom( first ) {

		for ( let i = first; i < buttons.length; i ++ ) buttons[ i ].hidden = true;
		if ( first === 0 ) drawn = [];

	}

	return {

		// Each frame, before the scene's drawn.
		update() {

			const now = mode();
			// The globe showing again: asked at once (an answer still kept comes from the browser).
			if ( now !== lastMode && now === 'globe' ) nextAsk = 0;
			lastMode = now;
			if ( ( off || live.ended ) && ( areas.length || ! layer.hidden ) ) {

				off = true;
				show( [], 0 );
				layer.hidden = true;

			}

			if ( off || now !== 'globe' ) return;
			if ( ! asking && performance.now() >= nextAsk && document.visibilityState === 'visible' ) ask();
			place();

		},

		// Back on the globe from driving, the car last at `spot` ({ lat, lon }, or null): if this page was
		// in an area's room, answers for a while may still count it there (see YOU_MS).
		left( spot ) {

			const room = live.status === 'live' && live.room?.startsWith( 'near:' ) ? live.room : null;
			you = room ? { room, spots: [ spot, live.place ].filter( Boolean ), others: othersDriving(), until: performance.now() + YOU_MS } : null;

		},

		// Ask now (the tests).
		refresh: () => ask(),

		get on() {

			return ! off;

		},
		get total() {

			return total;

		},
		get areas() {

			return areas.map( ( { lat, lon, height, count } ) => ( { lat, lon, height, count } ) );

		},
		// The dots on screen: { count, x, y, label }.
		get dots() {

			return drawn.map( ( { count, x, y }, i ) => ( { count, x, y, label: buttons[ i ].getAttribute( 'aria-label' ) } ) );

		},

	};

}

// "1 driver", "3 drivers".
export function drivers( count ) {

	return `${ count } ${ count === 1 ? 'driver' : 'drivers' }`;

}

// A dot's size (px across) for `count` drivers.
function sizeOf( count ) {

	return Math.min( DOT_LARGEST, Math.round( 32 + 7 * Math.log2( count ) ) );

}
