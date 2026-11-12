// Where to drive on the Moon (moon.js): its start spots on the globe's panel, and the named places
// its search finds (no map service knows the Moon, so they're all here). Each is a place as
// places.js has them, with world: 'moon'. Latitudes north and longitudes east are positive, as the
// IAU's selenographic coordinates have them (0° N 0° E the middle of the side facing the Earth);
// craters by their middle, the landing sites where the landers came down. Ids all start "moon-", so
// none is ever taken for one of the Earth's spots (the leaderboard, levels and play stats know
// those by id).

export const MOON = 'moon';

const moon = ( id, name, region, lat, lon, extra = {} ) => ( { id: `moon-${ id }`, name, region, lat, lon, world: MOON, ...extra } );

// The panel's dozen: the Apollo sites, the great craters, a pole and the far side.
export const MOON_SPOTS = [
	moon( 'apollo-11', 'Tranquility Base', 'Apollo 11, 1969 · Sea of Tranquillity', 0.6741, 23.4730, { also: [ 'Apollo 11' ] } ),
	moon( 'apollo-15', 'Hadley Rille', 'Apollo 15, 1971 · Apennine Mountains', 26.1322, 3.6339, { also: [ 'Apollo 15' ] } ),
	moon( 'apollo-17', 'Taurus-Littrow valley', 'Apollo 17, 1972', 20.1908, 30.7717, { also: [ 'Apollo 17' ] } ),
	moon( 'tycho', 'Tycho crater', '85 km across, bright rays', - 43.31, - 11.36 ),
	moon( 'copernicus', 'Copernicus crater', '93 km across, terraced walls', 9.62, - 20.08 ),
	moon( 'aristarchus', 'Aristarchus', 'The brightest crater', 23.7, - 47.4 ),
	moon( 'plato', 'Plato crater', 'A dark, flat floor', 51.62, - 9.38 ),
	moon( 'huygens', 'Mons Huygens', 'The Apennines\' highest peak', 19.92, - 2.86 ),
	moon( 'shackleton', 'Shackleton crater rim', 'The south pole', - 89.32, 129.78 ),
	moon( 'orientale', 'Mare Orientale', 'A basin ringed by mountains', - 19.4, - 92.8 ),
	moon( 'tsiolkovskiy', 'Tsiolkovskiy crater', 'The far side', - 20.4, 129.1 ),
	moon( 'change-4', 'Von Kármán crater', 'Chang\'e 4, 2019 · the far side', - 45.4446, 177.5991, { also: [ 'Chang\'e 4' ] } ),
];

