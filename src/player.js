import { Bone, BufferAttribute, MathUtils, Raycaster, Skeleton, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PLAYER } from './config.js';
import { blocks, isTyping } from './walk.js';

// Walking round the site as a construction worker (public/models/player-worker.glb, made by
// scripts/add-player-model.mjs from a hi3D model): seen from behind in third person, or from his
// eyes in first person, where looking down shows his vest, hands and boots. C switches between
// them while walking (as it switches the camera while driving), remembered in this browser.
//
// The model is one mesh standing with its arms down, facing +z, with no bones. It's given them
// here as it loads: hips, spine, chest and head, a thigh and shin each side and an upper arm and
// forearm each side, each vertex weighted to the bones of the part of the body it's in (see
// weigh()). Walking swings the legs and arms in step with how far he's gone, faster and further
// running; off the ground the knees come up. In first person the head is shrunk away so the
// camera, at his eyes, isn't inside it.
//
// The camera is the walk controller's (walk.js), at his eyes: for third person it's moved back
// and up over his shoulder just for drawing the frame, and put back after, so walking, clicking
// and everything else go on from his eyes as before. It comes in closer when a wall or the ground
// is in the way.

const URL_ = new URL( 'models/player-worker.glb', document.baseURI );
const STORAGE_KEY = 'neptune-twin.player-view';
// Third person: the camera this far (m) behind his eyes, this far to his right and up.
const CHASE = { back: 3.2, right: 0.45, up: 0.25, nearest: 0.6, margin: 0.2, ease: 6 };
// First person: the camera this far (m) in front of the middle of his body, at his eyes; looking
// down, he stands further back (up to `down` more), so you see down the front of his vest to his
// boots rather than into his collar.
const EYES_FORWARD = { level: 0.13, down: 0.32 };
// A full stride (m: two steps) walking, and running, and how far the legs and arms swing (rad).
const STRIDE = { walk: 1.5, run: 2.8 };
const SWING = { thigh: 0.45, knee: 0.7, arm: 0.4, elbow: 0.35, run: 1.4 };

// Where his joints are, as shares of his height from the floor and across (his left is +x).
const JOINTS = {
	hips: [ 0, 0.5 ], spine: [ 0, 0.58 ], chest: [ 0, 0.7 ], head: [ 0, 0.83 ],
	thighL: [ 0.075, 0.48 ], shinL: [ 0.075, 0.27 ], thighR: [ - 0.075, 0.48 ], shinR: [ - 0.075, 0.27 ],
	armL: [ 0.14, 0.775 ], forearmL: [ 0.165, 0.6 ], armR: [ - 0.14, 0.775 ], forearmR: [ - 0.165, 0.6 ],
};
const PARENT = {
	spine: 'hips', chest: 'spine', head: 'chest', thighL: 'hips', shinL: 'thighL', thighR: 'hips', shinR: 'thighR',
	armL: 'chest', forearmL: 'armL', armR: 'chest', forearmR: 'armR',
};
const NAMES = Object.keys( JOINTS );

const smooth = ( a, b, v ) => MathUtils.smoothstep( v, a, b );

// How much each bone moves a point of him, from where it is (x across, y up, as shares of his
// height): the arms are what hangs out past his sides, the legs what's below the crotch, the head
// what's above the neck, and the rest his body, from the hips to the chest. Soft at the joins.
function weigh( x, y ) {

	const w = {};
	const add = ( name, v ) => {

		if ( v > 1e-4 ) w[ name ] = ( w[ name ] ?? 0 ) + v;

	};
	const side = x >= 0 ? 'L' : 'R';
	const ax = Math.abs( x );
	// His sides: 0.118 of his height out from the middle, wider up to the shoulders.
	const edge = y < 0.66 ? 0.118 : 0.118 + ( Math.min( y, 0.78 ) - 0.66 ) / 0.12 * 0.03;
	const arm = y > 0.4 && y < 0.81 ? smooth( edge - 0.012, edge + 0.012, ax ) * ( 1 - smooth( 0.79, 0.81, y ) ) : 0;
	const fore = 1 - smooth( 0.585, 0.625, y );
	add( `arm${ side }`, arm * ( 1 - fore ) );
	add( `forearm${ side }`, arm * fore );
	let rest = 1 - arm;
	// The legs, fading into the hips; not across the middle, where the two would pull apart.
	const leg = ( y < 0.36 ? 1 : 1 - smooth( 0.36, 0.47, y ) ) * ( y > 0.34 ? smooth( 0, 0.03, ax ) : 1 );
	const shin = 1 - smooth( 0.25, 0.3, y );
	add( `thigh${ side }`, rest * leg * ( 1 - shin ) );
	add( `shin${ side }`, rest * leg * shin );
	rest *= 1 - leg;
	const head = smooth( 0.815, 0.845, y );
	add( 'head', rest * head );
	rest *= 1 - head;
	const chest = smooth( 0.62, 0.7, y );
	const spine = smooth( 0.5, 0.58, y ) * ( 1 - chest );
	add( 'chest', rest * chest );
	add( 'spine', rest * spine );
	add( 'hips', rest * ( 1 - chest - spine ) );
	// Four at most, the strongest, adding up to one.
	const top = Object.entries( w ).sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).slice( 0, 4 );
	const sum = top.reduce( ( s, [ , v ] ) => s + v, 0 );
	return top.map( ( [ name, v ] ) => [ NAMES.indexOf( name ), v / sum ] );

}

