// npm run test:shoring: the shoring's plans and drawings in Node, with no browser (about 2 s).
// Pits saved before support levels could be chosen are planned and drawn exactly as the first
// shoring did (pinned below: its strings, and a digest of every vertex per material, captured from
// it); the ground's shader (shoring-ground.js, run here as a JS copy of its GLSL) moves old pits'
// walls exactly as the first one did, and beside slopes moves only the walls' own faces, down to
// the slopes' depth; walls, levels and members drawn as excavation-design.js plans them; dig stages
// shown as prefixes of each mesh, without a rebuild; the P panel's text; draw calls.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { EventDispatcher, Group, MathUtils, MeshStandardMaterial, Vector3 } from 'three';
import * as X from '../src/excavation-design.js';
import { SUPPORTS, planShoring, setUpShoring } from '../src/shoring.js';

const CELL = 0.5;
const BAND = 0.75;

// The first shoring's plans for old params, and a digest of what it drew (sorted vertices to
// 0.1 mm, per material), for a pit at the origin facing north with its rim at 0.
const OLD_PITS = [
	{
		params: { width: 3, length: 20, depth: 3, slope: 1, support: 'trench-box' },
		summary: '3 boxes: 2 × 2.4 × 7.3 m (8 × 24 ft) + 1 × 2.4 × 4.9 m (8 × 16 ft), with stackers 2 × 1.2 × 7.3 m (4 × 24 ft) + 1 × 1.2 × 4.9 m (4 × 16 ft); 2.8 m between panels, top 0.7 m above the rim',
		wall: 117.04320000000001,
		weight: '17 t steel',
		notes: [ 'Ends are open: slope them, or fit end plates, before anyone works there (WorkSafeBC 20.81(2)).', 'The boxes leave 0.2 m at each end.', '3 boxes line all of it; usually one or two are dragged along as the pipe goes in, and the trench behind them backfilled.' ],
		meshes: { box: '432 1d1f261b7aa0c328', boxTrim: '21888 e6d82ec51848f8b9', spreader: '2592 d9771b901a70aa87', earth: '72 c4c6b4e3df630443' },
	},
	{
		params: { width: 20, length: 3, depth: 4.5, slope: 1, support: 'trench-box' },
		summary: '6 boxes, 2 high: 4 × 2.4 × 7.3 m (8 × 24 ft) + 2 × 2.4 × 4.9 m (8 × 16 ft); 2.8 m between panels, top 0.4 m above the rim',
		wall: 175.56480000000002,
		weight: '23 t steel',
		notes: [ 'Ends are open: slope them, or fit end plates, before anyone works there (WorkSafeBC 20.81(2)).', 'The boxes leave 0.2 m at each end.', '3 boxes line all of it; usually one or two are dragged along as the pipe goes in, and the trench behind them backfilled.' ],
		meshes: { box: '432 98c424c97306c3bc', boxTrim: '23616 d82314591f25fe20', spreader: '3456 7e68fcd0fc73a745', earth: '72 441c133d4ff4e6be' },
	},
	{
		params: { width: 12, length: 12, depth: 4.5, slope: 1, support: 'slide-rail' },
		summary: '24 panels in 12 posts (bays 4.0 m or less), 2 high',
		wall: 216,
		weight: '40 t steel',
		notes: [  ],
		meshes: { railPost: '432 bfb954216fc31062', railPanel: '1728 30298be0e8318ad6', earth: '144 010531afae457fc3' },
	},
	{
		params: { width: 4, length: 18, depth: 3, slope: 1, support: 'hydraulic' },
		summary: '8 shores 2.4 m apart, 3 cylinders each (24 in all), on 3.0 m rails',
		wall: 108,
		weight: '0.5 t aluminium',
		notes: [ 'Ends are open: slope them or shore them too (WorkSafeBC 20.81(2)).', 'In loose or wet ground, add plywood sheeting behind the rails.' ],
		meshes: { aluminium: '576 ccf7de7fdf2d53e5', cylinder: '4608 2c439268583bbdb9', rod: '2304 30c4441a392ea0f9', earth: '144 5712252b90b4080e' },
	},
	{
		params: { width: 12, length: 12, depth: 4.5, slope: 1, support: 'sheet-piles' },
		summary: '80 sheets, 48 m of wall, 8.5 m long each (Z-profile, 0.6 m wide); waler round the inside, 2 struts across, 4 corner braces',
		wall: 216,
		weight: '53 t steel',
		notes: [ 'A professional engineer designs the wall: the sheet length and bracing here are rough.' ],
		meshes: { earth: '1584 d3d16a2820293dfa', sheet: '1464 e62fb2f5cf07909c', waler: '432 7caf90a36c92041b', strut: '864 dae172d4fe3aa55c' },
	},
	{
		params: { width: 60, length: 40, depth: 6.5, slope: 1, support: 'sheet-piles' },
		summary: '334 sheets, 200 m of wall, 11.5 m long each (Z-profile, 0.6 m wide); waler round the inside, 4 corner braces',
		wall: 1300,
		weight: '272 t steel',
		notes: [ 'A professional engineer designs the wall: the sheet length and bracing here are rough.', 'Over 4 m deep and too wide to strut across: rakers or tie-backs.', 'Over 6 m deep: the shoring is to a professional engineer\'s written design (WorkSafeBC 20.78).' ],
		meshes: { earth: '6156 67b2c02e832c0f5e', sheet: '6036 5e18cea6f0b17778', waler: '432 db509a7652e93551', strut: '576 35af4323413ebd12' },
	},
	{
		params: { width: 3, length: 20, depth: 3, slope: 1, support: 'sheet-piles' },
		summary: '76 sheets, 46 m of wall, 7.0 m long each (Z-profile, 0.6 m wide); waler round the inside',
		wall: 138,
		weight: '39 t steel',
		notes: [ 'A professional engineer designs the wall: the sheet length and bracing here are rough.' ],
		meshes: { earth: '1512 d0576fc224aa6cbf', sheet: '1392 3c136c607e060b4a', waler: '432 c17fccb4801fe725' },
	},
	{
		params: { width: 25, length: 14, depth: 6.5, slope: 1, support: 'soldier-piles' },
		summary: '34 soldier piles (HP310, 2.3 m apart or less, 12.0 m long each), 530 m² of timber lagging (39.8 m³)',
		wall: 507,
		weight: '32 t steel',
		notes: [ 'A professional engineer designs the wall: the pile length and spacing here are rough.', 'Over 4 m deep: soldier piles need walers with struts, rakers or tie-backs.', 'Over 6 m deep: the shoring is to a professional engineer\'s written design (WorkSafeBC 20.78).' ],
		meshes: { pile: '3672 5392e5f2914c8a0e', timber: '26928 6ceaff571de47e06', earth: '144 f7c3a957240ceba0' },
	},
	{
		params: { width: 8, length: 30, depth: 1.5, slope: 0.5, support: 'none' },
		summary: '',
		wall: 0,
		weight: '',
		notes: [ 'Over 1.2 m deep, with sides steeper than WorkSafeBC allows even in hard, solid soil (3 : 4): slope, bench or shore them before anyone goes in (OHS Regulation 20.81).' ],
		meshes: null,
	},
	{
		params: { width: 8, length: 30, depth: 9, slope: 1.5, support: 'none' },
		summary: '',
		wall: 0,
		weight: '',
		notes: [ 'Over 6 m deep: dug to a qualified registered professional\'s written instructions (WorkSafeBC 20.78).' ],
		meshes: null,
	},
];

