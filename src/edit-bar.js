// The edit bar (sidebar.js): along the bottom while the library is open, or while more than one
// thing is selected. Select (a drag on the ground then selects everything in a box, for touch and
// trackpads, as Shift+drag does with a mouse), how many are selected, and Copy, Cut, Paste,
// Duplicate, Undo and Redo, which the keys do too (Ctrl/Cmd+C, X, V, D, Z, Shift+Z).

const icon = paths => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ paths }</svg>`;
const ICONS = {
	box: icon( '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M10 4h4M10 20h4M4 10v4M20 10v4"/>' ),
	copy: icon( '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>' ),
	cut: icon( '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M7.8 16.2 17 4M16.2 16.2 7 4"/>' ),
	paste: icon( '<path d="M9 4h6v3H9z"/><path d="M15 5.5h2.5A1.5 1.5 0 0 1 19 7v12.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5V7a1.5 1.5 0 0 1 1.5-1.5H9"/><path d="M9 12h6M9 16h4"/>' ),
	duplicate: icon( '<rect x="4" y="4" width="11" height="11" rx="2"/><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M14.5 12.5v5M12 15h5"/>' ),
	undo: icon( '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>' ),
	redo: icon( '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>' ),
};
const MAC = /Mac|iPhone|iPad/.test( navigator.platform ?? '' );
const MOD = MAC ? '⌘' : 'Ctrl+';
const MARGIN = 12;
const PHONE = window.matchMedia( '( max-width: 700px )' );
// The panels at the bottom right (layers.js, legend.js) the bar keeps clear of.
const PANELS = '#layers > :not([hidden]), #legend > :not([hidden])';

// actions: { boxMode( on ), copy(), cut(), paste(), duplicate(), undo(), redo() }.
export function createEditBar( actions ) {

	const root = document.createElement( 'div' );
	root.className = 'edit-bar';
	root.hidden = true;
	root.setAttribute( 'role', 'toolbar' );
	root.setAttribute( 'aria-label', 'Selecting and editing' );
	root.addEventListener( 'contextmenu', e => e.preventDefault() );
	document.body.append( root );

	const button = ( name, text, title ) => {

		const element = document.createElement( 'button' );
		element.type = 'button';
		element.className = name;
		element.title = title;
		element.innerHTML = `${ ICONS[ name ] }<span>${ text }</span>`;
		element.addEventListener( 'click', () => {

			// Leave the keyboard to the scene, so Space or Enter don't press it again.
			element.blur();
			actions[ name === 'box' ? 'toggleBox' : name ]();

		} );
		root.append( element );
		return element;

	};

	const buttons = {
		box: button( 'box', 'Select', 'Select a box: drag on the map to select everything in it (or hold Shift and drag). Shift+click adds or takes out one item' ),
	};
	const count = document.createElement( 'span' );
	count.className = 'count';
	count.setAttribute( 'aria-live', 'polite' );
	root.append( count );
	Object.assign( buttons, {
		copy: button( 'copy', 'Copy', `Copy the selection (${ MOD }C); paste it in this project or another, even at another site` ),
		cut: button( 'cut', 'Cut', `Cut the selection (${ MOD }X): copy it and take it away` ),
		paste: button( 'paste', 'Paste', `Paste what you copied where the pointer is, or in the middle of the view (${ MOD }V)` ),
		duplicate: button( 'duplicate', 'Duplicate', `Duplicate the selection beside itself (${ MOD }D)` ),
		undo: button( 'undo', 'Undo', `Undo (${ MOD }Z)` ),
		redo: button( 'redo', 'Redo', `Redo (${ MOD }${ MAC ? '⇧Z' : 'Y' })` ),
	} );
	buttons.box.setAttribute( 'aria-pressed', 'false' );

	// Along the bottom, in the middle of the map between the library (open, on the left) and the
	// Show and Controls panels (bottom right), which come and go and change size; where there's no
	// room between them, at the top (as on a phone, style.css).
	let placedAt = - Infinity;
	function place() {

		const now = performance.now();
		if ( root.hidden || now - placedAt < 200 ) return;
		placedAt = now;
		// A phone: across the top, under the status (and Build's site picker), clear of the library's sheet.
		if ( PHONE.matches ) {

			root.style.top = `${ belowTop() }px`;
			root.style.left = '';
			return;

		}

		const library = document.getElementById( 'library' );
		const sheet = library && ! library.hidden ? library.getBoundingClientRect() : null;
		let left = sheet && sheet.top <= 0 ? sheet.right + MARGIN : MARGIN;
		let right = window.innerWidth - MARGIN;
		const width = root.offsetWidth;
		for ( const panel of document.querySelectorAll( PANELS ) ) {

			const r = panel.getBoundingClientRect();
			if ( r.width === 0 || r.bottom < window.innerHeight - 80 ) continue;
			right = Math.min( right, r.left - MARGIN );

		}

		const top = right - left < width;
		if ( top ) {

			left = sheet && sheet.top <= 0 ? sheet.right + MARGIN : MARGIN;
			right = window.innerWidth - MARGIN;

		}

		const x = Math.max( left, ( left + right - width ) / 2 );
		root.classList.toggle( 'at-top', top );
		root.style.top = top ? `${ belowTop() }px` : '';
		root.style.left = `${ Math.round( x ) }px`;

	}

	// Under what's along the top: the status, and Build's site picker.
	function belowTop() {

		let top = MARGIN;
		for ( const element of document.querySelectorAll( '#status:not([hidden]), .site-picker' ) ) {

			const r = element.getBoundingClientRect();
			if ( r.height > 0 && r.top < 200 ) top = Math.max( top, r.bottom + 8 );

		}

		return Math.round( top );

	}

	// shown, boxing (Select is on), selected (how many), canPaste, undo / redo: labels or null.
	let last = '';
	function update( { shown, boxing, selected, canPaste, undo, redo } ) {

		place();
		const key = JSON.stringify( [ shown, boxing, selected, canPaste, undo, redo ] );
		if ( key === last ) return;
		last = key;
		root.hidden = ! shown;
		document.body.classList.toggle( 'edit-bar-shown', shown );
		buttons.box.setAttribute( 'aria-pressed', String( boxing ) );
		count.textContent = selected === 0 ? 'Nothing selected' : selected === 1 ? '1 selected' : `${ selected } selected`;
		count.classList.toggle( 'some', selected > 0 );
		buttons.copy.disabled = selected === 0;
		buttons.cut.disabled = selected === 0;
		buttons.duplicate.disabled = selected === 0;
		buttons.paste.disabled = ! canPaste;
		buttons.undo.disabled = ! undo;
		buttons.redo.disabled = ! redo;
		buttons.undo.title = undo ? `Undo ${ undo } (${ MOD }Z)` : `Undo (${ MOD }Z)`;
		buttons.redo.title = redo ? `Redo ${ redo } (${ MOD }${ MAC ? '⇧Z' : 'Y' })` : `Redo (${ MOD }${ MAC ? '⇧Z' : 'Y' })`;

	}

	return { root, update };

}
