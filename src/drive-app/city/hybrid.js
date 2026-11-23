import { DoubleSide, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { useFastRaycast } from '../../raycast.js';
import { latLonToEnu } from '../../geo.js';
import { buildCity } from './build.js';
import { CITIES } from './cities.js';
import { drape, loadTerrain } from './terrain.js';

// The hybrid ground (docs/world-drive.md, "Clean roads under Google's map", a test behind ?hybrid):
// in a city City Drive has (cities.js: Vancouver), the car drives on that city built from
// OpenStreetMap and laid over its real hills (build.js, terrain.js), kept invisible under Google's
// 3D map, which is all that's seen. Its streets are smooth, its buildings' walls straight up, its
// bridges decks, and what's in Google's mesh but isn't ground (parked cars, trees, lamp posts, the
// speckle on a road) is passed through rather than hit. Outside the city, Google's mesh is the
// ground as ever.
//
// It's put in the scene's frame (x west, y up, z north, its middle where the drive began: earthAt)
// from the city's own origin, and lined up in height with Google's map by measuring it: from points
// on the city's streets near the car, straight down onto Google's tiles, the middle of the
// differences between Google's height there and the city's (sea level and Google's ellipsoid differ
// by the geoid, about 17 m in Vancouver; the tiles and the elevation data differ by a little more),
// measured again every CALIBRATE s as finer tiles come in. Until it's measured, Google's mesh it is.
//
// ?hybrid=show draws the city too, see-through, to check it lines up.

const CALIBRATE = 3;
// Street points this near the car (m) are measured, at most SAMPLES of them.
const NEAR = 160;
const SAMPLES = 24;
// A measurement's spread (m, between the quartiles) past this: Google's tiles there aren't fine yet,
// or the place is too cluttered to trust; the last good one is kept.
const SPREAD = 2.5;
// Inside the city's box by this much (m) before its ground is used, so the edge of the box isn't a
// cliff the car meets.
const MARGIN = 150;

const DEG = Math.PI / 180;
const R = 6371008.8;
const _from = new Vector3();
const _down = new Vector3( 0, - 1, 0 );

// show: draw it as well (?hybrid=show).
export function createHybrid( { scene, show = false } ) {

	let city = null;
	let loading = null;
	let frame = null;
	let offset = null;
	let since = CALIBRATE;
	const raycaster = new Raycaster();

	// The city that has `place` ({ lat, lon }) inside its box, or null.
	function cityAt( { lat, lon } ) {

		return CITIES.find( spec => {

			if ( ! spec.origin ) return false;
			const [ lat0, lon0 ] = spec.origin;
			const [ width, height ] = spec.size;
			const east = ( lon - lon0 ) * DEG * R * Math.cos( lat0 * DEG );
			const north = ( lat - lat0 ) * DEG * R;
			return Math.abs( east ) < width / 2 && Math.abs( north ) < height / 2;

		} ) ?? null;

	}

	// The scene's frame now ({ lat, lon, height }: where the drive began). Loads the city there if
	// there's one and it isn't loaded.
	async function setFrame( at ) {

		frame = at;
		offset = null;
		since = CALIBRATE;
		const spec = cityAt( at );
		if ( ! spec ) return;
		if ( city?.spec !== spec ) await load( spec );
		place();

	}

	function load( spec ) {

		loading ??= ( async () => {

			const data = await ( await fetch( spec.file ) ).json();
			const terrain = spec.terrain ? await loadTerrain( spec.terrain ) : null;
			const built = buildCity( data, { trees: false } );
			if ( terrain ) drape( built.group, terrain );
			useFastRaycast( built.colliders );
			built.group.name = 'hybrid-city';
			built.group.visible = show;
			if ( show ) {

				const see = new MeshBasicMaterial( { color: 0xff3df0, transparent: true, opacity: 0.25, side: DoubleSide, depthWrite: false } );
				built.group.traverse( o => {

					if ( o.isMesh ) o.material = see;

				} );

			}

			scene.add( built.group );
			city = { spec, data, terrain, ...built };

		} )().finally( () => {

			loading = null;

		} );
		return loading;

	}

	// The city's origin in the scene's frame (east and north of the frame's middle), and its height:
	// the measured offset, or none yet.
	function place() {

		if ( ! city || ! frame ) return;
		const [ lat0, lon0 ] = city.spec.origin;
		const { east, north } = latLonToEnu( lat0, lon0, frame );
		city.group.position.set( - east, offset ?? 0, north );
		city.group.updateMatrixWorld( true );

	}

	// Every frame while driving on the Earth: `car` { east, north } in the scene's frame; `tiles`
	// Google's tiles (their group), to measure against.
	function update( dt, car, tiles ) {

		if ( ! city || ! frame || ! car || ! tiles ) return;
		since += dt;
		if ( since < CALIBRATE ) return;
		since = 0;
		const measured = measure( car, tiles );
		if ( measured !== null ) {

			offset = measured;
			place();

		}

	}

	// Google's height minus the city's at street points near the car: their middle, or null when
	// there are too few, or they disagree too much to trust.
	function measure( car, tiles ) {

		const base = city.group.position;
		const differences = [];
		for ( const [ line ] of city.data.roads ) {

			for ( let i = 0; i < line.length && differences.length < SAMPLES; i += 2 ) {

				// The street point in the scene: the city's frame (x west, z north) moved by its origin.
				const x = - line[ i ] / 10 + base.x;
				const z = line[ i + 1 ] / 10 + base.z;
				if ( Math.hypot( x + car.east, z - car.north ) > NEAR ) continue;
				raycaster.set( _from.set( x, 2000, z ), _down );
				const hit = raycaster.intersectObject( tiles, true )[ 0 ];
				if ( ! hit ) continue;
				const mine = city.terrain ? city.terrain.heightAt( line[ i ] / 10, line[ i + 1 ] / 10 ) : 0;
				differences.push( hit.point.y - mine );

			}

			if ( differences.length >= SAMPLES ) break;

		}

		if ( differences.length < 6 ) return null;
		differences.sort( ( a, b ) => a - b );
		const q = p => differences[ Math.floor( p * ( differences.length - 1 ) ) ];
		if ( q( 0.75 ) - q( 0.25 ) > SPREAD ) return null;
		return q( 0.5 );

	}

	// Whether the car (scene east, north) drives on the city now: it's loaded, measured, and the car
	// is well inside its box.
	function active( car ) {

		if ( ! city || offset === null || ! car ) return false;
		const [ width, height ] = city.spec.size;
		const east = car.east + city.group.position.x;
		const north = car.north - city.group.position.z;
		return Math.abs( east ) < width / 2 - MARGIN && Math.abs( north ) < height / 2 - MARGIN;

	}

	return {
		setFrame,
		update,
		active,
		get colliders() {

			return city?.colliders ?? null;

		},
		// For the tests and the console: the height offset measured (m), or null.
		get offset() {

			return offset;

		},
		get city() {

			return city;

		},
	};

}
