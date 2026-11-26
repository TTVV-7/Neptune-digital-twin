import { HttpError } from '../http.js';

// A look at a World Drive Build site from above, for the MCP server's view_site (mcp.js): Google's
// satellite imagery round a point, north up, with a metre grid labelled in metres east and north
// of the project's site point and the shapes of what's placed drawn on, as a JPEG.
//
// The imagery is the Map Tiles API's 2D tiles (satellite), the same API (and key) the editor's 3D
// map uses, so nothing new has to be turned on for the key: a session (POST createSession, kept
// while it lasts), the viewport's attribution and how far it zooms there (GET tile/v1/viewport),
// then the 256 px web mercator tiles that cover the view (GET v1/2dtiles/z/x/y), as PNGs. Tiles are
// kept in Cloudflare's cache for a day, as Google's own Cache-Control says (max-age 86400), so a
// second look at the same site costs Google nothing. There's no canvas in a Worker: the tiles are
// decoded (inflated by the runtime's own DecompressionStream), laid together, drawn on and encoded
// as a JPEG here in plain JavaScript, with no packages (a JPEG, not a PNG: a satellite picture is
// about 250 KB as one, five times smaller, and the labels stay sharp).
//
// Google's terms: the picture says "Google" and the imagery's copyright on it, and the words that
// go with it say them too.
//
// Settings: GOOGLE_TILES_KEY, a key for this alone (the Map Tiles API), else the Maps key the editor
// is handed; MAP_TILES_CACHE 'off' keeps no tiles (each look fetches them all from Google);
// MAP_TILES_UPSTREAM (tests only: a stand-in for https://tile.googleapis.com).

export const VIEW_PIXELS = 768;
const TILE = 256;
const TILES = 'https://tile.googleapis.com';
// More than this many tiles to a view and it's made from the next zoom out instead.
const MOST_TILES = 49;
const TILE_DAYS = 1;
const HOUR_MS = 60 * 60 * 1000;
const EARTH = 6378137;
// src/geo.js's flat-earth metres (the editor's east and north round its site point).
const METRES_PER_DEG_LAT = 111132;
const metresPerDegLon = lat => 111320 * Math.cos( lat * Math.PI / 180 );
// Grid steps (m): the first that makes at most eight lines across.
const STEPS = [ 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000 ];
const MISSING = [ 96, 96, 96 ];
const BLACK = [ 0, 0, 0 ];
const WHITE = [ 255, 255, 255 ];
const SITE_POINT = [ 255, 40, 40 ];

// A session for the satellite tiles, kept while it lasts ({ id, expires, upstream, key }).
let session = null;

// The picture: { bytes (a JPEG's), mimeType, width, height, metresPerPixel, zoom, copyright, step
// (the grid's, m), east: [ west edge, east edge ], north: [ south edge, north edge ], shown (how
// many shapes are on it) }.
// `at`: { lat, lon } of the site point; `centre`: { east, north } of the middle; `size`: metres
// across; shapes: what's placed (see drawShape). context: { env, ctx, key, origin } (origin: the
// site's, for the cache's keys and the Referer Google is sent).
export async function siteView( context, { at, centre, size, shapes } ) {

	const width = VIEW_PIXELS, height = VIEW_PIXELS;
	const metresPerPixel = size / width;
	// Where each column and row of the picture is, in metres from the site point and so in degrees.
	const easts = Float64Array.from( { length: width }, ( _, i ) => centre.east + ( i + 0.5 - width / 2 ) * metresPerPixel );
	const norths = Float64Array.from( { length: height }, ( _, i ) => centre.north + ( height / 2 - i - 0.5 ) * metresPerPixel );
	const lons = easts.map( e => at.lon + e / metresPerDegLon( at.lat ) );
	const lats = norths.map( n => at.lat + n / METRES_PER_DEG_LAT );
	const bounds = { north: lats[ 0 ], south: lats[ height - 1 ], west: lons[ 0 ], east: lons[ width - 1 ] };
	const middle = at.lat + centre.north / METRES_PER_DEG_LAT;
	// The zoom whose own pixels are nearest the picture's (from 0.7 to 1.4 of them to one of its).
	const wanted = Math.max( 1, Math.min( 22, Math.round( Math.log2( 2 * Math.PI * EARTH * Math.cos( middle * Math.PI / 180 ) / TILE / metresPerPixel ) ) ) );
	const tiles = await tileSource( context );
	let viewport = await tiles.viewport( wanted, bounds );
	let zoom = Math.min( wanted, viewport.maxZoom );
	if ( zoom !== wanted ) viewport = await tiles.viewport( zoom, bounds );
	let mosaic;
	for ( ;; ) {

		mosaic = await mosaicOf( tiles, zoom, lats, lons );
		// Tiles missing (past the imagery's best zoom here): from one zoom out, down to three.
		if ( ! mosaic.missing || zoom <= wanted - 3 || zoom <= 1 ) break;
		zoom --;

	}

	if ( mosaic.missing === mosaic.count ) throw new HttpError( 502, 'Google has no satellite imagery there.' );
	const image = { width, height, rgb: new Uint8Array( width * height * 3 ) };
	resample( mosaic, image );
	const toPixel = ( east, north ) => [ ( east - centre.east ) / metresPerPixel + width / 2, ( centre.north - north ) / metresPerPixel + height / 2 ];
	const step = STEPS.find( s => size / s <= 8 ) ?? STEPS.at( - 1 );
	drawGrid( image, { centre, size, step, toPixel } );
	const labels = [];
	let shown = 0;
	for ( const shape of shapes ) if ( drawShape( image, shape, toPixel, metresPerPixel, labels ) ) shown ++;
	drawSitePoint( image, toPixel );
	drawLabels( image, labels );
	drawAttribution( image, viewport.copyright );
	return {
		bytes: encodeJpeg( image ), mimeType: 'image/jpeg', width, height, metresPerPixel, zoom, copyright: viewport.copyright, step, shown,
		east: [ easts[ 0 ] - metresPerPixel / 2, easts[ width - 1 ] + metresPerPixel / 2 ], north: [ norths[ height - 1 ] - metresPerPixel / 2, norths[ 0 ] + metresPerPixel / 2 ],
	};

}

