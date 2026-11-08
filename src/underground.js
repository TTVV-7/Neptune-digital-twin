import { Raycaster, Vector3, Vector4 } from 'three';
import { addHitFilter, isTyping } from './walk.js';

// Under Google's ground in your own models (ones you dropped in or listed in MODELS, not library
// items or earthworks): Google's mesh is cut away over the model's footprint, so you can walk
// through a gallery or tunnel that lies below the map without the map's ground showing through
// it or stopping you.
//
// It happens by itself while you're inside one of your models and below Google's ground there,
// and U ("see underground") cuts the mesh away over all of your models wherever you are, to look
// down into them and drop in. Cut away means not drawn (a check in the tiles' shader, beside
// hideUnderEarthworks in terrain.js) and not solid: walking, flying, zooming and clicking pass
// through it (a hit filter). Snapping models to the ground still sees Google's mesh, so a model
// doesn't sink onto itself.

const MAX_HOLES = 8;
// Past the model's footprint on each side, so Google's ground along its walls doesn't show inside.
const MARGIN = 0.3;
// How often (seconds) the player is checked against the models and Google's ground.
const CHECK = 0.2;
// Below Google's ground by at least this much counts as under it.
const UNDER = 0.3;

const HOLE_GLSL = /* glsl */`
uniform int twinHoleCount;
uniform vec4 twinHoleA[ ${ MAX_HOLES } ];
uniform vec4 twinHoleB[ ${ MAX_HOLES } ];
varying vec3 vTwinHoleWorld;

// Inside one of the cut-away footprints: A is its centre (x, z) and the direction of its first
// side (x, z); B its half sizes along that side and across.
bool twinInHole( vec3 p ) {

	for ( int i = 0; i < ${ MAX_HOLES }; i ++ ) {

		if ( i >= twinHoleCount ) break;
		vec2 d = p.xz - twinHoleA[ i ].xy;
		vec2 u = twinHoleA[ i ].zw;
		if ( abs( dot( d, u ) ) < twinHoleB[ i ].x && abs( dot( d, vec2( - u.y, u.x ) ) ) < twinHoleB[ i ].y ) return true;

	}

	return false;

}
`;

