import {
	BufferAttribute,
	BufferGeometry,
	CanvasTexture,
	Color,
	ConeGeometry,
	CylinderGeometry,
	DoubleSide,
	Group,
	InstancedMesh,
	Matrix4,
	Mesh,
	MeshLambertMaterial,
	MeshStandardMaterial,
	PlaneGeometry,
	RepeatWrapping,
	ShapeUtils,
	SRGBColorSpace,
	Vector2,
} from 'three';

// A city drive's city (scripts/make-city.py's file) built in the page: land and water, parks and
// beaches, streets with their lines and bridges you drive over, buildings with windows, and trees
// in the parks. Everything of a kind is one mesh, so a city of a few thousand buildings is a dozen
// draw calls. In the scene's frame: x is west (-east), y up, z north, as models.js places things.
//
// What's driven on and crashed into is `colliders` (the ground, roads, bridges, buildings and the
// water, which every ride drives on as in World Drive); the lines and trees are only drawn.

const WATER_LEVEL = - 1.5;
const LIFT = { sand: 0.02, green: 0.03, path: 0.04, minor: 0.07, major: 0.1 };
const FLOOR = 3.2;
const BAY = 3.6;

const dm = v => v / 10;

// Points of a ring as Vector2s of (east, north) in metres, without a repeated last point.
function points( ring ) {

	const out = [];
	for ( let i = 0; i < ring.length; i += 2 ) out.push( new Vector2( dm( ring[ i ] ), dm( ring[ i + 1 ] ) ) );
	return out;

}

// Grows one geometry's arrays as pieces are added.
class Builder {

	constructor( { uv = false, colour = false } = {} ) {

		this.position = [];
		this.normal = [];
		this.uv = uv ? [] : null;
		this.colour = colour ? [] : null;

	}

	// A triangle from three [ x, y, z ] points (the scene's frame), facing whichever way its
	// winding says (materials are double-sided, so either way lights right).
	tri( a, b, c, uvs = null, rgb = null ) {

		const ux = b[ 0 ] - a[ 0 ], uy = b[ 1 ] - a[ 1 ], uz = b[ 2 ] - a[ 2 ];
		const vx = c[ 0 ] - a[ 0 ], vy = c[ 1 ] - a[ 1 ], vz = c[ 2 ] - a[ 2 ];
		let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
		const length = Math.hypot( nx, ny, nz ) || 1;
		nx /= length; ny /= length; nz /= length;
		for ( const [ i, p ] of [ a, b, c ].entries() ) {

			this.position.push( p[ 0 ], p[ 1 ], p[ 2 ] );
			this.normal.push( nx, ny, nz );
			if ( this.uv ) this.uv.push( ...( uvs ? uvs[ i ] : [ 0, 0 ] ) );
			if ( this.colour ) this.colour.push( rgb.r, rgb.g, rgb.b );

		}

	}

	quad( a, b, c, d, uvs = null, rgb = null ) {

		this.tri( a, b, c, uvs && [ uvs[ 0 ], uvs[ 1 ], uvs[ 2 ] ], rgb );
		this.tri( a, c, d, uvs && [ uvs[ 0 ], uvs[ 2 ], uvs[ 3 ] ], rgb );

	}

	// A flat polygon ([ outer, holes... ] rings) at height y, with UVs in metres / `tile`.
	flat( polygon, y, rgb = null, tile = 0 ) {

		const [ outer, ...holes ] = polygon.map( points );
		if ( outer.length < 3 ) return;
		const all = [ outer, ...holes ].flat();
		const faces = ShapeUtils.triangulateShape( outer, holes.filter( h => h.length >= 3 ) );
		for ( const [ i, j, k ] of faces ) {

			const p = [ all[ i ], all[ j ], all[ k ] ];
			this.tri( ...p.map( v => [ - v.x, y, v.y ] ), tile ? p.map( v => [ v.x / tile, v.y / tile ] ) : null, rgb );

		}

	}

	mesh( material ) {

		const geometry = new BufferGeometry();
		geometry.setAttribute( 'position', new BufferAttribute( new Float32Array( this.position ), 3 ) );
		geometry.setAttribute( 'normal', new BufferAttribute( new Float32Array( this.normal ), 3 ) );
		if ( this.uv ) geometry.setAttribute( 'uv', new BufferAttribute( new Float32Array( this.uv ), 2 ) );
		if ( this.colour ) geometry.setAttribute( 'color', new BufferAttribute( new Float32Array( this.colour ), 3 ) );
		geometry.computeBoundingBox();
		geometry.computeBoundingSphere();
		return new Mesh( geometry, material );

	}

}

// --- textures ------------------------------------------------------------------------------

