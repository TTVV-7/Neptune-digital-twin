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
		<li><b>With a username:</b> the username and a salted hash of your password (never the password itself), and an email only if you give one: for your receipts, and so a forgotten password can be reset when you write from it. Nothing else is sent to it.</li>
		<li><b>The Supporter Pass:</b> what you bought, when, the amount, and Stripe's reference for it. World Drive never sees your card: payments are made with Stripe.</li>
		<li><b>Feature requests</b> you send from the account panel: what you wrote, when, and your nickname, read by World Drive's maker and deleted when you ask.</li>
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
		<li><b>Forgot your password?</b> Email us from the email on your account and say your username: you'll get a link to set a new one. Linked Google? Sign in with Google instead.</li>
		<li><b>Delete your account or see your data:</b> see the <a href="/privacy/">privacy policy</a>.</li>
	</ul>
	<p>Read the <a href="/terms/">terms of use</a>, the <a href="/privacy/">privacy policy</a> and <a href="/refunds/">refunds and cancelling</a>.</p>`;

}

// --- World Drive Build's pages --------------------------------------------------------------------
//
// World Drive Build (/build/, docs/build.md) is sold to businesses, so it has pages of its own at
// /build/terms/, /build/privacy/, /build/refunds/, /build/acceptable-use/ and /build/credits/, with
// the same contact details as the game's (contactDetails). They're written to match what Build does
// (worker/drive/build.js, billing.js, mcp.js, src/product.js) and the owner's decisions: Build Pro at
// BUILD_PRICES, one named person a subscription, 18 and over for work, a full refund within 14 days
// of the first charge, the laws of British Columbia with consumers keeping their own, no
// arbitration, and no cookie banner, because Build sets only the sign-in cookie (BUILD_COOKIE). Like
// the game's they're a plain-language starting point, not legal advice: a British Columbia lawyer
// should read the Terms, Privacy Policy and Refunds once before Build Pro is sold, and they change
// here when what Build does changes.

export const BUILD_UPDATED = '24 November 2026';
// As Checkout charges them (docs/build.md, "The owner's steps"): change them with the Stripe prices
// and BUILD_PRICE_LABEL_MONTHLY and BUILD_PRICE_LABEL_ANNUAL, never one without the others.
export const BUILD_PRICES = { monthly: 'US$5 a month', annual: 'US$50 a year' };
// The plans' limits, as worker/drive/build.js's and mcp.js's defaults have them.
export const BUILD_LIMITS = { freeItems: 33, freeViews: 15, freeProjects: 1, proViews: 300, proProjects: 200, mcpHourly: 300 };
// The one cookie Build sets (worker/sessions.js's sessionCookies, for worker/drive/accounts.js) and
// every key the editor keeps in the browser's localStorage, with what each is for.
// test-drive-seo.mjs checks the keys against the code, so a new one has to be listed here (and so
// in the Privacy Policy) before it ships.
export const BUILD_COOKIE = { name: '__Host-wd_session', days: 30 };
export const BUILD_STORAGE = [
	[ 'world-drive-build.site', 'the site the editor last opened (its name and where it is), so it opens there again' ],
	[ 'neptune-twin.cloud.<site>', 'which of your saved projects this browser has open at that site, and which account it\'s saved to' ],
	[ 'neptune-twin.layout.<site>', 'your layout at that site as you work, so nothing is lost if the page closes' ],
	[ 'neptune-twin.layers', 'what the Show panel hides, and whether it\'s open' ],
	[ 'neptune-twin.legend', 'whether the Controls panel is open' ],
	[ 'neptune-twin.rows', 'the spacing you last used for each kind of row' ],
	[ 'neptune-twin.build-stage', 'the construction stage you last looked at' ],
	[ 'neptune-twin.player-view', 'first or third person, when walking round the site' ],
	[ 'neptune-twin.player-character', 'which worker you walk as' ],
	[ 'drive.stunt-best', 'your best score driving a machine round the site' ],
];
// Keys the same code keeps only outside Build (the Neptune project's own site), never on worlddrive.app.
export const NOT_IN_BUILD_STORAGE = [ 'neptune-twin.google-api-key', 'twin.placementKey' ];
const GOOGLE_TERMS = 'https://maps.google.com/help/terms_maps/';
const GOOGLE_PRIVACY = 'https://policies.google.com/privacy';

// The links every Build page has at its foot (and the dashboard and the editor too).
export const BUILD_LEGAL_LINKS = [
	[ 'Terms', '/build/terms/' ],
	[ 'Privacy', '/build/privacy/' ],
	[ 'Cookies and storage', '/build/privacy/#cookies' ],
	[ 'Refunds and cancelling', '/build/refunds/' ],
	[ 'Acceptable use', '/build/acceptable-use/' ],
	[ 'Credits', '/build/credits/' ],
];

// Who runs Build: the name (or, until it's set, a description), as a sole proprietor.
function buildOwner( contact ) {

	return `${ contact.name ? esc( contact.name ) : 'its owner' }, a sole proprietor in ${ LOCATION }`;

}

// The pages, as legalPages' are. `credits` is public/library/CREDITS.md's text, for the credits page.
export function buildLegalPages( contact, credits = '' ) {

	return [
		{
			slug: 'terms',
			title: 'Terms of Service',
			crumb: 'Terms',
			description: 'The terms for using World Drive Build and buying Build Pro: who can use it, plans and limits, renewal, your content, Google Maps, and liability.',
			body: buildTerms( contact ),
		},
		{
			slug: 'privacy',
			title: 'Privacy Policy',
			crumb: 'Privacy',
			description: 'What World Drive Build keeps about you and your projects, why, who handles it, how long it\'s kept, your rights, and the one cookie it sets.',
			body: buildPrivacy( contact ),
		},
		{
			slug: 'refunds',
			title: 'Refunds and Cancelling',
			crumb: 'Refunds',
			description: 'How to cancel Build Pro, when it ends, and refunds: a full refund within 14 days of your first charge, no questions asked.',
			body: buildRefunds( contact ),
		},
		{
			slug: 'acceptable-use',
			title: 'Acceptable Use Policy',
			crumb: 'Acceptable use',
			description: 'What World Drive Build may not be used for: copying Google\'s map, getting round limits, sharing an account, others\' confidential plans, and more.',
			body: buildAcceptableUse( contact ),
		},
		{
			slug: 'credits',
			title: 'Credits',
			crumb: 'Credits',
			description: 'Who made the 3D map, the equipment models and the typefaces in World Drive Build, with each model\'s author and licence.',
			body: buildCredits( credits ),
		},
	];

}

function buildTerms( contact ) {

	return `
	<p>These terms are an agreement between you and ${ buildOwner( contact ) } ("we", "us"), who runs World Drive Build ("Build") at worlddrive.app/build/. You accept them when you press a sign-in button beside the words "By continuing you agree to the Terms and Privacy Policy", and again when you tick the box accepting them at checkout. If you don't agree, please don't use Build. They include the <a href="/build/acceptable-use/">Acceptable Use Policy</a> and <a href="/build/refunds/">Refunds and Cancelling</a>; the <a href="/build/privacy/">Privacy Policy</a> says what's done with your information.</p>
	<h2>1. Who can use Build</h2>
	<ul>
		<li>You must be 18 or older. Build is a tool for business and professional use: planning and showing construction sites.</li>
		<li>If you use Build for a company or other organisation, you confirm you're allowed to accept these terms for it, and "you" means both you and it.</li>
		<li>Nothing here takes away rights that consumer law where you live gives you and that can't be signed away.</li>
	</ul>
	<h2>2. Plans and limits</h2>
	<ul>
		<li><b>Free:</b> ${ BUILD_LIMITS.freeItems } everyday library items, ${ BUILD_LIMITS.freeViews } 3D map views a month and ${ BUILD_LIMITS.freeProjects } saved project.</li>
		<li><b>Build Pro:</b> the whole library and its sets, ${ BUILD_LIMITS.proViews } 3D map views a month, up to ${ BUILD_LIMITS.proProjects } saved projects, share links, your company logo on equipment, and the Claude connector.</li>
		<li><b>A 3D map view</b> is one opening of the editor, or of a share link, that loads Google's 3D map: each one costs us a fee to Google. Share links your viewers open count against your views. Without a view left, Build still works, on flat ground.</li>
		<li>Free views for everyone together are capped each day as a fair-use limit; once it's reached, free accounts get flat ground until midnight UTC. Monthly allowances start again on the first of each calendar month, UTC, and unused views don't carry over.</li>
		<li>We may change the plans' limits. A change that gives you less will be announced at least 30 days ahead, by email or in Build, and applies to a paid plan from your first renewal after that.</li>
		<li>There's no team plan yet.</li>
	</ul>
	<h2>3. One named user</h2>
	<p>Each Build Pro subscription is for one named person: the account it was bought with. Don't share your sign-in, or let others use your account or your subscription. Everyone who uses Build Pro needs their own.</p>
	<h2>4. Fees, renewal and tax</h2>
	<ul>
		<li>Build Pro is ${ BUILD_PRICES.monthly } or ${ BUILD_PRICES.annual }, in US dollars, as shown before you pay. Sales tax, VAT or GST is added where it applies and shown at checkout, where businesses can enter a tax ID. Your bank may charge for converting currency. There's no free trial: the free plan is the way to try Build.</li>
		<li><b>Build Pro renews automatically</b> at the end of each month or year, at the price then in effect, charged to the payment method you gave, until you cancel. You can cancel at any time in your account's Billing, which opens Stripe's billing page; cancelling stops the next renewal, and Build Pro stays until the end of the period you've paid for.</li>
		<li>If the price is going to change, you'll be told at least 30 days before the renewal it applies to, so you can cancel first.</li>
		<li>If a renewal can't be charged, Stripe tries again for a while and Build Pro carries on meanwhile; if it still can't be paid, the subscription ends.</li>
		<li>Refunds are as <a href="/build/refunds/">Refunds and Cancelling</a> says: a full refund within 14 days of your first charge, no questions asked. A refund or a chargeback ends Build Pro at once.</li>
		<li>Payments are taken by Stripe; we never see your card.</li>
	</ul>
	<h2>5. Your content</h2>
	<ul>
		<li>Your layouts, project names, site addresses and logos are yours ("your content"). You give us a licence to store, copy, back up, process and show your content only as needed to run Build for you and for whoever you share it with.</li>
		<li>You need the rights to what you upload, a logo above all, and you're responsible for your content.</li>
		<li><b>Share links:</b> anyone with a project's share link can see that project (its layout, site and logo) while it's shared. You choose who gets the link and can stop sharing at any time; we're not responsible for where you send it.</li>
		<li>If your plan ends, you keep the projects you've saved and can still open and edit them, but you can't start new ones past the free plan's limit. They're never deleted without telling you.</li>
	</ul>
	<h2>6. Google Maps</h2>
	<ul>
		<li>Build shows Google's photorealistic 3D map. <b>By using Build you agree to the <a href="${ GOOGLE_TERMS }">Google Maps/Google Earth Additional Terms of Service</a> and the <a href="${ GOOGLE_PRIVACY }">Google Privacy Policy</a>.</b></li>
		<li>Google's map, imagery and heights ("Google content") aren't your content, or ours. You may view them in Build only. You may not export, download, cache, scrape or take bulk screenshots of Google content; trace it or extract its meshes, imagery or heights; or use it to make maps, datasets or AI training data.</li>
		<li>Never remove, hide or crop Google's logo or data credits, in Build or in anything you show from it.</li>
	</ul>
	<h2>7. A planning aid, not engineering</h2>
	<ul>
		<li>Build's mock-ups, excavation and shoring sections, slopes, crane reach, measurements, volumes and truck loads are <b>indicative visualisations only</b>. They aren't engineering, surveying or geotechnical advice, lift plans, traffic management plans or permits, or proof of compliance with occupational health and safety rules (WorkSafeBC's or anyone's).</li>
		<li>A qualified professional must check anything before it's relied on for safety, design, cost or permits.</li>
		<li>The 3D map can be years out of date, isn't survey-grade, and can be metres out. The equipment models are approximate, not their makers' data.</li>
	</ul>
	<h2>8. Claude and other AI apps</h2>
	<p>With Build Pro you can connect an AI app such as Claude (from Anthropic) to your account through Build's connector. If you do, you authorise that app to read and change your projects for you, within ${ BUILD_LIMITS.mcpHourly } calls an hour. What you and the app exchange goes to its maker under your own agreement with them, not ours, and we're not responsible for what the app does or says: check its work. You can disconnect it at any time on the Build dashboard.</p>
	<h2>9. Availability and changes to Build</h2>
	<ul>
		<li>We work to keep Build running, but there's no guarantee it will always be available, and no service level.</li>
		<li>Build can change. The 3D map depends on Google and may change, cost more or be withdrawn if Google changes its terms, prices or service.</li>
		<li>If we stop selling Build Pro or close Build, we'll tell you at least 30 days ahead, no renewal will be charged after that, and you'll get back the unused part of a year you've paid for.</li>
	</ul>
	<h2>10. Our property, and others'</h2>
	<p>Build's software, design and words are ours or our licensors'. Don't copy, resell or reverse-engineer them, except as the law allows. Most equipment models are others' work under Creative Commons licences, credited on the <a href="/build/credits/">credits page</a>. If you send us ideas or feedback, we may use them without owing you anything.</p>
	<h2>11. Suspension and ending</h2>
	<ul>
		<li>You can stop using Build and close your account at any time.</li>
		<li>We may suspend or close an account that breaks these terms or the <a href="/build/acceptable-use/">Acceptable Use Policy</a>, doesn't pay, or puts Build, its users or our agreement with Google at risk. We'll tell you why, unless the law or security stops us.</li>
		<li>If you delete your account yourself, its projects are deleted at once, so download them first (the account page offers a copy). If we close your account, you can still get a copy of your projects for 30 days, by asking us, unless the law or a serious breach stops it. Then they're deleted.</li>
		<li>If we close your account without your having broken these terms, you get back the unused part of a period you've paid for.</li>
	</ul>
	<h2>12. Warranties and liability</h2>
	<ul>
		<li>Build is provided as it is and as available. As far as the law allows, we make no promise that it's accurate, free of errors, or fit for a particular purpose.</li>
		<li>As far as the law allows, we're not liable for indirect or consequential losses, lost profits or business, delays, or the cost of work, equipment or permits, and our total liability for anything to do with Build is limited to the greater of what you paid us in the 12 months before the claim and US$100.</li>
		<li>Nothing here limits liability that the law doesn't allow to be limited, such as for fraud, or for death or personal injury caused by negligence.</li>
		<li>You'll cover us for claims by others that come from your content, your share links, or your use of Build in breach of these terms.</li>
	</ul>
	<h2>13. The law</h2>
	<p>These terms are governed by the laws of British Columbia and the laws of Canada that apply there, and disputes go to the courts of British Columbia. If you're a consumer, you keep the protection of the consumer laws where you live and can use your local courts. There's no arbitration. Before any claim, please ${ emailLink( contact, 'get in touch' ) }: most things can be sorted out quickly.</p>
	<h2>14. Changes and notices</h2>
	<p>We may change these terms. A change that matters will be announced at least 30 days before it applies, by email or in Build; if you don't accept it, you can cancel before then. The date below says when they last changed. We send notices to your account's email; send yours to:</p>
	${ contactBlock( contact ) }
	<p>These terms, with the policies they name, are the whole agreement about Build. If a part can't be enforced, the rest still applies, and not enforcing a part isn't giving it up. We may pass this agreement to someone who takes over Build, and will tell you if we do.</p>
	<p class="small">Last updated ${ BUILD_UPDATED }. These terms set out our agreement; they aren't legal, engineering or other professional advice. See also the <a href="/build/privacy/">Privacy Policy</a>.</p>`;

}

