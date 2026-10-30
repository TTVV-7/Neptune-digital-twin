import { Box3, BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, Raycaster, SphereGeometry, Vector3 } from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { registerKind } from './kinds.js';
import { biasDepth } from './laydown.js';
import { passesHitFilters } from './walk.js';
import { across, BLACK, box, cabin, DARK, hookBlock, mat, memberGeometry, merged, paint, rod, STEEL } from './plant-parts.js';

// A hammerhead tower crane, placed from the library (Cranes & lifts) and set up in the P panel:
// height under hook and jib length (its working radius) rebuild it, and the trolley's radius and
// the hook's height pose it. A lattice mast on its foundation, the slewing unit with the cab, a
// tower head with ties to the jib and counter-jib, counterweights, the hoist winch, and the trolley
// with the hook block on its ropes. Heading is where the jib points.
//
// The reach circle (on by default, a checkbox in the P panel) is drawn on the ground round the
// mast at the working radius, with a fainter ring at the counter-jib's tail swing, for planning
// lifts: what it can reach, and what it would swing over. It drapes over the ground like a
// laydown area, but doesn't count in the crane's size: the selection box, the handles and
// snapping to the ground all go by the crane itself.

export const TOWER_CRANE = 'tower-crane';
export const TOWER_CRANE_DEFAULTS = { height: 40, jib: 50, radius: 30, hook: 15, reach: true };

const YELLOW = 0xf4c20d;
const REACH_COLOUR = '#ff8a1f';
// Draped this many points round the ring, and as a fan of this many rings for the fill.
const RING_POINTS = 128;
const FILL_RINGS = 6;
const FILL_LIFT = 0.06;
const LINE_LIFT = 0.12;
// Draped again this soon after a move, and checked this often in case the ground changed under it
// (sharper tiles streaming in, flattening, digging).
const MOVE_INTERVAL = 0.15;
const CHECK_INTERVAL = 1.5;

const DOWN = new Vector3( 0, - 1, 0 );
const _point = new Vector3();
const _toLocal = new Matrix4();
const _bounds = new Box3();
const _box = new Box3();
// Ground meshes' vertices -> their version when the mesh's box was last worked out (see laydown.js).
const measured = new WeakMap();

registerKind( TOWER_CRANE, {
	label: 'Tower crane',
	build: buildTowerCrane,
	normalize: normalizeTowerCrane,
	fields: [
		{ key: 'height', label: 'height under hook (m)', min: 10, max: 90, step: 0.5, size: true },
		{ key: 'jib', label: 'jib: working radius (m)', min: 20, max: 80, step: 0.5, size: true },
		{ key: 'radius', label: 'hook radius (m)', min: 3, max: 80, step: 0.5 },
		{ key: 'hook', label: 'hook height (m)', min: 1, max: 90, step: 0.5 },
		{ key: 'reach', label: 'reach circle' },
	],
	readouts: [
		{ label: 'reach area', get: ( { params } ) => `${ format( Math.PI * params.jib ** 2 ) } m² (radius ${ format( params.jib ) } m)` },
		{ label: 'tail swing', get: ( { params } ) => `${ format( shape( params ).counterJib ) } m` },
		{ label: 'overall height', get: ( { params } ) => `${ format( shape( params ).top ) } m` },
	],
} );

function normalizeTowerCrane( p ) {

	const number = ( v, fallback, min, max ) => Math.min( max, Math.max( min, Number.isFinite( Number( v ) ) && v !== null && v !== '' ? Number( v ) : fallback ) );
	const height = number( p.height, TOWER_CRANE_DEFAULTS.height, 10, 90 );
	const jib = number( p.jib, TOWER_CRANE_DEFAULTS.jib, 20, 80 );
	return {
		height,
		jib,
		radius: number( p.radius, Math.min( TOWER_CRANE_DEFAULTS.radius, jib ), 3, jib ),
		hook: number( p.hook, Math.min( TOWER_CRANE_DEFAULTS.hook, height ), 1, height ),
		reach: p.reach === undefined ? TOWER_CRANE_DEFAULTS.reach : !! p.reach,
	};

}

