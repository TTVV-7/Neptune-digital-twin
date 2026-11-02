// npm run test:excavation: the excavation design (src/excavation-design.js) in Node, no browser.
// Pits saved before per-side methods existed must dig and measure exactly as they did: their
// design surface is compared bit for bit, over a grid, with the first excavations' pitSurface
// (copied below from earthworks.js at 316fb58, with terrain.js's own insideRect and rectFrame),
// for every slope and support, and their volume, bounds, floor and saved params with the old
// figures. Then mixed sides, benches and berms against numerical integration of the surface,
// support levels and members, dig stages, quantities, the comparison of methods and the flags.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MathUtils } from 'three';
import { CELL as TERRAIN_CELL, insideRect, rectBounds, rectFrame } from '../src/terrain.js';
import { SUPPORTS, normalizeSupport as oldNormalizeSupport, planShoring, wallSlope } from '../src/shoring.js';
import * as X from '../src/excavation-design.js';

// --- the first excavations, as earthworks.js had them -------------------------------------------

const OLD_SLOPES = { vertical: 0, '0.5 : 1': 0.5, '1 : 1': 1, '1.5 : 1': 1.5, '2 : 1': 2 };
const SLOPE_REACH = 3;
const CELL = TERRAIN_CELL;

function oldPitSurface( g, x, z, p ) {

	const inside = insideRect( g, x, z );
	if ( g.slope === 0 ) {

		const t = MathUtils.smoothstep( inside, - CELL, CELL );
		return t > 0 ? g.rim - g.depth * p * t : Infinity;

	}

	if ( inside < - SLOPE_REACH ) return Infinity;
	return g.rim - Math.min( g.depth * p, inside / g.slope );

}

function oldNormalizePit( p ) {

	const wanted = Number( p.slope );
	const slope = Object.values( OLD_SLOPES ).reduce( ( best, s ) => Math.abs( s - wanted ) < Math.abs( best - wanted ) ? s : best, 1 );
	return {
		width: clamp( p.width, 1, 200, 10 ),
		length: clamp( p.length, 1, 200, 10 ),
		depth: clamp( p.depth, 0.1, 30, 2 ),
		slope,
		support: oldNormalizeSupport( p.support ),
	};

}

function oldPitVolume( { width, length, depth, slope } ) {

	const z = slope > 0 ? Math.min( depth, Math.min( width, length ) / ( 2 * slope ) ) : depth;
	return width * length * z - slope * ( width + length ) * z * z + 4 / 3 * slope * slope * z ** 3;

}

function oldBracing( across, along ) {

	const corner = across >= 6 ? Math.min( 3.5, across / 4 ) : 0;
	if ( across > 12 ) return { struts: [], corner };
	const from = - along / 2 + Math.max( corner + 1, 1.5 );
	const to = - from;
	if ( to - from < 0.5 ) return { struts: corner ? [] : [ 0 ], corner };
	const n = Math.ceil( ( to - from ) / 4.5 - 0.01 ) + 1;
	return { struts: Array.from( { length: n }, ( _, i ) => from + i * ( to - from ) / ( n - 1 ) ), corner };

}

function clamp( value, min, max, fallback ) {

	const n = Number( value );
	return Number.isFinite( n ) ? Math.min( max, Math.max( min, n ) ) : fallback;

}

// The new surface, as earthworks.js is to use it: rim - depthAt( geom, u, v, depth * p ).
function newSurface( geom, frame, rim, x, z, p ) {

	const [ u, v ] = X.toPit( frame, x, z );
	return rim - X.depthAt( geom, u, v, geom.depth * p );

}

// The supports a pit could have before sides had methods (the secant and contiguous pile walls
// came with them), so the comparisons below stay with what old layouts can hold.
const LEGACY_SUPPORTS = [ 'none', 'trench-box', 'slide-rail', 'hydraulic', 'sheet-piles', 'soldier-piles' ];
assert.deepEqual( LEGACY_SUPPORTS.filter( id => ! Object.values( SUPPORTS ).includes( id ) ), [] );

// --- old pits, exactly as before -------------------------------------------------------------------

test( 'the constants match the terrain\'s', () => {

	assert.equal( X.CELL, TERRAIN_CELL );
	assert.equal( X.SLOPE_REACH, SLOPE_REACH );
	for ( const heading of [ 0, 17.3, 90, 211.25, 359.9 ] ) {

		const a = rectFrame( 12.5, - 40.25, heading, 3, 4 );
		const b = X.pitFrame( { east: 12.5, north: - 40.25, heading } );
		assert.ok( Object.is( a.sin, b.sin ) && Object.is( a.cos, b.cos ), `frame at ${ heading }°` );

	}

} );

test( 'old params: the design surface is bit for bit the old one, for every slope and support', () => {

	let compared = 0;
	for ( const heading of [ 0, 23.7, 135 ] ) {

		for ( const [ width, length ] of [ [ 10, 10 ], [ 20, 10 ], [ 3, 20 ], [ 4.5, 18 ] ] ) {

			for ( const depth of [ 0.6, 2, 5.3 ] ) {

				for ( const slope of Object.values( OLD_SLOPES ) ) {

					for ( const support of [ 'none', 'trench-box', 'sheet-piles' ] ) {

						const old = oldNormalizePit( { width, length, depth, slope, support } );
						const params = X.normaliseExcavation( old );
						const geom = X.excavationGeometry( params );
						const east = 101.3;
						const north = - 57.9;
						const rim = 3.217;
						const g = { ...rectFrame( east, north, heading, width / 2, length / 2 ), depth, slope: wallSlope( old ), rim };
						const frame = X.pitFrame( { east, north, heading } );
						// Bounds as the old pitDesign gave them.
						const b = X.cutBounds( geom );
						assert.deepEqual( rectBounds( { ...g, hw: b.hw, hl: b.hl }, b.margin ), rectBounds( g, ( g.slope > 0 ? SLOPE_REACH : 0 ) + CELL ) );
						const box = rectBounds( g, SLOPE_REACH + 2 );
						for ( const p of [ 0, 0.37, 1 ] ) {

							for ( let x = box.minX; x <= box.maxX; x += 0.37 ) {

								for ( let z = box.minZ; z <= box.maxZ; z += 0.37 ) {

									const a = oldPitSurface( g, x, z, p );
									const n = newSurface( geom, frame, rim, x, z, p );
									if ( ! Object.is( a, n ) ) assert.fail( `${ width }x${ length }x${ depth} slope ${ slope } ${ support } heading ${ heading } p ${ p } at ${ x }, ${ z }: ${ a } then, ${ n } now` );
									compared ++;

								}

							}

						}

					}

				}

			}

		}

	}

	assert.ok( compared > 1e6, `${ compared } points` );
	console.log( `compared ${ compared } points` );

} );

test( 'old params: points on and either side of the edges and corners match too', () => {

	for ( const slope of Object.values( OLD_SLOPES ) ) {

		for ( const support of LEGACY_SUPPORTS ) {

			const old = oldNormalizePit( { width: 7, length: 13, depth: 3, slope, support } );
			const geom = X.excavationGeometry( X.normaliseExcavation( old ) );
			const heading = 61;
			const g = { ...rectFrame( 0, 0, heading, 3.5, 6.5 ), depth: 3, slope: wallSlope( old ), rim: - 1.5 };
			const frame = X.pitFrame( { east: 0, north: 0, heading } );
			for ( const du of [ - 3.01, - 3, - 0.5, - 0.25, 0, 1e-9, 0.25, 0.5, 1.7 ] ) {

				for ( const [ u0, v0 ] of [ [ 3.5, 0 ], [ - 3.5, 2 ], [ 0, 6.5 ], [ 1, - 6.5 ], [ 3.5, 6.5 ], [ - 3.5, - 6.5 ] ] ) {

					const u = u0 + Math.sign( u0 || 1 ) * du;
					const v = v0 + Math.sign( v0 || 1 ) * du;
					const { east, north } = X.pitToEnu( frame, u, v );
					for ( const p of [ 0, 0.5, 1 ] ) assert.ok( Object.is( oldPitSurface( g, - east, north, p ), newSurface( geom, frame, - 1.5, - east, north, p ) ), `${ slope } ${ support } at ${ u }, ${ v }` );

				}

			}

		}

	}

} );