function buildPrivacy( contact ) {

	return `
	<p>World Drive Build is run by ${ buildOwner( contact ) }, who decides what's done with your personal information and is responsible for it. This policy says what Build keeps, why, who handles it and for how long. In short: what Build needs to run your account and projects, nothing sold, no ads and no tracking. Questions, or to see, correct or delete what's kept: ${ emailLink( contact ) }.</p>
	<h2>Who to contact</h2>
	${ contactBlock( contact ) }
	<p>The person in charge of the protection of personal information (as Quebec's Law 25 asks) is ${ contact.name ? esc( contact.name ) : 'Build\'s owner' }, reachable the same way.</p>
	<h2>What Build keeps</h2>
	<ul>
		<li><b>Your account:</b> signed in with Google, your Google account's name, email address and the ID Google gives it; with a username, the username and a salted hash of your password; and a contact email if you give one.</li>
		<li><b>Signing in:</b> a random token in the sign-in cookie, of which only a hash is kept.</li>
		<li><b>Your projects:</b> each one's name, the site's name or address and where it is (latitude and longitude), and the layout: what's placed where, and the areas you draw.</li>
		<li><b>Your logo</b>, if you upload one, and the tokens of the share links you make.</li>
		<li><b>Your plan and payments:</b> your plan, and Stripe's references for you as a customer and for your subscription, invoices and charges, with their amounts, dates, renewal and cancelling, refunds and disputes. Stripe collects your card, billing address and any tax ID; we never see your card number.</li>
		<li><b>Claude and other AI apps</b>, if you connect one: the app's name and web address as it registers itself, its access tokens (kept only as hashes), and a log of when it made each call.</li>
		<li><b>Use:</b> each 3D map view (whose allowance it counted against, on which plan, and when), and daily totals of how Build is used that don't tell one person from another.</li>
		<li><b>Your IP address</b> is used as your requests arrive, to limit abuse and share out the free views fairly; it isn't kept with your account.</li>
		<li><b>What you write to us</b>, such as support emails.</li>
	</ul>
	<h2>Why, and on what basis</h2>
	<ul>
		<li>To provide Build and the plan you chose (our contract with you): your account, projects, share links, logo, connected apps and billing.</li>
		<li>To keep Build secure, working and fair, and to understand how it's used in total (our legitimate interests): the limits, logs and totals.</li>
		<li>To keep the payment records tax law requires (a legal obligation).</li>
	</ul>
	<p>Build's owner can see each account's plan and activity (map views, projects, payments) on an admin page, to run Build, help you and stop abuse, and looks inside a project only when you ask for help with it, or when security or the law needs it.</p>
	<h2>Who else handles it</h2>
	<ul>
		<li><b>Cloudflare</b> hosts Build and its database, and counts visits without cookies (Web Analytics).</li>
		<li><b>Google</b> provides the 3D map: your browser asks Google for it directly, so Google sees your IP address and the area you're looking at. Google also runs sign-in when you press its button. Google's use is under the <a href="${ GOOGLE_PRIVACY }">Google Privacy Policy</a>.</li>
		<li><b>Stripe</b> takes payments and works out tax, under <a href="https://stripe.com/privacy">its privacy policy</a>.</li>
		<li><b>OpenStreetMap</b> answers address searches, through our server, so it never sees your IP address.</li>
		<li><b>Anthropic</b> (or another AI app's maker), only if you connect its app, under your own agreement with it.</li>
	</ul>
	<p>Nothing is sold, or shared for advertising. These services keep data in the United States and elsewhere outside Canada, where other laws apply; we use them under their data protection terms, including the safeguards they offer for information from the EU and the UK.</p>
	<h2>How long</h2>
	<ul>
		<li>Your account, projects and logo: until you delete them or close your account. Deleting your account deletes its projects at once; an account we close has its projects deleted within 30 days.</li>
		<li>Map view and AI app call logs: up to 13 months.</li>
		<li>Payment records: six years, as Canadian tax law requires.</li>
		<li>Database backups: up to 30 days more.</li>
	</ul>
	<h2>Your rights</h2>
	<p>You can ask to see what's kept about you, to get a copy of your projects to take elsewhere, to have it corrected, or to have your account and projects deleted: ${ emailLink( contact ) } from your account's email. You'll have an answer within 30 days. If you're not happy with it, you can complain to the <a href="https://www.priv.gc.ca/">Office of the Privacy Commissioner of Canada</a>, in Quebec to the <a href="https://www.cai.gouv.qc.ca/">Commission d'accès à l'information</a>, or in the EU or the UK to your data protection authority. In California: nothing is sold or shared, so there's nothing to opt out of.</p>
	<h2>Security</h2>
	<p>Everything is sent encrypted (HTTPS); sign-in and AI app tokens are kept only as hashes; your card stays with Stripe. If a breach puts you at real risk of harm, you and the regulators will be told as the law requires.</p>
	<h2>Age</h2>
	<p>Build is for people 18 and over.</p>
	<h2 id="cookies">Cookies and storage</h2>
	<p>Build sets <b>one cookie</b>: <code>${ BUILD_COOKIE.name }</code>, which keeps you signed in. It's strictly necessary, set only when you sign in, lasts ${ BUILD_COOKIE.days } days, can't be read by the page's scripts (HttpOnly), is only sent over HTTPS (Secure), and only with requests from worlddrive.app's own pages or links to it (SameSite=Lax). That's why there's no cookie banner.</p>
	<p>The editor also keeps these in your browser's own storage (localStorage). They stay on your device, aren't sent to us, and clearing the site's data removes them:</p>
	<ul>
		${ BUILD_STORAGE.map( ( [ key, what ] ) => `<li><code>${ esc( key ) }</code>: ${ esc( what ) }.</li>` ).join( '\n\t\t' ) }
	</ul>
	<p>Others' services: Google's sign-in script loads only where there's a sign-in button to show, and Google's own cookies come into it only when you press it; the 3D map comes from Google's servers; Stripe's checkout and billing pages are Stripe's, with its cookies. Visits are counted with Cloudflare Web Analytics, which uses no cookies and doesn't follow you from site to site, and with totals on our server. There are no ads, analytics tags, tracking pixels or session recordings on Build.</p>
	<h2>Changes</h2>
	<p>If what Build keeps changes, this page will say so, with its date; a change that matters will be announced by email or in Build first.</p>
	<p class="small">Last updated ${ BUILD_UPDATED }. This policy explains what Build does with your information; it isn't legal advice. See also the <a href="/build/terms/">Terms of Service</a>.</p>`;

}