// --- Google's tiles --------------------------------------------------------------------------

// The key view_site uses: GOOGLE_TILES_KEY, else the Maps key the editor is handed ('' if neither).
export function tilesKey( env, mapsKey ) {

	return typeof env.GOOGLE_TILES_KEY === 'string' && env.GOOGLE_TILES_KEY.trim() ? env.GOOGLE_TILES_KEY.trim() : mapsKey ?? '';

}

// { viewport( zoom, bounds ), tile( z, x, y ) } for the satellite tiles, in a session.
async function tileSource( { env, ctx, key, origin } ) {

	const upstream = env.MAP_TILES_UPSTREAM || TILES;
	// A key kept to the site's own pages (an HTTP referrer restriction) takes these as from them.
	const headers = { Referer: `${ origin }/build/app/` };
	const now = Date.now();
	if ( ! session || session.upstream !== upstream || session.key !== key || session.expires - now < HOUR_MS ) {

		const res = await fetch( `${ upstream }/v1/createSession?key=${ encodeURIComponent( key ) }`, {
			method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
			body: JSON.stringify( { mapType: 'satellite', language: 'en-US', region: 'US', imageFormat: 'png' } ),
		} );
		if ( ! res.ok ) await refused( res, 'session' );
		const made = await res.json();
		if ( typeof made.session !== 'string' ) throw new HttpError( 502, 'Google\'s map tiles didn\'t start a session. Try again.' );
		session = { id: made.session, expires: Number( made.expiry ) * 1000 || now + 12 * HOUR_MS, upstream, key };

	}

	const query = `session=${ encodeURIComponent( session.id ) }&key=${ encodeURIComponent( key ) }`;
	const cache = typeof caches === 'undefined' || env.MAP_TILES_CACHE === 'off' ? null : caches.default;
	return {

		async viewport( zoom, bounds ) {

			const where = Object.entries( bounds ).map( ( [ k, v ] ) => `${ k }=${ v.toFixed( 7 ) }` ).join( '&' );
			const res = await fetch( `${ upstream }/tile/v1/viewport?${ query }&zoom=${ zoom }&${ where }`, { headers } );
			if ( ! res.ok ) await refused( res, 'viewport' );
			const { copyright, maxZoomRects } = await res.json();
			// The most it zooms at the view's middle: the highest of the rectangles that hold it.
			const lat = ( bounds.north + bounds.south ) / 2, lon = ( bounds.east + bounds.west ) / 2;
			const holding = ( Array.isArray( maxZoomRects ) ? maxZoomRects : [] ).filter( r => lat <= r.north && lat >= r.south && lon <= r.east && lon >= r.west );
			const maxZoom = holding.length ? Math.max( ...holding.map( r => r.maxZoom ) ) : 19;
			return { copyright: typeof copyright === 'string' && copyright.trim() ? copyright.trim() : 'Imagery ©Google', maxZoom };

		},

		// A tile's bytes, or null where Google has none.
		async tile( z, x, y ) {

			const cacheKey = new Request( `${ origin }/build/map-tiles/satellite/${ z }/${ x }/${ y }.png` );
			const hit = await cache?.match( cacheKey );
			if ( hit ) return new Uint8Array( await hit.arrayBuffer() );
			const res = await fetch( `${ upstream }/v1/2dtiles/${ z }/${ x }/${ y }?${ query }`, { headers } );
			if ( res.status === 404 ) return null;
			if ( ! res.ok ) await refused( res, 'tile' );
			const bytes = new Uint8Array( await res.arrayBuffer() );
			if ( cache ) {

				const kept = cache.put( cacheKey, new Response( bytes, { headers: { 'Content-Type': 'image/png', 'Cache-Control': `max-age=${ TILE_DAYS * 86400 }` } } ) );
				if ( ctx?.waitUntil ) ctx.waitUntil( kept );
				else await kept;

			}

			return bytes;

		},

	};

}

// Google said no: what to tell Claude (the owner's to fix, or try later). The details are logged.
async function refused( res, what ) {

	const body = ( await res.text().catch( () => '' ) ).slice( 0, 300 );
	console.error( 'Map tiles refused', what, res.status, body );
	if ( res.status === 401 || res.status === 403 ) {

		session = null;
		throw new HttpError( 502, `Google's map tiles turned the key away (${ res.status }). The site's owner needs the Map Tiles API on for the key (2D tiles as well as 3D), and the key not kept to browsers alone. Carry on without the picture: get_project has what's placed.` );

	}

	if ( res.status === 429 ) throw new HttpError( 502, 'Google\'s map tiles are busy just now (429). Try again in a minute.' );
	throw new HttpError( 502, `Google's map tiles failed (${ res.status }). Try again.` );

}

