import {
	AdditiveBlending,
	BackSide,
	MathUtils,
	Matrix4,
	Mesh,
	Quaternion,
	Ray,
	Raycaster,
	ShaderMaterial,
	SphereGeometry,
	Vector2,
	Vector3,
} from 'three';
import { CAMERA_FRAME, GlobeControls } from '3d-tiles-renderer';

// The globe: Google's tiles (or the test globe) seen from space, turned with GlobeControls (drag
// to spin, wheel or pinch to zoom, right-drag or two fingers to tilt), slowly turning by itself
// while nobody touches it. A tap drops a pin. The camera flies between places in one smooth move:
// see flyTo.
//
// The scene's frame follows the place being driven (main.js recentres it), so the Earth's own
// frame, centred on the Earth with Z through the North Pole, is `earth`'s world matrix: the tiles'
// group, or the test globe. Poses are kept in that frame, so a recentre never moves the view.

const DEG = MathUtils.DEG2RAD;
// The globe turns this fast (degrees a second) when it's left alone this long (s).
const SPIN = 3;
const SPIN_AFTER = 25;
// A tap is a press and release this close together, in pixels and milliseconds.
const TAP_MOVE = 8;
const TAP_TIME = 450;
// The atmosphere's glow, as a share of the Earth's radius, shown from this high up (m).
const AIR = 1.025;
const AIR_FROM = 300000;
const EARTH_RADIUS = 6371000;

const _m = new Matrix4();
const _inverse = new Matrix4();
const _pos = new Vector3();
const _forward = new Vector3();
const _up = new Vector3();
const _east = new Vector3();
const _north = new Vector3();
const _normal = new Vector3();
const _focus = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _scale = new Vector3();
const _axis = new Vector3();
const _centre = new Vector3();
const _q = new Quaternion();
const _ray = new Ray();
const _ndc = new Vector2();
const _carto = {};

export class GlobeView {

	// earth: the object whose world matrix is the Earth's frame. surface: what a tap or a height
	// check hits (the tiles, or the test globe). pin: the pin's element, positioned over the view.
	constructor( { camera, canvas, earth, surface, ellipsoid, pin } ) {

		this.camera = camera;
		this.canvas = canvas;
		this.earth = earth;
		this.surface = surface;
		this.ellipsoid = ellipsoid;
		this.pinElement = pin;
		this.pin = null;
		this.flight = null;
		this.enabled = true;
		this.onPick = null;
		this.raycaster = new Raycaster();
		this.raycaster.firstHitOnly = true;
		this.ecef = new Matrix4();
		this.lastTouch = - Infinity;

		this.controls = new GlobeControls( surface, camera, canvas );
		this.controls.setEllipsoid( ellipsoid, earth );
		this.controls.enableDamping = true;
		this.controls.addEventListener( 'start', () => this.touched() );

		this.air = makeAtmosphere();
		this.air.visible = false;

		// Taps, told apart from drags and pinches.
		let press = null;
		canvas.addEventListener( 'pointerdown', e => {

			this.touched();
			press = press || ! e.isPrimary ? null : { id: e.pointerId, x: e.clientX, y: e.clientY, time: performance.now() };

		} );
		canvas.addEventListener( 'pointerup', e => {

			const tap = press && press.id === e.pointerId && Math.hypot( e.clientX - press.x, e.clientY - press.y ) < TAP_MOVE && performance.now() - press.time < TAP_TIME;
			press = null;
			if ( ! tap || ! this.controls.enabled || e.button > 0 ) return;
			const place = this.pick( e.clientX, e.clientY );
			if ( place ) this.onPick?.( place );

		} );
		canvas.addEventListener( 'pointercancel', () => press = null );
		canvas.addEventListener( 'wheel', () => this.touched(), { passive: true } );

	}

	get active() {

		return this.controls.enabled || !! this.flight;

	}

	// On for the globe, off while driving (the drive moves the camera then).
	setEnabled( on ) {

		this.controls.enabled = on && ! this.flight;
		this.enabled = on;

	}

	touched() {

		this.lastTouch = performance.now();

	}

	update( dt ) {

		if ( this.flight ) this.fly( dt );
		else if ( this.controls.enabled ) {

			this.controls.update( dt );
			// Left alone with nothing picked, the globe turns as the Earth does: west to east.
			if ( ! this.pin && performance.now() - this.lastTouch > SPIN_AFTER * 1000 && this.altitude() > 2e6 ) {

				_axis.set( 0, 0, 1 ).transformDirection( this.earth.matrixWorld );
				_centre.setFromMatrixPosition( this.earth.matrixWorld );
				_q.setFromAxisAngle( _axis, - SPIN * DEG * dt );
				this.camera.position.sub( _centre ).applyQuaternion( _q ).add( _centre );
				this.camera.quaternion.premultiply( _q );
				this.camera.updateMatrixWorld();

			}

		}

		this.updateAir();
		this.updatePin();

	}

