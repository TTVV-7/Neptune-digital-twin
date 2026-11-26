import { HttpError, json, randomToken } from '../http.js';
import { bearerAccount } from './oauth.js';
import { ACCOUNT_BYTES, LOG_KEEP_MS, limitsOf, planOf } from './build.js';
import { salesOn } from './billing.js';
import { search } from './search.js';
import CATALOG from './build-catalog.json' with { type: 'json' };

// World Drive Build's MCP server (worlddrive.app/mcp, docs/build.md): Claude (or any MCP client)
// connected to someone's World Drive account through OAuth (oauth.js) lays out their construction
// sites: finds a site by address, makes a project there, looks up the library (build-catalog.json,
// npm run make-build-catalog: every item with its real size, and the sets) and places equipment,
// sets, rows, flatten areas, laydown areas, stockpiles and markups (dimensions, arrows and notes),
// moves and removes them, and shares the
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
// src/grade.js's grades, and what each takes.
const GRADES = [ 'level', 'follow', 'plane', 'slope', 'ridge', 'valley', 'terraces' ];
const TOWARD = [ 'front', 'back', 'left', 'right' ];
const BATTERS = [ 1.5, 2, 3 ];
// What a flatten area keeps overhead (src/flatten.js's KEEPS).
const KEEPS = [ 'off', 'auto', 'height' ];
// Pieces placed touching end to end in a row; anything else a metre apart.
const TOUCHING = [ 'Barriers & fencing', 'Temporary covers' ];
// The largest the editor makes them (earthworks.js's normalizePile, laydown.js's clampSize): any
// bigger and it would quietly draw a smaller one than Claude said.
const PILE_VOLUME = 20000;
const PILE_SIZE = 200;
const LAYDOWN_SIZE = 1000;
// Markups (src/markups.js): their colours, how many points each takes, and the most words.
const MARKUP_KINDS = [ 'dimension', 'arrow', 'note' ];
const MARKUP_COLOURS = [ 'red', 'amber', 'blue', 'green', 'white' ];
const MARKUP_DEFAULT_COLOUR = { dimension: 'white', arrow: 'red', note: 'blue' };
const MARKUP_POINTS = { dimension: 2, arrow: 2, note: 1 };
const MARKUP_TEXT = 500;
const MARKUP_OFFSET = 1000;

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
const version = { version: { type: 'number', description: 'The project\'s version the indexes are from: get_project\'s, or the one the last change gave' } };

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
		name: 'get_project', title: 'What\'s in a project', description: 'Everything placed in a project, each with its index (for move_item and remove_items), what it is, where and which way it faces, and its size, and locked: true on those the person locked in the editor (move_item and remove_items leave them be); and the project\'s version, which move_item and remove_items take so they don\'t act on indexes that have changed since.',
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
		name: 'place_items', title: 'Place items', description: `Place library items (ids from search_library), each at its middle (unless search_library says it's placed by something else, as a tower crane is by its mast). Up to ${ PER_CALL } at a time.`,
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
		name: 'add_flatten_area', title: 'Flatten an area', description: 'Clear a rectangle of the 3D map (what\'s there is pressed flat), grade it and surface it: gravel (road base), clear-crush, pea-gravel, drain-rock, crusher-dust, pit-run, recycled-concrete, rip-rap, millings, asphalt, concrete, or none. Graded (anything but level), its edges meet the ground on batters: an embankment where it\'s built up, a cut slope where it\'s dug in; over 300 m wide or long it is only pressed down onto its shape, with no batters. Under a bridge, viaduct, overpass or canopy, keep_overhead keeps what passes over it: auto keeps what has open space under it (a deck, a canopy, and the pillars under it) and clears the rest, hiding the walls Google\'s 3D map hangs from a deck\'s edge; height keeps everything higher than keep_above m over the area\'s floor.',
		inputSchema: { type: 'object', properties: { ...project, ...point, width: { type: 'number', description: 'm, across its heading' }, length: { type: 'number', description: 'm, along its heading' }, ...heading, surface: { type: 'string', enum: SURFACES, default: 'gravel' }, fence: { type: 'string', enum: [ 'none', ...FENCES ], default: 'none', description: 'round its edge: mesh (chain-link temp fence panels, see-through), screened (green privacy screen), screened-black, mesh-silt (panels with silt fence at their foot), silt (silt fence alone), safety (orange plastic fence on T-posts, see-through)' }, entrances: { type: 'integer', minimum: 0, maximum: 8, description: '24 ft entrances (open double gates in panel fence, gaps in silt or safety fence), one to a side in turn: the front (the side it faces), back, right, left' }, grade: { type: 'string', enum: GRADES, default: 'follow', description: 'level (dead flat: at the ground\'s usual height under it when surfaced, down to the lowest ground under it with surface none), follow (a smoothed copy of the bare ground: follows the grade as it changes across the area, with what stands on it, bumps and debris taken away, smoothed over `smoothing` m; max_grade caps it), plane (one best-fit slope through the ground, as follow was before; max_grade caps it), slope (one plane falling `fall` % toward a side), ridge (a crown down the middle falling `fall` % to both sides), valley (a swale down the middle), terraces (`steps` level benches down the ground\'s slope)' }, fall: { type: 'number', minimum: 0.5, maximum: 20, default: 2, description: '%, for slope, ridge and valley' }, toward: { type: 'string', enum: TOWARD, default: 'front', description: 'the side a slope falls toward (front is the way it faces)' }, ridge_along: { type: 'string', enum: [ 'length', 'width' ], default: 'length', description: 'which way a ridge or valley runs' }, steps: { type: 'integer', minimum: 2, maximum: 8, default: 3, description: 'benches, for terraces' }, smoothing: { type: 'number', minimum: 2, maximum: 50, default: 10, description: 'm a follow area\'s ground is smoothed over: small hugs the ground, large is gentle' }, max_grade: { type: 'number', minimum: 0, maximum: 50, default: 0, description: '% steepest a follow or plane area may be anywhere, 0 for as steep as the ground' }, batter: { type: 'number', enum: BATTERS, default: 2, description: 'edge batters, horizontal to 1 vertical' }, keep_overhead: { type: 'string', enum: KEEPS, default: 'off', description: 'what passing over the area is kept: off (everything above the floor is flattened), auto (what has open space under it at least 2.5 m up: a bridge deck, a viaduct, a canopy, and its pillars), height (everything higher than keep_above)' }, keep_above: { type: 'number', minimum: 0.5, maximum: 200, default: 5, description: 'm above the area\'s floor, for keep_overhead height' }, raise: { type: 'number', minimum: - 30, maximum: 30, default: 0, description: 'm to raise (positive) or lower (negative) the whole finished area, every shape and its batters, from the ground\'s height it otherwise takes; it keeps this wherever it\'s moved' }, finished_height: { type: 'number', minimum: - 500, maximum: 9000, description: 'an exact finished height instead of raise: m above the project site\'s origin, as the editor\'s "up" (it stays there wherever it\'s moved)' } }, required: [ 'project_id', 'east', 'north', 'width', 'length' ] },
		run: addFlatten,
	},
	{
		name: 'add_laydown_area', title: 'Mark a laydown area', description: 'Mark out a rectangle where materials and equipment go, with a label.',
		inputSchema: { type: 'object', properties: { ...project, ...point, width: { type: 'number', minimum: 1, maximum: LAYDOWN_SIZE }, length: { type: 'number', minimum: 1, maximum: LAYDOWN_SIZE }, ...heading, label: { type: 'string' }, colour: { type: 'string', description: '#rrggbb', default: '#ffd60a' }, note: { type: 'string' } }, required: [ 'project_id', 'east', 'north', 'width', 'length' ] },
		run: addLaydown,
	},
	{
		name: 'add_stockpile', title: 'Add a stockpile', description: 'A pile of material: a cone of a volume, or a ridge filling width x length.',
		inputSchema: { type: 'object', properties: { ...project, ...point, material: { type: 'string', enum: MATERIALS, default: 'gravel' }, shape: { type: 'string', enum: [ 'cone', 'ridge' ], default: 'cone' }, volume: { type: 'number', minimum: 0.5, maximum: PILE_VOLUME, description: 'm³, for a cone', default: 50 }, width: { type: 'number', minimum: 1, maximum: PILE_SIZE, description: 'm, for a ridge' }, length: { type: 'number', minimum: 1, maximum: PILE_SIZE, description: 'm, for a ridge' }, ...heading }, required: [ 'project_id', 'east', 'north' ] },
		run: addStockpile,
	},
	{
		name: 'add_markup', title: 'Add a markup', description: 'Mark up the site as on a drawing: a dimension (a measured line between two points, labelled with its length on plan in metres, or with height: true the difference in height between them), an arrow (a leader: from the point called out, where the arrowhead is, to where its words sit) or a note (a callout pinned to a spot: red for a hazard, amber for caution, blue for information). Points are metres east and north of the site point, and up (m above the site point, as the editor\'s "up") if given for every point; without up the markup sits on the ground. Returns the markup as stored (get_project lists it; remove_items takes it away).',
		inputSchema: { type: 'object', properties: { ...project, kind: { type: 'string', enum: MARKUP_KINDS }, points: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'object', properties: { east: { type: 'number' }, north: { type: 'number' }, up: { type: 'number', description: 'm above the site point (optional; all or none)' } }, required: [ 'east', 'north' ] }, description: 'dimension: [ A, B ]; arrow: [ the point called out, where the words go ]; note: [ the spot ]' }, text: { type: 'string', maxLength: MARKUP_TEXT, description: 'the arrow\'s or note\'s words (a note needs some)' }, colour: { type: 'string', enum: MARKUP_COLOURS, description: 'red (hazard), amber (caution), blue (info), green, white. Default: white for a dimension, red for an arrow, blue for a note' }, height: { type: 'boolean', default: false, description: 'a dimension measuring the difference in height between its points (both need up)' }, offset: { type: 'number', minimum: - MARKUP_OFFSET, maximum: MARKUP_OFFSET, default: 0, description: 'm a dimension\'s line is drawn to the left of A -> B (negative: to the right), with extension lines back to the points' } }, required: [ 'project_id', 'kind', 'points' ] },
		run: addMarkup,
	},
	{
		name: 'move_item', title: 'Move an item', description: 'Move or turn something already placed (its index from get_project). Not one that\'s locked: the person unlocks it in the editor first.',
		inputSchema: { type: 'object', properties: { ...project, ...version, index: { type: 'number' }, east: { type: 'number' }, north: { type: 'number' }, heading: { type: 'number' } }, required: [ 'project_id', 'version', 'index' ] },
		run: moveItem,
	},
	{
		name: 'remove_items', title: 'Remove items', description: 'Remove things already placed, by their indexes from get_project. Not those that are locked: the person unlocks them in the editor first.',
		inputSchema: { type: 'object', properties: { ...project, ...version, indexes: { type: 'array', items: { type: 'number' } } }, required: [ 'project_id', 'version', 'indexes' ] },
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
	// With buying hidden (BUILD_SALES not 'on', billing.js) it says so plainly, with nowhere to buy.
	if ( ( await planOf( env, account ) ).tier === 'free' ) return text( salesOn( env )
		? 'World Drive Build\'s Claude connector comes with Build Pro. Upgrade at https://worlddrive.app/build/ and try again.'
		: 'World Drive Build\'s Claude connector is part of Build Pro, which this account isn\'t on. Build Pro isn\'t available to buy right now.', true );
	const hourly = Number.isFinite( Number( env.MCP_HOURLY ) ) && env.MCP_HOURLY !== undefined && env.MCP_HOURLY !== '' ? Number( env.MCP_HOURLY ) : 300;
	const used = ( await env.DB.prepare( 'SELECT COUNT(*) AS n FROM mcp_calls WHERE account_id = ? AND at > ?' ).bind( account.id, now - 3600 * 1000 ).first() )?.n ?? 0;
	if ( used >= hourly ) return text( `That's ${ hourly } changes this hour, the most an account makes. Try again later.`, true );
	// Calls older than the Privacy Policy keeps them (LOG_KEEP_MS) go as new ones come, a few at a time.
	await env.DB.batch( [
		env.DB.prepare( 'INSERT INTO mcp_calls ( account_id, at ) VALUES ( ?, ? )' ).bind( account.id, now ),
		env.DB.prepare( 'DELETE FROM mcp_calls WHERE rowid IN ( SELECT rowid FROM mcp_calls WHERE at < ? LIMIT 100 )' ).bind( now - LOG_KEEP_MS ),
	] );
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

// Saves a project's layout after a change (the editor, if open on it, says it changed and offers
// it), within what the account may store in all as the editor's saves are (build.js's
// updateLayout), so they don't then fail for the account being full. Returns its new version.
async function save( env, account, row, layout, now ) {

	if ( layout.items.length > PROJECT_ITEMS ) throw new ToolError( `A project holds at most ${ PROJECT_ITEMS } things` );
	const data = JSON.stringify( layout );
	if ( data.length > LAYOUT_BYTES ) throw new ToolError( 'That makes the project too big to save' );
	const { bytes } = await env.DB.prepare( 'SELECT COALESCE( SUM( LENGTH( data ) ), 0 ) AS bytes FROM build_layouts WHERE account_id = ?' ).bind( account.id ).first();
	if ( bytes - row.data.length + data.length > ACCOUNT_BYTES ) throw new ToolError( 'The account is full: that would store more than it may. Delete some projects in the editor first.' );
	const updatedAt = Math.max( now, row.updated_at + 1 );
	const updated = await env.DB.prepare( 'UPDATE build_layouts SET data = ?, updated_at = ? WHERE id = ? AND updated_at = ?' )
		.bind( data, updatedAt, row.id, row.updated_at ).run();
	if ( ! updated.meta.changes ) throw new ToolError( 'The project was changed somewhere else just then. Try again.' );
	return updatedAt;

}

// A change to a project: fn( layout ) changes it and says what it did. Given `version` (what
// indexes were read from), it's refused if the project has been saved since: the editor saves its
// items in the order they finished loading, and anyone's add or remove shifts the rest, so an old
// index may well be something else now. The new version comes back, unless the change renumbers
// what's left (removing), when the old indexes are no good anyway.
async function change( context, id, fn, { version, renumbers = false } = {} ) {

	const { env, account, now, url } = context;
	const row = await ownProject( env, account, id );
	if ( version !== undefined ) sameVersion( row, version );
	const said = fn( row.layout );
	const updatedAt = await save( env, account, row, row.layout, now );
	const versionText = renumbers ? '' : ` (version ${ updatedAt }: indexes from before still hold)`;
	return text( `${ said }\nThe project has ${ row.layout.items.length } things now${ versionText }. Open it: ${ editorLink( url.origin, row ) }` );

}

function sameVersion( row, value ) {

	if ( value === undefined || value === null ) throw new ToolError( 'version: the one get_project gave with the indexes' );
	if ( Number( value ) !== row.updated_at ) throw new ToolError( 'The project has changed since those indexes were read (in the editor, or by another change), so they may be other things now. get_project again for its indexes and version.' );

}

async function findSite( context, args ) {

	const q = String( args.query ?? '' ).trim();
	if ( ! q ) throw new ToolError( 'query: an address, town or landmark' );
	const url = new URL( `/api/search?q=${ encodeURIComponent( q ) }`, context.url.origin );
	const res = await search( { ...context, url } );
	const { results, streetOnly } = await res.json();
	if ( ! results?.length ) return text( 'Nothing found. Try a street address with its town, or a landmark.' );
	// exact: a building or numbered address (search.js's house), not just its street; those come first.
	const places = results.map( r => ( { place: r.name, lat: r.lat, lon: r.lon, exact: r.house === true } ) );
	return text( streetOnly ? { note: 'Street only: the exact address wasn\'t found. Tell the person to move the site into place in the editor.', places } : places );

}

async function createProject( context, args ) {

	const { env, account, now, url } = context;
	const name = String( args.name ?? '' ).trim().slice( 0, 100 );
	const place = String( args.place ?? '' ).trim().slice( 0, 100 );
	if ( ! name || ! place ) throw new ToolError( 'name and place, please' );
	const lat = number( args.lat, 'lat', { min: - 85, max: 85 } );
	const lon = number( args.lon, 'lon', { min: - 180, max: 180 } );
	const plan = await planOf( env, account );
	// The same limits as a project made in the editor (build.js's createLayout).
	const most = plan.tier === 'free' ? 1 : limitsOf( env ).layouts;
	const layout = { version: 2, site: place, lat, lon, items: [], extras: {} };
	const { count, bytes } = await env.DB.prepare( 'SELECT COUNT(*) AS count, COALESCE( SUM( LENGTH( data ) ), 0 ) AS bytes FROM build_layouts WHERE account_id = ?' ).bind( account.id ).first();
	if ( count >= most ) throw new ToolError( 'The account has as many projects as it can. Delete some in the editor first.' );
	if ( bytes + JSON.stringify( layout ).length > ACCOUNT_BYTES ) throw new ToolError( 'The account is full. Delete some projects in the editor first.' );
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
	// A dimension's length (or height) as its label in the editor says it.
	const [ a, b ] = item.kind === 'markup' && item.params?.type === 'dimension' && Array.isArray( item.params.points ) ? item.params.points : [];
	if ( a && b ) out.measures = `${ ( item.params.vertical ? Math.abs( ( b[ 2 ] ?? 0 ) - ( a[ 2 ] ?? 0 ) ) : Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] ) ).toFixed( 1 ) } m`;
	if ( known?.dimensions ) out.size = known.dimensions;
	const by = placedBy( item.kind, item.params );
	if ( by ) out.placed = by;
	// Locked in the editor, so it isn't changed by accident (move_item and remove_items refuse it).
	if ( item.locked === true ) out.locked = true;
	return out;

}

async function getProject( { env, account, url }, args ) {

	const row = await ownProject( env, account, args.project_id );
	return text( { project_id: row.id, name: row.name, site: row.site, lat: row.lat, lon: row.lon, version: row.updated_at, editor: editorLink( url.origin, row ), items: row.layout.items.map( describe ) } );

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
	return text( found.map( i => {

		const by = placedBy( i.kind, i.params );
		return { id: i.id, name: i.name, category: i.category, size: i.dimensions, ...( by ? { placed: by } : {} ) };

	} ) );

}

// Where an item built in code is placed by, if not its middle: it isn't recentred (models.js), so
// a tower crane stands where it's put by its mast, its jib out the way it faces and its counter-jib
// behind (tower-crane.js's shape), and its size is for the jib it's listed with.
function placedBy( kind, params ) {

	if ( kind !== 'tower-crane' ) return null;
	const jib = Math.min( 80, Math.max( 20, Number( params?.jib ) || 50 ) );
	return `by its mast, not its middle: the jib reaches ${ round( jib + 1 ) } m the way it faces (heading), the counter-jib ${ Math.max( 12, Math.round( jib * 0.32 ) ) } m behind; the hook works up to ${ jib } m from the mast all round`;

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
	const facing = ( a, b ) => {

		const h = ( Math.atan2( b.east - a.east, b.north - a.north ) * 180 / Math.PI + 360 ) % 360;
		return round( sideways ? ( h + 270 ) % 360 : h );

	};

	const configs = [];
	let left = '';
	if ( args.spacing === undefined && TOUCHING.includes( item.category ) ) {

		// End to end as the editor's rows lay them (rows.js's layOut): each piece from where the last
		// ended to where the line is its length away, cutting across a corner rather than stopping
		// short of it or sticking out past it. Pieces that share their joints (a fence panel's feet)
		// are rowLength apart, not their box's length.
		const links = chain( points, item.rowLength ?? length );
		const spare = links.total - ( links.length ? links[ links.length - 1 ][ 1 ] : 0 );
		const closed = points.length > 3 && Math.hypot( points[ 0 ].east - points.at( - 1 ).east, points[ 0 ].north - points.at( - 1 ).north ) < 0.05;
		// Along an open line, what's over is split between its ends; round a loop, it's where it closes.
		const shifted = ! closed && spare > 1e-3 ? chain( points, item.rowLength ?? length, spare / 2 ) : links;
		const used = shifted.length === links.length ? shifted : links;
		for ( const [ sa, sb ] of used ) {

			const a = links.point( sa ), b = links.point( sb );
			configs.push( configOf( item.id, { east: round( ( a.east + b.east ) / 2 ), north: round( ( a.north + b.north ) / 2 ), heading: facing( a, b ) } ) );

		}

		if ( spare >= 0.05 ) left = closed ? ` It leaves a ${ round( spare ) } m gap where the loop closes, shorter than a piece.` : ` It stops ${ round( used === shifted ? spare / 2 : spare ) } m short of ${ used === shifted ? 'each end' : 'the end' }, less than a piece.`;

	} else {

		const step = args.spacing !== undefined ? number( args.spacing, 'spacing', { min: 0.2, max: 500 } ) : length + 1;
		// Along each stretch, the first copy's middle half its length in, then a step apart.
		let carry = length / 2;
		for ( let i = 0; i < points.length - 1; i ++ ) {

			const a = points[ i ], b = points[ i + 1 ];
			const run = Math.hypot( b.east - a.east, b.north - a.north );
			if ( run < 0.01 ) continue;
			let at = carry;
			for ( ; at <= run + 1e-6; at += step ) {

				const t = at / run;
				configs.push( configOf( item.id, { east: round( a.east + ( b.east - a.east ) * t ), north: round( a.north + ( b.north - a.north ) * t ), heading: facing( a, b ) } ) );
				if ( configs.length > 500 ) break;

			}

			carry = at - run;

		}

	}

	if ( configs.length > 500 ) throw new ToolError( 'That row would be more than 500 pieces: a shorter line or a wider spacing' );
	if ( ! configs.length ) throw new ToolError( 'The line is shorter than one piece' );
	return await change( context, args.project_id, layout => {

		layout.items.push( ...configs );
		return `Placed a row of ${ configs.length } × ${ item.name }.${ left }`;

	} );

}

// Pieces `extent` long end to end along a line of points from `start` metres along it: each
// [ from, to ] in metres along the line, where `to` is the first point on it `extent` from `from` in
// a straight line (rows.js's reach). The list also has the line's total and point( s ), the point
// s metres along it.
function chain( points, extent, start = 0 ) {

	const starts = [ 0 ];
	for ( let k = 1; k < points.length; k ++ ) starts.push( starts[ k - 1 ] + Math.hypot( points[ k ].east - points[ k - 1 ].east, points[ k ].north - points[ k - 1 ].north ) );
	const total = starts.at( - 1 );
	const at = s => {

		s = Math.min( total, Math.max( 0, s ) );
		let k = 0;
		while ( k < points.length - 2 && starts[ k + 1 ] <= s ) k ++;
		const run = starts[ k + 1 ] - starts[ k ];
		const f = run > 0 ? ( s - starts[ k ] ) / run : 0;
		const a = points[ k ], b = points[ k + 1 ];
		return { east: a.east + ( b.east - a.east ) * f, north: a.north + ( b.north - a.north ) * f, k, f };

	};

	const reach = s => {

		const from = at( s );
		for ( let k = from.k; k < points.length - 1; k ++ ) {

			const de = points[ k + 1 ].east - points[ k ].east;
			const dn = points[ k + 1 ].north - points[ k ].north;
			const square = de * de + dn * dn;
			const fe = points[ k ].east - from.east;
			const fn = points[ k ].north - from.north;
			const b = fe * de + fn * dn;
			const disc = b * b - square * ( fe * fe + fn * fn - extent * extent );
			if ( square === 0 || disc < 0 ) continue;
			// Where the stretch leaves the circle of that radius round where the piece starts.
			const f = ( - b + Math.sqrt( disc ) ) / square;
			if ( f >= ( k === from.k ? from.f : 0 ) - 1e-9 && f <= 1 + 1e-9 ) return starts[ k ] + Math.min( 1, Math.max( 0, f ) ) * Math.sqrt( square );

		}

		return null;

	};

	const links = [];
	for ( let s = start, end; links.length <= 500 && ( end = reach( s ) ) !== null; s = end ) links.push( [ s, end ] );
	return Object.assign( links, { total, point: at } );

}

function size( value, name, max ) {

	return round( number( value, name, { min: 1, max } ) );

}

async function addFlatten( context, args ) {

	const surface = SURFACES.includes( args.surface ) ? args.surface : 'gravel';
	const fence = FENCES.includes( args.fence ) ? args.fence : 'none';
	const gates = fence === 'none' ? 0 : Math.min( 8, Math.max( 0, Math.round( Number( args.entrances ) || 0 ) ) );
	const grading = gradeOf( args );
	const overhead = keepOf( args );
	const height = heightOf( args );
	const params = { width: size( args.width, 'width', 2000 ), length: size( args.length, 'length', 2000 ), height: overhead.height, ...overhead.params, ...height.params, surface, ...( fence === 'none' ? {} : { fence, gates } ), ...grading.params };
	const config = { name: 'Flattened area', kind: 'flatten-zone', params, ...where( args ), up: null, heading: turned( args.heading ), scale: 1 };
	return await change( context, args.project_id, layout => {

		layout.items.push( config );
		return `Flattened ${ params.width } × ${ params.length } m${ surface === 'none' ? '' : `, surfaced with ${ surface }` }${ fence === 'none' ? '' : `, fenced (${ FENCE_NAMES[ fence ] }) with ${ gates } ${ gates === 1 ? 'entrance' : 'entrances' }` }, ${ grading.text }${ height.text }${ overhead.text }.`;

	} );

}

// A flatten area raised or lowered from the ground's height (clamped to the editor's ±30 m, to the
// centimetre), or at an exact finished height, as saved (src/flatten.js: raise, finished; nothing at
// the ground's height) and in words.
function heightOf( args ) {

	if ( args.finished_height !== undefined && args.finished_height !== null ) {

		const finished = round( Math.min( 9000, Math.max( - 500, number( args.finished_height, 'finished_height' ) ) ) );
		return { params: { finished }, text: `, finished at ${ finished } m (as the editor's up)` };

	}

	const raise = args.raise === undefined || args.raise === null ? 0 : round( Math.min( 30, Math.max( - 30, number( args.raise, 'raise' ) ) ) );
	if ( ! raise ) return { params: {}, text: '' };
	return { params: { raise }, text: `, ${ raise > 0 ? 'raised' : 'lowered' } ${ Math.abs( raise ) } m from the ground's height` };

}

// What a flatten area keeps overhead, as saved (src/flatten.js: a height limit as `height`, auto as
// keep) and in words. An unknown choice is refused; the height is clamped to what the editor offers.
function keepOf( args ) {

	const keep = args.keep_overhead ?? 'off';
	if ( ! KEEPS.includes( keep ) ) throw new ToolError( `keep_overhead must be one of ${ KEEPS.join( ', ' ) }` );
	if ( keep === 'auto' ) return { height: 0, params: { keep }, text: ', keeping what passes over it with open space under it (decks, canopies) and its pillars' };
	if ( keep === 'off' ) return { height: 0, params: {}, text: '' };
	const height = args.keep_above === undefined ? 5 : Math.round( Math.min( 200, Math.max( 0.5, number( args.keep_above, 'keep_above' ) ) ) * 2 ) / 2;
	return { height, params: {}, text: `, keeping everything more than ${ height } m above it` };

}

// A flatten area's grading as saved (src/grade.js saveGrade: nothing for level) and in words.
// Unknown values are refused; numbers are clamped to what the editor offers.
function gradeOf( args ) {

	const grade = args.grade ?? 'follow';
	if ( ! GRADES.includes( grade ) ) throw new ToolError( `grade must be one of ${ GRADES.join( ', ' ) }` );
	if ( grade === 'level' ) return { params: {}, text: 'level' };
	const clamp = ( value, name, min, max, fallback ) => value === undefined ? fallback : Math.min( max, Math.max( min, number( value, name ) ) );
	const batter = args.batter === undefined ? 2 : BATTERS.reduce( ( best, b ) => Math.abs( b - number( args.batter, 'batter' ) ) < Math.abs( best - Number( args.batter ) ) ? b : best, 2 );
	const params = { grade, batter };
	let text = '';
	if ( grade === 'follow' || grade === 'plane' ) {

		const maxGrade = round( clamp( args.max_grade, 'max_grade', 0, 50, 0 ) );
		if ( maxGrade > 0 ) params.maxGrade = maxGrade;
		// The usual 10 m isn't saved (src/grade.js saveGrade).
		const smoothing = grade === 'follow' ? Math.round( clamp( args.smoothing, 'smoothing', 2, 50, 10 ) ) : 10;
		if ( smoothing !== 10 ) params.smoothing = smoothing;
		const capped = maxGrade > 0 ? `, no steeper than ${ maxGrade }%` : '';
		text = grade === 'follow' ? `following the ground (smoothed over ${ smoothing } m${ capped })` : `on one slope fitted through the ground${ capped ? ` (${ capped.slice( 2 ) })` : '' }`;

	} else if ( grade === 'terraces' ) {

		params.steps = Math.round( clamp( args.steps, 'steps', 2, 8, 3 ) );
		text = `in ${ params.steps } terraces`;

	} else {

		params.fall = Math.round( clamp( args.fall, 'fall', 0.5, 20, 2 ) * 2 ) / 2;
		if ( grade === 'slope' ) {

			const toward = args.toward ?? 'front';
			if ( ! TOWARD.includes( toward ) ) throw new ToolError( `toward must be one of ${ TOWARD.join( ', ' ) }` );
			params.toward = toward;
			text = `falling ${ params.fall }% to the ${ toward }`;

		} else {

			const along = args.ridge_along ?? 'length';
			if ( along !== 'length' && along !== 'width' ) throw new ToolError( 'ridge_along must be length or width' );
			params.ridgeAlong = along;
			text = `${ grade === 'ridge' ? 'crowned' : 'with a swale' } (${ params.fall }% each way, along its ${ along })`;

		}

	}

	return { params, text: `${ text }, edges battered ${ batter } : 1` };

}

async function addLaydown( context, args ) {

	const colour = /^#[0-9a-f]{6}$/i.test( args.colour ?? '' ) ? args.colour : '#ffd60a';
	const label = String( args.label ?? 'Laydown' ).slice( 0, 60 );
	const config = { name: label || 'Laydown area', kind: 'laydown', params: { label, colour, width: size( args.width, 'width', LAYDOWN_SIZE ), length: size( args.length, 'length', LAYDOWN_SIZE ), note: String( args.note ?? '' ).slice( 0, 200 ) }, ...where( args ), up: null, heading: turned( args.heading ), scale: 1 };
	return await change( context, args.project_id, layout => {

		layout.items.push( config );
		return `Marked "${ label }", ${ config.params.width } × ${ config.params.length } m.`;

	} );

}

async function addStockpile( context, args ) {

	const material = MATERIALS.includes( args.material ) ? args.material : 'gravel';
	const shape = args.shape === 'ridge' ? 'ridge' : 'cone';
	const params = shape === 'cone'
		? { shape, volume: round( number( args.volume, 'volume', { min: 0.5, max: PILE_VOLUME, fallback: 50 } ) ), material }
		: { shape, width: size( args.width, 'width', PILE_SIZE ), length: size( args.length, 'length', PILE_SIZE ), maxHeight: 0, material };
	const config = { name: 'Stockpile', kind: 'stockpile', params, ...where( args ), up: null, heading: turned( args.heading ), scale: 1 };
	return await change( context, args.project_id, layout => {

		layout.items.push( config );
		return `Piled ${ material }${ shape === 'cone' ? `, ${ params.volume } m³` : `, a ridge ${ params.width } × ${ params.length } m` }.`;

	} );

}

// A markup (src/markups.js): its origin in the middle of its points on plan, at the first one's
// height (or null: on the ground), its points from there as [ east, north, up ].
function markupOf( args ) {

	const kind = args.kind;
	if ( ! MARKUP_KINDS.includes( kind ) ) throw new ToolError( `kind must be one of ${ MARKUP_KINDS.join( ', ' ) }` );
	const count = MARKUP_POINTS[ kind ];
	if ( ! Array.isArray( args.points ) || args.points.length !== count ) throw new ToolError( `points: a ${ kind } takes ${ count === 1 ? 'one point' : `${ count } points` } ({ east, north, up? })` );
	const points = args.points.map( ( p, i ) => {

		const value = Array.isArray( p ) ? { east: p[ 0 ], north: p[ 1 ], up: p[ 2 ] } : p ?? {};
		const at = where( { east: value.east, north: value.north } );
		const up = value.up === undefined || value.up === null ? null : round( number( value.up, `points[${ i }].up`, { min: - 500, max: 9000 } ) );
		return { ...at, up };

	} );
	const heights = points.filter( p => p.up !== null ).length;
	if ( heights && heights !== points.length ) throw new ToolError( 'points: give up for every point or for none' );
	const height = args.height === true;
	if ( args.height !== undefined && typeof args.height !== 'boolean' ) throw new ToolError( 'height: true or false' );
	if ( height && kind !== 'dimension' ) throw new ToolError( 'height: only for a dimension' );
	if ( height && ! heights ) throw new ToolError( 'height: a height dimension needs up for both points' );
	if ( args.text !== undefined && typeof args.text !== 'string' ) throw new ToolError( 'text: words' );
	const text = String( args.text ?? '' ).trim();
	if ( text.length > MARKUP_TEXT ) throw new ToolError( `text: at most ${ MARKUP_TEXT } characters` );
	if ( kind === 'note' && ! text ) throw new ToolError( 'text: what the note says' );
	if ( args.colour !== undefined && ! MARKUP_COLOURS.includes( args.colour ) ) throw new ToolError( `colour must be one of ${ MARKUP_COLOURS.join( ', ' ) }` );
	const colour = args.colour ?? MARKUP_DEFAULT_COLOUR[ kind ];
	const middle = k => round( ( Math.min( ...points.map( p => p[ k ] ) ) + Math.max( ...points.map( p => p[ k ] ) ) ) / 2 );
	const east = middle( 'east' );
	const north = middle( 'north' );
	const up = heights ? points[ 0 ].up : null;
	const params = { type: kind, points: points.map( p => [ round( p.east - east ), round( p.north - north ), heights ? round( p.up - up ) : 0 ] ), colour, text: kind === 'dimension' ? '' : text };
	let measured = null;
	if ( kind === 'dimension' ) {

		const [ a, b ] = points;
		measured = height ? Math.abs( b.up - a.up ) : Math.hypot( b.east - a.east, b.north - a.north );
		if ( measured < 0.01 ) throw new ToolError( height ? 'points: a height dimension\'s points must be at different heights' : 'points: a dimension\'s points must be apart' );
		params.offset = round( number( args.offset, 'offset', { min: - MARKUP_OFFSET, max: MARKUP_OFFSET, fallback: 0 } ) );
		params.vertical = height;

	}

	if ( kind === 'arrow' ) {

		const [ a, b ] = points;
		if ( Math.hypot( b.east - a.east, b.north - a.north, heights ? b.up - a.up : 0 ) < 0.05 ) throw new ToolError( 'points: an arrow\'s points must be apart' );

	}

	const name = kind === 'dimension' ? ( height ? 'Height' : 'Dimension' ) : kind === 'arrow' ? 'Arrow' : 'Note';
	return { config: { name, kind: 'markup', params, east, north, up, heading: 0, scale: 1 }, measured };

}

async function addMarkup( context, args ) {

	const { config, measured } = markupOf( args );
	return await change( context, args.project_id, layout => {

		layout.items.push( config );
		const what = measured !== null ? `${ config.params.vertical ? 'a height dimension' : 'a dimension' } of ${ measured.toFixed( 1 ) } m` : `${ config.params.type === 'arrow' ? 'an arrow' : 'a note' }${ config.params.text ? ` saying "${ config.params.text }"` : '' }`;
		return `Added ${ what } (${ config.params.colour }), item ${ layout.items.length - 1 }: ${ JSON.stringify( config ) }`;

	} );

}

function index( layout, value ) {

	const i = Number( value );
	if ( ! Number.isInteger( i ) || i < 0 || i >= layout.items.length ) throw new ToolError( `No item ${ value }: get_project has the indexes (0 to ${ layout.items.length - 1 })` );
	return i;

}

// Items locked in the editor (the person's Lock, saved as locked: true) aren't moved or removed
// from here either: they asked for them to stay as they are.
function refuseLocked( layout, indexes ) {

	const locked = indexes.filter( i => layout.items[ i ].locked === true );
	if ( locked.length === 0 ) return;
	const [ first ] = locked;
	if ( locked.length === 1 ) throw new ToolError( `Item ${ first } (${ layout.items[ first ].name ?? 'it' }) is locked in the editor; unlock it there first. Nothing was changed.` );
	throw new ToolError( `Items ${ locked.join( ', ' ) } are locked in the editor; unlock them there first. Nothing was changed.` );

}

async function moveItem( context, args ) {

	return await change( context, args.project_id, layout => {

		const i = index( layout, args.index );
		refuseLocked( layout, [ i ] );
		const item = layout.items[ i ];
		if ( args.east !== undefined ) item.east = where( { east: args.east, north: 0 } ).east;
		if ( args.north !== undefined ) item.north = where( { east: 0, north: args.north } ).north;
		if ( args.heading !== undefined ) item.heading = turned( args.heading );
		return `Moved ${ item.name } to ${ item.east } m east, ${ item.north } m north, facing ${ item.heading }°.`;

	}, { version: args.version ?? null } );

}

async function removeItems( context, args ) {

	const indexes = Array.isArray( args.indexes ) ? args.indexes : [];
	if ( ! indexes.length ) throw new ToolError( 'indexes: which to remove (get_project)' );
	return await change( context, args.project_id, layout => {

		const gone = new Set( indexes.map( i => index( layout, i ) ) );
		refuseLocked( layout, [ ...gone ] );
		const names = [ ...gone ].map( i => layout.items[ i ] );
		layout.items = layout.items.filter( ( _, i ) => ! gone.has( i ) );
		return `Removed ${ gone.size }: ${ summary( names ) }. The rest are numbered again: get_project for their indexes.`;

	}, { version: args.version ?? null, renumbers: true } );

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
