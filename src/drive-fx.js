import {
	AdditiveBlending,
	BoxGeometry,
	BufferAttribute,
	BufferGeometry,
	CanvasTexture,
	Color,
	ConeGeometry,
	DoubleSide,
	DynamicDrawUsage,
	Group,
	MathUtils,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	PlaneGeometry,
	Quaternion,
	SRGBColorSpace,
	Sprite,
	SpriteMaterial,
	Vector3,
} from 'three';
import { createBoostStyle, createSupersonic, styleFlame } from './drive-boosts.js';

// What driving shows besides the vehicle: the booster's flame and glow, tyre smoke while drifting
// and the sparks that say how big the drift boost will be; and with stunts, sparks, bits and a
// flash where it hits something, sparks while it scrapes along a wall and dust where it comes down
// hard. An app can colour the flame or swap it for a boost style of drive-boosts.js (plasma,
// lightning, bubbles, a comet's tail...), and add a trail behind the vehicle while it boosts or
// flies (World Drive's Garage): coloured smoke, sparkles or a rainbow ribbon. Going supersonic
// (drive.js) adds a sonic boom and streaks of air past it. With water (World Drive's), coming down
// in it throws up a splash: spray and droplets, rings of foam spreading over the surface and a patch
// of foam where it went in, then foam bubbling round it as it sinks; a hovercraft on water throws a
// little spray behind it. Kept cheap: a few cones, sprites and little boxes, reused from small
// pools, and ribbons and batches of quads whose buffers are written in place, nothing made each
// frame and nothing that casts or catches rays.

const SMOKE_POOL = 64;
const SPARK_POOL = 120;
const DEBRIS_POOL = 24;
const SMOKE_LIFE = 0.9;
const SPARK_LIFE = 0.28;
// A hit's sparks fly for longer and fall; its bits (debris) tumble and bounce once on the ground.
const HIT_SPARK_LIFE = 0.55;
const DEBRIS_LIFE = 1.1;
const GRAVITY = 9.81;
// Spark colours for drift levels 1, 2 and 3.
export const SPARK_COLOURS = [ 0xffc83d, 0x3dffd8, 0xff3df0 ];
// The booster's flame by name: its outer cone, white-hot core and glow. 'rainbow' runs through the
// hues instead, a turn every RAINBOW_TURN s.
export const FLAMES = {
	orange: [ 0xff6a1a, 0xfff2b0, 0xffa040 ],
	blue: [ 0x2b6dff, 0xd6efff, 0x4fa0ff ],
	green: [ 0x22d04a, 0xe6ffd6, 0x5cff78 ],
	purple: [ 0x8f3dff, 0xf0e0ff, 0xae6cff ],
	pink: [ 0xff3d98, 0xffe2f1, 0xff72b6 ],
};
const RAINBOW_TURN = 1.6;
// Trails. Smoke: a puff every SMOKE_TRAIL_STEP s that lasts SMOKE_TRAIL_LIFE s. Sparkles: one every
// SPARKLE_STEP s, twinkling, in these colours. The ribbon: RIBBON_POINTS points across the back, one
// every RIBBON_STEP s, each fading over RIBBON_LIFE s, in bands of these hues side by side.
const SMOKE_TRAIL_POOL = 56;
const SMOKE_TRAIL_STEP = 0.03;
const SMOKE_TRAIL_LIFE = 1.5;
const SPARKLE_POOL = 90;
const SPARKLE_STEP = 0.012;
const SPARKLE_LIFE = 0.9;
const SPARKLE_COLOURS = [ 0xffffff, 0xfff0a0, 0xffb6ef, 0xa6f3ff ];
const RIBBON_POINTS = 48;
const RIBBON_STEP = 1 / 40;
const RIBBON_LIFE = 0.9;
const RIBBON_HUES = [ 0, 0.08, 0.15, 0.33, 0.58, 0.77 ];
// Water. A splash's droplets (falling back, gone in DROP_LIFE s) and spray (billows of mist,
// MIST_LIFE s); a ring of foam spreading out from it for RING_LIFE s, to RING_REACH m (and more for
// a harder splash) past the vehicle's side, over a patch of foam where it went in, for FOAM_LIFE s.
// Sinking, it bobs, sending out a ripple of foam every RIPPLE_STEP s (RIPPLE_REACH m), and foam
// bubbles round it, a puff every BUBBLE_STEP s; a hovercraft's spray, a puff every SPRAY_STEP s at
// full speed.
const DROP_POOL = 150;
const MIST_POOL = 48;
const DROP_LIFE = 1.3;
const MIST_LIFE = 1.5;
const RINGS = 6;
const RING_LIFE = 2;
const RING_REACH = 5;
const RIPPLE_STEP = 0.45;
const RIPPLE_REACH = 3;
const FOAM_LIFE = 2.6;
const BUBBLE_STEP = 0.07;
const SPRAY_STEP = 0.02;
const WATER_COLOURS = [ 0xffffff, 0xe6f6ff, 0xc9ecff ];

const _v = new Vector3();
const _p = new Vector3();
const _across = new Vector3();
const _q = new Quaternion();

