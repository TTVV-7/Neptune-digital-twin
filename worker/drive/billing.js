import { HttpError, cleanText, isObject, json, readJson } from '../http.js';
import { currentAccount } from './accounts.js';
import { adminAccount } from './admin.js';
import { ACTIVE_STATUSES, buildPlan, webhookReady } from './supporter.js';
import { googleClientId } from './settings.js';
import { stripeApi, stripeSecret } from './stripe-api.js';
import { cleanUsername, usernameKey } from '../../src/drive-app/password-rules.js';

// Selling World Drive Build Pro (docs/build.md): a Stripe Checkout Session made here for the
// signed-in account, monthly or yearly, one person a subscription; Stripe's billing portal for
// cancelling, changing card or plan and invoices; and Pro given by the owner without paying
// (build_comps). What a payment does once it's made is the webhook's (supporter.js), shared with
// World Drive's Supporter Pass; this only starts payments.
//
// Settings (wrangler.drive.jsonc vars, or the dashboard; secrets in the dashboard only):
//   STRIPE_SECRET_KEY          secret: a restricted key (rk_live_...) with the permissions
//                              docs/build.md lists (stripe-api.js). A test-mode key sells in test mode.
//   BUILD_PRICE_MONTHLY        the monthly Price's id, price_... (public)
//   BUILD_PRICE_ANNUAL         the yearly Price's id, price_... (public)
//   BUILD_PRICE_LABEL_MONTHLY  the monthly price as the page shows it ('US$5/month' if unset)
//   BUILD_PRICE_LABEL_ANNUAL   the yearly price as the page shows it ('US$50/year' if unset)
//   BUILD_PORTAL_CONFIG        optional: Build Pro's own billing portal configuration, bpc_...;
//                              without it, the account's default portal
// Build Pro is on sale only when the key, both price ids (two different ones), Google's sign-in
// and the webhook's secret are all set and look right. Anything missing or wrong leaves it off,
// and the page says Build Pro opens soon: nothing is ever sold that the webhook can't record.

const PRICE_PATTERN = /^price_[A-Za-z0-9]{1,200}$/;
const PORTAL_PATTERN = /^bpc_[A-Za-z0-9]{1,200}$/;
const CUSTOMER_PATTERN = /^cus_[A-Za-z0-9]{1,200}$/;
const ACCOUNT_ID = /^[1-9][0-9]{0,14}$/;
const MAX_LABEL = 40;
const MAX_REASON = 200;

// The prices as the page shows them: { monthly, annual }.
export function priceLabels( env ) {

	return { monthly: label( env.BUILD_PRICE_LABEL_MONTHLY, 'US$5/month' ), annual: label( env.BUILD_PRICE_LABEL_ANNUAL, 'US$50/year' ) };

}

function label( value, fallback ) {

	return cleanText( typeof value === 'string' ? value : '', MAX_LABEL ) || fallback;

}

// { prices: { month, year } } when Build Pro can be sold, else null.
export function billingSettings( env ) {

	const month = text( env.BUILD_PRICE_MONTHLY );
	const year = text( env.BUILD_PRICE_ANNUAL );
	if ( ! stripeSecret( env ) || ! PRICE_PATTERN.test( month ) || ! PRICE_PATTERN.test( year ) || month === year ) return null;
	if ( ! googleClientId( env ) || ! webhookReady( env ) ) return null;
	return { prices: { month, year } };

}

// What the page is told about buying (premium.billing): { enabled, monthly, annual, portal }.
// enabled: Build Pro is on sale (billingSettings). monthly, annual: the prices as shown, always
// there, so the page never has a price of its own. portal: the account has a Stripe customer and
// the key is set, so POST billing/portal can open Stripe's billing portal for it.
export function billingFor( env, plan ) {

	const labels = priceLabels( env );
	return { enabled: !! billingSettings( env ), monthly: labels.monthly, annual: labels.annual, portal: !! plan?.customer && !! stripeSecret( env ) };

}

async function signedInAccount( context ) {

	const account = await currentAccount( context );
	if ( ! account ) throw new HttpError( 401, 'Sign in first' );
	return account;

}