function canvasTexture( size, draw ) {

	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = size;
	draw( canvas.getContext( '2d' ), size );
	const texture = new CanvasTexture( canvas );
	texture.wrapS = texture.wrapT = RepeatWrapping;
	texture.colorSpace = SRGBColorSpace;
	texture.anisotropy = 8;
	return texture;

}

// One bay of one floor: wall round a window, tinted by each building's colour.
const windowTexture = () => canvasTexture( 64, ( ctx, n ) => {

	ctx.fillStyle = '#f2f2f0';
	ctx.fillRect( 0, 0, n, n );
	ctx.fillStyle = '#3b4a57';
	ctx.fillRect( n * 0.14, n * 0.2, n * 0.72, n * 0.55 );
	ctx.fillStyle = 'rgba( 255, 255, 255, 0.18 )';
	ctx.fillRect( n * 0.14, n * 0.2, n * 0.72, n * 0.12 );
	ctx.fillStyle = '#d9d9d6';
	ctx.fillRect( 0, n * 0.92, n, n * 0.08 );

} );

// Asphalt: dark, finely speckled.
const asphaltTexture = () => canvasTexture( 128, ( ctx, n ) => {

	ctx.fillStyle = '#56595c';
	ctx.fillRect( 0, 0, n, n );
	let seed = 7;
	const random = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;
	for ( let i = 0; i < 2600; i ++ ) {

		const shade = 70 + random() * 40;
		ctx.fillStyle = `rgb(${ shade }, ${ shade + 2 }, ${ shade + 4 })`;
		ctx.fillRect( random() * n, random() * n, 1.2, 1.2 );

	}

} );

// --- the city ------------------------------------------------------------------------------

export function buildCity( city, { trees = true } = {} ) {

	const group = new Group();
	group.name = city.name;
	const colliders = new Group();
	colliders.name = 'ground';
	group.add( colliders );

	// Water everywhere, well past the city's edge, a step below the land.
	const [ width, height ] = city.size;
	const reach = Math.max( width, height ) * 4;
	const water = new Mesh( new PlaneGeometry( reach, reach ).rotateX( - Math.PI / 2 ), new MeshStandardMaterial( { color: 0x3f7392, roughness: 0.25, metalness: 0.1 } ) );
	water.position.y = WATER_LEVEL;
	water.name = 'water';
	colliders.add( water );

	// The land, with a sea wall down to the water round it.
	const land = new Builder();
	for ( const polygon of city.land ) {

		land.flat( polygon, 0 );
		for ( const ring of polygon ) {

			const p = points( ring );
			for ( let i = 0; i < p.length; i ++ ) {

				const a = p[ i ], b = p[ ( i + 1 ) % p.length ];
				land.quad( [ - a.x, 0, a.y ], [ - b.x, 0, b.y ], [ - b.x, WATER_LEVEL - 0.5, b.y ], [ - a.x, WATER_LEVEL - 0.5, a.y ] );

			}

		}

	}

	colliders.add( Object.assign( land.mesh( new MeshLambertMaterial( { color: 0xb7b2a6, side: DoubleSide } ) ), { name: 'land' } ) );

	const green = new Builder();
	for ( const polygon of city.green ) green.flat( polygon, LIFT.green );
	colliders.add( green.mesh( new MeshLambertMaterial( { color: 0x7fa86a, side: DoubleSide } ) ) );
	const sand = new Builder();
	for ( const polygon of city.sand ) sand.flat( polygon, LIFT.sand );
	colliders.add( sand.mesh( new MeshLambertMaterial( { color: 0xe3d3a6, side: DoubleSide } ) ) );

	buildRoads( city, colliders, group );
	buildBuildings( city, colliders );
	if ( trees ) group.add( buildTrees( city ) );

	return { group, colliders };

}

