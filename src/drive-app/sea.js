import { BufferAttribute, BufferGeometry, CanvasTexture, Mesh, MeshBasicMaterial, RepeatWrapping, SRGBColorSpace } from 'three';
import { enuToLocal, localToLatLon } from '../geo.js';
import { useFastRaycast } from '../raycast.js';
import { LAKES } from './lakes.js';

// The open sea. Out past what Google photographs of a coast, its 3D tiles are the sea bed with the
// sea's picture on it, and no surface at all: 180 m down in Santa Monica Bay, 5 km down in the
// middle of the Pacific (measured, docs/world-drive.md); and the same for some deep lakes (Lake
// Baikal's bed, 1.2 km under the ellipsoid). A drop-in there (main.js) whose ground is well under
// the water's surface, on the sea or a coast or one of those lakes (waterAt, below), or deeper than
// any lake or land can be, gets a surface of its own from here: water at the sea's height or the
// lake's, drawn round the vehicle out to the horizon and following it as it drives, which the
// Driver drives on as on any ground and water.js knows is water (so the hovercraft throws up spray
// on it, and nothing puts a boost pad on it). So does a drive out from a coast, or into one of those
// lakes, onto that bed (main.js's watchSea): it's laid there as the vehicle comes to it, and it rolls
// or comes down onto it. It's only by its own water: driven off over land, further than REACH of
// it, it goes (see REACH).
//
// The sea's height. Google's heights are over the WGS 84 ellipsoid, and the sea's surface isn't: it
// lies on the geoid, from 107 m under the ellipsoid (south of India) to 85 m over it (by New
// Guinea), so 0 would leave it far from the coast's own water. This takes it from NGA's EGM96
// geoid, every degree (drive/public/sea/egm96.bin, made by scripts/make-sea-level.mjs), fetched the
// first time it's wanted. Read bilinearly that's within 0.5 m of the full model on average, and
// within 2.5 m of it on 98 in 100 of the map's coasts' squares; it's furthest out by round volcanic
// islands, whose own bump is narrower than a degree: up to 9.5 m low by Hawaii's Big Island, more
// than 6 m low by Puerto Rico, Tenerife, Leyte, the Bonin Islands and the Aleutians. It's 3.9 m
// high at worst (by Lake Maracaibo). And the Earth curves away under the scene's flat frame (8 m in
// 10 km), so the surface does too: each point of it is where the sea is over that point of the
// Earth.

const TABLE = '/sea/egm96.bin';
const ROWS = 181;
const COLUMNS = 360;
// Where the sea and the big lakes are: Natural Earth's every 1/24°, each square land, a coast, the
// sea or one of lakes.js's lakes, as each row's runs of the same (drive/public/sea/mask.bin, made
// by scripts/make-sea-mask.mjs, which says how it's kept).
const MASK = '/sea/mask.bin';
const PER_DEGREE = 24;
const MASK_ROWS = 180 * PER_DEGREE;
const MASK_COLUMNS = 360 * PER_DEGREE;
const KINDS = [ 'land', 'coast', 'sea', 'lake' ];
const EARTH_RADIUS = 6371000;
// The disc of water round the vehicle: rings this far out (m), each in SEGMENTS, fine by the
// vehicle and coarse at the horizon (from the flying ceiling's 150 m up, 44 km off). It's laid
// again round the vehicle once it's MOVE m from where it was laid.
const RINGS = [ 0, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536 ];
const SEGMENTS = 64;
const MOVE = 50;
// It's water only by its own water: the map's squares of the sea and its coasts, or of the lake. Out
// over land, with REACH whole squares or more between the vehicle's square and the nearest of them
// (more than 9 km north or south, 7 km east or west at 43° N), ground under the water's height isn't
// under that water (the plain below a lake's outlet: Niagara's gorge, below Lake Erie; a polder; a
// depression inland from the sea, the Jordan valley), so it's gone there, and laid again when the
// vehicle comes back within reach on ground ABOVE m or more over the water's height (not in a polder
// under it, where it would be over the vehicle). Without the map, or laid where the map has no water
// (ground deeper than any land, which is still the sea's), it stays round the vehicle wherever.
const REACH = 2;
const ABOVE = 0.5;
// Its picture repeats every TILE m: the sea's colour, gently mottled so that driving over it is
// seen to move (one even colour would look still at any speed), its brightness varying by little
// more than Google's water does (water.js's evenness).
const TILE = 24;
const PICTURE = 128;
// The sea's colour: deep blue, about as Google's pictures of the open sea are (not taken from the
// picture under the pin: out there it's the sea bed's relief, shaded, as dark as 12, 13, 19).
const SEA = [ 48, 72, 124 ];

