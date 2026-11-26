-- The made-by-hand shop's orders (worker/drive/shop.js; docs/world-drive.md, "Shop"): one row a paid
-- Checkout Session, kept by the webhook (supporter.js) and shown on the owner's admin page, where
-- they're marked posted. Applied by the deploy (npm run deploy:drive).
--
-- id: the Checkout Session's id (cs_live_... or cs_test_...). payment_intent: its payment, by which a
-- refund or chargeback finds it. account_id: the buyer's account if they were signed in, else NULL.
-- email: the email Stripe took. ship_name, ship_address: where to post it (the address as JSON:
-- line1, line2, city, state, postal_code, country). items: the lines as JSON, each { id, design,
-- tpu, qty, name, each }. tier: 'small' (a letter or the smallest packet) or 'parcel' (coasters).
-- subtotal, shipping, total: in the currency's smallest unit (cents). status: 'paid' (to make and
-- post), 'shipped', 'refunded' or 'disputed'. shipped_at, tracking: when it was marked posted, and
-- its tracking number ('' for a letter). livemode: 0 for a test-mode order (a staging Worker's).
CREATE TABLE shop_orders (
	id TEXT PRIMARY KEY,
	created_at INTEGER NOT NULL,
	payment_intent TEXT,
	account_id INTEGER,
	email TEXT NOT NULL DEFAULT '',
	ship_name TEXT NOT NULL DEFAULT '',
	ship_address TEXT NOT NULL DEFAULT '{}',
	country TEXT NOT NULL DEFAULT '',
	items TEXT NOT NULL DEFAULT '[]',
	tier TEXT NOT NULL DEFAULT '',
	subtotal INTEGER,
	shipping INTEGER,
	total INTEGER,
	currency TEXT NOT NULL DEFAULT 'cad',
	status TEXT NOT NULL DEFAULT 'paid',
	shipped_at INTEGER,
	tracking TEXT NOT NULL DEFAULT '',
	livemode INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX shop_orders_created ON shop_orders ( created_at );
CREATE INDEX shop_orders_payment ON shop_orders ( payment_intent );