// The crane's main dimensions for these params, in metres. Mast and jib sections get heavier with
// the jib, as real cranes' do; the counter-jib is about a third of the jib, and the tower head
// about a sixth.
function shape( { height, jib } ) {

	const mast = jib <= 45 ? 1.6 : jib <= 65 ? 2.0 : 2.45;
	const jibDepth = mast * 0.9;
	// Underside of the jib: the hook block hauled right up still clears its trolley.
	const jibY = height + 2.5;
	const counterJib = Math.max( 12, Math.round( jib * 0.32 ) );
	const head = Math.max( 6, jib / 6 );
	return { mast, jibDepth, jibY, counterJib, head, slewing: 2.4, top: jibY + jibDepth + head };

}

export function buildTowerCrane( params ) {

	const p = normalizeTowerCrane( params );
	const { mast, jibDepth, jibY, counterJib, head, slewing, top } = shape( p );
	const group = new Group();
	group.name = 'Tower crane';
	const steel = paint( YELLOW );
	const members = [];
	const add = ( section, a, b ) => members.push( memberGeometry( section, a, b ) );

	// Foundation and the anchors the mast stands on.
	const pad = mast + 4.5;
	box( group, mat( 0xb5b3ab, { roughness: 0.95, metalness: 0 } ), [ pad, 0.35, pad ], [ 0, 0, 0 ] );
	for ( const sx of [ - 1, 1 ] ) for ( const sz of [ - 1, 1 ] ) box( group, DARK(), [ 0.4, 0.3, 0.4 ], [ sx * mast / 2, 0.35, sz * mast / 2 ] );

	// Mast: four corner chords with zigzag bracing on each face, in bays about as tall as it is wide.
	const mastTop = jibY - slewing;
	const base = 0.65;
	const bays = Math.max( 1, Math.round( ( mastTop - base ) / ( mast * 1.4 ) ) );
	const bay = ( mastTop - base ) / bays;
	const half = mast / 2;
	const corners = [ [ - half, - half ], [ half, - half ], [ half, half ], [ - half, half ] ];
	for ( const [ x, z ] of corners ) add( [ 0.16, 0.16 ], [ x, base, z ], [ x, mastTop, z ] );
	for ( let i = 0; i < bays; i ++ ) {

		const y0 = base + i * bay;
		for ( let c = 0; c < 4; c ++ ) {

			const [ x0, z0 ] = corners[ c ];
			const [ x1, z1 ] = corners[ ( c + 1 ) % 4 ];
			add( [ 0.08, 0.08 ], [ x0, y0, z0 ], [ x1, y0, z1 ] );
			add( [ 0.07, 0.07 ], i % 2 ? [ x0, y0, z0 ] : [ x1, y0, z1 ], i % 2 ? [ x1, y0 + bay, z1 ] : [ x0, y0 + bay, z0 ] );

		}

	}

	// Slewing unit: the slewing ring on the mast, the turntable and the cab on its front corner.
	box( group, DARK(), [ mast + 0.3, 0.5, mast + 0.3 ], [ 0, mastTop, 0 ] );
	box( group, steel, [ mast + 0.4, slewing - 0.5, mast + 0.4 ], [ 0, mastTop + 0.5, 0 ] );
	cabin( group, mat( 0xeeeeea, { roughness: 0.5, metalness: 0.2 } ), [ 1.4, 2.1, 1.7 ], [ half + 0.95, mastTop + 0.2, - half - 0.2 ], { sill: 0.3 } );

	// Jib: a triangular lattice, two bottom chords and a top chord, out past the working radius.
	const jibStart = - half - 0.2;
	const jibEnd = - ( p.jib + 1.0 );
	const jibHalf = jibDepth * 0.45;
	const jibTop = jibY + jibDepth;
	const panels = Math.max( 2, Math.round( ( jibStart - jibEnd ) / 2.2 ) );
	const panel = ( jibStart - jibEnd ) / panels;
	for ( const x of [ - jibHalf, jibHalf ] ) add( [ 0.14, 0.14 ], [ x, jibY, jibStart ], [ x, jibY, jibEnd ] );
	add( [ 0.14, 0.14 ], [ 0, jibTop, jibStart ], [ 0, jibTop, jibEnd ] );
	for ( let i = 0; i <= panels; i ++ ) {

		const z = jibStart - i * panel;
		add( [ 0.06, 0.06 ], [ - jibHalf, jibY, z ], [ jibHalf, jibY, z ] );
		if ( i === panels ) break;
		const zNext = z - panel;
		for ( const x of [ - jibHalf, jibHalf ] ) {

			add( [ 0.06, 0.06 ], [ x, jibY, z ], [ 0, jibTop, z - panel / 2 ] );
			add( [ 0.06, 0.06 ], [ 0, jibTop, z - panel / 2 ], [ x, jibY, zNext ] );

		}

	}

	// Counter-jib: a flat frame behind, with a walkway, the hoist winch and the counterweights.
	const backStart = half + 0.2;
	const backEnd = counterJib;
	const backHalf = 0.95;
	const backY = jibY + 0.3;
	for ( const x of [ - backHalf, backHalf ] ) add( [ 0.16, 0.24 ], [ x, backY, backStart ], [ x, backY, backEnd ] );
	for ( let z = backStart; z <= backEnd + 0.01; z += 2 ) add( [ 0.08, 0.1 ], [ - backHalf, backY, z ], [ backHalf, backY, z ] );
	for ( const x of [ - backHalf, backHalf ] ) {

		add( [ 0.04, 0.04 ], [ x, backY + 1.0, backStart ], [ x, backY + 1.0, backEnd ] );
		for ( let z = backStart; z <= backEnd + 0.01; z += 2 ) add( [ 0.04, 0.04 ], [ x, backY, z ], [ x, backY + 1.0, z ] );

	}

	box( group, mat( 0x8a8f94, { roughness: 0.8, metalness: 0.3 } ), [ backHalf * 2, 0.04, backEnd - backStart ], [ 0, backY + 0.12, ( backStart + backEnd ) / 2 ] );
	box( group, steel, [ 1.5, 1.1, 1.8 ], [ 0, backY + 0.14, backStart + 2.2 ] );
	across( group, DARK(), 0.45, 1.3, [ 0, backY + 0.75, backStart + 3.6 ], 16 );
	const blocks = Math.min( 7, Math.max( 3, Math.round( p.jib / 12 ) ) );
	const concrete = mat( 0xa9a79f, { roughness: 0.95, metalness: 0 } );
	for ( let i = 0; i < blocks; i ++ ) box( group, concrete, [ 2.3, 2.6, 0.4 ], [ 0, backY - 1.9, backEnd - 0.3 - i * 0.42 ] );

	// Tower head over the slewing unit, with ties to the jib and the counter-jib.
	const apex = [ 0, jibTop + head, 0 ];
	for ( const [ x, z ] of corners ) add( [ 0.14, 0.14 ], [ x * 0.8, jibTop, z * 0.8 ], apex );
	for ( let c = 0; c < 4; c ++ ) {

		const [ x0, z0 ] = corners[ c ];
		const [ x1, z1 ] = corners[ ( c + 1 ) % 4 ];
		add( [ 0.06, 0.06 ], [ x0 * 0.8, jibTop, z0 * 0.8 ], [ x1 * 0.4, jibTop + head * 0.5, z1 * 0.4 ] );

	}

	merged( group, steel, members );

	const tie = STEEL();
	for ( const share of [ 0.42, 0.78 ] ) rod( group, tie, 0.05, apex, [ 0, jibTop, - half - p.jib * share ], 6 );
	for ( const x of [ - backHalf, backHalf ] ) rod( group, tie, 0.05, apex, [ x, backY, backEnd - 0.5 ], 6 );

	// Warning lights on the top, the jib end and the counter-jib end.
	const light = mat( 0xff2a1f, { emissive: 0xff2a1f, emissiveIntensity: 0.9, roughness: 0.3 } );
	for ( const at of [ [ 0, top + 0.15, 0 ], [ 0, jibTop + 0.15, jibEnd ], [ 0, backY + 1.15, backEnd ] ] ) {

		const lamp = new Mesh( new SphereGeometry( 0.15, 10, 8 ), light );
		lamp.position.fromArray( at );
		group.add( lamp );

	}

	// Trolley on the bottom chords at the hook radius, ropes down to the hook block.
	const trolleyZ = - Math.max( half + 2, p.radius );
	box( group, DARK(), [ jibHalf * 2 + 0.3, 0.45, 1.4 ], [ 0, jibY - 0.45, trolleyZ ] );
	const blockTop = Math.min( p.hook + 1.2, jibY - 1.2 );
	for ( const dx of [ - 0.22, 0.22 ] ) rod( group, BLACK(), 0.02, [ dx, jibY - 0.45, trolleyZ ], [ dx, blockTop, trolleyZ ], 6 );
	hookBlock( group, [ 0, blockTop, trolleyZ ], 0.95, YELLOW );

	if ( p.reach ) group.add( reachCircle( p.jib, counterJib ) );
	return group;

}

