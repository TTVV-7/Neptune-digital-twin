import './rows.css';
import { Box3, BufferAttribute, Euler, Group, InstancedMesh, MathUtils, Matrix4, Quaternion, Raycaster, Vector3 } from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { registerKind } from './kinds.js';
import { frontToYaw, itemConfig } from './library.js';
import { buildProcedural } from './procedural.js';
import { headingToYaw, localToEnu, yawToHeading } from './geo.js';
import { passesHitFilters } from './walk.js';
import { toScreen } from './handles.js';
import { groundUnder } from './laydown.js';

// Rows: many of one library item along a line drawn on the ground, such as a run of jersey
// barriers end to end, cones every 3 m, light towers every 30 m or trucks parked side by side. The
// Row button on a library card, or Row on a placed item's toolbar, starts one: click points on the
// ground (corners allowed) while a panel at the top sets the spacing, and the copies show along
// the line as it's drawn. The row is one placed thing, a kind (kinds.js) holding the item, the
// line's points, the spacing and how high each copy sits: moved, turned, hidden, saved and deleted
// like any item, its points moved with handles (handles.js), and broken apart into single items
// when wanted. Its copies are drawn as instances, a draw call for each part of the item however
// many copies there are. Each sits on the ground under it, tilted along the line on a slope if
// it's long and low (a barrier, not a cone), and is solid to walk and drive into.

export const ROW = 'row';

// No row has more copies than this.
const MAX_COPIES = 1000;
const MAX_POINTS = 200;
// Long, low copies tilt along the line with the ground, up to this many degrees.
const MAX_TILT = 12;
// Draping again: a moved row at most this often; the others check this often (seconds) whether
// the ground under them changed (sharper tiles, flattening, digging), as laydown areas do.
const MOVE_INTERVAL = 0.1;
const CHECK_INTERVAL = 0.5;
// The last spacing used for each item, remembered in this browser.
const STORAGE_KEY = 'neptune-twin.rows';
// A weight in an item's name, like "~2.9 t" or "~40 kg". Only those marked "~" are what the item
// weighs: "(20 t)" on a crane or a haul truck is what it lifts or carries.
const WEIGHT = /~\s*([\d.,]+)\s*(t|kg)\b/i;
const DEG = MathUtils.DEG2RAD;

const SPACINGS = { 'End to end': 'end', 'Every … m': 'every' };
const ALIGNS = { 'Along the line': 'along', 'Across the line': 'across' };
const FITS = { 'From the ends': 'ends', 'Centred': 'centred' };

const ROW_ICON = '<rect x="2" y="8.5" width="5" height="6" rx="1"/><rect x="9.5" y="8.5" width="5" height="6" rx="1"/><rect x="17" y="8.5" width="5" height="6" rx="1"/><path d="M2 18.5h20" stroke-dasharray="2 2.5"/>';
const SPLIT_ICON = '<rect x="2.5" y="9" width="5" height="6" rx="1"/><rect x="16.5" y="9" width="5" height="6" rx="1"/><path d="M10 12h4"/><path d="M12 4v3M12 17v3"/>';

const DOWN = new Vector3( 0, - 1, 0 );
const UP = new Vector3( 0, 1, 0 );
const ONE = new Vector3( 1, 1, 1 );
const _point = new Vector3();
const _position = new Vector3();
const _quaternion = new Quaternion();
const _turn = new Quaternion();
const _pivotTurn = new Quaternion();
const _euler = new Euler();
const _matrix = new Matrix4();
const _part = new Matrix4();
const _bounds = new Box3();