// The loaded mesh, given its bones: a SkinnedMesh with them in its bind pose.
function rig( mesh ) {

	const geometry = mesh.geometry;
	geometry.computeBoundingBox();
	const height = geometry.boundingBox.max.y - geometry.boundingBox.min.y;
	const bones = {};
	for ( const name of NAMES ) {

		const [ x, y ] = JOINTS[ name ];
		const bone = new Bone();
		bone.name = name;
		bone.userData.at = new Vector3( x * height, y * height, 0 );
		bones[ name ] = bone;

	}

	for ( const name of NAMES ) {

		const bone = bones[ name ];
		const parent = PARENT[ name ] && bones[ PARENT[ name ] ];
		bone.position.copy( bone.userData.at );
		if ( parent ) {

			bone.position.sub( parent.userData.at );
			parent.add( bone );

		}

	}

	const position = geometry.getAttribute( 'position' );
	const index = new Uint16Array( position.count * 4 );
	const weight = new Float32Array( position.count * 4 );
	for ( let i = 0; i < position.count; i ++ ) {

		weigh( position.getX( i ) / height, position.getY( i ) / height ).forEach( ( [ bone, v ], k ) => {

			index[ i * 4 + k ] = bone;
			weight[ i * 4 + k ] = v;

		} );

	}

	geometry.setAttribute( 'skinIndex', new BufferAttribute( index, 4 ) );
	geometry.setAttribute( 'skinWeight', new BufferAttribute( weight, 4 ) );
	const body = new SkinnedMesh( geometry, mesh.material );
	body.name = 'Player';
	body.add( bones.hips );
	body.bind( new Skeleton( NAMES.map( name => bones[ name ] ) ) );
	body.userData.bones = bones;
	return body;

}

