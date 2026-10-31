import {
	AdditiveBlending,
	CanvasTexture,
	CircleGeometry,
	Color,
	CylinderGeometry,
	DoubleSide,
	Group,
	InstancedMesh,
	Matrix4,
	MeshBasicMaterial,
	Quaternion,
	SRGBColorSpace,
	Vector3,
} from 'three';
import { enuToLocal } from '../geo.js';
import { storage } from './places.js';

// Boost pads: glowing pads on the ground that top up the booster when driven over, a small one by a
// little, a big one all the way. They're put down as you drive, ahead of you and round you, where
// the ground is open and flattish at about the height of the street you're on. Each spot is looked
// at down from high above, so the first thing a ray meets is whatever is on top there: a roof, a
// tree or a bridge over the street rules it out, and nothing goes inside a building, nor on a roof
// high over the street (it isn't at the street's height). Four more rays round the pad keep it off
// parked cars, kerbs and slopes. A modest number, recycled as you leave them behind; one that's
// driven over goes dark and lights again a few seconds later. The booster still recharges by itself
// (drive.js): pads only add to it. The pause menu's switch turns them off (kept in this browser);
// they're on unless it's been used.
//
// They cost little: three instanced meshes (the pads, their glow and the big ones' light) and a try
// at a new spot every TRY s, of five rays at most, plus one ray a frame checking a pad in turn.

const KEY = 'world-drive.pads';
// The small and big pads: how many, how wide (m, radius), how much of the gauge each gives, how
// long (s) each takes to light again after it's driven over, and their colour.
const KINDS = {
	small: { count: 9, radius: 1.1, refill: 0.12, respawn: 4, colour: 0xffc83d },
	big: { count: 3, radius: 1.9, refill: 1, respawn: 10, colour: 0xff6a2a },
};
// Where they're looked for: AHEAD m in front along the way it's going, within SPREAD° either side;
// or, for a share AROUND of the tries, anywhere round it AROUND_REACH m away. One try every TRY s.
const AHEAD = [ 30, 110 ];
const SPREAD = 50;
const AROUND = 0.3;
const AROUND_REACH = [ 25, 70 ];
const TRY = 0.08;
// A pad goes (to be put down somewhere else) once it's RECYCLE m away, or BEHIND m behind.
const RECYCLE = 160;
const BEHIND = 50;
// Pads keep SPACING m apart, and none is put down nearer the vehicle than NEAR.
const SPACING = 15;
const NEAR = 12;
// The ground is looked for down from SKY m over where the vehicle last stood on the ground, and
// must be within LEVEL m of that height, plus SLOPE m for each metre away (streets climb); level to
// within FLAT m at four points FLAT_REACH m out past the pad's edge; and its normal at least TILT
// upright.
const SKY = 300;
const LEVEL = 3;
const SLOPE = 0.06;
const FLAT = 0.3;
const FLAT_REACH = 0.6;
const TILT = 0.96;
// Pads sit LIFT m over the ground. One a frame is looked at again, in case sharper tiles have
// arrived under it: moved up or down to them by up to SETTLE m; more, or no ground, and it goes.
const LIFT = 0.05;
const SETTLE = 1;
// Driven over: the vehicle's path this frame passes within the pad's radius and REACH of the
// vehicle's width of its middle, no more than HIGH m above it.
const REACH = 0.35;
const HIGH = 1.5;
// A new pad grows in over GROW s; a pad driven over flashes for FLASH s.
const GROW = 0.35;
const FLASH = 0.45;

// The four points round a pad its ground must be level at, east and north (times the reach).
const ROUND = [ [ 1, 0 ], [ - 1, 0 ], [ 0, 1 ], [ 0, - 1 ] ];
// Pads are only put down with the vehicle at most this high (m) over where it last stood on the
// ground: flying high, the street below is too far off to know.
const ABOVE = 20;

const DOWN = new Vector3( 0, - 1, 0 );
const UP = new Vector3( 0, 1, 0 );
const HIDDEN = new Matrix4().makeScale( 0, 0, 0 );
const _origin = new Vector3();
const _normal = new Vector3();
const _at = new Vector3();
const _scale = new Vector3();
const _q = new Quaternion();
const _m = new Matrix4();
const _c = new Color();

