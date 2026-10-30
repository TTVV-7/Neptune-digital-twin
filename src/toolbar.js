import { Vector3 } from 'three';
import { getKind, resizeShape } from './kinds.js';
import { toScreen } from './handles.js';
import { toast as showToast } from './placement.js';

// The selection toolbar (sidebar.js): a row of buttons over the selected item that follows it on
// screen, to turn it, type in an area's size, drive it, open its settings or delete it. Deleting
// shows an Undo toast for a few seconds instead of asking first.

// A press held this long (ms) on a turn button turns it by a right angle.
const HOLD_TIME = 450;
const UNDO_TIME = 5000;
// Pixels between the toolbar and what it sits over, and from the edges of the screen.
const GAP = 12;
const MARGIN = 8;
// Labels floating over placed things (earthworks.js, laydown.js), which the toolbar goes above.
const LABELS = '.earthworks-labels .label, .laydown-label';

const icon = paths => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ paths }</svg>`;
const ICONS = {
	left: icon( '<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5"/><path d="M4 3.5v5h5"/>' ),
	right: icon( '<path d="M20 12a8 8 0 1 1-2.3-5.7L20 8.5"/><path d="M20 3.5v5h-5"/>' ),
	size: icon( '<path d="M14 4h6v6"/><path d="M10 20H4v-6"/><path d="M20 4l-6.5 6.5"/><path d="M4 20l6.5-6.5"/>' ),
	drive: icon( '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2"/><path d="M3.5 11h6.5M14 11h6.5M12 14v6.5"/>' ),
	edit: icon( '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>' ),
	remove: icon( '<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6.5 7l1 12.5h9l1-12.5"/><path d="M10 11v5M14 11v5"/>' ),
};

const _anchor = new Vector3();

// rotate( degrees ) turns the selected item, select( entry ) selects one, drive( entry ) gets in,
// canDrive( entry ) says whether it's a vehicle or a machine.
export function createToolbar( { camera, canvas, models, panel, select, rotate, drive, canDrive } ) {

	const root = document.createElement( 'div' );
	root.className = 'selection-toolbar';
	root.hidden = true;
	root.setAttribute( 'role', 'toolbar' );
	root.setAttribute( 'aria-label', 'Selected item' );
	document.body.append( root );
	const row = document.createElement( 'div' );
	row.className = 'row';
	root.append( row );
	// A long press on touch would otherwise bring up the browser's menu.
	root.addEventListener( 'contextmenu', e => e.preventDefault() );
	// Wheel over the toolbar still reaches the scene.
	root.addEventListener( 'wheel', e => {

		e.preventDefault();
		canvas.dispatchEvent( new WheelEvent( 'wheel', e ) );

	}, { passive: false } );

	const button = ( name, text, title ) => {

		const element = document.createElement( 'button' );
		element.type = 'button';
		element.className = name;
		element.title = title;
		element.innerHTML = `${ ICONS[ name ] }<span>${ text }</span>`;
		row.append( element );
		return element;

	};
	const buttons = {
		left: button( 'left', 'Rotate left', 'Rotate left 15° (Shift+R). Hold, or Shift+click, for 90°' ),
		right: button( 'right', 'Rotate right', 'Rotate right 15° (R). Hold, or Shift+click, for 90°' ),
		size: button( 'size', 'Size', 'Type in the size' ),
		drive: button( 'drive', 'Drive', 'Get in and drive it (V)' ),
		edit: button( 'edit', 'Edit', 'All its settings (P)' ),
		remove: button( 'remove', 'Delete', 'Delete it (Delete key). You can undo it for a few seconds' ),
	};

	let entry = null;

	// A click turns by 15°, Shift+click or a held press by 90°.
	for ( const [ element, sign ] of [ [ buttons.left, - 1 ], [ buttons.right, 1 ] ] ) {

		let timer = null;
		let held = false;
		element.addEventListener( 'pointerdown', e => {

			if ( e.pointerType === 'mouse' && e.button !== 0 ) return;
			held = false;
			clearTimeout( timer );
			timer = setTimeout( () => {

				held = true;
				rotate( sign * 90 );

			}, HOLD_TIME );

		} );
		for ( const type of [ 'pointerup', 'pointerleave', 'pointercancel' ] ) element.addEventListener( type, () => clearTimeout( timer ) );
		element.addEventListener( 'click', e => {

			done( element );
			// The held press has turned it already.
			if ( held ) held = false;
			else rotate( sign * ( e.shiftKey ? 90 : 15 ) );

		} );

	}

	buttons.drive.addEventListener( 'click', () => {

		done( buttons.drive );
		if ( entry ) drive( entry );

	} );
	buttons.edit.addEventListener( 'click', () => {

		done( buttons.edit );
		if ( ! entry ) return;
		// Unfolded too, if it was folded away by its title.
		panel.gui.open();
		panel.focus( entry, true );

	} );
	buttons.remove.addEventListener( 'click', () => {

		done( buttons.remove );
		if ( entry ) remove( entry );

	} );
	buttons.size.addEventListener( 'click', () => {

		if ( editor.hidden ) openEditor();
		else closeEditor();

	} );

	// Leave the keyboard to the scene after a click, so Space or Enter don't press the button again.
	function done( element ) {

		element.blur();

	}

	// --- the size editor ---------------------------------------------------------------------

	const editor = document.createElement( 'form' );
	editor.className = 'size-editor';
	editor.hidden = true;
	root.append( editor );
	let editing = null; // { params, keys } the fields were filled from
	editor.addEventListener( 'submit', e => {

		e.preventDefault();
		if ( ! entry ) return;
		const values = {};
		for ( const input of editor.querySelectorAll( 'input' ) ) {

			const value = Number( input.value );
			if ( input.value.trim() !== '' && Number.isFinite( value ) ) values[ input.name ] = value;

		}

		models.setParams( entry, values );
		// Show what it became (sizes are kept within each kind's limits).
		fillEditor( true );

	} );
	editor.addEventListener( 'keydown', e => {

		if ( e.key !== 'Escape' ) return;
		e.preventDefault();
		closeEditor();

	} );

	// An area's number fields marked as its size (kinds.js) that apply to it as it is now.
	function sizeFields( target ) {

		const kind = getKind( target?.kind );
		if ( ! kind ) return [];
		return kind.fields.filter( f => f.size && ! f.options && ! f.type && ( ! f.when || f.when( target.params ) ) );

	}

	function openEditor() {

		buttons.size.setAttribute( 'aria-pressed', 'true' );
		editor.hidden = false;
		fillEditor( true );
		const input = editor.querySelector( 'input' );
		input?.focus();
		input?.select();

	}

	function closeEditor() {

		buttons.size.setAttribute( 'aria-pressed', 'false' );
		if ( editor.contains( document.activeElement ) ) document.activeElement.blur();
		editor.hidden = true;
		editing = null;

	}

	// Fill the fields from the entry's params; unless `all`, leave alone the one being typed in.
	function fillEditor( all ) {

		const fields = sizeFields( entry );
		const keys = fields.map( f => f.key ).join();
		if ( keys !== editing?.keys ) {

			editor.replaceChildren();
			for ( const field of fields ) {

				const label = document.createElement( 'label' );
				const name = document.createElement( 'span' );
				name.textContent = field.label ?? field.key;
				const input = document.createElement( 'input' );
				Object.assign( input, { type: 'number', name: field.key, step: 'any', inputMode: 'decimal' } );
				if ( field.min !== undefined ) input.min = field.min;
				if ( field.max !== undefined ) input.max = field.max;
				label.append( name, input );
				editor.append( label );

			}

			const apply = document.createElement( 'button' );
			apply.type = 'submit';
			apply.textContent = 'Apply';
			editor.append( apply );
			all = true;

		}

		for ( const input of editor.querySelectorAll( 'input' ) ) {

			if ( all || input !== document.activeElement ) input.value = String( entry.params[ input.name ] );

		}

		editing = { params: entry.params, keys };

	}

	// --- deleting, with undo -----------------------------------------------------------------

	let undoToast = null;

	// Remove an entry, with an Undo toast that puts it back as it was.
	function remove( target ) {

		const config = { ...models.toConfig( target ), inConfig: target.inConfig };
		const name = target.state.name;
		models.remove( target );
		undoToast?.dismiss();
		const element = document.createElement( 'div' );
		element.className = 'toast undo-toast';
		element.setAttribute( 'role', 'status' );
		const message = document.createElement( 'span' );
		message.textContent = `Deleted ${ name }`;
		const undo = document.createElement( 'button' );
		undo.type = 'button';
		undo.textContent = 'Undo';
		element.append( message, undo );
		document.body.append( element );
		const toast = {
			dismiss() {

				clearTimeout( timer );
				element.remove();
				if ( undoToast === toast ) undoToast = null;

			},
		};
		const timer = setTimeout( toast.dismiss, UNDO_TIME );
		undoToast = toast;
		undo.addEventListener( 'click', async () => {

			toast.dismiss();
			try {

				select( await models.load( config ) );

			} catch ( err ) {

				showToast( `Could not put ${ name } back: ${ err.message }` );

			}

		} );

	}

	// --- following the selection -------------------------------------------------------------

	const point = { x: 0, y: 0, visible: false };
	const library = document.getElementById( 'library' );
	let size = null;
	new ResizeObserver( () => {

		size = null;

	} ).observe( root );

	// Show the toolbar over `target` (null hides it), whose bounding box in the scene is `box`,
	// above any of `avoid` ({ x, y, r } on screen, e.g. the handles) under it.
	function update( target, box, avoid = [] ) {

		if ( target !== entry ) {

			entry = target;
			closeEditor();

		}

		const shown = !! entry && toScreen( box.getCenter( _anchor ).setY( box.max.y ), camera, canvas.getBoundingClientRect(), point ).visible;
		// Not under the library, on the left or (on a phone) at the bottom.
		let left = MARGIN;
		let floor = window.innerHeight;
		if ( shown && ! library.hidden ) {

			const sheet = library.getBoundingClientRect();
			if ( sheet.top <= 0 ) left = sheet.right + MARGIN;
			else floor = sheet.top;

		}

		const visible = shown && point.x > left && point.y < floor;
		if ( root.hidden !== ! visible ) root.hidden = ! visible;
		if ( ! visible ) return;

		const kind = getKind( entry.kind );
		setHidden( buttons.left, resizeShape( kind, entry.params ) === 'circle' );
		setHidden( buttons.right, resizeShape( kind, entry.params ) === 'circle' );
		setHidden( buttons.size, sizeFields( entry ).length === 0 );
		setHidden( buttons.drive, ! canDrive( entry ) );
		if ( ! editor.hidden && entry.params !== editing?.params ) fillEditor( false );

		// Measured again only when it changes size (other buttons, the size editor).
		size ??= { width: root.offsetWidth, height: root.offsetHeight };
		const { width, height } = size;
		// Beside the P panel rather than under it, where there's room (on a phone there isn't).
		let right = window.innerWidth - MARGIN;
		const gui = panel.gui.domElement;
		if ( gui.style.display !== 'none' ) {

			const r = gui.getBoundingClientRect();
			if ( r.left - MARGIN - left >= width && r.bottom > point.y - GAP - height * 2 && r.top < point.y ) right = r.left - MARGIN;

		}

		const x = Math.max( Math.min( point.x - width / 2, right - width ), left );
		// Up above whatever it would cover: the handles, and labels over the item (a pile's volume).
		const obstacles = [
			...avoid.map( p => ( { left: p.x - p.r, right: p.x + p.r, top: p.y - p.r, bottom: p.y + p.r } ) ),
			...[ ...document.querySelectorAll( LABELS ) ].filter( label => ! label.hidden ).map( label => label.getBoundingClientRect() ),
		];
		let bottom = Math.min( point.y - GAP, floor - MARGIN );
		for ( let i = 0; i < 4; i ++ ) {

			const top = bottom - height;
			const hit = obstacles.find( o => o.right > x && o.left < x + width && o.top < bottom && o.bottom > top );
			if ( ! hit ) break;
			bottom = hit.top - 4;

		}

		const y = Math.max( MARGIN, bottom - height );
		root.style.transform = `translate( ${ Math.round( x ) }px, ${ Math.round( y ) }px )`;

	}

	return {
		update,
		remove,
		// Esc in the size editor, and for tests.
		closeEditor,
		get editorOpen() {

			return ! editor.hidden;

		},
	};

}

function setHidden( element, hidden ) {

	if ( element.hidden !== hidden ) element.hidden = hidden;

}
