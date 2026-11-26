import './shop.css';
import { COUNTRIES, GROUPS, ITEMS, TPU_PRICE, checkCart, itemOf, lineName, money, subtotal, tierOf, unitPrice } from './shop-catalog.js';

// The made-by-hand shop (docs/world-drive.md, "Shop"): coasters, keychains and stickers the owner
// makes in BC, from a button under the Garage and the Supporter Pass (on the globe's panel and in
// the pause menu) that opens a window built like the pass's. What's for sale is the shared catalog
// (shop-catalog.js); the postage and delivery times are the Worker's (GET /api/shop), asked for as
// the window first opens. Checkout is Stripe's page, made by the Worker (POST /api/shop/checkout),
// which collects the address; the page comes back with ?shop=done (thanks) or ?shop=cancelled (the
// bag as it was, kept in this browser till then). Only shown while the Worker says the shop is open
// (/api/config's shop).

const BAG_KEY = 'wd-shop-bag';
const COUNTRY_KEY = 'wd-shop-country';
const COUNTRY_NAMES = { CA: 'Canada', US: 'the US' };

let dialog = null;
let shipping = null;
let asked = null;
let bag = [];
let country = 'CA';
let onOpen = () => {};
let onCheckout = () => {};

// The Shop buttons, after each row of the Garage and Supporter Pass buttons (garage.js's
// .ride-actions), and the thanks once Stripe's checkout comes back paid. opened(): each time the
// window opens; checkout(): each time Checkout goes on to Stripe (main.js counts both for the play
// stats).
export function setUpShop( { opened = () => {}, checkout: started = () => {} } = {} ) {

	onOpen = opened;
	onCheckout = started;
	bag = readBag();
	country = read( COUNTRY_KEY ) === 'US' ? 'US' : 'CA';
	for ( const row of document.querySelectorAll( '.ride-actions' ) ) {

		const button = document.createElement( 'button' );
		button.type = 'button';
		button.className = 'shop-open';
		button.innerHTML = `<img src="${ asset( 'shop/coasters-mixed.webp' ) }" alt="" loading="lazy"><span class="words"><b>Made-by-hand shop</b><span>Coasters, keychains &amp; stickers I make in BC</span></span><span class="go">Shop ›</span>`;
		button.addEventListener( 'click', () => openShop() );
		row.after( button );

	}

	const params = new URLSearchParams( location.search );
	const back = params.get( 'shop' );
	if ( back === 'done' || back === 'cancelled' ) {

		params.delete( 'shop' );
		const rest = params.toString();
		history.replaceState( history.state, '', `${ location.pathname }${ rest ? `?${ rest }` : '' }${ location.hash }` );
		if ( back === 'done' ) {

			bag = [];
			write( BAG_KEY, null );
			openShop( { thanks: true } );

		} else openShop();

	}

}

export function openShop( { thanks = false } = {} ) {

	dialog ??= build();
	render( thanks );
	if ( ! dialog.open ) {

		dialog.showModal();
		onOpen();

	}

	dialog.querySelector( '.close' ).focus();
	if ( ! thanks ) loadShipping();

}

function build() {

	const element = document.createElement( 'dialog' );
	element.id = 'shop';
	element.setAttribute( 'aria-labelledby', 'shop-title' );
	element.innerHTML = '<div class="sheet"></div>';
	element.addEventListener( 'click', event => event.target === element && element.close() );
	// Keys pressed here are the window's, not the game's: Esc closes it rather than driving on.
	element.addEventListener( 'keydown', event => event.stopPropagation() );
	document.body.append( element );
	return element;

}

// The postage and delivery times, once a page (and again after a failure).
async function loadShipping() {

	if ( shipping || asked ) return;
	asked = ( async () => {

		try {

			const res = await fetch( '/api/shop', { headers: { Accept: 'application/json' } } );
			const body = await res.json();
			shipping = res.ok && body.open ? body.shipping : false;

		} catch {

			shipping = null;

		}

		asked = null;
		if ( dialog?.open && ! dialog.querySelector( '.thanks' ) ) renderCheckout();

	} )();

}