// The tiles under the picture, laid together: { rgb, x0, y0 (the first tile's, in tiles), columns,
// rows, zoom, xs, ys (each column's and row's world pixel at this zoom), count, missing }.
async function mosaicOf( tiles, zoom, lats, lons ) {

	let z = zoom, xs, ys, x0, x1, y0, y1;
	for ( ;; z -- ) {

		const scale = TILE * 2 ** z;
		xs = lons.map( lon => ( lon + 180 ) / 360 * scale );
		ys = lats.map( lat => {

			const s = Math.sin( lat * Math.PI / 180 );
			return ( 0.5 - Math.log( ( 1 + s ) / ( 1 - s ) ) / ( 4 * Math.PI ) ) * scale;

		} );
		x0 = Math.floor( ( xs[ 0 ] - 1 ) / TILE ); x1 = Math.floor( ( xs.at( - 1 ) + 1 ) / TILE );
		y0 = Math.max( 0, Math.floor( ( ys[ 0 ] - 1 ) / TILE ) ); y1 = Math.min( 2 ** z - 1, Math.floor( ( ys.at( - 1 ) + 1 ) / TILE ) );
		if ( ( x1 - x0 + 1 ) * ( y1 - y0 + 1 ) <= MOST_TILES || z <= 1 ) break;

	}

	const columns = x1 - x0 + 1, rows = y1 - y0 + 1;
	const stride = columns * TILE * 3;
	const rgb = new Uint8Array( stride * rows * TILE );
	const wanted = [];
	for ( let ty = y0; ty <= y1; ty ++ ) for ( let tx = x0; tx <= x1; tx ++ ) wanted.push( [ tx, ty ] );
	const got = await Promise.all( wanted.map( ( [ tx, ty ] ) => tiles.tile( z, ( ( tx % 2 ** z ) + 2 ** z ) % 2 ** z, ty ) ) );
	let missing = 0;
	for ( let k = 0; k < wanted.length; k ++ ) {

		const [ tx, ty ] = wanted[ k ];
		const decoded = got[ k ] ? await decodePng( got[ k ] ).catch( () => null ) : null;
		if ( ! decoded ) missing ++;
		const left = ( tx - x0 ) * TILE, top = ( ty - y0 ) * TILE;
		for ( let y = 0; y < TILE; y ++ ) {

			const row = ( top + y ) * stride + left * 3;
			if ( decoded && decoded.width === TILE && decoded.height === TILE ) rgb.set( decoded.rgb.subarray( y * TILE * 3, ( y + 1 ) * TILE * 3 ), row );
			else for ( let x = 0; x < TILE; x ++ ) rgb.set( MISSING, row + x * 3 );

		}

	}

	return { rgb, stride, x0, y0, columns, rows, zoom: z, xs, ys, count: wanted.length, missing };

}

// The picture from the mosaic, each pixel a bilinear mix of the four tile pixels round it. North is
// up and east is right in both, so each column has one x and each row one y.
function resample( mosaic, image ) {

	const { rgb, stride, x0, y0, columns, rows, xs, ys } = mosaic;
	const maxX = columns * TILE - 1, maxY = rows * TILE - 1;
	const out = image.rgb;
	const cols = Array.from( xs, x => {

		const fx = Math.min( maxX, Math.max( 0, x - x0 * TILE - 0.5 ) );
		const ix = Math.min( maxX - 1, Math.floor( fx ) );
		return [ ix * 3, fx - ix ];

	} );
	let o = 0;
	for ( let j = 0; j < image.height; j ++ ) {

		const fy = Math.min( maxY, Math.max( 0, ys[ j ] - y0 * TILE - 0.5 ) );
		const iy = Math.min( maxY - 1, Math.floor( fy ) );
		const ty = fy - iy;
		const top = iy * stride, bottom = top + stride;
		for ( let i = 0; i < image.width; i ++ ) {

			const [ ix, tx ] = cols[ i ];
			for ( let c = 0; c < 3; c ++ ) {

				const a = rgb[ top + ix + c ], b = rgb[ top + ix + 3 + c ], d = rgb[ bottom + ix + c ], e = rgb[ bottom + ix + 3 + c ];
				out[ o ++ ] = ( a + ( b - a ) * tx ) * ( 1 - ty ) + ( d + ( e - d ) * tx ) * ty + 0.5;

			}

		}

	}

}

// --- drawing ---------------------------------------------------------------------------------

function blend( image, x, y, colour, alpha ) {

	if ( x < 0 || y < 0 || x >= image.width || y >= image.height || alpha <= 0 ) return;
	const k = ( y * image.width + x ) * 3;
	const a = Math.min( 1, alpha );
	for ( let c = 0; c < 3; c ++ ) image.rgb[ k + c ] += ( colour[ c ] - image.rgb[ k + c ] ) * a;

}

function fillRect( image, x0, y0, x1, y1, colour, alpha ) {

	for ( let y = Math.max( 0, Math.floor( y0 ) ); y < Math.min( image.height, Math.ceil( y1 ) ); y ++ ) {

		for ( let x = Math.max( 0, Math.floor( x0 ) ); x < Math.min( image.width, Math.ceil( x1 ) ); x ++ ) blend( image, x, y, colour, alpha );

	}

}

// A line `width` px wide from a to b, its edges smoothed.
function segment( image, [ ax, ay ], [ bx, by ], width, colour, alpha = 1 ) {

	const reach = width / 2 + 1;
	const dx = bx - ax, dy = by - ay;
	const square = dx * dx + dy * dy;
	const left = Math.max( 0, Math.floor( Math.min( ax, bx ) - reach ) ), right = Math.min( image.width - 1, Math.ceil( Math.max( ax, bx ) + reach ) );
	const top = Math.max( 0, Math.floor( Math.min( ay, by ) - reach ) ), bottom = Math.min( image.height - 1, Math.ceil( Math.max( ay, by ) + reach ) );
	for ( let y = top; y <= bottom; y ++ ) {

		for ( let x = left; x <= right; x ++ ) {

			const px = x + 0.5, py = y + 0.5;
			const t = square ? Math.min( 1, Math.max( 0, ( ( px - ax ) * dx + ( py - ay ) * dy ) / square ) ) : 0;
			const d = Math.hypot( px - ax - t * dx, py - ay - t * dy );
			const cover = Math.min( 1, Math.max( 0, width / 2 + 0.5 - d ) );
			if ( cover > 0 ) blend( image, x, y, colour, cover * alpha );

		}

	}

}

