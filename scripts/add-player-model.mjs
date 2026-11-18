// npm run add-player-model -- <worker.glb> [--height 1.88] [--triangles 40000]
//
// The character you walk round as (src/player.js): a scanned or generated person (a hi3D model,
// one mesh standing with arms down, facing +z) made light enough for the web and put to scale.
// It's simplified to about --triangles triangles, its textures made 2048 px WebP, then scaled so
// it stands --height metres tall (hard hat and all) with its feet at 0 and the middle between
// them at the origin, still facing +z. src/player.js gives it its bones when it loads.
//
// Writes public/models/player-worker.glb.

import { parseArgs } from 'node:util';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, prune, simplify, textureCompress, transformMesh, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const { values: opts, positionals } = parseArgs( { allowPositionals: true, options: {
	height: { type: 'string', default: '1.88' },
	triangles: { type: 'string', default: '40000' },
	out: { type: 'string', default: new URL( '../public/models/player-worker.glb', import.meta.url ).pathname },
} } );
if ( ! positionals[ 0 ] ) throw new Error( 'Usage: node scripts/add-player-model.mjs <worker.glb> [--height 1.88] [--triangles 40000]' );

const io = new NodeIO().registerExtensions( ALL_EXTENSIONS );
const doc = await io.read( positionals[ 0 ] );
const root = doc.getRoot();
const meshes = root.listMeshes();
if ( meshes.length !== 1 || meshes[ 0 ].listPrimitives().length !== 1 ) throw new Error( 'Expected one mesh with one primitive' );
const before = meshes[ 0 ].listPrimitives()[ 0 ];
const count = p => ( p.getIndices()?.getCount() ?? p.getAttribute( 'POSITION' ).getCount() ) / 3;

await MeshoptSimplifier.ready;
await doc.transform(
	flatten(),
	weld(),
	simplify( { simplifier: MeshoptSimplifier, ratio: Math.min( 1, Number( opts.triangles ) / count( before ) ), error: 0.002 } ),
	dedup(),
	prune(),
	textureCompress( { encoder: sharp, targetFormat: 'webp', resize: [ 2048, 2048 ], quality: 85 } ),
);

// To scale, on its feet: baked into the vertices, the nodes left as they are (identity).
const prim = root.listMeshes()[ 0 ].listPrimitives()[ 0 ];
const pos = prim.getAttribute( 'POSITION' ).getArray();
const min = [ Infinity, Infinity, Infinity ], max = [ - Infinity, - Infinity, - Infinity ];
for ( let i = 0; i < pos.length; i ++ ) {

	min[ i % 3 ] = Math.min( min[ i % 3 ], pos[ i ] );
	max[ i % 3 ] = Math.max( max[ i % 3 ], pos[ i ] );

}

const scale = Number( opts.height ) / ( max[ 1 ] - min[ 1 ] );
const at = [ - ( min[ 0 ] + max[ 0 ] ) / 2, - min[ 1 ], - ( min[ 2 ] + max[ 2 ] ) / 2 ];
const matrix = [ scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, at[ 0 ] * scale, at[ 1 ] * scale, at[ 2 ] * scale, 1 ];
transformMesh( root.listMeshes()[ 0 ], matrix );
root.listMeshes()[ 0 ].setName( 'Player' );
root.listMaterials()[ 0 ].setName( 'Player' );

await io.write( opts.out, doc );
console.log( `Wrote ${ opts.out }: ${ count( prim ) } triangles, ${ opts.height } m tall` );
