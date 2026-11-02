// The section view and quantities for excavations: a cut-away through a pit with its dimensions,
// what it takes (cut, footprint, walls, piles, members), how the other methods would compare, and
// what's placed where its footprint reaches. The design itself comes from excavation-design.js.
//
// earthworks.js wires this in: the excavation kind's P panel lists SECTION_READOUTS and
// SECTION_ACTIONS after its own and the shoring's, every Google tile material is passed to
// clipTileMaterial() as it loads (beside hideUnderEarthworks), and setUpSection() is called once
// the shoring is set up, with what a cut-away needs. Until the section view is built they're
// empty, so the excavation's panel and the tiles are as they were.

export const SECTION_READOUTS = [];
export const SECTION_ACTIONS = [];

// A Google tile material, for clipping planes of its own when a pit is cut away.
export function clipTileMaterial() {}

// context: { scene, camera, renderer, canvas, controls, models, terrain, layers, panel, onUpdate,
// toast, kind, designs, rimOf }.
export function setUpSection() {

	return {};

}