test( 'old params: volume, floor and saved params as before', () => {

	for ( const slope of Object.values( OLD_SLOPES ) ) {

		for ( const support of LEGACY_SUPPORTS ) {

			for ( const [ width, length, depth ] of [ [ 10, 10, 2 ], [ 20, 10, 2 ], [ 12, 12, 5 ], [ 3, 20, 3 ], [ 6, 6, 4 ], [ 200, 150, 30 ] ] ) {

				const old = oldNormalizePit( { width, length, depth, slope, support } );
				const params = X.normaliseExcavation( old );
				const geom = X.excavationGeometry( params );
				const want = oldPitVolume( { ...old, slope: wallSlope( old ) } );
				const got = X.cutVolume( geom );
				assert.ok( Math.abs( got - want ) <= 1e-9 * Math.max( 1, want ), `${ width }x${ length }x${ depth } ${ slope } ${ support }: ${ got } against ${ want }` );
				const s = wallSlope( old );
				const shape = X.outlines( geom );
				const w = width - 2 * s * depth;
				const l = length - 2 * s * depth;
				if ( w > 0 && l > 0 ) {

					assert.ok( Math.abs( shape.floorSize.width - w ) < 1e-9 && Math.abs( shape.floorSize.length - l ) < 1e-9 );

				} else {

					assert.equal( shape.floor, null );
					assert.ok( Math.abs( shape.meets - Math.min( width, length ) / 2 / s ) < 1e-6, `meets ${ shape.meets }` );

				}

				assert.deepEqual( shape.topSize, { width, length } );
				// Saved again, byte for byte.
				assert.equal( JSON.stringify( X.saveExcavation( params ) ), JSON.stringify( old ) );

			}

		}

	}

} );

test( 'old params: normalised the old way, with the new keys at their defaults', () => {

	const cases = [ {}, { width: 'x', depth: - 4, slope: 'steep' }, { width: 500, length: 0.2, depth: 99 }, { slope: 1.5, support: 'sheet-piles' }, { slope: 0, support: 'bogus' }, { width: 3, length: 20, depth: 3, slope: 2, support: 'trench-box' } ];
	for ( const p of cases ) {

		const old = oldNormalizePit( p );
		const params = X.normaliseExcavation( p );
		assert.deepEqual( Object.keys( params ).slice( 0, 5 ), [ 'width', 'length', 'depth', 'slope', 'support' ] );
		for ( const key of Object.keys( old ) ) assert.equal( params[ key ], old[ key ], `${ key } of ${ JSON.stringify( p ) }` );
		assert.equal( params.method, old.support === 'none' ? 'slope' : 'shore' );
		for ( const [ key, value ] of Object.entries( X.DEFAULTS ) ) assert.equal( params[ key ], value, key );
		// Normalising twice changes nothing.
		assert.deepEqual( X.normaliseExcavation( params ), params );

	}

} );

test( 'old params: plans as shoring.js makes them, and the classic waler, struts and braces where it put them', () => {

	// shoring.js is untouched here: its plans for old params are still its own.
	assert.match( planShoring( { width: 12, length: 12, depth: 5, slope: 1, support: 'sheet-piles' } ).summary, /^80 sheets, 48 m of wall, 9\.0 m long each/ );
	for ( const [ width, length, depth ] of [ [ 12, 12, 5 ], [ 20, 8, 6 ], [ 8, 30, 4.5 ], [ 14, 40, 7 ], [ 4, 18, 3 ], [ 5, 5, 5 ] ] ) {

		const params = X.normaliseExcavation( { width, length, depth, slope: 1, support: 'sheet-piles' } );
		const geom = X.excavationGeometry( params );
		const plan = X.bracingPlan( params, geom );
		assert.equal( plan.type, 'classic' );
		const braced = depth > 4;
		assert.equal( plan.toe, Math.max( 1.5, depth * ( braced ? 0.6 : 1 ) ) );
		assert.equal( plan.pileLength[ 'sheet-piles' ], Math.ceil( ( 1 + depth + plan.toe ) * 2 ) / 2 );
		assert.deepEqual( plan.levels, [ 0.7 ] );
		const walers = plan.members.filter( m => m.type === 'waler' );
		assert.equal( walers.length, 4 );
		// shoring.js: the waler along each wall, wall length less the sheets' depth, 0.37 m in.
		const h = 0.19;
		for ( const m of walers ) {

			const along = m.side === 1 || m.side === 3 ? width : length;
			assert.ok( Math.abs( m.length - ( along - 2 * h ) ) < 1e-9, `waler ${ m.length }` );
			assert.equal( m.a[ 1 ], - 0.7 );

		}

		const [ across, long ] = width > length ? [ length, width ] : [ width, length ];
		const legacy = braced ? oldBracing( across, long ) : { struts: [], corner: 0 };
		const struts = plan.members.filter( m => m.type === 'strut' );
		assert.equal( struts.length, legacy.struts.length );
		const face = h + 0.36;
		const turned = width > length;
		legacy.struts.forEach( ( s, i ) => {

			// toFrame( across, along, turned ) in shoring.js.
			const at = ( a, b ) => turned ? [ b, - 0.7, a ] : [ a, - 0.7, b ];
			const want = [ at( - across / 2 + face, s ), at( across / 2 - face, s ) ];
			const got = [ struts[ i ].a, struts[ i ].b ].sort( ( p, q ) => ( p[ 0 ] + p[ 2 ] ) - ( q[ 0 ] + q[ 2 ] ) );
			want.sort( ( p, q ) => ( p[ 0 ] + p[ 2 ] ) - ( q[ 0 ] + q[ 2 ] ) );
			for ( let k = 0; k < 2; k ++ ) for ( let c = 0; c < 3; c ++ ) assert.ok( Math.abs( got[ k ][ c ] - want[ k ][ c ] ) < 1e-9, `strut ${ i } ${ JSON.stringify( got ) } against ${ JSON.stringify( want ) }` );

		} );
		const corners = plan.members.filter( m => m.type === 'corner' );
		assert.equal( corners.length, legacy.corner ? 4 : 0 );
		// Each brace cuts across its corner, its legs `corner` along the walls from the waler faces.
		for ( const m of corners ) assert.ok( Math.abs( m.length - Math.hypot( legacy.corner - face, legacy.corner - face ) ) < 1e-9, `corner brace ${ m.length }` );

	}

	// Soldier piles were never braced.
	const soldier = X.planExcavation( { width: 12, length: 12, depth: 6, slope: 1, support: 'soldier-piles' } );
	assert.equal( soldier.plan.type, 'classic' );
	assert.deepEqual( soldier.plan.levels, [] );
	assert.equal( soldier.plan.toe, 4.5 );
	assert.equal( soldier.plan.members.length, 0 );
	// Finished, as they were saved.
	assert.equal( soldier.stage.index, soldier.stages.length - 1 );
	assert.equal( soldier.stage.dig, 6 );

} );

// --- the new params ---------------------------------------------------------------------------------