let table = null;
let loading = null;
let mask = null;
let masking = null;

// The sea's height over the ellipsoid at ( lat, lon ) in degrees (m): a promise, the table being
// fetched the first time. Without it (it didn't load), 0.
export function seaLevel( lat, lon ) {

	loading ??= fetch( TABLE )
		.then( response => response.ok ? response.arrayBuffer() : Promise.reject( new Error( `${ response.status }` ) ) )
		.then( buffer => {

			table = new Int8Array( buffer );

		} )
		.catch( () => {

			// Asked again next time.
			loading = null;

		} );
	return loading.then( () => seaLevelNow( lat, lon ) );

}

// The same, from the table as it is now (0 without it).
export function seaLevelNow( lat, lon ) {

	if ( ! table || table.length !== ROWS * COLUMNS ) return 0;
	const y = Math.min( ROWS - 1.000001, Math.max( 0, 90 - lat ) );
	const x = ( ( lon + 180 ) % 360 + 360 ) % 360;
	const row = Math.floor( y );
	const column = Math.floor( x );
	const fy = y - row;
	const fx = x - column;
	const at = ( r, c ) => table[ r * COLUMNS + c % COLUMNS ];
	return ( at( row, column ) * ( 1 - fx ) + at( row, column + 1 ) * fx ) * ( 1 - fy ) + ( at( row + 1, column ) * ( 1 - fx ) + at( row + 1, column + 1 ) * fx ) * fy;

}

// What's at ( lat, lon ) in degrees: { kind } 'sea' (all of the map's square there), 'coast' (the
// sea's edge crosses it), 'lake' with { lake } (lakes.js's, all of the square) or 'land' (the rest,
// a lake's shore among it); a promise, the map being fetched the first time. Without the map (it
// didn't load), null.
export function waterAt( lat, lon ) {

	masking ??= fetch( MASK )
		.then( response => response.ok ? response.arrayBuffer() : Promise.reject( new Error( `${ response.status }` ) ) )
		.then( buffer => {

			mask = readMask( new Uint8Array( buffer ) );

		} )
		.catch( () => {

			// Asked again next time.
			masking = null;

		} );
	return masking.then( () => waterAtNow( lat, lon ) );

}

// The same, from the map as it is now (null without it).
export function waterAtNow( lat, lon ) {

	if ( ! mask ) return null;
	const row = Math.min( MASK_ROWS - 1, Math.max( 0, Math.floor( ( 90 - lat ) * PER_DEGREE ) ) );
	const column = Math.floor( ( ( lon + 180 ) % 360 + 360 ) % 360 * PER_DEGREE ) % MASK_COLUMNS;
	// Along the row's runs to the one the square is in.
	const read = mask.reader( row );
	for ( let at = 0; ; ) {

		const run = read();
		const kind = run % 4;
		const lake = kind === 3 ? LAKES[ read() ] : null;
		at += Math.floor( run / 4 );
		if ( at > column ) return lake ? { kind: 'lake', lake } : { kind: KINDS[ kind ] };

	}

}

// The lakes whose boxes ( lat, lon ) in degrees is in, the only ones a pin there can be on: no need
// to fetch the map for one anywhere else.
export function lakesNear( lat, lon ) {

	return LAKES.filter( ( { box: [ south, west, north, east ] } ) => lat >= south && lat <= north && lon >= west && lon <= east );

}

