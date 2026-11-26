import './challenges.css';
import {
	Color, CylinderGeometry, DataTexture, DoubleSide, InstancedMesh, MathUtils, Matrix4, MeshBasicMaterial, OctahedronGeometry, Quaternion,
	LinearFilter, Shape, ShapeGeometry, TorusGeometry, Vector2, Vector3,
} from 'three';
import { send } from './api.js';
import { createRaceGhost, createRecorder } from './challenge-ghost.js';
import { GRACE, HOOP_MISS, KIND_NAMES, destination, LINK_PATH, PERIOD_NAMES, TALL, ZONE_UP, checkPasses, describe, formatTime, rankText, timeLeft } from './challenge-rules.js';
import { ghostFault } from './ghost-rules.js';
import { LEVEL_MAX, levelLine } from './levels.js';
import { EARTH, WORLDS, onWorld, OnWorld, WORLD_IDS } from './worlds.js';
import { enuToLocal, headingToYaw, localToEnu, yawToHeading } from '../geo.js';

// Challenges in the page (docs/world-drive.md, "Challenges"): its own chunk, loaded the first time
// they're opened (main.js), so nothing of it is in the page's first load. The list of the ten live
// ones (three a world, the current world's first), each with the time it has left (ticking), its board's top
// three and your best; its board; starting one (a drop-in at its start, on its world); the run: a
// countdown, the gates or items on the ground the game has (their heights found as it loads: rays
// down on the Earth's tiles, a few a frame, another world's own heights), the next one marked on the HUD
// with an arrow and how far, the timer, and the finish card with your time, your place and the
// board's top, Retry and Back, the car brought to a stop under it; and posting the time
// (worker/drive/challenges.js), kept to be posted when the connection's back if it can't be.
//
// A run's time is the game's own clock: the steps the frames drive the car by (main.js gives this
// the same dt), from GO to the last pass. A pause ends the run (pausing, the page out of sight on
// the way: none of it counts, and nothing can be had from it), and so does leaving it: the globe,
// another ride or place, Go to someone. R (back on the road) is fine: it stops the car. A pause on
// the finish card puts the finished run away (its time still goes up), and driving on after a
// pause that stopped a run is the end of it.
//
// Ghosts (challenge-ghost.js): every run is recorded as it's driven and posted with its time, and a
// run races a ghost: your own best's by default (this page's, from the run just posted, or the
// Worker's), or with no best yet the board's quickest one to race (the Worker hands out the run of
// one row alone: the quickest with its ghost kept and a time the game could plausibly be driven in,
// to follow round, and to race), the one a friend's link names, or that row's (its Race). Splits against it at each gate and on the
// finish card; a button on the HUD hides it (kept for the visit's next runs, and the next visit's).
// "Challenge a friend" (the finish card, your own row of a board) shares a link to your best,
// /c?challenge=&vs=<its handle> (LINK_PATH); a page opened on one shows its card (openLink) and
// races their ghost.

// The countdown (s), and what's held at the start meanwhile; READING (s) the visit's first, on a
// computer, with the keys card over it ("Get ready" till the 3), put away at GO.
const COUNTDOWN = 3;
const READING = 6;
// Gates and items as drawn (m): a sprint's ring at most RING round (its zone is the route's radius,
// wider), a beam BEAM round and BEAM_HIGH up from the ground (twice that on another world, where
// it's seen from further), an item ITEM across, ITEM_UP over the ground, turning at SPIN rad/s.
const RING = 10;
const RING_TUBE = 0.06;
const BEAM = 3;
const BEAM_HIGH = 320;
const ITEM = 2.2;
const ITEM_UP = 3;
const SPIN = 1.6;
// The next gate (or star) stands out: its beam NEXT_WIDE times as wide, and its ring breathing
// NEXT_PULSE of its size either way at PULSE_RATE rad/s.
const NEXT_WIDE = 1.8;
const NEXT_PULSE = 0.08;
const PULSE_RATE = 4;
// The course on another world's ground (its heights are known everywhere, so it can be laid on them):
// glowing chevrons CHEVRON_GAP m apart, CHEVRON across and CHEVRON_UP over the ground, pointing the
// way, leaned up CHEVRON_LEAN rad from lying flat (flat, they're lines a few metres off from a
// driver's low view). Bright on the way to the next gate (from the gate before, or the start), from the car up to
// COURSE_REACH m ahead; dim on the way on from it (the turn coming), PREVIEW_REACH m of it. For a
// star hunt, from the car to the nearest star. Laid again as the next one changes and each
// COURSE_MOVE m driven; a wave of light runs along them toward the gate, WAVE m long, every
// WAVE_TIME s. COURSE_MOST at most.
const CHEVRON_GAP = 18;
const CHEVRON = 1.7;
const CHEVRON_UP = 0.15;
const CHEVRON_LEAN = 0.35;
const COURSE_REACH = 720;
const PREVIEW_REACH = 260;
const COURSE_MOVE = 12;
const WAVE = 90;
const WAVE_TIME = 1.1;
const COURSE_MOST = 64;
// A hoop run (the Moon's: docs/world-drive.md, "Hoop runs"): hoops drawn their route's radius round
// (the ring's tube HOOP_TUBE of it), standing at their height over the ground, a trick hoop pink;
// orbs ORB across, taken within ORB_REACH m (a bar of boost each) and back ORB_BACK s later. A hoop's
// plane crossed outside its ring within MISS_REACH m of it misses it (as flying through a later one
// misses those before it); further off, it's not near it at all. The plane is held START_UP m over
// the start's ground till GO (or as high as the first hoop, if that's higher).
const HOOP_TUBE = 0.045;
const ORB = 3.2;
const ORB_REACH = 14;
const ORB_BACK = 6;
const MISS_REACH = 400;
const START_UP = 30;
const HOOP_CLEAR = 2;
// The marker on the screen over the next gate (or star): this far (m) over its top, kept EDGE px in
// from the screen's sides when the gate's off the screen or behind.
const MARKER_UP = 4;
const EDGE = 44;
// On the Earth a gate's ground is found by rays down at its middle and at eight points round it,
// PROBE_OUT of its radius out (the lowest is its ground, the highest its top: probe), only for the
// gates within PROBE_NEAR m of the car (a far one's tiles are coarse, so what a ray finds there is
// rough anyway, and its beam's height hides that), and a few a frame: one gate at a time, and no
// more rays in a frame once they've taken PROBE_MS (ms) in it. A tile's first ray builds its
// bounding volume hierarchy (src/raycast.js), milliseconds of the main thread on a phone, and the
// gates' rays reach tiles the car's never do: all of a monthly's in one frame as it arrived could
// have held it up for a second (as the sea's look does with OPEN_MS, main.js). A gate not looked at
// yet is looked at first, the nearest first; then one gate each PROBE_EVERY s, so they move onto
// sharper tiles as those load.
const PROBE_EVERY = 0.2;
const PROBE_OUT = 0.6;
const PROBE_NEAR = 800;
const PROBE_MS = 4;
const PROBES = [ [ 0, 0 ], ...Array.from( { length: 8 }, ( _, i ) => [ Math.sin( i * Math.PI / 4 ) * PROBE_OUT, Math.cos( i * Math.PI / 4 ) * PROBE_OUT ] ) ];
// Colours: the next to pass, the others, the last (a sprint's finish, the landmark), and items.
const NEXT = new Color( 0xffd23f );
const LATER = new Color( 0x3ec1ff ).multiplyScalar( 0.75 );
const GOAL = new Color( 0x5dff8a );
const STAR = new Color( 0xffc531 );
const TRICK = new Color( 0xff4fa8 );
const ORB_COLOUR = new Color( 0x3ec1ff );
const MISSED = new Color( 0xff6b5e ).multiplyScalar( 0.6 );
// A post that didn't get through is tried again after RETRY ms, TRIES times in all (a 429 asking
// for longer than WAIT_MOST s isn't waited for: it's the day's times used up). One that still
// hasn't (no connection, the Worker failing) is kept here and posted again when the browser says
// it's back online, when the list is opened and at the next finish, while its challenge would
// still take it (till its end and GRACE).
const RETRY = 4000;
const TRIES = 3;
const WAIT_MOST = 60;
// At the finish the car is brought to a stop in STOPPING s (from its speed then, and at least
// STOP_LEAST m/s each second, more than any ride's gas), its booster and drift boost put out, and
// held where it stopped, as the countdown holds it at the start: the finish card is over the road,
// and on a phone over the buttons.
const STOPPING = 1;
const STOP_LEAST = 12;
// A new list is asked for as a listed challenge ends, or while the Worker says it has more to come
// (a period's first ask can be short: its CHECKED_MOST); if that fails (or still has it ended, or
// more to come) it's asked again after RELOAD ms, then twice that and so on up to
// RELOAD_MOST, RELOADS times at most (or after the Retry-After the Worker gives), and then not till
// the list is opened again.
const RELOAD = 5000;
const RELOAD_MOST = 60000;
const RELOADS = 4;
const NAME = /^[\p{L}\p{M}\p{N} _-]{3,16}$/u;
// A split against the ghost shows this long (ms) after each pass.
const SPLIT_SHOW = 3000;
// Whether ghosts are shown, kept in the browser (off: 'off').
const GHOST_SHOWN = 'world-drive.ghost';
const GHOST_ICON = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M10 2.5c-3.6 0-6 2.7-6 6.3v8.7l2-1.6 2 1.6 2-1.6 2 1.6 2-1.6 2 1.6V8.8c0-3.6-2.4-6.3-6-6.3z" fill="currentColor"/><circle cx="7.6" cy="8.6" r="1.3" fill="#0b1220"/><circle cx="12.4" cy="8.6" r="1.3" fill="#0b1220"/></svg>';
const SHARE_ICON = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M10 2.5v10M6.2 6.2 10 2.5l3.8 3.7M4 10.5v6h12v-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// How a challenge's kind is said in a share's words, and its period.
const SHARE_KINDS = { sprint: 'sprint', collect: 'star hunt', landmark: 'drive', hoops: 'hoop run' };
const SHARE_PERIODS = { day: 'today\'s', week: 'this week\'s', month: 'this month\'s' };
const LINK_PERIODS = { day: 'daily', week: 'weekly', month: 'monthly' };
const FLAG = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4 2.5v15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M5 3h11.5v8.5H5z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5 3h2.9v2.8H5zM10.8 3h2.9v2.8h-2.9zM7.9 5.8h2.9v2.9H7.9zM13.7 5.8h2.8v2.9h-2.8zM5 8.7h2.9v2.8H5zM10.8 8.7h2.9v2.8h-2.9z" fill="currentColor"/></svg>';

const _v = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _w = new Vector3();
const _colour = new Color();
const _m = new Matrix4();
const _up = new Vector3( 0, 1, 0 );
const _inverse = new Matrix4();
const _carto = { lat: 0, lon: 0, height: 0 };

