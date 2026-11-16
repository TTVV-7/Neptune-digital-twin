// node scripts/make-towns.mjs [populated_places.geojson]: makes drive/public/places/towns.tsv, the
// towns and cities World Drive names the places people drop in by (worker/drive/dropins.js, for the
// owner's admin page: "12 km NE of Lyon"), so naming them costs nothing per look: no lookup sent
// anywhere, just this file, which the Worker reads (through its ASSETS binding) when it's asked, and
// the admin page's map shows as it's zoomed in. The game itself never loads it.
//
// It's Natural Earth's populated places at 1:10 million (public domain, https://www.naturalearthdata.com):
// 7,342 towns and cities, every country's capital and its regions' among them, from its GeoJSON copy
// (fetched unless a copy is given). Each is kept as its name, its region (its state or province and
// its country, "Rhône-Alpes, France") and where it is, to 2 decimals of a degree (about a
// kilometre, near enough to say which town is nearest).
//
// The file is text: the regions, one a line, then an empty line, then the towns, one a line, as
// name, the region's line number (from 0), latitude, longitude and Natural Earth's rank (its
// scalerank: 0 for the world's great cities to 10 for the smallest towns, which the admin page's map
// goes by to say which to name as it zooms in), between tabs, from the south pole northward (so the
// Worker finds those near a latitude by halving).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_populated_places_simple.geojson';
const OUT = new URL( '../drive/public/places/', import.meta.url );

const places = JSON.parse( process.argv[ 2 ] ? readFileSync( process.argv[ 2 ], 'utf8' ) : await ( await fetch( SOURCE ) ).text() );
// Nothing in a name or region may break a line or a field.
const clean = text => String( text ?? '' ).replace( /[\t\r\n]+/g, ' ' ).trim();
const towns = places.features.map( ( { properties: p } ) => ( {
	name: clean( p.name ),
	region: [ clean( p.adm1name ), clean( p.adm0name ) ].filter( Boolean ).filter( ( part, i, all ) => i === 0 || part !== all[ 0 ] ).join( ', ' ),
	lat: Number( p.latitude ),
	lon: Number( p.longitude ),
	rank: Math.min( 10, Math.max( 0, Math.round( Number( p.scalerank ) ) || 0 ) ),
} ) ).filter( town => town.name && Number.isFinite( town.lat ) && Number.isFinite( town.lon ) && Math.abs( town.lat ) <= 90 && Math.abs( town.lon ) <= 180 );
if ( towns.length < 7000 ) throw new Error( `Only ${ towns.length } towns: not the file this expects` );

const regions = [ ...new Set( towns.map( town => town.region ) ) ].sort();
const line = new Map( regions.map( ( region, i ) => [ region, i ] ) );
towns.sort( ( a, b ) => a.lat - b.lat || a.lon - b.lon );
const text = [ ...regions, '', ...towns.map( town => [ town.name, line.get( town.region ), town.lat.toFixed( 2 ), town.lon.toFixed( 2 ), town.rank ].join( '\t' ) ) ].join( '\n' ) + '\n';
mkdirSync( OUT, { recursive: true } );
writeFileSync( new URL( 'towns.tsv', OUT ), text );
console.log( `${ towns.length } towns in ${ regions.length } regions, ${ text.length } bytes to ${ new URL( 'towns.tsv', OUT ).pathname }` );