// The shoring in a scene of its own, as earthworks.js sets it up, with stand-ins for the rest.
globalThis.window ??= {};
class Models extends EventDispatcher {

	constructor() {

		super();
		this.entries = [];

	}

}

const models = new Models();
const terrain = Object.assign( new EventDispatcher(), { material: new MeshStandardMaterial() } );
const shoring = setUpShoring( { scene: new Group(), models, terrain, layers: { addLayer() {} }, kind: 'excavation', rimOf: () => 0 } );

// A pit's shoring as drawn: its group, and per material the mesh, vertex count and drawn count.
function place( params, state = { east: 0, north: 0, heading: 0, up: 0 } ) {

	const entry = { kind: 'excavation', params: X.normaliseExcavation( params ), state };
	models.entries.push( entry );
	models.dispatchEvent( { type: 'add', entry } );
	return entry;

}

function drop( entry ) {

	models.entries.splice( models.entries.indexOf( entry ), 1 );
	models.dispatchEvent( { type: 'remove', entry } );

}

function change( entry, params ) {

	entry.params = X.normaliseExcavation( { ...entry.params, ...params } );
	models.dispatchEvent( { type: 'change', entry } );

}

function meshes( entry ) {

	const out = {};
	shoring.shown.get( entry )?.group.traverse( o => {

		if ( o.isMesh ) out[ o.material.name.replace( 'shoring ', '' ) ] = { mesh: o, vertices: o.geometry.attributes.position.count, drawn: o.visible ? Math.min( o.geometry.attributes.position.count, o.geometry.drawRange.count ) : 0 };

	} );
	return out;

}

