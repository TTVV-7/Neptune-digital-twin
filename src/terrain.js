import {
	Box3,
	BufferAttribute,
	BufferGeometry,
	Color,
	DataTexture,
	EventDispatcher,
	Group,
	LinearMipmapLinearFilter,
	LineSegments,
	MathUtils,
	Mesh,
	MeshStandardMaterial,
	Raycaster,
	RepeatWrapping,
	Vector3,
} from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { ShapeMesh, ZONE_ID } from './flatten.js';
import { blocks } from './walk.js';

// The ground you can dig into and pile onto: a heightfield in the scene frame, made only where
// there are earthworks, in square chunks of CELLS x CELLS cells. Per chunk:
//
//   h0       the ground as Google (or the stand-in) made it, from flattening.originalHeight(), so
//            pits don't feed back into their own reference. Under a flatten area it is that
//            area's floor, as that's the ground Google's mesh shows there.
//   dug      freeform digging (the excavator), relative to h0
//   designs  excavations (the lowest of them and the ground wins) and then stockpiles (the
//            highest wins), in the order they were placed
//   loose    freeform dumped material on top of everything, so it lands on pit floors and piles
//
// Each chunk is drawn as one mesh. With Google tiles only what differs from h0 is drawn, so the
// photo texture shows elsewhere, and Google's mesh is pressed under the pits. Without tiles the
// chunks draw their whole surface and the stand-in land leaves gaps for them.
//
// Nodes on chunk edges are stored in both chunks (and corners in four); every write goes to all
// copies, so neighbouring meshes always meet.

export const CELL = 0.5;
const CELLS = 64;
export const CHUNK_SIZE = CELL * CELLS;
const NODES = CELLS + 1;
const COUNT = NODES * NODES;
const CELL_AREA = CELL * CELL;
// A surface this close to the ground counts as untouched.
const DISTURBED = 0.02;
// Google's mesh is pressed this far under a pit, and under the lowest point within PRESS_REACH
// nodes, because its big triangles span the bend between a pit's floor and its walls.
const PRESS_DEPTH = 0.15;
const PRESS_REACH = 2;
// Flatten shapes rework every Google tile under them, so a chunk resubmits at most this often.
const PRESS_INTERVAL = 1;
// Sharper tiles move the ground a little; the change is eased in over this long.
const BLEND_TIME = 0.6;
const RESAMPLE_AFTER = 10;
// Google's tiles are coarser far from the camera, so only nearby chunks are sampled again.
const RESAMPLE_RANGE = 300;
// Freshly dug walls stand up to this steep and slump beyond it, within this reach of the bucket.
const SLUMP_ANGLE = 65;
const SLUMP_REACH = 3;
const SETTLE_TOLERANCE = 0.001;
// Colours and grain fade in over this much height change.
const COLOUR_EASE = 0.25;

// Loose materials: angle of repose (degrees) and loose density (t/m³).
export const MATERIALS = [
	{ id: 'gravel', name: 'Gravel 20 mm', repose: 37, density: 1.6, colour: 0x9a958b },
	{ id: 'sand', name: 'Sand', repose: 33, density: 1.55, colour: 0xc8b083 },
	{ id: 'topsoil', name: 'Topsoil', repose: 35, density: 1.3, colour: 0x4f3e2e },
	{ id: 'soil', name: 'Excavated soil', repose: 34, density: 1.5, colour: 0x7c6650 },
	{ id: 'road-base', name: 'Road base / crushed rock', repose: 38, density: 1.7, colour: 0x8e8a83 },
	{ id: 'riprap', name: 'Riprap', repose: 40, density: 1.6, colour: 0x6f6d67 },
	{ id: 'coal', name: 'Coal', repose: 38, density: 0.85, colour: 0x27272b },
	{ id: 'potash', name: 'Potash', repose: 32, density: 1.1, colour: 0xc58a7b },
];
// Dug soil takes up about this much more room loose than in the ground.
export const SWELL = 1.25;

// What a node's top is made of, for its colour: untouched ground, the face of a cut, or a material.
const GROUND = 0;
export const CUT = 1;
const GROUND_COLOUR = 0x8a8f86;
const CUT_COLOUR = 0x6d5a47;

export function findMaterial( idOrName ) {

	return MATERIALS.find( m => m.id === idOrName || m.name === idOrName ) ?? null;

}

export function materialIndex( material ) {

	return MATERIALS.indexOf( material ) + 2;

}

// Base radius of a cone of `volume` m³ standing at the angle whose tangent is `tan`.
export function coneRadius( volume, tan ) {

	return Math.cbrt( 3 * volume * tan * tan / Math.PI ) / tan;

}

// A rectangle in the scene frame: centre east/north, heading in degrees, half width (across) and
// half length (along the heading). Returns { u, v }: across and along from the centre.
export function rectFrame( east, north, heading, halfWidth, halfLength ) {

	const rad = heading * MathUtils.DEG2RAD;
	return { east, north, sin: Math.sin( rad ), cos: Math.cos( rad ), hw: halfWidth, hl: halfLength };

}

export function rectBounds( r, margin = 0 ) {

	const ex = Math.abs( r.cos ) * ( r.hw + margin ) + Math.abs( r.sin ) * ( r.hl + margin );
	const ez = Math.abs( r.sin ) * ( r.hw + margin ) + Math.abs( r.cos ) * ( r.hl + margin );
	return { minX: - r.east - ex, maxX: - r.east + ex, minZ: r.north - ez, maxZ: r.north + ez };

}

// How far inside the rectangle (x, z) is: positive inside, negative outside.
export function insideRect( r, x, z, hw = r.hw, hl = r.hl ) {

	const de = - x - r.east;
	const dn = z - r.north;
	const u = de * r.cos - dn * r.sin;
	const v = de * r.sin + dn * r.cos;
	return Math.min( hw - Math.abs( u ), hl - Math.abs( v ) );

}

const _colour = new Color();

// The nodes of a grid `ni` wide reachable from `starts` through nodes where thickness( n ) > 0,
// and their total thickness. Material piled up can't jump over ground in its way, so a pile's
// sides that would come up again in a pit beyond its foot don't count.
export function spread( ni, count, starts, thickness ) {

	const mask = new Uint8Array( count );
	const stack = [];
	let total = 0;
	const visit = n => {

		if ( n < 0 || n >= count || mask[ n ] ) return;
		const t = thickness( n );
		if ( ! ( t > 0 ) ) return;
		mask[ n ] = 1;
		total += t;
		stack.push( n );

	};
	for ( const n of starts ) visit( n );
	while ( stack.length ) {

		const n = stack.pop();
		const i = n % ni;
		if ( i > 0 ) visit( n - 1 );
		if ( i < ni - 1 ) visit( n + 1 );
		visit( n - ni );
		visit( n + ni );

	}

	return { mask, total };

}

const chunkKey = ( cx, cz ) => ( cx + 32768 ) * 65536 + ( cz + 32768 );

// Chunks that hold any node between min and max (edge nodes belong to two chunks).
function chunkRange( min, max ) {

	return [ Math.ceil( min / CHUNK_SIZE ) - 1, Math.floor( max / CHUNK_SIZE ) ];

}

class Chunk {

	constructor( cx, cz ) {

		this.cx = cx;
		this.cz = cz;
		this.key = chunkKey( cx, cz );
		this.i0 = cx * CELLS;
		this.j0 = cz * CELLS;
		this.h0 = new Float32Array( COUNT );
		this.base = new Float32Array( COUNT );
		this.dug = new Float32Array( COUNT );
		this.loose = new Float32Array( COUNT );
		this.looseMat = new Uint8Array( COUNT );
		// After excavations: what digging cuts into. cutFinal: the same with every dig finished.
		this.exc = new Float32Array( COUNT );
		this.cutFinal = new Float32Array( COUNT );
		this.surface = new Float32Array( COUNT );
		this.top = new Uint8Array( COUNT );
		// Which way each cell is split into triangles (see updateMesh).
		this.flip = new Uint8Array( CELLS * CELLS );
		this.contrib = new Map(); // design key -> { cut, fill } m³ over the nodes this chunk owns
		this.ready = false;
		this.cutCount = 0;
		this.sampledLoads = 0;
		this.sampledAt = 0;
		this.fine = null; // a full sampling pass in progress
		this.blend = null; // easing h0 toward newer samples
		this.press = { signature: 0, time: - Infinity, pending: false, set: false };

	}

	x( k ) {

		return ( this.i0 + k % NODES ) * CELL;

	}

	z( k ) {

		return ( this.j0 + Math.floor( k / NODES ) ) * CELL;

	}

	isEmpty() {

		for ( let k = 0; k < COUNT; k ++ ) if ( this.dug[ k ] !== 0 || this.loose[ k ] !== 0 ) return false;
		return true;

	}

}

// Copy layers where two chunks overlap; with ownedOnly just the nodes `from` owns.
function copyOverlap( from, to, layers, ownedOnly = false ) {

	const last = ownedOnly ? CELLS - 1 : CELLS;
	const i0 = Math.max( from.i0, to.i0 );
	const i1 = Math.min( from.i0 + last, to.i0 + CELLS );
	const j0 = Math.max( from.j0, to.j0 );
	const j1 = Math.min( from.j0 + last, to.j0 + CELLS );
	for ( let j = j0; j <= j1; j ++ ) {

		for ( let i = i0; i <= i1; i ++ ) {

			const a = ( j - from.j0 ) * NODES + i - from.i0;
			const b = ( j - to.j0 ) * NODES + i - to.i0;
			for ( const layer of layers ) to[ layer ][ b ] = from[ layer ][ a ];

		}

	}

}