// A closed outline through points, with a dark edge either side so it shows on any ground.
function outline( image, points, colour, { fill = 0, width = 2 } = {} ) {

	if ( fill ) fillPolygon( image, points, colour, fill );
	const edges = points.map( ( p, i ) => [ p, points[ ( i + 1 ) % points.length ] ] );
	for ( const [ a, b ] of edges ) segment( image, a, b, width + 2, BLACK, 0.55 );
	for ( const [ a, b ] of edges ) segment( image, a, b, width, colour );

}

function line( image, a, b, colour, width = 2 ) {

	segment( image, a, b, width + 2, BLACK, 0.55 );
	segment( image, a, b, width, colour );

}

function fillPolygon( image, points, colour, alpha ) {

	const top = Math.max( 0, Math.floor( Math.min( ...points.map( p => p[ 1 ] ) ) ) ), bottom = Math.min( image.height - 1, Math.ceil( Math.max( ...points.map( p => p[ 1 ] ) ) ) );
	for ( let y = top; y <= bottom; y ++ ) {

		// Where the row's middle crosses the edges, in order, inside between each pair.
		const py = y + 0.5;
		const crossings = [];
		for ( let i = 0; i < points.length; i ++ ) {

			const [ ax, ay ] = points[ i ], [ bx, by ] = points[ ( i + 1 ) % points.length ];
			if ( ( ay <= py ) !== ( by <= py ) ) crossings.push( ax + ( py - ay ) / ( by - ay ) * ( bx - ax ) );

		}

		crossings.sort( ( a, b ) => a - b );
		for ( let k = 0; k + 1 < crossings.length; k += 2 ) {

			for ( let x = Math.max( 0, Math.round( crossings[ k ] ) ); x < Math.min( image.width, Math.round( crossings[ k + 1 ] ) ); x ++ ) blend( image, x, y, colour, alpha );

		}

	}

}

// DejaVu Sans Mono Bold at 12 px, unsmoothed (Bitstream Vera's licence: free to use and embed), one
// glyph a cell 7 px wide and 13 high: 13 rows of 2 hex digits each (bit 0 the leftmost pixel), for
// ASCII 32 to 126 then ©, ° and ×.
const GLYPH_W = 7, GLYPH_H = 13;
const GLYPHS = '0000000000000000000000000000181818181818001818000000006666660000000000000000000000282c7e14143f1a0a00000000083e2b0b3e68686b3e08080000060909661837484830000000001c0c0c085c5676367c000000001818180000000000000000001018080c0c0c0c0c0818100000040c081818181818080c04000000082a1c1c2a080000000000000000000808087f0808080000000000000000000000181808040000000000003c3c0000000000000000000000000000181800000000402020101008080404020000003c246666766666243c000000001e181818181818187e000000003c62606030180c067e000000003c626060186060623c000000003038383436327e3030000000003e06063e706060723c000000003c0c063e666666663c000000007e607030301818180c000000003c666666186666663c000000003c666666667c60303c000000000000001818000018180000000000000018180000181808040000000040780e0e78400000000000000000007e007e0000000000000000021e70701e02000000000038646030181800181800000000003c427b454545457a467c00001818183c3c243c6666000000003e6666661e6666663e00000000384c06060606064c38000000001e366666666666361e000000007e0606063e0606067e000000007e0606063e0606060600000000384c06060676666c7800000000666666667e66666666000000007e181818181818187e0000000078606060606060623c000000006666361e1e362666460000000006060606060606067e0000000042667e7e7e6666666600000000666e6e6e7e76767666000000003c246666666666243c000000003e6666663e06060606000000003c246666666666243c200000003e6666661e36666646000000003c46060e3c7060623c000000007e18181818181818180000000066666666666666663c00000000666624243c3c3c18180000000063636b6b76363636360000000066243c1818183c2466000000004366663c3c18181818000000007e603030180c0c067e0000001c0c0c0c0c0c0c0c0c0c1c0000000604040808101020206000001c1818181818181818181c0000001c36630000000000000000000000000000000000000000007f060c00000000000000000000000000003864607c66667c0000000606063e66666666663e000000000000384c0606064c380000006060607c66666666667c0000000000003c66667e06463c0000007018187e1818181818180000000000007c66666666667c60603c0606063e6666666666660000001818001e18181818187e0000001818001e18181818181818180e06060626361e1e3636660000000f0c0c0c0c0c0c0c0c380000000000007e5656565656560000000000003e6666666666660000000000003c66666666663c0000000000003e66666666663e0606060000007c66666666667c6060600000007c0c0c0c0c0c0c0000000000003c460e3c60623c000000000c0c3f0c0c0c0c0c380000000000006666666666667c0000000000006666243c3c181800000000000063636b36363636000000000000663c3c183c3c660000000000006666243c3c181818080e0000007e6030180c067e00000078181818180618181818780000080808080808080808080808001e1818181860181818181e000000000000000e7000000000000000001c225d455d221c0000000000182424180000000000000000000000247e3c3c7e2400000000';
const EXTRA = { '©': 95, '°': 96, '×': 97 };

