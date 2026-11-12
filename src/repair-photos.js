import { loadConfig } from './cloud.js';
import { sendForEveryone } from './placements.js';
import { isTyping } from './walk.js';

// Photos of the B2D2 model's repair areas, in the area editor's panel (repair-areas.js): a strip
// of small pictures of the picked area, each opening large with its caption, the stage it shows
// and the day it was taken; "Add photos" for the admin. A photo is kept on the site
// (worker/area-photos.js) as it was taken, with a copy to look at on screen and a small one for
// the strip, both made here before it's sent. Anyone sees them; adding, captioning and deleting
// ask for the admin passcode, as saving areas does, and happen at once (not with Save for
// everyone). Without a server, or on a copy of the site with no photo storage, there are none.

const API = new URL( 'api/area-photos/', document.baseURI );
const TIMEOUT = 15000;
// The copies' longest side (px) and JPEG quality.
const VIEW = { size: 2000, quality: 0.85 };
const THUMB = { size: 360, quality: 0.75 };
// As the server has it (worker/area-photos.js).
const MAX_FULL = 40 * 1024 * 1024;
const TYPES = [ 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif' ];

const day = time => {

	const d = new Date( time );
	return `${ d.getFullYear() }-${ String( d.getMonth() + 1 ).padStart( 2, '0' ) }-${ String( d.getDate() ).padStart( 2, '0' ) }`;

};

// onChange( model, area ): an area's photos were listed, added to or taken from.
export function createAreaPhotos( { toast, onChange } ) {

	// model -> area id -> its photos, oldest first.
	const photos = new Map();
	const of = ( model, area ) => photos.get( model )?.get( area ) ?? [];
	const url = ( model, photo, kind ) => new URL( `${ model }/${ encodeURIComponent( photo.area ) }/${ photo.id }/${ kind }`, API ).href;
	// The area the panel shows: { model, area, stage, name, locked } (locked: why none can be added).
	let shown = null;
	let busy = '';

	// ---------- The strip in the panel ----------

	const section = document.createElement( 'div' );
	section.className = 'photos';
	section.innerHTML = `
		<div class="photos-head"><span class="label"></span><button type="button" class="add-photos">Add photos</button></div>
		<div class="strip"></div>
		<p class="photos-note" hidden></p>
		<input type="file" accept="image/*" multiple hidden>
	`;
	const strip = section.querySelector( '.strip' );
	const input = section.querySelector( 'input' );
	const addButton = section.querySelector( '.add-photos' );
	addButton.addEventListener( 'click', () => input.click() );
	input.addEventListener( 'change', () => {

		const files = [ ...input.files ];
		input.value = '';
		if ( files.length && shown ) add( shown, files );

	} );

	function render() {

		section.hidden = ! shown;
		if ( ! shown ) return;
		const list = of( shown.model, shown.area );
		section.querySelector( '.label' ).textContent = list.length ? `Photos (${ list.length })` : 'Photos';
		addButton.disabled = !! busy || !! shown.locked;
		addButton.title = shown.locked || 'Photos of this panel, from this device';
		const note = section.querySelector( '.photos-note' );
		note.hidden = ! busy && ! shown.locked;
		note.textContent = busy || shown.locked || '';
		strip.replaceChildren( ...list.map( ( photo, i ) => {

			const button = document.createElement( 'button' );
			button.type = 'button';
			button.title = [ photo.caption, photo.stage, photo.taken ].filter( Boolean ).join( ' · ' ) || 'Photo';
			const img = Object.assign( document.createElement( 'img' ), { src: url( shown.model, photo, 'thumb' ), alt: button.title, loading: 'lazy' } );
			button.append( img );
			button.addEventListener( 'click', () => open( shown.model, shown.area, i ) );
			return button;

		} ) );

	}

	// ---------- Sending ----------

	// The picture, drawn the way up it was taken, no bigger than `size` on its longest side.
	async function copy( bitmap, { size, quality } ) {

		const scale = Math.min( 1, size / Math.max( bitmap.width, bitmap.height ) );
		const canvas = Object.assign( document.createElement( 'canvas' ), { width: Math.max( 1, Math.round( bitmap.width * scale ) ), height: Math.max( 1, Math.round( bitmap.height * scale ) ) } );
		const ctx = canvas.getContext( '2d' );
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage( bitmap, 0, 0, canvas.width, canvas.height );
		return new Promise( ( resolve, reject ) => canvas.toBlob( blob => blob ? resolve( blob ) : reject( new Error( 'no copy' ) ), 'image/jpeg', quality ) );

	}

	async function add( { model, area, stage }, files ) {

		let done = 0;
		const failed = [];
		for ( const [ i, file ] of files.entries() ) {

			busy = `Sending photo ${ i + 1 } of ${ files.length }…`;
			render();
			const problem = await send( model, area, stage, file );
			if ( problem ) failed.push( `${ file.name }: ${ problem }` );
			else done ++;
			// The passcode was wrong or there's nowhere to send them: the rest would go the same way.
			if ( problem && /passcode|isn't set up|live site|photo storage/i.test( problem ) ) break;

		}

		busy = '';
		render();
		if ( done ) onChange?.( model, area );
		toast?.( failed.length
			? `${ done ? `${ done } photo${ done === 1 ? '' : 's' } added. ` : '' }Not added: ${ failed.join( '; ' ) }`
			: `${ done } photo${ done === 1 ? '' : 's' } added, for everyone to see` );

	}

	// Resolves to what went wrong, or nothing.
	async function send( model, area, stage, file ) {

		const type = file.type || ( /\.hei[cf]$/i.test( file.name ) ? 'image/heic' : '' );
		if ( ! TYPES.includes( type ) ) return 'not a photo (JPEG, PNG, WebP or HEIC)';
		if ( file.size > MAX_FULL ) return 'over 40 MB';
		let bitmap;
		try {

			bitmap = await createImageBitmap( file, { imageOrientation: 'from-image' } );

		} catch {

			return 'this browser can\'t open it (save it as a JPEG first)';

		}

		let view, thumb;
		try {

			[ view, thumb ] = await Promise.all( [ copy( bitmap, VIEW ), copy( bitmap, THUMB ) ] );

		} catch {

			return 'couldn\'t be shrunk for the screen';

		}

		const details = { stage: stage ?? '', taken: day( file.lastModified || Date.now() ), caption: '', width: bitmap.width, height: bitmap.height };
		bitmap.close?.();
		const base = new URL( `${ model }/${ encodeURIComponent( area ) }`, API );
		const made = await sendForEveryone( 'POST', base, details );
		if ( ! made.ok ) return made.message;
		const photo = made.body;
		for ( const [ kind, blob ] of [ [ 'thumb', thumb ], [ 'view', view ], [ 'full', file.type === type ? file : new Blob( [ file ], { type } ) ] ] ) {

			const sent = await sendForEveryone( 'PUT', `${ base }/${ photo.id }/${ kind }`, blob );
			if ( ! sent.ok ) return sent.message;

		}

		photo.size = file.size;
		if ( ! photos.has( model ) ) photos.set( model, new Map() );
		const list = photos.get( model ).get( area ) ?? [];
		photos.get( model ).set( area, [ ...list, photo ] );
		return null;

	}

	// ---------- One photo, large ----------

	const viewer = document.createElement( 'div' );
	viewer.id = 'area-photo';
	viewer.hidden = true;
	viewer.setAttribute( 'role', 'dialog' );
	viewer.setAttribute( 'aria-label', 'Photo' );
	viewer.innerHTML = `
		<button type="button" class="close" title="Close (Esc)">×</button>
		<button type="button" class="previous" title="Previous (←)">‹</button>
		<figure>
			<img alt="">
			<figcaption>
				<span class="meta"></span>
				<input class="caption" maxlength="500" placeholder="Add a caption" aria-label="Caption">
				<span class="actions"><a class="full" target="_blank" rel="noopener">Full size</a><button type="button" class="delete">Delete</button></span>
			</figcaption>
		</figure>
		<button type="button" class="next" title="Next (→)">›</button>
	`;
	document.body.append( viewer );
	const v = selector => viewer.querySelector( selector );
	let at = null; // { model, area, index }

	const current = () => at && of( at.model, at.area )[ at.index ];

	function open( model, area, index ) {

		const list = of( model, area );
		if ( ! list.length ) return close();
		at = { model, area, index: ( index + list.length ) % list.length };
		const photo = current();
		viewer.hidden = false;
		v( 'img' ).src = url( model, photo, 'view' );
		v( 'img' ).alt = photo.caption || 'Photo of the panel';
		v( '.meta' ).textContent = [ shown?.area === area ? shown.name : '', photo.stage, photo.taken, list.length > 1 ? `${ at.index + 1 } of ${ list.length }` : '' ].filter( Boolean ).join( ' · ' );
		v( '.caption' ).value = photo.caption ?? '';
		v( '.full' ).href = url( model, photo, 'full' );
		v( '.full' ).textContent = `Full size${ photo.size ? ` (${ ( photo.size / 1048576 ).toFixed( 1 ) } MB)` : '' }`;
		v( '.previous' ).hidden = v( '.next' ).hidden = list.length < 2;

	}

	function close() {

		at = null;
		viewer.hidden = true;
		v( 'img' ).removeAttribute( 'src' );

	}

	v( '.close' ).addEventListener( 'click', close );
	v( '.previous' ).addEventListener( 'click', () => at && open( at.model, at.area, at.index - 1 ) );
	v( '.next' ).addEventListener( 'click', () => at && open( at.model, at.area, at.index + 1 ) );
	// A click on the dark round the picture closes it.
	viewer.addEventListener( 'click', e => {

		if ( e.target === viewer ) close();

	} );
	v( '.caption' ).addEventListener( 'change', async () => {

		const photo = current();
		const caption = v( '.caption' ).value.trim();
		if ( ! photo || caption === ( photo.caption ?? '' ) ) return;
		const { model, area } = at;
		const result = await sendForEveryone( 'PUT', new URL( `${ model }/${ encodeURIComponent( area ) }/${ photo.id }`, API ), { caption } );
		if ( result.ok ) photo.caption = caption;
		else if ( current() === photo ) v( '.caption' ).value = photo.caption ?? '';
		toast?.( result.ok ? 'Caption saved for everyone' : result.message );
		render();

	} );
	v( '.delete' ).addEventListener( 'click', async () => {

		const photo = current();
		if ( ! photo || ! window.confirm( 'Delete this photo for everyone?' ) ) return;
		const { model, area, index } = at;
		const result = await sendForEveryone( 'DELETE', new URL( `${ model }/${ encodeURIComponent( area ) }/${ photo.id }`, API ) );
		if ( ! result.ok ) {

			toast?.( result.message );
			return;

		}

		photos.get( model ).set( area, of( model, area ).filter( p => p !== photo ) );
		toast?.( 'Photo deleted for everyone' );
		if ( of( model, area ).length ) open( model, area, Math.min( index, of( model, area ).length - 1 ) );
		else close();
		render();
		onChange?.( model, area );

	} );
	// Its keys are its own while it's open: Esc doesn't also unpick the area, arrows don't walk.
	window.addEventListener( 'keydown', e => {

		if ( ! at ) return;
		if ( e.key === 'Escape' ) close();
		else if ( isTyping( e ) ) return;
		else if ( e.key === 'ArrowLeft' ) open( at.model, at.area, at.index - 1 );
		else if ( e.key === 'ArrowRight' ) open( at.model, at.area, at.index + 1 );
		else return;
		e.stopImmediatePropagation();
		e.preventDefault();

	}, true );

	return {
		section,
		// The photos of a model's areas, from the site. Resolves to whether there are any.
		async load( model ) {

			if ( ! await loadConfig() ) return false;
			try {

				const res = await fetch( new URL( model, API ), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout( TIMEOUT ) } );
				if ( ! res.ok || ! /json/.test( res.headers.get( 'Content-Type' ) ?? '' ) ) return false;
				const byArea = new Map();
				for ( const photo of ( await res.json() ).photos ?? [] ) byArea.set( photo.area, [ ...( byArea.get( photo.area ) ?? [] ), photo ] );
				photos.set( model, byArea );
				render();
				return byArea.size > 0;

			} catch {

				return false;

			}

		},
		count: ( model, area ) => of( model, area ).length,
		areas: model => [ ...( photos.get( model )?.keys() ?? [] ) ].filter( area => of( model, area ).length ),
		// The area whose photos the panel shows (null: none).
		show( area ) {

			shown = area;
			render();

		},
		get open() {

			return !! at;

		},
		add: files => shown ? add( shown, files ) : Promise.resolve(),
		// An area that's gone for good takes its photos with it. Resolves to what went wrong, if anything.
		async removeAll( model, area ) {

			for ( const photo of of( model, area ) ) {

				const result = await sendForEveryone( 'DELETE', new URL( `${ model }/${ encodeURIComponent( area ) }/${ photo.id }`, API ) );
				if ( ! result.ok ) return result.message;
				photos.get( model ).set( area, of( model, area ).filter( p => p !== photo ) );

			}

			return null;

		},
	};

}
