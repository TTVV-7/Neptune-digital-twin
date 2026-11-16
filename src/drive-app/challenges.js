import './challenges.css';
import {
	Color, CylinderGeometry, DataTexture, DoubleSide, InstancedMesh, MathUtils, Matrix4, MeshBasicMaterial, OctahedronGeometry, Quaternion,
	LinearFilter, TorusGeometry, Vector3,
} from 'three';
import { send } from './api.js';
import { KIND_NAMES, PERIOD_NAMES, TALL, checkPasses, describe, formatTime, timeLeft } from './challenge-rules.js';
import { LEVEL_MAX, levelLine } from './levels.js';
import { MOON } from './moon-places.js';

// Challenges in the page (docs/world-drive.md, "Challenges"): its own chunk, loaded the first time
// they're opened (main.js), so nothing of it is in the page's first load. The list of the six live
// ones (the current world's three first), each with the time it has left (ticking), its board's top
// three and your best; its board; starting one (a drop-in at its start, on its world); the run: a
// countdown, the gates or items on the ground the game has (their heights found as it loads: a ray
// down on the Earth's tiles, the Moon's own heights), the next one marked on the HUD with an arrow
// and how far, the timer, and the finish card with your time, your place and the board's top, Retry
// and Back; and posting the time (worker/drive/challenges.js).
//
// A run's time is the game's own clock: the steps the frames drive the car by (main.js gives this
// the same dt), from GO to the last pass. A pause ends the run (pausing, the page out of sight on
// the way: none of it counts, and nothing can be had from it), and so does leaving it: the globe,
// another ride or place, Go to someone. R (back on the road) is fine: it stops the car. A pause on
// the finish card puts the finished run away (its time still goes up), and driving on after a
// pause that stopped a run is the end of it.

// The countdown (s), and what's held at the start meanwhile.
const COUNTDOWN = 3;
// Gates and items as drawn (m): a sprint's ring at most RING round (its zone is the route's radius,
// wider), a beam BEAM round and BEAM_HIGH up from the ground (twice that on the Moon, where it's
// seen from further), an item ITEM across, ITEM_UP over the ground, turning at SPIN rad/s.
const RING = 10;
const RING_TUBE = 0.035;
const BEAM = 3;
const BEAM_HIGH = 320;
const ITEM = 2.2;
const ITEM_UP = 3;
const SPIN = 1.6;
// The middle of a gate's zone is this far (m) over its ground.
const ZONE_UP = 2;
// On the Earth a gate's ground is looked for again (one gate each PROBE_EVERY s), so it moves onto
// sharper tiles as they load: rays down at its middle and at eight points round it, PROBE_OUT of
// its radius out (the lowest is its ground, the highest its top: probe).
const PROBE_EVERY = 0.2;
const PROBE_OUT = 0.6;
const PROBES = [ [ 0, 0 ], ...Array.from( { length: 8 }, ( _, i ) => [ Math.sin( i * Math.PI / 4 ) * PROBE_OUT, Math.cos( i * Math.PI / 4 ) * PROBE_OUT ] ) ];
// Colours: the next to pass, the others, the last (a sprint's finish, the landmark), and items.
const NEXT = new Color( 0xffd23f );
const LATER = new Color( 0x3ec1ff ).multiplyScalar( 0.75 );
const GOAL = new Color( 0x5dff8a );
const STAR = new Color( 0xffc531 );
// A post that didn't get through is tried again after RETRY ms, TRIES times in all (a 429 asking
// for longer than WAIT_MOST s isn't waited for: it's the day's times used up).
const RETRY = 4000;
const TRIES = 3;
const WAIT_MOST = 60;
// A new list is asked for as a listed challenge ends; if that fails (or still has it ended) it's
// asked again after RELOAD ms, then twice that and so on up to RELOAD_MOST, RELOADS times at most
// (or after the Retry-After the Worker gives), and then not till the list is opened again.
const RELOAD = 5000;
const RELOAD_MOST = 60000;
const RELOADS = 4;
const NAME = /^[\p{L}\p{M}\p{N} _-]{3,16}$/u;
const FLAG = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4 2.5v15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M5 3h11.5v8.5H5z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5 3h2.9v2.8H5zM10.8 3h2.9v2.8h-2.9zM7.9 5.8h2.9v2.9H7.9zM13.7 5.8h2.8v2.9h-2.8zM5 8.7h2.9v2.8H5zM10.8 8.7h2.9v2.8h-2.9z" fill="currentColor"/></svg>';
const WORLD_NAMES = { earth: 'On the Earth', moon: 'On the Moon' };

const _v = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _m = new Matrix4();
const _up = new Vector3( 0, 1, 0 );

