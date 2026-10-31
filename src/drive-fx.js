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
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	SRGBColorSpace,
	Sprite,
	SpriteMaterial,
	Vector3,
} from 'three';

// What driving shows besides the vehicle: the booster's flame and glow, tyre smoke while drifting
// and the sparks that say how big the drift boost will be; and with stunts, sparks, bits and a
// flash where it hits something, sparks while it scrapes along a wall and dust where it comes down
// hard. An app can colour the flame and add a trail behind the vehicle while it boosts or flies
// (World Drive's Garage): coloured smoke, sparkles or a rainbow ribbon. Kept cheap: a few cones,
// sprites and little boxes, reused from small pools, and one ribbon whose buffers are written in
// place, nothing made each frame and nothing that casts or catches rays.

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

const _v = new Vector3();
const _p = new Vector3();
const _across = new Vector3();

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

// world: the group effects that stay behind (smoke, sparks) are added to. The flame follows the
// vehicle's pivot each frame but isn't part of it, so it never counts as the vehicle's own shape.
// look: { flame: a name in FLAMES, or 'rainbow' (orange if not given), trail: null or { kind:
// 'smoke', 'sparkle' or 'ribbon', colour (smoke's) } }.
export function createDriveFx( world, { flame: flameName = 'orange', trail = null } = {} ) {

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

	return {

		// Each frame, with the vehicle's pivot and size and what it's doing:
		// { pivot, size: { width, height, rear, scale }, wheels: [ local points of the rear tyres
		// on the ground ], velocity: its own (m/s, world), flame: 0..1 (booster 1, a drift boost
		// less), drifting, level: 0..3, scrape: { at, normal } where it's scraping along a wall
		// (world) or null, dt }.
		update( { pivot, size, wheels, velocity, flame: power, trail: trailPower = 0, drifting, level, scrape = null, dt } ) {

			flicker += dt;
			flame.visible = power > 0.01;
			if ( flame.visible && rainbow ) {

				const hue = flicker / RAINBOW_TURN % 1;
				outer.material.color.setHSL( hue, 1, 0.55 );
				halo.material.color.setHSL( ( hue + 0.08 ) % 1, 1, 0.65 );

			}

			if ( flame.visible ) {

				// Behind the rear, a third of the way up, sized to the vehicle and pointing back.
				const scale = Math.max( 0.35, Math.min( size.width, size.height ) * 0.45 );
				pivot.localToWorld( flame.position.set( 0, size.height * 0.33 / size.scale, ( size.rear + 0.02 ) / size.scale ) );
				pivot.getWorldQuaternion( flame.quaternion );
				const jitter = 0.85 + 0.3 * Math.abs( Math.sin( flicker * 47 ) * Math.sin( flicker * 31 ) );
				flame.scale.set( scale * power, scale * power, scale * ( 0.6 + power * 2.6 ) * jitter );
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
