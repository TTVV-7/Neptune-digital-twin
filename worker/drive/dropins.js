import { json } from '../http.js';
import { CELL, WORLDS, cellMiddle, metresOn } from '../../src/drive-app/dropin-cells.js';
import { dayOf } from '../../src/drive-app/levels.js';
import { MOON_PLACES } from '../../src/drive-app/moon-places.js';
import { SPOTS } from '../../src/drive-app/places.js';
import { PLACES } from '../../drive/site/places.js';
import { database } from './players.js';
import { addressOf, setting } from './settings.js';
import { KEEP_DAYS, adminAccount, askedDays } from './admin.js';

// Where people drop in (docs/world-drive.md, "Where people drop in"): each drop-in's place, a cell
// of src/drive-app/dropin-cells.js's grid (about a kilometre each way), counted a day in D1's
// dropins_daily for the owner's admin page: a heat map of each world and its top places. The page
// posts a drop-in's cell with the drop-in's own count in its play stats (stats.js's POST
// /api/stats), so it costs no request of its own; DriveLimits (limits.js) says which to count: a
// cell once a day for each visitor, and no more than a day's, a visitor's and a visit's worth. Only
// counts of cells: nothing of who, which visit or from where, and no finer than the cell.
//
// For what comes next (challenges picked from where people go), topCells is the query: the most
// dropped-in cells of a world over a period.
//
// Settings, none of which need setting: DROPIN_PLACES_DAILY, DROPIN_PLACES_PER_VISITOR and
// DROPIN_PLACES_PER_VISIT, the most places counted a day for everyone (DAILY), for each visitor
// (PER_VISITOR) and for each visit (PER_VISIT). ADMIN_LOOKS: the rate limiter binding for the admin
// page's asks (admin.js).

