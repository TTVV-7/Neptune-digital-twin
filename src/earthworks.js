import './earthworks.css';
import {
	BufferAttribute,
	BufferGeometry,
	Color,
	ConeGeometry,
	DoubleSide,
	Group,
	LineBasicMaterial,
	LineLoop,
	MathUtils,
	Mesh,
	MeshBasicMaterial,
	PlaneGeometry,
	Vector3,
} from 'three';
import { registerKind } from './kinds.js';
import { CELL, CUT, MATERIALS, SWELL, Terrain, coneRadius, findMaterial, insideRect, materialIndex, rectBounds, rectFrame, spread } from './terrain.js';
import { createPourStream } from './pour.js';

// Earthworks for laydown planning: excavations cut into the ground and stockpiles poured onto it.
// Both are placed kinds (kinds.js), saved and moved like any library item; the ground itself is
// the terrain engine (terrain.js), which also takes freeform digging and dumping (an excavator).
// The P panel shows their volumes, and labels float over them in build mode.

export const EXCAVATION = 'excavation';
export const STOCKPILE = 'stockpile';

const DIG_TIME = 3.5;
const POUR_TIME = 5;
// A tandem dump truck carries about this much loose material.
const TRUCK_LOAD = 10;
// Side slopes, horizontal : vertical.
const SLOPES = { 'vertical (shored)': 0, '0.5 : 1': 0.5, '1 : 1': 1, '1.5 : 1': 1.5, '2 : 1': 2 };
// Side slopes keep climbing past the outline this far where the ground there is higher.
const SLOPE_REACH = 3;
// The rim is the lowest ground this far round the outline (models.js snaps to it), or the floor of
// a flatten area reaching that far.
const RIM_REACH = 2;
// A ridge's sides run on past its rectangle this far where the ground there is lower.
const RIDGE_TOE = 4;
const MAX_SIZE = 200;
const MAX_VOLUME = 20000;
const DEG = MathUtils.DEG2RAD;

const PIT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2a3844"/><path d="M4 24h12l9 18h14l9-18h12v30H4z" fill="#5b4a3a"/><path d="M16 24l9 18h14l9-18" fill="#6d5a47" stroke="#d9822b" stroke-width="2"/><path d="M4 24h12M48 24h12" stroke="#8a8f86" stroke-width="3"/><path d="M32 6v12m-5-5 5 5 5-5" stroke="#eef2f5" stroke-width="2.5" fill="none"/></svg>';
const PILE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2a3844"/><path d="M4 52h56" stroke="#8a8f86" stroke-width="3"/><path d="M10 51 32 30l22 21z" fill="#9a958b"/><path d="M32 30 21 41l4 2 7-6 6 5 4-1z" fill="#b5b0a6"/><g fill="#c8b083"><circle cx="31" cy="8" r="1.8"/><circle cx="33" cy="14" r="1.8"/><circle cx="31" cy="20" r="1.8"/><circle cx="32.5" cy="25.5" r="1.8"/></g></svg>';

const capMaterial = new MeshBasicMaterial( { color: 0xd9822b, transparent: true, opacity: 0.16, side: DoubleSide, depthWrite: false } );
const pitLine = new LineBasicMaterial( { color: 0xd9822b } );
// Stockpiles are clicked through an invisible hull a little bigger than the pile.
const hullMaterial = new MeshBasicMaterial( { visible: false, side: DoubleSide } );
const pileLines = new Map( MATERIALS.map( m => [ m.id, new LineBasicMaterial( { color: new Color( m.colour ).offsetHSL( 0, 0, 0.15 ) } ) ] ) );
for ( const material of [ capMaterial, pitLine, hullMaterial, ...pileLines.values() ] ) material.userData.shared = true;

