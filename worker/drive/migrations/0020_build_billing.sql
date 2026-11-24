-- World Drive Build Pro sold through Stripe Checkout Sessions (worker/drive/billing.js) rather than
-- a Payment Link, kept by the webhook (worker/drive/supporter.js), docs/build.md. Applied by the
-- deploy (npm run deploy:drive). Times are milliseconds since 1970.

-- Each subscription as Stripe last told us, not only its status, so the account page can say
-- "Renews on", "Cancels on" or "Payment failed". Filled from customer.subscription.created,
-- .updated and .deleted, under the same rule as status: an event older than event_at changes
-- nothing. account_id and pass come from the metadata our checkout puts on the subscription
-- (pass 'build' for Build Pro; NULL for the Supporter Pass's, which never had any). amount is the
-- price's, in the currency's smallest unit (cents), for one; quantity is always 1 for Build Pro.
-- cancel_at_period_end is 1 when it's set to end (at cancel_at, or else current_period_end).
ALTER TABLE subscriptions ADD COLUMN account_id INTEGER REFERENCES accounts ( id ) ON DELETE SET NULL;
ALTER TABLE subscriptions ADD COLUMN customer TEXT;
ALTER TABLE subscriptions ADD COLUMN pass TEXT;
ALTER TABLE subscriptions ADD COLUMN price_id TEXT;
ALTER TABLE subscriptions ADD COLUMN interval TEXT;
ALTER TABLE subscriptions ADD COLUMN amount INTEGER;
ALTER TABLE subscriptions ADD COLUMN currency TEXT;
ALTER TABLE subscriptions ADD COLUMN quantity INTEGER;
ALTER TABLE subscriptions ADD COLUMN current_period_start INTEGER;
ALTER TABLE subscriptions ADD COLUMN current_period_end INTEGER;
ALTER TABLE subscriptions ADD COLUMN cancel_at_period_end INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN cancel_at INTEGER;
ALTER TABLE subscriptions ADD COLUMN canceled_at INTEGER;
ALTER TABLE subscriptions ADD COLUMN latest_invoice TEXT;

CREATE INDEX subscriptions_by_account ON subscriptions ( account_id );

-- The Stripe customer an account buys Build Pro as (cus_...): made on its first checkout and used
-- again for every later one and for the billing portal, so one person is one customer.
ALTER TABLE accounts ADD COLUMN stripe_customer TEXT;

CREATE INDEX accounts_by_stripe_customer ON accounts ( stripe_customer );

-- Each subscription invoice Stripe told us about (invoice.paid, invoice.payment_failed,
-- invoice.payment_action_required): renewals for the owner's numbers, and the charge and
-- PaymentIntent that a refund or a chargeback names, which is how one finds its subscription (a
-- subscription's checkout has no PaymentIntent of its own). status: 'paid', 'payment_failed' or
-- 'action_required', as the latest event said. billing_reason: Stripe's ('subscription_create',
-- 'subscription_cycle', ...). period_start and period_end: the time it pays for.
CREATE TABLE invoices (
	id TEXT PRIMARY KEY,
	subscription TEXT,
	account_id INTEGER REFERENCES accounts ( id ) ON DELETE SET NULL,
	amount_paid INTEGER,
	currency TEXT,
	status TEXT NOT NULL,
	billing_reason TEXT,
	charge TEXT,
	payment_intent TEXT,
	period_start INTEGER,
	period_end INTEGER,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

CREATE INDEX invoices_by_subscription ON invoices ( subscription, created_at );
CREATE INDEX invoices_by_charge ON invoices ( charge );
CREATE INDEX invoices_by_payment ON invoices ( payment_intent );

-- Every signed event the webhook looked at, by Stripe's event id: one it has already acted on is
-- answered and skipped when Stripe sends it again, and the owner can see what came in and what
-- became of it. result: 'ok', 'ignored' (nothing to do), 'unmatched' (a payment that matched no
-- product, kept for the owner to look at), 'error', or 'processing' while it's being handled.
CREATE TABLE stripe_events (
	id TEXT PRIMARY KEY,
	type TEXT NOT NULL,
	received_at INTEGER NOT NULL,
	result TEXT NOT NULL
);

CREATE INDEX stripe_events_by_time ON stripe_events ( received_at );

-- Build Pro given by the owner from the admin page, without paying: until (ms) it ends, or NULL for
-- good. created_by: the admin who gave it. One an account; giving it again replaces it.
CREATE TABLE build_comps (
	account_id INTEGER PRIMARY KEY REFERENCES accounts ( id ) ON DELETE CASCADE,
	reason TEXT NOT NULL DEFAULT '',
	until INTEGER,
	created_by INTEGER REFERENCES accounts ( id ) ON DELETE SET NULL,
	created_at INTEGER NOT NULL
);
