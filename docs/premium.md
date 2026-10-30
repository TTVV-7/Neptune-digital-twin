# Premium equipment (work in progress)

A paid **Pro equipment** pack: some library items can only be placed once your account has bought
the pack, through a Stripe Payment Link. It's off until Stripe is set up below; until then every
item is free for everyone and the app shows nothing about it.

The pack is every item marked `"premium": true` in `public/library/library.json`: for now the
*Cranes & lifts* and *Material handling* categories (all-terrain and crawler cranes, boom and
scissor lifts, the forklift, the telehandler and the empty container handler). To change it, add
or remove that line on an item; `npm run add-asset` keeps it when it re-imports a model.

It needs accounts (sign-in and a database), so it works on Vercel ([deploy-vercel.md](deploy-vercel.md))
or on the Cloudflare Worker ([accounts.md](accounts.md)), not on a static host.

## What people see

- In the library (**L**), the pack's items have a small **Pro** badge with a padlock. Picking
  one (click or drag) doesn't place it: a dialog shows what's in the pack with pictures, the
  price, and **Buy with Stripe**. Signed out, it asks you to sign in first (with the Google
  button), so the purchase has an account to go to.
- **Buy with Stripe** opens the Payment Link in a new tab, with `client_reference_id` set to
  your account's id (Stripe hands it back with the payment, so the app knows whose it is) and
  `prefilled_email` set to your email.
- After paying, Stripe sends you to `<site>/?premium=thanks`: the app checks with the server,
  says **Premium unlocked**, and tidies the address. If you go back to the tab with the dialog
  instead, it checks as soon as the window has focus again. **Check again** in the dialog does
  the same by hand.
- Only picking new items is gated. Items already placed, and saved layouts, share links and
  imported layout files that have premium items, open and work for everyone.
- People listed in `PREMIUM_EMAILS` have the pack without paying (you, testers).

## Setting up Stripe

The Stripe account already sells other things, so: do it all in **test mode** first, and nothing
here touches anything else. The webhook ignores every checkout that didn't come through this one
Payment Link, and refunds of anything else.

1. **Test mode.** In the [Stripe Dashboard](https://dashboard.stripe.com), turn on test mode (or
   use a sandbox). Everything below is made again in live mode at the end.
2. **Product.** *Product catalogue → Add product*: "Pro equipment pack", a **one-off** price,
   e.g. CA$19.
3. **Payment Link.** *Payment Links → New*, with that product. Under *After payment*, choose
   **Don't show confirmation page** and redirect customers to `https://<site>/?premium=thanks`
   (your Vercel address, e.g. `https://<project>.vercel.app/?premium=thanks`). Turn off letting
   customers adjust the quantity. Create it, then copy:
   - its address, `https://buy.stripe.com/test_...`: this is `STRIPE_PAYMENT_LINK`;
   - its id, `plink_...` (on the link's page in the Dashboard, and in that page's address): this
     is `STRIPE_PAYMENT_LINK_ID`.