export function setUpEarthworks( { scene, camera, canvas, tiles, ground, models, layout, sidebar, panel, flattening, getGround, addGround, onUpdate, addMapEdit, toast } ) {

	const terrain = new Terrain( { tiles, ground, models, flattening, getGround, camera } );
	scene.add( terrain.group );
	addGround( terrain.group );
	// Pits press Google's mesh down, which the attribution has to mention.
	addMapEdit( () => terrain.hasCuts() );
	terrain.onFreeformChange = () => layout.changed();
	layout.registerExtra( 'terrain', {
		save: () => terrain.saveFreeform(),
		load: ( data, options ) => terrain.loadFreeform( data, options ),
		clear: () => terrain.resetFreeform(),
	} );

	const designs = new Map(); // entry -> its design in the terrain
	const anims = new Map(); // entry -> { t, duration } while digging or pouring
	const progress = entry => {

		const anim = anims.get( entry );
		return anim ? Math.min( 1, anim.t / anim.duration ) : 1;

	};
	const stream = createPourStream( { scene, surfaceAt: ( x, z ) => terrain.surfaceAt( x, z ) } );
	const labels = createLabels( { camera, canvas, models } );
	// New stockpiles are made of whatever the last one was changed to.
	let lastMaterial = 'gravel';

	const cutOf = entry => terrain.designVolume( entry ).cut;
	const fillOf = entry => terrain.designVolume( entry ).fill;
	// A part load counts as a load, but not the last litre of a whole one.
	const loads = volume => `about ${ Math.max( 0, Math.ceil( volume / TRUCK_LOAD - 0.01 ) ) } (tandem, ${ TRUCK_LOAD } m³)`;

	registerKind( EXCAVATION, {
		label: 'Excavation',
		build: buildPitMarker,
		normalize: normalizePit,
		// The rim is the ground as it was, so digging doesn't drag the pit down after itself, and
		// the lowest of it, so whatever stands in Google's mesh there (rail cars, a shed) is dug
		// away with the pit instead of lifting the floor to its roof.
		snap: 'lowest-original',
		solid: false,
		buildOnly: true,
		fields: [
			{ key: 'width', label: 'width (m)', min: 1, step: 0.5 },
			{ key: 'length', label: 'length (m)', min: 1, step: 0.5 },
			{ key: 'depth', label: 'depth (m)', min: 0.1, step: 0.1 },
			{ key: 'slope', label: 'side slope (h : v)', options: SLOPES },
		],
		actions: [
			{ label: 'Dig', run: entry => dig( entry ) },
			{ label: 'Spoil pile', run: entry => spoil( entry ) },
		],
		readouts: [
			{ label: 'cut (bank)', get: entry => `${ cutOf( entry ).toFixed( 1 ) } m³` },
			{ label: `loose (×${ SWELL })`, get: entry => `${ ( cutOf( entry ) * SWELL ).toFixed( 1 ) } m³` },
			{ label: 'truck loads', get: entry => loads( cutOf( entry ) * SWELL ) },
			{ label: 'floor', get: entry => floorSize( entry.params ) },
		],
	} );

	registerKind( STOCKPILE, {
		label: 'Stockpile',
		build: buildPileMarker,
		normalize: normalizePile,
		snap: 'median-original',
		solid: false,
		buildOnly: true,
		fields: [
			{ key: 'material', label: 'material', options: Object.fromEntries( MATERIALS.map( m => [ m.name, m.id ] ) ) },
			{ key: 'shape', label: 'shape', options: { cone: 'cone', 'ridge (fills width × length)': 'ridge' } },
			{ key: 'volume', label: 'volume (m³, cone)', min: 0.5, step: 1 },
			{ key: 'width', label: 'width (m, ridge)', min: 1, step: 0.5 },
			{ key: 'length', label: 'length (m, ridge)', min: 1, step: 0.5 },
			{ key: 'maxHeight', label: 'max height (m, 0 = none)', min: 0, step: 0.1 },
		],
		actions: [ { label: 'Pour', run: entry => pour( entry ) } ],
		readouts: [
			{ label: 'volume', get: entry => `${ fillOf( entry ).toFixed( 1 ) } m³` },
			{ label: 'weight', get: entry => `${ ( fillOf( entry ) * pileMaterial( entry ).density ).toFixed( 1 ) } t` },
			{ label: 'height', get: entry => `${ ( designs.get( entry )?.solved?.height ?? 0 ).toFixed( 2 ) } m` },
			{ label: 'base', get: entry => baseSize( entry, designs.get( entry )?.solved ) },
			{ label: 'truck loads', get: entry => loads( fillOf( entry ) ) },
		],
	} );

	sidebar.addTool( {
		name: 'Excavation',
		hint: 'Drag the top of the cut',
		title: 'Drag a rectangle on the ground: the top edge of a pit, dug 2 m deep with 1 : 1 sides. Press P to change it.',
		icon: PIT_ICON,
		mode: 'rect',
		color: 0xd9822b,
		defaultSize: [ 10, 10 ],
		onDone: async ( { east, north, heading, width, length } ) => {

			const entry = await models.load( { kind: EXCAVATION, params: { width, length }, east, north, heading, up: null } );
			dig( entry );
			return entry;

		},
	} );

	sidebar.addTool( {
		name: 'Stockpile',
		hint: 'Click for a cone, drag for a ridge',
		title: 'Click to pour a 50 m³ cone there, or drag a rectangle for a ridge pile that fills it. Press P for the material and size.',
		icon: PILE_ICON,
		mode: 'rect',
		color: 0xc8b083,
		defaultSize: [ 8, 12 ],
		onDone: async ( { east, north, heading, width, length, dragged } ) => {

			const params = dragged ? { material: lastMaterial, shape: 'ridge', width, length } : { material: lastMaterial, shape: 'cone', volume: 50 };
			const entry = await models.load( { kind: STOCKPILE, params, east, north, heading, up: null } );
			pour( entry );
			return entry;

		},
	} );

	// --- keeping the terrain in step with the placed entries ---------------------------------

	const isEarthwork = entry => entry.kind === EXCAVATION || entry.kind === STOCKPILE;
	const order = entry => () => models.entries.indexOf( entry );
	const floorUnder = frame => terrain.floorUnder( frame );
	const sync = entry => {

		const design = designs.get( entry );
		// A stockpile moved or changed is planned afresh: bites an excavator took out of it go too.
		if ( design.reshaped?.() ) terrain.dropBites( entry );
		design.refresh();
		terrain.setDesign( entry, design );
		placeMarker( entry );
		refreshLabel( entry );

	};

	models.addEventListener( 'add', ( { entry } ) => {

		if ( ! isEarthwork( entry ) || entry.placing ) return;
		const make = entry.kind === EXCAVATION ? pitDesign : pileDesign;
		designs.set( entry, make( entry, { order: order( entry ), progress, floorUnder } ) );
		sync( entry );

	} );
	models.addEventListener( 'change', ( { entry } ) => {

		const design = designs.get( entry );
		if ( ! design ) return;
		if ( entry.kind === STOCKPILE && design.material !== entry.params.material ) lastMaterial = entry.params.material;
		sync( entry );

	} );
	models.addEventListener( 'remove', ( { entry } ) => {

		if ( ! designs.has( entry ) ) return;
		terrain.dropBites( entry );
		designs.delete( entry );
		anims.delete( entry );
		stream.stop( entry );
		labels.remove( entry );
		terrain.setDesign( entry, null );

	} );
	// A pit's rim comes down to the floor of a flatten area around it.
	terrain.addEventListener( 'zones', () => {

		for ( const [ entry, design ] of designs ) {

			if ( entry.kind !== EXCAVATION ) continue;
			const { rim } = design;
			design.refresh();
			if ( design.rim !== rim ) sync( entry );

		}

	} );
	terrain.addEventListener( 'change', ( { designs: changed } ) => {

		for ( const entry of changed ) {

			if ( ! designs.has( entry ) ) continue;
			panel.refresh( entry );
			placeMarker( entry );
			refreshLabel( entry );

		}

	} );

	// A pile in a pit or on another pile sits lower or higher than the ground around it, and a pit
	// in a flatten area starts from the area's floor.
	function placeMarker( entry ) {

		const design = designs.get( entry );
		const content = entry.pivot.children[ 0 ];
		if ( ! design || ! content ) return;
		if ( entry.kind === EXCAVATION ) content.position.y = design.rim - entry.state.up;
		else if ( design.solved ) content.position.y = design.solved.base - entry.state.up;

	}

	const anchor = new Vector3();
	function refreshLabel( entry ) {

		const { state } = entry;
		if ( entry.kind === EXCAVATION ) {

			const rim = designs.get( entry )?.rim ?? state.up;
			labels.set( entry, `Excavation · ${ format( cutOf( entry ) ) } m³ cut`, anchor.set( - state.east, rim + 1.2, state.north ) );
			return;

		}

		const material = pileMaterial( entry );
		const volume = fillOf( entry );
		const top = designs.get( entry )?.solved?.top ?? state.up;
		labels.set( entry, `${ material.name } · ${ format( volume ) } m³ · ${ format( volume * material.density ) } t`, anchor.set( - state.east, top + 1, state.north ) );

	}

	// --- actions -----------------------------------------------------------------------------

	// Deepen the pit from the ground to its full depth.
	function dig( entry ) {

		anims.set( entry, { t: 0, duration: DIG_TIME } );
		terrain.touch( entry );

	}

	// Grow the pile from nothing, with material falling onto it.
	function pour( entry ) {

		anims.set( entry, { t: 0, duration: POUR_TIME } );
		terrain.touch( entry );
		stream.start( entry, pourSource( entry ) );

	}

	// A pile of what came out of the pit, swollen, beside its longer side and clear of the rim.
	// Returns the new stockpile entry.
	async function spoil( entry ) {

		const anim = anims.get( entry );
		if ( anim ) anim.t = anim.duration;
		terrain.touch( entry );
		terrain.flush();
		const loose = cutOf( entry ) * SWELL;
		if ( loose < 0.5 ) {

			toast( 'Nothing to pile up: this excavation hasn\'t cut into the ground.' );
			return null;

		}

		const soil = findMaterial( 'soil' );
		const tan = Math.tan( soil.repose * DEG );
		const { width, length } = entry.params;
		const { east, north, heading } = entry.state;
		const beside = length >= width;
		const long = Math.max( width, length );
		// A windrow along a trench or wherever a cone would be wider than the pit is long, else a cone.
		const radius = coneRadius( loose, tan );
		const ridge = long >= 2 * Math.min( width, length ) || 2 * radius > long ? ridgeWidth( loose, long, tan ) : null;
		const params = ridge ? { material: soil.id, shape: 'ridge', width: round( ridge, 2 ), length: long } : { material: soil.id, shape: 'cone', volume: round( loose, 1 ) };
		const offset = Math.min( width, length ) / 2 + 2 + ( ridge ? ridge / 2 : radius );
		const rad = heading * DEG;
		const [ de, dn ] = beside ? [ Math.cos( rad ), - Math.sin( rad ) ] : [ Math.sin( rad ), Math.cos( rad ) ];
		const pile = await models.load( {
			kind: STOCKPILE,
			params,
			east: round( east + de * offset, 2 ),
			north: round( north + dn * offset, 2 ),
			heading: beside ? heading : ( heading + 90 ) % 360,
			up: null,
		} );
		pour( pile );
		sidebar.select( pile );
		return pile;

	}

	function pourSource( entry ) {

		const { state, params } = entry;
		const material = pileMaterial( entry );
		const tan = Math.tan( material.repose * DEG );
		const base = designs.get( entry )?.solved?.base ?? state.up;
		const cap = params.maxHeight > 0 ? params.maxHeight : Infinity;
		const height = params.shape === 'cone' ? coneRadius( params.volume, tan ) * tan : Math.min( Math.min( params.width, params.length ) / 2 * tan, cap );
		const centre = new Vector3( - state.east, base + height + 3, state.north );
		// Along a ridge the drop point sweeps back and forth, like a moving conveyor.
		const rad = state.heading * DEG;
		const along = params.length >= params.width;
		const axis = along ? new Vector3( - Math.sin( rad ), 0, Math.cos( rad ) ) : new Vector3( - Math.cos( rad ), 0, - Math.sin( rad ) );
		const sweep = params.shape === 'ridge' ? Math.abs( params.length - params.width ) / 2 : 0;
		const point = new Vector3();
		return {
			colour: new Color( material.colour ),
			emitter: time => point.copy( centre ).addScaledVector( axis, sweep * Math.sin( time * 1.3 ) ),
		};

	}

	onUpdate( dt => {

		for ( const [ entry, anim ] of anims ) {

			anim.t += dt;
			if ( anim.t >= anim.duration ) {

				anims.delete( entry );
				stream.stop( entry );

			}

			terrain.touch( entry );

		}

		terrain.update( dt );
		stream.update( dt );
		labels.update();

	} );

	// For tests and for other features (the excavator) to build on.
	if ( window.twin ) Object.assign( window.twin, { terrain, earthworks: { dig, pour, spoil, designs, anims, labels, stream } } );
	return { terrain, dig, pour, spoil };

}