function render( thanks ) {

	const sheet = dialog.querySelector( '.sheet' );
	if ( thanks ) {

		sheet.innerHTML = `
			<button type="button" class="close" aria-label="Close">&times;</button>
			<div class="thanks">
				<p class="badge">🛠 Made in BC, Canada</p>
				<h2 id="shop-title">Thank you!</h2>
				<p>Your order's in. I'll make it and post it to you, and Stripe has emailed your receipt. Thanks for helping keep World Drive free.</p>
				<button type="button" class="primary buy back">Back to driving</button>
			</div>`;
		sheet.querySelector( '.back' ).addEventListener( 'click', () => dialog.close() );

	} else {

		sheet.innerHTML = `
			<button type="button" class="close" aria-label="Close">&times;</button>
			<p class="badge">🛠 Made in BC, Canada</p>
			<h2 id="shop-title">The Shop</h2>
			<p class="lead">I make World Drive, and I make these too, on my own printers in British Columbia. <b>Every order helps keep the game free.</b></p>
			${ GROUPS.map( group => `<h3>${ group.name }</h3><ul class="items">${ ITEMS.filter( item => item.group === group.id ).map( row ).join( '' ) }</ul>` ).join( '' ) }
			<div class="checkout"></div>`;
		for ( const li of sheet.querySelectorAll( '.items li' ) ) wireRow( li );
		renderCheckout();

	}

	sheet.querySelector( '.close' ).addEventListener( 'click', () => dialog.close() );

}

// One item's row: its picture, words and price, its design (and for a coaster set, the TPU base),
// and Add.
function row( item ) {

	const designs = item.designs ? `<select aria-label="Design of the ${ item.name.toLowerCase() }">${ item.designs.map( design => `<option value="${ design.id }">${ design.name }</option>` ).join( '' ) }</select>` : '';
	const tpu = item.tpu ? `<label><input type="checkbox" class="tpu"> Soft-grip TPU base +${ money( TPU_PRICE ) }</label>` : '';
	return `<li data-id="${ item.id }">
		<img class="pic" src="${ asset( item.image ) }" alt="" loading="lazy">
		<span class="what"><b>${ item.name }</b><span>${ item.note }</span></span>
		<span class="price">${ money( item.price ) }</span>
		<span class="choose">${ designs }${ tpu }<button type="button" class="add" aria-label="Add the ${ item.name.toLowerCase() } to your bag">Add</button></span>
	</li>`;

}

function wireRow( li ) {

	const item = itemOf( li.dataset.id );
	const select = li.querySelector( 'select' );
	const pic = li.querySelector( '.pic' );
	// A coaster's picture follows the design picked.
	if ( select && item.group === 'coasters' ) select.addEventListener( 'change', () => {

		pic.src = asset( select.value === 'mixed' ? 'shop/coasters-mixed.webp' : `shop/coaster-${ select.value }.webp` );

	} );
	const add = li.querySelector( '.add' );
	add.addEventListener( 'click', () => {

		const line = { id: item.id, design: select?.value ?? null, tpu: !! li.querySelector( '.tpu' )?.checked, qty: 1 };
		const same = bag.find( kept => kept.id === line.id && kept.design === line.design && kept.tpu === line.tpu );
		if ( same ) same.qty = Math.min( 10, same.qty + 1 );
		else bag.push( line );
		saveBag();
		add.textContent = '✓ Added';
		add.classList.add( 'done' );
		setTimeout( () => {

			add.textContent = 'Add';
			add.classList.remove( 'done' );

		}, 1200 );
		renderCheckout();

	} );

}