// scene: what the pads are drawn in. driver: the Driver (drive.js). ground: the Ground (spawn.js),
// whose rays see only the ground (the tiles or the test pad). toggle: the pause menu's checkbox.
export function createBoostPads( { scene, driver, ground, toggle = null } ) {

	const group = new Group();
	group.name = 'boost-pads';
	scene.add( group );
	const pads = [];
	for ( const [ kind, { count } ] of Object.entries( KINDS ) ) for ( let i = 0; i < count; i ++ ) {

		pads.push( { kind, ...KINDS[ kind ], index: pads.length, light: kind === 'big' ? pads.filter( p => p.kind === 'big' ).length : - 1, state: 'free', at: new Vector3(), normal: new Vector3(), timer: 0, born: 0, flash: 0, phase: Math.random() * Math.PI * 2 } );

	}

	// The pads, their glow round them, and over each big one a column of light, seen from afar.
	const flat = new CircleGeometry( 1, 40 ).rotateX( - Math.PI / 2 );
	const discs = instanced( flat, new MeshBasicMaterial( { map: padPicture(), transparent: true, depthWrite: false } ), pads.length );
	const glows = instanced( flat, new MeshBasicMaterial( { map: glowPicture(), transparent: true, depthWrite: false, blending: AdditiveBlending } ), pads.length );
	const lights = instanced( new CylinderGeometry( 1, 1, 1, 24, 1, true ).translate( 0, 0.5, 0 ), new MeshBasicMaterial( { map: lightPicture(), transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide } ), KINDS.big.count );

	function instanced( geometry, material, count ) {

		const mesh = new InstancedMesh( geometry, material, count );
		for ( let i = 0; i < count; i ++ ) {

			mesh.setMatrixAt( i, HIDDEN );
			mesh.setColorAt( i, _c.set( 0xffffff ) );

		}

		// Its copies move about; it's never far from the vehicle.
		mesh.frustumCulled = false;
		mesh.raycast = () => {};
		group.add( mesh );
		return mesh;

	}

	let enabled = storage( () => localStorage.getItem( KEY ) ) !== 'off';
	let clock = 0;
	let due = 0;
	let checked = 0;
	// Where the vehicle was a frame ago (east, north), for what it drove over on the way.
	const last = { east: 0, north: 0, known: false };
	group.visible = enabled;
	if ( toggle ) {

		toggle.checked = enabled;
		toggle.addEventListener( 'change', () => setEnabled( toggle.checked ) );

	}

	function setEnabled( on ) {

		enabled = !! on;
		storage( () => localStorage.setItem( KEY, enabled ? 'on' : 'off' ) );
		if ( toggle ) toggle.checked = enabled;
		group.visible = enabled;
		if ( ! enabled ) clear();

	}

	// None anywhere: a new place, or back to the globe.
	function clear() {

		for ( const pad of pads ) pad.state = 'free';
		last.known = false;
		draw();

	}

	// The top of whatever is at ( east, north ), looked for down from SKY m over `from` (m up):
	// its height, with its normal in _normal, or null.
	function topAt( east, north, from ) {

		const hit = ground.cast( enuToLocal( east, north, from + SKY, _origin ), DOWN, SKY + 400 );
		if ( ! hit ) return null;
		if ( hit.face ) _normal.copy( hit.face.normal ).transformDirection( hit.object.matrixWorld );
		else _normal.copy( UP );
		if ( _normal.y < 0 ) _normal.negate();
		return hit.point.y;

	}

	// Try one spot for a pad that's free, ahead of the vehicle or round it.
	function tryOne() {

		// Any one that's free, starting from somewhere at random so big and small both get a turn.
		const start = Math.floor( Math.random() * pads.length );
		let pad = null;
		for ( let i = 0; i < pads.length && ! pad; i ++ ) if ( pads[ ( start + i ) % pads.length ].state === 'free' ) pad = pads[ ( start + i ) % pads.length ];
		if ( ! pad ) return;
		const around = Math.random() < AROUND;
		const bearing = ( around ? Math.random() * 360 : driver.course + ( Math.random() * 2 - 1 ) * SPREAD ) * Math.PI / 180;
		const [ near, far ] = around ? AROUND_REACH : AHEAD;
		const distance = near + Math.random() * ( far - near );
		const east = driver.east + Math.sin( bearing ) * distance;
		const north = driver.north + Math.cos( bearing ) * distance;
		for ( const other of pads ) {

			if ( other.state !== 'free' && Math.hypot( - other.at.x - east, other.at.z - north ) < SPACING ) return;

		}

		// The street's height where it last stood on it (not the air it's flying through).
		const street = driver.lastSafe?.y ?? driver.y;
		const y = topAt( east, north, street );
		if ( y === null || _normal.y < TILT || Math.abs( y - street ) > LEVEL + SLOPE * distance ) return;
		const normal = _at.copy( _normal );
		const reach = pad.radius + FLAT_REACH;
		for ( const [ de, dn ] of ROUND ) {

			const around = topAt( east + de * reach, north + dn * reach, street );
			if ( around === null || Math.abs( around - y ) > FLAT ) return;

		}

		enuToLocal( east, north, y, pad.at );
		pad.normal.copy( normal );
		pad.state = 'lit';
		pad.born = clock;
		pad.flash = 0;

	}

	// One pad looked at again: tiles come and go and sharpen, and a pad must sit on what's there.
	function recheck() {

		const pad = pads[ checked = ( checked + 1 ) % pads.length ];
		if ( pad.state === 'free' ) return;
		const y = topAt( - pad.at.x, pad.at.z, pad.at.y );
		if ( y === null || Math.abs( y - pad.at.y ) > SETTLE ) {

			pad.state = 'free';
			return;

		}

		pad.at.y = y;
		pad.normal.copy( _normal );

	}

	// What the vehicle drove over this frame, from where it was to where it is.
	function pickUp() {

		const { east, north } = driver;
		const from = last.known ? last : driver;
		const de = east - from.east;
		const dn = north - from.north;
		const length2 = de * de + dn * dn;
		for ( const pad of pads ) {

			if ( pad.state !== 'lit' ) continue;
			// The nearest point of the path to the pad's middle.
			const pe = - pad.at.x - from.east;
			const pn = pad.at.z - from.north;
			const t = length2 > 1e-9 ? Math.min( 1, Math.max( 0, ( pe * de + pn * dn ) / length2 ) ) : 0;
			const off = Math.hypot( pe - de * t, pn - dn * t );
			if ( off > pad.radius + driver.width * REACH || Math.abs( driver.y - pad.at.y ) > HIGH ) continue;
			driver.addBoost( pad.refill );
			pad.state = 'used';
			pad.timer = pad.respawn;
			pad.flash = FLASH;

		}

		last.east = east;
		last.north = north;
		last.known = true;

	}

	// Far behind, or far away: free to go somewhere else.
	function recycle() {

		const rad = driver.course * Math.PI / 180;
		const fe = Math.sin( rad );
		const fn = Math.cos( rad );
		for ( const pad of pads ) {

			if ( pad.state === 'free' ) continue;
			const de = - pad.at.x - driver.east;
			const dn = pad.at.z - driver.north;
			if ( Math.hypot( de, dn ) > RECYCLE || de * fe + dn * fn < - BEHIND ) pad.state = 'free';

		}

	}

	// Each pad's place, size and glow: growing in, pulsing, dark once driven over, and flashing.
	function draw() {

		for ( const pad of pads ) {

			if ( pad.state === 'free' ) {

				discs.setMatrixAt( pad.index, HIDDEN );
				glows.setMatrixAt( pad.index, HIDDEN );
				if ( pad.light >= 0 ) lights.setMatrixAt( pad.light, HIDDEN );
				continue;

			}

			const lit = pad.state === 'lit';
			// Lighting again: the last half second, it comes back in.
			const back = lit ? 1 : Math.max( 0, 1 - pad.timer / 0.5 );
			const grown = easeOut( Math.min( 1, ( clock - pad.born ) / GROW ) );
			const pulse = 1 + 0.06 * Math.sin( clock * 5 + pad.phase );
			_q.setFromUnitVectors( UP, pad.normal );
			_at.copy( pad.at ).addScaledVector( pad.normal, LIFT );
			discs.setMatrixAt( pad.index, _m.compose( _at, _q, _scale.setScalar( pad.radius * grown ) ) );
			discs.setColorAt( pad.index, _c.set( pad.colour ).multiplyScalar( lit ? 1 : 0.3 + 0.7 * back ) );
			// The glow: a flash out and away when it's driven over, else a soft pulse round it.
			const flash = pad.flash / FLASH;
			const glow = flash > 0 ? 1.3 + ( 1 - flash ) * 1.6 : 1.3 * pulse;
			_at.addScaledVector( pad.normal, 0.01 );
			glows.setMatrixAt( pad.index, _m.compose( _at, _q, _scale.setScalar( pad.radius * glow * grown ) ) );
			glows.setColorAt( pad.index, _c.set( pad.colour ).multiplyScalar( flash > 0 ? flash * 1.5 : lit ? 0.9 : 0.6 * back ) );
			if ( pad.light >= 0 ) {

				const on = lit ? 1 : back;
				lights.setMatrixAt( pad.light, on > 0 ? _m.compose( _at, _q, _scale.set( pad.radius * 0.6 * pulse * grown, 3.2 * grown, pad.radius * 0.6 * pulse * grown ) ) : HIDDEN );
				lights.setColorAt( pad.light, _c.set( pad.colour ).multiplyScalar( on * 0.8 ) );

			}

		}

		for ( const mesh of [ discs, glows, lights ] ) {

			mesh.instanceMatrix.needsUpdate = true;
			mesh.instanceColor.needsUpdate = true;

		}

	}

	return {

		group,
		pads,

		// Each frame while driving.
		update( dt ) {

			if ( ! enabled || ! driver.active ) return;
			clock += dt;
			for ( const pad of pads ) {

				pad.flash = Math.max( 0, pad.flash - dt );
				if ( pad.state !== 'used' ) continue;
				pad.timer -= dt;
				if ( pad.timer <= 0 ) pad.state = 'lit';

			}

			pickUp();
			recycle();
			recheck();
			due -= dt;
			if ( due <= 0 ) {

				due = TRY;
				if ( driver.y - ( driver.lastSafe?.y ?? driver.y ) < ABOVE ) tryOne();

			}

			draw();

		},

		clear,

		get enabled() {

			return enabled;

		},

		set enabled( on ) {

			setEnabled( on );

		},

		// For the tests: put a pad of `kind` down at ( east, north ) on the ground, lit.
		place( kind, east, north ) {

			const pad = pads.find( p => p.kind === kind && p.state === 'free' ) ?? pads.find( p => p.kind === kind );
			const y = topAt( east, north, driver.lastSafe?.y ?? driver.y );
			if ( y === null ) return null;
			enuToLocal( east, north, y, pad.at );
			pad.normal.copy( _normal );
			Object.assign( pad, { state: 'lit', born: clock - GROW, flash: 0 } );
			draw();
			return pad;

		},

	};

}