// --- designs: what an excavation or a stockpile does to the ground ----------------------------

// floorUnder( frame ): the floor of the flatten areas reaching into a rectangle (Infinity if none).
function pitDesign( entry, { order, progress, floorUnder } ) {

	const g = {};
	return {
		type: 'cut',
		top: CUT,
		order,
		refresh() {

			const { state, params } = entry;
			const { width, length, depth, slope } = params;
			Object.assign( g, rectFrame( state.east, state.north, state.heading, width / 2, length / 2 ), { depth, slope } );
			// Inside a flatten area the ground is the area's floor, which is what the terrain digs
			// into there; from the original ground (the roofs of what was cleared, say) the pit
			// would be too shallow to reach it.
			const around = rectFrame( state.east, state.north, state.heading, width / 2 + RIM_REACH, length / 2 + RIM_REACH );
			g.rim = Math.min( state.up, floorUnder( around ) );

		},
		get rim() {

			return g.rim;

		},
		bounds: () => rectBounds( g, ( g.slope > 0 ? SLOPE_REACH : 0 ) + CELL ),
		height: ( x, z ) => pitSurface( g, x, z, progress( entry ) ),
		heightFinal: ( x, z ) => pitSurface( g, x, z, 1 ),
	};

}

// The pit's design surface: the floor `depth` below the rim, with the sides sloping up at
// `slope` (horizontal : vertical) to meet the rim at the outline. A footprint too small for its
// slopes gets a floor that shrinks to a line. p (0..1) deepens it, for the dig animation.
function pitSurface( g, x, z, p ) {

	const inside = insideRect( g, x, z );
	if ( g.slope === 0 ) {

		// The ground is a grid of heights, so a vertical wall falls across two cells, centred on
		// the outline and eased at both ends: turned pits get straight edges rather than teeth,
		// with the same volume.
		const t = MathUtils.smoothstep( inside, - CELL, CELL );
		return t > 0 ? g.rim - g.depth * p * t : Infinity;

	}

	if ( inside < - SLOPE_REACH ) return Infinity;
	return g.rim - Math.min( g.depth * p, inside / g.slope );

}