test( 'saving leaves out what isn\'t needed, and comes back the same', () => {

	const cases = [
		X.newExcavationParams( { width: 14, length: 22 } ),
		{ width: 30, length: 20, depth: 9, method: 'sides', side1: 'secant-piles', side2: 'slope', side3: 'bench', side4: 'contiguous-piles', soil: 'B', slopeBy: 'soil', bracing: 'tiebacks', levels: '2, 5.5', toe: 4, anchorAngle: 25, stage: 3, groundwater: 1.2, outline: 'floor' },
		{ width: 4, length: 30, depth: 3.5, support: 'trench-box', ends: 'sloped', slopeBy: 'soil' },
		{ width: 10, length: 10, depth: 4.8, method: 'bench', benchHeight: 1, benchWidth: 2, soil: 'A' },
	];
	for ( const p of cases ) {

		const params = X.normaliseExcavation( p );
		const saved = X.saveExcavation( params );
		assert.deepEqual( X.normaliseExcavation( JSON.parse( JSON.stringify( saved ) ) ), params );
		for ( const key of [ 'width', 'length', 'depth', 'slope', 'support' ] ) assert.ok( key in saved );

	}

	const fresh = X.saveExcavation( X.normaliseExcavation( X.newExcavationParams( { width: 14, length: 22 } ) ) );
	assert.deepEqual( fresh, { width: 14, length: 22, depth: 2, slope: 1, support: 'none', outline: 'floor', slopeBy: 'soil', bracing: 'auto' } );

} );

test( 'method follows support for sloped and shored, so setting support still shores a pit', () => {

	const merge = ( params, patch ) => X.normaliseExcavation( { ...params, ...patch } );
	let p = X.normaliseExcavation( { support: 'sheet-piles' } );
	assert.equal( p.method, 'shore' );
	p = merge( p, { support: 'none' } );
	assert.equal( p.method, 'slope' );
	p = merge( p, { support: 'trench-box' } );
	assert.equal( p.method, 'shore' );
	// Without the patch, picking shored on an unsupported pit does nothing; with it, it shores.
	assert.equal( merge( X.normaliseExcavation( {} ), { method: 'shore' } ).method, 'slope' );
	p = merge( X.normaliseExcavation( {} ), X.methodPatch( 'shore', X.normaliseExcavation( {} ) ) );
	assert.equal( p.method, 'shore' );
	assert.equal( p.support, X.DEFAULT_WALL );
	p = merge( p, X.methodPatch( 'bench', p ) );
	assert.equal( p.method, 'bench' );
	assert.equal( p.support, X.DEFAULT_WALL );
	p = merge( p, X.methodPatch( 'shore', p ) );
	assert.equal( p.support, X.DEFAULT_WALL );
	p = merge( p, X.methodPatch( 'sides', p ) );
	assert.deepEqual( [ p.side1, p.side2, p.side3, p.side4 ], Array( 4 ).fill( 'sheet-piles' ) );
	p = merge( X.normaliseExcavation( { support: 'hydraulic' } ), X.methodPatch( 'sides', X.normaliseExcavation( { support: 'hydraulic' } ) ) );
	assert.deepEqual( [ p.side1, p.side2, p.side3, p.side4 ], Array( 4 ).fill( 'sheet-piles' ) );
	p = merge( p, X.methodPatch( 'slope', p ) );
	assert.deepEqual( [ p.method, p.support ], [ 'slope', 'none' ] );

} );

test( 'sides are numbered clockwise from the front, and named by compass', () => {

	assert.deepEqual( [ 1, 2, 3, 4 ].map( n => X.sideCompass( 0, n ) ), [ 'N', 'E', 'S', 'W' ] );
	assert.deepEqual( [ 1, 2, 3, 4 ].map( n => X.sideCompass( 100, n ) ), [ 'E', 'S', 'W', 'N' ] );
	assert.deepEqual( [ 1, 2, 3, 4 ].map( n => X.sideCompass( 310, n ) ), [ 'NW', 'NE', 'SE', 'SW' ] );
	assert.equal( X.sideLabel( 45, 2 ), 'side 2 (SE)' );
	// Side 1 is +v, side 2 +u: a point just inside side 2's edge is shallow only near side 2.
	const geom = X.excavationGeometry( X.normaliseExcavation( { width: 10, length: 20, depth: 4, method: 'sides', side2: 'slope', side1: 'sheet-piles', side3: 'sheet-piles', side4: 'sheet-piles', slope: 1 } ) );
	assert.ok( Math.abs( X.depthAt( geom, 4, 0, 4 ) - 1 ) < 1e-12 );
	assert.equal( X.depthAt( geom, - 4, 0, 4 ), 4 );

} );

// Volume below flat ground at the rim, by summing the surface over a fine grid.
function integrate( geom, cap = geom.depth, step = 0.05 ) {

	const [ front, right, back, left ] = geom.sides;
	let sum = 0;
	for ( let u = - left.top - 1 + step / 2; u < right.top + 1; u += step ) {

		for ( let v = - back.top - 1 + step / 2; v < front.top + 1; v += step ) sum += Math.max( 0, X.depthAt( geom, u, v, cap ) );

	}

	return sum * step * step;

}

test( 'mixed sides: corners from the minimum, and volumes as integrated', () => {

	// Floor 10 x 20, 4 m deep: side 1 shored, side 2 sloped 1 : 1, side 3 benched, side 4 sloped.
	const params = X.normaliseExcavation( { width: 10, length: 20, depth: 4, outline: 'floor', method: 'sides', side1: 'sheet-piles', side2: 'slope', side3: 'bench', side4: 'slope', slope: 1, soil: 'A' } );
	const geom = X.excavationGeometry( params );
	const [ front, right, back, left ] = geom.sides;
	assert.deepEqual( [ front.toe, right.toe, back.toe, left.toe ], [ 10, 5, 10, 5 ] );
	assert.equal( right.top, 9 );
	assert.equal( front.top, 10 );
	// Four 1 m risers with 1.5 m benches: the top 4.5 m out.
	assert.deepEqual( [ back.steps, back.rise, back.benchWidth, back.run ], [ 4, 1, 1.5, 4.5 ] );
	// In the slope's wing beside the wall: the slope's depth, right up to the wall; none past it.
	assert.equal( X.depthAt( geom, 7, 9, 4 ), 2 );
	assert.equal( X.depthAt( geom, 7, 10.6, 4 ), - Infinity );
	// Where the slope and the benches meet: the shallower of the two.
	assert.equal( X.depthAt( geom, 7, - 12, 4 ), Math.min( 2, 2 ) );
	assert.equal( X.depthAt( geom, 6, - 13.5, 4 ), Math.min( 3, 1 ) );
	// Wall area: the full depth over the floor edge, and the slopes' triangles each side.
	assert.ok( Math.abs( X.exposedArea( geom, front ) - ( 10 * 4 + 2 * 4 * 4 / 2 ) ) < 1e-9 );
	assert.equal( front.length, 18 );
	const exact = X.cutVolume( geom );
	const summed = integrate( geom );
	assert.ok( Math.abs( summed - exact ) / exact < 0.003, `${ summed } summed, ${ exact } exact` );
	// The same with the rectangle as the top: the floor smaller instead.
	const top = X.excavationGeometry( { ...params, outline: 'top' } );
	assert.deepEqual( X.outlines( top ).topSize, { width: 10, length: 20 } );
	assert.deepEqual( X.outlines( top ).floorSize, { width: 2, length: 15.5 } );
	const exactTop = X.cutVolume( top );
	assert.ok( Math.abs( integrate( top ) - exactTop ) / exactTop < 0.003 );

} );

