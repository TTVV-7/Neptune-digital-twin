import './levels.css';
import { BOOSTS } from './boosts.js';
import { LEVEL_MAX, LEVEL_XP, REWARDS, TITLES, badgeOf, nextReward, rewardsAt } from './levels.js';
import { DECALS, FINISHES, FLAMES, RIMS, SWATCHES, TRAILS } from './paint.js';
import { isPro, onProChange } from './pro.js';

// What players see of levels (levels.js, progress.js): while driving, a slim XP bar with the
// level under the place's name and small "+46 XP · 1.4 km" pop-ups by it; a level-up's burst,
// "Level 7! Unlocked: Plasma boost", whose look opens the Garage; on the globe's panel a card with
// the nickname, the level badge, the bar to the next level, the next reward, the title picker and
// "All rewards", which opens the whole track. A supporter's pass has the track's pass looks already,
// so for them those aren't news: a level-up says they're theirs already, and "Next" is the next
// reward that's new to them. All World Drive's own: drive-hud.js (which the construction app
// shares) is left as it is.

// How long (ms) a level-up shows, and a pop-up.
const LEVEL_UP_TIME = 5200;
const POP_TIME = 2600;
// The most pop-ups at once; the most rewards a level-up lists (the track has them all).
const POPS = 3;
const MOST = 3;

