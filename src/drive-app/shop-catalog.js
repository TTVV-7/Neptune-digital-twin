// The made-by-hand shop's catalog (docs/world-drive.md, "Shop"): what's for sale, at what price, in
// which designs, and how an order ships. Shared by the page (shop.js, which shows it) and the Worker
// (worker/drive/shop.js, which charges for it), so a price is only ever written here: the Worker
// never takes a price from the page, only item ids, designs and how many.
//
// Prices are in Canadian cents. Everything is printed by hand in BC, Canada: the coasters and
// keychains on a 3D printer (their files are in the 3D-print-sandbox repository, worlddrive/), the
// stickers on a thermal printer.

export const CURRENCY = 'cad';
// The countries the shop ships to (Stripe's two-letter codes).
export const COUNTRIES = [ 'CA', 'US' ];
// The most of one thing, and the most lines, in one order: enough for anyone, small enough that a
// cart always fits in a Checkout Session's metadata (500 characters a value).
export const MAX_QTY = 10;
export const MAX_LINES = 12;
// A coaster set's soft-grip TPU base (its floor printed in TPU, the walls in PETG), per set.
export const TPU_PRICE = 200;

// The coasters' designs: the four open patterns (each with the mark in the middle), the two solid
// discs, the logo cut to its own shape, and a set of one of each open pattern.
export const COASTER_DESIGNS = [
	{ id: 'mixed', name: 'Mixed: one of each pattern', setOnly: true },
	{ id: 'topo', name: 'Topo map' },
	{ id: 'honeycomb', name: 'Honeycomb' },
	{ id: 'gyroid', name: 'Gyroid' },
	{ id: 'globe', name: 'Globe' },
	{ id: 'badge', name: 'Badge' },
	{ id: 'mark', name: 'Mark' },
	// The mark itself, die-cut to the globe and the road round it, the globe raised 1.2 mm
	// (wd_coaster_logo, 110 mm).
	{ id: 'logo', name: 'Logo: the globe and road' },
];

// One sticker's designs: the mark, or a ride from the game.
export const STICKER_DESIGNS = [
	{ id: 'logo', name: 'World Drive logo' },
	{ id: 'muscle-car', name: 'Muscle car' },
	{ id: 'neon-racer', name: 'Neon racer' },
	{ id: 'tuk-tuk', name: 'Tuk-tuk' },
	{ id: 'ice-cream-van', name: 'Ice-cream van' },
	{ id: 'police-cruiser', name: 'Police cruiser' },
];

// group: the heading it's under. parcel: it needs the coaster mailer (a tracked parcel or packet),
// not a letter. addOn: never sold on its own (a $1 sticker can't carry its postage). designs: the
// choices, the first the default. tpu: offers the TPU base.
export const ITEMS = [
	{ id: 'coaster-set', group: 'coasters', name: 'Coaster set of 4', note: 'Mixed patterns, or 4 of one design · 100 mm', price: 500, parcel: true, designs: COASTER_DESIGNS, tpu: true, image: 'shop/coasters-mixed.webp' },
	{ id: 'coaster', group: 'coasters', name: 'Single coaster', note: 'Any of the seven designs · about 100 mm', price: 300, parcel: true, designs: COASTER_DESIGNS.filter( design => ! design.setOnly ), image: 'shop/coaster-topo.webp' },
	{ id: 'keychain', group: 'keychains', name: 'Globe keychain', note: 'The mark, die-cut · 45 mm', price: 500, image: 'shop/keychain.webp' },
	{ id: 'keychain-nfc', group: 'keychains', name: 'NFC keychain', note: 'Tap it on a phone and World Drive opens · 50 mm', price: 700, image: 'shop/keychain-nfc.webp' },
	{ id: 'keychain-wordmark', group: 'keychains', name: 'Wordmark keychain', note: 'The mark and WORLD DRIVE · 80 × 35 mm', price: 500, image: 'shop/keychain-wordmark.webp' },
	{ id: 'stickers-10', group: 'stickers', name: '10 stickers', note: 'Rides from the game and the logo, black on white', price: 500, image: 'shop/stickers.webp' },
	{ id: 'sticker', group: 'stickers', name: 'One sticker', note: 'Pick a ride or the logo · add it to an order', price: 100, addOn: true, designs: STICKER_DESIGNS, image: 'shop/sticker-logo.webp' },
];