export function setUpPlayer( { scene, camera, controls, driver, getColliders } ) {

	let body = null;
	let thirdPerson = true;
	try {

		thirdPerson = localStorage.getItem( STORAGE_KEY ) !== 'first';

	} catch {

		// Third person, then.

	}

	let phase = 0;
	let moving = 0; // 0 standing still to 1 walking, eased
	let running = 0;
	let airborne = 0;
	let distance = CHASE.back;
	let heading = null; // which way he faces (yaw), turning to the way he walks in third person
	let shown = false;
	const eye = new Vector3();
	const saved = new Vector3();
	const raycaster = new Raycaster();
	raycaster.firstHitOnly = true;
	const _forward = new Vector3();
	const _right = new Vector3();
	const _want = new Vector3();
	const _dir = new Vector3();

	new GLTFLoader().loadAsync( URL_.href ).then( gltf => {

		let mesh = null;
		gltf.scene.traverse( object => {

			if ( object.isMesh && ! mesh ) mesh = object;

		} );
		if ( ! mesh ) return;
		body = rig( mesh );
		// Never in the way of walking, clicking or the camera's own check: only drawn.
		body.frustumCulled = false;
		body.raycast = () => {};
		body.userData.noCollide = true;
		body.visible = false;
		scene.add( body );

	} ).catch( err => console.warn( `The player's model didn't load: ${ err.message }` ) );

	window.addEventListener( 'keydown', e => {

		if ( e.code !== 'KeyC' || e.repeat || isTyping( e ) || e.ctrlKey || e.metaKey || e.altKey ) return;
		if ( controls.mode !== 'walk' || ! controls.enabled || driver?.active ) return;
		setThirdPerson( ! thirdPerson );

	} );

	function setThirdPerson( on ) {

		thirdPerson = on;
		distance = CHASE.nearest;
		try {

			localStorage.setItem( STORAGE_KEY, on ? 'third' : 'first' );

		} catch {

			// Just for now, then.

		}

	}

	// His pose for this frame: a step of the walk, by how far he went.
	function pose( dt ) {

		const { bones } = body.userData;
		const speed = Math.hypot( controls.velocity.x, controls.velocity.z );
		const ease = 1 - Math.exp( - dt * 10 );
		moving += ( Math.min( speed / 1.5, 1 ) - moving ) * ease;
		running += ( MathUtils.clamp( ( speed - PLAYER.walkSpeed ) / ( PLAYER.runSpeed - PLAYER.walkSpeed ), 0, 1 ) - running ) * ease;
		airborne += ( ( controls.grounded ? 0 : 1 ) - airborne ) * ease;
		const stride = MathUtils.lerp( STRIDE.walk, STRIDE.run, running );
		phase = ( phase + speed * dt / stride * Math.PI * 2 ) % ( Math.PI * 2 );
		const big = moving * ( 1 + ( SWING.run - 1 ) * running );
		const s = Math.sin( phase );
		const c = Math.cos( phase );
		// Forward is a turn about −x (the feet and hands hang below their joints).
		const legs = [ [ 'L', 1 ], [ 'R', - 1 ] ];
		for ( const [ side, k ] of legs ) {

			const swing = k * s;
			bones[ `thigh${ side }` ].rotation.x = MathUtils.lerp( - swing * SWING.thigh * big, - 0.55, airborne );
			// The knee bends as the leg comes through, never backwards.
			const bend = Math.max( 0, k * c ) * SWING.knee * big + 0.08 * moving;
			bones[ `shin${ side }` ].rotation.x = MathUtils.lerp( bend, 0.95, airborne );
			// The arm on the other side swings with the leg.
			bones[ `arm${ side }` ].rotation.x = swing * SWING.arm * big;
			bones[ `arm${ side }` ].rotation.z = k * 0.06;
			bones[ `forearm${ side }` ].rotation.x = - ( 0.12 + SWING.elbow * big * ( 0.5 + 0.5 * k * s ) );

		}

		bones.hips.position.y = bones.hips.userData.at.y - 0.03 * big * Math.abs( c ) - 0.06 * airborne;
		bones.spine.rotation.x = 0.08 * running * moving;
		bones.hips.rotation.y = 0.06 * s * big;
		bones.chest.rotation.y = - 0.1 * s * big;
		// In first person the head goes, so the camera isn't inside it.
		bones.head.scale.setScalar( thirdPerson ? 1 : 0.001 );

	}

	return {

		get thirdPerson() {

			return thirdPerson;

		},
		get loaded() {

			return !! body;

		},
		setThirdPerson,

		// Before the frame is drawn: him where the walker is, and the camera behind him in third person.
		beforeRender( dt ) {

			shown = !! body && controls.mode === 'walk' && controls.enabled && ! driver?.active;
			if ( body ) body.visible = shown;
			if ( ! shown ) return;
			eye.copy( camera.position );
			_forward.set( - Math.sin( controls.yaw ), 0, - Math.cos( controls.yaw ) );
			const behind = thirdPerson ? EYES_FORWARD.level : EYES_FORWARD.level + EYES_FORWARD.down * smooth( 0.35, 1.2, - controls.pitch );
			body.position.copy( eye ).addScaledVector( _forward, - behind );
			body.position.y = eye.y - PLAYER.eyeHeight;
			// He faces +z: turned to face the way he walks in third person (as he turns round to come
			// back toward you, say), the way you look in first person.
			const speed = Math.hypot( controls.velocity.x, controls.velocity.z );
			let want = heading ?? controls.yaw;
			if ( ! thirdPerson ) want = controls.yaw;
			else if ( speed > 0.6 ) want = Math.atan2( - controls.velocity.x, - controls.velocity.z );
			heading ??= want;
			const turn = Math.atan2( Math.sin( want - heading ), Math.cos( want - heading ) );
			heading = ! thirdPerson ? want : heading + turn * ( 1 - Math.exp( - dt * 10 ) );
			body.rotation.set( 0, heading + Math.PI, 0 );
			pose( dt );
			body.updateMatrixWorld( true );
			if ( ! thirdPerson ) return;

			// Back along the way the camera looks, up a little and over his right shoulder.
			camera.getWorldDirection( _dir );
			_right.set( Math.cos( controls.yaw ), 0, - Math.sin( controls.yaw ) );
			const from = _want.copy( eye ).addScaledVector( _right, CHASE.right ).setY( eye.y + CHASE.up - 0.15 );
			const back = _dir.clone().negate();
			raycaster.set( from, back );
			raycaster.far = CHASE.back + CHASE.margin;
			const hit = raycaster.intersectObjects( getColliders(), true ).find( blocks );
			const room = hit ? Math.max( CHASE.nearest, hit.distance - CHASE.margin ) : CHASE.back;
			// In at once when something's in the way, out again gently.
			distance = room < distance ? room : distance + ( room - distance ) * ( 1 - Math.exp( - dt * CHASE.ease ) );
			saved.copy( camera.position );
			camera.position.copy( from ).addScaledVector( back, distance );
			camera.updateMatrixWorld();

		},

		// After it's drawn: the camera back at his eyes.
		afterRender() {

			if ( ! shown || ! thirdPerson ) return;
			camera.position.copy( saved );
			camera.updateMatrixWorld();

		},
	};

}