test( 'slopes from the soil, and all four sides sloped at once', () => {

	for ( const [ soil, s ] of [ [ 'A', 0.75 ], [ 'B', 1 ], [ 'C', 1.5 ], [ 'wet', 3 ] ] ) {

		const params = X.normaliseExcavation( { width: 10, length: 20, depth: 4, outline: 'floor', slopeBy: 'soil', soil } );
		assert.equal( X.slopeOf( params ), s );
		const geom = X.excavationGeometry( params );
		// V = W L D + ( W Sy + L Sx ) D² / 2 + Sx Sy D³ / 3 over the floor.
		const S = 2 * s;
		const want = 10 * 20 * 4 + ( 10 * S + 20 * S ) * 16 / 2 + S * S * 64 / 3;
		assert.ok( Math.abs( X.cutVolume( geom ) - want ) < 1e-9, soil );
		assert.ok( Math.abs( integrate( geom, 4, 0.1 ) - want ) / want < 0.003, soil );

	}

	// The research's example: a 10 x 20 m floor 4 m deep at 1.5 : 1 cuts 1,712 m³, shored 800 m³.
	const list = X.compareMethods( X.normaliseExcavation( { width: 10, length: 20, depth: 4, outline: 'floor', slopeBy: 'soil', soil: 'C' } ) );
	assert.equal( Math.round( list[ 0 ].volume ), 1712 );
	assert.deepEqual( list[ 0 ].top, { width: 22, length: 32 } );
	const shored = list.find( o => o.method === 'shore' );
	assert.equal( Math.round( shored.volume ), 800 );
	assert.match( X.comparisonText( list ), /Shored instead: 912 m³ less cut, top 10\.0 × 20\.0 m\./ );
	assert.ok( ! list.slice( 1 ).some( o => o.method === 'slope' ), 'not compared with itself' );

} );

test( 'benches: risers of 1.2 m at most, 1.5 times as wide, and their volume', () => {

	const p = X.normaliseExcavation( { width: 12, length: 12, depth: 4.8, outline: 'floor', method: 'bench', soil: 'A' } );
	const geom = X.excavationGeometry( p );
	const side = geom.sides[ 0 ];
	assert.deepEqual( [ side.steps, side.rise ], [ 4, 1.2 ] );
	assert.ok( Math.abs( side.benchWidth - 1.8 ) < 1e-12 );
	// The research: four 1.2 m steps put the rim 5.4 m out.
	assert.ok( Math.abs( side.run - 5.4 ) < 1e-12 );
	const exact = X.cutVolume( geom );
	assert.ok( Math.abs( integrate( geom, 4.8, 0.05 ) - exact ) / exact < 0.003, `${ exact }` );
	// By hand: four slabs, each 3.6 m bigger round than the one below.
	let byHand = 0;
	for ( let k = 0; k < 4; k ++ ) byHand += ( 12 + 2 * 1.8 * k ) ** 2 * 1.2;
	assert.ok( Math.abs( exact - byHand ) < 1e-9 );
	// A riser height set: the steps divide the depth evenly, none taller than it.
	const set = X.excavationGeometry( X.normaliseExcavation( { ...p, benchHeight: 1, benchWidth: 2.5 } ) ).sides[ 0 ];
	assert.deepEqual( [ set.steps, set.rise, set.benchWidth ], [ 5, 0.96, 2.5 ] );
	// Shallow: one riser, a vertical cut.
	assert.equal( X.excavationGeometry( X.normaliseExcavation( { ...p, depth: 1 } ) ).sides[ 0 ].profile, 'vertical' );

} );

test( 'trench systems shore the whole pit; their ends can be sloped', () => {

	const box = X.excavationGeometry( X.normaliseExcavation( { width: 3, length: 20, depth: 3, support: 'trench-box', slope: 1 } ) );
	assert.ok( box.trench );
	assert.deepEqual( box.sides.map( s => s.profile ), Array( 4 ).fill( 'vertical' ) );
	const sloped = X.excavationGeometry( X.normaliseExcavation( { width: 3, length: 20, depth: 3, support: 'trench-box', slope: 1, ends: 'sloped', outline: 'floor' } ) );
	// The ends (front and back of a trench along its length) slope; the long walls take the box.
	assert.deepEqual( sloped.sides.map( s => s.method ), [ 'slope', 'trench', 'slope', 'trench' ] );
	assert.deepEqual( X.outlines( sloped ).topSize, { width: 3, length: 26 } );
	// Wider than long: the ends are right and left. Slide rail lines all four regardless.
	assert.deepEqual( X.excavationGeometry( X.normaliseExcavation( { width: 20, length: 3, depth: 3, support: 'hydraulic', ends: 'sloped' } ) ).sides.map( s => s.method ), [ 'trench', 'slope', 'trench', 'slope' ] );
	assert.deepEqual( X.excavationGeometry( X.normaliseExcavation( { width: 4, length: 9, depth: 3, support: 'slide-rail', ends: 'sloped' } ) ).sides.map( s => s.method ), Array( 4 ).fill( 'trench' ) );
	// Not per side.
	assert.equal( X.normaliseExcavation( { method: 'sides', side1: 'trench-box' } ).side1, 'slope' );

} );

// --- support levels -------------------------------------------------------------------------------

test( 'levels: suggested about every 3 m, the first within 1.5 m, or as typed', () => {

	assert.deepEqual( X.suggestedLevels( 3 ), [ 0.75 ] );
	assert.deepEqual( X.suggestedLevels( 5 ), [ 1.25, 3.15 ] );
	assert.deepEqual( X.suggestedLevels( 6 ), [ 1.5, 3.75 ] );
	assert.deepEqual( X.suggestedLevels( 10 ), [ 1.5, 4.35, 7.15 ] );
	assert.deepEqual( X.suggestedLevels( 12 ), [ 1.5, 4.15, 6.75, 9.4 ] );
	for ( let D = 1.5; D <= 30; D += 0.7 ) {

		const levels = X.suggestedLevels( D );
		assert.ok( levels[ 0 ] <= 1.5 );
		for ( let i = 1; i < levels.length; i ++ ) assert.ok( levels[ i ] - levels[ i - 1 ] <= 3.05, `${ D }: ${ levels }` );
		assert.ok( D - levels[ levels.length - 1 ] <= 3.05, `${ D }: ${ levels }` );

	}

	assert.equal( X.normaliseExcavation( { levels: ' 4.5;1.5 , 1.6, x, 7.52 , -2' } ).levels, '1.5, 4.5, 7.5' );
	const plan = X.bracingPlan( X.normaliseExcavation( { width: 10, length: 20, depth: 6, support: 'sheet-piles', bracing: 'struts', levels: '1, 3, 6.5' } ) );
	assert.deepEqual( plan.levels, [ 1, 3 ] );
	assert.deepEqual( plan.dropped, [ 6.5 ] );
	assert.equal( plan.suggested, false );

} );

