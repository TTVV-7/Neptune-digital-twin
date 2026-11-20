// Searching a list of places by name, all in the page (each world's but the Earth's, world-
// places.js): no map service knows them.

// The places in `places` whose name (or other name, `also`) has every word of `text` in it, best
// first: the name starting with it, then a word of it starting with it, then anywhere. At most
// `most`.
export function searchIn( places, text, most = 8 ) {

	const words = fold( text ).split( /\s+/ ).filter( Boolean );
	if ( words.length === 0 ) return [];
	const found = [];
	for ( const place of places ) {

		let best = Infinity;
		for ( const name of [ place.name, ...place.also ?? [] ] ) {

			const folded = fold( name );
			if ( ! words.every( word => folded.includes( word ) ) ) continue;
			const rank = folded.startsWith( words[ 0 ] ) ? 0 : folded.split( /[\s'-]+/ ).some( part => part.startsWith( words[ 0 ] ) ) ? 1 : 2;
			best = Math.min( best, rank );

		}

		if ( best < Infinity ) found.push( { place, rank: best } );

	}

	return found.sort( ( a, b ) => a.rank - b.rank ).slice( 0, most ).map( ( { place } ) => place );

}

// Lower case, without accents or apostrophes: "Schröteri" and "schroteri", "Chang'e" and "change".
function fold( text ) {

	return String( text ).normalize( 'NFD' ).replace( /\p{M}/gu, '' ).replace( /['’]/g, '' ).toLowerCase().trim();

}
