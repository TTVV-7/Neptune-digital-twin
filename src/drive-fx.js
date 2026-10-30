import {
	AdditiveBlending,
	BoxGeometry,
	CanvasTexture,
	Color,
	ConeGeometry,
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
// hard. Kept cheap: a few cones, sprites and little boxes, reused from small pools, nothing that
// casts or catches rays.

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

const _v = new Vector3();
const _p = new Vector3();

let textures = null;
function getTextures() {

	textures ??= { soft: radial( [ [ 0, 'rgba(255,255,255,1)' ], [ 0.4, 'rgba(255,255,255,0.55)' ], [ 1, 'rgba(255,255,255,0)' ] ] ),
		glow: radial( [ [ 0, 'rgba(255,255,255,1)' ], [ 0.25, 'rgba(255,220,160,0.8)' ], [ 0.6, 'rgba(255,120,40,0.25)' ], [ 1, 'rgba(255,80,0,0)' ] ] ) };
	return textures;

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
export function createDriveFx( world ) {

	const { soft, glow } = getTextures();
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

	function pool( size, material ) {

		const items = [];
		for ( let i = 0; i < size; i ++ ) {

			const sprite = new Sprite( material() );
			sprite.visible = false;
			sprite.raycast = () => {};
			root.add( sprite );
			items.push( { sprite, age: Infinity, life: 1, velocity: new Vector3(), size: 1, grow: 0, fall: 0 } );

		}

		return { items, next: 0 };

	}

	// `fall`: the share of gravity it falls with (a hit's sparks), 0 for what floats or rises.
	function emit( from, at, velocity, life, size, grow, colour, fall = 0 ) {

		const item = from.items[ from.next ];
		from.next = ( from.next + 1 ) % from.items.length;
		item.sprite.position.copy( at );
		item.velocity.copy( velocity );
		item.age = 0;
		item.life = life;
		item.size = size;
		item.grow = grow;
		item.fall = fall;
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
			item.sprite.scale.setScalar( item.size + item.grow * t );
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
	let flicker = 0;
	const colour = new Color();

	return {

		// Each frame, with the vehicle's pivot and size and what it's doing:
		// { pivot, size: { width, height, rear, scale }, wheels: [ local points of the rear tyres
		// on the ground ], velocity: its own (m/s, world), flame: 0..1 (booster 1, a drift boost
		// less), drifting, level: 0..3, scrape: { at, normal } where it's scraping along a wall
		// (world) or null, dt }.
		update( { pivot, size, wheels, velocity, flame: power, drifting, level, scrape = null, dt } ) {

			flicker += dt;
			flame.visible = power > 0.01;
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