// app: what main.js hands over: visit(), player(), pickName( name, say ), world(), earthClosed
// ({ onEarth } when there's no Earth this visit), earthShut (true only when that's because today's
// Earth drives are used up: otherwise, a plain load opened on the orrery or a page opened on a link to
// another world, the Earth is one reload away, and an Earth challenge's Start is that reload, its
// card opening there: onEarth( { challenge, vs } )), mode(), place(), vehicle(), the driver, ground,
// camera, scene, globe, bodies (the other worlds' grounds, body.js, by id) and vehicles, stats,
// startAt( place ), placeCar( pose ), toGlobe(), recentring (on a world whose scene follows the car,
// how far it goes before the scene's moved to it; else null) and shiftTo( { lat, lon, height } ) (the
// scene moved there as that does, recentred called with it),
// keys() (the keys card shown over a run's countdown, the visit's first time on a computer: true
// if it is), go() (a run's GO: the keys card put away, so nothing covers the road while the clock
// runs), pivot() (your car's, as drawn), look() (your ride's Garage look), ghostModels (ghosts.js's,
// what a ghost is drawn with), and the drive's and the pause menu's elements.
export function setUpChallenges( app ) {

	const dialog = makeDialog();
	const hud = makeHud( app.driveUi );
	const marker = makeMarker( app.driveUi );
	// The HUD's parts, and what's written in each (updateHud).
	const hudParts = {
		clock: hud.querySelector( '.ch-clock' ), gates: hud.querySelector( '.ch-gates' ), dist: hud.querySelector( '.ch-dist' ), arrow: hud.querySelector( '.ch-arrow' ),
		split: hud.querySelector( '.ch-split' ), ghost: hud.querySelector( '.ch-ghost-toggle' ),
		course: hud.querySelector( '.ch-course' ), dots: hud.querySelector( '.ch-dots' ), tank: hud.querySelector( '.ch-tank' ),
		bars: [ ...hud.querySelectorAll( '.ch-tank i' ) ], carve: hud.querySelector( '.ch-carve' ),
	};
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
	// The gate whose rays down are being cast, a few a frame: { gate, ray (the next of PROBES), low,
	// high }, or null.
	let probing = null;
	// The boards asked for (showBoard), so only the last one's answer is shown.
	let boards = 0;
	// A new list asked for as one ends: whether it's on its way, the ended ones it's for (their ids),
	// how many times it's been asked for them, and when (Date.now()) it may be asked again.
	let reloading = false;
	let reloadFor = '';
	let reloads = 0;
	let reloadAt = 0;
	// The result the name form is up for (the time to post once a name is picked).
	let naming = null;
	// Each challenge's best known here ({ [ id ]: ms }), from the list and from posts: a run is only
	// posted when it beats it. And the results that couldn't be posted, by challenge (its best).
	const bests = {};
	const unsent = new Map();
	window.addEventListener( 'online', flush );
	// The run being recorded; each challenge's best's ghost from this page ({ [ id ]: { run, ms, passes,
	// vehicle, look, ghost } }), and its handle (for a link to it) as the Worker last said.
	const recorder = createRecorder();
	const ownGhosts = new Map();
	const handles = {};
	// The ghost a run starting is to race ({ kind: 'own' | 'link' | 'leader' | 'none', name, ms, run }),
	// and the one being got ready or raced: { challenge (its id), spec, name, data, ghost, ready }.
	let pendingGhost = null;
	let race = null;
	let ghostShown = true;
	// A ghost asked for that couldn't be had ({ challenge, text }), to say as its run starts; and the
	// go-ahead for one whose data came while a run was racing, given once it isn't (frame).
	let missed = null;
	let afterRace = null;
	try {

		ghostShown = localStorage.getItem( GHOST_SHOWN ) !== 'off';

	} catch {

		// No storage: shown.

	}

	hudParts.ghost.addEventListener( 'click', () => {

		ghostShown = ! ghostShown;
		try {

			localStorage.setItem( GHOST_SHOWN, ghostShown ? 'on' : 'off' );

		} catch {

			// Not kept, then.

		}

		showGhostToggle();

	} );

	// --- the list ---

	// The list, with `note` over it if there's something to say first (a Retry of one that's over).
	function open( note = '' ) {

		if ( ! dialog.open ) dialog.showModal();
		showList();
		// (A link's card only over the list a link opened: openLink.)
		dialog.querySelector( '.ch-link' ).hidden = true;
		const said = dialog.querySelector( '.ch-note' );
		said.textContent = note;
		said.hidden = ! note;
		app.stats.add( 'challenge', 'open' );
		[ reloadFor, reloads, reloadAt ] = [ '', 0, 0 ];
		flush();
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
		for ( const challenge of listed.challenges ) {

			if ( challenge.me && ! challenge.me.owner ) bests[ challenge.id ] = Math.min( bests[ challenge.id ] ?? Infinity, challenge.me.ms );
			// Its handle (the Worker's, kept with your best), for a link to it from the finish card.
			if ( typeof challenge.me?.handle === 'string' ) handles[ challenge.id ] = challenge.me.handle;

		}
		say( '' );
		render();
		return answer;

	}

	function say( text ) {

		const status = dialog.querySelector( '.ch-status' );
		status.textContent = text;
		status.hidden = ! text;

	}

	// The ten, the current world's two first, a heading for each world.
	function render() {

		const here = app.world();
		const worlds = [ here, ...WORLD_IDS.filter( world => world !== here ) ];
		const parts = [];
		for ( const world of worlds ) {

			if ( ! listed.challenges.some( c => c.world === world ) ) continue;
			const heading = Object.assign( document.createElement( 'h3' ), { className: 'ch-world', textContent: OnWorld( world ) } );
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
		const you = el( 'p', 'ch-you', best === undefined ? 'You haven\'t a time on it yet' : `Your best ${ formatTime( best ) }${ challenge.me?.rank ? ` · #${ rankText( challenge.me.rank ) } of ${ Math.max( challenge.total, challenge.me.rank ) }` : '' }` );
		if ( challenge.me?.owner ) you.textContent = `Your best ${ formatTime( challenge.me.ms ) } (yours as the owner, kept off the board)`;
		const buttons = el( 'div', 'ch-buttons' );
		const { earthShut, reload } = earthFor( challenge );
		const start = el( 'button', earthShut ? 'ch-start' : 'primary ch-start', earthShut ? 'Needs an Earth drive' : reload ? 'Opens the Earth (reloads)' : 'Start' );
		start.type = 'button';
		start.addEventListener( 'click', () => earthShut || reload ? toEarth( { challenge: challenge.id } ) : begin( challenge ) );
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

		// Asked again while any listed has ended, or while the Worker says there are more to come (a
		// period's first ask lays out only so many on their ground: its CHECKED_MOST, the next ones
		// the rest, up to three more on a month's first day that's a Monday).
		const ended = listed.challenges.filter( c => c.endsAt <= now ).map( c => c.id ).join( ',' );
		const due = ended || ( listed.more ? 'more' : '' );
		if ( due !== reloadFor ) [ reloadFor, reloads, reloadAt ] = [ due, 0, 0 ];
		if ( ! dialog.open || ! due || reloading || reloads >= RELOADS || Date.now() < reloadAt ) return;
		reloading = true;
		reloads ++;
		load().then( answer => {

			// Asked again later only if it's still the same ones ended, or still more to come (tick sees to
			// that): after the Worker's Retry-After, or RELOAD doubling each time.
			reloadAt = Date.now() + ( answer.retryAfter ? answer.retryAfter * 1000 : Math.min( RELOAD_MOST, RELOAD * 2 ** ( reloads - 1 ) ) );

		} ).finally( () => reloading = false );

	}

	// An Earth challenge on a visit with no Earth: shut (today's Earth drives are used up: its Start
	// says so, and boot.js's notice says why), or a reload away (a plain load on the orrery, or a page
	// opened on another world's link: its Start is that reload, which asks for the Earth's visit then).
	// Neither for a challenge on a world made in the page, which is always open.
	function earthFor( challenge ) {

		const earthless = challenge.world === EARTH && !! app.earthClosed;
		const earthShut = earthless && !! app.earthShut;
		return { earthShut, reload: earthless && ! earthShut };

	}

	// No Earth this visit: its own word on how to get there (boot.js's onEarth). `target`, the challenge
	// ({ challenge, vs }), so the page it reloads to opens its card (a used-up visit's onEarth ignores it).
	function toEarth( target ) {

		dialog.close();
		app.earthClosed?.onEarth( target );

	}

	async function showBoard( challenge ) {

		const asking = ++ boards;
		const board = dialog.querySelector( '.ch-board' );
		dialog.querySelector( '.ch-list' ).hidden = true;
		board.hidden = false;
		board.querySelector( '.ch-board-title' ).textContent = `${ PERIOD_NAMES[ challenge.period ] }: ${ challenge.place }`;
		board.querySelector( '.ch-board-sub' ).textContent = `${ KIND_NAMES[ challenge.kind ] } · ${ describe( challenge ) }${ challenge.world === EARTH ? '' : ` · ${ onWorld( challenge.world ) }` }`;
		const rows = board.querySelector( '.ch-rows' );
		const mine = board.querySelector( '.ch-mine' );
		rows.replaceChildren();
		mine.textContent = 'Loading...';
		const player = app.player();
		const answer = await send( 'GET', `/api/challenges/board?challenge=${ challenge.id }${ player ? `&id=${ encodeURIComponent( player.id ) }` : '' }` );
		// (Back to the list meanwhile, or another board asked for: not this one's rows under its title.)
		if ( board.hidden || asking !== boards ) return;
		if ( ! answer.ok ) {

			mine.textContent = answer.status === 429 ? 'Asked too often just now. Try again in a minute.' : 'The board isn\'t answering. Try again soon.';
			return;

		}

		const { rows: top, total, me } = answer.body;
		const own = row => !! me && ! me.owner && row.rank === me.rank && row.name === me.name;
		const open = ! ended( challenge ) && answer.body.challenge?.finalAt == null;
		if ( me?.handle ) handles[ challenge.id ] = me.handle;
		rows.replaceChildren( ...top.map( row => {

			const li = rowItem( row, own( row ) );
			// Your own row: a link to your time, to share. The one to race (the row the Worker hands out
			// a run on, not yours): race their ghost.
			if ( own( row ) && me.handle ) li.querySelector( '.who' ).append( shareButton( challenge, me.ms, me.handle ) );
			else if ( row.run && ! own( row ) && open ) {

				const button = el( 'button', 'link ch-race', 'Race their ghost' );
				button.type = 'button';
				button.addEventListener( 'click', () => begin( challenge, { ghost: { kind: 'leader', name: row.name, ms: row.ms, run: row.run } } ) );
				li.querySelector( '.who' ).append( button );

			}

			return li;

		} ) );
		if ( ! top.length ) rows.append( el( 'li', 'ch-none', 'No times yet: be the first!' ) );
		if ( me?.owner ) mine.textContent = `Your best ${ formatTime( me.ms ) } would be #${ rankText( me.rank ) } (yours as the owner, kept off the board)`;
		else if ( me ) mine.textContent = `You're #${ rankText( me.rank ) } of ${ Math.max( total, me.rank ) }, with ${ formatTime( me.ms ) }`;
		else mine.textContent = `${ total } driver${ total === 1 ? '' : 's' } on this board`;
		// Your row further down than those shown (or the owner's, off the board): its link here.
		if ( me?.handle && ! top.some( own ) ) mine.append( ' ', shareButton( challenge, me.ms, me.handle ) );

	}

	// --- challenge a friend ---

	// A button sharing a link to your best on `challenge` (`ms`, named by `handle`).
	function shareButton( challenge, ms, handle ) {

		const button = el( 'button', 'link ch-share' );
		button.type = 'button';
		button.innerHTML = `${ SHARE_ICON }<span>Challenge a friend</span>`;
		button.addEventListener( 'click', () => share( challenge, ms, handle, button ) );
		return button;

	}

	// The words a link to your best goes with: "Beat my 0:21.40 on today's Furka Pass sprint in World
	// Drive" ("...on this week's drive to Eiffel Tower...", "...on today's Tycho crater star hunt on
	// the Moon...").
	function shareText( challenge, ms ) {

		const what = challenge.kind === 'landmark' ? `drive to ${ challenge.route.goal ?? challenge.place }` : `${ challenge.place } ${ SHARE_KINDS[ challenge.kind ] }`;
		return `Beat my ${ formatTime( ms ) } on ${ SHARE_PERIODS[ challenge.period ] } ${ what }${ challenge.world === EARTH ? '' : ` ${ onWorld( challenge.world ) }` } in World Drive`;

	}

	// A link to your best (/c?challenge=&vs=<handle>: LINK_PATH, the page the Worker gives a preview
	// card of its own) shared: the browser's own sheet where it has one (a phone's: messages, chats),
	// else copied, with its words; if neither can be, it's shown to copy by hand. Said beside `button`
	// (as its own word for a moment, and the field under it if need be).
	async function share( challenge, ms, handle, button ) {

		const url = `${ location.origin }${ LINK_PATH }?challenge=${ challenge.id }&vs=${ handle }`;
		const text = shareText( challenge, ms );
		const said = button.querySelector( 'span' ) ?? button;
		const was = said.textContent;
		const word = text => {

			said.textContent = text;
			clearTimeout( button.timer );
			button.timer = setTimeout( () => said.textContent = was, 2500 );

		};
		if ( typeof navigator.share === 'function' ) {

			try {

				await navigator.share( { title: 'World Drive challenge', text, url } );
				app.stats.add( 'challenge', 'share' );
				return word( 'Shared!' );

			} catch ( err ) {

				// Closed without sharing: nothing more.
				if ( err?.name === 'AbortError' ) return;

			}

		}

		try {

			await navigator.clipboard.writeText( `${ text } ${ url }` );
			app.stats.add( 'challenge', 'share' );
			word( 'Link copied!' );

		} catch {

			// Neither: the link to copy by hand, picked out.
			word( 'Copy it from here:' );
			const field = Object.assign( document.createElement( 'input' ), { className: 'ch-share-field', value: `${ text } ${ url }`, readOnly: true } );
			field.setAttribute( 'aria-label', 'Your challenge link' );
			button.nextElementSibling?.classList.contains( 'ch-share-field' ) ? button.nextElementSibling.replaceWith( field ) : button.after( field );
			field.addEventListener( 'keydown', e => e.stopPropagation() );
			field.focus();
			field.select();

		}

	}

	// --- a link to a challenge ---

	// A page opened on a friend's link (main.js, from boot.js: /c?challenge=&vs=): the Worker's
	// `answer` for it (send's, of /api/challenges/link). The list opens with the link's card over it:
	// their time to beat on the challenge, the time it has left, and Start (racing their ghost); one
	// with a handle that names nobody, the challenge with no ghost, said gently; one that's over, its
	// final board, their place on it, and today's challenges instead. One that won't open (no such
	// challenge, the Worker not answering) is said, over the list. `named`: whether the link named a
	// time at all (a link to the challenge alone has no ghost to miss); `handle`, the link's vs= as it
	// was, carried along if its Start has to reload the page to reach the Earth.
	async function openLink( answer, { named = true, handle = null } = {} ) {

		app.stats.add( 'challenge', 'link' );
		open();
		const card = dialog.querySelector( '.ch-link' );
		if ( ! answer?.ok ) {

			card.hidden = true;
			const said = dialog.querySelector( '.ch-note' );
			said.textContent = answer?.status === 404 ? 'That challenge link didn\'t open: there\'s no such challenge. Here are today\'s.' : 'That challenge link didn\'t open just now. Here are today\'s challenges.';
			said.hidden = false;
			return;

		}

		const { challenge, vs } = answer.body;
		card.hidden = false;
		card.dataset.world = challenge.world;
		card.replaceChildren();
		const what = `the ${ LINK_PERIODS[ challenge.period ] } ${ KIND_NAMES[ challenge.kind ].toLowerCase() } at ${ challenge.place }${ challenge.world === EARTH ? '' : ` ${ onWorld( challenge.world ) }` }`;
		const over = challenge.finalAt != null || challenge.replacedAt != null || ended( challenge );
		const head = el( 'p', 'ch-link-head' );
		const buttons = el( 'div', 'ch-buttons' );
		if ( over ) {

			head.append( el( 'b', '', 'This challenge is over.' ), vs ? ` ${ vs.name } finished ${ what } in ${ formatTime( vs.ms ) }${ vs.rank ? `, #${ rankText( vs.rank ) } on its board` : '' }.` : ` It was ${ what }.` );
			const rows = el( 'ol', 'ch-rows ch-link-rows' );
			card.append( el( 'p', 'ch-link-kicker', 'A friend\'s challenge' ), head, rows );
			const today = el( 'button', 'primary', 'Today\'s challenges' );
			today.type = 'button';
			today.addEventListener( 'click', () => {

				card.hidden = true;
				dialog.querySelector( '.ch-list' ).scrollIntoView?.( { block: 'start' } );

			} );
			buttons.append( today );
			card.append( buttons );
			// Its final board (kept as it ended).
			const board = await send( 'GET', `/api/challenges/board?challenge=${ challenge.id }` );
			if ( board.ok ) rows.replaceChildren( ...board.body.rows.slice( 0, 5 ).map( row => rowItem( row, !! vs && row.name === vs.name && row.ms === vs.ms ) ) );
			return;

		}

		const left = timeLeft( challenge.endsAt - ( Date.now() + offset ) ).replace( / left$/, '' );
		if ( vs ) head.append( el( 'b', 'ch-link-name', vs.name ), `'s time to beat: `, el( 'b', 'ch-link-time', formatTime( vs.ms ) ), ` on ${ what }, ${ left } left.` );
		else if ( named ) head.append( `That link's time wasn't found (the address may have been cut short), so there's no ghost to race. Here's the challenge: ${ what }, ${ left } left.` );
		else head.append( `Here's the challenge: ${ what }, ${ left } left.` );
		card.append( el( 'p', 'ch-link-kicker', vs ? 'A friend\'s challenge' : 'A challenge' ), head );
		const { earthShut, reload } = earthFor( challenge );
		const start = el( 'button', earthShut ? 'ch-start' : 'primary ch-start', earthShut ? 'Needs an Earth drive' : reload ? 'Opens the Earth (reloads)' : vs?.ghost ? 'Start: race their ghost' : 'Start' );
		start.type = 'button';
		start.addEventListener( 'click', () => {

			// (The link's handle too, so the card there has the friend's ghost to race.)
			if ( earthShut || reload ) return toEarth( { challenge: challenge.id, vs: handle } );
			app.stats.add( 'challenge', 'link_start' );
			begin( challenge, { ghost: vs?.ghost ? { kind: 'link', name: vs.name, ms: vs.ms, run: vs.run } : { kind: 'none' } } );

		} );
		buttons.append( start );
		card.append( buttons );

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
		li.append( el( 'span', 'rank', rankText( row.rank ) ), who, el( 'span', 'time', formatTime( row.ms ) ) );
		return li;

	}

	// --- starting one ---

	// Start `challenge`: a drop-in at its start (on its world), and its run once the car's down,
	// racing `ghost` (a spec: { kind: 'link' | 'leader', name, ms, run }, { kind: 'none' }, or your own
	// best's, the default), fetched meanwhile. One that's over (its Start pressed as it ended) isn't:
	// a run of it wouldn't be taken.
	function begin( challenge, { ghost = null } = {} ) {

		if ( ended( challenge ) ) return open( 'That challenge has ended, so a run of it wouldn\'t count. Here are the new ones.' );
		dialog.close();
		finish.hidden = true;
		// Back to the globe first, from a drive or its pause (a run going is left), then the drop-in.
		if ( app.mode() !== 'globe' ) app.toGlobe();
		const { start } = challenge.route;
		pending = challenge;
		pendingGhost = ghost;
		prepareRace( challenge, ghost );
		// A landmark's start is a pin kilometres from it, not the landmark: named by its coordinates
		// where places are named (a stunt score's board, others in the room), "On the way to" it on the
		// top bar, and not one of the recent places.
		const named = challenge.kind === 'landmark' ? { name: 'Dropped pin', region: '', near: `On the way to ${ challenge.place }`, recent: false } : { name: challenge.place, region: challenge.region };
		app.startAt( {
			...named, lat: start.lat, lon: start.lon,
			...( Number.isFinite( start.heading ) ? { heading: start.heading } : {} ),
			...( challenge.world === EARTH ? {} : { world: challenge.world } ),
			challenge: challenge.id,
		} );

	}

	// Whether `challenge` is over (its period ended, by the Worker's clock): no run of it is taken.
	function ended( challenge ) {

		return challenge.endsAt <= Date.now() + offset;

	}

	// main.js: a drop-in is starting at `place`. Anywhere but the challenge's start, a run (or one on
	// its way) is left.
	function dropping( place ) {

		if ( pending && place?.challenge === pending.id ) {

			// (Its ghost, being got ready for it, kept.)
			end( true );
			return;

		}

		pending = null;
		end();

	}

	// main.js: the car is down at `place` and driving. The challenge's own start: its run begins, and
	// true (main.js shows no keys card of its own: the countdown does, the visit's first time, with
	// time to read it, and puts it away at GO, as a first drive may well start as a challenge).
	function arrived( place ) {

		if ( ! pending || place?.challenge !== pending.id ) return false;
		const challenge = pending;
		pending = null;
		const d = app.driver;
		const reading = app.keys?.() ?? false;
		run = { challenge, gates: placeGates( challenge ), start: { east: d.east, north: d.north, heading: d.heading, up: d.y }, phase: 'countdown', left: reading ? READING : COUNTDOWN, clock: 0, after: 0, passes: [], id: runId() };
		if ( challenge.kind === 'hoops' ) takeOff( run );
		meshes.show( run );
		showHud();
		probeIn = 0;
		probing = null;
		// Its ghost (asked for as it was started), if one's ready; else as soon as it is.
		if ( race?.challenge !== challenge.id ) prepareRace( challenge, pendingGhost );
		startRace();
		return true;

	}

	// --- its ghost ---

	// The ghost `challenge`'s next run races, as `spec` says (begin's), got ready: its data (what the
	// Worker keeps of it, or this page's own best's) and its model. Any other is let go. One asked for
	// (a friend's link's, the leader's from their row) that can't be had (the Worker not answering,
	// or a better time of theirs has replaced it) is said, as the run starts: it goes on without.
	function prepareRace( challenge, spec ) {

		dropRace();
		missed = null;
		if ( spec?.kind === 'none' ) return;
		const entry = race = { challenge: challenge.id, spec, kind: null, name: null, data: null, ghost: null, ready: false };
		ghostData( challenge, spec ).then( async found => {

			if ( race !== entry ) return;
			// (None to race: no best yet, or its ghost not to be had.)
			if ( ! found ) {

				if ( spec?.kind === 'link' || spec?.kind === 'leader' ) {

					missed = { challenge: challenge.id, text: `${ spec.name }'s ghost couldn't be loaded, so this run is without it.` };
					sayMissed();

				}

				return dropRace();

			}

			Object.assign( entry, found );
			// Not while a run is racing: building a ride's model takes the page's thread for a moment (a
			// big file read, half a second on a computer), so it waits till that run's done (frame), and
			// the ghost is raced from the next (startRace: only before GO).
			if ( run?.phase === 'racing' ) await new Promise( resolve => afterRace = resolve );
			if ( race !== entry ) return;
			const vehicle = app.vehicles.find( v => v.id === found.data.vehicle ) ?? app.vehicles.find( v => v.id === 'go-kart' ) ?? app.vehicles[ 0 ];
			entry.ghost = createRaceGhost( { scene: app.scene, models: app.ghostModels, tags: app.driveUi, name: found.name } );
			const loaded = await entry.ghost.load( found.data, vehicle ).catch( err => {

				console.warn( 'World Drive: a challenge\'s ghost didn\'t load.', err );
				return false;

			} );
			if ( race !== entry ) return;
			if ( ! loaded ) return dropRace();
			entry.ready = true;
			startRace();

		} );

	}

	// The ghost for `spec` on `challenge`: { kind, name, data } (data: { run, ms, passes, vehicle,
	// look, ghost }), or null when there's none to race. Your own best's: this page's (the run it
	// posted), else the Worker's by its run (the list's me.run); with no best of yours yet, the board's
	// one to race (the list's race: the quickest time with its ghost kept and plausible, however far
	// down; a first run has the way round to follow, and a time to race; none when there's none);
	// a link's or the leader's, the Worker's by its run, taken only if it's as long as the time it's
	// said to be (a run's ghost is kept by its run).
	async function ghostData( challenge, spec ) {

		let asked = spec;
		if ( ! asked || asked.kind === 'own' ) {

			const mine = ownGhosts.get( challenge.id );
			const listedOne = listed?.challenges.find( c => c.id === challenge.id );
			const me = listedOne?.me;
			// (The list's race: the quickest with a ghost to race, wherever it is on the board.)
			const leader = listedOne?.race ?? listedOne?.top?.find( row => row.run );
			if ( mine && ( ! me || mine.ms <= me.ms ) ) return { kind: 'own', name: 'Your best', data: mine };
			if ( me?.run ) asked = { kind: 'own', name: 'Your best', ms: me.ms, run: me.run };
			else if ( ! me && ! mine && ! Number.isFinite( bests[ challenge.id ] ) && leader?.run ) asked = { kind: 'leader', name: leader.name, ms: leader.ms, run: leader.run };
			else return null;

		}

		const answer = await send( 'GET', `/api/challenges/ghost?challenge=${ challenge.id }&run=${ encodeURIComponent( asked.run ) }` );
		if ( ! answer.ok || answer.body.ms !== asked.ms ) return null;
		return { kind: asked.kind, name: asked.kind === 'own' ? 'Your best' : asked.name, data: answer.body };

	}

	// The ghost raced from this run's start, if it's ready and of this run's challenge: its samples
	// into this scene, at its start till GO. The split and the button to hide it on the HUD. Only
	// before GO (run.raced: the ghost this run races): one ready after it (its ride's model slow to
	// load or be made light, on a slow phone or network) waits for the next run, Retry, rather than
	// appearing, and being drawn for the first time, mid-race.
	function startRace() {

		sayMissed();
		if ( ! run || run.phase !== 'countdown' || ! race?.ready || race.challenge !== run.challenge.id ) return showGhostToggle();
		race.ghost.start( app.globe, run.challenge.route.start, run.challenge.world );
		run.raced = race;
		showGhostToggle();

	}

	// A ghost asked for that couldn't be had, said on the HUD once its run is on (prepareRace).
	function sayMissed() {

		if ( ! missed || ! run || run.challenge.id !== missed.challenge ) return;
		app.driver.hud.flash( missed.text );
		missed = null;

	}

	function dropRace() {

		race?.ghost?.dispose();
		race = null;
		showGhostToggle();

	}

	// The HUD's button to hide the ghost (or show it), only while there's one to race.
	function showGhostToggle() {

		const there = !! run && !! race && run.raced === race;
		hudParts.ghost.hidden = ! there;
		hudParts.ghost.classList.toggle( 'off', ! ghostShown );
		hudParts.ghost.setAttribute( 'aria-pressed', String( ghostShown ) );
		hudParts.ghost.title = ghostShown ? `Hide the ghost (${ race?.name ?? '' })` : `Show the ghost (${ race?.name ?? '' })`;

	}

	// The split at a pass: how far ahead (less than 0) or behind the ghost this run is (ms), at the
	// point `index` passed `done`th (a sprint's gate by its index, a hunt's stars by how many), or null.
	function splitAt( index, done ) {

		const passes = race && run.raced === race ? race.data.passes : null;
		const theirs = ! passes ? null : run.challenge.kind === 'collect' ? passes[ done - 1 ]?.[ 1 ] : passes.find( pass => pass[ 0 ] === index )?.[ 1 ];
		return Number.isFinite( theirs ) ? run.passes.at( - 1 )[ 1 ] - theirs : null;

	}

	function showSplit( split ) {

		const shown = hudParts.split;
		shown.textContent = `${ split <= 0 ? '-' : '+' }${ ( Math.abs( split ) / 1000 ).toFixed( 1 ) } s`;
		shown.classList.toggle( 'ahead', split <= 0 );
		shown.hidden = false;
		clearTimeout( shown.timer );
		shown.timer = setTimeout( () => shown.hidden = true, SPLIT_SHOW );

	}

	// Each point's place in the scene: on another world on its own heights (exact, before any ground is
	// built); on the Earth at the start's height until the tiles' ground there is found (probe, a few
	// rays a frame from the next frame on: nothing more in the one the car arrives in).
	function placeGates( challenge ) {

		const { globe } = app;
		// On another world its heights are known everywhere (body.js): each point at its own.
		const heights = challenge.world === EARTH ? null : app.bodies?.[ challenge.world ] ?? null;
		const moonly = !! heights;
		const base = app.place()?.height ?? 0;
		const ordered = challenge.kind !== 'collect';
		const hoops = challenge.kind === 'hoops';
		const tricks = new Set( challenge.route.tricks ?? [] );
		const gates = challenge.route.points.map( ( [ lat, lon, up = 0 ], index ) => {

			// (A hoop's middle `up` m over its ground: `height` is the hoop's own, its beam from the ground.)
			const under = moonly ? heights.heightAt( lat, lon ) ?? base : base;
			const height = under + ( hoops ? up : 0 );
			const ground = moonly ? sceneOf( globe, lat, lon, under ).y : null;
			const local = sceneOf( globe, lat, lon, height ).clone();
			return { index, lat, lon, height, under, x: local.x, y: local.y, z: local.z, ground, top: ground, guess: local.y, passed: false, missed: false, facing: 0, probed: moonly, hoop: hoops, trick: tricks.has( index ) };

		} );
		const d = app.driver;
		face( gates, ordered, { x: - d.east, z: d.north } );
		if ( hoops && moonly ) for ( const gate of gates ) clearHoop( challenge, gate, heights );
		return gates;

	}

	// A hoop on a slope lifted till its ring clears the ground beside it (HOOP_CLEAR m under its
	// bottom at its sides as well as its middle): its middle is `up` m over the ground under it, which
	// on a crater's wall leaves the uphill side of the ring in the ground. (Its place across the ground
	// is the route's, so what the Worker checks is as it was.)
	function clearHoop( challenge, gate, heights ) {

		const { world, route } = challenge;
		// (The way it faces as a bearing: the scene's x is west.)
		const bearing = - gate.facing * MathUtils.RAD2DEG;
		let high = - Infinity;
		for ( const turn of [ - 90, 90 ] ) {

			const [ lat, lon ] = destination( world, gate.lat, gate.lon, bearing + turn, route.radius );
			high = Math.max( high, heights.heightAt( lat, lon ) ?? - Infinity );

		}

		const lift = high + HOOP_CLEAR + route.radius - gate.height;
		if ( ! ( lift > 0 ) ) return;
		gate.height += lift;
		gate.y = sceneOf( app.globe, gate.lat, gate.lon, gate.height ).y;

	}

	// A ring faces along the way to it: from the start (`from`, in the scene), or the gate before.
	function face( gates, ordered, from ) {

		gates.forEach( ( gate, i ) => {

			const before = ordered && i ? gates[ i - 1 ] : from;
			gate.facing = Math.atan2( gate.x - before.x, gate.z - before.z );

		} );

	}

	// main.js: the scene's been moved by `matrix` (a Matrix4, a turn and a shift: its recentre, as the
	// car drives on a world whose scene follows it, Vesta's or Ceres's, or app.shiftTo's on a Retry),
	// and the driver, the camera and the rest with it. What's here in the scene is moved too: the
	// run's recording so far; its gates placed again from where they are on the world (at the heights
	// they were placed at, passed or not as they were: only another world's scene is ever moved, whose
	// gates' heights are its own); where it started moved as a place and a way to face, and where the
	// finish card held the car let go (it's held again where it is, at a standstill); the meshes put
	// where the gates are and the course laid again; and the ghost raced put into the scene again.
	function recentred( matrix ) {

		recorder.transform( matrix );
		if ( ! run ) return;
		const { start } = run;
		matrix.decompose( _w, _q, _s );
		const { east, north, up } = localToEnu( enuToLocal( start.east, start.north, start.up, _v ).applyMatrix4( matrix ) );
		// (The way it faced, turned as the scene was and laid flat again: a yaw's forward is -z turned
		// by it.)
		const yaw = headingToYaw( start.heading );
		_v.set( - Math.sin( yaw ), 0, - Math.cos( yaw ) ).applyQuaternion( _q );
		run.start = { east, north, heading: yawToHeading( Math.atan2( - _v.x, - _v.z ) ), up };
		run.stopAt = null;
		if ( run.challenge.world !== EARTH ) {

			for ( const gate of run.gates ) {

				const ground = sceneOf( app.globe, gate.lat, gate.lon, gate.under ?? gate.height ).y;
				const local = sceneOf( app.globe, gate.lat, gate.lon, gate.height );
				Object.assign( gate, { x: local.x, y: local.y, z: local.z, ground, top: ground, guess: ground } );

			}

			face( run.gates, run.challenge.kind !== 'collect', { x: - run.start.east, z: run.start.north } );

		}

		meshes.moved( run );
		if ( race?.ready && run.raced === race ) race.ghost.start( app.globe, run.challenge.route.start, run.challenge.world );

	}

	// A gate's ground on the Earth: where rays straight down meet whatever has loaded there (the
	// tiles or the test pad, or the sea's surface where it's laid), at its middle and round it at
	// PROBE_OUT of its radius. The lowest is its ground, what it's drawn on and its zone's middle is
	// over: the street beside a tower rather than the tower's roof, where the first thing a ray down
	// meets at its middle may be. The highest is its top (that roof, a bridge's deck), which the zone
	// reaches up to as well. Cast a few a frame (see PROBE_NEAR): the gate being looked at goes on
	// from where the last frame's rays stopped; else the nearest not looked at yet within PROBE_NEAR,
	// or, each PROBE_EVERY s, the next of those within it. Its ground and top are set once all its
	// rays are in, and the meshes moved if they've changed.
	function probeFrame( dt, d ) {

		probeIn -= dt;
		if ( ! probing ) {

			const near = run.gates.filter( gate => ! gate.passed && Math.hypot( - gate.x - d.east, gate.z - d.north ) <= PROBE_NEAR );
			let gate = near.filter( gate => ! gate.probed ).sort( ( a, b ) => Math.hypot( - a.x - d.east, a.z - d.north ) - Math.hypot( - b.x - d.east, b.z - d.north ) )[ 0 ];
			if ( ! gate && probeIn <= 0 && near.length ) gate = near[ probeNext ++ % near.length ];
			if ( ! gate ) return;
			if ( gate.probed ) probeIn = PROBE_EVERY;
			probing = { gate, ray: 0, low: Infinity, high: - Infinity };

		}

		const { gate } = probing;
		const radius = run.challenge.route.radius;
		const until = performance.now() + PROBE_MS;
		while ( probing.ray < PROBES.length ) {

			const [ x, z ] = PROBES[ probing.ray ++ ];
			const y = app.ground.heightAt( gate.x + x * radius, gate.z + z * radius );
			if ( y !== null ) {

				probing.low = Math.min( probing.low, y );
				probing.high = Math.max( probing.high, y );

			}

			// At least one ray a frame, and none more once they've taken PROBE_MS (the one that did may
			// have been a tile's first, building its hierarchy): the rest the next frame.
			if ( probing.ray < PROBES.length && performance.now() > until ) return;

		}

		const { low, high } = probing;
		probing = null;
		gate.probed = true;
		if ( low === Infinity || ( low === gate.ground && high === gate.top ) ) return;
		gate.ground = low;
		gate.top = high;
		meshes.place( run );

	}

	// --- the run ---

	function frame( dt ) {

		// A ghost held back while a run raced (prepareRace), got ready now.
		if ( afterRace && run?.phase !== 'racing' ) {

			const go = afterRace;
			afterRace = null;
			go();

		}

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
				if ( run.challenge.kind === 'hoops' ) d.aircraft?.courseGo();
				// Its recording from here, the car as it is at GO.
				const pivot = app.pivot?.();
				if ( pivot ) recorder.start( pivot );

			} else if ( count.hidden || ( now !== before && now <= COUNTDOWN ) ) showCount( now > COUNTDOWN ? 'Get ready' : String( now ), false, now > COUNTDOWN );

		} else if ( run.phase === 'racing' && driving ) {

			run.clock += dt;
			// (Recorded before the passes: the last of them finishes it, this frame.)
			const pivot = app.pivot?.();
			if ( pivot ) recorder.frame( run.clock * 1000, pivot );
			if ( run.challenge.kind === 'hoops' ) {

				takeOrbs( d, dt );
				passHoops( d );

			} else passGates( d );

		} else if ( run.phase === 'done' && driving && ! finish.hidden ) {

			// The finish card is up, over the road (and on a phone the buttons): the car brought to a
			// stop and held there, the gas held down or not, till it's put away (Retry, Back, Keep driving
			// here). Its booster and a drift's boost are put out (fired at the line, or again under the
			// card), and what the gas adds (at most its accel half as much again, with Shift) is taken
			// off on top of the braking, so it slows whatever's held down; stopped, it stays where it
			// stopped.
			cutThrust( d );
			if ( run.stopAt ) Object.assign( d, { east: run.stopAt.east, north: run.stopAt.north, speed: 0 } );
			else {

				const slower = ( Math.max( run.stopping, STOP_LEAST ) + ( d.spec?.accel ?? 0 ) * 1.6 ) * dt;
				d.speed = Math.sign( d.speed ) * Math.max( 0, Math.abs( d.speed ) - slower );
				if ( d.speed === 0 ) run.stopAt = { east: d.east, north: d.north };

			}

		}

		if ( run && run.challenge.world === EARTH && run.phase !== 'stopped' ) probeFrame( dt, d );

		if ( run ) {

			meshes.update( run, dt );
			updateHud( d );
			// The ghost on the run's clock: at its start till GO, and once you're over the line on to its
			// own finish (the clock going on past yours), so a slower one is seen coming in.
			if ( run.phase === 'done' && driving ) run.after += dt;
			if ( race && run.raced === race ) {

				const ms = run.phase === 'done' ? run.ms + run.after * 1000 : run.clock * 1000;
				race.ghost.update( ms, ghostShown && run.phase !== 'stopped' && app.mode() !== 'globe', app.camera, app.pivot?.() ?? null );

			}

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
				// Ahead of the ghost here, or behind ("-1.2 s", "+0.8 s").
				const split = splitAt( gate.index, done );
				if ( split !== null ) {

					run.splits = [ ...run.splits ?? [], split ];
					showSplit( split );

				}

			} else if ( ordered ) break;

		}

		if ( changed ) meshes.colour( run );
		if ( run.passes.length === run.gates.length ) finished();

	}

	// --- a hoop run ---

	// A hoop run's start (its first go, and each Retry): the ride a plane in course mode, held over the
	// start till GO (src/plane.js), and its orbs all there.
	function takeOff( shown ) {

		const d = app.driver;
		const { route, world } = shown.challenge;
		const heights = app.bodies?.[ world ];
		shown.orbs = ( route.orbs ?? [] ).map( ( [ lat, lon, up ] ) => {

			const local = sceneOf( app.globe, lat, lon, ( heights?.heightAt( lat, lon ) ?? 0 ) + up );
			return { x: local.x, y: local.y, z: local.z, back: 0 };

		} );
		shown.lastAt = null;
		const plane = d.aircraft;
		if ( ! plane ) return;
		if ( ! plane.on ) d.togglePlane();
		plane.setCourse( Math.max( START_UP, route.points[ 0 ]?.[ 2 ] ?? 0 ) );

	}

	// Orbs flown through: a bar of boost each, back ORB_BACK s later.
	function takeOrbs( d, dt ) {

		const at = { x: - d.east, y: d.y + ( d.height ?? 1.5 ) / 2, z: d.north };
		let changed = false;
		for ( const orb of run.orbs ?? [] ) {

			if ( orb.back > 0 ) {

				orb.back -= dt;
				changed ||= orb.back <= 0;
				continue;

			}

			if ( Math.hypot( at.x - orb.x, at.y - orb.y, at.z - orb.z ) > ORB_REACH ) continue;
			orb.back = ORB_BACK;
			changed = true;
			d.aircraft?.courseFill( 1 );
			d.hud.flash( '+1 boost' );

		}

		if ( changed ) meshes.place( run );

	}

	// The plane's hoops this frame: the next hoop's plane (as it stands, across the way to it) crossed
	// from where it was the frame before, through its ring (within the route's radius of its middle)
	// or outside it (within MISS_REACH: missed); or the hoop after it flown through, which misses it
	// (one at most: a hoop further on, a loop's finish by its start, doesn't skip the course). The
	// finish can't be missed: it's flown through, or it's not done.
	function passHoops( d ) {

		const at = { x: - d.east, y: d.y + ( d.height ?? 1.5 ) / 2, z: d.north };
		const was = run.lastAt ?? at;
		run.lastAt = at;
		const radius = run.challenge.route.radius;
		const next = run.gates.findIndex( gate => ! gate.passed );
		if ( next < 0 ) return;
		const last = run.gates.length - 1;
		for ( let j = next; j <= Math.min( last, next + 1 ); j ++ ) {

			const gate = run.gates[ j ];
			const nx = Math.sin( gate.facing );
			const nz = Math.cos( gate.facing );
			const s0 = ( was.x - gate.x ) * nx + ( was.z - gate.z ) * nz;
			const s1 = ( at.x - gate.x ) * nx + ( at.z - gate.z ) * nz;
			if ( s0 === s1 || ( s0 < 0 ) === ( s1 < 0 ) ) continue;
			// Where it crossed, between the two.
			const u = s0 / ( s0 - s1 );
			const side = ( was.x + ( at.x - was.x ) * u - gate.x ) * nz - ( was.z + ( at.z - was.z ) * u - gate.z ) * nx;
			const up = was.y + ( at.y - was.y ) * u - gate.y;
			const off = Math.hypot( side, up );
			const through = off <= radius;
			if ( ! through && ( j !== next || off > MISS_REACH ) ) continue;
			if ( ! through && j === last ) {

				d.hud.flash( 'Missed the finish! Turn back through it' );
				return;

			}

			for ( let k = next; k < j; k ++ ) missHoop( d, run.gates[ k ] );
			if ( through ) hitHoop( d, gate );
			else missHoop( d, gate );
			meshes.colour( run );
			if ( run.passes.length === run.gates.length ) finished();
			return;

		}

	}

	function hitHoop( d, gate ) {

		gate.passed = true;
		run.passes.push( [ gate.index, Math.round( run.clock * 1000 ) ] );
		d.aircraft?.courseHoop( gate.trick );
		const done = run.passes.length;
		const total = run.gates.length;
		if ( done < total ) d.hud.flash( gate.trick ? 'Trick hoop! Roll or loop for +2 boost' : `Hoop ${ done } / ${ total }` );
		const split = splitAt( gate.index, done );
		if ( split !== null ) {

			run.splits = [ ...run.splits ?? [], split ];
			showSplit( split );

		}

	}

	// A hoop missed: HOOP_MISS on the clock at once (challenge-rules.js), posted as [ index, ms, 1 ].
	function missHoop( d, gate ) {

		gate.passed = true;
		gate.missed = true;
		run.clock += HOOP_MISS / 1000;
		run.passes.push( [ gate.index, Math.round( run.clock * 1000 ), 1 ] );
		d.hud.flash( `Missed a hoop! +${ ( HOOP_MISS / 1000 ).toFixed( 1 ) } s` );

	}

	function finished() {

		run.phase = 'done';
		// (A hoop run's plane flies on as a plane, out of its course: slowing to a hover under the card.)
		app.driver.aircraft?.setCourse( null );
		// Slowing to a stop in STOPPING s from here (frame), nothing pushing it on.
		run.stopping = Math.abs( app.driver.speed ) / STOPPING;
		cutThrust( app.driver );
		// The time is the last pass's (to the millisecond, as the passes are). What's posted is a
		// copy as it finished, the ride it was driven in too: a Retry starts a new run, another ride
		// can be picked in a pause, and a post being tried again still has this one's.
		const ms = run.passes.at( - 1 )[ 1 ];
		run.ms = ms;
		// Its ghost, recorded to the line and packed in the frame of the route's start; with the ride's
		// look, to draw it in.
		const pivot = app.pivot?.();
		if ( pivot ) recorder.finish( ms, pivot );
		const ghost = pivot ? recorder.pack( app.globe, run.challenge.route.start, run.challenge.world ) : null;
		run.result = { challenge: run.challenge, id: run.id, ms, passes: run.passes.map( pass => [ ...pass ] ), vehicle: app.vehicle()?.id ?? 'go-kart', look: app.look?.() ?? {}, ghost };
		app.stats.add( 'challenge', 'finish' );
		app.driver.hud.flash( 'Finished!' );
		showFinish( run.result );

	}

	// The booster and a drift's or a trick's boost put out (as the booster running dry is).
	function cutThrust( d ) {

		if ( d.firing ) {

			d.firing = false;
			d.fx?.cool();

		}

		// (Not lit again by a boost key still held: see Driver.thrust.)
		d.ranDry = true;
		d.boost = null;

	}

	// Out of the run, its gates and HUD gone, and its ghost (unless `keepGhost`: a drop-in at its own
	// start, which the ghost was got ready for).
	function end( keepGhost = false ) {

		if ( run?.challenge.kind === 'hoops' ) app.driver.aircraft?.setCourse( null );
		run = null;
		naming = null;
		meshes.hide();
		showingHud( false );
		count.hidden = true;
		finish.hidden = true;
		stopped.hidden = true;
		if ( ! keepGhost ) dropRace();
		race?.ghost?.update( 0, false );

	}

	// main.js: paused. A run (or its countdown) is over: none of a pause counts, and nothing can be
	// had from one. The pause menu says so, with Retry. A finished run is put away, its card with it
	// (a time on its way to the board still goes), so the card isn't left over the pause menu.
	function paused() {

		if ( run?.phase === 'done' ) return end();
		if ( ! run || ( run.phase !== 'countdown' && run.phase !== 'racing' ) ) return;
		run.phase = 'stopped';
		if ( run.challenge.kind === 'hoops' ) app.driver.aircraft?.setCourse( null );
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
	// back, the countdown again. Not once the challenge is over (its period ended while it was
	// driven, or the card waited): a run of it wouldn't be taken, so the list instead, with the new
	// one and a word on why.
	function retry() {

		if ( ! run ) return;
		const { challenge } = run;
		if ( ended( challenge ) ) {

			const from = app.mode();
			end();
			if ( from === 'driving' ) app.toGlobe();
			return open( 'That challenge has ended, so a run of it wouldn\'t count. Here are the new ones.' );

		}

		finish.hidden = true;
		stopped.hidden = true;
		naming = null;
		// On a world whose scene follows the car (main.js's recentre), the start can be kilometres
		// behind, several moves of the scene ago: the scene's moved back to the route's start first
		// (app.shiftTo, which moves this run's start and gates with it, recentred), so the car's put
		// down by the scene's middle.
		if ( app.recentring ) {

			const { lat, lon } = challenge.route.start;
			app.shiftTo( { lat, lon, height: app.bodies?.[ challenge.world ]?.heightAt( lat, lon ) ?? 0 } );

		}

		const { start, gates } = run;
		if ( ! app.placeCar( start ) ) return;
		for ( const gate of gates ) gate.passed = gate.missed = false;
		run = { challenge, gates, start, phase: 'countdown', left: COUNTDOWN, clock: 0, after: 0, passes: [], id: runId() };
		if ( challenge.kind === 'hoops' ) takeOff( run );
		probing = null;
		meshes.show( run );
		showHud();
		// Racing your own best: the new one, if this page has just set it (the ghost of the run you
		// just drove). Anyone else's, raced again.
		const mine = ownGhosts.get( challenge.id );
		if ( ( ! race || race.spec?.kind === 'own' || ! race.spec ) && mine && race?.data !== mine ) prepareRace( challenge, null );
		else startRace();

	}

	// --- the HUD ---

	function showHud() {

		showingHud( true );
		hud.dataset.kind = run.challenge.kind;
		hudParts.split.hidden = true;
		// A hoop run's: a dot for each hoop, the carve's charge and the boost tank.
		const hooped = run.challenge.kind === 'hoops';
		hudParts.course.hidden = ! hooped;
		if ( hooped ) hudParts.dots.replaceChildren( ...run.gates.map( gate => el( 'i', gate.trick ? 'trick' : '' ) ) );
		showGhostToggle();
		updateHud( app.driver );

	}

	// The HUD shown or not (and the XP pop-ups moved under it while it is: challenges.css).
	function showingHud( shown ) {

		hud.hidden = ! shown;
		marker.root.hidden = true;
		document.body.classList.toggle( 'ch-running', shown );
		for ( const key of Object.keys( written ) ) delete written[ key ];

	}

	function showCount( text, go = false, ready = false ) {

		count.textContent = text;
		count.classList.toggle( 'go', go );
		count.classList.toggle( 'ready', ready );
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
		write( 'gates', run.challenge.kind === 'landmark' ? run.challenge.route.goal : `${ run.passes.length } / ${ run.gates.length }${ run.challenge.kind === 'collect' ? ' ★' : run.challenge.kind === 'hoops' ? ' hoops' : '' }` );
		// (Once it's done, as it was over the line: its course mode's off by then.)
		if ( run.challenge.kind === 'hoops' && ! done ) updateCourse( d );
		const target = done ? null : nextGate( d );
		write( 'aim', target ? '' : 'none', () => hudParts.arrow.hidden = hudParts.dist.hidden = marker.root.hidden = ! target );
		if ( ! target ) return;
		placeMarker( target );
		const east = - target.x - d.east;
		const north = target.z - d.north;
		app.camera.getWorldDirection( _v );
		const facing = Math.atan2( - _v.x, _v.z );
		const degrees = Math.round( ( Math.atan2( east, north ) - facing ) * MathUtils.RAD2DEG );
		write( 'turn', degrees, () => hudParts.arrow.style.transform = `rotate( ${ degrees }deg )` );
		const metres = Math.hypot( east, north );
		write( 'dist', metres >= 1000 ? `${ ( metres / 1000 ).toFixed( 1 ) } km` : `${ Math.round( metres ) } m`, () => marker.dist.textContent = hudParts.dist.textContent = written.dist );

	}

	// A hoop run's part of the HUD: each hoop's dot (hit, missed or to come), the boost tank (a bar
	// each, the last part-full) and the carve's charge (its level's colour, filling to the next).
	function updateCourse( d ) {

		write( 'dots', run.gates.map( gate => gate.missed ? 'm' : gate.passed ? 'h' : '-' ).join( '' ), () => {

			run.gates.forEach( ( gate, i ) => {

				const dot = hudParts.dots.children[ i ];
				dot?.classList.toggle( 'hit', gate.passed && ! gate.missed );
				dot?.classList.toggle( 'missed', gate.missed );

			} );

		} );
		const course = d.aircraft?.course;
		const tank = course ? Math.round( course.tank * 20 ) / 20 : 0;
		write( 'tank', tank, () => {

			hudParts.bars.forEach( ( bar, i ) => bar.style.setProperty( '--fill', String( MathUtils.clamp( tank - i, 0, 1 ) ) ) );
			hudParts.tank.setAttribute( 'aria-valuenow', tank.toFixed( 1 ) );
			hudParts.tank.classList.toggle( 'empty', tank <= 0 );

		} );
		const level = course?.level ?? 0;
		const charging = course && course.carve > 0 ? 'on' : '';
		write( 'carve', `${ level }${ charging }`, () => {

			hudParts.carve.dataset.level = String( level );
			hudParts.carve.classList.toggle( 'on', !! charging );
			hudParts.carve.textContent = level ? [ 'I', 'II', 'III' ][ level - 1 ] : '';

		} );

	}

	// The marker over the next gate (or star) on the screen, with how far it is: where it is in the
	// view, or held at the screen's edge on its side when it's off the screen (or behind you, turned
	// round to the side it's on), pointing to it there. Coloured as the gate is.
	function placeMarker( target ) {

		const ringed = run.challenge.kind !== 'collect';
		const ring = Math.min( RING, run.challenge.route.radius * 0.5 );
		const y = target.hoop ? target.y + run.challenge.route.radius + MARKER_UP : ( target.ground ?? target.guess ) + ( ringed ? ring * 2 + 0.6 : ITEM_UP + ITEM ) + MARKER_UP;
		const camera = app.camera;
		camera.getWorldPosition( _s );
		camera.getWorldDirection( _v );
		const behind = _w.set( target.x, y, target.z ).sub( _s ).dot( _v ) < 0;
		_v.set( target.x, y, target.z ).project( camera );
		let x = behind ? - _v.x : _v.x;
		let yy = behind ? - _v.y : _v.y;
		const width = window.innerWidth;
		const height = window.innerHeight;
		const ex = 1 - 2 * EDGE / width;
		const ey = 1 - 2 * EDGE / height;
		const off = behind || Math.abs( x ) > ex || Math.abs( yy ) > ey;
		let angle = 0;
		if ( off ) {

			// Out along its direction from the middle until it meets the edge.
			if ( behind && Math.abs( x ) < 1e-3 && Math.abs( yy ) < 1e-3 ) yy = - 1;
			const scale = 1 / Math.max( Math.abs( x ) / ex, Math.abs( yy ) / ey );
			x *= scale;
			yy *= scale;
			angle = Math.round( Math.atan2( x * width, yy * height ) * MathUtils.RAD2DEG );

		}

		const px = Math.round( ( x + 1 ) / 2 * width );
		const py = Math.round( ( 1 - yy ) / 2 * height );
		write( 'marker', `${ px },${ py }`, () => marker.root.style.transform = `translate( ${ px }px, ${ py }px )` );
		write( 'markerOff', off ? angle : 'on', () => {

			marker.root.classList.toggle( 'off', off );
			// Pointing down, the arrow is where the distance goes: that goes over the diamond.
			marker.root.classList.toggle( 'below', off && Math.abs( angle ) > 90 );
			marker.pointer.style.transform = `rotate( ${ angle }deg )`;

		} );
		const last = ringed && target === run.gates[ run.gates.length - 1 ];
		write( 'markerKind', ringed ? last ? 'goal' : 'gate' : 'star', () => marker.root.dataset.kind = ringed ? last ? 'goal' : 'gate' : 'star' );

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
		// A hoop run's misses, and what they cost.
		const misses = result.passes.filter( pass => pass[ 2 ] === 1 ).length;
		const missed = finish.querySelector( '.ch-f-missed' );
		missed.hidden = challenge.kind !== 'hoops';
		missed.textContent = misses ? `${ misses } hoop${ misses === 1 ? '' : 's' } missed (+${ ( misses * HOOP_MISS / 1000 ).toFixed( 1 ) } s)` : 'Every hoop!';
		missed.classList.toggle( 'clean', ! misses );
		finish.querySelector( '.ch-f-rows' ).replaceChildren();
		finish.querySelector( '.ch-f-form' ).hidden = true;
		finish.querySelector( '.ch-f-share' ).replaceChildren();
		// Against the ghost raced: "1.24 s quicker than your best", "0.80 s behind Ann Racer's 0:21.40".
		const against = finish.querySelector( '.ch-f-vs' );
		const theirs = race?.ready && race.challenge === challenge.id ? race.data.ms : null;
		against.hidden = theirs === null;
		if ( theirs !== null ) {

			const gap = ms - theirs;
			const whose = race.name === 'Your best' ? 'your best' : `${ race.name }'s ${ formatTime( theirs ) }`;
			against.textContent = gap === 0 ? `Level with ${ whose }` : `${ ( Math.abs( gap ) / 1000 ).toFixed( 2 ) } s ${ gap < 0 ? 'quicker than' : 'behind' } ${ whose }`;
			against.classList.toggle( 'ahead', gap <= 0 );

		}

		finish.hidden = false;
		// A run that doesn't count (as the Worker would check it: its passes, then its ghost, a run that
		// jumped about more than R does) isn't a best, nor a ghost to race.
		const badge = finish.querySelector( '.ch-f-badge' );
		badge.hidden = true;
		if ( ! checkPasses( challenge, ms, result.passes ) ) return finishSay( 'That run didn\'t count: it went quicker than anything can drive. Try again.' );
		if ( ! result.ghost || ghostFault( challenge, ms, result.passes, result.ghost ) ) return finishSay( 'That run didn\'t count: it couldn\'t be recorded as it was driven. Try again.' );
		// This page's own best's ghost, to race next (from Retry), posted or not: on the test pad too.
		const own = ownGhosts.get( challenge.id );
		if ( ( ! own || ms < own.ms ) && ms <= ( bests[ challenge.id ] ?? Infinity ) ) ownGhosts.set( challenge.id, { run: result.id, ms, passes: result.passes, vehicle: result.vehicle, look: result.look, ghost: result.ghost } );
		// Your best: the board's, or one kept here that couldn't be posted yet (beaten now, it's
		// dropped: only a best is kept; else it's posted now, with any others kept).
		const held = unsent.get( challenge.id )?.ms;
		if ( held !== undefined && ms < held ) unsent.delete( challenge.id );
		flush();
		const best = Math.min( bests[ challenge.id ] ?? Infinity, held ?? Infinity );
		const better = ms < best;
		finishSay( better ? ( best === Infinity ? 'Finished! Your first time on it.' : `New best! Your last was ${ formatTime( best ) }.` ) : `Your best is ${ formatTime( best ) }.` );
		badge.hidden = ! better;
		if ( ! app.visit() ) return finishSay( `${ finish.querySelector( '.ch-f-note' ).textContent } Times go on the board from a drive on the real map.` );
		if ( ! better ) {

			// Your best's link to share, if the Worker's said what it is.
			if ( handles[ challenge.id ] && Number.isFinite( best ) ) finish.querySelector( '.ch-f-share' ).append( shareButton( challenge, best, handles[ challenge.id ] ) );
			return showTop( challenge );

		}
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
	// (the same result, the same run id and ride, so the Worker knows it if the first got there and
	// only its answer was lost) if it didn't get through, whatever happens to the card meanwhile: a
	// Retry, a pause or another ride doesn't lose a time; and kept to post later (keep) if it still
	// hasn't. The card only shows the answer while it's still up for this result. `tries` is how
	// many it's had (TRIES: no more).
	async function post( result, tries = 0 ) {

		const player = app.player();
		const { challenge } = result;
		if ( showing( result ) ) finishSay( 'Posting your time...' );
		const answer = await send( 'POST', '/api/challenges/time', {
			id: player.id, secret: player.secret, visit: app.visit(), challenge: challenge.id, run: result.id, ms: result.ms, passes: result.passes, vehicle: result.vehicle,
			look: result.look, ghost: result.ghost,
		} );
		const shown = showing( result );
		if ( answer.ok ) {

			const { ms, rank, total, isNewBest, top, owner, handle } = answer.body;
			bests[ challenge.id ] = ms;
			if ( typeof handle === 'string' ) handles[ challenge.id ] = handle;
			app.stats.add( 'challenge', 'posted' );
			// A first time on a challenge may have earned an achievement (finished, worker/drive/achievements.js).
			app.onPosted?.();
			if ( listed ) {

				const listedOne = listed.challenges.find( c => c.id === challenge.id );
				if ( listedOne ) Object.assign( listedOne, { me: { ms, rank, run: answer.body.run, ...( typeof handle === 'string' ? { handle } : {} ), ...( owner ? { owner } : {} ) }, total, top: top.slice( 0, 3 ) } );

			}

			if ( ! shown ) return;
			finish.querySelector( '.ch-f-badge' ).hidden = ! isNewBest;
			finishSay( owner ? `Your best ${ formatTime( ms ) } would be #${ rankText( rank ) }: yours as the owner are kept off the board.` : `#${ rankText( rank ) } of ${ Math.max( total, rank ) } on the board${ isNewBest ? '' : `, with your best ${ formatTime( ms ) }` }` );
			showRows( top, owner ? null : rank );
			// A link to it, to send a friend.
			if ( typeof handle === 'string' ) finish.querySelector( '.ch-f-share' ).replaceChildren( shareButton( challenge, ms, handle ) );
			return;

		}

		const reason = answer.body?.reason;
		const waits = answer.status === 429 && reason !== 'daily' && answer.retryAfter <= WAIT_MOST;
		const unreached = answer.status === 0 || answer.status >= 500;
		if ( tries < TRIES && ( waits || unreached ) ) {

			if ( shown ) finishSay( answer.status === 429 ? 'A moment...' : 'Couldn\'t reach World Drive. Trying again...' );
			setTimeout( () => post( result, tries + 1 ), Math.max( RETRY, answer.retryAfter * 1000 ) );
			return;

		}

		// Still not reached (a phone in a tunnel, a lift): kept, to go up when the connection's back.
		if ( unreached && keep( result ) ) {

			if ( showing( result ) ) finishSay( 'No connection just now: your time is kept here, and goes up when you\'re back online.' );
			return;

		}

		if ( ! shown ) return;
		if ( answer.status === 403 && reason === 'challenge' ) return finishSay( 'This challenge is over (or the owner has changed it). Open Challenges for the new one.' );
		if ( answer.status === 403 && reason === 'world' ) return finishSay( 'Earth challenges go on the board from a drive on the Earth.' );
		if ( answer.status === 403 && reason === 'visit' ) return finishSay( 'This visit has run out. Reload the page to post times again.' );
		if ( answer.status === 403 && reason === 'player' ) return finishSay( 'This browser\'s name was removed. Pick a new one on the leaderboard.' );
		if ( answer.status === 403 && reason === 'ride' ) return finishSay( `${ answer.body.unlock ?? 'That ride isn\'t unlocked yet' }: times in it go on the board once it is.` );
		if ( answer.status === 400 ) return finishSay( 'That run didn\'t count. Try again.' );
		if ( answer.status === 429 && reason === 'visit' ) return finishSay( 'That\'s all the times one visit can post. Reload the page to post more.' );
		if ( answer.status === 429 ) return finishSay( 'That\'s all the times for today. Try again tomorrow.' );
		finishSay( 'Couldn\'t reach World Drive, so your time wasn\'t posted.' );

	}

	// `result` kept to post again (flush), as its challenge's best kept: true, or false if it's too
	// late for it (its challenge over), or a better one is kept already.
	function keep( result ) {

		const kept = unsent.get( result.challenge.id );
		if ( result.challenge.endsAt + GRACE <= Date.now() + offset || ( kept && kept !== result && kept.ms <= result.ms ) ) return false;
		unsent.set( result.challenge.id, result );
		return true;

	}

	// The results kept (keep) posted again, once each (kept again if they still don't get through),
	// those whose challenge is over and past GRACE dropped: the Worker wouldn't take them.
	function flush() {

		for ( const [ id, result ] of unsent ) {

			unsent.delete( id );
			if ( result.challenge.endsAt + GRACE > Date.now() + offset && app.visit() && app.player() ) post( result, TRIES );

		}

	}

	// A run that's no better than your best: the board's top as it is, and where you are on it; and
	// your best's link to share (from the board's own row, if the list hadn't said its handle).
	async function showTop( challenge ) {

		const player = app.player();
		const result = run?.result;
		const answer = await send( 'GET', `/api/challenges/board?challenge=${ challenge.id }${ player ? `&id=${ encodeURIComponent( player.id ) }` : '' }` );
		if ( ! showing( result ) || ! answer.ok ) return;
		const { rows, total, me } = answer.body;
		if ( me && ! me.owner ) finishSay( `Your best ${ formatTime( me.ms ) } is #${ rankText( me.rank ) } of ${ Math.max( total, me.rank ) }.` );
		showRows( rows.slice( 0, 5 ), me && ! me.owner ? me.rank : null );
		if ( typeof me?.handle !== 'string' ) return;
		handles[ challenge.id ] = me.handle;
		const share = finish.querySelector( '.ch-f-share' );
		if ( ! share.querySelector( '.ch-share' ) ) share.append( shareButton( challenge, me.ms, me.handle ) );

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
			<p class="ch-intro">A weekly and a monthly one on ${ worldList() }, each with its own board. Your best time counts.</p>
			<p class="ch-note" role="status" hidden></p>
			<p class="ch-status" role="status" hidden></p>
			<section class="ch-link" aria-label="A friend's challenge" hidden></section>
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
			<p class="ch-f-missed" hidden></p>
			<p class="ch-f-vs" hidden></p>
			<p class="ch-f-note" role="status"></p>
			<div class="ch-f-share"></div>
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
		openLink,
		dropping,
		arrived,
		paused,
		resumed,
		recentred,
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
		// For the tests: the ghost raced ({ name, kind, ready, racing (this run races it: it was ready
		// by GO), ms, passes, pivot (its model's, as drawn), faded, shown, triangles (its model's, as
		// drawn) }), or null.
		get race() {

			return race && {
				name: race.name, kind: race.kind ?? race.spec?.kind ?? 'own', ready: race.ready, racing: !! run && run.raced === race, ms: race.data?.ms ?? null, passes: race.data?.passes ?? null, pivot: race.ghost?.pivot ?? null,
				faded: race.ghost?.faded ?? false, shown: ghostShown, triangles: race.ghost?.triangles ?? 0, timing: race.ghost?.timing ?? null,
			};

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
		// A hoop run's: its hoops (a thicker ring, its route's radius round) and its orbs.
		const hoops = new InstancedMesh( new TorusGeometry( 1, HOOP_TUBE, 8, 64 ), new MeshBasicMaterial( { toneMapped: false } ), most );
		const orbs = new InstancedMesh( new OctahedronGeometry( 1, 2 ), new MeshBasicMaterial( { color: ORB_COLOUR, transparent: true, opacity: 0.85, toneMapped: false } ), most );
		// The course's chevrons: a V pointing along +z, standing on the ground leaned forward.
		const vee = new Shape( [ [ 0, 0.6 ], [ 1, - 0.4 ], [ 1, - 0.9 ], [ 0, 0.1 ], [ - 1, - 0.9 ], [ - 1, - 0.4 ] ].map( ( [ x, y ] ) => new Vector2( x, y ) ) );
		const chevrons = new InstancedMesh( new ShapeGeometry( vee ).translate( 0, 0.9, 0 ).rotateX( Math.PI / 2 - CHEVRON_LEAN ), new MeshBasicMaterial( { transparent: true, opacity: 0.9, depthWrite: false, side: DoubleSide, toneMapped: false } ), COURSE_MOST );
		chevrons.setColorAt( 0, NEXT );
		for ( const mesh of [ beams, rings, items, chevrons, hoops, orbs ] ) {

			mesh.frustumCulled = false;
			mesh.count = 0;
			mesh.renderOrder = 2;
			mesh.name = 'challenge';
			// (Nothing hits them: the car's rays and the ground's are for the world.)
			mesh.raycast = () => {};

		}

		beams.name = 'challenge-beams';
		chevrons.name = 'challenge-course';
		// Marks on the ground, drawn before the beams always (both see-through: by the depth of
		// bounding spheres made once, which a moving course would leave stale, the order would flip).
		chevrons.renderOrder = 1;
		let spin = 0;
		let pulse = 0;
		let wave = 0;
		// The course as laid: each chevron's distance (m) to the gate it leads to, and whether it's on
		// the way on from the next (dim); what it was laid for (the gate, and where the car was).
		let laid = [];
		let laidFor = null;
		const added = () => !! beams.parent;
		return {
			beams, rings, items, chevrons, hoops, orbs,
			show( shown ) {

				const hooped = shown.challenge.kind === 'hoops';
				const ringed = shown.challenge.kind !== 'collect' && ! hooped;
				if ( ! added() ) app.scene.add( beams, rings, items, chevrons, hoops, orbs );
				chevrons.count = 0;
				laid = [];
				laidFor = null;
				beams.count = rings.count = items.count = hoops.count = orbs.count = 0;
				beams.count = shown.gates.length;
				( hooped ? hoops : ringed ? rings : items ).count = shown.gates.length;
				orbs.count = hooped ? Math.min( most, shown.orbs?.length ?? 0 ) : 0;
				rings.visible = ringed;
				items.visible = ! ringed && ! hooped;
				hoops.visible = orbs.visible = hooped;
				this.place( shown );
				this.colour( shown );
				// (Its bounds made again for this route's gates when it's next drawn.)
				beams.boundingSphere = rings.boundingSphere = items.boundingSphere = hoops.boundingSphere = orbs.boundingSphere = null;

			},
			hide() {

				if ( added() ) app.scene.remove( beams, rings, items, chevrons, hoops, orbs );

			},
			// The scene's been moved (recentred): each where its gate now is, the course laid again
			// (what it was laid for, the car's place, was in the scene as it was), and their bounds
			// made again.
			moved( shown ) {

				laidFor = null;
				this.place( shown );
				beams.boundingSphere = rings.boundingSphere = items.boundingSphere = chevrons.boundingSphere = hoops.boundingSphere = orbs.boundingSphere = null;

			},
			// Where each is: at its ground (or its guess), a passed one shrunk to nothing. With
			// `itemsOnly`, the items alone (as they turn: the beams haven't moved).
			place( shown, itemsOnly = false ) {

				const moonly = shown.challenge.world !== EARTH;
				const radius = shown.challenge.route.radius;
				const hooped = shown.challenge.kind === 'hoops';
				const ringed = shown.challenge.kind !== 'collect';
				const ring = Math.min( RING, radius * 0.5 );
				const next = ringed ? shown.gates.find( gate => ! gate.passed ) : null;
				const breathe = 1 + NEXT_PULSE * Math.sin( pulse );
				shown.gates.forEach( ( gate, i ) => {

					const y = gate.ground ?? gate.guess;
					const gone = gate.passed ? 0 : 1;
					if ( ! ringed ) items.setMatrixAt( i, _m.compose( _v.set( gate.x, y + ITEM_UP, gate.z ), _q.setFromAxisAngle( _up, spin + i ), _s.set( ITEM * gone, ITEM * 1.4 * gone, ITEM * gone ) ) );
					if ( itemsOnly ) return;
					const wide = ( moonly ? 1.6 : 1 ) * BEAM * ( ringed ? 1 : 0.7 ) * ( gate === next ? NEXT_WIDE : 1 );
					// (A hoop's from its top up, so its middle's clear to fly through.)
					beams.setMatrixAt( i, _m.compose( _v.set( gate.x, hooped ? gate.y + radius : y, gate.z ), _q.identity(), _s.set( wide * gone, ( moonly ? 2 : 1 ) * BEAM_HIGH * gone, wide * gone ) ) );
					// Standing up, facing along the way to it; the next one breathing.
					const size = ring * gone * ( gate === next ? breathe : 1 );
					// A hoop at its own height, its route's radius round (a passed one gone, a missed one
					// left, dim, where it was missed).
					if ( hooped ) hoops.setMatrixAt( i, _m.compose( _v.set( gate.x, gate.y, gate.z ), _q.setFromAxisAngle( _up, gate.facing ), _s.setScalar( radius * ( gate.passed && ! gate.missed ? 0 : 1 ) * ( gate === next ? breathe : 1 ) ) ) );
					else if ( ringed ) rings.setMatrixAt( i, _m.compose( _v.set( gate.x, y + ring + 0.6, gate.z ), _q.setFromAxisAngle( _up, gate.facing ), _s.setScalar( size ) ) );

				} );
				if ( hooped ) {

					( shown.orbs ?? [] ).slice( 0, most ).forEach( ( orb, i ) => orbs.setMatrixAt( i, _m.compose( _v.set( orb.x, orb.y, orb.z ), _q.setFromAxisAngle( _up, spin + i ), _s.setScalar( orb.back > 0 ? 0 : ORB ) ) ) );
					orbs.instanceMatrix.needsUpdate = true;
					hoops.instanceMatrix.needsUpdate = true;

				}
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

					const colour = ! ordered ? STAR : gate.missed ? MISSED : i === shown.gates.length - 1 ? GOAL : gate.trick ? TRICK : gate === next ? NEXT : LATER;
					beams.setColorAt( i, colour );
					( gate.hoop ? hoops : ordered ? rings : items ).setColorAt( i, colour );

				} );
				for ( const mesh of [ beams, rings, items, hoops ] ) if ( mesh.instanceColor ) mesh.instanceColor.needsUpdate = true;
				this.place( shown );

			},
			// Items turn; the next ring breathes; the course is laid and its light runs on.
			update( shown, dt ) {

				if ( ! added() ) return;
				if ( shown.challenge.kind === 'collect' ) {

					spin = ( spin + dt * SPIN ) % ( Math.PI * 2 );
					this.place( shown, true );

				} else if ( shown.challenge.kind === 'hoops' ) {

					// Its orbs turn and its next hoop breathes: placed again (32 at most each).
					spin = ( spin + dt * SPIN ) % ( Math.PI * 2 );
					pulse = ( pulse + dt * PULSE_RATE ) % ( Math.PI * 2 );
					if ( shown.phase !== 'stopped' ) this.place( shown );

				} else if ( shown.phase !== 'done' ) {

					pulse = ( pulse + dt * PULSE_RATE ) % ( Math.PI * 2 );
					const index = shown.gates.findIndex( gate => ! gate.passed );
					if ( index >= 0 ) {

						rings.getMatrixAt( index, _m );
						_m.decompose( _v, _q, _s );
						const ring = Math.min( RING, shown.challenge.route.radius * 0.5 );
						rings.setMatrixAt( index, _m.compose( _v, _q, _s.setScalar( ring * ( 1 + NEXT_PULSE * Math.sin( pulse ) ) ) ) );
						rings.instanceMatrix.needsUpdate = true;

					}

				}

				this.course( shown, dt );

			},
			// The course on another world's ground to the next gate (see CHEVRON_GAP), laid again when
			// the next one changes or the car's moved COURSE_MOVE m, its wave of light moved on each
			// frame.
			course( shown, dt ) {

				const ground = app.bodies?.[ shown.challenge.world ];
				const target = shown.phase === 'done' || shown.phase === 'stopped' || shown.challenge.world === EARTH ? null : nextGate( app.driver );
				if ( ! target || ! ground?.heightAt ) {

					chevrons.count = 0;
					laidFor = null;
					return;

				}

				const d = app.driver;
				const car = { x: - d.east, z: d.north };
				if ( ! laidFor || laidFor.target !== target || Math.hypot( car.x - laidFor.x, car.z - laidFor.z ) > COURSE_MOVE ) {

					this.lay( shown, target, car );
					laidFor = { target, ...car };

				}

				wave = ( wave + dt / WAVE_TIME ) % 1;
				laid.forEach( ( chevron, i ) => {

					// A crest running toward the gate: brightest where (distance / WAVE + time) is whole.
					const phase = ( chevron.to / WAVE + wave ) % 1;
					const light = 0.4 + 0.5 * Math.max( 0, Math.cos( phase * Math.PI * 2 ) ) ** 3;
					_colour.copy( chevron.dim ? LATER : chevron.goal ? GOAL : NEXT ).multiplyScalar( chevron.dim ? 0.5 : light );
					chevrons.setColorAt( i, _colour );

				} );
				if ( chevrons.instanceColor ) chevrons.instanceColor.needsUpdate = true;

			},
			lay( shown, target, car ) {

				// The world's own ground (body.js), whose heights the chevrons lie on.
				const ground = app.bodies[ shown.challenge.world ];
				const ordered = shown.challenge.kind !== 'collect';
				const { start } = shown.challenge.route;
				const index = shown.gates.indexOf( target );
				// The leg to it: from the gate before, or the start; a star from the car.
				const from = ! ordered ? latLonOf( app.globe, car.x, app.driver.y, car.z ) : index ? shown.gates[ index - 1 ] : start;
				laid = [];
				const legs = [ { from, to: target, dim: false, goal: ordered && index === shown.gates.length - 1 } ];
				if ( ordered && index + 1 < shown.gates.length ) legs.push( { from: target, to: shown.gates[ index + 1 ], dim: true, goal: false } );
				for ( const leg of legs ) {

					// Its ends on the ground, as the gates are: from points at height 0 a leg deep in a
					// basin would point elsewhere, the more so under a level up leaning from the
					// sphere's (Vesta's, level.js).
					const a = sceneOf( app.globe, leg.from.lat, leg.from.lon, ground.heightAt( leg.from.lat, leg.from.lon ) ?? 0 ).clone();
					const b = sceneOf( app.globe, leg.to.lat, leg.to.lon, ground.heightAt( leg.to.lat, leg.to.lon ) ?? 0 );
					const length = Math.hypot( b.x - a.x, b.z - a.z );
					if ( length < 1 ) continue;
					const angle = Math.atan2( b.x - a.x, b.z - a.z );
					// How far along the leg the car is (from its gate), so the bright ones start at the car.
					const carTo = leg.dim ? length : Math.max( 0, Math.min( length, ( ( b.x - car.x ) * ( b.x - a.x ) + ( b.z - car.z ) * ( b.z - a.z ) ) / length ) );
					// Not on the gate's own zone, where the ring is.
					const first = Math.max( CHEVRON_GAP, shown.challenge.route.radius * 0.6 );
					for ( let to = first; to < length; to += CHEVRON_GAP ) {

						if ( laid.length >= COURSE_MOST ) break;
						if ( leg.dim ? length - to > PREVIEW_REACH : to > carTo || carTo - to > COURSE_REACH ) continue;
						const t = 1 - to / length;
						// (Across the 180th meridian the short way round, not the long way back.)
						const lat = leg.from.lat + ( leg.to.lat - leg.from.lat ) * t;
						const lon = leg.from.lon + ( ( leg.to.lon - leg.from.lon + 540 ) % 360 - 180 ) * t;
						const at = sceneOf( app.globe, lat, lon, ( ground.heightAt( lat, lon ) ?? 0 ) + CHEVRON_UP );
						chevrons.setMatrixAt( laid.length, _m.compose( at, _q.setFromAxisAngle( _up, angle ), _s.setScalar( CHEVRON ) ) );
						laid.push( { to, dim: leg.dim, goal: leg.goal } );

					}

				}

				chevrons.count = laid.length;
				chevrons.instanceMatrix.needsUpdate = true;
				chevrons.boundingSphere = null;

			},
		};

	}

}

// Every world, in a sentence: "the Earth, the Moon, Mars, Vesta and Ceres".
function worldList() {

	const names = WORLD_IDS.map( world => WORLDS[ world ].the );
	return `${ names.slice( 0, - 1 ).join( ', ' ) } and ${ names.at( - 1 ) }`;

}

// The latitude and longitude (degrees) of a point in the scene ({ lat, lon }), on the world the globe is on.
function latLonOf( globe, x, y, z ) {

	globe.earth.updateWorldMatrix( true, false );
	_inverse.copy( globe.earth.matrixWorld ).invert();
	globe.ellipsoid.getPositionToCartographic( _w.set( x, y, z ).applyMatrix4( _inverse ), _carto );
	return { lat: _carto.lat * MathUtils.RAD2DEG, lon: _carto.lon * MathUtils.RAD2DEG };

}

// Where ( lat, lon ) at `height` m over the ellipsoid is in the scene, on the world the globe is on
// (its frame is recentred on the place driven: main.js).
function sceneOf( globe, lat, lon, height ) {

	globe.earth.updateWorldMatrix( true, false );
	globe.ellipsoid.getCartographicToPosition( lat * MathUtils.DEG2RAD, lon * MathUtils.DEG2RAD, height, _v );
	return _v.applyMatrix4( globe.earth.matrixWorld );

}

// The marker over the next gate on the screen: a diamond with how far it is under it, and an arrow
// pointing to it when it's held at the screen's edge.
function makeMarker( parent ) {

	const root = document.createElement( 'div' );
	root.className = 'ch-marker';
	root.hidden = true;
	root.setAttribute( 'aria-hidden', 'true' );
	root.innerHTML = '<span class="ch-marker-pointer"><svg viewBox="0 0 20 20" width="18" height="18"><path d="M10 1 17 13H3z" fill="currentColor"/></svg></span><span class="ch-marker-diamond"></span><span class="ch-marker-dist"></span>';
	parent.append( root );
	return { root, dist: root.querySelector( '.ch-marker-dist' ), pointer: root.querySelector( '.ch-marker-pointer' ) };

}

function makeHud( parent ) {

	const root = document.createElement( 'div' );
	root.className = 'ch-hud';
	root.hidden = true;
	root.innerHTML = `<span class="ch-arrow" aria-hidden="true"><svg viewBox="0 0 20 20" width="22" height="22"><path d="M10 2 17 16 10 12.5 3 16z" fill="currentColor"/></svg></span><span class="ch-dist"></span><span class="ch-clock">0:00.00</span><span class="ch-gates"></span><span class="ch-split" role="status" hidden></span><button type="button" class="ch-ghost-toggle" aria-pressed="true" hidden>${ GHOST_ICON }<span>Ghost</span></button><div class="ch-course" hidden><span class="ch-dots" aria-hidden="true"></span><span class="ch-carve" aria-hidden="true"></span><span class="ch-tank" role="meter" aria-label="Boost" aria-valuemin="0" aria-valuemax="5"><b>Boost</b><i></i><i></i><i></i><i></i><i></i></span></div>`;
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
