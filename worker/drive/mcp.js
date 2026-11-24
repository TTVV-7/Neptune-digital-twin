import { HttpError, json, randomToken } from '../http.js';
import { bearerAccount } from './oauth.js';
import { planOf } from './build.js';
import { search } from './search.js';
import CATALOG from './build-catalog.json' with { type: 'json' };

// World Drive Build's MCP server (worlddrive.app/mcp, docs/build.md): Claude (or any MCP client)
// connected to someone's World Drive account through OAuth (oauth.js) lays out their construction
// sites: finds a site by address, makes a project there, looks up the library (build-catalog.json,
// npm run make-build-catalog: every item with its real size, and the sets) and places equipment,
// sets, rows, flatten areas, laydown areas and stockpiles, moves and removes them, and shares the
// project. Projects are World Drive Build's own (build_layouts, build.js), so what Claude lays out
// opens in the editor (/build/app/), and the other way round. Build Pro and the owner only.
//
// Streamable HTTP, stateless: each POST is a JSON-RPC message (or a batch) answered with JSON; no
// event stream and no session. Positions are metres east and north of the project's site point (its
// lat and lon), headings degrees clockwise from north (the way an item's front faces).
//
// Settings: MCP_HOURLY, the tool calls an account may make an hour (300 if unset).

const PROTOCOLS = [ '2025-06-18', '2025-03-26', '2024-11-05' ];
const PROJECT_ITEMS = 2000;
const PER_CALL = 200;
const LAYOUT_BYTES = 1024 * 1024;
const ID_PATTERN = /^[A-Za-z0-9_-]{16}$/;
const ITEMS = new Map( CATALOG.items.map( item => [ item.id, item ] ) );
const SETS = new Map( CATALOG.sets.map( set => [ set.id, set ] ) );
const MATERIALS = [ 'gravel', 'sand', 'topsoil', 'soil', 'road-base', 'riprap', 'coal', 'potash' ];
// src/flatten.js's fences, as named in what Claude is told.
const FENCE_NAMES = { mesh: 'chain-link', screened: 'green privacy screen', 'screened-black': 'black privacy screen', 'mesh-silt': 'chain-link with silt fence', silt: 'silt fence', safety: 'orange safety fence' };
const FENCES = Object.keys( FENCE_NAMES );
// src/flatten.js's surfaces (gravel is road base).
const SURFACES = [ 'gravel', 'clear-crush', 'pea-gravel', 'drain-rock', 'crusher-dust', 'pit-run', 'recycled-concrete', 'rip-rap', 'millings', 'asphalt', 'concrete', 'none' ];
// Pieces placed touching end to end in a row; anything else a metre apart.
const TOUCHING = [ 'Barriers & fencing', 'Temporary covers' ];

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Expose-Headers': 'WWW-Authenticate' };

export function isMcp( url ) {

	return url.pathname === '/mcp';

}

export async function mcp( context ) {

	const { request, url } = context;
	if ( request.method === 'OPTIONS' ) return new Response( null, { status: 204, headers: cors } );
	if ( request.method !== 'POST' ) return new Response( 'Method not allowed: POST JSON-RPC here', { status: 405, headers: { ...cors, Allow: 'POST' } } );
	const account = await bearerAccount( context );
	if ( ! account ) {

		return json( { error: 'Connect with World Drive Build first' }, 401, { ...cors, 'WWW-Authenticate': `Bearer resource_metadata="${ url.origin }/.well-known/oauth-protected-resource"` } );

	}

	let message;
	try {

		message = await request.json();

	} catch {

		return json( rpcError( null, - 32700, 'Parse error' ), 400, cors );

	}

	const batch = Array.isArray( message );
	const answers = [];
	for ( const one of batch ? message : [ message ] ) {

		const answer = await handle( { ...context, account }, one );
		if ( answer ) answers.push( answer );

	}

	if ( ! answers.length ) return new Response( null, { status: 202, headers: cors } );
	return json( batch ? answers : answers[ 0 ], 200, cors );

}

