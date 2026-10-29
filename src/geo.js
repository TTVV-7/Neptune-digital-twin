import { MathUtils, Vector3 } from 'three';
import { SITE } from './config.js';

// The scene uses the frame the Google tiles are reoriented into
// (see ReorientationPlugin): origin at SITE, +Y up, +Z north, +X west.

const METRES_PER_DEG_LAT = 111132;
const metresPerDegLon = () => 111320 * Math.cos( SITE.lat * MathUtils.DEG2RAD );

export function enuToLocal( east, north, up, target = new Vector3() ) {

	return target.set( - east, up, north );

}

export function localToEnu( v ) {

	return { east: - v.x, north: v.z, up: v.y };

}

// Flat-earth approximation; plenty for a site a couple of kilometres across.
export function localToLatLon( v ) {

	const { east, north } = localToEnu( v );
	return {
		lat: SITE.lat + north / METRES_PER_DEG_LAT,
		lon: SITE.lon + east / metresPerDegLon(),
	};

}

export function latLonToEnu( lat, lon ) {

	return {
		east: ( lon - SITE.lon ) * metresPerDegLon(),
		north: ( lat - SITE.lat ) * METRES_PER_DEG_LAT,
	};

}

// Heading is compass degrees (0 = north, 90 = east). Yaw is three.js rotation.y.
// Yaw 0 looks toward -Z (south), so heading 0 needs a half turn.
export function headingToYaw( heading ) {

	return Math.PI - heading * MathUtils.DEG2RAD;

}

export function yawToHeading( yaw ) {

	const deg = ( Math.PI - yaw ) * MathUtils.RAD2DEG;
	return ( ( deg % 360 ) + 360 ) % 360;

}
