import { HttpError, base64url, isObject, json, jsonText, readJson } from '../http.js';
import { cellMiddle, cellOf, checkCell, metresOn } from '../../src/drive-app/dropin-cells.js';
import {
	GRACE, KINDS, KIND_NAMES, PERIOD_KINDS, RANK_MOST, WORLDS, bearingTo, checkPasses, destination, formatTime, kindFor, makeRoute, nextPeriod, parsePeriod, periodIndex, periodOf, periodsAt,
	randomFrom, rankText, timeLeft,
} from '../../src/drive-app/challenge-rules.js';
import { GHOST_TEXT, ghostFault } from '../../src/drive-app/ghost-rules.js';
import { checkLook } from '../../src/drive-app/live-protocol.js';
import { hasHeights, heightAt as moonHeightAt, setHeights } from '../../src/drive-app/moon-height.js';
import { MOON_PLACES } from '../../src/drive-app/moon-places.js';
import { SPOTS } from '../../src/drive-app/places.js';
import { PLACES } from '../../drive/site/places.js';
import { adminAccount } from './admin.js';
import { dateOf } from './boards.js';
import { VISITOR_PREFIX, nameCell, topPlaces, townsFor } from './dropins.js';
import { cleanPlace } from './names.js';
import { PLAYER_ID, authenticate, credentials, database, takeTurn } from './players.js';
import { standingOf, xpOf } from './progress.js';
import { VEHICLES } from './scores.js';
import { addressOf, setting } from './settings.js';
import { hasPass, supporterEmails } from './supporter.js';
import { readVisit } from './visits.js';

// Challenges (docs/world-drive.md, "Challenges"): each UTC day, week (from Monday, as the
// leaderboard's) and calendar month, one challenge on the Earth and one on the Moon, six live at
// once, each a place and a route the same for everyone (src/drive-app/challenge-rules.js lays it
// out), each with its own board of each player's best time.
//
// Picking them: by themselves, in a rotation round the featured places (the start spots, the places'
// pages, the Moon's places) and the busy drop-in places the owner has approved (dropins.js: part 1's
// ranking can be pushed by anyone with many addresses, so nothing it ranks goes in without the
// owner's say). The order and each period's kind and route come from HMACs of the period's key with
// a key derived from the Worker's secret, so every Worker instance agrees and nobody can work out
// next week's from the code; and a period's place keeps clear of the places fixed in D1 for the
// periods live beside it and the one before (rotationPick), so that holds whatever changed since
// those were fixed. The owner can choose any period's challenge on either world by hand (the admin
// page, ADMIN_EMAILS only), and approve or unapprove busy places. A period's challenge is fixed in
// D1 the first time it's asked for, so nothing changing later (this code, the places, the
// approvals) changes a live one; the owner changing a live one starts a new board, the old one kept
// apart, after a warning (it changes what the times mean).
//
// Times: posted by the page as a run finishes, checked as scores are (scores.js): with a visit's
// token of the right kind (an Earth challenge needs an Earth visit; the Moon's takes any), from a
// player of the leaderboard's (id and secret), for a live challenge only, no longer than the visit
// has lasted, every point passed in order (collectibles in any) and no leg quicker than the fastest
// the game goes allows (challenge-rules.js's checkPasses), one every TIME_GAP from a player,
// CHALLENGE_TIMES_PER_VISIT from a visit (what one robot check buys, from whatever addresses its
// token is sent from) and CHALLENGE_TIMES_PER_VISITOR_DAILY a day from a visitor (DriveLimits, by
// the day's salt, an IPv6 visitor by its /48; a player whose visitor has had the day's is then held
// till midnight by their own gap, so their tries after it write nothing and ask DriveLimits
// nothing). Only each player's best is kept. The owner's runs (an 'o' visit) are taken and
// answered, but kept off the boards: the owner knows each place and kind before it's live, and
// chooses them.
//
// What a look costs is bounded whoever asks (docs/world-drive.md, "What challenges cost"): a rank is
// found in its board's order kept in Cloudflare's cache (boardOrders), never counted row by row, so a
// player's own rows cost a few rows read however many players a script asks as; a finished board,
// which can't change, is kept a day; and the looks that miss the cache and read D1 are held to
// CHALLENGE_MISSES a minute from an address.
//
// Ghosts and links (part 2b): each time is posted with its run's ghost (src/drive-app/ghost-rules.js:
// the car's path from GO to the finish, sampled and packed small), checked with it (the ghost must
// go through each point at its pass time, take as long as the time, and never go faster between two
// samples than the game can) and kept with the best, replaced with it, in challenge_ghosts, till
// the challenge is finished; so the next run can race it. Each time has a handle, an HMAC of the
// challenge and the player under the derived key (handleOf): what a "challenge a friend" link names
// it by, never the player's id. The link's own card (challengeLink, and linkPage: the page itself,
// with a preview for chat apps) and a ghost by its run (challengeGhost) are kept in Cloudflare's
// cache as the boards are, and held to the same looks.
//
// Settings, none of which need setting: CHALLENGE_TIMES_PER_VISITOR_DAILY (TIMES_DAILY),
// CHALLENGE_TIMES_PER_VISIT (TIMES_PER_VISIT); CHALLENGE_LOOKS, the rate limiter binding for the
// lists, the boards and the times posted, and CHALLENGE_MISSES for the lists and boards that read
// D1, both by a keyed hash of the address (an IPv6 one by its /48) that changes each day (looks);
// ADMIN_LOOKS the admin page's (admin.js).

// One time every TIME_GAP ms from a player; a visitor's times a day; a visit's times.
export const TIME_GAP = 10 * 1000;
const TIMES_DAILY = 300;
const TIMES_PER_VISIT = 100;
// How much longer (s) a run may say it lasted than its visit has (for clocks and frames). (And
// GRACE, challenge-rules.js's: how long after a challenge's period ends a run finished in it is
// still taken.)
const SLACK = 30;
// The same run posted again within REPOST ms of its being taken is answered as it was (its answer
// was lost on the way: the page tries again a few times, seconds apart), from Cloudflare's cache
// where that answer is kept; later, it's a post like any other (the gap, the visitor's day), so a
// script can't have the same board read over and over for nothing.
export const REPOST = 5 * 60 * 1000;
// The boards: the top TOP, the list's top LIST_TOP for each challenge, and the finish screen's
// FINISH_TOP. Kept in Cloudflare's cache as the leaderboard's are: a live challenge's board, the
// list's tops and each player's own rows CHALLENGE_CACHE s (a new best clears them in the one of
// Cloudflare's places it's posted in; elsewhere they're at most that behind), so the six live boards
// are read from D1 at most once a minute each in a place, whoever asks; a finished challenge's board
// FINISHED_CACHE s, as its times can't change (a name cleaned up on it shows within a day, or at
// once after a purge of the cache: the docs); and each board's order (boardOrders: the first
// RANK_MOST times, what a rank is found in) ORDER_KEPT s, a finished one's as long as its board.
const TOP = 20;
const LIST_TOP = 3;
const FINISH_TOP = 5;
const CHALLENGE_CACHE = 60;
const FINISHED_CACHE = 24 * 60 * 60;
const ORDER_KEPT = 10 * 60;
// The six live challenges are kept in each Worker instance's memory this long (ms), so a list asks
// D1 for them at most once a minute; a challenge the owner replaces is seen everywhere within it (a
// time posted for the old one is checked against D1 itself).
const LIVE_KEPT = 60 * 1000;
// The admin page's busy places (dropins.js's topPlaces over the last BUSY_DAYS), kept BUSY_KEPT ms.
const BUSY_DAYS = 30;
const BUSY_KEPT = 10 * 60 * 1000;
// A pick can be made for a period up to AHEAD days ahead; at most APPROVED places a world.
const AHEAD = 400;
const APPROVED = 100;
// The Moon's routes are checked on its own heights (moon-height.js, from the site's
// /moon/height.bin): each point (and a landmark's start) on ground sloping under MOON_SLOPE degrees
// across ±SLOPE_REACH m, so no gate is on a crater's wall; and each leg in its order (a sprint's,
// from the start through its gates; a landmark's, from the start to it), its heights every LEG_STEP
// m along the straight line, each stretch of LEG_REACH m rising or falling MOON_SLOPE degrees or more
// a fault, a point's counting POINT_FAULTS (a gate on a wall is worse than a wall on the way to it,
// which can be driven round or flown over). Craters smaller than MOON_DETAIL m are left out of the
// check (the car drives over them), which keeps a route's check to a few milliseconds.
const MOON_SLOPE = 20;
const SLOPE_REACH = 15;
const MOON_DETAIL = 30;
const LEG_STEP = 25;
const LEG_REACH = 100;
const POINT_FAULTS = 10;
// Places within NEAR m of each other (or with the same name) are one place to the rotation's rules:
// an owner's pick or an approved place there counts as the featured one.
const NEAR = 1000;
const SEED_LABEL = 'world-drive challenges v1';
const SITE = 'https://worlddrive.app';
const RUN_ID = /^[A-Za-z0-9_-]{16,32}$/;
// A time's handle (handleOf): 12 bytes of an HMAC, as base64url.
export const HANDLE = /^[A-Za-z0-9_-]{16}$/;
// A time's body (bytes): its numbers and passes, the ghost's text and the ride's look.
const TIME_BODY = 2048 + GHOST_TEXT + 1024;
// A ghost, fetched by its run, is kept in Cloudflare's cache this long (s): a run's ghost never
// changes (a new best is a new run), and it's gone from D1 once its challenge is finished.
const GHOST_KEPT = 30 * 24 * 60 * 60;
const DAY = 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();

// The places the rotation goes round: the game's own featured places, by an id of their own.
const FEATURED = {
	earth: [
		...SPOTS.map( spot => ( { id: `spot:${ spot.id }`, name: spot.name, region: spot.region, lat: spot.lat, lon: spot.lon, heading: spot.heading } ) ),
		...PLACES.filter( place => place.at ).map( place => ( { id: `page:${ place.slug }`, name: place.name, region: place.region, lat: place.at.lat, lon: place.at.lon, heading: place.at.heading } ) ),
	],
	moon: MOON_PLACES.map( place => ( { id: place.id, name: place.name, region: place.region, lat: place.lat, lon: place.lon } ) ),
};

// The derived key, made once per Worker instance; the live challenges ({ keys, at, rows }); the
// admin page's busy places ({ at, earth, moon }); the Moon's heights being fetched.
let seeding = null;
let live = null;
let busy = null;
let moonLoading = null;
// The rotation's choices worked out in this instance (rotationPick), by period, world and places,
// and its rounds' orders (orderOf), by round.
const picked = new Map();
const orders = new Map();

// --- the routes ---