// Local index ranges of a chunk's nodes inside bounds, or null.
function nodeRange( chunk, { minX, maxX, minZ, maxZ } ) {

	const l0 = Math.max( 0, Math.ceil( minX / CELL ) - chunk.i0 );
	const l1 = Math.min( CELLS, Math.floor( maxX / CELL ) - chunk.i0 );
	const m0 = Math.max( 0, Math.ceil( minZ / CELL ) - chunk.j0 );
	const m1 = Math.min( CELLS, Math.floor( maxZ / CELL ) - chunk.j0 );
	return l0 <= l1 && m0 <= m1 ? { l0, l1, m0, m1 } : null;

}

const owns = ( li, lj ) => li < CELLS && lj < CELLS;

// Designs (see setDesign) are { type: 'cut' | 'fill', order() -> number, bounds() -> { minX, maxX,
// minZ, maxZ }, top (what its surface is made of) } and, for cuts, height( x, z ) (Infinity where
// it doesn't cut) and optionally heightFinal( x, z ) once any animation has finished; for fills,
// solve( nodes ) -> Float32Array of top heights, given the grid of nodes in its bounds as
// { ni, nj, count, x, z, before, cellArea }, row by row (before is NaN where there's no ground).
export class Terrain extends EventDispatcher {

	constructor( { tiles, ground, models, flattening, getGround, camera = null } ) {

		super();
		this.tiles = tiles;
		this.camera = camera;
		this.models = models;
		this.flattening = flattening;
		this.getGround = getGround;
		this.group = new Group();
		this.group.name = 'earthworks';
		this.chunks = new Map();
		this.designs = new Map();
		this.dirty = new Set();
		this.clock = 0;
		this.tileLoads = 0;
		this.sampling = [];
		this.collectTimer = 0;
		this.resampleTimer = 0;
		// Set by the owner to save freeform digging (layout.changed).
		this.onFreeformChange = null;

		this.standIn = tiles ? null : takeOverStandIn( ground );
		this.standInChanged = false;
		if ( this.standIn ) {

			// The stand-in land now has gaps under the chunks, so ask it directly.
			models.originalHeight = ( x, z ) => this.standIn.height( x, z );
			this.sample = ( x, z ) => this.standIn.height( x, z );

		} else {

			this.sample = ( x, z ) => flattening.originalHeight( x, z, tiles ? undefined : ground );

		}

		this.material = createSurfaceMaterial( this.standIn?.grid );
		this.palette = [ GROUND_COLOUR, CUT_COLOUR, ...MATERIALS.map( m => m.colour ) ].map( c => new Color( c ) );
		this.raycaster = new Raycaster();
		this.raycaster.firstHitOnly = true;

		// Flatten areas press Google's mesh down to their floor, so that is the ground there.
		this.zones = new Map(); // entry -> { frame, floor, bounds }
		if ( tiles ) {

			tiles.addEventListener( 'load-model', () => this.tileLoads ++ );
			const onZone = ( { entry, type } ) => {

				if ( entry.kind === ZONE_ID && ! entry.placing ) this.updateZone( entry, type === 'remove' );

			};
			for ( const type of [ 'add', 'change', 'remove' ] ) models.addEventListener( type, onZone );

		}

	}

	// --- designs ---------------------------------------------------------------------------

	// Add, update (call again after it changes) or with null remove a design under any key.
	setDesign( key, design ) {

		const old = this.designs.get( key );
		if ( old ) for ( const k of old.chunks ) this.dirty.add( k );
		if ( ! design ) {

			this.designs.delete( key );
			return;

		}

		design.key = key;
		design.volume ??= { cut: 0, fill: 0 };
		design.chunks = new Set( this.ensure( design.bounds() ) );
		for ( const k of design.chunks ) this.dirty.add( k );
		this.designs.set( key, design );

	}

	// A design's shape changed without moving (an animation step).
	touch( key ) {

		const design = this.designs.get( key );
		if ( design ) for ( const k of design.chunks ) this.dirty.add( k );

	}

	// { cut, fill } m³ that a design takes out or adds, as of the last update.
	designVolume( key ) {

		return this.designs.get( key )?.volume ?? { cut: 0, fill: 0 };

	}

	// --- reading the surface ---------------------------------------------------------------

	// Surface height at local (x, z): earthworks where there are any, otherwise the ground below.
	heightAt( x, z ) {

		this.flush();
		const y = this.surfaceAt( x, z );
		if ( y !== null ) return y;
		this.raycaster.set( new Vector3( x, 5000, z ), new Vector3( 0, - 1, 0 ) );
		this.raycaster.far = 10000;
		const hit = this.raycaster.intersectObjects( this.getGround(), true ).find( blocks );
		return hit ? hit.point.y : null;

	}

	// The earthworks surface at local (x, z) on the same triangles the mesh draws, or null outside
	// the chunks. Doesn't wait for pending changes (cheap enough for particles).
	surfaceAt( x, z ) {

		const fi = x / CELL;
		const fj = z / CELL;
		const i = Math.floor( fi );
		const j = Math.floor( fj );
		const chunk = this.owner( i, j );
		if ( ! chunk?.ready ) return null;
		const s = chunk.surface;
		const k = ( j - chunk.j0 ) * NODES + i - chunk.i0;
		const fx = fi - i;
		const fz = fj - j;
		const [ a, b, c, d ] = [ s[ k ], s[ k + 1 ], s[ k + NODES ], s[ k + NODES + 1 ] ];
		if ( chunk.flip[ ( j - chunk.j0 ) * CELLS + i - chunk.i0 ] ) {

			// Split from (x, z) to (x + 1, z + 1).
			if ( fx >= fz ) return a + ( b - a ) * ( fx - fz ) + ( d - a ) * fz;
			return a + ( c - a ) * ( fz - fx ) + ( d - a ) * fx;

		}

		// Split from (x + 1, z) to (x, z + 1).
		if ( fx + fz <= 1 ) return a + ( b - a ) * fx + ( c - a ) * fz;
		return d + ( c - d ) * ( 1 - fx ) + ( b - d ) * ( 1 - fz );

	}

	// Totals in m³ relative to the ground as it was: cut and fill, and the freeform part of it.
	volumes() {

		this.flush();
		const out = { cut: 0, fill: 0, dug: 0, loose: 0 };
		for ( const chunk of this.chunks.values() ) {

			if ( ! chunk.ready ) continue;
			for ( let lj = 0; lj < CELLS; lj ++ ) {

				for ( let li = 0; li < CELLS; li ++ ) {

					const k = lj * NODES + li;
					const d = chunk.surface[ k ] - chunk.base[ k ];
					if ( d > 0 ) out.fill += d;
					else out.cut -= d;
					out.dug -= chunk.dug[ k ];
					out.loose += chunk.loose[ k ];

				}

			}

		}

		for ( const key of Object.keys( out ) ) out[ key ] *= CELL_AREA;
		return out;

	}

	// Whether anything is dug below the ground (which changes how Google's mesh is drawn).
	hasCuts() {

		for ( const chunk of this.chunks.values() ) if ( chunk.cutCount > 0 ) return true;
		return false;

	}

	// --- freeform digging and dumping ------------------------------------------------------

	// Take up to `volume` m³ (bank) from under a bucket at local (x, z): a rectangle `width` across
	// and `length` along `heading` (compass degrees). The bucket skims everything above one level,
	// no deeper than `maxDepth` below the original ground; walls steeper than about 65° then slump
	// into the hole. Loose material and stockpiles are taken first where they lie on top.
	// Returns the bank m³ actually removed.
	dig( { x, z, heading = 0, width = 1, length = 1, volume, maxDepth = 6 } ) {

		if ( ! ( volume > 0 ) ) return 0;
		const frame = rectFrame( - x, z, heading, width / 2, length / 2 );
		const reach = Math.hypot( width, length ) / 2 + SLUMP_REACH;
		const w = this.window( x - reach, x + reach, z - reach, z + reach );
		if ( ! w ) return 0;

		const bite = [];
		for ( let n = 0; n < w.n; n ++ ) if ( insideRect( frame, w.x( n ), w.z( n ) ) >= - 1e-6 ) bite.push( n );
		if ( bite.length === 0 ) bite.push( w.nearest( x, z ) );
		const floors = bite.map( n => w.base[ n ] - maxDepth );
		const removedAbove = level => bite.reduce( ( sum, n, i ) => sum + Math.max( 0, w.surface[ n ] - Math.max( level, floors[ i ] ) ), 0 ) * CELL_AREA;

		let lo = Math.min( ...floors );
		let hi = Math.max( ...bite.map( n => w.surface[ n ] ) );
		const take = Math.min( volume, removedAbove( lo ) );
		if ( take <= 0 ) return 0;
		for ( let i = 0; i < 60; i ++ ) {

			const mid = ( lo + hi ) / 2;
			if ( removedAbove( mid ) > take ) lo = mid;
			else hi = mid;

		}

		const level = hi;
		let removed = 0;
		bite.forEach( ( n, i ) => {

			const amount = w.surface[ n ] - Math.min( w.surface[ n ], Math.max( level, floors[ i ] ) );
			if ( amount > 0 ) {

				w.take( n, amount );
				removed += amount * CELL_AREA;

			}

		} );

		// Only ground that has been dug or dumped on slumps, not steep things in Google's mesh
		// (a container, a wall) or the shored sides of a designed pit.
		const soil = materialIndex( findMaterial( 'soil' ) );
		const worked = n => w.dug[ n ] < 0 || w.loose[ n ] !== 0;
		settle( w, Math.tan( SLUMP_ANGLE * MathUtils.DEG2RAD ), n => w.loose[ n ] > 0 ? w.mat[ n ] : soil, ( a, b ) => worked( a ) || worked( b ) );
		this.commit( w );
		return removed;

	}