// --- the reach circle ------------------------------------------------------------------------

// A see-through disc at the working radius with a crisp ring round it, and a fainter ring at the
// tail swing, flat at the crane's base until draping (below) lays them on the ground. Their boxes
// are left empty so they don't count in the crane's size (Box3.setFromObject skips empty boxes).
function reachCircle( radius, tail ) {

	const group = new Group();
	group.name = 'Reach circle';

	// A fan of rings from the middle out: point 0 is the centre, then FILL_RINGS rings of RING_POINTS.
	const positions = new Float32Array( ( 1 + FILL_RINGS * RING_POINTS ) * 3 );
	for ( let ring = 1; ring <= FILL_RINGS; ring ++ ) {

		for ( let i = 0; i < RING_POINTS; i ++ ) {

			const a = i / RING_POINTS * Math.PI * 2;
			const k = 1 + ( ring - 1 ) * RING_POINTS + i;
			positions[ k * 3 ] = Math.cos( a ) * radius * ring / FILL_RINGS;
			positions[ k * 3 + 2 ] = Math.sin( a ) * radius * ring / FILL_RINGS;

		}

	}

	const index = [];
	for ( let i = 0; i < RING_POINTS; i ++ ) index.push( 0, 1 + ( i + 1 ) % RING_POINTS, 1 + i );
	for ( let ring = 1; ring < FILL_RINGS; ring ++ ) {

		const inner = 1 + ( ring - 1 ) * RING_POINTS;
		const outer = inner + RING_POINTS;
		for ( let i = 0; i < RING_POINTS; i ++ ) {

			const j = ( i + 1 ) % RING_POINTS;
			index.push( inner + i, inner + j, outer + i, inner + j, outer + j, outer + i );

		}

	}

	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new BufferAttribute( positions, 3 ) );
	geometry.setIndex( index );
	const fill = new Mesh( geometry, new MeshBasicMaterial( {
		color: REACH_COLOUR,
		transparent: true,
		opacity: 0.12,
		depthWrite: false,
		polygonOffset: true,
		polygonOffsetFactor: - 2,
		polygonOffsetUnits: - 4,
	} ) );
	fill.material.onBeforeCompile = biasDepth;

	const ring = ( r, opacity, width ) => {

		const points = [];
		for ( let i = 0; i <= RING_POINTS; i ++ ) {

			const a = i / RING_POINTS * Math.PI * 2;
			points.push( Math.cos( a ) * r, 0, Math.sin( a ) * r );

		}

		const line = new Line2( new LineGeometry().setPositions( points ), new LineMaterial( { color: REACH_COLOUR, linewidth: width, transparent: true, opacity, depthWrite: false } ) );
		line.material.onBeforeCompile = biasDepth;
		line.renderOrder = 1;
		line.userData.radius = r;
		return line;

	};

	const outline = ring( radius, 1, 3 );
	const tailRing = ring( tail, 0.55, 2 );
	group.add( fill, outline, tailRing );
	for ( const object of [ fill, outline, tailRing ] ) {

		object.userData.noCollide = true;
		emptyBox( object.geometry );

	}

	group.userData.reach = { fill, rings: [ outline, tailRing ], radius };
	return group;

}

