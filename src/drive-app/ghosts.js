import { Box3, Group, MathUtils, Quaternion, Vector3 } from 'three';
import { createDriveFx } from '../drive-fx.js';
import { specFor } from '../drive.js';
import { frontToYaw } from '../library.js';
import { FLAGS, FLUSH_MS, INTERP_MS, STALE_MS, TELEPORT } from './live-protocol.js';
import { applyLook, cleanLook, fxOf } from './paint.js';

// The others driving with you (live.js): each a ghost of their ride, in their look from the Garage,
// drawn INTERP_MS behind the latest word of it so there's a position on either side of now to move
// between, with their boost, trail, drift sparks and spray, their name over it, a 📣 when they honk
// and their points when they land a trick. Ghosts are only to look at: they're in a group of their
// own, which nothing casts rays at (drive.js's colliders and camera, the ground, water and boost
// pad probes and the globe's picking all look at the tiles or the test pad), and none of their
// meshes can be hit anyway, so everyone drives through everyone.
//
// Their models are loaded as the Garage loads the turntable's (its builders, and models.js's loader
// with its decoders): a ride built in code is built for each, and a model from a file is read once
// and copied for each ghost in it, sharing its geometry and pictures until the last goes. Each ghost
// has materials of its own, so it can turn see-through on its own.

// The most drawn at once (the nearest), and of them the nearest with their effects, within FX_RANGE.
const MAX_DRAWN = 12;
const FX_COUNT = 6;
const FX_RANGE = 300;
// Names show this close (m).
const TAG_RANGE = 400;
// Within this of your car or the camera (m), a ghost is see-through, so it never blocks the view.
const FADE_NEAR = 8;
const FADE_OPACITY = 0.35;
// Past the latest word of a car, it goes on at its speed for at most this long (s), then waits.
const EXTRAPOLATE = 0.5;
// How long (ms) a honk's 📣 and a trick's points show.
const HONK_SHOW = 1600;
const POP_SHOW = 2200;
// How fast (ms a second) the estimate of the room's clock may fall back, as the way here slows.
const CLOCK_DRIFT = 20;

const _box = new Box3();
const _size = new Vector3();
const _centre = new Vector3();
const _earth = new Quaternion();
const _cam = new Vector3();
const _own = new Vector3();
const _v = new Vector3();
const _forward = new Vector3();
const _tag = new Vector3();
const noRay = () => {};