	// Dump `volume` m³ of loose `material` (an id or name from MATERIALS) at local (x, z), spread
	// over `radius` metres. It settles at the material's angle of repose on whatever is there.
	// Returns the m³ added, which is all of it.
	deposit( { x, z, volume, material = 'soil', radius = 0.5 } ) {

		if ( ! ( volume > 0 ) ) return 0;
		const mat = findMaterial( material ) ?? findMaterial( 'soil' );
		const id = materialIndex( mat );
		const tan = Math.tan( mat.repose * MathUtils.DEG2RAD );
		let reach = radius + 2 * coneRadius( volume, tan ) + 2;

		// Material poured onto a pile runs down its sides, so the area it ends up on isn't known in
		// advance: start small, and look wider if it reaches the edge.
		for ( let attempt = 0; attempt < 6; attempt ++, reach *= 2 ) {

			const w = this.window( x - reach, x + reach, z - reach, z + reach );
			if ( ! w ) return 0;
			const fits = placeCone( w, x, z, volume, tan, radius, id );
			if ( ( fits && settle( w, tan, n => w.mat[ n ], null ) ) || attempt === 5 ) {

				this.commit( w );
				return volume;

			}

		}

		return 0;

	}

	// Undo all freeform digging and dumping.
	resetFreeform() {

		for ( const chunk of this.chunks.values() ) {

			chunk.dug.fill( 0 );
			chunk.loose.fill( 0 );
			chunk.looseMat.fill( 0 );
			this.dirty.add( chunk.key );

		}

		this.onFreeformChange?.();

	}

	// Freeform digging and dumping, compactly: per chunk, centimetres as Int16 runs in base64.
	saveFreeform() {

		const used = [];
		const chunks = [];
		for ( const chunk of this.chunks.values() ) {

			const dug = new Int16Array( CELLS * CELLS );
			const loose = new Int16Array( CELLS * CELLS );
			const mats = new Int16Array( CELLS * CELLS );
			let any = false;
			for ( let lj = 0; lj < CELLS; lj ++ ) {

				for ( let li = 0; li < CELLS; li ++ ) {

					const k = lj * NODES + li;
					const n = lj * CELLS + li;
					dug[ n ] = toCentimetres( chunk.dug[ k ] );
					loose[ n ] = toCentimetres( chunk.loose[ k ] );
					if ( loose[ n ] !== 0 ) {

						const id = MATERIALS[ chunk.looseMat[ k ] - 2 ]?.id ?? 'soil';
						if ( ! used.includes( id ) ) used.push( id );
						mats[ n ] = used.indexOf( id ) + 1;

					}

					any ||= dug[ n ] !== 0 || loose[ n ] !== 0;

				}

			}

			if ( any ) chunks.push( { c: [ chunk.cx, chunk.cz ], d: encodeRuns( dug ), l: encodeRuns( loose ), m: encodeRuns( mats ) } );

		}

		return chunks.length ? { cell: CELL, size: CELLS, materials: used, chunks } : null;

	}

	// merge (importing a file): keep the deeper digging and the higher dumping of the two.
	loadFreeform( data, { merge = false } = {} ) {

		if ( ! data?.chunks ) return;
		if ( data.cell !== CELL || data.size !== CELLS ) throw new Error( 'saved with a different grid' );
		if ( ! merge ) this.resetFreeform();
		for ( const { c: [ cx, cz ], d, l, m } of data.chunks ) {

			const dug = decodeRuns( d );
			const loose = decodeRuns( l );
			const mats = decodeRuns( m );
			const chunk = this.chunks.get( chunkKey( cx, cz ) ) ?? this.createChunk( cx, cz );
			for ( let lj = 0; lj < CELLS; lj ++ ) {

				for ( let li = 0; li < CELLS; li ++ ) {

					const n = lj * CELLS + li;
					const material = findMaterial( data.materials?.[ mats[ n ] - 1 ] ) ?? findMaterial( 'soil' );
					let dugValue = dug[ n ] / 100;
					let looseValue = loose[ n ] / 100;
					this.forCopies( chunk.i0 + li, chunk.j0 + lj, ( other, k ) => {

						if ( merge ) {

							dugValue = Math.min( dugValue, other.dug[ k ] );
							looseValue = Math.max( looseValue, other.loose[ k ] );

						}

						other.dug[ k ] = dugValue;
						other.loose[ k ] = looseValue;
						if ( looseValue !== 0 ) other.looseMat[ k ] = materialIndex( material );

					} );

				}

			}

		}

		this.onFreeformChange?.();

	}

	// --- per frame -------------------------------------------------------------------------

	update( dt ) {

		this.clock += dt;
		if ( this.tiles ) {

			this.retrySampling();
			this.sampleSome( 3 );
			this.queueResampling( dt );

		}

		this.blendSome( dt );
		this.flush();
		if ( this.tiles ) for ( const chunk of this.chunks.values() ) if ( chunk.press.pending ) this.updatePress( chunk );
		this.collect( dt );
		this.updateStandIn();

	}

	// The stand-in land leaves gaps exactly where chunks are.
	updateStandIn() {

		if ( ! this.standInChanged ) return;
		this.standInChanged = false;
		this.standIn?.rebuild( this.chunks );

	}

	// Bring every changed chunk up to date now.
	flush() {

		if ( this.dirty.size === 0 ) return;
		const keys = this.closure( this.dirty );
		this.dirty.clear();
		const list = [ ...keys ].map( key => this.chunks.get( key ) ).filter( chunk => chunk?.ready );
		if ( list.length === 0 ) return;
		const set = new Set( list );
		const ordered = [ ...this.designs.values() ].sort( ( a, b ) => a.order() - b.order() );
		const chunksOf = design => [ ...design.chunks ].map( key => this.chunks.get( key ) ).filter( chunk => set.has( chunk ) );

		for ( const chunk of list ) this.startCompose( chunk );
		for ( const design of ordered ) if ( design.type === 'cut' ) for ( const chunk of chunksOf( design ) ) this.applyCut( design, chunk );
		for ( const chunk of list ) chunk.exc.set( chunk.surface );
		for ( const design of ordered ) {

			if ( design.type !== 'fill' ) continue;
			const chunks = chunksOf( design );
			if ( chunks.length ) this.applyFill( design, chunks );

		}

		for ( const chunk of list ) this.endCompose( chunk );
		for ( const chunk of list ) this.updateMesh( chunk );
		// Normals along the edges of untouched neighbours depend on these chunks too.
		const edges = new Set();
		for ( const chunk of list ) for ( const other of this.neighbours( chunk ) ) if ( ! set.has( other ) && other.ready ) edges.add( other );
		for ( const chunk of edges ) this.updateMesh( chunk, true );

		const changed = [];
		for ( const design of ordered ) {

			if ( ! chunksOf( design ).length ) continue;
			const volume = { cut: 0, fill: 0 };
			for ( const key of design.chunks ) {

				const part = this.chunks.get( key )?.contrib.get( design.key );
				if ( ! part ) continue;
				volume.cut += part.cut;
				volume.fill += part.fill;

			}

			if ( Math.abs( volume.cut - design.volume.cut ) > 1e-6 || Math.abs( volume.fill - design.volume.fill ) > 1e-6 || design.solved !== design.lastSolved ) changed.push( design.key );
			design.volume = volume;
			design.lastSolved = design.solved;

		}

		this.updateStandIn();
		this.dispatchEvent( { type: 'change', designs: changed, chunks: list.length } );

	}

	// --- composing the surface -------------------------------------------------------------

	// A stockpile sits on everything under it, so all its chunks are worked out together, with
	// those of any pile it shares a chunk with.
	closure( keys ) {

		const set = new Set( keys );
		let grew = true;
		while ( grew ) {

			grew = false;
			for ( const design of this.designs.values() ) {

				if ( design.type !== 'fill' || ! [ ...design.chunks ].some( key => set.has( key ) ) ) continue;
				for ( const key of design.chunks ) {

					if ( set.has( key ) ) continue;
					set.add( key );
					grew = true;

				}

			}

		}

		return set;

	}

	startCompose( chunk ) {

		const { h0, base, dug, surface, cutFinal, top } = chunk;
		base.set( h0 );
		for ( const zone of this.zones.values() ) {

			const range = nodeRange( chunk, zone.bounds );
			if ( ! range ) continue;
			this.forRange( chunk, range, ( k, x, z ) => {

				if ( insideRect( zone.frame, x, z ) >= 0 ) base[ k ] = Math.min( base[ k ], zone.floor );

			} );

		}

		for ( let k = 0; k < COUNT; k ++ ) {

			surface[ k ] = base[ k ] + dug[ k ];
			cutFinal[ k ] = surface[ k ];
			top[ k ] = dug[ k ] < - DISTURBED ? CUT : GROUND;

		}

		chunk.contrib.clear();

	}