test( 'how many supports: a number of levels and a spacing along the walls, or as suggested', () => {

	const pit = { width: 60, length: 40, depth: 9, outline: 'floor', method: 'shore', support: 'sheet-piles', bracing: 'rakers' };
	const plan = extra => X.bracingPlan( X.normaliseExcavation( { ...pit, ...extra } ) );
	const count = ( extra, type ) => plan( extra ).members.filter( m => m.type === type ).length;

	// A number of levels: the first within 1.5 m, the rest of the depth split evenly; typed levels win.
	assert.deepEqual( plan( {} ).levels, X.suggestedLevels( 9 ) );
	assert.deepEqual( X.suggestedLevels( 9, 1 ), [ 1.5 ] );
	assert.deepEqual( X.suggestedLevels( 9, 2 ), [ 1.5, 5.25 ] );
	assert.deepEqual( plan( { levelCount: 2 } ).levels, [ 1.5, 5.25 ] );
	assert.equal( plan( { levelCount: 2 } ).suggested, false );
	assert.deepEqual( plan( { levelCount: 1, levels: '2, 5' } ).levels, [ 2, 5 ] );
	// No more than leave half a metre between them.
	assert.equal( X.suggestedLevels( 3, 12 ).length, 4 );

	// Spacing: fewer rakers and kickers (one each a level), struts and tiebacks the same way.
	const rakers = count( {}, 'raker' );
	assert.equal( count( {}, 'kicker' ), rakers );
	assert.ok( count( { spacing: 9 }, 'raker' ) < rakers * 0.65, `${ count( { spacing: 9 }, 'raker' ) } of ${ rakers }` );
	assert.equal( count( { levelCount: 1 }, 'raker' ) * 3, rakers );
	const struts = { width: 30, length: 14, bracing: 'struts' };
	assert.ok( count( { ...struts, spacing: 8 }, 'strut' ) < count( struts, 'strut' ) );
	const tiebacks = { bracing: 'tiebacks' };
	assert.ok( count( { ...tiebacks, spacing: 5 }, 'tieback' ) < count( tiebacks, 'tieback' ) / 2 + 1 );
	assert.equal( X.supportSpacing( { spacing: 0 }, 'rakers' ), X.STRUT_SPACING );
	assert.equal( X.supportSpacing( { spacing: 0 }, 'tiebacks' ), X.ANCHOR_SPACING );

	// Clamped, and left out of a save at their defaults so pits saved before save the same.
	const n = X.normaliseExcavation( { spacing: 0.3, levelCount: 40 } );
	assert.equal( n.spacing, X.MIN_SPACING );
	assert.equal( n.levelCount, 12 );
	assert.equal( X.normaliseExcavation( { spacing: 99 } ).spacing, X.MAX_SPACING );
	assert.equal( X.normaliseExcavation( { levelCount: - 2 } ).levelCount, 0 );
	const saved = X.saveExcavation( X.normaliseExcavation( pit ) );
	assert.ok( ! ( 'spacing' in saved ) && ! ( 'levelCount' in saved ), JSON.stringify( saved ) );
	assert.deepEqual( X.saveExcavation( X.normaliseExcavation( { ...pit, spacing: 9, levelCount: 2 } ) ), { ...saved, levelCount: 2, spacing: 9 } );

	// Said so: a spacing over the usual, and what fewer levels leave unsupported.
	const flags = X.excavationFlags( X.normaliseExcavation( { ...pit, spacing: 9, levelCount: 1 } ) ).map( f => f.id );
	assert.ok( flags.includes( 'spacing' ) && flags.includes( 'last-level' ), flags.join() );
	assert.ok( ! X.excavationFlags( X.normaliseExcavation( pit ) ).some( f => f.id === 'spacing' ) );

} );

test( 'bracing: struts across the short way, corner braces, king posts past 12 m, rakers past 20 m', () => {

	const at = ( width, length, depth, extra = {} ) => X.planExcavation( { width, length, depth, support: 'sheet-piles', bracing: 'auto', outline: 'floor', ...extra } );
	// Cantilever up to 4 m, with a 1.5 H toe.
	const shallow = at( 10, 20, 4 );
	assert.equal( shallow.plan.type, 'none' );
	assert.equal( shallow.plan.toe, 6 );
	assert.ok( shallow.flags.every( f => f.id !== 'cantilever' ) );
	// 8 m: two levels of walers and struts across the 10 m width, corner braces, a 0.5 H toe.
	const deep = at( 10, 30, 8 );
	assert.equal( deep.plan.type, 'struts' );
	// Two levels would leave 3.25 m gaps: three.
	assert.deepEqual( deep.plan.levels, [ 1.5, 3.65, 5.85 ] );
	assert.equal( deep.plan.toe, 4 );
	assert.deepEqual( deep.plan.struts.across, [ 2, 4 ] );
	assert.ok( Math.abs( deep.plan.struts.span - ( 10 - 2 * ( 0.19 + 0.36 ) ) ) < 1e-9 );
	assert.equal( deep.plan.struts.kingPosts, 0 );
	const struts = deep.plan.members.filter( m => m.type === 'strut' );
	assert.equal( struts.length, deep.plan.struts.positions.length * deep.plan.levels.length );
	// Along u, square across: same z, x from one face to the other.
	for ( const s of struts ) assert.ok( Math.abs( s.a[ 2 ] - s.b[ 2 ] ) < 1e-12 && Math.abs( Math.abs( s.a[ 0 ] - s.b[ 0 ] ) - deep.plan.struts.span ) < 1e-9 );
	const gaps = deep.plan.struts.positions.slice( 1 ).map( ( t, i ) => t - deep.plan.struts.positions[ i ] );
	assert.ok( gaps.every( g => g <= 4.5 + 1e-9 ) );
	assert.equal( deep.plan.members.filter( m => m.type === 'corner' ).length, 12 );
	assert.equal( deep.plan.members.filter( m => m.type === 'waler' ).length, 12 );
	// 16 m across: king posts under the struts.
	const wide = at( 16, 30, 8 );
	assert.equal( wide.plan.type, 'struts' );
	assert.equal( wide.plan.struts.kingPosts, 1 );
	assert.equal( wide.plan.members.filter( m => m.type === 'kingpost' ).length, wide.plan.struts.positions.length );
	assert.ok( wide.flags.some( f => f.id === 'king-posts' ) );
	// 30 m across: too far to strut, rakers instead; struts asked for anyway are flagged.
	const huge = at( 30, 40, 8 );
	assert.equal( huge.plan.type, 'rakers' );
	assert.ok( Object.values( huge.plan.sideTypes ).every( t => t === 'rakers' ) );
	const forced = at( 30, 40, 8, { bracing: 'struts' } );
	assert.ok( forced.flags.some( f => f.id === 'strut-span' ) );

} );

test( 'rakers reach the floor at their angle; tiebacks run past the active wedge', () => {

	const r = X.planExcavation( { width: 30, length: 40, depth: 8, support: 'sheet-piles', bracing: 'rakers', levels: '2, 5', rakerAngle: 45, outline: 'floor' } );
	const rakers = r.plan.members.filter( m => m.type === 'raker' );
	for ( const m of rakers ) {

		const run = Math.hypot( m.b[ 0 ] - m.a[ 0 ], m.b[ 2 ] - m.a[ 2 ] );
		assert.ok( Math.abs( run - ( m.a[ 1 ] - m.b[ 1 ] ) ) < 1e-9, '45 degrees' );
		assert.equal( m.b[ 1 ], - 8 );

	}

	assert.equal( r.plan.members.filter( m => m.type === 'kicker' ).length, rakers.length );
	assert.ok( Math.abs( r.plan.rakers[ 1 ].rows[ 0 ].reach - 6 ) < 1e-12 );

	// The research's worked example: H = 10 m, top row 1.5 m down, the wedge rising at 61° from the
	// foot of the wall: 6.25 m free at 15° and 6.17 m at 20° with the head on the wall. Here the
	// head is on the waler's face, 0.36 m in front of it, so the tendon crosses the wedge further
	// out: ( 8.5 + 0.36 tan 61° ) / ( tan 61° + tan θ ), then 2 m (0.2 H) more.
	const DEG = Math.PI / 180;
	const freeAt = angle => ( 8.5 + X.WALER_DEPTH * Math.tan( 61 * DEG ) ) / ( Math.tan( 61 * DEG ) + Math.tan( angle * DEG ) ) / Math.cos( angle * DEG ) + 2;
	const anchors = angle => X.planExcavation( { width: 30, length: 40, depth: 10, support: 'secant-piles', bracing: 'tiebacks', levels: '1.5, 5', anchorAngle: angle, outline: 'floor' } );
	const at15 = anchors( 15 );
	const row15 = at15.plan.anchors[ 1 ].rows[ 0 ];
	assert.ok( Math.abs( row15.free - freeAt( 15 ) ) < 1e-9 && Math.abs( row15.free - 6.57 ) < 0.01, `free ${ row15.free }` );
	assert.ok( Math.abs( ( row15.free + row15.bond ) * Math.cos( 15 * DEG ) - 15.04 ) < 0.01 );
	assert.ok( row15.bondCentre < 4.5 );
	assert.ok( at15.flags.some( f => f.id === 'anchor-cover-1' ) );
	const at20 = anchors( 20 );
	const row20 = at20.plan.anchors[ 1 ].rows[ 0 ];
	assert.ok( Math.abs( row20.free - freeAt( 20 ) ) < 1e-9 && Math.abs( row20.free - 6.49 ) < 0.01, `free ${ row20.free }` );
	assert.ok( Math.abs( row20.bondCentre - ( 1.5 + ( row20.free + 4.5 ) * Math.sin( 20 * DEG ) ) ) < 1e-9 && Math.abs( row20.bondCentre - 5.26 ) < 0.01, `bond centre ${ row20.bondCentre }` );
	assert.ok( ! at20.flags.some( f => f.id.startsWith( 'anchor-cover' ) ) );
	// Never under 4.5 m free; the tendon goes out behind the wall and down.
	for ( const m of at20.plan.members.filter( t => t.type === 'tieback' ) ) {

		assert.ok( m.free >= 4.5 );
		assert.ok( Math.abs( m.length - ( m.free + m.bond ) ) < 1e-9 );
		assert.ok( m.b[ 1 ] < m.a[ 1 ] );

	}

	// Side 1 (front, +v, so -z) anchors run towards -z; their zone is behind the front edge.
	const front = at20.plan.members.find( m => m.type === 'tieback' && m.side === 1 );
	assert.ok( front.b[ 2 ] < front.a[ 2 ] );
	const zone = at20.quantities.zones.anchors.find( z => z.side === 1 );
	assert.ok( zone.polygon.every( ( [ , v ] ) => v >= 20 - 1e-9 ) && zone.polygon.some( ( [ , v ] ) => v > 20 + 12 ) );

} );