function rpcError( id, code, message ) {

	return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };

}

async function handle( context, message ) {

	if ( ! message || message.jsonrpc !== '2.0' || typeof message.method !== 'string' ) return rpcError( message?.id, - 32600, 'Invalid request' );
	const { id, method, params } = message;
	// Notifications (no id) get no answer.
	if ( id === undefined ) return null;
	const reply = result => ( { jsonrpc: '2.0', id, result } );
	switch ( method ) {

		case 'initialize': return reply( {
			protocolVersion: PROTOCOLS.includes( params?.protocolVersion ) ? params.protocolVersion : PROTOCOLS[ 0 ],
			capabilities: { tools: {} },
			serverInfo: { name: 'world-drive-build', title: 'World Drive Build', version: '1.0.0' },
			instructions: INSTRUCTIONS,
		} );
		case 'ping': return reply( {} );
		case 'tools/list': return reply( { tools: TOOLS.map( ( { run, ...tool } ) => tool ) } );
		case 'tools/call': return reply( await call( context, params ) );
		default: return rpcError( id, - 32601, `No method ${ method }` );

	}

}

const INSTRUCTIONS = `World Drive Build lays out construction sites on a 3D map of anywhere (worlddrive.app/build). Start with find_site for the address, then create_project there (or list_projects / get_project for one already made). Positions are metres east and north of the project's site point; a heading is degrees clockwise from north, the way an item's front faces. Look sizes up with search_library before laying things out so they fit (a site office trailer is about 12 x 5 m, a 20 t excavator about 10 x 3 m, a tri-tri about 22 m long). Give the person the editor link at the end: they see it in 3D there.`;

// --- tools ------------------------------------------------------------------------------------

const point = { east: { type: 'number', description: 'Metres east of the site point (negative: west)' }, north: { type: 'number', description: 'Metres north of the site point (negative: south)' } };
const heading = { heading: { type: 'number', description: 'Degrees clockwise from north that its front faces (0 north, 90 east)', default: 0 } };
const project = { project_id: { type: 'string', description: 'The project\'s id (create_project, list_projects)' } };

