import {
	BoxGeometry,
	BufferGeometry,
	CanvasTexture,
	ConeGeometry,
	ExtrudeGeometry,
	Group,
	LineBasicMaterial,
	LineLoop,
	MathUtils,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	PlaneGeometry,
	Raycaster,
	Shape,
	Vector3,
} from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { AIS, BERTHS } from './config.js';
import { enuToLocal, headingToYaw, latLonToEnu } from './geo.js';

const POLL_SECONDS = 10;
const KNOTS = 0.514444; // metres per second
const EARTH_RADIUS = 6371000;
const SINK = 3; // metres of hull below the water line, so Google's uneven water shows no gap
const MIN_BERTH_SHIP = 60; // metres; tugs and launches alongside don't count as occupying a berth
// Moored ships only report every few minutes, so a berth isn't called free until the feed
// has been listening this long, and only while reports keep coming in.
const SETTLE_SECONDS = 240;
const QUIET_SECONDS = 300;
const WATER_COLOR = 0x2e5878; // Google's water around the berths
// Open water near the terminal, sampled to find the height of Google's water surface.
const WATER_POINTS = [ [ 0, - 700 ], [ - 300, - 650 ], [ 300, - 650 ], [ - 800, - 600 ], [ 800, - 700 ] ];

const COLORS = { cargo: 0x2f9e5f, tanker: 0xc4473a, passenger: 0x3b74d6, service: 0xe0902a, pleasure: 0x9a63d8, fishing: 0xd85aa0, other: 0x8d959c };
// Length and beam used until a vessel has broadcast its real size.
const DEFAULT_SIZE = { cargo: [ 180, 30 ], tanker: [ 180, 32 ], passenger: [ 60, 15 ], service: [ 25, 9 ], pleasure: [ 10, 3.5 ], fishing: [ 15, 5 ], other: [ 15, 5 ] };

const DOWN = new Vector3( 0, - 1, 0 );
const _matrix = new Matrix4();

// Ships from AIS, the berths they occupy, and a patch of water over the ships that Google
// happened to photograph at the berths. Data comes from /api/ais (see server/ais.js).
export class VesselLayer {

	constructor( { getGround, flattener = null } ) {

		this.group = new Group();
		this.group.name = 'vessels';
		this.water = new Group(); // stays visible when the ships are hidden
		this.water.name = 'berth water';

		this.getGround = getGround;
		this.flattener = flattener;
		this.raycaster = new Raycaster();
		this.vessels = new Map(); // MMSI -> { data, mesh, label, centre, heading, length, beam, height }
		this.status = { state: 'loading' };
		this.listenedFor = 0;
		this.quietFor = Infinity;
		this.receivedAt = 0;
		this.selected = null;
		this.waterY = null;
		this.waterTimer = 0;
		this.hidingGoogleShips = false;
		this.materials = new Map();

		this.marker = new Mesh( new ConeGeometry( 4, 10, 16 ).rotateX( Math.PI ).translate( 0, 5, 0 ), new MeshBasicMaterial( { color: 0xffd23f } ) );
		this.marker.visible = false;
		this.group.add( this.marker );

		this.berths = BERTHS.map( config => this.addBerth( config ) );

	}

	start() {

		// Where there is no feed (a static or hosted copy), check back only once a minute.
		const next = () => setTimeout( async () => {

			await this.poll();
			next();

		}, this.status.state === 'unavailable' ? 60000 : POLL_SECONDS * 1000 );
		this.poll().then( next );

	}

	async poll() {

		try {

			const res = await fetch( 'api/ais', { cache: 'no-store' } );
			if ( ! res.ok || ! res.headers.get( 'content-type' )?.includes( 'json' ) ) throw new Error( `HTTP ${ res.status }` );
			const { now, status, vessels } = await res.json();
			this.status = status;
			this.listenedFor = status.listeningSince ? ( now - status.listeningSince ) / 1000 : 0;
			this.quietFor = status.lastMessageAt ? ( now - status.lastMessageAt ) / 1000 : this.listenedFor;
			this.receivedAt = performance.now();
			this.sync( vessels );

		} catch {

			// A static build has no /api/ais; the dev server does.
			this.status = { state: 'unavailable' };
			this.listenedFor = 0;

		}

		this.updateBerths();
		this.updateGoogleShips();
		this.onUpdate?.();

	}