function glyphOf( ch ) {

	const code = ch.charCodeAt( 0 );
	const index = code >= 32 && code < 127 ? code - 32 : EXTRA[ ch ] ?? 31;
	return Array.from( { length: GLYPH_H }, ( _, row ) => parseInt( GLYPHS.substr( ( index * GLYPH_H + row ) * 2, 2 ), 16 ) );

}

const textWidth = text => [ ...text ].length * GLYPH_W;

// Words with their top left at (x, y), with a dark halo round each letter to read on any ground.
function text( image, words, x, y, colour = WHITE, { halo = 0.85 } = {} ) {

	const chars = [ ...words ];
	const glyphs = chars.map( glyphOf );
	x = Math.round( x ); y = Math.round( y );
	if ( halo ) {

		glyphs.forEach( ( glyph, k ) => glyph.forEach( ( bits, row ) => {

			for ( let col = 0; col < GLYPH_W; col ++ ) {

				if ( ! ( bits >> col & 1 ) ) continue;
				for ( let dy = - 1; dy <= 1; dy ++ ) for ( let dx = - 1; dx <= 1; dx ++ ) blend( image, x + k * GLYPH_W + col + dx, y + row + dy, BLACK, halo );

			}

		} ) );

	}

	glyphs.forEach( ( glyph, k ) => glyph.forEach( ( bits, row ) => {

		for ( let col = 0; col < GLYPH_W; col ++ ) if ( bits >> col & 1 ) blend( image, x + k * GLYPH_W + col, y + row, colour, 1 );

	} ) );

}

// Grid lines every `step` metres east and north of the site point, labelled along the top (east)
// and the left (north).
function drawGrid( image, { centre, size, step, toPixel } ) {

	const half = size / 2;
	const eastLines = [], northLines = [];
	for ( let e = Math.ceil( ( centre.east - half ) / step ) * step; e <= centre.east + half; e += step ) eastLines.push( e );
	for ( let n = Math.ceil( ( centre.north - half ) / step ) * step; n <= centre.north + half; n += step ) northLines.push( n );
	for ( const e of eastLines ) {

		const x = Math.floor( toPixel( e, 0 )[ 0 ] );
		fillRect( image, x, 0, x + 1, image.height, WHITE, e === 0 ? 0.7 : 0.4 );

	}

	for ( const n of northLines ) {

		const y = Math.floor( toPixel( 0, n )[ 1 ] );
		fillRect( image, 0, y, image.width, y + 1, WHITE, n === 0 ? 0.7 : 0.4 );

	}

	const label = v => `${ v > 0 ? '+' : '' }${ Number( v.toFixed( 1 ) ) }`;
	for ( const e of eastLines ) {

		const words = `E${ label( e ) }`;
		const x = toPixel( e, 0 )[ 0 ] - textWidth( words ) / 2;
		if ( x > 40 && x + textWidth( words ) < image.width - 40 ) text( image, words, x, 4 );

	}

	for ( const n of northLines ) {

		const y = toPixel( 0, n )[ 1 ] - GLYPH_H - 2;
		if ( y > 20 && y < image.height - 40 ) text( image, `N${ label( n ) }`, 4, y );

	}

}

// The site point, a red cross over everything, and an arrow to north top right.
function drawSitePoint( image, toPixel ) {

	const [ sx, sy ] = toPixel( 0, 0 );
	if ( sx > - 10 && sy > - 10 && sx < image.width + 10 && sy < image.height + 10 ) {

		line( image, [ sx - 10, sy ], [ sx + 10, sy ], SITE_POINT );
		line( image, [ sx, sy - 10 ], [ sx, sy + 10 ], SITE_POINT );

	}

	// North.
	const nx = image.width - 22;
	line( image, [ nx, 44 ], [ nx, 22 ], WHITE );
	line( image, [ nx, 20 ], [ nx - 6, 30 ], WHITE );
	line( image, [ nx, 20 ], [ nx + 6, 30 ], WHITE );
	text( image, 'N', nx - 3, 4 );

}