function digest( entry ) {

	const group = shoring.shown.get( entry )?.group;
	if ( ! group ) return null;
	group.updateMatrixWorld( true );
	const out = {};
	const v = new Vector3();
	group.traverse( o => {

		if ( ! o.isMesh ) return;
		const p = o.geometry.attributes.position;
		const list = [];
		for ( let i = 0; i < p.count; i ++ ) {

			v.fromBufferAttribute( p, i ).applyMatrix4( o.matrixWorld );
			list.push( `${ v.x.toFixed( 4 ) },${ v.y.toFixed( 4 ) },${ v.z.toFixed( 4 ) }` );

		}

		list.sort();
		out[ o.material.name.replace( 'shoring ', '' ) ] = `${ p.count } ${ createHash( 'sha1' ).update( list.join( ';' ) ).digest( 'hex' ).slice( 0, 16 ) }`;

	} );
	return out;

}

// Vertices in a merged unit shape (shoring-models.js): a box, and a tube of n segments.
const BOX = 36;
const tube = n => 12 * n;

test( 'old pits: the first shoring\'s plans and drawings, unchanged', () => {

	for ( const pin of OLD_PITS ) {

		const plan = planShoring( pin.params );
		assert.equal( plan.summary, pin.summary );
		assert.equal( plan.wall, pin.wall );
		assert.equal( plan.weight, pin.weight );
		assert.deepEqual( plan.notes, pin.notes );
		const entry = place( pin.params );
		assert.deepEqual( digest( entry ), pin.meshes, JSON.stringify( pin.params ) );
		// Finished: every mesh drawn whole.
		for ( const { vertices, drawn } of Object.values( meshes( entry ) ) ) assert.equal( drawn, vertices );
		drop( entry );

	}

	// The support dropdown keeps the first five names and values, and adds the pile walls.
	assert.deepEqual( Object.entries( SUPPORTS ), [ [ 'none / sloped', 'none' ], [ 'Trench box', 'trench-box' ], [ 'Slide rail', 'slide-rail' ], [ 'Hydraulic shores', 'hydraulic' ], [ 'Sheet piles', 'sheet-piles' ], [ 'Soldier piles + lagging', 'soldier-piles' ], [ 'Secant pile wall', 'secant-piles' ], [ 'Contiguous pile wall', 'contiguous-piles' ] ] );

} );

// --- the ground's shader, as JavaScript ----------------------------------------------------------

