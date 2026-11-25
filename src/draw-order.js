// What's placed is drawn after the ground (Google's tiles and earthworks, renderOrder 0) and after a
// flatten area's surface (flatten.js's SURFACE_ORDER, drawn over the ground without writing depth),
// so it stands on that surface rather than under it. Parts that set an order of their own keep it.
// The same goes for figures added straight to the scene that stand on that ground: the walking
// character (player.js), a repair crew (repair-crew.js), a truck's load (excavator.js).
export const PLACED_ORDER = 1;
export function drawnAfterGround( object ) {

	object.traverse( o => {

		if ( ( o.isMesh || o.isLine || o.isPoints ) && o.renderOrder === 0 ) o.renderOrder = PLACED_ORDER;

	} );

}