export function setUpRows( { scene, camera, canvas, models, sidebar, panel, layout, library, getGround, onUpdate, toast } ) {

	const items = new Map( library.filter( item => ! item.kind ).map( item => [ item.id, item ] ) );
	// item id -> { promise, ready }: what its rows are drawn from, once loaded.
	const templates = new Map();
	// entry -> { content, item, pointHeights, dirty, checkedAt, ground }: what it was last built and
	// draped as, and when
	const rows = new Map();
	const raycaster = new Raycaster();
	raycaster.firstHitOnly = true;
	let clock = 0;

	registerKind( ROW, {
		label: 'Row',
		snap: 'median',
		prepare: params => template( params.item ),
		build: buildRow,
		normalize: normalizeRow,
		item: params => params.item,
		count: entry => layoutOf( entry )?.copies.length ?? 0,
		contains: insideCopy,
		fields: [
			{ key: 'spacing', label: 'spacing', options: SPACINGS, size: true },
			{ key: 'gap', label: 'gap (m)', min: 0, max: 100, step: 0.05, size: true, when: p => p.spacing === 'end' },
			{ key: 'every', label: 'every (m)', min: 0.1, max: 1000, step: 0.1, size: true, when: p => p.spacing === 'every' },
			{ key: 'align', label: 'line up', options: ALIGNS, size: true },
			{ key: 'fit', label: 'ends', options: FITS },
			{ key: 'flip', label: 'turn round' },
			{ key: 'item', label: 'item', options: Object.fromEntries( [ ...items.values() ].map( item => [ item.name, item.id ] ) ) },
		],
		readouts: [
			{ label: 'copies', get: entry => String( layoutOf( entry )?.copies.length ?? 0 ) },
			{ label: 'line length', get: entry => `${ format( layoutOf( entry )?.length ?? 0 ) } m` },
			{ label: 'spacing', get: entry => spacingText( entry.params, layoutOf( entry ) ) },
			{ label: 'weight', get: entry => weightText( items.get( entry.params.item ), layoutOf( entry )?.copies.length ?? 0 ) },
		],
		actions: [ { label: 'Break apart', run: entry => breakApart( entry ) } ],
		resize: {
			shape: 'points',
			points: params => params.points,
			withPoints: ( params, points ) => ( { ...params, points } ),
			heights: entry => rows.get( entry )?.pointHeights ?? null,
			// Rebuilding only sets the copies' matrices; the ground under them is looked at after.
			live: true,
			label: params => {

				const t = templates.get( params.item )?.ready;
				return t ? summary( items.get( params.item ), layOut( params, t ) ) : '';

			},
		},
	} );

	// Library cards' Row buttons, and Row and Break apart on the selection toolbar.
	sidebar.setRowMaker( item => startRow( item ) );
	sidebar.toolbar.addButton( {
		name: 'make-row',
		text: 'Row',
		title: 'Make a row from this: draw a line on the ground from here, and more of them are placed along it',
		icon: ROW_ICON,
		shown: entry => ! entry.kind && ! entry.inConfig && items.has( entry.library ),
		run: entry => startRow( items.get( entry.library ), entry ),
	} );
	sidebar.toolbar.addButton( {
		name: 'split',
		text: 'Break apart',
		title: 'Break the row into single items, each where its copy is (you can undo it for a few seconds)',
		icon: SPLIT_ICON,
		shown: entry => entry.kind === ROW,
		run: entry => breakApart( entry ),
	} );

	// --- what a row is drawn from --------------------------------------------------------

	// The item's model, made once: each of its meshes as geometry, material and where it sits in the
	// item, which faces -Z with the middle of its footprint at the origin and its base at y = 0, as a
	// placed item does (models.js); and the size of its box. A failed load is tried again next time.
	function template( id ) {

		let t = templates.get( id );
		if ( t ) return t.promise;
		const item = items.get( id );
		t = { ready: null, promise: item ? makeTemplate( item ) : Promise.reject( new Error( `there is no library item "${ id }"` ) ) };
		t.promise.then( ready => t.ready = ready, () => templates.delete( id ) );
		templates.set( id, t );
		return t.promise;

	}

	async function makeTemplate( item ) {

		const content = item.procedural ? buildProcedural( item.id ) : ( await models.loader.loadAsync( new URL( `library/${ item.file }`, document.baseURI ).href ) ).scene;
		content.rotation.y = frontToYaw( item.front );
		const root = new Group();
		root.add( content );
		root.scale.setScalar( item.procedural ? 1 : item.scale ?? 1 );
		root.updateMatrixWorld( true );
		const box = new Box3().setFromObject( root );
		const centre = box.getCenter( new Vector3() );
		const shift = new Matrix4().makeTranslation( - centre.x, - box.min.y, - centre.z );
		const parts = [];
		root.traverse( object => {

			if ( ! object.isMesh ) return;
			const geometry = object.isSkinnedMesh ? posed( object ) : object.geometry;
			// Every row of the item draws these; removing one leaves them be (models.js).
			geometry.userData.shared = true;
			for ( const material of [ object.material ].flat() ) material.userData.shared = true;
			parts.push( {
				geometry,
				material: object.material,
				matrix: new Matrix4().multiplyMatrices( shift, object.matrixWorld ),
				noCollide: !! object.userData.noCollide,
				renderOrder: object.renderOrder,
			} );

		} );
		const size = box.getSize( new Vector3() );
		return { item, parts, size, ghost: null };

	}

	// --- the kind ------------------------------------------------------------------------

	// Copies of the item along the line, a mesh of instances for each of its parts. They stand at
	// the heights last found for them until the ground is looked at again (drape()).
	function buildRow( params ) {

		const group = new Group();
		group.name = 'Row';
		const t = templates.get( params.item )?.ready;
		// Not loaded (prepare() makes sure it is when a row is placed or opened, and track() before a
		// new item is used): an empty row, drawn once it is.
		if ( ! t ) {

			group.userData.row = { t: null, layout: { copies: [], length: 0, step: 0 } };
			template( params.item ).then( () => rebuildWaiting( params.item ), () => {} );
			return group;

		}

		const plan = layOut( params, t );
		for ( const part of t.parts ) group.add( instances( part, part.material, plan.copies.length ) );
		const heights = params.heights.length === plan.copies.length ? params.heights : null;
		const tilts = params.tilts.length === plan.copies.length ? params.tilts : null;
		placeCopies( group, t, plan.copies, heights, tilts );
		group.userData.row = { t, layout: plan };
		return group;

	}

	function instances( part, material, count ) {

		const mesh = new InstancedMesh( part.geometry, material, Math.max( 1, count ) );
		mesh.count = count;
		mesh.renderOrder = part.renderOrder;
		mesh.userData.noCollide = part.noCollide;
		return mesh;

	}

	// Rows whose item has only just loaded.
	function rebuildWaiting( id ) {

		for ( const entry of models.entries ) {

			if ( entry.kind === ROW && entry.params.item === id && ! entry.pivot.children[ 0 ]?.userData.row?.t ) models.setParams( entry, {} );

		}

	}

	function layoutOf( entry ) {

		return entry.pivot.children[ 0 ]?.userData.row?.layout ?? null;

	}

	function normalizeRow( p ) {

		const points = ( Array.isArray( p.points ) ? p.points : [] )
			.filter( q => Array.isArray( q ) && Number.isFinite( q[ 0 ] ) && Number.isFinite( q[ 1 ] ) )
			.map( ( [ e, n ] ) => [ round( e ), round( n ) ] )
			// Two points in the same place make a stretch of no length and no direction.
			.filter( ( q, i, all ) => i === 0 || Math.hypot( q[ 0 ] - all[ i - 1 ][ 0 ], q[ 1 ] - all[ i - 1 ][ 1 ] ) >= 0.01 )
			.slice( 0, MAX_POINTS );
		const numbers = list => Array.isArray( list ) ? list.map( v => Number.isFinite( v ) ? v : 0 ) : [];
		return {
			item: String( p.item ?? '' ),
			points: points.length >= 2 ? points : [ [ 0, - 5 ], [ 0, 5 ] ],
			spacing: Object.values( SPACINGS ).includes( p.spacing ) ? p.spacing : 'end',
			gap: clamp( p.gap, 0, 100, 0 ),
			every: clamp( p.every, 0.1, 1000, 3 ),
			align: Object.values( ALIGNS ).includes( p.align ) ? p.align : 'along',
			fit: Object.values( FITS ).includes( p.fit ) ? p.fit : 'ends',
			flip: p.flip === true,
			// How high each copy's base is above the row's, and its tilt along the line in degrees, as
			// last found on the ground under it (saved, so a row opens as it was).
			heights: numbers( p.heights ),
			tilts: numbers( p.tilts ),
		};

	}

	// Whether a point in the row's frame is inside one of its copies' boxes (walking into a row).
	function insideCopy( entry, point ) {

		const t = entry.pivot.children[ 0 ]?.userData.row?.t;
		const plan = layoutOf( entry );
		if ( ! t || ! plan ) return false;
		const { heights } = entry.params;
		return plan.copies.some( ( copy, i ) => {

			const y = point.y - ( heights[ i ] ?? 0 );
			if ( y < 0 || y > t.size.y ) return false;
			const turn = copy.yaw + copy.offset;
			const dx = point.x - copy.x;
			const dz = point.z - copy.z;
			const across = dx * Math.cos( turn ) - dz * Math.sin( turn );
			const along = dx * Math.sin( turn ) + dz * Math.cos( turn );
			return Math.abs( across ) <= t.size.x / 2 && Math.abs( along ) <= t.size.z / 2;

		} );

	}

	// --- keeping rows on the ground ------------------------------------------------------

	models.addEventListener( 'add', ( { entry } ) => {

		if ( entry.kind !== ROW ) return;
		rows.set( entry, { content: null, item: null, pointHeights: null, dirty: false, checkedAt: - Infinity, ground: null } );
		track( entry );

	} );

	models.addEventListener( 'change', ( { entry } ) => {

		const row = rows.get( entry );
		if ( ! row ) return;
		// Rebuilt: put it on the ground straight away. Moved: soon.
		if ( row.content !== entry.pivot.children[ 0 ] ) track( entry );
		else row.dirty = true;

	} );

	models.addEventListener( 'remove', ( { entry } ) => rows.delete( entry ) );

	// A new or rebuilt row. A new item (from the P panel) has to be unlocked if it's premium, and
	// loaded before the row is rebuilt with it: until then the row stays as it was.
	function track( entry ) {

		const row = rows.get( entry );
		const { item: id } = entry.params;
		if ( row.item && id !== row.item ) {

			const item = items.get( id );
			const previous = row.item;
			// Snapping may say this content changed again before it's put back.
			row.content = entry.pivot.children[ 0 ];
			const back = () => queueMicrotask( () => models.entries.includes( entry ) && models.setParams( entry, { item: previous } ) );
			if ( ! item ) {

				back();
				return;

			}

			if ( sidebar.isLocked( item ) ) {

				back();
				sidebar.pickLocked( item );
				return;

			}

			if ( ! templates.get( id )?.ready ) {

				back();
				template( id ).then( () => models.entries.includes( entry ) && models.setParams( entry, { item: id } ), err => toast( `Could not load ${ item.name }: ${ err.message }` ) );
				return;

			}

			// Named after its item, unless it was renamed.
			if ( entry.state.name === rowName( items.get( previous ) ) ) {

				entry.state.name = rowName( item );
				panel.refresh( entry );

			}

		}

		row.item = id;
		row.content = entry.pivot.children[ 0 ];
		drape( entry, true );

	}

	// Look at the ground under each copy, at both its ends along the line and its middle, and set
	// it on it: a long, low copy tilted from one end to the other, then raised if the ground is
	// higher in the middle (resting on a crest), anything else level on the highest of the three, so
	// none floats or digs in. With "snap to ground" off they all stand level at the row's height.
	// Unless forced (rebuilt), only if the ground under the row has changed.
	function drape( entry, force ) {

		const row = rows.get( entry );
		row.checkedAt = clock;
		row.dirty = false;
		const content = entry.pivot.children[ 0 ];
		const { t, layout: plan } = content.userData.row;
		if ( ! t ) return;
		const { copies } = plan;
		const { params, pivot } = entry;
		pivot.updateWorldMatrix( true, false );

		const level = ! entry.state.snap;
		let meshes = [];
		let top = 0;
		if ( level ) {

			if ( ! force && row.ground === 'level' ) return;
			row.ground = 'level';

		} else {

			_bounds.makeEmpty();
			for ( const copy of copies ) for ( const [ x, z ] of [ copy.a, copy.b ] ) _bounds.expandByPoint( pivot.localToWorld( _point.set( x, 0, z ) ) );
			for ( const [ e, n ] of params.points ) _bounds.expandByPoint( pivot.localToWorld( _point.set( e, 0, - n ) ) );
			const found = groundUnder( getGround(), _bounds );
			if ( ! force && found.key === row.ground ) return;
			row.ground = found.key;
			meshes = found.meshes;
			top = found.top;

		}

		// The ground's height in the row's frame under a point of it, or null where there's none.
		const ground = ( x, z ) => {

			if ( meshes.length === 0 ) return null;
			pivot.localToWorld( _point.set( x, 0, z ) );
			_point.y = top + 1;
			raycaster.set( _point, DOWN );
			const hit = raycaster.intersectObjects( meshes, false ).find( passesHitFilters );
			return hit ? hit.point.y - pivot.position.y : null;

		};

		const tilting = tilts( t, params );
		const heights = copies.map( ( copy, i ) => {

			if ( level ) return [ 0, 0 ];
			const [ a, b, middle ] = [ ground( ...copy.a ), ground( ...copy.b ), ground( copy.x, copy.z ) ];
			// No ground under it at all (off the edge of the tiles): it stays as it was.
			if ( a === null && b === null && middle === null ) return [ params.heights[ i ] ?? 0, params.tilts[ i ] ?? 0 ];
			const found = [ a, b, middle ].filter( h => h !== null );
			if ( ! tilting || a === null || b === null ) return [ Math.max( ...found ), 0 ];
			const pitch = MathUtils.clamp( Math.atan2( b - a, copy.length ) / DEG, - MAX_TILT, MAX_TILT );
			return [ Math.max( ( a + b ) / 2, middle ?? - Infinity ), pitch ];

		} );
		row.pointHeights = params.points.map( ( [ e, n ] ) => ground( e, - n ) ?? 0 );

		const saved = [ heights.map( h => round( h[ 0 ] ) ), heights.map( h => Math.round( h[ 1 ] * 10 ) / 10 ) ];
		const changed = saved[ 0 ].some( ( h, i ) => h !== params.heights[ i ] ) || saved[ 1 ].some( ( h, i ) => h !== params.tilts[ i ] ) || params.heights.length !== copies.length;
		// The params keep what was found without being rebuilt: only the copies' matrices change.
		params.heights = saved[ 0 ];
		params.tilts = saved[ 1 ];
		placeCopies( content, t, copies, params.heights, params.tilts );
		entry.footprint.makeEmpty();
		for ( const mesh of content.children ) entry.footprint.union( mesh.boundingBox );
		if ( changed && ! entry.placing ) layout.changed();

	}

	onUpdate( dt => {

		clock += dt;
		// One row a frame: a moved one first, else the one checked longest ago if it's due.
		let next = null;
		let nextRow = null;
		for ( const [ entry, row ] of rows ) {

			if ( clock - row.checkedAt < ( row.dirty ? MOVE_INTERVAL : CHECK_INTERVAL ) || models.isHidden( entry ) ) continue;
			if ( ! nextRow || ( row.dirty && ! nextRow.dirty ) || ( row.dirty === nextRow.dirty && row.checkedAt < nextRow.checkedAt ) ) {

				next = entry;
				nextRow = row;

			}

		}

		if ( next ) drape( next, nextRow.dirty );
		if ( draw ) followDrawing();

	} );

	// --- breaking a row apart ------------------------------------------------------------

	// Each copy becomes a single item where it stands, tilted as it was; Undo puts the row back.
	async function breakApart( entry ) {

		const item = items.get( entry.params.item );
		const plan = layoutOf( entry );
		if ( ! item || ! plan || ! models.entries.includes( entry ) ) return;
		const config = { ...models.toConfig( entry ), inConfig: entry.inConfig };
		const name = entry.state.name;
		const placements = plan.copies.map( ( copy, i ) => placementOf( entry, copy, entry.params.heights[ i ] ?? 0, entry.params.tilts[ i ] ?? 0, item ) );
		models.remove( entry );
		const results = await Promise.allSettled( placements.map( async ( { east, north, heading, up, pitch, roll } ) => {

			const single = await models.load( itemConfig( item, { east, north, heading, up } ) );
			// Snapped like any item from now on, keeping its tilt and height above the ground.
			single.state.snap = true;
			if ( Math.abs( pitch ) >= 0.1 || Math.abs( roll ) >= 0.1 ) models.park( single, { pitch, roll } );
			else models.apply( single );
			return single;

		} ) );
		const placed = results.filter( r => r.status === 'fulfilled' ).map( r => r.value );
		const failed = results.length - placed.length;
		sidebar.toolbar.offerUndo( `Broke ${ name } into ${ placed.length } items${ failed ? ` (${ failed } could not be loaded)` : '' }`, async () => {

			for ( const single of placed ) if ( models.entries.includes( single ) ) models.remove( single );
			try {

				sidebar.select( await models.load( config ) );

			} catch ( err ) {

				toast( `Could not put ${ name } back: ${ err.message }` );

			}

		} );

	}

	// Where a copy is in the scene, as a single item's placement: its east, north, base height and
	// heading, and its tilt as race mode leaves a parked vehicle (models.js).
	function placementOf( entry, copy, height, tilt, item ) {

		const { pivot } = entry;
		pivot.updateWorldMatrix( true, false );
		copyRotation( copy, tilt, _quaternion ).premultiply( pivot.getWorldQuaternion( _pivotTurn ) );
		_euler.setFromQuaternion( _quaternion, 'YXZ' );
		pivot.localToWorld( _position.set( copy.x, height, copy.z ) );
		// A crane stands on its carrier, ahead of the middle of its box (models.js).
		const ahead = Number( item.drive?.pivot?.ahead ) || 0;
		if ( ahead ) _position.add( _point.set( 0, 0, - ahead ).applyQuaternion( _quaternion ).setY( 0 ) );
		const { east, north, up } = localToEnu( _position );
		return { east: round( east ), north: round( north ), up: round( up ), heading: round( yawToHeading( _euler.y ) ), pitch: _euler.x / DEG, roll: _euler.z / DEG };

	}

	// --- drawing a new row ---------------------------------------------------------------

	// While a row is drawn: { item, from, settings, points, cursor, t, preview, line, dots }.
	let draw = null;
	const ui = createPanel();
	const lineMaterial = new LineMaterial( { color: 0x3d9be9, linewidth: 2.5, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false } );

	// A row of `item` from a line clicked on the ground; `from`: the placed one it was made from
	// (the toolbar's Row), where the line starts and which the row takes the place of.
	function startRow( item, from = null ) {

		if ( ! item ) return;
		if ( sidebar.isLocked( item ) ) {

			sidebar.pickLocked( item );
			return;

		}

		const state = { item, from, settings: settingsFor( item ), points: [], cursor: null, t: null, preview: null, line: null, dots: [] };
		draw = state;
		template( item.id ).then( t => {

			state.t = t;
			if ( draw === state ) refresh();

		}, err => {

			if ( draw === state ) sidebar.cancelDrawing();
			toast( `Could not load ${ item.name }: ${ err.message }` );

		} );
		ui.show( state );
		const start = from ? [ from.pivot.getWorldPosition( new Vector3() ) ] : [];
		sidebar.startLine( {
			name: item.name,
			card: sidebar.cardFor( item.id ),
			points: start,
			onChange: ( points, cursor ) => {

				state.points = points;
				state.cursor = cursor;
				if ( draw === state ) refresh();

			},
			onDone: ( points, touch ) => finish( state, points, touch ),
			onCancel: () => stopDrawing( state ),
		} );

	}

	function stopDrawing( state ) {

		if ( state.preview ) {

			scene.remove( state.preview );
			for ( const mesh of state.preview.children ) mesh.dispose();
			state.preview = null;

		}

		if ( state.line ) {

			scene.remove( state.line );
			state.line.geometry.dispose();
			state.line = null;

		}

		for ( const dot of state.dots ) dot.remove();
		state.dots = [];
		if ( draw === state ) {

			draw = null;
			ui.hide();

		}

	}

	// The row the points (on the ground, in the scene) make with the panel's settings, in a frame
	// at the first point facing north: its params, that frame's origin and how high each point is
	// above it. Null for fewer than two points a little apart.
	function rowFor( state, points ) {

		points = points.filter( ( p, i ) => i === 0 || Math.hypot( p.x - points[ i - 1 ].x, p.z - points[ i - 1 ].z ) >= 0.02 );
		if ( points.length < 2 ) return null;
		const origin = points[ 0 ];
		const line = points.map( p => [ - ( p.x - origin.x ), p.z - origin.z ] );
		// From a placed item, end to end, the first copy goes where that one stood.
		if ( state.from && state.settings.spacing === 'end' && state.t && line.length >= 2 ) {

			const [ [ e0, n0 ], [ e1, n1 ] ] = line;
			const length = Math.hypot( e1 - e0, n1 - n0 );
			const back = extentOf( state.t, state.settings ) / 2;
			if ( length > 0 ) line[ 0 ] = [ e0 - ( e1 - e0 ) / length * back, n0 - ( n1 - n0 ) / length * back ];

		}

		return { origin, levels: points.map( p => p.y - origin.y ), params: normalizeRow( { item: state.item.id, points: line, ...state.settings } ) };

	}

	// The preview: the line so far (and on to the pointer) with see-through copies along it, at
	// heights along the line between its points; the summary in the panel and by the pointer.
	function refresh() {

		const state = draw;
		const { t } = state;
		const points = [ ...state.points, ...state.cursor ? [ state.cursor ] : [] ];
		drawLine( state, points );
		const row = t && rowFor( state, points );
		if ( ! row ) {

			if ( state.preview ) state.preview.visible = false;
			ui.say( state, null );
			return;

		}

		const { origin, levels, params } = row;
		const plan = layOut( params, t );
		if ( ! state.preview || state.preview.userData.capacity < plan.copies.length ) {

			if ( state.preview ) {

				scene.remove( state.preview );
				for ( const mesh of state.preview.children ) mesh.dispose();

			}

			state.preview = new Group();
			state.preview.userData.capacity = Math.max( 16, plan.copies.length * 2 );
			for ( const [ k, part ] of t.parts.entries() ) {

				const mesh = instances( part, ghostOf( t )[ k ], state.preview.userData.capacity );
				mesh.raycast = () => {};
				state.preview.add( mesh );

			}

			scene.add( state.preview );

		}

		// Heights along the line, from the ground under the points clicked.
		const along = [ 0 ];
		for ( let i = 1; i < params.points.length; i ++ ) along.push( along[ i - 1 ] + Math.hypot( params.points[ i ][ 0 ] - params.points[ i - 1 ][ 0 ], params.points[ i ][ 1 ] - params.points[ i - 1 ][ 1 ] ) );
		const heightAt = s => {

			let k = 1;
			while ( k < along.length - 1 && along[ k ] < s ) k ++;
			const f = MathUtils.clamp( ( s - along[ k - 1 ] ) / ( along[ k ] - along[ k - 1 ] || 1 ), 0, 1 );
			return levels[ k - 1 ] + ( levels[ k ] - levels[ k - 1 ] ) * f;

		};
		const tilting = tilts( t, params );
		const heights = plan.copies.map( copy => {

			const [ a, b ] = [ heightAt( copy.sa ), heightAt( copy.sb ) ];
			return tilting ? ( a + b ) / 2 : Math.max( a, b );

		} );
		const pitches = plan.copies.map( copy => tilting ? MathUtils.clamp( Math.atan2( heightAt( copy.sb ) - heightAt( copy.sa ), copy.length ) / DEG, - MAX_TILT, MAX_TILT ) : 0 );
		state.preview.position.copy( origin );
		state.preview.rotation.y = headingToYaw( 0 );
		for ( const mesh of state.preview.children ) mesh.count = plan.copies.length;
		placeCopies( state.preview, t, plan.copies, heights, pitches );
		state.preview.visible = true;
		ui.say( state, summary( state.item, plan ) );

	}

	// The line drawn over everything, with a dot on each point clicked.
	function drawLine( state, points ) {

		if ( points.length >= 2 ) {

			if ( ! state.line ) {

				state.line = new Line2( new LineGeometry(), lineMaterial );
				state.line.renderOrder = 1002;
				state.line.frustumCulled = false;
				state.line.raycast = () => {};
				scene.add( state.line );

			}

			state.line.geometry.dispose();
			state.line.geometry = new LineGeometry().setPositions( points.flatMap( p => [ p.x, p.y + 0.08, p.z ] ) );
			state.line.visible = true;

		} else if ( state.line ) state.line.visible = false;

		while ( state.dots.length < state.points.length ) state.dots.push( ui.dot() );
		while ( state.dots.length > state.points.length ) state.dots.pop().remove();

	}

	// Every frame while drawing: the dots and the label follow the camera.
	function followDrawing() {

		const rect = canvas.getBoundingClientRect();
		const spot = {};
		draw.points.forEach( ( point, i ) => {

			toScreen( point, camera, rect, spot );
			const dot = draw.dots[ i ];
			dot.hidden = ! spot.visible;
			dot.style.transform = `translate( ${ spot.x.toFixed( 1 ) }px, ${ spot.y.toFixed( 1 ) }px ) translate( -50%, -50% )`;

		} );
		const end = draw.cursor ?? draw.points[ draw.points.length - 1 ];
		ui.follow( end ? toScreen( end, camera, rect, spot ) : null );

	}

	async function finish( state, points, touch ) {

		stopDrawing( state );
		const t = state.t ?? await template( state.item.id );
		state.t = t;
		const row = rowFor( state, points );
		if ( ! row ) throw new Error( 'the points are all in one place' );
		const { origin, params } = row;
		// Its origin in the middle of its points, so it turns about its middle.
		const middle = [ 0, 1 ].map( k => ( Math.min( ...params.points.map( p => p[ k ] ) ) + Math.max( ...params.points.map( p => p[ k ] ) ) ) / 2 );
		params.points = params.points.map( ( [ e, n ] ) => [ round( e - middle[ 0 ] ), round( n - middle[ 1 ] ) ] );
		const { east, north } = localToEnu( origin );
		remember( state.item.id, state.settings );
		const entry = await models.load( {
			kind: ROW,
			name: rowName( state.item ),
			params,
			east: round( east + middle[ 0 ] ),
			north: round( north + middle[ 1 ] ),
			heading: 0,
			up: null,
		} );
		// It takes the place of the one it was made from.
		if ( state.from && models.entries.includes( state.from ) ) models.remove( state.from );
		if ( touch ) toast( `${ summary( state.item, layoutOf( entry ) ) }. Drag its points to change the line` );
		return entry;

	}

	// See-through copies of the item's materials for the preview, made once.
	function ghostOf( t ) {

		t.ghost ??= t.parts.map( ( { material } ) => {

			const ghosts = [ material ].flat().map( m => Object.assign( m.clone(), { transparent: true, opacity: Math.min( m.opacity, 0.55 ) } ) );
			return ghosts.length === 1 ? ghosts[ 0 ] : ghosts;

		} );
		return t.ghost;

	}

	// --- the panel while drawing ---------------------------------------------------------

	// At the top of the map: the spacing (end to end with a gap, or every so many metres), how the
	// copies line up, where the run starts, what it adds up to, and Undo point, Cancel and Done for
	// a finger (a mouse has Backspace, Esc and a double-click).
	function createPanel() {

		const root = document.createElement( 'div' );
		root.className = 'row-panel';
		root.hidden = true;
		root.setAttribute( 'role', 'group' );
		root.setAttribute( 'aria-label', 'New row' );
		root.innerHTML = `
			<header><span class="title">Row</span><span class="item"></span></header>
			<div class="field"><span class="label">Spacing</span><div class="switch" data-key="spacing"></div>
				<label class="amount"><span class="what"></span><input type="number" min="0" step="0.1" inputmode="decimal" /><span>m</span></label></div>
			<div class="field"><span class="label">Line up</span><div class="switch" data-key="align"></div></div>
			<div class="field"><span class="label">Ends</span><div class="switch" data-key="fit"></div></div>
			<p class="summary" role="status"></p>
			<p class="tip"></p>
			<div class="buttons"><button type="button" class="undo">Undo point</button><button type="button" class="cancel">Cancel</button><button type="button" class="done">Done</button></div>`;
		document.body.append( root );
		const label = document.createElement( 'div' );
		label.className = 'handle-label row-label';
		label.hidden = true;
		document.body.append( label );
		const dots = document.createElement( 'div' );
		dots.className = 'row-dots';
		document.getElementById( 'app' ).after( dots );

		const choices = { spacing: { 'End to end': 'end', 'Every': 'every' }, align: { 'Along': 'along', 'Across': 'across' }, fit: FITS };
		for ( const [ key, options ] of Object.entries( choices ) ) {

			const group = root.querySelector( `[data-key="${ key }"]` );
			group.setAttribute( 'role', 'radiogroup' );
			for ( const [ text, value ] of Object.entries( options ) ) {

				const button = Object.assign( document.createElement( 'button' ), { type: 'button', textContent: text } );
				button.setAttribute( 'role', 'radio' );
				button.dataset.value = value;
				button.addEventListener( 'click', () => {

					button.blur();
					set( { [ key ]: value } );

				} );
				group.append( button );

			}

		}

		const amount = root.querySelector( '.amount input' );
		amount.addEventListener( 'change', () => {

			const value = Number( amount.value );
			const key = draw?.settings.spacing === 'every' ? 'every' : 'gap';
			if ( amount.value.trim() !== '' && Number.isFinite( value ) ) set( { [ key ]: value } );
			else show( draw );

		} );
		amount.addEventListener( 'keydown', e => {

			if ( e.key === 'Enter' || e.key === 'Escape' ) amount.blur();

		} );
		root.querySelector( '.undo' ).addEventListener( 'click', e => {

			e.currentTarget.blur();
			sidebar.undoPoint();

		} );
		root.querySelector( '.cancel' ).addEventListener( 'click', () => sidebar.cancelDrawing() );
		root.querySelector( '.done' ).addEventListener( 'click', e => {

			e.currentTarget.blur();
			if ( ! sidebar.finishLine( e.pointerType !== 'mouse' && e.pointerType !== '' ) ) say( draw, null, 'Put down at least two points first' );

		} );
		// Wheel over the panel still reaches the scene, as over the toolbar.
		root.addEventListener( 'wheel', e => {

			if ( e.target === amount ) return;
			e.preventDefault();
			canvas.dispatchEvent( new WheelEvent( 'wheel', e ) );

		}, { passive: false } );
		window.addEventListener( 'resize', () => draw && place() );

		function set( change ) {

			if ( ! draw ) return;
			const settings = normalizeRow( { ...draw.settings, ...change } );
			draw.settings = { spacing: settings.spacing, gap: settings.gap, every: settings.every, align: settings.align, fit: settings.fit };
			show( draw );
			refresh();

		}

		function show( state ) {

			const { settings, item } = state;
			root.querySelector( '.item' ).textContent = item.name;
			for ( const group of root.querySelectorAll( '.switch' ) ) {

				for ( const button of group.children ) button.setAttribute( 'aria-checked', String( button.dataset.value === settings[ group.dataset.key ] ) );

			}

			const every = settings.spacing === 'every';
			root.querySelector( '.amount .what' ).textContent = every ? 'every' : 'gap';
			amount.value = String( every ? settings.every : settings.gap );
			amount.min = every ? '0.1' : '0';
			amount.title = every ? 'Centre to centre, in metres' : 'Between one and the next, in metres';

		}

		function say( state, text, warning = null ) {

			if ( ! state ) return;
			const mouse = window.matchMedia( '( any-pointer: fine )' ).matches;
			const verb = mouse ? 'Click' : 'Tap';
			const summaryText = root.querySelector( '.summary' );
			summaryText.textContent = warning ?? text ?? ( state.points.length === 0 ? `${ verb } where the row starts` : `${ verb } the next point` );
			summaryText.classList.toggle( 'warning', !! warning );
			label.textContent = text ?? '';
			label.dataset.empty = String( ! text );
			root.querySelector( '.tip' ).textContent = mouse
				? 'Click points on the ground, corners and all; double-click or Enter to finish. Drag for a straight row. Backspace undoes a point, Esc cancels.'
				: 'Tap points on the ground, corners and all, then Done. Drag for a straight row.';
			root.querySelector( '.undo' ).disabled = state.points.length === 0;
			root.querySelector( '.done' ).disabled = state.points.length < 2;

		}

		// Centred over the map beside the library, clear of the status readout.
		function place() {

			const library = document.getElementById( 'library' );
			const sheet = library.hidden ? null : library.getBoundingClientRect();
			const left = sheet && sheet.top <= 0 ? sheet.right : 0;
			const width = root.offsetWidth;
			const x = Math.max( left + 8, left + ( window.innerWidth - left - width ) / 2 );
			root.style.left = `${ Math.round( x ) }px`;
			const status = document.getElementById( 'status' ).getBoundingClientRect();
			const clash = status.height > 0 && status.right > x && status.left < x + width && getComputedStyle( document.getElementById( 'status' ) ).display !== 'none';
			root.style.top = `${ clash ? Math.round( status.bottom + 8 ) : 12 }px`;

		}

		return {
			show( state ) {

				root.hidden = false;
				show( state );
				say( state, null );
				place();

			},
			hide() {

				root.hidden = true;
				label.hidden = true;

			},
			say,
			// The label beside the end of the line, where it is on screen (null hides it).
			// Above it, or below it where the panel is above it.
			follow( spot ) {

				label.hidden = ! spot?.visible || label.dataset.empty === 'true';
				if ( label.hidden ) return;
				const panel = root.getBoundingClientRect();
				const width = label.offsetWidth;
				const under = spot.y - 18 - label.offsetHeight < panel.bottom && spot.x + width / 2 > panel.left && spot.x - width / 2 < panel.right;
				label.style.transform = under
					? `translate( ${ spot.x.toFixed( 1 ) }px, ${ ( spot.y + 18 ).toFixed( 1 ) }px ) translate( -50%, 0 )`
					: `translate( ${ spot.x.toFixed( 1 ) }px, ${ ( spot.y - 18 ).toFixed( 1 ) }px ) translate( -50%, -100% )`;

			},
			dot() {

				const dot = document.createElement( 'div' );
				dot.className = 'row-dot';
				dots.append( dot );
				return dot;

			},
			place,
		};

	}

	// --- remembering spacings ------------------------------------------------------------

	function settingsFor( item ) {

		const saved = storage( () => JSON.parse( localStorage.getItem( STORAGE_KEY ) ) )?.[ item.id ];
		const settings = normalizeRow( { ...defaults( item ), ...( saved && typeof saved === 'object' ? saved : {} ) } );
		return { spacing: settings.spacing, gap: settings.gap, every: settings.every, align: settings.align, fit: settings.fit };

	}

	function remember( id, settings ) {

		storage( () => {

			const saved = JSON.parse( localStorage.getItem( STORAGE_KEY ) ) ?? {};
			saved[ id ] = settings;
			localStorage.setItem( STORAGE_KEY, JSON.stringify( saved ) );

		} );

	}

	// For tests and the console.
	if ( window.twin ) window.twin.rows = { startRow, breakApart, template, layOut: ( params, id ) => layOut( normalizeRow( params ), templates.get( id ).ready ) };

}

