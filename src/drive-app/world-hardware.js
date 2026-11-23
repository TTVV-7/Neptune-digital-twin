import { Box3, BoxGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import * as MOON_MODELS from './hardware.js';
import * as MARS_MODELS from './hardware-mars.js';
import { SITES } from './hardware-sites.js';
import { distance } from './finds-rules.js';
import { WORLDS } from './worlds.js';

// The hardware people have left on the other worlds (docs/world-drive.md, "Hardware on the worlds"):
// every lander, rover and crash site in hardware-sites.js, built from hardware.js's and
// hardware-mars.js's models and set down where it really is. Only the sites within NEAR m of the car
// are built (each piece on the ground at its own place, upright, facing its heading), and those past
// FAR let go. Each piece has an invisible box round it that the car hits (colliders, which main.js
// adds to what the Driver raycasts), so you bounce off a lander as off a wall. Driving up to a site,
// within ARRIVE m, says what it is once a visit.

const NEAR = 25000;
const FAR = 35000;
const ARRIVE = 90;
// How often (s) the sites near the car are looked at again.
const LOOK = 1;
// Pieces too flat or small to drive into: no box.
const NO_BOX = new Set( [ 'impact', 'schiaparelli', 'backshell', 'soraQ' ] );
// Those flat ones lie on the ground's bumps, which can rise a few tens of centimetres across them:
// lifted this much (m), so a scar or a parachute isn't half buried.
const FLAT_LIFT = 0.15;
const MODELS = { ...MOON_MODELS, ...MARS_MODELS };
const RAD = Math.PI / 180;
const hidden = new MeshBasicMaterial( { visible: false } );
const _p = new Vector3();
const _up = new Vector3();
const _north = new Vector3();
const _east = new Vector3();
const _south = new Vector3();
const _basis = new Matrix4();
const _turn = new Quaternion();
const _q = new Quaternion();
const Y = new Vector3( 0, 1, 0 );

// bodyOf( id ): a world's body ({ group, ellipsoid, heightAt }); toast( text, ms ): a note on screen.
export function createWorldHardware( { bodyOf, toast = () => {} } ) {

	let world = null;
	let group = null;
	// Each built site's { pieces, boxes } by id.
	const built = new Map();
	// The boxes the car hits, for the Driver: one group, kept on the body being driven.
	const colliders = new Group();
	colliders.name = 'hardware-colliders';
	// The sites already said this visit.
	const told = new Set();
	let since = LOOK;

	// The world being driven (a world made in the page, or anything else: none).
	function setWorld( id ) {

		if ( id === world ) return;
		clear();
		world = id;
		const body = bodyOf( id );
		if ( ! body || ! SITES.some( site => site.world === id ) ) return;
		group = new Group();
		group.name = 'hardware';
		body.group.add( group, colliders );
		since = LOOK;

	}

	function clear() {

		for ( const id of [ ...built.keys() ] ) drop( id );
		group?.removeFromParent();
		colliders.removeFromParent();
		group = null;

	}

	// Every frame: `car` { lat, lon } while driving on the world, else null.
	function update( dt, car ) {

		if ( ! group || ! car ) return;
		since += dt;
		if ( since < LOOK ) return;
		since = 0;
		const body = bodyOf( world );
		// (Not before the world's heights are in: nothing could be set on the ground.)
		if ( body?.heightAt( car.lat, car.lon ) == null ) return;
		const radius = WORLDS[ world ].radius;
		for ( const site of SITES ) {

			// (A site with nothing set down, a rover still driving whose place now isn't known: left out.)
			if ( site.world !== world || ! site.pieces?.length ) continue;
			const d = distance( car, site, radius );
			if ( d < NEAR && ! built.has( site.id ) ) build( site, body );
			else if ( d > FAR && built.has( site.id ) ) drop( site.id );
			if ( d < ARRIVE && ! told.has( site.id ) ) {

				told.add( site.id );
				toast( `${ site.name } · ${ site.country }, ${ site.year }. ${ site.fact }`, 9000 );

			}

		}

	}

	function build( site, body ) {

		const radius = WORLDS[ world ].radius;
		const pieces = [];
		const boxes = [];
		let seed = 1;
		for ( const piece of site.pieces ) {

			const make = MODELS[ piece.model ];
			if ( typeof make !== 'function' ) continue;
			const object = piece.model === 'impact' ? make( seed ++ ) : make();
			// Where this piece is: its offset east and north of the site, on the ground there.
			const lat = site.lat + ( piece.north ?? 0 ) / radius / RAD;
			const lon = site.lon + ( piece.east ?? 0 ) / ( radius * Math.cos( site.lat * RAD ) ) / RAD;
			placeOn( body, object, lat, lon, piece.heading ?? 0, NO_BOX.has( piece.model ) ? FLAT_LIFT : - 0.05 );
			object.name = `hardware-${ site.id }-${ piece.model }`;
			group.add( object );
			pieces.push( object );
			if ( ! NO_BOX.has( piece.model ) ) {

				const box = boxOf( object );
				colliders.add( box );
				boxes.push( box );

			}

		}

		built.set( site.id, { pieces, boxes } );

	}

	function drop( id ) {

		const site = built.get( id );
		if ( ! site ) return;
		for ( const piece of site.pieces ) {

			piece.removeFromParent();
			piece.traverse( object => object.geometry?.dispose() );

		}

		for ( const box of site.boxes ) {

			box.removeFromParent();
			box.geometry.dispose();

		}

		built.delete( id );

	}

	return {
		setWorld,
		update,
		// What the car hits besides the ground (empty off these worlds).
		colliders,
		// The sites on `id` (for the book, the globe, the tests).
		sitesOn: id => SITES.filter( site => site.world === id ),
		// Which are built now (the tests).
		get built() {

			return [ ...built.keys() ];

		},
	};

}

// Puts `object` (standing on y = 0, its front −Z) on `body`'s ground at lat, lon (degrees), upright
// to the ground's up there, facing `heading` degrees clockwise from north, `lift` m over the ground
// (a few centimetres sunk for what stands on feet, so none floats over a dip the grid smooths).
function placeOn( body, object, lat, lon, heading, lift ) {

	const ground = ( body.heightAt( lat, lon ) ?? 0 ) + lift;
	body.ellipsoid.getCartographicToPosition( lat * RAD, lon * RAD, ground, _p );
	body.ellipsoid.getCartographicToPosition( lat * RAD, lon * RAD, ground + 1, _up ).sub( _p ).normalize();
	body.ellipsoid.getCartographicToPosition( ( lat + 0.001 ) * RAD, lon * RAD, ground, _north ).sub( _p );
	_north.addScaledVector( _up, - _north.dot( _up ) ).normalize();
	_east.crossVectors( _north, _up ).normalize();
	_south.copy( _north ).negate();
	_basis.makeBasis( _east, _up, _south );
	_q.setFromRotationMatrix( _basis );
	_turn.setFromAxisAngle( Y, - heading * RAD );
	object.position.copy( _p );
	object.quaternion.copy( _q ).multiply( _turn );
	object.updateMatrix();
	object.updateMatrixWorld( true );

}

// An invisible box the size of `object` (as it stands, in its own frame), placed as it is.
function boxOf( object ) {

	const local = new Box3();
	const inverse = new Matrix4().copy( object.matrixWorld ).invert();
	object.traverse( child => {

		if ( ! child.isMesh ) return;
		child.geometry.computeBoundingBox();
		local.union( child.geometry.boundingBox.clone().applyMatrix4( new Matrix4().multiplyMatrices( inverse, child.matrixWorld ) ) );

	} );
	const size = local.getSize( new Vector3() );
	const centre = local.getCenter( new Vector3() );
	const box = new Mesh( new BoxGeometry( Math.max( size.x, 0.1 ), Math.max( size.y, 0.1 ), Math.max( size.z, 0.1 ) ), hidden );
	box.position.copy( centre ).applyQuaternion( object.quaternion ).add( object.position );
	box.quaternion.copy( object.quaternion );
	box.name = `${ object.name }-box`;
	box.updateMatrix();
	return box;

}
