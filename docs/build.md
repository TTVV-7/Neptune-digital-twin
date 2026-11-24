# World Drive Build

**worlddrive.app/build/**: the construction mock-up app (this repository's own app) offered to
anyone, on World Drive's site and accounts, with a free plan and a paid one, **Build Pro**. It's a
trial for now: the same app as the Neptune twin, built a second way.

## What people get

| | Free | Build Pro | Owner |
|---|---|---|---|
| Who | anyone signed in with Google | bought through Stripe (`BUILD_PAYMENT_LINK`), or listed in `BUILD_EMAILS` | `ADMIN_EMAILS` (World Drive's owner) |
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

- **Page:** `npm run build:drive` builds the app a second time with `--mode worlddrive`
  (`vite.drive.config.js`'s `buildApp`) into `dist-drive/build/`, with the library and the walking
  workers copied in. `src/product.js` holds everything that differs in that mode.
- **Server:** World Drive's Worker answers the app's `/build/api/*` (`worker/drive/build.js`):
  config (plan, views, the Maps key), sign-in with World Drive's accounts, saved projects and share
  links (`build_layouts`), views counted in `build_views` (`worker/drive/migrations/0016_build.sql`,
  applied by the deploy).
- **Payments:** Build Pro is a Stripe purchase like the Supporter Pass, through its own Payment
  Link. The same webhook (`supporter.js`) records it as `pass = 'build'`, which never counts as the
  Supporter Pass (and the pass never counts as Build Pro). Cancelling, a failed card, a refund or a
  chargeback take it away as they do the pass.
- **Tests:** `npm run test:build-worker` (the server, under wrangler dev) and
  `npm run test:build-ui` (the built page in a browser against the Worker).

## The owner's steps

Build works as soon as it's deployed: you (in `ADMIN_EMAILS`) have everything, and everyone else is
on the free plan, with **Build Pro opens soon** in the upgrade dialog. To sell Build Pro:

1. **Product.** In Stripe (World Drive's account, live mode), *Product catalogue → Add product*:
   "World Drive Build Pro", a **recurring** price of US$5 (or CA$7) **per month**. To sell seats,
   allow the customer to adjust the quantity on the Payment Link (each seat is one subscription
   quantity; for now Pro goes to the account that pays).
2. **Payment Link** with that price. *After payment*: don't show a confirmation page; redirect to
   `https://worlddrive.app/build/?premium=thanks`. Copy its address (`https://buy.stripe.com/...`)
   and its id (`plink_...`).
3. **Settings** (`wrangler.drive.jsonc` vars, or the Worker's dashboard):
   - `BUILD_PAYMENT_LINK`: the link's address
   - `BUILD_PAYMENT_LINK_ID`: its `plink_...` id
   - `BUILD_PRICE`: the price as shown, e.g. `US$5/month`
   - optional: `BUILD_EMAILS` (testers given Pro), `BUILD_FREE_MONTHLY`, `BUILD_PRO_MONTHLY`,
     `BUILD_FREE_DAILY`, `BUILD_LAYOUT_LIMIT`
4. **Webhook:** nothing new. World Drive's existing endpoint already sends checkouts and
   subscription changes; the new link's are told apart by its id.
5. **Google sign-in:** nothing new. Build is on worlddrive.app, which the OAuth client allows.