function emptyBox( geometry ) {

	geometry.boundingBox = new Box3();

}

// Lays the reach circles of placed tower cranes on the ground, again whenever a crane moves or is
// rebuilt and from time to time as the ground under it changes.
export function setUpTowerCranes( { models, getGround, onUpdate } ) {

	const cranes = new Map(); // entry -> { dirty, checkedAt, content }
	const raycaster = new Raycaster();
	raycaster.firstHitOnly = true;
	let clock = 0;

	const track = entry => {

		if ( entry.kind !== TOWER_CRANE ) return;
		let crane = cranes.get( entry );
		if ( ! crane ) cranes.set( entry, crane = { dirty: true, checkedAt: - Infinity, content: null } );
		const content = entry.pivot.children[ 0 ];
		if ( content !== crane.content ) {

			crane.content = content;
			// The model manager gave every mesh a triangle raycast: the circle isn't to be clicked
			// or walked on, and isn't ground.
			const reach = findReach( content );
			if ( reach ) for ( const object of [ reach.fill, ...reach.rings ] ) object.raycast = () => {};
			drape( entry );
			return;

		}

		crane.dirty = true;

	};

	models.addEventListener( 'add', ( { entry } ) => track( entry ) );
	models.addEventListener( 'change', ( { entry } ) => track( entry ) );
	models.addEventListener( 'remove', ( { entry } ) => cranes.delete( entry ) );

	function drape( entry ) {

		const crane = cranes.get( entry );
		crane.dirty = false;
		crane.checkedAt = clock;
		const reach = findReach( entry.pivot.children[ 0 ] );
		if ( ! reach ) return;
		const { fill, rings } = reach;
		entry.pivot.updateWorldMatrix( true, true );
		_toLocal.copy( fill.matrixWorld ).invert();
		const ground = groundUnder( fill, reach.radius );
		const heightAt = ( x, z ) => {

			fill.localToWorld( _point.set( x, 0, z ) );
			_point.y = ground.top + 1;
			raycaster.set( _point, DOWN );
			const hit = ground.meshes.length > 0 ? raycaster.intersectObjects( ground.meshes, false ).find( passesHitFilters ) : null;
			// No ground there (off the edge of the tiles): level with the crane's base.
			return hit ? _point.copy( hit.point ).applyMatrix4( _toLocal ).y : 0;

		};

		const position = fill.geometry.attributes.position;
		for ( let i = 0; i < position.count; i ++ ) position.setY( i, heightAt( position.getX( i ), position.getZ( i ) ) + FILL_LIFT );
		position.needsUpdate = true;
		fill.geometry.computeBoundingSphere();

		// The outer ring follows the fill's outermost ring; the tail swing ring is sampled itself.
		for ( const line of rings ) {

			const segments = line.geometry.attributes.instanceStart.data;
			const array = segments.array;
			const outer = line.userData.radius === reach.radius;
			for ( let k = 0; k < RING_POINTS; k ++ ) {

				for ( const [ offset, i ] of [ [ 0, k ], [ 3, ( k + 1 ) % RING_POINTS ] ] ) {

					const x = array[ k * 6 + offset ];
					const z = array[ k * 6 + offset + 2 ];
					const y = outer ? position.getY( 1 + ( FILL_RINGS - 1 ) * RING_POINTS + i ) - FILL_LIFT : heightAt( x, z );
					array[ k * 6 + offset + 1 ] = y + LINE_LIFT;

				}

			}

			segments.needsUpdate = true;
			line.geometry.computeBoundingSphere();
			emptyBox( line.geometry );

		}

	}

	// Only the ground meshes under the circle are tested, rather than every tile in view, and the
	// rays start just over the highest of them.
	function groundUnder( fill, radius ) {

		fill.getWorldPosition( _point );
		_bounds.min.set( _point.x - radius, - Infinity, _point.z - radius );
		_bounds.max.set( _point.x + radius, Infinity, _point.z + radius );
		const meshes = [];
		let top = _point.y;
		for ( const root of getGround() ) {

			root.traverseVisible( object => {

				if ( ! object.isMesh || object.userData.noCollide ) return;
				// Measured again whenever the vertices change: earth piled up since would stand above it.
				const { geometry } = object;
				const { position } = geometry.attributes;
				if ( ! geometry.boundingBox || measured.get( position ) !== position.version ) {

					geometry.computeBoundingBox();
					measured.set( position, position.version );

				}

				_box.copy( geometry.boundingBox ).applyMatrix4( object.matrixWorld );
				if ( _box.max.x < _bounds.min.x || _box.min.x > _bounds.max.x || _box.max.z < _bounds.min.z || _box.min.z > _bounds.max.z ) return;
				meshes.push( object );
				top = Math.max( top, _box.max.y );

			} );

		}

		return { meshes, top };

	}

	onUpdate( dt => {

		clock += dt;
		// One crane a frame: a moved one first, else the one checked longest ago if it's due.
		let next = null;
		for ( const [ entry, crane ] of cranes ) {

			if ( ! entry.params?.reach ) continue;
			const due = clock - crane.checkedAt >= ( crane.dirty ? MOVE_INTERVAL : CHECK_INTERVAL );
			if ( due && ( ! next || ( crane.dirty && ! cranes.get( next ).dirty ) || crane.checkedAt < cranes.get( next ).checkedAt ) ) next = entry;

		}

		if ( next ) drape( next );

	} );

	if ( window.twin ) window.twin.towerCranes = { cranes, drape };

}

function findReach( content ) {

	let reach = null;
	content?.traverse( object => reach ??= object.userData.reach ?? null );
	return reach;

}

function format( v ) {

	return Math.round( v ).toLocaleString( 'en-CA' );

}