// GET /api/challenges?id=: the six live challenges (the page puts the current world's first):
// { now, challenges: [ CHALLENGE + { total, top, me } ] }, top the LIST_TOP best ({ rank, name, ms,
// vehicle, level, title, supporter? }) and me, with a player's id, their best and rank there
// ({ ms, rank } or null). CHALLENGE: { id, period, key, world, kind, place, region, route, startsAt,
// endsAt }. The first ask in a period fixes its challenges in D1.
export async function listChallenges( context ) {

	const { env, url } = context;
	const id = askedPlayer( url );
	const miss = await looks( context );
	const db = database( env );
	const rows = await liveChallenges( context );
	const ids = rows.map( row => row.id );
	const listed = listKey( url, ids );
	const cached = await caches.default.match( listed );
	let tops;
	if ( cached ) tops = await cached.json();
	else {

		await miss();
		const results = await db.batch( [
			...ids.map( challenge => topQuery( db, env, challenge, LIST_TOP ) ),
			db.prepare( `SELECT id, drivers FROM challenges WHERE id IN ( ${ ids.map( () => '?' ).join( ', ' ) } )` ).bind( ...ids ),
		] );
		const drivers = new Map( results.at( - 1 ).results.map( row => [ row.id, row.drivers ] ) );
		tops = Object.fromEntries( ids.map( ( challenge, i ) => [ challenge, { total: drivers.get( challenge ) ?? 0, top: results[ i ].results.map( entryOf ) } ] ) );
		await caches.default.put( listed, json( tops, 200, { 'Cache-Control': `public, max-age=${ CHALLENGE_CACHE }` } ) );

	}

	const mine = id ? await myStanding( context, db, ids, id, miss ) : {};
	return json( {
		now: context.now,
		challenges: rows.map( row => ( { ...challengeOf( row ), ...tops[ row.id ], me: mine[ row.id ] ?? null } ) ),
	}, 200, { 'X-Board-Cache': cached ? 'hit' : 'miss' } );

}

// GET /api/challenges/board?challenge=&id=: a challenge's board, live or past (a finished one's is
// kept as it ended): { challenge: CHALLENGE + { replacedAt, finalAt }, total, rows: [ the TOP best ],
// me } (me with a player's id: their { rank, name, ms, ... }, or null; the owner's own row says
// owner: true and the rank it would have). A rank past RANK_MOST is RANK_MOST + 1 (rankIn).
export async function challengeBoard( context ) {

	const { env, url } = context;
	const challenge = Number( url.searchParams.get( 'challenge' ) );
	if ( ! Number.isSafeInteger( challenge ) || challenge < 1 ) throw bad();
	const id = askedPlayer( url );
	const miss = await looks( context );
	const db = database( env );
	const key = boardKey( url, challenge );
	const cached = await caches.default.match( key );
	let board;
	if ( cached ) board = await cached.json();
	else {

		await miss();
		const [ found, top ] = await db.batch( [
			db.prepare( 'SELECT * FROM challenges WHERE id = ?' ).bind( challenge ),
			topQuery( db, env, challenge, TOP ),
		] );
		const row = found.results[ 0 ];
		if ( ! row ) throw new HttpError( 404, 'No such challenge' );
		board = { challenge: { ...challengeOf( row ), replacedAt: row.replaced_at, finalAt: row.final_at }, total: row.drivers, rows: top.results.map( entryOf ) };
		// A finished one's times can't change: kept a day, so asking for past boards in turn reads each
		// once a day in a place, not once a minute.
		await caches.default.put( key, json( board, 200, { 'Cache-Control': `public, max-age=${ row.final_at === null ? CHALLENGE_CACHE : FINISHED_CACHE }` } ) );

	}

	const answer = { ...board };
	const headers = { 'X-Board-Cache': cached ? 'hit' : 'miss' };
	if ( id ) {

		// The player's own row, kept as a live board is (their new best clears it): one read of it by
		// its key, its rank where it's shown on the board, else its final place once the challenge is
		// over, else found in the board's order (rankIn), so it costs a row or two however far down
		// it is.
		const mine = boardKey( url, challenge, id );
		const kept = await caches.default.match( mine );
		headers[ 'X-Player-Cache' ] = kept ? 'hit' : 'miss';
		if ( kept ) return json( { ...answer, me: ( await kept.json() ).me }, 200, headers );
		await miss();
		const row = await db.prepare( `SELECT p.name, t.ms, t.vehicle, t.owner, t.created_at, t.final_rank, t.run_id, ${ hasPass( 'p.account_id', '?3' ) } AS supporter, ${ xpOf( 'p' ) } AS xp, p.title
			FROM challenge_times t JOIN players p ON p.id = t.player_id WHERE t.challenge_id = ?1 AND t.player_id = ?2` ).bind( challenge, id, supporterEmails( env ) ).first();
		let rank = null;
		if ( row ) {

			const final = board.challenge.finalAt !== null;
			rank = ( row.owner ? null : board.rows.find( shown => shown.name === row.name && shown.ms === row.ms )?.rank )
				?? ( final && ! row.owner ? row.final_rank : null )
				?? rankIn( ( await boardOrders( context, db, [ challenge ], miss, final ? FINISHED_CACHE : ORDER_KEPT ) ).get( challenge ), row, id );

		}

		// (Its handle, for a link to it from your own row.)
		answer.me = row ? { ...entryOf( { ...row, rank } ), handle: await handleOf( env, challenge, id ), ...( row.owner ? { owner: true } : {} ) } : null;
		await caches.default.put( mine, json( { me: answer.me }, 200, { 'Cache-Control': `public, max-age=${ CHALLENGE_CACHE }` } ) );

	}

	return json( answer, 200, headers );

}

// GET /api/challenges/link?challenge=&vs=: what a "challenge a friend" link shows ({ challenge:
// CHALLENGE + { replacedAt, finalAt }, vs }): the challenge, live or past, and the time its handle
// names (vs: { name, ms, vehicle, run, ghost (whether its ghost is kept), date, level, title,
// supporter?, owner?, rank? (its final place, once the challenge is over) }), or vs: null for a
// handle that names none (mistyped, or that player removed), so the page opens the challenge
// without a ghost. 404 for no such challenge. Nothing of who but the name and the time the board
// shows. Kept as a board is (linkData).
export async function challengeLink( context ) {

	const { url } = context;
	const { challenge, vs } = linkAsked( url );
	if ( ! challenge ) throw bad();
	const miss = await looks( context );
	const { data, cached } = await linkData( context, challenge, vs, miss );
	return json( data, 200, { 'X-Board-Cache': cached ? 'hit' : 'miss' } );

}

// GET /api/challenges/ghost?challenge=&run=: the ghost of a best on a challenge, by its run (a link's
// vs.run, a board row's run, your own me.run): { run, ms, passes, vehicle, look, ghost } (ghost:
// ghost-rules.js's text). 404 when that run isn't a best with a ghost kept (a better one has replaced
// it, or the challenge is finished). A run's ghost never changes (a new best is a new run), so it's
// kept in Cloudflare's cache by the run for GHOST_KEPT, whoever asks; one read of D1 (its one row)
// when it isn't, held to CHALLENGE_MISSES as the boards are.
export async function challengeGhost( context ) {

	const { env, url } = context;
	const challenge = Number( url.searchParams.get( 'challenge' ) );
	const run = url.searchParams.get( 'run' ) ?? '';
	if ( ! Number.isSafeInteger( challenge ) || challenge < 1 || ! RUN_ID.test( run ) ) throw bad();
	const miss = await looks( context );
	const key = ghostKey( url, challenge, run );
	const kept = await caches.default.match( key );
	if ( kept ) return jsonText( await kept.text(), 200, { 'X-Board-Cache': 'hit' } );
	await miss();
	const row = await database( env ).prepare( 'SELECT run_id, ms, passes, vehicle, look, ghost FROM challenge_ghosts WHERE challenge_id = ? AND run_id = ?' ).bind( challenge, run ).first();
	if ( ! row ) throw new HttpError( 404, 'No such ghost' );
	const text = JSON.stringify( { run: row.run_id, ms: row.ms, passes: JSON.parse( row.passes ), vehicle: row.vehicle, look: JSON.parse( row.look ), ghost: row.ghost } );
	await caches.default.put( key, jsonText( text, 200, { 'Cache-Control': `public, max-age=${ GHOST_KEPT }` } ) ).catch( err => console.error( 'Challenge caches', err?.name, err?.message ) );
	return jsonText( text, 200, { 'X-Board-Cache': 'miss' } );

}

// What a link asks for: { challenge: its id, or 0 if it isn't one; vs: a handle, or null }. A handle
// that can't be one (not HANDLE's form) is no handle: the link opens the challenge without a ghost.
function linkAsked( url ) {

	const challenge = Number( url.searchParams.get( 'challenge' ) );
	const vs = url.searchParams.get( 'vs' );
	return { challenge: Number.isSafeInteger( challenge ) && challenge > 0 ? challenge : 0, vs: vs !== null && HANDLE.test( vs ) ? vs : null };

}

// A link's answer (challengeLink's) for `challenge` and the handle `vs` (or null): { data, cached }.
// Kept in Cloudflare's cache as the board is (a live challenge's a minute, its player's new best
// clearing it there; a finished one's a day), so a link posted in a busy chat, its preview fetched by
// each app and its page opened by everyone in it, reads D1 once a minute at most in a place: the
// challenge's row and the time by its handle (one indexed look) with its player. `miss` (looks') is
// asked before D1 is.
export async function linkData( context, challenge, vs, miss ) {

	const { env, url } = context;
	const key = linkKey( url, challenge, vs );
	const kept = await caches.default.match( key );
	if ( kept ) return { data: await kept.json(), cached: true };
	await miss();
	const db = database( env );
	const [ found, time ] = await db.batch( [
		db.prepare( 'SELECT * FROM challenges WHERE id = ?' ).bind( challenge ),
		db.prepare( `SELECT p.name, t.ms, t.vehicle, t.run_id, t.owner, t.created_at, t.final_rank, ${ hasPass( 'p.account_id', '?3' ) } AS supporter, ${ xpOf( 'p' ) } AS xp, p.title,
			EXISTS ( SELECT 1 FROM challenge_ghosts g WHERE g.challenge_id = t.challenge_id AND g.player_id = t.player_id ) AS ghost
			FROM challenge_times t JOIN players p ON p.id = t.player_id WHERE t.challenge_id = ?1 AND t.handle = ?2` ).bind( challenge, vs ?? '', supporterEmails( env ) ),
	] );
	const row = found.results[ 0 ];
	if ( ! row ) throw new HttpError( 404, 'No such challenge' );
	const them = vs ? time.results[ 0 ] : null;
	const final = row.final_at !== null;
	const data = {
		challenge: { ...challengeOf( row ), replacedAt: row.replaced_at, finalAt: row.final_at },
		vs: them ? {
			...entryOf( { ...them, rank: final && ! them.owner ? them.final_rank : null } ), ghost: !! them.ghost,
			...( them.owner ? { owner: true } : {} ),
		} : null,
	};
	await caches.default.put( key, json( data, 200, { 'Cache-Control': `public, max-age=${ final ? FINISHED_CACHE : CHALLENGE_CACHE }` } ) ).catch( err => console.error( 'Challenge caches', err?.name, err?.message ) );
	return { data, cached: false };

}