// --- laying out the copies ---------------------------------------------------------------

// Where each copy goes along a row's line, in its frame (three.js's local axes: x east and z south
// as if it faced north): { copies, length (of the line), step (centre to centre on a straight) }.
// Each copy is { x, z, yaw, offset, a, b, sa, sb, length }: its middle and the way the line runs
// there (yaw, about y), how it's turned from that (offset), its ends along the line (a, b, as
// [ x, z ], and how far along the line they are, sa and sb) and the distance between them.
//
// End to end, each copy runs straight from a point on the line to the point its length further on,
// and the next starts the gap after that: round a corner a copy cuts across it, so they meet end to
// end there too. The run starts at the start, or is centred with the spare split between the ends.
// Every so many metres, copies go that far apart along the line, round corners as well: from the
// ends, one at each end and as near that spacing as fits between; centred, exactly that spacing.
function layOut( params, t ) {

	const line = params.points.map( ( [ e, n ] ) => [ e, - n ] );
	const starts = [ 0 ];
	for ( let k = 1; k < line.length; k ++ ) starts.push( starts[ k - 1 ] + Math.hypot( line[ k ][ 0 ] - line[ k - 1 ][ 0 ], line[ k ][ 1 ] - line[ k - 1 ][ 1 ] ) );
	const total = starts[ starts.length - 1 ];
	const extent = extentOf( t, params );
	const longZ = t.size.z >= t.size.x;
	const offset = ( ( params.align === 'along' ) === longZ ? 0 : - Math.PI / 2 ) + ( params.flip ? Math.PI : 0 );

	// The point s metres along the line, the stretch it's on and how far along that (0 to 1).
	const at = s => {

		s = MathUtils.clamp( s, 0, total );
		let k = 0;
		while ( k < line.length - 2 && starts[ k + 1 ] <= s ) k ++;
		const length = starts[ k + 1 ] - starts[ k ];
		const f = length > 0 ? ( s - starts[ k ] ) / length : 0;
		const [ x0, z0 ] = line[ k ];
		const [ x1, z1 ] = line[ k + 1 ];
		return { x: x0 + ( x1 - x0 ) * f, z: z0 + ( z1 - z0 ) * f, k, f, dx: ( x1 - x0 ) / ( length || 1 ), dz: ( z1 - z0 ) / ( length || 1 ) };

	};

	// How far along the line it first gets d metres (straight) from the point s along it, or null.
	const reach = ( s, d ) => {

		const from = at( s );
		for ( let k = from.k; k < line.length - 1; k ++ ) {

			const [ x0, z0 ] = line[ k ];
			const dx = line[ k + 1 ][ 0 ] - x0;
			const dz = line[ k + 1 ][ 1 ] - z0;
			const square = dx * dx + dz * dz;
			const fx = x0 - from.x;
			const fz = z0 - from.z;
			const b = fx * dx + fz * dz;
			const c = fx * fx + fz * fz - d * d;
			const disc = b * b - square * c;
			if ( square === 0 || disc < 0 ) continue;
			// Where the stretch leaves the circle of that radius.
			const f = ( - b + Math.sqrt( disc ) ) / square;
			if ( f >= ( k === from.k ? from.f : 0 ) - 1e-9 && f <= 1 + 1e-9 ) return starts[ k ] + MathUtils.clamp( f, 0, 1 ) * Math.sqrt( square );

		}

		return null;

	};

	const copy = ( sa, sb ) => {

		const a = at( sa );
		const b = at( sb );
		let dx = b.x - a.x;
		let dz = b.z - a.z;
		const length = Math.hypot( dx, dz );
		if ( length < 1e-6 ) [ dx, dz ] = [ a.dx, a.dz ];
		return { x: ( a.x + b.x ) / 2, z: ( a.z + b.z ) / 2, yaw: Math.atan2( - dx, - dz ), offset, a: [ a.x, a.z ], b: [ b.x, b.z ], sa, sb, length };

	};

	// A copy centred on the point s along the line, along it there (between two stretches at a
	// corner, the way between them).
	const centredAt = s => {

		const p = at( s );
		let { dx, dz } = p;
		if ( p.f < 1e-6 && p.k > 0 ) {

			const q = at( starts[ p.k ] - 1e-3 );
			dx += q.dx;
			dz += q.dz;
			const length = Math.hypot( dx, dz ) || 1;
			[ dx, dz ] = [ dx / length, dz / length ];

		}

		const half = extent / 2;
		return { x: p.x, z: p.z, yaw: Math.atan2( - dx, - dz ), offset, a: [ p.x - dx * half, p.z - dz * half ], b: [ p.x + dx * half, p.z + dz * half ], sa: s - half, sb: s + half, length: extent };

	};

	if ( params.spacing === 'every' ) {

		const every = params.every;
		let count;
		let step;
		let from;
		if ( params.fit === 'ends' ) {

			const spaces = Math.round( total / every );
			count = spaces === 0 ? 1 : spaces + 1;
			step = spaces === 0 ? 0 : total / spaces;
			from = spaces === 0 ? total / 2 : 0;

		} else {

			count = Math.floor( total / every + 1e-6 ) + 1;
			step = every;
			from = ( total - ( count - 1 ) * every ) / 2;

		}

		count = Math.min( count, MAX_COPIES );
		return { copies: Array.from( { length: count }, ( _, i ) => centredAt( from + i * step ) ), length: total, step };

	}

	const chain = start => {

		const links = [];
		let s = start;
		while ( links.length < MAX_COPIES ) {

			const end = reach( s, extent );
			if ( end === null ) break;
			links.push( [ s, end ] );
			if ( params.gap <= 0 ) s = end;
			else {

				const next = reach( end, params.gap );
				if ( next === null ) break;
				s = next;

			}

		}

		return links;

	};

	let links = chain( 0 );
	if ( params.fit === 'centred' && links.length > 0 ) {

		const spare = total - links[ links.length - 1 ][ 1 ];
		const centred = spare > 1e-3 ? chain( spare / 2 ) : links;
		// Round corners the run can come out a copy short centred; it starts at the start then.
		if ( centred.length === links.length ) links = centred;

	}

	// Shorter than one copy: one in the middle.
	if ( links.length === 0 ) return { copies: [ centredAt( total / 2 ) ], length: total, step: 0 };
	return { copies: links.map( ( [ sa, sb ] ) => copy( sa, sb ) ), length: total, step: extent + params.gap };

}