// Streets: a strip each, mitred at the bends, at its kind's lift (bridges at their heights, with a
// deck under them), and lines down the middle of the wider ones.
function buildRoads( city, colliders, group ) {

	const roads = new Builder( { uv: true } );
	const paths = new Builder();
	const decks = new Builder();
	const lines = { yellow: new Builder(), white: new Builder() };
	for ( const [ line, width, kind, heights ] of city.roads ) {

		const p = points( line );
		if ( p.length < 2 ) continue;
		const lift = LIFT[ kind ] ?? LIFT.minor;
		const h = i => ( heights ? dm( heights[ i ] ) : 0 ) + lift;
		const half = width / 2;
		// Each point's sideways offset: the average of its two segments' normals, lengthened at a bend.
		const sides = p.map( ( v, i ) => {

			const a = p[ Math.max( 0, i - 1 ) ], b = p[ Math.min( p.length - 1, i + 1 ) ];
			const prev = i > 0 ? v.clone().sub( a ).normalize() : null;
			const next = i < p.length - 1 ? b.clone().sub( v ).normalize() : null;
			const dir = ( prev && next ? prev.add( next ) : prev ?? next ).normalize();
			const normal = new Vector2( - dir.y, dir.x );
			const bend = prev && next ? Math.max( 0.5, normal.dot( new Vector2( - next.y, next.x ) ) ) : 1;
			return normal.multiplyScalar( half / bend );

		} );
		const target = kind === 'path' ? paths : roads;
		let along = 0;
		for ( let i = 0; i < p.length - 1; i ++ ) {

			const a = p[ i ], b = p[ i + 1 ];
			const length = a.distanceTo( b );
			const la = a.clone().add( sides[ i ] ), ra = a.clone().sub( sides[ i ] );
			const lb = b.clone().add( sides[ i + 1 ] ), rb = b.clone().sub( sides[ i + 1 ] );
			const corners = [ [ - la.x, h( i ), la.y ], [ - ra.x, h( i ), ra.y ], [ - rb.x, h( i + 1 ), rb.y ], [ - lb.x, h( i + 1 ), lb.y ] ];
			const tile = 6;
			target.quad( ...corners, target.uv ? [ [ 0, along / tile ], [ width / tile, along / tile ], [ width / tile, ( along + length ) / tile ], [ 0, ( along + length ) / tile ] ] : null );
			if ( heights ) {

				// The deck's sides and underside, a metre deep.
				const down = c => [ c[ 0 ], c[ 1 ] - 1, c[ 2 ] ];
				const [ c0, c1, c2, c3 ] = corners;
				decks.quad( c0, c3, down( c3 ), down( c0 ) );
				decks.quad( c1, c2, down( c2 ), down( c1 ) );
				decks.quad( down( c0 ), down( c1 ), down( c2 ), down( c3 ) );
				// Railings.
				const up = ( c, by ) => [ c[ 0 ], c[ 1 ] + by, c[ 2 ] ];
				decks.quad( c0, c3, up( c3, 0.9 ), up( c0, 0.9 ) );
				decks.quad( c1, c2, up( c2, 0.9 ), up( c1, 0.9 ) );

			}

			// Dashed lines down the middle of streets wide enough for two lanes.
			if ( kind !== 'path' && width >= 7 ) {

				const paint = kind === 'major' ? lines.yellow : lines.white;
				const dir = b.clone().sub( a ).normalize();
				const across = new Vector2( - dir.y, dir.x ).multiplyScalar( 0.08 );
				for ( let s = ( 6 - ( along % 6 ) ) % 6; s < length - 3; s += 6 ) {

					const p0 = a.clone().addScaledVector( dir, s ), p1 = a.clone().addScaledVector( dir, s + 3 );
					const t0 = s / length, t1 = ( s + 3 ) / length;
					const y0 = h( i ) * ( 1 - t0 ) + h( i + 1 ) * t0 + 0.015, y1 = h( i ) * ( 1 - t1 ) + h( i + 1 ) * t1 + 0.015;
					paint.quad( [ - ( p0.x + across.x ), y0, p0.y + across.y ], [ - ( p0.x - across.x ), y0, p0.y - across.y ], [ - ( p1.x - across.x ), y1, p1.y - across.y ], [ - ( p1.x + across.x ), y1, p1.y + across.y ] );

				}

			}

			along += length;

		}

	}

	const asphalt = asphaltTexture();
	colliders.add( Object.assign( roads.mesh( new MeshLambertMaterial( { map: asphalt, side: DoubleSide } ) ), { name: 'roads' } ) );
	colliders.add( paths.mesh( new MeshLambertMaterial( { color: 0xd8d0bd, side: DoubleSide } ) ) );
	colliders.add( Object.assign( decks.mesh( new MeshLambertMaterial( { color: 0x9a9c9e, side: DoubleSide } ) ), { name: 'bridges' } ) );
	group.add( lines.yellow.mesh( new MeshLambertMaterial( { color: 0xe8c547, side: DoubleSide } ) ) );
	group.add( lines.white.mesh( new MeshLambertMaterial( { color: 0xf1f1ec, side: DoubleSide } ) ) );

}

