import { MathUtils, Raycaster, Vector3 } from 'three';
import { enuToLocal } from '../geo.js';
import { blocks } from '../walk.js';

// Where a vehicle drops in: the ground under the pin, and which way the street runs there, so you
// start off along it rather than facing a wall; the deck of a bridge beside the pin; the street
// below a pin that's on a roof; and a step across the road from anything right in front. The
// scene is centred on the pin (main.js), so the pin is at local x = z = 0.

const DOWN = new Vector3( 0, - 1, 0 );
// The ways looked along, how far (m), and in steps of how much.
const WAYS = 16;
const REACH = 60;
const STEP = 5;
// Ground rising or falling more than this (m) in a step is a kerb too high, a wall or a drop.
const RISE = 1.6;
// Walls are looked for this high (m) over the ground: about a car's bumper.
const BUMPER = 1;
// Open this far (a share of REACH) every way round: a square, a car park or a field, where
// there's no telling which way a street goes.
const OPEN = 0.9;
// A spot's own heading (along its road) is used if the street that way is at least this long,
// as a share of the longest.
const HINT = 0.6;
// A bridge's deck is looked for this far (m) round the pin, every so many metres, this much higher
// than the ground at the pin (m: over the water, under the towers' tops), and must be level to
// within LEVEL (m) for LANE metres all round: a roadway, not a footpath, a kerb or a railing.
const DECK_REACH = 45;
const DECK_STEP = 3;
const DECK_RISE = [ 8, 110 ];
const LEVEL = 0.7;
const LANE = 4;
const AROUND = Array.from( { length: 8 }, ( _, i ) => [ Math.sin( i * Math.PI / 4 ) * LANE, Math.cos( i * Math.PI / 4 ) * LANE ] );
// A pin on a roof (or a tree, a bus shelter, a sign: anything raised) starts on the street instead.
// It's raised if no line through it is LINE metres long; the street is the nearest point within
// STREET_REACH, looked at every STREET_STEP metres, at least DROP lower, level a lane's width all
// round and with a line that long through it.
const LINE = 30;
const STREET_REACH = 48;
const STREET_STEP = 4;
const DROP = 2.5;
// The height (m, in the scene) a vehicle is put on the ground from, as models.js does: the street
// must be what's highest there, open to the sky, or the vehicle lands on whatever is over it.
const SKY = 2000;
// A start must be clear CLEAR metres ahead across the vehicle's width at the bumper heights
// drive.js looks for walls at (m). If it isn't (a car parked in Google's photo, a bollard, a
// barrier), the start moves across the road by these steps (m, + to the right) to where it is.
const CLEAR = 10;
const BUMPERS = [ 0.5, 1 ];
const ACROSS = [ 1.5, - 1.5, 3, - 3, 4.5, - 4.5 ];

const _origin = new Vector3();
const _dir = new Vector3();
const _normal = new Vector3();

export class Ground {

	// getColliders: what counts as ground (the tiles, or the test pad).
	constructor( getColliders ) {

		this.getColliders = getColliders;
		this.raycaster = new Raycaster();
		this.raycaster.firstHitOnly = true;

	}

	// The ground's height at local ( x, z ), looking down from `top` for `depth` metres; null where
	// nothing has loaded there.
	heightAt( x, z, top = 9000, depth = 20000 ) {

		const hit = this.cast( _origin.set( x, top, z ), DOWN, depth );
		return hit ? hit.point.y : null;

	}

