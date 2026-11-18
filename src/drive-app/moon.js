// The Moon (docs/world-drive.md, "The Moon"): body.js's world made in the page, with the Moon's
// heights, picture and look (worlds.js, body.js's LOOKS). Kept by this name for what still asks for
// the Moon by it.

import { createBody, MOON_ELLIPSOID, MOON_RADIUS } from './body.js';
import { MOON } from './worlds.js';

export { MOON_ELLIPSOID, MOON_RADIUS };

export function createMoon() {

	return createBody( MOON );

}