let textures = null;
function getTextures() {

	textures ??= { soft: radial( [ [ 0, 'rgba(255,255,255,1)' ], [ 0.4, 'rgba(255,255,255,0.55)' ], [ 1, 'rgba(255,255,255,0)' ] ] ),
		glow: radial( [ [ 0, 'rgba(255,255,255,1)' ], [ 0.25, 'rgba(255,220,160,0.8)' ], [ 0.6, 'rgba(255,120,40,0.25)' ], [ 1, 'rgba(255,80,0,0)' ] ] ),
		star: star() };
	return textures;

}

// A four-pointed twinkle with a soft middle, for sparkles.
function star() {

	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = 64;
	const ctx = canvas.getContext( '2d' );
	const gradient = ctx.createRadialGradient( 32, 32, 0, 32, 32, 14 );
	gradient.addColorStop( 0, 'rgba(255,255,255,1)' );
	gradient.addColorStop( 1, 'rgba(255,255,255,0)' );
	ctx.fillStyle = gradient;
	ctx.fillRect( 0, 0, 64, 64 );
	ctx.fillStyle = '#fff';
	ctx.beginPath();
	for ( let i = 0; i < 8; i ++ ) {

		const angle = i / 8 * Math.PI * 2;
		const reach = i % 2 ? 5 : 31;
		ctx.lineTo( 32 + Math.cos( angle ) * reach, 32 + Math.sin( angle ) * reach );

	}

	ctx.fill();
	const texture = new CanvasTexture( canvas );
	texture.colorSpace = SRGBColorSpace;
	return texture;

}

function radial( stops ) {

	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = 64;
	const ctx = canvas.getContext( '2d' );
	const gradient = ctx.createRadialGradient( 32, 32, 0, 32, 32, 32 );
	for ( const [ at, colour ] of stops ) gradient.addColorStop( at, colour );
	ctx.fillStyle = gradient;
	ctx.fillRect( 0, 0, 64, 64 );
	const texture = new CanvasTexture( canvas );
	texture.colorSpace = SRGBColorSpace;
	return texture;

}

// Water's pictures, drawn once: a ring of foam (a soft band, broken up by flecks so it reads as
// foam rather than a drawn circle), and a patch of foam (a soft blob, flecked the same way).
let waterTextures = null;
function getWaterTextures() {

	waterTextures ??= { ring: foam( 0.82, 0.09, 220 ), patch: foam( 0, 0.9, 60 ) };
	return waterTextures;

}

// Foam round a circle `at` (a share of the radius) `wide` either side of it, with `flecks`.
function foam( at, wide, flecks ) {

	const size = 128;
	const m = size / 2;
	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext( '2d' );
	const gradient = ctx.createRadialGradient( m, m, 0, m, m, m );
	for ( const stop of [ 0, 0.25, 0.5, 0.75, 1 ] ) {

		const off = Math.abs( stop - 0.5 ) * 2;
		const radius = MathUtils.clamp( at + ( stop - 0.5 ) * 2 * wide, 0, 1 );
		gradient.addColorStop( radius, `rgba(255,255,255,${ ( ( 1 - off * off ) * 0.85 ).toFixed( 3 ) })` );

	}

	ctx.fillStyle = gradient;
	ctx.fillRect( 0, 0, size, size );
	// Flecks over the band: bright where there's foam, cut out a little between.
	for ( let i = 0; i < flecks; i ++ ) {

		const angle = Math.random() * Math.PI * 2;
		const r = ( at + ( Math.random() - 0.5 ) * 2 * wide ) * m;
		ctx.globalCompositeOperation = i % 3 ? 'source-atop' : 'destination-out';
		ctx.fillStyle = i % 3 ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.5)';
		ctx.beginPath();
		ctx.arc( m + Math.cos( angle ) * r, m + Math.sin( angle ) * r, 1 + Math.random() * 1.8, 0, Math.PI * 2 );
		ctx.fill();

	}

	const texture = new CanvasTexture( canvas );
	texture.colorSpace = SRGBColorSpace;
	return texture;

}

