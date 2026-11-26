import './markups.css';
import { BoxGeometry, ConeGeometry, Group, Mesh, MeshBasicMaterial, Quaternion, Raycaster, SphereGeometry, Vector2, Vector3 } from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { registerKind } from './kinds.js';
import { localToEnu } from './geo.js';
import { passesHitFilters } from './walk.js';
import { setFromView } from './view-ray.js';

// Site markups, as on a marked-up drawing (Bluebeam Revu, SketchUp): dimensions, arrows and notes
// drawn over the site in build mode. Each is a placed kind (kinds.js), so it's saved with the
// layout, selected, moved, copied and pasted, hidden, deleted and undone like any item, and the
// Show panel (layers.js) lists them all as Markups.
//
// - Dimension: click A, then B, then where the dimension line goes (it's offset sideways from the
//   measured points, with extension lines back to them). The label is the distance on plan, to a
//   tenth of a metre. Shift squares A to B to north or east. A height dimension (the Height tool,
//   or Alt on the second click) measures how much higher one point is than the other.
// - Arrow: click what's called out (the arrowhead goes there), then where the text sits, and type.
// - Note: click a spot and type: a callout pinned there, red (hazard), amber (caution), blue
//   (info), green or white.
//
// Points snap to whatever is under the pointer: the ground, or a placed item's surface. A point put
// on an item is pinned to it (the item is given an id: models.js), and follows it when it's moved
// or turned; the markup's other points stay where they are. Moving a markup's own point (or the
// markup) away from the item lets go of it.
//
// A markup's config: { kind: 'markup', name, east, north, up, heading, params } with params
//   type: 'dimension' | 'arrow' | 'note'
//   points: [ [ east, north, up ], ... ] metres from its origin (east, north, up above), in its
//           own frame (as if it faced north, heading 0): a dimension's A and B, an arrow's tip and
//           text, a note's spot
//   text: the arrow's or note's words
//   colour: 'red' | 'amber' | 'blue' | 'green' | 'white'
//   offset: a dimension's line, metres to the left of A -> B (negative: right)
//   vertical: true for a height dimension
//   attach: [ { item: id, at: [ x, y, z ] } or null, ... ] (only when some point is pinned): the
//           item each point is pinned to and where on it, in the item's own frame
// Its origin is the middle of its points on plan, its up the first point's height, or null to sit
// on the ground (a markup pasted, its lowest point then on the ground, or made by Claude without
// heights: the MCP server's add_markup).
//
// Lines, ticks and arrowheads are drawn over everything, and the labels are HTML over the scene,
// the same size on screen at any distance. Invisible boxes over the lines and labels (sized to the
// screen each frame) make them clickable in build mode.

export const MARKUP = 'markup';
export const COLOURS = { red: '#ff453a', amber: '#ffb020', blue: '#3d9bff', green: '#34d06b', white: '#f4f7fa' };
const COLOUR_NAMES = { 'Red (hazard)': 'red', 'Amber (caution)': 'amber', 'Blue (info)': 'blue', Green: 'green', White: 'white' };
const TYPES = [ 'dimension', 'arrow', 'note' ];
const DEFAULT_COLOUR = { dimension: 'white', arrow: 'red', note: 'blue' };
export const MAX_TEXT = 500;
const MAX_OFFSET = 1000;
// A dimension or arrow shorter than this (m) isn't one: a second click on the first point, say.
const MIN_LENGTH = 0.05;

// Pixels, at any distance.
const LINE_WIDTH = 2.5;
const EXTENSION_WIDTH = 1.25;
const TICK_PX = 14;
const HEAD_PX = 18;
const DOT_PX = 7;
const PICK_PX = 14;
// Labels hide beyond this (m), and notes sit this far (px) above their spot.
const LABEL_RANGE = 3000;
const NOTE_RISE = 10;
const DRAWN_LAST = 20;

const ICONS = {
	dimension: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2a3844"/><path d="M10 44V20M54 44V20" stroke="#9fb0bd" stroke-width="2"/><path d="M10 26h44" stroke="#f4f7fa" stroke-width="3"/><path d="M6 30l8-8M50 30l8-8" stroke="#f4f7fa" stroke-width="3"/><rect x="18" y="33" width="28" height="14" rx="3" fill="#10161c" stroke="#f4f7fa" stroke-width="1.5"/><path d="M23 40h18" stroke="#f4f7fa" stroke-width="2.5"/></svg>',
	height: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2a3844"/><rect x="10" y="28" width="22" height="26" fill="#3b6fc0"/><path d="M10 54h46" stroke="#9fb0bd" stroke-width="2"/><path d="M44 54V16M32 28h16" stroke="#f4f7fa" stroke-width="2.5"/><path d="M40 58l8-8M40 32l8-8" stroke="#f4f7fa" stroke-width="3"/><path d="M44 16l-4 6h8z" fill="#f4f7fa"/></svg>',
	arrow: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2a3844"/><path d="M42 20 14 48" stroke="#ff453a" stroke-width="3.5"/><path d="M10 52l4-14 10 10z" fill="#ff453a"/><rect x="30" y="8" width="28" height="14" rx="3" fill="#10161c" stroke="#ff453a" stroke-width="1.5"/><path d="M35 15h18" stroke="#eef2f5" stroke-width="2.5"/></svg>',
	note: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2a3844"/><rect x="10" y="10" width="44" height="30" rx="4" fill="#3d9bff"/><path d="M27 40l5 8 5-8z" fill="#3d9bff"/><circle cx="32" cy="52" r="3" fill="#eef2f5"/><path d="M17 21h30M17 29h20" stroke="#fff" stroke-width="3"/></svg>',
};
const TEXT_ICON = '<path d="M5 6.5V5h14v1.5"/><path d="M12 5v14"/><path d="M9 19h6"/>';