// Each drop-in takes a while (the flight down, the ground loading, the drive), so a visit's places
// are counted no faster than one each GAP ms of it. Real visits drop in a handful of times; a long
// one at a party a few dozen.
export const DAILY = 5000;
export const PER_VISITOR = 60;
export const PER_VISIT = 30;
export const GAP = 10000;
// The admin page is told each world's top TOP places named, and its HEAT most dropped-in cells for
// the heat map (the rest, single drop-ins scattered about, are only counted in its totals).
const TOP = 25;
const HEAT = 2000;
// How a cell is named: a featured place (a start spot, a place's page, a Moon place) within
// FEATURED m of its middle is its name; else the nearest town (drive/public/places/towns.tsv) or
// featured place within NEAR m, the town's own name within TOWN m, else how far it is and which way
// ("12 km NE of Lyon"); else its coordinates.
const FEATURED = { earth: 1500, moon: 5000 };
const TOWN = 2000;
const NEAR = { earth: 50000, moon: 300000 };
const TOWNS = '/places/towns.tsv';
const COMPASS = [ 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW' ];
const DAY = 24 * 60 * 60 * 1000;

// The game's own places, with the link that opens it there: the start spots and the Moon's places
// by id, and the places' pages' others by where their Drive here pins them (drive/site/build.js's
// playLink).
const FEATURED_PLACES = {
	earth: [
		...SPOTS.map( spot => ( { name: spot.name, region: spot.region, lat: spot.lat, lon: spot.lon, link: `/?spot=${ spot.id }` } ) ),
		...PLACES.filter( place => place.at ).map( place => ( { name: place.name, region: place.region, lat: place.at.lat, lon: place.at.lon, link: atLink( place.at.lat, place.at.lon, place.name, place.region, 'earth', place.at.heading ) } ) ),
	],
	moon: MOON_PLACES.map( place => ( { name: place.name, region: place.region, lat: place.lat, lon: place.lon, link: `/?spot=${ place.id }` } ) ),
};

// The day DriveLimits last said today's places were all counted, so this Worker instance asks it
// no more that day (each ask is a Durable Object request).
let fullDay = null;
// The towns, read from the site's files once per Worker instance (readTowns), or null till then.
let towns = null;

// The places of a post to /api/stats (`places`: dropin-cells.js's checkPlaces, cells of drop-ins the
// same post counts) from `visit` (readVisit's) at `now`: those DriveLimits says to count added to
// today's rows. How many were. Never in the stats' way: a count that fails is only logged.
export async function recordPlaces( { request, env, limits, now }, visit, places ) {

	const day = dayOf( now );
	if ( ! places.length || ! env.DB || fullDay === day ) return 0;
	try {

		const { cells, full } = await limits.places( addressOf( request ), {
			now, visit: visit.id, since: visit.issuedAt, cells: places.map( cell => cell.key ),
			daily: setting( env.DROPIN_PLACES_DAILY, DAILY ),
			perVisitor: setting( env.DROPIN_PLACES_PER_VISITOR, PER_VISITOR ),
			perVisit: setting( env.DROPIN_PLACES_PER_VISIT, PER_VISIT ),
			gap: GAP,
		} );
		if ( full ) fullDay = day;
		const counted = places.filter( cell => cells.includes( cell.key ) );
		if ( ! counted.length ) return 0;
		const upsert = env.DB.prepare( 'INSERT INTO dropins_daily ( day, world, cell_row, cell_column, n ) VALUES ( ?, ?, ?, ?, 1 ) ON CONFLICT ( day, world, cell_row, cell_column ) DO UPDATE SET n = n + 1' );
		await env.DB.batch( counted.map( cell => upsert.bind( day, cell.world, cell.row, cell.column ) ) );
		return counted.length;

	} catch ( err ) {

		console.error( 'Drop-in places', err?.name, err?.message );
		return 0;

	}

}

// The most dropped-in cells of `world` ('earth' or 'moon') from the UTC day `from` to `to`
// ('2026-11-16', both included), at most `most` (1 to HEAT): [ { world, row, column, lat, lon, n,
// days } ], the most first (then those on the most days), with each cell's middle, its drop-ins
// (each visitor once a day there) and on how many of the days it had any. One query, bounded by the
// days asked for (dropins_daily's key starts with the day).
export async function topCells( db, { world, from, to, most = TOP } ) {

	return cellsOf( world, ( await cellsQuery( db, world, from, to, most ).all() ).results );

}

function cellsQuery( db, world, from, to, most ) {

	if ( ! WORLDS.includes( world ) ) throw new Error( `No world ${ world }` );
	const limit = Math.min( HEAT, Math.max( 1, Math.floor( most ) || 1 ) );
	return db.prepare( `SELECT cell_row, cell_column, SUM( n ) AS n, COUNT(*) AS days FROM dropins_daily
		WHERE day >= ? AND day <= ? AND world = ? GROUP BY cell_row, cell_column ORDER BY n DESC, days DESC, cell_row, cell_column LIMIT ?` ).bind( from, to, world, limit );

}

function cellsOf( world, results ) {

	return results.map( r => ( { world, row: r.cell_row, column: r.cell_column, ...cellMiddle( world, r.cell_row, r.cell_column ), n: r.n, days: r.days } ) );

}

// GET /api/admin/dropins?days=30, for the last `days` UTC days, today's (so far) included (30 if
// unset, at most a year: admin.js's askedDays), to an account in ADMIN_EMAILS (adminAccount: 401 signed out, 403
// anyone else, 429 past ADMIN_LOOKS a minute):
//   { from, to, first, cell, kept, worlds: { earth: WORLD, moon: WORLD } }
// WORLD: { dropins, places, heat: [ [ lat, lon, n ] ], top: [ { lat, lon, n, days, name, region, link, featured } ] }
// first: the first day any place was counted (null for none yet); cell: the cells' size (m); kept:
// how many days rows are kept. dropins and places: the period's drop-ins and the cells they were in;
// heat: its HEAT most dropped-in cells' middles, the most first; top: its first TOP, named (nameCell)
// with the game's link there. Rows older than KEEP_DAYS go as it's asked, as stats_daily's do.
export async function adminDropins( context ) {

	const { env, url, now } = context;
	await adminAccount( context );
	const db = database( env );
	const days = askedDays( url );
	const to = dayOf( now );
	const from = dayOf( now - ( days - 1 ) * DAY );
	context.ctx?.waitUntil?.( db.prepare( 'DELETE FROM dropins_daily WHERE day < ?' ).bind( dayOf( now - KEEP_DAYS * DAY ) ).run().catch( () => {} ) );
	const [ totals, first, ...cells ] = await db.batch( [
		db.prepare( `SELECT world, COUNT(*) AS places, SUM( n ) AS dropins FROM ( SELECT world, cell_row, cell_column, SUM( n ) AS n FROM dropins_daily
			WHERE day >= ? AND day <= ? GROUP BY world, cell_row, cell_column ) GROUP BY world` ).bind( from, to ),
		db.prepare( 'SELECT MIN( day ) AS day FROM dropins_daily' ),
		...WORLDS.map( world => cellsQuery( db, world, from, to, HEAT ) ),
	] );
	const named = await townsFor( env, url );
	const worlds = {};
	WORLDS.forEach( ( world, i ) => {

		const heat = cellsOf( world, cells[ i ].results );
		const total = totals.results.find( r => r.world === world );
		worlds[ world ] = {
			dropins: total?.dropins ?? 0,
			places: total?.places ?? 0,
			heat: heat.map( c => [ c.lat, c.lon, c.n ] ),
			top: heat.slice( 0, TOP ).map( c => ( { lat: c.lat, lon: c.lon, n: c.n, days: c.days, ...nameCell( world, c.lat, c.lon, named ) } ) ),
		};

	} );

	return json( { from, to, first: first.results[ 0 ]?.day ?? null, cell: CELL, kept: KEEP_DAYS, worlds } );

}

// What to call `world`'s cell with its middle at ( lat, lon ), and the game's link there:
// { name, region, link, featured }. A featured place (FEATURED_PLACES) within FEATURED m is it (its
// name, region and link, featured: true); else the nearest of them or of `towns` (readTowns', or
// null) within NEAR m: within TOWN m its name, else "12 km NE of" it, with its region on the Earth
// (a town's state and country, or a featured place's); else the
// cell's coordinates ("46.57° N, 8.42° E"), with no region. Featured or not, the link opens the
// game with that place pinned (a cell's middle can be on a roof or out at sea: the drop-in finds the
// street, or the sea's surface, as for any pin).
export function nameCell( world, lat, lon, towns = null ) {

	let nearest = null;
	const consider = ( place, metres ) => {

		if ( metres <= NEAR[ world ] && ( ! nearest || metres < nearest.metres ) ) nearest = { place, metres };

	};
	for ( const place of FEATURED_PLACES[ world ] ) consider( place, metresOn( world, lat, lon, place.lat, place.lon ) );
	if ( nearest && nearest.metres <= FEATURED[ world ] ) return { name: nearest.place.name, region: nearest.place.region, link: nearest.place.link, featured: true };
	if ( world === 'earth' && towns ) {

		const town = towns.nearest( lat, lon, NEAR.earth );
		if ( town ) consider( town, town.metres );

	}

	if ( ! nearest ) {

		const name = `${ Math.abs( lat ).toFixed( 2 ) }° ${ lat < 0 ? 'S' : 'N' }, ${ Math.abs( lon ).toFixed( 2 ) }° ${ lon < 0 ? 'W' : 'E' }`;
		return { name, region: '', link: atLink( lat, lon, '', '', world ), featured: false };

	}

	// (A Moon place's region says what it is, "85 km across, bright rays", which isn't true of a
	// place some way off it.)
	const { place, metres } = nearest;
	const name = metres <= TOWN ? place.name : `${ Math.round( metres / 1000 ) } km ${ bearing( place.lat, place.lon, lat, lon ) } of ${ place.name }`;
	const region = world === 'earth' ? place.region : '';
	return { name, region, link: atLink( lat, lon, name, region, world ), featured: false };

}

// The game's address with ( lat, lon ) pinned on `world` as `name` in `region` (places.js's
// linkedPlace; a nameless one is a dropped pin), facing `heading` if given.
function atLink( lat, lon, name, region, world, heading ) {

	const params = new URLSearchParams( { at: `${ lat },${ lon }` } );
	if ( name ) params.set( 'name', name );
	if ( region ) params.set( 'region', region );
	if ( Number.isFinite( heading ) ) params.set( 'heading', String( heading ) );
	if ( world === 'moon' ) params.set( 'world', 'moon' );
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
// named by the featured places alone, and asked for again next time.
async function townsFor( env, url ) {

	if ( towns ) return towns;
	try {

		const res = await env.ASSETS?.fetch( new Request( new URL( TOWNS, url ) ) );
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
