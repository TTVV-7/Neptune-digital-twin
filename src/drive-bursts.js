import { AdditiveBlending, Color, Vector3 } from 'three';
import { ALONG, Batch, FACING, FLAT, SHAPES } from './drive-boosts.js';

// The bursts that mark what driving does, made for World Drive's booster, drifts and boost pads
// (drive-fx.js makes them only for a Driver with those on, so the construction app never has any):
// - the booster lighting: a flash and a flare at the exhaust, a shock ring blown out behind it and
//   sparks popping out of it, in the boost style's colour (each style adds a burst of its own, see
//   drive-boosts.js);
// - the booster running dry: the exhaust glowing on for a moment and cooling, white-hot to red to
//   nothing, with a few embers drifting off;
// - a boost pad driven over: a ring spreading over it, chevrons rising off it and sparkles;
// - each of a drift's charge levels reached: a little burst of sparks and a ring at each rear tyre
//   in that level's colour; and its mini-turbo let go: a flash, a ring and a spray of sparks out
//   of the exhaust in the same colour.
// One batch of quads (drive-boosts.js's), made once with a fixed budget, the oldest reused when
// it's full: nothing is made as they go off. `detail` (0 to 1) thins out the sparks on a phone.

const BUDGET = 160;
// Drift charge levels' colours (as drive-fx.js's sparks have them).
const LEVELS = [ 0xffc83d, 0x3dffd8, 0xff3df0 ];
// The exhaust cooling once the booster runs dry: how long it glows (s), and the colours it goes
// through from its tint.
const COOL_TIME = 0.9;
const EMBER = new Color( 0xff5a1f );
const ASH = new Color( 0x6a1000 );
// A spark is drawn this long (m) for each m/s it flies at, give or take.
const STRETCH = 0.03;
// A boost pad's burst is carried along at this share of the vehicle's speed, so it's seen round
// the vehicle rather than left on the pad behind it, under the camera.
const PAD_CARRY = 0.9;

const UP = new Vector3( 0, 1, 0 );
const STILL = new Vector3();
const _v = new Vector3();
const _a = new Vector3();