function buildRefunds( contact ) {

	return `
	<p>Build Pro is ${ BUILD_PRICES.monthly } or ${ BUILD_PRICES.annual }, and renews automatically until you cancel. Here's how to cancel, and when you get your money back.</p>
	<h2>Cancelling</h2>
	<ul>
		<li>Cancel at any time, online: open your account's <b>Billing</b>, which opens Stripe's billing page, and cancel there. Or ${ emailLink( contact ) } and it will be cancelled for you.</li>
		<li>Cancelling stops the next renewal. Build Pro stays until the end of the month or year you've paid for; then your account is on the free plan.</li>
		<li>Nothing is deleted: you keep the projects you've saved and can still open and edit them, though you can't start new ones past the free plan's limit, and they're never deleted without telling you.</li>
	</ul>
	<h2>Refunds</h2>
	<ul>
		<li><b>Within 14 days of your first charge:</b> a full refund on request, no questions asked.</li>
		<li><b>Renewals</b> (each later month or year) aren't refunded, except a charge made in error, a duplicate charge, or where the law where you live requires it.</li>
		<li>A refund ends Build Pro at once, and its subscription is cancelled. So does a chargeback.</li>
	</ul>
	<p>To ask, ${ emailLink( contact ) } from your account's email. Refunds go back to the card you paid with, through Stripe, usually within 5 to 10 business days.</p>
	<h2>Contact</h2>
	${ contactBlock( contact ) }
	<p>This is on top of any rights the law gives you where you live.</p>
	<p class="small">Last updated ${ BUILD_UPDATED }. See also the <a href="/build/terms/">Terms of Service</a>.</p>`;

}