	applyCut( design, chunk ) {

		const range = nodeRange( chunk, design.bounds() );
		if ( ! range ) return;
		const { surface, cutFinal, top } = chunk;
		let cut = 0;
		this.forRange( chunk, range, ( k, x, z, owned ) => {

			const h = design.height( x, z );
			if ( h < surface[ k ] ) {

				if ( owned ) cut += surface[ k ] - h;
				surface[ k ] = h;
				top[ k ] = design.top;

			}

			const final = design.heightFinal ? design.heightFinal( x, z ) : h;
			if ( final < cutFinal[ k ] ) cutFinal[ k ] = final;

		} );
		chunk.contrib.set( design.key, { cut: cut * CELL_AREA, fill: 0 } );

	}

	applyFill( design, chunks ) {

		const { minX, maxX, minZ, maxZ } = design.bounds();
		const i0 = Math.ceil( minX / CELL );
		const j0 = Math.ceil( minZ / CELL );
		const ni = Math.floor( maxX / CELL ) - i0 + 1;
		const nj = Math.floor( maxZ / CELL ) - j0 + 1;
		const count = Math.max( 0, ni * nj );
		const nodes = { ni, nj, count, x: new Float32Array( count ), z: new Float32Array( count ), before: new Float32Array( count ), cellArea: CELL_AREA };
		const set = new Set( chunks );
		for ( let n = 0; n < count; n ++ ) {

			const i = i0 + n % ni;
			const j = j0 + Math.floor( n / ni );
			const chunk = this.owner( i, j );
			nodes.x[ n ] = i * CELL;
			nodes.z[ n ] = j * CELL;
			nodes.before[ n ] = set.has( chunk ) ? chunk.surface[ ( j - chunk.j0 ) * NODES + i - chunk.i0 ] : NaN;

		}

		const tops = count ? design.solve( nodes ) : null;
		const fills = new Map( chunks.map( chunk => [ chunk, 0 ] ) );
		for ( let n = 0; tops && n < count; n ++ ) {

			const height = tops[ n ];
			const before = nodes.before[ n ];
			if ( ! ( height > before + 1e-5 ) ) continue;
			const i = i0 + n % ni;
			const j = j0 + Math.floor( n / ni );
			const owner = this.owner( i, j );
			fills.set( owner, fills.get( owner ) + height - before );
			this.forCopies( i, j, ( chunk, k ) => {

				if ( ! set.has( chunk ) ) return;
				chunk.surface[ k ] = height;
				chunk.top[ k ] = design.top;

			} );

		}

		for ( const [ chunk, fill ] of fills ) chunk.contrib.set( design.key, { cut: 0, fill: fill * CELL_AREA } );

	}

	endCompose( chunk ) {

		const { surface, loose, looseMat, top, base } = chunk;
		let cuts = 0;
		for ( let k = 0; k < COUNT; k ++ ) {

			if ( loose[ k ] !== 0 ) {

				surface[ k ] += loose[ k ];
				if ( loose[ k ] > DISTURBED / 2 ) top[ k ] = looseMat[ k ];

			}

			if ( surface[ k ] < base[ k ] - DISTURBED && owns( k % NODES, Math.floor( k / NODES ) ) ) cuts ++;

		}

		chunk.cutCount = cuts;
		chunk.press.pending = true;

	}

	forRange( chunk, { l0, l1, m0, m1 }, fn ) {

		for ( let lj = m0; lj <= m1; lj ++ ) {

			const z = ( chunk.j0 + lj ) * CELL;
			for ( let li = l0; li <= l1; li ++ ) fn( lj * NODES + li, ( chunk.i0 + li ) * CELL, z, owns( li, lj ) );

		}

	}

	// --- chunks ----------------------------------------------------------------------------

	// Make sure chunks exist over bounds; returns their keys.
	ensure( { minX, maxX, minZ, maxZ } ) {

		const [ cx0, cx1 ] = chunkRange( minX, maxX );
		const [ cz0, cz1 ] = chunkRange( minZ, maxZ );
		const keys = [];
		for ( let cz = cz0; cz <= cz1; cz ++ ) {

			for ( let cx = cx0; cx <= cx1; cx ++ ) keys.push( ( this.chunks.get( chunkKey( cx, cz ) ) ?? this.createChunk( cx, cz ) ).key );

		}

		return keys;

	}

	createChunk( cx, cz ) {

		const chunk = new Chunk( cx, cz );
		this.chunks.set( chunk.key, chunk );
		this.sampleChunk( chunk );
		// Edge nodes may already be known to a neighbour, including digging done there.
		for ( const other of this.neighbours( chunk ) ) copyOverlap( other, chunk, other.ready ? [ 'h0', 'dug', 'loose', 'looseMat' ] : [ 'dug', 'loose', 'looseMat' ] );
		chunk.mesh = this.createMesh( chunk );
		this.group.add( chunk.mesh );
		this.dirty.add( chunk.key );
		this.standInChanged = true;
		return chunk;

	}

	removeChunk( chunk ) {

		this.group.remove( chunk.mesh );
		chunk.mesh.geometry.dispose();
		chunk.mesh.collider.dispose();
		if ( chunk.press.set ) this.flattening.setShape( `terrain-${ chunk.key }`, null );
		this.chunks.delete( chunk.key );
		this.dirty.delete( chunk.key );
		this.standInChanged = true;

	}

	// Drop chunks nothing uses any more, so the ground is Google's (or the stand-in's) again.
	collect( dt ) {

		this.collectTimer -= dt;
		if ( this.collectTimer > 0 ) return;
		this.collectTimer = 2;
		const used = new Set();
		for ( const design of this.designs.values() ) for ( const key of design.chunks ) used.add( key );
		for ( const chunk of [ ...this.chunks.values() ] ) {

			if ( used.has( chunk.key ) || chunk.fine || chunk.blend || this.dirty.has( chunk.key ) || ! chunk.isEmpty() ) continue;
			this.removeChunk( chunk );

		}

	}

	neighbours( chunk ) {

		const out = [];
		for ( let dz = - 1; dz <= 1; dz ++ ) {

			for ( let dx = - 1; dx <= 1; dx ++ ) {

				const other = ( dx || dz ) && this.chunks.get( chunkKey( chunk.cx + dx, chunk.cz + dz ) );
				if ( other ) out.push( other );

			}

		}

		return out;

	}

	// The chunk that owns global node (i, j).
	owner( i, j ) {

		return this.chunks.get( chunkKey( Math.floor( i / CELLS ), Math.floor( j / CELLS ) ) ) ?? null;

	}

	// Every stored copy of node (i, j): fn( chunk, k ).
	forCopies( i, j, fn ) {

		const cx = Math.floor( i / CELLS );
		const cz = Math.floor( j / CELLS );
		const li = i - cx * CELLS;
		const lj = j - cz * CELLS;
		const visit = ( x, z, a, b ) => {

			const chunk = this.chunks.get( chunkKey( x, z ) );
			if ( chunk ) fn( chunk, b * NODES + a );

		};
		visit( cx, cz, li, lj );
		if ( li === 0 ) visit( cx - 1, cz, CELLS, lj );
		if ( lj === 0 ) visit( cx, cz - 1, li, CELLS );
		if ( li === 0 && lj === 0 ) visit( cx - 1, cz - 1, CELLS, CELLS );

	}

	// --- the original ground ---------------------------------------------------------------

	sampleChunk( chunk ) {

		const { h0 } = chunk;
		if ( ! this.tiles ) {

			for ( let k = 0; k < COUNT; k ++ ) h0[ k ] = this.sample( chunk.x( k ), chunk.z( k ) ) ?? 0;
			chunk.ready = true;
			return;

		}

		// Google's tiles are raycast, which is slow: every fourth node now, the rest over the next
		// frames (sampleSome), eased in.
		const STRIDE = 4;
		const side = CELLS / STRIDE + 1;
		const coarse = new Float32Array( side * side );
		let sum = 0;
		let valid = 0;
		for ( let b = 0; b < side; b ++ ) {

			for ( let a = 0; a < side; a ++ ) {

				const y = this.sample( ( chunk.i0 + a * STRIDE ) * CELL, ( chunk.j0 + b * STRIDE ) * CELL );
				coarse[ b * side + a ] = y ?? NaN;
				if ( y !== null ) {

					sum += y;
					valid ++;

				}

			}

		}

		if ( valid === 0 ) return;
		const mean = sum / valid;
		for ( let n = 0; n < coarse.length; n ++ ) if ( Number.isNaN( coarse[ n ] ) ) coarse[ n ] = mean;
		for ( let lj = 0; lj < NODES; lj ++ ) {

			for ( let li = 0; li < NODES; li ++ ) {

				const a = Math.min( side - 2, Math.floor( li / STRIDE ) );
				const b = Math.min( side - 2, Math.floor( lj / STRIDE ) );
				const fx = li / STRIDE - a;
				const fz = lj / STRIDE - b;
				const c = coarse;
				h0[ lj * NODES + li ] = ( c[ b * side + a ] * ( 1 - fx ) + c[ b * side + a + 1 ] * fx ) * ( 1 - fz ) +
					( c[ ( b + 1 ) * side + a ] * ( 1 - fx ) + c[ ( b + 1 ) * side + a + 1 ] * fx ) * fz;

			}

		}

		chunk.ready = true;
		chunk.sampledLoads = this.tileLoads;
		chunk.sampledAt = this.clock;
		if ( ! this.sampling.includes( chunk ) ) this.sampling.push( chunk );

	}

