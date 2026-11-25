import { Vector3 } from 'three';

// Walking in third person, the frame is drawn from behind the walker's shoulder, but the camera
// goes back to his eyes once it's drawn (player.js), so walking goes on from there. Clicks, drags
// and the wheel come between frames: aimed from the eyes, they'd hit something other than what's
// under the pointer in the picture, the more so the nearer it is. So a ray from the screen starts
// from where the last frame was drawn: this far from the camera (nothing while the camera is
// where it draws from: first person, flying, driving, or during the frame itself).
export const viewOffset = new Vector3();

// raycaster.setFromCamera, from where the picture on screen was drawn.
export function setFromView( raycaster, ndc, camera ) {

	raycaster.setFromCamera( ndc, camera );
	raycaster.ray.origin.add( viewOffset );
	return raycaster;

}