const stripeDown = () => new HttpError( 502, 'Couldn\'t reach Stripe just now. Try again in a minute' );

// POST billing/checkout { interval: 'month' | 'year' }: { url }, Stripe's checkout page for Build
// Pro for the signed-in account. The Checkout Session carries the account (client_reference_id,
// and account_id in its metadata and its subscription's, with pass 'build', which is how the
// webhook knows it's Build Pro's and whose), one of Build Pro's two prices at quantity 1 (one
// named person; the buyer can't change it), Stripe Tax with tax ids for businesses, the Terms to
// accept (their link is set in Stripe's Dashboard), and the auto-renewal sentence by the button.
// 503 while Build Pro isn't on sale; 409 for an account that has a subscription running.
export async function postCheckout( context ) {

	const { request, env, url, now } = context;
	const account = await signedInAccount( context );
	const settings = billingSettings( env );
	if ( ! settings ) throw new HttpError( 503, 'Build Pro isn\'t on sale yet' );
	const body = await readJson( request, 1024 );
	const interval = isObject( body ) ? body.interval : null;
	const price = interval === 'month' || interval === 'year' ? settings.prices[ interval ] : null;
	if ( ! price ) throw new HttpError( 400, 'Choose monthly or yearly' );
	// Running already: as the checkout's purchase says, or its subscription, heard of first.
	const plan = await buildPlan( env, account, now );
	const running = await env.DB.prepare( 'SELECT 1 FROM subscriptions WHERE account_id = ? AND pass = \'build\' AND status IN ( \'active\', \'trialing\', \'past_due\' )' ).bind( account.id ).first();
	if ( plan.subscribed || running ) throw new HttpError( 409, 'You have Build Pro already. Manage it under Account, Billing.' );
	const labels = priceLabels( env );
	const params = customer => ( {
		mode: 'subscription',
		customer,
		client_reference_id: String( account.id ),
		metadata: { account_id: String( account.id ), pass: 'build' },
		subscription_data: { metadata: { account_id: String( account.id ), pass: 'build' } },
		line_items: [ { price, quantity: 1 } ],
		automatic_tax: { enabled: true },
		tax_id_collection: { enabled: true },
		// Stripe Tax needs the address the buyer types kept on the customer; a tax id needs the name
		// (a business's) kept too.
		customer_update: { address: 'auto', name: 'auto' },
		consent_collection: { terms_of_service: 'required' },
		custom_text: { submit: { message: `Build Pro renews automatically at ${ interval === 'year' ? labels.annual : labels.monthly } until you cancel. Cancel any time in Account, Billing: it ends at the end of the period you've paid for.` } },
		success_url: `${ url.origin }/build/account/?checkout=done#billing`,
		cancel_url: `${ url.origin }/build/?checkout=cancelled`,
	} );
	let customer = await customerOf( env, account, true );
	await clearCheckouts( env, customer );
	let session = await stripeApi( env, 'POST', '/v1/checkout/sessions', params( customer ) );
	// The stored customer was deleted in Stripe's Dashboard: a new one, once.
	if ( ! session.ok && session.body?.error?.param === 'customer' ) {

		await env.DB.prepare( 'UPDATE accounts SET stripe_customer = NULL WHERE id = ? AND stripe_customer = ?' ).bind( account.id, customer ).run();
		customer = await customerOf( env, account, false );
		session = await stripeApi( env, 'POST', '/v1/checkout/sessions', params( customer ) );

	}

	const link = typeof session.body?.url === 'string' ? session.body.url : '';
	if ( ! session.ok || ! link.startsWith( 'https://' ) ) throw stripeDown();
	return json( { url: link } );

}