// Quick, then settling.
function easeOut( t ) {

	return 1 - ( 1 - t ) ** 3;

}

// --- the pictures, drawn once each --------------------------------------------------------------

function picture( size, draw ) {

	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = size;
	draw( canvas.getContext( '2d' ), size );
	const texture = new CanvasTexture( canvas );
	texture.colorSpace = SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;

}

// A pad, in white for its colour to tint: a bright rim, a darker see-through middle with a ring of
// chevrons turning inward, and a lightning bolt in the middle.
let pad = null;
function padPicture() {

	pad ??= picture( 256, ( ctx, s ) => {

		const m = s / 2;
		ctx.beginPath();
		ctx.arc( m, m, m - 6, 0, Math.PI * 2 );
		ctx.fillStyle = 'rgba(120,120,120,0.55)';
		ctx.fill();
		ctx.lineWidth = 14;
		ctx.strokeStyle = '#fff';
		ctx.stroke();
		ctx.beginPath();
		ctx.arc( m, m, m - 30, 0, Math.PI * 2 );
		ctx.lineWidth = 4;
		ctx.strokeStyle = 'rgba(255,255,255,0.7)';
		ctx.stroke();
		ctx.fillStyle = 'rgba(255,255,255,0.85)';
		for ( let i = 0; i < 8; i ++ ) {

			ctx.save();
			ctx.translate( m, m );
			ctx.rotate( i * Math.PI / 4 );
			ctx.beginPath();
			ctx.moveTo( - 14, - 86 );
			ctx.lineTo( 0, - 72 );
			ctx.lineTo( 14, - 86 );
			ctx.lineTo( 14, - 78 );
			ctx.lineTo( 0, - 64 );
			ctx.lineTo( - 14, - 78 );
			ctx.closePath();
			ctx.fill();
			ctx.restore();

		}

		ctx.beginPath();
		ctx.moveTo( m + 12, m - 52 );
		ctx.lineTo( m - 26, m + 6 );
		ctx.lineTo( m - 2, m + 6 );
		ctx.lineTo( m - 12, m + 52 );
		ctx.lineTo( m + 26, m - 8 );
		ctx.lineTo( m + 2, m - 8 );
		ctx.closePath();
		ctx.fillStyle = '#fff';
		ctx.fill();

	} );
	return pad;

}