// A shape, if any of it is in view (true if it is). The shapes, in metres, headings clockwise
// from north, colours [ r, g, b ]:
//   { type: 'box', east, north, heading, length (along the heading), width, colour, fill?, front?,
//     label }
//   { type: 'circle', east, north, radius, colour, label }
//   { type: 'line', points: [ [ east, north ], ... ], colour, arrow? (a head at the first), label }
//   { type: 'spot', east, north, colour, label }
// label: words put at its middle (or for an arrow, where its words go) where they don't cover
// another's; area: true for an area (flatten, laydown), drawn under the rest and labelled after.
function drawShape( image, shape, toPixel, metresPerPixel, labels ) {

	const margin = 40;
	const inView = points => points.some( ( [ x, y ] ) => x > - margin && y > - margin && x < image.width + margin && y < image.height + margin );
	let at;
	if ( shape.type === 'box' ) {

		const h = shape.heading * Math.PI / 180;
		const f = [ Math.sin( h ), Math.cos( h ) ], r = [ Math.cos( h ), - Math.sin( h ) ];
		const corner = ( a, b ) => toPixel( shape.east + f[ 0 ] * a * shape.length / 2 + r[ 0 ] * b * shape.width / 2, shape.north + f[ 1 ] * a * shape.length / 2 + r[ 1 ] * b * shape.width / 2 );
		const corners = [ corner( 1, - 1 ), corner( 1, 1 ), corner( - 1, 1 ), corner( - 1, - 1 ) ];
		at = toPixel( shape.east, shape.north );
		if ( ! inView( [ ...corners, at ] ) ) return false;
		if ( Math.max( shape.length, shape.width ) / metresPerPixel < 4 ) spot( image, at, shape.colour );
		else {

			outline( image, corners, shape.colour, { fill: shape.fill ?? 0 } );
			// Its front: a tick from the middle to the middle of its front edge.
			if ( shape.front ) line( image, at, toPixel( shape.east + f[ 0 ] * shape.length / 2, shape.north + f[ 1 ] * shape.length / 2 ), shape.colour );

		}

	} else if ( shape.type === 'circle' ) {

		at = toPixel( shape.east, shape.north );
		const points = Array.from( { length: 32 }, ( _, k ) => toPixel( shape.east + shape.radius * Math.sin( k * Math.PI / 16 ), shape.north + shape.radius * Math.cos( k * Math.PI / 16 ) ) );
		if ( ! inView( [ ...points, at ] ) ) return false;
		if ( shape.radius * 2 / metresPerPixel < 4 ) spot( image, at, shape.colour );
		else outline( image, points, shape.colour, { fill: 0.2 } );

	} else if ( shape.type === 'line' ) {

		const points = shape.points.map( ( [ e, n ] ) => toPixel( e, n ) );
		if ( ! inView( points ) ) return false;
		for ( let k = 1; k < points.length; k ++ ) line( image, points[ k - 1 ], points[ k ], shape.colour );
		const [ a, b ] = points;
		const length = Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] );
		if ( shape.arrow && length > 1 ) {

			const u = [ ( a[ 0 ] - b[ 0 ] ) / length, ( a[ 1 ] - b[ 1 ] ) / length ];
			for ( const side of [ - 1, 1 ] ) line( image, a, [ a[ 0 ] - u[ 0 ] * 10 + side * u[ 1 ] * 6, a[ 1 ] - u[ 1 ] * 10 - side * u[ 0 ] * 6 ], shape.colour );

		} else if ( length > 1 ) {

			// A dimension's ends.
			const n = [ - ( b[ 1 ] - a[ 1 ] ) / length * 6, ( b[ 0 ] - a[ 0 ] ) / length * 6 ];
			for ( const p of [ a, b ] ) line( image, [ p[ 0 ] - n[ 0 ], p[ 1 ] - n[ 1 ] ], [ p[ 0 ] + n[ 0 ], p[ 1 ] + n[ 1 ] ], shape.colour );

		}

		at = shape.arrow ? points.at( - 1 ) : [ ( a[ 0 ] + points.at( - 1 )[ 0 ] ) / 2, ( a[ 1 ] + points.at( - 1 )[ 1 ] ) / 2 ];

	} else {

		at = toPixel( shape.east, shape.north );
		if ( ! inView( [ at ] ) ) return false;
		spot( image, at, shape.colour );

	}

	if ( shape.label ) labels.push( { words: String( shape.label ), at, colour: shape.colour, area: !! shape.area } );
	return true;

}

function spot( image, [ x, y ], colour ) {

	outline( image, [ [ x, y - 4 ], [ x + 4, y ], [ x, y + 4 ], [ x - 4, y ] ], colour, { fill: 1 } );

}

// Labels where they don't cover one already put (each tried at its spot, then just above, below,
// left and right of it), areas' last; those with nowhere left are left off.
function drawLabels( image, labels ) {

	const taken = [];
	for ( const { words, at, colour } of [ ...labels.filter( l => ! l.area ), ...labels.filter( l => l.area ) ] ) {

		const w = textWidth( words ) + 2, h = GLYPH_H + 2;
		for ( const [ dx, dy ] of [ [ 0, 0 ], [ 0, - h ], [ 0, h ], [ - w, 0 ], [ w, 0 ] ] ) {

			const box = [ at[ 0 ] - w / 2 + dx, at[ 1 ] - h / 2 + dy ];
			if ( box[ 0 ] < 0 || box[ 1 ] < 0 || box[ 0 ] + w > image.width || box[ 1 ] + h > image.height ) continue;
			if ( taken.some( t => box[ 0 ] < t[ 0 ] + t[ 2 ] && t[ 0 ] < box[ 0 ] + w && box[ 1 ] < t[ 1 ] + t[ 3 ] && t[ 1 ] < box[ 1 ] + h ) ) continue;
			taken.push( [ ...box, w, h ] );
			text( image, words, box[ 0 ] + 1, box[ 1 ] + 1, colour );
			break;

		}

	}

}

// "Google" and the imagery's copyright along the foot, on a dark band (Google's terms).
function drawAttribution( image, copyright ) {

	const top = image.height - GLYPH_H - 8;
	fillRect( image, 0, top, image.width, image.height, BLACK, 0.55 );
	text( image, 'Google', 6, top + 4, WHITE, { halo: 0 } );
	let words = copyright;
	while ( words.length > 4 && textWidth( words ) > image.width - 70 ) words = `${ words.slice( 0, - 2 ) }…`.replace( /……$/, '…' );
	text( image, words, image.width - 6 - textWidth( words ), top + 4, WHITE, { halo: 0 } );

}

// --- PNG -------------------------------------------------------------------------------------

const SIGNATURE = [ 137, 80, 78, 71, 13, 10, 26, 10 ];
async function inflate( bytes ) {

	return new Uint8Array( await new Response( new Blob( [ bytes ] ).stream().pipeThrough( new DecompressionStream( 'deflate' ) ) ).arrayBuffer() );

}

