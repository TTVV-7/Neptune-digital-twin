import { HttpError, list } from '../http.js';
import { currentAccount } from './accounts.js';

// What the owner's admin page's routes share (GET /api/admin/stats in stats.js, GET
// /api/admin/dropins in dropins.js): who may ask, how often, and for how many days.
//
// Settings: ADMIN_EMAILS (a secret or var, comma-separated): the Google accounts that may see them,
// signed in on worlddrive.app. ADMIN_LOOKS: the rate limiter binding for their asks, by account.

// The most days the admin page asks for (a year), and how long rows are kept: two of those, so a
// year can be compared with the year before it.
export const MOST_DAYS = 365;
export const KEEP_DAYS = 2 * MOST_DAYS;

// Whether `account` ({ email, username }) may see the stats: its email in ADMIN_EMAILS (any case),
// and no username and password on it, so the admin page is only ever reached by Google's sign-in
// (logins.js never adds a password to such an account; this holds even if ADMIN_EMAILS later names
// one that has one).
export function isAdmin( env, account ) {

	const email = typeof account?.email === 'string' ? account.email.toLowerCase() : '';
	return !! email && ! account.username && list( env.ADMIN_EMAILS ).includes( email );

}

// The account asking, if it's an admin's: 401 without a signed-in account, 403 for one not in
// ADMIN_EMAILS, and 429 past ADMIN_LOOKS' asks a minute (each ask reads a period's rows, so even the
// owner's own page, or a copy of their cookie, can't run the database's reads up).
export async function adminAccount( context ) {

	const { env } = context;
	const account = await currentAccount( context );
	if ( ! account ) throw new HttpError( 401, 'Sign in first' );
	if ( ! isAdmin( env, account ) ) throw new HttpError( 403, 'Not an admin' );
	if ( env.ADMIN_LOOKS && ! ( await env.ADMIN_LOOKS.limit( { key: String( account.id ) } ) ).success ) {

		throw new HttpError( 429, 'Too many. Try again in a minute', { retryAfter: 60 }, { 'Retry-After': '60' } );

	}

	return account;

}

// The days asked for in ?days= (30 if unset or not a number, from 1 to MOST_DAYS).
export function askedDays( url ) {

	return Math.min( MOST_DAYS, Math.max( 1, Math.floor( Number( url.searchParams.get( 'days' ) ) ) || 30 ) );

}