// How long a copy is along the line: the item's long side lined up along it, its short side across.
function extentOf( t, { align } ) {

	const { x, z } = t.size;
	return Math.max( 0.05, align === 'along' ? Math.max( x, z ) : Math.min( x, z ) );

}

// Whether copies tilt along the line with the ground: those longer along it than they are tall
// (a barrier, a fence panel, a truck nose to tail), not a cone, a person or a light tower's mast.
function tilts( t, params ) {

	return extentOf( t, params ) >= t.size.y;

}

// A copy's turn in the row's frame: the way the line runs, tilted along it, then turned as it lines up.
function copyRotation( copy, tilt, target ) {

	_euler.set( tilt * DEG, copy.yaw, 0, 'YXZ' );
	return target.setFromEuler( _euler ).multiply( _turn.setFromAxisAngle( UP, copy.offset ) );

}

// Each copy's matrix in every part's instances: where it is, at its height, tilted and turned.
function placeCopies( group, t, copies, heights, tilts ) {

	const meshes = group.children;
	for ( const [ i, copy ] of copies.entries() ) {

		_position.set( copy.x, heights?.[ i ] ?? 0, copy.z );
		_matrix.compose( _position, copyRotation( copy, tilts?.[ i ] ?? 0, _quaternion ), ONE );
		for ( const [ k, mesh ] of meshes.entries() ) mesh.setMatrixAt( i, _part.multiplyMatrices( _matrix, t.parts[ k ].matrix ) );

	}

	for ( const mesh of meshes ) {

		mesh.instanceMatrix.needsUpdate = true;
		mesh.computeBoundingBox();
		mesh.computeBoundingSphere();

	}

}