// The page itself for a link to a challenge (/?challenge=&vs=: index.js runs the Worker for the
// page at /), with its own preview for chat apps: the link card's title and description (og: and
// twitter:) say whose time it is, where and which period, from the link's answer as the page gets
// it (linkData: kept in Cloudflare's cache, so a crawler costs no more than a look at it), set as
// attributes by the HTMLRewriter, which escapes them. Anything that won't do (no such challenge, a
// look too many, D1 not answering, a link that isn't one) is the page as it is, with the game's own
// card: the page always opens.
export async function linkPage( context ) {

	const { request, env, url, now } = context;
	// (Asked afresh, not as a browser's copy of it: the card is this link's.)
	const page = await env.ASSETS.fetch( new Request( url.href, { method: 'GET', headers: { Accept: request.headers.get( 'Accept' ) ?? 'text/html' } } ) );
	const { challenge, vs } = linkAsked( url );
	if ( ! challenge || ! page.ok || ! /text\/html/.test( page.headers.get( 'Content-Type' ) ?? '' ) ) return page;
	let words;
	try {

		words = linkWords( ( await linkData( context, challenge, vs, await looks( context ) ) ).data, now );

	} catch ( err ) {

		if ( ! ( err instanceof HttpError ) ) console.error( 'Challenge link page', err?.name, err?.message );
		return page;

	}

	// Each tag written whole, its words escaped here (the HTMLRewriter's setAttribute escapes a
	// quote, not an ampersand).
	const set = ( attribute, name, value ) => ( { element: element => element.replace( `<meta ${ attribute }="${ name }" content="${ escapeHtml( value ) }" />`, { html: true } ) } );
	const shown = new HTMLRewriter()
		.on( 'meta[property="og:title"]', set( 'property', 'og:title', words.title ) )
		.on( 'meta[name="twitter:title"]', set( 'name', 'twitter:title', words.title ) )
		.on( 'meta[property="og:description"]', set( 'property', 'og:description', words.description ) )
		.on( 'meta[name="twitter:description"]', set( 'name', 'twitter:description', words.description ) )
		.on( 'meta[property="og:url"]', set( 'property', 'og:url', `${ SITE }/?challenge=${ challenge }${ vs ? `&vs=${ vs }` : '' }` ) )
		.transform( page );
	const headers = new Headers( shown.headers );
	for ( const name of [ 'ETag', 'Last-Modified', 'Content-Length' ] ) headers.delete( name );
	// (Its card is this moment's: the time to beat, the time left.)
	headers.set( 'Cache-Control', 'no-store' );
	return new Response( shown.body, { status: 200, headers } );

}

// A link's card for chat apps, from its answer (linkData's) at `now`: { title, description }, plain
// text (the HTMLRewriter escapes it as it sets it). "Beat Ann Racer's 0:21.40 on today's Furka Pass
// sprint" and "A daily checkpoint sprint at Furka Pass (Swiss Alps) in World Drive, 5 h 12 m left.
// Drive it in your browser and race Ann Racer's ghost."; one that's over says so, with their time
// and place on its final board.
export function linkWords( { challenge, vs }, now ) {

	const { period, kind, place, region, world, route, endsAt, finalAt, replacedAt } = challenge;
	const where = `${ place }${ world === 'moon' ? ' on the Moon' : '' }`;
	const what = { sprint: 'sprint', collect: 'star hunt', landmark: `drive to ${ route.goal ?? place }` }[ kind ];
	const which = { day: 'today\'s', week: 'this week\'s', month: 'this month\'s' }[ period ];
	const named = { day: 'daily', week: 'weekly', month: 'monthly' }[ period ];
	const full = `${ KIND_NAMES[ kind ].toLowerCase() } at ${ place }${ region ? ` (${ region })` : '' }${ world === 'moon' ? ' on the Moon' : '' }`;
	const over = finalAt !== null || replacedAt !== null || endsAt <= now;
	if ( over ) {

		return {
			title: vs ? `${ vs.name } finished in ${ formatTime( vs.ms ) } at ${ where }` : `The ${ named } challenge at ${ where } is over`,
			description: `The ${ named } ${ full } in World Drive has ended${ vs?.rank ? `, with ${ vs.name } #${ rankText( vs.rank ) } on its board` : '' }. Try today's challenges, free in your browser.`,
		};

	}

	const left = timeLeft( endsAt - now );
	if ( ! vs ) return { title: `World Drive: ${ which } challenge at ${ where }`, description: `A ${ named } ${ full } in World Drive, ${ left }. Drive it in your browser, free.` };
	return {
		title: `Beat ${ vs.name }'s ${ formatTime( vs.ms ) } on ${ which } ${ kind === 'landmark' ? what : `${ where } ${ what }` }`,
		description: `A ${ named } ${ full } in World Drive, ${ left }. Drive it in your browser and race ${ vs.name }'s ghost.`,
	};

}