// shoring-ground.js's GLSL line for line (smoothstep, step and the same order of operations), on
// one pit's six uniform vectors.
const step = ( edge, x ) => x < edge ? 0 : 1;
const ease = x => MathUtils.smoothstep( x, - CELL, CELL );
function shoreNode( [ a, b, s1, s2, s3, s4 ], p ) {

	const d = [ p.x - a[ 0 ], p.z - a[ 1 ] ];
	if ( d[ 0 ] * d[ 0 ] + d[ 1 ] * d[ 1 ] > a[ 2 ] ) return false;
	const c = b[ 0 ];
	const s = b[ 1 ];
	let u = - d[ 0 ] * c - d[ 1 ] * s;
	let v = - d[ 0 ] * s + d[ 1 ] * c;
	if ( Math.abs( u ) < b[ 2 ] && Math.abs( v ) < b[ 3 ] ) return false;
	const e = [ s1[ 0 ] - v, s2[ 0 ] - u, s3[ 0 ] + v, s4[ 0 ] + u ];
	const t = [ u, v, u, v ];
	const along = [ s1, s2, s3, s4 ].map( ( side, k ) => step( side[ 2 ], t[ k ] ) * step( t[ k ], side[ 3 ] ) );
	const near = along.map( ( x, k ) => x * step( Math.abs( e[ k ] ), BAND + CELL ) );
	if ( near.every( x => x === 0 ) ) return false;
	const snap = along.map( ( x, k ) => x * step( Math.abs( e[ k ] ), BAND ) );
	if ( snap.every( x => x === 0 ) ) return true;
	const rim = a[ 3 ];
	const inside = Math.min( ...e );
	if ( inside >= 0 ) {

		const dug = ( rim - p.y ) / ease( inside );
		p.y = rim - dug * ease( Math.min( ...e.map( ( x, k ) => snap[ k ] ? 1e9 : x ) ) );

	} else p.y = Math.max( p.y, rim );
	if ( snap[ 0 ] + snap[ 2 ] > 0 ) v = snap[ 0 ] > 0 && ( snap[ 2 ] === 0 || Math.abs( e[ 0 ] ) <= Math.abs( e[ 2 ] ) ) ? s1[ 0 ] + s1[ 1 ] : - ( s3[ 0 ] + s3[ 1 ] );
	if ( snap[ 1 ] + snap[ 3 ] > 0 ) u = snap[ 1 ] > 0 && ( snap[ 3 ] === 0 || Math.abs( e[ 1 ] ) <= Math.abs( e[ 3 ] ) ) ? s2[ 0 ] + s2[ 1 ] : - ( s4[ 0 ] + s4[ 1 ] );
	p.x = a[ 0 ] + ( - u * c - v * s );
	p.z = a[ 1 ] + ( - u * s + v * c );
	return true;

}

// The first shoring's GLSL (three vectors a pit: centre and turn; half sizes, rim and back; how far
// along each pair of walls it's shored), on the uniforms it set from the pit and its plan.
function firstShoreNode( params, state, rim, p ) {

	const plan = planShoring( params );
	const { width, length } = params;
	const rad = state.heading * Math.PI / 180;
	const long = plan.sides === 'long';
	const reach = long ? Math.min( plan.ground.reach, Math.max( width, length ) / 2 ) : Infinity;
	const alongLength = ! long || width <= length ? reach : null;
	const alongWidth = ! long || width > length ? reach : null;
	const r = ( along, half ) => along === null ? - 1 : Math.min( along, half + BAND + CELL );
	const f = Math.fround;
	const [ a, b, c ] = [ [ - state.east, state.north, Math.cos( rad ), Math.sin( rad ) ], [ width / 2, length / 2, rim, plan.ground.back ], [ r( alongLength, length / 2 ), r( alongWidth, width / 2 ) ] ].map( vec => vec.map( f ) );
	const d = [ p.x - a[ 0 ], p.z - a[ 1 ] ];
	let u = - d[ 0 ] * a[ 2 ] - d[ 1 ] * a[ 3 ];
	let v = - d[ 0 ] * a[ 3 ] + d[ 1 ] * a[ 2 ];
	const su = b[ 0 ] - Math.abs( u );
	const sv = b[ 1 ] - Math.abs( v );
	const nearU = c[ 0 ] >= 0 && Math.abs( v ) <= c[ 0 ] && Math.abs( su ) <= BAND + CELL;
	const nearV = c[ 1 ] >= 0 && Math.abs( u ) <= c[ 1 ] && Math.abs( sv ) <= BAND + CELL;
	if ( ! nearU && ! nearV ) return false;
	const snapU = nearU && Math.abs( su ) <= BAND;
	const snapV = nearV && Math.abs( sv ) <= BAND;
	if ( ! snapU && ! snapV ) return true;
	const inside = Math.min( su, sv );
	if ( inside >= 0 ) {

		const dug = ( b[ 2 ] - p.y ) / ease( inside );
		let rest = 1e9;
		if ( ! snapU ) rest = Math.min( rest, su );
		if ( ! snapV ) rest = Math.min( rest, sv );
		p.y = b[ 2 ] - dug * ease( rest );

	} else p.y = Math.max( p.y, b[ 2 ] );
	if ( snapU ) u = ( u < 0 ? - 1 : 1 ) * ( b[ 0 ] + b[ 3 ] );
	if ( snapV ) v = ( v < 0 ? - 1 : 1 ) * ( b[ 1 ] + b[ 3 ] );
	p.x = a[ 0 ] + ( - u * a[ 2 ] - v * a[ 3 ] );
	p.z = a[ 1 ] + ( - u * a[ 3 ] + v * a[ 2 ] );
	return true;

}