// Stripe's own word on the customer, just before a new checkout, since the webhook may not have
// told us yet: a Build Pro subscription running there is a 409 too, and each of the customer's
// checkouts still open is expired, so two tabs (monthly in one, yearly in the other) can't both be
// paid for. One that can't be expired has just been paid (409). A customer deleted in Stripe's
// Dashboard has neither (postCheckout makes a new one). Stripe not answering is a 502: no checkout.
async function clearCheckouts( env, customer ) {

	const id = encodeURIComponent( customer );
	const subscriptions = await stripeApi( env, 'GET', `/v1/subscriptions?customer=${ id }&status=all&limit=100` );
	if ( ! subscriptions.ok && subscriptions.body?.error?.param === 'customer' ) return;
	if ( ! subscriptions.ok ) throw stripeDown();
	const running = listOf( subscriptions.body ).some( s => ACTIVE_STATUSES.includes( s?.status ) && s?.metadata?.pass === 'build' );
	if ( running ) throw new HttpError( 409, 'You have Build Pro already. Manage it under Account, Billing.' );
	const open = await stripeApi( env, 'GET', `/v1/checkout/sessions?customer=${ id }&status=open&limit=100` );
	if ( ! open.ok ) throw stripeDown();
	for ( const session of listOf( open.body ) ) {

		if ( typeof session?.id !== 'string' || ! /^cs_[A-Za-z0-9_]{1,250}$/.test( session.id ) ) continue;
		const expired = await stripeApi( env, 'POST', `/v1/checkout/sessions/${ encodeURIComponent( session.id ) }/expire` );
		if ( expired.status === 400 ) throw new HttpError( 409, 'A checkout of yours has just gone through. Give it a minute, then look under Account, Billing.' );
		if ( ! expired.ok ) throw stripeDown();

	}

}

// A Stripe list's items (its data), or none.
function listOf( body ) {

	return Array.isArray( body?.data ) ? body.data : [];

}

// The account's Stripe customer (cus_...): the one it has, or a new one with its email and name,
// kept on the account (accounts.stripe_customer) for every later checkout and the billing portal.
// Two checkouts started at once both end up with the first one kept. `once`: made with an
// Idempotency-Key, so a double click within the hour makes one customer, not two.
async function customerOf( env, account, once ) {

	const row = await env.DB.prepare( 'SELECT stripe_customer FROM accounts WHERE id = ?' ).bind( account.id ).first();
	if ( CUSTOMER_PATTERN.test( row?.stripe_customer ?? '' ) ) return row.stripe_customer;
	const made = await stripeApi( env, 'POST', '/v1/customers', {
		email: account.email || account.contact_email || undefined,
		name: account.name || account.username || undefined,
		metadata: { account_id: String( account.id ) },
	}, { idempotencyKey: once ? `build-customer-${ account.id }-${ Math.floor( Date.now() / 3600000 ) }` : undefined } );
	if ( ! made.ok || ! CUSTOMER_PATTERN.test( made.body?.id ?? '' ) ) throw stripeDown();
	await env.DB.prepare( 'UPDATE accounts SET stripe_customer = ? WHERE id = ? AND stripe_customer IS NULL' ).bind( made.body.id, account.id ).run();
	const kept = await env.DB.prepare( 'SELECT stripe_customer FROM accounts WHERE id = ?' ).bind( account.id ).first();
	return kept?.stripe_customer ?? made.body.id;

}

// POST billing/portal: { url }, Stripe's billing portal for the signed-in account's customer
// (cancel at the period's end, switch monthly and yearly, change the card, see invoices), coming
// back to the account page. BUILD_PORTAL_CONFIG picks Build Pro's own portal settings. 404 for an
// account that has never had a checkout (no customer).
export async function postPortal( context ) {

	const { env, url } = context;
	const account = await signedInAccount( context );
	if ( ! stripeSecret( env ) ) throw new HttpError( 503, 'Billing isn\'t set up yet' );
	const row = await env.DB.prepare( 'SELECT stripe_customer FROM accounts WHERE id = ?' ).bind( account.id ).first();
	if ( ! CUSTOMER_PATTERN.test( row?.stripe_customer ?? '' ) ) throw new HttpError( 404, 'There\'s no billing for this account yet' );
	const configuration = text( env.BUILD_PORTAL_CONFIG );
	const session = await stripeApi( env, 'POST', '/v1/billing_portal/sessions', {
		customer: row.stripe_customer,
		return_url: `${ url.origin }/build/account/#billing`,
		configuration: PORTAL_PATTERN.test( configuration ) ? configuration : undefined,
	} );
	const link = typeof session.body?.url === 'string' ? session.body.url : '';
	if ( ! session.ok || ! link.startsWith( 'https://' ) ) throw stripeDown();
	return json( { url: link } );

}