// scene: where the ghosts go; earth: the tiles' (or test globe's) group, whose matrixWorld takes
// Earth-centred positions into the scene as it is now; vehicles: loadVehicles()'; loader: the
// ModelManager's glTF loader; live: live.js's; tags: the element their names go in; own(): your
// car's pivot, or null.
export function createGhosts( { scene, earth, camera, vehicles, loader, live, tags, own } ) {

	const group = new Group();
	group.name = 'ghosts';
	scene.add( group );
	const byId = new Map( vehicles.map( vehicle => [ vehicle.id, vehicle ] ) );
	const ghosts = new Map();
	// Hidden from the list for this visit, by name (a pid is only one connection's).
	const hidden = new Set();
	// The room's clock less this page's (ms), as best as can be told: the largest difference seen,
	// which is when a message took least time to arrive.
	let offset = null;
	let offsetAt = 0;
	// Models read from a file, by address: { gltf, users }.
	const templates = new Map();
	const self = makeTag( { name: '', star: false } );
	self.root.classList.add( 'self' );

	live.on( 'welcome', ( { players } ) => {

		offset = null;
		for ( const p of players ) add( p );

	} );
	live.on( 'join', add );
	live.on( 'leave', ( { pid } ) => remove( pid ) );
	live.on( 'clear', () => {

		for ( const pid of [ ...ghosts.keys() ] ) remove( pid );
		offset = null;

	} );
	live.on( 'look', ( { pid, vehicle, look } ) => {

		const ghost = ghosts.get( pid );
		if ( ! ghost ) return;
		ghost.vehicle = vehicle;
		ghost.look = look;
		ghost.failed = false;
		// A new ride, or a new paint job: a new model (its look is part of it).
		ghost.loading = null;
		unload( ghost );

	} );
	live.on( 'place', ( { pid, place } ) => {

		const ghost = ghosts.get( pid );
		if ( ! ghost ) return;
		ghost.place = place;
		ghost.away = false;
		ghost.snaps.length = 0;

	} );
	live.on( 'away', ( { pid } ) => {

		const ghost = ghosts.get( pid );
		if ( ! ghost ) return;
		ghost.away = true;
		ghost.snaps.length = 0;

	} );
	live.on( 'states', ( { at, states } ) => {

		const now = performance.now();
		const sample = at - now;
		offset = offset === null ? sample : Math.max( sample, offset - ( now - offsetAt ) * CLOCK_DRIFT / 1000 );
		offsetAt = now;
		// The room sends what it was told in the last FLUSH_MS, all with the time it sent them: on
		// average from half that before.
		const local = at - FLUSH_MS / 2 - offset;
		for ( const { pid, s } of states ) push( ghosts.get( pid ), local, s );

	} );
	live.on( 'trick', ( { pid, score } ) => {

		const ghost = ghosts.get( pid );
		if ( ghost?.drawn ) show( ghost.tag.pop, `+${ score.toLocaleString( 'en-CA' ) }`, POP_SHOW );

	} );
	live.on( 'honk', ( { pid } ) => {

		const ghost = ghosts.get( pid );
		if ( ghost?.drawn ) show( ghost.tag.honk, '📣', HONK_SHOW );

	} );

	function add( p ) {

		remove( p.pid );
		const ghost = {
			pid: p.pid, name: p.name, star: p.star, vehicle: p.vehicle, look: p.look, place: p.place, away: p.away,
			snaps: [], heard: performance.now(),
			// Where it's drawn: Earth-centred, and in the scene; its flags and velocity (Earth-centred).
			p: new Vector3(), q: new Quaternion(), v: new Vector3(), flags: 0, scene: new Vector3(), distance: Infinity,
			model: null, loading: null, failed: false, fx: null, fxFlags: 0, faded: false, drawn: false,
			yaw: null, steer: 0, splashLevel: 0,
			tag: makeTag( p ),
		};
		ghosts.set( p.pid, ghost );
		if ( p.s && ! p.away ) push( ghost, performance.now(), p.s );

	}

	function remove( pid ) {

		const ghost = ghosts.get( pid );
		if ( ! ghost ) return;
		ghosts.delete( pid );
		ghost.loading = null;
		unload( ghost );
		ghost.tag.root.remove();

	}

	// A STATE heard of a car, as of `at` (this page's clock, ms).
	function push( ghost, at, s ) {

		if ( ! ghost ) return;
		ghost.heard = performance.now();
		const { snaps } = ghost;
		const last = snaps.at( - 1 );
		snaps.push( {
			at: last ? Math.max( at, last.at + 1 ) : at,
			p: new Vector3( s[ 0 ], s[ 1 ], s[ 2 ] ),
			q: new Quaternion( s[ 3 ], s[ 4 ], s[ 5 ], s[ 6 ] ).normalize(),
			v: new Vector3( s[ 7 ], s[ 8 ], s[ 9 ] ),
			flags: s[ 10 ],
		} );
		ghost.away = false;

	}

	// Where the car was at `at`: between the two words either side of then, or past the newest, on a
	// little at its speed. A jump of more than TELEPORT m isn't driven: it's there all at once. False
	// with no word of it at all.
	function sample( ghost, at ) {

		const { snaps } = ghost;
		// The one before `at` is all that's needed of those older.
		while ( snaps.length > 2 && snaps[ 1 ].at <= at ) snaps.shift();
		if ( snaps.length === 0 ) return false;
		const a = snaps[ 0 ].at <= at || snaps.length === 1 ? snaps[ 0 ] : null;
		const b = snaps[ 1 ];
		if ( ! a ) {

			// Older than anything heard: the oldest.
			setFrom( ghost, snaps[ 0 ], 0 );

		} else if ( ! b || b.at <= at ) {

			const last = b ?? a;
			setFrom( ghost, last, MathUtils.clamp( ( at - last.at ) / 1000, 0, EXTRAPOLATE ) );

		} else if ( a.p.distanceTo( b.p ) > TELEPORT ) setFrom( ghost, a, 0 );
		else {

			const u = ( at - a.at ) / ( b.at - a.at );
			ghost.p.lerpVectors( a.p, b.p, u );
			ghost.q.slerpQuaternions( a.q, b.q, u );
			ghost.v.lerpVectors( a.v, b.v, u );
			ghost.flags = a.flags;

		}

		return true;

	}

	function setFrom( ghost, snap, ahead ) {

		ghost.p.copy( snap.p ).addScaledVector( snap.v, ahead );
		ghost.q.copy( snap.q );
		ghost.v.copy( snap.v );
		ghost.flags = snap.flags;

	}

	// --- models ---

	function load( ghost ) {

		const vehicle = byId.get( ghost.vehicle ) ?? byId.get( 'go-kart' ) ?? vehicles[ 0 ];
		const job = build( vehicle, cleanLook( vehicle, ghost.look ) );
		ghost.loading = job;
		job.then( model => {

			if ( ghost.loading !== job || ghosts.get( ghost.pid ) !== ghost ) return dispose( model );
			ghost.loading = null;
			ghost.model = model;
			ghost.faded = false;
			model.pivot.visible = false;
			group.add( model.pivot );

		}, err => {

			if ( ghost.loading !== job ) return;
			// Their ride didn't load here: the kart stands in for it.
			console.warn( `World Drive: ${ vehicle.name } didn't load for a car driving with you.`, err );
			ghost.loading = null;
			ghost.failed = true;

		} );

	}

	// A ride's model for a ghost, as models.js would load it to drive: turned to face -Z and stood in
	// the middle of its footprint, then painted. { pivot, materials, templates, animators, size, wheels }.
	async function build( vehicle, look ) {

		const used = [];
		const copyOf = async url => {

			used.push( url );
			return ( await template( url ) ).scene.clone();

		};
		let content;
		try {

			if ( vehicle.build ) content = vehicle.build();
			else if ( vehicle.load ) content = await vehicle.load( { loadAsync: async url => ( { scene: await copyOf( url ) } ) } );
			else content = await copyOf( new URL( `library/${ vehicle.item.file }`, document.baseURI ).href );

		} catch ( err ) {

			for ( const url of used ) release( url );
			throw err;

		}

		const fromFile = ! vehicle.build && ! vehicle.load;
		content.rotation.y = fromFile ? frontToYaw( vehicle.item.front ) : 0;
		content.updateMatrixWorld( true );
		_box.setFromObject( content ).getCenter( _centre );
		content.position.set( - _centre.x, - _box.min.y, - _centre.z );
		const pivot = new Group();
		pivot.name = `ghost ${ vehicle.name }`;
		pivot.add( content );
		pivot.scale.setScalar( fromFile ? vehicle.item.scale ?? 1 : 1 );
		applyLook( pivot, look, vehicle );

		// Materials of its own, made from those it was built or painted with, and nothing to hit.
		const materials = new Map();
		const animators = [];
		const own = material => {

			if ( ! materials.has( material ) ) {

				const copy = material.clone();
				copy.userData = { opacity: copy.opacity, transparent: copy.transparent, depthWrite: copy.depthWrite };
				materials.set( material, copy );
				// One made just for this copy of a ride (not shared between copies, nor the file's) is
				// done with.
				if ( ! material.userData.shared && ! material.userData.template ) material.dispose();

			}

			return materials.get( material );

		};
		pivot.traverse( o => {

			o.raycast = noRay;
			if ( o.userData.onDrive ) animators.push( o.userData.onDrive );
			if ( o.material ) o.material = Array.isArray( o.material ) ? o.material.map( own ) : own( o.material );

		} );

		// Its size as drive.js measures it, for its effects: standing at the origin, unturned.
		pivot.updateMatrixWorld( true );
		_box.setFromObject( pivot ).getSize( _size );
		const size = { width: _size.x, height: _size.y, length: _size.z, rear: _box.max.z, scale: pivot.scale.x };
		const wheel = ( size.rear - size.length * 0.2 ) / size.scale;
		const track = size.width * 0.4 / size.scale;
		return {
			vehicle, pivot, materials: [ ...materials.values() ], templates: used, animators, size,
			wheels: [ new Vector3( - track, 0.05, wheel ), new Vector3( track, 0.05, wheel ) ],
			floats: !! specFor( vehicle.item ).floats,
		};

	}

	// A model from a file, read once for every ghost in it, until the last of them goes.
	function template( url ) {

		let entry = templates.get( url );
		if ( ! entry ) {

			entry = {
				users: 0,
				gltf: loader.loadAsync( url ).then( gltf => {

					gltf.scene.traverse( o => {

						if ( o.geometry ) o.geometry.userData.template = true;
						for ( const material of [ o.material ?? [] ].flat() ) material.userData.template = true;

					} );
					return gltf;

				} ),
			};
			templates.set( url, entry );
			entry.gltf.catch( () => templates.get( url ) === entry && templates.delete( url ) );

		}

		entry.users ++;
		return entry.gltf;

	}

	function release( url ) {

		const entry = templates.get( url );
		if ( ! entry || -- entry.users > 0 ) return;
		templates.delete( url );
		entry.gltf.then( gltf => gltf.scene.traverse( o => {

			o.geometry?.dispose();
			for ( const material of [ o.material ?? [] ].flat() ) {

				for ( const value of Object.values( material ) ) if ( value?.isTexture ) value.dispose();
				material.dispose();

			}

		} ) ).catch( () => {} );

	}

	// What a ghost owns goes: its effects, its model's own geometry (a ride's built parts, decals) and
	// materials, and its hold on the file the model was read from.
	function unload( ghost ) {

		dropFx( ghost );
		if ( ghost.model ) dispose( ghost.model );
		ghost.model = null;
		ghost.drawn = false;

	}

	function dispose( model ) {

		group.remove( model.pivot );
		model.pivot.traverse( o => {

			if ( o.geometry && ! o.geometry.userData.shared && ! o.geometry.userData.template ) o.geometry.dispose();

		} );
		for ( const material of model.materials ) material.dispose();
		for ( const url of model.templates ) release( url );

	}

	// --- effects ---

	function dropFx( ghost ) {

		ghost.fx?.dispose();
		ghost.fx = null;
		ghost.fxFlags = 0;

	}

	function updateFx( ghost, dt ) {

		const { model, flags } = ghost;
		const { pivot, size } = model;
		ghost.fx ??= createDriveFx( group, fxOf( cleanLook( model.vehicle, ghost.look ) ), { water: true } );
		const firing = flags & FLAGS.firing;
		const boosting = flags & FLAGS.boost;
		const speed = _v.length();
		// The boom as it goes supersonic, and the splash as it goes in.
		if ( flags & FLAGS.splash && ! ( ghost.fxFlags & FLAGS.splash ) ) {

			ghost.splashLevel = pivot.position.y;
			ghost.fx.splash( pivot.position, 0.6, Math.max( size.width, size.length * 0.6 ) );

		}

		ghost.fx.update( {
			pivot, size, wheels: model.wheels, velocity: _v,
			flame: firing ? 1 : boosting ? 0.55 : 0,
			trail: firing || boosting || flags & FLAGS.flying ? 1 : 0,
			drifting: !! ( flags & FLAGS.drift ),
			level: ( flags & FLAGS.levelMask ) >> FLAGS.levelShift,
			grounded: !! ( flags & FLAGS.grounded ),
			supersonic: !! ( flags & FLAGS.supersonic ),
			water: flags & FLAGS.splash ? { level: ghost.splashLevel, sinking: true } : flags & FLAGS.spray ? { level: pivot.position.y, spray: MathUtils.clamp( speed / 25, 0, 1 ) } : null,
			dt,
		} );
		if ( flags & FLAGS.supersonic && ! ( ghost.fxFlags & FLAGS.supersonic ) ) ghost.fx.boom();
		ghost.fxFlags = flags;

	}

	// --- each frame ---

	function place( ghost, dt ) {

		const { pivot, animators } = ghost.model;
		pivot.position.copy( ghost.scene );
		pivot.quaternion.copy( _earth ).multiply( ghost.q );
		pivot.updateMatrixWorld( true );
		_v.copy( ghost.v ).applyQuaternion( _earth );
		if ( ! animators.length || dt <= 0 ) return;
		// Its wheels turn with its speed along the way it faces, and steer by how fast it's turning.
		_forward.set( 0, 0, - 1 ).applyQuaternion( pivot.quaternion );
		const speed = _v.dot( _forward );
		const yaw = Math.atan2( - _forward.x, _forward.z );
		const rate = ghost.yaw === null ? 0 : MathUtils.euclideanModulo( yaw - ghost.yaw + Math.PI, Math.PI * 2 ) - Math.PI;
		ghost.yaw = yaw;
		const steer = MathUtils.clamp( rate / dt * 2 / Math.max( 2, Math.abs( speed ) ), - 1, 1 ) * Math.sign( speed || 1 );
		ghost.steer += ( steer - ghost.steer ) * Math.min( 1, dt * 8 );
		const airborne = !! ( ghost.flags & FLAGS.air );
		for ( const animate of animators ) animate( { steer: ghost.steer, speed, dt, airborne, vy: _v.y, throttle: speed > 1 } );

	}

	// See-through near your car or the camera: their own materials, so it's only this ghost.
	function fade( ghost, near ) {

		if ( near === ghost.faded ) return;
		ghost.faded = near;
		for ( const material of ghost.model.materials ) {

			const { opacity, transparent, depthWrite } = material.userData;
			material.transparent = near || transparent;
			material.opacity = near ? opacity * FADE_OPACITY : opacity;
			material.depthWrite = near ? false : depthWrite;
			material.needsUpdate = true;

		}

	}

	function update( dt, shown ) {

		const now = performance.now();
		const at = now - INTERP_MS;
		earth.updateWorldMatrix( true, false );
		_earth.setFromRotationMatrix( earth.matrixWorld );
		camera.getWorldPosition( _cam );
		const ownPivot = shown ? own() : null;
		ownPivot?.getWorldPosition( _own );

		const drawn = [];
		for ( const ghost of ghosts.values() ) {

			ghost.drawn = false;
			if ( ! shown || ghost.away || hidden.has( ghost.name ) || ! sample( ghost, at ) ) continue;
			// No word for STALE_MS: gone, unless its driver paused (parked, it stays).
			if ( now - ghost.heard > STALE_MS && ! ( ghost.flags & FLAGS.paused ) ) continue;
			ghost.scene.copy( ghost.p ).applyMatrix4( earth.matrixWorld );
			ghost.distance = ghost.scene.distanceTo( _cam );
			drawn.push( ghost );

		}

		drawn.sort( ( a, b ) => a.distance - b.distance );
		drawn.length = Math.min( drawn.length, MAX_DRAWN );
		drawn.forEach( ( ghost, rank ) => {

			ghost.drawn = true;
			if ( ghost.failed && ghost.vehicle !== 'go-kart' ) {

				ghost.vehicle = 'go-kart';
				ghost.failed = false;

			}

			if ( ! ghost.model && ! ghost.loading && ! ghost.failed ) load( ghost );
			if ( ! ghost.model ) return;
			place( ghost, dt );
			const near = ghost.faded ? FADE_NEAR + 2 : FADE_NEAR;
			fade( ghost, ghost.distance < near || ( !! ownPivot && ghost.scene.distanceTo( _own ) < near ) );
			const effects = ghost.fx ? rank < FX_COUNT + 2 && ghost.distance < FX_RANGE * 1.1 : rank < FX_COUNT && ghost.distance < FX_RANGE;
			if ( effects ) updateFx( ghost, dt );
			else dropFx( ghost );

		} );

		for ( const ghost of ghosts.values() ) {

			if ( ghost.model ) ghost.model.pivot.visible = ghost.drawn;
			if ( ! ghost.drawn ) dropFx( ghost );
			const height = ghost.model ? ghost.model.size.height : 1.5;
			placeTag( ghost.tag, ghost.drawn && ghost.distance < TAG_RANGE ? ghost.scene : null, height );

		}

		// Your own honk's 📣, over your car.
		if ( ownPivot && ! self.honk.hidden ) {

			_box.setFromObject( ownPivot ).getSize( _size );
			placeTag( self, _own, _size.y );

		} else placeTag( self, null, 0 );

	}

	// --- names over them ---

	function makeTag( { name, star } ) {

		const root = document.createElement( 'div' );
		root.className = 'live-tag';
		root.hidden = true;
		const honk = Object.assign( document.createElement( 'span' ), { className: 'honk', hidden: true } );
		const pop = Object.assign( document.createElement( 'span' ), { className: 'pop', hidden: true } );
		const label = Object.assign( document.createElement( 'span' ), { className: 'label' } );
		// Names are other people's: only ever text.
		label.append( Object.assign( document.createElement( 'b' ), { textContent: name } ) );
		if ( star ) label.append( Object.assign( document.createElement( 'span' ), { className: 'star', textContent: '⭐', title: 'Supporter' } ) );
		root.append( honk, pop, label );
		tags.append( root );
		return { root, honk, pop, shown: false, timers: new Map() };

	}

	// Over `at` (in the scene) by `height`, on screen, or hidden (null, behind the camera, off the
	// edge).
	function placeTag( tag, at, height ) {

		let on = !! at;
		if ( on ) {

			_tag.copy( at );
			_tag.y += height + 0.4;
			_tag.applyMatrix4( camera.matrixWorldInverse );
			on = _tag.z < 0;
			if ( on ) {

				_tag.applyMatrix4( camera.projectionMatrix );
				on = Math.abs( _tag.x ) < 1.1 && Math.abs( _tag.y ) < 1.1;

			}

		}

		if ( on !== tag.shown ) {

			tag.shown = on;
			tag.root.hidden = ! on;

		}

		if ( on ) tag.root.style.transform = `translate( ${ ( ( _tag.x + 1 ) / 2 * window.innerWidth ).toFixed( 1 ) }px, ${ ( ( 1 - _tag.y ) / 2 * window.innerHeight ).toFixed( 1 ) }px )`;

	}

	// A 📣 or a trick's points over a car for a moment, starting its little rise again each time.
	function show( element, text, ms ) {

		element.textContent = text;
		element.hidden = false;
		element.classList.remove( 'go' );
		void element.offsetWidth;
		element.classList.add( 'go' );
		clearTimeout( element.timer );
		element.timer = setTimeout( () => element.hidden = true, ms );

	}

	return {
		group,
		update,
		// Your honk, over your own car.
		honkSelf() {

			show( self.honk, '📣', HONK_SHOW );

		},
		// Hide a driver for this visit (by name, which outlasts a reconnect), or show them again.
		hide( name, on = true ) {

			if ( on ) hidden.add( name );
			else hidden.delete( name );

		},
		isHidden: name => hidden.has( name ),
		// How far (m) a driver's ghost is from your car (or the camera, without one), or null if it
		// isn't drawn.
		distanceTo( pid ) {

			const ghost = ghosts.get( pid );
			if ( ! ghost?.drawn ) return null;
			const ownPivot = own();
			return ownPivot ? ghost.scene.distanceTo( ownPivot.getWorldPosition( _own ) ) : ghost.distance;

		},
		// For the tests and the console: each ghost as drawn.
		list() {

			return [ ...ghosts.values() ].map( ghost => ( {
				pid: ghost.pid, name: ghost.name, star: ghost.star, vehicle: ghost.model?.vehicle.id ?? null, wanted: ghost.vehicle,
				drawn: ghost.drawn, visible: !! ghost.model?.pivot.visible, away: ghost.away, paused: !! ( ghost.flags & FLAGS.paused ),
				flags: ghost.flags, faded: ghost.faded, fx: !! ghost.fx,
				position: ghost.model ? ghost.model.pivot.position.toArray() : null,
				quaternion: ghost.model ? ghost.model.pivot.quaternion.toArray() : null,
				tag: ghost.tag.root,
			} ) );

		},
		get size() {

			return ghosts.size;

		},
	};

}