function pileDesign( entry, { order, progress } ) {

	const g = {};
	// Where and what the pile was at the last refresh (not its height, which follows the ground).
	const placement = () => JSON.stringify( [ entry.state.east, entry.state.north, entry.state.heading, entry.params ] );
	let placed = null;
	const design = {
		type: 'fill',
		order,
		solved: null,
		top: 0,
		material: entry.params.material,
		// Whether it has been moved or changed since the last refresh.
		reshaped: () => placed !== null && placement() !== placed,
		refresh() {

			placed = placement();
			const { state, params } = entry;
			const material = findMaterial( params.material );
			Object.assign( g, rectFrame( state.east, state.north, state.heading, params.width / 2, params.length / 2 ), {
				cone: params.shape === 'cone',
				volume: params.volume,
				cap: params.maxHeight,
				tan: Math.tan( material.repose * DEG ),
			} );
			design.top = materialIndex( material );
			design.material = material.id;

		},
		bounds() {

			if ( ! g.cone ) return rectBounds( g, RIDGE_TOE + CELL );
			const reach = coneReach( g );
			return { minX: - g.east - reach, maxX: - g.east + reach, minZ: g.north - reach, maxZ: g.north + reach };

		},
		solve( nodes ) {

			const f = progress( entry );
			design.solved = null;
			if ( f <= 0 ) return null;
			return g.cone ? solveCone( g, nodes, f, design ) : solveRidge( g, nodes, f, design );

		},
	};
	return design;

}

