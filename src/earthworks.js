import './earthworks.css';
import {
	BufferAttribute,
	BufferGeometry,
	Color,
	ConeGeometry,
	DoubleSide,
	Group,
	LineBasicMaterial,
	LineDashedMaterial,
	LineLoop,
	MathUtils,
	Mesh,
	MeshBasicMaterial,
	PlaneGeometry,
	Vector3,
} from 'three';
import { registerKind } from './kinds.js';
import { CELL, CUT, MATERIALS, SWELL, Terrain, coneRadius, findMaterial, hideUnderEarthworks, insideRect, materialIndex, rectBounds, rectFrame, spread } from './terrain.js';
import { addHitFilter } from './walk.js';
import { createPourStream } from './pour.js';
import { SHORING_READOUTS, setUpShoring } from './shoring.js';
import { SECTION_ACTIONS, SECTION_READOUTS, clipTileMaterial, setUpSection } from './excavation-section.js';
import {
	BRACINGS,
	ENDS,
	METHODS,
	OUTLINES,
	SIDE_METHODS,
	SLOPE_FROM,
	SOILS,
	SOIL_OPTIONS,
	SYSTEMS,
	cutBounds,
	cutVolume,
	depthAt,
	geometryAtStage,
	methodPatch,
	newExcavationParams,
	normaliseExcavation,
	outlines,
	pitFrame,
	pitToEnu,
	planExcavation,
	ratio,
	saveExcavation,
	slopeOf,
	sideCompass,
	sideLabel,
	toPit,
} from './excavation-design.js';

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
// The rim is the lowest ground this far round the top of the cut (models.js snaps to it), or the
// floor of a flatten area reaching that far.
const RIM_REACH = 2;
// Side labels stand this far above the rim, at the middle of each side's top edge.
const SIDE_LABEL_HEIGHT = 0.3;
// And this far out from the middle of each top edge, clear of the handles there.
const SIDE_LABEL_OUT = 1;
// Said in every pit's P panel: what the figures are, and aren't.
const PLANNING_AID = 'A planning aid, not a design or a compliance check: slopes for soil B and C are OSHA\'s, for comparison; have a qualified person check the ground for stable faces (WorkSafeBC 20.81(1)(b)).';
// A ridge's sides run on past its rectangle this far where the ground there is lower.
const RIDGE_TOE = 4;
const MAX_SIZE = 200;
const MAX_VOLUME = 20000;
const DEG = MathUtils.DEG2RAD;

const PIT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2a3844"/><path d="M4 24h12l9 18h14l9-18h12v30H4z" fill="#5b4a3a"/><path d="M16 24l9 18h14l9-18" fill="#6d5a47" stroke="#d9822b" stroke-width="2"/><path d="M4 24h12M48 24h12" stroke="#8a8f86" stroke-width="3"/><path d="M32 6v12m-5-5 5 5 5-5" stroke="#eef2f5" stroke-width="2.5" fill="none"/></svg>';
const PILE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2a3844"/><path d="M4 52h56" stroke="#8a8f86" stroke-width="3"/><path d="M10 51 32 30l22 21z" fill="#9a958b"/><path d="M32 30 21 41l4 2 7-6 6 5 4-1z" fill="#b5b0a6"/><g fill="#c8b083"><circle cx="31" cy="8" r="1.8"/><circle cx="33" cy="14" r="1.8"/><circle cx="31" cy="20" r="1.8"/><circle cx="32.5" cy="25.5" r="1.8"/></g></svg>';

const capMaterial = new MeshBasicMaterial( { color: 0xd9822b, transparent: true, opacity: 0.16, side: DoubleSide, depthWrite: false } );
const pitLine = new LineBasicMaterial( { color: 0xd9822b } );
// A pit drawn by its floor has the floor's outline too, dashed, inside the top of the cut.
const floorLine = new LineDashedMaterial( { color: 0xd9822b, dashSize: 0.6, gapSize: 0.4, transparent: true, opacity: 0.8 } );
// Stockpiles are clicked through an invisible hull a little bigger than the pile.
const hullMaterial = new MeshBasicMaterial( { visible: false, side: DoubleSide } );
const pileLines = new Map( MATERIALS.map( m => [ m.id, new LineBasicMaterial( { color: new Color( m.colour ).offsetHSL( 0, 0, 0.15 ) } ) ] ) );
for ( const material of [ capMaterial, pitLine, floorLine, hullMaterial, ...pileLines.values() ] ) material.userData.shared = true;