// The bag, where it's going, the postage, the total and Checkout.
function renderCheckout() {

	const box = dialog?.querySelector( '.checkout' );
	if ( ! box ) return;
	const checked = bag.length ? checkCart( bag ) : { error: null };
	const lines = checked.lines ?? bag;
	const tier = lines.length ? tierOf( lines ) : null;
	const ship = shipping && tier ? shipping[ country ]?.[ tier ] : null;
	const sum = lines.length ? subtotal( lines ) : 0;
	let note = 'A free logo sticker comes with every order.';
	if ( shipping === false ) note = 'The shop\'s closed right now. Come back soon.';
	else if ( shipping === null && ! asked ) note = 'Couldn\'t get the postage just now. Close this and try again.';
	else if ( checked.error ) note = checked.error;
	box.innerHTML = `
		<h3 style="margin-top:0">Your bag</h3>
		${ bag.length ? `<ul class="bag">${ bag.map( ( line, i ) => `<li data-i="${ i }">
			<span class="name">${ lineName( line ) }</span>
			<span class="qty"><button type="button" class="less" aria-label="One fewer">−</button><span aria-live="polite">${ line.qty }</span><button type="button" class="more" aria-label="One more">+</button></span>
			<span class="price">${ money( unitPrice( line ) * line.qty ) }</span>
			<button type="button" class="remove" aria-label="Take ${ lineName( line ) } out">×</button>
		</li>` ).join( '' ) }</ul>` : '<p class="empty">Nothing yet. Add something above.</p>' }
		<div class="ship">Ship to <span class="seg" role="group" aria-label="Ship to">${ COUNTRIES.map( code => `<button type="button" data-country="${ code }" aria-pressed="${ code === country }">${ code === 'CA' ? 'Canada' : 'US' }</button>` ).join( '' ) }</span>
			<span>${ ship ? `${ ship.label } · ${ ship.days[ 0 ] }–${ ship.days[ 1 ] } business days` : '' }</span></div>
		<div class="sums">
			<span>Items</span><span>${ money( sum ) }</span>
			<span>Postage to ${ COUNTRY_NAMES[ country ] }</span><span>${ ship && lines.length ? money( ship.amount ) : '—' }</span>
			<span class="total">Total</span><span class="total">${ ship && lines.length ? money( sum + ship.amount ) : '—' }</span>
		</div>
		<button type="button" class="primary buy"${ ! bag.length || checked.error || ! ship ? ' disabled' : '' }>Checkout${ ship && lines.length && ! checked.error ? ` · ${ money( sum + ship.amount ) }` : '' }</button>
		<p class="say${ checked.error || shipping === false ? ' problem' : '' }" role="status">${ note } Prices in Canadian dollars.</p>`;
	for ( const li of box.querySelectorAll( '.bag li' ) ) {

		const line = bag[ Number( li.dataset.i ) ];
		li.querySelector( '.less' ).addEventListener( 'click', () => change( line, - 1 ) );
		li.querySelector( '.more' ).addEventListener( 'click', () => change( line, 1 ) );
		li.querySelector( '.remove' ).addEventListener( 'click', () => change( line, - line.qty ) );

	}

	for ( const button of box.querySelectorAll( '[data-country]' ) ) button.addEventListener( 'click', () => {

		country = button.dataset.country;
		write( COUNTRY_KEY, country );
		renderCheckout();

	} );
	box.querySelector( '.buy' ).addEventListener( 'click', checkout );

}

function change( line, by ) {

	line.qty = Math.min( 10, line.qty + by );
	if ( line.qty < 1 ) bag.splice( bag.indexOf( line ), 1 );
	saveBag();
	renderCheckout();

}

// To Stripe's checkout page for this bag, through the Worker.
async function checkout() {

	const box = dialog.querySelector( '.checkout' );
	const button = box.querySelector( '.buy' );
	button.disabled = true;
	button.textContent = 'One moment...';
	try {

		const res = await fetch( '/api/shop/checkout', {
			method: 'POST', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( { country, items: bag.map( ( { id, design, tpu, qty } ) => ( { id, ...( design ? { design } : {} ), tpu, qty } ) ) } ),
		} );
		const body = await res.json().catch( () => ( {} ) );
		if ( res.ok && typeof body.url === 'string' ) {

			onCheckout();
			location.assign( body.url );
			return;

		}

		throw new Error( body.error ?? `World Drive answered ${ res.status }.` );

	} catch ( err ) {

		renderCheckout();
		const again = dialog.querySelector( '.checkout .say' );
		again.textContent = err?.message && ! /fetch/i.test( err.message ) ? err.message : 'Couldn\'t reach World Drive. Check your connection.';
		again.classList.add( 'problem' );

	}


}

// The bag as kept in this browser (so it's still there after Stripe's checkout is cancelled), with
// anything the catalog doesn't sell any more left out.
function readBag() {

	try {

		const kept = JSON.parse( read( BAG_KEY ) ?? '[]' );
		return Array.isArray( kept ) ? kept.filter( line => itemOf( line?.id ) && Number.isInteger( line.qty ) && line.qty > 0 && line.qty <= 10 ).map( line => ( { id: line.id, design: line.design ?? null, tpu: line.tpu === true, qty: line.qty } ) ) : [];

	} catch {

		return [];

	}

}

function saveBag() {

	write( BAG_KEY, bag.length ? JSON.stringify( bag ) : null );

}

function read( key ) {

	try {

		return localStorage.getItem( key );

	} catch {

		return null;

	}

}

function write( key, value ) {

	try {

		if ( value === null ) localStorage.removeItem( key );
		else localStorage.setItem( key, value );

	} catch {

		// Private browsing, or storage off: the bag lasts this page only.

	}

}

function asset( path ) {

	return new URL( path, document.baseURI ).href;

}
