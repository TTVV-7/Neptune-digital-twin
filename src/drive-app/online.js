import { MathUtils, Matrix4, Vector3 } from 'three';
import { busiest, checkDot, DOT_SPREAD, ONLINE_AREAS, toGeodetic } from './live-protocol.js';
import { formatLatLon, metresBetween, spotNear } from './places.js';

// Who's driving now, on the globe (docs/world-drive.md, "On the globe: who's driving now"): where
// people are driving just now, from GET /api/online, as a glowing dot over each area with how many
// are driving there (bigger for more), and the panel's "Driving now", with how many in all and the
// busiest few areas. A dot or an area flies the globe there and pins it, with "3 drivers here" on the
// pin's card; Drive here drops in there, in that area's room, so you see them. A dot of more than one
// area flies down over them instead, near enough that they come apart. Only where and how many come:
// never who.
//
// It asks when the globe shows, then every POLL_MS while the globe shows and the tab can be seen,
// never while driving, nor while the Garage is open, nor once nobody has touched the page for
// IDLE_MS (a tab left on the globe on a second screen): it asks again at the next touch. An answer is
// kept 30 s, by the Worker in each of Cloudflare's locations and by the browser, and only a Worker
// with none kept asks DriveLimits, which counts it against driving with others' budget for the day:
// a page alone on the globe in its location is an ask a minute. Answered off (LIVE, or the day's
// budget spent), or with driving with others over for this visit (live.js's ended, or the visit run
// out), it's gone for the visit.

const POLL_MS = 60000;
const IDLE_MS = 10 * 60000;
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
// area has more than the others it knows are driving in its room there: each of those is taken to be
// in the area nearest where it last knew them, if there's one within OTHERS_NEAR (m).
const YOU_MS = 100000;
const YOU_NEAR = 3000;
const OTHERS_NEAR = YOU_NEAR + DOT_SPREAD;
// A dot of more than one area flies the globe down over them no nearer than this (m): any two areas'
// dots are apart from there.
const ZOOM_LEAST = 6000;

const DEG = MathUtils.DEG2RAD;
const _pos = new Vector3();
const _normal = new Vector3();
const _to = new Vector3();
const _cam = new Vector3();
const _mean = new Vector3();
const _inverse = new Matrix4();