// The uniforms shoring.js gives the ground for one pit, as float32 (the GPU's).
function uniformsOf( params, state ) {

	const entry = place( params, state );
	const values = shoring.ground.uniforms.twinShore.value;
	const count = shoring.ground.uniforms.twinShoreCount.value;
	const pit = [ ...shoring.shown.keys() ].filter( e => shoring.shown.get( e ).group.visible ).indexOf( entry );
	const out = pit < 0 ? null : values.slice( 6 * pit, 6 * pit + 6 ).map( v => v.toArray().map( Math.fround ) );
	drop( entry );
	assert.ok( count >= 1 );
	return out;

}

test( 'the ground: old pits\' walls moved exactly as the first shoring moved them', () => {

	let nodes = 0;
	let worst = 0;
	for ( const support of [ 'trench-box', 'slide-rail', 'hydraulic', 'sheet-piles', 'soldier-piles' ] ) {

		for ( const [ width, length ] of [ [ 3, 20 ], [ 20, 3 ], [ 12, 12 ] ] ) {

			for ( const heading of [ 0, 30, 211.25 ] ) {

				const params = { width, length, depth: 3, slope: 1, support };
				const state = { east: 7.5, north: - 3.25, heading, up: 0 };
				const U = uniformsOf( params, state );
				for ( let x = - 14; x <= 14; x += 0.37 ) {

					for ( let z = - 14; z <= 14; z += 0.37 ) {

						for ( const y of [ 0, - 0.75, - 1.75, 1.5 ] ) {

							const p = { x: Math.fround( - 7.5 + x ), y, z: Math.fround( - 3.25 + z ) };
							const q = { ...p };
							assert.equal( shoreNode( U, q ), firstShoreNode( params, state, 0, p ) );
							worst = Math.max( worst, Math.abs( p.x - q.x ), Math.abs( p.y - q.y ), Math.abs( p.z - q.z ) );
							nodes ++;

						}

					}

				}

			}

		}

	}

	assert.ok( worst < 1e-6, `${ worst } m apart` );
	console.log( `${ nodes } nodes, at most ${ worst.toExponential( 1 ) } m from where the first shoring put them` );

} );

test( 'the ground beside slopes: only a wall\'s own face moves, onto its back, down to the slopes\' depth', () => {

	// Side 2 sheet piles between slopes (soil C, 1.5 : 1), 4 m deep; side 4 soldier piles.
	const params = X.normaliseExcavation( { width: 12, length: 20, depth: 4, outline: 'floor', slopeBy: 'soil', bracing: 'auto', method: 'sides', side1: 'slope', side2: 'sheet-piles', side3: 'slope', side4: 'soldier-piles' } );
	const state = { east: 0, north: 0, heading: 0, up: 0 };
	const U = uniformsOf( params, state );
	const { geom } = X.planExcavation( params );
	// The depth with the walls' easing taken away: the floor and the slopes, as if the walls were
	// sharp (their lines moved far out of the way).
	const sharp = { ...geom, sides: geom.sides.map( s => s.profile === 'vertical' ? { ...s, top: 1e6 } : s ) };
	let moved = 0;
	for ( let u = - 20; u <= 20; u += 0.13 ) {

		for ( let v = - 20; v <= 20; v += 0.13 ) {

			const depth = X.depthAt( geom, u, v, 4 );
			if ( depth === - Infinity ) continue;
			const p = { x: - u, y: - depth, z: v };
			const q = { ...p };
			shoreNode( U, q );
			const e2 = 6 - u;
			const e4 = 6 + u;
			// Along side 2 (from the top of side 3's slope to the top of side 1's, v ±16), within the
			// band: onto the sheets' back, down to what the slopes leave there.
			if ( Math.abs( e2 ) <= BAND && Math.abs( v ) <= 16 ) {

				assert.ok( Math.abs( - q.x - 6.21 ) < 1e-5, `u ${ - q.x } at ${ u }, ${ v }` );
				const want = e2 >= 0 ? - X.depthAt( sharp, u, v, 4 ) : Math.max( - depth, 0 );
				assert.ok( Math.abs( q.y - want ) < 1e-4, `${ q.y } for ${ want } at ${ u.toFixed( 2 ) }, ${ v.toFixed( 2 ) }` );
				moved ++;

			} else if ( Math.abs( e4 ) <= BAND && Math.abs( v ) <= 16 ) {

				// Side 4's lagging back is 55 mm in front of its line.
				assert.ok( Math.abs( - q.x - - 5.945 ) < 1e-5, `u ${ - q.x } at ${ u }, ${ v }` );

			} else if ( Math.abs( e2 ) > BAND + CELL && Math.abs( e4 ) > BAND + CELL ) {

				// Nowhere near a wall: the slopes and the floor as dug.
				assert.deepEqual( q, p );

			}

		}

	}

	assert.ok( moved > 500, `${ moved } moved` );

} );

