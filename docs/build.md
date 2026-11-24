# World Drive Build

**worlddrive.app/build/**: the construction mock-up app (this repository's own app) offered to
anyone, on World Drive's site and accounts, with a free plan and a paid one, **Build Pro**. It's a
trial for now: the same app as the Neptune twin, built a second way, kept apart from both the game
and the Neptune twin.

- **`/build/`, the dashboard** (`drive/build/index.html`, `src/build-home/`): *Where's the site?*
  Type an address (World Drive's place search) and pick a result to open the editor there; your
  saved projects, each opening the editor at its site with it loaded; your plan, with the month's
  3D map views as a gauge and Go Build Pro (or Manage your subscription); Google sign-in. It never
  takes a 3D map view (it asks `/build/api/home`). Stripe brings buyers back here
  (`?premium=thanks`), and it waits for Build Pro to show.
- **`/build/app/`, the editor**: the construction app, at `?at=lat,lon&place=Name`, opening
  `?project=<id>` from the dashboard; **Projects** (top) goes back to the dashboard and **Site**
  moves the project.

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

- **Pages:** `npm run build:drive` builds the dashboard into `dist-drive/build/` and the app a
  second time with `--mode worlddrive` (`vite.drive.config.js`'s `buildApp`) into
  `dist-drive/build/app/`, with the library and the walking workers copied in. `src/product.js`
  holds everything that differs in that mode.
- **Server:** World Drive's Worker answers `/build/api/*` and `/build/app/api/*` (each page asks
  beside itself; `worker/drive/build.js`):
  config (plan, views, the Maps key), sign-in with World Drive's accounts, saved projects and share
  links (`build_layouts`, with each project's place), views counted in `build_views`
  (`worker/drive/migrations/0016_build.sql` and `0017_build_places.sql`, applied by the deploy).
- **Payments:** Build Pro is a Stripe purchase like the Supporter Pass, through its own Payment
  Link. The same webhook (`supporter.js`) records it as `pass = 'build'`, which never counts as the
  Supporter Pass (and the pass never counts as Build Pro). Cancelling, a failed card, a refund or a
  chargeback take it away as they do the pass.
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
- **Tests:** `npm run test:build-worker` (the server, under wrangler dev),
  `npm run test:build-ui` (the built page in a browser against the Worker) and
  `npm run test:build-mcp` (connecting as Claude does, every tool, and the result in the editor).

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

## Connecting Claude

In Claude: *Settings → Connectors → Add custom connector*, name it "World Drive Build", URL
`https://worlddrive.app/mcp`. Claude opens a worlddrive.app page: sign in with Google and press
**Allow** (a free account is told it needs Build Pro). Then ask it, e.g. "lay out a staging area for
a 3-storey build at 453 W 12th Ave, Vancouver: site office, two 40 ft containers, fencing along the
lane, a gravel pad for trucks", and open the editor link it gives you.
