import { SITE } from './config.js';
import { itemConfig } from './library.js';
import { toast } from './placement.js';

// Library items you place are saved in this browser and come back next time. Export and Import
// move a layout between browsers, or into the repository as a file.
//
// A layout is { version: 2, site, lat, lon, items: [ model configs ], extras: { name: data } }.
// Extras are other modules' saved state that isn't a placed item, e.g. ground dug by an
// excavator: registerExtra( name, { save, load, clear } ) and call changed() when it changes.
// Layouts saved before version 2 are just the items array.
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

	// name -> { save() -> data or null, load( data, { merge } ), clear() }
	const extras = new Map();
	// Saved extras whose module hasn't registered (yet); kept in every save like unloaded items.
	let pendingExtras = {};
	const extrasData = () => {

		const out = { ...pendingExtras };
		for ( const [ name, extra ] of extras ) {

			const value = extra.save();
			if ( value != null ) out[ name ] = value;
			else delete out[ name ];

		}

		return out;

	};

	const data = () => ( { version: 2, site: SITE.name, lat: SITE.lat, lon: SITE.lon, items: current(), extras: extrasData() } );

	// Off while viewing someone else's shared layout, so it doesn't replace yours.
	let localSaving = true;
	const listeners = new Set();
	const write = () => {

		if ( restoring || stale ) return;
		if ( localSaving ) storage( () => localStorage.setItem( key, JSON.stringify( data() ) ) );
		for ( const listener of listeners ) listener();

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

	async function loadExtras( values = {}, options = {} ) {

		for ( const [ name, value ] of Object.entries( values ) ) {

			const extra = extras.get( name );
			if ( ! extra ) {

				pendingExtras[ name ] = value;
				continue;

			}

			try {

				await extra.load( value, options );

			} catch ( err ) {

				onError( `Could not load the saved ${ name }: ${ err.message }` );

			}

		}

	}

	function clearAll() {

		unloaded = [];
		pendingExtras = {};
		for ( const entry of placed() ) models.remove( entry );
		for ( const extra of extras.values() ) extra.clear();

	}

	return {

		async restore() {

			const saved = parse( storage( () => JSON.parse( localStorage.getItem( key ) ) ) );
			if ( ! saved ) return;
			restoring = true;
			const failed = await load( saved.items );
			unloaded = failed;
			await loadExtras( saved.extras );
			restoring = false;
			if ( failed.length ) onError( `${ failed.length } of ${ saved.items.length } saved items could not be loaded. They stay saved and will be tried again next time.` );
			save();

		},

		// Saved state of another module (see the top of this file). If a saved layout already
		// has data under this name, it's loaded now.
		registerExtra( name, extra ) {

			extras.set( name, extra );
			if ( name in pendingExtras ) {

				const value = pendingExtras[ name ];
				delete pendingExtras[ name ];
				loadExtras( { [ name ]: value } );

			}

		},

		// An extra's state changed: save soon.
		changed() {

			save();

		},

		// The whole layout, as saved and exported.
		getData: data,

		// Replace everything placed with another layout (e.g. one opened from your account).
		// Returns how many items could not be loaded.
		async replace( value ) {

			const next = parse( value );
			if ( ! next ) throw new Error( 'not a layout' );
			restoring = true;
			clearAll();
			const failed = await load( next.items );
			unloaded = failed;
			await loadExtras( next.extras );
			restoring = false;
			save();
			return failed.length;

		},

		// Called (debounced) after every save, e.g. to save to your account as well.
		onChange( listener ) {

			listeners.add( listener );
			return () => listeners.delete( listener );

		},

		setLocalSaving( on ) {

			localSaving = on;
			if ( on ) save();

		},

		export() {

			const link = document.createElement( 'a' );
			link.href = URL.createObjectURL( new Blob( [ JSON.stringify( data(), null, '\t' ) ], { type: 'application/json' } ) );
			link.download = `${ SITE.name.toLowerCase().replace( /\W+/g, '-' ) }-layout.json`;
			link.click();
			setTimeout( () => URL.revokeObjectURL( link.href ), 1000 );

		},

		async import( file ) {

			try {

				const imported = parse( JSON.parse( await file.text() ) );
				if ( ! imported ) throw new Error( 'no items' );
				const { items } = imported;

				// Skip items already placed at the same spot, so importing a file twice doesn't stack copies.
				const existing = new Set( current().map( fingerprint ) );
				const fresh = items.filter( config => ! existing.has( fingerprint( config ) ) );
				const failed = await load( fresh );
				unloaded.push( ...failed );
				await loadExtras( imported.extras, { merge: true } );
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

			clearAll();
			save();

		},

	};

}

// A saved or exported layout in either format, as { items, extras }, or null.
function parse( value ) {

	if ( Array.isArray( value ) ) return { items: value, extras: {} };
	if ( value && Array.isArray( value.items ) ) return { items: value.items, extras: value.extras ?? {} };
	return null;

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
	return [ config.kind ?? config.library ?? config.url ?? config.procedural, round( config.east ), round( config.north ), round( config.heading ) ].join( '|' );

}

// localStorage can throw in private windows; the layout just isn't saved then.
function storage( fn ) {

	try {

		return fn();

	} catch {

		return null;

	}

}