	// Remember where the camera is on the Earth, or put it back there after the scene's frame moved
	// (a recentre, or the tiles' root arriving).
	capture() {

		this.camera.updateMatrixWorld();
		this.ecef.copy( this.camera.matrixWorld ).premultiply( _inverse.copy( this.earth.matrixWorld ).invert() );

	}

	restore() {

		_m.copy( this.ecef ).premultiply( this.earth.matrixWorld );
		_m.decompose( this.camera.position, this.camera.quaternion, _scale );
		this.camera.updateMatrixWorld();

	}

	// Where the camera is, as the point it looks at ({ lat, lon } in degrees, height in metres),
	// how far away that is (m), and its heading and pitch (degrees, pitch below 0 looks down). The
	// point is on whatever has loaded in front of the camera, else on the ellipsoid; the camera can
	// be below the ellipsoid (it's under sea level in many places), and then it's the point below it.
	pose() {

		const { ellipsoid, camera } = this;
		camera.updateMatrixWorld();
		_inverse.copy( this.earth.matrixWorld ).invert();
		_m.copy( camera.matrixWorld ).premultiply( _inverse );
		_pos.setFromMatrixPosition( _m );
		_forward.set( 0, 0, - 1 ).transformDirection( _m );
		_up.set( 0, 1, 0 ).transformDirection( _m );
		this.raycaster.set( camera.position, _a.set( 0, 0, - 1 ).transformDirection( camera.matrixWorld ) );
		this.raycaster.far = Infinity;
		const hit = this.raycaster.intersectObject( this.surface, true ).find( h => h.object.isMesh && h.object.visible );
		_ray.set( _pos, _forward );
		if ( hit ) _focus.copy( hit.point ).applyMatrix4( _inverse );
		else if ( ellipsoid.getPositionElevation( _pos ) < 0 ) ellipsoid.getPositionToSurfacePoint( _pos, _focus );
		else if ( ! ellipsoid.intersectRay( _ray, _focus ) ) ellipsoid.closestPointToRayEstimate( _ray, _focus );
		ellipsoid.getPositionToCartographic( _focus, _carto );
		ellipsoid.getEastNorthUpAxes( _carto.lat, _carto.lon, _east, _north, _normal );
		const pitch = Math.asin( MathUtils.clamp( _forward.dot( _normal ), - 1, 1 ) );
		// Looking nearly straight down, which way is up the screen says the heading.
		const level = Math.abs( pitch ) > 80 * DEG ? _up : _forward;
		return {
			lat: _carto.lat / DEG,
			lon: _carto.lon / DEG,
			height: hit ? _carto.height : 0,
			distance: _pos.distanceTo( _focus ),
			heading: Math.atan2( level.dot( _east ), level.dot( _north ) ) / DEG,
			pitch: pitch / DEG,
		};

	}

	// How high the camera is over the ellipsoid (m).
	altitude() {

		_pos.copy( this.camera.position ).applyMatrix4( _inverse.copy( this.earth.matrixWorld ).invert() );
		return this.ellipsoid.getPositionElevation( _pos );

	}

	// Put the camera `distance` metres from a point, looking at it along heading and pitch.
	place( { lat, lon, height = 0, distance, heading = 0, pitch = - 90 } ) {

		this.ellipsoid.getObjectFrame( lat * DEG, lon * DEG, height, heading * DEG, pitch * DEG, 0, _m, CAMERA_FRAME );
		_forward.set( 0, 0, - 1 ).transformDirection( _m );
		_pos.setFromMatrixPosition( _m ).addScaledVector( _forward, - distance );
		_m.setPosition( _pos ).premultiply( this.earth.matrixWorld );
		_m.decompose( this.camera.position, this.camera.quaternion, _scale );
		this.camera.updateMatrixWorld();
		this.clip( height + distance * Math.max( 0, - Math.sin( pitch * DEG ) ) );

	}

	// The whole Earth in view, centred on ( lat, lon ), filling most of the screen's smaller side.
	orbit( lat, lon ) {

		const { camera } = this;
		const vertical = camera.fov * DEG;
		const horizontal = 2 * Math.atan( Math.tan( vertical / 2 ) * camera.aspect );
		const angle = Math.min( vertical, horizontal ) * ( camera.aspect < 1 ? 0.33 : 0.38 );
		return { lat, lon, height: 0, distance: EARTH_RADIUS / Math.sin( angle ) - EARTH_RADIUS, heading: 0, pitch: - 90 };

	}

