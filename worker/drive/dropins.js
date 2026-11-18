import { json } from '../http.js';
import { CELL, RADIUS, WORLDS, cellBounds, cellMiddle, cellOf, checkCell, metresOn } from '../../src/drive-app/dropin-cells.js';
import { dayOf } from '../../src/drive-app/levels.js';
import { SPOTS } from '../../src/drive-app/places.js';
import { PLACES_ON } from '../../src/drive-app/world-places.js';
import { EARTH, OFF_EARTH, WORLDS as WORLD_DATA } from '../../src/drive-app/worlds.js';
import { PLACES } from '../../drive/site/places.js';
import { database } from './players.js';
import { addressOf, setting } from './settings.js';
import { KEEP_DAYS, adminAccount, askedDays } from './admin.js';

// Where people drop in (docs/world-drive.md, "Where people drop in"): each drop-in's place, a cell
// of src/drive-app/dropin-cells.js's grid (about a kilometre each way), counted a day in D1's
// dropins_daily for the owner's admin page: a heat map of each world and its top places. The page
// posts a drop-in's cell with the drop-in's own count in its play stats (stats.js's POST
// /api/stats), so it costs no request of its own; DriveLimits (limits.js) says which to count: a
// cell once a day for each visitor (an address; an IPv6 one by its /48) and once for each visit, and
// no more than a world's day's, a visitor's and a visit's worth. An Earth place only from a visit
// the Earth's caps let through, and none from the owner's (its token says so: visits.js). Only
// counts of cells: nothing of who, which visit or from where, and no finer than the cell.
//
// For what comes next (challenges picked from where people go), topPlaces is the query: a world's
// most dropped-in places over a period, named, a featured place's cells together; and topCells the
// cells themselves. Their ranking can be pushed by anyone with many addresses passing the robot
// check (a place on a world but the Earth most cheaply: their visits aren't capped), so it's a list
// to offer the owner, not one to pick from blindly: see topPlaces.
//
// Settings, none of which need setting: DROPIN_PLACES_DAILY, DROPIN_PLACES_PER_VISITOR and
// DROPIN_PLACES_PER_VISIT, the most places counted a day on each world for everyone (DAILY), for
// each visitor (PER_VISITOR) and for each visit (PER_VISIT); DROPIN_ASKS_PER_VISIT, the most times
// a day DriveLimits hears a visit's places (ASKS times its places). ADMIN_LOOKS: the rate limiter
// binding for the admin page's asks (admin.js).