const X_AXIS = new Vector3( 1, 0, 0 );
const Y_AXIS = new Vector3( 0, 1, 0 );
const _a = new Vector3();
const _b = new Vector3();
const _v = new Vector3();
const _up = new Vector3();
const _quaternion = new Quaternion();
const _parent = new Quaternion();
const _ndc = new Vector2();

// --- the kind ------------------------------------------------------------------------------

const round = ( v, places = 2 ) => Math.round( v * 10 ** places ) / 10 ** places;
const finite = v => typeof v === 'number' && Number.isFinite( v );

// How many points each type has.
export function pointCount( type ) {

	return type === 'note' ? 1 : 2;

}

export function normalizeMarkup( p ) {

	const type = TYPES.includes( p.type ) ? p.type : 'note';
	const count = pointCount( type );
	const points = ( Array.isArray( p.points ) ? p.points : [] )
		.filter( pt => Array.isArray( pt ) && finite( pt[ 0 ] ) && finite( pt[ 1 ] ) )
		.slice( 0, count )
		.map( pt => [ round( pt[ 0 ] ), round( pt[ 1 ] ), round( finite( pt[ 2 ] ) ? pt[ 2 ] : 0 ) ] );
	while ( points.length < count ) points.push( points.length ? [ points[ 0 ][ 0 ] + 5, points[ 0 ][ 1 ], points[ 0 ][ 2 ] ] : [ 0, 0, 0 ] );
	const out = {
		type,
		points,
		colour: COLOURS[ p.colour ] ? p.colour : DEFAULT_COLOUR[ type ],
		text: typeof p.text === 'string' ? p.text.slice( 0, MAX_TEXT ) : '',
	};
	// Only a dimension's mean anything, but every markup has them for the P panel (they're saved
	// only for a dimension: saveMarkup).
	out.offset = type === 'dimension' && finite( p.offset ) ? Math.max( - MAX_OFFSET, Math.min( MAX_OFFSET, round( p.offset ) ) ) : 0;
	out.vertical = type === 'dimension' && p.vertical === true;

	const pin = a => a && typeof a.item === 'string' && a.item && Array.isArray( a.at ) && a.at.length === 3 && a.at.every( finite );
	if ( Array.isArray( p.attach ) && p.attach.some( pin ) ) out.attach = points.map( ( _, i ) => pin( p.attach[ i ] ) ? { item: p.attach[ i ].item, at: p.attach[ i ].at.map( v => round( v, 3 ) ) } : null );
	return out;

}

// The params as saved: an arrow's or a note's without a dimension's offset and height flag.
export function saveMarkup( params ) {

	const out = { ...params };
	if ( out.type !== 'dimension' ) {

		delete out.offset;
		delete out.vertical;

	}

	return out;

}

// What a dimension measures (m): on plan, or the difference in height. Null for the others.
export function measure( params ) {

	if ( params.type !== 'dimension' ) return null;
	const [ a, b ] = params.points;
	return params.vertical ? Math.abs( b[ 2 ] - a[ 2 ] ) : Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] );

}

export function formatLength( metres ) {

	return `${ metres.toFixed( 1 ) } m`;

}

// A markup's name as the editor and the Show panel give it.
export function markupName( params ) {

	if ( params.type === 'dimension' ) return params.vertical ? 'Height' : 'Dimension';
	return params.type === 'arrow' ? 'Arrow' : 'Note';

}

// B squared to A: due east or west of it, or due north or south, whichever it's nearer.
export function squareTo( a, b ) {

	return Math.abs( b.east - a.east ) >= Math.abs( b.north - a.north ) ? { ...b, north: a.north } : { ...b, east: a.east };

}

// How far p is to the left of the line A -> B on plan (negative: to the right).
export function offsetFrom( a, b, p ) {

	const de = b.east - a.east;
	const dn = b.north - a.north;
	const length = Math.hypot( de, dn );
	if ( length < 1e-6 ) return 0;
	return ( ( p.east - a.east ) * - dn + ( p.north - a.north ) * de ) / length;

}

const toLocal = ( p, target = new Vector3() ) => target.set( p[ 0 ], p[ 2 ], - p[ 1 ] );

