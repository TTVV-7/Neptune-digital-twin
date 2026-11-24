# World Drive Build

**worlddrive.app/build/**: the construction mock-up app (this repository's own app) offered to
anyone, on World Drive's site and accounts, with a free plan and a paid one, **Build Pro**. It's a
trial for now: the same app as the Neptune twin, built a second way, kept apart from both the game
and the Neptune twin.

- **`/build/`, the dashboard** (`drive/build/index.html`, `src/build-home/`): *Where's the site?*
  Type an address (World Drive's place search) and pick a result to open the editor there; your
  saved projects, each opening the editor at its site with it loaded; your plan, with the month's
  3D map views as a gauge and Go Build Pro (or Manage billing); Google sign-in. It never
  takes a 3D map view (it asks `/build/api/home`). Stripe's checkout brings buyers back to
  `/build/account/?checkout=done#billing` (or `/build/?checkout=cancelled`).
- **Upgrading** (the dashboard's plan box and the editor's Build Pro dialog, `src/premium.js`):
  monthly or yearly (yearly first, shown as "US$50/year - 2 months free"), then **Go Build Pro**
  (**Subscribe with Stripe** in the editor) asks the server for a Checkout Session
  (`billing/checkout`) and goes to Stripe's page in the same tab. Every such button has "Renews
  automatically every month/year until you cancel. Cancel any time in your account." beside it.
  Signed out, it asks to sign in first; until Build Pro is on sale it says it opens soon. Build Pro
  accounts get **Manage billing** (`billing/portal`, Stripe's billing portal) and a link to
  `/build/account/#billing`. The dashboard says when a renewal's payment failed ("Payment failed -
  update your card"), when Pro ends ("Pro ends on 3 Jan 2027"), and, back on `?checkout=done` or
  `?checkout=cancelled`, asks `/build/api/me` every 3 s (10 times) until Build Pro shows, or says
  nothing was charged.
- **Plan copy** (names, what each includes, the limits people are told) is in one module,
  `src/build-plans.js`, which every page that shows the plans imports; its limits match
  `limitsOf()` in `worker/drive/build.js`. Prices are never in it: they come from the server
  (`premium.billing.monthly` and `.annual`).
- **`/build/account/`, the account page** (`drive/build/account/index.html`, `src/build-account/`,
  `worker/drive/build-account.js`): one page, a section for each of Profile, Sign-in & security,
  Plan & billing, Usage, Branding, Connected apps, Share links, Your data and Delete account
  (`#profile` ... `#delete`). Linked from the dashboard's top bar and the editor's account area
  (Build only). See "The account page" below.
- **`/build/app/`, the editor**: the construction app, at `?at=lat,lon&place=Name`, opening
  `?project=<id>` from the dashboard; **Projects** (top) goes back to the dashboard and **Site**
  moves the project.

## What people get

| | Free | Build Pro | Owner |
|---|---|---|---|
| Who | anyone signed in with Google | a subscription bought through Stripe Checkout (US$5/month or US$50/year), given by the owner (comps), or listed in `BUILD_EMAILS` | `ADMIN_EMAILS` (World Drive's owner) |
| Library | 33 everyday items (`FREE_ITEMS` in `src/product.js`) | everything, sets included | everything |
| 3D map views a month | 15 (`BUILD_FREE_MONTHLY`) | 300 (`BUILD_PRO_MONTHLY`) | unlimited, not counted |
| Saved projects | 1 | 200 (`BUILD_LAYOUT_LIMIT`) | 200 |
| Share links | no | yes (their viewers get the map on the owner's views) | yes |

- **A 3D map view** is a page load that's handed the Maps key: one billed Google 3D tiles session
  (about US$0.006). Signed out, or past the month's views, the page opens on flat ground and says
  why; everything else works.
- **Free views for everyone together** are capped at `BUILD_FREE_DAILY` a day (200: at most about
  US$1.20 a day), then free accounts get flat ground till midnight UTC.
- **The site** is wherever the project is: the **Site** button (top) searches an address (World
  Drive's place search) and reloads the page there (`?at=lat,lon&place=Name`). Projects are saved
  per site.
- **What's locked:** picking a Pro item (or a set with one) opens the **Build Pro** dialog. Already
  placed items, saved projects and shared links open for everyone, as with the Pro equipment pack.
- Left out of Build: the Neptune project's own models (`public/models`, `MODELS` in config.js), the
  race pieces, and the key prompt.

## How it's put together

- **Pages:** `npm run build:drive` builds the dashboard into `dist-drive/build/` and the app a
  second time with `--mode worlddrive` (`vite.drive.config.js`'s `buildApp`) into
  `dist-drive/build/app/`, with the library and the walking workers copied in. `src/product.js`
  holds everything that differs in that mode.
- **Server:** World Drive's Worker answers `/build/api/*` and `/build/app/api/*` (each page asks
  beside itself; `worker/drive/build.js`):
  config (plan, views, the Maps key), sign-in with World Drive's accounts, saved projects and share
  links (`build_layouts`, with each project's place), views counted in `build_views`
  (`worker/drive/migrations/0016_build.sql` and `0017_build_places.sql`, applied by the deploy).
- **Payments** (`worker/drive/billing.js`, `stripe-api.js`, `migrations/0020_build_billing.sql`):
  Build Pro is a Stripe subscription, monthly or yearly, one named person each (quantity 1, which
  the buyer can't change), no trial. `POST /build/api/billing/checkout { interval: 'month' | 'year' }`
  makes a Checkout Session for the signed-in account (its own Stripe customer, made once and kept
  in `accounts.stripe_customer`; Stripe Tax and tax ids on; the Terms to accept; the auto-renewal
  sentence by the button) and answers `{ url }`; an account with a subscription running is refused
  (409). `POST /build/api/billing/portal` opens Stripe's billing portal for that customer (cancel,
  switch monthly and yearly, change the card, invoices). Nothing is sold until the secret key, both
  price ids, Google sign-in and the webhook's secret are all set and look right: until then
  `premium.billing.enabled` is false and the page says Build Pro opens soon. The page never has a
  price of its own: `premium.billing` carries `monthly` and `annual` as shown
  (`BUILD_PRICE_LABEL_MONTHLY`, `BUILD_PRICE_LABEL_ANNUAL`).
- **The webhook** (`supporter.js`, shared with the Supporter Pass) records Build Pro's checkout as
  `pass = 'build'` (its metadata says so), which never counts as the Supporter Pass (and the pass
  never counts as Build Pro). It keeps each event's id (`stripe_events`: one already acted on is
  skipped, and what became of each is there to look at), each subscription's price, interval,
  period and cancelling (`subscriptions`: an older event never undoes a newer one), and each
  invoice paid or failed with its charge (`invoices`). The plan (`/build/api/home`, `me`, `config`)
  says `subscribed`, `status`, `interval`, `renewsAt`, `cancelAtPeriodEnd`, `pastDue` and
  `priceLabel`. A failed renewal keeps Pro while Stripe retries the card (`past_due`, and
  `pastDue: true` for the page to ask for a new card); `canceled` or `unpaid` ends it. Cancelling
  ends it at the end of the period paid for. **A refund in full or a chargeback ends Pro at once**,
  found through the charge's invoice, and the subscription is cancelled at Stripe so it isn't
  billed again (a partial refund changes nothing). A paid checkout that matches nothing sold (no
  Payment Link and no Build Pro metadata) is never taken for a lifetime Supporter Pass: it's kept
  as `unmatched` and counted as `build_webhook:unmatched` in `stats_daily`.
- **Comps:** the owner gives Build Pro without paying, for a while or for good, with
  `POST /api/admin/build/comp { account: <email, username or id>, reason?, until?: <ms>, remove?: true }`
  (admins only; `GET /api/admin/build/comps` lists them), kept in `build_comps`. `BUILD_EMAILS`
  still works too.
- **Company logo (Build Pro):** uploaded on the dashboard (redrawn there as a PNG of 512 px at
  most), kept in `build_logos` (`migrations/0019_build_logo.sql`), served to its owner's editor and
  their share links (`/build/api/logo`, `/build/api/shared/<token>/logo`). `src/logo.js` lays it on
  both long sides of every vehicle, machine, trailer, container and bin, cut from the model's outer
  surface; the Show panel's "Company logo" hides it.
- **Claude (MCP):** `https://worlddrive.app/mcp` is an MCP server (`worker/drive/mcp.js`), Build Pro
  and the owner only. Claude finds it as a custom connector: it registers itself, the person signs
  in on worlddrive.app and allows it (`worker/drive/oauth.js`: OAuth 2.1 with PKCE, codes and tokens
  kept only as hashes, access an hour, refresh 30 days and replaced on use;
  `migrations/0018_build_mcp.sql`). Its tools find a site, make and read projects, search the
  library and sets (`build-catalog.json`, made by `npm run make-build-catalog` whenever the library
  changes), place items, sets and rows, add flatten, laydown and stockpile areas, move and remove
  things and share a project; each answer has the editor link. `MCP_HOURLY` (default 300) caps an
  account's tool calls an hour. The dashboard's **Build with Claude** box shows the address and
  disconnects every connected app.
- **Legal pages:** `/build/terms/`, `/build/privacy/` (with **Cookies and storage**, `#cookies`),
  `/build/refunds/`, `/build/acceptable-use/` and `/build/credits/` (every model in
  `public/library/CREDITS.md`), made by `drive/site/legal.js`'s `buildLegalPages` with the game's
  contact settings (`DRIVE_CONTACT_NAME`, `DRIVE_CONTACT_EMAIL`, `DRIVE_CONTACT_ADDRESS`,
  `DRIVE_CONTACT_PHONE`) and written into `dist-drive/build/` by `buildApp`; out of search
  (noindex) like the rest of `/build/`. Their prices (`BUILD_PRICES`) change with the Stripe prices
  and the price labels. The dashboard's footer and the editor (the foot of the library and of the
  help) link to them, and every Google sign-in button in Build has "By continuing you agree to the
  Terms and Privacy Policy" beside it: that line is the Terms' clickwrap, so keep it by any new
  sign-in button. The game's `/terms/`, `/privacy/` and `/refunds/` point Build users here. Have a
  British Columbia lawyer read the Terms, Privacy Policy and Refunds once before Build Pro is sold.
- **Privacy and cookies: no banner, so no tracking.** Build sets one cookie, `__Host-wd_session`,
  strictly necessary for signing in, and keeps only the editor's own state in `localStorage`
  (listed in `legal.js`'s `BUILD_STORAGE`, and so in the Privacy Policy). Visits are counted with
  the cookieless Cloudflare Web Analytics beacon and server-side totals. The dashboard's fonts are
  its own (`src/build-home/fonts/`, SIL Open Font License), not Google Fonts, and Google's sign-in
  script loads only where there's a button to show. That's why there's no consent banner. Adding
  Google Analytics, Tag Manager, Google Ads or AdSense, Meta or LinkedIn pixels, Hotjar, Clarity or
  any session replay to Build needs a consent tool first (Consent Mode v2, and a Google-certified
  TCF CMP for ads in the EEA, the UK and Switzerland), and a new `localStorage` key has to be added
  to `BUILD_STORAGE`: `npm run test:build-legal` fails otherwise.
- **Tests:** `npm run test:build-account` (the account page's Worker routes, against a stand-in for
  Stripe's API, and the built page in a browser), `npm run test:build-worker` (the server, under wrangler dev),
  `npm run test:build-ui` (the built page in a browser against the Worker),
  `npm run test:build-mcp` (connecting as Claude does, every tool, and the result in the editor),
  `npm run test:build-admin` (the admin numbers from seeded rows, and the Build tab) and
  `npm run test:build-legal` (the legal pages, the cookie and storage list against the code, and no
  tracking in anything built for Build).
- **The account page** (`GET /build/api/account`: connected apps, share links, payments and usage,
  beside `/build/api/me`'s plan). Signing in is changed through World Drive's own `/api/account/*`
  (`logins.js`), as the game's account panel does, with the same fresh proof (the password, or
  Google's button for the account's own Google account). Buying goes to Stripe's checkout and
  managing to its billing portal; back from checkout the page asks until Pro shows. Connected apps
  are cut off one at a time (`DELETE /build/api/connections/:client`) or all at once; share links
  are revoked one at a time or all. **Your data**: `GET /build/api/account/export`, a JSON file of
  everything kept about the account (projects with their layouts, logo, views and Claude's calls by
  month, payments, the World Drive game profile), never a password's hash or a token's. **Delete
  account**: `DELETE /build/api/account { password }` or `{ credential }` (fresh proof; the owner's
  accounts can't be). Any subscription still running, Build Pro's or the Supporter Pass's, is
  cancelled at Stripe first, now and without a refund; if Stripe can't be reached (or there's no
  secret key) nothing is deleted. Then, in one batch: the account's leaderboard players (scores,
  times, ghosts, achievements; the challenges' driver counts put right) and feature requests are
  deleted, its purchases kept for the tax record with no account or email on them, and the account
  itself deleted, which cascades to its sessions, username, keys, projects, views, logo, comps and
  Claude's tokens; subscriptions and invoices keep only Stripe's ids and amounts. The page says
  plainly that the World Drive game profile goes too. The editor remembers its open project by the
  account's id, never its email (`src/cloud.js`; one remembered by email before still opens).
- **The owner's numbers** (`worker/drive/build-stats.js`, the **Build** tab of `/admin.html`, or
  `/admin.html#build`): `GET /api/admin/build?days=N` (admins only, as the rest of the admin page).
  The Worker counts Build's own events a day in `stats_daily` under metrics named `build_...`:
  visits by page (`build_visit`: `dashboard`, `editor`, `share`) and UTC hour, the dashboard's
  referring site by host only (`build_ref`, sent once by the page as `?ref=`), sign-ins and accounts
  made on Build, projects created and shared, checkouts started by interval, and 3D map views turned
  away. Never an address, an account or anything else that's someone's. The tab adds what Build's
  tables say of each day: new accounts, 3D map views by plan with an estimate of Google's bill
  (`BUILD_VIEW_COST_USD` each, US$0.006 if unset), MCP calls, logos, and **Build Pro's money from
  its own subscriptions and invoices only**: active, past due, set to end and ended subscriptions,
  MRR (each price brought to a month), new subscriptions, renewals, revenue, refunds and
  chargebacks. It also shows the latest Stripe events. `GET /api/admin/build/customer?q=<email,
  username or id>` looks one account up (plan, comp, this month's views, projects, subscription,
  invoices) for the tab's **Comp** and **Remove comp** buttons. The game's own money tiles leave
  Build Pro's purchases out, and its counts leave out `build_...`. Indexes for these reads are in
  `migrations/0022_build_admin.sql`.
- **Web Analytics:** the dashboard and the editor load Cloudflare's cookieless Web Analytics beacon
  with World Drive's own token, only on worlddrive.app, as the game's page does. The editor's page
  (the twin's `index.html`) has the twin's beacon swapped for it at build time
  (`vite.drive.config.js`'s `withBuildBeacon`). Page views, countries and Core Web Vitals are in
  Cloudflare's dashboard; no cookie banner is needed, as nothing is kept in the browser for it.

## The owner's steps

Build works as soon as it's deployed: you (in `ADMIN_EMAILS`) have everything, and everyone else is
on the free plan, with **Build Pro opens soon** in the upgrade dialog. Nothing is sold until every
step below is done. Do it all in Stripe's **test mode** first (with a staging Worker, or locally),
then again in live mode.

1. **Business details.** *Settings → Business*: your name as a sole proprietor, the PO box as the
   business address, `support@worlddrive.app` as the support email. *Settings → Public details*:
   the Terms URL (`https://worlddrive.app/build/terms/`) and the privacy and refund pages; Checkout
   shows the Terms checkbox only once the Terms URL is set.
2. **Product and prices.** *Product catalogue → Add product*: "World Drive Build Pro", tax code
   *Software as a service (SaaS), business use*, with two **recurring** prices in **USD**: US$5
   **per month** and US$50 **per year**, tax behaviour *exclusive* (tax added on top). Copy both
   price ids (`price_...`). No trial; no quantity (Checkout fixes it at 1).
3. **Stripe Tax.** *Tax → Settings*: turn it on, set the origin address, and add a registration
   wherever you're registered (British Columbia/Canada to start). Checkout collects the buyer's
   address and, for businesses, their tax id.
4. **Restricted key.** *Developers → API keys → Create restricted key*, "World Drive Build":
   **Checkout Sessions: Write**, **Customers: Write**, **Customer portal: Write**,
   **Subscriptions: Write** (to cancel one that's refunded, charged back or left behind by a deleted
   account, and to check for one running before a checkout), **Invoices: Read** (to find a paid
   invoice's payment, which newer API versions leave out of webhooks), everything else None. Copy it (`rk_live_...`).
5. **Customer portal.** *Settings → Billing → Customer portal*: add a configuration for Build Pro
   (or edit the default): customers may **cancel at the end of the billing period** (with reasons),
   **switch plans** between the monthly and yearly prices (with proration), **update payment
   methods**, see **invoice history** and update billing address and tax id; **no quantity
   changes**. Copy its id (`bpc_...`) if it isn't the default.
6. **Emails and retries.** *Settings → Billing → Subscriptions and emails*: Smart Retries on, emails
   for failed payments and expiring cards on, and a subscription that's still unpaid after the
   retries **cancelled**. *Settings → Customer emails*: receipts for successful payments and refunds on.
7. **Webhook.** *Developers → Webhooks*: World Drive's existing endpoint
   (`https://worlddrive.app/api/stripe/webhook`) needs these events added to the ones it has:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`,
   `charge.dispute.created`, `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated`,
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`,
   `invoice.payment_action_required`. Its signing secret stays `STRIPE_WEBHOOK_SECRET`. Any API
   version works: on 2025-03-31.basil and later the Worker asks Stripe for each Build Pro invoice's
   payment (Invoices: Read), and if that fails the event is retried.
8. **Settings** (secrets with `npx wrangler secret put <NAME> -c wrangler.drive.jsonc`, the rest as
   `wrangler.drive.jsonc` vars or in the Worker's dashboard):
   - secret `STRIPE_SECRET_KEY`: the restricted key (a `rk_test_` one sells in test mode, and the
     webhook then takes test-mode events for Build Pro only)
   - `BUILD_PRICE_MONTHLY`, `BUILD_PRICE_ANNUAL`: the two price ids
   - `BUILD_PRICE_LABEL_MONTHLY`, `BUILD_PRICE_LABEL_ANNUAL`: the prices as the page shows them, if
     not `US$5/month` and `US$50/year` (change them with the prices, never one without the other)
   - optional: `BUILD_PORTAL_CONFIG` (the `bpc_...` id), `BUILD_EMAILS` (testers given Pro),
     `BUILD_FREE_MONTHLY`, `BUILD_PRO_MONTHLY`, `BUILD_FREE_DAILY`, `BUILD_LAYOUT_LIMIT`,
     `BUILD_VIEW_COST_USD` (Google's price for a 3D map view, for the admin page's estimate)
   - `BUILD_PAYMENT_LINK` and `BUILD_PRICE` aren't used any more. Leave `BUILD_PAYMENT_LINK_ID` set
     if an old Build Pro Payment Link ever sold anything (its checkouts are still recognised), and
     deactivate that link in Stripe.
9. **Try it.** Buy Build Pro with a real card in live mode, check the account page shows it and the
   portal opens, then refund it in the Dashboard and check Pro ends and the subscription is
   cancelled. Then it's on sale.

**Refunds** follow the policy on `/build/refunds/`: a full refund within 14 days of the first charge
on request; renewals only for billing errors, duplicates or where the law requires. Refund **in
full** in the Dashboard: that ends Pro and cancels the subscription by itself. To refund a
duplicate charge without ending Pro, refund it partially (or comp the account afterwards).
**Google sign-in:** nothing new. Build is on worlddrive.app, which the OAuth client allows.

## Connecting Claude

In Claude: *Settings → Connectors → Add custom connector*, name it "World Drive Build", URL
`https://worlddrive.app/mcp`. Claude opens a worlddrive.app page: sign in with Google and press
**Allow** (a free account is told it needs Build Pro). Then ask it, e.g. "lay out a staging area for
a 3-storey build at 453 W 12th Ave, Vancouver: site office, two 40 ft containers, fencing along the
lane, a gravel pad for trucks", and open the editor link it gives you.