// POST /api/challenges/time { id, secret, visit, challenge, run, ms, passes, vehicle, look, ghost }:
// a run of a live challenge finished, ms its time and passes when each point was passed ([ [ index,
// ms ] ], in the order passed), look the ride's Garage look (checkLook's parts) and ghost the run
// itself (ghost-rules.js's text). { ms: the player's best, rank, total, isNewBest, top: [ the
// FINISH_TOP best ], run: the best's run, handle: what a link to it names it by } (rank among the
// players on the board; for the owner's runs, kept off it, the rank it would have, with owner:
// true). 400 for a run the game couldn't have driven (reason: 'ghost', with the fault, for a ghost
// that doesn't agree with it), 403 for a visit, a player or a challenge that won't do, 429 too
// often (reason: 'daily' once the visitor's day is used up, 'visit' once the visit's
// CHALLENGE_TIMES_PER_VISIT are). The same run posted again within REPOST of its being taken (its
// answer lost on the way, so the page tries again) is answered as it was taken, nothing more
// written or counted; a run's id that's another player's on the board, or a new best with the
// best's own run id (a run's ghost is kept by its id, and never changes), is a 400 (reason: 'run'),
// so a run's id names one time.
export async function postTime( context ) {

	const { request, env, limits, now, url } = context;
	const db = database( env );
	// A burst of posts from one address (a script), turned away before anything's read, as a burst of
	// looks is. (Not CHALLENGE_MISSES: what a time reads is held by the gap, the visit's times and the
	// visitor's day, below.)
	await looks( context );
	const body = await readJson( request, TIME_BODY );
	if ( ! isObject( body ) ) throw bad();
	const { id, secret } = credentials( body );
	const { challenge: challengeId, run, ms, passes, vehicle, ghost } = body;
	if ( ! Number.isSafeInteger( challengeId ) || challengeId < 1 || typeof run !== 'string' || ! RUN_ID.test( run ) ) throw bad();
	if ( typeof vehicle !== 'string' || ! VEHICLES.has( vehicle ) || ! Number.isSafeInteger( ms ) || ms <= 0 ) throw bad();
	if ( ! Array.isArray( passes ) || passes.length > 32 || typeof ghost !== 'string' || ghost.length > GHOST_TEXT ) throw bad();
	// The ride's look, as a room takes it (only the Garage's parts, each an id): drawn with its ghost.
	const look = body.look === undefined ? {} : checkLook( body.look );
	if ( ! look ) throw bad();

	const visit = await readVisit( env, body.visit, now );
	if ( ! visit ) throw new HttpError( 403, 'Forbidden', { reason: 'visit' } );
	// The challenge itself, from D1 (one the owner has replaced in the last minute may still be in
	// some instance's list): live, or over a moment ago with the run begun before its end.
	const row = await db.prepare( 'SELECT * FROM challenges WHERE id = ?' ).bind( challengeId ).first();
	const open = row && row.replaced_at === null && row.final_at === null && now >= row.starts_at && ( now < row.ends_at || ( now < row.ends_at + GRACE && now - ms < row.ends_at ) );
	if ( ! open ) throw new HttpError( 403, 'That challenge is over', { reason: 'challenge' } );
	// An Earth challenge needs an Earth visit (one the Earth's caps let through, or the owner's): a
	// Moon visit costs nothing but a robot check. The Moon's takes any.
	if ( row.world === 'earth' && ! visit.earth && ! visit.owner ) throw new HttpError( 403, 'Forbidden', { reason: 'world' } );
	const challenge = challengeOf( row );
	// No longer than the visit has lasted, and possible on the route.
	if ( ms / 1000 > ( now - visit.issuedAt ) / 1000 + SLACK || ! checkPasses( challenge, ms, passes ) ) throw bad();
	// And the run itself, its ghost, agreeing with that: through each point at its pass time, as long
	// as the time, and never faster between two of its samples than the game goes (ghost-rules.js).
	// What it can't stop is in the docs ("How cheating is limited").
	const fault = ghostFault( challenge, ms, passes, ghost );
	if ( fault ) throw new HttpError( 400, 'Bad request', { reason: 'ghost', fault } );

	const player = await authenticate( db, id, secret );
	// One visit, one player, as for scores.
	const [ , bound ] = await db.batch( [
		db.prepare( 'INSERT INTO visits ( id, player_id, expires_at ) VALUES ( ?, ?, ? ) ON CONFLICT ( id ) DO NOTHING' ).bind( visit.id, id, visit.expiresAt ),
		db.prepare( 'SELECT player_id, times FROM visits WHERE id = ?' ).bind( visit.id ),
	] );
	if ( bound.results[ 0 ]?.player_id !== id ) throw new HttpError( 403, 'Forbidden', { reason: 'visit' } );
	const was = await db.prepare( 'SELECT ms, owner, run_id, created_at FROM challenge_times WHERE challenge_id = ? AND player_id = ?' ).bind( challengeId, id ).first();
	// The run that's already the best, posted again soon after: its answer was lost on the way (a
	// phone losing its signal) and the page has tried again. Answered as it was taken, without the
	// gap (it's been taken; CHALLENGE_LOOKS holds a burst of them, above), from Cloudflare's cache,
	// where that answer was put as it was taken (or, in another of its places, the first time it's
	// asked for there), so posting it over and over reads nothing of the board. Later than REPOST
	// it's a post like any other, below (the gap and the visitor's day), and not a new best.
	if ( was?.run_id === run && was.ms === ms && now - was.created_at < REPOST ) {

		const key = answerKey( url, challengeId, id, run );
		const kept = await caches.default.match( key );
		if ( kept ) return json( await kept.json(), 200, { 'X-Time-Cache': 'hit' } );
		const answer = await answerTime( context, db, challengeId, id, true );
		await keepAnswer( key, answer, was.created_at + REPOST - now );
		return json( answer, 200, { 'X-Time-Cache': 'miss' } );

	}

	// A new best is a new run: its ghost is kept, and cached, by its run's id, which never changes.
	if ( was?.run_id === run && ms < was.ms ) throw new HttpError( 400, 'Bad request', { reason: 'run' } );

	// One time every TIME_GAP from a player, and CHALLENGE_TIMES_PER_VISIT from a visit (whatever
	// addresses its token is sent from: each visit is a robot check, so that's all one buys), claimed
	// together in one transaction so two at once can't both get in: the gap with the visit's count
	// under its limit, then the count, only if the gap was just claimed (the visit is this player's
	// alone, and their gap lets one in at a time). A player held till midnight (their visitor's day
	// used up, below) is turned away here.
	const perVisit = setting( env.CHALLENGE_TIMES_PER_VISIT, TIMES_PER_VISIT );
	const [ gap ] = await db.batch( [
		db.prepare( `UPDATE players SET last_time_at = ?1, last_seen_at = ?1 WHERE id = ?2 AND last_time_at <= ?3
			AND EXISTS ( SELECT 1 FROM visits WHERE id = ?4 AND player_id = ?2 AND times < ?5 )` ).bind( now, id, now - TIME_GAP, visit.id, perVisit ),
		db.prepare( 'UPDATE visits SET times = times + 1 WHERE id = ?1 AND player_id = ?2 AND ( SELECT last_time_at FROM players WHERE id = ?2 ) = ?3' ).bind( visit.id, id, now ),
	] );
	if ( ! gap.meta.changes ) {

		if ( bound.results[ 0 ].times >= perVisit && player.last_time_at <= now - TIME_GAP ) {

			// The visit's times used up: a new visit (the page reloaded, a robot check) posts more.
			const retryAfter = Math.ceil( ( visit.expiresAt - now ) / 1000 );
			throw new HttpError( 429, 'That\'s all the times for this visit', { retryAfter, reason: 'visit' }, { 'Retry-After': String( retryAfter ) } );

		}

		const held = Math.ceil( ( player.last_time_at + TIME_GAP - now ) / 1000 );
		if ( held > TIME_GAP / 1000 ) throw new HttpError( 429, 'That\'s all for today. Try again tomorrow', { retryAfter: held, reason: 'daily' }, { 'Retry-After': String( held ) } );
		const retryAfter = Math.ceil( TIME_GAP / 1000 );
		throw new HttpError( 429, 'Too many times. Try again in a moment', { retryAfter }, { 'Retry-After': String( retryAfter ) } );

	}

	try {

		// The visitor by their /48 (dropins.js's VISITOR_PREFIX): one free tunnel broker's customer holds
		// 65,536 /64s, which would otherwise each be a visitor with a day of their own.
		await takeTurn( limits, request, 'time', now, setting( env.CHALLENGE_TIMES_PER_VISITOR_DAILY, TIMES_DAILY ), VISITOR_PREFIX );

	} catch ( err ) {

		// The visitor's day used up: this player's gap is set to run out at midnight UTC (when the
		// visitor's day starts again), so until then their tries stop at the gap above, before they
		// write anything or ask DriveLimits again. Each of a visitor's players costs one more try,
		// not one every TIME_GAP all day. (The visit's count gives back the try it took.)
		if ( err.status === 429 ) {

			await db.batch( [
				db.prepare( 'UPDATE players SET last_time_at = ? WHERE id = ?' ).bind( periodOf( 'day', now ).ends - TIME_GAP, id ),
				db.prepare( 'UPDATE visits SET times = MAX( 0, times - 1 ) WHERE id = ? AND player_id = ?' ).bind( visit.id, id ),
			] );

		}

		throw err;

	}

	const owner = visit.owner ? 1 : 0;
	const isNewBest = ! was || ms < was.ms;
	const handle = await handleOf( env, challengeId, id );
	if ( isNewBest ) {

		// Only a better time replaces the best; the owner's mark stays once it's there. A new player
		// on the board (not the owner) counts in its drivers. Both only while the challenge isn't yet
		// finished or replaced, checked in the same writes: it was open when its row was read above,
		// but its final places may have been written since (a post in the minute after its end, as
		// finishEnded runs), and a time written after them would be one its places don't count.
		let written;
		try {

			// With its ghost, written only where the time was (the best now has this run), so the ghost
			// kept is always the best's, replaced with it.
			[ written ] = await db.batch( [
				db.prepare( `INSERT INTO challenge_times ( challenge_id, player_id, ms, passes, vehicle, run_id, visit, owner, created_at, first_at, handle ) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, ?10
					WHERE EXISTS ( SELECT 1 FROM challenges WHERE id = ?1 AND final_at IS NULL AND replaced_at IS NULL )
					ON CONFLICT ( challenge_id, player_id ) DO UPDATE SET ms = excluded.ms, passes = excluded.passes, vehicle = excluded.vehicle, run_id = excluded.run_id,
					visit = excluded.visit, owner = MAX( challenge_times.owner, excluded.owner ), created_at = excluded.created_at, handle = excluded.handle WHERE excluded.ms < challenge_times.ms` )
					.bind( challengeId, id, ms, JSON.stringify( passes ), vehicle, run, visit.id, owner, now, handle ),
				db.prepare( `INSERT INTO challenge_ghosts ( challenge_id, player_id, run_id, ms, passes, vehicle, look, ghost, created_at ) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9
					WHERE EXISTS ( SELECT 1 FROM challenge_times WHERE challenge_id = ?1 AND player_id = ?2 AND run_id = ?3 )
					ON CONFLICT ( challenge_id, player_id ) DO UPDATE SET run_id = excluded.run_id, ms = excluded.ms, passes = excluded.passes, vehicle = excluded.vehicle, look = excluded.look,
					ghost = excluded.ghost, created_at = excluded.created_at` )
					.bind( challengeId, id, run, ms, JSON.stringify( passes ), vehicle, JSON.stringify( look ), ghost, now ),
				...was || owner ? [] : [ db.prepare( 'UPDATE challenges SET drivers = drivers + 1 WHERE id = ? AND final_at IS NULL AND replaced_at IS NULL' ).bind( challengeId ) ],
			] );

		} catch ( err ) {

			// Another player's run's id (challenge_times_run): the page makes each from 12 random bytes,
			// so it's been copied, perhaps from a link to that run. The batch is one transaction, so
			// nothing of it was written.
			if ( /UNIQUE constraint failed: challenge_times\.challenge_id, challenge_times\.run_id/.test( err?.message ) ) throw new HttpError( 400, 'Bad request', { reason: 'run' } );
			throw err;

		}

		if ( ! written.meta.changes ) throw new HttpError( 403, 'That challenge is over', { reason: 'challenge' } );
		// So the player, and anyone asking here, sees it straight away (in this one of Cloudflare's
		// places; elsewhere within CHALLENGE_CACHE s). Nothing going wrong in it turns the best that's
		// now kept into an error.
		await forgetTime( context, challengeId, id, handle ).catch( err => console.error( 'Challenge caches', err?.name, err?.message ) );

	}

	const answer = await answerTime( context, db, challengeId, id, isNewBest );
	// A new best's answer kept for the same run posted again (above).
	if ( isNewBest ) await keepAnswer( answerKey( url, challengeId, id, run ), answer, REPOST );
	return json( answer );

}

// postTime's answer, for `player` on challenge `id`: their best, its rank, the board's count and
// top, and whether `isNewBest`. A new best changes the board's order, so it's read afresh with the
// rest (at most RANK_MOST rows: one read for each new best, which the gap, the visit's times and
// the visitor's day hold) and kept for the looks after it here; a time that isn't one finds its
// rank in the order kept.
async function answerTime( context, db, id, player, isNewBest ) {

	const [ standing, top, read ] = await db.batch( [
		db.prepare( 'SELECT t.ms, t.owner, t.created_at, t.run_id, c.drivers FROM challenge_times t JOIN challenges c ON c.id = t.challenge_id WHERE t.challenge_id = ? AND t.player_id = ?' ).bind( id, player ),
		topQuery( db, context.env, id, FINISH_TOP ),
		...isNewBest ? [ orderQuery( db, id ) ] : [],
	] );
	let order;
	if ( read ) {

		order = orderFrom( read.results );
		await keepOrder( context.url, id, order, ORDER_KEPT );

	} else order = ( await boardOrders( context, db, [ id ], () => {} ) ).get( id );
	const mine = standing.results[ 0 ];
	return {
		ms: mine.ms, rank: rankIn( order, mine, player ), total: mine.drivers, isNewBest, top: top.results.map( entryOf ),
		run: mine.run_id, handle: await handleOf( context.env, id, player ),
		...( mine.owner ? { owner: true } : {} ),
	};

}

// A time's `answer` kept in Cloudflare's cache under `key` (answerKey) for `ms` more, for the same
// run posted again; nothing going wrong in it turns the time's answer into an error.
async function keepAnswer( key, answer, ms ) {

	const seconds = Math.ceil( ms / 1000 );
	if ( seconds > 0 ) await caches.default.put( key, json( answer, 200, { 'Cache-Control': `public, max-age=${ seconds }` } ) ).catch( err => console.error( 'Challenge caches', err?.name, err?.message ) );

}

// The cached rows a new best on challenge `id` by `player` changes: its board, its order, the
// player's own row there and a link to their time (by its `handle`), at once; and the list's tops
// and the player's rows on the six, with the six's ids this instance knows (or, if it doesn't just
// now, in the background: finding them may mean fixing a new period's six, which is no part of a
// time's answer). (The ghost of the run it replaces stays in the cache by that run as it was: no
// link or board names it now.)
async function forgetTime( context, id, player, handle ) {

	const { url, ctx } = context;
	const lists = rows => {

		const ids = rows.map( row => row.id );
		return [ listKey( url, ids ), mineKey( url, ids, player ) ];

	};
	const known = liveKnown( context.now );
	await Promise.all( [ boardKey( url, id ), boardKey( url, id, player ), orderKey( url, id ), linkKey( url, id, handle ), ...known ? lists( known ) : [] ].map( key => caches.default.delete( key ) ) );
	if ( ! known ) await later( ctx, liveChallenges( context ).then( rows => Promise.all( lists( rows ).map( key => caches.default.delete( key ) ) ) ), 'Challenge caches' );

}

// `work` left to finish after the answer has gone (ctx.waitUntil, as the visits' counts are), its
// failure logged, never the answer's; awaited where there's no ctx.
function later( ctx, work, what ) {

	const done = work.catch( err => console.error( what, err?.name, err?.message ) );
	if ( ctx?.waitUntil ) ctx.waitUntil( done );
	else return done;

}

