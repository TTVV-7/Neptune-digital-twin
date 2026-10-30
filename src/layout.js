import { SITE } from './config.js';
import { toast } from './placement.js';

// Library items you place are saved in this browser and come back next time. Export and Import
// move a layout between browsers, or into the repository as a file.
export function setUpLayout( models, { onError } ) {

	const key = `neptune-twin.layout.${ SITE.name }`;
	const placed = () => models.entries.filter( entry => entry.library && ! entry.placing );

	let timer;
	const save = () => {

		clearTimeout( timer );
		timer = setTimeout( () => storage( () => localStorage.setItem( key, JSON.stringify( placed().map( e => models.toConfig( e ) ) ) ) ), 300 );

	};

	models.addEventListener( 'add', save );
	models.addEventListener( 'change', save );
	models.addEventListener( 'remove', save );

	async function load( items ) {

		const results = await Promise.allSettled( items.map( config => models.load( config ) ) );
		const failed = results.filter( r => r.status === 'rejected' ).length;
		if ( failed ) onError( `${ failed } of ${ items.length } saved items could not be loaded.` );

	}

	return {

		restore() {

			const items = storage( () => JSON.parse( localStorage.getItem( key ) ) );
			return Array.isArray( items ) ? load( items ) : Promise.resolve();

		},

		export() {

			const data = { site: SITE.name, lat: SITE.lat, lon: SITE.lon, items: placed().map( e => models.toConfig( e ) ) };
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
				await load( items );
				toast( `Imported ${ items.length } items` );

			} catch ( err ) {

				onError( `Could not import ${ file.name }: ${ err.message }` );

			}

		},

		clear() {

			for ( const entry of placed() ) models.remove( entry );

		},

	};

}

// localStorage can throw in private windows; the layout just isn't saved then.
function storage( fn ) {

	try {

		return fn();

	} catch {

		return null;

	}

}
