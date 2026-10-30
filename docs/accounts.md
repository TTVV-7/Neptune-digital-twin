# Accounts: sign in with Google, save layouts, share them by link

When the app runs on its Cloudflare Worker, you can sign in with Google and keep layouts in your
account, so a layout follows you to another computer, and share a read-only link to it. The app
still saves what you place in your browser as before, signed in or not. On a plain static host or
with `npm run dev` on its own there's no Worker, and none of this shows.

The same Worker code also runs on Vercel with a Postgres database: see
[deploy-vercel.md](deploy-vercel.md). Premium equipment bought with Stripe builds on accounts:
see [premium.md](premium.md).

## Using it

- **Sign in:** open the library (**L**). Under Export / Import / Clear there's a **Sign in with
  Google** button. Once you're in, the same spot shows your name, **Layouts** and **Sign out**.
- **Layouts** lists this site's layouts in your account:
  - **Save as new** saves what's placed now under a name. It becomes the *current* layout:
    from then on every change saves to it by itself about two seconds later. The line under your
    name says where changes go and whether they're *Saved*, *Saving...* or *Couldn't save*.
  - **Open** replaces what's placed with that layout (it asks first if what's placed isn't saved
    to your account) and makes it the current one. This is how you pick up a layout on another
    computer.
  - **Rename**, **Delete** (asks first; what's placed stays), **Share link** (copies a link) and
    **Stop sharing** (the link stops working at once).
- **Changed somewhere else:** if the current layout was saved from another computer or tab since
  you opened it, the app doesn't overwrite it. It says so and offers **Open that** (take the other
  version) or **Keep mine** (save yours over it).
- **Shared links** open the layout read-only: a banner says *Viewing "Laydown A", shared by Alice.
  Changes aren't saved.* You can look around and move things, but nothing is saved and your own
  layout in that browser is left alone. **Save a copy** keeps it: signed in, it's saved to your
  account as your current layout; signed out, it becomes your layout in that browser. Either way
  it replaces the layout saved in that browser, so it asks first if that one isn't in your account.
  The person who opens the link sees your first name only, never your email.
- **Google's 3D tiles from your account:** if the Worker has a Maps key (see below), signed-in
  people and people opening a share link get it from the Worker, so the key isn't built into the
  public site. Someone who isn't signed in gets the usual key prompt.

## Setting it up

