import './achievements.css';
import { ACHIEVEMENTS, COUNTS, progressLine, ridesOf } from './achievement-rules.js';
import { postAchievements } from './api.js';
import { getFeats, onFeatsChange, setFeats } from './feats.js';

// The Achievements grid (docs/world-drive.md, "Achievements and rewards"), from the profile card on
// the globe's panel and from a locked construction ride's note: its own chunk, loaded the first time
// it's opened (main.js), so nothing of it is in the page until then. Each achievement a badge: its
// name, its one line, how far toward it (34 / 100 km) and, once earned, the date; one that unlocks a
// construction ride says which, with the Garage a tap away once it's theirs. What it shows is the
// Worker's (POST /api/achievements: the player's and their account's, with the counts toward each),
// plus what this browser has driven since its last report; before a nickname, this browser's counts
// alone, and nothing earned until there's a nickname to keep it with.

// How long (ms) an answer is shown again rather than asked for anew.
const KEEP = 60 * 1000;
const ICONS = { km: '🛣️', moon: '🌙', mars: '🔴', looks: '🎨', rides: '🚗', streak: '📅', parties: '🎉', challenges: '🏁', placing: '🏆' };

let dialog = null;
let app = null;
let answer = null;
let askedAt = 0;
let askedFor = '';

// progress: createProgress's; vehicles: loadVehicles'; worker: whether there's a Worker; player():
// the leaderboard player or null; onRide( vehicle ): see a ride in the Garage; onNickname(): where a
// nickname is picked.
export function openAchievements( options ) {

	app = options;
	dialog ??= build();
	render();
	if ( ! dialog.open ) dialog.showModal();
	ask();

}

function build() {

	const root = document.createElement( 'dialog' );
	root.id = 'achievements';
	root.setAttribute( 'aria-labelledby', 'achievements-title' );
	root.innerHTML = `
		<header>
			<h2 id="achievements-title">Achievements <span class="count small"></span></h2>
			<button type="button" class="close" aria-label="Close">&times;</button>
		</header>
		<div class="scroll">
			<p class="small lead"></p>
			<p class="small save" hidden>Pick a nickname to earn them: what you've driven counts when you do. <button type="button" class="link">Pick one</button></p>
			<p class="small status" role="status" hidden></p>
			<ol class="feats"></ol>
		</div>`;
	document.body.append( root );
	root.querySelector( '.close' ).addEventListener( 'click', () => root.close() );
	root.addEventListener( 'click', e => e.target === root && root.close() );
	// Keys pressed here are the dialog's, not the game's.
	root.addEventListener( 'keydown', e => e.stopPropagation() );
	root.querySelector( '.save button' ).addEventListener( 'click', () => {

		root.close();
		app.onNickname();

	} );
	onFeatsChange( () => root.open && render() );
	return root;

}

// The Worker's word, unless it was asked for this player less than KEEP ago.
async function ask() {

	const me = app.player();
	if ( ! me || ! app.worker ) return;
	if ( askedFor === me.id && Date.now() - askedAt < KEEP ) return;
	const status = dialog.querySelector( '.status' );
	const result = await postAchievements( me );
	if ( app.player()?.id !== me.id ) return;
	if ( result.ok && Array.isArray( result.body.achievements ) ) {

		answer = result.body;
		[ askedAt, askedFor ] = [ Date.now(), me.id ];
		status.hidden = true;
		setFeats( answer.achievements.map( a => a.id ), { add: true } );

	} else {

		status.textContent = result.status === 429 ? 'Asked too often just now: try again in a minute.' : 'Couldn\'t get your achievements just now. What this browser knows is shown.';
		status.hidden = false;

	}

	render();

}

// The counts shown: the Worker's (for this player, with their account's) and what's been driven
// since, or this browser's. What's been driven since adds to the player's own count (their reports
// add to nothing else), no more of it than the Worker will take today (its `left`), and the account's
// best is shown where that's more: so a count doesn't run ahead and then fall back.
function counts() {

	const pending = app.progress.pending;
	const kept = answer && askedFor === app.player()?.id ? answer.counts : null;
	if ( ! kept ) return { ...pending, parties: 0, challenges: 0 };
	const shown = count => Math.max( kept[ count ], ( answer.own?.[ count ] ?? kept[ count ] ) + Math.min( pending[ count ], answer.left?.[ count ] ?? Infinity ) );
	return { ...kept, km: shown( 'km' ), moon: shown( 'moon' ), mars: shown( 'mars' ), looks: shown( 'looks' ), rides: shown( 'rides' ) };

}

function render() {

	const me = app.player();
	const have = getFeats();
	const dates = new Map( ( answer && askedFor === me?.id ? answer.achievements : [] ).map( a => [ a.id, a.at ] ) );
	const now = counts();
	dialog.querySelector( '.count' ).textContent = `${ ACHIEVEMENTS.filter( a => have.has( a.id ) ).length } / ${ ACHIEVEMENTS.length }`;
	dialog.querySelector( '.lead' ).textContent = 'Badges for what you\'ve done; some unlock construction rides.';
	dialog.querySelector( '.save' ).hidden = !! me || ! app.worker;
	dialog.querySelector( '.feats' ).replaceChildren( ...ACHIEVEMENTS.map( feat => {

		const earned = have.has( feat.id );
		const item = element( 'li', `feat ${ earned ? 'earned' : 'locked' }` );
		item.dataset.id = feat.id;
		item.dataset.checked = COUNTS[ feat.count ];
		const icon = element( 'span', 'icon', ICONS[ feat.count ] ?? '🏅' );
		icon.setAttribute( 'aria-hidden', 'true' );
		const body = element( 'div', 'body' );
		body.append( element( 'b', 'name', feat.name ), element( 'span', 'goal small', feat.goal ) );
		if ( feat.count !== 'placing' ) {

			const bar = element( 'span', 'bar' );
			const fill = element( 'i' );
			fill.style.width = `${ ( Math.min( 1, ( now[ feat.count ] ?? 0 ) / feat.target ) * 100 ).toFixed( 1 ) }%`;
			bar.append( fill );
			body.append( bar );

		}

		const at = dates.get( feat.id );
		body.append( element( 'span', 'state small', earned ? at ? `Earned ${ new Date( at ).toLocaleDateString( 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' } ) }` : 'Earned' : progressLine( feat, now ) ) );
		for ( const id of ridesOf( feat.id ) ) {

			const vehicle = app.vehicles.find( v => v.id === id );
			if ( ! vehicle ) continue;
			const reward = element( earned ? 'button' : 'span', 'reward small' );
			if ( vehicle.thumb ) reward.append( Object.assign( document.createElement( 'img' ), { src: vehicle.thumb, alt: '', loading: 'lazy' } ) );
			reward.append( earned ? `Drive the ${ vehicle.name.toLowerCase() }` : `Unlocks the ${ vehicle.name.toLowerCase() }` );
			if ( earned ) {

				reward.type = 'button';
				reward.addEventListener( 'click', () => {

					dialog.close();
					app.onRide( vehicle );

				} );

			}

			body.append( reward );

		}

		item.append( icon, body );
		return item;

	} ) );

}

function element( tag, className = '', text = null ) {

	const node = document.createElement( tag );
	if ( className ) node.className = className;
	if ( text !== null ) node.textContent = text;
	return node;

}