// A cone spreads further where the ground falls away (into a pit); this far at most.
function coneReach( g ) {

	return 2 * coneRadius( g.volume, g.tan ) + 3;

}

// The cone, at the material's angle of repose, whose apex is just high enough that it adds the
// poured volume above whatever is under it (found by bisection). Only what is connected to its
// middle counts, so its sides don't come up again in a pit beyond its foot.
function solveCone( g, { ni, count, x, z, before, cellArea }, f, design ) {

	const target = g.volume * f;
	const reach = coneReach( g );
	const cx = - g.east;
	const cz = g.north;
	const drop = new Float32Array( count );
	let lo = Infinity;
	let middle = 0;
	for ( let n = 0; n < count; n ++ ) {

		const d = Math.hypot( x[ n ] - cx, z[ n ] - cz );
		drop[ n ] = d <= reach ? d * g.tan : Infinity;
		if ( d < Math.hypot( x[ middle ] - cx, z[ middle ] - cz ) ) middle = n;
		if ( before[ n ] + drop[ n ] < lo ) lo = before[ n ] + drop[ n ];

	}

	if ( ! Number.isFinite( lo ) ) return null;
	const thickness = apex => n => apex - drop[ n ] - before[ n ];
	const added = apex => spread( ni, count, [ middle ], thickness( apex ) ).total * cellArea;
	let hi = lo + 1;
	for ( let i = 0; i < 40 && added( hi ) < target; i ++ ) hi = lo + ( hi - lo ) * 2;
	for ( let i = 0; i < 50; i ++ ) {

		const mid = ( lo + hi ) / 2;
		if ( added( mid ) < target ) lo = mid;
		else hi = mid;

	}

	const apex = ( lo + hi ) / 2;
	const { mask } = spread( ni, count, [ middle ], thickness( apex ) );
	const tops = new Float32Array( count ).fill( - Infinity );
	let height = 0;
	const under = [];
	for ( let n = 0; n < count; n ++ ) {

		if ( ! mask[ n ] ) continue;
		tops[ n ] = apex - drop[ n ];
		height = Math.max( height, tops[ n ] - before[ n ] );
		under.push( before[ n ] );

	}

	design.solved = { top: apex, base: median( under ) ?? lo, height };
	return tops;

}