	// Chunks made before any tiles had loaded try again.
	retrySampling() {

		for ( const chunk of this.chunks.values() ) {

			if ( chunk.ready || this.clock - chunk.sampledAt < 1 ) continue;
			chunk.sampledAt = this.clock;
			this.sampleChunk( chunk );
			if ( ! chunk.ready ) continue;
			for ( const other of this.neighbours( chunk ) ) if ( other.ready ) copyOverlap( other, chunk, [ 'h0' ] );
			this.dirty.add( chunk.key );

		}

	}

	// Sample the full grid of waiting chunks for up to `budget` ms.
	sampleSome( budget ) {

		const end = performance.now() + budget;
		while ( this.sampling.length && performance.now() < end ) {

			const chunk = this.sampling[ 0 ];
			if ( this.chunks.get( chunk.key ) !== chunk ) {

				this.sampling.shift();
				continue;

			}

			if ( ! chunk.fine ) chunk.fine = { values: new Float32Array( COUNT ), next: 0 };
			const fine = chunk.fine;
			for ( let n = 0; n < 8 && fine.next < COUNT; n ++, fine.next ++ ) {

				const k = fine.next;
				fine.values[ k ] = this.sample( chunk.x( k ), chunk.z( k ) ) ?? chunk.h0[ k ];

			}

			if ( fine.next < COUNT ) continue;
			this.sampling.shift();
			chunk.fine = null;
			chunk.sampledLoads = this.tileLoads;
			chunk.sampledAt = this.clock;
			let change = 0;
			for ( let k = 0; k < COUNT; k ++ ) change = Math.max( change, Math.abs( fine.values[ k ] - chunk.h0[ k ] ) );
			if ( change > 0.005 ) chunk.blend = { from: chunk.h0.slice(), to: fine.values, t: 0 };

		}

	}

	// Sharper tiles have loaded since a chunk was sampled: sample it again.
	queueResampling( dt ) {

		this.resampleTimer -= dt;
		if ( this.resampleTimer > 0 ) return;
		this.resampleTimer = 2;
		for ( const chunk of this.chunks.values() ) {

			if ( ! chunk.ready || chunk.blend || this.sampling.includes( chunk ) || ! this.isNear( chunk ) ) continue;
			if ( chunk.sampledLoads !== this.tileLoads && this.clock - chunk.sampledAt > RESAMPLE_AFTER ) this.sampling.push( chunk );

		}

	}

	isNear( chunk ) {

		if ( ! this.camera ) return true;
		const { x, z } = this.camera.position;
		const half = CHUNK_SIZE / 2;
		return Math.hypot( x - ( chunk.i0 * CELL + half ), z - ( chunk.j0 * CELL + half ) ) < RESAMPLE_RANGE;

	}

	blendSome( dt ) {

		for ( const chunk of this.chunks.values() ) {

			const { blend } = chunk;
			if ( ! blend ) continue;
			blend.t = Math.min( 1, blend.t + dt / BLEND_TIME );
			const t = blend.t * blend.t * ( 3 - 2 * blend.t );
			// Only the nodes this chunk owns; its edge copies come from their owners.
			for ( let lj = 0; lj < CELLS; lj ++ ) {

				for ( let li = 0; li < CELLS; li ++ ) {

					const k = lj * NODES + li;
					chunk.h0[ k ] = blend.from[ k ] + ( blend.to[ k ] - blend.from[ k ] ) * t;

				}

			}

			for ( const other of this.neighbours( chunk ) ) {

				copyOverlap( chunk, other, [ 'h0' ], true );
				copyOverlap( other, chunk, [ 'h0' ], true );
				this.dirty.add( other.key );

			}

			this.dirty.add( chunk.key );
			if ( blend.t >= 1 ) chunk.blend = null;

		}

	}

	// Flatten areas count as the ground they press Google's mesh down to.
	updateZone( entry, removed ) {

		const old = this.zones.get( entry );
		if ( old ) this.markBounds( old.bounds );
		if ( removed || ! this.models.entries.includes( entry ) ) {

			this.zones.delete( entry );
			return;

		}

		const { state, params } = entry;
		const frame = rectFrame( state.east, state.north, state.heading, params.width / 2, params.length / 2 );
		const zone = { frame, floor: state.up, bounds: rectBounds( frame, CELL ) };
		this.zones.set( entry, zone );
		this.markBounds( zone.bounds );

	}

	markBounds( bounds ) {

		for ( const chunk of this.chunks.values() ) if ( nodeRange( chunk, bounds ) ) this.dirty.add( chunk.key );

	}

	// --- drawing ---------------------------------------------------------------------------

	createMesh( chunk ) {

		const position = new BufferAttribute( new Float32Array( COUNT * 3 ), 3 );
		for ( let k = 0; k < COUNT; k ++ ) position.setXYZ( k, chunk.x( k ), 0, chunk.z( k ) );
		const geometry = new BufferGeometry();
		geometry.setAttribute( 'position', position );
		geometry.setAttribute( 'normal', new BufferAttribute( new Float32Array( COUNT * 3 ), 3 ) );
		geometry.setAttribute( 'color', new BufferAttribute( new Float32Array( COUNT * 3 ), 3 ) );
		geometry.setAttribute( 'disturbed', new BufferAttribute( new Float32Array( COUNT ), 1 ) );
		geometry.setIndex( new BufferAttribute( new Uint16Array( CELLS * CELLS * 6 ), 1 ) );
		geometry.setDrawRange( 0, 0 );

		// Walking, driving and snapping use every cell, drawn or not.
		const collider = new BufferGeometry();
		collider.setAttribute( 'position', position );
		const all = new Uint16Array( CELLS * CELLS * 6 );
		let n = 0;
		for ( let lj = 0; lj < CELLS; lj ++ ) for ( let li = 0; li < CELLS; li ++ ) n = writeCell( all, n, lj * NODES + li );
		collider.setIndex( new BufferAttribute( all, 1 ) );

		const mesh = new TerrainMesh( geometry, this.material );
		mesh.name = `earthworks ${ chunk.cx },${ chunk.cz }`;
		mesh.collider = collider;
		mesh.visible = false;
		return mesh;

	}

	updateMesh( chunk, normalsOnly = false ) {

		const { mesh, surface, base, top } = chunk;
		const { geometry, collider } = mesh;
		const { position, normal, color, disturbed } = geometry.attributes;
		const height = ( li, lj ) => {

			if ( li >= 0 && li <= CELLS && lj >= 0 && lj <= CELLS ) return surface[ lj * NODES + li ];
			const other = this.owner( chunk.i0 + li, chunk.j0 + lj );
			return other?.ready ? other.surface[ ( chunk.j0 + lj - other.j0 ) * NODES + chunk.i0 + li - other.i0 ] : null;

		};
		const slope = ( a, b, h ) => ( ( b ?? h ) - ( a ?? h ) ) / ( ( ( a === null ? 0 : 1 ) + ( b === null ? 0 : 1 ) ) * CELL || 1 );

		for ( let lj = 0; lj <= CELLS; lj ++ ) {

			for ( let li = 0; li <= CELLS; li ++ ) {

				const k = lj * NODES + li;
				const h = surface[ k ];
				const dx = slope( height( li - 1, lj ), height( li + 1, lj ), h );
				const dz = slope( height( li, lj - 1 ), height( li, lj + 1 ), h );
				const length = Math.hypot( dx, 1, dz );
				normal.setXYZ( k, - dx / length, 1 / length, - dz / length );

			}

		}

		normal.needsUpdate = true;
		if ( normalsOnly ) return;

		const changed = new Uint8Array( COUNT );
		for ( let k = 0; k < COUNT; k ++ ) {

			position.array[ k * 3 + 1 ] = surface[ k ];
			changed[ k ] = Math.abs( surface[ k ] - base[ k ] ) > DISTURBED ? 1 : 0;
			// Eased in over the first few centimetres, so edges don't show the grid as steps.
			disturbed.array[ k ] = MathUtils.clamp( ( Math.abs( surface[ k ] - base[ k ] ) - DISTURBED ) / COLOUR_EASE, 0, 1 );

		}

		// With Google tiles, untouched ground next to the earthworks takes their colour: Google's
		// own photo texture shows beyond them. On the stand-in it fades into the stand-in's colour.
		for ( let k = 0; k < COUNT; k ++ ) {

			const id = changed[ k ] ? top[ k ] : this.standIn ? GROUND : this.neighbourTop( chunk, changed, k );
			_colour.copy( this.palette[ id ] );
			if ( this.standIn ) _colour.lerpColors( this.palette[ GROUND ], _colour, disturbed.array[ k ] );
			color.setXYZ( k, _colour.r, _colour.g, _colour.b );

		}

		// Split each cell along the diagonal whose ends are closer in height, so a steep wall at
		// an angle to the grid keeps a straight top and bottom edge instead of a row of teeth.
		let flipped = false;
		for ( let lj = 0; lj < CELLS; lj ++ ) {

			for ( let li = 0; li < CELLS; li ++ ) {

				const k = lj * NODES + li;
				const flip = Math.abs( surface[ k ] - surface[ k + NODES + 1 ] ) + 1e-4 < Math.abs( surface[ k + 1 ] - surface[ k + NODES ] ) ? 1 : 0;
				if ( flip === chunk.flip[ lj * CELLS + li ] ) continue;
				chunk.flip[ lj * CELLS + li ] = flip;
				flipped = true;

			}

		}

		const shown = this.standIn ? null : dilate( changed );
		const index = geometry.index.array;
		let n = 0;
		for ( let lj = 0; lj < CELLS; lj ++ ) {

			for ( let li = 0; li < CELLS; li ++ ) {

				const k = lj * NODES + li;
				const corners = [ k, k + 1, k + NODES, k + NODES + 1 ];
				// The stand-in draws untouched land too (it has a gap here), but not its water.
				const draw = shown ? corners.some( c => shown[ c ] ) : corners.every( c => changed[ c ] || base[ c ] > - 1 );
				if ( draw ) n = writeCell( index, n, k, chunk.flip[ lj * CELLS + li ] );

			}

		}

		geometry.setDrawRange( 0, n );
		for ( const attribute of [ position, color, disturbed, geometry.index ] ) attribute.needsUpdate = true;
		geometry.computeBoundingSphere();
		mesh.visible = n > 0;
		if ( collider.boundsTree && ! flipped ) {

			collider.boundsTree.refit();
			return;

		}

		// The triangles changed: rebuild the collision hierarchy over them.
		const all = collider.index.array;
		for ( let lj = 0, m = 0; lj < CELLS; lj ++ ) for ( let li = 0; li < CELLS; li ++ ) m = writeCell( all, m, lj * NODES + li, chunk.flip[ lj * CELLS + li ] );
		collider.index.needsUpdate = true;
		collider.boundsTree = new MeshBVH( collider );

	}