	get visible() {

		return this.group.visible;

	}

	set visible( value ) {

		this.group.visible = value;
		for ( const v of this.vessels.values() ) v.label.visible = value;
		for ( const b of this.berths ) b.label.visible = value;

	}

	// --- vessels ---

	sync( list ) {

		const seen = new Set();
		for ( const data of list ) {

			if ( data.age > AIS.hideAfterHours * 3600 ) continue;
			seen.add( data.mmsi );
			const v = this.vessels.get( data.mmsi ) ?? this.addVessel( data );
			this.refresh( v, data );

		}

		for ( const [ mmsi, v ] of this.vessels ) {

			if ( ! seen.has( mmsi ) ) this.removeVessel( v );

		}

	}

	addVessel( data ) {

		const mesh = new Mesh( SHIP );
		const label = makeLabel( 'vessel-label', '', () => this.select( data.mmsi ) );
		const v = { mesh, label, heading: null };
		mesh.userData.vessel = v;
		label.visible = this.visible;
		this.group.add( mesh, label );
		this.vessels.set( data.mmsi, v );
		return v;

	}

	removeVessel( v ) {

		this.group.remove( v.mesh, v.label );
		v.label.element.remove();
		this.vessels.delete( v.data.mmsi );
		if ( this.selected === v.data.mmsi ) this.select( null );

	}

	get settled() {

		return this.listenedFor > SETTLE_SECONDS && this.quietFor < QUIET_SECONDS;

	}

	refresh( v, data ) {

		v.data = data;
		const kind = category( data.type );
		const dim = data.dimension;
		const antenna = latLonToEnu( data.lat, data.lon );
		// A big-ship (class A) transponder sitting in a berth is a ship, even before it has sent its size.
		const inBerth = data.class === 'A' && this.berthAt( antenna.east, antenna.north );
		const [ length, beam ] = DEFAULT_SIZE[ kind === 'other' && inBerth ? 'cargo' : kind ];
		v.sizeKnown = Boolean( dim );
		v.length = dim ? dim.a + dim.b : length;
		v.beam = dim && dim.c + dim.d > 0 ? dim.c + dim.d : ( dim ? Math.max( 3, v.length / 6.5 ) : beam );
		v.height = MathUtils.clamp( v.length * 0.055, 1, 14 );
		v.stale = data.age > AIS.staleMinutes * 60;

		// Heading: the ship's own compass if it reports one, else its course over ground while
		// moving, else the line of the berth it's in.
		const moving = data.sog >= 0.5;
		v.heading = data.heading ?? ( moving ? data.cog : null ) ?? this.berthAt( antenna.east, antenna.north )?.heading ?? v.heading ?? 0;

		// AIS reports the GPS antenna, A metres from the bow, B from the stern, C from port and
		// D from starboard. The hull is drawn around its centre.
		const forward = dim ? ( dim.a - dim.b ) / 2 : 0;
		const starboard = dim ? ( dim.d - dim.c ) / 2 : 0;
		const h = v.heading * MathUtils.DEG2RAD;
		v.centre = {
			east: antenna.east + Math.sin( h ) * forward + Math.cos( h ) * starboard,
			north: antenna.north + Math.cos( h ) * forward - Math.sin( h ) * starboard,
		};

		v.mesh.geometry = v.length >= 50 ? SHIP : BOAT;
		v.mesh.material = this.material( kind, v.stale );
		v.label.element.textContent = data.name || `MMSI ${ data.mmsi }`;
		v.label.element.classList.toggle( 'stale', v.stale );

	}

	material( kind, stale ) {

		const key = `${ kind }${ stale ? '-stale' : '' }`;
		if ( ! this.materials.has( key ) ) {

			this.materials.set( key, new MeshStandardMaterial( {
				color: COLORS[ kind ],
				roughness: 0.7,
				transparent: stale,
				opacity: stale ? 0.45 : 1,
			} ) );

		}

		return this.materials.get( key );

	}