function buildAcceptableUse( contact ) {

	return `
	<p>Build is for planning and showing construction sites. To keep it working, fair and within Google's terms, don't use it to:</p>
	<ul>
		<li><b>Copy Google's map:</b> no exporting, scraping, caching, bulk screenshots, tracing, or extracting meshes, imagery or heights, and no removing Google's logo or credits.</li>
		<li><b>Get round the limits:</b> no dodging the 3D map view allowances or caps, making extra accounts for more, or sharing one account or subscription among several people.</li>
		<li><b>Automate it</b> other than through the official Claude connector, within its ${ BUILD_LIMITS.mcpHourly } calls an hour: no bots, scripts or scrapers.</li>
		<li><b>Infringe others' rights:</b> logos, trademarks or work you don't have the right to use.</li>
		<li><b>Publish what isn't yours to publish:</b> others' confidential site plans, or anyone's personal information, through share links.</li>
		<li><b>Watch or harm people:</b> surveillance, stalking, or planning anything unlawful.</li>
		<li><b>Attack Build:</b> no security testing without our written permission, no overloading it, and no getting into what isn't yours.</li>
		<li><b>Resell it:</b> no reselling or sublicensing access to Build or its map.</li>
		<li><b>Make rival map data:</b> no competing maps, datasets or AI training sets made from Build.</li>
	</ul>
	<p>Breaking these rules can get an account suspended or closed (see the <a href="/build/terms/">Terms of Service</a>). To report misuse, ${ emailLink( contact ) }.</p>
	<p class="small">Last updated ${ BUILD_UPDATED }.</p>`;

}

