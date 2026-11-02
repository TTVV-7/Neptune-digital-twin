import { BufferAttribute, BufferGeometry, CanvasTexture, Mesh, MeshBasicMaterial, RepeatWrapping, SRGBColorSpace } from 'three';
import { enuToLocal, localToLatLon } from '../geo.js';
import { useFastRaycast } from '../raycast.js';

// The open sea. Out past what Google photographs of a coast, its 3D tiles are the sea bed with the
// sea's picture on it, and no surface at all: 180 m down in Santa Monica Bay, 5 km down in the
// middle of the Pacific (measured, docs/world-drive.md). A drop-in there (main.js) whose ground is
// deeper than any land or lake can be gets a surface of its own from here: water at the sea's
// height, drawn round the vehicle out to the horizon and following it as it drives, which the
// Driver drives on as on any ground and water.js knows is water (so a ride rides on it until it's
// been on dry ground, the hovercraft floats, and nothing puts a boost pad on it).
//
// The sea's height. Google's heights are over the WGS 84 ellipsoid, and the sea's surface isn't: it
// lies on the geoid, from 107 m under the ellipsoid (south of India) to 85 m over it (by New
// Guinea), so 0 would leave it far from the coast's own water. This takes it from NGA's EGM96
// geoid, every degree (drive/public/sea/egm96.bin, made by scripts/make-sea-level.mjs), fetched the
// first time it's wanted. Read bilinearly that's within 0.5 m of the full model on average; by
// round volcanic islands (Hawaii, the Canaries) 2 to 6 m low. And the Earth curves away under the
// scene's flat frame (8 m in 10 km), so the surface does too: each point of it is where the sea is
// over that point of the Earth.

const TABLE = '/sea/egm96.bin';
const ROWS = 181;
const COLUMNS = 360;
const EARTH_RADIUS = 6371000;
// The disc of water round the vehicle: rings this far out (m), each in SEGMENTS, fine by the
// vehicle and coarse at the horizon (from the flying ceiling's 150 m up, 44 km off). It's laid
// again round the vehicle once it's MOVE m from where it was laid.
const RINGS = [ 0, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536 ];
const SEGMENTS = 64;
const MOVE = 50;
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

	// The place the scene is centred on ({ lat, lon }) and the sea's height over the ellipsoid
	// there (m): the scene's y = 0. Where it was last laid, in the scene.
	let place = null;
	let level = 0;
	let laid = null;

	// Laid round ( east, north ): each point where the sea is over that point of the Earth, under the
	// scene's flat frame (the Earth curving away from the place the scene is centred on), at the
	// sea's height by the vehicle.
	function lay( east, north ) {

		const { lat, lon } = localToLatLon( enuToLocal( east, north, 0 ), place );
		const height = seaLevelNow( lat, lon ) - level;
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

	return {

		mesh,

		get active() {

			return !! place;

		},

		// The sea at the place the scene is now centred on ({ lat, lon } in degrees), whose height
		// over the ellipsoid (m) is the scene's y = 0 there.
		start( { lat, lon, height } ) {

			place = { lat, lon };
			level = height;
			if ( ! material.map ) {

				material.map = picture( SEA );
				material.needsUpdate = true;

			}

			lay( 0, 0 );
			scene.add( mesh );

		},

		// Each frame while driving: still round the vehicle, at ( east, north ) in the scene.
		follow( east, north ) {

			if ( ! place || Math.hypot( east - laid.east, north - laid.north ) < MOVE ) return;
			lay( east, north );

		},

		// Gone, as for a drop-in somewhere else or the globe.
		clear() {

			place = null;
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