// A soft ring of light, for round a pad.
let glow = null;
function glowPicture() {

	glow ??= picture( 128, ( ctx, s ) => {

		const m = s / 2;
		const gradient = ctx.createRadialGradient( m, m, 0, m, m, m );
		gradient.addColorStop( 0, 'rgba(255,255,255,0)' );
		gradient.addColorStop( 0.55, 'rgba(255,255,255,0.05)' );
		gradient.addColorStop( 0.75, 'rgba(255,255,255,0.55)' );
		gradient.addColorStop( 0.82, 'rgba(255,255,255,0.35)' );
		gradient.addColorStop( 1, 'rgba(255,255,255,0)' );
		ctx.fillStyle = gradient;
		ctx.fillRect( 0, 0, s, s );

	} );
	return glow;

}

// A column of light: bright at its foot, gone at its top.
let light = null;
function lightPicture() {

	light ??= picture( 64, ( ctx, s ) => {

		const gradient = ctx.createLinearGradient( 0, 0, 0, s );
		gradient.addColorStop( 0, 'rgba(255,255,255,0)' );
		gradient.addColorStop( 0.6, 'rgba(255,255,255,0.18)' );
		gradient.addColorStop( 1, 'rgba(255,255,255,0.6)' );
		ctx.fillStyle = gradient;
		ctx.fillRect( 0, 0, s, s );

	} );
	return light;

}