test( 'mixed walls: struts need a wall opposite, else rakers; walers stop at the slopes', () => {

	// Walls on sides 2 and 4, slopes on 1 and 3: struts across between the walls.
	const pair = X.planExcavation( { width: 12, length: 20, depth: 7, outline: 'floor', method: 'sides', side1: 'slope', side2: 'sheet-piles', side3: 'slope', side4: 'soldier-piles', slope: 1, bracing: 'struts' } );
	assert.deepEqual( pair.plan.struts.across, [ 2, 4 ] );
	assert.ok( Math.abs( pair.plan.struts.span - ( 12 - ( 0.19 + 0.36 ) - ( 0.15 + 0.36 ) ) ) < 1e-9 );
	assert.equal( pair.plan.members.filter( m => m.type === 'corner' ).length, 0 );
	// No corner braces, so the struts start 1.5 m from the floor's ends: 5 along its 20 m.
	assert.equal( pair.plan.struts.positions.length, 5 );
	assert.ok( Math.abs( pair.plan.struts.positions[ 0 ] - ( - 10 + 1.5 ) ) < 1e-9 );
	// The wall runs on into the slopes' wings; the waler at z only as far as the slope is below z.
	const side2 = pair.geom.sides[ 1 ];
	assert.equal( side2.length, 20 + 2 * 7 );
	const waler = pair.plan.members.find( m => m.type === 'waler' && m.side === 2 && m.level === 0 );
	const z = pair.plan.levels[ 0 ];
	assert.ok( Math.abs( waler.length - ( 20 + 2 * ( 7 - z ) ) ) < 1e-9, `${ waler.length }` );
	// A single wall: nothing to strut against.
	const one = X.planExcavation( { width: 12, length: 20, depth: 7, outline: 'floor', method: 'sides', side1: 'sheet-piles', bracing: 'struts' } );
	assert.deepEqual( one.plan.sideTypes, { 1: 'rakers' } );
	assert.ok( one.flags.some( f => f.id === 'no-strut-1' ) );
	// Three walls: the end between the strutted pair is braced at its corners.
	const three = X.planExcavation( { width: 12, length: 20, depth: 7, outline: 'floor', method: 'sides', side1: 'sheet-piles', side2: 'sheet-piles', side4: 'sheet-piles', bracing: 'struts' } );
	assert.deepEqual( three.plan.sideTypes, { 1: 'struts', 2: 'struts', 4: 'struts' } );
	assert.equal( three.plan.members.filter( m => m.type === 'corner' ).length, 2 * three.plan.levels.length );
	// Piles: a closed ring shares its corners; open walls have one more each end... in halves.
	const q = three.quantities;
	assert.equal( q.walls.length, 3 );
	assert.equal( q.piles[ 'sheet-piles' ], q.walls.reduce( ( n, w ) => n + w.sheets, 0 ) );
	// A lone wall between two 1 : 1 slopes, 3 m deep, runs 3 m on into each slope's wing.
	const soldiers = X.planExcavation( { width: 12, length: 24, depth: 3, outline: 'floor', method: 'sides', side2: 'soldier-piles' } ).quantities;
	assert.equal( soldiers.walls[ 0 ].length, 30 );
	assert.equal( soldiers.piles[ 'soldier-piles' ], Math.ceil( 30 / 2.4 - 0.01 ) + 1 );

} );

// --- stages ----------------------------------------------------------------------------------------

test( 'stages: walls in, each lift dug 0.6 m below its level, then the level, then the floor', () => {

	const d = X.planExcavation( { width: 10, length: 20, depth: 8, support: 'sheet-piles', bracing: 'struts', levels: '1.5, 4.5', outline: 'floor' } );
	assert.deepEqual( d.stages.map( s => [ s.dig, s.installed ] ), [ [ 0, 0 ], [ 2.1, 0 ], [ 2.1, 1 ], [ 5.1, 1 ], [ 5.1, 2 ], [ 8, 2 ] ] );
	assert.equal( d.stages[ 0 ].label, 'Walls in, nothing dug yet' );
	assert.equal( d.stages[ 2 ].label, 'Level 1 (1.5 m): walers and struts in' );
	assert.equal( d.stage.index, 5 );
	const at = X.planExcavation( { ...d.params, stage: 3 } );
	assert.equal( at.stage.dig, 5.1 );
	// The terrain digs the stage: cut to its depth, the rest of the design as finished.
	const geom = X.geometryAtStage( at.geom, at.plan, at.stage );
	assert.equal( X.depthAt( geom, 0, 0, at.stage.dig ), 5.1 );
	assert.ok( Math.abs( X.cutVolume( geom, at.stage.dig ) - 10 * 20 * 5.1 ) < 1e-9 );
	// Close levels: a lift stops at the next level.
	const close = X.planExcavation( { ...d.params, levels: '1.5, 1.9' } );
	assert.equal( close.stages[ 1 ].dig, 1.9 );
	// Sloped pits: before and after.
	assert.deepEqual( X.planExcavation( { width: 10, length: 10, depth: 3 } ).stages.map( s => s.dig ), [ 0, 3 ] );

} );

test( 'stages with rakers leave a berm until each level is in', () => {

	const d = X.planExcavation( { width: 30, length: 40, depth: 8, support: 'sheet-piles', bracing: 'rakers', levels: '2, 5', outline: 'floor' } );
	assert.deepEqual( d.stages.map( s => [ s.dig, s.installed, s.berm ] ), [ [ 0, 0, null ], [ 2.6, 0, null ], [ 8, 0, 2.6 ], [ 8, 1, 2.6 ], [ 8, 1, 5.6 ], [ 8, 2, 5.6 ], [ 8, 2, null ] ] );
	const stage = d.stages[ 2 ];
	const geom = X.geometryAtStage( d.geom, d.plan, stage );
	assert.ok( geom.sides.every( s => s.profile === 'berm' ) );
	// At the wall, the berm's top; 1 m in, a metre deeper (45 degrees); the middle at the floor.
	assert.ok( Math.abs( X.depthAt( geom, 0, 20 - 1, 8 ) - 3.6 ) < 1e-9 );
	assert.equal( X.depthAt( geom, 0, 0, 8 ), 8 );
	const exact = X.cutVolume( geom, 8 );
	assert.ok( Math.abs( integrate( geom, 8, 0.1 ) - exact ) / exact < 0.003 );
	assert.ok( exact < 30 * 40 * 8 );
	assert.ok( d.flags.some( f => f.id === 'berm' ) );

} );