	neighbourTop( chunk, changed, k ) {

		const li = k % NODES;
		const lj = Math.floor( k / NODES );
		for ( let dz = - 1; dz <= 1; dz ++ ) {

			for ( let dx = - 1; dx <= 1; dx ++ ) {

				const a = li + dx;
				const b = lj + dz;
				if ( a < 0 || b < 0 || a > CELLS || b > CELLS ) continue;
				if ( changed[ b * NODES + a ] ) return chunk.top[ b * NODES + a ];

			}

		}

		return GROUND;

	}

	// --- pressing Google's mesh under the pits ---------------------------------------------

	updatePress( chunk ) {

		const { press } = chunk;
		const key = `terrain-${ chunk.key }`;
		if ( ! chunk.ready || ! this.chunks.has( chunk.key ) ) return;
		const depth = new Float32Array( COUNT );
		const cut = new Uint8Array( COUNT );
		let any = false;
		for ( let k = 0; k < COUNT; k ++ ) {

			// Under the surface as it is and as it will be once any digging has finished.
			depth[ k ] = Math.min( chunk.surface[ k ], chunk.cutFinal[ k ] );
			cut[ k ] = depth[ k ] < chunk.base[ k ] - DISTURBED ? 1 : 0;
			any ||= cut[ k ] === 1;

		}

		if ( ! any ) {

			press.pending = false;
			if ( press.set ) this.flattening.setShape( key, null );
			press.set = false;
			press.signature = 0;
			return;

		}

		const floor = minFilter( depth, PRESS_REACH );
		const cells = [];
		let signature = 2166136261;
		for ( let lj = 0; lj < CELLS; lj ++ ) {

			for ( let li = 0; li < CELLS; li ++ ) {

				const k = lj * NODES + li;
				if ( ! ( cut[ k ] || cut[ k + 1 ] || cut[ k + NODES ] || cut[ k + NODES + 1 ] ) ) continue;
				cells.push( k );
				signature = Math.imul( signature ^ k, 16777619 );
				signature = Math.imul( signature ^ Math.round( floor[ k ] * 20 ), 16777619 );

			}

		}

		if ( signature === press.signature ) {

			press.pending = false;
			return;

		}

		// Throttled: try again next frame until it's been long enough.
		if ( this.clock - press.time < PRESS_INTERVAL ) return;
		const position = new Float32Array( COUNT * 3 );
		for ( let k = 0; k < COUNT; k ++ ) {

			position[ k * 3 ] = chunk.x( k );
			position[ k * 3 + 1 ] = floor[ k ] - PRESS_DEPTH;
			position[ k * 3 + 2 ] = chunk.z( k );

		}

		const index = new Uint16Array( cells.length * 6 );
		cells.forEach( ( k, n ) => writeCell( index, n * 6, k ) );
		const geometry = new BufferGeometry();
		geometry.setAttribute( 'position', new BufferAttribute( position, 3 ) );
		geometry.setIndex( new BufferAttribute( index, 1 ) );
		geometry.boundsTree = new MeshBVH( geometry );
		this.flattening.setShape( key, new ShapeMesh( geometry ) );
		press.set = true;
		press.signature = signature;
		press.time = this.clock;
		press.pending = false;

	}

	// --- freeform helpers ------------------------------------------------------------------

	// A block of nodes to dig or dump in, copied out of the chunks; commit() writes it back.
	window( minX, maxX, minZ, maxZ ) {

		const i0 = Math.floor( minX / CELL );
		const i1 = Math.ceil( maxX / CELL );
		const j0 = Math.floor( minZ / CELL );
		const j1 = Math.ceil( maxZ / CELL );
		this.ensure( { minX: i0 * CELL, maxX: i1 * CELL, minZ: j0 * CELL, maxZ: j1 * CELL } );
		this.flush();
		const w = new Window( i0, j0, i1 - i0 + 1, j1 - j0 + 1 );
		for ( let n = 0; n < w.n; n ++ ) {

			const i = i0 + n % w.ni;
			const j = j0 + Math.floor( n / w.ni );
			const chunk = this.owner( i, j );
			if ( ! chunk?.ready ) return null;
			const k = ( j - chunk.j0 ) * NODES + i - chunk.i0;
			w.surface[ n ] = chunk.surface[ k ];
			w.exc[ n ] = chunk.exc[ k ];
			w.base[ n ] = chunk.base[ k ];
			w.dug[ n ] = chunk.dug[ k ];
			w.loose[ n ] = chunk.loose[ k ];
			w.mat[ n ] = chunk.looseMat[ k ];

		}

		w.keep();
		return w;

	}

	commit( w ) {

		for ( let n = 0; n < w.n; n ++ ) {

			if ( ! w.changed( n ) ) continue;
			this.forCopies( w.i0 + n % w.ni, w.j0 + Math.floor( n / w.ni ), ( chunk, k ) => {

				chunk.dug[ k ] = w.dug[ n ];
				chunk.loose[ k ] = w.loose[ n ];
				chunk.looseMat[ k ] = w.mat[ n ];
				this.dirty.add( chunk.key );

			} );

		}

		this.flush();
		this.onFreeformChange?.();

	}

}

// Meshes raycast against every cell, though only some are drawn.
class TerrainMesh extends Mesh {

	raycast( raycaster, intersects ) {

		this.collider?.boundsTree?.raycastObject3D( this, raycaster, intersects );

	}

}

// Nodes copied out of the chunks for digging and dumping.
class Window {

	constructor( i0, j0, ni, nj ) {

		Object.assign( this, { i0, j0, ni, nj, n: ni * nj } );
		for ( const layer of [ 'surface', 'exc', 'base', 'dug', 'loose' ] ) this[ layer ] = new Float32Array( this.n );
		this.mat = new Uint8Array( this.n );

	}

	x( n ) {

		return ( this.i0 + n % this.ni ) * CELL;

	}

	z( n ) {

		return ( this.j0 + Math.floor( n / this.ni ) ) * CELL;

	}

	nearest( x, z ) {

		const i = MathUtils.clamp( Math.round( x / CELL ) - this.i0, 0, this.ni - 1 );
		const j = MathUtils.clamp( Math.round( z / CELL ) - this.j0, 0, this.nj - 1 );
		return j * this.ni + i;

	}

	isEdge( n ) {

		const i = n % this.ni;
		const j = Math.floor( n / this.ni );
		return i === 0 || j === 0 || i === this.ni - 1 || j === this.nj - 1;

	}

	keep() {

		this.original = { dug: this.dug.slice(), loose: this.loose.slice(), mat: this.mat.slice() };

	}

	changed( n ) {

		const o = this.original;
		return o.dug[ n ] !== this.dug[ n ] || o.loose[ n ] !== this.loose[ n ] || o.mat[ n ] !== this.mat[ n ];

	}

	// Take `amount` off the top: loose material first, then a stockpile under it (the bite is
	// kept as negative loose material on top of the pile), else the ground (digging).
	take( n, amount ) {

		const loose = Math.min( Math.max( this.loose[ n ], 0 ), amount );
		this.loose[ n ] -= loose;
		const rest = amount - loose;
		if ( rest > 0 ) {

			// Without its loose layer the surface is the pile, if there is one, or else the dug ground.
			const pile = this.surface[ n ] - ( this.loose[ n ] + loose ) > this.exc[ n ] + 1e-4;
			if ( pile ) {

				this.loose[ n ] -= rest;

			} else {

				this.exc[ n ] -= rest;
				this.dug[ n ] = this.exc[ n ] - this.base[ n ];

			}

		}

		this.surface[ n ] -= amount;

	}

