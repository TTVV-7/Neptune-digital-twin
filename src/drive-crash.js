import { AdditiveBlending, Color, NormalBlending, Vector3 } from 'three';
import { ALONG, Batch, FACING, FLAT, SHAPES } from './drive-boosts.js';

// What crashing looks like with stunts on (drive-fx.js makes it for any Driver with effects, and
// for each ghost's): a hit on a wall in layers by how hard it was (a white-hot flash and a
// starburst where it hit, a shock ring spreading round the wall, streaks of sparks that fall and
// bounce once off the ground, and a little dust), scraping along a wall (a fountain of sparks
// thrown back along it the faster it goes, a glow where it rubs and scuff marks left on the wall),
// a wipeout slamming down (a ring of dust over the ground, dust spreading and sparks skidding off
// along the way it slides), getting back on its wheels (a puff of dust and a thin ring), and
// coming down hard (a dust ring as wide as the landing was hard, and dust thrown out round it).
// On the Moon there's no air: no smoke or dust billowing, only grains of regolith thrown up in
// long ballistic arcs, which fall back by its gravity.
//
// Two batches of quads (drive-boosts.js's), each made once with a fixed budget, the oldest reused
// when it's full: one added over the scene (sparks, flashes, rings, glints) and one drawn over it
// (dust, smoke, regolith, scuff marks), which in daylight reads as dust rather than glowing.
// Nothing is made as they go off. They read `effects` as they go: `detail` thins every emitter (a
// phone's 0.6), `calm` (a visitor asking for less motion) leaves out the flashes, flares and
// twinkles and keeps the rings faint, and `air` false (the Moon) swaps dust for regolith.

const SPARKS = 140;
const DUST = 48;
// A spark is drawn this long (m) for each m/s it flies at, give or take, but never shorter than
// SPARK_SHORTEST.
const STRETCH = 0.035;
const SPARK_SHORTEST = 0.07;
// How wide (m, half across) a hit's sparks are drawn, a scrape's, and a wipeout's: wide enough to
// read in daylight from the chase camera, not hairlines.
const HIT_WIDTH = 0.085;
const SCRAPE_WIDTH = 0.06;
const SLAM_WIDTH = 0.07;
// Bouncing off the ground once: what's kept of its speed up (and across).
const BOUNCE = 0.35;
// Kinds of particle, which say how each looks over its life (see look below).
const SPARK = 0;
const FLASH = 1;
const RING = 2;
const GLINT = 3;
const PUFF = 4;
const GRAIN = 5;
const SCUFF = 6;
// A hot glowing bead of metal: round, falling and bouncing as a spark does.
const EMBER = 7;
// A ring at most this bright for a visitor asking for less motion.
const CALM_RING = 0.3;
// The colours of a hit's sparks (white-hot, gold and orange, in turn), of dust and smoke on the
// Earth, of regolith on the Moon, and of a scuff mark on a wall (rubber and paint; on the Moon,
// grey dust smeared).
const HOT = [ 0xfff6d8, 0xffc94a, 0xff8a1a ].map( hex => new Color( hex ) );
const SCRAPE_HEAD = new Color( 0xfff6d8 );
const SCRAPE_TAIL = new Color( 0xffb347 );
// (A hit's smoke darker than the road and the sky, so it reads over both.)
const SMOKE = new Color( 0x6b6259 );
const DUSTY = new Color( 0xe6ddcc );
const SLAM = new Color( 0xd9d0c0 );
const REGOLITH = new Color( 0xb9b4aa );
const SCUFF_EARTH = new Color( 0x1e1e1e );
const SCUFF_MOON = new Color( 0x8a8a8a );
const RUB = new Color( 0xffe6b0 );
const WHITE = new Color( 0xffffff );
const FLARE = new Color( 0xffd27a );
// Scraping: sparks at SCRAPE_RATE a second, and SCRAPE_SPEED more for each m/s it scrapes at; a scuff
// mark every SCUFF_STEP s, lasting SCUFF_LIFE s and fading over the last SCUFF_FADE of them. Sliding
// on its roof in a wipeout: a puff and a spark every WIPE_STEP s.
const SCRAPE_RATE = 40;
const SCRAPE_SPEED = 6;
const SCUFF_STEP = 0.1;
const SCUFF_LIFE = 3;
const SCUFF_FADE = 1.5;
const WIPE_STEP = 0.05;

