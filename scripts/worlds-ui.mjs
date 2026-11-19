// The panel's Worlds button and the orrery it opens (src/drive-app/orrery.js), for the browser
// suites that change worlds through the page as a player does: test-drive-ui.mjs, moon-ui, mars-ui,
// asteroids-ui and test-drive-orrery-ui.mjs. Each takes a Playwright page on the globe. And the Earth's
// hop (HOP), which those on other worlds measure theirs against.

import { readFileSync } from 'node:fs';

export const OPENER = '#globe-ui .worlds-open';
export const ORRERY = '#orrery';
export const radio = id => `#orrery .orrery-worlds [role=radio][data-world="${ id }"]`;

// The orrery open (from the Worlds button, clicked or tapped) and ready: its five worlds drawn.
export async function openWorlds( page, { tap = false } = {} ) {

	const opener = page.locator( OPENER );
	await ( tap ? opener.tap() : opener.click() );
	await page.locator( `${ ORRERY }[open] .orrery-worlds [role=radio]` ).first().waitFor( { timeout: 60000 } );

}

// Is it open?
export const worldsOpen = page => page.evaluate( () => !! document.querySelector( '#orrery' )?.open );

// `id` picked in the orrery and driven to: Worlds, its radio, its Drive (or Back to). The orrery is
// closed when this returns; the world may still be loading (wait on window.drive.world).
export async function pickWorld( page, id, { tap = false } = {} ) {

	if ( ! await worldsOpen( page ) ) await openWorlds( page, { tap } );
	const pick = page.locator( radio( id ) );
	await ( tap ? pick.tap() : pick.click() );
	const drive = page.locator( `${ ORRERY } .orrery-drive` );
	await drive.waitFor();
	await ( tap ? drive.tap() : drive.click() );
	await page.waitForFunction( () => ! document.querySelector( '#orrery' ).open );

}

// The world the Worlds button says the game is on.
export const worldShown = page => page.locator( OPENER ).getAttribute( 'data-world' );

// A hop (Space, tapped) on the Earth, for the suites that hop on another world (moon-ui, mars-ui,
// asteroids-ui): it leaves the ground at src/drive.js's JUMP_SPEED m/s (read from its source, so
// they follow it), goes `high` m up and is `time` s in the air. Under g times the Earth's gravity it
// leaves at JUMP_SPEED × √g, goes as high, and stays up 1 / √g times as long.
const JUMP = /^const JUMP_SPEED = ([\d.]+);$/m.exec( readFileSync( new URL( '../src/drive.js', import.meta.url ), 'utf8' ) );
if ( ! JUMP ) throw new Error( 'worlds-ui.mjs: no JUMP_SPEED in src/drive.js' );
const SPEED = Number( JUMP[ 1 ] );
export const HOP = Object.freeze( { speed: SPEED, high: SPEED ** 2 / ( 2 * 9.81 ), time: 2 * SPEED / 9.81 } );