// GET /api/admin/challenges, to an account in ADMIN_EMAILS (adminAccount: 401, 403, 429 past
// ADMIN_LOOKS): { now, current: [ CHALLENGE + { source, total, top } ], upcoming: [ { period, key,
// world, kind, place, region, lat, lon, source, startsAt } ], picks: [ the owner's picks for the
// live periods and every one after, however far ahead, soonest first: { period, world, kind, place,
// region, lat, lon, heading, startsAt } ], approved: [ { world, cell, name, region, lat, lon } ],
// featured: { earth: [ PLACE ], moon: [ PLACE ] }, busy: { earth: [ part 1's top places that aren't
// featured ], moon: [...] } }, upcoming the next period of each kind on each world as it would be
// fixed (the owner's pick, or the rotation's, clear of what's fixed now).
export async function adminChallenges( context ) {

	await adminAccount( context );
	return adminAnswer( context );

}

// The admin page's answer (adminChallenges'), the account already checked.
async function adminAnswer( context ) {

	const { env, now } = context;
	const db = database( env );
	const rows = await liveChallenges( context );
	const ids = rows.map( row => row.id );
	const current = periodsAt( now );
	// The picks from each kind's live period on (keys of a kind sort as their periods do, and each
	// kind's are below 'day:9', 'week:9' and 'month:9'): ranges of challenge_picks' key.
	const [ picks, places, counts, ...tops ] = await db.batch( [
		db.prepare( `SELECT * FROM challenge_picks WHERE ( period >= ?1 AND period < 'day:9' ) OR ( period >= ?2 AND period < 'week:9' ) OR ( period >= ?3 AND period < 'month:9' ) LIMIT 2000` )
			.bind( ...current.map( period => period.key ) ),
		db.prepare( 'SELECT * FROM challenge_places ORDER BY world, created_at' ),
		db.prepare( `SELECT id, drivers FROM challenges WHERE id IN ( ${ ids.map( () => '?' ).join( ', ' ) } )` ).bind( ...ids ),
		...ids.map( challenge => topQuery( db, env, challenge, LIST_TOP ) ),
	] );
	const drivers = new Map( counts.results.map( row => [ row.id, row.drivers ] ) );
	const approved = places.results;
	// The next of each as liveChallenges would fix them now: the longest first (the month, the week,
	// then the day), each clear of what's fixed and of those worked out before it here (a next week's
	// pick of yours that a Monday's day must keep clear of, as it will when they're fixed together).
	const upcoming = [];
	const fixed = [ ...rows ];
	for ( const period of [ ...current ].reverse().map( nextPeriod ) ) {

		for ( const world of WORLDS ) {

			const pick = picks.results.find( p => p.period === period.key && p.world === world );
			const chosen = pick ? pickedPlace( pick ) : await rotationPick( env, period, world, approved, fixed );
			const { name, region, lat, lon } = chosen.place;
			fixed.push( { period: period.key, world, place: name, starts_at: period.starts, ends_at: period.ends, pin: { name, lat, lon } } );
			upcoming.push( { period: period.kind, key: period.key, world, kind: chosen.kind, place: name, region, lat, lon, source: chosen.source, startsAt: period.starts } );

		}

	}

	upcoming.sort( ( a, b ) => PERIOD_KINDS.indexOf( a.period ) - PERIOD_KINDS.indexOf( b.period ) || WORLDS.indexOf( a.world ) - WORLDS.indexOf( b.world ) );

	return json( {
		now,
		current: rows.map( ( row, i ) => ( { ...challengeOf( row ), source: row.source, total: drivers.get( row.id ) ?? 0, top: tops[ i ].results.map( entryOf ) } ) ),
		upcoming,
		picks: picks.results.map( pick => ( { pick, starts: parsePeriod( pick.period )?.starts ?? 0 } ) ).sort( ( a, b ) => a.starts - b.starts || PERIOD_KINDS.indexOf( periodKind( a.pick.period ) ) - PERIOD_KINDS.indexOf( periodKind( b.pick.period ) ) || WORLDS.indexOf( a.pick.world ) - WORLDS.indexOf( b.pick.world ) )
			.map( ( { pick, starts } ) => ( { period: pick.period, world: pick.world, kind: pick.kind, place: pick.place, region: pick.region, lat: pick.lat, lon: pick.lon, heading: pick.heading, startsAt: starts } ) ),
		approved: approved.map( place => ( { world: place.world, cell: `${ place.world }:${ place.cell_row }:${ place.cell_column }`, name: place.name, region: place.region, lat: place.lat, lon: place.lon } ) ),
		featured: Object.fromEntries( WORLDS.map( world => [ world, FEATURED[ world ].map( ( { id, name, region, lat, lon } ) => ( { id, name, region, lat, lon } ) ) ] ) ),
		busy: await busyPlaces( context, db ),
	} );

}

// POST /api/admin/challenges, to an account in ADMIN_EMAILS, from the admin page (the same-origin
// and JSON checks every change has, index.js):
//   { action: 'pick', period, world, kind, place: { featured: id } | { cell } | { name, region, lat,
//     lon, heading }, live }: that period's challenge on that world (today's, this week's or this
//     month's, or one ahead, up to AHEAD days), a featured place, an approved or busy drop-in place
//     (its cell) or coordinates and a name. The live one, once anyone has a time on it, only with
//     live: true (else 409 { reason: 'live', drivers }): it's replaced, its board kept apart.
//   { action: 'unpick', period, world, live }: back to the rotation's. A live one the rotation chose
//     stays as it is (it's the rotation's already, whatever the rotation would choose now that the
//     places or the code have changed); a live one of the owner's is replaced by the rotation's
//     choice, as for pick.
//   { action: 'approve', world, cell } and { action: 'unapprove', world, cell }: a busy drop-in
//     place in the rotation, or out of it.
// Answers as GET does, with what changed.
export async function adminChange( context ) {

	const { request, env, now } = context;
	await adminAccount( context );
	const db = database( env );
	const body = await readJson( request, 2048 );
	if ( ! isObject( body ) || ! WORLDS.includes( body.world ) ) throw bad();
	const { action, world } = body;
	if ( action === 'approve' || action === 'unapprove' ) {

		const cell = checkCell( body.cell );
		if ( ! cell || cell.world !== world ) throw bad();
		if ( action === 'unapprove' ) await db.prepare( 'DELETE FROM challenge_places WHERE world = ? AND cell_row = ? AND cell_column = ?' ).bind( world, cell.row, cell.column ).run();
		else {

			const { lat, lon } = cellMiddle( world, cell.row, cell.column );
			const named = nameCell( world, lat, lon, await townsFor( env, context.url ) );
			const added = await db.prepare( `INSERT INTO challenge_places ( world, cell_row, cell_column, name, region, lat, lon, created_at ) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
				WHERE ( SELECT COUNT(*) FROM challenge_places WHERE world = ?1 ) < ?9 ON CONFLICT DO NOTHING` ).bind( world, cell.row, cell.column, named.name, named.region, lat, lon, now, APPROVED ).run();
			if ( ! added.meta.changes && ! await db.prepare( 'SELECT 1 FROM challenge_places WHERE world = ? AND cell_row = ? AND cell_column = ?' ).bind( world, cell.row, cell.column ).first() ) {

				throw new HttpError( 409, `At most ${ APPROVED } places a world`, { reason: 'full' } );

			}

		}

		return adminAnswer( context );

	}

	if ( action !== 'pick' && action !== 'unpick' ) throw bad();
	const period = parsePeriod( body.period );
	if ( ! period || period.ends <= now || period.starts > now + AHEAD * DAY ) throw bad();
	const pick = action === 'pick' ? await checkPick( context, db, body ) : null;
	const isLive = period.starts <= now;
	// The live one, and those live beside it and the one before (for the rotation's choice, clear of
	// them, if it's back to the rotation).
	const before = periodOf( period.kind, period.starts - 1 );
	const around = isLive ? ( await db.prepare( 'SELECT * FROM challenges WHERE period IN ( ?, ?, ?, ? ) AND world = ? AND replaced_at IS NULL' ).bind( ...periodsAt( now ).map( p => p.key ), before.key, world ).all() ).results : [];
	const fixed = around.find( row => row.period === period.key ) ?? null;
	const writes = pick
		? [ db.prepare( `INSERT INTO challenge_picks ( period, world, kind, place, region, lat, lon, heading, created_at ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ? )
			ON CONFLICT ( period, world ) DO UPDATE SET kind = excluded.kind, place = excluded.place, region = excluded.region, lat = excluded.lat, lon = excluded.lon,
			heading = excluded.heading, created_at = excluded.created_at` ).bind( period.key, world, pick.kind, pick.name, pick.region, pick.lat, pick.lon, pick.heading ?? null, now ) ]
		: [ db.prepare( 'DELETE FROM challenge_picks WHERE period = ? AND world = ?' ).bind( period.key, world ) ];
	if ( fixed && ! pick && fixed.source === 'rotation' ) {

		// Back to the rotation on a live one the rotation chose: it's the rotation's already, so it
		// stays as it is, its board going on, whatever the rotation would choose now (an approval since
		// reshuffles its order). Only a pick for it, if there was one, goes.
		await db.batch( writes );
		return adminAnswer( context );

	}

	if ( fixed ) {

		// What it would be now: the pick, or the rotation's (clear of the others live and the one
		// before, as they're fixed).
		const approved = ( await db.prepare( 'SELECT * FROM challenge_places' ).all() ).results;
		const chosen = pick ? { place: pick, kind: pick.kind, source: 'owner' } : await rotationPick( env, period, world, approved, around );
		const made = await challengeFor( env, period, world, chosen, now );
		if ( made.kind === fixed.kind && made.place === fixed.place && made.region === fixed.region && made.route === fixed.route ) {

			// The same challenge as the live one (a pick of the place and kind it already is, or back to
			// the rotation on one of the owner's that the rotation would choose as it is): nothing to
			// replace, so its board goes on, with no warning; only whose it's said to be changes.
			await db.batch( [ ...writes, db.prepare( 'UPDATE challenges SET source = ? WHERE id = ?' ).bind( made.source, fixed.id ) ] );
			live = null;
			return adminAnswer( context );

		}

		if ( fixed.drivers > 0 && body.live !== true ) {

			throw new HttpError( 409, 'That challenge is live: changing it starts a new board', { reason: 'live', drivers: fixed.drivers } );

		}

		// The live one replaced: kept, with its board (finished now: its final places written), and
		// the new one fixed from the pick (or the rotation) as the period's first ask would.
		await db.batch( [
			...writes,
			db.prepare( 'UPDATE challenges SET replaced_at = ? WHERE id = ? AND replaced_at IS NULL' ).bind( now, fixed.id ),
			...finishQueries( db, fixed.id, now ),
			insertQuery( db, made ),
		] );
		live = null;

	} else await db.batch( writes );

	return adminAnswer( context );

}