const UP = new Vector3( 0, 1, 0 );
const STILL = new Vector3();
const _v = new Vector3();
const _a = new Vector3();
const _p = new Vector3();
const _side = new Vector3();

// root: the group they're added to. effects: as drive-fx.js's EFFECTS, read as they're needed.
export function createCrashes( root, effects = {} ) {

	// The dust first, so the sparks are added over it.
	const dust = new Batch( root, { particles: DUST, blending: NormalBlending } );
	dust.mesh.name = 'drive-crash-dust';
	const sparks = new Batch( root, { particles: SPARKS, quads: 2, blending: AdditiveBlending } );
	sparks.mesh.name = 'drive-crash';
	// Each spark's own floor to bounce off once (the ground under where it flew from), set up here
	// once rather than added as it's spawned.
	for ( const p of sparks.items ) {

		p.floor = - Infinity;
		p.bounced = false;

	}

	// A scrape's glow where it rubs, put down for the next update (see scrape).
	const rub = { on: false, at: new Vector3(), size: 0 };
	let clock = 0;
	let sparkDue = 0;
	let scuffDue = 0;
	let wipeDue = 0;

	const calm = () => !! effects.calm;
	const air = () => effects.air !== false;
	const count = n => Math.max( 1, Math.round( n * ( effects.detail ?? 1 ) ) );

	// A spark flying off `at` at `velocity` (m/s) on top of `carry`: a strip along the way it goes,
	// its hot head first, falling and bouncing once off `floor` (a height, world; -Infinity for
	// none).
	function spark( at, velocity, carry, life, width, colour, floor = - Infinity ) {

		const p = sparks.spawn( life );
		p.position.copy( at );
		p.velocity.copy( velocity );
		p.carry.copy( carry );
		p.mode = ALONG;
		p.frame = SHAPES.spark;
		stretch( p );
		p.size = width;
		p.colour.copy( colour );
		p.fall = 1;
		p.drag = 2;
		p.floor = floor;
		p.bounced = false;
		return p;

	}

	// A hot bead of metal flying off `at` at `velocity`: a round glow, falling and bouncing off
	// `floor` once as a spark does (what reads of a hit's sparks from afar, in daylight).
	function ember( at, velocity, life, size, colour, floor = - Infinity ) {

		const p = sparks.spawn( life );
		p.position.copy( at );
		p.velocity.copy( velocity );
		// (Softer, without a hot core, for a visitor asking for less motion.)
		p.frame = calm() ? SHAPES.soft : SHAPES.glow;
		p.size = size;
		p.colour.copy( colour );
		p.fall = 1;
		p.drag = 1.5;
		p.floor = floor;
		p.bounced = false;
		p.kind = EMBER;
		return p;

	}

	function stretch( p ) {

		const speed = p.velocity.length();
		p.axis.copy( p.velocity ).multiplyScalar( speed > 1e-3 ? Math.max( SPARK_SHORTEST, speed * STRETCH ) / speed : 0 );

	}

	// A glow facing the camera at `at`: `size` (m, half across) growing by `grow` over `life` s.
	function flash( at, life, size, grow, colour, alpha = 1, picture = SHAPES.glow, aspect = 1, turn = 0 ) {

		const p = sparks.spawn( life );
		p.position.copy( at );
		p.frame = picture;
		p.size = size;
		p.grow = grow;
		p.aspect = aspect;
		p.turn = turn;
		p.colour.copy( colour );
		p.alpha = alpha;
		p.kind = FLASH;
		return p;

	}

	// A ring lying across `normal` at `at`, in `batch` (the sparks', added; or the dust's, drawn
	// over): fainter and spreading less for a visitor asking for less motion.
	function ring( batch, at, normal, life, size, grow, colour, alpha, picture = SHAPES.ring ) {

		const p = batch.spawn( life );
		p.position.copy( at );
		p.axis.copy( normal );
		p.mode = FLAT;
		p.frame = picture;
		p.size = size;
		p.grow = calm() ? Math.min( grow, size * 1.2 + 0.6 ) : grow;
		p.colour.copy( colour );
		p.alpha = calm() ? Math.min( alpha, CALM_RING ) : alpha;
		p.kind = RING;
		return p;

	}

	// A puff of dust or smoke (Earth), or with no air (the Moon) a grain of regolith thrown up by it
	// instead, falling back in a long slow arc.
	function puff( at, velocity, life, size, grow, colour, alpha ) {

		const p = dust.spawn( life );
		p.position.copy( at );
		p.velocity.copy( velocity );
		p.frame = SHAPES.puff;
		p.size = size;
		p.grow = grow;
		p.turn = Math.random() * Math.PI * 2;
		p.spin = ( Math.random() - 0.5 ) * 1.5;
		p.colour.copy( colour );
		p.alpha = alpha;
		p.drag = 2;
		p.kind = PUFF;
		return p;

	}

	function grain( at, velocity, life ) {

		const p = dust.spawn( life );
		p.position.copy( at );
		p.velocity.copy( velocity );
		p.frame = SHAPES.soft;
		p.size = 0.035 + Math.random() * 0.035;
		p.colour.copy( REGOLITH );
		p.fall = 1;
		p.kind = GRAIN;
		return p;

	}

	// A random way off a surface facing `normal`, tipped up a little, at about `speed` (m/s).
	function spray( normal, speed, spread, target ) {

		target.set( Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5 ).multiplyScalar( 2 * spread ).add( normal ).normalize();
		target.y = Math.abs( target.y ) * 0.8 + 0.3;
		return target.normalize().multiplyScalar( speed * ( 0.5 + Math.random() ) );

	}

	// Thrown out round `at` over the ground: `n` puffs of dust, or on the Moon grains of regolith in a
	// crown, out at `out` m/s and up at `rise`.
	function ground( at, n, reach, out, rise, life, size, grow, colour, alpha ) {

		const moon = ! air();
		for ( let i = 0; i < n; i ++ ) {

			const angle = ( i + Math.random() * 0.6 ) / n * Math.PI * 2;
			_p.set( Math.cos( angle ) * reach, moon ? 0.05 : 0.25 + Math.random() * 0.2, Math.sin( angle ) * reach ).add( at );
			const speed = out * ( 0.7 + Math.random() * 0.6 );
			if ( moon ) {

				// Up and out much faster than dust spreads: a crown of grains, no billow.
				_v.set( Math.cos( angle ) * speed, ( 1.5 + Math.random() * 2.5 ) * ( 0.6 + rise ), Math.sin( angle ) * speed );
				grain( _p, _v, 1.5 + Math.random() * 0.7 );

			} else {

				_v.set( Math.cos( angle ) * speed, rise * ( 0.6 + Math.random() * 0.8 ), Math.sin( angle ) * speed );
				puff( _p, _v, life * ( 0.8 + Math.random() * 0.4 ), size, grow, colour, alpha );

			}

		}

	}

	const sparkHooks = {
		step( p, dt ) {

			if ( p.mode !== ALONG && p.kind !== EMBER ) return;
			// Down onto the ground under where it flew from: off it once, slower, and then on through.
			if ( ! p.bounced && p.position.y < p.floor && p.velocity.y < 0 ) {

				p.position.y = p.floor;
				p.velocity.set( p.velocity.x * 0.5, - p.velocity.y * BOUNCE, p.velocity.z * 0.5 );
				p.bounced = true;

			}

			if ( p.mode === ALONG ) stretch( p );

		},
		look( p, t, view ) {

			if ( p.kind === FLASH ) view.alpha = p.alpha * ( 1 - t ) ** 2;
			else if ( p.kind === RING ) {

				view.sx = view.sy = p.size + p.grow * ( 1 - ( 1 - t ) ** 3 );
				view.alpha = p.alpha * ( 1 - t ) ** 1.5;

			} else if ( p.kind === GLINT ) {

				// A chip of glass catching the light as it tumbles (steady for a visitor asking for less
				// motion).
				view.alpha = p.alpha * ( 1 - t ) * ( calm() ? 0.7 : 0.4 + 0.6 * Math.max( 0, Math.sin( p.age * 45 + p.phase ) ) );

			} else view.alpha = p.alpha * ( 1 - t * t );

		},
	};

	const dustHooks = {
		look( p, t, view ) {

			if ( p.kind === PUFF ) view.alpha = p.alpha * Math.min( 1, t * 8 ) * ( 1 - t ) ** 1.4;
			else if ( p.kind === RING ) {

				view.sx = view.sy = p.size + p.grow * ( 1 - ( 1 - t ) ** 3 );
				view.alpha = p.alpha * ( 1 - t ) ** 1.2;

			} else if ( p.kind === SCUFF ) {

				view.sx = p.size;
				view.sy = p.size * p.aspect;
				view.alpha = p.alpha * Math.min( 1, ( p.life - p.age ) / SCUFF_FADE );

			} else if ( p.kind === GRAIN ) view.alpha = p.alpha * Math.min( 1, ( 1 - t ) * 4 );

		},
	};

	return {

		// Each frame (`frame` drive-fx.js's, `dt` slowed for a moment by a hit's hitch): the scrape's
		// glow put down, and everything moved and faded.
		update( frame, dt ) {

			clock += dt;
			sparks.begin();
			dust.begin();
			if ( rub.on ) {

				// A hot glow where it rubs, flickering fast as it grinds (steady for a visitor asking for
				// less motion).
				const alpha = calm() ? 0.5 : 0.6 + 0.4 * Math.sin( clock * 60 );
				sparks.put( rub.at, UP, FACING, rub.size, rub.size, 0, SHAPES.glow, RUB, alpha );
				sparks.put( rub.at, UP, FACING, rub.size * 0.4, rub.size * 0.4, 0, SHAPES.glow, WHITE, alpha );
				rub.on = false;

			} else sparkDue = scuffDue = 0;

			sparks.update( dt, sparkHooks );
			dust.update( dt, dustHooks );

		},

		// A hit at `at` (world: over where it hit, so the chase camera sees it over the vehicle) on
		// something facing `normal`, at `contact` (where the vehicle met it), `power` 0 to 1 by how
		// hard, the ground at `floor` (a height, world) for the sparks to bounce off. In layers: a
		// white-hot flash and a starburst (not for a visitor asking for less motion), a shock ring
		// round the wall's face, streaks of sparks off it and, in air, a little dust.
		hit( at, contact, normal, power, floor = - Infinity ) {

			if ( ! calm() ) {

				flash( at, 0.07, 0.35 + 0.5 * power, 0.6, WHITE );
				flash( at, 0.12, 0.8 + 1.6 * power, 0.4, FLARE, 0.9, SHAPES.flare, 0.35, ( Math.random() - 0.5 ) * 1.2 );
				if ( power > 0.3 ) flash( at, 0.1, 0.4 + 0.8 * power, 0.3, FLARE, 0.55, SHAPES.burst, 1, Math.random() * Math.PI );

			}

			_p.copy( contact ).addScaledVector( normal, 0.05 );
			ring( sparks, _p, normal, 0.28, 0.2, calm() ? 1.2 : 0.8 + 1.8 * power, WHITE, 0.6, SHAPES.shock );
			for ( let i = count( 14 + 26 * power ); i > 0; i -- ) {

				spray( normal, 6 + 10 * power, 0.9, _v );
				spark( _p, _v, STILL, 0.4 + Math.random() * 0.3, HIT_WIDTH, HOT[ i % 3 ], floor );

			}

			// Beads of hot metal among them, glowing as they fall.
			for ( let i = count( 4 + 8 * power ); i > 0; i -- ) {

				spray( normal, 4 + 7 * power, 1, _v );
				ember( _p, _v, 0.5 + Math.random() * 0.4, 0.07 + 0.05 * power, HOT[ 1 + i % 2 ], floor );

			}

			if ( ! air() ) return;
			for ( let i = count( 3 + 4 * power ); i > 0; i -- ) {

				_v.copy( normal ).multiplyScalar( 0.6 + Math.random() * 0.8 ).add( _a.set( Math.random() - 0.5, 0, Math.random() - 0.5 ) ).setY( 0.4 + Math.random() * 0.4 );
				puff( _p, _v, 0.9, 0.3 + 0.2 * power, 1.6, SMOKE, 0.6 ).drag = 1.5;

			}

		},

		// A chip of glass knocked off (drive-fx.js's bits), flying off `at` at `velocity`: a glint
		// following it for a moment (not for a visitor asking for less motion).
		glint( at, velocity ) {

			if ( calm() ) return;
			const p = sparks.spawn( 0.3 );
			p.position.copy( at );
			p.velocity.copy( velocity );
			p.frame = SHAPES.diamond;
			p.size = 0.07;
			p.fall = 1;
			p.colour.set( 0xe8f6ff );
			p.kind = GLINT;

		},

		// Scraping along a wall, `scrape` { at, normal, speed (m/s along it) }, the vehicle going at
		// `velocity` (world, m/s): sparks thrown back along the wall and up, more the faster it goes,
		// a glow where it rubs, and every so often a scuff mark left on the wall.
		// `floor`: the ground's height (world), for the sparks to bounce off.
		scrape( scrape, velocity, dt, floor = scrape.at.y - 0.6 ) {

			const speed = scrape.speed ?? velocity.length();
			const { at, normal } = scrape;
			rub.on = true;
			rub.at.copy( at ).addScaledVector( normal, 0.05 );
			rub.size = 0.25 + 0.01 * speed;
			_a.copy( velocity ).multiplyScalar( 0.15 );
			_side.copy( velocity ).setY( 0 );
			if ( _side.lengthSq() > 1e-6 ) _side.normalize();
			sparkDue -= dt * ( SCRAPE_RATE + SCRAPE_SPEED * speed ) * ( effects.detail ?? 1 );
			while ( sparkDue <= 0 ) {

				sparkDue += 1;
				// A rooster-tail: back along the wall the way it came, off its face and up.
				_v.copy( _side ).multiplyScalar( - ( 0.4 + Math.random() * 0.5 ) * speed * 0.5 ).addScaledVector( normal, 1.5 * Math.random() ).addScaledVector( UP, 1 + Math.random() * 2 );
				spark( rub.at, _v, _a, 0.25 + Math.random() * 0.2, SCRAPE_WIDTH, Math.random() < 0.4 ? SCRAPE_HEAD : SCRAPE_TAIL, floor );

			}

			scuffDue -= dt;
			if ( scuffDue <= 0 && speed > 1 ) {

				scuffDue = SCUFF_STEP;
				// Flat on the wall, along it: the streak's length is across the quad (a quarter turn).
				const p = dust.spawn( SCUFF_LIFE );
				p.position.copy( at ).addScaledVector( normal, 0.02 );
				p.axis.copy( normal );
				p.mode = FLAT;
				p.frame = SHAPES.streak;
				p.size = 0.05;
				p.aspect = Math.max( 1, speed * SCUFF_STEP * 0.6 / p.size );
				p.turn = Math.PI / 2;
				p.colour.copy( air() ? SCUFF_EARTH : SCUFF_MOON );
				p.alpha = 0.45;
				p.kind = SCUFF;

			}

		},

		// A wipeout slamming down at `at` (world, on the ground), `power` 0 to 1, a vehicle `width`
		// m wide sliding the way `slide` (world, unit, along the ground): a ring of dust spreading
		// over the ground, dust spreading out (regolith thrown up on the Moon), and sparks skidding
		// off along the ground the way it slides, bouncing.
		slam( at, power, width, slide ) {

			_p.copy( at ).addScaledVector( UP, 0.06 );
			ring( dust, _p, UP, 0.4, width * 0.4, width * ( 1.2 + 1.5 * power ), SLAM, 0.55 );
			ground( at, count( air() ? 6 + 8 * power : 10 + 14 * power ), width * 0.4, 2 + 3 * power, 0.5 + 0.7 * Math.random(), 1, 0.25 + 0.1 * power, 0.9, DUSTY, 0.45 );
			for ( let i = count( 10 + 14 * power ); i > 0; i -- ) {

				// Nearly flat along the ground, fanned a little either side of the slide.
				_side.set( - slide.z, 0, slide.x );
				_v.copy( slide ).multiplyScalar( 3 + Math.random() * 6 ).addScaledVector( _side, ( Math.random() - 0.5 ) * 5 ).setY( 0.2 + Math.random() * 0.4 );
				_p.copy( at ).setY( at.y + 0.08 );
				spark( _p, _v, STILL, 0.35 + Math.random() * 0.3, SLAM_WIDTH, HOT[ i % 3 ], at.y );

			}

		},

		// Sliding along on its roof in a wipeout, at `at` (world, on the ground under it), going at
		// `velocity` (world, m/s): a puff and a spark every WIPE_STEP s.
		wipe( at, velocity, dt ) {

			wipeDue -= dt;
			if ( wipeDue > 0 ) return;
			wipeDue = WIPE_STEP / ( effects.detail ?? 1 );
			_p.copy( at ).setY( at.y + 0.1 );
			_a.copy( velocity ).multiplyScalar( 0.5 );
			if ( air() ) puff( _p.setY( at.y + 0.3 ), _v.set( Math.random() - 0.5, 0.4 + Math.random() * 0.4, Math.random() - 0.5 ), 0.6, 0.2, 0.6, DUSTY, 0.3 );
			else grain( _p, _v.set( Math.random() - 0.5, 1 + Math.random() * 2, Math.random() - 0.5 ), 1.4 );
			_v.copy( velocity ).multiplyScalar( - 0.3 ).add( _a.set( ( Math.random() - 0.5 ) * 3, 0.2 + Math.random() * 0.6, ( Math.random() - 0.5 ) * 3 ) );
			spark( _p.copy( at ).setY( at.y + 0.08 ), _v, STILL, 0.3, SCRAPE_WIDTH, HOT[ Math.floor( Math.random() * 3 ) ], at.y );

		},

		// Back on its wheels after a wipeout, at `at` (world, on the ground), `width` m wide: a puff of
		// dust round its wheels (regolith on the Moon) and a thin white ring.
		settle( at, width ) {

			ground( at, count( 6 ), width * 0.45, 1.2, 0.3, 0.5, 0.22, 0.8, DUSTY, 0.45 );
			ring( dust, _p.copy( at ).addScaledVector( UP, 0.05 ), UP, 0.25, width * 0.5, width * 0.6, WHITE, 0.5 );

		},

		// Down on its wheels at `at` (world, on the ground), `power` 0 to 1 by how hard, `width` m
		// wide. Hard: a dust ring spreading over the ground (a skirt of dust on the Moon) and dust
		// thrown out round it (regolith in a crown on the Moon). `soft`: a small landing, a puff off
		// each rear wheel and no ring: `rear` (world, along the ground) from `at` back to its rear axle,
		// so they're put either side of that (no `rear`, either side of `at` along X).
		land( at, power, width, soft = false, rear = null ) {

			if ( soft ) {

				if ( rear && rear.lengthSq() > 1e-6 ) _side.set( - rear.z, 0, rear.x ).normalize();
				else _side.set( 1, 0, 0 );
				for ( let side = - 1; side <= 1; side += 2 ) {

					_p.copy( at ).addScaledVector( _side, side * width * 0.4 ).setY( at.y + 0.2 );
					if ( rear ) _p.add( _a.copy( rear ).setY( 0 ) );
					if ( air() ) puff( _p, _v.copy( _side ).multiplyScalar( side * 0.6 ).setY( 0.3 ), 0.4, 0.18, 0.5, DUSTY, 0.45 );
					else grain( _p, _v.copy( _side ).multiplyScalar( side * 0.8 ).setY( 1.2 ), 1.2 );

				}

				return;

			}

			_p.copy( at ).addScaledVector( UP, 0.05 );
			ring( dust, _p, UP, 0.35 + 0.25 * power, width * 0.5, width * ( 0.6 + 1.4 * power ), DUSTY, 0.35 + 0.2 * power, SHAPES.shock );
			ground( at, count( 6 + 10 * power ), width * 0.5, 1.5 + 3 * power, 0.4 + 0.6 * Math.random(), 0.7 + 0.5 * power, 0.25 + 0.1 * power, 0.5 + 0.8 * power, DUSTY, 0.4 );

		},

		// The world's gravity, as a share of the Earth's (World Drive's Moon: 0.165).
		set gravity( g ) {

			sparks.gravity = dust.gravity = 9.81 * g;

		},

		get alive() {

			return sparks.alive + dust.alive;

		},

		get budget() {

			return sparks.capacity + dust.capacity;

		},

	};

}
