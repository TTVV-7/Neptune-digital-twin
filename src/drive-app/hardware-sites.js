// Spacecraft hardware on the Moon and Mars: where the landers, rovers and crash sites are, for
// putting their models on the ground. Each site has a position (the main piece) and the pieces to
// build there, each placed in metres east and north of that position.
//
// Conventions: latitudes and longitudes in degrees, planetocentric, north and EAST positive,
// longitudes -180..180 (a source's 336.5781° E is -23.4219 here, its 12.37° W is -12.37), the same
// as moon-places.js and mars-places.js. Moon positions are in LRO's mean Earth/polar axis frame.
// Offsets: metres on a sphere of 1737.4 km (Moon) / 3389.5 km (Mars), from the sources'
// coordinates where both pieces have them, otherwise approximate (noted beside the piece).
// heading: degrees clockwise from north; 0 where it isn't known.
//
// Sources:
// - Moon, US, Soviet hardware: Wagner, R. V., Nelson, D. M., Plescia, J. B., Robinson, M. S.,
//   Speyerer, E. J., Mazarico, E. (2017), Coordinates of anthropogenic features on the Moon,
//   Icarus 283, 92-103, doi:10.1016/j.icarus.2016.05.011, and the LROC table it comes from,
//   "2016 LROC Coordinates of Human Features" (LROC featured image 938):
//   https://www.lroc.asu.edu/images/938
//   https://www.lroc.asu.edu/data/support/downloads/2016_LROC_Coordinates_of_Human_Features.pdf
// - NSSDCA's LRO-derived Apollo coordinates: https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html
//   and the Apollo LM/ALSEP spacecraft pages (e.g. https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1972-096C)
// - LROC featured images for later landers and impacts (https://www.lroc.asu.edu/images/<n>):
//   Chang'e 3 (posts on the 2013 landing), Chang'e 4 (1087), Chang'e 5 (1172), Chang'e 6 (1374),
//   Chandrayaan-3 (1314), SLIM (1358), IM-1 Odysseus (NASA LRO release), IM-2 Athena (1401),
//   Blue Ghost (1407), Beresheet (1101), HAKUTO-R M1 (1302), Luna 25 (1311), Chandrayaan-2 Vikram
//   (1131), GRAIL (596, 605), LADEE (822), Apollo 16 S-IVB (894), Lunokhod 2 (699), Yutu-2 (1168).
// - Lunokhod 2's position by laser ranging: Karachevtseva et al. (2017), Cartography of the Luna-21
//   landing site and Lunokhod-2 traverse area, Icarus 283, 104-121.
// - LCROSS: the weighted-average reconstructed Centaur impact point from a NASA technical report
//   (https://ntrs.nasa.gov/citations/20140005563 and related LCROSS reconstructions).
// - Mars: HiRISE captions and image pages (https://www.uahirise.org/<image id>), NASA/JPL mission
//   pages, Bridges et al. (2017), Identification of the Beagle 2 lander on Mars, R. Soc. Open Sci.
//   4:170785, and Wu et al. (2022, JGR Planets) for the Tianwen-1 landing site.
//
// Not included, because no reliable position could be found: Pragyan's exact end point (placed
// nominally, see its site), SLIM's LEV-1 and SORA-Q (deployed nearby but not located from orbit),
// the Apollo 16 ALSEP, ispace Mission 2 (no coordinates found), Yutu-2's position after Oct 2020,
// Curiosity's and Perseverance's present positions (their entries are their landing sites, with no
// rover piece), Ingenuity's final resting place (only a secondary-source position, ~18.50 N
// 77.32 E, was found), Zhurong's end point (it drove ~1.9 km south of its lander; no coordinates
// found), the MER/MSL backshells.
//
// Differences from moon-places.js / mars-places.js (those mostly use pre-LRO or image-centre values):
// - apollo-12 -3.0124, -23.4216 there; LRO puts the LM at -3.0128, -23.4219 (~15 m).
// - apollo-14 -3.6453, -17.4714 there (Davies & Colvin 2000); LRO -3.64589, -17.47194 (~60 m).
// - apollo-15 26.1322, 3.6339 there; LRO 26.13239, 3.63330 (~16 m).
// - apollo-16 -8.973, 15.5002 there; LRO -8.9734, 15.5011 (~30 m).
// - apollo-17 20.1908, 30.7717 there; LRO 20.1911, 30.7723 (~20 m).
// - lunokhod-1 38.24, -35.0 there is Luna 17's lander; the rover ended at 38.3150, -35.0081 (~2.3 km away).
// - lunokhod-2 25.85, 30.45 there is near the Luna 21 lander; the rover ended at 25.8323, 30.9221 (~15 km away).
// - change-3 44.12, -19.51 there; LROC 44.1214, -19.5116. chandrayaan-3 -69.37, 32.32 there; LROC -69.373, 32.319.
// - beagle-2 11.53, 90.43 there; Bridges et al. 11.52879, 90.43139.
// - viking-1, viking-2, pathfinder there are HiRISE image centres; kept as such here, flagged uncertain.

