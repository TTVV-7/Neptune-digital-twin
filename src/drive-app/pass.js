import './pro.css';
import { BOOSTS } from './boosts.js';
import { CARS } from './cars.js';
import { RIDES } from './levels.js';
import { PRO_RIDES } from './rides/index.js';

// The Supporter Pass sheet: what the pass is and what comes with it (the rides, every Garage look at
// once, +50% XP for levels, the ⭐, more drives a day), opened from the globe's panel, the pause
// menu, the Garage, and anything locked (see pro.js). Its buy area says "Coming soon" until the
// payments code (supporter.js: Google sign-in and Stripe) fills it with its own, and that calls
// setPro( true ) in pro.js once the pass is bought.

export const PRICE = 'CA$4.99';
const BADGE = '⭐ Supporter Pass';
const COUNTS = [ 'No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty' ];
const count = n => COUNTS[ n ] ?? String( n );
// What the pass adds to the rides: the cars that need it or a level (cars.js, levels.js's ride
// rewards), and the rides built for it.
const LEVEL_CARS = CARS.filter( car => RIDES.some( reward => reward.id === car.id ) );
const PASS_CARS = CARS.filter( car => car.pro || LEVEL_CARS.includes( car ) );
// How many of the Garage's boost styles the pass adds to the free ones (boosts.js).
const PASS_BOOSTS = BOOSTS.filter( style => ! style.free ).length;

let sheet = null;
// Called each time the sheet opens (main.js counts it for the play stats).
let onOpen = () => {};

export function openPass() {

	sheet ??= build();
	if ( ! sheet.open ) {

		sheet.showModal();
		onOpen();

	}

	sheet.querySelector( '.close' ).focus();

}

// fn() each time the sheet opens, from wherever it's opened.
export function onPassOpen( fn ) {

	onOpen = fn;

}

export function closePass() {

	sheet?.close();

}

// Where the buy button goes.
export function buyArea() {

	sheet ??= build();
	return sheet.querySelector( '.buy-area' );

}

// The small badge on anything locked.
export function proBadge() {

	return Object.assign( document.createElement( 'span' ), { className: 'pro-badge', textContent: BADGE } );

}

function build() {

	const dialog = document.createElement( 'dialog' );
	dialog.id = 'pass';
	dialog.setAttribute( 'aria-labelledby', 'pass-title' );
	dialog.innerHTML = `
		<div class="sheet">
			<button type="button" class="close" aria-label="Close">&times;</button>
			<p class="pro-badge">${ BADGE }</p>
			<h2 id="pass-title">Supporter Pass</h2>
			<p class="lead">World Drive streams the real 3D world, and every drive costs us a little. The pass is one payment of <b>${ PRICE }</b> that helps keep it running, and comes with:</p>
			<ul class="perks">
				<li class="rides"><b>${ count( PASS_CARS.length + PRO_RIDES.length ) } more rides</b><span>${ count( PASS_CARS.length ) } cars and ${ count( PRO_RIDES.length ).toLowerCase() } built rides; levels bring ${ count( LEVEL_CARS.length ).toLowerCase() } too.</span><div class="ride-icons"></div></li>
				<li><b>The whole Garage, now</b><span>Every look at once: all 12 colours, matte and metallic paint, stripes, a number, flames or checker, rim colours, ${ count( PASS_BOOSTS ).toLowerCase() } more boost styles (lightning, fireworks, a galaxy, dragon fire...), flame colours and six trails. Levels unlock some of them as you drive; the pass doesn't wait.</span></li>
				<li><b>+50% XP</b><span>Every level sooner, with its titles and level-only colours.</span></li>
				<li><b>A ⭐ on the leaderboard</b><span>By your name, for everyone to see.</span></li>
				<li><b>30 drives a day</b><span>Instead of 8.</span></li>
			</ul>
			<div class="buy-area">
				<button type="button" class="primary buy" disabled>Coming soon</button>
				<p class="small">One payment, no subscription. Buying opens soon.</p>
			</div>
		</div>`;
	dialog.querySelector( '.ride-icons' ).replaceChildren( ...[ ...PASS_CARS, ...PRO_RIDES ].map( ride => {

		// Each named by its picture alone, in two rows, which keeps the sheet short enough for Buy and
		// signing in to be on a laptop's screen.
		const icon = document.createElement( 'span' );
		icon.className = 'ride-icon';
		icon.title = ride.name;
		icon.setAttribute( 'role', 'img' );
		icon.setAttribute( 'aria-label', ride.name );
		// A car's picture is its thumbnail (drive/public/cars/thumbs/); a built ride's, its drawing.
		if ( ride.icon ) icon.innerHTML = ride.icon;
		else icon.append( Object.assign( document.createElement( 'img' ), { src: new URL( `cars/thumbs/${ ride.id }.webp`, document.baseURI ).href, alt: '', loading: 'lazy' } ) );
		return icon;

	} ) );
	dialog.querySelector( '.close' ).addEventListener( 'click', () => dialog.close() );
	// A click on the backdrop (the dialog itself, round its sheet) closes it.
	dialog.addEventListener( 'click', e => e.target === dialog && dialog.close() );
	// Keys pressed here are the sheet's, not the game's: Esc closes it rather than driving on.
	dialog.addEventListener( 'keydown', e => e.stopPropagation() );
	document.body.append( dialog );
	return dialog;

}