// A PNG's pixels as { width, height, rgb } (alpha left off): 8-bit grey, RGB, palette (1 to 8
// bits), grey with alpha and RGBA, not interlaced: what Google's tiles are.
async function decodePng( bytes ) {

	if ( SIGNATURE.some( ( b, i ) => bytes[ i ] !== b ) ) throw new Error( 'not a PNG' );
	const view = new DataView( bytes.buffer, bytes.byteOffset, bytes.byteLength );
	let width = 0, height = 0, depth = 8, type = 2, palette = null;
	const data = [];
	for ( let at = 8; at + 8 <= bytes.length; ) {

		const length = view.getUint32( at );
		const name = String.fromCharCode( ...bytes.subarray( at + 4, at + 8 ) );
		const body = bytes.subarray( at + 8, at + 8 + length );
		if ( name === 'IHDR' ) {

			width = view.getUint32( at + 8 ); height = view.getUint32( at + 12 ); depth = body[ 8 ]; type = body[ 9 ];
			if ( body[ 12 ] ) throw new Error( 'interlaced PNG' );

		} else if ( name === 'PLTE' ) palette = body;
		else if ( name === 'IDAT' ) data.push( body );
		else if ( name === 'IEND' ) break;
		at += 12 + length;

	}

	const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ type ];
	if ( ! channels || ( type !== 3 && depth !== 8 ) || ( type === 3 && ! palette ) ) throw new Error( 'unsupported PNG' );
	const raw = await inflate( new Uint8Array( await new Blob( data ).arrayBuffer() ) );
	const bpp = Math.max( 1, channels * depth / 8 );
	const stride = Math.ceil( width * channels * depth / 8 );
	const lines = new Uint8Array( stride * height );
	for ( let y = 0; y < height; y ++ ) {

		const filter = raw[ y * ( stride + 1 ) ];
		const src = raw.subarray( y * ( stride + 1 ) + 1, ( y + 1 ) * ( stride + 1 ) );
		const out = lines.subarray( y * stride, ( y + 1 ) * stride );
		const prev = y ? lines.subarray( ( y - 1 ) * stride, y * stride ) : null;
		for ( let i = 0; i < stride; i ++ ) {

			const a = i >= bpp ? out[ i - bpp ] : 0, b = prev ? prev[ i ] : 0, c = prev && i >= bpp ? prev[ i - bpp ] : 0;
			let v = src[ i ];
			if ( filter === 1 ) v += a;
			else if ( filter === 2 ) v += b;
			else if ( filter === 3 ) v += ( a + b ) >> 1;
			else if ( filter === 4 ) v += paeth( a, b, c );
			out[ i ] = v;

		}

	}

	const rgb = new Uint8Array( width * height * 3 );
	for ( let y = 0, o = 0; y < height; y ++ ) {

		const row = y * stride;
		for ( let x = 0; x < width; x ++, o += 3 ) {

			if ( type === 3 ) {

				const index = depth === 8 ? lines[ row + x ] : lines[ row + ( x * depth >> 3 ) ] >> ( 8 - depth - ( x * depth & 7 ) ) & ( ( 1 << depth ) - 1 );
				rgb[ o ] = palette[ index * 3 ]; rgb[ o + 1 ] = palette[ index * 3 + 1 ]; rgb[ o + 2 ] = palette[ index * 3 + 2 ];

			} else if ( channels < 3 ) {

				rgb[ o ] = rgb[ o + 1 ] = rgb[ o + 2 ] = lines[ row + x * channels ];

			} else {

				const k = row + x * channels;
				rgb[ o ] = lines[ k ]; rgb[ o + 1 ] = lines[ k + 1 ]; rgb[ o + 2 ] = lines[ k + 2 ];

			}

		}

	}

	return { width, height, rgb };

}

function paeth( a, b, c ) {

	const p = a + b - c, pa = Math.abs( p - a ), pb = Math.abs( p - b ), pc = Math.abs( p - c );
	return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;

}

// --- JPEG ------------------------------------------------------------------------------------

// A baseline JPEG (JFIF), colour not subsampled so the grid's labels stay sharp: a satellite picture
// is a fifth the size it is as a PNG. The tables are the JPEG standard's own (Annex K).
const ZIGZAG = [
	0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
	35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];
const LUMA_Q = [
	16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
	18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];
const CHROMA_Q = [
	17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
	...Array( 32 ).fill( 99 ),
];
const AC_LUMA = [
	0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
	0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
	0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
	0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
	0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
	0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
	0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
];
const AC_CHROMA = [
	0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91,
	0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
	0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58,
	0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
	0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4,
	0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
	0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
];
const DC_VALUES = [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 ];
// Each Huffman table: how many codes of each length (1 to 16 bits), then the values they code.
const HUFFMAN = {
	dcLuma: [ [ 0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0 ], DC_VALUES ],
	acLuma: [ [ 0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d ], AC_LUMA ],
	dcChroma: [ [ 0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0 ], DC_VALUES ],
	acChroma: [ [ 0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77 ], AC_CHROMA ],
};
const JPEG_QUALITY = 88;
// cos( ( 2x + 1 ) u π / 16 ), with the DCT's scale for u (√½ for u = 0), x * 8 + u.
const DCT = Float64Array.from( { length: 64 }, ( _, k ) => {

	const x = k >> 3, u = k & 7;
	return ( u ? 1 : Math.SQRT1_2 ) * Math.cos( ( 2 * x + 1 ) * u * Math.PI / 16 ) / 2;

} );

// { code, length } for each value a table codes (the standard's canonical codes from its counts).
function huffmanCodes( [ counts, values ] ) {

	const codes = [];
	let code = 0, k = 0;
	for ( let length = 1; length <= 16; length ++ ) {

		for ( let n = 0; n < counts[ length - 1 ]; n ++ ) codes[ values[ k ++ ] ] = { code: code ++, length };
		code <<= 1;

	}

	return codes;

}