// --- the live challenges ---

// The six live challenges' rows (the day's, the week's and the month's on the Earth, then the
// Moon), fixed in D1 the first time each is asked for in its period (from the owner's pick, or the
// rotation's), kept LIVE_KEPT ms in this Worker instance. Those to fix are fixed the longest first
// (the month, the week, then the day), each of the rotation's clear of those fixed already, those
// fixed here included, and of the periods before (read with the owner's picks): so whatever chose
// them, and whatever has changed since (the approved places, this code), the three live on a world
// are three places and none is the one before's. Challenges whose period ended at least GRACE ago
// are given their final places as this goes (finishEnded), in the background: it's no part of the
// answer, so it can neither slow one nor turn one into an error.
export async function liveChallenges( context ) {

	const { env, now } = context;
	const known = liveKnown( now );
	if ( known ) return known;
	const periods = periodsAt( now );
	const keys = periods.map( period => period.key ).join( ',' );
	const db = database( env );
	const select = () => db.prepare( `SELECT * FROM challenges WHERE period IN ( ?, ?, ? ) AND replaced_at IS NULL` ).bind( ...periods.map( period => period.key ) ).all();
	let rows = ( await select() ).results;
	const missing = periods.flatMap( period => WORLDS.map( world => ( { period, world } ) ) ).filter( ( { period, world } ) => ! rows.some( row => row.period === period.key && row.world === world ) );
	if ( missing.length ) {

		const [ picks, places, before ] = await db.batch( [
			db.prepare( 'SELECT * FROM challenge_picks WHERE period IN ( ?, ?, ? )' ).bind( ...periods.map( period => period.key ) ),
			db.prepare( 'SELECT * FROM challenge_places' ),
			db.prepare( 'SELECT * FROM challenges WHERE period IN ( ?, ?, ? ) AND replaced_at IS NULL' ).bind( ...periods.map( period => periodOf( period.kind, period.starts - 1 ).key ) ),
		] );
		const fixed = [ ...rows, ...before.results ];
		const made = [];
		missing.sort( ( a, b ) => PERIOD_KINDS.indexOf( b.period.kind ) - PERIOD_KINDS.indexOf( a.period.kind ) );
		for ( const { period, world } of missing ) {

			const pick = picks.results.find( p => p.period === period.key && p.world === world );
			const challenge = await challengeFor( env, period, world, pick ? pickedPlace( pick ) : await rotationPick( env, period, world, places.results, fixed ), now );
			made.push( challenge );
			fixed.push( { period: challenge.period, world, kind: challenge.kind, place: challenge.place, route: challenge.route, starts_at: challenge.startsAt, ends_at: challenge.endsAt } );

		}

		// (Two instances fixing the same period at once: the first one's row stays, and both read it.)
		await db.batch( made.map( challenge => insertQuery( db, challenge ) ) );
		rows = ( await select() ).results;

	}

	await later( context.ctx, finishEnded( db, now ), 'Finishing challenges' );
	rows.sort( ( a, b ) => WORLDS.indexOf( a.world ) - WORLDS.indexOf( b.world ) || PERIOD_KINDS.indexOf( periodKind( a.period ) ) - PERIOD_KINDS.indexOf( periodKind( b.period ) ) );
	live = { keys, at: now, rows };
	return rows;

}

// The six live challenges' rows as this instance has them for `now`, or null when it hasn't (none
// yet, from another period, or older than LIVE_KEPT).
function liveKnown( now ) {

	const keys = periodsAt( now ).map( period => period.key ).join( ',' );
	return live?.keys === keys && now >= live.at && now - live.at < LIVE_KEPT ? live.rows : null;

}

// A challenge to fix for `period` on `world`, chosen as `chosen` ({ place, kind, source }): its row's
// values, with its route laid out from the period's own random numbers.
export async function challengeFor( env, period, world, { place, kind, source }, now ) {

	const random = randomFrom( await seed( env, `route:${ period.key }:${ world }:${ kind }:${ place.lat },${ place.lon }` ) );
	const route = makeRoute( { kind, size: period.kind, world, place }, random, world === 'moon' ? await moonCheck( env ) : null );
	return { period: period.key, world, kind, place: place.name, region: place.region ?? '', route: JSON.stringify( route ), source, startsAt: period.starts, endsAt: period.ends, createdAt: now };

}

function insertQuery( db, c ) {

	return db.prepare( `INSERT INTO challenges ( period, world, kind, place, region, route, source, starts_at, ends_at, created_at ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ? ) ON CONFLICT DO NOTHING` )
		.bind( c.period, c.world, c.kind, c.place, c.region, c.route, c.source, c.startsAt, c.endsAt, c.createdAt );

}

// The rotation's choice for `period` on `world`: { place, kind, source: 'rotation' }. It goes round
// the places (the featured ones and `approved`, challenge_places' rows) in an order shuffled afresh
// each time round, by HMACs of the round and each place with the Worker's derived key, one a period
// (its own place, the next in the order): so every instance agrees, and each place comes about once
// a round. Two rules on top. The three live on a world are three places: a period never takes the
// place of a longer period it's in (a day its week's or its month's; a week the month it starts in
// or the one it ends in), nor of a period of another kind fixed live beside it. And no place comes
// twice in a row: a period never takes the period before's place. One whose own place is ruled out
// steps aside to the place half a round on in the order, or the first free one after that, never
// the next or the last in the order (the periods either side's own places).
//
// Those periods' places are as `fixed` has them (challenges' rows: what D1 has fixed, by whoever
// chose them and whatever the places were then), and as the rotation would choose them where it
// hasn't one (a period not yet fixed, or without `fixed`, as the rules' tests and its own working
// back ask). Every instance reads the same rows, so it still agrees. Without `fixed` it's kept in
// this instance, as working back asks for the same periods again and again.
export async function rotationPick( env, period, world, approved, fixed = null ) {

	const places = candidates( world, approved );
	if ( fixed ) return rotate( env, period, world, approved, places, fixed );
	// (Kept for this instance: a day's asks for its week's and month's, and the admin page for six.)
	const key = `${ env.TURNSTILE_SECRET }:${ period.key }:${ world }:${ places.map( place => place.id ).join( ',' ) }`;
	if ( ! picked.has( key ) ) {

		if ( picked.size >= 256 ) picked.clear();
		picked.set( key, rotate( env, period, world, approved, places, [] ).catch( err => {

			picked.delete( key );
			throw err;

		} ) );

	}

	return picked.get( key );

}

// The period before's pick is only worked out where it could be this one's own place: at a round's
// start (a new order, whose first may be the last round's last), and where this one steps aside
// anyway. Anywhere else it's the order's last place, or a step aside, which is never to the next
// place in the order: neither is this one's. So working back goes on only through periods that each
// start a round or step aside, and as a round's own places are all different, only a few of a
// round's periods can step aside (those whose own place is one of the few the longer periods over
// them took): it always ends within a round, a few periods back at most.
//
// With `fixed`, the places fixed live beside it and the one before are always kept clear of: they
// may be anything (an owner's pick, a place since unapproved, a pick from a list since changed).
async function rotate( env, period, world, approved, places, fixed ) {

	const before = periodOf( period.kind, period.starts - 1 );
	const near = fixed.filter( row => row.world === world && row.period !== period.key && ( row.period === before.key
		|| ( periodKind( row.period ) !== period.kind && row.starts_at < period.ends && row.ends_at > period.starts ) ) );
	const shunned = near.map( pinOf );
	const known = new Set( near.map( row => row.period ) );
	const longer = period.kind === 'day' ? [ periodOf( 'week', period.starts ), periodOf( 'month', period.starts ) ]
		: period.kind === 'week' ? [ periodOf( 'month', period.starts ), periodOf( 'month', period.ends - 1 ) ] : [];
	for ( const over of longer ) if ( ! known.has( over.key ) ) shunned.push( ( await rotationPick( env, over, world, approved ) ).place );
	const avoided = place => shunned.some( other => samePlace( world, place, other ) );
	const count = places.length;
	const index = periodIndex( period );
	const round = Math.floor( index / count );
	const order = await orderOf( env, period.kind, world, round, places );
	let at = index % count;
	if ( index > 0 && ! known.has( before.key ) && ( at === 0 || avoided( order[ at ] ) ) ) shunned.push( ( await rotationPick( env, before, world, approved ) ).place );
	if ( avoided( order[ at ] ) ) {

		const half = Math.floor( count / 2 );
		for ( let k = 0; k < count; k ++ ) {

			const next = ( at + half + k ) % count;
			if ( ! avoided( order[ next ] ) && Math.abs( next - at ) > 1 ) {

				at = next;
				break;

			}

		}

	}

	const kind = kindFor( period.kind, randomFrom( await seed( env, `kind:${ period.key }:${ world }` ) )() );
	return { place: order[ at ], kind, source: 'rotation' };

}

// `places` in the order of `round` of `kind`'s periods on `world`: sorted by an HMAC of the round and
// each place's id. (Kept for this instance: a round's periods all ask for it.)
function orderOf( env, kind, world, round, places ) {

	const key = `${ env.TURNSTILE_SECRET }:${ kind }:${ world }:${ round }:${ places.map( place => place.id ).join( ',' ) }`;
	if ( ! orders.has( key ) ) {

		if ( orders.size >= 64 ) orders.clear();
		orders.set( key, Promise.all( places.map( place => seed( env, `order:${ kind }:${ world }:${ round }:${ place.id }` ).then( hex ) ) ).then( tags => places
			.map( ( place, i ) => [ tags[ i ], place ] ).sort( ( a, b ) => a[ 0 ] < b[ 0 ] ? - 1 : a[ 0 ] > b[ 0 ] ? 1 : 0 ).map( ( [ , place ] ) => place ) ).catch( err => {

			orders.delete( key );
			throw err;

		} ) );

	}

	return orders.get( key );

}

// Whether places `a` and `b` ({ id?, name, lat, lon }) on `world` are one to the rotation's rules:
// by their ids, where both are the rotation's own; else by their names, or pins within NEAR m.
function samePlace( world, a, b ) {

	if ( a.id !== undefined && b.id !== undefined ) return a.id === b.id;
	return a.name === b.name || metresOn( world, a.lat, a.lon, b.lat, b.lon ) < NEAR;

}

// A fixed challenge's place ({ name, lat, lon }): its name, and its pin, where a sprint and
// collectibles start and where a landmark's drive ends. (One the admin page has worked out but not
// fixed has its pin as it is.)
function pinOf( row ) {

	if ( row.pin ) return row.pin;
	const route = JSON.parse( row.route );
	const [ lat, lon ] = row.kind === 'landmark' ? route.points[ 0 ] : [ route.start.lat, route.start.lon ];
	return { name: row.place, lat, lon };

}