const TOOLS = [
	{
		name: 'find_site', title: 'Find a site', description: 'Look up an address, town or landmark: its places, each with lat and lon for create_project.',
		inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'e.g. "1200 Main St, Vancouver"' } }, required: [ 'query' ] },
		annotations: { readOnlyHint: true }, run: findSite,
	},
	{
		name: 'create_project', title: 'Make a project', description: 'Make a new, empty project at a site. Returns its id and the editor link.',
		inputSchema: { type: 'object', properties: { name: { type: 'string' }, place: { type: 'string', description: 'The site\'s name as people know it, e.g. "1200 Main St"' }, lat: { type: 'number' }, lon: { type: 'number' } }, required: [ 'name', 'place', 'lat', 'lon' ] },
		run: createProject,
	},
	{
		name: 'list_projects', title: 'Your projects', description: 'The account\'s projects: id, name, site and when each was saved.',
		inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true }, run: listProjects,
	},
	{
		name: 'get_project', title: 'What\'s in a project', description: 'Everything placed in a project, each with its index (for move_item and remove_items), what it is, where and which way it faces, and its size.',
		inputSchema: { type: 'object', properties: { ...project }, required: [ 'project_id' ] }, annotations: { readOnlyHint: true }, run: getProject,
	},
	{
		name: 'search_library', title: 'Search the library', description: 'Equipment, vehicles, trailers, barriers, materials and people to place, each with its id and real size in metres (length along its front, width, height). With no query: the categories.',
		inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Words to match, e.g. "excavator", "office trailer", "jersey barrier"' }, category: { type: 'string' }, limit: { type: 'number', default: 25 } } },
		annotations: { readOnlyHint: true }, run: searchLibrary,
	},
	{
		name: 'list_sets', title: 'Sets', description: 'Ready-made groups laid out as on site (a site office compound, a concrete pour, gravel trucks...), for place_set.',
		inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true }, run: listSets,
	},
	{
		name: 'place_items', title: 'Place items', description: `Place library items (ids from search_library), each at its middle. Up to ${ PER_CALL } at a time.`,
		inputSchema: { type: 'object', properties: { ...project, items: { type: 'array', items: { type: 'object', properties: { item: { type: 'string', description: 'Library id' }, ...point, ...heading }, required: [ 'item', 'east', 'north' ] } } }, required: [ 'project_id', 'items' ] },
		run: placeItems,
	},
	{
		name: 'place_set', title: 'Place a set', description: 'Place a set (list_sets) with its middle at a point, turned to a heading.',
		inputSchema: { type: 'object', properties: { ...project, set_id: { type: 'string' }, ...point, ...heading }, required: [ 'project_id', 'set_id', 'east', 'north' ] },
		run: placeSet,
	},
	{
		name: 'place_row', title: 'Place a row', description: 'Place a library item over and over along a line through points (a fence line, barriers, cones down a lane), each facing along it. Barriers and fencing touch end to end; anything else is a metre apart, unless spacing (m, middle to middle) is given.',
		inputSchema: { type: 'object', properties: { ...project, item: { type: 'string' }, points: { type: 'array', description: '[[east, north], ...], at least two', items: { type: 'array', items: { type: 'number' } } }, spacing: { type: 'number' } }, required: [ 'project_id', 'item', 'points' ] },
		run: placeRow,
	},
	{
		name: 'add_flatten_area', title: 'Flatten an area', description: 'Clear a rectangle of the 3D map (what\'s there is pressed flat) and surface it: gravel (road base), clear-crush, pea-gravel, drain-rock, crusher-dust, pit-run, recycled-concrete, rip-rap, millings, asphalt, concrete, or none.',
		inputSchema: { type: 'object', properties: { ...project, ...point, width: { type: 'number', description: 'm, across its heading' }, length: { type: 'number', description: 'm, along its heading' }, ...heading, surface: { type: 'string', enum: SURFACES, default: 'gravel' }, fence: { type: 'string', enum: [ 'none', ...FENCES ], default: 'none', description: 'round its edge: mesh (chain-link temp fence panels, see-through), screened (green privacy screen), screened-black, mesh-silt (panels with silt fence at their foot), silt (silt fence alone), safety (orange plastic fence on T-posts, see-through)' }, entrances: { type: 'integer', minimum: 0, maximum: 8, description: '24 ft entrances (open double gates in panel fence, gaps in silt or safety fence), one to a side in turn: the front (the side it faces), back, right, left' } }, required: [ 'project_id', 'east', 'north', 'width', 'length' ] },
		run: addFlatten,
	},
	{
		name: 'add_laydown_area', title: 'Mark a laydown area', description: 'Mark out a rectangle where materials and equipment go, with a label.',
		inputSchema: { type: 'object', properties: { ...project, ...point, width: { type: 'number' }, length: { type: 'number' }, ...heading, label: { type: 'string' }, colour: { type: 'string', description: '#rrggbb', default: '#ffd60a' }, note: { type: 'string' } }, required: [ 'project_id', 'east', 'north', 'width', 'length' ] },
		run: addLaydown,
	},
	{
		name: 'add_stockpile', title: 'Add a stockpile', description: 'A pile of material: a cone of a volume, or a ridge filling width x length.',
		inputSchema: { type: 'object', properties: { ...project, ...point, material: { type: 'string', enum: MATERIALS, default: 'gravel' }, shape: { type: 'string', enum: [ 'cone', 'ridge' ], default: 'cone' }, volume: { type: 'number', description: 'm³, for a cone', default: 50 }, width: { type: 'number' }, length: { type: 'number' }, ...heading }, required: [ 'project_id', 'east', 'north' ] },
		run: addStockpile,
	},
	{
		name: 'move_item', title: 'Move an item', description: 'Move or turn something already placed (its index from get_project).',
		inputSchema: { type: 'object', properties: { ...project, index: { type: 'number' }, east: { type: 'number' }, north: { type: 'number' }, heading: { type: 'number' } }, required: [ 'project_id', 'index' ] },
		run: moveItem,
	},
	{
		name: 'remove_items', title: 'Remove items', description: 'Remove things already placed, by their indexes from get_project.',
		inputSchema: { type: 'object', properties: { ...project, indexes: { type: 'array', items: { type: 'number' } } }, required: [ 'project_id', 'indexes' ] },
		annotations: { destructiveHint: true }, run: removeItems,
	},
	{
		name: 'share_project', title: 'Share a project', description: 'A link anyone can open to see the project (read only).',
		inputSchema: { type: 'object', properties: { ...project }, required: [ 'project_id' ] }, run: shareProject,
	},
];

