import {
	Box3,
	BufferAttribute,
	BufferGeometry,
	Color,
	DataTexture,
	EventDispatcher,
	FloatType,
	Group,
	LinearMipmapLinearFilter,
	LineSegments,
	MathUtils,
	Mesh,
	MeshStandardMaterial,
	NearestFilter,
	Raycaster,
	RGBAFormat,
	RepeatWrapping,
	Vector2,
	Vector3,
} from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { ZONE_ID } from './flatten.js';
import { MAX_REACH, gradeOffset, gradeRange, groundOffset, isGraded, pressedOnly } from './grade.js';
import { blocks } from './walk.js';

// The ground you can dig into and pile onto: a heightfield in the scene frame, made only where
// there are earthworks, in square chunks of CELLS x CELLS cells. Per chunk:
//
//   h0       the ground as Google (or the stand-in) made it, from flattening.originalHeight(), so
//            pits don't feed back into their own reference. Under a flatten area it is that
//            area's floor, built up or dug down to, and that ground is drawn (base, below). Under a
//            graded one (grade.js) it is the graded shape, raised or lowered, with batters round
//            it down or up to the ground, and that ground is drawn (see composeGrading). It only takes ground
//            from tiles at least as fine as those it already has it from (err): the coarse tiles
//            that load first give way to finer ones, and tiles far from the camera, which are
//            coarser, don't move the earthworks.
//   designs  excavations (the lowest of them and the ground wins) and then stockpiles (the
//            highest wins), in the order they were placed
//   dug      freeform digging (the excavator), as depths below the ground and the excavations,
//            under the stockpiles: a bite out of a pit's floor stays just that bite when the pit
//            is moved or deleted
//   loose    freeform dumped material on top of everything, so it lands on pit floors and piles.
//            Negative where a bite was taken out of a stockpile: it never reaches below the pile,
//            and it goes when the pile is moved or deleted (dropBites)
//
// Each chunk is drawn as one mesh. With Google tiles only what differs from h0 is drawn, so the
// photo texture shows elsewhere, and Google's mesh is hidden where it stands above what is drawn
// (hideUnderEarthworks). Without tiles the
// chunks draw their whole surface and the stand-in land leaves gaps for them.
//
// Nodes on chunk edges are stored in both chunks (and corners in four); every write goes to all
// copies, so neighbouring meshes always meet.
//
// setUntouched( true ) draws the ground as it was (h0) instead, for the Before view (layers.js):
// nothing dug, piled or flattened, so with Google tiles nothing is drawn and none of Google's mesh
// is hidden. Everything stays as it is underneath, and setUntouched( false ) composes it again.

export const CELL = 0.5;
const CELLS = 64;
export const CHUNK_SIZE = CELL * CELLS;
// Limits on dug ground read from a saved layout: chunks (about 0.5 MB each in memory), and how
// far from the site they may be (in chunks: 200 x 32 m = 6.4 km).
const MAX_SAVED_CHUNKS = 200;
// A graded area's chunks made at once (ensureSoon), and the time a frame for the rest (ms).
const SYNC_CHUNKS = 16;
// A level flatten area (or one too large to grade) holds its floor in chunks of its own when it
// takes no more than this many (about 500 m square); a larger one is only pressed down.
const MAX_FLOOR_CHUNKS = 324;
const CREATE_BUDGET = 4;
const MAX_CHUNK_INDEX = 200;
const NODES = CELLS + 1;
const COUNT = NODES * NODES;
const CELL_AREA = CELL * CELL;
// A surface this close to the ground counts as untouched.
const DISTURBED = 0.02;
// With Google tiles, ground this many nodes (1 m) round a pit is drawn too, as a lip of disturbed
// earth, so the pit's edge meets Google's ground cleanly.
const APRON = 2;
// The ground drawn round a pit is no higher than the lowest ground this many nodes (3 m) from it:
// further than half a car or a rail car is wide (see lipHeights).
const LIP_REACH = 6;
// And never more than this above the pit's rim (m): a building beside it is wider than LIP_REACH.
const LIP_RISE = 1;
// Inside the drawn earthworks, Google's mesh is hidden from this far below their surface upwards
// (hideUnderEarthworks): what's lower is behind the surface anyway, and Google's ground at about
// the same height would show through in patches. Raycasts ignore what is above it (covers).
const HIDE_BELOW = 0.3;
const COVER_TOLERANCE = 0.03;
// The mask's ceiling where nothing is kept above the earthworks (m, higher than anything stands).
const NO_CEILING = 1e5;
// The mask that says where the earthworks are covers at most this many nodes a side.
const MAX_MASK = 2048;
// Graded flatten areas' batters meet the bare ground (composeGrading): no higher than the lowest
// ground within this many nodes (3 m), nor this far above the plane through the ground under the
// area (m).
const BARE_REACH = 6;
const PLANE_RISE = 1;
// Sharper tiles move the ground a little; the change is eased in over this long.
const BLEND_TIME = 0.6;
// Nodes (along each side) where a chunk checks whether finer tiles have loaded over it.
const PROBES = [ 8, 32, 56 ];
// The ground under a chunk is read every STRIDE nodes first (the first LOOK nodes in ORDER), for
// a quick look at all of it, then at the rest.
const STRIDE = 4;
const SIDE = CELLS / STRIDE + 1;
const LOOK = SIDE * SIDE;
const ORDER = sampleOrder();
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
// Ground a graded flatten area raises (terrain.js composeGrading): compacted fill, as dug soil.
const FILL = 2 + MATERIALS.findIndex( m => m.id === 'soil' );
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