const svg = body => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${ body }</svg>`;
// Little pictures for the rewards that have none of their own.
const ICONS = {
	title: svg( '<path d="M3 12.5V4.6A1.6 1.6 0 0 1 4.6 3h7.9l8.6 8.6a1.6 1.6 0 0 1 0 2.3l-7.2 7.2a1.6 1.6 0 0 1-2.3 0z" fill="#ffd23f"/><circle cx="7.6" cy="7.6" r="1.8" fill="#1d1500"/>' ),
	finish: svg( '<circle cx="12" cy="12" r="9" fill="#5a6274"/><circle cx="12" cy="12" r="9" fill="none" stroke="#2e3340" stroke-width="2"/>' ),
	stripes: svg( '<rect x="3" y="3" width="18" height="18" rx="4" fill="#d81e2c"/><path d="M9 3v18M15 3v18" stroke="#f6f7f9" stroke-width="3"/>' ),
	number: svg( '<circle cx="12" cy="12" r="9.5" fill="#f6f7f9" stroke="#111317" stroke-width="1.6"/><text x="12" y="16.6" text-anchor="middle" font-size="12.5" font-weight="900" font-style="italic" fill="#111317" font-family="system-ui, sans-serif">7</text>' ),
	smoke: svg( '<circle cx="8" cy="15" r="5" fill="#c9d1db"/><circle cx="14" cy="10" r="6" fill="#e8edf2"/><circle cx="18" cy="16" r="3.6" fill="#aeb8c4"/>' ),
};

// progress: from createProgress (progress.js). player(): the leaderboard player or null. canName():
// whether a nickname can be picked now (a Worker and a visit). onGarage( reward ): open the
// Garage; onNickname(): show where a nickname is picked; onTitle(): a new title was picked.
// mode(): main.js's mode ('driving', 'globe'...).
export function setUpProfile( { progress, player, canName = () => false, onGarage = () => {}, onNickname = () => {}, onTitle = () => {}, mode = () => 'globe' } ) {

	// --- driving: the bar and the pop-ups ---

	const driveUi = document.getElementById( 'drive-ui' );
	const hud = element( 'div', 'xp-hud' );
	hud.setAttribute( 'role', 'img' );
	hud.innerHTML = '<span class="xp-level"></span><span class="xp-bar"><i></i></span><span class="xp-count"></span>';
	const pops = element( 'div', 'xp-pops' );
	pops.setAttribute( 'aria-live', 'polite' );
	driveUi.append( hud, pops );

	function pop( { text, kind } ) {

		if ( mode() !== 'driving' ) return;
		const item = element( 'span', `xp-pop ${ kind ?? '' }` );
		item.textContent = text;
		pops.append( item );
		while ( pops.children.length > POPS ) pops.firstElementChild.remove();
		setTimeout( () => item.remove(), POP_TIME );

	}

	// --- a level-up ---

	const card = element( 'section', '' );
	card.id = 'level-up';
	card.hidden = true;
	card.setAttribute( 'role', 'status' );
	card.innerHTML = `
		<div class="burst" aria-hidden="true"></div>
		<div class="level-card">
			<span class="level-badge"><b></b></span>
			<p class="heading"></p>
			<div class="unlocked"></div>
			<p class="had small" hidden></p>
			<p class="nickname" hidden>Pick a nickname to save your progress. <button type="button" class="link">Pick one</button></p>
		</div>`;
	document.body.append( card );
	card.querySelector( '.nickname button' ).addEventListener( 'click', () => {

		hideLevelUp();
		onNickname();

	} );
	let levelTimer = 0;
	let levelTime = LEVEL_UP_TIME;
	let shownEvent = null;
	// It stays up while the pointer's on its buttons (the rest lets the pointer through to the game).
	const levelCard = card.querySelector( '.level-card' );
	levelCard.addEventListener( 'pointerenter', () => clearTimeout( levelTimer ) );
	levelCard.addEventListener( 'pointerleave', () => {

		clearTimeout( levelTimer );
		if ( ! card.hidden ) levelTimer = setTimeout( hideLevelUp, levelTime / 2 );

	} );
	// Level-ups that came while not driving, shown as the next drive starts.
	let waiting = null;

	function levelUp( next ) {

		let event = next;
		if ( mode() !== 'driving' ) {

			waiting = waiting ? { ...event, from: waiting.from, rewards: [ ...waiting.rewards, ...event.rewards ], nickname: waiting.nickname || event.nickname } : event;
			return;

		}

		// One right after another (a report's answer, two levels at once) adds to what's showing.
		if ( ! card.hidden && shownEvent ) event = { ...event, from: shownEvent.from, rewards: [ ...shownEvent.rewards, ...event.rewards ], nickname: shownEvent.nickname || event.nickname };
		shownEvent = event;
		const { level, rewards, nickname } = event;
		badge( card.querySelector( '.level-badge' ), level );
		card.querySelector( '.heading' ).textContent = `Level ${ level }!`;
		// What's new: for a supporter, not the pass's looks, which they have already.
		const pro = isPro();
		const owned = reward => pro && reward.kind === 'look' && reward.pass;
		const news = rewards.filter( r => ( r.kind !== 'badge' || r.level > 1 ) && ! owned( r ) );
		const had = rewards.filter( owned );
		const unlocked = card.querySelector( '.unlocked' );
		unlocked.replaceChildren();
		unlocked.hidden = ! news.length;
		if ( news.length ) {

			unlocked.append( element( 'span', 'small', 'Unlocked:' ) );
			for ( const reward of news.slice( 0, MOST ) ) {

				// A look opens the Garage, to try it on.
				const item = element( reward.kind === 'look' ? 'button' : 'span', `reward ${ reward.kind }` );
				if ( reward.kind === 'look' ) {

					item.type = 'button';
					item.title = 'Try it on in the Garage';
					item.setAttribute( 'aria-label', `Try ${ reward.name } on in the Garage` );
					item.addEventListener( 'click', () => {

						hideLevelUp();
						onGarage( reward );

					} );

				}

				item.append( icon( reward ), ...label( reward ) );
				unlocked.append( item );

			}

			if ( news.length > MOST ) unlocked.append( element( 'span', 'more small', `+${ news.length - MOST } more` ) );

		}

		const hadLine = card.querySelector( '.had' );
		const names = had.slice( 0, 2 ).map( r => r.name ).join( ', ' ) + ( had.length > 2 ? ` and ${ had.length - 2 } more` : '' );
		hadLine.textContent = had.length ? `Already yours with the pass: ${ names }` : '';
		hadLine.hidden = ! had.length;

		card.querySelector( '.nickname' ).hidden = ! nickname;
		card.hidden = false;
		// Again from the start, for a level-up right after another.
		card.classList.remove( 'go' );
		void card.offsetWidth;
		card.classList.add( 'go' );
		clearTimeout( levelTimer );
		levelTime = nickname ? LEVEL_UP_TIME * 2 : LEVEL_UP_TIME;
		levelTimer = setTimeout( hideLevelUp, levelTime );

	}

	function hideLevelUp() {

		clearTimeout( levelTimer );
		card.hidden = true;
		card.classList.remove( 'go' );

	}

	// --- the globe's panel: the profile card ---

	const panel = document.querySelector( '#globe-ui .panel' );
	const profile = element( 'section', 'profile' );
	profile.setAttribute( 'aria-label', 'Your level' );
	profile.innerHTML = `
		<div class="profile-head">
			<span class="level-badge"><b></b></span>
			<div class="who"><b class="name"></b><span class="title"></span></div>
			<button type="button" class="link track-open">All rewards</button>
		</div>
		<span class="xp-bar"><i></i></span>
		<p class="xp-line small"><span class="count"></span><span class="next"></span></p>
		<label class="title-pick small" hidden>Title <select></select></label>
		<p class="title-status small" role="status" hidden></p>
		<p class="save-note small" hidden>Your progress is kept in this browser. <button type="button" class="link">Pick a nickname</button> to save it.</p>`;
	panel.querySelector( '.osm' ).after( profile );
	profile.querySelector( '.track-open' ).addEventListener( 'click', () => openTrack() );
	profile.querySelector( '.save-note button' ).addEventListener( 'click', () => onNickname() );
	const select = profile.querySelector( 'select' );
	const titleStatus = profile.querySelector( '.title-status' );
	select.addEventListener( 'change', async () => {

		const id = select.value;
		titleStatus.hidden = true;
		select.disabled = true;
		const ok = await progress.setTitle( id );
		select.disabled = false;
		if ( ! ok ) {

			titleStatus.textContent = 'Couldn\'t change your title just now. Try again.';
			titleStatus.hidden = false;

		} else onTitle();

		last = '';
		render();

	} );

	// --- the whole track ---

	const track = document.createElement( 'dialog' );
	track.id = 'track';
	track.setAttribute( 'aria-labelledby', 'track-title' );
	track.innerHTML = `
		<header>
			<h2 id="track-title">Levels &amp; rewards</h2>
			<button type="button" class="close" aria-label="Close">&times;</button>
		</header>
		<div class="scroll">
			<p class="small lead"></p>
			<ol class="levels"></ol>
		</div>`;
	document.body.append( track );
	track.querySelector( '.close' ).addEventListener( 'click', () => track.close() );
	track.addEventListener( 'click', e => e.target === track && track.close() );
	// Keys pressed here are the dialog's, not the game's.
	track.addEventListener( 'keydown', e => e.stopPropagation() );

	function openTrack() {

		const level = progress.level;
		const pro = isPro();
		track.querySelector( '.lead' ).textContent = `XP comes from driving: each km, air off jumps, drift boosts, boost pads, landed tricks, new areas and start spots, driving with others, and the day's first drive. ${ pro ? 'Your Supporter Pass has every ⭐ look already, and +50% XP.' : '⭐ rewards come with the Supporter Pass too, all at once (with +50% XP).' }`;
		const list = track.querySelector( '.levels' );
		list.replaceChildren( ...Array.from( { length: LEVEL_MAX }, ( _, i ) => {

			const n = i + 1;
			const li = element( 'li', n <= level ? 'done' : n === level + 1 ? 'next' : 'locked' );
			li.dataset.level = n;
			const head = element( 'div', 'level-head' );
			const mark = element( 'span', 'level-badge small' );
			mark.append( element( 'b' ) );
			badge( mark, n );
			head.append( mark, element( 'span', 'xp', n === 1 ? 'Start' : `${ LEVEL_XP[ n ].toLocaleString( 'en-CA' ) } XP` ) );
			const rewards = element( 'div', 'rewards' );
			for ( const reward of rewardsAt( n ) ) {

				const item = element( 'span', `reward ${ reward.kind }${ reward.pass ? ' pass' : '' }${ pro && reward.pass ? ' owned' : '' }` );
				item.append( icon( reward ), ...label( reward ) );
				if ( reward.kind === 'look' ) item.append( element( 'i', 'tag', reward.pass ? pro ? '✓ Pass' : 'or ⭐ Pass' : 'Levels only' ) );
				rewards.append( item );

			}

			const state = n <= level ? '✓' : n === level + 1 ? 'Next' : '';
			li.append( head, rewards, element( 'span', 'state', state ) );
			return li;

		} ) );
		if ( ! track.open ) track.showModal();
		list.querySelector( '.next' )?.scrollIntoView( { block: 'center' } );

	}

	// --- keeping it all up to date ---

	let last = '';
	function render() {

		const { level, xp, next, into, span, fraction } = progress.progress;
		const title = progress.title;
		const me = player();
		const pro = isPro();
		const key = [ level, xp, title?.id, me?.name, progress.chosenTitle, progress.local, canName(), pro ].join( '|' );
		if ( key === last ) return;
		last = key;
		const count = next === null ? `${ xp.toLocaleString( 'en-CA' ) } XP` : `${ into.toLocaleString( 'en-CA' ) } / ${ span.toLocaleString( 'en-CA' ) } XP`;

		hud.querySelector( '.xp-level' ).textContent = `Lv ${ level }`;
		hud.querySelector( '.xp-bar i' ).style.width = `${ ( fraction * 100 ).toFixed( 1 ) }%`;
		hud.querySelector( '.xp-count' ).textContent = count;
		hud.setAttribute( 'aria-label', `Level ${ level }, ${ count }` );

		badge( profile.querySelector( '.level-badge' ), level );
		profile.querySelector( '.name' ).textContent = me?.name ?? 'You';
		profile.querySelector( '.title' ).textContent = `Lv ${ level } · ${ title.name }`;
		profile.querySelector( '.xp-bar i' ).style.width = `${ ( fraction * 100 ).toFixed( 1 ) }%`;
		profile.querySelector( '.count' ).textContent = count;
		const coming = nextReward( level, { pro } );
		profile.querySelector( '.next' ).textContent = coming ? `Next: ${ coming.name } at Lv ${ coming.level }` : 'Every reward is yours';
		profile.querySelector( '.save-note' ).hidden = ! progress.local || ! canName();

		// The titles there are to pick: the newest by default, or any one unlocked.
		const picker = profile.querySelector( '.title-pick' );
		picker.hidden = progress.local;
		if ( ! picker.hidden ) {

			const mine = TITLES.filter( reward => reward.level <= level );
			const options = [ [ '', `Newest (${ mine[ mine.length - 1 ].name })` ], ...mine.map( reward => [ reward.id, reward.name ] ) ];
			select.replaceChildren( ...options.map( ( [ value, text ] ) => Object.assign( document.createElement( 'option' ), { value, textContent: text } ) ) );
			select.value = mine.some( reward => reward.id === progress.chosenTitle ) ? progress.chosenTitle : '';

		}

	}

	render();
	// The pass coming or going changes what's next.
	onProChange( () => render() );

	return {
		render,
		pop,
		levelUp,
		openTrack,
		// A drive started: a level-up that came on the globe shows now.
		driving() {

			if ( ! waiting ) return;
			const event = waiting;
			waiting = null;
			levelUp( event );

		},
		hideLevelUp,
		element: profile,
		track,
	};

}