// --- walls and members as planned -----------------------------------------------------------------

test( 'each wall system on its own sides, with as many piles or sheets drawn as the summary says', () => {

	const cases = [
		[ { width: 24, length: 40, depth: 10, outline: 'floor', method: 'shore', support: 'secant-piles', bracing: 'tiebacks' }, /^182 secant piles \(0\.88 m, 150 mm overlap\) on all four sides, 15\.5 m long each, under a capping beam; walers at 3 levels with 162 tiebacks$/ ],
		[ { width: 10, length: 8, depth: 3.5, outline: 'floor', method: 'shore', support: 'contiguous-piles', bracing: 'auto' }, /^58 contiguous piles \(0\.6 m, 100 mm gaps\) on all four sides, 9\.5 m long each, under a capping beam; cantilevered, with no support levels$/ ],
		[ { width: 12, length: 20, depth: 8, outline: 'floor', slopeBy: 'soil', bracing: 'auto', method: 'sides', side1: 'sheet-piles', side2: 'slope', side3: 'sheet-piles', side4: 'slope' }, /^120 sheets \(Z-profile, 0\.6 m wide\) on sides 1 and 3, 13\.0 m long each; walers at 3 levels with 9 struts across and 3 king posts$/ ],
		[ { width: 14, length: 10, depth: 6, outline: 'floor', bracing: 'auto', method: 'sides', side1: 'secant-piles', side2: 'sheet-piles', side3: 'contiguous-piles', side4: 'soldier-piles' }, /^19 sheets .* on side 2, 10\.0 m long each; 6 soldier piles \(HP310, 2\.3 m apart or less\) on side 4, 9\.5 m long each, 72 m² of timber lagging \(5\.4 m³\); 19 secant piles .* on side 1, .*; 20 contiguous piles .* on side 3, .*; walers at 2 levels with 6 struts across and 8 corner braces$/ ],
	];
	for ( const [ params, summary ] of cases ) {

		const entry = place( params );
		const plan = planShoring( entry.params );
		assert.match( plan.summary, summary );
		const m = meshes( entry );
		// Piles: tubes of 16 segments, under one capping beam (a box) a side.
		const beams = X.planExcavation( entry.params ).geom.sides.filter( s => s.system === 'secant-piles' || s.system === 'contiguous-piles' ).length;
		const kickers = X.planExcavation( entry.params ).plan.members.filter( mm => mm.type === 'kicker' || mm.type === 'tieback' );
		const bonds = kickers.filter( mm => mm.type === 'tieback' ).length;
		const concrete = ( m.concrete?.vertices ?? 0 ) + ( m.concreteLight?.vertices ?? 0 ) - beams * BOX - bonds * tube( 10 );
		const piles = [ ...plan.summary.matchAll( /(\d+) (?:secant|contiguous) piles/g ) ].reduce( ( sum, [ , n ] ) => sum + Number( n ), 0 );
		assert.equal( concrete / tube( 16 ), piles, JSON.stringify( params ) );
		// Sheets: three faces of the corrugation each (flange, web, flange), six vertices a face.
		const sheets = Number( /(\d+) sheets/.exec( plan.summary )?.[ 1 ] ?? 0 );
		assert.equal( ( m.sheet?.vertices ?? 0 ) / 18, sheets );
		drop( entry );

	}

} );

