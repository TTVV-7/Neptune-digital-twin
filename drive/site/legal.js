// World Drive's legal pages' words (docs/world-drive.md, "Legal pages"): the privacy policy at
// /privacy/, the terms at /terms/, refunds and cancelling at /refunds/ and how to reach the owner at
// /contact/. build.js makes them into pages like the others'.
//
// Who runs World Drive and how to reach them (see contactDetails): Tom, at support@worlddrive.app
// (Cloudflare Email Routing passes it on to the owner's own inbox), in Vancouver. The environment can
// change any of them when the site is built (DRIVE_CONTACT_NAME, DRIVE_CONTACT_EMAIL), and add what's
// kept out of the repository on purpose: a mailing address (DRIVE_CONTACT_ADDRESS, a PO box or a
// mailbox service rather than a home) and a phone (DRIVE_CONTACT_PHONE). Without an address the pages
// say where World Drive is run from (LOCATION).
//
// These are a plain-language starting point, written to match what the code actually does (what
// drive/index.html's About World Drive says is kept, worker/drive/). They aren't legal advice: have a
// lawyer read them before relying on them, and change them here when what the game keeps changes.

import { esc } from './build.js';

export const UPDATED = '23 November 2026';
export const CONTACT_VARS = { name: 'DRIVE_CONTACT_NAME', address: 'DRIVE_CONTACT_ADDRESS', phone: 'DRIVE_CONTACT_PHONE', email: 'DRIVE_CONTACT_EMAIL' };
// What's shown unless the environment says otherwise: no address or phone in the repository.
export const CONTACT_DEFAULTS = { name: 'Tom', address: '', phone: '', email: 'support@worlddrive.app' };
export const LOCATION = 'Vancouver, British Columbia, Canada';

// { name, address, phone, email }: the environment's, else the defaults ('' for none).
export function contactDetails( env = process.env ) {

	return Object.fromEntries( Object.entries( CONTACT_VARS ).map( ( [ key, name ] ) => [ key, String( env[ name ] ?? '' ).trim() || CONTACT_DEFAULTS[ key ] ] ) );

}

// The ones the pages can't do without: who runs it and how to reach them.
export function missingContact( contact ) {

	return [ 'name', 'email' ].filter( key => ! contact[ key ] ).map( key => CONTACT_VARS[ key ] );

}

// Who runs World Drive: the name, or (until it's set) a description.
function owner( contact ) {

	return `${ contact.name ? esc( contact.name ) : 'its owner' }, in ${ LOCATION }`;

}

// The contact block: whatever's set, the email and phone as links.
function contactBlock( contact ) {

	const rows = [];
	if ( contact.name ) rows.push( `<dt>Run by</dt><dd>${ esc( contact.name ) }</dd>` );
	if ( contact.email ) rows.push( `<dt>Email</dt><dd><a href="mailto:${ esc( contact.email ) }">${ esc( contact.email ) }</a></dd>` );
	if ( contact.phone ) rows.push( `<dt>Phone</dt><dd><a href="tel:${ esc( contact.phone.replace( /[^+\d]/g, '' ) ) }">${ esc( contact.phone ) }</a></dd>` );
	rows.push( contact.address ? `<dt>Mail</dt><dd>${ esc( contact.address ) }</dd>` : `<dt>Based in</dt><dd>${ LOCATION }</dd>` );
	return rows.length ? `<dl class="contact">${ rows.join( '' ) }</dl>` : '<p>Contact details are being added.</p>';

}

function emailLink( contact, words = 'email us' ) {

	return contact.email ? `<a href="mailto:${ esc( contact.email ) }">${ words }</a>` : `<a href="/contact/">${ words }</a>`;

}

// Each page: its address, title (for the tab and search), a description, its heading and its body.
export function legalPages( contact ) {

	return [
		{
			slug: 'privacy',
			title: 'Privacy Policy',
			crumb: 'Privacy',
			description: 'What World Drive keeps about you, why, who it shares it with (Cloudflare, Google, Stripe), how long it\'s kept, and how to see or delete it.',
			body: privacy( contact ),
		},
		{
			slug: 'terms',
			title: 'Terms of Use',
			crumb: 'Terms',
			description: 'The rules for playing World Drive, making an account and buying the Supporter Pass: who can play, fair play, what the pass is, and liability.',
			body: terms( contact ),
		},
		{
			slug: 'refunds',
			title: 'Refunds and Cancelling',
			crumb: 'Refunds',
			description: 'How to cancel a World Drive Supporter Pass subscription, and how to get a refund: a full refund on any pass within 14 days, no questions asked.',
			body: refunds( contact ),
		},
		{
			slug: 'contact',
			title: 'Contact and Support',
			crumb: 'Contact',
			description: 'How to reach World Drive for help with the game, your account, the Supporter Pass, a refund, your data, or to report a nickname on the boards.',
			body: contactPage( contact ),
		},
	];

}