export const SITES = [

	// ---- Moon: Apollo ----

	{
		id: 'apollo-11', world: 'moon', name: 'Tranquility Base', country: 'USA', year: 1969, kind: 'lander',
		lat: 0.67416, lon: 23.47314,
		pieces: [
			{ model: 'apolloDescentStage', east: 0, north: 0, heading: 0 },
			{ model: 'laserReflector', east: 0, north: - 21, heading: 0 }, // ~21 m south of the LM in LROC images
			{ model: 'alsep', east: 0, north: - 27, heading: 0 }, // the seismometer, ~27 m south in LROC images
			{ model: 'usFlag', east: - 8, north: 2, heading: 0 }, // approximate: a few metres in front (west) of the LM
		],
		final: true,
		fact: 'Aldrin saw the flag knocked over by the ascent stage\'s exhaust as Eagle lifted off.',
		source: 'Wagner et al. 2017 / LROC 2016 table (LM); LROC images via ALSJ (LRRR, seismometer)',
	},
	{
		id: 'apollo-12', world: 'moon', name: 'Apollo 12 and Surveyor 3', country: 'USA', year: 1969, kind: 'lander',
		lat: - 3.0128, lon: - 23.4219,
		pieces: [
			{ model: 'apolloDescentStage', east: 0, north: 0, heading: 0 },
			{ model: 'alsep', east: - 82, north: 103, heading: 0 }, // ALSEP central station -3.0094, -23.4246
			{ model: 'surveyor', east: 118, north: - 103, heading: 0 }, // Surveyor 3 (1967) -3.0162, -23.4180
			{ model: 'usFlag', east: - 6, north: 4, heading: 0 }, // approximate
		],
		final: true,
		fact: 'Conrad and Bean walked to Surveyor 3, landed here 2.5 years earlier, and brought its TV camera home.',
		source: 'LROC 2016 table (LM, Surveyor 3); NSSDCA (ALSEP)',
	},
	{
		id: 'apollo-14', world: 'moon', name: 'Fra Mauro', country: 'USA', year: 1971, kind: 'lander',
		lat: - 3.64589, lon: - 17.47194,
		pieces: [
			{ model: 'apolloDescentStage', east: 0, north: 0, heading: 0 },
			{ model: 'alsep', east: - 174, north: 52, heading: 0 }, // -3.64419, -17.47768
			{ model: 'laserReflector', east: - 203, north: 52, heading: 0 }, // -3.64417, -17.47865
			{ model: 'usFlag', east: - 6, north: 4, heading: 0 }, // approximate
		],
		final: true,
		fact: 'Alan Shepard hit two golf balls here with a six-iron head fixed to a sample-scoop handle.',
		source: 'Wagner et al. 2017 via NSSDCA lunar_sites',
	},
	{
		id: 'apollo-15', world: 'moon', name: 'Hadley-Apennine', country: 'USA', year: 1971, kind: 'lander',
		lat: 26.13239, lon: 3.63330,
		pieces: [
			{ model: 'apolloDescentStage', east: 0, north: 0, heading: 0 },
			{ model: 'lrv', east: 129, north: - 20, heading: 0 }, // LRV final parking 26.13174, 3.63803
			{ model: 'alsep', east: - 92, north: 51, heading: 0 }, // 26.13406, 3.62991
			{ model: 'usFlag', east: - 6, north: 4, heading: 0 }, // approximate
		],
		final: true,
		fact: 'First mission with a Lunar Roving Vehicle: Scott and Irwin drove about 28 km in it.',
		source: 'LROC 2016 table (LM, LRV); Wagner et al. 2017 (ALSEP)',
	},
	{
		id: 'apollo-16', world: 'moon', name: 'Descartes Highlands', country: 'USA', year: 1972, kind: 'lander',
		lat: - 8.9734, lon: 15.5011,
		pieces: [
			{ model: 'apolloDescentStage', east: 0, north: 0, heading: 0 },
			{ model: 'lrv', east: 78, north: 15, heading: 180 }, // LRV -8.9729, 15.5037; ALSJ: parked on a southerly heading
			{ model: 'usFlag', east: - 6, north: 4, heading: 0 }, // approximate
		],
		final: true,
		fact: 'Charlie Duke left a photo of his family on the surface, signed on the back.',
		source: 'LROC 2016 table (LM, LRV)',
	},
	{
		id: 'apollo-17', world: 'moon', name: 'Taurus-Littrow', country: 'USA', year: 1972, kind: 'lander',
		lat: 20.1911, lon: 30.7723,
		pieces: [
			{ model: 'apolloDescentStage', east: 0, north: 0, heading: 0 },
			{ model: 'lrv', east: 131, north: - 45, heading: 0 }, // LRV 20.1896, 30.7769 (ALSJ: ~128 m at azimuth 112)
			{ model: 'alsep', east: - 194, north: 36, heading: 0 }, // 20.1923, 30.7655
			{ model: 'usFlag', east: - 6, north: 4, heading: 0 }, // approximate
		],
		final: true,
		fact: 'The last crewed landing: Gene Cernan was the last person to walk on the Moon, in December 1972.',
		source: 'LROC 2016 table / NSSDCA (LM, LRV, ALSEP)',
	},

	// ---- Moon: Surveyor (Surveyor 3 is a piece of Apollo 12) ----

	{
		id: 'surveyor-1', world: 'moon', name: 'Surveyor 1', country: 'USA', year: 1966, kind: 'lander',
		lat: - 2.4745, lon: - 43.3398,
		pieces: [ { model: 'surveyor', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'The first US soft landing on the Moon, June 1966, four months after the Soviet Luna 9.',
		source: 'LROC 2016 table (-2.4745, 316.6602 E)',
	},
	{
		id: 'surveyor-5', world: 'moon', name: 'Surveyor 5', country: 'USA', year: 1967, kind: 'lander',
		lat: 1.4551, lon: 23.1943,
		pieces: [ { model: 'surveyor', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Made the first chemical analysis of lunar soil, about 25 km from where Apollo 11 later landed.',
		source: 'LROC 2016 table',
	},
	{
		id: 'surveyor-6', world: 'moon', name: 'Surveyor 6', country: 'USA', year: 1967, kind: 'lander',
		lat: 0.4742, lon: - 1.4275,
		pieces: [ { model: 'surveyor', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'The first lift-off from the Moon: it fired its engines and hopped about 2.5 m in November 1967.',
		source: 'LROC 2016 table (0.4742, 358.5725 E)',
	},
	{
		id: 'surveyor-7', world: 'moon', name: 'Surveyor 7', country: 'USA', year: 1968, kind: 'lander',
		lat: - 40.9812, lon: - 11.5127,
		pieces: [ { model: 'surveyor', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'The only Surveyor sent to the highlands, on the ejecta blanket just north of Tycho crater.',
		source: 'LROC 2016 table (-40.9812, 348.4873 E)',
	},

	// ---- Moon: Soviet ----

	{
		id: 'luna-9', world: 'moon', name: 'Luna 9', country: 'USSR', year: 1966, kind: 'lander',
		lat: 7.13, lon: - 64.37,
		pieces: [ { model: 'lunaLander', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'The first spacecraft to soft-land on the Moon and send back pictures, 3 February 1966.',
		source: 'Wagner et al. 2017, citing Roncoli 2005 (tracking-based)',
		uncertain: 'Not identified in LRO images; the position is from Soviet-era tracking, good to a few km at best.',
	},
	{
		id: 'luna-13', world: 'moon', name: 'Luna 13', country: 'USSR', year: 1966, kind: 'lander',
		lat: 18.87, lon: - 62.05,
		pieces: [ { model: 'lunaLander', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Landed in December 1966 and tested how firm the soil was with a spring-driven penetrometer.',
		source: 'Wagner et al. 2017, citing Roncoli 2005 (tracking-based)',
		uncertain: 'Not identified in LRO images; the position is from Soviet-era tracking, good to a few km at best.',
	},
	{
		id: 'luna-16', world: 'moon', name: 'Luna 16', country: 'USSR', year: 1970, kind: 'lander',
		lat: - 0.5137, lon: 56.3638,
		pieces: [ { model: 'lunaSampleReturn', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'The first robotic sample return: it sent 101 g of Sea of Fertility soil to Earth in 1970.',
		source: 'LROC 2016 table',
	},
	{
		id: 'luna-17', world: 'moon', name: 'Luna 17', country: 'USSR', year: 1970, kind: 'lander',
		lat: 38.2376, lon: - 35.0016,
		pieces: [ { model: 'lunaLunokhodLander', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Rolled Lunokhod 1, the first rover on another world, down its ramps in November 1970.',
		source: 'LROC 2016 table (38.23764, 324.99837 E)',
	},
	{
		id: 'lunokhod-1', world: 'moon', name: 'Lunokhod 1', country: 'USSR', year: 1970, kind: 'rover',
		lat: 38.3150, lon: - 35.0081,
		pieces: [ { model: 'lunokhod', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Drove 10.5 km in 11 months; once LRO found it in 2010, lasers bounced off its reflector again.',
		source: 'LROC 2016 table (38.3150, 324.9919 E)',
	},
	{
		id: 'luna-20', world: 'moon', name: 'Luna 20', country: 'USSR', year: 1972, kind: 'lander',
		lat: 3.7863, lon: 56.6242,
		pieces: [ { model: 'lunaSampleReturn', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Returned 55 g of highland soil from the mountains north of the Sea of Fertility.',
		source: 'LROC Coordinates of Robotic Spacecraft (2013 update, image 650)',
	},
	{
		id: 'luna-21', world: 'moon', name: 'Luna 21', country: 'USSR', year: 1973, kind: 'lander',
		lat: 25.9994, lon: 30.4076,
		pieces: [ { model: 'lunaLunokhodLander', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Delivered Lunokhod 2 to the floor of Le Monnier crater in January 1973.',
		source: 'LROC 2016 table',
	},
	{
		id: 'lunokhod-2', world: 'moon', name: 'Lunokhod 2', country: 'USSR', year: 1973, kind: 'rover',
		lat: 25.8323, lon: 30.9221,
		pieces: [ { model: 'lunokhod', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Drove about 39 km in four months, an off-Earth record until Opportunity beat it in 2014.',
		source: 'Lunar laser ranging, Karachevtseva et al. 2017 (LROC: 25.830, 30.914)',
	},
	{
		id: 'luna-24', world: 'moon', name: 'Luna 24', country: 'USSR', year: 1976, kind: 'lander',
		lat: 12.7142, lon: 62.2129,
		pieces: [ { model: 'lunaSampleReturn', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'The last Soviet Moon mission: it drilled 2 m into Mare Crisium and returned 170 g in 1976.',
		source: 'LROC Coordinates of Robotic Spacecraft (2013 update, image 650)',
	},

	// ---- Moon: China ----

	{
		id: 'change-3', world: 'moon', name: 'Chang\'e 3 and Yutu', country: 'China', year: 2013, kind: 'lander',
		lat: 44.1214, lon: - 19.5116,
		pieces: [
			{ model: 'change3Lander', east: 0, north: 0, heading: 0 },
			{ model: 'yutu', east: 0, north: - 35, heading: 0 }, // approximate: LRO images show Yutu ~30-40 m south of the lander
		],
		final: true,
		fact: 'The first soft landing on the Moon in 37 years; Yutu drove 114 m before it stopped moving.',
		source: 'LROC before/after NAC comparison (44.1214 N, 340.4884 E)',
	},
	{
		id: 'change-4', world: 'moon', name: 'Chang\'e 4 and Yutu-2', country: 'China', year: 2019, kind: 'lander',
		lat: - 45.4446, lon: 177.5991,
		pieces: [
			{ model: 'change3Lander', east: 0, north: 0, heading: 0 },
			{ model: 'yutu', east: - 360, north: 140, heading: 0 }, // approximate: 385 m from the lander, mostly west/northwest, Oct 2020 (LROC 1168)
		],
		final: false, asOf: '2020-10',
		fact: 'The first landing on the far side, 3 January 2019; Yutu-2 has driven over 1.6 km since.',
		source: 'LROC Chang\'e 4 Lander Coordinates (image 1087)',
		uncertain: 'Yutu-2 is placed by LROC\'s Oct 2020 straight-line distance (385 m) and a rough direction; later positions were not found.',
	},
	{
		id: 'change-5', world: 'moon', name: 'Chang\'e 5', country: 'China', year: 2020, kind: 'lander',
		lat: 43.0576, lon: - 51.9161,
		pieces: [ { model: 'change5Lander', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Its ascender left this lander behind and carried 1,731 g of samples home in December 2020.',
		source: 'LROC First Look: Chang\'e 5 (43.0576 N, 308.0839 E, +/-20 m)',
	},
	{
		id: 'change-6', world: 'moon', name: 'Chang\'e 6', country: 'China', year: 2024, kind: 'lander',
		lat: - 41.6385, lon: - 153.9852,
		pieces: [ { model: 'change5Lander', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Collected the first samples ever taken from the far side: 1,935 g, returned June 2024.',
		source: 'LROC First Look: Chang\'e 6 (41.6385 S, 206.0148 E, +/-30 m)',
	},

	// ---- Moon: India, Japan, commercial ----

	{
		id: 'chandrayaan-3', world: 'moon', name: 'Statio Shiv Shakti', country: 'India', year: 2023, kind: 'lander',
		lat: - 69.373, lon: 32.319,
		pieces: [
			{ model: 'vikram', east: 0, north: 0, heading: 0 },
			{ model: 'pragyan', east: 0, north: - 40, heading: 180 }, // nominal, see `uncertain`
		],
		final: true,
		fact: 'Vikram made India the first country to land near the lunar south pole, on 23 August 2023.',
		source: 'LROC featured image 1314 (Vikram)',
		uncertain: 'Pragyan drove just over 100 m (heading south first) but its end point was not published as coordinates; its piece is placed nominally.',
	},
	{
		id: 'slim', world: 'moon', name: 'SLIM', country: 'Japan', year: 2024, kind: 'lander',
		lat: - 13.3160, lon: 25.2510,
		pieces: [ { model: 'slim', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Landed within about 60 m of its target, a pinpoint record, but came to rest on its nose.',
		source: 'LROC featured image 1358 (13.3160 S, 25.2510 E)',
	},
	{
		id: 'im-1', world: 'moon', name: 'Odysseus', country: 'USA', year: 2024, kind: 'lander',
		lat: - 80.13, lon: 1.44,
		pieces: [ { model: 'odysseus', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'The first US landing since 1972, near Malapert A; it caught a leg and tipped onto its side.',
		source: 'NASA/LROC, Feb 2024 (80.13 S, 1.44 E)',
	},
	{
		id: 'im-2', world: 'moon', name: 'Athena', country: 'USA', year: 2025, kind: 'lander',
		lat: - 84.7906, lon: 29.1957,
		pieces: [ { model: 'odysseus', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Came down too fast near Mons Mouton in March 2025 and ended on its side in a 20 m crater.',
		source: 'LROC IM-2 featured images 1401/1409',
	},
	{
		id: 'blue-ghost-1', world: 'moon', name: 'Blue Ghost Mission 1', country: 'USA', year: 2025, kind: 'lander',
		lat: 18.5623, lon: 61.8103,
		pieces: [ { model: 'blueGhost', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'The first fully successful commercial Moon landing, beside Mons Latreille on 2 March 2025.',
		source: 'LROC featured image 1407',
	},

	// ---- Moon: impacts ----

	{
		id: 'apollo-13-sivb', world: 'moon', name: 'Apollo 13 S-IVB crater', country: 'USA', year: 1970, kind: 'impact',
		lat: - 2.5550, lon: - 27.8875,
		pieces: [ { model: 'impact', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'The first rocket stage aimed at the Moon on purpose, so Apollo 12\'s seismometer could feel it hit.',
		source: 'LROC 2016 table (-2.5550, 332.1125 E)',
	},
	{
		id: 'apollo-14-sivb', world: 'moon', name: 'Apollo 14 S-IVB crater', country: 'USA', year: 1971, kind: 'impact',
		lat: - 8.1810, lon: - 26.0305,
		pieces: [ { model: 'impact', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'A spent rocket stage aimed at the Moon on purpose, so seismometers left by Apollo 12 could feel the hit.',
		source: 'LROC 2016 table (-8.1810, 333.9695 E)',
	},
	{
		id: 'apollo-15-sivb', world: 'moon', name: 'Apollo 15 S-IVB crater', country: 'USA', year: 1971, kind: 'impact',
		lat: - 1.2897, lon: - 11.8245,
		pieces: [ { model: 'impact', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Crashed deliberately so the Apollo 12 and 14 seismometers could probe the Moon\'s interior.',
		source: 'LROC 2016 table (-1.2897, 348.1755 E)',
	},
	{
		id: 'apollo-16-sivb', world: 'moon', name: 'Apollo 16 S-IVB crater', country: 'USA', year: 1972, kind: 'impact',
		lat: 1.9210, lon: - 24.6230,
		pieces: [ { model: 'impact', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Contact was lost before impact, so where it hit was a mystery until LRO found the crater in 2015.',
		source: 'LROC featured image 894 (1.921 N, 335.377 E)',
	},
	{
		id: 'apollo-17-sivb', world: 'moon', name: 'Apollo 17 S-IVB crater', country: 'USA', year: 1972, kind: 'impact',
		lat: - 4.168, lon: - 12.330,
		pieces: [ { model: 'impact', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Left a crater about 31 m across, seen by LRO; the last Saturn stage to hit the Moon.',
		source: 'Crater position from a published crater study (Icarus); mission report gives 4.21 S, 12.37 W',
		uncertain: 'LROC has imaged the crater but its own coordinates for it could not be retrieved; sources differ by ~0.05 deg (~1.5 km).',
	},
	{
		id: 'lcross', world: 'moon', name: 'LCROSS Centaur impact', country: 'USA', year: 2009, kind: 'impact',
		lat: - 84.6796, lon: - 48.7093,
		pieces: [ { model: 'impact', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'The spent Centaur stage hit permanently shadowed Cabeus crater and its plume showed water ice.',
		source: 'Weighted-average reconstructed impact point from a NASA technical report (NTRS)',
		uncertain: 'In permanent shadow: the crater is not seen directly in LROC images; the position is reconstructed (~150 m from the target).',
	},
	{
		id: 'grail-ebb', world: 'moon', name: 'GRAIL Ebb impact', country: 'USA', year: 2012, kind: 'impact',
		lat: 75.609, lon: - 26.593,
		pieces: [
			{ model: 'impact', east: 0, north: 0, heading: 0 },
			{ model: 'impact', east: - 1801, north: 1274, heading: 0 }, // Flow, 75.651 N, 26.832 W, 20 s later
		],
		final: true,
		fact: 'The twin gravity mappers Ebb and Flow hit this mountain 20 s apart; the site is named for Sally Ride.',
		source: 'LROC featured image 596 (Ebb 75.609 N, 333.407 E; Flow 75.651 N, 333.168 E)',
	},
	{
		id: 'ladee', world: 'moon', name: 'LADEE impact', country: 'USA', year: 2014, kind: 'impact',
		lat: 11.8494, lon: - 93.2493,
		pieces: [ { model: 'impact', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Hit the far side at about 5,800 km/h in April 2014, leaving a crater less than 3 m wide.',
		source: 'LROC featured image 822 (11.8494 N, 266.7507 E)',
	},
	{
		id: 'beresheet', world: 'moon', name: 'Beresheet crash site', country: 'Israel', year: 2019, kind: 'impact',
		lat: 32.5956, lon: 19.3496,
		pieces: [ { model: 'impact', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Israel\'s privately built lander crashed here in April 2019 with dehydrated tardigrades aboard.',
		source: 'LROC featured image 1101',
	},
	{
		id: 'chandrayaan-2-vikram', world: 'moon', name: 'Chandrayaan-2 Vikram crash site', country: 'India', year: 2019, kind: 'impact',
		lat: - 70.8810, lon: 22.7840,
		pieces: [ { model: 'impact', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'An amateur, Shanmuga Subramanian, spotted the first debris in LRO images in late 2019.',
		source: 'LROC featured image 1131',
	},
	{
		id: 'hakuto-r-m1', world: 'moon', name: 'HAKUTO-R Mission 1 crash site', country: 'Japan', year: 2023, kind: 'impact',
		lat: 47.581, lon: 44.094,
		pieces: [ { model: 'impact', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Crashed in April 2023 after its software misjudged its height when it passed over a crater rim.',
		source: 'LROC featured image 1302',
	},
	{
		id: 'luna-25', world: 'moon', name: 'Luna 25 crater', country: 'Russia', year: 2023, kind: 'impact',
		lat: - 57.865, lon: 61.360,
		pieces: [ { model: 'impact', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Russia\'s first Moon mission since 1976 crashed in August 2023 after a faulty engine burn.',
		source: 'LROC featured image 1311 (better than 40 m)',
	},

	// ---- Mars ----

	{
		id: 'viking-1', world: 'mars', name: 'Viking 1', country: 'USA', year: 1976, kind: 'lander',
		lat: 22.267, lon: - 47.952,
		pieces: [ { model: 'viking', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'The first fully successful Mars landing, 20 July 1976; it worked for over six years.',
		source: 'HiRISE ESP_046170_2025 image centre (lander imaged; PSP_001521_2025 centre 22.273, 312.054)',
		uncertain: 'HiRISE image centre targeted on the lander, not a measured lander position; good to a few hundred m.',
	},
	{
		id: 'viking-2', world: 'mars', name: 'Viking 2', country: 'USA', year: 1976, kind: 'lander',
		lat: 47.673, lon: 134.300,
		pieces: [ { model: 'viking', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Photographed a thin layer of water frost on the ground of Utopia Planitia.',
		source: 'HiRISE PSP_001501_2280 image centre',
		uncertain: 'HiRISE image centre targeted on the lander, not a measured lander position; image centres vary by ~1.5 km.',
	},
	{
		id: 'pathfinder', world: 'mars', name: 'Mars Pathfinder', country: 'USA', year: 1997, kind: 'lander',
		lat: 19.086, lon: - 33.237,
		pieces: [
			{ model: 'pathfinder', east: 0, north: 0, heading: 0 },
			{ model: 'sojourner', east: - 6, north: - 6, heading: 0 }, // approximate: Sojourner stayed within ~12 m of the lander
		],
		final: true,
		fact: 'Bounced to a stop on airbags in 1997 and set down Sojourner, the first rover on Mars.',
		source: 'HiRISE PSP_001890_1995 image centre (19.086, 326.763 E)',
		uncertain: 'HiRISE image centre targeted on the lander (NASA quotes 19.13 N, 33.22 W); good to ~1-3 km.',
	},
	{
		id: 'spirit-landing', world: 'mars', name: 'Columbia Memorial Station', country: 'USA', year: 2004, kind: 'lander',
		lat: - 14.5684, lon: 175.4726,
		pieces: [ { model: 'merLander', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Spirit drove off this airbag-cushioned platform in Gusev crater in January 2004.',
		source: 'NASA/JPL MER landing site',
	},
	{
		id: 'spirit', world: 'mars', name: 'Spirit at Troy', country: 'USA', year: 2004, kind: 'rover',
		lat: - 14.6, lon: 175.5,
		pieces: [ { model: 'merRover', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Stuck in soft sand at "Troy" beside Home Plate in 2009, it worked on as a fixed station until 2010.',
		source: 'NASA Photojournal PIA12205, Orbital View of Spirit at Troy',
		uncertain: 'Only given to 0.1 deg (~6 km) by the source; Spirit sits just west of Home Plate.',
	},
	{
		id: 'opportunity-landing', world: 'mars', name: 'Challenger Memorial Station', country: 'USA', year: 2004, kind: 'lander',
		lat: - 1.9462, lon: - 5.5266,
		pieces: [ { model: 'merLander', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Opportunity\'s airbags bounced it straight into little Eagle crater, a "hole in one", in January 2004.',
		source: 'NASA/JPL MER landing site (as in mars-places.js)',
	},
	{
		id: 'opportunity', world: 'mars', name: 'Opportunity in Perseverance Valley', country: 'USA', year: 2004, kind: 'rover',
		lat: - 2.335, lon: - 5.348,
		pieces: [ { model: 'merRover', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Drove 45.16 km in 14 years; a planet-wide dust storm silenced it here in June 2018.',
		source: 'HiRISE ESP_056955_1775 (Sept 2018, shows the rover) image centre',
		uncertain: 'HiRISE image centre, not the rover\'s measured position; the rover is in that image, within ~2 km.',
	},
	{
		id: 'phoenix', world: 'mars', name: 'Phoenix', country: 'USA', year: 2008, kind: 'lander',
		lat: 68.2188, lon: - 125.7492,
		pieces: [ { model: 'phoenix', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Scraped up water ice a few centimetres under the arctic soil in 2008.',
		source: 'NASA/JPL Phoenix landing site (68.2188 N, 234.2508 E)',
	},
	{
		id: 'curiosity-landing', world: 'mars', name: 'Bradbury Landing', country: 'USA', year: 2012, kind: 'site',
		lat: - 4.5895, lon: 137.4417,
		pieces: [],
		final: false,
		fact: 'Curiosity was lowered here on nylon cords by a rocket-powered sky crane in August 2012.',
		source: 'NASA/JPL MSL landing site',
		uncertain: 'Landing site only: Curiosity is now kilometres up Mount Sharp and its current coordinates were not found.',
	},
	{
		id: 'insight', world: 'mars', name: 'InSight', country: 'USA', year: 2018, kind: 'lander',
		lat: 4.5024, lon: 135.6234,
		pieces: [ { model: 'insight', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Its seismometer recorded more than 1,300 marsquakes before dust ended the mission in 2022.',
		source: 'NASA/JPL InSight landing site',
	},
	{
		id: 'perseverance-landing', world: 'mars', name: 'Octavia E. Butler Landing', country: 'USA', year: 2021, kind: 'site',
		lat: 18.4447, lon: 77.4508,
		pieces: [],
		final: false,
		fact: 'Perseverance landed in Jezero crater in February 2021 with the Ingenuity helicopter under its belly.',
		source: 'NASA/JPL Mars 2020 landing site',
		uncertain: 'Landing site only: Perseverance is now on Jezero\'s western rim; its current coordinates were not found.',
	},
	{
		id: 'tianwen-1', world: 'mars', name: 'Tianwen-1 lander', country: 'China', year: 2021, kind: 'lander',
		lat: 25.066, lon: 109.925,
		pieces: [ { model: 'tianwenLander', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Zhurong drove 1,921 m south from here before hibernating in May 2022; it never woke.',
		source: 'Wu et al. 2022 (JGR Planets), HiRIC-based landing site',
	},
	{
		id: 'mars-3', world: 'mars', name: 'Mars 3 (candidate)', country: 'USSR', year: 1971, kind: 'lander',
		lat: - 45.0, lon: - 158.0,
		pieces: [ { model: 'mars3', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'The first soft landing on Mars, December 1971; it fell silent about 20 seconds later.',
		source: 'Predicted site 45 S, 202 E (HiRISE / JPL PIA16920, 2013 candidates in Ptolemaeus crater)',
		uncertain: 'Candidate only: features in HiRISE images may be its parachute, heat shield and lander; not confirmed.',
	},
	{
		id: 'beagle-2', world: 'mars', name: 'Beagle 2', country: 'UK', year: 2003, kind: 'lander',
		lat: 11.52879, lon: 90.43139,
		pieces: [ { model: 'beagle2', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'Lost on landing in 2003; HiRISE found it in 2015, only partly unfolded.',
		source: 'Bridges et al. 2017, Royal Society Open Science',
	},
	{
		id: 'schiaparelli', world: 'mars', name: 'Schiaparelli crash site', country: 'ESA', year: 2016, kind: 'impact',
		lat: - 2.047, lon: - 6.210,
		pieces: [ { model: 'schiaparelli', east: 0, north: 0, heading: 0 } ],
		final: true,
		fact: 'A bad spin-rate reading made it drop its parachute early and free-fall from about 3.7 km.',
		source: 'HiRISE ESP_062731_1780 image centre (-2.047, 353.790 E)',
		uncertain: 'HiRISE image centre targeted on the crater; within a few hundred m.',
	},

];
