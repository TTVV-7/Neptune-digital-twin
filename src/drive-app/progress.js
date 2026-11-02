import { postProgress, postTitle } from './api.js';
import {
	DAILY_KM, DISCOVERIES_MAX, DISCOVER_KM, REPORT_PLACES, SUPPORTER_XP, XP,
	areaOf, dailyXp, dayBefore, dayOf, drivingXp, emptyReport, isEmptyReport as isEmpty, levelOf, progressOf, rewardsBetween, spotAt, titleOf, trickXp,
} from './levels.js';
import { storage } from './places.js';
import { isPro } from './pro.js';

// The page's side of levels (levels.js, docs/world-drive.md): what's driven, counted as it's
// driven (km, air, drift boosts, pads, minutes with others, landed trick runs, new areas and spots,
// the day's first drive), reported to the Worker every couple of minutes and as the drive pauses or
// ends (worker/drive/progress.js, which caps it and keeps the XP with the leaderboard player), and
// the level that comes of it, which the Garage's locks follow (getLevel, onLevelChange; as pro.js
// is for the pass).
//
// Before there's a nickname there's no player to keep it with, so it's kept in this browser and
// shown all the same; picking a nickname claims it (the next report carries everything driven
// before, the days' bonuses with it, which the Worker caps as it does any report). Without a Worker
// (the dev server alone) it's only ever this browser's. The XP shown is the Worker's last word plus
// what's been driven since (the report on its way included), worked out by the same rules; the
// Worker's next answer puts it right. Each report has an id and is kept until its answer comes, so
// one whose answer never came (the page went, or the connection dropped) goes again as it was and
// the Worker counts it once.

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
	// What the Worker last said, for the player it's for: { id, xp (the account's best), own (the
	// player's), title (the one picked, '' for the newest), supporter, streakDay, streak }.
	let server = saved.server;
	// Progress before a nickname: { xp, bonus (the days' bonuses in it, without the pass's +50%),
	// streakDay, streak, totals: everything driven (a REPORT), for the claim }.
	let local = saved.local;
	// Places driven, as far as this browser knows: { id (the player's, or '' before one), places }.
	let known = saved.known;
	// What's been driven since the last report (or, before a nickname, since it was last added in).
	let unsent = saved.unsent;
	// The report on its way, until its answer comes: { id, player, sent (as sent, with its id),
	// before (what of `unsent` it carries), later (areas over a report's REPORT_PLACES, for the
	// next), claim }. Kept in this browser, so one the page went before hearing of goes again.
	let flying = saved.flying;
	// The level celebrated last, and for whom; whether the nickname has been asked for.
	let seen = saved.seen;
	let asked = saved.asked;

	let sending = false;
	// Where the player stands was asked while a report was on its way: asked again after it.
	let askAgain = false;
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
	// The trick run going on: its ride (entry), how long it's lasted and the XP it's had.
	let run = { entry: null, seconds: 0, xp: 0 };

	const who = () => player()?.id ?? '';
	const today = () => dayOf( Date.now() );

	// --- what's shown ---

	// The XP shown: the player's own by the Worker (and this browser's from before a nickname, until
	// it's claimed), plus what's been driven since and what's on its way, by the same rules; or the
	// account's best, if another of its players has more.
	function xp() {

		const mine = flying?.player === who() ? estimate( flying.before ) : 0;
		const own = local.xp + Math.round( estimate( unsent ) + mine );
		return who() && server?.id === who() ? Math.max( server.xp, ( server.own ?? server.xp ) + own ) : own;

	}

	// The pass's +50% by the Worker's word for a player (until it's had, the pass here, as before the
	// nickname).
	function multiplier() {

		return ( who() && server?.id === who() ? server.supporter : isPro() ) ? SUPPORTER_XP : 1;

	}

	// What a report is worth, before the Worker's caps.
	function estimate( report ) {

		const places = report.areas.length * XP.area + report.spots.length * XP.spot;
		const daily = report.daily ? dailyXp( streakToday() ) : 0;
		return ( drivingXp( report ) + places + daily + report.tricks ) * multiplier();

	}

	// Where the daily bonus stands: the Worker's word for a player, and this browser's before a
	// nickname (and after it, until the claim's answer).
	function days() {

		if ( ! who() ) return local;
		if ( server?.id === who() ) return server;
		return hasLocal() ? local : null;

	}

	// The streak today's bonus would be for, as far as this browser knows.
	function streakToday() {

		const was = days();
		if ( ! was?.streakDay ) return 1;
		return was.streakDay === dayBefore( today() ) ? ( was.streak ?? 0 ) + 1 : 1;

	}

	// Today's bonus is had, or on its way.
	function dailyDone() {

		return days()?.streakDay === today() || ( flying?.player === who() && flying.before.daily );

	}

	// Whether a place is in the report on its way.
	function onItsWay( list, place ) {

		return flying?.player === who() && ( flying.sent[ list ].includes( place ) || ( list === 'areas' && flying.later.includes( place ) ) );

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
		// A drift boost paid out (they have a kick; a landed trick's boost hasn't).
		if ( drifted && drifted !== boost && 'kick' in drifted ) unsent.drifts ++;
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

		if ( areaKm >= DISCOVER_KM && ! knows( here ) && ! unsent.areas.includes( here ) && ! onItsWay( 'areas', here ) ) {

			unsent.areas.push( here );
			pop( `New area +${ Math.round( XP.area * multiplier() ) } XP`, 'bonus' );
			changed();

		}

		const spot = dropKm >= SPOT_KM ? spotAt( lat, lon ) : null;
		if ( spot && ! knows( `spot:${ spot.id }` ) && ! unsent.spots.includes( spot.id ) && ! onItsWay( 'spots', spot.id ) ) {

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

	// A landed jump (drive.js's onScore): what the run's new points add to its XP (levels.js's
	// trickXp), reported with the rest, whether the leaderboard takes the run or not. entry: the
	// ride's (a new one is a new run).
	function landed( { score, runSeconds }, entry ) {

		if ( run.entry !== entry || runSeconds < run.seconds ) run = { entry, seconds: 0, xp: 0 };
		run.seconds = runSeconds;
		const gained = Math.max( 0, trickXp( score ) - run.xp );
		if ( ! gained ) return;
		run.xp += gained;
		unsent.tricks += gained;
		pop( `+${ Math.round( gained * multiplier() ) } XP · tricks`, 'tricks' );
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
		if ( ! worker || ! token || ended || sending || gone === me.id ) {

			save();
			return;

		}

		// One on its way for another player (one that's gone): what it carried is this one's.
		if ( flying && flying.player !== me.id ) {

			unsent = merge( flying.before, unsent );
			flying = null;

		}

		// A report whose answer never came goes again as it was, with its id, and the Worker counts it
		// once. Otherwise what's been driven since the last; and the first time, the claim: everything
		// driven before the nickname, with the days' bonuses counted then.
		if ( ! flying ) {

			const claim = hasLocal();
			const sent = merge( claim ? local.totals : emptyReport(), unsent );
			if ( claim ) sent.days = { xp: local.bonus, streak: local.streak, day: local.streakDay };
			if ( isEmpty( sent ) && server?.id === me.id ) return;
			// At most REPORT_PLACES areas a report: the rest go with the next.
			const later = sent.areas.slice( REPORT_PLACES );
			sent.areas = sent.areas.slice( 0, REPORT_PLACES );
			sent.id = reportId();
			flying = { id: sent.id, player: me.id, sent, before: unsent, later, claim };
			unsent = emptyReport();
			told = emptyReport();

		}

		sending = true;
		const was = flying;
		save();
		const answer = await postProgress( me, token, was.sent, { keepalive } );
		sending = false;
		if ( player()?.id !== me.id ) {

			// Another player now: what wasn't counted is theirs.
			if ( flying === was ) flying = null;
			if ( ! answer.ok ) unsent = merge( was.before, unsent );
			save();
			return;

		}

		if ( answer.ok && Number.isFinite( answer.body.xp ) ) {

			flying = null;
			took( answer.body );
			if ( was.claim ) local = freshLocal();
			// The places it took are known; those over the cap go with the next report. (Sent again,
			// it was taken the first time, places and all.)
			const accepted = answer.body.repeated ? { areas: was.sent.areas, spots: was.sent.spots } : answer.body.accepted ?? {};
			remember( [ ...( accepted.areas ?? [] ), ...( accepted.spots ?? [] ).map( id => `spot:${ id }` ) ] );
			const areas = [ ...was.sent.areas.filter( place => ! accepted.areas?.includes( place ) ), ...was.later ];
			unsent.areas.push( ...areas.filter( place => ! unsent.areas.includes( place ) ) );
			unsent.spots.push( ...was.sent.spots.filter( id => ! accepted.spots?.includes( id ) && ! unsent.spots.includes( id ) ) );
			retryAt = 0;
			if ( askAgain ) {

				askAgain = false;
				refresh();

			}

		} else {

			// No answer at all: it may have been counted, so it goes again as it is (the Worker knows
			// its id). Otherwise it wasn't: kept for the next report (or for nothing: one the Worker
			// won't take). A visit run out reports no more; nor does a player that's gone (the owner
			// removed it: the leaderboard asks for a new name as it next posts).
			if ( answer.status === 403 && answer.body.reason === 'visit' ) ended = true;
			else if ( answer.status === 403 ) gone = me.id;
			if ( answer.status !== 0 ) {

				flying = null;
				if ( answer.status !== 400 ) unsent = merge( was.before, unsent );
				// A claim it won't take isn't asked again and again.
				else if ( was.claim ) local = freshLocal();

			}

			retryAt = Date.now() + Math.max( RETRY, answer.retryAfter * 1000 );

		}

		changed();

	}

	// Before a nickname: what's been driven, added to this browser's progress.
	function addLocally() {

		if ( isEmpty( unsent ) ) return;
		const streak = streakToday();
		local.xp += Math.round( estimate( unsent ) );
		// The days' bonuses go with the claim on their own (each day's is its own), not as a day.
		local.totals = merge( local.totals, { ...unsent, daily: false } );
		if ( unsent.daily ) Object.assign( local, { streakDay: today(), streak, bonus: local.bonus + dailyXp( streak ) } );
		remember( [ ...unsent.areas, ...unsent.spots.map( id => `spot:${ id }` ) ] );
		unsent = emptyReport();
		told = emptyReport();
		changed();

	}

	// The Worker's word on where the player stands.
	function took( body ) {

		const me = player();
		const was = server?.id === me.id ? server : { title: '', streakDay: '', streak: 0 };
		server = {
			id: me.id,
			xp: body.xp,
			own: Number.isFinite( body.own ) ? body.own : body.xp,
			// The title picked ('' for the newest they have), not the one it comes to.
			title: typeof body.chosen === 'string' ? body.chosen : was.title,
			supporter: body.supporter === true,
			streakDay: typeof body.streakDay === 'string' ? body.streakDay : was.streakDay,
			streak: Number.isInteger( body.streak ) ? body.streak : was.streak,
		};

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
		if ( sending ) {

			askAgain = true;
			return;

		}

		if ( hasLocal() || flying ) return report();
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

		storage( () => localStorage.setItem( KEY, JSON.stringify( { server, local, known, unsent, flying, seen, asked } ) ) );

	}

	// The page going away: what's been driven goes with it (fetch with keepalive gets there after
	// the page has gone; sendBeacon can't say it's JSON), and is kept here as on its way, so it goes
	// again next time if it didn't get there.
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
		// The report on its way, or null.
		get flying() {

			return flying;

		},
	};

}