// The places the rotation goes round on `world`: the featured ones, then the approved drop-in places.
function candidates( world, approved ) {

	return [
		...FEATURED[ world ],
		...approved.filter( place => place.world === world ).map( place => ( { id: `cell:${ place.world }:${ place.cell_row }:${ place.cell_column }`, name: place.name, region: place.region, lat: place.lat, lon: place.lon } ) ),
	];

}

// An owner's pick (challenge_picks' row) as rotationPick's choice is.
function pickedPlace( pick ) {

	return { place: { name: pick.place, region: pick.region, lat: pick.lat, lon: pick.lon, ...( pick.heading === null ? {} : { heading: pick.heading } ) }, kind: pick.kind, source: 'owner' };

}

// What an admin's pick says: { kind, name, region, lat, lon, heading }, or a 400.
async function checkPick( context, db, body ) {

	const { world, kind, place } = body;
	if ( ! KINDS.includes( kind ) || ! isObject( place ) ) throw bad();
	if ( typeof place.featured === 'string' ) {

		const found = FEATURED[ world ].find( p => p.id === place.featured );
		if ( ! found ) throw bad();
		return { kind, name: found.name, region: found.region, lat: found.lat, lon: found.lon, heading: found.heading };

	}

	if ( typeof place.cell === 'string' ) {

		const cell = checkCell( place.cell );
		if ( ! cell || cell.world !== world ) throw bad();
		const { lat, lon } = cellMiddle( world, cell.row, cell.column );
		const approved = await db.prepare( 'SELECT name, region FROM challenge_places WHERE world = ? AND cell_row = ? AND cell_column = ?' ).bind( world, cell.row, cell.column ).first();
		const named = approved ?? nameCell( world, lat, lon, await townsFor( context.env, context.url ) );
		return { kind, name: named.name, region: named.region ?? '', lat, lon };

	}

	const name = cleanPlace( place.name );
	const region = place.region === undefined || place.region === '' ? '' : cleanPlace( place.region );
	const { lat, lon, heading } = place;
	if ( ! name || region === null || ! Number.isFinite( lat ) || ! Number.isFinite( lon ) || Math.abs( lat ) > 89.9 || Math.abs( lon ) > 180 ) throw bad();
	if ( heading !== undefined && heading !== null && ! ( Number.isFinite( heading ) && heading >= 0 && heading < 360 ) ) throw bad();
	return { kind, name, region, lat: round6( lat ), lon: round6( lon ), ...( Number.isFinite( heading ) ? { heading } : {} ) };

}

// Challenges over at least GRACE ago and not yet given their final places: their final_rank written
// into each player's time (1 the fastest, the owner's left out), and final_at. One indexed look
// (challenges_unfinished) when there are none.
async function finishEnded( db, now ) {

	const ended = ( await db.prepare( 'SELECT id FROM challenges WHERE final_at IS NULL AND ends_at <= ? LIMIT 12' ).bind( now - GRACE ).all() ).results;
	if ( ended.length ) await db.batch( ended.flatMap( row => finishQueries( db, row.id, now ) ) );

}

function finishQueries( db, id, now ) {

	return [
		db.prepare( `UPDATE challenge_times SET final_rank = ranked.place FROM (
			SELECT player_id, ROW_NUMBER() OVER ( ORDER BY ms, created_at, player_id ) AS place FROM challenge_times WHERE challenge_id = ?1 AND owner = 0
		) AS ranked WHERE challenge_times.challenge_id = ?1 AND challenge_times.player_id = ranked.player_id` ).bind( id ),
		db.prepare( 'UPDATE challenges SET final_at = ? WHERE id = ? AND final_at IS NULL' ).bind( now, id ),
		// Its ghosts: nothing races a finished challenge (a link to one shows its board instead).
		db.prepare( 'DELETE FROM challenge_ghosts WHERE challenge_id = ?' ).bind( id ),
	];

}

// --- boards ---

// The top `most` on challenge `id`'s board (the owner's runs left out), fastest first, with what a
// row shows.
function topQuery( db, env, id, most ) {

	return db.prepare( `SELECT p.name, t.ms, t.vehicle, t.created_at, t.run_id, ${ hasPass( 'p.account_id', '?3' ) } AS supporter, ${ xpOf( 'p' ) } AS xp, p.title
		FROM challenge_times t JOIN players p ON p.id = t.player_id WHERE t.challenge_id = ?1 AND t.owner = 0 ORDER BY t.ms, t.created_at, t.player_id LIMIT ?2` ).bind( id, most, supporterEmails( env ) );

}

// The player's best and rank on each of the challenges `ids` ({ [ id ]: { ms, rank, owner? } }),
// kept as the boards are: their rows by their keys (six at most), each rank found in its board's
// order (boardOrders), so a look costs the same few rows read however far down the boards they are,
// and however many players are asked as in turn.
async function myStanding( context, db, ids, player, miss ) {

	const key = mineKey( context.url, ids, player );
	const kept = await caches.default.match( key );
	if ( kept ) return kept.json();
	await miss();
	const rows = ( await db.prepare( `SELECT challenge_id, ms, owner, created_at, run_id FROM challenge_times WHERE player_id = ? AND challenge_id IN ( ${ ids.map( () => '?' ).join( ', ' ) } )` )
		.bind( player, ...ids ).all() ).results;
	const orders = await boardOrders( context, db, rows.map( row => row.challenge_id ), miss );
	// With the best's run (its ghost, to race) and its handle (a link to it, to share).
	const handles = await Promise.all( rows.map( row => handleOf( context.env, row.challenge_id, player ) ) );
	const mine = Object.fromEntries( rows.map( ( row, i ) => [ row.challenge_id, {
		ms: row.ms, rank: rankIn( orders.get( row.challenge_id ), row, player ), run: row.run_id, handle: handles[ i ], ...( row.owner ? { owner: true } : {} ),
	} ] ) );
	await caches.default.put( key, json( mine, 200, { 'Cache-Control': `public, max-age=${ CHALLENGE_CACHE }` } ) );
	return mine;

}

// The order of each of the boards `ids`: its first RANK_MOST times as [ ms, created_at, player ],
// quickest first (the same time: who set it first), the owner's left out, as a Map by id. From
// Cloudflare's cache; those it hasn't, read from the board's index in one batch (as many rows as the
// board has, RANK_MOST at most: orderQuery) and kept `seconds`. So a board is read whole at most once
// each ORDER_KEPT in a place (and again after a new best there: answerTime reads it afresh), whoever
// asks, rather than a count of the rows ahead for each player looked at.
async function boardOrders( context, db, ids, miss, seconds = ORDER_KEPT ) {

	const { url } = context;
	const orders = new Map();
	const kept = await Promise.all( ids.map( id => caches.default.match( orderKey( url, id ) ) ) );
	for ( const [ i, res ] of kept.entries() ) if ( res ) orders.set( ids[ i ], await res.json() );
	const missing = ids.filter( id => ! orders.has( id ) );
	if ( ! missing.length ) return orders;
	await miss();
	const read = await db.batch( missing.map( id => orderQuery( db, id ) ) );
	await Promise.all( missing.map( ( id, i ) => {

		const order = orderFrom( read[ i ].results );
		orders.set( id, order );
		return keepOrder( url, id, order, seconds );

	} ) );
	return orders;

}

// A board's order from D1: its first RANK_MOST rows by the board's index (challenge_times_board, its
// key ending in the player's id), which covers the query, so it reads those rows and no more.
function orderQuery( db, id ) {

	return db.prepare( `SELECT ms, created_at, player_id FROM challenge_times WHERE challenge_id = ? AND owner = 0 ORDER BY ms, created_at, player_id LIMIT ${ RANK_MOST }` ).bind( id );

}

function orderFrom( rows ) {

	return rows.map( row => [ row.ms, row.created_at, row.player_id ] );

}

// Board `id`'s `order` kept in Cloudflare's cache for `seconds`; nothing going wrong in it turns an
// answer into an error.
function keepOrder( url, id, order, seconds ) {

	return caches.default.put( orderKey( url, id ), json( order, 200, { 'Cache-Control': `public, max-age=${ seconds }` } ) ).catch( err => console.error( 'Challenge caches', err?.name, err?.message ) );

}

// The rank of `player`'s time ({ ms, created_at }) in a board's `order`: one more than the times
// ahead of it (quicker, or the same set earlier, or at the same moment by a player whose id sorts
// first), found by halving. Their own time in the order (as it was when it was read: only a better
// one has replaced it since, which is never ahead of it) isn't counted. An order of RANK_MOST times
// all ahead says RANK_MOST + 1 (the page's "1000+"). The owner's time (kept out of the order) gets
// the rank it would have.
export function rankIn( order, { ms, created_at: at }, player ) {

	let low = 0;
	let high = order.length;
	while ( low < high ) {

		const middle = ( low + high ) >> 1;
		const [ theirs, set, who ] = order[ middle ];
		if ( theirs < ms || ( theirs === ms && ( set < at || ( set === at && who < player ) ) ) ) low = middle + 1;
		else high = middle;

	}

	const own = order.findIndex( entry => entry[ 2 ] === player );
	return Math.min( own >= 0 && own < low ? low - 1 : low, RANK_MOST ) + 1;

}

// A board's row as the page shows it: the name, the time, the ride, the day it was set, the player's
// level and title as they are now, supporter only for a supporter; and the run's id, where it's
// asked for, which its ghost is fetched by (to race the board's leader): 12 random bytes the page
// chose, which say nothing of who.
function entryOf( row, i ) {

	const shown = { name: row.name, ms: row.ms, vehicle: row.vehicle, date: dateOf( row.created_at ), ...standingOf( row.xp, row.title ), ...( row.run_id ? { run: row.run_id } : {} ) };
	if ( Number.isInteger( i ) ) shown.rank = i + 1;
	else if ( row.rank ) shown.rank = row.rank;
	return row.supporter ? { ...shown, supporter: true } : shown;

}

// A challenge's row as the page has it.
function challengeOf( row ) {

	return {
		id: row.id, period: periodKind( row.period ), key: row.period, world: row.world, kind: row.kind,
		place: row.place, region: row.region, route: JSON.parse( row.route ), startsAt: row.starts_at, endsAt: row.ends_at,
	};

}

function periodKind( key ) {

	return key.slice( 0, key.indexOf( ':' ) );

}

// Where the list's tops for the challenges `ids`, a board, and a player's own rows are kept in the
// cache.
function listKey( url, ids ) {

	return new Request( `${ url.origin }/api/challenges/list?ids=${ ids.join( ',' ) }` );

}