The app is live at **https://neptune-twin-app.thomas-verigin.workers.dev**, on the
`neptune-twin-app` Worker (it doesn't touch the password-protected `neptune-twin` Worker) with
its own D1 database, `neptune-twin-app`. Workers Builds deploys it from GitHub on every push to
`claude/kind-ride-ovicsk`: `npm run deploy:cloudflare` applies any new database migrations
(`worker/migrations/`), builds the site without a Google key (`vite build --mode cloudflare`) and
runs `wrangler deploy`. Builds and their logs are under the Worker's *Deployments* in the
Cloudflare dashboard.

Its settings are in the dashboard, *Workers & Pages → neptune-twin-app → Settings → Variables
and Secrets*, not in `wrangler.jsonc` (`keep_vars` keeps them across deploys). Each change there
takes effect at once. Until the two below are set, the site works without accounts: it asks each
visitor for a Maps key (kept in their browser) and has no sign-in.

1. **Maps key.** Add a **Secret** named `GOOGLE_MAPS_API_KEY` with the Maps key. Signed-in people
   and share-link viewers then get it from the Worker; it's never in the site's files. In the
   [Google Cloud console](https://console.cloud.google.com/), *APIs & Services → Credentials*, add
   `https://neptune-twin-app.thomas-verigin.workers.dev/*` to the key's website restrictions.
2. **Google sign-in client.** In the Google Cloud console:
   1. *Google Auth Platform → Branding* (the OAuth consent screen): set the app name and support
      email if the project doesn't have them yet. Under *Audience*, choose **Internal** if only people
      in your Google Workspace should sign in, or **External** and press **Publish app**. Sign-in
      only asks for name, email and picture, so publishing needs no review; left in *Testing*,
      only the test users you list can sign in.
   2. *Clients*: use an existing "Web application" client (the Print Yours one is fine) or create
      one. Under **Authorized JavaScript origins** add
      `https://neptune-twin-app.thomas-verigin.workers.dev`, your own domain if you add one,
      `http://localhost` and `http://localhost:5173`. No redirect URIs are needed.
   3. Copy the **Client ID** (`....apps.googleusercontent.com`) into a **Text** variable named
      `GOOGLE_CLIENT_ID`. It isn't a secret.
3. **Who may sign in.** `ALLOWED_EMAILS` is set (as a secret) to the owner's email, so only they
   can sign in. To let others in, change it, comma-separated (`you@gmail.com, pm@firm.ca`), or add
   `ALLOWED_DOMAINS` (`firm.ca`). A domain only lets in Google Workspace accounts of that domain
   (or `gmail.com` addresses): anyone can create a Google account using a company address, so the
   address alone proves nothing. Taking someone off signs them out everywhere on their next request
   and turns off the share links they made. With both empty anyone with a Google account could
   sign in, get the Maps key and use up the database (each account is capped at 25 MB, but
   accounts are free to make), so keep one set.

To set it up again elsewhere (another account or name): `npx wrangler d1 create <name>`, put its
`database_id` in `wrangler.jsonc`, then `npm run deploy:cloudflare`, and the settings above with
`npx wrangler secret put` or the dashboard.

## Trying it on your computer

1. Copy `.dev.vars.example` to `.dev.vars` (git ignores it) and fill in `GOOGLE_CLIENT_ID`, plus a
   Maps key if you like.
2. `npm run dev:api` starts the Worker on http://localhost:8787 with a local database in
   `.wrangler/state` (nothing goes to Cloudflare).
3. In a second terminal, run the app with `/api` sent to it: add `TWIN_API=http://localhost:8787`
   to `.env.local`, or set it in the shell (`TWIN_API=http://localhost:8787 npm run dev`; in
   PowerShell `$env:TWIN_API="http://localhost:8787"; npm run dev`). Open http://localhost:5173,
   the address you added to the client's JavaScript origins (Google's button refuses others).

Without `TWIN_API`, `npm run dev` works exactly as before.

Tests (both run everything on your computer, with test keys standing in for Google's):

- `npm run test:worker`: the API against `wrangler dev` with a throwaway database, and again as the
  Vercel Function on an in-memory Postgres: sign-in and every kind of bad token, allowed accounts,
  layouts, other people's layouts, sharing, CSRF, size limits, premium and the Stripe webhook,
  sign-out. `TEST_WORKER_TARGETS=d1` (or `postgres`) runs one of the two.
- `npm run test:accounts-ui`: the same in a browser (needs `npm i -D playwright` and
  `npx playwright install chromium`): sign in, save, reload, open, autosave, a conflicting save,
  sharing, the read-only view and Save a copy, sign out, the app without the Worker, and that the
  premium items place as usual while premium isn't set up. `TEST_SCREENSHOTS=shots` saves pictures.
- `npm run test:premium-ui`: premium in a browser, with made-up Stripe settings and signed test
  webhooks: locked items and their dialog, the buy link, unlocking, and shared layouts with premium
  items.

## How it works

- `worker/index.js` is a Cloudflare Worker that only runs for `/api/*`
  (`run_worker_first` in `wrangler.jsonc`); everything else is the built site in `dist/`, served by
  Cloudflare directly. Data lives in a D1 (SQLite) database: `worker/migrations/0001_init.sql`.
- `src/cloud.js` asks `GET /api/config` as the page starts (4 s at most). No answer means no
  Worker, and the app carries on as before. `src/cloud-dialog.js` is the Layouts dialog.
- A layout is stored as the same JSON the app saves in the browser and exports
  (`layout.getData()`), so anything a feature saves with the layout (earthworks, laydown areas)
  goes to the account too.

| Request | What it does |
| --- | --- |
| `GET /api/config` | `{ googleClientId, signedIn, user?, mapsKey?, premium }`; `?view=<token>` adds the key for a valid share link |
| `POST /api/session` `{ credential }` | Sign in with a Google ID token; sets the session cookie. Answers `{ user, hasMapsKey, premium }` |
| `DELETE /api/session` | Sign out |
| `GET /api/me` | The signed-in user, and `premium` |
| `GET /api/layouts?site=` | Your layouts: `id, name, updatedAt, shared, shareToken` |
| `POST /api/layouts` `{ site, name, data }` | Save a new one (201) |
| `GET / PUT / DELETE /api/layouts/:id` | Read, change (`name` and/or `data`), delete. `PUT` with `If-Match: "<updatedAt>"` (or `updatedAt` in the body) is refused with 409 and the newer `updatedAt` if someone saved in between |
| `POST / DELETE /api/layouts/:id/share` | Share by link (returns `shareToken`; sharing again keeps the same link) / stop |
| `GET /api/shared/:token` | Anyone with the link: `name, site, data, updatedAt, owner` (first name) |
| `POST /api/stripe/webhook` | Stripe's webhook for premium, checked by its signature ([premium.md](premium.md)) |

`premium` is `{ enabled: false }` until Stripe is set up, then `{ enabled: true, link, price,
unlocked, clientReferenceId? }`.

## Security

- **Sign-in.** The Worker checks Google's ID token itself: RS256 signature by one of Google's
  current keys (fetched from Google and cached as long as Google says, refetched at most once a
  minute for an unknown key id), issuer `accounts.google.com`, audience equal to our client id,
  not expired or issued in the future (60 s of clock slack), and a verified email. Then the
  allow-lists. `GOOGLE_JWKS_URL` replaces Google's key address for tests only and is refused
  unless it points at this machine; never set it on the real site.
- **Sessions.** 32 random bytes in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie named
  `__Host-twin_session` (on `http://localhost` the cookie is `twin_session` without `Secure`, for
  local development). Only the SHA-256 of the token is stored, so a copy of the database can't be
  used to sign in. Sessions last 30 days; signing out deletes it on the server.
- **Cross-site requests.** Everything that changes something must be `application/json` and carry
  an `Origin` equal to the site's own; anything else gets 403 or 415. Other sites can't send JSON
  without a CORS preflight, which the Worker never answers. The one exception is Stripe's webhook,
  which comes from Stripe's servers rather than a page and is checked by its signature instead.
- **Your layouts are yours.** Every query includes the owner, and someone else's layout is
  answered with 404, the same as one that doesn't exist. All SQL uses bound parameters. Request
  bodies are limited to 1 MB, a layout to 1 MB as stored, names to 100 characters, and each
  person to 200 layouts and 25 MB in all.
- **Share links** are 128-bit random tokens, read-only, and only expose the layout, its name and
  your first name. They're stored as they are (not hashed) so you can copy the same link again;
  they only guard layout data that sits in the same database. Stop sharing turns a link off for
  good. A shared layout is someone else's data, so the viewer's browser only loads models from
  this site for it, not from addresses the layout names.
- **The Maps key** goes only to signed-in, allowed users and to people with a valid share link,
  and the deployed site doesn't contain it. It still ends up in those browsers, as any Maps key
  does, so keep it restricted to the site in the Google Cloud console.
- **Logs and errors.** The Worker never logs requests, cookies or tokens, only the type of an
  unexpected error, and answers with short generic messages. API answers are `no-store`.
- Not done: rate limiting (add a Cloudflare rate-limiting rule on `/api/session` if the site is
  public), deleting accounts (delete the user's row in D1; their sessions and layouts go with it).