// A rigged model's mesh as it stands, as plain geometry: instances can't be posed.
function posed( mesh ) {

	const geometry = mesh.geometry.clone();
	const { count } = geometry.attributes.position;
	const positions = new Float32Array( count * 3 );
	for ( let i = 0; i < count; i ++ ) mesh.getVertexPosition( i, _point ).toArray( positions, i * 3 );
	geometry.setAttribute( 'position', new BufferAttribute( positions, 3 ) );
	geometry.deleteAttribute( 'skinIndex' );
	geometry.deleteAttribute( 'skinWeight' );
	geometry.morphAttributes = {};
	return geometry;

}

// --- words and numbers -------------------------------------------------------------------

function rowName( item ) {

	return item ? `Row: ${ item.name }` : 'Row';

}

// What a row comes to: how many, how long, and what they weigh where the item's name says.
function summary( item, plan ) {

	if ( ! plan ) return '';
	const count = plan.copies.length;
	const weight = weightText( item, count );
	return [ `${ count } ${ count === 1 ? 'copy' : 'copies' }`, `${ format( plan.length ) } m`, weight ].filter( Boolean ).join( ' · ' );

}

function spacingText( params, plan ) {

	if ( ! plan ) return '';
	return plan.step > 0 ? `${ format( plan.step, 2 ) } m centre to centre${ params.spacing === 'end' ? ' on a straight' : '' }` : '';

}

