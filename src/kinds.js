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
//     fields: [ { key: 'width', label: 'width (m)', min: 1, step: 0.5, size: true } ],  // P panel
//                              // numbers; also { key, label, options: { Gravel: 'gravel', ... } } for
//                              // a dropdown, { key, label, type: 'text' } and { key, label, type: 'color' }.
//                              // size: true puts it at the top of the panel, and numbers marked so are
//                              // in the selection toolbar's Size editor too. when( params ) -> false
//                              // hides a field that doesn't apply (a cone's width)
//     actions: [ { label: 'Pour', run( entry ) {} } ],  // P panel buttons
//     readouts: [ { label: 'volume', get( entry ) { return '50 m³'; } } ],  // read-only P panel
//                              // lines, refreshed on each change (or panel.refresh( entry ))
//     resize: {                // on-map handles to resize it (handles.js); without, it only turns
//       shape: 'rect',         // corner and edge handles set params.width and params.length; or a
//                              // function of params giving 'rect' or 'circle', which has one handle
//                              // on its edge setting the radius, and no turning handle
//       radius( params ), withRadius( params, radius ),  // for 'circle': the radius, and the params
//                              // that give a new one
//       depth: true,           // a handle at the centre setting params.depth (pits)
//       live: true,            // cheap to rebuild, so rebuilt while a handle is dragged; otherwise
//                              // just an outline follows the handle until it's let go
//       label( params ),       // the size as the label beside the handle shows it while dragging
//     },
//   } );
//
// A field may also have enabled( params ), which greys it out while it returns false (a shored
// pit's side slope), and a readout note: true, which writes it out in full across the panel (a
// warning). A readout that gives '' is left out.

const kinds = new Map();

export function registerKind( name, spec ) {

	kinds.set( name, { snap: 'median', solid: true, buildOnly: false, altersMap: false, fields: [], actions: [], readouts: [], resize: null, ...spec, name } );

}

// The shape a kind's resize handles take for these params: 'rect', 'circle' or null (no handles).
export function resizeShape( kind, params ) {

	const shape = kind?.resize?.shape ?? null;
	return typeof shape === 'function' ? shape( params ) : shape;

}

export function getKind( name ) {

	return name ? kinds.get( name ) ?? null : null;

}

// Normalised params for a kind, with defaults filled in.
export function kindParams( kind, params = {} ) {

	return kind.normalize ? kind.normalize( { ...params } ) : { ...params };

}
