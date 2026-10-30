import { createPlayer, getBoard, postScore, renamePlayer } from './api.js';
import { storage } from './places.js';

// The leaderboard (docs/world-drive.md): each player's best stunt score today, this week and all
// time, kept by the Worker (worker/drive/scores.js). There's no sign-up: the first time you post,
// or pick a name in the panel, you choose a nickname and the Worker makes you a player, whose id and
// secret stay in this browser (lose them and you pick a new name). Like a score, a new name needs
// this visit's token, so there's none to pick on the test pad. A run's score goes up as a
// landed jump beats your best today, at most one every POST_GAP, with this visit's token; the first
// time, a small card asks, and never stops the game. Nothing here may get in the way of driving:
// every call to the Worker is allowed to fail.

const PLAYER_KEY = 'world-drive.player';
const POSTED_KEY = 'world-drive.posted';
// At most one score every POST_GAP ms (the Worker takes one every 10 s); the latest goes once it's up.
const POST_GAP = 15000;
// After a post that didn't get through, the next waits RETRY ms; after TRIES in a row, no more.
const RETRY = 30000;
const TRIES = 3;
// How long (ms) the card stays up, unless a name is being typed into it.
const CARD_TIME = 6000;
const NAME = /^[\p{L}\p{M}\p{N} _-]{3,16}$/u;
const NAME_RULE = 'Use 3 to 16 letters, numbers, spaces, _ or -.';
const NO_VISIT = 'Names are picked on drives on the real 3D map.';