	// Fly to a pose (see pose()): along the great circle, rising for a long way and coming down in
	// one smooth move. Resolves when it's there, or false if another flight took over.
	flyTo( to, { duration } = {} ) {

		const from = this.pose();
		to = { height: 0, heading: from.heading, pitch: - 60, ...to };
		this.ellipsoid.getCartographicToPosition( from.lat * DEG, from.lon * DEG, 0, _a );
		this.ellipsoid.getCartographicToPosition( to.lat * DEG, to.lon * DEG, 0, _b );
		const angle = _a.angleTo( _b );
		const arc = angle * EARTH_RADIUS;
		const near = Math.min( from.distance, to.distance );
		const far = Math.max( from.distance, to.distance );
		// Going far, the view climbs on the way so the trip is seen from high enough.
		const top = Math.min( Math.max( far, arc * 0.9 ), 2.5e7 );
		const logs = [ Math.log( from.distance ), Math.log( to.distance ) ];
		const lift = top > far * 1.05 ? 2 * Math.log( top ) - ( logs[ 0 ] + logs[ 1 ] ) / 2 : ( logs[ 0 ] + logs[ 1 ] ) / 2;
		duration ??= MathUtils.clamp( 1.2 + arc / 3e6 + Math.log( far / Math.max( near, 1 ) ) * 0.15, 1.2, 4.5 );

		this.flight?.resolve( false );
		return new Promise( resolve => {

			this.flight = { from, to, a: _a.clone(), b: _b.clone(), angle, logs, lift, time: 0, duration, resolve };
			this.controls.enabled = false;

		} );

	}

	cancelFlight() {

		this.flight?.resolve( false );
		this.flight = null;
		this.controls.enabled = !! this.enabled;

	}

	fly( dt ) {

		const f = this.flight;
		f.time += dt;
		const t = Math.min( 1, f.time / f.duration );
		const e = t < 0.5 ? 4 * t * t * t : 1 - ( - 2 * t + 2 ) ** 3 / 2;
		// The point looked at moves along the ground a little ahead of the climb and descent.
		const g = Math.min( 1, e * 1.15 );
		slerp( f.a, f.b, f.angle, g, _pos );
		this.ellipsoid.getPositionToCartographic( _pos, _carto );
		const { from, to } = f;
		const log = ( 1 - e ) ** 2 * f.logs[ 0 ] + 2 * e * ( 1 - e ) * f.lift + e * e * f.logs[ 1 ];
		this.place( {
			lat: _carto.lat / DEG,
			lon: _carto.lon / DEG,
			height: MathUtils.lerp( from.height, to.height, e ),
			distance: Math.exp( log ),
			heading: from.heading + wrap( to.heading - from.heading ) * e,
			pitch: MathUtils.lerp( from.pitch, to.pitch, e ),
		} );
		if ( t < 1 ) return;
		this.flight = null;
		this.controls.enabled = !! this.enabled;
		// The controls pick up from here without a jolt.
		this.controls.setCamera( this.camera );
		f.resolve( true );

	}

	// Near and far clipping for a camera this high (m): GlobeControls sets them while it drives the
	// camera; flights and drives call this.
	clip( altitude ) {

		const h = Math.max( 2, altitude );
		this.camera.near = MathUtils.clamp( h / 1000, 0.1, 5000 );
		this.camera.far = Math.sqrt( h * ( 2 * EARTH_RADIUS + h ) ) + 2e5;
		this.camera.updateProjectionMatrix();

	}

	// The place under a point on the screen: on the tiles (with their height), or on the bare
	// ellipsoid where none have loaded. Null off the edge of the Earth.
	pick( x, y ) {

		const rect = this.canvas.getBoundingClientRect();
		_ndc.set( ( x - rect.left ) / rect.width * 2 - 1, - ( y - rect.top ) / rect.height * 2 + 1 );
		this.raycaster.setFromCamera( _ndc, this.camera );
		this.raycaster.far = Infinity;
		_inverse.copy( this.earth.matrixWorld ).invert();
		const hit = this.raycaster.intersectObject( this.surface, true ).find( h => h.object.isMesh && h.object.visible );
		if ( hit ) _pos.copy( hit.point ).applyMatrix4( _inverse );
		else if ( ! this.ellipsoid.intersectRay( _ray.copy( this.raycaster.ray ).applyMatrix4( _inverse ), _pos ) ) return null;
		this.ellipsoid.getPositionToCartographic( _pos, _carto );
		return { lat: _carto.lat / DEG, lon: _carto.lon / DEG, height: hit ? _carto.height : null };

	}

