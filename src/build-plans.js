import { FREE_ITEMS } from './product.js';

// World Drive Build's plans as people are told about them (docs/build.md): their names, what each
// includes and its limits, in one place for the dashboard (src/build-home/main.js), the editor's
// Build Pro dialog (premium.js) and any other page that shows them, so no two pages disagree. The
// limits are the server's (worker/drive/build.js's limitsOf: BUILD_FREE_MONTHLY,
// BUILD_PRO_MONTHLY, BUILD_LAYOUT_LIMIT): change them together.
//
// Prices aren't here. They come from the server with everything else about buying
// (premium.billing: { enabled, monthly, annual, portal }, billing.js), so a page never shows a
// price Stripe wouldn't charge, and says Build Pro opens soon while it isn't on sale.
//
// While buying is hidden (the server's BUILD_SALES isn't 'on': premium.billing.hidden, with no
// prices), a page says nothing about buying at all: no prices, no subscribing, no "opens soon".
// It shows the plan an account is on and what each includes, and NOT_FOR_SALE where it must say
// why a free account can't have something.

export const LIMITS = {
	free: { items: FREE_ITEMS.size, views: 15, projects: 1 },
	pro: { views: 300, projects: 200 },
};

export const PLANS = {
	free: {
		name: 'Free',
		includes: [ `${ LIMITS.free.items } everyday items`, `${ LIMITS.free.views } 3D map views a month`, `${ LIMITS.free.projects } project` ],
		blurb: `${ LIMITS.free.items } everyday site pieces, ${ LIMITS.free.views } 3D map views a month, ${ LIMITS.free.projects } saved project.`,
	},
	pro: {
		name: 'Build Pro',
		includes: [ 'The whole library and sets', `${ LIMITS.pro.views } 3D map views a month`, `${ LIMITS.pro.projects } projects`, 'Share links', 'Your company logo on the equipment', 'Build with Claude' ],
		blurb: `The whole library and sets, ${ LIMITS.pro.views } 3D map views a month, ${ LIMITS.pro.projects } projects, share links, your company logo and Build with Claude.`,
	},
	owner: {
		name: 'Owner',
		includes: [ 'Everything', '3D map views that are never counted' ],
		blurb: 'Everything, with 3D map views that are never counted.',
	},
};

// Build Pro in a phrase, to follow "Build Pro:" or "plus".
export const PRO_PHRASE = `the whole library and sets, ${ LIMITS.pro.views } 3D map views a month, ${ LIMITS.pro.projects } projects, share links, your company logo and Build with Claude`;

// Where the account's billing is shown in full (the account page, made separately).
export const BILLING_PAGE = '/build/account/#billing';

export const SOON = 'Build Pro opens soon.';

// Buying hidden (premium.billing.hidden): what's said in place of any way to buy.
export const NOT_FOR_SALE = 'Build Pro isn\'t available to buy right now.';

// Whether the server has buying hidden (billing.js's billingFor: BUILD_SALES isn't 'on').
export function salesHidden( billing ) {

	return billing?.hidden === true;

}

// The sentence that goes by every button that subscribes: Stripe renews it until it's cancelled,
// and people should know that before they press.
export function renewalNote( interval ) {

	return `Renews automatically every ${ interval === 'year' ? 'year' : 'month' } until you cancel. Cancel any time in your account.`;

}

// A choice's label: "US$5/month", or "US$50/year - 2 months free" (the yearly price is ten months').
export function intervalLabel( billing, interval ) {

	return interval === 'year' ? `${ billing.annual } - 2 months free` : billing.monthly;

}

// The monthly or yearly choice for subscribing, and the renewal sentence that follows it: { choices,
// renews, interval() }. The caller puts its button between the two. Yearly to begin with: it's the
// better deal. name: the radio buttons' name, one per page.
export function intervalChoice( billing, name ) {

	const choices = document.createElement( 'div' );
	choices.className = 'intervals';
	choices.setAttribute( 'role', 'radiogroup' );
	choices.setAttribute( 'aria-label', 'Billed' );
	const renews = document.createElement( 'p' );
	renews.className = 'small renews';
	for ( const interval of [ 'year', 'month' ] ) {

		const label = document.createElement( 'label' );
		const input = Object.assign( document.createElement( 'input' ), { type: 'radio', name, value: interval, checked: interval === 'year' } );
		const text = document.createElement( 'span' );
		text.textContent = `${ interval === 'year' ? 'Yearly' : 'Monthly' }: ${ intervalLabel( billing, interval ) }`;
		input.addEventListener( 'change', () => renews.textContent = renewalNote( interval ) );
		label.append( input, text );
		choices.append( label );

	}

	renews.textContent = renewalNote( 'year' );
	return { choices, renews, interval: () => choices.querySelector( 'input:checked' )?.value === 'month' ? 'month' : 'year' };

}

// A date as the dashboard says it: "3 Jan 2027".
export function dateOf( time ) {

	return new Date( time ).toLocaleDateString( 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' } );

}
