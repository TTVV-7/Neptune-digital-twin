import { MathUtils, Raycaster, Vector3 } from 'three';
import { PLAYER } from './config.js';
import { headingToYaw } from './geo.js';

const UP = new Vector3( 0, 1, 0 );
const DOWN = new Vector3( 0, - 1, 0 );
const _origin = new Vector3();
const _dir = new Vector3();
const _move = new Vector3();
const _stepMove = new Vector3();
const _forward = new Vector3();
const _right = new Vector3();

// Walk physics runs in sub-steps of at most this much horizontal movement, so slopes and
// ledges behave the same at 10 fps as at 60 fps.
const MAX_SUBSTEP_DISTANCE = 0.25;
const MAX_SUBSTEPS = 8;
// Look this far above the feet for a surface the player has ended up underneath, e.g. after
// flying into the ground or when sharper tiles load in higher up.
const RECOVERY_HEIGHT = 50;
// How long nothing may be under the feet before that counts as being buried rather than
// stepping over a crack in the mesh.
const NO_GROUND_GRACE = 0.3;
const HEAD_CLEARANCE = 0.1;

// First-person controller. Walk mode has gravity and bumps into things;
// fly mode goes wherever you look and ignores collisions.
export class WalkController {

	// getColliders: everything that blocks the player. getGround: the base terrain only (the
	// tiles), used to tell when the player has ended up underneath it. isInsideModel: true when
	// a point is within one of your own models, where being under a roof is expected.
	constructor( camera, domElement, { getColliders, getGround, isInsideModel } ) {

		this.camera = camera;
		this.domElement = domElement;
		this.getColliders = getColliders;
		this.getGround = getGround;
		this.isInsideModel = isInsideModel;

		this.mode = 'fly';
		this.yaw = 0;
		this.pitch = 0;
		this.velocityY = 0;
		this.grounded = false;
		this.groundFound = false;
		this.locked = false;
		// The mesh the player is standing on, and whether to check for being buried next step.
		this.standingOn = null;
		this.checkBuried = false;
		this.noGroundTime = 0;

		this.keys = new Set();
		this.raycaster = new Raycaster();
		this.raycaster.firstHitOnly = true;

		// Wall probes from just above step height up to the top of the head, at most 0.3 m apart.
		const low = PLAYER.stepHeight + 0.05;
		const high = PLAYER.eyeHeight + HEAD_CLEARANCE;
		const count = Math.max( 2, Math.ceil( ( high - low ) / 0.3 ) + 1 );
		this.probeHeights = Array.from( { length: count }, ( _, i ) => low + ( high - low ) * i / ( count - 1 ) );

		this._onKeyDown = e => {

			if ( e.key === 'Meta' ) this.keys.clear();
			if ( isTyping( e ) || e.ctrlKey || e.metaKey || e.altKey ) return;

			// Space would otherwise press whichever panel button or checkbox has focus.
			if ( e.code === 'Space' ) e.preventDefault();
			this.keys.add( e.code );
			if ( e.code === 'KeyF' && ! e.repeat ) this.toggleMode();
			if ( e.code === 'Space' && this.mode === 'walk' && this.grounded ) {

				this.velocityY = PLAYER.jumpSpeed;
				this.grounded = false;

			}

		};
		this._onKeyUp = e => {

			if ( e.key === 'Meta' ) this.keys.clear();
			if ( e.code === 'Space' && ! isTyping( e ) ) e.preventDefault();
			this.keys.delete( e.code );

		};
		this._onBlur = () => this.keys.clear();
		this._onMouseMove = e => {

			if ( ! this.locked ) return;
			this.yaw -= e.movementX * 0.002;
			this.pitch -= e.movementY * 0.002;
			this.pitch = MathUtils.clamp( this.pitch, - Math.PI / 2 + 0.01, Math.PI / 2 - 0.01 );

		};
		this._onClick = () => {

			// Hand the keyboard back to the scene after using the panel.
			document.activeElement?.blur?.();
			domElement.requestPointerLock();

		};
		this._onLockChange = () => {

			this.locked = document.pointerLockElement === domElement;
			this.onLockChange?.( this.locked );

		};

		// Capture phase, because lil-gui stops key events from bubbling out of its controls.
		window.addEventListener( 'keydown', this._onKeyDown, true );
		window.addEventListener( 'keyup', this._onKeyUp, true );
		window.addEventListener( 'blur', this._onBlur );
		document.addEventListener( 'mousemove', this._onMouseMove );
		document.addEventListener( 'pointerlockchange', this._onLockChange );
		domElement.addEventListener( 'click', this._onClick );

	}

