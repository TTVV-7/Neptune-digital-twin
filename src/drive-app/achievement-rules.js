import { DRIVE_CARS, LIBRARY_VEHICLES, PASS_RIDES, WORKS_RIDES } from './catalog.js';

// Achievements (docs/world-drive.md, "Achievements and rewards"): badges for what a player has
// done, and the construction rides some of them unlock. What the page (achievements.js, the grid
// on the profile card, progress.js counting what it drove, vehicles.js's locks) and the Worker
// (worker/drive/achievements.js, progress.js, challenges.js, live.js) share, so the page shows what
// the Worker counts: plain data and small functions, nothing from three.js or the browser.
//
// Each achievement is a count reaching a target. Some counts the Worker checks itself: the
// challenges a player has a time on (challenge_times), their places on finished boards (final_rank,
// written as a challenge ends), the parties they drove in with someone else (the party's room says
// so, never the page), and their days in a row (the daily bonus, by the Worker's clock). The rest
// only the page can say (how far it drove, its drives on the Moon, its Garage looks, the rides it
// tried): those come with its progress reports, each capped as XP is (by the time since the last
// report) and again by a day's worth (TALLY_DAY), so a script can't earn them all in one go.

// The counts, and whether the Worker checks each ('checked') or takes the page's word within its
// caps ('trusted').
export const COUNTS = {
	km: 'trusted', // km driven, on either world
	moon: 'trusted', // drives on the Moon (a drop-in there and 250 m driven)
	looks: 'trusted', // Garage choices changed
	rides: 'trusted', // different rides driven (250 m in each)
	streak: 'checked', // the most UTC days in a row driven (the daily bonus's streak)
	parties: 'checked', // parties driven in with someone else in them
	challenges: 'checked', // challenges finished (a time on the board)
	placing: 'checked', // a place on a finished board (its final_rank)
};

// The most of each trusted count the Worker takes in one UTC day, whatever the reports say: about
// a long day's driving (500 km is seven hours at 72 km/h), ten Moon drives, ten Garage changes and
// four new rides. So 1,000 km takes at least two days of a script, and 25 looks three.
export const TALLY_DAY = { km: 500, moon: 10, looks: 10, rides: 4 };

// The drive that counts for a Moon drive or a ride tried: this far (km) since the drop-in, as the
// day's bonus needs (levels.js's DAILY_KM).
export const TALLY_KM = 0.25;

// The rides a report may name as tried: every ride the game offers.
export const RIDE_IDS = new Set( [ 'go-kart', ...LIBRARY_VEHICLES, ...WORKS_RIDES, ...DRIVE_CARS, ...PASS_RIDES ] );

