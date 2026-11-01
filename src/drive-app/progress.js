import { postProgress, postTitle } from './api.js';
import {
	DAILY_KM, DISCOVER_KM, SUPPORTER_XP, XP,
	areaOf, dailyXp, dayBefore, dayOf, drivingXp, emptyReport, levelOf, progressOf, rewardsBetween, spotAt, titleOf, trickXp,
} from './levels.js';
import { storage } from './places.js';
import { isPro } from './pro.js';

// The page's side of levels (levels.js, docs/world-drive.md): what's driven, counted as it's
// driven (km, air, drift boosts, pads, minutes with others, new areas and spots, the day's first
// drive), reported to the Worker every couple of minutes and as the drive pauses or ends
// (worker/drive/progress.js, which caps it and keeps the XP with the leaderboard player), and the
// level that comes of it, which the Garage's locks follow (getLevel, onLevelChange; as pro.js is
// for the pass).
//
// Before there's a nickname there's no player to keep it with, so it's kept in this browser and
// shown all the same; picking a nickname claims it (the next report carries everything driven
// before, which the Worker caps as it does any report). Without a Worker (the dev server alone)
// it's only ever this browser's. The XP shown is the Worker's last word plus what's been driven
// since, worked out by the same rules; the Worker's next answer puts it right.

const KEY = 'world-drive.progress';
// Report every REPORT_EVERY ms while driving (and as the drive pauses, ends or the page goes).
const REPORT_EVERY = 120000;
// After a report that didn't get through, wait RETRY ms.
const RETRY = 30000;
// What's driven is told in a small "+46 XP · 1.4 km" every POP_EVERY s of driving, when it's at
// least POP_LEAST XP; a new area, a spot, the day's bonus and a trick at once.
const POP_EVERY = 10;
const POP_LEAST = 5;
// Where the car is looked at for areas and spots, every LOOK_EVERY s; a spot counts once you've
// driven SPOT_KM there.
const LOOK_EVERY = 1;
const SPOT_KM = 0.1;
// Discoveries remembered in this browser (the Worker keeps them too, and says which it took).
const KNOWN_MAX = 2000;

// --- the level, for the Garage's locks ---------------------------------------------------------

let level = 1;
const listeners = new Set();

export function getLevel() {

	return level;

}

// fn( level, previous ) whenever it changes. Returns a function that stops listening.
export function onLevelChange( fn ) {

	listeners.add( fn );
	return () => listeners.delete( fn );

}

function setLevel( next ) {

	if ( next === level ) return;
	const previous = level;
	level = next;
	for ( const fn of listeners ) {

		// One listener going wrong mustn't keep the others (or the game) from hearing of it.
		try {

			fn( level, previous );

		} catch ( err ) {

			console.error( err );

		}

	}

}

// --- progress ----------------------------------------------------------------------------------

