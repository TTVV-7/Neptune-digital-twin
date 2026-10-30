import { SITE } from './config.js';

// The Layouts dialog: this site's layouts in your account, with Open, Rename, Share link and
// Delete, and a form to save what's placed as a new one. It only draws and asks; cloud.js does
// the work through `actions`:
//   list() -> [ { id, name, updatedAt, shared, shareToken } ]
//   open( layout ), saveAsNew( name ) and remove( layout ) -> false if you said no to the
//   question they ask first; rename( layout, name ) -> the renamed layout; share( layout ) ->
//   token; unshare( layout ); shareLink( token ); currentId(); email()
export function createLayoutsDialog( actions ) {

	const dialog = el( 'dialog', 'cloud-dialog' );
	dialog.setAttribute( 'aria-labelledby', 'cloud-dialog-title' );

	const header = el( 'header' );
	const title = el( 'h2', '', 'Your layouts' );
	title.id = 'cloud-dialog-title';
	const close = button( '×', () => dialog.close(), 'close' );
	close.setAttribute( 'aria-label', 'Close' );
	header.append( title, close );
	const where = el( 'p', 'small' );

	const form = el( 'form', 'save-new' );
	const label = el( 'label', '', 'Save what\'s placed now as a new layout' );
	label.htmlFor = 'cloud-layout-name';
	const name = el( 'input' );
	Object.assign( name, { id: 'cloud-layout-name', name: 'name', maxLength: 100, required: true, placeholder: 'Layout name', autocomplete: 'off' } );
	const save = button( 'Save as new' );
	save.type = 'submit';
	const fields = el( 'div', 'fields' );
	fields.append( name, save );
	form.append( label, fields );

	const listTitle = el( 'h3', '', 'Saved in your account' );
	const list = el( 'ul', 'list' );
	const message = el( 'p', 'message' );
	message.setAttribute( 'role', 'status' );
	dialog.append( header, where, form, listTitle, list, message );
	document.body.append( dialog );

	let layouts = [];
	let renaming = null;
	let opener = null;

	form.addEventListener( 'submit', e => {

		e.preventDefault();
		run( async () => {

			const saved = await actions.saveAsNew( name.value.trim() );
			if ( ! saved ) return;
			name.value = '';
			say( `Saved "${ saved.name }". Changes now save to it as you go.` );
			await refresh();

		} );

	} );

	// Esc while renaming only stops the rename.
	dialog.addEventListener( 'cancel', e => {

		if ( ! renaming ) return;
		e.preventDefault();
		stopRenaming();

	} );
	dialog.addEventListener( 'close', () => {

		renaming = null;
		opener?.focus();

	} );

	// Run an action with the buttons disabled, showing what went wrong if it fails.
	async function run( action ) {

		dialog.classList.add( 'busy' );
		for ( const b of dialog.querySelectorAll( 'button:not(.close)' ) ) b.disabled = true;
		try {

			await action();

		} catch ( err ) {

			say( `That didn't work: ${ err.message }` );

		} finally {

			dialog.classList.remove( 'busy' );
			for ( const b of dialog.querySelectorAll( 'button' ) ) b.disabled = false;

		}

	}

	async function refresh() {

		layouts = await actions.list();
		render();

	}

	function render() {

		where.textContent = `${ SITE.name } · signed in as ${ actions.email() }`;
		list.replaceChildren( ...layouts.map( row ) );
		if ( layouts.length === 0 ) list.append( el( 'li', 'empty', 'Nothing saved yet. Name what\'s placed above and save it.' ) );

	}

	function row( layout ) {

		const item = el( 'li' );
		item.dataset.id = layout.id;
		const current = layout.id === actions.currentId();
		item.classList.toggle( 'current', current );

		const head = el( 'div', 'head' );
		if ( renaming === layout.id ) head.append( renameForm( layout ) );
		else head.append( el( 'span', 'name', layout.name ) );
		if ( current ) head.append( el( 'span', 'badge', 'Open here' ) );
		if ( layout.shared ) head.append( el( 'span', 'badge shared', 'Shared' ) );

		const meta = el( 'div', 'meta', `Saved ${ ago( layout.updatedAt ) }` );
		const buttons = el( 'div', 'actions' );
		buttons.append(
			button( 'Open', () => run( async () => {

				if ( await actions.open( layout ) === false ) return;
				dialog.close();

			} ), 'open', `Open ${ layout.name }` ),
			button( 'Rename', () => {

				renaming = layout.id;
				render();
				list.querySelector( '.rename input' )?.select();

			}, 'rename', `Rename ${ layout.name }` ),
		);
		if ( ! layout.shared ) {

			buttons.append( button( 'Share link', () => run( async () => {

				Object.assign( layout, { shared: true, shareToken: await actions.share( layout ) } );
				render();
				await copy( layout );

			} ), 'share-link', `Share ${ layout.name } by link` ) );

		}

		buttons.append( button( 'Delete', () => run( async () => {

			if ( await actions.remove( layout ) === false ) return;
			say( `Deleted "${ layout.name }".` );
			await refresh();
			name.focus();

		} ), 'delete', `Delete ${ layout.name }` ) );

		item.append( head, meta, buttons );
		if ( layout.shared ) item.append( shareBox( layout ) );
		return item;

	}

	// The link of a shared layout, ready to copy, and the way to turn it off.
	function shareBox( layout ) {

		const box = el( 'div', 'share' );
		const link = el( 'input' );
		Object.assign( link, { readOnly: true, value: actions.shareLink( layout.shareToken ) } );
		link.setAttribute( 'aria-label', `Share link for ${ layout.name }` );
		box.append(
			link,
			button( 'Copy', () => copy( layout ), 'copy', `Copy the link to ${ layout.name }` ),
			button( 'Stop sharing', () => run( async () => {

				await actions.unshare( layout );
				Object.assign( layout, { shared: false, shareToken: null } );
				render();
				focusRow( layout, '.share-link' );
				say( `"${ layout.name }" isn't shared any more. The old link no longer works.` );

			} ), 'unshare', `Stop sharing ${ layout.name }` ),
		);
		return box;

	}

	function renameForm( layout ) {

		const rename = el( 'form', 'rename' );
		const input = el( 'input' );
		Object.assign( input, { value: layout.name, maxLength: 100, required: true, autocomplete: 'off' } );
		input.setAttribute( 'aria-label', `New name for ${ layout.name }` );
		rename.append( input, button( 'Save' ), button( 'Cancel', stopRenaming ) );
		rename.querySelector( 'button' ).type = 'submit';
		rename.addEventListener( 'submit', e => {

			e.preventDefault();
			run( async () => {

				const saved = await actions.rename( layout, input.value.trim() );
				Object.assign( layout, saved );
				renaming = null;
				render();
				focusRow( layout, '.rename' );
				say( `Renamed to "${ saved.name }".` );

			} );

		} );
		return rename;

	}

	function stopRenaming() {

		const layout = layouts.find( l => l.id === renaming );
		renaming = null;
		render();
		if ( layout ) focusRow( layout, '.rename' );

	}

	// Buttons are drawn again after each change, so focus goes back to the one that matches.
	function focusRow( layout, selector ) {

		list.querySelector( `li[data-id="${ layout.id }"] ${ selector }` )?.focus();

	}

	async function copy( layout ) {

		const input = list.querySelector( `li[data-id="${ layout.id }"] .share input` );
		focusRow( layout, '.copy' );
		try {

			await navigator.clipboard.writeText( input.value );
			say( `Link to "${ layout.name }" copied. Anyone with it can view the layout, but not change it.` );

		} catch {

			input.focus();
			input.select();
			say( 'Press Ctrl+C (Cmd+C on a Mac) to copy the link.' );

		}

	}

	function say( text ) {

		message.textContent = text;

	}

	return {

		async open( from ) {

			opener = from ?? document.activeElement;
			document.exitPointerLock?.();
			say( '' );
			layouts = [];
			render();
			list.replaceChildren( el( 'li', 'empty', 'Loading...' ) );
			dialog.showModal();
			name.focus();
			await run( refresh );

		},

		isOpen: () => dialog.open,

	};

}

export function el( tag, className = '', text = '' ) {

	const element = document.createElement( tag );
	if ( className ) element.className = className;
	if ( text ) element.textContent = text;
	return element;

}

export function button( text, onClick, className = '', label = '' ) {

	const b = el( 'button', className, text );
	b.type = 'button';
	if ( label ) b.setAttribute( 'aria-label', label );
	if ( onClick ) b.addEventListener( 'click', onClick );
	return b;

}

function ago( time ) {

	const seconds = ( Date.now() - time ) / 1000;
	if ( seconds < 60 ) return 'just now';
	if ( seconds < 3600 ) return `${ Math.round( seconds / 60 ) } min ago`;
	if ( seconds < 86400 ) return `${ Math.round( seconds / 3600 ) } h ago`;
	return new Date( time ).toLocaleDateString( undefined, { year: 'numeric', month: 'short', day: 'numeric' } );

}