	setPose( position, heading, pitch ) {

		this.camera.position.copy( position );
		this.yaw = headingToYaw( heading );
		this.pitch = pitch * MathUtils.DEG2RAD;
		this.applyRotation();

	}

	setMode( mode ) {

		this.mode = mode;
		this.velocityY = 0;
		this.grounded = false;
		this.standingOn = null;
		// Flying has no collisions, so the player may have flown into the ground.
		this.checkBuried = mode === 'walk';
		this.onModeChange?.( mode );

	}

	toggleMode() {

		this.setMode( this.mode === 'fly' ? 'walk' : 'fly' );

	}

	applyRotation() {

		this.camera.rotation.set( this.pitch, this.yaw, 0, 'YXZ' );

	}

	update( dt ) {

		this.applyRotation();

		const { keys } = this;
		const fwd = ( keys.has( 'KeyW' ) || keys.has( 'ArrowUp' ) ? 1 : 0 ) - ( keys.has( 'KeyS' ) || keys.has( 'ArrowDown' ) ? 1 : 0 );
		const strafe = ( keys.has( 'KeyD' ) || keys.has( 'ArrowRight' ) ? 1 : 0 ) - ( keys.has( 'KeyA' ) || keys.has( 'ArrowLeft' ) ? 1 : 0 );
		const fast = keys.has( 'ShiftLeft' ) || keys.has( 'ShiftRight' );

		if ( this.mode === 'fly' ) {

			const rise = ( keys.has( 'Space' ) || keys.has( 'KeyE' ) ? 1 : 0 ) - ( keys.has( 'KeyC' ) || keys.has( 'KeyQ' ) ? 1 : 0 );
			const speed = PLAYER.flySpeed * ( fast ? PLAYER.flyBoost : 1 );
			const cosPitch = Math.cos( this.pitch );
			_forward.set( - Math.sin( this.yaw ) * cosPitch, Math.sin( this.pitch ), - Math.cos( this.yaw ) * cosPitch );
			_right.set( Math.cos( this.yaw ), 0, - Math.sin( this.yaw ) );
			_move.set( 0, 0, 0 )
				.addScaledVector( _forward, fwd )
				.addScaledVector( _right, strafe );
			_move.y += rise;
			if ( _move.lengthSq() > 0 ) _move.normalize().multiplyScalar( speed * dt );
			this.camera.position.add( _move );
			return;

		}

		// Walk mode.
		const speed = fast ? PLAYER.runSpeed : PLAYER.walkSpeed;
		_forward.set( - Math.sin( this.yaw ), 0, - Math.cos( this.yaw ) );
		_right.set( Math.cos( this.yaw ), 0, - Math.sin( this.yaw ) );
		_move.set( 0, 0, 0 )
			.addScaledVector( _forward, fwd )
			.addScaledVector( _right, strafe );
		if ( _move.lengthSq() > 0 ) _move.normalize();

		const moving = _move.lengthSq() > 0;
		const steps = moving ? MathUtils.clamp( Math.ceil( speed * dt / MAX_SUBSTEP_DISTANCE ), 1, MAX_SUBSTEPS ) : 1;
		const h = dt / steps;
		_stepMove.copy( _move ).multiplyScalar( speed * h );
		for ( let i = 0; i < steps; i ++ ) this.stepWalk( h, moving ? _stepMove : null );

	}

	stepWalk( h, move ) {

		const pos = this.camera.position;
		if ( move ) this.moveWithCollisions( move );

		if ( this.checkBuried ) {

			this.checkBuried = false;
			if ( this.liftIfBuried() ) return;

		}

		let feetY = pos.y - PLAYER.eyeHeight;
		const ground = this.groundHit( pos.x, feetY + PLAYER.stepHeight, pos.z );

		if ( ! ground ) {

			// Nothing under the feet: a crack in the mesh (keep going), the tiles still streaming
			// in (hover), or the feet are below the surface.
			this.velocityY = 0;
			this.noGroundTime += h;
			if ( this.noGroundTime >= NO_GROUND_GRACE ) this.groundFound = this.liftIfBuried();
			return;

		}

		this.noGroundTime = 0;
		const groundY = ground.point.y;

		// The floor dropped away under a standing player and a different mesh is below: usually the
		// tile was swapped for a sharper one whose surface is now above the feet. Google's mesh often
		// has a second layer underneath (water under the berth deck) that would otherwise catch them.
		if ( this.grounded && ground.object !== this.standingOn && groundY < feetY - PLAYER.stepHeight && this.liftIfBuried() ) return;

		this.groundFound = true;
		this.velocityY -= PLAYER.gravity * h;
		let newFeetY = feetY + this.velocityY * h;

		// Stop at ceilings when rising.
		if ( this.velocityY > 0 ) {

			_origin.set( pos.x, pos.y, pos.z );
			const hit = this.cast( _origin, UP, newFeetY - feetY + HEAD_CLEARANCE );
			if ( hit ) {

				newFeetY = Math.min( newFeetY, hit.point.y - PLAYER.eyeHeight - HEAD_CLEARANCE );
				this.velocityY = 0;

			}

		}

		const wasGrounded = this.grounded;
		if ( newFeetY <= groundY ) {

			newFeetY = groundY;
			this.velocityY = 0;
			this.grounded = true;

		} else if ( wasGrounded && this.velocityY <= 0 && feetY - groundY <= PLAYER.stepHeight ) {

			// Follow the ground down slopes and small steps instead of hopping off them.
			newFeetY = groundY;
			this.velocityY = 0;

		} else {

			this.grounded = false;

		}

		this.standingOn = this.grounded ? ground.object : null;
		feetY = newFeetY;
		pos.y = feetY + PLAYER.eyeHeight;

	}