	give( n, amount, mat ) {

		this.loose[ n ] += amount;
		this.mat[ n ] = mat;
		this.surface[ n ] += amount;

	}

}

// Pour loose material onto a window: the cone (flat-topped over `radius`) at the angle whose
// tangent is `tan`, that adds `volume` m³ above what is there. False if it would reach the edge.
function placeCone( w, x, z, volume, tan, radius, mat ) {

	const drop = new Float32Array( w.n );
	let lo = Infinity;
	for ( let n = 0; n < w.n; n ++ ) {

		drop[ n ] = Math.max( 0, Math.hypot( w.x( n ) - x, w.z( n ) - z ) - radius ) * tan;
		lo = Math.min( lo, w.surface[ n ] + drop[ n ] );

	}

	const start = [ w.nearest( x, z ) ];
	const thickness = apex => n => apex - drop[ n ] - w.surface[ n ];
	const added = apex => spread( w.ni, w.n, start, thickness( apex ) ).total * CELL_AREA;
	let hi = lo + 1;
	for ( let i = 0; i < 40 && added( hi ) < volume; i ++ ) hi = lo + ( hi - lo ) * 2;
	for ( let i = 0; i < 60; i ++ ) {

		const mid = ( lo + hi ) / 2;
		if ( added( mid ) < volume ) lo = mid;
		else hi = mid;

	}

	// Scale the last bit so exactly `volume` goes down.
	const apex = hi;
	const { mask, total } = spread( w.ni, w.n, start, thickness( apex ) );
	const scale = volume / ( total * CELL_AREA );
	let fits = true;
	for ( let n = 0; n < w.n; n ++ ) {

		const amount = mask[ n ] ? ( apex - drop[ n ] - w.surface[ n ] ) * scale : 0;
		if ( amount <= 0 ) continue;
		if ( w.isEdge( n ) ) fits = false;
		w.give( n, amount, mat );

	}

	return fits;

}

// Sand-pile relaxation: wherever the slope between neighbouring nodes is steeper than `tan`, move
// half the excess downhill, until it's stable everywhere. Without canMove( from, to ) only loose
// material moves (dumped material slides, the ground under it doesn't); with it, anything moves
// where it says so. Edge nodes stay put; returns false if something wanted to move onto one.
// Moves keep the volume exactly.
const NEIGHBOURS = [ [ 1, 0 ], [ - 1, 0 ], [ 0, 1 ], [ 0, - 1 ], [ 1, 1 ], [ - 1, - 1 ], [ 1, - 1 ], [ - 1, 1 ] ];
function settle( w, tan, materialOf, canMove ) {

	const { ni, n: count } = w;
	const queue = new Int32Array( count );
	const queued = new Uint8Array( count );
	let head = 0;
	let size = 0;
	const push = n => {

		if ( queued[ n ] || w.isEdge( n ) ) return;
		queued[ n ] = 1;
		queue[ ( head + size ) % count ] = n;
		size ++;

	};
	for ( let n = 0; n < count; n ++ ) push( n );

	const limits = NEIGHBOURS.map( ( [ a, b ] ) => tan * CELL * Math.hypot( a, b ) );
	let stable = true;
	let budget = 4e6;
	while ( size > 0 && budget -- > 0 ) {

		const a = queue[ head ];
		head = ( head + 1 ) % count;
		size --;
		queued[ a ] = 0;
		const ai = a % ni;
		for ( let d = 0; d < NEIGHBOURS.length; d ++ ) {

			const [ di, dj ] = NEIGHBOURS[ d ];
			if ( ai + di < 0 || ai + di >= ni ) continue;
			const b = a + dj * ni + di;
			if ( b < 0 || b >= count ) continue;
			const excess = w.surface[ a ] - w.surface[ b ] - limits[ d ];
			if ( excess <= SETTLE_TOLERANCE ) continue;
			if ( canMove && ! canMove( a, b ) ) continue;
			const amount = Math.min( excess / 2, canMove ? Infinity : Math.max( 0, w.loose[ a ] ) );
			if ( amount <= 1e-6 ) continue;
			if ( w.isEdge( b ) ) {

				stable = false;
				continue;

			}

			const mat = materialOf( a );
			w.take( a, amount );
			w.give( b, amount, mat );
			push( b );
			push( a );

		}

	}

	return stable;

}

// Smallest value within `reach` nodes, per node.
function minFilter( values, reach ) {

	const rows = new Float32Array( COUNT );
	const out = new Float32Array( COUNT );
	for ( let lj = 0; lj < NODES; lj ++ ) {

		for ( let li = 0; li < NODES; li ++ ) {

			let m = Infinity;
			for ( let a = Math.max( 0, li - reach ); a <= Math.min( CELLS, li + reach ); a ++ ) m = Math.min( m, values[ lj * NODES + a ] );
			rows[ lj * NODES + li ] = m;

		}

	}

	for ( let lj = 0; lj < NODES; lj ++ ) {

		for ( let li = 0; li < NODES; li ++ ) {

			let m = Infinity;
			for ( let b = Math.max( 0, lj - reach ); b <= Math.min( CELLS, lj + reach ); b ++ ) m = Math.min( m, rows[ b * NODES + li ] );
			out[ lj * NODES + li ] = m;

		}

	}

	return out;

}

// Nodes that changed, and their neighbours.
function dilate( mask ) {

	const out = mask.slice();
	for ( let k = 0; k < COUNT; k ++ ) {

		if ( ! mask[ k ] ) continue;
		const li = k % NODES;
		const lj = Math.floor( k / NODES );
		for ( let dz = - 1; dz <= 1; dz ++ ) {

			for ( let dx = - 1; dx <= 1; dx ++ ) {

				const a = li + dx;
				const b = lj + dz;
				if ( a >= 0 && b >= 0 && a <= CELLS && b <= CELLS ) out[ b * NODES + a ] = 1;

			}

		}

	}

	return out;

}

// The two triangles of the cell whose first corner is node k, facing up: split from (x + 1, z)
// to (x, z + 1), or flipped, from (x, z) to (x + 1, z + 1).
function writeCell( index, n, k, flip = 0 ) {

	const a = k;
	const b = k + 1;
	const c = k + NODES;
	const d = k + NODES + 1;
	index.set( flip ? [ a, c, d, a, d, b ] : [ a, c, b, b, c, d ], n );
	return n + 6;

}

function toCentimetres( v ) {

	return MathUtils.clamp( Math.round( v * 100 ), - 32768, 32767 );

}

// Non-zero runs as [ start, length, values... ], base64 of little-endian Int16.
function encodeRuns( values ) {

	const out = [];
	for ( let k = 0; k < values.length; ) {

		if ( values[ k ] === 0 ) {

			k ++;
			continue;

		}

		let end = k;
		while ( end < values.length && values[ end ] !== 0 ) end ++;
		out.push( k, end - k );
		for ( let n = k; n < end; n ++ ) out.push( values[ n ] );
		k = end;

	}

	if ( out.length === 0 ) return '';
	const view = new DataView( new ArrayBuffer( out.length * 2 ) );
	out.forEach( ( v, i ) => view.setInt16( i * 2, v, true ) );
	let binary = '';
	const bytes = new Uint8Array( view.buffer );
	for ( let i = 0; i < bytes.length; i ++ ) binary += String.fromCharCode( bytes[ i ] );
	return btoa( binary );

}

function decodeRuns( text ) {

	const values = new Int16Array( CELLS * CELLS );
	if ( ! text ) return values;
	const binary = atob( text );
	const view = new DataView( new ArrayBuffer( binary.length ) );
	for ( let i = 0; i < binary.length; i ++ ) view.setUint8( i, binary.charCodeAt( i ) );
	for ( let i = 0; i + 1 < binary.length / 2; ) {

		const start = view.getInt16( i * 2, true );
		const length = view.getInt16( i * 2 + 2, true );
		for ( let n = 0; n < length; n ++ ) values[ start + n ] = view.getInt16( ( i + 2 + n ) * 2, true );
		i += 2 + length;

	}

	return values;

}

// --- the stand-in ground ---------------------------------------------------------------------