function buildMarkup( params ) {

	const group = new Group();
	group.name = 'markup';
	const colour = COLOURS[ params.colour ];
	const parts = { picks: [], scaled: [], labels: [], lines: [] };
	group.userData.markup = parts;
	const material = new LineMaterial( { color: colour, linewidth: LINE_WIDTH, transparent: true, depthTest: false, depthWrite: false } );
	const thin = new LineMaterial( { color: colour, linewidth: EXTENSION_WIDTH, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false } );
	const solid = new MeshBasicMaterial( { color: colour, transparent: true, depthTest: false, depthWrite: false } );
	const pickMaterial = new MeshBasicMaterial( { visible: false } );
	const pickBox = new BoxGeometry( 1, 1, 1 );

	const pick = ( data, parent = group ) => {

		const mesh = new Mesh( pickBox, pickMaterial );
		mesh.userData.markupPick = true;
		parent.add( mesh );
		parts.picks.push( { mesh, ...data } );

	};

	const line = ( a, b, lineMaterial = material, pickable = true ) => {

		const geometry = new LineGeometry().setPositions( [ a.x, a.y, a.z, b.x, b.y, b.z ] );
		const object = new Line2( geometry, lineMaterial );
		object.renderOrder = DRAWN_LAST;
		group.add( object );
		parts.lines.push( object );
		if ( pickable ) pick( { type: 'segment', a: a.clone(), b: b.clone() } );

	};

	// A short slash across an end of a dimension line, the same size on screen at any distance.
	const tick = ( at, along, side ) => {

		const holder = new Group();
		holder.position.copy( at );
		const dir = along.clone().add( side ).normalize().multiplyScalar( 0.5 );
		const geometry = new LineGeometry().setPositions( [ - dir.x, - dir.y, - dir.z, dir.x, dir.y, dir.z ] );
		const object = new Line2( geometry, material );
		object.renderOrder = DRAWN_LAST;
		holder.add( object );
		parts.lines.push( object );
		group.add( holder );
		parts.scaled.push( { object: holder, px: TICK_PX } );

	};

	const label = ( at, text, className, align = 'center' ) => {

		parts.labels.push( { at: at.clone(), text, className, align } );
		pick( { type: 'label', index: parts.labels.length - 1 } );

	};

	if ( params.type === 'dimension' ) {

		const [ a, b ] = params.points;
		if ( params.vertical ) {

			const [ low, high ] = a[ 2 ] <= b[ 2 ] ? [ a, b ] : [ b, a ];
			const foot = toLocal( [ high[ 0 ], high[ 1 ], low[ 2 ] ] );
			const top = toLocal( high );
			const bottom = toLocal( low );
			line( foot, top );
			if ( foot.distanceTo( bottom ) > 0.01 ) line( bottom, foot, thin );
			const along = Y_AXIS.clone();
			const side = foot.distanceTo( bottom ) > 0.01 ? bottom.clone().sub( foot ).normalize() : X_AXIS.clone();
			tick( foot, along, side );
			tick( top, along, side );
			label( foot.clone().lerp( top, 0.5 ), formatLength( measure( params ) ), 'dimension height' );

		} else {

			const de = b[ 0 ] - a[ 0 ];
			const dn = b[ 1 ] - a[ 1 ];
			const length = Math.hypot( de, dn ) || 1;
			const left = [ - dn / length, de / length ];
			const off = params.offset;
			const at = p => toLocal( [ p[ 0 ] + left[ 0 ] * off, p[ 1 ] + left[ 1 ] * off, p[ 2 ] ] );
			const a2 = at( a );
			const b2 = at( b );
			line( a2, b2 );
			if ( Math.abs( off ) > 0.01 ) {

				// Extension lines from the points to a little past the dimension line.
				const past = Math.sign( off ) * Math.min( 0.5, Math.abs( off ) * 0.2 );
				const beyond = p => toLocal( [ p[ 0 ] + left[ 0 ] * ( off + past ), p[ 1 ] + left[ 1 ] * ( off + past ), p[ 2 ] ] );
				line( toLocal( a ), beyond( a ), thin, false );
				line( toLocal( b ), beyond( b ), thin, false );

			}

			const along = b2.clone().sub( a2 ).normalize();
			if ( along.lengthSq() === 0 ) along.copy( X_AXIS );
			const side = toLocal( [ left[ 0 ], left[ 1 ], 0 ] );
			tick( a2, along, side );
			tick( b2, along, side );
			label( a2.clone().lerp( b2, 0.5 ), formatLength( measure( params ) ), 'dimension' );

		}

	} else if ( params.type === 'arrow' ) {

		const [ tip, end ] = params.points.map( p => toLocal( p ) );
		line( end, tip );
		const holder = new Group();
		holder.position.copy( tip );
		const dir = tip.clone().sub( end );
		holder.quaternion.setFromUnitVectors( Y_AXIS, dir.lengthSq() > 1e-8 ? dir.normalize() : Y_AXIS );
		// The cone's tip at the holder's origin, its base back along the line.
		const cone = new ConeGeometry( 0.32, 1, 14 );
		cone.translate( 0, - 0.5, 0 );
		const head = new Mesh( cone, solid );
		head.renderOrder = DRAWN_LAST;
		holder.add( head );
		group.add( holder );
		parts.scaled.push( { object: holder, px: HEAD_PX } );
		if ( params.text ) label( end, params.text, 'arrow' );

	} else {

		const spot = toLocal( params.points[ 0 ] );
		const dot = new Mesh( new SphereGeometry( 0.5, 12, 8 ), solid );
		dot.position.copy( spot );
		dot.renderOrder = DRAWN_LAST;
		group.add( dot );
		parts.scaled.push( { object: dot, px: DOT_PX } );
		label( spot, params.text || 'Note', 'note', 'above' );

	}

	return group;

}

// --- setting up ----------------------------------------------------------------------------