// dialog: #leaderboard; card: #best-card, the new-best card shown while driving; vehicles: from
// loadVehicles(), for their names; worker: whether there's a Worker to ask (not on the Vite dev
// server on its own); getPlace(): the place being driven or pinned, for "only here", or null.
export function setUpLeaderboard( { dialog, card, vehicles, worker, getPlace } ) {

	const $ = selector => dialog.querySelector( selector );
	const tabs = [ ...dialog.querySelectorAll( '.tabs button' ) ];
	const here = $( '.here' );
	const status = $( '.status' );
	const list = $( '.rows' );
	const mine = $( '.mine' );
	const named = $( '.named' );
	const form = $( '.name-form' );
	const formStatus = $( '.form-status' );
	const cardForm = card.querySelector( '.name-form' );
	const cardButtons = card.querySelector( '.buttons' );
	const cardStatus = card.querySelector( '.form-status' );

	let player = loadPlayer();
	let visit = null;
	// The best posted today: { day, best }.
	let posted = storage( () => JSON.parse( localStorage.getItem( POSTED_KEY ) ) ) ?? {};
	// The run waiting to go up, and the post that's on its way.
	let pending = null;
	let timer = 0;
	let sending = false;
	let lastPost = - Infinity;
	let failures = 0;
	// Ranks last posted to, to say so when they get better.
	let ranks = { today: Infinity, all: Infinity };
	// Whether the card has asked a player with no name yet, this visit: it asks once.
	let asked = false;
	let cardTimer = 0;
	let period = 'today';
	let onlyHere = false;
	let renaming = false;
	let loads = 0;

	// --- posting scores ---

	// From the driver (drive.js onScore), with the place and the vehicle: each landed jump. It's
	// called in the middle of driving, so nothing may go wrong here.
	function onScore( run ) {

		try {

			if ( ! worker || ! visit || run.score <= todayBest() ) return;
			pending = run;
			if ( player ) schedule();
			else if ( ! asked ) ask();
			else if ( ! card.hidden && card.dataset.kind === 'ask' ) card.querySelector( '.title' ).textContent = title( run );

		} catch ( err ) {

			console.warn( 'Leaderboard:', err?.message );

		}

	}

	function schedule() {

		if ( timer || sending ) return;
		timer = setTimeout( () => {

			timer = 0;
			send();

		}, Math.max( 0, lastPost + POST_GAP - Date.now() ) );

	}

	async function send() {

		const run = pending;
		if ( ! run || ! player || ! visit || sending ) return;
		pending = null;
		if ( run.score <= todayBest() ) return;
		sending = true;
		lastPost = Date.now();
		const { id, secret } = player;
		const { score, tricks, place, vehicle, airTime, runSeconds } = run;
		const answer = await postScore( { id, secret, visit, score, tricks, place, vehicle, airTime, runSeconds } );
		sending = false;

		if ( answer.ok ) {

			failures = 0;
			const { today: day, rank, isNewBest } = answer.body;
			remember( day?.best ?? score );
			// Only when it's news: a best ever, or higher up today's board than before.
			if ( isNewBest || day?.rank < ranks.today ) showCard( 'posted', isNewBest ? `New best! ${ points( score ) }` : `Today's best: ${ points( score ) }`, standing( answer.body ) );
			ranks = { today: day?.rank ?? Infinity, all: rank ?? Infinity };

		} else if ( answer.status === 429 ) {

			// Too soon (or today's scores are used up): wait as long as the Worker says.
			pending ??= run;
			lastPost = Date.now() + answer.retryAfter * 1000 - POST_GAP;

		} else if ( answer.status === 403 && answer.body.reason === 'player' ) {

			// This player is gone (the owner removed it): pick a new name to post again.
			forgetPlayer();
			pending ??= run;
			asked = false;

		} else if ( answer.status === 403 ) {

			visit = null;
			showCard( 'ended', 'Scores are paused', 'This visit has run out. Reload the page to post scores again.' );

		} else if ( answer.status !== 400 && ++ failures < TRIES ) {

			// No connection, or the Worker had trouble: try again in a while. (A 400 is a score the
			// leaderboard won't take; there's nothing to try again.)
			pending ??= run;
			lastPost = Date.now() + RETRY - POST_GAP;

		}

		if ( pending && player ) schedule();

	}

	function todayBest() {

		return posted?.day === today() ? Number( posted.best ) || 0 : 0;

	}

	function remember( best ) {

		posted = { day: today(), best: Math.max( best, todayBest() ) };
		storage( () => localStorage.setItem( POSTED_KEY, JSON.stringify( posted ) ) );

	}

	function standing( { rank, today: day } ) {

		const parts = [];
		if ( day?.rank ) parts.push( `#${ day.rank } today` );
		if ( rank ) parts.push( `#${ rank } all time` );
		return parts.length ? parts.join( ' · ' ) : 'On the leaderboard';

	}

	// --- the card: "New best! Post it?", and what came of a post ---

	function ask() {

		asked = true;
		showCard( 'ask', title( pending ), 'Post it to the leaderboard?' );
		cardButtons.hidden = false;

	}

	// kind: 'ask', 'posted' or 'ended'.
	function showCard( kind, heading, message ) {

		card.dataset.kind = kind;
		card.querySelector( '.title' ).textContent = heading;
		card.querySelector( '.message' ).textContent = message;
		cardButtons.hidden = true;
		cardForm.hidden = true;
		cardStatus.textContent = '';
		card.hidden = false;
		holdCard( false );

	}

	// Up for CARD_TIME, or for as long as it's being typed in.
	function holdCard( hold ) {

		clearTimeout( cardTimer );
		if ( ! hold ) cardTimer = setTimeout( hideCard, CARD_TIME );

	}

	function hideCard() {

		clearTimeout( cardTimer );
		if ( card.contains( document.activeElement ) ) document.activeElement.blur();
		card.hidden = true;

	}

	card.querySelector( '.post' ).addEventListener( 'click', () => {

		cardButtons.hidden = true;
		cardForm.hidden = false;
		card.querySelector( '.message' ).textContent = 'Your name on the leaderboard:';
		holdCard( true );
		cardForm.elements.name.focus();

	} );
	card.querySelector( '.later' ).addEventListener( 'click', hideCard );
	cardForm.addEventListener( 'submit', async e => {

		e.preventDefault();
		const input = cardForm.elements.name;
		if ( await pickName( input.value, text => cardStatus.textContent = text ) ) {

			input.blur();
			showCard( 'posted', title( pending ?? { score: todayBest() } ), `Driving as ${ player.name }. Posting your score...` );

		}

	} );
	// Esc puts the card away, and so does driving on for a few seconds: the name can wait for the
	// pause menu.
	cardForm.elements.name.addEventListener( 'keydown', e => {

		if ( e.key === 'Escape' ) hideCard();

	} );
	cardForm.elements.name.addEventListener( 'blur', () => holdCard( cardForm.contains( document.activeElement ) ) );

	function title( run ) {

		return run?.newBest ? `New best! ${ points( run.score ) }` : `Your best today: ${ points( run?.score ?? 0 ) }`;

	}

	// --- names ---

	// A new player, or a new name for this one: true if it worked; say( text ) tells how it went.
	async function pickName( value, say ) {

		const name = value.replace( /\s+/g, ' ' ).trim();
		if ( ! NAME.test( name ) ) {

			say( NAME_RULE );
			return false;

		}

		if ( ! player && ! visit ) {

			say( NO_VISIT );
			return false;

		}

		say( 'Saving...' );
		const answer = player ? await renamePlayer( player, name ) : await createPlayer( name, visit );
		if ( ! answer.ok ) {

			// A visit that's run out, or has made its player already, makes no more.
			if ( answer.status === 403 && answer.body.reason === 'visit' ) visit = null;
			else if ( answer.status === 403 ) forgetPlayer();
			say( nameError( answer ) );
			return false;

		}

		player = { id: answer.body.id, secret: answer.body.secret ?? player.secret, name: answer.body.name };
		storage( () => localStorage.setItem( PLAYER_KEY, JSON.stringify( player ) ) );
		say( '' );
		if ( pending ) schedule();
		return true;

	}

	function nameError( { status, body } ) {

		if ( status === 409 ) return 'That name\'s taken. Try another.';
		if ( status === 400 && /allowed/.test( body.error ) ) return 'That name isn\'t allowed. Try another.';
		if ( status === 400 ) return NAME_RULE;
		if ( status === 403 && body.reason === 'visit' ) return 'This visit has run out. Reload the page to pick a name.';
		if ( status === 403 ) return 'This browser\'s name was removed. Pick a new one.';
		if ( status === 429 ) return 'That\'s all the new names for today. Try again tomorrow.';
		return 'Couldn\'t reach World Drive. Try again.';

	}

	function forgetPlayer() {

		player = null;
		storage( () => localStorage.removeItem( PLAYER_KEY ) );

	}

	// --- the panel ---

	function open() {

		if ( ! dialog.open ) dialog.showModal();
		renaming = false;
		const place = getPlace();
		here.hidden = ! place;
		if ( ! place ) onlyHere = false;
		here.querySelector( 'input' ).checked = onlyHere;
		here.querySelector( '.here-name' ).textContent = place ?? '';
		showYou();
		load();

	}

	async function load() {

		const asking = ++ loads;
		for ( const tab of tabs ) tab.setAttribute( 'aria-selected', String( tab.dataset.period === period ) );
		say( 'Loading...' );
		list.setAttribute( 'aria-busy', 'true' );
		const answer = worker ? await getBoard( { period, place: onlyHere ? getPlace() : null, id: player?.id } ) : { ok: false, status: 0 };
		if ( asking !== loads ) return;
		list.removeAttribute( 'aria-busy' );
		if ( ! answer.ok ) {

			list.replaceChildren();
			mine.hidden = true;
			say( worker ? 'The leaderboard isn\'t answering. Try again soon.' : 'The leaderboard isn\'t on here: it needs World Drive\'s Worker.' );
			return;

		}

		const { rows, total, me } = answer.body;
		say( rows.length ? '' : onlyHere ? 'No scores here yet. Be the first!' : 'No scores yet. Be the first!' );
		list.replaceChildren( ...rows.map( row => rowItem( row, !! me && row.rank === me.rank ) ) );
		mine.hidden = ! total;
		if ( me && me.rank > rows.length ) mine.textContent = `You're #${ me.rank } of ${ total }, with ${ points( me.score ) }`;
		else if ( me ) mine.textContent = `You're #${ me.rank } of ${ total }`;
		else mine.textContent = `${ total } driver${ total === 1 ? '' : 's' } on this board`;

	}

	function say( text ) {

		status.textContent = text;
		status.hidden = ! text;

	}

	function rowItem( row, own ) {

		const li = document.createElement( 'li' );
		li.classList.toggle( 'me', own );
		const vehicle = vehicles.find( v => v.id === row.vehicle )?.name;
		const when = period === 'today' ? '' : new Date( `${ row.date }T12:00:00Z` ).toLocaleDateString( 'en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' } );
		const what = [ row.tricks, row.place, vehicle, when ].filter( Boolean ).join( ' · ' );
		const who = Object.assign( document.createElement( 'span' ), { className: 'who' } );
		who.append( Object.assign( document.createElement( 'b' ), { textContent: row.name } ), Object.assign( document.createElement( 'span' ), { className: 'what', textContent: what } ) );
		li.append( Object.assign( document.createElement( 'span' ), { className: 'rank', textContent: String( row.rank ) } ), who, Object.assign( document.createElement( 'span' ), { className: 'score', textContent: points( row.score ) } ) );
		return li;

	}

	// Who you are on the board, and the name form (to pick one, or rename).
	function showYou() {

		named.hidden = ! player || renaming;
		if ( player ) named.querySelector( '.name' ).textContent = player.name;
		// A new name needs a visit; a rename doesn't.
		form.hidden = player ? ! renaming : ! visit;
		form.elements.name.value = renaming ? player.name : '';
		form.querySelector( 'button[type=submit]' ).textContent = renaming ? 'Rename' : 'Save';
		formStatus.textContent = '';
		const waiting = ! player && pending && visit;
		$( '.form-hint' ).textContent = waiting ? `Pick a name and your ${ points( pending.score ) } goes up.` : NAME_RULE;
		$( '.offline' ).hidden = ! worker || !! visit;

	}

	for ( const tab of tabs ) {

		tab.addEventListener( 'click', () => {

			period = tab.dataset.period;
			load();

		} );

	}

	here.querySelector( 'input' ).addEventListener( 'change', e => {

		onlyHere = e.target.checked;
		load();

	} );
	named.querySelector( '.rename' ).addEventListener( 'click', () => {

		renaming = true;
		showYou();
		form.elements.name.focus();
		form.elements.name.select();

	} );
	form.addEventListener( 'submit', async e => {

		e.preventDefault();
		if ( ! await pickName( form.elements.name.value, text => formStatus.textContent = text ) ) return;
		renaming = false;
		showYou();
		load();

	} );
	$( '.close' ).addEventListener( 'click', () => dialog.close() );
	// A click on the backdrop closes it too (the backdrop's clicks are the dialog's own, outside its box).
	dialog.addEventListener( 'click', e => {

		const box = dialog.getBoundingClientRect();
		const outside = e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom;
		if ( e.target === dialog && outside ) dialog.close();

	} );

	return {
		open,
		onScore,
		// This visit's token, from /api/visit: without one (the test pad, the dev server) scores
		// aren't posted.
		setVisit( token ) {

			visit = token || null;
			if ( dialog.open ) showYou();

		},
		get isOpen() {

			return dialog.open;

		},
		get player() {

			return player;

		},
		get pending() {

			return pending;

		},
	};

}

// { id, secret, name } as this browser keeps it, or null.
function loadPlayer() {

	const saved = storage( () => JSON.parse( localStorage.getItem( PLAYER_KEY ) ) );
	return typeof saved?.id === 'string' && typeof saved.secret === 'string' && typeof saved.name === 'string' ? saved : null;

}

// The UTC date, as the Worker's days go.
function today() {

	return new Date().toISOString().slice( 0, 10 );

}

function points( score ) {

	return score.toLocaleString( 'en-CA' );

}