	// Hull centre and heading now, moving ships carried forward along their course.
	positionOf( v ) {

		let { east, north } = v.centre;
		const { sog, cog, age } = v.data;
		if ( sog >= 0.5 ) {

			const t = Math.min( age + ( performance.now() - this.receivedAt ) / 1000, 120 );
			const course = ( cog ?? v.heading ) * MathUtils.DEG2RAD;
			east += Math.sin( course ) * sog * KNOTS * t;
			north += Math.cos( course ) * sog * KNOTS * t;

		}

		// The scene is flat but the sea curves away: 8 m lower at 10 km.
		const water = ( this.waterY ?? 0 ) - ( east * east + north * north ) / ( 2 * EARTH_RADIUS );
		return { east, north, water };

	}

	update( dt, camera ) {

		this.waterTimer -= dt;
		if ( this.waterTimer <= 0 ) {

			this.waterTimer = 5;
			this.sampleWater();

		}

		const ready = this.waterY !== null;
		for ( const v of this.vessels.values() ) {

			v.mesh.visible = ready;
			if ( ! ready ) {

				v.label.visible = false;
				continue;

			}

			const { east, north, water } = this.positionOf( v );
			enuToLocal( east, north, water - SINK, v.mesh.position );
			v.mesh.rotation.y = headingToYaw( v.heading );
			v.mesh.scale.set( v.beam, v.height + SINK, v.length );

			const top = water + v.height * ( v.mesh.geometry === SHIP ? 2.4 : 1.6 );
			enuToLocal( east, north, top + 4, v.label.position );
			const distance = camera.position.distanceTo( v.label.position );
			const important = v.data.mmsi === this.selected || v.berth || v.length >= 100;
			v.label.visible = this.visible && ( distance < 1500 || ( important && distance < 8000 ) );

			if ( v.data.mmsi === this.selected ) {

				this.marker.visible = true;
				enuToLocal( east, north, top + 12, this.marker.position );
				this.marker.scale.setScalar( Math.max( 1, distance / 400 ) );

			}

		}

		if ( ! this.selected || ! ready ) this.marker.visible = false;

	}

	pick( raycaster ) {

		const meshes = [ ...this.vessels.values() ].filter( v => v.mesh.visible ).map( v => v.mesh );
		if ( ! this.visible ) return null;
		return raycaster.intersectObjects( meshes, false )[ 0 ]?.object.userData.vessel ?? null;

	}

	select( mmsi ) {

		this.selected = mmsi;
		this.onSelect?.( mmsi === null ? null : this.vessels.get( mmsi ) );

	}

	// A camera pose looking at the ship from off its stern quarter.
	viewOf( v ) {

		const { east, north } = this.positionOf( v );
		const water = this.waterY ?? 0;
		const distance = Math.max( 80, v.length * 1.3 );
		const height = Math.max( 30, v.length * 0.4 );
		const bearing = ( v.heading + 135 ) * MathUtils.DEG2RAD;
		return {
			position: enuToLocal( east + Math.sin( bearing ) * distance, north + Math.cos( bearing ) * distance, water + height ),
			heading: ( v.heading + 315 ) % 360,
			pitch: - Math.atan2( height, distance ) * MathUtils.RAD2DEG,
		};

	}

	// --- berths ---

	addBerth( config ) {

		const corners = rectCorners( config, config.length, config.width ).map( ( [ e, n ] ) => enuToLocal( e, n, 0 ) );
		const outline = new LineLoop( new BufferGeometry().setFromPoints( corners ), new LineBasicMaterial( { color: COLORS.other } ) );
		outline.visible = false; // until the water height is known
		const label = makeLabel( 'berth-label', config.name );
		label.visible = false;
		this.group.add( outline, label );
		return { ...config, outline, label, occupant: null };

	}

	berthAt( east, north ) {

		return this.berths.find( b => inRect( b, b.length, b.width, east, north ) );

	}

