// On-screen driving buttons for touch screens. Each button stands for a key (its data-code) and
// presses it while held, as keyboard events on the window, so drive.js and anything else
// listening for keys can't tell them from a keyboard. Several can be held at once: gas with a
// finger of one hand, steering with the other.

export function setUpTouchControls( root ) {

	const held = new Map();

	const send = ( type, code ) => window.dispatchEvent( new KeyboardEvent( type, { code, key: keyFor( code ), bubbles: true, cancelable: true } ) );

	function release( pointerId ) {

		const button = held.get( pointerId );
		if ( ! button ) return;
		held.delete( pointerId );
		button.classList.remove( 'down' );
		// Another finger may still be on the same button.
		if ( ! [ ...held.values() ].includes( button ) ) send( 'keyup', button.dataset.code );

	}

	for ( const button of root.querySelectorAll( '[data-code]' ) ) {

		button.addEventListener( 'pointerdown', e => {

			e.preventDefault();
			// Kept by the button while held, even if the finger slides off it.
			try {

				button.setPointerCapture( e.pointerId );

			} catch {

				// Not a live pointer (a synthetic event): nothing to keep.

			}

			const already = [ ...held.values() ].includes( button );
			held.set( e.pointerId, button );
			button.classList.add( 'down' );
			if ( ! already ) send( 'keydown', button.dataset.code );

		} );
		for ( const type of [ 'pointerup', 'pointercancel', 'lostpointercapture' ] ) button.addEventListener( type, e => release( e.pointerId ) );
		// A long press would open the browser's menu or select text instead.
		button.addEventListener( 'contextmenu', e => e.preventDefault() );

	}

	// Let go of everything, e.g. when driving stops or the page is hidden.
	function releaseAll() {

		for ( const id of [ ...held.keys() ] ) release( id );

	}

	window.addEventListener( 'blur', releaseAll );
	document.addEventListener( 'visibilitychange', () => document.hidden && releaseAll() );
	return { releaseAll };

}

function keyFor( code ) {

	if ( code.startsWith( 'Key' ) ) return code.slice( 3 ).toLowerCase();
	return { Space: ' ', ShiftLeft: 'Shift' }[ code ] ?? code;

}