// The map's bytes, with where each row starts: { reader( row ) }, each call to what that gives the
// next number along the row. One made for another resolution or list of lakes isn't read.
function readMask( bytes ) {

	let at = 0;
	const read = () => {

		let n = 0;
		for ( let shift = 0; ; shift += 7 ) {

			if ( at >= bytes.length ) throw new Error( 'Not the map this expects' );
			const byte = bytes[ at ++ ];
			n += ( byte & 127 ) * 2 ** shift;
			if ( byte < 128 ) return n;

		}

	};
	if ( read() !== PER_DEGREE || read() !== LAKES.length ) throw new Error( 'Not the map this expects' );
	const starts = new Uint32Array( MASK_ROWS );
	for ( let row = 0; row < MASK_ROWS; row ++ ) {

		starts[ row ] = at;
		for ( let column = 0; column < MASK_COLUMNS; ) {

			const run = read();
			if ( run % 4 === 3 && read() >= LAKES.length ) throw new Error( 'Not the map this expects' );
			column += Math.floor( run / 4 );

		}

	}

	if ( at !== bytes.length ) throw new Error( 'Not the map this expects' );
	return {

		reader( row ) {

			at = starts[ row ];
			return read;

		},

	};

}

// scene: World Drive's scene, which the water goes in while there's a sea.
export function createSea( { scene } ) {

	const count = 1 + ( RINGS.length - 1 ) * SEGMENTS;
	const positions = new Float32Array( count * 3 );
	const uvs = new Float32Array( count * 2 );
	const indices = [];
	for ( let s = 0; s < SEGMENTS; s ++ ) indices.push( 0, 1 + ( s + 1 ) % SEGMENTS, 1 + s );
	for ( let r = 1; r < RINGS.length - 1; r ++ ) {

		for ( let s = 0; s < SEGMENTS; s ++ ) {

			const a = 1 + ( r - 1 ) * SEGMENTS + s;
			const b = 1 + ( r - 1 ) * SEGMENTS + ( s + 1 ) % SEGMENTS;
			indices.push( a, b, a + SEGMENTS, b, b + SEGMENTS, a + SEGMENTS );

		}

	}

	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new BufferAttribute( positions, 3 ) );
	geometry.setAttribute( 'uv', new BufferAttribute( uvs, 2 ) );
	geometry.setIndex( indices );
	const material = new MeshBasicMaterial();
	const mesh = new Mesh( geometry, material );
	mesh.name = 'open-sea';
	mesh.userData.sea = true;
	// The vehicle's rays at it (a dozen a frame) go by a bounding volume hierarchy, as at the tiles.
	useFastRaycast( mesh );

	// The place the scene is centred on ({ lat, lon }) and the water's height over the ellipsoid
	// there (m): the scene's y = 0. How far over the sea's height the water is (a lake's height, 0
	// for the sea). Where it was last laid, in the scene.
	let place = null;
	let level = 0;
	let over = 0;
	let laid = null;
	// Which of the map's squares are its water's (see REACH), or null where it's kept wherever.
	let ours = null;

	// Laid round ( east, north ), in the scene: each point where the water is over that point of the
	// Earth, under the scene's flat frame (the Earth curving away from the place the scene is centred
	// on), at the water's height by the vehicle (a lake's surface, like the sea's, lies along the
	// geoid).
	function lay( east, north ) {

		const { lat, lon } = localToLatLon( enuToLocal( east, north, 0 ), place );
		const height = seaLevelNow( lat, lon ) + over - level;
		scene.add( mesh );
		for ( let r = 0; r < RINGS.length; r ++ ) {

			for ( let s = 0; s < ( r ? SEGMENTS : 1 ); s ++ ) {

				const i = r ? 1 + ( r - 1 ) * SEGMENTS + s : 0;
				const angle = s / SEGMENTS * Math.PI * 2;
				const e = east + Math.sin( angle ) * RINGS[ r ];
				const n = north + Math.cos( angle ) * RINGS[ r ];
				const y = height - ( e * e + n * n ) / ( 2 * EARTH_RADIUS );
				positions.set( [ - e, y, n ], i * 3 );
				uvs.set( [ e / TILE, n / TILE ], i * 2 );

			}

		}

		geometry.attributes.position.needsUpdate = true;
		geometry.attributes.uv.needsUpdate = true;
		geometry.computeBoundingSphere();
		geometry.computeBoundingBox();
		laid = { east, north };

	}

	// Whether ( lat, lon ) in degrees is within REACH of its water.
	function near( lat, lon ) {

		if ( ! ours ) return true;
		for ( let row = - REACH; row <= REACH; row ++ ) {

			for ( let column = - REACH; column <= REACH; column ++ ) {

				if ( ours( waterAtNow( lat + row / PER_DEGREE, lon + column / PER_DEGREE ) ) ) return true;

			}

		}

		return false;

	}

	return {

		mesh,

		// Whether there's open water (since a drop-in started on it, till it's cleared).
		get active() {

			return !! place;

		},

		// Whether it's there round the vehicle now (not gone, out over land: see REACH).
		get shown() {

			return !! place && !! mesh.parent;

		},

		// The sea, with the scene centred on { lat, lon } (degrees), whose height over the ellipsoid
		// (m) is the scene's y = 0 there; or `lake`'s surface (lakes.js's), `over` m over the sea's
		// height. Laid round ( east, north ) in the scene, where its water was found: the place
		// itself for a drop-in, out from a coast as the vehicle drives (main.js's watchSea), or beside
		// another driver out on it (main.js's moveCar), and it's that spot's square of the map whose
		// water it's by (see REACH).
		start( { lat, lon, height, over: rise = 0, lake = null, east = 0, north = 0 } ) {

			place = { lat, lon };
			level = height;
			over = rise;
			const mine = lake ? at => at?.kind === 'lake' && at.lake === lake : at => at?.kind === 'sea' || at?.kind === 'coast';
			const found = localToLatLon( enuToLocal( east, north, 0 ), place );
			ours = mine( waterAtNow( found.lat, found.lon ) ) ? mine : null;
			if ( ! material.map ) {

				material.map = picture( SEA );
				material.needsUpdate = true;

			}

			lay( east, north );

		},

		// Each frame while driving: still round the vehicle, at ( east, north, y ) in the scene; or
		// gone, out over land (see REACH).
		follow( east, north, y = Infinity ) {

			if ( ! place || Math.hypot( east - laid.east, north - laid.north ) < MOVE ) return;
			const { lat, lon } = localToLatLon( enuToLocal( east, north, 0 ), place );
			const surface = seaLevelNow( lat, lon ) + over - level - ( east * east + north * north ) / ( 2 * EARTH_RADIUS );
			const here = near( lat, lon );
			if ( here && ( mesh.parent || y >= surface + ABOVE ) ) lay( east, north );
			else {

				// (Asked again MOVE m on.)
				if ( ! here ) mesh.removeFromParent();
				laid = { east, north };

			}

		},

		// Gone, as for a drop-in somewhere else or the globe.
		clear() {

			place = null;
			ours = null;
			mesh.removeFromParent();

		},

	};

}

