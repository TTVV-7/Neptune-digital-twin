import GUI from 'lil-gui';
import { MathUtils, Raycaster, Sphere, Vector2, Vector3 } from 'three';
import { VEHICLES } from './config.js';
import { headingToYaw, yawToHeading } from './geo.js';
import { Vehicle } from './vehicle.js';

const $ = id => document.getElementById( id );
const CHECK_SECONDS = 0.1;
const DRIVE_KEYS = [ 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight' ];
const DIRECTIONS = [ [ 'overhead', 'Overhead' ], [ 'left', 'Left' ], [ 'right', 'Right' ], [ 'ahead', 'Ahead' ], [ 'behind', 'Behind' ] ];
const _sphere = new Sphere();
const _target = new Vector3();

// Press T to drive a vehicle around the site and see whether it fits: clearances to your
// models (and, roughly, to Google's mesh), a warning colour, and the swept path it leaves.
export class DriveMode {

	constructor( { camera, controls, domElement, ground, models, tiles } ) {

		this.camera = camera;
		this.controls = controls;
		this.ground = ground;
		this.models = models;
		this.tiles = tiles;
		this.active = false;
		this.keys = new Set();
		this.distance = 20;
		this.checkTimer = 0;
		this.nearbyTiles = []; // Google tile meshes around the vehicle, when they count as obstacles
		this.settings = { vehicle: VEHICLES[ 0 ].name, margin: 0.5, google: false, sweptPath: true };

		this.vehicle = new Vehicle( {
			getGround: () => [ ground, models.group ],
			getObstacles: () => ( {
				rays: this.settings.google ? [ models.group, ...this.nearbyTiles ] : [ models.group ],
				exact: [ models.group ],
			} ),
		} );
		this.group = this.vehicle.group;
		this.trail = this.vehicle.trail;

		this.gui = this.createPanel();
		this.gui.hide();

		window.addEventListener( 'keydown', e => {

			if ( isTyping( e ) ) return;
			if ( e.code === 'KeyT' && ! e.repeat ) this.active ? this.exit() : this.enter();
			if ( ! this.active || ! DRIVE_KEYS.includes( e.code ) ) return;
			this.keys.add( e.code );
			e.preventDefault(); // no page scrolling on Space and the arrows

		} );
		window.addEventListener( 'keyup', e => this.keys.delete( e.code ) );
		window.addEventListener( 'blur', () => this.keys.clear() );
		domElement.addEventListener( 'wheel', e => {

			if ( ! this.active ) return;
			e.preventDefault();
			this.distance = MathUtils.clamp( this.distance * Math.exp( e.deltaY * 0.001 ), 4, 400 );

		}, { passive: false } );

	}

	enter() {

		if ( ! this.vehicle.bodies.length ) {

			// First time: check against Google's mesh only if there's no model of yours to check against.
			this.settings.google = this.models.entries.length === 0;
			this.gui.controllersRecursive().forEach( c => c.updateDisplay() );
			this.useSpec( this.settings.vehicle );
			this.placeInView();

		}

		this.active = true;
		this.controls.enabled = false;
		this.controls.yaw = 0; // the camera orbits relative to the vehicle, starting behind it
		this.controls.pitch = - 0.35;
		this.distance = Math.max( 15, this.totalLength() * 1.4 );
		this.checkTimer = 0;
		$( 'drive-hud' ).hidden = false;
		this.gui.show();

	}

	exit() {

		if ( ! this.active ) return;
		this.active = false;
		this.keys.clear();
		const yaw = this.cameraYaw();
		this.controls.enabled = true;
		this.controls.setMode( 'fly' );
		this.controls.setPose( this.camera.position.clone(), yawToHeading( yaw ), this.controls.pitch * MathUtils.RAD2DEG );
		$( 'drive-hud' ).hidden = true; // the vehicle stays parked, and its panel open, to look around it

	}

	useSpec( name ) {

		this.spec = structuredClone( VEHICLES.find( v => v.name === name ) ?? VEHICLES[ 0 ] );
		this.settings.vehicle = this.spec.name;
		this.gui.controllersRecursive().forEach( c => c.updateDisplay() );
		this.vehicle.setSpec( this.spec );
		this.vehicle.margin = this.settings.margin;
		this.rebuildSizeFolder?.();

	}

	// Park the vehicle on the ground where the camera is looking, facing the same way.
	placeInView() {

		const raycaster = new Raycaster();
		raycaster.setFromCamera( new Vector2(), this.camera );
		raycaster.far = 400;
		const hit = raycaster.intersectObjects( [ this.ground, this.models.group ], true )[ 0 ];
		const yaw = this.controls.enabled ? this.controls.yaw : this.cameraYaw();
		const position = hit ? hit.point : this.camera.position.clone().add( new Vector3( - Math.sin( yaw ), 0, - Math.cos( yaw ) ).multiplyScalar( 25 ) );
		this.vehicle.placeAt( position, yawToHeading( yaw ), Boolean( hit ) );

	}

	totalLength() {

		return this.spec.length + ( this.spec.trailer ? this.spec.trailer.length : 0 );

	}

	cameraYaw() {

		return headingToYaw( this.vehicle.bodies[ 0 ].heading ) + this.controls.yaw;

	}

	update( dt ) {

		if ( ! this.active ) return;

		const k = this.keys;
		const pressed = ( ...codes ) => codes.some( c => k.has( c ) ) ? 1 : 0;
		this.vehicle.drive( dt, {
			throttle: pressed( 'KeyW', 'ArrowUp' ) - pressed( 'KeyS', 'ArrowDown' ),
			steer: pressed( 'KeyD', 'ArrowRight' ) - pressed( 'KeyA', 'ArrowLeft' ),
			brake: k.has( 'Space' ),
			crawl: pressed( 'ShiftLeft', 'ShiftRight' ) === 1,
		} );

		this.checkTimer -= dt;
		if ( this.checkTimer <= 0 ) {

			this.checkTimer = CHECK_SECONDS;
			if ( this.settings.google ) this.indexNearbyTiles();
			this.vehicle.check();
			this.renderHud();

		}

		this.follow();

	}

	// Chase camera: mouse look orbits around the vehicle, the wheel zooms.
	follow() {

		const truck = this.vehicle.bodies[ 0 ].object;
		const controls = this.controls;
		controls.pitch = MathUtils.clamp( controls.pitch, - 1.5, 0.2 );
		const yaw = this.cameraYaw();
		const pitch = controls.pitch;
		_target.copy( truck.position ).setY( truck.position.y + this.spec.height * 0.8 );
		this.camera.position.set( - Math.sin( yaw ) * Math.cos( pitch ), Math.sin( pitch ), - Math.cos( yaw ) * Math.cos( pitch ) )
			.multiplyScalar( - this.distance )
			.add( _target );
		this.camera.rotation.set( pitch, yaw, 0, 'YXZ' );

	}

	// Collect the Google tile meshes around the vehicle, so rays go straight to them rather
	// than searching the whole tileset, and give them a collision index (a couple per check;
	// tiles have none of their own) so each ray is fast.
	indexNearbyTiles() {

		this.nearbyTiles = [];
		if ( ! this.tiles ) return;
		const centre = this.vehicle.bodies[ 0 ].object.position;
		const reach = this.totalLength() + 40;
		let built = 0;
		this.tiles.group.traverse( o => {

			if ( ! o.isMesh ) return;
			const geometry = o.geometry;
			if ( ! geometry.boundingSphere ) geometry.computeBoundingSphere();
			_sphere.copy( geometry.boundingSphere ).applyMatrix4( o.matrixWorld );
			if ( _sphere.distanceToPoint( centre ) > reach ) return;
			this.nearbyTiles.push( o );
			if ( ! geometry.boundsTree && built < 2 ) {

				geometry.computeBoundsTree();
				built ++;

			}

		} );

	}

	renderHud() {

		const { vehicle, settings } = this;
		const r = vehicle.result;
		const m = v => v === Infinity ? '-' : `${ v.toFixed( 1 ) } m`;
		const where = body => body === 'trailer' ? ' (trailer)' : '';

		$( 'drive-name' ).textContent = this.spec.name;
		$( 'drive-speed' ).textContent = `${ Math.abs( vehicle.speed * 3.6 ).toFixed( 0 ) } km/h${ vehicle.speed < - 0.05 ? ' reversing' : '' }`;

		const status = $( 'drive-status' );
		status.dataset.state = r.status;
		const closest = DIRECTIONS.map( ( [ key, label ] ) => ( { label, ...r[ key ] } ) ).sort( ( a, b ) => a.distance - b.distance )[ 0 ];
		status.textContent = r.status === 'touching' ? `TOUCHING${ where( r.touching ) }`
			: r.status === 'tight' ? `TIGHT: ${ closest.label.toLowerCase() } ${ m( closest.distance ) }${ where( closest.body ) }`
				: 'CLEAR';
		if ( vehicle.jackknifed ) status.textContent += ' · jackknifed';

		$( 'drive-clearances' ).replaceChildren( ...DIRECTIONS.map( ( [ key, label ] ) => {

			const row = document.createElement( 'tr' );
			const { distance, body } = r[ key ];
			row.dataset.state = distance < 0.05 ? 'touching' : distance < settings.margin ? 'tight' : 'clear';
			for ( const text of [ label, m( distance ), where( body ).trim() ] ) {

				const td = document.createElement( 'td' );
				td.textContent = text;
				row.append( td );

			}

			return row;

		} ) );

		const against = [ this.models.entries.length && 'your models', settings.google && 'Google mesh (rough, off by a metre or two)' ].filter( Boolean );
		$( 'drive-against' ).textContent = against.length ? `Checking against ${ against.join( ' and ' ) }.` : 'Nothing to check against: load your site model, or tick "Google mesh counts".';

	}

	createPanel() {

		const gui = new GUI( { title: 'Vehicle  (T)', container: $( 'right' ) } );
		const { settings, vehicle } = this;

		gui.add( settings, 'vehicle', VEHICLES.map( v => v.name ) ).onChange( name => this.useSpec( name ) );

		let size = null;
		this.rebuildSizeFolder = () => {

			size?.destroy();
			size = gui.addFolder( 'Size (m), approximate: set the real ones' );
			const rebuild = () => vehicle.setSpec( this.spec );
			const add = ( object, key, label, min, max, step ) => size.add( object, key, min, max, step ).name( label ).onFinishChange( rebuild );
			add( this.spec, 'length', 'length', 2, 40, 0.1 );
			add( this.spec, 'width', 'width', 1, 8, 0.05 );
			add( this.spec, 'height', 'height', 1, 10, 0.05 );
			add( this.spec, 'wheelbase', 'wheelbase', 1, 20, 0.1 );
			add( this.spec, 'frontOverhang', 'front overhang', 0, 6, 0.1 );
			add( this.spec, 'maxSteer', 'max steering (°)', 10, 50, 1 );
			if ( this.spec.trailer ) {

				add( this.spec.trailer, 'length', 'trailer / load length', 4, 40, 0.1 );
				add( this.spec.trailer, 'width', 'trailer / load width', 1, 8, 0.05 );
				add( this.spec.trailer, 'height', 'trailer / load height', 1, 10, 0.05 );
				add( this.spec.trailer, 'kingpinToAxle', 'kingpin to trailer axle', 3, 30, 0.1 );

			}

			size.close();

		};

		gui.add( settings, 'margin', 0, 2, 0.05 ).name( 'warn within (m)' ).onChange( v => vehicle.margin = v );
		gui.add( settings, 'google' ).name( 'Google mesh counts (rough)' );
		gui.add( settings, 'sweptPath' ).name( 'show swept path' ).onChange( v => vehicle.trail.visible = v );

		const actions = {
			clear: () => vehicle.trail.clear(),
			here: () => this.placeInView(),
			copy: () => copyText( JSON.stringify( this.spec, null, '\t' ) + ',' ),
			remove: () => {

				this.exit();
				vehicle.group.clear();
				vehicle.bodies = [];
				vehicle.trail.clear();
				gui.hide();

			},
		};
		gui.add( actions, 'clear' ).name( 'Clear swept path' );
		gui.add( actions, 'here' ).name( 'Move to where I\'m looking' );
		gui.add( actions, 'copy' ).name( 'Copy vehicle config' );
		gui.add( actions, 'remove' ).name( 'Remove vehicle' );

		return gui;

	}

}

function copyText( text ) {

	console.log( text );
	navigator.clipboard?.writeText( text ).catch( () => window.prompt( 'Copy this into VEHICLES in src/config.js:', text ) );

}

function isTyping( e ) {

	const t = e.target;
	return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t?.isContentEditable;

}