// public/library/CREDITS.md's entries ("- **Name** (`file`): ..."), as HTML: its links (whose
// words can have brackets of their own: "[Pallet [Low Poly]](...)"), bold and code made into tags,
// everything else escaped.
export function creditEntries( markdown ) {

	return markdown.split( '\n' ).filter( line => line.startsWith( '- **' ) ).map( line => esc( line.slice( 2 ).trim() )
		.replace( /\[((?:[^[\]]|\[[^\]]*\])+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>' )
		.replace( /\*\*([^*]+)\*\*/g, '<b>$1</b>' )
		.replace( /`([^`]+)`/g, '<code>$1</code>' ) );

}

function buildCredits( markdown ) {

	const entries = creditEntries( markdown );
	return `
	<p>World Drive Build stands on others' work.</p>
	<h2>The 3D map</h2>
	<p>Buildings, roads and terrain are Google's photorealistic 3D map: map data © Google and its data providers, credited in the editor as you look. Address search © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors. Build isn't made or endorsed by Google.</p>
	<h2>Equipment models</h2>
	<p>These ${ entries.length } models in the library are others' work, used under the licences named (Creative Commons Attribution 4.0, which allows commercial use with credit, and CC0); each was compressed and rescaled for Build. The library's other items are made in code or are our own. Keep these credits with anything you share that shows them.</p>
	<ul class="credits">
		${ entries.map( entry => `<li>${ entry }</li>` ).join( '\n\t\t' ) }
	</ul>
	<h2>Typefaces</h2>
	<p>Archivo, Inter and IBM Plex Mono, under the <a href="https://openfontlicense.org/">SIL Open Font License 1.1</a>.</p>
	<p class="small">Last updated ${ BUILD_UPDATED }.</p>`;

}