// --- quantities and flags ----------------------------------------------------------------------------

test( 'quantities: walls, piles, members and zones', () => {

	const d = X.planExcavation( { width: 12, length: 12, depth: 5, slope: 1, support: 'sheet-piles' } );
	const q = d.quantities;
	assert.equal( q.volume, 720 );
	assert.equal( q.wallArea, 240 );
	assert.equal( q.piles[ 'sheet-piles' ], 80 );
	assert.equal( q.struts.count, 2 );
	assert.equal( q.corners, 4 );
	assert.deepEqual( q.zones.cut, [ [ - 6, - 6 ], [ 6, - 6 ], [ 6, 6 ], [ - 6, 6 ] ] );
	assert.deepEqual( q.zones.spoil[ 2 ], [ 7.2, 7.2 ] );
	assert.deepEqual( q.zones.adjacent[ 2 ], [ 11, 11 ] );
	const soldier = X.planExcavation( { width: 12, length: 12, depth: 5, support: 'soldier-piles' } ).quantities;
	// shoring.js: 5 bays a wall, 20 piles, lagging round the perimeter to 0.3 m out of the ground.
	assert.equal( soldier.piles[ 'soldier-piles' ], 20 );
	assert.ok( Math.abs( soldier.walls.reduce( ( a, w ) => a + w.lagging, 0 ) - 48 * 5.3 ) < 1e-9 );
	const secant = X.planExcavation( { width: 20, length: 20, depth: 6, support: 'secant-piles', bracing: 'auto', outline: 'floor' } ).quantities;
	assert.equal( secant.piles[ 'secant-piles' ], 4 * Math.ceil( 20 / 0.73 - 0.01 ) );

} );

test( 'flags: WorkSafeBC, soil, water, walls and their support', () => {

	const ids = p => X.planExcavation( p ).flags.map( f => f.id );
	// The old note for unsupported pits steeper than 3 : 4, and none at 1.5 : 1 in type C.
	assert.ok( ids( { width: 3, length: 20, depth: 3, slope: 0.5, groundwater: 50 } ).includes( 'too-steep' ) );
	assert.deepEqual( ids( { width: 10, length: 20, depth: 3, slope: 1.5, groundwater: 50, outline: 'floor' } ), [] );
	assert.ok( ids( { width: 10, length: 20, depth: 3, slope: 1, groundwater: 50 } ).includes( 'steeper-than-soil' ) );
	assert.ok( ! ids( { width: 10, length: 20, depth: 3, slope: 1, soil: 'B', groundwater: 50 } ).includes( 'steeper-than-soil' ) );
	assert.deepEqual( ids( { width: 10, length: 20, depth: 7, slope: 1.5, groundwater: 50, outline: 'floor' } ), [ 'deep-slope', 'over-6m' ] );
	// With the rectangle as the top, 1.5 : 1 sides 3 m down leave a floor 1 m wide: a trench.
	assert.deepEqual( ids( { width: 10, length: 20, depth: 3, slope: 1.5, groundwater: 50 } ), [ 'access' ] );
	// Benches in fill, a trench's access, groundwater, pervious walls, cantilevers.
	assert.ok( ids( { width: 3, length: 20, depth: 3, method: 'bench', groundwater: 50 } ).includes( 'bench-soil' ) );
	assert.ok( ids( { width: 3, length: 20, depth: 3, slope: 1.5, groundwater: 50, outline: 'floor' } ).includes( 'access' ) );
	assert.ok( ids( { width: 10, length: 20, depth: 3, slope: 1.5 } ).includes( 'groundwater' ) );
	assert.ok( ids( { width: 10, length: 20, depth: 3, support: 'soldier-piles' } ).includes( 'pervious-1' ) );
	assert.ok( ! ids( { width: 10, length: 20, depth: 3, support: 'sheet-piles' } ).some( id => id.startsWith( 'pervious' ) ) );
	assert.ok( ids( { width: 10, length: 20, depth: 6, support: 'sheet-piles', bracing: 'none', groundwater: 50 } ).includes( 'cantilever' ) );
	assert.equal( X.planExcavation( { width: 10, length: 20, depth: 6, support: 'sheet-piles', bracing: 'none' } ).flags.find( f => f.id === 'cantilever' ).level, 'stop' );
	assert.ok( ids( { width: 3, length: 20, depth: 3, support: 'hydraulic' } ).includes( 'hydraulic-soil' ) );
	assert.ok( ids( { width: 10, length: 20, depth: 15, support: 'secant-piles', bracing: 'auto' } ).includes( 'secant-toe' ) );
	for ( const flag of X.planExcavation( { width: 10, length: 20, depth: 8, method: 'bench' } ).flags ) {

		assert.ok( [ 'stop', 'warn', 'note' ].includes( flag.level ) && flag.text && flag.source, flag.id );

	}

} );

