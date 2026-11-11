import { BoxGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { makeMachine, makeWorker } from './repair-crew-figures.js';

// The people and machines in the timeline (repair-timeline.js). Looking back at a day: a worker
// with a chipping hammer at each panel our crew chipped that day (up to MAX_WORKERS of them, spread
// out), in front of a wall, bent over a floor panel or under a soffit, on a scaffold tower where the
// panel is out of reach; and in each hopper bay others broke out that day, the bay's concrete in a
// heap on the gallery's floor with a demolition machine breaking it up. They're there only while
// looking back, to show the work: nothing collides with them, and nothing is saved.
//
// Positions are worked out in the model's markup frame (x = C31 grid, y = elevation, z = minus the
// letter grid) from the structure's triangles, then put in the model, so they move with it. The
// figures (repair-crew-figures.js) are kept and used again from day to day, so playing through the
// days doesn't build them over and over.

const MAX_WORKERS = 6;
const SPREAD = 4; // m apart at the least, while there are enough panels to choose from
const MAX_MACHINES = 3;
// The aims the worker takes (radians): a wall in front, the floor in front, a soffit overhead, and
// the range searched for a wall panel low or high on the wall.
const AIM = { wall: 0, floor: - 1.2, up: 1.25, low: - 0.9, high: 0.9 };
// Out of reach by more than this (m), the worker stands on a scaffold tower.
const REACH_SLACK = 0.35;
const DOWN = new Vector3( 0, - 1, 0 );

// ---------- Where to stand ----------

// The first floor (a surface facing up: not a soffit or a beam's underside) below a point, within
// `max` m: its height, or null.
export function floorBelow( p, triangles, max = 30 ) {

	let best = null;
	const e1 = new Vector3(), e2 = new Vector3(), h = new Vector3(), s = new Vector3(), q = new Vector3(), n = new Vector3();
	for ( const { a, b, c } of triangles ) {

		e1.subVectors( b, a );
		e2.subVectors( c, a );
		n.crossVectors( e1, e2 );
		if ( n.y < 0.6 * n.length() ) continue;
		h.crossVectors( DOWN, e2 );
		const det = e1.dot( h );
		if ( Math.abs( det ) < 1e-12 ) continue;
		s.subVectors( p, a );
		const u = s.dot( h ) / det;
		if ( u < 0 || u > 1 ) continue;
		q.crossVectors( s, e1 );
		const v = DOWN.dot( q ) / det;
		if ( v < 0 || u + v > 1 ) continue;
		const t = e2.dot( q ) / det;
		if ( t > 1e-4 && t <= max && ( best === null || t < best ) ) best = t;

	}

	return best === null ? null : p.y - best;

}

// Whether a wall (a surface not facing up or down) is in the way from a point, level along `dir`,
// within `dist` m.
export function blocked( p, dir, dist, triangles ) {

	const e1 = new Vector3(), e2 = new Vector3(), h = new Vector3(), s = new Vector3(), q = new Vector3(), n = new Vector3();
	for ( const { a, b, c } of triangles ) {

		e1.subVectors( b, a );
		e2.subVectors( c, a );
		n.crossVectors( e1, e2 );
		if ( Math.abs( n.y ) > 0.5 * n.length() ) continue;
		h.crossVectors( dir, e2 );
		const det = e1.dot( h );
		if ( Math.abs( det ) < 1e-12 ) continue;
		s.subVectors( p, a );
		const u = s.dot( h ) / det;
		if ( u < 0 || u > 1 ) continue;
		q.crossVectors( s, e1 );
		const v = dir.dot( q ) / det;
		if ( v < 0 || u + v > 1 ) continue;
		const t = e2.dot( q ) / det;
		if ( t > 1e-4 && t <= dist ) return true;

	}

	return false;

}

// Room for a worker: from the work, back along `facing` to where they stand and a body's depth
// past it, nothing in the way at knee and chest height above `floor`.
const BODY = 0.35;
const roomFor = ( c, facing, r, floor, triangles ) => [ 0.5, 1.3 ].every( up => ! blocked( c.clone().setY( floor + up ), facing.clone().negate(), r.forward + BODY, triangles ) );

const centroid = pts => pts.reduce( ( c, p ) => c.add( new Vector3( ...p ) ), new Vector3() ).divideScalar( pts.length );
const AROUND = Array.from( { length: 8 }, ( _, i ) => new Vector3( Math.cos( i * Math.PI / 4 ), 0, Math.sin( i * Math.PI / 4 ) ) );

// Where a figure's origin goes for its working point ( reach: { forward, height, x } ) to be at
// `target`, facing `facing` (level): the target less the reach, turned the way it faces.
export function originFor( target, facing, reach ) {

	const left = new Vector3( facing.z, 0, - facing.x );
	return target.clone().addScaledVector( facing, - reach.forward ).addScaledVector( left, - ( reach.x ?? 0 ) ).setY( target.y - reach.height );

}

// Where a worker stands to chip an area ( m: { pts, n } ), with reach( aim ) -> { forward, height,
// x } the chisel tip from their feet at that aim: { feet: Vector3, facing: Vector3 (level, towards
// the work), aim, deck (m the scaffold's deck is above the floor, 0 for none), floor }, or null if
// there's nowhere to stand.
export function workerSpot( m, triangles, reach ) {

	const c = centroid( m.pts );
	const n = new Vector3( ...m.n ).normalize();

	// A floor panel: bent over it, from whichever side there's floor to stand on at its level.
	if ( n.y > 0.6 ) {

		const r = reach( AIM.floor );
		for ( const facing of AROUND ) {

			const feet = originFor( c, facing, r );
			const floor = floorBelow( feet.clone().setY( c.y + 0.6 ), triangles, 1 );
			if ( floor !== null && Math.abs( floor - c.y ) < 0.25 && roomFor( c, facing, r, floor, triangles ) ) return { feet: feet.setY( floor ), facing, aim: AIM.floor, deck: 0, floor };

		}

		return null;

	}

	// A soffit: under it with the tool up, on a scaffold if it's high.
	if ( n.y < - 0.6 ) {

		const r = reach( AIM.up );
		for ( const facing of AROUND ) {

			const feet = originFor( c, facing, r );
			const floor = floorBelow( feet.clone().setY( c.y - 0.05 ), triangles );
			if ( floor === null || ! roomFor( c, facing, r, floor, triangles ) ) continue;
			const deck = c.y - floor - r.height > REACH_SLACK ? c.y - floor - r.height : 0;
			return { feet: feet.setY( floor + deck ), facing, aim: AIM.up, deck, floor };

		}

		return null;

	}

	// A wall: facing it with the tool at the panel's middle, bent down to a low one or reaching up
	// to a high one, and on a scaffold where it's higher than that.
	const out = new Vector3( n.x, 0, n.z ).normalize();
	const facing = out.clone().negate();
	const floor = floorBelow( c.clone().addScaledVector( out, 0.6 ), triangles );
	if ( floor === null ) return null;
	const above = c.y - floor;
	let aim = AIM.wall, deck = 0;
	if ( above > reach( AIM.high ).height + REACH_SLACK ) deck = above - reach( AIM.wall ).height;
	else {

		// The aim whose tip is nearest the panel's height.
		let miss = Infinity;
		for ( let k = 0; k <= 36; k ++ ) {

			const a = AIM.low + ( AIM.high - AIM.low ) * k / 36;
			const off = Math.abs( reach( a ).height - above );
			if ( off < miss ) [ miss, aim ] = [ off, a ];

		}

	}

	const feet = originFor( c, facing, reach( aim ) );
	// On the floor where the feet are (a trench beside a curb wall, a sloping tunnel).
	const under = floorBelow( feet.clone().setY( c.y + 0.05 ), triangles ) ?? floor;
	return { feet: feet.setY( under + deck ), facing, aim, deck, floor: under };

}

// ---------- Scaffold tower and rubble ----------

const SCAFFOLD = { width: 1.3, depth: 0.9, deck: 0.05, post: 0.05, rail: 1.0 };
const steel = new MeshStandardMaterial( { color: '#a9b1ba', metalness: 0.4, roughness: 0.5 } );
const boards = new MeshStandardMaterial( { color: '#c98b3a', roughness: 0.85 } );
const toeBoard = new MeshStandardMaterial( { color: '#f2c14e', roughness: 0.7 } );
const broken = new MeshStandardMaterial( { color: '#aeb4bb', roughness: 1, flatShading: true } );
const rusty = new MeshStandardMaterial( { color: '#7c4a2d', metalness: 0.4, roughness: 0.7 } );

const disposer = g => () => g.traverse( o => o.isMesh && o.geometry.dispose() );

// A mobile scaffold tower whose deck is `height` up, open at the front (+Z, towards the work).
function makeScaffold( height ) {

	const g = new Group();
	const { width, depth, deck, post, rail } = SCAFFOLD;
	const box = ( w, h, d, material, x, y, z ) => {

		const mesh = new Mesh( new BoxGeometry( w, h, d ), material );
		mesh.position.set( x, y, z );
		g.add( mesh );

	};
	box( width, deck, depth, boards, 0, height - deck / 2, 0 );
	for ( const x of [ - 1, 1 ] ) for ( const z of [ - 1, 1 ] ) box( post, height + rail, post, steel, x * ( width - post ) / 2, ( height + rail ) / 2, z * ( depth - post ) / 2 );
	// Guard rails at the back and the sides, ledgers every 2 m up, a toe board at the back.
	for ( const y of [ height + rail / 2, height + rail ] ) {

		box( width, post, post, steel, 0, y, - ( depth - post ) / 2 );
		for ( const x of [ - 1, 1 ] ) box( post, post, depth, steel, x * ( width - post ) / 2, y, 0 );

	}

	for ( let y = 0.15; y < height - 0.3; y += 2 ) for ( const z of [ - 1, 1 ] ) box( width, post, post, steel, 0, y, z * ( depth - post ) / 2 );
	box( width, 0.15, 0.02, toeBoard, 0, height + 0.075, - ( depth - 0.02 ) / 2 );
	g.userData.dispose = disposer( g );
	return g;

}

// A heap of broken concrete with bits of bar in it, about `top` m high, on the ground: the same heap
// for the same `seed`.
function makeRubble( seed, top ) {

	const g = new Group();
	let state = [ ...seed ].reduce( ( h, c ) => ( h * 31 + c.charCodeAt( 0 ) ) >>> 0, 9 ) || 1;
	const rand = () => ( state = ( state * 1664525 + 1013904223 ) >>> 0 ) / 4294967296;
	for ( let i = 0; i < 16; i ++ ) {

		const r = 0.1 + rand() * 0.22;
		const out = Math.sqrt( rand() ) * 0.85;
		const turn = rand() * Math.PI * 2;
		const chunk = new Mesh( new IcosahedronGeometry( r, 0 ), broken );
		chunk.scale.set( 1, 0.55 + rand() * 0.35, 0.8 + rand() * 0.4 );
		chunk.rotation.set( rand() * 3, rand() * 3, rand() * 3 );
		// Higher in the middle.
		chunk.position.set( Math.cos( turn ) * out, Math.max( r * 0.5, ( top - r * 0.6 ) * ( 1 - out / 0.85 ) ), Math.sin( turn ) * out );
		g.add( chunk );

	}

	for ( let i = 0; i < 4; i ++ ) {

		const bar = new Mesh( new CylinderGeometry( 0.008, 0.008, 0.5 + rand() * 0.6, 5 ), rusty );
		bar.position.set( ( rand() - 0.5 ) * 1.1, 0.08 + rand() * top * 0.6, ( rand() - 0.5 ) * 1.1 );
		bar.rotation.set( Math.PI / 2 + ( rand() - 0.5 ) * 0.6, rand() * Math.PI, ( rand() - 0.5 ) * 0.6 );
		g.add( bar );

	}

	g.userData.dispose = disposer( g );
	return g;

}

// ---------- The crew ----------

// Spread out: the biggest panels first, none nearer than SPREAD to one already taken while there
// are others to choose.
function spread( list, max ) {

	const sorted = [ ...list ].sort( ( a, b ) => ( b.m.area ?? 0 ) - ( a.m.area ?? 0 ) );
	const taken = [];
	for ( const minimum of [ SPREAD, 0 ] ) for ( const item of sorted ) {

		if ( taken.length >= max || taken.includes( item ) ) continue;
		const at = centroid( item.m.pts );
		if ( taken.every( other => centroid( other.m.pts ).distanceTo( at ) >= minimum ) ) taken.push( item );

	}

	return taken;

}

// onUpdate( fn ): fn( dt ) every frame. Returns { show( s, chipping, removing ), clear( s ), count }.
// s: a model's state in repair-areas.js (content, origin, all: its structure's triangles in the
// markup frame); chipping: [ { m } ] the areas being chipped that day; removing: [ { name, x: [ x0,
// x1 ], positions, towards } ] the parts others took out that day (towards: +1 or -1 along x, the
// way the work went).
export function createCrew( { onUpdate } ) {

	const shown = new Map(); // s -> { group, key, figures (animated), extras (made for the day) }
	// Figures kept for the next day: built once, posed and placed again.
	const spare = { worker: [], machine: [] };
	const take = kind => spare[ kind ].pop() ?? ( kind === 'worker' ? makeWorker( { aim: 0 } ) : makeMachine() );
	let time = 0;

	function clear( s ) {

		const was = shown.get( s );
		if ( ! was ) return;
		was.group.removeFromParent();
		for ( const figure of was.figures ) {

			figure.removeFromParent();
			spare[ figure.userData.kind === 'demolition-machine' ? 'machine' : 'worker' ].push( figure );

		}

		for ( const extra of was.extras ) extra.userData.dispose?.();
		shown.delete( s );

	}

	function show( s, chipping, removing ) {

		const key = [ ...chipping.map( c => c.m.id ), '|', ...removing.map( r => r.name ) ].join( ',' );
		if ( shown.get( s )?.key === key ) return;
		clear( s );
		if ( ! chipping.length && ! removing.length ) return;
		const group = new Group();
		group.name = 'Crew';
		// People and machines stay solid when the model is made see-through (underground.js), like the
		// repair areas: and a figure kept for another day never keeps a see-through look.
		group.userData.xraySolid = true;
		const figures = [], extras = [];
		const place = ( object, origin, facing ) => {

			object.position.copy( origin ).sub( s.origin );
			object.rotation.set( 0, Math.atan2( facing.x, facing.z ), 0 );
			object.traverse( o => o.userData.noCollide = true );
			group.add( object );

		};
		for ( const { m } of spread( chipping, MAX_WORKERS ) ) {

			const worker = take( 'worker' );
			const spot = workerSpot( m, s.all, aim => {

				worker.userData.setAim( aim );
				return worker.userData.reach();

			} );
			if ( ! spot ) {

				spare.worker.push( worker );
				continue;

			}

			worker.userData.setAim( spot.aim );
			// Not all in step.
			worker.userData.phase = figures.length * 1.37;
			place( worker, spot.feet, spot.facing );
			figures.push( worker );
			if ( spot.deck > 0 ) {

				const scaffold = makeScaffold( spot.deck );
				place( scaffold, spot.feet.clone().setY( spot.floor ), spot.facing );
				extras.push( scaffold );

			}

		}

		// The bay's concrete in a heap on the floor in the middle of the bay, and a machine in the bay
		// before it (broken out already) breaking it up, facing the way the work went.
		for ( const part of removing.slice( 0, MAX_MACHINES ) ) {

			const middle = new Vector3( ( part.x[ 0 ] + part.x[ 1 ] ) / 2, Infinity, 0 );
			let z0 = Infinity, z1 = - Infinity;
			for ( let i = 0; i < part.positions.length; i += 3 ) {

				middle.y = Math.min( middle.y, part.positions[ i + 1 ] );
				z0 = Math.min( z0, part.positions[ i + 2 ] );
				z1 = Math.max( z1, part.positions[ i + 2 ] );

			}

			middle.z = ( z0 + z1 ) / 2;
			const floor = floorBelow( middle, s.all );
			if ( floor === null ) continue;
			const machine = take( 'machine' );
			const reach = machine.userData.reach();
			const facing = new Vector3( part.towards ?? 1, 0, 0 );
			const heap = makeRubble( part.name, reach.height );
			place( heap, middle.clone().setY( floor ), facing );
			extras.push( heap );
			machine.userData.phase = figures.length * 1.37;
			place( machine, originFor( middle.clone().setY( floor + reach.height ), facing, reach ).setY( floor ), facing );
			figures.push( machine );

		}

		s.content.add( group );
		shown.set( s, { group, key, figures, extras } );
		tick();

	}

	const tick = () => {

		for ( const { figures } of shown.values() ) for ( const figure of figures ) figure.userData.tick?.( time + ( figure.userData.phase ?? 0 ) );

	};
	onUpdate?.( dt => {

		if ( ! shown.size ) return;
		time += dt;
		tick();

	} );

	return {
		show, clear,
		// How many people and machines are shown.
		get count() {

			return [ ...shown.values() ].reduce( ( n, { figures } ) => n + figures.length, 0 );

		},
	};

}