// Each drop-in takes a while (the flight down, the ground loading, the drive), so a visit's places
// are counted no faster than one each GAP ms of it. Real visits drop in a handful of times, at a
// handful of places; a long one at a party more, often at the same places again. A day's places on
// each world: about 300 Earth visits a day (the visit caps) with a place or two each, and room to
// grow; it bounds what one admin look reads (see adminDropins). A visitor, for the places, is an
// address, an IPv6 one by its /48 (settings.js's addressOf): a /64 each would let one free tunnel
// broker's /48 add 65,536 visitors to a cell.
export const DAILY = 1500;
export const PER_VISITOR = 30;
export const PER_VISIT = 10;
export const GAP = 10000;
export const VISITOR_PREFIX = 48;
// A visit is heard by DriveLimits at most ASKS times its places a day (each ask is a Durable Object
// request: an honest page asks once a post with new places, a few times a visit); then, or once it
// can add no more places, this Worker instance stops asking for it (doneVisits).
const ASKS = 2;
// The admin page is told each world's top TOP places named, and its HEAT most dropped-in cells for
// the heat map (the rest, single drop-ins scattered about, are only counted in its totals).
const TOP = 25;
const HEAT = 2000;
// An admin look's answer is kept KEPT ms in this Worker instance (KEPT_LONG for a period longer than
// LONG days), for each period and day, so the page's buttons clicked again and again don't read each
// world's rows for the period again: a year's look reads up to 547,500 rows a world at the day's
// caps. At most ANSWERS of them (the page's five periods, and a few more asked by hand).
const KEPT = 10 * 60 * 1000;
const KEPT_LONG = 60 * 60 * 1000;
const LONG = 30;
const ANSWERS = 8;
// How a cell is named: a featured place (a start spot, a place's page, another world's place) whose
// pin is within FEATURED_REACH m of the cell (in it, or so near its edge that a drop-in there, which
// starts within 60 m of the pin on the street or a bridge's deck found nearest it, or a search of it
// pinned a little off, can be in it) is its name, and its cells are one place; else the nearest town
// (drive/public/places/towns.tsv) or featured place within NEAR m: a town's own name within TOWN m,
// else how far it is and which way ("12 km NE of Lyon", "1 km S of Golden Gate Bridge"); else its
// coordinates. The other worlds' places are few and far apart, so they name cells further off, more
// or less in step with the world's size: 300 km on the Moon, 500 km on Mars (about twice the
// Moon's size), 70 km on Vesta (263 km across its sphere, with about 120 named features) and 100 km
// on Ceres (470 km, about 130).
const FEATURED_REACH = 250;
const TOWN = 2000;
const NEAR = { earth: 50000, moon: 300000, mars: 500000, vesta: 70000, ceres: 100000 };
const TOWNS = '/places/towns.tsv';
const SITE = 'https://worlddrive.app';
const COMPASS = [ 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW' ];
const DAY = 24 * 60 * 60 * 1000;

// The game's own places, with the link that opens it there: the start spots and each other world's
// places (world-places.js: the Moon's, Mars's, Vesta's, Ceres's) by id, and the places' pages'
// others by where their Drive here pins them (drive/site/build.js's playLink).
const FEATURED_PLACES = {
	earth: [
		...SPOTS.map( spot => ( { name: spot.name, region: spot.region, lat: spot.lat, lon: spot.lon, link: `/?spot=${ spot.id }` } ) ),
		...PLACES.filter( place => place.at ).map( place => ( { name: place.name, region: place.region, lat: place.at.lat, lon: place.at.lon, link: atLink( place.at.lat, place.at.lon, place.name, place.region, EARTH, place.at.heading ) } ) ),
	],
	...Object.fromEntries( OFF_EARTH.map( world => [ world, ( PLACES_ON[ world ] ?? [] ).map( place => ( { name: place.name, region: place.region, lat: place.lat, lon: place.lon, link: `/?spot=${ place.id }` } ) ) ] ) ),
};

// The day DriveLimits last said each world's places today were all counted, so this Worker
// instance asks it no more for that world that day (each ask is a Durable Object request).
const fullDay = Object.fromEntries( WORLDS.map( world => [ world, null ] ) );
// Visits DriveLimits said can add no more places today, by id, each with when that ends (its token
// running out, or midnight UTC if sooner): this Worker instance asks no more for them, as live.js
// does with the visits it has turned away.
const doneVisits = new Map();
// The towns, read from the site's files once per Worker instance (readTowns), or null till then.
let towns = null;
// The admin page's answers kept (KEPT), by "<days>:<today>": { at, body }, the answer and when it
// was worked out (by the request's clock).
const answers = new Map();
// Each world's featured places' cells (featuredAt), worked out once per Worker instance.
let featured = null;

// The places of a post to /api/stats (`places`: dropin-cells.js's checkPlaces, cells of drop-ins the
// same post counts) from `visit` (readVisit's) at `now`: those DriveLimits says to count added to
// today's rows. How many were. Never in the stats' way: a count that fails is only logged.
export async function recordPlaces( { request, env, limits, now }, visit, places ) {

	const day = dayOf( now );
	// An Earth place only from a visit the Earth's caps let through (a free world's visit's token,
	// which costs nothing but the robot check, posts the free worlds' alone: worlds.js, every one but
	// the Earth), none from the owner's (who opens the game at the admin page's places to look at
	// them), and none on a world whose places today are all counted, nor from a visit that can add
	// no more.
	if ( visit.owner ) return 0;
	const asking = places.filter( cell => ( visit.earth || WORLD_DATA[ cell.world ].free ) && fullDay[ cell.world ] !== day );
	if ( ! asking.length || ! env.DB || doneVisits.get( visit.id ) > now ) return 0;
	try {

		const perVisit = setting( env.DROPIN_PLACES_PER_VISIT, PER_VISIT );
		const { cells, full, done } = await limits.places( addressOf( request, VISITOR_PREFIX ), {
			now, visit: visit.id, since: visit.issuedAt, cells: asking.map( cell => cell.key ),
			daily: setting( env.DROPIN_PLACES_DAILY, DAILY ),
			perVisitor: setting( env.DROPIN_PLACES_PER_VISITOR, PER_VISITOR ),
			perVisit, gap: GAP, asks: setting( env.DROPIN_ASKS_PER_VISIT, ASKS * Math.max( 1, perVisit ) ),
		} );
		for ( const world of WORLDS ) if ( full?.[ world ] ) fullDay[ world ] = day;
		if ( done ) {

			if ( doneVisits.size >= 1000 ) for ( const [ id, until ] of doneVisits ) if ( until <= now ) doneVisits.delete( id );
			doneVisits.set( visit.id, Math.min( visit.expiresAt, ( Math.floor( now / DAY ) + 1 ) * DAY ) );

		}

		const counted = asking.filter( cell => cells.includes( cell.key ) );
		if ( ! counted.length ) return 0;
		const upsert = env.DB.prepare( 'INSERT INTO dropins_daily ( world, day, cell_row, cell_column, n ) VALUES ( ?, ?, ?, ?, 1 ) ON CONFLICT ( world, day, cell_row, cell_column ) DO UPDATE SET n = n + 1' );
		await env.DB.batch( counted.map( cell => upsert.bind( cell.world, day, cell.row, cell.column ) ) );
		return counted.length;

	} catch ( err ) {

		console.error( 'Drop-in places', err?.name, err?.message );
		return 0;

	}

}

// The most dropped-in cells of `world` (one of WORLDS) from the UTC day `from` to `to`
// ('2026-11-16', both included), at most `most` (1 to HEAT): [ { world, row, column, lat, lon, n,
// days } ], the most first (then those on the most days), with each cell's middle, its drop-ins
// (each visitor once a day there) and on how many of the days it had any. One query, reading only
// that world's rows for those days (dropins_daily's key starts with the world and the day).
export async function topCells( db, { world, from, to, most = TOP } ) {

	return cellsOf( world, ( await cellsQuery( db, world, from, to, most ).all() ).results );

}

// The most dropped-in places of `world` from `from` to `to` (as topCells), at most `most` (TOP if
// not given; made from the period's HEAT busiest cells), as the admin page's top places are
// (placesOf): each featured place's cells as one place, named (with `named`, townsFor's or
// readTowns' towns, or null for the featured places alone) and with the game's link there; with
// `featuredOnly`, the featured places alone (the game's own start spots and places), busiest first.
// What challenges picked from where people go start from.
//
// Its ranking isn't proof against many addresses: each visitor is an address passing the robot
// check, and visits to the free worlds aren't capped, so someone with a few hundred addresses (or
// /48s) and robot checks can put a cell of their choosing (a private address, say) at the top of
// theirs, and of the Earth's at the cost of the day's drives. So a challenge picked by itself should
// be one of the featured places (featuredOnly), or a cell the owner has approved; the busy cells
// that aren't featured are for offering the owner to choose from. And it reads the period's rows
// each time it's called (up to DAILY a day of them), so a caller keeps what it picked (the challenge
// itself) rather than asking again for each request.
export async function topPlaces( db, { world, from, to, most = TOP, featuredOnly = false }, named = null ) {

	return placesOf( world, await topCells( db, { world, from, to, most: HEAT } ), named, Math.max( 1, Math.floor( most ) || 1 ), featuredOnly );

}

// One query for `world`'s most dropped-in cells from `from` to `to`, at most `most`, each with the
// period's totals for the world beside it (places: how many cells; dropins: all of theirs), counted
// over every cell before the most are taken: so the period's rows are read once.
function cellsQuery( db, world, from, to, most ) {

	if ( ! WORLDS.includes( world ) ) throw new Error( `No world ${ world }` );
	const limit = Math.min( HEAT, Math.max( 1, Math.floor( most ) || 1 ) );
	return db.prepare( `SELECT cell_row, cell_column, n, days, COUNT(*) OVER () AS places, SUM( n ) OVER () AS dropins FROM (
		SELECT cell_row, cell_column, SUM( n ) AS n, COUNT(*) AS days FROM dropins_daily
		WHERE world = ? AND day >= ? AND day <= ? GROUP BY cell_row, cell_column
	) ORDER BY n DESC, days DESC, cell_row, cell_column LIMIT ?` ).bind( world, from, to, limit );

}

function cellsOf( world, results ) {

	return results.map( r => ( { world, row: r.cell_row, column: r.cell_column, ...cellMiddle( world, r.cell_row, r.cell_column ), n: r.n, days: r.days } ) );

}

// `world`'s `cells` (cellsOf's, the most first) as places, the most first (then those on the most
// days, then in the cells' order), at most `most`: each featured place's cells as one (featuredAt:
// its pin's cell and any it's at the edge of, which its drop-ins can start in), each other cell by
// itself (left out with `featuredOnly`); named by nameCell with `named` (readTowns', or null).
// [ { lat, lon, n, days, cells, name, region, link, featured } ]: a featured place at its own pin,
// with n all its cells' drop-ins together and days the most of any one cell's (the place had
// drop-ins on at least that many); cells the middles of the cells in it, [ [ lat, lon ] ].
function placesOf( world, cells, named, most, featuredOnly = false ) {

	const merged = new Map();
	const all = [];
	for ( const cell of cells ) {

		const place = featuredAt( world, cell.row, cell.column );
		if ( featuredOnly && ! place ) continue;
		const into = place && merged.get( place );
		if ( into ) {

			into.n += cell.n;
			into.days = Math.max( into.days, cell.days );
			into.cells.push( [ cell.lat, cell.lon ] );
			continue;

		}

		const entry = { cell, place, n: cell.n, days: cell.days, cells: [ [ cell.lat, cell.lon ] ] };
		if ( place ) merged.set( place, entry );
		all.push( entry );

	}

	// (Array sorts are stable: those level stay in the cells' order.)
	all.sort( ( a, b ) => b.n - a.n || b.days - a.days );
	return all.slice( 0, most ).map( ( { cell, place, n, days, cells: within } ) => place
		? { lat: place.lat, lon: place.lon, n, days, cells: within, name: place.name, region: place.region, link: place.link, featured: true }
		: { lat: cell.lat, lon: cell.lon, n, days, cells: within, ...nameCell( world, cell.lat, cell.lon, named ) } );

}

// GET /api/admin/dropins?days=30, for the last `days` UTC days, today's (so far) included (30 if
// unset, at most a year: admin.js's askedDays), to an account in ADMIN_EMAILS (adminAccount: 401
// signed out, 403 anyone else, 429 past ADMIN_LOOKS a minute):
//   { from, to, first, cell, kept, worlds: { earth: WORLD, moon: WORLD, mars: WORLD, ... } } (each world's)
// WORLD: { dropins, places, heat: [ [ lat, lon, n ] ], top: [ { lat, lon, n, days, cells, name, region, link, featured } ] }
// first: the first day any place was counted (null for none yet); cell: the cells' size (m); kept:
// how many days rows are kept. dropins and places: the period's drop-ins counted (each visitor once
// a day in each cell) and the cells they were in; heat: its HEAT most dropped-in cells' middles, the
// most first; top: its TOP places (placesOf: a featured place's cells together), named with the
// game's link there. Rows older than KEEP_DAYS go as it's asked, as stats_daily's do. A query for
// each world in one batch, its cells, which reads that world's rows for the period once (and no
// more than DAILY a day of them), and one for the first day. The answer is kept in this Worker
// instance KEPT ms (KEPT_LONG past LONG days) for that period and day (X-Dropins-Cache says hit or
// miss), after the account and ADMIN_LOOKS are checked: the same look again reads nothing.
export async function adminDropins( context ) {

	const { url, now } = context;
	await adminAccount( context );
	const days = askedDays( url );
	const to = dayOf( now );
	const key = `${ days }:${ to }`;
	const kept = answers.get( key );
	if ( kept && now >= kept.at && now - kept.at < ( days > LONG ? KEPT_LONG : KEPT ) ) return answerOf( kept.body, 'hit' );
	const body = await dropinsAnswer( context, days, to );
	// (Only today's are worth keeping, the latest last, ANSWERS at most.)
	for ( const old of answers.keys() ) if ( old === key || ! old.endsWith( `:${ to }` ) ) answers.delete( old );
	answers.set( key, { at: now, body } );
	if ( answers.size > ANSWERS ) answers.delete( answers.keys().next().value );
	return answerOf( body, 'miss' );

}

// The admin page's answer as JSON, saying whether it was kept (adminDropins).
function answerOf( body, cache ) {

	return json( body, 200, { 'X-Dropins-Cache': cache } );

}

// adminDropins' answer for the last `days` UTC days to `to` (today), worked out.
async function dropinsAnswer( context, days, to ) {

	const { env, url, now } = context;
	const db = database( env );
	const from = dayOf( now - ( days - 1 ) * DAY );
	context.ctx?.waitUntil?.( db.prepare( `DELETE FROM dropins_daily WHERE world IN ( ${ WORLDS.map( () => '?' ).join( ', ' ) } ) AND day < ?` )
		.bind( ...WORLDS, dayOf( now - KEEP_DAYS * DAY ) ).run().catch( () => {} ) );
	const [ first, ...cells ] = await db.batch( [
		// Each world's first row is its key's first: one row read each.
		db.prepare( `SELECT MIN( day ) AS day FROM ( ${ WORLDS.map( () => 'SELECT MIN( day ) AS day FROM dropins_daily WHERE world = ?' ).join( ' UNION ALL ' ) } )` ).bind( ...WORLDS ),
		...WORLDS.map( world => cellsQuery( db, world, from, to, HEAT ) ),
	] );
	const named = await townsFor( env, url );
	const worlds = {};
	WORLDS.forEach( ( world, i ) => {

		const rows = cells[ i ].results;
		const heat = cellsOf( world, rows );
		worlds[ world ] = {
			dropins: rows[ 0 ]?.dropins ?? 0,
			places: rows[ 0 ]?.places ?? 0,
			heat: heat.map( c => [ c.lat, c.lon, c.n ] ),
			top: placesOf( world, heat, named, TOP ),
		};

	} );

	return { from, to, first: first.results[ 0 ]?.day ?? null, cell: CELL, kept: KEEP_DAYS, worlds };

}

// The featured place whose cells include `world`'s cell at `row`, `column` (claimCells), or null.
function featuredAt( world, row, column ) {

	featured ??= Object.fromEntries( WORLDS.map( w => [ w, claimCells( w ) ] ) );
	return featured[ world ].get( `${ row }:${ column }` )?.place ?? null;

}

// `world`'s featured places' cells: for each, the cell its pin is in and any other within
// FEATURED_REACH m of the pin, as "row:column" => { place, metres }; a cell two places reach is the
// nearer's (or the first's: the start spots before the places' pages).
function claimCells( world ) {

	const claimed = new Map();
	for ( const place of FEATURED_PLACES[ world ] ) {

		for ( const key of cellsNear( world, place.lat, place.lon ) ) {

			const { row, column } = checkCell( key );
			const metres = metresToCell( world, place.lat, place.lon, row, column );
			const was = claimed.get( `${ row }:${ column }` );
			if ( metres <= FEATURED_REACH && ( ! was || metres < was.metres ) ) claimed.set( `${ row }:${ column }`, { place, metres } );

		}

	}

	return claimed;

}

// The cells round ( lat, lon ) on `world` that may be within FEATURED_REACH m of it: the one it's in
// and those at 16 points round it that far off (a cell is far bigger, so none in reach is missed).
function cellsNear( world, lat, lon ) {

	const cells = new Set( [ cellOf( world, lat, lon ) ] );
	const degrees = FEATURED_REACH / ( RADIUS[ world ] * Math.PI / 180 );
	for ( let i = 0; i < 16; i ++ ) {

		const angle = i * Math.PI / 8;
		const north = Math.min( 90, Math.max( - 90, lat + Math.cos( angle ) * degrees ) );
		const east = lon + Math.sin( angle ) * degrees / Math.max( 0.01, Math.cos( lat * Math.PI / 180 ) );
		cells.add( cellOf( world, north, east ) );

	}

	return cells;

}

// How far (m) ( lat, lon ) is from `world`'s cell at `row`, `column`: 0 in it, else to the nearest
// point of its edge (to well within a metre at a cell's size).
function metresToCell( world, lat, lon, row, column ) {

	const { south, north, west, east } = cellBounds( world, row, column );
	const width = east - west;
	// How far east of the cell's west edge, round the 180th meridian.
	const along = ( ( lon - west ) % 360 + 360 ) % 360;
	const nearLon = along <= width ? lon : along - width < 360 - along ? east : west;
	return metresOn( world, lat, lon, Math.min( north, Math.max( south, lat ) ), nearLon );

}

// What to call `world`'s cell that ( lat, lon ) is in (its middle, say), and the game's link there:
// { name, region, link, featured }. A featured place whose cells include it (featuredAt: its pin
// in the cell or within FEATURED_REACH m of it) is it: its name, region and link, featured: true.
// Else the nearest featured place or town (`towns`: readTowns', or null) within NEAR m: a town's
// own name within TOWN m, else (and a featured place's always: its own cells are named by it)
// "12 km NE of" it, with its region on the Earth (a town's state and country, or a featured
// place's); else the cell's coordinates ("46.57° N, 8.42° E"), with no region. But for a featured
// place, the link opens the game with the cell's middle pinned by that name (a middle can be on a
// roof or out at sea: the drop-in finds the street, or the sea's surface, as for any pin).
export function nameCell( world, lat, lon, towns = null ) {

	const cell = checkCell( cellOf( world, lat, lon ) );
	const own = cell && featuredAt( world, cell.row, cell.column );
	if ( own ) return { name: own.name, region: own.region, link: own.link, featured: true };
	let nearest = null;
	const consider = ( place, metres, town ) => {

		if ( metres <= ( NEAR[ world ] ?? 0 ) && ( ! nearest || metres < nearest.metres ) ) nearest = { place, metres, town };

	};
	for ( const place of FEATURED_PLACES[ world ] ) consider( place, metresOn( world, lat, lon, place.lat, place.lon ), false );
	if ( world === EARTH && towns ) {

		const town = towns.nearest( lat, lon, NEAR.earth );
		if ( town ) consider( town, town.metres, true );

	}

	if ( ! nearest ) {

		const name = `${ Math.abs( lat ).toFixed( 2 ) }° ${ lat < 0 ? 'S' : 'N' }, ${ Math.abs( lon ).toFixed( 2 ) }° ${ lon < 0 ? 'W' : 'E' }`;
		return { name, region: '', link: atLink( lat, lon, '', '', world ), featured: false };

	}

	// (Another world's place's region says what it is, "85 km across, bright rays", which isn't true
	// of a place some way off it.)
	const { place, metres, town } = nearest;
	const name = town && metres <= TOWN ? place.name : `${ Math.max( 1, Math.round( metres / 1000 ) ) } km ${ bearing( place.lat, place.lon, lat, lon ) } of ${ place.name }`;
	const region = world === EARTH ? place.region : '';
	return { name, region, link: atLink( lat, lon, name, region, world ), featured: false };

}

// The game's address with ( lat, lon ) pinned on `world` as `name` in `region` (places.js's
// linkedPlace, which takes world=<id> for any world but the Earth; a nameless one is a dropped pin),
// facing `heading` if given.
function atLink( lat, lon, name, region, world, heading ) {

	const params = new URLSearchParams( { at: `${ lat },${ lon }` } );
	if ( name ) params.set( 'name', name );
	if ( region ) params.set( 'region', region );
	if ( Number.isFinite( heading ) ) params.set( 'heading', String( heading ) );
	if ( world !== EARTH ) params.set( 'world', world );
	return `/?${ params }`;

}

// Which way ( lat, lon ) is from ( fromLat, fromLon ): one of COMPASS's eight points.
function bearing( fromLat, fromLon, lat, lon ) {

	const rad = Math.PI / 180;
	const y = Math.sin( ( lon - fromLon ) * rad ) * Math.cos( lat * rad );
	const x = Math.cos( fromLat * rad ) * Math.sin( lat * rad ) - Math.sin( fromLat * rad ) * Math.cos( lat * rad ) * Math.cos( ( lon - fromLon ) * rad );
	const degrees = ( Math.atan2( y, x ) / rad + 360 ) % 360;
	return COMPASS[ Math.round( degrees / 45 ) % 8 ];

}

// The towns (readTowns'), read once per Worker instance from the site's own files through the
// ASSETS binding (costing nothing per look), or null if they can't be had just now: then cells are
// named by the featured places alone, and asked for again next time. `url` is the request's if
// there is one; without (a scheduled handler has no request) the site's own address stands in, as
// the ASSETS binding goes by the path alone.
export async function townsFor( env, url = null ) {

	if ( towns ) return towns;
	try {

		const res = await env.ASSETS?.fetch( new Request( new URL( TOWNS, url ?? SITE ) ) );
		if ( ! res?.ok ) return null;
		towns = readTowns( await res.text() );

	} catch ( err ) {

		console.error( 'Towns', err?.name, err?.message );

	}

	return towns;

}

// scripts/make-towns.mjs's file as { count, nearest( lat, lon, within ) }: the nearest town to
// ( lat, lon ) within `within` m on the Earth, { name, region, lat, lon, metres }, or null. The towns
// are from the south pole northward, so only those within its latitude's reach are looked at.
export function readTowns( text ) {

	const split = text.indexOf( '\n\n' );
	if ( split < 0 ) throw new Error( 'Not the towns this expects' );
	const regions = text.slice( 0, split ).split( '\n' );
	const lines = text.slice( split + 2 ).split( '\n' ).filter( Boolean );
	const lats = new Float64Array( lines.length );
	const lons = new Float64Array( lines.length );
	// Only each one's latitude and longitude for now (by where its tabs are, without splitting every
	// line: this is read on an admin page's first ask in each Worker instance); its name and region
	// only for the nearest.
	lines.forEach( ( line, i ) => {

		const second = line.indexOf( '\t', line.indexOf( '\t' ) + 1 );
		const third = line.indexOf( '\t', second + 1 );
		const fourth = line.indexOf( '\t', third + 1 );
		lats[ i ] = Number( line.slice( second + 1, third ) );
		lons[ i ] = Number( fourth < 0 ? line.slice( third + 1 ) : line.slice( third + 1, fourth ) );

	} );
	return {

		count: lines.length,

		nearest( lat, lon, within ) {

			const reach = within / metresOn( 'earth', 0, 0, 1, 0 );
			// The first town at or north of lat - reach, by halving.
			let low = 0;
			let high = lats.length;
			while ( low < high ) {

				const middle = ( low + high ) >> 1;
				if ( lats[ middle ] < lat - reach ) low = middle + 1;
				else high = middle;

			}

			let best = - 1;
			let gap = within;
			for ( let i = low; i < lats.length && lats[ i ] <= lat + reach; i ++ ) {

				const metres = metresOn( 'earth', lat, lon, lats[ i ], lons[ i ] );
				if ( metres <= gap ) {

					best = i;
					gap = metres;

				}

			}

			if ( best < 0 ) return null;
			const [ name, region ] = lines[ best ].split( '\t' );
			return { name, region: regions[ Number( region ) ] ?? '', lat: lats[ best ], lon: lons[ best ], metres: gap };

		},

	};

}