function privacy( contact ) {

	return `
	<p>World Drive is run by ${ owner( contact ) }. This policy says what the game keeps about you and why. In short: as little as the game needs, no selling of anything, and never where you really are. Questions, or to see or delete what's kept: ${ emailLink( contact ) }.</p>
	<h2>Playing without an account</h2>
	<ul>
		<li><b>In your browser.</b> Your progress, settings and nickname's key are kept in your browser's own storage on your device, not in cookies. Clearing the site's data removes them.</li>
		<li><b>On the leaderboard.</b> Once you pick a nickname: the nickname, your best scores (with where you set them and in what ride), your challenge times, your XP and level, and the areas and start spots you've driven.</li>
		<li><b>Driving with others.</b> While <b>Show me to drivers nearby</b> is on (switch it off in the pause menu) or you're in a party, others driving there see your nickname or a guest name, your level and title, your ride and where your car is in the game. Never where you really are. There's no chat.</li>
		<li><b>Play statistics.</b> Daily totals of how the game is played (how long people drive and where in the game, devices, load times, what went wrong). Only totals are kept, nothing that tells one visitor from another.</li>
		<li><b>Your IP address</b> is used, without being stored with anything else about you, to hand out the free daily Earth drives fairly, limit abuse and count a visitor once a day. Those daily counts are deleted when the day ends (Cloudflare's backups can hold them up to 30 days more).</li>
		<li><b>Place search.</b> What you type in the search box is sent to OpenStreetMap's search service to find the place; World Drive doesn't keep it.</li>
	</ul>
	<h2>With an account</h2>
	<p>An account is only needed for the Supporter Pass and to keep your progress on every device.</p>
	<ul>
		<li><b>Signed in with Google:</b> your Google account's name and email address, and an ID Google gives for it.</li>
		<li><b>With a username:</b> the username and a salted hash of your password (never the password itself), and an email for receipts only if you give one.</li>
		<li><b>The Supporter Pass:</b> what you bought, when, the amount, and Stripe's reference for it. World Drive never sees your card: payments are made with Stripe.</li>
	</ul>
	<h2>Why</h2>
	<p>To run the game and the account you asked for (the leaderboard, your progress, the pass you bought); to keep it fair and working (daily limits, the robot check, finding what's broken); with your permission where the law asks for it (personalised ads); and to keep records of payments that tax law requires.</p>
	<h2>Who else handles it</h2>
	<ul>
		<li><b>Cloudflare</b> hosts the game and its data, checks for robots (Turnstile) and counts visits without cookies (Web Analytics).</li>
		<li><b>Google</b> streams the 3D map of the Earth (your browser asks Google for it directly), runs Google sign-in if you use it, and shows the ad on the globe with AdSense. Google and its partners use cookies to show, count and, where you allow it, personalise the ad; in the EEA, the UK and Switzerland Google asks first. See <a href="https://policies.google.com/technologies/partner-sites">how Google uses information from sites that use its services</a>. There's no ad with the Supporter Pass.</li>
		<li><b>Stripe</b> takes payments and keeps its own records of them under <a href="https://stripe.com/privacy">its privacy policy</a>.</li>
		<li><b>OpenStreetMap</b> answers place searches.</li>
	</ul>
	<p>Nothing is sold or shared for anyone else's marketing. These services may keep data outside Canada (in the United States and elsewhere), where other laws apply.</p>
	<h2>How long</h2>
	<p>Your account and leaderboard entries until you ask for them to be deleted. Payment records for as long as tax law asks (in Canada, six years). Play statistics are totals only and kept as such.</p>
	<h2>Your rights</h2>
	<p>You can ask to see what's kept about you, have it corrected, or have your account, nickname and scores deleted: ${ emailLink( contact ) } from the account's email, or tell us the username, and you'll have an answer within 30 days. If you're not happy with the answer you can complain to the <a href="https://www.priv.gc.ca/">Office of the Privacy Commissioner of Canada</a> or, in the EU or the UK, to your own data protection authority.</p>
	<h2>Children</h2>
	<p>World Drive is a game anyone can play without an account, but accounts and the leaderboard's nicknames are for people 13 and over. If you think a child under 13 has made an account, ${ emailLink( contact, 'tell us' ) } and it will be deleted.</p>
	<h2>Changes</h2>
	<p>If what the game keeps changes, this page will say so, with its date. A change that matters will be shown in the game too.</p>
	<p class="small">Last updated ${ UPDATED }.</p>`;

}

