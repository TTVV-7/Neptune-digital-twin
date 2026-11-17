import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import { lightPart } from './ghost-light.js';

// The worker that makes a ghost's parts light (challenge-ghost.js's lighten), so simplifying the
// pickup's 219,000 triangles (a few hundred milliseconds on a computer, seconds on a phone) never
// holds up the page's own thread, where a run's frames are drawn. It gets one merged part a message
// ({ id, part }: ghost-light.js's lightPart's) and answers { id, light } (or { id, failed }), the
// arrays handed over rather than copied. meshoptimizer's simplifier (its WebAssembly in it) is
// loaded with this worker, the first time a ghost is raced on a page; where WebAssembly can't run,
// parts are only merged.

const simplifier = MeshoptSimplifier.supported ? MeshoptSimplifier.ready.then( () => MeshoptSimplifier, () => null ) : Promise.resolve( null );

self.onmessage = async ( { data: { id, part } } ) => {

	try {

		const light = lightPart( await simplifier, part );
		self.postMessage( { id, light }, [ light.place.buffer, light.facing.buffer, ...light.picture ? [ light.picture.buffer ] : [], light.drawn.buffer ] );

	} catch ( err ) {

		self.postMessage( { id, failed: String( err?.message ?? err ) } );

	}

};