// Whether two rectangles (see rectFrame) overlap: neither lies wholly beyond a side of the other.
export function rectsOverlap( a, b ) {

	const de = b.east - a.east;
	const dn = b.north - a.north;
	// Each rectangle's across and along directions, east and north, as in insideRect.
	const axes = [ a, b ].flatMap( r => [ [ r.cos, - r.sin ], [ r.sin, r.cos ] ] );
	const reach = ( r, [ e, n ] ) => r.hw * Math.abs( r.cos * e - r.sin * n ) + r.hl * Math.abs( r.sin * e + r.cos * n );
	return axes.every( axis => Math.abs( de * axis[ 0 ] + dn * axis[ 1 ] ) <= reach( a, axis ) + reach( b, axis ) );

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

// How many chunks a rectangle's bounds take.
function chunkCount( { minX, maxX, minZ, maxZ } ) {

	const [ cx0, cx1 ] = chunkRange( minX, maxX );
	const [ cz0, cz1 ] = chunkRange( minZ, maxZ );
	return ( cx1 - cx0 + 1 ) * ( cz1 - cz0 + 1 );

}

class Chunk {

	constructor( cx, cz ) {

		this.cx = cx;
		this.cz = cz;
		this.key = chunkKey( cx, cz );
		this.i0 = cx * CELLS;
		this.j0 = cz * CELLS;
		this.h0 = new Float32Array( COUNT );
		// How coarse h0 is: the geometric error of the tile each node was read from (see
		// flatten.js), Infinity where it's only a guess.
		this.err = new Float32Array( COUNT ).fill( Infinity );
		this.base = new Float32Array( COUNT );
		this.dug = new Float32Array( COUNT );
		this.loose = new Float32Array( COUNT );
		this.looseMat = new Uint8Array( COUNT );
		// After excavations and digging: what the stockpiles stand on. cutFinal: the same with
		// every dig finished.
		this.exc = new Float32Array( COUNT );
		this.cutFinal = new Float32Array( COUNT );
		// The stockpile on top at each node (its design key), and the loose layer as drawn: a bite
		// out of a pile no deeper than the pile is there.
		this.pile = new Array( COUNT ).fill( null );
		this.looseShown = new Float32Array( COUNT );
		this.surface = new Float32Array( COUNT );
		this.top = new Uint8Array( COUNT );
		// Which way each cell is split into triangles (see updateMesh).
		this.flip = new Uint8Array( CELLS * CELLS );
		// Where graded flatten areas shape the ground (see composeGrading): 1 inside one, 2 on its
		// batters; and the earth each moves over the nodes this chunk owns, entry -> { cut, fill }.
		this.graded = new Uint8Array( COUNT );
		this.zoneContrib = new Map();
		// The floor a level flatten area (or one too large to grade, MAX_GRADED_SIDE) presses the
		// ground down to, which graded ones don't build up over (composeGrading); Infinity elsewhere.
		this.levelled = new Float32Array( COUNT );
		// How high Google's mesh is hidden over the drawn earthworks (updateMask): up to a flatten
		// area's 'flatten up to' height over its ground, so what stands above that (an overpass, a
		// power line) is kept, as the flattening keeps it; Infinity elsewhere.
		this.ceiling = new Float32Array( COUNT ).fill( Infinity );
		this.contrib = new Map(); // design key -> { cut, fill } m³ over the nodes this chunk owns
		this.ready = false;
		this.cutCount = 0;
		this.sampledLoads = 0;
		this.sampledAt = 0;
		this.fine = null; // a full sampling pass in progress
		this.blend = null; // easing h0 toward newer samples

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

// A point's place across (u) and along (v) a flatten area's rectangle (see rectFrame and
// insideRect), and back: the area's own frame has x = u and z = -v (grade.js).
function zoneLocal( zone, x, z ) {

	const r = zone.frame ?? zone;
	const de = - x - r.east;
	const dn = z - r.north;
	return [ de * r.cos - dn * r.sin, de * r.sin + dn * r.cos ];

}

function zoneWorld( zone, u, v ) {

	const r = zone.frame ?? zone;
	const de = u * r.cos + v * r.sin;
	const dn = - u * r.sin + v * r.cos;
	return [ - ( r.east + de ), r.north + dn ];

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

	constructor( { tiles, ground, models, flattening, getGround } ) {

		super();
		this.tiles = tiles;
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
		// Chunks a graded area wants and doesn't have yet, made a few a frame (ensureSoon).
		this.pending = [];
		this.collectTimer = 0;
		this.resampleTimer = 0;
		// Set by the owner to save freeform digging (layout.changed).
		this.onFreeformChange = null;
		// The ground as it was is shown instead of the earthworks (setUntouched).
		this.untouched = false;

		this.standIn = tiles ? null : takeOverStandIn( ground );
		this.standInChanged = false;
		// After each sample(), how coarse that ground was (see flatten.js originalHeight).
		this.sampled = { error: 0 };
		if ( this.standIn ) {

			// The stand-in land now has gaps under the chunks, so ask it directly.
			models.originalHeight = ( x, z ) => this.standIn.height( x, z );
			this.sample = ( x, z ) => this.standIn.height( x, z );

		} else {

			this.sample = ( x, z ) => flattening.originalHeight( x, z, tiles ? undefined : ground, this.sampled );

		}

		this.material = createSurfaceMaterial( this.standIn?.grid );
		// Where the earthworks are drawn over Google's tiles, and their surface height there, for
		// the tiles' shader (hideUnderEarthworks). Shared by every tile material.
		this.mask = {
			twinCutTex: { value: null },
			twinCutOrigin: { value: new Vector2() },
			twinCutSize: { value: new Vector2() },
			twinCutOn: { value: 0 },
		};
		this.maskDirty = false;
		this.palette = [ GROUND_COLOUR, CUT_COLOUR, ...MATERIALS.map( m => m.colour ) ].map( c => new Color( c ) );
		this.raycaster = new Raycaster();
		this.raycaster.firstHitOnly = true;

		// Flatten areas press Google's mesh down to their floor, so that is the ground there. Graded
		// ones shape the ground with or without Google's tiles (see updateZone).
		this.zones = new Map(); // entry -> { frame, floor, bounds, ... } (see updateZone)
		if ( tiles ) tiles.addEventListener( 'load-model', () => this.tileLoads ++ );
		const onZone = ( { entry, type } ) => {

			if ( entry.kind === ZONE_ID && ! entry.placing ) this.updateZone( entry, type === 'remove' );

		};
		for ( const type of [ 'add', 'change', 'remove' ] ) models.addEventListener( type, onZone );
		// What an area keeps overhead was worked out again (flatten.js): hide Google's mesh up to it.
		flattening?.onOverhead?.( entry => {

			const zone = this.zones.get( entry );
			if ( zone ) this.markBounds( zone.bounds );

		} );

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

	// Show the ground as it was (true), or the earthworks again (false). Every chunk is composed
	// again at once, so heights read straight after are already the new ones.
	setUntouched( on ) {

		if ( on === this.untouched ) return;
		this.untouched = on;
		for ( const key of this.chunks.keys() ) this.dirty.add( key );
		this.flush();

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

		return this.readNodes( 'surface', x, z );

	}

	// The ground as it was at local (x, z), before anything was dug or piled (h0, or a flatten
	// area's floor), or null outside the chunks: the original ground line of a pit's section.
	// Read afresh each time, so it's as sharp as the tiles the chunks have sampled by then.
	groundAt( x, z ) {

		return this.readNodes( 'base', x, z );

	}

	// A chunk array of heights (surface, base) at local (x, z), on the triangles the mesh draws.
	readNodes( name, x, z ) {

		const fi = x / CELL;
		const fj = z / CELL;
		const i = Math.floor( fi );
		const j = Math.floor( fj );
		const chunk = this.owner( i, j );
		if ( ! chunk?.ready ) return null;
		const s = chunk[ name ];
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
					out.loose += chunk.looseShown[ k ];

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
	// Returns the m³ actually removed; lastDig then says how much of it was ground as it lay
	// (bank, which swells when dumped) and how much was already loose (spoil, stockpiles).
	dig( { x, z, heading = 0, width = 1, length = 1, volume, maxDepth = 6 } ) {

		this.lastDig = { bank: 0, loose: 0 };
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
		let bank = 0;
		bite.forEach( ( n, i ) => {

			const amount = w.surface[ n ] - Math.min( w.surface[ n ], Math.max( level, floors[ i ] ) );
			if ( amount > 0 ) {

				bank += w.take( n, amount ) * CELL_AREA;
				removed += amount * CELL_AREA;

			}

		} );

		// How much of it was ground as it lay (bank) rather than material already dug or piled
		// (loose): only the bank part swells when it is dumped again.
		this.lastDig = { bank, loose: removed - bank };

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

	// Put the ground back inside a rectangle (rectFrame): nothing dug or dumped there by hand any
	// more, and bites taken out of piles there undone. Excavations and stockpiles are left as they
	// are. Returns whether there was anything to fill in.
	fillFreeform( r ) {

		const bounds = rectBounds( r );
		let changed = false;
		for ( const chunk of this.chunks.values() ) {

			const range = nodeRange( chunk, bounds );
			if ( ! range ) continue;
			this.forRange( chunk, range, ( k, x, z ) => {

				if ( insideRect( r, x, z ) < 0 || ( chunk.dug[ k ] === 0 && chunk.loose[ k ] === 0 ) ) return;
				chunk.dug[ k ] = 0;
				chunk.loose[ k ] = 0;
				chunk.looseMat[ k ] = 0;
				this.dirty.add( chunk.key );
				changed = true;

			} );

		}

		if ( changed ) this.onFreeformChange?.();
		return changed;

	}

	// Whether anything has been dug or dumped by hand anywhere.
	hasFreeform() {

		for ( const chunk of this.chunks.values() ) for ( let k = 0; k < COUNT; k ++ ) if ( chunk.dug[ k ] !== 0 || chunk.loose[ k ] !== 0 ) return true;
		return false;

	}

	// Forget the bites taken out of a stockpile (call before it's moved, changed or deleted): they
	// were taken out of that pile, not out of the ground or whatever is put there next.
	dropBites( key ) {

		const design = this.designs.get( key );
		if ( ! design ) return;
		let any = false;
		for ( const chunkKey of design.chunks ) {

			const chunk = this.chunks.get( chunkKey );
			if ( ! chunk ) continue;
			// Edge copies are in these chunks too, and they were marked when the pile was applied.
			for ( let k = 0; k < COUNT; k ++ ) {

				if ( chunk.pile[ k ] !== key || ! ( chunk.loose[ k ] < 0 ) ) continue;
				chunk.loose[ k ] = 0;
				this.dirty.add( chunk.key );
				any = true;

			}

		}

		if ( any ) this.onFreeformChange?.();

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

			// The nodes on its +x and +z edges are saved by the chunks that own them, but this one
			// draws the ground sloping to them, so it's saved too (maybe empty) to be there again.
			for ( let m = 0; m <= CELLS && ! any; m ++ ) {

				for ( const k of [ m * NODES + CELLS, CELLS * NODES + m ] ) any ||= toCentimetres( chunk.dug[ k ] ) !== 0 || toCentimetres( chunk.loose[ k ] ) !== 0;

			}

			if ( any ) chunks.push( { c: [ chunk.cx, chunk.cz ], d: encodeRuns( dug ), l: encodeRuns( loose ), m: encodeRuns( mats ) } );

		}

		return chunks.length ? { cell: CELL, size: CELLS, materials: used, chunks } : null;

	}

	// merge (importing a file): keep the deeper digging and the higher dumping of the two.
	loadFreeform( data, { merge = false } = {} ) {

		if ( ! data?.chunks ) return;
		if ( data.cell !== CELL || data.size !== CELLS ) throw new Error( 'saved with a different grid' );
		// Saved layouts can come from anyone (a shared link, an imported file), so check them before
		// allocating anything: each chunk takes about half a megabyte.
		if ( ! Array.isArray( data.chunks ) || data.chunks.length > MAX_SAVED_CHUNKS ) throw new Error( 'too much dug ground' );
		const seen = new Set();
		for ( const chunk of data.chunks ) {

			const [ cx, cz ] = Array.isArray( chunk?.c ) ? chunk.c : [];
			if ( ! Number.isInteger( cx ) || ! Number.isInteger( cz ) || Math.abs( cx ) > MAX_CHUNK_INDEX || Math.abs( cz ) > MAX_CHUNK_INDEX ) throw new Error( 'bad dug ground' );
			if ( seen.has( chunkKey( cx, cz ) ) ) throw new Error( 'bad dug ground' );
			seen.add( chunkKey( cx, cz ) );

		}

		const decoded = data.chunks.map( ( { d, l, m } ) => [ decodeRuns( d ), decodeRuns( l ), decodeRuns( m ) ] );
		if ( ! merge ) this.resetFreeform();
		data.chunks.forEach( ( { c: [ cx, cz ] }, index ) => {

			const [ dug, loose, mats ] = decoded[ index ];
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
						// Chunks that were already there (merging) are drawn again too.
						this.dirty.add( other.key );

					} );

				}

			}

		} );

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

		this.createSome( CREATE_BUDGET );
		this.blendSome( dt );
		this.flush();
		this.collect( dt );
		if ( this.tiles ) this.updateMask();
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
		// Showing the ground as it was, nothing is applied (and no volume worked out afresh).
		const ordered = this.untouched ? [] : [ ...this.designs.values() ].sort( ( a, b ) => a.order() - b.order() );
		const chunksOf = design => [ ...design.chunks ].map( key => this.chunks.get( key ) ).filter( chunk => set.has( chunk ) );

		for ( const chunk of list ) this.startCompose( chunk );
		for ( const design of ordered ) if ( design.type === 'cut' ) for ( const chunk of chunksOf( design ) ) this.applyCut( design, chunk );
		for ( const chunk of list ) this.applyDug( chunk );
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

		// The earth each graded flatten area moves (entry.gradeVolume, m³), for its P panel; left as
		// it was while the ground as it was is shown, as the designs' volumes are.
		const graded = [];
		for ( const zone of this.untouched ? [] : this.zones.values() ) {

			if ( ! zone.graded ) continue;
			const volume = { cut: 0, fill: 0 };
			for ( const key of zone.chunks ) {

				const part = this.chunks.get( key )?.zoneContrib.get( zone.entry );
				if ( ! part ) continue;
				volume.cut += part.cut;
				volume.fill += part.fill;

			}

			const old = zone.entry.gradeVolume;
			if ( old && Math.abs( old.cut - volume.cut ) < 0.05 && Math.abs( old.fill - volume.fill ) < 0.05 ) continue;
			zone.entry.gradeVolume = volume;
			graded.push( zone.entry );

		}

		this.updateStandIn();
		this.dispatchEvent( { type: 'change', designs: changed, chunks: list.length, graded } );

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

		const { h0, base, dug, surface, cutFinal, top, graded, levelled, ceiling } = chunk;
		base.set( h0 );
		graded.fill( 0 );
		levelled.fill( Infinity );
		ceiling.fill( - Infinity );
		chunk.zoneContrib.clear();
		const zones = this.untouched ? [] : [ ...this.zones.values() ];
		for ( const zone of zones ) {

			if ( zone.graded ) continue;
			const range = nodeRange( chunk, zone.bounds );
			if ( ! range ) continue;
			this.forRange( chunk, range, ( k, x, z ) => {

				const inside = insideRect( zone.frame, x, z );
				if ( inside < 0 ) {

					// The ring of nodes just outside, drawn and masked with it (shownNodes): under what
					// it keeps overhead, Google's mesh is hidden only up to that too, and the ground read
					// there from above is the deck (or a curtain hanging from it), not the ground: drawn
					// no higher than the edge's floor, not as a wall up to the deck.
					if ( inside < - 1.5 * CELL || ! zone.chunks ) return;
					const [ u, v ] = zoneLocal( zone, x, z );
					const cu = MathUtils.clamp( u, - zone.frame.hw, zone.frame.hw ), cv = MathUtils.clamp( v, - zone.frame.hl, zone.frame.hl );
					const edge = zone.height( cu, cv );
					const top = edge + this.keepAbove( zone, x, z, cu, cv, true );
					if ( ! Number.isFinite( top ) ) return;
					ceiling[ k ] = Math.max( ceiling[ k ], top );
					base[ k ] = Math.min( base[ k ], edge );
					return;

				}

				// One too large to grade presses onto its shape, as the flattening does.
				const [ u, v ] = zoneLocal( zone, x, z );
				const floor = zone.height( u, v );
				levelled[ k ] = Math.min( levelled[ k ], floor );
				// One holding its floor in chunks is that floor, built up or dug down (drawn, and
				// Google's mesh hidden above it); one too large to hold is Google's mesh pressed down.
				if ( zone.chunks ) graded[ k ] = 1;
				else base[ k ] = Math.min( base[ k ], floor );
				// Overlapping, the flattening has pressed Google's mesh up to the highest of them.
				ceiling[ k ] = Math.max( ceiling[ k ], floor + this.keepAbove( zone, x, z, u, v ) );

			} );

		}

		// The lowest of the floors held over each node (as the flattening presses to the lowest).
		for ( let k = 0; k < COUNT; k ++ ) if ( graded[ k ] ) base[ k ] = levelled[ k ];

		const grading = zones.filter( zone => zone.graded && nodeRange( chunk, zone.bounds ) );
		if ( grading.length ) this.composeGrading( chunk, grading );

		for ( let k = 0; k < COUNT; k ++ ) {

			if ( ceiling[ k ] === - Infinity ) ceiling[ k ] = Infinity;
			surface[ k ] = base[ k ];
			cutFinal[ k ] = base[ k ];
			// Graded ground: the face of a cut where it's below the ground, compacted fill elsewhere.
			top[ k ] = dug[ k ] < - DISTURBED && ! this.untouched ? CUT : graded[ k ] ? ( base[ k ] < h0[ k ] - DISTURBED ? CUT : FILL ) : GROUND;

		}

		chunk.pile.fill( null );
		chunk.contrib.clear();

	}

	// Graded flatten areas (grade.js): inside each the ground is its graded shape, raised or
	// lowered, the lowest winning where they overlap (as the level floor always did), level areas
	// included: none builds up over a level area's floor; round each, batters at its batter ratio
	// from its edge: where the edge is above the ground an embankment falls away until it meets the
	// ground, where it's below a cut slope climbs to it. Inside a rectangle wins over another's
	// batters. Where one area's cut slope and another's embankment meet, neither wins outright
	// (either would leave a face as high as the pads are apart along the other's edge): the ground
	// runs between them, each weighed by how far it is off the ground over how near its edge is,
	// so it meets each edge and fades into each batter where that one ends. Every node inside
	// is drawn (graded 1) and each batter node that's off the ground (graded 2), with Google's mesh
	// hidden above them (updateMask), so the ground is the same whatever Google's mesh had on it;
	// the earth moved over the nodes this chunk owns is kept per area.
	//
	// The ground is read from above off Google's mesh, so round an area it is as often a tree's
	// crown or a house's roof as the ground: a cut slope climbing to that would be a wall of earth
	// as high as the trees. So batters meet (and the earth moved is reckoned from) the bare ground:
	// against the ground fitted under the area (the plane, or the ground smoothed for an area that
	// follows it: zone.plane), carried on beyond it, no higher than the lowest ground within
	// BARE_REACH, nor than PLANE_RISE above that. What stands on
	// the ground beyond a batter is left as it is.
	composeGrading( chunk, zones ) {

		const { base, graded, zoneContrib, levelled, ceiling } = chunk;
		const ground = base.slice();
		// Read against each area's plane, so the lowest within reach on a slope is not the ground
		// downhill of it.
		const side = NODES + 2 * BARE_REACH;
		const lowest = new Map( zones.map( zone => [ zone, crop( filterGrid( this.padded( chunk, BARE_REACH, ( c, k ) => c.h0[ k ] - zone.plane( ...zoneLocal( zone, c.x( k ), c.z( k ) ) ), Infinity ), side, BARE_REACH, Math.min ), BARE_REACH ) ] ) );
		const bare = new Float32Array( COUNT );
		const bareAt = ( zone, k, u, v ) => Math.min( ground[ k ], zone.plane( u, v ) + Math.min( lowest.get( zone )[ k ], PLANE_RISE ) );
		const inside = new Float32Array( COUNT ).fill( Infinity );
		const lower = new Float32Array( COUNT ).fill( Infinity );
		const raise = new Float32Array( COUNT ).fill( - Infinity );
		const insideOf = new Array( COUNT ).fill( null );
		const lowerOf = new Array( COUNT ).fill( null );
		const raiseOf = new Array( COUNT ).fill( null );
		// For each batter, how far the node is from that area's edge and the bare ground it meets.
		const lowerD = new Float32Array( COUNT ), raiseD = new Float32Array( COUNT );
		const lowerG = new Float32Array( COUNT ), raiseG = new Float32Array( COUNT );
		for ( const zone of zones ) {

			const range = nodeRange( chunk, zone.rectBounds );
			if ( ! range ) continue;
			const { hw, hl } = zone.frame;
			this.forRange( chunk, range, ( k, x, z ) => {

				const [ u, v ] = zoneLocal( zone, x, z );
				if ( Math.abs( u ) > hw + 1e-6 || Math.abs( v ) > hl + 1e-6 ) return;
				const y = zone.height( u, v );
				if ( y < inside[ k ] ) {

					inside[ k ] = y;
					insideOf[ k ] = zone;
					bare[ k ] = bareAt( zone, k, u, v );

				}

			} );

		}

		for ( const zone of zones ) {

			const range = nodeRange( chunk, zone.bounds );
			if ( ! range ) continue;
			const { hw, hl } = zone.frame;
			const run = zone.params.batter;
			this.forRange( chunk, range, ( k, x, z ) => {

				if ( inside[ k ] !== Infinity ) return;
				const [ u, v ] = zoneLocal( zone, x, z );
				const cu = MathUtils.clamp( u, - hw, hw ), cv = MathUtils.clamp( v, - hl, hl );
				const d = Math.hypot( u - cu, v - cv );
				if ( d > zone.reach ) return;
				const edge = zone.height( cu, cv );
				const g = bareAt( zone, k, u, v );
				if ( edge > g ) {

					const y = edge - d / run;
					if ( y > g && y > raise[ k ] ) {

						raise[ k ] = y;
						raiseOf[ k ] = zone;
						raiseD[ k ] = d;
						raiseG[ k ] = g;

					}

				} else {

					const y = edge + d / run;
					if ( y < g && y < lower[ k ] ) {

						lower[ k ] = y;
						lowerOf[ k ] = zone;
						lowerD[ k ] = d;
						lowerG[ k ] = g;

					}

				}

			} );

		}

		for ( let k = 0; k < COUNT; k ++ ) {

			let zone = null;
			if ( inside[ k ] !== Infinity ) {

				base[ k ] = inside[ k ];
				graded[ k ] = 1;
				zone = insideOf[ k ];

			} else if ( lower[ k ] !== Infinity && raise[ k ] > lower[ k ] ) {

				const wl = ( lowerG[ k ] - lower[ k ] ) / ( lowerD[ k ] + 1e-3 );
				const wr = ( raise[ k ] - raiseG[ k ] ) / ( raiseD[ k ] + 1e-3 );
				base[ k ] = ( lower[ k ] * wl + raise[ k ] * wr ) / ( wl + wr );
				bare[ k ] = ( lowerG[ k ] * wl + raiseG[ k ] * wr ) / ( wl + wr );
				zone = wl >= wr ? lowerOf[ k ] : raiseOf[ k ];

			} else if ( lower[ k ] !== Infinity ) {

				base[ k ] = lower[ k ];
				bare[ k ] = lowerG[ k ];
				zone = lowerOf[ k ];

			} else if ( raise[ k ] !== - Infinity ) {

				base[ k ] = raise[ k ];
				bare[ k ] = raiseG[ k ];
				zone = raiseOf[ k ];

			}

			if ( ! zone ) continue;
			// A level area presses its ground down to its floor: nothing graded is built up over it.
			base[ k ] = Math.min( base[ k ], levelled[ k ] );
			const x = chunk.x( k ), z = chunk.z( k );
			ceiling[ k ] = Math.max( ceiling[ k ], base[ k ] + this.keepAbove( zone, x, z, ...zoneLocal( zone, x, z ) ) );
			if ( ! graded[ k ] && Math.abs( base[ k ] - ground[ k ] ) > DISTURBED ) graded[ k ] = 2;
			if ( ! owns( k % NODES, Math.floor( k / NODES ) ) ) continue;
			const d = base[ k ] - bare[ k ];
			const part = zoneContrib.get( zone.entry ) ?? { cut: 0, fill: 0 };
			if ( d > 0 ) part.fill += d * CELL_AREA;
			else part.cut -= d * CELL_AREA;
			zoneContrib.set( zone.entry, part );

		}

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

	// Freeform digging goes down from whatever the excavations left, so a pit's volume is the
	// same whether or not an excavator has dug in it since.
	applyDug( chunk ) {

		const { surface, cutFinal, dug, exc } = chunk;
		for ( let k = 0; k < COUNT && ! this.untouched; k ++ ) {

			surface[ k ] += dug[ k ];
			cutFinal[ k ] += dug[ k ];

		}

		exc.set( surface );

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
				chunk.pile[ k ] = design.key;

			} );

		}

		for ( const [ chunk, fill ] of fills ) chunk.contrib.set( design.key, { cut: 0, fill: fill * CELL_AREA } );

	}

	endCompose( chunk ) {

		const { surface, loose, looseShown, looseMat, top, base, exc, pile, contrib } = chunk;
		let cuts = 0;
		for ( let k = 0; k < COUNT; k ++ ) {

			const owned = owns( k % NODES, Math.floor( k / NODES ) );
			// A bite out of a stockpile goes no deeper than the pile there now (it may have shrunk
			// since), and comes off that pile's volume.
			const shown = this.untouched ? 0 : Math.max( loose[ k ], exc[ k ] - surface[ k ] );
			looseShown[ k ] = shown;
			if ( shown !== 0 ) {

				surface[ k ] += shown;
				if ( shown > DISTURBED / 2 ) top[ k ] = looseMat[ k ];
				if ( shown < 0 && owned && pile[ k ] ) contrib.get( pile[ k ] ).fill += shown * CELL_AREA;

			}

			if ( surface[ k ] < base[ k ] - DISTURBED && owned ) cuts ++;

		}

		chunk.cutCount = cuts;

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

	// The same, but past the first SYNC_CHUNKS missing ones they're made over the next frames
	// (createSome), nearest `centre` first: each is sampled off Google's tiles by hundreds of
	// raycasts, so a large graded area, or one dragged larger, would hold the page up for seconds.
	ensureSoon( { minX, maxX, minZ, maxZ }, [ x, z ] ) {

		const [ cx0, cx1 ] = chunkRange( minX, maxX );
		const [ cz0, cz1 ] = chunkRange( minZ, maxZ );
		const keys = [];
		const missing = [];
		for ( let cz = cz0; cz <= cz1; cz ++ ) {

			for ( let cx = cx0; cx <= cx1; cx ++ ) {

				keys.push( chunkKey( cx, cz ) );
				if ( ! this.chunks.has( chunkKey( cx, cz ) ) ) missing.push( [ cx, cz ] );

			}

		}

		const away = ( [ cx, cz ] ) => Math.hypot( ( cx + 0.5 ) * CHUNK_SIZE - x, ( cz + 0.5 ) * CHUNK_SIZE - z );
		missing.sort( ( a, b ) => away( a ) - away( b ) );
		for ( const [ cx, cz ] of missing.slice( 0, SYNC_CHUNKS ) ) this.createChunk( cx, cz );
		const queued = new Set( this.pending.map( ( [ cx, cz ] ) => chunkKey( cx, cz ) ) );
		for ( const pair of missing.slice( SYNC_CHUNKS ) ) if ( ! queued.has( chunkKey( ...pair ) ) ) this.pending.push( pair );
		return keys;

	}

	// Make waiting chunks for up to `budget` ms (at least one a call), skipping those no graded
	// area wants any more (it was dragged smaller again, or removed).
	createSome( budget ) {

		if ( this.pending.length === 0 ) return;
		const wanted = new Set();
		for ( const zone of this.zones.values() ) for ( const key of zone.chunks ?? [] ) wanted.add( key );
		const end = performance.now() + budget;
		let made = 0;
		while ( this.pending.length && ( made === 0 || performance.now() < end ) ) {

			const [ cx, cz ] = this.pending.shift();
			const key = chunkKey( cx, cz );
			if ( this.chunks.has( key ) || ! wanted.has( key ) ) continue;
			this.createChunk( cx, cz );
			made ++;

		}

	}

	createChunk( cx, cz ) {

		const chunk = new Chunk( cx, cz );
		this.chunks.set( chunk.key, chunk );
		this.sampleChunk( chunk );
		// Edge nodes may already be known to a neighbour, including digging done there.
		for ( const other of this.neighbours( chunk ) ) copyOverlap( other, chunk, other.ready ? [ 'h0', 'err', 'dug', 'loose', 'looseMat' ] : [ 'dug', 'loose', 'looseMat' ] );
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
		for ( const zone of this.zones.values() ) for ( const key of zone.chunks ?? [] ) used.add( key );
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

	// The chunk that eases node (i, j)'s ground toward new samples when no chunk owns it (it's on
	// the far edge of the earthworks): the first of those keeping a copy, in forCopies' order.
	easer( i, j ) {

		let first = null;
		this.forCopies( i, j, chunk => first ??= chunk );
		return first;

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
		const coarse = new Float32Array( LOOK );
		const errors = new Float32Array( LOOK );
		let sum = 0;
		let valid = 0;
		for ( let n = 0; n < LOOK; n ++ ) {

			const k = ORDER[ n ];
			const y = this.sample( chunk.x( k ), chunk.z( k ) );
			coarse[ n ] = y ?? NaN;
			errors[ n ] = this.sampled.error;
			if ( y !== null ) {

				sum += y;
				valid ++;

			}

		}

		if ( valid === 0 ) return;
		const mean = sum / valid;
		for ( let n = 0; n < LOOK; n ++ ) if ( Number.isNaN( coarse[ n ] ) ) coarse[ n ] = mean;
		const filled = fillIn( coarse, errors );
		h0.set( filled.values );
		chunk.err.set( filled.errors );
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
			for ( const other of this.neighbours( chunk ) ) if ( other.ready ) copyOverlap( other, chunk, [ 'h0', 'err' ] );
			this.dirty.add( chunk.key );

		}

	}

	// Sample the full grid of waiting chunks for up to `budget` ms. Every fourth node is read
	// first, and as soon as they all are, the chunk takes them (filled in between) where they're
	// from finer tiles than before: ground first read from the coarse tiles that load first can
	// be metres, even hundreds of metres, out. Every waiting chunk gets that quick look before
	// any is read in full.
	sampleSome( budget ) {

		const end = performance.now() + budget;
		while ( this.sampling.length && performance.now() < end ) {

			const chunk = this.sampling.find( c => ! c.fine || c.fine.next < LOOK ) ?? this.sampling[ 0 ];
			if ( this.chunks.get( chunk.key ) !== chunk ) {

				this.sampling.splice( this.sampling.indexOf( chunk ), 1 );
				continue;

			}

			if ( ! chunk.fine ) chunk.fine = { values: new Float32Array( COUNT ), errors: new Float32Array( COUNT ), next: 0, loads: this.tileLoads };
			const fine = chunk.fine;
			const stop = fine.next < LOOK ? LOOK : COUNT;
			for ( let n = 0; n < 8 && fine.next < stop; n ++, fine.next ++ ) {

				const k = ORDER[ fine.next ];
				fine.values[ k ] = this.sample( chunk.x( k ), chunk.z( k ) ) ?? chunk.h0[ k ];
				fine.errors[ k ] = this.sampled.error;

			}

			if ( fine.next === LOOK ) {

				const first = ORDER.subarray( 0, LOOK );
				const look = fillIn( Float32Array.from( first, k => fine.values[ k ] ), Float32Array.from( first, k => fine.errors[ k ] ) );
				this.refine( chunk, look.values, look.errors, true );

			}

			if ( fine.next < COUNT ) continue;
			this.sampling.splice( this.sampling.indexOf( chunk ), 1 );
			chunk.fine = null;
			// Tiles that loaded while it was being read may not be in it yet.
			chunk.sampledLoads = fine.loads;
			chunk.sampledAt = this.clock;
			this.refine( chunk, fine.values, fine.errors, false );

		}

	}

	// Ease a chunk's ground toward newly sampled heights, at the nodes where they're from tiles at
	// least as fine as before (strictly finer for a quick look, which is partly filled in).
	refine( chunk, values, errors, strict ) {

		const to = ( chunk.blend?.to ?? chunk.h0 ).slice();
		let change = 0;
		for ( let k = 0; k < COUNT; k ++ ) {

			if ( strict ? errors[ k ] >= chunk.err[ k ] : errors[ k ] > chunk.err[ k ] ) continue;
			to[ k ] = values[ k ];
			chunk.err[ k ] = errors[ k ];

		}

		for ( let k = 0; k < COUNT; k ++ ) change = Math.max( change, Math.abs( to[ k ] - chunk.h0[ k ] ) );
		if ( change > 0.005 ) chunk.blend = { from: chunk.h0.slice(), to, t: 0 };

	}

	// Tiles have loaded since a chunk was sampled: sample it again if they're finer over it than
	// those its ground came from, ahead of the others and from the start. Coarser ones (far from
	// the camera) are left alone, and a chunk first read from the coarse tiles that load first is
	// put right wherever the camera is.
	queueResampling( dt ) {

		this.resampleTimer -= dt;
		if ( this.resampleTimer > 0 ) return;
		this.resampleTimer = 2;
		for ( const chunk of this.chunks.values() ) {

			if ( ! chunk.ready || chunk.sampledLoads === this.tileLoads ) continue;
			// Waiting for its quick look, or part way through it: left to finish rather than started
			// again. Tiles go on loading all the while the map streams in, so starting over every
			// time any did meant a chunk (with a few earthworks, all of them) never got through its
			// quick look, and kept the ground from the coarse tiles that load first, metres or even
			// hundreds of metres out, for good: pits dug from it, piles sat on it. Tiles that load
			// meanwhile are in the nodes it reads after them, and it's checked again next time. A
			// chunk part way through its full read starts over, with a quick look at the sharper tiles.
			if ( this.sampling.includes( chunk ) && ( ! chunk.fine || chunk.fine.next < LOOK ) ) continue;
			chunk.sampledLoads = this.tileLoads;
			if ( ! this.sharper( chunk ) ) continue;
			chunk.fine = null;
			this.sampling = [ chunk, ...this.sampling.filter( other => other !== chunk ) ];

		}

	}

	// Whether finer tiles than its ground came from have loaded over a chunk, checked at a few
	// nodes across it.
	sharper( chunk ) {

		for ( const lj of PROBES ) {

			for ( const li of PROBES ) {

				const k = lj * NODES + li;
				this.sample( chunk.x( k ), chunk.z( k ) );
				if ( this.sampled.error < chunk.err[ k ] ) return true;

			}

		}

		return false;

	}

	blendSome( dt ) {

		for ( const chunk of this.chunks.values() ) {

			const { blend } = chunk;
			if ( ! blend ) continue;
			blend.t = Math.min( 1, blend.t + dt / BLEND_TIME );
			const t = blend.t * blend.t * ( 3 - 2 * blend.t );
			// The nodes this chunk owns; its edge copies come from their owners. A node on its far
			// edges with no chunk there to own it is eased by one of the chunks that keep a copy
			// (easer()), which writes it to all of them: otherwise it kept the ground it was first
			// read with, from the coarse tiles that load first (hundreds of metres out).
			for ( let lj = 0; lj <= CELLS; lj ++ ) {

				for ( let li = 0; li <= CELLS; li ++ ) {

					const k = lj * NODES + li;
					const value = blend.from[ k ] + ( blend.to[ k ] - blend.from[ k ] ) * t;
					if ( li < CELLS && lj < CELLS ) {

						chunk.h0[ k ] = value;
						continue;

					}

					const i = chunk.i0 + li;
					const j = chunk.j0 + lj;
					if ( this.owner( i, j ) || this.easer( i, j ) !== chunk ) continue;
					const err = chunk.err[ k ];
					this.forCopies( i, j, ( copy, kk ) => {

						copy.h0[ kk ] = value;
						copy.err[ kk ] = err;

					} );

				}

			}

			for ( const other of this.neighbours( chunk ) ) {

				copyOverlap( chunk, other, [ 'h0', 'err' ], true );
				copyOverlap( other, chunk, [ 'h0', 'err' ], true );
				this.dirty.add( other.key );

			}

			this.dirty.add( chunk.key );
			if ( blend.t >= 1 ) chunk.blend = null;

		}

	}

	// Flatten areas count as the ground they press Google's mesh down to. Dispatches 'zones'.
	// Each shapes the ground with or without Google's tiles: a graded one's chunks are made over its
	// batters' reach, a level one's (and one too large to grade) over its rectangle (most of a large
	// one's over the next frames, ensureSoon), and kept while it's there. A level area too large for
	// that (MAX_FLOOR_CHUNKS) only counts where chunks are anyway, as Google's mesh pressed down.
	updateZone( entry, removed ) {

		const old = this.zones.get( entry );
		if ( old ) this.markBounds( old.bounds );
		const { state, params } = entry;
		// Too large to grade (MAX_GRADED_SIDE), an area presses the ground down onto its shape, as
		// the flattening presses Google's mesh, the way a level one does onto its floor.
		const pressed = pressedOnly( params );
		const graded = isGraded( params ) && ! pressed;
		const frame = rectFrame( state.east, state.north, state.heading, params.width / 2, params.length / 2 );
		// A level area (or one too large to grade) holds its floor in chunks of its own, as a graded
		// one does its shape, unless it would take too many.
		const bounds = rectBounds( frame, CELL );
		const holds = ! graded && chunkCount( bounds ) <= MAX_FLOOR_CHUNKS;
		if ( removed || ! this.models.entries.includes( entry ) || ( ! graded && ! holds && ! this.tiles ) ) {

			this.zones.delete( entry );
			if ( removed || ! graded ) delete entry.gradeVolume;

		} else {

			const zone = { entry, frame, floor: state.up, graded, params, bounds };
			// Its floor: level, or for one too large to grade its shape, pressed onto as the
			// flattening presses Google's mesh.
			zone.height = () => state.up;
			if ( pressed ) {

				const fit = params.fit ?? null;
				zone.height = ( u, v ) => state.up + gradeOffset( params, fit, u, - v );
				zone.floor = state.up + gradeRange( params, fit ).min;

			}

			// Google's mesh is only ever pressed down onto the floor, so where the floor is built up
			// over the ground (a surfaced pad snaps to the ground's median: about half of it is fill)
			// there was nothing at its height to stand on, and Google's large triangles crossing its
			// edge kept their slope inside it. With chunks of its own, the floor is the ground drawn,
			// walked and driven on there, and Google's mesh above it is hidden and passed through
			// (updateMask, covers), as over a graded area. No batters: the pad's sides (flatten.js)
			// show where it's built up.
			if ( holds ) zone.chunks = new Set( this.ensureSoon( bounds, [ - state.east, state.north ] ) );

			if ( graded ) {

				// The design's own slope (what flatten.js built), and the ground's for the reach.
				const fit = params.fit ?? null;
				zone.params = params;
				zone.up = state.up;
				zone.height = ( u, v ) => state.up + gradeOffset( params, fit, u, - v );
				// The ground fitted under it (models.js 'plane' snapping: the plane, or the ground
				// smoothed for an area that follows it), carried on beyond it.
				const ground = entry.groundSlope ?? fit;
				zone.plane = ( u, v ) => state.up + groundOffset( ground, u, - v );
				zone.floor = state.up + gradeRange( params, fit ).min;
				zone.rectBounds = zone.bounds;
				zone.reach = this.batterReach( zone, entry.groundSlope ?? fit );
				zone.bounds = rectBounds( frame, CELL + zone.reach );
				zone.chunks = new Set( this.ensureSoon( zone.bounds, [ - state.east, state.north ] ) );

			} else {

				delete entry.gradeVolume;

			}

			this.zones.set( entry, zone );
			this.markBounds( zone.bounds );

		}

		this.dispatchEvent( { type: 'zones' } );

	}

	// How far above a flatten area's floor at (x, z) (its own frame: u, v) Google's mesh is kept, as
	// the flattening keeps it (flatten.js keepAbove): Infinity where everything is flattened.
	// `wide`: the lowest kept within a couple of metres, as the flattening presses (for the ring of
	// nodes round an area, where a deck's edge may have just been missed).
	keepAbove( zone, x, z, u, v, wide = false ) {

		return this.flattening?.keepAbove?.( zone.entry, x, z, wide ) ?? ( zone.params.height > 0 ? zone.params.height : Infinity );

	}

	// How far a graded area's batters reach from its edge before they meet the ground: worked out
	// round its edge from the ground there (or the plane fitted through it, where it isn't read
	// yet) and how the ground slopes away, with some to spare, but no more than MAX_REACH.
	batterReach( zone, slope ) {

		const { hw, hl } = zone.frame;
		const run = zone.params.batter;
		const gx = slope?.gx ?? 0, gz = slope?.gz ?? 0;
		let reach = 1;
		const N = 8;
		for ( const [ nu, nv ] of [ [ 1, 0 ], [ - 1, 0 ], [ 0, 1 ], [ 0, - 1 ] ] ) {

			for ( let i = 0; i <= N; i ++ ) {

				const t = i / N * 2 - 1;
				const u = nu ? nu * hw : t * hw;
				const v = nv ? nv * hl : t * hl;
				const [ x, z ] = zoneWorld( zone, u, v );
				const plane = zone.plane( u, v );
				const sampled = this.sample( x, z );
				const ground = Number.isFinite( sampled ) ? Math.min( sampled, plane + PLANE_RISE ) : plane;
				const gap = zone.height( u, v ) - ground;
				// Rise of the ground per metre outward (the area's frame has z = -v).
				const rise = gx * nu - gz * nv;
				const closing = gap > 0 ? 1 / run + rise : 1 / run - rise;
				reach = Math.max( reach, ( Math.abs( gap ) + 0.5 ) / Math.max( closing, 0.02 ) );

			}

		}

		return Math.min( MAX_REACH, reach * 1.2 + 1 );

	}

	// The lowest floor of the flatten areas reaching into a rectangle (see rectFrame), or Infinity
	// if none do: that is the ground there, whatever Google's mesh had standing on it. For a graded
	// area (or one too large to grade), the lowest of its shape inside the rectangle. Just the
	// areas `which( zone )` picks.
	floorUnder( frame, which = () => true ) {

		let floor = Infinity;
		for ( const zone of this.zones.values() ) {

			if ( ! which( zone ) || ! rectsOverlap( zone.frame, frame ) ) continue;
			if ( ! zone.height ) {

				floor = Math.min( floor, zone.floor );
				continue;

			}

			// Read on a grid over the rectangle and at the area's corners inside it.
			let lowest = Infinity;
			const points = [];
			for ( let j = 0; j <= 8; j ++ ) for ( let i = 0; i <= 8; i ++ ) points.push( zoneWorld( frame, ( i / 4 - 1 ) * frame.hw, ( j / 4 - 1 ) * frame.hl ) );
			for ( const su of [ - 1, 1 ] ) for ( const sv of [ - 1, 1 ] ) points.push( zoneWorld( zone, su * zone.frame.hw, sv * zone.frame.hl ) );
			for ( const [ x, z ] of points ) {

				if ( insideRect( zone.frame, x, z ) < - 1e-6 || insideRect( frame, x, z ) < - 1e-6 ) continue;
				const [ u, v ] = zoneLocal( zone, x, z );
				lowest = Math.min( lowest, zone.height( u, v ) );

			}

			floor = Math.min( floor, Number.isFinite( lowest ) ? lowest : zone.floor );

		}

		return floor;

	}

	// The height a pit's rim starts from, the pit's top being `rect` and `around` that with some to
	// spare: the lowest ground there. A level area reaching round it presses that down to its floor.
	// A graded area's ground is its shape, and its batters round it, which on built-up ground is
	// above the ground as Google made it (`up`, the lowest of that under the pit): from there the
	// pit would start below the pad, with a wall down to it at its edge. So where graded ground is
	// under the pit, that is the ground there, and `up` only where none is.
	rimUnder( rect, around, up ) {

		const level = this.floorUnder( around, zone => ! zone.graded );
		const reaching = [ ...this.zones.values() ].some( zone => zone.graded && rectsOverlap( { ...zone.frame, hw: zone.frame.hw + zone.reach, hl: zone.frame.hl + zone.reach }, rect ) );
		if ( ! reaching ) return Math.min( up, level );
		let lowest = Infinity;
		for ( let j = 0; j <= 8; j ++ ) {

			for ( let i = 0; i <= 8; i ++ ) {

				const [ x, z ] = zoneWorld( rect, ( i / 4 - 1 ) * rect.hw, ( j / 4 - 1 ) * rect.hl );
				lowest = Math.min( lowest, this.gradedGround( x, z ) ?? up );

			}

		}

		return Math.min( lowest, level );

	}

	// The ground graded flatten areas make at local (x, z), as composeGrading lays it, or null
	// where none reaches. Worked out on its own, as a pit's rim is wanted before the chunks are
	// composed again: the bare ground the batters meet is the chunks' ground there (the area's
	// plane where there are none yet), without composeGrading's lowest within BARE_REACH.
	gradedGround( x, z ) {

		let inside = Infinity;
		let lower = null;
		let raise = null;
		for ( const zone of this.zones.values() ) {

			if ( ! zone.graded ) continue;
			const [ u, v ] = zoneLocal( zone, x, z );
			const { hw, hl } = zone.frame;
			if ( Math.abs( u ) <= hw + 1e-6 && Math.abs( v ) <= hl + 1e-6 ) {

				inside = Math.min( inside, zone.height( u, v ) );
				continue;

			}

			const cu = MathUtils.clamp( u, - hw, hw ), cv = MathUtils.clamp( v, - hl, hl );
			const d = Math.hypot( u - cu, v - cv );
			if ( d > zone.reach ) continue;
			const edge = zone.height( cu, cv );
			const plane = zone.plane( u, v );
			const g = Math.min( this.readNodes( 'h0', x, z ) ?? plane, plane + PLANE_RISE );
			const run = zone.params.batter;
			if ( edge > g ) {

				const y = edge - d / run;
				if ( y > g && ( ! raise || y > raise.y ) ) raise = { y, d, g };

			} else {

				const y = edge + d / run;
				if ( y < g && ( ! lower || y < lower.y ) ) lower = { y, d, g };

			}

		}

		if ( inside !== Infinity ) return inside;
		if ( lower && raise && raise.y > lower.y ) {

			const wl = ( lower.g - lower.y ) / ( lower.d + 1e-3 );
			const wr = ( raise.y - raise.g ) / ( raise.d + 1e-3 );
			return ( lower.y * wl + raise.y * wr ) / ( wl + wr );

		}

		return lower?.y ?? raise?.y ?? null;

	}

	// The graded ground of the flatten area of `entry` at local (x, z): its shape inside it, and
	// along its batters outside, or null where it doesn't reach (tests and the P panel read it).
	gradedAt( entry, x, z ) {

		const zone = this.zones.get( entry );
		if ( ! zone?.graded ) return null;
		const [ u, v ] = zoneLocal( zone, x, z );
		const { hw, hl } = zone.frame;
		return Math.abs( u ) <= hw && Math.abs( v ) <= hl ? zone.height( u, v ) : null;

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
			// Graded ground (composeGrading) is drawn too: it's off the ground Google's mesh shows.
			changed[ k ] = Math.abs( surface[ k ] - base[ k ] ) > DISTURBED || chunk.graded[ k ] ? 1 : 0;
			// Eased in over the first few centimetres, so edges don't show the grid as steps.
			const off = Math.max( Math.abs( surface[ k ] - base[ k ] ), chunk.graded[ k ] === 1 ? Infinity : chunk.graded[ k ] ? Math.abs( base[ k ] - chunk.h0[ k ] ) : 0 );
			disturbed.array[ k ] = MathUtils.clamp( ( off - DISTURBED ) / COLOUR_EASE, 0, 1 );

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

		// Worked out on the stand-in too, for the mask and covers() (what else the mask hides there, the
		// tests' stand-in for an overpass, is passed through as Google's mesh would be), but there the
		// chunks draw their whole surface.
		chunk.shown = this.shownNodes( chunk, changed );
		const shown = this.standIn ? null : chunk.shown;
		chunk.drawn = shown ? this.lipHeights( chunk, changed, shown ) : null;
		if ( chunk.drawn ) for ( let k = 0; k < COUNT; k ++ ) position.array[ k * 3 + 1 ] = chunk.drawn[ k ];
		this.maskDirty = true;
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

	// Nodes drawn with Google tiles: those changed, one more round them, and the apron round
	// pits, which reaches into neighbouring chunks.
	shownNodes( chunk, changed ) {

		const shown = dilate( changed );
		const cuts = this.padded( chunk, APRON, ( c, k ) => c.surface[ k ] < c.base[ k ] - DISTURBED ? 1 : 0, 0 );
		const apron = crop( filterGrid( cuts, NODES + 2 * APRON, APRON, Math.max ), APRON );
		for ( let k = 0; k < COUNT; k ++ ) if ( apron[ k ] ) shown[ k ] = 1;
		return shown;

	}

	// Heights to draw with Google tiles: the earthworks as they are, and the untouched ground drawn
	// round them (the apron round a pit) at the ground rather than at what stands on it. The ground
	// is read from above off Google's mesh, so beside a pit it is the roof of a parked car or a rail
	// car as often as the ground; drawn there, and with Google's mesh hidden above it, those showed
	// as slabs of earth rising off the pit's edge. So each such node is drawn no higher than the
	// lowest ground within LIP_REACH of it (what's beside a car) or LIP_RISE above the rim of the pit
	// it's round, nor lower than that rim (gentle rises round a pit stay where they are).
	lipHeights( chunk, changed, shown ) {

		const drawn = chunk.surface.slice();
		const rims = [];
		for ( const design of this.designs.values() ) {

			if ( design.type !== 'cut' || ! Number.isFinite( design.rim ) ) continue;
			const b = design.bounds();
			const pad = ( APRON + 2 ) * CELL;
			rims.push( { rim: design.rim, minX: b.minX - pad, maxX: b.maxX + pad, minZ: b.minZ - pad, maxZ: b.maxZ + pad } );

		}

		if ( rims.length === 0 ) return drawn;
		const side = NODES + 2 * LIP_REACH;
		const lowest = crop( filterGrid( this.padded( chunk, LIP_REACH, ( c, k ) => c.base[ k ], Infinity ), side, LIP_REACH, Math.min ), LIP_REACH );
		for ( let k = 0; k < COUNT; k ++ ) {

			// (Every untouched node near a pit: the drawn cells' outer corners are just outside the apron.)
			if ( changed[ k ] ) continue;
			const x = chunk.x( k ), z = chunk.z( k );
			let rim = Infinity;
			for ( const r of rims ) if ( x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ ) rim = Math.min( rim, r.rim );
			if ( rim === Infinity ) continue;
			drawn[ k ] = Math.min( drawn[ k ], Math.max( lowest[ k ], rim ), rim + LIP_RISE );

		}

		return drawn;

	}

	// A layer of this chunk and `pad` nodes into its neighbours (read( chunk, k ) for each node;
	// `empty` where there's no chunk), as a square grid NODES + 2 * pad wide.
	padded( chunk, pad, read, empty ) {

		const side = NODES + 2 * pad;
		const out = new Float32Array( side * side ).fill( empty );
		for ( let b = 0; b < side; b ++ ) {

			const j = chunk.j0 + b - pad;
			for ( let a = 0; a < side; a ++ ) {

				const i = chunk.i0 + a - pad;
				const inside = a >= pad && a <= pad + CELLS && b >= pad && b <= pad + CELLS;
				const other = inside ? chunk : this.owner( i, j );
				if ( other ) out[ b * side + a ] = read( other, ( j - other.j0 ) * NODES + ( i - other.i0 ) );

			}

		}

		return out;

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

		// The apron round a pit: disturbed earth.
		return CUT;

	}

	// --- hiding Google's mesh under the earthworks -------------------------------------------

	// Google's triangles can be far bigger than a pit (10 m and more on open ground), so pressing
	// their corners down can't get them under a pit's floor, and drags them into long dents round
	// it. Instead, inside the drawn earthworks the tiles' shader drops Google's mesh above the
	// surface, from this mask of where they are drawn and how high, and raycasts ignore it there
	// (covers).
	updateMask() {

		if ( ! this.maskDirty ) return;
		this.maskDirty = false;
		const chunks = [ ...this.chunks.values() ].filter( chunk => chunk.shown?.some( v => v ) );
		if ( chunks.length === 0 ) {

			this.mask.twinCutOn.value = 0;
			return;

		}

		const i0 = Math.min( ...chunks.map( c => c.i0 ) );
		const j0 = Math.min( ...chunks.map( c => c.j0 ) );
		const w = Math.min( MAX_MASK, Math.max( ...chunks.map( c => c.i0 ) ) - i0 + NODES );
		const h = Math.min( MAX_MASK, Math.max( ...chunks.map( c => c.j0 ) ) - j0 + NODES );
		let texture = this.mask.twinCutTex.value;
		if ( ! texture || texture.image.width !== w || texture.image.height !== h ) {

			texture?.dispose();
			texture = new DataTexture( new Float32Array( w * h * 4 ), w, h, RGBAFormat, FloatType );
			texture.magFilter = texture.minFilter = NearestFilter;
			this.mask.twinCutTex.value = texture;

		}

		const data = texture.image.data;
		data.fill( 0 );
		for ( const chunk of chunks ) {

			for ( let k = 0; k < COUNT; k ++ ) {

				const a = chunk.i0 + k % NODES - i0;
				const b = chunk.j0 + Math.floor( k / NODES ) - j0;
				if ( a >= w || b >= h ) continue;
				const t = ( b * w + a ) * 4;
				data[ t ] = ( chunk.drawn ?? chunk.surface )[ k ];
				if ( chunk.shown[ k ] ) data[ t + 1 ] = 1;
				// Finite, as it's mixed between nodes in the shader.
				data[ t + 2 ] = Math.min( chunk.ceiling[ k ], NO_CEILING );

			}

		}

		texture.needsUpdate = true;
		this.mask.twinCutOrigin.value.set( i0, j0 );
		this.mask.twinCutSize.value.set( w, h );
		this.mask.twinCutOn.value = 1;

	}

	// Whether a point (e.g. a raycast hit on Google's mesh) is inside the drawn earthworks and
	// above their surface, where the tiles' shader hides it.
	covers( point ) {

		const i = Math.round( point.x / CELL );
		const j = Math.round( point.z / CELL );
		const chunk = this.owner( i, j );
		if ( ! chunk?.shown?.[ ( j - chunk.j0 ) * NODES + i - chunk.i0 ] ) return false;
		// Past the mask's MAX_MASK nodes (earthworks over a kilometre apart) Google's mesh isn't
		// hidden, so it isn't passed through either: what's seen is what's clicked and stood on.
		const { twinCutOn, twinCutOrigin: { value: origin }, twinCutSize: { value: size } } = this.mask;
		if ( ! twinCutOn.value || i < origin.x || j < origin.y || i >= origin.x + size.x || j >= origin.y + size.y ) return false;
		const y = this.surfaceAt( point.x, point.z );
		return y !== null && point.y > y + COVER_TOLERANCE && point.y < chunk.ceiling[ ( j - chunk.j0 ) * NODES + i - chunk.i0 ];

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
			// As drawn: an old bite deeper than its pile is now counts only as deep as the pile.
			w.loose[ n ] = chunk.looseShown[ k ];
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
	// kept as negative loose material on top of the pile), then the ground (digging, kept as a
	// depth below the ground or pit it was dug out of). Returns how much of it counts as bank:
	// the ground, and loose material below the original ground, which is walls that slumped
	// into a hole rather than spoil already dug and swollen (that lies on top, in piles).
	take( n, amount ) {

		const loose = Math.min( Math.max( this.loose[ n ], 0 ), amount );
		const slumped = Math.max( 0, Math.min( this.surface[ n ], this.base[ n ] ) - ( this.surface[ n ] - loose ) );
		// Without its loose layer the surface is the pile, if there is one, or else the dug ground.
		const above = this.surface[ n ] - loose - this.exc[ n ];
		const pile = above > 1e-4 ? Math.min( amount - loose, above ) : 0;
		const ground = amount - loose - pile;
		this.loose[ n ] -= loose + pile;
		this.exc[ n ] -= ground;
		this.dug[ n ] -= ground;
		this.surface[ n ] -= amount;
		return ground + slumped;

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
// A min or max filter (pick = Math.min or Math.max) `reach` nodes wide over a square grid.
function filterGrid( values, side, reach, pick ) {

	const rows = new Float32Array( values.length );
	const out = new Float32Array( values.length );
	for ( let b = 0; b < side; b ++ ) {

		for ( let a = 0; a < side; a ++ ) {

			let m = values[ b * side + a ];
			for ( let x = Math.max( 0, a - reach ); x <= Math.min( side - 1, a + reach ); x ++ ) m = pick( m, values[ b * side + x ] );
			rows[ b * side + a ] = m;

		}

	}

	for ( let b = 0; b < side; b ++ ) {

		for ( let a = 0; a < side; a ++ ) {

			let m = rows[ b * side + a ];
			for ( let y = Math.max( 0, b - reach ); y <= Math.min( side - 1, b + reach ); y ++ ) m = pick( m, rows[ y * side + a ] );
			out[ b * side + a ] = m;

		}

	}

	return out;

}

// The chunk's own nodes out of a grid padded by `pad` (see Terrain.padded).
function crop( values, pad ) {

	const side = NODES + 2 * pad;
	const out = new Float32Array( COUNT );
	for ( let lj = 0; lj < NODES; lj ++ ) for ( let li = 0; li < NODES; li ++ ) out[ lj * NODES + li ] = values[ ( lj + pad ) * side + li + pad ];
	return out;

}

// A chunk's nodes, every STRIDE-th one first, row by row.
function sampleOrder() {

	const first = [];
	const rest = [];
	for ( let k = 0; k < COUNT; k ++ ) ( k % NODES % STRIDE === 0 && Math.floor( k / NODES ) % STRIDE === 0 ? first : rest ).push( k );
	return Int32Array.from( [ ...first, ...rest ] );

}

// Heights for every node of a chunk from those at every STRIDE-th one (SIDE x SIDE, row by row),
// in between by bilinear interpolation, and how coarse they are: as coarse as the coarsest
// of the nodes they're from.
function fillIn( coarse, coarseErrors ) {

	const values = new Float32Array( COUNT );
	const errors = new Float32Array( COUNT );
	for ( let lj = 0; lj < NODES; lj ++ ) {

		for ( let li = 0; li < NODES; li ++ ) {

			const a = Math.min( SIDE - 2, Math.floor( li / STRIDE ) );
			const b = Math.min( SIDE - 2, Math.floor( lj / STRIDE ) );
			const fx = li / STRIDE - a;
			const fz = lj / STRIDE - b;
			const n = b * SIDE + a;
			const c = coarse;
			const e = coarseErrors;
			values[ lj * NODES + li ] = ( c[ n ] * ( 1 - fx ) + c[ n + 1 ] * fx ) * ( 1 - fz ) + ( c[ n + SIDE ] * ( 1 - fx ) + c[ n + SIDE + 1 ] * fx ) * fz;
			errors[ lj * NODES + li ] = Math.max( fx < 1 && fz < 1 ? e[ n ] : 0, fx > 0 && fz < 1 ? e[ n + 1 ] : 0, fx < 1 && fz > 0 ? e[ n + SIDE ] : 0, fx > 0 && fz > 0 ? e[ n + SIDE + 1 ] : 0 );

		}

	}

	return { values, errors };

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

// Throws on anything encodeRuns couldn't have written (saved layouts can come from anyone).
function decodeRuns( text ) {

	const values = new Int16Array( CELLS * CELLS );
	if ( ! text ) return values;
	if ( typeof text !== 'string' ) throw new Error( 'bad dug ground' );
	const binary = atob( text );
	if ( binary.length % 2 ) throw new Error( 'bad dug ground' );
	const view = new DataView( new ArrayBuffer( binary.length ) );
	for ( let i = 0; i < binary.length; i ++ ) view.setUint8( i, binary.charCodeAt( i ) );
	const words = binary.length / 2;
	for ( let i = 0; i + 1 < words; ) {

		const start = view.getInt16( i * 2, true );
		const length = view.getInt16( i * 2 + 2, true );
		if ( start < 0 || length <= 0 || start + length > values.length || i + 2 + length > words ) throw new Error( 'bad dug ground' );
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
// Makes a Google tile material drop what is inside the drawn earthworks and above their surface
// (the mask is Terrain.mask). Chains onto any other shader changes (the tiles' fade-in).
export function hideUnderEarthworks( material, mask ) {

	if ( material.userData.twinCut ) return;
	material.userData.twinCut = true;
	const previous = material.onBeforeCompile;
	material.onBeforeCompile = ( shader, renderer ) => {

		previous?.call( material, shader, renderer );
		Object.assign( shader.uniforms, mask );
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', '#include <common>\nvarying vec3 vTwinWorld;' )
			.replace( '#include <begin_vertex>', '#include <begin_vertex>\nvTwinWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;' );
		shader.fragmentShader = shader.fragmentShader
			.replace( '#include <common>', `#include <common>\n${ COVER_GLSL }` )
			// The tiles' fade-in rewrites main's signature (`void main( ) {`), so match loosely.
			.replace( /void\s+main\s*\(\s*\)\s*{/, value => `${ value }\n\tif ( twinCovered( vTwinWorld ) ) discard;` );

	};
	material.needsUpdate = true;

}

const COVER_GLSL = /* glsl */`
uniform sampler2D twinCutTex;
uniform vec2 twinCutOrigin;
uniform vec2 twinCutSize;
uniform float twinCutOn;
varying vec3 vTwinWorld;

// Inside the drawn earthworks (mask green) and not well below their surface (mask red),
// bilinear between the four nodes around the point.
bool twinCovered( vec3 p ) {

	if ( twinCutOn < 0.5 ) return false;
	vec2 g = p.xz / ${ CELL.toFixed( 3 ) } - twinCutOrigin;
	vec2 i = floor( g );
	if ( i.x < 0.0 || i.y < 0.0 || i.x >= twinCutSize.x - 1.0 || i.y >= twinCutSize.y - 1.0 ) return false;
	vec2 f = g - i;
	ivec2 c = ivec2( i );
	vec3 a = texelFetch( twinCutTex, c, 0 ).rgb;
	vec3 b = texelFetch( twinCutTex, c + ivec2( 1, 0 ), 0 ).rgb;
	vec3 d = texelFetch( twinCutTex, c + ivec2( 0, 1 ), 0 ).rgb;
	vec3 e = texelFetch( twinCutTex, c + ivec2( 1, 1 ), 0 ).rgb;
	vec3 v = mix( mix( a, b, f.x ), mix( d, e, f.x ), f.y );
	// Below a flatten area's 'flatten up to' height (mask blue), as the flattening keeps what's above.
	return v.g > 0.5 && p.y > v.r - ${ HIDE_BELOW.toFixed( 3 ) } && p.y < v.b;

}
`;

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
