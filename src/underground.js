import { Box3, Matrix4, Raycaster, Vector3, Vector4 } from 'three';
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
//
// Rows in the Show panel: "Ground over your models" (its eye off is U on); "Google 3D map", whose
// eye hides Google's tiles altogether, drawn or solid, so only your models and earthworks are left
// to see and fly into; and "Solid models", whose eye off makes your models see-through (a closed
// gallery or tunnel seen from above shows what's in it), except parts whose node says xraySolid
// in its glTF extras (the B2D2 model's repair areas). They're remembered in this browser,
// as the panel's rows are, and none follows Before / After.

const MAX_HOLES = 8;
// Past the model's footprint on each side, so Google's ground along its walls doesn't show inside.
const MARGIN = 0.3;
// How often (seconds) the player is checked against the models and Google's ground.
const CHECK = 0.2;
// Below Google's ground by at least this much counts as under it.
const UNDER = 0.3;
// The Show panel rows.
const GROUND_LAYER = 'ground-over-models';
const MAP_LAYER = 'google-map';
const XRAY_LAYER = 'solid-models';
// How see-through the models are then.
const XRAY_OPACITY = 0.25;

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

export function setUpUnderground( { tiles, models, camera, toast, onUpdate, addMapEdit, layers } ) {

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
	let mapHidden = false;
	let xray = false;
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
	// Not while a model snaps to the ground: that's Google's ground as it is, hole or not, map
	// shown or not.
	addHitFilter( hit => models.snapping || ! hit.object.userData.googleTile || ! ( mapHidden || ( holes.length > 0 && inHole( hit.point ) ) ) );
	addMapEdit?.( () => holes.length > 0 );

	// Your own models: not library items (vehicles, site pieces) or kinds (earthworks, areas).
	const yours = () => models.entries.filter( entry => ! entry.kind && ! entry.library && ! entry.placing && ! entry.pivot.userData.hidden && entry.pivot.visible );

	const _point = new Vector3();
	const _centre = new Vector3();
	const _side = new Vector3();
	// Where to cut, in the model's own frame: over its solid parts only, each part's box (a gallery,
	// a pit, a tunnel), not the whole model's: see-through or walk-through parts (a building shell,
	// conveyors: noCollide) leave Google's ground round them as it is. Boxes inside another are left
	// out. Worked out once a model is placed.
	const _inverse = new Matrix4();
	const _relative = new Matrix4();
	const _box = new Box3();
	const cutsOf = entry => {

		if ( entry.cuts && entry.cuts.footprint === entry.footprint ) return entry.cuts;
		const { pivot } = entry;
		pivot.updateWorldMatrix( true, true );
		_inverse.copy( pivot.matrixWorld ).invert();
		const passable = object => {

			for ( let o = object; o && o !== pivot; o = o.parent ) if ( o.userData.noCollide ) return true;
			return false;

		};
		const boxes = [];
		pivot.traverse( object => {

			if ( ! object.isMesh || passable( object ) ) return;
			object.geometry.boundingBox ?? object.geometry.computeBoundingBox();
			boxes.push( _box.copy( object.geometry.boundingBox ).applyMatrix4( _relative.multiplyMatrices( _inverse, object.matrixWorld ) ).clone() );

		} );
		const within = ( a, b ) => a !== b && a.min.x >= b.min.x - 0.01 && a.max.x <= b.max.x + 0.01 && a.min.z >= b.min.z - 0.01 && a.max.z <= b.max.z + 0.01;
		const kept = boxes.filter( a => ! boxes.some( b => within( a, b ) && ! ( within( b, a ) && boxes.indexOf( b ) > boxes.indexOf( a ) ) ) );
		entry.cuts = ( kept.length ? kept : [ entry.footprint ] ).sort( ( a, b ) => ( b.max.x - b.min.x ) * ( b.max.z - b.min.z ) - ( a.max.x - a.min.x ) * ( a.max.z - a.min.z ) );
		entry.cuts.footprint = entry.footprint;
		return entry.cuts;

	};
	const holeOf = ( entry, footprint ) => {

		const { pivot } = entry;
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

		holes = chosen.flatMap( entry => cutsOf( entry ).map( box => holeOf( entry, box ) ) ).slice( 0, MAX_HOLES );
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

	const setManual = ( on, say ) => {

		if ( on === manual ) return;
		manual = on;
		timer = 0;
		update();
		if ( say ) toast( on
			? ( yours().length ? 'See underground: Google\'s ground is cut away over your models. U, or its eye in the Show panel, puts it back' : 'See underground is on, but there are no models of your own to see into. U to turn it off' )
			: 'Google\'s ground is back over your models (it\'s still cut away while you\'re under it inside one)' );

	};
	const setMapHidden = ( on, say ) => {

		if ( on === mapHidden ) return;
		mapHidden = on;
		tiles.group.visible = ! on;
		if ( say ) toast( on ? 'Google\'s 3D map is hidden: only your models and earthworks are left, and nothing stops you flying into them' : 'Google\'s 3D map is back' );

	};

	// See-through: every material of your models but the parts marked solid, with how it was kept
	// to put back. Materials are shared within a model, so each is changed once.
	const solidPart = object => {

		for ( let o = object; o; o = o.parent ) if ( o.userData.xraySolid ) return true;
		return false;

	};
	const seeThrough = ( entry, on ) => entry.pivot.traverse( object => {

		if ( ! object.isMesh || solidPart( object ) ) return;
		for ( const material of [ object.material ].flat() ) {

			if ( on && ! material.userData.xray ) {

				material.userData.xray = { transparent: material.transparent, opacity: material.opacity, depthWrite: material.depthWrite };
				Object.assign( material, { transparent: true, opacity: Math.min( material.opacity, XRAY_OPACITY ), depthWrite: false } );
				material.needsUpdate = true;

			} else if ( ! on && material.userData.xray ) {

				Object.assign( material, material.userData.xray );
				delete material.userData.xray;
				material.needsUpdate = true;

			}

		}

	} );
	const setXray = ( on, say ) => {

		if ( on === xray ) return;
		xray = on;
		for ( const entry of yours() ) seeThrough( entry, on );
		if ( say ) toast( on ? 'Your models are see-through, so you can look into them; the repair areas stay solid' : 'Your models are solid again' );

	};
	models.addEventListener( 'add', ( { entry } ) => {

		if ( xray && yours().includes( entry ) ) seeThrough( entry, true );

	} );

	// The rows follow their own eyes only (not Before, which shows Google's map as it was).
	// Switched at start-up from what this browser remembers, without a word.
	let starting = true;
	layers?.addLayer( GROUND_LAYER, {
		name: 'Ground over your models',
		count: () => yours().length,
		setShown: () => setManual( ! layers.isLayerShown( GROUND_LAYER ), ! starting ),
	} );
	// Eye off: see-through.
	layers?.addLayer( XRAY_LAYER, {
		name: 'Solid models',
		count: () => yours().length,
		setShown: () => setXray( ! layers.isLayerShown( XRAY_LAYER ), ! starting ),
	} );
	layers?.addLayer( MAP_LAYER, {
		name: 'Google 3D map',
		count: () => true,
		setShown: () => setMapHidden( ! layers.isLayerShown( MAP_LAYER ), ! starting ),
	} );
	starting = false;

	const api = {
		get on() {

			return manual;

		},
		// Whether Google's mesh is cut away anywhere now (by U or by being underground in a model).
		get active() {

			return holes.length > 0;

		},
		get mapHidden() {

			return mapHidden;

		},
		set( on ) {

			if ( layers ) layers.setLayerShown( GROUND_LAYER, ! on );
			else setManual( on, true );

		},
	};

	window.addEventListener( 'keydown', e => {

		if ( e.code !== 'KeyU' || e.repeat || isTyping( e ) || e.ctrlKey || e.metaKey || e.altKey ) return;
		api.set( ! manual );

	} );

	return api;

}
