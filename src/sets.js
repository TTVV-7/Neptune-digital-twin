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
		id: 'set-paving-train',
		name: 'Asphalt paving train (distributor, trucks, transfer vehicle, paver, rollers)',
		keywords: 'paving train asphalt paving mtv shuttle buggy paver rollers tack distributor dump trucks mainline overlay',
		// In paving order along one lane: the distributor tacking ahead, a truck backed onto the
		// transfer vehicle's hopper with the next one waiting beside it, the transfer vehicle's
		// conveyor over the paver's hopper, a screed hand, then the breakdown, pneumatic and
		// finish rollers behind.
		members: [
			{ item: 'asphalt-distributor-truck', right: 0, forward: 40, turn: 0 },
			{ item: 'dump-truck-tandem', right: 4, forward: 27, turn: 0 },
			{ item: 'dump-truck-tandem', right: 0, forward: 22.3, turn: 0 },
			{ item: 'material-transfer-vehicle', right: 0, forward: 9.7, turn: 0 },
			{ item: 'asphalt-paver-10ft', right: 0, forward: 0, turn: 0 },
			{ item: 'worker-standing', right: 2.2, forward: - 3.6, turn: 270 },
			{ item: 'roller-tandem-67in', right: 0, forward: - 9, turn: 0 },
			{ item: 'roller-pneumatic-9wheel', right: 0.5, forward: - 17, turn: 0 },
			{ item: 'roller-tandem', right: - 0.8, forward: - 24, turn: 0 },
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
		id: 'set-box-culvert-install',
		name: 'Box culvert install (crane, excavator, culvert sections laid and staged, laser)',
		keywords: 'box culvert install precast culvert crossing crane excavator laser storm drain sections',
		members: [
			// Three 8 ft sections laid end to end across the set, three more staged in front for the
			// rough-terrain crane to pick, the excavator trimming the bed at the far end.
			...[ - 2.44, 0, 2.44 ].map( right => ( { item: 'box-culvert-6x4', right, forward: 0, turn: 90 } ) ),
			...[ - 3, 0, 3 ].map( right => ( { item: 'box-culvert-6x4', right, forward: 7, turn: 0 } ) ),
			{ item: 'crane-rough-terrain-40t', right: 11, forward: 5, turn: 270 },
			{ item: 'excavator-20t', right: - 11, forward: - 1, turn: 90 },
			{ item: 'rotating-laser-tripod', right: 1, forward: - 4, turn: 0 },
			{ item: 'worker-pointing', right: 4.5, forward: 2.5, turn: 220 },
			{ item: 'worker-standing', right: - 3.5, forward: 2.8, turn: 180 },
			{ item: 'dump-truck-tandem', right: - 11, forward: 9, turn: 90 },
		],
	},
	{
		id: 'set-site-entrance',
		name: 'Site entrance (20 ft gate, fence, rumble grid, project sign, safety station, muster point)',
		keywords: 'site entrance gate access fence rumble grid track out sign board safety station muster point bins',
		members: [
			// The gate in the fence line, the track-out grid just inside it, the project sign outside
			// facing the road, and a stop sign for trucks leaving.
			{ item: 'fence-gate-20ft', right: 0, forward: 0, turn: 0 },
			...[ - 1, 1 ].flatMap( s => [ 0, 1, 2 ].map( i => ( { item: 'fence-panel', right: s * ( 4.572 + i * 3.048 ), forward: 0, turn: 0 } ) ) ),
			{ item: 'rumble-grid-12x20', right: 0, forward: - 5, turn: 0 },
			{ item: 'site-sign-8x4', right: 8.5, forward: 2.5, turn: 0 },
			{ item: 'stop-sign-portable', right: 3.4, forward: - 2.5, turn: 180 },
			{ item: 'safety-station', right: - 7, forward: - 3.5, turn: 0 },
			{ item: 'wheelie-bin-95', right: - 9.2, forward: - 3.4, turn: 0 },
			{ item: 'recycling-bin-95', right: - 10.1, forward: - 3.4, turn: 0 },
			{ item: 'muster-point-sign', right: 8, forward: - 5, turn: 0 },
			{ item: 'worker-standing', right: - 4.5, forward: - 1.5, turn: 180 },
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
		],
	},
	{
		id: 'set-marine-piling',
		name: 'Marine piling spread (spud barge crane, pile barge and push boat, skiff, sheet pile template, turbidity curtain)',
		keywords: 'marine piling spread barge crane spud barge material barge tug push boat skiff template turbidity curtain waterfront wharf pier dock bulkhead',
		members: [
			// The crane barge with its boom over the bow and the template ahead of it on the pile line.
			{ item: 'spud-barge-crane-spuds-down', right: 0, forward: 0, turn: 0 },
			{ item: 'sheet-pile-template-40ft', right: 0, forward: 24.5, turn: 0 },
			// The pile barge alongside on the right, the push boat on its stern, the skiff off the left.
			{ item: 'deck-barge-150x40-pipe-piles', right: 14.3, forward: - 2, turn: 0 },
			{ item: 'push-boat-65ft', right: 14.3, forward: - 35.1, turn: 0 },
			{ item: 'work-skiff-24ft', right: - 13, forward: 12, turn: 20 },
			// Turbidity curtain round the work: across the front and down both sides.
			...[ - 22.86, - 7.62, 7.62, 22.86 ].map( right => ( { item: 'turbidity-curtain-50ft', right, forward: 32, turn: 0 } ) ),
			...[ - 1, 1 ].flatMap( s => [ 24.38, 9.14 ].map( forward => ( { item: 'turbidity-curtain-50ft', right: s * 30.48, forward, turn: 90 } ) ) ),
		],
	},
	{
		id: 'set-erosion-perimeter',
		name: 'Erosion control perimeter (silt fence, construction entrance, inlet protection, washout, tree protection)',
		keywords: 'erosion sediment control esc swppp silt fence construction entrance inlet protection concrete washout tree protection perimeter',
		members: [
			// The stone entrance from the road (the set's front, downslope) into the site, with silt
			// fence along the front either side of it, its fabric facing upslope into the site.
			{ item: 'construction-entrance-20x50', right: 0, forward: 0, turn: 0 },
			...[ - 1, 1 ].flatMap( s => [ 0, 1, 2, 3, 4, 5 ].map( i => ( { item: 'silt-fence-10ft', right: s * ( 3.6 + 1.524 + i * 3.048 ), forward: 6, turn: 180 } ) ) ),
			// Catch basins inside protected, the washout back from the entrance where mixers can reach it.
			{ item: 'inlet-filter-bag', right: 9, forward: - 2, turn: 0 },
			{ item: 'inlet-gravel-bag-ring', right: - 12, forward: - 6, turn: 0 },
			{ item: 'washout-rolloff', right: - 8, forward: - 14, turn: 90 },
			{ item: 'spill-kit-95gal', right: - 4.5, forward: - 12, turn: 0 },
			// A 20 ft square of tree protection fence round a tree to keep, with its sign at the front.
			...[ - 1, 1 ].flatMap( i => [
				{ item: 'tree-protection-fence-10ft', right: 14 + i * 1.524, forward: - 11, turn: 0 },
				{ item: 'tree-protection-fence-10ft', right: 14 + i * 1.524, forward: - 17.1, turn: 180 },
				{ item: 'tree-protection-fence-10ft', right: 17.05, forward: - 14.05 + i * 1.524, turn: 90 },
				{ item: 'tree-protection-fence-10ft', right: 10.95, forward: - 14.05 + i * 1.524, turn: 270 },
			] ),
			{ item: 'tree-protection-sign', right: 14, forward: - 10.8, turn: 0 },
			{ item: 'worker-standing', right: 4, forward: - 9.5, turn: 180 },
		],
	},
	{
		id: 'set-rail-work-block',
		name: 'Rail work block (tamper, ballast regulator, track panels, hi-rail trucks, crew)',
		keywords: 'rail work block track maintenance tamper regulator hi-rail surfacing gang railroad mow',
		members: [
			// One line of track along the set, 39 ft panels butted to the machines' own track: the
			// tamper working towards the front, the regulator behind it.
			{ item: 'rail-track-39ft', right: 0, forward: 29.72, turn: 0 },
			{ item: 'rail-track-39ft', right: 0, forward: 17.83, turn: 0 },
			{ item: 'production-tamper', right: 0, forward: 0, turn: 0 },
			{ item: 'ballast-regulator', right: 0, forward: - 17.83, turn: 0 },
			{ item: 'rail-track-39ft', right: 0, forward: - 29.72, turn: 0 },
			// The hi-rail trucks set off on the access road beside the track, the crew on the shoulder.
			{ item: 'hi-rail-pickup', right: 6, forward: 20, turn: 0 },
			{ item: 'hi-rail-truck', right: 6, forward: - 14, turn: 0 },
			{ item: 'worker-pointing', right: 2.8, forward: 13, turn: 270 },
			{ item: 'worker-standing', right: 3.2, forward: 4, turn: 300 },
			{ item: 'worker-vest-drawings', right: - 2.8, forward: - 6, turn: 90 },
			{ item: 'worker-walking', right: 3.0, forward: - 24, turn: 0 },
			{ item: 'flagger', right: 3.5, forward: 37, turn: 0 },
		],
	},
	{
		id: 'set-tunnel-shaft',
		name: 'Tunnel shaft work area (gantry over the shaft, segments, vent fan, muck train, grout, office)',
		keywords: 'tunnel shaft launch shaft tbm gantry segments muck train vent fan grout tunnelling',
		members: [
			// The gantry over the shaft in the middle, segments stacked within its reach on the right.
			{ item: 'shaft-gantry-20t', right: 0, forward: 0, turn: 0 },
			{ item: 'tunnel-segment-stack-6m', right: 12, forward: - 4, turn: 0 },
			{ item: 'tunnel-segment-stack-6m', right: 12, forward: - 1.5, turn: 0 },
			{ item: 'tunnel-segment-stack-6m', right: 12, forward: 1, turn: 0 },
			// The vent fan on the left blowing toward the shaft, a spare cutterhead behind it.
			{ item: 'tunnel-vent-fan-48in', right: - 13, forward: 3, turn: 90 },
			{ item: 'tbm-cutterhead-6-5m', right: - 12.5, forward: - 8, turn: 0 },
			// Muck cars waiting on the track behind the shaft, grout beside the segments.
			{ item: 'muck-train-3-car', right: 0, forward: - 14, turn: 90 },
			{ item: 'grout-pump-skid', right: 12, forward: 6, turn: 0 },
			{ item: 'slurry-mixer-skid', right: 12, forward: 9.5, turn: 0 },
			{ item: 'office-trailer-10x40', right: - 10, forward: 15, turn: 0 },
			{ item: 'worker-standing', right: 9.5, forward: 2, turn: 270 },
			{ item: 'worker-standing', right: 5, forward: 9.5, turn: 180 },
		],
	},
	{
		id: 'set-pole-replacement',
		name: 'Pole replacement (digger derrick augering, pole trailer, old pole, lane closure, flagger, crew)',
		keywords: 'pole replacement pole change utility pole power line digger derrick line crew lineman hydro lane closure',
		members: [
			// The digger derrick in the curb lane, outriggers down, augering the new hole on its right
			// beside the old pole; the pole trailer parked behind it, a pickup ahead.
			{ item: 'digger-derrick-47ft-working', right: 0, forward: 0, turn: 0 },
			{ item: 'utility-pole-transformers', right: 9.8, forward: - 2, turn: 90 },
			{ item: 'pole-trailer-loaded', right: 0, forward: - 13.8, turn: 0 },
			{ item: 'pickup-truck', right: 0, forward: 9.5, turn: 0 },
			// The lane closed with a cone taper from the front, the sign and flagger ahead of it.
			{ item: 'traffic-cone', right: 1.2, forward: 22, turn: 0 },
			{ item: 'traffic-cone', right: 0, forward: 18.5, turn: 0 },
			{ item: 'traffic-cone', right: - 1.2, forward: 15, turn: 0 },
			{ item: 'traffic-cone', right: - 2.4, forward: 11.5, turn: 0 },
			{ item: 'traffic-cone', right: - 2.6, forward: 5, turn: 0 },
			{ item: 'traffic-cone', right: - 2.6, forward: - 2, turn: 0 },
			{ item: 'traffic-cone', right: - 2.6, forward: - 9, turn: 0 },
			{ item: 'traffic-cone', right: - 2.6, forward: - 16, turn: 0 },
			{ item: 'traffic-cone', right: - 2.6, forward: - 22, turn: 0 },
			{ item: 'sign-work-zone-stand', right: - 3, forward: 32, turn: 0 },
			{ item: 'flagger', right: - 3.4, forward: 26, turn: 0 },
			// The crew at the hole and the truck's controls.
			{ item: 'worker-pointing', right: 6.8, forward: - 1.2, turn: 120 },
			{ item: 'worker-standing', right: 9.6, forward: - 6, turn: 330 },
			{ item: 'worker-walking', right: 2.2, forward: - 5.5, turn: 90 },
		],
	},
	{
		id: 'set-gate-security',
		name: 'Gate and security (20 ft gate, turnstile, barrier arm, card reader, CCTV tower, PPE and rules signs, parking)',
		keywords: 'gate security access control turnstile barrier arm card reader cctv camera tower ppe sign site rules parking wheel stops entrance',
		members: [
			// The vehicle gate in the fence line with a barrier arm inside it and the card reader on
			// the driver's side ahead of the arm; the turnstile set into the fence to its right.
			{ item: 'fence-gate-20ft', right: 0, forward: 0, turn: 0 },
			...[ 4.572, 7.62, 10.668 ].map( d => ( { item: 'fence-panel', right: - d, forward: 0, turn: 0 } ) ),
			{ item: 'fence-panel', right: 4.572, forward: 0, turn: 0 },
			{ item: 'turnstile-full-height', right: 6.85, forward: 0, turn: 0 },
			{ item: 'fence-panel', right: 9.14, forward: 0, turn: 0 },
			{ item: 'fence-panel', right: 12.19, forward: 0, turn: 0 },
			{ item: 'barrier-arm-12ft', right: 0, forward: - 5, turn: 0 },
			{ item: 'card-reader-pedestal', right: 1.75, forward: - 2.6, turn: 0 },
			// Signs outside facing the way in, the emergency board inside, and the camera tower
			// watching the gate from inside the corner.
			{ item: 'sign-ppe-required', right: 9.2, forward: 2, turn: 0 },
			{ item: 'site-rules-board', right: 11.8, forward: 2, turn: 0 },
			{ item: 'sign-emergency-contacts', right: 8.6, forward: - 2.2, turn: 180 },
			{ item: 'cctv-tower-trailer', right: - 9, forward: - 6, turn: 0 },
			// Parking along the fence outside, to the left of the gate.
			...[ - 6, - 9, - 12 ].map( right => ( { item: 'wheel-stop-6ft', right, forward: 2.5, turn: 0 } ) ),
			{ item: 'worker-standing', right: 6.4, forward: - 2.2, turn: 180 },
		],
	},
	{
		id: 'set-pipeline-spread',
		name: 'Pipeline spread (strung 36 in pipe, sidebooms, weld shack, rig welder, bender, stringing truck, vacuum lifter, padder)',
		keywords: 'pipeline spread right of way row mainline line pipe stringing welding sideboom pipelayer bending padding oil gas transmission',
		members: [
			// Six joints strung end to end along the ditch line, the weld shack over the joint in
			// the middle and the rig welder parked beside it on a short run of mats.
			...[ - 2.5, - 1.5, - 0.5, 0.5, 1.5, 2.5 ].map( i => ( { item: 'line-pipe-joint-on-skids', right: 0, forward: i * 24.69, turn: 0 } ) ),
			{ item: 'pipe-welding-shack', right: 0, forward: 0, turn: 0 },
			...[ 14, 18.3, 22.6 ].map( forward => ( { item: 'access-mat-8x14', right: - 6, forward, turn: 0 } ) ),
			{ item: 'welding-rig-truck', right: - 6, forward: 18, turn: 0 },
			// Three sidebooms on the working side, their booms out over the pipe.
			...[ - 22, - 8, 6 ].map( forward => ( { item: 'pipelayer-583', right: 5.8, forward, turn: 0 } ) ),
			// The travel lane: the stringing truck with the vacuum lifter excavator unloading it, the
			// bending machine ahead.
			{ item: 'pipe-stringing-trailer', right: 12, forward: 30, turn: 0 },
			{ item: 'pipe-vacuum-lifter-excavator', right: 5, forward: 30, turn: 90 },
			{ item: 'pipe-bending-machine-36in', right: 12, forward: - 40, turn: 0 },
			// The spoil side: the holiday detector on its test length, the padder and the carrier.
			{ item: 'holiday-detector', right: - 6, forward: - 20, turn: 0 },
			{ item: 'padding-machine', right: - 8, forward: 45, turn: 0 },
			{ item: 'tracked-carrier-morooka', right: - 7, forward: - 45, turn: 0 },
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