// worker: whether there's a Worker to report to; visit(): this visit's token (none on the test
// pad, or once it has run out); player(): the leaderboard player, { id, secret, name } or null;
// onChange(): what's shown has changed (XP, level, title); onPop( { text, kind } ): something to
// say over the drive; onLevelUp( { level, from, rewards, nickname } ): a level reached (nickname:
// there's no player to keep it with yet, and one could be picked now).
export function createProgress( { worker, visit = () => null, player = () => null, onChange = () => {}, onPop = () => {}, onLevelUp = () => {} } ) {

	const saved = load();
	// What the Worker last said, for the player it's for: { id, xp, title, supporter, streakDay }.
	let server = saved.server;
	// Progress before a nickname: { xp, streakDay, streak, totals: everything driven (a REPORT,
	// with trick XP in it), for the claim }.
	let local = saved.local;
	// Places driven, as far as this browser knows: { id (the player's, or '' before one), places }.
	let known = saved.known;
	// What's been driven since the last report (or, before a nickname, since it was last added in).
	let unsent = saved.unsent;
	// The level celebrated last, and for whom; whether the nickname has been asked for.
	let seen = saved.seen;
	let asked = saved.asked;

	let sending = false;
	let gone = null;
	let reportedAt = Date.now();
	let retryAt = 0;
	let ended = false;
	// Driving: the drift boost last seen, the area the car is in and how far it's been driven there,
	// km driven since the drop-in, the day's km, and what's been told since the last pop.
	let boost = null;
	let area = null;
	let areaKm = 0;
	let dropKm = 0;
	let day = { day: '', km: 0 };
	let looked = 0;
	let popped = 0;
	let shown = 0;
	let told = emptyReport();
	// Trick runs before a nickname: the XP each run has had (the leaderboard's scores give the
	// rest, scores.js).
	let run = { entry: null, seconds: 0, xp: 0 };

	const who = () => player()?.id ?? '';
	const today = () => dayOf( Date.now() );

	// --- what's shown ---

	// The XP the Worker has (and this browser's from before a nickname, until it's claimed), plus
	// what's been driven since, by the same rules.
	function xp() {

		const base = ( who() && server?.id === who() ? server.xp : 0 ) + local.xp;
		return base + Math.round( estimate( unsent ) );

	}

	function multiplier() {

		return ( who() ? server?.id === who() && server.supporter : isPro() ) ? SUPPORTER_XP : 1;

	}

	// What a report is worth, before the Worker's caps.
	function estimate( report ) {

		const places = report.areas.length * XP.area + report.spots.length * XP.spot;
		const daily = report.daily ? dailyXp( streakToday() ) : 0;
		return ( drivingXp( report ) + places + daily + report.tricks ) * multiplier();

	}

	// The streak today's bonus would be for, as far as this browser knows.
	function streakToday() {

		const was = who() ? server?.id === who() ? server : null : local;
		if ( ! was?.streakDay ) return 1;
		return was.streakDay === dayBefore( today() ) ? ( was.streak ?? 0 ) + 1 : 1;

	}

	function dailyDone() {

		const was = who() ? server?.id === who() ? server : null : local;
		return was?.streakDay === today();

	}

	function title() {

		return titleOf( levelOf( xp() ), who() && server?.id === who() ? server.title : '' );

	}

	// After anything that changes the XP: the level, a level-up to celebrate, and what's shown, and
	// kept (unless `persist` is false: each frame of driving).
	function changed( { persist = true } = {} ) {

		const now = levelOf( xp() );
		setLevel( now );
		const id = who() || 'local';
		if ( seen.id !== id ) seen = { id, level: now };
		else if ( now > seen.level ) {

			const from = seen.level;
			seen = { id, level: now };
			const nickname = ! who() && worker && !! visit() && ! asked;
			if ( nickname ) asked = true;
			onLevelUp( { level: now, from, rewards: rewardsBetween( from, now ), nickname } );

		}

		if ( persist ) save();
		onChange();

	}

	// --- driving ---

	// Each frame while driving: dt (s), speed (m/s, as driven, on the ground or flying), air (in
	// the air off a jump), boost (the drift boost on, drive.js's, or null), together (others are
	// driving in this room), where(): { lat, lon }, where the car is (degrees), asked once a second.
	function drive( dt, { speed, air, boost: drifted, together, where } ) {

		const km = Math.min( speed, 200 ) * dt / 1000;
		unsent.km += km;
		areaKm += km;
		dropKm += km;
		if ( day.day !== today() ) day = { day: today(), km: 0 };
		day.km += km;
		if ( air ) unsent.air += dt;
		if ( drifted && drifted !== boost ) unsent.drifts ++;
		boost = drifted;
		if ( together ) unsent.together += dt / 60;
		if ( ! unsent.daily && day.km >= DAILY_KM && ! dailyDone() ) {

			unsent.daily = true;
			const streak = streakToday();
			pop( `Daily bonus +${ Math.round( dailyXp( streak ) * multiplier() ) } XP${ streak > 1 ? ` · ${ streak } days in a row` : '' }`, 'bonus' );

		}

		looked += dt;
		if ( looked >= LOOK_EVERY ) {

			looked = 0;
			const { lat, lon } = where();
			if ( Number.isFinite( lat ) && Number.isFinite( lon ) ) discover( lat, lon );

		}

		popped += dt;
		if ( popped >= POP_EVERY ) {

			popped = 0;
			popDriving();

		}

		if ( Date.now() - reportedAt >= REPORT_EVERY && Date.now() >= retryAt ) report();
		// What's shown, four times a second.
		shown += dt;
		if ( shown >= 0.25 ) {

			shown = 0;
			changed( { persist: false } );

		}

	}

	// A new area once DISCOVER_KM has been driven in it; a start spot once SPOT_KM has been driven
	// since the drop-in, within its reach.
	function discover( lat, lon ) {

		const here = areaOf( lat, lon );
		if ( here !== area ) {

			area = here;
			areaKm = 0;

		}

		if ( areaKm >= DISCOVER_KM && ! knows( here ) && ! unsent.areas.includes( here ) ) {

			unsent.areas.push( here );
			pop( `New area +${ Math.round( XP.area * multiplier() ) } XP`, 'bonus' );
			changed();

		}

		const spot = dropKm >= SPOT_KM ? spotAt( lat, lon ) : null;
		if ( spot && ! knows( `spot:${ spot.id }` ) && ! unsent.spots.includes( spot.id ) ) {

			unsent.spots.push( spot.id );
			pop( `${ spot.name } +${ Math.round( XP.spot * multiplier() ) } XP`, 'bonus' );
			changed();

		}

	}

	function knows( place ) {

		return known.id === who() && known.places.includes( place );

	}

	// "+46 XP · 1.4 km · 6 s air": what's been driven since the last of these.
	function popDriving() {

		const since = {};
		for ( const field of [ 'km', 'air', 'drifts', 'pads', 'together' ] ) since[ field ] = Math.max( 0, unsent[ field ] - told[ field ] );
		const gained = Math.round( drivingXp( since ) * multiplier() );
		if ( gained < POP_LEAST ) return;
		told = { ...told, ...unsentDriving() };
		const parts = [ `+${ gained } XP` ];
		if ( since.km >= 0.05 ) parts.push( `${ since.km.toFixed( 1 ) } km` );
		if ( since.air >= 1 ) parts.push( `${ Math.round( since.air ) } s air` );
		if ( since.drifts ) parts.push( `${ since.drifts } drift boost${ since.drifts === 1 ? '' : 's' }` );
		if ( since.pads ) parts.push( `${ since.pads } pad${ since.pads === 1 ? '' : 's' }` );
		pop( parts.join( ' · ' ), 'driving' );

	}

	function unsentDriving() {

		const { km, air, drifts, pads, together } = unsent;
		return { km, air, drifts, pads, together };

	}

	function pop( text, kind ) {

		try {

			onPop( { text, kind } );

		} catch ( err ) {

			console.warn( 'Levels:', err?.message );

		}

	}

	// A boost pad driven over (pads.js).
	function pad() {

		unsent.pads ++;

	}

	// A landed jump (drive.js's onScore): with a player, its XP comes as the leaderboard takes the
	// run's score (scoreXp); before a nickname, here, by the same rule. entry: the ride's (a new
	// one is a new run).
	function landed( { score, runSeconds }, entry ) {

		if ( who() ) return;
		if ( run.entry !== entry || runSeconds < run.seconds ) run = { entry, seconds: 0, xp: 0 };
		run.seconds = runSeconds;
		const gained = Math.max( 0, trickXp( score ) - run.xp );
		if ( ! gained ) return;
		run.xp += gained;
		unsent.tricks += gained;
		pop( `+${ Math.round( gained * multiplier() ) } XP · tricks`, 'tricks' );
		changed();

	}

	// The XP a run's score earned, as the Worker's answer to it says (api.js postScore's xp).
	function scoreXp( answer ) {

		if ( ! answer || ! Number.isFinite( answer.xp ) || ! who() ) return;
		took( answer );
		if ( answer.gained > 0 ) pop( `+${ answer.gained } XP · tricks`, 'tricks' );
		changed();

	}

	// A new drive (a drop-in): its own distance for spots.
	function dropped() {

		dropKm = 0;
		area = null;
		areaKm = 0;
		boost = null;

	}

	// --- reporting ---

	// Report what's been driven (or, before a nickname, add it in here). keepalive: the page is
	// going away.
	async function report( { keepalive = false } = {} ) {

		reportedAt = Date.now();
		const me = player();
		if ( ! me ) {

			addLocally();
			return;

		}

		const token = visit();
		const claim = hasLocal();
		if ( ! worker || ! token || ended || sending || gone === me.id ) {

			save();
			return;

		}

		// Before a nickname, everything driven then comes with this report: the claim.
		const sent = claim ? merge( local.totals, unsent ) : unsent;
		if ( claim ) sent.daily = unsent.daily || local.streakDay === today();
		if ( isEmpty( sent ) && server?.id === me.id ) return;
		sending = true;
		const before = unsent;
		unsent = emptyReport();
		told = emptyReport();
		const answer = await postProgress( me, token, sent, { keepalive } );
		sending = false;
		if ( player()?.id !== me.id ) return;
		if ( answer.ok && Number.isFinite( answer.body.xp ) ) {

			took( answer.body );
			if ( claim ) local = freshLocal();
			// The places over the cap go with the next report.
			const accepted = answer.body.accepted ?? {};
			remember( [ ...( accepted.areas ?? [] ), ...( accepted.spots ?? [] ).map( id => `spot:${ id }` ) ] );
			unsent.areas.push( ...sent.areas.filter( place => ! accepted.areas?.includes( place ) && ! unsent.areas.includes( place ) ) );
			unsent.spots.push( ...sent.spots.filter( id => ! accepted.spots?.includes( id ) && ! unsent.spots.includes( id ) ) );
			if ( answer.body.daily ) server.streakDay = today();
			if ( answer.body.daily ) server.streak = answer.body.daily.streak;
			retryAt = 0;

		} else {

			// Kept for the next report (or for nothing: one the Worker won't take). A visit run out
			// reports no more; nor does a player that's gone (the owner removed it: the leaderboard
			// asks for a new name as it next posts).
			if ( answer.status === 403 && answer.body.reason === 'visit' ) ended = true;
			else if ( answer.status === 403 ) gone = me.id;
			if ( answer.status !== 400 ) unsent = merge( before, unsent );
			retryAt = Date.now() + Math.max( RETRY, answer.retryAfter * 1000 );

		}

		changed();

	}

	// Before a nickname: what's been driven, added to this browser's progress.
	function addLocally() {

		if ( isEmpty( unsent ) ) return;
		const streak = streakToday();
		local.xp += Math.round( estimate( unsent ) );
		local.totals = merge( local.totals, unsent );
		if ( unsent.daily ) Object.assign( local, { streakDay: today(), streak } );
		remember( [ ...unsent.areas, ...unsent.spots.map( id => `spot:${ id }` ) ] );
		unsent = emptyReport();
		told = emptyReport();
		changed();

	}

	// The Worker's word on where the player stands.
	function took( body ) {

		const me = player();
		const was = server?.id === me.id ? server : { streakDay: '', streak: 0 };
		server = { ...was, id: me.id, xp: body.xp, title: typeof body.title === 'string' ? body.title : was.title ?? '', supporter: body.supporter === true };

	}

	function remember( places ) {

		if ( known.id !== who() ) known = { id: who(), places: [] };
		for ( const place of places ) if ( ! known.places.includes( place ) ) known.places.push( place );
		known.places = known.places.slice( - KNOWN_MAX );

	}

	function hasLocal() {

		return local.xp > 0 || ! isEmpty( local.totals );

	}

	// Where the player stands, from the Worker, without reporting anything (an empty report): as
	// the page starts, and once the player is linked to an account (whose players count together).
	async function refresh() {

		const me = player();
		const token = visit();
		if ( ! me || ! worker || ! token || ended ) return;
		if ( hasLocal() ) return report();
		const answer = await postProgress( me, token, emptyReport() );
		if ( answer.ok && Number.isFinite( answer.body.xp ) && player()?.id === me.id ) {

			took( answer.body );
			changed();

		} else if ( answer.status === 403 && answer.body.reason === 'visit' ) ended = true;

	}

	// The title on the nametag: an id in levels.js's TITLES that the player has ('' for the
	// newest). True if it worked.
	async function setTitle( id ) {

		const me = player();
		if ( ! me || ! worker ) return false;
		const answer = await postTitle( me, id );
		if ( ! answer.ok || player()?.id !== me.id ) return false;
		if ( server?.id === me.id ) server.title = id;
		changed();
		return true;

	}

	function save() {

		storage( () => localStorage.setItem( KEY, JSON.stringify( { server, local, known, unsent, seen, asked } ) ) );

	}

	// The page going away: what's been driven goes with it (fetch with keepalive gets there after
	// the page has gone; sendBeacon can't say it's JSON).
	window.addEventListener( 'pagehide', () => {

		if ( player() ) report( { keepalive: true } );
		else addLocally();
		save();

	} );

	return {
		// Once whatever shows it is ready: what's shown, and where the player stands by the Worker.
		start() {

			changed();
			refresh();

		},
		drive,
		pad,
		landed,
		scoreXp,
		dropped,
		report,
		refresh,
		setTitle,
		// Where the shown XP is on the way to the next level (levels.js's progressOf).
		get progress() {

			return progressOf( xp() );

		},
		get level() {

			return levelOf( xp() );

		},
		get title() {

			return title();

		},
		// The title picked ('' for the newest), with a player.
		get chosenTitle() {

			return who() && server?.id === who() ? server.title ?? '' : '';

		},
		// Whether it's this browser's alone (no nickname yet).
		get local() {

			return ! who();

		},
		get supporter() {

			return multiplier() > 1;

		},
		get unsent() {

			return unsent;

		},
	};

}