// A hip-roofed pile filling the rectangle at the angle of repose, flat on top at its max height,
// standing on the middle height of the ground under it. While pouring it grows from the middle.
// Its sides run on down where the ground falls away, as long as they stay connected to it.
function solveRidge( g, { ni, count, x, z, before }, f, design ) {

	const s = Math.cbrt( f );
	const cap = g.cap > 0 ? g.cap * s : Infinity;
	const under = [];
	const inside = new Float32Array( count );
	const seeds = [];
	for ( let n = 0; n < count; n ++ ) {

		inside[ n ] = insideRect( g, x[ n ], z[ n ], g.hw * s, g.hl * s );
		if ( Number.isNaN( before[ n ] ) ) continue;
		if ( insideRect( g, x[ n ], z[ n ] ) >= 0 ) under.push( before[ n ] );
		if ( inside[ n ] >= 0 ) seeds.push( n );

	}

	const base = median( under ) ?? 0;
	const top = n => inside[ n ] >= - RIDGE_TOE ? base + Math.min( cap, g.tan * inside[ n ] ) : - Infinity;
	const { mask } = spread( ni, count, seeds, n => top( n ) - before[ n ] );
	const tops = new Float32Array( count ).fill( - Infinity );
	let height = 0;
	for ( let n = 0; n < count; n ++ ) {

		if ( ! mask[ n ] ) continue;
		tops[ n ] = top( n );
		height = Math.max( height, tops[ n ] - before[ n ] );

	}

	design.solved = { top: base + Math.min( cap, g.tan * Math.min( g.hw, g.hl ) * s ), base, height };
	return tops;

}

// The width of a ridge `length` long holding `volume` at the angle whose tangent is `tan`, or
// null if it would have to be wider than long. Volume of a hip roof: tan W² (3L - W) / 12.
function ridgeWidth( volume, length, tan ) {

	const held = w => tan * w * w * ( 3 * length - w ) / 12;
	if ( held( length ) < volume ) return null;
	let lo = 0;
	let hi = length;
	for ( let i = 0; i < 50; i ++ ) {

		const mid = ( lo + hi ) / 2;
		if ( held( mid ) < volume ) lo = mid;
		else hi = mid;

	}

	return hi;

}

// --- params -----------------------------------------------------------------------------------