// world: the group effects that stay behind (smoke, sparks) are added to. The flame follows the
// vehicle's pivot each frame but isn't part of it, so it never counts as the vehicle's own shape.
// look: { boost: 'classic' (the flame, if not given) or a style in drive-boosts.js, flame: the
// classic flame's colour, a name in FLAMES or 'rainbow' (orange if not given), trail: null or {
// kind: 'smoke', 'sparkle' or 'ribbon', colour (smoke's) } }. water: whether there's water to
// splash in (its pools are only made then).
export function createDriveFx( world, { boost = 'classic', flame: flameName = 'orange', trail = null } = {}, { water = false } = {} ) {

	const { soft, glow, star: twinkle } = getTextures();
	const root = new Group();
	root.name = 'drive-fx';
	world.add( root );

	// Booster flame: an outer orange cone, an inner white-hot one and a glow, pointing back (+Z).
	const flame = new Group();
	const additive = color => new MeshBasicMaterial( { color, transparent: true, blending: AdditiveBlending, depthWrite: false } );
	const outer = new Mesh( new ConeGeometry( 0.5, 1, 14, 1, true ).rotateX( Math.PI / 2 ).translate( 0, 0, 0.5 ), additive( 0xff6a1a ) );
	const inner = new Mesh( new ConeGeometry( 0.28, 0.6, 12, 1, true ).rotateX( Math.PI / 2 ).translate( 0, 0, 0.3 ), additive( 0xfff2b0 ) );
	const halo = new Sprite( new SpriteMaterial( { map: glow, color: 0xffa040, transparent: true, blending: AdditiveBlending, depthWrite: false } ) );
	flame.add( outer, inner, halo );
	for ( const part of flame.children ) part.raycast = () => {};
	flame.visible = false;
	root.add( flame );
	const rainbow = flameName === 'rainbow';
	const [ outerColour, innerColour, haloColour ] = FLAMES[ flameName ] ?? FLAMES.orange;
	outer.material.color.set( outerColour );
	inner.material.color.set( rainbow ? 0xffffff : innerColour );
	halo.material.color.set( haloColour );
	// The glow's own picture is orange at its edge: any other colour glows from a white one.
	if ( flameName !== 'orange' ) halo.material.map = soft;

	// A boost style instead (drive-boosts.js): its particles, and the flame in its colours, its glow
	// alone, or nothing at all. Then the supersonic effects, which every style has.
	const style = createBoostStyle( root, boost );
	const styled = style ? styleFlame( boost ) : null;
	if ( style ) {

		outer.visible = inner.visible = !! styled?.outer;
		if ( styled?.outer ) outer.material.color.set( styled.outer );
		if ( styled?.inner ) inner.material.color.set( styled.inner );
		if ( styled ) halo.material.color.set( styled.halo );
		halo.material.map = soft;

	}

	const sonic = createSupersonic( root );
	// What the style and the supersonic effects are told each frame (see drive-boosts.js): one
	// object, filled in again each time.
	const frame = {
		pivot: null, size: null, velocity: new Vector3(), power: 0, grounded: true, dt: 0, clock: 0, scale: 1,
		nozzle: new Vector3(), lastNozzle: new Vector3(), back: new Vector3(), up: new Vector3(), right: new Vector3(), middle: new Vector3(),
	};
	let framed = false;

	const smoke = pool( SMOKE_POOL, () => new SpriteMaterial( { map: soft, color: 0xdedede, transparent: true, depthWrite: false } ) );
	const sparks = pool( SPARK_POOL, () => new SpriteMaterial( { map: glow, color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false } ) );
	// A hit's flash: one glow, big and brief.
	const flash = pool( 3, () => new SpriteMaterial( { map: glow, color: 0xfff4d0, transparent: true, blending: AdditiveBlending, depthWrite: false } ) );
	// Bits knocked off: small dark boxes, sharing one shape.
	const chunk = new BoxGeometry( 1, 1, 1 );
	const debris = [];
	for ( let i = 0; i < DEBRIS_POOL; i ++ ) {

		const mesh = new Mesh( chunk, new MeshStandardMaterial( { color: 0x3b3f45, roughness: 0.8, transparent: true } ) );
		mesh.visible = false;
		mesh.raycast = () => {};
		root.add( mesh );
		debris.push( { mesh, age: Infinity, life: DEBRIS_LIFE, velocity: new Vector3(), spin: new Vector3(), floor: 0 } );

	}

	let nextDebris = 0;

	// The trail, made only if there is one: its own pool, or the ribbon.
	const trailKind = trail?.kind;
	const trailSmoke = trailKind === 'smoke' ? pool( SMOKE_TRAIL_POOL, () => new SpriteMaterial( { map: soft, color: 0xffffff, transparent: true, depthWrite: false } ) ) : null;
	const sparkles = trailKind === 'sparkle' ? pool( SPARKLE_POOL, () => new SpriteMaterial( { map: twinkle, color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false } ) ) : null;
	const ribbon = trailKind === 'ribbon' ? makeRibbon( root ) : null;
	const smokeColour = new Color( trail?.colour ?? 0xffffff );

	// Water, made only if there is any: droplets and spray (sprites, drawn as they are rather than
	// added, so they're white in daylight rather than glowing), and the foam on the surface.
	const drops = water ? pool( DROP_POOL, () => new SpriteMaterial( { map: soft, color: 0xffffff, transparent: true, depthWrite: false } ) ) : null;
	const mist = water ? pool( MIST_POOL, () => new SpriteMaterial( { map: soft, color: 0xffffff, transparent: true, depthWrite: false } ) ) : null;
	const surface = water ? makeFoam( root ) : null;
	let bubbleDue = 0;
	let rippleDue = 0;
	let sprayDue = 0;

	function pool( size, material ) {

		const items = [];
		for ( let i = 0; i < size; i ++ ) {

			const sprite = new Sprite( material() );
			sprite.visible = false;
			sprite.raycast = () => {};
			root.add( sprite );
			items.push( { sprite, age: Infinity, life: 1, velocity: new Vector3(), size: 1, grow: 0, fall: 0, twinkle: 0 } );

		}

		return { items, next: 0 };

	}

	// `fall`: the share of gravity it falls with (a hit's sparks), 0 for what floats or rises.
	// `twinkle`: a sparkle's twinkle, by a phase of its own (0 for none).
	function emit( from, at, velocity, life, size, grow, colour, fall = 0, twinkle = 0 ) {

		const item = from.items[ from.next ];
		from.next = ( from.next + 1 ) % from.items.length;
		item.sprite.position.copy( at );
		item.velocity.copy( velocity );
		item.age = 0;
		item.life = life;
		item.size = size;
		item.grow = grow;
		item.fall = fall;
		item.twinkle = twinkle;
		item.sprite.material.color.set( colour );
		item.sprite.visible = true;

	}

	function age( from, dt, fade ) {

		for ( const item of from.items ) {

			if ( item.age >= item.life ) continue;
			item.age += dt;
			if ( item.age >= item.life ) {

				item.sprite.visible = false;
				continue;

			}

			const t = item.age / item.life;
			item.velocity.y -= GRAVITY * item.fall * dt;
			item.sprite.position.addScaledVector( item.velocity, dt );
			const twinkle = item.twinkle ? 0.55 + 0.45 * Math.sin( item.age * 38 + item.twinkle ) : 1;
			item.sprite.scale.setScalar( ( item.size + item.grow * t ) * twinkle );
			item.sprite.material.opacity = fade * ( 1 - t );

		}

	}

	// Bits fly, tumble, bounce once off a floor a little below where they were knocked from (about
	// the ground) and fade.
	function ageDebris( dt ) {

		for ( const item of debris ) {

			if ( item.age >= item.life ) continue;
			item.age += dt;
			if ( item.age >= item.life ) {

				item.mesh.visible = false;
				continue;

			}

			const { mesh, velocity, spin } = item;
			velocity.y -= GRAVITY * dt;
			mesh.position.addScaledVector( velocity, dt );
			if ( mesh.position.y < item.floor ) {

				mesh.position.y = item.floor;
				velocity.set( velocity.x * 0.5, Math.abs( velocity.y ) * 0.35, velocity.z * 0.5 );
				spin.multiplyScalar( 0.5 );

			}

			mesh.rotation.x += spin.x * dt;
			mesh.rotation.y += spin.y * dt;
			mesh.rotation.z += spin.z * dt;
			mesh.material.opacity = Math.min( 1, 3 * ( 1 - item.age / item.life ) );

		}

	}

	// A random way off a surface facing `normal`, tipped up a little, at about `speed` (m/s).
	function spray( normal, speed, spread, target ) {

		target.set( Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5 ).multiplyScalar( 2 * spread ).add( normal ).normalize();
		target.y = Math.abs( target.y ) * 0.8 + 0.3;
		return target.normalize().multiplyScalar( speed * ( 0.5 + Math.random() ) );

	}

	let smokeDue = 0;
	let sparkDue = 0;
	let scrapeDue = 0;
	let trailDue = 0;
	let sparkleCount = 0;
	let flicker = 0;
	const colour = new Color();

	// Where the exhaust is, which ways are back, up and right, and the rest of `frame`.
	function setFrame( pivot, size, velocity, power, grounded, dt ) {

		frame.pivot = pivot;
		frame.size = size;
		frame.velocity.copy( velocity );
		frame.power = power;
		frame.grounded = grounded;
		frame.dt = dt;
		frame.clock = flicker;
		frame.scale = Math.max( 0.35, Math.min( size.width, size.height ) * 0.45 ) / 0.45;
		frame.lastNozzle.copy( frame.nozzle );
		pivot.localToWorld( frame.nozzle.set( 0, size.height * 0.33 / size.scale, ( size.rear + 0.02 ) / size.scale ) );
		pivot.localToWorld( frame.middle.set( 0, size.height * 0.5 / size.scale, ( size.rear - ( size.length ?? size.rear * 2 ) / 2 ) / size.scale ) );
		// Its own axes, turned as it is: it faces -Z.
		pivot.getWorldQuaternion( _q );
		frame.back.set( 0, 0, 1 ).applyQuaternion( _q );
		frame.up.set( 0, 1, 0 ).applyQuaternion( _q );
		frame.right.set( 1, 0, 0 ).applyQuaternion( _q );
		// The first frame has no frame before it.
		if ( ! framed ) frame.lastNozzle.copy( frame.nozzle );
		framed = true;

	}

	// The trail, while it boosts or flies (`power` over 0): puffs or sparkles left behind the back of
	// it, drifting a little after it, or the ribbon drawn out from across its back.
	function updateTrail( pivot, size, velocity, power, dt ) {

		if ( ribbon ) {

			ribbon.update( pivot, size, power, dt );
			return;

		}

		const from = trailSmoke ?? sparkles;
		if ( ! from ) return;
		if ( power > 0 ) {

			trailDue -= dt;
			const step = trailSmoke ? SMOKE_TRAIL_STEP : SPARKLE_STEP;
			while ( trailDue <= 0 ) {

				trailDue += step;
				// Somewhere across the back of it, a little behind.
				const across = ( Math.random() - 0.5 ) * size.width * 0.7;
				const up = size.height * ( trailSmoke ? 0.35 : 0.2 + Math.random() * 0.5 );
				pivot.localToWorld( _p.set( across / size.scale, up / size.scale, ( size.rear + 0.15 ) / size.scale ) );
				if ( trailSmoke ) {

					_v.set( ( Math.random() - 0.5 ) * 0.6, 0.3 + Math.random() * 0.4, ( Math.random() - 0.5 ) * 0.6 ).addScaledVector( velocity, 0.2 );
					emit( trailSmoke, _p, _v, SMOKE_TRAIL_LIFE, 0.55 + size.width * 0.2, 1.6 + size.width * 0.5, smokeColour );

				} else {

					_v.set( ( Math.random() - 0.5 ) * 1.2, ( Math.random() - 0.3 ) * 1.2, ( Math.random() - 0.5 ) * 1.2 ).addScaledVector( velocity, 0.15 );
					emit( sparkles, _p, _v, SPARKLE_LIFE * ( 0.6 + Math.random() * 0.6 ), 0.16 + Math.random() * 0.18, 0, SPARKLE_COLOURS[ sparkleCount ++ % SPARKLE_COLOURS.length ], 0.12, 1 + Math.random() * 6 );

				}

			}

		} else trailDue = 0;

		age( from, dt, trailSmoke ? 0.8 : 1 );

	}

	// In the water: foam bubbling up round it as it sinks (`state.sinking`), or a hovercraft's spray
	// thrown up behind it (`state.spray`, 0 to 1 by its speed), on the surface at `state.level`.
	function updateWater( pivot, size, velocity, state, dt ) {

		if ( state?.sinking ) {

			rippleDue -= dt;
			if ( rippleDue <= 0 ) {

				rippleDue += RIPPLE_STEP;
				surface.ripple( _p.copy( frame.middle ).setY( state.level ), size.width );

			}

			bubbleDue -= dt;
			while ( bubbleDue <= 0 ) {

				bubbleDue += BUBBLE_STEP;
				const angle = Math.random() * Math.PI * 2;
				const reach = ( 0.35 + Math.random() * 0.45 ) * Math.max( size.width, size.length ) * 0.6;
				_p.set( Math.cos( angle ) * reach, 0, Math.sin( angle ) * reach ).add( frame.middle ).setY( state.level + 0.15 );
				_v.set( ( Math.random() - 0.5 ) * 0.5, 0.3 + Math.random() * 0.6, ( Math.random() - 0.5 ) * 0.5 );
				emit( mist, _p, _v, 0.9, 0.25 + Math.random() * 0.3, 0.8, 0xffffff );

			}

		} else bubbleDue = rippleDue = RIPPLE_STEP;

		const spray = state?.spray ?? 0;
		if ( spray > 0 ) {

			sprayDue -= dt * spray;
			while ( sprayDue <= 0 ) {

				sprayDue += SPRAY_STEP;
				// Off the skirt across its back, thrown up and back a little after it.
				const across = ( Math.random() - 0.5 ) * size.width * 0.9;
				pivot.localToWorld( _p.set( across / size.scale, 0, ( size.rear + 0.1 ) / size.scale ) ).setY( state.level + 0.15 );
				_v.set( ( Math.random() - 0.5 ) * 2, 1 + Math.random() * 2.5 * spray, ( Math.random() - 0.5 ) * 2 ).addScaledVector( velocity, 0.55 );
				if ( Math.random() < 0.45 ) emit( mist, _p, _v, 0.9, 0.5, 1.8, 0xffffff, 0.15 );
				else emit( drops, _p, _v, 0.8, 0.1 + Math.random() * 0.12, 0, WATER_COLOURS[ Math.floor( Math.random() * WATER_COLOURS.length ) ], 1 );

			}

		} else sprayDue = 0;

		age( drops, dt, 0.95 );
		age( mist, dt, 0.45 );
		surface.update( dt );

	}

	return {

		// Each frame, with the vehicle's pivot and size and what it's doing:
		// { pivot, size: { width, height, length, rear, scale }, wheels: [ local points of the rear
		// tyres on the ground ], velocity: its own (m/s, world), flame: 0..1 (booster 1, a drift
		// boost less), drifting, level: 0..3, scrape: { at, normal } where it's scraping along a wall
		// (world) or null, grounded (on its wheels: ink is left on the road), supersonic, water: null
		// or in it, { level: the surface's height (world), sinking, spray: 0..1 }, dt }.
		update( { pivot, size, wheels, velocity, flame: power, trail: trailPower = 0, drifting, level, scrape = null, grounded = true, supersonic = false, water: wet = null, dt } ) {

			flicker += dt;
			setFrame( pivot, size, velocity, power, grounded, dt );
			style?.update( frame );
			sonic.update( frame, supersonic );
			flame.visible = power > 0.01 && ( ! style || !! styled );
			if ( flame.visible && rainbow && ! style ) {

				const hue = flicker / RAINBOW_TURN % 1;
				outer.material.color.setHSL( hue, 1, 0.55 );
				halo.material.color.setHSL( ( hue + 0.08 ) % 1, 1, 0.65 );

			}

			if ( flame.visible ) {

				// Behind the rear, a third of the way up, sized to the vehicle and pointing back.
				const scale = Math.max( 0.35, Math.min( size.width, size.height ) * 0.45 );
				pivot.localToWorld( flame.position.set( 0, size.height * 0.33 / size.scale, ( size.rear + 0.02 ) / size.scale ) );
				pivot.getWorldQuaternion( flame.quaternion );
				// A style's flame may burn longer or shorter, and flicker more wildly.
				const wild = styled?.flicker ?? 1;
				const jitter = 0.85 + 0.3 * wild * Math.abs( Math.sin( flicker * 47 * wild ) * Math.sin( flicker * 31 * wild ) );
				flame.scale.set( scale * power, scale * power, scale * ( 0.6 + power * 2.6 ) * jitter * ( styled?.length ?? 1 ) );
				outer.material.opacity = 0.25 + 0.35 * jitter;
				inner.material.opacity = 0.9;
				halo.scale.setScalar( 1.6 * jitter );
				halo.material.opacity = 0.75 * power;

			}

			// Smoke puffs from the rear tyres while sliding, dragged along a little behind the
			// vehicle and rising and spreading as they fade.
			if ( drifting ) {

				smokeDue -= dt;
				while ( smokeDue <= 0 ) {

					smokeDue += 0.035;
					for ( const wheel of wheels ) {

						// A little over the tyre, so the ground doesn't cut the puff off flat.
						pivot.localToWorld( _p.copy( wheel ) ).y += 0.25;
						_v.set( ( Math.random() - 0.5 ) * 0.8, 0.5 + Math.random() * 0.5, ( Math.random() - 0.5 ) * 0.8 ).addScaledVector( velocity, 0.6 );
						emit( smoke, _p, _v, SMOKE_LIFE, 0.5, 1.8, 0xf2f2f2 );

					}

				}

			}

			// Sparks off the rear tyres once the drift has earned a boost, in that boost's colour.
			if ( drifting && level > 0 ) {

				sparkDue -= dt;
				colour.set( SPARK_COLOURS[ level - 1 ] );
				while ( sparkDue <= 0 ) {

					sparkDue += 0.02;
					for ( const wheel of wheels ) {

						pivot.localToWorld( _p.copy( wheel ) );
						_v.set( ( Math.random() - 0.5 ) * 3, 0.8 + Math.random() * 1.6, ( Math.random() - 0.5 ) * 3 ).addScaledVector( velocity, 0.85 );
						emit( sparks, _p, _v, SPARK_LIFE, 0.16, 0.05, colour );

					}

				}

			}

			// Scraping along a wall: a stream of sparks off the corner rubbing on it, left behind.
			if ( scrape ) {

				scrapeDue -= dt;
				while ( scrapeDue <= 0 ) {

					scrapeDue += 0.012;
					spray( scrape.normal, 3, 0.6, _v ).addScaledVector( velocity, 0.3 );
					emit( sparks, scrape.at, _v, HIT_SPARK_LIFE * 0.6, 0.14, 0, Math.random() < 0.5 ? 0xffd27a : 0xffffff, 0.6 );

				}

			}

			age( smoke, dt, 0.7 );
			age( sparks, dt, 1 );
			age( flash, dt, 1 );
			ageDebris( dt );
			updateTrail( pivot, size, velocity, trailPower, dt );
			if ( surface ) updateWater( pivot, size, velocity, wet, dt );

		},

		// The sonic boom, going supersonic: a shock ring round it and a flash.
		boom() {

			if ( framed ) sonic.boom( frame, Math.max( frame.size.width, frame.size.height ) );

		},

		// How many of the boost style's and the supersonic effects' particles are alive, and the
		// most there can be.
		get particles() {

			return { alive: ( style?.alive ?? 0 ) + sonic.alive, budget: ( style?.budget ?? 0 ) + sonic.budget };

		},

		// A hit at `at` (world) on something facing `normal`, `power` 0 to 1 by how hard: a flash,
		// sparks and bits flying off it.
		burst( at, normal, power ) {

			emit( flash, at, _v.set( 0, 0, 0 ), 0.16, 1 + power * 2.5, 1.5, 0xfff4d0 );
			const count = Math.round( 10 + 30 * power );
			for ( let i = 0; i < count; i ++ ) {

				spray( normal, 4 + 8 * power, 0.9, _v );
				emit( sparks, at, _v, HIT_SPARK_LIFE * ( 0.6 + Math.random() * 0.6 ), 0.18 + Math.random() * 0.14, 0, i % 3 ? 0xffc94a : 0xfff6d8, 0.8 );

			}

			const bits = Math.round( 3 + 9 * power );
			for ( let i = 0; i < bits; i ++ ) {

				const item = debris[ nextDebris ];
				nextDebris = ( nextDebris + 1 ) % debris.length;
				item.mesh.position.copy( at );
				item.mesh.scale.set( 0.06 + Math.random() * 0.12, 0.04 + Math.random() * 0.08, 0.06 + Math.random() * 0.14 );
				spray( normal, 3 + 5 * power, 1, item.velocity );
				item.spin.set( Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5 ).multiplyScalar( 24 );
				item.floor = at.y - 1.2;
				item.age = 0;
				item.mesh.material.opacity = 1;
				item.mesh.visible = true;

			}

		},

		// Dust thrown up round `at` (world, on the ground) as it comes down hard, `power` 0 to 1, round
		// a vehicle `width` (m) wide.
		dust( at, power, width ) {

			const count = Math.round( 4 + 8 * power );
			for ( let i = 0; i < count; i ++ ) {

				// Starting high enough that the ground doesn't cut the puffs off flat.
				const angle = i / count * Math.PI * 2;
				_p.set( Math.cos( angle ) * width * 0.6, 0.35 + power * 0.25, Math.sin( angle ) * width * 0.6 ).add( at );
				_v.set( Math.cos( angle ) * ( 1.5 + 2 * power ), 0.8 + Math.random() * 0.8, Math.sin( angle ) * ( 1.5 + 2 * power ) );
				emit( smoke, _p, _v, SMOKE_LIFE, 0.5 + power * 0.4, 1.1 + power * 1.1, 0xcfc8bc );

			}

		},

		// Coming down in water: a splash at `at` (world, on the surface), `power` 0 to 1 by how hard,
		// round a vehicle `width` (m) wide. Droplets thrown up and out round it and falling back,
		// billows of spray, and on the surface rings of foam spreading one after another over a patch
		// of foam where it went in.
		splash( at, power, width ) {

			if ( ! surface ) return;
			const count = Math.round( 50 + 90 * power );
			for ( let i = 0; i < count; i ++ ) {

				const angle = Math.random() * Math.PI * 2;
				const reach = width * ( 0.25 + Math.random() * 0.45 );
				_p.set( Math.cos( angle ) * reach, 0.15, Math.sin( angle ) * reach ).add( at );
				const out = ( 1 + Math.random() * 3 ) * ( 0.6 + power );
				_v.set( Math.cos( angle ) * out, ( 3 + Math.random() * 5 ) * ( 0.5 + power ), Math.sin( angle ) * out );
				emit( drops, _p, _v, DROP_LIFE * ( 0.6 + Math.random() * 0.5 ), 0.12 + Math.random() * 0.22, 0.05, WATER_COLOURS[ i % WATER_COLOURS.length ], 1 );

			}

			const billows = Math.round( 6 + 8 * power );
			for ( let i = 0; i < billows; i ++ ) {

				const angle = i / billows * Math.PI * 2 + Math.random() * 0.4;
				const reach = width * ( 0.2 + Math.random() * 0.4 );
				_p.set( Math.cos( angle ) * reach, 0.3 + Math.random() * 0.4, Math.sin( angle ) * reach ).add( at );
				const out = 0.6 + Math.random() * 1.6;
				_v.set( Math.cos( angle ) * out, ( 1.5 + Math.random() * 3 ) * ( 0.5 + power ), Math.sin( angle ) * out );
				emit( mist, _p, _v, MIST_LIFE * ( 0.7 + Math.random() * 0.5 ), 0.3 + width * 0.15, 0.8 + 1.2 * power, 0xffffff, 0.35 );

			}

			surface.splash( at, power, width );

		},

		dispose() {

			world.remove( root );
			root.traverse( o => {

				// Sprites share one geometry across the whole app; the textures are shared too. The bits
				// share one box, and disposing of it again is harmless.
				if ( ! o.isSprite ) o.geometry?.dispose();
				o.material?.dispose();

			} );

		},

	};

}