// --- kept in this browser ----------------------------------------------------------------------

function freshLocal() {

	return { xp: 0, bonus: 0, streakDay: '', streak: 0, totals: emptyReport() };

}

// A report's id: the Worker keeps the last one's, so a report sent again is counted once.
function reportId() {

	return Array.from( crypto.getRandomValues( new Uint8Array( 16 ) ), byte => ( byte % 36 ).toString( 36 ) ).join( '' );

}

// What's kept, with anything damaged or missing as new.
function load() {

	const kept = storage( () => JSON.parse( localStorage.getItem( KEY ) ) );
	const state = kept && typeof kept === 'object' ? kept : {};
	const report = value => ( { ...emptyReport(), ...( value && typeof value === 'object' ? value : {} ) } );
	const server = state.server && typeof state.server.id === 'string' && Number.isFinite( state.server.xp ) ? state.server : null;
	const local = state.local && Number.isFinite( state.local.xp ) ? { ...freshLocal(), ...state.local, totals: report( state.local.totals ) } : freshLocal();
	if ( ! Number.isFinite( local.bonus ) ) local.bonus = 0;
	const known = state.known && typeof state.known.id === 'string' && Array.isArray( state.known.places ) ? state.known : { id: '', places: [] };
	const unsent = report( state.unsent );
	for ( const list of [ 'areas', 'spots' ] ) if ( ! Array.isArray( unsent[ list ] ) ) unsent[ list ] = [];
	for ( const list of [ 'areas', 'spots' ] ) if ( ! Array.isArray( local.totals[ list ] ) ) local.totals[ list ] = [];
	const seen = state.seen && typeof state.seen.id === 'string' && Number.isInteger( state.seen.level ) ? state.seen : { id: '', level: 0 };
	const way = state.flying;
	const flying = way && typeof way.id === 'string' && typeof way.player === 'string' && way.sent?.id === way.id && Array.isArray( way.sent.areas ) && Array.isArray( way.sent.spots )
		? { ...way, before: report( way.before ), later: Array.isArray( way.later ) ? way.later : [], claim: way.claim === true } : null;
	if ( flying ) for ( const list of [ 'areas', 'spots' ] ) if ( ! Array.isArray( flying.before[ list ] ) ) flying.before[ list ] = [];
	return { server, local, known, unsent, flying, seen, asked: state.asked === true };

}

// Two reports as one (as many areas as a player can have; a report sends REPORT_PLACES at a time).
function merge( a, b ) {

	const sum = emptyReport();
	for ( const field of [ 'km', 'air', 'drifts', 'pads', 'together', 'tricks' ] ) sum[ field ] = ( a[ field ] || 0 ) + ( b[ field ] || 0 );
	sum.areas = [ ...new Set( [ ...a.areas, ...b.areas ] ) ].slice( 0, DISCOVERIES_MAX );
	sum.spots = [ ...new Set( [ ...a.spots, ...b.spots ] ) ];
	sum.daily = a.daily || b.daily;
	return sum;

}