// app: what main.js hands over: visit(), player(), pickName( name, say ), world(), moonOnly
// ({ onEarth } when there's no Earth this visit), mode(), place(), vehicle(), the driver, ground,
// camera, scene, globe, moon and vehicles, stats, startAt( place ), placeCar( pose ), toGlobe(),
// go() (a run's GO: the keys card, the visit's first time), and the drive's and the pause menu's
// elements.
export function setUpChallenges( app ) {

	const dialog = makeDialog();
	const hud = makeHud( app.driveUi );
	// The HUD's parts, and what's written in each (updateHud).
	const hudParts = { clock: hud.querySelector( '.ch-clock' ), gates: hud.querySelector( '.ch-gates' ), dist: hud.querySelector( '.ch-dist' ), arrow: hud.querySelector( '.ch-arrow' ) };
	const written = {};
	const count = Object.assign( document.createElement( 'div' ), { className: 'ch-count', hidden: true } );
	count.setAttribute( 'aria-live', 'assertive' );
	app.driveUi.append( count );
	const finish = makeFinish();
	const stopped = makeStopped( app.pauseCard );
	const meshes = makeMeshes();

	// The list's last answer, and how far the Worker's clock is from this one (ms); the challenge being
	// dropped in at; the run: { challenge, gates, phase ('countdown', 'racing', 'done' or 'stopped'),
	// left (s of the countdown), clock (s), passes, start (where the car was put down), id, and once
	// it's done ms and result (what's posted) }. Each Retry is a new run.
	let listed = null;
	let offset = 0;
	let loads = 0;
	let ticker = 0;
	let pending = null;
	let run = null;
	let probeIn = 0;
	let probeNext = 0;
	// A new list asked for as one ends: whether it's on its way, the ended ones it's for (their ids),
	// how many times it's been asked for them, and when (Date.now()) it may be asked again.
	let reloading = false;
	let reloadFor = '';
	let reloads = 0;
	let reloadAt = 0;
	// The result the name form is up for (the time to post once a name is picked).
	let naming = null;
	// Each challenge's best known here ({ [ id ]: ms }), from the list and from posts: a run is only
	// posted when it beats it.
	const bests = {};

	// --- the list ---

	function open() {

		if ( ! dialog.open ) dialog.showModal();
		showList();
		app.stats.add( 'challenge', 'open' );
		[ reloadFor, reloads, reloadAt ] = [ '', 0, 0 ];
		load();
		clearInterval( ticker );
		ticker = setInterval( tick, 1000 );

	}

	// The list from the Worker: its answer ({ ok, status, retryAfter }), shown if it came.
	async function load() {

		const asking = ++ loads;
		say( listed ? '' : 'Loading...' );
		const player = app.player();
		const answer = await send( 'GET', `/api/challenges${ player ? `?id=${ encodeURIComponent( player.id ) }` : '' }` );
		if ( asking !== loads ) return answer;
		if ( ! answer.ok ) {

			if ( ! listed ) dialog.querySelector( '.ch-list' ).replaceChildren();
			say( answer.status === 429 ? 'Asked too often just now. Try again in a minute.' : 'The challenges aren\'t answering. Try again soon.' );
			return answer;

		}

		listed = answer.body;
		offset = listed.now - Date.now();
		for ( const challenge of listed.challenges ) if ( challenge.me && ! challenge.me.owner ) bests[ challenge.id ] = Math.min( bests[ challenge.id ] ?? Infinity, challenge.me.ms );
		say( '' );
		render();
		return answer;

	}

	function say( text ) {

		const status = dialog.querySelector( '.ch-status' );
		status.textContent = text;
		status.hidden = ! text;

	}

	// The six, the current world's three first, a heading for each world.
	function render() {

		const here = app.world();
		const worlds = here === MOON ? [ 'moon', 'earth' ] : [ 'earth', 'moon' ];
		const parts = [];
		for ( const world of worlds ) {

			const heading = Object.assign( document.createElement( 'h3' ), { className: 'ch-world', textContent: WORLD_NAMES[ world ] } );
			parts.push( heading, ...listed.challenges.filter( c => c.world === world ).map( card ) );

		}

		dialog.querySelector( '.ch-list' ).replaceChildren( ...parts );
		tick();

	}

	function card( challenge ) {

		const article = document.createElement( 'article' );
		article.className = 'ch-card';
		article.dataset.id = challenge.id;
		article.dataset.world = challenge.world;
		article.dataset.period = challenge.period;
		const top = el( 'div', 'ch-top' );
		top.append( el( 'span', 'ch-period', PERIOD_NAMES[ challenge.period ] ), el( 'span', 'ch-left' ) );
		const what = el( 'p', 'ch-what' );
		what.append( el( 'b', 'ch-kind', KIND_NAMES[ challenge.kind ] ), ` · ${ describe( challenge ) }` );
		const place = el( 'h4', 'ch-place', challenge.place );
		if ( challenge.region ) place.append( el( 'span', 'ch-region', challenge.region ) );
		const list = el( 'ol', 'ch-top3' );
		list.append( ...challenge.top.map( row => rowItem( row ) ) );
		if ( ! challenge.top.length ) list.append( el( 'li', 'ch-none', 'No times yet: be the first!' ) );
		const best = bests[ challenge.id ];
		const you = el( 'p', 'ch-you', best === undefined ? 'You haven\'t a time on it yet' : `Your best ${ formatTime( best ) }${ challenge.me?.rank ? ` · #${ challenge.me.rank } of ${ Math.max( challenge.total, challenge.me.rank ) }` : '' }` );
		if ( challenge.me?.owner ) you.textContent = `Your best ${ formatTime( challenge.me.ms ) } (yours as the owner, kept off the board)`;
		const buttons = el( 'div', 'ch-buttons' );
		const earthShut = challenge.world !== MOON && !! app.moonOnly;
		const start = el( 'button', earthShut ? 'ch-start' : 'primary ch-start', earthShut ? 'Needs an Earth drive' : 'Start' );
		start.type = 'button';
		start.addEventListener( 'click', () => earthShut ? toEarth() : begin( challenge ) );
		const board = el( 'button', 'ch-board-open', `Board${ challenge.total ? ` (${ challenge.total })` : '' }` );
		board.type = 'button';
		board.addEventListener( 'click', () => showBoard( challenge ) );
		buttons.append( start, board );
		article.append( top, place, what, list, you, buttons );
		return article;

	}

	// The time each has left, ticking; and a new list once one is over. An ended one says so, its
	// Start off (a run of it wouldn't be taken), till the new list comes. That's asked for once as it
	// ends, and if it doesn't come (the Worker not answering, or busy at the turn of a period) again
	// after a while, longer each time, and then no more: never every second, which would keep an
	// address at CHALLENGE_LOOKS' limit for everyone behind it.
	function tick() {

		if ( ! listed ) return;
		const now = Date.now() + offset;
		for ( const card of dialog.querySelectorAll( '.ch-card' ) ) {

			const challenge = listed.challenges.find( c => String( c.id ) === card.dataset.id );
			if ( ! challenge ) continue;
			const over = challenge.endsAt <= now;
			card.classList.toggle( 'over', over );
			card.querySelector( '.ch-left' ).textContent = over ? 'Over: the next one is on its way' : timeLeft( challenge.endsAt - now );
			const start = card.querySelector( '.ch-start' );
			if ( start.disabled !== over ) start.disabled = over;

		}

		const ended = listed.challenges.filter( c => c.endsAt <= now ).map( c => c.id ).join( ',' );
		if ( ended !== reloadFor ) [ reloadFor, reloads, reloadAt ] = [ ended, 0, 0 ];
		if ( ! dialog.open || ! ended || reloading || reloads >= RELOADS || Date.now() < reloadAt ) return;
		reloading = true;
		reloads ++;
		load().then( answer => {

			// Asked again later only if it's still the same ones ended (tick sees to that): after the
			// Worker's Retry-After, or RELOAD doubling each time.
			reloadAt = Date.now() + ( answer.retryAfter ? answer.retryAfter * 1000 : Math.min( RELOAD_MOST, RELOAD * 2 ** ( reloads - 1 ) ) );

		} ).finally( () => reloading = false );

	}

	// No Earth this visit (today's Earth drives used up, or a page opened on the Moon): its own word
	// on how to get there.
	function toEarth() {

		dialog.close();
		app.moonOnly?.onEarth();

	}

	async function showBoard( challenge ) {

		const board = dialog.querySelector( '.ch-board' );
		dialog.querySelector( '.ch-list' ).hidden = true;
		board.hidden = false;
		board.querySelector( '.ch-board-title' ).textContent = `${ PERIOD_NAMES[ challenge.period ] }: ${ challenge.place }`;
		board.querySelector( '.ch-board-sub' ).textContent = `${ KIND_NAMES[ challenge.kind ] } · ${ describe( challenge ) }${ challenge.world === MOON ? ' · on the Moon' : '' }`;
		const rows = board.querySelector( '.ch-rows' );
		const mine = board.querySelector( '.ch-mine' );
		rows.replaceChildren();
		mine.textContent = 'Loading...';
		const player = app.player();
		const answer = await send( 'GET', `/api/challenges/board?challenge=${ challenge.id }${ player ? `&id=${ encodeURIComponent( player.id ) }` : '' }` );
		if ( board.hidden ) return;
		if ( ! answer.ok ) {

			mine.textContent = 'The board isn\'t answering. Try again soon.';
			return;

		}

		const { rows: top, total, me } = answer.body;
		rows.replaceChildren( ...top.map( row => rowItem( row, !! me && ! me.owner && row.rank === me.rank ) ) );
		if ( ! top.length ) rows.append( el( 'li', 'ch-none', 'No times yet: be the first!' ) );
		if ( me?.owner ) mine.textContent = `Your best ${ formatTime( me.ms ) } would be #${ me.rank } (yours as the owner, kept off the board)`;
		else if ( me ) mine.textContent = `You're #${ me.rank } of ${ Math.max( total, me.rank ) }, with ${ formatTime( me.ms ) }`;
		else mine.textContent = `${ total } driver${ total === 1 ? '' : 's' } on this board`;

	}

	function showList() {

		dialog.querySelector( '.ch-board' ).hidden = true;
		dialog.querySelector( '.ch-list' ).hidden = false;

	}

	// A board's row: the rank, the name (a supporter's ⭐ and their level as the leaderboard shows
	// them), the ride and the time.
	function rowItem( row, own = false ) {

		const li = document.createElement( 'li' );
		li.classList.toggle( 'me', own );
		const who = el( 'span', 'who' );
		const name = el( 'b', '', row.name );
		if ( row.supporter === true ) {

			const star = el( 'span', 'supporter-star', '⭐' );
			star.setAttribute( 'role', 'img' );
			star.setAttribute( 'aria-label', 'Supporter Pass' );
			name.append( star );

		}

		who.append( name );
		if ( Number.isInteger( row.level ) && row.level >= 1 && row.level <= LEVEL_MAX ) who.append( el( 'span', 'lvl', levelLine( row.level, row.title ) ) );
		const ride = app.vehicles.find( v => v.id === row.vehicle )?.name;
		if ( ride ) who.append( el( 'span', 'ride', ride ) );
		li.append( el( 'span', 'rank', String( row.rank ) ), who, el( 'span', 'time', formatTime( row.ms ) ) );
		return li;

	}

	// --- starting one ---

	// Start `challenge`: a drop-in at its start (on its world), and its run once the car's down.
	function begin( challenge ) {

		dialog.close();
		finish.hidden = true;
		// Back to the globe first, from a drive or its pause (a run going is left), then the drop-in.
		if ( app.mode() !== 'globe' ) app.toGlobe();
		const { start } = challenge.route;
		pending = challenge;
		app.startAt( {
			name: challenge.place, region: challenge.region, lat: start.lat, lon: start.lon,
			...( Number.isFinite( start.heading ) ? { heading: start.heading } : {} ),
			...( challenge.world === MOON ? { world: MOON } : {} ),
			challenge: challenge.id,
		} );

	}

	// main.js: a drop-in is starting at `place`. Anywhere but the challenge's start, a run (or one on
	// its way) is left.
	function dropping( place ) {

		if ( pending && place?.challenge === pending.id ) {

			end();
			return;

		}

		pending = null;
		end();

	}

	// main.js: the car is down at `place` and driving. The challenge's own start: its run begins, and
	// true (the keys card isn't shown over the countdown).
	function arrived( place ) {

		if ( ! pending || place?.challenge !== pending.id ) return false;
		const challenge = pending;
		pending = null;
		const d = app.driver;
		run = { challenge, gates: placeGates( challenge ), start: { east: d.east, north: d.north, heading: d.heading, up: d.y }, phase: 'countdown', left: COUNTDOWN, clock: 0, passes: [], id: runId() };
		meshes.show( run );
		showHud();
		probeIn = 0;
		return true;

	}

	// Each point's place in the scene: on the Moon on its own heights (exact, before any ground is
	// built); on the Earth at the start's height until the tiles' ground there is found (probe).
	function placeGates( challenge ) {

		const { globe, moon } = app;
		const moonly = challenge.world === MOON;
		const base = app.place()?.height ?? 0;
		const ordered = challenge.kind !== 'collect';
		const gates = challenge.route.points.map( ( [ lat, lon ], index ) => {

			const height = moonly ? moon.heightAt( lat, lon ) ?? base : base;
			const local = sceneOf( globe, lat, lon, height ).clone();
			const ground = moonly ? local.y : null;
			return { index, lat, lon, x: local.x, z: local.z, ground, top: ground, guess: local.y, passed: false, facing: 0 };

		} );
		// A ring faces along the way to it: from the start, or the gate before.
		const d = app.driver;
		gates.forEach( ( gate, i ) => {

			const from = ordered && i ? gates[ i - 1 ] : { x: - d.east, z: d.north };
			gate.facing = Math.atan2( gate.x - from.x, gate.z - from.z );

		} );
		if ( ! moonly ) for ( const gate of gates ) probe( gate, challenge.route.radius );
		return gates;

	}

	// A gate's ground on the Earth: where rays straight down meet whatever has loaded there (the
	// tiles or the test pad, or the sea's surface where it's laid), at its middle and round it at
	// PROBE_OUT of its radius. The lowest is its ground, what it's drawn on and its zone's middle is
	// over: the street beside a tower rather than the tower's roof, where the first thing a ray down
	// meets at its middle may be. The highest is its top (that roof, a bridge's deck), which the zone
	// reaches up to as well. False while nothing has loaded there, or nothing has changed.
	function probe( gate, radius ) {

		let low = Infinity;
		let high = - Infinity;
		for ( const [ x, z ] of PROBES ) {

			const y = app.ground.heightAt( gate.x + x * radius, gate.z + z * radius );
			if ( y === null ) continue;
			low = Math.min( low, y );
			high = Math.max( high, y );

		}

		if ( low === Infinity || ( low === gate.ground && high === gate.top ) ) return false;
		gate.ground = low;
		gate.top = high;
		return true;

	}

	// --- the run ---

	function frame( dt ) {

		if ( ! run ) return;
		const d = app.driver;
		const driving = d.active && app.mode() === 'driving';
		if ( run.phase === 'countdown' && driving ) {

			// Held at the start until GO (the gas held down is ready to go).
			Object.assign( d, { east: run.start.east, north: run.start.north, speed: 0 } );
			const before = Math.ceil( run.left );
			run.left -= dt;
			const now = Math.ceil( run.left );
			if ( run.left <= 0 ) {

				run.phase = 'racing';
				run.clock = 0;
				showCount( 'GO!', true );
				app.stats.add( 'challenge', 'start' );
				app.go?.();

			} else if ( now !== before || count.hidden ) showCount( String( now ) );

		} else if ( run.phase === 'racing' && driving ) {

			run.clock += dt;
			passGates( d );

		}

		if ( run && run.challenge.world !== MOON && run.phase !== 'stopped' ) {

			probeIn -= dt;
			if ( probeIn <= 0 ) {

				probeIn = PROBE_EVERY;
				const gate = run.gates[ probeNext ++ % run.gates.length ];
				if ( ! gate.passed && probe( gate, run.challenge.route.radius ) ) meshes.place( run );

			}

		}

		if ( run ) {

			meshes.update( run, dt );
			updateHud( d );

		}

	}

	// The car's passes this frame: the next gate (in order), or any item not taken yet; the last one
	// finishes the run. A gate's zone: within its radius across the ground, and up and down from its
	// ground to its top (each ZONE_UP over), and TALL times its radius past them.
	function passGates( d ) {

		const ordered = run.challenge.kind !== 'collect';
		const radius = run.challenge.route.radius;
		const at = { x: - d.east, y: d.y, z: d.north };
		let changed = false;
		for ( const gate of run.gates ) {

			if ( gate.passed ) continue;
			const dx = at.x - gate.x;
			const dz = at.z - gate.z;
			const below = gate.ground === null ? 0 : at.y - gate.ground - ZONE_UP;
			const above = gate.top === null ? 0 : at.y - gate.top - ZONE_UP;
			const dy = ( below < 0 ? below : above > 0 ? above : 0 ) / TALL;
			if ( dx * dx + dz * dz + dy * dy <= radius * radius ) {

				gate.passed = true;
				run.passes.push( [ gate.index, Math.round( run.clock * 1000 ) ] );
				changed = true;
				const done = run.passes.length;
				const total = run.gates.length;
				if ( done < total ) d.hud.flash( ordered ? `Gate ${ done } / ${ total }` : `${ done } / ${ total } stars` );

			} else if ( ordered ) break;

		}

		if ( changed ) meshes.colour( run );
		if ( run.passes.length === run.gates.length ) finished();

	}

	function finished() {

		run.phase = 'done';
		// The time is the last pass's (to the millisecond, as the passes are). What's posted is a
		// copy as it finished: a Retry starts a new run, and a post being tried again still has this
		// one's time and passes.
		const ms = run.passes.at( - 1 )[ 1 ];
		run.ms = ms;
		run.result = { challenge: run.challenge, id: run.id, ms, passes: run.passes.map( pass => [ ...pass ] ) };
		app.stats.add( 'challenge', 'finish' );
		app.driver.hud.flash( 'Finished!' );
		showFinish( run.result );

	}

	// Out of the run, its gates and HUD gone.
	function end() {

		run = null;
		naming = null;
		meshes.hide();
		showingHud( false );
		count.hidden = true;
		finish.hidden = true;
		stopped.hidden = true;

	}

	// main.js: paused. A run (or its countdown) is over: none of a pause counts, and nothing can be
	// had from one. The pause menu says so, with Retry. A finished run is put away, its card with it
	// (a time on its way to the board still goes), so the card isn't left over the pause menu.
	function paused() {

		if ( run?.phase === 'done' ) return end();
		if ( ! run || ( run.phase !== 'countdown' && run.phase !== 'racing' ) ) return;
		run.phase = 'stopped';
		meshes.hide();
		showingHud( false );
		count.hidden = true;
		stopped.hidden = false;

	}

	// main.js: driving on from the pause menu. A run the pause stopped is over for good (Retry was
	// the way back to it), its word in the menu gone with it.
	function resumed() {

		if ( run?.phase === 'stopped' ) end();

	}

	// Back at the start for another go, as a new run: the car put down where the run began, the gates
	// back, the countdown again.
	function retry() {

		if ( ! run ) return;
		const { challenge, start, gates } = run;
		finish.hidden = true;
		stopped.hidden = true;
		naming = null;
		if ( ! app.placeCar( start ) ) return;
		for ( const gate of gates ) gate.passed = false;
		run = { challenge, gates, start, phase: 'countdown', left: COUNTDOWN, clock: 0, passes: [], id: runId() };
		meshes.show( run );
		showHud();

	}

	// --- the HUD ---

	function showHud() {

		showingHud( true );
		hud.dataset.kind = run.challenge.kind;
		updateHud( app.driver );

	}

	// The HUD shown or not (and the XP pop-ups moved under it while it is: challenges.css).
	function showingHud( shown ) {

		hud.hidden = ! shown;
		document.body.classList.toggle( 'ch-running', shown );
		for ( const key of Object.keys( written ) ) delete written[ key ];

	}

	function showCount( text, go = false ) {

		count.textContent = text;
		count.classList.toggle( 'go', go );
		count.hidden = false;
		// The same again restarts its pop.
		count.style.animation = 'none';
		void count.offsetWidth;
		count.style.animation = '';
		clearTimeout( showCount.timer );
		if ( go ) showCount.timer = setTimeout( () => count.hidden = true, 900 );

	}

	// The timer, how many are passed, and an arrow to the next (the nearest item not taken), turned
	// as it lies from where the camera looks (to the degree), with how far it is (to the metre). Each
	// written into the page only when it changes (as drive-hud.js does: on a phone every write is
	// style and layout work), and once a run's done, nothing but its time.
	function updateHud( d ) {

		if ( hud.hidden ) return;
		const done = run.phase === 'done';
		write( 'clock', formatTime( done ? run.ms : run.clock * 1000 ) );
		write( 'gates', run.challenge.kind === 'landmark' ? run.challenge.route.goal : `${ run.passes.length } / ${ run.gates.length }${ run.challenge.kind === 'collect' ? ' ★' : '' }` );
		const target = done ? null : nextGate( d );
		write( 'aim', target ? '' : 'none', () => hudParts.arrow.hidden = hudParts.dist.hidden = ! target );
		if ( ! target ) return;
		const east = - target.x - d.east;
		const north = target.z - d.north;
		app.camera.getWorldDirection( _v );
		const facing = Math.atan2( - _v.x, _v.z );
		const degrees = Math.round( ( Math.atan2( east, north ) - facing ) * MathUtils.RAD2DEG );
		write( 'turn', degrees, () => hudParts.arrow.style.transform = `rotate( ${ degrees }deg )` );
		const metres = Math.hypot( east, north );
		write( 'dist', metres >= 1000 ? `${ ( metres / 1000 ).toFixed( 1 ) } km` : `${ Math.round( metres ) } m` );

	}

	// The HUD's `key` set to `value` if it isn't already: its text, or `apply()` instead.
	function write( key, value, apply = null ) {

		if ( written[ key ] === value ) return;
		written[ key ] = value;
		if ( apply ) apply();
		else hudParts[ key ].textContent = value;

	}

	function nextGate( d ) {

		if ( ! run || run.phase === 'done' ) return null;
		if ( run.challenge.kind !== 'collect' ) return run.gates.find( gate => ! gate.passed ) ?? null;
		let best = null;
		let gap = Infinity;
		for ( const gate of run.gates ) {

			const metres = gate.passed ? Infinity : Math.hypot( - gate.x - d.east, gate.z - d.north );
			if ( metres < gap ) [ best, gap ] = [ gate, metres ];

		}

		return best;

	}

	// --- finishing ---

	// The finish card for `result` (finished's): the time, and whether it's a best; then posted (or a
	// name asked for first), or, if it's not a best, the board as it is.
	function showFinish( result ) {

		const { challenge, ms } = result;
		finish.querySelector( '.ch-f-title' ).textContent = `${ PERIOD_NAMES[ challenge.period ] }: ${ challenge.place }`;
		finish.querySelector( '.ch-f-time' ).textContent = formatTime( ms );
		finish.querySelector( '.ch-f-rows' ).replaceChildren();
		finish.querySelector( '.ch-f-form' ).hidden = true;
		finish.hidden = false;
		const best = bests[ challenge.id ];
		const better = best === undefined || ms < best;
		finishSay( better ? ( best === undefined ? 'Finished! Your first time on it.' : `New best! Your last was ${ formatTime( best ) }.` ) : `Your best is ${ formatTime( best ) }.` );
		finish.querySelector( '.ch-f-badge' ).hidden = ! better;
		if ( ! checkPasses( challenge, ms, result.passes ) ) return finishSay( 'That run didn\'t count: it went quicker than anything can drive. Try again.' );
		if ( ! app.visit() ) return finishSay( `${ finish.querySelector( '.ch-f-note' ).textContent } Times go on the board from a drive on the real map.` );
		if ( ! better ) return showTop( challenge );
		if ( ! app.player() ) return askName( result );
		post( result );

	}

	function finishSay( text ) {

		finish.querySelector( '.ch-f-note' ).textContent = text;

	}

	// Whether the finish card is up for `result` still (not put away, nor a Retry's new run).
	function showing( result ) {

		return run?.result === result && ! finish.hidden;

	}

	// No nickname yet: one picked here (the leaderboard's), then `result` goes up.
	function askName( result ) {

		naming = result;
		const form = finish.querySelector( '.ch-f-form' );
		form.hidden = false;
		finish.querySelector( '.ch-f-hint' ).textContent = 'Pick a name to put your time on the board: 3 to 16 letters, numbers, spaces, _ or -.';
		form.elements.name.focus();

	}

	// A finished run's `result` to the Worker: its place on the board and the board's top. Tried again
	// (the same result, the same run id, so the Worker knows it if the first got there and only its
	// answer was lost) if it didn't get through, whatever happens to the card meanwhile: a Retry or a
	// pause doesn't lose a time. The card only shows the answer while it's still up for this result.
	async function post( result, tries = 0 ) {

		const player = app.player();
		const { challenge } = result;
		const vehicle = app.vehicle()?.id ?? 'go-kart';
		if ( showing( result ) ) finishSay( 'Posting your time...' );
		const answer = await send( 'POST', '/api/challenges/time', {
			id: player.id, secret: player.secret, visit: app.visit(), challenge: challenge.id, run: result.id, ms: result.ms, passes: result.passes, vehicle,
		} );
		const shown = showing( result );
		if ( answer.ok ) {

			const { ms, rank, total, isNewBest, top, owner } = answer.body;
			bests[ challenge.id ] = ms;
			app.stats.add( 'challenge', 'posted' );
			if ( listed ) {

				const listedOne = listed.challenges.find( c => c.id === challenge.id );
				if ( listedOne ) Object.assign( listedOne, { me: { ms, rank, ...( owner ? { owner } : {} ) }, total, top: top.slice( 0, 3 ) } );

			}

			if ( ! shown ) return;
			finish.querySelector( '.ch-f-badge' ).hidden = ! isNewBest;
			finishSay( owner ? `Your best ${ formatTime( ms ) } would be #${ rank }: yours as the owner are kept off the board.` : `#${ rank } of ${ Math.max( total, rank ) } on the board${ isNewBest ? '' : `, with your best ${ formatTime( ms ) }` }` );
			showRows( top, owner ? null : rank );
			return;

		}

		const reason = answer.body?.reason;
		const waits = answer.status === 429 && reason !== 'daily' && answer.retryAfter <= WAIT_MOST;
		if ( tries < TRIES && ( waits || answer.status === 0 || answer.status >= 500 ) ) {

			if ( shown ) finishSay( answer.status === 429 ? 'A moment...' : 'Couldn\'t reach World Drive. Trying again...' );
			setTimeout( () => post( result, tries + 1 ), Math.max( RETRY, answer.retryAfter * 1000 ) );
			return;

		}

		if ( ! shown ) return;
		if ( answer.status === 403 && reason === 'challenge' ) return finishSay( 'This challenge is over (or the owner has changed it). Open Challenges for the new one.' );
		if ( answer.status === 403 && reason === 'world' ) return finishSay( 'Earth challenges go on the board from a drive on the Earth.' );
		if ( answer.status === 403 && reason === 'visit' ) return finishSay( 'This visit has run out. Reload the page to post times again.' );
		if ( answer.status === 403 && reason === 'player' ) return finishSay( 'This browser\'s name was removed. Pick a new one on the leaderboard.' );
		if ( answer.status === 400 ) return finishSay( 'That run didn\'t count. Try again.' );
		if ( answer.status === 429 ) return finishSay( 'That\'s all the times for today. Try again tomorrow.' );
		finishSay( 'Couldn\'t reach World Drive, so your time wasn\'t posted.' );

	}

	// A run that's no better than your best: the board's top as it is, and where you are on it.
	async function showTop( challenge ) {

		const player = app.player();
		const result = run?.result;
		const answer = await send( 'GET', `/api/challenges/board?challenge=${ challenge.id }${ player ? `&id=${ encodeURIComponent( player.id ) }` : '' }` );
		if ( ! showing( result ) || ! answer.ok ) return;
		const { rows, total, me } = answer.body;
		if ( me && ! me.owner ) finishSay( `Your best ${ formatTime( me.ms ) } is #${ me.rank } of ${ Math.max( total, me.rank ) }.` );
		showRows( rows.slice( 0, 5 ), me && ! me.owner ? me.rank : null );

	}

	function showRows( rows, mine ) {

		finish.querySelector( '.ch-f-rows' ).replaceChildren( ...rows.map( row => rowItem( row, row.rank === mine ) ) );

	}

	// --- the page's parts, made once ---

	function makeDialog() {

		const root = document.createElement( 'dialog' );
		root.id = 'challenges';
		root.className = 'ch-dialog';
		root.setAttribute( 'aria-labelledby', 'ch-title' );
		root.innerHTML = `
			<header class="ch-head"><h2 id="ch-title">${ FLAG } Challenges</h2><button type="button" class="close" aria-label="Close">&times;</button></header>
			<p class="ch-intro">A daily, a weekly and a monthly one on the Earth and on the Moon, each with its own board. Your best time counts.</p>
			<p class="ch-status" role="status" hidden></p>
			<div class="ch-list"></div>
			<section class="ch-board" hidden>
				<button type="button" class="link ch-back">&lsaquo; All challenges</button>
				<h3 class="ch-board-title"></h3>
				<p class="ch-board-sub"></p>
				<ol class="ch-rows"></ol>
				<p class="ch-mine"></p>
			</section>
			<p class="ch-foot">A run is timed from GO to the last gate (or star, or the landmark), on the game's own clock. Pausing, or leaving for the globe, another ride or place, ends a run. Times go on the board under your leaderboard name.</p>`;
		root.querySelector( '.close' ).addEventListener( 'click', () => root.close() );
		root.querySelector( '.ch-back' ).addEventListener( 'click', showList );
		root.addEventListener( 'close', () => clearInterval( ticker ) );
		// A click on the backdrop closes it, as the leaderboard's does.
		root.addEventListener( 'click', e => {

			const box = root.getBoundingClientRect();
			if ( e.target === root && ( e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom ) ) root.close();

		} );
		document.body.append( root );
		return root;

	}

	function makeFinish() {

		const root = document.createElement( 'section' );
		root.className = 'ch-finish';
		root.hidden = true;
		root.setAttribute( 'role', 'dialog' );
		root.setAttribute( 'aria-labelledby', 'ch-f-title' );
		root.innerHTML = `
			<p class="ch-f-title" id="ch-f-title"></p>
			<p class="ch-f-time"></p>
			<p class="ch-f-badge" hidden>New best!</p>
			<p class="ch-f-note" role="status"></p>
			<form class="ch-f-form" hidden>
				<p class="ch-f-hint"></p>
				<div class="ch-f-name"><input name="name" maxlength="16" autocomplete="nickname" enterkeyhint="done" aria-label="Your name on the board" /><button type="submit" class="primary">Post</button></div>
				<p class="ch-f-status" role="status"></p>
			</form>
			<ol class="ch-f-rows"></ol>
			<div class="ch-f-buttons"><button type="button" class="primary ch-retry">Retry</button><button type="button" class="ch-back-list">Back</button><button type="button" class="link ch-drive-on">Keep driving here</button></div>`;
		root.querySelector( '.ch-retry' ).addEventListener( 'click', retry );
		root.querySelector( '.ch-back-list' ).addEventListener( 'click', () => {

			app.toGlobe();
			open();

		} );
		root.querySelector( '.ch-drive-on' ).addEventListener( 'click', () => {

			root.hidden = true;
			end();

		} );
		const form = root.querySelector( '.ch-f-form' );
		form.addEventListener( 'submit', async e => {

			e.preventDefault();
			const status = root.querySelector( '.ch-f-status' );
			const value = form.elements.name.value.replace( /\s+/g, ' ' ).trim();
			if ( ! NAME.test( value ) ) {

				status.textContent = 'Use 3 to 16 letters, numbers, spaces, _ or -.';
				return;

			}

			if ( ! await app.pickName( value, text => status.textContent = text ) || ! naming ) return;
			const result = naming;
			naming = null;
			form.hidden = true;
			form.elements.name.blur();
			post( result );

		} );
		// Typing a name, the keys mustn't drive.
		form.addEventListener( 'keydown', e => e.stopPropagation() );
		document.body.append( root );
		return root;

	}

	function makeStopped( card ) {

		const root = document.createElement( 'div' );
		root.className = 'ch-stopped';
		root.hidden = true;
		root.innerHTML = '<p><b>Challenge run stopped.</b> Pausing ends a run, so a pause never counts.</p><button type="button" class="primary">Retry the challenge</button>';
		root.querySelector( 'button' ).addEventListener( 'click', retry );
		card.querySelector( 'h2' ).after( root );
		return root;

	}

	return {
		open,
		dropping,
		arrived,
		paused,
		resumed,
		left: () => {

			pending = null;
			end();

		},
		frame,
		get isOpen() {

			return dialog.open;

		},
		// For the tests: the run as it is ({ challenge, gates, phase, clock, passes, ms, result }), or
		// null.
		get run() {

			return run;

		},
		meshes,
	};

	// The gates' and items' meshes: instanced, so a route of any length is two draws (its beams, and its
	// rings or items), made once and added to the scene while a run is on.
	function makeMeshes() {

		// The beams fade out upward (an alpha map is read from its green: grey, so every channel).
		const fade = new Uint8Array( 64 * 4 );
		for ( let i = 0; i < 64; i ++ ) fade.fill( Math.round( 255 * ( 1 - i / 63 ) ** 1.4 ), i * 4, i * 4 + 4 );
		const alpha = new DataTexture( fade, 1, 64 );
		alpha.magFilter = alpha.minFilter = LinearFilter;
		alpha.needsUpdate = true;
		const most = 32;
		const beamGeometry = new CylinderGeometry( 1, 1, 1, 12, 1, true ).translate( 0, 0.5, 0 );
		// (Not added to what's behind them: on a bright sky that would leave nothing to see.)
		// (Both sides in one pass: a see-through mesh seen from both sides is otherwise drawn twice.)
		const beams = new InstancedMesh( beamGeometry, new MeshBasicMaterial( { transparent: true, opacity: 0.6, alphaMap: alpha, depthWrite: false, side: DoubleSide, forceSinglePass: true, toneMapped: false } ), most );
		const rings = new InstancedMesh( new TorusGeometry( 1, RING_TUBE, 6, 36 ), new MeshBasicMaterial( { toneMapped: false } ), most );
		const items = new InstancedMesh( new OctahedronGeometry( 1 ), new MeshBasicMaterial( { toneMapped: false } ), most );
		for ( const mesh of [ beams, rings, items ] ) {

			mesh.frustumCulled = false;
			mesh.count = 0;
			mesh.renderOrder = 2;
			mesh.name = 'challenge';
			// (Nothing hits them: the car's rays and the ground's are for the world.)
			mesh.raycast = () => {};

		}

		beams.name = 'challenge-beams';
		let spin = 0;
		const added = () => !! beams.parent;
		return {
			beams, rings, items,
			show( shown ) {

				const ringed = shown.challenge.kind !== 'collect';
				if ( ! added() ) app.scene.add( beams, rings, items );
				beams.count = rings.count = items.count = 0;
				beams.count = shown.gates.length;
				( ringed ? rings : items ).count = shown.gates.length;
				rings.visible = ringed;
				items.visible = ! ringed;
				this.place( shown );
				this.colour( shown );

			},
			hide() {

				if ( added() ) app.scene.remove( beams, rings, items );

			},
			// Where each is: at its ground (or its guess), a passed one shrunk to nothing. With
			// `itemsOnly`, the items alone (as they turn: the beams haven't moved).
			place( shown, itemsOnly = false ) {

				const moonly = shown.challenge.world === MOON;
				const radius = shown.challenge.route.radius;
				const ringed = shown.challenge.kind !== 'collect';
				const ring = Math.min( RING, radius * 0.5 );
				shown.gates.forEach( ( gate, i ) => {

					const y = gate.ground ?? gate.guess;
					const gone = gate.passed ? 0 : 1;
					if ( ! ringed ) items.setMatrixAt( i, _m.compose( _v.set( gate.x, y + ITEM_UP, gate.z ), _q.setFromAxisAngle( _up, spin + i ), _s.set( ITEM * gone, ITEM * 1.4 * gone, ITEM * gone ) ) );
					if ( itemsOnly ) return;
					const wide = ( moonly ? 1.6 : 1 ) * BEAM * ( ringed ? 1 : 0.7 );
					beams.setMatrixAt( i, _m.compose( _v.set( gate.x, y, gate.z ), _q.identity(), _s.set( wide * gone, ( moonly ? 2 : 1 ) * BEAM_HIGH * gone, wide * gone ) ) );
					// Standing up, facing along the way to it.
					if ( ringed ) rings.setMatrixAt( i, _m.compose( _v.set( gate.x, y + ring + 0.6, gate.z ), _q.setFromAxisAngle( _up, gate.facing ), _s.setScalar( ring * gone ) ) );

				} );
				items.instanceMatrix.needsUpdate = true;
				if ( itemsOnly ) return;
				beams.instanceMatrix.needsUpdate = true;
				rings.instanceMatrix.needsUpdate = true;

			},
			// The next to pass in the accent, the last (the finish) green, items gold.
			colour( shown ) {

				const ordered = shown.challenge.kind !== 'collect';
				const next = ordered ? shown.gates.find( gate => ! gate.passed ) : null;
				shown.gates.forEach( ( gate, i ) => {

					const colour = ! ordered ? STAR : gate === next ? NEXT : i === shown.gates.length - 1 ? GOAL : LATER;
					beams.setColorAt( i, colour );
					( ordered ? rings : items ).setColorAt( i, colour );

				} );
				for ( const mesh of [ beams, rings, items ] ) if ( mesh.instanceColor ) mesh.instanceColor.needsUpdate = true;
				this.place( shown );

			},
			// Items turn; rings stay.
			update( shown, dt ) {

				if ( shown.challenge.kind !== 'collect' || ! added() ) return;
				spin = ( spin + dt * SPIN ) % ( Math.PI * 2 );
				this.place( shown, true );

			},
		};

	}

}

// Where ( lat, lon ) at `height` m over the ellipsoid is in the scene, on the world the globe is on
// (its frame is recentred on the place driven: main.js).
function sceneOf( globe, lat, lon, height ) {

	globe.earth.updateWorldMatrix( true, false );
	globe.ellipsoid.getCartographicToPosition( lat * MathUtils.DEG2RAD, lon * MathUtils.DEG2RAD, height, _v );
	return _v.applyMatrix4( globe.earth.matrixWorld );

}

function makeHud( parent ) {

	const root = document.createElement( 'div' );
	root.className = 'ch-hud';
	root.hidden = true;
	root.innerHTML = '<span class="ch-arrow" aria-hidden="true"><svg viewBox="0 0 20 20" width="22" height="22"><path d="M10 2 17 16 10 12.5 3 16z" fill="currentColor"/></svg></span><span class="ch-dist"></span><span class="ch-clock">0:00.00</span><span class="ch-gates"></span>';
	root.setAttribute( 'aria-label', 'Challenge' );
	parent.append( root );
	return root;

}

// A random id for each run (the Worker keeps it with the best, so a recording can be tied to it).
function runId() {

	const bytes = crypto.getRandomValues( new Uint8Array( 12 ) );
	return btoa( String.fromCharCode( ...bytes ) ).replace( /\+/g, '-' ).replace( /\//g, '_' ).replace( /=+$/, '' );

}

function el( tag, className, text ) {

	const node = document.createElement( tag );
	if ( className ) node.className = className;
	if ( text !== undefined ) node.textContent = text;
	return node;

}
