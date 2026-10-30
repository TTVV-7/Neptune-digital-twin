import { drawn, FT, GLASS, mat, Parts, STEEL } from './parts.js';

// Modular site trailers (ATCO-style offices, washrooms, lunchrooms) at their real sizes, in metres.
// One builder makes them all from a spec: the box, where the doors and windows go, wall-mounted
// heating and cooling units on the back, roof vents and door signs. Each stands on y = 0 with its
// door side facing -Z, so heading 0 points it north, and every door has its own steel landing and
// stairs. The card size counts the stairs and the units on the back, which is the room it takes
// up on site; the box itself is the size in the name.

const BODY = () => mat( 0xe8e4d8, { roughness: 0.7 } );
const TRIM = () => mat( 0x3c4a5a, { roughness: 0.6 } );
const SKIRT = () => mat( 0x8f969a, { roughness: 0.9 } );
const FROSTED = () => mat( 0xaebcc3, { roughness: 0.35, metalness: 0.1 } );
const HVAC = () => mat( 0xd9d6cc, { roughness: 0.6, metalness: 0.2 } );
const GRILLE = () => mat( 0x55595c, { roughness: 0.7, metalness: 0.3 } );

// Window centres along each long side, from the middle, in metres; `ends` is how many on each end.
export const TRAILERS = {
	'office-trailer-8x20': { length: 20 * FT, width: 8 * FT, wall: 2.55, doors: [ 1.9 ], front: [ - 1.7, 0.1 ], back: [ - 1.6, 1.6 ], hvac: [ 0 ] },
	'office-trailer-8x32': { length: 32 * FT, width: 8 * FT, wall: 2.55, doors: [ 0.9 ], front: [ - 3.6, - 1.3, 3.2 ], back: [ - 3.4, - 1.1, 3.4 ], hvac: [ 1.2 ] },
	'office-trailer-10x40': { length: 40 * FT, width: 10 * FT, wall: 2.65, doors: [ 0 ], front: [ - 4.9, - 2.5, 2.5, 4.9 ], back: [ - 1.6, 1.6 ], hvac: [ - 4.2, 4.2 ] },
	'site-office-trailer': { length: 60 * FT, width: 12 * FT, doors: [ 0 ], front: [ - 7.5, - 5, - 2.5, 2.5, 5, 7.5 ], back: [ - 6, - 2, 2, 6 ], hvac: [ - 4, 4 ] },
	// Two 12 x 60 ft halves bolted together along the middle, with a door to each half.
	'office-double-wide-24x60': { length: 60 * FT, width: 24 * FT, doors: [ - 5, 5 ], front: [ - 7.6, - 2.5, 0, 2.5, 7.6 ], back: [ - 7.5, - 5.5, - 1.5, 1.5, 5.5, 7.5 ], hvac: [ - 3.6, 3.6 ], ends: 2, halves: 2 },
	// Two rooms, each with its own door: small frosted windows up high, vents through the roof.
	'washroom-trailer-8x28': {
		length: 28 * FT, width: 8 * FT, wall: 2.55, doors: [ - 2.4, 2.4 ], signs: [ 'WASHROOM', 'SHOWERS' ],
		front: [ - 3.5, - 1.2, 1.2, 3.5 ], back: [ - 3.4, - 1.4, 1.4, 3.4 ], hvac: [ 0 ], ends: 0, high: true, vents: [ - 3, - 1, 1, 3 ],
	},
	// A lunchroom at one end and a dry (change room) at the other, a door to each.
	'lunchroom-trailer-12x40': {
		length: 40 * FT, width: 12 * FT, doors: [ - 4.6, 4.6 ], signs: [ 'LUNCHROOM', 'DRY' ],
		front: [ - 2.3, 0, 2.3 ], back: [ - 4.8, - 1.6, 1.6, 4.8 ], hvac: [ - 3.2, 3.2 ], vents: [ - 4.5 ],
	},
};