	// Which way (degrees from north) to face at the pin, standing at height y: along the longest
	// drivable line through it, toward its longer end. `hint` (a spot's road) wins if that way is
	// nearly as good. Wide open all round, it's the hint, or north.
	heading( y, hint = null ) {

		const room = [];
		for ( let i = 0; i < WAYS; i ++ ) room.push( this.room( i * 360 / WAYS, y ) );
		const half = WAYS / 2;
		const line = i => room[ i % WAYS ] + room[ ( i + half ) % WAYS ];
		let best = 0;
		for ( let i = 1; i < half; i ++ ) if ( line( i ) > line( best ) ) best = i;

		if ( Number.isFinite( hint ) ) {

			const i = MathUtils.euclideanModulo( Math.round( hint / ( 360 / WAYS ) ), WAYS );
			if ( line( i ) >= line( best ) * HINT ) return room[ i ] >= room[ ( i + half ) % WAYS ] || room[ i ] >= STEP * 3 ? hint : ( hint + 180 ) % 360;

		}

		if ( room.every( r => r >= REACH * OPEN ) ) return Number.isFinite( hint ) ? hint : 0;
		const end = room[ best ] >= room[ best + half ] ? best : best + half;
		return end * 360 / WAYS;

	}

	// How far (m) a vehicle could go from the pin (or `from`, metres east and north of it) toward
	// `heading` before a wall, a step too high or the end of what's loaded.
	room( heading, y, from = { east: 0, north: 0 } ) {

		const rad = heading * MathUtils.DEG2RAD;
		const east = Math.sin( rad );
		const north = Math.cos( rad );
		enuToLocal( east, north, 0, _dir );
		let ground = y;
		let distance = 0;
		for ( let d = STEP; d <= REACH; d += STEP ) {

			enuToLocal( from.east + east * ( d - STEP ), from.north + north * ( d - STEP ), ground + BUMPER, _origin );
			const hit = this.cast( _origin, _dir, STEP );
			if ( hit?.face && Math.abs( _normal.copy( hit.face.normal ).transformDirection( hit.object.matrixWorld ).y ) < 0.6 ) break;
			enuToLocal( from.east + east * d, from.north + north * d, 0, _origin );
			const next = this.heightAt( _origin.x, _origin.z, ground + 30, 60 );
			if ( next === null || Math.abs( next - ground ) > RISE ) break;
			ground = next;
			distance = d;

		}

		return distance;

	}

	// The deck of a bridge near the pin, standing at height y: the nearest point within DECK_REACH
	// where the ground is a broad level surface well above the pin's (not a railing, a cable or a
	// tower), as { east, north, y }, or null.
	deck( y ) {

		let best = null;
		for ( let north = - DECK_REACH; north <= DECK_REACH; north += DECK_STEP ) {

			for ( let east = - DECK_REACH; east <= DECK_REACH; east += DECK_STEP ) {

				const distance = Math.hypot( east, north );
				if ( distance > DECK_REACH || ( best && distance >= best.distance ) ) continue;
				const top = this.heightAround( east, north, y );
				if ( top === null || top - y < DECK_RISE[ 0 ] || top - y > DECK_RISE[ 1 ] ) continue;
				const level = AROUND.every( ( [ e, n ] ) => {

					const h = this.heightAround( east + e, north + n, y );
					return h !== null && Math.abs( h - top ) < LEVEL;

				} );
				if ( level ) best = { east, north, y: top, distance };

			}

		}

		return best && { east: best.east, north: best.north, y: best.y };

	}

	// The street, when the pin is on something raised (a roof: a pin dropped on a building, or a
	// search result that's a building's middle), standing at height y there: as { east, north, y },
	// or null where the pin is on a street, a road or open ground already, or no street was found.
	street( y ) {

		if ( this.longestLine( y ) >= LINE ) return null;
		const points = [];
		const steps = Math.floor( STREET_REACH / STREET_STEP );
		for ( let i = - steps; i <= steps; i ++ ) {

			for ( let j = - steps; j <= steps; j ++ ) {

				const east = j * STREET_STEP;
				const north = i * STREET_STEP;
				const distance = Math.hypot( east, north );
				if ( distance > 0 && distance <= STREET_REACH ) points.push( { east, north, distance } );

			}

		}

		points.sort( ( a, b ) => a.distance - b.distance );
		for ( const { east, north } of points ) {

			// Open to the sky, well below the pin's roof, and clear of anything as high as that roof
			// a lane's width all round (looking down from just over it).
			const top = this.heightBelow( east, north, SKY, 2 * SKY );
			if ( top === null || y - top < DROP ) continue;
			const level = AROUND.every( ( [ e, n ] ) => {

				const h = this.heightBelow( east + e, north + n, y + 1 );
				return h !== null && Math.abs( h - top ) < LEVEL;

			} );
			if ( level && this.longestLine( top, { east, north } ) >= LINE ) return { east, north, y: top };

		}

		return null;

	}