class ToolError extends Error {}

async function call( context, params ) {

	const tool = TOOLS.find( t => t.name === params?.name );
	if ( ! tool ) return text( `No tool ${ params?.name }`, true );
	const { env, account, now } = context;
	if ( ( await planOf( env, account ) ).tier === 'free' ) return text( 'World Drive Build\'s Claude connector comes with Build Pro. Upgrade at https://worlddrive.app/build/ and try again.', true );
	const hourly = Number.isFinite( Number( env.MCP_HOURLY ) ) && env.MCP_HOURLY !== undefined && env.MCP_HOURLY !== '' ? Number( env.MCP_HOURLY ) : 300;
	const used = ( await env.DB.prepare( 'SELECT COUNT(*) AS n FROM mcp_calls WHERE account_id = ? AND at > ?' ).bind( account.id, now - 3600 * 1000 ).first() )?.n ?? 0;
	if ( used >= hourly ) return text( `That's ${ hourly } changes this hour, the most an account makes. Try again later.`, true );
	await env.DB.prepare( 'INSERT INTO mcp_calls ( account_id, at ) VALUES ( ?, ? )' ).bind( account.id, now ).run();
	try {

		return await tool.run( context, params.arguments ?? {} );

	} catch ( err ) {

		if ( err instanceof ToolError || err instanceof HttpError ) return text( err.message, true );
		console.error( 'MCP tool error', tool.name, err?.name, err?.message );
		return text( 'Something went wrong. Try again.', true );

	}

}

function text( value, isError = false ) {

	return { content: [ { type: 'text', text: typeof value === 'string' ? value : JSON.stringify( value, null, 1 ) } ], ...( isError ? { isError: true } : {} ) };

}

const round = v => Math.round( v * 100 ) / 100;

function number( value, name, { min = - 1e6, max = 1e6, fallback } = {} ) {

	const n = value === undefined || value === null ? fallback : Number( value );
	if ( ! Number.isFinite( n ) || n < min || n > max ) throw new ToolError( `${ name } must be a number from ${ min } to ${ max }` );
	return n;

}

const where = args => ( { east: round( number( args.east, 'east', { min: - 20000, max: 20000 } ) ), north: round( number( args.north, 'north', { min: - 20000, max: 20000 } ) ) } );
const turned = value => round( ( ( number( value, 'heading', { fallback: 0, min: - 3600, max: 3600 } ) % 360 ) + 360 ) % 360 );

function editorLink( origin, row ) {

	const url = new URL( '/build/app/', origin );
	if ( row.lat !== null && row.lat !== undefined ) url.searchParams.set( 'at', `${ Number( row.lat ).toFixed( 6 ) },${ Number( row.lon ).toFixed( 6 ) }` );
	url.searchParams.set( 'place', row.site );
	url.searchParams.set( 'project', row.id );
	return url.href;

}

// --- projects --------------------------------------------------------------------------------