export function trailer( id ) {

	const {
		length, width, floor = 0.75, wall = 2.75, doors, front: frontWindows, back: backWindows,
		hvac = [], ends = 1, halves = 1, high = false, vents = [], signs = [],
	} = TRAILERS[ id ];
	const parts = new Parts();
	const body = BODY();
	const trim = TRIM();
	const top = floor + wall;

	parts.box( SKIRT(), [ length - 0.2, floor, width - 0.2 ], [ 0, 0, 0 ] );
	parts.box( body, [ length, wall, width ], [ 0, floor, 0 ] );
	parts.box( trim, [ length + 0.1, 0.12, width + 0.1 ], [ 0, top, 0 ] );

	// A double-wide shows its seam down the ends and as a cap along the roof.
	if ( halves > 1 ) {

		for ( const x of [ - length / 2 - 0.02, length / 2 + 0.02 ] ) parts.box( trim, [ 0.04, wall, 0.12 ], [ x, floor, 0 ] );
		parts.box( trim, [ length + 0.1, 0.06, 0.3 ], [ 0, top + 0.12, 0 ] );

	}

	// Windows: ordinary ones at desk height, or small frosted ones up high.
	const front = - width / 2 - 0.01;
	const back = width / 2 + 0.01;
	const [ ww, wh, wy ] = high ? [ 0.7, 0.4, 1.75 ] : [ 1.3, 1.0, 1.1 ];
	const pane = high ? FROSTED() : GLASS();
	const windowAt = ( x, z, endWall = false ) => {

		const along = ( w, d ) => endWall ? [ d, w ] : [ w, d ];
		const [ fx, fz ] = along( ww, 0.04 );
		const [ gx, gz ] = along( ww - 0.14, 0.05 );
		parts.box( trim, [ fx, wh, fz ], [ x, floor + wy, z ] );
		parts.box( pane, [ gx, wh - 0.14, gz ], [ x, floor + wy + 0.07, z ] );

	};

	for ( const x of frontWindows ) windowAt( x, front );
	for ( const x of backWindows ) windowAt( x, back );
	for ( let i = 0; i < ends; i ++ ) {

		const z = ( i + 0.5 ) * width / ends - width / 2;
		windowAt( - length / 2 - 0.01, z, true );
		windowAt( length / 2 + 0.01, z, true );

	}

	for ( const [ i, x ] of doors.entries() ) {

		door( parts, x, front, floor );
		if ( signs[ i ] ) parts.box( sign( signs[ i ] ), [ 0.9, 0.22, 0.02 ], [ x, floor + 2.14, front - 0.01 ] );

	}

	// Through-the-wall heating and cooling units, as on most site trailers, with a grille and a
	// rain hood.
	for ( const x of hvac ) {

		parts.box( HVAC(), [ 0.95, 1.7, 0.4 ], [ x, floor + 0.25, back + 0.2 ] );
		parts.box( GRILLE(), [ 0.75, 0.55, 0.02 ], [ x, floor + 0.45, back + 0.4 ] );
		parts.box( GRILLE(), [ 0.75, 0.4, 0.02 ], [ x, floor + 1.35, back + 0.4 ] );
		parts.box( HVAC(), [ 1.0, 0.05, 0.45 ], [ x, floor + 1.95, back + 0.2 ] );

	}

	for ( const x of vents ) {

		parts.cylinder( GRILLE(), 0.06, 0.35, [ x, top + 0.12, width / 4 ], 10 );
		parts.cylinder( GRILLE(), 0.14, 0.08, [ x, top + 0.47, width / 4 ], 12, 0.05 );

	}

	return parts.build();

}

// A door with a steel landing and four steps down to the ground in front of it (toward -Z).
function door( parts, x, front, floor ) {

	const steel = STEEL();
	parts.box( TRIM(), [ 0.95, 2.05, 0.05 ], [ x, floor, front ] );
	parts.box( steel, [ 0.04, 0.04, 0.04 ], [ x + 0.35, floor + 1.0, front - 0.03 ] );
	const landing = 1.2;
	parts.box( steel, [ 1.5, 0.08, landing ], [ x, floor - 0.08, front - landing / 2 ] );
	const steps = 4;
	const tread = 0.28;
	const rise = floor / ( steps + 1 );
	for ( let i = 0; i < steps; i ++ ) {

		const y = floor - 0.08 - ( i + 1 ) * rise;
		parts.box( steel, [ 1.0, 0.05, tread ], [ x, y, front - landing - tread / 2 - i * tread ] );

	}

	// Stringers each side of the steps, and the handrails that follow them down.
	const z0 = front - landing;
	const z1 = z0 - steps * tread;
	const slope = [ z0, floor - 0.04, z1, 0.04 ];
	for ( const dx of [ - 0.52, 0.52 ] ) {

		parts.rod( steel, [ x + dx, slope[ 1 ], slope[ 0 ] ], [ x + dx, slope[ 3 ], slope[ 2 ] ], 0.035, 4 );
		parts.rod( steel, [ x + dx, floor + 0.9, z0 ], [ x + dx, 0.9, z1 + tread / 2 ], 0.02, 6 );
		parts.rod( steel, [ x + dx, 0, z1 + tread / 2 ], [ x + dx, 0.9, z1 + tread / 2 ], 0.02, 6 );

	}

	// Guard rails along the landing's two open sides; the stairs come up between them.
	for ( const dx of [ - 0.75, 0.75 ] ) {

		for ( const z of [ z0, front - 0.05 ] ) parts.box( steel, [ 0.04, 1.0, 0.04 ], [ x + dx, floor, z ] );
		parts.box( steel, [ 0.04, 0.04, landing ], [ x + dx, floor + 1.0, front - landing / 2 ] );
		parts.box( steel, [ 0.04, 0.04, landing ], [ x + dx, floor + 0.5, front - landing / 2 ] );

	}

	for ( const dx of [ - 0.75, 0.75 ] ) parts.rod( steel, [ x + dx * 0.7, floor + 1.0, z0 ], [ x + dx, floor + 1.0, z0 ], 0.02, 6 );

}

// A door sign, white capitals on blue.
function sign( text ) {

	return drawn( `trailer sign ${ text }`, [ 256, 64 ], ( ctx, w, h ) => {

		ctx.fillStyle = '#1f4f8f';
		ctx.fillRect( 0, 0, w, h );
		ctx.fillStyle = '#ffffff';
		ctx.font = 'bold 40px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText( text, w / 2, h / 2 + 2, w - 16 );

	} );

}