// Buildings: walls with a window every bay and floor, tinted their colour, and a flat roof a
// shade darker.
function buildBuildings( city, colliders ) {

	const walls = new Builder( { uv: true, colour: true } );
	const roofs = new Builder( { colour: true } );
	const tint = new Color();
	const roofTint = new Color();
	for ( const [ ring, base10, top10, colour ] of city.buildings ) {

		const p = points( ring );
		if ( p.length < 3 ) continue;
		const base = dm( base10 ), top = dm( top10 );
		tint.set( colour );
		roofTint.copy( tint ).multiplyScalar( 0.72 );
		let along = 0;
		for ( let i = 0; i < p.length; i ++ ) {

			const a = p[ i ], b = p[ ( i + 1 ) % p.length ];
			const length = a.distanceTo( b );
			const u0 = along / BAY, u1 = ( along + length ) / BAY;
			const v0 = base / FLOOR, v1 = top / FLOOR;
			walls.quad( [ - a.x, base, a.y ], [ - b.x, base, b.y ], [ - b.x, top, b.y ], [ - a.x, top, a.y ], [ [ u0, v0 ], [ u1, v0 ], [ u1, v1 ], [ u0, v1 ] ], tint );
			along += length;

		}

		roofs.flat( [ ring ], top, roofTint );
		if ( base > 0 ) roofs.flat( [ ring ], base, roofTint );

	}

	const facade = windowTexture();
	colliders.add( Object.assign( walls.mesh( new MeshLambertMaterial( { map: facade, vertexColors: true, side: DoubleSide } ) ), { name: 'buildings' } ) );
	colliders.add( Object.assign( roofs.mesh( new MeshLambertMaterial( { vertexColors: true, side: DoubleSide } ) ), { name: 'roofs' } ) );

}

// Trees scattered over the parks, about one per 120 m², as two instanced meshes (trunks and
// crowns). Not collided with: driven through, as in an arcade game.
function buildTrees( city ) {

	const group = new Group();
	group.name = 'trees';
	const spots = [];
	let seed = 99;
	const random = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;
	const roadsNear = roadGrid( city );
	for ( const polygon of city.green ) {

		const [ outer, ...holes ] = polygon.map( points );
		let minX = Infinity, maxX = - Infinity, minY = Infinity, maxY = - Infinity;
		for ( const v of outer ) {

			minX = Math.min( minX, v.x ); maxX = Math.max( maxX, v.x ); minY = Math.min( minY, v.y ); maxY = Math.max( maxY, v.y );

		}

		const area = ( maxX - minX ) * ( maxY - minY );
		const count = Math.min( 20000, Math.round( area / 120 ) );
		for ( let i = 0; i < count && spots.length < 40000; i ++ ) {

			const x = minX + random() * ( maxX - minX ), y = minY + random() * ( maxY - minY );
			if ( ! inside( outer, x, y ) || holes.some( h => inside( h, x, y ) ) || roadsNear( x, y ) ) continue;
			spots.push( [ x, y, 0.7 + random() * 0.6 ] );

		}

	}

	const trunk = new InstancedMesh( new CylinderGeometry( 0.18, 0.25, 2.4, 6 ).translate( 0, 1.2, 0 ), new MeshLambertMaterial( { color: 0x5a4632 } ), spots.length );
	const crown = new InstancedMesh( new ConeGeometry( 2.2, 7, 7 ).translate( 0, 5.5, 0 ), new MeshLambertMaterial( { color: 0x3f6b3a } ), spots.length );
	const m = new Matrix4();
	spots.forEach( ( [ x, y, s ], i ) => {

		m.makeScale( s, s, s ).setPosition( - x, LIFT.green, y );
		trunk.setMatrixAt( i, m );
		crown.setMatrixAt( i, m );

	} );
	group.add( trunk, crown );
	return group;

}

// Whether a point is on (or by) a road, from a 4 m grid of the roads' points.
function roadGrid( city ) {

	const cells = new Set();
	const key = ( x, y ) => `${ Math.round( x / 4 ) },${ Math.round( y / 4 ) }`;
	for ( const [ line ] of city.roads ) {

		const p = points( line );
		for ( let i = 0; i < p.length - 1; i ++ ) {

			const steps = Math.ceil( p[ i ].distanceTo( p[ i + 1 ] ) / 2 );
			for ( let s = 0; s <= steps; s ++ ) {

				const v = p[ i ].clone().lerp( p[ i + 1 ], s / steps );
				for ( const dx of [ - 4, 0, 4 ] ) for ( const dy of [ - 4, 0, 4 ] ) cells.add( key( v.x + dx, v.y + dy ) );

			}

		}

	}

	return ( x, y ) => cells.has( key( x, y ) );

}

function inside( ring, x, y ) {

	let hit = false;
	for ( let i = 0, j = ring.length - 1; i < ring.length; j = i ++ ) {

		const a = ring[ i ], b = ring[ j ];
		if ( ( a.y > y ) !== ( b.y > y ) && x < ( b.x - a.x ) * ( y - a.y ) / ( b.y - a.y ) + a.x ) hit = ! hit;

	}

	return hit;

}
