import { PROCEDURAL_ITEMS } from './procedural.js';

// The asset library: vehicles, site trailers, dumpsters and other pieces at real scale, not tied
// to any one site. public/library/library.json lists downloaded models with their scale, which way
// their front faces and their licence credit (add more with `npm run add-asset`, see README).
// Built-in pieces are generated in code by procedural.js.

export const CATEGORY_ORDER = [
	'Vehicles',
	'Heavy equipment',
	'Cranes & lifts',
	'Material handling',
	'Site trailers & containers',
	'Waste',
	'Barriers & fencing',
	'Traffic control',
	'Site services',
	'Access & scaffolding',
	'Materials',
	'Race',
];

export async function loadLibrary() {

	let downloaded = [];
	try {

		const res = await fetch( new URL( 'library/library.json', document.baseURI ) );
		if ( res.ok ) downloaded = await res.json();

	} catch {

		// No catalog: the built-in pieces still work.

	}

	const rank = category => {

		const i = CATEGORY_ORDER.indexOf( category );
		return i === - 1 ? CATEGORY_ORDER.length : i;

	};

	return [ ...downloaded, ...PROCEDURAL_ITEMS ]
		.sort( ( a, b ) => rank( a.category ) - rank( b.category ) || a.category.localeCompare( b.category ) || a.name.localeCompare( b.name ) );

}

// Rotation about the vertical axis that turns a model's front (the axis named in the catalog,
// in glTF's Y-up frame) to face -Z, so heading 0 means it faces north.
export function frontToYaw( front = '-z' ) {

	return { '-z': 0, '+z': Math.PI, '+x': Math.PI / 2, '-x': - Math.PI / 2 }[ front ] ?? 0;

}

// Model config for placing a library item, in the same shape as MODELS in config.js.
export function itemConfig( item, placement ) {

	return {
		name: item.name,
		library: item.id,
		...( item.procedural ? { procedural: item.id } : { url: `library/${ item.file }`, scale: item.scale } ),
		front: item.front,
		// A crane stands and turns on its carrier rather than the middle of its box (see models.js).
		...( item.drive?.pivot ? { pivot: item.drive.pivot } : {} ),
		up: null,
		...placement,
	};

}