async function ownProject( env, account, id ) {

	if ( typeof id !== 'string' || ! ID_PATTERN.test( id ) ) throw new ToolError( 'No such project: list_projects has their ids' );
	const row = await env.DB.prepare( 'SELECT id, site, name, data, lat, lon, updated_at, share_token FROM build_layouts WHERE id = ? AND account_id = ?' ).bind( id, account.id ).first();
	if ( ! row ) throw new ToolError( 'No such project: list_projects has their ids' );
	return { ...row, layout: JSON.parse( row.data ) };

}

// Saves a project's layout after a change (the editor, if open on it, says it changed and offers it).
async function save( env, row, layout, now ) {

	if ( layout.items.length > PROJECT_ITEMS ) throw new ToolError( `A project holds at most ${ PROJECT_ITEMS } things` );
	const data = JSON.stringify( layout );
	if ( data.length > LAYOUT_BYTES ) throw new ToolError( 'That makes the project too big to save' );
	const updated = await env.DB.prepare( 'UPDATE build_layouts SET data = ?, updated_at = ? WHERE id = ? AND updated_at = ?' )
		.bind( data, Math.max( now, row.updated_at + 1 ), row.id, row.updated_at ).run();
	if ( ! updated.meta.changes ) throw new ToolError( 'The project was changed somewhere else just then. Try again.' );

}

// A change to a project: fn( layout ) changes it and says what it did.
async function change( context, id, fn ) {

	const { env, account, now, url } = context;
	const row = await ownProject( env, account, id );
	const said = fn( row.layout );
	await save( env, row, row.layout, now );
	return text( `${ said }\nThe project has ${ row.layout.items.length } things now. Open it: ${ editorLink( url.origin, row ) }` );

}

async function findSite( context, args ) {

	const q = String( args.query ?? '' ).trim();
	if ( ! q ) throw new ToolError( 'query: an address, town or landmark' );
	const url = new URL( `/api/search?q=${ encodeURIComponent( q ) }`, context.url.origin );
	const res = await search( { ...context, url } );
	const { results } = await res.json();
	if ( ! results?.length ) return text( 'Nothing found. Try a street address with its town, or a landmark.' );
	return text( results.map( r => ( { place: r.name, lat: r.lat, lon: r.lon } ) ) );

}

async function createProject( context, args ) {

	const { env, account, now, url } = context;
	const name = String( args.name ?? '' ).trim().slice( 0, 100 );
	const place = String( args.place ?? '' ).trim().slice( 0, 100 );
	if ( ! name || ! place ) throw new ToolError( 'name and place, please' );
	const lat = number( args.lat, 'lat', { min: - 85, max: 85 } );
	const lon = number( args.lon, 'lon', { min: - 180, max: 180 } );
	const plan = await planOf( env, account );
	const most = plan.tier === 'free' ? 1 : 200;
	const { count } = await env.DB.prepare( 'SELECT COUNT(*) AS count FROM build_layouts WHERE account_id = ?' ).bind( account.id ).first();
	if ( count >= most ) throw new ToolError( 'The account has as many projects as it can. Delete some in the editor first.' );
	const layout = { version: 2, site: place, lat, lon, items: [], extras: {} };
	const id = randomToken( 12 );
	await env.DB.prepare( 'INSERT INTO build_layouts ( id, account_id, site, name, data, created_at, updated_at, lat, lon ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ? )' )
		.bind( id, account.id, place, name, JSON.stringify( layout ), now, now, lat, lon ).run();
	return text( { project_id: id, name, site: place, editor: editorLink( url.origin, { id, site: place, lat, lon } ) } );

}

async function listProjects( { env, account, url } ) {

	const { results } = await env.DB.prepare( 'SELECT id, site, name, lat, lon, updated_at FROM build_layouts WHERE account_id = ? ORDER BY updated_at DESC' ).bind( account.id ).all();
	if ( ! results.length ) return text( 'No projects yet: find_site, then create_project.' );
	return text( results.map( r => ( { project_id: r.id, name: r.name, site: r.site, saved: new Date( r.updated_at ).toISOString(), editor: editorLink( url.origin, r ) } ) ) );

}