// The achievements, in the grid's order. count: what it counts; target: how much of it (for a
// placing, the place on the board at worst, and on which period's boards, any if none); name: as a
// toast says it ("Achievement: 100 km driven"); goal: the grid's one line.
export const ACHIEVEMENTS = [
	{ id: 'first-drive', name: 'First drive', goal: 'Drive your first 250 m', count: 'km', target: TALLY_KM },
	{ id: 'km-10', name: '10 km driven', goal: 'Drive 10 km', count: 'km', target: 10 },
	{ id: 'km-100', name: '100 km driven', goal: 'Drive 100 km', count: 'km', target: 100 },
	{ id: 'km-1000', name: '1,000 km driven', goal: 'Drive 1,000 km', count: 'km', target: 1000 },
	{ id: 'moon-1', name: 'One small step', goal: 'Drive on the Moon', count: 'moon', target: 1 },
	{ id: 'moon-10', name: 'Moon regular', goal: 'Drive on the Moon 10 times', count: 'moon', target: 10 },
	{ id: 'moon-50', name: 'Lunar legend', goal: 'Drive on the Moon 50 times', count: 'moon', target: 50 },
	{ id: 'challenges-1', name: 'First challenge', goal: 'Finish a challenge', count: 'challenges', target: 1 },
	{ id: 'challenges-10', name: '10 challenges', goal: 'Finish 10 challenges', count: 'challenges', target: 10 },
	{ id: 'challenges-50', name: '50 challenges', goal: 'Finish 50 challenges', count: 'challenges', target: 50 },
	{ id: 'top-10', name: 'Top 10', goal: 'Finish a challenge in its top 10', count: 'placing', target: 10 },
	{ id: 'podium', name: 'Podium', goal: 'Finish a challenge in its top 3', count: 'placing', target: 3 },
	{ id: 'winner', name: 'Winner', goal: 'Finish first on a challenge', count: 'placing', target: 1 },
	{ id: 'daily-winner', name: 'Daily winner', goal: 'Finish first on a daily challenge', count: 'placing', target: 1, period: 'day' },
	{ id: 'weekly-podium', name: 'Weekly podium', goal: 'Finish a weekly challenge in its top 3', count: 'placing', target: 3, period: 'week' },
	{ id: 'monthly-top-10', name: 'Monthly top 10', goal: 'Finish a monthly challenge in its top 10', count: 'placing', target: 10, period: 'month' },
	{ id: 'party-1', name: 'Party time', goal: 'Drive in a party with someone else', count: 'parties', target: 1 },
	{ id: 'party-10', name: 'Party regular', goal: 'Drive in 10 parties with others', count: 'parties', target: 10 },
	{ id: 'look-1', name: 'New look', goal: 'Change a look in the Garage', count: 'looks', target: 1 },
	{ id: 'look-25', name: 'Stylist', goal: 'Change 25 looks in the Garage', count: 'looks', target: 25 },
	{ id: 'rides-3', name: 'Test driver', goal: 'Drive 3 different rides', count: 'rides', target: 3 },
	{ id: 'rides-8', name: 'Collector', goal: 'Drive 8 different rides', count: 'rides', target: 8 },
	{ id: 'streak-3', name: '3 days in a row', goal: 'Drive on 3 days in a row (UTC days)', count: 'streak', target: 3 },
	{ id: 'streak-7', name: 'A week in a row', goal: 'Drive on 7 days in a row (UTC days)', count: 'streak', target: 7 },
	{ id: 'streak-30', name: '30 days in a row', goal: 'Drive on 30 days in a row (UTC days)', count: 'streak', target: 30 },
];
export const ACHIEVEMENT_IDS = new Set( ACHIEVEMENTS.map( a => a.id ) );

// The placings, which the Worker writes as a challenge's final places are (worker/drive/challenges.js).
export const PLACINGS = ACHIEVEMENTS.filter( a => a.count === 'placing' );
// The most challenges finished that's ever counted (the highest target): a count stops there.
export const CHALLENGES_MOST = Math.max( ...ACHIEVEMENTS.filter( a => a.count === 'challenges' ).map( a => a.target ) );

// The construction rides (catalog.js's WORKS_RIDES) and the achievement each comes with. Not the
// Supporter Pass: as with levels' titles, badges and colours, these come only by earning them.
// unlock: what a locked one says ("Drive 10 km to unlock"); chip: its short tag in the pickers.
export const RIDE_FEATS = {
	'skid-steer-loader-cad': { feat: 'km-10', chip: '10 km', unlock: 'Drive 10 km to unlock' },
	'telehandler-10k-stowed': { feat: 'streak-3', chip: '3 days', unlock: 'Drive on 3 days in a row to unlock' },
	'concrete-mixer-truck': { feat: 'challenges-1', chip: '1 challenge', unlock: 'Finish a challenge to unlock' },
	'roller-single-drum-84in': { feat: 'party-1', chip: 'Party', unlock: 'Drive in a party with someone else to unlock' },
	'wheel-loader': { feat: 'km-100', chip: '100 km', unlock: 'Drive 100 km to unlock' },
	'articulated-dump-truck': { feat: 'challenges-10', chip: '10 challenges', unlock: 'Finish 10 challenges to unlock' },
	'crawler-dozer-20t': { feat: 'top-10', chip: 'Top 10', unlock: 'Finish a challenge in its top 10 to unlock' },
	'hydrovac-truck': { feat: 'weekly-podium', chip: 'Weekly top 3', unlock: 'Finish a weekly challenge in its top 3 to unlock' },
};

