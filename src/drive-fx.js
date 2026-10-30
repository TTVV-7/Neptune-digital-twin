import {
	AdditiveBlending,
	CanvasTexture,
	Color,
	ConeGeometry,
	Group,
	Mesh,
	MeshBasicMaterial,
	SRGBColorSpace,
	Sprite,
	SpriteMaterial,
	Vector3,
} from 'three';

// What driving shows besides the vehicle: the booster's flame and glow, tyre smoke while drifting
// and the sparks that say how big the drift boost will be. Kept cheap: a few cones and sprites,
// reused from small pools, nothing that casts or catches rays.

const SMOKE_POOL = 48;
const SPARK_POOL = 40;
const SMOKE_LIFE = 0.9;
const SPARK_LIFE = 0.28;
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

	function pool( size, material ) {

		const items = [];
		for ( let i = 0; i < size; i ++ ) {

			const sprite = new Sprite( material() );
			sprite.visible = false;
			sprite.raycast = () => {};
			root.add( sprite );
			items.push( { sprite, age: Infinity, life: 1, velocity: new Vector3(), size: 1, grow: 0 } );

		}

		return { items, next: 0 };

	}

	function emit( from, at, velocity, life, size, grow, colour ) {

		const item = from.items[ from.next ];
		from.next = ( from.next + 1 ) % from.items.length;
		item.sprite.position.copy( at );
		item.velocity.copy( velocity );
		item.age = 0;
		item.life = life;
		item.size = size;
		item.grow = grow;
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
			item.sprite.position.addScaledVector( item.velocity, dt );
			item.sprite.scale.setScalar( item.size + item.grow * t );
			item.sprite.material.opacity = fade * ( 1 - t );

		}

	}

	let smokeDue = 0;
	let sparkDue = 0;
	let flicker = 0;
	const colour = new Color();

	return {

		// Each frame, with the vehicle's pivot and size and what it's doing:
		// { pivot, size: { width, height, rear, scale }, wheels: [ local points of the rear tyres
		// on the ground ], velocity: its own (m/s, world), flame: 0..1 (booster 1, a drift boost
		// less), drifting, level: 0..3, dt }.
		update( { pivot, size, wheels, velocity, flame: power, drifting, level, dt } ) {

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

						pivot.localToWorld( _p.copy( wheel ) );
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

			age( smoke, dt, 0.7 );
			age( sparks, dt, 1 );

		},

		dispose() {

			world.remove( root );
			root.traverse( o => {

				// Sprites share one geometry across the whole app; the textures are shared too.
				if ( ! o.isSprite ) o.geometry?.dispose();
				o.material?.dispose();

			} );

		},

	};

}
