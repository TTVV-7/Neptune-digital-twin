// The repairs over time: "Timeline" in the views bar, beside "Edit areas", opens a bar along the
// bottom with a slider of days from before the first chipping to today. The B2D2 model's repair
// areas are drawn as they were by the end of the day the slider is on (repair-areas.js: each area
// keeps the day it reached each stage, from the progress drawings and from when its status was
// changed in the twin): not there yet, chipped, sandblasted, epoxy coated, shotcreted. Play runs
// through the days, a timelapse of the work; the bar counts the areas and m² at each stage that
// day. Closing it, or starting to edit, puts the areas back as they are now.

// A day's step when playing, in seconds, at each speed.
const SPEEDS = [ [ 'Slow', 1.4 ], [ 'Normal', 0.7 ], [ 'Fast', 0.3 ] ];
// Longer than this (days) from first to last, the slider goes from one day something happened to
// the next rather than day by day.
const LONGEST = 400;
// Between the bar and Google's credits under it, in px.
const GAP = 8;
const WORKS_COLOUR = '#b9c0c8';
const escape = text => String( text ?? '' ).replace( /[&<>"]/g, c => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } )[ c ] );
const COLOURS = { Marked: '#0e8fa8', Chipped: '#7c4a2d', Sandblasted: '#f1f5f9', 'Epoxy coated': '#047857', Shotcreted: '#475569' };

const today = () => {

	const d = new Date();
	return `${ d.getFullYear() }-${ String( d.getMonth() + 1 ).padStart( 2, '0' ) }-${ String( d.getDate() ).padStart( 2, '0' ) }`;

};
const utc = day => new Date( `${ day }T00:00:00Z` );
const plus = ( day, days ) => new Date( utc( day ).getTime() + days * 86400000 ).toISOString().slice( 0, 10 );
const said = day => utc( day ).toLocaleDateString( 'en-CA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' } );

// timeline: repair-areas.js's (days(), setDay( day | null ), summary(), has(), stopEditing(),
// onStopped( fn ): fn is called when editing the areas or the model starts).
export function setUpRepairTimeline( { timeline, bar, toast } ) {

	let days = []; // the slider's stops, oldest first; past the last is now
	let open = false;
	let playing = 0; // the number of the run through the days that's going, or 0

	const toggle = Object.assign( document.createElement( 'button' ), { type: 'button', className: 'timeline-toggle', textContent: 'Timeline', hidden: true } );
	toggle.title = 'The repairs over time: play them back day by day';
	toggle.addEventListener( 'click', () => open ? close() : show() );
	bar?.append( toggle );

	const strip = document.createElement( 'section' );
	strip.id = 'repair-timeline';
	strip.hidden = true;
	strip.setAttribute( 'aria-label', 'The repairs over time' );
	strip.innerHTML = `
		<button type="button" class="play" title="Play the repairs through, day by day">▶</button>
		<input type="range" class="days" min="0" max="0" step="1" value="0" aria-label="Day">
		<span class="day"></span>
		<select class="speed" aria-label="Speed">${ SPEEDS.map( ( [ name, seconds ], i ) => `<option value="${ seconds }"${ i === 1 ? ' selected' : '' }>${ name }</option>` ).join( '' ) }</select>
		<button type="button" class="close" title="Back to how it is now">×</button>
		<div class="counts"></div>
	`;
	document.body.append( strip );
	const $ = selector => strip.querySelector( selector );
	const slider = $( '.days' );

	// The slider's place as a day, or null for now (its last stop).
	const dayAt = i => i >= days.length ? null : days[ i ];

	function render() {

		// The model with the areas taken off the site: nothing to play.
		if ( open && ! timeline.has() ) {

			pause();
			open = false;
			timeline.setDay( null );

		}

		toggle.hidden = ! timeline.has();
		toggle.classList.toggle( 'active', open );
		strip.hidden = ! open;
		document.body.classList.toggle( 'repair-timeline-open', open );
		if ( ! open ) return;
		const day = dayAt( Number( slider.value ) );
		$( '.day' ).textContent = day ? said( day ) : `${ said( today() ) } · now`;
		$( '.play' ).textContent = playing ? '❚❚' : '▶';
		$( '.play' ).title = playing ? 'Pause' : 'Play the repairs through, day by day';
		const rows = timeline.summary().filter( row => row.count );
		// What others took out, while any of it was still there that day.
		const works = day ? ( timeline.works?.() ?? [] ).filter( work => work.left || work.removing ) : [];
		$( '.counts' ).innerHTML = ( rows.length
			? rows.map( row => `<span><i style="background:${ COLOURS[ row.stage ] ?? '#888' }"></i>${ row.stage } ${ row.count } · ${ row.area.toFixed( 1 ) } m²</span>` ).join( '' )
			: '<span>Nothing chipped yet</span>' )
			+ works.map( work => `<span class="works"><i style="background:${ WORKS_COLOUR }"></i>${ escape( work.name ) } ${ work.left } of ${ work.total } bays left${ work.removing ? `, ${ work.removing } out today` : '' }${ work.by ? ` (${ escape( String( work.by ).toLowerCase() ) })` : '' }</span>` ).join( '' );
		place();

	}

	// Google's logo and credits along the bottom have to stay in sight: the bar goes above those it
	// would lie over (they come and go, and wrap taller, with the tiles and the window).
	function place() {

		if ( ! open ) return;
		strip.style.bottom = '';
		const own = strip.getBoundingClientRect();
		const tops = [ ...document.querySelectorAll( '#attribution img, #attribution .credits' ) ]
			.map( el => el.getBoundingClientRect() )
			.filter( r => r.width && r.height && r.top > window.innerHeight / 2 && r.right > own.left && r.left < own.right )
			.map( r => r.top );
		const bottom = Math.max( window.innerHeight - own.bottom, tops.length ? window.innerHeight - Math.min( ...tops ) + GAP : 0 );
		if ( tops.length ) strip.style.bottom = `${ bottom }px`;
		// For the hint line, which goes above the bar (repair-areas.css).
		document.documentElement.style.setProperty( '--repair-timeline-top', `${ Math.round( bottom + own.height + GAP ) }px` );

	}

	window.addEventListener( 'resize', place );
	const credits = document.getElementById( 'attribution' );
	if ( credits && window.ResizeObserver ) new ResizeObserver( place ).observe( credits );
	if ( credits ) new MutationObserver( place ).observe( credits, { attributes: true, childList: true, subtree: true, characterData: true } );

	async function go( i ) {

		slider.value = String( Math.max( 0, Math.min( days.length, i ) ) );
		await timeline.setDay( dayAt( Number( slider.value ) ) );
		render();

	}

	function pause() {

		playing = 0;

	}

	// Through the days from where it is (from the start, if it's at the end) to now, a step at a
	// time, each after the last is drawn.
	let runs = 0;
	async function play() {

		const mine = playing = ++ runs;
		render();
		if ( Number( slider.value ) >= days.length ) await go( 0 );
		while ( playing === mine && Number( slider.value ) < days.length ) {

			await new Promise( done => setTimeout( done, Number( $( '.speed' ).value ) * 1000 ) );
			if ( playing !== mine ) return;
			await go( Number( slider.value ) + 1 );

		}

		if ( playing !== mine ) return;
		pause();
		render();

	}

	async function show() {

		const known = await timeline.days();
		if ( ! known.length ) {

			toast?.( 'No dates to play back yet: they come with the progress drawings, and each time a panel\'s status is changed' );
			return;

		}

		// From the day before anything, to yesterday; past that is now.
		const first = plus( known[ 0 ], - 1 ), last = today() >= known.at( - 1 ) ? today() : plus( known.at( - 1 ), 1 );
		const span = Math.round( ( utc( last ) - utc( first ) ) / 86400000 );
		days = span <= LONGEST ? Array.from( { length: span }, ( _, i ) => plus( first, i ) ) : [ first, ...known.filter( day => day < last ) ];
		slider.max = String( days.length );
		slider.value = slider.max;
		// The editors' panels and clicks out of the way: it's for looking.
		timeline.stopEditing();
		open = true;
		render();

	}

	function close() {

		if ( ! open ) return;
		pause();
		open = false;
		timeline.setDay( null );
		render();

	}

	$( '.play' ).addEventListener( 'click', () => playing ? ( pause(), render() ) : play() );
	$( '.close' ).addEventListener( 'click', close );
	slider.addEventListener( 'input', () => {

		pause();
		go( Number( slider.value ) );

	} );
	// The areas and the model are edited as they are now.
	timeline.onStopped( () => {

		pause();
		open = false;
		render();

	} );
	timeline.onChange( render );
	render();

	return {
		get open() {

			return open;

		},
		show, close, play, pause, go,
		// The slider's stops and where it is, for tests and the console.
		get days() {

			return [ ...days ];

		},
		get at() {

			return dayAt( Number( slider.value ) );

		},
		update: render,
	};

}