// The rainbow ribbon: a strip across the back of the vehicle, drawn out behind it as it boosts or
// flies, each point along it fading as it ages. Its colours are bands side by side, red on the left
// to violet on the right, so it reads as a rainbow at any speed and from any side; bands of colour
// along it instead would be one colour across the few metres the chase camera sees at speed. Its
// points go round a ring, and each frame they're written newest first into buffers made once; the
// colours are written once, and only how faded each point is changes.
function makeRibbon( root ) {

	// Each band has two edges of its own, so its colour stops sharply at the next one's.
	const bands = RIBBON_HUES.length;
	const row = bands * 2;
	const positions = new Float32Array( RIBBON_POINTS * row * 3 );
	const colours = new Float32Array( RIBBON_POINTS * row * 4 );
	const index = [];
	const hue = new Color();
	for ( let i = 0; i < RIBBON_POINTS; i ++ ) for ( let band = 0; band < bands; band ++ ) {

		const a = i * row + band * 2;
		hue.setHSL( RIBBON_HUES[ band ], 1, 0.55 );
		hue.toArray( colours, a * 4 );
		hue.toArray( colours, ( a + 1 ) * 4 );
		if ( i < RIBBON_POINTS - 1 ) index.push( a, a + 1, a + row, a + 1, a + row + 1, a + row );

	}

	const geometry = new BufferGeometry();
	geometry.setIndex( index );
	geometry.setAttribute( 'position', new BufferAttribute( positions, 3 ).setUsage( DynamicDrawUsage ) );
	geometry.setAttribute( 'color', new BufferAttribute( colours, 4 ).setUsage( DynamicDrawUsage ) );
	geometry.setDrawRange( 0, 0 );
	const mesh = new Mesh( geometry, new MeshBasicMaterial( { vertexColors: true, transparent: true, side: DoubleSide, depthWrite: false } ) );
	// Its bounds change every frame; it's never far from the vehicle, which is on screen.
	mesh.frustumCulled = false;
	mesh.raycast = () => {};
	mesh.visible = false;
	root.add( mesh );

	const points = Array.from( { length: RIBBON_POINTS }, () => ( { left: new Vector3(), right: new Vector3(), born: - Infinity } ) );
	let head = 0;
	let clock = 0;
	let due = 0;

	// The newest point, across the back of the vehicle as it is now.
	function across( point, pivot, size ) {

		const half = size.width * 0.28 / size.scale;
		const up = size.height * 0.3 / size.scale;
		const back = ( size.rear + 0.05 ) / size.scale;
		pivot.localToWorld( point.left.set( - half, up, back ) );
		pivot.localToWorld( point.right.set( half, up, back ) );

	}

	return {

		mesh,

		update( pivot, size, power, dt ) {

			clock += dt;
			if ( power > 0 ) {

				due -= dt;
				if ( due <= 0 ) {

					due = RIBBON_STEP;
					head = ( head + 1 ) % RIBBON_POINTS;
					points[ head ].born = clock;

				}

				// Kept on the vehicle until the next point is laid, so the ribbon stays joined to it.
				across( points[ head ], pivot, size );

			} else due = 0;

			let count = 0;
			for ( ; count < RIBBON_POINTS; count ++ ) {

				const point = points[ ( head - count + RIBBON_POINTS ) % RIBBON_POINTS ];
				const age = clock - point.born;
				if ( age > RIBBON_LIFE ) break;
				const fade = ( 1 - age / RIBBON_LIFE ) * 0.85;
				for ( let edge = 0; edge < row; edge ++ ) {

					// Edge 2b and 2b + 1 are band b's left and right.
					const vertex = count * row + edge;
					_across.lerpVectors( point.left, point.right, ( ( edge >> 1 ) + ( edge & 1 ) ) / bands ).toArray( positions, vertex * 3 );
					colours[ vertex * 4 + 3 ] = fade;

				}

			}

			mesh.visible = count > 1;
			geometry.setDrawRange( 0, Math.max( 0, count - 1 ) * bands * 6 );
			if ( mesh.visible ) {

				geometry.attributes.position.needsUpdate = true;
				geometry.attributes.color.needsUpdate = true;

			}

		},

	};

}