export function setUpMarkups( { camera, canvas, models, sidebar, layout, getGround, onUpdate, toast } ) {

	const history = sidebar.history;
	const raycaster = new Raycaster();
	// content (the built group) -> its label elements; entries drawn last frame.
	const drawn = new Map(); // entry -> { content, elements: [ { element, width, height } ] }
	const root = document.createElement( 'div' );
	root.className = 'markup-labels';
	document.getElementById( 'app' ).after( root );

	registerKind( MARKUP, {
		label: 'Markup',
		layer: 'Markups',
		build: buildMarkup,
		normalize: normalizeMarkup,
		save: saveMarkup,
		snap: 'median',
		// Snapped (pasted, or made without heights), its origin goes on the ground just there.
		snapRect: () => ( { width: 0.5, length: 0.5 } ),
		solid: false,
		pasted: params => {

			// Pinned to items where it was copied from, not where it's pasted.
			delete params.attach;
			// Its origin goes on the ground where it's pasted, so its lowest point sits there and the
			// rest keep their heights above it (not below the ground, from a first point up on an item).
			const low = Math.min( ...params.points.map( pt => pt[ 2 ] ) );
			if ( Number.isFinite( low ) && low !== 0 ) params.points = params.points.map( pt => [ pt[ 0 ], pt[ 1 ], round( pt[ 2 ] - low ) ] );
			return params;

		},
		fields: [
			{ key: 'text', label: 'text', type: 'text', when: p => p.type !== 'dimension' },
			{ key: 'colour', label: 'colour', options: COLOUR_NAMES },
			{ key: 'offset', label: 'offset (m)', step: 0.1, min: - MAX_OFFSET, max: MAX_OFFSET, when: p => p.type === 'dimension' && ! p.vertical },
		],
		readouts: [
			{ label: 'measures', get: entry => entry.params.type === 'dimension' ? formatLength( measure( entry.params ) ) : '' },
			{ label: 'pinned to', get: entry => pinnedTo( entry ) },
		],
		resize: {
			shape: 'points',
			fixed: true,
			live: true,
			points: params => params.points.map( ( [ e, n ] ) => [ e, n ] ),
			withPoints: ( params, list, { moved = - 1 } = {} ) => {

				const out = { ...params, points: list.map( ( [ e, n ], i ) => [ e, n, params.points[ i ]?.[ 2 ] ?? 0 ] ) };
				// A point dragged off the item it was pinned to lets go of it.
				if ( params.attach && moved >= 0 ) out.attach = params.attach.map( ( a, i ) => i === moved ? null : a );
				return out;

			},
			heights: entry => entry.params.points.map( p => p[ 2 ] ),
			label: params => params.type === 'dimension' ? formatLength( measure( params ) ) : markupName( params ),
		},
	} );

	const markups = () => models.entries.filter( entry => entry.kind === MARKUP );

	function pinnedTo( entry ) {

		const names = ( entry.params.attach ?? [] ).filter( Boolean ).map( a => byId( a.item )?.state.name ).filter( Boolean );
		return [ ...new Set( names ) ].join( ', ' );

	}

	// --- items by id, for what's pinned ------------------------------------------------------

	let ids = null;
	const byId = id => {

		if ( ! ids ) ids = new Map( models.entries.filter( e => e.id ).map( e => [ e.id, e ] ) );
		return ids.get( id ) ?? null;

	};
	for ( const type of [ 'add', 'remove' ] ) models.addEventListener( type, () => {

		ids = null;

	} );

	// --- drawing: picking points -----------------------------------------------------------

	// What's under the pointer: the ground or a placed item (not a markup), as a point on the site
	// with what it's pinned to, if it's on an item: { east, north, up, attach }.
	function pointAt( x, y ) {

		const rect = canvas.getBoundingClientRect();
		_ndc.set( ( x - rect.left ) / rect.width * 2 - 1, - ( y - rect.top ) / rect.height * 2 + 1 );
		setFromView( raycaster, _ndc, camera );
		const hit = raycaster.intersectObjects( [ ...getGround(), models.group ], true ).find( h => {

			if ( ! h.object.isMesh || ! visible( h.object ) || ! passesHitFilters( h ) ) return false;
			const entry = models.entryFor( h.object );
			return ! entry || ( entry.kind !== MARKUP && ! entry.placing );

		} );
		if ( ! hit ) return null;
		const { east, north, up } = localToEnu( hit.point );
		const entry = models.entryFor( hit.object );
		// Pinned only to what's saved with the layout (not models from config.js).
		const attach = entry && ! entry.inConfig && ! entry.driving ? { entry, at: entry.pivot.worldToLocal( hit.point.clone() ).toArray().map( v => round( v, 3 ) ) } : null;
		return { east: round( east ), north: round( north ), up: round( up ), attach };

	}

	// Where markup points are on the site: [ { east, north, up } ].
	function sitePoints( entry ) {

		const { east, north, up, heading } = entry.state;
		const rad = heading * Math.PI / 180;
		const cos = Math.cos( rad );
		const sin = Math.sin( rad );
		return entry.params.points.map( ( [ e, n, u ] ) => ( { east: east + e * cos + n * sin, north: north - e * sin + n * cos, up: up + u } ) );

	}

	// Put a markup's points at these places on the site (and anything else in `params`): its
	// origin goes to their middle on plan, at the first one's height, facing north.
	function placeAt( entry, points, params = {} ) {

		const east = round( ( Math.min( ...points.map( p => p.east ) ) + Math.max( ...points.map( p => p.east ) ) ) / 2 );
		const north = round( ( Math.min( ...points.map( p => p.north ) ) + Math.max( ...points.map( p => p.north ) ) ) / 2 );
		const up = round( points[ 0 ].up );
		Object.assign( entry.state, { east, north, up, heading: 0, snap: false } );
		models.setParams( entry, { ...params, points: points.map( p => [ round( p.east - east ), round( p.north - north ), round( p.up - up ) ] ) } );

	}

	// The markup being drawn: { type, vertical, points: [ site points ], entry, pending, cursor }.
	let draft = null;
	// Set while a finished markup ends the tool (sidebar.cancelDrawing calls onCancel).
	let finishing = false;

	const tools = {};
	for ( const [ key, name, hint, title ] of [
		[ 'dimension', 'Dimension', 'Measure between two points', 'Click a point, then another, then where the dimension line goes: it shows the distance on plan. Shift squares it to north or east; Alt on the second click measures height instead. Points snap to the ground or an item, and follow the item if it moves. Esc cancels' ],
		[ 'height', 'Height', 'Measure how much higher', 'Click a low point and a high one (on an item, the ground, a pile): it shows the difference in height. Esc cancels' ],
		[ 'arrow', 'Arrow', 'Point something out', 'Click what to point at (the arrowhead goes there), then where the words go, and type them. Esc cancels' ],
		[ 'note', 'Note', 'Pin a note to a spot', 'Click a spot and type the note; pick red for a hazard, amber for caution or blue for information. Double-click a note (or Text on its toolbar) to change it' ],
	] ) {

		tools[ key ] = sidebar.addTool( {
			name,
			hint,
			title,
			icon: ICONS[ key ],
			mode: 'custom',
			markup: key,
			onStart: () => start( key ),
			onPress: e => press( e ),
			onMove: e => move( e ),
			onCancel: () => cancel(),
			legend: ( { click, mouse } ) => legend( key, click, mouse ),
		} );

	}

	// What the Controls panel (legend.js) says while a markup is drawn, step by step.
	function legend( key, click, mouse ) {

		const step = draft?.points.length ?? 0;
		const tap = [ `~${ click }` ];
		const rows = key === 'note' ? [ [ tap, 'A spot: pin the note there, then type it' ] ]
			: key === 'arrow' ? [ [ tap, step ? 'Where the words go, then type them' : 'What to point at: the arrowhead goes there' ] ]
				: key === 'height' ? [ [ tap, step ? 'The second point, higher or lower' : 'The first point (on the ground or an item)' ] ]
					: step === 0 ? [ [ tap, 'The first point (on the ground or an item)' ] ]
						: step === 1 ? [ [ tap, 'The second point' ], [ [ 'Shift' ], 'Square it to north or east' ], [ [ 'Alt', '+', `~${ click }` ], 'Measure the height instead' ] ]
							: [ [ tap, 'Where the dimension line goes' ] ];
		return { title: `New ${ key === 'height' ? 'height dimension' : key }`, rows: [
			...rows,
			[ [ 'Esc' ], 'Cancel' ],
			...mouse ? [ [ [ '~Right-drag' ], 'Look around' ] ] : [],
			[ [ 'W', 'A', 'S', 'D' ], 'Move' ],
		], note: 'Points snap to the ground or an item, and follow the item when it moves.' };

	}

	function start( key ) {

		draft = { type: key === 'height' ? 'dimension' : key, vertical: key === 'height', points: [], entry: null, pending: null };
		document.body.classList.add( 'markup-drawing' );

	}

	function cancel() {

		document.body.classList.remove( 'markup-drawing' );
		const was = draft;
		draft = null;
		if ( finishing || ! was ) return;
		was.cancelled = true;
		if ( was.entry ) models.remove( was.entry );

	}

	// The first click makes the markup (following the pointer until it's finished), so it's drawn
	// with its label while the rest are picked.
	async function begin( d, point ) {

		d.points.push( point );
		const name = markupName( { type: d.type, vertical: d.vertical } );
		const count = pointCount( d.type );
		const params = { type: d.type, vertical: d.vertical, colour: DEFAULT_COLOUR[ d.type ], text: '', points: Array( count ).fill( [ 0, 0, 0 ] ) };
		d.pending = models.load( { kind: MARKUP, name, params, east: point.east, north: point.north, up: point.up, heading: 0, placing: true } );
		const entry = await d.pending;
		if ( d.cancelled ) {

			models.remove( entry );
			return null;

		}

		d.entry = entry;
		follow( d );
		return entry;

	}

	// Draw the draft as far as it's picked, the next point at the pointer.
	function follow( d, e = null ) {

		if ( ! d.entry ) return;
		const count = pointCount( d.type );
		const cursor = d.cursor ?? d.points[ d.points.length - 1 ];
		const points = [ ...d.points ];
		let offset = 0;
		if ( d.type === 'dimension' && points.length === 2 ) offset = round( offsetFrom( points[ 0 ], points[ 1 ], cursor ) );
		else while ( points.length < count ) points.push( nextPoint( d, cursor, e?.shiftKey ) );
		// Alt on the second point makes it a height dimension.
		const vertical = d.points.length === 1 ? d.vertical || !! e?.altKey : d.vertical;
		placeAt( d.entry, points, d.type === 'dimension' ? { offset, vertical } : {} );

	}

	// The second point of a dimension at the pointer: squared to the first with Shift.
	function nextPoint( d, cursor, shift ) {

		return d.type === 'dimension' && shift && d.points.length === 1 ? squareTo( d.points[ 0 ], cursor ) : cursor;

	}

	function move( e ) {

		const d = draft;
		if ( ! d || ! d.entry ) return;
		const point = pointAt( e.clientX, e.clientY );
		if ( ! point ) return;
		d.cursor = point;
		follow( d, e );

	}

	async function press( e ) {

		// Not a press the page acts on (focus moving off the note being typed, say).
		e.preventDefault();
		const d = draft;
		if ( ! d || d.pending && ! d.entry ) return;
		const point = pointAt( e.clientX, e.clientY );
		if ( ! point ) return;
		if ( d.points.length === 0 ) {

			if ( ! await begin( d, point ) ) return;
			if ( d.type === 'note' ) typeWords( d );

			return;

		}

		if ( d.type === 'dimension' && d.points.length === 1 ) {

			const b = nextPoint( d, point, e.shiftKey );
			// Squared, the point isn't on what was under the pointer any more.
			if ( b !== point ) b.attach = null;
			const vertical = d.vertical || e.altKey;
			const a = d.points[ 0 ];
			if ( vertical ? Math.abs( b.up - a.up ) < 0.01 : Math.hypot( b.east - a.east, b.north - a.north ) < MIN_LENGTH ) {

				toast( vertical ? 'Click a point higher or lower than the first' : 'Click a second point away from the first' );
				return;

			}

			d.vertical = vertical;
			d.points.push( b );
			d.cursor = b;
			follow( d, e );
			// A height dimension is done; a dimension's line goes where the next click is.
			if ( vertical ) done( d );
			return;

		}

		if ( d.type === 'dimension' ) {

			d.cursor = point;
			follow( d, e );
			done( d );
			return;

		}

		// An arrow: where the words go, away from its tip.
		const tip = d.points[ 0 ];
		if ( Math.hypot( point.east - tip.east, point.north - tip.north, ( point.up ?? 0 ) - ( tip.up ?? 0 ) ) < MIN_LENGTH ) {

			toast( 'Click where the words go, away from the tip' );
			return;

		}

		d.points.push( point );
		d.cursor = point;
		follow( d, e );
		typeWords( d );

	}

	// An arrow or a note drawn: the tool ends, and its words are typed. It's put down when they are,
	// pinned to what its points were picked on.
	function typeWords( d ) {

		picks.set( d.entry, d.points.map( p => p.attach ) );
		finishTool();
		editText( d.entry, { creating: true } );

	}

	// End the tool, keeping the markup.
	function finishTool() {

		finishing = true;
		sidebar.cancelDrawing();
		finishing = false;

	}

	// Put down the markup as drawn: pinned to what its points were picked on, saved, an undo step,
	// and selected.
	function done( d, { select = true } = {} ) {

		if ( draft === d ) finishTool();
		const entry = d.entry;
		if ( ! entry || ! models.entries.includes( entry ) ) return null;
		const attach = d.points.map( p => p.attach ? { item: idOf( p.attach.entry ), at: p.attach.at } : null );
		const params = { ...entry.params, attach: attach.some( Boolean ) ? attach : undefined };
		if ( d.type === 'dimension' && ! d.vertical && d.points.length === 2 ) params.offset = round( offsetFrom( d.points[ 0 ], d.points[ 1 ], d.cursor ?? d.points[ 1 ] ) );
		entry.placing = false;
		entry.state.name = entry.pivot.name = markupName( params );
		placeAt( entry, d.points.slice( 0, pointCount( d.type ) ), params );
		recordAdded( entry );
		if ( select ) sidebar.select( entry );
		return entry;

	}

	// An item's id, given it one if it has none yet (saved with it from now on).
	function idOf( entry ) {

		if ( ! entry.id ) {

			entry.id = `i${ Math.random().toString( 36 ).slice( 2, 10 ) }`;
			ids = null;
			layout.changed();

		}

		return entry.id;

	}

	// --- undo steps ----------------------------------------------------------------------------

	// Adding a markup: undone, it's taken away; redone, it's loaded again as it was.
	function recordAdded( entry ) {

		let current = entry;
		let config = null;
		history.push( {
			label: `add ${ entry.state.name.toLowerCase() }`,
			undo() {

				const e = history.resolve( current );
				if ( ! e ) return;
				config = models.toConfig( e );
				current = e;
				if ( sidebar.getSelection().includes( e ) ) sidebar.deselect();
				models.remove( e );

			},
			async redo() {

				if ( ! config ) return;
				const epoch = history.epoch;
				const e = await models.load( config );
				if ( history.epoch !== epoch ) {

					models.remove( e );
					return;

				}

				history.replace( current, e );
				current = e;
				sidebar.select( e );

			},
		} );

	}

	function recordEdit( entry, before, after ) {

		const ref = entry;
		const put = params => {

			const e = history.resolve( ref );
			if ( e ) models.setParams( e, params );

		};
		history.push( { label: `edit ${ entry.state.name.toLowerCase() }`, undo: () => put( before ), redo: () => put( after ) } );

	}

	// --- typing an arrow's or a note's words ------------------------------------------------

	const editor = createEditor();
	let editing = null; // { entry, before, creating }

	// Open the editor on a markup's words (and colour). Creating: Esc takes the new markup away;
	// otherwise it puts the words back. Enter (or clicking away) keeps them, as an undo step.
	function editText( entry, { creating = false } = {} ) {

		if ( ! entry || entry.params.type === 'dimension' ) return;
		closeEditor( true );
		const before = { text: entry.params.text, colour: entry.params.colour };
		editing = { entry, before, creating };
		editor.open( {
			text: entry.params.text,
			colour: entry.params.colour,
			placeholder: entry.params.type === 'note' ? 'Note' : 'Label (optional)',
			onInput: ( text, colour ) => {

				if ( models.entries.includes( entry ) ) models.setParams( entry, { text, colour } );

			},
		} );

	}

	function closeEditor( keep ) {

		if ( ! editing ) return;
		const { entry, before, creating } = editing;
		editing = null;
		const value = editor.close();
		if ( ! models.entries.includes( entry ) ) return;
		if ( ! keep ) {

			if ( creating ) models.remove( entry );
			else models.setParams( entry, before );
			return;

		}

		const after = { text: value.text.trim().slice( 0, MAX_TEXT ), colour: value.colour };
		if ( creating ) {

			models.setParams( entry, after );
			done( { type: entry.params.type, entry, points: sitePoints( entry ).map( ( p, i ) => ( { ...p, attach: pinnedPick( entry, i ) } ) ) } );
			return;

		}

		models.setParams( entry, after );
		if ( after.text !== before.text || after.colour !== before.colour ) recordEdit( entry, before, after );

	}

	// While a markup is drawn, its points' pins are kept with the draft; for an arrow or a note, typed
	// after the tool ended, they're kept here.
	const picks = new WeakMap(); // entry -> [ { entry, at } or null ]
	function pinnedPick( entry, i ) {

		return picks.get( entry )?.[ i ] ?? null;

	}

	editor.onDone = keep => closeEditor( keep );

	// --- keeping up: pins, labels and click targets -----------------------------------------

	// Item -> where it was last frame, to tell an item moved from a markup moved off it.
	const seen = new WeakMap();
	const itemKey = item => {

		const { east, north, up, heading, scale } = item.state;
		return `${ east },${ north },${ up },${ heading },${ scale },${ item.parked?.pitch ?? 0 },${ item.parked?.roll ?? 0 }`;

	};

	// A pinned point follows its item when the item moves; a point (or the markup) moved off its item
	// lets go of it. Items that haven't loaded yet (or are deleted) leave their points where they are.
	function followPins( list ) {

		const moved = new Map();
		const movedItem = item => {

			if ( ! moved.has( item ) ) moved.set( item, seen.get( item ) !== itemKey( item ) );
			return moved.get( item );

		};
		for ( const entry of list ) {

			const attach = entry.params.attach;
			if ( ! attach || entry.placing ) continue;
			const points = sitePoints( entry );
			let changed = false;
			const next = attach.map( ( a, i ) => {

				if ( ! a ) return null;
				const item = byId( a.item );
				if ( ! item ) return a;
				item.pivot.updateWorldMatrix( true, false );
				const want = localToEnu( item.pivot.localToWorld( _v.fromArray( a.at ) ) );
				const p = points[ i ];
				if ( Math.hypot( want.east - p.east, want.north - p.north, want.up - p.up ) < 0.02 ) return a;
				changed = true;
				if ( ! movedItem( item ) ) return null;
				points[ i ] = want;
				return a;

			} );
			if ( ! changed ) continue;
			// The markup stays where it is; only its points move.
			models.setParams( entry, { attach: next.some( Boolean ) ? next : undefined, points: points.map( p => framePoint( entry, p ) ) } );

		}

		for ( const entry of models.entries ) if ( entry.id ) seen.set( entry, itemKey( entry ) );

	}

	// A point on the site in a markup's own frame.
	function framePoint( entry, p ) {

		const { east, north, up, heading } = entry.state;
		const rad = heading * Math.PI / 180;
		const de = p.east - east;
		const dn = p.north - north;
		return [ round( de * Math.cos( rad ) - dn * Math.sin( rad ) ), round( de * Math.sin( rad ) + dn * Math.cos( rad ) ), round( p.up - up ) ];

	}

	// A new or rebuilt markup: its labels made afresh, and only its click targets clickable, in
	// build mode (so walking doesn't bump into them).
	function track( entry ) {

		const content = entry.pivot.children[ 0 ];
		const parts = content?.userData.markup;
		if ( ! parts ) return;
		const old = drawn.get( entry );
		if ( old?.content === content ) return;
		for ( const { element } of old?.elements ?? [] ) element.remove();
		for ( const object of parts.lines ) object.raycast = () => {};
		content.traverse( o => {

			if ( o.isMesh && ! o.userData.markupPick ) o.raycast = () => {};

		} );
		for ( const { mesh } of parts.picks ) {

			const raycast = mesh.raycast;
			mesh.raycast = function ( ray, intersects ) {

				if ( models.buildMode ) raycast.call( this, ray, intersects );

			};

		}

		const colour = COLOURS[ entry.params.colour ];
		const elements = parts.labels.map( ( { text, className } ) => {

			const element = document.createElement( 'div' );
			element.className = `markup-label ${ className }`;
			element.style.setProperty( '--colour', colour );
			element.textContent = text;
			element.dataset.type = entry.params.type;
			element.dataset.colour = entry.params.colour;
			root.append( element );
			return { element, width: 0, height: 0 };

		} );
		drawn.set( entry, { content, elements } );

	}

	models.addEventListener( 'add', ( { entry } ) => {

		if ( entry.kind === MARKUP ) track( entry );

	} );
	models.addEventListener( 'change', ( { entry } ) => {

		if ( entry.kind === MARKUP ) track( entry );

	} );
	models.addEventListener( 'remove', ( { entry } ) => {

		const old = drawn.get( entry );
		if ( ! old ) return;
		for ( const { element } of old.elements ) element.remove();
		drawn.delete( entry );
		if ( editing?.entry === entry ) {

			editing = null;
			editor.close();

		}

	} );

	// Metres a pixel covers at a point in the scene.
	function worldPerPixel( point ) {

		const distance = camera.position.distanceTo( point );
		return 2 * distance * Math.tan( camera.fov * Math.PI / 360 ) / camera.zoom / ( canvas.clientHeight || 1 );

	}

	function place() {

		const rect = canvas.getBoundingClientRect();
		_up.set( 0, 1, 0 ).applyQuaternion( camera.quaternion );
		for ( const [ entry, { content, elements } ] of drawn ) {

			const parts = content.userData.markup;
			const shown = visible( entry.pivot ) && ! entry.pivot.userData.hidden;
			content.updateWorldMatrix( true, false );
			content.getWorldQuaternion( _parent ).invert();

			for ( const { object, px } of parts.scaled ) {

				object.getWorldPosition( _v );
				object.scale.setScalar( px * worldPerPixel( _v ) );

			}

			parts.labels.forEach( ( label, i ) => {

				const item = elements[ i ];
				content.localToWorld( _a.copy( label.at ) );
				_v.copy( _a ).project( camera );
				const inView = shown && _v.z < 1 && Math.abs( _v.x ) < 1.2 && Math.abs( _v.y ) < 1.2 && camera.position.distanceTo( _a ) < LABEL_RANGE;
				if ( item.element.hidden !== ! inView ) item.element.hidden = ! inView;
				if ( ! inView ) return;
				if ( item.width === 0 ) {

					item.width = item.element.offsetWidth;
					item.height = item.element.offsetHeight;

				}

				const x = rect.left + ( _v.x + 1 ) / 2 * rect.width;
				const y = rect.top + ( 1 - _v.y ) / 2 * rect.height;
				const above = label.align === 'above';
				item.element.style.transform = `translate( ${ x.toFixed( 1 ) }px, ${ ( above ? y - NOTE_RISE : y ).toFixed( 1 ) }px ) translate( -50%, ${ above ? '-100%' : '-50%' } )`;

			} );

			for ( const pick of parts.picks ) {

				const { mesh } = pick;
				if ( pick.type === 'segment' ) {

					content.localToWorld( _a.copy( pick.a ) );
					content.localToWorld( _b.copy( pick.b ) );
					const length = _a.distanceTo( _b );
					_v.addVectors( _a, _b ).multiplyScalar( 0.5 );
					const across = PICK_PX * worldPerPixel( _v );
					mesh.position.copy( pick.a ).add( pick.b ).multiplyScalar( 0.5 );
					_b.copy( pick.b ).sub( pick.a );
					if ( _b.lengthSq() > 1e-10 ) mesh.quaternion.setFromUnitVectors( X_AXIS, _b.normalize() );
					mesh.scale.set( Math.max( length, across ), across, across );

				} else {

					const item = elements[ pick.index ];
					const label = parts.labels[ pick.index ];
					content.localToWorld( _a.copy( label.at ) );
					const wpp = worldPerPixel( _a );
					const rise = label.align === 'above' ? ( NOTE_RISE + item.height / 2 ) * wpp : 0;
					_a.addScaledVector( _up, rise );
					mesh.position.copy( content.worldToLocal( _a ) );
					mesh.quaternion.copy( _parent ).multiply( camera.quaternion );
					mesh.scale.set( Math.max( 1, item.width ) * wpp, Math.max( 1, item.height ) * wpp, Math.max( 1, item.height ) * wpp );

				}

			}

		}

		editor.place();

	}

	onUpdate( () => {

		const list = markups();
		if ( list.some( e => e.params.attach ) ) followPins( list );
		place();

	} );

	// --- changing the words afterwards -----------------------------------------------------

	sidebar.toolbar.addButton( {
		name: 'markup-text',
		text: 'Text',
		title: 'Change the words (or double-click them)',
		icon: TEXT_ICON,
		shown: entry => entry.kind === MARKUP && entry.params.type !== 'dimension',
		run: entry => editText( entry ),
	} );

	canvas.addEventListener( 'dblclick', e => {

		if ( ! models.buildMode || sidebar.getTool() ) return;
		const rect = canvas.getBoundingClientRect();
		_ndc.set( ( e.clientX - rect.left ) / rect.width * 2 - 1, - ( e.clientY - rect.top ) / rect.height * 2 + 1 );
		setFromView( raycaster, _ndc, camera );
		const hit = raycaster.intersectObjects( [ ...getGround(), models.group ], true ).find( h => h.object.isMesh && visible( h.object ) && passesHitFilters( h ) );
		const entry = hit && models.entryFor( hit.object );
		if ( entry?.kind === MARKUP && entry.params.type !== 'dimension' ) editText( entry );

	} );

	// --- the editor ------------------------------------------------------------------------

	function createEditor() {

		const element = document.createElement( 'div' );
		element.className = 'markup-editor';
		element.hidden = true;
		const area = document.createElement( 'textarea' );
		area.rows = 2;
		area.maxLength = MAX_TEXT;
		area.setAttribute( 'aria-label', 'Markup text' );
		const swatches = document.createElement( 'div' );
		swatches.className = 'swatches';
		const buttons = Object.entries( COLOUR_NAMES ).map( ( [ title, key ] ) => {

			const button = document.createElement( 'button' );
			button.type = 'button';
			button.title = title;
			button.dataset.colour = key;
			button.style.setProperty( '--colour', COLOURS[ key ] );
			// Keeps the focus in the text.
			button.addEventListener( 'pointerdown', e => e.preventDefault() );
			button.addEventListener( 'click', () => {

				colour = key;
				mark();
				options?.onInput( area.value, colour );
				area.focus();

			} );
			swatches.append( button );
			return button;

		} );
		const hint = document.createElement( 'div' );
		hint.className = 'hint';
		hint.textContent = 'Enter to finish · Shift+Enter new line · Esc to cancel';
		element.append( area, swatches, hint );
		document.body.append( element );

		let options = null;
		let colour = 'blue';
		const mark = () => buttons.forEach( b => b.setAttribute( 'aria-pressed', String( b.dataset.colour === colour ) ) );

		area.addEventListener( 'input', () => options?.onInput( area.value, colour ) );
		area.addEventListener( 'keydown', e => {

			// Nothing else acts on keys typed here (walk.js isTyping keeps the camera still too).
			e.stopPropagation();
			if ( e.key === 'Enter' && ! e.shiftKey && ! e.isComposing ) {

				e.preventDefault();
				api.onDone?.( true );

			} else if ( e.key === 'Escape' ) {

				e.preventDefault();
				api.onDone?.( false );

			}

		} );
		// Pressing anywhere else keeps what's typed.
		document.addEventListener( 'pointerdown', e => {

			if ( options && ! element.contains( e.target ) ) api.onDone?.( true );

		}, true );

		const api = {
			onDone: null,
			element,
			open( opts ) {

				options = opts;
				colour = opts.colour;
				area.value = opts.text;
				area.placeholder = opts.placeholder;
				mark();
				element.hidden = false;
				api.place();
				// Again once the press that opened it is over: its mousedown moves the focus.
				const focus = () => {

					if ( options !== opts || document.activeElement === area ) return;
					area.focus();
					area.select();

				};
				focus();
				requestAnimationFrame( focus );
				setTimeout( focus, 100 );

			},
			close() {

				const value = { text: area.value, colour };
				options = null;
				element.hidden = true;
				if ( document.activeElement === area ) area.blur();
				return value;

			},
			// Under the markup's label.
			place() {

				if ( ! options || ! editing ) return;
				const label = drawn.get( editing.entry )?.elements[ 0 ]?.element;
				const r = label && ! label.hidden ? label.getBoundingClientRect() : null;
				const x = r ? r.left + r.width / 2 : window.innerWidth / 2;
				const y = r ? r.bottom + 8 : window.innerHeight / 2;
				const width = element.offsetWidth;
				const left = Math.max( 8, Math.min( window.innerWidth - width - 8, x - width / 2 ) );
				const top = Math.max( 8, Math.min( window.innerHeight - element.offsetHeight - 8, y ) );
				element.style.transform = `translate( ${ left.toFixed( 0 ) }px, ${ top.toFixed( 0 ) }px )`;

			},
		};
		return api;

	}

	const api = {
		tools,
		editText,
		// What's being typed, if anything (for tests).
		get editing() {

			return editing?.entry ?? null;

		},
		get drawing() {

			return draft;

		},
	};
	// For tests and the browser console.
	if ( window.twin ) window.twin.markups = api;
	return api;

}

function visible( object ) {

	for ( let o = object; o; o = o.parent ) if ( ! o.visible ) return false;
	return true;

}
