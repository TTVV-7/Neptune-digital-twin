// The panel's Worlds button and the orrery it opens (src/drive-app/orrery.js), for the browser
// suites that change worlds through the page as a player does: test-drive-ui.mjs, moon-ui, mars-ui,
// asteroids-ui and test-drive-orrery-ui.mjs. Each takes a Playwright page on the globe.

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
