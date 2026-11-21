// node scripts/make-earth.mjs [--earth=<picture>] (npm run make-earth): makes drive/public/earth/colour.webp,
// the picture on World Drive's own globe of the Earth (src/drive-app/test-globe.js's createTestGlobe),
// the globe a place is picked on before anyone drives. It costs nothing to show, where Google's
// photorealistic 3D tiles cost a billed session a page (docs/world-drive.md, "What a visit costs"),
// so the page asks for those only once someone drives on the Earth.
//
// The picture is NASA's Blue Marble (NASA Visible Earth: public domain), 4096 × 2048, from 180° W,
// as the three-globe package's example has it (example/img/earth-blue-marble.jpg: the package's
// tarball on npm, the same file scripts/make-orrery.mjs makes the orrery's small Earth from), or a
// copy given with --earth=. It's kept at its own size (a texel about 10 km at the equator), as WebP at
// QUALITY: about a megabyte, fetched once as the globe comes up.

import { mkdirSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import sharp from 'sharp';

const SIZE = [ 4096, 2048 ];
const QUALITY = 78;
// NASA's Blue Marble in three-globe 2.45.6 (MIT; the picture itself NASA's, public domain).
const EARTH = {
	tarball: 'https://registry.npmjs.org/three-globe/-/three-globe-2.45.6.tgz',
	file: 'package/example/img/earth-blue-marble.jpg',
};

const given = Object.fromEntries( process.argv.slice( 2 ).map( arg => arg.replace( /^--/, '' ).split( '=' ) ) );
const out = new URL( '../drive/public/earth/', import.meta.url );
mkdirSync( out, { recursive: true } );
const file = new URL( 'colour.webp', out ).pathname;
const source = given.earth ? readFileSync( given.earth ) : await blueMarble();
await sharp( source ).resize( SIZE[ 0 ], SIZE[ 1 ], { fit: 'fill', kernel: 'lanczos3' } ).webp( { quality: QUALITY, effort: 6 } ).toFile( file );
const { width, height } = await sharp( file ).metadata();
console.log( `earth/colour.webp: ${ width } × ${ height }, ${ ( readFileSync( file ).length / 1024 ).toFixed( 0 ) } KB` );

// The Blue Marble, out of three-globe's tarball on npm (a gzipped tar: 512-byte headers, the name in
// the first 100 bytes, the size in octal at 124, each file padded to 512).
async function blueMarble() {

	const response = await fetch( EARTH.tarball );
	if ( ! response.ok ) throw new Error( `${ EARTH.tarball }: ${ response.status }. Give a copy with --earth=` );
	const tar = gunzipSync( Buffer.from( await response.arrayBuffer() ) );
	for ( let at = 0; at + 512 <= tar.length; ) {

		const name = tar.toString( 'utf8', at, at + 100 ).replace( /\0.*$/s, '' );
		if ( ! name ) break;
		const size = parseInt( tar.toString( 'utf8', at + 124, at + 136 ).replace( /\0.*$/s, '' ).trim(), 8 ) || 0;
		if ( name === EARTH.file ) return tar.subarray( at + 512, at + 512 + size );
		at += 512 + Math.ceil( size / 512 ) * 512;

	}

	throw new Error( `No ${ EARTH.file } in ${ EARTH.tarball }` );

}
