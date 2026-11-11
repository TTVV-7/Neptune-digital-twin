// The places' own pages (worlddrive.app/drive/<slug>/, built by build.js): one for each start spot
// on the globe's panel (places.js's SPOTS, by `spot`) and a few more famous places to drive (by
// `at`, where their "Drive here" pins them: on a road, with the way along it as `heading` where
// it's clear). Each says what the place is, in a few true sentences, and what there is to do there
// in the game. Search engines show these pages for searches about driving a place, so each has its
// own title and description, and nothing on one is copied from another. Facts are kept to what's
// well known (dates, heights, names); a page is only worth having while it's true and useful.
//
// slug: the page's address; name and region: as the page and its pin say them (called: the name
// in a sentence, where that's not just the name: "the Golden Gate Bridge"); title and
// description: the page's <title> and meta description (about 150 characters, the most important
// first); about: what the place is, a paragraph each; todo: what to do there in World Drive;
// open: true where Google's 3D map is mostly the land itself, with few buildings modelled.

export const PLACES = [
	{
		slug: 'golden-gate-bridge',
		spot: 'golden-gate',
		name: 'Golden Gate Bridge',
		called: 'the Golden Gate Bridge',
		region: 'San Francisco, USA',
		title: 'Drive the Golden Gate Bridge in 3D',
		description: 'Drive across San Francisco\'s Golden Gate Bridge in photorealistic 3D, then take on the city\'s hills with stunts, boosts and drifts. Free in your browser.',
		about: [
			'The Golden Gate Bridge spans the strait at the mouth of San Francisco Bay, joining San Francisco to Marin County. When it opened in 1937 its 1,280 m (4,200 ft) main span was the longest of any suspension bridge in the world, a record it held until 1964.',
			'Its two towers rise 227 m (746 ft) above the water, and its colour, International Orange, was picked partly so the bridge would stand out in the fog that rolls in through the Golden Gate. It carries US 101 and California State Route 1 across the strait.',
		],
		todo: [
			'Start on the deck and drive between the two towers to the Marin side.',
			'Hit the booster on the span and hold it into overdrive.',
			'Fly up beside a tower and glide back down over the bay: land on the deck, or on the water and drive on across it.',
			'Head into the city: search for Lombard Street or Twin Peaks and drop in there.',
		],
	},
	{
		slug: 'times-square',
		spot: 'manhattan',
		name: 'Times Square',
		region: 'Manhattan, New York',
		title: 'Drive Times Square, New York, in 3D',
		description: 'Drive through Times Square and Midtown Manhattan in photorealistic 3D: the avenues, the screens and the skyscrapers. A free arcade driving game in your browser.',
		about: [
			'Times Square is where Broadway crosses Seventh Avenue in Midtown Manhattan. It was Longacre Square until April 1904, when the city renamed it after The New York Times, which was finishing its new tower there.',
			'Its walls of lit screens and billboards make it one of the most visited places in the world, and every New Year\'s Eve a ball drops from the top of One Times Square at midnight. The start spot is on Seventh Avenue, heading uptown.',
		],
		todo: [
			'Drive up Seventh Avenue between the screens.',
			'Turn off into the grid and find a long, straight avenue to boost down.',
			'Bounce off a building for a stunt: Midtown has plenty of them. Land on your wheels to score.',
			'Fly up between the skyscrapers and glide back down to the street.',
		],
	},
	{
		slug: 'monaco',
		spot: 'monaco',
		name: 'Monaco harbour',
		called: 'Monaco\'s harbour',
		region: 'Monte Carlo, Monaco',
		title: 'Drive the Streets of Monaco in 3D',
		description: 'Drive Monaco\'s harbour and the streets of its Grand Prix circuit in photorealistic 3D: the tunnel, the hairpin and Casino Square. Free in your browser.',
		about: [
			'Monaco\'s harbour, Port Hercule, lies below Monte Carlo on the French Riviera. Boulevard Albert 1er, along its edge, is the start and finish straight of the Monaco Grand Prix, which has been raced on the principality\'s own streets since 1929.',
			'From there the circuit climbs past Sainte-Dévote to Casino Square, drops down to the tight hairpin by the Fairmont hotel, runs through the tunnel under it and comes back round the harbour past the swimming pool.',
		],
		todo: [
			'Follow the Grand Prix circuit from the start line on Boulevard Albert 1er.',
			'Find the tunnel and boost through it.',
			'Drift the hairpin, one of the slowest corners in Formula 1, and let go for a mini-turbo.',
			'Drive off the quay and out across the harbour among the yachts.',
		],
	},
	{
		slug: 'shibuya-crossing',
		spot: 'shibuya',
		name: 'Shibuya Crossing',
		region: 'Tokyo, Japan',
		title: 'Drive Shibuya Crossing, Tokyo, in 3D',
		description: 'Drive Tokyo\'s Shibuya Crossing and the city around it in photorealistic 3D, with stunts, boosts and drifts. A free driving game in your browser.',
		about: [
			'Shibuya Crossing is the scramble crossing outside Shibuya Station in Tokyo: when the lights change, the traffic stops in every direction and people cross from all sides at once, a few thousand at a time at its busiest.',
			'Big video screens and department stores stand round it, and by the station exit is the statue of Hachikō, the dog who came back to the station to wait for his owner every day for years after his owner died.',
		],
		todo: [
			'Drive across the crossing and up the streets round the station.',
			'Fly up onto the elevated expressway over Route 246, just south of the station, and drive above the city.',
			'Drift the corners of the narrow streets for a mini-turbo.',
		],
	},
	{
		slug: 'grand-canyon',
		spot: 'grand-canyon',
		name: 'Grand Canyon rim road',
		called: 'the Grand Canyon\'s rim road',
		region: 'Arizona, USA',
		title: 'Drive the Grand Canyon\'s Rim in 3D',
		description: 'Drive Hermit Road on the Grand Canyon\'s South Rim in 3D whenever you like, and fly out over a canyon more than a mile deep. Free in your browser.',
		about: [
			'Hermit Road runs about 11 km (7 miles) west along the Grand Canyon\'s South Rim in Arizona, from Grand Canyon Village to Hermits Rest, past one viewpoint after another. For most of the year it\'s closed to private cars, and the park\'s shuttle buses drive it instead.',
			'Below the rim, the canyon the Colorado River has cut is more than 1.6 km (a mile) deep in places.',
		],
		todo: [
			'Drive the rim road from one viewpoint to the next.',
			'Fly off the rim and out over the canyon, then glide down into it.',
			'Coming down from that high takes a while: R puts you back on the road.',
		],
		open: true,
	},
	{
		slug: 'furka-pass',
		spot: 'furka',
		name: 'Furka Pass',
		called: 'the Furka Pass',
		region: 'Swiss Alps, Switzerland',
		title: 'Drive the Furka Pass in the Swiss Alps in 3D',
		description: 'Drive the Furka Pass, 2,429 m up in the Swiss Alps, in 3D: hairpins, glacier views and the road from Goldfinger. A free driving game in your browser.',
		about: [
			'The Furka Pass crosses the Swiss Alps at 2,429 m, between Gletsch in Valais and Realp in Uri. On the Valais side its road climbs in tight hairpins past the Rhône Glacier, where the Rhône begins, and the old Hotel Belvédère on one of its bends.',
			'In the 1964 James Bond film Goldfinger, Bond follows Goldfinger\'s Rolls-Royce up the pass in his Aston Martin DB5. The road is usually closed by snow from late autumn to early summer; the start spot is at the top of the pass.',
		],
		todo: [
			'Drive down the hairpins toward the Rhône Glacier.',
			'Drift each hairpin and let go for a mini-turbo out of it.',
			'Fly off the edge and glide down the valley; R puts you back on the road.',
		],
		open: true,
	},
	{
		slug: 'arc-de-triomphe',
		spot: 'arc',
		name: 'Arc de Triomphe',
		called: 'the Arc de Triomphe',
		region: 'Paris, France',
		title: 'Drive Round the Arc de Triomphe in Paris in 3D',
		description: 'Drive the big roundabout round the Arc de Triomphe and down the Champs-Élysées in photorealistic 3D. A free arcade driving game in your browser.',
		about: [
			'The Arc de Triomphe stands at the centre of Place Charles de Gaulle in Paris, where twelve avenues meet, the Champs-Élysées among them. Napoleon ordered it in 1806 to honour his armies; it was finished in 1836, and France\'s Unknown Soldier has lain beneath it since 1921.',
			'The traffic goes round it on a wide cobbled roundabout with no lanes marked on it.',
		],
		todo: [
			'Go round the roundabout, then pick an avenue.',
			'Drive down the Champs-Élysées to the Place de la Concorde.',
			'Head south across the Seine to the Eiffel Tower, under 2 km away.',
		],
	},
	{
		slug: 'las-vegas-strip',
		spot: 'vegas',
		name: 'Las Vegas Strip',
		called: 'the Las Vegas Strip',
		region: 'Nevada, USA',
		title: 'Drive the Las Vegas Strip in 3D',
		description: 'Cruise the Las Vegas Strip in photorealistic 3D past the casinos, the Bellagio\'s lake and the half-size Eiffel Tower. Stunts and boosts, free in your browser.',
		about: [
			'The Las Vegas Strip is the stretch of Las Vegas Boulevard South lined with the city\'s biggest resorts and casinos, about 6.8 km (4.2 miles) long and mostly outside the city itself, in the town of Paradise.',
			'The start spot is by the Bellagio\'s lake and fountains, across the boulevard from Paris Las Vegas and its half-size copy of the Eiffel Tower.',
		],
		todo: [
			'Cruise the boulevard between the resorts, north or south.',
			'Boost down the Strip and see how long you can stay in overdrive.',
			'Drive south about 3 km to the Welcome to Fabulous Las Vegas sign.',
			'Fly up over the resorts for the view of the valley.',
		],
	},
	{
		slug: 'sydney-harbour-bridge',
		spot: 'sydney',
		name: 'Sydney Harbour Bridge',
		called: 'the Sydney Harbour Bridge',
		region: 'Sydney, Australia',
		title: 'Drive the Sydney Harbour Bridge in 3D',
		description: 'Drive over the Sydney Harbour Bridge in photorealistic 3D, beside the Opera House and high over the harbour. A free arcade driving game in your browser.',
		about: [
			'The Sydney Harbour Bridge carries road and rail across Sydney Harbour between the city centre and the North Shore. The steel arch, known in Sydney as the Coathanger, opened in 1932; it spans 503 m and its top is 134 m above the water.',
			'The Sydney Opera House stands on Bennelong Point, just east of the bridge\'s southern end.',
		],
		todo: [
			'Start on the deck and drive from the city to the North Shore.',
			'Fly up over the arch and glide down toward the water.',
			'Find your way round to the Opera House.',
		],
	},
	{
		slug: 'lions-gate-bridge',
		spot: 'lions-gate',
		name: 'Lions Gate Bridge',
		called: 'the Lions Gate Bridge',
		region: 'Vancouver, Canada',
		title: 'Drive the Lions Gate Bridge in Vancouver in 3D',
		description: 'Drive Vancouver\'s Lions Gate Bridge in photorealistic 3D, from Stanley Park across the First Narrows to the North Shore. Free in your browser.',
		about: [
			'The Lions Gate Bridge is a suspension bridge across the First Narrows of Burrard Inlet, joining Stanley Park in Vancouver to the North Shore. It opened in 1938, paid for by the Guinness family to reach the British Properties, the homes they were building on the slopes of West Vancouver, and it\'s named after the Lions, two peaks above the city.',
			'It has three lanes, the middle one changing direction with the traffic, and a pair of lion statues at its southern end.',
		],
		todo: [
			'Start on the deck and drive it end to end, high over the shipping channel.',
			'Boost across the span to the North Shore.',
			'Go over the railing, come down on Burrard Inlet and drive across the water to the shore.',
		],
	},
	{
		slug: 'sea-to-sky-highway',
		spot: 'sea-to-sky',
		name: 'Sea-to-Sky Highway',
		called: 'the Sea-to-Sky Highway',
		region: 'British Columbia, Canada',
		title: 'Drive the Sea-to-Sky Highway in 3D',
		description: 'Drive British Columbia\'s Sea-to-Sky Highway in 3D, along the cliffs above Howe Sound with the Coast Mountains across the water. Free in your browser.',
		about: [
			'The Sea-to-Sky Highway is Highway 99 between West Vancouver and Whistler, in British Columbia. Between Horseshoe Bay and Squamish it\'s cut into the steep shore of Howe Sound, a fjord dotted with islands, with the Coast Mountains rising on the far side.',
			'It was widened and straightened before the 2010 Winter Olympics in Vancouver and Whistler. The start spot is near Porteau Cove, about halfway to Squamish.',
		],
		todo: [
			'Follow the curves along the water toward Squamish.',
			'Drift the bends and boost on the straights.',
			'Fly up over the cliffs for the view across Howe Sound.',
		],
		open: true,
	},
	{
		slug: 'neptune-terminals',
		spot: 'neptune',
		name: 'Neptune Terminals',
		region: 'North Vancouver, Canada',
		title: 'Drive Neptune Terminals in North Vancouver in 3D',
		description: 'Drive the North Vancouver waterfront at Neptune Terminals in 3D: the berths, the ships and Burrard Inlet, with stunts and boosts. Free in your browser.',
		about: [
			'Neptune Terminals is a bulk terminal on the north shore of Burrard Inlet in North Vancouver, part of the Port of Vancouver, Canada\'s biggest port. Trains bring in steelmaking coal from British Columbia and potash from Saskatchewan, and ships load them at its berths.',
			'Across the water are the towers of downtown Vancouver, and behind it the North Shore mountains.',
		],
		todo: [
			'Drive the roads round the terminal and along the waterfront.',
			'Fly up for the view along Burrard Inlet to Stanley Park.',
			'The Lions Gate Bridge is about 6 km to the west: pick it from the start spots.',
		],
	},
	{
		slug: 'eiffel-tower',
		at: { lat: 48.86, lon: 2.2945, heading: 236 },
		name: 'Eiffel Tower',
		called: 'the Eiffel Tower',
		region: 'Paris, France',
		title: 'Drive to the Eiffel Tower in Paris in 3D',
		description: 'Drive along the Seine past the Eiffel Tower in photorealistic 3D, then fly up for the view over Paris. A free arcade driving game in your browser.',
		about: [
			'The Eiffel Tower was built by Gustave Eiffel\'s company for the 1889 World\'s Fair in Paris, and it was the tallest structure in the world until 1930. With its antennas it\'s 330 m tall today.',
			'It stands at the end of the Champ de Mars by the Seine, and the Pont d\'Iéna crosses the river from its foot to the Trocadéro. The pin is on the Quai Branly, the road along the river beside it.',
		],
		todo: [
			'Drive along the river past the tower\'s feet.',
			'Cross the Pont d\'Iéna to the Trocadéro and look back.',
			'Fly up beside the tower and glide down over the Champ de Mars.',
			'Head north to the Arc de Triomphe, under 2 km away.',
		],
	},
	{
		slug: 'colosseum',
		at: { lat: 41.892, lon: 12.4894, heading: 127 },
		name: 'Colosseum',
		called: 'the Colosseum',
		region: 'Rome, Italy',
		title: 'Drive to the Colosseum in Rome in 3D',
		description: 'Drive the Via dei Fori Imperiali to the Colosseum in photorealistic 3D, past the ruins of ancient Rome. A free arcade driving game in your browser.',
		about: [
			'The Colosseum was finished in AD 80 under the emperor Titus. It held some 50,000 people, and it\'s still the largest amphitheatre ever built.',
			'The Via dei Fori Imperiali runs straight to it from Piazza Venezia between the ruins of the imperial forums. The pin is on that road, with the Colosseum ahead.',
		],
		todo: [
			'Drive down to the Colosseum and all the way round it.',
			'Fly up over the Roman Forum and the Palatine Hill.',
			'Find the Circus Maximus, the old chariot-racing track, a short drive south-west.',
		],
	},
	{
		slug: 'piccadilly-circus',
		at: { lat: 51.5101, lon: - 0.1342 },
		name: 'Piccadilly Circus',
		region: 'London, England',
		title: 'Drive Piccadilly Circus in London in 3D',
		description: 'Drive through Piccadilly Circus and London\'s West End in photorealistic 3D, with stunts, boosts and drifts. Free in your browser, nothing to download.',
		about: [
			'Piccadilly Circus is a road junction in London\'s West End, laid out in 1819 to join Regent Street to Piccadilly. Lit advertising signs have shone over its traffic since the early 1900s.',
			'The Shaftesbury Memorial Fountain, topped by the winged archer everyone calls Eros, has stood there since 1893. From the circus Regent Street curves away north, and Haymarket runs south toward Trafalgar Square.',
		],
		todo: [
			'Drive round the circus and up the curve of Regent Street.',
			'Head down Haymarket toward Trafalgar Square.',
			'Fly over the West End\'s rooftops and glide back down.',
		],
	},
	{
		slug: 'hollywood-boulevard',
		at: { lat: 34.1015, lon: - 118.3405, heading: 90 },
		name: 'Hollywood Boulevard',
		region: 'Los Angeles, USA',
		title: 'Drive Hollywood Boulevard in Los Angeles in 3D',
		description: 'Drive Hollywood Boulevard past the Walk of Fame and the Chinese Theatre in photorealistic 3D, with the Hollywood Sign above. Free in your browser.',
		about: [
			'Hollywood Boulevard runs through the middle of Hollywood in Los Angeles. More than 2,700 stars of the Hollywood Walk of Fame are set in its pavements and those of Vine Street, and the TCL Chinese Theatre, opened in 1927 as Grauman\'s Chinese, has film stars\' handprints and footprints in its forecourt.',
			'The Hollywood Sign looks down from Mount Lee in the hills to the north. The pin is on the boulevard outside the theatre.',
		],
		todo: [
			'Cruise the boulevard east to Vine Street.',
			'Fly up into the hills toward the Hollywood Sign.',
			'Search for Mulholland Drive and drive along the ridge.',
		],
	},
	{
		slug: 'copacabana',
		at: { lat: - 22.97685, lon: - 43.18814 },
		name: 'Copacabana',
		region: 'Rio de Janeiro, Brazil',
		title: 'Drive Copacabana Beach in Rio de Janeiro in 3D',
		description: 'Drive Avenida Atlântica along Copacabana Beach in photorealistic 3D, between the sea and Rio\'s hills. A free arcade driving game in your browser.',
		about: [
			'Copacabana\'s beach curves for about 4 km along the Atlantic in Rio de Janeiro, and Avenida Atlântica follows it all the way, with a promenade paved in a black-and-white wave pattern between the road and the sand.',
			'Sugarloaf Mountain rises a little beyond its north-east end, and every New Year\'s Eve millions of people gather on the beach for the fireworks.',
		],
		todo: [
			'Drive the length of the avenue along the beach.',
			'Drive down off the sand and out across the sea.',
			'Fly up for the view of the bay and the hills round it.',
		],
	},
];