	// Where to start instead of the pin, facing `heading` at height y, when something stands right
	// in front of a vehicle `halfWidth` metres either side of its middle: beside it, across the
	// road, as { east, north, y }; or null where the way ahead is clear (or isn't anywhere near).
	sideStep( heading, y, halfWidth ) {

		if ( this.clearAhead( heading, y, halfWidth ) >= CLEAR ) return null;
		const rad = heading * MathUtils.DEG2RAD;
		for ( const offset of ACROSS ) {

			const east = Math.cos( rad ) * offset;
			const north = - Math.sin( rad ) * offset;
			// Level ground there (not on the parked car), with no wall between it and the pin.
			const h = this.heightBelow( east, north, y + RISE, 2 * RISE );
			if ( h === null || Math.abs( h - y ) > LEVEL ) continue;
			enuToLocal( east / Math.abs( offset ), north / Math.abs( offset ), 0, _dir );
			if ( BUMPERS.some( up => this.isWall( this.cast( enuToLocal( 0, 0, y + up, _origin ), _dir, Math.abs( offset ) + halfWidth ) ) ) ) continue;
			if ( this.clearAhead( heading, h, halfWidth, { east, north } ) >= CLEAR ) return { east, north, y: h };

		}

		return null;

	}

	// How far (m), up to CLEAR, a vehicle `halfWidth` metres either side of its middle could go from
	// `from` (metres east and north of the pin) toward `heading`, standing at height y, before a
	// wall anywhere across its width.
	clearAhead( heading, y, halfWidth, from = { east: 0, north: 0 } ) {

		const rad = heading * MathUtils.DEG2RAD;
		const east = Math.sin( rad );
		const north = Math.cos( rad );
		enuToLocal( east, north, 0, _dir );
		let clear = CLEAR;
		for ( const up of BUMPERS ) {

			for ( const side of [ - halfWidth, 0, halfWidth ] ) {

				enuToLocal( from.east + north * side, from.north - east * side, y + up, _origin );
				const hit = this.cast( _origin, _dir, CLEAR );
				if ( this.isWall( hit ) ) clear = Math.min( clear, hit.distance );

			}

		}

		return clear;

	}

	// The longest straight line (m) a vehicle could drive through a point (the pin, or `from`),
	// standing at height y there, looking 8 ways.
	longestLine( y, from ) {

		let longest = 0;
		for ( let i = 0; i < 4; i ++ ) {

			longest = Math.max( longest, this.room( i * 45, y, from ) + this.room( i * 45 + 180, y, from ) );
			if ( longest >= LINE ) break;

		}

		return longest;

	}

	// The ground's height `east`, `north` metres from the pin, looking down from `top`.
	heightBelow( east, north, top, depth = 400 ) {

		enuToLocal( east, north, 0, _origin );
		return this.heightAt( _origin.x, _origin.z, top, depth );

	}

	// The ground's height `east`, `north` metres from the pin, looking down from well above y.
	heightAround( east, north, y ) {

		enuToLocal( east, north, 0, _origin );
		return this.heightAt( _origin.x, _origin.z, y + DECK_RISE[ 1 ] + 20, DECK_RISE[ 1 ] + 40 );

	}

	// A hit on something standing up (a wall, a car's side), as drive.js sees walls; not the ground
	// or a ramp.
	isWall( hit ) {

		return !! hit?.face && Math.abs( _normal.copy( hit.face.normal ).transformDirection( hit.object.matrixWorld ).y ) < 0.5;

	}

	cast( origin, direction, far ) {

		this.raycaster.set( origin, direction );
		this.raycaster.far = far;
		return this.raycaster.intersectObjects( this.getColliders(), true ).find( blocks ) ?? null;

	}

}