// What the search finds, besides the spots: the seas, more craters, mountains and landers. `also`:
// other names it's found by (a sea's English name, a landing site's mission).
export const MOON_PLACES = [
	...MOON_SPOTS,
	moon( 'apollo-12', 'Apollo 12 site', 'Ocean of Storms, 1969', - 3.0124, - 23.4216 ),
	moon( 'apollo-14', 'Fra Mauro', 'Apollo 14, 1971', - 3.6453, - 17.4714, { also: [ 'Apollo 14' ] } ),
	moon( 'apollo-16', 'Descartes Highlands', 'Apollo 16, 1972', - 8.973, 15.5002, { also: [ 'Apollo 16' ] } ),
	moon( 'lunokhod-1', 'Lunokhod 1', 'Sea of Rains, 1970', 38.24, - 35.0 ),
	moon( 'lunokhod-2', 'Lunokhod 2', 'Le Monnier, 1973', 25.85, 30.45 ),
	moon( 'change-3', 'Chang\'e 3 site', 'Sea of Rains, 2013', 44.12, - 19.51 ),
	moon( 'chandrayaan-3', 'Shiv Shakti point', 'Chandrayaan-3, 2023 · near the south pole', - 69.37, 32.32, { also: [ 'Chandrayaan-3' ] } ),
	moon( 'tranquillitatis', 'Mare Tranquillitatis', 'Sea of Tranquillity', 8.5, 31.4, { also: [ 'Sea of Tranquillity' ] } ),
	moon( 'serenitatis', 'Mare Serenitatis', 'Sea of Serenity', 28.0, 17.5, { also: [ 'Sea of Serenity' ] } ),
	moon( 'imbrium', 'Mare Imbrium', 'Sea of Rains', 32.8, - 15.6, { also: [ 'Sea of Rains' ] } ),
	moon( 'crisium', 'Mare Crisium', 'Sea of Crises', 17.0, 59.1, { also: [ 'Sea of Crises' ] } ),
	moon( 'fecunditatis', 'Mare Fecunditatis', 'Sea of Fertility', - 7.8, 51.3, { also: [ 'Sea of Fertility' ] } ),
	moon( 'nectaris', 'Mare Nectaris', 'Sea of Nectar', - 15.2, 35.5, { also: [ 'Sea of Nectar' ] } ),
	moon( 'nubium', 'Mare Nubium', 'Sea of Clouds', - 21.3, - 16.6, { also: [ 'Sea of Clouds' ] } ),
	moon( 'procellarum', 'Oceanus Procellarum', 'Ocean of Storms', 18.4, - 57.4, { also: [ 'Ocean of Storms' ] } ),
	moon( 'frigoris', 'Mare Frigoris', 'Sea of Cold', 56.0, 1.4, { also: [ 'Sea of Cold' ] } ),
	moon( 'moscoviense', 'Mare Moscoviense', 'Sea of Moscow · the far side', 27.3, 147.9, { also: [ 'Sea of Moscow' ] } ),
	moon( 'clavius', 'Clavius crater', '225 km across', - 58.62, - 14.73 ),
	moon( 'kepler', 'Kepler crater', 'Rays across the Ocean of Storms', 8.1, - 38.0 ),
	moon( 'eratosthenes', 'Eratosthenes crater', 'Below the Apennines', 14.47, - 11.32 ),
	moon( 'archimedes', 'Archimedes crater', 'Sea of Rains', 29.7, - 4.0 ),
	moon( 'ptolemaeus', 'Ptolemaeus crater', 'Near the middle of the near side', - 9.3, - 1.9 ),
	moon( 'alphonsus', 'Alphonsus crater', 'Ranger 9 came down here', - 13.4, - 2.8 ),
	moon( 'theophilus', 'Theophilus crater', 'Central peaks, 100 km across', - 11.4, 26.4 ),
	moon( 'langrenus', 'Langrenus crater', 'Sea of Fertility\'s edge', - 8.9, 61.1 ),
	moon( 'petavius', 'Petavius crater', 'A cleft floor', - 25.1, 60.4 ),
	moon( 'grimaldi', 'Grimaldi', 'A dark basin by the west limb', - 5.2, - 68.6 ),
	moon( 'schickard', 'Schickard crater', '227 km across', - 44.3, - 55.3 ),
	moon( 'vallis-schroteri', 'Vallis Schröteri', 'A winding valley', 26.2, - 50.8, { also: [ 'Schroter\'s Valley' ] } ),
	moon( 'mons-hadley', 'Mons Hadley', 'Apennine Mountains', 26.7, 4.0 ),
	moon( 'montes-apenninus', 'Montes Apenninus', 'Apennine Mountains', 18.9, - 3.7, { also: [ 'Apennine Mountains' ] } ),
	moon( 'hertzsprung', 'Hertzsprung', 'A basin on the far side', 2.4, - 128.7 ),
	moon( 'korolev', 'Korolev crater', 'The far side', - 4.0, - 157.4 ),
	moon( 'apollo-crater', 'Apollo basin', 'The far side', - 36.1, - 151.8 ),
	moon( 'daedalus', 'Daedalus crater', 'The middle of the far side', - 5.9, 179.4 ),
	moon( 'aitken', 'South Pole-Aitken basin', 'The deepest, oldest basin', - 53.0, - 169.0 ),
	moon( 'antoniadi', 'Antoniadi crater', 'The lowest place on the Moon', - 69.7, - 172.0 ),
	moon( 'selenean-summit', 'Selenean summit', 'The highest place on the Moon', 5.41, - 158.63 ),
	moon( 'north-pole', 'North pole', 'Peary crater', 88.6, 33.0, { also: [ 'Peary' ] } ),
	moon( 'south-pole', 'South pole', 'Between Shackleton and de Gerlache', - 89.9, 0 ),
];

// The places whose name (or other name) has every word of `text` in it, best first: the name
// starting with it, then a word of it starting with it, then anywhere. At most `most`.
export function searchMoon( text, most = 8 ) {

	const words = fold( text ).split( /\s+/ ).filter( Boolean );
	if ( words.length === 0 ) return [];
	const found = [];
	for ( const place of MOON_PLACES ) {

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

// A Moon spot by id ("moon-tycho"), or null.
export function moonSpot( id ) {

	return MOON_PLACES.find( place => place.id === id ) ?? null;

}

// Lower case, without accents or apostrophes: "Schröteri" and "schroteri", "Chang'e" and "change".
function fold( text ) {

	return String( text ).normalize( 'NFD' ).replace( /\p{M}/gu, '' ).replace( /['’]/g, '' ).toLowerCase().trim();

}