function normalizePit( p ) {

	const wanted = Number( p.slope );
	const slope = Object.values( SLOPES ).reduce( ( best, s ) => Math.abs( s - wanted ) < Math.abs( best - wanted ) ? s : best, 1 );
	return {
		width: clamp( p.width, 1, MAX_SIZE, 10 ),
		length: clamp( p.length, 1, MAX_SIZE, 10 ),
		depth: clamp( p.depth, 0.1, 30, 2 ),
		slope,
	};

}

function normalizePile( p ) {

	return {
		material: findMaterial( p.material )?.id ?? 'gravel',
		shape: p.shape === 'ridge' ? 'ridge' : 'cone',
		volume: clamp( p.volume, 0.5, MAX_VOLUME, 50 ),
		width: clamp( p.width, 1, MAX_SIZE, 8 ),
		length: clamp( p.length, 1, MAX_SIZE, 12 ),
		maxHeight: clamp( p.maxHeight, 0, 50, 0 ),
	};

}

function pileMaterial( entry ) {

	return findMaterial( entry.params.material ) ?? MATERIALS[ 0 ];

}

function floorSize( { width, length, depth, slope } ) {

	const w = width - 2 * slope * depth;
	const l = length - 2 * slope * depth;
	if ( w > 0 && l > 0 ) return `${ w.toFixed( 1 ) } × ${ l.toFixed( 1 ) } m`;
	return `none: the sides meet ${ ( Math.min( width, length ) / 2 / slope ).toFixed( 1 ) } m down`;

}

function baseSize( entry, solved ) {

	const { params } = entry;
	if ( params.shape === 'ridge' ) return `${ params.width.toFixed( 1 ) } × ${ params.length.toFixed( 1 ) } m`;
	const tan = Math.tan( pileMaterial( entry ).repose * DEG );
	const height = solved ? solved.top - solved.base : 0;
	return `⌀ ${ ( 2 * height / tan ).toFixed( 1 ) } m`;

}

// --- build mode markers -----------------------------------------------------------------------

// The outline of the top of the cut and a see-through cap, to click and drag it by.
function buildPitMarker( { width, length } ) {

	const group = new Group();
	group.name = 'Excavation';
	const cap = new Mesh( new PlaneGeometry( width, length ).rotateX( - Math.PI / 2 ), capMaterial );
	cap.position.y = 0.04;
	cap.renderOrder = 1;
	const outline = new LineLoop( rectangle( width, length ), pitLine );
	outline.position.y = 0.06;
	outline.raycast = () => {};
	for ( const object of [ cap, outline ] ) object.userData.noCollide = true;
	group.add( cap, outline );
	return group;

}

// The outline of the pile's base, and the invisible hull it's clicked by.
function buildPileMarker( params ) {

	const material = findMaterial( params.material );
	const tan = Math.tan( material.repose * DEG );
	const group = new Group();
	group.name = material.name;
	let hull;
	let outline;
	if ( params.shape === 'cone' ) {

		const radius = coneRadius( params.volume, tan ) * 1.05 + 0.15;
		const height = radius * tan + 0.15;
		hull = new Mesh( new ConeGeometry( radius, height, 24 ).translate( 0, height / 2, 0 ), hullMaterial );
		outline = new LineLoop( circle( radius - 0.15 ), pileLines.get( material.id ) );

	} else {

		hull = new Mesh( hipGeometry( params.width + 0.3, params.length + 0.3, tan, params.maxHeight > 0 ? params.maxHeight + 0.15 : 0 ), hullMaterial );
		outline = new LineLoop( rectangle( params.width, params.length ), pileLines.get( material.id ) );

	}

	outline.position.y = 0.06;
	outline.raycast = () => {};
	for ( const object of [ hull, outline ] ) object.userData.noCollide = true;
	group.add( hull, outline );
	return group;

}

function rectangle( width, length ) {

	const [ x, z ] = [ width / 2, length / 2 ];
	return new BufferGeometry().setFromPoints( [ new Vector3( - x, 0, - z ), new Vector3( x, 0, - z ), new Vector3( x, 0, z ), new Vector3( - x, 0, z ) ] );

}

function circle( radius ) {

	const points = [];
	for ( let i = 0; i < 48; i ++ ) points.push( new Vector3( Math.cos( i / 48 * Math.PI * 2 ) * radius, 0, Math.sin( i / 48 * Math.PI * 2 ) * radius ) );
	return new BufferGeometry().setFromPoints( points );

}