export const GROUPS = [
	{ id: 'coasters', name: 'Coasters · 3D printed' },
	{ id: 'keychains', name: 'Keychains · 3D printed' },
	{ id: 'stickers', name: 'Stickers · thermal printed, for indoors' },
];

export const itemOf = id => ITEMS.find( item => item.id === id ) ?? null;

// A cart as the page sends it, [ { id, design?, tpu?, qty } ], checked against the catalog: { lines }
// (the same lines merged, each { id, design, tpu, qty } with design null for an item without
// designs, tpu false where there's no base to choose), or { error } saying what's wrong. Nothing in
// it is trusted: an id or design that isn't the catalog's, a quantity that isn't 1 to MAX_QTY, or a
// cart of add-ons only, is an error.
export function checkCart( cart ) {

	if ( ! Array.isArray( cart ) || ! cart.length ) return { error: 'Your bag is empty' };
	if ( cart.length > MAX_LINES ) return { error: 'That\'s too many different things for one order' };
	const lines = [];
	for ( const asked of cart ) {

		if ( ! asked || typeof asked !== 'object' ) return { error: 'Something in your bag isn\'t for sale' };
		const item = itemOf( asked.id );
		if ( ! item ) return { error: 'Something in your bag isn\'t for sale' };
		let design = null;
		if ( item.designs ) {

			design = asked.design ?? item.designs[ 0 ].id;
			if ( ! item.designs.some( choice => choice.id === design ) ) return { error: `Pick a design for the ${ item.name.toLowerCase() }` };

		}

		const tpu = !! item.tpu && asked.tpu === true;
		const qty = asked.qty;
		if ( ! Number.isInteger( qty ) || qty < 1 || qty > MAX_QTY ) return { error: `Up to ${ MAX_QTY } of each` };
		const same = lines.find( line => line.id === item.id && line.design === design && line.tpu === tpu );
		if ( same ) {

			same.qty += qty;
			if ( same.qty > MAX_QTY ) return { error: `Up to ${ MAX_QTY } of each` };

		} else lines.push( { id: item.id, design, tpu, qty } );

	}

	if ( lines.every( line => itemOf( line.id ).addOn ) ) return { error: 'Single stickers come with another order. Add the 10 stickers, a keychain or coasters' };
	return { lines };

}

// What a line is called on the receipt and the packing list: "Coaster set of 4 (Topo map, TPU base)".
export function lineName( line ) {

	const item = itemOf( line.id );
	const design = item.designs?.find( choice => choice.id === line.design );
	const extras = [ design?.name, line.tpu ? 'TPU base' : null ].filter( Boolean );
	return extras.length ? `${ item.name } (${ extras.join( ', ' ) })` : item.name;

}

// One of a line's price in cents (the TPU base included).
export function unitPrice( line ) {

	return itemOf( line.id ).price + ( line.tpu ? TPU_PRICE : 0 );

}

export function subtotal( lines ) {

	return lines.reduce( ( sum, line ) => sum + unitPrice( line ) * line.qty, 0 );

}

// How the order ships: 'parcel' when there's anything that needs the coaster mailer, else 'small'
// (a letter in Canada; the smallest packet to the US, where goods can't go as letters).
export function tierOf( lines ) {

	return lines.some( line => itemOf( line.id ).parcel ) ? 'parcel' : 'small';

}

// Cents as the page shows them: "$5", "$12.50" (all prices are CA$; the page says so once).
export function money( cents ) {

	return `$${ ( cents / 100 ).toFixed( 2 ).replace( /\.00$/, '' ) }`;

}

// A cart in few characters, for the Checkout Session's metadata (the webhook reads the order back
// from it): "coaster-set:topo:t:1,keychain::0:2".
export function packCart( lines ) {

	return lines.map( line => `${ line.id }:${ line.design ?? '' }:${ line.tpu ? 't' : '0' }:${ line.qty }` ).join( ',' );

}

// packCart's string back to a cart for checkCart, or null when it isn't one.
export function unpackCart( text ) {

	if ( typeof text !== 'string' || ! text || text.length > 500 ) return null;
	const cart = [];
	for ( const part of text.split( ',' ) ) {

		const [ id, design, tpu, qty ] = part.split( ':' );
		if ( qty === undefined || ! /^\d{1,2}$/.test( qty ) ) return null;
		cart.push( { id, ...( design ? { design } : {} ), tpu: tpu === 't', qty: Number( qty ) } );

	}

	return cart;

}
