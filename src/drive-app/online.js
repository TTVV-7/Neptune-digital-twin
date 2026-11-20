import { MathUtils, Matrix4, Vector3 } from 'three';
import { busiest, checkDot, DOT_SPREAD, EARTH, fromFrame, LIVE_WORLD_IDS, MOON_WORLD, ONLINE_AREAS, worldOfRoom } from './live-protocol.js';
import { formatLatLon, metresBetween, spotNear } from './places.js';
import { SPOTS_ON } from './world-places.js';
import { OnWorld, WORLDS, onWorld as onTheWorld } from './worlds.js';

// Who's driving now, on the globe (docs/world-drive.md, "On the globe: who's driving now"): where
// people are driving just now, from GET /api/online, as a glowing dot over each area with how many
// are driving there (bigger for more), and the panel's "Driving now", with how many in all and the
// busiest few areas. A dot or an area flies the globe there and pins it, with "3 drivers here" on the
// pin's card; Drive here drops in there, in that area's room, so you see them. A dot of more than one
// area flies down over them instead, near enough that they come apart. Only where and how many come:
// never who. Off the Earth it's that world's (GET /api/online?world=moon, mars, vesta or ceres), its
// dots on its own globe and its areas named after its own spots; each world's panel also says how
// many are driving on the others, a tap away (one other world: it turns the globe there; more: "On
// other worlds", which opens the worlds to pick from, onOthers), even while it's off on this one (its
// budget for the day spent: the Worker's answer still says how many are on the others), so there's
// somewhere to go to drive with others. Not the Earth on a visit with no Earth (main.js's
// earthClosed): that row would lead nowhere. How many on each world (worlds, less this page where
// it's still counted) goes to onCounts as it changes, for the worlds to pick from.
//
// It asks when the globe shows, then every POLL_MS while the globe shows and the tab can be seen,
// never while driving, nor while the Garage is open, nor once nobody has touched the page for
// IDLE_MS (a tab left on the globe on a second screen): it asks again at the next touch. An answer is
// kept 30 s, by the Worker in each of Cloudflare's locations and by the browser, and only a Worker
// with none kept asks DriveLimits, which counts it against driving with others' budget for the day:
// a page alone on the globe in its location is an ask every 40 s or so. Answered off (LIVE, or the day's
// budget spent), or with driving with others over for this visit (live.js's ended, or the visit run
// out), it's gone for the visit: on that world (each world's budget is its own: it goes on asking
// there, for the others' counts), or on all (asking nothing more). After `idle` without a touch, what
// it last heard is kept as it was: counts may be old then.