// --- kept in this browser ----------------------------------------------------------------------

function freshLocal() {

	return { xp: 0, streakDay: '', streak: 0, totals: emptyReport() };

}

// What's kept, with anything damaged or missing as new.
function load() {

	const kept = storage( () => JSON.parse( localStorage.getItem( KEY ) ) );
	const state = kept && typeof kept === 'object' ? kept : {};
	const report = value => ( { ...emptyReport(), ...( value && typeof value === 'object' ? value : {} ) } );
	const server = state.server && typeof state.server.id === 'string' && Number.isFinite( state.server.xp ) ? state.server : null;
	const local = state.local && Number.isFinite( state.local.xp ) ? { ...freshLocal(), ...state.local, totals: report( state.local.totals ) } : freshLocal();
	const known = state.known && typeof state.known.id === 'string' && Array.isArray( state.known.places ) ? state.known : { id: '', places: [] };
	const unsent = report( state.unsent );
	for ( const list of [ 'areas', 'spots' ] ) if ( ! Array.isArray( unsent[ list ] ) ) unsent[ list ] = [];
	for ( const list of [ 'areas', 'spots' ] ) if ( ! Array.isArray( local.totals[ list ] ) ) local.totals[ list ] = [];
	const seen = state.seen && typeof state.seen.id === 'string' && Number.isInteger( state.seen.level ) ? state.seen : { id: '', level: 0 };
	return { server, local, known, unsent, seen, asked: state.asked === true };

}

// Two reports as one.
function merge( a, b ) {

	const sum = emptyReport();
	for ( const field of [ 'km', 'air', 'drifts', 'pads', 'together', 'tricks' ] ) sum[ field ] = ( a[ field ] || 0 ) + ( b[ field ] || 0 );
	sum.areas = [ ...new Set( [ ...a.areas, ...b.areas ] ) ].slice( - 200 );
	sum.spots = [ ...new Set( [ ...a.spots, ...b.spots ] ) ];
	sum.daily = a.daily || b.daily;
	return sum;

}

function isEmpty( report ) {

	return ! report.daily && ! report.areas.length && ! report.spots.length && [ 'km', 'air', 'drifts', 'pads', 'together', 'tricks' ].every( field => ! ( report[ field ] > 0 ) );

}