// camera, earth (the tiles' group, or the test globe, whose matrixWorld takes Earth-centred
// positions into the scene), ellipsoid: as main.js has them; canvas: the renderer's; live: live.js's;
// layer: the element the dots go in; panel: panel.js's; covers: the elements a dot isn't drawn
// under; mode(): main.js's; paused(): whether something covers the globe (the Garage), so it asks
// nothing; onPick( place ): fly the globe to a place and pin it; onZoom( { lat, lon, distance } ):
// fly the globe straight down over a spot, from `distance` (m) up. poll and idle: POLL_MS and IDLE_MS
// unless the tests say.
export function createOnline( {
	camera, earth, ellipsoid, canvas, live, layer, panel, covers, mode, paused = () => false, onPick, onZoom, poll = POLL_MS, idle = IDLE_MS,
} ) {

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
	// The last touch, click, key or wheel anywhere on the page: after `idle` without one it asks
	// nothing more, and at the next it asks at once.
	let touchedAt = performance.now();
	for ( const type of [ 'pointerdown', 'keydown', 'wheel', 'touchstart' ] ) window.addEventListener( type, () => {

		if ( performance.now() - touchedAt >= idle ) nextAsk = 0;
		touchedAt = performance.now();

	}, { capture: true, passive: true } );
	// A pointer over a dot shows it can be clicked (the dots let the pointer through to the globe, so
	// a drag that starts on one spins it: see tap).
	canvas.addEventListener( 'pointermove', e => {

		const over = e.pointerType === 'mouse' && mode() === 'globe' && ! off ? dotAt( e.clientX, e.clientY ) : - 1;
		canvas.style.cursor = over >= 0 ? 'pointer' : '';
		buttons.forEach( ( button, i ) => button.classList.toggle( 'hover', i === over ) );

	} );

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
				nextAsk = performance.now() + poll;

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

		// The others it knows are driving in its room: while it's still in it (it stays a minute back on
		// the globe) as they are now, else as it last knew.
		if ( live.room === you.room ) you.others = othersDriving();
		const area = found.find( a => you.spots.some( spot => metresBetween( spot.lat, spot.lon, a.lat, a.lon ) < YOU_NEAR ) && a.count > othersIn( a, found ) );
		if ( ! area ) return 0;
		area.count --;
		return 1;

	}

	// Where each of the others driving in its room is ({ lat, lon }): where it last knew their car
	// to be, else where they dropped in, or null where it can't say.
	function othersDriving() {

		return [ ...live.players.values() ].filter( p => ! p.away ).map( p => p.s ? toGeodetic( p.s[ 0 ], p.s[ 1 ], p.s[ 2 ] ) : p.place ?? null );

	}

	// How many of those others are in `area`, one of `found`: each in the area nearest them, if
	// there's one within OTHERS_NEAR (a room's drivers far apart are dots of their own), and one it
	// can't say where in any.
	function othersIn( area, found ) {

		let count = 0;
		for ( const other of you.others ) {

			let nearest = null;
			let gap = OTHERS_NEAR;
			for ( const a of other ? found : [] ) {

				const d = metresBetween( other.lat, other.lon, a.lat, a.lon );
				if ( d < gap ) {

					nearest = a;
					gap = d;

				}

			}

			if ( ! other || nearest === area ) count ++;

		}

		return count;

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

	// The place a dot or a row pins, with how many are driving there: a start spot's, by its name,
	// when it's that near it (so its leaderboard is the spot's), else a pin, which the leaderboard
	// and the others know by where it is. Either way where the dot is, so Drive here is in its room;
	// and `near` says which start spot it's near, if one is, for the pin's card and the drive's.
	function placeOf( area ) {

		const spot = spotNear( area.lat, area.lon, NAMED_WITHIN );
		const at = spot && metresBetween( spot.lat, spot.lon, area.lat, area.lon ) <= DOT_SPREAD ? spot : null;
		return { name: at?.name ?? 'Dropped pin', region: at?.region ?? '', near: spot ? `Near ${ spot.name }` : '', lat: area.lat, lon: area.lon, drivers: area.count };

	}

	function nameOf( area ) {

		const spot = spotNear( area.lat, area.lon, NAMED_WITHIN );
		return spot ? `Near ${ spot.name }` : formatLatLon( area.lat, area.lon );

	}

	// Each frame, the dots over where they are: through the earth's matrix as it is now (a recentre
	// moves it), not round the back of the Earth or off the screen, nor under the panel or the pin's
	// card. Dots that would overlap are one, with all their drivers and areas, at the busiest's spot;
	// one grown that way can come to overlap another, so again until none do.
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
			const dot = { x, y, count: area.count, size: sizeOf( area.count ), members: [ area ] };
			const near = dots.find( other => overlap( other, dot ) );
			if ( near ) join( near, dot );
			else dots.push( dot );

		}

		for ( let again = true; again; ) {

			again = false;
			for ( let i = 0; i < dots.length; i ++ ) for ( let j = dots.length - 1; j > i; j -- ) {

				if ( ! overlap( dots[ i ], dots[ j ] ) ) continue;
				// The busier stays where it is (the earlier, as they're busiest first, if they're even).
				if ( dots[ j ].count > dots[ i ].count ) [ dots[ i ], dots[ j ] ] = [ dots[ j ], dots[ i ] ];
				join( dots[ i ], dots[ j ] );
				dots.splice( j, 1 );
				again = true;

			}

		}

		dots.forEach( ( dot, i ) => {

			const button = buttons[ i ] ?? makeButton();
			button.members = dot.members;
			const label = dot.members.length > 1 ? `${ drivers( dot.count ) } driving round here: show them` : `${ drivers( dot.count ) } driving here`;
			if ( button.count !== dot.count || button.label !== label ) {

				button.count = dot.count;
				button.label = label;
				button.textContent = String( dot.count );
				button.setAttribute( 'aria-label', label );
				button.style.setProperty( '--size', `${ dot.size }px` );
				button.classList.toggle( 'many', dot.count >= 100 );

			}

			button.style.transform = `translate( ${ dot.x.toFixed( 1 ) }px, ${ dot.y.toFixed( 1 ) }px )`;
			button.hidden = false;

		} );
		hideFrom( dots.length );
		drawn = dots;

	}

	// Each dot is a button, for the keyboard and screen readers; a pointer goes through it to the
	// globe, which tells a tap from a drag and hands taps here (see tap), so a drag that starts on a
	// dot spins the globe as anywhere else.
	function makeButton() {

		const button = Object.assign( document.createElement( 'button' ), { type: 'button', className: 'online-dot', hidden: true } );
		button.addEventListener( 'click', () => go( button.members ) );
		layer.append( button );
		buttons.push( button );
		return button;

	}

	// A dot's areas: one flies there and pins it; more fly down over them.
	function go( members ) {

		if ( ! members?.length ) return;
		if ( members.length === 1 ) onPick( placeOf( members[ 0 ] ) );
		else zoomOn( members );

	}

	// Straight down over `members` (their mean, by how many drive in each), near enough that the two
	// nearest come apart on the screen, and at least four times nearer than now (so tapping a dot that
	// is still more than one parts it further), yet far enough that all of them stay in sight.
	function zoomOn( members ) {

		const all = members.reduce( ( sum, area ) => sum + area.count, 0 );
		_mean.set( 0, 0, 0 );
		for ( const area of members ) _mean.addScaledVector( area.at, area.count / all );
		const { lat, lon } = ellipsoid.getPositionToCartographic( _mean, {} );
		ellipsoid.getCartographicToPosition( lat, lon, 0, _mean );
		let nearest = Infinity;
		let farthest = 0;
		members.forEach( ( area, i ) => {

			farthest = Math.max( farthest, area.at.distanceTo( _mean ) );
			for ( let j = i + 1; j < members.length; j ++ ) nearest = Math.min( nearest, area.at.distanceTo( members[ j ].at ) );

		} );
		// From `d` m straight above, the view's height is 2 d tan( fov / 2 ) m across.
		const tan = Math.tan( camera.fov * DEG / 2 );
		const apart = nearest * window.innerHeight / ( 2 * tan * DOT_LARGEST * 1.25 );
		const inSight = farthest / ( 0.6 * tan * Math.min( 1, camera.aspect ) );
		earth.updateWorldMatrix( true, false );
		camera.getWorldPosition( _cam ).applyMatrix4( _inverse.copy( earth.matrixWorld ).invert() );
		const high = ellipsoid.getPositionElevation( _cam );
		onZoom( { lat: lat / DEG, lon: lon / DEG, distance: Math.max( ZOOM_LEAST, inSight, Math.min( apart, high / 4 ) ) } );

	}

	// The drawn dot at ( x, y ) on the screen (its index), or -1.
	function dotAt( x, y ) {

		return drawn.findIndex( dot => Math.hypot( dot.x - x, dot.y - y ) <= dot.size / 2 );

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
			if ( ( off || live.ended || Date.now() >= live.visitEnds ) && ( areas.length || ! layer.hidden ) ) {

				off = true;
				show( [], 0 );
				layer.hidden = true;

			}

			if ( off || now !== 'globe' ) return;
			const at = performance.now();
			if ( ! asking && at >= nextAsk && at - touchedAt < idle && ! paused() && document.visibilityState === 'visible' ) ask();
			place();

		},

		// A tap on the globe at ( x, y ) on the screen (globe.js's onTap): true if it was on a dot,
		// which then goes there.
		tap( x, y ) {

			const i = mode() === 'globe' && ! off ? dotAt( x, y ) : - 1;
			if ( i < 0 ) return false;
			go( drawn[ i ].members );
			return true;

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
		// The dots on screen: { count, x, y, size, label }.
		get dots() {

			return drawn.map( ( { count, x, y, size }, i ) => ( { count, x, y, size, label: buttons[ i ].getAttribute( 'aria-label' ) } ) );

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

// Whether two dots on the screen overlap.
function overlap( a, b ) {

	return Math.hypot( a.x - b.x, a.y - b.y ) < ( a.size + b.size ) / 2;

}

// Dot `b` taken into `a`, which stays where it is.
function join( a, b ) {

	a.count += b.count;
	a.size = sizeOf( a.count );
	a.members.push( ...b.members );

}