4. **Webhook.** *Developers → Webhooks → Add endpoint* (in Workbench: *Webhooks → Add
   destination*, your account's events, then *Webhook endpoint*):
   - Endpoint URL: `https://<site>/api/stripe/webhook`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded` and
     `charge.refunded`.
   - Any API version: the app only reads fields every version has.

   Create it and reveal its **Signing secret**, `whsec_...`: this is `STRIPE_WEBHOOK_SECRET`.
5. **Settings.**
   - **Vercel:** *Settings → Environment Variables*, then redeploy:

     | Name | Value |
     | --- | --- |
     | `STRIPE_PAYMENT_LINK` | The link's address (public). |
     | `STRIPE_PAYMENT_LINK_ID` | Its `plink_...` id (public). |
     | `STRIPE_WEBHOOK_SECRET` | The signing secret. Mark it **Sensitive**. |
     | `PREMIUM_PRICE` | Optional: the price as the dialog shows it, e.g. `CA$19, one time`. |
     | `PREMIUM_EMAILS` | Optional, comma-separated: who gets the pack without paying. |

     The new table is made by itself on the next request.
   - **Cloudflare:** in the dashboard, *neptune-twin-app → Settings → Variables and Secrets*:
     the first two and the optional ones as **Text**, `STRIPE_WEBHOOK_SECRET` as a **Secret**.
     They take effect at once; the table is already there (the deploy applies the migrations).

   Premium switches on only when the link (an `https://` address), its `plink_` id and a
   `whsec_` secret are all set. Anything else leaves it off, so pasting the account's API key
   (`sk_...`) into the secret by mistake can't turn it on half-working.
6. **Try it.** Open the site, sign in, pick a crane, **Buy with Stripe**, and pay with Stripe's
   test card `4242 4242 4242 4242`, any future expiry date, any CVC and any postal code. Stripe
   brings you back and the app says *Premium unlocked*. Other test cards: `4000 0025 0000 3155`
   asks for 3-D Secure, `4000 0000 0000 0002` is declined. The webhook's page in the Dashboard
   lists each delivery and our answer (200). To test a refund, refund the payment in full from
   *Payments*: the pack locks again the next time the page loads.

   On your computer: `npm run dev:api` with the settings in `.dev.vars`, and the
   [Stripe CLI](https://docs.stripe.com/stripe-cli) forwarding test events:
   `stripe listen --forward-to localhost:8787/api/stripe/webhook` (it prints a `whsec_...` to
   use as `STRIPE_WEBHOOK_SECRET` while it runs).
7. **Going live.** Switch the Dashboard to live mode and make the product, the Payment Link
   (same redirect) and the webhook endpoint again there; test-mode ones don't exist in live mode.
   Replace the three Stripe settings with the live ones and redeploy. Purchases made in test
   mode stay in the database and still count, so clear them first: in Neon's SQL editor (Vercel:
   *Storage → the database → Open in Neon*) run `DELETE FROM purchases;`, or on Cloudflare
   `npx wrangler d1 execute DB --remote --command "DELETE FROM purchases"`.

## How it works

- `worker/premium.js` reads the settings and answers whether premium is on in `/api/config`,
  `/api/me` and the sign-in answer: `premium: { enabled, link, price, unlocked,
  clientReferenceId }` (just `{ enabled: false }` when it's off).
- `POST /api/stripe/webhook` takes no session and is the only route without the cross-site
  check (it comes from Stripe's servers, not a page). It proves itself with the
  `Stripe-Signature` header, checked here with Web Crypto: HMAC-SHA256 of `<t>.<raw body>` with
  the signing secret, compared in constant time with each `v1` signature (any may match, for
  when a secret is being rolled), and refused with 400 if none matches or `t` is more than five
  minutes off. Bodies are capped at 256 kB. Then:
  - `checkout.session.completed` with `payment_status: 'paid'`, or
    `checkout.session.async_payment_succeeded`, whose `payment_link` is
    `STRIPE_PAYMENT_LINK_ID`, records a purchase, once per Checkout Session (the same event again
    changes nothing). It's the account named by `client_reference_id`, else the account with the
    email paid with; if there's none yet, the email is kept and whoever first signs in with that
    Google address has it.
  - `charge.refunded` with `refunded: true` (refunded in full) marks the purchase with that
    `payment_intent` refunded, which takes the pack away. A partial refund keeps it.
  - Anything else properly signed (other events, other products' checkouts) is answered 200 and
    left alone, so Stripe doesn't send it again.
- The table is `purchases` (`worker/migrations/0002_premium.sql`, and version 2 in
  `worker/postgres-schema.js`).
- In the app, `src/premium.js` locks the pack's cards (`sidebar.setGate`) and draws the dialog;
  `src/cloud.js` sets it up only when `/api/config` says premium is on.

## Known gaps

This is a first version.

- **The gate is in the app only.** The pack's models are still public files under
  `/library/`: anyone who knows the address can download one, and a layout file or share link
  with premium items places them for anyone (on purpose: layouts never break). A real lock would
  serve the models through the API to buyers only, from private storage.
- One pack at one price, bought once. No tiers or subscriptions, no page listing your purchases,
  no receipts from the app (Stripe sends its own if receipts are on in its settings).
- Only `paid` counts: a 100% discount code (`no_payment_required`) doesn't unlock the pack.
- Disputes and chargebacks aren't handled; neither is a refund that arrives before its
  purchase (Stripe can deliver out of order when retrying). Fix those by hand in the database,
  e.g. `UPDATE purchases SET refunded_at = 1 WHERE email = '...';`.
- Someone who pays from the bare link with an email that isn't their Google address gets nothing
  until it's linked by hand (`UPDATE purchases SET user_id = <id> WHERE checkout_session = 'cs_...';`).
  Buying from the app's button avoids this: it names the account.
- Signed out, the dialog can only ask you to sign in; the pack unlocks per account, not per
  browser.