test( 'benches: narrow, tall or wide ones are flagged at the level the regulation calls for', () => {

	const flag = ( p, id ) => X.planExcavation( { outline: 'floor', method: 'bench', groundwater: 50, ...p } ).flags.find( f => f.id === id );
	// Equal benches 1.2 m wide on 1.2 m risers put the second riser's top 1.2 m out at 2.4 m up,
	// inside the 3H:4V line (1.8 m out): no case of Figure 20-2 allows it.
	const narrow = flag( { width: 3, length: 30, depth: 3.6, soil: 'A', benchWidth: 1.2 }, 'bench-width' );
	assert.equal( narrow.level, 'warn' );
	assert.match( narrow.text, /^Benches 1\.2 m wide on 1\.2 m risers come inside Figure 20-2's 3H:4V line: make them 1\.5 times the riser, 1\.8 m/ );
	assert.equal( flag( { width: 3, length: 30, depth: 3.6, soil: 'A', benchWidth: 1.79 }, 'bench-width' )?.level, 'warn' );
	assert.equal( flag( { width: 3, length: 30, depth: 3.6, soil: 'A', benchWidth: 1.8 }, 'bench-width' ), undefined );
	// One 3 m riser, or two of 2.5 m: unsupported vertical faces over 1.2 m, as a stop.
	const tall = flag( { width: 10, length: 20, depth: 3, soil: 'A', benchHeight: 3 }, 'bench-height' );
	assert.equal( tall.level, 'stop' );
	assert.match( tall.text, /^Unsupported vertical risers 3 m high, over 1\.2 m: slope, bench \(1\.2 m at most\) or shore them before anyone goes in\.$/ );
	assert.equal( flag( { width: 10, length: 20, depth: 5, soil: 'A', benchHeight: 2.5 }, 'bench-height' ).level, 'stop' );
	// Over 3.7 m wide, Figure 20-2 doesn't apply: a warning, not a note.
	assert.equal( flag( { width: 10, length: 30, depth: 3.6, soil: 'A' }, 'bench-wide' ).level, 'warn' );
	assert.equal( flag( { width: 3, length: 30, depth: 3.6, soil: 'A' }, 'bench-wide' ), undefined );

} );

test( 'flags say who writes the instructions, and when the groundwater is only assumed', () => {

	const flags = p => X.planExcavation( p ).flags;
	// Deeper than 6 m: sloped sides a QRP's, benches a professional engineer's.
	const sloped = flags( { width: 20, length: 30, depth: 8, outline: 'floor', slopeBy: 'soil', soil: 'C', groundwater: 50 } ).find( f => f.id === 'deep-slope' );
	assert.match( sloped.text, /QRP's written instructions \(20\.78\(1\)\(a\), 20\.81\(1\)\(a\)\)/ );
	assert.doesNotMatch( sloped.text, /engineer/ );
	const mixed = flags( { width: 20, length: 30, depth: 8, outline: 'floor', method: 'sides', side1: 'bench', soil: 'A', groundwater: 50 } ).find( f => f.id === 'deep-slope' );
	assert.match( mixed.text, /slopes on sides 2, 3, 4 to a QRP's .*; the benches on side 1 a professional engineer's design/ );
	// Wet ground with support: a PE's.
	assert.match( flags( { width: 10, length: 20, depth: 3, soil: 'wet', support: 'sheet-piles' } ).find( f => f.id === 'wet' ).text, /a PE's with support/ );
	// The 2 m default is an assumption; a level set from site data isn't.
	assert.match( flags( { width: 12, length: 20, depth: 2.5, outline: 'floor' } ).find( f => f.id === 'groundwater' ).text, /^Floor 0\.5 m below the groundwater \(assumed 2 m down: set it from site data\)/ );
	assert.match( flags( { width: 12, length: 20, depth: 2.5, outline: 'floor', groundwater: 1.5 } ).find( f => f.id === 'groundwater' ).text, /^Floor 1 m below the groundwater \(1\.5 m down\):/ );
	assert.equal( flags( { width: 10, length: 20, depth: 3, support: 'sheet-piles' } ).find( f => f.id === 'engineered' ).source, 'WorkSafeBC 20.81(1)(d), G20.81' );

} );

test( 'the comparison says when stepping isn\'t a fair way to compare', () => {

	const text = p => X.comparisonText( X.compareMethods( X.normaliseExcavation( { width: 12, length: 20, depth: 4, outline: 'floor', slopeBy: 'soil', ...p } ) ) );
	assert.match( text( { soil: 'C' } ), /^Stepped \(not for soil C: benching shown for hard soil only; over 3\.7 m wide: a QRP's design\) instead: 258 m³ less cut/ );
	assert.match( text( { soil: 'A', width: 3 } ), /^Stepped instead: / );
	assert.match( text( { soil: 'wet', width: 3 } ), /^Stepped \(not for soil C, wet: benching shown for hard soil only\) instead: / );

} );

test( 'a cut 1.2 m deep or less isn\'t a trench: spoil 1.2 m back', () => {

	const shallow = X.planExcavation( { width: 1, length: 20, depth: 1, outline: 'floor', slopeBy: 'custom', slope: 0 } ).quantities;
	assert.equal( shallow.trench, false );
	assert.deepEqual( shallow.zones.spoil[ 0 ], [ - 0.5 - 1.2, - 10 - 1.2 ] );
	assert.equal( X.planExcavation( { width: 1, length: 20, depth: 1.5, outline: 'floor', slopeBy: 'custom', slope: 0 } ).quantities.trench, true );
	// A V-cut is as deep as where its sides meet.
	const vee = X.planExcavation( { width: 2, length: 20, depth: 3, slope: 1 } ).quantities;
	assert.equal( vee.floor, null );
	assert.equal( vee.trench, X.planExcavation( { width: 2, length: 20, depth: 3, slope: 1 } ).quantities.meets > 1.2 );

} );

test( 'lagging only where the face is dug, and spoil beside shoring is in its band', () => {

	// Soldier piles on side 2 between 1.5 : 1 slopes: the wall runs 6 m into each slope's wing,
	// where the slope's soil stands in front of it.
	const d = X.planExcavation( { width: 10, length: 20, depth: 4, outline: 'floor', method: 'sides', side2: 'soldier-piles', slopeBy: 'soil', soil: 'C' } );
	const [ wall ] = d.quantities.walls;
	assert.equal( wall.length, 32 );
	assert.ok( Math.abs( wall.area - 104 ) < 1e-9 );
	assert.ok( Math.abs( wall.lagging - ( 104 + 0.3 * 32 ) ) < 1e-9 );
	assert.match( planShoring( d.params ).summary, /, 114 m² of timber lagging \(8\.5 m³\)/ );
	// The band behind side 2 its load comes from, the depth out from its line.
	const [ band ] = d.quantities.zones.shored;
	assert.equal( band.side, 2 );
	assert.ok( band.polygon.every( ( [ u ] ) => u >= 5 - 1e-9 && u <= 9 + 1e-9 ) );

} );

test( 'typed levels come back the same when normalised again', () => {

	for ( const levels of [ '2, 2.31', '0.21, 2', '4.5, 4.8', '2, 2.3', '1.5, 4.5, 7.52', ' 4.5;1.5 , 1.6, x, 7.52 , -2' ] ) {

		const once = X.normaliseExcavation( { levels } );
		assert.deepEqual( X.normaliseExcavation( X.saveExcavation( once ) ), once, levels );

	}

	assert.equal( X.normaliseExcavation( { levels: '2, 2.3' } ).levels, '2, 2.3' );
	assert.equal( X.normaliseExcavation( { levels: '4.5, 4.8' } ).levels, '4.5, 4.8' );

} );

test( 'raker berms never dig deeper than the finished pit, beside slopes and benches too', () => {

	const pits = [
		{ width: 20, length: 30, depth: 8, outline: 'floor', method: 'sides', side1: 'sheet-piles', side2: 'sheet-piles', side3: 'slope', side4: 'slope', slopeBy: 'soil', soil: 'B', bracing: 'rakers' },
		{ width: 14, length: 18, depth: 6, outline: 'floor', method: 'sides', side1: 'soldier-piles', side2: 'bench', side3: 'secant-piles', side4: 'slope', soil: 'A', bracing: 'rakers' },
		{ width: 30, length: 40, depth: 8, support: 'sheet-piles', bracing: 'rakers', levels: '2, 5', outline: 'floor' },
	];
	for ( const p of pits ) {

		const d = X.planExcavation( p );
		const finished = d.geom;
		const [ front, right, back, left ] = finished.sides;
		let checked = 0;
		for ( const stage of d.stages.filter( s => s.berm !== null ) ) {

			const geom = X.geometryAtStage( finished, d.plan, stage );
			for ( let u = - left.top - 1; u <= right.top + 1; u += 0.25 ) {

				for ( let v = - back.top - 1; v <= front.top + 1; v += 0.25 ) {

					const now = X.depthAt( geom, u, v, stage.dig );
					const end = X.depthAt( finished, u, v, finished.depth );
					assert.ok( now <= end + 1e-9, `${ JSON.stringify( p ) } stage ${ stage.label } at ${ u }, ${ v }: ${ now } > ${ end }` );
					checked ++;

				}

			}

		}

		assert.ok( checked > 1000 );

	}

} );

test( 'walls too close for walers: struts face to face, and a warning', () => {

	const d = X.planExcavation( { width: 1, length: 12, depth: 5, outline: 'floor', support: 'sheet-piles', bracing: 'auto' } );
	assert.equal( d.plan.type, 'struts' );
	assert.equal( d.plan.struts.direct, true );
	assert.ok( Math.abs( d.plan.struts.span - ( 1 - 2 * 0.19 ) ) < 1e-9 );
	assert.ok( d.plan.members.filter( m => m.type === 'strut' ).every( m => m.length > 0.6 ) );
	// No walers on the strutted walls, so nothing overlaps across the pit.
	assert.ok( ! d.plan.members.some( m => m.type === 'waler' && d.plan.struts.across.includes( m.side ) ) );
	assert.ok( d.flags.some( f => f.id === 'too-narrow' && f.level === 'warn' ) );
	assert.match( planShoring( d.params ).levels, /struts 0\.6 m long/ );
	// Wide enough: walers and struts as before.
	const wide = X.planExcavation( { width: 2, length: 12, depth: 5, outline: 'floor', support: 'sheet-piles', bracing: 'auto' } );
	assert.equal( wide.plan.struts.direct, false );
	assert.ok( ! wide.flags.some( f => f.id === 'too-narrow' ) );

} );

test( 'the design is worked out once for each set of params', () => {

	const a = X.planExcavation( { width: 10, length: 12, depth: 3 } );
	assert.equal( X.planExcavation( { width: 10, length: 12, depth: 3, slope: 1 } ), a );
	assert.notEqual( X.planExcavation( { width: 10, length: 12, depth: 3.5 } ), a );

} );