// What a placed thing is, for get_project.
function describe( item, index ) {

	const known = ITEMS.get( item.library );
	const out = { index, item: item.library ?? item.kind ?? null, name: item.name ?? known?.name ?? item.kind, east: item.east, north: item.north, heading: item.heading ?? 0 };
	if ( item.kind && item.params ) out.params = item.params;
	if ( known?.dimensions ) out.size = known.dimensions;
	return out;

}

async function getProject( { env, account, url }, args ) {

	const row = await ownProject( env, account, args.project_id );
	return text( { project_id: row.id, name: row.name, site: row.site, lat: row.lat, lon: row.lon, editor: editorLink( url.origin, row ), items: row.layout.items.map( describe ) } );

}

// --- the library -----------------------------------------------------------------------------

async function searchLibrary( context, args ) {

	const words = String( args.query ?? '' ).toLowerCase().split( /\s+/ ).filter( Boolean );
	const category = typeof args.category === 'string' ? args.category.toLowerCase() : '';
	if ( ! words.length && ! category ) {

		const counts = {};
		for ( const item of CATALOG.items ) counts[ item.category ] = ( counts[ item.category ] ?? 0 ) + 1;
		return text( { categories: counts, note: 'Search with a query (and/or a category) for items and their ids.' } );

	}

	const limit = Math.min( 100, Math.max( 1, Math.floor( Number( args.limit ) || 25 ) ) );
	const found = CATALOG.items.filter( item => {

		const hay = `${ item.id } ${ item.name } ${ item.category }`.toLowerCase();
		return ( ! category || item.category.toLowerCase() === category ) && words.every( w => hay.includes( w ) );

	} ).slice( 0, limit );
	if ( ! found.length ) return text( 'Nothing matches. Try fewer or other words, or search with no query for the categories.' );
	return text( found.map( i => ( { id: i.id, name: i.name, category: i.category, size: i.dimensions } ) ) );

}

async function listSets() {

	return text( CATALOG.sets.map( s => ( { id: s.id, name: s.name, pieces: s.members.length } ) ) );

}

// A placed library item, as the editor saves one (layout.js resolves the rest from the library).
function configOf( id, at ) {

	const item = ITEMS.get( id );
	if ( ! item ) throw new ToolError( `No library item ${ JSON.stringify( id ) }: search_library has the ids` );
	if ( item.kind ) return { name: item.name, kind: item.kind, params: { ...item.params }, east: at.east, north: at.north, up: null, heading: at.heading, scale: 1 };
	return { name: item.name, library: item.id, east: at.east, north: at.north, up: null, heading: at.heading, scale: 1 };

}

async function placeItems( context, args ) {

	const items = Array.isArray( args.items ) ? args.items : [];
	if ( ! items.length || items.length > PER_CALL ) throw new ToolError( `items: one to ${ PER_CALL }` );
	const configs = items.map( item => configOf( item.item, { ...where( item ), heading: turned( item.heading ) } ) );
	return await change( context, args.project_id, layout => {

		layout.items.push( ...configs );
		return `Placed ${ configs.length }: ${ summary( configs ) }.`;

	} );

}

function summary( configs ) {

	const counts = new Map();
	for ( const c of configs ) counts.set( c.name, ( counts.get( c.name ) ?? 0 ) + 1 );
	return [ ...counts ].map( ( [ name, n ] ) => n > 1 ? `${ n } × ${ name }` : name ).join( ', ' );

}

// Where a set's piece stands for the set at (east, north) facing `heading` (sets.js's memberPlacement).
function memberAt( member, east, north, heading ) {

	const h = heading * Math.PI / 180;
	return {
		east: round( east + member.right * Math.cos( h ) + member.forward * Math.sin( h ) ),
		north: round( north - member.right * Math.sin( h ) + member.forward * Math.cos( h ) ),
		heading: round( ( heading + member.turn + 360 ) % 360 ),
	};

}