function terms( contact ) {

	return `
	<p>These terms are between you and ${ owner( contact ) }, who runs World Drive. By playing you accept them; if you don't, please don't play. Nothing here takes away rights consumer law gives you that can't be signed away.</p>
	<h2>Playing</h2>
	<ul>
		<li>World Drive is free to play in your browser. The Earth's 3D map costs money to stream, so free Earth drives are limited each day; the other worlds are unlimited.</li>
		<li>It's a game, not a map. Roads, places and heights can be wrong or out of date: don't use it to find your way, and never play it while driving a real vehicle.</li>
		<li>The game can change, be down, or end. If it's going to end, you'll be told in the game at least 30 days before, and no subscription will be charged after that.</li>
	</ul>
	<h2>Accounts and nicknames</h2>
	<ul>
		<li>You need to be 13 or older to make an account or pick a nickname. To buy anything you must be an adult where you live, or have a parent's or guardian's permission.</li>
		<li>Keep your password to yourself; you're responsible for what's done with your account.</li>
		<li>Nicknames are seen by everyone. No nicknames that are hateful, sexual, threatening, pretend to be someone else, or share anyone's personal details. Nicknames like that will be changed or removed, and their accounts may be closed.</li>
	</ul>
	<h2>Fair play</h2>
	<p>No cheating the leaderboard or challenges (altered scores, scripts, bots), no getting round the daily limits or the robot check, no attacking or overloading the game, and no copying the game's maps, models or data out of it. Scores that look made up can be removed, and accounts that break these rules closed.</p>
	<h2>The Supporter Pass</h2>
	<ul>
		<li>The pass is a licence to use extra things in the game (rides, Garage looks, more Earth drives a day, no ads) for as long as it lasts: 24 hours, while a monthly subscription is paid, or for good (for as long as World Drive runs). It isn't money, can't be exchanged for money, and can't be sold or passed to another account.</li>
		<li>The monthly pass renews each month until you cancel it, which you can do at any time. See <a href="/refunds/">refunds and cancelling</a>.</li>
		<li>Prices are shown before you pay, in Canadian dollars; your bank may convert them. Taxes, where they apply, are shown at checkout.</li>
		<li>If a payment is reversed (a chargeback or a refund), the pass it paid for ends.</li>
	</ul>
	<h2>Others' work</h2>
	<p>The Earth's map is Google's and its data providers', the place search OpenStreetMap's, the other worlds' maps NASA's and the USGS's, and each car model its maker's (see About World Drive in the game). World Drive isn't made or endorsed by Google, NASA or any carmaker.</p>
	<h2>Liability</h2>
	<p>World Drive is provided as it is, without promises that it will always work or suit you. As far as the law allows, ${ owner( contact ) } isn't liable for indirect or consequential losses, and the total liability for anything to do with World Drive is limited to what you paid for it in the 12 months before the claim, or CA$20 if that's more.</p>
	<h2>The law</h2>
	<p>These terms are governed by the laws of British Columbia and of Canada that apply there. If you live elsewhere, you keep the protection of your own country's or province's consumer laws and can use your local courts. Before any claim, please ${ emailLink( contact, 'get in touch' ) }: most things can be sorted out quickly.</p>
	<h2>Changes</h2>
	<p>These terms can change as the game does; the date below says when they last did. A change that matters will be shown in the game, and won't apply to a pass bought before it.</p>
	<p class="small">Last updated ${ UPDATED }. See also the <a href="/privacy/">privacy policy</a>.</p>`;

}

function refunds( contact ) {

	return `
	<p>The Supporter Pass helps pay for the 3D map. If it isn't what you wanted, you can have your money back.</p>
	<h2>Cancelling the monthly pass</h2>
	<ul>
		<li>Open the Supporter Pass in the game (from the globe's panel or the pause menu) while signed in, and press <b>Manage your subscription</b>. That opens Stripe's page where you cancel or change your card. Or ${ emailLink( contact ) } and it will be cancelled for you.</li>
		<li>Once cancelled, you won't be charged again. The pass stays until the end of the month you've paid for.</li>
	</ul>
	<h2>Refunds</h2>
	<ul>
		<li><b>Within 14 days of buying</b> any pass (24 hours, monthly or for good): a full refund on request, no questions asked. For the monthly pass, that's the first month's payment, or any later month's within 14 days of it being charged.</li>
		<li><b>If something went wrong</b> (you paid and the pass didn't unlock, you were charged twice, or the game didn't work for you during a day pass): a full refund whenever you ask.</li>
		<li>A refunded pass ends when the refund is made.</li>
	</ul>
	<p>To ask, ${ emailLink( contact ) } from the email on the receipt, or say the account's username. Refunds go back to the card you paid with through Stripe, usually within 5 to 10 business days.</p>
	<p>This is on top of any rights the law gives you where you live, such as the 14-day right to withdraw in the EU and the UK.</p>
	<p class="small">Last updated ${ UPDATED }. See also the <a href="/terms/">terms of use</a>.</p>`;

}

function contactPage( contact ) {

	return `
	<p>For help with the game, your account, the Supporter Pass, a refund or your data, or to report a nickname on the boards, get in touch. Email is quickest; you'll usually hear back within two business days.</p>
	${ contactBlock( contact ) }
	<h2>Help yourself</h2>
	<ul>
		<li><b>The pass didn't unlock?</b> Sign in with the same account you bought it with, open the Supporter Pass and press <b>Restore purchases</b>.</li>
		<li><b>Cancel the monthly pass:</b> the Supporter Pass in the game, then <b>Manage your subscription</b>. See <a href="/refunds/">refunds and cancelling</a>.</li>
		<li><b>Delete your account or see your data:</b> see the <a href="/privacy/">privacy policy</a>.</li>
	</ul>
	<p>Read the <a href="/terms/">terms of use</a>, the <a href="/privacy/">privacy policy</a> and <a href="/refunds/">refunds and cancelling</a>.</p>`;

}