const POLL_MS = 20000;
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
// positions into the scene), ellipsoid: as main.js has them; bodies: { moon, mars, vesta, ceres:
// { group, ellipsoid } } the same for each other world (moon: the Moon's alone, from before), and
// world(): which the globe shows; onWorld( world ): turn the globe to another world (the panel's line
// of how many are driving there, when it's one); onOthers( row ): the panel's line of how many are
// driving on other worlds, when it's more than one (its button); onCounts( worlds ): how many are
// driving on each world now changed ({ id: { on, total } }, less this page where it's still counted,
// or null once there's nothing more to say); canvas: the renderer's; live: live.js's;
// layer: the element the dots go in; panel: panel.js's; covers: the elements a dot isn't drawn
// under; mode(): main.js's; paused(): whether something covers the globe (the Garage), so it asks
// nothing; onPick( place ): fly the globe to a place and pin it; onZoom( { lat, lon, distance } ):
// fly the globe straight down over a spot, from `distance` (m) up; earthless: no Earth this visit at
// all, today's Earth drives being used up (main.js's earthShut), so no row for it. (A plain load,
// opened on the orrery, or a page opened on another world's link, has the Earth a reload away: its
// row stays, and picking an Earth driver reloads the page there, main.js's setWorld and boot.js's
// onEarth.) poll and idle: POLL_MS and IDLE_MS unless the tests say.
export function createOnline( {
	camera, earth, ellipsoid, bodies = {}, moon = null, world = () => EARTH, onWorld = () => {}, onOthers = () => {}, onCounts = () => {}, canvas, live, layer, panel, covers, mode,
	paused = () => false, onPick, onZoom, earthless = false, poll = POLL_MS, idle = IDLE_MS,
} ) {

	// Each world's frame (its group and shape), and which the globe shows (the Earth for a world it
	// has none for).
	const frames = { [ EARTH ]: { group: earth, ellipsoid } };
	for ( const id of LIVE_WORLD_IDS ) {

		const frame = bodies[ id ] ?? ( id === MOON_WORLD ? moon : null );
		if ( id !== EARTH && frame?.group && frame.ellipsoid ) frames[ id ] = frame;

	}

	const here = () => frames[ world() ] ? world() : EARTH;
	// Off on a world, as an answer said (for this visit), or on all (off); total, and the areas
	// (DOTs with where they are in their world's frame, and which way is up there), busiest first,
	// for the world they're of (shownWorld); how many are driving on the other worlds (elsewhere, all
	// told, and others, by world); and how many on each world, as the last answer said (heard) and
	// less this page where it's still counted (counts, as onCounts was last told).
	let off = false;
	const offWorlds = new Set();
	let total = 0;
	let areas = [];
	let shownWorld = EARTH;
	let elsewhere = 0;
	let others = [];
	let heard = null;
	let counts = null;
	let countsKey = 'null';
	let asking = null;
	let nextAsk = 0;
	let lastMode = null;
	let lastWorld = null;
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

		const over = e.pointerType === 'mouse' && mode() === 'globe' && ! offHere() ? dotAt( e.clientX, e.clientY ) : - 1;
		canvas.style.cursor = over >= 0 ? 'pointer' : '';
		buttons.forEach( ( button, i ) => button.classList.toggle( 'hover', i === over ) );

	} );

	// --- asking ---

	// Off on the world the globe shows.
	function offHere() {

		return off || offWorlds.has( here() );

	}

	function ask() {

		asking ??= ( async () => {

			const which = here();
			try {

				const res = await fetch( which === EARTH ? '/api/online' : `/api/online?world=${ which }`, { headers: { Accept: 'application/json' } } );
				const answer = res.ok && /json/.test( res.headers.get( 'Content-Type' ) ?? '' ) ? await res.json() : null;
				// (Turned to the other world meanwhile: this one's is for later.)
				if ( which === here() ) take( answer, which );

			} catch {

				// Not reached (offline): what's shown stays till the next ask.

			} finally {

				asking = null;
				nextAsk = performance.now() + poll;

			}

		} )();
		return asking;

	}

	// An answer for `which` world, { on, total, areas, worlds: { id: { on, total } }, and from a
	// Worker from before how many on the other of the Earth and the Moon (moon, or earth) }, checked as
	// the Worker checks what rooms say; null for none (a Worker without it). Off on that world, only
	// how many are on the others is taken.
	function take( answer, which = EARTH ) {

		if ( off ) return;
		heard = worldsOf( answer ) ?? ( answer ? null : heard );
		if ( answer?.on === false || offWorlds.has( which ) ) {

			offWorlds.add( which );
			elsewhereOf( answer, which );
			show( [], 0, which );
			told( which, null );
			return;

		}

		const found = answer?.on === true && Array.isArray( answer.areas ) ? answer.areas.slice( 0, ONLINE_AREAS ).map( checkDot ).filter( Boolean ) : null;
		if ( ! found ) {

			show( [], 0, which, false );
			return;

		}

		const counted = found.reduce( ( sum, area ) => sum + area.count, 0 );
		const all = Number.isInteger( answer.total ) && answer.total >= counted ? answer.total : counted;
		elsewhereOf( answer, which );
		const mine = discount( found, which );
		show( found.filter( area => area.count > 0 ).sort( busiest ), all - mine, which );
		told( which, total );

	}

	// How many an answer says are driving on each world ({ id: { on, total } }), checked; null for an
	// answer without (a Worker from before).
	function worldsOf( answer ) {

		const said = answer?.worlds;
		if ( ! said || typeof said !== 'object' ) return null;
		const out = {};
		for ( const id of LIVE_WORLD_IDS ) {

			const entry = said[ id ];
			if ( ! entry || typeof entry !== 'object' ) continue;
			out[ id ] = { on: entry.on !== false, total: count( entry.total ) };

		}

		return out;

	}

	// How many are driving on each world now, less this page where it's still counted (the shown
	// world's as shown, `shown`; another's as self takes it off), to onCounts if that's changed.
	function told( which, shown ) {

		let next = null;
		if ( heard ) {

			next = {};
			for ( const [ id, { on, total: all } ] of Object.entries( heard ) ) next[ id ] = { on, total: id === which && shown !== null ? shown : Math.max( 0, all - self( id, which ) ) };

		}

		setCounts( next );

	}

	function setCounts( next ) {

		const key = JSON.stringify( next );
		if ( key === countsKey ) return;
		countsKey = key;
		counts = next;
		onCounts( counts );

	}

	// How many are driving on the other worlds, from an answer for `which`: by world (others, those
	// with any, in LIVE_WORLD_IDS' order, less this page if it's still counted on one: see left) and
	// all told (elsewhere). From a Worker from before, the other of the Earth and the Moon's only.
	function elsewhereOf( answer, which ) {

		const said = worldsOf( answer );
		others = [];
		if ( said ) {

			for ( const id of LIVE_WORLD_IDS ) {

				if ( id === which || ! said[ id ]?.on ) continue;
				const n = Math.max( 0, said[ id ].total - self( id, which ) );
				if ( n ) others.push( { world: id, count: n } );

			}

		} else {

			const id = which === MOON_WORLD ? EARTH : which === EARTH ? MOON_WORLD : null;
			const n = id ? otherOf( answer, which ) : 0;
			if ( n ) others.push( { world: id, count: n } );

		}

		elsewhere = others.reduce( ( sum, other ) => sum + other.count, 0 );

	}

	// How many a Worker from before says are driving on the other of the Earth and the Moon, less
	// this page if it's still counted there.
	function otherOf( answer, which ) {

		const other = which === MOON_WORLD ? EARTH : MOON_WORLD;
		return Math.max( 0, count( answer?.[ other ] ) - self( other, which ) );

	}

	// 1 if this page is still counted on world `id` (back on the globe from driving there, and turned
	// to `which`, another: see left), else 0.
	function self( id, which ) {

		return you && performance.now() <= you.until && you.world === id && id !== which ? 1 : 0;

	}

	// This page itself, still counted where it was driving: 1 taken off that area, or 0 (see left).
	function discount( found, which ) {

		if ( ! you || performance.now() > you.until ) {

			you = null;
			return 0;

		}

		if ( you.world !== which ) return 0;
		// The others it knows are driving in its room: while it's still in it (it stays a minute back on
		// the globe) as they are now, else as it last knew.
		if ( live.room === you.room ) you.others = othersDriving();
		const area = found.find( a => you.spots.some( spot => distance( spot.lat, spot.lon, a.lat, a.lon, which ) < YOU_NEAR ) && a.count > othersIn( a, found ) );
		if ( ! area ) return 0;
		area.count --;
		return 1;

	}

	// Where each of the others driving in its room is ({ lat, lon }): where it last knew their car
	// to be, else where they dropped in, or null where it can't say.
	function othersDriving() {

		return [ ...live.players.values() ].filter( p => ! p.away ).map( p => p.s ? fromFrame( p.s[ 0 ], p.s[ 1 ], p.s[ 2 ], p.world ) : p.place ?? null );

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

				const d = distance( other.lat, other.lon, a.lat, a.lon, you.world );
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

	// The areas and the total on world `which`, in the panel and as dots; listed: false hides the
	// panel's part. The panel's last line is how many are driving on the other worlds, if any: a tap
	// turns the globe there (one world) or opens the worlds to pick from (more).
	function show( found, all, which = here(), listed = true ) {

		const shape = frames[ which ].ellipsoid;
		shownWorld = which;
		areas = found.map( area => ( {
			...area,
			at: shape.getCartographicToPosition( area.lat * DEG, area.lon * DEG, area.height, new Vector3() ),
			up: shape.getCartographicToNormal( area.lat * DEG, area.lon * DEG, new Vector3() ),
		} ) );
		total = Math.max( 0, all );
		// (Words for this world: none for the Earth's, as before there were others.)
		const on = which === EARTH ? '' : `${ onTheWorld( which ) } `;
		// The other worlds with drivers it can point to: off there, or the Earth on a visit with none, not.
		const shown = off ? [] : others.filter( other => ! offWorlds.has( other.world ) && ! ( earthless && other.world === EARTH ) );
		const sum = shown.reduce( ( n, other ) => n + other.count, 0 );
		const one = shown.length === 1 ? shown[ 0 ].world : null;
		const there = ! shown.length ? []
			: one ? [ { title: OnWorld( one ), subtitle: drivers( sum ), world: one, onClick: () => onWorld( one ) } ]
				: [ { title: 'On other worlds', subtitle: drivers( sum ), world: 'others', onClick: e => onOthers( e?.currentTarget ?? null ) } ];
		const where = one ? onTheWorld( one ) : 'on other worlds';
		// Off on this world: only the others' row, if there's anyone there to point to.
		const closed = offWorlds.has( which );
		let summary = `Nobody driving ${ on }right now: be the first.`;
		if ( closed ) summary = `${ drivers( sum ) } ${ where } right now.`;
		else if ( total ) summary = `${ total } driving ${ on }now. Tap a glowing dot to join them.`;
		else if ( there.length ) summary = `Nobody driving ${ onTheWorld( which ) } right now: ${ drivers( sum ) } ${ where }.`;
		panel.setOnline( off || ! listed || ( closed && ! there.length ) ? null : {
			summary,
			areas: [ ...( closed ? [] : areas.slice( 0, LISTED ).map( area => ( { title: nameOf( area ), subtitle: drivers( area.count ), place: placeOf( area ) } ) ) ), ...there ],
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

		const spot = nearSpot( area.lat, area.lon, shownWorld );
		const at = spot && distance( spot.lat, spot.lon, area.lat, area.lon, shownWorld ) <= DOT_SPREAD ? spot : null;
		return {
			name: at?.name ?? 'Dropped pin', region: at?.region ?? '', near: spot ? `Near ${ spot.name }` : '', lat: area.lat, lon: area.lon, drivers: area.count,
			// (Off the Earth, its world: a place with none is the Earth's.)
			...( shownWorld !== EARTH ? { world: shownWorld } : {} ),
		};

	}

	function nameOf( area ) {

		const spot = nearSpot( area.lat, area.lon, shownWorld );
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

		const { group } = frames[ shownWorld ];
		group.updateWorldMatrix( true, false );
		camera.getWorldPosition( _cam );
		const width = window.innerWidth;
		const height = window.innerHeight;
		const dots = [];
		for ( const area of areas ) {

			_pos.copy( area.at ).applyMatrix4( group.matrixWorld );
			_normal.copy( area.up ).transformDirection( group.matrixWorld );
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
		const { group, ellipsoid: shape } = frames[ shownWorld ];
		_mean.set( 0, 0, 0 );
		for ( const area of members ) _mean.addScaledVector( area.at, area.count / all );
		const { lat, lon } = shape.getPositionToCartographic( _mean, {} );
		shape.getCartographicToPosition( lat, lon, 0, _mean );
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
		group.updateWorldMatrix( true, false );
		camera.getWorldPosition( _cam ).applyMatrix4( _inverse.copy( group.matrixWorld ).invert() );
		const high = shape.getPositionElevation( _cam );
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
			const which = here();
			// The globe showing again, or turned to the other world: asked at once (an answer still
			// kept comes from the browser), and the other world's dots gone meanwhile.
			if ( ( now !== lastMode && now === 'globe' ) || which !== lastWorld ) nextAsk = 0;
			if ( which !== lastWorld && lastWorld !== null && ! off ) show( [], 0, which, false );
			lastMode = now;
			lastWorld = which;
			if ( ( off || live.ended || Date.now() >= live.visitEnds ) && ( areas.length || ! layer.hidden || counts ) ) {

				off = true;
				show( [], 0 );
				layer.hidden = true;
				heard = null;
				setCounts( null );

			}

			// This world's budget for the day spent (live.js was told, as it was turned away): off here too.
			if ( ( live.closedWorlds?.has( which ) ?? ( live.closedHere && ( live.world ?? which ) === which ) ) && ! offWorlds.has( which ) ) {

				offWorlds.add( which );
				show( [], 0, which );

			}

			if ( offHere() && areas.length ) show( [], 0, which );
			// (Off here only, it still asks, for how many are on the other world.)
			if ( off || now !== 'globe' ) return;
			const at = performance.now();
			if ( ! asking && at >= nextAsk && at - touchedAt < idle && ! paused() && document.visibilityState === 'visible' ) ask();
			if ( ! offHere() ) place();

		},

		// A tap on the globe at ( x, y ) on the screen (globe.js's onTap): true if it was on a dot,
		// which then goes there.
		tap( x, y ) {

			const i = mode() === 'globe' && ! offHere() ? dotAt( x, y ) : - 1;
			if ( i < 0 ) return false;
			go( drawn[ i ].members );
			return true;

		},

		// Back on the globe from driving, the car last at `spot` ({ lat, lon }, or null): if this page was
		// in an area's room, answers for a while may still count it there (see YOU_MS).
		left( spot ) {

			const room = live.status === 'live' && worldOfRoom( live.room ) !== null ? live.room : null;
			you = room ? { room, world: worldOfRoom( room ), spots: [ spot, live.place ].filter( Boolean ), others: othersDriving(), until: performance.now() + YOU_MS } : null;

		},

		// Ask now (the tests).
		refresh: () => ask(),

		get on() {

			return ! offHere();

		},
		// Which world's dots these are, and how many are driving on the others.
		get world() {

			return shownWorld;

		},
		get elsewhere() {

			return elsewhere;

		},
		// How many are driving on each world ({ id: { on, total } }, less this page where it's still
		// counted, so the shown world's total is the panel's), or null (nothing heard, or nothing more
		// to say: off for the visit).
		get worlds() {

			return counts;

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

// The start spot on `world` nearest ( lat, lon ) within NAMED_WITHIN, or null: places.js's for the
// Earth, each other world's own (world-places.js) for it.
function nearSpot( lat, lon, world ) {

	if ( world === EARTH ) return spotNear( lat, lon, NAMED_WITHIN );
	let nearest = null;
	let gap = NAMED_WITHIN;
	for ( const spot of SPOTS_ON[ world ] ?? [] ) {

		const d = distance( lat, lon, spot.lat, spot.lon, world );
		if ( d <= gap ) {

			nearest = spot;
			gap = d;

		}

	}

	return nearest;

}

// How far apart (m) two spots on `world` are along its ground.
function distance( latA, lonA, latB, lonB, world ) {

	const metres = metresBetween( latA, lonA, latB, lonB );
	return world === EARTH ? metres : metres * ( WORLDS[ world ]?.radius ?? 6371000 ) / 6371000;

}

// A count as an answer gives one: a whole number, not absurd; else 0.
function count( n ) {

	return Number.isInteger( n ) && n > 0 && n < 1e6 ? n : 0;

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