	updateBerths() {

		const settled = this.settled;
		const live = this.status.state === 'live';
		for ( const v of this.vessels.values() ) v.berth = null;

		for ( const berth of this.berths ) {

			let occupant = null;
			for ( const v of this.vessels.values() ) {

				const still = v.data.sog === null || v.data.sog < 1;
				if ( ! v.stale && still && v.length >= MIN_BERTH_SHIP && inRect( berth, berth.length, berth.width, v.centre.east, v.centre.north ) ) {

					if ( ! occupant || v.length > occupant.length ) occupant = v;

				}

			}

			berth.occupant = occupant;
			if ( occupant ) occupant.berth = berth;
			berth.state = occupant ? 'occupied' : settled ? 'free' : live ? 'checking' : 'unknown';
			berth.outline.material.color.setHex( { occupied: 0xf0a030, free: 0x3fbf6f }[ berth.state ] ?? COLORS.other );
			berth.label.element.textContent = `${ berth.name }: ${ { occupied: 'occupied', free: 'free', checking: 'checking...', unknown: 'no AIS' }[ berth.state ] }`;
			berth.label.element.dataset.state = berth.state;

		}

	}

	// --- water ---

	sampleWater() {

		const heights = [];
		for ( const [ east, north ] of WATER_POINTS ) {

			this.raycaster.set( enuToLocal( east, north, 2000 ), DOWN );
			const hit = this.raycaster.intersectObjects( this.getGround(), true )[ 0 ];
			if ( hit ) heights.push( hit.point.y );

		}

		if ( heights.length < 3 ) return;
		heights.sort( ( a, b ) => a - b );
		const y = heights[ Math.floor( heights.length / 2 ) ];
		if ( this.waterY !== null && Math.abs( y - this.waterY ) < 0.5 ) return;

		this.waterY = y;
		for ( const berth of this.berths ) {

			berth.outline.position.y = y + 1.5;
			berth.outline.visible = true;
			// Label on the long side away from the wharf, clear of the moored ship's name.
			const h = berth.heading * MathUtils.DEG2RAD;
			enuToLocal( berth.east + Math.cos( h ) * berth.width / 2, berth.north - Math.sin( h ) * berth.width / 2, y + 3, berth.label.position );
			berth.label.visible = this.visible;

		}

		this.hidingGoogleShips = false; // re-place at the new height
		this.updateGoogleShips();

	}

	// Google's photo has ships moored at the berths. While live AIS says what is really
	// there, press those flat and paint water over them.
	updateGoogleShips() {

		const hide = Boolean( this.flattener ) && this.waterY !== null && this.settled;
		if ( hide === this.hidingGoogleShips ) return;
		this.hidingGoogleShips = hide;

		for ( const berth of this.berths ) {

			if ( ! berth.googleShip ) continue;
			const { east = berth.east, north = berth.north, length, width } = berth.googleShip;

			if ( ! hide ) {

				this.flattener?.remove( berth );
				if ( berth.patch ) berth.patch.visible = false;
				continue;

			}

			const centre = enuToLocal( east, north, this.waterY );
			_matrix.makeRotationY( headingToYaw( berth.heading ) ).scale( new Vector3( width, 1, length ) ).setPosition( centre );
			this.flattener.set( berth, FLAT, _matrix );

			berth.patch ??= makeWaterPatch( width + 16, length + 16 );
			berth.patch.position.copy( centre ).setY( this.waterY + 0.3 );
			berth.patch.rotation.y = headingToYaw( berth.heading );
			berth.patch.visible = true;
			this.water.add( berth.patch );

		}

	}

}

// --- helpers ---

function category( type ) {

	if ( type >= 70 && type <= 79 ) return 'cargo';
	if ( type >= 80 && type <= 89 ) return 'tanker';
	if ( type >= 60 && type <= 69 ) return 'passenger';
	if ( [ 31, 32, 33, 50, 51, 52, 53, 54, 55, 58 ].includes( type ) ) return 'service';
	if ( type === 36 || type === 37 ) return 'pleasure';
	if ( type === 30 ) return 'fishing';
	return 'other';

}