function mineKey( url, ids, player ) {

	return new Request( `${ url.origin }/api/challenges/list?ids=${ ids.join( ',' ) }&player=${ player }` );

}

function boardKey( url, challenge, player = '' ) {

	return new Request( `${ url.origin }/api/challenges/board?challenge=${ challenge }${ player ? `&player=${ player }` : '' }` );

}

// Where a board's order (boardOrders) is kept.
function orderKey( url, challenge ) {

	return new Request( `${ url.origin }/api/challenges/order?challenge=${ challenge }` );

}

// Where a link's answer (linkData) and a run's ghost (challengeGhost) are kept.
function linkKey( url, challenge, vs ) {

	return new Request( `${ url.origin }/api/challenges/link?challenge=${ challenge }${ vs ? `&vs=${ vs }` : '' }` );

}

function ghostKey( url, challenge, run ) {

	return new Request( `${ url.origin }/api/challenges/ghost?challenge=${ challenge }&run=${ run }` );

}

// The handle of `player`'s time on `challenge`: the first 12 bytes of an HMAC of both with the
// challenges' derived key (seed), as base64url. What a link names a time by: the same for that
// player's best on that challenge however often it's bettered, unmade by anyone without the
// Worker's secret, and nothing of who (the player's id is half of their credentials, and in a link
// would let anyone look them up on every board).
export async function handleOf( env, challenge, player ) {

	return base64url( ( await seed( env, `handle:${ challenge }:${ player }` ) ).slice( 0, 12 ) );

}

// Where a time's answer is kept for the same run posted again (postTime).
function answerKey( url, challenge, player, run ) {

	return new Request( `${ url.origin }/api/challenges/time?challenge=${ challenge }&player=${ player }&run=${ run }` );

}

// The player asked about (?id=), or null; a 400 if it isn't one.
function askedPlayer( url ) {

	const id = url.searchParams.get( 'id' );
	if ( id !== null && ! PLAYER_ID.test( id ) ) throw bad();
	return id;

}

// CHALLENGE_LOOKS (Cloudflare's rate limiter: no Durable Object request) for the lists, the boards
// and the times posted: a burst of them (a script) is turned away before it reads anything. Each
// address (an IPv6 one by its /48) is counted by lookKey, never as itself. Returns the request's
// miss(): CHALLENGE_MISSES asked, once, the first time a list or a board finds something it needs
// missing from Cloudflare's cache and is to read D1 (a board's rows, the list's tops, a player's
// own, a board's order), and a 429 past it; a page's own looks (the list as it opens, a board or
// two, the list again after a time) are a few a minute, and those the cache has cost nothing.
async function looks( { env, request, now } ) {

	const key = env.CHALLENGE_LOOKS || env.CHALLENGE_MISSES ? await lookKey( env, request, now ) : null;
	if ( env.CHALLENGE_LOOKS && ! ( await env.CHALLENGE_LOOKS.limit( { key } ) ).success ) throw tooMany();
	let asked = null;
	return () => asked ??= ( async () => {

		if ( env.CHALLENGE_MISSES && ! ( await env.CHALLENGE_MISSES.limit( { key } ) ).success ) throw tooMany();

	} )();

}

function tooMany() {

	return new HttpError( 429, 'Too many. Try again in a minute', { retryAfter: 60 }, { 'Retry-After': '60' } );

}

// The key CHALLENGE_LOOKS and CHALLENGE_MISSES count an address by: an HMAC of the day and the
// address with the challenges' derived key (seed), so no address is handed to the rate limiter as it
// is, and tomorrow's key for it is another (as DriveLimits counts by a hash with the day's salt,
// without asking it for the salt: that would be a Durable Object request a look). An IPv6 address by
// its /48 (dropins.js's VISITOR_PREFIX): a /48, which a free tunnel broker hands out, holds 65,536
// /64s, each of which would otherwise have limits of its own.
export async function lookKey( env, request, now ) {

	return hex( await seed( env, `look:${ dateOf( now ) }:${ addressOf( request, VISITOR_PREFIX ) }` ) ).slice( 0, 32 );

}

// --- the admin page's busy places ---

// Part 1's top places over the last BUSY_DAYS on each world that aren't featured ones (topPlaces), for
// the owner to choose from or approve, with each one's cell: kept BUSY_KEPT ms in this instance.
async function busyPlaces( context, db ) {

	const { env, url, now } = context;
	if ( busy && now >= busy.at && now - busy.at < BUSY_KEPT ) return busy.places;
	const from = dateOf( now - ( BUSY_DAYS - 1 ) * DAY );
	const to = dateOf( now );
	const towns = await townsFor( env, url );
	const places = {};
	for ( const world of WORLDS ) {

		const top = await topPlaces( db, { world, from, to, most: 25 }, towns );
		places[ world ] = top.filter( place => ! place.featured ).map( place => ( { name: place.name, region: place.region, lat: place.lat, lon: place.lon, n: place.n, days: place.days, cell: cellOf( world, place.lat, place.lon ) } ) );

	}

	busy = { at: now, places };
	return places;

}

// --- the Moon's ground ---

// A check of a Moon route's faults for makeRoute, on the Moon's own heights (fetched from the site's
// files once per Worker instance), or null if they can't be had just now (the route is laid out
// unchecked, as the Earth's are).
async function moonCheck( env ) {

	if ( ! hasHeights() ) {

		moonLoading ??= ( async () => {

			try {

				const res = await env.ASSETS?.fetch( new Request( `${ SITE }/moon/height.bin` ) );
				if ( res?.ok ) setHeights( new Int16Array( await res.arrayBuffer() ) );

			} catch ( err ) {

				console.error( 'Moon heights', err?.name, err?.message );

			}

		} )();
		await moonLoading;
		moonLoading = null;

	}

	return hasHeights() ? moonFaults : null;

}

// A route of `kind`'s faults on the Moon: POINT_FAULTS for each of its points (and its start) on
// ground sloping MOON_SLOPE degrees or more, and one for each steep stretch along its legs in their
// order (legFaults: a sprint's from the start through its gates, a landmark's from the start to it;
// collectibles are taken in any order, so theirs aren't known). The place itself (a sprint's or
// collectibles' start, a landmark's goal) is where it is, the same in every one laid out, so it isn't
// counted: no faults means nothing that could be better, and makeRoute stops there. Counting stops
// once it reaches `enough` (makeRoute's best so far: a route with as many is no better), so a try
// that's no better costs only as much of its legs as it takes to tell.
export function moonFaults( route, kind, enough = Infinity ) {

	const points = [ [ route.start.lat, route.start.lon ], ...route.points ];
	const own = kind === 'landmark' ? 1 : 0;
	let faults = points.filter( ( point, i ) => i !== own && moonSteep( ...point ) ).length * POINT_FAULTS;
	if ( kind === 'collect' ) return faults;
	for ( let i = 1; i < points.length && faults < enough; i ++ ) faults += legFaults( ...points[ i - 1 ], ...points[ i ], enough - faults );
	return faults;

}

// How many stretches of LEG_REACH m along the straight line from ( lat, lon ) to ( toLat, toLon ) on
// the Moon rise or fall MOON_SLOPE degrees or more (a crater's wall, or a mountain's side, on the
// way): heights every LEG_STEP m, craters under MOON_DETAIL m left out, each steep stretch counted
// once (the next looked at from its end). Counted from the start, up to `enough` at most (the
// heights past where it got to aren't read). With `enough` 1 it's only whether there's any, which
// is the same looked for from either end: from the far one, where a landmark's own crater wall or
// mountainside is, so a leg that crosses one is told in a few reads.
export function legFaults( lat, lon, toLat, toLon, enough = Infinity ) {

	const length = metresOn( 'moon', lat, lon, toLat, toLon );
	const steps = Math.ceil( length / LEG_STEP );
	if ( steps < 1 || enough < 1 ) return 0;
	const bearing = bearingTo( 'moon', lat, lon, toLat, toLon );
	const step = length / steps;
	const heights = [];
	const height = i => heights[ i ] ??= moonHeightAt( ...destination( 'moon', lat, lon, bearing, i * step ), MOON_DETAIL );
	const across = Math.max( 1, Math.round( LEG_REACH / step ) );
	const most = Math.tan( MOON_SLOPE * Math.PI / 180 ) * across * step;
	if ( enough === 1 ) {

		for ( let i = steps - across; i >= 0; i -- ) if ( Math.abs( height( i + across ) - height( i ) ) >= most ) return 1;
		return 0;

	}

	let faults = 0;
	for ( let i = 0; i + across <= steps && faults < enough; i ++ ) {

		if ( Math.abs( height( i + across ) - height( i ) ) < most ) continue;
		faults ++;
		i += across - 1;

	}

	return faults;

}

// Whether the Moon's ground at ( lat, lon ) slopes MOON_SLOPE degrees or more across ±SLOPE_REACH m
// (craters under MOON_DETAIL m left out).
export function moonSteep( lat, lon ) {

	const [ n, e, s, w ] = [ 0, 90, 180, 270 ].map( bearing => moonHeightAt( ...destination( 'moon', lat, lon, bearing, SLOPE_REACH ), MOON_DETAIL ) );
	return Math.hypot( n - s, e - w ) / ( 2 * SLOPE_REACH ) >= Math.tan( MOON_SLOPE * Math.PI / 180 );

}

// --- the period's random numbers ---

// The HMAC-SHA256 of `text` with a key derived (HKDF) from TURNSTILE_SECRET with a label of its own:
// the same in every Worker instance, and not to be worked out without the secret.
async function seed( env, text ) {

	if ( typeof env.TURNSTILE_SECRET !== 'string' || ! env.TURNSTILE_SECRET ) throw new HttpError( 503, 'Not set up yet' );
	if ( seeding?.secret !== env.TURNSTILE_SECRET ) {

		const base = await crypto.subtle.importKey( 'raw', encoder.encode( env.TURNSTILE_SECRET ), 'HKDF', false, [ 'deriveKey' ] );
		const key = crypto.subtle.deriveKey( { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array( 0 ), info: encoder.encode( SEED_LABEL ) }, base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, [ 'sign' ] );
		seeding = { secret: env.TURNSTILE_SECRET, key };

	}

	return new Uint8Array( await crypto.subtle.sign( 'HMAC', await seeding.key, encoder.encode( text ) ) );

}

function hex( bytes ) {

	return [ ...bytes ].map( b => b.toString( 16 ).padStart( 2, '0' ) ).join( '' );

}

// `text` as it can go in HTML, in an attribute's quotes or between tags.
export function escapeHtml( text ) {

	return String( text ).replace( /[&<>"']/g, c => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' } )[ c ] );

}

function round6( degrees ) {

	return Math.round( degrees * 1e6 ) / 1e6;

}

function bad() {

	return new HttpError( 400, 'Bad request' );

}