// The achievement a ride needs (an id in catalog.js), or null for one none does.
export function rideFeat( id ) {

	return RIDE_FEATS[ id ]?.feat ?? null;

}

// Whether a ride can be driven where others see it by someone with these achievements (a Set or an
// array of ids): any ride no achievement locks, or one whose achievement they have.
export function rideAllowed( id, feats ) {

	const feat = rideFeat( id );
	if ( ! feat ) return true;
	return Array.isArray( feats ) ? feats.includes( feat ) : !! feats?.has?.( feat );

}

// The rides an achievement unlocks (usually one, or none).
export function ridesOf( feat ) {

	return Object.keys( RIDE_FEATS ).filter( id => RIDE_FEATS[ id ].feat === feat );

}

export function achievementOf( id ) {

	return ACHIEVEMENTS.find( a => a.id === id ) ?? null;

}

// --- what a report carries ---

// The trusted counts a progress report (levels.js's REPORT) carries, as its `feats`: { moon, looks,
// rides }, each since the last report: Moon drives, Garage changes (whole numbers, at most
// TALLY_MOST each), and the rides tried (ids, at most RIDE_IDS' size). Its km are the report's own.
// null if it isn't one the page could send.
const TALLY_MOST = 10000;

export function checkTallies( raw ) {

	if ( ! raw || typeof raw !== 'object' || Array.isArray( raw ) ) return null;
	const tallies = { moon: 0, looks: 0, rides: [] };
	for ( const field of [ 'moon', 'looks' ] ) {

		const value = raw[ field ] ?? 0;
		if ( ! Number.isInteger( value ) || value < 0 || value > TALLY_MOST ) return null;
		tallies[ field ] = value;

	}

	const rides = raw.rides ?? [];
	if ( ! Array.isArray( rides ) || rides.length > RIDE_IDS.size ) return null;
	for ( const id of rides ) if ( typeof id !== 'string' || ! RIDE_IDS.has( id ) ) return null;
	tallies.rides = [ ...new Set( rides ) ];
	return tallies;

}

// Whether a report's tallies have anything in them.
export function hasTallies( tallies ) {

	return !! tallies && ( tallies.moon > 0 || tallies.looks > 0 || tallies.rides?.length > 0 );

}

// Two reports' tallies as one.
export function mergeTallies( a, b ) {

	if ( ! hasTallies( a ) && ! hasTallies( b ) ) return undefined;
	return {
		moon: ( a?.moon ?? 0 ) + ( b?.moon ?? 0 ),
		looks: ( a?.looks ?? 0 ) + ( b?.looks ?? 0 ),
		rides: [ ...new Set( [ ...a?.rides ?? [], ...b?.rides ?? [] ] ) ],
	};

}

// --- the player's counts, as the Worker keeps them ---

// A player's kept counts (players.tallies, JSON): { km, moon, looks, rides: [ ids ], streak (the
// most days in a row), day (the UTC day `today` is for), today: { km, moon, looks, rides } (what
// of each trusted count that day has taken) }, with anything missing or damaged as none.
export function readTallies( text ) {

	let raw = null;
	try {

		raw = typeof text === 'string' ? JSON.parse( text ) : text;

	} catch {

		raw = null;

	}

	const number = value => Number.isFinite( value ) && value > 0 ? value : 0;
	const kept = raw && typeof raw === 'object' ? raw : {};
	const today = kept.today && typeof kept.today === 'object' ? kept.today : {};
	return {
		km: number( kept.km ), moon: number( kept.moon ), looks: number( kept.looks ),
		rides: Array.isArray( kept.rides ) ? kept.rides.filter( id => RIDE_IDS.has( id ) ) : [],
		streak: number( kept.streak ),
		day: typeof kept.day === 'string' ? kept.day : '',
		today: { km: number( today.km ), moon: number( today.moon ), looks: number( today.looks ), rides: number( today.rides ) },
	};

}

