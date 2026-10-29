import { MathUtils, Raycaster, Vector3 } from 'three';
import { PLAYER } from './config.js';
import { headingToYaw } from './geo.js';

const DOWN = new Vector3( 0, - 1, 0 );
const _origin = new Vector3();
const _dir = new Vector3();
const _move = new Vector3();
const _forward = new Vector3();
const _right = new Vector3();

// First-person controller. Walk mode has gravity and bumps into things;
// fly mode goes wherever you look and ignores collisions.
export class WalkController {

	constructor( camera, domElement, getColliders ) {

		this.camera = camera;
		this.domElement = domElement;
		this.getColliders = getColliders;

		this.enabled = true; // false while something else (driving) has the keys
		this.mode = 'fly';
		this.yaw = 0;
		this.pitch = 0;
		this.velocityY = 0;
		this.grounded = false;
		this.groundFound = false;
		this.locked = false;

		this.keys = new Set();
		this.raycaster = new Raycaster();
		this.raycaster.firstHitOnly = true;

		this._onKeyDown = e => {

			if ( isTyping( e ) || ! this.enabled ) return;
			this.keys.add( e.code );
			if ( e.code === 'Space' ) e.preventDefault();
			if ( e.code === 'KeyF' && ! e.repeat ) this.toggleMode();
			if ( e.code === 'Space' && this.mode === 'walk' && this.grounded ) {

				this.velocityY = PLAYER.jumpSpeed;
				this.grounded = false;

			}

		};
		this._onKeyUp = e => this.keys.delete( e.code );
		this._onBlur = () => this.keys.clear();
		this._onMouseMove = e => {

			if ( ! this.locked ) return;
			this.yaw -= e.movementX * 0.002;
			this.pitch -= e.movementY * 0.002;
			this.pitch = MathUtils.clamp( this.pitch, - Math.PI / 2 + 0.01, Math.PI / 2 - 0.01 );

		};
		// onClick can claim a click (e.g. on a ship) so it doesn't capture the mouse.
		this._onClick = e => {

			if ( this.onClick?.( e ) ) return;
			domElement.requestPointerLock();

		};
		this._onLockChange = () => {

			this.locked = document.pointerLockElement === domElement;
			this.onLockChange?.( this.locked );

		};

		window.addEventListener( 'keydown', this._onKeyDown );
		window.addEventListener( 'keyup', this._onKeyUp );
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

		// Walk mode: horizontal movement first, then gravity and ground snapping.
		const speed = fast ? PLAYER.runSpeed : PLAYER.walkSpeed;
		_forward.set( - Math.sin( this.yaw ), 0, - Math.cos( this.yaw ) );
		_right.set( Math.cos( this.yaw ), 0, - Math.sin( this.yaw ) );
		_move.set( 0, 0, 0 )
			.addScaledVector( _forward, fwd )
			.addScaledVector( _right, strafe );
		if ( _move.lengthSq() > 0 ) {

			_move.normalize().multiplyScalar( speed * dt );
			this.moveWithCollisions( _move );

		}

		const feetY = this.camera.position.y - PLAYER.eyeHeight;
		const groundY = this.groundBelow( this.camera.position.x, feetY + PLAYER.stepHeight, this.camera.position.z );
		this.groundFound = groundY !== null;

		if ( groundY === null ) {

			// Nothing underneath yet (tiles still streaming in): hover instead of falling forever.
			this.velocityY = 0;
			return;

		}

		this.velocityY -= PLAYER.gravity * dt;
		let newFeetY = feetY + this.velocityY * dt;
		if ( newFeetY <= groundY ) {

			newFeetY = groundY;
			this.velocityY = 0;
			this.grounded = true;

		} else {

			this.grounded = false;

		}

		this.camera.position.y = newFeetY + PLAYER.eyeHeight;

	}

	// Try the full move, then slide along each axis if something is in the way.
	moveWithCollisions( move ) {

		const pos = this.camera.position;
		const chestY = pos.y - PLAYER.eyeHeight + Math.max( PLAYER.stepHeight + 0.2, 1 );

		const tryMove = ( dx, dz ) => {

			const len = Math.hypot( dx, dz );
			if ( len === 0 ) return false;
			_origin.set( pos.x, chestY, pos.z );
			_dir.set( dx / len, 0, dz / len );
			if ( this.cast( _origin, _dir, len + PLAYER.radius ) ) return false;
			pos.x += dx;
			pos.z += dz;
			return true;

		};

		if ( tryMove( move.x, move.z ) ) return;
		if ( tryMove( move.x, 0 ) ) return;
		tryMove( 0, move.z );

	}

	groundBelow( x, y, z ) {

		_origin.set( x, y, z );
		const hit = this.cast( _origin, DOWN, 5000 );
		return hit ? hit.point.y : null;

	}

	cast( origin, direction, far ) {

		this.raycaster.set( origin, direction );
		this.raycaster.far = far;
		const hits = this.raycaster.intersectObjects( this.getColliders(), true );
		return hits.length ? hits[ 0 ] : null;

	}

	dispose() {

		window.removeEventListener( 'keydown', this._onKeyDown );
		window.removeEventListener( 'keyup', this._onKeyUp );
		window.removeEventListener( 'blur', this._onBlur );
		document.removeEventListener( 'mousemove', this._onMouseMove );
		document.removeEventListener( 'pointerlockchange', this._onLockChange );
		this.domElement.removeEventListener( 'click', this._onClick );

	}

}

function isTyping( e ) {

	const t = e.target;
	return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t?.isContentEditable;

}