// A hip roof over width x length at the slope `tan`, flat on top at `cap` (0 = none).
function hipGeometry( width, length, tan, cap ) {

	const height = Math.min( Math.min( width, length ) / 2 * tan, cap > 0 ? cap : Infinity );
	const inset = height / tan;
	const [ x, z ] = [ width / 2, length / 2 ];
	const [ tx, tz ] = [ Math.max( 0, x - inset ), Math.max( 0, z - inset ) ];
	const positions = [ - x, 0, - z, x, 0, - z, x, 0, z, - x, 0, z, - tx, height, - tz, tx, height, - tz, tx, height, tz, - tx, height, tz ];
	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new BufferAttribute( new Float32Array( positions ), 3 ) );
	geometry.setIndex( [ 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7, 4, 5, 6, 4, 6, 7 ] );
	return geometry;

}

// --- labels -----------------------------------------------------------------------------------

// Small labels over excavations and stockpiles, shown in build mode.
function createLabels( { camera, canvas, models } ) {

	const root = document.createElement( 'div' );
	root.className = 'earthworks-labels';
	document.body.append( root );
	const items = new Map(); // entry -> { element, anchor }
	const projected = new Vector3();

	return {

		set( entry, text, anchor ) {

			let item = items.get( entry );
			if ( ! item ) {

				item = { element: document.createElement( 'div' ), anchor: new Vector3() };
				item.element.className = 'label';
				root.append( item.element );
				items.set( entry, item );

			}

			if ( item.element.textContent !== text ) item.element.textContent = text;
			item.anchor.copy( anchor );

		},

		remove( entry ) {

			items.get( entry )?.element.remove();
			items.delete( entry );

		},

		update() {

			root.hidden = ! models.buildMode;
			if ( root.hidden ) return;
			const rect = canvas.getBoundingClientRect();
			const shown = [];
			for ( const { element, anchor } of items.values() ) {

				projected.copy( anchor ).project( camera );
				const show = projected.z < 1 && Math.abs( projected.x ) < 1.05 && Math.abs( projected.y ) < 1.05 && camera.position.distanceTo( anchor ) < 1000;
				element.hidden = ! show;
				if ( ! show ) continue;
				shown.push( {
					element,
					x: rect.left + ( projected.x + 1 ) / 2 * rect.width,
					y: rect.top + ( 1 - projected.y ) / 2 * rect.height,
					depth: projected.z,
					width: element.offsetWidth,
					height: element.offsetHeight,
				} );

			}

			// Nearer labels keep their place; one behind a nearer one moves up above it.
			shown.sort( ( a, b ) => a.depth - b.depth );
			const placed = [];
			for ( const label of shown ) {

				for ( let tries = 0; tries < shown.length; tries ++ ) {

					const clash = placed.find( p => Math.abs( p.x - label.x ) < ( p.width + label.width ) / 2 && label.y - label.height < p.y && p.y - p.height < label.y );
					if ( ! clash ) break;
					label.y = clash.y - clash.height - 2;

				}

				placed.push( label );
				label.element.style.transform = `translate( ${ label.x.toFixed( 1 ) }px, ${ label.y.toFixed( 1 ) }px ) translate( -50%, -100% )`;

			}

		},

		text: entry => items.get( entry )?.element.textContent ?? null,

	};

}

// --- helpers ----------------------------------------------------------------------------------

function clamp( value, min, max, fallback ) {

	const n = Number( value );
	return Number.isFinite( n ) ? Math.min( max, Math.max( min, n ) ) : fallback;

}

function round( value, digits ) {

	const f = 10 ** digits;
	return Math.round( value * f ) / f;

}

function median( values ) {

	if ( values.length === 0 ) return null;
	const sorted = Float32Array.from( values ).sort();
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[ mid ] : ( sorted[ mid - 1 ] + sorted[ mid ] ) / 2;

}

// Volumes for labels: whole numbers once they're big enough.
function format( value ) {

	if ( value >= 100 ) return Math.round( value ).toLocaleString( 'en-CA' );
	return value >= 10 ? value.toFixed( 0 ) : value.toFixed( 1 );

}