// The level badge in `root` (with a <b> for the number): the level, and its frame (levels.js's
// badgeOf: steel, then bronze at 10, silver at 20, gold at 30, platinum at 40, legend at 50).
export function badge( root, level ) {

	root.dataset.frame = badgeOf( level ).id;
	root.querySelector( 'b' ).textContent = String( level );
	root.title = `Level ${ level } · ${ badgeOf( level ).name }`;

}

// A reward's little picture: a colour's swatch, a boost style's picture, a title's tag...
export function icon( reward ) {

	const holder = element( 'span', 'icon' );
	holder.setAttribute( 'aria-hidden', 'true' );
	if ( reward.kind === 'title' ) holder.innerHTML = ICONS.title;
	else if ( reward.kind === 'badge' ) {

		const mark = element( 'span', 'level-badge tiny' );
		mark.append( element( 'b', '', String( reward.level ) ) );
		mark.dataset.frame = reward.id;
		holder.append( mark );

	} else if ( reward.part === 'boost' ) holder.innerHTML = BOOSTS.find( b => b.id === reward.id )?.icon ?? '';
	else if ( reward.part === 'colour' || reward.part === 'rim' || reward.part === 'flame' ) {

		const list = { colour: SWATCHES, rim: RIMS, flame: FLAMES }[ reward.part ];
		const choice = list.find( c => c.id === reward.id );
		const swatch = element( 'span', `swatch ${ reward.part }` );
		swatch.style.setProperty( '--swatch', choice?.css ?? `#${ ( choice?.hex ?? 0 ).toString( 16 ).padStart( 6, '0' ) }` );
		holder.append( swatch );

	} else if ( reward.part === 'decal' ) holder.innerHTML = ICONS[ reward.id ] ?? ICONS.stripes;
	else if ( reward.part === 'trail' ) holder.innerHTML = ICONS.smoke;
	else if ( reward.part === 'finish' ) holder.innerHTML = ICONS.finish;
	return holder;

}

// A reward's name, a title's said to be one ("Title: Joyrider").
function label( reward ) {

	return reward.kind === 'title' ? [ element( 'span', 'kind', 'Title:' ), element( 'span', '', reward.name ) ] : [ element( 'span', '', reward.name ) ];

}

function element( tag, className = '', text = null ) {

	const el = document.createElement( tag );
	if ( className ) el.className = className;
	if ( text !== null ) el.textContent = text;
	return el;

}

// Every look on the track is a choice the Garage has (scripts/test-drive-levels.mjs checks).
export const TRACK_LOOKS = REWARDS.filter( reward => reward.kind === 'look' ).map( reward => ( {
	...reward,
	known: !! { colour: SWATCHES, finish: FINISHES, decal: DECALS, rim: RIMS, boost: BOOSTS, flame: FLAMES, trail: TRAILS }[ reward.part ]?.some( choice => choice.id === reward.id ),
} ) );