	// The height (m above the ellipsoid) of whatever has loaded at ( lat, lon ), or null.
	surfaceHeight( lat, lon ) {

		const { ellipsoid } = this;
		ellipsoid.getCartographicToPosition( lat * DEG, lon * DEG, 12000, _pos ).applyMatrix4( this.earth.matrixWorld );
		ellipsoid.getCartographicToNormal( lat * DEG, lon * DEG, _normal ).transformDirection( this.earth.matrixWorld ).negate();
		this.raycaster.set( _pos, _normal );
		this.raycaster.far = 24000;
		const hit = this.raycaster.intersectObject( this.surface, true ).find( h => h.object.isMesh && h.object.visible );
		if ( ! hit ) return null;
		ellipsoid.getPositionToCartographic( _pos.copy( hit.point ).applyMatrix4( _inverse.copy( this.earth.matrixWorld ).invert() ), _carto );
		return _carto.height;

	}

	setPin( place ) {

		this.pin = place;
		this.pinElement.hidden = ! place;
		this.updatePin();

	}

	updatePin() {

		const { pin, pinElement, camera } = this;
		if ( ! pin ) return;
		const { ellipsoid } = this;
		ellipsoid.getCartographicToPosition( pin.lat * DEG, pin.lon * DEG, pin.height ?? 0, _pos ).applyMatrix4( this.earth.matrixWorld );
		ellipsoid.getCartographicToNormal( pin.lat * DEG, pin.lon * DEG, _normal ).transformDirection( this.earth.matrixWorld );
		// Out of sight round the back of the Earth, or off the screen.
		const facing = _normal.dot( _up.subVectors( camera.position, _pos ) ) > 0;
		_pos.project( camera );
		const shown = facing && this.enabled && Math.abs( _pos.x ) < 1.1 && Math.abs( _pos.y ) < 1.1 && _pos.z < 1;
		pinElement.hidden = ! shown;
		if ( ! shown ) return;
		const rect = this.canvas.getBoundingClientRect();
		pinElement.style.transform = `translate( ${ ( ( _pos.x + 1 ) / 2 * rect.width ).toFixed( 1 ) }px, ${ ( ( 1 - _pos.y ) / 2 * rect.height ).toFixed( 1 ) }px )`;

	}

	// The glow round the Earth from space, fading out on the way down.
	updateAir() {

		const { air, camera } = this;
		_centre.setFromMatrixPosition( this.earth.matrixWorld );
		const altitude = camera.position.distanceTo( _centre ) - EARTH_RADIUS;
		air.visible = this.enabled && altitude > AIR_FROM;
		if ( ! air.visible ) return;
		const radius = this.ellipsoid.radius;
		air.matrix.makeScale( radius.x * AIR, radius.y * AIR, radius.z * AIR ).premultiply( this.earth.matrixWorld );
		air.matrixWorldNeedsUpdate = true;
		air.material.uniforms.strength.value = MathUtils.clamp( ( altitude - AIR_FROM ) / 2e6, 0, 1 );

	}

}

function makeAtmosphere() {

	const material = new ShaderMaterial( {
		uniforms: { strength: { value: 1 } },
		vertexShader: /* glsl */`
			#include <common>
			#include <logdepthbuf_pars_vertex>
			varying vec3 vNormal;
			varying vec3 vView;
			void main() {
				vec4 mv = modelViewMatrix * vec4( position, 1.0 );
				vNormal = normalize( normalMatrix * normal );
				vView = normalize( - mv.xyz );
				gl_Position = projectionMatrix * mv;
				#include <logdepthbuf_vertex>
			}`,
		fragmentShader: /* glsl */`
			#include <logdepthbuf_pars_fragment>
			uniform float strength;
			varying vec3 vNormal;
			varying vec3 vView;
			void main() {
				#include <logdepthbuf_fragment>
				// Seen from inside its far side, the shell is brightest just off the Earth's edge.
				float glow = pow( clamp( abs( dot( vNormal, vView ) ) / 0.24, 0.0, 1.0 ), 1.6 );
				gl_FragColor = vec4( vec3( 0.32, 0.62, 1.0 ) * glow * strength, 1.0 );
			}`,
		side: BackSide,
		blending: AdditiveBlending,
		transparent: true,
		depthWrite: false,
	} );
	const air = new Mesh( new SphereGeometry( 1, 96, 48 ), material );
	air.name = 'atmosphere';
	air.matrixAutoUpdate = false;
	air.frustumCulled = false;
	air.raycast = () => {};
	return air;

}

// Spherical interpolation between the points a and b (angle apart, seen from the Earth's centre),
// with their lengths lerped.
function slerp( a, b, angle, t, target ) {

	if ( angle < 1e-6 ) return target.lerpVectors( a, b, t );
	const sa = Math.sin( ( 1 - t ) * angle ) / Math.sin( angle );
	const sb = Math.sin( t * angle ) / Math.sin( angle );
	const length = MathUtils.lerp( a.length(), b.length(), t );
	return target.copy( a ).multiplyScalar( sa ).addScaledVector( b, sb ).setLength( length );

}

function wrap( degrees ) {

	return MathUtils.euclideanModulo( degrees + 180, 360 ) - 180;

}
