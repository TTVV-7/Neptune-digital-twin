// Sets: a few library items that go together on site, placed in one go and laid out as they'd
// usually stand: a site office compound with its washroom, toilets, pickups and people; a
// concrete pour with the pump and mixers backed up to it; an excavator loading trucks. A set is
// placed like any item (it follows the pointer, R turns it, a click puts it down), and then each
// piece is its own placed item, to move, swap or delete like the rest.
//
// Each member is { item, right, forward, turn }: the library item's id, where it stands in metres
// to the right of and ahead of the set's middle, and how many degrees clockwise it's turned from
// the set's facing (its front faces the set's front at 0). A set is placed facing you, so "ahead"
// is the side nearest you: parking and the way in go there.
// Members whose item isn't in the library are left out, so a set still works without them.

export const SETS = [
	{
		id: 'set-site-office',
		name: 'Site office compound (office, lunchroom, washroom, toilets, parking)',
		keywords: 'site office trailer compound people workers parking',
		members: [
			// The trailers side by side, their stairs to the front, facing the parking.
			{ item: 'lunchroom-trailer-12x40', right: - 13.5, forward: 0, turn: 0 },
			{ item: 'office-trailer-10x40', right: 0, forward: 0, turn: 0 },
			{ item: 'washroom-trailer-8x28', right: 11.5, forward: 0, turn: 0 },
			{ item: 'porta-potty', right: 18, forward: 1, turn: 0 },
			{ item: 'porta-potty', right: 19.6, forward: 1, turn: 0 },
			{ item: 'pickup-truck', right: - 6, forward: 11, turn: 180 },
			{ item: 'pickup-truck', right: - 2, forward: 11, turn: 180 },
			{ item: 'pickup-truck', right: 2, forward: 11, turn: 180 },
			{ item: 'worker-standing', right: - 1.5, forward: 5, turn: 180 },
			{ item: 'worker-walking', right: 3, forward: 6, turn: 150 },
			{ item: 'worker-standing', right: - 0.5, forward: 5.6, turn: 10 },
			{ item: 'light-tower-led', right: - 23, forward: 4, turn: 0 },
			{ item: 'frontload-4yd', right: 19, forward: - 4, turn: 0 },
		],
	},
	{
		id: 'set-small-site-office',
		name: 'Small site office (8 × 32 ft office, toilet, pickup, 2 people)',
		keywords: 'site office trailer people',
		members: [
			{ item: 'office-trailer-8x32', right: 0, forward: 0, turn: 0 },
			{ item: 'porta-potty', right: 7, forward: 1, turn: 0 },
			{ item: 'pickup-truck', right: - 2, forward: 9, turn: 180 },
			{ item: 'worker-standing', right: - 0.5, forward: 4, turn: 180 },
			{ item: 'worker-standing', right: 0.6, forward: 4.3, turn: 20 },
		],
	},
	{
		id: 'set-concrete-pour',
		name: 'Concrete pour (boom pump, 2 mixer trucks, crew)',
		keywords: 'concrete pour pump mixer ready mix crew',
		members: [
			{ item: 'concrete-boom-pump-38m', right: 0, forward: 0, turn: 0 },
			// Backed up to the pump's hopper at its rear, the next one waiting its turn.
			{ item: 'concrete-mixer-truck', right: 0, forward: - 13, turn: 180 },
			{ item: 'concrete-mixer-truck', right: 5, forward: - 18, turn: 180 },
			{ item: 'worker-standing', right: 2.2, forward: - 6.5, turn: 270 },
			{ item: 'worker-walking', right: 3.5, forward: 4, turn: 0 },
			{ item: 'worker-standing', right: 5, forward: 6, turn: 90 },
			{ item: 'wheelbarrow', right: 4.5, forward: 3, turn: 30 },
			{ item: 'light-tower-led', right: - 5, forward: - 4, turn: 0 },
		],
	},
	{
		id: 'set-shotcrete',
		name: 'Shotcrete (line pump, small trailer pump, mixer truck, compressor, nozzle crew)',
		keywords: 'shotcrete gunite spray concrete line pump compressor',
		members: [
			{ item: 'concrete-trailer-pump-small', right: - 7, forward: 2, turn: 0 },
			{ item: 'concrete-line-pump-trailer', right: 0, forward: 0, turn: 0 },
			// Discharging into the pump's hopper at its back.
			{ item: 'concrete-mixer-truck', right: 0, forward: - 11, turn: 180 },
			{ item: 'compressor-towable-twin-axle', right: 5, forward: 1, turn: 0 },
			{ item: 'worker-standing', right: 1, forward: 6, turn: 0 },
			{ item: 'worker-standing', right: - 1, forward: 6.5, turn: 20 },
			{ item: 'worker-walking', right: 2.5, forward: - 4, turn: 270 },
			{ item: 'pallet-concrete-bags', right: 5, forward: - 5, turn: 0 },
		],
	},
	{
		id: 'set-bulk-excavation',
		name: 'Bulk excavation (excavator loading 2 tandem trucks, dozer, skid steer)',
		keywords: 'excavation earthworks excavator dump truck dozer skid steer loading',
		members: [
			{ item: 'excavator-20t', right: 0, forward: 0, turn: 0 },
			{ item: 'dump-truck-tandem', right: 7, forward: 1, turn: 0 },
			{ item: 'dump-truck-tandem', right: 7, forward: - 12, turn: 0 },
			{ item: 'crawler-dozer-d6', right: - 9, forward: - 3, turn: 0 },
			{ item: 'skid-steer-loader', right: - 6, forward: 7, turn: 200 },
			{ item: 'worker-standing', right: 3.5, forward: 7, turn: 180 },
		],
	},
	{
		id: 'set-mass-haul',
		name: 'Mass haul (large excavator, 2 articulated dump trucks, dozer, water truck)',
		keywords: 'mass haul earthworks excavator adt articulated dozer water truck',
		members: [
			{ item: 'excavator-40t', right: 0, forward: 0, turn: 0 },
			{ item: 'articulated-dump-truck', right: 8, forward: 1, turn: 0 },
			{ item: 'articulated-dump-truck-30t', right: 9, forward: - 14, turn: 0 },
			{ item: 'crawler-dozer-d6', right: - 10, forward: - 2, turn: 0 },
			{ item: 'water-truck-4000gal', right: - 8, forward: 12, turn: 90 },
		],
	},
	{
		id: 'set-paving',
		name: 'Grading and paving (grader, rollers, water truck, dump truck)',
		keywords: 'road paving grading gravel base asphalt roller grader compaction',
		members: [
			{ item: 'motor-grader', right: 0, forward: 0, turn: 0 },
			{ item: 'roller-single-drum-84in', right: 4.5, forward: - 4, turn: 0 },
			{ item: 'roller-tandem', right: - 4, forward: - 6, turn: 0 },
			{ item: 'water-truck-4000gal', right: 5, forward: - 16, turn: 0 },
			{ item: 'dump-truck-tandem', right: - 5, forward: - 18, turn: 0 },
			{ item: 'worker-standing', right: 8, forward: 4, turn: 270 },
		],
	},
	{
		id: 'set-trucks',
		name: 'Trucking line-up (tandem dump, tractor and tanker, tractor and flatbed)',
		keywords: 'trucks tandem dump semi tractor trailer tanker flatbed haul highway',
		members: [
			{ item: 'dump-truck-tandem', right: - 8, forward: 0, turn: 0 },
			// Each tractor with its trailer hooked up behind: the kingpin just ahead of the
			// tractor's rear axles.
			{ item: 'semi-tractor-t800', right: 0, forward: 4, turn: 0 },
			{ item: 'tanker-trailer', right: 0, forward: - 4.3, turn: 0 },
			{ item: 'semi-tractor-w900', right: 8, forward: 4, turn: 0 },
			{ item: 'flatbed-trailer', right: 8, forward: - 5.6, turn: 0 },
		],
	},
	{
		id: 'set-lane-closure',
		name: 'Lane closure (arrow board, 2 flaggers, cones)',
		keywords: 'traffic control lane closure flagger cones arrow board',
		members: [
			{ item: 'arrow-board-trailer', right: 0, forward: - 14, turn: 180 },
			{ item: 'flagger', right: 2.5, forward: - 22, turn: 180 },
			{ item: 'flagger', right: 2.5, forward: 22, turn: 0 },
			...[ - 18, - 12, - 6, 0, 6, 12, 18 ].map( forward => ( { item: 'traffic-cone', right: 1.5, forward, turn: 0 } ) ),
		],
	},
];