async function placeSet( context, args ) {

	const set = SETS.get( args.set_id );
	if ( ! set ) throw new ToolError( 'No such set: list_sets has their ids' );
	const { east, north } = where( args );
	const h = turned( args.heading );
	const configs = set.members.map( m => configOf( m.item, memberAt( m, east, north, h ) ) );
	return await change( context, args.project_id, layout => {

		layout.items.push( ...configs );
		return `Placed ${ set.name }: ${ summary( configs ) }.`;

	} );

}

async function placeRow( context, args ) {

	const item = ITEMS.get( args.item );
	if ( ! item ) throw new ToolError( `No library item ${ JSON.stringify( args.item ) }: search_library has the ids` );
	const points = Array.isArray( args.points ) ? args.points.map( p => where( { east: p?.[ 0 ], north: p?.[ 1 ] } ) ) : [];
	if ( points.length < 2 || points.length > 100 ) throw new ToolError( 'points: two to a hundred [east, north] pairs' );
	// Each piece runs along the line by its longer side: a fence panel is wider than it's deep, so it
	// turns a quarter for its width to follow the line.
	const { length: along = 1, width: across = 0 } = item.dimensions ?? {};
	const sideways = across > along;
	const length = sideways ? across : along;
	const step = args.spacing !== undefined ? number( args.spacing, 'spacing', { min: 0.2, max: 500 } ) : length + ( TOUCHING.includes( item.category ) ? 0 : 1 );
	const configs = [];
	// Along each stretch, the first copy's middle half its length in, then a step apart.
	let carry = length / 2;
	for ( let i = 0; i < points.length - 1; i ++ ) {

		const a = points[ i ], b = points[ i + 1 ];
		const run = Math.hypot( b.east - a.east, b.north - a.north );
		if ( run < 0.01 ) continue;
		const h = ( Math.atan2( b.east - a.east, b.north - a.north ) * 180 / Math.PI + 360 ) % 360;
		let at = carry;
		for ( ; at <= run + 1e-6; at += step ) {

			const t = at / run;
			configs.push( configOf( item.id, { east: round( a.east + ( b.east - a.east ) * t ), north: round( a.north + ( b.north - a.north ) * t ), heading: round( sideways ? ( h + 270 ) % 360 : h ) } ) );
			if ( configs.length > 500 ) throw new ToolError( 'That row would be more than 500 pieces: a shorter line or a wider spacing' );

		}

		carry = at - run;

	}

	if ( ! configs.length ) throw new ToolError( 'The line is shorter than one piece' );
	return await change( context, args.project_id, layout => {

		layout.items.push( ...configs );
		return `Placed a row of ${ configs.length } × ${ item.name }.`;

	} );

}

function size( value, name ) {

	return round( number( value, name, { min: 1, max: 2000 } ) );

}

async function addFlatten( context, args ) {

	const surface = SURFACES.includes( args.surface ) ? args.surface : 'gravel';
	const fence = FENCES.includes( args.fence ) ? args.fence : 'none';
	const gates = fence === 'none' ? 0 : Math.min( 8, Math.max( 0, Math.round( Number( args.entrances ) || 0 ) ) );
	const params = { width: size( args.width, 'width' ), length: size( args.length, 'length' ), height: 0, surface, ...( fence === 'none' ? {} : { fence, gates } ) };
	const config = { name: 'Flattened area', kind: 'flatten-zone', params, ...where( args ), up: null, heading: turned( args.heading ), scale: 1 };
	return await change( context, args.project_id, layout => {

		layout.items.push( config );
		return `Flattened ${ params.width } × ${ params.length } m${ surface === 'none' ? '' : `, surfaced with ${ surface }` }${ fence === 'none' ? '' : `, fenced (${ FENCE_NAMES[ fence ] }) with ${ gates } ${ gates === 1 ? 'entrance' : 'entrances' }` }.`;

	} );

}