// Foam on the water's surface: rings spreading out from a splash and from a vehicle bobbing in the
// water, and a patch of foam where it went in, each a flat quad (sharing one shape) grown and
// faded in place. A few of each, reused oldest first.
function makeFoam( root ) {

	const { ring, patch } = getWaterTextures();
	const flat = new PlaneGeometry( 2, 2 ).rotateX( - Math.PI / 2 );
	const make = map => {

		// Just over the surface (the world draws with a logarithmic depth buffer, which a polygon
		// offset doesn't move).
		const mesh = new Mesh( flat, new MeshBasicMaterial( { map, transparent: true, depthWrite: false } ) );
		mesh.visible = false;
		mesh.raycast = () => {};
		root.add( mesh );
		return { mesh, age: Infinity, wait: 0, life: 1, from: 1, to: 1, peak: 1 };

	};

	const rings = Array.from( { length: RINGS }, () => make( ring ) );
	const patches = [ make( patch ), make( patch ) ];
	let nextRing = 0;
	let nextPatch = 0;

	// After `wait` s, grow from `from` to `to` m across over `life` s, fading from `peak`.
	function start( item, at, wait, life, from, to, peak ) {

		item.mesh.position.copy( at ).setY( at.y + 0.06 );
		item.mesh.visible = false;
		Object.assign( item, { age: 0, wait, life, from, to, peak } );

	}

	function grow( item, dt ) {

		if ( item.age > item.wait + item.life ) return;
		item.age += dt;
		const t = ( item.age - item.wait ) / item.life;
		item.mesh.visible = t >= 0 && t < 1;
		if ( ! item.mesh.visible ) return;
		item.mesh.scale.setScalar( item.from + ( item.to - item.from ) * ( 1 - ( 1 - t ) ** 2 ) );
		item.mesh.material.opacity = item.peak * ( 1 - t ) * Math.min( 1, t * 8 );

	}

	return {

		splash( at, power, width ) {

			const from = width * 0.55;
			start( rings[ nextRing ], at, 0, RING_LIFE, from, from + RING_REACH + 3 * power, 0.8 );
			nextRing = ( nextRing + 1 ) % rings.length;
			start( patches[ nextPatch ], at, 0, FOAM_LIFE, width * 0.6, width * ( 1.2 + power * 0.4 ), 0.7 );
			nextPatch = ( nextPatch + 1 ) % patches.length;

		},

		// A smaller ring from a vehicle `width` m wide bobbing at `at`.
		ripple( at, width ) {

			const from = width * 0.5;
			start( rings[ nextRing ], at, 0, RING_LIFE * 0.8, from, from + RIPPLE_REACH, 0.55 );
			nextRing = ( nextRing + 1 ) % rings.length;

		},

		update( dt ) {

			for ( const item of rings ) grow( item, dt );
			for ( const item of patches ) grow( item, dt );

		},

	};

}