export function createBursts( root, { detail = 1 } = {} ) {

	const batch = new Batch( root, { particles: BUDGET, quads: 2, blending: AdditiveBlending } );
	batch.mesh.name = 'drive-bursts';
	const tint = new Color();
	const glow = new Color();
	const cooling = { left: 0, tint: new Color(), size: 1 };

	const count = n => Math.max( 1, Math.round( n * detail ) );

	// A spark flying off `at` at `velocity` (m/s, its own) on top of `carry`: a strip along the way
	// it goes, its hot head first.
	function spark( at, velocity, carry, life, width, colour ) {

		const p = batch.spawn( life );
		p.position.copy( at );
		p.velocity.copy( velocity );
		p.carry.copy( carry );
		p.mode = ALONG;
		p.frame = SHAPES.spark;
		const speed = velocity.length();
		p.axis.copy( velocity ).multiplyScalar( speed > 1e-3 ? Math.max( 0.06, speed * STRETCH ) / speed : 0 );
		p.size = width;
		p.colour.set( colour );
		p.drag = 3;
		p.fall = 0.4;
		return p;

	}

	// A glow at `at`, facing the camera: `size` (m, half across) growing by `grow` over `life` s.
	function flash( at, carry, life, size, grow, colour, alpha = 1, picture = SHAPES.glow, aspect = 1 ) {

		const p = batch.spawn( life );
		p.position.copy( at );
		p.carry.copy( carry );
		p.frame = picture;
		p.size = size;
		p.grow = grow;
		p.aspect = aspect;
		p.colour.set( colour );
		p.alpha = alpha;
		p.kind = 1;
		return p;

	}

	// A ring lying across `normal` at `at`.
	function ring( at, normal, carry, life, size, grow, colour, alpha = 1, picture = SHAPES.shock ) {

		const p = batch.spawn( life );
		p.position.copy( at );
		p.carry.copy( carry );
		p.axis.copy( normal );
		p.mode = FLAT;
		p.frame = picture;
		p.size = size;
		p.grow = grow;
		p.colour.set( colour );
		p.alpha = alpha;
		p.kind = 2;
		return p;

	}

	const hooks = {
		look( p, t, view ) {

			// Flashes and rings go fast and then linger as they fade; sparks burn out at the end.
			if ( p.kind === 1 ) view.alpha = p.alpha * ( 1 - t ) ** 2;
			else if ( p.kind === 2 ) {

				view.sx = view.sy = p.size + p.grow * ( 1 - ( 1 - t ) ** 3 );
				view.alpha = p.alpha * ( 1 - t ) ** 1.5;

			} else if ( p.kind === 3 ) {

				// A chevron rises, swelling in and fading out.
				view.sy = view.sx * 0.8;
				view.alpha = p.alpha * Math.min( 1, t * 6 ) * ( 1 - t );

			} else if ( p.kind === 4 ) view.alpha = p.alpha * ( 0.6 + 0.4 * Math.sin( p.age * 40 + p.phase ) ) * ( 1 - t );

		},
	};

	return {

		// Each frame, after drive-fx.js has its `frame` (drive-boosts.js's): the bursts move and fade,
		// and a cooling exhaust glows on at its nozzle.
		update( frame ) {

			batch.begin();
			if ( cooling.left > 0 ) {

				cooling.left = Math.max( 0, cooling.left - frame.dt );
				const t = 1 - cooling.left / COOL_TIME;
				// White-hot in its tint, through orange to a dull red, and out.
				if ( t < 0.35 ) glow.lerpColors( cooling.tint, EMBER, t / 0.35 );
				else glow.lerpColors( EMBER, ASH, ( t - 0.35 ) / 0.65 );
				const size = cooling.size * ( 1 - 0.45 * t ) * ( 0.95 + 0.05 * Math.sin( frame.clock * 37 ) );
				// A little behind the exhaust, so the bodywork round it doesn't hide it.
				_v.copy( frame.nozzle ).addScaledVector( frame.back, 0.12 * frame.scale );
				batch.put( _v, frame.up, FACING, size, size, 0, SHAPES.glow, glow, ( 1 - t ) ** 1.1 * 0.95 );
				batch.put( _v, frame.up, FACING, size * 0.45, size * 0.45, 0, SHAPES.glow, glow, ( 1 - t ) ** 2 );

			}

			batch.update( frame.dt, hooks );

		},

		// The booster lighting, in `colour`: a flash and a flare at the exhaust, a shock ring blown
		// out behind and sparks popping out of it. `calm`: no flare (the visitor asked for less motion).
		ignite( frame, colour, calm = false ) {

			tint.set( colour );
			cooling.left = 0;
			const { nozzle, back, scale } = frame;
			_a.copy( frame.velocity ).multiplyScalar( 0.9 );
			flash( nozzle, _a, 0.16, 0.4 * scale, 0.6 * scale, 0xffffff );
			flash( nozzle, _a, 0.22, 0.5 * scale, 1.1 * scale, tint, 0.85 );
			if ( ! calm ) flash( nozzle, _a, 0.24, 1.1 * scale, 1.1 * scale, tint, 0.75, SHAPES.flare, 0.3 );
			// Kept close behind it as it spreads, never back over the camera.
			_a.copy( frame.velocity ).multiplyScalar( 0.94 );
			ring( _v.copy( nozzle ).addScaledVector( back, 0.25 * scale ), back, _a, 0.36, 0.25 * scale, 1.3 * scale, tint, 0.7 );
			ring( _v.copy( nozzle ).addScaledVector( back, 0.1 * scale ), back, _a, 0.24, 0.15 * scale, 0.8 * scale, 0xffffff, 0.75, SHAPES.ring );
			_a.copy( frame.velocity ).multiplyScalar( 0.8 );
			for ( let i = count( 14 ); i > 0; i -- ) {

				_v.set( Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5 ).multiplyScalar( 6 ).addScaledVector( back, 7 + Math.random() * 6 );
				spark( nozzle, _v, _a, 0.22 + Math.random() * 0.15, 0.07 * scale, i % 3 ? tint : 0xffffff );

			}

		},

		// The booster run dry: its exhaust glows on and cools (see update), and embers drift off it.
		cool( frame, colour ) {

			tint.set( colour );
			cooling.left = COOL_TIME;
			cooling.tint.set( colour );
			cooling.size = 0.6 * frame.scale;
			_a.copy( frame.velocity ).multiplyScalar( 0.9 );
			for ( let i = count( 12 ); i > 0; i -- ) {

				const p = batch.spawn( 0.5 + Math.random() * 0.4 );
				p.position.copy( frame.nozzle ).addScaledVector( frame.right, ( Math.random() - 0.5 ) * 0.3 * frame.scale );
				p.carry.copy( _a );
				p.velocity.set( Math.random() - 0.5, Math.random() * 0.5, Math.random() - 0.5 ).multiplyScalar( 1.6 ).addScaledVector( frame.back, 1.2 ).addScaledVector( frame.up, 0.8 );
				p.frame = SHAPES.glow;
				p.size = ( 0.05 + Math.random() * 0.06 ) * frame.scale;
				p.colour.copy( i % 2 ? EMBER : tint );
				p.fall = 0.15;
				p.drag = 1.5;
				p.kind = 4;

			}

		},

		// A boost pad driven over at `at` (world, on the ground), `radius` m across, in `colour`, by a
		// vehicle going at `velocity` (world, m/s): a ring spreading out over it, chevrons rising off
		// it and sparkles thrown up round it, carried along with the vehicle.
		pickup( at, colour, radius, velocity = STILL ) {

			_a.copy( velocity ).multiplyScalar( PAD_CARRY );
			ring( _v.copy( at ).setY( at.y + 0.08 ), UP, _a, 0.45, radius * 0.6, radius * 1.1, colour, 1, SHAPES.ring );
			ring( _v.copy( at ).setY( at.y + 0.12 ), UP, _a, 0.5, radius * 0.8, radius, colour, 0.6 );
			for ( let i = 0; i < 3; i ++ ) {

				const p = batch.spawn( 0.45 + i * 0.06 );
				p.position.copy( at ).setY( at.y + 0.5 + i * 0.4 );
				// The chevrons keep up with it, rising over where the pad was taken.
				p.carry.copy( velocity );
				p.velocity.set( 0, 1.8 + i * 0.3, 0 );
				p.frame = SHAPES.chevron;
				p.size = Math.min( 0.45, radius * 0.25 ) * ( 1 - i * 0.12 );
				p.colour.set( colour );
				p.kind = 3;

			}

			for ( let i = count( 14 ); i > 0; i -- ) {

				const p = batch.spawn( 0.5 + Math.random() * 0.35 );
				const angle = Math.random() * Math.PI * 2;
				p.position.copy( at ).add( _v.set( Math.cos( angle ) * radius * 0.8, 0.15, Math.sin( angle ) * radius * 0.8 ) );
				p.carry.copy( _a );
				p.velocity.set( Math.cos( angle ) * 1.2, 2.5 + Math.random() * 2.5, Math.sin( angle ) * 1.2 );
				p.frame = SHAPES.star;
				p.size = 0.09 + Math.random() * 0.07;
				p.colour.set( i % 3 ? colour : 0xffffff );
				p.drag = 1.2;
				p.fall = 0.3;
				p.kind = 4;

			}

		},

		// A drift's charge level `level` (1 to 3) reached: at each of the rear tyres `wheels` (world),
		// a flash, a ring on the ground and a burst of sparks in its colour.
		tier( frame, level, wheels ) {

			const colour = LEVELS[ level - 1 ] ?? LEVELS[ 0 ];
			_a.copy( frame.velocity ).multiplyScalar( 0.85 );
			for ( const at of wheels ) {

				flash( at, _a, 0.16, 0.25 * frame.scale, 0.5 * frame.scale, colour );
				ring( at, frame.up, _a, 0.3, 0.15 * frame.scale, ( 0.8 + 0.2 * level ) * frame.scale, colour, 0.9, SHAPES.ring );
				for ( let i = count( 5 + 2 * level ); i > 0; i -- ) {

					_v.set( Math.random() - 0.5, 0.4 + Math.random() * 0.6, Math.random() - 0.5 ).multiplyScalar( 5 ).addScaledVector( frame.back, 2 );
					spark( at, _v, _a, 0.25 + Math.random() * 0.15, 0.05 * frame.scale, i % 3 ? colour : 0xffffff );

				}

			}

		},

		// A drift's mini-turbo let go, of level `level`: a flash and a ring at the exhaust and a spray
		// of sparks out of it, bigger the bigger the boost, in its colour.
		turbo( frame, level ) {

			const colour = LEVELS[ level - 1 ] ?? LEVELS[ 0 ];
			const { nozzle, back, scale } = frame;
			const big = 0.7 + 0.3 * level;
			_a.copy( frame.velocity ).multiplyScalar( 0.9 );
			flash( nozzle, _a, 0.2, 0.6 * scale * big, 0.9 * scale * big, colour );
			flash( nozzle, _a, 0.14, 0.4 * scale * big, 0.5 * scale, 0xffffff );
			_a.copy( frame.velocity ).multiplyScalar( 0.94 );
			ring( _v.copy( nozzle ).addScaledVector( back, 0.2 * scale ), back, _a, 0.3, 0.2 * scale, 0.9 * scale * big, colour, 0.75 );
			_a.copy( frame.velocity ).multiplyScalar( 0.8 );
			for ( let i = count( 10 + 6 * level ); i > 0; i -- ) {

				_v.set( Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5 ).multiplyScalar( 6 ).addScaledVector( back, 6 + Math.random() * 5 );
				spark( nozzle, _v, _a, 0.2 + Math.random() * 0.2, 0.06 * scale, i % 3 ? colour : 0xffffff );

			}

		},

		// How many are alive, and the most there can be.
		get alive() {

			return batch.alive + ( cooling.left > 0 ? 1 : 0 );

		},

		get budget() {

			return batch.capacity;

		},

	};

}
