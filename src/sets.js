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
		name: 'Gravel trucks (tandem, tridem, truck and pup, truck and transfer, tri-tri)',
		keywords: 'trucks gravel aggregate dump tandem tridem pup transfer tri-tri haul',
		// Side by side with their fronts lined up, the longer ones reaching further back.
		members: [
			{ item: 'dump-truck-tandem', right: - 9, forward: 1.3, turn: 0 },
			{ item: 'dump-truck-tridem', right: - 4.5, forward: 0.4, turn: 0 },
			{ item: 'truck-and-pup', right: 0, forward: - 3.9, turn: 0 },
			{ item: 'truck-and-transfer', right: 4.5, forward: - 5.1, turn: 0 },
			{ item: 'tri-tri', right: 9, forward: - 5.1, turn: 0 },
		],
	},
	{
		id: 'set-semi-trailers',
		name: 'Semi trailers (end dump, belly dump, lowboy, tanker, with tractors)',
		keywords: 'trucks semi tractor trailer end dump belly dump lowboy lowbed tanker haul highway',
		// Each tractor with its trailer hooked up behind: the trailer's front 2.4 m behind the
		// tractor's middle, so its kingpin sits just ahead of the tractor's rear axles.
		members: [
			{ item: 'semi-tractor-t800', right: - 6.75, forward: 4, turn: 0 },
			{ item: 'end-dump-trailer', right: - 6.75, forward: - 4.35, turn: 0 },
			{ item: 'semi-tractor-w900', right: - 2.25, forward: 4, turn: 0 },
			{ item: 'belly-dump-trailer', right: - 2.25, forward: - 4.55, turn: 0 },
			{ item: 'semi-tractor-t800', right: 2.25, forward: 4, turn: 0 },
			{ item: 'lowboy-trailer', right: 2.25, forward: - 6.5, turn: 0 },
			{ item: 'semi-tractor-w900', right: 6.75, forward: 4, turn: 0 },
			{ item: 'tanker-trailer', right: 6.75, forward: - 4.3, turn: 0 },
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
	{
		id: 'set-core-pour',
		name: 'High-rise core pour (tower crane, placing boom, silo, mixers, crew)',
		keywords: 'high rise tower crane core wall pour placing boom concrete silo mixer crew',
		members: [
			// The placing boom on its tower in the core, the crane beside the building, the trucks at
			// the street side discharging into the line pump's hopper.
			{ item: 'concrete-placing-boom-28m', right: 0, forward: 0, turn: 0 },
			{ item: 'tower-crane-luffing', right: - 22, forward: - 6, turn: 0 },
			{ item: 'mortar-silo', right: 10, forward: - 8, turn: 0 },
			{ item: 'concrete-mixer-truck', right: 4, forward: 10, turn: 180 },
			{ item: 'concrete-mixer-truck', right: 9, forward: 16, turn: 180 },
			{ item: 'worker-vest-tool-belt', right: 2, forward: 4, turn: 200 },
			{ item: 'worker-standing', right: - 2, forward: 4.5, turn: 160 },
			{ item: 'light-tower-led', right: - 7, forward: 7, turn: 0 },
		],
	},
	{
		id: 'set-steel-erection',
		name: 'Steel erection (truck crane, steel delivery, boom lift, welders)',
		keywords: 'structural steel erection crane truck delivery flatbed beams boom lift welder ironworkers',
		members: [
			{ item: 'crane-truck-50t', right: 0, forward: 0, turn: 0 },
			// The delivery pulled up alongside, its beams landed beside the trailer to be picked.
			{ item: 'semi-tractor-t800', right: 10, forward: - 6, turn: 0 },
			{ item: 'flatbed-trailer', right: 10, forward: - 17, turn: 0 },
			{ item: 'steel-beam-bundle-w12', right: 15, forward: - 17, turn: 0 },
			{ item: 'boom-lift-45ft-raised', right: - 9, forward: - 12, turn: 90 },
			{ item: 'worker-welder-machine', right: - 4, forward: - 18, turn: 270 },
			{ item: 'worker-welder', right: - 12, forward: - 19, turn: 90 },
			{ item: 'torch-cart-oxy-acetylene', right: - 2, forward: - 14, turn: 0 },
			{ item: 'worker-pointing', right: 5, forward: 7, turn: 200 },
		],
	},
	{
		id: 'set-masonry',
		name: 'Masonry laydown (bricks, block, mortar silo and mixer, telehandler, scaffold)',
		keywords: 'masonry brick block cmu mortar silo mixer telehandler scaffold laydown bricklayer',
		members: [
			{ item: 'pallet-bricks', right: 0, forward: 0, turn: 0 },
			{ item: 'pallet-bricks', right: 1.8, forward: 0, turn: 0 },
			{ item: 'pallet-bricks', right: 3.6, forward: 0, turn: 0 },
			{ item: 'pallet-cmu-blocks', right: 0, forward: 2.2, turn: 0 },
			{ item: 'pallet-cmu-blocks', right: 1.8, forward: 2.2, turn: 0 },
			{ item: 'mortar-silo', right: - 7, forward: - 2, turn: 0 },
			{ item: 'drum-mixer-portable', right: - 3.5, forward: 1, turn: 0 },
			{ item: 'sand-pile-small', right: - 7, forward: 4.5, turn: 0 },
			{ item: 'wheelbarrow', right: - 1.5, forward: 4, turn: 30 },
			{ item: 'pallet-jack', right: 3.6, forward: 3.6, turn: 90 },
			{ item: 'telehandler-10k-stowed', right: 10, forward: 4, turn: 270 },
			{ item: 'scaffold-tower-ringlock-mobile', right: 4, forward: - 5, turn: 0 },
			{ item: 'worker-vest-tool-belt', right: - 2, forward: 5.5, turn: 180 },
		],
	},
	{
		id: 'set-rebar-yard',
		name: 'Rebar and formwork yard (rebar, timber, plywood, tool crib, telehandler)',
		keywords: 'rebar reinforcing steel formwork timber lumber plywood yard tool crib telehandler',
		members: [
			{ item: 'rebar-bundle-ground', right: 0, forward: 0, turn: 0 },
			{ item: 'rebar-bundle-ground', right: 0, forward: 0.8, turn: 0 },
			{ item: 'rebar-bundle-ground', right: 0, forward: 1.6, turn: 0 },
			{ item: 'timber-bundle', right: 0, forward: 5, turn: 0 },
			{ item: 'timber-bundle', right: 0, forward: 7, turn: 0 },
			{ item: 'pallet-plywood', right: 5.5, forward: 6, turn: 0 },
			{ item: 'tool-crib-10', right: 9, forward: 0, turn: 270 },
			{ item: 'telehandler-10k-stowed', right: - 8, forward: 3, turn: 90 },
			{ item: 'worker-welder', right: 4, forward: 1.5, turn: 180 },
			{ item: 'worker-vest-tool-belt', right: 3, forward: 3.8, turn: 200 },
		],
	},
	{
		id: 'set-manhole-install',
		name: 'Storm sewer / manhole install (excavator, trench box, rings, pipe, truck)',
		keywords: 'storm sewer manhole install trench box excavator pipe utilities precast',
		members: [
			{ item: 'excavator-20t', right: 0, forward: 0, turn: 0 },
			{ item: 'trench-box-8x20', right: 7, forward: 0, turn: 0 },
			{ item: 'manhole-ring-precast', right: - 4, forward: 7, turn: 0 },
			{ item: 'manhole-ring-precast', right: - 2.5, forward: 7, turn: 0 },
			{ item: 'manhole-ring-precast', right: - 1, forward: 7, turn: 0 },
			{ item: 'rcp-pipe-stack-24in', right: - 9, forward: 2, turn: 0 },
			{ item: 'dump-truck-tandem', right: 9, forward: 11, turn: 180 },
			{ item: 'worker-standing', right: 4, forward: 5, turn: 270 },
			...[ - 6, - 2, 2, 6 ].map( forward => ( { item: 'traffic-cone', right: 12, forward, turn: 0 } ) ),
		],
	},
	{
		id: 'set-batch-plant',
		name: 'Batch plant setup (portable plant, 3 mixer trucks, wheel loader, aggregate piles, office)',
		keywords: 'batch plant ready mix concrete mixer trucks loader aggregate stockpile sand',
		members: [
			// The plant's charging boot is 11.8 m right of its middle. One truck is under it, its
			// hopper at the boot, the next two queued in front to drive through the bay.
			{ item: 'batch-plant-portable', right: 0, forward: 0, turn: 0 },
			{ item: 'concrete-mixer-truck', right: 11.8, forward: - 3.7, turn: 180 },
			{ item: 'concrete-mixer-truck', right: 11.8, forward: 8, turn: 180 },
			{ item: 'concrete-mixer-truck', right: 11.8, forward: 18, turn: 180 },
			// The loader charges the bins from the front, from the stockpiles in front of it.
			{ item: 'wheel-loader', right: - 14.5, forward: 7, turn: 180 },
			{ item: 'sand-pile-small', right: - 23, forward: 14, turn: 0 },
			{ item: 'sand-pile-small', right: - 18.5, forward: 15, turn: 0 },
			{ item: 'sand-pile-small', right: - 14, forward: 14.5, turn: 0 },
			{ item: 'office-trailer-8x32', right: - 1, forward: 13, turn: 0 },
			{ item: 'pickup-truck', right: 3, forward: 18, turn: 180 },
			{ item: 'worker-standing', right: 4.2, forward: 9, turn: 200 },
			{ item: 'worker-walking', right: 9, forward: 2.5, turn: 90 },
			{ item: 'worker-standing', right: 0.5, forward: 10.5, turn: 180 },
		],
	},
	{
		id: 'set-break-area',
		name: 'Crew break area (picnic tables, toilets, bin, light)',
		keywords: 'crew break lunch area picnic tables toilets porta potty bin welfare',
		members: [
			{ item: 'picnic-tables-pair', right: 0, forward: 0, turn: 0 },
			{ item: 'porta-potty', right: 6, forward: - 1, turn: 0 },
			{ item: 'porta-potty', right: 7.6, forward: - 1, turn: 0 },
			{ item: 'frontload-4yd', right: - 5, forward: - 2, turn: 0 },
			{ item: 'worker-standing', right: 1.5, forward: 2.8, turn: 180 },
			{ item: 'worker-vest-tool-belt', right: - 1, forward: 2.6, turn: 160 },
			{ item: 'light-tower-led', right: - 8, forward: 2, turn: 0 },
		],
	},
	{
		id: 'set-dwall-csm',
		name: 'Diaphragm wall / CSM spread (trench cutter, CSM rig, desander, slurry tanks, silo, mixer, cages, crane)',
		keywords: 'diaphragm wall slurry wall d-wall csm cutter soil mixing hydromill trench cutter bentonite desander slurry plant rebar cage crawler crane foundation',
		members: [
			// Guide walls along the wall line, the trench cutter and the CSM rig facing it with their
			// cutters over the trench.
			...[ - 12, - 6, 0, 6, 12 ].map( right => ( { item: 'guide-wall-6m', right, forward: 10, turn: 90 } ) ),
			{ item: 'trench-cutter-bc32', right: - 6, forward: 3.3, turn: 0 },
			{ item: 'csm-rig-bg28', right: 10, forward: 6.3, turn: 0 },
			// The slurry plant behind: desander, two storage tanks, the bentonite silo feeding the
			// mixer, and the pump sending slurry to the wall.
			{ item: 'slurry-desander', right: - 15, forward: - 12, turn: 0 },
			{ item: 'slurry-tank-40m3', right: - 9, forward: - 14, turn: 0 },
			{ item: 'slurry-tank-40m3', right: - 4.5, forward: - 14, turn: 0 },
			{ item: 'bentonite-silo', right: 1.5, forward: - 14, turn: 0 },
			{ item: 'slurry-mixer-skid', right: 6, forward: - 13, turn: 0 },
			{ item: 'grout-pump-skid', right: 9.5, forward: - 12, turn: 0 },
			// Cages waiting on the wall's near side for the service crane to pick, the tremie rack by them.
			{ item: 'rebar-cage-dwall', right: 0, forward: 17, turn: 90 },
			{ item: 'rebar-cage-dwall', right: 0, forward: 20.5, turn: 90 },
			{ item: 'tremie-pipe-rack', right: 11, forward: 18, turn: 0 },
			{ item: 'crane-crawler', right: - 24, forward: 8, turn: 0 },
			{ item: 'excavator-20t', right: 19, forward: 0, turn: 0 },
			{ item: 'light-tower-led', right: - 15, forward: 3, turn: 0 },
			{ item: 'worker-standing', right: - 2, forward: 12.5, turn: 180 },
			{ item: 'worker-pointing', right: 3, forward: 13, turn: 200 },
			{ item: 'worker-vest-tool-belt', right: - 10, forward: - 8.5, turn: 160 },
			{ item: 'worker-standing', right: 4, forward: - 9.5, turn: 180 },
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
