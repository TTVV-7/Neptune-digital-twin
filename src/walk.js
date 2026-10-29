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
// When the ground ray finds nothing, look for a surface this far above the feet. That
// rescues the player after flying into the ground or when sharper tiles load in higher up.
const RECOVERY_HEIGHT = 50;
const HEAD_CLEARANCE = 0.1;

// First-person controller. Walk mode has gravity and bumps into things;
// fly mode goes wherever you look and ignores collisions.
export class WalkController {

	constructor( camera, domElement, getColliders ) {

		this.camera = camera;
		this.domElement = domElement;
		this.getColliders = getColliders;

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

		let feetY = pos.y - PLAYER.eyeHeight;
		let groundY = this.groundBelow( pos.x, feetY + PLAYER.stepHeight, pos.z );

		if ( groundY === null ) {

			// Nothing under the feet: either the tiles are still streaming in, or the feet are
			// below the surface (flew into the ground, or a sharper tile loaded in higher up).
			const above = this.groundBelow( pos.x, feetY + RECOVERY_HEIGHT, pos.z );
			this.groundFound = above !== null;
			this.velocityY = 0;
			if ( above !== null && above > feetY ) {

				pos.y = above + PLAYER.eyeHeight;
				this.grounded = true;

			}

			return;

		}

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

	groundBelow( x, y, z ) {

		_origin.set( x, y, z );
		const hit = this.cast( _origin, DOWN, 5000 );
		return hit ? hit.point.y : null;

	}

	cast( origin, direction, far ) {

		this.raycaster.set( origin, direction );
		this.raycaster.far = far;
		const hits = this.raycaster.intersectObjects( this.getColliders(), true );
		// Lines and points in user models have fat pick thresholds; only solid meshes block.
		return hits.find( hit => hit.object.isMesh ) ?? null;

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