// Without Google tiles the ground is a flat stand-in (world.js). Pits must show through it, so its
// land is rebuilt in strips with gaps where chunks are (they draw the land there), and so are its
// grid lines, which the chunks draw on their own surface instead.
function takeOverStandIn( ground ) {

	const land = ground.children.find( o => o.isMesh && o.position.y === 0 );
	const water = ground.children.find( o => o.isMesh && o !== land );
	const grid = ground.children.find( o => o.isLineSegments );
	if ( ! land ) return null;
	const landBox = new Box3().setFromObject( land );
	const waterBox = water ? new Box3().setFromObject( water ) : null;

	const strips = new Mesh( new BufferGeometry(), land.material );
	strips.name = 'stand-in land';
	ground.remove( land );
	land.geometry.dispose();
	ground.add( strips );

	let lines = null;
	let gridSpec = null;
	if ( grid ) {

		// GridHelper: four vertices per division, coloured per line; the middle one is darker.
		const { position, color } = grid.geometry.attributes;
		grid.geometry.computeBoundingBox();
		const half = grid.geometry.boundingBox.max.x;
		const divisions = position.count / 4 - 1;
		const colour = new Color().fromBufferAttribute( color, 0 );
		const centre = new Color().fromBufferAttribute( color, divisions / 2 * 4 );
		gridSpec = { half, divisions, spacing: half * 2 / divisions, colour, centre };
		lines = new LineSegments( new BufferGeometry(), grid.material );
		lines.name = 'stand-in grid';
		lines.position.copy( grid.position );
		lines.raycast = () => {};
		ground.remove( grid );
		grid.geometry.dispose();
		ground.add( lines );

	}

	const inside = ( box, x, z ) => x >= box.min.x && x <= box.max.x && z >= box.min.z && z <= box.max.z;
	const standIn = {
		grid: gridSpec,
		height( x, z ) {

			if ( inside( landBox, x, z ) ) return landBox.max.y;
			if ( waterBox && inside( waterBox, x, z ) ) return waterBox.max.y;
			return null;

		},
		rebuild( chunks ) {

			strips.geometry.dispose();
			strips.geometry = landStrips( landBox, chunks );
			if ( ! lines ) return;
			lines.geometry.dispose();
			lines.geometry = gridLines( gridSpec, chunks );

		},
	};
	standIn.rebuild( new Map() );
	return standIn;

}

function landStrips( box, chunks ) {

	const positions = [];
	const indices = [];
	const y = box.max.y;
	const quad = ( x0, x1, z0, z1 ) => {

		const n = positions.length / 3;
		positions.push( x0, y, z0, x1, y, z0, x0, y, z1, x1, y, z1 );
		indices.push( n, n + 2, n + 1, n + 1, n + 2, n + 3 );

	};
	const [ cx0, cx1 ] = [ Math.floor( box.min.x / CHUNK_SIZE ), Math.ceil( box.max.x / CHUNK_SIZE ) - 1 ];
	const [ cz0, cz1 ] = [ Math.floor( box.min.z / CHUNK_SIZE ), Math.ceil( box.max.z / CHUNK_SIZE ) - 1 ];
	for ( let cz = cz0; cz <= cz1; cz ++ ) {

		const z0 = Math.max( box.min.z, cz * CHUNK_SIZE );
		const z1 = Math.min( box.max.z, ( cz + 1 ) * CHUNK_SIZE );
		let start = null;
		for ( let cx = cx0; cx <= cx1 + 1; cx ++ ) {

			const open = cx <= cx1 && ! chunks.has( chunkKey( cx, cz ) );
			if ( open && start === null ) start = cx;
			if ( open || start === null ) continue;
			quad( Math.max( box.min.x, start * CHUNK_SIZE ), Math.min( box.max.x, cx * CHUNK_SIZE ), z0, z1 );
			start = null;

		}

	}

	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new BufferAttribute( new Float32Array( positions ), 3 ) );
	geometry.setAttribute( 'normal', new BufferAttribute( new Float32Array( positions.length ).map( ( _, i ) => i % 3 === 1 ? 1 : 0 ), 3 ) );
	geometry.setIndex( indices );
	return geometry;

}

// The grid's lines, broken where chunks are.
function gridLines( { half, divisions, spacing, colour, centre }, chunks ) {

	const positions = [];
	const colours = [];
	const [ c0, c1 ] = [ Math.floor( - half / CHUNK_SIZE ), Math.ceil( half / CHUNK_SIZE ) - 1 ];
	for ( let line = 0; line <= divisions; line ++ ) {

		const at = - half + line * spacing;
		const c = line === divisions / 2 ? centre : colour;
		// A line exactly on a chunk edge touches the chunks on both sides.
		const across = at % CHUNK_SIZE === 0 ? [ at / CHUNK_SIZE - 1, at / CHUNK_SIZE ] : [ Math.floor( at / CHUNK_SIZE ) ];
		for ( const alongX of [ false, true ] ) {

			let start = null;
			for ( let n = c0; n <= c1 + 1; n ++ ) {

				const open = n <= c1 && ! across.some( a => chunks.has( alongX ? chunkKey( n, a ) : chunkKey( a, n ) ) );
				if ( open && start === null ) start = n;
				if ( open || start === null ) continue;
				const from = Math.max( - half, start * CHUNK_SIZE );
				const to = Math.min( half, n * CHUNK_SIZE );
				if ( alongX ) positions.push( from, 0, at, to, 0, at );
				else positions.push( at, 0, from, at, 0, to );
				colours.push( c.r, c.g, c.b, c.r, c.g, c.b );
				start = null;

			}

		}

	}

	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new BufferAttribute( new Float32Array( positions ), 3 ) );
	geometry.setAttribute( 'color', new BufferAttribute( new Float32Array( colours ), 3 ) );
	return geometry;

}

// --- the surface material --------------------------------------------------------------------

// Lit like the stand-in land, coloured per vertex by what the top is made of, with a fine grain
// on disturbed ground; on the stand-in it also draws the stand-in's grid lines on untouched ground.
function createSurfaceMaterial( grid ) {

	const material = new MeshStandardMaterial( { vertexColors: true, roughness: 1, metalness: 0 } );
	const uniforms = {
		detailMap: { value: createDetailTexture() },
		gridOn: { value: grid ? 1 : 0 },
		gridSpacing: { value: grid?.spacing ?? 50 },
		gridColour: { value: grid?.colour ?? new Color() },
		gridCentre: { value: grid?.centre ?? new Color() },
	};
	material.onBeforeCompile = shader => {

		Object.assign( shader.uniforms, uniforms );
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', '#include <common>\nattribute float disturbed;\nvarying float vDisturbed;\nvarying vec2 vGround;' )
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\nvDisturbed = disturbed;\nvGround = ( modelMatrix * vec4( position, 1.0 ) ).xz;' );
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', [
				'#include <common>',
				'uniform sampler2D detailMap;',
				'uniform float gridOn;',
				'uniform float gridSpacing;',
				'uniform vec3 gridColour;',
				'uniform vec3 gridCentre;',
				'varying float vDisturbed;',
				'varying vec2 vGround;',
			].join( '\n' ) )
			.replace( '#include <color_fragment>', [
				'#include <color_fragment>',
				'float grain = texture2D( detailMap, vGround / 3.1 ).r * 0.6 + texture2D( detailMap, vGround / 0.73 ).r * 0.4;',
				'diffuseColor.rgb *= mix( 1.0, grain * 1.12, vDisturbed );',
			].join( '\n' ) )
			.replace( '#include <opaque_fragment>', [
				'if ( gridOn > 0.5 ) {',
				'	vec2 cells = vGround / gridSpacing;',
				'	vec2 lines = abs( fract( cells - 0.5 ) - 0.5 ) / fwidth( cells );',
				'	vec2 middle = abs( vGround ) / fwidth( vGround );',
				'	float onLine = 1.0 - min( min( lines.x, lines.y ), 1.0 );',
				'	float onMiddle = 1.0 - min( min( middle.x, middle.y ), 1.0 );',
				// The lines lie on the untouched ground, as the stand-in's own do, not over pits and piles.
				'	float shown = max( onLine, onMiddle ) * ( 1.0 - smoothstep( 0.0, 0.5, vDisturbed ) );',
				'	outgoingLight = mix( outgoingLight, mix( gridColour, gridCentre, onMiddle ), shown );',
				'}',
				'#include <opaque_fragment>',
			].join( '\n' ) );

	};
	material.customProgramCacheKey = () => 'earthworks-surface';
	return material;

}

// Tileable grain: fine speckle over two sizes of soft blotches, around 0.9.
function createDetailTexture() {

	const size = 128;
	const data = new Uint8Array( size * size * 4 );
	const lattice = cells => {

		const values = Array.from( { length: cells * cells }, () => Math.random() );
		return ( x, y ) => {

			const fx = x / size * cells;
			const fy = y / size * cells;
			const x0 = Math.floor( fx );
			const y0 = Math.floor( fy );
			const at = ( a, b ) => values[ ( ( b % cells ) * cells ) + ( a % cells ) ];
			const sx = ( fx - x0 ) * ( fx - x0 ) * ( 3 - 2 * ( fx - x0 ) );
			const sy = ( fy - y0 ) * ( fy - y0 ) * ( 3 - 2 * ( fy - y0 ) );
			return ( at( x0, y0 ) * ( 1 - sx ) + at( x0 + 1, y0 ) * sx ) * ( 1 - sy ) + ( at( x0, y0 + 1 ) * ( 1 - sx ) + at( x0 + 1, y0 + 1 ) * sx ) * sy;

		};

	};
	const coarse = lattice( 4 );
	const medium = lattice( 16 );
	for ( let y = 0; y < size; y ++ ) {

		for ( let x = 0; x < size; x ++ ) {

			const v = 0.78 + 0.22 * ( 0.45 * Math.random() + 0.3 * medium( x, y ) + 0.25 * coarse( x, y ) );
			const i = ( y * size + x ) * 4;
			data[ i ] = data[ i + 1 ] = data[ i + 2 ] = Math.round( v * 255 );
			data[ i + 3 ] = 255;

		}

	}

	const texture = new DataTexture( data, size, size );
	texture.wrapS = texture.wrapT = RepeatWrapping;
	texture.minFilter = LinearMipmapLinearFilter;
	texture.generateMipmaps = true;
	texture.needsUpdate = true;
	return texture;

}