// Kilograms an item weighs, from its name ("~2.9 t"), or null.
function weightOf( item ) {

	const match = item && WEIGHT.exec( item.name );
	if ( ! match ) return null;
	const value = Number( match[ 1 ].replace( /,/g, '' ) );
	return Number.isFinite( value ) ? value * ( match[ 2 ].toLowerCase() === 't' ? 1000 : 1 ) : null;

}

function weightText( item, count ) {

	const each = weightOf( item );
	if ( ! each || ! count ) return '';
	const total = each * count;
	return total >= 1000 ? `≈ ${ format( total / 1000, total < 100000 ? 1 : 0 ) } t` : `≈ ${ format( total, 0 ) } kg`;

}

// How a row of an item starts, until one has been drawn (then as that one was): cones and drums
// every 3 m, bollards every 1.5 m, light towers every 30 m and people every 1.5 m; barriers,
// fencing and hoarding end to end, touching; plant and vehicles end to end with a metre to walk
// between; anything else end to end with half a metre.
function defaults( item ) {

	const base = { spacing: 'end', gap: 0.5, every: 3, align: 'along', fit: 'ends' };
	const text = `${ item.id } ${ item.name }`.toLowerCase();
	if ( item.category === 'Traffic control' ) return { ...base, spacing: 'every', every: 3 };
	if ( /bollard/.test( text ) ) return { ...base, spacing: 'every', every: 1.5 };
	if ( /light[ -]tower/.test( text ) ) return { ...base, spacing: 'every', every: 30 };
	if ( item.category === 'People' ) return { ...base, spacing: 'every', every: 1.5 };
	if ( item.category === 'Barriers & fencing' ) return { ...base, gap: 0 };
	if ( [ 'Vehicles', 'Heavy equipment', 'Cranes & lifts', 'Material handling' ].includes( item.category ) ) return { ...base, gap: 1 };
	return base;

}

function clamp( v, min, max, fallback ) {

	const n = Number( v );
	return Number.isFinite( n ) ? Math.min( max, Math.max( min, round( n ) ) ) : fallback;

}

function format( v, digits = 1 ) {

	return v.toLocaleString( 'en-CA', { minimumFractionDigits: digits ? 1 : 0, maximumFractionDigits: digits } );

}

function round( v ) {

	return Math.round( v * 100 ) / 100;

}

// localStorage can throw in private windows; rows still work without it.
function storage( fn ) {

	try {

		return fn();

	} catch {

		return null;

	}

}