test( 'support levels: walers, struts, corner braces, king posts, rakers, kickers and tiebacks drawn as planned, to their depths', () => {

	const base = { width: 14, length: 22, depth: 8, outline: 'floor', method: 'shore', support: 'sheet-piles' };
	for ( const bracing of [ 'none', 'struts', 'rakers', 'tiebacks' ] ) {

		const entry = place( { ...base, bracing } );
		const { plan } = X.planExcavation( entry.params );
		const count = type => plan.members.filter( mm => mm.type === type ).length;
		const m = meshes( entry );
		const vertices = name => m[ name ]?.vertices ?? 0;
		// A waler is three boxes (flanges and web); struts, corner braces and rakers 12-sided tubes,
		// tieback heads a plate and a 10-sided tube; king posts an H-pile (three boxes).
		assert.equal( vertices( 'waler' ), 3 * BOX * count( 'waler' ), bracing );
		assert.equal( vertices( 'strut' ), tube( 12 ) * ( count( 'strut' ) + count( 'corner' ) + count( 'raker' ) ) + ( BOX + tube( 10 ) ) * count( 'tieback' ), bracing );
		assert.equal( vertices( 'pile' ), 3 * BOX * count( 'kingpost' ), bracing );
		assert.equal( vertices( 'concrete' ), BOX * count( 'kicker' ) + tube( 10 ) * count( 'tieback' ), bracing );
		assert.equal( vertices( 'tendon' ), tube( 8 ) * count( 'tieback' ), bracing );
		// The sheets go down to the embedment below the floor.
		m.sheet.mesh.geometry.computeBoundingBox();
		assert.ok( Math.abs( m.sheet.mesh.geometry.boundingBox.min.y - ( - 8 - plan.toe ) ) < 1e-6, `${ bracing }: sheets from ${ m.sheet.mesh.geometry.boundingBox.min.y }` );
		drop( entry );

	}

} );

test( 'dig stages: walls first, each level once it\'s in, lagging as it\'s dug; no rebuild', () => {

	const entry = place( { width: 12, length: 20, depth: 8, outline: 'floor', slopeBy: 'soil', bracing: 'auto', method: 'sides', side1: 'sheet-piles', side2: 'slope', side3: 'soldier-piles', side4: 'slope' } );
	const group = shoring.shown.get( entry ).group;
	const { stages } = X.planExcavation( entry.params );
	const seen = stages.map( ( stage, k ) => {

		change( entry, { stage: k } );
		assert.equal( shoring.shown.get( entry ).group, group );
		const m = meshes( entry );
		return [ m.sheet.drawn, m.waler.drawn, m.strut.drawn, m.pile.drawn, m.timber.drawn ];

	} );
	// sheets, walers, struts, soldier and king posts, lagging.
	const [ sheet, waler, strut ] = seen[ seen.length - 1 ];
	assert.deepEqual( seen.map( s => s.slice( 0, 3 ) ), [ [ sheet, 0, 0 ], [ sheet, 0, 0 ], [ sheet, waler / 3, strut / 3 ], [ sheet, waler / 3, strut / 3 ], [ sheet, 2 * waler / 3, 2 * strut / 3 ], [ sheet, 2 * waler / 3, 2 * strut / 3 ], [ sheet, waler, strut ], [ sheet, waler, strut ] ] );
	assert.ok( seen.every( s => s[ 3 ] === seen[ 0 ][ 3 ] && s[ 3 ] > 0 ), 'piles and king posts in from the start' );
	const lagging = seen.map( s => s[ 4 ] );
	assert.equal( lagging[ 0 ], 0 );
	assert.ok( lagging.every( ( n, k ) => k === 0 || n >= lagging[ k - 1 ] ) && lagging[ 7 ] > lagging[ 1 ] );
	// Back to finished: whole again.
	change( entry, { stage: - 1 } );
	assert.ok( Object.values( meshes( entry ) ).every( ( { vertices, drawn } ) => vertices === drawn ) );
	// Any other change rebuilds it.
	change( entry, { levels: '2, 5' } );
	assert.notEqual( shoring.shown.get( entry ).group, group );
	drop( entry );

	// Rakers: while the berm is left, its walls are still straightened (between the floor's corners).
	const rakers = place( { width: 30, length: 30, depth: 7, outline: 'floor', method: 'shore', support: 'sheet-piles', bracing: 'rakers', stage: 2 } );
	assert.equal( X.planExcavation( rakers.params ).stage.berm, 2.1 );
	const values = shoring.ground.uniforms.twinShore.value;
	const k = [ ...shoring.shown.keys() ].indexOf( rakers );
	assert.deepEqual( [ 1, 2, 3, 4 ].map( n => values[ 6 * k + 1 + n ].x ), [ 15, 15, 15, 15 ] );
	drop( rakers );

	// A trench box: hidden, and the ground left as dug, before digging.
	const trench = place( { width: 3, length: 20, depth: 3, outline: 'floor', method: 'shore', support: 'trench-box', stage: 0 } );
	assert.equal( shoring.shown.get( trench ).group.visible, false );
	assert.equal( shoring.ground.uniforms.twinShoreCount.value, shoring.shown.size - 1 );
	drop( trench );

} );

