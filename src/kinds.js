// Kinds of placed things that aren't models: flatten areas, excavations, stockpiles, laydown
// areas. Each module registers its kind here, and the ModelManager places, saves, moves, turns
// and deletes them like any library item. A kind's config is { kind, params, east, north, ... }.
//
//   registerKind( 'laydown', {
//     label: 'Laydown area',                // default name
//     layer: 'Laydown areas',               // its row in the Show panel (layers.js); default:
//                                           // the label with an s
//     build( params ) { return object; },   // what's drawn; centred on the origin, base at y = 0,
//                                           // front facing -Z. Rebuilt whenever params change.
//     normalize( params ) { return params; },  // fill defaults and clamp (optional)
//     save( params ) { return params; },  // the params as saved with the layout, e.g. without
//                              // ones at the defaults that their absence means, so a layout saved
//                              // before they existed saves again byte for byte (optional; a copy
//                              // of them all otherwise). normalize() must undo it.
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
//                              // in the selection toolbar's Size editor too, as are dropdowns that
//                              // also have editor: true (a row's spacing). when( params ) -> false
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
//       outlines( params ),    // { top, floor }: rectangles { u0, u1, v0, v1 } in its frame (u to
//                              // its right, v to its front, metres from the middle) outlined while
//                              // dragging instead of the rectangle: a pit's top of the cut, and its
//                              // floor (or null) at the depth (optional)
//     },
//   } );
//
// A field may also have enabled( params ), which greys it out while it returns false, and a
// readout note: true, which writes it out in full across the panel (a warning). A readout that
// gives '' is left out. For fields that follow the params (a pit's sides and dig stages):
//
//     label( params, entry ),  // a label worked out afresh on each change (which way a side faces)
//     min( params ), max( params ),  // a number's ends, likewise (a slider's last stage)
//     patch( value, params ),  // the params a change sets, instead of { [ key ]: value } (a pit's
//                              // method sets its support too)
//     get( params ),           // the value shown, when it isn't params[ key ] (a stage slider whose
//                              // last step is saved as -1); its changes go through patch
//     group: 'sides',          // put in a sub-folder of that name, shown while any of its fields is
//
// when() and enabled() are given the entry too, after the params.
//
// Kinds made of library items (a row of barriers, rows.js) can also have:
//
//     prepare( params ) { return promise; },  // what build() needs that has to be fetched first
//                              // (the item's model); load() waits for it
//     item( params ) { return 'jersey-barrier'; },  // the library item it's made of: the Show
//                              // panel lists it under that item's category, not as a kind
//     count( entry ) { return 32; },  // how many things it is, where things are counted (1 if left out)
//     contains( entry, point ) { return true; },  // whether a point in its own frame (inside its
//                              // box) is inside it, for one whose box is mostly empty (a long row)
//     resize: {
//       shape: 'points',       // a handle on each of params' points to move it, and one in the
//                              // middle of each stretch between them to add a point there; a
//                              // double-click on a point takes it out
//       points( params ),      // the points, as [ east, north ] metres from its origin as if it
//                              // faced north (heading 0)
//       withPoints( params, points ),  // the params with these points instead
//       heights( entry ),      // the ground under each point, in metres above its base (optional)
//       live, label,           // as above
//     },

const kinds = new Map();

export function registerKind( name, spec ) {

	kinds.set( name, { snap: 'median', solid: true, buildOnly: false, altersMap: false, fields: [], actions: [], readouts: [], resize: null, ...spec, name } );

}

// The shape a kind's resize handles take for these params: 'rect', 'circle' or null (no handles).
export function resizeShape( kind, params ) {

	const shape = kind?.resize?.shape ?? null;
	return typeof shape === 'function' ? shape( params ) : shape;

}

// Every kind, in the order they were registered.
export function listKinds() {

	return [ ...kinds.values() ];

}

export function getKind( name ) {

	return name ? kinds.get( name ) ?? null : null;

}

// Normalised params for a kind, with defaults filled in.
export function kindParams( kind, params = {} ) {

	return kind.normalize ? kind.normalize( { ...params } ) : { ...params };

}