// `tallies` (readTallies') with what a report adds on UTC day `day`: its km (already capped by the
// time since the last report) and its `feats` (checkTallies'), each held to what's left of the day's
// TALLY_DAY; `streak`, the days in a row the report leaves the player on (the Worker's own). A new
// object; the counts taken this report in `taken`.
export function addTallies( tallies, { km = 0, feats = null, streak = 0 }, day ) {

	const today = tallies.day === day ? { ...tallies.today } : { km: 0, moon: 0, looks: 0, rides: 0 };
	const room = field => Math.max( 0, TALLY_DAY[ field ] - today[ field ] );
	const taken = {
		km: Math.min( Math.max( 0, km ), room( 'km' ) ),
		moon: Math.min( feats?.moon ?? 0, room( 'moon' ) ),
		looks: Math.min( feats?.looks ?? 0, room( 'looks' ) ),
	};
	const fresh = ( feats?.rides ?? [] ).filter( id => ! tallies.rides.includes( id ) ).slice( 0, room( 'rides' ) );
	for ( const field of [ 'km', 'moon', 'looks' ] ) today[ field ] += taken[ field ];
	today.rides += fresh.length;
	return {
		tallies: {
			// km to the metre, so the kept text stays short.
			km: Math.round( ( tallies.km + taken.km ) * 1000 ) / 1000,
			moon: tallies.moon + taken.moon,
			looks: tallies.looks + taken.looks,
			rides: [ ...tallies.rides, ...fresh ],
			streak: Math.max( tallies.streak, streak ),
			day,
			today: { ...today, km: Math.round( today.km * 1000 ) / 1000 },
		},
		taken: { ...taken, rides: fresh },
	};

}

// The counts an achievement is earned by, from a player's tallies and the rest: { km, moon, looks,
// rides, streak, parties, challenges }.
export function countsOf( tallies, { parties = 0, challenges = 0, streak = 0 } = {} ) {

	return {
		km: tallies.km, moon: tallies.moon, looks: tallies.looks, rides: tallies.rides.length,
		streak: Math.max( tallies.streak, streak ), parties, challenges,
	};

}

// The achievements `counts` have reached (not the placings, which come from boards).
export function reached( counts ) {

	return ACHIEVEMENTS.filter( a => a.count !== 'placing' && Number.isFinite( counts[ a.count ] ) && counts[ a.count ] >= a.target ).map( a => a.id );

}

// The achievements reached going from counts `before` to `after`: those a report has just earned.
export function crossed( before, after ) {

	const had = new Set( reached( before ) );
	return reached( after ).filter( id => ! had.has( id ) );

}

// "34 / 100 km": how far a count has got toward an achievement, as the grid shows it.
export function progressLine( achievement, counts ) {

	const { count, target } = achievement;
	if ( count === 'placing' ) return achievement.period ? `On a ${ { day: 'daily', week: 'weekly', month: 'monthly' }[ achievement.period ] } board` : 'On any board';
	const have = Math.min( counts?.[ count ] ?? 0, target );
	if ( count === 'km' ) {

		const shown = target < 1 ? `${ Math.round( have * 1000 ) } / ${ Math.round( target * 1000 ) } m` : `${ formatNumber( Math.floor( have * 10 ) / 10 ) } / ${ formatNumber( target ) } km`;
		return shown;

	}

	const unit = { moon: 'drives', looks: 'changes', rides: 'rides', streak: 'days', parties: 'parties', challenges: 'finished' }[ count ];
	return `${ formatNumber( Math.floor( have ) ) } / ${ formatNumber( target ) } ${ unit }`;

}

function formatNumber( n ) {

	return n.toLocaleString( 'en-CA' );

}