export function setUpUnderground( { tiles, models, camera, toast, onUpdate, addMapEdit } ) {

	// Nothing to be under without Google's tiles: the stand-in ground leaves models alone.
	if ( ! tiles ) return null;

	const uniforms = {
		twinHoleCount: { value: 0 },
		twinHoleA: { value: Array.from( { length: MAX_HOLES }, () => new Vector4() ) },
		twinHoleB: { value: Array.from( { length: MAX_HOLES }, () => new Vector4() ) },
	};
	// The footprints cut away now: { x, z, ux, uz, hw, hl } in the scene's frame.
	let holes = [];
	let manual = false;
	let timer = 0;

	const patch = scene => scene.traverse( object => {

		if ( ! object.isMesh ) return;
		object.userData.googleTile = true;
		[ object.material ].flat().forEach( cutHoles );

	} );
	const cutHoles = material => {

		if ( material.userData.twinHoles ) return;
		material.userData.twinHoles = true;
		const previous = material.onBeforeCompile;
		material.onBeforeCompile = ( shader, renderer ) => {

			previous?.call( material, shader, renderer );
			Object.assign( shader.uniforms, uniforms );
			shader.vertexShader = shader.vertexShader
				.replace( '#include <common>', '#include <common>\nvarying vec3 vTwinHoleWorld;' )
				.replace( '#include <begin_vertex>', '#include <begin_vertex>\nvTwinHoleWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;' );
			shader.fragmentShader = shader.fragmentShader
				.replace( '#include <common>', `#include <common>\n${ HOLE_GLSL }` )
				// The tiles' fade-in rewrites main's signature (`void main( ) {`), so match loosely.
				.replace( /void\s+main\s*\(\s*\)\s*{/, value => `${ value }\n\tif ( twinInHole( vTwinHoleWorld ) ) discard;` );

		};
		material.needsUpdate = true;

	};
	tiles.forEachLoadedModel( patch );
	tiles.addEventListener( 'load-model', ( { scene } ) => patch( scene ) );

	const inHole = point => holes.some( h => {

		const dx = point.x - h.x;
		const dz = point.z - h.z;
		return Math.abs( dx * h.ux + dz * h.uz ) < h.hw && Math.abs( - dx * h.uz + dz * h.ux ) < h.hl;

	} );
	// Not while a model snaps to the ground: that's Google's ground as it is, hole or not.
	addHitFilter( hit => holes.length === 0 || models.snapping || ! ( hit.object.userData.googleTile && inHole( hit.point ) ) );
	addMapEdit?.( () => holes.length > 0 );

	// Your own models: not library items (vehicles, site pieces) or kinds (earthworks, areas).
	const yours = () => models.entries.filter( entry => ! entry.kind && ! entry.library && ! entry.placing && ! entry.pivot.userData.hidden && entry.pivot.visible );

	const _point = new Vector3();
	const _centre = new Vector3();
	const _side = new Vector3();
	const holeOf = entry => {

		const { pivot, footprint } = entry;
		pivot.updateWorldMatrix( true, false );
		footprint.getCenter( _centre );
		_side.set( _centre.x + 1, _centre.y, _centre.z );
		pivot.localToWorld( _centre );
		pivot.localToWorld( _side ).sub( _centre ).setY( 0 );
		const scale = _side.length() || 1;
		_side.divideScalar( scale );
		return {
			x: _centre.x,
			z: _centre.z,
			ux: _side.x,
			uz: _side.z,
			hw: ( footprint.max.x - footprint.min.x ) / 2 * scale + MARGIN,
			hl: ( footprint.max.z - footprint.min.z ) / 2 * scale + MARGIN,
		};

	};
	const inside = ( entry, point ) => {

		entry.pivot.updateWorldMatrix( true, false );
		return entry.footprint.containsPoint( entry.pivot.worldToLocal( _point.copy( point ) ) );

	};

	// Whether Google's ground (its first surface from above) is over a point.
	const raycaster = new Raycaster();
	raycaster.firstHitOnly = true;
	const down = new Vector3( 0, - 1, 0 );
	const underGoogle = point => {

		raycaster.set( _point.set( point.x, point.y + 2000, point.z ), down );
		raycaster.far = 2000;
		const hit = raycaster.intersectObject( tiles.group, true ).find( h => h.object.isMesh );
		return !! hit && hit.point.y > point.y + UNDER;

	};

	const update = () => {

		const eye = camera.position;
		let chosen;
		if ( manual ) chosen = yours().sort( ( a, b ) => a.pivot.position.distanceToSquared( eye ) - b.pivot.position.distanceToSquared( eye ) );
		else {

			const around = yours().filter( entry => inside( entry, eye ) );
			chosen = around.length && underGoogle( eye ) ? around : [];

		}

		holes = chosen.slice( 0, MAX_HOLES ).map( holeOf );
		uniforms.twinHoleCount.value = holes.length;
		holes.forEach( ( h, i ) => {

			uniforms.twinHoleA.value[ i ].set( h.x, h.z, h.ux, h.uz );
			uniforms.twinHoleB.value[ i ].set( h.hw, h.hl, 0, 0 );

		} );

	};

	onUpdate( dt => {

		timer -= dt;
		if ( timer > 0 ) return;
		timer = CHECK;
		update();

	} );

	const api = {
		get on() {

			return manual;

		},
		// Whether Google's mesh is cut away anywhere now (by U or by being underground in a model).
		get active() {

			return holes.length > 0;

		},
		set( on ) {

			manual = on;
			timer = 0;
			update();
			toast( on
				? ( yours().length ? 'See underground: Google\'s ground is cut away over your models. U to put it back' : 'See underground is on, but there are no models of your own to see into. U to turn it off' )
				: 'Google\'s ground is back over your models (it\'s still cut away while you\'re under it inside one)' );

		},
	};

	window.addEventListener( 'keydown', e => {

		if ( e.code !== 'KeyU' || e.repeat || isTyping( e ) || e.ctrlKey || e.metaKey || e.altKey ) return;
		api.set( ! manual );

	} );

	return api;

}