// The P panel's choices for an excavation (excavation-design.js has what each means).
const SYSTEM_OPTIONS = Object.fromEntries( Object.entries( SYSTEMS ).map( ( [ id, system ] ) => [ system.label, id ] ) );
// Support levels: 'classic' is the single waler the first shoring drew, offered only to a pit that
// still has it (a layout saved before), since picking anything else can't go back to it.
const LEVEL_OPTIONS = Object.fromEntries( Object.entries( BRACINGS ).filter( ( [ , value ] ) => value !== 'classic' ) );
const CLASSIC_OPTIONS = { ...LEVEL_OPTIONS, 'as first drawn': 'classic' };

export function setUpEarthworks( { scene, camera, renderer, canvas, controls, tiles, ground, models, layout, sidebar, panel, flattening, layers, getGround, addGround, onUpdate, addMapEdit, toast } ) {

	const terrain = new Terrain( { tiles, ground, models, flattening, getGround, camera } );
	if ( tiles ) {

		// Google's mesh inside the drawn earthworks and above their surface is hidden, and can't
		// be stood on or clicked.
		const hide = scene => scene.traverse( object => {

			if ( ! object.isMesh ) return;
			object.userData.googleTile = true;
			[ object.material ].flat().forEach( material => {

				hideUnderEarthworks( material, terrain.mask );
				// And cut away with a pit in its section view.
				clipTileMaterial( material );

			} );

		} );
		tiles.forEachLoadedModel( hide );
		tiles.addEventListener( 'load-model', ( { scene } ) => hide( scene ) );
		addHitFilter( hit => ! ( hit.object.userData.googleTile && terrain.covers( hit.point ) ) );

	}

	scene.add( terrain.group );
	addGround( terrain.group );
	// Before (the Show panel): the ground as it was, with Google's mesh showing everywhere.
	layers.onBeforeAfter( before => terrain.setUntouched( before ) );
	// Pits hide part of Google's mesh, which the attribution has to mention.
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
	// A pit's sides are numbered in the scene while it's selected or its P panel settings are open,
	// so its per-side choices there can be told apart.
	const showsSides = entry => models.buildMode && ( sidebar.getSelected?.() === entry || !! panel.shows?.( entry ) );
	const labels = createLabels( { camera, canvas, models, showsSides } );
	// New stockpiles are made of whatever the last one was changed to.
	let lastMaterial = 'gravel';

	const cutOf = entry => terrain.designVolume( entry ).cut;
	const fillOf = entry => terrain.designVolume( entry ).fill;
	// A part load counts as a load, but not the last litre of a whole one.
	const loads = volume => `about ${ Math.max( 0, Math.ceil( volume / TRUCK_LOAD - 0.01 ) ) } (tandem, ${ TRUCK_LOAD } m³)`;

	registerKind( EXCAVATION, {
		label: 'Excavation',
		build: buildPitMarker,
		normalize: normaliseExcavation,
		// Params at what their absence means are left out, so pits saved before sides had methods
		// save again byte for byte.
		save: saveExcavation,
		// The rim is the ground as it was, so digging doesn't drag the pit down after itself, and
		// the lowest of it, so whatever stands in Google's mesh there (rail cars, a shed) is dug
		// away with the pit instead of lifting the floor to its roof.
		snap: 'lowest-original',
		solid: false,
		buildOnly: true,
		fields: PIT_FIELDS,
		// Resizing keeps the depth and the sides. Digging again reworks the ground under the
		// whole pit, so that waits until the handle is let go; meanwhile the top of the cut and the
		// floor are outlined.
		resize: {
			shape: 'rect',
			depth: true,
			label: resizeText,
			outlines: params => {

				const { top, floor } = outlines( planExcavation( params ).geom );
				return { top, floor };

			},
		},
		actions: [
			{ label: 'Dig', run: entry => dig( entry ) },
			{ label: 'Spoil pile', run: entry => spoil( entry ) },
			...SECTION_ACTIONS,
		],
		// The buttons (the section among them) before the readouts, which can run to a few screens.
		actionsFirst: true,
		readouts: [
			{ label: 'cut (bank)', get: entry => `${ cutOf( entry ).toFixed( 1 ) } m³` },
			{ label: `loose (×${ SWELL })`, get: entry => `${ ( cutOf( entry ) * SWELL ).toFixed( 1 ) } m³` },
			{ label: 'truck loads', get: entry => loads( cutOf( entry ) * SWELL ) },
			{ label: 'floor', get: entry => floorText( entry.params ) },
			{ label: 'top of the cut', get: entry => topText( entry.params ) },
			{ label: 'stage', note: true, get: entry => stageText( entry.params ) },
			{ label: 'planning aid', note: true, get: () => PLANNING_AID },
			...SHORING_READOUTS,
			...SECTION_READOUTS,
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
			{ key: 'shape', label: 'shape', options: { cone: 'cone', 'ridge (fills width × length)': 'ridge' }, size: true },
			{ key: 'volume', label: 'volume (m³)', min: 0.5, step: 1, size: true, when: isCone },
			{ key: 'width', label: 'width (m)', min: 1, step: 0.5, size: true, when: isRidge },
			{ key: 'length', label: 'length (m)', min: 1, step: 0.5, size: true, when: isRidge },
			{ key: 'maxHeight', label: 'max height (m, 0 = none)', min: 0, step: 0.1, size: true, when: isRidge },
			{ key: 'material', label: 'material', options: Object.fromEntries( MATERIALS.map( m => [ m.name, m.id ] ) ) },
		],
		// A cone is sized by its radius, which sets its volume. A ridge fills its footprint up to its
		// height limit, so a bigger footprint holds more: the label says how much. Pouring again
		// reworks the ground under the pile, so that waits until the handle is let go.
		resize: {
			shape: params => isCone( params ) ? 'circle' : 'rect',
			radius: params => coneRadius( params.volume, reposeTan( params ) ),
			withRadius: ( params, radius ) => ( { volume: round( Math.PI * radius ** 3 * reposeTan( params ) / 3, 1 ) } ),
			label: params => {

				const tan = reposeTan( params );
				if ( isCone( params ) ) return `⌀ ${ ( 2 * coneRadius( params.volume, tan ) ).toFixed( 1 ) } m · ${ ( coneRadius( params.volume, tan ) * tan ).toFixed( 1 ) } m high · ${ format( params.volume ) } m³`;
				const height = Math.min( Math.min( params.width, params.length ) / 2 * tan, params.maxHeight > 0 ? params.maxHeight : Infinity );
				return `${ footprintText( params ) } · holds ≈ ${ format( ridgeHolds( params.width, params.length, tan, params.maxHeight ) ) } m³ · ${ height.toFixed( 1 ) } m high`;

			},
		},
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
		hint: 'Drag the floor of the pit',
		title: `Drag a rectangle on the ground: the floor of a pit, dug 2 m deep with its sides sloped out for the soil (${ ratio( SOILS.C.slope ) } in soft, sandy or filled ground: OSHA's, for comparison; WorkSafeBC gives none). Press P to step or shore them, for the whole pit or side by side.`,
		icon: PIT_ICON,
		mode: 'rect',
		color: 0xd9822b,
		defaultSize: [ 10, 10 ],
		// While the floor is dragged out: the top of the cut it makes, and their sizes.
		preview: ( { width, length } ) => {

			if ( width < 1 && length < 1 ) return null;
			const { params, geom } = planExcavation( newExcavationParams( { width: Math.max( 1, width ), length: Math.max( 1, length ) } ) );
			return { top: outlines( geom ).top, label: resizeText( params ) };

		},
		onDone: async ( { east, north, heading, width, length } ) => {

			const entry = await models.load( { kind: EXCAVATION, params: newExcavationParams( { width, length } ), east, north, heading, up: null } );
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
			// Over the middle of the top of the cut, and each side's number at the middle of its top
			// edge, with the compass point it faces.
			const { top } = outlines( designOf( entry.params ).geom );
			const frame = pitFrame( state );
			const at = ( u, v, up ) => {

				const { east, north } = pitToEnu( frame, u, v );
				return new Vector3( - east, rim + up, north );

			};
			const [ u, v ] = [ ( top.u0 + top.u1 ) / 2, ( top.v0 + top.v1 ) / 2 ];
			labels.set( entry, `Excavation · ${ format( cutOf( entry ) ) } m³ cut`, anchor.copy( at( u, v, 1.2 ) ) );
			const out = SIDE_LABEL_OUT;
			const middles = [ [ u, top.v1 + out ], [ top.u1 + out, v ], [ u, top.v0 - out ], [ top.u0 - out, v ] ];
			labels.sides( entry, middles.map( ( [ su, sv ], i ) => ( { text: `${ i + 1 } · ${ sideCompass( state.heading, i + 1 ) }`, anchor: at( su, sv, SIDE_LABEL_HEIGHT ) } ) ) );
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

	// A pile of what came out of the pit, swollen, beside the longer side of the top of the cut and
	// clear of the rim. Returns the new stockpile entry.
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
		// The top of the cut: the rectangle itself for a pit drawn by its top.
		const { geom } = designOf( entry.params );
		const { top, topSize: { width, length } } = outlines( geom );
		const { heading } = entry.state;
		const beside = length >= width;
		// Beside a long side that's sloped or stepped where there's one: a pile beside shoring loads
		// it (WorkSafeBC 20.86). Right or front first, as before.
		const shored = n => [ 'wall', 'trench' ].includes( geom.sides[ n - 1 ].method );
		const [ first, other ] = beside ? [ 2, 4 ] : [ 1, 3 ];
		const far = ! shored( first ) || shored( other );
		const long = Math.max( width, length );
		// A windrow along a trench or wherever a cone would be wider than the pit is long, else a cone.
		const radius = coneRadius( loose, tan );
		let ridge = long >= 2 * Math.min( width, length ) || 2 * radius > long ? ridgeWidth( loose, long, tan ) : null;
		let ridgeLength = long;
		if ( ! ridge && loose > MAX_VOLUME ) {

			// More than a cone may hold: a windrow after all, longer than the pit if it would
			// otherwise have to be wider than long, up to the longest a pile may be.
			ridgeLength = Math.min( MAX_SIZE, Math.max( long, Math.cbrt( 6 * loose / tan ) ) );
			ridge = ridgeWidth( loose, ridgeLength, tan ) ?? ridgeLength;

		}

		const held = ridge ? ridgeVolume( ridge, ridgeLength, tan ) : loose;
		if ( held < loose - 0.5 ) toast( `The spoil pile holds ${ format( held ) } m³; the other ${ format( loose - held ) } m³ needs another pile.` );
		const params = ridge ? { material: soil.id, shape: 'ridge', width: round( ridge, 2 ), length: round( ridgeLength, 2 ) } : { material: soil.id, shape: 'cone', volume: round( loose, 1 ) };
		// Out past the right side of the top, or its front, level with the middle of that side.
		const clear = 2 + ( ridge ? ridge / 2 : radius );
		const [ u, v ] = beside ? [ far ? top.u1 + clear : top.u0 - clear, ( top.v0 + top.v1 ) / 2 ] : [ ( top.u0 + top.u1 ) / 2, far ? top.v1 + clear : top.v0 - clear ];
		const at = pitToEnu( pitFrame( entry.state ), u, v );
		const pile = await models.load( {
			kind: STOCKPILE,
			params,
			east: round( at.east, 2 ),
			north: round( at.north, 2 ),
			heading: beside ? heading : ( heading + 90 ) % 360,
			up: null,
		} );
		pour( pile );
		sidebar.select( pile );
		return pile;

	}

	// Where the material drops from, worked out afresh for every rock, so the stream follows the
	// pile when it's moved, turned or changed while it pours.
	function pourSource( entry ) {

		const colour = new Color( pileMaterial( entry ).colour );
		const axis = new Vector3();
		const point = new Vector3();
		return {
			colour,
			emitter: time => {

				const { state, params } = entry;
				const material = pileMaterial( entry );
				const tan = Math.tan( material.repose * DEG );
				const base = designs.get( entry )?.solved?.base ?? state.up;
				const cap = params.maxHeight > 0 ? params.maxHeight : Infinity;
				const height = params.shape === 'cone' ? coneRadius( params.volume, tan ) * tan : Math.min( Math.min( params.width, params.length ) / 2 * tan, cap );
				// Along a ridge the drop point sweeps back and forth, like a moving conveyor.
				const rad = state.heading * DEG;
				if ( params.length >= params.width ) axis.set( - Math.sin( rad ), 0, Math.cos( rad ) );
				else axis.set( - Math.cos( rad ), 0, - Math.sin( rad ) );
				const sweep = params.shape === 'ridge' ? Math.abs( params.length - params.width ) / 2 : 0;
				colour.set( material.colour );
				return point.set( - state.east, base + height + 3, state.north ).addScaledVector( axis, sweep * Math.sin( time * 1.3 ) );

			},
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

	// Trench boxes, sheet piles... drawn in pits that have them (after the listeners above, so
	// their rims are up to date).
	setUpShoring( { scene, models, terrain, layers, kind: EXCAVATION, rimOf: entry => designs.get( entry )?.rim } );
	// The section view and quantities, after the shoring, which they show cut away.
	setUpSection( { scene, camera, renderer, canvas, controls, models, terrain, layers, panel, onUpdate, toast, kind: EXCAVATION, designs, rimOf: entry => designs.get( entry )?.rim, getSelected: () => sidebar.getSelected?.() } );

	// For tests and for other features (the excavator) to build on.
	if ( window.twin ) Object.assign( window.twin, { terrain, earthworks: { dig, pour, spoil, designs, anims, labels, stream } } );
	return { terrain, dig, pour, spoil };

}

// --- designs: what an excavation or a stockpile does to the ground ----------------------------

// floorUnder( frame ): the floor of the flatten areas reaching into a rectangle (Infinity if none).
// The surface is the design's (excavation-design.js depthAt): each side sloped, benched or cut
// vertical, as deep as the dig stage shown, and p (0..1) of that while the dig animation plays.
// For pits saved before sides had methods it is exactly the surface they had.
function pitDesign( entry, { order, progress, floorUnder } ) {

	const g = {};
	return {
		type: 'cut',
		top: CUT,
		order,
		refresh() {

			const { state, params } = entry;
			const design = planExcavation( params );
			g.frame = pitFrame( state );
			g.stage = design.stage;
			// While rakers wait to go in, a berm is left against their walls.
			g.geom = geometryAtStage( design.geom, design.plan, design.stage );
			g.final = design.geom;
			// Round the top of the cut: the rectangle itself for a pit drawn by its top, and wider
			// than the floor for one drawn by its floor, by the larger of each pair of sides.
			const { hw, hl, margin } = cutBounds( design.geom );
			g.rect = rectFrame( state.east, state.north, state.heading, hw, hl );
			g.margin = margin;
			// Inside a flatten area the ground is the area's floor, which is what the terrain digs
			// into there; from the original ground (the roofs of what was cleared, say) the pit
			// would be too shallow to reach it.
			const around = rectFrame( state.east, state.north, state.heading, hw + RIM_REACH, hl + RIM_REACH );
			g.rim = Math.min( state.up, floorUnder( around ) );

		},
		get rim() {

			return g.rim;

		},
		// The pit's frame, its geometry as dug at the stage shown, finished, and that stage.
		get frame() {

			return g.frame;

		},
		get geom() {

			return g.geom;

		},
		get final() {

			return g.final;

		},
		get stage() {

			return g.stage;

		},
		bounds: () => rectBounds( g.rect, g.margin ),
		// Infinity (the rim less -Infinity) where it isn't cut at all.
		height: ( x, z ) => {

			const [ u, v ] = toPit( g.frame, x, z );
			return g.rim - depthAt( g.geom, u, v, g.stage.dig * progress( entry ) );

		},
		heightFinal: ( x, z ) => {

			const [ u, v ] = toPit( g.frame, x, z );
			return g.rim - depthAt( g.final, u, v, g.final.depth );

		},
	};

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

// What a ridge `width` x `length` holds at the angle whose tangent is `tan`: a hip roof,
// tan W² (3L - W) / 12.
function ridgeVolume( width, length, tan ) {

	return tan * width * width * ( 3 * length - width ) / 12;

}

// The width of a ridge `length` long holding `volume` at the angle whose tangent is `tan`, or
// null if it would have to be wider than long.
function ridgeWidth( volume, length, tan ) {

	if ( ridgeVolume( length, length, tan ) < volume ) return null;
	let lo = 0;
	let hi = length;
	for ( let i = 0; i < 50; i ++ ) {

		const mid = ( lo + hi ) / 2;
		if ( ridgeVolume( mid, length, tan ) < volume ) lo = mid;
		else hi = mid;

	}

	return hi;

}

// --- params -----------------------------------------------------------------------------------

// An excavation's design, worked out once for each set of params (excavation-design.js).
const designOf = params => planExcavation( params );
const sidesWhere = ( params, test ) => designOf( params ).geom.sides.some( test );
const anySloped = params => sidesWhere( params, side => side.method === 'slope' );
const anyBenched = params => sidesWhere( params, side => side.method === 'bench' );
const anyWall = params => designOf( params ).plan.walls.length > 0;
const levelTypes = params => Object.values( designOf( params ).plan.sideTypes );
// A pit that still has the first shoring's single waler (a layout saved before support levels).
const classic = params => params.bracing === 'classic' && params.method === 'shore' && ( params.support === 'sheet-piles' || params.support === 'soldier-piles' );
const stagesOf = params => designOf( params ).stages;

// The P panel, in this order: the size (also in the toolbar's Size editor), what the rectangle
// is, how the sides are cut (all alike, or each side its own way in a sub-folder, named by which
// way each faces), then what that way needs: the shoring system, the soil and slope, the benches,
// the support levels for walls, the groundwater, and the dig stage shown.
const PIT_FIELDS = [
	{ key: 'width', label: 'width (m)', min: 1, step: 0.5, size: true },
	{ key: 'length', label: 'length (m)', min: 1, step: 0.5, size: true },
	{ key: 'depth', label: 'depth (m)', min: 0.1, step: 0.1, size: true },
	{ key: 'outline', label: 'the rectangle is', options: OUTLINES },
	// Sloped and shored follow the support, so picking one sets that too.
	{ key: 'method', label: 'sides', options: METHODS, patch: methodPatch },
	...[ 1, 2, 3, 4 ].map( n => ( {
		key: `side${ n }`,
		label: ( params, entry ) => sideLabel( entry.state.heading, n ),
		options: SIDE_METHODS,
		group: 'each side',
		when: params => params.method === 'sides',
	} ) ),
	{ key: 'support', label: 'system', options: SYSTEM_OPTIONS, when: params => params.method === 'shore' },
	{ key: 'ends', label: 'ends', options: ENDS, when: params => params.method === 'shore' && ( params.support === 'trench-box' || params.support === 'hydraulic' ) },
	{ key: 'soil', label: 'soil (WorkSafeBC)', options: SOIL_OPTIONS },
	// The slope in use, whichever way it's set.
	{ key: 'slopeBy', label: params => `slope (${ ratio( slopeOf( params ) ) })`, options: SLOPE_FROM, when: anySloped },
	{ key: 'slope', label: 'slope (h : v)', min: 0, max: 4, step: 0.05, when: params => anySloped( params ) && params.slopeBy === 'custom' },
	// 0 works them out (risers up to 1.2 m, benches 1.5 times as wide): the label says what to.
	{ key: 'benchHeight', label: params => autoLabel( 'bench height', params.benchHeight, benchOf( params )?.rise ), min: 0, step: 0.1, when: anyBenched },
	{ key: 'benchWidth', label: params => autoLabel( 'bench width', params.benchWidth, benchOf( params )?.benchWidth ), min: 0, step: 0.1, when: anyBenched },
	{ key: 'bracing', label: 'support levels', options: CLASSIC_OPTIONS, when: params => anyWall( params ) && classic( params ) },
	// 'classic' anywhere else is worked out as suggested, so it shows as that.
	{ key: 'bracing', label: 'support levels', options: LEVEL_OPTIONS, get: params => params.bracing === 'classic' ? 'auto' : params.bracing, when: params => anyWall( params ) && ! classic( params ) },
	// Blank for the suggested levels, which show greyed in the box.
	{ key: 'levels', label: 'levels (m down)', type: 'text', placeholder: params => designOf( params ).plan.levels.map( z => String( z ) ).join( ', ' ), when: params => anyWall( params ) && ! [ 'none', 'classic' ].includes( designOf( params ).plan.type ) },
	// A pit from before keeps the toe its first shoring worked out.
	{ key: 'toe', label: params => autoLabel( 'embedment', params.toe, designOf( params ).plan.toe ), min: 0, step: 0.5, when: params => anyWall( params ) && ! classic( params ) },
	{ key: 'rakerAngle', label: 'raker angle (°)', min: 30, max: 60, step: 1, when: params => levelTypes( params ).includes( 'rakers' ) },
	{ key: 'anchorAngle', label: 'tieback angle (° down)', min: 10, max: 45, step: 1, when: params => levelTypes( params ).includes( 'tiebacks' ) },
	{ key: 'bondLength', label: 'bond length (m)', min: 4.5, max: 12, step: 0.5, when: params => levelTypes( params ).includes( 'tiebacks' ) },
	{ key: 'groundwater', label: 'groundwater (m down)', min: 0, step: 0.1 },
	// Counted from 1, as the stage readout and the section count them. The finished pit is saved as
	// -1 and shown as the last step, so it stays finished when the stages change (another level, a
	// deeper floor). A pit with just before and after has no slider: the Show panel's Before /
	// After shows that.
	{
		key: 'stage',
		label: params => designOf( params ).stage.index === stagesOf( params ).length - 1 ? 'dig stage (finished)' : `dig stage (of ${ stagesOf( params ).length })`,
		min: 1,
		max: params => stagesOf( params ).length,
		step: 1,
		get: params => designOf( params ).stage.index + 1,
		patch: ( value, params ) => {

			const step = Math.round( value ) - 1;
			return { stage: step >= stagesOf( params ).length - 1 ? - 1 : step };

		},
		when: params => stagesOf( params ).length > 2,
	},
];

// The floor, or how deep the sides meet when they do before the floor. Rounded to a micrometre
// first, so the figure is the one the first excavations worked out the other way round.
function floorText( params ) {

	const shape = outlines( designOf( params ).geom );
	const metres = value => ( Math.round( value * 1e6 ) / 1e6 ).toFixed( 1 );
	if ( shape.floorSize ) return `${ metres( shape.floorSize.width ) } × ${ metres( shape.floorSize.length ) } m`;
	return `none: the sides meet ${ metres( shape.meets ) } m down`;

}

// The top's size and area (the pit's footprint).
function topText( params ) {

	const { topSize } = outlines( designOf( params ).geom );
	const area = topSize.width * topSize.length;
	return `${ topSize.width.toFixed( 1 ) } × ${ topSize.length.toFixed( 1 ) } m, ${ area >= 100 ? Math.round( area ).toLocaleString( 'en-CA' ) : area.toFixed( 1 ) } m²`;

}

// A field where 0 works the value out: what it works out to while it's 0.
function autoLabel( name, value, auto ) {

	return value > 0 || ! Number.isFinite( auto ) ? `${ name } (m, 0 = auto)` : `${ name } (0 = ${ Math.round( auto * 100 ) / 100 } m)`;

}

// The risers and benches stepped sides are cut to (all stepped sides alike).
function benchOf( params ) {

	return designOf( params ).geom.sides.find( side => side.method === 'bench' );

}

// The dig stage shown, unless the pit is finished.
function stageText( params ) {

	const { stages, stage } = designOf( params );
	return stage.index === stages.length - 1 ? '' : `${ stage.index + 1 } of ${ stages.length }: ${ stage.label }`;

}

// Beside the handle while resizing: the rectangle (the floor, and then the top, for a pit drawn by
// its floor), the depth and the cut from flat ground.
function resizeText( params ) {

	const { geom } = designOf( params );
	const cut = `${ params.depth.toFixed( 1 ) } m deep · ≈ ${ format( cutVolume( geom ) ) } m³ cut`;
	if ( params.outline !== 'floor' ) return `${ footprintText( params ) } · ${ cut }`;
	return `floor ${ footprintText( params ) } · top ${ footprintText( outlines( geom ).topSize ) } · ${ cut }`;

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

const isCone = params => params.shape === 'cone';
const isRidge = params => params.shape === 'ridge';
const reposeTan = params => Math.tan( ( findMaterial( params.material ) ?? MATERIALS[ 0 ] ).repose * DEG );
const footprintText = ( { width, length } ) => `${ width.toFixed( 1 ) } × ${ length.toFixed( 1 ) } m`;

// What a ridge filling width x length holds on flat ground, flat on top at `cap` (0 = none): the
// whole hip roof less the smaller one above the cap.
function ridgeHolds( width, length, tan, cap ) {

	const [ w, l ] = width <= length ? [ width, length ] : [ length, width ];
	const full = ridgeVolume( w, l, tan );
	if ( ! ( cap > 0 ) || cap >= w / 2 * tan ) return full;
	const inset = 2 * cap / tan;
	return full - ridgeVolume( w - inset, l - inset, tan );

}

function baseSize( entry, solved ) {

	const { params } = entry;
	if ( params.shape === 'ridge' ) return `${ params.width.toFixed( 1 ) } × ${ params.length.toFixed( 1 ) } m`;
	const tan = Math.tan( pileMaterial( entry ).repose * DEG );
	const height = solved ? solved.top - solved.base : 0;
	return `⌀ ${ ( 2 * height / tan ).toFixed( 1 ) } m`;

}

// --- build mode markers -----------------------------------------------------------------------

// The outline of the top of the cut and a see-through cap, to click and drag it by. A pit drawn by
// its floor has its floor outlined too, dashed; its top is round the floor, off centre when its
// sides differ. A pit drawn by its top (as all were before) has the marker it always had, so its
// footprint, and with it the ground it snaps to and its handles, are the same.
function buildPitMarker( params ) {

	const { width, length } = params;
	const group = new Group();
	group.name = 'Excavation';
	let top = { u0: - width / 2, u1: width / 2, v0: - length / 2, v1: length / 2 };
	let floor = null;
	if ( params.outline === 'floor' ) {

		top = outlines( designOf( params ).geom ).top;
		floor = new LineLoop( rectangle( width, length ), floorLine );
		floor.computeLineDistances();
		floor.position.y = 0.06;

	}

	// The marker's frame: x to the pit's right (u), -z to its front (v).
	const [ w, l ] = [ top.u1 - top.u0, top.v1 - top.v0 ];
	const [ x, z ] = [ ( top.u0 + top.u1 ) / 2, - ( top.v0 + top.v1 ) / 2 ];
	const cap = new Mesh( new PlaneGeometry( w, l ).rotateX( - Math.PI / 2 ), capMaterial );
	cap.position.set( x, 0.04, z );
	cap.renderOrder = 1;
	const outline = new LineLoop( rectangle( w, l ), pitLine );
	outline.position.set( x, 0.06, z );
	const objects = [ cap, outline, floor ].filter( Boolean );
	for ( const object of objects ) object.userData.noCollide = true;
	for ( const line of [ outline, floor ] ) if ( line ) line.raycast = () => {};
	group.add( ...objects );
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

// Small labels over excavations and stockpiles, shown in build mode, except over hidden ones. A
// pit's side numbers are chips of their own (not .label, so the Labels layer counts one label a
// pit), shown while showsSides( entry ), at their sides rather than moved up out of each other's
// way, and hidden with the Labels layer like the rest.
function createLabels( { camera, canvas, models, showsSides } ) {

	const root = document.createElement( 'div' );
	root.className = 'earthworks-labels';
	document.body.append( root );
	const items = new Map(); // entry -> { element, anchor }
	const sideItems = new Map(); // entry -> [ { element, anchor } ]
	const projected = new Vector3();
	const onScreen = ( anchor, rect ) => {

		projected.copy( anchor ).project( camera );
		if ( ! ( projected.z < 1 && Math.abs( projected.x ) < 1.05 && Math.abs( projected.y ) < 1.05 && camera.position.distanceTo( anchor ) < 1000 ) ) return null;
		return { x: rect.left + ( projected.x + 1 ) / 2 * rect.width, y: rect.top + ( 1 - projected.y ) / 2 * rect.height, depth: projected.z };

	};

	return {

		// A pit's side numbers: [ { text, anchor } ] in the order of its sides.
		sides( entry, list ) {

			let chips = sideItems.get( entry );
			if ( ! chips ) {

				chips = list.map( () => {

					const element = document.createElement( 'div' );
					element.className = 'side-label';
					element.hidden = true;
					root.append( element );
					return { element, anchor: new Vector3() };

				} );
				sideItems.set( entry, chips );

			}

			list.forEach( ( { text, anchor }, i ) => {

				if ( chips[ i ].element.textContent !== text ) chips[ i ].element.textContent = text;
				chips[ i ].anchor.copy( anchor );

			} );

		},

		// What a pit's side chips say now, shown or not ([] if it has none).
		sideTexts: entry => ( sideItems.get( entry ) ?? [] ).map( chip => ( { text: chip.element.textContent, shown: ! chip.element.hidden } ) ),

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
			for ( const chip of sideItems.get( entry ) ?? [] ) chip.element.remove();
			sideItems.delete( entry );

		},

		update() {

			root.hidden = ! models.buildMode;
			if ( root.hidden ) return;
			const rect = canvas.getBoundingClientRect();
			for ( const [ entry, chips ] of sideItems ) {

				const wanted = ! models.isHidden( entry ) && showsSides( entry );
				for ( const { element, anchor } of chips ) {

					const at = wanted ? onScreen( anchor, rect ) : null;
					if ( element.hidden !== ! at ) element.hidden = ! at;
					if ( at ) element.style.transform = `translate( ${ at.x.toFixed( 1 ) }px, ${ at.y.toFixed( 1 ) }px ) translate( -50%, -100% )`;

				}

			}

			const shown = [];
			for ( const [ entry, { element, anchor } ] of items ) {

				const at = models.isHidden( entry ) ? null : onScreen( anchor, rect );
				element.hidden = ! at;
				if ( ! at ) continue;
				shown.push( {
					element,
					...at,
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