// The quantizing table at the quality (the IJG's scaling), as the file has it: in zigzag order.
function quantTable( base, quality ) {

	const scale = quality < 50 ? 5000 / quality : 200 - quality * 2;
	return ZIGZAG.map( k => Math.min( 255, Math.max( 1, Math.floor( ( base[ k ] * scale + 50 ) / 100 ) ) ) );

}

// { width, height, rgb } as a JPEG's bytes.
function encodeJpeg( { width, height, rgb }, quality = JPEG_QUALITY ) {

	const tables = [ quantTable( LUMA_Q, quality ), quantTable( CHROMA_Q, quality ) ];
	const codes = Object.fromEntries( Object.entries( HUFFMAN ).map( ( [ name, table ] ) => [ name, huffmanCodes( table ) ] ) );
	const out = [];
	const word = n => out.push( n >> 8 & 0xff, n & 0xff );
	const marker = ( type, body ) => {

		out.push( 0xff, type );
		word( body.length + 2 );
		out.push( ...body );

	};

	out.push( 0xff, 0xd8 );
	marker( 0xe0, [ 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0 ] );
	marker( 0xdb, [ 0, ...tables[ 0 ], 1, ...tables[ 1 ] ] );
	marker( 0xc0, [ 8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1 ] );
	marker( 0xc4, [ 0x00, ...HUFFMAN.dcLuma.flat(), 0x10, ...HUFFMAN.acLuma.flat(), 0x01, ...HUFFMAN.dcChroma.flat(), 0x11, ...HUFFMAN.acChroma.flat() ] );
	marker( 0xda, [ 3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0 ] );

	// The scan: bits written high first, a 0 after every 0xff byte.
	let bits = 0, count = 0;
	const put = ( { code, length } ) => {

		bits = bits << length | code;
		count += length;
		while ( count >= 8 ) {

			const byte = bits >> ( count - 8 ) & 0xff;
			out.push( byte );
			if ( byte === 0xff ) out.push( 0 );
			count -= 8;

		}

		bits &= ( 1 << count ) - 1;

	};

	// A coefficient's size (its bits' count) and the bits that say it.
	const amplitude = v => {

		const magnitude = Math.abs( v );
		const size = magnitude ? 32 - Math.clz32( magnitude ) : 0;
		return { size, value: { code: v < 0 ? v + ( 1 << size ) - 1 : v, length: size } };

	};

	const block = new Float64Array( 64 ), temp = new Float64Array( 64 );
	const previous = [ 0, 0, 0 ];
	const sets = [ [ codes.dcLuma, codes.acLuma, tables[ 0 ] ], [ codes.dcChroma, codes.acChroma, tables[ 1 ] ], [ codes.dcChroma, codes.acChroma, tables[ 1 ] ] ];
	for ( let by = 0; by < height; by += 8 ) {

		for ( let bx = 0; bx < width; bx += 8 ) {

			for ( let channel = 0; channel < 3; channel ++ ) {

				// The block's samples (the edge's repeated past the picture), from -128 to 127.
				for ( let y = 0; y < 8; y ++ ) {

					for ( let x = 0; x < 8; x ++ ) {

						const k = ( Math.min( height - 1, by + y ) * width + Math.min( width - 1, bx + x ) ) * 3;
						const r = rgb[ k ], g = rgb[ k + 1 ], b = rgb[ k + 2 ];
						block[ y * 8 + x ] = channel === 0 ? 0.299 * r + 0.587 * g + 0.114 * b - 128
							: channel === 1 ? - 0.168736 * r - 0.331264 * g + 0.5 * b
								: 0.5 * r - 0.418688 * g - 0.081312 * b;

					}

				}

				// The two-dimensional DCT: along the rows, then down the columns.
				for ( let y = 0; y < 8; y ++ ) for ( let u = 0; u < 8; u ++ ) {

					let sum = 0;
					for ( let x = 0; x < 8; x ++ ) sum += block[ y * 8 + x ] * DCT[ x * 8 + u ];
					temp[ y * 8 + u ] = sum;

				}

				const [ dcCodes, acCodes, table ] = sets[ channel ];
				const zigzag = ZIGZAG.map( ( k, z ) => {

					const u = k & 7, v = k >> 3;
					let sum = 0;
					for ( let y = 0; y < 8; y ++ ) sum += temp[ y * 8 + u ] * DCT[ y * 8 + v ];
					return Math.round( sum / table[ z ] );

				} );

				const dc = amplitude( zigzag[ 0 ] - previous[ channel ] );
				previous[ channel ] = zigzag[ 0 ];
				put( dcCodes[ dc.size ] );
				if ( dc.size ) put( dc.value );
				let zeros = 0;
				for ( let z = 1; z < 64; z ++ ) {

					if ( ! zigzag[ z ] ) {

						zeros ++;
						continue;

					}

					for ( ; zeros > 15; zeros -= 16 ) put( acCodes[ 0xf0 ] );
					const ac = amplitude( zigzag[ z ] );
					put( acCodes[ zeros << 4 | ac.size ] );
					put( ac.value );
					zeros = 0;

				}

				if ( zeros ) put( acCodes[ 0 ] );

			}

		}

	}

	// The last byte filled out with ones.
	if ( count ) put( { code: ( 1 << ( 8 - count ) ) - 1, length: 8 - count } );
	out.push( 0xff, 0xd9 );
	return Uint8Array.from( out );

}

// Bytes as base64, a piece at a time (one String.fromCharCode of them all is too many arguments).
export function base64( bytes ) {

	let binary = '';
	for ( let i = 0; i < bytes.length; i += 0x8000 ) binary += String.fromCharCode( ...bytes.subarray( i, i + 0x8000 ) );
	return btoa( binary );

}
