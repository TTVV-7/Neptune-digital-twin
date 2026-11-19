import { SCORING } from '../drive.js';

// "How scoring works": the stunt scoring rules, from the keys card and the pause menu. Built from
// drive.js's own numbers (SCORING), so it never says something the game doesn't do.

const n = value => value.toLocaleString( 'en' );

export function setUpScoring( dialog, openers, { onOpen = null } = {} ) {

	const { points, spinTol, flipTol, bigAir, combo, multMax, chainTime, landTilt, bounceMin, gauge } = SCORING;
	const rows = [
		[ 'Spin', `${ n( points.spin ) } for each half turn (180°), give or take ${ spinTol }°`, '<kbd>A</kbd> <kbd>D</kbd> in the air' ],
		[ 'Frontflip / Backflip', `${ n( points.flip ) } for each full flip, give or take ${ flipTol }°`, '<kbd>W</kbd> <kbd>S</kbd> in the air' ],
		[ 'Barrel roll', `${ n( points.roll ) } for each full roll, give or take ${ flipTol }°`, '<kbd>Q</kbd> <kbd>E</kbd> in the air' ],
		[ 'Wall bounce', `${ n( points.bounce ) } for each hit at ${ Math.round( bounceMin * 3.6 ) } km/h or more`, 'Hit a wall and bounce off' ],
		[ 'Big air', `${ n( points.air ) } a second, from ${ bigAir } s off the ground`, 'Long jumps' ],
	];
	dialog.querySelector( '.scoring-table tbody' ).innerHTML = rows.map( ( [ name, worth, how ] ) => `<tr><th scope="row">${ name }</th><td>${ worth }</td><td class="how">${ how }</td></tr>` ).join( '' );
	dialog.querySelector( '.scoring-rules' ).innerHTML = [
		`<li><b>Land it.</b> Nothing counts until you're back on your wheels, within about ${ landTilt }° of upright. Land on your roof or side and it's a <b>wipeout</b>: that jump's tricks are lost and the multiplier goes back to ×1.</li>`,
		`<li><b>Combo.</b> Two or more tricks in one jump (a backflip with a spin, say) are worth ${ combo }× their points added up.</li>`,
		`<li><b>Multiplier.</b> The jump's points are then multiplied by your multiplier (the ×2, ×3 by your score). Each trick landed puts it up by one, to ×${ multMax }. It drops back to ×1 after ${ chainTime } s on the ground without landing a trick, so keep them coming.</li>`,
		`<li><b>Bigger is better.</b> Two spins (360°) score twice one; a double backflip twice a backflip. Flips are worth the most, then rolls, then spins.</li>`,
		`<li><b>Flying</b> (<kbd>F</kbd>): flips and rolls (<kbd>Space</kbd> with <kbd>W</kbd> <kbd>S</kbd> or <kbd>A</kbd> <kbd>D</kbd>) still score; wall bounces and big air don't.</li>`,
		`<li><b>On the Moon</b> jumps last longer, so turns are worth less (by as much as the jump is longer) and big air counts the time the same jump would take on the Earth.</li>`,
		`<li><b>Bonus.</b> Each trick landed tops up the booster by ${ Math.round( gauge * 100 ) }%, and landing going forward gives a burst of speed.</li>`,
		`<li><b>Your score</b> is the run's total, from dropping in until you change ride or place. The leaderboard keeps your best run.</li>`,
	].join( '' );

	dialog.querySelector( '.close' )?.addEventListener( 'click', () => dialog.close() );
	for ( const opener of openers ) opener?.addEventListener( 'click', () => {

		onOpen?.();
		if ( ! dialog.open ) dialog.showModal();

	} );

}