// The sets whose pieces are in the library, with only those pieces, and their sizes worked out
// from the pieces' footprints: { ...set, members, dimensions, names }. A set needs two pieces.
export function availableSets( library ) {

	const byId = new Map( library.map( item => [ item.id, item ] ) );
	const sets = [];
	for ( const set of SETS ) {

		const members = set.members.filter( m => byId.has( m.item ) ).map( m => ( { ...m, libraryItem: byId.get( m.item ) } ) );
		if ( members.length < 2 ) continue;
		let minX = Infinity, maxX = - Infinity, minZ = Infinity, maxZ = - Infinity;
		for ( const m of members ) {

			const d = m.libraryItem.dimensions ?? { length: 1, width: 1 };
			// Turned a quarter, its length runs across the set.
			const across = m.turn % 180 === 90 ? d.length : d.width;
			const along = m.turn % 180 === 90 ? d.width : d.length;
			minX = Math.min( minX, m.right - across / 2 );
			maxX = Math.max( maxX, m.right + across / 2 );
			minZ = Math.min( minZ, m.forward - along / 2 );
			maxZ = Math.max( maxZ, m.forward + along / 2 );

		}

		const names = [ ...new Set( members.map( m => m.libraryItem.name ) ) ];
		sets.push( { ...set, members, names, dimensions: { width: Math.round( maxX - minX ), length: Math.round( maxZ - minZ ) } } );

	}

	return sets;

}

// Where a member stands for a set placed with its middle at (east, north) facing `heading`
// degrees: { east, north, heading }.
export function memberPlacement( member, east, north, heading ) {

	const h = heading * Math.PI / 180;
	return {
		east: east + member.right * Math.cos( h ) + member.forward * Math.sin( h ),
		north: north - member.right * Math.sin( h ) + member.forward * Math.cos( h ),
		heading: ( heading + member.turn + 360 ) % 360,
	};

}
