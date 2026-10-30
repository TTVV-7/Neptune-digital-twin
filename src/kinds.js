// Kinds of placed things that aren't models: flatten areas, excavations, stockpiles, laydown
// areas. Each module registers its kind here, and the ModelManager places, saves, moves, turns
// and deletes them like any library item. A kind's config is { kind, params, east, north, ... }.
//
//   registerKind( 'laydown', {
//     label: 'Laydown area',                // default name
//     build( params ) { return object; },   // what's drawn; centred on the origin, base at y = 0,
//                                           // front facing -Z. Rebuilt whenever params change.
//     normalize( params ) { return params; },  // fill defaults and clamp (optional)
//     snap: 'median',          // how the ground height is found while "snap to ground" is on:
//                              // 'median' or 'lowest' of the ground around the footprint, with an
//                              // '-original' suffix to ignore flatten areas and digging (see
//                              // flatten.js), or false to leave the height alone
//     solid: false,            // whether the player counts as inside its box (default true)
//     buildOnly: true,         // only shown while the library (build mode) is open
//     altersMap: true,         // changes how Google's mesh is drawn (shown in the attribution)
//     fields: [ { key: 'width', label: 'width (m)', min: 1, step: 0.5 } ],  // P panel numbers;
//                              // also { key, label, options: { Gravel: 'gravel', ... } } for a
//                              // dropdown, { key, label, type: 'text' } and { key, label, type: 'color' }
//     actions: [ { label: 'Pour', run( entry ) {} } ],  // P panel buttons
//     readouts: [ { label: 'volume', get( entry ) { return '50 m³'; } } ],  // read-only P panel
//                              // lines, refreshed on each change (or panel.refresh( entry ))
//   } );
//
// A field may also have enabled( params ), which greys it out while it returns false (a shored
// pit's side slope), and a readout note: true, which writes it out in full across the panel (a
// warning). A readout that gives '' is left out.

const kinds = new Map();

export function registerKind( name, spec ) {

	kinds.set( name, { snap: 'median', solid: true, buildOnly: false, altersMap: false, fields: [], actions: [], readouts: [], ...spec, name } );

}

export function getKind( name ) {

	return name ? kinds.get( name ) ?? null : null;

}

// Normalised params for a kind, with defaults filled in.
export function kindParams( kind, params = {} ) {

	return kind.normalize ? kind.normalize( { ...params } ) : { ...params };

}
