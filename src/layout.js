import { SITE } from './config.js';
import { itemConfig } from './library.js';
import { toast } from './placement.js';

// Library items you place are saved in this browser and come back next time. Export and Import
// move a layout between browsers, or into the repository as a file.
export function setUpLayout( models, { getLibrary, onError } ) {

	const key = `neptune-twin.layout.${ SITE.name }`;
	// Items from MODELS in config.js load every time anyway, so they aren't saved here.
	const placed = () => models.entries.filter( entry => entry.library && ! entry.placing && ! entry.inConfig );

	// Saved items that haven't loaded (still downloading, or failing, e.g. a model file that
	// moved) are kept in every save rather than dropped.
	let unloaded = [];
	let restoring = false;
	// Another tab saved a different layout; writing ours would throw that away.
	let stale = false;

	const current = () => [ ...placed().map( e => models.toConfig( e ) ), ...unloaded ];
	const write = () => {

		if ( restoring || stale ) return;
		storage( () => localStorage.setItem( key, JSON.stringify( current() ) ) );

	};

	let timer = null;
	const flush = () => {

		if ( timer === null ) return;
		clearTimeout( timer );
		timer = null;
		write();

	};

	const save = ( { entry } = {} ) => {

		// The preview following the mouse changes every frame and isn't saved.
		if ( entry?.placing ) return;
		clearTimeout( timer );
		timer = setTimeout( flush, 300 );

	};

	models.addEventListener( 'add', save );
	models.addEventListener( 'change', save );
	models.addEventListener( 'remove', save );
	window.addEventListener( 'pagehide', flush );
	document.addEventListener( 'visibilitychange', () => {

		if ( document.hidden ) flush();

	} );
	window.addEventListener( 'storage', e => {

		if ( e.key !== key || stale ) return;
		stale = true;
		onError( 'This layout was changed in another tab. Reload to see those changes; changes made here are no longer saved.' );

	} );

	// Load configs; returns the ones that failed.
	async function load( items ) {

		const library = await getLibrary();
		const results = await Promise.allSettled( items.map( config => models.load( resolve( config, library ) ) ) );
		return items.filter( ( _, i ) => results[ i ].status === 'rejected' );

	}

	return {

		async restore() {

			const items = storage( () => JSON.parse( localStorage.getItem( key ) ) );
			if ( ! Array.isArray( items ) || items.length === 0 ) return;
			restoring = true;
			const failed = await load( items );
			unloaded = failed;
			restoring = false;
			if ( failed.length ) onError( `${ failed.length } of ${ items.length } saved items could not be loaded. They stay saved and will be tried again next time.` );
			save();

		},

		export() {

			const data = { site: SITE.name, lat: SITE.lat, lon: SITE.lon, items: current() };
			const link = document.createElement( 'a' );
			link.href = URL.createObjectURL( new Blob( [ JSON.stringify( data, null, '\t' ) ], { type: 'application/json' } ) );
			link.download = `${ SITE.name.toLowerCase().replace( /\W+/g, '-' ) }-layout.json`;
			link.click();
			setTimeout( () => URL.revokeObjectURL( link.href ), 1000 );

		},

		async import( file ) {

			try {

				const data = JSON.parse( await file.text() );
				const items = Array.isArray( data ) ? data : data.items;
				if ( ! Array.isArray( items ) ) throw new Error( 'no items' );

				// Skip items already placed at the same spot, so importing a file twice doesn't stack copies.
				const existing = new Set( current().map( fingerprint ) );
				const fresh = items.filter( config => ! existing.has( fingerprint( config ) ) );
				const failed = await load( fresh );
				unloaded.push( ...failed );
				save();

				const count = n => n === 1 ? '1 item' : `${ n } items`;
				const parts = [ `Imported ${ count( fresh.length - failed.length ) }` ];
				if ( items.length > fresh.length ) parts.push( `${ items.length - fresh.length } already placed` );
				if ( failed.length ) parts.push( `${ failed.length } could not be loaded` );
				toast( parts.join( ', ' ) );

			} catch ( err ) {

				onError( `Could not import ${ file.name }: ${ err.message }` );

			}

		},

		clear() {

			unloaded = [];
			for ( const entry of placed() ) models.remove( entry );
			save();

		},

	};

}

// Saved items refer to library items by id. If the library now makes an item differently (e.g. a
// built-in piece replaced by a downloaded model), use the current definition at the same spot.
function resolve( config, library ) {

	const item = config.library && library.find( i => i.id === config.library );
	if ( ! item ) return config;
	const same = item.procedural ? config.procedural === item.id : config.url === `library/${ item.file }`;
	if ( same ) return config;
	const { east, north, up, heading } = config;
	return itemConfig( item, { east, north, up: up ?? null, heading } );

}

function fingerprint( config ) {

	const round = v => Math.round( ( v ?? 0 ) * 10 ) / 10;
	return [ config.library ?? config.url ?? config.procedural, round( config.east ), round( config.north ), round( config.heading ) ].join( '|' );

}

// localStorage can throw in private windows; the layout just isn't saved then.
function storage( fn ) {

	try {

		return fn();

	} catch {

		return null;

	}

}
