# Hosting on Vercel

The app runs on Vercel the same as on its Cloudflare Worker ([accounts.md](accounts.md)): the
built site, plus the API for "Sign in with Google", layouts in your account, share links, the
Maps key handed to signed-in people, and premium equipment ([premium.md](premium.md)). It's the
same code: `worker/` stays the one implementation, and Vercel runs it as a single Vercel Function
with a Postgres database (Neon) in place of D1.

Until the project has a database and a Google sign-in client, the site works exactly like a
static host: no sign-in button, and the usual prompt for a Maps key.

## Setting it up

You need the Vercel account you already use, the GitHub repository, and the Google Cloud
project with the Maps key (the sign-in client from [accounts.md](accounts.md) can be reused).

1. **Create the project.** In Vercel, *Add New... → Project*, and import the GitHub repository.
   `vercel.json` already sets the framework (Vite), the build command (`npm run build:server`)
   and the output directory (`dist`), so leave those overrides off. Deploy. You get an address
   like `https://<project>.vercel.app`; this is the site's address in the steps below.
2. **Database.** In the project, *Storage → Create Database → Neon* (Serverless Postgres), the
   **Free** plan, in the region the functions run in (Vercel's default is Washington, D.C.,
   `iad1`). Connect it to the project for Production (and Preview, if you use preview
   deployments). This adds `DATABASE_URL` (and `POSTGRES_URL` and others) to the project's
   environment variables. There is nothing to run: the tables are made by themselves on the
   first request that needs them.
3. **Google sign-in client.** In the [Google Cloud console](https://console.cloud.google.com/),
   *Google Auth Platform → Clients*, open the "Web application" client (or create one as in
   [accounts.md](accounts.md), step 1) and add `https://<project>.vercel.app` to **Authorized
   JavaScript origins**, plus your own domain if you add one. Copy its **Client ID**.
4. **Maps key.** In *APIs & Services → Credentials*, open the Maps key and add
   `https://<project>.vercel.app/*` to its **Website restrictions** (HTTP referrers).
5. **Environment variables.** *Settings → Environment Variables*, for Production (and Preview if
   you want sign-in there too; preview addresses must then be in the client's origins as well):

   | Name | Value |
   | --- | --- |
   | `GOOGLE_CLIENT_ID` | The client id from step 3 (`....apps.googleusercontent.com`). Not secret. |
   | `GOOGLE_MAPS_API_KEY` | The Maps key. Mark it **Sensitive**. Only the API hands it out, to signed-in people and share-link viewers; it isn't built into the site. |
   | `ALLOWED_EMAILS` | Recommended. Comma-separated: who may sign in, e.g. `you@gmail.com, pm@firm.ca`. |
   | `ALLOWED_DOMAINS` | Optional. Comma-separated Google Workspace domains whose people may sign in. |

   With both allow-lists empty, anyone with a Google account can sign in and save layouts (see
   [accounts.md](accounts.md), step 3). The Stripe settings for premium are in
   [premium.md](premium.md); leave them out and premium stays off.
6. **Redeploy.** Settings only reach new deployments: *Deployments*, the latest one, *... →
   Redeploy*. Every push to the repository's production branch deploys again by itself.
7. **Check.** `https://<project>.vercel.app/api/config` should say `"googleClientId":"..."`.
   Open the site, press **L**: the library ends with **Sign in with Google**.

## How it works

- **One function for the API.** `api/index.js` is the only file in `api/`, so Vercel makes one
  function of it. `vercel.json` rewrites every `/api/*` request to it as
  `/api?__path=<the rest>`, keeping the other query parameters. `worker/vercel.js` puts the
  address back together on the public host (Vercel's `X-Forwarded-Host` and
  `X-Forwarded-Proto`) and hands the request to the Worker's code, so its routes, the
  cross-site check and the session cookie (`__Host-twin_session`, `Secure`) see exactly what the
  browser asked for. Settings come from the environment variables above; nothing else in the
  environment is passed on.
- **The database.** `worker/postgres.js` gives the Worker the part of D1's API it uses
  (`prepare( sql ).bind( ... ).first() / all() / run()` and `batch()` in one transaction) on
  Neon's HTTP driver (`@neondatabase/serverless`), so the SQL in `worker/*.js` is written once for
  both: `?` placeholders become `$1, $2...`, and Postgres's 64-bit integers (ids, times in
  milliseconds, counts, sums) come back as numbers as D1 gives them. The tables are in
  `worker/postgres-schema.js`, mirroring `worker/migrations/` (times as `BIGINT` milliseconds,
  ids as identity columns). They're applied in a transaction the first time a function instance
  touches a database that doesn't have them yet, and recorded in a `schema_version` table. A
  change to the tables is a new file in `worker/migrations/` (for D1) plus a new entry in
  `postgres-schema.js` with the next version; every statement there must be safe to run twice
  (`IF NOT EXISTS`).
- **Without a database** (no `DATABASE_URL` or `POSTGRES_URL`) **or without
  `GOOGLE_CLIENT_ID`**, `/api/config` answers `{ googleClientId: '', signedIn: false, premium:
  { enabled: false } }`, which makes the app run on its own as on a static host, and every other
  route answers 503.
- **The Maps key stays out of the site.** `npm run build:server` is `vite build --mode server`,
  which, like `--mode cloudflare`, leaves the key out of `dist/`; any build with `VERCEL` set
  (every build on Vercel) does the same, whatever the build command. Building with a made-up key
  in every variable the config reads leaves no trace of it in `dist/`. (The same goes for
  `vercel dev` on your computer, which sets `VERCEL` too.)
- **Neon only.** The adapter uses Neon's HTTP driver, which only talks to Neon. Another Postgres
  host would need another driver in `neonDriver()` in `worker/postgres.js`, with the same
  `query` and `transaction` interface.

## Tests

`npm run test:worker` runs the whole API test suite twice: against `wrangler dev` with D1, and
against the Vercel entry in the same process on PGlite (Postgres compiled to WebAssembly, in
memory) behind the same adapter, with real `Request` objects addressed the way the rewrite
delivers them (so the address rebuilding, the cross-site check and the cookie are covered). It
also checks the site without a database, and premium's settings. `TEST_WORKER_TARGETS=postgres
npm run test:worker` runs just the Vercel side (no wrangler, about ten seconds).

## Notes

- **Cloudflare and Vercel side by side.** They're separate databases; layouts saved on one
  aren't on the other. Nothing here moves data between them.
- **Preview deployments** use the same database as production unless the Neon integration is
  set to make a database branch per preview.
- **Database errors in the logs** say only `DatabaseError` and Postgres's error code (SQLSTATE),
  never the connection string or what was asked: `Database request failed`, with no code, means
  the database couldn't be reached at all, so check that `DATABASE_URL` is a plain
  `postgres://...` address (no quotes around it) and that the Neon database is still connected.
- **Rate limiting** isn't done here. If the site is public, add a Vercel Firewall rate-limit
  rule for `/api/session`.
- **Deleting an account**: in Neon's SQL editor, `DELETE FROM users WHERE email = '...';` takes
  their sessions and layouts with it.