// Corners of a rectangle centred on (east, north) with its long side along `heading`.
function rectCorners( { east, north, heading }, length, width ) {

	const h = heading * MathUtils.DEG2RAD;
	const along = [ Math.sin( h ) * length / 2, Math.cos( h ) * length / 2 ];
	const across = [ Math.cos( h ) * width / 2, - Math.sin( h ) * width / 2 ];
	return [ [ 1, 1 ], [ 1, - 1 ], [ - 1, - 1 ], [ - 1, 1 ] ].map( ( [ a, c ] ) => [
		east + a * along[ 0 ] + c * across[ 0 ],
		north + a * along[ 1 ] + c * across[ 1 ],
	] );

}

function inRect( { east, north, heading }, length, width, e, n ) {

	const h = heading * MathUtils.DEG2RAD;
	const dx = e - east, dy = n - north;
	return Math.abs( dx * Math.sin( h ) + dy * Math.cos( h ) ) <= length / 2 && Math.abs( dx * Math.cos( h ) - dy * Math.sin( h ) ) <= width / 2;

}

function makeLabel( className, text, onClick ) {

	const element = document.createElement( 'div' );
	element.className = className;
	element.textContent = text;
	if ( onClick ) element.addEventListener( 'click', onClick );
	return new CSS2DObject( element );

}

// A water-coloured rectangle whose edges fade out, lying flat.
function makeWaterPatch( width, length ) {

	const canvas = document.createElement( 'canvas' );
	canvas.width = 64;
	canvas.height = Math.min( 512, Math.round( 64 * length / width ) );
	const ctx = canvas.getContext( '2d' );
	const feather = 8 / width * canvas.width; // fade over the outer 8 m
	const image = ctx.createImageData( canvas.width, canvas.height );
	for ( let y = 0; y < canvas.height; y ++ ) {

		for ( let x = 0; x < canvas.width; x ++ ) {

			const edge = Math.min( x, canvas.width - 1 - x, y, canvas.height - 1 - y );
			const a = Math.round( 255 * MathUtils.smoothstep( edge, 0, feather ) );
			image.data.set( [ a, a, a, 255 ], ( y * canvas.width + x ) * 4 );

		}

	}

	ctx.putImageData( image, 0, 0 );
	const mesh = new Mesh(
		new PlaneGeometry( width, length ).rotateX( - Math.PI / 2 ),
		new MeshBasicMaterial( { color: WATER_COLOR, alphaMap: new CanvasTexture( canvas ), transparent: true, depthWrite: false } ),
	);
	mesh.name = 'water patch';
	return mesh;

}

// Unit-sized hulls, scaled per vessel: 1 wide (x), 1 long (z, bow toward -z) and
// 1 high (y) from the bottom to the deck. The deckhouse is aft, as on bulk carriers.
function hull( { house } ) {

	const outline = new Shape()
		.moveTo( - 0.5, - 0.5 )
		.lineTo( 0.5, - 0.5 )
		.lineTo( 0.5, 0.3 )
		.quadraticCurveTo( 0.45, 0.48, 0, 0.5 )
		.quadraticCurveTo( - 0.45, 0.48, - 0.5, 0.3 )
		.closePath();
	// Outline y is forward; after the rotation it points along -z and the extrusion goes up.
	const parts = [ new ExtrudeGeometry( outline, { depth: 1, bevelEnabled: false } ).rotateX( - Math.PI / 2 ) ];
	parts.push( house.toNonIndexed() );
	return mergeGeometries( parts.map( g => {

		g.deleteAttribute( 'uv' );
		return g;

	} ) );

}

const SHIP = hull( { house: new BoxGeometry( 0.8, 1.4, 0.12 ).translate( 0, 1.7, 0.38 ) } );
const BOAT = hull( { house: new BoxGeometry( 0.6, 0.6, 0.3 ).translate( 0, 1.3, 0.05 ) } );
const FLAT = new PlaneGeometry( 1, 1 ).rotateX( - Math.PI / 2 );