// The sea's picture: its colour, mottled a little (the same each time).
function picture( [ r, g, b ] ) {

	const canvas = Object.assign( document.createElement( 'canvas' ), { width: PICTURE, height: PICTURE } );
	const context = canvas.getContext( '2d' );
	context.fillStyle = `rgb(${ r },${ g },${ b })`;
	context.fillRect( 0, 0, PICTURE, PICTURE );
	let seed = 7;
	const random = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;
	for ( let i = 0; i < 160; i ++ ) {

		const [ x, y, long, wide, tilt, light ] = [ random() * PICTURE, random() * PICTURE, 6 + random() * 18, 2 + random() * 4, random() * 0.6 - 0.3, random() < 0.5 ];
		const shade = light ? 255 : 0;
		context.fillStyle = `rgba(${ shade },${ shade },${ shade },0.035)`;
		// Each drawn again a picture's width over where it runs off the edge, so it tiles.
		for ( const dx of [ - PICTURE, 0, PICTURE ] ) {

			for ( const dy of [ - PICTURE, 0, PICTURE ] ) {

				context.beginPath();
				context.ellipse( x + dx, y + dy, long, wide, tilt, 0, Math.PI * 2 );
				context.fill();

			}

		}

	}

	const texture = new CanvasTexture( canvas );
	texture.colorSpace = SRGBColorSpace;
	texture.wrapS = texture.wrapT = RepeatWrapping;
	texture.anisotropy = 4;
	return texture;

}