	// Try the full move, then slide along each axis if something is in the way.
	moveWithCollisions( move ) {

		const pos = this.camera.position;
		const feetY = pos.y - PLAYER.eyeHeight;

		const tryMove = ( dx, dz ) => {

			const len = Math.hypot( dx, dz );
			if ( len === 0 ) return false;
			_dir.set( dx / len, 0, dz / len );
			for ( const height of this.probeHeights ) {

				_origin.set( pos.x, feetY + height, pos.z );
				if ( this.cast( _origin, _dir, len + PLAYER.radius ) ) return false;

			}

			pos.x += dx;
			pos.z += dz;
			return true;

		};

		if ( tryMove( move.x, move.z ) ) return;
		if ( tryMove( move.x, 0 ) ) return;
		tryMove( 0, move.z );

	}

	// If the feet are under a surface that can only be seen from above (the inside of the ground),
	// move up onto the nearest such surface. Only called when being buried is likely (after
	// flying, when the floor drops away, or when there's no ground), since a roof mesh without an
	// underside looks the same. A ceiling that faces down at the player, such as the underside of
	// a conveyor gallery, or being inside one of your own models, means they belong underneath.
	liftIfBuried() {

		const pos = this.camera.position;
		const feetY = pos.y - PLAYER.eyeHeight;

		_origin.set( pos.x, feetY + PLAYER.stepHeight, pos.z );
		if ( this.isInsideModel( _origin ) || this.cast( _origin, UP, RECOVERY_HEIGHT ) ) return false;

		_origin.set( pos.x, feetY + RECOVERY_HEIGHT, pos.z );
		this.raycaster.firstHitOnly = false;
		const hits = this.castAll( _origin, DOWN, RECOVERY_HEIGHT - PLAYER.stepHeight, this.getGround() );
		this.raycaster.firstHitOnly = true;
		if ( hits.length === 0 ) return false;

		// Hits are sorted top-down, so the last one is the surface nearest above the feet.
		const surface = hits[ hits.length - 1 ];
		pos.y = surface.point.y + PLAYER.eyeHeight;
		this.velocityY = 0;
		this.grounded = true;
		this.standingOn = surface.object;
		return true;

	}

	groundHit( x, y, z ) {

		_origin.set( x, y, z );
		return this.cast( _origin, DOWN, 5000 );

	}

	cast( origin, direction, far ) {

		return this.castAll( origin, direction, far )[ 0 ] ?? null;

	}

	castAll( origin, direction, far, objects = this.getColliders() ) {

		this.raycaster.set( origin, direction );
		this.raycaster.far = far;
		// Lines and points in user models have fat pick thresholds; only solid meshes block.
		return this.raycaster.intersectObjects( objects, true ).filter( hit => hit.object.isMesh );

	}

	dispose() {

		window.removeEventListener( 'keydown', this._onKeyDown, true );
		window.removeEventListener( 'keyup', this._onKeyUp, true );
		window.removeEventListener( 'blur', this._onBlur );
		document.removeEventListener( 'mousemove', this._onMouseMove );
		document.removeEventListener( 'pointerlockchange', this._onLockChange );
		this.domElement.removeEventListener( 'click', this._onClick );

	}

}

// True while the user is typing in a text field, where keys must not move the player.
// Buttons and checkboxes don't count: those keep focus after a click.
export function isTyping( e ) {

	const t = e.target;
	if ( t instanceof HTMLTextAreaElement || t?.isContentEditable ) return true;
	return t instanceof HTMLInputElement && ! [ 'button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color' ].includes( t.type );

}