// --- the owner's comps -------------------------------------------------------------------------

// The account an admin named: its id, its Google email, or its username. null for none. (The admin
// page's Build tab looks customers up the same way: build-stats.js.)
export async function namedAccount( db, who ) {

	const SELECT = 'SELECT accounts.id, accounts.email, logins.username FROM accounts LEFT JOIN logins ON logins.account_id = accounts.id';
	if ( ACCOUNT_ID.test( who ) ) return await db.prepare( `${ SELECT } WHERE accounts.id = ?` ).bind( Number( who ) ).first();
	if ( who.includes( '@' ) ) return await db.prepare( `${ SELECT } WHERE accounts.email = ? ORDER BY accounts.id LIMIT 1` ).bind( who.toLowerCase() ).first();
	const name = cleanUsername( who );
	return name ? await db.prepare( `${ SELECT } WHERE logins.username_key = ?` ).bind( usernameKey( name ) ).first() : null;

}

// POST /api/admin/build/comp { account, reason?, until?, remove? }: Build Pro given to an account
// (its id, Google email or username) without paying, for good (until null or left out) or until a
// time (ms, in the future); given again, it replaces the last. remove: true takes it away (Pro
// bought, or BUILD_EMAILS', is untouched). Admins only (admin.js). { account: { id, email,
// username }, comp: { reason, until, createdAt } | null }.
export async function adminComp( context ) {

	const { request, env, now } = context;
	const admin = await adminAccount( context );
	const body = await readJson( request, 4096 );
	if ( ! isObject( body ) ) throw new HttpError( 400, 'Bad request' );
	const who = cleanText( typeof body.account === 'string' || typeof body.account === 'number' ? String( body.account ) : '', 320 ) ?? '';
	if ( ! who ) throw new HttpError( 400, 'Name the account: its email, username or id' );
	const account = await namedAccount( env.DB, who );
	if ( ! account ) throw new HttpError( 404, 'No account is that' );
	const shown = { id: account.id, email: account.email || '', username: account.username ?? null };
	if ( body.remove === true ) {

		await env.DB.prepare( 'DELETE FROM build_comps WHERE account_id = ?' ).bind( account.id ).run();
		return json( { account: shown, comp: null } );

	}

	const until = body.until ?? null;
	if ( until !== null && ( ! Number.isSafeInteger( until ) || until <= now ) ) throw new HttpError( 400, 'until is a time to come (ms), or null for good' );
	const reason = cleanText( typeof body.reason === 'string' ? body.reason : '', MAX_REASON ) ?? '';
	await env.DB.prepare( `INSERT INTO build_comps ( account_id, reason, until, created_by, created_at ) VALUES ( ?1, ?2, ?3, ?4, ?5 )
		ON CONFLICT ( account_id ) DO UPDATE SET reason = ?2, until = ?3, created_by = ?4, created_at = ?5` ).bind( account.id, reason, until, admin.id, now ).run();
	return json( { account: shown, comp: { reason, until, createdAt: now } } );

}

// GET /api/admin/build/comps: { comps: [ { account: { id, email, username }, reason, until,
// createdAt, active } ] }, newest first: every comp, ended ones too (active false). Admins only.
export async function adminComps( context ) {

	const { env, now } = context;
	await adminAccount( context );
	const { results } = await env.DB.prepare( `SELECT c.account_id, c.reason, c.until, c.created_at, a.email, l.username FROM build_comps c
		JOIN accounts a ON a.id = c.account_id LEFT JOIN logins l ON l.account_id = c.account_id ORDER BY c.created_at DESC LIMIT 500` ).all();
	return json( { comps: results.map( row => ( {
		account: { id: row.account_id, email: row.email || '', username: row.username ?? null },
		reason: row.reason, until: row.until, createdAt: row.created_at, active: row.until === null || row.until > now,
	} ) ) } );

}

function text( value ) {

	return typeof value === 'string' ? value.trim() : '';

}