async function addLaydown( context, args ) {

	const colour = /^#[0-9a-f]{6}$/i.test( args.colour ?? '' ) ? args.colour : '#ffd60a';
	const label = String( args.label ?? 'Laydown' ).slice( 0, 60 );
	const config = { name: label || 'Laydown area', kind: 'laydown', params: { label, colour, width: size( args.width, 'width' ), length: size( args.length, 'length' ), note: String( args.note ?? '' ).slice( 0, 200 ) }, ...where( args ), up: null, heading: turned( args.heading ), scale: 1 };
	return await change( context, args.project_id, layout => {

		layout.items.push( config );
		return `Marked "${ label }", ${ config.params.width } × ${ config.params.length } m.`;

	} );

}

async function addStockpile( context, args ) {

	const material = MATERIALS.includes( args.material ) ? args.material : 'gravel';
	const shape = args.shape === 'ridge' ? 'ridge' : 'cone';
	const params = shape === 'cone'
		? { shape, volume: round( number( args.volume, 'volume', { min: 0.5, max: 200000, fallback: 50 } ) ), material }
		: { shape, width: size( args.width, 'width' ), length: size( args.length, 'length' ), maxHeight: 0, material };
	const config = { name: 'Stockpile', kind: 'stockpile', params, ...where( args ), up: null, heading: turned( args.heading ), scale: 1 };
	return await change( context, args.project_id, layout => {

		layout.items.push( config );
		return `Piled ${ material }${ shape === 'cone' ? `, ${ params.volume } m³` : `, a ridge ${ params.width } × ${ params.length } m` }.`;

	} );

}

function index( layout, value ) {

	const i = Number( value );
	if ( ! Number.isInteger( i ) || i < 0 || i >= layout.items.length ) throw new ToolError( `No item ${ value }: get_project has the indexes (0 to ${ layout.items.length - 1 })` );
	return i;

}

async function moveItem( context, args ) {

	return await change( context, args.project_id, layout => {

		const item = layout.items[ index( layout, args.index ) ];
		if ( args.east !== undefined ) item.east = where( { east: args.east, north: 0 } ).east;
		if ( args.north !== undefined ) item.north = where( { east: 0, north: args.north } ).north;
		if ( args.heading !== undefined ) item.heading = turned( args.heading );
		return `Moved ${ item.name } to ${ item.east } m east, ${ item.north } m north, facing ${ item.heading }°.`;

	} );

}

async function removeItems( context, args ) {

	const indexes = Array.isArray( args.indexes ) ? args.indexes : [];
	if ( ! indexes.length ) throw new ToolError( 'indexes: which to remove (get_project)' );
	return await change( context, args.project_id, layout => {

		const gone = new Set( indexes.map( i => index( layout, i ) ) );
		const names = [ ...gone ].map( i => layout.items[ i ] );
		layout.items = layout.items.filter( ( _, i ) => ! gone.has( i ) );
		return `Removed ${ gone.size }: ${ summary( names ) }. The rest are numbered again: get_project for their indexes.`;

	} );

}

async function shareProject( { env, account, url }, args ) {

	const row = await ownProject( env, account, args.project_id );
	let token = row.share_token;
	if ( ! token ) {

		token = randomToken( 16 );
		await env.DB.prepare( 'UPDATE build_layouts SET share_token = ? WHERE id = ? AND account_id = ?' ).bind( token, row.id, account.id ).run();

	}

	const link = new URL( '/build/app/', url.origin );
	if ( row.lat !== null ) link.searchParams.set( 'at', `${ Number( row.lat ).toFixed( 6 ) },${ Number( row.lon ).toFixed( 6 ) }` );
	link.searchParams.set( 'place', row.site );
	link.searchParams.set( 'view', token );
	return text( { share: link.href, note: 'Anyone with the link sees the project, read only.' } );

}