test( 'P panel text: the support levels, and the checks less what the notes say, alike sides said once', () => {

	const plan = planShoring( { width: 10, length: 8, depth: 3.5, outline: 'floor', method: 'shore', support: 'contiguous-piles', bracing: 'auto' } );
	assert.equal( plan.levels, 'None (cantilever), suggested for 3.5 m deep: no support levels; embedment 5.3 m below the floor (1.5 times the depth); contiguous piles 9.5 m long.' );
	assert.match( plan.checks, /All four sides: water comes through the contiguous pile wall below the groundwater/ );
	assert.equal( plan.checks.match( /water comes through/g ).length, 1 );
	assert.equal( plan.weight, '173 m³ concrete' );
	const deep = planShoring( { width: 24, length: 40, depth: 10, outline: 'floor', method: 'shore', support: 'secant-piles', bracing: 'tiebacks' } );
	for ( const id of X.COVERED ) assert.ok( ! deep.design.flags.some( f => f.id === id && deep.checks.includes( f.text.slice( 0, 30 ) ) ), id );
	assert.match( deep.levels, /no-dig zone 13\.9 m behind all four sides/ );
	// Sloped trench ends: no open-ends note, boxes on the 14 m of floor between them (24 + 20 ft).
	const sloped = planShoring( { width: 3, length: 20, depth: 3, outline: 'top', method: 'shore', support: 'trench-box', ends: 'sloped', slope: 1 } );
	assert.ok( ! sloped.notes.some( n => n.startsWith( 'Ends are open' ) ) );
	assert.match( sloped.summary, /^2 boxes: 1 × 2\.4 × 7\.3 m \(8 × 24 ft\) \+ 1 × 2\.4 × 6\.1 m \(8 × 20 ft\)/ );
	// A per-side pit too steep: the sides named.
	const steep = planShoring( { width: 10, length: 10, depth: 3, method: 'sides', side1: 'sheet-piles', side2: 'slope', side3: 'slope', side4: 'slope', slope: 0.5 } );
	assert.ok( steep.notes.includes( 'Over 1.2 m deep with sides 2, 3, 4 steeper than WorkSafeBC allows even in hard, solid soil (3 : 4): slope, bench or shore them before anyone goes in (OHS Regulation 20.81).' ), steep.notes.join( ' / ' ) );

} );

test( 'a 60 × 40 × 12 m braced pit is a handful of meshes, one draw call each', () => {

	for ( const bracing of [ 'struts', 'rakers', 'tiebacks' ] ) {

		const entry = place( { width: 60, length: 40, depth: 12, outline: 'floor', method: 'shore', support: 'sheet-piles', bracing } );
		const n = Object.keys( meshes( entry ) ).length;
		assert.ok( n <= 6, `${ bracing }: ${ n } meshes` );
		drop( entry );

	}

	const mixed = place( { width: 60, length: 40, depth: 12, outline: 'floor', bracing: 'struts', method: 'sides', side1: 'secant-piles', side2: 'sheet-piles', side3: 'contiguous-piles', side4: 'soldier-piles' } );
	assert.ok( Object.keys( meshes( mixed ) ).length <= 9 );
	drop( mixed );

} );
